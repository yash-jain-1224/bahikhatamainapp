# Deployment Guide — Bahi Khata Pro

Deploys the PostgreSQL database on Azure and the frontend + 13 backend microservices on Vercel.

> For the Kubernetes/AKS production path and the Azure DevOps pipeline, see the
> [CI/CD & Deployment](./README.md#cicd--deployment) section of the README.

---

## Prerequisites

```bash
brew install azure-cli jq
npm i -g vercel

az login
vercel login
```

You also need access to the `Bhai-Khata-RG` Azure resource group and the Vercel team.

---

## 1. Deploy the Azure database

```bash
cd infra/scripts
./deploy-azure-dev-db.sh      # prompts for the admin password
```

Current dev server configuration:

| Setting | Value |
|---|---|
| Server | `bahikhata-dev-pg` |
| Host | `bahikhata-dev-pg.postgres.database.azure.com` |
| Database | `bahi_khata_dev` |
| Admin user | `bahikhataadmin` |
| Version | PostgreSQL 15 |
| SKU | `Standard_B1ms` (Burstable) |
| Storage | 32 GB |
| Region | Central India |
| Backup | 7 days |
| Cost | ~$5–10/month |

The script prints the connection string. **Save it securely — it is not stored anywhere in the repo.**

---

## 2. Deploy to Vercel

Everything at once:

```bash
./vercel-deploy.sh
```

Backend services only:

```bash
./deploy-backend-services.sh
```

Frontend only:

```bash
cd frontend && vercel --prod
```

A single service:

```bash
cd packages/auth-service && vercel --prod
```

### What gets deployed

- **Frontend** — Vite/React app
- **API Gateway** — `api-gateway`
- **13 microservices** — `auth`, `business`, `ledger`, `sales`, `purchase`, `expense`,
  `inventory`, `profile`, `notification`, `billing`, `subscription`, `referral`, `admin`

---

## 3. Configure environment variables

The scripted path sets every variable across all services:

```bash
./setup-env-vars.sh
```

It requires `DATABASE_URL` in your shell (or edit the values at the top of the script first).
See `.env.example` for the full list of supported variables.

Manual equivalent, per service:

```bash
cd packages/<service>
vercel env add DATABASE_URL production
vercel env add JWT_SECRET production            # openssl rand -hex 32
vercel env add REFRESH_TOKEN_SECRET production  # openssl rand -hex 32
vercel env add NODE_ENV production              # "production"
```

Frontend:

```bash
cd frontend
vercel env add VITE_API_URL production          # https://api-gateway-navy-eta.vercel.app
vercel env add VITE_APP_NAME production
vercel env add VITE_APP_VERSION production
```

### API Gateway service URLs

The gateway needs one `<SERVICE>_SERVICE_URL` variable per downstream service. Deployment URLs
change on every deploy, so regenerate them rather than copying stale values:

```bash
./get-production-urls.sh        # prints the current production URL per service
./update-api-gateway-urls.sh    # writes them into the gateway's Vercel env
```

### Optional integrations

| Purpose | Variables |
|---|---|
| Redis (cache, rate limiting, OTP) | `REDIS_URL`, `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` |
| Email (notification-service) | `SENDGRID_API_KEY`, `FROM_EMAIL` |
| SMS (notification-service) | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` |
| Payments (billing-service) | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` |

Environment variables only take effect on the **next** deploy — redeploy after changing them.

---

## 4. Run database migrations

```bash
export DATABASE_URL="postgresql://...?sslmode=require"
npm run db:generate
npm run db:migrate:prod
```

---

## 5. Verify

```bash
./status.sh              # live health check of every deployed service
./verify-deployment.sh   # full smoke suite
./test-deployment.sh     # API endpoint tests
vercel ls                # list deployments
```

---

## Troubleshooting

**Database connection timeout** — check the firewall rules:

```bash
az postgres flexible-server firewall-rule list \
  --resource-group Bhai-Khata-RG --name bahikhata-dev-pg
```

**SSL errors** — the connection string must end with `?sslmode=require`.

**Env var changes not applied** — redeploy the service (`vercel --prod`).

**Build failures** — `vercel logs <deployment-url>`, then `vercel --prod --force`.

**Vercel auth** — `vercel whoami`; re-link with `vercel link` if the project isn't connected.

**401 on every endpoint** — Deployment Protection is enabled. Disable it per project under
Vercel Dashboard → Settings → Deployment Protection.

**Azure login** — `az login --use-device-code`.

---

## Security notes

- Never commit connection strings, passwords, or tokens. `.gitignore` covers
  `.azure-db-connection.txt`, `.env*`, `*.pem`, and `*.key`.
- Use Azure Key Vault for production secrets.
- Restrict the database firewall to specific IP ranges in production — the dev server currently
  allows `0.0.0.0–255.255.255.255`.
- Rotate the database password regularly and use least-privilege users per service.

---

## Teardown

```bash
az postgres flexible-server delete --resource-group Bhai-Khata-RG --name bahikhata-dev-pg
vercel rm <project-name>
```
