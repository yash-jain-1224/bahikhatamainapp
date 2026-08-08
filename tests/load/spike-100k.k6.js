/**
 * ═══════════════════════════════════════════════════════════════
 * K6 SPIKE TEST — 100,000 Concurrent Users Burst
 * ═══════════════════════════════════════════════════════════════
 * Simulates a sudden spike to 100K VUs to test system stability
 * under extreme load. Focuses on:
 *   • Zero 429 errors (rate-limiting removed)
 *   • Response time < 5s at p99
 *   • Error rate < 5%
 *   • System recovery after spike
 *
 * Run locally (scaled down):
 *   k6 run tests/load/spike-100k.k6.js
 *
 * Run full 100K (needs distributed execution):
 *   k6 run -e PROFILE=full tests/load/spike-100k.k6.js
 *
 * ═══════════════════════════════════════════════════════════════
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Counter } from 'k6/metrics';

const rate429    = new Rate('http_429_rate');
const counter429 = new Counter('http_429_total');
const errorRate  = new Rate('errors');

const BASE = __ENV.API_URL || 'http://localhost:3000';
const API  = `${BASE}/api/v1`;
const headers = { 'Content-Type': 'application/json' };

// ─── Choose profile based on env ─────────────────────────
const isFull = __ENV.PROFILE === 'full';

export const options = {
  scenarios: {
    spike: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: isFull
        ? [
            { duration: '15s',  target: 10000 },
            { duration: '30s',  target: 50000 },
            { duration: '15s',  target: 100000 },   // SPIKE
            { duration: '120s', target: 100000 },    // HOLD at 100K
            { duration: '30s',  target: 10000 },     // recover
            { duration: '15s',  target: 0 },
          ]
        : [
            { duration: '10s', target: 100 },
            { duration: '10s', target: 500 },
            { duration: '5s',  target: 1000 },       // local spike
            { duration: '30s', target: 1000 },        // hold
            { duration: '10s', target: 0 },
          ],
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<3000', 'p(99)<5000'],
    http_req_failed:   ['rate<0.05'],
    http_429_rate:     ['rate<0.001'],
    http_429_total:    ['count<10'],
    errors:            ['rate<0.05'],
  },
};

function track(res) {
  const is429 = res.status === 429;
  rate429.add(is429);
  if (is429) counter429.add(1);
  errorRate.add(res.status >= 400 && !is429);
}

export default function () {
  const pick = Math.random();

  if (pick < 0.35) {
    // Health check — lightest endpoint
    const r = http.get(`${BASE}/health`);
    track(r);
    check(r, { 'health 200': (res) => res.status === 200 });

  } else if (pick < 0.60) {
    // Public plans
    const r = http.get(`${API}/subscriptions/plans`, { headers });
    track(r);
    check(r, { 'plans 200': (res) => res.status === 200 });

  } else if (pick < 0.80) {
    // Login attempt (will be 401 for fake users — tests auth throughput)
    const r = http.post(`${API}/auth/login`, JSON.stringify({
      email: `spike_${__VU}@k6.test`,
      password: 'SpikeTest1!',
    }), { headers });
    track(r);
    check(r, { 'login responds': (res) => res.status < 500 });

  } else {
    // Register a new user (heavy write path)
    const r = http.post(`${API}/auth/register`, JSON.stringify({
      name: `Spike ${__VU}_${__ITER}`,
      email: `spike_${__VU}_${__ITER}_${Date.now()}@k6.test`,
      password: 'SpikeTest1!',
      phone: '9' + Math.floor(100000000 + Math.random() * 900000000).toString(),
    }), { headers });
    track(r);
    check(r, { 'register responds': (res) => res.status < 500 });
  }

  sleep(Math.random() * 1.5 + 0.3);
}

export function handleSummary(data) {
  return {
    stdout: textSummary(data, { indent: '  ', enableColors: true }),
    'tests/load/spike-summary.json': JSON.stringify(data, null, 2),
  };
}

import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.3/index.js';
