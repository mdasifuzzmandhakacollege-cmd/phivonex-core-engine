import { getDb } from '../db/db';
import { v4 as uuidv4 } from 'uuid';
import { generateEpochPublicId, generateRewardPublicId } from '../utils/idGenerator';
import { getConfiguredRewardPerNode, REWARD_CURRENCY } from '../config/rewardConfig';
import { postLedgerCredit, postLedgerReversal } from './walletLedgerService';
import { isNodeRewardsEnabled, getNodeRewardRatePerEpoch, getEconomicConfigByKey, getInternalCoinPrice } from './economicService';
import { notifyPhivoReward } from './notificationService';
import { getUtcBusinessDate } from '../utils/timezone';
import { broadcastSystemConfigChange } from './systemConfigBroadcaster';
import { enqueueUnilevelYieldEvent, calculateTokenRoiUsdExact } from './unilevelYieldEventService';
import { parseAmountToScaledBigInt, formatScaledBigInt } from './tradingPoolService';
import { processPendingUnilevelYieldEvents } from './roiGenerationService';
import { isFeatureSwitchEnabled } from './unilevelConfigService';

// Process-level mutex serializing automatic and manual reward epoch distributions
let rewardSettlementLock: Promise<void> = Promise.resolve();
async function withRewardSettlementLock<T>(fn: () => Promise<T>): Promise<T> {
  const prevLock = rewardSettlementLock;
  let releaseLock!: () => void;
  const nextLock = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });
  rewardSettlementLock = prevLock.then(() => nextLock);
  try {
    await prevLock;
    return await fn();
  } finally {
    releaseLock();
  }
}

export interface RewardEpoch {
  id: string;
  publicEpochId: string;
  epochNumber: number;
  startAt: string;
  endAt: string;
  rewardPerNode: number | null;
  rewardRateUsed?: number | null;
  economicConfigVersion?: number | null;
  currency: string;
  status: 'OPEN' | 'COMPLETED';
  settledAt: string | null;
  createdAt: string;
}

export interface NodeRewardRecord {
  id: string;
  publicRewardId: string;
  epochId: string;
  epochNumber?: number;
  publicEpochId?: string;
  nodeId: string;
  publicNodeId?: string;
  nodeNumber?: number;
  ownerUserId: string;
  amount: number;
  currency: string;
  status: 'ACCRUED' | 'CLAIMED' | 'REVERSED';
  accruedAt: string;
  claimedAt: string | null;
  reversedAt?: string | null;
  rewardRateUsed?: number | null;
  economicConfigVersion?: number | null;
  businessDate?: string | null;
  createdAt: string;
}

export interface EpochSettlementResult {
  success: boolean;
  error?: string;
  message?: string;
  epochId: string;
  publicEpochId: string;
  epochNumber: number;
  rewardPerNode: number;
  eligibleNodesCount: number;
  rewardsCreated: number;
  totalRewardsDistributedUsd: number;
  settledAt?: string;
}

/**
 * Creates a new authoritative reward epoch in OPEN state.
 * Reward per node is server-authoritative and configurable.
 * If not configured, reward_per_node is stored as NULL until configured.
 */
