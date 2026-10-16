import { v4 as uuidv4 } from 'uuid';
import { DatabaseClient, getDb } from '../db/db';
import { generateSettlementPublicId } from '../utils/idGenerator';
import { postLedgerCredit, postLedgerReversal } from './walletLedgerService';
import { notifyMatchingEarned } from './notificationService';
import {
  getDhakaBusinessDate,
  getNextDhakaMidnightTime,
  getPreviousDhakaBusinessDate,
} from '../utils/timezone';

// ============================================================================
// 1. Immutable Server-Side Matching Tiers Configuration & Dynamic Logic
// ============================================================================

export interface MatchingTier {
  readonly units: number;
  readonly bonusUsd: number;
}

export interface BinaryMatchingConfig {
  id: string;
  matchingEnabled: boolean;
  dailyMaxPayout: number;
  sponsorQualificationRequired: boolean;
  carryForwardBehavior: string;
  effectiveDate: string;
  version: number;
  tiers: MatchingTier[];
}

export async function getActiveMatchingConfig(dbClient?: DatabaseClient): Promise<BinaryMatchingConfig> {
  const db = dbClient || await getDb();
  try {
    const res = await db.query<{
      id: string;
      matching_enabled: boolean;
      daily_max_payout: string | number;
      sponsor_qualification_required: boolean;
      carry_forward_behavior: string;
      effective_date: string | Date;
      version: number;
      tiers_json: string;
    }>(
      `SELECT * FROM binary_matching_config ORDER BY version DESC, effective_date DESC LIMIT 1`
    );

    const defaultTiers: MatchingTier[] = [
      { units: 2, bonusUsd: 500 },
      { units: 4, bonusUsd: 1000 },
      { units: 6, bonusUsd: 1500 },
      { units: 8, bonusUsd: 2000 },
      { units: 10, bonusUsd: 2500 },
      { units: 12, bonusUsd: 3000 },
      { units: 14, bonusUsd: 3500 },
      { units: 16, bonusUsd: 4000 },
      { units: 18, bonusUsd: 4500 },
      { units: 20, bonusUsd: 5000 },
    ];

    if (res.rows.length === 0) {
      return {
        id: 'default',
        matchingEnabled: true,
        dailyMaxPayout: 5000.00,
        sponsorQualificationRequired: true,
        carryForwardBehavior: 'DISCARD_WEAK_CARRY_STRONG',
        effectiveDate: new Date().toISOString().split('T')[0],
        version: 1,
        tiers: defaultTiers
      };
    }

    const row = res.rows[0];
    let tiers: MatchingTier[] = defaultTiers;
    try {
      tiers = JSON.parse(row.tiers_json);
    } catch (e) {
      console.error('Failed to parse tiers_json, using default tiers:', e);
    }

    return {
      id: row.id,
      matchingEnabled: row.matching_enabled,
      dailyMaxPayout: Number(row.daily_max_payout),
      sponsorQualificationRequired: row.sponsor_qualification_required,
      carryForwardBehavior: row.carry_forward_behavior,
      effectiveDate: typeof row.effective_date === 'string' 
        ? row.effective_date.split('T')[0] 
        : new Date(row.effective_date).toISOString().split('T')[0],
      version: row.version,
      tiers: tiers
    };
  } catch (err) {
    console.warn('[BinaryMatching] Failed to query binary_matching_config, using default configuration.', err);
    return {
      id: 'default_fallback',
      matchingEnabled: true,
      dailyMaxPayout: 5000.00,
      sponsorQualificationRequired: true,
      carryForwardBehavior: 'DISCARD_WEAK_CARRY_STRONG',
      effectiveDate: new Date().toISOString().split('T')[0],
      version: 1,
      tiers: [
        { units: 2, bonusUsd: 500 },
        { units: 4, bonusUsd: 1000 },
        { units: 6, bonusUsd: 1500 },
        { units: 8, bonusUsd: 2000 },
        { units: 10, bonusUsd: 2500 },
        { units: 12, bonusUsd: 3000 },
        { units: 14, bonusUsd: 3500 },
        { units: 16, bonusUsd: 4000 },
        { units: 18, bonusUsd: 4500 },
        { units: 20, bonusUsd: 5000 }
      ]
    };
  }
}

export async function checkSponsorQualification(dbClient: DatabaseClient, userId: string): Promise<boolean> {
  const res = await dbClient.query<{ branch_side: 'LEFT' | 'RIGHT'; count: number }>(
    `
    WITH RECURSIVE binary_descendants AS (
      SELECT user_id, side AS branch_side
      FROM binary_placements
      WHERE parent_user_id = $1 AND status = 'PLACED'

      UNION ALL

      SELECT bp.user_id, bd.branch_side
      FROM binary_placements bp
      INNER JOIN binary_descendants bd ON bp.parent_user_id = bd.user_id
      WHERE bp.status = 'PLACED'
    )
    SELECT bd.branch_side, COUNT(ur.user_id)::int AS count
    FROM user_referrals ur
    INNER JOIN binary_descendants bd ON ur.user_id = bd.user_id
    WHERE ur.sponsor_user_id = $1
    GROUP BY bd.branch_side
    `,
    [userId]
  );

  let hasLeft = false;
  let hasRight = false;

  for (const row of res.rows) {
    if (row.branch_side === 'LEFT' && row.count >= 1) {
      hasLeft = true;
    }
    if (row.branch_side === 'RIGHT' && row.count >= 1) {
      hasRight = true;
    }
  }

  return hasLeft && hasRight;
}

