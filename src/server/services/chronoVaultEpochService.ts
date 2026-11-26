import { v4 as uuidv4 } from 'uuid';
import { getDb, DatabaseClient } from '../db/db';
import { generateLedgerTransactionPublicId } from '../utils/idGenerator';
import {
  parseAmountToScaledBigInt,
  formatScaledBigInt,
  calculateDailyYieldExact,
  getUserMainUsdtBalanceExact,
} from './tradingPoolService';
import {
  formatUtcDate,
  getLatestCompletedUtcDateStr,
  addUtcDays,
  buildUtcDateRange,
} from './tradingYieldEpochService';
import {
  ChronoVaultPlanRecord,
  UserChronoVaultPositionRecord,
  ChronoVaultYieldPayoutRecord,
  getActiveChronoVaultPlans,
  getUserChronoVaultPositions,
  getUserChronoVaultYieldPayouts,
} from './chronoVaultService';
import { ChronoVaultPlanCode, isFeatureSwitchEnabled } from './unilevelConfigService';
import { enqueueUnilevelYieldEvent } from './unilevelYieldEventService';

// Process-level mutex preventing overlapping Chrono Vault settlement runs
let chronoVaultSettlementLock: Promise<void> = Promise.resolve();

async function withChronoVaultSettlementLock<T>(fn: () => Promise<T>): Promise<T> {
  const prev = chronoVaultSettlementLock;
  let release!: () => void;
  const next = new Promise<void>((resolve) => {
    release = resolve;
  });
  chronoVaultSettlementLock = prev.then(() => next);
  try {
    await prev;
    return await fn();
  } finally {
    release();
  }
}

export interface ChronoVaultSettlementResult {
  targetDate: string;
  scheduleType: '7_DAY_CONTINUOUS_UTC';
  positionsEvaluated: number;
  positionsProcessed: number;
  payoutsCreated: number;
  duplicatePayoutsSkipped: number;
  positionsMatured: number;
  totalYieldDistributedUsd: string;
  totalPrincipalReturnedUsd: string;
  settledDates: string[];
  completedAt: string;
}

export interface ChronoVaultOverviewResponse {
  activePlans: ChronoVaultPlanRecord[];
  scheduleSummary: string;
  userSummary: {
    mainUsdtWalletBalance: string;
    totalActivePrincipalUsd: string;
    totalMaturedPrincipalReturnedUsd: string;
    totalLifetimeYieldUsd: string;
    activePositionsCount: number;
    maturedPositionsCount: number;
    activePositions: UserChronoVaultPositionRecord[];
    maturedPositions: UserChronoVaultPositionRecord[];
    allPositions: UserChronoVaultPositionRecord[];
    payoutHistory: ChronoVaultYieldPayoutRecord[];
  } | null;
}

/**
 * Validates that a string is a valid YYYY-MM-DD UTC calendar date.
 */
export function validateUtcDateString(utcDateStr: string): string {
  const trimmed = String(utcDateStr || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new Error(`INVALID_UTC_DATE: '${trimmed}' must be in YYYY-MM-DD format.`);
  }
  const [year, month, day] = trimmed.split('-').map(Number);
  const dt = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  if (isNaN(dt.getTime()) || dt.toISOString().slice(0, 10) !== trimmed) {
    throw new Error(`INVALID_UTC_DATE: '${trimmed}' is not a valid calendar date.`);
  }
  return trimmed;
}

/**
 * Helper to record / update `ecosystem_yield_settlement_cycles` for `engine_type = 'CHRONO_VAULT'`.
 */
