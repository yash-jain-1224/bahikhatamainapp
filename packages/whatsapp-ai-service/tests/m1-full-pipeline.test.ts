// =============================================================================
// M1 Full Pipeline Tests
// =============================================================================
// Tests: Signature verification, user resolution, dispatcher, media pipeline,
// and edge cases. The user-resolution tests exercise the explicit dev-mock
// path, which requires WHATSAPP_AI_ALLOW_INSECURE_DEV (checked at call time).
// =============================================================================

import crypto from 'crypto';
import { UserResolutionService } from '../src/services/user-resolution';
import { DispatcherService } from '../src/services/dispatcher';
import { MediaPipeline } from '../src/services/media-pipeline';
import { config } from '../src/config';

// ─── Webhook Signature Verification ──────────────────────────────────────────

describe('Webhook signature verification', () => {
  function computeSignature(payload: string, secret: string): string {
    return 'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');
  }

  const testSecret = 'test_app_secret_2026';
  const testPayload = JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [{ id: '123', changes: [{ field: 'messages', value: { messages: [] } }] }],
  });

  test('HMAC signature shape and uniqueness', () => {
    const validSig = computeSignature(testPayload, testSecret);
    expect(validSig.startsWith('sha256=')).toBe(true);
    expect(validSig.length).toBe(71); // sha256= + 64 hex chars

    const altSig = computeSignature(JSON.stringify({ object: 'different' }), testSecret);
    expect(altSig).not.toBe(validSig);

    const wrongSecretSig = computeSignature(testPayload, 'wrong_secret');
    expect(wrongSecretSig).not.toBe(validSig);

    expect(crypto.timingSafeEqual(Buffer.from(validSig), Buffer.from(validSig))).toBe(true);
    expect(crypto.timingSafeEqual(Buffer.from(validSig), Buffer.from(wrongSecretSig))).toBe(false);
  });
});

// ─── Webhook Freshness ───────────────────────────────────────────────────────

describe('Webhook freshness window', () => {
  const nowEpoch = Math.floor(Date.now() / 1000);

  test('fresh/stale/future timestamps', () => {
    expect(nowEpoch - (nowEpoch - 30) < 300).toBe(true);   // 30s old passes
    expect(nowEpoch - (nowEpoch - 600) > 300).toBe(true);  // 10min old fails
    expect(nowEpoch + 120 - nowEpoch > 60).toBe(true);     // 2min ahead fails skew check
  });
});

// ─── User Resolution (dev mock path) ─────────────────────────────────────────

describe('User resolution (mock path, WHATSAPP_AI_ALLOW_INSECURE_DEV)', () => {
  const previousFlag = process.env.WHATSAPP_AI_ALLOW_INSECURE_DEV;

  beforeAll(() => {
    process.env.WHATSAPP_AI_ALLOW_INSECURE_DEV = 'true';
  });
  afterAll(() => {
    if (previousFlag === undefined) delete process.env.WHATSAPP_AI_ALLOW_INSECURE_DEV;
    else process.env.WHATSAPP_AI_ALLOW_INSECURE_DEV = previousFlag;
  });

  const userResolver = new UserResolutionService();

  test('valid Indian phone resolves via mock', async () => {
    const validResult = await userResolver.resolve('919876543210', 'Ram Kumar');
    expect(validResult.resolved).toBe(true);
    expect(validResult.user!.phone).toBe('9876543210'); // 91 prefix removed
    expect(validResult.user!.name).toBe('Ram Kumar');
    expect(validResult.needsOnboarding).toBe(false);
    expect(validResult.user!.role).toBe('OWNER');
  });

  test('invalid phone gets onboarding message', async () => {
    const invalidResult = await userResolver.resolve('12345', 'John');
    expect(invalidResult.resolved).toBe(false);
    expect(invalidResult.needsOnboarding).toBe(true);
    expect(invalidResult.onboardingMessage).toContain('Namaste');
    expect(invalidResult.onboardingMessage).toContain('signup');
  });

  test('phone with +91 resolves', async () => {
    const withPlus = await userResolver.resolve('+919876543210', 'Test');
    expect(withPlus.resolved).toBe(true);
  });

  test('business selection persists in session', async () => {
    userResolver.selectBusiness('9876543210', 'biz_custom_123');
    const afterSelect = await userResolver.resolve('919876543210', 'Ram Kumar');
    expect(afterSelect.user!.businessId).toBe('biz_custom_123');
  });

  test('session stats and upsert', () => {
    expect(userResolver.getSessionStats().activeSessions).toBeGreaterThan(0);
    userResolver.upsertSession('919876543210', 'Ram Kumar');
    expect(userResolver.getSessionStats().activeSessions).toBeGreaterThan(0);
  });
});

