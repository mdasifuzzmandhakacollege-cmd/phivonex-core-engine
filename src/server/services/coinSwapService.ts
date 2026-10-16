import { getDb } from '../db/db';
import { v4 as uuidv4 } from 'uuid';
import { generateSwapPublicId } from '../utils/idGenerator';
import { getEconomicConfigByKey, isCoinSwapEnabled } from './economicService';
import { postLedgerCredit } from './walletLedgerService';
import { notifyPhivoSwapCompleted } from './notificationService';

export interface CoinSwapTransactionRecord {
  id: string;
  publicSwapId: string;
  userId: string;
  coinAmount: number;
  rateUsdt: number;
  usdtAmount: number;
  status: 'PENDING' | 'COMPLETED' | 'REVERSED';
  rateVersion: number;
  idempotencyKey: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface SwapQuoteResponse {
  coinAmount: number;
  rate: number;
  usdtAmount: number;
  rateVersion: number;
  swapEnabled: boolean;
  coinSymbol: string;
  effectiveFrom: string;
}

export interface UserCoinBalanceResponse {
  availableCoinBalance: number;
  totalEarnedCoins: number;
  totalSwappedCoins: number;
  coinSymbol: string;
}

// In-memory mutex for serializing user swap transactions to prevent race conditions
const userSwapLocks = new Map<string, Promise<any>>();

async function runWithUserLock<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  const currentLock = userSwapLocks.get(userId) || Promise.resolve();
  let releaseLock: () => void;
  const newLock = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });

  userSwapLocks.set(userId, currentLock.then(() => newLock));

  try {
    await currentLock;
    return await fn();
  } finally {
    releaseLock!();
    if (userSwapLocks.get(userId) === newLock) {
      userSwapLocks.delete(userId);
    }
  }
}

/**
 * Calculates authenticated user's authoritative PHIVONEX reward coin balance.
 * Total Earned = Node Mining Rewards accrued/claimed (status != 'REVERSED')
 * Total Swapped = Completed coin_swap_transactions
 * Available = Math.max(0, Total Earned - Total Swapped)
 */
export async function getUserCoinBalance(userId: string): Promise<UserCoinBalanceResponse> {
  const db = await getDb();

  // 1. Total earned reward coins from node mining rewards
  const rewardsRes = await db.query<{ total: string | number }>(
    `
    SELECT COALESCE(SUM(amount), 0) AS total
    FROM node_rewards
    WHERE owner_user_id = $1 AND status != 'REVERSED'
    `,
    [userId]
  );
  const totalEarnedRewards = Number(rewardsRes.rows[0]?.total || 0);

  // 2. Total purchased coins (USDT swapped to PHIVO)
  const boughtRes = await db.query<{ total: string | number }>(
    `
    SELECT COALESCE(SUM(coin_amount), 0) AS total
    FROM coin_swap_transactions
    WHERE user_id = $1 AND status = 'COMPLETED' AND direction = 'USDT_TO_COIN' AND coin_amount > 0
    `,
    [userId]
  );
  const totalBoughtCoins = Number(boughtRes.rows[0]?.total || 0);

  // 3. Total sold coins (PHIVO swapped to USDT)
  const soldRes = await db.query<{ total: string | number }>(
    `
    SELECT COALESCE(SUM(coin_amount), 0) AS total
    FROM coin_swap_transactions
    WHERE user_id = $1 AND status = 'COMPLETED' AND (direction = 'COIN_TO_USDT' OR direction IS NULL) AND coin_amount > 0
    `,
    [userId]
  );
  const totalSoldCoins = Number(soldRes.rows[0]?.total || 0);

  // 4. Admin PHIVO credits & debits from financial_ledger_entries (ADMIN_ADJUSTMENT only)
  const adminPhivoRes = await db.query<{ entry_type: string; total: string | number }>(
    `
    SELECT entry_type, COALESCE(SUM(amount), 0) AS total
    FROM financial_ledger_entries
    WHERE user_id = $1 AND currency = 'PHIVO' AND status = 'SETTLED' AND source_type = 'ADMIN_ADJUSTMENT'
    GROUP BY entry_type
    `,
    [userId]
  );

  let adminPhivoCredits = 0;
  let adminPhivoDebits = 0;
  for (const row of adminPhivoRes.rows) {
    if (row.entry_type === 'CREDIT') adminPhivoCredits += Number(row.total);
    else if (row.entry_type === 'DEBIT' || row.entry_type === 'REVERSAL') adminPhivoDebits += Number(row.total);
  }

  const totalEarnedCoins = totalEarnedRewards + totalBoughtCoins + adminPhivoCredits;
  const availableCoinBalance = Math.max(0, Number((totalEarnedCoins - totalSoldCoins - adminPhivoDebits).toFixed(6)));

  return {
    availableCoinBalance,
    totalEarnedCoins,
    totalSwappedCoins: totalSoldCoins,
    coinSymbol: 'PHIVO',
  };
}

