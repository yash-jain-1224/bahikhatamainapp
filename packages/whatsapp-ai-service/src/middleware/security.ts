// =============================================================================
// Security Headers & Request Safety Middleware
// =============================================================================

import { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import { SecureLogger } from './pii-masking';

const logger = new SecureLogger('Security');

// ─── Request Size Limits ─────────────────────────────────────────────────────

/**
 * Enforce request body size limits per route type
 */
export function requestSizeLimit(maxBytes: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const contentLength = parseInt(req.headers['content-length'] || '0');
    if (contentLength > maxBytes) {
      logger.warn(`Request too large: ${contentLength} bytes (max: ${maxBytes})`, {
        ip: req.ip,
        path: req.path,
      });
      res.status(413).json({
        success: false,
        error: `Request body too large. Maximum size: ${Math.round(maxBytes / 1024)}KB`,
      });
      return;
    }
    next();
  };
}

// ─── Security Headers ────────────────────────────────────────────────────────

/**
 * Additional security headers beyond what Helmet provides
 */
export function additionalSecurityHeaders(_req: Request, res: Response, next: NextFunction): void {
  // Prevent caching of sensitive responses
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');

  // Prevent MIME sniffing
  res.set('X-Content-Type-Options', 'nosniff');

  // Remove server info
  res.removeHeader('X-Powered-By');
  res.set('Server', 'BahiKhata');

  // Permissions policy
  res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  next();
}

// ─── IP Allowlist (for admin routes) ─────────────────────────────────────────

/**
 * IP allowlist middleware — only allows specified IPs
 * Useful for admin/internal endpoints
 */
export function ipAllowlist(allowedIPs?: string[]) {
  const whitelist = allowedIPs || process.env.ADMIN_ALLOWED_IPS?.split(',') || [];

  return (req: Request, res: Response, next: NextFunction): void => {
    // Skip in development
    if (config.nodeEnv !== 'production') {
      return next();
    }

    // If no allowlist configured, allow all (rely on API key auth)
    if (whitelist.length === 0) {
      return next();
    }

    const clientIP = req.ip || req.socket.remoteAddress || '';
    const isAllowed = whitelist.some(ip =>
      ip.trim() === clientIP || ip.trim() === '0.0.0.0' // 0.0.0.0 = allow all
    );

    if (!isAllowed) {
      logger.warn(`Blocked request from non-allowlisted IP: ${clientIP} on ${req.path}`);
      res.status(403).json({
        success: false,
        error: 'Access denied from this network.',
      });
      return;
    }

    next();
  };
}

// ─── Request ID Tracking ─────────────────────────────────────────────────────

/**
 * Assigns a unique request ID for tracing through logs
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestId = req.headers['x-request-id'] as string ||
    `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // Attach to request for downstream use
  (req as Request & { requestId: string }).requestId = requestId;

  // Echo back in response
  res.set('X-Request-ID', requestId);

  next();
}

// ─── Suspicious Activity Detection ──────────────────────────────────────────

interface SuspiciousActivityEntry {
  count: number;
  firstSeen: number;
  patterns: string[];
}

const suspiciousTracker = new Map<string, SuspiciousActivityEntry>();

/**
 * Track and alert on suspicious patterns (reconnaissance, scanning, etc.)
 */
export function suspiciousActivityDetector(req: Request, _res: Response, next: NextFunction): void {
  const ip = req.ip || 'unknown';
  const path = req.path.toLowerCase();

  // Paths that indicate scanning/probing
  const scanPatterns = [
    '/wp-admin', '/wp-login', '/.env', '/phpinfo',
    '/admin', '/actuator', '/swagger', '/.git',
    '/config', '/debug', '/trace', '/metrics',
    '/graphql', '/api/v1/admin',
  ];

  const isSuspicious = scanPatterns.some(p => path.includes(p) && !path.startsWith('/api/v1/wa/admin'));

  if (isSuspicious) {
    const entry = suspiciousTracker.get(ip) || { count: 0, firstSeen: Date.now(), patterns: [] };
    entry.count++;
    entry.patterns.push(path);

    if (entry.count > 10) {
      logger.warn(`🚨 Potential scanner detected: ${ip} (${entry.count} suspicious requests)`, {
        patterns: entry.patterns.slice(-5),
      });
    }

    suspiciousTracker.set(ip, entry);
  }

  next();
}

// Cleanup suspicious activity tracker every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of suspiciousTracker) {
    if (now - entry.firstSeen > 600000) { // 10 min
      suspiciousTracker.delete(key);
    }
  }
}, 600000).unref();
