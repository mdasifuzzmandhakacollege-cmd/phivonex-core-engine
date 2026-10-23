import { Router, Response } from 'express';
import { requireAdmin, AuthRequest } from '../middleware/authMiddleware';
import { adminFinancialLimiter } from '../middleware/rateLimiter';
import {
  getAdminSummaryMetrics,
  getAdminUsersList,
  updateAdminUserProfile,
  getAdminNodesList,
  getAdminOrdersList,
  getAdminWithdrawalsList,
  getAdminTransactionsList,
  getAdminAuditLogs,
  getUnifiedAuditFeed,
  logAdminAction,
  getUser360Details,
  executeAdminWalletAdjustment,
  setUserAccountStatus,
  revokeUserSessions,
  assignUserSponsor,
} from '../services/adminService';
import { settleWithdrawalAction } from '../services/withdrawalService';
import {
  runFinancialReconciliation,
  getLatestReconciliationRun,
  getReconciliationIssues,
} from '../services/reconciliationService';
import { getIntegrationHealthStatus } from '../services/integrationHealthService';
import { checkCloudSqlConnection } from '../utils/cloudSqlDiagnostic';
import {
  getActiveMatchingConfig,
  updateMatchingConfig,
  getMatchingConfigAuditLogs
} from '../services/binaryMatchingService';
import {
  getEmailTemplates,
  updateEmailTemplate,
  sendBroadcastCampaign,
  getAutomationRules,
  createAutomationRule,
  updateAutomationRule,
  deleteAutomationRule,
  getEmailQueue,
  getEmailQueueStats,
  retryQueueItem,
  processEmailQueue
} from '../services/emailService';

export const adminRouter = Router();

// Enforce requireAdmin on ALL admin routes
adminRouter.use(requireAdmin);

/**
 * GET /api/admin/integration-health
 * Returns safe system integration health diagnostics (admin-only).
 */
adminRouter.get('/integration-health', async (req: AuthRequest, res: Response) => {
  try {
    const health = await getIntegrationHealthStatus();
    return res.status(200).json({
      success: true,
      health,
    });
  } catch (err: any) {
    console.error('[Admin API] Error fetching integration health status:', err);
    return res.status(500).json({
      error: 'SERVER_ERROR',
      message: 'Failed to retrieve system integration health.',
    });
  }
});

/**
 * GET /api/admin/diagnostics/cloudsql
 * Admin endpoint to verify Cloud SQL PostgreSQL connection and schema status.
 * Safely masks credentials.
 */
adminRouter.get('/diagnostics/cloudsql', async (req: AuthRequest, res: Response) => {
  try {
    const report = await checkCloudSqlConnection({ logStatus: true });
    return res.status(report.status === 'connected' ? 200 : 503).json({
      success: report.status === 'connected',
      diagnostic: report,
    });
  } catch (err: any) {
    console.error('[Admin API] Cloud SQL diagnostic execution error:', err);
    return res.status(500).json({
      success: false,
      error: 'DIAGNOSTIC_EXEC_ERROR',
      message: 'Failed to execute Cloud SQL diagnostic test.',
    });
  }
});

/**
 * GET /api/admin/matching-config
 * Returns current binary matching configurations and its audit trail (admin-only).
 */
adminRouter.get('/matching-config', async (req: AuthRequest, res: Response) => {
  try {
    const config = await getActiveMatchingConfig();
    const auditLogs = await getMatchingConfigAuditLogs();
    return res.status(200).json({
      success: true,
      config,
      auditLogs,
    });
  } catch (err: any) {
    console.error('[Admin API] Error fetching matching configuration:', err);
    return res.status(500).json({
      error: 'SERVER_ERROR',
      message: 'Failed to retrieve binary matching configurations.',
    });
  }
});

/**
 * POST /api/admin/matching-config
 * Updates current binary matching configuration dynamically (admin-only).
 */
