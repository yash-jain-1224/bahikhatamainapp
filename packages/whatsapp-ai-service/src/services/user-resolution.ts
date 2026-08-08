// =============================================================================
// User & Business Resolution Service
// =============================================================================
// Resolves WhatsApp phone number → User → Business context
// Handles: unknown user onboarding, multi-business picker, session upsert
// =============================================================================

import { SecureLogger } from '../middleware/pii-masking';
import { config } from '../config';

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

    // mockResolution() returns `resolved: true` with `role: 'OWNER'` and
    // `isOnboarded: true` for ANY number matching /^[6-9]\d{9}$/ — so every
    // unknown sender was treated as a registered owner and the agents then
    // transacted against `biz_<phone>`, a business that does not exist. It was
    // reached unconditionally: the branch below had a TODO and fell through to
    // the same mock even when DATABASE_URL was set, so "production mode" was
    // never actually different.
    //
    // Fail closed instead. Unknown senders now get the onboarding message,
    // which is the correct answer until real resolution exists.
    //
    // TODO (feature): implement the real lookup — find the user by phone and
    // their businessUser memberships. That needs a Prisma client, which this
    // service does not have yet (@prisma/client is a dependency but nothing
    // instantiates it), so it is a build rather than a repair.
    const allowMock = process.env.WHATSAPP_AI_ALLOW_INSECURE_DEV === 'true';

    if (allowMock) {
      logger.warn('Using MOCK user resolution — WHATSAPP_AI_ALLOW_INSECURE_DEV=true. Never enable this in production.');
      return this.mockResolution(normalisedPhone, senderName, session);
    }

    try {
      if (!config.database.url) {
        logger.error('Cannot resolve user: DATABASE_URL is not set');
      } else {
        logger.error('Cannot resolve user: real phone-to-business resolution is not implemented');
      }
      return {
        resolved: false,
        needsOnboarding: true,
        needsBusinessPicker: false,
        onboardingMessage: this.getOnboardingMessage(senderName),
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
   * Upsert WhatsAppSession (preserves parity with notification-service)
   */
  upsertSession(phone: string, senderName: string): void {
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
    // TODO: In production, also upsert WhatsAppSession in Prisma DB
    // await prisma.whatsAppSession.upsert({ where: { phone }, create: {...}, update: { lastActiveAt: new Date() }})
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
