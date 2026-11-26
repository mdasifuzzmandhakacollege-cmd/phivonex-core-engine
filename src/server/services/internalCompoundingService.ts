import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/db';
import {
  parseAmountToScaledBigInt,
  formatScaledBigInt,
  getUserMainUsdtBalanceExact,
  investInTradingPool,
} from './tradingPoolService';
import { subscribeChronoVault } from './chronoVaultService';
import { evaluateAndPromoteUserAndAncestors } from './unilevelRankService';
import { syncUserLedger } from './walletLedgerService';
import { generateLedgerTransactionPublicId } from '../utils/idGenerator';
import { assertFeatureSwitchEnabled } from './unilevelConfigService';

export type ReinvestTargetProduct = 'TRADING_POOL' | 'CHRONO_VAULT' | 'NODE_VAULT';

export interface InternalReinvestParams {
  userId: string;
  targetProduct: ReinvestTargetProduct | string;
  amountUsd: string | number;
  planCode?: string;
  idempotencyKey?: string;
}

export interface InternalReinvestResult {
  reinvestId: string;
  userId: string;
  targetProduct: ReinvestTargetProduct;
  amountUsd: string;
  planCode: string | null;
  referenceId: string;
  publicReferenceId: string;
  ledgerDebitTxnId: string;
  ledgerCreditTxnId: string | null;
  walletBalanceBeforeUsd: string;
  walletBalanceAfterUsd: string;
  nodeVaultBalanceAfterUsd: string;
  spotCommissionUsd: string;
  binaryVolumeAddedUsd: string;
  isDuplicate: boolean;
  position?: any;
  transfer?: {
    transferId: string;
    fromVault: 'MAIN_WALLET';
    toVault: 'NODE_VAULT';
    amountUsd: string;
  };
  executedAt: string;
}

const MIN_TRADING_POOL_SCALED = 200n * 100_000_000n; // $200.00000000
const MIN_CHRONO_VAULT_SCALED = 100n * 100_000_000n; // $100.00000000

const userCompoundLocks = new Map<string, Promise<any>>();

function withCompoundUserLock<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  const currentLock = userCompoundLocks.get(userId) || Promise.resolve();
  let releaseLock: () => void;
  const newLock = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });

  userCompoundLocks.set(
    userId,
    currentLock.then(
      () => newLock,
      () => newLock
    )
  );

  return currentLock.then(
    async () => {
      try {
        return await fn();
      } finally {
        releaseLock!();
        if (userCompoundLocks.get(userId) === newLock) {
          userCompoundLocks.delete(userId);
        }
      }
    },
    async () => {
      try {
        return await fn();
      } finally {
        releaseLock!();
        if (userCompoundLocks.get(userId) === newLock) {
          userCompoundLocks.delete(userId);
        }
      }
    }
  );
}

/**
 * TASK-09 Step 3: Internal Compounding & Re-Investment Engine
 * Allows a user to atomically compound/re-invest available Main USDT Wallet earnings directly into:
 * 1. TRADING_POOL (PHIVONEX QUANTUM ALPHA™, amountUsd >= 200.00000000)
 * 2. CHRONO_VAULT (PHIVONEX CHRONO VAULTS™, amountUsd >= 100.00000000, valid planCode)
 * 3. NODE_VAULT (Node Purchase Vault internal transfer for PHIVONEX GENESIS CORE™, amountUsd > 0)
 *
 * Enforces idempotency (idempotencyKey) so duplicate clicks/retries never double-invest.
 * Guarantees $0 spot commission and 0 binary volume on all compounded investments.
 */
