# BahiKhata AI — WhatsApp Accounting Assistant: Master Task File

> **Scope:** Add a production-grade, AI-powered WhatsApp assistant ("virtual munshi") on top of the
> existing **Bahi Khata Pro** monorepo (13 Express/Prisma microservices + API gateway + Vite/React
> frontend + React Native mobile). The assistant understands Hindi / English / Hinglish, extracts
> data from bills, UPI screenshots and voice notes, resolves entities, validates, asks smart
> clarifications, and posts entries to the **existing** accounting services.
>
> **Status legend:** `[ ]` pending · `[~]` in progress · `[x]` implemented & verified
> **Owner:** AI platform team · **Last updated:** 2026-08-08

---

## ⚠️ Architecture reality update (2026-08-08)

The implementation **diverged from the M2–M4 plan below**: the AI plane was built in
**TypeScript inside `packages/whatsapp-ai-service`** (agents in `src/agents/`, engines in
`src/services/`), not as the Python `ai/` packages — **no `ai/` directory exists**. The Python
plan sections are retained for reference; their *capabilities* now map to:

| Planned (Python) | Actual (TypeScript) |
|---|---|
| `ai/bahikhata_ai/gateway_client` (act-as-user JWT) | `src/services/gateway-client.ts` — mints 5-min HS256 JWTs (`{userId, phone, isSuperAdmin:false}`), sets `x-business-id`, unwraps the envelope **[x]** |
| Lekha tool execution / sagas | `src/services/transaction-poster.ts` — payments (billing quick-payment), purchases (item resolution → itemIds), sales (**FIFO lot allocation** over `/sales/lots/all`), expenses (expense-type matching), stock adjust, party/item create. Never claims success unless the service succeeded **[x]** |
| User/business resolution (Prisma) | `src/services/user-resolution.ts` — real `User.phone` → `BusinessUser` lookup, multi-business picker, DB `WhatsAppSession` upsert **[x]** |
| Hisaab query tools | `src/agents/hisaab.agent.ts` — daily summary, party/overall outstanding, GST (entry totals), stock, P&L, cash — all real reads through the gateway **[x]** |
| `engines/` (amounts/dates/gst/entities) | `src/services/gst.engine.ts` + rule-based extraction in `src/agents/samajh.agent.ts` (party/amount/phone/rate/item extraction works offline) **[~]** — no UPI-screenshot layout engine, no dedup fingerprint store |
| MCP server (22 tools) | `src/mcp/` + `src/routes/mcp.routes.ts` — only genuinely executable tools advertised (`validate_gstin`, `parse_amount`); data tools refuse honestly (API keys carry no tenant/user context) **[~]** |
| Approval flow (Cosmos + buttons) | Orchestrator `pendingApproval`/`pendingTransaction` + WhatsApp buttons; **approve now actually posts** via the gateway (it previously replied "Entry post ho gayi!" without posting anything) **[x]** |

**Verified 2026-08-08** by `scripts/e2e-smoke.ts` against the live local stack (zero mocks):
phone→user→business resolution → "Ramesh Steel ko 500 diye cash" → draft with real party →
approve → real payment row in billing-service (`type=OUT, mode=CASH`) → party balance `0 → -500` →
"aaj ka hisaab" reports the real ₹500. Package suite: 81 jest tests; platform API suite: 118/118.

Still genuinely open: Azure adapters wiring in production (OpenAI/Doc Intelligence/Speech/Cosmos
credentials), dedup fingerprints, UPI-screenshot engine, M5 infra (`ai.bicep`, compose), M6 docs.

---

## 0. Executive Summary

| | |
|---|---|
| New packages | `packages/whatsapp-ai-service` (TypeScript), `ai/` (Python: orchestrator, MCP server, shared lib) |
| Touches existing code | `packages/api-gateway` (one new proxy route), `.env.example` (new vars) — nothing else |
| System of record | **Existing PostgreSQL ledger via existing service APIs** — the AI layer holds no accounting data of its own |
| AI stack | Azure OpenAI (GPT-4o, function calling) · Azure AI Document Intelligence · Azure Speech (hi-IN/en-IN) · LangGraph · MCP |
| Memory / state | Azure Cosmos DB (conversation memory, entity mappings, pending approvals) with local JSON-file fallback for dev |
| Messaging | Meta WhatsApp Business Cloud API (webhook + Graph sends) · Azure Service Bus (async) with direct-HTTP fallback for dev |
| Deployment | Azure Container Apps (Python services), Vercel or Container Apps (whatsapp-ai-service), existing Vercel topology untouched |