/**
 * Server-side fallback/historical matching tiers.
 */
export const MATCHING_TIERS: readonly MatchingTier[] = Object.freeze([
  { units: 100, bonusUsd: 10000 },
  { units: 50, bonusUsd: 6000 },
  { units: 20, bonusUsd: 4000 },
  { units: 8, bonusUsd: 2000 },
  { units: 4, bonusUsd: 1000 },
  { units: 2, bonusUsd: 500 },
]);

export interface MatchingComponentPlan {
  sequenceNo: number;
  tierUnits: number;
  leftUnits: number;
  rightUnits: number;
  bonusUsd: number;
}

export interface MatchingDecompositionResult {
  availableLeft: number;
  availableRight: number;
  matchableUnits: number;
  consumedLeft: number;
  consumedRight: number;
  carryLeftAfter: number;
  carryRightAfter: number;
  totalBonusUsd: number;
  components: MatchingComponentPlan[];
}

/**
 * Historical calculation function for matching tier decomposition.
 */
export function calculateMatchingDecomposition(
  availableLeft: number,
  availableRight: number
): MatchingDecompositionResult {
  if (availableLeft < 0 || availableRight < 0) {
    throw new Error('Available volume units cannot be negative');
  }

  let remaining = Math.min(Math.floor(availableLeft), Math.floor(availableRight));
  const matchableUnits = remaining;
  const components: MatchingComponentPlan[] = [];
  let totalBonusUsd = 0;
  let totalConsumed = 0;
  let seq = 1;

  for (const tier of MATCHING_TIERS) {
    while (remaining >= tier.units) {
      components.push({
        sequenceNo: seq++,
        tierUnits: tier.units,
        leftUnits: tier.units,
        rightUnits: tier.units,
        bonusUsd: tier.bonusUsd,
      });
      remaining -= tier.units;
      totalBonusUsd += tier.bonusUsd;
      totalConsumed += tier.units;
    }
  }

  const consumedLeft = totalConsumed;
  const consumedRight = totalConsumed;
  const carryLeftAfter = availableLeft - consumedLeft;
  const carryRightAfter = availableRight - consumedRight;

  return {
    availableLeft,
    availableRight,
    matchableUnits,
    consumedLeft,
    consumedRight,
    carryLeftAfter,
    carryRightAfter,
    totalBonusUsd,
    components,
  };
}

/**
 * Dynamic calculation function for versioned matching rules.
 */
export function calculateDynamicMatchingDecomposition(
  availableLeft: number,
  availableRight: number,
  config: BinaryMatchingConfig,
  sponsorQualified: boolean
): MatchingDecompositionResult {
  if (availableLeft < 0 || availableRight < 0) {
    throw new Error('Available volume units cannot be negative');
  }

  // 1. Check if matching is disabled or user not qualified
  if (!config.matchingEnabled || (config.sponsorQualificationRequired && !sponsorQualified)) {
    return {
      availableLeft,
      availableRight,
      matchableUnits: 0,
      consumedLeft: 0,
      consumedRight: 0,
      carryLeftAfter: availableLeft,
      carryRightAfter: availableRight,
      totalBonusUsd: 0,
      components: [],
    };
  }

  // 2. Find highest eligible tier
  const sortedTiers = [...config.tiers].sort((a, b) => b.units - a.units);
  let selectedTier: MatchingTier | null = null;

  for (const tier of sortedTiers) {
    if (availableLeft >= tier.units && availableRight >= tier.units) {
      selectedTier = tier;
      break; // Pay ONLY the highest eligible daily tier
    }
  }

  // 3. Calculate consumption and carry forward
  if (!selectedTier) {
    return {
      availableLeft,
      availableRight,
      matchableUnits: 0,
      consumedLeft: 0,
      consumedRight: 0,
      carryLeftAfter: availableLeft,
      carryRightAfter: availableRight,
      totalBonusUsd: 0,
      components: [],
    };
  }

  const consumedLeft = selectedTier.units;
  const consumedRight = selectedTier.units;
  
  const tempLeftoverLeft = availableLeft - consumedLeft;
  const tempLeftoverRight = availableRight - consumedRight;

  let carryLeftAfter = tempLeftoverLeft;
  let carryRightAfter = tempLeftoverRight;

  if (config.carryForwardBehavior === 'DISCARD_WEAK_CARRY_STRONG') {
    if (tempLeftoverLeft < tempLeftoverRight) {
      carryLeftAfter = 0;
      carryRightAfter = tempLeftoverRight;
    } else if (tempLeftoverRight < tempLeftoverLeft) {
      carryRightAfter = 0;
      carryLeftAfter = tempLeftoverLeft;
    } else {
      carryLeftAfter = 0;
      carryRightAfter = 0;
    }
  }

  const payout = Math.min(selectedTier.bonusUsd, config.dailyMaxPayout);

  const components: MatchingComponentPlan[] = [
    {
      sequenceNo: 1,
      tierUnits: selectedTier.units,
      leftUnits: selectedTier.units,
      rightUnits: selectedTier.units,
      bonusUsd: payout,
    }
  ];

  return {
    availableLeft,
    availableRight,
    matchableUnits: Math.min(availableLeft, availableRight),
    consumedLeft,
    consumedRight,
    carryLeftAfter,
    carryRightAfter,
    totalBonusUsd: payout,
    components,
  };
}