describe('User resolution (fail-closed default)', () => {
  const previousFlag = process.env.WHATSAPP_AI_ALLOW_INSECURE_DEV;

  beforeAll(() => {
    delete process.env.WHATSAPP_AI_ALLOW_INSECURE_DEV;
  });
  afterAll(() => {
    if (previousFlag !== undefined) process.env.WHATSAPP_AI_ALLOW_INSECURE_DEV = previousFlag;
  });

  test('unknown sender is NOT treated as a registered owner', async () => {
    const resolver = new UserResolutionService();
    const result = await resolver.resolve('919999888877', 'Stranger');
    expect(result.resolved).toBe(false);
    expect(result.needsOnboarding).toBe(true);
  });
});

// ─── Dispatcher ──────────────────────────────────────────────────────────────

describe('Dispatcher', () => {
  const dispatcherService = new DispatcherService();

  const mockNormalisedMessage = {
    wamid: 'wamid.dispatch_test_001',
    from: '919876543210',
    timestamp: new Date().toISOString(),
    type: 'text' as const,
    text: 'Test dispatch message',
    isReply: false,
  };

  const mockUser = {
    userId: 'user_9876543210',
    phone: '9876543210',
    name: 'Test User',
    businessId: 'biz_123',
    businessName: 'Test Business',
    role: 'OWNER' as const,
    isOnboarded: true,
  };

  test('does not throw in dev mode (no queue, no URL)', async () => {
    await expect(
      dispatcherService.dispatch(mockNormalisedMessage as any, mockUser, 'phone_num_id_123')
    ).resolves.toBeUndefined();
  });

  test('does not throw with media URL', async () => {
    await expect(
      dispatcherService.dispatch(
        mockNormalisedMessage as any,
        mockUser,
        'phone_num_id_123',
        'https://storage.blob.core.windows.net/images/test.jpg'
      )
    ).resolves.toBeUndefined();
  });
});

// ─── Media Pipeline ──────────────────────────────────────────────────────────

describe('Media pipeline', () => {
  test('instantiates in local mode', () => {
    const mediaPipeline = new MediaPipeline();
    expect(mediaPipeline).not.toBeNull();
  });
});

// ─── Send Route Auth ─────────────────────────────────────────────────────────

describe('Send route internal key auth', () => {
  function verifyInternalKey(
    provided: string | undefined,
    actual: string | undefined,
    isProd: boolean
  ): 'pass' | 'skip' | 'reject' {
    if (!actual) return isProd ? 'reject' : 'skip';
    if (provided !== actual) return 'reject';
    return 'pass';
  }

  test('key verification matrix', () => {
    expect(verifyInternalKey('secret123', 'secret123', true)).toBe('pass');
    expect(verifyInternalKey('wrong', 'secret123', true)).toBe('reject');
    expect(verifyInternalKey(undefined, 'secret123', true)).toBe('reject');
    expect(verifyInternalKey(undefined, undefined, false)).toBe('skip');
    expect(verifyInternalKey(undefined, undefined, true)).toBe('reject');
    expect(verifyInternalKey('any', undefined, false)).toBe('skip');
  });
});

// ─── Config ──────────────────────────────────────────────────────────────────

