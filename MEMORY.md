# Bahi Khata Pro — Project Memory / Session Sync

> **Purpose:** single file to read before working on this repo — human or AI.
> It records the architecture facts you cannot guess from the code, the state of the
> long-running audit-fix effort, and the traps that have already burned previous sessions.
> Keep it updated: when you close work, move it to "Done"; when you find a new trap, add it.
>
> Companion documents: `VERIFICATION-REPORT.md` (full audit + fix log, rounds 1–10),
> `VERIFICATION-APPENDIX.md` (raw finding queue — ALL severities triaged as of round 10; resolutions live in the report),
> `TASKS.md` (WhatsApp-AI assistant build plan — separate effort), `DEPLOYMENT.md`.

---

## 1. What this is

**Bahi Khata Pro** — multi-tenant Indian SMB accounting app (parties/ledger/purchases/sales/
inventory/expenses/subscriptions), Hindi/English UI (11 locales).

- **Monorepo (npm workspaces):** `frontend/` (Vite + React 19 SPA), `packages/` (14 Express +
  Prisma microservices + `api-gateway` + `shared`), `tests/` (Jest API + Playwright), `mobile/`
  (React Native, not part of the audit), `infra/` (Azure Bicep).
- **Gateway** (`packages/api-gateway`, port 3000) proxies `/api/v1/<prefix>` by env-var
  `<SERVICE>_URL` / port map. Services: auth 3001*, business 3002, purchase 3003, sales 3004,
  inventory 3005, ledger 3006, subscription 3007, billing 3008, notification 3009, admin 3010,
  profile 3011, referral 3012, whatsapp-ai 3013, expense 3014.
  *auth runs on **3021** locally via `.env` because another app on this machine holds 3001.
- **One shared Postgres DB** (unlike a DB-per-service design): `packages/shared/prisma/schema.prisma`
  is canonical; **every service carries a vendored copy** at
  `packages/<svc>/src/shared/prisma/schema.prisma` (see traps §4).
- **Auth:** JWT (15-min access + 30-day refresh rotation), tenancy per-request via `x-business-id`
  checked against `business_users` membership (hardened in round 1). Admin = `is_super_admin`.
- **Deployment:** one Vercel project per service + frontend + gateway. Gateway:
  `api-gateway-navy-eta.vercel.app`. DB: Azure PostgreSQL Flexible Server (Central India).
  Deploy scripts: `deploy-all.sh`, `deploy-backend-services.sh`, `vercel-deploy.sh`, `status.sh`.

## 2. Domain conventions (memorize these)

- **`party.balance` sign: positive = payable (we owe them), negative = receivable (they owe us).**
  Writers (sales/purchase services) established this; all readers now follow it. Any new UI/report
  must use this convention — the #1 recurring bug class in this codebase was inverting it.
- **Party ledger legs:** a purchase writes `INVENTORY/DEBIT` + `PARTY_PAYABLE/CREDIT`; a sale
  writes `PARTY_RECEIVABLE/DEBIT` + `SALES/CREDIT`. Party-facing views must filter to
  `PARTY_PAYABLE`/`PARTY_RECEIVABLE` legs (+ single-leg manual adjustments) or the two legs cancel.
- **Unpaid cutter costs** live on the cutter's linked `Party` (type `CUTTER`) as
  `PARTY_PAYABLE/CREDIT` + balance increment; paying them writes the offsetting DEBIT + decrement
  (purchase-service create path, profile-service mark-paid/update/mark-all — kept in mirror).
- **Money:** Prisma `Decimal(15,2)`, quantities `Decimal(15,3)`. GST via `gst_mode NONE|PERCENT|AMOUNT`.
- **Sales are lot-based** (FIFO manual pick). Lot `status` lifecycle:
  AVAILABLE → PARTIAL → SOLD_OUT (or CANCELLED/EXPIRED). UI must offer AVAILABLE **and** PARTIAL.
- **`PATCH /sales/:id` is header-only** (party/date/notes/GST/discount/roundoff/reminders). It does
  NOT accept saleLots/payments — the edit UI locks those sections; changing them = delete + recreate.
- **Purchases/sales with sold lots refuse edit/delete (409)** — reversing them would corrupt stock.
- **Response envelope everywhere:** `{success, message?, data?, meta?}`. Beware: sibling endpoints
  sometimes nest vs spread `data` differently (e.g. `getPartyStatement` nests, `getPartyLedger` spreads).
- **Upload URLs are stored relative** (`/uploads/<area>/...`). The frontend rewrites `/uploads/*` to
  the gateway (frontend/vercel.json), which static-proxies `/uploads/business|avatars|purchase|sale`
  to the owning service. Never store absolute URLs built from `req.get('host')` — behind the proxy
  that's the internal host.

## 3. State of the audit effort (as of 2026-08-08, round 10)

**The ENTIRE appendix queue is triaged: CRITICAL (34), HIGH (91 — including the
Profile/Notifications/Help and WhatsApp-AI sections that rounds 1–8 had silently skipped),
MEDIUM (80) and LOW (28)** — each item verified against code, then fixed or explicitly descoped.
Verified-fix history is in `VERIFICATION-REPORT.md` rounds 1–10.

