import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { store } from '@/store';
import { logout, setCredentials } from '@/store/authSlice';
import { isDevMode } from '@/lib/mock-data';

const API_BASE = import.meta.env.VITE_API_URL || '/api/v1';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

// ── Silent token refresh state ──────────────────────
// When a 401 is received we attempt a silent refresh. While the refresh is
// in-flight every other 401'd request is queued and replayed once the new
// token arrives. This avoids multiple simultaneous refresh calls and
// prevents the user from being kicked out just because the 15-min access
// token expired.
//
// The queue is drained by refreshAccessToken itself, NOT by the interceptor.
// It used to be the other way round, and the two ways a refresh can start had
// drifted apart: the interceptor set `isRefreshing`, while App.tsx's proactive
// 12-minute timer (and its tab-focus handler) called refreshAccessToken()
// directly, which set only `refreshPromise`. A request that 401'd during that
// second kind of refresh saw `isRefreshing || refreshPromise`, pushed its
// promise onto failedQueue — and nothing ever resolved or rejected it, because
// processQueue was only reachable from the branch the interceptor itself owned.
// The awaiting page span on its loading state forever, with no error and no
// retry; only a manual reload recovered. Owning the queue where the refresh
// actually happens means every path drains it exactly once.
let refreshPromise: Promise<string | null> | null = null;
let failedQueue: {
  resolve: (token: string) => void;
  reject: (err: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
}[] = [];

// Backstop: nothing should sit in the queue longer than a refresh can take. If
// a future change ever loses a drain path again, the request fails loudly
// instead of hanging a page indefinitely.
const QUEUE_TIMEOUT_MS = 35_000;

function processQueue(error: unknown, token: string | null = null) {
  const queued = failedQueue;
  failedQueue = [];
  queued.forEach((p) => {
    clearTimeout(p.timer);
    if (error) {
      p.reject(error);
    } else {
      p.resolve(token!);
    }
  });
}

/** Queues a request until the in-flight refresh settles. */
function waitForRefreshedToken(): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      failedQueue = failedQueue.filter((p) => p.timer !== timer);
      reject(new Error('Timed out waiting for token refresh'));
    }, QUEUE_TIMEOUT_MS);
    failedQueue.push({ resolve, reject, timer });
  });
}

/**
 * Shared, mutex-protected access-token refresh.
 * - Reads the latest refresh token from the store on each call (picks up
 *   tokens rotated by another tab via the `storage` event handler).
 * - Returns the new access token, or null if the refresh failed.
 * - Multiple concurrent callers share the same in-flight promise – we never
 *   POST /auth/refresh twice with the same rotated RT.
 */
async function performRefresh(): Promise<string | null> {
  // Always read the freshest RT (it may have been updated by another tab
  // via the cross-tab storage sync below).
  const rt =
    store.getState().auth.refreshToken ||
    (typeof localStorage !== 'undefined' ? localStorage.getItem('bk_refresh_token') : null);
  if (!rt) return null;

  try {
    const res = await axios.post(`${API_BASE}/auth/refresh`, { refreshToken: rt });
    const { accessToken, refreshToken: newRt } = res.data?.data || {};
    if (!accessToken || !newRt) return null;

    const currentUser = store.getState().auth.user || {
      id: '',
      phone: '',
      is_active: true,
      is_super_admin: false,
    };
    store.dispatch(
      setCredentials({ user: currentUser, accessToken, refreshToken: newRt }),
    );
    return accessToken as string;
  } catch {
    return null;
  }
}

export function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  const inflight = performRefresh();
  refreshPromise = inflight;

  // Release the mutex *before* draining, so a request that 401s while the queue
  // is being emptied starts a fresh refresh rather than joining a queue that has
  // already been settled. There is no await between the two statements, so
  // nothing can interleave and observe a null promise with a stale queue.
  const settle = (error: unknown, token: string | null) => {
    refreshPromise = null;
    processQueue(error, token);
  };

  inflight.then(
    (token) => settle(token ? null : new Error('Token refresh failed'), token),
    (err) => settle(err, null),
  );

  return inflight;
}

