import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { store } from '../store';
import { logout, setCredentials } from '../store/authSlice';

// Android emulator  → 10.0.2.2 maps to host machine localhost
// iOS simulator     → localhost works directly
// Physical devices  → must use the Mac's LAN IP so the phone can reach the dev server
//
// Using the LAN IP works for ALL cases (emulator + physical device),
// so we keep it simple and always use it in dev mode.
const DEV_MACHINE_IP = '172.20.10.6'; // ← update if your IP changes

const getApiHost = () => {
  if (__DEV__) {
    return `http://${DEV_MACHINE_IP}:3000`;
  }
  // Production URL — configure via environment
  return 'https://api.bahikhata.app';
};

const API_HOST = getApiHost();
const API_BASE = `${API_HOST}/api/v1`;

/**
 * Convert a relative image URL (e.g. /uploads/business/logos/xxx.jpg)
 * to a full URL that can be used in Image components.
 * Returns null/undefined as-is, and already-absolute URLs unchanged.
 */
export const getImageUrl = (relativePath?: string | null): string | null => {
  if (!relativePath) return null;
  // Already an absolute URL
  if (relativePath.startsWith('http://') || relativePath.startsWith('https://')) {
    return relativePath;
  }
  // Prepend API host to relative path
  return `${API_HOST}${relativePath.startsWith('/') ? '' : '/'}${relativePath}`;
};

const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

// ── Silent token refresh state ──────────────────────
let isRefreshing = false;
let failedQueue: {
  resolve: (token: string) => void;
  reject: (err: unknown) => void;
}[] = [];

function processQueue(error: unknown, token: string | null = null) {
  failedQueue.forEach((p) => {
    if (error) {
      p.reject(error);
    } else {
      p.resolve(token!);
    }
  });
  failedQueue = [];
}

// Request interceptor — attach token + business ID
api.interceptors.request.use((config) => {
  const state = store.getState();
  const token = state.auth.token;
  const businessId = state.business.currentBusiness?.id;

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  if (businessId) {
    config.headers['x-business-id'] = businessId;
  }
  return config;
});

