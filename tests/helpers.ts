/**
 * ═══════════════════════════════════════════════════════════
 * SHARED TEST HELPERS — Bahi Khata Pro
 * ═══════════════════════════════════════════════════════════
 * Reusable utilities for every test layer:
 *   • Playwright E2E / Integration
 *   • Jest API tests
 *   • k6 load tests (separate JS helpers)
 */
import type { Page } from '@playwright/test';

// ─── URLs ────────────────────────────────────────────────
export const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';
export const API_URL  = process.env.API_URL  || 'http://localhost:3000/api/v1';
export const GW_URL   = process.env.GW_URL   || 'http://localhost:3000';

// ─── Fresh user factory (collision-free) ─────────────────
//
// `${prefix}_${Date.now()}_${counter}` was NOT collision-free across workers:
// playwright.config.ts sets fullyParallel with default workers, and `counter`
// is module state that restarts at 1 in every worker process. Two workers
// running the same spec inside the same millisecond therefore minted identical
// emails, the second registration failed as a duplicate, and the test failed
// far downstream on a missing dashboard. It reproduced as 3/5 failures under
// parallel workers versus 5/5 passing with --workers=1.
//
// Mixing in the pid and a random suffix makes both the email and the phone
// unique per worker, not just per process.
let counter = 0;
const WORKER_ID = `${process.pid.toString(36)}${(process.env.TEST_WORKER_INDEX ?? '')}`;

export function freshUser(prefix = 'test') {
  counter++;
  const ts = Date.now();
  const unique = `${ts}${WORKER_ID}${counter}${Math.random().toString(36).slice(2, 7)}`;
  return {
    name: `${prefix} User ${ts}`,
    email: `${prefix}_${unique}@bahi.test`,
    password: 'TestPass123!',
    // 10 digits starting 6-9. Seeded from pid + counter + randomness so two
    // workers cannot land on the same number.
    phone: '9' + String(
      (process.pid * 1_000_003 + counter * 7919 + Math.floor(Math.random() * 1e9)) % 1_000_000_000,
    ).padStart(9, '0'),
  };
}

// Backwards-compat alias
export const TEST_USER = freshUser('compat');

export const TEST_ADMIN = {
  email: 'admin@bahikhata.com',
  password: 'Admin@123',
};

// ─── All protected frontend routes ───────────────────────
export const PROTECTED_ROUTES = [
  '/dashboard',
  '/purchases', '/purchases/new',
  '/sales', '/sales/new',
  '/inventory', '/inventory/new', '/inventory/adjust',
  '/ledger',
  '/payments',
  '/parties',
  '/subscription',
  '/profile', '/settings',
  '/business', '/business/new',
  '/notifications',
  '/referrals',
  '/reports',
  '/help',
];

export const ADMIN_ROUTES = [
  '/admin',
  '/admin/users',
  '/admin/audit',
  '/admin/settings',
  '/admin/businesses',
  '/admin/plans',
  '/admin/subscriptions',
  '/admin/invoices',
];

// ─── Playwright helpers ──────────────────────────────────

/**
 * Locators matching the actual login page. The previous versions used loose
 * regexes that broke against the real DOM and made ~70 specs time out:
 *
 *  - `getByRole('button', {name:/email/i}).or(getByText(/email/i))` matched two
 *    elements ("Email / Password" and the "Enter your email" field), so
 *    `await emailTab.isVisible()` THREW a strict-mode violation rather than
 *    returning false.
 *  - `getByPlaceholder(/password/i)` matched NOTHING in register mode, where the
 *    placeholder is "Min 6 characters" (it is "Enter your password" only in
 *    sign-in mode). `.first().fill()` then hung until the 60s test timeout.
 *
 * Real controls: buttons "Email / Password" | "Phone / OTP" | "Sign In" |
 * "Create Account" | "Dev Mode: Skip Login"; placeholders "Enter your full
 * name" | "Enter your email" | "Enter your password" (sign-in) | "Min 6
 * characters" (register) | "Enter 10-digit phone number".
 */
export const EMAIL_TAB = 'Email / Password';
export const PH = {
  name: 'Enter your full name',
  email: 'Enter your email',
  signInPassword: 'Enter your password',
  registerPassword: 'Min 6 characters',
  phone: 'Enter 10-digit phone number',
} as const;

/** Register a fresh user via the UI */
export async function registerUser(page: Page, user = freshUser()) {
  await page.goto('/login');
  await page.getByRole('button', { name: EMAIL_TAB, exact: true }).click();

  // "Create Account" toggles sign-in -> register mode, then submits the form.
  const createAccount = page.getByRole('button', { name: 'Create Account', exact: true });
  await createAccount.click();

  await page.getByPlaceholder(PH.name).fill(user.name);
  await page.getByPlaceholder(PH.email).fill(user.email);
  await page.getByPlaceholder(PH.registerPassword).fill(user.password);
  await page.getByPlaceholder(PH.phone).fill(user.phone);

  await createAccount.click();

  // A freshly registered user owns no business, so the app parks them on
  // /business/new — it only passes through /dashboard transiently while it
  // resolves whether a business exists (observed trail:
  // /business/new -> /dashboard -> /dashboard -> /business/new). That race is
  // why `waitForDashboard` could succeed and the very next
  // `toHaveURL(/dashboard/)` then fail. Completing onboarding here makes the
  // session genuinely dashboard-ready, which is what every caller assumes.
  // Race navigation against an error toast. Waiting only for navigation means a
  // *failed* registration (duplicate email, validation) burns the full 15s
  // timeout here — by which point react-hot-toast has already dismissed the
  // message the caller wanted to assert on.
  await Promise.race([
    page.waitForURL(/dashboard|admin|business\/new/, { timeout: 15_000 }).catch(() => {}),
    page
      .getByText(/already exists|failed|invalid|must be|enter your/i)
      .first()
      .waitFor({ state: 'visible', timeout: 15_000 })
      .catch(() => {}),
  ]);
  await ensureBusiness(page);
  return user;
}

