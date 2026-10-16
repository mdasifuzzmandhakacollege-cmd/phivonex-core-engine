/**
 * PHIVONEX Task #8: Direct Referral Commission Test Suite
 * Validates:
 * 1. Database schema & constraints for referral_commissions ($50 USD CHECK, UNIQUE(node_id))
 * 2. Reservation alone creates NO commission
 * 3. Pending/Cancelled/Expired orders create NO commission
 * 4. Buyer with valid sponsor completes Node activation -> Sponsor receives exactly $50 USD
 * 5. Buyer with NO sponsor completes Node activation -> Activation succeeds normally, NO commission created
 * 6. Duplicate settlement / webhook call is idempotent -> NO duplicate commission created
 * 7. Second distinct Node activation generates another $50 USD ($100 cumulative)
 * 8. Reversal foundation: EARNED -> REVERSED status transition without record deletion
 * 9. GET /api/referrals/direct privacy protection (omits email, phone, internal uuid)
 * 10. GET /api/referral-commissions/me isolation & authoritative total calculation
 */

import { getDb } from '../src/server/db/db';
import { v4 as uuidv4 } from 'uuid';
import {
  createNodeReservation,
  settleNodeOrder,
  cancelNodeOrder
} from '../src/server/services/nodeOrderService';
import {
  processNodeActivationCommission,
  reverseReferralCommission,
  getUserDirectReferrals,
  getUserCommissions
} from '../src/server/services/referralCommissionService';
import { DIRECT_REFERRAL_COMMISSION_USD } from '../src/config/referralConfig';

