import { v4 as uuidv4 } from 'uuid';
import { DatabaseClient, getDb } from '../db/db';
import { generatePromotionBonusPublicId } from '../utils/idGenerator';
import { postLedgerCredit } from './walletLedgerService';
import { notifyPromotionEarned } from './notificationService';

// ============================================================================
// Types and Interfaces
// ============================================================================

export type PromotionRankKey =
  | 'STANDARD'
  | 'NODE_BUILDER'
  | 'NODE_MASTER'
  | 'NODE_CAPTAIN'
  | 'NODE_COMMANDER'
  | 'NODE_AMBASSADOR'
  | 'NODE_TITAN';

export type QualificationType = 'NONE' | 'MATCHING' | 'LEADERSHIP';
export type LegBalanceRule = 'FLEXIBLE' | 'STRICT';
export type PromotionRewardType = 'USDT' | 'NON_CASH';

export interface PromotionRule {
  id: string;
  rankKey: PromotionRankKey;
  rankName: string;
  rankOrder: number;
  qualificationType: QualificationType;
  requiredLeft: number;
  requiredRight: number;
  requiredLeaderRank: PromotionRankKey | null;
  legBalanceRule: LegBalanceRule;
  rewardType: PromotionRewardType;
  rewardUsd: number;
  rewardTitle?: string | null;
  rewardDescription?: string | null;
  rewardDisplayValueUsd?: number | null;
  flushRule: string;
  status: 'ACTIVE' | 'INACTIVE';
  version: number;
  effectiveDate: string;
  achieversCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface UserPromotionEvent {
  id: string;
  publicPromotionId: string;
  userId: string;
  rankKey: PromotionRankKey;
  rankName: string;
  rankOrder: number;
  previousRank: string;
  qualificationType: QualificationType;
  requiredLeft: number;
  requiredRight: number;
  actualLeft: number;
  actualRight: number;
  consumedLeft: number;
  consumedRight: number;
  ruleVersion: number;
  rewardType?: PromotionRewardType;
  rewardUsd: number;
  rewardTitle?: string | null;
  rewardDescription?: string | null;
  rewardDisplayValueUsd?: number | null;
  qualifyingLeaderIds: { leftLeaders: string[]; rightLeaders: string[] } | null;
  status: 'COMPLETED';
  completedAt: string;
  createdAt: string;
}

export interface UserPromotionStateResponse {
  userId: string;
  currentRank: PromotionRankKey;
  currentRankName: string;
  currentRankOrder: number;
  nextRank: PromotionRankKey | null;
  nextRankName: string | null;
  nextRankOrder: number | null;
  qualificationType: QualificationType | null;
  stageProgress: {
    matching?: {
      leftProgress: number;
      rightProgress: number;
      requiredLeft: number;
      requiredRight: number;
      progressPct: number;
      cumulativeConsumedLeft: number;
      cumulativeConsumedRight: number;
      totalActiveVolumeLeft: number;
      totalActiveVolumeRight: number;
    };
    leadership?: {
      leftLeaders: number;
      rightLeaders: number;
      requiredLeft: number;
      requiredRight: number;
      requiredLeaderRank: PromotionRankKey;
      requiredLeaderRankName: string;
      legBalanceRule: LegBalanceRule;
      progressPct: number;
      leftLeaderDetails: Array<{ userId: string; publicId: string; fullName: string }>;
      rightLeaderDetails: Array<{ userId: string; publicId: string; fullName: string }>;
    };
  };
  completedEvents: UserPromotionEvent[];
  ladder: PromotionRule[];
  lastPromotedAt: string | null;
  lastEvaluatedAt: string | null;
}

export interface UserPromotionEvaluationResult {
  promoted: boolean;
  evaluatedRank: PromotionRankKey | null;
  previousRank: PromotionRankKey;
  currentRank: PromotionRankKey;
  reason: string;
  event: UserPromotionEvent | null;
  state: UserPromotionStateResponse;
}

export interface PromotionAuditLogItem {
  id: string;
  userId: string;
  action: string;
  fromRank: string | null;
  toRank: string | null;
  details: any;
  actorType: 'SYSTEM' | 'ADMIN';
  actorId: string | null;
  reason: string | null;
  createdAt: string;
}

// Helper: Public Promotion ID generator
export function generatePublicPromotionId(): string {
  const rand = Math.floor(100000 + Math.random() * 900000);
  return `PRM-RANK-${rand}`;
}

// ============================================================================
// 1. Database Schema Migrations & Initialization
// ============================================================================

export async function ensurePromotionTables(dbClient?: DatabaseClient): Promise<void> {
  const db = dbClient || (await getDb());

  await db.exec(`
    CREATE TABLE IF NOT EXISTS promotion_rules (
      id UUID PRIMARY KEY,
      rank_key VARCHAR(50) UNIQUE NOT NULL,
      rank_name VARCHAR(100) NOT NULL,
      rank_order INTEGER UNIQUE NOT NULL,
      qualification_type VARCHAR(30) NOT NULL,
      required_left INTEGER NOT NULL DEFAULT 0,
      required_right INTEGER NOT NULL DEFAULT 0,
      required_leader_rank VARCHAR(50) NULL,
      leg_balance_rule VARCHAR(30) NOT NULL DEFAULT 'FLEXIBLE',
      reward_usd NUMERIC(12, 2) NOT NULL DEFAULT 0,
      flush_rule VARCHAR(50) NOT NULL DEFAULT 'CONSUME_STAGE_REQUIREMENT',
      status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
      version INTEGER NOT NULL DEFAULT 1,
      effective_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_promotion_states (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
      current_rank VARCHAR(50) NOT NULL DEFAULT 'STANDARD',
      current_rank_order INTEGER NOT NULL DEFAULT 0,
      next_rank VARCHAR(50) NULL DEFAULT 'NODE_BUILDER',
      next_rank_order INTEGER NULL DEFAULT 1,
      cumulative_consumed_left INTEGER NOT NULL DEFAULT 0,
      cumulative_consumed_right INTEGER NOT NULL DEFAULT 0,
      current_stage_left_progress INTEGER NOT NULL DEFAULT 0,
      current_stage_right_progress INTEGER NOT NULL DEFAULT 0,
      current_stage_left_required INTEGER NOT NULL DEFAULT 20,
      current_stage_right_required INTEGER NOT NULL DEFAULT 20,
      current_stage_leaders_left INTEGER NOT NULL DEFAULT 0,
      current_stage_leaders_right INTEGER NOT NULL DEFAULT 0,
      last_evaluated_at TIMESTAMP WITH TIME ZONE NULL,
      last_promoted_at TIMESTAMP WITH TIME ZONE NULL,
      promotion_version INTEGER NOT NULL DEFAULT 1,
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    ALTER TABLE user_promotion_states ALTER COLUMN next_rank_order DROP NOT NULL;

    CREATE TABLE IF NOT EXISTS user_promotion_events (
      id UUID PRIMARY KEY,
      public_promotion_id VARCHAR(50) UNIQUE NOT NULL,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      rank_key VARCHAR(50) NOT NULL,
      rank_name VARCHAR(100) NOT NULL,
      rank_order INTEGER NOT NULL,
      previous_rank VARCHAR(50) NOT NULL,
      qualification_type VARCHAR(30) NOT NULL,
      required_left INTEGER NOT NULL,
      required_right INTEGER NOT NULL,
      actual_left INTEGER NOT NULL,
      actual_right INTEGER NOT NULL,
      consumed_left INTEGER NOT NULL DEFAULT 0,
      consumed_right INTEGER NOT NULL DEFAULT 0,
      rule_version INTEGER NOT NULL DEFAULT 1,
      reward_usd NUMERIC(12, 2) NOT NULL DEFAULT 0,
      qualifying_leader_ids_json TEXT NULL,
      source_matching_references TEXT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'COMPLETED',
      completed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT uq_upe_user_rank UNIQUE (user_id, rank_key)
    );

    CREATE TABLE IF NOT EXISTS promotion_audit_logs (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      action VARCHAR(50) NOT NULL,
      from_rank VARCHAR(50) NULL,
      to_rank VARCHAR(50) NULL,
      details_json TEXT NOT NULL,
      actor_type VARCHAR(20) NOT NULL DEFAULT 'SYSTEM',
      actor_id VARCHAR(100) NULL,
      reason TEXT NULL,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_upe_user_id ON user_promotion_events(user_id);
    CREATE INDEX IF NOT EXISTS idx_upe_rank_key ON user_promotion_events(rank_key);
    CREATE INDEX IF NOT EXISTS idx_ups_user_id ON user_promotion_states(user_id);
    CREATE INDEX IF NOT EXISTS idx_pal_user_id ON promotion_audit_logs(user_id);

    -- Schema upgrades for Non-Cash & Custom Leadership Rewards
    ALTER TABLE promotion_rules ADD COLUMN IF NOT EXISTS reward_type VARCHAR(20) NOT NULL DEFAULT 'USDT';
    ALTER TABLE promotion_rules ADD COLUMN IF NOT EXISTS reward_title VARCHAR(200) NULL;
    ALTER TABLE promotion_rules ADD COLUMN IF NOT EXISTS reward_description TEXT NULL;
    ALTER TABLE promotion_rules ADD COLUMN IF NOT EXISTS reward_display_value_usd NUMERIC(12, 2) NULL;

    ALTER TABLE user_promotion_events ADD COLUMN IF NOT EXISTS reward_type VARCHAR(20) NOT NULL DEFAULT 'USDT';
    ALTER TABLE user_promotion_events ADD COLUMN IF NOT EXISTS reward_title VARCHAR(200) NULL;
    ALTER TABLE user_promotion_events ADD COLUMN IF NOT EXISTS reward_description TEXT NULL;
    ALTER TABLE user_promotion_events ADD COLUMN IF NOT EXISTS reward_display_value_usd NUMERIC(12, 2) NULL;
  `);

  // Seed default 7-stage promotion ladder if empty
  await db.query(`
    INSERT INTO promotion_rules (
      id, rank_key, rank_name, rank_order, qualification_type,
      required_left, required_right, required_leader_rank, leg_balance_rule,
      reward_usd, flush_rule, status, version
    )
    VALUES
      ('a0000000-0000-0000-0000-000000000000', 'STANDARD', 'Standard Member', 0, 'NONE', 0, 0, NULL, 'FLEXIBLE', 0, 'NONE', 'ACTIVE', 1),
      ('a0000000-0000-0000-0000-000000000001', 'NODE_BUILDER', 'Node Builder', 1, 'MATCHING', 20, 20, NULL, 'STRICT', 5000.00, 'CONSUME_STAGE_REQUIREMENT', 'ACTIVE', 1),
      ('a0000000-0000-0000-0000-000000000002', 'NODE_MASTER', 'Node Master', 2, 'MATCHING', 50, 50, NULL, 'STRICT', 10000.00, 'CONSUME_STAGE_REQUIREMENT', 'ACTIVE', 1),
      ('a0000000-0000-0000-0000-000000000003', 'NODE_CAPTAIN', 'Node Captain', 3, 'MATCHING', 100, 100, NULL, 'STRICT', 50000.00, 'CONSUME_STAGE_REQUIREMENT', 'ACTIVE', 1),
      ('a0000000-0000-0000-0000-000000000004', 'NODE_COMMANDER', 'Node Commander', 4, 'LEADERSHIP', 2, 3, 'NODE_CAPTAIN', 'FLEXIBLE', 0, 'NONE', 'ACTIVE', 1),
      ('a0000000-0000-0000-0000-000000000005', 'NODE_AMBASSADOR', 'Node Ambassador', 5, 'LEADERSHIP', 3, 4, 'NODE_COMMANDER', 'FLEXIBLE', 0, 'NONE', 'ACTIVE', 1),
      ('a0000000-0000-0000-0000-000000000006', 'NODE_TITAN', 'Node Titan', 6, 'LEADERSHIP', 4, 5, 'NODE_AMBASSADOR', 'FLEXIBLE', 0, 'NONE', 'ACTIVE', 1)
    ON CONFLICT (rank_key) DO NOTHING;
  `);
}

// ============================================================================
// 2. Promotion Rules Admin & Query Methods
// ============================================================================

export async function getPromotionRules(dbClient?: DatabaseClient): Promise<PromotionRule[]> {
  const db = dbClient || (await getDb());
  await ensurePromotionTables(db);

  const res = await db.query<any>(`
    SELECT 
      pr.id, pr.rank_key, pr.rank_name, pr.rank_order, pr.qualification_type,
      pr.required_left, pr.required_right, pr.required_leader_rank, pr.leg_balance_rule,
      pr.reward_type, pr.reward_usd, pr.reward_title, pr.reward_description, pr.reward_display_value_usd,
      pr.flush_rule, pr.status, pr.version, pr.effective_date,
      pr.created_at, pr.updated_at,
      COUNT(upe.id)::int AS achievers_count
    FROM promotion_rules pr
    LEFT JOIN user_promotion_events upe ON pr.rank_key = upe.rank_key AND upe.status = 'COMPLETED'
    GROUP BY pr.id
    ORDER BY pr.rank_order ASC
  `);

  return res.rows.map((r) => ({
    id: r.id,
    rankKey: r.rank_key,
    rankName: r.rank_name,
    rankOrder: Number(r.rank_order),
    qualificationType: r.qualification_type,
    requiredLeft: Number(r.required_left),
    requiredRight: Number(r.required_right),
    requiredLeaderRank: r.required_leader_rank,
    legBalanceRule: r.leg_balance_rule || 'FLEXIBLE',
    rewardType: (r.reward_type || 'USDT') as PromotionRewardType,
    rewardUsd: Number(r.reward_usd || 0),
    rewardTitle: r.reward_title || null,
    rewardDescription: r.reward_description || null,
    rewardDisplayValueUsd: r.reward_display_value_usd !== null && r.reward_display_value_usd !== undefined ? Number(r.reward_display_value_usd) : null,
    flushRule: r.flush_rule,
    status: r.status,
    version: Number(r.version),
    effectiveDate: r.effective_date instanceof Date ? r.effective_date.toISOString() : String(r.effective_date),
    achieversCount: Number(r.achievers_count || 0),
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at),
  }));
}