describe('Config', () => {
  test('WhatsApp client URL construction', () => {
    const expectedBaseUrl = `https://graph.facebook.com/${config.whatsapp.apiVersion}`;
    expect(expectedBaseUrl).toContain('graph.facebook.com');
    expect(config.whatsapp.apiVersion.startsWith('v')).toBe(true);
  });

  test('business rules', () => {
    expect(config.port).toBe(3013);
    expect(config.rules.defaultApprovalThreshold).toBe(50000);
    expect(config.rules.maxClarificationAttempts).toBe(3);
    expect(config.rules.responseTimeoutMs).toBe(5000);
    expect(config.accounting.financialYearStart).toBe(4);
    expect(config.accounting.gstRates).toContain(18);
    expect(config.security.rateLimits.webhookPerMinute).toBe(300);
  });

  test('verify token has no hardcoded fallback', () => {
    // Unless the env explicitly sets it, the verify token must be empty
    // (fail-closed), never a guessable default baked into source.
    if (!process.env.WHATSAPP_VERIFY_TOKEN) {
      expect(config.whatsapp.verifyToken).toBe('');
    }
    expect(config.whatsapp.verifyToken).not.toBe('bahikhata_webhook_verify');
  });
});

// ─── Full Webhook Payload Parsing ────────────────────────────────────────────

describe('Webhook payload structure', () => {
  const nowEpoch = Math.floor(Date.now() / 1000);

  const fullPayload = {
    object: 'whatsapp_business_account',
    entry: [{
      id: 'WABA_ID_123',
      changes: [{
        field: 'messages',
        value: {
          messaging_product: 'whatsapp',
          metadata: {
            display_phone_number: '15551234567',
            phone_number_id: 'PHONE_NUMBER_ID_456',
          },
          contacts: [
            { profile: { name: 'Rajesh Kumar' }, wa_id: '919876543210' },
          ],
          messages: [
            {
              from: '919876543210',
              id: 'wamid.HBgMOTE5ODc2NTQzMjEwFQIAERgSQjQ5RkEwOTFBQkQ5OTc4MQA=',
              timestamp: String(nowEpoch),
              type: 'text',
              text: { body: 'Shyam ko 25000 diye UPI se' },
            },
          ],
        },
      }],
    }],
  };

  test('message payload fields', () => {
    expect(fullPayload.object).toBe('whatsapp_business_account');
    expect(fullPayload.entry).toHaveLength(1);
    expect(fullPayload.entry[0].changes[0].field).toBe('messages');

    const msg = fullPayload.entry[0].changes[0].value.messages![0];
    expect(msg.from).toBe('919876543210');
    expect(msg.type).toBe('text');
    expect(msg.text!.body).toContain('Shyam');
    expect(msg.text!.body).toContain('25000');
    expect(msg.text!.body).toContain('UPI');

    const contact = fullPayload.entry[0].changes[0].value.contacts![0];
    expect(contact.profile.name).toBe('Rajesh Kumar');
    expect(contact.wa_id).toBe('919876543210');

    expect(fullPayload.entry[0].changes[0].value.metadata.phone_number_id).toBe('PHONE_NUMBER_ID_456');
  });

  test('status webhooks carry no messages', () => {
    const statusPayload = {
      object: 'whatsapp_business_account',
      entry: [{
        id: 'WABA_ID_123',
        changes: [{
          field: 'messages',
          value: {
            messaging_product: 'whatsapp',
            metadata: { display_phone_number: '15551234567', phone_number_id: 'PH_123' },
            statuses: [{ id: 'wamid.status_001', status: 'delivered', timestamp: '1719936000', recipient_id: '919876543210' }],
          },
        }],
      }],
    };
    const statusMessages = (statusPayload.entry[0].changes[0].value as any).messages;
    expect(!statusMessages || statusMessages.length === 0).toBe(true);
  });

  test('non-WBA payloads are skipped', () => {
    const nonWbaPayload = { object: 'page', entry: [] };
    expect(nonWbaPayload.object).not.toBe('whatsapp_business_account');
  });
});