/**
 * Generates an informational real-time swap quote based on current active admin economic rate.
 */
export async function getSwapQuote(coinAmount: number): Promise<SwapQuoteResponse> {
  if (isNaN(coinAmount) || coinAmount <= 0) {
    throw new Error('INVALID_COIN_AMOUNT: Coin amount must be greater than zero.');
  }

  const coinConfig = await getEconomicConfigByKey('INTERNAL_COIN_PRICE_USDT');
  const globalSwapActive = await isCoinSwapEnabled();

  if (!coinConfig || coinConfig.status !== 'ACTIVE') {
    throw new Error('SWAP_RATE_NOT_CONFIGURED: Internal coin conversion rate is not configured.');
  }

  const val = coinConfig.configValue || {};
  const rateUsdt = Number(val.priceUsdt);
  if (isNaN(rateUsdt) || rateUsdt <= 0) {
    throw new Error('SWAP_RATE_NOT_CONFIGURED: Invalid coin conversion rate configured.');
  }

  const swapEnabled = globalSwapActive && val.swapEnabled !== false;
  const usdtAmount = Number((coinAmount * rateUsdt).toFixed(4));
  const rateVersion = coinConfig.version;
  const effectiveFrom = val.effectiveFrom || coinConfig.effectiveFrom;

  return {
    coinAmount,
    rate: rateUsdt,
    usdtAmount,
    rateVersion,
    swapEnabled,
    coinSymbol: 'PHIVO',
    effectiveFrom,
  };
}

/**
 * Authoritative Coin -> USDT Swap Execution Engine.
 *
 * Rules:
 * 1. Uses ONLY the active server-side rate & version from Task #19.
 * 2. Checks available coin balance before debiting.
 * 3. Enforces concurrency protection & idempotency key check.
 * 4. Debits coin balance atomically.
 * 5. Credits internal USDT ledger balance exactly once via postLedgerCredit.
 * 6. Historical swaps permanently record their executed rate & rate_version.
 */