// ============================================================================
// 2. Types & Interfaces
// ============================================================================

export interface MatchingSettlementItem {
  id: string;
  publicSettlementId: string;
  userId: string;
  businessDate: string;
  availableLeft: number;
  availableRight: number;
  consumedLeft: number;
  consumedRight: number;
  carryLeftBefore: number;
  carryRightBefore: number;
  carryLeftAfter: number;
  carryRightAfter: number;
  totalBonusUsd: number;
  status: 'COMPLETED' | 'REVERSED';
  settledAt: string;
  createdAt: string;
  components: MatchingComponentPlan[];
}

export interface MatchingSummaryResponse {
  todayVolume: {
    left: number;
    right: number;
  };
  carry: {
    left: number;
    right: number;
  };
  latestSettlement: MatchingSettlementItem | null;
  totalMatchingEarnedUsd: number;
  activeTiers?: MatchingTier[];
  matchingConfig?: {
    matchingEnabled: boolean;
    dailyMaxPayout: number;
    sponsorQualificationRequired: boolean;
  };
  nextSettlement: {
    scheduledTime: string;
    nextSettlementIso: string;
    msUntilNext: number;
  };
}

export interface MatchingHistoryResponse {
  history: MatchingSettlementItem[];
  pagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
  };
}

export interface CycleSettlementResult {
  businessDate: string;
  status: 'COMPLETED' | 'SKIPPED_ALREADY_COMPLETED' | 'RUNNING' | 'FAILED';
  usersSettled: number;
  totalBonusUsd: number;
  durationMs: number;
  error?: string;
}

// ============================================================================
// 3. User Settlement Core (Atomic & Idempotent)
// ============================================================================

/**
 * Settles matching bonus for a single user for a given business date.
 * Wrapped in an atomic transaction with row-level balance locking.
 * Idempotent: If a settlement for (user_id, business_date) already exists,
 * returns the existing record without creating duplicate components or double-paying.
 */
