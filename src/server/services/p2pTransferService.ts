import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseClient, getDb } from '../db/db';
import { hashToken } from '../utils/crypto';
import { generateLedgerTransactionPublicId } from '../utils/idGenerator';
import {
  formatScaledBigInt,
  getUserMainUsdtBalanceExact,
  parseAmountToScaledBigInt,
} from './tradingPoolService';
import {
  getP2pTransferFeePct,
  isFeatureSwitchEnabled,
  recordSecurityAuditLog,
} from './unilevelConfigService';
import { sendP2pTransferOtpEmail, sendTransactionEmail } from './emailService';

export type P2pAssetType = 'USDT' | 'PHIVO';

export interface P2pRecipientProfile {
  recipientId: string;
  userCode: string;
  maskedEmail: string;
  displayName: string;
}

export interface P2pTransferRecord {
  id: string;
  transferRef: string;
  direction: 'SENT' | 'RECEIVED';
  assetType: P2pAssetType;
  grossAmount: string;
  feeAmount: string;
  netAmount: string;
  note: string | null;
  counterpartyCode: string;
  counterpartyName: string;
  counterpartyMaskedEmail: string;
  createdAt: string;
}

export interface P2pTransferExecutionResult {
  success: boolean;
  replayed: boolean;
  transferId: string;
  transferRef: string;
  assetType: P2pAssetType;
  grossAmount: string;
  feeAmount: string;
  netAmount: string;
  feePct: string;
  recipient: P2pRecipientProfile;
  note: string | null;
  senderNewBalance: string;
  recipientNewBalance: string;
  createdAt: string;
}

export class P2pTransferError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(code: string, message: string, statusCode = 400) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.name = 'P2pTransferError';
  }
}

const SCALE_FACTOR = 100_000_000n;
const MIN_P2P_AMOUNT_SCALED = 1_00000000n; // 1.00000000 USDT or 1.00000000 PHIVO
const PERCENT_DIVISOR_SCALED = 100n * SCALE_FACTOR;

export function maskEmailAddress(email: string): string {
  const clean = String(email || '').trim().toLowerCase();
  const atIdx = clean.indexOf('@');
  if (atIdx <= 0) return '***';
  const local = clean.slice(0, atIdx);
  const domain = clean.slice(atIdx + 1);
  if (local.length <= 2) {
    return `${local[0] || '*'}***@${domain}`;
  }
  return `${local.slice(0, 2)}***${local.slice(-1)}@${domain}`;
}

function sanitizeNote(raw?: string | null): string | null {
  if (raw === null || raw === undefined) return null;
  const cleaned = String(raw)
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .trim()
    .slice(0, 160);
  return cleaned.length > 0 ? cleaned : null;
}

function generateTransferRef(): string {
  const rand = crypto.randomBytes(4).toString('hex').toUpperCase();
  const stamp = new Date().toISOString().slice(2, 10).replace(/-/g, '');
  return `P2P-${stamp}-${rand}`;
}

/**
 * Exact scaled BigInt calculation of a user's transferable (Claimed / Available) PHIVO balance.
 * Excludes unclaimed ACCRUED node rewards in the Node Reward Wallet until claimed.
 */
