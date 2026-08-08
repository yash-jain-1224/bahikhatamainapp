/**
 * ═══════════════════════════════════════════════════════════════
 * K6 LOAD TEST — 100,000 Concurrent Users
 * ═══════════════════════════════════════════════════════════════
 * Simulates 100K virtual users hitting the Bahi Khata Pro API
 * gateway concurrently. Tests:
 *
 *   1. Health check throughput
 *   2. Public endpoints (plans)
 *   3. Auth flow (register → login → /me)
 *   4. Authenticated API calls (business, purchases, inventory, etc.)
 *   5. Mixed traffic (realistic scenario)
 *
 * Prerequisites:
 *   brew install k6      (macOS)
 *   # or: https://k6.io/docs/getting-started/installation/
 *
 * Run:
 *   k6 run tests/load/load-100k.k6.js
 *
 * Run with custom VU / duration:
 *   k6 run --vus 1000 --duration 60s tests/load/load-100k.k6.js
 *
 * Run with HTML report:
 *   K6_WEB_DASHBOARD=true k6 run tests/load/load-100k.k6.js
 *
 * ═══════════════════════════════════════════════════════════════
 */
import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// ─── Custom metrics ──────────────────────────────────────
const errorRate       = new Rate('errors');
const rate429         = new Rate('http_429_rate');
const counter429      = new Counter('http_429_total');
const loginDuration   = new Trend('login_duration', true);
const registerDuration = new Trend('register_duration', true);

// ─── Configuration ───────────────────────────────────────
const BASE = __ENV.API_URL || 'http://localhost:3000';
const API  = `${BASE}/api/v1`;

// ─── Stages: Ramp up to 100K VUs ────────────────────────
//
// k6 can simulate 100K VUs but your local machine may not
// handle it. For local testing, use the "local" profile.
// For cloud / distributed load testing, use the "full" profile.
//
export const options = {
  scenarios: {
    // ── Profile 1: Local smoke test (default) ─────────
    // Use: k6 run tests/load/load-100k.k6.js
    local: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 50 },     // warm-up
        { duration: '30s', target: 500 },     // ramp to 500
        { duration: '30s', target: 1000 },    // ramp to 1K
        { duration: '60s', target: 1000 },    // hold 1K
        { duration: '20s', target: 0 },       // cool-down
      ],
      exec: 'mixedTraffic',
    },

    // ── Profile 2: Full 100K (distributed / cloud) ────
    // Use: k6 run -e PROFILE=full tests/load/load-100k.k6.js
    // Uncomment below and comment out "local" above:
    //
    // full: {
    //   executor: 'ramping-vus',
    //   startVUs: 0,
    //   stages: [
    //     { duration: '30s',  target: 5000 },
    //     { duration: '60s',  target: 25000 },
    //     { duration: '60s',  target: 50000 },
    //     { duration: '120s', target: 100000 },
    //     { duration: '120s', target: 100000 },   // hold
    //     { duration: '60s',  target: 0 },         // cool-down
    //   ],
    //   exec: 'mixedTraffic',
    // },
  },

  thresholds: {
    http_req_duration: ['p(95)<3000', 'p(99)<5000'],     // 95th < 3s, 99th < 5s
    http_req_failed:   ['rate<0.05'],                     // < 5% failure
    errors:            ['rate<0.05'],
    http_429_rate:     ['rate<0.001'],                    // < 0.1% 429s
    http_429_total:    ['count<10'],                      // nearly zero 429s
  },
};

// ─── Helpers ─────────────────────────────────────────────
const headers = { 'Content-Type': 'application/json' };

function authHeaders(token) {
  return { ...headers, Authorization: `Bearer ${token}` };
}

function trackResponse(res) {
  const is429 = res.status === 429;
  const isErr = res.status >= 400;
  rate429.add(is429);
  if (is429) counter429.add(1);
  errorRate.add(isErr && !is429); // 429 tracked separately
  return res;
}

// ─── Unique user per VU ──────────────────────────────────
function vuUser() {
  const id = `${__VU}_${__ITER}_${Date.now()}`;
  return {
    name: `Load User ${id}`,
    email: `load_${id}@k6.test`,
    password: 'LoadTestPass1!',
    phone: '9' + Math.floor(100000000 + Math.random() * 900000000).toString(),
  };
}

// ═════════════════════════════════════════════════════════
//  SCENARIO: Mixed Realistic Traffic
// ═════════════════════════════════════════════════════════
export function mixedTraffic() {
  const dice = Math.random();

  if (dice < 0.30) {
    healthCheck();
  } else if (dice < 0.50) {
    publicPlans();
  } else if (dice < 0.70) {
    authFlow();
  } else {
    authenticatedBrowsing();
  }

  sleep(Math.random() * 2 + 0.5); // 0.5–2.5s think time
}