// Response interceptor — handle 401 (with silent refresh), 429 retry
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    if (axios.isCancel(error)) {
      return Promise.reject(error);
    }

    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    // ── 429 Too Many Requests: retry with exponential back-off ──
    if (error.response?.status === 429 && originalRequest) {
      const retryCount = (originalRequest as any).__retryCount || 0;
      const MAX_RETRIES = 3;

      if (retryCount < MAX_RETRIES) {
        (originalRequest as any).__retryCount = retryCount + 1;
        const retryAfterHeader = error.response.headers['retry-after'];
        const baseDelay = retryAfterHeader
          ? Number(retryAfterHeader) * 1000
          : Math.min(1000 * 2 ** retryCount, 8000);
        const jitter = Math.random() * 500;
        const delay = baseDelay + jitter;

        await new Promise((resolve) => setTimeout(resolve, delay));
        return api.request(originalRequest);
      }
    }

    // ── 401 Unauthorized: attempt silent token refresh ──
    if (error.response?.status === 401 && originalRequest) {
      if (
        originalRequest._retry ||
        originalRequest.url?.includes('/auth/refresh')
      ) {
        store.dispatch(logout());
        return Promise.reject(error);
      }

      if (isRefreshing) {
        return new Promise<string>((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((newToken) => {
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            return api.request(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const state = store.getState();
      const refreshTokenValue = state.auth.refreshToken;

      if (!refreshTokenValue) {
        isRefreshing = false;
        processQueue(error, null);
        store.dispatch(logout());
        return Promise.reject(error);
      }

      try {
        const refreshRes = await axios.post(`${API_BASE}/auth/refresh`, {
          refreshToken: refreshTokenValue,
        });

        const {
          accessToken: newAccessToken,
          refreshToken: newRefreshToken,
        } = refreshRes.data?.data || {};

        if (newAccessToken && newRefreshToken) {
          store.dispatch(
            setCredentials({
              user: state.auth.user || {
                id: '',
                phone: '',
                is_active: true,
                is_super_admin: false,
              },
              accessToken: newAccessToken,
              refreshToken: newRefreshToken,
            }),
          );

          processQueue(null, newAccessToken);
          originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
          return api.request(originalRequest);
        }

        throw new Error('Invalid refresh response');
      } catch (refreshError) {
        processQueue(refreshError, null);
        store.dispatch(logout());
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  },
);

export default api;

// ─── Auth ────────────────────────────────────────────
export const authApi = {
  sendOtp: (phone: string) => api.post('/auth/send-otp', { phone }),
  verifyOtp: (phone: string, otp: string) =>
    api.post('/auth/verify-otp', { phone, otp }),
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }),
  register: (data: { name: string; email: string; password: string; phone?: string }) =>
    api.post('/auth/register', data),
  refreshToken: (refreshToken: string) =>
    api.post('/auth/refresh', { refreshToken }),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
};

// ─── Business ────────────────────────────────────────
export const businessApi = {
  list: () => api.get('/business'),
  get: (id: string) => api.get(`/business/${id}`),
  create: (data: any) => {
    if (data instanceof FormData) {
      return api.post('/business', data, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    }
    return api.post('/business', data);
  },
  update: (id: string, data: any) => api.patch(`/business/${id}`, data),
  uploadLogo: (id: string, formData: FormData) =>
    api.patch(`/business/${id}/logo`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  removeLogo: (id: string) => api.delete(`/business/${id}/logo`),
  dashboard: (params?: { from?: string; to?: string }) =>
    api.get('/business/dashboard', { params }),
};

// ─── Purchase ────────────────────────────────────────
export const purchaseApi = {
  list: (params?: any) => api.get('/purchases', { params }),
  get: (id: string) => api.get(`/purchases/${id}`),
  create: (data: any) => api.post('/purchases', data),
  update: (id: string, data: any) => api.patch(`/purchases/${id}`, data),
  delete: (id: string) => api.delete(`/purchases/${id}`),
  dashboard: () => api.get('/purchases/dashboard'),
  uploadAttachment: (purchaseId: string, formData: FormData) =>
    api.post(`/purchases/${purchaseId}/attachments`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  deleteAttachment: (purchaseId: string, attachmentId: string) =>
    api.delete(`/purchases/${purchaseId}/attachments/${attachmentId}`),
  uploadPaymentReceipt: (formData: FormData) =>
    api.post('/purchases/payments/receipt-upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  uploadExpenseReceipt: (formData: FormData) =>
    api.post('/purchases/expenses/receipt-upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
};

// ─── Sales ───────────────────────────────────────────
export const salesApi = {
  list: (params?: any) => api.get('/sales', { params }),
  get: (id: string) => api.get(`/sales/${id}`),
  create: (data: any) => api.post('/sales', data),
  update: (id: string, data: any) => api.patch(`/sales/${id}`, data),
  delete: (id: string) => api.delete(`/sales/${id}`),
  lots: (params?: any) => api.get('/sales/lots/all', { params }),
  lotDetail: (id: string) => api.get(`/sales/lots/${id}`),
  uploadAttachment: (saleId: string, formData: FormData) =>
    api.post(`/sales/${saleId}/attachments`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  deleteAttachment: (saleId: string, attachmentId: string) =>
    api.delete(`/sales/${saleId}/attachments/${attachmentId}`),
  uploadPaymentReceipt: (formData: FormData) =>
    api.post('/sales/payments/receipt-upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
};

// ─── Inventory ───────────────────────────────────────
export const inventoryApi = {
  listItems: (params?: any) => api.get('/inventory/items', { params }),
  getItem: (id: string) => api.get(`/inventory/items/${id}`),
  createItem: (data: any) => api.post('/inventory/items', data),
  updateItem: (id: string, data: any) =>
    api.patch(`/inventory/items/${id}`, data),
  deleteItem: (id: string) => api.delete(`/inventory/items/${id}`),
  lowStock: () => api.get('/inventory/items/low-stock'),
  categories: () => api.get('/inventory/categories'),
  createCategory: (data: any) => api.post('/inventory/categories', data),
  adjustStock: (data: any) => api.post('/inventory/adjust', data),
  transactions: (params?: any) =>
    api.get('/inventory/transactions', { params }),
  dashboard: () => api.get('/inventory/dashboard'),
  seedDefaults: () => api.post('/inventory/seed'),
  pruneSeeded: () => api.post('/inventory/prune-seeded'),
};

// ─── Ledger ──────────────────────────────────────────
export const ledgerApi = {
  entries: (params?: any) => api.get('/ledger/entries', { params }),
  partyLedger: (partyId: string, params?: any) =>
    api.get(`/ledger/party/${partyId}`, { params }),
  partyStatement: (partyId: string, params?: any) =>
    api.get(`/ledger/party/${partyId}/statement`, { params }),
  createEntry: (data: any) => api.post('/ledger/entries', data),
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
  uploadReceipt: (paymentId: string, formData: FormData) =>
    api.post(`/billing/payments/${paymentId}/receipt`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  invoices: (params?: any) => api.get('/billing/invoices', { params }),
};

// ─── Profile ─────────────────────────────────────────
export const profileApi = {
  get: () => api.get('/profile/me'),
  update: (data: any) => api.patch('/profile/me', data),
  uploadAvatar: (formData: FormData) =>
    api.post('/profile/me/avatar', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  removeAvatar: () => api.delete('/profile/me/avatar'),
  parties: (params?: any) => api.get('/profile/parties', { params }),
  getParty: (partyId: string) => api.get(`/profile/parties/${partyId}`),
  createParty: (data: any) => api.post('/profile/parties', data),
  updateParty: (id: string, data: any) =>
    api.patch(`/profile/parties/${id}`, data),
  cutters: () => api.get('/profile/cutters'),
  getCutter: (id: string) => api.get(`/profile/cutters/${id}`),
  createCutter: (data: any) => api.post('/profile/cutters', data),
  updateCutter: (id: string, data: any) =>
    api.patch(`/profile/cutters/${id}`, data),
  deleteCutter: (id: string) => api.delete(`/profile/cutters/${id}`),
  expenseTypes: () => api.get('/profile/expense-types'),
  createExpenseType: (data: any) => api.post('/profile/expense-types', data),
};

// ─── Notifications ───────────────────────────────────
export const notificationApi = {
  list: (params?: any) => api.get('/notifications', { params }),
  markRead: (id: string) => api.patch(`/notifications/${id}/read`),
  markAllRead: () => api.patch('/notifications/read-all'),
  sendReminder: (partyId: string) =>
    api.post('/notifications/payment-reminder', { partyId }),
};

// ─── Subscription ────────────────────────────────────
export const subscriptionApi = {
  plans: () => api.get('/subscriptions/plans'),
  current: () => api.get('/subscriptions/current'),
  subscribe: (data: any) => api.post('/subscriptions', data),
  cancel: () => api.post('/subscriptions/cancel'),
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

// ─── Admin (Super Admin only) ────────────────────────
export const adminApi = {
  dashboard: () => api.get('/admin/dashboard'),
  users: (params?: any) => api.get('/admin/users', { params }),
  userDetail: (id: string) => api.get(`/admin/users/${id}`),
  createUser: (data: { phone: string; name: string; email?: string; isSuperAdmin?: boolean }) =>
    api.post('/admin/users', data),
  toggleUser: (id: string, isActive: boolean) =>
    api.patch(`/admin/users/${id}/status`, { isActive }),
  toggleSuperAdmin: (id: string, isSuperAdmin: boolean) =>
    api.patch(`/admin/users/${id}/admin`, { isSuperAdmin }),
  deleteUser: (id: string) => api.delete(`/admin/users/${id}`),
  businesses: (params?: any) => api.get('/admin/businesses', { params }),
  businessDetail: (id: string) => api.get(`/admin/businesses/${id}`),
  createBusiness: (data: any) => api.post('/admin/businesses', data),
  toggleBusiness: (id: string, isActive: boolean) =>
    api.patch(`/admin/businesses/${id}/status`, { isActive }),
  deleteBusiness: (id: string) => api.delete(`/admin/businesses/${id}`),
  plans: () => api.get('/admin/plans'),
  createPlan: (data: any) => api.post('/admin/plans', data),
  updatePlan: (id: string, data: any) => api.patch(`/admin/plans/${id}`, data),
  deletePlan: (id: string) => api.delete(`/admin/plans/${id}`),
  createManualSubscription: (data: any) =>
    api.post('/admin/subscriptions/manual', data),
  invoices: (params?: any) => api.get('/admin/invoices', { params }),
  invoiceDetail: (id: string) => api.get(`/admin/invoices/${id}`),
  auditLogs: (params?: any) => api.get('/admin/audit-logs', { params }),
  subscriptionAnalytics: () => api.get('/admin/analytics/subscriptions'),
  getSettings: () => api.get('/admin/settings'),
  updateSettings: (data: Record<string, any>) => api.put('/admin/settings', data),
};