export async function updatePromotionRule(
  adminId: string,
  adminPublicId: string,
  ruleId: string,
  updates: {
    requiredLeft?: number;
    requiredRight?: number;
    requiredLeaderRank?: PromotionRankKey | null;
    legBalanceRule?: LegBalanceRule;
    rewardType?: PromotionRewardType;
    rewardUsd?: number;
    rewardTitle?: string | null;
    rewardDescription?: string | null;
    rewardDisplayValueUsd?: number | null;
    status?: 'ACTIVE' | 'INACTIVE';
    expectedVersion?: number;
    reason: string;
  },
  dbClient?: DatabaseClient
): Promise<PromotionRule> {
  const db = dbClient || (await getDb());
  await ensurePromotionTables(db);

  if (!updates.reason || updates.reason.trim().length < 5) {
    const err: any = new Error('Admin reason is mandatory (minimum 5 characters) for prospective rule updates.');
    err.code = 'REASON_REQUIRED';
    err.statusCode = 400;
    throw err;
  }

  // Fetch current rule
  const currentRes = await db.query<any>(`SELECT * FROM promotion_rules WHERE id = $1`, [ruleId]);
  if (currentRes.rows.length === 0) {
    const err: any = new Error('Promotion rule not found.');
    err.code = 'RULE_NOT_FOUND';
    err.statusCode = 404;
    throw err;
  }

  const current = currentRes.rows[0];

  if (updates.expectedVersion !== undefined && Number(current.version) !== Number(updates.expectedVersion)) {
    const err: any = new Error(`Stale version conflict. Rule is at version ${current.version}, but client expected v${updates.expectedVersion}. Please refresh and try again.`);
    err.code = 'VERSION_CONFLICT';
    err.statusCode = 409;
    throw err;
  }

  const newVersion = Number(current.version) + 1;
  const newRequiredLeft = updates.requiredLeft !== undefined ? updates.requiredLeft : current.required_left;
  const newRequiredRight = updates.requiredRight !== undefined ? updates.requiredRight : current.required_right;
  const newRequiredLeaderRank = updates.requiredLeaderRank !== undefined ? updates.requiredLeaderRank : current.required_leader_rank;
  const newLegBalanceRule = updates.legBalanceRule !== undefined ? updates.legBalanceRule : current.leg_balance_rule;
  const newStatus = updates.status !== undefined ? updates.status : current.status;

  const newRewardType: PromotionRewardType = updates.rewardType || (current.reward_type as PromotionRewardType) || 'USDT';
  let newRewardUsd = updates.rewardUsd !== undefined ? Number(updates.rewardUsd) : Number(current.reward_usd || 0);
  let newRewardTitle = updates.rewardTitle !== undefined 
    ? (updates.rewardTitle ? updates.rewardTitle.trim() : null) 
    : (current.reward_title || null);
  let newRewardDescription = updates.rewardDescription !== undefined 
    ? (updates.rewardDescription ? updates.rewardDescription.trim() : null) 
    : (current.reward_description || null);
  let newRewardDisplayValueUsd = updates.rewardDisplayValueUsd !== undefined 
    ? (updates.rewardDisplayValueUsd !== null && updates.rewardDisplayValueUsd !== undefined ? Number(updates.rewardDisplayValueUsd) : null) 
    : (current.reward_display_value_usd !== null && current.reward_display_value_usd !== undefined ? Number(current.reward_display_value_usd) : null);

  if (newRewardType === 'USDT') {
    if (current.rank_order > 0 && (isNaN(newRewardUsd) || newRewardUsd <= 0)) {
      const err: any = new Error('Reward USD amount must be a positive number for USDT reward type.');
      err.code = 'INVALID_REWARD';
      err.statusCode = 400;
      throw err;
    }
  } else if (newRewardType === 'NON_CASH') {
    if (!newRewardTitle || newRewardTitle.length < 3) {
      const err: any = new Error('Reward title is required (minimum 3 characters) for Non-Cash reward type.');
      err.code = 'INVALID_REWARD_TITLE';
      err.statusCode = 400;
      throw err;
    }
    // Non-cash rewards must never result in wallet credit
    newRewardUsd = 0;
  }

  await db.query(
    `
    UPDATE promotion_rules
    SET 
      required_left = $1,
      required_right = $2,
      required_leader_rank = $3,
      leg_balance_rule = $4,
      reward_type = $5,
      reward_usd = $6,
      reward_title = $7,
      reward_description = $8,
      reward_display_value_usd = $9,
      status = $10,
      version = $11,
      effective_date = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $12
    `,
    [
      newRequiredLeft,
      newRequiredRight,
      newRequiredLeaderRank,
      newLegBalanceRule,
      newRewardType,
      newRewardUsd,
      newRewardTitle,
      newRewardDescription,
      newRewardDisplayValueUsd,
      newStatus,
      newVersion,
      ruleId,
    ]
  );

  // Record audit log
  await db.query(
    `
    INSERT INTO promotion_audit_logs (
      id, user_id, action, from_rank, to_rank, details_json, actor_type, actor_id, reason, created_at
    )
    VALUES ($1, $2, 'ADMIN_RULE_UPDATED', $3, $3, $4, 'ADMIN', $5, $6, CURRENT_TIMESTAMP)
    `,
    [
      uuidv4(),
      adminId,
      current.rank_key,
      JSON.stringify({
        ruleId,
        rankKey: current.rank_key,
        oldVersion: current.version,
        newVersion,
        oldSettings: {
          requiredLeft: current.required_left,
          requiredRight: current.required_right,
          requiredLeaderRank: current.required_leader_rank,
          rewardType: current.reward_type || 'USDT',
          rewardUsd: current.reward_usd,
          rewardTitle: current.reward_title || null,
          rewardDescription: current.reward_description || null,
          rewardDisplayValueUsd: current.reward_display_value_usd || null,
          status: current.status,
        },
        newSettings: {
          requiredLeft: newRequiredLeft,
          requiredRight: newRequiredRight,
          requiredLeaderRank: newRequiredLeaderRank,
          rewardType: newRewardType,
          rewardUsd: newRewardUsd,
          rewardTitle: newRewardTitle,
          rewardDescription: newRewardDescription,
          rewardDisplayValueUsd: newRewardDisplayValueUsd,
          status: newStatus,
        },
      }),
      adminPublicId,
      updates.reason,
    ]
  );

  const rules = await getPromotionRules(db);
  return rules.find((r) => r.id === ruleId)!;
}