// Cross-tab token sync: when another tab refreshes the token, mirror it into
// this tab's Redux store so this tab doesn't 401 + try to refresh with a
// now-invalidated refresh token.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== 'bk_token' && e.key !== 'bk_refresh_token') return;
    const accessToken = localStorage.getItem('bk_token');
    const refreshToken = localStorage.getItem('bk_refresh_token');
    if (!accessToken || !refreshToken) {
      // Another tab logged out
      const s = store.getState().auth;
      if (s.isAuthenticated) store.dispatch(logout());
      return;
    }
    const s = store.getState().auth;
    if (s.token !== accessToken || s.refreshToken !== refreshToken) {
      store.dispatch(
        setCredentials({
          user: s.user || { id: '', phone: '', is_active: true, is_super_admin: false },
          accessToken,
          refreshToken,
        }),
      );
    }
  });
}

// Request interceptor - attach token + business ID
api.interceptors.request.use((config) => {
  const state = store.getState();
  const token = state.auth.token;
  const businessId = state.business.currentBusiness?.id;

  // In dev skip-login mode, skip real API calls by aborting requests
  // (pages fall back to mock data in their catch blocks)
  if (token?.startsWith('dev-mock-')) {
    // Must match App.tsx's mock branch (isDevMode = DEV && VITE_DEV_SKIP_LOGIN),
    // not just DEV: a stale dev token persisted while the flag is off would
    // otherwise abort every request and wedge every page.
    if (isDevMode()) {
      const controller = new AbortController();
      config.signal = controller.signal;
      controller.abort('Dev mode: skipping real API call');
      return config;
    }
    // Stale dev-mock token with skip-login disabled: clear the auth so the
    // app returns to /login instead of sending an unusable token.
    store.dispatch(logout());
    return config;
  }

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  if (businessId) {
    config.headers['x-business-id'] = businessId;
  }
  return config;
});

// Response interceptor — handle 401 (with silent refresh), 429 retry, 402
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    // Don't log out on cancelled requests (dev mode) or network errors
    if (axios.isCancel(error)) {
      return Promise.reject(error);
    }

    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // ── 429 Too Many Requests: retry with exponential back-off ──
    if (error.response?.status === 429 && originalRequest) {
      const retryCount = (originalRequest as any).__retryCount || 0;
      const MAX_RETRIES = 3;

      if (retryCount < MAX_RETRIES) {
        (originalRequest as any).__retryCount = retryCount + 1;

        // Respect Retry-After header if present, else use exponential backoff
        const retryAfterHeader = error.response.headers['retry-after'];
        const baseDelay = retryAfterHeader
          ? Number(retryAfterHeader) * 1000
          : Math.min(1000 * 2 ** retryCount, 8000); // 1s, 2s, 4s (max 8s)

        // Add jitter to prevent thundering herd
        const jitter = Math.random() * 500;
        const delay = baseDelay + jitter;

        console.warn(
          `[api] 429 received – retry ${retryCount + 1}/${MAX_RETRIES} in ${Math.round(delay)}ms`,
        );

        await new Promise((resolve) => setTimeout(resolve, delay));
        return api.request(originalRequest);
      }
      // Exhausted retries — fall through to normal rejection
    }

    // ── 401 Unauthorized: attempt silent token refresh before logging out ──
    if (error.response?.status === 401 && originalRequest) {
      const state = store.getState();

      // Don't force logout for dev mode tokens
      if (state.auth.token?.startsWith('dev-mock-') && isDevMode()) {
        return Promise.reject(error);
      }

      // If this request was itself the refresh call, or we already retried, bail out
      if (originalRequest._retry || originalRequest.url?.includes('/auth/refresh')) {
        store.dispatch(logout());
        if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
        return Promise.reject(error);
      }

      // If a refresh is already in-flight — whether this interceptor started it
      // or App.tsx's proactive timer did — wait for it and replay. Both cases
      // now drain through refreshAccessToken.
      if (refreshPromise) {
        return waitForRefreshedToken()
          .then((newToken) => {
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            return api.request(originalRequest);
          })
          .catch(() => {
            // The refresh failed or timed out. Reject with the original 401 so
            // callers see the real error rather than the queue's bookkeeping.
            return Promise.reject(error);
          });
      }

      originalRequest._retry = true;

      try {
        const newAccessToken = await refreshAccessToken();
        if (!newAccessToken) {
          // refreshAccessToken has already rejected everything queued behind it.
          store.dispatch(logout());
          if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
            window.location.href = '/login';
          }
          return Promise.reject(error);
        }

        // Retry the original request
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return api.request(originalRequest);
      } catch (refreshError) {
        store.dispatch(logout());
        if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
        return Promise.reject(refreshError);
      }
    }

    // ── 402 Payment Required: trial expired / no active subscription ──
    if (error.response?.status === 402) {
      // Redirect to subscription page so user can upgrade
      if (window.location.pathname !== '/subscription') {
        window.location.href = '/subscription';
      }
    }

    return Promise.reject(error);
  },
);

