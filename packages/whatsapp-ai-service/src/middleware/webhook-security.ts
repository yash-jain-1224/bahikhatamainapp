// =============================================================================
// Webhook Signature Verification - Meta WhatsApp Cloud API
// =============================================================================
// Strict HMAC-SHA256 verification for production environments.
// In development, verification is optional (logged as warning).
// =============================================================================

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { config } from '../config';
import { SecureLogger } from './pii-masking';

const logger = new SecureLogger('WebhookSecurity');

/**
 * Verify Meta/WhatsApp webhook signature using HMAC-SHA256
 * 
 * Meta signs all webhook payloads with the App Secret.
 * The signature is in the `x-hub-signature-256` header.
 * 
 * @see https://developers.facebook.com/docs/graph-api/webhooks/getting-started#verification-requests
 */
export function verifyWebhookSignature(req: Request, res: Response, next: NextFunction): void {
  // GET requests are verification challenges — no signature needed
  if (req.method === 'GET') {
    return next();
  }

  const signature = req.headers['x-hub-signature-256'] as string;
  const webhookSecret = config.whatsapp.webhookSecret;

  // No secret configured
  if (!webhookSecret) {
    if (config.nodeEnv === 'production') {
      logger.error('CRITICAL: WHATSAPP_WEBHOOK_SECRET not configured in production!');
      res.status(500).json({ success: false, error: 'Server misconfiguration' });
      return;
    }
    // Development: warn but allow
    logger.warn('Webhook signature verification skipped (no secret configured)');
    return next();
  }

  // No signature in request
  if (!signature) {
    if (config.nodeEnv === 'production') {
      logger.warn('Webhook request missing x-hub-signature-256 header', {
        ip: req.ip,
        path: req.path,
      });
      res.sendStatus(401);
      return;
    }
    // Development: warn but allow
    logger.warn('Webhook request has no signature (dev mode - allowing)');
    return next();
  }

  // Extract raw body for verification
  let rawBody: string;
  if (Buffer.isBuffer(req.body)) {
    rawBody = req.body.toString('utf-8');
  } else if (typeof req.body === 'string') {
    rawBody = req.body;
  } else {
    rawBody = JSON.stringify(req.body);
  }

  // Compute expected signature
  const expectedSignature = 'sha256=' + crypto
    .createHmac('sha256', webhookSecret)
    .update(rawBody)
    .digest('hex');

  // Timing-safe comparison
  const isValid = signature.length === expectedSignature.length &&
    crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));

  if (!isValid) {
    logger.warn('Invalid webhook signature', {
      ip: req.ip,
      signaturePrefix: signature.slice(0, 12) + '...',
    });
    res.sendStatus(401);
    return;
  }

  // Signature valid — parse body if it was raw Buffer
  if (Buffer.isBuffer(req.body)) {
    try {
      req.body = JSON.parse(rawBody);
    } catch {
      logger.error('Failed to parse webhook body after signature verification');
      res.status(400).json({ success: false, error: 'Invalid JSON payload' });
      return;
    }
  }

  next();
}

/**
 * Verify webhook request freshness (prevent replay attacks)
 * WhatsApp messages include a timestamp — reject if too old
 */
export function verifyWebhookFreshness(maxAgeSeconds = 300) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.method === 'GET') return next();

    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const messages = body?.entry?.[0]?.changes?.[0]?.value?.messages;

      if (messages && messages.length > 0) {
        const messageTimestamp = parseInt(messages[0].timestamp);
        const now = Math.floor(Date.now() / 1000);
        const age = now - messageTimestamp;

        if (age > maxAgeSeconds) {
          logger.warn(`Rejecting stale webhook message (age: ${age}s, max: ${maxAgeSeconds}s)`);
          res.sendStatus(200); // Respond 200 so Meta doesn't retry
          return;
        }

        if (age < -60) {
          // Message from the future (>60s) — clock skew or replay
          logger.warn(`Rejecting future-dated webhook message (age: ${age}s)`);
          res.sendStatus(200);
          return;
        }
      }
    } catch {
      // If we can't parse for freshness check, let it through
    }

    next();
  };
}
