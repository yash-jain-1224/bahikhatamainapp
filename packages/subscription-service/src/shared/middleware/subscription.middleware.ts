import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';
import { getPrismaClient } from '../utils/prisma';

const prisma = getPrismaClient();

/**
 * Middleware to check if business has an active subscription.
 * Allows trial period and active subscriptions.
 */
export function requireActiveSubscription(req: Request, res: Response, next: NextFunction): void {
  const authReq = req as unknown as AuthenticatedRequest;
  const businessId = authReq.businessId;

  if (!businessId) {
    res.status(400).json({
      success: false,
      message: 'Business ID required',
    });
    return;
  }

  // Super admin bypass
  if (authReq.user?.isSuperAdmin) {
    next();
    return;
  }

  prisma.subscription.findFirst({
    where: {
      business_id: businessId,
      status: {
        in: ['TRIAL', 'ACTIVE'],
      },
      current_period_end: {
        gte: new Date(),
      },
    },
  }).then((subscription: any) => {
    if (!subscription) {
      res.status(402).json({
        success: false,
        message: 'Active subscription required. Please upgrade your plan.',
      });
      return;
    }
    next();
  }).catch(() => {
    res.status(500).json({
      success: false,
      message: 'Subscription check failed',
    });
  });
}