export async function getUserTransferablePhivoExact(
  userId: string,
  dbClient?: DatabaseClient
): Promise<{
  transferableScaled: bigint;
  transferableStr: string;
  unclaimedAccruedScaled: bigint;
  unclaimedAccruedStr: string;
}> {
  const db = dbClient || (await getDb());

  const rewardsRes = await db.query<{ status: string; total: string }>(
    `
    SELECT status, COALESCE(SUM(amount), 0)::text AS total
    FROM node_rewards
    WHERE owner_user_id = $1 AND status IN ('ACCRUED', 'CLAIMED')
    GROUP BY status
    `,
    [userId]
  );
  const swapsRes = await db.query<{ direction: string | null; total: string }>(
    `
    SELECT COALESCE(direction, 'COIN_TO_USDT') AS direction, COALESCE(SUM(coin_amount), 0)::text AS total
    FROM coin_swap_transactions
    WHERE user_id = $1 AND status = 'COMPLETED' AND coin_amount > 0
    GROUP BY COALESCE(direction, 'COIN_TO_USDT')
    `,
    [userId]
  );
  const ledgerRes = await db.query<{ entry_type: string; total: string }>(
    `
    SELECT entry_type, COALESCE(SUM(amount), 0)::text AS total
    FROM financial_ledger_entries
    WHERE user_id = $1
      AND currency = 'PHIVO'
      AND status = 'SETTLED'
      AND source_type IN ('ADMIN_ADJUSTMENT', 'UNILEVEL_ROYALTY', 'P2P_TRANSFER_SENT', 'P2P_TRANSFER_RECEIVED')
    GROUP BY entry_type
    `,
    [userId]
  );

  let claimedScaled = 0n;
  let unclaimedAccruedScaled = 0n;
  for (const r of rewardsRes.rows) {
    const val = parseAmountToScaledBigInt(r.total || '0');
    if (r.status === 'CLAIMED') claimedScaled += val;
    else if (r.status === 'ACCRUED') unclaimedAccruedScaled += val;
  }

  let boughtScaled = 0n;
  let soldScaled = 0n;
  for (const s of swapsRes.rows) {
    const val = parseAmountToScaledBigInt(s.total || '0');
    if (s.direction === 'USDT_TO_COIN') boughtScaled += val;
    else soldScaled += val;
  }

  let ledgerNetScaled = 0n;
  for (const l of ledgerRes.rows) {
    const val = parseAmountToScaledBigInt(l.total || '0');
    if (l.entry_type === 'CREDIT') ledgerNetScaled += val;
    else if (l.entry_type === 'DEBIT' || l.entry_type === 'REVERSAL') ledgerNetScaled -= val;
  }

  const rawTransferable = claimedScaled + boughtScaled + ledgerNetScaled - soldScaled;
  const transferableScaled = rawTransferable > 0n ? rawTransferable : 0n;

  return {
    transferableScaled,
    transferableStr: formatScaledBigInt(transferableScaled),
    unclaimedAccruedScaled,
    unclaimedAccruedStr: formatScaledBigInt(unclaimedAccruedScaled),
  };
}

/**
 * Resolves an active recipient by normalized Email OR User Code (`PHX-XXXXXX` / referral code).
 * Explicitly rejects self-transfers and returns only safe masked recipient metadata.
 */
export async function lookupP2pRecipient(
  senderUserId: string,
  rawQuery: string,
  dbClient?: DatabaseClient
): Promise<P2pRecipientProfile> {
  const query = String(rawQuery || '').trim();
  if (query.length < 3 || query.length > 160) {
    throw new P2pTransferError(
      'INVALID_RECIPIENT_QUERY',
      'Enter a valid member email address or User Code (e.g., PHX-XXXXXX).',
      400
    );
  }

  const db = dbClient || (await getDb());
  const normalizedLower = query.toLowerCase();
  const normalizedUpper = query.toUpperCase();

  const res = await db.query<{
    id: string;
    email: string;
    full_name: string | null;
    public_id: string | null;
    referral_code: string | null;
    status: string | null;
  }>(
    `
    SELECT
      u.id,
      u.email,
      u.full_name,
      u.public_id,
      ur.referral_code,
      u.status
    FROM users u
    LEFT JOIN user_referrals ur ON ur.user_id = u.id
    WHERE LOWER(TRIM(u.email)) = $1
       OR UPPER(TRIM(COALESCE(u.public_id, ''))) = $2
       OR UPPER(TRIM(COALESCE(ur.referral_code, ''))) = $2
    LIMIT 2
    `,
    [normalizedLower, normalizedUpper]
  );

  if (res.rowCount === 0) {
    throw new P2pTransferError(
      'RECIPIENT_NOT_FOUND',
      'No active PHIVONEX member found matching that email or User Code.',
      404
    );
  }

  const row = res.rows[0];
  if (String(row.status || 'ACTIVE').toUpperCase() !== 'ACTIVE') {
    throw new P2pTransferError(
      'RECIPIENT_INACTIVE',
      'The selected recipient account is currently inactive and cannot receive transfers.',
      403
    );
  }

  if (row.id === senderUserId) {
    throw new P2pTransferError(
      'SELF_TRANSFER_FORBIDDEN',
      'Cannot transfer funds to your own account.',
      400
    );
  }

  const userCode = String(row.public_id || row.referral_code || 'PHX-MEMBER').toUpperCase();
  const displayName =
    row.full_name && row.full_name.trim().length > 0
      ? row.full_name.trim()
      : userCode;

  return {
    recipientId: row.id,
    userCode,
    maskedEmail: maskEmailAddress(row.email),
    displayName,
  };
}

