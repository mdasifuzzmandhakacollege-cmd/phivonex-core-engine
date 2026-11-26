import { getDb, DatabaseClient } from '../db/db';
import { v4 as uuidv4 } from 'uuid';
import { generateWithdrawalPublicId, generateLedgerTransactionPublicId } from '../utils/idGenerator';
import { postLedgerReversal, syncUserLedger } from './walletLedgerService';
import {
  parseAmountToScaledBigInt,
  formatScaledBigInt,
  getUserMainUsdtBalanceExact,
} from './tradingPoolService';
import { notifyWithdrawalStatus } from './notificationService';
import { hashToken } from '../utils/crypto';

export type WithdrawalStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export interface WithdrawalRecord {
  id: string;
  publicWithdrawalId: string;
  userId: string;
  amount: number;
  amountUsd: string;
  currency: string;
  destinationType: string;
  destinationReference: string;
  status: WithdrawalStatus;
  routingMode?: 'AUTO' | 'MANUAL_REVIEW';
  isDuplicate?: boolean;
  requestedAt: string;
  approvedAt: string | null;
  rejectedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  failedAt: string | null;
  rejectionReason: string | null;
  idempotencyKey: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WithdrawalHistoryResponse {
  withdrawals: WithdrawalRecord[];
  pagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
  };
}

