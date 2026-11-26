import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { getDb, DatabaseClient } from '../db/db';
import { generateLedgerTransactionPublicId } from '../utils/idGenerator';
import {
  TradingPoolTierRecord,
  parseAmountToScaledBigInt,
  formatScaledBigInt,
  calculateDailyYieldExact,
  getUserTradingPoolPositions,
  getUserTradingYieldPayouts,
  getUserMainUsdtBalanceExact,
  PublicMarketPerformanceEntry,
  UserTradingPositionRecord,
  TradingYieldPayoutRecord,
} from './tradingPoolService';
import { TradingTierCode, isFeatureSwitchEnabled } from './unilevelConfigService';
import { enqueueUnilevelYieldEvent } from './unilevelYieldEventService';

// Process-level mutex preventing overlapping trading yield settlement runs
let tradingYieldSettlementLock: Promise<void> = Promise.resolve();

async function withTradingYieldSettlementLock<T>(fn: () => Promise<T>): Promise<T> {
  const prev = tradingYieldSettlementLock;
  let release!: () => void;
  const next = new Promise<void>((resolve) => {
    release = resolve;
  });
  tradingYieldSettlementLock = prev.then(() => next);
  try {
    await prev;
    return await fn();
  } finally {
    release();
  }
}

export interface UtcMarketSessionStatus {
  currentUtcDate: string;
  currentUtcDayOfWeek: number;
  currentUtcDayName: 'SUNDAY' | 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY';
  isTradingDay: boolean;
  sessionStatus: 'LIVE_TRADING_SESSION' | 'WEEKEND_SETTLEMENT';
  scheduleSummary: string;
}

export interface TradingYieldSettlementResult {
  targetDate: string;
  isTradingDay: boolean;
  sessionStatus: 'LIVE_TRADING_SESSION' | 'WEEKEND_SETTLEMENT';
  positionsEvaluated: number;
  positionsProcessed: number;
  payoutsCreated: number;
  duplicatePayoutsSkipped: number;
  weekendDatesSkipped: number;
  totalYieldDistributedUsd: string;
  settledDates: string[];
  completedAt: string;
}

export interface TradingPoolOverviewResponse {
  activeTiers: TradingPoolTierRecord[];
  marketSession: UtcMarketSessionStatus;
  recentPerformanceTelemetry: PublicMarketPerformanceEntry[];
  userSummary: {
    mainUsdtWalletBalance: string;
    totalActivePrincipalUsd: string;
    totalLifetimeYieldUsd: string;
    activePositionsCount: number;
    activePositions: UserTradingPositionRecord[];
    allPositions: UserTradingPositionRecord[];
    payoutHistory: TradingYieldPayoutRecord[];
  } | null;
}

const UTC_DAY_NAMES: UtcMarketSessionStatus['currentUtcDayName'][] = [
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
];

/**
 * Formats a Date object as a strict UTC YYYY-MM-DD date string.
 */
export function formatUtcDate(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Returns the latest completed UTC date string (yesterday in UTC relative to `now`).
 */
export function getLatestCompletedUtcDateStr(now: Date = new Date()): string {
  const yesterdayUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1, 0, 0, 0, 0)
  );
  return formatUtcDate(yesterdayUtc);
}

/**
 * Adds `days` to a YYYY-MM-DD UTC date string and returns the new YYYY-MM-DD string.
 */
export function addUtcDays(utcDateStr: string, days: number): string {
  const [year, month, day] = utcDateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(year, month - 1, day + days, 0, 0, 0, 0));
  return formatUtcDate(dt);
}

/**
 * Builds an inclusive list of YYYY-MM-DD UTC date strings from `startDateStr` through `endDateStr`.
 */
export function buildUtcDateRange(startDateStr: string, endDateStr: string, maxDays = 365): string[] {
  if (startDateStr > endDateStr) return [];
  const dates: string[] = [];
  let cursor = startDateStr;
  let guard = 0;
  while (cursor <= endDateStr && guard < maxDays) {
    dates.push(cursor);
    cursor = addUtcDays(cursor, 1);
    guard++;
  }
  return dates;
}

