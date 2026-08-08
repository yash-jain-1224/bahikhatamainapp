import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { webhookRouter } from './routes/webhook.routes';
import { conversationRouter } from './routes/conversation.routes';
import { agentRouter } from './routes/agent.routes';
import { mcpRouter } from './routes/mcp.routes';
import { adminRouter } from './routes/admin.routes';
import { metricsRouter } from './routes/metrics.routes';
import { sendRouter } from './routes/send.routes';
import { initializeServices } from './services/init';
import { metricsMiddleware } from './services/metrics.service';
import {
  webhookRateLimiter,
  apiRateLimiter,
  adminRateLimiter,
  userMessageRateLimiter,
  requireRead,
  requireAdmin,
  sanitizeInput,
  additionalSecurityHeaders,
  requestIdMiddleware,
  suspiciousActivityDetector,
  requestSizeLimit,
  verifyWebhookSignature,
  verifyWebhookFreshness,
  SecureLogger,
} from './middleware';

const app = express();
const PORT = process.env.WHATSAPP_AI_PORT || 3013;
const logger = new SecureLogger('Server');

// ─── Global Security & Performance ──────────────────────────────────────────

// Request ID tracking (for log correlation)
app.use(requestIdMiddleware);

// Security headers (Helmet + custom)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: true,
  crossOriginOpenerPolicy: true,
  crossOriginResourcePolicy: { policy: 'same-origin' },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
}));
app.use(additionalSecurityHeaders);

// Compression
app.use(compression());

// CORS (strict in production)
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? process.env.CORS_ORIGIN?.split(',') || []
    : ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Request-ID'],
  maxAge: 86400, // 24 hours preflight cache
}));

// Logging (PII-safe in production)
app.use(morgan(process.env.NODE_ENV === 'production' ? 'short' : 'combined'));

// Suspicious activity detection (scanner detection)
app.use(suspiciousActivityDetector);

// ─── Body Parsing ────────────────────────────────────────────────────────────

// Webhook: raw body for signature verification (limit 1MB)
app.use('/api/v1/wa/webhook', requestSizeLimit(1048576));
app.use('/api/v1/wa/webhook', express.raw({ type: 'application/json' }));

// API routes: JSON with input sanitization (limit 10MB for documents)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(sanitizeInput);

// Metrics tracking middleware (auto-records latency, error rates)
app.use(metricsMiddleware);

// ─── Health Check (no auth, no rate limit) ───────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'whatsapp-ai-service',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    uptime: process.uptime(),
    agents: ['samajh', 'dastaveez', 'pehchaan', 'jaanch', 'lekha', 'hisaab'],
  });
});

// ─── Routes with Security Layers ─────────────────────────────────────────────

// WhatsApp webhook: signature verification + rate limiting (no API key — Meta can't send one)
// userMessageRateLimiter (per-WhatsApp-number) runs AFTER verifyWebhookSignature
// because the signature verifier consumes the raw Buffer body and replaces it
// with the parsed JSON object the limiter's keyExtractor reads.
app.use(
  '/api/v1/wa/webhook',
  webhookRateLimiter,
  verifyWebhookSignature,
  verifyWebhookFreshness(),
  userMessageRateLimiter,
  webhookRouter
);

// Conversations: read floor at the mount; mutating routes escalate to
// requireWrite inside conversation.routes.ts
app.use('/api/v1/wa/conversations', apiRateLimiter, requireRead, conversationRouter);

// Agents: read floor (dashboard key must reach GET /status); /classify and
// /test escalate to requireWrite inside agent.routes.ts
app.use('/api/v1/wa/agents', apiRateLimiter, requireRead, agentRouter);

// MCP Tools: read floor for discovery (GET /tools); /execute and
// /execute-batch escalate to requireWrite inside mcp.routes.ts
app.use('/api/v1/wa/mcp', apiRateLimiter, requireRead, mcpRouter);

// Admin: admin access + strict rate limiting
app.use('/api/v1/wa/admin', adminRateLimiter, requireAdmin, adminRouter);

// Metrics: admin access (contains cost & usage data)
app.use('/api/v1/wa/metrics', apiRateLimiter, requireRead, metricsRouter);

// Send: internal service route (orchestrator → WhatsApp), uses x-internal-key auth
app.use('/api/v1/wa/send', apiRateLimiter, sendRouter);

// ─── Error Handler ───────────────────────────────────────────────────────────
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  // Don't leak error details in production
  logger.error('Unhandled error', err);
  res.status(500).json({
    success: false,
    message: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
});

// ─── Initialize & Start ──────────────────────────────────────────────────────
initializeServices().then(() => {
  app.listen(PORT, () => {
    logger.info(`🤖 WhatsApp AI Service running on port ${PORT}`);
    logger.info(`🔐 Security: Rate limiting, API key auth, webhook signature verification`);
    logger.info(`📱 WhatsApp Webhook: /api/v1/wa/webhook`);
    logger.info(`🧠 Agents: Samajh, Dastaveez, Pehchaan, Jaanch, Lekha, Hisaab`);
    logger.info(`🔧 MCP Tools: /api/v1/wa/mcp`);
    logger.info(`📊 Metrics: /api/v1/wa/metrics/dashboard`);
    logger.info(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  });
}).catch((err) => {
  logger.error('Failed to initialize services', err);
  process.exit(1);
});

export default app;