export async function executeCoinToUsdtSwap(params: {
  userId: string;
  coinAmount: number;
  idempotencyKey?: string;
}): Promise<{
  success: boolean;
  swap: CoinSwapTransactionRecord;
  balances: {
    remainingCoinBalance: number;
    usdtCredited: number;
  };
}> {
  const { userId, coinAmount, idempotencyKey } = params;

  if (isNaN(coinAmount) || coinAmount <= 0) {
    throw new Error('INVALID_COIN_AMOUNT: Coin amount must be a positive number.');
  }

  return runWithUserLock(userId, async () => {
    const db = await getDb();

    // 1. Check Idempotency Key
    if (idempotencyKey && idempotencyKey.trim()) {
      const cleanKey = idempotencyKey.trim();
      const existingRes = await db.query<any>(
        `SELECT * FROM coin_swap_transactions WHERE user_id = $1 AND idempotency_key = $2`,
        [userId, cleanKey]
      );

      if (existingRes.rows.length > 0) {
        const row = existingRes.rows[0];
        const currentBal = await getUserCoinBalance(userId);
        return {
          success: true,
          swap: {
            id: row.id,
            publicSwapId: row.public_swap_id,
            userId: row.user_id,
            coinAmount: Number(row.coin_amount),
            rateUsdt: Number(row.rate_usdt),
            usdtAmount: Number(row.usdt_amount),
            status: row.status,
            rateVersion: Number(row.rate_version),
            idempotencyKey: row.idempotency_key,
            createdAt: new Date(row.created_at).toISOString(),
            completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
          },
          balances: {
            remainingCoinBalance: currentBal.availableCoinBalance,
            usdtCredited: Number(row.usdt_amount),
          },
        };
      }
    }

    // 2. Fetch authoritative active rate
    const coinConfig = await getEconomicConfigByKey('INTERNAL_COIN_PRICE_USDT');
    const globalSwapActive = await isCoinSwapEnabled();

    if (!coinConfig || coinConfig.status !== 'ACTIVE') {
      const err: any = new Error('SWAP_RATE_NOT_CONFIGURED: Internal coin conversion rate is not configured.');
      err.code = 'SWAP_RATE_NOT_CONFIGURED';
      throw err;
    }

    const val = coinConfig.configValue || {};
    const rateUsdt = Number(val.priceUsdt);
    if (isNaN(rateUsdt) || rateUsdt <= 0) {
      const err: any = new Error('SWAP_RATE_NOT_CONFIGURED: Active coin conversion rate is invalid or missing.');
      err.code = 'SWAP_RATE_NOT_CONFIGURED';
      throw err;
    }

    const isEnabled = globalSwapActive && val.swapEnabled !== false;
    if (!isEnabled) {
      const err: any = new Error('SWAP_DISABLED: Internal coin swapping is currently disabled by administration.');
      err.code = 'SWAP_DISABLED';
      throw err;
    }

    const rateVersion = coinConfig.version;

    // 3. Verify available coin balance
    const currentBal = await getUserCoinBalance(userId);
    if (coinAmount > currentBal.availableCoinBalance) {
      const err: any = new Error(
        `INSUFFICIENT_COIN_BALANCE: Requested swap of ${coinAmount} PHIVO exceeds available balance of ${currentBal.availableCoinBalance} PHIVO.`
      );
      err.code = 'INSUFFICIENT_COIN_BALANCE';
      throw err;
    }

    // 4. Calculate USDT proceeds
    const usdtAmount = Number((coinAmount * rateUsdt).toFixed(4));
    if (usdtAmount <= 0) {
      throw new Error('INVALID_SWAP_CALCULATION: Resulting USDT amount must be greater than zero.');
    }

    const id = uuidv4();
    const publicSwapId = generateSwapPublicId();
    const now = new Date();

    // 5. Insert swap transaction record
    const insertRes = await db.query<any>(
      `
      INSERT INTO coin_swap_transactions (
        id, public_swap_id, user_id, coin_amount, rate_usdt, usdt_amount,
        status, rate_version, idempotency_key, created_at, completed_at, direction
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'COMPLETED', $7, $8, $9, $9, 'COIN_TO_USDT')
      RETURNING *
      `,
      [
        id,
        publicSwapId,
        userId,
        coinAmount,
        rateUsdt,
        usdtAmount,
        rateVersion,
        idempotencyKey ? idempotencyKey.trim() : null,
        now,
      ]
    );

    const swapRow = insertRes.rows[0];

    // 6. Credit internal USDT financial ledger balance
    // Guarded strictly by UNIQUE(source_type, source_id, entry_type)
    await postLedgerCredit({
      userId,
      sourceType: 'COIN_SWAP',
      sourceId: swapRow.id,
      sourceRef: swapRow.public_swap_id,
      amount: usdtAmount,
      currency: 'USDT',
      description: `Internal Coin Swap - ${coinAmount} PHIVO @ $${rateUsdt.toFixed(2)} USDT (${publicSwapId})`,
      createdAt: now,
    });

    const newBalance = await getUserCoinBalance(userId);

    // Task #20: Trigger in-app notification for completed coin swap
    try {
      await notifyPhivoSwapCompleted({
        userId,
        coinAmount,
        usdtAmount,
        rateUsdt,
        swapId: swapRow.id,
      });
    } catch (notifErr) {
      console.warn('[Notification] Error triggering coin swap notification:', notifErr);
    }

    // Task #23.4: Send SWAP_COMPLETE email
    try {
      const userRes = await db.query<{ email: string; full_name: string; public_id: string }>(
        `SELECT email, full_name, public_id FROM users WHERE id = $1`,
        [userId]
      );
      if (userRes.rowCount > 0) {
        const user = userRes.rows[0];
        const { queueEventEmail } = await import('./emailService');
        
        await queueEventEmail(user.email, 'SWAP_COMPLETE', {
          displayName: user.full_name,
          publicId: user.public_id,
          fromAmount: String(coinAmount),
          toAmount: String(usdtAmount),
          rate: String(rateUsdt)
        });
      }
    } catch (emailErr) {
      console.warn('[EmailEngine] Failed to send Swap Complete email:', emailErr);
    }

    return {
      success: true,
      swap: {
        id: swapRow.id,
        publicSwapId: swapRow.public_swap_id,
        userId: swapRow.user_id,
        coinAmount: Number(swapRow.coin_amount),
        rateUsdt: Number(swapRow.rate_usdt),
        usdtAmount: Number(swapRow.usdt_amount),
        status: swapRow.status,
        rateVersion: Number(swapRow.rate_version),
        idempotencyKey: swapRow.idempotency_key,
        createdAt: new Date(swapRow.created_at).toISOString(),
        completedAt: swapRow.completed_at ? new Date(swapRow.completed_at).toISOString() : null,
      },
      balances: {
        remainingCoinBalance: newBalance.availableCoinBalance,
        usdtCredited: usdtAmount,
      },
    };
  });
}

