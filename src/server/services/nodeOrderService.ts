import { getDb, DatabaseClient } from '../db/db';
import { v4 as uuidv4 } from 'uuid';
import { generateOrderPublicId, generateLedgerTransactionPublicId } from '../utils/idGenerator';
import {
  NODE_BASE_PRICE_USD,
  RESERVATION_EXPIRY_MINUTES,
  NodeOrderStatus,
  isValidOrderStateTransition,
  isValidNodeStateTransition
} from '../../config/nodeConfig';
import { processNodeActivationCommission, SafeReferralCommission } from './referralCommissionService';
import { propagateNodeSalesVolume } from './binaryVolumeService';
import { broadcastPublicEvent } from './publicNetworkService';
import { getNodeBasePrice, isNodeSalesEnabled, getNodeRewardRatePerEpoch, getInternalCoinPrice } from './economicService';
import { notifyNodeActivated } from './notificationService';

export interface SafeNodeOrder {
  id?: string;
  publicOrderId: string;
  publicNodeId: string;
  nodeNumber: number;
  amountUsd: number;
  currency: string;
  status: NodeOrderStatus;
  paymentMethod: string;
  paymentReference: string | null;
  reservedAt: string;
  expiresAt: string;
  completedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  secondsRemaining: number;
}

/**
 * Sweeps and cleans up expired PENDING reservations.
 * Releases reserved nodes back to AVAILABLE state.
 */
export async function cleanupExpiredReservations(dbClient?: DatabaseClient): Promise<number> {
  const db = dbClient || (await getDb());
  try {
    // Find all expired pending orders
    const expiredOrdersRes = await db.query<{
      id: string;
      node_id: string;
      user_id: string;
      public_order_id: string;
    }>(
      `
      SELECT id, node_id, user_id, public_order_id
      FROM node_orders
      WHERE status = 'PENDING' AND expires_at <= CURRENT_TIMESTAMP
      `
    );

    if (expiredOrdersRes.rows.length === 0) {
      return 0;
    }

    let cleanedCount = 0;
    for (const ord of expiredOrdersRes.rows) {
      // 1. Mark order as EXPIRED
      await db.query(
        `
        UPDATE node_orders
        SET status = 'EXPIRED', updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND status = 'PENDING'
        `,
        [ord.id]
      );

      // 2. Release the node back to AVAILABLE
      await db.query(
        `
        UPDATE nodes
        SET status = 'AVAILABLE', reserved_by_user_id = NULL, reserved_at = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND status = 'RESERVED'
        `,
        [ord.node_id]
      );

      cleanedCount++;
    }

    return cleanedCount;
  } catch (err) {
    console.error('[NodeOrderService] Error during cleanupExpiredReservations:', err);
    return 0;
  }
}

/**
 * Creates an atomic node reservation and order for the authenticated user.
 * Includes concurrency protection, idempotency check, and sold-out detection.
 */
export async function createNodeReservation(
  userId: string,
  idempotencyKey?: string,
  paymentMethod = 'SIMULATED_INSTANT',
  dbClient?: DatabaseClient
): Promise<{
  order: SafeNodeOrder;
  isExisting: boolean;
}> {
  const db = dbClient || (await getDb());

  if (dbClient) {
    return executeReservation(dbClient, userId, idempotencyKey, paymentMethod);
  }

  try {
    return await db.transaction(async (trx) => {
      return executeReservation(trx, userId, idempotencyKey, paymentMethod);
    });
  } catch (err) {
    console.error('[CreateNodeReservation Error]', err);
    throw err;
  }
}

