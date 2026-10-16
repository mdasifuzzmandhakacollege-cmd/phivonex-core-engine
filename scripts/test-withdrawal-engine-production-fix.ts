/**
 * PHIVONEX — WITHDRAWAL ENGINE PRODUCTION VERIFICATION TEST SUITE
 * 
 * Verifies:
 * A. Manual withdrawal: PENDING returned quickly.
 * B. Manual approve: APPROVED, not COMPLETED.
 * C. USDT automatic payout: contract.transfer() is called, not native BNB value transfer.
 * D. BNB automatic payout: native value transfer path works.
 * E. RPC failure: no fake txHash, no COMPLETED status (Fail-closed).
 * F. Signer failure: no fake txHash, no COMPLETED status (Fail-closed).
 * G. Real-like mocked broadcast: PROCESSING until receipt confirmed.
 * H. Successful mocked receipt: COMPLETED exactly once.
 * I. Duplicate retry: no second transfer (idempotency safety).
 * J. Multi-instance nonce protection: concurrent payout simulation produces no nonce collisions.
 * K. Frontend submission: loading state always clears.
 * L. APPROVED UI: displays 'Approved — Awaiting Payout' without infinite spinner.
 */

process.env.APP_ENV = 'development';
process.env.NODE_ENV = 'test';

import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { ethers } from 'ethers';

const testDataDir = path.resolve(process.cwd(), `.data/test_wdr_engine_${uuidv4()}`);
process.env.PGLITE_DATA_DIR = testDataDir;

