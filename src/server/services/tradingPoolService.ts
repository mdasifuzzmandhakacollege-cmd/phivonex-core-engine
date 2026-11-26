import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { getDb, DatabaseClient } from '../db/db';
import { generateLedgerTransactionPublicId } from '../utils/idGenerator';
import { syncUserLedger } from './walletLedgerService';
import {
  TradingTierCode,
  assertFeatureSwitchEnabled,
  getAlphaRedemptionFeePct,
} from './unilevelConfigService';

export const DECIMAL_SCALE = 100_000_000n; // 10^8 for NUMERIC(20,8)
export const MIN_TRADING_POOL_INVESTMENT_SCALED = 200_00000000n; // $200.00000000
export const WEEKLY_CYCLE_MS = 7 * 24 * 60 * 60 * 1000;

export interface TradingPoolTierRecord {
  id: string;
  tierCode: TradingTierCode;
  tierName: string;
  minAmount: string;
  maxAmount: string | null;
  minDailyRatePct: string;
  maxDailyRatePct: string;
  isActive: boolean;
}

export interface UserTradingPositionRecord {
  id: string;
  userId: string;
  tierId: string;
  tierCode: TradingTierCode;
  tierName: string;
  minDailyRatePct: string;
  maxDailyRatePct: string;
  principalAmount: string;
  totalYieldEarned: string;
  status: 'ACTIVE' | 'CLOSED' | 'REDEEMED';
  activatedAt: string;
  unlockEligibleAt: string;
  isRedeemable: boolean;
  lastSettledDate: string | null;
  closedAt: string | null;
  redeemedAt: string | null;
  settlementFeePct: string;
  settlementFeeUsd: string;
  netRedeemedUsd: string;
  createdAt: string;
  updatedAt: string;
}

export interface QuantumAlphaRedemptionResult {
  position: UserTradingPositionRecord;
  principalUsd: string;
  settlementFeePct: string;
  settlementFeeUsd: string;
  netPayoutUsd: string;
  feeBreakdown: {
    liquidityExitFeePct: string;
    liquidityExitFeeUsd: string;
    executionClearingFeePct: string;
    executionClearingFeeUsd: string;
    custodyReserveFeePct: string;
    custodyReserveFeeUsd: string;
  };
  ledgerEntry: {
    id: string;
    publicTxnId: string;
    amount: string;
    currency: 'USDT';
    sourceType: 'TRADING_POOL_PRINCIPAL_REDEMPTION';
    status: 'SETTLED';
  };
  walletBalanceBeforeUsd: string;
  walletBalanceAfterUsd: string;
  idempotentReplay: boolean;
}

export interface TradingYieldPayoutRecord {
  id: string;
  positionId: string;
  userId: string;
  tierCode?: TradingTierCode;
  tierName?: string;
  tradingDate: string;
  appliedRatePct: string;
  yieldAmount: string;
  ledgerEntryId: string | null;
  settledAt: string;
  createdAt: string;
}

export interface PublicMarketPerformanceEntry {
  tradingDate: string;
  tierCode: TradingTierCode;
  tierName: string;
  yieldRatePct: string;
  sessionStatus: 'SETTLED_SESSION';
}

export interface TradingPoolInvestmentResult {
  position: UserTradingPositionRecord;
  tier: TradingPoolTierRecord;
  ledgerEntry: {
    id: string;
    publicTxnId: string;
    amount: string;
    currency: 'USDT';
    sourceType: 'TRADING_POOL_DEPOSIT';
    status: 'SETTLED';
  };
  walletBalanceBeforeUsd: string;
  walletBalanceAfterUsd: string;
  spotCommissionUsd: '0.00000000';
  binaryVolumeAddedUsd: '0.00000000';
}

/**
 * Converts a numeric string or number to an exact BigInt scaled by 10^8 (NUMERIC(20,8)),
 * using half-up rounding at the 9th decimal place with zero IEEE-754 floating-point drift.
 */
export function parseAmountToScaledBigInt(value: number | string): bigint {
  if (value === null || value === undefined) {
    throw new Error('INVALID_DECIMAL: Value is required.');
  }
  const raw = typeof value === 'number' ? value.toFixed(10) : String(value).trim();
  if (!/^-?\d+(\.\d+)?$/.test(raw)) {
    throw new Error(`INVALID_DECIMAL: '${String(value)}' is not a valid decimal number.`);
  }

  const isNegative = raw.startsWith('-');
  const unsigned = isNegative ? raw.slice(1) : raw;
  const [intPartStr, fracPartRaw = ''] = unsigned.split('.');

  const paddedFrac = (fracPartRaw + '000000000').slice(0, 9);
  const first8 = paddedFrac.slice(0, 8);
  const ninthDigit = Number(paddedFrac[8] || '0');

  let scaled = BigInt(intPartStr) * DECIMAL_SCALE + BigInt(first8);
  if (ninthDigit >= 5) {
    scaled += 1n;
  }

  return isNegative ? -scaled : scaled;
}

/**
 * Formats a 10^8-scaled BigInt as an exact NUMERIC(20,8) string ("XXXX.YYYYYYYY").
 */
export function formatScaledBigInt(scaled: bigint): string {
  const isNegative = scaled < 0n;
  const abs = isNegative ? -scaled : scaled;
  const intPart = abs / DECIMAL_SCALE;
  const fracPart = (abs % DECIMAL_SCALE).toString().padStart(8, '0');
  return `${isNegative ? '-' : ''}${intPart.toString()}.${fracPart}`;
}

