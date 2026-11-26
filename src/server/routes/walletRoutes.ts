import { Router, Response } from 'express';
import { requireAuth, requireAdmin, AuthRequest } from '../middleware/authMiddleware';
import {
  getWalletSummary,
  getWalletTransactions,
  executeEcosystemWalletTransfer,
} from '../services/walletLedgerService';
import {
  getUserUnifiedStatement,
  verifyAllUsersLedgerReconciliation,
} from '../services/unifiedLedgerService';
import { executeInternalReinvest } from '../services/internalCompoundingService';
import { withdrawalLimiter } from '../middleware/rateLimiter';
import {
  lookupP2pRecipient,
  requestP2pTransferOtp,
  executeP2pInternalTransfer,
  getUserP2pTransferHistory,
  P2pTransferError,
  P2pAssetType,
} from '../services/p2pTransferService';

export const walletRouter = Router();
export const adminLedgerRouter = Router();

/**
 * GET /api/wallet/me
 * 
 * Returns the authenticated user's wallet summary:
 * - totalEarned
 * - totalReversed
 * - ledgerBalance
 * - transactionCount
 * - breakdown
 */
const handleGetWalletSummary = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const summary = await getWalletSummary(userId);
    return res.status(200).json(summary);
  } catch (err: any) {
    console.error('[Wallet API] Error in GET wallet summary:', err);
    return res.status(500).json({ error: 'Failed to retrieve wallet summary' });
  }
};

/**
 * GET /api/wallet/me and GET /api/wallet/summary
 */
walletRouter.get('/me', requireAuth, handleGetWalletSummary);
walletRouter.get('/summary', requireAuth, handleGetWalletSummary);

/**
 * GET /api/wallet/unified-statement
 * TASK-09 Step 2 & 5: Returns unified categorized ledger statement + live zero-sum reconciliation check.
 * Query params:
 * - category (optional: PRODUCT_YIELD, UNILEVEL_ROYALTY, LEADERSHIP_RANK, INVESTMENT_DEBIT, WITHDRAWAL, DEPOSIT, or ALL)
 * - limit (default 50, max 200)
 * - offset (default 0)
 */
walletRouter.get('/unified-statement', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const category = (req.query.category as string) || 'ALL';
    const limit = parseInt(req.query.limit as string, 10) || 50;
    const offset = parseInt(req.query.offset as string, 10) || 0;

    const statement = await getUserUnifiedStatement({
      userId,
      category,
      limit,
      offset,
    });

    return res.status(200).json({
      success: true,
      ...statement,
    });
  } catch (err: any) {
    console.error('[Wallet API] Error in GET /api/wallet/unified-statement:', err);
    return res.status(500).json({
      error: 'UNIFIED_STATEMENT_ERROR',
      message: err?.message || 'Failed to retrieve unified wallet statement.',
    });
  }
});

/**
 * POST /api/wallet/reinvest
 * TASK-09 Step 3 & 5: Executes atomic internal compounding / re-investment into:
 * - TRADING_POOL (PHIVONEX QUANTUM ALPHA™, min $200.00000000)
 * - CHRONO_VAULT (PHIVONEX CHRONO VAULTS™, min $100.00000000, requires planCode)
 * - NODE_VAULT (Node Purchase Vault transfer for PHIVONEX GENESIS CORE™, > $0)
 */
walletRouter.post('/reinvest', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const {
      targetProduct,
      amountUsd,
      amount,
      planCode,
      idempotencyKey,
    } = req.body || {};

    const headerIdempotencyKey = req.headers['idempotency-key'];
    const resolvedIdempotencyKey =
      idempotencyKey !== undefined && idempotencyKey !== null
        ? String(idempotencyKey)
        : typeof headerIdempotencyKey === 'string'
        ? headerIdempotencyKey
        : undefined;

    const resolvedAmount = amountUsd !== undefined ? amountUsd : amount;

    const result = await executeInternalReinvest({
      userId,
      targetProduct,
      amountUsd: resolvedAmount,
      planCode: planCode ? String(planCode) : undefined,
      idempotencyKey: resolvedIdempotencyKey,
    });

    return res.status(result.isDuplicate ? 200 : 201).json({
      success: true,
      reinvestment: result,
    });
  } catch (err: any) {
    const code = err?.code || 'REINVEST_ERROR';
    const statusCode = err?.statusCode || 400;
    return res.status(statusCode).json({
      error: code,
      message: err?.message || 'Failed to execute internal compounding re-investment.',
    });
  }
});

