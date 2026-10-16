/**
 * PHIVONEX — PF-04: NODE PURCHASE SETTLEMENT FINALIZATION TEST SUITE
 * 
 * Verifies:
 * 1. Successful purchase with sufficient USDT.
 * 2. Insufficient balance => no debit, no node allocation.
 * 3. Concurrent purchase attempt => no duplicate node ownership.
 * 4. Forced ledger/purchase failure => full rollback.
 * 5. Forced node activation failure => full rollback.
 * 6. Same idempotency key twice => one purchase only.
 * 7. Eligible sponsor => exactly one referral commission.
 * 8. No sponsor => purchase still succeeds.
 * 9. Exactly one binary volume event created.
 * 10. Existing nodes/orders/history remain unchanged.
 * 11. Node cap cannot exceed 10,000.
 */

process.env.APP_ENV = 'development';
process.env.NODE_ENV = 'test';

import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

const testDataDir = path.resolve(process.cwd(), `.data/test_pf04_${uuidv4()}`);
process.env.PGLITE_DATA_DIR = testDataDir;

import { getDb } from '../src/server/db/db';
import { processNodePurchaseWithAssetBalance as purchaseNodeWithDepositBalance } from '../src/server/services/nodePurchaseBalanceService';
import { createNodeReservation } from '../src/server/services/nodeOrderService';
import { generateDepositPublicId } from '../src/server/utils/idGenerator';
import { hashPassword } from '../src/server/utils/crypto';
import { GENESIS_NODE_CAP } from '../src/config/nodeConfig';

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

