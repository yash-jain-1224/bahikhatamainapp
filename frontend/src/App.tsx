import React, { useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState } from '@/store';
import { store } from '@/store';
import { setUser, setLoading, setTrialInfo, logout } from '@/store/authSlice';
import { setBusinesses } from '@/store/businessSlice';
import { authApi, businessApi, refreshAccessToken } from '@/lib/api';
import { isDevMode, DEV_USER, DEV_BUSINESSES } from '@/lib/mock-data';
import { PageLoader } from '@/components/shared/loading';
import { AppLayout } from '@/components/layout/AppLayout';
import { AdminLayout } from '@/components/layout/AdminLayout';

// Lazy load pages
const LoginPage = lazy(() => import('@/components/auth/LoginPage'));
const DashboardPage = lazy(() => import('@/components/dashboard/DashboardPage'));
const PurchasesPage = lazy(() => import('@/components/purchase/PurchasesPage'));
const PurchaseCreatePage = lazy(() => import('@/components/purchase/PurchaseCreatePage'));
const PurchaseDetailPage = lazy(() => import('@/components/purchase/PurchaseDetailPage'));
const PurchaseEditPage = lazy(() => import('@/components/purchase/PurchaseEditPage'));
const SalesPage = lazy(() => import('@/components/sales/SalesPage'));
const SaleCreatePage = lazy(() => import('@/components/sales/SaleCreatePage'));
const SaleDetailPage = lazy(() => import('@/components/sales/SaleDetailPage'));
const InventoryPage = lazy(() => import('@/components/inventory/InventoryPage'));
const InventoryCreatePage = lazy(() => import('@/components/inventory/InventoryCreatePage'));
const StockAdjustPage = lazy(() => import('@/components/inventory/StockAdjustPage'));
const ExpensesPage = lazy(() => import('@/components/expenses/ExpensesPage'));
const LedgerPage = lazy(() => import('@/components/ledger/LedgerPage'));
const PartyLedgerPage = lazy(() => import('@/components/ledger/PartyLedgerPage'));
const PaymentsPage = lazy(() => import('@/components/payments/PaymentsPage'));
const PartiesPage = lazy(() => import('@/components/shared/PartiesPage'));
const SubscriptionPage = lazy(() => import('@/components/subscription/SubscriptionPage'));
const ProfilePage = lazy(() => import('@/components/profile/ProfilePage'));
const NotificationsPage = lazy(() => import('@/components/notifications/NotificationsPage'));
const ReferralsPage = lazy(() => import('@/components/referrals/ReferralsPage'));
const BusinessCreatePage = lazy(() => import('@/components/business/BusinessCreatePage'));
const BusinessListPage = lazy(() => import('@/components/business/BusinessListPage'));
const BusinessSettingsPage = lazy(() => import('@/components/business/BusinessSettingsPage'));
const InventoryDetailPage = lazy(() => import('@/components/inventory/InventoryDetailPage'));
const ReportsPage = lazy(() => import('@/components/reports/ReportsPage'));
const PartyDetailPage = lazy(() => import('@/components/parties/PartyDetailPage'));
const CutterDetailPage = lazy(() => import('@/components/parties/CutterDetailPage'));
const HelpSupportPage = lazy(() => import('@/components/help/HelpSupportPage'));
const BillsPage = lazy(() => import('@/components/bills/BillsPage'));
const WhatsAppAIDashboard = lazy(() => import('@/components/whatsapp-ai/WhatsAppAIDashboard'));
const NotFoundPage = lazy(() => import('@/components/shared/NotFoundPage'));
const AccessDeniedPage = lazy(() => import('@/components/shared/AccessDeniedPage'));

