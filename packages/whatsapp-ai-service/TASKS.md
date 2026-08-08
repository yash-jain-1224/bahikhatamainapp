# =============================================================================
# BahiKhata WhatsApp AI - Production Task File
# =============================================================================
# Status: 🟢 Complete | 🟡 In Progress | 🔴 Not Started | ⚪ Blocked
# Priority: P0 (Critical) | P1 (High) | P2 (Medium) | P3 (Low)
# =============================================================================

## Phase 1: Core Architecture & Service Setup [🟢 COMPLETE]

### 1.1 WhatsApp AI Service Foundation
- [x] P0: Service package.json with all dependencies
- [x] P0: TypeScript configuration (strict mode)
- [x] P0: Express server with health check
- [x] P0: Route structure (webhook, conversations, agents, mcp, admin)
- [x] P0: Configuration management (env-based)
- [x] P0: Service initialization logic

### 1.2 Core Type Definitions
- [x] P0: WhatsApp webhook payload types
- [x] P0: Agent types (Intent, Entity, Document)
- [x] P0: Transaction types (Purchase, Sale, Payment, Expense)
- [x] P0: Conversation state & memory types
- [x] P0: MCP tool types
- [x] P0: Report types (Daily, GST, Outstanding, P&L)

### 1.3 Database Schema Extensions
- [x] P0: WhatsAppConversation model (Prisma)
- [x] P0: WhatsAppAIMessage model (message history)
- [x] P0: WhatsAppAITransaction model (pending/posted)
- [x] P0: WhatsAppAIApproval model (human approval flow)
- [x] P0: WhatsAppAIDocument model (processed docs)
- [x] P0: Proper indexing strategy

---

## Phase 2: WhatsApp Integration [🟢 COMPLETE]

### 2.1 Webhook Handler
- [x] P0: GET /webhook - Meta verification endpoint
- [x] P0: POST /webhook - Message receiver
- [x] P0: Signature verification (HMAC SHA-256)
- [x] P0: Immediate 200 response (Meta 20s requirement)
- [x] P0: Async message processing

### 2.2 WhatsApp Client
- [x] P0: Send text messages
- [x] P0: Send interactive button messages (max 3 buttons)
- [x] P0: Send list messages (up to 10 items)
- [x] P0: Send template messages
- [x] P0: Mark messages as read
- [x] P0: Download media (images, audio, documents)
- [x] P0: Send reactions

---

## Phase 3: Multi-Agent System (LangGraph) [🟢 COMPLETE]

### 3.1 Agent Orchestrator
- [x] P0: LangGraph-style state machine
- [x] P0: Sequential agent pipeline execution
- [x] P0: Intent-based routing
- [x] P0: Pending clarification handling
- [x] P0: Pending approval handling
- [x] P0: Error recovery & user-friendly error messages
- [x] P0: Performance logging (target <5s)

### 3.2 Samajh Agent (Intent Understanding)
- [x] P0: Rule-based fast-path classification (>90% confidence)
- [x] P0: AI-powered classification (GPT-4o fallback)
- [x] P0: Hindi/English/Hinglish language detection
- [x] P0: Entity extraction (amounts, dates, parties, items)
- [x] P0: Indian number format parsing (hazaar, lakh, crore)
- [x] P0: GSTIN pattern matching
- [x] P0: UPI reference extraction
- [x] P0: Payment mode detection
- [x] P0: Quantity + Unit extraction

### 3.3 Dastaveez Agent (Document Processing)
- [x] P0: WhatsApp media download
- [x] P0: Document type classification
- [x] P0: UPI screenshot processing (GPT-4o Vision)
- [x] P0: Invoice/Bill processing (Azure Doc Intelligence)
- [x] P0: GPT-4o Vision fallback for all documents
- [x] P0: Audio/Voice note processing pipeline
- [x] P0: GSTIN extraction from documents
- [x] P0: Tax breakdown extraction (CGST/SGST/IGST)
- [x] P1: Handwritten bill support (kachchi parchi)
- [x] P1: Rotated/blurry image handling

### 3.4 Pehchaan Agent (Entity Resolution)
- [x] P0: Learned entity mapping lookup (fast path)
- [x] P0: Azure AI Search (vector + semantic)
- [x] P0: Fuzzy database search (fallback)
- [x] P0: Hindi transliteration variant generation
- [x] P0: Frequency-based ranking (recent parties first)
- [x] P0: Smart clarification messages
- [x] P0: Auto-learn after N confirmations