Round 10's standout (found by probing, not in the appendix): **billing-service moved party
balances the WRONG DIRECTION on every recorded payment** (receivables grew when customers paid;
all three payment paths, both directions). Fixed + verified live. Production party balances
written via Record Payment before this fix are corrupted —
**run `scripts/repair-party-balances.mjs` (dry-run first) against production after deploying.**

**Round 9 (2026-08-08) closed:** opening-balance sign inversion in Add/Edit party dialogs;
cutter mark-paid/create/update now move party balance + ledger; fake bulk "Deactivate selected";
Edit-party contacts/banks silently dropped (now persisted, replace semantics); Edit-party
hardcoded `type:'BOTH'` overwrite (CUTTER mirror-parties protected); purchase/sale upload URLs +
gateway `/uploads/purchase|sale` proxies; purchase attachment delete now real; cutter balance
double-count on purchase edit/never-reversed on delete; sold-lot edit/delete guard (409);
sale edit-mode: lots/payments sections locked + omitted from payload, explicit zeros so
discount/GST can be cleared, duplicate-create-on-failed-prefill guard, PARTIAL lots sellable;
subscription create/cancel scoped to `role:'OWNER'`; expired subscription no longer "current"
(renew re-enabled); referral leaderboard response shaped (`rank/name/referrals/earnings`, names
masked, phone dropped); redeem extends from `max(now, period_end)` in one transaction; Razorpay
webhook verifies HMAC over the raw body with `timingSafeEqual` (503 unconfigured / 400 bad sig).

**Deliberately descoped / blocked (do not "fix" casually):**
- **OTP/SMS login** — needs a real SMS provider + credentials (Twilio/MSG91). Non-functional by design until then.
- **Razorpay checkout** — commercial decision; webhook plumbing is now correct but no checkout flow exists.
- **Import for `sales` and `payments`** — blocked on product policy (lot auto-pick = inventory-costing
  policy; payment auto-allocation = accounting policy). Dialog says so honestly; parties/inventory/
  ledger/purchases/expenses import is real (via `frontend/src/lib/importers.ts`, normal create endpoints).
- **whatsapp-ai-service** — still inert without ~20 Azure/WhatsApp env vars, but its HIGH+MEDIUM
  audit findings are now fixed (round 10) and it has a real jest suite (56 tests); the frontend
  WhatsAppAIDashboard component remains deliberately unrouted (belongs to the TASKS.md build effort).
- **Server-side 402 subscription enforcement** — requireActiveSubscription middleware exists but is
  NOT mounted: there is no auto-trial on business creation, so mounting it would instantly wall out
  every business without a plan (146/149 locally). The frontend plan-selection gate now works
  (hasSubscription flag); server enforcement needs a product decision + auto-trial or grace policy.
- **User-level bank-account UI** — routes now validate server-side but remain unwired in the UI.

**Open queues:** none — the appendix is fully triaged. Any new work starts from fresh findings,
not the appendix (verify-before-fix still applies; several appendix leads were refuted when checked).

**Outstanding user action:** production has **zero super admins** — nothing under `/admin` is
reachable in production until a row in `users` gets `is_super_admin = true`. Owner picks the
account, then runs `node scripts/set-super-admin.mjs --email <email>` (dry-run; add `--apply`)
with DATABASE_URL pointed at production.

## 4. Traps that have burned previous sessions (read before coding)

1. **Vendored `shared` copies.** `packages/shared/src/*` and `prisma/schema.prisma` are copied into
   all 13 services (`packages/<svc>/src/shared/…`). Local dev/typecheck/tests read the canonical
   copy, but **deployed builds generate Prisma clients from the vendored schema** (`postinstall`).
   Any change to shared middleware/validators/schema must be propagated to all copies or production
   silently diverges (this caused three separate production failure classes). Check with a diff loop.
2. **Zod strips undeclared keys.** A frontend field that "saves fine" may be silently dropped —
   verify the schema declares it. Conversely PATCH routes are often UNvalidated.
3. **snake_case vs camelCase:** frontend historically sent snake_case where services read camelCase;
   the request 200s and nothing changes. Grep both spellings when wiring a new field.
4. **`timestamp without time zone` + raw SQL:** bind dates as `${d.toISOString()}::timestamp` in
   `$queryRaw` or ORM and raw queries select different rows on non-UTC hosts.
5. **Ports:** local auth-service is on **3021** (see `.env`); gateway maps via `AUTH_SERVICE_URL`.
   `dev:all` does NOT fail when a service can't bind — a port clash yields a half-up stack that
   proxies to the wrong app. `npm run check:ports` runs pre-dev.
6. **Windows npm install:** 13 concurrent `prisma generate` postinstalls race on the query-engine
   file (EPERM). Install with `npm install --foreground-scripts`.
7. **`db:seed` targets whatever DATABASE_URL wins** — it prints the target; read the printout.
   `packages/shared/.env` historically pointed at the Azure (production-adjacent) DB.