// Admin sub-pages
const AdminDashboardPage = lazy(() => import('@/components/admin/AdminDashboardPage'));
const AdminUsersPage = lazy(() => import('@/components/admin/AdminUsersPage'));
const AdminAuditPage = lazy(() => import('@/components/admin/AdminAuditPage'));
const AdminSettingsPage = lazy(() => import('@/components/admin/AdminSettingsPage'));
const AdminBusinessesPage = lazy(() => import('@/components/admin/AdminBusinessesPage'));
const AdminPlansPage = lazy(() => import('@/components/admin/AdminPlansPage'));
const AdminSubscriptionsPage = lazy(() => import('@/components/admin/AdminSubscriptionsPage'));
const AdminInvoicesPage = lazy(() => import('@/components/admin/AdminInvoicesPage'));

// Protected route wrapper — requires authentication, wraps with AppLayout
// If the trial is expired, redirect to /subscription so the user can upgrade
// If the user has no business yet, redirect to /business/new
function ProtectedRoute({ children, allowWhenExpired, allowNoBusiness }: { children: React.ReactNode; allowWhenExpired?: boolean; allowNoBusiness?: boolean }) {
  const { isAuthenticated, user, trialInfo, loading: authLoading } = useSelector((s: RootState) => s.auth);
  const { businesses, loaded: businessesLoaded } = useSelector((s: RootState) => s.business);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  // Wait for initial data fetch to complete before making redirect decisions
  if (authLoading) return <PageLoader />;
  // Super admins always pass
  if (user?.is_super_admin) return <AppLayout>{children}</AppLayout>;
  // If user has no businesses yet, send to business creation (unless this
  // route allows it). Only when the list was actually FETCHED — a transient
  // /business failure on startup used to bounce existing users into the
  // "create your business" wizard as if their data had been deleted.
  if (!allowNoBusiness && businessesLoaded && businesses.length === 0) return <Navigate to="/business/new" replace />;
  // If user has business but no subscription at all (hasn't picked a plan
  // yet), redirect to plan selection. Keyed on the explicit hasSubscription
  // flag — the old `trialInfo === null` check never fired because every auth
  // response returns a non-null trial object.
  if (!allowWhenExpired && businesses.length > 0 && trialInfo?.hasSubscription === false) return <Navigate to="/subscription?setup=true" replace />;
  // If trial/subscription expired and this route isn't exempt, redirect to /subscription
  if (!allowWhenExpired && trialInfo?.expired) return <Navigate to="/subscription" replace />;
  return <AppLayout>{children}</AppLayout>;
}

// Admin route wrapper — requires authentication + is_super_admin, wraps with AdminLayout
function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user, loading } = useSelector((s: RootState) => s.auth);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  // Wait for user data to load before checking admin status
  if (!user && loading) return <PageLoader />;
  if (!user?.is_super_admin) return <AccessDeniedPage />;
  return <AdminLayout>{children}</AdminLayout>;
}

// Guest route wrapper (redirect to dashboard if already logged in)
function GuestRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useSelector((s: RootState) => s.auth);
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