export async function createRewardEpoch(params?: {
  rewardPerNode?: number;
  startAt?: Date;
  endAt?: Date;
  businessDateStr?: string;
}): Promise<RewardEpoch> {
  const db = await getDb();
  let rewardRate: number | null = null;
  let configVersion: number | null = null;

  if (params?.rewardPerNode !== undefined) {
    rewardRate = params.rewardPerNode <= 0 ? null : getConfiguredRewardPerNode(params.rewardPerNode);
  } else {
    const activeCfg = await getEconomicConfigByKey('NODE_REWARD_RATE_PER_EPOCH');
    if (activeCfg && activeCfg.status === 'ACTIVE' && activeCfg.configValue !== null && activeCfg.configValue !== undefined) {
      configVersion = activeCfg.version;
      if (typeof activeCfg.configValue === 'object' && activeCfg.configValue !== null) {
        const val = activeCfg.configValue;
        rewardRate = Number(
          val.ratePhivo !== undefined ? val.ratePhivo :
          (val.rateUsd !== undefined ? val.rateUsd :
          (val.rewardPerNode !== undefined ? val.rewardPerNode : NaN))
        );
      } else {
        rewardRate = Number(activeCfg.configValue);
      }
    } else if (activeCfg) {
      rewardRate = null;
    } else {
      rewardRate = getConfiguredRewardPerNode();
    }
  }

  // Compute next sequential epoch number
  const maxRes = await db.query<{ next_num: string | number }>(
    `SELECT COALESCE(MAX(epoch_number), 0) + 1 AS next_num FROM reward_epochs`
  );
  const epochNumber = Number(maxRes.rows[0]?.next_num || 1);
  const publicEpochId = generateEpochPublicId(epochNumber);

  const id = uuidv4();
  const baseDate = params?.startAt || new Date();
  const utcDateStr = params?.businessDateStr || getUtcBusinessDate(baseDate);
  const [year, month, day] = utcDateStr.split('-').map(Number);
  const startAt = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  const endAt = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));

  const res = await db.query<any>(
    `
    INSERT INTO reward_epochs (
      id, public_epoch_id, epoch_number, start_at, end_at, reward_per_node, reward_rate_used, economic_config_version, currency, status, created_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'OPEN', CURRENT_TIMESTAMP)
    RETURNING *
    `,
    [id, publicEpochId, epochNumber, startAt, endAt, rewardRate, rewardRate, configVersion, REWARD_CURRENCY]
  );

  const row = res.rows[0];
  return {
    id: row.id,
    publicEpochId: row.public_epoch_id,
    epochNumber: Number(row.epoch_number),
    startAt: new Date(row.start_at).toISOString(),
    endAt: new Date(row.end_at).toISOString(),
    rewardPerNode: row.reward_per_node !== null && row.reward_per_node !== undefined ? Number(row.reward_per_node) : null,
    rewardRateUsed: row.reward_rate_used !== null && row.reward_rate_used !== undefined ? Number(row.reward_rate_used) : null,
    economicConfigVersion: row.economic_config_version ? Number(row.economic_config_version) : null,
    currency: row.currency,
    status: row.status,
    settledAt: row.settled_at ? new Date(row.settled_at).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

/**
 * Retrieves the current open epoch, or creates one if none exists.
 */
export async function getOrCreateCurrentOpenEpoch(rewardPerNodeOverride?: number): Promise<RewardEpoch> {
  const db = await getDb();
  const openRes = await db.query<any>(
    `SELECT * FROM reward_epochs WHERE status = 'OPEN' ORDER BY epoch_number DESC LIMIT 1`
  );

  if (openRes.rows.length > 0) {
    const row = openRes.rows[0];
    return {
      id: row.id,
      publicEpochId: row.public_epoch_id,
      epochNumber: Number(row.epoch_number),
      startAt: new Date(row.start_at).toISOString(),
      endAt: new Date(row.end_at).toISOString(),
      rewardPerNode: row.reward_per_node !== null && row.reward_per_node !== undefined ? Number(row.reward_per_node) : null,
      currency: row.currency,
      status: row.status,
      settledAt: row.settled_at ? new Date(row.settled_at).toISOString() : null,
      createdAt: new Date(row.created_at).toISOString(),
    };
  }

  return createRewardEpoch({ rewardPerNode: rewardPerNodeOverride });
}

/**
 * Authoritative Epoch Settlement Engine.
 *
 * Rules:
 * 1. Reward rate MUST come from explicit server/admin configuration.
 *    If reward rate is not configured:
 *    - epoch settlement must NOT create rewards
 *    - return a controlled: REWARD_RATE_NOT_CONFIGURED
 *    - never assume $2.50 or any other amount.
 * 2. Only Node status: ACTIVE can earn rewards.
 *    AVAILABLE, RESERVED, RETIRED earn ZERO.
 * 3. ONE Node + ONE Epoch generates only ONE reward (guarded by UNIQUE(node_id, epoch_id)).
 * 4. Each reward atomically posts a CREDIT entry to the user's Task #13 financial ledger.
 * 5. Duplicate scheduler executions are completely idempotent and never double-credit.
 */
export async function closeAndSettleEpoch(
  epochId: string,
  options?: {
    configuredRewardPerNode?: number;
    targetNodeId?: string;
    dedupeByBusinessDate?: boolean;
    excludeLumpSumRange?: boolean;
    settleTimestamp?: Date;
    suppressEmails?: boolean;
  }
): Promise<EpochSettlementResult> {
  const db = await getDb();

  // 1. Fetch target epoch
  const epochRes = await db.query<any>(
    `SELECT * FROM reward_epochs WHERE id = $1`,
    [epochId]
  );

  if (epochRes.rows.length === 0) {
    throw new Error(`Reward epoch ${epochId} not found`);
  }

  const epoch = epochRes.rows[0];
  const publicEpochId = epoch.public_epoch_id;
  const epochNumber = Number(epoch.epoch_number);

  // If already completed, return idempotent summary
  if (epoch.status === 'COMPLETED') {
    const existingRewards = await db.query<{ count: string | number; total: string | number }>(
      `SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total FROM node_rewards WHERE epoch_id = $1`,
      [epochId]
    );

    return {
      success: true,
      epochId,
      publicEpochId,
      epochNumber,
      rewardPerNode: epoch.reward_per_node ? Number(epoch.reward_per_node) : 0,
      eligibleNodesCount: Number(existingRewards.rows[0]?.count || 0),
      rewardsCreated: 0,
      totalRewardsDistributedUsd: Number(existingRewards.rows[0]?.total || 0),
      settledAt: epoch.settled_at ? new Date(epoch.settled_at).toISOString() : new Date().toISOString(),
    };
  }

  // 2. Check master governance & economic switch: Genesis Node Daily PHIVO Emission
  const [rewardsEnabled, emissionSwitchEnabled] = await Promise.all([
    isNodeRewardsEnabled(),
    isFeatureSwitchEnabled('genesis_node_emission_enabled', db),
  ]);
  if (!rewardsEnabled || !emissionSwitchEnabled) {
    return {
      success: false,
      error: 'MODULE_PAUSED',
      message: 'Module Temporarily Paused by Protocol Governance — Genesis Core™ daily PHIVO emissions are currently paused by administration.',
      epochId,
      publicEpochId,
      epochNumber,
      rewardPerNode: 0,
      eligibleNodesCount: 0,
      rewardsCreated: 0,
      totalRewardsDistributedUsd: 0,
    };
  }

  // 3. Determine authoritative reward rate per node and snapshot configuration
  let effectiveRate: number | null = null;
  let configVersion: number | null = epoch.economic_config_version ? Number(epoch.economic_config_version) : null;

  if (options?.configuredRewardPerNode !== undefined) {
    effectiveRate = options.configuredRewardPerNode <= 0 ? null : getConfiguredRewardPerNode(options.configuredRewardPerNode);
  } else if (epoch.reward_rate_used !== null && !isNaN(Number(epoch.reward_rate_used)) && Number(epoch.reward_rate_used) > 0) {
    effectiveRate = Number(epoch.reward_rate_used);
  } else if (epoch.reward_per_node !== null && !isNaN(Number(epoch.reward_per_node)) && Number(epoch.reward_per_node) > 0) {
    effectiveRate = Number(epoch.reward_per_node);
  } else {
    const activeCfg = await getEconomicConfigByKey('NODE_REWARD_RATE_PER_EPOCH');
    if (activeCfg && activeCfg.status === 'ACTIVE' && activeCfg.configValue !== null && activeCfg.configValue !== undefined) {
      configVersion = activeCfg.version;
      if (typeof activeCfg.configValue === 'object' && activeCfg.configValue !== null) {
        const val = activeCfg.configValue;
        effectiveRate = Number(
          val.ratePhivo !== undefined ? val.ratePhivo :
          (val.rateUsd !== undefined ? val.rateUsd :
          (val.rewardPerNode !== undefined ? val.rewardPerNode : NaN))
        );
      } else {
        effectiveRate = Number(activeCfg.configValue);
      }
    } else if (activeCfg) {
      effectiveRate = null;
    } else {
      effectiveRate = getConfiguredRewardPerNode();
    }
  }

  // If reward rate is NOT configured:
  // Must NOT create rewards, must return REWARD_RATE_NOT_CONFIGURED.
  if (effectiveRate === null || effectiveRate <= 0) {
    return {
      success: false,
      error: 'REWARD_RATE_NOT_CONFIGURED',
      message: 'Node reward rate has not been configured by PHIVONEX management. Epoch settlement cannot proceed without an authoritative reward rate.',
      epochId,
      publicEpochId,
      epochNumber,
      rewardPerNode: 0,
      eligibleNodesCount: 0,
      rewardsCreated: 0,
      totalRewardsDistributedUsd: 0,
    };
  }

  const settleTime = options?.settleTimestamp || new Date();
  const epochBaseDate = epoch.start_at ? new Date(epoch.start_at) : settleTime;
  const businessDate = getUtcBusinessDate(epochBaseDate);
  const epochEndAt = epoch.end_at
    ? new Date(epoch.end_at)
    : new Date(`${businessDate}T23:59:59.999Z`);
  const dedupeByBusinessDate = options?.dedupeByBusinessDate === true;
  const excludeLumpSumRange = options?.excludeLumpSumRange === true;

  // Snapshot active config version and rate onto the epoch record immediately before node loop
  await db.query(
    `UPDATE reward_epochs 
     SET status = 'COMPLETED', reward_per_node = $1, reward_rate_used = $1, economic_config_version = $2, settled_at = $3 
     WHERE id = $4`,
    [effectiveRate, configVersion, settleTime, epochId]
  );

  // 4. Query all ACTIVE or EMITTING nodes activated on or before this epoch with valid owners that haven't reached lifetime cap
  const activeNodesRes = await db.query<{
    id: string;
    public_node_id: string;
    node_number: number;
    owner_user_id: string;
    daily_phivo_emission: string | number;
    lifetime_phivo_allocation: string | number;
    distributed_phivo: string | number;
    remaining_phivo: string | number;
  }>(
    `
    SELECT id, public_node_id, node_number, owner_user_id, daily_phivo_emission, lifetime_phivo_allocation, distributed_phivo, remaining_phivo
    FROM nodes
    WHERE (status = 'ACTIVE' OR status = 'EMITTING') 
      AND owner_user_id IS NOT NULL 
      AND (activated_at IS NULL OR activated_at <= $2)
      AND COALESCE(distributed_phivo, 0) < COALESCE(lifetime_phivo_allocation, 10000.00)
      AND ($3::boolean = false OR nodes.last_reward_date IS NULL OR nodes.last_reward_date < ($4::text)::date)
      AND ($1::text IS NULL OR id::text = $1 OR public_node_id = $1)
      AND (
        $3::boolean = false
        OR NOT EXISTS (
          SELECT 1 FROM node_rewards nr
          WHERE nr.node_id = nodes.id
            AND nr.business_date = $4::text
            AND nr.status != 'REVERSED'
        )
      )
      AND (
        $5::boolean = false
        OR NOT EXISTS (
          SELECT 1 FROM node_rewards rwd
          WHERE rwd.node_id = nodes.id
            AND rwd.public_reward_id LIKE 'RWD-%'
            AND rwd.status != 'REVERSED'
        )
      )
    ORDER BY node_number ASC
    `,
    [options?.targetNodeId || null, epochEndAt, dedupeByBusinessDate, businessDate, excludeLumpSumRange]
  );

  // Resolve active PHIVO reference price in USDT (default $0.10 USDT)
  const coinPriceConfig = await getInternalCoinPrice();
  const currentPhivoUsdPrice =
    coinPriceConfig && Number(coinPriceConfig.priceUsdt) > 0
      ? Number(coinPriceConfig.priceUsdt)
      : 0.10;

  const eligibleNodes = activeNodesRes.rows;
  let rewardsCreated = 0;
  let totalDistributed = 0;
  let totalUsdEquivalentScaled = 0n;

  for (const node of eligibleNodes) {
    const configuredDailyReward = effectiveRate;

    const txResult = await db.transaction(async (trx) => {
      // Lock the node row for atomic emission calculation and lifetime cap enforcement
      const lockedNodeRes = await trx.query<{
        id: string;
        public_node_id: string;
        node_number: number;
        owner_user_id: string;
        status: string;
        lifetime_phivo_allocation: string | number;
        distributed_phivo: string | number;
        remaining_phivo: string | number;
      }>(
        `
        SELECT
          id,
          public_node_id,
          node_number,
          owner_user_id,
          status,
          COALESCE(lifetime_phivo_allocation, 10000.00000000) AS lifetime_phivo_allocation,
          COALESCE(distributed_phivo, 0.00000000) AS distributed_phivo,
          COALESCE(remaining_phivo, 10000.00000000) AS remaining_phivo
        FROM nodes
        WHERE id = $1
        FOR UPDATE
        `,
        [node.id]
      );

      if (lockedNodeRes.rowCount === 0) {
        return { outcome: 'SKIPPED' as const };
      }

      const lockedNode = lockedNodeRes.rows[0];
      if (lockedNode.status !== 'ACTIVE' && lockedNode.status !== 'EMITTING') {
        return { outcome: 'SKIPPED' as const };
      }

      const lifetimeCapScaled = parseAmountToScaledBigInt(
        lockedNode.lifetime_phivo_allocation || 10000
      );

      // Authoritative distributed total from node_rewards + nodes.distributed_phivo
      const sumRes = await trx.query<{ total: string }>(
        `SELECT ROUND(COALESCE(SUM(amount), 0), 8)::text AS total FROM node_rewards WHERE node_id = $1 AND status != 'REVERSED'`,
        [lockedNode.id]
      );

      const distColScaled = parseAmountToScaledBigInt(lockedNode.distributed_phivo || 0);
      const sumRewardsScaled = parseAmountToScaledBigInt(sumRes.rows[0]?.total || 0);
      const currentDistScaled =
        distColScaled >= sumRewardsScaled ? distColScaled : sumRewardsScaled;
      const remainingScaled =
        lifetimeCapScaled > currentDistScaled ? lifetimeCapScaled - currentDistScaled : 0n;

      const configuredDailyScaled = parseAmountToScaledBigInt(configuredDailyReward);
      const actualEmissionScaled =
        configuredDailyScaled <= remainingScaled ? configuredDailyScaled : remainingScaled;

      if (actualEmissionScaled <= 0n) {
        // Node has already distributed full 10,000 PHIVO allocation: transition to MATURED
        await trx.query(
          `
          UPDATE nodes
          SET
            status = 'MATURED',
            distributed_phivo = $1::numeric(20,8),
            remaining_phivo = 0.00000000,
            maturity_timestamp = COALESCE(maturity_timestamp, CURRENT_TIMESTAMP),
            updated_at = CURRENT_TIMESTAMP
          WHERE id = $2
          `,
          [formatScaledBigInt(currentDistScaled), lockedNode.id]
        );
        return { outcome: 'ALREADY_MATURED' as const };
      }

      const actualEmissionStr = formatScaledBigInt(actualEmissionScaled);
      const rewardId = uuidv4();
      const publicRewardId = generateRewardPublicId();

      // Idempotent insertion protected by UNIQUE(node_id, epoch_id)
      const insRes = await trx.query<any>(
        `
        INSERT INTO node_rewards (
          id, public_reward_id, epoch_id, node_id, owner_user_id, amount, currency, status, accrued_at,
          reward_rate_used, economic_config_version, business_date, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6::numeric(20,8), $7, 'ACCRUED', $8, $9, $10, $11, CURRENT_TIMESTAMP)
        ON CONFLICT (node_id, epoch_id) DO NOTHING
        RETURNING *
        `,
        [
          rewardId,
          publicRewardId,
          epochId,
          lockedNode.id,
          lockedNode.owner_user_id,
          actualEmissionStr,
          epoch.currency || REWARD_CURRENCY,
          settleTime,
          configuredDailyReward,
          configVersion,
          businessDate,
        ]
      );

      if (insRes.rows.length > 0) {
        const createdRewardId = insRes.rows[0].id as string;
        const createdPublicRewardId = insRes.rows[0].public_reward_id as string;
        const createdAmountNum = Number(insRes.rows[0].amount);

        const newDistScaled = currentDistScaled + actualEmissionScaled;
        const newRemScaled =
          lifetimeCapScaled > newDistScaled ? lifetimeCapScaled - newDistScaled : 0n;
        const newStatus =
          newRemScaled <= 0n || newDistScaled >= lifetimeCapScaled ? 'MATURED' : 'ACTIVE';

        await trx.query(
          `
          UPDATE nodes
          SET
            distributed_phivo = $1::numeric(20,8),
            remaining_phivo = $2::numeric(20,8),
            accrued_phivo = COALESCE(accrued_phivo, 0) + $5::numeric(20,8),
            last_reward_date = CASE
              WHEN last_reward_date IS NULL OR last_reward_date < $6::date THEN $6::date
              ELSE last_reward_date
            END,
            status = $3::varchar,
            maturity_timestamp = CASE
              WHEN $3::varchar = 'MATURED' THEN COALESCE(maturity_timestamp, CURRENT_TIMESTAMP)
              ELSE maturity_timestamp
            END,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = $4
          `,
          [
            formatScaledBigInt(newDistScaled),
            formatScaledBigInt(newRemScaled),
            newStatus,
            lockedNode.id,
            actualEmissionStr,
            businessDate,
          ]
        );

        // Convert emitted PHIVO into USD equivalent and enqueue Unified Unilevel Yield Event (Task 06 -> Task 07 outbox)
        const roiCalc = calculateTokenRoiUsdExact(actualEmissionStr, currentPhivoUsdPrice);
        await enqueueUnilevelYieldEvent(trx, {
          sourceProductType: 'GENESIS_NODE',
          sourceYieldId: createdRewardId,
          sourceUserId: lockedNode.owner_user_id,
          epochDate: businessDate,
          sourceRoiUsd: roiCalc.roiUsdStr,
          rawTokenAmount: roiCalc.rawTokenAmountStr,
          tokenReferencePriceUsd: roiCalc.tokenReferencePriceUsdStr,
        });

        return {
          outcome: 'CREATED' as const,
          actualRewardId: createdRewardId,
          actualPublicRewardId: createdPublicRewardId,
          actualAmount: createdAmountNum,
          usdEquivalentScaled: roiCalc.roiUsdScaled,
        };
      } else {
        const existing = await trx.query<any>(
          `SELECT id, public_reward_id, ROUND(amount, 8)::text AS amount FROM node_rewards WHERE node_id = $1 AND epoch_id = $2`,
          [lockedNode.id, epochId]
        );
        if (existing.rows.length === 0) {
          return { outcome: 'SKIPPED' as const };
        }
        const exId = existing.rows[0].id as string;
        const exPubId = existing.rows[0].public_reward_id as string;
        const exAmountStr = existing.rows[0].amount as string;

        const roiCalc = calculateTokenRoiUsdExact(exAmountStr, currentPhivoUsdPrice);
        await enqueueUnilevelYieldEvent(trx, {
          sourceProductType: 'GENESIS_NODE',
          sourceYieldId: exId,
          sourceUserId: lockedNode.owner_user_id,
          epochDate: businessDate,
          sourceRoiUsd: roiCalc.roiUsdStr,
          rawTokenAmount: roiCalc.rawTokenAmountStr,
          tokenReferencePriceUsd: roiCalc.tokenReferencePriceUsdStr,
        });

        return {
          outcome: 'EXISTING' as const,
          actualRewardId: exId,
          actualPublicRewardId: exPubId,
          actualAmount: Number(exAmountStr),
          usdEquivalentScaled: 0n,
        };
      }
    });

    if (
      txResult.outcome === 'SKIPPED' ||
      txResult.outcome === 'ALREADY_MATURED'
    ) {
      continue;
    }

    const actualRewardId = txResult.actualRewardId;
    const actualPublicRewardId = txResult.actualPublicRewardId;
    const actualAmount = txResult.actualAmount;

    if (txResult.outcome === 'CREATED') {
      rewardsCreated++;
      totalDistributed += actualAmount;
      totalUsdEquivalentScaled += txResult.usdEquivalentScaled;
    }

    // 5. Post credit to financial ledger for node reward
    await postLedgerCredit({
      userId: node.owner_user_id,
      sourceType: 'NODE_REWARD',
      sourceId: actualRewardId,
      sourceRef: actualPublicRewardId,
      amount: actualAmount,
      currency: 'PHIVO',
      description: `Genesis Node Mining Reward (Epoch #${epochNumber}, Node ${node.public_node_id})`,
      createdAt: settleTime,
    }).catch((ledgerErr) => {
      console.warn('[NodeReward] Error posting ledger credit:', ledgerErr);
    });

    // Task #20: Trigger in-app notification for node mining reward (idempotent via sourceId)
    try {
      await notifyPhivoReward({
        userId: node.owner_user_id,
        amountPhivo: actualAmount,
        rewardId: actualRewardId,
      });
    } catch (notifErr) {
      console.warn('[Notification] Error triggering node reward notification:', notifErr);
    }

    // Task #23.4: Send REWARD email and trigger potential automation rules (non-blocking)
    if (!options?.suppressEmails) {
      db.query<{ email: string; full_name: string; public_id: string }>(
        `SELECT email, full_name, public_id FROM users WHERE id = $1`,
        [node.owner_user_id]
      ).then(async (userRes) => {
        if (userRes.rows.length > 0) {
          const user = userRes.rows[0];
          const { queueEventEmail, triggerAutomationRule } = await import('./emailService');
          await queueEventEmail(user.email, 'REWARD', {
            displayName: user.full_name,
            publicId: user.public_id,
            amount: String(actualAmount),
            epochId,
            publicEpochId
          }).catch(() => {});
          await triggerAutomationRule(node.owner_user_id, 'MATCHING_ACTIVITY', {
            amount: String(actualAmount)
          }).catch(() => {});
        }
      }).catch(() => {});
    }
  }

  // Record / update ecosystem_yield_settlement_cycles for GENESIS_NODE on businessDate
  try {
    const cycleAggRes = await db.query<{
      positions_count: string | number;
      total_yield_usd: string;
    }>(
      `
      SELECT
        COUNT(*)::int AS positions_count,
        ROUND(COALESCE(SUM(source_roi_usd), 0), 8)::text AS total_yield_usd
      FROM unilevel_yield_events
      WHERE source_product_type = 'GENESIS_NODE'
        AND epoch_date = $1::date
      `,
      [businessDate]
    );
    const positionsCount = Number(cycleAggRes.rows[0]?.positions_count || rewardsCreated);
    const totalYieldUsd =
      cycleAggRes.rows[0]?.total_yield_usd || formatScaledBigInt(totalUsdEquivalentScaled);

    await db.query(
      `
      INSERT INTO ecosystem_yield_settlement_cycles (
        epoch_date, engine_type, status, positions_processed,
        total_yield_distributed, total_royalty_distributed, started_at, completed_at, created_at
      )
      VALUES ($1::date, 'GENESIS_NODE', 'COMPLETED', $2, $3::numeric(20,8), 0.00000000, NOW(), NOW(), NOW())
      ON CONFLICT (epoch_date, engine_type) DO UPDATE SET
        status = 'COMPLETED',
        positions_processed = EXCLUDED.positions_processed,
        total_yield_distributed = EXCLUDED.total_yield_distributed,
        completed_at = NOW(),
        error_message = NULL
      `,
      [businessDate, positionsCount, totalYieldUsd]
    );
  } catch (cycleErr) {
    console.warn('[NodeReward] Notice recording ecosystem_yield_settlement_cycles:', cycleErr);
  }

  // Trigger 16-Generation Unilevel ROI-on-ROI payout processing for newly enqueued GENESIS_NODE yield events
  try {
    await processPendingUnilevelYieldEvents(200);
  } catch (unilevelErr) {
    console.warn('[NodeReward] Notice processing pending Unilevel yield events:', unilevelErr);
  }

  return {
    success: true,
    epochId,
    publicEpochId,
    epochNumber,
    rewardPerNode: effectiveRate,
    eligibleNodesCount: eligibleNodes.length,
    rewardsCreated,
    totalRewardsDistributedUsd: totalDistributed,
    settledAt: settleTime.toISOString(),
  };
}

/**
 * Reverses a node reward (e.g. audit or administrative rollback).
 * Never deletes historical records; offsets original earning via a REVERSAL ledger entry.
 */
export async function reverseNodeReward(publicRewardId: string, reason?: string): Promise<{
  success: boolean;
  rewardId: string;
  amount: number;
}> {
  const db = await getDb();

  const res = await db.query<any>(
    `SELECT * FROM node_rewards WHERE public_reward_id = $1`,
    [publicRewardId]
  );

  if (res.rows.length === 0) {
    throw new Error(`Node reward ${publicRewardId} not found`);
  }

  const reward = res.rows[0];
  if (reward.status === 'REVERSED') {
    return {
      success: true,
      rewardId: reward.id,
      amount: Number(reward.amount),
    };
  }

  const now = new Date();
  await db.query(
    `UPDATE node_rewards SET status = 'REVERSED', reversed_at = $1 WHERE id = $2`,
    [now, reward.id]
  );

  await postLedgerReversal({
    userId: reward.owner_user_id,
    sourceType: 'NODE_REWARD',
    sourceId: reward.id,
    sourceRef: reward.public_reward_id,
    amount: Number(reward.amount),
    description: `Reversal of Node Reward ${reward.public_reward_id}: ${reason || 'Administrative correction'}`,
    createdAt: now,
  }).catch((ledgerErr) => {
    console.warn('[NodeReward] Error posting ledger reversal:', ledgerErr);
  });

  return {
    success: true,
    rewardId: reward.id,
    amount: Number(reward.amount),
  };
}

/**
 * Claim Foundation: Transitions ACCRUED rewards to CLAIMED.
 *
 * IMPORTANT:
 * - Claim must NOT create money twice.
 * - All earnings are already authoritatively tracked in the financial ledger.
 * - This safely updates the reward state without duplicating credits.
 */
export async function claimUserRewards(userId: string): Promise<{
  claimedCount: number;
  totalClaimedAmount: number;
}> {
  const db = await getDb();

  return db.transaction(async (trx) => {
    const now = new Date();
    const updRes = await trx.query<{ id: string; node_id: string; amount: string | number }>(
      `
      UPDATE node_rewards
      SET status = 'CLAIMED', claimed_at = $1
      WHERE owner_user_id = $2 AND status = 'ACCRUED'
      RETURNING id, node_id, amount
      `,
      [now, userId]
    );

    let totalAmount = 0;
    const claimedByNode = new Map<string, number>();
    for (const row of updRes.rows) {
      const amt = Number(row.amount || 0);
      totalAmount += amt;
      if (row.node_id) {
        claimedByNode.set(row.node_id, (claimedByNode.get(row.node_id) || 0) + amt);
      }
    }

    for (const [nodeId, claimedAmt] of claimedByNode.entries()) {
      await trx.query(
        `
        UPDATE nodes
        SET
          accrued_phivo = GREATEST(0.00000000, COALESCE(accrued_phivo, 0.00000000) - $1::numeric(20,8)),
          claimed_phivo = COALESCE(claimed_phivo, 0.00000000) + $1::numeric(20,8),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        `,
        [claimedAmt.toFixed(8), nodeId]
      );
    }

    return {
      claimedCount: updRes.rows.length,
      totalClaimedAmount: Number(totalAmount.toFixed(8)),
    };
  });
}

/**
 * Returns authenticated user's complete reward telemetry:
 * - totalAccrued
 * - totalClaimed
 * - latestEpoch
 * - reward history
 */
export async function getUserRewards(userId: string): Promise<{
  totalAccrued: number;
  totalClaimed: number;
  totalRewards: number;
  dailyEmissionRate: number | null;
  protocolDailyEmission: number | null;
  latestEpoch: {
    id: string;
    publicEpochId: string;
    epochNumber: number;
    rewardPerNode: number | null;
    status: string;
    settledAt: string | null;
  } | null;
  history: NodeRewardRecord[];
}> {
  const db = await getDb();
  const activeRate = await getNodeRewardRatePerEpoch();

  // Query user reward records joined with epoch and node information
  const res = await db.query<any>(
    `
    SELECT 
      nr.id,
      nr.public_reward_id,
      nr.epoch_id,
      nr.node_id,
      nr.owner_user_id,
      nr.amount,
      nr.currency,
      nr.status,
      nr.accrued_at,
      nr.claimed_at,
      nr.reversed_at,
      nr.reward_rate_used,
      nr.economic_config_version,
      nr.business_date,
      nr.created_at,
      re.public_epoch_id,
      re.epoch_number,
      n.public_node_id,
      n.node_number
    FROM node_rewards nr
    JOIN reward_epochs re ON nr.epoch_id = re.id
    JOIN nodes n ON nr.node_id = n.id
    WHERE nr.owner_user_id = $1
    ORDER BY nr.accrued_at DESC
    `,
    [userId]
  );

  let totalAccrued = 0;
  let totalClaimed = 0;
  let totalRewards = 0;

  const history: NodeRewardRecord[] = res.rows.map((r: any) => {
    const amt = Number(r.amount);
    if (r.status === 'ACCRUED') {
      totalAccrued += amt;
      totalRewards += amt;
    } else if (r.status === 'CLAIMED') {
      totalClaimed += amt;
      totalRewards += amt;
    }

    return {
      id: r.id,
      publicRewardId: r.public_reward_id,
      epochId: r.epoch_id,
      epochNumber: Number(r.epoch_number),
      publicEpochId: r.public_epoch_id,
      nodeId: r.node_id,
      publicNodeId: r.public_node_id,
      nodeNumber: Number(r.node_number),
      ownerUserId: r.owner_user_id,
      amount: amt,
      currency: r.currency,
      status: r.status,
      accruedAt: new Date(r.accrued_at).toISOString(),
      claimedAt: r.claimed_at ? new Date(r.claimed_at).toISOString() : null,
      reversedAt: r.reversed_at ? new Date(r.reversed_at).toISOString() : null,
      rewardRateUsed: r.reward_rate_used !== null && r.reward_rate_used !== undefined ? Number(r.reward_rate_used) : null,
      economicConfigVersion: r.economic_config_version !== null && r.economic_config_version !== undefined ? Number(r.economic_config_version) : null,
      businessDate: r.business_date || null,
      createdAt: new Date(r.created_at).toISOString(),
    };
  });

  // Latest settled or open epoch in the protocol
  const latestEpochRes = await db.query<any>(
    `SELECT * FROM reward_epochs ORDER BY epoch_number DESC LIMIT 1`
  );

  let latestEpoch = null;
  if (latestEpochRes.rows.length > 0) {
    const row = latestEpochRes.rows[0];
    latestEpoch = {
      id: row.id,
      publicEpochId: row.public_epoch_id,
      epochNumber: Number(row.epoch_number),
      rewardPerNode: row.reward_per_node !== null && row.reward_per_node !== undefined ? Number(row.reward_per_node) : null,
      status: row.status,
      settledAt: row.settled_at ? new Date(row.settled_at).toISOString() : null,
    };
  }

  return {
    totalAccrued,
    totalClaimed,
    totalRewards,
    dailyEmissionRate: activeRate,
    protocolDailyEmission: activeRate,
    latestEpoch,
    history,
  };
}

/**
 * Returns authenticated user's real reward summary metrics.
 */
export async function getUserRewardsSummary(userId: string): Promise<{
  totalRewardsEarned: number;
  totalAccrued: number;
  totalClaimed: number;
  activeNodesCount: number;
  protocolDailyEmission: number | null;
  latestEpochNumber: number;
  latestSettlementTime: string | null;
}> {
  const db = await getDb();
  const activeRate = await getNodeRewardRatePerEpoch();

  // Active nodes count for this user
  const activeNodesRes = await db.query<{ count: string | number }>(
    `SELECT COUNT(*) as count FROM nodes WHERE owner_user_id = $1 AND status IN ('ACTIVE', 'EMITTING', 'MATURED')`,
    [userId]
  );
  const activeNodesCount = Number(activeNodesRes.rows[0]?.count || 0);

  // Aggregated rewards
  const aggRes = await db.query<{
    status: string;
    total: string | number;
  }>(
    `
    SELECT status, COALESCE(SUM(amount), 0) as total
    FROM node_rewards
    WHERE owner_user_id = $1
    GROUP BY status
    `,
    [userId]
  );

  let totalAccrued = 0;
  let totalClaimed = 0;

  for (const row of aggRes.rows) {
    const amt = Number(row.total);
    if (row.status === 'ACCRUED') totalAccrued += amt;
    else if (row.status === 'CLAIMED') totalClaimed += amt;
  }

  const totalRewardsEarned = totalAccrued + totalClaimed;

  // Latest epoch in protocol
  const epochRes = await db.query<any>(
    `SELECT epoch_number, settled_at FROM reward_epochs ORDER BY epoch_number DESC LIMIT 1`
  );

  const latestEpochNumber = epochRes.rows.length > 0 ? Number(epochRes.rows[0].epoch_number) : 0;
  const latestSettlementTime = epochRes.rows.length > 0 && epochRes.rows[0].settled_at
    ? new Date(epochRes.rows[0].settled_at).toISOString()
    : null;

  return {
    totalRewardsEarned,
    totalAccrued,
    totalClaimed,
    activeNodesCount,
    protocolDailyEmission: activeRate,
    latestEpochNumber,
    latestSettlementTime,
  };
}

/**
 * Returns mapping of reward statistics per active node for a specific user.
 * Used to enrich the My Nodes UI.
 */
export async function getNodeRewardStatsForUser(userId: string): Promise<Record<string, {
  totalRewards: number;
  currentRewardState: 'ACCRUED' | 'CLAIMED' | 'READY';
  latestRewardEpoch: string | null;
}>> {
  const db = await getDb();

  const res = await db.query<any>(
    `
    SELECT 
      nr.node_id,
      re.public_epoch_id,
      nr.amount,
      nr.status,
      nr.accrued_at
    FROM node_rewards nr
    JOIN reward_epochs re ON nr.epoch_id = re.id
    WHERE nr.owner_user_id = $1 AND nr.status != 'REVERSED'
    ORDER BY nr.accrued_at DESC
    `,
    [userId]
  );

  const stats: Record<string, {
    totalRewards: number;
    currentRewardState: 'ACCRUED' | 'CLAIMED' | 'READY';
    latestRewardEpoch: string | null;
  }> = {};

  for (const row of res.rows) {
    const nodeId = row.node_id;
    const amt = Number(row.amount);
    const status = row.status as 'ACCRUED' | 'CLAIMED';
    const publicEpoch = row.public_epoch_id;

    if (!stats[nodeId]) {
      stats[nodeId] = {
        totalRewards: amt,
        currentRewardState: status,
        latestRewardEpoch: publicEpoch,
      };
    } else {
      stats[nodeId].totalRewards += amt;
      // If any reward is ACCRUED, current state reflects ACCRUED
      if (status === 'ACCRUED') {
        stats[nodeId].currentRewardState = 'ACCRUED';
      }
    }
  }

  return stats;
}

// ============================================================================
// DUAL-MODE DAILY REWARD / ROI DISTRIBUTION ENGINE (MANUAL & AUTOMATIC)
// ============================================================================

export interface RewardAutomationConfig {
  mode: 'AUTOMATIC' | 'MANUAL';
  scheduledTimeUtc: string; // e.g. "00:00"
  autoEnabled: boolean;
  lastSettledAt: string | null;
  lastEpochNumber: number | null;
  lastSettledBy: string | null;
  lastSettledMode: 'AUTOMATIC' | 'MANUAL' | null;
}

const DEFAULT_AUTOMATION_CONFIG: RewardAutomationConfig = {
  mode: 'AUTOMATIC',
  scheduledTimeUtc: '00:00',
  autoEnabled: true,
  lastSettledAt: null,
  lastEpochNumber: null,
  lastSettledBy: 'system',
  lastSettledMode: null,
};

/**
 * Retrieves the active daily reward distribution mode (AUTOMATIC or MANUAL).
 */
export async function getRewardAutomationConfig(): Promise<RewardAutomationConfig> {
  const db = await getDb();
  try {
    const res = await db.query<any>(
      `SELECT config_value FROM system_economic_configs WHERE config_key = 'DAILY_REWARD_AUTOMATION' AND status = 'ACTIVE' LIMIT 1`
    );
    if (res.rows.length > 0) {
      const val = typeof res.rows[0].config_value === 'string'
        ? JSON.parse(res.rows[0].config_value)
        : res.rows[0].config_value;
      return {
        ...DEFAULT_AUTOMATION_CONFIG,
        ...val,
      };
    }
  } catch (err) {
    console.error('[RewardAutomation] Error reading DAILY_REWARD_AUTOMATION config:', err);
  }
  return DEFAULT_AUTOMATION_CONFIG;
}

/**
 * Updates the reward distribution mode (AUTOMATIC or MANUAL).
 */
export async function setRewardAutomationConfig(
  mode: 'AUTOMATIC' | 'MANUAL',
  scheduledTimeUtc: string = '00:00',
  adminUserId: string,
  adminPublicId: string
): Promise<RewardAutomationConfig> {
  const db = await getDb();
  const current = await getRewardAutomationConfig();
  const updated: RewardAutomationConfig = {
    ...current,
    mode,
    scheduledTimeUtc,
    autoEnabled: mode === 'AUTOMATIC',
  };

  await db.query(
    `
    INSERT INTO system_economic_configs (
      id, config_key, config_value, category, description, status, version, effective_from, updated_by_admin_id, updated_by_admin_public_id, created_at, updated_at
    )
    VALUES ($1, 'DAILY_REWARD_AUTOMATION', $2, 'REWARDS', 'Dual-mode daily mining reward distribution automation setting (AUTOMATIC vs MANUAL)', 'ACTIVE', 1, CURRENT_TIMESTAMP, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT (config_key) DO UPDATE SET
      config_value = EXCLUDED.config_value,
      status = 'ACTIVE',
      updated_by_admin_id = EXCLUDED.updated_by_admin_id,
      updated_by_admin_public_id = EXCLUDED.updated_by_admin_public_id,
      updated_at = CURRENT_TIMESTAMP
    `,
    [uuidv4(), JSON.stringify(updated), adminUserId, adminPublicId]
  );

  broadcastSystemConfigChange('DAILY_REWARD_AUTOMATION', updated, 'REWARDS');
  console.log(`[RewardAutomation] Daily reward distribution mode set to ${mode} by ${adminPublicId}`);
  return updated;
}

/**
 * Manually triggers the daily mining reward / ROI distribution immediately.
 */
export async function executeManualDailyRewardDistribution(
  adminUserId: string,
  adminPublicId: string
): Promise<{
  success: boolean;
  message: string;
  result?: EpochSettlementResult;
  error?: string;
}> {
  return withRewardSettlementLock(async () => {
    const db = await getDb();
    console.log(`[RewardAutomation] 🚀 Manual daily reward distribution triggered by admin ${adminPublicId}`);

    const activeRate = await getNodeRewardRatePerEpoch();
    if (!activeRate || activeRate <= 0) {
      return {
        success: false,
        error: 'REWARD_RATE_NOT_CONFIGURED',
        message: 'Node reward rate is not configured. Please set DAILY PHIVO REWARD before distributing.',
      };
    }

    // Find valid open epoch or create fresh one
    let epochId: string;
    const openEpoch = await db.query<any>(
      `SELECT id, epoch_number FROM reward_epochs WHERE status = 'OPEN' ORDER BY created_at DESC LIMIT 1`
    );

    if (openEpoch.rows.length > 0) {
      epochId = openEpoch.rows[0].id;
    } else {
      const newEpoch = await createRewardEpoch();
      epochId = newEpoch.id;
    }

    // Settle the epoch (explicit manual trigger allows immediate distribution)
    const settlementResult = await closeAndSettleEpoch(epochId, { dedupeByBusinessDate: false });

    if (!settlementResult.success) {
      return {
        success: false,
        error: settlementResult.error,
        message: settlementResult.message || 'Settlement failed.',
        result: settlementResult,
      };
    }

    // Update last settlement tracking ONLY on success
    const currentConfig = await getRewardAutomationConfig();
    const updatedConfig: RewardAutomationConfig = {
      ...currentConfig,
      lastSettledAt: new Date().toISOString(),
      lastEpochNumber: settlementResult.epochNumber,
      lastSettledBy: adminPublicId,
      lastSettledMode: 'MANUAL',
    };

    await db.query(
      `
      INSERT INTO system_economic_configs (
        id, config_key, config_value, category, description, status, version, effective_from, updated_by_admin_id, updated_by_admin_public_id, created_at, updated_at
      )
      VALUES ($1, 'DAILY_REWARD_AUTOMATION', $2, 'REWARDS', 'Dual-mode daily mining reward distribution automation setting', 'ACTIVE', 1, CURRENT_TIMESTAMP, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (config_key) DO UPDATE SET
        config_value = EXCLUDED.config_value,
        status = 'ACTIVE',
        updated_by_admin_id = EXCLUDED.updated_by_admin_id,
        updated_by_admin_public_id = EXCLUDED.updated_by_admin_public_id,
        updated_at = CURRENT_TIMESTAMP
      `,
      [uuidv4(), JSON.stringify(updatedConfig), adminUserId, adminPublicId]
    );

    broadcastSystemConfigChange('DAILY_REWARD_AUTOMATION', updatedConfig, 'REWARDS');

    return {
      success: true,
      message: `Manual ROI distribution completed successfully. ${settlementResult.eligibleNodesCount} nodes credited ${settlementResult.totalRewardsDistributedUsd.toFixed(2)} PHIVO rewards (Epoch #${settlementResult.epochNumber}).`,
      result: settlementResult,
    };
  });
}

/**
 * Helper returning array of YYYY-MM-DD UTC date strings from startDateStr..endDateStr inclusive.
 */
function buildUtcDateRange(startDateStr: string, endDateStr: string): string[] {
  const dates: string[] = [];
  const start = new Date(`${startDateStr}T00:00:00.000Z`);
  const end = new Date(`${endDateStr}T00:00:00.000Z`);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) return dates;

  const cursor = new Date(start.getTime());
  let guard = 0;
  while (cursor <= end && guard < 120) {
    dates.push(cursor.toISOString().split('T')[0]);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    guard++;
  }
  return dates;
}