/**
 * Normalizes a numeric input to an exact 8-decimal string ("XXXX.YYYYYYYY").
 */
export function toNumeric8String(value: number | string): string {
  return formatScaledBigInt(parseAmountToScaledBigInt(value));
}

/**
 * Exact NUMERIC(20,8) calculation for daily trading yield:
 * yield_amount = round8(principal_amount * applied_rate_pct / 100)
 */
export function calculateDailyYieldExact(
  principalAmount: number | string,
  appliedRatePct: number | string
): {
  yieldAmountStr: string;
  yieldAmountScaled: bigint;
  yieldAmountNum: number;
} {
  const principalScaled = parseAmountToScaledBigInt(principalAmount);
  const rateScaled = parseAmountToScaledBigInt(appliedRatePct);

  if (principalScaled <= 0n || rateScaled <= 0n) {
    return {
      yieldAmountStr: '0.00000000',
      yieldAmountScaled: 0n,
      yieldAmountNum: 0,
    };
  }

  // principalScaled (10^8) * rateScaled (10^8) = 10^16.
  // Divide by 100 * 10^8 = 10^10 (10_000_000_000n) with half-up rounding:
  const divisor = 10_000_000_000n;
  const halfDivisor = 5_000_000_000n;
  const yieldAmountScaled = (principalScaled * rateScaled + halfDivisor) / divisor;
  const yieldAmountStr = formatScaledBigInt(yieldAmountScaled);

  return {
    yieldAmountStr,
    yieldAmountScaled,
    yieldAmountNum: Number(yieldAmountStr),
  };
}

/**
 * Queries the user's exact Main USDT Wallet spendable balance in NUMERIC(20,8) precision.
 */
export async function getUserMainUsdtBalanceExact(
  userId: string,
  dbClient?: DatabaseClient
): Promise<{
  availableBalanceStr: string;
  availableBalanceScaled: bigint;
  ledgerBalanceStr: string;
  ledgerBalanceScaled: bigint;
  nodeVaultBalanceStr: string;
  nodeVaultBalanceScaled: bigint;
}> {
  const db = dbClient || (await getDb());

  const balRes = await db.query<{
    ledger_balance: string;
    node_vault_balance: string;
  }>(
    `
    SELECT
      ROUND(
        GREATEST(
          0,
          COALESCE(SUM(CASE
            WHEN entry_type = 'CREDIT' THEN amount
            WHEN entry_type = 'DEBIT' THEN -amount
            WHEN entry_type = 'REVERSAL' AND source_type = 'WITHDRAWAL' THEN amount
            WHEN entry_type = 'REVERSAL' THEN -amount
            ELSE 0
          END), 0)
        ),
        8
      )::text AS ledger_balance,
      ROUND(
        GREATEST(
          0,
          COALESCE(SUM(CASE
            WHEN source_type = 'WALLET_TRANSFER' AND entry_type = 'CREDIT' AND (LOWER(description) LIKE '%main%' OR LOWER(description) LIKE '%transfer from%') THEN amount
            WHEN source_type = 'NODE_PURCHASE' AND entry_type = 'DEBIT' THEN -amount
            ELSE 0
          END), 0)
        ),
        8
      )::text AS node_vault_balance
    FROM financial_ledger_entries
    WHERE user_id = $1
      AND (status = 'SETTLED' OR status IS NULL)
      AND (UPPER(currency) IN ('USDT', 'USD') OR currency IS NULL OR currency = '')
    `,
    [userId]
  );

  const ledgerScaled = parseAmountToScaledBigInt(balRes.rows[0]?.ledger_balance || '0.00000000');
  const vaultScaled = parseAmountToScaledBigInt(balRes.rows[0]?.node_vault_balance || '0.00000000');
  const mainScaled = ledgerScaled > vaultScaled ? ledgerScaled - vaultScaled : 0n;

  return {
    availableBalanceStr: formatScaledBigInt(mainScaled),
    availableBalanceScaled: mainScaled,
    ledgerBalanceStr: formatScaledBigInt(ledgerScaled),
    ledgerBalanceScaled: ledgerScaled,
    nodeVaultBalanceStr: formatScaledBigInt(vaultScaled),
    nodeVaultBalanceScaled: vaultScaled,
  };
}

/**
 * Resolves the active PHIVONEX QUANTUM ALPHA™ tier for a given USD investment amount:
 * - $200.00000000 to $1,000.00000000 -> ALPHA_CORE
 * - $1,000.00000001 to $5,000.00000000 -> ALPHA_PRIME
 * - $5,000.00000001 and above -> ALPHA_SOVEREIGN
 */
