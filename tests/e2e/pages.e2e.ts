/**
 * ═══════════════════════════════════════════════════════════════
 * E2E UI TESTS — Bahi Khata Pro  (Playwright)
 * ═══════════════════════════════════════════════════════════════
 * Complete end-to-end test coverage for every user-facing page,
 * form validation, CRUD flow, navigation, auth guards, theme
 * toggle, responsive behaviour, and accessibility basics.
 *
 * Run:  npx playwright test tests/e2e/
 *
 * Total: ~80+ test cases organised by feature area.
 * ═══════════════════════════════════════════════════════════════
 */
import { test, expect } from '@playwright/test';
import {
  freshUser,
  registerUser,
  loginUser,
  waitForDashboard,
  authenticatedSession,
  clearAuth,
  EMAIL_TAB,
  PH,
  PROTECTED_ROUTES,
  ADMIN_ROUTES,
} from '../helpers';

// ═════════════════════════════════════════════════════════════
//  §1  AUTH — LOGIN PAGE
// ═════════════════════════════════════════════════════════════
test.describe('Auth — Login Page', () => {
  test('renders login page with branding', async ({ page }) => {
    await page.goto('/login');
    // "Bahi Khata Pro" appears three times (h1, sidebar span, subtitle) — an
    // unqualified getByText is a strict-mode violation, not a failing app.
    await expect(page.getByRole('heading', { name: /Bahi Khata/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign In', exact: true })).toBeVisible();
  });

  test('shows validation error for empty email/password', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Email / Password', exact: true }).click();
    await page.getByRole('button', { name: 'Sign In', exact: true }).click();
    await expect(
      page.getByText(/enter.*email|email.*required|enter.*password|password.*6/i).first(),
    ).toBeVisible({ timeout: 5000 });
  });

  test('shows error for wrong credentials', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Email / Password', exact: true }).click();
    await page.getByPlaceholder('Enter your email').fill('nobody@nowhere.com');
    await page.getByPlaceholder('Enter your password').fill('WrongPassword1');
    await page.getByRole('button', { name: 'Sign In', exact: true }).click();
    // The app is more specific than this regex used to allow: an unknown email
    // produces "No account found with this email. Please register." — which
    // contains none of invalid/incorrect/failed.
    await expect(
      page.getByText(/invalid|incorrect|failed|no account found/i).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('toggle between phone and email auth methods', async ({ page }) => {
    await page.goto('/login');
    const phoneTab = page.getByRole('button', { name: /phone/i }).or(page.getByText(/phone/i));
    const emailTab = page.getByRole('button', { name: /email/i }).or(page.getByText(/email/i));
    if (await emailTab.isVisible() && await phoneTab.isVisible()) {
      await phoneTab.click();
      await expect(page.getByPlaceholder(/phone/i)).toBeVisible();
      await emailTab.click();
      await expect(page.getByPlaceholder(/email/i)).toBeVisible();
    }
  });

  test('toggle between login and register forms', async ({ page }) => {
    await page.goto('/login');
    const emailTab = page.getByRole('button', { name: /email/i }).or(page.getByText(/email/i));
    if (await emailTab.isVisible()) await emailTab.click();
    const registerLink = page.getByText(/create.*account|sign.*up|register/i);
    if (await registerLink.isVisible()) {
      await registerLink.click();
      await expect(page.getByPlaceholder(/name/i)).toBeVisible();
    }
  });

  test('password field is of type="password"', async ({ page }) => {
    await page.goto('/login');
    const emailTab = page.getByRole('button', { name: /email/i }).or(page.getByText(/email/i));
    if (await emailTab.isVisible()) await emailTab.click();
    const pwdField = page.getByPlaceholder(/password/i).first();
    await expect(pwdField).toHaveAttribute('type', 'password');
  });

  test('theme toggle (light / dark) works without crash', async ({ page }) => {
    await page.goto('/login');
    const toggleBtn = page.locator('[aria-label="Toggle theme"]');
    if (await toggleBtn.isVisible()) {
      await toggleBtn.click();
      await page.waitForTimeout(300);
      await toggleBtn.click();
    }
  });

  test('login page is responsive — no horizontal scroll at 375px', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/login');
    const body = page.locator('body');
    const box = await body.boundingBox();
    expect(box!.width).toBeLessThanOrEqual(375);
  });

  test('page title contains "Bahi Khata"', async ({ page }) => {
    await page.goto('/login');
    const title = await page.title();
    expect(title.toLowerCase()).toContain('bahi');
  });
});

// ═════════════════════════════════════════════════════════════
//  §2  AUTH — REGISTRATION
// ═════════════════════════════════════════════════════════════
test.describe('Auth — Registration', () => {
  test('register new user → redirects to dashboard', async ({ page }) => {
    const user = freshUser('e2e_reg');
    await registerUser(page, user);
    await waitForDashboard(page);
    await expect(page).toHaveURL(/dashboard/);
  });

  test('duplicate email registration shows error', async ({ page }) => {
    const user = freshUser('e2e_dup');
    await registerUser(page, user);
    await waitForDashboard(page);
    // Must drop the session: /login redirects away while authenticated, so the
    // second registration attempt never reached the form.
    await clearAuth(page);
    await registerUser(page, user);
    await expect(page.getByText(/already exists|duplicate|taken/i).first()).toBeVisible({ timeout: 10_000 });
  });

  // These two still carried the original loose locators that the helpers.ts fix
  // could not reach: `getByRole(…).or(getByText(/email/i))` matches both the
  // "Email / Password" tab and the "Enter your email" field, so `isVisible()`
  // threw a strict-mode violation; and `getByPlaceholder(/password/i)` matches
  // nothing in register mode, where the placeholder is "Min 6 characters".
  // Use the same verified constants the helpers use.
  test('short password shows validation error', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: EMAIL_TAB, exact: true }).click();
    await page.getByRole('button', { name: 'Create Account', exact: true }).click();
    await page.getByPlaceholder(PH.name).fill('X');
    await page.getByPlaceholder(PH.email).fill(`short_${Date.now()}@example.com`);
    await page.getByPlaceholder(PH.registerPassword).fill('12');
    await page.getByRole('button', { name: 'Create Account', exact: true }).click();
    await expect(
      page.getByText(/password.*6|too.*short|password.*required/i).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('empty name shows validation error', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: EMAIL_TAB, exact: true }).click();
    await page.getByRole('button', { name: 'Create Account', exact: true }).click();
    await page.getByPlaceholder(PH.email).fill(`noname_${Date.now()}@example.com`);
    await page.getByPlaceholder(PH.registerPassword).fill('SecurePass1!');
    await page.getByRole('button', { name: 'Create Account', exact: true }).click();
    await expect(
      page.getByText(/name.*required|enter.*name/i).first(),
    ).toBeVisible({ timeout: 10_000 });
  });
});

