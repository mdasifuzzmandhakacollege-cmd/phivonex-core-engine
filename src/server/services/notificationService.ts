import { EventEmitter } from 'events';
import { getDb, DatabaseClient } from '../db/db';
import { v4 as uuidv4 } from 'uuid';
import { generateNotificationPublicId } from '../utils/idGenerator';

export const notificationEmitter = new EventEmitter();
notificationEmitter.setMaxListeners(1000);

export type NotificationType =
  | 'NODE_ACTIVATED'
  | 'REFERRAL_EARNED'
  | 'MATCHING_EARNED'
  | 'PROMOTION_EARNED'
  | 'PHIVO_REWARD'
  | 'PHIVO_SWAP_COMPLETED'
  | 'USDT_DEPOSIT_CONFIRMED'
  | 'WITHDRAWAL_STATUS'
  | 'SECURITY_ALERT'
  | 'SUPPORT_TICKET_CREATED'
  | 'SUPPORT_TICKET_UPDATE';

export interface CreateNotificationParams {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  sourceType?: string;
  sourceId?: string;
  dbClient?: DatabaseClient;
}

export interface PublicNotification {
  id: string; // public_notification_id
  type: NotificationType;
  title: string;
  message: string;
  readAt: string | null;
  createdAt: string;
}

/**
 * Creates a persistent notification for a user.
 * Strictly idempotent: prevents duplicate notifications for the same user + sourceType + sourceId + type.
 */
export async function createNotification(params: CreateNotificationParams): Promise<PublicNotification | null> {
  const { userId, type, title, message, sourceType, sourceId, dbClient } = params;
  if (!userId || !type || !title || !message) {
    return null;
  }

  const db = dbClient || (await getDb());
  const id = uuidv4();
  const publicId = generateNotificationPublicId();

  try {
    let query: string;
    let queryParams: any[];

    if (sourceType && sourceId) {
      query = `
        INSERT INTO notifications (
          id, public_notification_id, user_id, type, title, message, source_type, source_id, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
        ON CONFLICT (user_id, source_type, source_id, type) WHERE source_type IS NOT NULL AND source_id IS NOT NULL DO NOTHING
        RETURNING public_notification_id, type, title, message, read_at, created_at
      `;
      queryParams = [id, publicId, userId, type, title, message, sourceType, sourceId];
    } else {
      query = `
        INSERT INTO notifications (
          id, public_notification_id, user_id, type, title, message, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
        RETURNING public_notification_id, type, title, message, read_at, created_at
      `;
      queryParams = [id, publicId, userId, type, title, message];
    }

    const res = await db.query<{
      public_notification_id: string;
      type: NotificationType;
      title: string;
      message: string;
      read_at: Date | null;
      created_at: Date;
    }>(query, queryParams);

    if (res.rows.length === 0) {
      // Idempotency prevented duplicate insertion
      return null;
    }

    const row = res.rows[0];

    // Trigger Web Push Notification via Firebase Cloud Messaging (FCM)
    try {
      const { sendPushNotificationToUser } = await import('./webPushServerService');
      sendPushNotificationToUser(userId, {
        title: row.title,
        body: row.message,
        data: {
          notificationId: row.public_notification_id,
          type: row.type,
          url: '/app/notifications',
        },
      }).catch((pushErr) => {
        console.warn('[NotificationService] Web Push delivery warning:', pushErr?.message);
      });
    } catch {
      // Ignore background push errors
    }

    const createdNotification: PublicNotification = {
      id: row.public_notification_id,
      type: row.type,
      title: row.title,
      message: row.message,
      readAt: row.read_at ? new Date(row.read_at).toISOString() : null,
      createdAt: new Date(row.created_at).toISOString(),
    };

    // Emit real-time event scoped to authenticated user ID
    try {
      notificationEmitter.emit(`notification:${userId}`, createdNotification);
    } catch {
      // Ignore SSE listener errors
    }

    return createdNotification;
  } catch (err) {
    console.error('[NotificationService] Error creating notification:', err);
    return null;
  }
}

/**
 * Retrieves paginated notifications for an authenticated user with strict user isolation.
 */