export async function settleUserMatchingForDate(
  dbClient: DatabaseClient | null,
  userId: string,
  businessDate: string
): Promise<MatchingSettlementItem> {
  const db = dbClient || (await getDb());

  // 1. Check existing settlement (Idempotency check)
  const existingRes = await db.query<{
    id: string;
    public_settlement_id: string;
    user_id: string;
    business_date: string | Date;
    available_left_units: number;
    available_right_units: number;
    consumed_left_units: number;
    consumed_right_units: number;
    carry_left_before: number;
    carry_right_before: number;
    carry_left_after: number;
    carry_right_after: number;
    total_bonus_usd: string | number;
    status: 'COMPLETED' | 'REVERSED';
    settled_at: Date;
    created_at: Date;
  }>(
    `
    SELECT *
    FROM binary_matching_settlements
    WHERE user_id = $1 AND business_date = $2
    `,
    [userId, businessDate]
  );

  if (existingRes.rows.length > 0) {
    const row = existingRes.rows[0];
    const compRes = await db.query<{
      sequence_no: number;
      tier_units: number;
      left_units: number;
      right_units: number;
      bonus_usd: string | number;
    }>(
      `
      SELECT sequence_no, tier_units, left_units, right_units, bonus_usd
      FROM binary_matching_components
      WHERE settlement_id = $1
      ORDER BY sequence_no ASC
      `,
      [row.id]
    );

    return {
      id: row.id,
      publicSettlementId: row.public_settlement_id,
      userId: row.user_id,
      businessDate: typeof row.business_date === 'string' ? row.business_date.split('T')[0] : new Date(row.business_date).toISOString().split('T')[0],
      availableLeft: Number(row.available_left_units),
      availableRight: Number(row.available_right_units),
      consumedLeft: Number(row.consumed_left_units),
      consumedRight: Number(row.consumed_right_units),
      carryLeftBefore: Number(row.carry_left_before),
      carryRightBefore: Number(row.carry_right_before),
      carryLeftAfter: Number(row.carry_left_after),
      carryRightAfter: Number(row.carry_right_after),
      totalBonusUsd: Number(row.total_bonus_usd),
      status: row.status,
      settledAt: new Date(row.settled_at).toISOString(),
      createdAt: new Date(row.created_at).toISOString(),
      components: compRes.rows.map((c) => ({
        sequenceNo: Number(c.sequence_no),
        tierUnits: Number(c.tier_units),
        leftUnits: Number(c.left_units),
        rightUnits: Number(c.right_units),
        bonusUsd: Number(c.bonus_usd),
      })),
    };
  }

  // 2. Perform Atomic Settlement Transaction
  await db.query('BEGIN');

  try {
    // 2a. Ensure balance row exists and lock it FOR UPDATE
    await db.query(
      `
      INSERT INTO binary_volume_balances (user_id, carry_left_units, carry_right_units, updated_at)
      VALUES ($1, 0, 0, CURRENT_TIMESTAMP)
      ON CONFLICT (user_id) DO NOTHING
      `,
      [userId]
    );

    const balanceRes = await db.query<{
      carry_left_units: number;
      carry_right_units: number;
      last_settled_business_date: Date | string | null;
    }>(
      `
      SELECT carry_left_units, carry_right_units, last_settled_business_date
      FROM binary_volume_balances
      WHERE user_id = $1
      FOR UPDATE
      `,
      [userId]
    );

    const balance = balanceRes.rows[0];
    const carryLeftBefore = Number(balance?.carry_left_units || 0);
    const carryRightBefore = Number(balance?.carry_right_units || 0);
    const lastSettledDate = balance?.last_settled_business_date
      ? (typeof balance.last_settled_business_date === 'string'
          ? balance.last_settled_business_date.split('T')[0]
          : new Date(balance.last_settled_business_date).toISOString().split('T')[0])
      : null;

    // 2b. Calculate new eligible volume from active non-reversed events up to businessDate
    let newVolumeQuery: string;
    let newVolumeParams: any[];

    if (lastSettledDate) {
      newVolumeQuery = `
        SELECT 
          COALESCE(SUM(CASE WHEN side = 'LEFT' THEN volume_units ELSE 0 END), 0)::int AS new_left,
          COALESCE(SUM(CASE WHEN side = 'RIGHT' THEN volume_units ELSE 0 END), 0)::int AS new_right
        FROM binary_volume_events
        WHERE beneficiary_user_id = $1 
          AND status = 'ACTIVE' 
          AND business_date > $2 
          AND business_date <= $3
      `;
      newVolumeParams = [userId, lastSettledDate, businessDate];
    } else {
      newVolumeQuery = `
        SELECT 
          COALESCE(SUM(CASE WHEN side = 'LEFT' THEN volume_units ELSE 0 END), 0)::int AS new_left,
          COALESCE(SUM(CASE WHEN side = 'RIGHT' THEN volume_units ELSE 0 END), 0)::int AS new_right
        FROM binary_volume_events
        WHERE beneficiary_user_id = $1 
          AND status = 'ACTIVE' 
          AND business_date <= $2
      `;
      newVolumeParams = [userId, businessDate];
    }

    const volumeRes = await db.query<{ new_left: number; new_right: number }>(
      newVolumeQuery,
      newVolumeParams
    );

    const newLeft = Number(volumeRes.rows[0]?.new_left || 0);
    const newRight = Number(volumeRes.rows[0]?.new_right || 0);

    const availableLeft = carryLeftBefore + newLeft;
    const availableRight = carryRightBefore + newRight;

    // 2c. Load active matching configuration and sponsor qualification dynamically
    const config = await getActiveMatchingConfig(db);
    const sponsorQualified = await checkSponsorQualification(db, userId);

    const decomposition = calculateDynamicMatchingDecomposition(availableLeft, availableRight, config, sponsorQualified);

    // 2d. Create settlement record
    const settlementId = uuidv4();
    const publicSettlementId = generateSettlementPublicId();
    const settledAt = new Date();

    const insertSettlementRes = await db.query<{ id: string }>(
      `
      INSERT INTO binary_matching_settlements (
        id, public_settlement_id, user_id, business_date,
        available_left_units, available_right_units,
        consumed_left_units, consumed_right_units,
        carry_left_before, carry_right_before,
        carry_left_after, carry_right_after,
        total_bonus_usd, status, settled_at, created_at
      )
      VALUES (
        $1, $2, $3, $4,
        $5, $6,
        $7, $8,
        $9, $10,
        $11, $12,
        $13, 'COMPLETED', $14, CURRENT_TIMESTAMP
      )
      ON CONFLICT (user_id, business_date) DO NOTHING
      RETURNING id
      `,
      [
        settlementId,
        publicSettlementId,
        userId,
        businessDate,
        availableLeft,
        availableRight,
        decomposition.consumedLeft,
        decomposition.consumedRight,
        carryLeftBefore,
        carryRightBefore,
        decomposition.carryLeftAfter,
        decomposition.carryRightAfter,
        decomposition.totalBonusUsd,
        settledAt,
      ]
    );

    // If conflict occurred concurrently, rollback and return the existing record
    if (insertSettlementRes.rows.length === 0) {
      await db.query('ROLLBACK');
      return settleUserMatchingForDate(db, userId, businessDate);
    }

    // 2e. Create matching components
    for (const comp of decomposition.components) {
      const compId = uuidv4();
      await db.query(
        `
        INSERT INTO binary_matching_components (
          id, settlement_id, tier_units, left_units, right_units,
          bonus_usd, sequence_no, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
        `,
        [
          compId,
          settlementId,
          comp.tierUnits,
          comp.leftUnits,
          comp.rightUnits,
          comp.bonusUsd,
          comp.sequenceNo,
        ]
      );
    }

    // 2f. Update binary_volume_balances with new carry and last_settled_business_date
    await db.query(
      `
      UPDATE binary_volume_balances
      SET
        carry_left_units = $1,
        carry_right_units = $2,
        last_settled_business_date = $3,
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $4
      `,
      [decomposition.carryLeftAfter, decomposition.carryRightAfter, businessDate, userId]
    );

    await db.query('COMMIT');

    // Post to authoritative financial ledger (Task #13)
    if (decomposition.totalBonusUsd > 0) {
      try {
        await postLedgerCredit({
          userId,
          sourceType: 'MATCHING_BONUS',
          sourceId: settlementId,
          sourceRef: publicSettlementId,
          amount: decomposition.totalBonusUsd,
          description: `Daily Binary Matching Settlement (${businessDate})`,
          createdAt: settledAt,
        });
      } catch (ledgErr) {
        console.warn('[WalletLedger] Error posting matching settlement to ledger:', ledgErr);
      }

      // Task #20: Trigger in-app notification for matching bonus
      try {
        await notifyMatchingEarned({
          userId,
          bonusUsd: decomposition.totalBonusUsd,
          settlementId,
        });
      } catch (notifErr) {
        console.warn('[Notification] Error triggering matching earned notification:', notifErr);
      }
    }

    return {
      id: settlementId,
      publicSettlementId,
      userId,
      businessDate,
      availableLeft,
      availableRight,
      consumedLeft: decomposition.consumedLeft,
      consumedRight: decomposition.consumedRight,
      carryLeftBefore,
      carryRightBefore,
      carryLeftAfter: decomposition.carryLeftAfter,
      carryRightAfter: decomposition.carryRightAfter,
      totalBonusUsd: decomposition.totalBonusUsd,
      status: 'COMPLETED',
      settledAt: settledAt.toISOString(),
      createdAt: settledAt.toISOString(),
      components: decomposition.components,
    };
  } catch (err) {
    await db.query('ROLLBACK');
    console.error(`[BinaryMatching] Error settling user ${userId} for date ${businessDate}:`, err);
    throw err;
  }
}

