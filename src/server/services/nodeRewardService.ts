import { getDb } from '../db/db';
import { v4 as uuidv4 } from 'uuid';
import { generateEpochPublicId, generateRewardPublicId } from '../utils/idGenerator';
import { getConfiguredRewardPerNode, REWARD_CURRENCY } from '../config/rewardConfig';
import { postLedgerCredit, postLedgerReversal } from './walletLedgerService';
import { isNodeRewardsEnabled, getNodeRewardRatePerEpoch, getEconomicConfigByKey } from './economicService';
import { notifyPhivoReward } from './notificationService';
import { getUtcBusinessDate } from '../utils/timezone';

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
}): Promise<RewardEpoch> {
  const db = await getDb();
  let rewardRate: number | null = null;
  let configVersion: number | null = null;

  if (params?.rewardPerNode !== undefined) {
    rewardRate = getConfiguredRewardPerNode(params.rewardPerNode);
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
  const utcDateStr = getUtcBusinessDate(baseDate);
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
  options?: { configuredRewardPerNode?: number; targetNodeId?: string }
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

  // 2. Check master switch: Rewards Enabled
  const rewardsEnabled = await isNodeRewardsEnabled();
  if (!rewardsEnabled) {
    return {
      success: false,
      error: 'NODE_REWARDS_DISABLED',
      message: 'Node mining reward distributions are currently disabled by administration.',
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
    effectiveRate = getConfiguredRewardPerNode(options.configuredRewardPerNode);
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

  const now = new Date();
  const epochBaseDate = epoch.start_at ? new Date(epoch.start_at) : now;
  const businessDate = getUtcBusinessDate(epochBaseDate);

  // Snapshot active config version and rate onto the epoch record immediately before node loop
  await db.query(
    `UPDATE reward_epochs 
     SET status = 'COMPLETED', reward_per_node = $1, reward_rate_used = $1, economic_config_version = $2, settled_at = $3 
     WHERE id = $4`,
    [effectiveRate, configVersion, now, epochId]
  );

  // 4. Query all ACTIVE or EMITTING nodes with valid owners that haven't reached lifetime cap
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
      AND (distributed_phivo IS NULL OR distributed_phivo < COALESCE(lifetime_phivo_allocation, 10000.00))
      AND (remaining_phivo IS NULL OR remaining_phivo > 0)
      AND ($1::text IS NULL OR id::text = $1 OR public_node_id = $1)
    ORDER BY node_number ASC
    `,
    [options?.targetNodeId || null]
  );

  const eligibleNodes = activeNodesRes.rows;
  let rewardsCreated = 0;
  let totalDistributed = 0;

  for (const node of eligibleNodes) {
    const configuredDailyReward = effectiveRate;
    const lifetimeCap = Number(node.lifetime_phivo_allocation || 10000);
    const currentDist = Number(node.distributed_phivo || 0);
    const remainingPhivo = node.remaining_phivo !== null && node.remaining_phivo !== undefined
      ? Number(node.remaining_phivo)
      : Math.max(0, lifetimeCap - currentDist);

    const actualEmission = Math.min(configuredDailyReward, Math.max(0, remainingPhivo));

    if (actualEmission <= 0) {
      // Node has already distributed full allocation: mark MATURED
      await db.query(
        `UPDATE nodes SET status = 'MATURED', remaining_phivo = 0, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [node.id]
      );
      continue;
    }

    const rewardId = uuidv4();
    const publicRewardId = generateRewardPublicId();

    // Idempotent insertion protected by UNIQUE(node_id, epoch_id)
    const insRes = await db.query<any>(
      `
      INSERT INTO node_rewards (
        id, public_reward_id, epoch_id, node_id, owner_user_id, amount, currency, status, accrued_at,
        reward_rate_used, economic_config_version, business_date, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACCRUED', $8, $9, $10, $11, CURRENT_TIMESTAMP)
      ON CONFLICT (node_id, epoch_id) DO NOTHING
      RETURNING *
      `,
      [
        rewardId,
        publicRewardId,
        epochId,
        node.id,
        node.owner_user_id,
        actualEmission,
        epoch.currency || REWARD_CURRENCY,
        now,
        configuredDailyReward,
        configVersion,
        businessDate,
      ]
    );

    let actualRewardId: string;
    let actualPublicRewardId: string;
    let actualAmount: number;

    if (insRes.rows.length > 0) {
      actualRewardId = insRes.rows[0].id;
      actualPublicRewardId = insRes.rows[0].public_reward_id;
      actualAmount = Number(insRes.rows[0].amount);
      rewardsCreated++;
      totalDistributed += actualAmount;

      // Update node distribution accounting and status
      const newDist = currentDist + actualAmount;
      const newRem = Math.max(0, remainingPhivo - actualAmount);
      const newStatus = newRem <= 0 || newDist >= lifetimeCap ? 'MATURED' : 'EMITTING';

      await db.query(
        `
        UPDATE nodes
        SET distributed_phivo = $1, remaining_phivo = $2, status = $3, updated_at = CURRENT_TIMESTAMP
        WHERE id = $4
        `,
        [newDist, newRem, newStatus, node.id]
      );
    } else {
      // Already existed: fetch existing
      const existing = await db.query<any>(
        `SELECT id, public_reward_id, amount FROM node_rewards WHERE node_id = $1 AND epoch_id = $2`,
        [node.id, epochId]
      );
      if (existing.rows.length === 0) continue;
      actualRewardId = existing.rows[0].id;
      actualPublicRewardId = existing.rows[0].public_reward_id;
      actualAmount = Number(existing.rows[0].amount);
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
      createdAt: now,
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

  return {
    success: true,
    epochId,
    publicEpochId,
    epochNumber,
    rewardPerNode: effectiveRate,
    eligibleNodesCount: eligibleNodes.length,
    rewardsCreated,
    totalRewardsDistributedUsd: totalDistributed,
    settledAt: now.toISOString(),
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

  const now = new Date();
  const updRes = await db.query<any>(
    `
    UPDATE node_rewards
    SET status = 'CLAIMED', claimed_at = $1
    WHERE owner_user_id = $2 AND status = 'ACCRUED'
    RETURNING id, amount
    `,
    [now, userId]
  );

  let totalAmount = 0;
  for (const row of updRes.rows) {
    totalAmount += Number(row.amount);
  }

  return {
    claimedCount: updRes.rows.length,
    totalClaimedAmount: totalAmount,
  };
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
  const db = await getDb();
  console.log(`[RewardAutomation] 🚀 Manual daily reward distribution triggered by admin ${adminPublicId}`);

  // Find or create an open epoch
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

  // Settle the epoch
  const settlementResult = await closeAndSettleEpoch(epochId);

  if (!settlementResult.success) {
    return {
      success: false,
      error: settlementResult.error,
      message: settlementResult.message || 'Settlement failed.',
      result: settlementResult,
    };
  }

  // Update last settlement tracking
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
      updated_at = CURRENT_TIMESTAMP
    `,
    [uuidv4(), JSON.stringify(updatedConfig), adminUserId, adminPublicId]
  );

  return {
    success: true,
    message: `Manual ROI distribution completed successfully. ${settlementResult.eligibleNodesCount} nodes credited ${settlementResult.totalRewardsDistributedUsd.toFixed(2)} PHIVO rewards (Epoch #${settlementResult.epochNumber}).`,
    result: settlementResult,
  };
}

/**
 * Scheduled check executed by the background timer.
 * Only executes if mode === 'AUTOMATIC'.
 */
export async function executeDailyAutomaticRewardCheck(): Promise<void> {
  try {
    const config = await getRewardAutomationConfig();

    if (config.mode !== 'AUTOMATIC' || !config.autoEnabled) {
      return; // Manual mode is active; skip automated run
    }

    const todayDate = getUtcBusinessDate();
    const db = await getDb();

    // Check if an epoch has already been completed today
    const checkRes = await db.query<any>(
      `SELECT id FROM reward_epochs WHERE status = 'COMPLETED' AND DATE(settled_at) = CURRENT_DATE LIMIT 1`
    );

    if (checkRes.rows.length > 0) {
      return; // Already settled for today
    }

    console.log(`[RewardAutomation] ⏰ Automatic daily mining reward distribution starting for business date: ${todayDate}`);
    
    // Find or create open epoch
    let epochId: string;
    const openEpoch = await db.query<any>(
      `SELECT id FROM reward_epochs WHERE status = 'OPEN' ORDER BY created_at DESC LIMIT 1`
    );

    if (openEpoch.rows.length > 0) {
      epochId = openEpoch.rows[0].id;
    } else {
      const newEpoch = await createRewardEpoch();
      epochId = newEpoch.id;
    }

    const result = await closeAndSettleEpoch(epochId);
    console.log(`[RewardAutomation] ✅ Automated daily reward distribution finished: Epoch #${result.epochNumber}, Nodes: ${result.eligibleNodesCount}, Total: ${result.totalRewardsDistributedUsd} PHIVO`);

    // Update automation config tracking
    const updated: RewardAutomationConfig = {
      ...config,
      lastSettledAt: new Date().toISOString(),
      lastEpochNumber: result.epochNumber,
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
        updated_at = CURRENT_TIMESTAMP
      `,
      [uuidv4(), JSON.stringify(updated)]
    );
  } catch (err) {
    console.error('[RewardAutomation] Error in executeDailyAutomaticRewardCheck:', err);
  }
}
