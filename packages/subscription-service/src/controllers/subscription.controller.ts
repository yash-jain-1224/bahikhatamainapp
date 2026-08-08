import { Request, Response } from 'express';
import { asyncHandler, AuthenticatedRequest } from '../shared';
import { subscriptionService } from '../services/subscription.service';

export const getPlans = asyncHandler(async (_req: Request, res: Response): Promise<void> => {
  const plans = await subscriptionService.getPlans();
  res.json({ success: true, data: plans });
});

export const getCurrentSubscription = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const userId = (req as unknown as AuthenticatedRequest).user?.userId;
  const subscription = await subscriptionService.getCurrentSubscription(userId);
  res.json({ success: true, data: subscription });
});

export const createSubscription = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const userId = (req as unknown as AuthenticatedRequest).user?.userId;
  const { planId, billingCycle } = req.body;
  const result = await subscriptionService.createSubscription(userId, planId, billingCycle);
  res.status(201).json({ success: true, message: 'Subscription created', data: result });
});

export const razorpayWebhook = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const signature = req.headers['x-razorpay-signature'] as string;
  // express.raw is mounted for this route, so req.body is the raw Buffer the
  // HMAC must be computed over.
  const rawBody: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body ?? {}));
  const result = await subscriptionService.handleRazorpayWebhook(rawBody, signature);
  res.json({ success: true, data: result });
});

export const getInvoices = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const userId = (req as unknown as AuthenticatedRequest).user?.userId;
  const invoices = await subscriptionService.getInvoices(userId);
  res.json({ success: true, data: invoices });
});

export const cancelSubscription = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const userId = (req as unknown as AuthenticatedRequest).user?.userId;
  await subscriptionService.cancelSubscription(userId);
  res.json({ success: true, message: 'Subscription cancelled' });
});