adminRouter.post('/matching-config', async (req: AuthRequest, res: Response) => {
  try {
    const admin = req.user!;
    const {
      matchingEnabled,
      dailyMaxPayout,
      sponsorQualificationRequired,
      carryForwardBehavior,
      effectiveDate,
      tiers,
    } = req.body || {};

    // Basic validation
    if (typeof matchingEnabled !== 'boolean') {
      return res.status(400).json({ error: 'INVALID_INPUT', message: 'matchingEnabled must be a boolean.' });
    }
    if (typeof dailyMaxPayout !== 'number' || dailyMaxPayout <= 0) {
      return res.status(400).json({ error: 'INVALID_INPUT', message: 'dailyMaxPayout must be a positive number.' });
    }
    if (typeof sponsorQualificationRequired !== 'boolean') {
      return res.status(400).json({ error: 'INVALID_INPUT', message: 'sponsorQualificationRequired must be a boolean.' });
    }
    if (!['DISCARD_WEAK_CARRY_STRONG', 'DEFAULT'].includes(carryForwardBehavior)) {
      return res.status(400).json({ error: 'INVALID_INPUT', message: 'carryForwardBehavior is invalid.' });
    }
    if (!effectiveDate || typeof effectiveDate !== 'string') {
      return res.status(400).json({ error: 'INVALID_INPUT', message: 'effectiveDate is required.' });
    }
    if (!Array.isArray(tiers) || tiers.length === 0) {
      return res.status(400).json({ error: 'INVALID_INPUT', message: 'tiers must be a non-empty array.' });
    }

    // Ensure each tier has valid units and bonusUsd
    for (const tier of tiers) {
      if (typeof tier.units !== 'number' || tier.units <= 0) {
        return res.status(400).json({ error: 'INVALID_INPUT', message: 'Each tier units must be a positive number.' });
      }
      if (typeof tier.bonusUsd !== 'number' || tier.bonusUsd <= 0) {
        return res.status(400).json({ error: 'INVALID_INPUT', message: 'Each tier bonusUsd must be a positive number.' });
      }
    }

    const updated = await updateMatchingConfig(admin.id, {
      matchingEnabled,
      dailyMaxPayout,
      sponsorQualificationRequired,
      carryForwardBehavior,
      effectiveDate,
      tiers,
    });

    // Log admin action to the general audit logs
    await logAdminAction({
      adminUserId: admin.id,
      adminPublicId: admin.public_id,
      action: 'UPDATE_MATCHING_CONFIG',
      targetType: 'binary_matching_config',
      targetId: updated.id,
      details: `Updated binary matching configuration to version ${updated.version}`
    });

    return res.status(200).json({
      success: true,
      config: updated,
    });
  } catch (err: any) {
    console.error('[Admin API] Error updating matching configuration:', err);
    return res.status(500).json({
      error: 'SERVER_ERROR',
      message: 'Failed to update binary matching configuration.',
    });
  }
});

/**
 * GET /api/admin/summary
 * Returns real system-wide aggregate metrics for the Admin Dashboard.
 */
adminRouter.get('/summary', async (req: AuthRequest, res: Response) => {
  try {
    const summary = await getAdminSummaryMetrics();
    return res.status(200).json(summary);
  } catch (err: any) {
    console.error('[Admin API] Error fetching summary:', err);
    return res.status(500).json({
      error: 'SERVER_ERROR',
      message: 'Failed to retrieve administrative summary metrics.',
    });
  }
});

/**
 * GET /api/admin/users
 * Returns paginated user accounts with privacy-safe profile details.
 */
adminRouter.get('/users', async (req: AuthRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 20;
    const search = (req.query.search as string) || undefined;
    const status = (req.query.status as string) || undefined;

    const data = await getAdminUsersList(page, limit, search, status);
    return res.status(200).json(data);
  } catch (err: any) {
    console.error('[Admin API] Error fetching users:', err);
    return res.status(500).json({
      error: 'SERVER_ERROR',
      message: 'Failed to fetch user accounts.',
    });
  }
});

/**
 * PUT /api/admin/users/:userId
 * Admin edits user profile safe fields (fullName, country, phone, status) with mandatory audit reason.
 */
