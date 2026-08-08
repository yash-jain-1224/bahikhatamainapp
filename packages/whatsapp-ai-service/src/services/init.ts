// =============================================================================
// Service Initialization
// =============================================================================

import { config } from '../config';

export async function initializeServices(): Promise<void> {
  console.log('🔄 Initializing WhatsApp AI Services...');

  // ─── Production fail-fast for partial WhatsApp configuration ───────────────
  // When NO WhatsApp vars are set at all, the service boots degraded on
  // purpose (webhook verification always 403s — fail-closed, fine for an
  // inert deployment). But a PARTIAL configuration in production is a
  // misconfiguration: e.g. an access token without a verify token means Meta
  // can never verify the webhook, and a missing webhook secret means inbound
  // POSTs cannot be authenticated. Fail fast instead of limping.
  const wa = config.whatsapp;
  const anyWhatsAppConfigured = Boolean(
    wa.accessToken || wa.phoneNumberId || wa.businessAccountId || wa.verifyToken || wa.webhookSecret
  );
  if (config.nodeEnv === 'production' && anyWhatsAppConfigured) {
    const missing: string[] = [];
    if (!wa.verifyToken) missing.push('WHATSAPP_VERIFY_TOKEN');
    if (!wa.webhookSecret) missing.push('WHATSAPP_WEBHOOK_SECRET');
    if (missing.length > 0) {
      throw new Error(
        `WhatsApp is partially configured in production but ${missing.join(' and ')} ` +
        'is missing. Set the missing variable(s), or remove all WHATSAPP_* variables ' +
        'to run in the degraded (webhook-disabled) mode.'
      );
    }
  }

  // Validate critical config
  const warnings: string[] = [];

  if (!config.whatsapp.accessToken) {
    warnings.push('⚠️  WHATSAPP_ACCESS_TOKEN not set - webhook will not send messages');
  }
  if (!config.azure.openai.endpoint) {
    warnings.push('⚠️  AZURE_OPENAI_ENDPOINT not set - AI features disabled');
  }
  if (!config.azure.cosmos.endpoint) {
    warnings.push('⚠️  AZURE_COSMOS_ENDPOINT not set - using in-memory store');
  }
  if (!config.database.url) {
    warnings.push('⚠️  DATABASE_URL not set - accounting operations disabled');
  }

  if (warnings.length > 0) {
    console.log('\n' + warnings.join('\n') + '\n');
  }

  // Initialize connections (graceful - don't fail startup)
  try {
    // Redis connection will be lazy-loaded
    console.log('✅ Redis: Will connect on first use');
  } catch (err) {
    console.warn('⚠️  Redis initialization skipped:', (err as Error).message);
  }

  try {
    // Cosmos DB will be lazy-loaded
    console.log('✅ Cosmos DB: Will connect on first use');
  } catch (err) {
    console.warn('⚠️  Cosmos DB initialization skipped:', (err as Error).message);
  }

  console.log('✅ WhatsApp AI Service initialized successfully');
}
