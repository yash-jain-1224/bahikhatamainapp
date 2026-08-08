# 📒 Bahi Khata Pro

> **Production-ready, multi-tenant SaaS ERP** built for Indian small and medium businesses — featuring Mandi-style purchases, lot-based sales, double-entry ledger, subscription billing, RBAC, and a full-featured React Native mobile app.

[![Node](https://img.shields.io/badge/Node-%3E%3D20-green)](https://nodejs.org) [![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue)](https://www.typescriptlang.org) [![React](https://img.shields.io/badge/React-19-61dafb)](https://react.dev) [![React Native](https://img.shields.io/badge/React%20Native-0.79-61dafb)](https://reactnative.dev) [![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791)](https://www.postgresql.org) [![Redis](https://img.shields.io/badge/Redis-7-dc382d)](https://redis.io) [![Prisma](https://img.shields.io/badge/Prisma-ORM-2d3748)](https://www.prisma.io) [![Docker](https://img.shields.io/badge/Docker-Compose-2496ed)](https://www.docker.com)

---

## Deployed Environments

- **Frontend**: https://bahi-khata-frontend.vercel.app
- **API Gateway**: https://api-gateway-navy-eta.vercel.app
- **Database**: Azure PostgreSQL (Central India)
- **Backend**: 13 microservices on Vercel

Check live health with `./status.sh`, or run the full smoke suite with `./verify-deployment.sh`.

**📚 Documentation**:
- [`DEPLOYMENT.md`](./DEPLOYMENT.md) - Azure + Vercel deployment and environment setup
- [`.env.example`](./.env.example) - Environment variable reference
- [`TASKS.md`](./TASKS.md) - Active WhatsApp AI assistant workstream
- [`docs/referral-migration.md`](./docs/referral-migration.md) - Referral system schema migration

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Microservices & Ports](#microservices--ports)
- [Features](#features)
- [Database Schema](#database-schema)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Local Development](#local-development)
  - [Docker Setup](#docker-setup)
- [Mobile App](#mobile-app)
- [Environment Variables](#environment-variables)
- [API Reference](#api-reference)
- [RBAC & Permissions](#rbac--permissions)
- [Testing](#testing)
- [CI/CD & Deployment](#cicd--deployment)
- [Scripts Reference](#scripts-reference)

---

## Overview

Bahi Khata Pro is a full-stack SaaS ERP designed for Indian trading and manufacturing businesses. It handles the complete business lifecycle — from purchasing goods from a mandi, managing inventory via lot-based sales, recording payments, tracking outstanding balances, generating financial reports, and managing subscriptions with a referral programme.

The system runs as **13 independent microservices** behind a single API Gateway, with a React web frontend, a React Native mobile app (iOS + Android), and a marketing website.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        Clients                                    │
│   Web (Vite/React)    Mobile (React Native)    Website (Vite)    │
└──────────────────┬───────────────────┬──────────────────────────┘
                   │                   │
                   ▼                   ▼
          ┌─────────────────────────────────┐
          │         API Gateway :3000        │
          │  (http-proxy-middleware, Helmet, │
          │   CORS, Compression, Morgan)     │
          └──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┘
             │  │  │  │  │  │  │  │  │  │  │
    ┌────────┘  │  │  │  │  │  │  │  │  │  └──────────┐
    ▼           ▼  │  ▼  │  ▼  │  ▼  │  ▼             ▼
  Auth      Business│Purchase│Sales│Inventory│Ledger  Referral
  :3001     :3002  │ :3003 │:3004│  :3005  │:3006    :3012
                   ▼       ▼    ▼          ▼
               Subscription Billing  Notification  Admin  Profile
                  :3007    :3008      :3009       :3010  :3011
                              │
                   ┌──────────┴──────────┐
                   ▼                     ▼
             PostgreSQL 16           Redis 7
              (Prisma ORM)       (Sessions, Cache,
                                  OTP, Pub/Sub)
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Runtime** | Node.js ≥ 20, TypeScript 5.4 |
| **Web Frontend** | React 19, Vite, Tailwind CSS, Redux Toolkit, shadcn/ui |
| **Mobile** | React Native 0.79, React Navigation, Redux Toolkit, Axios |
| **Marketing Website** | React 19, Vite, Tailwind CSS, i18next (11 Indian languages) |
| **Backend Framework** | Express.js (per service) |
| **API Gateway** | http-proxy-middleware, Helmet, CORS, Compression |
| **Database** | PostgreSQL 16 via Prisma ORM |
| **Cache / Sessions** | Redis 7 |
| **Auth** | JWT (access 15m + refresh 7d), OTP (phone-based) |
| **File Uploads** | Multer (local disk; S3-compatible in production) |
| **Validation** | Zod |
| **Testing** | Jest, Playwright (E2E), k6 (load) |
| **CI/CD** | Azure DevOps Pipelines |
| **Container** | Docker Compose (dev), Kubernetes / AKS (production) |

---

## Project Structure

```
Bahi-Khata/
├── packages/                    # Backend microservices (npm workspaces)
│   ├── api-gateway/             # Reverse proxy & entry point
│   ├── auth-service/            # OTP login, JWT, refresh tokens
│   ├── business-service/        # Business CRUD, logo upload, multi-tenant
│   ├── purchase-service/        # Mandi-style purchases, expenses, attachments
│   ├── sales-service/           # Lot-based sales, payments, receipts
│   ├── inventory-service/       # Items, categories, stock adjustments
│   ├── ledger-service/          # Double-entry ledger, reports
│   ├── billing-service/         # Payments, outstanding bills, invoices
│   ├── notification-service/    # In-app notifications, payment reminders
│   ├── subscription-service/    # Plans, subscriptions, billing cycles
│   ├── admin-service/           # Super-admin dashboard, users, plans
│   ├── profile-service/         # User profile, avatar, parties, cutters
│   ├── referral-service/        # Referral codes, rewards, leaderboard
│   └── shared/                  # Prisma schema, shared utils, middleware
│       └── prisma/
│           └── schema.prisma    # Single source of truth for DB schema
├── frontend/                    # React web app (Vite + Tailwind)
│   └── src/
│       ├── components/          # Feature components (admin, sales, etc.)
│       ├── store/               # Redux slices (auth, business)
│       ├── lib/api.ts           # Axios client + all API calls
│       └── types/               # TypeScript interfaces
├── mobile/                      # React Native app (iOS + Android)
│   └── src/
│       ├── screens/             # All app screens
│       ├── navigation/          # Stack & tab navigators
│       ├── components/shared/   # Reusable components (Avatar, Button, etc.)
│       ├── store/               # Redux slices
│       ├── services/api.ts      # Axios client + all API calls
│       └── theme/               # Colors, typography, dark/light mode
├── website/                     # Marketing website (Vite + Tailwind)
│   └── src/
│       ├── sections/            # Hero, Features, Pricing, Testimonials, etc.
│       └── pages/               # About, Blog, Contact, Download, etc.
├── infra/
│   ├── docker/                  # Dockerfiles + docker-compose.yml
│   ├── k8s/base/                # Kubernetes manifests (AKS)
│   ├── azure-devops/            # CI/CD pipeline YAML
│   └── scripts/                 # Dev setup scripts
├── tests/
│   ├── api/                     # API tests (Jest + Supertest)
│   ├── e2e/                     # End-to-end tests (Playwright)
│   ├── integration/             # UI ↔ API integration tests
│   └── load/                    # Load tests (k6) — 100K concurrent users
├── .env.example                 # All environment variables documented
├── package.json                 # Root workspace scripts
└── README.md
```

---

## Microservices & Ports

| Service | Port | Responsibility |
|---|---|---|
| **API Gateway** | `3000` | Single entry point, reverse proxy, auth header forwarding |
| **Auth Service** | `3001` | OTP send/verify, JWT issue/refresh, logout |
| **Business Service** | `3002` | Multi-tenant businesses, logo upload, dashboard stats |
| **Purchase Service** | `3003` | Mandi purchases, expenses, payment receipts, attachments |
| **Sales Service** | `3004` | Lot-based sales, sale payments, attachments |
| **Inventory Service** | `3005` | Items, categories, stock adjustment, transactions |
| **Ledger Service** | `3006` | Double-entry ledger, party ledger, trial balance, P&L, balance sheet |
| **Subscription Service** | `3007` | Plans, subscriptions, trial, cancel |
| **Billing Service** | `3008` | Payments, bulk payments, outstanding bills, invoices |
| **Notification Service** | `3009` | In-app notifications, mark read, payment reminders |
| **Admin Service** | `3010` | Super-admin: users, businesses, plans, audit logs, analytics |
| **Profile Service** | `3011` | User profile, avatar upload, parties, cutters, expense types |
| **Referral Service** | `3012` | Referral codes, apply code, rewards, leaderboard |

---

## Features

### 🏢 Multi-Tenant Business Management
- Create and manage multiple businesses per user account
- Business logo upload (stored at `/uploads/business/logos/`)
- Role-based access per business (Owner, Manager, Accountant, Staff)
- Business-level dashboard with revenue, expenses, and outstanding stats

### 🛒 Mandi-Style Purchases
- Record purchases with item details, weight, rate, and totals
- Attach bills/receipts (PDF, image)
- Track payment status (paid / partial / unpaid)
- Upload payment receipts separately

### 📦 Lot-Based Sales
- Create sales lots with multiple items
- Track individual sale payments
- Outstanding balance tracking per party
- Attachment support for invoices/receipts

### 📊 Double-Entry Ledger
- Automatic ledger entries on every purchase, sale, and payment
- Party-wise ledger view
- Trial Balance, Profit & Loss, Balance Sheet reports
- Day Book with full transaction history
- Outstanding report (payable/receivable)

### 💰 Billing & Payments
- Record payments against purchases or sales
- Bulk payment recording
- Upload payment receipts
- Invoice generation and listing

### 📦 Inventory Management
- Item and category management
- Stock adjustment (manual corrections)
- Low-stock alerts
- Transaction history per item
- Seed default items for quick setup

### 👤 User Profile & Parties
- Profile photo (avatar) upload
- Party management (customers/suppliers)
- Bank account management
- Cutters management (for garment/textile businesses)
- Custom expense types

### 🔔 Notifications
- In-app notification feed
- Mark single or all as read
- Payment reminder push to parties

### 📱 Subscription & Plans
- Tiered plans: Basic, Growth, Enterprise
- Billing cycles: Monthly, Quarterly, Half-Yearly, Yearly
- 14-day free trial
- Manual subscription management (admin)

### 🎁 Referral Programme
- Generate unique referral codes
- Apply referred codes on signup
- Earn rewards on successful referrals
- Leaderboard

### 🔐 Authentication & RBAC
- Phone-based OTP login (no password required)
- Optional email + password login
- JWT access tokens (15 min) + refresh tokens (7 days)
- Silent token refresh on the client
- Role-based permissions per business

### 🌐 Internationalisation
- 11 Indian languages: English, Hindi, Bengali, Gujarati, Kannada, Malayalam, Marathi, Odia, Punjabi, Tamil, Telugu

### 🛡️ Security
- Helmet security headers on every service
- CORS enforced at gateway
- JWT validation middleware on all protected routes
- Rate limiting recommended at infrastructure level (Nginx/Cloudflare/WAF)
- Audit logging on all mutations

---

## Database Schema

The entire schema lives in `packages/shared/prisma/schema.prisma` — a single source of truth used by all services via `@bahi-khata/shared`.

**Core models:**

| Model | Description |
|---|---|
| `User` | Accounts, OTP, super-admin flag |
| `UserProfile` | Name, avatar, bank accounts |
| `Business` | Multi-tenant businesses, logo |
| `BusinessUser` | User ↔ Business role mapping |
| `Purchase` | Mandi purchase records |
| `PurchaseItem` | Line items per purchase |
| `PurchasePayment` | Payments against purchases |
| `Sale` | Sales lot |
| `SaleItem` | Items in a sale lot |
| `SalePayment` | Payments against sales |
| `InventoryItem` | Stock items |
| `StockTransaction` | Inventory adjustment history |
| `LedgerEntry` | Double-entry bookkeeping rows |
| `Party` | Customers / suppliers |
| `Payment` | Standalone payment records |
| `Invoice` | Generated invoices |
| `SubscriptionPlan` | Plans definition |
| `Subscription` | Active subscriptions |
| `Notification` | In-app notifications |
| `Referral` | Referral relationships |
| `AuditLog` | Full audit trail |
| `RefreshToken` | JWT refresh token store |

---

## Getting Started

### Prerequisites

- **Node.js** ≥ 20
- **npm** ≥ 10
- **PostgreSQL** 16
- **Redis** 7
- **Xcode** (for iOS mobile builds)
- **Android Studio** + Android SDK (for Android mobile builds)

### Local Development

**1. Clone and install dependencies**
```bash
git clone https://github.com/yash-jain-1224/bahi-khata-pro.git
cd bahi-khata-pro
npm install
cd mobile && npm install && cd ..
```

**2. Set up environment**
```bash
cp .env.example .env
# Edit .env with your DATABASE_URL, REDIS_URL, JWT_SECRET, etc.
```

**3. Set up the database**
```bash
# Generate Prisma client
npm run db:generate

# Run migrations
npm run db:migrate

# Seed default data (plans, sample business, etc.)
npm run db:seed
```

**4. Start all backend services + frontend**
```bash
npm run dev:all
```

This starts all 13 microservices and the frontend simultaneously using `concurrently`.

| URL | Service |
|---|---|
| `http://localhost:3000` | API Gateway |
| `http://localhost:5173` | Web Frontend |
| `http://localhost:5174` | Marketing Website (`npm run dev:website`) |

**5. Start individual services** (optional)
```bash
npm run dev:gateway      # API Gateway only
npm run dev:auth         # Auth Service only
npm run dev:business     # Business Service only
# ... etc.
```

### Docker Setup

```bash
# Build all images
npm run docker:build

# Start all containers (PostgreSQL, Redis + all services)
npm run docker:up

# Stop all containers
npm run docker:down
```

> Services are defined in `infra/docker/docker-compose.yml`. All microservices share the same Dockerfile (`infra/docker/Dockerfile.service`) with a `SERVICE_NAME` build arg.

---

## Mobile App

The React Native app (`/mobile`) targets **iOS** and **Android** and has full feature parity with the web app.

### Run on Simulator/Emulator

```bash
cd mobile

# Start Metro bundler (with cache reset)
npx react-native start --reset-cache

# iOS simulator (separate terminal)
npx react-native run-ios --simulator='iPhone 17 Pro'

# Android emulator (separate terminal)
npx react-native run-android
```

### Run on Physical Device

Physical devices need the Mac's LAN IP to reach the dev server:

```bash
# Find your Mac's LAN IP
ipconfig getifaddr en0
```

Update `DEV_MACHINE_IP` in `mobile/src/services/api.ts`:
```typescript
const DEV_MACHINE_IP = '192.168.x.x'; // your Mac's IP
```

Then start Metro bound to that IP:
```bash
npx react-native start --reset-cache --host 192.168.x.x
```

**For Android physical device**, forward ports over USB:
```bash
adb reverse tcp:3000 tcp:3000   # API Gateway
adb reverse tcp:8081 tcp:8081   # Metro Bundler
```

### Mobile App Screens

| Navigator | Screens |
|---|---|
| **Auth** | Login (OTP) |
| **Dashboard** | Stats, recent activity, business switcher |
| **Purchases** | List, Create, Detail |
| **Sales** | List, Create, Detail, Lots |
| **Inventory** | List, Create, Detail, Stock Adjust |
| **Ledger** | Entries, Party Ledger |
| **Payments** | List, Record Payment |
| **More** | Parties, Notifications, Reports, Referrals, Subscription, Profile, Business Settings, Help |

### Image URLs (Mobile ↔ Backend)

The backend stores uploaded files (avatars, logos) as **relative paths** (e.g. `/uploads/avatars/file.jpg`). The mobile `getImageUrl()` helper in `api.ts` converts these to full URLs using the API host automatically.

---

## Environment Variables

Copy `.env.example` to `.env` and fill in the values:

```bash
# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/bahi_khata_pro

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=your-secret-here
JWT_REFRESH_SECRET=your-refresh-secret-here

# Service Ports (defaults shown)
API_GATEWAY_PORT=3000
AUTH_SERVICE_PORT=3001
# ... (3002–3012 for other services)

# CORS (comma-separated origins)
CORS_ORIGIN=http://localhost:5173,http://localhost:5174

# Razorpay (payment gateway)
RAZORPAY_KEY_ID=rzp_test_xxxxx
RAZORPAY_KEY_SECRET=xxxxx

# Twilio (OTP SMS)
TWILIO_ACCOUNT_SID=xxxxx
TWILIO_AUTH_TOKEN=xxxxx
TWILIO_PHONE_NUMBER=+1xxxxxxxxxx
```

---

## API Reference

All requests go through the **API Gateway** at `http://localhost:3000`.

### Authentication

```
POST /api/v1/auth/send-otp          Send OTP to phone
POST /api/v1/auth/verify-otp        Verify OTP → returns JWT
POST /api/v1/auth/login             Email + password login
POST /api/v1/auth/register          Register new user
POST /api/v1/auth/refresh           Refresh access token
POST /api/v1/auth/logout            Invalidate refresh token
GET  /api/v1/auth/me                Current user info
```

### Business

```
GET    /api/v1/business             List user's businesses
POST   /api/v1/business             Create business
GET    /api/v1/business/:id         Get business details
PATCH  /api/v1/business/:id         Update business
PATCH  /api/v1/business/:id/logo    Upload logo (multipart)
DELETE /api/v1/business/:id/logo    Remove logo
GET    /api/v1/business/dashboard   Dashboard stats
```

### Purchases

```
GET    /api/v1/purchases                          List purchases
POST   /api/v1/purchases                          Create purchase
GET    /api/v1/purchases/:id                      Get purchase
PATCH  /api/v1/purchases/:id                      Update purchase
DELETE /api/v1/purchases/:id                      Delete purchase
POST   /api/v1/purchases/:id/attachments          Upload attachment
DELETE /api/v1/purchases/:id/attachments/:attId   Remove attachment
POST   /api/v1/purchases/payments/receipt-upload  Upload payment receipt
```

### Sales

```
GET    /api/v1/sales                              List sales
POST   /api/v1/sales                              Create sale
GET    /api/v1/sales/:id                          Get sale
PATCH  /api/v1/sales/:id                          Update sale
DELETE /api/v1/sales/:id                          Delete sale
GET    /api/v1/sales/lots/all                     List lots
GET    /api/v1/sales/lots/:id                     Get lot detail
POST   /api/v1/sales/:id/attachments              Upload attachment
POST   /api/v1/sales/payments/receipt-upload      Upload payment receipt
```

### Inventory

```
GET    /api/v1/inventory/items              List items
POST   /api/v1/inventory/items             Create item
GET    /api/v1/inventory/items/:id          Get item
PATCH  /api/v1/inventory/items/:id          Update item
DELETE /api/v1/inventory/items/:id          Delete item
GET    /api/v1/inventory/items/low-stock    Low-stock items
GET    /api/v1/inventory/categories         List categories
POST   /api/v1/inventory/categories         Create category
POST   /api/v1/inventory/adjust             Adjust stock
GET    /api/v1/inventory/transactions       Transaction history
GET    /api/v1/inventory/dashboard          Inventory stats
POST   /api/v1/inventory/seed               Seed default items
POST   /api/v1/inventory/prune-seeded       Remove seeded items
```

### Ledger

```
GET  /api/v1/ledger/entries                  All ledger entries
GET  /api/v1/ledger/party/:partyId           Party ledger
GET  /api/v1/ledger/party/:partyId/statement Party statement
POST /api/v1/ledger/entries                  Create manual entry
GET  /api/v1/ledger/trial-balance            Trial balance report
GET  /api/v1/ledger/profit-loss              P&L report
GET  /api/v1/ledger/balance-sheet            Balance sheet
GET  /api/v1/ledger/outstanding              Outstanding report
GET  /api/v1/ledger/day-book                 Day book
```

### Billing

```
GET  /api/v1/billing/payments                     List payments
POST /api/v1/billing/payments                     Create payment
POST /api/v1/billing/payments/bulk                Bulk payment
GET  /api/v1/billing/outstanding/:partyId         Party outstanding bills
POST /api/v1/billing/payments/:id/receipt         Upload receipt
GET  /api/v1/billing/invoices                     List invoices
```

### Profile

```
GET    /api/v1/profile/me              Get profile
PATCH  /api/v1/profile/me              Update profile
POST   /api/v1/profile/me/avatar       Upload avatar (multipart)
DELETE /api/v1/profile/me/avatar       Remove avatar
GET    /api/v1/profile/parties         List parties
POST   /api/v1/profile/parties         Create party
GET    /api/v1/profile/parties/:id     Get party
PATCH  /api/v1/profile/parties/:id     Update party
GET    /api/v1/profile/cutters         List cutters
POST   /api/v1/profile/cutters         Create cutter
PATCH  /api/v1/profile/cutters/:id     Update cutter
DELETE /api/v1/profile/cutters/:id     Delete cutter
GET    /api/v1/profile/expense-types   List expense types
POST   /api/v1/profile/expense-types   Create expense type
```

### Other Endpoints

```
# Notifications
GET   /api/v1/notifications              List notifications
PATCH /api/v1/notifications/:id/read     Mark as read
PATCH /api/v1/notifications/read-all     Mark all as read
POST  /api/v1/notifications/payment-reminder  Send reminder

# Subscriptions
GET  /api/v1/subscriptions/plans     List plans
GET  /api/v1/subscriptions/current   Current subscription
POST /api/v1/subscriptions           Subscribe to plan
POST /api/v1/subscriptions/cancel    Cancel subscription

# Referrals
GET  /api/v1/referrals/my-referrals  My referrals
GET  /api/v1/referrals/eligibility   Check eligibility
POST /api/v1/referrals/code          Generate referral code
POST /api/v1/referrals/apply         Apply referral code
POST /api/v1/referrals/redeem        Redeem rewards
GET  /api/v1/referrals/leaderboard   Leaderboard

# Admin (Super Admin only)
GET    /api/v1/admin/dashboard
GET    /api/v1/admin/users
POST   /api/v1/admin/users
PATCH  /api/v1/admin/users/:id/status
PATCH  /api/v1/admin/users/:id/admin
DELETE /api/v1/admin/users/:id
GET    /api/v1/admin/businesses
PATCH  /api/v1/admin/businesses/:id/status
GET    /api/v1/admin/plans
POST   /api/v1/admin/plans
PATCH  /api/v1/admin/plans/:id
POST   /api/v1/admin/subscriptions/manual
GET    /api/v1/admin/invoices
GET    /api/v1/admin/audit-logs
GET    /api/v1/admin/analytics/subscriptions
GET    /api/v1/admin/settings
PUT    /api/v1/admin/settings

# Static file proxies
GET /uploads/business/:filename    Business logos
GET /uploads/avatars/:filename     User profile photos
```

---

## RBAC & Permissions

Every request to a protected route carries a JWT and an `x-business-id` header. The shared middleware resolves the user's role in that business and checks permissions.

| Role | Key Permissions |
|---|---|
| **Owner** | Full access including user management, business settings, subscription |
| **Manager** | Create/edit purchases, sales, inventory; invite users |
| **Accountant** | View all + create/edit ledger and payments |
| **Staff** | Create purchases and sales; view inventory |

---

## Testing

```bash
# Unit / API tests (Jest + Supertest)
npm run test:api

# End-to-end tests (Playwright)
npm run test:e2e

# UI ↔ API integration tests
npm run test:integration

# All tests
npm run test:all

# Load tests (k6) — requires k6 installed
npm run test:load    # 100K concurrent users ramp
npm run test:spike   # Spike test
npm run test:soak    # Soak / endurance test
```

Test files live in `tests/`:
- `tests/api/` — API contract tests
- `tests/e2e/` — Playwright browser tests
- `tests/integration/` — Cross-service integration
- `tests/load/` — k6 load test scripts

Mobile unit tests live in `mobile/__tests__/` and run with Jest.

---

## CI/CD & Deployment

### Azure DevOps Pipeline

The pipeline (`.azure/azure-pipelines.yml`) triggers on pushes to `main` and `develop`:

1. **Build** — TypeScript compilation for all services
2. **Test** — Run API and integration tests
3. **Docker Build** — Build and push images to Azure Container Registry (`bahikhatapro.azurecr.io`)
4. **Deploy** — Rolling update to AKS cluster (`bahi-khata-aks`)

### Kubernetes (AKS)

Manifests are in `infra/k8s/base/`:
- `api-gateway.yaml` — Deployment (2 replicas) + Service
- `services.yaml` — All microservice deployments
- `config.yaml` — ConfigMaps and Secrets

Each service has:
- Liveness and readiness probes on `/health`
- CPU/memory requests and limits
- Rolling update strategy

### Docker Images

All backend services use the same base Dockerfile with a `SERVICE_NAME` build argument:

```bash
docker build \
  --build-arg SERVICE_NAME=auth-service \
  -f infra/docker/Dockerfile.service \
  -t auth-service:latest .
```

---

## Scripts Reference

### Root (`package.json`)

| Script | Description |
|---|---|
| `npm run dev:all` | Start all backend services + frontend |
| `npm run dev:gateway` | Start API Gateway only |
| `npm run dev:<service>` | Start a specific microservice |
| `npm run dev:frontend` | Start web frontend (Vite) |
| `npm run dev:website` | Start marketing website |
| `npm run build:all` | Build all packages |
| `npm run db:generate` | Generate Prisma client |
| `npm run db:migrate` | Run DB migrations (dev) |
| `npm run db:migrate:prod` | Run DB migrations (production) |
| `npm run db:seed` | Seed the database |
| `npm run db:studio` | Open Prisma Studio |
| `npm run docker:up` | Start Docker Compose stack |
| `npm run docker:down` | Stop Docker Compose stack |
| `npm run docker:build` | Build Docker images |
| `npm run test` | Run unit tests |
| `npm run test:api` | Run API tests |
| `npm run test:e2e` | Run E2E tests |
| `npm run test:load` | Run load tests (k6) |
| `npm run lint` | Lint all packages and frontend |
| `npm run clean` | Remove all node_modules |

### Mobile (`mobile/`)

| Script | Description |
|---|---|
| `npm run android` | Build + run on Android |
| `npm run ios` | Build + run on iOS |
| `npm start` | Start Metro bundler |
| `npm run reset-cache` | Start Metro with cache reset |
| `npm run pod-install` | Install iOS CocoaPods |
| `npm test` | Run mobile unit tests |
| `npm run clean` | Clean Android + iOS build dirs |

---

## Contributing

1. Fork the repo and create a feature branch: `git checkout -b feature/your-feature`
2. Make your changes and ensure tests pass: `npm run test:all`
3. Commit with a clear message and push your branch
4. Open a Pull Request against `main`

---

## License

MIT © Yash Jain

---

> Built with ❤️ for Indian businesses. If you find this useful, consider ⭐ starring the repo!
