import { Router } from 'express';
import { authenticateToken, checkMaintenanceMode, requireSuperAdmin, requireInternalService } from '../shared';
import * as ctrl from '../controllers/referral.controller';

const router = Router();

router.use(authenticateToken);
// Platform Settings "Maintenance Mode". Mounted after authenticateToken so super
// admins are exempt and can keep working (including to switch it back off).
router.use(checkMaintenanceMode);

// Referral code management
router.post('/code', ctrl.createReferralCode);
router.post('/apply', ctrl.applyReferralCode);

// Dashboard & eligibility
router.get('/my-referrals', ctrl.getUserReferrals);
router.get('/eligibility', ctrl.getReferralEligibility);
router.get('/leaderboard', ctrl.getLeaderboard);

// Redemption
router.post('/redeem', ctrl.redeemRewards);

// Internal: called after first paid purchase (by the subscription service or a
// payment webhook). NOT user-callable — it grants paid status and credits
// referral rewards, so a plain user token previously let anyone self-upgrade.
router.post('/first-paid-purchase', requireInternalService, ctrl.handleFirstPaidPurchase);

// Admin only
router.post('/:referralId/credit', requireSuperAdmin, ctrl.creditReward);

export { router as referralRoutes };