---

## 1. Findings From Codebase Survey (what we build on)

The full endpoint inventory captured during the survey is the contract for the MCP tools.

### 1.1 Existing platform facts (verified 2026-07-03)

- **Gateway** (`packages/api-gateway`, :3000) proxies by prefix using `<SERVICE>_URL` env vars →
  `/api/v1/auth`(3001), `/business`(3002), `/purchases`(3003), `/sales`(3004), `/inventory`(3005),
  `/ledger`(3006), `/subscriptions`(3007), `/billing`(3008), `/notifications`(3009), `/admin`(3010),
  `/profile`(3011), `/referrals`(3012). No body parsing, no path rewrite; forwards `Authorization`
  and `x-business-id` headers; 30s proxy timeout.
- **Auth:** JWT access token `{userId, phone, isSuperAdmin}`, **15 min expiry**, signed with shared
  `JWT_SECRET` that every service validates locally. Tenancy is **per-request** via `x-business-id`
  header, checked against `BusinessUser` (roles OWNER/MANAGER/ACCOUNTANT/STAFF + 20 permission codes).
  No service-to-service auth exists.
- **Parties** (vendors/customers, unified model): `profile-service` → `POST/GET/PATCH /api/v1/profile/parties`.
  `Party.balance` convention: **> 0 receivable, < 0 payable**. Party has `whatsapp` field.
- **Standalone payments:** `billing-service` → `POST /api/v1/billing/payments` ("quick payment"
  shape: `{type: 'IN'|'OUT', party_id, amount, date?, mode, reference?, notes?}`) posts Payment +
  balanced ledger legs; `GET /billing/outstanding/:partyId?type=IN|OUT` lists open bills;
  `POST /billing/payments/bulk` settles multiple bills.
- **Purchases** (`/api/v1/purchases`): Zod-validated create (items[] → lots, inventory IN, double-entry
  ledger, payments). **Gotcha:** create schema **strips** `gstMode/gstValue/gstAmount/discount/roundOff/
  reminders` — GST fields only apply via PATCH. PATCH replaces ALL sub-records (omitting `items` wipes lines).
- **Sales** (`/api/v1/sales`): lot-based; oversell → `InsufficientStockError`; same GST-strip gotcha on
  create; PATCH is header-only.
- **Ledger** (`/api/v1/ledger`): party statement w/ running balance, trial balance, P&L, balance sheet,
  outstanding, day book. `POST /entries` writes a **single leg** (not a pair) and side-effects
  `party.balance` — use only for deliberate adjustments.
- **Inventory** (`/api/v1/inventory`): item CRUD + search, low-stock, `POST /adjust` (ADD/REMOVE,
  REMOVE guards against negative stock).
- **Expenses** (`expense-service`, mounted at `/api/expenses`, **not proxied by the gateway**, and has
  **no JWT/RBAC** — pre-existing security gap, see Risks): standalone expense CRUD.
- **WhatsApp today:** `notification-service` already sends via Meta Graph API v18
  (`WHATSAPP_API_URL/ACCESS_TOKEN/PHONE_NUMBER_ID/VERIFY_TOKEN`) and hosts a webhook that upserts
  `WhatsAppSession`. Meta allows **one webhook URL per WABA app** → the new AI service takes over the
  webhook role (§3.1) and keeps the session upsert behaviour.
- **Schema:** money `Decimal(15,2)`, qty `Decimal(15,3)`; `Purchase.gst_mode NONE|PERCENT|AMOUNT`;
  `InventoryItem.hsn_code/gst_rate`; `Party.gst_registration_type/gst_number/gst_state`;
  `PaymentMode CASH|BANK_TRANSFER|UPI|CARD|CHEQUE|CREDIT|MIXED`; `AuditLog` written on money mutations.
- **Response envelope** everywhere: `{success, message?, data?, meta?}`; Indian formats validated
  (GSTIN regex, phone `^[6-9]\d{9}$`, PAN, IFSC); FY starts April (`financial_year_start=4`).
