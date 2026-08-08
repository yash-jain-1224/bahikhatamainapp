import { Request, Response } from 'express';
import { asyncHandler, getPrismaClient , AuthenticatedRequest, ROLE_PERMISSIONS } from '../shared';
import { authService } from '../services/auth.service';

export const sendOTP = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { phone } = req.body;
  const result = await authService.sendOTP(phone);

  const statusCode = result.success ? 200 : result.code === 'USER_NOT_FOUND' ? 404 : 429;
  res.status(statusCode).json(result);
});

export const verifyOTP = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { phone, otp } = req.body;
  const result = await authService.verifyOTP(phone, otp);

  const statusCode = result.success ? 200 : result.code === 'USER_NOT_FOUND' ? 404 : 401;
  res.status(statusCode).json(result);
});

export const loginWithEmail = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body;
  const result = await authService.loginWithEmail(email, password);

  const statusCode = result.success ? 200 : result.code === 'USER_NOT_FOUND' ? 404 : 401;
  res.status(statusCode).json(result);
});

export const register = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { name, email, password, phone } = req.body;
  const result = await authService.register({ name, email, password, phone });

  const statusCode = result.success ? 201 : 400;
  res.status(statusCode).json(result);
});

export const refreshToken = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { refreshToken } = req.body;
  const result = await authService.refreshAccessToken(refreshToken);

  const statusCode = result.success ? 200 : 401;
  res.status(statusCode).json(result);
});

export const logout = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const userId = (req as unknown as AuthenticatedRequest).user?.userId;
  const { refreshToken } = req.body;

  await authService.logout(userId, refreshToken);
  res.json({ success: true, message: 'Logged out successfully' });
});

export const me = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const userId = (req as unknown as AuthenticatedRequest).user?.userId;

  const prisma = getPrismaClient();

  const user = await prisma.user.findUnique({
    where: { id: userId },
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

  if (!user) {
    res.status(404).json({ success: false, message: 'User not found' });
    return;
  }

  // Fetch trial info for this user's businesses
  const businessIds = user.business_users.map((bu: any) => bu.business_id);
  let trial: { expired: boolean; endsAt: string | null; daysRemaining: number | null; planName: string | null; maxBusinesses: number; hasSubscription: boolean; isTrial: boolean } = {
    expired: false, endsAt: null, daysRemaining: null, planName: null, maxBusinesses: 1, hasSubscription: false, isTrial: true,
  };
  if (businessIds.length > 0) {
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
      trial = {
        expired: false,
        hasSubscription: true,
        isTrial: activeSub.status === 'TRIAL',
        endsAt: activeSub.trial_ends_at?.toISOString() || activeSub.current_period_end.toISOString(),
        daysRemaining,
        planName: (activeSub as any).plan?.name || null,
        maxBusinesses: (activeSub as any).plan?.max_businesses ?? 1,
      };
    } else {
      const expiredSub = await prisma.subscription.findFirst({
        where: { business_id: { in: businessIds } },
        include: { plan: true },
        orderBy: { current_period_end: 'desc' },
      });
      if (expiredSub) {
        trial = {
          expired: true,
          hasSubscription: true,
          isTrial: expiredSub.status === 'TRIAL',
          endsAt: expiredSub?.trial_ends_at?.toISOString() || expiredSub?.current_period_end?.toISOString() || null,
          daysRemaining: 0,
          planName: (expiredSub as any)?.plan?.name || null,
          maxBusinesses: (expiredSub as any)?.plan?.max_businesses ?? 1,
        };
      }
      // else: business exists but no subscription yet (user hasn't picked a plan) — keep default (not expired, null info)
    }
  }

  res.json({
    success: true,
    data: {
      id: user.id,
      phone: user.phone,
      name: user.name,
      email: user.email,
      avatar_url: user.avatar_url,
      is_active: user.is_active,
      is_super_admin: user.is_super_admin,
      profile: user.profile,
      businesses: user.business_users.map((bu: any) => ({
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
          ...(bu.permissions?.map((p: any) => p.permission) || []),
        ],
      })),
      trial,
    },
  });
});
