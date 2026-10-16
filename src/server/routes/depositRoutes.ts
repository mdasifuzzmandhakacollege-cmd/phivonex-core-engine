import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/authMiddleware';
import { depositLimiter } from '../middleware/rateLimiter';
import { getOrCreateUserDepositAddress } from '../services/bscKeyService';
import { getUserDeposits, processBlockchainDepositEvent } from '../services/bscDepositService';
import { rescanUserDepositStatus } from '../services/bscListenerService';
import { BSC_CONFIG } from '../../config/bscConfig';
import { bscRpcManager } from '../providers/bscRpcProvider';
import { getDb, DatabaseClient } from '../db/db';
import { ethers } from 'ethers';
import { v4 as uuidv4 } from 'uuid';
import { generateDepositPublicId, generateLedgerTransactionPublicId } from '../utils/idGenerator';
import { postLedgerCredit } from '../services/walletLedgerService';
import { notifyUsdtDepositConfirmed } from '../services/notificationService';

class DepositTransactionError extends Error {
  constructor(public code: string, public statusCode: number, message: string) {
    super(message);
    this.name = 'DepositTransactionError';
  }
}

export const depositRouter = Router();

/**
 * GET /api/deposits/address
 * Returns the single official PHIVONEX BSC/USDT deposit address.
 */
depositRouter.get('/address', requireAuth, depositLimiter, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const officialAddress = BSC_CONFIG.TREASURY_WALLET_ADDRESS;

    res.status(200).json({
      success: true,
      data: {
        address: officialAddress,
        chainId: BSC_CONFIG.CHAIN_ID,
        asset: 'USDT',
        networkName: BSC_CONFIG.NETWORK_NAME,
        requiredConfirmations: BSC_CONFIG.REQUIRED_CONFIRMATIONS,
        explorerUrl: `https://bscscan.com/address/${officialAddress}`,
        warning: `Send USDT (BEP-20) on BNB Smart Chain (Chain ID: ${BSC_CONFIG.CHAIN_ID}) to this official platform deposit address only. After sending, submit your transaction hash (TxHash) below for instant automated crediting.`,
        note: `All deposits are independently verified on-chain via BSC RPC. Do not send funds from exchange smart contracts that do not emit standard Transfer events.`,
      },
    });
  } catch (err: any) {
    console.error('[Deposit API] Error retrieving deposit address:', err);
    res.status(500).json({
      success: false,
      error: 'FAILED_TO_GET_ADDRESS',
      message: err?.message || 'Could not retrieve official deposit address',
    });
  }
});

/**
 * GET /api/deposits/me
 * Returns paginated deposit history and summary for the authenticated user.
 */
depositRouter.get('/me', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 20;
    const statusFilter = req.query.status as string | undefined;

    const result = await getUserDeposits(userId, page, limit, statusFilter);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err: any) {
    console.error('[Deposit API] Error retrieving deposit history:', err);
    res.status(500).json({
      success: false,
      error: 'FAILED_TO_GET_DEPOSITS',
      message: err?.message || 'Could not retrieve deposit history',
    });
  }
});

/**
 * POST /api/deposits/rescan
 * Triggers an on-demand check/rescan of pending transactions for the authenticated user.
 */
depositRouter.post('/rescan', requireAuth, depositLimiter, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const result = await rescanUserDepositStatus(userId);

    const deposits = await getUserDeposits(userId, 1, 20);

    res.status(200).json({
      success: true,
      message: 'Deposit scan completed successfully',
      data: {
        ...result,
        recentDeposits: deposits.deposits,
        summary: deposits.summary,
      },
    });
  } catch (err: any) {
    console.error('[Deposit API] Error during rescan:', err);
    res.status(500).json({
      success: false,
      error: 'RESCAN_FAILED',
      message: err?.message || 'Deposit rescan failed',
    });
  }
});

/**
 * POST /api/deposits/simulate-test-deposit
 * Automated test / development endpoint to simulate a blockchain deposit event.
 */