- **Infra:** Azure PG Flexible Server (Central India) + Redis; per-service Vercel projects (current
  reality), docker-compose for local, aspirational AKS pipeline; Bicep in `infra/azure`.

### 1.2 Gap analysis (spec ⭢ reality)

| Spec item | Reality | Decision |
|---|---|---|
| "Azure SQL double-entry schema" | Double-entry ledger already exists on PostgreSQL/Prisma | **Keep PostgreSQL.** AI layer writes through existing APIs only (ADR-1) |
| "Next.js 14 dashboard" | Frontend is Vite + React 19 SPA, deployed on Vercel, 11 Indian languages | **Keep Vite SPA.** No rewrite; AI insights surface on WhatsApp first; dashboard work deferred to roadmap (ADR-2) |
| "Vercel Edge webhook receiver" | Backend services are plain Express on Vercel/containers | Webhook lives in new `whatsapp-ai-service` (Express, same house style) (ADR-3) |
| Party/vendor search for entity resolution | Exists in profile-service (list w/ query) | MCP `search_party` wraps it + fuzzy/phonetic layer in AI service |
| `record_payment` MCP tool | billing-service quick payment already posts balanced ledger legs | Wrap it; never post raw ledger legs for payments |
| Stock tools | inventory + lot-based sales exist | `get_stock`/`adjust_stock` wrap inventory; sales require lot selection (FIFO helper in tool layer) |
| GST computation engine | Only `gst_mode/gst_value` math in services; no GSTIN checksum, no CGST/SGST/IGST split | Build in `ai/` (engines) — checksum validation, intra/inter-state split, rate sanity |
| Duplicate detection | None | Build in `ai/` engines + Cosmos fingerprint store |
| Conversational memory | None | Cosmos DB containers (§3.6) |
| Voice / OCR / NLU | None | Azure Speech + Document Intelligence + Azure OpenAI wrappers (mockable for dev/test) |
| Approval workflow | None | WhatsApp interactive buttons + pending-approval state in Cosmos/Redis (§3.7) |

### 1.3 Pre-existing issues found (not caused by this project; tracked, fix separately)

- `.azure-db-connection.txt` contains a **plaintext admin password** in the working tree → rotate + delete. **[SEC-0]**
- `expense-service` has **no authentication** and isn't behind the gateway. AI layer will NOT call it
  until fixed; expense entry goes through purchase-linked expenses or a ledger adjustment. **[SEC-1]**
- `JWT_SECRET` has an insecure hardcoded fallback in every service. **[SEC-2]**
- notification-service in-process 24h scheduler is incompatible with serverless deployment. **[OPS-1]**
- expense-service default port 3009 collides with notification-service. **[OPS-2]**

---

## 2. Architecture Decision Records

- **ADR-1 — AI layer is stateless w.r.t. accounting.** All reads/writes go through existing service
  APIs (via the gateway) so RBAC, subscription gating, audit logging, ledger invariants and tenant
  isolation are enforced exactly once, in one place. The AI layer persists only conversation state,
  memory, fingerprints and pending approvals (Cosmos/Redis).
- **ADR-2 — Act-as-user auth.** Services share `JWT_SECRET`; the AI layer (Key Vault-held secret)
  mints short-lived (5 min) access tokens for the *mapped user* (`WhatsApp phone → User.phone`), so
  permissions and audit attribution remain correct per user. Businesses resolve via the user's
  `BusinessUser` rows; multi-business users pick once, stored in memory. Trade-off documented: secret
  sharing already exists platform-wide; roadmap item to move to asymmetric keys (RS256) later.
- **ADR-3 — New service, house style.** `packages/whatsapp-ai-service` (Express + TS, port 3013,
  gateway prefix `/api/v1/wa`) owns the Meta webhook (signature-verified), message normalisation,
  outbound sends, media download, approval buttons. It replaces notification-service as the
  configured webhook URL and preserves `WhatsAppSession` upserts.
- **ADR-4 — Python AI plane.** `ai/` holds LangGraph orchestration (`ai/orchestrator`), the MCP
  server (`ai/mcp_server`) and a shared library (`ai/bahikhata_ai`) with the gateway client, tool
  implementations, domain engines, memory and Azure adapters. Orchestrator binds tools in-process;
  MCP server exposes the *same* registry over MCP (streamable HTTP) for external agent clients.
