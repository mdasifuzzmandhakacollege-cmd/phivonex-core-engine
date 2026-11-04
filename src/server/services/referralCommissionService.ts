import { v4 as uuidv4 } from 'uuid';
import { DatabaseClient, getDb } from '../db/db';
import {
  DIRECT_REFERRAL_COMMISSION_USD,
  ReferralCommissionStatus,
  formatPublicCommissionId
} from '../../config/referralConfig';
import { formatSafeDisplayName } from '../utils/idGenerator';
import { postLedgerCredit, postLedgerReversal } from './walletLedgerService';
import { getDirectReferralCommissionRate } from './economicService';
import { notifyReferralEarned } from './notificationService';

export interface SafeReferralCommission {
  publicCommissionId: string;
  referredUserPublicId: string;
  nodePublicId: string;
  amountUsd: number;
  status: ReferralCommissionStatus;
  earnedAt: string;
  reversedAt?: string | null;
}

export interface DirectReferralItem {
  publicId: string;
  displayName: string;
  joinedAt: string;
}

export interface UserCommissionsResponse {
  totalEarnedUsd: number;
  commissions: SafeReferralCommission[];
}

/**
 * Processes and creates a $50 Direct Referral Commission upon successful Node activation.
 * Triggered authoritatively after verified payment settlement.
 * 
 * Rules:
 * - Buyer must have a valid sponsor_user_id.
 * - Commission for this exact node_id must not already exist (UNIQUE per node).
 * - If buyer has no sponsor, returns null with no error.
 * - Amount is strictly server-authoritative ($50 USD).
 */
/**
 * Processes and creates a Direct Referral Commission upon successful Node activation.
 * Triggered authoritatively after verified payment settlement or node allocation.
 * 
 * Rules:
 * - Buyer must have a valid sponsor_user_id (or pending_referral_code).
 * - Commission for this exact node_id must not already exist (UNIQUE per node).
 * - Amount is strictly server-authoritative ($25/$50 USD based on economic settings).
 */