async function executeReservation(
  db: DatabaseClient,
  userId: string,
  idempotencyKey?: string,
  paymentMethod = 'SIMULATED_INSTANT'
): Promise<{
  order: SafeNodeOrder;
  isExisting: boolean;
}> {
  // 0. Check Master Economic Switch: Node Sales Enabled
  const salesEnabled = await isNodeSalesEnabled(db);
  if (!salesEnabled) {
    const error: any = new Error('NODE_SALES_PAUSED: Genesis Node sales and reservations are currently paused by administration.');
    error.code = 'NODE_SALES_PAUSED';
    error.statusCode = 403;
    throw error;
  }

  // Lock user row to serialize concurrent reservations for the same user
  await db.query(`SELECT id FROM users WHERE id = $1 FOR UPDATE`, [userId]);

  // 1. First sweep expired reservations to ensure accurate availability
  try {
    await cleanupExpiredReservations(db);
  } catch {}

  // 2. Idempotency Check: If key provided and exists, return existing order
  if (idempotencyKey && idempotencyKey.trim().length > 0) {
    const existingByIdempotency = await db.query<{
      id: string;
      public_order_id: string;
      node_id: string;
      node_number: number;
      amount_usd: string | number;
      currency: string;
      status: NodeOrderStatus;
      payment_method: string;
      payment_reference: string | null;
      reserved_at: Date;
      expires_at: Date;
      completed_at: Date | null;
      cancelled_at: Date | null;
      created_at: Date;
      public_node_id: string;
    }>(
      `
      SELECT 
        o.id, o.public_order_id, o.node_id, o.node_number, o.amount_usd,
        o.currency, o.status, o.payment_method, o.payment_reference,
        o.reserved_at, o.expires_at, o.completed_at, o.cancelled_at, o.created_at,
        n.public_node_id
      FROM node_orders o
      JOIN nodes n ON o.node_id = n.id
      WHERE o.idempotency_key = $1
      `,
      [idempotencyKey.trim()]
    );

    if (existingByIdempotency.rows.length > 0) {
      const row = existingByIdempotency.rows[0];
      const nowMs = Date.now();
      const expiresMs = new Date(row.expires_at).getTime();
      const secondsRemaining = Math.max(0, Math.floor((expiresMs - nowMs) / 1000));

      return {
        order: {
          id: row.id,
          publicOrderId: row.public_order_id,
          publicNodeId: row.public_node_id,
          nodeNumber: row.node_number,
          amountUsd: Number(row.amount_usd),
          currency: row.currency,
          status: row.status,
          paymentMethod: row.payment_method,
          paymentReference: row.payment_reference,
          reservedAt: row.reserved_at.toISOString(),
          expiresAt: row.expires_at.toISOString(),
          completedAt: row.completed_at ? row.completed_at.toISOString() : null,
          cancelledAt: row.cancelled_at ? row.cancelled_at.toISOString() : null,
          createdAt: row.created_at.toISOString(),
          secondsRemaining,
        },
        isExisting: true,
      };
    }
  }

  // 3. Check if user already has an active, unexpired PENDING reservation
  const activePendingRes = await db.query<{
    id: string;
    public_order_id: string;
    node_id: string;
    node_number: number;
    amount_usd: string | number;
    currency: string;
    status: NodeOrderStatus;
    payment_method: string;
    payment_reference: string | null;
    reserved_at: Date;
    expires_at: Date;
    completed_at: Date | null;
    cancelled_at: Date | null;
    created_at: Date;
    public_node_id: string;
  }>(
    `
    SELECT 
      o.id, o.public_order_id, o.node_id, o.node_number, o.amount_usd,
      o.currency, o.status, o.payment_method, o.payment_reference,
      o.reserved_at, o.expires_at, o.completed_at, o.cancelled_at, o.created_at,
      n.public_node_id
    FROM node_orders o
    JOIN nodes n ON o.node_id = n.id
    WHERE o.user_id = $1 AND o.status = 'PENDING' AND o.expires_at > CURRENT_TIMESTAMP
    ORDER BY o.created_at DESC
    LIMIT 1
    FOR UPDATE
    `,
    [userId]
  );

  if (activePendingRes.rows.length > 0) {
    const row = activePendingRes.rows[0];
    const nowMs = Date.now();
    const expiresMs = new Date(row.expires_at).getTime();
    const secondsRemaining = Math.max(0, Math.floor((expiresMs - nowMs) / 1000));

    return {
      order: {
        id: row.id,
        publicOrderId: row.public_order_id,
        publicNodeId: row.public_node_id,
        nodeNumber: row.node_number,
        amountUsd: Number(row.amount_usd),
        currency: row.currency,
        status: row.status,
        paymentMethod: row.payment_method,
        paymentReference: row.payment_reference,
        reservedAt: row.reserved_at.toISOString(),
        expiresAt: row.expires_at.toISOString(),
        completedAt: row.completed_at ? row.completed_at.toISOString() : null,
        cancelledAt: row.cancelled_at ? row.cancelled_at.toISOString() : null,
        createdAt: row.created_at.toISOString(),
        secondsRemaining,
      },
      isExisting: true,
    };
  }

  // 4. Atomic Node Allocation & Reservation with Concurrency Protection
  // Select lowest available Genesis node number
  const maxRetries = 3;
  let attempt = 0;

  while (attempt < maxRetries) {
    attempt++;

    // Find next available node
    const candidateRes = await db.query<{
      id: string;
      node_number: number;
      public_node_id: string;
    }>(
      `
      SELECT id, node_number, public_node_id
      FROM nodes
      WHERE status = 'AVAILABLE'
      ORDER BY node_number ASC
      LIMIT 1
      FOR UPDATE
      `
    );

    if (candidateRes.rows.length === 0) {
      const error: any = new Error('All 10,000 Genesis Nodes have been allocated or reserved.');
      error.code = 'SOLD_OUT';
      error.statusCode = 409;
      throw error;
    }

    const candidateNode = candidateRes.rows[0];

    // Atomically transition candidate node: AVAILABLE -> RESERVED
    const reserveNodeRes = await db.query<{ id: string }>(
      `
      UPDATE nodes
      SET 
        status = 'RESERVED',
        reserved_by_user_id = $1,
        reserved_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $2 AND status = 'AVAILABLE'
      RETURNING id
      `,
      [userId, candidateNode.id]
    );

    if (reserveNodeRes.rows.length === 0) {
      // Race condition: another concurrent worker claimed this node; retry loop
      continue;
    }

    // Node successfully reserved. Now create the order record.
    const orderId = uuidv4();
    const publicOrderId = generateOrderPublicId();
    const cleanIdempotencyKey = idempotencyKey && idempotencyKey.trim().length > 0 ? idempotencyKey.trim() : null;

    const expiresAt = new Date(Date.now() + RESERVATION_EXPIRY_MINUTES * 60 * 1000);
    const nodePrice = await getNodeBasePrice(db);

    const orderInsertRes = await db.query<{
      id: string;
      public_order_id: string;
      node_id: string;
      node_number: number;
      amount_usd: string | number;
      currency: string;
      status: NodeOrderStatus;
      payment_method: string;
      payment_reference: string | null;
      reserved_at: Date;
      expires_at: Date;
      created_at: Date;
    }>(
      `
      INSERT INTO node_orders (
        id, public_order_id, user_id, node_id, node_number,
        amount_usd, currency, status, payment_method, idempotency_key,
        reserved_at, expires_at, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP, $11, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING 
        id, public_order_id, node_id, node_number, amount_usd,
        currency, status, payment_method, payment_reference,
        reserved_at, expires_at, created_at
      `,
      [
        orderId,
        publicOrderId,
        userId,
        candidateNode.id,
        candidateNode.node_number,
        nodePrice, // Server-authoritative Node Price
        'USD',
        'PENDING',
        paymentMethod,
        cleanIdempotencyKey,
        expiresAt,
      ]
    );

    const insertedOrder = orderInsertRes.rows[0];
    const nowMs = Date.now();
    const expiresMs = new Date(insertedOrder.expires_at).getTime();
    const secondsRemaining = Math.max(0, Math.floor((expiresMs - nowMs) / 1000));

    return {
      order: {
        id: insertedOrder.id,
        publicOrderId: insertedOrder.public_order_id,
        publicNodeId: candidateNode.public_node_id,
        nodeNumber: insertedOrder.node_number,
        amountUsd: Number(insertedOrder.amount_usd),
        currency: insertedOrder.currency,
        status: insertedOrder.status,
        paymentMethod: insertedOrder.payment_method,
        paymentReference: insertedOrder.payment_reference,
        reservedAt: insertedOrder.reserved_at.toISOString(),
        expiresAt: insertedOrder.expires_at.toISOString(),
        completedAt: null,
        cancelledAt: null,
        createdAt: insertedOrder.created_at.toISOString(),
        secondsRemaining,
      },
      isExisting: false,
    };
  }

  const conflictErr: any = new Error('High concurrency conflict allocating node. Please retry.');
  conflictErr.code = 'CONCURRENCY_RETRY';
  conflictErr.statusCode = 409;
  throw conflictErr;
}

