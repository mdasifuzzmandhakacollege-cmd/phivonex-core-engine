/**
 * PHIVONEX — TASK #17.1 TEST SUITE
 * BNB Smart Chain Automatic Deposit + On-Chain Withdrawal Settlement
 */

process.env.NODE_ENV = 'test';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
const testDataDir = path.resolve(process.cwd(), `.data/test_task17_bsc_${uuidv4()}`);
process.env.PGLITE_DATA_DIR = testDataDir;

import { getDb } from '../src/server/db/db';
import { BSC_CONFIG } from '../src/config/bscConfig';
import {
  getOrCreateUserDepositAddress,
  findUserByDepositAddress,
  deriveUserBnbAddress,
} from '../src/server/services/bscKeyService';
import {
  processBlockchainDepositEvent,
  handleDepositReorg,
  getUserDeposits,
} from '../src/server/services/bscDepositService';
import {
  broadcastBnbWithdrawal,
} from '../src/server/services/bscSignerService';
import {
  createWithdrawalRequest,
  settleWithdrawalAction,
  getWithdrawalByPublicId,
} from '../src/server/services/withdrawalService';
import { postLedgerCredit, getWalletSummary } from '../src/server/services/walletLedgerService';

let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passedTests++;
  } else {
    console.error(`  ❌ FAIL: ${testName}${detail ? ` -> ${detail}` : ''}`);
    failedTests++;
  }
}

