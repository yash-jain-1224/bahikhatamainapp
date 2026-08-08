import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import {
  getRedisClient,
  generateOTP,
  createLogger,
  REDIS_KEYS,
  OTP_EXPIRY_SECONDS,
  ACCESS_TOKEN_EXPIRY,
  REFRESH_TOKEN_EXPIRY,
  OTP_RATE_LIMIT_MAX,
  ROLE_PERMISSIONS,
  getPrismaClient,
  getPlatformSettings,
} from '../shared';

const prisma = getPrismaClient();
const logger = createLogger('auth-service');
const JWT_SECRET = process.env.JWT_SECRET || 'bahi-khata-pro-secret-key-change-in-production';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'bahi-khata-pro-refresh-secret';

export class AuthService {
  /**
   * Check whether ALL of a user's businesses have expired trials (no active/trial subscription).
   * Returns trial info so the frontend can show remaining time or block access.
   */
  private async getTrialInfo(userId: string): Promise<{
    trialExpired: boolean;
    trialEndsAt: string | null;
    daysRemaining: number | null;
    planName: string | null;
    // Distinguishes "no plan picked yet" from a healthy trial — the frontend's
    // plan-selection redirect keyed on `trial === null`, which never happened.
    hasSubscription: boolean;
    maxBusinesses: number;
    // False for a paid ACTIVE plan — the banner was telling paying customers
    // their "free trial" was expiring every billing cycle.
    isTrial: boolean;
  }> {
    // Find the user's businesses
    const businessUsers = await prisma.businessUser.findMany({
      where: { user_id: userId, is_active: true },
      select: { business_id: true },
    });

    if (businessUsers.length === 0) {
      // No businesses yet — not expired (they'll create one which starts a trial)
      return { trialExpired: false, trialEndsAt: null, daysRemaining: null, planName: null, hasSubscription: false, maxBusinesses: 1, isTrial: true };
    }

    const businessIds = businessUsers.map((bu: any) => bu.business_id);

    // Look for ANY active or valid-trial subscription across all businesses
    const activeSub = await prisma.subscription.findFirst({
      where: {
        business_id: { in: businessIds },
        status: { in: ['ACTIVE', 'TRIAL'] },
        current_period_end: { gte: new Date() },
      },
      include: { plan: true },
      orderBy: { current_period_end: 'desc' },
    });

    if (activeSub) {
      const now = new Date();
      const endsAt = new Date(activeSub.current_period_end);
      const msRemaining = endsAt.getTime() - now.getTime();
      const daysRemaining = Math.max(0, Math.ceil(msRemaining / (1000 * 60 * 60 * 24)));

      return {
        trialExpired: false,
        trialEndsAt: activeSub.trial_ends_at?.toISOString() || activeSub.current_period_end.toISOString(),
        daysRemaining,
        planName: (activeSub as any).plan?.name || null,
        hasSubscription: true,
        maxBusinesses: (activeSub as any).plan?.max_businesses ?? 1,
        isTrial: activeSub.status === 'TRIAL',
      };
    }

    // No valid subscription found — check if there's an expired one
    const expiredSub = await prisma.subscription.findFirst({
      where: {
        business_id: { in: businessIds },
      },
      include: { plan: true },
      orderBy: { current_period_end: 'desc' },
    });

    if (!expiredSub) {
      // Business exists but user hasn't picked a plan yet
      return { trialExpired: false, trialEndsAt: null, daysRemaining: null, planName: null, hasSubscription: false, maxBusinesses: 1, isTrial: true };
    }

    return {
      trialExpired: true,
      trialEndsAt: expiredSub?.trial_ends_at?.toISOString() || expiredSub?.current_period_end?.toISOString() || null,
      daysRemaining: 0,
      planName: (expiredSub as any)?.plan?.name || null,
      hasSubscription: true,
      maxBusinesses: (expiredSub as any)?.plan?.max_businesses ?? 1,
      isTrial: expiredSub.status === 'TRIAL',
    };
  }

