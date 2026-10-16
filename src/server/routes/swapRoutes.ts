import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/authMiddleware';
import { swapLimiter } from '../middleware/rateLimiter';
import {
  getSwapQuote,
  executeCoinToUsdtSwap,
  executeUsdtToCoinSwap,
  getUserSwapHistory,
  getUserCoinBalance,
} from '../services/coinSwapService';

export const swapRouter = Router();

/**
 * GET /api/swap/quote?amount=...
 * Returns informational quote for swapping coins to USDT based on active admin economic rate.
 */
swapRouter.get('/quote', async (req, res: Response): Promise<void> => {
  try {
    const rawAmount = req.query.amount ? parseFloat(req.query.amount as string) : 1;
    if (isNaN(rawAmount) || rawAmount <= 0) {
      res.status(400).json({
        error: 'INVALID_AMOUNT',
        message: 'Query parameter amount must be a positive number.',
      });
      return;
    }

    const quote = await getSwapQuote(rawAmount);
    res.status(200).json(quote);
  } catch (err: any) {
    if (err.code === 'SWAP_RATE_NOT_CONFIGURED' || err.message?.includes('SWAP_RATE_NOT_CONFIGURED')) {
      res.status(400).json({
        error: 'SWAP_RATE_NOT_CONFIGURED',
        message: 'Internal coin conversion rate is not configured by PHIVONEX administration.',
      });
      return;
    }
    if (err.code === 'SWAP_DISABLED' || err.message?.includes('SWAP_DISABLED')) {
      res.status(400).json({
        error: 'SWAP_DISABLED',
        message: 'Internal coin swapping is currently disabled by administration.',
      });
      return;
    }

    console.error('[Swap API] Error in GET /api/swap/quote:', err);
    res.status(500).json({
      error: 'SERVER_ERROR',
      message: 'Failed to generate swap quote.',
    });
  }
});

/**
 * GET /api/swap/balance
 * Returns authenticated user's available PHIVONEX coin balance.
 */
swapRouter.get('/balance', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const balance = await getUserCoinBalance(user.id);
    res.status(200).json(balance);
  } catch (err: any) {
    console.error('[Swap API] Error in GET /api/swap/balance:', err);
    res.status(500).json({
      error: 'SERVER_ERROR',
      message: 'Failed to retrieve user coin balance.',
    });
  }
});

/**
 * GET /api/swap/history
 * Returns authenticated user's swap transactions and aggregate totals.
 */
swapRouter.get('/history', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
    const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;

    const data = await getUserSwapHistory(user.id, { limit, offset });
    res.status(200).json(data);
  } catch (err: any) {
    console.error('[Swap API] Error in GET /api/swap/history:', err);
    res.status(500).json({
      error: 'SERVER_ERROR',
      message: 'Failed to retrieve swap history.',
    });
  }
});

/**
 * POST /api/swap/coin-to-usdt
 * Authoritative swap execution: debits user's coin balance and credits USDT ledger balance.
 */
swapRouter.post('/coin-to-usdt', requireAuth, swapLimiter, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const { coinAmount, idempotencyKey } = req.body;

    const parsedAmount = typeof coinAmount === 'number' ? coinAmount : parseFloat(coinAmount);
    if (isNaN(parsedAmount) || !isFinite(parsedAmount) || parsedAmount <= 0) {
      res.status(400).json({
        error: 'INVALID_AMOUNT',
        message: 'Coin amount must be a positive number greater than 0.',
      });
      return;
    }

    const result = await executeCoinToUsdtSwap({
      userId: user.id,
      coinAmount: parsedAmount,
      idempotencyKey,
    });

    res.status(200).json(result);
  } catch (err: any) {
    const code = err.code || (err.message && err.message.split(':')[0]) || 'SERVER_ERROR';

    if (code === 'INSUFFICIENT_COIN_BALANCE') {
      res.status(400).json({
        error: 'INSUFFICIENT_COIN_BALANCE',
        message: err.message?.replace('INSUFFICIENT_COIN_BALANCE: ', '') || 'Insufficient PHIVONEX coin balance.',
      });
      return;
    }

    if (code === 'SWAP_DISABLED') {
      res.status(400).json({
        error: 'SWAP_DISABLED',
        message: 'Internal coin swapping is currently disabled by administration.',
      });
      return;
    }

    if (code === 'SWAP_RATE_NOT_CONFIGURED') {
      res.status(400).json({
        error: 'SWAP_RATE_NOT_CONFIGURED',
        message: 'Internal coin conversion rate is not configured by PHIVONEX administration.',
      });
      return;
    }

    console.error('[Swap API] Error in POST /api/swap/coin-to-usdt:', err);
    res.status(500).json({
      error: 'SERVER_ERROR',
      message: err.message || 'Failed to execute coin swap.',
    });
  }
});

/**
 * POST /api/swap/usdt-to-coin
 * Authoritative swap execution: debits user's USDT ledger balance and credits PHIVO coins.
 */
swapRouter.post('/usdt-to-coin', requireAuth, swapLimiter, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const { usdtAmount, idempotencyKey } = req.body;

    const parsedAmount = typeof usdtAmount === 'number' ? usdtAmount : parseFloat(usdtAmount);
    if (isNaN(parsedAmount) || !isFinite(parsedAmount) || parsedAmount <= 0) {
      res.status(400).json({
        error: 'INVALID_AMOUNT',
        message: 'USDT amount must be a positive number greater than 0.',
      });
      return;
    }

    const result = await executeUsdtToCoinSwap({
      userId: user.id,
      usdtAmount: parsedAmount,
      idempotencyKey,
    });

    res.status(200).json(result);
  } catch (err: any) {
    const code = err.code || (err.message && err.message.split(':')[0]) || 'SERVER_ERROR';

    if (code === 'INSUFFICIENT_USDT_BALANCE') {
      res.status(400).json({
        error: 'INSUFFICIENT_USDT_BALANCE',
        message: err.message?.replace('INSUFFICIENT_USDT_BALANCE: ', '') || 'Insufficient USDT ledger balance.',
      });
      return;
    }

    if (code === 'SWAP_DISABLED') {
      res.status(400).json({
        error: 'SWAP_DISABLED',
        message: 'Internal coin swapping is currently disabled by administration.',
      });
      return;
    }

    if (code === 'SWAP_RATE_NOT_CONFIGURED') {
      res.status(400).json({
        error: 'SWAP_RATE_NOT_CONFIGURED',
        message: 'Internal coin conversion rate is not configured by PHIVONEX administration.',
      });
      return;
    }

    console.error('[Swap API] Error in POST /api/swap/usdt-to-coin:', err);
    res.status(500).json({
      error: 'SERVER_ERROR',
      message: err.message || 'Failed to execute USDT to coin swap.',
    });
  }
});

export default swapRouter;