// ============================================================================
// 4. Authoritative Midnight Settlement Cycle (Global Run Safety)
// ============================================================================

/**
 * Runs the authoritative daily binary matching settlement cycle for a target business date.
 * Typically called at 00:00 Asia/Dhaka for the PREVIOUS business date.
 * 
 * Global Run Safety:
 * - Managed via `binary_settlement_cycles` table.
 * - Only one worker may execute a cycle for a business date at a time.
 * - Idempotent: If already completed, returns existing summary without re-processing.
 */
export async function runDailyMatchingSettlementCycle(
  targetBusinessDate?: string
): Promise<CycleSettlementResult> {
  const startTime = Date.now();
  const db = await getDb();
  const businessDate = targetBusinessDate || getPreviousDhakaBusinessDate();

  // 1. Global run safety lock attempt
  const lockRes = await db.query<{ business_date: string }>(
    `
    INSERT INTO binary_settlement_cycles (business_date, status, started_at)
    VALUES ($1, 'RUNNING', CURRENT_TIMESTAMP)
    ON CONFLICT (business_date) DO NOTHING
    RETURNING business_date
    `,
    [businessDate]
  );

  if (lockRes.rows.length === 0) {
    // A cycle for this date already exists or is running
    const existingCycle = await db.query<{
      business_date: string;
      status: 'RUNNING' | 'COMPLETED' | 'FAILED';
      total_users_settled: number;
      total_bonus_usd: string | number;
      error_message: string | null;
    }>(
      `
      SELECT business_date, status, total_users_settled, total_bonus_usd, error_message
      FROM binary_settlement_cycles
      WHERE business_date = $1
      `,
      [businessDate]
    );

    const cycle = existingCycle.rows[0];
    if (cycle && cycle.status === 'COMPLETED') {
      return {
        businessDate,
        status: 'SKIPPED_ALREADY_COMPLETED',
        usersSettled: Number(cycle.total_users_settled),
        totalBonusUsd: Number(cycle.total_bonus_usd),
        durationMs: Date.now() - startTime,
      };
    }

    if (cycle && cycle.status === 'RUNNING') {
      return {
        businessDate,
        status: 'RUNNING',
        usersSettled: Number(cycle.total_users_settled),
        totalBonusUsd: Number(cycle.total_bonus_usd),
        durationMs: Date.now() - startTime,
        error: 'Another worker is currently executing settlement for this date',
      };
    }
  }

  try {
    // 2. Identify candidate users who have volume activity or carry balance
    const candidatesRes = await db.query<{ user_id: string }>(
      `
      SELECT DISTINCT u.user_id FROM (
        SELECT beneficiary_user_id AS user_id 
        FROM binary_volume_events 
        WHERE status = 'ACTIVE' AND business_date <= $1
        UNION
        SELECT user_id 
        FROM binary_volume_balances 
        WHERE carry_left_units > 0 OR carry_right_units > 0
        UNION
        SELECT user_id 
        FROM binary_daily_volumes 
        WHERE business_date = $1 AND (left_units > 0 OR right_units > 0)
      ) u
      `,
      [businessDate]
    );

    let usersSettled = 0;
    let cycleTotalBonus = 0;

    // 3. Settle each user atomically
    for (const candidate of candidatesRes.rows) {
      const settlement = await settleUserMatchingForDate(db, candidate.user_id, businessDate);
      usersSettled++;
      cycleTotalBonus += settlement.totalBonusUsd;
    }

    // 4. Finalize cycle status in database
    await db.query(
      `
      UPDATE binary_settlement_cycles
      SET
        status = 'COMPLETED',
        total_users_settled = $1,
        total_bonus_usd = $2,
        completed_at = CURRENT_TIMESTAMP
      WHERE business_date = $3
      `,
      [usersSettled, cycleTotalBonus, businessDate]
    );

    return {
      businessDate,
      status: 'COMPLETED',
      usersSettled,
      totalBonusUsd: cycleTotalBonus,
      durationMs: Date.now() - startTime,
    };
  } catch (err: any) {
    console.error(`[BinaryMatching] Daily settlement cycle failed for ${businessDate}:`, err);
    await db.query(
      `
      UPDATE binary_settlement_cycles
      SET status = 'FAILED', error_message = $1
      WHERE business_date = $2
      `,
      [err?.message || 'Unknown error', businessDate]
    );

    return {
      businessDate,
      status: 'FAILED',
      usersSettled: 0,
      totalBonusUsd: 0,
      durationMs: Date.now() - startTime,
      error: err?.message,
    };
  }
}