// ============================================================================
// 3. Tree Traversal & Qualified Downline Leaders Calculation
// ============================================================================

export async function getDownlineLeaderCounts(
  userId: string,
  targetLeaderRank: PromotionRankKey,
  dbClient?: DatabaseClient
): Promise<{
  leftLeaders: number;
  rightLeaders: number;
  leftLeaderDetails: Array<{ userId: string; publicId: string; fullName: string }>;
  rightLeaderDetails: Array<{ userId: string; publicId: string; fullName: string }>;
}> {
  const db = dbClient || (await getDb());
  await ensurePromotionTables(db);

  // Left descendants query
  const leftRes = await db.query<{ user_id: string; public_id: string; full_name: string }>(
    `
    WITH RECURSIVE left_tree AS (
      SELECT user_id, 1 as depth
      FROM binary_placements
      WHERE parent_user_id = $1 AND side = 'LEFT' AND status = 'PLACED'
      UNION ALL
      SELECT bp.user_id, lt.depth + 1
      FROM binary_placements bp
      JOIN left_tree lt ON bp.parent_user_id = lt.user_id
      WHERE bp.status = 'PLACED' AND lt.depth < 1000
    )
    SELECT DISTINCT upe.user_id, u.public_id, u.full_name
    FROM left_tree lt
    JOIN user_promotion_events upe ON lt.user_id = upe.user_id
    JOIN users u ON upe.user_id = u.id
    WHERE upe.rank_key = $2 AND upe.status = 'COMPLETED' AND u.status = 'ACTIVE'
    ORDER BY u.public_id ASC
    `,
    [userId, targetLeaderRank]
  );

  // Right descendants query
  const rightRes = await db.query<{ user_id: string; public_id: string; full_name: string }>(
    `
    WITH RECURSIVE right_tree AS (
      SELECT user_id, 1 as depth
      FROM binary_placements
      WHERE parent_user_id = $1 AND side = 'RIGHT' AND status = 'PLACED'
      UNION ALL
      SELECT bp.user_id, rt.depth + 1
      FROM binary_placements bp
      JOIN right_tree rt ON bp.parent_user_id = rt.user_id
      WHERE bp.status = 'PLACED' AND rt.depth < 1000
    )
    SELECT DISTINCT upe.user_id, u.public_id, u.full_name
    FROM right_tree rt
    JOIN user_promotion_events upe ON rt.user_id = upe.user_id
    JOIN users u ON upe.user_id = u.id
    WHERE upe.rank_key = $2 AND upe.status = 'COMPLETED' AND u.status = 'ACTIVE'
    ORDER BY u.public_id ASC
    `,
    [userId, targetLeaderRank]
  );

  const leftLeaderDetails = leftRes.rows.map((r) => ({
    userId: r.user_id,
    publicId: r.public_id,
    fullName: r.full_name,
  }));

  const rightLeaderDetails = rightRes.rows.map((r) => ({
    userId: r.user_id,
    publicId: r.public_id,
    fullName: r.full_name,
  }));

  return {
    leftLeaders: leftLeaderDetails.length,
    rightLeaders: rightLeaderDetails.length,
    leftLeaderDetails,
    rightLeaderDetails,
  };
}