export async function getUserNotifications(
  userId: string,
  options?: {
    limit?: number;
    offset?: number;
    unreadOnly?: boolean;
    type?: string;
  }
): Promise<{
  notifications: PublicNotification[];
  total: number;
  unreadCount: number;
}> {
  const db = await getDb();
  const limit = Math.max(1, Math.min(100, options?.limit || 20));
  const offset = Math.max(0, options?.offset || 0);

  const filterClauses: string[] = ['user_id = $1'];
  const queryParams: any[] = [userId];

  if (options?.unreadOnly) {
    filterClauses.push('read_at IS NULL');
  }

  if (options?.type) {
    queryParams.push(options.type);
    filterClauses.push(`type = $${queryParams.length}`);
  }

  const whereSql = filterClauses.join(' AND ');

  // Get total matching
  const countRes = await db.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM notifications WHERE ${whereSql}`,
    queryParams
  );
  const total = parseInt(countRes.rows[0]?.count || '0', 10);

  // Get total unread count for the user
  const unreadRes = await db.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND read_at IS NULL`,
    [userId]
  );
  const unreadCount = parseInt(unreadRes.rows[0]?.count || '0', 10);

  // Fetch paginated rows
  const listParams = [...queryParams, limit, offset];
  const listRes = await db.query<{
    public_notification_id: string;
    type: NotificationType;
    title: string;
    message: string;
    read_at: Date | null;
    created_at: Date;
  }>(
    `
    SELECT public_notification_id, type, title, message, read_at, created_at
    FROM notifications
    WHERE ${whereSql}
    ORDER BY created_at DESC
    LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
    `,
    listParams
  );

  const notifications: PublicNotification[] = listRes.rows.map((row) => ({
    id: row.public_notification_id,
    type: row.type,
    title: row.title,
    message: row.message,
    readAt: row.read_at ? new Date(row.read_at).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString(),
  }));

  return {
    notifications,
    total,
    unreadCount,
  };
}

/**
 * Returns only the unread count for a given user.
 */
export async function getUnreadNotificationCount(userId: string): Promise<number> {
  const db = await getDb();
  const res = await db.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND read_at IS NULL`,
    [userId]
  );
  return parseInt(res.rows[0]?.count || '0', 10);
}

/**
 * Marks a specific notification as read.
 * Strict user isolation: user can only mark their own notification.
 */
export async function markNotificationAsRead(userId: string, publicNotificationId: string): Promise<boolean> {
  if (!userId || !publicNotificationId) return false;
  const db = await getDb();
  const res = await db.query<{ id: string }>(
    `
    UPDATE notifications
    SET read_at = CURRENT_TIMESTAMP
    WHERE public_notification_id = $1 AND user_id = $2 AND read_at IS NULL
    RETURNING id
    `,
    [publicNotificationId, userId]
  );
  return res.rows.length > 0;
}

/**
 * Marks all unread notifications for a user as read.
 */
export async function markAllNotificationsAsRead(userId: string): Promise<number> {
  if (!userId) return 0;
  const db = await getDb();
  const res = await db.query<{ id: string }>(
    `
    UPDATE notifications
    SET read_at = CURRENT_TIMESTAMP
    WHERE user_id = $1 AND read_at IS NULL
    RETURNING id
    `,
    [userId]
  );
  return res.rows.length;
}

/**
 * Deletes a specific notification for an authenticated user with strict user isolation.
 */
export async function deleteNotification(userId: string, publicNotificationId: string): Promise<boolean> {
  if (!userId || !publicNotificationId) return false;
  const db = await getDb();
  const res = await db.query<{ id: string }>(
    `
    DELETE FROM notifications
    WHERE public_notification_id = $1 AND user_id = $2
    RETURNING id
    `,
    [publicNotificationId, userId]
  );
  return res.rows.length > 0;
}

/**
 * Deletes notifications for an authenticated user (all or read-only).
 */
export async function deleteAllNotifications(
  userId: string,
  options?: { readOnly?: boolean }
): Promise<number> {
  if (!userId) return 0;
  const db = await getDb();
  const query = options?.readOnly
    ? `DELETE FROM notifications WHERE user_id = $1 AND read_at IS NOT NULL RETURNING id`
    : `DELETE FROM notifications WHERE user_id = $1 RETURNING id`;
  const res = await db.query<{ id: string }>(query, [userId]);
  return res.rows.length;
}

// ============================================================================
// DOMAIN-SPECIFIC NOTIFICATION HELPERS (FOR REAL PHIVONEX EVENTS)
// ============================================================================

export async function notifyNodeActivated(params: {
  userId: string;
  nodeNumber: number;
  orderPublicId?: string;
  sourceId: string;
  dbClient?: DatabaseClient;
}): Promise<PublicNotification | null> {
  return createNotification({
    userId: params.userId,
    type: 'NODE_ACTIVATED',
    title: 'Genesis Node Activated',
    message: `Your Genesis Node #${params.nodeNumber} is now ACTIVE and operational in the PHIVONEX ecosystem.`,
    sourceType: 'NODE_ORDER',
    sourceId: params.sourceId,
    dbClient: params.dbClient,
  });
}

