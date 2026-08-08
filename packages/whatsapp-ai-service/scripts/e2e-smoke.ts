// =============================================================================
// E2E Smoke: WhatsApp message → agents → REAL posting through the live stack
// =============================================================================
// Requires the local dev stack running (npm run dev:all) and the root .env
// (DATABASE_URL + JWT_SECRET). Run from this package directory:
//
//   node ../../node_modules/tsx/dist/cli.mjs scripts/e2e-smoke.ts
//
// What it proves, end to end, with zero mocks:
//   1. phone → user → business resolution against the real DB
//   2. "X ko 500 diye cash" → VENDOR_PAYMENT draft with the real party resolved
//   3. approve button → billing-service quick payment actually posted
//   4. party balance moved the right way; payment row exists
//   5. "aaj ka hisaab" daily summary reports the real payment
// =============================================================================

import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
process.env.API_GATEWAY_URL = process.env.API_GATEWAY_URL || 'http://localhost:3000';

const API = `${process.env.API_GATEWAY_URL}/api/v1`;

interface Envelope<T = any> { success: boolean; message?: string; data?: T; meta?: any }

async function api<T = any>(
  method: string,
  pathname: string,
  body?: unknown,
  token?: string,
  businessId?: string,
): Promise<Envelope<T>> {
  const res = await fetch(`${API}${pathname}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(businessId ? { 'x-business-id': businessId } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as Envelope<T>;
  if (!res.ok || json.success === false) {
    throw new Error(`${method} ${pathname} → ${res.status}: ${json.message || 'failed'}`);
  }
  return json;
}

let failures = 0;
function check(label: string, ok: boolean, detail?: string) {
  console.log(`${ok ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

async function main() {
  // ── 0. Stack up? ──
  for (let i = 0; ; i++) {
    try {
      const res = await fetch(`${process.env.API_GATEWAY_URL}/health`);
      if (res.ok) break;
    } catch { /* retry */ }
    if (i > 30) throw new Error('Gateway not reachable on ' + process.env.API_GATEWAY_URL);
    await new Promise(r => setTimeout(r, 2000));
  }
  console.log('Gateway healthy. Setting up fixtures…\n');

  // ── 1. Fixtures via the real APIs ──
  const uniq = Math.floor(Math.random() * 1e9);
  const userPhone = '9' + String(uniq % 1e9).padStart(9, '0');
  const partyPhone = '8' + String((uniq + 7) % 1e9).padStart(9, '0');

  const reg = await api('POST', '/auth/register', {
    name: 'E2E Munshi',
    email: `e2e_wa_${uniq}@bahi.test`,
    password: 'ProbePass123!',
    phone: userPhone,
  });
  const token: string = reg.data.accessToken;
  const userId: string = reg.data.user.id;

  const biz = await api('POST', '/business', { name: `E2E WA Biz ${uniq}`, type: 'RETAIL' }, token);
  const businessId: string = biz.data.id;

  const plans = await api('GET', '/subscriptions/plans');
  const free = (plans.data || []).find((p: any) => p.slug === 'free') || (plans.data || [])[0];
  if (free) {
    await api('POST', '/subscriptions', { planId: free.id, billingCycle: 'MONTHLY' }, token).catch(() => undefined);
  }

  const party = await api('POST', '/profile/parties', {
    name: 'Ramesh Steel',
    phone: partyPhone,
    type: 'SUPPLIER',
  }, token, businessId);
  const partyId: string = party.data.id;
  console.log(`User ${userId.slice(0, 8)}… / business ${businessId.slice(0, 8)}… / party ${partyId.slice(0, 8)}…\n`);

  // ── 2. Real user resolution (phone → user → business) ──
  const { UserResolutionService } = await import('../src/services/user-resolution');
  const resolver = new UserResolutionService();
  const resolution = await resolver.resolve(`91${userPhone}`, 'E2E Munshi');
  check('user resolution resolves the registered phone', resolution.resolved === true);
  check('…to the right business', resolution.user?.businessId === businessId,
    `${resolution.user?.businessId?.slice(0, 8)}…`);

  // ── 3. Conversation: draft → approve → REAL post ──
  const { AgentOrchestrator } = await import('../src/agents/orchestrator');
  const orchestrator = new AgentOrchestrator();

  const textMessage = (body: string) => ({
    from: `91${userPhone}`,
    id: `wamid.e2e_${Math.floor(Math.random() * 1e9)}`,
    timestamp: String(Math.floor(Date.now() / 1000)),
    type: 'text' as const,
    text: { body },
  });
  const buttonReply = (id: string, title: string) => ({
    from: `91${userPhone}`,
    id: `wamid.e2e_${Math.floor(Math.random() * 1e9)}`,
    timestamp: String(Math.floor(Date.now() / 1000)),
    type: 'interactive' as const,
    interactive: { type: 'button_reply', button_reply: { id, title } },
  });
  const input = (message: any) => ({
    userId,
    senderName: 'E2E Munshi',
    businessId,
    message,
    phoneNumberId: 'e2e-phone',
    timestamp: new Date().toISOString(),
  });

  const draft = await orchestrator.processMessage(input(textMessage('Ramesh Steel ko 500 diye cash')));
  console.log('\n[draft reply]', draft.text?.slice(0, 200));
  check('payment draft prepared with confirm buttons',
    Boolean(draft.buttons?.some(b => b.id === 'confirm_post' || b.id === 'approve_entry')));
  check('draft resolved the real party', (draft.text || '').includes('Ramesh Steel'));

  const posted = await orchestrator.processMessage(input(buttonReply('confirm_post', 'Post Karein ✅')));
  console.log('\n[approve reply]', posted.text?.slice(0, 200));
  check('approve reply reports a REAL posting', (posted.text || '').includes('✅ Payment entry post ho gayi'));

  // ── 4. Verify against the ledger, not the reply ──
  // listPayments returns transformed rows: { type: 'IN'|'OUT', mode, party_id, … }
  const payments = await api('GET', '/billing/payments?limit=10', undefined, token, businessId);
  const payment = (payments.data || []).find((p: any) => Number(p.amount) === 500);
  check('payment row exists in billing-service', Boolean(payment),
    payment ? `id ${String(payment.id).slice(0, 8)}… mode ${payment.mode}` : 'not found');
  check('payment direction is OUT with CASH mode',
    payment?.type === 'OUT' && payment?.mode === 'CASH',
    payment ? `type=${payment.type} mode=${payment.mode}` : '');

  const partyAfter = await api('GET', `/profile/parties/${partyId}`, undefined, token, businessId);
  const balance = Number(partyAfter.data.balance);
  // Paying a supplier with zero balance → advance: balance 0 → -500
  check('party balance moved the right direction (0 → -500)', balance === -500, `balance=${balance}`);

  // ── 5. Reports read the same reality ──
  const summary = await orchestrator.processMessage(input(textMessage('aaj ka hisaab')));
  console.log('\n[daily summary]', summary.text);
  check('daily summary includes the real payment', (summary.text || '').includes('500'));

  console.log(`\n${failures === 0 ? '🎉 E2E SMOKE PASSED' : `💥 ${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(err => {
  console.error('E2E smoke crashed:', err.message);
  process.exit(1);
});
