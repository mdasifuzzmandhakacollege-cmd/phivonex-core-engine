import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { getDb, DatabaseClient } from '../db/db';
import { generateLedgerTransactionPublicId } from '../utils/idGenerator';
import { syncUserLedger } from './walletLedgerService';
import { ChronoVaultPlanCode, assertFeatureSwitchEnabled } from './unilevelConfigService';
import {
  parseAmountToScaledBigInt,
  formatScaledBigInt,
  getUserMainUsdtBalanceExact,
} from './tradingPoolService';

export interface ChronoVaultPlanRecord {
  id: string;
  planCode: ChronoVaultPlanCode;
  planName: string;
  durationDays: number;
  dailyRatePct: string;
  minAmount: string;
  returnPrincipalOnMaturity: boolean;
  isActive: boolean;
}

export interface UserChronoVaultPositionRecord {
  id: string;
  userId: string;
  planId: string;
  planCode: ChronoVaultPlanCode;
  planName: string;
  durationDays: number;
  returnPrincipalOnMaturity: boolean;
  principalAmount: string;
  dailyRatePctSnapshot: string;
  totalYieldEarned: string;
  daysSettled: number;
  daysRemaining: number;
  progressPct: string;
  status: 'ACTIVE' | 'MATURED';
  activatedAt: string;
  maturityAt: string;
  lastSettledDate: string | null;
  principalReturnedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChronoVaultYieldPayoutRecord {
  id: string;
  positionId: string;
  userId: string;
  planCode: ChronoVaultPlanCode;
  planName: string;
  epochDate: string;
  dailyRatePctSnapshot: string;
  yieldAmount: string;
  ledgerEntryId: string | null;
  settledAt: string;
  createdAt: string;
}

export interface ChronoVaultSubscriptionResult {
  position: UserChronoVaultPositionRecord;
  plan: ChronoVaultPlanRecord;
  ledgerEntry: {
    id: string;
    publicTxnId: string;
    amount: string;
    currency: 'USDT';
    sourceType: 'CHRONO_VAULT_STAKING';
    status: 'SETTLED';
  };
  walletBalanceBeforeUsd: string;
  walletBalanceAfterUsd: string;
  spotCommissionUsd: '0.00000000';
  binaryVolumeAddedUsd: '0.00000000';
}

const VALID_PLAN_CODES: ChronoVaultPlanCode[] = [
  'CHRONO_200D',
  'CHRONO_1Y',
  'CHRONO_2Y',
  'CHRONO_5Y',
  'CHRONO_10Y',
];

/**
 * Returns all active PHIVONEX CHRONO VAULTS™ plans ordered by duration_days ASC.
 */
export async function getActiveChronoVaultPlans(
  dbClient?: DatabaseClient
): Promise<ChronoVaultPlanRecord[]> {
  const db = dbClient || (await getDb());
  const res = await db.query<{
    id: string;
    plan_code: ChronoVaultPlanCode;
    plan_name: string;
    duration_days: number;
    daily_rate_pct: string;
    min_amount: string;
    return_principal_on_maturity: boolean;
    is_active: boolean;
  }>(
    `
    SELECT
      id,
      plan_code,
      plan_name,
      duration_days,
      ROUND(daily_rate_pct, 8)::text AS daily_rate_pct,
      ROUND(min_amount, 8)::text AS min_amount,
      return_principal_on_maturity,
      is_active
    FROM chrono_vault_plans
    WHERE is_active = TRUE
    ORDER BY duration_days ASC
    `
  );

  return res.rows.map((r) => ({
    id: r.id,
    planCode: r.plan_code,
    planName: r.plan_name,
    durationDays: Number(r.duration_days),
    dailyRatePct: r.daily_rate_pct,
    minAmount: r.min_amount,
    returnPrincipalOnMaturity: Boolean(r.return_principal_on_maturity),
    isActive: Boolean(r.is_active),
  }));
}

/**
 * Resolves and validates an active Chrono Vault plan by planCode.
 */
export async function getChronoVaultPlanByCode(
  planCode: string,
  dbClient?: DatabaseClient
): Promise<ChronoVaultPlanRecord> {
  const normalizedCode = String(planCode || '').trim().toUpperCase() as ChronoVaultPlanCode;
  if (!VALID_PLAN_CODES.includes(normalizedCode)) {
    const err: any = new Error(
      `INVALID_VAULT_PLAN: '${planCode}' is not a valid Chrono Vault plan code. Allowed: ${VALID_PLAN_CODES.join(', ')}.`
    );
    err.code = 'INVALID_VAULT_PLAN';
    err.statusCode = 400;
    throw err;
  }

  const db = dbClient || (await getDb());
  const res = await db.query<{
    id: string;
    plan_code: ChronoVaultPlanCode;
    plan_name: string;
    duration_days: number;
    daily_rate_pct: string;
    min_amount: string;
    return_principal_on_maturity: boolean;
    is_active: boolean;
  }>(
    `
    SELECT
      id,
      plan_code,
      plan_name,
      duration_days,
      ROUND(daily_rate_pct, 8)::text AS daily_rate_pct,
      ROUND(min_amount, 8)::text AS min_amount,
      return_principal_on_maturity,
      is_active
    FROM chrono_vault_plans
    WHERE plan_code = $1 AND is_active = TRUE
    LIMIT 1
    `,
    [normalizedCode]
  );

  if (res.rowCount === 0) {
    const err: any = new Error(
      `VAULT_PLAN_UNAVAILABLE: Chrono Vault plan '${normalizedCode}' is not active or not found.`
    );
    err.code = 'VAULT_PLAN_UNAVAILABLE';
    err.statusCode = 400;
    throw err;
  }

  const row = res.rows[0];
  return {
    id: row.id,
    planCode: row.plan_code,
    planName: row.plan_name,
    durationDays: Number(row.duration_days),
    dailyRatePct: row.daily_rate_pct,
    minAmount: row.min_amount,
    returnPrincipalOnMaturity: Boolean(row.return_principal_on_maturity),
    isActive: Boolean(row.is_active),
  };
}

/**
 * Subscribes an authenticated user to a PHIVONEX CHRONO VAULTS™ time-locked staking plan.
 * - Validates `planCode` is an active plan (`CHRONO_200D`, `CHRONO_1Y`, `CHRONO_2Y`, `CHRONO_5Y`, `CHRONO_10Y`).
 * - Validates `amountUsd >= plan.min_amount` ($100.00000000 default).
 * - Inside a single ACID transaction:
 *   * Locks user's Main USDT Wallet context (`FOR UPDATE`) and verifies `available_balance >= amountUsd`.
 *   * Deducts `amountUsd` from Main USDT Wallet (`DEBIT` in `financial_ledger_entries` with `source_type = 'CHRONO_VAULT_STAKING'`).
 *   * Snapshots `daily_rate_pct_snapshot = plan.daily_rate_pct` and computes `maturity_at = activated_at + (plan.duration_days * INTERVAL '1 day')`.
 *   * Inserts an `ACTIVE` position into `user_vault_positions` (`days_settled = 0`, `total_yield_earned = 0`).
 *   * Returns created vault position details with `$0` spot commission and `0` binary volume.
 */
export async function subscribeChronoVault(params: {
  userId: string;
  planCode: ChronoVaultPlanCode | string;
  amountUsd: number | string;
  activatedAt?: Date;
}): Promise<ChronoVaultSubscriptionResult> {
  const { userId, planCode, amountUsd, activatedAt } = params;

  if (!userId || !String(userId).trim()) {
    const err: any = new Error('UNAUTHORIZED: Valid userId is required.');
    err.code = 'UNAUTHORIZED';
    err.statusCode = 401;
    throw err;
  }

  let amountScaled: bigint;
  try {
    amountScaled = parseAmountToScaledBigInt(amountUsd);
  } catch {
    const err: any = new Error('INVALID_AMOUNT: Staking amount must be a valid positive number.');
    err.code = 'INVALID_AMOUNT';
    err.statusCode = 400;
    throw err;
  }

  if (amountScaled <= 0n) {
    const err: any = new Error('INVALID_AMOUNT: Staking amount must be greater than zero.');
    err.code = 'INVALID_AMOUNT';
    err.statusCode = 400;
    throw err;
  }

  const db = await getDb();

  // 0. Enforce Master Ecosystem Feature Switch: Chrono Vaults Subscriptions
  await assertFeatureSwitchEnabled(
    'chrono_vaults_subscriptions_enabled',
    'PHIVONEX CHRONO VAULTS™ Subscriptions',
    db
  );

  const result = await db.transaction(async (trx) => {
    // 1. Validate planCode and minimum stake amount against authoritative DB plan
    const plan = await getChronoVaultPlanByCode(planCode, trx);
    const minAmountScaled = parseAmountToScaledBigInt(plan.minAmount);
    const amountStr = formatScaledBigInt(amountScaled);

    if (amountScaled < minAmountScaled) {
      const err: any = new Error(
        `MINIMUM_DEPOSIT_ERROR: Minimum staking amount for ${plan.planName} (${plan.planCode}) is $${plan.minAmount} USDT (received $${amountStr}).`
      );
      err.code = 'MINIMUM_DEPOSIT_ERROR';
      err.statusCode = 400;
      throw err;
    }

    // 2. Lock user row (FOR UPDATE) to serialize all wallet balance checks and mutations
    const userRes = await trx.query<{ id: string; status: string }>(
      `SELECT id, status FROM users WHERE id = $1 FOR UPDATE`,
      [userId]
    );
    if (userRes.rowCount === 0) {
      const err: any = new Error('USER_NOT_FOUND: User account does not exist.');
      err.code = 'USER_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }

    // 3. Reconcile any unposted ledger credits inside the same transaction
    await syncUserLedger(userId, trx);

    // 4. Verify Main USDT Wallet available balance >= amountUsd
    const { availableBalanceStr, availableBalanceScaled } = await getUserMainUsdtBalanceExact(userId, trx);
    if (availableBalanceScaled < amountScaled) {
      const err: any = new Error(
        `INSUFFICIENT_BALANCE: Available Main USDT Wallet balance ($${availableBalanceStr} USDT) is insufficient for $${amountStr} USDT Chrono Vault subscription.`
      );
      err.code = 'INSUFFICIENT_BALANCE';
      err.statusCode = 400;
      err.availableBalance = availableBalanceStr;
      err.requiredAmount = amountStr;
      throw err;
    }

    const positionId = uuidv4();
    const ledgerEntryId = uuidv4();
    const publicTxnId = generateLedgerTransactionPublicId();
    const effectiveActivatedAt = activatedAt || new Date();
    const positionRef = `CVAULT-${positionId.slice(0, 8).toUpperCase()}`;

    // 5. Deduct amountUsd from Main USDT Wallet via SETTLED DEBIT in financial_ledger_entries
    await trx.query(
      `
      INSERT INTO financial_ledger_entries (
        id, public_txn_id, user_id, entry_type, source_type, source_id,
        source_ref, description, amount, currency, status, created_at
      )
      VALUES ($1, $2, $3, 'DEBIT', 'CHRONO_VAULT_STAKING', $4, $5, $6, $7::numeric(20,8), 'USDT', 'SETTLED', $8)
      `,
      [
        ledgerEntryId,
        publicTxnId,
        userId,
        positionId,
        positionRef,
        `PHIVONEX CHRONO VAULTS™ Subscription (${plan.planName} - ${plan.durationDays} Days @ ${Number(plan.dailyRatePct).toFixed(2)}%/day)`,
        amountStr,
        effectiveActivatedAt,
      ]
    );

    // 6. Snapshot daily_rate_pct_snapshot = plan.daily_rate_pct & compute maturity_at = activated_at + (plan.duration_days * INTERVAL '1 day')
    const posRes = await trx.query<{
      id: string;
      user_id: string;
      plan_id: string;
      principal_amount: string;
      daily_rate_pct_snapshot: string;
      total_yield_earned: string;
      days_settled: number;
      status: 'ACTIVE' | 'MATURED';
      activated_at: Date;
      maturity_at: Date;
      last_settled_date: string | null;
      principal_returned_at: Date | null;
      created_at: Date;
      updated_at: Date;
    }>(
      `
      INSERT INTO user_vault_positions (
        id, user_id, plan_id, principal_amount, daily_rate_pct_snapshot,
        total_yield_earned, days_settled, status, activated_at, maturity_at,
        last_settled_date, principal_returned_at, created_at, updated_at
      )
      VALUES (
        $1,
        $2,
        $3,
        $4::numeric(20,8),
        $5::numeric(20,8),
        0.00000000,
        0,
        'ACTIVE',
        $6::timestamptz,
        $6::timestamptz + ($7::int * INTERVAL '1 day'),
        NULL,
        NULL,
        $6::timestamptz,
        $6::timestamptz
      )
      RETURNING
        id,
        user_id,
        plan_id,
        ROUND(principal_amount, 8)::text AS principal_amount,
        ROUND(daily_rate_pct_snapshot, 8)::text AS daily_rate_pct_snapshot,
        ROUND(total_yield_earned, 8)::text AS total_yield_earned,
        days_settled,
        status,
        activated_at,
        maturity_at,
        last_settled_date::text AS last_settled_date,
        principal_returned_at,
        created_at,
        updated_at
      `,
      [
        positionId,
        userId,
        plan.id,
        amountStr,
        plan.dailyRatePct,
        effectiveActivatedAt.toISOString(),
        plan.durationDays,
      ]
    );

    const posRow = posRes.rows[0];
    const walletBalanceAfterScaled = availableBalanceScaled - amountScaled;
    const walletBalanceAfterStr = formatScaledBigInt(walletBalanceAfterScaled);

    // 7. Record immutable security audit log entry
    await trx.query(
      `
      INSERT INTO security_audit_logs (
        trace_id, actor_user_id, action_type, severity, payload, created_at
      )
      VALUES ($1, $2, 'CHRONO_VAULT_SUBSCRIPTION', 'INFO', $3::jsonb, NOW())
      `,
      [
        `TRACE-CVAULT-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
        userId,
        JSON.stringify({
          positionId,
          planCode: plan.planCode,
          planName: plan.planName,
          durationDays: plan.durationDays,
          dailyRatePctSnapshot: plan.dailyRatePct,
          principalAmountUsd: amountStr,
          maturityAt: new Date(posRow.maturity_at).toISOString(),
          ledgerEntryId,
          publicTxnId,
          spotCommissionUsd: '0.00000000',
          binaryVolumeAddedUsd: '0.00000000',
        }),
      ]
    );

    const daysSettled = Number(posRow.days_settled || 0);
    const daysRemaining = Math.max(0, plan.durationDays - daysSettled);
    const progressPct =
      plan.durationDays > 0
        ? ((daysSettled / plan.durationDays) * 100).toFixed(4)
        : '0.0000';

    return {
      position: {
        id: posRow.id,
        userId: posRow.user_id,
        planId: posRow.plan_id,
        planCode: plan.planCode,
        planName: plan.planName,
        durationDays: plan.durationDays,
        returnPrincipalOnMaturity: plan.returnPrincipalOnMaturity,
        principalAmount: posRow.principal_amount,
        dailyRatePctSnapshot: posRow.daily_rate_pct_snapshot,
        totalYieldEarned: posRow.total_yield_earned,
        daysSettled,
        daysRemaining,
        progressPct,
        status: posRow.status,
        activatedAt: new Date(posRow.activated_at).toISOString(),
        maturityAt: new Date(posRow.maturity_at).toISOString(),
        lastSettledDate: posRow.last_settled_date,
        principalReturnedAt: posRow.principal_returned_at
          ? new Date(posRow.principal_returned_at).toISOString()
          : null,
        createdAt: new Date(posRow.created_at).toISOString(),
        updatedAt: new Date(posRow.updated_at).toISOString(),
      },
      plan,
      ledgerEntry: {
        id: ledgerEntryId,
        publicTxnId,
        amount: amountStr,
        currency: 'USDT' as const,
        sourceType: 'CHRONO_VAULT_STAKING' as const,
        status: 'SETTLED' as const,
      },
      walletBalanceBeforeUsd: availableBalanceStr,
      walletBalanceAfterUsd: walletBalanceAfterStr,
      spotCommissionUsd: '0.00000000' as const,
      binaryVolumeAddedUsd: '0.00000000' as const,
    };
  });

  // TASK-08: Trigger 7-Stage Unilevel Career & Leadership Rank evaluation for subscriber + uplines post-commit
  try {
    const { evaluateAndPromoteUserAndAncestors } = await import('./unilevelRankService');
    await evaluateAndPromoteUserAndAncestors(userId);
  } catch (rankErr) {
    console.warn('[ChronoVaultService] Notice evaluating Unilevel ranks post-subscription:', rankErr);
  }

  // Non-blocking transactional email receipt post-commit
  import('./emailService')
    .then(({ sendTransactionEmail }) =>
      sendTransactionEmail({
        userId,
        eventType: 'CHRONO_VAULT_SUBSCRIBED',
        metadata: {
          positionId: result.position.id,
          planCode: result.plan.planCode,
          planName: result.plan.planName,
          principalUsd: result.position.principalAmount,
          dailyRatePct: result.position.dailyRatePctSnapshot,
          durationDays: result.plan.durationDays,
          maturityAt: result.position.maturityAt,
          publicTxnId: result.ledgerEntry.publicTxnId,
        },
      })
    )
    .catch((emailErr) => {
      console.warn('[ChronoVaultService] Non-blocking subscription email error:', emailErr);
    });

  return result;
}

/**
 * Returns all Chrono Vault positions (ACTIVE and MATURED) for a user.
 */
export async function getUserChronoVaultPositions(
  userId: string,
  dbClient?: DatabaseClient
): Promise<UserChronoVaultPositionRecord[]> {
  const db = dbClient || (await getDb());

  const res = await db.query<{
    id: string;
    user_id: string;
    plan_id: string;
    plan_code: ChronoVaultPlanCode;
    plan_name: string;
    duration_days: number;
    return_principal_on_maturity: boolean;
    principal_amount: string;
    daily_rate_pct_snapshot: string;
    total_yield_earned: string;
    days_settled: number;
    status: 'ACTIVE' | 'MATURED';
    activated_at: Date;
    maturity_at: Date;
    last_settled_date: string | null;
    principal_returned_at: Date | null;
    created_at: Date;
    updated_at: Date;
  }>(
    `
    SELECT
      uvp.id,
      uvp.user_id,
      uvp.plan_id,
      cvp.plan_code,
      cvp.plan_name,
      cvp.duration_days,
      cvp.return_principal_on_maturity,
      ROUND(uvp.principal_amount, 8)::text AS principal_amount,
      ROUND(uvp.daily_rate_pct_snapshot, 8)::text AS daily_rate_pct_snapshot,
      ROUND(uvp.total_yield_earned, 8)::text AS total_yield_earned,
      uvp.days_settled,
      uvp.status,
      uvp.activated_at,
      uvp.maturity_at,
      uvp.last_settled_date::text AS last_settled_date,
      uvp.principal_returned_at,
      uvp.created_at,
      uvp.updated_at
    FROM user_vault_positions uvp
    JOIN chrono_vault_plans cvp ON cvp.id = uvp.plan_id
    WHERE uvp.user_id = $1
    ORDER BY uvp.activated_at DESC, uvp.created_at DESC
    `,
    [userId]
  );

  return res.rows.map((row) => {
    const durationDays = Number(row.duration_days);
    const daysSettled = Number(row.days_settled || 0);
    const daysRemaining = Math.max(0, durationDays - daysSettled);
    const progressPct =
      durationDays > 0
        ? Math.min(100, (daysSettled / durationDays) * 100).toFixed(4)
        : '0.0000';

    return {
      id: row.id,
      userId: row.user_id,
      planId: row.plan_id,
      planCode: row.plan_code,
      planName: row.plan_name,
      durationDays,
      returnPrincipalOnMaturity: Boolean(row.return_principal_on_maturity),
      principalAmount: row.principal_amount,
      dailyRatePctSnapshot: row.daily_rate_pct_snapshot,
      totalYieldEarned: row.total_yield_earned,
      daysSettled,
      daysRemaining,
      progressPct,
      status: row.status,
      activatedAt: new Date(row.activated_at).toISOString(),
      maturityAt: new Date(row.maturity_at).toISOString(),
      lastSettledDate: row.last_settled_date,
      principalReturnedAt: row.principal_returned_at
        ? new Date(row.principal_returned_at).toISOString()
        : null,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  });
}

/**
 * Returns daily yield payout history for a user's Chrono Vault positions.
 */
export async function getUserChronoVaultYieldPayouts(
  userId: string,
  limit = 50,
  dbClient?: DatabaseClient
): Promise<ChronoVaultYieldPayoutRecord[]> {
  const db = dbClient || (await getDb());
  const safeLimit = Math.min(200, Math.max(1, Number(limit) || 50));

  const res = await db.query<{
    id: string;
    position_id: string;
    user_id: string;
    plan_code: ChronoVaultPlanCode;
    plan_name: string;
    epoch_date: string;
    daily_rate_pct_snapshot: string;
    yield_amount: string;
    ledger_entry_id: string | null;
    settled_at: Date;
    created_at: Date;
  }>(
    `
    SELECT
      vyp.id,
      vyp.position_id,
      vyp.user_id,
      cvp.plan_code,
      cvp.plan_name,
      vyp.epoch_date::text AS epoch_date,
      ROUND(uvp.daily_rate_pct_snapshot, 8)::text AS daily_rate_pct_snapshot,
      ROUND(vyp.yield_amount, 8)::text AS yield_amount,
      vyp.ledger_entry_id,
      vyp.settled_at,
      vyp.created_at
    FROM vault_yield_payouts vyp
    JOIN user_vault_positions uvp ON uvp.id = vyp.position_id
    JOIN chrono_vault_plans cvp ON cvp.id = uvp.plan_id
    WHERE vyp.user_id = $1
    ORDER BY vyp.epoch_date DESC, vyp.settled_at DESC
    LIMIT $2
    `,
    [userId, safeLimit]
  );

  return res.rows.map((row) => ({
    id: row.id,
    positionId: row.position_id,
    userId: row.user_id,
    planCode: row.plan_code,
    planName: row.plan_name,
    epochDate: row.epoch_date,
    dailyRatePctSnapshot: row.daily_rate_pct_snapshot,
    yieldAmount: row.yield_amount,
    ledgerEntryId: row.ledger_entry_id,
    settledAt: new Date(row.settled_at).toISOString(),
    createdAt: new Date(row.created_at).toISOString(),
  }));
}