/**
 * Generates and emails a 6-digit SHA-256 hashed OTP stored in auth_tokens (10-minute expiry)
 * to authorize a P2P internal transfer.
 */
export async function requestP2pTransferOtp(params: {
  senderUserId: string;
  senderEmail: string;
  recipientQuery: string;
  assetType: P2pAssetType;
  amount: string | number;
}): Promise<{
  success: boolean;
  message: string;
  recipient: P2pRecipientProfile;
  expiresInSeconds: number;
}> {
  const isEnabled = await isFeatureSwitchEnabled('p2p_internal_transfers_enabled');
  if (!isEnabled) {
    throw new P2pTransferError(
      'MODULE_PAUSED',
      'User-to-User (P2P) internal transfers are temporarily paused by protocol governance.',
      403
    );
  }

  const assetType = String(params.assetType || '').toUpperCase() as P2pAssetType;
  if (assetType !== 'USDT' && assetType !== 'PHIVO') {
    throw new P2pTransferError('INVALID_ASSET', 'Asset must be USDT or PHIVO.', 400);
  }

  let amountScaled: bigint;
  try {
    amountScaled = parseAmountToScaledBigInt(params.amount);
  } catch {
    throw new P2pTransferError('INVALID_AMOUNT', 'Enter a valid transfer amount.', 400);
  }

  if (amountScaled < MIN_P2P_AMOUNT_SCALED) {
    throw new P2pTransferError(
      'MIN_TRANSFER_AMOUNT',
      `Minimum P2P transfer amount is 1.00 ${assetType}.`,
      400
    );
  }

  const recipient = await lookupP2pRecipient(params.senderUserId, params.recipientQuery);
  const db = await getDb();

  // Check sender available balance early so user gets instant feedback before receiving OTP
  if (assetType === 'USDT') {
    const mainUsdt = await getUserMainUsdtBalanceExact(params.senderUserId, db);
    if (mainUsdt.availableBalanceScaled < amountScaled) {
      throw new P2pTransferError(
        'INSUFFICIENT_BALANCE',
        `Insufficient Main USDT balance. Available: $${mainUsdt.availableBalanceStr} USDT.`,
        400
      );
    }
  } else {
    const phivo = await getUserTransferablePhivoExact(params.senderUserId, db);
    if (phivo.transferableScaled < amountScaled) {
      const claimHint =
        phivo.unclaimedAccruedScaled > 0n
          ? ` You have ${phivo.unclaimedAccruedStr} PHIVO unclaimed in your Node Reward Wallet — click Claim first to make it transferable.`
          : '';
      throw new P2pTransferError(
        'INSUFFICIENT_PHIVO_BALANCE',
        `Insufficient transferable PHIVO balance. Available: ${phivo.transferableStr} PHIVO.${claimHint}`,
        400
      );
    }
  }

  // Generate CSPRNG 6-digit OTP and store SHA-256 hash in auth_tokens
  const rawOtp = String(crypto.randomInt(100000, 1000000));
  const tokenHash = hashToken(rawOtp);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await db.transaction(async (trx) => {
    await trx.query(
      `UPDATE auth_tokens SET used_at = NOW() WHERE user_id = $1 AND type = 'P2P_TRANSFER_OTP' AND used_at IS NULL`,
      [params.senderUserId]
    );
    await trx.query(
      `
      INSERT INTO auth_tokens (id, user_id, token_hash, type, expires_at, created_at)
      VALUES ($1, $2, $3, 'P2P_TRANSFER_OTP', $4, NOW())
      `,
      [uuidv4(), params.senderUserId, tokenHash, expiresAt]
    );
  });

  const formattedAmt = formatScaledBigInt(amountScaled);
  await sendP2pTransferOtpEmail(params.senderEmail, rawOtp, {
    amount: formattedAmt,
    asset: assetType,
    recipientDisplay: recipient.displayName,
    recipientCode: recipient.userCode,
  });

  return {
    success: true,
    message: `A 6-digit verification code has been sent to ${maskEmailAddress(params.senderEmail)}.`,
    recipient,
    expiresInSeconds: 600,
  };
}