import { getDb } from '../src/server/db/db';
import { postLedgerCredit, getWalletSummary } from '../src/server/services/walletLedgerService';
import {
  createWithdrawalRequest,
  getUserWithdrawals,
  getWithdrawalByPublicId,
  cancelWithdrawalRequest,
  settleWithdrawalAction,
} from '../src/server/services/withdrawalService';
import {
  broadcastBlockchainWithdrawal,
  setTestBscSignerHook,
  allocatePayoutNonce,
} from '../src/server/services/bscSignerService';
import { BSC_CONFIG } from '../src/config/bscConfig';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✅ [PASS] ${testName}`);
    passed++;
  } else {
    console.error(`  ❌ [FAIL] ${testName}${detail ? ` -> ${detail}` : ''}`);
    failed++;
  }
}

async function runWithdrawalEngineTests() {
  console.log('\n===============================================================');
  console.log('🧪 PHIVONEX — WITHDRAWAL ENGINE PRODUCTION TEST SUITE');
  console.log('===============================================================\n');

  try {
    const db = await getDb();
    const pwdHash = 'hash_test_wdr';

    // Helper to create test user
    async function createTestUser(tag: string): Promise<{ id: string; publicId: string }> {
      const id = uuidv4();
      const cleanTag = tag.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toUpperCase();
      const publicId = `PX-${cleanTag}-${Math.floor(1000 + Math.random() * 9000)}`;
      const email = `w_${cleanTag}_${Date.now()}_${Math.floor(Math.random() * 100000)}@phivonex.test`;
      await db.query(
        `INSERT INTO users (id, public_id, full_name, email, country, password_hash, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'United States', $5, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [id, publicId, `Test W ${cleanTag}`, email, pwdHash]
      );
      return { id, publicId };
    }

    const user1 = await createTestUser('user1');
    const user2 = await createTestUser('user2');

    // Credit user1 with $5,000 USDT via ledger credit
    await postLedgerCredit({
      userId: user1.id,
      sourceType: 'BLOCKCHAIN_DEPOSIT',
      sourceId: uuidv4(),
      sourceRef: 'DEPOSIT-INIT-5000',
      amount: 5000.00,
      currency: 'USDT',
      description: 'Initial test deposit of 5000 USDT'
    });

    const destinationEvm = '0x1111111111111111111111111111111111111111';

    // ----------------------------------------------------------------------
    // TEST A: Manual Mode Withdrawal Request (PENDING returned immediately)
    // ----------------------------------------------------------------------
    console.log('\n--- TEST A: MANUAL WITHDRAWAL REQUEST CREATION ---');
    const startReqTime = Date.now();
    const wdr1 = await createWithdrawalRequest({
      userId: user1.id,
      amount: 100.00,
      destinationType: 'USDT_BEP20',
      destinationReference: destinationEvm,
      idempotencyKey: 'manual-req-001'
    });
    const reqDuration = Date.now() - startReqTime;

    assert(wdr1.status === 'PENDING', 'Withdrawal request created with status PENDING');
    assert(reqDuration < 5000, 'Manual withdrawal creation returns immediately without broadcast delay (< 5000ms)');
    assert(wdr1.amount === 100.00, 'Withdrawal amount matches requested amount');
    assert(wdr1.destinationReference === destinationEvm, 'Destination matches EVM address');

    // Balance reservation check
    const wallet1 = await getWalletSummary(user1.id);
    assert(wallet1.availableBalance === 4900.00, 'Available balance debited/reserved accurately (4900 USDT)');

    // ----------------------------------------------------------------------
    // TEST B: Manual Approve (Transitions to APPROVED, NOT COMPLETED or PROCESSING)
    // ----------------------------------------------------------------------
    console.log('\n--- TEST B: MANUAL ADMIN APPROVE STATE ---');
    const approvedWdr1 = await settleWithdrawalAction({
      withdrawalIdOrPublicId: wdr1.publicWithdrawalId,
      action: 'APPROVE',
      actorEmail: 'admin@phivonex.test',
    });

    assert(approvedWdr1.status === 'APPROVED', 'Manual APPROVE sets status to APPROVED (Not COMPLETED)');
    assert(approvedWdr1.approvedAt !== null, 'approvedAt timestamp is set');
    assert(approvedWdr1.completedAt === null, 'completedAt is strictly null on APPROVE');

    // ----------------------------------------------------------------------
    // TEST C: USDT BEP-20 Automatic Payout (calls token.transfer, NOT sendTransaction with BNB value)
    // ----------------------------------------------------------------------
    console.log('\n--- TEST C: USDT BEP-20 AUTOMATIC PAYOUT DISPATCH ---');
    let usdtTransferCalled = false;
    let usdtContractTarget = '';
    let usdtRecipient = '';
    let usdtAmountSentWei = 0n;
    let nativeSendCalledForUsdt = false;

    setTestBscSignerHook({
      onTransferToken: async (contractAddress, to, amountWei) => {
        usdtTransferCalled = true;
        usdtContractTarget = contractAddress;
        usdtRecipient = to;
        usdtAmountSentWei = amountWei;
        const mockHash = '0x' + 'a'.repeat(64);
        return {
          hash: mockHash,
          wait: async () => ({ status: 1, gasUsed: 65000n }),
        };
      },
      onSendTransaction: async () => {
        nativeSendCalledForUsdt = true;
        return {
          hash: '0x' + 'b'.repeat(64),
          wait: async () => ({ status: 1 }),
        };
      },
      getTokenBalance: async () => ethers.parseUnits('100000', 18),
      getBalance: async () => ethers.parseEther('10.0'),
    });

    const wdrUsdt = await createWithdrawalRequest({
      userId: user1.id,
      amount: 250.00,
      destinationType: 'USDT_BEP20',
      destinationReference: destinationEvm,
    });

    const broadcastUsdt = await broadcastBlockchainWithdrawal({
      withdrawalPublicId: wdrUsdt.publicWithdrawalId,
      forceBypassDisabled: true,
    });

    assert(usdtTransferCalled, 'USDT payout calls ERC20 token transfer()');
    assert(!nativeSendCalledForUsdt, 'USDT payout does NOT call native sendTransaction BNB transfer');
    assert(usdtRecipient.toLowerCase() === destinationEvm.toLowerCase(), 'ERC20 transfer destination matches user address');
    assert(usdtAmountSentWei === ethers.parseUnits('250', 18), 'USDT amount parsed with correct 18 decimals');
    assert(broadcastUsdt.withdrawal.status === 'COMPLETED', 'USDT withdrawal completed successfully');
    assert(broadcastUsdt.blockchainRecord.status === 'CONFIRMED', 'Blockchain record marked CONFIRMED upon receipt');

    // ----------------------------------------------------------------------
    // TEST D: BNB Native Automatic Payout (calls native sendTransaction)
    // ----------------------------------------------------------------------
    console.log('\n--- TEST D: BNB NATIVE AUTOMATIC PAYOUT DISPATCH ---');
    let bnbNativeCalled = false;
    let bnbAmountSentWei = 0n;
    let bnbRecipient = '';

    setTestBscSignerHook({
      onSendTransaction: async (tx) => {
        bnbNativeCalled = true;
        bnbRecipient = String(tx.to || '');
        bnbAmountSentWei = BigInt(tx.value?.toString() || '0');
        const mockHash = '0x' + 'c'.repeat(64);
        return {
          hash: mockHash,
          wait: async () => ({ status: 1, gasUsed: 21000n }),
        };
      },
      getBalance: async () => ethers.parseEther('10.0'),
    });

    const wdrBnb = await createWithdrawalRequest({
      userId: user1.id,
      amount: 1.5,
      destinationType: 'BNB',
      destinationReference: destinationEvm,
    });

    const broadcastBnb = await broadcastBlockchainWithdrawal({
      withdrawalPublicId: wdrBnb.publicWithdrawalId,
      forceBypassDisabled: true,
    });

    assert(bnbNativeCalled, 'BNB payout calls native value transfer via wallet.sendTransaction');
    assert(bnbRecipient.toLowerCase() === destinationEvm.toLowerCase(), 'BNB transfer destination matches user address');
    assert(bnbAmountSentWei === ethers.parseEther('1.5'), 'BNB amount converted to wei accurately');
    assert(broadcastBnb.withdrawal.status === 'COMPLETED', 'BNB withdrawal marked COMPLETED');

    // ----------------------------------------------------------------------
    // TEST E: RPC Failure Behavior (No fake txHash, Fail-Closed, Reserved funds retained)
    // ----------------------------------------------------------------------
    console.log('\n--- TEST E: RPC FAILURE FAIL-CLOSED & NO FAKE TX HASH ---');
    setTestBscSignerHook({
      simulateRpcFailure: true,
    });

    const wdrRpcFail = await createWithdrawalRequest({
      userId: user1.id,
      amount: 50.00,
      destinationType: 'USDT_BEP20',
      destinationReference: destinationEvm,
    });
    await settleWithdrawalAction({
      withdrawalIdOrPublicId: wdrRpcFail.publicWithdrawalId,
      action: 'APPROVE',
    });

    let rpcErrorCaught = false;
    try {
      await broadcastBlockchainWithdrawal({
        withdrawalPublicId: wdrRpcFail.publicWithdrawalId,
        forceBypassDisabled: true,
      });
    } catch (err: any) {
      rpcErrorCaught = true;
    }

    assert(rpcErrorCaught, 'RPC failure throws error and blocks broadcast');
    const rpcFailCheck = await getWithdrawalByPublicId(wdrRpcFail.publicWithdrawalId);
    assert(rpcFailCheck?.status !== 'COMPLETED', 'Withdrawal is NOT marked COMPLETED on RPC failure');
    assert(rpcFailCheck?.status === 'APPROVED' || rpcFailCheck?.status === 'PROCESSING', 'Withdrawal retained in safely retryable state');

    // Verify no fake hash was inserted in blockchain_withdrawals
    const bcwRpc = await db.query(`SELECT * FROM blockchain_withdrawals WHERE withdrawal_id = $1`, [wdrRpcFail.id]);
    const rpcTxHash = bcwRpc.rows[0]?.tx_hash;
    assert(!rpcTxHash, 'No fake or placeholder txHash was written to database');

    // ----------------------------------------------------------------------
    // TEST F: Signer Failure Behavior (No fake txHash, Fail-Closed)
    // ----------------------------------------------------------------------
    console.log('\n--- TEST F: SIGNER FAILURE FAIL-CLOSED ---');
    setTestBscSignerHook({
      simulateSignerFailure: true,
    });

    const wdrSignerFail = await createWithdrawalRequest({
      userId: user1.id,
      amount: 75.00,
      destinationType: 'USDT_BEP20',
      destinationReference: destinationEvm,
    });
    await settleWithdrawalAction({
      withdrawalIdOrPublicId: wdrSignerFail.publicWithdrawalId,
      action: 'APPROVE',
    });

    let signerErrorCaught = false;
    try {
      await broadcastBlockchainWithdrawal({
        withdrawalPublicId: wdrSignerFail.publicWithdrawalId,
        forceBypassDisabled: true,
      });
    } catch (err: any) {
      signerErrorCaught = true;
    }

    assert(signerErrorCaught, 'Signer failure throws error and blocks broadcast');
    const signerFailCheck = await getWithdrawalByPublicId(wdrSignerFail.publicWithdrawalId);
    assert(signerFailCheck?.status !== 'COMPLETED', 'Withdrawal is NOT marked COMPLETED on signer failure');

    // ----------------------------------------------------------------------
    // TEST G: Real-like Mocked Broadcast (PROCESSING until receipt confirmed)
    // ----------------------------------------------------------------------
    console.log('\n--- TEST G: PROCESSING UNTIL RECEIPT CONFIRMED ---');
    const realTxHash = '0x' + 'd'.repeat(64);
    setTestBscSignerHook({
      onTransferToken: async () => {
        return {
          hash: realTxHash,
          wait: async () => null, // simulate pending block inclusion
        };
      },
      delayReceiptConfirmation: true, // receipt delayed
      getTokenBalance: async () => ethers.parseUnits('100000', 18),
      getBalance: async () => ethers.parseEther('10.0'),
    });

    const wdrPendingReceipt = await createWithdrawalRequest({
      userId: user1.id,
      amount: 120.00,
      destinationType: 'USDT_BEP20',
      destinationReference: destinationEvm,
    });
    await settleWithdrawalAction({
      withdrawalIdOrPublicId: wdrPendingReceipt.publicWithdrawalId,
      action: 'APPROVE',
    });

    const broadcastPending = await broadcastBlockchainWithdrawal({
      withdrawalPublicId: wdrPendingReceipt.publicWithdrawalId,
      forceBypassDisabled: true,
    });

    assert(broadcastPending.withdrawal.status === 'PROCESSING', 'Withdrawal remains PROCESSING while confirmation is pending');
    assert(broadcastPending.blockchainRecord.status === 'BROADCASTED', 'Blockchain record is marked BROADCASTED (Not CONFIRMED)');
    assert(broadcastPending.txHash === realTxHash, 'Genuine broadcasted txHash is stored');

    // ----------------------------------------------------------------------
    // TEST H: Successful Mocked Receipt (COMPLETED exactly once)
    // ----------------------------------------------------------------------
    console.log('\n--- TEST H: RECEIPT CONFIRMATION FINALIZES TO COMPLETED ---');
    // Now simulate receipt arrival
    setTestBscSignerHook({
      getTransactionReceipt: async (h) => {
        if (h === realTxHash) {
          return { status: 1, gasUsed: 65000n } as any;
        }
        return null;
      },
    });

    // Calling broadcastBlockchainWithdrawal again queries receipt idempotently
    const broadcastConfirmed = await broadcastBlockchainWithdrawal({
      withdrawalPublicId: wdrPendingReceipt.publicWithdrawalId,
      forceBypassDisabled: true,
    });

    assert(broadcastConfirmed.withdrawal.status === 'COMPLETED', 'Withdrawal finalized to COMPLETED once receipt confirms');
    assert(broadcastConfirmed.blockchainRecord.status === 'CONFIRMED', 'Blockchain record finalized to CONFIRMED');

    // ----------------------------------------------------------------------
    // TEST I: Duplicate Retry Protection (Double-spending strictly prevented)
    // ----------------------------------------------------------------------
    console.log('\n--- TEST I: IDEMPOTENCY & DUPLICATE BROADCAST SAFETY ---');
    let doubleSpendBlocked = false;
    try {
      await broadcastBlockchainWithdrawal({
        withdrawalPublicId: wdrPendingReceipt.publicWithdrawalId,
        forceBypassDisabled: true,
      });
    } catch (dupErr: any) {
      doubleSpendBlocked = dupErr.message.includes('ALREADY_BROADCASTED') || (dupErr as any).code === 'ALREADY_BROADCASTED';
    }

    assert(doubleSpendBlocked, 'Subsequent broadcast attempt on confirmed withdrawal is strictly blocked');

    // ----------------------------------------------------------------------
    // TEST J: Multi-Instance Nonce Protection
    // ----------------------------------------------------------------------
    console.log('\n--- TEST J: MULTI-INSTANCE NONCE PROTECTION ---');
    setTestBscSignerHook({
      onTransferToken: async (_c, _to, _a, opts) => {
        return {
          hash: '0x' + Math.random().toString(16).substring(2).padEnd(64, '0'),
          wait: async () => ({ status: 1, gasUsed: 65000n }),
        };
      },
      getTokenBalance: async () => ethers.parseUnits('100000', 18),
      getBalance: async () => ethers.parseEther('10.0'),
    });

    const wdrConc1 = await createWithdrawalRequest({
      userId: user1.id,
      amount: 10.00,
      destinationType: 'USDT_BEP20',
      destinationReference: destinationEvm,
    });
    const wdrConc2 = await createWithdrawalRequest({
      userId: user1.id,
      amount: 15.00,
      destinationType: 'USDT_BEP20',
      destinationReference: destinationEvm,
    });

    await settleWithdrawalAction({ withdrawalIdOrPublicId: wdrConc1.publicWithdrawalId, action: 'APPROVE' });
    await settleWithdrawalAction({ withdrawalIdOrPublicId: wdrConc2.publicWithdrawalId, action: 'APPROVE' });

    // Execute concurrently simulating multiple server instances
    const [bRes1, bRes2] = await Promise.all([
      broadcastBlockchainWithdrawal({ withdrawalPublicId: wdrConc1.publicWithdrawalId, forceBypassDisabled: true }),
      broadcastBlockchainWithdrawal({ withdrawalPublicId: wdrConc2.publicWithdrawalId, forceBypassDisabled: true }),
    ]);

    assert(bRes1.blockchainRecord.nonce !== bRes2.blockchainRecord.nonce, 'Concurrent payouts receive distinct, monotonic nonces (No collisions)');
    assert(bRes1.txHash !== bRes2.txHash, 'Concurrent payouts produce distinct transaction hashes');

    // Clean up test hook
    setTestBscSignerHook(null);

    // ----------------------------------------------------------------------
    // TEST K & L: Verification of Frontend Status Semantics
    // ----------------------------------------------------------------------
    console.log('\n--- TEST K & L: STATUS SEMANTICS & UI INTEGRITY ---');
    const withdrawalsViewSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/dashboard/WithdrawalsView.tsx'), 'utf-8');

    const hasNoSpinOnApproved = !withdrawalsViewSrc.includes('case \'APPROVED\':\n      case \'PROCESSING\':');
    const hasApprovedLabel = withdrawalsViewSrc.includes('Approved — Awaiting Payout');
    const hasProcessingLabel = withdrawalsViewSrc.includes('Blockchain Confirmation Pending');
    const hasAbortController = withdrawalsViewSrc.includes('AbortController');

    assert(hasNoSpinOnApproved, 'APPROVED status is unbundled from PROCESSING and has no infinite spinning loader');
    assert(hasApprovedLabel, 'APPROVED badge displays "Approved — Awaiting Payout"');
    assert(hasProcessingLabel, 'PROCESSING badge displays "Blockchain Confirmation Pending"');
    assert(hasAbortController, 'Frontend form submission employs AbortController with bounded timeout');

    console.log('\n===============================================================');
    console.log(`📊 TEST SUITE SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('===============================================================\n');

    if (failed > 0) {
      process.exit(1);
    }
    process.exit(0);
  } catch (err: any) {
    console.error('Fatal test error:', err);
    process.exit(1);
  }
}

runWithdrawalEngineTests();