- **ADR-5 — Queue with graceful degradation.** Webhook ACKs Meta immediately (<2s), then dispatches:
  Azure Service Bus when configured, else direct HTTP to the orchestrator (dev). Idempotency by
  WhatsApp message id (Redis SETNX, 7-day TTL) because Meta retries webhooks.
- **ADR-6 — Every Azure AI dependency is mockable.** Doc Intelligence / Speech / OpenAI / Cosmos
  adapters each have a deterministic local fallback (regex UPI parser, file-based memory, canned NLU
  for tests) so the full pipeline runs offline in CI.
- **ADR-7 — GST on create.** Because create schemas strip GST fields, the Lekha tool posts
  create → then PATCH with GST fields **only when GST applies**, wrapped in one saga with
  compensating delete on failure; PATCH bodies for sales are header-only (safe), for purchases the
  tool re-sends the full sub-record arrays it just created (documented quirk).

---

## 3. Component Specifications

### 3.1 `packages/whatsapp-ai-service` (TypeScript, port 3013, prefix `/api/v1/wa`)

Routes:
- `GET  /api/v1/wa/webhook` — Meta verification handshake (`hub.verify_token === WHATSAPP_VERIFY_TOKEN`).
- `POST /api/v1/wa/webhook` — inbound events. Steps: raw-body HMAC check (`X-Hub-Signature-256`,
  `META_APP_SECRET`) → 200 immediately → async: dedup by `messages[].id` → normalise (text / image /
  document / audio / interactive reply) → resolve user+business (Prisma `User.phone`, `BusinessUser`)
  → media: download via Graph `GET /{media-id}` → upload to Azure Blob (`STORAGE` env) or local disk →
  dispatch job to orchestrator (Service Bus `wa-inbound` queue or `POST ORCHESTRATOR_URL/process`).
- `POST /api/v1/wa/send` (internal, `x-internal-key`) — outbound: text, interactive buttons
  (approve/deny), templates; used by orchestrator for replies and approval requests.
- `GET /health`.

Behaviours: unknown phone → polite Hindi/English onboarding message (no account creation);
multi-business user without stored default → numbered business picker (state in Redis);
`WhatsAppSession` upsert preserved; per-phone rate limit; structured winston logs with wamid correlation.

### 3.2 `ai/bahikhata_ai` (shared Python lib)

- `config.py` — pydantic-settings; all env names documented in `.env.ai.example`.
- `gateway_client.py` — httpx client; mints act-as-user JWT (HS256, 5 min, `{userId, phone, isSuperAdmin:false}`),
  sets `x-business-id`; retries idempotent GETs; maps envelope errors to typed exceptions.
- `tools/` — the MCP tool registry (single source of truth; pydantic schemas):
  `search_party, create_party, get_party_outstanding, get_outstanding_bills, search_item, create_item,
  get_stock, adjust_stock, create_purchase, create_sale, record_payment, list_recent_transactions,
  daily_summary, profit_loss, trial_balance, day_book, party_statement, low_stock_items,
  validate_gstin, compute_gst, parse_amount, resolve_date` — each wraps the exact endpoint/shape from §1.1.
- `engines/` — pure-Python, dependency-light, exhaustively unit-tested:
  - `gst.py` — GSTIN regex **+ checksum digit**, state-code table, intra/inter-state → CGST+SGST vs IGST,
    rate sanity {0,0.25,3,5,12,18,28}, reverse-charge flag.
  - `amounts.py` — `15K / 15 hazaar / 1.5 lakh / ₹1,50,000 / 2 cr / 15,000` → Decimal; ambiguity flags
    (e.g. bare `1.5` → clarify).
  - `dates.py` — `aaj/kal/parson/pichle hafte`, `DD/MM/YYYY`, `2 tarikh` → date in Asia/Kolkata with
    direction heuristics (purchase context ⇒ past) + ambiguity flag; FY helpers (Apr–Mar).
  - `upi.py` — PhonePe/GPay/Paytm/BHIM screenshot text → `{amount, upi_ref, date, time, counterparty,
    direction, status}` (regex layouts + Doc Intelligence fallback).
  - `entity_resolution.py` — normalise (case/diacritics/Devanagari↔Latin transliteration), token fuzzy
    score + phonetic (Indic soundex), rank by recency/frequency/memory; thresholds: auto-accept ≥0.92
    single candidate, clarify 2–4, create-new suggestion below.
  - `dedup.py` — exact (vendor+bill_no), fuzzy (vendor + amount ±5% + ±7d), UPI ref match, image
    perceptual hash; fingerprints stored in Cosmos `fingerprints`.