/**
 * Executes an atomic, idempotent, zero-sum P2P balance transfer (USDT or PHIVO)
 * between two platform users with deterministic ascending row locking and Email OTP verification.
 */
export async function executeP2pInternalTransfer(params: {
  senderUserId: string;
  recipientQuery?: string;
  recipientId?: string;
  assetType: P2pAssetType;
  amount: string | number;
  note?: string | null;
  otpCode: string;
  idempotencyKey: string;
}): Promise<P2pTransferExecutionResult> {
  // 1. Enforce 12th Admin Master Switch (p2p_internal_transfers_enabled)
  const isEnabled = await isFeatureSwitchEnabled('p2p_internal_transfers_enabled');
  if (!isEnabled) {
    throw new P2pTransferError(
      'MODULE_PAUSED',
      'User-to-User (P2P) internal transfers are temporarily paused by protocol governance.',
      403
    );
  }

  const idempotencyKey = String(params.idempotencyKey || '').trim();
  if (idempotencyKey.length < 8 || idempotencyKey.length > 128) {
    throw new P2pTransferError(
      'INVALID_IDEMPOTENCY_KEY',
      'A valid Idempotency-Key header (8-128 characters) is required for every P2P transfer.',
      400
    );
  }

  const assetType = String(params.assetType || '').toUpperCase() as P2pAssetType;
  if (assetType !== 'USDT' && assetType !== 'PHIVO') {
    throw new P2pTransferError('INVALID_ASSET', 'Asset must be USDT or PHIVO.', 400);
  }

  let grossScaled: bigint;
  try {
    grossScaled = parseAmountToScaledBigInt(params.amount);
  } catch {
    throw new P2pTransferError('INVALID_AMOUNT', 'Enter a valid numeric transfer amount.', 400);
  }

  if (grossScaled < MIN_P2P_AMOUNT_SCALED) {
    throw new P2pTransferError(
      'MIN_TRANSFER_AMOUNT',
      `Minimum P2P transfer amount is 1.00 ${assetType}.`,
      400
    );
  }

  const cleanOtp = String(params.otpCode || '').trim();
  if (!/^\d{6}$/.test(cleanOtp)) {
    throw new P2pTransferError(
      'INVALID_OTP_FORMAT',
      'Please enter the 6-digit email verification code.',
      400
    );
  }

  const cleanNote = sanitizeNote(params.note);
  const db = await getDb();

  // 2. Idempotency replay check BEFORE consuming OTP or mutating balances
  const existingReplayRes = await db.query<{
    id: string;
    transfer_ref: string;
    sender_user_id: string;
    recipient_user_id: string;
    asset_type: P2pAssetType;
    gross_amount: string;
    fee_amount: string;
    net_amount: string;
    note: string | null;
    created_at: Date;
    recipient_email: string;
    recipient_name: string | null;
    recipient_public_id: string | null;
    recipient_ref_code: string | null;
  }>(
    `
    SELECT
      t.*,
      u.email AS recipient_email,
      u.full_name AS recipient_name,
      u.public_id AS recipient_public_id,
      ur.referral_code AS recipient_ref_code
    FROM p2p_internal_transfers t
    JOIN users u ON u.id = t.recipient_user_id
    LEFT JOIN user_referrals ur ON ur.user_id = u.id
    WHERE t.idempotency_key = $1
    LIMIT 1
    `,
    [idempotencyKey]
  );

  if (existingReplayRes.rowCount > 0) {
    const existing = existingReplayRes.rows[0];
    if (existing.sender_user_id !== params.senderUserId) {
      throw new P2pTransferError(
        'IDEMPOTENCY_CONFLICT',
        'This Idempotency-Key belongs to another request.',
        409
      );
    }

    const senderBal =
      existing.asset_type === 'USDT'
        ? (await getUserMainUsdtBalanceExact(existing.sender_user_id, db)).availableBalanceStr
        : (await getUserTransferablePhivoExact(existing.sender_user_id, db)).transferableStr;
    const recipientBal =
      existing.asset_type === 'USDT'
        ? (await getUserMainUsdtBalanceExact(existing.recipient_user_id, db)).availableBalanceStr
        : (await getUserTransferablePhivoExact(existing.recipient_user_id, db)).transferableStr;

    return {
      success: true,
      replayed: true,
      transferId: existing.id,
      transferRef: existing.transfer_ref,
      assetType: existing.asset_type,
      grossAmount: formatScaledBigInt(parseAmountToScaledBigInt(existing.gross_amount)),
      feeAmount: formatScaledBigInt(parseAmountToScaledBigInt(existing.fee_amount)),
      netAmount: formatScaledBigInt(parseAmountToScaledBigInt(existing.net_amount)),
      feePct: await getP2pTransferFeePct(db),
      recipient: {
        recipientId: existing.recipient_user_id,
        userCode: String(existing.recipient_public_id || existing.recipient_ref_code || 'PHX-MEMBER').toUpperCase(),
        maskedEmail: maskEmailAddress(existing.recipient_email),
        displayName: existing.recipient_name?.trim() || String(existing.recipient_public_id || 'PHX-MEMBER'),
      },
      note: existing.note,
      senderNewBalance: senderBal,
      recipientNewBalance: recipientBal,
      createdAt: new Date(existing.created_at).toISOString(),
    };
  }

  // 3. Resolve recipient identity (strictly disallow self-transfer)
  let recipientProfile: P2pRecipientProfile;
  if (params.recipientQuery && params.recipientQuery.trim().length > 0) {
    recipientProfile = await lookupP2pRecipient(params.senderUserId, params.recipientQuery, db);
  } else if (params.recipientId) {
    if (params.recipientId === params.senderUserId) {
      throw new P2pTransferError('SELF_TRANSFER_FORBIDDEN', 'Cannot transfer funds to your own account.', 400);
    }
    const recRes = await db.query<{
      id: string;
      email: string;
      full_name: string | null;
      public_id: string | null;
      referral_code: string | null;
      status: string | null;
    }>(
      `
      SELECT u.id, u.email, u.full_name, u.public_id, ur.referral_code, u.status
      FROM users u
      LEFT JOIN user_referrals ur ON ur.user_id = u.id
      WHERE u.id = $1
      LIMIT 1
      `,
      [params.recipientId]
    );
    if (recRes.rowCount === 0 || String(recRes.rows[0].status || 'ACTIVE').toUpperCase() !== 'ACTIVE') {
      throw new P2pTransferError('RECIPIENT_NOT_FOUND', 'Recipient account was not found or is inactive.', 404);
    }
    const r = recRes.rows[0];
    const code = String(r.public_id || r.referral_code || 'PHX-MEMBER').toUpperCase();
    recipientProfile = {
      recipientId: r.id,
      userCode: code,
      maskedEmail: maskEmailAddress(r.email),
      displayName: r.full_name?.trim() || code,
    };
  } else {
    throw new P2pTransferError('MISSING_RECIPIENT', 'Recipient email or User Code is required.', 400);
  }

  if (recipientProfile.recipientId === params.senderUserId) {
    throw new P2pTransferError('SELF_TRANSFER_FORBIDDEN', 'Cannot transfer funds to your own account.', 400);
  }

  const otpHash = hashToken(cleanOtp);
  const feePctStr = await getP2pTransferFeePct(db);
  const feePctScaled = parseAmountToScaledBigInt(feePctStr);
  const feeScaled = (grossScaled * feePctScaled) / PERCENT_DIVISOR_SCALED;
  const netScaled = grossScaled - feeScaled;

  if (netScaled <= 0n) {
    throw new P2pTransferError(
      'NET_AMOUNT_TOO_SMALL',
      'Transfer net amount after settlement fee must be greater than zero.',
      400
    );
  }

  const grossStr = formatScaledBigInt(grossScaled);
  const feeStr = formatScaledBigInt(feeScaled);
  const netStr = formatScaledBigInt(netScaled);

  let senderEmail = '';
  let senderName = '';
  let senderCode = '';
  let recipientEmail = '';

  // 4. Execute ACID Transaction with Deterministic Ascending User Row Locking
  const committed = await db.transaction(async (trx) => {
    // Re-check master switch inside transaction
    const stillEnabled = await isFeatureSwitchEnabled('p2p_internal_transfers_enabled', trx);
    if (!stillEnabled) {
      throw new P2pTransferError(
        'MODULE_PAUSED',
        'User-to-User (P2P) internal transfers are temporarily paused by protocol governance.',
        403
      );
    }

    // Acquire deterministic ascending row locks on sender and recipient user records (deadlock-free)
    const lockIds = [params.senderUserId, recipientProfile.recipientId].sort();
    const lockedUsersRes = await trx.query<{
      id: string;
      email: string;
      full_name: string | null;
      public_id: string | null;
      status: string | null;
    }>(
      `
      SELECT id, email, full_name, public_id, status
      FROM users
      WHERE id = ANY($1::uuid[])
      ORDER BY id ASC
      FOR UPDATE
      `,
      [lockIds]
    );

    if (lockedUsersRes.rowCount !== 2) {
      throw new P2pTransferError(
        'ACCOUNT_LOCK_FAILED',
        'Unable to lock sender and recipient accounts for settlement.',
        400
      );
    }

    const senderRow = lockedUsersRes.rows.find((u) => u.id === params.senderUserId)!;
    const recipientRow = lockedUsersRes.rows.find((u) => u.id === recipientProfile.recipientId)!;

    if (
      String(senderRow.status || 'ACTIVE').toUpperCase() !== 'ACTIVE' ||
      String(recipientRow.status || 'ACTIVE').toUpperCase() !== 'ACTIVE'
    ) {
      throw new P2pTransferError('ACCOUNT_INACTIVE', 'Both accounts must be active to complete a P2P transfer.', 403);
    }

    senderEmail = senderRow.email;
    senderName = senderRow.full_name?.trim() || String(senderRow.public_id || 'PHIVONEX Member');
    senderCode = String(senderRow.public_id || 'PHX-MEMBER').toUpperCase();
    recipientEmail = recipientRow.email;

    // Verify & atomically consume 6-digit Email OTP
    const otpConsumeRes = await trx.query<{ id: string }>(
      `
      UPDATE auth_tokens
      SET used_at = NOW()
      WHERE id = (
        SELECT id
        FROM auth_tokens
        WHERE user_id = $1
          AND type = 'P2P_TRANSFER_OTP'
          AND token_hash = $2
          AND used_at IS NULL
          AND expires_at > NOW()
        ORDER BY created_at DESC
        LIMIT 1
      )
      RETURNING id
      `,
      [params.senderUserId, otpHash]
    );

    if (otpConsumeRes.rowCount === 0) {
      throw new P2pTransferError(
        'INVALID_OR_EXPIRED_OTP',
        'The 6-digit email verification code is invalid or expired. Please request a new code.',
        400
      );
    }

    // Verify sender exact balance under row lock
    let senderBeforeScaled: bigint;
    let recipientBeforeScaled: bigint;

    if (assetType === 'USDT') {
      const sBal = await getUserMainUsdtBalanceExact(params.senderUserId, trx);
      const rBal = await getUserMainUsdtBalanceExact(recipientProfile.recipientId, trx);
      senderBeforeScaled = sBal.availableBalanceScaled;
      recipientBeforeScaled = rBal.availableBalanceScaled;

      if (senderBeforeScaled < grossScaled) {
        throw new P2pTransferError(
          'INSUFFICIENT_BALANCE',
          `Insufficient Main USDT balance. Available: $${sBal.availableBalanceStr} USDT.`,
          400
        );
      }
    } else {
      const sBal = await getUserTransferablePhivoExact(params.senderUserId, trx);
      const rBal = await getUserTransferablePhivoExact(recipientProfile.recipientId, trx);
      senderBeforeScaled = sBal.transferableScaled;
      recipientBeforeScaled = rBal.transferableScaled;

      if (senderBeforeScaled < grossScaled) {
        const claimHint =
          sBal.unclaimedAccruedScaled > 0n
            ? ` Claim your ${sBal.unclaimedAccruedStr} PHIVO in the Node Reward Wallet first.`
            : '';
        throw new P2pTransferError(
          'INSUFFICIENT_PHIVO_BALANCE',
          `Insufficient transferable PHIVO balance. Available: ${sBal.transferableStr} PHIVO.${claimHint}`,
          400
        );
      }
    }

    const transferId = uuidv4();
    const transferRef = generateTransferRef();

    // Insert canonical p2p_internal_transfers audit row
    const insertRes = await trx.query<{ created_at: Date }>(
      `
      INSERT INTO p2p_internal_transfers (
        id, transfer_ref, sender_user_id, recipient_user_id,
        asset_type, gross_amount, fee_amount, net_amount,
        note, idempotency_key, created_at
      )
      VALUES (
        $1, $2, $3, $4,
        $5, $6::numeric(20,8), $7::numeric(20,8), $8::numeric(20,8),
        $9, $10, NOW()
      )
      RETURNING created_at
      `,
      [
        transferId,
        transferRef,
        params.senderUserId,
        recipientProfile.recipientId,
        assetType,
        grossStr,
        feeStr,
        netStr,
        cleanNote,
        idempotencyKey,
      ]
    );

    const senderDesc = cleanNote
      ? `P2P Transfer Sent to ${recipientProfile.userCode} (${recipientProfile.displayName}) — ${cleanNote}`
      : `P2P Transfer Sent to ${recipientProfile.userCode} (${recipientProfile.displayName})`;
    const recipientDesc = cleanNote
      ? `P2P Transfer Received from ${senderCode} (${senderName}) — ${cleanNote}`
      : `P2P Transfer Received from ${senderCode} (${senderName})`;

    const debitTxnPublicId = generateLedgerTransactionPublicId();
    const creditTxnPublicId = generateLedgerTransactionPublicId();

    // Paired immutable double-entry financial_ledger_entries rows (DEBIT sender, CREDIT recipient)
    await trx.query(
      `
      INSERT INTO financial_ledger_entries (
        id, public_txn_id, user_id, entry_type, source_type, source_id, source_ref,
        description, amount, currency, status, created_at
      )
      VALUES
        ($1, $2, $3, 'DEBIT',  'P2P_TRANSFER_SENT',     $4, $5, $6, $7::numeric(20,8), $8, 'SETTLED', NOW()),
        ($9, $10, $11, 'CREDIT', 'P2P_TRANSFER_RECEIVED', $4, $5, $12, $13::numeric(20,8), $8, 'SETTLED', NOW())
      `,
      [
        uuidv4(),
        debitTxnPublicId,
        params.senderUserId,
        transferId,
        transferRef,
        senderDesc,
        grossStr,
        assetType,
        uuidv4(),
        creditTxnPublicId,
        recipientProfile.recipientId,
        recipientDesc,
        netStr,
      ]
    );

    await recordSecurityAuditLog(trx, {
      actorUserId: params.senderUserId,
      actionType: 'P2P_INTERNAL_TRANSFER_SETTLED',
      severity: 'INFO',
      payload: {
        transferId,
        transferRef,
        senderUserId: params.senderUserId,
        recipientUserId: recipientProfile.recipientId,
        assetType,
        grossAmount: grossStr,
        feeAmount: feeStr,
        netAmount: netStr,
      },
    });

    const senderNewScaled = senderBeforeScaled - grossScaled;
    const recipientNewScaled = recipientBeforeScaled + netScaled;

    return {
      transferId,
      transferRef,
      createdAt: new Date(insertRes.rows[0].created_at).toISOString(),
      senderNewBalance: formatScaledBigInt(senderNewScaled),
      recipientNewBalance: formatScaledBigInt(recipientNewScaled),
    };
  });

  // 5. Non-blocking transactional receipt emails for both sender and recipient
  Promise.allSettled([
    sendTransactionEmail({
      userId: params.senderUserId,
      recipientEmail: senderEmail,
      recipientName: senderName,
      eventType: 'P2P_TRANSFER_SENT',
      metadata: {
        assetType,
        grossAmount: grossStr,
        feeAmount: feeStr,
        netAmount: netStr,
        recipientName: recipientProfile.displayName,
        recipientCode: recipientProfile.userCode,
        transferRef: committed.transferRef,
        note: cleanNote,
      },
    }),
    sendTransactionEmail({
      userId: recipientProfile.recipientId,
      recipientEmail,
      recipientName: recipientProfile.displayName,
      eventType: 'P2P_TRANSFER_RECEIVED',
      metadata: {
        assetType,
        netAmount: netStr,
        senderName,
        senderCode,
        transferRef: committed.transferRef,
        note: cleanNote,
      },
    }),
  ]).catch((err) => console.warn('[P2PTransfer] Receipt email dispatch warning:', err));

  return {
    success: true,
    replayed: false,
    transferId: committed.transferId,
    transferRef: committed.transferRef,
    assetType,
    grossAmount: grossStr,
    feeAmount: feeStr,
    netAmount: netStr,
    feePct: feePctStr,
    recipient: recipientProfile,
    note: cleanNote,
    senderNewBalance: committed.senderNewBalance,
    recipientNewBalance: committed.recipientNewBalance,
    createdAt: committed.createdAt,
  };
}