/**
 * GET /api/admin/ledger/reconcile
 * TASK-09 Step 2 & 5: Admin sweep verifying zero-sum double-entry ledger balance integrity across users.
 */
adminLedgerRouter.get('/reconcile', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string, 10) || 500;
    const report = await verifyAllUsersLedgerReconciliation(limit);
    return res.status(200).json({
      success: true,
      ...report,
    });
  } catch (err: any) {
    console.error('[Admin Ledger API] Error in GET /api/admin/ledger/reconcile:', err);
    return res.status(500).json({
      error: 'LEDGER_RECONCILE_ERROR',
      message: err?.message || 'Failed to execute system ledger reconciliation sweep.',
    });
  }
});

/**
 * GET /api/wallet/transactions
 * 
 * Returns paginated financial ledger transactions for the authenticated user.
 * Query params:
 * - page (default 1)
 * - limit (default 20, max 100)
 */
walletRouter.get('/transactions', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 20;
    const typeFilter = (req.query.type as string) || (req.query.sourceType as string) || (req.query.category as string) || undefined;
    const entryTypeFilter = (req.query.entryType as string) || undefined;
    const search = (req.query.search as string) || (req.query.q as string) || undefined;

    const result = await getWalletTransactions(userId, page, limit, typeFilter, search, entryTypeFilter);
    return res.status(200).json(result);
  } catch (err: any) {
    console.error('[Wallet API] Error in GET /api/wallet/transactions:', err);
    return res.status(500).json({ error: 'Failed to retrieve wallet transactions' });
  }
});

/**
 * POST /api/wallet/transfer
 * 
 * Executes an internal transfer between user ecosystem vaults/wallets.
 * Body:
 * - fromVault: 'MAIN_WALLET' | 'NODE_VAULT' | 'MINING_VAULT'
 * - toVault: 'MAIN_WALLET' | 'NODE_VAULT' | 'MINING_VAULT'
 * - amount: number
 * - currency: string (default 'USDT')
 */
walletRouter.post('/transfer', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { fromVault = 'MAIN_WALLET', toVault = 'NODE_VAULT', amount, currency = 'USDT' } = req.body || {};

    const parsedAmount = Number(amount);
    if (!parsedAmount || parsedAmount <= 0 || isNaN(parsedAmount)) {
      return res.status(400).json({
        error: 'INVALID_AMOUNT',
        message: 'Please specify a valid transfer amount greater than 0.',
      });
    }

    const result = await executeEcosystemWalletTransfer(
      userId,
      fromVault,
      toVault,
      parsedAmount,
      currency.toUpperCase()
    );

    return res.status(200).json({
      success: true,
      message: `Successfully transferred $${parsedAmount.toFixed(2)} ${currency.toUpperCase()} to ${toVault === 'NODE_VAULT' ? 'Node Purchase Vault' : toVault}!`,
      transfer: result,
    });
  } catch (err: any) {
    console.error('[Wallet API] Error executing wallet transfer:', err);
    return res.status(400).json({
      error: err.code || 'TRANSFER_ERROR',
      message: err.message || 'Failed to execute internal wallet transfer.',
    });
  }
});

// ============================================================================
// USER-TO-USER (P2P) INTERNAL BALANCE TRANSFERS (USDT & PHIVO)
// ============================================================================

