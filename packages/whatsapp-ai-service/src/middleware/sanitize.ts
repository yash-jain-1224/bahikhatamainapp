// =============================================================================
// Input Sanitization & Validation Middleware
// =============================================================================
// Prevents XSS, SQL Injection, NoSQL Injection, and Command Injection
// =============================================================================

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

// ─── Dangerous Pattern Detection ─────────────────────────────────────────────

const DANGEROUS_PATTERNS = {
  // SQL Injection patterns
  sqlInjection: [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|EXEC|UNION)\b.*\b(FROM|INTO|TABLE|WHERE|SET)\b)/i,
    /(--|;|\/\*|\*\/|xp_|sp_)/i,
    /(\b(OR|AND)\b\s+\d+\s*=\s*\d+)/i,
  ],
  // NoSQL Injection patterns (MongoDB-style)
  nosqlInjection: [
    /\$(?:gt|gte|lt|lte|ne|nin|in|regex|where|exists)/i,
    /\{\s*["']?\$\w+/i,
  ],
  // XSS patterns
  xss: [
    /<script[^>]*>[\s\S]*?<\/script>/gi,
    /javascript:/gi,
    /on\w+\s*=\s*["'][^"']*["']/gi,
    /<iframe[^>]*>/gi,
    /<object[^>]*>/gi,
    /<embed[^>]*>/gi,
  ],
  // Command Injection patterns
  commandInjection: [
    /[;&|`$(){}[\]]/,
    /\b(eval|exec|spawn|system|child_process)\b/i,
  ],
};

/**
 * Check if a string contains dangerous patterns
 */
function containsDangerousPattern(
  value: string,
  categories: (keyof typeof DANGEROUS_PATTERNS)[] = ['sqlInjection', 'nosqlInjection', 'xss']
): { isDangerous: boolean; category?: string; pattern?: string } {
  for (const category of categories) {
    const patterns = DANGEROUS_PATTERNS[category];
    for (const pattern of patterns) {
      if (pattern.test(value)) {
        return { isDangerous: true, category, pattern: pattern.source };
      }
    }
  }
  return { isDangerous: false };
}

/**
 * Recursively sanitize an object's string values
 */
function sanitizeValue(value: unknown, depth = 0): unknown {
  if (depth > 10) return value; // Prevent infinite recursion

  if (typeof value === 'string') {
    return value
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '') // Remove script tags
      .replace(/javascript:/gi, '')                        // Remove javascript: URIs
      .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')       // Remove event handlers
      .trim();
  }

  if (Array.isArray(value)) {
    return value.map(v => sanitizeValue(v, depth + 1));
  }

  // Binary payloads are not text and must survive byte-for-byte.
  if (Buffer.isBuffer(value)) return value;

  if (value && typeof value === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      sanitized[k] = sanitizeValue(v, depth + 1);
    }
    return sanitized;
  }

  return value;
}

// ─── Middleware Functions ─────────────────────────────────────────────────────

/**
 * Input sanitization middleware - strips dangerous content from request bodies
 * Applied to API routes (NOT webhook — webhook needs raw body for signature)
 */
export function sanitizeInput(req: Request, _res: Response, next: NextFunction): void {
  // Leave raw bodies alone. The doc comment above says this is not applied to
  // the webhook, but index.ts mounts it with `app.use(sanitizeInput)` — no path
  // — so it ran for /api/v1/wa/webhook too, where express.raw() has already put
  // a Buffer on req.body. A Buffer is `typeof 'object'` and not an Array, so
  // sanitizeValue took the object branch and rebuilt it via Object.entries()
  // as a plain { '0': 12, '1': 34, … } byte map. req.body stopped being a
  // Buffer before verifyWebhookSignature ever saw it, so the HMAC never matched
  // and every inbound WhatsApp message was rejected.
  if (Buffer.isBuffer(req.body)) return next();

  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeValue(req.body);
  }
  next();
}

/**
 * Strict input validation - rejects requests with suspicious patterns
 * Use on sensitive routes (admin, write operations)
 */
export function strictInputValidation(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const valuesToCheck: string[] = [];

  // Check query params
  for (const [, value] of Object.entries(req.query)) {
    if (typeof value === 'string') valuesToCheck.push(value);
  }

  // Check body (flatten string values)
  function extractStrings(obj: unknown, depth = 0): void {
    if (depth > 5) return;
    if (typeof obj === 'string') {
      valuesToCheck.push(obj);
    } else if (Array.isArray(obj)) {
      obj.forEach(v => extractStrings(v, depth + 1));
    } else if (obj && typeof obj === 'object') {
      Object.values(obj).forEach(v => extractStrings(v, depth + 1));
    }
  }
  extractStrings(req.body);

  // Check for dangerous patterns
  for (const value of valuesToCheck) {
    // Skip WhatsApp message text (user input that's naturally varied)
    if (value.length > 1000) continue; // Large payloads are likely file data

    const check = containsDangerousPattern(value, ['sqlInjection', 'nosqlInjection', 'commandInjection']);
    if (check.isDangerous) {
      console.warn(`🛡️ Blocked suspicious input from ${req.ip}: category=${check.category}`);
      res.status(400).json({
        success: false,
        error: 'Request contains invalid characters or patterns.',
      });
      return;
    }
  }

  next();
}

// ─── Zod Request Validation Schemas ──────────────────────────────────────────

export const conversationParamsSchema = z.object({
  userId: z.string().min(1).max(50).regex(/^[a-zA-Z0-9_:+\-@.]+$/, 'Invalid userId format'),
});

export const preferencesBodySchema = z.object({
  language: z.enum(['hindi', 'english', 'hinglish']).optional(),
  autoApprove: z.boolean().optional(),
  approvalThreshold: z.number().min(0).max(10000000).optional(),
  dateFormat: z.string().max(20).optional(),
  currency: z.string().max(5).optional(),
}).strict();

export const mcpExecuteSchema = z.object({
  tool: z.string().min(1).max(50).regex(/^[a-z_]+$/, 'Invalid tool name'),
  // Optional with a default: tools like daily_summary have no required params
  // and callers legitimately omit the field.
  params: z.record(z.unknown()).optional().default({}),
});

export const agentClassifySchema = z.object({
  text: z.string().min(1).max(5000),
  userId: z.string().min(1).max(50).optional(),
  language: z.enum(['hindi', 'english', 'hinglish']).optional(),
});

/**
 * Generic Zod validation middleware factory
 */
export function validateBody<T>(schema: z.ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: result.error.issues.map(i => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      });
      return;
    }
    req.body = result.data;
    next();
  };
}

export function validateParams<T>(schema: z.ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      res.status(400).json({
        success: false,
        error: 'Invalid parameters',
        details: result.error.issues.map(i => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      });
      return;
    }
    next();
  };
}

export function validateQuery<T>(schema: z.ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      res.status(400).json({
        success: false,
        error: 'Invalid query parameters',
        details: result.error.issues.map(i => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      });
      return;
    }
    next();
  };
}