adminRouter.put('/users/:userId', async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const { email, fullName, country, phone, status, reason } = req.body || {};

    const adminUserId = req.user?.id || '';
    const adminPublicId = req.user?.public_id || 'SYSTEM_ADMIN';
    const ipAddress = (req.headers['x-forwarded-for'] as string) || req.ip;

    const result = await updateAdminUserProfile({
      adminUserId,
      adminPublicId,
      targetUserId: userId,
      email,
      fullName,
      country,
      phone,
      status,
      reason,
      ipAddress,
    });

    return res.status(200).json({
      success: true,
      user: result.user,
      message: `User ${result.user.public_id} profile updated successfully.`,
    });
  } catch (err: any) {
    console.error('[Admin API] Error updating user profile:', err);
    return res.status(err.statusCode || 500).json({
      error: err.code || 'SERVER_ERROR',
      message: err.message || 'Failed to update user profile.',
    });
  }
});

/**
 * POST /api/admin/users/:userId/sponsor
 * Manually re-assigns a user's sponsor / team leader in the referral tree with audit log & reason.
 */
adminRouter.post('/users/:userId/sponsor', async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const { sponsorIdentifier, reason } = req.body || {};

    if (!sponsorIdentifier || !sponsorIdentifier.trim()) {
      return res.status(400).json({ error: 'INVALID_INPUT', message: 'Sponsor identifier (Public ID, Referral Code, or Email) is required.' });
    }

    const adminUserId = req.user?.id || '';
    const adminPublicId = req.user?.public_id || 'SYSTEM_ADMIN';
    const ipAddress = (req.headers['x-forwarded-for'] as string) || req.ip;

    const result = await assignUserSponsor({
      adminUserId,
      adminPublicId,
      targetUserId: userId,
      sponsorIdentifier,
      reason,
      ipAddress,
    });

    return res.status(200).json(result);
  } catch (err: any) {
    console.error('[Admin API] Error re-assigning user sponsor:', err);
    return res.status(err.statusCode || 500).json({
      error: err.code || 'SERVER_ERROR',
      message: err.message || 'Failed to re-assign user team sponsor.',
    });
  }
});

/**
 * GET /api/admin/users/:userId/360 & GET /api/admin/users/:userId
 * Returns complete server-authoritative User 360° details:
 * Profile, Wallet Overview, Address History, Withdrawals, Nodes, Orders, Transactions, Sessions, Security & Audit Logs.
 */
const handleGetUser360 = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const data = await getUser360Details(userId);
    return res.status(200).json({
      success: true,
      ...data,
    });
  } catch (err: any) {
    console.error('[Admin API] Error fetching User 360 details:', err);
    return res.status(err.statusCode || 500).json({
      error: err.statusCode === 404 ? 'USER_NOT_FOUND' : 'SERVER_ERROR',
      message: err.message || 'Failed to retrieve User 360 details.',
    });
  }
};

adminRouter.get('/users/:userId/360', handleGetUser360);
adminRouter.get('/users/:userId/details', handleGetUser360);

/**
 * POST /api/admin/users/:userId/wallet/adjustments
 * Secure, server-authoritative administrative CREDIT or DEBIT wallet adjustment.
 * Executes inside ONE PostgreSQL transaction with FOR UPDATE row locks, safe decimal checks,
 * negative balance protection, strict idempotency, immutable financial_ledger_entries, and audit log.
 */
adminRouter.post('/users/:userId/wallet/adjustments', adminFinancialLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const admin = req.user!;
    const { userId } = req.params;
    const { asset, direction, amount, reason, idempotencyKey } = req.body || {};

    const ipAddress = (req.headers['x-forwarded-for'] as string) || req.ip;

    const result = await executeAdminWalletAdjustment({
      adminUserId: admin.id,
      adminPublicId: admin.public_id,
      targetUserId: userId,
      asset,
      direction,
      amount,
      reason,
      idempotencyKey,
      ipAddress,
    });

    return res.status(200).json(result);
  } catch (err: any) {
    console.error('[Admin API] Error executing wallet adjustment:', err);
    return res.status(err.statusCode || 500).json({
      error: err.statusCode === 400 ? 'INVALID_ADJUSTMENT' : 'SERVER_ERROR',
      message: err.message || 'Failed to execute administrative wallet adjustment.',
    });
  }
});

/**
 * POST /api/admin/users/:userId/lock
 * Locks target user account and immediately revokes all active user sessions.
 */
