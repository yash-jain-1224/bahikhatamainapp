// =============================================================================
// User & Business Resolution Service
// =============================================================================
// Resolves WhatsApp phone number → User → Business context
// Handles: unknown user onboarding, multi-business picker, session upsert
// =============================================================================

import { SecureLogger } from '../middleware/pii-masking';
import { config } from '../config';
import { getPrisma } from './prisma';

const logger = new SecureLogger('UserResolver');

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ResolvedUser {
  userId: string;
  phone: string;
  name: string;
  businessId: string;
  businessName: string;
  role: 'OWNER' | 'MANAGER' | 'ACCOUNTANT' | 'STAFF';
  isOnboarded: boolean;
}

export interface BusinessOption {
  id: string;
  name: string;
  role: string;
}

export interface UserResolutionResult {
  resolved: boolean;
  user?: ResolvedUser;
  needsOnboarding: boolean;
  needsBusinessPicker: boolean;
  businessOptions?: BusinessOption[];
  onboardingMessage?: string;
}

// ─── In-memory session store (replace with Redis/Prisma in production) ───────

interface WhatsAppSession {
  phone: string;
  userId?: string;
  selectedBusinessId?: string;
  lastActiveAt: string;
  createdAt: string;
}

const sessions = new Map<string, WhatsAppSession>();

// ─── User Resolution Service ─────────────────────────────────────────────────

export class UserResolutionService {
  /**
   * Resolve WhatsApp phone number to user + business context
   * ADR-2: Uses existing User.phone field to map WhatsApp numbers to users
   */
  async resolve(phone: string, senderName: string): Promise<UserResolutionResult> {
    // Normalise phone (remove +91, leading 0, etc.)
    const normalisedPhone = this.normalisePhone(phone);
    logger.debug(`Resolving user for phone: ${normalisedPhone}`);

    // Check if we have a session with selected business
    const session = sessions.get(normalisedPhone);

    // mockResolution() is a test/dev convenience only: it treats ANY valid
    // Indian mobile as a registered owner of `biz_<phone>`. Behind an explicit
    // opt-in flag because that behaviour in production would let unknown
    // senders transact against a business that does not exist.
    const allowMock = process.env.WHATSAPP_AI_ALLOW_INSECURE_DEV === 'true';

    if (allowMock) {
      logger.warn('Using MOCK user resolution — WHATSAPP_AI_ALLOW_INSECURE_DEV=true. Never enable this in production.');
      return this.mockResolution(normalisedPhone, senderName, session);
    }

    // Real resolution (ADR-2): User.phone → BusinessUser memberships. Fail
    // closed on any lookup problem — an onboarding reply is always safe.
    const prisma = getPrisma();
    if (!prisma) {
      logger.error('Cannot resolve user: DATABASE_URL is not set / Prisma unavailable');
      return {
        resolved: false,
        needsOnboarding: true,
        needsBusinessPicker: false,
        onboardingMessage: this.getOnboardingMessage(senderName),
      };
    }

    try {
      const user = await prisma.user.findFirst({
        where: { phone: normalisedPhone, is_active: true },
        select: { id: true, phone: true, name: true },
      });

      if (!user) {
        logger.info(`No registered user for phone ending ${normalisedPhone.slice(-4)}`);
        return {
          resolved: false,
          needsOnboarding: true,
          needsBusinessPicker: false,
          onboardingMessage: this.getOnboardingMessage(senderName),
        };
      }

      const memberships = await prisma.businessUser.findMany({
        where: { user_id: user.id, is_active: true, business: { is_active: true } },
        select: {
          role: true,
          business: { select: { id: true, name: true } },
        },
        orderBy: { joined_at: 'asc' },
      });

      if (memberships.length === 0) {
        return {
          resolved: false,
          needsOnboarding: true,
          needsBusinessPicker: false,
          onboardingMessage:
            `Namaste ${user.name || senderName}! 🙏\n\n` +
            `Aapka account registered hai, lekin koi business setup nahi hai.\n\n` +
            `Kripya pehle BahiKhata app mein apna business banayein, phir WhatsApp se hisaab-kitaab manage karein.`,
        };
      }

      const toResolved = (m: (typeof memberships)[number]): ResolvedUser => ({
        userId: user.id,
        phone: user.phone,
        name: user.name || senderName,
        businessId: m.business.id,
        businessName: m.business.name,
        role: m.role as ResolvedUser['role'],
        isOnboarded: true,
      });

      if (memberships.length === 1) {
        return { resolved: true, user: toResolved(memberships[0]), needsOnboarding: false, needsBusinessPicker: false };
      }

      // Multi-business: use the stored picker selection when it is still a
      // valid membership; otherwise ask again.
      const selected = session?.selectedBusinessId
        ? memberships.find(m => m.business.id === session.selectedBusinessId)
        : undefined;
      if (selected) {
        return { resolved: true, user: toResolved(selected), needsOnboarding: false, needsBusinessPicker: false };
      }

      return {
        resolved: false,
        needsOnboarding: false,
        needsBusinessPicker: true,
        businessOptions: memberships.map(m => ({
          id: m.business.id,
          name: m.business.name,
          role: m.role,
        })),
      };
    } catch (error) {
      logger.error('User resolution failed', error);
      return {
        resolved: false,
        needsOnboarding: true,
        needsBusinessPicker: false,
        onboardingMessage: this.getOnboardingMessage(senderName),
      };
    }
  }