/**
 * Returns authenticated user's swap history and aggregated totals.
 */
export async function getUserSwapHistory(
  userId: string,
  options?: { limit?: number; offset?: number }
): Promise<{
  swaps: CoinSwapTransactionRecord[];
  summary: {
    totalSwappedCoins: number;
    totalUsdtReceived: number;
    totalSwapsCount: number;
  };
  pagination: {
    limit: number;
    offset: number;
    totalCount: number;
  };
}> {
  const db = await getDb();
  const limit = Math.min(100, Math.max(1, options?.limit || 20));
  const offset = Math.max(0, options?.offset || 0);

  // Aggregated totals
  const aggRes = await db.query<{
    count: string | number;
    total_coins: string | number;
    total_usdt: string | number;
  }>(
    `
    SELECT 
      COUNT(*) as count,
      COALESCE(SUM(coin_amount), 0) as total_coins,
      COALESCE(SUM(usdt_amount), 0) as total_usdt
    FROM coin_swap_transactions
    WHERE user_id = $1 AND status = 'COMPLETED'
    `,
    [userId]
  );

  const totalSwapsCount = Number(aggRes.rows[0]?.count || 0);
  const totalSwappedCoins = Number(aggRes.rows[0]?.total_coins || 0);
  const totalUsdtReceived = Number(aggRes.rows[0]?.total_usdt || 0);

  // Paginated swaps
  const rowsRes = await db.query<any>(
    `
    SELECT * FROM coin_swap_transactions
    WHERE user_id = $1
    ORDER BY created_at DESC
    LIMIT $2 OFFSET $3
    `,
    [userId, limit, offset]
  );

  const swaps: CoinSwapTransactionRecord[] = rowsRes.rows.map((r) => ({
    id: r.id,
    publicSwapId: r.public_swap_id,
    userId: r.user_id,
    coinAmount: Number(r.coin_amount),
    rateUsdt: Number(r.rate_usdt),
    usdtAmount: Number(r.usdt_amount),
    status: r.status,
    rateVersion: Number(r.rate_version),
    idempotencyKey: r.idempotency_key,
    createdAt: new Date(r.created_at).toISOString(),
    completedAt: r.completed_at ? new Date(r.completed_at).toISOString() : null,
  }));

  return {
    swaps,
    summary: {
      totalSwappedCoins,
      totalUsdtReceived,
      totalSwapsCount,
    },
    pagination: {
      limit,
      offset,
      totalCount: totalSwapsCount,
    },
  };
}

/**
 * Authoritative USDT -> Coin Swap Execution Engine (Bidirectional Swap).
 * Debits USDT from financial ledger and credits PHIVO coin balance.
 */
