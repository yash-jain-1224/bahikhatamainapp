import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { createProxyMiddleware } from 'http-proxy-middleware';

// Service Ports - Local constants (no shared package dependency)
//
// Read from the environment with these as defaults. They used to be hardcoded,
// which meant moving a service off a clashing port took TWO changes: the
// service honoured <NAME>_SERVICE_PORT but the gateway ignored it and kept
// proxying to the old port, so you also had to set <NAME>_SERVICE_URL. Anyone
// who set only the port got a gateway silently pointing at whatever else was
// listening there. <NAME>_SERVICE_URL still wins where it is set (that is how
// production targets the deployed *.vercel.app hosts).
const envPort = (key: string, fallback: number): number => {
  const raw = process.env[key];
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0 || n > 65535) {
    console.warn(`Ignoring invalid ${key}="${raw}", using ${fallback}`);
    return fallback;
  }
  return n;
};

const SERVICE_PORTS = {
  API_GATEWAY: envPort('API_GATEWAY_PORT', 3000),
  AUTH_SERVICE: envPort('AUTH_SERVICE_PORT', 3001),
  BUSINESS_SERVICE: envPort('BUSINESS_SERVICE_PORT', 3002),
  PURCHASE_SERVICE: envPort('PURCHASE_SERVICE_PORT', 3003),
  SALES_SERVICE: envPort('SALES_SERVICE_PORT', 3004),
  INVENTORY_SERVICE: envPort('INVENTORY_SERVICE_PORT', 3005),
  LEDGER_SERVICE: envPort('LEDGER_SERVICE_PORT', 3006),
  SUBSCRIPTION_SERVICE: envPort('SUBSCRIPTION_SERVICE_PORT', 3007),
  BILLING_SERVICE: envPort('BILLING_SERVICE_PORT', 3008),
  NOTIFICATION_SERVICE: envPort('NOTIFICATION_SERVICE_PORT', 3009),
  ADMIN_SERVICE: envPort('ADMIN_SERVICE_PORT', 3010),
  PROFILE_SERVICE: envPort('PROFILE_SERVICE_PORT', 3011),
  REFERRAL_SERVICE: envPort('REFERRAL_SERVICE_PORT', 3012),
  WHATSAPP_AI_SERVICE: envPort('WHATSAPP_AI_PORT', 3013),
  EXPENSE_SERVICE: envPort('EXPENSE_SERVICE_PORT', 3014),
} as const;

