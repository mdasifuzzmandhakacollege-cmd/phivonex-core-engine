import { Router, Response } from 'express';
import { requireAuth, requireAdmin, AuthRequest } from '../middleware/authMiddleware';
import {
  getUserRewards,
  getUserRewardsSummary,
  claimUserRewards,
  createRewardEpoch,
  closeAndSettleEpoch,
  getRewardAutomationConfig,
  setRewardAutomationConfig,
  executeManualDailyRewardDistribution,
} from '../services/nodeRewardService';

export const rewardRouter = Router();

/**
 * GET /api/rewards/me
 * Authenticated user endpoint returning:
 * - totalAccrued
 * - totalClaimed
 * - latestEpoch
 * - history (reward history)
 */
rewardRouter.get('/me', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const rewardsData = await getUserRewards(user.id);

    res.status(200).json({
      totalAccrued: rewardsData.totalAccrued,
      totalClaimed: rewardsData.totalClaimed,
      totalRewards: rewardsData.totalRewards,
      dailyEmissionRate: rewardsData.dailyEmissionRate,
      protocolDailyEmission: rewardsData.protocolDailyEmission,
      latestEpoch: rewardsData.latestEpoch,
      history: rewardsData.history,
    });
  } catch (err: any) {
    console.error('[Reward API] Error in GET /api/rewards/me:', err);
    res.status(500).json({
      error: 'SERVER_ERROR',
      message: 'Failed to retrieve reward telemetry.',
    });
  }
});

/**
 * GET /api/rewards/summary
 * Authenticated user endpoint returning real authenticated-user reward totals.
 */
rewardRouter.get('/summary', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const summary = await getUserRewardsSummary(user.id);

    res.status(200).json(summary);
  } catch (err: any) {
    console.error('[Reward API] Error in GET /api/rewards/summary:', err);
    res.status(500).json({
      error: 'SERVER_ERROR',
      message: 'Failed to retrieve reward summary.',
    });
  }
});

/**
 * GET /api/rewards/history
 * Authenticated user endpoint returning reward history records with sorting and epoch details.
 */
rewardRouter.get('/history', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const rewardsData = await getUserRewards(user.id);

    res.status(200).json({
      success: true,
      history: rewardsData.history,
      total: rewardsData.history.length,
      latestEpoch: rewardsData.latestEpoch,
    });
  } catch (err: any) {
    console.error('[Reward API] Error in GET /api/rewards/history:', err);
    res.status(500).json({
      error: 'SERVER_ERROR',
      message: 'Failed to retrieve reward history.',
    });
  }
});

/**
 * POST /api/rewards/claim
 * Safe claim foundation: Transitions ACCRUED → CLAIMED.
 *
 * Security:
 * - Claim must not create money twice.
 * - All writes are strictly server-authoritative.
 */
rewardRouter.post('/claim', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const result = await claimUserRewards(user.id);

    res.status(200).json({
      success: true,
      message: result.claimedCount > 0
        ? `Successfully claimed ${result.claimedCount} accrued reward(s).`
        : 'No accrued rewards pending claim.',
      claimedCount: result.claimedCount,
      totalClaimedAmount: result.totalClaimedAmount,
    });
  } catch (err: any) {
    console.error('[Reward API] Error in POST /api/rewards/claim:', err);
    res.status(500).json({
      error: 'SERVER_ERROR',
      message: 'Failed to process reward claim.',
    });
  }
});

/**
 * POST /api/rewards/epochs (Administrative Endpoint)
 * Creates an authoritative reward epoch in OPEN state.
 * Protected by requireAdmin middleware. Normal users CANNOT execute.
 */
rewardRouter.post('/epochs', requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const epoch = await createRewardEpoch();
    res.status(201).json(epoch);
  } catch (err: any) {
    console.error('[Reward API] Error in POST /api/rewards/epochs:', err);
    res.status(500).json({
      error: 'SERVER_ERROR',
      message: 'Failed to create reward epoch.',
    });
  }
});

/**
 * POST /api/rewards/epochs/:id/settle (Administrative Endpoint)
 * Closes and settles the specified epoch, distributing rewards to all ACTIVE nodes.
 * Protected by requireAdmin middleware. Normal users CANNOT execute.
 */
rewardRouter.post('/epochs/:id/settle', requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const result = await closeAndSettleEpoch(id);
    if (!result.success && result.error === 'REWARD_RATE_NOT_CONFIGURED') {
      res.status(422).json(result);
      return;
    }
    res.status(200).json(result);
  } catch (err: any) {
    console.error('[Reward API] Error in POST /api/rewards/epochs/:id/settle:', err);
    res.status(500).json({
      error: 'SERVER_ERROR',
      message: err.message || 'Failed to settle reward epoch.',
    });
  }
});

/**
 * GET /api/rewards/distribution-control (Administrative Endpoint)
 * Returns the active reward distribution automation configuration.
 */
rewardRouter.get('/distribution-control', requireAdmin, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const config = await getRewardAutomationConfig();
    res.status(200).json({
      success: true,
      config,
    });
  } catch (err: any) {
    console.error('[Reward API] Error in GET /api/rewards/distribution-control:', err);
    res.status(500).json({
      error: 'SERVER_ERROR',
      message: 'Failed to retrieve reward distribution automation configuration.',
    });
  }
});

/**
 * POST /api/rewards/distribution-control (Administrative Endpoint)
 * Toggles between AUTOMATIC and MANUAL daily reward distribution mode.
 */
rewardRouter.post('/distribution-control', requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { mode, scheduledTimeUtc } = req.body;
    if (mode !== 'AUTOMATIC' && mode !== 'MANUAL') {
      res.status(400).json({
        error: 'INVALID_MODE',
        message: 'Distribution mode must be either AUTOMATIC or MANUAL.',
      });
      return;
    }

    const adminUser = req.user!;
    const adminPublicId = adminUser.public_id || adminUser.email || 'ADMIN';

    const updated = await setRewardAutomationConfig(
      mode,
      scheduledTimeUtc || '00:00',
      adminUser.id,
      adminPublicId
    );

    res.status(200).json({
      success: true,
      message: `Daily reward distribution mode updated to ${mode}.`,
      config: updated,
    });
  } catch (err: any) {
    console.error('[Reward API] Error in POST /api/rewards/distribution-control:', err);
    res.status(500).json({
      error: 'SERVER_ERROR',
      message: 'Failed to update reward distribution mode.',
    });
  }
});

/**
 * POST /api/rewards/manual-distribute (Administrative Endpoint)
 * Manually executes the daily mining reward / ROI distribution immediately.
 */
rewardRouter.post('/manual-distribute', requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const adminUser = req.user!;
    const adminPublicId = adminUser.public_id || adminUser.email || 'ADMIN';

    const result = await executeManualDailyRewardDistribution(adminUser.id, adminPublicId);

    if (!result.success) {
      res.status(422).json(result);
      return;
    }

    res.status(200).json(result);
  } catch (err: any) {
    console.error('[Reward API] Error in POST /api/rewards/manual-distribute:', err);
    res.status(500).json({
      error: 'SERVER_ERROR',
      message: err.message || 'Failed to execute manual reward distribution.',
    });
  }
});
