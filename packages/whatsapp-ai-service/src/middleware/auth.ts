// =============================================================================
// API Key Authentication Middleware
// =============================================================================
// Protects internal APIs (agents, MCP, admin, conversations) with API key auth.
// WhatsApp webhook uses Meta signature verification instead.
// =============================================================================

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { config } from '../config';

export interface AuthenticatedRequest extends Request {
  apiKeyId?: string;
  tenantId?: string;
  permissions?: string[];
}

interface APIKeyRecord {
  key: string;
  name: string;
  tenantId: string;
  permissions: string[];
  active: boolean;
  createdAt: string;
  lastUsedAt?: string;
  expiresAt?: string;
}

// In production, this would be stored in Azure Key Vault / database
// For now, environment-based with hashed comparison
const API_KEYS: APIKeyRecord[] = (() => {
  const keys: APIKeyRecord[] = [];

  // Primary service key (internal service-to-service)
  if (process.env.WHATSAPP_AI_SERVICE_KEY) {
    keys.push({
      key: process.env.WHATSAPP_AI_SERVICE_KEY,
      name: 'service-internal',
      tenantId: '*',
      permissions: ['read', 'write', 'admin'],
      active: true,
      createdAt: '2026-01-01T00:00:00Z',
    });
  }

  // Frontend dashboard key (limited permissions)
  if (process.env.WHATSAPP_AI_DASHBOARD_KEY) {
    keys.push({
      key: process.env.WHATSAPP_AI_DASHBOARD_KEY,
      name: 'dashboard',
      tenantId: '*',
      permissions: ['read'],
      active: true,
      createdAt: '2026-01-01T00:00:00Z',
    });
  }

  // Admin key (full access)
  if (process.env.WHATSAPP_AI_ADMIN_KEY) {
    keys.push({
      key: process.env.WHATSAPP_AI_ADMIN_KEY,
      name: 'admin',
      tenantId: '*',
      permissions: ['read', 'write', 'admin', 'super'],
      active: true,
      createdAt: '2026-01-01T00:00:00Z',
    });
  }

  return keys;
})();

/**
 * Timing-safe comparison for API keys to prevent timing attacks
 */
function secureCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * Find and validate an API key
 */
function validateAPIKey(providedKey: string): APIKeyRecord | null {
  for (const record of API_KEYS) {
    if (!record.active) continue;

    // Check expiration
    if (record.expiresAt && new Date(record.expiresAt) < new Date()) continue;

    // Timing-safe comparison
    if (secureCompare(providedKey, record.key)) {
      record.lastUsedAt = new Date().toISOString();
      return record;
    }
  }
  return null;
}

/**
 * API Key authentication middleware
 * Looks for key in: Authorization Bearer header, X-API-Key header, or query param
 */
export function apiKeyAuth(requiredPermissions: string[] = ['read']) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Local-development escape hatch. This must be opted into EXPLICITLY:
    // previously it triggered whenever nodeEnv was 'development' and no keys
    // happened to be configured, which silently granted read+write+admin+super
    // to any anonymous caller — and these routes are exposed publicly through
    // the API gateway under /api/v1/wa.
    if (
      config.nodeEnv !== 'production' &&
      API_KEYS.length === 0 &&
      process.env.WHATSAPP_AI_ALLOW_INSECURE_DEV === 'true'
    ) {
      console.warn(
        '🔓 WHATSAPP_AI_ALLOW_INSECURE_DEV=true — API key auth bypassed. Never set this outside local development.',
      );
      (req as AuthenticatedRequest).apiKeyId = 'dev-mode';
      (req as AuthenticatedRequest).tenantId = 'dev';
      (req as AuthenticatedRequest).permissions = ['read', 'write', 'admin', 'super'];
      return next();
    }

    // Extract API key from request
    let apiKey: string | undefined;

    // 1. Authorization: Bearer <key>
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      apiKey = authHeader.slice(7);
    }

    // 2. X-API-Key header
    if (!apiKey) {
      apiKey = req.headers['x-api-key'] as string;
    }

    // 3. Query parameter (least secure, for testing only)
    if (!apiKey && config.nodeEnv !== 'production') {
      apiKey = req.query.api_key as string;
    }

    // No key provided
    if (!apiKey) {
      res.status(401).json({
        success: false,
        error: 'Authentication required. Provide API key via Authorization header or X-API-Key.',
      });
      return;
    }

    // Validate key
    const keyRecord = validateAPIKey(apiKey);
    if (!keyRecord) {
      // Log failed auth attempt (don't log the key itself)
      console.warn(`🔐 Failed API key auth attempt from ${req.ip} on ${req.method} ${req.path}`);
      res.status(401).json({
        success: false,
        error: 'Invalid or expired API key.',
      });
      return;
    }

    // Check permissions
    const hasPermission = requiredPermissions.every(p => keyRecord.permissions.includes(p));
    if (!hasPermission) {
      console.warn(`🚫 Insufficient permissions: ${keyRecord.name} tried ${req.method} ${req.path}`);
      res.status(403).json({
        success: false,
        error: 'Insufficient permissions for this operation.',
      });
      return;
    }

    // Attach auth info to request
    (req as AuthenticatedRequest).apiKeyId = keyRecord.name;
    (req as AuthenticatedRequest).tenantId = keyRecord.tenantId;
    (req as AuthenticatedRequest).permissions = keyRecord.permissions;

    next();
  };
}

/**
 * Middleware that requires admin-level access
 */
export const requireAdmin = apiKeyAuth(['read', 'write', 'admin']);

/**
 * Middleware that requires read-only access (dashboard)
 */
export const requireRead = apiKeyAuth(['read']);

/**
 * Middleware that requires write access
 */
export const requireWrite = apiKeyAuth(['read', 'write']);