/**
 * Strict UTC 5-Day Mon–Fri Trading Session Check.
 * Parses YYYY-MM-DD in strict UTC:
 * - Returns true ONLY for Monday (1) through Friday (5)
 * - Returns false for Saturday (6) and Sunday (0)
 */
export function isTradingDay(utcDateStr: string): boolean {
  const trimmed = String(utcDateStr || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new Error(`INVALID_UTC_DATE: '${trimmed}' must be in YYYY-MM-DD format.`);
  }

  const [year, month, day] = trimmed.split('-').map(Number);
  const dt = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  if (isNaN(dt.getTime()) || dt.toISOString().slice(0, 10) !== trimmed) {
    throw new Error(`INVALID_UTC_DATE: '${trimmed}' is not a valid calendar date.`);
  }

  const utcDay = dt.getUTCDay(); // 0 = Sun, 1 = Mon, 2 = Tue, 3 = Wed, 4 = Thu, 5 = Fri, 6 = Sat
  return utcDay >= 1 && utcDay <= 5;
}

/**
 * Returns the live UTC market session status for PHIVONEX QUANTUM ALPHA™.
 */
export function getUtcMarketSessionStatus(now: Date = new Date()): UtcMarketSessionStatus {
  const currentUtcDate = formatUtcDate(now);
  const currentUtcDayOfWeek = now.getUTCDay();
  const currentUtcDayName = UTC_DAY_NAMES[currentUtcDayOfWeek];
  const activeTradingDay = isTradingDay(currentUtcDate);

  return {
    currentUtcDate,
    currentUtcDayOfWeek,
    currentUtcDayName,
    isTradingDay: activeTradingDay,
    sessionStatus: activeTradingDay ? 'LIVE_TRADING_SESSION' : 'WEEKEND_SETTLEMENT',
    scheduleSummary: 'Monday – Friday Active Trading Sessions (5 Days/Week UTC; Sat–Sun Closed)',
  };
}

/**
 * Resolves the authoritative daily yield percentage for a specific UTC tradingDate and tier.
 * 1. Queries `daily_trading_yield_rates` for `(trading_date, tier.id)`.
 * 2. If an admin-configured (or previously resolved) rate exists, returns it.
 * 3. Otherwise, deterministically derives a bounded rate within `[tier.minDailyRatePct, tier.maxDailyRatePct]`
 *    using a SHA-256 hash of `${tradingDate}:${tier.tierCode}` rounded to 4 decimal places,
 *    inserts it with `ON CONFLICT (trading_date, tier_id) DO NOTHING`, and re-reads it so all positions
 *    in that tier receive the exact same rate on that UTC date.
 */