export async function executeInternalReinvest(
  params: InternalReinvestParams
): Promise<InternalReinvestResult> {
  const { userId, targetProduct, amountUsd, planCode, idempotencyKey } = params;

  if (!userId || typeof userId !== 'string') {
    const err: any = new Error('INVALID_USER: Valid userId is required.');
    err.code = 'INVALID_USER';
    err.statusCode = 400;
    throw err;
  }

  // Enforce Master Ecosystem Feature Switch: Internal Wallet Compounding
  await assertFeatureSwitchEnabled(
    'internal_compounding_enabled',
    'Internal Wallet Compounding & Re-Investment'
  );

  const normalizedProduct = String(targetProduct || '')
    .trim()
    .toUpperCase() as ReinvestTargetProduct;

  if (
    normalizedProduct !== 'TRADING_POOL' &&
    normalizedProduct !== 'CHRONO_VAULT' &&
    normalizedProduct !== 'NODE_VAULT'
  ) {
    const err: any = new Error(
      `INVALID_TARGET_PRODUCT: targetProduct must be 'TRADING_POOL', 'CHRONO_VAULT', or 'NODE_VAULT'.`
    );
    err.code = 'INVALID_TARGET_PRODUCT';
    err.statusCode = 400;
    throw err;
  }

  let amountScaled: bigint;
  try {
    amountScaled = parseAmountToScaledBigInt(amountUsd);
  } catch (parseErr: any) {
    const err: any = new Error(
      parseErr?.message || 'INVALID_AMOUNT: Re-investment amount must be a valid positive number.'
    );
    err.code = 'INVALID_AMOUNT';
    err.statusCode = 400;
    throw err;
  }

  if (amountScaled <= 0n) {
    const err: any = new Error('INVALID_AMOUNT: Re-investment amount must be greater than 0.');
    err.code = 'INVALID_AMOUNT';
    err.statusCode = 400;
    throw err;
  }

  if (normalizedProduct === 'TRADING_POOL' && amountScaled < MIN_TRADING_POOL_SCALED) {
    const err: any = new Error(
      'MIN_INVESTMENT_NOT_MET: Minimum re-investment for PHIVONEX QUANTUM ALPHA™ (TRADING_POOL) is $200.00000000 USDT.'
    );
    err.code = 'MIN_INVESTMENT_NOT_MET';
    err.statusCode = 400;
    throw err;
  }

  if (normalizedProduct === 'CHRONO_VAULT') {
    if (amountScaled < MIN_CHRONO_VAULT_SCALED) {
      const err: any = new Error(
        'MIN_INVESTMENT_NOT_MET: Minimum re-investment for PHIVONEX CHRONO VAULTS™ (CHRONO_VAULT) is $100.00000000 USDT.'
      );
      err.code = 'MIN_INVESTMENT_NOT_MET';
      err.statusCode = 400;
      throw err;
    }
    if (!planCode || !String(planCode).trim()) {
      const err: any = new Error(
        'INVALID_PLAN_CODE: planCode is required when compounding into CHRONO_VAULT.'
      );
      err.code = 'INVALID_PLAN_CODE';
      err.statusCode = 400;
      throw err;
    }
  }

  const exactAmountStr = formatScaledBigInt(amountScaled);
  const cleanIdempotencyKey = idempotencyKey ? String(idempotencyKey).trim() : null;
  const idempotencyTraceId = cleanIdempotencyKey
    ? `REINVEST-IDEMP:${userId}:${cleanIdempotencyKey}`
    : null;

  return withCompoundUserLock(userId, async () => {
    const db = await getDb();

    // 1. Check idempotency record if idempotencyKey was supplied
    if (idempotencyTraceId) {
      const existingAudit = await db.query<{ payload: any }>(
        `
        SELECT payload
        FROM security_audit_logs
        WHERE actor_user_id = $1
          AND action_type = 'INTERNAL_COMPOUND_REINVEST'
          AND trace_id = $2
        ORDER BY created_at DESC
        LIMIT 1
        `,
        [userId, idempotencyTraceId]
      );

      if (existingAudit.rows.length > 0 && existingAudit.rows[0].payload) {
        const cached =
          typeof existingAudit.rows[0].payload === 'string'
            ? JSON.parse(existingAudit.rows[0].payload)
            : existingAudit.rows[0].payload;
        return {
          ...(cached as InternalReinvestResult),
          isDuplicate: true,
        };
      }
    }

    // 2. Branch 1: TRADING_POOL (PHIVONEX QUANTUM ALPHA™)
    if (normalizedProduct === 'TRADING_POOL') {
      const tpResult = await investInTradingPool({
        userId,
        amountUsd: exactAmountStr,
      });

      try {
        await evaluateAndPromoteUserAndAncestors(userId);
      } catch (rankErr) {
        console.warn('[InternalCompounding] Notice evaluating rank after TRADING_POOL reinvest:', rankErr);
      }

      const exactBalancesAfter = await getUserMainUsdtBalanceExact(userId, db);
      const publicRefId = `TP-${tpResult.position.id.substring(0, 8).toUpperCase()}`;
      const reinvestResult: InternalReinvestResult = {
        reinvestId: uuidv4(),
        userId,
        targetProduct: 'TRADING_POOL',
        amountUsd: exactAmountStr,
        planCode: tpResult.position.tierCode,
        referenceId: tpResult.position.id,
        publicReferenceId: publicRefId,
        ledgerDebitTxnId: tpResult.ledgerEntry.publicTxnId,
        ledgerCreditTxnId: null,
        walletBalanceBeforeUsd: tpResult.walletBalanceBeforeUsd,
        walletBalanceAfterUsd: tpResult.walletBalanceAfterUsd,
        nodeVaultBalanceAfterUsd: exactBalancesAfter.nodeVaultBalanceStr,
        spotCommissionUsd: '0.00000000',
        binaryVolumeAddedUsd: '0.00000000',
        isDuplicate: false,
        position: tpResult.position,
        executedAt: new Date().toISOString(),
      };

      await db.query(
        `
        INSERT INTO security_audit_logs (
          id, trace_id, actor_user_id, action_type, severity, payload, created_at
        ) VALUES ($1, $2, $3, 'INTERNAL_COMPOUND_REINVEST', 'INFO', $4::jsonb, NOW())
        `,
        [
          uuidv4(),
          idempotencyTraceId || `REINVEST-TP-${publicRefId}`,
          userId,
          JSON.stringify(reinvestResult),
        ]
      );

      return reinvestResult;
    }

    // 3. Branch 2: CHRONO_VAULT (PHIVONEX CHRONO VAULTS™)
    if (normalizedProduct === 'CHRONO_VAULT') {
      const normalizedPlanCode = String(planCode).trim().toUpperCase();
      const cvResult = await subscribeChronoVault({
        userId,
        planCode: normalizedPlanCode,
        amountUsd: exactAmountStr,
      });

      try {
        await evaluateAndPromoteUserAndAncestors(userId);
      } catch (rankErr) {
        console.warn('[InternalCompounding] Notice evaluating rank after CHRONO_VAULT reinvest:', rankErr);
      }

      const exactBalancesAfter = await getUserMainUsdtBalanceExact(userId, db);
      const publicRefId = `CV-${cvResult.position.id.substring(0, 8).toUpperCase()}`;
      const reinvestResult: InternalReinvestResult = {
        reinvestId: uuidv4(),
        userId,
        targetProduct: 'CHRONO_VAULT',
        amountUsd: exactAmountStr,
        planCode: cvResult.position.planCode,
        referenceId: cvResult.position.id,
        publicReferenceId: publicRefId,
        ledgerDebitTxnId: cvResult.ledgerEntry.publicTxnId,
        ledgerCreditTxnId: null,
        walletBalanceBeforeUsd: cvResult.walletBalanceBeforeUsd,
        walletBalanceAfterUsd: cvResult.walletBalanceAfterUsd,
        nodeVaultBalanceAfterUsd: exactBalancesAfter.nodeVaultBalanceStr,
        spotCommissionUsd: '0.00000000',
        binaryVolumeAddedUsd: '0.00000000',
        isDuplicate: false,
        position: cvResult.position,
        executedAt: new Date().toISOString(),
      };

      await db.query(
        `
        INSERT INTO security_audit_logs (
          id, trace_id, actor_user_id, action_type, severity, payload, created_at
        ) VALUES ($1, $2, $3, 'INTERNAL_COMPOUND_REINVEST', 'INFO', $4::jsonb, NOW())
        `,
        [
          uuidv4(),
          idempotencyTraceId || `REINVEST-CV-${publicRefId}`,
          userId,
          JSON.stringify(reinvestResult),
        ]
      );

      return reinvestResult;
    }

    // 4. Branch 3: NODE_VAULT (Internal transfer to Node Purchase Vault for PHIVONEX GENESIS CORE™)
    const nodeVaultResult = await db.transaction(async (trx) => {
      // Lock user row FOR UPDATE
      const userLockRes = await trx.query<{ id: string }>(
        `SELECT id FROM users WHERE id = $1 FOR UPDATE`,
        [userId]
      );
      if (userLockRes.rows.length === 0) {
        const err: any = new Error('USER_NOT_FOUND: User account does not exist.');
        err.code = 'USER_NOT_FOUND';
        err.statusCode = 404;
        throw err;
      }

      // Re-check idempotency inside FOR UPDATE lock
      if (idempotencyTraceId) {
        const existingInTrx = await trx.query<{ payload: any }>(
          `
          SELECT payload
          FROM security_audit_logs
          WHERE actor_user_id = $1
            AND action_type = 'INTERNAL_COMPOUND_REINVEST'
            AND trace_id = $2
          ORDER BY created_at DESC
          LIMIT 1
          `,
          [userId, idempotencyTraceId]
        );
        if (existingInTrx.rows.length > 0 && existingInTrx.rows[0].payload) {
          const cached =
            typeof existingInTrx.rows[0].payload === 'string'
              ? JSON.parse(existingInTrx.rows[0].payload)
              : existingInTrx.rows[0].payload;
          return {
            ...(cached as InternalReinvestResult),
            isDuplicate: true,
          };
        }
      }

      await syncUserLedger(userId, trx);
      const balancesBefore = await getUserMainUsdtBalanceExact(userId, trx);

      if (balancesBefore.availableBalanceScaled < amountScaled) {
        const err: any = new Error(
          `INSUFFICIENT_BALANCE: Available Main USDT Wallet balance ($${balancesBefore.availableBalanceStr}) is less than requested Node Vault compound amount ($${exactAmountStr}).`
        );
        err.code = 'INSUFFICIENT_BALANCE';
        err.statusCode = 400;
        err.availableBalance = balancesBefore.availableBalanceStr;
        throw err;
      }

      const transferId = `TRF-${uuidv4().substring(0, 8).toUpperCase()}`;
      const debitEntryId = uuidv4();
      const creditEntryId = uuidv4();
      const debitPublicTxnId = generateLedgerTransactionPublicId();
      const creditPublicTxnId = generateLedgerTransactionPublicId();
      const now = new Date();

      // Double-entry 1: DEBIT Main USDT Wallet
      await trx.query(
        `
        INSERT INTO financial_ledger_entries (
          id, public_txn_id, user_id, entry_type, source_type, source_id,
          source_ref, description, amount, currency, status, created_at
        ) VALUES ($1, $2, $3, 'DEBIT', 'WALLET_TRANSFER', $4, $5, $6, $7::numeric(20,8), 'USDT', 'SETTLED', $8)
        `,
        [
          debitEntryId,
          debitPublicTxnId,
          userId,
          debitEntryId,
          transferId,
          'Ecosystem Transfer to Node Activation Vault',
          exactAmountStr,
          now,
        ]
      );

      // Double-entry 2: CREDIT Node Purchase Vault
      await trx.query(
        `
        INSERT INTO financial_ledger_entries (
          id, public_txn_id, user_id, entry_type, source_type, source_id,
          source_ref, description, amount, currency, status, created_at
        ) VALUES ($1, $2, $3, 'CREDIT', 'WALLET_TRANSFER', $4, $5, $6, $7::numeric(20,8), 'USDT', 'SETTLED', $8)
        `,
        [
          creditEntryId,
          creditPublicTxnId,
          userId,
          creditEntryId,
          transferId,
          'Ecosystem Transfer from Main Earnings Wallet',
          exactAmountStr,
          now,
        ]
      );

      const walletBalanceAfterScaled = balancesBefore.availableBalanceScaled - amountScaled;
      const nodeVaultBalanceAfterScaled = balancesBefore.nodeVaultBalanceScaled + amountScaled;

      const reinvestResult: InternalReinvestResult = {
        reinvestId: uuidv4(),
        userId,
        targetProduct: 'NODE_VAULT',
        amountUsd: exactAmountStr,
        planCode: null,
        referenceId: debitEntryId,
        publicReferenceId: transferId,
        ledgerDebitTxnId: debitPublicTxnId,
        ledgerCreditTxnId: creditPublicTxnId,
        walletBalanceBeforeUsd: balancesBefore.availableBalanceStr,
        walletBalanceAfterUsd: formatScaledBigInt(walletBalanceAfterScaled),
        nodeVaultBalanceAfterUsd: formatScaledBigInt(nodeVaultBalanceAfterScaled),
        spotCommissionUsd: '0.00000000',
        binaryVolumeAddedUsd: '0.00000000',
        isDuplicate: false,
        transfer: {
          transferId,
          fromVault: 'MAIN_WALLET',
          toVault: 'NODE_VAULT',
          amountUsd: exactAmountStr,
        },
        executedAt: now.toISOString(),
      };

      await trx.query(
        `
        INSERT INTO security_audit_logs (
          id, trace_id, actor_user_id, action_type, severity, payload, created_at
        ) VALUES ($1, $2, $3, 'INTERNAL_COMPOUND_REINVEST', 'INFO', $4::jsonb, NOW())
        `,
        [
          uuidv4(),
          idempotencyTraceId || `REINVEST-NV-${transferId}`,
          userId,
          JSON.stringify(reinvestResult),
        ]
      );

      return reinvestResult;
    });

    return nodeVaultResult;
  });
}
