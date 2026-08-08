# 🧪 Bahi Khata Pro — Test Suite

Comprehensive test coverage for Bahi Khata Pro SaaS ERP, targeting **100,000+ concurrent users**.

---

## 📁 Test Structure

```
tests/
├── e2e/                          # Playwright E2E UI tests
│   └── pages.e2e.ts              # ~85+ tests across all pages & flows
├── integration/                   # Playwright Integration tests (UI ↔ API)
│   └── ui-api.integration.ts     # ~45+ tests validating API ↔ UI data flow
├── api/                          # Jest API tests (no browser)
│   └── all-endpoints.api.ts      # ~95+ tests for every REST endpoint
├── load/                         # k6 load & stress tests
│   ├── load-100k.k6.js          # Ramp-up to 100K VUs (mixed traffic)
│   ├── spike-100k.k6.js         # Sudden spike to 100K VUs
│   └── soak.k6.js               # Sustained load (endurance / memory leak detection)
└── helpers.ts                    # Shared utilities for all test layers
```

---

## 🚀 Quick Start

### Prerequisites

```bash
# Install project dependencies (from root)
npm install

# Install Playwright browsers (first time only)
npx playwright install chromium

# Install k6 for load testing
brew install k6       # macOS
# See https://k6.io/docs/getting-started/installation/ for other OS
```

### Ensure services are running

```bash
npm run dev:all       # Starts all backend services + frontend
```

---

## 1️⃣ E2E UI Tests (Playwright)

Tests every user-facing page and flow in a real Chromium browser.

**What's covered:**
- Login page: branding, validation, error messages, phone/email toggle, theme toggle
- Registration: success flow, duplicate email, short password, empty name
- Login: valid credentials, session persistence after reload
- Session persistence: tab switch (visibility change), window focus/blur, expired token recovery via silent refresh
- Auth guards: all 20+ protected routes redirect to `/login`
- Dashboard: loads content, sidebar navigation links
- Subscription: plan cards, Free plan marked as current, billing cycle toggle
- Business pages: list, create form
- Purchases, Sales, Inventory, Ledger, Payments, Parties pages
- Profile & Settings, Notifications, Referrals, Reports, Help pages
- 404 page, Admin access control (non-admin blocked)
- Sidebar navigation, responsive mobile views (320px, 375px)
- Accessibility: alt text, `<main>` landmark
- Full page traversal: zero JS console errors across all routes

```bash
# Run all E2E + Integration tests
npx playwright test

# Run only E2E tests
npx playwright test tests/e2e/

# Run with headed browser (watch mode)
npx playwright test tests/e2e/ --headed

# View HTML report after run
npx playwright show-report
```

---

## 2️⃣ Integration Tests — UI ↔ API (Playwright)

Validates that browser UI correctly communicates with the live API.

**What's covered:**
- Registration → JWT stored in localStorage → user data persisted
- Login → token set → auth state restored
- Logout → tokens cleared → redirect to login
- Invalid/expired token → silent refresh attempted → redirect to login on failure
- Token refresh keeps session alive after page reload
- Silent token refresh on 401: interceptor retries original request after refresh
- Multiple concurrent 401s trigger only one refresh call (queue mechanism)
- Token refresh on visibility change (tab switch)
- Token refresh on window focus (alt-tab recovery)
- Session survives simulated token expiry via silent refresh
- localStorage tokens updated after silent refresh (rotation verified)
- Subscription page fetches & renders plans from API
- Plan names from API match rendered UI text
- Business creation form → POST /business → success
- Business list page → GET /business → success
- Profile page → fetches user data from API
- Dashboard → fires API calls on load
- Error handling: 401 → silent refresh → redirect on failure, 500 graceful degradation, 429 auto-retry
- Network offline recovery
- No 429 errors across all protected pages
- Cross-page data consistency (user name on dashboard vs profile)
- Authorization header present on authenticated requests

```bash
# Run only integration tests
npx playwright test tests/integration/
```

---

## 3️⃣ API Tests (Jest)

Direct API testing against the gateway — no browser.