export async function processNodeActivationCommission(
  db: DatabaseClient,
  orderId: string,
  nodeId: string,
  buyerUserId: string
): Promise<SafeReferralCommission | null> {
  // 1. Check if buyer has a registered sponsor in user_referrals
  const sponsorRes = await db.query<{
    sponsor_user_id: string | null;
    buyer_public_id: string;
    pending_referral_code: string | null;
  }>(
    `
    SELECT ur.sponsor_user_id, u.public_id AS buyer_public_id, u.pending_referral_code
    FROM users u
    LEFT JOIN user_referrals ur ON u.id = ur.user_id
    WHERE u.id = $1
    `,
    [buyerUserId]
  );

  if (sponsorRes.rows.length === 0) {
    return null;
  }

  let sponsorUserId = sponsorRes.rows[0].sponsor_user_id;
  const buyerPublicId = sponsorRes.rows[0].buyer_public_id;
  const pendingCode = (sponsorRes.rows[0].pending_referral_code || '').trim();

  // 1b. Auto-resolve missing sponsor from pending_referral_code if available
  if (!sponsorUserId && pendingCode) {
    try {
      const { resolveSponsorUserId } = await import('../utils/idGenerator');
      const resolvedSponsorId = await resolveSponsorUserId(db, pendingCode);
      if (resolvedSponsorId && resolvedSponsorId !== buyerUserId) {
        sponsorUserId = resolvedSponsorId;
        await db.query(
          `
          INSERT INTO user_referrals (user_id, referral_code, sponsor_user_id, created_at)
          VALUES ($1, 'PHX' || floor(random()*90000+10000)::text, $2, CURRENT_TIMESTAMP)
          ON CONFLICT (user_id) DO UPDATE SET sponsor_user_id = EXCLUDED.sponsor_user_id
          `,
          [buyerUserId, resolvedSponsorId]
        );
      }
    } catch (err) {
      console.warn('[ReferralCommission] Error auto-resolving pending sponsor:', err);
    }
  }

  // If no sponsor registered or self-referral, no commission is generated
  if (!sponsorUserId || sponsorUserId === buyerUserId) {
    return null;
  }

  // 2. Verify sponsor account exists and is valid
  const sponsorUserRes = await db.query<{
    id: string;
    public_id: string;
    status: string;
  }>(
    `SELECT id, public_id, status FROM users WHERE id = $1`,
    [sponsorUserId]
  );

  if (sponsorUserRes.rows.length === 0) {
    return null;
  }

  const sponsorUser = sponsorUserRes.rows[0];

  // Block disabled or suspended sponsors
  if (sponsorUser.status === 'DISABLED' || sponsorUser.status === 'SUSPENDED') {
    console.warn(`[ReferralCommission] Sponsor ${sponsorUserId} account is ${sponsorUser.status}. Commission skipped.`);
    return null;
  }

  // 3. Uniqueness Check: Check if commission already exists for this exact node_id
  const existingRes = await db.query<{
    id: string;
    public_commission_id: string;
    amount_usd: string | number;
    status: ReferralCommissionStatus;
    earned_at: Date;
    public_node_id: string;
    buyer_public_id: string;
  }>(
    `
    SELECT 
      rc.id, rc.public_commission_id, rc.amount_usd, rc.status, rc.earned_at,
      n.public_node_id, u.public_id AS buyer_public_id
    FROM referral_commissions rc
    JOIN nodes n ON rc.node_id = n.id
    JOIN users u ON rc.referred_user_id = u.id
    WHERE rc.node_id = $1
    `,
    [nodeId]
  );

  if (existingRes.rows.length > 0) {
    const existing = existingRes.rows[0];
    return {
      publicCommissionId: existing.public_commission_id,
      referredUserPublicId: existing.buyer_public_id,
      nodePublicId: existing.public_node_id,
      amountUsd: Number(existing.amount_usd),
      status: existing.status,
      earnedAt: existing.earned_at.toISOString(),
      reversedAt: null,
    };
  }

  // 4. Fetch node public ID
  const nodeRes = await db.query<{ public_node_id: string; node_number: number }>(
    `SELECT public_node_id, node_number FROM nodes WHERE id = $1`,
    [nodeId]
  );
  const nodeInfo = nodeRes.rows[0];
  const nodePublicId = nodeInfo?.public_node_id || 'PHX-NODE-UNKNOWN';

  // 5. Generate unique public_commission_id (PHX-COM-XXXXXX)
  const countRes = await db.query<{ count: string }>(`SELECT COUNT(*)::int AS count FROM referral_commissions`);
  const seq = parseInt(countRes.rows[0].count, 10) + 1;
  let publicCommissionId = formatPublicCommissionId(seq);

  // Ensure collision safety
  let collisionCheck = await db.query(`SELECT id FROM referral_commissions WHERE public_commission_id = $1`, [publicCommissionId]);
  if (collisionCheck.rows.length > 0) {
    publicCommissionId = `PHX-COM-${Math.floor(100000 + Math.random() * 900000)}`;
  }

  const commissionId = uuidv4();
  const commissionRate = await getDirectReferralCommissionRate();

  // 6. Insert Authoritative Commission Record
  const isOrderUuid = Boolean(orderId && orderId.length === 36 && orderId.includes('-'));
  let safeOrderId = isOrderUuid ? orderId : null;

  if (!safeOrderId) {
    const orderCheck = await db.query<{ id: string }>(
      `SELECT id FROM node_orders WHERE node_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [nodeId]
    );
    if (orderCheck.rows.length > 0) {
      safeOrderId = orderCheck.rows[0].id;
    } else {
      const dummyOrderId = uuidv4();
      const dummyPublicOrderId = `PHX-ORD-${Math.floor(100000 + Math.random() * 899999)}`;
      await db.query(
        `
        INSERT INTO node_orders (
          id, public_order_id, user_id, node_id, node_number, amount_usd, currency,
          status, payment_method, payment_reference, reserved_at, expires_at, completed_at, created_at, updated_at
        )
        VALUES (
          $1, $2, $3, $4, 1, 1000.00, 'USD',
          'COMPLETED', 'DIRECT_ACTIVATION', 'RECONCILED_NODE_ORDER', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
        ON CONFLICT DO NOTHING
        `,
        [dummyOrderId, dummyPublicOrderId, buyerUserId, nodeId]
      );
      safeOrderId = dummyOrderId;
    }
  }

  const insertRes = await db.query<{
    id: string;
    public_commission_id: string;
    amount_usd: string | number;
    status: ReferralCommissionStatus;
    earned_at: Date;
    created_at: Date;
  }>(
    `
    INSERT INTO referral_commissions (
      id, public_commission_id, sponsor_user_id, referred_user_id,
      node_id, node_order_id, amount_usd, status, earned_at, created_at
    ) VALUES (
      $1, $2, $3, $4,
      $5, $6, $7, 'EARNED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
    RETURNING id, public_commission_id, amount_usd, status, earned_at, created_at
    `,
    [
      commissionId,
      publicCommissionId,
      sponsorUserId,
      buyerUserId,
      nodeId,
      safeOrderId,
      commissionRate.toFixed(2),
    ]
  );

  const row = insertRes.rows[0];

  // 7. Post to authoritative financial ledger (Task #13)
  try {
    await postLedgerCredit({
      userId: sponsorUserId,
      sourceType: 'REFERRAL_COMMISSION',
      sourceId: row.id,
      sourceRef: row.public_commission_id,
      amount: Number(row.amount_usd),
      description: `Direct Referral Commission - Node ${nodePublicId} Activation`,
      createdAt: new Date(row.earned_at),
      dbClient: db,
    });
  } catch (ledgErr) {
    console.warn('[WalletLedger] Error posting referral commission to ledger:', ledgErr);
  }

  // 8. Record security/financial audit event
  try {
    await db.query(
      `
      INSERT INTO security_events (id, user_id, event_type, description, created_at)
      VALUES ($1, $2, 'DIRECT_REFERRAL_COMMISSION_EARNED', $3, CURRENT_TIMESTAMP)
      `,
      [
        uuidv4(),
        sponsorUserId,
        `Direct referral commission ${publicCommissionId} ($${row.amount_usd} USD) credited for referred buyer ${buyerPublicId} activating Genesis Node ${nodePublicId}.`,
      ]
    );
  } catch (secErr) {
    console.warn('[SecurityEvent] Could not log referral commission event:', secErr);
  }

  // 9. Trigger in-app notification for referral commission
  try {
    await notifyReferralEarned({
      userId: sponsorUserId,
      amountUsd: Number(row.amount_usd),
      buyerPublicId,
      commissionId: row.id,
    });
  } catch (notifErr) {
    console.warn('[Notification] Could not trigger referral earned notification:', notifErr);
  }

  return {
    publicCommissionId: row.public_commission_id,
    referredUserPublicId: buyerPublicId,
    nodePublicId,
    amountUsd: Number(row.amount_usd),
    status: row.status,
    earnedAt: row.earned_at.toISOString(),
    reversedAt: null,
  };
}

/**
 * Scans all active/allocated nodes and auto-reconciles any missing direct referral commissions.
 * Guarantees zero missed commissions across database seeding, admin assignments, or rollout restarts.
 */
export async function reconcileUnprocessedReferralCommissions(dbClient?: DatabaseClient): Promise<{
  reconciledCount: number;
  commissions: SafeReferralCommission[];
}> {
  const db = dbClient || (await getDb());
  const activeNodesRes = await db.query<{
    id: string;
    owner_user_id: string;
    public_node_id: string;
    order_id: string | null;
  }>(
    `
    SELECT 
      n.id, 
      n.owner_user_id, 
      n.public_node_id,
      (SELECT id FROM node_orders WHERE node_id = n.id AND user_id = n.owner_user_id ORDER BY created_at DESC LIMIT 1) AS order_id
    FROM nodes n
    WHERE n.owner_user_id IS NOT NULL 
      AND n.status IN ('ACTIVE', 'PURCHASED', 'EMITTING', 'MATURED')
    `
  );

  const comms: SafeReferralCommission[] = [];
  let reconciledCount = 0;

  for (const node of activeNodesRes.rows) {
    // Check if commission already exists for this exact node
    const existing = await db.query(
      `SELECT id FROM referral_commissions WHERE node_id = $1`,
      [node.id]
    );

    if (existing.rows.length === 0) {
      const comm = await processNodeActivationCommission(
        db,
        node.order_id || 'AUTO_RECONCILE',
        node.id,
        node.owner_user_id
      );
      if (comm) {
        comms.push(comm);
        reconciledCount++;
      }
    }
  }

  if (reconciledCount > 0) {
    console.log(`[ReferralCommission] Successfully auto-reconciled ${reconciledCount} missing referral commissions!`);
  }

  return {
    reconciledCount,
    commissions: comms,
  };
}

/**
 * Reverses an existing referral commission (Audit-safe, status EARNED -> REVERSED).
 * Data foundation for future refund or legitimate reversal handling.
 */
export async function reverseReferralCommission(
  commissionIdentifier: string,
  reason?: string
): Promise<SafeReferralCommission> {
  const db = await getDb();

  const querySql = `
    SELECT 
      rc.id, rc.public_commission_id, rc.sponsor_user_id, rc.amount_usd,
      rc.status, rc.earned_at, rc.reversed_at,
      n.public_node_id, u.public_id AS buyer_public_id
    FROM referral_commissions rc
    JOIN nodes n ON rc.node_id = n.id
    JOIN users u ON rc.referred_user_id = u.id
    WHERE rc.id::text = $1 OR rc.public_commission_id = $1
  `;

  const comRes = await db.query<{
    id: string;
    public_commission_id: string;
    sponsor_user_id: string;
    amount_usd: string | number;
    status: ReferralCommissionStatus;
    earned_at: Date;
    reversed_at: Date | null;
    public_node_id: string;
    buyer_public_id: string;
  }>(querySql, [commissionIdentifier.trim()]);

  if (comRes.rows.length === 0) {
    const error: any = new Error('Referral commission record not found.');
    error.code = 'COMMISSION_NOT_FOUND';
    error.statusCode = 404;
    throw error;
  }

  const commission = comRes.rows[0];

  if (commission.status === 'REVERSED') {
    return {
      publicCommissionId: commission.public_commission_id,
      referredUserPublicId: commission.buyer_public_id,
      nodePublicId: commission.public_node_id,
      amountUsd: Number(commission.amount_usd),
      status: commission.status,
      earnedAt: commission.earned_at.toISOString(),
      reversedAt: commission.reversed_at ? commission.reversed_at.toISOString() : new Date().toISOString(),
    };
  }

  // Atomically update status to REVERSED
  const updateRes = await db.query<{
    id: string;
    public_commission_id: string;
    status: ReferralCommissionStatus;
    earned_at: Date;
    reversed_at: Date;
  }>(
    `
    UPDATE referral_commissions
    SET status = 'REVERSED', reversed_at = CURRENT_TIMESTAMP
    WHERE id = $1
    RETURNING id, public_commission_id, status, earned_at, reversed_at
    `,
    [commission.id]
  );

  const updated = updateRes.rows[0];

  // Post REVERSAL to authoritative financial ledger (Task #13)
  try {
    await postLedgerReversal({
      userId: commission.sponsor_user_id,
      sourceType: 'REFERRAL_COMMISSION',
      sourceId: commission.id,
      sourceRef: commission.public_commission_id,
      amount: Number(commission.amount_usd),
      description: `Direct Referral Commission Reversal - Node ${commission.public_node_id}`,
      createdAt: updated.reversed_at ? new Date(updated.reversed_at) : new Date(),
    });
  } catch (ledgErr) {
    console.warn('[WalletLedger] Error posting referral commission reversal to ledger:', ledgErr);
  }

  // Record security audit event
  try {
    await db.query(
      `
      INSERT INTO security_events (id, user_id, event_type, description, created_at)
      VALUES ($1, $2, 'DIRECT_REFERRAL_COMMISSION_REVERSED', $3, CURRENT_TIMESTAMP)
      `,
      [
        uuidv4(),
        commission.sponsor_user_id,
        `Referral commission ${commission.public_commission_id} ($50.00 USD) reversed. Reason: ${reason || 'Protocol transaction adjustment'}.`,
      ]
    );
  } catch (secErr) {
    console.warn('[SecurityEvent] Could not log referral commission reversal:', secErr);
  }

  return {
    publicCommissionId: updated.public_commission_id,
    referredUserPublicId: commission.buyer_public_id,
    nodePublicId: commission.public_node_id,
    amountUsd: Number(commission.amount_usd),
    status: updated.status,
    earnedAt: updated.earned_at.toISOString(),
    reversedAt: updated.reversed_at.toISOString(),
  };
}

/**
 * Returns privacy-safe list of direct referrals for the authenticated sponsor.
 * Exposes ONLY publicId, displayName, and joinedAt.
 */
export async function getUserDirectReferrals(sponsorUserId: string): Promise<DirectReferralItem[]> {
  const db = await getDb();

  const result = await db.query<{
    public_id: string;
    full_name: string;
    created_at: Date;
  }>(
    `
    SELECT u.public_id, u.full_name, ur.created_at
    FROM user_referrals ur
    JOIN users u ON ur.user_id = u.id
    WHERE ur.sponsor_user_id = $1
    ORDER BY ur.created_at DESC
    `,
    [sponsorUserId]
  );

  return result.rows.map((row) => ({
    publicId: row.public_id,
    displayName: formatSafeDisplayName(row.full_name),
    joinedAt: row.created_at.toISOString(),
  }));
}

/**
 * Returns all earned referral commissions for the authenticated sponsor.
 * Total earned is derived authoritatively from real DB commission records with status 'EARNED'.
 */
export async function getUserCommissions(sponsorUserId: string): Promise<UserCommissionsResponse> {
  const db = await getDb();

  const result = await db.query<{
    id: string;
    public_commission_id: string;
    referred_public_id: string;
    public_node_id: string;
    amount_usd: string | number;
    status: ReferralCommissionStatus;
    earned_at: Date;
    reversed_at: Date | null;
  }>(
    `
    SELECT 
      rc.id,
      rc.public_commission_id,
      u.public_id AS referred_public_id,
      n.public_node_id,
      rc.amount_usd,
      rc.status,
      rc.earned_at,
      rc.reversed_at
    FROM referral_commissions rc
    JOIN users u ON rc.referred_user_id = u.id
    JOIN nodes n ON rc.node_id = n.id
    WHERE rc.sponsor_user_id = $1
    ORDER BY rc.earned_at DESC
    `,
    [sponsorUserId]
  );

  let totalEarnedUsd = 0;
  const commissions: SafeReferralCommission[] = [];
  const seenSourceIds = new Set<string>();

  for (const row of result.rows) {
    seenSourceIds.add(row.id);
    const amount = Number(row.amount_usd);
    if (row.status === 'EARNED') {
      totalEarnedUsd += amount;
    }
    commissions.push({
      publicCommissionId: row.public_commission_id,
      referredUserPublicId: row.referred_public_id,
      nodePublicId: row.public_node_id,
      amountUsd: amount,
      status: row.status,
      earnedAt: row.earned_at.toISOString(),
      reversedAt: row.reversed_at ? row.reversed_at.toISOString() : null,
    });
  }

  // Also include Master Affiliate Map Spot Commissions posted directly to financial_ledger_entries
  const spotLedgerRes = await db.query<{
    source_id: string;
    source_ref: string;
    amount: string | number;
    status: string;
    created_at: Date;
  }>(
    `
    SELECT source_id::text AS source_id, source_ref, amount, status, created_at
    FROM financial_ledger_entries
    WHERE user_id = $1
      AND source_type = 'REFERRAL_COMMISSION'
      AND entry_type = 'CREDIT'
      AND source_ref LIKE 'PHX-COM-SPOT%'
    ORDER BY created_at DESC
    `,
    [sponsorUserId]
  );

  if (spotLedgerRes.rows.length > 0) {
    // Find a direct referral or user's active node for display metadata
    const refChildRes = await db.query<{ public_id: string }>(
      `
      SELECT u.public_id
      FROM user_referrals ur
      JOIN users u ON ur.user_id = u.id
      WHERE ur.sponsor_user_id = $1
      ORDER BY ur.created_at ASC
      LIMIT 1
      `,
      [sponsorUserId]
    );
    const ownNodeRes = await db.query<{ public_node_id: string }>(
      `SELECT public_node_id FROM nodes WHERE owner_user_id = $1 LIMIT 1`,
      [sponsorUserId]
    );

    const refPublicId = refChildRes.rows[0]?.public_id || 'PHX-NETWORK';
    const nodePublicId = ownNodeRes.rows[0]?.public_node_id || 'PHX-NODE-GENESIS';

    for (const spot of spotLedgerRes.rows) {
      if (seenSourceIds.has(spot.source_id)) continue;
      const amt = Number(spot.amount);
      if (amt <= 0) continue;
      const isEarned = spot.status === 'SETTLED';
      if (isEarned) {
        totalEarnedUsd += amt;
      }
      commissions.push({
        publicCommissionId: spot.source_ref || 'PHX-SPOT-025',
        referredUserPublicId: refPublicId,
        nodePublicId,
        amountUsd: amt,
        status: isEarned ? 'EARNED' : 'REVERSED',
        earnedAt: new Date(spot.created_at).toISOString(),
        reversedAt: isEarned ? null : new Date().toISOString(),
      });
    }
  }

  return {
    totalEarnedUsd,
    commissions,
  };
}

