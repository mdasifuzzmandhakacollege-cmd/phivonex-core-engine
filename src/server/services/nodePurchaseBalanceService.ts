import { getDb } from '../db/db';
import { v4 as uuidv4 } from 'uuid';
import { generateLedgerTransactionPublicId } from '../utils/idGenerator';
import { getNodeBasePrice, getBnbPriceUsd } from './economicService';
import { createNodeReservation, settleNodeOrder, getUserOrders } from './nodeOrderService';
import { getWalletSummary } from './walletLedgerService';

export interface AssetBalanceInfo {
  available: number;
  required: number;
  sufficient: boolean;
  missing: number;
}

export interface NodeBalanceValidationResult {
  userId: string;
  nodePriceUsd: number;
  bnbPriceUsd: number | null;
  bnbRequired: number;
  usdtRequired: number;
  usdtBalance: AssetBalanceInfo;
  bnbBalance: AssetBalanceInfo;
  mainWalletBalance: number;
  nodeVaultBalance: number;
  canActivateWithUsdt: boolean;
  canActivateWithBnb: boolean;
}

const userLocks = new Map<string, Promise<any>>();

function withUserLock<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  const currentLock = userLocks.get(userId) || Promise.resolve();
  let releaseLock: () => void;
  const newLock = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });
  userLocks.set(userId, currentLock.then(() => newLock, () => newLock));

  return currentLock.then(
    async () => {
      try {
        return await fn();
      } finally {
        releaseLock!();
        if (userLocks.get(userId) === newLock) {
          userLocks.delete(userId);
        }
      }
    },
    async () => {
      try {
        return await fn();
      } finally {
        releaseLock!();
        if (userLocks.get(userId) === newLock) {
          userLocks.delete(userId);
        }
      }
    }
  );
}

/**
 * Validates the authenticated user's internal deposit balances (BNB & USDT)
 * specifically for Genesis Node activation eligibility.
 */
export async function validateUserNodePurchaseBalances(
  userId: string
): Promise<NodeBalanceValidationResult> {
  const db = await getDb();

  // 1. Get Node Price & BNB Price from authoritative economic service
  const nodePriceUsd = await getNodeBasePrice(); // e.g. 1000
  const bnbPriceUsd = await getBnbPriceUsd(); // e.g. 450 or null if unconfigured
  const bnbRequired = bnbPriceUsd && bnbPriceUsd > 0 ? Number((nodePriceUsd / bnbPriceUsd).toFixed(4)) : 0;
  const usdtRequired = nodePriceUsd;

  // 2. Compute unified USDT Available Balance (Deposits + Earnings - Debits)
  const walletSummary = await getWalletSummary(userId);
  const availableUsdt = walletSummary.availableBalance;
  const nodeVaultBalance = walletSummary.nodeVaultBalance;
  const mainWalletBalance = walletSummary.mainWalletBalance;

  // 3. Compute BNB Credited Deposits vs Node Purchase Debits
  const bnbDepositsRes = await db.query<{ total: string | number }>(
    `
    SELECT COALESCE(SUM(amount), 0) AS total
    FROM blockchain_deposits
    WHERE user_id = $1 AND status = 'CREDITED' AND asset = 'BNB'
    `,
    [userId]
  );
  const totalBnbDeposits = Number(bnbDepositsRes.rows[0]?.total || 0);

  const bnbDebitsRes = await db.query<{ total: string | number }>(
    `
    SELECT COALESCE(SUM(amount), 0) AS total
    FROM financial_ledger_entries
    WHERE user_id = $1 AND entry_type = 'DEBIT' AND source_type = 'NODE_PURCHASE' AND currency = 'BNB'
    `,
    [userId]
  );
  const totalBnbDebits = Number(bnbDebitsRes.rows[0]?.total || 0);
  const availableBnb = Math.max(0, totalBnbDeposits - totalBnbDebits);

  // 4. Balance sufficiency checks (BNB purchases blocked if BNB valuation rate is unconfigured)
  const usdtSufficient = availableUsdt >= usdtRequired;
  const bnbSufficient = Boolean(bnbPriceUsd && bnbPriceUsd > 0 && bnbRequired > 0 && availableBnb >= bnbRequired);

  return {
    userId,
    nodePriceUsd,
    bnbPriceUsd,
    bnbRequired,
    usdtRequired,
    usdtBalance: {
      available: availableUsdt,
      required: usdtRequired,
      sufficient: usdtSufficient,
      missing: usdtSufficient ? 0 : Number((usdtRequired - availableUsdt).toFixed(2)),
    },
    bnbBalance: {
      available: availableBnb,
      required: bnbRequired,
      sufficient: bnbSufficient,
      missing: bnbSufficient ? 0 : (bnbRequired > 0 ? Number((bnbRequired - availableBnb).toFixed(4)) : 0),
    },
    mainWalletBalance,
    nodeVaultBalance,
    canActivateWithUsdt: usdtSufficient,
    canActivateWithBnb: bnbSufficient,
  };
}

