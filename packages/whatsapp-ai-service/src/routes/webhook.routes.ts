// =============================================================================
// WhatsApp Webhook Routes - Meta Cloud API Integration
// =============================================================================
// Full M1 pipeline: verify → ACK → dedup → normalise → resolve user →
//   media pipeline → dispatch to orchestrator
// =============================================================================

import { Router, Request, Response } from 'express';
import { config } from '../config';
import { WhatsAppWebhookPayload, WhatsAppMessage } from '../types';
import { AgentOrchestrator } from '../agents/orchestrator';
import { WhatsAppClient } from '../services/whatsapp-client';
import { SecureLogger } from '../middleware/pii-masking';
import { normaliseMessage, isMessageDuplicate, NormalisedMessage } from '../services/message-normaliser';
import { UserResolutionService } from '../services/user-resolution';
import { MediaPipeline } from '../services/media-pipeline';
import { DispatcherService } from '../services/dispatcher';
import { metrics } from '../services/metrics.service';

export const webhookRouter = Router();
const orchestrator = new AgentOrchestrator();
const whatsappClient = new WhatsAppClient();
const userResolver = new UserResolutionService();
const mediaPipeline = new MediaPipeline();
const dispatcher = new DispatcherService();
const logger = new SecureLogger('Webhook');

// ─── Webhook Verification (GET) ─────────────────────────────────────────────
// Meta sends a GET request to verify webhook URL
webhookRouter.get('/', (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  // Fail closed when no verify token is configured — never verify against a
  // guessable default (the old 'bahikhata_webhook_verify' fallback was public
  // in source and disagreed with .env.example anyway).
  if (!config.whatsapp.verifyToken) {
    logger.warn('WhatsApp webhook verification rejected: WHATSAPP_VERIFY_TOKEN not configured');
    res.sendStatus(403);
    return;
  }

  if (mode === 'subscribe' && token === config.whatsapp.verifyToken) {
    logger.info('WhatsApp webhook verified successfully');
    res.status(200).send(challenge);
  } else {
    logger.warn('WhatsApp webhook verification failed', { mode, ip: req.ip });
    res.sendStatus(403);
  }
});

// ─── Webhook Message Handler (POST) ─────────────────────────────────────────
// Signature verification handled by verifyWebhookSignature middleware in index.ts
webhookRouter.post('/', async (req: Request, res: Response) => {
  try {
    // Parse payload (signature already verified by middleware). The body is
    // still a raw Buffer when no webhook secret is configured (dev), because
    // verifyWebhookSignature only parses after a successful HMAC check.
    const payload: WhatsAppWebhookPayload =
      typeof req.body === 'string' ? JSON.parse(req.body)
      : Buffer.isBuffer(req.body) ? JSON.parse(req.body.toString('utf-8'))
      : req.body;

    // Respond immediately (Meta requires 200 within 20 seconds)
    res.sendStatus(200);

    // Process messages asynchronously (fire-and-forget after ACK)
    processWebhookPayload(payload).catch((err) => {
      logger.error('Async webhook processing failed', err);
    });
  } catch (error) {
    logger.error('Webhook processing error', error);
    // Still respond 200 to prevent Meta from retrying
    if (!res.headersSent) {
      res.sendStatus(200);
    }
  }
});

// ─── Process Webhook Payload ─────────────────────────────────────────────────
async function processWebhookPayload(payload: WhatsAppWebhookPayload): Promise<void> {
  if (payload.object !== 'whatsapp_business_account') return;

  for (const entry of payload.entry) {
    for (const change of entry.changes) {
      if (change.field !== 'messages') continue;

      const { messages, contacts, metadata } = change.value;
      if (!messages || messages.length === 0) continue;

      for (const message of messages) {
        const contact = contacts?.find(c => c.wa_id === message.from);
        const senderName = contact?.profile?.name || 'Unknown';
        const phoneNumberId = metadata.phone_number_id;

        logger.info(`Inbound message: from=${message.from} type=${message.type} wamid=${message.id}`);

        await processMessagePipeline(message, senderName, phoneNumberId);
      }
    }
  }
}