adminRouter.post('/users/:userId/lock', async (req: AuthRequest, res: Response) => {
  try {
    const admin = req.user!;
    const { userId } = req.params;
    const { reason } = req.body || {};
    const ipAddress = (req.headers['x-forwarded-for'] as string) || req.ip;

    const result = await setUserAccountStatus({
      adminUserId: admin.id,
      adminPublicId: admin.public_id,
      targetUserId: userId,
      status: 'LOCKED',
      reason: reason || 'Administrative lock applied to user account.',
      ipAddress,
    });

    return res.status(200).json(result);
  } catch (err: any) {
    console.error('[Admin API] Error locking user account:', err);
    return res.status(err.statusCode || 500).json({
      error: 'LOCK_FAILED',
      message: err.message || 'Failed to lock user account.',
    });
  }
});

/**
 * POST /api/admin/users/:userId/unlock
 * Unlocks target user account.
 */
adminRouter.post('/users/:userId/unlock', async (req: AuthRequest, res: Response) => {
  try {
    const admin = req.user!;
    const { userId } = req.params;
    const { reason } = req.body || {};
    const ipAddress = (req.headers['x-forwarded-for'] as string) || req.ip;

    const result = await setUserAccountStatus({
      adminUserId: admin.id,
      adminPublicId: admin.public_id,
      targetUserId: userId,
      status: 'ACTIVE',
      reason: reason || 'Administrative unlock applied to user account.',
      ipAddress,
    });

    return res.status(200).json(result);
  } catch (err: any) {
    console.error('[Admin API] Error unlocking user account:', err);
    return res.status(err.statusCode || 500).json({
      error: 'UNLOCK_FAILED',
      message: err.message || 'Failed to unlock user account.',
    });
  }
});

/**
 * POST /api/admin/users/:userId/sessions/revoke
 * Revokes all active user sessions for target user.
 */
adminRouter.post('/users/:userId/sessions/revoke', async (req: AuthRequest, res: Response) => {
  try {
    const admin = req.user!;
    const { userId } = req.params;
    const { reason } = req.body || {};
    const ipAddress = (req.headers['x-forwarded-for'] as string) || req.ip;

    const result = await revokeUserSessions({
      adminUserId: admin.id,
      adminPublicId: admin.public_id,
      targetUserId: userId,
      reason: reason || 'Administrative session revocation requested.',
      ipAddress,
    });

    return res.status(200).json(result);
  } catch (err: any) {
    console.error('[Admin API] Error revoking user sessions:', err);
    return res.status(err.statusCode || 500).json({
      error: 'REVOKE_FAILED',
      message: err.message || 'Failed to revoke active user sessions.',
    });
  }
});

/**
 * GET /api/admin/nodes
 * Returns paginated node inventory items.
 */
adminRouter.get('/nodes', async (req: AuthRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 20;
    const search = (req.query.search as string) || undefined;
    const status = (req.query.status as string) || undefined;

    const data = await getAdminNodesList(page, limit, status, search);
    return res.status(200).json(data);
  } catch (err: any) {
    console.error('[Admin API] Error fetching nodes:', err);
    return res.status(500).json({
      error: 'SERVER_ERROR',
      message: 'Failed to fetch node inventory.',
    });
  }
});

/**
 * GET /api/admin/orders
 * Returns paginated node purchase orders.
 */
adminRouter.get('/orders', async (req: AuthRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 20;
    const search = (req.query.search as string) || undefined;
    const status = (req.query.status as string) || undefined;

    const data = await getAdminOrdersList(page, limit, status, search);
    return res.status(200).json(data);
  } catch (err: any) {
    console.error('[Admin API] Error fetching orders:', err);
    return res.status(500).json({
      error: 'SERVER_ERROR',
      message: 'Failed to fetch node orders.',
    });
  }
});

/**
 * GET /api/admin/withdrawals
 * Returns system-wide user withdrawal requests.
 */
adminRouter.get('/withdrawals', async (req: AuthRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 20;
    const search = (req.query.search as string) || undefined;
    const status = (req.query.status as string) || undefined;

    const data = await getAdminWithdrawalsList(page, limit, status, search);
    return res.status(200).json(data);
  } catch (err: any) {
    console.error('[Admin API] Error fetching withdrawals:', err);
    return res.status(500).json({
      error: 'SERVER_ERROR',
      message: 'Failed to fetch withdrawal requests.',
    });
  }
});

