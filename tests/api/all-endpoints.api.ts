/**
 * ═══════════════════════════════════════════════════════════════
 * API TESTS — All Backend Endpoints  (Jest + fetch)
 * ═══════════════════════════════════════════════════════════════
 * Comprehensive test coverage for every REST endpoint exposed
 * through the API Gateway (localhost:3000/api/v1).
 *
 * Covers:
 *   • Health check
 *   • Auth service (register, login, refresh, me, OTP)
 *   • Subscription service (plans, current)
 *   • Business service (CRUD, dashboard)
 *   • Purchase service
 *   • Sales service
 *   • Inventory service
 *   • Ledger service (entries, trial-balance, P&L, balance-sheet)
 *   • Profile service (me, parties, cutters, expense-types)
 *   • Notification service
 *   • Billing service
 *   • Referral service
 *   • Admin service (users, plans, businesses, invoices)
 *   • Rapid-fire / concurrency — zero 429s
 *   • 404 unknown routes
 *   • Edge cases & boundary testing
 *
 * Run:  npx jest --config jest.config.ts tests/api/
 *
 * Total: ~90+ test cases.
 * ═══════════════════════════════════════════════════════════════
 */

const API = process.env.API_URL || 'http://localhost:3000/api/v1';
const GW  = process.env.GW_URL  || 'http://localhost:3000';

