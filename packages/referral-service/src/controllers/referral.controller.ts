import { Request, Response } from 'express';
import { asyncHandler, AuthenticatedRequest } from '../shared';
import { referralService } from '../services/referral.service';

export const createReferralCode = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const userId = (req as unknown as AuthenticatedRequest).user?.userId;
  const referral = await referralService.getOrCreateReferralCode(userId);
  res.status(201).json({ success: true, data: referral });
});

export const applyReferralCode = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const userId = (req as unknown as AuthenticatedRequest).user?.userId;
  const { code } = req.body;
  const referral = await referralService.applyReferralCode(userId, code);
  res.json({ success: true, message: 'Referral applied', data: referral });
});

export const getUserReferrals = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const userId = (req as unknown as AuthenticatedRequest).user?.userId;
  const data = await referralService.getUserReferrals(userId);
  res.json({ success: true, data });
});

export const getReferralEligibility = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const userId = (req as unknown as AuthenticatedRequest).user?.userId;
  const data = await referralService.getReferralEligibility(userId);
  res.json({ success: true, data });
});

export const redeemRewards = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const userId = (req as unknown as AuthenticatedRequest).user?.userId;
  const result = await referralService.redeemRewards(userId);
  res.json({ success: true, message: `Redeemed ${result.daysRedeemed} days! Subscription extended to ${result.newExpiryDate.toLocaleDateString('en-IN')}.`, data: result });
});

export const handleFirstPaidPurchase = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const userId = (req as unknown as AuthenticatedRequest).user?.userId;
  const result = await referralService.handleFirstPaidPurchase(userId);
  res.json({ success: true, message: 'First paid purchase processed', data: result });
});

export const creditReward = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { referralId } = req.params;
  const referral = await referralService.creditReward(referralId);
  res.json({ success: true, message: 'Reward credited', data: referral });
});

export const getLeaderboard = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const userId = (req as unknown as AuthenticatedRequest).user?.userId;
  const leaderboard = await referralService.getReferralLeaderboard(userId);
  res.json({ success: true, data: leaderboard });
});