### 3.5 Jaanch Agent (Validation)
- [x] P0: Amount validation (range, format, rounding)
- [x] P0: GSTIN validation (format + checksum)
- [x] P0: Date validation (backdated, future)
- [x] P0: Required field validation per intent
- [x] P0: Duplicate detection (bill number + vendor)
- [x] P0: Semantic duplicate (amount ±5% + vendor + time window)
- [x] P0: UPI reference duplicate check
- [x] P0: Large amount warnings

### 3.6 Lekha Agent (Transaction Processing)
- [x] P0: Purchase entry creation
- [x] P0: Sales entry creation
- [x] P0: Vendor payment recording
- [x] P0: Customer receipt recording
- [x] P0: Expense entry creation
- [x] P0: Stock update
- [x] P0: Party creation flow
- [x] P0: Item creation flow
- [x] P0: Confirmation message formatting
- [x] P0: Approval threshold checking

### 3.7 Hisaab Agent (Reporting)
- [x] P0: Outstanding report (per party / total)
- [x] P0: GST summary report
- [x] P0: Daily summary
- [x] P0: Stock report
- [x] P0: Profit & Loss
- [x] P0: Cash/Bank position
- [x] P0: Natural language query (AI-powered)
- [x] P1: Cached reports via Redis

---

## Phase 4: Supporting Services [🟢 COMPLETE]

### 4.1 Azure OpenAI Service
- [x] P0: Chat completion API
- [x] P0: Vision API (image analysis)
- [x] P0: Function calling support
- [x] P0: Development mock mode (no credentials needed)
- [x] P0: Error handling & retries

### 4.2 Speech Service (Hindi STT)
- [x] P0: Azure Speech-to-Text integration
- [x] P0: Hindi (hi-IN) language model
- [x] P0: English (en-IN) fallback
- [x] P0: Audio format conversion awareness
- [x] P1: Multilingual auto-detection

### 4.3 Memory Service (Cosmos DB + In-Memory)
- [x] P0: Conversation state management
- [x] P0: In-memory store for development
- [x] P0: Cosmos DB persistence for production
- [x] P0: Entity mapping learning
- [x] P0: Message history management
- [x] P0: Context update
- [x] P0: Auto-learn threshold (5 confirmations)

### 4.4 GST Computation Engine
- [x] P0: GST computation (inclusive/exclusive)
- [x] P0: CGST + SGST split (intrastate)
- [x] P0: IGST computation (interstate)
- [x] P0: GSTIN validation with checksum
- [x] P0: State code lookup (all 37 codes)
- [x] P0: HSN code validation
- [x] P0: GST rate suggestion from HSN
- [x] P0: Net payable computation (ITC offset)
- [x] P0: Reverse charge mechanism check
- [x] P0: Entity type detection from PAN

---

## Phase 5: MCP Tools [🟢 COMPLETE]

### 5.1 Tool Registry
- [x] P0: 16 tools defined with parameters
- [x] P0: Tool discovery endpoint (GET /mcp/tools)
- [x] P0: Tool execution endpoint (POST /mcp/execute)
- [x] P0: Batch execution endpoint
- [x] P0: Parameter validation

### 5.2 Tool Categories
- [x] P0: Party tools (search, create, outstanding)
- [x] P0: Item tools (search, create, stock)
- [x] P0: Accounting tools (purchase, sale, payment)
- [x] P0: Reporting tools (daily, GST, cash flow, P&L, stock)
- [x] P0: Utility tools (validate_gstin, parse_amount)

---

## Phase 6: Frontend Dashboard [🟢 COMPLETE]

### 6.1 WhatsApp AI Dashboard Component
- [x] P1: Agent status overview (6 agents)
- [x] P1: System metrics cards
- [x] P1: Intent classification tester
- [x] P1: Chat simulator (WhatsApp-style UI)
- [x] P1: MCP tools explorer
- [x] P1: Quick test buttons with real scenarios

---

## Phase 7: Prompt Engineering [🟢 COMPLETE]