// ============================================================================
// 5. Authenticated Query APIs
// ============================================================================

/**
 * Returns matching summary for the authenticated user:
 * - todayVolume: Today's left/right sales units
 * - carry: Current carry left/right units
 * - latestSettlement: Most recent completed settlement with matching components
 * - totalMatchingEarnedUsd: Total matching bonus earned to date
 * - nextSettlement: Next 00:00 Asia/Dhaka settlement schedule
 */
export async function getUserMatchingSummary(userId: string): Promise<MatchingSummaryResponse> {
  const db = await getDb();
  const currentDhakaDate = getDhakaBusinessDate();
  const nextDhakaInfo = getNextDhakaMidnightTime();

  // 1. Today's volume
  const todayRes = await db.query<{ left_units: number; right_units: number }>(
    `
    SELECT left_units, right_units
    FROM binary_daily_volumes
    WHERE user_id = $1 AND business_date = $2
    `,
    [userId, currentDhakaDate]
  );

  const todayLeft = Number(todayRes.rows[0]?.left_units || 0);
  const todayRight = Number(todayRes.rows[0]?.right_units || 0);

  // 2. Current carry balance
  const balanceRes = await db.query<{ carry_left_units: number; carry_right_units: number }>(
    `
    SELECT carry_left_units, carry_right_units
    FROM binary_volume_balances
    WHERE user_id = $1
    `,
    [userId]
  );

  const carryLeft = Number(balanceRes.rows[0]?.carry_left_units || 0);
  const carryRight = Number(balanceRes.rows[0]?.carry_right_units || 0);

  // 3. Latest settlement
  const latestRes = await db.query<{
    id: string;
    public_settlement_id: string;
    user_id: string;
    business_date: string | Date;
    available_left_units: number;
    available_right_units: number;
    consumed_left_units: number;
    consumed_right_units: number;
    carry_left_before: number;
    carry_right_before: number;
    carry_left_after: number;
    carry_right_after: number;
    total_bonus_usd: string | number;
    status: 'COMPLETED' | 'REVERSED';
    settled_at: Date;
    created_at: Date;
  }>(
    `
    SELECT *
    FROM binary_matching_settlements
    WHERE user_id = $1 AND status = 'COMPLETED'
    ORDER BY business_date DESC, settled_at DESC
    LIMIT 1
    `,
    [userId]
  );

  let latestSettlement: MatchingSettlementItem | null = null;

  if (latestRes.rows.length > 0) {
    const row = latestRes.rows[0];
    const compRes = await db.query<{
      sequence_no: number;
      tier_units: number;
      left_units: number;
      right_units: number;
      bonus_usd: string | number;
    }>(
      `
      SELECT sequence_no, tier_units, left_units, right_units, bonus_usd
      FROM binary_matching_components
      WHERE settlement_id = $1
      ORDER BY sequence_no ASC
      `,
      [row.id]
    );

    latestSettlement = {
      id: row.id,
      publicSettlementId: row.public_settlement_id,
      userId: row.user_id,
      businessDate: typeof row.business_date === 'string' ? row.business_date.split('T')[0] : new Date(row.business_date).toISOString().split('T')[0],
      availableLeft: Number(row.available_left_units),
      availableRight: Number(row.available_right_units),
      consumedLeft: Number(row.consumed_left_units),
      consumedRight: Number(row.consumed_right_units),
      carryLeftBefore: Number(row.carry_left_before),
      carryRightBefore: Number(row.carry_right_before),
      carryLeftAfter: Number(row.carry_left_after),
      carryRightAfter: Number(row.carry_right_after),
      totalBonusUsd: Number(row.total_bonus_usd),
      status: row.status,
      settledAt: new Date(row.settled_at).toISOString(),
      createdAt: new Date(row.created_at).toISOString(),
      components: compRes.rows.map((c) => ({
        sequenceNo: Number(c.sequence_no),
        tierUnits: Number(c.tier_units),
        leftUnits: Number(c.left_units),
        rightUnits: Number(c.right_units),
        bonusUsd: Number(c.bonus_usd),
      })),
    };
  }

  // 4. Total Matching Bonus Earned (authoritative sum of COMPLETED settlements)
  const totalRes = await db.query<{ total_earned: string | number }>(
    `
    SELECT COALESCE(SUM(total_bonus_usd), 0)::numeric AS total_earned
    FROM binary_matching_settlements
    WHERE user_id = $1 AND status = 'COMPLETED'
    `,
    [userId]
  );

  const totalMatchingEarnedUsd = Number(totalRes.rows[0]?.total_earned || 0);

  // 5. Active Live Matching Configuration & Tiers
  const activeConfig = await getActiveMatchingConfig(db);

  return {
    todayVolume: {
      left: todayLeft,
      right: todayRight,
    },
    carry: {
      left: carryLeft,
      right: carryRight,
    },
    latestSettlement,
    totalMatchingEarnedUsd,
    activeTiers: activeConfig.tiers,
    matchingConfig: {
      matchingEnabled: activeConfig.matchingEnabled,
      dailyMaxPayout: activeConfig.dailyMaxPayout,
      sponsorQualificationRequired: activeConfig.sponsorQualificationRequired,
    },
    nextSettlement: {
      scheduledTime: '18:00 UTC',
      nextSettlementIso: nextDhakaInfo.nextMidnightIso,
      msUntilNext: nextDhakaInfo.msUntilMidnight,
    },
  };
}

