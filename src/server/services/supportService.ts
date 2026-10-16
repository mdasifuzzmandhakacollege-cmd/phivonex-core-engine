import { getDb, DatabaseClient } from '../db/db';
import { v4 as uuidv4 } from 'uuid';
import { notifySupportTicketCreated, notifySupportTicketUpdate } from './notificationService';
import { getWalletSummary } from './walletLedgerService';

export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED' | string;
export type TicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT' | string;
export type TicketCategory = string;

export interface SupportTicketMessage {
  id: string;
  ticketId: string;
  senderId: string;
  senderRole: 'USER' | 'ADMIN' | string;
  senderName?: string;
  senderPublicName?: string;
  message: string;
  createdAt: string;
}

export interface SupportTicket {
  id: string;
  publicTicketId: string;
  userId: string;
  userEmail?: string;
  userFullName?: string;
  subject: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  assignedAdminId: string | null;
  resolvedAt?: string | null;
  closedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  messages?: SupportTicketMessage[];
}

export interface SupportUserLiveData {
  userId: string;
  email: string;
  fullName: string;
  publicId: string;
  accountStatus: string;
  kycStatus?: string;
  availableBalanceUsdt: number;
  totalDepositedUsdt: number;
  totalWithdrawnUsdt: number;
  activeNodesCount: number;
  recentWithdrawals: Array<{
    id: string;
    publicWithdrawalId: string;
    publicId: string;
    amount: number;
    currency: string;
    status: string;
    destinationType: string;
    destinationReference: string;
    createdAt: string;
    txHash: string | null;
  }>;
  recentDeposits: Array<{
    id: string;
    publicDepositId: string;
    publicId: string;
    amount: number;
    asset: string;
    status: string;
    txHash: string | null;
    createdAt: string;
  }>;
  recentTransactions: Array<{
    id: string;
    publicTxnId: string;
    entryType: string;
    sourceType: string;
    amount: number;
    currency: string;
    status: string;
    description: string;
    createdAt: string;
  }>;
  supportTicketsCount: number;
}

function generateTicketPublicId(): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let rand = '';
  for (let i = 0; i < 6; i++) {
    rand += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `TCK-${rand}`;
}

/**
 * Creates a new support ticket and sends a confirmation notification.
 */
export async function createSupportTicket(params: {
  userId: string;
  subject: string;
  message?: string;
  userMessage?: string;
  category?: TicketCategory;
  priority?: TicketPriority;
  dbClient?: DatabaseClient;
}): Promise<SupportTicket> {
  const { userId, subject, category = 'GENERAL', priority = 'MEDIUM', dbClient } = params;
  const message = (params.message || params.userMessage || '').trim();
  const db = dbClient || (await getDb());

  const ticketId = uuidv4();
  const publicTicketId = generateTicketPublicId();
  const now = new Date();

  // Create ticket
  await db.query(
    `
    INSERT INTO support_tickets (
      id, public_ticket_id, user_id, subject, category, priority, status, created_at, updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, 'OPEN', $7, $7)
    `,
    [ticketId, publicTicketId, userId, subject.trim(), String(category).toUpperCase(), String(priority).toUpperCase(), now]
  );

  // Add initial message
  let messageId = uuidv4();
  if (message) {
    await db.query(
      `
      INSERT INTO support_ticket_messages (
        id, ticket_id, sender_id, sender_role, message, created_at
      )
      VALUES ($1, $2, $3, 'USER', $4, $5)
      `,
      [messageId, ticketId, userId, message, now]
    );
  }

  // Trigger notification
  try {
    await notifySupportTicketCreated({
      userId,
      ticketId,
      ticketPublicId: publicTicketId,
      subject,
      dbClient,
    });
  } catch (err) {
    console.warn('[SupportService] Failed to send ticket creation notification:', err);
  }

  return {
    id: ticketId,
    publicTicketId,
    userId,
    subject,
    category,
    priority,
    status: 'OPEN',
    assignedAdminId: null,
    resolvedAt: null,
    closedAt: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    messages: message
      ? [
          {
            id: messageId,
            ticketId,
            senderId: userId,
            senderRole: 'USER',
            senderName: 'You',
            senderPublicName: 'You',
            message,
            createdAt: now.toISOString(),
          },
        ]
      : [],
  };
}

/**
 * Get all tickets for a specific user.
 */