async function runTask8Tests() {
  console.log('====================================================');
  console.log('PHIVONEX TASK #8: DIRECT REFERRAL COMMISSION TESTS');
  console.log('====================================================\n');

  const db = await getDb();
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, desc: string) {
    if (condition) {
      console.log(`  [PASS] ${desc}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${desc}`);
      failed++;
    }
  }

  const runId = Date.now();

  // 1. Setup Sponsor User (User A)
  const sponsorId = uuidv4();
  const sponsorPublicId = `PHX-SPON${Math.floor(1000 + Math.random() * 9000)}`;
  const sponsorEmail = `sponsor_${runId}@phivonex.test`;
  const sponsorRefCode = `SPON${Math.floor(10000 + Math.random() * 90000)}`;

  const sponsorPhone = `+1202${Math.floor(1000000 + Math.random() * 9000000)}`;

  await db.query(
    `
    INSERT INTO users (id, public_id, email, phone, country, password_hash, full_name, status, created_at, updated_at)
    VALUES ($1, $2, $3, $4, 'United States', 'hash_test_placeholder', 'Sponsor Operator Alice', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `,
    [sponsorId, sponsorPublicId, sponsorEmail, sponsorPhone]
  );

  await db.query(
    `
    INSERT INTO user_referrals (user_id, referral_code, sponsor_user_id, created_at)
    VALUES ($1, $2, NULL, CURRENT_TIMESTAMP)
    `,
    [sponsorId, sponsorRefCode]
  );

  // 2. Setup Buyer 1 (User B, sponsored by Alice)
  const buyer1Id = uuidv4();
  const buyer1PublicId = `PHX-BUY1${Math.floor(1000 + Math.random() * 9000)}`;
  const buyer1Email = `buyer1_${runId}@phivonex.test`;
  const buyer1RefCode = `BUY1${Math.floor(10000 + Math.random() * 90000)}`;
  const buyer1Phone = `+1202${Math.floor(1000000 + Math.random() * 9000000)}`;

  await db.query(
    `
    INSERT INTO users (id, public_id, email, phone, country, password_hash, full_name, status, created_at, updated_at)
    VALUES ($1, $2, $3, $4, 'United States', 'hash_test_placeholder', 'Buyer Operator Bob', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `,
    [buyer1Id, buyer1PublicId, buyer1Email, buyer1Phone]
  );

  await db.query(
    `
    INSERT INTO user_referrals (user_id, referral_code, sponsor_user_id, created_at)
    VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
    `,
    [buyer1Id, buyer1RefCode, sponsorId]
  );

  // 3. Setup Buyer 2 (User C, NO sponsor)
  const buyer2Id = uuidv4();
  const buyer2PublicId = `PHX-BUY2${Math.floor(1000 + Math.random() * 9000)}`;
  const buyer2Email = `buyer2_${runId}@phivonex.test`;
  const buyer2RefCode = `BUY2${Math.floor(10000 + Math.random() * 90000)}`;

  await db.query(
    `
    INSERT INTO users (id, public_id, email, country, password_hash, full_name, status, created_at, updated_at)
    VALUES ($1, $2, $3, 'Canada', 'hash_test_placeholder', 'Organic Operator Charlie', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `,
    [buyer2Id, buyer2PublicId, buyer2Email]
  );

  await db.query(
    `
    INSERT INTO user_referrals (user_id, referral_code, sponsor_user_id, created_at)
    VALUES ($1, $2, NULL, CURRENT_TIMESTAMP)
    `,
    [buyer2Id, buyer2RefCode]
  );

  console.log(`[Setup] Created test users:`);
  console.log(`  - Sponsor (Alice): ${sponsorPublicId} (${sponsorId})`);
  console.log(`  - Buyer 1 (Bob, sponsored by Alice): ${buyer1PublicId} (${buyer1Id})`);
  console.log(`  - Buyer 2 (Charlie, no sponsor): ${buyer2PublicId} (${buyer2Id})\n`);

  // =========================================================================
  // TEST 1: Schema & Constraints
  // =========================================================================
  console.log('--- TEST 1: referral_commissions Schema & DB Constraints ---');
  const tableCheck = await db.query<{ count: string }>(
    `SELECT count(*) FROM information_schema.tables WHERE table_name = 'referral_commissions'`
  );
  assert(parseInt(tableCheck.rows[0].count, 10) === 1, 'referral_commissions table exists in database');

  assert(DIRECT_REFERRAL_COMMISSION_USD === 50, 'Authoritative configuration DIRECT_REFERRAL_COMMISSION_USD is exactly 50');

  // Test amount constraint ($50 USD CHECK)
  let rejectedInvalidAmount = false;
  try {
    await db.query(
      `
      INSERT INTO referral_commissions (
        id, public_commission_id, sponsor_user_id, referred_user_id,
        node_id, node_order_id, amount_usd, status, earned_at, created_at
      ) VALUES ($1, 'PHX-COM-BADAMT', $2, $3, (SELECT id FROM nodes LIMIT 1), (SELECT id FROM node_orders LIMIT 1), 75.00, 'EARNED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `,
      [uuidv4(), sponsorId, buyer1Id]
    );
  } catch (err) {
    rejectedInvalidAmount = true;
  }
  assert(rejectedInvalidAmount, 'CHECK constraint rejects non-$50 USD commission amount');

  // =========================================================================
  // TEST 2: Reservation Alone Creates NO Commission
  // =========================================================================
  console.log('\n--- TEST 2: Reservation Alone Creates NO Commission ---');
  const resKey1 = `idemp_t8_res1_${runId}`;
  const reserve1 = await createNodeReservation(buyer1Id, resKey1);
  const order1 = reserve1.order;

  assert(order1.status === 'PENDING', 'Order is PENDING in reservation state');

  const comCheck1 = await db.query<{ count: string }>(
    `SELECT count(*) FROM referral_commissions WHERE referred_user_id = $1`,
    [buyer1Id]
  );
  assert(parseInt(comCheck1.rows[0].count, 10) === 0, 'Zero commissions exist after reservation creation');

  // =========================================================================
  // TEST 3: Cancelled Order Creates NO Commission
  // =========================================================================
  console.log('\n--- TEST 3: Cancelled Order Creates NO Commission ---');
  await cancelNodeOrder(buyer1Id, order1.publicOrderId);

  const comCheckCancel = await db.query<{ count: string }>(
    `SELECT count(*) FROM referral_commissions WHERE referred_user_id = $1`,
    [buyer1Id]
  );
  assert(parseInt(comCheckCancel.rows[0].count, 10) === 0, 'Zero commissions created after order cancellation');

  // =========================================================================
  // TEST 4: Verified Payment Settlement Creates $50 Commission for Sponsor
  // =========================================================================
  console.log('\n--- TEST 4: Verified Settlement Generates $50 Commission ---');
  const resKey2 = `idemp_t8_res2_${runId}`;
  const reserve2 = await createNodeReservation(buyer1Id, resKey2);
  const order2 = reserve2.order;

  const preSponsorCommissions = await getUserCommissions(sponsorId);
  const preEarnedTotal = preSponsorCommissions.totalEarnedUsd;

  // Settle via verified backend flow
  const settleResult = await settleNodeOrder(null, order2.publicOrderId, `WEBHOOK_TXN_T8_1_${runId}`);
  assert(settleResult.order.status === 'COMPLETED', 'Order 2 completed successfully');
  assert(settleResult.node.status === 'ACTIVE', 'Node 2 activated successfully');
  assert(settleResult.referralCommission !== null, 'Commission object returned on settlement');
  assert(settleResult.referralCommission?.amountUsd === 50, 'Commission amount is exactly $50.00 USD');
  assert(settleResult.referralCommission?.status === 'EARNED', 'Commission status is EARNED');
  assert(settleResult.referralCommission?.referredUserPublicId === buyer1PublicId, 'Referred user public ID matches buyer 1');

  const postSponsorCommissions = await getUserCommissions(sponsorId);
  assert(
    postSponsorCommissions.totalEarnedUsd === preEarnedTotal + 50,
    `Sponsor total earned updated by +$50.00 (Previous: $${preEarnedTotal}, Current: $${postSponsorCommissions.totalEarnedUsd})`
  );
  assert(postSponsorCommissions.commissions.length === 1, 'Sponsor has 1 commission record in history');

  // Verify DB record directly
  const dbComm = await db.query<{
    public_commission_id: string;
    sponsor_user_id: string;
    referred_user_id: string;
    amount_usd: string;
    status: string;
  }>(
    `SELECT * FROM referral_commissions WHERE sponsor_user_id = $1`,
    [sponsorId]
  );
  assert(dbComm.rows.length === 1, 'Exactly one commission record in database for sponsor');
  assert(parseFloat(dbComm.rows[0].amount_usd) === 50.00, 'Database record amount_usd is 50.00');
  assert(dbComm.rows[0].status === 'EARNED', 'Database record status is EARNED');

  // =========================================================================
  // TEST 5: Duplicate Payment Settlement is Idempotent (No Extra Commission)
  // =========================================================================
  console.log('\n--- TEST 5: Duplicate Settlement Idempotency ---');
  const duplicateSettle = await settleNodeOrder(null, order2.publicOrderId, `WEBHOOK_TXN_T8_1_DUP_${runId}`);
  assert(duplicateSettle.isDuplicate === true, 'Duplicate settlement flagged isDuplicate: true');

  const postDupCommissions = await getUserCommissions(sponsorId);
  assert(
    postDupCommissions.totalEarnedUsd === preEarnedTotal + 50,
    'Duplicate settlement did NOT increase sponsor total commission'
  );
  assert(postDupCommissions.commissions.length === 1, 'Duplicate settlement did NOT add duplicate commission records');

  // Verify UNIQUE(node_id) constraint in database
  let duplicateNodeInsertRejected = false;
  try {
    await db.query(
      `
      INSERT INTO referral_commissions (
        id, public_commission_id, sponsor_user_id, referred_user_id,
        node_id, node_order_id, amount_usd, status, earned_at, created_at
      ) VALUES (
        $1, 'PHX-COM-DUPNODE', $2, $3,
        (SELECT node_id FROM node_orders WHERE public_order_id = $4),
        (SELECT id FROM node_orders WHERE public_order_id = $4),
        50.00, 'EARNED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      `,
      [uuidv4(), sponsorId, buyer1Id, order2.publicOrderId]
    );
  } catch (err) {
    duplicateNodeInsertRejected = true;
  }
  assert(duplicateNodeInsertRejected, 'UNIQUE(node_id) constraint strictly prevents duplicate commission on same Node');

  // =========================================================================
  // TEST 6: Buyer with NO Sponsor -> Activation Succeeds, NO Commission Created
  // =========================================================================
  console.log('\n--- TEST 6: Buyer with NO Sponsor (Organic) ---');
  const resKey3 = `idemp_t8_res3_${runId}`;
  const reserve3 = await createNodeReservation(buyer2Id, resKey3);
  const order3 = reserve3.order;

  const settleNoSponsor = await settleNodeOrder(null, order3.publicOrderId, `WEBHOOK_TXN_T8_NO_SPON_${runId}`);
  assert(settleNoSponsor.order.status === 'COMPLETED', 'No-sponsor node purchase completed successfully');
  assert(settleNoSponsor.node.status === 'ACTIVE', 'No-sponsor node activated successfully');
  assert(settleNoSponsor.referralCommission === null, 'No referral commission created for unsponsored buyer');

  // =========================================================================
  // TEST 7: Second Distinct Node Purchase -> Additional $50 Commission ($100 Total)
  // =========================================================================
  console.log('\n--- TEST 7: Second Node Purchase by Same Buyer ---');
  const resKey4 = `idemp_t8_res4_${runId}`;
  const reserve4 = await createNodeReservation(buyer1Id, resKey4);
  const order4 = reserve4.order;

  const settleSecondNode = await settleNodeOrder(null, order4.publicOrderId, `WEBHOOK_TXN_T8_2_${runId}`);
  assert(settleSecondNode.order.status === 'COMPLETED', 'Second node purchase completed successfully');
  assert(settleSecondNode.node.status === 'ACTIVE', 'Second node activated successfully');
  assert(settleSecondNode.referralCommission !== null, 'Commission created for second activated node');
  assert(settleSecondNode.referralCommission?.amountUsd === 50, 'Second commission is $50.00 USD');

  const postSecondCommissions = await getUserCommissions(sponsorId);
  assert(
    postSecondCommissions.totalEarnedUsd === preEarnedTotal + 100,
    `2 Node activations equal exactly $100.00 USD total earned (Actual: $${postSecondCommissions.totalEarnedUsd})`
  );
  assert(postSecondCommissions.commissions.length === 2, 'Sponsor now has exactly 2 separate auditable commission records');

  // =========================================================================
  // TEST 8: Reversal Foundation (EARNED -> REVERSED Audit Trail)
  // =========================================================================
  console.log('\n--- TEST 8: Reversal Foundation ---');
  const commToReverse = postSecondCommissions.commissions[0];
  const reversedComm = await reverseReferralCommission(commToReverse.publicCommissionId, 'Chargeback simulation test');

  assert(reversedComm.status === 'REVERSED', 'Commission status transitioned to REVERSED');
  assert(reversedComm.reversedAt !== null, 'reversed_at timestamp recorded');

  const afterReversalCommissions = await getUserCommissions(sponsorId);
  assert(
    afterReversalCommissions.totalEarnedUsd === 50,
    'totalEarnedUsd excludes REVERSED commission records ($100 -> $50)'
  );
  assert(
    afterReversalCommissions.commissions.length === 2,
    'Original commission record preserved in database for audit trail'
  );
  assert(
    afterReversalCommissions.commissions.some((c) => c.status === 'REVERSED'),
    'REVERSED record visible in commission history'
  );

  // =========================================================================
  // TEST 9: Direct Referrals API Privacy Protection
  // =========================================================================
  console.log('\n--- TEST 9: Direct Referrals Privacy Protection ---');
  const directList = await getUserDirectReferrals(sponsorId);
  assert(directList.length === 1, 'Sponsor has 1 direct referral (Bob)');

  const referralItem = directList[0];
  assert(referralItem.publicId === buyer1PublicId, 'Exposes publicId (PHX-BUY1...)');
  assert(referralItem.displayName === 'Buyer B.', 'Exposes privacy-safe formatted displayName (Buyer B.)');
  assert(Boolean(referralItem.joinedAt), 'Exposes joinedAt timestamp');
  assert(!('email' in referralItem), 'STRICT: Does NOT expose email');
  assert(!('phone' in referralItem), 'STRICT: Does NOT expose phone');
  assert(!('password_hash' in referralItem), 'STRICT: Does NOT expose password hash');
  assert(!('id' in referralItem), 'STRICT: Does NOT expose internal database UUID');

  // =========================================================================
  // TEST 10: User Commission Isolation
  // =========================================================================
  console.log('\n--- TEST 10: User Commission Isolation ---');
  const buyer1Commissions = await getUserCommissions(buyer1Id);
  assert(buyer1Commissions.totalEarnedUsd === 0, 'Buyer 1 has $0 earned (did not sponsor anyone)');
  assert(buyer1Commissions.commissions.length === 0, 'Buyer 1 sees 0 commission records');

  const buyer2Commissions = await getUserCommissions(buyer2Id);
  assert(buyer2Commissions.totalEarnedUsd === 0, 'Buyer 2 has $0 earned');
  assert(buyer2Commissions.commissions.length === 0, 'Buyer 2 sees 0 commission records');

  console.log('\n====================================================');
  console.log(`TASK #8 TEST SUMMARY: ${passed} PASSED | ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTask8Tests().catch((err) => {
  console.error('[Test Error]', err);
  process.exit(1);
});