/**
 * Validates internal balance and processes Genesis Node activation for a specific asset (BNB or USDT).
 * ATOMIC GUARANTEE: Ledger debit and node settlement occur inside a single DB transaction.
 * Rolls back debit completely if settlement fails. Idempotency guarantees prevent duplicate debits.
 */
export async function processNodePurchaseWithAssetBalance(
  userId: string,
  asset: 'BNB' | 'USDT' = 'USDT',
  idempotencyKey?: string
): Promise<{
  success: boolean;
  assetUsed: 'BNB' | 'USDT';
  deductedAmount: number;
  remainingAssetBalance: number;
  order: any;
  node: { publicNodeId: string; nodeNumber: number; status: string; activatedAt: string };
  isDuplicate?: boolean;
}> {
  return withUserLock(userId, async () => {
    const db = await getDb();
    const selectedAsset: 'BNB' | 'USDT' = asset.toUpperCase() === 'BNB' ? 'BNB' : 'USDT';
    const cleanIdempotencyKey = idempotencyKey ? idempotencyKey.trim() : null;

    // 0. Pre-transaction idempotency check:
    // If idempotencyKey provided, check if a completed order already exists with this key
    if (cleanIdempotencyKey) {
      const existingOrderRes = await db.query<{
        id: string;
        public_order_id: string;
        node_number: number;
        amount_usd: string | number;
        currency: string;
        status: string;
        payment_method: string;
        payment_reference: string | null;
        reserved_at: Date;
        expires_at: Date;
        completed_at: Date | null;
        created_at: Date;
        public_node_id: string;
        node_status: string;
        node_activated_at: Date | null;
      }>(
        `
        SELECT 
          o.id, o.public_order_id, o.node_number, o.amount_usd,
          o.currency, o.status, o.payment_method, o.payment_reference,
          o.reserved_at, o.expires_at, o.completed_at, o.created_at,
          n.public_node_id, n.status AS node_status, n.activated_at AS node_activated_at
        FROM node_orders o
        JOIN nodes n ON o.node_id = n.id
        WHERE o.user_id = $1 AND o.idempotency_key = $2 AND o.status = 'COMPLETED'
        LIMIT 1
        `,
        [userId, cleanIdempotencyKey]
      );

      if (existingOrderRes.rows.length > 0) {
        const row = existingOrderRes.rows[0];
        const walletSummary = await getWalletSummary(userId);
        return {
          success: true,
          assetUsed: (row.currency === 'BNB' ? 'BNB' : 'USDT') as 'BNB' | 'USDT',
          deductedAmount: Number(row.amount_usd),
          remainingAssetBalance: walletSummary.availableBalance,
          order: {
            publicOrderId: row.public_order_id,
            publicNodeId: row.public_node_id,
            nodeNumber: row.node_number,
            amountUsd: Number(row.amount_usd),
            currency: row.currency,
            status: row.status,
            paymentMethod: row.payment_method,
            paymentReference: row.payment_reference,
            reservedAt: new Date(row.reserved_at).toISOString(),
            expiresAt: new Date(row.expires_at).toISOString(),
            completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : new Date().toISOString(),
            cancelledAt: null,
            createdAt: new Date(row.created_at).toISOString(),
            secondsRemaining: 0,
          },
          node: {
            publicNodeId: row.public_node_id,
            nodeNumber: row.node_number,
            status: row.node_status || 'ACTIVE',
            activatedAt: row.node_activated_at
              ? new Date(row.node_activated_at).toISOString()
              : (row.completed_at ? new Date(row.completed_at).toISOString() : new Date().toISOString()),
          },
          isDuplicate: true,
        };
      }
    }

    // 1. Perform balance & rate validation
    const validation = await validateUserNodePurchaseBalances(userId);

    if (selectedAsset === 'BNB' && (validation.bnbPriceUsd === null || validation.bnbPriceUsd <= 0)) {
      const error: any = new Error(
        'BNB_VALUATION_NOT_CONFIGURED: BNB-based node purchase is currently blocked because BNB valuation rate is not configured in economic parameters.'
      );
      error.code = 'BNB_VALUATION_NOT_CONFIGURED';
      error.statusCode = 400;
      throw error;
    }

    let requiredAmount = 0;
    let availableBalance = 0;
    let isSufficient = false;

    if (selectedAsset === 'BNB') {
      requiredAmount = validation.bnbRequired;
      availableBalance = validation.bnbBalance.available;
      isSufficient = validation.canActivateWithBnb;
    } else {
      requiredAmount = validation.usdtRequired;
      availableBalance = validation.usdtBalance.available;
      isSufficient = validation.canActivateWithUsdt;
    }

    // 2. Reject if insufficient balance for selected asset
    if (!isSufficient) {
      const error: any = new Error(
        `Insufficient ${selectedAsset} deposit balance. You have ${availableBalance} ${selectedAsset}, but node activation requires ${requiredAmount} ${selectedAsset}.`
      );
      error.code = 'INSUFFICIENT_ASSET_BALANCE';
      error.statusCode = 400;
      error.selectedAsset = selectedAsset;
      error.availableBalance = availableBalance;
      error.requiredAmount = requiredAmount;
      error.missingAmount = Number((requiredAmount - availableBalance).toFixed(4));
      error.redirectToDeposit = true;
      throw error;
    }

    // 3. Atomic Execution: DB Transaction containing Reservation + Ledger Debit + Settlement
    try {
      const purchaseResult = await db.transaction(async (trx) => {
        // Sane database timeout safety
        try {
          await trx.query(`SET LOCAL statement_timeout = '15000'`);
          await trx.query(`SET LOCAL lock_timeout = '8000'`);
        } catch {}

        // Lock user row to prevent concurrency race conditions
        await trx.query(`SELECT id FROM users WHERE id = $1 FOR UPDATE`, [userId]);

        // Re-check completed order with idempotency key inside locked transaction
        if (cleanIdempotencyKey) {
          const existingTx = await trx.query<{
            id: string;
            public_order_id: string;
            node_number: number;
            amount_usd: string | number;
            currency: string;
            status: string;
            payment_method: string;
            payment_reference: string | null;
            reserved_at: Date;
            expires_at: Date;
            completed_at: Date | null;
            created_at: Date;
            public_node_id: string;
            node_status: string;
            node_activated_at: Date | null;
          }>(
            `
            SELECT 
              o.id, o.public_order_id, o.node_number, o.amount_usd,
              o.currency, o.status, o.payment_method, o.payment_reference,
              o.reserved_at, o.expires_at, o.completed_at, o.created_at,
              n.public_node_id, n.status AS node_status, n.activated_at AS node_activated_at
            FROM node_orders o
            JOIN nodes n ON o.node_id = n.id
            WHERE o.user_id = $1 AND o.idempotency_key = $2 AND o.status = 'COMPLETED'
            LIMIT 1
            `,
            [userId, cleanIdempotencyKey]
          );

          if (existingTx.rows.length > 0) {
            const row = existingTx.rows[0];
            return {
              success: true,
              assetUsed: (row.currency === 'BNB' ? 'BNB' : 'USDT') as 'BNB' | 'USDT',
              deductedAmount: Number(row.amount_usd),
              remainingAssetBalance: availableBalance,
              order: {
                publicOrderId: row.public_order_id,
                publicNodeId: row.public_node_id,
                nodeNumber: row.node_number,
                amountUsd: Number(row.amount_usd),
                currency: row.currency,
                status: row.status,
                paymentMethod: row.payment_method,
                paymentReference: row.payment_reference,
                reservedAt: new Date(row.reserved_at).toISOString(),
                expiresAt: new Date(row.expires_at).toISOString(),
                completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : new Date().toISOString(),
                cancelledAt: null,
                createdAt: new Date(row.created_at).toISOString(),
                secondsRemaining: 0,
              },
              node: {
                publicNodeId: row.public_node_id,
                nodeNumber: row.node_number,
                status: row.node_status || 'ACTIVE',
                activatedAt: row.node_activated_at
                  ? new Date(row.node_activated_at).toISOString()
                  : (row.completed_at ? new Date(row.completed_at).toISOString() : new Date().toISOString()),
              },
              isDuplicate: true,
              runPostCommit: undefined,
            };
          }
        }

        // Re-verify authoritative balance inside transaction
        if (selectedAsset === 'USDT') {
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
          const currentAvailable = Math.max(0, Number(balRes.rows[0]?.available_balance || 0));
          if (currentAvailable < requiredAmount) {
            const err: any = new Error(
              `INSUFFICIENT_ASSET_BALANCE: Available balance of ${currentAvailable} ${selectedAsset} is insufficient for required ${requiredAmount} ${selectedAsset}.`
            );
            err.code = 'INSUFFICIENT_ASSET_BALANCE';
            err.statusCode = 400;
            throw err;
          }
        }

        // Acquire or create node reservation INSIDE this transaction using trx
        // If purchase rolls back: this reservation also rolls back!
        // No orphan pending reservation will ever be left behind.
        const reservationKey = cleanIdempotencyKey || `node_bal_req_${selectedAsset}_${userId}_${uuidv4()}`;
        const reservation = await createNodeReservation(
          userId,
          reservationKey,
          `DEPOSIT_${selectedAsset}`,
          trx
        );

        // Check if already completed (duplicate guard)
        if (reservation.order.status === 'COMPLETED') {
          const settlement = await settleNodeOrder(userId, reservation.order.publicOrderId, undefined, trx);
          return {
            success: true,
            assetUsed: selectedAsset,
            deductedAmount: requiredAmount,
            remainingAssetBalance: availableBalance,
            order: settlement.order,
            node: settlement.node,
            isDuplicate: true,
            runPostCommit: settlement.runPostCommit,
          };
        }

        const orderId = reservation.order.id || reservation.order.publicOrderId;

        // Duplicate debit check inside transaction
        const existingDebitRes = await trx.query(
          `SELECT id FROM financial_ledger_entries WHERE source_id = $1 AND source_type = 'NODE_PURCHASE'`,
          [orderId]
        );

        let debitTxnId = uuidv4();
        let publicTxnId = generateLedgerTransactionPublicId();

        if (existingDebitRes.rows.length === 0) {
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
              orderId,
              reservation.order.publicNodeId,
              `Genesis Node ${reservation.order.publicNodeId} activation paid via ${selectedAsset} deposit balance`,
              requiredAmount,
              selectedAsset,
            ]
          );
        } else {
          debitTxnId = existingDebitRes.rows[0].id;
        }

        // Settle node order contract inside same transaction using trx
        const settlement = await settleNodeOrder(
          userId,
          reservation.order.publicOrderId,
          `DEPOSIT_PAYMENT_${selectedAsset}_${publicTxnId}`,
          trx
        );

        const remainingBalance = Math.max(0, Number((availableBalance - requiredAmount).toFixed(4)));

        return {
          success: true,
          assetUsed: selectedAsset,
          deductedAmount: requiredAmount,
          remainingAssetBalance: remainingBalance,
          order: settlement.order,
          node: settlement.node,
          isDuplicate: settlement.isDuplicate,
          runPostCommit: settlement.runPostCommit,
        };
      });

      // =========================================================================
      // POST-COMMIT: Run side effects AFTER transaction commits!
      // Return HTTP success immediately without blocking on notifications/email.
      // =========================================================================
      if (purchaseResult.runPostCommit) {
        purchaseResult.runPostCommit().catch((err) => {
          console.warn('[ProcessNodePurchase Post-Commit Warning]', err);
        });
      }

      return {
        success: purchaseResult.success,
        assetUsed: purchaseResult.assetUsed,
        deductedAmount: purchaseResult.deductedAmount,
        remainingAssetBalance: purchaseResult.remainingAssetBalance,
        order: purchaseResult.order,
        node: purchaseResult.node,
        isDuplicate: purchaseResult.isDuplicate,
      };
    } catch (txErr) {
      console.error('[ProcessNodePurchase TX Error]', txErr);
      throw txErr;
    }
  });
}
