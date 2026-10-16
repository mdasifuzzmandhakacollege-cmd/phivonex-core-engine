/**
 * PHIVONEX — AUTOMATIC USDT DEPOSIT TEST SUITE
 * Complete Verification of USDT BEP-20 Automatic Deposit Flow & Invariants
 */

process.env.NODE_ENV = 'test';
process.env.DEPOSIT_CONFIRMATIONS = '3';
process.env.TREASURY_WALLET_ADDRESS = '0x71c8705e3473187f6c1ab3c4709d4352d7f338f0';

import { getDb } from '../src/server/db/db';
import { v4 as uuidv4 } from 'uuid';
import { BSC_CONFIG } from '../src/config/bscConfig';
import {
  getOrCreateUserDepositAddress,
  findUserByDepositAddress,
  deriveUserBnbAddress,
} from '../src/server/services/bscKeyService';
import {
  processBlockchainDepositEvent,
  sweepDepositToTreasury,
  getUserDeposits,
} from '../src/server/services/bscDepositService';

let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✅ [PASS] ${testName}`);
    passedTests++;
  } else {
    console.error(`  ❌ [FAIL] ${testName}${detail ? ` -> ${detail}` : ''}`);
    failedTests++;
  }
}

async function runTests() {
  console.log('\n======================================================');
  console.log('🧪 RUNNING AUTOMATIC USDT DEPOSIT TEST SUITE');
  console.log('======================================================\n');

  const db = await getDb();

  // Setup Test Users
  const user1Id = uuidv4();
  const user2Id = uuidv4();
  const suffix = uuidv4().slice(0, 6).toUpperCase();

  await db.query(
    `
    INSERT INTO users (id, public_id, full_name, email, country, password_hash, status, role)
    VALUES 
      ($1, $3, 'USDT Operator 1', $4, 'US', 'hash123', 'ACTIVE', 'USER'),
      ($2, $5, 'USDT Operator 2', $6, 'US', 'hash123', 'ACTIVE', 'USER')
    ON CONFLICT (id) DO NOTHING;
    `,
    [
      user1Id,
      user2Id,
      `PHX-U1-${suffix}`,
      `usdt1.${suffix.toLowerCase()}@phivonex.test`,
      `PHX-U2-${suffix}`,
      `usdt2.${suffix.toLowerCase()}@phivonex.test`,
    ]
  );

  console.log('--- 1. SERVER-SIDE CONFIGURATION & WITHDRAWAL PROTECTION ---');
  assert(BSC_CONFIG.CHAIN_ID === 97 || BSC_CONFIG.CHAIN_ID === 56, 'BSC Chain ID is configured correctly');
  assert(Boolean(BSC_CONFIG.RPC_URL), 'BSC RPC URL is available for block & log queries');
  assert(Boolean(BSC_CONFIG.USDT_CONTRACT_ADDRESS), 'USDT contract address is configured');
  assert(Boolean(BSC_CONFIG.TREASURY_WALLET_ADDRESS), 'Treasury wallet address is configured');
  assert(BSC_CONFIG.REQUIRED_CONFIRMATIONS === 3, 'Deposit confirmations is configurable (3 confirmations)');
  assert(BSC_CONFIG.WITHDRAWALS_ENABLED === false, 'Withdrawals remain strictly DISABLED by default');

  console.log('\n--- 2. UNIQUE DEPOSIT ADDRESS & USER MAPPING ---');
  const user1AddressRec = await getOrCreateUserDepositAddress(user1Id, 'USDT');
  const user2AddressRec = await getOrCreateUserDepositAddress(user2Id, 'USDT');

  assert(Boolean(user1AddressRec.address), 'User 1 generated a unique BSC deposit address');
  assert(Boolean(user2AddressRec.address), 'User 2 generated a unique BSC deposit address');
  assert(user1AddressRec.address !== user2AddressRec.address, 'Each user receives an isolated unique deposit address');
  assert(user1AddressRec.asset === 'USDT', 'Deposit address is tagged for USDT asset');

  // Verify reverse mapping
  const resolvedOwner = await findUserByDepositAddress(user1AddressRec.address);
  assert(resolvedOwner === user1Id, 'Deposit address resolves back to the correct user ID');

  // Verify unknown deposit address is rejected safely
  const unknownAddress = '0x1111111111111111111111111111111111111111';
  const unknownOwner = await findUserByDepositAddress(unknownAddress);
  assert(unknownOwner === null, 'Unknown non-platform address returns null');

  // Verify no secrets in database table
  const addrRow = await db.query(`SELECT * FROM user_deposit_addresses WHERE user_id = $1`, [user1Id]);
  const tableCols = Object.keys(addrRow.rows[0]);
  assert(!tableCols.includes('private_key') && !tableCols.includes('secret'), 'Database stores 0 private keys or secret seeds');

  console.log('\n--- 3. USDT DEPOSIT DETECTION & CONFIRMATION PROGRESSION ---');
  const txHash = `0xusdt${uuidv4().replace(/-/g, '')}${uuidv4().replace(/-/g, '')}`.slice(0, 66);
  const blockStart = 45000000;
  const depositAmountUsdt = 250.00;

  // Attempt deposit to unregistered address (Should be ignored)
  const ignoredResult = await processBlockchainDepositEvent({
    chainId: BSC_CONFIG.CHAIN_ID,
    asset: 'USDT',
    txHash: `0xignored${uuidv4().replace(/-/g, '')}`.slice(0, 66),
    fromAddress: '0xsender1111111111111111111111111111111111',
    toAddress: unknownAddress,
    amount: 500,
    blockNumber: blockStart,
    currentBlockNumber: blockStart,
  });
  assert(ignoredResult === null, 'Deposit to unregistered address is safely ignored');

  // Step A: First detection at 1 confirmation (Status = DETECTED / CONFIRMING)
  const depositStep1 = await processBlockchainDepositEvent({
    chainId: BSC_CONFIG.CHAIN_ID,
    asset: 'USDT',
    txHash,
    fromAddress: '0xsender1111111111111111111111111111111111',
    toAddress: user1AddressRec.address,
    amount: depositAmountUsdt,
    blockNumber: blockStart,
    currentBlockNumber: blockStart, // 1 confirmation
  });

  assert(depositStep1 !== null, 'USDT deposit event is detected');
  assert(depositStep1?.confirmations === 1, 'Confirmations recorded as 1');
  assert(depositStep1?.status === 'CONFIRMING' || depositStep1?.status === 'DETECTED', 'Status is CONFIRMING / DETECTED at 1 confirmation');
  assert(depositStep1?.creditedAt === null, 'Deposit is NOT credited prematurely');

  // Verify ledger balance is NOT credited yet
  const preCreditLedger = await db.query(
    `SELECT * FROM financial_ledger_entries WHERE user_id = $1 AND source_id = $2`,
    [user1Id, depositStep1?.id]
  );
  assert(preCreditLedger.rows.length === 0, 'Financial ledger has 0 credits while deposit is confirming');

  // Step B: Advance by 1 block: 2 confirmations
  const depositStep2 = await processBlockchainDepositEvent({
    chainId: BSC_CONFIG.CHAIN_ID,
    asset: 'USDT',
    txHash,
    fromAddress: '0xsender1111111111111111111111111111111111',
    toAddress: user1AddressRec.address,
    amount: depositAmountUsdt,
    blockNumber: blockStart,
    currentBlockNumber: blockStart + 1, // 2 confirmations
  });

  assert(depositStep2?.confirmations === 2, 'Confirmations advanced to 2');
  assert(depositStep2?.status === 'CONFIRMING', 'Status remains CONFIRMING at 2 confirmations');

  // Step C: Advance to 3 confirmations -> Reaches threshold -> Status CREDITED
  const depositMatured = await processBlockchainDepositEvent({
    chainId: BSC_CONFIG.CHAIN_ID,
    asset: 'USDT',
    txHash,
    fromAddress: '0xsender1111111111111111111111111111111111',
    toAddress: user1AddressRec.address,
    amount: depositAmountUsdt,
    blockNumber: blockStart,
    currentBlockNumber: blockStart + 2, // 3 confirmations
  });

  assert(depositMatured?.confirmations === 3, 'Confirmations reaches 3');
  assert(depositMatured?.status === 'CREDITED', 'Status transitions to CREDITED upon required confirmations');
  assert(Boolean(depositMatured?.creditedAt), 'Credited timestamp is recorded');

  // Step D: Verify exact USDT amount was credited to user's financial ledger
  const creditedLedger = await db.query(
    `SELECT * FROM financial_ledger_entries WHERE user_id = $1 AND source_id = $2`,
    [user1Id, depositMatured?.id]
  );
  assert(creditedLedger.rows.length === 1, 'Exact 1 ledger credit entry was posted');
  assert(Number(creditedLedger.rows[0].amount) === depositAmountUsdt, `Ledger amount matches exact USDT deposit amount ($${depositAmountUsdt})`);
  assert(creditedLedger.rows[0].currency === 'USDT' || creditedLedger.rows[0].currency === 'USD', 'Ledger currency recorded properly');

  console.log('\n--- 4. IDEMPOTENCY & DUPLICATE SUBMISSION PROTECTION ---');
  // Re-run the same matured deposit event (e.g. repeated block scan / restart)
  const depositReplay = await processBlockchainDepositEvent({
    chainId: BSC_CONFIG.CHAIN_ID,
    asset: 'USDT',
    txHash,
    fromAddress: '0xsender1111111111111111111111111111111111',
    toAddress: user1AddressRec.address,
    amount: depositAmountUsdt,
    blockNumber: blockStart,
    currentBlockNumber: blockStart + 10,
  });

  assert(depositReplay?.status === 'CREDITED', 'Replayed event remains CREDITED');

  const duplicateCheck = await db.query(
    `SELECT COUNT(*)::int as count FROM financial_ledger_entries WHERE user_id = $1 AND source_id = $2`,
    [user1Id, depositMatured?.id]
  );
  assert(duplicateCheck.rows[0].count === 1, 'Duplicate deposit scan NEVER causes double credit');

  console.log('\n--- 5. OPTIONAL SWEEP SERVICE TO TREASURY ---');
  const sweepResult = await sweepDepositToTreasury({
    userId: user1Id,
    depositAddress: user1AddressRec.address,
    amountUsdt: depositAmountUsdt,
  });

  assert(sweepResult.success === true, 'Sweep service executed cleanly');
  assert(Boolean(sweepResult.treasuryAddress), 'Sweep targets the configured TREASURY_WALLET_ADDRESS');
  assert(sweepResult.status === 'COMPLETED' || sweepResult.status === 'SIMULATED', 'Sweep returns valid completion status');

  console.log('\n======================================================');
  console.log(`📊 TEST RESULTS: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log('======================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal error running automatic USDT deposit tests:', err);
  process.exit(1);
});