### 7.1 Prompt Templates
- [x] P0: Samajh system prompt (intent classification)
- [x] P0: Dastaveez invoice extraction prompt
- [x] P0: Dastaveez UPI screenshot prompt
- [x] P0: Hisaab reporting prompt
- [x] P0: Clarification message templates (Hindi)
- [x] P0: Confirmation message templates
- [x] P0: Error message templates (Hindi/Hinglish)

---

## Phase 8: Infrastructure [🟢 COMPLETE]

### 8.1 Azure Resource Configuration
- [x] P0: Azure OpenAI (GPT-4o deployment)
- [x] P0: Cosmos DB (containers + partition keys)
- [x] P0: Azure AI Search (semantic + vector index)
- [x] P0: Document Intelligence (custom models)
- [x] P0: Speech Services (Hindi + English)
- [x] P0: Blob Storage (documents, images, audio)
- [x] P0: Service Bus (queues + topics)
- [x] P0: Redis Cache
- [x] P0: Container Apps (auto-scaling rules)
- [x] P0: Key Vault (secrets list)
- [x] P0: Application Insights (custom metrics)
- [x] P0: Cost estimation (₹485/month/business)

### 8.2 Deployment Configuration
- [x] P0: Vercel deployment config
- [x] P0: Environment variable template (.env.example)
- [x] P0: API Gateway route registration (port 3013)

---

## Phase 9: Testing & Quality [🟡 IN PROGRESS]

### 9.1 Test Scenarios Endpoint
- [x] P1: 10 built-in edge case test scenarios
- [ ] P1: Automated intent classification tests
- [ ] P1: Document processing tests (sample images)
- [ ] P1: Entity resolution accuracy tests
- [ ] P1: GST computation unit tests
- [ ] P1: Amount parsing tests (Hindi/English)
- [ ] P2: E2E webhook simulation tests
- [ ] P2: Performance benchmarks (<5s target)

---

## Phase 10: Production Readiness [� IN PROGRESS]

### 10.1 Security [🟢 COMPLETE]
- [x] P0: WhatsApp webhook signature verification (HMAC-SHA256 + timing-safe compare)
- [x] P0: Webhook replay protection (message freshness check, 5-min max age)
- [x] P0: API key authentication for all routes (service, dashboard, admin levels)
- [x] P0: Rate limiting per user, per IP, per route (sliding window)
- [x] P0: Input sanitization (XSS, SQL injection, NoSQL injection, command injection)
- [x] P0: Request body size limits per route type
- [x] P1: PII masking in logs (phone, GSTIN, Aadhaar, PAN, email, bank, API keys)
- [x] P1: Security headers (HSTS, CSP, permissions policy, no-sniff)
- [x] P1: CORS hardening (strict origins in production)
- [x] P1: Request ID tracking (correlation across logs)
- [x] P1: Suspicious activity detection (scanner/probe detection)
- [x] P1: IP allowlist for admin routes (configurable)
- [x] P1: Zod request validation schemas (typed input validation)
- [x] P1: Secure logger (structured, PII-safe, audit trail)
- [x] P1: Timing-safe API key comparison (prevent timing attacks)
- [ ] P2: Azure WAF configuration (deployed via Bicep/ARM)

### 10.2 Monitoring [🟢 COMPLETE]
- [x] P1: Response time tracking per agent (p50/p95/p99 latency)
- [x] P1: Error rate alerting (automatic threshold detection)
- [x] P1: Cost per transaction tracking (Azure OpenAI token cost in INR)
- [x] P1: User satisfaction scoring (per-user and global)
- [x] P1: Full metrics dashboard endpoint (/api/v1/wa/metrics/dashboard)
- [x] P1: Prometheus-compatible metrics export (/api/v1/wa/metrics/prometheus)
- [x] P1: Per-agent performance breakdown (samajh, dastaveez, etc.)
- [x] P1: Intent distribution tracking
- [x] P1: Active alerts system (latency, error rate, cost, memory)
- [x] P1: Sliding window counters (1-min, 5-min aggregations)
- [ ] P2: OCR accuracy dashboards (needs production data)
- [ ] P2: Speech-to-text WER tracking (needs production data)