/**
 * Authoritative Internal / Webhook Settlement Service.
 * Settles a reserved Node order upon verified payment confirmation.
 * Transitions order: PENDING -> COMPLETED
 * Transitions node: RESERVED -> ACTIVE (with owner_user_id assigned)
 * 
 * Idempotency Guarantee: If the order is already COMPLETED, safely returns the completed order
 * and active node without re-allocating or throwing error.
 */
export async function settleNodeOrder(
  userId: string | null,
  orderIdentifier: string,
  paymentReference?: string,
  dbClient?: DatabaseClient
): Promise<{
  order: SafeNodeOrder;
  node: {
    publicNodeId: string;
    nodeNumber: number;
    status: string;
    activatedAt: string;
  };
  referralCommission?: SafeReferralCommission | null;
  isDuplicate?: boolean;
  runPostCommit?: () => Promise<void>;
}> {
  const db = dbClient || (await getDb());

  // 1. Sweep expired reservations first
  await cleanupExpiredReservations(db);

  // 2. Fetch order (optionally scoped by user if userId provided)
  const querySql = userId
    ? `
      SELECT 
        o.id, o.public_order_id, o.user_id, o.node_id, o.node_number, o.amount_usd,
        o.currency, o.status, o.payment_method, o.payment_reference,
        o.reserved_at, o.expires_at, o.completed_at, o.cancelled_at, o.created_at,
        n.public_node_id, n.status AS node_status, n.activated_at AS node_activated_at
      FROM node_orders o
      JOIN nodes n ON o.node_id = n.id
      WHERE (o.id::text = $1 OR o.public_order_id = $1) AND o.user_id = $2
      `
    : `
      SELECT 
        o.id, o.public_order_id, o.user_id, o.node_id, o.node_number, o.amount_usd,
        o.currency, o.status, o.payment_method, o.payment_reference,
        o.reserved_at, o.expires_at, o.completed_at, o.cancelled_at, o.created_at,
        n.public_node_id, n.status AS node_status, n.activated_at AS node_activated_at
      FROM node_orders o
      JOIN nodes n ON o.node_id = n.id
      WHERE (o.id::text = $1 OR o.public_order_id = $1)
      `;

  const queryParams = userId ? [orderIdentifier.trim(), userId] : [orderIdentifier.trim()];
  const orderRes = await db.query<{
    id: string;
    public_order_id: string;
    user_id: string;
    node_id: string;
    node_number: number;
    amount_usd: string | number;
    currency: string;
    status: NodeOrderStatus;
    payment_method: string;
    payment_reference: string | null;
    reserved_at: Date;
    expires_at: Date;
    completed_at: Date | null;
    cancelled_at: Date | null;
    created_at: Date;
    public_node_id: string;
    node_status: string;
    node_activated_at: Date | null;
  }>(querySql, queryParams);

  if (orderRes.rows.length === 0) {
    const error: any = new Error('Order not found or unauthorized.');
    error.code = 'ORDER_NOT_FOUND';
    error.statusCode = 404;
    throw error;
  }

  const order = orderRes.rows[0];

  // Idempotency: If already COMPLETED, return current state without re-executing
  if (order.status === 'COMPLETED') {
    return {
      order: {
        publicOrderId: order.public_order_id,
        publicNodeId: order.public_node_id,
        nodeNumber: order.node_number,
        amountUsd: Number(order.amount_usd),
        currency: order.currency,
        status: order.status,
        paymentMethod: order.payment_method,
        paymentReference: order.payment_reference,
        reservedAt: order.reserved_at.toISOString(),
        expiresAt: order.expires_at.toISOString(),
        completedAt: order.completed_at ? order.completed_at.toISOString() : new Date().toISOString(),
        cancelledAt: null,
        createdAt: order.created_at.toISOString(),
        secondsRemaining: 0,
      },
      node: {
        publicNodeId: order.public_node_id,
        nodeNumber: order.node_number,
        status: order.node_status || 'ACTIVE',
        activatedAt: order.node_activated_at
          ? order.node_activated_at.toISOString()
          : (order.completed_at ? order.completed_at.toISOString() : new Date().toISOString()),
      },
      isDuplicate: true,
    };
  }

  if (order.status !== 'PENDING') {
    const error: any = new Error(`Cannot settle order in ${order.status} state.`);
    error.code = 'INVALID_ORDER_STATE';
    error.statusCode = 400;
    throw error;
  }

  // Check if reservation expired
  if (new Date(order.expires_at).getTime() <= Date.now()) {
    // Release and mark expired
    await db.query(`UPDATE node_orders SET status = 'EXPIRED', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [order.id]);
    await db.query(`UPDATE nodes SET status = 'AVAILABLE', reserved_by_user_id = NULL, reserved_at = NULL WHERE id = $1`, [order.node_id]);
    
    const error: any = new Error('The 15-minute reservation window for this node has expired.');
    error.code = 'ORDER_EXPIRED';
    error.statusCode = 400;
    throw error;
  }

  // Validate state transitions
  if (!isValidOrderStateTransition('PENDING', 'COMPLETED')) {
    const error: any = new Error('Invalid order transition.');
    error.code = 'INVALID_TRANSITION';
    error.statusCode = 400;
    throw error;
  }
  if (!isValidNodeStateTransition('RESERVED', 'ACTIVE')) {
    const error: any = new Error('Invalid node transition.');
    error.code = 'INVALID_TRANSITION';
    error.statusCode = 400;
    throw error;
  }

  const effectiveRef = paymentReference || `SETTLE_VERIFIED_${Date.now()}_${order.public_order_id}`;

  const currentRewardRate = await getNodeRewardRatePerEpoch(db);
  const internalCoin = await getInternalCoinPrice().catch(() => ({ priceUsdt: 0.10 }));
  const refCoinPrice = internalCoin.priceUsdt || 0.10;
  const basePrice = await getNodeBasePrice(db).catch(() => 1000.00);

  // 3. Atomically transition Node: RESERVED -> ACTIVE (Using dynamic economic parameters)
  const activatedNodeRes = await db.query<{
    id: string;
    public_node_id: string;
    node_number: number;
    status: string;
    activated_at: Date;
    maturity_timestamp: Date | null;
    distributed_phivo: string | number;
    remaining_phivo: string | number;
  }>(
    `
    UPDATE nodes
    SET 
      status = 'ACTIVE',
      owner_user_id = $1,
      reserved_by_user_id = NULL,
      purchase_timestamp = COALESCE(purchase_timestamp, CURRENT_TIMESTAMP),
      activated_at = CURRENT_TIMESTAMP,
      maturity_timestamp = NULL,
      product_version = COALESCE(product_version, 'GENESIS_V1'),
      purchase_price_usd = COALESCE(purchase_price_usd, $3),
      phivo_reference_price_at_purchase = COALESCE(phivo_reference_price_at_purchase, $4),
      lifetime_phivo_allocation = COALESCE(lifetime_phivo_allocation, 10000.00),
      term_days = term_days,
      daily_phivo_emission = COALESCE($5, daily_phivo_emission),
      distributed_phivo = COALESCE(distributed_phivo, 0.00),
      remaining_phivo = COALESCE(remaining_phivo, 10000.00),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $2 AND status = 'RESERVED'
    RETURNING id, public_node_id, node_number, status, activated_at, maturity_timestamp, distributed_phivo, remaining_phivo
    `,
    [order.user_id, order.node_id, basePrice, refCoinPrice, currentRewardRate]
  );

  if (activatedNodeRes.rows.length === 0) {
    const error: any = new Error('Failed to activate node. Reservation state changed.');
    error.code = 'NODE_STATE_MISMATCH';
    error.statusCode = 409;
    throw error;
  }

  // 4. Update order to COMPLETED
  const updatedOrderRes = await db.query<{
    id: string;
    public_order_id: string;
    node_id: string;
    node_number: number;
    amount_usd: string | number;
    currency: string;
    status: NodeOrderStatus;
    payment_method: string;
    payment_reference: string | null;
    reserved_at: Date;
    expires_at: Date;
    completed_at: Date;
    created_at: Date;
  }>(
    `
    UPDATE node_orders
    SET 
      status = 'COMPLETED',
      payment_reference = $1,
      completed_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $2
    RETURNING *
    `,
    [effectiveRef, order.id]
  );

  const finalOrder = updatedOrderRes.rows[0];
  const finalNode = activatedNodeRes.rows[0];

  // 5. Generate Direct Referral Commission ($50 USD to sponsor if eligible)
  let referralCommission: SafeReferralCommission | null = null;
  try {
    referralCommission = await processNodeActivationCommission(
      db,
      finalOrder.id,
      finalNode.id,
      order.user_id
    );
  } catch (commErr) {
    console.warn('[ReferralCommission] Error processing referral commission for node activation:', commErr);
  }

  // 6. Task #10: Propagate Binary Node Sales Volume to binary uplines
  try {
    await propagateNodeSalesVolume(db, finalNode.id, order.user_id);
  } catch (volErr) {
    console.warn('[BinaryVolume] Error propagating node sales volume:', volErr);
  }

  // 6b. Apply Active Promotional Offers (e.g. Buy 1 Genesis Node, Get 1 Free Promo Node)
  try {
    const { getPromotionalOffers } = await import('./promotionalService');
    const promoOffers = await getPromotionalOffers(false);
    const bogoOffer = promoOffers.find(o => o.offerType === 'BOGO_FREE_NODE' || o.title.toLowerCase().includes('bogo') || o.title.toLowerCase().includes('free promo node'));

    if (bogoOffer && bogoOffer.bonusNodesCount > 0) {
      const bonusCount = bogoOffer.bonusNodesCount || 1;
      for (let i = 0; i < bonusCount; i++) {
        const availNodeRes = await db.query<{ id: string; node_number: number; public_node_id: string }>(
          `SELECT id, node_number, public_node_id FROM nodes WHERE status = 'AVAILABLE' ORDER BY node_number ASC LIMIT 1`
        );

        if (availNodeRes.rows.length > 0) {
          const bonusNode = availNodeRes.rows[0];
          await db.query(
            `
            UPDATE nodes
            SET 
              owner_user_id = $1,
              status = 'ACTIVE',
              activated_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
            `,
            [order.user_id, bonusNode.id]
          );

          await db.query(
            `
            INSERT INTO node_owners (id, node_id, user_id, acquired_via, acquired_at, is_current_owner)
            VALUES ($1, $2, $3, 'PROMOTIONAL_BONUS', CURRENT_TIMESTAMP, TRUE)
            ON CONFLICT (node_id, user_id) DO UPDATE SET is_current_owner = TRUE, acquired_via = 'PROMOTIONAL_BONUS'
            `,
            [uuidv4(), bonusNode.id, order.user_id]
          );

          // NOTE: As explicitly required, Free Promo Nodes receive Daily Mining Coin Rewards,
          // but generate NO binary matching volume and NO direct spot referral commission!
          console.log(`[PromotionEngine] Allocated Free Bonus Promo Node #${bonusNode.node_number} (${bonusNode.public_node_id}) to user ${order.user_id} under offer "${bogoOffer.title}"`);
        }
      }
    }
  } catch (promoErr) {
    console.warn('[PromotionEngine] Notice checking promotional node bonus:', promoErr);
  }

  // 7. Record security event
  try {
    await db.query(
      `
      INSERT INTO security_events (id, user_id, event_type, description, created_at)
      VALUES ($1, $2, 'NODE_PURCHASE_COMPLETED', $3, CURRENT_TIMESTAMP)
      `,
      [
        uuidv4(),
        order.user_id,
        `Acquired Genesis Node ${finalNode.public_node_id} (Node #${finalNode.node_number}) for $1,000 USD via order ${finalOrder.public_order_id}.`,
      ]
    );
  } catch (secErr) {
    console.warn('[SecurityEvent] Could not log purchase event:', secErr);
  }

  // Define post-commit side effects (notification, SSE, email, automation)
  // These MUST NOT hold up or deadlock the financial transaction!
  const executePostCommit = async () => {
    // Task #20: Trigger in-app notification for node activation
    try {
      await notifyNodeActivated({
        userId: order.user_id,
        nodeNumber: finalNode.node_number,
        orderPublicId: finalOrder.public_order_id,
        sourceId: finalOrder.id,
      });
    } catch (notifErr) {
      console.warn('[Notification] Could not trigger node activated notification:', notifErr);
    }

    // Broadcast live public event to SSE stream
    try {
      broadcastPublicEvent({
        id: `evt-node-${finalNode.public_node_id}`,
        type: 'node.activated',
        title: `${finalNode.public_node_id} Activated`,
        description: `Genesis validator node ${finalNode.public_node_id} successfully activated on-chain.`,
        timestamp: new Date().toISOString(),
        publicId: finalNode.public_node_id,
      });
    } catch (pubErr) {
      console.warn('[PublicEvent] Could not broadcast public node activation event:', pubErr);
    }

    // Task #23.4: Send NODE_ACTIVATION email and trigger potential automation rules
    try {
      const topDb = await getDb();
      const userRes = await topDb.query<{ email: string; full_name: string; public_id: string }>(
        `SELECT email, full_name, public_id FROM users WHERE id = $1`,
        [order.user_id]
      );
      if (userRes.rowCount > 0) {
        const user = userRes.rows[0];
        const { queueEventEmail, triggerAutomationRule } = await import('./emailService');
        
        // Queue email
        await queueEventEmail(user.email, 'NODE_ACTIVATION', {
          displayName: user.full_name,
          publicId: user.public_id,
          nodeNumber: String(finalNode.node_number),
          publicNodeId: finalNode.public_node_id,
          amount: String(finalOrder.amount_usd)
        });

        // Trigger automation rule check for NODE_SALES
        await triggerAutomationRule(order.user_id, 'NODE_SALES', {
          nodeNumber: String(finalNode.node_number),
          publicNodeId: finalNode.public_node_id,
          amount: String(finalOrder.amount_usd)
        });
      }
    } catch (emailErr) {
      console.warn('[EmailEngine] Failed to send Node Activation email/automation trigger:', emailErr);
    }
  };

  if (!dbClient) {
    // If running outside an external transaction, trigger asynchronously (non-blocking)
    executePostCommit().catch((err) => {
      console.warn('[NodeOrderService] Post-commit execution warning:', err);
    });
  }

  return {
    order: {
      id: finalOrder.id,
      publicOrderId: finalOrder.public_order_id,
      publicNodeId: finalNode.public_node_id,
      nodeNumber: finalOrder.node_number,
      amountUsd: Number(finalOrder.amount_usd),
      currency: finalOrder.currency,
      status: finalOrder.status,
      paymentMethod: finalOrder.payment_method,
      paymentReference: finalOrder.payment_reference,
      reservedAt: finalOrder.reserved_at.toISOString(),
      expiresAt: finalOrder.expires_at.toISOString(),
      completedAt: finalOrder.completed_at.toISOString(),
      cancelledAt: null,
      createdAt: finalOrder.created_at.toISOString(),
      secondsRemaining: 0,
    },
    node: {
      publicNodeId: finalNode.public_node_id,
      nodeNumber: finalNode.node_number,
      status: finalNode.status,
      activatedAt: finalNode.activated_at.toISOString(),
    },
    referralCommission,
    isDuplicate: false,
    runPostCommit: executePostCommit,
  };
}