// ============================================================================
// 4. Authoritative User Promotion State & Progress Query
// ============================================================================

export async function getUserPromotionState(
  userId: string,
  dbClient?: DatabaseClient
): Promise<UserPromotionStateResponse> {
  const db = dbClient || (await getDb());
  await ensurePromotionTables(db);

  // Ensure state row exists
  await db.query(
    `
    INSERT INTO user_promotion_states (
      id, user_id, current_rank, current_rank_order, next_rank, next_rank_order,
      cumulative_consumed_left, cumulative_consumed_right,
      current_stage_left_progress, current_stage_right_progress,
      current_stage_left_required, current_stage_right_required,
      created_at, updated_at
    )
    VALUES ($1, $2, 'STANDARD', 0, 'NODE_BUILDER', 1, 0, 0, 0, 0, 20, 20, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT (user_id) DO NOTHING
    `,
    [uuidv4(), userId]
  );

  const stateRes = await db.query<any>(
    `SELECT * FROM user_promotion_states WHERE user_id = $1`,
    [userId]
  );
  const state = stateRes.rows[0];

  // Fetch ladder rules
  const ladder = await getPromotionRules(db);
  const ruleMap = new Map<string, PromotionRule>();
  for (const r of ladder) {
    ruleMap.set(r.rankKey, r);
  }

  // Fetch completed events
  const eventsRes = await db.query<any>(
    `
    SELECT * FROM user_promotion_events
    WHERE user_id = $1 AND status = 'COMPLETED'
    ORDER BY rank_order ASC, completed_at ASC
    `,
    [userId]
  );

  const completedEvents: UserPromotionEvent[] = eventsRes.rows.map((r) => ({
    id: r.id,
    publicPromotionId: r.public_promotion_id,
    userId: r.user_id,
    rankKey: r.rank_key,
    rankName: r.rank_name,
    rankOrder: Number(r.rank_order),
    previousRank: r.previous_rank,
    qualificationType: r.qualification_type,
    requiredLeft: Number(r.required_left),
    requiredRight: Number(r.required_right),
    actualLeft: Number(r.actual_left),
    actualRight: Number(r.actual_right),
    consumedLeft: Number(r.consumed_left),
    consumedRight: Number(r.consumed_right),
    ruleVersion: Number(r.rule_version),
    rewardType: (r.reward_type || 'USDT') as PromotionRewardType,
    rewardUsd: Number(r.reward_usd || 0),
    rewardTitle: r.reward_title || null,
    rewardDescription: r.reward_description || null,
    rewardDisplayValueUsd: r.reward_display_value_usd !== null && r.reward_display_value_usd !== undefined ? Number(r.reward_display_value_usd) : null,
    qualifyingLeaderIds: r.qualifying_leader_ids_json ? JSON.parse(r.qualifying_leader_ids_json) : null,
    status: 'COMPLETED',
    completedAt: r.completed_at instanceof Date ? r.completed_at.toISOString() : String(r.completed_at),
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  }));

  const currentRule = ruleMap.get(state.current_rank) || {
    rankKey: 'STANDARD' as const,
    rankName: 'Standard Member',
    rankOrder: 0,
  };

  const nextRule = state.next_rank ? ruleMap.get(state.next_rank) : null;

  // Calculate real-time active volume
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
  const totalActiveLeft = Number(volumeRes.rows[0]?.left_units || 0);
  const totalActiveRight = Number(volumeRes.rows[0]?.right_units || 0);

  const consumedLeft = Number(state.cumulative_consumed_left || 0);
  const consumedRight = Number(state.cumulative_consumed_right || 0);

  const stageProgress: UserPromotionStateResponse['stageProgress'] = {};

  if (nextRule && nextRule.qualificationType === 'MATCHING') {
    const stageAvailableLeft = Math.max(0, totalActiveLeft - consumedLeft);
    const stageAvailableRight = Math.max(0, totalActiveRight - consumedRight);
    const reqL = nextRule.requiredLeft;
    const reqR = nextRule.requiredRight;
    const leftProg = Math.min(reqL, stageAvailableLeft);
    const rightProg = Math.min(reqR, stageAvailableRight);
    const pct = Math.min(
      100,
      Math.floor((Math.min(stageAvailableLeft, stageAvailableRight) / Math.max(reqL, reqR)) * 100)
    );

    stageProgress.matching = {
      leftProgress: leftProg,
      rightProgress: rightProg,
      requiredLeft: reqL,
      requiredRight: reqR,
      progressPct: pct,
      cumulativeConsumedLeft: consumedLeft,
      cumulativeConsumedRight: consumedRight,
      totalActiveVolumeLeft: totalActiveLeft,
      totalActiveVolumeRight: totalActiveRight,
    };
  } else if (nextRule && nextRule.qualificationType === 'LEADERSHIP' && nextRule.requiredLeaderRank) {
    const leaderData = await getDownlineLeaderCounts(userId, nextRule.requiredLeaderRank, db);
    const reqL = nextRule.requiredLeft;
    const reqR = nextRule.requiredRight;
    const reqLeaderRule = nextRule.requiredLeaderRank ? ruleMap.get(nextRule.requiredLeaderRank) : null;

    let pct = 0;
    if (nextRule.legBalanceRule === 'FLEXIBLE') {
      const match1 = Math.min(leaderData.leftLeaders / reqL, leaderData.rightLeaders / reqR);
      const match2 = Math.min(leaderData.leftLeaders / reqR, leaderData.rightLeaders / reqL);
      pct = Math.min(100, Math.floor(Math.max(match1, match2) * 100));
    } else {
      pct = Math.min(
        100,
        Math.floor(Math.min(leaderData.leftLeaders / reqL, leaderData.rightLeaders / reqR) * 100)
      );
    }

    stageProgress.leadership = {
      leftLeaders: leaderData.leftLeaders,
      rightLeaders: leaderData.rightLeaders,
      requiredLeft: reqL,
      requiredRight: reqR,
      requiredLeaderRank: nextRule.requiredLeaderRank,
      requiredLeaderRankName: reqLeaderRule?.rankName || nextRule.requiredLeaderRank,
      legBalanceRule: nextRule.legBalanceRule,
      progressPct: isNaN(pct) ? 0 : pct,
      leftLeaderDetails: leaderData.leftLeaderDetails,
      rightLeaderDetails: leaderData.rightLeaderDetails,
    };
  }

  return {
    userId,
    currentRank: state.current_rank,
    currentRankName: currentRule.rankName,
    currentRankOrder: Number(state.current_rank_order),
    nextRank: state.next_rank,
    nextRankName: nextRule?.rankName || null,
    nextRankOrder: state.next_rank_order ? Number(state.next_rank_order) : null,
    qualificationType: nextRule?.qualificationType || null,
    stageProgress,
    completedEvents,
    ladder,
    lastPromotedAt: state.last_promoted_at ? new Date(state.last_promoted_at).toISOString() : null,
    lastEvaluatedAt: state.last_evaluated_at ? new Date(state.last_evaluated_at).toISOString() : null,
  };
}