/**
 * Drop the current session.
 *
 * /login redirects away when already authenticated, so any spec that registers
 * and then expects to use the login/register form again must clear the session
 * first — otherwise the form is never reachable and the spec times out looking
 * for the "Email / Password" tab.
 */
export async function clearAuth(page: Page) {
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  }).catch(() => {});
}

/** Give the current user a business via the API (no-op if not authenticated). */
export async function ensureBusiness(page: Page, name?: string) {
  const token = await page.evaluate(() => localStorage.getItem('bk_token')).catch(() => null);
  if (!token) return null;
  // Name contains the word "Business" deliberately. Specs assert the dashboard
  // shows a business name *or* the create-business CTA; once onboarding
  // completes the CTA is gone, so a name like "Test Biz 123" left the assertion
  // matching only incidental page chrome (a nav label), which made it depend on
  // render timing rather than on the thing being tested.
  const res = await apiHttp('POST', '/business', {
    name: name || `Test Business ${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    type: 'RETAIL',
  }, token);

  // Complete onboarding the way the app does: after creating a business the
  // user picks a plan (/subscription?setup=true). Since the plan-selection
  // gate now actually fires for subscription-less users, a business without a
  // plan would bounce every protected page to /subscription and the specs
  // would never reach the dashboard. Best-effort: a failure here surfaces as
  // the gate redirect, which is the honest signal.
  try {
    const plansRes = await apiGet('/subscriptions/plans');
    const plans = (plansRes.body as any)?.data || [];
    const free = plans.find((p: any) => p.slug === 'free') || plans[0];
    if (free) {
      await apiPost('/subscriptions', { planId: free.id, billingCycle: 'MONTHLY' }, token);
    }
  } catch { /* surfaced by the gate redirect if it matters */ }
  return res;
}

/** Login an existing user via the UI */
export async function loginUser(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByRole('button', { name: EMAIL_TAB, exact: true }).click();
  await page.getByPlaceholder(PH.email).fill(email);
  await page.getByPlaceholder(PH.signInPassword).fill(password);
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
}

/**
 * Wait for a *settled* dashboard.
 *
 * A bare `waitForURL(/dashboard|admin/)` matches the transient hop through
 * /dashboard that happens while the app decides whether the user has a
 * business, so it could resolve on a URL the page was about to navigate away
 * from. Land on /business/new instead? Go to the dashboard explicitly.
 */
export async function waitForDashboard(page: Page) {
  await page.waitForURL(/dashboard|admin|business\/new/, { timeout: 15_000 });

  // Reload unconditionally, and require the dashboard to *hold*.
  //
  // Two things make a single URL check unreliable here. The client decides
  // /business/new vs /dashboard from the business list it loaded at mount, and
  // ensureBusiness() creates the business over the API afterwards — so the page
  // only learns about it on a reload. And while resolving, the app oscillates
  // (/business/new -> /dashboard -> /business/new). Checking once could see the
  // transient /dashboard, skip the reload, and then land back on /business/new
  // permanently. That showed up as 3/8 failures under parallel workers, where
  // the extra load shifts the timing.
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle').catch(() => {});

    // Confirm it stayed put rather than bouncing straight back.
    await page.waitForTimeout(600);
    if (/dashboard|admin/.test(page.url())) {
      await page.waitForTimeout(400);
      if (/dashboard|admin/.test(page.url())) return;
    }
  }

  // Surface a real failure rather than continuing into a misleading assertion.
  await page.waitForURL(/dashboard|admin/, { timeout: 10_000 });
}

/** Register + wait for dashboard = ready-to-use session */
export async function authenticatedSession(page: Page, prefix = 'sess') {
  const u = freshUser(prefix);
  await registerUser(page, u);
  await waitForDashboard(page);
  return u;
}

// ─── API helpers (fetch-based, no browser) ───────────────

export async function apiHttp(
  method: string,
  path: string,
  body?: unknown,
  token?: string,
  headers: Record<string, string> = {},
) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json, headers: Object.fromEntries(res.headers.entries()) };
}

export const apiGet    = (p: string, t?: string, h?: Record<string, string>) => apiHttp('GET', p, undefined, t, h);
export const apiPost   = (p: string, b: unknown, t?: string, h?: Record<string, string>) => apiHttp('POST', p, b, t, h);
export const apiPatch  = (p: string, b: unknown, t?: string, h?: Record<string, string>) => apiHttp('PATCH', p, b, t, h);
export const apiPut    = (p: string, b: unknown, t?: string, h?: Record<string, string>) => apiHttp('PUT', p, b, t, h);
export const apiDelete = (p: string, t?: string, h?: Record<string, string>) => apiHttp('DELETE', p, undefined, t, h);

/** Register via API — returns { accessToken, refreshToken, user } */
export async function apiRegister(user = freshUser()) {
  const res = await apiPost('/auth/register', user);
  const data = (res.body as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
  return { ...data, _status: res.status, _user: user };
}

/** Login via API — returns { accessToken, refreshToken, user } */
export async function apiLogin(email: string, password: string) {
  const res = await apiPost('/auth/login', { email, password });
  const data = (res.body as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
  return { ...data, _status: res.status };
}