/**
 * POST /api/admin/withdrawals/settle
 * Process administrative withdrawal state machine action (APPROVE, COMPLETE, REJECT, FAIL).
 * Logs audit record upon action execution.
 */
adminRouter.post('/withdrawals/settle', async (req: AuthRequest, res: Response) => {
  try {
    const { publicId, action, rejectionReason, txHash } = req.body;

    if (!publicId || !action) {
      return res.status(400).json({
        error: 'BAD_REQUEST',
        message: 'Missing publicId or action parameter.',
      });
    }

    const adminUserId = req.user?.id || null;
    const adminPublicId = req.user?.public_id || 'SYSTEM_ADMIN';

    const updated = await settleWithdrawalAction({
      withdrawalIdOrPublicId: String(publicId),
      action: action.toUpperCase() as any,
      rejectionReason: rejectionReason ? String(rejectionReason) : undefined,
      txHash: txHash ? String(txHash).trim() : undefined,
    });

    const finalRecord = updated;
    const payoutTxHash: string | null = txHash ? String(txHash).trim() : null;

    // Log admin financial audit trail
    await logAdminAction({
      adminUserId,
      adminPublicId,
      action: `WITHDRAWAL_${action.toUpperCase()}`,
      targetType: 'WITHDRAWAL',
      targetId: updated.publicWithdrawalId,
      details: `Admin ${adminPublicId} executed ${action.toUpperCase()} on withdrawal ${updated.publicWithdrawalId} ($${updated.amount.toFixed(2)} USD).${payoutTxHash ? ` TxHash: ${payoutTxHash}` : ''}`,
      metadata: {
        amount: updated.amount,
        status: finalRecord.status,
        txHash: payoutTxHash,
        destinationType: updated.destinationType,
        destinationReference: updated.destinationReference,
        rejectionReason: updated.rejectionReason,
      },
      ipAddress: (req.headers['x-forwarded-for'] as string) || req.ip,
    });

    return res.status(200).json({
      ...finalRecord,
      txHash: payoutTxHash,
    });
  } catch (err: any) {
    const message = err?.message || 'Failed to process settlement action.';
    if (message.startsWith('NOT_FOUND')) {
      return res.status(404).json({ error: 'NOT_FOUND', message });
    }
    if (message.startsWith('INVALID_STATE') || message.startsWith('INVALID_ACTION')) {
      return res.status(400).json({ error: 'INVALID_STATE', message });
    }
    console.error('[Admin API] Settlement error:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message });
  }
});

/**
 * POST /api/admin/withdrawals/instant-payout
 * Admin 1-Click Instant Blockchain Payout trigger using production payout engine.
 */
adminRouter.post('/withdrawals/instant-payout', async (req: AuthRequest, res: Response) => {
  try {
    const { publicId } = req.body;

    if (!publicId) {
      return res.status(400).json({
        error: 'BAD_REQUEST',
        message: 'Missing publicId parameter.',
      });
    }

    const { broadcastBlockchainWithdrawal } = await import('../services/bscSignerService');
    const result = await broadcastBlockchainWithdrawal({
      withdrawalPublicId: String(publicId),
      forceBypassDisabled: true,
    });

    const adminUserId = req.user?.id || null;
    const adminPublicId = req.user?.public_id || 'SYSTEM_ADMIN';
    await logAdminAction({
      adminUserId,
      adminPublicId,
      action: 'WITHDRAWAL_INSTANT_PAYOUT',
      targetType: 'WITHDRAWAL',
      targetId: String(publicId),
      details: `Admin ${adminPublicId} executed instant payout for withdrawal ${publicId}. TxHash: ${result.txHash}`,
      metadata: {
        amount: result.withdrawal.amount,
        status: result.withdrawal.status,
        txHash: result.txHash,
        destinationType: result.withdrawal.destinationType,
        destinationReference: result.withdrawal.destinationReference,
      },
      ipAddress: (req.headers['x-forwarded-for'] as string) || req.ip,
    });

    return res.status(200).json({
      success: true,
      message: `Instant Payout executed! Transferred funds on-chain with TxHash: ${result.txHash}.`,
      data: result,
      withdrawal: result.withdrawal,
      txHash: result.txHash,
    });
  } catch (err: any) {
    const message = err?.message || 'Failed to execute 1-click instant payout.';
    console.error('[Admin API] 1-Click Instant payout error:', err);
    return res.status(500).json({ error: 'INSTANT_PAYOUT_FAILED', message });
  }
});

/**
 * GET /api/admin/transactions
 * Read-only financial ledger transactions across all users.
 */
adminRouter.get('/transactions', async (req: AuthRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 20;
    const search = (req.query.search as string) || undefined;
    const type = (req.query.type as string) || undefined;

    const data = await getAdminTransactionsList(page, limit, type, search);
    return res.status(200).json(data);
  } catch (err: any) {
    console.error('[Admin API] Error fetching transactions:', err);
    return res.status(500).json({
      error: 'SERVER_ERROR',
      message: 'Failed to fetch ledger transactions.',
    });
  }
});

