// =============================================================================
// Middleware Barrel Export
// =============================================================================

// Rate Limiting
export {
  createRateLimiter,
  webhookRateLimiter,
  apiRateLimiter,
  userMessageRateLimiter,
  adminRateLimiter,
} from './rate-limiter';

// Authentication
export {
  apiKeyAuth,
  requireAdmin,
  requireRead,
  requireWrite,
  type AuthenticatedRequest,
} from './auth';

// Input Sanitization & Validation
export {
  sanitizeInput,
  strictInputValidation,
  validateBody,
  validateParams,
  validateQuery,
  conversationParamsSchema,
  preferencesBodySchema,
  mcpExecuteSchema,
  agentClassifySchema,
} from './sanitize';

// PII Masking
export {
  maskPII,
  maskPIIInObject,
  SecureLogger,
  type PIIMaskConfig,
} from './pii-masking';

// Webhook Security
export {
  verifyWebhookSignature,
  verifyWebhookFreshness,
} from './webhook-security';

// Security Headers & Utilities
export {
  requestSizeLimit,
  additionalSecurityHeaders,
  ipAllowlist,
  requestIdMiddleware,
  suspiciousActivityDetector,
} from './security';