export async function notifyReferralEarned(params: {
  userId: string;
  amountUsd: number;
  buyerPublicId?: string;
  commissionId: string;
}): Promise<PublicNotification | null> {
  const buyerRef = params.buyerPublicId ? ` from operator ${params.buyerPublicId}` : '';
  return createNotification({
    userId: params.userId,
    type: 'REFERRAL_EARNED',
    title: 'Referral Commission Earned',
    message: `You earned +$${params.amountUsd.toFixed(2)} USDT direct referral commission${buyerRef}.`,
    sourceType: 'REFERRAL_COMMISSION',
    sourceId: params.commissionId,
  });
}

export async function notifyMatchingEarned(params: {
  userId: string;
  bonusUsd: number;
  settlementId: string;
}): Promise<PublicNotification | null> {
  return createNotification({
    userId: params.userId,
    type: 'MATCHING_EARNED',
    title: 'Binary Matching Bonus Earned',
    message: `You earned +$${params.bonusUsd.toFixed(2)} USDT from the binary matching cycle settlement.`,
    sourceType: 'MATCHING_BONUS',
    sourceId: params.settlementId,
  });
}

export async function notifyPromotionEarned(params: {
  userId: string;
  bonusUsd: number;
  milestoneTitle: string;
  bonusId: string;
}): Promise<PublicNotification | null> {
  return createNotification({
    userId: params.userId,
    type: 'PROMOTION_EARNED',
    title: 'Promotion Reward Earned',
    message: `Congratulations! You unlocked the ${params.milestoneTitle} milestone and received +$${params.bonusUsd.toFixed(2)} USDT.`,
    sourceType: 'PROMOTION_BONUS',
    sourceId: params.bonusId,
  });
}

export async function notifyPhivoReward(params: {
  userId: string;
  amountPhivo: number;
  rewardId: string;
}): Promise<PublicNotification | null> {
  return createNotification({
    userId: params.userId,
    type: 'PHIVO_REWARD',
    title: 'PHIVO Mining Reward Accrued',
    message: `You received a mining reward of +${params.amountPhivo.toFixed(4)} PHIVO from your Genesis Nodes.`,
    sourceType: 'NODE_REWARD',
    sourceId: params.rewardId,
  });
}

export async function notifyPhivoSwapCompleted(params: {
  userId: string;
  coinAmount: number;
  usdtAmount: number;
  rateUsdt: number;
  swapId: string;
}): Promise<PublicNotification | null> {
  return createNotification({
    userId: params.userId,
    type: 'PHIVO_SWAP_COMPLETED',
    title: 'PHIVO → USDT Swap Completed',
    message: `Successfully swapped ${params.coinAmount.toFixed(4)} PHIVO into $${params.usdtAmount.toFixed(2)} USDT at $${params.rateUsdt.toFixed(4)} per PHIVO.`,
    sourceType: 'COIN_SWAP',
    sourceId: params.swapId,
  });
}