export default function App() {
  const dispatch = useDispatch();
  const { isAuthenticated, token } = useSelector((s: RootState) => s.auth);

  // Fetch user & businesses on mount if authenticated
  useEffect(() => {
    if (isAuthenticated && token) {
      // In dev skip-login mode, use mock data instead of calling the real API
      if (isDevMode() && token.startsWith('dev-mock-')) {
        dispatch(setUser(DEV_USER));
        dispatch(setBusinesses(DEV_BUSINESSES));
        return;
      }

      const fetchInitialData = async () => {
        dispatch(setLoading(true));
        try {
          // NOTE: Don't pre-emptively refresh on mount. The access token is
          // valid for 15 min and the API interceptor will refresh on the
          // first 401. Refreshing here would race with the focus-handler
          // refresh and the api interceptor refresh, all using the same
          // single-use refresh token => rotation collisions => spurious
          // logouts when the user reloads the page or switches tabs quickly.
          const [userRes, bizRes] = await Promise.all([
            authApi.me(),
            businessApi.list(),
          ]);
          if (userRes.data?.data) {
            dispatch(setUser(userRes.data.data));
            // Dispatch even when absent so a stale cached trial can't stand in
            // for the server's answer.
            dispatch(setTrialInfo(userRes.data.data.trial ?? null));
          }
          if (bizRes.data?.data) dispatch(setBusinesses(bizRes.data.data));
        } catch {
          // Only log out if the interceptor already cleared the token (true
          // unauth). Otherwise keep the session and let the user retry —
          // a transient network error shouldn't kick them to /login.
          if (!store.getState().auth.isAuthenticated) {
            dispatch(logout());
          }
        } finally {
          dispatch(setLoading(false));
        }
      };
      fetchInitialData();
    }
  }, [isAuthenticated]);

  // ── Proactive token refresh ────────────────────────────────────────────
  // Refresh the access token every 12 minutes (token expires in 15min) to
  // prevent 401s while the user is actively working. Also refresh when the
  // user switches back to this tab after being away – but throttled so we
  // never collide with the interceptor refresh or another tab's refresh.
  const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastRefreshAtRef = useRef<number>(Date.now());
  // Minimum gap between two proactive refreshes (the access token is good
  // for 15 min, so refreshing more often than every ~5 min is wasteful and
  // increases the chance of rotation collisions across tabs).
  const REFRESH_THROTTLE_MS = 5 * 60 * 1000;

  const silentRefresh = useCallback(async () => {
    const state = store.getState().auth;
    if (!state.isAuthenticated || !state.refreshToken) return;
    if (state.token?.startsWith('dev-mock-')) return;
    if (Date.now() - lastRefreshAtRef.current < REFRESH_THROTTLE_MS) return;

    lastRefreshAtRef.current = Date.now();
    // Use the shared mutex – if the api interceptor is already refreshing
    // (or another component triggered a refresh) we'll piggy-back on its
    // promise instead of POSTing /auth/refresh with the same RT twice.
    await refreshAccessToken();
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !token) return;
    if (token.startsWith('dev-mock-')) return;

    // Refresh every 12 minutes (access token lives 15 min)
    const REFRESH_INTERVAL_MS = 12 * 60 * 1000;
    refreshIntervalRef.current = setInterval(silentRefresh, REFRESH_INTERVAL_MS);

    // Also refresh when the user comes back to the tab
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        silentRefresh();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Refresh when the window regains focus (covers alt-tab, etc.)
    const handleFocus = () => {
      silentRefresh();
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [isAuthenticated, token, silentRefresh]);

  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* Guest Routes */}
        <Route path="/login" element={<GuestRoute><LoginPage /></GuestRoute>} />

        {/* Protected Routes */}
        <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />

        {/* Purchases */}
        <Route path="/purchases" element={<ProtectedRoute><PurchasesPage /></ProtectedRoute>} />
        <Route path="/purchases/new" element={<ProtectedRoute><PurchaseCreatePage /></ProtectedRoute>} />
        <Route path="/purchases/:id/edit" element={<ProtectedRoute><PurchaseEditPage /></ProtectedRoute>} />
        <Route path="/purchases/:id" element={<ProtectedRoute><PurchaseDetailPage /></ProtectedRoute>} />

        {/* Sales */}
        <Route path="/sales" element={<ProtectedRoute><SalesPage /></ProtectedRoute>} />
        <Route path="/sales/new" element={<ProtectedRoute><SaleCreatePage /></ProtectedRoute>} />
        <Route path="/sales/:id/edit" element={<ProtectedRoute><SaleCreatePage /></ProtectedRoute>} />
        <Route path="/sales/:id" element={<ProtectedRoute><SaleDetailPage /></ProtectedRoute>} />

        {/* Inventory */}
        <Route path="/inventory" element={<ProtectedRoute><InventoryPage /></ProtectedRoute>} />
        <Route path="/inventory/new" element={<ProtectedRoute><InventoryCreatePage /></ProtectedRoute>} />
        <Route path="/inventory/adjust" element={<ProtectedRoute><StockAdjustPage /></ProtectedRoute>} />
        <Route path="/inventory/:id" element={<ProtectedRoute><InventoryDetailPage /></ProtectedRoute>} />

        {/* Expenses */}
        <Route path="/expenses" element={<ProtectedRoute><ExpensesPage /></ProtectedRoute>} />

        {/* Bills */}
        <Route path="/bills" element={<ProtectedRoute><BillsPage /></ProtectedRoute>} />

        {/* Ledger */}
        <Route path="/ledger" element={<ProtectedRoute><LedgerPage /></ProtectedRoute>} />
        <Route path="/ledger/party/:partyId" element={<ProtectedRoute><PartyLedgerPage /></ProtectedRoute>} />
        <Route path="/ledger/*" element={<ProtectedRoute><LedgerPage /></ProtectedRoute>} />

        {/* Payments */}
        <Route path="/payments" element={<ProtectedRoute><PaymentsPage /></ProtectedRoute>} />

        {/* Parties */}
        <Route path="/parties" element={<ProtectedRoute><PartiesPage /></ProtectedRoute>} />
        <Route path="/parties/:partyId" element={<ProtectedRoute><PartyDetailPage /></ProtectedRoute>} />
        <Route path="/cutters/:cutterId" element={<ProtectedRoute><CutterDetailPage /></ProtectedRoute>} />

        {/* Notifications */}
        <Route path="/notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />

        {/* Referrals */}
        <Route path="/referrals" element={<ProtectedRoute><ReferralsPage /></ProtectedRoute>} />

        {/* Subscription — always accessible even when trial expired or no business */}
        <Route path="/subscription" element={<ProtectedRoute allowWhenExpired allowNoBusiness><SubscriptionPage /></ProtectedRoute>} />

        {/* Profile & Settings — always accessible even when trial expired or no business */}
        <Route path="/profile" element={<ProtectedRoute allowWhenExpired allowNoBusiness><ProfilePage /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute allowWhenExpired allowNoBusiness><ProfilePage /></ProtectedRoute>} />

        {/* Business */}
        <Route path="/business" element={<ProtectedRoute allowWhenExpired allowNoBusiness><BusinessListPage /></ProtectedRoute>} />
        <Route path="/business/new" element={<ProtectedRoute allowWhenExpired allowNoBusiness><BusinessCreatePage /></ProtectedRoute>} />
        <Route path="/business/:id/settings" element={<ProtectedRoute allowWhenExpired><BusinessSettingsPage /></ProtectedRoute>} />

        {/* Reports */}
        <Route path="/reports" element={<ProtectedRoute><ReportsPage /></ProtectedRoute>} />

        {/* Help & Support */}
        <Route path="/help" element={<ProtectedRoute><HelpSupportPage /></ProtectedRoute>} />

        {/* WhatsApp AI (Munshi) dashboard */}
        <Route path="/whatsapp-ai" element={<ProtectedRoute><WhatsAppAIDashboard /></ProtectedRoute>} />

        {/* Admin — separate route tree, restricted to super admins only */}
        <Route path="/admin" element={<AdminRoute><AdminDashboardPage /></AdminRoute>} />
        <Route path="/admin/users" element={<AdminRoute><AdminUsersPage /></AdminRoute>} />
        <Route path="/admin/audit" element={<AdminRoute><AdminAuditPage /></AdminRoute>} />
        <Route path="/admin/settings" element={<AdminRoute><AdminSettingsPage /></AdminRoute>} />
        <Route path="/admin/businesses" element={<AdminRoute><AdminBusinessesPage /></AdminRoute>} />
        <Route path="/admin/plans" element={<AdminRoute><AdminPlansPage /></AdminRoute>} />
        <Route path="/admin/subscriptions" element={<AdminRoute><AdminSubscriptionsPage /></AdminRoute>} />
        <Route path="/admin/invoices" element={<AdminRoute><AdminInvoicesPage /></AdminRoute>} />
        <Route path="/admin/*" element={<AdminRoute><AdminDashboardPage /></AdminRoute>} />

        {/* Default redirect */}
        <Route path="/" element={<Navigate to={isAuthenticated ? '/dashboard' : '/login'} replace />} />

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}