// ═════════════════════════════════════════════════════════════
//  §3  AUTH — LOGIN FLOW
// ═════════════════════════════════════════════════════════════
test.describe('Auth — Login', () => {
  test('login with valid credentials → dashboard', async ({ page }) => {
    const u = freshUser('e2e_login');
    await registerUser(page, u);
    await waitForDashboard(page);
    // Drop the session first — /login redirects away while authenticated, so
    // loginUser could never find the "Email / Password" tab.
    await clearAuth(page);
    await loginUser(page, u.email, u.password);
    await waitForDashboard(page);
    await expect(page).toHaveURL(/dashboard/);
  });

  test('login persists across page reload', async ({ page }) => {
    const u = freshUser('e2e_persist');
    await registerUser(page, u);
    await waitForDashboard(page);
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/dashboard/);
    // Token should still be valid after reload (silent refresh on mount)
    const token = await page.evaluate(() => localStorage.getItem('bk_token'));
    expect(token).toBeTruthy();
    expect(token!.split('.').length).toBe(3); // valid JWT
  });

  test('session persists after simulated tab switch (visibility change)', async ({ page }) => {
    const u = freshUser('e2e_tabswitch');
    await registerUser(page, u);
    await waitForDashboard(page);

    // Simulate tab becoming hidden then visible
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        value: 'hidden',
        writable: true,
        configurable: true,
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(1000);
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        value: 'visible',
        writable: true,
        configurable: true,
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(3000);

    // User should still be on dashboard (not logged out)
    await expect(page).toHaveURL(/dashboard/);
    const token = await page.evaluate(() => localStorage.getItem('bk_token'));
    expect(token).toBeTruthy();
  });

  test('session persists after simulated window focus/blur', async ({ page }) => {
    const u = freshUser('e2e_focus');
    await registerUser(page, u);
    await waitForDashboard(page);

    // Simulate window blur then focus (like alt-tabbing)
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.waitForTimeout(500);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.waitForTimeout(3000);

    // User should still be on dashboard
    await expect(page).toHaveURL(/dashboard/);
  });

  test('session survives with expired access token but valid refresh token', async ({ page }) => {
    const u = freshUser('e2e_expired');
    await registerUser(page, u);
    await waitForDashboard(page);

    // Corrupt the access token but keep the valid refresh token
    await page.evaluate(() => {
      localStorage.setItem('bk_token', 'expired.access.token');
    });

    // Navigate — the silent refresh interceptor should save the session
    await page.goto('/subscription');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // Should NOT be on login page (refresh token should have renewed the session)
    expect(page.url()).not.toContain('/login');
  });
});

