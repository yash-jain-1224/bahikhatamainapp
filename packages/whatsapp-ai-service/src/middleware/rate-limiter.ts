// =============================================================================
// Rate Limiting Middleware - Sliding Window with Per-User & Per-IP Limits
// =============================================================================

import { Request, Response, NextFunction } from 'express';

interface RateLimitEntry {
  count: number;
  windowStart: number;
  blocked: boolean;
  blockedUntil?: number;
}

interface RateLimitConfig {
  windowMs: number;         // Time window in milliseconds
  maxRequests: number;      // Max requests per window
  blockDurationMs: number;  // How long to block after exceeding limit
  keyExtractor: (req: Request) => string;
  skipPaths?: string[];     // Paths to skip (e.g., health check)
  message?: string;
}

// In-memory store (replace with Redis in production for multi-instance)
const stores = new Map<string, Map<string, RateLimitEntry>>();

function getStore(name: string): Map<string, RateLimitEntry> {
  if (!stores.has(name)) {
    stores.set(name, new Map());
  }
  return stores.get(name)!;
}

// Cleanup stale entries every 60 seconds (unref: a housekeeping timer must
// never keep the process alive on its own)
setInterval(() => {
  const now = Date.now();
  for (const [, store] of stores) {
    for (const [key, entry] of store) {
      if (now - entry.windowStart > 300000) { // 5 min staleness
        store.delete(key);
      }
    }
  }
}, 60000).unref();

export function createRateLimiter(name: string, options: RateLimitConfig) {
  const store = getStore(name);

  return (req: Request, res: Response, next: NextFunction): void => {
    // Skip excluded paths
    if (options.skipPaths?.some(p => req.path.startsWith(p))) {
      return next();
    }

    const key = options.keyExtractor(req);
    const now = Date.now();
    let entry = store.get(key);

    // Check if currently blocked
    if (entry?.blocked && entry.blockedUntil && now < entry.blockedUntil) {
      const retryAfter = Math.ceil((entry.blockedUntil - now) / 1000);
      res.set('Retry-After', String(retryAfter));
      res.set('X-RateLimit-Limit', String(options.maxRequests));
      res.set('X-RateLimit-Remaining', '0');
      res.status(429).json({
        success: false,
        error: options.message || 'Too many requests. Please try again later.',
        retryAfterSeconds: retryAfter,
      });
      return;
    }

    // Reset if window has passed
    if (!entry || now - entry.windowStart >= options.windowMs) {
      entry = { count: 0, windowStart: now, blocked: false };
      store.set(key, entry);
    }

    entry.count++;

    // Exceeded limit — block
    if (entry.count > options.maxRequests) {
      entry.blocked = true;
      entry.blockedUntil = now + options.blockDurationMs;
      const retryAfter = Math.ceil(options.blockDurationMs / 1000);
      res.set('Retry-After', String(retryAfter));
      res.set('X-RateLimit-Limit', String(options.maxRequests));
      res.set('X-RateLimit-Remaining', '0');
      res.status(429).json({
        success: false,
        error: options.message || 'Too many requests. Please try again later.',
        retryAfterSeconds: retryAfter,
      });
      return;
    }

    // Set rate limit headers
    res.set('X-RateLimit-Limit', String(options.maxRequests));
    res.set('X-RateLimit-Remaining', String(options.maxRequests - entry.count));
    res.set('X-RateLimit-Reset', String(Math.ceil((entry.windowStart + options.windowMs) / 1000)));

    next();
  };
}

// ─── Pre-configured Rate Limiters ────────────────────────────────────────────

/**
 * WhatsApp webhook: Meta can send bursts — allow generous limits
 * but protect against replay/amplification attacks
 */
export const webhookRateLimiter = createRateLimiter('webhook', {
  windowMs: 60000,            // 1 minute window
  maxRequests: 300,           // 300 req/min (Meta sends batches)
  blockDurationMs: 30000,    // Block 30 seconds if exceeded
  keyExtractor: (req) => req.ip || 'unknown',
  message: 'Webhook rate limit exceeded',
});

/**
 * API routes: Standard API protection
 */
export const apiRateLimiter = createRateLimiter('api', {
  windowMs: 60000,            // 1 minute window
  maxRequests: 60,            // 60 req/min per client
  blockDurationMs: 60000,    // Block 1 minute
  keyExtractor: (req) => {
    // Use API key if present, else IP
    return (req.headers['x-api-key'] as string) || req.ip || 'unknown';
  },
  skipPaths: ['/health'],
  message: 'API rate limit exceeded. Please slow down.',
});

/**
 * Per-user message rate limiter (WhatsApp user)
 * Prevent spam/abuse from a single WhatsApp number
 */
export const userMessageRateLimiter = createRateLimiter('user-msg', {
  windowMs: 60000,            // 1 minute window
  maxRequests: 30,            // 30 messages/min per user
  blockDurationMs: 120000,   // Block 2 minutes
  keyExtractor: (req) => {
    // Extract WhatsApp user from payload. Mounted after
    // verifyWebhookSignature, which parses the raw body when a webhook secret
    // is configured; handle string/Buffer bodies too for the dev path where
    // no secret is set and the body is still raw.
    try {
      const body =
        typeof req.body === 'string' ? JSON.parse(req.body)
        : Buffer.isBuffer(req.body) ? JSON.parse(req.body.toString('utf-8'))
        : req.body;
      const from = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.from;
      return from || req.ip || 'unknown';
    } catch {
      return req.ip || 'unknown';
    }
  },
  message: 'Message rate limit exceeded. Please wait before sending more messages.',
});

/**
 * Admin routes: Strict rate limiting
 */
export const adminRateLimiter = createRateLimiter('admin', {
  windowMs: 60000,            // 1 minute
  maxRequests: 30,            // 30 req/min
  blockDurationMs: 300000,   // Block 5 minutes
  keyExtractor: (req) => req.ip || 'unknown',
  message: 'Admin rate limit exceeded.',
});
