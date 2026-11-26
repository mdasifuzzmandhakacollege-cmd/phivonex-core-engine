import crypto from 'crypto';
import { DatabaseClient, getDb } from '../db/db';

// ============================================================================
// Types & Interfaces for PHIVONEX Canonical Master Configurations (TASK-03)
// ============================================================================

export type TradingTierCode = 'ALPHA_CORE' | 'ALPHA_PRIME' | 'ALPHA_SOVEREIGN';
export type ChronoVaultPlanCode = 'CHRONO_200D' | 'CHRONO_1Y' | 'CHRONO_2Y' | 'CHRONO_5Y' | 'CHRONO_10Y';
export type WithdrawalCircuitMode = 'AUTO' | 'MANUAL_REVIEW' | 'PAUSED_OFF';
export type SecurityAuditSeverity = 'INFO' | 'WARN' | 'CRITICAL';

export type EcosystemFeatureSwitchKey =
  | 'quantum_alpha_subscriptions_enabled'
  | 'quantum_alpha_yield_enabled'
  | 'chrono_vaults_subscriptions_enabled'
  | 'chrono_vaults_yield_enabled'
  | 'genesis_node_purchase_enabled'
  | 'genesis_node_emission_enabled'
  | 'phivo_instant_swap_enabled'
  | 'unilevel_royalty_engine_enabled'
  | 'leadership_rank_engine_enabled'
  | 'internal_compounding_enabled'
  | 'bep20_deposits_enabled'
  | 'p2p_internal_transfers_enabled';

export const ECOSYSTEM_FEATURE_SWITCH_KEYS: readonly EcosystemFeatureSwitchKey[] = [
  'quantum_alpha_subscriptions_enabled',
  'quantum_alpha_yield_enabled',
  'chrono_vaults_subscriptions_enabled',
  'chrono_vaults_yield_enabled',
  'genesis_node_purchase_enabled',
  'genesis_node_emission_enabled',
  'phivo_instant_swap_enabled',
  'unilevel_royalty_engine_enabled',
  'leadership_rank_engine_enabled',
  'internal_compounding_enabled',
  'bep20_deposits_enabled',
  'p2p_internal_transfers_enabled',
] as const;

export interface EcosystemFeatureSwitchRecord {
  switchKey: EcosystemFeatureSwitchKey;
  isEnabled: boolean;
  category: 'PRODUCTS' | 'YIELD' | 'AFFILIATE' | 'TREASURY' | string;
  label: string;
  description: string | null;
  updatedByAdminId: string | null;
  updatedAt: string;
}

export type EcosystemFeatureSwitchesMap = Record<EcosystemFeatureSwitchKey, boolean>;

export interface GenesisCoreEconomicsSnapshot {
  genesisNodeCap: number;
  nodeBasePriceUsd: number;
  nodeDailyEmissionPhivo: number;
  phivoReferencePriceUsd: number;
  swapEnabled: boolean;
}