async function recordChronoVaultSettlementCycle(
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
      VALUES ($1::date, 'CHRONO_VAULT', 'RUNNING', 0, 0.00000000, 0.00000000, NOW(), NOW())
      ON CONFLICT (epoch_date, engine_type) DO UPDATE SET
        status = 'RUNNING',
        started_at = NOW(),
        error_message = NULL
      `,
      [epochDate]
    );
    return;
  }

  const aggRes = await db.query<{
    positions_count: string | number;
    total_yield: string;
  }>(
    `
    SELECT
      COUNT(*)::int AS positions_count,
      ROUND(COALESCE(SUM(yield_amount), 0), 8)::text AS total_yield
    FROM vault_yield_payouts
    WHERE epoch_date = $1::date
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
    VALUES ($1::date, 'CHRONO_VAULT', $2, $3, $4::numeric(20,8), 0.00000000, NOW(), NOW(), $5, NOW())
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
 * Authoritative 7-Day UTC Yield Settlement & Maturity Engine for PHIVONEX CHRONO VAULTS™.
 * - Runs 7 days a week (Monday through Sunday, no weekend skip).
 * - Default `targetUtcDateStr`: latest completed UTC date (or explicit `targetUtcDateStr` if passed).
 * - For every `ACTIVE` position in `user_vault_positions`:
 *   * Determines eligible UTC dates from `MAX(activated_at::date, last_settled_date + 1 day)` through `targetUtcDateStr`,
 *     capped so total settled days never exceed `plan.duration_days` (`days_settled < duration_days`).
 *   * For each eligible `epoch_date`, executes an atomic transaction:
 *     1. Locks `user_vault_positions` (`FOR UPDATE`). If `status !== 'ACTIVE'` or `days_settled >= duration_days`, skips safely.
 *     2. Computes `yield_amount = round8(principal_amount * daily_rate_pct_snapshot / 100)`.
 *     3. Inserts into `vault_yield_payouts` with `ON CONFLICT (position_id, epoch_date) DO NOTHING`. If `rowCount === 0`, skips.
 *     4. Credits `yield_amount` to user's Main USDT Wallet (`SETTLED` balance) and inserts a `CREDIT` entry in `financial_ledger_entries`, linking `vault_yield_payouts.ledger_entry_id`.
 *     5. Increments `days_settled = days_settled + 1`, adds `yield_amount` to `total_yield_earned`, and updates `last_settled_date = epoch_date`.
 *     6. Maturity Check: If `new_days_settled >= duration_days`:
 *        - Sets `status = 'MATURED'`.
 *        - If `return_principal_on_maturity === true` and `principal_returned_at IS NULL`, credits `principal_amount` back to user's Main USDT Wallet (`SETTLED` balance) with an explicit `CREDIT` entry in `financial_ledger_entries` (`source_type = 'CHRONO_VAULT_MATURITY'`), and sets `principal_returned_at = NOW()`.
 * - Records execution summary in `ecosystem_yield_settlement_cycles` (`engine_type = 'CHRONO_VAULT'`).
 */
export async function settleChronoVaultsForDate(
  targetUtcDateStr?: string,
  options?: {
    positionId?: string;
    catchUp?: boolean;
    singleDateOnly?: boolean;
  }
): Promise<ChronoVaultSettlementResult> {
  return withChronoVaultSettlementLock(async () => {
    const db = await getDb();
    const isExplicitDate = Boolean(targetUtcDateStr && String(targetUtcDateStr).trim());
    const effectiveTargetDate = validateUtcDateString(
      isExplicitDate ? String(targetUtcDateStr).trim() : getLatestCompletedUtcDateStr()
    );
    const currentUtcDateStr = formatUtcDate(new Date());

    // Enforce Master Ecosystem Feature Switch: Chrono Vaults Daily Yield Engine
    const vaultYieldEnabled = await isFeatureSwitchEnabled('chrono_vaults_yield_enabled', db);
    if (!vaultYieldEnabled) {
      console.warn(
        `[ChronoVaultEpoch] Paused by protocol governance (chrono_vaults_yield_enabled = FALSE). Skipping settlement for ${effectiveTargetDate}.`
      );
      return {
        targetDate: effectiveTargetDate,
        scheduleType: '7_DAY_CONTINUOUS_UTC',
        positionsEvaluated: 0,
        positionsProcessed: 0,
        payoutsCreated: 0,
        duplicatePayoutsSkipped: 0,
        positionsMatured: 0,
        totalYieldDistributedUsd: '0.00000000',
        totalPrincipalReturnedUsd: '0.00000000',
        settledDates: [],
        completedAt: new Date().toISOString(),
      };
    }

    await recordChronoVaultSettlementCycle(db, effectiveTargetDate, 'RUNNING');

    try {
      const positionsRes = await db.query<{
        id: string;
        user_id: string;
        plan_id: string;
        principal_amount: string;
        daily_rate_pct_snapshot: string;
        total_yield_earned: string;
        days_settled: number;
        status: 'ACTIVE' | 'MATURED';
        activated_at: Date;
        activated_date: string;
        last_settled_date: string | null;
        duration_days: number;
      }>(
        `
        SELECT
          uvp.id,
          uvp.user_id,
          uvp.plan_id,
          ROUND(uvp.principal_amount, 8)::text AS principal_amount,
          ROUND(uvp.daily_rate_pct_snapshot, 8)::text AS daily_rate_pct_snapshot,
          ROUND(uvp.total_yield_earned, 8)::text AS total_yield_earned,
          uvp.days_settled,
          uvp.status,
          uvp.activated_at,
          (uvp.activated_at AT TIME ZONE 'UTC')::date::text AS activated_date,
          uvp.last_settled_date::text AS last_settled_date,
          cvp.duration_days
        FROM user_vault_positions uvp
        JOIN chrono_vault_plans cvp ON cvp.id = uvp.plan_id
        WHERE uvp.status = 'ACTIVE'
          AND ($1::uuid IS NULL OR uvp.id = $1::uuid)
        ORDER BY uvp.activated_at ASC, uvp.id ASC
        `,
        [options?.positionId || null]
      );

      let positionsProcessed = 0;
      let payoutsCreated = 0;
      let duplicatePayoutsSkipped = 0;
      let positionsMatured = 0;
      let totalYieldScaled = 0n;
      let totalPrincipalReturnedScaled = 0n;
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
          // Position created today and explicit target date passed (e.g. testing specific Saturday/Sunday/Weekday)
          candidateDates = [effectiveTargetDate];
        } else if (catchUpStartDate <= effectiveTargetDate) {
          const remainingDaysCap = Math.max(
            1,
            Number(pos.duration_days) - Number(pos.days_settled || 0)
          );
          candidateDates = buildUtcDateRange(
            catchUpStartDate,
            effectiveTargetDate,
            remainingDaysCap
          );
        } else if (isExplicitDate) {
          // Re-running an already-settled date (exercises ON CONFLICT DO NOTHING idempotency)
          candidateDates = [effectiveTargetDate];
        }

        for (const epochDate of candidateDates) {
          const stepOutcome = await db.transaction(async (trx) => {
            // 1. Lock user_vault_positions row (FOR UPDATE)
            const lockedRes = await trx.query<{
              id: string;
              user_id: string;
              plan_id: string;
              principal_amount: string;
              daily_rate_pct_snapshot: string;
              total_yield_earned: string;
              days_settled: number;
              status: 'ACTIVE' | 'MATURED';
              last_settled_date: string | null;
              principal_returned_at: Date | null;
              plan_code: ChronoVaultPlanCode;
              plan_name: string;
              duration_days: number;
              return_principal_on_maturity: boolean;
            }>(
              `
              SELECT
                uvp.id,
                uvp.user_id,
                uvp.plan_id,
                ROUND(uvp.principal_amount, 8)::text AS principal_amount,
                ROUND(uvp.daily_rate_pct_snapshot, 8)::text AS daily_rate_pct_snapshot,
                ROUND(uvp.total_yield_earned, 8)::text AS total_yield_earned,
                uvp.days_settled,
                uvp.status,
                uvp.last_settled_date::text AS last_settled_date,
                uvp.principal_returned_at,
                cvp.plan_code,
                cvp.plan_name,
                cvp.duration_days,
                cvp.return_principal_on_maturity
              FROM user_vault_positions uvp
              JOIN chrono_vault_plans cvp ON cvp.id = uvp.plan_id
              WHERE uvp.id = $1
              FOR UPDATE OF uvp
              `,
              [pos.id]
            );

            if (lockedRes.rowCount === 0) {
              return {
                status: 'INACTIVE' as const,
                yieldScaled: 0n,
                principalReturnedScaled: 0n,
                matured: false,
              };
            }

            const lockedPos = lockedRes.rows[0];
            const currentDaysSettled = Number(lockedPos.days_settled || 0);
            const durationDays = Number(lockedPos.duration_days);

            // If already MATURED or reached duration_days cap, ensure matured state & skip yield
            if (lockedPos.status !== 'ACTIVE' || currentDaysSettled >= durationDays) {
              let latePrincipalReturnedScaled = 0n;
              let newlyMatured = false;

              if (lockedPos.status === 'ACTIVE' && currentDaysSettled >= durationDays) {
                newlyMatured = true;
                if (lockedPos.return_principal_on_maturity && !lockedPos.principal_returned_at) {
                  await trx.query(`SELECT id FROM users WHERE id = $1 FOR UPDATE`, [lockedPos.user_id]);
                  const matLedgerId = uuidv4();
                  const matPublicTxnId = generateLedgerTransactionPublicId();
                  const matIns = await trx.query<{ id: string }>(
                    `
                    INSERT INTO financial_ledger_entries (
                      id, public_txn_id, user_id, entry_type, source_type, source_id,
                      source_ref, description, amount, currency, status, created_at
                    )
                    VALUES ($1, $2, $3, 'CREDIT', 'CHRONO_VAULT_MATURITY', $4, $5, $6, $7::numeric(20,8), 'USDT', 'SETTLED', NOW())
                    ON CONFLICT (source_type, source_id, entry_type) DO NOTHING
                    RETURNING id
                    `,
                    [
                      matLedgerId,
                      matPublicTxnId,
                      lockedPos.user_id,
                      lockedPos.id,
                      `CVAULT-MATURITY-${lockedPos.id.slice(0, 8).toUpperCase()}`,
                      `PHIVONEX CHRONO VAULTS™ Maturity Principal Return (${lockedPos.plan_name} - ${durationDays} Days)`,
                      lockedPos.principal_amount,
                    ]
                  );
                  if (matIns.rowCount > 0) {
                    latePrincipalReturnedScaled = parseAmountToScaledBigInt(lockedPos.principal_amount);
                  }
                }

                await trx.query(
                  `
                  UPDATE user_vault_positions
                  SET
                    status = 'MATURED',
                    principal_returned_at = CASE
                      WHEN $1::boolean = TRUE THEN COALESCE(principal_returned_at, NOW())
                      ELSE principal_returned_at
                    END,
                    updated_at = NOW()
                  WHERE id = $2
                  `,
                  [Boolean(lockedPos.return_principal_on_maturity), lockedPos.id]
                );
              }

              return {
                status: 'ALREADY_MATURED' as const,
                yieldScaled: 0n,
                principalReturnedScaled: latePrincipalReturnedScaled,
                matured: newlyMatured,
              };
            }

            // 2. Compute exact NUMERIC(20,8) yield_amount = round8(principal_amount * daily_rate_pct_snapshot / 100)
            const { yieldAmountStr, yieldAmountScaled } = calculateDailyYieldExact(
              lockedPos.principal_amount,
              lockedPos.daily_rate_pct_snapshot
            );

            // 3. Insert into vault_yield_payouts with ON CONFLICT (position_id, epoch_date) DO NOTHING
            const payoutId = uuidv4();
            const payoutIns = await trx.query<{ id: string }>(
              `
              INSERT INTO vault_yield_payouts (
                id, position_id, user_id, epoch_date, yield_amount,
                ledger_entry_id, settled_at, created_at
              )
              VALUES ($1, $2, $3, $4::date, $5::numeric(20,8), NULL, NOW(), NOW())
              ON CONFLICT (position_id, epoch_date) DO NOTHING
              RETURNING id
              `,
              [payoutId, lockedPos.id, lockedPos.user_id, epochDate, yieldAmountStr]
            );

            if (payoutIns.rowCount === 0) {
              return {
                status: 'DUPLICATE_SKIPPED' as const,
                yieldScaled: 0n,
                principalReturnedScaled: 0n,
                matured: false,
              };
            }

            // 4. Lock user row and credit yield_amount to Main USDT Wallet (SETTLED balance in financial_ledger_entries)
            await trx.query(`SELECT id FROM users WHERE id = $1 FOR UPDATE`, [lockedPos.user_id]);

            const yieldLedgerId = uuidv4();
            const yieldPublicTxnId = generateLedgerTransactionPublicId();
            const yieldSourceRef = `CVAULT-YIELD-${epochDate}`;
            const yieldDescription = `PHIVONEX CHRONO VAULTS™ Daily Yield (${lockedPos.plan_name} @ ${Number(lockedPos.daily_rate_pct_snapshot).toFixed(2)}% - ${epochDate})`;

            const yieldLedgerIns = await trx.query<{ id: string }>(
              `
              INSERT INTO financial_ledger_entries (
                id, public_txn_id, user_id, entry_type, source_type, source_id,
                source_ref, description, amount, currency, status, created_at
              )
              VALUES ($1, $2, $3, 'CREDIT', 'CHRONO_VAULT_YIELD', $4, $5, $6, $7::numeric(20,8), 'USDT', 'SETTLED', NOW())
              ON CONFLICT (source_type, source_id, entry_type) DO NOTHING
              RETURNING id
              `,
              [
                yieldLedgerId,
                yieldPublicTxnId,
                lockedPos.user_id,
                payoutId,
                yieldSourceRef,
                yieldDescription,
                yieldAmountStr,
              ]
            );

            const finalYieldLedgerId =
              yieldLedgerIns.rowCount > 0 ? yieldLedgerIns.rows[0].id : null;

            if (finalYieldLedgerId) {
              await trx.query(
                `UPDATE vault_yield_payouts SET ledger_entry_id = $1 WHERE id = $2`,
                [finalYieldLedgerId, payoutId]
              );
            }

            // 5. Increment days_settled and check maturity
            const newDaysSettled = currentDaysSettled + 1;
            const reachedMaturity = newDaysSettled >= durationDays;
            let principalReturnedScaled = 0n;

            if (reachedMaturity) {
              // 6. Maturity Transition & Idempotent Principal Return
              if (lockedPos.return_principal_on_maturity && !lockedPos.principal_returned_at) {
                const maturityLedgerId = uuidv4();
                const maturityPublicTxnId = generateLedgerTransactionPublicId();
                const maturitySourceRef = `CVAULT-MATURITY-${lockedPos.id.slice(0, 8).toUpperCase()}`;
                const maturityDescription = `PHIVONEX CHRONO VAULTS™ Maturity Principal Return (${lockedPos.plan_name} - ${durationDays} Days)`;

                const matLedgerIns = await trx.query<{ id: string }>(
                  `
                  INSERT INTO financial_ledger_entries (
                    id, public_txn_id, user_id, entry_type, source_type, source_id,
                    source_ref, description, amount, currency, status, created_at
                  )
                  VALUES ($1, $2, $3, 'CREDIT', 'CHRONO_VAULT_MATURITY', $4, $5, $6, $7::numeric(20,8), 'USDT', 'SETTLED', NOW())
                  ON CONFLICT (source_type, source_id, entry_type) DO NOTHING
                  RETURNING id
                  `,
                  [
                    maturityLedgerId,
                    maturityPublicTxnId,
                    lockedPos.user_id,
                    lockedPos.id,
                    maturitySourceRef,
                    maturityDescription,
                    lockedPos.principal_amount,
                  ]
                );

                if (matLedgerIns.rowCount > 0) {
                  principalReturnedScaled = parseAmountToScaledBigInt(lockedPos.principal_amount);
                }
              }

              await trx.query(
                `
                UPDATE user_vault_positions
                SET
                  days_settled = $1,
                  total_yield_earned = ROUND(total_yield_earned + $2::numeric(20,8), 8),
                  last_settled_date = GREATEST(COALESCE(last_settled_date, $3::date), $3::date),
                  status = 'MATURED',
                  principal_returned_at = CASE
                    WHEN $4::boolean = TRUE THEN COALESCE(principal_returned_at, NOW())
                    ELSE principal_returned_at
                  END,
                  updated_at = NOW()
                WHERE id = $5 AND principal_returned_at IS NULL
                `,
                [
                  newDaysSettled,
                  yieldAmountStr,
                  epochDate,
                  Boolean(lockedPos.return_principal_on_maturity),
                  lockedPos.id,
                ]
              );
            } else {
              await trx.query(
                `
                UPDATE user_vault_positions
                SET
                  days_settled = $1,
                  total_yield_earned = ROUND(total_yield_earned + $2::numeric(20,8), 8),
                  last_settled_date = GREATEST(COALESCE(last_settled_date, $3::date), $3::date),
                  updated_at = NOW()
                WHERE id = $4
                `,
                [newDaysSettled, yieldAmountStr, epochDate, lockedPos.id]
              );
            }

            // 7. Atomically enqueue Unified Unilevel Yield Event (Task 06 -> Task 07 outbox)
            // Note: Only daily yield (`yieldAmountStr`) triggers Unilevel ROI-on-ROI; principal return never triggers Unilevel royalty.
            await enqueueUnilevelYieldEvent(trx, {
              sourceProductType: 'CHRONO_VAULT',
              sourceYieldId: payoutId,
              sourceUserId: lockedPos.user_id,
              epochDate,
              sourceRoiUsd: yieldAmountStr,
              rawTokenAmount: null,
              tokenReferencePriceUsd: null,
            });

            return {
              status: 'SETTLED' as const,
              yieldScaled: yieldAmountScaled,
              principalReturnedScaled,
              matured: reachedMaturity,
            };
          });

          if (stepOutcome.status === 'SETTLED') {
            positionsProcessed++;
            payoutsCreated++;
            totalYieldScaled += stepOutcome.yieldScaled;
            totalPrincipalReturnedScaled += stepOutcome.principalReturnedScaled;
            settledDatesSet.add(epochDate);
            if (stepOutcome.matured) {
              positionsMatured++;
              break; // Position has matured; stop processing any subsequent dates
            }
          } else if (stepOutcome.status === 'DUPLICATE_SKIPPED') {
            duplicatePayoutsSkipped++;
          } else if (stepOutcome.status === 'ALREADY_MATURED') {
            totalPrincipalReturnedScaled += stepOutcome.principalReturnedScaled;
            if (stepOutcome.matured) {
              positionsMatured++;
            }
            break;
          }
        }
      }

      for (const settledDate of settledDatesSet) {
        await recordChronoVaultSettlementCycle(db, settledDate, 'COMPLETED');
      }
      await recordChronoVaultSettlementCycle(db, effectiveTargetDate, 'COMPLETED');

      // Trigger 16-Generation Unilevel ROI-on-ROI payout processing for newly enqueued CHRONO_VAULT yield events
      if (payoutsCreated > 0) {
        try {
          const { processPendingUnilevelYieldEvents } = await import('./roiGenerationService');
          await processPendingUnilevelYieldEvents(200);
        } catch (unilevelErr) {
          console.warn(
            '[ChronoVaultEpochService] Notice processing pending Unilevel yield events:',
            unilevelErr
          );
        }
      }

      return {
        targetDate: effectiveTargetDate,
        scheduleType: '7_DAY_CONTINUOUS_UTC',
        positionsEvaluated: positionsRes.rowCount,
        positionsProcessed,
        payoutsCreated,
        duplicatePayoutsSkipped,
        positionsMatured,
        totalYieldDistributedUsd: formatScaledBigInt(totalYieldScaled),
        totalPrincipalReturnedUsd: formatScaledBigInt(totalPrincipalReturnedScaled),
        settledDates: Array.from(settledDatesSet).sort(),
        completedAt: new Date().toISOString(),
      };
    } catch (err: any) {
      await recordChronoVaultSettlementCycle(
        db,
        effectiveTargetDate,
        'FAILED',
        err?.message || 'Unknown error during Chrono Vault settlement'
      ).catch(() => {});
      throw err;
    }
  });
}