// ============================================================================
// 5. Authoritative Sequential Promotion Evaluator
// ============================================================================

/**
 * Evaluates the next rank for a user.
 * 
 * Strict Guarantees:
 * 1. Server-authoritative.
 * 2. Sequential: Evaluates ONLY state.next_rank (current_rank_order + 1). Never skips ranks.
 * 3. Volume consumption / flush: Matching volume used for completing a stage is consumed/flushed.
 * 4. Excess volume rule: At most ONE rank completed per evaluation cycle. Stops advancement.
 * 5. Leadership qualification: Only leaders with completed records in user_promotion_events count.
 * 6. Idempotent & Concurrency Safe: Uses FOR UPDATE locking and UNIQUE constraints.
 */
const userEvaluationLocks = new Map<string, Promise<any>>();

export async function evaluateUserRankPromotion(
  userId: string,
  dbClient?: DatabaseClient
): Promise<UserPromotionEvaluationResult> {
  const currentLock = userEvaluationLocks.get(userId) || Promise.resolve();
  let releaseLock: () => void = () => {};
  const nextLock = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });
  userEvaluationLocks.set(userId, currentLock.then(() => nextLock, () => nextLock));

  await currentLock;
  try {
    return await evaluateUserRankPromotionInternal(userId, dbClient);
  } finally {
    releaseLock();
    if (userEvaluationLocks.get(userId) === nextLock) {
      userEvaluationLocks.delete(userId);
    }
  }
}