/**
 * Cancels a pending node reservation.
 * Transitions order: PENDING -> CANCELLED
 * Transitions node: RESERVED -> AVAILABLE
 */
export async function cancelNodeOrder(
  userId: string,
  orderIdentifier: string
): Promise<{ success: boolean; message: string }> {
  const db = await getDb();

  const orderRes = await db.query<{
    id: string;
    node_id: string;
    status: NodeOrderStatus;
  }>(
    `
    SELECT id, node_id, status
    FROM node_orders
    WHERE (id::text = $1 OR public_order_id = $1) AND user_id = $2
    `,
    [orderIdentifier.trim(), userId]
  );

  if (orderRes.rows.length === 0) {
    const error: any = new Error('Order not found.');
    error.code = 'ORDER_NOT_FOUND';
    error.statusCode = 404;
    throw error;
  }

  const order = orderRes.rows[0];

  if (order.status !== 'PENDING') {
    const error: any = new Error(`Cannot cancel order in ${order.status} state.`);
    error.code = 'INVALID_ORDER_STATE';
    error.statusCode = 400;
    throw error;
  }

  // 1. Mark order CANCELLED
  await db.query(
    `
    UPDATE node_orders
    SET status = 'CANCELLED', cancelled_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    `,
    [order.id]
  );

  // 2. Release Node back to AVAILABLE
  await db.query(
    `
    UPDATE nodes
    SET status = 'AVAILABLE', reserved_by_user_id = NULL, reserved_at = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE id = $1 AND status = 'RESERVED'
    `,
    [order.node_id]
  );

  return {
    success: true,
    message: 'Node reservation cancelled successfully and released back to available inventory.',
  };
}