8. **Migrations:** 19 committed under `packages/shared/prisma/migrations/`. Production is baselined —
   apply with `prisma migrate deploy`; if the sandbox refuses, the documented fallback is
   `psql` the DDL + `prisma migrate resolve --applied` (done twice already; verify with
   `migrate status` + `migrate diff` empty).
9. **`rc`/`errorHandler` hides messages:** bare `throw new Error(...)` becomes an opaque 500 in
   production — always throw `AppError` subclasses (`ConflictError`, `NotFoundError`, …).
10. **No fabricated data.** Every mock/fallback row rendered as real data has been treated as a bug
    and removed. Never add `catch { setX([...fakeRows]) }` fallbacks — error state + retry instead.

## 5. How to run / verify (THIS machine — set up 2026-08-08)

```bash
npm install --foreground-scripts          # once (see trap 6)
docker start bahi-redis                   # Redis (redis:7-alpine container) — OTP paths 500 without it
npm run dev:all                           # gateway + 14 services + frontend (~30s warm)
node node_modules/jest/bin/jest.js tests/api/          # 118 specs — needs the live stack
node node_modules/@playwright/test/cli.js test tests/  # 105 specs — reuses the running stack
# per-package typecheck (npx tsc resolves the wrong package; use the local binary):
cd packages/<svc> && ../../node_modules/.bin/tsc --noEmit
cd frontend && ../node_modules/.bin/tsc --noEmit && npx vite build
```

Local DB: `postgresql://postgres:1234@localhost:5432/bahi_khata_pro` — created fresh on this
machine (19/19 migrations + seed, **no real data**; the previous machine's data did not move).
The same Postgres hosts unrelated projects' databases — leave them alone.

**Deployment is BLOCKED on `vercel login` only:** Vercel CLI 58.9.0 is installed globally
(2026-08-08, at `%APPDATA%\npm` — on Git Bash PATH may need the full path), but there is no auth
token and no `.vercel` project links (the repo changed machines). To deploy: `vercel login` (or set
`VERCEL_TOKEN`), then `deploy-backend-services.sh` / `vercel-deploy.sh`. After deploying a service
that touched anything under `src/shared/`, confirm its build log regenerated the Prisma client
from the **synced vendored schema** (trap 1). Smoke: `status.sh`, `verify-deployment.sh`, and
probe endpoints through `api-gateway-navy-eta.vercel.app`.
**Rounds 9–10 changes are therefore NOT yet in production** — deploy essentially every service +
gateway + frontend once auth exists. **Post-deploy sequence:** (1) deploy all; (2)
`node scripts/repair-party-balances.mjs` against prod DATABASE_URL (dry-run, eyeball, `--apply`)
— must run AFTER deploy or the still-inverted payment writer re-corrupts; (3)
`node scripts/set-super-admin.mjs --email <owner-chosen> --apply` against prod (verified locally:
dry-run/apply/last-admin-revoke-guard all work).

## 6. Version control (initialized 2026-08-08)

Repo: `https://github.com/yash-jain-1224/bahikhatamainapp.git`, branch `main`, 986 files.
Local commit identity is set per-repo (`yash-jain-1224 <yash.jain.consults@gmail.com>`).

**Three things are gitignored ON PURPOSE — do not "helpfully" commit them:**
- `db-backups/` — the `*-tables-*.sql` files are pg_dump **data** dumps of the production DB
  containing real party PII (names, phones, GST/PAN, addresses) and real figures; the `clear-*.sql`
  scripts alongside them leak the same figures in their comments.
- `setup-env-vars.sh` — line 12 holds the **live Azure DB connection string in plaintext**.
  It stays local and functional. That password has sat in the working tree for a long time;
  **rotating it is worthwhile** even though it was never pushed.
- `.env`, `.azure-db-connection.txt` — already covered before, listed here for completeness.

**GitHub push protection is ON for this repo.** It rejects any commit containing a
vendor-shaped live key. It blocked the first push over a *fake* masking-test fixture in
`packages/whatsapp-ai-service/tests/security.test.ts` that used a realistic `sk_live_…` shape;
the fixture now uses a `token_…` prefix, which exercises the same `maskPII` regex branch
(`/(?:sk|pk|key|token|secret|api[_-]?key)[_-]?[a-zA-Z0-9_]{20,}/gi`). **Never write a
realistic-looking credential into a test fixture** — use a non-vendor prefix.

## 7. Test-suite status (round 10, this machine, 2026-08-08)

Jest API 118/118 · whatsapp-ai jest 56/56 (new suite) · Playwright: every spec passes; full
parallel runs on this loaded machine show 2–6 ROTATING flakes (different set each run, all green
on rerun) — treat a small shifting failure set as machine load, and a MASS failure as
environment: one 66-failure run was simply the gateway's ts-node-dev process having died
(check `curl localhost:3000/health` first, restart with `npm run dev:gateway`).
All packages + frontend typecheck clean · `vite build` clean · round-9 probe 40/40 and the
payment-direction probe both green (scratchpad scripts, not in repo).
