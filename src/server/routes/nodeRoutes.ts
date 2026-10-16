import { Router, Request, Response } from 'express';
import { getDb } from '../db/db';
import { requireAuth, AuthRequest } from '../middleware/authMiddleware';
import { GENESIS_NODE_CAP, NODE_BASE_PRICE_USD } from '../../config/nodeConfig';
import { cleanupExpiredReservations } from '../services/nodeOrderService';
import { getNodeRewardStatsForUser } from '../services/nodeRewardService';
import { getNodeRewardRatePerEpoch } from '../services/economicService';

const router = Router();

/**
 * GET /api/nodes/stats
 * Public endpoint returning real-time Genesis Node supply and allocation statistics derived directly from the database.
 */
router.get('/stats', async (_req: Request, res: Response): Promise<void> => {
  try {
    const db = await getDb();

    // Automatically sweep expired reservations so inventory is live and accurate
    await cleanupExpiredReservations(db);

    // Query aggregated counts by status
    const statsRes = await db.query<{ status: string; count: string | number }>(`
      SELECT 
        status, 
        COUNT(*)::int AS count 
      FROM nodes 
      GROUP BY status
    `);

    let available = 0;
    let reserved = 0;
    let active = 0;
    let retired = 0;

    for (const row of statsRes.rows) {
      const cnt = parseInt(String(row.count), 10) || 0;
      switch (row.status) {
        case 'AVAILABLE':
          available = cnt;
          break;
        case 'RESERVED':
          reserved = cnt;
          break;
        case 'ACTIVE':
          active = cnt;
          break;
        case 'RETIRED':
          retired = cnt;
          break;
      }
    }

    const allocated = reserved + active + retired;

    res.status(200).json({
      genesisCap: GENESIS_NODE_CAP,
      basePriceUsd: NODE_BASE_PRICE_USD,
      available,
      reserved,
      active,
      retired,
      allocated,
    });
  } catch (err) {
    console.error('[Node API] Error in GET /stats:', err);
    res.status(500).json({
      error: 'SERVER_ERROR',
      message: 'Failed to retrieve Genesis Node statistics.',
    });
  }
});

/**
 * GET /api/nodes/me
 * Authenticated endpoint returning all Genesis Nodes owned by the current operator.
 * Safe public data only (no internal UUIDs).
 */
router.get('/me', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const db = await getDb();

    const nodesRes = await db.query<{
      id: string;
      node_number: number;
      public_node_id: string;
      status: string;
      product_version: string;
      purchase_price_usd: string | number;
      phivo_reference_price_at_purchase: string | number;
      lifetime_phivo_allocation: string | number;
      term_days: number;
      daily_phivo_emission: string | number;
      purchase_timestamp: Date | null;
      activated_at: Date | null;
      maturity_timestamp: Date | null;
      distributed_phivo: string | number;
      remaining_phivo: string | number;
    }>(
      `
      SELECT 
        id,
        node_number,
        public_node_id,
        status,
        product_version,
        purchase_price_usd,
        phivo_reference_price_at_purchase,
        lifetime_phivo_allocation,
        term_days,
        daily_phivo_emission,
        purchase_timestamp,
        activated_at,
        maturity_timestamp,
        distributed_phivo,
        remaining_phivo
      FROM nodes
      WHERE owner_user_id = $1
      ORDER BY node_number ASC
      `,
      [user.id]
    );

    const rewardStats = await getNodeRewardStatsForUser(user.id);
    const activeProtocolDailyReward = await getNodeRewardRatePerEpoch();

    const safeNodes = nodesRes.rows.map((n) => {
      const stat = rewardStats[n.id] || {
        totalRewards: 0,
        currentRewardState: 'READY' as const,
        latestRewardEpoch: null,
      };

      const lifetimeAllocation = Number(n.lifetime_phivo_allocation || 10000);
      const dailyEmission = activeProtocolDailyReward !== null
        ? activeProtocolDailyReward
        : (n.daily_phivo_emission !== null && n.daily_phivo_emission !== undefined ? Number(n.daily_phivo_emission) : 0);
      const distributedPhivo = Number(n.distributed_phivo || stat.totalRewards || 0);
      const remainingPhivo = Math.max(0, lifetimeAllocation - distributedPhivo);
      const progressPercent = Math.min(100, Number(((distributedPhivo / lifetimeAllocation) * 100).toFixed(2)));
      const completedDays = Math.min(200, dailyEmission > 0 ? Math.floor(distributedPhivo / dailyEmission) : 0);
      const currentDay = n.status === 'MATURED' ? 200 : Math.min(200, completedDays + 1);

      return {
        publicNodeId: n.public_node_id,
        nodeNumber: n.node_number,
        status: n.status,
        productVersion: n.product_version || 'GENESIS_V1',
        purchasePriceUsd: Number(n.purchase_price_usd || 1000),
        phivoReferencePriceAtPurchase: Number(n.phivo_reference_price_at_purchase || 0.10),
        lifetimePhivoAllocation: lifetimeAllocation,
        termDays: n.term_days || 200,
        dailyPhivoEmission: dailyEmission,
        protocolDailyEmission: activeProtocolDailyReward,
        purchaseTimestamp: n.purchase_timestamp ? n.purchase_timestamp.toISOString() : (n.activated_at ? n.activated_at.toISOString() : null),
        activatedAt: n.activated_at ? n.activated_at.toISOString() : null,
        maturityTimestamp: n.maturity_timestamp ? n.maturity_timestamp.toISOString() : (n.activated_at ? new Date(new Date(n.activated_at).getTime() + 200 * 24 * 60 * 60 * 1000).toISOString() : null),
        distributedPhivo,
        remainingPhivo,
        progressPercent,
        currentDay,
        totalRewards: stat.totalRewards,
        currentRewardState: stat.currentRewardState,
        latestRewardEpoch: stat.latestRewardEpoch,
      };
    });

    res.status(200).json({
      nodes: safeNodes,
    });
  } catch (err) {
    console.error('[Node API] Error in GET /me:', err);
    res.status(500).json({
      error: 'SERVER_ERROR',
      message: 'Failed to retrieve operator nodes.',
    });
  }
});

export default router;