  /**
   * Send OTP to phone number
   */
  async sendOTP(phone: string): Promise<{ success: boolean; message: string; code?: string }> {
    const redis = getRedisClient();

    // Check if user exists — login via OTP requires an existing account
    const existingUser = await prisma.user.findUnique({ where: { phone }, select: { id: true } });
    if (!existingUser) {
      logger.info('OTP requested for non-existent phone', { phone });
      return { success: false, message: 'No account found with this phone number. Please register first.', code: 'USER_NOT_FOUND' };
    }

    // Rate limiting: max 5 OTP requests per phone per 15 min
    const attemptsKey = REDIS_KEYS.OTP_ATTEMPTS(phone);
    const attempts = await redis.incr(attemptsKey);
    if (attempts === 1) {
      await redis.expire(attemptsKey, 900); // 15 min
    }
    if (attempts > OTP_RATE_LIMIT_MAX) {
      logger.warn('OTP rate limit exceeded', { phone });
      return { success: false, message: 'Too many OTP requests. Try again later.' };
    }

    // Generate OTP
    const otp = generateOTP(6);
    const otpKey = REDIS_KEYS.OTP(phone);

    // Store OTP in Redis
    await redis.setex(otpKey, OTP_EXPIRY_SECONDS, otp);

    // TODO: Send OTP via SMS provider (Twilio/MSG91)
    // In development, log OTP
    if (process.env.NODE_ENV !== 'production') {
      logger.info(`OTP for ${phone}: ${otp}`);
    }

    logger.info('OTP sent', { phone, environment: process.env.NODE_ENV });
    return { success: true, message: 'OTP sent successfully' };
  }