/**
 * Returns paginated matching settlements history for the authenticated user,
 * including tier decomposition components for each settlement.
 */
export async function getUserMatchingHistory(
  userId: string,
  page: number = 1,
  limit: number = 10
): Promise<MatchingHistoryResponse> {
  const db = await getDb();
  const safePage = Math.max(1, page);
  const safeLimit = Math.min(100, Math.max(1, limit));
  const offset = (safePage - 1) * safeLimit;

  const countRes = await db.query<{ count: string | number }>(
    `
    SELECT COUNT(*)::int AS count
    FROM binary_matching_settlements
    WHERE user_id = $1
    `,
    [userId]
  );

  const totalCount = Number(countRes.rows[0]?.count || 0);
  const totalPages = Math.ceil(totalCount / safeLimit);

  const settlementsRes = await db.query<{
    id: string;
    public_settlement_id: string;
    user_id: string;
    business_date: string | Date;
    available_left_units: number;
    available_right_units: number;
    consumed_left_units: number;
    consumed_right_units: number;
    carry_left_before: number;
    carry_right_before: number;
    carry_left_after: number;
    carry_right_after: number;
    total_bonus_usd: string | number;
    status: 'COMPLETED' | 'REVERSED';
    settled_at: Date;
    created_at: Date;
  }>(
    `
    SELECT *
    FROM binary_matching_settlements
    WHERE user_id = $1
    ORDER BY business_date DESC, settled_at DESC
    LIMIT $2 OFFSET $3
    `,
    [userId, safeLimit, offset]
  );

  const history: MatchingSettlementItem[] = [];

  for (const row of settlementsRes.rows) {
    const compRes = await db.query<{
      sequence_no: number;
      tier_units: number;
      left_units: number;
      right_units: number;
      bonus_usd: string | number;
    }>(
      `
      SELECT sequence_no, tier_units, left_units, right_units, bonus_usd
      FROM binary_matching_components
      WHERE settlement_id = $1
      ORDER BY sequence_no ASC
      `,
      [row.id]
    );

    history.push({
      id: row.id,
      publicSettlementId: row.public_settlement_id,
      userId: row.user_id,
      businessDate: typeof row.business_date === 'string' ? row.business_date.split('T')[0] : new Date(row.business_date).toISOString().split('T')[0],
      availableLeft: Number(row.available_left_units),
      availableRight: Number(row.available_right_units),
      consumedLeft: Number(row.consumed_left_units),
      consumedRight: Number(row.consumed_right_units),
      carryLeftBefore: Number(row.carry_left_before),
      carryRightBefore: Number(row.carry_right_before),
      carryLeftAfter: Number(row.carry_left_after),
      carryRightAfter: Number(row.carry_right_after),
      totalBonusUsd: Number(row.total_bonus_usd),
      status: row.status,
      settledAt: new Date(row.settled_at).toISOString(),
      createdAt: new Date(row.created_at).toISOString(),
      components: compRes.rows.map((c) => ({
        sequenceNo: Number(c.sequence_no),
        tierUnits: Number(c.tier_units),
        leftUnits: Number(c.left_units),
        rightUnits: Number(c.right_units),
        bonusUsd: Number(c.bonus_usd),
      })),
    });
  }

  return {
    history,
    pagination: {
      page: safePage,
      limit: safeLimit,
      totalCount,
      totalPages,
    },
  };
}

