import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/authMiddleware';
import {
  placeMember,
  getUnplacedDirectReferrals,
  getNetworkTree,
  getNetworkSummary,
} from '../services/binaryPlacementService';
import {
  getVolumeSummary,
  getVolumeHistory,
} from '../services/binaryVolumeService';

const router = Router();

/**
 * POST /api/network/place
 * Authenticated endpoint for a sponsor to place an unplaced direct referral
 * into their LEFT or RIGHT network.
 */
router.post('/place', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const { memberPublicId, preferredSide } = req.body || {};

    if (!memberPublicId || typeof memberPublicId !== 'string') {
      res.status(400).json({
        error: 'INVALID_MEMBER_ID',
        message: 'A valid memberPublicId is required.',
      });
      return;
    }

    if (!preferredSide || (preferredSide !== 'LEFT' && preferredSide !== 'RIGHT')) {
      res.status(400).json({
        error: 'INVALID_SIDE',
        message: "preferredSide must be either 'LEFT' or 'RIGHT'.",
      });
      return;
    }

    const result = await placeMember(user.id, memberPublicId, preferredSide);
    res.status(200).json(result);
  } catch (err: any) {
    console.error('[Network API] Error in /api/network/place:', err);
    const statusCode = err.statusCode || (err.code === 'ALREADY_PLACED' ? 409 : err.code === 'NOT_DIRECT_SPONSOR' ? 403 : 400);
    res.status(statusCode).json({
      error: err.code || 'PLACEMENT_FAILED',
      message: err.message || 'Failed to place member in network.',
    });
  }
});

/**
 * GET /api/network/unplaced
 * Returns privacy-safe list of the authenticated sponsor's unplaced direct referrals.
 */
router.get('/unplaced', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const unplaced = await getUnplacedDirectReferrals(user.id);
    res.status(200).json({
      count: unplaced.length,
      unplaced,
    });
  } catch (err: any) {
    console.error('[Network API] Error in /api/network/unplaced:', err);
    res.status(500).json({
      error: 'SERVER_ERROR',
      message: 'Failed to fetch unplaced direct referrals.',
    });
  }
});

/**
 * GET /api/network/tree
 * Returns privacy-safe binary tree down to the specified depth (default 3, max 5).
 */
router.get('/tree', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const rawDepth = parseInt(req.query.depth as string, 10);
    const depth = isNaN(rawDepth) ? 3 : rawDepth;

    const tree = await getNetworkTree(user.id, depth);
    res.status(200).json({ tree });
  } catch (err: any) {
    console.error('[Network API] Error in /api/network/tree:', err);
    res.status(500).json({
      error: 'SERVER_ERROR',
      message: 'Failed to fetch network tree hierarchy.',
    });
  }
});

/**
 * GET /api/network/summary
 * Returns real database counts for direct referrals, placed members, unplaced direct referrals,
 * and left/right network sizes.
 */
router.get('/summary', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const summary = await getNetworkSummary(user.id);
    res.status(200).json(summary);
  } catch (err: any) {
    console.error('[Network API] Error in /api/network/summary:', err);
    res.status(500).json({
      error: 'SERVER_ERROR',
      message: 'Failed to fetch network summary.',
    });
  }
});

/**
 * GET /api/network/volume-summary
 * Returns authoritative current-user volume summary:
 * - businessDate (Asia/Dhaka)
 * - today (left, right)
 * - carry (left, right)
 * - availableForFutureMatching (left, right)
 */
router.get('/volume-summary', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const summary = await getVolumeSummary(user.id);
    res.status(200).json(summary);
  } catch (err: any) {
    console.error('[Network API] Error in /api/network/volume-summary:', err);
    res.status(500).json({
      error: 'SERVER_ERROR',
      message: 'Failed to fetch binary volume summary.',
    });
  }
});

/**
 * GET /api/network/volume-history
 * Returns paginated daily volume history for authenticated user.
 */
router.get('/volume-history', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const rawPage = parseInt(req.query.page as string, 10);
    const rawLimit = parseInt(req.query.limit as string, 10);
    const page = isNaN(rawPage) ? 1 : rawPage;
    const limit = isNaN(rawLimit) ? 20 : rawLimit;

    const history = await getVolumeHistory(user.id, page, limit);
    res.status(200).json(history);
  } catch (err: any) {
    console.error('[Network API] Error in /api/network/volume-history:', err);
    res.status(500).json({
      error: 'SERVER_ERROR',
      message: 'Failed to fetch binary volume history.',
    });
  }
});

export default router;