/**
 * GET /api/admin/audit-logs/feed
 * Unified audit feed combining real-time node activations, financial transactions, and admin actions.
 */
adminRouter.get('/audit-logs/feed', async (req: AuthRequest, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string, 10) || 50;
    const category = (req.query.category as string) || undefined;
    const search = (req.query.search as string) || undefined;

    const data = await getUnifiedAuditFeed(limit, category, search);
    return res.status(200).json(data);
  } catch (err: any) {
    console.error('[Admin API] Error fetching unified audit feed:', err);
    return res.status(500).json({
      error: 'SERVER_ERROR',
      message: 'Failed to fetch unified audit feed.',
    });
  }
});

/**
 * GET /api/admin/audit-logs
 * Returns audit log trail for administrative actions.
 */
adminRouter.get('/audit-logs', async (req: AuthRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 20;
    const action = (req.query.action as string) || undefined;

    const data = await getAdminAuditLogs(page, limit, action);
    return res.status(200).json(data);
  } catch (err: any) {
    console.error('[Admin API] Error fetching audit logs:', err);
    return res.status(500).json({
      error: 'SERVER_ERROR',
      message: 'Failed to fetch audit logs.',
    });
  }
});

// ============================================================================
// TASK #21: FINANCIAL RECONCILIATION & AUDIT ENDPOINTS
// ============================================================================

/**
 * POST /api/admin/reconciliation/run
 * Initiates an authoritative, server-side read-only financial reconciliation run.
 */
adminRouter.post('/reconciliation/run', adminFinancialLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const adminUserId = req.user?.id || null;
    const adminPublicId = req.user?.public_id || 'ADMIN';

    const result = await runFinancialReconciliation({
      adminUserId,
      adminPublicId,
    });

    return res.status(200).json({
      success: true,
      run: result,
    });
  } catch (err: any) {
    console.error('[Admin API] Error running financial reconciliation:', err);
    return res.status(500).json({
      error: 'SERVER_ERROR',
      message: err.message || 'Failed to execute financial reconciliation run.',
    });
  }
});

/**
 * GET /api/admin/reconciliation/latest
 * Retrieves the latest completed or running financial reconciliation run.
 */
adminRouter.get('/reconciliation/latest', async (req: AuthRequest, res: Response) => {
  try {
    const latest = await getLatestReconciliationRun();
    return res.status(200).json({
      success: true,
      run: latest,
    });
  } catch (err: any) {
    console.error('[Admin API] Error retrieving latest reconciliation run:', err);
    return res.status(500).json({
      error: 'SERVER_ERROR',
      message: 'Failed to retrieve latest reconciliation run.',
    });
  }
});

/**
 * GET /api/admin/reconciliation/issues
 * Retrieves paginated reconciliation issues with optional filtering.
 */
