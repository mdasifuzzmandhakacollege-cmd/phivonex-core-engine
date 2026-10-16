import { ethers } from 'ethers';
import { BSC_CONFIG } from '../../config/bscConfig';
import { getDb } from '../db/db';
import { processBlockchainDepositEvent } from './bscDepositService';
import { getOrCreateUserDepositAddress } from './bscKeyService';
import { bscRpcManager } from '../providers/bscRpcProvider';

export interface ScanResult {
  scannedBlocks: number;
  detectedDeposits: number;
  fromBlock: number;
  toBlock: number;
  status: 'SUCCESS' | 'NO_NEW_BLOCKS' | 'ERROR';
  error?: string;
}

let isScanning = false;
let lastScannedBlock = 0;

/**
 * Scan on-chain USDT BEP-20 transfers for all known user deposit addresses.
 * Uses bscRpcManager for primary/secondary RPC failover.
 */
export async function scanBlocksForDeposits(range = 10): Promise<ScanResult> {
  if (isScanning) {
    return {
      scannedBlocks: 0,
      detectedDeposits: 0,
      fromBlock: lastScannedBlock,
      toBlock: lastScannedBlock,
      status: 'SUCCESS',
    };
  }

  isScanning = true;

  try {
    const scanOutcome = await bscRpcManager.executeWithFailover(async (provider) => {
      const currentBlock = await provider.getBlockNumber();

      if (lastScannedBlock === 0) {
        lastScannedBlock = Math.max(1, currentBlock - range);
      }

      const fromBlock = Math.max(1, lastScannedBlock + 1);
      const toBlock = Math.min(currentBlock, fromBlock + range);

      if (fromBlock > toBlock) {
        return {
          scannedBlocks: 0,
          detectedDeposits: 0,
          fromBlock: currentBlock,
          toBlock: currentBlock,
          status: 'NO_NEW_BLOCKS' as const,
        };
      }

      // Get all registered deposit addresses for this chain
      const db = await getDb();
      const addrsRes = await db.query<{ address: string; user_id: string }>(
        `SELECT address, user_id FROM user_deposit_addresses WHERE chain_id = $1`,
        [BSC_CONFIG.CHAIN_ID]
      );

      const addressMap = new Set(addrsRes.rows.map((r) => r.address.toLowerCase()));
      let detectedCount = 0;

      if (addressMap.size > 0) {
        // 1. Scan USDT BEP-20 Transfer logs with logIndex
        try {
          const transferTopic = ethers.id('Transfer(address,address,uint256)');
          const logs = await provider.getLogs({
            fromBlock,
            toBlock,
            address: BSC_CONFIG.USDT_CONTRACT_ADDRESS,
            topics: [transferTopic],
          });

          for (const log of logs) {
            if (log.topics && log.topics.length >= 3) {
              const fromAddr = ethers.getAddress(ethers.dataSlice(log.topics[1], 12));
              const toAddr = ethers.getAddress(ethers.dataSlice(log.topics[2], 12));

              if (addressMap.has(toAddr.toLowerCase())) {
                const rawAmount = BigInt(log.data);
                const amountUsdt = Number(ethers.formatUnits(rawAmount, 18));

                await processBlockchainDepositEvent({
                  chainId: BSC_CONFIG.CHAIN_ID,
                  asset: 'USDT',
                  contractAddress: log.address,
                  txHash: log.transactionHash,
                  logIndex: log.index,
                  fromAddress: fromAddr,
                  toAddress: toAddr,
                  amount: amountUsdt,
                  blockNumber: log.blockNumber,
                  currentBlockNumber: currentBlock,
                });
                detectedCount++;
              }
            }
          }
        } catch (logErr) {
          console.warn('[BSC Listener] Error querying USDT Transfer logs:', logErr);
        }

        // 2. Scan native transfers across blocks
        for (let b = fromBlock; b <= toBlock; b++) {
          try {
            const block = await provider.getBlock(b, true);
            if (block && block.prefetchedTransactions) {
              for (const tx of block.prefetchedTransactions) {
                if (tx.to && addressMap.has(tx.to.toLowerCase()) && tx.value > 0n) {
                  const amountBnb = Number(ethers.formatEther(tx.value));
                  await processBlockchainDepositEvent({
                    chainId: BSC_CONFIG.CHAIN_ID,
                    asset: 'BNB',
                    txHash: tx.hash,
                    fromAddress: tx.from,
                    toAddress: tx.to,
                    amount: amountBnb,
                    blockNumber: b,
                    currentBlockNumber: currentBlock,
                  });
                  detectedCount++;
                }
              }
            }
          } catch (blockErr) {
            console.warn(`[BSC Listener] Error scanning block ${b}:`, blockErr);
          }
        }
      }

      lastScannedBlock = toBlock;

      return {
        scannedBlocks: toBlock - fromBlock + 1,
        detectedDeposits: detectedCount,
        fromBlock,
        toBlock,
        status: 'SUCCESS' as const,
      };
    });

    return scanOutcome.result;
  } catch (err: any) {
    return {
      scannedBlocks: 0,
      detectedDeposits: 0,
      fromBlock: 0,
      toBlock: 0,
      status: 'ERROR',
      error: `RPC connection error: ${err?.message || 'Unreachable node'}`,
    };
  } finally {
    isScanning = false;
  }
}

/**
 * Trigger an immediate rescan of on-chain deposits for a specific user.
 */
export async function rescanUserDepositStatus(userId: string): Promise<{
  address: string;
  scanned: boolean;
  currentBlock: number;
}> {
  const depositRecord = await getOrCreateUserDepositAddress(userId, 'USDT');

  try {
    const { result: currentBlock } = await bscRpcManager.executeWithFailover(async (provider) => {
      return await provider.getBlockNumber();
    });

    // Re-verify pending/confirming deposits
    const db = await getDb();
    const pendingDeposits = await db.query<{
      tx_hash: string;
      log_index: number;
      from_address: string;
      to_address: string;
      amount: string | number;
      block_number: string | number;
      asset: string;
    }>(
      `
      SELECT tx_hash, log_index, from_address, to_address, amount, block_number, asset
      FROM blockchain_deposits
      WHERE user_id = $1 AND status IN ('DETECTED', 'CONFIRMING')
      `,
      [userId]
    );

    for (const dep of pendingDeposits.rows) {
      await processBlockchainDepositEvent({
        chainId: BSC_CONFIG.CHAIN_ID,
        asset: dep.asset || 'USDT',
        txHash: dep.tx_hash,
        logIndex: Number(dep.log_index || 0),
        fromAddress: dep.from_address,
        toAddress: dep.to_address,
        amount: Number(dep.amount),
        blockNumber: Number(dep.block_number),
        currentBlockNumber: currentBlock,
      });
    }

    return {
      address: depositRecord.address,
      scanned: true,
      currentBlock,
    };
  } catch {
    return {
      address: depositRecord.address,
      scanned: false,
      currentBlock: 0,
    };
  }
}