export async function resolveTradingTierForAmount(
  amountUsd: number | string,
  dbClient?: DatabaseClient
): Promise<TradingPoolTierRecord> {
  let amountScaled: bigint;
  try {
    amountScaled = parseAmountToScaledBigInt(amountUsd);
  } catch {
    const err: any = new Error('INVALID_AMOUNT: Investment amount must be a valid positive number.');
    err.code = 'INVALID_AMOUNT';
    err.statusCode = 400;
    throw err;
  }

  if (amountScaled < MIN_TRADING_POOL_INVESTMENT_SCALED) {
    const err: any = new Error(
      `MINIMUM_DEPOSIT_ERROR: Minimum investment for PHIVONEX QUANTUM ALPHA™ is $200.00 USDT (received $${formatScaledBigInt(amountScaled)}).`
    );
    err.code = 'MINIMUM_DEPOSIT_ERROR';
    err.statusCode = 400;
    throw err;
  }

  const amountStr = formatScaledBigInt(amountScaled);
  const db = dbClient || (await getDb());

  const res = await db.query<{
    id: string;
    tier_code: TradingTierCode;
    tier_name: string;
    min_amount: string;
    max_amount: string | null;
    min_daily_rate_pct: string;
    max_daily_rate_pct: string;
    is_active: boolean;
  }>(
    `
    SELECT
      id,
      tier_code,
      tier_name,
      ROUND(min_amount, 8)::text AS min_amount,
      CASE WHEN max_amount IS NULL THEN NULL ELSE ROUND(max_amount, 8)::text END AS max_amount,
      ROUND(min_daily_rate_pct, 8)::text AS min_daily_rate_pct,
      ROUND(max_daily_rate_pct, 8)::text AS max_daily_rate_pct,
      is_active
    FROM trading_pool_tiers
    WHERE is_active = TRUE
      AND min_amount <= $1::numeric(20,8)
      AND (max_amount IS NULL OR max_amount >= $1::numeric(20,8))
    ORDER BY min_amount DESC
    LIMIT 1
    `,
    [amountStr]
  );

  if (res.rowCount === 0) {
    const err: any = new Error(
      `NO_MATCHING_TIER: No active PHIVONEX QUANTUM ALPHA™ tier matches amount $${amountStr} USDT.`
    );
    err.code = 'NO_MATCHING_TIER';
    err.statusCode = 400;
    throw err;
  }

  const row = res.rows[0];
  return {
    id: row.id,
    tierCode: row.tier_code,
    tierName: row.tier_name,
    minAmount: row.min_amount,
    maxAmount: row.max_amount,
    minDailyRatePct: row.min_daily_rate_pct,
    maxDailyRatePct: row.max_daily_rate_pct,
    isActive: Boolean(row.is_active),
  };
}

/**
 * Subscribes a user to PHIVONEX QUANTUM ALPHA™ Algorithmic Trading Pool.
 * - Enforces $200.00000000 minimum deposit
 * - Auto-routes to ALPHA_CORE ($200–$1,000), ALPHA_PRIME ($1,000.00000001–$5,000), or ALPHA_SOVEREIGN ($5,000.00000001+)
 * - Executes inside a single PostgreSQL ACID transaction with row-level FOR UPDATE lock
 * - Deducts principal from Main USDT Wallet and records SETTLED DEBIT in financial_ledger_entries
 * - Generates $0 spot commission and 0 binary volume
 */