export async function getUserSupportTickets(userId: string): Promise<SupportTicket[]> {
  const db = await getDb();
  const ticketsRes = await db.query<{
    id: string;
    public_ticket_id: string;
    user_id: string;
    subject: string;
    category: string;
    priority: string;
    status: string;
    assigned_admin_id: string | null;
    created_at: Date;
    updated_at: Date;
  }>(
    `
    SELECT id, public_ticket_id, user_id, subject, category, priority, status, assigned_admin_id, created_at, updated_at
    FROM support_tickets
    WHERE user_id = $1
    ORDER BY created_at DESC
    `,
    [userId]
  );

  return ticketsRes.rows.map((row) => ({
    id: row.id,
    publicTicketId: row.public_ticket_id,
    userId: row.user_id,
    subject: row.subject,
    category: row.category,
    priority: row.priority,
    status: row.status,
    assignedAdminId: row.assigned_admin_id,
    resolvedAt: row.status === 'RESOLVED' ? new Date(row.updated_at).toISOString() : null,
    closedAt: row.status === 'CLOSED' ? new Date(row.updated_at).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  }));
}

export const getUserTickets = getUserSupportTickets;

/**
 * Get ticket details with all messages.
 */
export async function getSupportTicketDetails(ticketIdentifier: string, userId?: string): Promise<SupportTicket | null> {
  const db = await getDb();
  const ticketRes = await db.query<{
    id: string;
    public_ticket_id: string;
    user_id: string;
    subject: string;
    category: string;
    priority: string;
    status: string;
    assigned_admin_id: string | null;
    created_at: Date;
    updated_at: Date;
    user_email?: string;
    user_full_name?: string;
  }>(
    `
    SELECT t.id, t.public_ticket_id, t.user_id, t.subject, t.category, t.priority, t.status, 
           t.assigned_admin_id, t.created_at, t.updated_at,
           u.email AS user_email, u.full_name AS user_full_name
    FROM support_tickets t
    LEFT JOIN users u ON t.user_id = u.id
    WHERE (t.id::text = $1 OR t.public_ticket_id = $1)
    ${userId ? 'AND t.user_id = $2' : ''}
    LIMIT 1
    `,
    userId ? [ticketIdentifier, userId] : [ticketIdentifier]
  );

  if (ticketRes.rows.length === 0) return null;
  const t = ticketRes.rows[0];

  const messagesRes = await db.query<{
    id: string;
    ticket_id: string;
    sender_id: string;
    sender_role: string;
    message: string;
    created_at: Date;
    sender_name?: string;
  }>(
    `
    SELECT m.id, m.ticket_id, m.sender_id, m.sender_role, m.message, m.created_at,
           COALESCE(u.full_name, u.email, 'Admin') AS sender_name
    FROM support_ticket_messages m
    LEFT JOIN users u ON m.sender_id = u.id
    WHERE m.ticket_id = $1
    ORDER BY m.created_at ASC
    `,
    [t.id]
  );

  const messages: SupportTicketMessage[] = messagesRes.rows.map((m) => ({
    id: m.id,
    ticketId: m.ticket_id,
    senderId: m.sender_id,
    senderRole: m.sender_role as 'USER' | 'ADMIN',
    senderName: m.sender_name || (m.sender_role === 'ADMIN' ? 'Support Specialist' : 'User'),
    senderPublicName: m.sender_name || (m.sender_role === 'ADMIN' ? 'Support Specialist' : 'User'),
    message: m.message,
    createdAt: new Date(m.created_at).toISOString(),
  }));

  return {
    id: t.id,
    publicTicketId: t.public_ticket_id,
    userId: t.user_id,
    userEmail: t.user_email,
    userFullName: t.user_full_name,
    subject: t.subject,
    category: t.category,
    priority: t.priority,
    status: t.status,
    assignedAdminId: t.assigned_admin_id,
    resolvedAt: t.status === 'RESOLVED' ? new Date(t.updated_at).toISOString() : null,
    closedAt: t.status === 'CLOSED' ? new Date(t.updated_at).toISOString() : null,
    createdAt: new Date(t.created_at).toISOString(),
    updatedAt: new Date(t.updated_at).toISOString(),
    messages,
  };
}

export async function getTicketByPublicId(publicTicketId: string, userId?: string): Promise<SupportTicket | null> {
  return getSupportTicketDetails(publicTicketId, userId);
}

/**
 * Add a reply message to an existing ticket.
 */
