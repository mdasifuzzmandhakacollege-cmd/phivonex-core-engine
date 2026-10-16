import { getDb } from '../db/db';
import { v4 as uuidv4 } from 'uuid';
import { GENESIS_NODE_CAP } from '../../config/nodeConfig';
import { generateLedgerTransactionPublicId } from '../utils/idGenerator';
import { getWalletSummary } from './walletLedgerService';
import { getUserCoinBalance } from './coinSwapService';
import { createNotification, notificationEmitter } from './notificationService';

export interface AdminSummaryMetrics {
  totalUsers: number;
  activeUsers: number;
  genesisNodeCap: number;
  activeNodes: number;
  availableNodes: number;
  reservedNodes: number;
  retiredNodes: number;
  totalOrders: number;
  completedOrders: number;
  referralCommissionsTotal: number;
  matchingSettlementsTotal: number;
  promotionBonusesTotal: number;
  ledgerTransactionsCount: number;
  pendingWithdrawalsCount: number;
  pendingWithdrawalsAmount: number;
  approvedWithdrawalsCount: number;
  approvedWithdrawalsAmount: number;
  processingWithdrawalsCount: number;
  processingWithdrawalsAmount: number;
  completedWithdrawalsCount: number;
  completedWithdrawalsTotal: number;
  rejectedWithdrawalsCount: number;
  rejectedWithdrawalsAmount: number;
  failedWithdrawalsCount: number;
  failedWithdrawalsAmount: number;
  totalWithdrawalsAmount: number;
  updatedAt: string;
}

export interface AdminUserItem {
  id: string;
  publicId: string;
  fullName: string;
  email: string;
  phone: string | null;
  country: string;
  status: string;
  role: string;
  emailVerified: boolean;
  createdAt: string;
  sponsorPublicId: string | null;
  nodeCount: number;
}

export interface AdminAuditLogRecord {
  id: string;
  adminUserId: string | null;
  adminPublicId: string;
  action: string;
  targetType: string;
  targetId: string;
  details: string;
  metadata: any;
  ipAddress: string | null;
  createdAt: string;
}

/**
 * Audit Logger: Logs every administrative action with actor identity, action type, target, and timestamp.
 */
export async function logAdminAction(params: {
  adminUserId?: string | null;
  adminPublicId: string;
  action: string;
  targetType: string;
  targetId: string;
  details: string;
  metadata?: Record<string, any>;
  ipAddress?: string;
}): Promise<void> {
  try {
    const db = await getDb();
    const id = uuidv4();
    const metaStr = params.metadata ? JSON.stringify(params.metadata) : null;

    await db.query(
      `
      INSERT INTO admin_audit_logs (
        id, admin_user_id, admin_public_id, action,
        target_type, target_id, details, metadata, ip_address, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
      `,
      [
        id,
        params.adminUserId || null,
        params.adminPublicId || 'SYSTEM_ADMIN',
        params.action,
        params.targetType,
        params.targetId,
        params.details,
        metaStr,
        params.ipAddress || null,
      ]
    );
  } catch (err) {
    console.error('[Admin Audit Log Error] Failed to write audit record:', err);
  }
}

/**
 * Fetch real system-wide summary metrics for the Admin Dashboard.
 */
