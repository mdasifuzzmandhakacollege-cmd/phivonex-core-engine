import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/authMiddleware';
import {
  getUserMatchingSummary,
  getUserMatchingHistory,
  runDailyMatchingSettlementCycle,
} from '../services/binaryMatchingService';

const router = Router();

/**
 * GET /api/matching/summary
 * Authenticated endpoint returning user's matching summary:
 * - todayVolume (left, right)
 * - carry (left, right)
 * - latestSettlement (with decomposition components)
 * - totalMatchingEarnedUsd (Total Matching Bonus Earned)
 * - nextSettlement schedule
 */
router.get('/summary', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const summary = await getUserMatchingSummary(user.id);
    res.status(200).json(summary);
  } catch (err: any) {
    console.error('[Matching API] Error in /api/matching/summary:', err);
    res.status(500).json({
      error: 'MATCHING_SUMMARY_FAILED',
      message: 'Failed to retrieve matching summary.',
    });
  }
});

/**
 * GET /api/matching/history
 * Authenticated endpoint returning user's paginated matching settlement history
 * with audit details and individual matching components.
 */
router.get('/history', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 10;

    const history = await getUserMatchingHistory(user.id, page, limit);
    res.status(200).json(history);
  } catch (err: any) {
    console.error('[Matching API] Error in /api/matching/history:', err);
    res.status(500).json({
      error: 'MATCHING_HISTORY_FAILED',
      message: 'Failed to retrieve matching history.',
    });
  }
});

/**
 * POST /api/matching/settle-cycle
 * Operational/testing endpoint to trigger a settlement cycle for a specified business date
 * (or previous date by default).
 */
router.post('/settle-cycle', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { businessDate } = req.body || {};
    const result = await runDailyMatchingSettlementCycle(businessDate);
    res.status(200).json(result);
  } catch (err: any) {
    console.error('[Matching API] Error in /api/matching/settle-cycle:', err);
    res.status(500).json({
      error: 'SETTLEMENT_CYCLE_FAILED',
      message: err?.message || 'Failed to execute settlement cycle.',
    });
  }
});

export default router;