// ═════════════════════════════════════════════════════════════
//  §4  AUTH GUARDS — Protected routes redirect to /login
// ═════════════════════════════════════════════════════════════
test.describe('Auth guards — protected routes', () => {
  for (const path of PROTECTED_ROUTES) {
    test(`${path} → /login when unauthenticated`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/login/);
    });
  }
});

// ═════════════════════════════════════════════════════════════
//  §5  DASHBOARD
// ═════════════════════════════════════════════════════════════
test.describe('Dashboard', () => {
  test('dashboard loads with main content area', async ({ page }) => {
    await authenticatedSession(page, 'dash');
    await expect(page.locator('main, [class*="dashboard"], [class*="Dashboard"]').first()).toBeVisible();
  });

  test('sidebar / navigation has core module links', async ({ page }) => {
    await authenticatedSession(page, 'dashnav');
    for (const label of ['Purchase', 'Sale', 'Inventory', 'Ledger']) {
      await expect(page.getByText(new RegExp(label, 'i')).first()).toBeVisible();
    }
  });

  test('dashboard shows business name or empty-state CTA', async ({ page }) => {
    await authenticatedSession(page, 'dashbiz');
    // `isVisible()` resolves immediately — it does not auto-wait — and the
    // trailing .catch(() => false) swallowed the miss, so this raced the
    // dashboard's data fetch and only passed while an always-present element
    // happened to match. expect().toBeVisible() retries until the timeout.
    await expect(
      page.getByText(/business|create.*business/i).first(),
    ).toBeVisible({ timeout: 15_000 });
  });
});

// ═════════════════════════════════════════════════════════════
//  §6  SUBSCRIPTION PAGE
// ═════════════════════════════════════════════════════════════
test.describe('Subscription Page', () => {
  test('shows plans with Free plan available', async ({ page }) => {
    await authenticatedSession(page, 'sub');
    await page.goto('/subscription');
    await expect(page.getByText(/free/i).first()).toBeVisible({ timeout: 15_000 });
  });

  test('Free plan is marked as current for new users', async ({ page }) => {
    await authenticatedSession(page, 'subfree');
    await page.goto('/subscription');
    await expect(page.getByText(/current.*plan/i).first()).toBeVisible({ timeout: 15_000 });
  });

  test('billing cycle toggle (monthly / yearly) works', async ({ page }) => {
    await authenticatedSession(page, 'subtoggle');
    await page.goto('/subscription');
    const yearlyBtn = page.getByRole('button', { name: /yearly/i });
    if (await yearlyBtn.isVisible()) {
      await yearlyBtn.click();
      await page.waitForTimeout(500);
      await page.getByRole('button', { name: /monthly/i }).click();
    }
  });

  test('plan cards have choose/upgrade buttons', async ({ page }) => {
    await authenticatedSession(page, 'subcard');
    await page.goto('/subscription');
    await page.waitForLoadState('networkidle');
    const btns = page.getByRole('button', { name: /choose|upgrade|subscribe|current/i });
    await expect(btns.first()).toBeVisible({ timeout: 15_000 });
  });
});