export default api;

// ─── Auth ────────────────────────────────────────────
export const authApi = {
  sendOtp: (phone: string) => api.post('/auth/send-otp', { phone }),
  verifyOtp: (phone: string, otp: string) => api.post('/auth/verify-otp', { phone, otp }),
  login: (email: string, password: string) => api.post('/auth/login', { email, password }),
  register: (data: { name: string; email: string; password: string; phone?: string }) => api.post('/auth/register', data),
  refreshToken: (refreshToken: string) => api.post('/auth/refresh', { refreshToken }),
  // Send the refresh token so the server revokes *this* session. Without a body
  // the service falls back to deleting every refresh token for the user, which
  // signs them out of all their other devices too.
  logout: (refreshToken?: string) =>
    api.post('/auth/logout', refreshToken ? { refreshToken } : {}),
  me: () => api.get('/auth/me'),
};

// ─── Business ────────────────────────────────────────
export const businessApi = {
  list: () => api.get('/business'),
  get: (id: string) => api.get(`/business/${id}`),
  create: (data: any) => {
    // When data is FormData (logo upload), let the browser set the
    // multipart/form-data Content-Type with the correct boundary.
    // The instance default 'application/json' must be removed.
    if (data instanceof FormData) {
      return api.post('/business', data, {
        headers: { 'Content-Type': undefined },
      });
    }
    return api.post('/business', data);
  },
  update: (id: string, data: any) => api.patch(`/business/${id}`, data),
  uploadLogo: (id: string, file: File) => {
    const fd = new FormData();
    fd.append('logo', file);
    // Pass Content-Type: undefined so axios/browser sets multipart with the correct boundary
    return api.patch(`/business/${id}/logo`, fd, {
      headers: { 'Content-Type': undefined },
    });
  },
  removeLogo: (id: string) => api.delete(`/business/${id}/logo`),
  dashboard: (params?: { from?: string; to?: string }) => api.get('/business/dashboard', { params }),

  // Bank Accounts
  listBankAccounts: (bizId: string) => api.get(`/business/${bizId}/bank-accounts`),
  createBankAccount: (bizId: string, data: any) => api.post(`/business/${bizId}/bank-accounts`, data),
  updateBankAccount: (bizId: string, accountId: string, data: any) => api.patch(`/business/${bizId}/bank-accounts/${accountId}`, data),
  deleteBankAccount: (bizId: string, accountId: string) => api.delete(`/business/${bizId}/bank-accounts/${accountId}`),

  // Bank Statement
  parseStatement: (bizId: string, rows: any[]) => api.post(`/business/${bizId}/bank-statements/parse`, { rows }),
  findMatches: (bizId: string, entry: any) => api.post(`/business/${bizId}/bank-statements/match`, entry),
  reconcileEntry: (bizId: string, data: any) => api.post(`/business/${bizId}/bank-statements/reconcile`, data),

  // Credit Cards
  listCreditCards: (bizId: string) => api.get(`/business/${bizId}/credit-cards`),
  getCreditCard: (bizId: string, cardId: string) => api.get(`/business/${bizId}/credit-cards/${cardId}`),
  createCreditCard: (bizId: string, data: any) => api.post(`/business/${bizId}/credit-cards`, data),
  updateCreditCard: (bizId: string, cardId: string, data: any) => api.patch(`/business/${bizId}/credit-cards/${cardId}`, data),
  deleteCreditCard: (bizId: string, cardId: string) => api.delete(`/business/${bizId}/credit-cards/${cardId}`),

  // Credit Card Statement
  parseCreditCardStatement: (bizId: string, rows: any[]) => api.post(`/business/${bizId}/credit-card-statements/parse`, { rows }),
  findCreditCardMatches: (bizId: string, entry: any) => api.post(`/business/${bizId}/credit-card-statements/match`, entry),
  reconcileCreditCardEntry: (bizId: string, cardId: string, data: any) => api.post(`/business/${bizId}/credit-cards/${cardId}/reconcile`, data),
};