export async function resolveDailyYieldRatePct(
  client: DatabaseClient,
  tradingDate: string,
  tier: {
    id: string;
    tierCode: TradingTierCode;
    minDailyRatePct: string;
    maxDailyRatePct: string;
  }
): Promise<string> {
  const existingRes = await client.query<{ yield_rate_pct: string }>(
    `
    SELECT ROUND(yield_rate_pct, 8)::text AS yield_rate_pct
    FROM daily_trading_yield_rates
    WHERE trading_date = $1::date AND tier_id = $2
    LIMIT 1
    `,
    [tradingDate, tier.id]
  );

  if (existingRes.rowCount > 0) {
    return existingRes.rows[0].yield_rate_pct;
  }

  // Deterministically derive bounded rate in 4-decimal increments within [minDailyRatePct, maxDailyRatePct]
  const minScaled = parseAmountToScaledBigInt(tier.minDailyRatePct);
  const maxScaled = parseAmountToScaledBigInt(tier.maxDailyRatePct);

  // 1 unit = 0.0001% = 10,000 in 10^8 scale
  const stepScaled = 10_000n;
  const minUnits = minScaled / stepScaled;
  const maxUnits = maxScaled / stepScaled;
  const spanUnits = maxUnits >= minUnits ? maxUnits - minUnits : 0n;

  const digest = crypto
    .createHash('sha256')
    .update(`${tradingDate}:${tier.tierCode}`)
    .digest();
  const hashVal = BigInt(digest.readUInt32BE(0));

  const offsetUnits = spanUnits > 0n ? hashVal % (spanUnits + 1n) : 0n;
  const derivedScaled = (minUnits + offsetUnits) * stepScaled;
  const derivedRateStr = formatScaledBigInt(derivedScaled);

  await client.query(
    `
    INSERT INTO daily_trading_yield_rates (
      trading_date, tier_id, yield_rate_pct, set_by_admin_id, notes, created_at, updated_at
    )
    VALUES (
      $1::date,
      $2,
      $3::numeric(20,8),
      NULL,
      'Algorithmic Quantum Alpha Session Settlement Rate',
      NOW(),
      NOW()
    )
    ON CONFLICT (trading_date, tier_id) DO NOTHING
    `,
    [tradingDate, tier.id, derivedRateStr]
  );

  const rereadRes = await client.query<{ yield_rate_pct: string }>(
    `
    SELECT ROUND(yield_rate_pct, 8)::text AS yield_rate_pct
    FROM daily_trading_yield_rates
    WHERE trading_date = $1::date AND tier_id = $2
    LIMIT 1
    `,
    [tradingDate, tier.id]
  );

  return rereadRes.rowCount > 0 ? rereadRes.rows[0].yield_rate_pct : derivedRateStr;
}

/**
 * Helper to record / update `ecosystem_yield_settlement_cycles` for `engine_type = 'TRADING_POOL'`.
 */
async function recordTradingSettlementCycle(
  db: DatabaseClient,
  epochDate: string,
  status: 'RUNNING' | 'COMPLETED' | 'FAILED',
  errorMessage: string | null = null
): Promise<void> {
  if (status === 'RUNNING') {
    await db.query(
      `
      INSERT INTO ecosystem_yield_settlement_cycles (
        epoch_date, engine_type, status, positions_processed,
        total_yield_distributed, total_royalty_distributed, started_at, created_at
      )
      VALUES ($1::date, 'TRADING_POOL', 'RUNNING', 0, 0.00000000, 0.00000000, NOW(), NOW())
      ON CONFLICT (epoch_date, engine_type) DO UPDATE SET
        status = 'RUNNING',
        started_at = NOW(),
        error_message = NULL
      `,
      [epochDate]
    );
    return;
  }

  // Aggregate authoritative totals for this epochDate from trading_yield_payouts
  const aggRes = await db.query<{
    positions_count: string | number;
    total_yield: string;
  }>(
    `
    SELECT
      COUNT(*)::int AS positions_count,
      ROUND(COALESCE(SUM(yield_amount), 0), 8)::text AS total_yield
    FROM trading_yield_payouts
    WHERE trading_date = $1::date
    `,
    [epochDate]
  );

  const positionsProcessed = Number(aggRes.rows[0]?.positions_count || 0);
  const totalYieldDistributed = aggRes.rows[0]?.total_yield || '0.00000000';

  await db.query(
    `
    INSERT INTO ecosystem_yield_settlement_cycles (
      epoch_date, engine_type, status, positions_processed,
      total_yield_distributed, total_royalty_distributed, started_at, completed_at, error_message, created_at
    )
    VALUES ($1::date, 'TRADING_POOL', $2, $3, $4::numeric(20,8), 0.00000000, NOW(), NOW(), $5, NOW())
    ON CONFLICT (epoch_date, engine_type) DO UPDATE SET
      status = EXCLUDED.status,
      positions_processed = EXCLUDED.positions_processed,
      total_yield_distributed = EXCLUDED.total_yield_distributed,
      completed_at = NOW(),
      error_message = EXCLUDED.error_message
    `,
    [epochDate, status, positionsProcessed, totalYieldDistributed, errorMessage]
  );
}