// ═════════════════════════════════════════════════════════════
//  §7  BUSINESS PAGES
// ═════════════════════════════════════════════════════════════
test.describe('Business Pages', () => {
  test('business list page loads', async ({ page }) => {
    await authenticatedSession(page, 'bizlist');
    await page.goto('/business');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('main').first()).toBeVisible();
  });

  test('create business page loads with form', async ({ page }) => {
    await authenticatedSession(page, 'bizcreate');
    await page.goto('/business/new');
    await expect(page.getByText(/create.*business|new.*business/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test('create business with valid data', async ({ page }) => {
    await authenticatedSession(page, 'biznew');
    await page.goto('/business/new');
    const nameInput = page.getByPlaceholder(/business.*name|name/i).first();
    if (await nameInput.isVisible()) {
      await nameInput.fill(`E2E Biz ${Date.now()}`);
      const submit = page.getByRole('button', { name: /create|save|submit/i });
      if (await submit.isVisible()) await submit.click();
      await page.waitForLoadState('networkidle');
    }
  });
});

// ═════════════════════════════════════════════════════════════
//  §8  PURCHASES PAGES
// ═════════════════════════════════════════════════════════════
test.describe('Purchases Page', () => {
  test('purchases page loads with empty state or list', async ({ page }) => {
    await authenticatedSession(page, 'pur');
    await page.goto('/purchases');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('main').first()).toBeVisible();
  });

  test('new purchase page loads', async ({ page }) => {
    await authenticatedSession(page, 'purnew');
    await page.goto('/purchases/new');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('main').first()).toBeVisible();
  });
});

// ═════════════════════════════════════════════════════════════
//  §9  SALES PAGES
// ═════════════════════════════════════════════════════════════
test.describe('Sales Page', () => {
  test('sales page loads', async ({ page }) => {
    await authenticatedSession(page, 'sale');
    await page.goto('/sales');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('main').first()).toBeVisible();
  });

  test('new sale page loads', async ({ page }) => {
    await authenticatedSession(page, 'salenew');
    await page.goto('/sales/new');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('main').first()).toBeVisible();
  });
});

// ═════════════════════════════════════════════════════════════
//  §10  INVENTORY PAGES
// ═════════════════════════════════════════════════════════════
test.describe('Inventory Page', () => {
  test('inventory list page loads', async ({ page }) => {
    await authenticatedSession(page, 'inv');
    await page.goto('/inventory');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('main').first()).toBeVisible();
  });

  test('new item page loads', async ({ page }) => {
    await authenticatedSession(page, 'invnew');
    await page.goto('/inventory/new');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('main').first()).toBeVisible();
  });

  test('stock adjust page loads', async ({ page }) => {
    await authenticatedSession(page, 'invadj');
    await page.goto('/inventory/adjust');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('main').first()).toBeVisible();
  });
});

// ═════════════════════════════════════════════════════════════
//  §11  LEDGER PAGE
// ═════════════════════════════════════════════════════════════
test.describe('Ledger Page', () => {
  test('ledger page loads', async ({ page }) => {
    await authenticatedSession(page, 'led');
    await page.goto('/ledger');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('main').first()).toBeVisible();
  });
});

// ═════════════════════════════════════════════════════════════
//  §12  PAYMENTS PAGE
// ═════════════════════════════════════════════════════════════
test.describe('Payments Page', () => {
  test('payments page loads', async ({ page }) => {
    await authenticatedSession(page, 'pay');
    await page.goto('/payments');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('main').first()).toBeVisible();
  });
});

// ═════════════════════════════════════════════════════════════
//  §13  PARTIES PAGE
// ═════════════════════════════════════════════════════════════
test.describe('Parties Page', () => {
  test('parties page loads', async ({ page }) => {
    await authenticatedSession(page, 'pty');
    await page.goto('/parties');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('main').first()).toBeVisible();
  });
});

// ═════════════════════════════════════════════════════════════
//  §14  PROFILE PAGE
// ═════════════════════════════════════════════════════════════
test.describe('Profile Page', () => {
  test('profile page loads with user info', async ({ page }) => {
    await authenticatedSession(page, 'prof');
    await page.goto('/profile');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('main').first()).toBeVisible();
  });

  test('settings page loads (alias for profile)', async ({ page }) => {
    await authenticatedSession(page, 'sett');
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('main').first()).toBeVisible();
  });
});

// ═════════════════════════════════════════════════════════════
//  §15  NOTIFICATIONS PAGE
// ═════════════════════════════════════════════════════════════
test.describe('Notifications Page', () => {
  test('notifications page loads', async ({ page }) => {
    await authenticatedSession(page, 'notif');
    await page.goto('/notifications');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('main').first()).toBeVisible();
  });
});

// ═════════════════════════════════════════════════════════════
//  §16  REFERRALS PAGE
// ═════════════════════════════════════════════════════════════
test.describe('Referrals Page', () => {
  test('referrals page loads', async ({ page }) => {
    await authenticatedSession(page, 'ref');
    await page.goto('/referrals');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('main').first()).toBeVisible();
  });
});

// ═════════════════════════════════════════════════════════════
//  §17  REPORTS PAGE
// ═════════════════════════════════════════════════════════════
test.describe('Reports Page', () => {
  test('reports page loads', async ({ page }) => {
    await authenticatedSession(page, 'rep');
    await page.goto('/reports');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('main').first()).toBeVisible();
  });
});