export async function notifyUsdtDepositConfirmed(params: {
  userId: string;
  amountUsdt: number;
  depositId: string;
  txHash?: string;
}): Promise<PublicNotification | null> {
  const hashNote = params.txHash ? ` (Tx: ${params.txHash.slice(0, 10)}...)` : '';
  return createNotification({
    userId: params.userId,
    type: 'USDT_DEPOSIT_CONFIRMED',
    title: 'USDT Deposit Confirmed',
    message: `Your on-chain deposit of $${params.amountUsdt.toFixed(2)} USDT has been confirmed on BNB Smart Chain${hashNote}.`,
    sourceType: 'BLOCKCHAIN_DEPOSIT',
    sourceId: params.depositId,
  });
}

export async function notifyWithdrawalStatus(params: {
  userId: string;
  amountUsdt: number;
  status: string;
  withdrawalId: string;
  reason?: string;
  dbClient?: DatabaseClient;
}): Promise<PublicNotification | null> {
  let title = 'Withdrawal Status Updated';
  let message = `Your withdrawal request of $${params.amountUsdt.toFixed(2)} USDT status is now ${params.status}.`;

  if (params.status === 'PENDING') {
    title = 'Withdrawal Request Submitted';
    message = `Your withdrawal request of $${params.amountUsdt.toFixed(2)} USDT has been submitted for processing.`;
  } else if (params.status === 'APPROVED') {
    title = 'Withdrawal Request Approved';
    message = `Your withdrawal of $${params.amountUsdt.toFixed(2)} USDT has been approved and queued for blockchain disbursement.`;
  } else if (params.status === 'COMPLETED') {
    title = 'Withdrawal Disbursed';
    message = `Your withdrawal of $${params.amountUsdt.toFixed(2)} USDT has been successfully completed on-chain.`;
  } else if (params.status === 'REJECTED') {
    title = 'Withdrawal Rejected';
    message = `Your withdrawal of $${params.amountUsdt.toFixed(2)} USDT was rejected${params.reason ? `: ${params.reason}` : '.'} Funds have been refunded to your ledger.`;
  }

  return createNotification({
    userId: params.userId,
    type: 'WITHDRAWAL_STATUS',
    title,
    message,
    sourceType: 'WITHDRAWAL',
    sourceId: `${params.withdrawalId}_${params.status}`,
    dbClient: params.dbClient,
  });
}

export async function notifySecurityAlert(params: {
  userId: string;
  title: string;
  message: string;
  sourceId?: string;
}): Promise<PublicNotification | null> {
  return createNotification({
    userId: params.userId,
    type: 'SECURITY_ALERT',
    title: params.title || 'Security Alert',
    message: params.message,
    sourceType: 'SECURITY',
    sourceId: params.sourceId,
  });
}

export async function notifySupportTicketCreated(params: {
  userId: string;
  ticketId: string;
  ticketPublicId?: string;
  subject: string;
  dbClient?: DatabaseClient;
}): Promise<PublicNotification | null> {
  return createNotification({
    userId: params.userId,
    type: 'SUPPORT_TICKET_CREATED',
    title: 'Support Ticket Received',
    message: `Your support ticket "${params.subject}" (${params.ticketPublicId || params.ticketId}) has been created. Our team will review it shortly.`,
    sourceType: 'SUPPORT_TICKET',
    sourceId: params.ticketId,
    dbClient: params.dbClient,
  });
}

export async function notifySupportTicketUpdate(params: {
  userId: string;
  ticketId: string;
  ticketPublicId?: string;
  subject?: string;
  status: string;
  message?: string;
  dbClient?: DatabaseClient;
}): Promise<PublicNotification | null> {
  return createNotification({
    userId: params.userId,
    type: 'SUPPORT_TICKET_UPDATE',
    title: 'Support Ticket Updated',
    message: params.message || `Your support ticket (${params.ticketPublicId || params.ticketId}) status has been updated to ${params.status}.`,
    sourceType: 'SUPPORT_TICKET',
    sourceId: `${params.ticketId}_${params.status}_${Date.now()}`,
    dbClient: params.dbClient,
  });
}