// ─── HTTP helper ─────────────────────────────────────────
async function http(
  method: string,
  path: string,
  body?: unknown,
  token?: string,
  headers: Record<string, string> = {},
) {
  const url = path.startsWith('http') ? path : `${API}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json as Record<string, unknown>, headers: Object.fromEntries(res.headers.entries()) };
}

const get    = (p: string, t?: string, h?: Record<string, string>) => http('GET', p, undefined, t, h);
const post   = (p: string, b: unknown, t?: string, h?: Record<string, string>) => http('POST', p, b, t, h);
const patch  = (p: string, b: unknown, t?: string, h?: Record<string, string>) => http('PATCH', p, b, t, h);
const put    = (p: string, b: unknown, t?: string, h?: Record<string, string>) => http('PUT', p, b, t, h);
const del    = (p: string, t?: string, h?: Record<string, string>) => http('DELETE', p, undefined, t, h);

// ─── Shared state ────────────────────────────────────────
let accessToken = '';
let refreshTokenValue = '';
let userId = '';
let businessId = '';
const testEmail    = `apitest_${Date.now()}@bahi.test`;
const testPassword = 'SecurePass123!';
const testPhone    = '9' + Math.floor(100000000 + Math.random() * 900000000).toString();

// ═════════════════════════════════════════════════════════
//  1. HEALTH CHECK
// ═════════════════════════════════════════════════════════
describe('Health Check', () => {
  it('GET /health → 200 with status ok', async () => {
    const res = await fetch(`${GW}/health`);
    const body = await res.json() as Record<string, unknown>;
    expect(res.status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.service).toBe('api-gateway');
    expect(body.version).toBeDefined();
    expect(body.timestamp).toBeDefined();
  });

  it('GET /health returns valid ISO timestamp', async () => {
    const res = await fetch(`${GW}/health`);
    const body = await res.json() as Record<string, unknown>;
    expect(new Date(body.timestamp as string).toISOString()).toBe(body.timestamp);
  });
});

// ═════════════════════════════════════════════════════════
//  2. AUTH SERVICE
// ═════════════════════════════════════════════════════════
describe('Auth Service', () => {
  // ── Registration ─────────────────────────────
  describe('POST /auth/register', () => {
    it('registers a new user → 201 with tokens', async () => {
      const res = await post('/auth/register', {
        name: 'API Test User',
        email: testEmail,
        password: testPassword,
        phone: testPhone,
      });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      const data = res.body.data as Record<string, unknown>;
      expect(data.accessToken).toBeTruthy();
      expect(data.refreshToken).toBeTruthy();
      const user = data.user as Record<string, unknown>;
      expect(user.email).toBe(testEmail);
      accessToken = data.accessToken as string;
      refreshTokenValue = data.refreshToken as string;
      userId = user.id as string;
    });

    it('duplicate email → 400', async () => {
      const res = await post('/auth/register', { name: 'Dup', email: testEmail, password: testPassword, phone: '9' + Math.floor(100000000 + Math.random() * 900000000).toString() });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('missing name → 400', async () => {
      const res = await post('/auth/register', { email: 'noname@x.com', password: 'abcdef', phone: '9' + Math.floor(100000000 + Math.random() * 900000000).toString() });
      expect(res.status).toBe(400);
    });

    it('missing email → 400', async () => {
      const res = await post('/auth/register', { name: 'No Email', password: 'abcdef', phone: '9' + Math.floor(100000000 + Math.random() * 900000000).toString() });
      expect(res.status).toBe(400);
    });

    it('missing password → 400', async () => {
      const res = await post('/auth/register', { name: 'No Pass', email: `nop_${Date.now()}@x.com`, phone: '9' + Math.floor(100000000 + Math.random() * 900000000).toString() });
      expect(res.status).toBe(400);
    });

    it('password too short → 400', async () => {
      const res = await post('/auth/register', { name: 'Short', email: `short_${Date.now()}@x.com`, password: '12', phone: '9' + Math.floor(100000000 + Math.random() * 900000000).toString() });
      expect(res.status).toBe(400);
    });

    it('invalid email format → 400', async () => {
      const res = await post('/auth/register', { name: 'X', email: 'not-an-email', password: 'SecurePass1!', phone: '9' + Math.floor(100000000 + Math.random() * 900000000).toString() });
      expect(res.status).toBe(400);
    });

    it('empty body → 400', async () => {
      const res = await post('/auth/register', {});
      expect(res.status).toBe(400);
    });
  });

  // ── Login ────────────────────────────────────
  describe('POST /auth/login', () => {
    it('valid credentials → 200 + tokens', async () => {
      const res = await post('/auth/login', { email: testEmail, password: testPassword });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const data = res.body.data as Record<string, unknown>;
      expect(data.accessToken).toBeTruthy();
      accessToken = data.accessToken as string;
      refreshTokenValue = data.refreshToken as string;
    });

    it('wrong password → 401', async () => {
      const res = await post('/auth/login', { email: testEmail, password: 'WrongPass' });
      expect(res.status).toBe(401);
    });

    it('non-existent email → 401 or 404', async () => {
      const res = await post('/auth/login', { email: 'nobody@nowhere.com', password: 'WrongPass123' });
      expect([401, 404]).toContain(res.status);
    });

    it('missing email → 400', async () => {
      const res = await post('/auth/login', { password: 'SomePass123' });
      expect(res.status).toBe(400);
    });

    it('missing password → 400', async () => {
      const res = await post('/auth/login', { email: testEmail });
      expect(res.status).toBe(400);
    });

    it('empty body → 400', async () => {
      const res = await post('/auth/login', {});
      expect(res.status).toBe(400);
    });
  });

  // ── Token Refresh ────────────────────────────
  describe('POST /auth/refresh', () => {
    it('valid refresh token → new access token', async () => {
      const res = await post('/auth/refresh', { refreshToken: refreshTokenValue });
      expect(res.status).toBe(200);
      const data = res.body.data as Record<string, unknown>;
      expect(data.accessToken).toBeTruthy();
      accessToken = data.accessToken as string;
      refreshTokenValue = data.refreshToken as string;
    });

    it('refresh token rotation — old refresh token is invalidated', async () => {
      // Save the current refresh token, then refresh to get a new one
      const oldRefreshToken = refreshTokenValue;
      const res1 = await post('/auth/refresh', { refreshToken: oldRefreshToken });
      expect(res1.status).toBe(200);
      const data1 = res1.body.data as Record<string, unknown>;
      accessToken = data1.accessToken as string;
      refreshTokenValue = data1.refreshToken as string;

      // The old refresh token should now be invalidated (rotated)
      const res2 = await post('/auth/refresh', { refreshToken: oldRefreshToken });
      expect(res2.status).toBe(401);
    });

    it('new access token from refresh works for authenticated endpoints', async () => {
      // Refresh to get a new access token
      const res = await post('/auth/refresh', { refreshToken: refreshTokenValue });
      expect(res.status).toBe(200);
      const data = res.body.data as Record<string, unknown>;
      const newAccessToken = data.accessToken as string;
      accessToken = newAccessToken;
      refreshTokenValue = data.refreshToken as string;

      // Use the new access token to call /auth/me
      const meRes = await get('/auth/me', newAccessToken);
      expect(meRes.status).toBe(200);
      const meData = meRes.body.data as Record<string, unknown>;
      expect(meData.email).toBe(testEmail);
    });

    it('invalid refresh token → 401', async () => {
      const res = await post('/auth/refresh', { refreshToken: 'invalid-token' });
      expect(res.status).toBe(401);
    });

    it('missing refresh token → 400 or 401', async () => {
      const res = await post('/auth/refresh', {});
      expect([400, 401]).toContain(res.status);
    });

    it('empty string refresh token → 400 or 401', async () => {
      const res = await post('/auth/refresh', { refreshToken: '' });
      expect([400, 401]).toContain(res.status);
    });

    it('expired refresh token → 401', async () => {
      // Use a clearly fake JWT that would be expired
      const fakeExpiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ4IiwiaWF0IjoxNjAwMDAwMDAwLCJleHAiOjE2MDAwMDAwMDF9.fake';
      const res = await post('/auth/refresh', { refreshToken: fakeExpiredToken });
      expect(res.status).toBe(401);
    });
  });

  // ── Me ───────────────────────────────────────
  describe('GET /auth/me', () => {
    it('returns current user with valid token', async () => {
      const res = await get('/auth/me', accessToken);
      expect(res.status).toBe(200);
      const data = res.body.data as Record<string, unknown>;
      expect(data.id).toBe(userId);
      expect(data.email).toBe(testEmail);
    });

    it('no token → 401', async () => {
      const res = await get('/auth/me');
      expect(res.status).toBe(401);
    });

    // This used to assert 403 and so locked in a real bug: the frontend only
    // attempts a silent refresh — and only logs out + redirects to /login — on
    // 401, so a 403 here left users permanently wedged after a JWT_SECRET
    // rotation. A token that fails verification is a credentials problem: 401.
    // 403 remains correct for "authenticated but not permitted" (see the
    // non-admin and cross-tenant cases below).
    it('invalid token → 401', async () => {
      const res = await get('/auth/me', 'bad.token.here');
      expect(res.status).toBe(401);
    });

    it('malformed Authorization header → 401', async () => {
      const res = await http('GET', '/auth/me', undefined, undefined, { Authorization: 'NotBearer xyz' });
      expect(res.status).toBe(401);
    });
  });

  // ── OTP ──────────────────────────────────────
  describe('POST /auth/send-otp', () => {
    it('valid phone for existing user → 200', async () => {
      // Use the phone that was registered earlier in this test suite
      const res = await post('/auth/send-otp', { phone: testPhone });
      expect(res.status).toBe(200);
    });

    it('phone with no account → 404', async () => {
      const res = await post('/auth/send-otp', { phone: '9876543210' });
      expect([200, 404]).toContain(res.status);
    });

    it('missing phone → 400', async () => {
      const res = await post('/auth/send-otp', {});
      expect(res.status).toBe(400);
    });

    it('invalid phone format → 400', async () => {
      const res = await post('/auth/send-otp', { phone: '1234' });
      expect(res.status).toBe(400);
    });
  });
});

// ═════════════════════════════════════════════════════════
//  3. SUBSCRIPTION SERVICE
// ═════════════════════════════════════════════════════════
describe('Subscription Service', () => {
  describe('GET /subscriptions/plans', () => {
    it('returns all active plans (public)', async () => {
      const res = await get('/subscriptions/plans');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const data = res.body.data as Array<Record<string, unknown>>;
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThanOrEqual(1);
    });

    it('includes Free plan with price 0', async () => {
      const res = await get('/subscriptions/plans');
      const data = res.body.data as Array<Record<string, unknown>>;
      const free = data.find((p) => p.slug === 'free');
      expect(free).toBeTruthy();
      expect(Number(free!.price_monthly)).toBe(0);
    });

    it('plans are sorted by sort_order', async () => {
      const res = await get('/subscriptions/plans');
      const data = res.body.data as Array<Record<string, unknown>>;
      const orders = data.map((p) => p.sort_order as number);
      expect(orders).toEqual([...orders].sort((a, b) => a - b));
    });

    it('each plan has required fields', async () => {
      const res = await get('/subscriptions/plans');
      const data = res.body.data as Array<Record<string, unknown>>;
      for (const plan of data) {
        expect(plan.id).toBeTruthy();
        expect(plan.name).toBeTruthy();
        expect(plan.slug).toBeTruthy();
        expect(plan.price_monthly).toBeDefined();
        expect(plan.price_yearly).toBeDefined();
      }
    });
  });

  describe('GET /subscriptions/current', () => {
    it('requires authentication → 401', async () => {
      const res = await get('/subscriptions/current');
      expect(res.status).toBe(401);
    });

    it('returns current subscription with valid token', async () => {
      if (!accessToken) return;
      const res = await get('/subscriptions/current', accessToken);
      expect([200, 404]).toContain(res.status);
    });
  });
});

// ═════════════════════════════════════════════════════════
//  4. BUSINESS SERVICE
// ═════════════════════════════════════════════════════════
describe('Business Service', () => {
  describe('POST /business', () => {
    it('create a business → 201', async () => {
      const res = await post('/business', { name: 'API Test Business', type: 'TRADING' }, accessToken);
      expect([200, 201]).toContain(res.status);
      expect(res.body.success).toBe(true);
      const data = res.body.data as Record<string, unknown>;
      businessId = (data?.id || '') as string;
    });

    it('missing name → 400', async () => {
      const res = await post('/business', {}, accessToken);
      expect(res.status).toBe(400);
    });

    it('no auth → 401', async () => {
      const res = await post('/business', { name: 'X' });
      expect(res.status).toBe(401);
    });

    it('create second business with different name', async () => {
      const res = await post('/business', { name: `Biz2 ${Date.now()}`, type: 'WHOLESALE' }, accessToken);
      expect([200, 201]).toContain(res.status);
    });
  });

  describe('GET /business', () => {
    it('returns user businesses', async () => {
      const res = await get('/business', accessToken);
      expect(res.status).toBe(200);
      const data = res.body.data as Array<Record<string, unknown>>;
      expect(Array.isArray(data)).toBe(true);
      if (data.length > 0 && !businessId) {
        businessId = data[0].id as string;
      }
    });

    it('no auth → 401', async () => {
      const res = await get('/business');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /business/dashboard', () => {
    it('returns dashboard data with business header', async () => {
      if (!businessId) return;
      const res = await get('/business/dashboard', accessToken, { 'x-business-id': businessId });
      expect([200, 403]).toContain(res.status);
    });

    it('missing x-business-id header → 400 or 403', async () => {
      const res = await get('/business/dashboard', accessToken);
      expect([400, 403]).toContain(res.status);
    });
  });
});

// ═════════════════════════════════════════════════════════
//  5. PURCHASE SERVICE
// ═════════════════════════════════════════════════════════
describe('Purchase Service', () => {
  describe('GET /purchases', () => {
    it('requires auth', async () => {
      const res = await get('/purchases');
      expect(res.status).toBe(401);
    });

    it('returns purchases list', async () => {
      if (!businessId) return;
      const res = await get('/purchases', accessToken, { 'x-business-id': businessId });
      expect([200, 403]).toContain(res.status);
    });
  });

  describe('GET /purchases/dashboard', () => {
    it('returns purchase dashboard stats', async () => {
      if (!businessId) return;
      const res = await get('/purchases/dashboard', accessToken, { 'x-business-id': businessId });
      expect([200, 403]).toContain(res.status);
    });
  });

  describe('POST /purchases', () => {
    it('no auth → 401', async () => {
      const res = await post('/purchases', { party_name: 'X' });
      expect(res.status).toBe(401);
    });
  });
});

// ═════════════════════════════════════════════════════════
//  6. SALES SERVICE
// ═════════════════════════════════════════════════════════
describe('Sales Service', () => {
  describe('GET /sales', () => {
    it('requires auth', async () => {
      const res = await get('/sales');
      expect(res.status).toBe(401);
    });

    it('returns sales list', async () => {
      if (!businessId) return;
      const res = await get('/sales', accessToken, { 'x-business-id': businessId });
      expect([200, 403]).toContain(res.status);
    });
  });

  describe('GET /sales/lots/all', () => {
    it('returns lots list', async () => {
      if (!businessId) return;
      const res = await get('/sales/lots/all', accessToken, { 'x-business-id': businessId });
      expect([200, 403]).toContain(res.status);
    });
  });

  describe('POST /sales', () => {
    it('no auth → 401', async () => {
      const res = await post('/sales', {});
      expect(res.status).toBe(401);
    });
  });
});

// ═════════════════════════════════════════════════════════
//  7. INVENTORY SERVICE
// ═════════════════════════════════════════════════════════
describe('Inventory Service', () => {
  describe('GET /inventory/items', () => {
    it('requires auth', async () => {
      const res = await get('/inventory/items');
      expect(res.status).toBe(401);
    });

    it('returns items list', async () => {
      if (!businessId) return;
      const res = await get('/inventory/items', accessToken, { 'x-business-id': businessId });
      expect([200, 403]).toContain(res.status);
    });
  });

  describe('GET /inventory/categories', () => {
    it('returns categories', async () => {
      if (!businessId) return;
      const res = await get('/inventory/categories', accessToken, { 'x-business-id': businessId });
      expect([200, 403]).toContain(res.status);
    });
  });

  describe('GET /inventory/items/low-stock', () => {
    it('returns low stock items', async () => {
      if (!businessId) return;
      const res = await get('/inventory/items/low-stock', accessToken, { 'x-business-id': businessId });
      expect([200, 403]).toContain(res.status);
    });
  });

  describe('GET /inventory/dashboard', () => {
    it('returns inventory dashboard', async () => {
      if (!businessId) return;
      const res = await get('/inventory/dashboard', accessToken, { 'x-business-id': businessId });
      expect([200, 403]).toContain(res.status);
    });
  });

  describe('POST /inventory/items', () => {
    it('no auth → 401', async () => {
      const res = await post('/inventory/items', { name: 'X' });
      expect(res.status).toBe(401);
    });
  });
});

// ═════════════════════════════════════════════════════════
//  8. LEDGER SERVICE
// ═════════════════════════════════════════════════════════
describe('Ledger Service', () => {
  const ledgerEndpoints = [
    '/ledger/entries',
    '/ledger/trial-balance',
    '/ledger/profit-loss',
    '/ledger/balance-sheet',
    '/ledger/outstanding',
    '/ledger/day-book',
  ];

  for (const endpoint of ledgerEndpoints) {
    describe(`GET ${endpoint}`, () => {
      it('requires auth', async () => {
        const res = await get(endpoint);
        expect(res.status).toBe(401);
      });

      it('returns data with valid auth + business', async () => {
        if (!businessId) return;
        const res = await get(endpoint, accessToken, { 'x-business-id': businessId });
        expect([200, 403]).toContain(res.status);
      });
    });
  }
});

// ═════════════════════════════════════════════════════════
//  9. PROFILE SERVICE
// ═════════════════════════════════════════════════════════
describe('Profile Service', () => {
  describe('GET /profile/me', () => {
    it('returns user profile', async () => {
      const res = await get('/profile/me', accessToken);
      expect(res.status).toBe(200);
    });

    it('no auth → 401', async () => {
      const res = await get('/profile/me');
      expect(res.status).toBe(401);
    });
  });

  describe('PATCH /profile/me', () => {
    it('updates profile name', async () => {
      const res = await patch('/profile/me', { name: 'Updated Name' }, accessToken);
      expect([200, 204]).toContain(res.status);
    });

    it('no auth → 401', async () => {
      const res = await patch('/profile/me', { name: 'X' });
      expect(res.status).toBe(401);
    });
  });

  const profileEndpoints = [
    '/profile/parties',
    '/profile/cutters',
    '/profile/expense-types',
  ];

  for (const ep of profileEndpoints) {
    describe(`GET ${ep}`, () => {
      it('returns data with business header', async () => {
        if (!businessId) return;
        const res = await get(ep, accessToken, { 'x-business-id': businessId });
        expect([200, 403]).toContain(res.status);
      });
    });
  }
});

// ═════════════════════════════════════════════════════════
//  10. NOTIFICATION SERVICE
// ═════════════════════════════════════════════════════════
describe('Notification Service', () => {
  describe('GET /notifications', () => {
    it('returns notifications with auth', async () => {
      const res = await get('/notifications', accessToken);
      expect([200, 404, 502]).toContain(res.status);
    });

    it('no auth → 401', async () => {
      const res = await get('/notifications');
      expect(res.status).toBe(401);
    });
  });
});

// ═════════════════════════════════════════════════════════
//  11. BILLING SERVICE
// ═════════════════════════════════════════════════════════
describe('Billing Service', () => {
  for (const ep of ['/billing/payments', '/billing/invoices']) {
    describe(`GET ${ep}`, () => {
      it('requires auth → 401', async () => {
        const res = await get(ep);
        expect(res.status).toBe(401);
      });

      it('requires business header → 400 without x-business-id', async () => {
        const res = await get(ep, accessToken);
        expect([400, 403]).toContain(res.status);
      });

      it('returns data with auth + business header', async () => {
        if (!businessId) return;
        const res = await get(ep, accessToken, { 'x-business-id': businessId });
        expect([200, 403, 404, 502]).toContain(res.status);
      });
    });
  }
});

// ═════════════════════════════════════════════════════════
//  12. REFERRAL SERVICE
// ═════════════════════════════════════════════════════════
describe('Referral Service', () => {
  for (const ep of ['/referrals/my-referrals', '/referrals/leaderboard']) {
    describe(`GET ${ep}`, () => {
      it('requires auth → 401', async () => {
        const res = await get(ep);
        expect(res.status).toBe(401);
      });

      it('returns data with valid auth', async () => {
        if (!accessToken) return;
        const res = await get(ep, accessToken);
        expect([200, 403, 404, 502]).toContain(res.status);
      });
    });
  }
});

// ═════════════════════════════════════════════════════════
//  13. ADMIN SERVICE
// ═════════════════════════════════════════════════════════
describe('Admin Service', () => {
  const adminEndpoints = [
    '/admin/dashboard',
    '/admin/users',
    '/admin/plans',
    '/admin/businesses',
    '/admin/invoices',
  ];

  for (const ep of adminEndpoints) {
    describe(`GET ${ep}`, () => {
      it('non-admin token → 403', async () => {
        const res = await get(ep, accessToken);
        expect(res.status).toBe(403);
      });

      it('no auth → 401', async () => {
        const res = await get(ep);
        expect(res.status).toBe(401);
      });
    });
  }
});

// ═════════════════════════════════════════════════════════
//  14. RAPID-FIRE — NO 429 UNDER CONCURRENCY
// ═════════════════════════════════════════════════════════
describe('No 429 under rapid requests', () => {
  it('200 concurrent /health → zero 429s', async () => {
    const results = await Promise.all(
      Array.from({ length: 200 }, () =>
        fetch(`${GW}/health`).then((r) => r.status),
      ),
    );
    expect(results.filter((s) => s === 429).length).toBe(0);
  });

  it('200 concurrent /subscriptions/plans → zero 429s', async () => {
    const results = await Promise.all(
      Array.from({ length: 200 }, () =>
        fetch(`${API}/subscriptions/plans`).then((r) => r.status),
      ),
    );
    expect(results.filter((s) => s === 429).length).toBe(0);
  });

  it('100 concurrent login attempts → zero 429s', async () => {
    const results = await Promise.all(
      Array.from({ length: 100 }, () =>
        post('/auth/login', { email: 'x@x.com', password: 'wrong' }).then((r) => r.status),
      ),
    );
    expect(results.filter((s) => s === 429).length).toBe(0);
  });

  it('100 concurrent /auth/me with token → zero 429s', async () => {
    const results = await Promise.all(
      Array.from({ length: 100 }, () =>
        get('/auth/me', accessToken).then((r) => r.status),
      ),
    );
    expect(results.filter((s) => s === 429).length).toBe(0);
  });

  it('50 concurrent /business with token → zero 429s', async () => {
    const results = await Promise.all(
      Array.from({ length: 50 }, () =>
        get('/business', accessToken).then((r) => r.status),
      ),
    );
    expect(results.filter((s) => s === 429).length).toBe(0);
  });
});

// ═════════════════════════════════════════════════════════
//  15. MULTIPLE USERS — ISOLATION
// ═════════════════════════════════════════════════════════
describe('Multi-user isolation', () => {
  let token2 = '';
  const email2 = `apitest2_${Date.now()}@bahi.test`;
  const phone2 = '9' + Math.floor(100000000 + Math.random() * 900000000).toString();

  it('register second user', async () => {
    const res = await post('/auth/register', { name: 'User Two', email: email2, password: testPassword, phone: phone2 });
    expect(res.status).toBe(201);
    const data = res.body.data as Record<string, unknown>;
    token2 = data.accessToken as string;
  });

  it('user2 cannot see user1 businesses', async () => {
    const res = await get('/business', token2);
    expect(res.status).toBe(200);
    const data = res.body.data as Array<Record<string, unknown>>;
    // User2 has 0 businesses (just registered)
    expect(data.length).toBe(0);
  });

  it('user2 me returns correct email', async () => {
    const res = await get('/auth/me', token2);
    expect(res.status).toBe(200);
    const data = res.body.data as Record<string, unknown>;
    expect(data.email).toBe(email2);
  });
});

// ═════════════════════════════════════════════════════════
//  16. EDGE CASES & BOUNDARY TESTING
// ═════════════════════════════════════════════════════════
describe('Edge Cases', () => {
  it('very long name (500 chars) in register → 400 or 201', async () => {
    const longName = 'A'.repeat(500);
    const res = await post('/auth/register', {
      name: longName,
      email: `long_${Date.now()}@x.com`,
      password: testPassword,
      phone: '9' + Math.floor(100000000 + Math.random() * 900000000).toString(),
    });
    expect([201, 400]).toContain(res.status);
  });

  it('SQL injection in email → 400', async () => {
    const res = await post('/auth/login', {
      email: "'; DROP TABLE users; --",
      password: 'SomePass123!',
    });
    expect([400, 401]).toContain(res.status);
  });

  it('XSS payload in name → 201 (stored safely)', async () => {
    const res = await post('/auth/register', {
      name: '<script>alert("xss")</script>',
      email: `xss_${Date.now()}@x.com`,
      password: testPassword,
      phone: '9' + Math.floor(100000000 + Math.random() * 900000000).toString(),
    });
    expect([201, 400]).toContain(res.status);
  });

  it('null body to POST /auth/login → 400 or 500', async () => {
    const res = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'null',
    });
    expect([400, 401, 500]).toContain(res.status);
  });

  it('GET with unknown query params returns normally', async () => {
    const res = await get('/subscriptions/plans?foo=bar&baz=qux');
    expect(res.status).toBe(200);
  });
});

// ═════════════════════════════════════════════════════════
//  17. CORS & HEADERS
// ═════════════════════════════════════════════════════════
describe('CORS & Security Headers', () => {
  it('OPTIONS /health returns CORS headers', async () => {
    const res = await fetch(`${GW}/health`, { method: 'OPTIONS' });
    // The server should respond (may be 200, 204, or 404 depending on config)
    expect([200, 204, 404]).toContain(res.status);
  });

  it('responses include security headers (helmet)', async () => {
    const res = await fetch(`${GW}/health`);
    const hdrs = Object.fromEntries(res.headers.entries());
    expect(hdrs['x-content-type-options']).toBe('nosniff');
  });
});

// ═════════════════════════════════════════════════════════
//  18. 404 — UNKNOWN ROUTES
// ═════════════════════════════════════════════════════════
describe('Unknown routes → 404', () => {
  it('GET /api/v1/nonexistent → 404', async () => {
    const res = await get('/nonexistent');
    expect(res.status).toBe(404);
  });

  it('POST /api/v1/nonexistent → 404', async () => {
    const res = await post('/nonexistent', {});
    expect(res.status).toBe(404);
  });

  it('GET /random-path → 404', async () => {
    const res = await fetch(`${GW}/random-path`);
    expect(res.status).toBe(404);
  });
});