async function evaluateUserRankPromotionInternal(
  userId: string,
  dbClient?: DatabaseClient
): Promise<UserPromotionEvaluationResult> {
  const db = dbClient || (await getDb());
  await ensurePromotionTables(db);

  // Run inside database transaction for atomic isolation & locking
  await db.query('BEGIN');

  try {
    // 1. Ensure state row exists and lock FOR UPDATE
    await db.query(
      `
      INSERT INTO user_promotion_states (
        id, user_id, current_rank, current_rank_order, next_rank, next_rank_order,
        cumulative_consumed_left, cumulative_consumed_right,
        current_stage_left_progress, current_stage_right_progress,
        current_stage_left_required, current_stage_right_required,
        created_at, updated_at
      )
      VALUES ($1, $2, 'STANDARD', 0, 'NODE_BUILDER', 1, 0, 0, 0, 0, 20, 20, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (user_id) DO NOTHING
      `,
      [uuidv4(), userId]
    );

    const lockedRes = await db.query<any>(
      `SELECT * FROM user_promotion_states WHERE user_id = $1 FOR UPDATE`,
      [userId]
    );
    const state = lockedRes.rows[0];

    const currentRank: PromotionRankKey = state.current_rank;
    const nextRank: PromotionRankKey | null = state.next_rank;
    const currentOrder = Number(state.current_rank_order);
    const nextOrder = state.next_rank_order !== null ? Number(state.next_rank_order) : null;

    // Check if user already reached top rank (NODE TITAN = Rank 6)
    if (!nextRank || nextOrder === null || currentOrder >= 6) {
      await db.query('COMMIT');
      const currentState = await getUserPromotionState(userId, db);
      return {
        promoted: false,
        evaluatedRank: null,
        previousRank: currentRank,
        currentRank,
        reason: 'TOP_RANK_ALREADY_ACHIEVED',
        event: null,
        state: currentState,
      };
    }

    // 2. Fetch the target rule for nextRank
    const ruleRes = await db.query<any>(
      `SELECT * FROM promotion_rules WHERE rank_key = $1 AND status = 'ACTIVE'`,
      [nextRank]
    );

    if (ruleRes.rows.length === 0) {
      await db.query('COMMIT');
      const currentState = await getUserPromotionState(userId, db);
      return {
        promoted: false,
        evaluatedRank: nextRank,
        previousRank: currentRank,
        currentRank,
        reason: `TARGET_RULE_INACTIVE_OR_NOT_FOUND (${nextRank})`,
        event: null,
        state: currentState,
      };
    }

    const targetRule = ruleRes.rows[0];
    const targetOrder = Number(targetRule.rank_order);

    // ANTI-SKIPPING CHECK: targetOrder MUST be exactly currentOrder + 1
    if (targetOrder !== currentOrder + 1) {
      await db.query('ROLLBACK');
      throw new Error(`Integrity violation: Attempted to evaluate non-sequential rank ${nextRank} (order ${targetOrder}) for user at rank ${currentRank} (order ${currentOrder}).`);
    }

    // 3. Verify all lower ranks are completed in user_promotion_events
    if (currentOrder > 0) {
      const lowerCountRes = await db.query<{ count: string | number }>(
        `SELECT COUNT(*)::int AS count FROM user_promotion_events WHERE user_id = $1 AND status = 'COMPLETED' AND rank_order <= $2`,
        [userId, currentOrder]
      );
      if (Number(lowerCountRes.rows[0].count) !== currentOrder) {
        await db.query('ROLLBACK');
        throw new Error(`Sequential integrity violation: User has missing completed previous promotion events.`);
      }
    }

    let isQualified = false;
    let consumedLeft = 0;
    let consumedRight = 0;
    let actualLeft = 0;
    let actualRight = 0;
    let qualifyingLeadersData: any = null;

    // 4. Evaluate qualification according to qualification_type
    if (targetRule.qualification_type === 'MATCHING') {
      // Query lifetime active volume
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
      const totalActiveLeft = Number(volumeRes.rows[0]?.left_units || 0);
      const totalActiveRight = Number(volumeRes.rows[0]?.right_units || 0);

      const cumConsumedLeft = Number(state.cumulative_consumed_left || 0);
      const cumConsumedRight = Number(state.cumulative_consumed_right || 0);

      // Volume available strictly for THIS stage
      actualLeft = Math.max(0, totalActiveLeft - cumConsumedLeft);
      actualRight = Math.max(0, totalActiveRight - cumConsumedRight);

      const reqLeft = Number(targetRule.required_left);
      const reqRight = Number(targetRule.required_right);

      isQualified = actualLeft >= reqLeft && actualRight >= reqRight;

      if (isQualified) {
        consumedLeft = reqLeft;
        consumedRight = reqRight;
      }
    } else if (targetRule.qualification_type === 'LEADERSHIP') {
      const requiredLeaderRank = targetRule.required_leader_rank;
      if (!requiredLeaderRank) {
        await db.query('ROLLBACK');
        throw new Error(`Rule configuration defect: Leadership rank ${nextRank} requires leader rank definition.`);
      }

      const leaderData = await getDownlineLeaderCounts(userId, requiredLeaderRank, db);
      actualLeft = leaderData.leftLeaders;
      actualRight = leaderData.rightLeaders;
      qualifyingLeadersData = {
        leftLeaders: leaderData.leftLeaderDetails.map((l) => l.userId),
        rightLeaders: leaderData.rightLeaderDetails.map((l) => l.userId),
      };

      const reqLeft = Number(targetRule.required_left);
      const reqRight = Number(targetRule.required_right);

      if (targetRule.leg_balance_rule === 'FLEXIBLE') {
        isQualified =
          (actualLeft >= reqLeft && actualRight >= reqRight) ||
          (actualLeft >= reqRight && actualRight >= reqLeft);
      } else {
        isQualified = actualLeft >= reqLeft && actualRight >= reqRight;
      }
    }

    // 5. If NOT qualified: update progress & timestamp, then return
    if (!isQualified) {
      await db.query(
        `
        UPDATE user_promotion_states
        SET 
          current_stage_left_progress = $1,
          current_stage_right_progress = $2,
          last_evaluated_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $3
        `,
        [actualLeft, actualRight, userId]
      );

      await db.query(
        `
        INSERT INTO promotion_audit_logs (
          id, user_id, action, from_rank, to_rank, details_json, actor_type, reason, created_at
        )
        VALUES ($1, $2, 'EVALUATION_INCOMPLETE', $3, $4, $5, 'SYSTEM', 'Requirements not yet met', CURRENT_TIMESTAMP)
        `,
        [
          uuidv4(),
          userId,
          currentRank,
          nextRank,
          JSON.stringify({
            actualLeft,
            actualRight,
            requiredLeft: targetRule.required_left,
            requiredRight: targetRule.required_right,
            qualificationType: targetRule.qualification_type,
          }),
        ]
      );

      await db.query('COMMIT');
      const currentState = await getUserPromotionState(userId, db);
      return {
        promoted: false,
        evaluatedRank: nextRank,
        previousRank: currentRank,
        currentRank,
        reason: 'QUALIFICATION_INCOMPLETE',
        event: null,
        state: currentState,
      };
    }

    // 6. IS QUALIFIED: Grant exactly THIS single rank
    const eventId = uuidv4();
    const publicPromotionId = generatePublicPromotionId();
    const rewardType: PromotionRewardType = (targetRule.reward_type || 'USDT') as PromotionRewardType;
    const rewardUsd = rewardType === 'NON_CASH' ? 0 : Number(targetRule.reward_usd || 0);
    const rewardTitle = targetRule.reward_title || null;
    const rewardDescription = targetRule.reward_description || null;
    const rewardDisplayValueUsd = targetRule.reward_display_value_usd !== null && targetRule.reward_display_value_usd !== undefined ? Number(targetRule.reward_display_value_usd) : null;
    const ruleVersion = Number(targetRule.version || 1);

    // Insert completed promotion event (Idempotent via UNIQUE(user_id, rank_key))
    const insertEventRes = await db.query(
      `
      INSERT INTO user_promotion_events (
        id, public_promotion_id, user_id, rank_key, rank_name, rank_order,
        previous_rank, qualification_type, required_left, required_right,
        actual_left, actual_right, consumed_left, consumed_right,
        rule_version, reward_type, reward_usd, reward_title, reward_description, reward_display_value_usd,
        qualifying_leader_ids_json, source_matching_references,
        status, completed_at, created_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10,
        $11, $12, $13, $14,
        $15, $16, $17, $18, $19, $20,
        $21, $22,
        'COMPLETED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      ON CONFLICT (user_id, rank_key) DO NOTHING
      RETURNING *
      `,
      [
        eventId,
        publicPromotionId,
        userId,
        targetRule.rank_key,
        targetRule.rank_name,
        targetOrder,
        currentRank,
        targetRule.qualification_type,
        targetRule.required_left,
        targetRule.required_right,
        actualLeft,
        actualRight,
        consumedLeft,
        consumedRight,
        ruleVersion,
        rewardType,
        rewardUsd,
        rewardTitle,
        rewardDescription,
        rewardDisplayValueUsd,
        qualifyingLeadersData ? JSON.stringify(qualifyingLeadersData) : null,
        JSON.stringify({
          evaluatedAt: new Date().toISOString(),
          qualificationType: targetRule.qualification_type,
          consumedLeft,
          consumedRight,
        }),
      ]
    );

    // If already inserted by a concurrent thread, rollback and return
    if (insertEventRes.rows.length === 0) {
      await db.query('ROLLBACK');
      const currentState = await getUserPromotionState(userId, db);
      return {
        promoted: false,
        evaluatedRank: nextRank,
        previousRank: currentRank,
        currentRank: currentState.currentRank,
        reason: 'ALREADY_PROMOTED_CONCURRENTLY',
        event: null,
        state: currentState,
      };
    }

    const createdEventRow = insertEventRes.rows[0];

    // Determine the next rank in ladder (order = targetOrder + 1)
    const nextLadderRes = await db.query<any>(
      `SELECT * FROM promotion_rules WHERE rank_order = $1 AND status = 'ACTIVE'`,
      [targetOrder + 1]
    );

    const newNextRule = nextLadderRes.rows.length > 0 ? nextLadderRes.rows[0] : null;
    const newNextRank = newNextRule ? newNextRule.rank_key : null;
    const newNextOrder = newNextRule ? Number(newNextRule.rank_order) : null;
    const newReqLeft = newNextRule ? Number(newNextRule.required_left) : 0;
    const newReqRight = newNextRule ? Number(newNextRule.required_right) : 0;

    const newCumConsumedLeft = Number(state.cumulative_consumed_left || 0) + consumedLeft;
    const newCumConsumedRight = Number(state.cumulative_consumed_right || 0) + consumedRight;

    // Update user promotion state
    await db.query(
      `
      UPDATE user_promotion_states
      SET 
        current_rank = $1,
        current_rank_order = $2,
        next_rank = $3,
        next_rank_order = $4,
        cumulative_consumed_left = $5,
        cumulative_consumed_right = $6,
        current_stage_left_required = $7,
        current_stage_right_required = $8,
        current_stage_left_progress = 0,
        current_stage_right_progress = 0,
        last_promoted_at = CURRENT_TIMESTAMP,
        last_evaluated_at = CURRENT_TIMESTAMP,
        promotion_version = $9,
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $10
      `,
      [
        targetRule.rank_key,
        targetOrder,
        newNextRank,
        newNextOrder,
        newCumConsumedLeft,
        newCumConsumedRight,
        newReqLeft,
        newReqRight,
        ruleVersion,
        userId,
      ]
    );

    // Record audit log
    await db.query(
      `
      INSERT INTO promotion_audit_logs (
        id, user_id, action, from_rank, to_rank, details_json, actor_type, reason, created_at
      )
      VALUES ($1, $2, 'RANK_COMPLETED', $3, $4, $5, 'SYSTEM', 'Promotion requirements verified and completed', CURRENT_TIMESTAMP)
      `,
      [
        uuidv4(),
        userId,
        currentRank,
        targetRule.rank_key,
        JSON.stringify({
          eventId,
          publicPromotionId,
          rankKey: targetRule.rank_key,
          rankName: targetRule.rank_name,
          rankOrder: targetOrder,
          consumedLeft,
          consumedRight,
          cumulativeConsumedLeft: newCumConsumedLeft,
          cumulativeConsumedRight: newCumConsumedRight,
          nextRank: newNextRank,
          rewardUsd,
          ruleVersion,
        }),
      ]
    );

    // Optional milestone reward credit & Task #12/13 integration
    if (rewardType === 'USDT' && rewardUsd > 0) {
      let milestoneKey: string = `RANK_${targetOrder}`;
      if (targetRule.rank_key === 'NODE_BUILDER') milestoneKey = '20/20';
      else if (targetRule.rank_key === 'NODE_MASTER') milestoneKey = '50/50';
      else if (targetRule.rank_key === 'NODE_CAPTAIN') milestoneKey = '100/100';

      try {
        const bonusId = uuidv4();
        const publicBonusId = generatePromotionBonusPublicId();
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
          [bonusId, publicBonusId, userId, milestoneKey, consumedLeft, consumedRight, rewardUsd]
        );

        await postLedgerCredit({
          userId,
          sourceType: 'PROMOTION_BONUS',
          sourceId: bonusId,
          sourceRef: publicBonusId,
          amount: rewardUsd,
          description: `Promotion Milestone Bonus - ${milestoneKey} (${targetRule.rank_name})`,
          createdAt: new Date(),
          dbClient: db,
        }).catch((err) => {
          console.warn('[LeadershipRankService] Ledger credit posting notice:', err);
        });
      } catch (bonusErr) {
        console.warn('[LeadershipRankService] Error recording milestone bonus:', bonusErr);
      }
    }

    // Trigger Notification
    try {
      if (rewardType === 'NON_CASH') {
        await notifyPromotionEarned({
          userId,
          bonusUsd: 0,
          milestoneTitle: `${targetRule.rank_name} Rank Achieved: ${rewardTitle || 'Non-Cash Entitlement'}`,
          bonusId: eventId,
        });
      } else {
        await notifyPromotionEarned({
          userId,
          bonusUsd: rewardUsd,
          milestoneTitle: `${targetRule.rank_name} Rank Achieved`,
          bonusId: eventId,
        });
      }
    } catch (notifErr) {
      // non-blocking
    }

    // Commit transaction: STOP advancement for this evaluation cycle (EXCESS VOLUME RULE)
    await db.query('COMMIT');

    const updatedState = await getUserPromotionState(userId, db);
    const eventResult: UserPromotionEvent = {
      id: createdEventRow.id,
      publicPromotionId: createdEventRow.public_promotion_id,
      userId: createdEventRow.user_id,
      rankKey: createdEventRow.rank_key,
      rankName: createdEventRow.rank_name,
      rankOrder: Number(createdEventRow.rank_order),
      previousRank: createdEventRow.previous_rank,
      qualificationType: createdEventRow.qualification_type,
      requiredLeft: Number(createdEventRow.required_left),
      requiredRight: Number(createdEventRow.required_right),
      actualLeft: Number(createdEventRow.actual_left),
      actualRight: Number(createdEventRow.actual_right),
      consumedLeft: Number(createdEventRow.consumed_left),
      consumedRight: Number(createdEventRow.consumed_right),
      ruleVersion: Number(createdEventRow.rule_version),
      rewardType: (createdEventRow.reward_type || 'USDT') as PromotionRewardType,
      rewardUsd: Number(createdEventRow.reward_usd || 0),
      rewardTitle: createdEventRow.reward_title || null,
      rewardDescription: createdEventRow.reward_description || null,
      rewardDisplayValueUsd: createdEventRow.reward_display_value_usd !== null && createdEventRow.reward_display_value_usd !== undefined ? Number(createdEventRow.reward_display_value_usd) : null,
      qualifyingLeaderIds: createdEventRow.qualifying_leader_ids_json
        ? JSON.parse(createdEventRow.qualifying_leader_ids_json)
        : null,
      status: 'COMPLETED',
      completedAt: new Date(createdEventRow.completed_at).toISOString(),
      createdAt: new Date(createdEventRow.created_at).toISOString(),
    };

    return {
      promoted: true,
      evaluatedRank: targetRule.rank_key,
      previousRank: currentRank,
      currentRank: targetRule.rank_key,
      reason: 'PROMOTION_SUCCESS',
      event: eventResult,
      state: updatedState,
    };
  } catch (err) {
    await db.query('ROLLBACK');
    throw err;
  }
}

