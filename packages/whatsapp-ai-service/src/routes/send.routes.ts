// =============================================================================
// Send Routes - Internal API for sending WhatsApp messages
// =============================================================================
// Used by the AI orchestrator to send replies back to users.
// Protected by internal service key (not user-facing).
// =============================================================================

import crypto from 'crypto';
import { Router, Request, Response } from 'express';
import { WhatsAppClient } from '../services/whatsapp-client';
import { SecureLogger } from '../middleware/pii-masking';

export const sendRouter = Router();
const whatsappClient = new WhatsAppClient();
const logger = new SecureLogger('SendRoute');

// ─── Internal Auth Middleware ────────────────────────────────────────────────

function timingSafeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * This router can send WhatsApp messages to arbitrary numbers, and the API
 * gateway exposes it publicly under /api/v1/wa. It therefore FAILS CLOSED:
 * an unset INTERNAL_SERVICE_KEY means "refuse", never "allow anyone".
 *
 * The previous behaviour skipped auth entirely whenever the key was unset and
 * NODE_ENV was not exactly 'production', which turned any non-production
 * deployment into an open, unauthenticated relay.
 */
function verifyInternalKey(req: Request, res: Response, next: () => void): void {
  const internalKey = process.env.INTERNAL_SERVICE_KEY;

  if (!internalKey) {
    logger.error('INTERNAL_SERVICE_KEY is not configured — refusing all send requests');
    res.status(503).json({
      success: false,
      error: 'Send route is not configured. Set INTERNAL_SERVICE_KEY to enable it.',
    });
    return;
  }

  const provided = req.headers['x-internal-key'] as string | undefined;
  if (!provided || !timingSafeEquals(provided, internalKey)) {
    logger.warn('Invalid internal key on send route', { ip: req.ip });
    res.status(401).json({ success: false, error: 'Invalid internal key' });
    return;
  }

  next();
}

sendRouter.use(verifyInternalKey);

// ─── Send Text Message ───────────────────────────────────────────────────────
sendRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { to, type, text, buttons, list, template, phoneNumberId } = req.body;

    if (!to) {
      return res.status(400).json({ success: false, error: 'to (phone number) is required' });
    }

    switch (type || 'text') {
      case 'text':
        if (!text) return res.status(400).json({ success: false, error: 'text is required' });
        await whatsappClient.sendTextMessage(to, text, phoneNumberId);
        break;

      case 'buttons':
        if (!text || !buttons) {
          return res.status(400).json({ success: false, error: 'text and buttons required' });
        }
        await whatsappClient.sendButtonMessage(to, text, buttons, phoneNumberId);
        break;

      case 'list':
        if (!list) {
          return res.status(400).json({ success: false, error: 'list object required' });
        }
        await whatsappClient.sendListMessage(
          to,
          list.header || '',
          list.body || '',
          list.sections || [],
          phoneNumberId
        );
        break;

      case 'template':
        if (!template) {
          return res.status(400).json({ success: false, error: 'template object required' });
        }
        await whatsappClient.sendTemplateMessage(
          to,
          template.name,
          template.language || 'hi',
          template.components,
          phoneNumberId
        );
        break;

      case 'reaction':
        if (!req.body.messageId || !req.body.emoji) {
          return res.status(400).json({ success: false, error: 'messageId and emoji required' });
        }
        await whatsappClient.sendReaction(to, req.body.messageId, req.body.emoji, phoneNumberId);
        break;

      default:
        return res.status(400).json({ success: false, error: `Unsupported type: ${type}` });
    }

    logger.info(`Message sent: type=${type || 'text'} to=${to}`);
    res.json({ success: true, message: 'Message sent' });
  } catch (error) {
    logger.error('Send message failed', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});