export async function executeUsdtToCoinSwap(params: {
  userId: string;
  usdtAmount: number;
  idempotencyKey?: string;
}): Promise<{
  success: boolean;
  swap: CoinSwapTransactionRecord;
  balances: {
    remainingUsdtBalance: number;
    coinsCredited: number;
  };
}> {
  const { userId, usdtAmount, idempotencyKey } = params;

  if (isNaN(usdtAmount) || usdtAmount <= 0) {
    throw new Error('INVALID_USDT_AMOUNT: USDT amount must be a positive number.');
  }

  return runWithUserLock(userId, async () => {
    const db = await getDb();

    // 1. Fetch authoritative active rate
    const coinConfig = await getEconomicConfigByKey('INTERNAL_COIN_PRICE_USDT');
    const globalSwapActive = await isCoinSwapEnabled();

    if (!coinConfig || coinConfig.status !== 'ACTIVE') {
      const err: any = new Error('SWAP_RATE_NOT_CONFIGURED: Internal coin conversion rate is not configured.');
      err.code = 'SWAP_RATE_NOT_CONFIGURED';
      throw err;
    }

    const val = coinConfig.configValue || {};
    const rateUsdt = Number(val.priceUsdt);
    if (isNaN(rateUsdt) || rateUsdt <= 0) {
      const err: any = new Error('SWAP_RATE_NOT_CONFIGURED: Active coin conversion rate is invalid or missing.');
      err.code = 'SWAP_RATE_NOT_CONFIGURED';
      throw err;
    }

    const isEnabled = globalSwapActive && val.swapEnabled !== false;
    if (!isEnabled) {
      const err: any = new Error('SWAP_DISABLED: Internal coin swapping is currently disabled by administration.');
      err.code = 'SWAP_DISABLED';
      throw err;
    }

    // 2. Verify available USDT ledger balance
    const { getWalletSummary, postLedgerDebit } = await import('./walletLedgerService');
    const wallet = await getWalletSummary(userId);
    if (usdtAmount > wallet.availableBalance) {
      const err: any = new Error(
        `INSUFFICIENT_USDT_BALANCE: Requested swap of $${usdtAmount.toFixed(2)} USDT exceeds available balance of $${wallet.availableBalance.toFixed(2)} USDT.`
      );
      err.code = 'INSUFFICIENT_USDT_BALANCE';
      throw err;
    }

    // 3. Calculate PHIVO coin proceeds
    const coinAmount = Number((usdtAmount / rateUsdt).toFixed(4));
    if (coinAmount <= 0) {
      throw new Error('INVALID_SWAP_CALCULATION: Resulting coin amount must be greater than zero.');
    }

    const id = uuidv4();
    const publicSwapId = generateSwapPublicId();
    const now = new Date();

    // 4. Debit USDT from financial ledger
    await postLedgerDebit({
      userId,
      sourceType: 'COIN_SWAP',
      sourceId: id,
      sourceRef: publicSwapId,
      amount: usdtAmount,
      currency: 'USDT',
      description: `Internal Swap USDT -> PHIVO (${coinAmount} PHIVO @ $${rateUsdt.toFixed(2)} USDT)`,
      createdAt: now,
    });

    // 5. Insert swap transaction record
    const insertRes = await db.query<any>(
      `
      INSERT INTO coin_swap_transactions (
        id, public_swap_id, user_id, coin_amount, rate_usdt, usdt_amount,
        status, rate_version, idempotency_key, created_at, completed_at, direction
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'COMPLETED', $7, $8, $9, $9, 'USDT_TO_COIN')
      RETURNING *
      `,
      [
        id,
        publicSwapId,
        userId,
        coinAmount,
        rateUsdt,
        usdtAmount,
        coinConfig.version,
        idempotencyKey ? idempotencyKey.trim() : null,
        now,
      ]
    );

    const updatedWallet = await getWalletSummary(userId);
    const updatedCoinBal = await getUserCoinBalance(userId);
    const swapRow = insertRes.rows[0];

    return {
      success: true,
      swap: {
        id: swapRow.id,
        publicSwapId: swapRow.public_swap_id,
        userId: swapRow.user_id,
        coinAmount: Number(swapRow.coin_amount),
        rateUsdt: Number(swapRow.rate_usdt),
        usdtAmount: Number(swapRow.usdt_amount),
        status: swapRow.status,
        rateVersion: Number(swapRow.rate_version),
        idempotencyKey: swapRow.idempotency_key,
        createdAt: new Date(swapRow.created_at).toISOString(),
        completedAt: swapRow.completed_at ? new Date(swapRow.completed_at).toISOString() : null,
      },
      balances: {
        remainingUsdtBalance: updatedWallet.availableBalance,
        coinsCredited: coinAmount,
      },
    };
  });
}