// ─── M1 Pipeline: dedup → normalise → resolve → media → dispatch ────────────
async function processMessagePipeline(
  message: WhatsAppMessage,
  senderName: string,
  phoneNumberId: string
): Promise<void> {
  const startTime = Date.now();

  try {
    // ── Step 1: Dedup by wamid (prevents double-processing from Meta retries) ──
    if (isMessageDuplicate(message.id)) {
      logger.info(`Duplicate message skipped: ${message.id}`);
      metrics.recordRequest(0, true, 'dedup_hit');
      return;
    }

    // ── Step 2: Normalise message into unified format ──
    const normalised: NormalisedMessage = normaliseMessage(message);
    logger.debug(`Normalised: type=${normalised.type} text="${normalised.text?.slice(0, 50)}"`);

    // ── Step 3: Mark as read (non-blocking) ──
    whatsappClient.markAsRead(message.id, phoneNumberId).catch((_err: unknown) => {
      logger.warn('Failed to mark as read');
    });

    // ── Step 3a: Business-picker replies (routed by interactive id) ──
    // The picker below sends rows with ids `select_biz_<id>`; those replies
    // must be consumed here (by id, not title) BEFORE intent classification,
    // otherwise the selection is never persisted and the picker loops forever.
    if (
      normalised.type === 'interactive' &&
      normalised.interactive?.id?.startsWith('select_biz_')
    ) {
      const selectedBusinessId = normalised.interactive.id.slice('select_biz_'.length);
      userResolver.selectBusiness(message.from, selectedBusinessId);

      // Re-resolve with the stored selection and confirm to the user
      const reResolved = await userResolver.resolve(message.from, senderName);
      const businessLabel = reResolved.user?.businessName || normalised.interactive.title;
      await whatsappClient.sendTextMessage(
        message.from,
        `✅ Business select ho gaya: *${businessLabel}*\n\nAb aap apna hisaab-kitaab bhej sakte hain.`,
        phoneNumberId
      );
      logger.info(`Business selected via picker: ${selectedBusinessId}`);
      metrics.recordRequest(Date.now() - startTime, true);
      return;
    }

    // ── Step 4: Resolve user + business (Prisma or mock) ──
    const resolution = await userResolver.resolve(message.from, senderName);

    // ── Step 4a: Upsert WhatsAppSession (parity with notification-service) ──
    userResolver.upsertSession(message.from, senderName);

    // ── Step 4b: Handle unregistered users ──
    if (!resolution.resolved) {
      if (resolution.onboardingMessage) {
        await whatsappClient.sendTextMessage(
          message.from,
          resolution.onboardingMessage,
          phoneNumberId
        );
      }
      logger.info(`Unregistered user: ${message.from}`);
      return;
    }

    // ── Step 4c: Handle multi-business picker ──
    if (resolution.needsBusinessPicker && resolution.businessOptions) {
      await whatsappClient.sendListMessage(
        message.from,
        'Business Chunein',
        'Aapke paas ek se zyada business hai. Kaunsa use karna hai?',
        [{
          title: 'Aapke Businesses',
          rows: resolution.businessOptions.map(b => ({
            id: `select_biz_${b.id}`,
            title: b.name,
            description: b.role,
          })),
        }],
        phoneNumberId
      );
      return;
    }

    const user = resolution.user!;

    // ── Step 5: Media pipeline (if media message) ──
    let mediaUrl: string | undefined;
    if (normalised.type === 'media' && normalised.media) {
      try {
        const stored = await mediaPipeline.processMedia(
          normalised.media.mediaId,
          normalised.media.mimeType,
          normalised.media.filename
        );
        mediaUrl = stored.url;
        logger.info(`Media stored: ${stored.id} (${stored.size} bytes)`);
      } catch (mediaErr) {
        logger.error('Media pipeline failed (continuing without media)', mediaErr);
        // Non-fatal: continue processing with text/caption only
      }
    }

    // ── Step 6: Remote dispatch mirror (no-op unless explicitly enabled) ──
    // No consumer exists yet for Service Bus / ORCHESTRATOR_URL, so the
    // dispatcher only mirrors behind WHATSAPP_AI_ENABLE_REMOTE_DISPATCH.
    await dispatcher.dispatch(normalised, user, phoneNumberId, mediaUrl);

    // ── Step 7: Process in-process — UNCONDITIONALLY ──
    // This is the only reply path that actually works today. It must not be
    // gated on Service Bus / ORCHESTRATOR_URL env vars: configuring either
    // previously suppressed local processing and black-holed every message
    // (enqueued to a queue nobody consumes / POSTed to a /process nobody
    // serves), so the user never received a reply.
    const response = await orchestrator.processMessage({
      userId: user.userId,
      senderName: user.name,
      businessId: user.businessId,
      message,
      phoneNumberId,
      timestamp: normalised.timestamp,
    });

    // Send response back via WhatsApp
    if (response.text) {
      await whatsappClient.sendTextMessage(message.from, response.text, phoneNumberId);
    }
    if (response.buttons && response.buttons.length > 0) {
      await whatsappClient.sendButtonMessage(
        message.from,
        response.text || '',
        response.buttons,
        phoneNumberId
      );
    }
    if (response.list) {
      await whatsappClient.sendListMessage(
        message.from,
        response.list.title,
        response.list.body,
        response.list.sections,
        phoneNumberId
      );
    }

    // ── Metrics ──
    const elapsed = Date.now() - startTime;
    metrics.recordRequest(elapsed, true);
    logger.info(`Pipeline complete: ${message.id} in ${elapsed}ms (target <5000ms)`);

    if (elapsed > 5000) {
      logger.warn(`Slow pipeline: ${elapsed}ms for message ${message.id}`);
    }
  } catch (error) {
    logger.error(`Pipeline error for message ${message.id}`, error);
    metrics.recordRequest(Date.now() - startTime, false);

    // Send error message to user (best effort)
    try {
      await whatsappClient.sendTextMessage(
        message.from,
        'Maaf kijiye, kuch technical problem ho gaya. Thodi der mein phir try karein. 🙏',
        phoneNumberId
      );
    } catch (sendError) {
      logger.error('Failed to send error message', sendError);
    }
  }
}