/**
 * Returns the complete PHIVONEX CHRONO VAULTS™ overview:
 * - All 5 active vault plans (`Chrono Bronze Vault` 200D @ 0.35%, `Chrono Silver Vault` 1Y @ 0.45%,
 *   `Chrono Cyan Vault` 2Y @ 0.55%, `Chrono Gold Vault` 5Y @ 0.65%, `Chrono Sovereign Vault` 10Y @ 0.80%)
 * - Authenticated user's active & matured vault positions, remaining days, payout history, and Main USDT Wallet balance
 */
export async function getChronoVaultsOverview(
  userId?: string | null
): Promise<ChronoVaultOverviewResponse> {
  const db = await getDb();
  const activePlans = await getActiveChronoVaultPlans(db);

  let userSummary: ChronoVaultOverviewResponse['userSummary'] = null;

  if (userId) {
    const [allPositions, payoutHistory, walletBal] = await Promise.all([
      getUserChronoVaultPositions(userId, db),
      getUserChronoVaultYieldPayouts(userId, 50, db),
      getUserMainUsdtBalanceExact(userId, db),
    ]);

    const activePositions = allPositions.filter((p) => p.status === 'ACTIVE');
    const maturedPositions = allPositions.filter((p) => p.status === 'MATURED');

    let activePrincipalScaled = 0n;
    let maturedPrincipalReturnedScaled = 0n;
    let lifetimeYieldScaled = 0n;

    for (const pos of allPositions) {
      if (pos.status === 'ACTIVE') {
        activePrincipalScaled += parseAmountToScaledBigInt(pos.principalAmount);
      } else if (pos.status === 'MATURED' && pos.principalReturnedAt) {
        maturedPrincipalReturnedScaled += parseAmountToScaledBigInt(pos.principalAmount);
      }
      lifetimeYieldScaled += parseAmountToScaledBigInt(pos.totalYieldEarned);
    }

    userSummary = {
      mainUsdtWalletBalance: walletBal.availableBalanceStr,
      totalActivePrincipalUsd: formatScaledBigInt(activePrincipalScaled),
      totalMaturedPrincipalReturnedUsd: formatScaledBigInt(maturedPrincipalReturnedScaled),
      totalLifetimeYieldUsd: formatScaledBigInt(lifetimeYieldScaled),
      activePositionsCount: activePositions.length,
      maturedPositionsCount: maturedPositions.length,
      activePositions,
      maturedPositions,
      allPositions,
      payoutHistory,
    };
  }

  return {
    activePlans,
    scheduleSummary: '7-Day Continuous Daily Yield (Monday – Sunday UTC) + 100% Principal Return on Maturity',
    userSummary,
  };
}