// ─── Purchase ────────────────────────────────────────
export const purchaseApi = {
  list: (params?: any) => api.get('/purchases', { params }),
  get: (id: string) => api.get(`/purchases/${id}`),
  create: (data: any) => api.post('/purchases', data),
  update: (id: string, data: any) => api.patch(`/purchases/${id}`, data),
  delete: (id: string) => api.delete(`/purchases/${id}`),
  dashboard: () => api.get('/purchases/dashboard'),
  uploadAttachment: (purchaseId: string, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post(`/purchases/${purchaseId}/attachments`, fd, {
      headers: { 'Content-Type': undefined },
    });
  },
  deleteAttachment: (purchaseId: string, attachmentId: string) =>
    api.delete(`/purchases/${purchaseId}/attachments/${attachmentId}`),
  uploadPaymentReceipt: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post('/purchases/payments/receipt-upload', fd, {
      headers: { 'Content-Type': undefined },
    });
  },
  uploadExpenseReceipt: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post('/purchases/expenses/receipt-upload', fd, {
      headers: { 'Content-Type': undefined },
    });
  },
};

// ─── Sales ───────────────────────────────────────────
export const salesApi = {
  list: (params?: any) => api.get('/sales', { params }),
  get: (id: string) => api.get(`/sales/${id}`),
  create: (data: any) => api.post('/sales', data),
  update: (id: string, data: any) => api.patch(`/sales/${id}`, data),
  delete: (id: string) => api.delete(`/sales/${id}`),
  dashboard: () => api.get('/sales/dashboard'),
  lots: (params?: any) => api.get('/sales/lots/all', { params }),
  lotDetail: (id: string) => api.get(`/sales/lots/${id}`),
  uploadAttachment: (saleId: string, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post(`/sales/${saleId}/attachments`, fd, {
      headers: { 'Content-Type': undefined },
    });
  },
  deleteAttachment: (saleId: string, attachmentId: string) =>
    api.delete(`/sales/${saleId}/attachments/${attachmentId}`),
  uploadPaymentReceipt: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post('/sales/payments/receipt-upload', fd, {
      headers: { 'Content-Type': undefined },
    });
  },
};

// ─── Inventory ───────────────────────────────────────
export const inventoryApi = {
  listItems: (params?: any) => api.get('/inventory/items', { params }),
  getItem: (id: string) => api.get(`/inventory/items/${id}`),
  createItem: (data: any) => api.post('/inventory/items', data),
  updateItem: (id: string, data: any) => api.patch(`/inventory/items/${id}`, data),
  lowStock: () => api.get('/inventory/items/low-stock'),
  categories: () => api.get('/inventory/categories'),
  createCategory: (data: any) => api.post('/inventory/categories', data),
  updateCategory: (id: string, data: any) => api.patch(`/inventory/categories/${id}`, data),
  adjustStock: (data: any) => api.post('/inventory/adjust', data),
  transactions: (params?: any) => api.get('/inventory/transactions', { params }),
  dashboard: () => api.get('/inventory/dashboard'),
  seedDefaults: () => api.post('/inventory/seed'),
  pruneSeeded: () => api.post('/inventory/prune-seeded'),
};

// ─── Ledger ──────────────────────────────────────────
export const ledgerApi = {
  entries: (params?: any) => api.get('/ledger/entries', { params }),
  partyLedger: (partyId: string, params?: any) => api.get(`/ledger/party/${partyId}`, { params }),
  partyStatement: (partyId: string, params?: any) => api.get(`/ledger/party/${partyId}/statement`, { params }),
  createEntry: (data: any) => api.post('/ledger/entries', data),
  deleteEntries: (ids: string[]) => api.delete('/ledger/entries', { data: { ids } }),
  trialBalance: (params?: any) => api.get('/ledger/trial-balance', { params }),
  profitLoss: (params?: any) => api.get('/ledger/profit-loss', { params }),
  balanceSheet: (params?: any) => api.get('/ledger/balance-sheet', { params }),
  outstanding: (params?: any) => api.get('/ledger/outstanding', { params }),
  dayBook: (params?: any) => api.get('/ledger/day-book', { params }),
};

