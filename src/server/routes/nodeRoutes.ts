import { Router, Request, Response } from 'express';
import { getDb } from '../db/db';
import { requireAuth, optionalAuth, AuthRequest } from '../middleware/authMiddleware';
import {
  GENESIS_NODE_CAP,
  NODE_BASE_PRICE_USD,
  DEFAULT_DAILY_PHIVO_EMISSION,
  LIFETIME_PHIVO_ALLOCATION_PER_NODE,
  DEFAULT_PHIVO_REFERENCE_PRICE_USD,
} from '../../config/nodeConfig';
import { cleanupExpiredReservations } from '../services/nodeOrderService';
import { getNodeRewardStatsForUser, getUserRewardsSummary } from '../services/nodeRewardService';
import {
  getNodeRewardRatePerEpoch,
  getInternalCoinPrice,
  getGenesisNodeCap,
  getNodeBasePriceUsd,
} from '../services/economicService';
import { getWalletSummary } from '../services/walletLedgerService';
import { parseAmountToScaledBigInt, formatScaledBigInt } from '../services/tradingPoolService';
import { calculateTokenRoiUsdExact } from '../services/unilevelYieldEventService';

const router = Router();

/**
 * GET /api/genesis-nodes/overview (also accessible at GET /api/nodes/overview)
 * Public + Optional Auth endpoint returning full PHIVONEX GENESIS CORE™ Node overview:
 * - Total supply cap (10,000), sold count, remaining count, node price ($1,000),
 *   current daily PHIVO emission rate (15 PHIVO/day), lifetime cap (10,000 PHIVO),
 *   and current PHIVO reference price ($0.10 USDT).
 * - Authenticated user's owned Genesis Nodes (`distributed_phivo`, `remaining_phivo`,
 *   `status`: `ACTIVE` or `MATURED`), unclaimed PHIVO rewards, and claimed PHIVO wallet balance.
 */