  /**
   * User selects a business (from multi-business picker)
   */
  selectBusiness(phone: string, businessId: string): void {
    const normalisedPhone = this.normalisePhone(phone);
    const session = sessions.get(normalisedPhone);
    if (session) {
      session.selectedBusinessId = businessId;
      session.lastActiveAt = new Date().toISOString();
    } else {
      sessions.set(normalisedPhone, {
        phone: normalisedPhone,
        selectedBusinessId: businessId,
        lastActiveAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      });
    }
  }

  /**
   * Upsert WhatsAppSession (preserves parity with notification-service).
   * The DB row needs a business_id (required FK), so persistence happens only
   * for resolved users; unknown senders still get the in-memory touch.
   * Fire-and-forget: session bookkeeping must never fail the message pipeline.
   */
  upsertSession(phone: string, senderName: string, businessId?: string): void {
    const normalisedPhone = this.normalisePhone(phone);
    const existing = sessions.get(normalisedPhone);
    if (existing) {
      existing.lastActiveAt = new Date().toISOString();
    } else {
      sessions.set(normalisedPhone, {
        phone: normalisedPhone,
        lastActiveAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      });
    }

    logger.debug(`Session upserted for ${normalisedPhone} (${senderName})`);

    const prisma = getPrisma();
    if (!prisma || !businessId) return;

    // updateMany-then-create instead of upsert: (phone, business_id) has no
    // unique constraint, so upsert would need a synthetic where and could
    // still violate the business FK — the same failure notification-service's
    // webhook had before it switched to updateMany by phone.
    void (async () => {
      try {
        const updated = await prisma.whatsAppSession.updateMany({
          where: { phone: normalisedPhone, business_id: businessId },
          data: { status: 'active' },
        });
        if (updated.count === 0) {
          await prisma.whatsAppSession.create({
            data: { phone: normalisedPhone, business_id: businessId, status: 'active' },
          });
        }
      } catch (error) {
        logger.warn(`WhatsAppSession persist failed: ${(error as Error).message}`);
      }
    })();
  }

  /**
   * Get session stats (for metrics)
   */
  getSessionStats(): { activeSessions: number } {
    return { activeSessions: sessions.size };
  }

  // ─── Private ─────────────────────────────────────────────────────────────

  private normalisePhone(phone: string): string {
    // Remove non-digits
    let digits = phone.replace(/\D/g, '');
    // Remove country code (91 for India)
    if (digits.startsWith('91') && digits.length === 12) {
      digits = digits.slice(2);
    }
    return digits;
  }

  private mockResolution(
    phone: string,
    senderName: string,
    session?: WhatsAppSession
  ): UserResolutionResult {
    // Mock: treat any phone starting with 9/8/7/6 as valid Indian user
    if (/^[6-9]\d{9}$/.test(phone)) {
      return {
        resolved: true,
        user: {
          userId: `user_${phone}`,
          phone,
          name: senderName,
          businessId: session?.selectedBusinessId || `biz_${phone}`,
          businessName: `${senderName}'s Business`,
          role: 'OWNER',
          isOnboarded: true,
        },
        needsOnboarding: false,
        needsBusinessPicker: false,
      };
    }

    // Unknown user
    return {
      resolved: false,
      needsOnboarding: true,
      needsBusinessPicker: false,
      onboardingMessage: this.getOnboardingMessage(senderName),
    };
  }

  private getOnboardingMessage(name: string): string {
    return (
      `Namaste ${name}! 🙏\n\n` +
      `BahiKhata mein aapka swagat hai!\n\n` +
      `Abhi aapka phone number hamare system mein registered nahi hai.\n\n` +
      `Kripya pehle BahiKhata app se signup karein:\n` +
      `📱 https://bahikhata.app/signup\n\n` +
      `Signup ke baad aap WhatsApp se apna hisaab-kitaab manage kar sakte hain.`
    );
  }
}