/**
 * Ensures consistency between financial_ledger_entries, node_rewards, reward_epochs, and nodes:
 * 1. Normalizes any stale 'EMITTING' node status to 'ACTIVE'.
 * 2. Backfills missing node_rewards.business_date from reward_epochs.start_at.
 * 3. Converts any orphan NODE_REWARD PHIVO ledger credits (e.g. legacy PHX-RWD-*) into ACCRUED node_rewards
 *    preserving source_id so they are visible & claimable in the Claim UI with 0 ledger orphans.
 * 4. Ensures every non-reversed node_rewards row has a matching financial_ledger_entries CREDIT.
 * 5. Keeps nodes.distributed_phivo and nodes.remaining_phivo synced with node_rewards.
 */
export async function reconcileNodeRewardsConsistency(): Promise<{
  normalizedNodes: number;
  backfilledDates: number;
  convertedOrphans: number;
  syncedLedgerCredits: number;
}> {
  const db = await getDb();

  const normRes = await db.query(
    `UPDATE nodes SET status = 'ACTIVE', updated_at = CURRENT_TIMESTAMP WHERE status = 'EMITTING'`
  );

  const bdateRes = await db.query(
    `
    UPDATE node_rewards nr
    SET business_date = (re.start_at AT TIME ZONE 'UTC')::date::text
    FROM reward_epochs re
    WHERE nr.epoch_id = re.id
      AND (nr.business_date IS NULL OR nr.business_date = '')
    `
  );

  // Convert any orphan PHIVO NODE_REWARD ledger entries into ACCRUED node_rewards (preserving source_id)
  const orphanRes = await db.query<{
    id: string;
    user_id: string;
    source_id: string;
    source_ref: string | null;
    amount: string | number;
    created_at: Date;
  }>(
    `
    SELECT fle.id, fle.user_id, fle.source_id, fle.source_ref, fle.amount, fle.created_at
    FROM financial_ledger_entries fle
    WHERE fle.source_type = 'NODE_REWARD'
      AND fle.currency = 'PHIVO'
      AND fle.entry_type = 'CREDIT'
      AND fle.status = 'SETTLED'
      AND NOT EXISTS (
        SELECT 1 FROM node_rewards nr
        WHERE nr.id::text = fle.source_id::text
           OR (fle.source_ref IS NOT NULL AND fle.source_ref != '' AND nr.public_reward_id = fle.source_ref)
      )
    ORDER BY fle.created_at ASC
    `
  );

  let convertedOrphans = 0;
  for (const orph of orphanRes.rows) {
    const nodeRes = await db.query<{ id: string; public_node_id: string }>(
      `
      SELECT id, public_node_id
      FROM nodes
      WHERE owner_user_id = $1 AND status IN ('ACTIVE', 'MATURED')
      ORDER BY activated_at ASC NULLS LAST, node_number ASC
      LIMIT 1
      `,
      [orph.user_id]
    );
    if (nodeRes.rows.length === 0) continue;

    const node = nodeRes.rows[0];
    const amt = Number(orph.amount);
    const createdAt = orph.created_at ? new Date(orph.created_at) : new Date();
    const bDate = getUtcBusinessDate(createdAt);

    // Find or create a COMPLETED epoch matching that UTC date and rate
    const epLookup = await db.query<{ id: string }>(
      `
      SELECT id FROM reward_epochs
      WHERE status = 'COMPLETED'
        AND (start_at AT TIME ZONE 'UTC')::date = $1::date
        AND (reward_per_node = $2 OR public_epoch_id LIKE 'EPOCH-%')
      ORDER BY CASE WHEN reward_per_node = $2 THEN 0 ELSE 1 END, epoch_number ASC
      LIMIT 1
      `,
      [bDate, amt]
    );

    let epochId: string;
    if (epLookup.rows.length > 0) {
      epochId = epLookup.rows[0].id;
    } else {
      const createdEp = await createRewardEpoch({
        businessDateStr: bDate,
        rewardPerNode: amt,
        startAt: createdAt,
      });
      epochId = createdEp.id;
      await db.query(
        `UPDATE reward_epochs SET status = 'COMPLETED', settled_at = $1 WHERE id = $2`,
        [createdAt, epochId]
      );
    }

    const publicRewardId =
      orph.source_ref && orph.source_ref.trim()
        ? orph.source_ref.trim()
        : `RWD-${node.public_node_id}`;

    const insRes = await db.query(
      `
      INSERT INTO node_rewards (
        id, public_reward_id, epoch_id, node_id, owner_user_id, amount, currency,
        status, accrued_at, reward_rate_used, economic_config_version, business_date, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'PHIVO', 'ACCRUED', $7, $8, 1, $9, $7)
      ON CONFLICT DO NOTHING
      RETURNING id
      `,
      [orph.source_id, publicRewardId, epochId, node.id, orph.user_id, amt, createdAt, amt, bDate]
    );
    if (insRes.rows.length > 0) {
      convertedOrphans++;
    }
  }

  // Ensure all non-reversed node_rewards have a matching financial_ledger_entries CREDIT
  const missingFleRes = await db.query<{
    id: string;
    public_reward_id: string;
    owner_user_id: string;
    amount: string | number;
    accrued_at: Date;
    epoch_number: number;
    public_node_id: string;
  }>(
    `
    SELECT nr.id, nr.public_reward_id, nr.owner_user_id, nr.amount, nr.accrued_at, re.epoch_number, n.public_node_id
    FROM node_rewards nr
    JOIN reward_epochs re ON nr.epoch_id = re.id
    JOIN nodes n ON nr.node_id = n.id
    WHERE nr.status != 'REVERSED'
      AND NOT EXISTS (
        SELECT 1 FROM financial_ledger_entries fle
        WHERE fle.source_type = 'NODE_REWARD'
          AND fle.entry_type = 'CREDIT'
          AND fle.source_id = nr.id
      )
    `
  );

  let syncedLedgerCredits = 0;
  for (const m of missingFleRes.rows) {
    const res = await postLedgerCredit({
      userId: m.owner_user_id,
      sourceType: 'NODE_REWARD',
      sourceId: m.id,
      sourceRef: m.public_reward_id,
      amount: Number(m.amount),
      currency: 'PHIVO',
      description: `Genesis Node Mining Reward (Epoch #${m.epoch_number}, Node ${m.public_node_id})`,
      createdAt: m.accrued_at ? new Date(m.accrued_at) : new Date(),
    });
    if (res) syncedLedgerCredits++;
  }

  // Sync nodes.distributed_phivo and nodes.remaining_phivo if any differ from node_rewards sum
  await db.query(
    `
    WITH agg AS (
      SELECT node_id, COALESCE(SUM(amount), 0) AS total_amt
      FROM node_rewards
      WHERE status != 'REVERSED'
      GROUP BY node_id
    )
    UPDATE nodes n
    SET
      distributed_phivo = COALESCE(agg.total_amt, 0),
      remaining_phivo = GREATEST(0, COALESCE(n.lifetime_phivo_allocation, 10000) - COALESCE(agg.total_amt, 0)),
      updated_at = CURRENT_TIMESTAMP
    FROM agg
    WHERE n.id = agg.node_id
      AND (
        COALESCE(n.distributed_phivo, 0) <> COALESCE(agg.total_amt, 0)
        OR COALESCE(n.remaining_phivo, 0) <> GREATEST(0, COALESCE(n.lifetime_phivo_allocation, 10000) - COALESCE(agg.total_amt, 0))
      )
    `
  );

  return {
    normalizedNodes: normRes.rowCount || 0,
    backfilledDates: bdateRes.rowCount || 0,
    convertedOrphans,
    syncedLedgerCredits,
  };
}