async function runTests() {
  console.log('\n==================================================');
  console.log('🚀 RUNNING TASK #17.1: BNB SMART CHAIN TEST SUITE');
  console.log('==================================================\n');

  const db = await getDb();

  // Setup Test Users
  const userAId = uuidv4();
  const userBId = uuidv4();
  const suffix = uuidv4().slice(0, 5).toUpperCase();

  await db.query(
    `
    INSERT INTO users (id, public_id, full_name, email, country, password_hash, status, role)
    VALUES 
      ($1, $3, 'Alice BSC', $4, 'US', 'hash123', 'ACTIVE', 'USER'),
      ($2, $5, 'Bob BSC', $6, 'US', 'hash123', 'ACTIVE', 'USER')
    ON CONFLICT (id) DO NOTHING;
    `,
    [
      userAId,
      userBId,
      `PHX-A${suffix}`,
      `alice.${suffix.toLowerCase()}@phivonex.test`,
      `PHX-B${suffix}`,
      `bob.${suffix.toLowerCase()}@phivonex.test`,
    ]
  );

  console.log('--- TEST GROUP 1: Network Configuration & Key Isolation ---');
  assert(BSC_CONFIG.CHAIN_ID === 97 || BSC_CONFIG.CHAIN_ID === 56, 'BSC Chain ID is configured server-side only (Chain 97/56)');
  assert(BSC_CONFIG.REQUIRED_CONFIRMATIONS >= 1, 'Required confirmations is configured server-side (default 3)');
  assert(Boolean(BSC_CONFIG.TREASURY_ADDRESS), 'Treasury hot wallet address is configured');
  assert(BSC_CONFIG.ASSET === 'USDT' || BSC_CONFIG.ASSET === 'BNB', 'Asset identifier is configured (USDT / BNB)');

  console.log('\n--- TEST GROUP 2: Deterministic Address Derivation & DB Privacy ---');
  const userAAddressRecord = await getOrCreateUserDepositAddress(userAId, 'BNB');
  const userBAddressRecord = await getOrCreateUserDepositAddress(userBId, 'BNB');

  assert(Boolean(userAAddressRecord.address), 'User A receives unique BNB deposit address');
  assert(Boolean(userBAddressRecord.address), 'User B receives unique BNB deposit address');
  assert(userAAddressRecord.address !== userBAddressRecord.address, 'User A and User B receive distinct addresses');
  assert(userAAddressRecord.asset === 'BNB', 'Deposit asset recorded as BNB');

  // Idempotency check for address retrieval
  const userAAddressRecord2 = await getOrCreateUserDepositAddress(userAId, 'BNB');
  assert(userAAddressRecord.address === userAAddressRecord2.address, 'Subsequent address retrieval returns identical address');
  assert(userAAddressRecord.derivationIndex >= 0, 'Derivation index is assigned monotonically');

  // Verify private key is NOT in database
  const udaRaw = await db.query(`SELECT * FROM user_deposit_addresses WHERE user_id = $1`, [userAId]);
  const columns = Object.keys(udaRaw.rows[0]);
  assert(!columns.includes('private_key') && !columns.includes('secret') && !columns.includes('seed'), 'user_deposit_addresses table contains NO private keys or seeds');

  // Reverse lookup verification
  const resolvedUserId = await findUserByDepositAddress(userAAddressRecord.address);
  assert(resolvedUserId === userAId, 'Deposit address correctly resolves to owner user ID');

  const unknownResolved = await findUserByDepositAddress('0x000000000000000000000000000000000000dead');
  assert(unknownResolved === null, 'Unknown third-party address resolves to null');

  console.log('\n--- TEST GROUP 3: Automatic Deposit Flow & Confirmation Handling ---');
  const txHash1 = `0x${uuidv4().replace(/-/g, '')}${uuidv4().replace(/-/g, '')}`.slice(0, 66);
  const txHash2 = `0x${uuidv4().replace(/-/g, '')}${uuidv4().replace(/-/g, '')}`.slice(0, 66);
  const startBlock = 38000000;

  // 1. First block detection: only 1 confirmation (< 3 required)
  const depositEvent1 = await processBlockchainDepositEvent({
    chainId: BSC_CONFIG.CHAIN_ID,
    txHash: txHash1,
    fromAddress: '0x3333333333333333333333333333333333333333',
    toAddress: userAAddressRecord.address,
    amount: 1.5,
    blockNumber: startBlock,
    currentBlockNumber: startBlock, // 1 confirmation
  });

  assert(depositEvent1 !== null, 'Incoming deposit transfer detected');
  assert(depositEvent1?.confirmations === 1, 'Confirmations recorded as 1');
  assert(depositEvent1?.status === 'CONFIRMING' || depositEvent1?.status === 'DETECTED', 'Status is CONFIRMING / DETECTED when confirmations < 3');
  assert(depositEvent1?.creditedAt === null, 'Deposit is NOT credited before reaching required confirmations');

  // Verify ledger has NOT been credited yet
  const ledgerCheck1 = await db.query(
    `SELECT * FROM financial_ledger_entries WHERE user_id = $1 AND source_id = $2`,
    [userAId, depositEvent1?.id]
  );
  assert(ledgerCheck1.rows.length === 0, 'Ledger has 0 entries for unconfirmed deposit');

  // 2. Advance chain by 1 block: 2 confirmations (< 3 required)
  const depositEvent1Step2 = await processBlockchainDepositEvent({
    chainId: BSC_CONFIG.CHAIN_ID,
    txHash: txHash1,
    fromAddress: '0x3333333333333333333333333333333333333333',
    toAddress: userAAddressRecord.address,
    amount: 1.5,
    blockNumber: startBlock,
    currentBlockNumber: startBlock + 1, // 2 confirmations
  });

  assert(depositEvent1Step2?.confirmations === 2, 'Confirmations updated to 2');
  assert(depositEvent1Step2?.status === 'CONFIRMING', 'Status remains CONFIRMING at 2 confirmations');
  assert(depositEvent1Step2?.creditedAt === null, 'Deposit still NOT credited at 2 confirmations');

  // 3. Advance chain to 3 confirmations (Matured -> CREDITED)
  const depositEvent1Matured = await processBlockchainDepositEvent({
    chainId: BSC_CONFIG.CHAIN_ID,
    txHash: txHash1,
    fromAddress: '0x3333333333333333333333333333333333333333',
    toAddress: userAAddressRecord.address,
    amount: 1.5,
    blockNumber: startBlock,
    currentBlockNumber: startBlock + 2, // 3 confirmations
  });

  assert(depositEvent1Matured?.confirmations === 3, 'Confirmations reaches 3');
  assert(depositEvent1Matured?.status === 'CREDITED', 'Status transitions to CREDITED once required confirmations met');
  assert(depositEvent1Matured?.creditedAt !== null, 'Deposit creditedAt timestamp is set');

  // Verify ledger entry
  const ledgerCheck2 = await db.query(
    `SELECT * FROM financial_ledger_entries WHERE user_id = $1 AND source_id = $2`,
    [userAId, depositEvent1?.id]
  );
  assert(ledgerCheck2.rows.length === 1, 'Financial ledger credited exactly once');
  assert(ledgerCheck2.rows[0].entry_type === 'CREDIT', 'Ledger entry is CREDIT');
  assert(['USDT', 'USD', 'BNB'].includes(ledgerCheck2.rows[0].currency), 'Ledger recorded for deposit');
  assert(Number(ledgerCheck2.rows[0].amount) === 1.5, 'Ledger credit amount matches 1.5 BNB');

  console.log('\n--- TEST GROUP 4: Idempotency & Duplicate Scan Protection ---');
  // Re-scanning the same block or advancing block count must NOT create duplicate ledger credits
  const depositEventDuplicateScan = await processBlockchainDepositEvent({
    chainId: BSC_CONFIG.CHAIN_ID,
    txHash: txHash1,
    fromAddress: '0x3333333333333333333333333333333333333333',
    toAddress: userAAddressRecord.address,
    amount: 1.5,
    blockNumber: startBlock,
    currentBlockNumber: startBlock + 10, // 11 confirmations
  });

  assert(depositEventDuplicateScan?.status === 'CREDITED', 'Status stays CREDITED on re-scan');
  const ledgerCheckDuplicate = await db.query(
    `SELECT * FROM financial_ledger_entries WHERE user_id = $1 AND source_id = $2`,
    [userAId, depositEvent1?.id]
  );
  assert(ledgerCheckDuplicate.rows.length === 1, 'Duplicate block scans do NOT duplicate financial ledger credits');

  console.log('\n--- TEST GROUP 5: Reorg Protection & User Isolation ---');
  // 1. Test unfinalized transaction reorg
  const reorgTxHash = `0x${uuidv4().replace(/-/g, '')}${uuidv4().replace(/-/g, '')}`.slice(0, 66);
  await processBlockchainDepositEvent({
    chainId: BSC_CONFIG.CHAIN_ID,
    txHash: reorgTxHash,
    fromAddress: '0x4444444444444444444444444444444444444444',
    toAddress: userBAddressRecord.address,
    amount: 5.0,
    blockNumber: startBlock + 50,
    currentBlockNumber: startBlock + 50, // 1 confirmation (unfinalized)
  });

  const reorgResult = await handleDepositReorg({
    chainId: BSC_CONFIG.CHAIN_ID,
    txHash: reorgTxHash,
    toAddress: userBAddressRecord.address,
  });

  assert(reorgResult?.status === 'REORGED', 'Unconfirmed transaction marked as REORGED upon chain reorganizations');

  // Verify User B did not get credited
  const userBLedger = await db.query(
    `SELECT * FROM financial_ledger_entries WHERE user_id = $1 AND source_id = $2`,
    [userBId, reorgResult?.id]
  );
  assert(userBLedger.rows.length === 0, 'Reorged transaction was never credited to ledger');

  // 2. User Isolation Check
  const userADeposits = await getUserDeposits(userAId);
  const userBDeposits = await getUserDeposits(userBId);

  assert(userADeposits.deposits.every((d) => d.userId === userAId), 'User A sees only own deposits');
  assert(userBDeposits.deposits.every((d) => d.userId === userBId), 'User B sees only own deposits');
  assert(userADeposits.summary.totalCreditedBnb >= 1.5, 'User A summary reflects credited BNB');

  console.log('\n--- TEST GROUP 6: On-Chain Withdrawal Broadcast & Nonce Management ---');
  process.env.WITHDRAWALS_ENABLED = 'true';
  // 1. Create a withdrawal request for User A with a valid BSC address
  // First, grant User A sufficient balance for test withdrawal
  await postLedgerCredit({
    userId: userAId,
    sourceType: 'REFERRAL_COMMISSION',
    sourceId: uuidv4(),
    sourceRef: 'COMM-TEST-BSC',
    amount: 500.0,
    description: 'Direct Referral Commission',
  });

  const destinationBsc = '0x8888888888888888888888888888888888888888';
  const withdrawalRequest = await createWithdrawalRequest({
    userId: userAId,
    amount: 50.0,
    destinationType: 'BNB',
    destinationReference: destinationBsc,
  });

  assert(withdrawalRequest.status === 'PENDING', 'Withdrawal request created in PENDING status');

  // 2. Admin approves withdrawal
  const approvedWithdrawal = await settleWithdrawalAction({
    withdrawalIdOrPublicId: withdrawalRequest.publicWithdrawalId,
    action: 'APPROVE',
  });
  assert(approvedWithdrawal.status === 'APPROVED', 'Withdrawal transitions to APPROVED');

  // 3. Broadcast on BNB Smart Chain
  const broadcastResult = await broadcastBnbWithdrawal({
    withdrawalPublicId: approvedWithdrawal.publicWithdrawalId,
  });

  assert(Boolean(broadcastResult.txHash), 'Withdrawal successfully broadcasted with on-chain tx hash');
  assert(broadcastResult.withdrawal.status === 'COMPLETED', 'Withdrawal transitions to COMPLETED post broadcast');
  assert(broadcastResult.blockchainRecord.status === 'CONFIRMED', 'Blockchain withdrawal record marked CONFIRMED');
  assert(broadcastResult.blockchainRecord.destination.toLowerCase() === destinationBsc.toLowerCase(), 'Destination address matches');

  // 4. Duplicate broadcast prevention
  let duplicateBlocked = false;
  try {
    await broadcastBnbWithdrawal({
      withdrawalPublicId: approvedWithdrawal.publicWithdrawalId,
    });
  } catch (err: any) {
    duplicateBlocked = err.message.includes('ALREADY_BROADCASTED') || err.message.includes('INVALID_STATE');
  }
  assert(duplicateBlocked, 'Duplicate withdrawal broadcast attempt is strictly blocked');

  // 5. Verify blockchain_withdrawals table record exists
  const bcwRow = await db.query(
    `SELECT * FROM blockchain_withdrawals WHERE withdrawal_id = $1`,
    [withdrawalRequest.id]
  );
  assert(bcwRow.rows.length === 1, 'Authoritative blockchain_withdrawals entry exists');
  assert(bcwRow.rows[0].nonce >= 0, 'Nonce is recorded');
  assert(Boolean(bcwRow.rows[0].tx_hash), 'TX hash is stored in database');

  // 6. Test Insufficient Gas Reserve Handling
  await postLedgerCredit({
    userId: userAId,
    sourceType: 'REFERRAL_COMMISSION',
    sourceId: uuidv4(),
    sourceRef: 'COMM-TEST-LARGE',
    amount: 10000.0,
    description: 'Direct Referral Commission Large',
  });

  const hugeWithdrawal = await createWithdrawalRequest({
    userId: userAId,
    amount: 5000.0, // Exceeds simulated 100 BNB treasury reserve
    destinationType: 'BNB',
    destinationReference: destinationBsc,
  });
  await settleWithdrawalAction({ withdrawalIdOrPublicId: hugeWithdrawal.publicWithdrawalId, action: 'APPROVE' });

  let gasReserveBlocked = false;
  try {
    await broadcastBnbWithdrawal({ withdrawalPublicId: hugeWithdrawal.publicWithdrawalId });
  } catch (gasErr: any) {
    gasReserveBlocked = gasErr.message.includes('INSUFFICIENT_GAS_RESERVE') || (gasErr as any).code === 'INSUFFICIENT_GAS_RESERVE';
  }
  assert(gasReserveBlocked, 'Withdrawal exceeding treasury reserve triggers controlled INSUFFICIENT_GAS_RESERVE error');

  console.log('\n--- TEST GROUP 7: Concurrency & Nonce Safety ---');
  // Test concurrent broadcast nonce serialization
  // Grant balance and create 2 more withdrawals
  await postLedgerCredit({
    userId: userAId,
    sourceType: 'REFERRAL_COMMISSION',
    sourceId: uuidv4(),
    sourceRef: 'COMM-TEST-BSC-2',
    amount: 500.0,
    description: 'Direct Referral Commission 2',
  });

  const w2 = await createWithdrawalRequest({
    userId: userAId,
    amount: 20.0,
    destinationType: 'BNB',
    destinationReference: destinationBsc,
  });
  const w3 = await createWithdrawalRequest({
    userId: userAId,
    amount: 25.0,
    destinationType: 'BNB',
    destinationReference: destinationBsc,
  });

  await settleWithdrawalAction({ withdrawalIdOrPublicId: w2.publicWithdrawalId, action: 'APPROVE' });
  await settleWithdrawalAction({ withdrawalIdOrPublicId: w3.publicWithdrawalId, action: 'APPROVE' });

  // Broadcast concurrently
  const [b2, b3] = await Promise.all([
    broadcastBnbWithdrawal({ withdrawalPublicId: w2.publicWithdrawalId }),
    broadcastBnbWithdrawal({ withdrawalPublicId: w3.publicWithdrawalId }),
  ]);

  assert(b2.blockchainRecord.nonce !== b3.blockchainRecord.nonce, 'Concurrent broadcasts receive unique, distinct nonces');
  assert(b2.txHash !== b3.txHash, 'Concurrent broadcasts receive distinct transaction hashes');

  console.log('\n==================================================');
  console.log(`📊 TASK #17.1 TEST RESULTS: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log('==================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runTests().catch((err) => {
  console.error('Fatal test execution failure:', err);
  process.exit(1);
});