/**
 * Get all orders for the current user.
 */
export async function getUserOrders(userId: string, dbClient?: DatabaseClient): Promise<SafeNodeOrder[]> {
  const db = dbClient || (await getDb());

  // Sweep expired first
  await cleanupExpiredReservations(db);

  const ordersRes = await db.query<{
    id: string;
    public_order_id: string;
    node_id: string;
    node_number: number;
    amount_usd: string | number;
    currency: string;
    status: NodeOrderStatus;
    payment_method: string;
    payment_reference: string | null;
    reserved_at: Date;
    expires_at: Date;
    completed_at: Date | null;
    cancelled_at: Date | null;
    created_at: Date;
    public_node_id: string;
  }>(
    `
    SELECT 
      o.id, o.public_order_id, o.node_id, o.node_number, o.amount_usd,
      o.currency, o.status, o.payment_method, o.payment_reference,
      o.reserved_at, o.expires_at, o.completed_at, o.cancelled_at, o.created_at,
      n.public_node_id
    FROM node_orders o
    JOIN nodes n ON o.node_id = n.id
    WHERE o.user_id = $1
    ORDER BY o.created_at DESC
    `,
    [userId]
  );

  const nowMs = Date.now();
  return ordersRes.rows.map((row) => {
    const expiresMs = new Date(row.expires_at).getTime();
    const secondsRemaining = row.status === 'PENDING' ? Math.max(0, Math.floor((expiresMs - nowMs) / 1000)) : 0;

    return {
      publicOrderId: row.public_order_id,
      publicNodeId: row.public_node_id,
      nodeNumber: row.node_number,
      amountUsd: Number(row.amount_usd),
      currency: row.currency,
      status: row.status,
      paymentMethod: row.payment_method,
      paymentReference: row.payment_reference,
      reservedAt: row.reserved_at.toISOString(),
      expiresAt: row.expires_at.toISOString(),
      completedAt: row.completed_at ? row.completed_at.toISOString() : null,
      cancelledAt: row.cancelled_at ? row.cancelled_at.toISOString() : null,
      createdAt: row.created_at.toISOString(),
      secondsRemaining,
    };
  });
}