adminRouter.get('/reconciliation/issues', async (req: AuthRequest, res: Response) => {
  try {
    const runId = (req.query.runId as string) || undefined;
    const issueType = (req.query.issueType as string) || undefined;
    const asset = (req.query.asset as string) || undefined;
    const limit = parseInt(req.query.limit as string, 10) || 50;
    const offset = parseInt(req.query.offset as string, 10) || 0;

    const data = await getReconciliationIssues({
      runId,
      issueType,
      asset,
      limit,
      offset,
    });

    return res.status(200).json({
      success: true,
      issues: data.issues,
      total: data.total,
    });
  } catch (err: any) {
    console.error('[Admin API] Error retrieving reconciliation issues:', err);
    return res.status(500).json({
      error: 'SERVER_ERROR',
      message: 'Failed to retrieve reconciliation issues.',
    });
  }
});

// ----------------------------------------------------------------------------
// ADMIN DYNAMIC EMAIL & TEMPLATES MANAGEMENT
// ----------------------------------------------------------------------------

/**
 * GET /api/admin/email/templates
 * Retrieves all email templates (admin-only).
 */
adminRouter.get('/email/templates', async (req: AuthRequest, res: Response) => {
  try {
    const templates = await getEmailTemplates();
    return res.status(200).json({ success: true, templates });
  } catch (err: any) {
    console.error('[Admin API] Error retrieving email templates:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to retrieve email templates.' });
  }
});

/**
 * PUT /api/admin/email/templates/:id
 * Updates an existing email template (admin-only).
 */
adminRouter.put('/email/templates/:id', async (req: AuthRequest, res: Response) => {
  try {
    const admin = req.user!;
    const { id } = req.params;
    const { subject, bodyHtml, enabled } = req.body || {};

    if (!subject || !bodyHtml || typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'INVALID_INPUT', message: 'Subject, bodyHtml, and enabled are required.' });
    }

    const updated = await updateEmailTemplate(admin.id, admin.public_id, id, { subject, bodyHtml, enabled });
    return res.status(200).json({ success: true, template: updated });
  } catch (err: any) {
    console.error('[Admin API] Error updating email template:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to update email template.' });
  }
});

/**
 * POST /api/admin/email/campaign
 * Sends an on-demand broadcast campaign to target audiences (admin-only).
 */
adminRouter.post('/email/campaign', async (req: AuthRequest, res: Response) => {
  try {
    const admin = req.user!;
    const { subject, bodyHtml, audience } = req.body || {};

    if (!subject || !bodyHtml || !audience || !['ALL', 'ACTIVE_USERS', 'NODE_HOLDERS'].includes(audience)) {
      return res.status(400).json({ error: 'INVALID_INPUT', message: 'Subject, bodyHtml, and a valid audience are required.' });
    }

    const result = await sendBroadcastCampaign(admin.id, admin.public_id, { subject, bodyHtml, audience });
    return res.status(200).json({ success: true, queuedCount: result.queuedCount });
  } catch (err: any) {
    console.error('[Admin API] Error broadcasting email campaign:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to dispatch email campaign.' });
  }
});

// ----------------------------------------------------------------------------
// ADMIN AUTOMATED PERFORMANCE FOLLOW-UP RULES
// ----------------------------------------------------------------------------

/**
 * GET /api/admin/email/automation
 * Retrieves all configured automated performance follow-up rules (admin-only).
 */
adminRouter.get('/email/automation', async (req: AuthRequest, res: Response) => {
  try {
    const rules = await getAutomationRules();
    return res.status(200).json({ success: true, rules });
  } catch (err: any) {
    console.error('[Admin API] Error retrieving automation rules:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to retrieve automation rules.' });
  }
});

/**
 * POST /api/admin/email/automation
 * Creates a new performance follow-up rule (admin-only).
 */
adminRouter.post('/email/automation', async (req: AuthRequest, res: Response) => {
  try {
    const admin = req.user!;
    const { name, enabled, triggerCriteria, delayHours, cooldownDays, templateId } = req.body || {};

    if (!name || typeof enabled !== 'boolean' || !triggerCriteria || typeof delayHours !== 'number' || typeof cooldownDays !== 'number' || !templateId) {
      return res.status(400).json({ error: 'INVALID_INPUT', message: 'All rule configuration parameters are required.' });
    }

    const created = await createAutomationRule(admin.id, admin.public_id, {
      name,
      enabled,
      triggerCriteria,
      delayHours,
      cooldownDays,
      templateId
    });

    return res.status(201).json({ success: true, rule: created });
  } catch (err: any) {
    console.error('[Admin API] Error creating automation rule:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to create automation rule.' });
  }
});

