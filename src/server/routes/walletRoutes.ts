import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/authMiddleware';
import { getWalletSummary, getWalletTransactions, executeEcosystemWalletTransfer } from '../services/walletLedgerService';

export const walletRouter = Router();

/**
 * GET /api/wallet/me
 * 
 * Returns the authenticated user's wallet summary:
 * - totalEarned
 * - totalReversed
 * - ledgerBalance
 * - transactionCount
 * - breakdown: referral, matching, promotion
 * 
 * Rules:
 * - Read-only financial ledger summary.
 * - Server-authoritative calculations only.
 * - No withdrawal endpoints implemented.
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