- `memory/` — repository interface + Cosmos impl + JSON-file impl (dev). Documents (§3.6).
- `azure_ai/` — thin adapters: `openai_client` (Azure OpenAI chat + tools), `docintel` (prebuilt-invoice
  + receipt), `speech` (hi-IN/en-IN STT with auto language id); each with `MockXxx` twin.

### 3.3 `ai/orchestrator` (FastAPI + LangGraph, port 8001)

- `POST /process` — job body `{tenant, user, business, message{type, text?, media_url?, wamid},
  reply_to}`; idempotent per wamid.
- LangGraph state machine: `ingest → samajh (intent+entities, few-shot Hinglish) → [dastaveez |
  awaaz] (media) → pehchaan (entity resolution) → jaanch (dedup, GST, stock, amount thresholds) →
  poochna (clarify loop, ≤2 questions, context-merged) → approval gate (thresholds/new-party/backdated)
  → lekha (post via tools, saga semantics) → batana (confirmation w/ entry summary + undo hint)`;
  `hisaab` branch for query intents → tool reads → natural-language answer in user's language.
- Confidence policy: intent <0.6 → ask; amount ≥ `approvalThreshold` (default ₹50,000) → approval;
  duplicate suspected → confirm; backdated >7d → approval.
- Conversation state (multi-message transactions, pending clarifications) in Cosmos `conversations`
  with 24h TTL; learned mappings promoted after 5 consistent confirmations.
