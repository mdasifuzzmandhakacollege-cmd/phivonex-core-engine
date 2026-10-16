import { getDb } from '../db/db';
import { v4 as uuidv4 } from 'uuid';
import { generatePromotionBonusPublicId } from '../utils/idGenerator';
import { postLedgerCredit, postLedgerReversal } from './walletLedgerService';
import { notifyPromotionEarned } from './notificationService';

/**
 * Official Immutable Server-Side Promotion Configuration:
 * 20/20   → $5,000
 * 50/50   → $10,000
 * 100/100 → $50,000
 */
export interface PromotionMilestoneConfig {
  milestone: '20/20' | '50/50' | '100/100';
  unitsRequired: number;
  bonusUsd: number;
}

export const OFFICIAL_PROMOTIONS: readonly PromotionMilestoneConfig[] = [
  { milestone: '20/20', unitsRequired: 20, bonusUsd: 5000 },
  { milestone: '50/50', unitsRequired: 50, bonusUsd: 10000 },
  { milestone: '100/100', unitsRequired: 100, bonusUsd: 50000 },
] as const;

export interface AchievedMilestone {
  id: string;
  publicBonusId: string;
  milestone: '20/20' | '50/50' | '100/100';
  leftUnits: number;
  rightUnits: number;
  amountUsd: number;
  status: 'EARNED' | 'REVERSED';
  qualifiedAt: string;
  createdAt: string;
}

export interface NextMilestoneProgress {
  milestone: '20/20' | '50/50' | '100/100';
  unitsRequired: number;
  bonusUsd: number;
  leftNeeded: number;
  rightNeeded: number;
  progressPct: number;
}

export interface MilestoneDisplayItem {
  milestone: '20/20' | '50/50' | '100/100';
  unitsRequired: number;
  bonusUsd: number;
  achieved: boolean;
  achievedAt: string | null;
  publicBonusId: string | null;
  leftNeeded: number;
  rightNeeded: number;
  progressPct: number;
}

export interface PromotionSummaryResponse {
  currentProgress: {
    leftUnits: number;
    rightUnits: number;
  };
  achievedMilestones: AchievedMilestone[];
  nextMilestone: NextMilestoneProgress | null;
  totalPromotionBonusEarned: number;
  milestones: MilestoneDisplayItem[];
}

/**
 * Evaluates and awards qualified promotion milestone bonuses for a user.
 * 
 * Rules:
 * 1. Promotion qualification uses authoritative LEFT/RIGHT binary volume data only.
 * 2. Sponsor/referral relationship does NOT affect qualification.
 * 3. Promotion bonus is separate from normal Daily Matching Bonus.
 * 4. Each milestone is awarded ONLY ONCE per user (enforced via DB UNIQUE(user_id, milestone)).
 * 5. Re-running evaluations/webhooks is strictly idempotent.
 */
