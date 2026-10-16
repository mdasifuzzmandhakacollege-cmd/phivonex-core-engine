/**
 * PHIVONEX — TASK 2 FINAL SAFETY PATCH TEST SUITE
 * 
 * Tests:
 * 1. Production Simulator Lockdown: APP_ENV=production -> POST /api/deposits/simulate-test-deposit returns 403 Forbidden.
 * 2. Atomic TxHash Credit with BEGIN/COMMIT/ROLLBACK and ON CONFLICT DO NOTHING.
 * 3. Concurrency / Duplicate Idempotency Test: Two submissions of the same txHash/logIndex -> exactly ONE user receives the credit, second is rejected.
 */

process.env.APP_ENV = 'development';
process.env.NODE_ENV = 'test';

import { getDb, DatabaseClient } from '../src/server/db/db';
import { v4 as uuidv4 } from 'uuid';
import { BSC_CONFIG } from '../src/config/bscConfig';
import { generateDepositPublicId, generateLedgerTransactionPublicId } from '../src/server/utils/idGenerator';
import { generateRandomToken, hashToken } from '../src/server/utils/crypto';
import request from 'supertest';
import express from 'express';
import { depositRouter } from '../src/server/routes/depositRoutes';

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

async function runSafetyPatchTests() {
  console.log('\n===============================================================');
  console.log('🧪 PHIVONEX — TASK 2 FINAL SAFETY PATCH TEST SUITE');
  console.log('===============================================================\n');

  const db = await getDb();
  const userId = uuidv4();
  const sessionToken = generateRandomToken(32);
  const tokenHash = hashToken(sessionToken);

  await db.query(
    `INSERT INTO users (id, public_id, full_name, email, country, password_hash, status) VALUES ($1, $2, 'Safety Test User', $3, 'US', 'hash', 'ACTIVE') ON CONFLICT DO NOTHING`,
    [userId, `PHX-SFT-${userId.slice(0, 4)}`, `safety.${userId.slice(0, 4)}@phivonex.test`]
  );
  await db.query(
    `INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP + INTERVAL '1 hour')`,
    [uuidv4(), userId, tokenHash]
  );

  // Test 1: Production Simulator Lockdown (set APP_ENV=production before app setup)
  console.log('--- 1. PRODUCTION SIMULATOR LOCKDOWN TEST ---');
  process.env.APP_ENV = 'production';
  process.env.NODE_ENV = 'production';

  const prodApp = express();
  prodApp.use(express.json());
  prodApp.use('/api/deposits', depositRouter);

  const prodRes = await request(prodApp)
    .post('/api/deposits/simulate-test-deposit')
    .set('Authorization', `Bearer ${sessionToken}`)
    .send({ amount: 100, txHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' });

  assert(prodRes.status === 403, 'Simulate test deposit in production returns 403 Forbidden', `Status: ${prodRes.status}`);
  assert(prodRes.body.success === false, 'Simulate test deposit response success is false');

  // Reset env
  process.env.APP_ENV = 'development';
  process.env.NODE_ENV = 'test';

  console.log('\n--- 2. ATOMIC TRANSACTION & IDEMPOTENCY / CONCURRENCY TEST ---');
  const user1Id = uuidv4();
  const user2Id = uuidv4();
  const sharedTxHash = `0xconcur${uuidv4().replace(/-/g, '')}${uuidv4().replace(/-/g, '')}`.slice(0, 66);
  const sharedLogIndex = 5;
  const treasury = BSC_CONFIG.TREASURY_WALLET_ADDRESS.toLowerCase();

  // Create users in DB
  await db.query(
    `INSERT INTO users (id, public_id, full_name, email, country, password_hash, status) VALUES ($1, $2, 'User One', $3, 'US', 'hash', 'ACTIVE') ON CONFLICT DO NOTHING`,
    [user1Id, `PHX-U1-${user1Id.slice(0, 4)}`, `user1.${user1Id.slice(0, 4)}@phivonex.test`]
  );
  await db.query(
    `INSERT INTO users (id, public_id, full_name, email, country, password_hash, status) VALUES ($1, $2, 'User Two', $3, 'US', 'hash', 'ACTIVE') ON CONFLICT DO NOTHING`,
    [user2Id, `PHX-U2-${user2Id.slice(0, 4)}`, `user2.${user2Id.slice(0, 4)}@phivonex.test`]
  );

  const attemptAtomicCredit = async (targetUserId: string) => {
    const clientDb = await getDb();
    return await clientDb.transaction(async (trx: DatabaseClient) => {
      const depositId = uuidv4();
      const pubId = generateDepositPublicId();
      const now = new Date();
      const ins = await trx.query(
        `
        INSERT INTO blockchain_deposits (
          id, public_deposit_id, user_id, chain_id, asset,
          tx_hash, log_index, from_address, to_address, amount, block_number,
          confirmations, status, detected_at, confirmed_at, credited_at, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, 'USDT', $5, $6, $7, $8, 500.0, 12345, 5, 'CREDITED', $9, $9, $9, $9, $9)
        ON CONFLICT (chain_id, tx_hash, log_index, to_address) DO NOTHING
        RETURNING id, user_id
        `,
        [depositId, pubId, targetUserId, BSC_CONFIG.CHAIN_ID, sharedTxHash, sharedLogIndex, '0xsender', treasury, now]
      );

      if (ins.rows.length === 0) {
        return { success: false, reason: 'DUPLICATE_CONFLICT' };
      }

      const insertedUserId = ins.rows[0].user_id;
      if (insertedUserId !== targetUserId) {
        return { success: false, reason: 'USER_MISMATCH' };
      }

      const ledgerId = uuidv4();
      const ledgerPubId = generateLedgerTransactionPublicId();
      const ledgerIns = await trx.query(
        `
        INSERT INTO financial_ledger_entries (
          id, public_txn_id, user_id, entry_type, source_type, source_id,
          source_ref, description, amount, currency, status, created_at
        )
        VALUES ($1, $2, $3, 'CREDIT', 'BLOCKCHAIN_DEPOSIT', $4, $5, $6, $7, 'USDT', 'SETTLED', $8)
        ON CONFLICT (source_type, source_id, entry_type) DO NOTHING
        RETURNING id, user_id
        `,
        [ledgerId, ledgerPubId, insertedUserId, depositId, pubId, `Atomic safety test ${sharedTxHash}`, 500.0, now]
      );

      if (ledgerIns.rows.length === 0 || ledgerIns.rows[0].user_id !== insertedUserId) {
        throw new Error('LEDGER_CONFLICT');
      }

      return { success: true, depositId };
    }).catch((err: any) => {
      return { success: false, reason: err.message || 'TRANSACTION_FAILED' };
    });
  };

  // Run real concurrency test using Promise.all([...]) simultaneously (do NOT run sequentially)
  const [res1, res2] = await Promise.all([
    attemptAtomicCredit(user1Id),
    attemptAtomicCredit(user2Id),
  ]);

  console.log('  -> Concurrent submission results:', { res1, res2 });

  const successCount = [res1, res2].filter((r) => r.success).length;
  const duplicateCount = [res1, res2].filter((r) => !r.success && (r.reason === 'DUPLICATE_CONFLICT' || r.reason === 'LEDGER_CONFLICT')).length;

  assert(successCount === 1, 'Exactly 1 user receives credit under concurrent Promise.all() submission');
  assert(duplicateCount === 1, 'The other concurrent submission is rejected');

  const depositCheck = await db.query(
    `SELECT COUNT(*) as cnt FROM blockchain_deposits WHERE chain_id = $1 AND LOWER(tx_hash) = $2 AND log_index = $3`,
    [BSC_CONFIG.CHAIN_ID, sharedTxHash, sharedLogIndex]
  );
  assert(Number(depositCheck.rows[0].cnt) === 1, 'Exactly 1 blockchain_deposits row exists in database');

  const ledgerCheck = await db.query(
    `SELECT COUNT(*) as cnt FROM financial_ledger_entries WHERE description = $1`,
    [`Atomic safety test ${sharedTxHash}`]
  );
  assert(Number(ledgerCheck.rows[0].cnt) === 1, 'Exactly 1 financial_ledger_entries credit exists in database');

  console.log('\n===============================================================');
  console.log(`📊 TASK 2 SAFETY PATCH TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('===============================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runSafetyPatchTests().catch((err) => {
  console.error('[Safety Patch Test Error]', err);
  process.exit(1);
});