/**
 * Returns the authenticated user's recent sent and received P2P internal transfers.
 */
export async function getUserP2pTransferHistory(
  userId: string,
  limit = 25,
  dbClient?: DatabaseClient
): Promise<P2pTransferRecord[]> {
  const safeLimit = Math.min(Math.max(1, Number(limit) || 25), 100);
  const db = dbClient || (await getDb());

  const res = await db.query<{
    id: string;
    transfer_ref: string;
    sender_user_id: string;
    recipient_user_id: string;
    asset_type: P2pAssetType;
    gross_amount: string;
    fee_amount: string;
    net_amount: string;
    note: string | null;
    created_at: Date;
    sender_email: string;
    sender_name: string | null;
    sender_public_id: string | null;
    recipient_email: string;
    recipient_name: string | null;
    recipient_public_id: string | null;
  }>(
    `
    SELECT
      t.id,
      t.transfer_ref,
      t.sender_user_id,
      t.recipient_user_id,
      t.asset_type,
      t.gross_amount::text AS gross_amount,
      t.fee_amount::text AS fee_amount,
      t.net_amount::text AS net_amount,
      t.note,
      t.created_at,
      su.email AS sender_email,
      su.full_name AS sender_name,
      su.public_id AS sender_public_id,
      ru.email AS recipient_email,
      ru.full_name AS recipient_name,
      ru.public_id AS recipient_public_id
    FROM p2p_internal_transfers t
    JOIN users su ON su.id = t.sender_user_id
    JOIN users ru ON ru.id = t.recipient_user_id
    WHERE t.sender_user_id = $1 OR t.recipient_user_id = $1
    ORDER BY t.created_at DESC
    LIMIT $2
    `,
    [userId, safeLimit]
  );

  return res.rows.map((r) => {
    const isSent = r.sender_user_id === userId;
    const counterpartyCode = String(
      isSent ? r.recipient_public_id || 'PHX-MEMBER' : r.sender_public_id || 'PHX-MEMBER'
    ).toUpperCase();
    const counterpartyName = isSent
      ? r.recipient_name?.trim() || counterpartyCode
      : r.sender_name?.trim() || counterpartyCode;
    const counterpartyMaskedEmail = maskEmailAddress(isSent ? r.recipient_email : r.sender_email);

    return {
      id: r.id,
      transferRef: r.transfer_ref,
      direction: isSent ? 'SENT' : 'RECEIVED',
      assetType: r.asset_type,
      grossAmount: formatScaledBigInt(parseAmountToScaledBigInt(r.gross_amount)),
      feeAmount: formatScaledBigInt(parseAmountToScaledBigInt(r.fee_amount)),
      netAmount: formatScaledBigInt(parseAmountToScaledBigInt(r.net_amount)),
      note: r.note,
      counterpartyCode,
      counterpartyName,
      counterpartyMaskedEmail,
      createdAt: new Date(r.created_at).toISOString(),
    };
  });
}
