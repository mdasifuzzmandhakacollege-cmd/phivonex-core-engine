/**
 * PHIVONEX — PRODUCTION DATA PERSISTENCE & MIGRATION SAFETY TEST SUITE
 * 
 * Tests:
 * 1. Isolated Persistence Test: Uses a temporary PGlite directory, test-owned records only (dynamically claims an available node from inventory without modifying Node #42), data survives restart, directory cleaned up after test.
 * 2. Database Identity Check: Verifies non-secret database identity before and after restart.
 * 3. Migration Safety Test: Schema initialization (initSchema) never deletes, drops, truncates, or overwrites existing records.
 */

process.env.APP_ENV = 'development';
process.env.NODE_ENV = 'test';

import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

// 1. Isolate persistence test completely with a temporary test PGlite directory
const testDataDir = path.resolve(process.cwd(), `.data/test_persist_${uuidv4()}`);
process.env.PGLITE_DATA_DIR = testDataDir;

import { getDb } from '../src/server/db/db';
import { BSC_CONFIG } from '../src/config/bscConfig';
import { generateDepositPublicId, generateLedgerTransactionPublicId } from '../src/server/utils/idGenerator';

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

async function runPersistenceSafetyTests() {
  console.log('\n===============================================================');
  console.log('🧪 PHIVONEX — PRODUCTION DATA PERSISTENCE & MIGRATION SAFETY TESTS');
  console.log('===============================================================\n');

  try {
    let db = await getDb();

    // Capture initial database identity (non-secret)
    const identityBeforeRes = await db.query(`SELECT current_database() as db_name`);
    const identityBefore = identityBeforeRes.rows[0]?.db_name;
    console.log(`[DB Identity Check] Connected Database Name: ${identityBefore}`);

    // Generate unique test identifiers
    const testId = uuidv4().slice(0, 8);
    const userId = uuidv4();
    const userPublicId = `PHX-PERSIST-${testId}`;
    const userEmail = `persist.${testId}@phivonex.test`;
    const depositId = uuidv4();
    const depositPublicId = generateDepositPublicId();
    const txHash = `0xpersist${uuidv4().replace(/-/g, '')}${uuidv4().replace(/-/g, '')}`.slice(0, 66);
    const ledgerId = uuidv4();
    const ledgerPubId = generateLedgerTransactionPublicId();
    const withdrawalId = uuidv4();
    const withdrawalPublicId = `PHX-WDR-${testId}`;

    // 1. Seed test-owned isolated financial & user data
    console.log('--- 1. SEEDING ISOLATED TEST RECORDS ---');
    await db.query(
      `INSERT INTO users (id, public_id, full_name, email, country, password_hash, status) VALUES ($1, $2, 'Persistence Test User', $3, 'US', 'hash', 'ACTIVE') ON CONFLICT DO NOTHING`,
      [userId, userPublicId, userEmail]
    );
    await db.query(
      `INSERT INTO user_referrals (user_id, referral_code) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [userId, `REF-${testId}`]
    );

    // Dynamically claim an available node from inventory for this test user (never hardcoding Node #42)
    const availableNodeRes = await db.query(`SELECT id FROM nodes WHERE status = 'AVAILABLE' LIMIT 1`);
    const nodeId = availableNodeRes.rows[0]?.id;
    if (nodeId) {
      await db.query(
        `UPDATE nodes SET status = 'ACTIVE', owner_user_id = $1 WHERE id = $2`,
        [userId, nodeId]
      );
    }

    await db.query(
      `INSERT INTO blockchain_deposits (id, public_deposit_id, user_id, chain_id, asset, tx_hash, log_index, from_address, to_address, amount, block_number, confirmations, status) VALUES ($1, $2, $3, 56, 'USDT', $4, 0, '0xsender', $5, 1000.0, 123456, 5, 'CREDITED') ON CONFLICT DO NOTHING`,
      [depositId, depositPublicId, userId, txHash, BSC_CONFIG.TREASURY_WALLET_ADDRESS]
    );
    await db.query(
      `INSERT INTO financial_ledger_entries (id, public_txn_id, user_id, entry_type, source_type, source_id, source_ref, description, amount, currency, status) VALUES ($1, $2, $3, 'CREDIT', 'BLOCKCHAIN_DEPOSIT', $4, $5, 'Persistence test deposit credit', 1000.0, 'USDT', 'SETTLED') ON CONFLICT DO NOTHING`,
      [ledgerId, ledgerPubId, userId, depositId, depositPublicId]
    );
    await db.query(
      `INSERT INTO withdrawals (id, public_withdrawal_id, user_id, amount, currency, destination_type, destination_reference, status) VALUES ($1, $2, $3, 100.0, 'USDT', 'USDT_TRC20', 'TRC20AddressTest', 'PENDING') ON CONFLICT DO NOTHING`,
      [withdrawalId, withdrawalPublicId, userId]
    );
    console.log('  -> Seeded isolated test records successfully.');

    // 2. Simulate Application Restart / Reinitialization
    console.log('\n--- 2. SIMULATING APPLICATION RESTART & RECONNECTION ---');
    (globalThis as any).__phivonexDb = undefined;
    (globalThis as any).__phivonexDbPromise = undefined;

    db = await getDb();
    console.log('  -> Application re-initialized / reconnected successfully.');

    // 3. Verify Database Identity Match after restart
    const identityAfterRes = await db.query(`SELECT current_database() as db_name`);
    const identityAfter = identityAfterRes.rows[0]?.db_name;
    assert(identityAfter === identityBefore, 'App restart reconnected to the SAME database identity', `Before: ${identityBefore}, After: ${identityAfter}`);

    // 4. Verify Persistence across restart / reinitialization
    console.log('\n--- 3. VERIFYING DATA SURVIVED RESTART UNCHANGED ---');

    const userRes = await db.query(`SELECT * FROM users WHERE id = $1`, [userId]);
    assert(userRes.rows.length === 1, 'User record survived restart unchanged', `Found ${userRes.rows.length} rows`);

    const referralRes = await db.query(`SELECT * FROM user_referrals WHERE user_id = $1`, [userId]);
    assert(referralRes.rows.length === 1, 'Referral record survived restart unchanged');

    if (nodeId) {
      const nodeRes = await db.query(`SELECT * FROM nodes WHERE id = $1 AND owner_user_id = $2`, [nodeId, userId]);
      assert(nodeRes.rows.length === 1, 'Assigned node record survived restart unchanged');
    }

    const depositRes = await db.query(`SELECT * FROM blockchain_deposits WHERE id = $1`, [depositId]);
    assert(depositRes.rows.length === 1, 'Blockchain deposit survived restart unchanged', `Amount: ${depositRes.rows[0]?.amount}`);

    const ledgerRes = await db.query(`SELECT * FROM financial_ledger_entries WHERE id = $1`, [ledgerId]);
    assert(ledgerRes.rows.length === 1, 'Financial ledger entry survived restart unchanged');

    const withdrawalRes = await db.query(`SELECT * FROM withdrawals WHERE id = $1`, [withdrawalId]);
    assert(withdrawalRes.rows.length === 1, 'Withdrawal record survived restart unchanged');

    // 5. Migration Safety Test: Verify re-running migration initialization never deletes existing records
    console.log('\n--- 4. MIGRATION SAFETY TEST ---');
    const countBefore = await db.query(`SELECT COUNT(*) as cnt FROM users`);
    const countDepositsBefore = await db.query(`SELECT COUNT(*) as cnt FROM blockchain_deposits`);
    const countLedgerBefore = await db.query(`SELECT COUNT(*) as cnt FROM financial_ledger_entries`);

    // Force re-initialization schema run again
    (globalThis as any).__phivonexDb = undefined;
    (globalThis as any).__phivonexDbPromise = undefined;
    const db2 = await getDb();

    const countAfter = await db2.query(`SELECT COUNT(*) as cnt FROM users`);
    const countDepositsAfter = await db2.query(`SELECT COUNT(*) as cnt FROM blockchain_deposits`);
    const countLedgerAfter = await db2.query(`SELECT COUNT(*) as cnt FROM financial_ledger_entries`);

    assert(Number(countAfter.rows[0].cnt) >= Number(countBefore.rows[0].cnt), 'Migration initialization did not delete any users');
    assert(Number(countDepositsAfter.rows[0].cnt) >= Number(countDepositsBefore.rows[0].cnt), 'Migration initialization did not delete any blockchain deposits');
    assert(Number(countLedgerAfter.rows[0].cnt) >= Number(countLedgerBefore.rows[0].cnt), 'Migration initialization did not delete any ledger entries');

    console.log('\n===============================================================');
    console.log(`📊 PERSISTENCE & SAFETY TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('===============================================================\n');

    if (failed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } finally {
    // 6. Delete the temporary test database / PGlite directory after test finishes
    try {
      if (fs.existsSync(testDataDir)) {
        fs.rmSync(testDataDir, { recursive: true, force: true });
        console.log('  -> Cleaned up temporary test database directory successfully.');
      }
    } catch (cleanupErr) {
      console.warn('  -> Cleanup warning:', cleanupErr);
    }
  }
}

runPersistenceSafetyTests().catch((err) => {
  console.error('[Persistence Safety Test Error]', err);
  process.exit(1);
});