/**
 * Authoritative 5-Day Mon–Fri Trading Pool Yield Settlement & Catch-Up Engine.
 * - Default `targetUtcDateStr`: latest completed UTC date (or explicit UTC date if passed).
 * - Skips Saturday (6) and Sunday (0) (`isTradingDay === false` -> $0 yield).
 * - For each ACTIVE position and each eligible Mon–Fri date:
 *   1. Locks `user_trading_positions` (`FOR UPDATE`).
 *   2. Computes `yield_amount = round8(principal_amount * applied_rate_pct / 100)`.
 *   3. Inserts into `trading_yield_payouts` with `ON CONFLICT (position_id, trading_date) DO NOTHING`.
 *   4. Credits `yield_amount` to the user's Main USDT Wallet (`SETTLED` CREDIT in `financial_ledger_entries`)
 *      and links `trading_yield_payouts.ledger_entry_id`.
 *   5. Updates `user_trading_positions.total_yield_earned` and `last_settled_date`.
 * - Records execution summary in `ecosystem_yield_settlement_cycles` (`engine_type = 'TRADING_POOL'`).
 */
export async function settleTradingYieldForDate(
  targetUtcDateStr?: string,
  options?: {
    positionId?: string;
    catchUp?: boolean;
    singleDateOnly?: boolean;
  }
): Promise<TradingYieldSettlementResult> {
  return withTradingYieldSettlementLock(async () => {
    const db = await getDb();
    const isExplicitDate = Boolean(targetUtcDateStr && String(targetUtcDateStr).trim());
    const effectiveTargetDate = isExplicitDate
      ? String(targetUtcDateStr).trim()
      : getLatestCompletedUtcDateStr();

    // Validate YYYY-MM-DD and determine if target date is a Mon-Fri trading day
    const targetIsTradingDay = isTradingDay(effectiveTargetDate);
    const currentUtcDateStr = formatUtcDate(new Date());

    // Enforce Master Ecosystem Feature Switch: Quantum Alpha Daily Yield Engine
    const yieldEngineEnabled = await isFeatureSwitchEnabled('quantum_alpha_yield_enabled', db);
    if (!yieldEngineEnabled) {
      console.warn(
        `[TradingYieldEpoch] Paused by protocol governance (quantum_alpha_yield_enabled = FALSE). Skipping settlement for ${effectiveTargetDate}.`
      );
      return {
        targetDate: effectiveTargetDate,
        isTradingDay: targetIsTradingDay,
        sessionStatus: targetIsTradingDay ? 'LIVE_TRADING_SESSION' : 'WEEKEND_SETTLEMENT',
        positionsEvaluated: 0,
        positionsProcessed: 0,
        payoutsCreated: 0,
        duplicatePayoutsSkipped: 0,
        weekendDatesSkipped: 0,
        totalYieldDistributedUsd: '0.00000000',
        settledDates: [],
        completedAt: new Date().toISOString(),
      };
    }

    // Record cycle start for the target date
    await recordTradingSettlementCycle(db, effectiveTargetDate, 'RUNNING');

    // If an explicit weekend date (Saturday or Sunday) was requested without catchUp=true,
    // immediately enforce the 5-day Mon-Fri rule ($0 yield on Saturday & Sunday)
    if (isExplicitDate && !targetIsTradingDay && options?.catchUp !== true) {
      await recordTradingSettlementCycle(db, effectiveTargetDate, 'COMPLETED');
      return {
        targetDate: effectiveTargetDate,
        isTradingDay: false,
        sessionStatus: 'WEEKEND_SETTLEMENT',
        positionsEvaluated: 0,
        positionsProcessed: 0,
        payoutsCreated: 0,
        duplicatePayoutsSkipped: 0,
        weekendDatesSkipped: 1,
        totalYieldDistributedUsd: '0.00000000',
        settledDates: [],
        completedAt: new Date().toISOString(),
      };
    }

    try {
      const positionsRes = await db.query<{
        id: string;
        user_id: string;
        tier_id: string;
        principal_amount: string;
        total_yield_earned: string;
        status: 'ACTIVE' | 'CLOSED';
        activated_at: Date;
        activated_date: string;
        last_settled_date: string | null;
      }>(
        `
        SELECT
          id,
          user_id,
          tier_id,
          ROUND(principal_amount, 8)::text AS principal_amount,
          ROUND(total_yield_earned, 8)::text AS total_yield_earned,
          status,
          activated_at,
          (activated_at AT TIME ZONE 'UTC')::date::text AS activated_date,
          last_settled_date::text AS last_settled_date
        FROM user_trading_positions
        WHERE status = 'ACTIVE'
          AND ($1::uuid IS NULL OR id = $1::uuid)
        ORDER BY activated_at ASC, id ASC
        `,
        [options?.positionId || null]
      );

      let positionsProcessed = 0;
      let payoutsCreated = 0;
      let duplicatePayoutsSkipped = 0;
      let weekendDatesSkipped = 0;
      let totalYieldScaled = 0n;
      const settledDatesSet = new Set<string>();

      for (const pos of positionsRes.rows) {
        const activatedDateStr = pos.activated_date;
        const nextAfterLastSettled = pos.last_settled_date
          ? addUtcDays(pos.last_settled_date, 1)
          : activatedDateStr;
        const catchUpStartDate =
          activatedDateStr > nextAfterLastSettled ? activatedDateStr : nextAfterLastSettled;

        let candidateDates: string[] = [];

        if (options?.singleDateOnly === true) {
          candidateDates = [effectiveTargetDate];
        } else if (
          isExplicitDate &&
          options?.catchUp !== true &&
          pos.last_settled_date === null &&
          activatedDateStr === currentUtcDateStr &&
          effectiveTargetDate !== currentUtcDateStr
        ) {
          // Position created today and explicit target date passed (e.g. testing specific Monday/Friday date)
          candidateDates = [effectiveTargetDate];
        } else if (catchUpStartDate <= effectiveTargetDate) {
          candidateDates = buildUtcDateRange(catchUpStartDate, effectiveTargetDate);
        } else if (isExplicitDate) {
          // Re-running an already-settled date (exercises ON CONFLICT DO NOTHING idempotency)
          candidateDates = [effectiveTargetDate];
        }

        for (const tradingDate of candidateDates) {
          if (!isTradingDay(tradingDate)) {
            weekendDatesSkipped++;
            continue;
          }

          const stepOutcome = await db.transaction(async (trx) => {
            // 1. Lock the position row (FOR UPDATE)
            const lockedPosRes = await trx.query<{
              id: string;
              user_id: string;
              tier_id: string;
              principal_amount: string;
              total_yield_earned: string;
              status: string;
              last_settled_date: string | null;
              tier_code: TradingTierCode;
              tier_name: string;
              min_daily_rate_pct: string;
              max_daily_rate_pct: string;
            }>(
              `
              SELECT
                utp.id,
                utp.user_id,
                utp.tier_id,
                ROUND(utp.principal_amount, 8)::text AS principal_amount,
                ROUND(utp.total_yield_earned, 8)::text AS total_yield_earned,
                utp.status,
                utp.last_settled_date::text AS last_settled_date,
                tpt.tier_code,
                tpt.tier_name,
                ROUND(tpt.min_daily_rate_pct, 8)::text AS min_daily_rate_pct,
                ROUND(tpt.max_daily_rate_pct, 8)::text AS max_daily_rate_pct
              FROM user_trading_positions utp
              JOIN trading_pool_tiers tpt ON tpt.id = utp.tier_id
              WHERE utp.id = $1 AND utp.status = 'ACTIVE'
              FOR UPDATE OF utp
              `,
              [pos.id]
            );

            if (lockedPosRes.rowCount === 0) {
              return { status: 'INACTIVE' as const, yieldScaled: 0n };
            }

            const lockedPos = lockedPosRes.rows[0];

            // 2. Resolve daily yield percentage for (tradingDate, tier)
            const appliedRatePct = await resolveDailyYieldRatePct(trx, tradingDate, {
              id: lockedPos.tier_id,
              tierCode: lockedPos.tier_code,
              minDailyRatePct: lockedPos.min_daily_rate_pct,
              maxDailyRatePct: lockedPos.max_daily_rate_pct,
            });

            // 3. Compute exact NUMERIC(20,8) yield_amount = round8(principal_amount * applied_rate_pct / 100)
            const { yieldAmountStr, yieldAmountScaled } = calculateDailyYieldExact(
              lockedPos.principal_amount,
              appliedRatePct
            );

            // 4. Insert into trading_yield_payouts with ON CONFLICT (position_id, trading_date) DO NOTHING
            const payoutId = uuidv4();
            const payoutIns = await trx.query<{ id: string }>(
              `
              INSERT INTO trading_yield_payouts (
                id, position_id, user_id, trading_date, applied_rate_pct,
                yield_amount, ledger_entry_id, settled_at, created_at
              )
              VALUES ($1, $2, $3, $4::date, $5::numeric(20,8), $6::numeric(20,8), NULL, NOW(), NOW())
              ON CONFLICT (position_id, trading_date) DO NOTHING
              RETURNING id
              `,
              [
                payoutId,
                lockedPos.id,
                lockedPos.user_id,
                tradingDate,
                appliedRatePct,
                yieldAmountStr,
              ]
            );

            if (payoutIns.rowCount === 0) {
              return { status: 'DUPLICATE_SKIPPED' as const, yieldScaled: 0n };
            }

            // 5. Lock user row and credit yield_amount to Main USDT Wallet (SETTLED balance in financial_ledger_entries)
            await trx.query(`SELECT id FROM users WHERE id = $1 FOR UPDATE`, [lockedPos.user_id]);

            const ledgerEntryId = uuidv4();
            const publicTxnId = generateLedgerTransactionPublicId();
            const sourceRef = `QALPHA-YIELD-${tradingDate}`;
            const description = `PHIVONEX QUANTUM ALPHA™ Daily Trading Yield (${lockedPos.tier_name} @ ${Number(appliedRatePct).toFixed(2)}% - ${tradingDate})`;

            const ledgerIns = await trx.query<{ id: string }>(
              `
              INSERT INTO financial_ledger_entries (
                id, public_txn_id, user_id, entry_type, source_type, source_id,
                source_ref, description, amount, currency, status, created_at
              )
              VALUES ($1, $2, $3, 'CREDIT', 'TRADING_POOL_YIELD', $4, $5, $6, $7::numeric(20,8), 'USDT', 'SETTLED', NOW())
              ON CONFLICT (source_type, source_id, entry_type) DO NOTHING
              RETURNING id
              `,
              [
                ledgerEntryId,
                publicTxnId,
                lockedPos.user_id,
                payoutId,
                sourceRef,
                description,
                yieldAmountStr,
              ]
            );

            const finalLedgerId = ledgerIns.rowCount > 0 ? ledgerIns.rows[0].id : null;

            if (finalLedgerId) {
              await trx.query(
                `UPDATE trading_yield_payouts SET ledger_entry_id = $1 WHERE id = $2`,
                [finalLedgerId, payoutId]
              );
            }

            // 6. Update user_trading_positions.total_yield_earned and last_settled_date
            await trx.query(
              `
              UPDATE user_trading_positions
              SET
                total_yield_earned = ROUND(total_yield_earned + $1::numeric(20,8), 8),
                last_settled_date = GREATEST(COALESCE(last_settled_date, $2::date), $2::date),
                updated_at = NOW()
              WHERE id = $3
              `,
              [yieldAmountStr, tradingDate, lockedPos.id]
            );

            // 7. Atomically enqueue Unified Unilevel Yield Event (Task 06 -> Task 07 outbox)
            await enqueueUnilevelYieldEvent(trx, {
              sourceProductType: 'TRADING_POOL',
              sourceYieldId: payoutId,
              sourceUserId: lockedPos.user_id,
              epochDate: tradingDate,
              sourceRoiUsd: yieldAmountStr,
              rawTokenAmount: null,
              tokenReferencePriceUsd: null,
            });

            return {
              status: 'SETTLED' as const,
              yieldScaled: yieldAmountScaled,
            };
          });

          if (stepOutcome.status === 'SETTLED') {
            positionsProcessed++;
            payoutsCreated++;
            totalYieldScaled += stepOutcome.yieldScaled;
            settledDatesSet.add(tradingDate);
          } else if (stepOutcome.status === 'DUPLICATE_SKIPPED') {
            duplicatePayoutsSkipped++;
          }
        }
      }

      // Record cycle completion for all touched dates + effectiveTargetDate
      for (const settledDate of settledDatesSet) {
        await recordTradingSettlementCycle(db, settledDate, 'COMPLETED');
      }
      await recordTradingSettlementCycle(db, effectiveTargetDate, 'COMPLETED');

      // Trigger 16-Generation Unilevel ROI-on-ROI payout processing for newly enqueued TRADING_POOL yield events
      if (payoutsCreated > 0) {
        try {
          const { processPendingUnilevelYieldEvents } = await import('./roiGenerationService');
          await processPendingUnilevelYieldEvents(200);
        } catch (unilevelErr) {
          console.warn(
            '[TradingYieldEpochService] Notice processing pending Unilevel yield events:',
            unilevelErr
          );
        }
      }

      return {
        targetDate: effectiveTargetDate,
        isTradingDay: targetIsTradingDay,
        sessionStatus: targetIsTradingDay ? 'LIVE_TRADING_SESSION' : 'WEEKEND_SETTLEMENT',
        positionsEvaluated: positionsRes.rowCount,
        positionsProcessed,
        payoutsCreated,
        duplicatePayoutsSkipped,
        weekendDatesSkipped,
        totalYieldDistributedUsd: formatScaledBigInt(totalYieldScaled),
        settledDates: Array.from(settledDatesSet).sort(),
        completedAt: new Date().toISOString(),
      };
    } catch (err: any) {
      await recordTradingSettlementCycle(
        db,
        effectiveTargetDate,
        'FAILED',
        err?.message || 'Unknown error during trading yield settlement'
      ).catch(() => {});
      throw err;
    }
  });
}