export async function getAdminSummaryMetrics(): Promise<AdminSummaryMetrics> {
  const db = await getDb();

  const [
    usersRes,
    nodesRes,
    ordersRes,
    commissionsRes,
    matchingRes,
    promotionsRes,
    ledgerRes,
    withdrawalsRes,
  ] = await Promise.all([
    db.query(`
      SELECT 
        COUNT(*)::int AS total_users,
        COUNT(CASE WHEN status = 'ACTIVE' THEN 1 END)::int AS active_users
      FROM users
    `),
    db.query(`
      SELECT 
        COUNT(CASE WHEN status = 'ACTIVE' THEN 1 END)::int AS active_nodes,
        COUNT(CASE WHEN status = 'AVAILABLE' THEN 1 END)::int AS available_nodes,
        COUNT(CASE WHEN status = 'RESERVED' THEN 1 END)::int AS reserved_nodes,
        COUNT(CASE WHEN status = 'RETIRED' THEN 1 END)::int AS retired_nodes
      FROM nodes
    `),
    db.query(`
      SELECT 
        COUNT(*)::int AS total_orders,
        COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END)::int AS completed_orders
      FROM node_orders
    `),
    db.query(`
      SELECT COALESCE(SUM(amount_usd), 0)::float AS total
      FROM referral_commissions WHERE status = 'EARNED'
    `),
    db.query(`
      SELECT COALESCE(SUM(total_bonus_usd), 0)::float AS total
      FROM binary_matching_settlements WHERE status = 'COMPLETED'
    `),
    db.query(`
      SELECT COALESCE(SUM(amount_usd), 0)::float AS total
      FROM promotion_bonuses WHERE status = 'EARNED'
    `),
    db.query(`
      SELECT COUNT(*)::int AS count FROM financial_ledger_entries
    `),
    db.query(`
      SELECT 
        COUNT(CASE WHEN status = 'PENDING' THEN 1 END)::int AS pending_count,
        COUNT(CASE WHEN status = 'APPROVED' THEN 1 END)::int AS approved_count,
        COUNT(CASE WHEN status = 'PROCESSING' THEN 1 END)::int AS processing_count,
        COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END)::int AS completed_count,
        COUNT(CASE WHEN status = 'REJECTED' THEN 1 END)::int AS rejected_count,
        COUNT(CASE WHEN status = 'FAILED' THEN 1 END)::int AS failed_count,
        COALESCE(SUM(amount), 0)::float AS total_withdrawal_amount,
        COALESCE(SUM(CASE WHEN status = 'PENDING' THEN amount ELSE 0 END), 0)::float AS pending_amount,
        COALESCE(SUM(CASE WHEN status = 'APPROVED' THEN amount ELSE 0 END), 0)::float AS approved_amount,
        COALESCE(SUM(CASE WHEN status = 'PROCESSING' THEN amount ELSE 0 END), 0)::float AS processing_amount,
        COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN amount ELSE 0 END), 0)::float AS completed_amount,
        COALESCE(SUM(CASE WHEN status = 'REJECTED' THEN amount ELSE 0 END), 0)::float AS rejected_amount,
        COALESCE(SUM(CASE WHEN status = 'FAILED' THEN amount ELSE 0 END), 0)::float AS failed_amount
      FROM withdrawals
    `),
  ]);

  const uRow = usersRes.rows[0] || {};
  const nRow = nodesRes.rows[0] || {};
  const oRow = ordersRes.rows[0] || {};
  const wRow = withdrawalsRes.rows[0] || {};

  return {
    totalUsers: Number(uRow.total_users || 0),
    activeUsers: Number(uRow.active_users || 0),
    genesisNodeCap: GENESIS_NODE_CAP,
    activeNodes: Number(nRow.active_nodes || 0),
    availableNodes: Number(nRow.available_nodes || 0),
    reservedNodes: Number(nRow.reserved_nodes || 0),
    retiredNodes: Number(nRow.retired_nodes || 0),
    totalOrders: Number(oRow.total_orders || 0),
    completedOrders: Number(oRow.completed_orders || 0),
    referralCommissionsTotal: Number(commissionsRes.rows[0]?.total || 0),
    matchingSettlementsTotal: Number(matchingRes.rows[0]?.total || 0),
    promotionBonusesTotal: Number(promotionsRes.rows[0]?.total || 0),
    ledgerTransactionsCount: Number(ledgerRes.rows[0]?.count || 0),
    pendingWithdrawalsCount: Number(wRow.pending_count || 0),
    pendingWithdrawalsAmount: Number(wRow.pending_amount || 0),
    approvedWithdrawalsCount: Number(wRow.approved_count || 0),
    approvedWithdrawalsAmount: Number(wRow.approved_amount || 0),
    processingWithdrawalsCount: Number(wRow.processing_count || 0),
    processingWithdrawalsAmount: Number(wRow.processing_amount || 0),
    completedWithdrawalsCount: Number(wRow.completed_count || 0),
    completedWithdrawalsTotal: Number(wRow.completed_amount || 0),
    rejectedWithdrawalsCount: Number(wRow.rejected_count || 0),
    rejectedWithdrawalsAmount: Number(wRow.rejected_amount || 0),
    failedWithdrawalsCount: Number(wRow.failed_count || 0),
    failedWithdrawalsAmount: Number(wRow.failed_amount || 0),
    totalWithdrawalsAmount: Number(wRow.total_withdrawal_amount || 0),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Fetch paginated users list with privacy-safe profile fields for Admin View.
 * Password hashes and auth secrets are strictly excluded.
 */
export async function getAdminUsersList(
  page = 1,
  limit = 20,
  search?: string,
  statusFilter?: string
): Promise<{ users: AdminUserItem[]; pagination: { page: number; limit: number; totalCount: number; totalPages: number } }> {
  const db = await getDb();
  const safePage = Math.max(1, page);
  const safeLimit = Math.min(100, Math.max(1, limit));
  const offset = (safePage - 1) * safeLimit;

  let whereClauses = ['1=1'];
  let queryParams: any[] = [];
  let paramIdx = 1;

  if (statusFilter && statusFilter !== 'ALL' && statusFilter !== 'all') {
    whereClauses.push(`u.status = $${paramIdx}`);
    queryParams.push(statusFilter.toUpperCase());
    paramIdx++;
  }

  if (search && search.trim()) {
    const q = `%${search.trim().toLowerCase()}%`;
    whereClauses.push(`(LOWER(u.full_name) LIKE $${paramIdx} OR LOWER(u.email) LIKE $${paramIdx} OR LOWER(u.public_id) LIKE $${paramIdx})`);
    queryParams.push(q);
    paramIdx++;
  }

  const whereSql = whereClauses.join(' AND ');

  const countRes = await db.query<{ count: string | number }>(
    `SELECT COUNT(*)::int AS count FROM users u WHERE ${whereSql}`,
    queryParams
  );
  const totalCount = Number(countRes.rows[0]?.count || 0);

  const txQueryParams = [...queryParams, safeLimit, offset];
  const listRes = await db.query<any>(
    `
    SELECT 
      u.id,
      u.public_id,
      u.full_name,
      u.email,
      u.phone,
      u.country,
      u.status,
      COALESCE(u.role, 'USER') AS role,
      u.email_verified_at,
      u.created_at,
      sp.public_id AS sponsor_public_id,
      (SELECT COUNT(*)::int FROM nodes n WHERE n.owner_user_id = u.id AND n.status = 'ACTIVE') AS node_count
    FROM users u
    LEFT JOIN user_referrals ur ON u.id = ur.user_id
    LEFT JOIN users sp ON ur.sponsor_user_id = sp.id
    WHERE ${whereSql}
    ORDER BY u.created_at DESC
    LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
    `,
    txQueryParams
  );

  const totalPages = Math.ceil(totalCount / safeLimit) || 1;

  const users: AdminUserItem[] = listRes.rows.map((row) => ({
    id: row.id,
    publicId: row.public_id || 'PHX-USER',
    fullName: row.full_name,
    email: row.email,
    phone: row.phone || null,
    country: row.country,
    status: row.status,
    role: row.role || 'USER',
    emailVerified: !!row.email_verified_at,
    createdAt: new Date(row.created_at).toISOString(),
    sponsorPublicId: row.sponsor_public_id || null,
    nodeCount: Number(row.node_count || 0),
  }));

  return {
    users,
    pagination: {
      page: safePage,
      limit: safeLimit,
      totalCount,
      totalPages,
    },
  };
}

/**
 * Fetch paginated nodes inventory list for Admin View.
 */
export async function getAdminNodesList(
  page = 1,
  limit = 20,
  statusFilter?: string,
  search?: string
): Promise<{ nodes: any[]; pagination: { page: number; limit: number; totalCount: number; totalPages: number } }> {
  const db = await getDb();
  const safePage = Math.max(1, page);
  const safeLimit = Math.min(100, Math.max(1, limit));
  const offset = (safePage - 1) * safeLimit;

  let whereClauses = ['1=1'];
  let queryParams: any[] = [];
  let paramIdx = 1;

  if (statusFilter && statusFilter !== 'ALL' && statusFilter !== 'all') {
    whereClauses.push(`n.status = $${paramIdx}`);
    queryParams.push(statusFilter.toUpperCase());
    paramIdx++;
  }

  if (search && search.trim()) {
    const q = `%${search.trim().toLowerCase()}%`;
    whereClauses.push(`(LOWER(n.public_node_id) LIKE $${paramIdx} OR LOWER(u.public_id) LIKE $${paramIdx} OR LOWER(u.full_name) LIKE $${paramIdx})`);
    queryParams.push(q);
    paramIdx++;
  }

  const whereSql = whereClauses.join(' AND ');

  const countRes = await db.query<{ count: string | number }>(
    `SELECT COUNT(*)::int AS count FROM nodes n LEFT JOIN users u ON n.owner_user_id = u.id WHERE ${whereSql}`,
    queryParams
  );
  const totalCount = Number(countRes.rows[0]?.count || 0);

  const txQueryParams = [...queryParams, safeLimit, offset];
  const listRes = await db.query<any>(
    `
    SELECT 
      n.id,
      n.node_number,
      n.public_node_id,
      n.status,
      n.reserved_at,
      n.activated_at,
      n.created_at,
      u.public_id AS owner_public_id,
      u.full_name AS owner_name
    FROM nodes n
    LEFT JOIN users u ON n.owner_user_id = u.id
    WHERE ${whereSql}
    ORDER BY n.node_number ASC
    LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
    `,
    txQueryParams
  );

  const totalPages = Math.ceil(totalCount / safeLimit) || 1;

  return {
    nodes: listRes.rows.map((r) => ({
      id: r.id,
      nodeNumber: r.node_number,
      publicNodeId: r.public_node_id,
      status: r.status,
      ownerPublicId: r.owner_public_id || null,
      ownerName: r.owner_name || null,
      reservedAt: r.reserved_at ? new Date(r.reserved_at).toISOString() : null,
      activatedAt: r.activated_at ? new Date(r.activated_at).toISOString() : null,
      createdAt: new Date(r.created_at).toISOString(),
    })),
    pagination: {
      page: safePage,
      limit: safeLimit,
      totalCount,
      totalPages,
    },
  };
}

/**
 * Fetch paginated node orders list for Admin View.
 */
export async function getAdminOrdersList(
  page = 1,
  limit = 20,
  statusFilter?: string,
  search?: string
): Promise<{ orders: any[]; pagination: { page: number; limit: number; totalCount: number; totalPages: number } }> {
  const db = await getDb();
  const safePage = Math.max(1, page);
  const safeLimit = Math.min(100, Math.max(1, limit));
  const offset = (safePage - 1) * safeLimit;

  let whereClauses = ['1=1'];
  let queryParams: any[] = [];
  let paramIdx = 1;

  if (statusFilter && statusFilter !== 'ALL' && statusFilter !== 'all') {
    whereClauses.push(`o.status = $${paramIdx}`);
    queryParams.push(statusFilter.toUpperCase());
    paramIdx++;
  }

  if (search && search.trim()) {
    const q = `%${search.trim().toLowerCase()}%`;
    whereClauses.push(`(LOWER(o.public_order_id) LIKE $${paramIdx} OR LOWER(u.public_id) LIKE $${paramIdx} OR LOWER(u.full_name) LIKE $${paramIdx})`);
    queryParams.push(q);
    paramIdx++;
  }

  const whereSql = whereClauses.join(' AND ');

  const countRes = await db.query<{ count: string | number }>(
    `SELECT COUNT(*)::int AS count FROM node_orders o LEFT JOIN users u ON o.user_id = u.id WHERE ${whereSql}`,
    queryParams
  );
  const totalCount = Number(countRes.rows[0]?.count || 0);

  const txQueryParams = [...queryParams, safeLimit, offset];
  const listRes = await db.query<any>(
    `
    SELECT 
      o.id,
      o.public_order_id,
      o.node_number,
      o.amount_usd,
      o.currency,
      o.status,
      o.payment_method,
      o.payment_reference,
      o.created_at,
      o.completed_at,
      u.public_id AS user_public_id,
      u.full_name AS user_name
    FROM node_orders o
    LEFT JOIN users u ON o.user_id = u.id
    WHERE ${whereSql}
    ORDER BY o.created_at DESC
    LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
    `,
    txQueryParams
  );

  const totalPages = Math.ceil(totalCount / safeLimit) || 1;

  return {
    orders: listRes.rows.map((r) => ({
      id: r.id,
      publicOrderId: r.public_order_id,
      nodeNumber: r.node_number,
      amountUsd: Number(r.amount_usd),
      currency: r.currency,
      status: r.status,
      paymentMethod: r.payment_method,
      paymentReference: r.payment_reference,
      userPublicId: r.user_public_id || null,
      userName: r.user_name || null,
      createdAt: new Date(r.created_at).toISOString(),
      completedAt: r.completed_at ? new Date(r.completed_at).toISOString() : null,
    })),
    pagination: {
      page: safePage,
      limit: safeLimit,
      totalCount,
      totalPages,
    },
  };
}

/**
 * Fetch system-wide withdrawals list for Admin View.
 */
export async function getAdminWithdrawalsList(
  page = 1,
  limit = 20,
  statusFilter?: string,
  search?: string
): Promise<{ withdrawals: any[]; pagination: { page: number; limit: number; totalCount: number; totalPages: number } }> {
  const db = await getDb();
  const safePage = Math.max(1, page);
  const safeLimit = Math.min(100, Math.max(1, limit));
  const offset = (safePage - 1) * safeLimit;

  let whereClauses = ['1=1'];
  let queryParams: any[] = [];
  let paramIdx = 1;

  if (statusFilter && statusFilter !== 'ALL' && statusFilter !== 'all') {
    whereClauses.push(`w.status = $${paramIdx}`);
    queryParams.push(statusFilter.toUpperCase());
    paramIdx++;
  }

  if (search && search.trim()) {
    const q = `%${search.trim().toLowerCase()}%`;
    whereClauses.push(`(LOWER(w.public_withdrawal_id) LIKE $${paramIdx} OR LOWER(u.public_id) LIKE $${paramIdx} OR LOWER(u.full_name) LIKE $${paramIdx} OR LOWER(w.destination_reference) LIKE $${paramIdx})`);
    queryParams.push(q);
    paramIdx++;
  }

  const whereSql = whereClauses.join(' AND ');

  const countRes = await db.query<{ count: string | number }>(
    `SELECT COUNT(*)::int AS count FROM withdrawals w LEFT JOIN users u ON w.user_id = u.id WHERE ${whereSql}`,
    queryParams
  );
  const totalCount = Number(countRes.rows[0]?.count || 0);

  const txQueryParams = [...queryParams, safeLimit, offset];
  const listRes = await db.query<any>(
    `
    SELECT 
      w.*,
      u.public_id AS user_public_id,
      u.full_name AS user_name,
      u.email AS user_email
    FROM withdrawals w
    LEFT JOIN users u ON w.user_id = u.id
    WHERE ${whereSql}
    ORDER BY w.created_at DESC
    LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
    `,
    txQueryParams
  );

  const totalPages = Math.ceil(totalCount / safeLimit) || 1;

  return {
    withdrawals: listRes.rows.map((r) => ({
      id: r.id,
      publicWithdrawalId: r.public_withdrawal_id,
      userId: r.user_id,
      userPublicId: r.user_public_id || 'PHX-USER',
      userName: r.user_name || 'Operator',
      userEmail: r.user_email || '',
      amount: Number(r.amount),
      currency: r.currency,
      destinationType: r.destination_type,
      destinationReference: r.destination_reference,
      status: r.status,
      requestedAt: r.requested_at ? new Date(r.requested_at).toISOString() : new Date(r.created_at).toISOString(),
      approvedAt: r.approved_at ? new Date(r.approved_at).toISOString() : null,
      rejectedAt: r.rejected_at ? new Date(r.rejected_at).toISOString() : null,
      completedAt: r.completed_at ? new Date(r.completed_at).toISOString() : null,
      cancelledAt: r.cancelled_at ? new Date(r.cancelled_at).toISOString() : null,
      failedAt: r.failed_at ? new Date(r.failed_at).toISOString() : null,
      rejectionReason: r.rejection_reason || null,
      createdAt: new Date(r.created_at).toISOString(),
      updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : new Date(r.created_at).toISOString(),
    })),
    pagination: {
      page: safePage,
      limit: safeLimit,
      totalCount,
      totalPages,
    },
  };
}

/**
 * Fetch read-only financial ledger transactions across all users for Admin Ledger Explorer.
 */
export async function getAdminTransactionsList(
  page = 1,
  limit = 20,
  typeFilter?: string,
  search?: string
): Promise<{ transactions: any[]; pagination: { page: number; limit: number; totalCount: number; totalPages: number } }> {
  const db = await getDb();
  const safePage = Math.max(1, page);
  const safeLimit = Math.min(100, Math.max(1, limit));
  const offset = (safePage - 1) * safeLimit;

  let whereClauses = ['1=1'];
  let queryParams: any[] = [];
  let paramIdx = 1;

  if (typeFilter && typeFilter !== 'ALL' && typeFilter !== 'all') {
    whereClauses.push(`f.source_type = $${paramIdx}`);
    queryParams.push(typeFilter.toUpperCase());
    paramIdx++;
  }

  if (search && search.trim()) {
    const q = `%${search.trim().toLowerCase()}%`;
    whereClauses.push(`(LOWER(f.public_txn_id) LIKE $${paramIdx} OR LOWER(u.public_id) LIKE $${paramIdx} OR LOWER(f.description) LIKE $${paramIdx} OR LOWER(f.source_ref) LIKE $${paramIdx})`);
    queryParams.push(q);
    paramIdx++;
  }

  const whereSql = whereClauses.join(' AND ');

  const countRes = await db.query<{ count: string | number }>(
    `SELECT COUNT(*)::int AS count FROM financial_ledger_entries f LEFT JOIN users u ON f.user_id = u.id WHERE ${whereSql}`,
    queryParams
  );
  const totalCount = Number(countRes.rows[0]?.count || 0);

  const txQueryParams = [...queryParams, safeLimit, offset];
  const listRes = await db.query<any>(
    `
    SELECT 
      f.*,
      u.public_id AS user_public_id,
      u.full_name AS user_name
    FROM financial_ledger_entries f
    LEFT JOIN users u ON f.user_id = u.id
    WHERE ${whereSql}
    ORDER BY f.created_at DESC
    LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
    `,
    txQueryParams
  );

  const totalPages = Math.ceil(totalCount / safeLimit) || 1;

  return {
    transactions: listRes.rows.map((r) => ({
      id: r.id,
      publicTxnId: r.public_txn_id,
      userId: r.user_id,
      userPublicId: r.user_public_id || 'PHX-USER',
      userName: r.user_name || 'Operator',
      entryType: r.entry_type,
      sourceType: r.source_type,
      sourceId: r.source_id,
      sourceRef: r.source_ref,
      description: r.description,
      amount: Number(r.amount),
      currency: r.currency,
      status: r.status,
      createdAt: new Date(r.created_at).toISOString(),
    })),
    pagination: {
      page: safePage,
      limit: safeLimit,
      totalCount,
      totalPages,
    },
  };
}

/**
 * Fetch admin audit action logs.
 */
export async function getAdminAuditLogs(
  page = 1,
  limit = 20,
  actionFilter?: string
): Promise<{ logs: AdminAuditLogRecord[]; pagination: { page: number; limit: number; totalCount: number; totalPages: number } }> {
  const db = await getDb();
  const safePage = Math.max(1, page);
  const safeLimit = Math.min(100, Math.max(1, limit));
  const offset = (safePage - 1) * safeLimit;

  let whereClauses = ['1=1'];
  let queryParams: any[] = [];
  let paramIdx = 1;

  if (actionFilter && actionFilter !== 'ALL' && actionFilter !== 'all') {
    whereClauses.push(`action = $${paramIdx}`);
    queryParams.push(actionFilter.toUpperCase());
    paramIdx++;
  }

  const whereSql = whereClauses.join(' AND ');

  const countRes = await db.query<{ count: string | number }>(
    `SELECT COUNT(*)::int AS count FROM admin_audit_logs WHERE ${whereSql}`,
    queryParams
  );
  const totalCount = Number(countRes.rows[0]?.count || 0);

  const txQueryParams = [...queryParams, safeLimit, offset];
  const listRes = await db.query<any>(
    `
    SELECT * FROM admin_audit_logs
    WHERE ${whereSql}
    ORDER BY created_at DESC
    LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
    `,
    txQueryParams
  );

  const totalPages = Math.ceil(totalCount / safeLimit) || 1;

  const logs: AdminAuditLogRecord[] = listRes.rows.map((r) => ({
    id: r.id,
    adminUserId: r.admin_user_id || null,
    adminPublicId: r.admin_public_id || 'SYSTEM_ADMIN',
    action: r.action,
    targetType: r.target_type,
    targetId: r.target_id,
    details: r.details,
    metadata: r.metadata ? JSON.parse(r.metadata) : null,
    ipAddress: r.ip_address || null,
    createdAt: new Date(r.created_at).toISOString(),
  }));

  return {
    logs,
    pagination: {
      page: safePage,
      limit: safeLimit,
      totalCount,
      totalPages,
    },
  };
}

/**
 * Fetch unified audit feed combining node activations, financial ledger entries, and admin actions.
 */
export async function getUnifiedAuditFeed(
  limit = 50,
  categoryFilter?: string,
  searchQuery?: string
): Promise<{ events: any[]; stats: any }> {
  const db = await getDb();

  // 1. Fetch Node Activations
  const nodesRes = await db.query<any>(`
    SELECT 
      n.id,
      n.public_node_id,
      n.status,
      1000.00 AS pricing_tier_usd,
      n.activated_at,
      n.updated_at,
      u.public_id AS owner_public_id,
      u.full_name AS owner_name
    FROM nodes n
    JOIN users u ON n.owner_user_id = u.id
    WHERE n.status = 'ACTIVE'
    ORDER BY n.updated_at DESC
    LIMIT 30
  `);

  // 2. Fetch Financial Ledger Entries
  const ledgerRes = await db.query<any>(`
    SELECT 
      f.id,
      f.public_txn_id,
      f.entry_type,
      f.source_type,
      f.source_id,
      f.amount,
      f.currency,
      f.description,
      f.created_at,
      u.public_id AS user_public_id
    FROM financial_ledger_entries f
    LEFT JOIN users u ON f.user_id = u.id
    ORDER BY f.created_at DESC
    LIMIT 30
  `);

  // 3. Fetch Admin Audit Logs
  const adminRes = await db.query<any>(`
    SELECT * FROM admin_audit_logs
    ORDER BY created_at DESC
    LIMIT 30
  `);

  // 4. Map into unified audit stream
  const nodeEvents = nodesRes.rows.map((n) => ({
    id: `audit-node-${n.id}`,
    category: 'NODE_ACTIVATION',
    action: 'NODE_ACTIVATION_COMPLETED',
    actorPublicId: n.owner_public_id || 'PHX-USER',
    targetType: 'NODE',
    targetId: n.public_node_id,
    amountUsd: Number(n.pricing_tier_usd || 1000),
    currency: 'USD',
    details: `Genesis Node ${n.public_node_id} activated and allocated to operator ${n.owner_public_id || 'PHX-USER'} ($${Number(n.pricing_tier_usd || 1000).toFixed(2)} stage tier).`,
    metadata: {
      publicNodeId: n.public_node_id,
      pricingTierUsd: Number(n.pricing_tier_usd || 1000),
      activatedAt: n.activated_at,
      ownerName: n.owner_name,
    },
    ipAddress: null,
    createdAt: n.activated_at ? new Date(n.activated_at).toISOString() : new Date(n.updated_at).toISOString(),
  }));

  const finEvents = ledgerRes.rows.map((f) => ({
    id: `audit-fin-${f.id}`,
    category: 'FINANCIAL',
    action: `FINANCIAL_${f.source_type}_${f.entry_type}`,
    actorPublicId: f.user_public_id || 'SYSTEM_ADMIN',
    targetType: 'LEDGER_ENTRY',
    targetId: f.public_txn_id,
    amountUsd: Number(f.amount),
    currency: f.currency,
    details: `${f.description || `${f.entry_type} entry for ${f.source_type}`}`,
    metadata: {
      publicTxnId: f.public_txn_id,
      entryType: f.entry_type,
      sourceType: f.source_type,
      sourceId: f.source_id,
      amount: Number(f.amount),
      currency: f.currency,
    },
    ipAddress: null,
    createdAt: new Date(f.created_at).toISOString(),
  }));

  const adminEvents = adminRes.rows.map((a) => ({
    id: `audit-admin-${a.id}`,
    category: 'ADMIN_ACTION',
    action: a.action,
    actorPublicId: a.admin_public_id || 'SYSTEM_ADMIN',
    targetType: a.target_type,
    targetId: a.target_id,
    amountUsd: null,
    currency: null,
    details: a.details,
    metadata: a.metadata ? JSON.parse(a.metadata) : null,
    ipAddress: a.ip_address || null,
    createdAt: new Date(a.created_at).toISOString(),
  }));

  // Combine and sort chronologically
  let combined = [...nodeEvents, ...finEvents, ...adminEvents].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  // Filter category
  if (categoryFilter && categoryFilter !== 'ALL' && categoryFilter !== 'all') {
    combined = combined.filter((e) => e.category === categoryFilter.toUpperCase());
  }

  // Filter search
  if (searchQuery && searchQuery.trim()) {
    const q = searchQuery.toLowerCase().trim();
    combined = combined.filter(
      (e) =>
        e.action.toLowerCase().includes(q) ||
        e.actorPublicId.toLowerCase().includes(q) ||
        e.targetId.toLowerCase().includes(q) ||
        e.details.toLowerCase().includes(q)
    );
  }

  const finalEvents = combined.slice(0, limit);

  return {
    events: finalEvents,
    stats: {
      totalEvents: combined.length,
      nodeActivationsCount: nodeEvents.length,
      financialTransactionsCount: finEvents.length,
      adminActionsCount: adminEvents.length,
      securityEventsCount: 0,
      lastReconciliationAt: new Date().toISOString(),
    },
  };
}

/**
 * Admin profile modification for safe fields with audit log.
 */
export async function updateAdminUserProfile(params: {
  adminUserId: string;
  adminPublicId: string;
  targetUserId: string;
  fullName?: string;
  country?: string;
  phone?: string;
  status?: 'ACTIVE' | 'LOCKED' | 'SUSPENDED';
  reason: string;
  ipAddress?: string;
}): Promise<{ user: any }> {
  const db = await getDb();

  if (!params.reason || params.reason.trim().length < 5) {
    const err: any = new Error('Admin reason is mandatory (minimum 5 characters) for user profile edits.');
    err.statusCode = 400;
    throw err;
  }

  // Fetch current user state
  const userRes = await db.query<any>(`SELECT * FROM users WHERE id::text = $1 OR public_id = $1`, [params.targetUserId]);
  if (userRes.rows.length === 0) {
    const err: any = new Error('Target user account not found.');
    err.statusCode = 404;
    throw err;
  }

  const currentUser = userRes.rows[0];

  // Protect against self-locking
  if (currentUser.id === params.adminUserId && params.status && params.status !== 'ACTIVE') {
    const err: any = new Error('You cannot lock or suspend your own active administrator account.');
    err.statusCode = 400;
    throw err;
  }

  const newFullName = params.fullName !== undefined ? params.fullName.trim() : currentUser.full_name;
  const newCountry = params.country !== undefined ? params.country.trim() : currentUser.country;
  const newPhone = params.phone !== undefined ? params.phone.trim() : currentUser.phone;
  const newStatus = params.status !== undefined ? params.status : currentUser.status;

  await db.query(
    `
    UPDATE users
    SET full_name = $1, country = $2, phone = $3, status = $4, updated_at = CURRENT_TIMESTAMP
    WHERE id = $5
    `,
    [newFullName, newCountry, newPhone, newStatus, currentUser.id]
  );

  // If locking or suspending, revoke active sessions immediately
  if (params.status && params.status !== currentUser.status) {
    if (params.status === 'LOCKED' || params.status === 'SUSPENDED') {
      await db.query(`UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND revoked_at IS NULL`, [currentUser.id]);
    }
  }

  const updatedUserRes = await db.query<any>(`SELECT id, public_id, full_name, email, phone, country, status, role, created_at FROM users WHERE id = $1`, [currentUser.id]);
  const updatedUser = updatedUserRes.rows[0];

  // Audit log
  await logAdminAction({
    adminUserId: params.adminUserId,
    adminPublicId: params.adminPublicId,
    action: 'ADMIN_USER_PROFILE_UPDATED',
    targetType: 'USER',
    targetId: currentUser.public_id,
    details: `Admin ${params.adminPublicId} updated profile for user ${currentUser.public_id}. Reason: ${params.reason}`,
    metadata: {
      before: {
        fullName: currentUser.full_name,
        country: currentUser.country,
        phone: currentUser.phone,
        status: currentUser.status,
      },
      after: {
        fullName: newFullName,
        country: newCountry,
        phone: newPhone,
        status: newStatus,
      },
      reason: params.reason,
    },
    ipAddress: params.ipAddress,
  });

  // Create persistent notification for operator awareness
  createNotification({
    userId: currentUser.id,
    type: 'SECURITY_ALERT',
    title: 'Profile Updated',
    message: `Your account profile has been updated by administrator ${params.adminPublicId}. Reason: ${params.reason}`,
    sourceType: 'ADMIN_ADJUSTMENT',
    sourceId: currentUser.public_id,
  }).catch(console.error);

  // Realtime SSE event emission for user synchronization
  try {
    notificationEmitter.emit(`notification:${currentUser.id}`, {
      type: 'USER_PROFILE_UPDATED',
      user: {
        id: updatedUser.id,
        publicId: updatedUser.public_id,
        fullName: updatedUser.full_name,
        phone: updatedUser.phone,
        country: updatedUser.country,
        status: updatedUser.status,
      },
    });

    if (params.status && params.status !== currentUser.status) {
      notificationEmitter.emit(`notification:${currentUser.id}`, {
        type: 'USER_STATUS_UPDATED',
        status: params.status,
      });
    }
  } catch {}

  return { user: updatedUser };
}

/**
 * User 360° Comprehensive Inspection:
 * Retrieves complete server-authoritative details for an individual user:
 * - Profile & Registration & Sponsor
 * - Wallet Overview (USDT & PHIVO balances, deposits, withdrawals, swaps, purchases, commissions, admin adjustments)
 * - Ledger Transactions
 * - Nodes & Node Purchase Orders
 * - Active Sessions & Security Logs
 * - Admin Audit Trail targeting this user
 */
export async function getUser360Details(targetUserIdOrPublicId: string) {
  const db = await getDb();

  // 1. Fetch User Record
  const userRes = await db.query<any>(
    `SELECT id, public_id, full_name, email, phone, country, status, COALESCE(role, 'USER') AS role, email_verified_at, created_at, last_login_at FROM users WHERE id::text = $1 OR public_id = $1 OR LOWER(email) = LOWER($1)`,
    [targetUserIdOrPublicId]
  );

  if (userRes.rows.length === 0) {
    const err: any = new Error(`Target user '${targetUserIdOrPublicId}' not found.`);
    err.statusCode = 404;
    throw err;
  }

  const u = userRes.rows[0];
  const userId = u.id;

  // 2. Fetch Sponsor / Referral Details
  const sponsorRes = await db.query<any>(
    `
    SELECT ur.referral_code, sp.id AS sponsor_id, sp.public_id AS sponsor_public_id, sp.full_name AS sponsor_full_name, sp.email AS sponsor_email
    FROM user_referrals ur
    LEFT JOIN users sp ON ur.sponsor_user_id = sp.id
    WHERE ur.user_id = $1
    `,
    [userId]
  );
  const sponsor = sponsorRes.rows[0] || null;

  // 3. Fetch Wallet Overview (USDT & PHIVO)
  const [usdtWallet, phivoWallet, depositAgg, withdrawalAgg, swapAgg, orderAgg, adminAdjAgg] = await Promise.all([
    getWalletSummary(userId),
    getUserCoinBalance(userId),
    db.query<any>(`
      SELECT COALESCE(SUM(amount), 0)::float AS total, COUNT(*)::int AS count
      FROM blockchain_deposits
      WHERE user_id = $1 AND status IN ('CREDITED', 'CONFIRMED', 'SWEPT')
    `, [userId]),
    db.query<any>(`
      SELECT 
        COALESCE(SUM(amount), 0)::float AS total,
        COUNT(*)::int AS count,
        COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN amount ELSE 0 END), 0)::float AS completed_total,
        COALESCE(SUM(CASE WHEN status = 'PENDING' THEN amount ELSE 0 END), 0)::float AS pending_total
      FROM withdrawals
      WHERE user_id = $1
    `, [userId]),
    db.query<any>(`
      SELECT 
        COALESCE(SUM(usdt_amount), 0)::float AS total_usdt,
        COALESCE(SUM(coin_amount), 0)::float AS total_phivo,
        COUNT(*)::int AS count
      FROM coin_swap_transactions
      WHERE user_id = $1 AND status = 'COMPLETED'
    `, [userId]),
    db.query<any>(`
      SELECT COALESCE(SUM(amount_usd), 0)::float AS total, COUNT(*)::int AS count
      FROM node_orders
      WHERE user_id = $1 AND status = 'COMPLETED'
    `, [userId]),
    db.query<any>(`
      SELECT 
        COALESCE(SUM(CASE WHEN entry_type = 'CREDIT' THEN amount ELSE 0 END), 0)::float AS credit_total,
        COALESCE(SUM(CASE WHEN entry_type = 'DEBIT' THEN amount ELSE 0 END), 0)::float AS debit_total,
        COUNT(*)::int AS count
      FROM financial_ledger_entries
      WHERE user_id = $1 AND source_type = 'ADMIN_ADJUSTMENT' AND status = 'SETTLED'
    `, [userId]),
  ]);

  const depRow = depositAgg.rows[0] || {};
  const wRow = withdrawalAgg.rows[0] || {};
  const swRow = swapAgg.rows[0] || {};
  const ordRow = orderAgg.rows[0] || {};
  const admRow = adminAdjAgg.rows[0] || {};

  // 4. Fetch User Deposit Addresses & Withdrawal History
  const [depositAddressesRes, recentWithdrawalsRes] = await Promise.all([
    db.query<any>(`SELECT id, chain_id, asset, address, derivation_index, created_at FROM user_deposit_addresses WHERE user_id = $1`, [userId]),
    db.query<any>(`SELECT id, public_withdrawal_id, amount, currency, destination_type, destination_reference, status, created_at, completed_at FROM withdrawals WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`, [userId]),
  ]);

  // 5. Fetch User Owned Nodes & Node Orders
  const [nodesRes, ordersRes] = await Promise.all([
    db.query<any>(`SELECT id, node_number, public_node_id, status, reserved_at, activated_at, created_at FROM nodes WHERE owner_user_id = $1 ORDER BY node_number ASC`, [userId]),
    db.query<any>(`SELECT id, public_order_id, node_number, amount_usd, currency, status, payment_method, payment_reference, created_at, completed_at FROM node_orders WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`, [userId]),
  ]);

  // 6. Fetch User Financial Ledger Transactions
  const ledgerRes = await db.query<any>(
    `SELECT id, public_txn_id, entry_type, source_type, source_id, source_ref, description, amount, currency, status, created_at FROM financial_ledger_entries WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [userId]
  );

  // 7. Fetch Active / Recent Sessions & Security Logs
  const [sessionsRes, securityEventsRes] = await Promise.all([
    db.query<any>(`SELECT id, user_agent, ip_address, created_at, expires_at, last_used_at, revoked_at FROM sessions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`, [userId]),
    db.query<any>(`SELECT id, event_type, description, user_agent_summary, created_at FROM security_events WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`, [userId]),
  ]);

  // 8. Fetch Admin Audit Logs targeting this user
  const adminAuditRes = await db.query<any>(
    `
    SELECT id, admin_user_id, admin_public_id, action, target_type, target_id, details, metadata, ip_address, created_at
    FROM admin_audit_logs
    WHERE target_id = $1 OR target_id = $2 OR (metadata IS NOT NULL AND metadata::text LIKE '%' || $1 || '%')
    ORDER BY created_at DESC
    LIMIT 30
    `,
    [u.public_id, userId]
  );

  return {
    profile: {
      id: u.id,
      publicId: u.public_id,
      fullName: u.full_name,
      email: u.email,
      phone: u.phone || null,
      country: u.country,
      status: u.status,
      role: u.role,
      emailVerified: !!u.email_verified_at,
      emailVerifiedAt: u.email_verified_at ? new Date(u.email_verified_at).toISOString() : null,
      createdAt: new Date(u.created_at).toISOString(),
      lastLoginAt: u.last_login_at ? new Date(u.last_login_at).toISOString() : null,
      sponsor: sponsor
        ? {
            referralCode: sponsor.referral_code,
            sponsorPublicId: sponsor.sponsor_public_id || null,
            sponsorFullName: sponsor.sponsor_full_name || null,
            sponsorEmail: sponsor.sponsor_email || null,
          }
        : null,
    },
    walletOverview: {
      usdtAvailableBalance: usdtWallet.availableBalance,
      phivoAvailableBalance: phivoWallet.availableCoinBalance,
      totalDepositsUsdt: Number(depRow.total || 0),
      depositCount: Number(depRow.count || 0),
      totalWithdrawalsUsdt: Number(wRow.total || 0),
      completedWithdrawalsUsdt: Number(wRow.completed_total || 0),
      pendingWithdrawalsUsdt: Number(wRow.pending_total || 0),
      withdrawalCount: Number(wRow.count || 0),
      totalSwapsUsdt: Number(swRow.total_usdt || 0),
      totalSwapsPhivo: Number(swRow.total_phivo || 0),
      swapCount: Number(swRow.count || 0),
      nodePurchasesUsdt: Number(ordRow.total || 0),
      orderCount: Number(ordRow.count || 0),
      rewardsEarnedPhivo: phivoWallet.totalEarnedCoins,
      referralCommissionsUsdt: usdtWallet.breakdown.referral,
      matchingRewardsUsdt: usdtWallet.breakdown.matching,
      promotionBonusesUsdt: usdtWallet.breakdown.promotion,
      adminAdjustments: {
        totalCreditsUsdt: Number(admRow.credit_total || 0),
        totalDebitsUsdt: Number(admRow.debit_total || 0),
        netUsdt: Number(admRow.credit_total || 0) - Number(admRow.debit_total || 0),
        count: Number(admRow.count || 0),
      },
    },
    addresses: depositAddressesRes.rows.map((a) => ({
      id: a.id,
      chainId: a.chain_id,
      asset: a.asset,
      address: a.address,
      derivationIndex: a.derivation_index,
      createdAt: new Date(a.created_at).toISOString(),
    })),
    recentWithdrawals: recentWithdrawalsRes.rows.map((w) => ({
      id: w.id,
      publicWithdrawalId: w.public_withdrawal_id,
      amount: Number(w.amount),
      currency: w.currency,
      destinationType: w.destination_type,
      destinationReference: w.destination_reference,
      status: w.status,
      createdAt: new Date(w.created_at).toISOString(),
      completedAt: w.completed_at ? new Date(w.completed_at).toISOString() : null,
    })),
    nodes: nodesRes.rows.map((n) => ({
      id: n.id,
      nodeNumber: n.node_number,
      publicNodeId: n.public_node_id,
      status: n.status,
      reservedAt: n.reserved_at ? new Date(n.reserved_at).toISOString() : null,
      activatedAt: n.activated_at ? new Date(n.activated_at).toISOString() : null,
      createdAt: new Date(n.created_at).toISOString(),
    })),
    orders: ordersRes.rows.map((o) => ({
      id: o.id,
      publicOrderId: o.public_order_id,
      nodeNumber: o.node_number,
      amountUsd: Number(o.amount_usd),
      currency: o.currency,
      status: o.status,
      paymentMethod: o.payment_method,
      paymentReference: o.payment_reference,
      createdAt: new Date(o.created_at).toISOString(),
      completedAt: o.completed_at ? new Date(o.completed_at).toISOString() : null,
    })),
    transactions: ledgerRes.rows.map((r) => ({
      id: r.id,
      publicTxnId: r.public_txn_id,
      entryType: r.entry_type,
      sourceType: r.source_type,
      sourceId: r.source_id,
      sourceRef: r.source_ref,
      description: r.description,
      amount: Number(r.amount),
      currency: r.currency,
      status: r.status,
      createdAt: new Date(r.created_at).toISOString(),
    })),
    sessions: sessionsRes.rows.map((s) => ({
      id: s.id,
      userAgent: s.user_agent,
      ipAddress: s.ip_address,
      createdAt: new Date(s.created_at).toISOString(),
      expiresAt: new Date(s.expires_at).toISOString(),
      lastUsedAt: new Date(s.last_used_at).toISOString(),
      revokedAt: s.revoked_at ? new Date(s.revoked_at).toISOString() : null,
      isActive: !s.revoked_at && new Date(s.expires_at).getTime() > Date.now(),
    })),
    securityEvents: securityEventsRes.rows.map((se) => ({
      id: se.id,
      eventType: se.event_type,
      description: se.description,
      userAgentSummary: se.user_agent_summary,
      createdAt: new Date(se.created_at).toISOString(),
    })),
    auditLogs: adminAuditRes.rows.map((al) => ({
      id: al.id,
      adminUserId: al.admin_user_id,
      adminPublicId: al.admin_public_id,
      action: al.action,
      targetType: al.target_type,
      targetId: al.target_id,
      details: al.details,
      metadata: al.metadata ? (typeof al.metadata === 'string' ? JSON.parse(al.metadata) : al.metadata) : null,
      ipAddress: al.ip_address,
      createdAt: new Date(al.created_at).toISOString(),
    })),
  };
}

/**
 * Execute Secure Admin Wallet Adjustment inside a Single PostgreSQL Transaction:
 * - NO direct balance overwrite (UPDATE users SET balance = ...)
 * - Safe decimal handling (amount > 0, finite number)
 * - Row lock target user (SELECT FOR UPDATE)
 * - Negative balance protection (DEBIT rejected if current balance < amount)
 * - Idempotency guard (unique source_ref / idempotency key prevents duplicate execution)
 * - Immutable financial_ledger_entries record
 * - Full admin audit logging
 * - Realtime SSE notification dispatch
 */
export async function executeAdminWalletAdjustment(params: {
  adminUserId: string;
  adminPublicId: string;
  targetUserId: string;
  asset: 'USDT' | 'PHIVO';
  direction: 'CREDIT' | 'DEBIT';
  amount: number;
  reason: string;
  idempotencyKey?: string;
  ipAddress?: string;
}) {
  const db = await getDb();

  // 1. Input Validation
  const cleanAsset = (params.asset || '').toUpperCase().trim() as 'USDT' | 'PHIVO';
  if (cleanAsset !== 'USDT' && cleanAsset !== 'PHIVO') {
    const err: any = new Error('Invalid asset specified. Supported assets: USDT, PHIVO.');
    err.statusCode = 400;
    throw err;
  }

  const cleanDirection = (params.direction || '').toUpperCase().trim() as 'CREDIT' | 'DEBIT';
  if (cleanDirection !== 'CREDIT' && cleanDirection !== 'DEBIT') {
    const err: any = new Error('Invalid direction specified. Supported directions: CREDIT, DEBIT.');
    err.statusCode = 400;
    throw err;
  }

  const numAmount = Number(params.amount);
  if (isNaN(numAmount) || !isFinite(numAmount) || numAmount <= 0) {
    const err: any = new Error('Adjustment amount must be a positive, finite number strictly greater than 0.');
    err.statusCode = 400;
    throw err;
  }

  if (!params.reason || params.reason.trim().length < 5) {
    const err: any = new Error('Administrative reason is mandatory (minimum 5 characters) for wallet adjustment.');
    err.statusCode = 400;
    throw err;
  }

  const cleanReason = params.reason.trim();
  const idempotencyKey = params.idempotencyKey ? params.idempotencyKey.trim() : null;

  // 2. Idempotency Guard Check (if key supplied)
  if (idempotencyKey) {
    const existingTx = await db.query<any>(
      `
      SELECT f.*, u.public_id AS target_public_id
      FROM financial_ledger_entries f
      JOIN users u ON f.user_id = u.id
      WHERE f.source_type = 'ADMIN_ADJUSTMENT' AND f.source_ref = $1
      LIMIT 1
      `,
      [idempotencyKey]
    );

    if (existingTx.rows.length > 0) {
      const row = existingTx.rows[0];
      return {
        success: true,
        isDuplicate: true,
        transaction: {
          publicTxnId: row.public_txn_id,
          targetUserId: row.user_id,
          targetPublicId: row.target_public_id,
          asset: row.currency,
          direction: row.entry_type,
          amount: Number(row.amount),
          reason: row.description,
          newBalance: undefined,
          createdAt: new Date(row.created_at).toISOString(),
        },
      };
    }
  }

  // 3. PostgreSQL Transaction with Row Lock & Negative Balance Protection
  return await db.transaction(async (txClient) => {
    // Row Lock
    const targetUserRes = await txClient.query<any>(
      `SELECT id, public_id, full_name, email, status, COALESCE(role, 'USER') AS role FROM users WHERE id::text = $1 OR public_id = $1 FOR UPDATE`,
      [params.targetUserId]
    );

    if (targetUserRes.rows.length === 0) {
      const err: any = new Error(`Target user '${params.targetUserId}' not found.`);
      err.statusCode = 404;
      throw err;
    }

    const targetUser = targetUserRes.rows[0];

    // Check target balance if direction is DEBIT
    let currentBalance = 0;
    if (cleanAsset === 'USDT') {
      const usdtSummary = await getWalletSummary(targetUser.id);
      currentBalance = usdtSummary.availableBalance;
    } else {
      const phivoSummary = await getUserCoinBalance(targetUser.id);
      currentBalance = phivoSummary.availableCoinBalance;
    }

    if (cleanDirection === 'DEBIT' && currentBalance < numAmount) {
      const err: any = new Error(
        `INSUFFICIENT_BALANCE: Cannot DEBIT ${numAmount} ${cleanAsset} from user ${targetUser.public_id}. Current available balance: ${currentBalance} ${cleanAsset}.`
      );
      err.statusCode = 400;
      throw err;
    }

    // Insert Immutable Financial Ledger Entry
    const ledgerId = uuidv4();
    const sourceId = uuidv4();
    const publicTxnId = generateLedgerTransactionPublicId();
    const sourceRef = idempotencyKey || params.adminPublicId;
    const description = `Admin Adjustment (${cleanDirection}): ${cleanReason}`;

    await txClient.query(
      `
      INSERT INTO financial_ledger_entries (
        id, public_txn_id, user_id, entry_type, source_type, source_id,
        source_ref, description, amount, currency, status, created_at
      )
      VALUES ($1, $2, $3, $4, 'ADMIN_ADJUSTMENT', $5, $6, $7, $8, $9, 'SETTLED', CURRENT_TIMESTAMP)
      `,
      [ledgerId, publicTxnId, targetUser.id, cleanDirection, sourceId, sourceRef, description, numAmount, cleanAsset]
    );

    // Calculate updated balance
    const newBalance = cleanDirection === 'CREDIT' ? currentBalance + numAmount : currentBalance - numAmount;

    // Log Administrator Audit Action
    await txClient.query(
      `
      INSERT INTO admin_audit_logs (
        id, admin_user_id, admin_public_id, action, target_type, target_id, details, metadata, ip_address, created_at
      )
      VALUES ($1, $2, $3, $4, 'USER', $5, $6, $7, $8, CURRENT_TIMESTAMP)
      `,
      [
        uuidv4(),
        params.adminUserId,
        params.adminPublicId,
        cleanDirection === 'CREDIT' ? 'ADMIN_WALLET_CREDIT' : 'ADMIN_WALLET_DEBIT',
        targetUser.public_id,
        `Admin ${params.adminPublicId} executed ${cleanDirection} of ${numAmount} ${cleanAsset} for user ${targetUser.public_id}. Reason: ${cleanReason}`,
        JSON.stringify({
          adminUserId: params.adminUserId,
          adminPublicId: params.adminPublicId,
          targetUserId: targetUser.id,
          targetPublicId: targetUser.public_id,
          asset: cleanAsset,
          direction: cleanDirection,
          amount: numAmount,
          reason: cleanReason,
          publicTxnId,
          idempotencyKey,
          previousBalance: currentBalance,
          newBalance,
        }),
        params.ipAddress || null,
      ]
    );

    // 4. Async Notification & SSE Realtime Update
    createNotification({
      userId: targetUser.id,
      type: 'SECURITY_ALERT',
      title: cleanDirection === 'CREDIT' ? 'Account Credit' : 'Account Debit',
      message: `An ${cleanDirection === 'CREDIT' ? 'account credit' : 'account debit'} of ${numAmount} ${cleanAsset} was applied to your balance.`,
      sourceType: 'ADMIN_ADJUSTMENT',
      sourceId: publicTxnId,
    }).catch(console.error);

    try {
      notificationEmitter.emit(`notification:${targetUser.id}`, {
        type: 'WALLET_UPDATED',
        asset: cleanAsset,
        direction: cleanDirection,
        amount: numAmount,
        newBalance,
        publicTxnId,
      });
    } catch {}

    return {
      success: true,
      isDuplicate: false,
      transaction: {
        publicTxnId,
        targetUserId: targetUser.id,
        targetPublicId: targetUser.public_id,
        asset: cleanAsset,
        direction: cleanDirection,
        amount: numAmount,
        reason: cleanReason,
        previousBalance: currentBalance,
        newBalance,
        createdAt: new Date().toISOString(),
      },
    };
  });
}

/**
 * Account Lock / Unlock / Suspend Administrative Action with Audit Log and Session Revocation
 */
export async function setUserAccountStatus(params: {
  adminUserId: string;
  adminPublicId: string;
  targetUserId: string;
  status: 'ACTIVE' | 'LOCKED' | 'SUSPENDED';
  reason: string;
  ipAddress?: string;
}) {
  const db = await getDb();

  if (!params.reason || params.reason.trim().length < 5) {
    const err: any = new Error('Admin reason is mandatory (minimum 5 characters) for account status updates.');
    err.statusCode = 400;
    throw err;
  }

  const targetRes = await db.query<any>(`SELECT id, public_id, full_name, email, status FROM users WHERE id::text = $1 OR public_id = $1`, [params.targetUserId]);
  if (targetRes.rows.length === 0) {
    const err: any = new Error('Target user account not found.');
    err.statusCode = 404;
    throw err;
  }

  const targetUser = targetRes.rows[0];

  if (targetUser.id === params.adminUserId && params.status !== 'ACTIVE') {
    const err: any = new Error('You cannot lock or suspend your own active administrator account.');
    err.statusCode = 400;
    throw err;
  }

  await db.query(`UPDATE users SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`, [params.status, targetUser.id]);

  // If locking or suspending, revoke active sessions immediately
  if (params.status === 'LOCKED' || params.status === 'SUSPENDED') {
    await db.query(`UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND revoked_at IS NULL`, [targetUser.id]);
  }

  const actionType = params.status === 'LOCKED' ? 'ADMIN_USER_LOCK' : params.status === 'ACTIVE' ? 'ADMIN_USER_UNLOCK' : 'ADMIN_USER_SUSPEND';

  await logAdminAction({
    adminUserId: params.adminUserId,
    adminPublicId: params.adminPublicId,
    action: actionType,
    targetType: 'USER',
    targetId: targetUser.public_id,
    details: `Admin ${params.adminPublicId} set account status to ${params.status} for user ${targetUser.public_id}. Reason: ${params.reason}`,
    metadata: {
      targetUserId: targetUser.id,
      targetPublicId: targetUser.public_id,
      previousStatus: targetUser.status,
      newStatus: params.status,
      reason: params.reason,
    },
    ipAddress: params.ipAddress,
  });

  try {
    notificationEmitter.emit(`notification:${targetUser.id}`, {
      type: 'USER_STATUS_UPDATED',
      status: params.status,
    });
  } catch {}

  return { success: true, targetPublicId: targetUser.public_id, status: params.status };
}

/**
 * Revoke Active Sessions for User with Audit Log
 */
export async function revokeUserSessions(params: {
  adminUserId: string;
  adminPublicId: string;
  targetUserId: string;
  reason: string;
  ipAddress?: string;
}) {
  const db = await getDb();

  if (!params.reason || params.reason.trim().length < 5) {
    const err: any = new Error('Admin reason is mandatory (minimum 5 characters) for session revocation.');
    err.statusCode = 400;
    throw err;
  }

  const targetRes = await db.query<any>(`SELECT id, public_id FROM users WHERE id::text = $1 OR public_id = $1`, [params.targetUserId]);
  if (targetRes.rows.length === 0) {
    const err: any = new Error('Target user account not found.');
    err.statusCode = 404;
    throw err;
  }

  const targetUser = targetRes.rows[0];

  const revokeRes = await db.query<any>(
    `UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND revoked_at IS NULL RETURNING id`,
    [targetUser.id]
  );

  const revokedCount = revokeRes.rowCount || 0;

  await logAdminAction({
    adminUserId: params.adminUserId,
    adminPublicId: params.adminPublicId,
    action: 'ADMIN_SESSION_REVOKE',
    targetType: 'USER',
    targetId: targetUser.public_id,
    details: `Admin ${params.adminPublicId} revoked ${revokedCount} active sessions for user ${targetUser.public_id}. Reason: ${params.reason}`,
    metadata: {
      targetUserId: targetUser.id,
      targetPublicId: targetUser.public_id,
      revokedCount,
      reason: params.reason,
    },
    ipAddress: params.ipAddress,
  });

  try {
    notificationEmitter.emit(`notification:${targetUser.id}`, {
      type: 'SESSION_REVOKED',
      revokedCount,
    });
  } catch {}

  return { success: true, targetPublicId: targetUser.public_id, revokedCount };
}