export async function addTicketMessage(params: {
  ticketIdentifier?: string;
  publicTicketId?: string;
  ticketId?: string;
  senderId: string;
  senderRole: 'USER' | 'ADMIN' | string;
  message: string;
}): Promise<SupportTicketMessage> {
  const identifier = params.ticketIdentifier || params.publicTicketId || params.ticketId;
  if (!identifier) {
    throw new Error('Ticket identifier is required');
  }

  const { senderId, senderRole, message } = params;
  const db = await getDb();

  const ticket = await getSupportTicketDetails(identifier);
  if (!ticket) {
    throw new Error('Ticket not found');
  }

  const messageId = uuidv4();
  const now = new Date();

  await db.query(
    `
    INSERT INTO support_ticket_messages (id, ticket_id, sender_id, sender_role, message, created_at)
    VALUES ($1, $2, $3, $4, $5, $6)
    `,
    [messageId, ticket.id, senderId, senderRole, message.trim(), now]
  );

  // Update ticket updated_at and reopen if closed and replied by user
  const newStatus = senderRole === 'USER' && ticket.status === 'RESOLVED' ? 'OPEN' : ticket.status;
  await db.query(
    `
    UPDATE support_tickets 
    SET updated_at = $1, status = $2
    WHERE id = $3
    `,
    [now, newStatus, ticket.id]
  );

  if (senderRole === 'ADMIN') {
    try {
      await notifySupportTicketUpdate({
        userId: ticket.userId,
        ticketId: ticket.id,
        ticketPublicId: ticket.publicTicketId,
        subject: ticket.subject,
        status: newStatus,
        message: `Support replied to your ticket "${ticket.subject}" (${ticket.publicTicketId}).`,
      });
    } catch (err) {
      console.warn('[SupportService] Failed to send ticket update notification:', err);
    }
  }

  return {
    id: messageId,
    ticketId: ticket.id,
    senderId,
    senderRole,
    senderName: senderRole === 'ADMIN' ? 'Support Specialist' : 'User',
    senderPublicName: senderRole === 'ADMIN' ? 'Support Specialist' : 'User',
    message,
    createdAt: now.toISOString(),
  };
}

/**
 * Admin: Update ticket status (e.g. IN_PROGRESS, RESOLVED, CLOSED).
 */
export async function updateTicketStatus(params: {
  ticketIdentifier?: string;
  publicTicketId?: string;
  ticketId?: string;
  status: TicketStatus;
  adminId?: string;
  resolutionNote?: string;
}): Promise<SupportTicket> {
  const identifier = params.ticketIdentifier || params.publicTicketId || params.ticketId;
  if (!identifier) {
    throw new Error('Ticket identifier is required');
  }

  const { status, adminId } = params;
  const db = await getDb();

  const ticket = await getSupportTicketDetails(identifier);
  if (!ticket) {
    throw new Error('Ticket not found');
  }

  const now = new Date();
  await db.query(
    `
    UPDATE support_tickets
    SET status = $1, assigned_admin_id = COALESCE($2, assigned_admin_id), updated_at = $3
    WHERE id = $4
    `,
    [status, adminId || null, now, ticket.id]
  );

  try {
    await notifySupportTicketUpdate({
      userId: ticket.userId,
      ticketId: ticket.id,
      ticketPublicId: ticket.publicTicketId,
      subject: ticket.subject,
      status,
      message: `Your support ticket "${ticket.subject}" (${ticket.publicTicketId}) has been marked as ${status}.`,
    });
  } catch (err) {
    console.warn('[SupportService] Failed to notify status change:', err);
  }

  return (await getSupportTicketDetails(ticket.id))!;
}

/**
 * Admin: List all tickets across the platform.
 */
export async function getAllSupportTickets(filters?: {
  status?: TicketStatus;
  category?: TicketCategory;
}): Promise<SupportTicket[]> {
  const db = await getDb();
  let query = `
    SELECT t.id, t.public_ticket_id, t.user_id, t.subject, t.category, t.priority, t.status, 
           t.assigned_admin_id, t.created_at, t.updated_at,
           u.email AS user_email, u.full_name AS user_full_name
    FROM support_tickets t
    LEFT JOIN users u ON t.user_id = u.id
    WHERE 1=1
  `;
  const queryParams: any[] = [];

  if (filters?.status) {
    queryParams.push(filters.status);
    query += ` AND t.status = $${queryParams.length}`;
  }
  if (filters?.category) {
    queryParams.push(filters.category);
    query += ` AND t.category = $${queryParams.length}`;
  }

  query += ` ORDER BY t.updated_at DESC`;

  const res = await db.query<{
    id: string;
    public_ticket_id: string;
    user_id: string;
    subject: string;
    category: string;
    priority: string;
    status: string;
    assigned_admin_id: string | null;
    created_at: Date;
    updated_at: Date;
    user_email?: string;
    user_full_name?: string;
  }>(query, queryParams);

  return res.rows.map((row) => ({
    id: row.id,
    publicTicketId: row.public_ticket_id,
    userId: row.user_id,
    userEmail: row.user_email,
    userFullName: row.user_full_name,
    subject: row.subject,
    category: row.category,
    priority: row.priority,
    status: row.status,
    assignedAdminId: row.assigned_admin_id,
    resolvedAt: row.status === 'RESOLVED' ? new Date(row.updated_at).toISOString() : null,
    closedAt: row.status === 'CLOSED' ? new Date(row.updated_at).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  }));
}