export async function investInTradingPool(params: {
  userId: string;
  amountUsd: number | string;
  activatedAt?: Date;
}): Promise<TradingPoolInvestmentResult> {
  const { userId, amountUsd, activatedAt } = params;

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
    const err: any = new Error('INVALID_AMOUNT: Investment amount must be a valid positive number.');
    err.code = 'INVALID_AMOUNT';
    err.statusCode = 400;
    throw err;
  }

  if (amountScaled < MIN_TRADING_POOL_INVESTMENT_SCALED) {
    const err: any = new Error(
      `MINIMUM_DEPOSIT_ERROR: Minimum investment for PHIVONEX QUANTUM ALPHA™ is $200.00 USDT (received $${formatScaledBigInt(amountScaled)}).`
    );
    err.code = 'MINIMUM_DEPOSIT_ERROR';
    err.statusCode = 400;
    throw err;
  }

  const amountStr = formatScaledBigInt(amountScaled);
  const db = await getDb();

  // 0. Enforce Master Ecosystem Feature Switch: Quantum Alpha Subscriptions
  await assertFeatureSwitchEnabled(
    'quantum_alpha_subscriptions_enabled',
    'PHIVONEX QUANTUM ALPHA™ Subscriptions',
    db
  );

  const result = await db.transaction(async (trx) => {
    // 1. Lock user row (FOR UPDATE) to serialize all wallet balance checks and mutations for this user
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

    // 2. Sync any unposted ledger credits inside the same transaction
    await syncUserLedger(userId, trx);

    // 3. Resolve matching active tier from trading_pool_tiers
    const tier = await resolveTradingTierForAmount(amountStr, trx);

    // 4. Verify Main USDT Wallet available balance >= amountUsd
    const { availableBalanceStr, availableBalanceScaled } = await getUserMainUsdtBalanceExact(userId, trx);
    if (availableBalanceScaled < amountScaled) {
      const err: any = new Error(
        `INSUFFICIENT_BALANCE: Available Main USDT Wallet balance ($${availableBalanceStr} USDT) is insufficient for $${amountStr} USDT investment.`
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
    const effectiveUnlockEligibleAt = new Date(effectiveActivatedAt.getTime() + WEEKLY_CYCLE_MS);
    const positionRef = `QALPHA-${positionId.slice(0, 8).toUpperCase()}`;

    // 5. Deduct amountUsd from Main USDT Wallet via SETTLED DEBIT in financial_ledger_entries
    await trx.query(
      `
      INSERT INTO financial_ledger_entries (
        id, public_txn_id, user_id, entry_type, source_type, source_id,
        source_ref, description, amount, currency, status, created_at
      )
      VALUES ($1, $2, $3, 'DEBIT', 'TRADING_POOL_DEPOSIT', $4, $5, $6, $7::numeric(20,8), 'USDT', 'SETTLED', $8)
      `,
      [
        ledgerEntryId,
        publicTxnId,
        userId,
        positionId,
        positionRef,
        `PHIVONEX QUANTUM ALPHA™ Subscription (${tier.tierName})`,
        amountStr,
        effectiveActivatedAt,
      ]
    );

    // 6. Insert ACTIVE position into user_trading_positions with 7-day unlock_eligible_at
    const posRes = await trx.query<{
      id: string;
      user_id: string;
      tier_id: string;
      principal_amount: string;
      total_yield_earned: string;
      status: 'ACTIVE' | 'CLOSED' | 'REDEEMED';
      activated_at: Date;
      unlock_eligible_at: Date;
      last_settled_date: string | null;
      closed_at: Date | null;
      redeemed_at: Date | null;
      settlement_fee_pct: string;
      settlement_fee_usd: string;
      net_redeemed_usd: string;
      created_at: Date;
      updated_at: Date;
    }>(
      `
      INSERT INTO user_trading_positions (
        id, user_id, tier_id, principal_amount, total_yield_earned,
        status, activated_at, unlock_eligible_at, last_settled_date, closed_at,
        redeemed_at, settlement_fee_pct, settlement_fee_usd, net_redeemed_usd,
        created_at, updated_at
      )
      VALUES (
        $1, $2, $3, $4::numeric(20,8), 0.00000000,
        'ACTIVE', $5, $6, NULL, NULL,
        NULL, 0.0000, 0.00000000, 0.00000000,
        $5, $5
      )
      RETURNING
        id,
        user_id,
        tier_id,
        ROUND(principal_amount, 8)::text AS principal_amount,
        ROUND(total_yield_earned, 8)::text AS total_yield_earned,
        status,
        activated_at,
        unlock_eligible_at,
        last_settled_date::text AS last_settled_date,
        closed_at,
        redeemed_at,
        ROUND(settlement_fee_pct, 4)::text AS settlement_fee_pct,
        ROUND(settlement_fee_usd, 8)::text AS settlement_fee_usd,
        ROUND(net_redeemed_usd, 8)::text AS net_redeemed_usd,
        created_at,
        updated_at
      `,
      [positionId, userId, tier.id, amountStr, effectiveActivatedAt, effectiveUnlockEligibleAt]
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
      VALUES ($1, $2, 'TRADING_POOL_INVESTMENT', 'INFO', $3::jsonb, NOW())
      `,
      [
        `TRACE-QALPHA-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
        userId,
        JSON.stringify({
          positionId,
          tierCode: tier.tierCode,
          tierName: tier.tierName,
          principalAmountUsd: amountStr,
          unlockEligibleAt: new Date(posRow.unlock_eligible_at).toISOString(),
          ledgerEntryId,
          publicTxnId,
        }),
      ]
    );

    const unlockIso = new Date(posRow.unlock_eligible_at).toISOString();

    return {
      position: {
        id: posRow.id,
        userId: posRow.user_id,
        tierId: posRow.tier_id,
        tierCode: tier.tierCode,
        tierName: tier.tierName,
        minDailyRatePct: tier.minDailyRatePct,
        maxDailyRatePct: tier.maxDailyRatePct,
        principalAmount: posRow.principal_amount,
        totalYieldEarned: posRow.total_yield_earned,
        status: posRow.status,
        activatedAt: new Date(posRow.activated_at).toISOString(),
        unlockEligibleAt: unlockIso,
        isRedeemable: posRow.status === 'ACTIVE' && Date.now() >= new Date(posRow.unlock_eligible_at).getTime(),
        lastSettledDate: posRow.last_settled_date,
        closedAt: posRow.closed_at ? new Date(posRow.closed_at).toISOString() : null,
        redeemedAt: posRow.redeemed_at ? new Date(posRow.redeemed_at).toISOString() : null,
        settlementFeePct: posRow.settlement_fee_pct || '0.0000',
        settlementFeeUsd: posRow.settlement_fee_usd || '0.00000000',
        netRedeemedUsd: posRow.net_redeemed_usd || '0.00000000',
        createdAt: new Date(posRow.created_at).toISOString(),
        updatedAt: new Date(posRow.updated_at).toISOString(),
      },
      tier,
      ledgerEntry: {
        id: ledgerEntryId,
        publicTxnId,
        amount: amountStr,
        currency: 'USDT' as const,
        sourceType: 'TRADING_POOL_DEPOSIT' as const,
        status: 'SETTLED' as const,
      },
      walletBalanceBeforeUsd: availableBalanceStr,
      walletBalanceAfterUsd: walletBalanceAfterStr,
      spotCommissionUsd: '0.00000000' as const,
      binaryVolumeAddedUsd: '0.00000000' as const,
    };
  });

  // TASK-08: Trigger 7-Stage Unilevel Career & Leadership Rank evaluation for investor + uplines post-commit
  try {
    const { evaluateAndPromoteUserAndAncestors } = await import('./unilevelRankService');
    await evaluateAndPromoteUserAndAncestors(userId);
  } catch (rankErr) {
    console.warn('[TradingPoolService] Notice evaluating Unilevel ranks post-investment:', rankErr);
  }

  // Non-blocking transactional email confirmation post-commit
  import('./emailService')
    .then(({ sendTransactionEmail }) =>
      sendTransactionEmail({
        userId,
        eventType: 'QUANTUM_ALPHA_ALLOCATED',
        metadata: {
          positionId: result.position.id,
          amountUsd: result.position.principalAmount,
          tierCode: result.tier.tierCode,
          tierName: result.tier.tierName,
          yieldSchedule: 'Monday–Friday (5 Trading Days/Week)',
          unlockEligibleAt: result.position.unlockEligibleAt,
          publicTxnId: result.ledgerEntry.publicTxnId,
        },
      })
    )
    .catch((emailErr) => {
      console.warn('[TradingPoolService] Non-blocking allocation email error:', emailErr);
    });

  return result;
}