/**
 * Get a single order by ID / publicOrderId for the user.
 */
export async function getUserOrderById(userId: string, orderIdentifier: string): Promise<SafeNodeOrder | null> {
  const db = await getDb();

  await cleanupExpiredReservations(db);

  const orderRes = await db.query<{
    id: string;
    public_order_id: string;
    node_id: string;
    node_number: number;
    amount_usd: string | number;
    currency: string;
    status: NodeOrderStatus;
    payment_method: string;
    payment_reference: string | null;
    reserved_at: Date;
    expires_at: Date;
    completed_at: Date | null;
    cancelled_at: Date | null;
    created_at: Date;
    public_node_id: string;
  }>(
    `
    SELECT 
      o.id, o.public_order_id, o.node_id, o.node_number, o.amount_usd,
      o.currency, o.status, o.payment_method, o.payment_reference,
      o.reserved_at, o.expires_at, o.completed_at, o.cancelled_at, o.created_at,
      n.public_node_id
    FROM node_orders o
    JOIN nodes n ON o.node_id = n.id
    WHERE (o.id::text = $1 OR o.public_order_id = $1) AND o.user_id = $2
    `,
    [orderIdentifier.trim(), userId]
  );

  if (orderRes.rows.length === 0) {
    return null;
  }

  const row = orderRes.rows[0];
  const nowMs = Date.now();
  const expiresMs = new Date(row.expires_at).getTime();
  const secondsRemaining = row.status === 'PENDING' ? Math.max(0, Math.floor((expiresMs - nowMs) / 1000)) : 0;

  return {
    publicOrderId: row.public_order_id,
    publicNodeId: row.public_node_id,
    nodeNumber: row.node_number,
    amountUsd: Number(row.amount_usd),
    currency: row.currency,
    status: row.status,
    paymentMethod: row.payment_method,
    paymentReference: row.payment_reference,
    reservedAt: row.reserved_at.toISOString(),
    expiresAt: row.expires_at.toISOString(),
    completedAt: row.completed_at ? row.completed_at.toISOString() : null,
    cancelledAt: row.cancelled_at ? row.cancelled_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
    secondsRemaining,
  };
}