// ============================================================================
// 6. Admin User Inspection, Audit Logs & Audited Manual Adjustment
// ============================================================================

export async function getUserPromotionAuditLogs(
  userId: string,
  dbClient?: DatabaseClient
): Promise<PromotionAuditLogItem[]> {
  const db = dbClient || (await getDb());
  await ensurePromotionTables(db);

  const res = await db.query<any>(
    `
    SELECT * FROM promotion_audit_logs
    WHERE user_id = $1
    ORDER BY created_at DESC
    LIMIT 100
    `,
    [userId]
  );

  return res.rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    action: r.action,
    fromRank: r.from_rank,
    toRank: r.to_rank,
    details: JSON.parse(r.details_json || '{}'),
    actorType: r.actor_type,
    actorId: r.actor_id,
    reason: r.reason,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  }));
}

export async function adminManualRankCorrection(
  adminId: string,
  adminPublicId: string,
  userId: string,
  targetRankKey: PromotionRankKey,
  reason: string,
  dbClient?: DatabaseClient
): Promise<UserPromotionStateResponse> {
  const db = dbClient || (await getDb());
  await ensurePromotionTables(db);

  if (!reason || reason.trim().length < 5) {
    const err: any = new Error('Admin reason is mandatory (minimum 5 characters) for rank corrections.');
    err.code = 'REASON_REQUIRED';
    err.statusCode = 400;
    throw err;
  }

  const ladder = await getPromotionRules(db);
  const targetRule = ladder.find((r) => r.rankKey === targetRankKey);
  if (!targetRule) {
    const err: any = new Error(`Target rank ${targetRankKey} does not exist in promotion ladder.`);
    err.code = 'INVALID_RANK';
    err.statusCode = 400;
    throw err;
  }

  const currentState = await getUserPromotionState(userId, db);
  const fromRank = currentState.currentRank;

  await db.query('BEGIN');
  try {
    // Determine next rule
    const nextRule = ladder.find((r) => r.rankOrder === targetRule.rankOrder + 1);

    // Update state
    await db.query(
      `
      UPDATE user_promotion_states
      SET 
        current_rank = $1,
        current_rank_order = $2,
        next_rank = $3,
        next_rank_order = $4,
        last_promoted_at = CURRENT_TIMESTAMP,
        last_evaluated_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $5
      `,
      [
        targetRule.rankKey,
        targetRule.rankOrder,
        nextRule ? nextRule.rankKey : null,
        nextRule ? nextRule.rankOrder : null,
        userId,
      ]
    );

    // Audit log
    await db.query(
      `
      INSERT INTO promotion_audit_logs (
        id, user_id, action, from_rank, to_rank, details_json, actor_type, actor_id, reason, created_at
      )
      VALUES ($1, $2, 'ADMIN_MANUAL_ADJUSTMENT', $3, $4, $5, 'ADMIN', $6, $7, CURRENT_TIMESTAMP)
      `,
      [
        uuidv4(),
        userId,
        fromRank,
        targetRule.rankKey,
        JSON.stringify({
          fromRank,
          toRank: targetRule.rankKey,
          targetOrder: targetRule.rankOrder,
          adminPublicId,
          timestamp: new Date().toISOString(),
        }),
        adminPublicId,
        reason,
      ]
    );

    await db.query('COMMIT');
    return await getUserPromotionState(userId, db);
  } catch (err) {
    await db.query('ROLLBACK');
    throw err;
  }
}