/**
 * GET /api/wallet/transfer/recipient?query=<email_or_user_code>
 * Resolves an active recipient by normalized Email or User Code (PHX-XXXXXX).
 */
walletRouter.get('/transfer/recipient', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const senderUserId = req.user!.id;
    const query = String(req.query.query || '').trim();
    const recipient = await lookupP2pRecipient(senderUserId, query);
    return res.status(200).json({
      success: true,
      recipient,
    });
  } catch (err: any) {
    const status = err instanceof P2pTransferError ? err.statusCode : 400;
    const code = err instanceof P2pTransferError ? err.code : 'RECIPIENT_LOOKUP_ERROR';
    return res.status(status).json({
      error: code,
      message: err?.message || 'Unable to verify recipient.',
    });
  }
});

/**
 * POST /api/wallet/transfer/otp
 * Issues a 6-digit SHA-256 hashed Email OTP (10-minute expiry) to authorize a P2P transfer.
 */
walletRouter.post('/transfer/otp', requireAuth, withdrawalLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const senderUserId = req.user!.id;
    const senderEmail = req.user!.email;
    const { recipientQuery, assetType, amount } = req.body || {};

    const result = await requestP2pTransferOtp({
      senderUserId,
      senderEmail,
      recipientQuery: String(recipientQuery || ''),
      assetType: String(assetType || 'USDT').toUpperCase() as P2pAssetType,
      amount,
    });

    return res.status(200).json(result);
  } catch (err: any) {
    const status = err instanceof P2pTransferError ? err.statusCode : 400;
    const code = err instanceof P2pTransferError ? err.code : 'P2P_OTP_ERROR';
    return res.status(status).json({
      error: code,
      message: err?.message || 'Failed to dispatch P2P transfer verification code.',
    });
  }
});

/**
 * POST /api/wallet/transfer/send
 * Executes an atomic, idempotent, zero-sum P2P USDT or PHIVO transfer after Email OTP verification.
 */
walletRouter.post('/transfer/send', requireAuth, withdrawalLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const senderUserId = req.user!.id;
    const {
      recipientId,
      recipientQuery,
      assetType,
      amount,
      note,
      otpCode,
      idempotencyKey: bodyIdempotencyKey,
    } = req.body || {};

    const headerKey = req.headers['idempotency-key'];
    const idempotencyKey =
      typeof headerKey === 'string' && headerKey.trim().length > 0
        ? headerKey.trim()
        : String(bodyIdempotencyKey || '').trim();

    const result = await executeP2pInternalTransfer({
      senderUserId,
      recipientId: recipientId ? String(recipientId) : undefined,
      recipientQuery: recipientQuery ? String(recipientQuery) : undefined,
      assetType: String(assetType || 'USDT').toUpperCase() as P2pAssetType,
      amount,
      note: note !== undefined && note !== null ? String(note) : null,
      otpCode: String(otpCode || ''),
      idempotencyKey,
    });

    return res.status(result.replayed ? 200 : 201).json({
      success: true,
      transfer: result,
    });
  } catch (err: any) {
    const status = err instanceof P2pTransferError ? err.statusCode : 400;
    const code = err instanceof P2pTransferError ? err.code : 'P2P_TRANSFER_ERROR';
    return res.status(status).json({
      error: code,
      message: err?.message || 'Failed to execute P2P transfer.',
    });
  }
});

/**
 * GET /api/wallet/transfer/history
 * Returns recent sent and received P2P internal transfers for the authenticated user.
 */
walletRouter.get('/transfer/history', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const limit = parseInt(String(req.query.limit || '25'), 10) || 25;
    const transfers = await getUserP2pTransferHistory(userId, limit);
    return res.status(200).json({
      success: true,
      transfers,
    });
  } catch (err: any) {
    console.error('[Wallet API] Error fetching P2P transfer history:', err);
    return res.status(500).json({
      error: 'P2P_HISTORY_ERROR',
      message: 'Failed to retrieve P2P transfer history.',
    });
  }
});