/**
 * Purchase and activate a Genesis Node using the user's credited deposit balance (USDT/BNB).
 * Deducts the $1,000 USD node price from deposit balance and settles node activation atomically.
 */
export async function purchaseNodeWithDepositBalance(
  userId: string,
  preferredAsset: 'USDT' | 'BNB' = 'USDT'
): Promise<{
  order: SafeNodeOrder;
  node: { publicNodeId: string; nodeNumber: number; status: string; activatedAt: string };
  depositDeducted: number;
  remainingDepositBalance: number;
}> {
  const db = await getDb();

  return await db.transaction(async (trx) => {
    try {
      // Lock user row to serialize concurrent purchase attempts
      await trx.query(`SELECT id FROM users WHERE id = $1 FOR UPDATE`, [userId]);

      // 1. Get Node Price
      const nodePrice = await getNodeBasePrice(trx); // Default $1,000

      // 2. Compute User's Unified Spendable Balance using trx client
      const { syncUserLedger } = await import('./walletLedgerService');
      await syncUserLedger(userId, trx);

      let availableDepositBalance = 0;
      if (preferredAsset === 'USDT') {
        const balRes = await trx.query<{ available_balance: string | number }>(
          `
          SELECT 
            COALESCE(SUM(CASE 
              WHEN entry_type = 'CREDIT' THEN amount 
              WHEN entry_type = 'DEBIT' THEN -amount 
              WHEN entry_type = 'REVERSAL' AND source_type = 'WITHDRAWAL' THEN amount 
              WHEN entry_type = 'REVERSAL' THEN -amount 
              ELSE 0 
            END), 0) AS available_balance
          FROM financial_ledger_entries
          WHERE user_id = $1 
            AND status = 'SETTLED' 
            AND (currency = 'USDT' OR currency = 'USD') 
          `,
          [userId]
        );
        availableDepositBalance = Math.max(0, Number(balRes.rows[0]?.available_balance || 0));
      } else {
        const depositRes = await trx.query<{ total_credited: string | number }>(
          `
          SELECT COALESCE(SUM(amount), 0) AS total_credited
          FROM blockchain_deposits
          WHERE user_id = $1 AND status = 'CREDITED' AND asset = 'BNB'
          `,
          [userId]
        );
        const totalCreditedDeposits = Number(depositRes.rows[0]?.total_credited || 0);

        const debitsRes = await trx.query<{ total_debits: string | number }>(
          `
          SELECT COALESCE(SUM(amount), 0) AS total_debits
          FROM financial_ledger_entries
          WHERE user_id = $1 AND entry_type = 'DEBIT' AND source_type = 'NODE_PURCHASE' AND currency = 'BNB'
          `,
          [userId]
        );
        const totalNodeDebits = Number(debitsRes.rows[0]?.total_debits || 0);
        availableDepositBalance = Math.max(0, totalCreditedDeposits - totalNodeDebits);
      }

      if (availableDepositBalance < nodePrice) {
        const error: any = new Error(
          `Your current available balance is $${availableDepositBalance.toFixed(2)} ${preferredAsset}. You need $${nodePrice.toFixed(2)} ${preferredAsset} to activate a Genesis Node. Please deposit or add funds first.`
        );
        error.code = 'INSUFFICIENT_DEPOSIT_BALANCE';
        error.statusCode = 400;
        error.currentBalance = availableDepositBalance;
        error.requiredAmount = nodePrice;
        error.redirectToDeposit = true;
        throw error;
      }

      // 3. Create or find active reservation
      let reservation: { order: SafeNodeOrder; isExisting: boolean };
      try {
        reservation = await createNodeReservation(userId, `dep_node_${userId}_${uuidv4()}`, `DEPOSIT_${preferredAsset}`, trx);
      } catch (err: any) {
        const existingOrders = await getUserOrders(userId, trx);
        const pending = existingOrders.find((o) => o.status === 'PENDING' && o.secondsRemaining > 0);
        if (pending) {
          reservation = { order: pending, isExisting: true };
        } else {
          throw err;
        }
      }

      // 4. Record DEBIT in financial_ledger_entries for node purchase
      const debitTxnId = uuidv4();
      const publicTxnId = generateLedgerTransactionPublicId();

      await trx.query(
        `
        INSERT INTO financial_ledger_entries (
          id, public_txn_id, user_id, entry_type, source_type, source_id,
          source_ref, description, amount, currency, status, created_at
        )
        VALUES ($1, $2, $3, 'DEBIT', 'NODE_PURCHASE', $4, $5, $6, $7, $8, 'SETTLED', CURRENT_TIMESTAMP)
        `,
        [
          debitTxnId,
          publicTxnId,
          userId,
          reservation.order.id!,
          reservation.order.publicNodeId,
          `Genesis Node ${reservation.order.publicNodeId} purchase paid via ${preferredAsset} deposit balance`,
          nodePrice,
          preferredAsset,
        ]
      );

      // 5. Settle the reserved order to activate node
      const settlement = await settleNodeOrder(
        userId,
        reservation.order.publicOrderId,
        `DEPOSIT_BAL_PAYMENT_${preferredAsset}_${publicTxnId}`,
        trx
      );

      const newRemainingBalance = Math.max(0, availableDepositBalance - nodePrice);

      return {
        order: settlement.order,
        node: settlement.node,
        depositDeducted: nodePrice,
        remainingDepositBalance: newRemainingBalance,
      };
    } catch (innerErr) {
      console.error('[purchaseNodeWithDepositBalance Inner Error]', innerErr);
      throw innerErr;
    }
  });
}