### 10.3 Scalability
- [ ] P1: Redis session cache (replace in-memory)
- [ ] P1: Service Bus integration (queue messages)
- [ ] P1: Cosmos DB with proper RU provisioning
- [ ] P2: Auto-scaling rules tuning
- [ ] P2: CDN for static assets

---

## Edge Cases Matrix (Indian Business Specific)

| # | Scenario | Status | Handling |
|---|----------|--------|----------|
| 1 | "Ram ko 15 hazaar diye" (Which Ram?) | ✅ | Pehchaan agent: multi-match → clarify |
| 2 | Bill photo rotated 90° | ✅ | GPT-4o Vision handles rotation |
| 3 | Handwritten bill (Hindi numerals) | ✅ | Vision API + OCR fallback |
| 4 | Voice note with shop noise | ✅ | Azure Speech noise-robust model |
| 5 | Same vendor, two GSTINs | ✅ | Store multiple GSTINs per party |
| 6 | Partial payment against multiple invoices | ✅ | Match payment to oldest first |
| 7 | Return/Credit note | ✅ | Detect via keywords + amount sign |
| 8 | Interstate vs Intrastate GST | ✅ | GSTIN state code comparison |
| 9 | Reverse charge mechanism | ✅ | Service type detection |
| 10 | Mixed personal/business expense | ✅ | Prompt for classification |
| 11 | "Kal" = yesterday or tomorrow | ✅ | Default yesterday for transactions |
| 12 | Amount in lakhs vs thousands (1.5) | ✅ | Context-aware parsing |
| 13 | Hindi Unicode vs English transliteration | ✅ | Fuzzy variant generation |
| 14 | Multiple messages = one transaction | 🟡 | Context accumulation in memory |
| 15 | Correction of previous entry | ✅ | Correction flow with entry search |

---

## Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Agent Framework | LangGraph-style custom | Lower latency, full control |
| LLM | Azure OpenAI GPT-4o | Best Hindi/Hinglish, Vision |
| Document OCR | Azure Doc Intelligence + GPT-4o | Handles Indian formats |
| Speech-to-Text | Azure Speech (hi-IN) | Best Hindi accuracy |
| Entity Store | Azure AI Search | Vector + Semantic search |
| Session Store | Redis + Cosmos DB | Speed + Persistence |
| Message Queue | Azure Service Bus | Reliable, ordered delivery |
| Frontend | React + Vite (existing) | Already deployed on Vercel |
| Database | PostgreSQL (Prisma) | Existing ledger schema |
| Memory | Cosmos DB | Flexible JSON, TTL, global |

---

## Cost Estimation (per 100 businesses)

| Service | Monthly Cost (INR) |
|---------|-------------------|
| Azure OpenAI (100K tokens/day) | ₹15,000 |
| Cosmos DB (10K RU/s) | ₹8,000 |
| Azure SQL (Serverless Gen5) | ₹5,000 |
| Azure AI Search (Basic) | ₹5,000 |
| Document Intelligence (1K pages) | ₹3,000 |
| Speech Services (100 hrs) | ₹2,000 |
| Blob Storage (50 GB) | ₹500 |
| Service Bus (Standard) | ₹2,000 |
| Redis Cache (Basic C1) | ₹3,000 |
| Container Apps (1-10 replicas) | ₹5,000 |
| **Total** | **₹48,500/month** |
| **Per Business** | **₹485/month** |

Target pricing: < ₹500/month/business ✅

---

## Roadmap (Future Phases)

### Phase 11: Tally Integration
- [ ] Export to Tally XML format
- [ ] Import from Tally masters
- [ ] Two-way sync capability

### Phase 12: Bank Feed Integration
- [ ] Bank statement parsing (PDF/CSV)
- [ ] Auto-reconciliation
- [ ] UPI notification auto-capture

### Phase 13: Automated GST Filing
- [ ] GSTR-1 data preparation
- [ ] GSTR-3B computation
- [ ] E-invoice generation
- [ ] E-way bill creation

### Phase 14: Business Intelligence
- [ ] Cash flow predictions
- [ ] Seasonal pattern detection
- [ ] Vendor performance scoring
- [ ] Payment delay prediction
- [ ] Inventory reorder alerts

### Phase 15: Multi-user WhatsApp
- [ ] Business WhatsApp group support
- [ ] Role-based message routing
- [ ] Staff expense approvals
- [ ] Owner notification preferences