// Simple error handler for API Gateway
const errorHandler = (err: Error, _req: Request, res: Response, _next: NextFunction): void => {
  console.error('Error:', err.message, err.stack);
  res.status(500).json({
    success: false,
    message: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
};

const app = express();
const PORT = process.env.API_GATEWAY_PORT || 3000;

// ───────────────────────────────────────────────────────────
// HIGH-CONCURRENCY CONFIG  (target: 100 000+ concurrent users)
// ───────────────────────────────────────────────────────────
// 1.  Trust proxies (required when behind LB / CDN / Nginx)
app.set('trust proxy', process.env.TRUST_PROXY || true);

// 2.  Security headers
app.use(helmet({
  contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false,
}));

// 3.  CORS
app.use(cors({
  origin: process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map(s => s.trim())
    : [
        'http://localhost:5173', 
        'http://localhost:5174',
        'https://bahi-khata-frontend.vercel.app'
      ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-business-id'],
}));

// 4.  Compression (saves bandwidth at scale)
app.use(compression());

// 5.  Logging — use 'short' in production to reduce I/O overhead
app.use(morgan(process.env.NODE_ENV === 'production' ? 'short' : 'combined'));

// ───────────────────────────────────────────────────────────
// NO IN-MEMORY RATE LIMITING
// ───────────────────────────────────────────────────────────
// `express-rate-limit` with the default MemoryStore keeps every
// key (IP / user-id) in a JS Map inside a single process.
//
// Problems at 100K+ concurrent users:
//   • Memory grows linearly with unique keys — can OOM.
//   • Each worker/process has its own Map — limits are NOT shared,
//     so the effective per-IP cap is multiplied by the number of
//     processes behind the load-balancer, making it useless.
//   • Legitimate users behind shared NAT / corporate proxies /
//     CGNATs share an IP.  Any per-IP cap low enough to stop abuse
//     WILL hit honest users at scale.
//
// The correct solution is to enforce rate limiting at the
// infrastructure layer (Nginx / Cloudflare / AWS WAF / Redis-backed
// limiter) where:
//   • The store is shared across all gateway replicas.
//   • Rules can key on JWT claims, API-keys, or IP ranges.
//   • 429 responses come before traffic hits Node.js at all.
//
// For local development, we intentionally keep rate limiting OFF
// so that normal browsing never triggers 429.
//
// If you MUST have application-level limiting in production,
// swap MemoryStore for `rate-limit-redis` backed by Redis/Valkey
// and configure it in the block below.
// ───────────────────────────────────────────────────────────

// NOTE: Do NOT use express.json() here — it consumes the request body
// before http-proxy-middleware can forward it.  Each downstream service
// parses its own body.

// Health check
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'api-gateway',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

// Resolve service host: in Docker use container names, in dev use localhost
const serviceHost = (name: string, port: number) => {
  const envKey = `${name.toUpperCase().replace(/-/g, '_')}_URL`;
  return process.env[envKey] || `http://localhost:${port}`;
};

// Service routing configuration
const services: Record<string, { target: string; pathRewrite?: Record<string, string> }> = {
  '/api/v1/auth': {
    target: serviceHost('auth-service', SERVICE_PORTS.AUTH_SERVICE),
  },
  '/api/v1/business': {
    target: serviceHost('business-service', SERVICE_PORTS.BUSINESS_SERVICE),
  },
  '/api/v1/purchases': {
    target: serviceHost('purchase-service', SERVICE_PORTS.PURCHASE_SERVICE),
  },
  '/api/v1/sales': {
    target: serviceHost('sales-service', SERVICE_PORTS.SALES_SERVICE),
  },
  '/api/v1/inventory': {
    target: serviceHost('inventory-service', SERVICE_PORTS.INVENTORY_SERVICE),
  },
  '/api/v1/ledger': {
    target: serviceHost('ledger-service', SERVICE_PORTS.LEDGER_SERVICE),
  },
  '/api/v1/subscriptions': {
    target: serviceHost('subscription-service', SERVICE_PORTS.SUBSCRIPTION_SERVICE),
  },
  '/api/v1/billing': {
    target: serviceHost('billing-service', SERVICE_PORTS.BILLING_SERVICE),
  },
  '/api/v1/notifications': {
    target: serviceHost('notification-service', SERVICE_PORTS.NOTIFICATION_SERVICE),
  },
  '/api/v1/admin': {
    target: serviceHost('admin-service', SERVICE_PORTS.ADMIN_SERVICE),
  },
  '/api/v1/profile': {
    target: serviceHost('profile-service', SERVICE_PORTS.PROFILE_SERVICE),
  },
  '/api/v1/referrals': {
    target: serviceHost('referral-service', SERVICE_PORTS.REFERRAL_SERVICE),
  },
  '/api/v1/wa': {
    target: serviceHost('whatsapp-ai-service', SERVICE_PORTS.WHATSAPP_AI_SERVICE),
  },
  // expense-service had no prefix here at all, so every expenseApi call in the
  // frontend fell through to the 404 handler below and the whole Expenses page
  // was dead.
  '/api/v1/expenses': {
    target: serviceHost('expense-service', SERVICE_PORTS.EXPENSE_SERVICE),
  },
};

// Setup proxy routes
for (const [path, config] of Object.entries(services)) {
  app.use(
    createProxyMiddleware({
      target: config.target,
      changeOrigin: true,
      pathFilter: path,
      pathRewrite: config.pathRewrite,
      // Increase proxy timeout for slow downstream services under load
      proxyTimeout: 30_000,
      timeout: 30_000,
      on: {
        proxyReq: (proxyReq, req) => {
          // Forward headers
          if (req.headers.authorization) {
            proxyReq.setHeader('Authorization', req.headers.authorization);
          }
          if (req.headers['x-business-id']) {
            proxyReq.setHeader('x-business-id', req.headers['x-business-id'] as string);
          }
        },
        error: (err, _req, res) => {
          console.error(`Proxy error for ${path}:`, err.message);
          (res as any).status(502).json({
            success: false,
            message: `Service unavailable: ${path}`,
          });
        },
      },
    }),
  );
}

// Static uploads proxy — business logos
app.use(
  createProxyMiddleware({
    target: serviceHost('business-service', SERVICE_PORTS.BUSINESS_SERVICE),
    changeOrigin: true,
    pathFilter: '/uploads/business',
  }),
);

// Static uploads proxy — user profile avatars
app.use(
  createProxyMiddleware({
    target: serviceHost('profile-service', SERVICE_PORTS.PROFILE_SERVICE),
    changeOrigin: true,
    pathFilter: '/uploads/avatars',
  }),
);

// Static uploads proxy — purchase bill attachments + payment/expense/cutter receipts
app.use(
  createProxyMiddleware({
    target: serviceHost('purchase-service', SERVICE_PORTS.PURCHASE_SERVICE),
    changeOrigin: true,
    pathFilter: '/uploads/purchase',
  }),
);

// Static uploads proxy — sale bill attachments + payment receipts
app.use(
  createProxyMiddleware({
    target: serviceHost('sales-service', SERVICE_PORTS.SALES_SERVICE),
    changeOrigin: true,
    pathFilter: '/uploads/sale',
  }),
);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
  });
});

app.use(errorHandler);

// Increase Node.js server limits for high concurrency
const server = app.listen(PORT, () => {
  console.log(`🚀 API Gateway running on port ${PORT}`);
  console.log(`📡 Proxying to ${Object.keys(services).length} services`);
  console.log(`⚡ Rate limiting: DISABLED (use infrastructure-level limiting in production)`);
});

// Allow more concurrent connections (default is 0 = unlimited, but
// keepAliveTimeout and headersTimeout must be tuned to avoid stuck sockets)
server.keepAliveTimeout = 65_000;   // slightly above typical LB idle timeout (60 s)
server.headersTimeout  = 70_000;    // must be > keepAliveTimeout
server.maxHeadersCount = 100;
server.timeout = 120_000;           // 2 min hard timeout

export default app;