export async function evaluateUserPromotions(userId: string): Promise<PromotionSummaryResponse> {
  const db = await getDb();

  // 1. Calculate authoritative active, non-reversed binary volume units for this user
  const volumeRes = await db.query<{ left_units: number; right_units: number }>(
    `
    SELECT 
      COALESCE(SUM(CASE WHEN side = 'LEFT' THEN volume_units ELSE 0 END), 0)::int AS left_units,
      COALESCE(SUM(CASE WHEN side = 'RIGHT' THEN volume_units ELSE 0 END), 0)::int AS right_units
    FROM binary_volume_events
    WHERE beneficiary_user_id = $1 AND status = 'ACTIVE'
    `,
    [userId]
  );

  const leftUnits = Number(volumeRes.rows[0]?.left_units || 0);
  const rightUnits = Number(volumeRes.rows[0]?.right_units || 0);

  // 2. Fetch existing bonuses for this user
  const existingBonusesRes = await db.query<{
    id: string;
    public_bonus_id: string;
    milestone: '20/20' | '50/50' | '100/100';
    left_units: number;
    right_units: number;
    amount_usd: string | number;
    status: 'EARNED' | 'REVERSED';
    qualified_at: string | Date;
    created_at: string | Date;
  }>(
    `
    SELECT id, public_bonus_id, milestone, left_units, right_units, amount_usd, status, qualified_at, created_at
    FROM promotion_bonuses
    WHERE user_id = $1
    ORDER BY qualified_at ASC
    `,
    [userId]
  );

  const earnedMilestonesSet = new Set<string>();
  for (const row of existingBonusesRes.rows) {
    if (row.status === 'EARNED') {
      earnedMilestonesSet.add(row.milestone);
    }
  }

  // 3. Check each milestone in order; award if qualified and not already awarded
  for (const promo of OFFICIAL_PROMOTIONS) {
    const isQualified = leftUnits >= promo.unitsRequired && rightUnits >= promo.unitsRequired;
    const isAlreadyEarned = earnedMilestonesSet.has(promo.milestone);

    if (isQualified && !isAlreadyEarned) {
      const bonusId = uuidv4();
      const publicBonusId = generatePromotionBonusPublicId();

      // Atomic, idempotent insert
      await db.query(
        `
        INSERT INTO promotion_bonuses (
          id, public_bonus_id, user_id, milestone,
          left_units, right_units, amount_usd, status,
          qualified_at, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'EARNED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT (user_id, milestone) DO NOTHING
        `,
        [
          bonusId,
          publicBonusId,
          userId,
          promo.milestone,
          leftUnits,
          rightUnits,
          promo.bonusUsd,
        ]
      );
    }
  }

  // 4. Reload authoritative promotion records for this user
  const updatedBonusesRes = await db.query<{
    id: string;
    public_bonus_id: string;
    milestone: '20/20' | '50/50' | '100/100';
    left_units: number;
    right_units: number;
    amount_usd: string | number;
    status: 'EARNED' | 'REVERSED';
    qualified_at: string | Date;
    created_at: string | Date;
  }>(
    `
    SELECT id, public_bonus_id, milestone, left_units, right_units, amount_usd, status, qualified_at, created_at
    FROM promotion_bonuses
    WHERE user_id = $1
    ORDER BY qualified_at ASC
    `,
    [userId]
  );

  const achievedMilestones: AchievedMilestone[] = updatedBonusesRes.rows
    .filter((r) => r.status === 'EARNED')
    .map((r) => ({
      id: r.id,
      publicBonusId: r.public_bonus_id,
      milestone: r.milestone,
      leftUnits: Number(r.left_units),
      rightUnits: Number(r.right_units),
      amountUsd: Number(r.amount_usd),
      status: r.status,
      qualifiedAt: r.qualified_at instanceof Date ? r.qualified_at.toISOString() : String(r.qualified_at),
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    }));

  const totalPromotionBonusEarned = achievedMilestones.reduce((acc, m) => acc + m.amountUsd, 0);

  // Post earned promotions to financial ledger (Task #13)
  for (const m of achievedMilestones) {
    try {
      await postLedgerCredit({
        userId,
        sourceType: 'PROMOTION_BONUS',
        sourceId: m.id,
        sourceRef: m.publicBonusId,
        amount: m.amountUsd,
        description: `Promotion Milestone Bonus - ${m.milestone}`,
        createdAt: new Date(m.qualifiedAt),
      });
    } catch (ledgErr) {
      console.warn('[WalletLedger] Error posting promotion to ledger:', ledgErr);
    }

    // Task #20: Trigger in-app notification for promotion bonus (idempotent via sourceId)
    try {
      await notifyPromotionEarned({
        userId,
        bonusUsd: m.amountUsd,
        milestoneTitle: `Milestone ${m.milestone}`,
        bonusId: m.id,
      });
    } catch (notifErr) {
      console.warn('[Notification] Error triggering promotion earned notification:', notifErr);
    }
  }

  // 5. Construct milestone items and determine next milestone
  const achievedMap = new Map<string, AchievedMilestone>();
  for (const m of achievedMilestones) {
    achievedMap.set(m.milestone, m);
  }

  let nextMilestone: NextMilestoneProgress | null = null;
  const milestones: MilestoneDisplayItem[] = [];

  for (const promo of OFFICIAL_PROMOTIONS) {
    const achievedRecord = achievedMap.get(promo.milestone);
    const isAchieved = Boolean(achievedRecord);
    const leftNeeded = Math.max(0, promo.unitsRequired - leftUnits);
    const rightNeeded = Math.max(0, promo.unitsRequired - rightUnits);
    const effectiveUnits = Math.min(leftUnits, rightUnits);
    const progressPct = Math.min(100, Math.floor((effectiveUnits / promo.unitsRequired) * 100));

    milestones.push({
      milestone: promo.milestone,
      unitsRequired: promo.unitsRequired,
      bonusUsd: promo.bonusUsd,
      achieved: isAchieved,
      achievedAt: achievedRecord ? achievedRecord.qualifiedAt : null,
      publicBonusId: achievedRecord ? achievedRecord.publicBonusId : null,
      leftNeeded,
      rightNeeded,
      progressPct,
    });

    if (!isAchieved && !nextMilestone) {
      nextMilestone = {
        milestone: promo.milestone,
        unitsRequired: promo.unitsRequired,
        bonusUsd: promo.bonusUsd,
        leftNeeded,
        rightNeeded,
        progressPct,
      };
    }
  }

  return {
    currentProgress: {
      leftUnits,
      rightUnits,
    },
    achievedMilestones,
    nextMilestone,
    totalPromotionBonusEarned,
    milestones,
  };
}

/**
 * Reverse a promotion bonus for audit/financial correction foundation.
 * Preserves audit record while marking status = 'REVERSED'.
 */
export async function reversePromotionBonus(bonusId: string): Promise<boolean> {
  const db = await getDb();
  const res = await db.query<{
    id: string;
    public_bonus_id: string;
    user_id: string;
    milestone: string;
    amount_usd: string | number;
  }>(
    `
    UPDATE promotion_bonuses
    SET status = 'REVERSED'
    WHERE id = $1 AND status = 'EARNED'
    RETURNING id, public_bonus_id, user_id, milestone, amount_usd
    `,
    [bonusId]
  );

  if (res.rows.length === 0) return false;

  const row = res.rows[0];

  // Post REVERSAL to authoritative financial ledger (Task #13)
  try {
    await postLedgerReversal({
      userId: row.user_id,
      sourceType: 'PROMOTION_BONUS',
      sourceId: row.id,
      sourceRef: row.public_bonus_id,
      amount: Number(row.amount_usd),
      description: `Promotion Milestone Bonus Reversal - ${row.milestone}`,
      createdAt: new Date(),
    });
  } catch (ledgErr) {
    console.warn('[WalletLedger] Error posting promotion reversal to ledger:', ledgErr);
  }

  return true;
}