export const getAdminTickets = getAllSupportTickets;

/**
 * Get comprehensive live user data snapshot for support operators.
 */
export async function getUserLiveDataForSupport(userId: string): Promise<SupportUserLiveData> {
  const db = await getDb();

  // 1. User base profile
  const userRes = await db.query<{
    id: string;
    email: string;
    full_name: string;
    public_id: string;
    status: string;
  }>(
    `SELECT id, email, full_name, public_id, status FROM users WHERE id = $1 LIMIT 1`,
    [userId]
  );

  if (userRes.rows.length === 0) {
    throw new Error('User not found');
  }
  const user = userRes.rows[0];

  // 2. Wallet balances
  const walletSummary = await getWalletSummary(userId).catch(() => ({
    availableBalance: 0,
    totalDeposited: 0,
    totalWithdrawn: 0,
  }));

  // 3. Active nodes count
  const nodesRes = await db.query<{ count: string | number }>(
    `SELECT COUNT(*) AS count FROM nodes WHERE owner_user_id = $1 AND status = 'ACTIVE'`,
    [userId]
  );
  const activeNodesCount = Number(nodesRes.rows[0]?.count || 0);

  // 4. Recent withdrawals
  const wRes = await db.query<{
    id: string;
    public_withdrawal_id: string;
    amount: string | number;
    currency: string;
    status: string;
    destination_type: string;
    destination_reference: string;
    created_at: Date;
    tx_hash: string | null;
  }>(
    `
    SELECT id, public_withdrawal_id, amount, currency, status, destination_type, destination_reference, created_at, NULL as tx_hash
    FROM withdrawals
    WHERE user_id = $1
    ORDER BY created_at DESC
    LIMIT 10
    `,
    [userId]
  );

  // 5. Recent deposits
  const dRes = await db.query<{
    id: string;
    amount: string | number;
    asset: string;
    status: string;
    tx_hash: string | null;
    created_at: Date;
  }>(
    `
    SELECT id, amount, asset, status, tx_hash, created_at
    FROM blockchain_deposits
    WHERE user_id = $1
    ORDER BY created_at DESC
    LIMIT 10
    `,
    [userId]
  );

  // 6. Recent ledger transactions
  const tRes = await db.query<{
    id: string;
    public_txn_id: string;
    entry_type: string;
    source_type: string;
    amount: string | number;
    currency: string;
    status: string;
    description: string;
    created_at: Date;
  }>(
    `
    SELECT id, public_txn_id, entry_type, source_type, amount, currency, status, description, created_at
    FROM financial_ledger_entries
    WHERE user_id = $1
    ORDER BY created_at DESC
    LIMIT 10
    `,
    [userId]
  );

  // 7. Support tickets count
  const tckRes = await db.query<{ count: string | number }>(
    `SELECT COUNT(*) AS count FROM support_tickets WHERE user_id = $1`,
    [userId]
  );
  const supportTicketsCount = Number(tckRes.rows[0]?.count || 0);

  return {
    userId: user.id,
    email: user.email,
    fullName: user.full_name,
    publicId: user.public_id,
    accountStatus: user.status || 'ACTIVE',
    kycStatus: 'VERIFIED',
    availableBalanceUsdt: walletSummary.availableBalance,
    totalDepositedUsdt: (walletSummary as any).totalDeposited || 0,
    totalWithdrawnUsdt: (walletSummary as any).totalWithdrawn || 0,
    activeNodesCount,
    recentWithdrawals: wRes.rows.map((w) => ({
      id: w.id,
      publicWithdrawalId: w.public_withdrawal_id,
      publicId: w.public_withdrawal_id,
      amount: Number(w.amount),
      currency: w.currency || 'USDT',
      status: w.status,
      destinationType: w.destination_type,
      destinationReference: w.destination_reference,
      createdAt: new Date(w.created_at).toISOString(),
      txHash: w.tx_hash,
    })),
    recentDeposits: dRes.rows.map((d) => ({
      id: d.id,
      publicDepositId: `DEP-${d.id.slice(0, 8)}`,
      publicId: `DEP-${d.id.slice(0, 8)}`,
      amount: Number(d.amount),
      asset: d.asset,
      status: d.status,
      txHash: d.tx_hash,
      createdAt: new Date(d.created_at).toISOString(),
    })),
    recentTransactions: tRes.rows.map((t) => ({
      id: t.id,
      publicTxnId: t.public_txn_id,
      entryType: t.entry_type,
      sourceType: t.source_type,
      amount: Number(t.amount),
      currency: t.currency,
      status: t.status,
      description: t.description,
      createdAt: new Date(t.created_at).toISOString(),
    })),
    supportTicketsCount,
  };
}