// ============================================================================
// 6. Financial Reversal Foundation
// ============================================================================

/**
 * Reverses a matching settlement for legitimate financial correction.
 * Status: COMPLETED -> REVERSED.
 * Audit history is preserved (no row deletion).
 */
export async function reverseMatchingSettlement(settlementId: string): Promise<boolean> {
  const db = await getDb();
  const res = await db.query<{
    id: string;
    public_settlement_id: string;
    user_id: string;
    total_bonus_usd: string | number;
    business_date: string | Date;
  }>(
    `
    UPDATE binary_matching_settlements
    SET status = 'REVERSED'
    WHERE id = $1 AND status = 'COMPLETED'
    RETURNING id, public_settlement_id, user_id, total_bonus_usd, business_date
    `,
    [settlementId]
  );

  if (res.rows.length === 0) return false;

  const row = res.rows[0];
  const bDate = typeof row.business_date === 'string' ? row.business_date.split('T')[0] : new Date(row.business_date).toISOString().split('T')[0];

  // Post REVERSAL to authoritative financial ledger (Task #13)
  try {
    await postLedgerReversal({
      userId: row.user_id,
      sourceType: 'MATCHING_BONUS',
      sourceId: row.id,
      sourceRef: row.public_settlement_id,
      amount: Number(row.total_bonus_usd),
      description: `Daily Binary Matching Settlement Reversal (${bDate})`,
      createdAt: new Date(),
    });
  } catch (ledgErr) {
    console.warn('[WalletLedger] Error posting matching reversal to ledger:', ledgErr);
  }

  return true;
}

// ============================================================================
// 7. Dynamic Admin Config Update & Audit Trail
// ============================================================================

export interface UpdateMatchingConfigParams {
  matchingEnabled: boolean;
  dailyMaxPayout: number;
  sponsorQualificationRequired: boolean;
  carryForwardBehavior: string;
  effectiveDate: string;
  tiers: MatchingTier[];
}

export async function updateMatchingConfig(
  adminUserId: string,
  params: UpdateMatchingConfigParams
): Promise<BinaryMatchingConfig> {
  const db = await getDb();

  // Load current config to save in audit log
  const currentConfig = await getActiveMatchingConfig(db);

  await db.query('BEGIN');

  try {
    const nextVersion = currentConfig.version + 1;
    const configId = uuidv4();

    // Insert new configuration (prospectively versioned)
    await db.query(
      `
      INSERT INTO binary_matching_config (
        id, matching_enabled, daily_max_payout, sponsor_qualification_required,
        carry_forward_behavior, effective_date, version, tiers_json
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [
        configId,
        params.matchingEnabled,
        params.dailyMaxPayout,
        params.sponsorQualificationRequired,
        params.carryForwardBehavior,
        params.effectiveDate,
        nextVersion,
        JSON.stringify(params.tiers)
      ]
    );

    // Save audit log
    const auditId = uuidv4();
    await db.query(
      `
      INSERT INTO binary_matching_config_audit (
        id, config_id, admin_user_id, old_value_json, new_value_json,
        effective_time, version, created_at
      )
      VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, $6, CURRENT_TIMESTAMP)
      `,
      [
        auditId,
        configId,
        adminUserId,
        JSON.stringify(currentConfig),
        JSON.stringify({
          id: configId,
          matchingEnabled: params.matchingEnabled,
          dailyMaxPayout: params.dailyMaxPayout,
          sponsorQualificationRequired: params.sponsorQualificationRequired,
          carryForwardBehavior: params.carryForwardBehavior,
          effectiveDate: params.effectiveDate,
          version: nextVersion,
          tiers: params.tiers
        }),
        nextVersion
      ]
    );

    await db.query('COMMIT');

    return {
      id: configId,
      matchingEnabled: params.matchingEnabled,
      dailyMaxPayout: params.dailyMaxPayout,
      sponsorQualificationRequired: params.sponsorQualificationRequired,
      carryForwardBehavior: params.carryForwardBehavior,
      effectiveDate: params.effectiveDate,
      version: nextVersion,
      tiers: params.tiers
    };
  } catch (err) {
    await db.query('ROLLBACK');
    console.error('[BinaryMatching] Failed to update matching configuration:', err);
    throw err;
  }
}

export async function getMatchingConfigAuditLogs(): Promise<any[]> {
  const db = await getDb();
  const res = await db.query(
    `
    SELECT a.*, u.public_id as admin_public_id, u.full_name as admin_full_name
    FROM binary_matching_config_audit a
    LEFT JOIN users u ON a.admin_user_id = u.id
    ORDER BY a.created_at DESC
    `
  );
  return res.rows.map(r => ({
    id: r.id,
    configId: r.config_id,
    adminUserId: r.admin_user_id,
    adminPublicId: r.admin_public_id,
    adminFullName: r.admin_full_name,
    oldValue: JSON.parse(r.old_value_json),
    newValue: JSON.parse(r.new_value_json),
    effectiveTime: r.effective_time,
    version: r.version,
    createdAt: r.created_at
  }));
}
