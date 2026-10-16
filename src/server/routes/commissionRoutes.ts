import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/authMiddleware';
import { getUserCommissions } from '../services/referralCommissionService';

const router = Router();

/**
 * GET /api/referral-commissions/me
 * Authenticated endpoint returning user's earned direct referral commissions.
 * Total earned is derived authoritatively from database records.
 */
router.get('/me', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const data = await getUserCommissions(user.id);
    res.status(200).json(data);
  } catch (err) {
    console.error('[Commission API] Error in /referral-commissions/me:', err);
    res.status(500).json({
      error: 'SERVER_ERROR',
      message: 'Failed to fetch referral commission history',
    });
  }
});

export default router;