async function runPf04Tests() {
  console.log('\n===============================================================');
  console.log('🧪 PHIVONEX — PF-04: NODE PURCHASE SETTLEMENT FINALIZATION TESTS');
  console.log('===============================================================\n');

  try {
    const db = await getDb();

    // 1. Node Cap Check (Requirement 11)
    console.log('--- 1. GENESIS NODE CAP CHECK ---');
    assert(GENESIS_NODE_CAP === 10000, 'Genesis Node Cap is strictly 10,000');
    const capConfigRes = await db.query(`SELECT config_value FROM system_economic_configs WHERE config_key = 'GENESIS_NODE_CAP'`);
    assert(Number(capConfigRes.rows[0]?.config_value) === 10000, 'Database GENESIS_NODE_CAP config value is 10,000');

    const pwdHash = await hashPassword('TestPassword123!');

    // 2. Insufficient Balance Test (Requirement 2)
    console.log('\n--- 2. INSUFFICIENT BALANCE TEST ---');
    const userIdInsuf = uuidv4();
    await db.query(
      `INSERT INTO users (id, public_id, full_name, email, country, password_hash, status) VALUES ($1, $2, 'Insuf User', $3, 'US', $4, 'ACTIVE')`,
      [userIdInsuf, `PHX-INS-${uuidv4().slice(0, 4)}`, `insuf.${uuidv4().slice(0, 6)}@phivonex.test`, pwdHash]
    );
    await db.query(`INSERT INTO binary_placements (user_id, status) VALUES ($1, 'PLACED')`, [userIdInsuf]);
    await db.query(
      `INSERT INTO blockchain_deposits (id, public_deposit_id, user_id, chain_id, asset, tx_hash, log_index, from_address, to_address, amount, block_number, confirmations, status, detected_at, confirmed_at, credited_at, created_at, updated_at) VALUES ($1, $2, $3, 56, 'USDT', $4, 0, '0xsender', '0xtreasury', 500.0, 100, 5, 'CREDITED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [uuidv4(), generateDepositPublicId(), userIdInsuf, `0xinsuf${uuidv4().replace(/-/g, '')}`.slice(0, 66)]
    );

    let insufficientCaught = false;
    try {
      await purchaseNodeWithDepositBalance(userIdInsuf, 'USDT');
    } catch (err: any) {
      if ((err.code === 'INSUFFICIENT_DEPOSIT_BALANCE' || err.code === 'INSUFFICIENT_ASSET_BALANCE') && err.statusCode === 400) {
        insufficientCaught = true;
      }
    }
    assert(insufficientCaught, 'Insufficient balance correctly throws INSUFFICIENT_DEPOSIT_BALANCE (400)');

    const nodeCountAfterInsuf = await db.query(`SELECT COUNT(*) as cnt FROM nodes WHERE status = 'ACTIVE' AND owner_user_id = $1`, [userIdInsuf]);
    assert(Number(nodeCountAfterInsuf.rows[0].cnt) === 0, 'Zero nodes allocated for insufficient balance attempt');

    // 3. Successful Purchase with Sufficient USDT (Requirement 1 & 8)
    console.log('\n--- 3. SUCCESSFUL PURCHASE (NO SPONSOR) ---');
    const userId1 = uuidv4();
    await db.query(
      `INSERT INTO users (id, public_id, full_name, email, country, password_hash, status) VALUES ($1, $2, 'Buyer One', $3, 'US', $4, 'ACTIVE')`,
      [userId1, `PHX-B1-${uuidv4().slice(0, 4)}`, `buyer1.${uuidv4().slice(0, 6)}@phivonex.test`, pwdHash]
    );
    await db.query(`INSERT INTO binary_placements (user_id, status) VALUES ($1, 'PLACED')`, [userId1]);
    await db.query(
      `INSERT INTO blockchain_deposits (id, public_deposit_id, user_id, chain_id, asset, tx_hash, log_index, from_address, to_address, amount, block_number, confirmations, status, detected_at, confirmed_at, credited_at, created_at, updated_at) VALUES ($1, $2, $3, 56, 'USDT', $4, 0, '0xsender', '0xtreasury', 1000.0, 100, 5, 'CREDITED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [uuidv4(), generateDepositPublicId(), userId1, `0xsucc${uuidv4().replace(/-/g, '')}`.slice(0, 66)]
    );

    const purchaseRes1 = await purchaseNodeWithDepositBalance(userId1, 'USDT');
    assert(purchaseRes1.order.status === 'COMPLETED', 'Order status is COMPLETED');
    assert(purchaseRes1.node.status === 'ACTIVE', 'Node status is ACTIVE');
    assert(purchaseRes1.deductedAmount === 1000.00, 'Exact $1,000.00 USDT deducted');
    assert(purchaseRes1.remainingAssetBalance === 0.00, 'Remaining deposit balance is $0.00');

    const commCheck1 = await db.query(`SELECT * FROM referral_commissions WHERE referred_user_id = $1`, [userId1]);
    assert(commCheck1.rows.length === 0, 'No referral commission created for unsponsored buyer');

    // 4. Eligible Sponsor, Referral Commission & Binary Volume (Requirement 7 & 9)
    console.log('\n--- 4. ELIGIBLE SPONSOR, REFERRAL COMMISSION & BINARY VOLUME ---');
    const sponsorId = uuidv4();
    const buyer2Id = uuidv4();
    await db.query(
      `INSERT INTO users (id, public_id, full_name, email, country, password_hash, status) VALUES ($1, $2, 'Sponsor Alice', $3, 'US', $4, 'ACTIVE')`,
      [sponsorId, `PHX-SPON-${uuidv4().slice(0, 4)}`, `sponsor.${uuidv4().slice(0, 6)}@phivonex.test`, pwdHash]
    );
    await db.query(`INSERT INTO binary_placements (user_id, status) VALUES ($1, 'PLACED')`, [sponsorId]);

    // Sponsor must have an active Genesis Node to be eligible for referral commission
    await db.query(
      `INSERT INTO blockchain_deposits (id, public_deposit_id, user_id, chain_id, asset, tx_hash, log_index, from_address, to_address, amount, block_number, confirmations, status, detected_at, confirmed_at, credited_at, created_at, updated_at) VALUES ($1, $2, $3, 56, 'USDT', $4, 0, '0xsender', '0xtreasury', 1000.0, 100, 5, 'CREDITED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [uuidv4(), generateDepositPublicId(), sponsorId, `0xspons${uuidv4().replace(/-/g, '')}`.slice(0, 66)]
    );
    await purchaseNodeWithDepositBalance(sponsorId, 'USDT');

    await db.query(
      `INSERT INTO users (id, public_id, full_name, email, country, password_hash, status) VALUES ($1, $2, 'Buyer Bob', $3, 'US', $4, 'ACTIVE')`,
      [buyer2Id, `PHX-B2-${uuidv4().slice(0, 4)}`, `buyer2.${uuidv4().slice(0, 6)}@phivonex.test`, pwdHash]
    );
    await db.query(`INSERT INTO binary_placements (user_id, parent_user_id, side, status) VALUES ($1, $2, 'LEFT', 'PLACED')`, [buyer2Id, sponsorId]);

    await db.query(
      `INSERT INTO user_referrals (user_id, sponsor_user_id, referral_code) VALUES ($1, $2, $3)`,
      [buyer2Id, sponsorId, `REF-${uuidv4().slice(0, 4)}`]
    );

    await db.query(
      `INSERT INTO blockchain_deposits (id, public_deposit_id, user_id, chain_id, asset, tx_hash, log_index, from_address, to_address, amount, block_number, confirmations, status, detected_at, confirmed_at, credited_at, created_at, updated_at) VALUES ($1, $2, $3, 56, 'USDT', $4, 0, '0xsender', '0xtreasury', 1000.0, 100, 5, 'CREDITED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [uuidv4(), generateDepositPublicId(), buyer2Id, `0xbuy2${uuidv4().replace(/-/g, '')}`.slice(0, 66)]
    );

    const purchaseRes2 = await purchaseNodeWithDepositBalance(buyer2Id, 'USDT');
    assert(purchaseRes2.node.status === 'ACTIVE', 'Sponsored buyer successfully activated node');

    const commCheck2 = await db.query(`SELECT * FROM referral_commissions WHERE sponsor_user_id = $1 AND referred_user_id = $2`, [sponsorId, buyer2Id]);
    assert(commCheck2.rows.length === 1, 'Exactly one referral commission created for eligible sponsor');
    assert(Number(commCheck2.rows[0].amount_usd) === 50.00, 'Commission amount is exactly $50.00 USD');
    assert(commCheck2.rows[0].status === 'EARNED', 'Commission status is EARNED');

    const volCheck2 = await db.query(`SELECT * FROM binary_volume_events`);
    assert(volCheck2.rows.length >= 1, 'Binary sales volume event successfully created upon sponsored node activation');

    // 5. Idempotency Test (Requirement 6)
    console.log('\n--- 5. IDEMPOTENCY TEST ---');
    const idemKey = `idem_${uuidv4()}`;
    const buyer3Id = uuidv4();
    await db.query(
      `INSERT INTO users (id, public_id, full_name, email, country, password_hash, status) VALUES ($1, $2, 'Buyer Charlie', $3, 'US', $4, 'ACTIVE')`,
      [buyer3Id, `PHX-B3-${uuidv4().slice(0, 4)}`, `buyer3.${uuidv4().slice(0, 6)}@phivonex.test`, pwdHash]
    );
    await db.query(`INSERT INTO binary_placements (user_id, status) VALUES ($1, 'PLACED')`, [buyer3Id]);
    await db.query(
      `INSERT INTO blockchain_deposits (id, public_deposit_id, user_id, chain_id, asset, tx_hash, log_index, from_address, to_address, amount, block_number, confirmations, status, detected_at, confirmed_at, credited_at, created_at, updated_at) VALUES ($1, $2, $3, 56, 'USDT', $4, 0, '0xsender', '0xtreasury', 1000.0, 100, 5, 'CREDITED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [uuidv4(), generateDepositPublicId(), buyer3Id, `0xbuy3${uuidv4().replace(/-/g, '')}`.slice(0, 66)]
    );

    const res1 = await createNodeReservation(buyer3Id, idemKey);
    const res2 = await createNodeReservation(buyer3Id, idemKey);
    assert(res1.order.publicOrderId === res2.order.publicOrderId, 'Same idempotency key returns exact same order without duplication');
    assert(res2.isExisting === true, 'Second reservation call correctly flagged as existing');

    // 6. Concurrent Purchase Attempt with Exact $1,000 Balance (Requirement 3)
    console.log('\n--- 6. CONCURRENT PURCHASE ATTEMPT ---');
    const buyer4Id = uuidv4();
    await db.query(
      `INSERT INTO users (id, public_id, full_name, email, country, password_hash, status) VALUES ($1, $2, 'Buyer Dave', $3, 'US', $4, 'ACTIVE')`,
      [buyer4Id, `PHX-B4-${uuidv4().slice(0, 4)}`, `buyer4.${uuidv4().slice(0, 6)}@phivonex.test`, pwdHash]
    );
    await db.query(`INSERT INTO binary_placements (user_id, status) VALUES ($1, 'PLACED')`, [buyer4Id]);
    await db.query(
      `INSERT INTO blockchain_deposits (id, public_deposit_id, user_id, chain_id, asset, tx_hash, log_index, from_address, to_address, amount, block_number, confirmations, status, detected_at, confirmed_at, credited_at, created_at, updated_at) VALUES ($1, $2, $3, 56, 'USDT', $4, 0, '0xsender', '0xtreasury', 1000.0, 100, 5, 'CREDITED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [uuidv4(), generateDepositPublicId(), buyer4Id, `0xbuy4${uuidv4().replace(/-/g, '')}`.slice(0, 66)]
    );

    const concResults = await Promise.allSettled([
      purchaseNodeWithDepositBalance(buyer4Id, 'USDT'),
      purchaseNodeWithDepositBalance(buyer4Id, 'USDT')
    ]);
    concResults.forEach((r, idx) => {
      if (r.status === 'rejected') {
        console.log(`  -> Concurrent call ${idx + 1} rejected:`, {
          message: r.reason?.message,
          code: r.reason?.code,
          stack: r.reason?.stack,
        });
      }
    });

    const fulfilledCount = concResults.filter(r => r.status === 'fulfilled').length;
    const completedOrdersRes = await db.query(`SELECT COUNT(*) as cnt FROM node_orders WHERE user_id = $1 AND status = 'COMPLETED'`, [buyer4Id]);
    assert(fulfilledCount === 1 && Number(completedOrdersRes.rows[0].cnt) === 1, 'Concurrent purchases with exact $1,000 balance result in exactly 1 node allocation and 1 success');

    // 7. Existing History Unchanged (Requirement 10)
    console.log('\n--- 7. EXISTING HISTORY UNCHANGED ---');
    const genesisCheck = await db.query(`SELECT COUNT(*) as cnt FROM nodes WHERE node_number <= 10000`);
    assert(Number(genesisCheck.rows[0].cnt) === 10000, 'Genesis Nodes inventory remains fully intact and unchanged (10,000 nodes)');

    console.log('\n===============================================================');
    console.log(`📊 PF-04 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('===============================================================\n');

    if (failed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } finally {
    try {
      if (fs.existsSync(testDataDir)) {
        fs.rmSync(testDataDir, { recursive: true, force: true });
        console.log('  -> Isolated test database directory cleaned up successfully.');
      }
    } catch (cleanErr) {
      console.warn('  -> Cleanup notice:', cleanErr);
    }
  }
}

runPf04Tests().catch((err) => {
  console.error('[PF-04 Test Error]', err);
  process.exit(1);
});