/**
 * Returns the complete PHIVONEX QUANTUM ALPHA™ overview:
 * - Active tiers (`Alpha Core`, `Alpha Prime`, `Alpha Sovereign`)
 * - Current UTC market session status (`LIVE_TRADING_SESSION` Mon–Fri vs `WEEKEND_SETTLEMENT` Sat–Sun)
 * - Recent public daily pool yield percentages formatted as market performance telemetry (without admin internals)
 * - Authenticated user's active positions, payout history, and Main USDT Wallet balance (if authenticated)
 */
export async function getTradingPoolOverview(
  userId?: string | null
): Promise<TradingPoolOverviewResponse> {
  const db = await getDb();

  const tiersRes = await db.query<{
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
    ORDER BY min_amount ASC
    `
  );

  const activeTiers: TradingPoolTierRecord[] = tiersRes.rows.map((r) => ({
    id: r.id,
    tierCode: r.tier_code,
    tierName: r.tier_name,
    minAmount: r.min_amount,
    maxAmount: r.max_amount,
    minDailyRatePct: r.min_daily_rate_pct,
    maxDailyRatePct: r.max_daily_rate_pct,
    isActive: Boolean(r.is_active),
  }));

  const ratesRes = await db.query<{
    trading_date: string;
    tier_code: TradingTierCode;
    tier_name: string;
    yield_rate_pct: string;
  }>(
    `
    SELECT
      dtyr.trading_date::text AS trading_date,
      tpt.tier_code,
      tpt.tier_name,
      ROUND(dtyr.yield_rate_pct, 8)::text AS yield_rate_pct
    FROM daily_trading_yield_rates dtyr
    JOIN trading_pool_tiers tpt ON tpt.id = dtyr.tier_id
    ORDER BY dtyr.trading_date DESC, tpt.min_amount ASC
    LIMIT 30
    `
  );

  const recentPerformanceTelemetry: PublicMarketPerformanceEntry[] = ratesRes.rows.map((r) => ({
    tradingDate: r.trading_date,
    tierCode: r.tier_code,
    tierName: r.tier_name,
    yieldRatePct: r.yield_rate_pct,
    sessionStatus: 'SETTLED_SESSION',
  }));

  const marketSession = getUtcMarketSessionStatus(new Date());

  let userSummary: TradingPoolOverviewResponse['userSummary'] = null;
  if (userId) {
    const [allPositions, payoutHistory, walletBal] = await Promise.all([
      getUserTradingPoolPositions(userId, db),
      getUserTradingYieldPayouts(userId, 50, db),
      getUserMainUsdtBalanceExact(userId, db),
    ]);

    const activePositions = allPositions.filter((p) => p.status === 'ACTIVE');

    let activePrincipalScaled = 0n;
    let lifetimeYieldScaled = 0n;
    for (const pos of allPositions) {
      if (pos.status === 'ACTIVE') {
        activePrincipalScaled += parseAmountToScaledBigInt(pos.principalAmount);
      }
      lifetimeYieldScaled += parseAmountToScaledBigInt(pos.totalYieldEarned);
    }

    userSummary = {
      mainUsdtWalletBalance: walletBal.availableBalanceStr,
      totalActivePrincipalUsd: formatScaledBigInt(activePrincipalScaled),
      totalLifetimeYieldUsd: formatScaledBigInt(lifetimeYieldScaled),
      activePositionsCount: activePositions.length,
      activePositions,
      allPositions,
      payoutHistory,
    };
  }

  return {
    activeTiers,
    marketSession,
    recentPerformanceTelemetry,
    userSummary,
  };
}

let schedulerStarted = false;
let schedulerIntervalHandle: NodeJS.Timeout | null = null;

/**
 * Starts the automated PHIVONEX QUANTUM ALPHA™ 5-Day Mon–Fri Yield Scheduler.
 * - Executes an immediate startup catch-up check for any unsettled completed Mon–Fri UTC trading days.
 * - Runs a 60-second safety check interval (guarded against overlapping runs by `withTradingYieldSettlementLock`).
 */
export function startTradingYieldScheduler(): void {
  if (schedulerStarted) return;
  schedulerStarted = true;

  const runScheduledCheck = async () => {
    try {
      const latestCompletedUtcDate = getLatestCompletedUtcDateStr(new Date());
      await settleTradingYieldForDate(latestCompletedUtcDate, { catchUp: true });
    } catch (err) {
      console.error('[TradingYieldScheduler] Error during scheduled check:', err);
    }
  };

  // Initial startup catch-up
  runScheduledCheck().catch((err) =>
    console.error('[TradingYieldScheduler] Initial catch-up error:', err)
  );

  // 60-second interval check
  schedulerIntervalHandle = setInterval(() => {
    runScheduledCheck().catch((err) =>
      console.error('[TradingYieldScheduler] Interval check error:', err)
    );
  }, 60_000);

  if (schedulerIntervalHandle && typeof schedulerIntervalHandle.unref === 'function') {
    schedulerIntervalHandle.unref();
  }

  console.log('[TradingYieldScheduler] PHIVONEX QUANTUM ALPHA™ 5-Day Mon–Fri yield scheduler initialized.');
}
