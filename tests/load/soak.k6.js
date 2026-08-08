/**
 * ═══════════════════════════════════════════════════════════════
 * K6 SOAK (ENDURANCE) TEST — Sustained High Load
 * ═══════════════════════════════════════════════════════════════
 * Maintains steady load over an extended period to detect:
 *   • Memory leaks
 *   • Connection pool exhaustion
 *   • Gradual performance degradation
 *   • Database connection saturation
 *
 * Run (scaled down for local):
 *   k6 run tests/load/soak.k6.js
 *
 * Run full soak (30 minutes):
 *   k6 run -e PROFILE=full tests/load/soak.k6.js
 *
 * ═══════════════════════════════════════════════════════════════
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Counter, Trend } from 'k6/metrics';

const rate429    = new Rate('http_429_rate');
const counter429 = new Counter('http_429_total');
const errorRate  = new Rate('errors');
const respTime   = new Trend('response_time', true);

const BASE = __ENV.API_URL || 'http://localhost:3000';
const API  = `${BASE}/api/v1`;
const headers = { 'Content-Type': 'application/json' };

const isFull = __ENV.PROFILE === 'full';

export const options = {
  scenarios: {
    soak: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: isFull
        ? [
            { duration: '2m',  target: 5000 },     // ramp up
            { duration: '25m', target: 5000 },     // sustain 5K for 25 minutes
            { duration: '3m',  target: 0 },        // cool down
          ]
        : [
            { duration: '15s', target: 200 },
            { duration: '2m',  target: 200 },       // sustain 200 locally
            { duration: '15s', target: 0 },
          ],
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<2000', 'p(99)<4000'],
    http_req_failed:   ['rate<0.02'],              // tighter: < 2%
    http_429_rate:     ['rate<0.001'],
    http_429_total:    ['count<5'],
    errors:            ['rate<0.02'],
  },
};

function track(res) {
  const is429 = res.status === 429;
  rate429.add(is429);
  if (is429) counter429.add(1);
  errorRate.add(res.status >= 400 && !is429);
  respTime.add(res.timings.duration);
}

export default function () {
  // Realistic browsing pattern
  const pick = Math.random();

  if (pick < 0.30) {
    const r = http.get(`${BASE}/health`);
    track(r);
    check(r, { 'health 200': (res) => res.status === 200 });

  } else if (pick < 0.55) {
    const r = http.get(`${API}/subscriptions/plans`, { headers });
    track(r);
    check(r, { 'plans 200': (res) => res.status === 200 });

  } else if (pick < 0.75) {
    // Login (401 expected for fake user — tests auth service throughput)
    const r = http.post(`${API}/auth/login`, JSON.stringify({
      email: `soak_${__VU}@k6.test`,
      password: 'SoakTest1!',
    }), { headers });
    track(r);
    check(r, { 'login responds': (res) => res.status < 500 });

  } else {
    // Register new user
    const r = http.post(`${API}/auth/register`, JSON.stringify({
      name: `Soak ${__VU}_${__ITER}`,
      email: `soak_${__VU}_${__ITER}_${Date.now()}@k6.test`,
      password: 'SoakTest1!',
      phone: '9' + Math.floor(100000000 + Math.random() * 900000000).toString(),
    }), { headers });
    track(r);
    check(r, { 'register responds': (res) => res.status < 500 });
  }

  sleep(Math.random() * 3 + 1); // 1–4s think time (realistic)
}

export function handleSummary(data) {
  return {
    stdout: textSummary(data, { indent: '  ', enableColors: true }),
    'tests/load/soak-summary.json': JSON.stringify(data, null, 2),
  };
}

import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.3/index.js';