// ─── Billing ─────────────────────────────────────────
export const billingApi = {
  payments: (params?: any) => api.get('/billing/payments', { params }),
  createPayment: (data: any) => api.post('/billing/payments', data),
  createBulkPayment: (data: any) => api.post('/billing/payments/bulk', data),
  partyOutstandingBills: (partyId: string, type: 'IN' | 'OUT') =>
    api.get(`/billing/outstanding/${partyId}`, { params: { type } }),
  uploadReceipt: (paymentId: string, file: File) => {
    const fd = new FormData();
    fd.append('receipt', file);
    return api.post(`/billing/payments/${paymentId}/receipt`, fd, {
      headers: { 'Content-Type': undefined },
    });
  },
  invoices: (params?: any) => api.get('/billing/invoices', { params }),
};

// ─── Profile ─────────────────────────────────────────
export const profileApi = {
  get: () => api.get('/profile/me'),
  update: (data: any) => api.patch('/profile/me', data),
  uploadAvatar: (file: File) => {
    const form = new FormData();
    form.append('avatar', file);
    return api.post('/profile/me/avatar', form, {
      headers: { 'Content-Type': undefined },
    });
  },
  removeAvatar: () => api.delete('/profile/me/avatar'),
  parties: (params?: any) => api.get('/profile/parties', { params }),
  getParty: (partyId: string) => api.get(`/profile/parties/${partyId}`),
  createParty: (data: any) => api.post('/profile/parties', data),
  updateParty: (id: string, data: any) => api.patch(`/profile/parties/${id}`, data),
  cutters: () => api.get('/profile/cutters'),
  getCutter: (id: string) => api.get(`/profile/cutters/${id}`),
  createCutter: (data: any) => api.post('/profile/cutters', data),
  updateCutter: (id: string, data: any) => api.patch(`/profile/cutters/${id}`, data),
  deleteCutter: (id: string) => api.delete(`/profile/cutters/${id}`),
  updateCutterTransaction: (cutterId: string, transactionId: string, data: any) =>
    api.patch(`/profile/cutters/${cutterId}/transactions/${transactionId}`, data),
  createCutterTransaction: (cutterId: string, data: any) =>
    api.post(`/profile/cutters/${cutterId}/transactions`, data),
  markAllCutterTransactionsPaid: (cutterId: string) =>
    api.post(`/profile/cutters/${cutterId}/transactions/mark-all-paid`),
  expenseTypes: () => api.get('/profile/expense-types'),
  createExpenseType: (data: any) => api.post('/profile/expense-types', data),

  // USER-level bank accounts (profile-service /profile/bank-accounts).
  // NOT the same as businessApi.listBankAccounts/createBankAccount above,
  // which manage BUSINESS-level accounts under /business/:id/bank-accounts.
  // Field names must be camelCase exactly as profile.service.ts expects:
  // accountName, accountNumber, ifscCode, bankName, upiId?, isDefault?
  // (the service silently has no zod layer here — wrong-cased keys 400).
  listBankAccounts: () => api.get('/profile/bank-accounts'),
  addBankAccount: (data: {
    accountName: string;
    accountNumber: string;
    ifscCode: string;
    bankName: string;
    upiId?: string;
    isDefault?: boolean;
  }) => api.post('/profile/bank-accounts', data),
  deleteBankAccount: (accountId: string) => api.delete(`/profile/bank-accounts/${accountId}`),
};

// ─── Notifications ───────────────────────────────────
export const notificationApi = {
  list: (params?: any) => api.get('/notifications', { params }),
  markRead: (id: string) => api.patch(`/notifications/${id}/read`),
  markAllRead: () => api.patch('/notifications/read-all'),
  delete: (id: string) => api.delete(`/notifications/${id}`),
  sendReminder: (partyId: string) => api.post('/notifications/payment-reminder', { partyId }),
};