- Prompts in `ai/orchestrator/prompts/` (system + few-shots per agent, Hinglish examples from the
  spec's table).

### 3.4 `ai/mcp_server` (port 8002)

MCP streamable-HTTP server exposing the §3.2 registry. Session auth: `Authorization: Bearer <internal key>`
+ `X-Tenant-User` / `X-Business-Id` headers → constructs the same act-as-user gateway client. Includes
`tools/list` metadata with bilingual descriptions.

### 3.5 Gateway + env wiring (existing code, minimal diff)

- `packages/api-gateway/src/index.ts`: add `'/api/v1/wa' → whatsapp-ai-service:3013` proxy entry.
- `.env.example`: add WA/AI/Azure sections (names only, no values).

### 3.6 Cosmos DB data model (database `bahikhata-ai`)

| Container | PK | Doc types | Notes |
|---|---|---|---|
| `conversations` | `/userId` | session state, pending clarification, in-flight transaction draft | TTL 24h |
| `memory` | `/userId` | preferences (language, default payment mode, approval threshold), entityMappings, autoMappings, frequentVendors | schema mirrors spec §Conversational Memory |
| `fingerprints` | `/businessId` | bill/UPI/image fingerprints for dedup | TTL 400d |
| `approvals` | `/businessId` | pending approval requests (action payload + status + expiry) | TTL 7d |
| `audit` | `/businessId` | AI decision log: intent, confidence, tools called, outcome | append-only |

### 3.7 Human approval flow

1. Jaanch/policy gate marks action `needs_approval` → approval doc persisted → WhatsApp interactive
   buttons ("✅ Haan, post karo" / "❌ Nahi") sent with approval id.
2. Button reply hits webhook → whatsapp-ai-service routes `interactive` message → orchestrator
   `approve/deny` path → on approve, Lekha executes stored payload; on deny/expiry (24h), draft discarded.
3. All approvals logged to Cosmos `audit` + platform `AuditLog` via the acting user's API calls.

---

## 4. Milestones & Task Breakdown

### M0 — Foundations & contracts *(this file)*
- [x] Codebase survey (6-agent sweep) and endpoint inventory
- [x] Gap analysis, ADRs, component contracts (§1–3)
- [x] Master task file committed (this document)

### M1 — WhatsApp ingress/egress (`packages/whatsapp-ai-service`)
- [x] Package scaffold (house style: routes/controllers/services, tsconfig, vercel.json, Dockerfile)
- [x] Webhook verify (GET) + HMAC-verified receive (POST), raw-body capture
- [x] Message normaliser (text/image/document/audio/interactive/button) + wamid dedup (Redis, 7d)
- [x] User/business resolution (Prisma; unknown-user onboarding reply; multi-business picker)
- [x] Media pipeline: Graph media GET → Blob/local storage → signed internal URL (sender-controlled filenames sanitised; serverless-safe temp dir)
- [x] Dispatcher: Service Bus producer + direct-HTTP fallback; retry with backoff; DLQ note
- [x] Sender: text, interactive buttons, list picker; internal auth (`x-internal-key`)
- [x] `WhatsAppSession` upsert parity with notification-service (now persisted to DB for resolved users)
- [x] Unit tests: signature verification, payload parsing (fixtures for all message types), dedup — plus data-plane suite (gateway client, poster, resolution, approve path); 81 tests total
- [x] Wire gateway proxy `/api/v1/wa` + root `.env.example` additions

### M2 — Tool layer (`ai/bahikhata_ai` + `ai/mcp_server`)
- [ ] Package scaffold (`pyproject.toml`, `requirements.txt`, pytest config)
- [ ] Config + act-as-user JWT mint + gateway client (typed errors, envelope unwrap)
- [ ] All 22 tools (§3.2) with pydantic schemas + docstrings (bilingual)
- [ ] FIFO lot-selection helper for `create_sale` (query lots → allocate → saleLots[])
- [ ] GST-on-create saga for `create_purchase`/`create_sale` (ADR-7) with compensating cancel
- [ ] MCP server (streamable HTTP) exposing registry; health endpoint
- [ ] Tests: every tool against a mocked gateway (httpx MockTransport); JWT claims; saga rollback

### M3 — Domain engines (`ai/bahikhata_ai/engines`)
- [ ] `gst.py` (checksum, state codes, split, rates, RCM flag) — table-driven tests incl. real-format GSTINs
- [ ] `amounts.py` (hazaar/lakh/crore/K/lac, Indian digit grouping, ambiguity) — ≥40 cases
- [ ] `dates.py` (kal/parson/aaj, DD/MM, FY, tz Asia/Kolkata, direction heuristic) — ≥30 cases
- [ ] `upi.py` (PhonePe/GPay/Paytm/BHIM layouts, hi+en labels) — fixture screenshots' OCR text
- [ ] `entity_resolution.py` (transliteration, phonetic, ranking, thresholds) — "Ram × 4" spec case
- [ ] `dedup.py` (exact/fuzzy/UPI-ref/pHash) — true/false-positive matrix

### M4 — Orchestrator (`ai/orchestrator`)
- [ ] FastAPI app + `/process` idempotency + Service Bus consumer (optional import)
- [ ] LangGraph graph + state model; nodes for all 8 agents; conditional edges per confidence policy
- [ ] Samajh prompts (system + few-shot Hinglish intent table from spec) + function-calling schema
- [ ] Dastaveez: Doc Intelligence adapter → normalised invoice fields; kachchi-parchi fallback path
- [ ] Awaaz: Speech STT adapter (hi-IN primary, auto-detect) → text → samajh
- [ ] Pehchaan: candidate fetch via `search_party`/`search_item` + engines ranking + memory
- [ ] Jaanch: dedup + GST + stock + threshold checks; structured violation list
- [ ] Poochna: clarification templates (§Smart Clarification table), ≤2 open questions, answer merging
- [ ] Lekha: tool execution sagas + confirmation message composer (Hinglish, ₹ Indian formatting)
- [ ] Hisaab: query intents → read tools → answer templates ("Aaj ki bikri…", outstanding, GST month)
- [ ] Approval gate + resume path (§3.7)
- [ ] Memory read/learn (mappings after 5 confirmations; language preference)
- [ ] Tests: full-pipeline with MockLLM/MockSTT/MockOCR — golden conversations for the 15 spec edge cases

### M5 — Infra & deployment
- [ ] `infra/azure/ai.bicep`: Service Bus (queue `wa-inbound`), Cosmos (5 containers, TTLs), Azure OpenAI
      (gpt-4o), Doc Intelligence, Speech, Container Apps env + 3 apps, Key Vault secrets, App Insights
- [ ] `infra/docker/docker-compose.ai.yml` (+ Dockerfiles) for local: orchestrator, mcp-server, wa-service
- [x] `.env.ai.example` with every new var documented
- [ ] CI: azure-pipelines job for `ai/` (ruff + pytest) and wa-service (tsc + jest)
- [x] Deploy scripts + Vercel option for wa-service documented

### M6 — Documentation (docs/ai/)
- [ ] `ARCHITECTURE.md` (diagrams: context, sequence for the 8-step journey, data model)
- [ ] `SECURITY.md` (threat model, ADR-2 trade-offs, Meta signature, Key Vault, DPDP/IT-Act notes, SEC-0..2)
- [ ] `MONITORING.md` (metrics: OCR accuracy, WER, resolution accuracy, clarification rate, p95 latency <5s, cost/txn; App Insights queries; alerts)
- [ ] `DEPLOYMENT.md` + `RUNBOOK.md` (on-call: webhook down, queue backlog, LLM outage → degrade to "captured, will post later", rollback = re-point webhook to notification-service)
- [ ] `COST-MODEL.md` (per-message token/OCR/STT unit economics; target <₹500/mo/business)
- [ ] `EDGE-CASES.md` (100+ scenario matrix incl. the 15 from spec, each → expected behaviour + test ref)
- [ ] `ROADMAP.md` (Tally export, bank feeds, GST filing, dashboard insights panel, RS256 tokens)

### M7 — Verification & hardening
- [x] `tsc` build + jest green for wa-service (81 tests; no `ai/` Python plane exists — see reality update)
- [x] Adversarial multi-agent review (correctness, security, tenancy-leak, money-math) — findings fixed (2026-08-08 audit round 10 + data-plane build)
- [x] Manual E2E script: `scripts/e2e-smoke.ts` — real message → agents → REAL posting through the live local stack, ledger-verified (passed 2026-08-08; stronger than the planned mocked variant)
- [ ] Checklist sign-off in this file (blocked on M5/M6 + production Azure credentials)

---

## 5. Risks & Mitigations

| # | Risk | Mitigation |
|---|---|---|
| R1 | LLM hallucinates amounts/parties | Never post unconfirmed; every money action echoes a structured confirmation; amounts come from engines/OCR, not free LLM text |
| R2 | Meta webhook retries → double posting | wamid dedup + idempotent `/process` + dedup engine before Lekha |
| R3 | 15-min user JWTs unusable for async flows | ADR-2 minted 5-min tokens per tool call (no storage of user tokens) |
| R4 | GST-strip gotcha silently loses tax | ADR-7 saga + integration test asserting gst_amount lands |
| R5 | Purchase PATCH wipes sub-records | Tool always re-sends full arrays; covered by unit test |
| R6 | Cosmos/Service Bus unavailable locally | File/HTTP fallbacks (ADR-5/6); CI runs fully offline |
| R7 | Hinglish STT/OCR accuracy | Confidence thresholds → Poochna asks instead of guessing; metrics tracked (M6 monitoring) |
| R8 | Tenant leakage across businesses | Business id only from server-side `BusinessUser` lookup; tools require explicit business ctx; review pass includes tenancy audit |
| R9 | Cost blowout | Token budgets per message, gpt-4o-mini for samajh fast-path (configurable), caching of report answers (60s) |

## 6. Assumptions (inferred, documented)

1. PostgreSQL remains the ledger store; "Azure SQL" in the brief is satisfied by Azure Database for PostgreSQL (already provisioned).
2. Users must pre-exist (auth-service does not auto-create on OTP); unknown WhatsApp numbers get onboarding guidance, not accounts.
3. One WhatsApp Business number serves all tenants; tenant = sender's user → chosen business.
4. Hindi/Hinglish replies use Latin script by default (matches user input style); Devanagari honoured when user writes it.
5. `approvalThreshold` default ₹50,000, per-user override in memory doc.
6. Expense entry via AI is deferred until SEC-1 is fixed (expense-service unauthenticated); tracked in ROADMAP.
7. Databricks analytics from the brief map to the roadmap (existing reports cover daily/GST/P&L needs at current scale).

---

## 7. Definition of Done

A milestone is done only when: code + tests exist and pass locally, docs updated, env vars documented,
no secrets in tree, and the checklist above is ticked with evidence (test run output or file path).
