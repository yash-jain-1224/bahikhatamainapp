// =============================================================================
// Dispatcher Service - Routes processed messages to the AI orchestrator
// =============================================================================
// Supports: Azure Service Bus (production) + direct HTTP fallback (dev)
// ADR-5: Queue with graceful degradation
// =============================================================================

import { NormalisedMessage } from './message-normaliser';
import { ResolvedUser } from './user-resolution';
import { SecureLogger } from '../middleware/pii-masking';
import { config } from '../config';

const logger = new SecureLogger('Dispatcher');

// ─── Job Types ───────────────────────────────────────────────────────────────

export interface OrchestratorJob {
  wamid: string;             // Idempotency key
  userId: string;
  phone: string;
  senderName: string;
  businessId: string;
  message: NormalisedMessage;
  mediaUrl?: string;         // Signed URL if media was uploaded
  timestamp: string;
  replyTo: string;           // Phone number to reply to
  phoneNumberId: string;     // WhatsApp phone number ID (for sending replies)
}

// ─── Dispatcher ──────────────────────────────────────────────────────────────

export class DispatcherService {
  private mode: 'service-bus' | 'http-direct';
  private remoteDispatchEnabled: boolean;
  private warnedNoConsumer = false;

  constructor() {
    // Use Service Bus if connection string is configured
    this.mode = config.azure.serviceBus.connectionString ? 'service-bus' : 'http-direct';
    // No consumer exists yet for either remote path (nothing reads the
    // Service Bus queue and nothing serves ORCHESTRATOR_URL/process), so
    // remote dispatch is opt-in. The reply path is ALWAYS the in-process
    // orchestrator in webhook.routes.ts — this service must never suppress it.
    this.remoteDispatchEnabled = process.env.WHATSAPP_AI_ENABLE_REMOTE_DISPATCH === 'true';
    logger.info(`Dispatcher mode: ${this.mode} (remote dispatch ${this.remoteDispatchEnabled ? 'ENABLED' : 'disabled'})`);
  }

  /**
   * Dispatch a job to a remote orchestrator (Service Bus queue or HTTP).
   *
   * IMPORTANT: this is fire-and-forget mirroring, NOT the reply path. Until a
   * real consumer exists, messages sent here would be black-holed — the user
   * would never get a reply — so the in-process orchestrator in
   * webhook.routes.ts runs unconditionally, and remote dispatch only happens
   * behind the WHATSAPP_AI_ENABLE_REMOTE_DISPATCH flag.
   */
  async dispatch(
    message: NormalisedMessage,
    user: ResolvedUser,
    phoneNumberId: string,
    mediaUrl?: string
  ): Promise<void> {
    const remoteConfigured = this.mode === 'service-bus' || !!process.env.ORCHESTRATOR_URL;

    if (remoteConfigured && !this.warnedNoConsumer) {
      this.warnedNoConsumer = true;
      logger.warn(
        'Remote dispatch target configured (Service Bus / ORCHESTRATOR_URL) but no consumer exists yet. ' +
        'Messages are processed by the in-process orchestrator; remote dispatch is ' +
        (this.remoteDispatchEnabled
          ? 'ENABLED and will duplicate work once a consumer appears — ensure consumer-side idempotency by wamid.'
          : 'disabled (set WHATSAPP_AI_ENABLE_REMOTE_DISPATCH=true only when a consumer exists).')
      );
    }

    if (!this.remoteDispatchEnabled) {
      // Local in-process orchestrator (webhook.routes.ts) handles the message.
      return;
    }

    const job: OrchestratorJob = {
      wamid: message.wamid,
      userId: user.userId,
      phone: user.phone,
      senderName: user.name,
      businessId: user.businessId,
      message,
      mediaUrl,
      timestamp: message.timestamp,
      replyTo: message.from,
      phoneNumberId,
    };

    if (this.mode === 'service-bus') {
      await this.dispatchToServiceBus(job);
    } else {
      await this.dispatchDirect(job);
    }
  }

  // ─── Service Bus Dispatch ────────────────────────────────────────────────

  private async dispatchToServiceBus(job: OrchestratorJob): Promise<void> {
    try {
      // Dynamic import to avoid requiring @azure/service-bus when not used
      const { ServiceBusClient } = await import('@azure/service-bus');
      const client = new ServiceBusClient(config.azure.serviceBus.connectionString);
      const sender = client.createSender(config.azure.serviceBus.queues.incomingMessages);

      await sender.sendMessages({
        body: job,
        messageId: job.wamid, // Dedup at queue level
        contentType: 'application/json',
        subject: 'wa-inbound',
        applicationProperties: {
          userId: job.userId,
          businessId: job.businessId,
          messageType: job.message.type,
        },
      });

      await sender.close();
      await client.close();

      logger.info(`Job dispatched to Service Bus: ${job.wamid}`);
    } catch (error) {
      logger.error('Service Bus dispatch failed, falling back to direct', error);
      // Graceful degradation: fall back to direct
      await this.dispatchDirect(job);
    }
  }

  // ─── Direct HTTP Dispatch (dev/fallback) ─────────────────────────────────

  private async dispatchDirect(job: OrchestratorJob): Promise<void> {
    // In dev mode, the orchestrator runs in-process
    // The webhook route already calls the orchestrator directly
    // This is a no-op placeholder for when we split to separate services
    logger.debug(`Job processed directly: ${job.wamid} (${job.message.type})`);

    // If ORCHESTRATOR_URL is set, POST to it
    const orchestratorUrl = process.env.ORCHESTRATOR_URL;
    if (orchestratorUrl) {
      try {
        const axios = (await import('axios')).default;
        await axios.post(`${orchestratorUrl}/process`, job, {
          headers: {
            'Content-Type': 'application/json',
            'X-Internal-Key': process.env.INTERNAL_SERVICE_KEY || '',
          },
          timeout: 25000, // 25s (within Meta's retry window)
        });
        logger.info(`Job dispatched to orchestrator: ${job.wamid}`);
      } catch (error) {
        logger.error('Orchestrator dispatch failed', error);
        // Job will be retried by Meta webhook retries
      }
    }
  }
}