// ═════════════════════════════════════════════════════════════
//  §18  HELP & SUPPORT PAGE
// ═════════════════════════════════════════════════════════════
test.describe('Help & Support Page', () => {
  test('help page loads', async ({ page }) => {
    await authenticatedSession(page, 'help');
    await page.goto('/help');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('main').first()).toBeVisible();
  });
});

// ═════════════════════════════════════════════════════════════
//  §19  404 PAGE
// ═════════════════════════════════════════════════════════════
test.describe('404 Page', () => {
  test('unknown route shows 404 / not found', async ({ page }) => {
    await page.goto('/some-random-page-that-doesnt-exist');
    await expect(page.getByText(/not.*found|404/i).first()).toBeVisible({ timeout: 10_000 });
  });
});

// ═════════════════════════════════════════════════════════════
//  §20  ADMIN PAGES — ACCESS CONTROL
// ═════════════════════════════════════════════════════════════
test.describe('Admin Pages — Access Control', () => {
  test('non-admin user sees access denied on /admin', async ({ page }) => {
    await authenticatedSession(page, 'noadmin');
    await page.goto('/admin');
    await expect(page.getByText(/access.*denied|unauthorized|forbidden/i).first()).toBeVisible({ timeout: 10_000 });
  });

  for (const route of ADMIN_ROUTES.slice(1)) {
    test(`non-admin blocked from ${route}`, async ({ page }) => {
      await authenticatedSession(page, 'noadm');
      await page.goto(route);
      await expect(page.getByText(/access.*denied|unauthorized|forbidden/i).first()).toBeVisible({ timeout: 10_000 });
    });
  }
});

// ═════════════════════════════════════════════════════════════
//  §21  NAVIGATION — Sidebar links work
// ═════════════════════════════════════════════════════════════
test.describe('Navigation — Sidebar', () => {
  test('sidebar links navigate to correct pages', async ({ page }) => {
    await authenticatedSession(page, 'nav');
    const links: Array<{ label: RegExp; urlPart: string }> = [
      { label: /dashboard/i, urlPart: 'dashboard' },
      { label: /purchase/i, urlPart: 'purchase' },
      { label: /sale/i, urlPart: 'sale' },
      { label: /inventory/i, urlPart: 'inventory' },
      { label: /ledger/i, urlPart: 'ledger' },
    ];
    for (const { label, urlPart } of links) {
      const link = page.getByRole('link', { name: label }).or(page.getByText(label)).first();
      if (await link.isVisible()) {
        await link.click();
        await page.waitForLoadState('networkidle');
        expect(page.url()).toContain(urlPart);
      }
    }
  });
});

// ═════════════════════════════════════════════════════════════
//  §22  RESPONSIVE — Mobile viewport
// ═════════════════════════════════════════════════════════════
test.describe('Responsive — Mobile', () => {
  test('dashboard is usable at 375px width', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await authenticatedSession(page, 'mobi');
    await expect(page.locator('main').first()).toBeVisible();
  });

  test('login page at 320px width has no overflow', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto('/login');
    const html = page.locator('html');
    const scrollWidth = await html.evaluate((el) => (el as HTMLElement).scrollWidth);
    const clientWidth = await html.evaluate((el) => (el as HTMLElement).clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2); // tiny tolerance
  });
});

// ═════════════════════════════════════════════════════════════
//  §23  ACCESSIBILITY — Basic checks
// ═════════════════════════════════════════════════════════════
test.describe('Accessibility — Basics', () => {
  test('all images have alt text on login page', async ({ page }) => {
    await page.goto('/login');
    const images = page.locator('img');
    const count = await images.count();
    for (let i = 0; i < count; i++) {
      const alt = await images.nth(i).getAttribute('alt');
      expect(alt).not.toBeNull();
    }
  });

  test('main landmark exists on dashboard', async ({ page }) => {
    await authenticatedSession(page, 'a11y');
    const main = page.locator('main');
    await expect(main.first()).toBeVisible();
  });
});

// ═════════════════════════════════════════════════════════════
//  §24  FULL PAGE TRAVERSAL — No JS errors
// ═════════════════════════════════════════════════════════════
test.describe('Full traversal — no console errors', () => {
  test('navigate every protected page without JS errors', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', (err) => jsErrors.push(err.message));

    await authenticatedSession(page, 'traverse');

    for (const p of PROTECTED_ROUTES) {
      await page.goto(p);
      await page.waitForLoadState('networkidle');
    }

    // Filter out benign React dev-mode warnings
    const real = jsErrors.filter(
      (e) => !/react|hydrat|chunk|dynamic/i.test(e),
    );
    expect(real).toEqual([]);
  });
});