  /**
   * Verify OTP and generate tokens
   */
  async verifyOTP(phone: string, otp: string): Promise<{
    success: boolean;
    message: string;
    code?: string;
    data?: {
      accessToken: string;
      refreshToken: string;
      user: Record<string, unknown>;
      isNewUser: boolean;
      businesses: Record<string, unknown>[];
      trial?: { expired: boolean; endsAt: string | null; daysRemaining: number | null; planName: string | null; hasSubscription: boolean; maxBusinesses: number; isTrial: boolean };
    };
  }> {
    const redis = getRedisClient();
    const otpKey = REDIS_KEYS.OTP(phone);

    // Get stored OTP
    const storedOTP = await redis.get(otpKey);

    if (!storedOTP) {
      return { success: false, message: 'OTP expired or not found' };
    }

    if (storedOTP !== otp) {
      return { success: false, message: 'Invalid OTP' };
    }

    // Delete OTP after verification
    await redis.del(otpKey);

    // Find or create user
    const user = await prisma.user.findUnique({
      where: { phone },
      include: {
        profile: true,
        business_users: {
          include: {
            business: true,
            permissions: true,
          },
          where: { is_active: true },
        },
      },
    });

    const isNewUser = false;
    if (!user) {
      // User doesn't exist — OTP was valid but there's no account to log into.
      // Return a clear error so the frontend can redirect to registration.
      return { success: false, message: 'No account found for this phone number. Please register first.', code: 'USER_NOT_FOUND' };
    }

    // Same check the password path makes at login. The `is_active: true` filter
    // above applies to business_users, not to the user, so without this a
    // suspended account could still sign in through the OTP route.
    if (!user.is_active) {
      return { success: false, message: 'Account is deactivated. Please contact support.' };
    }

    // Generate tokens
    const accessToken = this.generateAccessToken(user);
    const refreshToken = await this.generateRefreshToken(user.id);

    // Build businesses response with roles
    const businesses = user.business_users.map((bu: any) => ({
      id: bu.business.id,
      name: bu.business.name,
      type: bu.business.type,
      logo_url: bu.business.logo_url || '',
      address: bu.business.address || '',
      city: bu.business.city || '',
      state: bu.business.state || '',
      phone: bu.business.phone || '',
      gst_number: bu.business.gst_number || '',
      is_active: bu.business.is_active,
      is_primary: bu.business.is_primary,
      role: bu.role,
      permissions: [
        ...(ROLE_PERMISSIONS[bu.role] || []),
        ...bu.permissions.map((p: any) => p.permission),
      ],
    }));

    // Check trial info
    const trialInfo = await this.getTrialInfo(user.id);

    logger.info('User authenticated', { userId: user.id, phone });

    return {
      success: true,
      message: 'Authentication successful',
      data: {
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          phone: user.phone,
          name: user.name,
          email: user.email,
          avatar_url: user.avatar_url,
          is_active: user.is_active,
          is_super_admin: user.is_super_admin,
        },
        isNewUser,
        businesses,
        trial: {
          expired: trialInfo.trialExpired,
          endsAt: trialInfo.trialEndsAt,
          daysRemaining: trialInfo.daysRemaining,
          planName: trialInfo.planName,
          hasSubscription: trialInfo.hasSubscription,
          maxBusinesses: trialInfo.maxBusinesses,
          isTrial: trialInfo.isTrial,
        },
      },
    };
  }

  /**
   * Register a new user with email & password
   */
  async register(data: { name: string; email: string; password: string; phone?: string }): Promise<{
    success: boolean;
    message: string;
    data?: {
      accessToken: string;
      refreshToken: string;
      user: Record<string, unknown>;
      isNewUser: boolean;
      businesses: Record<string, unknown>[];
      trial?: { expired: boolean; endsAt: string | null; daysRemaining: number | null; planName: string | null; hasSubscription: boolean; maxBusinesses: number; isTrial: boolean };
    };
  }> {
    // The admin console's "User Registration" toggle is enforced here. It used
    // to be purely decorative: an admin could switch signups off, see the save
    // succeed, and new accounts kept being created.
    const settings = await getPlatformSettings();
    if (!settings.registrationEnabled) {
      return { success: false, message: 'New registrations are currently closed. Please contact support.' };
    }

    // ── Uniqueness checks ──────────────────────────────────────
    // Phone is mandatory — one account per phone number
    if (!data.phone) {
      return { success: false, message: 'Phone number is required.' };
    }

    // Check email uniqueness
    const existingEmail = await prisma.user.findUnique({ where: { email: data.email } });
    if (existingEmail) {
      return { success: false, message: 'An account with this email already exists. Please log in.' };
    }

    // Check phone uniqueness
    const existingPhone = await prisma.user.findUnique({ where: { phone: data.phone } });
    if (existingPhone) {
      return { success: false, message: 'An account with this phone number already exists. Please log in.' };
    }

    const passwordHash = await bcrypt.hash(data.password, 12);

    const user = await prisma.user.create({
      data: {
        id: uuidv4(),
        name: data.name,
        email: data.email,
        phone: data.phone,  // phone is mandatory
        password_hash: passwordHash,
        is_active: true,
      },
      include: {
        profile: true,
        business_users: {
          include: { business: true, permissions: true },
          where: { is_active: true },
        },
      },
    });

    const accessToken = this.generateAccessToken(user);
    const refreshToken = await this.generateRefreshToken(user.id);

    const businesses = user.business_users.map((bu: any) => ({
      id: bu.business.id,
      name: bu.business.name,
      type: bu.business.type,
      logo_url: bu.business.logo_url || '',
      address: bu.business.address || '',
      city: bu.business.city || '',
      state: bu.business.state || '',
      phone: bu.business.phone || '',
      gst_number: bu.business.gst_number || '',
      is_active: bu.business.is_active,
      is_primary: bu.business.is_primary,
      role: bu.role,
      permissions: [
        ...(ROLE_PERMISSIONS[bu.role] || []),
        ...bu.permissions.map((p: any) => p.permission),
      ],
    }));

    // Check trial info
    const trialInfo = await this.getTrialInfo(user.id);

    logger.info('User registered with email', { userId: user.id, email: data.email });

    return {
      success: true,
      message: 'Registration successful',
      data: {
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          phone: user.phone,
          name: user.name,
          email: user.email,
          avatar_url: user.avatar_url,
          is_active: user.is_active,
          is_super_admin: user.is_super_admin,
        },
        isNewUser: true,
        businesses,
        trial: {
          expired: trialInfo.trialExpired,
          endsAt: trialInfo.trialEndsAt,
          daysRemaining: trialInfo.daysRemaining,
          planName: trialInfo.planName,
          hasSubscription: trialInfo.hasSubscription,
          maxBusinesses: trialInfo.maxBusinesses,
          isTrial: trialInfo.isTrial,
        },
      },
    };
  }

  /**
   * Login with email & password
   */
  async loginWithEmail(email: string, password: string): Promise<{
    success: boolean;
    message: string;
    code?: string;
    data?: {
      accessToken: string;
      refreshToken: string;
      user: Record<string, unknown>;
      isNewUser: boolean;
      businesses: Record<string, unknown>[];
      trial?: { expired: boolean; endsAt: string | null; daysRemaining: number | null; planName: string | null; hasSubscription: boolean; maxBusinesses: number; isTrial: boolean };
    };
  }> {
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        profile: true,
        business_users: {
          include: { business: true, permissions: true },
          where: { is_active: true },
        },
      },
    });

    if (!user) {
      return { success: false, message: 'No account found with this email. Please register first.', code: 'USER_NOT_FOUND' };
    }

    if (!user.password_hash) {
      return { success: false, message: 'Invalid email or password' };
    }

    if (!user.is_active) {
      return { success: false, message: 'Account is deactivated. Contact support.' };
    }

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return { success: false, message: 'Invalid email or password' };
    }

    const accessToken = this.generateAccessToken(user);
    const refreshToken = await this.generateRefreshToken(user.id);

    const businesses = user.business_users.map((bu: any) => ({
      id: bu.business.id,
      name: bu.business.name,
      type: bu.business.type,
      logo_url: bu.business.logo_url || '',
      address: bu.business.address || '',
      city: bu.business.city || '',
      state: bu.business.state || '',
      phone: bu.business.phone || '',
      gst_number: bu.business.gst_number || '',
      is_active: bu.business.is_active,
      is_primary: bu.business.is_primary,
      role: bu.role,
      permissions: [
        ...(ROLE_PERMISSIONS[bu.role] || []),
        ...bu.permissions.map((p: any) => p.permission),
      ],
    }));

    // Check trial info
    const trialInfo = await this.getTrialInfo(user.id);

    logger.info('User logged in with email', { userId: user.id, email });

    return {
      success: true,
      message: 'Authentication successful',
      data: {
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          phone: user.phone,
          name: user.name,
          email: user.email,
          avatar_url: user.avatar_url,
          is_active: user.is_active,
          is_super_admin: user.is_super_admin,
        },
        isNewUser: false,
        businesses,
        trial: {
          expired: trialInfo.trialExpired,
          endsAt: trialInfo.trialEndsAt,
          daysRemaining: trialInfo.daysRemaining,
          planName: trialInfo.planName,
          hasSubscription: trialInfo.hasSubscription,
          maxBusinesses: trialInfo.maxBusinesses,
          isTrial: trialInfo.isTrial,
        },
      },
    };
  }

  /**
   * Refresh access token
   */
  async refreshAccessToken(refreshToken: string): Promise<{
    success: boolean;
    message: string;
    data?: { accessToken: string; refreshToken: string };
  }> {
    if (!refreshToken || typeof refreshToken !== 'string' || refreshToken.trim() === '') {
      return { success: false, message: 'Refresh token is required' };
    }

    const storedToken = await prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true },
    });

    if (!storedToken || storedToken.expires_at < new Date()) {
      if (storedToken) {
        // Use deleteMany to avoid P2025 error if token was already deleted (race condition)
        await prisma.refreshToken.deleteMany({ where: { id: storedToken.id } });
      }
      return { success: false, message: 'Invalid or expired refresh token' };
    }

    // A suspended account must not be able to renew its session. Without this
    // check, "Suspend User" in the admin console had no effect on anyone
    // already logged in: App.tsx rotates the token every 12 minutes, so a
    // suspended user stayed signed in indefinitely. Password login already
    // rejects inactive users — this closes the path around it.
    if (!storedToken.user.is_active) {
      // Drop every refresh token for the account, not just this one, so other
      // devices cannot keep the session alive either.
      await prisma.refreshToken.deleteMany({ where: { user_id: storedToken.user.id } });
      logger.warn('Refresh denied for deactivated user', { userId: storedToken.user.id });
      return { success: false, message: 'Account is deactivated' };
    }

    // Rotate refresh token (use deleteMany to avoid P2025 on race conditions)
    await prisma.refreshToken.deleteMany({ where: { id: storedToken.id } });
    const newAccessToken = this.generateAccessToken(storedToken.user);
    const newRefreshToken = await this.generateRefreshToken(storedToken.user.id);

    return {
      success: true,
      message: 'Token refreshed',
      data: { accessToken: newAccessToken, refreshToken: newRefreshToken },
    };
  }

  /**
   * Logout - revoke refresh token
   */
  async logout(userId: string, refreshToken?: string): Promise<void> {
    if (refreshToken) {
      await prisma.refreshToken.deleteMany({
        where: { user_id: userId, token: refreshToken },
      });
    } else {
      // Logout from all devices
      await prisma.refreshToken.deleteMany({
        where: { user_id: userId },
      });
    }
    logger.info('User logged out', { userId });
  }

  private generateAccessToken(user: { id: string; phone: string; is_super_admin: boolean }): string {
    return jwt.sign(
      {
        userId: user.id,
        phone: user.phone,
        isSuperAdmin: user.is_super_admin,
      },
      JWT_SECRET,
      { expiresIn: ACCESS_TOKEN_EXPIRY },
    );
  }

  private async generateRefreshToken(userId: string): Promise<string> {
    const jti = uuidv4();
    const token = jwt.sign({ userId, jti }, JWT_REFRESH_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRY });
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // Remove only EXPIRED tokens. Wiping all of the user's tokens here meant
    // logging in anywhere silently killed every other device's session (the
    // desktop's next silent refresh got "Invalid refresh token" → forced
    // logout). Rotation stays single-use because refreshAccessToken deletes
    // the consumed token itself, and suspension/logout revoke explicitly.
    await prisma.refreshToken.deleteMany({
      where: { user_id: userId, expires_at: { lt: new Date() } },
    });

    await prisma.refreshToken.create({
      data: {
        id: jti,
        user_id: userId,
        token,
        expires_at: expiresAt,
      },
    });

    return token;
  }
}

export const authService = new AuthService();
