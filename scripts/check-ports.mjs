#!/usr/bin/env node
// =============================================================================
// Preflight port check for `npm run dev:all`
// =============================================================================
//
// Why this exists: `concurrently` keeps going when one service dies, so a single
// occupied port produced a stack that *looked* healthy. In practice another
// project held 3001, auth-service died with EADDRINUSE, and the gateway happily
// proxied every /api/v1/auth/* call — passwords included — to that unrelated
// app. Registration returned HTML instead of a JWT and 70 of 72 e2e tests failed
// on symptoms far from the cause.
//
// Failing here, before anything starts, turns a half-hour debug into one line.

import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');

// Ports come from .env where set, so this always checks what will actually be
// bound rather than a second hardcoded list that can drift.
const DEFAULTS = {
  API_GATEWAY_PORT: 3000,
  AUTH_SERVICE_PORT: 3001,
  BUSINESS_SERVICE_PORT: 3002,
  PURCHASE_SERVICE_PORT: 3003,
  SALES_SERVICE_PORT: 3004,
  INVENTORY_SERVICE_PORT: 3005,
  LEDGER_SERVICE_PORT: 3006,
  SUBSCRIPTION_SERVICE_PORT: 3007,
  BILLING_SERVICE_PORT: 3008,
  NOTIFICATION_SERVICE_PORT: 3009,
  ADMIN_SERVICE_PORT: 3010,
  PROFILE_SERVICE_PORT: 3011,
  REFERRAL_SERVICE_PORT: 3012,
  WHATSAPP_AI_PORT: 3013,
  EXPENSE_SERVICE_PORT: 3014,
};

function readEnv() {
  const out = {};
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

const env = { ...DEFAULTS, ...readEnv(), ...process.env };

function inUse(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', (e) => resolve(e.code === 'EADDRINUSE'));
    srv.once('listening', () => srv.close(() => resolve(false)));
    // Bind the same way Node servers do, so we detect IPv6-only holders too.
    srv.listen(port);
  });
}

function whoHas(port) {
  try {
    const out = execSync(`lsof -nP -iTCP:${port} -sTCP:LISTEN 2>/dev/null | tail -n +2`, {
      encoding: 'utf8',
      stdio: 'pipe',
    });
    const first = out.trim().split('\n')[0] || '';
    const [cmd, pid] = first.split(/\s+/);
    return cmd ? `${cmd} (pid ${pid})` : 'unknown process';
  } catch {
    return 'unknown process';
  }
}

const taken = [];
for (const [key, fallback] of Object.entries(DEFAULTS)) {
  const port = Number(env[key]) || fallback;
  if (await inUse(port)) taken.push({ key, port });
}

if (taken.length === 0) {
  console.log(`✅ all ${Object.keys(DEFAULTS).length} service ports are free`);
  process.exit(0);
}

console.error('\n❌ Cannot start: these ports are already in use\n');
for (const { key, port } of taken) {
  console.error(`   ${String(port).padEnd(6)} ${key.padEnd(26)} held by ${whoHas(port)}`);
}
console.error(`
Fix either way:
  • stop whatever holds the port, or
  • set a free port in .env (e.g. AUTH_SERVICE_PORT=3021)

The gateway now reads <NAME>_SERVICE_PORT too, so changing .env is enough —
no <NAME>_SERVICE_URL override needed locally.
`);
process.exit(1);