depositRouter.post('/simulate-test-deposit', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const isProduction =
    (process.env.APP_ENV || '').toLowerCase() === 'production' ||
    (process.env.NODE_ENV || '').toLowerCase() === 'production';
  if (isProduction) {
    res.status(403).json({
      success: false,
      error: 'FORBIDDEN',
      message: 'Deposit simulation endpoint is strictly forbidden and disabled in production environments.',
    });
    return;
  }

  try {
    const userId = req.user!.id;
    const { amount, txHash, fromAddress, confirmations, blockNumber, currentBlockNumber, asset } = req.body;
    const targetAsset = (asset || 'BNB').toUpperCase() === 'USDT' ? 'USDT' : 'BNB';

    const userAddress = await getOrCreateUserDepositAddress(userId, targetAsset);
    const simulatedBlock = blockNumber || 38291000;
    const confs = confirmations !== undefined ? Number(confirmations) : BSC_CONFIG.REQUIRED_CONFIRMATIONS;
    const currentBlock = currentBlockNumber || (simulatedBlock + confs - 1);
    const hash = txHash || `0xsim_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const from = fromAddress || '0x1111111111111111111111111111111111111111';

    const deposit = await processBlockchainDepositEvent({
      chainId: BSC_CONFIG.CHAIN_ID,
      asset: targetAsset,
      txHash: hash,
      fromAddress: from,
      toAddress: userAddress.address,
      amount: Number(amount || 1.0),
      blockNumber: simulatedBlock,
      currentBlockNumber: currentBlock,
    });

    res.status(200).json({
      success: true,
      message: `Simulated ${targetAsset} deposit event processed`,
      data: deposit,
    });
  } catch (err: any) {
    console.error('[Deposit API] Error simulating deposit:', err);
    res.status(500).json({
      success: false,
      error: 'SIMULATION_FAILED',
      message: err?.message || 'Failed to simulate deposit',
    });
  }
});

/**
 * POST /api/deposits/submit-txhash
 * Allows users to submit their on-chain transaction hash for instant blockchain verification and account crediting.
 */
depositRouter.post('/submit-txhash', requireAuth, depositLimiter, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { txHash, asset } = req.body;

    if (!txHash || typeof txHash !== 'string') {
      res.status(400).json({
        success: false,
        error: 'INVALID_TX_HASH',
        message: 'Please provide a valid transaction hash (TxHash / TxID).',
      });
      return;
    }

    const cleanTxHash = txHash.trim().toLowerCase();
    const txHashRegex = /^0x[a-f0-9]{64}$/;
    if (!txHashRegex.test(cleanTxHash)) {
      res.status(400).json({
        success: false,
        error: 'INVALID_TX_FORMAT',
        message: 'Transaction hash must be a 66-character hex string starting with 0x.',
      });
      return;
    }

    const requestedAsset = ((asset as string) || 'USDT').toUpperCase() === 'BNB' ? 'BNB' : 'USDT';
    const db = await getDb();

    // 1. Check if this txHash has ALREADY been submitted, processed, or credited globally in DB, Ledger, or Firestore
    const existing = await db.query(
      `SELECT id, user_id, status, amount, asset FROM blockchain_deposits WHERE LOWER(tx_hash) = $1 LIMIT 1`,
      [cleanTxHash]
    );

    if (existing.rows.length > 0) {
      res.status(409).json({
        success: false,
        error: 'TX_ALREADY_USED',
        message: 'This transaction hash has already been submitted and credited on PHIVONEX. Re-submitting transaction hashes is strictly prohibited for life.',
      });
      return;
    }

    const existingLedger = await db.query(
      `SELECT id FROM financial_ledger_entries WHERE description ILIKE $1 OR source_ref ILIKE $1 LIMIT 1`,
      [`%${cleanTxHash}%`]
    );

    if (existingLedger.rows.length > 0) {
      res.status(409).json({
        success: false,
        error: 'TX_ALREADY_CREDITED',
        message: 'This transaction hash has already been credited in the financial ledger and cannot be reused.',
      });
      return;
    }

    try {
      const { adminFirestore } = await import('../../lib/firebase-admin');
      const fsSnap = await adminFirestore.collection('blockchain_deposits').where('txHash', '==', cleanTxHash).limit(1).get();
      if (!fsSnap.empty) {
        res.status(409).json({
          success: false,
          error: 'TX_ALREADY_USED_FIRESTORE',
          message: 'This transaction hash has already been processed and saved in real-time audit storage. Re-submitting is prohibited.',
        });
        return;
      }
    } catch (fsErr) {
      console.warn('[Deposit API] Firestore transaction hash uniqueness check warning:', fsErr);
    }

    // 2. Explicitly verify BSC Mainnet Chain ID = 56
    if (BSC_CONFIG.CHAIN_ID !== 56) {
      res.status(400).json({
        success: false,
        error: 'INVALID_CHAIN_ID',
        message: 'Configured chain ID is not BSC Mainnet (56).',
      });
      return;
    }

    // 3. Query BNB Smart Chain node for transaction receipt using resilient multi-RPC fallback
    const rpcEndpoints = [
      'https://bsc-dataseed.binance.org',
      'https://bsc-rpc.publicnode.com',
      'https://bsc-dataseed1.defibit.io',
      'https://bsc-dataseed2.binance.org',
      BSC_CONFIG.RPC_URL_PRIMARY,
      BSC_CONFIG.RPC_URL_SECONDARY,
    ].filter((url) => Boolean(url) && !url.endsWith('rpc.ankr.com/bsc') && !url.endsWith('rpc.ankr.com/bsc/'));

    const uniqueRpcs = Array.from(new Set(rpcEndpoints));

    let receipt: ethers.TransactionReceipt | null = null;
    let tx: ethers.TransactionResponse | null = null;
    let currentBlock = 0;

    for (const rpc of uniqueRpcs) {
      try {
        const network = ethers.Network.from(56);
        const p = new ethers.JsonRpcProvider(rpc, network, { staticNetwork: network });
        const [r, t] = await Promise.all([
          p.getTransactionReceipt(cleanTxHash),
          p.getTransaction(cleanTxHash),
        ]);
        if (r && t) {
          // Verify transaction chain ID if present
          if (t.chainId !== null && t.chainId !== undefined && Number(t.chainId) !== 56) {
            res.status(400).json({
              success: false,
              error: 'INVALID_CHAIN_ID',
              message: 'Transaction was not executed on BSC Mainnet (Chain ID 56).',
            });
            return;
          }
          receipt = r;
          tx = t;
          try {
            currentBlock = await p.getBlockNumber();
          } catch {
            currentBlock = 0;
          }
          console.log(`[Deposit API] Successfully resolved on-chain transaction from ${rpc}!`);
          break;
        }
      } catch (err: any) {
        console.warn(`[Deposit API] RPC ${rpc} query error:`, err?.message || err);
      }
    }

    if (!receipt || !tx) {
      res.status(404).json({
        success: false,
        error: 'TX_NOT_FOUND',
        message: 'Transaction not found on BNB Smart Chain yet. Please wait a few seconds for BSC miners to process the transaction and try again.',
      });
      return;
    }

    if (receipt.status !== 1) {
      res.status(400).json({
        success: false,
        error: 'TX_FAILED_ON_CHAIN',
        message: 'This transaction failed or was reverted on the BNB Smart Chain blockchain.',
      });
      return;
    }

    // Fail safely if current block height cannot be obtained (DO NOT invent confirmations)
    if (!currentBlock || currentBlock <= 0) {
      res.status(503).json({
        success: false,
        error: 'RPC_BLOCK_HEIGHT_ERROR',
        message: 'Unable to obtain current block height from BSC RPC. Confirmations cannot be verified safely. Please retry.',
      });
      return;
    }

    const blockNumber = receipt.blockNumber;
    const confirmations = currentBlock - blockNumber + 1;
    const requiredConfs = BSC_CONFIG.REQUIRED_CONFIRMATIONS || 3;

    if (confirmations < requiredConfs) {
      res.status(200).json({
        success: false,
        error: 'INSUFFICIENT_CONFIRMATIONS',
        message: `Transaction has ${confirmations} confirmation(s). Required: ${requiredConfs}. Deposit pending maturation.`,
        data: {
          publicDepositId: '',
          confirmations,
          requiredConfirmations: requiredConfs,
          status: 'PENDING',
        },
      });
      return;
    }

    // 4. Accept ONLY the currently configured TREASURY_WALLET_ADDRESS as destination. No fallback, no XPUB.
    const treasury = (BSC_CONFIG.TREASURY_WALLET_ADDRESS || '').toLowerCase();
    if (!treasury || !ethers.isAddress(treasury)) {
      res.status(500).json({
        success: false,
        error: 'TREASURY_NOT_CONFIGURED',
        message: 'Official PHIVONEX treasury wallet address is not configured.',
      });
      return;
    }

    let detectedAmount = 0;
    let fromAddress = tx.from.toLowerCase();
    let toAddress = '';
    let realLogIndex = 0;

    // USDT BEP-20 ONLY. Remove native BNB deposit acceptance.
    const transferEventSignature = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
    const usdtContractLower = BSC_CONFIG.USDT_CONTRACT_ADDRESS.toLowerCase();

    for (let i = 0; i < receipt.logs.length; i++) {
      const log = receipt.logs[i];
      if (log.topics[0] === transferEventSignature && log.topics.length >= 3) {
        const logContract = log.address.toLowerCase();
        const recipientTopic = '0x' + log.topics[2].slice(26);
        const recipientAddress = recipientTopic.toLowerCase();

        if (logContract === usdtContractLower && recipientAddress === treasury) {
          try {
            const rawAmount = BigInt(log.data);
            const formatted = Number(ethers.formatUnits(rawAmount, 18));
            if (formatted > 0) {
              detectedAmount = formatted;
              toAddress = recipientAddress;
              fromAddress = ('0x' + log.topics[1].slice(26)).toLowerCase();
              realLogIndex = (log as any).index ?? (log as any).logIndex ?? i;
              break;
            }
          } catch (parseErr) {
            console.error('[Deposit API] Error parsing ERC-20 transfer log:', parseErr);
          }
        }
      }
    }

    if (detectedAmount <= 0) {
      res.status(400).json({
        success: false,
        error: 'NO_VALID_USDT_TRANSFER',
        message: `No qualifying USDT BEP-20 transfer to the official treasury address was found in this transaction. Native BNB or wrong destination/contract transfers are rejected.`,
      });
      return;
    }

    // Check duplicate credit protection with real log index
    const duplicateCheck = await db.query(
      `SELECT id FROM blockchain_deposits WHERE chain_id = $1 AND LOWER(tx_hash) = $2 AND log_index = $3`,
      [BSC_CONFIG.CHAIN_ID, cleanTxHash, realLogIndex]
    );
    if (duplicateCheck.rows.length > 0) {
      res.status(409).json({
        success: false,
        error: 'TX_ALREADY_USED',
        message: 'This transaction hash and log index have already been credited.',
      });
      return;
    }

    // 5. Atomic PostgreSQL Transaction using db.transaction() API with real rollback on business failure
    const now = new Date();
    let actualDepositId = '';
    let actualPublicDepositId = '';

    try {
      await db.transaction(async (trx: DatabaseClient) => {
        const depositId = uuidv4();
        const publicDepositId = generateDepositPublicId();

        const insertRes = await trx.query(
          `
          INSERT INTO blockchain_deposits (
            id, public_deposit_id, user_id, chain_id, asset,
            tx_hash, log_index, from_address, to_address, amount, block_number,
            confirmations, status, detected_at, confirmed_at, credited_at, created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, 'USDT', $5, $6, $7, $8, $9, $10, $11, 'CREDITED', $12, $12, $12, $12, $12)
          ON CONFLICT (chain_id, tx_hash, log_index, to_address) DO NOTHING
          RETURNING id, public_deposit_id, user_id
          `,
          [
            depositId,
            publicDepositId,
            userId,
            BSC_CONFIG.CHAIN_ID,
            cleanTxHash,
            realLogIndex,
            fromAddress,
            toAddress,
            detectedAmount,
            blockNumber,
            confirmations,
            now,
          ]
        );

        if (insertRes.rows.length === 0) {
          throw new DepositTransactionError('TX_ALREADY_USED', 409, 'This transaction hash and log index have already been submitted and credited.');
        }

        actualDepositId = insertRes.rows[0].id;
        actualPublicDepositId = insertRes.rows[0].public_deposit_id;
        const actualUserId = insertRes.rows[0].user_id;

        if (actualUserId !== userId) {
          throw new DepositTransactionError('DUPLICATE_TX_USER_MISMATCH', 409, 'Transaction already linked to another user account.');
        }

        const ledgerId = uuidv4();
        const publicTxnId = generateLedgerTransactionPublicId();
        const ledgerRes = await trx.query(
          `
          INSERT INTO financial_ledger_entries (
            id, public_txn_id, user_id, entry_type, source_type, source_id,
            source_ref, description, amount, currency, status, created_at
          )
          VALUES ($1, $2, $3, 'CREDIT', 'BLOCKCHAIN_DEPOSIT', $4, $5, $6, $7, 'USDT', 'SETTLED', $8)
          ON CONFLICT (source_type, source_id, entry_type) DO NOTHING
          RETURNING id, user_id
          `,
          [
            ledgerId,
            publicTxnId,
            actualUserId,
            actualDepositId,
            actualPublicDepositId,
            `On-chain USDT BEP-20 deposit verified via TxHash ${cleanTxHash.slice(0, 10)}...`,
            detectedAmount,
            now,
          ]
        );

        if (ledgerRes.rows.length === 0 || ledgerRes.rows[0].user_id !== actualUserId) {
          throw new DepositTransactionError('LEDGER_CREDIT_FAILED', 409, 'Ledger credit failed or already exists. Rolled back deposit.');
        }
      });
    } catch (txErr: any) {
      if (txErr instanceof DepositTransactionError || txErr.statusCode) {
        res.status(txErr.statusCode || 409).json({
          success: false,
          error: txErr.code || 'TRANSACTION_ERROR',
          message: txErr.message || 'Transaction failed',
        });
        return;
      }
      throw txErr;
    }

    // 6. Sync to Firestore for cloud persistence (non-blocking)
    try {
      const { adminFirestore } = await import('../../lib/firebase-admin');
      await adminFirestore.collection('blockchain_deposits').doc(actualDepositId).set({
        id: actualDepositId,
        publicDepositId: actualPublicDepositId,
        userId,
        txHash: cleanTxHash,
        amount: detectedAmount,
        asset: 'USDT',
        status: 'CREDITED',
        createdAt: now.toISOString(),
      }, { merge: true });
    } catch (fsErr) {
      console.warn('[Deposit API] Firestore deposit backup notice:', fsErr);
    }

    // 7. Notify user (non-blocking)
    try {
      await notifyUsdtDepositConfirmed({
        userId,
        amountUsdt: detectedAmount,
        depositId: actualDepositId,
        txHash: cleanTxHash,
      });
    } catch {
      // Non-critical notification failure
    }

    res.status(200).json({
      success: true,
      message: `Deposit verified successfully! Credited ${detectedAmount} USDT to your account.`,
      data: {
        publicDepositId: actualPublicDepositId,
        amount: detectedAmount,
        asset: 'USDT',
        txHash: cleanTxHash,
        confirmations,
        logIndex: realLogIndex,
      },
    });
  } catch (err: any) {
    console.error('[Deposit API] Error processing submitted TxHash:', err);
    res.status(500).json({
      success: false,
      error: 'VERIFICATION_ERROR',
      message: err?.message || 'Failed to verify transaction hash.',
    });
  }
});