/**
 * Scheduled check executed on startup and every 60 seconds.
 * Only executes if mode === 'AUTOMATIC' and NODE_REWARDS_ENABLED === true and reward rate > 0.
 * Automatically repairs reward/ledger consistency and catches up any missed UTC business dates cleanly without double-crediting.
 */
export async function executeDailyAutomaticRewardCheck(): Promise<void> {
  return withRewardSettlementLock(async () => {
    try {
      await reconcileNodeRewardsConsistency();

      const config = await getRewardAutomationConfig();

      if (config.mode !== 'AUTOMATIC' || !config.autoEnabled) {
        return; // Manual mode is active; skip automated run
      }

      const [rewardsEnabled, emissionSwitchEnabled] = await Promise.all([
        isNodeRewardsEnabled(),
        isFeatureSwitchEnabled('genesis_node_emission_enabled'),
      ]);
      if (!rewardsEnabled || !emissionSwitchEnabled) {
        return; // Master engine switch paused
      }

      const activeRate = await getNodeRewardRatePerEpoch();
      if (!activeRate || activeRate <= 0) {
        return; // Rate not configured yet; do not create orphan OPEN epochs
      }

      const db = await getDb();
      const now = new Date();
      const todayDate = getUtcBusinessDate(now);
      const nowHHMM = `${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}`;
      const scheduledHHMM = config.scheduledTimeUtc || '00:00';

      // Clean up any stale unpopulated OPEN epochs from earlier failed attempts
      await db.query(
        `
        DELETE FROM reward_epochs
        WHERE status = 'OPEN'
          AND (reward_per_node IS NULL OR reward_per_node <= 0)
          AND NOT EXISTS (SELECT 1 FROM node_rewards nr WHERE nr.epoch_id = reward_epochs.id)
        `
      );

      // Determine missed UTC dates range across the automated daily window
      // After atomic pre-launch backfill (through 2026-11-26 UTC), advance floor to 2026-11-27 so 2026-11-26 is never double-paid.
      const preLaunchResetRes = await db
        .query<{ config_value: string }>(
          `SELECT config_value::text FROM unilevel_master_configs WHERE config_key = 'pre_launch_unilevel_reset_completed' LIMIT 1`
        )
        .catch(() => ({ rows: [] as Array<{ config_value: string }> }));
      const isPostPreLaunchBackfill = Number(preLaunchResetRes.rows[0]?.config_value || 0) >= 1;

      const earliestNodeRes = await db.query<{ earliest_date: string | null }>(
        `SELECT MIN((COALESCE(activated_at, created_at) AT TIME ZONE 'UTC')::date)::text AS earliest_date FROM nodes WHERE status IN ('ACTIVE', 'EMITTING') AND owner_user_id IS NOT NULL`
      );

      const earliestNodeDate = earliestNodeRes.rows[0]?.earliest_date?.slice(0, 10) || todayDate;
      const dailyCadenceFloor = isPostPreLaunchBackfill ? '2026-11-27' : '2026-11-06';
      const minAllowedLookback = new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      let rangeStartDate = earliestNodeDate > dailyCadenceFloor ? earliestNodeDate : dailyCadenceFloor;
      if (!isPostPreLaunchBackfill && rangeStartDate < minAllowedLookback) {
        rangeStartDate = minAllowedLookback;
      }

      const candidateDates =
        rangeStartDate > todayDate ? [] : buildUtcDateRange(rangeStartDate, todayDate);
      let latestSettledResult: EpochSettlementResult | null = null;

      for (const dateStr of candidateDates) {
        // For today, wait until scheduled UTC HH:MM
        if (dateStr === todayDate && nowHHMM < scheduledHHMM) {
          continue;
        }

        // Skip if a COMPLETED epoch already exists on this UTC date WITH actual daily NRW-% rewards settled
        const existingDateEpoch = await db.query<{ id: string }>(
          `
          SELECT re.id
          FROM reward_epochs re
          WHERE re.status = 'COMPLETED'
            AND (re.start_at AT TIME ZONE 'UTC')::date = $1::date
            AND EXISTS (
              SELECT 1 FROM node_rewards nr
              WHERE nr.epoch_id = re.id
                AND nr.status != 'REVERSED'
                AND nr.public_reward_id NOT LIKE 'RWD-%'
            )
          LIMIT 1
          `,
          [dateStr]
        );
        if (existingDateEpoch.rows.length > 0) {
          continue;
        }

        const isCatchup = dateStr < todayDate;
        const excludeLumpSumRange = isCatchup && dateStr >= '2026-11-06' && dateStr <= '2026-11-15';
        console.log(`[RewardAutomation] ⏰ Automatic daily mining reward settlement for UTC date ${dateStr}${isCatchup ? ' (catch-up)' : ''}`);

        // Reuse matching OPEN epoch OR reopen an empty 0-reward epoch on this UTC date before creating a fresh one
        let epochId: string | null = null;
        const matchingOpen = await db.query<{ id: string }>(
          `SELECT id FROM reward_epochs WHERE status = 'OPEN' AND (start_at AT TIME ZONE 'UTC')::date = $1::date ORDER BY created_at DESC LIMIT 1`,
          [dateStr]
        );
        if (matchingOpen.rows.length > 0) {
          epochId = matchingOpen.rows[0].id;
        } else {
          const emptyCompleted = await db.query<{ id: string }>(
            `
            SELECT re.id
            FROM reward_epochs re
            WHERE re.status = 'COMPLETED'
              AND (re.start_at AT TIME ZONE 'UTC')::date = $1::date
              AND NOT EXISTS (SELECT 1 FROM node_rewards nr WHERE nr.epoch_id = re.id)
            ORDER BY re.epoch_number ASC
            LIMIT 1
            `,
            [dateStr]
          );
          if (emptyCompleted.rows.length > 0) {
            epochId = emptyCompleted.rows[0].id;
            await db.query(`UPDATE reward_epochs SET status = 'OPEN' WHERE id = $1`, [epochId]);
          }
        }

        if (!epochId) {
          const created = await createRewardEpoch({ businessDateStr: dateStr, rewardPerNode: activeRate });
          epochId = created.id;
        }

        const settleTimestamp = isCatchup ? new Date(`${dateStr}T00:05:00.000Z`) : new Date();
        const result = await closeAndSettleEpoch(epochId, {
          configuredRewardPerNode: activeRate,
          dedupeByBusinessDate: true,
          excludeLumpSumRange,
          settleTimestamp,
          suppressEmails: isCatchup,
        });

        if (result.success) {
          latestSettledResult = result;
          console.log(`[RewardAutomation] ✅ Settled ${dateStr} -> Epoch #${result.epochNumber}, Nodes: ${result.eligibleNodesCount}, Credited: ${result.rewardsCreated}, Total: ${result.totalRewardsDistributedUsd} PHIVO`);
        } else {
          console.warn(`[RewardAutomation] Aborted settlement for ${dateStr}:`, result.error || result.message);
          break;
        }
      }

      // Only update config tracking when an epoch actually settled cleanly
      if (latestSettledResult && latestSettledResult.success) {
        const refreshedConfig = await getRewardAutomationConfig();
        const updated: RewardAutomationConfig = {
          ...refreshedConfig,
          lastSettledAt: new Date().toISOString(),
          lastEpochNumber: latestSettledResult.epochNumber,
          lastSettledBy: 'system-auto',
          lastSettledMode: 'AUTOMATIC',
        };

        await db.query(
          `
          INSERT INTO system_economic_configs (
            id, config_key, config_value, category, description, status, version, effective_from, updated_by_admin_id, updated_by_admin_public_id, created_at, updated_at
          )
          VALUES ($1, 'DAILY_REWARD_AUTOMATION', $2, 'REWARDS', 'Dual-mode daily mining reward distribution automation setting', 'ACTIVE', 1, CURRENT_TIMESTAMP, NULL, 'SYSTEM', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT (config_key) DO UPDATE SET
            config_value = EXCLUDED.config_value,
            status = 'ACTIVE',
            updated_at = CURRENT_TIMESTAMP
          `,
          [uuidv4(), JSON.stringify(updated)]
        );

        broadcastSystemConfigChange('DAILY_REWARD_AUTOMATION', updated, 'REWARDS');
      }
    } catch (err) {
      console.error('[RewardAutomation] Error in executeDailyAutomaticRewardCheck:', err);
    }
  });
}