let chronoSchedulerStarted = false;
let chronoSchedulerIntervalHandle: NodeJS.Timeout | null = null;

/**
 * Starts the automated PHIVONEX CHRONO VAULTS™ 7-Day UTC Yield & Maturity Scheduler.
 * - Executes an immediate startup catch-up check for any unsettled completed UTC days.
 * - Runs a 60-second safety check interval (guarded against overlapping runs by `withChronoVaultSettlementLock`).
 */
export function startChronoVaultScheduler(): void {
  if (chronoSchedulerStarted) return;
  chronoSchedulerStarted = true;

  const runScheduledCheck = async () => {
    try {
      const latestCompletedUtcDate = getLatestCompletedUtcDateStr(new Date());
      await settleChronoVaultsForDate(latestCompletedUtcDate, { catchUp: true });
    } catch (err) {
      console.error('[ChronoVaultScheduler] Error during scheduled check:', err);
    }
  };

  // Initial startup catch-up
  runScheduledCheck().catch((err) =>
    console.error('[ChronoVaultScheduler] Initial catch-up error:', err)
  );

  // 60-second interval check
  chronoSchedulerIntervalHandle = setInterval(() => {
    runScheduledCheck().catch((err) =>
      console.error('[ChronoVaultScheduler] Interval check error:', err)
    );
  }, 60_000);

  if (chronoSchedulerIntervalHandle && typeof chronoSchedulerIntervalHandle.unref === 'function') {
    chronoSchedulerIntervalHandle.unref();
  }

  console.log('[ChronoVaultScheduler] PHIVONEX CHRONO VAULTS™ 7-Day UTC yield & maturity scheduler initialized.');
}
