import { getDb, DatabaseClient } from '../db/db';
import { v4 as uuidv4 } from 'uuid';

export interface CircuitBreakerConfig {
  id: number;
  minReserveRatio: string;
  maxHourlyOutflowUsd: string;
  maxUserDailyWithdrawalUsd: string;
  withdrawalMode: 'AUTO' | 'MANUAL_REVIEW' | 'PAUSED_OFF';
  tripReason: string | null;
  trippedAt: string | null;
  updatedAt: string;
}

export interface CircuitBreakerEvaluationResult {
  tripped: boolean;
  withdrawalMode: 'AUTO' | 'MANUAL_REVIEW' | 'PAUSED_OFF';
  reserveRatio: number;
  rollingHourlyOutflowUsd: number;
  pendingObligationsUsd: number;
  reason?: string;
}

/**
 * Evaluates and enforces liquidity circuit breaker rules.
 * Locks `system_circuit_breaker_configs` (id = 1 FOR UPDATE).
 */
export async function evaluateAndEnforceCircuitBreaker(params: {
  liquidReserveUsd: number;
  requestedPayoutUsd: number;
  traceId?: string;
  dbClient?: DatabaseClient;
}): Promise<CircuitBreakerEvaluationResult> {
  const db = params.dbClient || (await getDb());
  const liquidReserveUsd = Number(params.liquidReserveUsd || 0);
  const requestedPayoutUsd = Number(params.requestedPayoutUsd || 0);
  const traceId = params.traceId || `CB-EVAL-${Date.now()}`;

  return await db.transaction(async (trx) => {
    // 1. Lock circuit breaker row FOR UPDATE
    const cbRes = await trx.query<{
      min_reserve_ratio: string;
      max_hourly_outflow_usd: string;
      withdrawal_mode: 'AUTO' | 'MANUAL_REVIEW' | 'PAUSED_OFF';
      trip_reason: string | null;
    }>(
      `SELECT min_reserve_ratio, max_hourly_outflow_usd, withdrawal_mode, trip_reason 
       FROM system_circuit_breaker_configs 
       WHERE id = 1 
       FOR UPDATE`
    );

    if (cbRes.rows.length === 0) {
      return {
        tripped: false,
        withdrawalMode: 'AUTO',
        reserveRatio: 999.0,
        rollingHourlyOutflowUsd: 0,
        pendingObligationsUsd: 0,
      };
    }

    const config = cbRes.rows.shift()!;
    const minReserveRatio = parseFloat(config.min_reserve_ratio) || 1.25;
    const maxHourlyOutflowUsd = parseFloat(config.max_hourly_outflow_usd) || 50000.0;

    // 2. Compute pending obligations & rolling 1-hour outflow
    const obligationsRes = await trx.query<{ pending_total: string }>(
      `SELECT COALESCE(SUM(amount), 0)::numeric(20,8)::text AS pending_total
       FROM withdrawals
       WHERE status IN ('PENDING', 'APPROVED', 'PROCESSING')`
    );
    const pendingObligationsUsd = parseFloat(obligationsRes.rows[0]?.pending_total || '0');

    const hourlyRes = await trx.query<{ hourly_total: string }>(
      `SELECT COALESCE(SUM(amount), 0)::numeric(20,8)::text AS hourly_total
       FROM withdrawals
       WHERE status IN ('COMPLETED', 'PROCESSING', 'APPROVED')
         AND created_at >= NOW() - INTERVAL '1 hour'`
    );
    const rollingHourlyOutflowUsd = parseFloat(hourlyRes.rows[0]?.hourly_total || '0');

    const totalObligationsWithRequest = pendingObligationsUsd + requestedPayoutUsd;
    const reserveRatio = totalObligationsWithRequest > 0 ? liquidReserveUsd / totalObligationsWithRequest : 999.0;

    let tripReason: string | null = null;
    let shouldTrip = false;

    if (reserveRatio < minReserveRatio) {
      shouldTrip = true;
      tripReason = `RESERVE_RATIO_BREACH: Calculated reserve ratio (${reserveRatio.toFixed(4)}x) dropped below minimum required threshold (${minReserveRatio.toFixed(4)}x). Liquid reserve: $${liquidReserveUsd.toFixed(2)}, Obligations: $${totalObligationsWithRequest.toFixed(2)}.`;
    } else if (rollingHourlyOutflowUsd + requestedPayoutUsd > maxHourlyOutflowUsd) {
      shouldTrip = true;
      tripReason = `HOURLY_OUTFLOW_BREACH: Rolling hourly outflow ($${(rollingHourlyOutflowUsd + requestedPayoutUsd).toFixed(2)}) exceeded maximum permitted ceiling ($${maxHourlyOutflowUsd.toFixed(2)}).`;
    }

    if (config.withdrawal_mode === 'PAUSED_OFF') {
      return {
        tripped: true,
        withdrawalMode: 'PAUSED_OFF',
        reserveRatio,
        rollingHourlyOutflowUsd,
        pendingObligationsUsd,
        reason: config.trip_reason || 'Withdrawals are paused (PAUSED_OFF) by protocol governance.',
      };
    }

    if (shouldTrip && config.withdrawal_mode !== 'MANUAL_REVIEW') {
      // Trip circuit breaker to MANUAL_REVIEW
      await trx.query(
        `UPDATE system_circuit_breaker_configs
         SET withdrawal_mode = 'MANUAL_REVIEW',
             trip_reason = $1,
             tripped_at = NOW(),
             updated_at = NOW()
         WHERE id = 1`,
        [tripReason]
      );

      // Record CRITICAL audit log
      await trx.query(
        `INSERT INTO security_audit_logs (
           id, trace_id, actor_user_id, action_type, severity, payload, created_at
         )
         VALUES ($1, $2, NULL, 'CIRCUIT_BREAKER_TRIPPED', 'CRITICAL', $3::jsonb, NOW())`,
        [
          uuidv4(),
          traceId,
          JSON.stringify({
            liquidReserveUsd,
            requestedPayoutUsd,
            reserveRatio,
            minReserveRatio,
            rollingHourlyOutflowUsd,
            maxHourlyOutflowUsd,
            tripReason,
          }),
        ]
      );

      return {
        tripped: true,
        withdrawalMode: 'MANUAL_REVIEW',
        reserveRatio,
        rollingHourlyOutflowUsd,
        pendingObligationsUsd,
        reason: tripReason || undefined,
      };
    }

    return {
      tripped: config.withdrawal_mode === 'MANUAL_REVIEW',
      withdrawalMode: config.withdrawal_mode,
      reserveRatio,
      rollingHourlyOutflowUsd,
      pendingObligationsUsd,
      reason: config.trip_reason || undefined,
    };
  });
}

/**
 * Resets circuit breaker back to AUTO mode (Admin action).
 */
export async function resetCircuitBreakerToAuto(params: {
  adminUserId: string;
  reason: string;
  traceId?: string;
}): Promise<void> {
  const db = await getDb();
  const traceId = params.traceId || `CB-RESET-${Date.now()}`;

  await db.transaction(async (trx) => {
    await trx.query(
      `UPDATE system_circuit_breaker_configs
       SET withdrawal_mode = 'AUTO',
           trip_reason = NULL,
           tripped_at = NULL,
           updated_at = NOW()
       WHERE id = 1`
    );

    await trx.query(
      `INSERT INTO security_audit_logs (
         id, trace_id, actor_user_id, action_type, severity, payload, created_at
       )
       VALUES ($1, $2, $3, 'CIRCUIT_BREAKER_RESET_TO_AUTO', 'WARN', $4::jsonb, NOW())`,
      [
        uuidv4(),
        traceId,
        params.adminUserId,
        JSON.stringify({
          reason: params.reason,
          resetAt: new Date().toISOString(),
        }),
      ]
    );
  });
}