router.get('/overview', optionalAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const db = await getDb();
    await cleanupExpiredReservations(db);

    const [
      dynamicCap,
      dynamicPriceUsd,
      dynamicDailyRate,
      coinPriceConfig,
      statsRes,
    ] = await Promise.all([
      getGenesisNodeCap().catch(() => GENESIS_NODE_CAP),
      getNodeBasePriceUsd().catch(() => NODE_BASE_PRICE_USD),
      getNodeRewardRatePerEpoch().catch(() => DEFAULT_DAILY_PHIVO_EMISSION),
      getInternalCoinPrice().catch(() => ({
        priceUsdt: DEFAULT_PHIVO_REFERENCE_PRICE_USD,
        swapEnabled: true,
      })),
      db.query<{ status: string; count: string | number }>(`
        SELECT status, COUNT(*)::int AS count
        FROM nodes
        GROUP BY status
      `),
    ]);

    const totalSupplyCap = Math.max(GENESIS_NODE_CAP, Number(dynamicCap || GENESIS_NODE_CAP));
    const nodePriceUsd = Number(dynamicPriceUsd || NODE_BASE_PRICE_USD);
    const dailyPhivoEmissionRate =
      dynamicDailyRate !== null && Number(dynamicDailyRate) > 0
        ? Number(dynamicDailyRate)
        : DEFAULT_DAILY_PHIVO_EMISSION;
    const lifetimePhivoAllocation = LIFETIME_PHIVO_ALLOCATION_PER_NODE;
    const phivoReferencePriceUsd =
      coinPriceConfig && Number(coinPriceConfig.priceUsdt) > 0
        ? Number(coinPriceConfig.priceUsdt)
        : DEFAULT_PHIVO_REFERENCE_PRICE_USD;

    let availableCount = 0;
    let reservedCount = 0;
    let activeCount = 0;
    let maturedCount = 0;

    for (const row of statsRes.rows) {
      const cnt = parseInt(String(row.count), 10) || 0;
      switch (row.status) {
        case 'AVAILABLE':
          availableCount += cnt;
          break;
        case 'RESERVED':
          reservedCount += cnt;
          break;
        case 'ACTIVE':
        case 'EMITTING':
          activeCount += cnt;
          break;
        case 'MATURED':
        case 'RETIRED':
          maturedCount += cnt;
          break;
      }
    }

    const soldCount = activeCount + maturedCount;
    const allocatedCount = soldCount + reservedCount;
    const remainingCount = Math.max(availableCount, totalSupplyCap - allocatedCount);
    const dailyUsdEquivalentCalc = calculateTokenRoiUsdExact(
      dailyPhivoEmissionRate,
      phivoReferencePriceUsd
    );

    let userSummary: {
      ownedNodesCount: number;
      activeNodesCount: number;
      maturedNodesCount: number;
      totalDistributedPhivo: string;
      totalRemainingPhivo: string;
      unclaimedPhivoRewards: string;
      unclaimedUsdEquivalent: string;
      claimedPhivoWalletBalance: string;
      claimedPhivoUsdEquivalent: string;
      mainUsdtWalletBalance: string;
      nodes: Array<{
        publicNodeId: string;
        nodeNumber: number;
        status: 'ACTIVE' | 'MATURED' | string;
        purchasePriceUsd: string;
        dailyPhivoEmission: string;
        lifetimePhivoAllocation: string;
        distributedPhivo: string;
        remainingPhivo: string;
        progressPercent: number;
        activatedAt: string | null;
        maturityTimestamp: string | null;
      }>;
    } | null = null;

    if (req.user?.id) {
      const userId = req.user.id;
      const [userNodesRes, rewardSummary, walletSummary] = await Promise.all([
        db.query<{
          id: string;
          node_number: number;
          public_node_id: string;
          status: string;
          purchase_price_usd: string;
          daily_phivo_emission: string;
          lifetime_phivo_allocation: string;
          distributed_phivo: string;
          remaining_phivo: string;
          activated_at: Date | null;
          maturity_timestamp: Date | null;
        }>(
          `
          SELECT
            n.id,
            n.node_number,
            n.public_node_id,
            n.status,
            ROUND(COALESCE(n.purchase_price_usd, 1000.00000000), 8)::text AS purchase_price_usd,
            ROUND(COALESCE(n.daily_phivo_emission, $2::numeric(20,8)), 8)::text AS daily_phivo_emission,
            ROUND(COALESCE(n.lifetime_phivo_allocation, 10000.00000000), 8)::text AS lifetime_phivo_allocation,
            ROUND(
              GREATEST(
                COALESCE(n.distributed_phivo, 0.00000000),
                COALESCE((SELECT SUM(nr.amount) FROM node_rewards nr WHERE nr.node_id = n.id AND nr.status != 'REVERSED'), 0.00000000)
              ),
              8
            )::text AS distributed_phivo,
            ROUND(
              GREATEST(
                0.00000000,
                COALESCE(n.lifetime_phivo_allocation, 10000.00000000) -
                GREATEST(
                  COALESCE(n.distributed_phivo, 0.00000000),
                  COALESCE((SELECT SUM(nr.amount) FROM node_rewards nr WHERE nr.node_id = n.id AND nr.status != 'REVERSED'), 0.00000000)
                )
              ),
              8
            )::text AS remaining_phivo,
            n.activated_at,
            n.maturity_timestamp
          FROM nodes n
          WHERE n.owner_user_id = $1
          ORDER BY n.node_number ASC
          `,
          [userId, dailyPhivoEmissionRate]
        ),
        getUserRewardsSummary(userId),
        getWalletSummary(userId),
      ]);

      let totalDistScaled = 0n;
      let totalRemScaled = 0n;
      let userActiveCount = 0;
      let userMaturedCount = 0;

      const userNodes = userNodesRes.rows.map(
        (n: {
          id: string;
          node_number: number;
          public_node_id: string;
          status: string;
          purchase_price_usd: string;
          daily_phivo_emission: string;
          lifetime_phivo_allocation: string;
          distributed_phivo: string;
          remaining_phivo: string;
          activated_at: Date | null;
          maturity_timestamp: Date | null;
        }) => {
        const distScaled = parseAmountToScaledBigInt(n.distributed_phivo);
        const capScaled = parseAmountToScaledBigInt(n.lifetime_phivo_allocation);
        const remScaled = capScaled > distScaled ? capScaled - distScaled : 0n;

        totalDistScaled += distScaled;
        totalRemScaled += remScaled;

        const effectiveStatus =
          n.status === 'MATURED' || remScaled <= 0n ? 'MATURED' : 'ACTIVE';
        if (effectiveStatus === 'MATURED') {
          userMaturedCount++;
        } else {
          userActiveCount++;
        }

        const distNum = Number(formatScaledBigInt(distScaled));
        const capNum = Number(formatScaledBigInt(capScaled)) || 10000;
        const progressPercent = Math.min(100, Number(((distNum / capNum) * 100).toFixed(2)));

        return {
          publicNodeId: n.public_node_id,
          nodeNumber: Number(n.node_number),
          status: effectiveStatus,
          purchasePriceUsd: n.purchase_price_usd,
          dailyPhivoEmission: formatScaledBigInt(
            parseAmountToScaledBigInt(dailyPhivoEmissionRate)
          ),
          lifetimePhivoAllocation: formatScaledBigInt(capScaled),
          distributedPhivo: formatScaledBigInt(distScaled),
          remainingPhivo: formatScaledBigInt(remScaled),
          progressPercent,
          activatedAt: n.activated_at ? new Date(n.activated_at).toISOString() : null,
          maturityTimestamp: n.maturity_timestamp
            ? new Date(n.maturity_timestamp).toISOString()
            : null,
        };
      });

      const unclaimedPhivoScaled = parseAmountToScaledBigInt(
        rewardSummary.totalAccrued || 0
      );
      const claimedPhivoWalletScaled = parseAmountToScaledBigInt(
        walletSummary.phivoBalance || 0
      );
      const mainUsdtWalletScaled = parseAmountToScaledBigInt(
        walletSummary.availableBalance || 0
      );

      const unclaimedUsdCalc = calculateTokenRoiUsdExact(
        formatScaledBigInt(unclaimedPhivoScaled),
        phivoReferencePriceUsd
      );
      const claimedUsdCalc = calculateTokenRoiUsdExact(
        formatScaledBigInt(claimedPhivoWalletScaled),
        phivoReferencePriceUsd
      );

      userSummary = {
        ownedNodesCount: userNodes.length,
        activeNodesCount: userActiveCount,
        maturedNodesCount: userMaturedCount,
        totalDistributedPhivo: formatScaledBigInt(totalDistScaled),
        totalRemainingPhivo: formatScaledBigInt(totalRemScaled),
        unclaimedPhivoRewards: formatScaledBigInt(unclaimedPhivoScaled),
        unclaimedUsdEquivalent: unclaimedUsdCalc.roiUsdStr,
        claimedPhivoWalletBalance: formatScaledBigInt(claimedPhivoWalletScaled),
        claimedPhivoUsdEquivalent: claimedUsdCalc.roiUsdStr,
        mainUsdtWalletBalance: formatScaledBigInt(mainUsdtWalletScaled),
        nodes: userNodes,
      };
    }

    res.status(200).json({
      success: true,
      data: {
        productCode: 'PHIVONEX_GENESIS_CORE',
        productName: 'PHIVONEX GENESIS CORE™',
        totalSupplyCap,
        soldCount,
        reservedCount,
        activeCount,
        maturedCount,
        remainingCount,
        nodePriceUsd: formatScaledBigInt(parseAmountToScaledBigInt(nodePriceUsd)),
        dailyPhivoEmissionRate: formatScaledBigInt(
          parseAmountToScaledBigInt(dailyPhivoEmissionRate)
        ),
        dailyUsdEquivalentPerNode: dailyUsdEquivalentCalc.roiUsdStr,
        lifetimePhivoAllocation: formatScaledBigInt(
          parseAmountToScaledBigInt(lifetimePhivoAllocation)
        ),
        phivoReferencePriceUsd: formatScaledBigInt(
          parseAmountToScaledBigInt(phivoReferencePriceUsd)
        ),
        swapEnabled: Boolean(coinPriceConfig.swapEnabled),
        scheduleSummary:
          'Daily UTC Epoch Settlement (15 PHIVO/day default, 10,000 PHIVO lifetime allocation cap per node)',
        userSummary,
      },
    });
  } catch (err) {
    console.error('[Node API] Error in GET /overview:', err);
    res.status(500).json({
      error: 'SERVER_ERROR',
      message: 'Failed to retrieve PHIVONEX GENESIS CORE™ overview.',
    });
  }
});

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
        case 'EMITTING':
          active += cnt;
          break;
        case 'RETIRED':
        case 'MATURED':
          retired += cnt;
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

    let nodeRows = nodesRes.rows;

    if (nodeRows.length === 0) {
      try {
        const { adminFirestore } = await import('../../lib/firebase-admin');
        const snap = await adminFirestore.collection('nodes')
          .where('ownerUserId', '==', user.id)
          .get();

        if (!snap.empty) {
          for (const docSnap of snap.docs) {
            const data = docSnap.data();
            const restoredNodeId = data.id || docSnap.id;
            const restoredNumber = data.nodeNumber || 101;

            await db.query(`
              UPDATE nodes
              SET status = 'ACTIVE', owner_user_id = $1, activated_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
              WHERE id = $2 OR node_number = $3
            `, [user.id, restoredNodeId, restoredNumber]);
          }

          const reQuery = await db.query<any>(`
            SELECT id, node_number, public_node_id, status, product_version, purchase_price_usd,
                   phivo_reference_price_at_purchase, lifetime_phivo_allocation, term_days,
                   daily_phivo_emission, purchase_timestamp, activated_at, maturity_timestamp,
                   distributed_phivo, remaining_phivo
            FROM nodes
            WHERE owner_user_id = $1
            ORDER BY node_number ASC
          `, [user.id]);
          nodeRows = reQuery.rows;
        }
      } catch (fsErr) {
        console.warn('[Node API] Firestore node recovery notice:', fsErr);
      }
    }

    const rewardStats = await getNodeRewardStatsForUser(user.id);
    const activeProtocolDailyReward = await getNodeRewardRatePerEpoch();

    const safeNodes = nodeRows.map((n) => {
      const stat = rewardStats[n.id] || {
        totalRewards: 0,
        currentRewardState: 'READY' as const,
        latestRewardEpoch: null,
      };

      const lifetimeAllocation = Number(n.lifetime_phivo_allocation || 10000);
      const dailyEmission = activeProtocolDailyReward !== null
        ? activeProtocolDailyReward
        : (n.daily_phivo_emission !== null && n.daily_phivo_emission !== undefined ? Number(n.daily_phivo_emission) : 0);
      const distributedPhivo = Math.max(Number(n.distributed_phivo || 0), stat.totalRewards);
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