function mapRowToWithdrawalRecord(
  row: any,
  extras?: { routingMode?: 'AUTO' | 'MANUAL_REVIEW'; isDuplicate?: boolean }
): WithdrawalRecord {
  let amountUsd = '0.00000000';
  try {
    amountUsd = formatScaledBigInt(parseAmountToScaledBigInt(String(row.amount ?? '0')));
  } catch {
    amountUsd = Number(row.amount || 0).toFixed(8);
  }
  return {
    id: row.id,
    publicWithdrawalId: row.public_withdrawal_id,
    userId: row.user_id,
    amount: Number(amountUsd),
    amountUsd,
    currency: row.currency || 'USDT',
    destinationType: row.destination_type,
    destinationReference: row.destination_reference,
    status: row.status as WithdrawalStatus,
    routingMode: extras?.routingMode,
    isDuplicate: extras?.isDuplicate,
    requestedAt: row.requested_at ? new Date(row.requested_at).toISOString() : new Date(row.created_at).toISOString(),
    approvedAt: row.approved_at ? new Date(row.approved_at).toISOString() : null,
    rejectedAt: row.rejected_at ? new Date(row.rejected_at).toISOString() : null,
    completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
    cancelledAt: row.cancelled_at ? new Date(row.cancelled_at).toISOString() : null,
    failedAt: row.failed_at ? new Date(row.failed_at).toISOString() : null,
    rejectionReason: row.rejection_reason || null,
    idempotencyKey: row.idempotency_key || null,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export async function logWithdrawalStateTransition(params: {
  withdrawalId: string;
  publicWithdrawalId: string;
  userId: string;
  previousStatus: string | null;
  newStatus: string;
  actorType: 'USER' | 'ADMIN' | 'SYSTEM';
  actorId?: string;
  actorEmail?: string;
  reason?: string;
  amount: number | string;
  destinationType: string;
  destinationReference: string;
  txHash?: string;
  dbClient?: DatabaseClient;
}): Promise<void> {
  try {
    const db = params.dbClient || (await getDb());
    const id = uuidv4();
    const now = new Date();

    let userEmail = params.actorEmail || null;
    let userName: string | null = null;

    if (!userEmail && params.userId) {
      const userRes = await db.query(
        `SELECT email, full_name FROM users WHERE id = $1 LIMIT 1`,
        [params.userId]
      ).catch(() => ({ rows: [] }));

      userEmail = userRes.rows[0]?.email || null;
      userName = userRes.rows[0]?.full_name || null;
    }

    await db.query(
      `
      INSERT INTO withdrawal_status_logs (
        id, withdrawal_id, public_withdrawal_id, user_id, user_email, user_name,
        previous_status, new_status, actor_type, actor_id, actor_email,
        reason, amount, destination_type, destination_reference, tx_hash,
        transition_timestamp, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::numeric(20,8), $14, $15, $16, $17, $17)
      `,
      [
        id,
        params.withdrawalId,
        params.publicWithdrawalId,
        params.userId,
        userEmail,
        userName,
        params.previousStatus,
        params.newStatus,
        params.actorType,
        params.actorId || null,
        params.actorEmail || null,
        params.reason || null,
        params.amount,
        params.destinationType,
        params.destinationReference,
        params.txHash || null,
        now,
      ]
    );
  } catch (err) {
    console.warn('[WithdrawalStateLog] Failed to insert state transition log:', err);
  }
}

export const MIN_WITHDRAWAL_USD_SCALED = 10_000_000n; // 0.10000000 USDT
export const ZERO_EVM_ADDRESS = '0x0000000000000000000000000000000000000000';

export async function getMinWithdrawalAmount(): Promise<number> {
  try {
    const db = await getDb();
    const res = await db.query(
      `SELECT config_value FROM system_economic_configs WHERE config_key = 'MIN_WITHDRAWAL_AMOUNT' LIMIT 1`
    ).catch(() => ({ rows: [] }));

    if (res.rows.length > 0) {
      const val = res.rows[0].config_value;
      const num = typeof val === 'number' ? val : parseFloat(typeof val === 'string' ? JSON.parse(val) : val);
      if (!isNaN(num) && num >= 0.10) {
        return num;
      }
    }
  } catch (err) {
    console.warn('[Withdrawal Service] Failed to read MIN_WITHDRAWAL_AMOUNT config, defaulting to 0.10:', err);
  }
  return 0.10;
}

/**
 * Validates a BSC (BEP-20) destination wallet address:
 * - Must match ^0x[a-fA-F0-9]{40}$
 * - Explicitly rejects the zero address 0x0000000000000000000000000000000000000000
 */
export function validateBscBep20DestinationAddress(address: string): {
  valid: boolean;
  normalizedAddress: string;
  error?: string;
} {
  const trimmed = String(address || '').trim();
  if (!trimmed) {
    return {
      valid: false,
      normalizedAddress: '',
      error: 'INVALID_DESTINATION_ADDRESS: Destination BSC (BEP-20) wallet address is required.',
    };
  }
  if (!/^0x[a-fA-F0-9]{40}$/.test(trimmed)) {
    return {
      valid: false,
      normalizedAddress: trimmed,
      error: `INVALID_DESTINATION_ADDRESS: '${trimmed}' is not a valid 42-character hexadecimal BSC (BEP-20) address (^0x[a-fA-F0-9]{40}$).`,
    };
  }
  if (trimmed.toLowerCase() === ZERO_EVM_ADDRESS) {
    return {
      valid: false,
      normalizedAddress: trimmed,
      error: 'INVALID_DESTINATION_ADDRESS: Cannot withdraw to the zero-address (0x0000000000000000000000000000000000000000).',
    };
  }
  return {
    valid: true,
    normalizedAddress: trimmed,
  };
}

/**
 * TASK-09 Step 4: Hardened BSC BEP-20 Withdrawal Guard & Concurrency Protection
 * Inside an ACID PostgreSQL transaction with SELECT ... FOR UPDATE on the user's users row:
 * 1. Minimum Withdrawal: Reject any amount < 0.10000000 USDT (MIN_WITHDRAWAL_USD = 0.10).
 * 2. BSC (BEP-20) Address Validation: Validate ^0x[a-fA-F0-9]{40}$ and explicitly reject zero-address 0x0000000000000000000000000000000000000000.
 * 3. Idempotency Guard: Support idempotencyKey so retrying an identical request returns the existing withdrawal record without a second debit.
 * 4. Daily User Limit & Circuit-Breaker Mode Check: Read system_circuit_breaker_configs (id = 1); enforce rolling 24-hour withdrawal total + new amount <= max_user_daily_withdrawal_usd, and set routing metadata according to withdrawal_mode (AUTO vs MANUAL_REVIEW).
 * 5. Atomic Balance Lock & Debit: Verify Main USDT Wallet available_balance >= amountUsd AFTER acquiring FOR UPDATE lock, debit wallet immediately (DEBIT in financial_ledger_entries with source_type = 'WITHDRAWAL'), and record audit metadata in security_audit_logs.
 */
export async function createWithdrawalRequest(params: {
  userId: string;
  amount?: number | string;
  amountUsd?: number | string;
  destinationType?: string;
  destinationReference: string;
  idempotencyKey?: string;
  otp?: string;
}): Promise<WithdrawalRecord> {
  const {
    userId,
    amount,
    amountUsd,
    destinationType = 'USDT_BEP20',
    destinationReference,
    idempotencyKey,
    otp,
  } = params;

  const rawAmountInput = amount !== undefined ? amount : amountUsd;
  if (rawAmountInput === undefined || rawAmountInput === null || rawAmountInput === '') {
    const err: any = new Error('INVALID_AMOUNT: Withdrawal amount is required.');
    err.code = 'INVALID_AMOUNT';
    err.statusCode = 400;
    throw err;
  }

  let amountScaled: bigint;
  try {
    amountScaled = parseAmountToScaledBigInt(rawAmountInput);
  } catch (parseErr: any) {
    const err: any = new Error(
      parseErr?.message || 'INVALID_AMOUNT: Withdrawal amount must be a valid positive number.'
    );
    err.code = 'INVALID_AMOUNT';
    err.statusCode = 400;
    throw err;
  }

  if (amountScaled <= 0n) {
    const err: any = new Error('INVALID_AMOUNT: Withdrawal amount must be greater than 0.');
    err.code = 'INVALID_AMOUNT';
    err.statusCode = 400;
    throw err;
  }

  // 1. Minimum Withdrawal Check (< 0.10000000 USDT rejected)
  const configuredMinNum = await getMinWithdrawalAmount();
  const configuredMinScaled = parseAmountToScaledBigInt(configuredMinNum.toFixed(8));
  const effectiveMinScaled =
    configuredMinScaled > MIN_WITHDRAWAL_USD_SCALED
      ? configuredMinScaled
      : MIN_WITHDRAWAL_USD_SCALED;

  if (amountScaled < effectiveMinScaled) {
    const minStr = formatScaledBigInt(effectiveMinScaled);
    const err: any = new Error(
      `MINIMUM_AMOUNT_LIMIT: Minimum withdrawal amount is $${minStr} USDT.`
    );
    err.code = 'MINIMUM_AMOUNT_LIMIT';
    err.statusCode = 400;
    throw err;
  }

  const exactAmountStr = formatScaledBigInt(amountScaled);
  const cleanAmountNum = Number(exactAmountStr);

  const destTypeUpper = String(destinationType || 'USDT_BEP20').trim().toUpperCase();
  if (!destTypeUpper) {
    const err: any = new Error('INVALID_DESTINATION_TYPE: Destination type is required.');
    err.code = 'INVALID_DESTINATION_TYPE';
    err.statusCode = 400;
    throw err;
  }

  if (!destinationReference || !String(destinationReference).trim()) {
    const err: any = new Error(
      'INVALID_DESTINATION_ADDRESS: Destination address or reference details are required.'
    );
    err.code = 'INVALID_DESTINATION_ADDRESS';
    err.statusCode = 400;
    throw err;
  }

  // 2. Hardened BSC (BEP-20) Address Validation (^0x[a-fA-F0-9]{40}$ and non-zero address)
  const destRef = String(destinationReference).trim();
  const addrValidation = validateBscBep20DestinationAddress(destRef);
  if (!addrValidation.valid) {
    const err: any = new Error(addrValidation.error);
    err.code = 'INVALID_DESTINATION_ADDRESS';
    err.statusCode = 400;
    throw err;
  }

  const db = await getDb();

  const { withdrawal, isDuplicate, userDetails } = await db.transaction(async (trx) => {
    // 0. Sane statement / lock timeout safety
    try {
      await trx.query(`SET LOCAL statement_timeout = '15000'`);
      await trx.query(`SET LOCAL lock_timeout = '8000'`);
    } catch {}

    // Acquire PostgreSQL Row-Level Lock on the user's row (SELECT ... FOR UPDATE)
    const userRes = await trx.query<{
      id: string;
      email: string;
      full_name: string;
      public_id: string;
    }>(
      `SELECT id, email, full_name, public_id FROM users WHERE id = $1 FOR UPDATE`,
      [userId]
    );
    if (userRes.rows.length === 0) {
      const err: any = new Error('USER_NOT_FOUND: User account not found.');
      err.code = 'USER_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }
    const user = userRes.rows[0];

    // 1. Check circuit-breaker configuration (system_circuit_breaker_configs id = 1)
    const cbRes = await trx.query<{
      max_user_daily_withdrawal_usd: string;
      withdrawal_mode: 'AUTO' | 'MANUAL_REVIEW' | 'PAUSED_OFF';
      trip_reason: string | null;
    }>(
      `
      SELECT
        max_user_daily_withdrawal_usd::numeric(20,8)::text AS max_user_daily_withdrawal_usd,
        withdrawal_mode,
        trip_reason
      FROM system_circuit_breaker_configs
      WHERE id = 1
      LIMIT 1
      `
    );

    const maxDailyStr = cbRes.rows[0]?.max_user_daily_withdrawal_usd || '10000.00000000';
    const maxDailyScaled = parseAmountToScaledBigInt(maxDailyStr);
    const rawWithdrawalMode = cbRes.rows[0]?.withdrawal_mode || 'AUTO';

    if (rawWithdrawalMode === 'PAUSED_OFF') {
      const err: any = new Error(
        'MODULE_PAUSED: Module Temporarily Paused by Protocol Governance — BEP-20 withdrawals are currently paused by administration.'
      );
      err.code = 'MODULE_PAUSED';
      err.statusCode = 403;
      throw err;
    }

    const routingMode: 'AUTO' | 'MANUAL_REVIEW' =
      rawWithdrawalMode === 'MANUAL_REVIEW' ? 'MANUAL_REVIEW' : 'AUTO';

    // 2. Idempotency Guard: if idempotencyKey matches an existing withdrawal for this user, return it without a second debit
    const cleanIdempotencyKey = idempotencyKey ? String(idempotencyKey).trim() : null;
    if (cleanIdempotencyKey) {
      const existing = await trx.query(
        `SELECT * FROM withdrawals WHERE user_id = $1 AND idempotency_key = $2 LIMIT 1`,
        [userId, cleanIdempotencyKey]
      );
      if (existing.rows.length > 0) {
        return {
          withdrawal: mapRowToWithdrawalRecord(existing.rows[0], {
            routingMode,
            isDuplicate: true,
          }),
          isDuplicate: true,
          userDetails: user,
        };
      }
    }

    // 3. Atomically verify OTP if provided
    let tokenRecordId: string | null = null;
    if (otp) {
      const trimmedOtp = String(otp).trim();
      if (!trimmedOtp || trimmedOtp.length !== 6) {
        const err: any = new Error(
          'INVALID_OTP: A valid 6-digit email verification code is required.'
        );
        err.code = 'INVALID_OTP';
        err.statusCode = 400;
        throw err;
      }
      const otpHash = hashToken(trimmedOtp);
      const tokenRes = await trx.query<{
        id: string;
        expires_at: Date;
        used_at: Date | null;
      }>(
        `SELECT id, expires_at, used_at FROM auth_tokens 
         WHERE user_id = $1 AND token_hash = $2 AND type = 'WITHDRAWAL_OTP'
         ORDER BY created_at DESC LIMIT 1
         FOR UPDATE`,
        [userId, otpHash]
      );

      if (tokenRes.rowCount === 0) {
        const err: any = new Error(
          'INVALID_OTP: Invalid withdrawal verification code. Please check your email or request a new code.'
        );
        err.code = 'INVALID_OTP';
        err.statusCode = 400;
        throw err;
      }

      const tokenRecord = tokenRes.rows[0];
      if (tokenRecord.used_at) {
        const err: any = new Error(
          'OTP_ALREADY_USED: This withdrawal verification code has already been used.'
        );
        err.code = 'OTP_ALREADY_USED';
        err.statusCode = 400;
        throw err;
      }

      if (new Date(tokenRecord.expires_at) < new Date()) {
        const err: any = new Error(
          'OTP_EXPIRED: Withdrawal verification code has expired. Please request a new one.'
        );
        err.code = 'OTP_EXPIRED';
        err.statusCode = 400;
        throw err;
      }

      tokenRecordId = tokenRecord.id;
    }

    // 4. Rolling 24-Hour Daily User Withdrawal Limit Check against system_circuit_breaker_configs
    const rolling24hRes = await trx.query<{ rolling_24h_total: string }>(
      `
      SELECT COALESCE(SUM(amount), 0)::numeric(20,8)::text AS rolling_24h_total
      FROM withdrawals
      WHERE user_id = $1
        AND status NOT IN ('REJECTED', 'CANCELLED', 'FAILED')
        AND created_at >= NOW() - INTERVAL '24 hours'
      `,
      [userId]
    );
    const rolling24hScaled = parseAmountToScaledBigInt(
      rolling24hRes.rows[0]?.rolling_24h_total || '0'
    );

    if (rolling24hScaled + amountScaled > maxDailyScaled) {
      const err: any = new Error(
        `DAILY_WITHDRAWAL_LIMIT_EXCEEDED: Requested withdrawal ($${exactAmountStr} USDT) plus rolling 24-hour withdrawals ($${formatScaledBigInt(rolling24hScaled)} USDT) exceeds maximum daily user withdrawal limit ($${formatScaledBigInt(maxDailyScaled)} USDT).`
      );
      err.code = 'DAILY_WITHDRAWAL_LIMIT_EXCEEDED';
      err.statusCode = 400;
      throw err;
    }

    // 5. Atomic Main USDT Wallet Balance Lock & Check AFTER acquiring FOR UPDATE lock
    await syncUserLedger(userId, trx);
    const exactBalances = await getUserMainUsdtBalanceExact(userId, trx);

    if (amountScaled > exactBalances.availableBalanceScaled) {
      const err: any = new Error(
        `INSUFFICIENT_BALANCE: Requested withdrawal amount ($${exactAmountStr} USDT) exceeds available Main USDT Wallet balance ($${exactBalances.availableBalanceStr} USDT).`
      );
      err.code = 'INSUFFICIENT_BALANCE';
      err.statusCode = 400;
      err.availableBalance = Number(exactBalances.availableBalanceStr);
      err.availableBalanceUsd = exactBalances.availableBalanceStr;
      throw err;
    }

    const id = uuidv4();
    const publicWithdrawalId = generateWithdrawalPublicId();
    const now = new Date();

    // 6. Create Withdrawal Record with exact NUMERIC(20,8) amount
    const insertRes = await trx.query(
      `
      INSERT INTO withdrawals (
        id, public_withdrawal_id, user_id, amount, currency,
        destination_type, destination_reference, status,
        requested_at, idempotency_key, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4::numeric(20,8), 'USDT', $5, $6, 'PENDING', $7, $8, $7, $7)
      RETURNING *
      `,
      [
        id,
        publicWithdrawalId,
        userId,
        exactAmountStr,
        destTypeUpper,
        destRef,
        now,
        cleanIdempotencyKey,
      ]
    );

    const createdWdr = mapRowToWithdrawalRecord(insertRes.rows[0], {
      routingMode,
      isDuplicate: false,
    });

    // 7. Reserve balance immediately by posting an exact NUMERIC(20,8) DEBIT entry in financial_ledger_entries
    const ledgerEntryId = uuidv4();
    const ledgerPublicTxnId = generateLedgerTransactionPublicId();
    const ledgerDescription = `Withdrawal Request [${routingMode}] - ${createdWdr.destinationType} (${createdWdr.destinationReference.slice(0, 12)}...)`;

    await trx.query(
      `
      INSERT INTO financial_ledger_entries (
        id, public_txn_id, user_id, entry_type, source_type, source_id,
        source_ref, description, amount, currency, status, created_at
      )
      VALUES ($1, $2, $3, 'DEBIT', 'WITHDRAWAL', $4, $5, $6, $7::numeric(20,8), 'USDT', 'SETTLED', $8)
      ON CONFLICT (source_type, source_id, entry_type) DO NOTHING
      `,
      [
        ledgerEntryId,
        ledgerPublicTxnId,
        userId,
        createdWdr.id,
        createdWdr.publicWithdrawalId,
        ledgerDescription,
        exactAmountStr,
        now,
      ]
    );

    // 8. Consume OTP token using the SAME trx
    if (tokenRecordId) {
      await trx.query(
        `UPDATE auth_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [tokenRecordId]
      );
    }

    // 9. Log State Transition: NULL -> PENDING using the SAME trx
    await logWithdrawalStateTransition({
      withdrawalId: createdWdr.id,
      publicWithdrawalId: createdWdr.publicWithdrawalId,
      userId: createdWdr.userId,
      previousStatus: null,
      newStatus: 'PENDING',
      actorType: 'USER',
      amount: exactAmountStr,
      destinationType: createdWdr.destinationType,
      destinationReference: createdWdr.destinationReference,
      reason: `Withdrawal request created by user (circuit-breaker mode: ${routingMode})`,
      dbClient: trx,
    });

    // 10. Record immutable security audit log in security_audit_logs
    const walletBalanceAfterStr = formatScaledBigInt(
      exactBalances.availableBalanceScaled - amountScaled
    );
    await trx.query(
      `
      INSERT INTO security_audit_logs (
        id, trace_id, actor_user_id, action_type, severity, payload, created_at
      )
      VALUES ($1, $2, $3, 'WITHDRAWAL_REQUEST_CREATED', 'INFO', $4::jsonb, $5)
      `,
      [
        uuidv4(),
        cleanIdempotencyKey
          ? `WDR-IDEMP:${userId}:${cleanIdempotencyKey}`
          : `WDR-${createdWdr.publicWithdrawalId}`,
        userId,
        JSON.stringify({
          withdrawalId: createdWdr.id,
          publicWithdrawalId: createdWdr.publicWithdrawalId,
          amountUsd: exactAmountStr,
          currency: 'USDT',
          destinationType: createdWdr.destinationType,
          destinationReference: createdWdr.destinationReference,
          status: createdWdr.status,
          routingMode,
          walletBalanceBeforeUsd: exactBalances.availableBalanceStr,
          walletBalanceAfterUsd: walletBalanceAfterStr,
          rolling24hTotalBeforeUsd: formatScaledBigInt(rolling24hScaled),
          rolling24hTotalAfterUsd: formatScaledBigInt(rolling24hScaled + amountScaled),
          maxUserDailyWithdrawalUsd: formatScaledBigInt(maxDailyScaled),
          ledgerPublicTxnId,
        }),
        now,
      ]
    );

    return {
      withdrawal: createdWdr,
      isDuplicate: false,
      userDetails: user,
    };
  });

  // =========================================================================
  // POST-COMMIT SIDE EFFECTS (RUN ONLY AFTER TRANSACTION COMMITS!)
  // =========================================================================
  if (!isDuplicate) {
    notifyWithdrawalStatus({
      userId,
      amountUsdt: cleanAmountNum,
      status: 'PENDING',
      withdrawalId: withdrawal.id,
    }).catch((notifErr) => {
      console.warn('[Notification] Error triggering withdrawal pending notification:', notifErr);
    });

    if (userDetails?.email) {
      import('./emailService')
        .then(({ queueEventEmail, sendTransactionEmail }) => {
          sendTransactionEmail({
            userId,
            recipientEmail: userDetails.email,
            recipientName: userDetails.full_name || 'Valued User',
            eventType: 'WITHDRAWAL_SUBMITTED',
            metadata: {
              publicWithdrawalId: withdrawal.publicWithdrawalId,
              amountUsd: exactAmountStr,
              destinationReference: withdrawal.destinationReference,
              network: 'BNB Smart Chain (BEP-20)',
            },
          }).catch(() => {});

          queueEventEmail(userDetails.email, 'WITHDRAWAL_STATUS', {
            displayName: userDetails.full_name || 'Valued User',
            publicId: userDetails.public_id || '',
            amount: exactAmountStr,
            status: 'PENDING',
            withdrawalId: withdrawal.id,
          }).catch((emailErr) => {
            console.warn('[EmailEngine] Failed to send Withdrawal Pending email:', emailErr);
          });
        })
        .catch(() => {});
    }
  }

  return withdrawal;
}

/**
 * Get paginated withdrawal history for a user.
 */
export async function getUserWithdrawals(
  userId: string,
  page = 1,
  limit = 20,
  statusFilter?: string
): Promise<WithdrawalHistoryResponse> {
  const db = await getDb();
  const safePage = Math.max(1, page);
  const safeLimit = Math.min(100, Math.max(1, limit));
  const offset = (safePage - 1) * safeLimit;

  let whereClauses = ['user_id = $1'];
  let queryParams: any[] = [userId];
  let paramIdx = 2;

  if (statusFilter && statusFilter !== 'ALL' && statusFilter !== 'all') {
    whereClauses.push(`status = $${paramIdx}`);
    queryParams.push(statusFilter.toUpperCase());
    paramIdx++;
  }

  const whereSql = whereClauses.join(' AND ');

  const countRes = await db.query<{ count: string | number }>(
    `SELECT COUNT(*)::int AS count FROM withdrawals WHERE ${whereSql}`,
    queryParams
  );
  const totalCount = Number(countRes.rows[0]?.count || 0);

  const txQueryParams = [...queryParams, safeLimit, offset];
  const listRes = await db.query(
    `
    SELECT * FROM withdrawals
    WHERE ${whereSql}
    ORDER BY created_at DESC
    LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
    `,
    txQueryParams
  );

  const totalPages = Math.ceil(totalCount / safeLimit) || 1;
  const withdrawals = listRes.rows.map((row) => mapRowToWithdrawalRecord(row));

  return {
    withdrawals,
    pagination: {
      page: safePage,
      limit: safeLimit,
      totalCount,
      totalPages,
    },
  };
}

/**
 * Get a single withdrawal record by public withdrawal ID with user ownership check.
 */
export async function getWithdrawalByPublicId(
  publicId: string,
  userId?: string
): Promise<WithdrawalRecord | null> {
  const db = await getDb();
  let res;
  if (userId) {
    res = await db.query(
      `SELECT * FROM withdrawals WHERE (public_withdrawal_id = $1 OR id::text = $1) AND user_id = $2`,
      [publicId, userId]
    );
  } else {
    res = await db.query(
      `SELECT * FROM withdrawals WHERE public_withdrawal_id = $1 OR id::text = $1`,
      [publicId]
    );
  }

  if (res.rows.length === 0) return null;
  return mapRowToWithdrawalRecord(res.rows[0]);
}

/**
 * Allow a user to cancel their own PENDING withdrawal request.
 * Releases reserved funds by posting a REVERSAL entry into the ledger.
 */
export async function cancelWithdrawalRequest(
  publicId: string,
  userId: string
): Promise<WithdrawalRecord> {
  const withdrawal = await getWithdrawalByPublicId(publicId, userId);
  if (!withdrawal) {
    throw new Error('NOT_FOUND: Withdrawal request not found.');
  }

  if (withdrawal.status !== 'PENDING') {
    throw new Error(`INVALID_STATE: Only PENDING withdrawals can be cancelled. Current status is ${withdrawal.status}.`);
  }

  const db = await getDb();
  const now = new Date();

  const updateRes = await db.query(
    `
    UPDATE withdrawals
    SET status = 'CANCELLED', cancelled_at = $1, updated_at = $1
    WHERE id = $2 AND status = 'PENDING'
    RETURNING *
    `,
    [now, withdrawal.id]
  );

  if (updateRes.rows.length === 0) {
    throw new Error('CONCURRENCY_ERROR: Withdrawal status was updated concurrently.');
  }

  const updatedWithdrawal = mapRowToWithdrawalRecord(updateRes.rows[0]);

  // Log State Transition: PENDING -> CANCELLED
  await logWithdrawalStateTransition({
    withdrawalId: updatedWithdrawal.id,
    publicWithdrawalId: updatedWithdrawal.publicWithdrawalId,
    userId: updatedWithdrawal.userId,
    previousStatus: withdrawal.status,
    newStatus: 'CANCELLED',
    actorType: 'USER',
    amount: updatedWithdrawal.amount,
    destinationType: updatedWithdrawal.destinationType,
    destinationReference: updatedWithdrawal.destinationReference,
    reason: 'Cancelled by user account',
  });

  // Release reserved funds back to available ledger balance
  await postLedgerReversal({
    userId,
    sourceType: 'WITHDRAWAL',
    sourceId: updatedWithdrawal.id,
    sourceRef: updatedWithdrawal.publicWithdrawalId,
    amount: updatedWithdrawal.amount,
    description: `Withdrawal Cancelled - Funds Released (${updatedWithdrawal.publicWithdrawalId})`,
    createdAt: now,
  });

  return updatedWithdrawal;
}

/**
 * Admin/Internal Settlement State Machine Processor.
 * Actions: APPROVE, COMPLETE, REJECT, FAIL.
 * Releases reserved funds on REJECT/FAIL; enforces single completion.
 */
export async function settleWithdrawalAction(params: {
  withdrawalIdOrPublicId: string;
  action: 'APPROVE' | 'COMPLETE' | 'REJECT' | 'FAIL' | 'MARK_PROCESSING' | 'PROCESSING';
  rejectionReason?: string;
  actorEmail?: string;
  txHash?: string;
}): Promise<WithdrawalRecord> {
  const { withdrawalIdOrPublicId, action, rejectionReason } = params;

  const withdrawal = await getWithdrawalByPublicId(withdrawalIdOrPublicId);
  if (!withdrawal) {
    throw new Error('NOT_FOUND: Withdrawal record not found.');
  }

  const db = await getDb();
  const now = new Date();
  const normalizedAction = action.toUpperCase();

  if (normalizedAction === 'APPROVE') {
    if (withdrawal.status !== 'PENDING') {
      throw new Error(`INVALID_STATE: Cannot APPROVE withdrawal in status ${withdrawal.status}. Must be PENDING.`);
    }

    const res = await db.query(
      `
      UPDATE withdrawals
      SET status = 'APPROVED', approved_at = $1, updated_at = $1
      WHERE id = $2 AND status = 'PENDING'
      RETURNING *
      `,
      [now, withdrawal.id]
    );

    if (res.rows.length === 0) throw new Error('CONCURRENCY_ERROR: Status changed concurrently.');
    const approvedRec = mapRowToWithdrawalRecord(res.rows[0]);

    // Log State Transition: PENDING -> APPROVED
    await logWithdrawalStateTransition({
      withdrawalId: approvedRec.id,
      publicWithdrawalId: approvedRec.publicWithdrawalId,
      userId: approvedRec.userId,
      previousStatus: withdrawal.status,
      newStatus: 'APPROVED',
      actorType: params.actorEmail ? 'ADMIN' : 'SYSTEM',
      actorEmail: params.actorEmail,
      amount: approvedRec.amount,
      destinationType: approvedRec.destinationType,
      destinationReference: approvedRec.destinationReference,
      reason: 'Approved for disbursement',
    });

    try {
      await notifyWithdrawalStatus({
        userId: approvedRec.userId,
        amountUsdt: approvedRec.amount,
        status: 'APPROVED',
        withdrawalId: approvedRec.id,
      });
    } catch (notifErr) {
      console.warn('[Notification] Error triggering withdrawal approved notification:', notifErr);
    }
    return approvedRec;
  }

  if (normalizedAction === 'MARK_PROCESSING' || normalizedAction === 'PROCESSING') {
    if (withdrawal.status !== 'PENDING' && withdrawal.status !== 'APPROVED') {
      throw new Error(`INVALID_STATE: Cannot transition withdrawal to PROCESSING from status ${withdrawal.status}. Must be PENDING or APPROVED.`);
    }

    const res = await db.query(
      `
      UPDATE withdrawals
      SET status = 'PROCESSING', updated_at = $1
      WHERE id = $2 AND status IN ('PENDING', 'APPROVED')
      RETURNING *
      `,
      [now, withdrawal.id]
    );

    if (res.rows.length === 0) throw new Error('CONCURRENCY_ERROR: Status changed concurrently.');
    const processingRec = mapRowToWithdrawalRecord(res.rows[0]);

    // Log State Transition: APPROVED/PENDING -> PROCESSING
    await logWithdrawalStateTransition({
      withdrawalId: processingRec.id,
      publicWithdrawalId: processingRec.publicWithdrawalId,
      userId: processingRec.userId,
      previousStatus: withdrawal.status,
      newStatus: 'PROCESSING',
      actorType: params.actorEmail ? 'ADMIN' : 'SYSTEM',
      actorEmail: params.actorEmail,
      amount: processingRec.amount,
      destinationType: processingRec.destinationType,
      destinationReference: processingRec.destinationReference,
      reason: 'On-chain broadcast / settlement in progress',
    });

    return processingRec;
  }

  if (normalizedAction === 'COMPLETE') {
    if (withdrawal.status !== 'APPROVED' && withdrawal.status !== 'PROCESSING' && withdrawal.status !== 'PENDING') {
      throw new Error(`INVALID_STATE: Cannot COMPLETE withdrawal in status ${withdrawal.status}. Must be PENDING, APPROVED, or PROCESSING.`);
    }

    const txHash = params.txHash?.trim();
    if (!txHash || !/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
      throw new Error('INVALID_TX_HASH: A valid 66-character on-chain transaction hash (starting with 0x) is required to mark a withdrawal as COMPLETED.');
    }

    const res = await db.query(
      `
      UPDATE withdrawals
      SET status = 'COMPLETED', completed_at = $1, updated_at = $1
      WHERE id = $2 AND status IN ('PENDING', 'APPROVED', 'PROCESSING')
      RETURNING *
      `,
      [now, withdrawal.id]
    );

    if (res.rows.length === 0) throw new Error('CONCURRENCY_ERROR: Withdrawal was already processed or cancelled.');
    const completedRec = mapRowToWithdrawalRecord(res.rows[0]);

    // Log State Transition: APPROVED/PROCESSING -> COMPLETED
    await logWithdrawalStateTransition({
      withdrawalId: completedRec.id,
      publicWithdrawalId: completedRec.publicWithdrawalId,
      userId: completedRec.userId,
      previousStatus: withdrawal.status,
      newStatus: 'COMPLETED',
      actorType: params.actorEmail ? 'ADMIN' : 'SYSTEM',
      actorEmail: params.actorEmail,
      amount: completedRec.amount,
      destinationType: completedRec.destinationType,
      destinationReference: completedRec.destinationReference,
      reason: 'Disbursement completed successfully on-chain',
      txHash: params.txHash,
    });

    try {
      await notifyWithdrawalStatus({
        userId: completedRec.userId,
        amountUsdt: completedRec.amount,
        status: 'COMPLETED',
        withdrawalId: completedRec.id,
      });
    } catch (notifErr) {
      console.warn('[Notification] Error triggering withdrawal completed notification:', notifErr);
    }

    // Task #23.4: Send COMPLETED withdrawal email + transactional delivery log
    try {
      const userRes = await db.query<{ email: string; full_name: string; public_id: string }>(
        `SELECT email, full_name, public_id FROM users WHERE id = $1`,
        [completedRec.userId]
      );
      if (userRes.rowCount > 0) {
        const user = userRes.rows[0];
        const { queueEventEmail, sendTransactionEmail } = await import('./emailService');
        await sendTransactionEmail({
          userId: completedRec.userId,
          recipientEmail: user.email,
          recipientName: user.full_name,
          eventType: 'WITHDRAWAL_SETTLED',
          metadata: {
            publicWithdrawalId: completedRec.publicWithdrawalId,
            amountUsd: String(completedRec.amount),
            destinationReference: completedRec.destinationReference,
            txHash: params.txHash || 'Confirmed',
            network: 'BNB Smart Chain (BEP-20)',
          },
        });
        await queueEventEmail(user.email, 'WITHDRAWAL_STATUS', {
          displayName: user.full_name,
          publicId: user.public_id,
          amount: String(completedRec.amount),
          status: 'COMPLETED',
          withdrawalId: completedRec.id
        });
      }
    } catch (emailErr) {
      console.warn('[EmailEngine] Failed to send Withdrawal Completed email:', emailErr);
    }

    return completedRec;
  }

  if (normalizedAction === 'REJECT') {
    if (withdrawal.status === 'COMPLETED' || withdrawal.status === 'REJECTED' || withdrawal.status === 'CANCELLED' || withdrawal.status === 'FAILED') {
      throw new Error(`INVALID_STATE: Cannot REJECT withdrawal in status ${withdrawal.status}.`);
    }

    const reason = rejectionReason || 'Administrative rejection';

    const res = await db.query(
      `
      UPDATE withdrawals
      SET status = 'REJECTED', rejected_at = $1, rejection_reason = $2, updated_at = $1
      WHERE id = $3 AND status IN ('PENDING', 'APPROVED', 'PROCESSING')
      RETURNING *
      `,
      [now, reason, withdrawal.id]
    );

    if (res.rows.length === 0) throw new Error('CONCURRENCY_ERROR: Status changed concurrently.');
    const updated = mapRowToWithdrawalRecord(res.rows[0]);

    // Log State Transition: ANY -> REJECTED
    await logWithdrawalStateTransition({
      withdrawalId: updated.id,
      publicWithdrawalId: updated.publicWithdrawalId,
      userId: updated.userId,
      previousStatus: withdrawal.status,
      newStatus: 'REJECTED',
      actorType: params.actorEmail ? 'ADMIN' : 'SYSTEM',
      actorEmail: params.actorEmail,
      amount: updated.amount,
      destinationType: updated.destinationType,
      destinationReference: updated.destinationReference,
      reason,
    });

    // Release reserved funds
    await postLedgerReversal({
      userId: updated.userId,
      sourceType: 'WITHDRAWAL',
      sourceId: updated.id,
      sourceRef: updated.publicWithdrawalId,
      amount: updated.amount,
      description: `Withdrawal Rejected - Funds Released (${updated.publicWithdrawalId})`,
      createdAt: now,
    });

    try {
      await notifyWithdrawalStatus({
        userId: updated.userId,
        amountUsdt: updated.amount,
        status: 'REJECTED',
        withdrawalId: updated.id,
        reason,
      });
    } catch (notifErr) {
      console.warn('[Notification] Error triggering withdrawal rejected notification:', notifErr);
    }

    // Task #23.4: Send REJECTED withdrawal email
    try {
      const userRes = await db.query<{ email: string; full_name: string; public_id: string }>(
        `SELECT email, full_name, public_id FROM users WHERE id = $1`,
        [updated.userId]
      );
      if (userRes.rowCount > 0) {
        const user = userRes.rows[0];
        const { queueEventEmail } = await import('./emailService');
        await queueEventEmail(user.email, 'WITHDRAWAL_STATUS', {
          displayName: user.full_name,
          publicId: user.public_id,
          amount: String(updated.amount),
          status: 'REJECTED',
          withdrawalId: updated.id,
          reason
        });
      }
    } catch (emailErr) {
      console.warn('[EmailEngine] Failed to send Withdrawal Rejected email:', emailErr);
    }

    return updated;
  }

  if (normalizedAction === 'FAIL') {
    if (withdrawal.status === 'COMPLETED' || withdrawal.status === 'FAILED' || withdrawal.status === 'CANCELLED' || withdrawal.status === 'REJECTED') {
      throw new Error(`INVALID_STATE: Cannot FAIL withdrawal in status ${withdrawal.status}.`);
    }

    const reason = rejectionReason || 'Settlement transfer failed';

    const res = await db.query(
      `
      UPDATE withdrawals
      SET status = 'FAILED', failed_at = $1, rejection_reason = $2, updated_at = $1
      WHERE id = $3 AND status IN ('PENDING', 'APPROVED', 'PROCESSING')
      RETURNING *
      `,
      [now, reason, withdrawal.id]
    );

    if (res.rows.length === 0) throw new Error('CONCURRENCY_ERROR: Status changed concurrently.');
    const updated = mapRowToWithdrawalRecord(res.rows[0]);

    // Log State Transition: ANY -> FAILED
    await logWithdrawalStateTransition({
      withdrawalId: updated.id,
      publicWithdrawalId: updated.publicWithdrawalId,
      userId: updated.userId,
      previousStatus: withdrawal.status,
      newStatus: 'FAILED',
      actorType: params.actorEmail ? 'ADMIN' : 'SYSTEM',
      actorEmail: params.actorEmail,
      amount: updated.amount,
      destinationType: updated.destinationType,
      destinationReference: updated.destinationReference,
      reason,
    });

    // Release reserved funds
    await postLedgerReversal({
      userId: updated.userId,
      sourceType: 'WITHDRAWAL',
      sourceId: updated.id,
      sourceRef: updated.publicWithdrawalId,
      amount: updated.amount,
      description: `Withdrawal Transfer Failed - Funds Released (${updated.publicWithdrawalId})`,
      createdAt: now,
    });

    // Task #23.4: Send FAILED withdrawal email
    try {
      const userRes = await db.query<{ email: string; full_name: string; public_id: string }>(
        `SELECT email, full_name, public_id FROM users WHERE id = $1`,
        [updated.userId]
      );
      if (userRes.rowCount > 0) {
        const user = userRes.rows[0];
        const { queueEventEmail } = await import('./emailService');
        await queueEventEmail(user.email, 'WITHDRAWAL_STATUS', {
          displayName: user.full_name,
          publicId: user.public_id,
          amount: String(updated.amount),
          status: 'FAILED',
          withdrawalId: updated.id,
          reason
        });
      }
    } catch (emailErr) {
      console.warn('[EmailEngine] Failed to send Withdrawal Failed email:', emailErr);
    }

    return updated;
  }

  throw new Error(`INVALID_ACTION: Unknown settlement action ${action}`);
}

export async function getWithdrawalStateLogs(params: {
  page?: number;
  limit?: number;
  status?: string;
  actorType?: string;
  search?: string;
}): Promise<{
  logs: any[];
  pagination: { page: number; limit: number; totalCount: number; totalPages: number };
  stats: {
    totalTransitions: number;
    pendingCount: number;
    approvedCount: number;
    completedCount: number;
    rejectedCount: number;
    failedCount: number;
    cancelledCount: number;
  };
}> {
  const db = await getDb();
  const safePage = Math.max(1, params.page || 1);
  const safeLimit = Math.min(100, Math.max(1, params.limit || 20));
  const offset = (safePage - 1) * safeLimit;

  await backfillMissingWithdrawalStateLogs();

  let whereClauses: string[] = ['1=1'];
  let queryParams: any[] = [];
  let paramIdx = 1;

  if (params.status && params.status !== 'ALL' && params.status !== 'all') {
    whereClauses.push(`l.new_status = $${paramIdx}`);
    queryParams.push(params.status.toUpperCase());
    paramIdx++;
  }

  if (params.actorType && params.actorType !== 'ALL' && params.actorType !== 'all') {
    whereClauses.push(`l.actor_type = $${paramIdx}`);
    queryParams.push(params.actorType.toUpperCase());
    paramIdx++;
  }

  if (params.search && params.search.trim()) {
    const s = `%${params.search.trim()}%`;
    whereClauses.push(`(
      l.public_withdrawal_id ILIKE $${paramIdx} OR
      l.user_email ILIKE $${paramIdx} OR
      l.user_name ILIKE $${paramIdx} OR
      l.reason ILIKE $${paramIdx} OR
      l.tx_hash ILIKE $${paramIdx} OR
      l.destination_reference ILIKE $${paramIdx}
    )`);
    queryParams.push(s);
    paramIdx++;
  }

  const whereSql = whereClauses.join(' AND ');

  const countRes = await db.query(
    `SELECT COUNT(*)::int AS count FROM withdrawal_status_logs l WHERE ${whereSql}`,
    queryParams
  );
  const totalCount = Number(countRes.rows[0]?.count || 0);

  const txQueryParams = [...queryParams, safeLimit, offset];
  const listRes = await db.query(
    `
    SELECT 
      l.id,
      l.withdrawal_id AS "withdrawalId",
      l.public_withdrawal_id AS "publicWithdrawalId",
      l.user_id AS "userId",
      COALESCE(l.user_email, u.email) AS "userEmail",
      COALESCE(l.user_name, u.full_name) AS "userName",
      l.previous_status AS "previousStatus",
      l.new_status AS "newStatus",
      l.actor_type AS "actorType",
      l.actor_id AS "actorId",
      l.actor_email AS "actorEmail",
      l.reason,
      l.amount::float AS amount,
      l.destination_type AS "destinationType",
      l.destination_reference AS "destinationReference",
      l.tx_hash AS "txHash",
      l.transition_timestamp AS "transitionTimestamp",
      l.created_at AS "createdAt"
    FROM withdrawal_status_logs l
    LEFT JOIN users u ON u.id = l.user_id
    WHERE ${whereSql}
    ORDER BY l.transition_timestamp DESC
    LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
    `,
    txQueryParams
  );

  const statsRes = await db.query(`
    SELECT
      COUNT(*)::int AS "totalTransitions",
      COUNT(CASE WHEN new_status = 'PENDING' THEN 1 END)::int AS "pendingCount",
      COUNT(CASE WHEN new_status = 'APPROVED' THEN 1 END)::int AS "approvedCount",
      COUNT(CASE WHEN new_status = 'COMPLETED' THEN 1 END)::int AS "completedCount",
      COUNT(CASE WHEN new_status = 'REJECTED' THEN 1 END)::int AS "rejectedCount",
      COUNT(CASE WHEN new_status = 'FAILED' THEN 1 END)::int AS "failedCount",
      COUNT(CASE WHEN new_status = 'CANCELLED' THEN 1 END)::int AS "cancelledCount"
    FROM withdrawal_status_logs
  `);

  const stats = statsRes.rows[0] || {
    totalTransitions: 0,
    pendingCount: 0,
    approvedCount: 0,
    completedCount: 0,
    rejectedCount: 0,
    failedCount: 0,
    cancelledCount: 0,
  };

  const totalPages = Math.ceil(totalCount / safeLimit) || 1;

  return {
    logs: listRes.rows,
    pagination: {
      page: safePage,
      limit: safeLimit,
      totalCount,
      totalPages,
    },
    stats,
  };
}

export async function getSingleWithdrawalStateTimeline(publicId: string): Promise<any[]> {
  const db = await getDb();
  await backfillMissingWithdrawalStateLogs();

  const res = await db.query(
    `
    SELECT 
      l.id,
      l.withdrawal_id AS "withdrawalId",
      l.public_withdrawal_id AS "publicWithdrawalId",
      l.user_id AS "userId",
      COALESCE(l.user_email, u.email) AS "userEmail",
      COALESCE(l.user_name, u.full_name) AS "userName",
      l.previous_status AS "previousStatus",
      l.new_status AS "newStatus",
      l.actor_type AS "actorType",
      l.actor_id AS "actorId",
      l.actor_email AS "actorEmail",
      l.reason,
      l.amount::float AS amount,
      l.destination_type AS "destinationType",
      l.destination_reference AS "destinationReference",
      l.tx_hash AS "txHash",
      l.transition_timestamp AS "transitionTimestamp",
      l.created_at AS "createdAt"
    FROM withdrawal_status_logs l
    LEFT JOIN users u ON u.id = l.user_id
    WHERE l.public_withdrawal_id = $1 OR l.withdrawal_id::text = $1
    ORDER BY l.transition_timestamp ASC
    `,
    [publicId]
  );

  return res.rows;
}

export async function backfillMissingWithdrawalStateLogs(): Promise<void> {
  try {
    const db = await getDb();
    const unlogged = await db.query(`
      SELECT w.*, u.email AS user_email, u.full_name AS user_name
      FROM withdrawals w
      LEFT JOIN users u ON u.id = w.user_id
      WHERE NOT EXISTS (
        SELECT 1 FROM withdrawal_status_logs l WHERE l.withdrawal_id = w.id
      )
    `);

    for (const w of unlogged.rows) {
      const reqTime = w.requested_at || w.created_at || new Date();
      await db.query(`
        INSERT INTO withdrawal_status_logs (
          id, withdrawal_id, public_withdrawal_id, user_id, user_email, user_name,
          previous_status, new_status, actor_type, reason, amount, destination_type, destination_reference,
          transition_timestamp, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NULL, 'PENDING', 'USER', 'Withdrawal requested by user', $7, $8, $9, $10, $10)
      `, [
        uuidv4(), w.id, w.public_withdrawal_id, w.user_id, w.user_email, w.user_name,
        w.amount, w.destination_type, w.destination_reference, reqTime
      ]);

      if (w.approved_at) {
        await db.query(`
          INSERT INTO withdrawal_status_logs (
            id, withdrawal_id, public_withdrawal_id, user_id, user_email, user_name,
            previous_status, new_status, actor_type, reason, amount, destination_type, destination_reference,
            transition_timestamp, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', 'APPROVED', 'ADMIN', 'Withdrawal request approved', $7, $8, $9, $10, $10)
        `, [
          uuidv4(), w.id, w.public_withdrawal_id, w.user_id, w.user_email, w.user_name,
          w.amount, w.destination_type, w.destination_reference, w.approved_at
        ]);
      }

      if (w.status === 'COMPLETED' && w.completed_at) {
        const prev = w.approved_at ? 'APPROVED' : 'PENDING';
        await db.query(`
          INSERT INTO withdrawal_status_logs (
            id, withdrawal_id, public_withdrawal_id, user_id, user_email, user_name,
            previous_status, new_status, actor_type, reason, amount, destination_type, destination_reference,
            transition_timestamp, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'COMPLETED', 'SYSTEM', 'Payout disbursement completed on-chain', $8, $9, $10, $11, $11)
        `, [
          uuidv4(), w.id, w.public_withdrawal_id, w.user_id, w.user_email, w.user_name, prev,
          w.amount, w.destination_type, w.destination_reference, w.completed_at
        ]);
      } else if (w.status === 'REJECTED' && w.rejected_at) {
        await db.query(`
          INSERT INTO withdrawal_status_logs (
            id, withdrawal_id, public_withdrawal_id, user_id, user_email, user_name,
            previous_status, new_status, actor_type, reason, amount, destination_type, destination_reference,
            transition_timestamp, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', 'REJECTED', 'ADMIN', $7, $8, $9, $10, $11, $11)
        `, [
          uuidv4(), w.id, w.public_withdrawal_id, w.user_id, w.user_email, w.user_name,
          w.rejection_reason || 'Administrative rejection', w.amount, w.destination_type, w.destination_reference, w.rejected_at
        ]);
      } else if (w.status === 'CANCELLED' && w.cancelled_at) {
        await db.query(`
          INSERT INTO withdrawal_status_logs (
            id, withdrawal_id, public_withdrawal_id, user_id, user_email, user_name,
            previous_status, new_status, actor_type, reason, amount, destination_type, destination_reference,
            transition_timestamp, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', 'CANCELLED', 'USER', 'Withdrawal request cancelled by user', $7, $8, $9, $10, $10)
        `, [
          uuidv4(), w.id, w.public_withdrawal_id, w.user_id, w.user_email, w.user_name,
          w.amount, w.destination_type, w.destination_reference, w.cancelled_at
        ]);
      } else if (w.status === 'FAILED' && w.failed_at) {
        await db.query(`
          INSERT INTO withdrawal_status_logs (
            id, withdrawal_id, public_withdrawal_id, user_id, user_email, user_name,
            previous_status, new_status, actor_type, reason, amount, destination_type, destination_reference,
            transition_timestamp, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', 'FAILED', 'SYSTEM', $7, $8, $9, $10, $11, $11)
        `, [
          uuidv4(), w.id, w.public_withdrawal_id, w.user_id, w.user_email, w.user_name,
          w.rejection_reason || 'Settlement broadcast failed', w.amount, w.destination_type, w.destination_reference, w.failed_at
        ]);
      }
    }
  } catch (err) {
    console.warn('[WithdrawalStateLog] Error backfilling state logs:', err);
  }
}