/**
 * Redeems principal for an ACTIVE Quantum Alpha™ trading pool position after the 7-day weekly liquidity cycle.
 * - Executes inside an ACID PostgreSQL transaction with row-level FOR UPDATE locks on user & position.
 * - Enforces 7-day lock: rejects with HTTP 400 if NOW() < unlock_eligible_at.
 * - Deducts admin-configurable alpha_redemption_fee_pct (default 15.0000%) using exact BigInt NUMERIC(20,8) math.
 * - Credits net payout (85.00%) to Main USDT Wallet via SETTLED CREDIT in financial_ledger_entries.
 */
export async function redeemQuantumAlphaPrincipal(params: {
  userId: string;
  positionId: string;
  idempotencyKey?: string;
}): Promise<QuantumAlphaRedemptionResult> {
  const { userId, positionId } = params;
  const cleanIdempotencyKey = params.idempotencyKey ? String(params.idempotencyKey).trim().slice(0, 128) : null;

  if (!userId || !String(userId).trim()) {
    const err: any = new Error('UNAUTHORIZED: Valid userId is required.');
    err.code = 'UNAUTHORIZED';
    err.statusCode = 401;
    throw err;
  }

  if (!positionId || !String(positionId).trim()) {
    const err: any = new Error('VALIDATION_ERROR: positionId is required.');
    err.code = 'VALIDATION_ERROR';
    err.statusCode = 400;
    throw err;
  }

  const db = await getDb();

  const redemptionResult = await db.transaction<QuantumAlphaRedemptionResult>(async (trx) => {
    // 1. Lock user row to serialize balance updates
    const userRes = await trx.query<{ id: string }>(
      `SELECT id FROM users WHERE id = $1 FOR UPDATE`,
      [userId]
    );
    if (userRes.rowCount === 0) {
      const err: any = new Error('USER_NOT_FOUND: User account does not exist.');
      err.code = 'USER_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }

    await syncUserLedger(userId, trx);

    // 2. Lock target position row FOR UPDATE
    const posRes = await trx.query<{
      id: string;
      user_id: string;
      tier_id: string;
      tier_code: TradingTierCode;
      tier_name: string;
      min_daily_rate_pct: string;
      max_daily_rate_pct: string;
      principal_amount: string;
      total_yield_earned: string;
      status: 'ACTIVE' | 'CLOSED' | 'REDEEMED';
      activated_at: Date;
      unlock_eligible_at: Date | null;
      last_settled_date: string | null;
      closed_at: Date | null;
      redeemed_at: Date | null;
      settlement_fee_pct: string;
      settlement_fee_usd: string;
      net_redeemed_usd: string;
      redemption_idempotency_key: string | null;
      created_at: Date;
      updated_at: Date;
    }>(
      `
      SELECT
        utp.id,
        utp.user_id,
        utp.tier_id,
        tpt.tier_code,
        tpt.tier_name,
        ROUND(tpt.min_daily_rate_pct, 8)::text AS min_daily_rate_pct,
        ROUND(tpt.max_daily_rate_pct, 8)::text AS max_daily_rate_pct,
        ROUND(utp.principal_amount, 8)::text AS principal_amount,
        ROUND(utp.total_yield_earned, 8)::text AS total_yield_earned,
        utp.status,
        utp.activated_at,
        utp.unlock_eligible_at,
        utp.last_settled_date::text AS last_settled_date,
        utp.closed_at,
        utp.redeemed_at,
        ROUND(COALESCE(utp.settlement_fee_pct, 0), 4)::text AS settlement_fee_pct,
        ROUND(COALESCE(utp.settlement_fee_usd, 0), 8)::text AS settlement_fee_usd,
        ROUND(COALESCE(utp.net_redeemed_usd, 0), 8)::text AS net_redeemed_usd,
        utp.redemption_idempotency_key,
        utp.created_at,
        utp.updated_at
      FROM user_trading_positions utp
      JOIN trading_pool_tiers tpt ON tpt.id = utp.tier_id
      WHERE utp.id = $1
      FOR UPDATE OF utp
      `,
      [positionId]
    );

    if (posRes.rowCount === 0) {
      const err: any = new Error('POSITION_NOT_FOUND: Trading pool position not found.');
      err.code = 'POSITION_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }

    const row = posRes.rows[0];
    if (row.user_id !== userId) {
      const err: any = new Error('FORBIDDEN: You do not have permission to redeem this position.');
      err.code = 'FORBIDDEN';
      err.statusCode = 403;
      throw err;
    }

    const effectiveUnlockAt = row.unlock_eligible_at
      ? new Date(row.unlock_eligible_at)
      : new Date(new Date(row.activated_at).getTime() + WEEKLY_CYCLE_MS);
    const unlockIso = effectiveUnlockAt.toISOString();

    // 3. Idempotent replay check if already redeemed with same idempotencyKey
    if (
      row.status === 'REDEEMED' &&
      cleanIdempotencyKey &&
      row.redemption_idempotency_key === cleanIdempotencyKey
    ) {
      const { availableBalanceStr } = await getUserMainUsdtBalanceExact(userId, trx);
      const existingLedgerRes = await trx.query<{ id: string; public_txn_id: string }>(
        `
        SELECT id, public_txn_id
        FROM financial_ledger_entries
        WHERE user_id = $1 AND source_type = 'TRADING_POOL_PRINCIPAL_REDEMPTION' AND source_id = $2
        LIMIT 1
        `,
        [userId, positionId]
      );
      const totalFeeScaled = parseAmountToScaledBigInt(row.settlement_fee_usd);
      const liqFeeScaled = (totalFeeScaled * 50n) / 100n;
      const execFeeScaled = (totalFeeScaled * 30n) / 100n;
      const custFeeScaled = totalFeeScaled - liqFeeScaled - execFeeScaled;
      const feePctNum = Number(row.settlement_fee_pct || '15.0000');

      return {
        position: {
          id: row.id,
          userId: row.user_id,
          tierId: row.tier_id,
          tierCode: row.tier_code,
          tierName: row.tier_name,
          minDailyRatePct: row.min_daily_rate_pct,
          maxDailyRatePct: row.max_daily_rate_pct,
          principalAmount: row.principal_amount,
          totalYieldEarned: row.total_yield_earned,
          status: row.status,
          activatedAt: new Date(row.activated_at).toISOString(),
          unlockEligibleAt: unlockIso,
          isRedeemable: false,
          lastSettledDate: row.last_settled_date,
          closedAt: row.closed_at ? new Date(row.closed_at).toISOString() : null,
          redeemedAt: row.redeemed_at ? new Date(row.redeemed_at).toISOString() : null,
          settlementFeePct: row.settlement_fee_pct,
          settlementFeeUsd: row.settlement_fee_usd,
          netRedeemedUsd: row.net_redeemed_usd,
          createdAt: new Date(row.created_at).toISOString(),
          updatedAt: new Date(row.updated_at).toISOString(),
        },
        principalUsd: row.principal_amount,
        settlementFeePct: row.settlement_fee_pct,
        settlementFeeUsd: row.settlement_fee_usd,
        netPayoutUsd: row.net_redeemed_usd,
        feeBreakdown: {
          liquidityExitFeePct: (feePctNum * 0.5).toFixed(2),
          liquidityExitFeeUsd: formatScaledBigInt(liqFeeScaled),
          executionClearingFeePct: (feePctNum * 0.3).toFixed(2),
          executionClearingFeeUsd: formatScaledBigInt(execFeeScaled),
          custodyReserveFeePct: (feePctNum * 0.2).toFixed(2),
          custodyReserveFeeUsd: formatScaledBigInt(custFeeScaled),
        },
        ledgerEntry: {
          id: existingLedgerRes.rows[0]?.id || '',
          publicTxnId: existingLedgerRes.rows[0]?.public_txn_id || '',
          amount: row.net_redeemed_usd,
          currency: 'USDT',
          sourceType: 'TRADING_POOL_PRINCIPAL_REDEMPTION',
          status: 'SETTLED',
        },
        walletBalanceBeforeUsd: availableBalanceStr,
        walletBalanceAfterUsd: availableBalanceStr,
        idempotentReplay: true,
      };
    }

    if (row.status !== 'ACTIVE') {
      const err: any = new Error(`POSITION_NOT_ACTIVE: Position is already ${row.status} and cannot be redeemed again.`);
      err.code = 'POSITION_NOT_ACTIVE';
      err.statusCode = 400;
      throw err;
    }

    // 4. Enforce 7-Day Weekly Liquidity Cycle Lock
    if (Date.now() < effectiveUnlockAt.getTime()) {
      const err: any = new Error(
        `Weekly 7-day liquidity cycle in progress. Principal redemption unlocks on ${unlockIso}.`
      );
      err.code = 'WEEKLY_CYCLE_LOCKED';
      err.statusCode = 400;
      err.unlockEligibleAt = unlockIso;
      throw err;
    }

    // 5. Read admin-configurable alpha_redemption_fee_pct (default 15.0000%) & compute exact BigInt NUMERIC(20,8) math
    const feePctStr = await getAlphaRedemptionFeePct(trx);
    const feePctNum = Number(feePctStr);
    const principalScaled = parseAmountToScaledBigInt(row.principal_amount);
    const feePctScaled = parseAmountToScaledBigInt(feePctStr);

    const divisor = 10_000_000_000n; // 100 * 10^8
    const halfDivisor = 5_000_000_000n;
    const totalFeeScaled = (principalScaled * feePctScaled + halfDivisor) / divisor;
    const netPayoutScaled = principalScaled > totalFeeScaled ? principalScaled - totalFeeScaled : 0n;

    // Exact itemized breakdown summing cleanly to totalFeeScaled (50% / 30% / 20% of fee -> 7.50% / 4.50% / 3.00% at 15%)
    const liqFeeScaled = (totalFeeScaled * 50n) / 100n;
    const execFeeScaled = (totalFeeScaled * 30n) / 100n;
    const custFeeScaled = totalFeeScaled - liqFeeScaled - execFeeScaled;

    const totalFeeStr = formatScaledBigInt(totalFeeScaled);
    const netPayoutStr = formatScaledBigInt(netPayoutScaled);

    const { availableBalanceStr: balanceBeforeStr, availableBalanceScaled: balanceBeforeScaled } =
      await getUserMainUsdtBalanceExact(userId, trx);

    // 6. Mark position REDEEMED atomically
    const updateRes = await trx.query<{
      redeemed_at: Date;
      closed_at: Date;
      updated_at: Date;
    }>(
      `
      UPDATE user_trading_positions
      SET
        status = 'REDEEMED',
        redeemed_at = NOW(),
        closed_at = NOW(),
        settlement_fee_pct = $2::numeric(10,4),
        settlement_fee_usd = $3::numeric(20,8),
        net_redeemed_usd = $4::numeric(20,8),
        redemption_idempotency_key = $5,
        updated_at = NOW()
      WHERE id = $1 AND status = 'ACTIVE'
      RETURNING redeemed_at, closed_at, updated_at
      `,
      [positionId, feePctStr, totalFeeStr, netPayoutStr, cleanIdempotencyKey]
    );

    if (updateRes.rowCount === 0) {
      const err: any = new Error('CONCURRENT_REDEMPTION: Position state changed during redemption.');
      err.code = 'CONCURRENT_REDEMPTION';
      err.statusCode = 409;
      throw err;
    }

    const updatedTimestamps = updateRes.rows[0];
    const ledgerEntryId = uuidv4();
    const publicTxnId = generateLedgerTransactionPublicId();
    const sourceRef = `QALPHA-REDEEM-${positionId.slice(0, 8).toUpperCase()}`;

    // 7. Credit Net Principal Payout directly to Main USDT Wallet in financial_ledger_entries
    await trx.query(
      `
      INSERT INTO financial_ledger_entries (
        id, public_txn_id, user_id, entry_type, source_type, source_id,
        source_ref, description, amount, currency, status, created_at
      )
      VALUES ($1, $2, $3, 'CREDIT', 'TRADING_POOL_PRINCIPAL_REDEMPTION', $4, $5, $6, $7::numeric(20,8), 'USDT', 'SETTLED', NOW())
      `,
      [
        ledgerEntryId,
        publicTxnId,
        userId,
        positionId,
        sourceRef,
        `PHIVONEX QUANTUM ALPHA™ Principal Redemption (${row.tier_name}) — Net ${(100 - feePctNum).toFixed(2)}% credited after ${feePctNum.toFixed(2)}% settlement deduction`,
        netPayoutStr,
      ]
    );

    // 8. Record security audit log entry
    await trx.query(
      `
      INSERT INTO security_audit_logs (
        trace_id, actor_user_id, action_type, severity, payload, created_at
      )
      VALUES ($1, $2, 'TRADING_POOL_PRINCIPAL_REDEMPTION', 'INFO', $3::jsonb, NOW())
      `,
      [
        `TRACE-QALPHA-REDEEM-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
        userId,
        JSON.stringify({
          positionId,
          tierCode: row.tier_code,
          principalUsd: row.principal_amount,
          settlementFeePct: feePctStr,
          settlementFeeUsd: totalFeeStr,
          netPayoutUsd: netPayoutStr,
          ledgerEntryId,
          publicTxnId,
        }),
      ]
    );

    const balanceAfterStr = formatScaledBigInt(balanceBeforeScaled + netPayoutScaled);

    return {
      position: {
        id: row.id,
        userId: row.user_id,
        tierId: row.tier_id,
        tierCode: row.tier_code,
        tierName: row.tier_name,
        minDailyRatePct: row.min_daily_rate_pct,
        maxDailyRatePct: row.max_daily_rate_pct,
        principalAmount: row.principal_amount,
        totalYieldEarned: row.total_yield_earned,
        status: 'REDEEMED',
        activatedAt: new Date(row.activated_at).toISOString(),
        unlockEligibleAt: unlockIso,
        isRedeemable: false,
        lastSettledDate: row.last_settled_date,
        closedAt: new Date(updatedTimestamps.closed_at).toISOString(),
        redeemedAt: new Date(updatedTimestamps.redeemed_at).toISOString(),
        settlementFeePct: feePctStr,
        settlementFeeUsd: totalFeeStr,
        netRedeemedUsd: netPayoutStr,
        createdAt: new Date(row.created_at).toISOString(),
        updatedAt: new Date(updatedTimestamps.updated_at).toISOString(),
      },
      principalUsd: row.principal_amount,
      settlementFeePct: feePctStr,
      settlementFeeUsd: totalFeeStr,
      netPayoutUsd: netPayoutStr,
      feeBreakdown: {
        liquidityExitFeePct: (feePctNum * 0.5).toFixed(2),
        liquidityExitFeeUsd: formatScaledBigInt(liqFeeScaled),
        executionClearingFeePct: (feePctNum * 0.3).toFixed(2),
        executionClearingFeeUsd: formatScaledBigInt(execFeeScaled),
        custodyReserveFeePct: (feePctNum * 0.2).toFixed(2),
        custodyReserveFeeUsd: formatScaledBigInt(custFeeScaled),
      },
      ledgerEntry: {
        id: ledgerEntryId,
        publicTxnId,
        amount: netPayoutStr,
        currency: 'USDT',
        sourceType: 'TRADING_POOL_PRINCIPAL_REDEMPTION',
        status: 'SETTLED',
      },
      walletBalanceBeforeUsd: balanceBeforeStr,
      walletBalanceAfterUsd: balanceAfterStr,
      idempotentReplay: false,
    };
  });

  if (redemptionResult && !redemptionResult.idempotentReplay) {
    import('./emailService')
      .then(({ sendTransactionEmail }) =>
        sendTransactionEmail({
          userId,
          eventType: 'QUANTUM_ALPHA_REDEEMED',
          metadata: {
            positionId: redemptionResult.position.id,
            grossPrincipalUsd: redemptionResult.principalUsd,
            settlementFeePct: redemptionResult.settlementFeePct,
            settlementFeeUsd: redemptionResult.settlementFeeUsd,
            netPayoutUsd: redemptionResult.netPayoutUsd,
            tierName: redemptionResult.position.tierName,
            publicTxnId: redemptionResult.ledgerEntry.publicTxnId,
          },
        })
      )
      .catch((emailErr) => {
        console.warn('[TradingPoolService] Non-blocking redemption email error:', emailErr);
      });
  }

  return redemptionResult;
}

/**
 * Returns all trading pool positions for a specific user.
 */
export async function getUserTradingPoolPositions(
  userId: string,
  dbClient?: DatabaseClient
): Promise<UserTradingPositionRecord[]> {
  const db = dbClient || (await getDb());
  const res = await db.query<{
    id: string;
    user_id: string;
    tier_id: string;
    tier_code: TradingTierCode;
    tier_name: string;
    min_daily_rate_pct: string;
    max_daily_rate_pct: string;
    principal_amount: string;
    total_yield_earned: string;
    status: 'ACTIVE' | 'CLOSED' | 'REDEEMED';
    activated_at: Date;
    unlock_eligible_at: Date | null;
    last_settled_date: string | null;
    closed_at: Date | null;
    redeemed_at: Date | null;
    settlement_fee_pct: string;
    settlement_fee_usd: string;
    net_redeemed_usd: string;
    created_at: Date;
    updated_at: Date;
  }>(
    `
    SELECT
      utp.id,
      utp.user_id,
      utp.tier_id,
      tpt.tier_code,
      tpt.tier_name,
      ROUND(tpt.min_daily_rate_pct, 8)::text AS min_daily_rate_pct,
      ROUND(tpt.max_daily_rate_pct, 8)::text AS max_daily_rate_pct,
      ROUND(utp.principal_amount, 8)::text AS principal_amount,
      ROUND(utp.total_yield_earned, 8)::text AS total_yield_earned,
      utp.status,
      utp.activated_at,
      utp.unlock_eligible_at,
      utp.last_settled_date::text AS last_settled_date,
      utp.closed_at,
      utp.redeemed_at,
      ROUND(COALESCE(utp.settlement_fee_pct, 0), 4)::text AS settlement_fee_pct,
      ROUND(COALESCE(utp.settlement_fee_usd, 0), 8)::text AS settlement_fee_usd,
      ROUND(COALESCE(utp.net_redeemed_usd, 0), 8)::text AS net_redeemed_usd,
      utp.created_at,
      utp.updated_at
    FROM user_trading_positions utp
    JOIN trading_pool_tiers tpt ON tpt.id = utp.tier_id
    WHERE utp.user_id = $1
    ORDER BY utp.activated_at DESC, utp.created_at DESC
    `,
    [userId]
  );

  const nowMs = Date.now();
  return res.rows.map((row) => {
    const activatedDate = new Date(row.activated_at);
    const unlockDate = row.unlock_eligible_at
      ? new Date(row.unlock_eligible_at)
      : new Date(activatedDate.getTime() + WEEKLY_CYCLE_MS);
    return {
      id: row.id,
      userId: row.user_id,
      tierId: row.tier_id,
      tierCode: row.tier_code,
      tierName: row.tier_name,
      minDailyRatePct: row.min_daily_rate_pct,
      maxDailyRatePct: row.max_daily_rate_pct,
      principalAmount: row.principal_amount,
      totalYieldEarned: row.total_yield_earned,
      status: row.status,
      activatedAt: activatedDate.toISOString(),
      unlockEligibleAt: unlockDate.toISOString(),
      isRedeemable: row.status === 'ACTIVE' && nowMs >= unlockDate.getTime(),
      lastSettledDate: row.last_settled_date,
      closedAt: row.closed_at ? new Date(row.closed_at).toISOString() : null,
      redeemedAt: row.redeemed_at ? new Date(row.redeemed_at).toISOString() : null,
      settlementFeePct: row.settlement_fee_pct || '0.0000',
      settlementFeeUsd: row.settlement_fee_usd || '0.00000000',
      netRedeemedUsd: row.net_redeemed_usd || '0.00000000',
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  });
}

/**
 * Returns daily yield payout history for a user's trading pool positions.
 */
export async function getUserTradingYieldPayouts(
  userId: string,
  limit = 50,
  dbClient?: DatabaseClient
): Promise<TradingYieldPayoutRecord[]> {
  const db = dbClient || (await getDb());
  const safeLimit = Math.min(200, Math.max(1, Number(limit) || 50));

  const res = await db.query<{
    id: string;
    position_id: string;
    user_id: string;
    tier_code: TradingTierCode;
    tier_name: string;
    trading_date: string;
    applied_rate_pct: string;
    yield_amount: string;
    ledger_entry_id: string | null;
    settled_at: Date;
    created_at: Date;
  }>(
    `
    SELECT
      typ.id,
      typ.position_id,
      typ.user_id,
      tpt.tier_code,
      tpt.tier_name,
      typ.trading_date::text AS trading_date,
      ROUND(typ.applied_rate_pct, 8)::text AS applied_rate_pct,
      ROUND(typ.yield_amount, 8)::text AS yield_amount,
      typ.ledger_entry_id,
      typ.settled_at,
      typ.created_at
    FROM trading_yield_payouts typ
    JOIN user_trading_positions utp ON utp.id = typ.position_id
    JOIN trading_pool_tiers tpt ON tpt.id = utp.tier_id
    WHERE typ.user_id = $1
    ORDER BY typ.trading_date DESC, typ.settled_at DESC
    LIMIT $2
    `,
    [userId, safeLimit]
  );

  return res.rows.map((row) => ({
    id: row.id,
    positionId: row.position_id,
    userId: row.user_id,
    tierCode: row.tier_code,
    tierName: row.tier_name,
    tradingDate: row.trading_date,
    appliedRatePct: row.applied_rate_pct,
    yieldAmount: row.yield_amount,
    ledgerEntryId: row.ledger_entry_id,
    settledAt: new Date(row.settled_at).toISOString(),
    createdAt: new Date(row.created_at).toISOString(),
  }));
}