export interface TradingPoolTierConfig {
  id: string;
  tierCode: TradingTierCode;
  tierName: string;
  minAmount: string;
  maxAmount: string | null;
  minDailyRatePct: string;
  maxDailyRatePct: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DailyTradingYieldRateRecord {
  id: string;
  tradingDate: string;
  tierId: string;
  tierCode: TradingTierCode;
  tierName: string;
  yieldRatePct: string;
  setByAdminId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChronoVaultPlanConfig {
  id: string;
  planCode: ChronoVaultPlanCode;
  planName: string;
  durationDays: number;
  dailyRatePct: string;
  minAmount: string;
  returnPrincipalOnMaturity: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UnilevelGenerationConfig {
  generationLevel: number;
  commissionPct: string;
  requiredDirectActiveReferrals: number;
  requiredPersonalActiveUsd: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UnilevelLeadershipRankConfig {
  id: string;
  rankLevel: number;
  rankCode: string;
  rankName: string;
  requiredPersonalVolumeUsd: string;
  requiredTeamVolumeUsd: string;
  maxSingleLegCapPct: string;
  requiredDirectActiveLegs: number;
  requiredSubRankCode: string | null;
  requiredSubRankLegs: number;
  milestoneBonusUsd: string;
  globalPoolSharePct: string;
  rewardDescription: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SystemCircuitBreakerConfig {
  id: number;
  minReserveRatio: string;
  maxHourlyOutflowUsd: string;
  maxUserDailyWithdrawalUsd: string;
  withdrawalMode: WithdrawalCircuitMode;
  tripReason: string | null;
  trippedAt: string | null;
  updatedAt: string;
}

export interface SecurityAuditLogRecord {
  id: string;
  traceId: string;
  actorUserId: string | null;
  actionType: string;
  severity: SecurityAuditSeverity;
  payload: Record<string, any>;
  createdAt: string;
}

export interface EcosystemMasterConfigResponse {
  featureSwitches: EcosystemFeatureSwitchRecord[];
  featureSwitchesMap: EcosystemFeatureSwitchesMap;
  genesisCoreEconomics: GenesisCoreEconomicsSnapshot;
  alphaRedemptionFeePct: string;
  p2pTransferFeePct: string;
  tradingPoolTiers: TradingPoolTierConfig[];
  dailyTradingYieldRates: DailyTradingYieldRateRecord[];
  chronoVaultPlans: ChronoVaultPlanConfig[];
  unilevelGenerations: UnilevelGenerationConfig[];
  totalUnilevelCommissionPct: string;
  leadershipRanks: UnilevelLeadershipRankConfig[];
  circuitBreaker: SystemCircuitBreakerConfig;
  recentSecurityAuditLogs: SecurityAuditLogRecord[];
}

// ============================================================================
// Decimal & Validation Helpers (NUMERIC(20,8))
// ============================================================================

export function formatNumeric8(value: number | string): string {
  const num = typeof value === 'string' ? Number(value.trim()) : value;
  if (!Number.isFinite(num)) {
    throw new Error(`INVALID_NUMERIC_VALUE: "${value}" is not a valid finite decimal number.`);
  }
  return num.toFixed(8);
}

function validateIsoDate(dateStr: string): string {
  const trimmed = (dateStr || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new Error(`INVALID_DATE_FORMAT: "${dateStr}" must be in YYYY-MM-DD format.`);
  }
  const parsed = new Date(`${trimmed}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`INVALID_DATE_VALUE: "${dateStr}" is not a valid calendar date.`);
  }
  return trimmed;
}

export async function recordSecurityAuditLog(
  client: DatabaseClient,
  params: {
    traceId?: string;
    actorUserId?: string | null;
    actionType: string;
    severity?: SecurityAuditSeverity;
    payload: Record<string, any>;
  }
): Promise<SecurityAuditLogRecord> {
  const traceId = params.traceId?.trim() || `trc_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const severity: SecurityAuditSeverity = params.severity || 'INFO';
  const actorUserId = params.actorUserId || null;

  const res = await client.query<{
    id: string;
    trace_id: string;
    actor_user_id: string | null;
    action_type: string;
    severity: SecurityAuditSeverity;
    payload: any;
    created_at: string;
  }>(
    `
    INSERT INTO security_audit_logs (trace_id, actor_user_id, action_type, severity, payload, created_at)
    VALUES ($1, $2, $3, $4, $5::jsonb, NOW())
    RETURNING id, trace_id, actor_user_id, action_type, severity, payload, created_at
    `,
    [traceId, actorUserId, params.actionType, severity, JSON.stringify(params.payload || {})]
  );

  const row = res.rows[0];
  return {
    id: row.id,
    traceId: row.trace_id,
    actorUserId: row.actor_user_id,
    actionType: row.action_type,
    severity: row.severity,
    payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

// ============================================================================
// Row Mappers
// ============================================================================

function mapTradingTierRow(r: any): TradingPoolTierConfig {
  return {
    id: r.id,
    tierCode: r.tier_code,
    tierName: r.tier_name,
    minAmount: formatNumeric8(r.min_amount),
    maxAmount: r.max_amount !== null && r.max_amount !== undefined ? formatNumeric8(r.max_amount) : null,
    minDailyRatePct: formatNumeric8(r.min_daily_rate_pct),
    maxDailyRatePct: formatNumeric8(r.max_daily_rate_pct),
    isActive: Boolean(r.is_active),
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
  };
}

function mapChronoVaultPlanRow(r: any): ChronoVaultPlanConfig {
  return {
    id: r.id,
    planCode: r.plan_code,
    planName: r.plan_name,
    durationDays: Number(r.duration_days),
    dailyRatePct: formatNumeric8(r.daily_rate_pct),
    minAmount: formatNumeric8(r.min_amount),
    returnPrincipalOnMaturity: Boolean(r.return_principal_on_maturity),
    isActive: Boolean(r.is_active),
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
  };
}

function mapUnilevelGenerationRow(r: any): UnilevelGenerationConfig {
  return {
    generationLevel: Number(r.generation_level),
    commissionPct: formatNumeric8(r.commission_pct),
    requiredDirectActiveReferrals: Number(r.required_direct_active_referrals),
    requiredPersonalActiveUsd: formatNumeric8(r.required_personal_active_usd),
    isActive: Boolean(r.is_active),
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
  };
}

function mapLeadershipRankRow(r: any): UnilevelLeadershipRankConfig {
  return {
    id: r.id,
    rankLevel: Number(r.rank_level),
    rankCode: r.rank_code,
    rankName: r.rank_name,
    requiredPersonalVolumeUsd: formatNumeric8(r.required_personal_volume_usd),
    requiredTeamVolumeUsd: formatNumeric8(r.required_team_volume_usd),
    maxSingleLegCapPct: formatNumeric8(r.max_single_leg_cap_pct),
    requiredDirectActiveLegs: Number(r.required_direct_active_legs),
    requiredSubRankCode: r.required_sub_rank_code || null,
    requiredSubRankLegs: Number(r.required_sub_rank_legs || 0),
    milestoneBonusUsd: formatNumeric8(r.milestone_bonus_usd),
    globalPoolSharePct: formatNumeric8(r.global_pool_share_pct),
    rewardDescription: r.reward_description || null,
    isActive: Boolean(r.is_active),
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
  };
}

function mapCircuitBreakerRow(r: any): SystemCircuitBreakerConfig {
  return {
    id: Number(r.id),
    minReserveRatio: formatNumeric8(r.min_reserve_ratio),
    maxHourlyOutflowUsd: formatNumeric8(r.max_hourly_outflow_usd),
    maxUserDailyWithdrawalUsd: formatNumeric8(r.max_user_daily_withdrawal_usd),
    withdrawalMode: r.withdrawal_mode as WithdrawalCircuitMode,
    tripReason: r.trip_reason || null,
    trippedAt: r.tripped_at ? new Date(r.tripped_at).toISOString() : null,
    updatedAt: new Date(r.updated_at).toISOString(),
  };
}

function mapFeatureSwitchRow(r: any): EcosystemFeatureSwitchRecord {
  return {
    switchKey: r.switch_key as EcosystemFeatureSwitchKey,
    isEnabled: Boolean(r.is_enabled),
    category: String(r.category || 'PRODUCTS'),
    label: String(r.label || r.switch_key),
    description: r.description || null,
    updatedByAdminId: r.updated_by_admin_id || null,
    updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : new Date().toISOString(),
  };
}

function buildDefaultFeatureSwitchesMap(): EcosystemFeatureSwitchesMap {
  return {
    quantum_alpha_subscriptions_enabled: true,
    quantum_alpha_yield_enabled: true,
    chrono_vaults_subscriptions_enabled: true,
    chrono_vaults_yield_enabled: true,
    genesis_node_purchase_enabled: true,
    genesis_node_emission_enabled: true,
    phivo_instant_swap_enabled: true,
    unilevel_royalty_engine_enabled: true,
    leadership_rank_engine_enabled: true,
    internal_compounding_enabled: true,
    bep20_deposits_enabled: true,
    p2p_internal_transfers_enabled: true,
  };
}

// ============================================================================
// 0. Master Ecosystem Feature Switches (11 Live ON/OFF Governance Controls)
// ============================================================================

export async function getEcosystemFeatureSwitches(
  dbClient?: DatabaseClient
): Promise<EcosystemFeatureSwitchRecord[]> {
  const db = dbClient || (await getDb());
  try {
    const res = await db.query(
      `
      SELECT switch_key, is_enabled, category, label, description, updated_by_admin_id, updated_at
      FROM ecosystem_feature_switches
      ORDER BY
        CASE category
          WHEN 'PRODUCTS' THEN 1
          WHEN 'YIELD' THEN 2
          WHEN 'AFFILIATE' THEN 3
          WHEN 'TREASURY' THEN 4
          ELSE 5
        END,
        switch_key ASC
      `
    );
    return res.rows.map(mapFeatureSwitchRow);
  } catch (err: any) {
    // Graceful fallback if table hasn't been migrated yet
    if (err?.code === '42P01') {
      return [];
    }
    throw err;
  }
}

export async function getEcosystemFeatureSwitchesMap(
  dbClient?: DatabaseClient
): Promise<EcosystemFeatureSwitchesMap> {
  const map = buildDefaultFeatureSwitchesMap();
  const rows = await getEcosystemFeatureSwitches(dbClient);
  for (const row of rows) {
    if (row.switchKey in map) {
      map[row.switchKey] = row.isEnabled;
    }
  }
  return map;
}

export async function isFeatureSwitchEnabled(
  switchKey: EcosystemFeatureSwitchKey,
  dbClient?: DatabaseClient
): Promise<boolean> {
  const db = dbClient || (await getDb());
  try {
    const res = await db.query<{ is_enabled: boolean }>(
      `SELECT is_enabled FROM ecosystem_feature_switches WHERE switch_key = $1 LIMIT 1`,
      [switchKey]
    );
    if (res.rowCount === 0) {
      return true;
    }
    return Boolean(res.rows[0].is_enabled);
  } catch (err: any) {
    if (err?.code === '42P01') {
      return true;
    }
    throw err;
  }
}

export async function assertFeatureSwitchEnabled(
  switchKey: EcosystemFeatureSwitchKey,
  moduleName: string,
  dbClient?: DatabaseClient
): Promise<void> {
  const enabled = await isFeatureSwitchEnabled(switchKey, dbClient);
  if (!enabled) {
    const err: any = new Error(
      `MODULE_PAUSED: Module Temporarily Paused by Protocol Governance — ${moduleName} is currently disabled by administration.`
    );
    err.code = 'MODULE_PAUSED';
    err.switchKey = switchKey;
    err.statusCode = 403;
    throw err;
  }
}

export async function updateEcosystemFeatureSwitch(
  params: {
    switchKey: EcosystemFeatureSwitchKey;
    isEnabled: boolean;
    reason?: string | null;
    adminUserId?: string | null;
    traceId?: string;
  },
  dbClient?: DatabaseClient
): Promise<EcosystemFeatureSwitchRecord> {
  if (!ECOSYSTEM_FEATURE_SWITCH_KEYS.includes(params.switchKey)) {
    throw new Error(
      `INVALID_FEATURE_SWITCH: Unknown feature switch "${params.switchKey}".`
    );
  }

  const db = dbClient || (await getDb());
  const nextState = Boolean(params.isEnabled);

  const updatedRecord = await db.transaction(async (trx) => {
    const existingRes = await trx.query(
      `SELECT * FROM ecosystem_feature_switches WHERE switch_key = $1 FOR UPDATE`,
      [params.switchKey]
    );
    if (existingRes.rowCount === 0) {
      throw new Error(
        `FEATURE_SWITCH_NOT_FOUND: Feature switch "${params.switchKey}" is not initialized.`
      );
    }

    const before = mapFeatureSwitchRow(existingRes.rows[0]);

    const updateRes = await trx.query(
      `
      UPDATE ecosystem_feature_switches
      SET
        is_enabled = $1,
        updated_by_admin_id = $2,
        updated_at = NOW()
      WHERE switch_key = $3
      RETURNING *
      `,
      [nextState, params.adminUserId || null, params.switchKey]
    );

    const after = mapFeatureSwitchRow(updateRes.rows[0]);

    // Keep legacy system_economic_configs boolean mirrors synchronized where applicable
    const mirrorKeyMap: Partial<Record<EcosystemFeatureSwitchKey, string>> = {
      genesis_node_purchase_enabled: 'NODE_SALES_ENABLED',
      genesis_node_emission_enabled: 'NODE_REWARDS_ENABLED',
      phivo_instant_swap_enabled: 'INTERNAL_COIN_SWAP_ENABLED',
      bep20_deposits_enabled: 'CRYPTO_DEPOSITS_ENABLED',
    };
    const mirrorKey = mirrorKeyMap[params.switchKey];
    if (mirrorKey) {
      await trx.query(
        `
        UPDATE system_economic_configs
        SET config_value = $1, status = 'ACTIVE', updated_at = NOW()
        WHERE config_key = $2
        `,
        [JSON.stringify(nextState), mirrorKey]
      );
    }

    await recordSecurityAuditLog(trx, {
      traceId: params.traceId,
      actorUserId: params.adminUserId || null,
      actionType: 'TOGGLE_ECOSYSTEM_FEATURE_SWITCH',
      severity: nextState ? 'INFO' : 'WARN',
      payload: {
        switchKey: params.switchKey,
        label: after.label,
        category: after.category,
        previousState: before.isEnabled,
        newState: after.isEnabled,
        reason: params.reason ? String(params.reason).trim() : null,
      },
    });

    return after;
  });

  try {
    const { broadcastSystemConfigChange } = await import('./systemConfigBroadcaster');
    broadcastSystemConfigChange(
      `FEATURE_SWITCH_${updatedRecord.switchKey.toUpperCase()}`,
      { switchKey: updatedRecord.switchKey, isEnabled: updatedRecord.isEnabled },
      'GOVERNANCE'
    );
  } catch {
    // Non-blocking SSE broadcast
  }

  return updatedRecord;
}

// ============================================================================
// 1. Read Master Ecosystem Configurations
// ============================================================================

function parseNumericEconomicVal(raw: any, fallback: number): number {
  if (raw === null || raw === undefined) return fallback;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (typeof parsed === 'number' && Number.isFinite(parsed)) return parsed;
    if (typeof parsed === 'object' && parsed !== null) {
      const candidate =
        parsed.ratePhivo ?? parsed.priceUsdt ?? parsed.rateUsd ?? parsed.rewardPerNode ?? NaN;
      if (Number.isFinite(Number(candidate))) return Number(candidate);
    }
    const direct = Number(parsed);
    return Number.isFinite(direct) ? direct : fallback;
  } catch {
    const direct = Number(raw);
    return Number.isFinite(direct) ? direct : fallback;
  }
}

export async function getEcosystemMasterConfig(
  dbClient?: DatabaseClient
): Promise<EcosystemMasterConfigResponse> {
  const db = dbClient || (await getDb());

  const [featureSwitches, econRes, masterCfgRes, tiersRes, dailyRatesRes, plansRes, gensRes, ranksRes, cbRes, logsRes] =
    await Promise.all([
      getEcosystemFeatureSwitches(db),
      db
        .query<{ config_key: string; config_value: any; status: string }>(
          `
          SELECT config_key, config_value, status
          FROM system_economic_configs
          WHERE config_key IN (
            'GENESIS_NODE_CAP',
            'NODE_BASE_PRICE_USD',
            'NODE_REWARD_RATE_PER_EPOCH',
            'INTERNAL_COIN_PRICE_USDT',
            'INTERNAL_COIN_SWAP_ENABLED'
          )
          `
        )
        .catch(() => ({ rows: [] as Array<{ config_key: string; config_value: any; status: string }> })),
      db
        .query<{ config_key: string; config_value: string }>(
          `SELECT config_key, ROUND(config_value, 4)::text AS config_value FROM unilevel_master_configs WHERE config_key IN ('alpha_redemption_fee_pct', 'p2p_transfer_fee_pct')`
        )
        .catch(() => ({ rows: [] as Array<{ config_key: string; config_value: string }> })),
      db.query(`SELECT * FROM trading_pool_tiers ORDER BY min_amount ASC`),
      db.query(`
        SELECT
          d.id,
          d.trading_date::text AS trading_date,
          d.tier_id,
          t.tier_code,
          t.tier_name,
          d.yield_rate_pct,
          d.set_by_admin_id,
          d.notes,
          d.created_at,
          d.updated_at
        FROM daily_trading_yield_rates d
        JOIN trading_pool_tiers t ON t.id = d.tier_id
        ORDER BY d.trading_date DESC, t.min_amount ASC
        LIMIT 30
      `),
      db.query(`SELECT * FROM chrono_vault_plans ORDER BY duration_days ASC`),
      db.query(`SELECT * FROM unilevel_generation_configs ORDER BY generation_level ASC`),
      db.query(`SELECT * FROM unilevel_leadership_ranks ORDER BY rank_level ASC`),
      db.query(`SELECT * FROM system_circuit_breaker_configs WHERE id = 1`),
      db.query(`
        SELECT id, trace_id, actor_user_id, action_type, severity, payload, created_at
        FROM security_audit_logs
        ORDER BY created_at DESC
        LIMIT 50
      `),
    ]);

  const masterCfgMap = new Map<string, string>();
  for (const row of masterCfgRes.rows) {
    masterCfgMap.set(row.config_key, row.config_value);
  }
  const alphaRedemptionFeePct = masterCfgMap.has('alpha_redemption_fee_pct')
    ? Number(masterCfgMap.get('alpha_redemption_fee_pct')).toFixed(4)
    : '15.0000';
  const p2pTransferFeePct = masterCfgMap.has('p2p_transfer_fee_pct')
    ? Number(masterCfgMap.get('p2p_transfer_fee_pct')).toFixed(4)
    : '0.0000';

  const featureSwitchesMap = buildDefaultFeatureSwitchesMap();
  for (const sw of featureSwitches) {
    if (sw.switchKey in featureSwitchesMap) {
      featureSwitchesMap[sw.switchKey] = sw.isEnabled;
    }
  }

  const econMap = new Map<string, any>();
  for (const row of econRes.rows) {
    econMap.set(row.config_key, row.config_value);
  }

  const genesisCoreEconomics: GenesisCoreEconomicsSnapshot = {
    genesisNodeCap: parseNumericEconomicVal(econMap.get('GENESIS_NODE_CAP'), 10000),
    nodeBasePriceUsd: parseNumericEconomicVal(econMap.get('NODE_BASE_PRICE_USD'), 1000),
    nodeDailyEmissionPhivo: parseNumericEconomicVal(econMap.get('NODE_REWARD_RATE_PER_EPOCH'), 15),
    phivoReferencePriceUsd: parseNumericEconomicVal(econMap.get('INTERNAL_COIN_PRICE_USDT'), 0.1),
    swapEnabled: featureSwitchesMap.phivo_instant_swap_enabled,
  };

  const tradingPoolTiers = tiersRes.rows.map(mapTradingTierRow);
  const dailyTradingYieldRates: DailyTradingYieldRateRecord[] = dailyRatesRes.rows.map((r: any) => ({
    id: r.id,
    tradingDate: String(r.trading_date).slice(0, 10),
    tierId: r.tier_id,
    tierCode: r.tier_code,
    tierName: r.tier_name,
    yieldRatePct: formatNumeric8(r.yield_rate_pct),
    setByAdminId: r.set_by_admin_id || null,
    notes: r.notes || null,
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
  }));

  const chronoVaultPlans = plansRes.rows.map(mapChronoVaultPlanRow);
  const unilevelGenerations = gensRes.rows.map(mapUnilevelGenerationRow);

  const totalPct = unilevelGenerations
    .filter((g) => g.isActive)
    .reduce((acc, g) => acc + Number(g.commissionPct), 0);

  const leadershipRanks = ranksRes.rows.map(mapLeadershipRankRow);
  const circuitBreaker = cbRes.rows[0]
    ? mapCircuitBreakerRow(cbRes.rows[0])
    : {
        id: 1,
        minReserveRatio: '1.25000000',
        maxHourlyOutflowUsd: '25000.00000000',
        maxUserDailyWithdrawalUsd: '10000.00000000',
        withdrawalMode: 'AUTO' as WithdrawalCircuitMode,
        tripReason: null,
        trippedAt: null,
        updatedAt: new Date().toISOString(),
      };

  const recentSecurityAuditLogs: SecurityAuditLogRecord[] = logsRes.rows.map((r: any) => ({
    id: r.id,
    traceId: r.trace_id,
    actorUserId: r.actor_user_id || null,
    actionType: r.action_type,
    severity: r.severity,
    payload: typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload || {},
    createdAt: new Date(r.created_at).toISOString(),
  }));

  return {
    featureSwitches,
    featureSwitchesMap,
    genesisCoreEconomics,
    alphaRedemptionFeePct,
    p2pTransferFeePct,
    tradingPoolTiers,
    dailyTradingYieldRates,
    chronoVaultPlans,
    unilevelGenerations,
    totalUnilevelCommissionPct: formatNumeric8(totalPct),
    leadershipRanks,
    circuitBreaker,
    recentSecurityAuditLogs,
  };
}

// ============================================================================
// 2. Dynamic Admin Setter: Daily Trading Pool Yield Rate
// ============================================================================

export async function setDailyTradingYieldRate(
  params: {
    tradingDate: string;
    tierCode: TradingTierCode;
    yieldRatePct: number | string;
    adminUserId?: string | null;
    notes?: string | null;
    allowOverride?: boolean;
    traceId?: string;
  },
  dbClient?: DatabaseClient
): Promise<DailyTradingYieldRateRecord> {
  const db = dbClient || (await getDb());
  const normalizedDate = validateIsoDate(params.tradingDate);
  const rateNum = Number(formatNumeric8(params.yieldRatePct));

  if (rateNum < 0 || rateNum > 100) {
    throw new Error('INVALID_YIELD_RATE: yieldRatePct must be between 0 and 100.');
  }

  return db.transaction(async (trx) => {
    const tierRes = await trx.query(
      `SELECT * FROM trading_pool_tiers WHERE tier_code = $1`,
      [params.tierCode]
    );
    if (tierRes.rowCount === 0) {
      throw new Error(`TIER_NOT_FOUND: Trading pool tier "${params.tierCode}" does not exist.`);
    }

    const tier = mapTradingTierRow(tierRes.rows[0]);
    const minRate = Number(tier.minDailyRatePct);
    const maxRate = Number(tier.maxDailyRatePct);

    if (!params.allowOverride && (rateNum < minRate || rateNum > maxRate)) {
      throw new Error(
        `RATE_OUT_OF_TIER_BOUNDS: Rate ${formatNumeric8(rateNum)}% for ${tier.tierCode} must be between ${tier.minDailyRatePct}% and ${tier.maxDailyRatePct}%.`
      );
    }

    const upsertRes = await trx.query(
      `
      INSERT INTO daily_trading_yield_rates (
        trading_date, tier_id, yield_rate_pct, set_by_admin_id, notes, created_at, updated_at
      ) VALUES ($1::date, $2, $3::numeric(20,8), $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (trading_date, tier_id) DO UPDATE SET
        yield_rate_pct = EXCLUDED.yield_rate_pct,
        set_by_admin_id = EXCLUDED.set_by_admin_id,
        notes = EXCLUDED.notes,
        updated_at = CURRENT_TIMESTAMP
      RETURNING id, trading_date::text AS trading_date, tier_id, yield_rate_pct, set_by_admin_id, notes, created_at, updated_at
      `,
      [
        normalizedDate,
        tier.id,
        formatNumeric8(rateNum),
        params.adminUserId || null,
        params.notes || null,
      ]
    );

    const row = upsertRes.rows[0];
    const isOverride = rateNum < minRate || rateNum > maxRate;

    await recordSecurityAuditLog(trx, {
      traceId: params.traceId,
      actorUserId: params.adminUserId || null,
      actionType: 'SET_DAILY_TRADING_YIELD_RATE',
      severity: isOverride ? 'WARN' : 'INFO',
      payload: {
        tradingDate: normalizedDate,
        tierCode: tier.tierCode,
        tierId: tier.id,
        yieldRatePct: formatNumeric8(rateNum),
        tierMinRatePct: tier.minDailyRatePct,
        tierMaxRatePct: tier.maxDailyRatePct,
        overrideUsed: isOverride,
        notes: params.notes || null,
      },
    });

    return {
      id: row.id,
      tradingDate: String(row.trading_date).slice(0, 10),
      tierId: row.tier_id,
      tierCode: tier.tierCode,
      tierName: tier.tierName,
      yieldRatePct: formatNumeric8(row.yield_rate_pct),
      setByAdminId: row.set_by_admin_id || null,
      notes: row.notes || null,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  });
}

// ============================================================================
// 3. Dynamic Admin Setter: Update Trading Pool Tier Parameters
// ============================================================================

export async function updateTradingPoolTier(
  params: {
    tierCode: TradingTierCode;
    minAmount?: number | string;
    maxAmount?: number | string | null;
    minDailyRatePct?: number | string;
    maxDailyRatePct?: number | string;
    isActive?: boolean;
    adminUserId?: string | null;
    traceId?: string;
  },
  dbClient?: DatabaseClient
): Promise<TradingPoolTierConfig> {
  const db = dbClient || (await getDb());

  return db.transaction(async (trx) => {
    const existingRes = await trx.query(
      `SELECT * FROM trading_pool_tiers WHERE tier_code = $1`,
      [params.tierCode]
    );
    if (existingRes.rowCount === 0) {
      throw new Error(`TIER_NOT_FOUND: Trading pool tier "${params.tierCode}" does not exist.`);
    }

    const before = mapTradingTierRow(existingRes.rows[0]);
    const nextMinAmount = params.minAmount !== undefined ? formatNumeric8(params.minAmount) : before.minAmount;
    const nextMaxAmount =
      params.maxAmount === null
        ? null
        : params.maxAmount !== undefined
        ? formatNumeric8(params.maxAmount)
        : before.maxAmount;
    const nextMinRate = params.minDailyRatePct !== undefined ? formatNumeric8(params.minDailyRatePct) : before.minDailyRatePct;
    const nextMaxRate = params.maxDailyRatePct !== undefined ? formatNumeric8(params.maxDailyRatePct) : before.maxDailyRatePct;
    const nextIsActive = params.isActive !== undefined ? Boolean(params.isActive) : before.isActive;

    if (Number(nextMinAmount) <= 0) {
      throw new Error('INVALID_MIN_AMOUNT: minAmount must be strictly greater than 0.');
    }
    if (nextMaxAmount !== null && Number(nextMaxAmount) < Number(nextMinAmount)) {
      throw new Error('INVALID_MAX_AMOUNT: maxAmount must be greater than or equal to minAmount.');
    }
    if (Number(nextMinRate) < 0 || Number(nextMaxRate) < Number(nextMinRate) || Number(nextMaxRate) > 100) {
      throw new Error('INVALID_RATE_RANGE: Daily rate range must satisfy 0 <= minDailyRatePct <= maxDailyRatePct <= 100.');
    }

    const updateRes = await trx.query(
      `
      UPDATE trading_pool_tiers
      SET
        min_amount = $1::numeric(20,8),
        max_amount = $2::numeric(20,8),
        min_daily_rate_pct = $3::numeric(20,8),
        max_daily_rate_pct = $4::numeric(20,8),
        is_active = $5,
        updated_at = CURRENT_TIMESTAMP
      WHERE tier_code = $6
      RETURNING *
      `,
      [nextMinAmount, nextMaxAmount, nextMinRate, nextMaxRate, nextIsActive, params.tierCode]
    );

    const after = mapTradingTierRow(updateRes.rows[0]);

    await recordSecurityAuditLog(trx, {
      traceId: params.traceId,
      actorUserId: params.adminUserId || null,
      actionType: 'UPDATE_TRADING_POOL_TIER',
      severity: 'INFO',
      payload: {
        tierCode: params.tierCode,
        before,
        after,
      },
    });

    return after;
  });
}

// ============================================================================
// 4. Dynamic Admin Setter: Chrono Vault Plan Rate & Config
// ============================================================================

export async function updateChronoVaultPlanRate(
  params: {
    planCode: ChronoVaultPlanCode;
    dailyRatePct?: number | string;
    minAmount?: number | string;
    isActive?: boolean;
    adminUserId?: string | null;
    traceId?: string;
  },
  dbClient?: DatabaseClient
): Promise<ChronoVaultPlanConfig> {
  const db = dbClient || (await getDb());

  return db.transaction(async (trx) => {
    const existingRes = await trx.query(
      `SELECT * FROM chrono_vault_plans WHERE plan_code = $1`,
      [params.planCode]
    );
    if (existingRes.rowCount === 0) {
      throw new Error(`PLAN_NOT_FOUND: Chrono Vault plan "${params.planCode}" does not exist.`);
    }

    const before = mapChronoVaultPlanRow(existingRes.rows[0]);
    const nextDailyRate = params.dailyRatePct !== undefined ? formatNumeric8(params.dailyRatePct) : before.dailyRatePct;
    const nextMinAmount = params.minAmount !== undefined ? formatNumeric8(params.minAmount) : before.minAmount;
    const nextIsActive = params.isActive !== undefined ? Boolean(params.isActive) : before.isActive;

    if (Number(nextDailyRate) <= 0 || Number(nextDailyRate) > 100) {
      throw new Error('INVALID_DAILY_RATE: dailyRatePct must be greater than 0 and at most 100.');
    }
    if (Number(nextMinAmount) <= 0) {
      throw new Error('INVALID_MIN_AMOUNT: minAmount must be strictly greater than 0.');
    }

    const updateRes = await trx.query(
      `
      UPDATE chrono_vault_plans
      SET
        daily_rate_pct = $1::numeric(20,8),
        min_amount = $2::numeric(20,8),
        is_active = $3,
        updated_at = CURRENT_TIMESTAMP
      WHERE plan_code = $4
      RETURNING *
      `,
      [nextDailyRate, nextMinAmount, nextIsActive, params.planCode]
    );

    const after = mapChronoVaultPlanRow(updateRes.rows[0]);

    await recordSecurityAuditLog(trx, {
      traceId: params.traceId,
      actorUserId: params.adminUserId || null,
      actionType: 'UPDATE_CHRONO_VAULT_PLAN',
      severity: 'INFO',
      payload: {
        planCode: params.planCode,
        before,
        after,
      },
    });

    return after;
  });
}

// ============================================================================
// 5. Dynamic Admin Setter: 16-Generation Unilevel Configuration
// ============================================================================

export async function updateUnilevelGenerationConfig(
  params: {
    generationLevel: number;
    commissionPct?: number | string;
    minPersonalActiveUsd?: number | string;
    minDirectActiveReferrals?: number;
    isActive?: boolean;
    adminUserId?: string | null;
    traceId?: string;
  },
  dbClient?: DatabaseClient
): Promise<UnilevelGenerationConfig> {
  const db = dbClient || (await getDb());
  const level = Number(params.generationLevel);

  if (!Number.isInteger(level) || level < 1 || level > 16) {
    throw new Error('INVALID_GENERATION_LEVEL: generationLevel must be an integer between 1 and 16.');
  }

  return db.transaction(async (trx) => {
    const existingRes = await trx.query(
      `SELECT * FROM unilevel_generation_configs WHERE generation_level = $1`,
      [level]
    );
    if (existingRes.rowCount === 0) {
      throw new Error(`GENERATION_NOT_FOUND: Generation level ${level} does not exist.`);
    }

    const before = mapUnilevelGenerationRow(existingRes.rows[0]);
    const nextCommissionPct =
      params.commissionPct !== undefined ? formatNumeric8(params.commissionPct) : before.commissionPct;
    const nextMinPersonalUsd =
      params.minPersonalActiveUsd !== undefined
        ? formatNumeric8(params.minPersonalActiveUsd)
        : before.requiredPersonalActiveUsd;
    const nextMinDirects =
      params.minDirectActiveReferrals !== undefined
        ? Number(params.minDirectActiveReferrals)
        : before.requiredDirectActiveReferrals;
    const nextIsActive = params.isActive !== undefined ? Boolean(params.isActive) : before.isActive;

    if (Number(nextCommissionPct) < 0 || Number(nextCommissionPct) > 100) {
      throw new Error('INVALID_COMMISSION_PCT: commissionPct must be between 0 and 100.');
    }
    if (Number(nextMinPersonalUsd) < 0) {
      throw new Error('INVALID_MIN_PERSONAL_USD: minPersonalActiveUsd cannot be negative.');
    }
    if (!Number.isInteger(nextMinDirects) || nextMinDirects < 0) {
      throw new Error('INVALID_MIN_DIRECTS: minDirectActiveReferrals must be a non-negative integer.');
    }

    // Enforce global 40.00000000% active 16-generation cap
    const otherActiveRes = await trx.query<{ other_sum: string }>(
      `
      SELECT COALESCE(SUM(commission_pct), 0)::numeric(20,8)::text AS other_sum
      FROM unilevel_generation_configs
      WHERE generation_level <> $1 AND is_active = TRUE
      `,
      [level]
    );
    const otherSum = Number(otherActiveRes.rows[0]?.other_sum || 0);
    const projectedSum = otherSum + (nextIsActive ? Number(nextCommissionPct) : 0);
    if (projectedSum > 40.00000001) {
      throw new Error(
        `UNILEVEL_CAP_VIOLATION: Total active 16-generation commission sum (${projectedSum.toFixed(4)}%) cannot exceed 40.0000%.`
      );
    }

    const updateRes = await trx.query(
      `
      UPDATE unilevel_generation_configs
      SET
        commission_pct = $1::numeric(20,8),
        required_personal_active_usd = $2::numeric(20,8),
        required_direct_active_referrals = $3,
        is_active = $4,
        updated_at = CURRENT_TIMESTAMP
      WHERE generation_level = $5
      RETURNING *
      `,
      [nextCommissionPct, nextMinPersonalUsd, nextMinDirects, nextIsActive, level]
    );

    const after = mapUnilevelGenerationRow(updateRes.rows[0]);

    await recordSecurityAuditLog(trx, {
      traceId: params.traceId,
      actorUserId: params.adminUserId || null,
      actionType: 'UPDATE_UNILEVEL_GENERATION_CONFIG',
      severity: nextIsActive ? 'INFO' : 'WARN',
      payload: {
        generationLevel: level,
        before,
        after,
      },
    });

    return after;
  });
}

// ============================================================================
// 6. Dynamic Admin Setter: Unilevel Leadership Rank Config (Ranks 0..6)
// ============================================================================

export async function updateUnilevelLeadershipRank(
  params: {
    rankLevel: number;
    requiredPersonalVolumeUsd?: number | string;
    requiredTeamVolumeUsd?: number | string;
    maxSingleLegCapPct?: number | string;
    requiredDirectActiveLegs?: number;
    requiredSubRankCode?: string | null;
    requiredSubRankLegs?: number;
    milestoneBonusUsd?: number | string;
    globalPoolSharePct?: number | string;
    rewardDescription?: string | null;
    isActive?: boolean;
    adminUserId?: string | null;
    traceId?: string;
  },
  dbClient?: DatabaseClient
): Promise<UnilevelLeadershipRankConfig> {
  const db = dbClient || (await getDb());
  const rankLevel = Number(params.rankLevel);

  if (!Number.isInteger(rankLevel) || rankLevel < 0 || rankLevel > 6) {
    throw new Error('INVALID_RANK_LEVEL: rankLevel must be an integer between 0 and 6.');
  }

  return db.transaction(async (trx) => {
    const existingRes = await trx.query(
      `SELECT * FROM unilevel_leadership_ranks WHERE rank_level = $1`,
      [rankLevel]
    );
    if (existingRes.rowCount === 0) {
      throw new Error(`RANK_NOT_FOUND: Leadership rank level ${rankLevel} does not exist.`);
    }

    const before = mapLeadershipRankRow(existingRes.rows[0]);
    const nextPersonalVol =
      params.requiredPersonalVolumeUsd !== undefined
        ? formatNumeric8(params.requiredPersonalVolumeUsd)
        : before.requiredPersonalVolumeUsd;
    const nextTeamVol =
      params.requiredTeamVolumeUsd !== undefined
        ? formatNumeric8(params.requiredTeamVolumeUsd)
        : before.requiredTeamVolumeUsd;
    const nextLegCap =
      params.maxSingleLegCapPct !== undefined
        ? formatNumeric8(params.maxSingleLegCapPct)
        : before.maxSingleLegCapPct;
    const nextDirectLegs =
      params.requiredDirectActiveLegs !== undefined
        ? Number(params.requiredDirectActiveLegs)
        : before.requiredDirectActiveLegs;
    const nextSubRankCode =
      params.requiredSubRankCode !== undefined ? params.requiredSubRankCode : before.requiredSubRankCode;
    const nextSubRankLegs =
      params.requiredSubRankLegs !== undefined ? Number(params.requiredSubRankLegs) : before.requiredSubRankLegs;
    const nextMilestoneBonus =
      params.milestoneBonusUsd !== undefined ? formatNumeric8(params.milestoneBonusUsd) : before.milestoneBonusUsd;
    const nextPoolShare =
      params.globalPoolSharePct !== undefined ? formatNumeric8(params.globalPoolSharePct) : before.globalPoolSharePct;
    const nextRewardDesc =
      params.rewardDescription !== undefined ? params.rewardDescription : before.rewardDescription;
    const nextIsActive = params.isActive !== undefined ? Boolean(params.isActive) : before.isActive;

    if (Number(nextPersonalVol) < 0 || Number(nextTeamVol) < 0 || Number(nextMilestoneBonus) < 0) {
      throw new Error('INVALID_RANK_THRESHOLDS: Volume and milestone bonus values cannot be negative.');
    }
    if (Number(nextLegCap) <= 0 || Number(nextLegCap) > 100) {
      throw new Error('INVALID_LEG_CAP: maxSingleLegCapPct must be > 0 and <= 100.');
    }

    const updateRes = await trx.query(
      `
      UPDATE unilevel_leadership_ranks
      SET
        required_personal_volume_usd = $1::numeric(20,8),
        required_team_volume_usd = $2::numeric(20,8),
        max_single_leg_cap_pct = $3::numeric(20,8),
        required_direct_active_legs = $4,
        required_sub_rank_code = $5,
        required_sub_rank_legs = $6,
        milestone_bonus_usd = $7::numeric(20,8),
        global_pool_share_pct = $8::numeric(20,8),
        reward_description = $9,
        is_active = $10,
        updated_at = CURRENT_TIMESTAMP
      WHERE rank_level = $11
      RETURNING *
      `,
      [
        nextPersonalVol,
        nextTeamVol,
        nextLegCap,
        nextDirectLegs,
        nextSubRankCode,
        nextSubRankLegs,
        nextMilestoneBonus,
        nextPoolShare,
        nextRewardDesc,
        nextIsActive,
        rankLevel,
      ]
    );

    const after = mapLeadershipRankRow(updateRes.rows[0]);

    await recordSecurityAuditLog(trx, {
      traceId: params.traceId,
      actorUserId: params.adminUserId || null,
      actionType: 'UPDATE_UNILEVEL_LEADERSHIP_RANK',
      severity: 'INFO',
      payload: {
        rankLevel,
        rankCode: after.rankCode,
        before,
        after,
      },
    });

    return after;
  });
}

// ============================================================================
// 7. Dynamic Admin Setter: System Circuit Breaker Config
// ============================================================================

export async function updateCircuitBreakerConfig(
  params: {
    minReserveRatio?: number | string;
    maxHourlyOutflowUsd?: number | string;
    maxUserDailyWithdrawalUsd?: number | string;
    withdrawalMode?: WithdrawalCircuitMode;
    tripReason?: string | null;
    resetTrip?: boolean;
    adminUserId?: string | null;
    traceId?: string;
  },
  dbClient?: DatabaseClient
): Promise<SystemCircuitBreakerConfig> {
  const db = dbClient || (await getDb());

  return db.transaction(async (trx) => {
    const existingRes = await trx.query(`SELECT * FROM system_circuit_breaker_configs WHERE id = 1`);
    const before = existingRes.rows[0]
      ? mapCircuitBreakerRow(existingRes.rows[0])
      : {
          id: 1,
          minReserveRatio: '1.25000000',
          maxHourlyOutflowUsd: '25000.00000000',
          maxUserDailyWithdrawalUsd: '10000.00000000',
          withdrawalMode: 'AUTO' as WithdrawalCircuitMode,
          tripReason: null,
          trippedAt: null,
          updatedAt: new Date().toISOString(),
        };

    const nextReserveRatio =
      params.minReserveRatio !== undefined ? formatNumeric8(params.minReserveRatio) : before.minReserveRatio;
    const nextHourlyOutflow =
      params.maxHourlyOutflowUsd !== undefined ? formatNumeric8(params.maxHourlyOutflowUsd) : before.maxHourlyOutflowUsd;
    const nextDailyWithdrawal =
      params.maxUserDailyWithdrawalUsd !== undefined
        ? formatNumeric8(params.maxUserDailyWithdrawalUsd)
        : before.maxUserDailyWithdrawalUsd;
    const nextMode: WithdrawalCircuitMode =
      params.withdrawalMode !== undefined ? params.withdrawalMode : before.withdrawalMode;

    if (!['AUTO', 'MANUAL_REVIEW', 'PAUSED_OFF'].includes(nextMode)) {
      throw new Error(
        'INVALID_WITHDRAWAL_MODE: withdrawalMode must be AUTO, MANUAL_REVIEW, or PAUSED_OFF.'
      );
    }
    if (Number(nextReserveRatio) <= 0 || Number(nextHourlyOutflow) <= 0 || Number(nextDailyWithdrawal) <= 0) {
      throw new Error('INVALID_CIRCUIT_BREAKER_LIMITS: Reserve ratio and outflow limits must be positive.');
    }

    const nextTripReason = params.resetTrip
      ? null
      : params.tripReason !== undefined
      ? params.tripReason
      : before.tripReason;
    const nextTrippedAt = params.resetTrip
      ? null
      : (nextMode === 'MANUAL_REVIEW' || nextMode === 'PAUSED_OFF') && !before.trippedAt
      ? new Date().toISOString()
      : before.trippedAt;

    const updateRes = await trx.query(
      `
      INSERT INTO system_circuit_breaker_configs (
        id, min_reserve_ratio, max_hourly_outflow_usd, max_user_daily_withdrawal_usd,
        withdrawal_mode, trip_reason, tripped_at, updated_at
      ) VALUES (1, $1::numeric(20,8), $2::numeric(20,8), $3::numeric(20,8), $4, $5, $6, NOW())
      ON CONFLICT (id) DO UPDATE SET
        min_reserve_ratio = EXCLUDED.min_reserve_ratio,
        max_hourly_outflow_usd = EXCLUDED.max_hourly_outflow_usd,
        max_user_daily_withdrawal_usd = EXCLUDED.max_user_daily_withdrawal_usd,
        withdrawal_mode = EXCLUDED.withdrawal_mode,
        trip_reason = EXCLUDED.trip_reason,
        tripped_at = EXCLUDED.tripped_at,
        updated_at = NOW()
      RETURNING *
      `,
      [nextReserveRatio, nextHourlyOutflow, nextDailyWithdrawal, nextMode, nextTripReason, nextTrippedAt]
    );

    const after = mapCircuitBreakerRow(updateRes.rows[0]);

    await recordSecurityAuditLog(trx, {
      traceId: params.traceId,
      actorUserId: params.adminUserId || null,
      actionType: 'UPDATE_CIRCUIT_BREAKER_CONFIG',
      severity: nextMode === 'PAUSED_OFF' ? 'CRITICAL' : nextMode === 'MANUAL_REVIEW' ? 'WARN' : 'INFO',
      payload: {
        before,
        after,
      },
    });

    return after;
  });
}

// ============================================================================
// 8. Master Numeric Configs (e.g. alpha_redemption_fee_pct = 15.0000%)
// ============================================================================

const ALLOWED_MASTER_CONFIG_KEYS = new Set<string>([
  'alpha_redemption_fee_pct',
  'p2p_transfer_fee_pct',
]);

export async function getAlphaRedemptionFeePct(dbClient?: DatabaseClient): Promise<string> {
  const db = dbClient || (await getDb());
  try {
    const res = await db.query<{ config_value: string }>(
      `SELECT ROUND(config_value, 4)::text AS config_value FROM unilevel_master_configs WHERE config_key = 'alpha_redemption_fee_pct' LIMIT 1`
    );
    if (res.rowCount > 0 && res.rows[0]?.config_value !== undefined) {
      const n = Number(res.rows[0].config_value);
      if (Number.isFinite(n) && n >= 0 && n <= 50) {
        return n.toFixed(4);
      }
    }
  } catch {
    // Fallback to canonical default
  }
  return '15.0000';
}

export async function getP2pTransferFeePct(dbClient?: DatabaseClient): Promise<string> {
  const db = dbClient || (await getDb());
  try {
    const res = await db.query<{ config_value: string }>(
      `SELECT ROUND(config_value, 4)::text AS config_value FROM unilevel_master_configs WHERE config_key = 'p2p_transfer_fee_pct' LIMIT 1`
    );
    if (res.rowCount > 0 && res.rows[0]?.config_value !== undefined) {
      const n = Number(res.rows[0].config_value);
      if (Number.isFinite(n) && n >= 0 && n <= 25) {
        return n.toFixed(4);
      }
    }
  } catch {
    // Fallback to canonical default (0.00%)
  }
  return '0.0000';
}

export async function updateMasterConfigNumeric(
  params: {
    configKey: string;
    configValue: number | string;
    adminUserId?: string | null;
    traceId?: string;
  },
  dbClient?: DatabaseClient
): Promise<{ configKey: string; configValue: string; updatedAt: string }> {
  const key = String(params.configKey || '').trim();
  if (!ALLOWED_MASTER_CONFIG_KEYS.has(key)) {
    throw new Error(`INVALID_CONFIG_KEY: Unsupported master config key '${key}'.`);
  }

  const parsed = Number(params.configValue);
  const maxAllowed = key === 'p2p_transfer_fee_pct' ? 25 : 50;
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > maxAllowed) {
    throw new Error(`INVALID_CONFIG_VALUE: Fee percentage must be between 0.00% and ${maxAllowed}.00%.`);
  }

  const formatted8 = formatNumeric8(parsed);
  const formatted4 = parsed.toFixed(4);
  const db = dbClient || (await getDb());

  return db.transaction(async (trx) => {
    const prevRes = await trx.query<{ config_value: string }>(
      `SELECT ROUND(config_value, 4)::text AS config_value FROM unilevel_master_configs WHERE config_key = $1`,
      [key]
    );
    const previousValue = prevRes.rows[0]?.config_value || '15.0000';

    const upsertRes = await trx.query<{ config_key: string; config_value: string; updated_at: Date }>(
      `
      INSERT INTO unilevel_master_configs (config_key, config_value, updated_by_admin_id, updated_at)
      VALUES ($1, $2::numeric(20,8), $3, NOW())
      ON CONFLICT (config_key) DO UPDATE SET
        config_value = EXCLUDED.config_value,
        updated_by_admin_id = EXCLUDED.updated_by_admin_id,
        updated_at = NOW()
      RETURNING config_key, ROUND(config_value, 4)::text AS config_value, updated_at
      `,
      [key, formatted8, params.adminUserId || null]
    );

    await recordSecurityAuditLog(trx, {
      traceId: params.traceId,
      actorUserId: params.adminUserId || null,
      actionType: 'UPDATE_MASTER_CONFIG',
      severity: 'WARN',
      payload: {
        configKey: key,
        previousValue,
        newValue: formatted4,
      },
    });

    return {
      configKey: upsertRes.rows[0].config_key,
      configValue: upsertRes.rows[0].config_value,
      updatedAt: new Date(upsertRes.rows[0].updated_at).toISOString(),
    };
  });
}

// ============================================================================
// 9. Admin-Controlled Overview Promo & Supply Spotlight Banners
// ============================================================================

export type PromoAccentTheme = 'cyan' | 'emerald' | 'gold';

export interface EcosystemPromoBanner {
  id: string;
  slug: string | null;
  title: string;
  subtitle: string;
  badgeText: string;
  ctaLabel: string;
  targetTab: string;
  accentTheme: PromoAccentTheme;
  showNodeScarcity: boolean;
  isActive: boolean;
  sortOrder: number;
  updatedByAdminId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GenesisSupplyTelemetry {
  totalCap: number;
  soldCount: number;
  remainingCount: number;
}

const ALLOWED_PROMO_ACCENTS = new Set<PromoAccentTheme>(['cyan', 'emerald', 'gold']);
const ALLOWED_PROMO_TARGETS = new Set<string>([
  'products',
  'products:alpha',
  'products:genesis',
  'products:chrono',
  'deposit',
  'wallet',
  'network',
  'reward-analytics',
  'withdrawals',
]);
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function mapPromoBannerRow(r: any): EcosystemPromoBanner {
  return {
    id: r.id,
    slug: r.slug || null,
    title: r.title,
    subtitle: r.subtitle,
    badgeText: r.badge_text,
    ctaLabel: r.cta_label,
    targetTab: r.target_tab,
    accentTheme: (ALLOWED_PROMO_ACCENTS.has(r.accent_theme) ? r.accent_theme : 'cyan') as PromoAccentTheme,
    showNodeScarcity: Boolean(r.show_node_scarcity),
    isActive: Boolean(r.is_active),
    sortOrder: Number(r.sort_order ?? 10),
    updatedByAdminId: r.updated_by_admin_id || null,
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
  };
}

export async function getGenesisSupplyTelemetry(dbClient?: DatabaseClient): Promise<GenesisSupplyTelemetry> {
  const db = dbClient || (await getDb());
  const totalCap = 10000;
  try {
    const res = await db.query<{ sold_count: string }>(
      `SELECT COUNT(*)::text AS sold_count FROM nodes WHERE owner_user_id IS NOT NULL AND status IN ('ACTIVE', 'EMITTING', 'MATURED', 'SOLD')`
    );
    const soldCount = Math.min(totalCap, Math.max(0, parseInt(res.rows[0]?.sold_count || '0', 10) || 0));
    return {
      totalCap,
      soldCount,
      remainingCount: Math.max(0, totalCap - soldCount),
    };
  } catch {
    return { totalCap, soldCount: 0, remainingCount: totalCap };
  }
}

export async function getEcosystemPromoBanners(
  options?: { includeInactive?: boolean },
  dbClient?: DatabaseClient
): Promise<{ promos: EcosystemPromoBanner[]; genesisSupply: GenesisSupplyTelemetry }> {
  const db = dbClient || (await getDb());
  const includeInactive = Boolean(options?.includeInactive);

  const [bannersRes, genesisSupply] = await Promise.all([
    db.query(
      includeInactive
        ? `SELECT * FROM ecosystem_promo_banners ORDER BY sort_order ASC, created_at ASC`
        : `SELECT * FROM ecosystem_promo_banners WHERE is_active = TRUE ORDER BY sort_order ASC, created_at ASC`
    ),
    getGenesisSupplyTelemetry(db),
  ]);

  return {
    promos: bannersRes.rows.map(mapPromoBannerRow),
    genesisSupply,
  };
}

export async function createEcosystemPromoBanner(
  params: {
    title: string;
    subtitle: string;
    badgeText?: string;
    ctaLabel?: string;
    targetTab?: string;
    accentTheme?: PromoAccentTheme;
    showNodeScarcity?: boolean;
    isActive?: boolean;
    sortOrder?: number;
    adminUserId?: string | null;
    traceId?: string;
  },
  dbClient?: DatabaseClient
): Promise<EcosystemPromoBanner> {
  const title = String(params.title || '').trim();
  const subtitle = String(params.subtitle || '').trim();
  const badgeText = String(params.badgeText || 'ECOSYSTEM SPOTLIGHT').trim().slice(0, 64);
  const ctaLabel = String(params.ctaLabel || 'Explore Now').trim().slice(0, 64);
  const targetTab = String(params.targetTab || 'products:alpha').trim();
  const accentTheme = (params.accentTheme || 'cyan') as PromoAccentTheme;
  const sortOrder = Number.isFinite(Number(params.sortOrder)) ? Math.max(0, Math.min(999, Math.trunc(Number(params.sortOrder)))) : 10;

  if (!title || title.length > 200) {
    throw new Error('INVALID_TITLE: Banner title is required (max 200 characters).');
  }
  if (!subtitle || subtitle.length > 500) {
    throw new Error('INVALID_SUBTITLE: Banner subtitle is required (max 500 characters).');
  }
  if (!ALLOWED_PROMO_ACCENTS.has(accentTheme)) {
    throw new Error('INVALID_ACCENT_THEME: accentTheme must be cyan, emerald, or gold.');
  }
  if (!ALLOWED_PROMO_TARGETS.has(targetTab)) {
    throw new Error(`INVALID_TARGET_TAB: Unsupported navigation target '${targetTab}'.`);
  }

  const db = dbClient || (await getDb());
  return db.transaction(async (trx) => {
    const insertRes = await trx.query(
      `
      INSERT INTO ecosystem_promo_banners (
        title, subtitle, badge_text, cta_label, target_tab,
        accent_theme, show_node_scarcity, is_active, sort_order,
        updated_by_admin_id, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
      RETURNING *
      `,
      [
        title,
        subtitle,
        badgeText,
        ctaLabel,
        targetTab,
        accentTheme,
        Boolean(params.showNodeScarcity),
        params.isActive !== undefined ? Boolean(params.isActive) : true,
        sortOrder,
        params.adminUserId || null,
      ]
    );

    const created = mapPromoBannerRow(insertRes.rows[0]);
    await recordSecurityAuditLog(trx, {
      traceId: params.traceId,
      actorUserId: params.adminUserId || null,
      actionType: 'CREATE_ECOSYSTEM_PROMO_BANNER',
      severity: 'INFO',
      payload: { promo: created },
    });
    return created;
  });
}

export async function updateEcosystemPromoBanner(
  params: {
    id: string;
    title?: string;
    subtitle?: string;
    badgeText?: string;
    ctaLabel?: string;
    targetTab?: string;
    accentTheme?: PromoAccentTheme;
    showNodeScarcity?: boolean;
    isActive?: boolean;
    sortOrder?: number;
    adminUserId?: string | null;
    traceId?: string;
  },
  dbClient?: DatabaseClient
): Promise<EcosystemPromoBanner> {
  const id = String(params.id || '').trim();
  if (!UUID_REGEX.test(id)) {
    throw new Error('INVALID_PROMO_ID: Valid promo banner UUID is required.');
  }

  const db = dbClient || (await getDb());
  return db.transaction(async (trx) => {
    const existingRes = await trx.query(`SELECT * FROM ecosystem_promo_banners WHERE id = $1`, [id]);
    if (existingRes.rowCount === 0) {
      throw new Error('PROMO_NOT_FOUND: Promotional banner does not exist.');
    }
    const before = mapPromoBannerRow(existingRes.rows[0]);

    const nextTitle = params.title !== undefined ? String(params.title).trim() : before.title;
    const nextSubtitle = params.subtitle !== undefined ? String(params.subtitle).trim() : before.subtitle;
    const nextBadge = params.badgeText !== undefined ? String(params.badgeText).trim().slice(0, 64) : before.badgeText;
    const nextCta = params.ctaLabel !== undefined ? String(params.ctaLabel).trim().slice(0, 64) : before.ctaLabel;
    const nextTarget = params.targetTab !== undefined ? String(params.targetTab).trim() : before.targetTab;
    const nextAccent = (params.accentTheme !== undefined ? params.accentTheme : before.accentTheme) as PromoAccentTheme;
    const nextScarcity = params.showNodeScarcity !== undefined ? Boolean(params.showNodeScarcity) : before.showNodeScarcity;
    const nextActive = params.isActive !== undefined ? Boolean(params.isActive) : before.isActive;
    const nextSort =
      params.sortOrder !== undefined && Number.isFinite(Number(params.sortOrder))
        ? Math.max(0, Math.min(999, Math.trunc(Number(params.sortOrder))))
        : before.sortOrder;

    if (!nextTitle || nextTitle.length > 200) {
      throw new Error('INVALID_TITLE: Banner title must be 1–200 characters.');
    }
    if (!nextSubtitle || nextSubtitle.length > 500) {
      throw new Error('INVALID_SUBTITLE: Banner subtitle must be 1–500 characters.');
    }
    if (!ALLOWED_PROMO_ACCENTS.has(nextAccent)) {
      throw new Error('INVALID_ACCENT_THEME: accentTheme must be cyan, emerald, or gold.');
    }
    if (!ALLOWED_PROMO_TARGETS.has(nextTarget)) {
      throw new Error(`INVALID_TARGET_TAB: Unsupported navigation target '${nextTarget}'.`);
    }

    const updateRes = await trx.query(
      `
      UPDATE ecosystem_promo_banners
      SET
        title = $1,
        subtitle = $2,
        badge_text = $3,
        cta_label = $4,
        target_tab = $5,
        accent_theme = $6,
        show_node_scarcity = $7,
        is_active = $8,
        sort_order = $9,
        updated_by_admin_id = $10,
        updated_at = NOW()
      WHERE id = $11
      RETURNING *
      `,
      [
        nextTitle,
        nextSubtitle,
        nextBadge,
        nextCta,
        nextTarget,
        nextAccent,
        nextScarcity,
        nextActive,
        nextSort,
        params.adminUserId || null,
        id,
      ]
    );

    const after = mapPromoBannerRow(updateRes.rows[0]);
    await recordSecurityAuditLog(trx, {
      traceId: params.traceId,
      actorUserId: params.adminUserId || null,
      actionType: 'UPDATE_ECOSYSTEM_PROMO_BANNER',
      severity: 'INFO',
      payload: { promoId: id, before, after },
    });
    return after;
  });
}

export async function deleteEcosystemPromoBanner(
  params: {
    id: string;
    adminUserId?: string | null;
    traceId?: string;
  },
  dbClient?: DatabaseClient
): Promise<{ deletedId: string }> {
  const id = String(params.id || '').trim();
  if (!UUID_REGEX.test(id)) {
    throw new Error('INVALID_PROMO_ID: Valid promo banner UUID is required.');
  }

  const db = dbClient || (await getDb());
  return db.transaction(async (trx) => {
    const existingRes = await trx.query(`SELECT * FROM ecosystem_promo_banners WHERE id = $1`, [id]);
    if (existingRes.rowCount === 0) {
      throw new Error('PROMO_NOT_FOUND: Promotional banner does not exist.');
    }
    const deleted = mapPromoBannerRow(existingRes.rows[0]);

    await trx.query(`DELETE FROM ecosystem_promo_banners WHERE id = $1`, [id]);

    await recordSecurityAuditLog(trx, {
      traceId: params.traceId,
      actorUserId: params.adminUserId || null,
      actionType: 'DELETE_ECOSYSTEM_PROMO_BANNER',
      severity: 'WARN',
      payload: { deleted },
    });

    return { deletedId: id };
  });
}