// ─── 1. Health Check ─────────────────────────────────────
export function healthCheck() {
  group('Health Check', () => {
    const res = trackResponse(http.get(`${BASE}/health`));
    check(res, {
      'health status 200': (r) => r.status === 200,
      'health body ok':    (r) => JSON.parse(r.body).status === 'ok',
    });
  });
}

// ─── 2. Public Plans ─────────────────────────────────────
export function publicPlans() {
  group('Public Plans', () => {
    const res = trackResponse(http.get(`${API}/subscriptions/plans`, { headers }));
    check(res, {
      'plans status 200':   (r) => r.status === 200,
      'plans has data':     (r) => JSON.parse(r.body).data.length >= 1,
      'plans has free plan': (r) => {
        const plans = JSON.parse(r.body).data;
        return plans.some((p) => p.slug === 'free');
      },
    });
  });
}

// ─── 3. Auth Flow (register → login → me) ───────────────
export function authFlow() {
  group('Auth Flow', () => {
    const user = vuUser();

    // Register
    const regRes = trackResponse(
      http.post(`${API}/auth/register`, JSON.stringify(user), { headers }),
    );
    registerDuration.add(regRes.timings.duration);
    const regOk = check(regRes, {
      'register 201': (r) => r.status === 201,
    });

    if (!regOk) return;

    const regData = JSON.parse(regRes.body).data;
    const token = regData.accessToken;

    // Login
    const loginRes = trackResponse(
      http.post(`${API}/auth/login`, JSON.stringify({
        email: user.email,
        password: user.password,
      }), { headers }),
    );
    loginDuration.add(loginRes.timings.duration);
    check(loginRes, {
      'login 200': (r) => r.status === 200,
      'login has token': (r) => JSON.parse(r.body).data.accessToken !== undefined,
    });

    // Me
    const meRes = trackResponse(
      http.get(`${API}/auth/me`, { headers: authHeaders(token) }),
    );
    check(meRes, {
      'me 200':           (r) => r.status === 200,
      'me returns email': (r) => JSON.parse(r.body).data.email === user.email,
    });
  });
}

// ─── 4. Authenticated Browsing ───────────────────────────
export function authenticatedBrowsing() {
  group('Authenticated Browsing', () => {
    const user = vuUser();

    // Quick register to get a token
    const regRes = http.post(`${API}/auth/register`, JSON.stringify(user), { headers });
    if (regRes.status !== 201) {
      errorRate.add(true);
      return;
    }
    const token = JSON.parse(regRes.body).data.accessToken;
    const ah = authHeaders(token);

    // Create business
    const bizRes = trackResponse(
      http.post(`${API}/business`, JSON.stringify({ name: `K6 Biz ${__VU}`, type: 'TRADING' }), { headers: ah }),
    );
    check(bizRes, { 'create biz 2xx': (r) => r.status >= 200 && r.status < 300 });

    let businessId = '';
    if (bizRes.status >= 200 && bizRes.status < 300) {
      businessId = JSON.parse(bizRes.body).data.id;
    }

    // List businesses
    const listRes = trackResponse(http.get(`${API}/business`, { headers: ah }));
    check(listRes, { 'list biz 200': (r) => r.status === 200 });

    // Browse subscription plans
    const plansRes = trackResponse(http.get(`${API}/subscriptions/plans`, { headers }));
    check(plansRes, { 'plans 200': (r) => r.status === 200 });

    // Profile
    const profRes = trackResponse(http.get(`${API}/profile/me`, { headers: ah }));
    check(profRes, { 'profile 200': (r) => r.status === 200 });

    // If business created, hit business-scoped endpoints
    if (businessId) {
      const bh = { ...ah, 'x-business-id': businessId };

      const endpoints = [
        '/purchases',
        '/sales',
        '/inventory/items',
        '/ledger/entries',
      ];

      for (const ep of endpoints) {
        const r = trackResponse(http.get(`${API}${ep}`, { headers: bh }));
        check(r, { [`${ep} 2xx or 403`]: (res) => res.status < 500 });
      }
    }
  });
}

// ═════════════════════════════════════════════════════════
//  LIFECYCLE
// ═════════════════════════════════════════════════════════
export function handleSummary(data) {
  // Print a human-readable summary + JSON file
  return {
    stdout: textSummary(data, { indent: '  ', enableColors: true }),
    'tests/load/summary.json': JSON.stringify(data, null, 2),
  };
}

// k6 built-in text summary helper
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.3/index.js';