**What's covered:**
- Health check: 200, valid timestamp, version field
- Auth: register (success, duplicate, missing fields, short password, invalid email, empty body)
- Auth: login (success, wrong password, non-existent user, missing fields, empty body)
- Auth: token refresh (valid, invalid, missing, empty string, expired JWT)
- Auth: refresh token rotation (old token invalidated after refresh)
- Auth: new access token from refresh works for authenticated endpoints
- Auth: /me (valid token, no token, invalid token, malformed header)
- Auth: OTP (valid phone, missing phone)
- Subscriptions: plans (list, Free plan, sort order, required fields)
- Subscriptions: current (auth required, with valid token)
- Business: create (success, missing name, no auth), list, dashboard
- Purchases: list, dashboard, auth required
- Sales: list, lots, auth required
- Inventory: items, categories, low-stock, dashboard, auth required
- Ledger: entries, trial-balance, profit-loss, balance-sheet, outstanding, day-book
- Profile: /me (get, update), parties, cutters, expense-types
- Notifications: list, auth required
- Billing: payments, invoices, auth required
- Referrals: my-referrals, leaderboard
- Admin: dashboard, users, plans, businesses, invoices (non-admin → 403, no auth → 401)
- Rapid-fire: 200 concurrent /health, 200 concurrent /plans, 100 concurrent logins, 100 concurrent /me, 50 concurrent /business → **zero 429s**
- Multi-user isolation: user2 cannot see user1's businesses
- Edge cases: 500-char name, SQL injection, XSS payload, null body, unknown query params
- CORS & security headers (helmet)
- 404: unknown routes (GET, POST, random path)

```bash
# Run all API tests
npx jest --config jest.config.ts tests/api/

# Run with verbose output
npx jest --config jest.config.ts tests/api/ --verbose
```

---

## 4️⃣ Load Tests (k6) — 100,000 Concurrent Users

### a) Mixed Traffic Load Test

Ramps up to 100K virtual users with realistic mixed traffic:
- 30% health checks
- 20% public plans browsing
- 20% auth flows (register → login → /me)
- 30% authenticated browsing (business CRUD, purchases, inventory, etc.)

```bash
# Local smoke test (1K VUs)
k6 run tests/load/load-100k.k6.js

# Full 100K (uncomment "full" scenario in the file)
# k6 run tests/load/load-100k.k6.js

# With HTML dashboard
K6_WEB_DASHBOARD=true k6 run tests/load/load-100k.k6.js
```

### b) Spike Test

Sudden burst from 0 → 100K VUs to test system stability under extreme load.

```bash
# Local spike (1K VUs)
k6 run tests/load/spike-100k.k6.js

# Full 100K spike
k6 run -e PROFILE=full tests/load/spike-100k.k6.js
```

### c) Soak (Endurance) Test

Sustained 5K VUs for 30 minutes to detect memory leaks and degradation.

```bash
# Local soak (200 VUs, 2 minutes)
k6 run tests/load/soak.k6.js

# Full soak (5K VUs, 30 minutes)
k6 run -e PROFILE=full tests/load/soak.k6.js
```

### Load Test Thresholds

| Metric               | Threshold              |
| -------------------- | ---------------------- |
| p95 response time    | < 3 seconds            |
| p99 response time    | < 5 seconds            |
| HTTP failure rate    | < 5%                   |
| 429 error rate       | < 0.1% (near zero)     |
| Total 429 errors     | < 10                   |

---

## 📊 Test Count Summary

| Layer          | Test Count | Framework  |
| -------------- | ---------- | ---------- |
| E2E UI         | ~80+       | Playwright |
| Integration    | ~35+       | Playwright |
| API            | ~90+       | Jest       |
| Load / Stress  | 3 scripts  | k6         |
| **Total**      | **~205+**  |            |

---

## 🔧 Configuration Files

| File                  | Purpose                          |
| --------------------- | -------------------------------- |
| `playwright.config.ts` | Playwright settings (E2E + Integration) |
| `jest.config.ts`      | Jest settings (API tests)        |
| `tsconfig.test.json`  | TypeScript config for test files |

---

## 💡 Tips

- **Parallel execution**: Playwright runs tests in parallel by default. Reduce workers with `--workers=1` for debugging.
- **Headed mode**: `npx playwright test --headed` to watch tests run in the browser.
- **Debug mode**: `npx playwright test --debug` opens the Playwright inspector.
- **k6 cloud**: For true 100K VU testing, use [k6 Cloud](https://k6.io/cloud) for distributed execution.
- **CI/CD**: Add these test commands to your CI pipeline for automated quality gates.