// ─── Subscription ────────────────────────────────────
export const subscriptionApi = {
  plans: () => api.get('/subscriptions/plans'),
  current: () => api.get('/subscriptions/current'),
  subscribe: (data: any) => api.post('/subscriptions', data),
  cancel: () => api.post('/subscriptions/cancel'),
  invoices: () => api.get('/subscriptions/invoices'),
};

// ─── Referral ────────────────────────────────────────
export const referralApi = {
  myReferrals: () => api.get('/referrals/my-referrals'),
  eligibility: () => api.get('/referrals/eligibility'),
  createCode: () => api.post('/referrals/code'),
  apply: (code: string) => api.post('/referrals/apply', { code }),
  redeemRewards: () => api.post('/referrals/redeem'),
  leaderboard: () => api.get('/referrals/leaderboard'),
};

// ─── Admin ───────────────────────────────────────────
export const adminApi = {
  dashboard: () => api.get('/admin/dashboard'),
  users: (params?: any) => api.get('/admin/users', { params }),
  userDetail: (id: string) => api.get(`/admin/users/${id}`),
  createUser: (data: { phone: string; name: string; email?: string; isSuperAdmin?: boolean }) =>
    api.post('/admin/users', data),
  toggleUser: (id: string, isActive: boolean) => api.patch(`/admin/users/${id}/status`, { isActive }),
  toggleSuperAdmin: (id: string, isSuperAdmin: boolean) => api.patch(`/admin/users/${id}/admin`, { isSuperAdmin }),
  deleteUser: (id: string) => api.delete(`/admin/users/${id}`),
  businesses: (params?: any) => api.get('/admin/businesses', { params }),
  businessDetail: (id: string) => api.get(`/admin/businesses/${id}`),
  createBusiness: (data: {
    name: string; type?: string; ownerId: string;
    phone?: string; email?: string; gstNumber?: string; panNumber?: string;
    address?: string; city?: string; state?: string; pincode?: string;
  }) => api.post('/admin/businesses', data),
  toggleBusiness: (id: string, isActive: boolean) => api.patch(`/admin/businesses/${id}/status`, { isActive }),
  deleteBusiness: (id: string) => api.delete(`/admin/businesses/${id}`),
  plans: () => api.get('/admin/plans'),
  createPlan: (data: any) => api.post('/admin/plans', data),
  updatePlan: (id: string, data: any) => api.patch(`/admin/plans/${id}`, data),
  deletePlan: (id: string) => api.delete(`/admin/plans/${id}`),
  createManualSubscription: (data: {
    businessId: string; planId: string;
    billingCycle: 'MONTHLY' | 'QUARTERLY' | 'HALF_YEARLY' | 'YEARLY';
    paymentMode: string; paymentRef?: string; amount: number; notes?: string;
  }) => api.post('/admin/subscriptions/manual', data),
  invoices: (params?: any) => api.get('/admin/invoices', { params }),
  invoiceDetail: (id: string) => api.get(`/admin/invoices/${id}`),
  auditLogs: (params?: any) => api.get('/admin/audit-logs', { params }),
  subscriptionAnalytics: () => api.get('/admin/analytics/subscriptions'),
  subscriptions: (params?: any) => api.get('/admin/subscriptions', { params }),
  getSettings: () => api.get('/admin/settings'),
  updateSettings: (data: Record<string, any>) => api.put('/admin/settings', data),
};

// ─── Expenses ────────────────────────────────────────
export const expenseApi = {
  create: (data: any) => api.post('/expenses', data),
  listAll: (params?: Record<string, any>) => api.get('/expenses', { params }),
  getStats: () => api.get('/expenses/stats'),
  get: (id: string) => api.get(`/expenses/${id}`),
  update: (id: string, data: any) => api.put(`/expenses/${id}`, data),
  delete: (id: string) => api.delete(`/expenses/${id}`),
  // expense-service has no upload route, so this used to 404 and every expense
  // created with a receipt attached failed. Reuse purchase-service's existing
  // receipt pipeline — same multer field name ('file') and the same
  // { data: { url } } response shape CreateExpenseDialog reads.
  uploadReceipt: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/purchases/expenses/receipt-upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};