/**
 * PUT /api/admin/email/automation/:id
 * Updates an existing automation rule (admin-only).
 */
adminRouter.put('/email/automation/:id', async (req: AuthRequest, res: Response) => {
  try {
    const admin = req.user!;
    const { id } = req.params;
    const { name, enabled, triggerCriteria, delayHours, cooldownDays, templateId } = req.body || {};

    if (!name || typeof enabled !== 'boolean' || !triggerCriteria || typeof delayHours !== 'number' || typeof cooldownDays !== 'number' || !templateId) {
      return res.status(400).json({ error: 'INVALID_INPUT', message: 'All rule parameters are required.' });
    }

    const updated = await updateAutomationRule(admin.id, admin.public_id, id, {
      name,
      enabled,
      triggerCriteria,
      delayHours,
      cooldownDays,
      templateId
    });

    return res.status(200).json({ success: true, rule: updated });
  } catch (err: any) {
    console.error('[Admin API] Error updating automation rule:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to update automation rule.' });
  }
});

/**
 * DELETE /api/admin/email/automation/:id
 * Deletes an automation rule (admin-only).
 */
adminRouter.delete('/email/automation/:id', async (req: AuthRequest, res: Response) => {
  try {
    const admin = req.user!;
    const { id } = req.params;
    const deleted = await deleteAutomationRule(admin.id, admin.public_id, id);
    if (!deleted) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Automation rule not found.' });
    }
    return res.status(200).json({ success: true, id });
  } catch (err: any) {
    console.error('[Admin API] Error deleting automation rule:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to delete automation rule.' });
  }
});

// ----------------------------------------------------------------------------
// ADMIN EMAIL QUEUE & OUTBOX MONITORING
// ----------------------------------------------------------------------------

/**
 * GET /api/admin/email/queue
 * Retrieves paginated email queue items with optional status and search filters (admin-only).
 */
adminRouter.get('/email/queue', async (req: AuthRequest, res: Response) => {
  try {
    const status = req.query.status as string | undefined;
    const search = req.query.search as string | undefined;
    const limit = parseInt(req.query.limit as string, 10) || 20;
    const offset = parseInt(req.query.offset as string, 10) || 0;

    const data = await getEmailQueue({ status, search, limit, offset });
    const stats = await getEmailQueueStats();

    return res.status(200).json({
      success: true,
      items: data.items,
      total: data.total,
      stats,
    });
  } catch (err: any) {
    console.error('[Admin API] Error retrieving email queue:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to retrieve email queue.' });
  }
});

/**
 * GET /api/admin/email/stats
 * Retrieves email queue summary metrics (admin-only).
 */
adminRouter.get('/email/stats', async (req: AuthRequest, res: Response) => {
  try {
    const stats = await getEmailQueueStats();
    return res.status(200).json({ success: true, stats });
  } catch (err: any) {
    console.error('[Admin API] Error retrieving email stats:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to retrieve email stats.' });
  }
});

/**
 * POST /api/admin/email/queue/process
 * Manually triggers immediate processing of pending queued emails (admin-only).
 */
adminRouter.post('/email/queue/process', async (req: AuthRequest, res: Response) => {
  try {
    await processEmailQueue();
    const stats = await getEmailQueueStats();
    return res.status(200).json({
      success: true,
      message: 'Email queue processing completed successfully.',
      stats,
    });
  } catch (err: any) {
    console.error('[Admin API] Error processing email queue:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to process email queue.' });
  }
});

/**
 * POST /api/admin/email/queue/retry/:id
 * Retries a failed email from the queue (admin-only).
 */
adminRouter.post('/email/queue/retry/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const retried = await retryQueueItem(id);
    if (!retried) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Queue item not found or could not be retried.' });
    }
    return res.status(200).json({ success: true, message: 'Email re-queued for processing.', id });
  } catch (err: any) {
    console.error('[Admin API] Error retrying email queue item:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to retry email queue item.' });
  }
});



