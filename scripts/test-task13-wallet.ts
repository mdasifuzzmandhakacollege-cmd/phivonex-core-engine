import { getDb } from '../src/server/db/db';
import { v4 as uuidv4 } from 'uuid';
import {
  postLedgerCredit,
  postLedgerReversal,
  getWalletSummary,
  getWalletTransactions,
  syncUserLedger,
} from '../src/server/services/walletLedgerService';
import { processNodeActivationCommission, reverseReferralCommission } from '../src/server/services/referralCommissionService';
import { settleUserMatchingForDate, reverseMatchingSettlement } from '../src/server/services/binaryMatchingService';
import { evaluateUserPromotions, reversePromotionBonus } from '../src/server/services/promotionBonusService';

async function runTask13WalletTests() {
  console.log('==================================================');
  console.log('🧪 RUNNING TASK #13: WALLET + FINANCIAL LEDGER TESTS');
  console.log('==================================================\n');

  const db = await getDb();
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName}${detail ? ` - ${detail}` : ''}`);
      failed++;
    }
  }

  // Helper to create test user
  async function createTestUser(tag: string, sponsorUserId?: string): Promise<{ id: string; publicId: string }> {
    const id = uuidv4();
    const cleanTag = tag.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toUpperCase();
    const publicId = `PX-${cleanTag}-${Date.now().toString().slice(-4)}${Math.floor(100 + Math.random() * 900)}`;
    const email = `u_${cleanTag}_${Date.now()}_${Math.floor(Math.random() * 100000)}@phivonex.test`;
    await db.query(
      `INSERT INTO users (id, public_id, full_name, email, country, password_hash, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'United States', 'hash_test', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [id, publicId, `Test ${cleanTag}`, email]
    );
    await db.query(
      `INSERT INTO user_referrals (user_id, referral_code, sponsor_user_id, created_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)`,
      [id, `REF${uuidv4().replace(/-/g, '').slice(0, 8).toUpperCase()}`, sponsorUserId || null]
    );
    await db.query(
      `INSERT INTO binary_placements (user_id, status, created_at)
       VALUES ($1, 'UNPLACED', CURRENT_TIMESTAMP)`,
      [id]
    );
    await db.query(
      `INSERT INTO binary_volume_balances (user_id, carry_left_units, carry_right_units, updated_at)
       VALUES ($1, 0, 0, CURRENT_TIMESTAMP)`,
      [id]
    );
    return { id, publicId };
  }

  // Helper to get or allocate node
  async function allocateNode(userId: string): Promise<{ nodeId: string; nodeNumber: number }> {
    const nodeRes = await db.query<{ id: string; node_number: number }>(
      `SELECT id, node_number FROM nodes WHERE status = 'AVAILABLE' ORDER BY node_number ASC LIMIT 1`
    );
    let nodeId: string;
    let nodeNumber: number;
    if (nodeRes.rows.length > 0) {
      nodeId = nodeRes.rows[0].id;
      nodeNumber = nodeRes.rows[0].node_number;
      await db.query(
        `UPDATE nodes SET status = 'ACTIVE', owner_user_id = $1, activated_at = CURRENT_TIMESTAMP WHERE id = $2`,
        [userId, nodeId]
      );
    } else {
      nodeId = uuidv4();
      nodeNumber = Math.floor(1000 + Math.random() * 8000);
      await db.query(
        `INSERT INTO nodes (id, public_node_id, node_number, status, owner_user_id, activated_at, created_at)
         VALUES ($1, $2, $3, 'ACTIVE', $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [nodeId, `GN-${nodeNumber}`, nodeNumber, userId]
      );
    }
    return { nodeId, nodeNumber };
  }

  // Helper to add binary volume events
  async function addBinaryVolume(beneficiaryId: string, side: 'LEFT' | 'RIGHT', count: number) {
    const dateStr = '2026-09-24';
    for (let i = 0; i < count; i++) {
      const dummySrc = await createTestUser(`s${side[0]}${i}`);
      const { nodeId: dummyNodeId } = await allocateNode(dummySrc.id);
      await db.query(
        `INSERT INTO binary_volume_events (id, public_event_id, beneficiary_user_id, source_user_id, source_node_id, side, volume_units, status, business_date, occurred_at, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, 1, 'ACTIVE', $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [uuidv4(), `BVE-${Math.floor(100000 + Math.random() * 900000)}`, beneficiaryId, dummySrc.id, dummyNodeId, side, dateStr]
      );
    }
  }

  try {
    // ----------------------------------------------------
    // TEST 1: $50 Referral posts to ledger once
    // ----------------------------------------------------
    console.log('--- TEST 1: Referral Commission Posting & Idempotency ---');
    const sponsorA = await createTestUser('SponsorA');
    const buyerA = await createTestUser('BuyerA', sponsorA.id);
    const { nodeId: nodeA, nodeNumber: nodeNumA } = await allocateNode(buyerA.id);

    const orderIdA = uuidv4();
    await db.query(
      `INSERT INTO node_orders (id, public_order_id, user_id, node_id, node_number, amount_usd, status, expires_at, completed_at, created_at)
       VALUES ($1, $2, $3, $4, $5, 1000.00, 'COMPLETED', CURRENT_TIMESTAMP + INTERVAL '1 hour', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [orderIdA, `ORD-${Date.now()}`, buyerA.id, nodeA, nodeNumA]
    );

    const commA = await processNodeActivationCommission(db, orderIdA, nodeA, buyerA.id);
    assert(commA !== null, 'Commission created successfully');

    const summaryA1 = await getWalletSummary(sponsorA.id);
    assert(summaryA1.totalEarned === 50, 'Referral creates $50 totalEarned in wallet', `Got: ${summaryA1.totalEarned}`);
    assert(summaryA1.ledgerBalance === 50, 'Ledger balance is $50', `Got: ${summaryA1.ledgerBalance}`);
    assert(summaryA1.breakdown.referral === 50, 'Referral breakdown is $50', `Got: ${summaryA1.breakdown.referral}`);
    assert(summaryA1.transactionCount === 1, 'Transaction count is exactly 1', `Got: ${summaryA1.transactionCount}`);

    // Re-run sync to ensure duplicate processing creates NO duplicate credit
    await syncUserLedger(sponsorA.id);
    const summaryA2 = await getWalletSummary(sponsorA.id);
    assert(summaryA2.totalEarned === 50, 'Duplicate sync creates NO duplicate credit', `Got: ${summaryA2.totalEarned}`);
    assert(summaryA2.transactionCount === 1, 'Transaction count remains 1 after re-sync', `Got: ${summaryA2.transactionCount}`);

    // ----------------------------------------------------
    // TEST 2: Matching Bonus posts to ledger once
    // ----------------------------------------------------
    console.log('\n--- TEST 2: Matching Bonus Posting & Idempotency ---');
    const userM = await createTestUser('UserM');
    // Credit 20 left and 20 right volume
    const testDate = '2026-09-24';
    await addBinaryVolume(userM.id, 'LEFT', 20);
    await addBinaryVolume(userM.id, 'RIGHT', 20);

    const settlementM = await settleUserMatchingForDate(db, userM.id, testDate);
    assert(settlementM.totalBonusUsd > 0, `Settlement generated bonus: $${settlementM.totalBonusUsd}`);

    const summaryM1 = await getWalletSummary(userM.id);
    assert(summaryM1.totalEarned === settlementM.totalBonusUsd, 'Matching bonus posts to wallet totalEarned', `Got: ${summaryM1.totalEarned}, expected: ${settlementM.totalBonusUsd}`);
    assert(summaryM1.ledgerBalance === settlementM.totalBonusUsd, 'Matching bonus reflects in ledgerBalance', `Got: ${summaryM1.ledgerBalance}`);
    assert(summaryM1.breakdown.matching === settlementM.totalBonusUsd, 'Matching breakdown is correct', `Got: ${summaryM1.breakdown.matching}`);

    // Re-run syncUserLedger
    await syncUserLedger(userM.id);
    const summaryM2 = await getWalletSummary(userM.id);
    assert(summaryM2.totalEarned === settlementM.totalBonusUsd, 'Duplicate matching settlement processing creates NO duplicate credit', `Got: ${summaryM2.totalEarned}`);
    assert(summaryM2.transactionCount === 1, 'Matching transaction count remains 1', `Got: ${summaryM2.transactionCount}`);

    // ----------------------------------------------------
    // TEST 3: Promotion Bonus posts to ledger once
    // ----------------------------------------------------
    console.log('\n--- TEST 3: Promotion Bonus Posting & Idempotency ---');
    const userP = await createTestUser('UserP');
    // Add 20 left and 20 right units via binary volume events
    await addBinaryVolume(userP.id, 'LEFT', 20);
    await addBinaryVolume(userP.id, 'RIGHT', 20);

    const promoRes = await evaluateUserPromotions(userP.id);
    assert(promoRes.totalPromotionBonusEarned === 5000, '20/20 milestone earns $5,000 promotion bonus', `Got: ${promoRes.totalPromotionBonusEarned}`);

    const summaryP1 = await getWalletSummary(userP.id);
    assert(summaryP1.totalEarned === 5000, 'Promotion bonus posts to totalEarned ($5000)', `Got: ${summaryP1.totalEarned}`);
    assert(summaryP1.ledgerBalance === 5000, 'Promotion bonus reflects in ledgerBalance ($5000)', `Got: ${summaryP1.ledgerBalance}`);
    assert(summaryP1.breakdown.promotion === 5000, 'Promotion breakdown is $5000', `Got: ${summaryP1.breakdown.promotion}`);

    // Re-evaluate promotions and re-sync
    await evaluateUserPromotions(userP.id);
    await syncUserLedger(userP.id);
    const summaryP2 = await getWalletSummary(userP.id);
    assert(summaryP2.totalEarned === 5000, 'Duplicate promotion processing creates NO duplicate credit', `Got: ${summaryP2.totalEarned}`);
    assert(summaryP2.transactionCount === 1, 'Promotion transaction count remains 1', `Got: ${summaryP2.transactionCount}`);

    // ----------------------------------------------------
    // TEST 4: Reversals correctly offset original earnings
    // ----------------------------------------------------
    console.log('\n--- TEST 4: Reversal Offset & Idempotency ---');
    // Reversing sponsorA's referral commission
    const revComm = await reverseReferralCommission(commA!.publicCommissionId, 'Chargeback test');
    assert(revComm.status === 'REVERSED', 'Referral commission reversed successfully');

    const summaryRevA = await getWalletSummary(sponsorA.id);
    assert(summaryRevA.totalEarned === 50, 'Total earned preserves historical gross ($50)', `Got: ${summaryRevA.totalEarned}`);
    assert(summaryRevA.totalReversed === 50, 'Total reversed is $50', `Got: ${summaryRevA.totalReversed}`);
    assert(summaryRevA.ledgerBalance === 0, 'Ledger balance correctly offsets to $0', `Got: ${summaryRevA.ledgerBalance}`);
    assert(summaryRevA.breakdown.referral === 0, 'Net referral breakdown correctly reflects $0', `Got: ${summaryRevA.breakdown.referral}`);
    assert(summaryRevA.transactionCount === 2, 'Transaction count has both CREDIT and REVERSAL (2 entries)', `Got: ${summaryRevA.transactionCount}`);

    // Duplicate reversal attempt on same commission:
    const txA = await getWalletTransactions(sponsorA.id);
    const reversalEntries = txA.transactions.filter((t) => t.entryType === 'REVERSAL');
    assert(reversalEntries.length === 1, 'Exactly one REVERSAL entry exists in ledger for source', `Got: ${reversalEntries.length}`);

    // Reversing matching settlement
    const revMatching = await reverseMatchingSettlement(settlementM.id);
    assert(revMatching === true, 'Matching settlement reversed');
    const summaryRevM = await getWalletSummary(userM.id);
    assert(summaryRevM.totalReversed === settlementM.totalBonusUsd, `Matching reversal offsets bonus ($${settlementM.totalBonusUsd})`, `Got: ${summaryRevM.totalReversed}`);
    assert(summaryRevM.ledgerBalance === 0, 'Matching ledger balance correctly offsets to $0', `Got: ${summaryRevM.ledgerBalance}`);

    // Reversing promotion bonus
    const promoRecordId = promoRes.achievedMilestones[0].id;
    const revPromo = await reversePromotionBonus(promoRecordId);
    assert(revPromo === true, 'Promotion bonus reversed');
    const summaryRevP = await getWalletSummary(userP.id);
    assert(summaryRevP.totalReversed === 5000, 'Promotion reversal offsets bonus ($5000)', `Got: ${summaryRevP.totalReversed}`);
    assert(summaryRevP.ledgerBalance === 0, 'Promotion ledger balance correctly offsets to $0', `Got: ${summaryRevP.ledgerBalance}`);

    // ----------------------------------------------------
    // TEST 5: User Isolation (User sees ONLY own ledger)
    // ----------------------------------------------------
    console.log('\n--- TEST 5: User Isolation & Privacy ---');
    const userIsolated = await createTestUser('Isolated');
    const summaryIso = await getWalletSummary(userIsolated.id);
    assert(summaryIso.totalEarned === 0, 'New user has $0 totalEarned', `Got: ${summaryIso.totalEarned}`);
    assert(summaryIso.ledgerBalance === 0, 'New user has $0 ledgerBalance', `Got: ${summaryIso.ledgerBalance}`);
    assert(summaryIso.transactionCount === 0, 'New user has 0 ledger entries', `Got: ${summaryIso.transactionCount}`);

    const txIso = await getWalletTransactions(userIsolated.id);
    assert(txIso.transactions.length === 0, 'New user sees 0 transactions', `Got: ${txIso.transactions.length}`);

    // Verify userP cannot see sponsorA or userM transactions
    const txP = await getWalletTransactions(userP.id);
    const alienTx = txP.transactions.filter((t) => t.userId !== userP.id);
    assert(alienTx.length === 0, 'User P sees strictly their own transactions', `Alien transactions count: ${alienTx.length}`);

    // ----------------------------------------------------
    // TEST 6: Multi-source aggregation & Totals Integrity
    // ----------------------------------------------------
    console.log('\n--- TEST 6: Multi-Source Aggregation & Mathematical Integrity ---');
    const multiUser = await createTestUser('MultiUser');
    const multiBuyer = await createTestUser('MultiBuyer', multiUser.id);
    const { nodeId: multiNode, nodeNumber: multiNodeNum } = await allocateNode(multiBuyer.id);

    // 1. Referral commission ($50)
    const orderMulti = uuidv4();
    await db.query(
      `INSERT INTO node_orders (id, public_order_id, user_id, node_id, node_number, amount_usd, status, expires_at, completed_at, created_at)
       VALUES ($1, $2, $3, $4, $5, 1000.00, 'COMPLETED', CURRENT_TIMESTAMP + INTERVAL '1 hour', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [orderMulti, `ORD-MULTI-${Date.now()}`, multiBuyer.id, multiNode, multiNodeNum]
    );
    await processNodeActivationCommission(db, orderMulti, multiNode, multiBuyer.id);

    // 2. Matching bonus (2 units left and 2 units right = $300)
    await addBinaryVolume(multiUser.id, 'LEFT', 2);
    await addBinaryVolume(multiUser.id, 'RIGHT', 2);
    const mSettlement = await settleUserMatchingForDate(db, multiUser.id, '2026-09-24');

    // 3. Promotion bonus ($5,000 for 20/20 -> add 18 more to reach 20 each)
    await addBinaryVolume(multiUser.id, 'LEFT', 18);
    await addBinaryVolume(multiUser.id, 'RIGHT', 18);
    await evaluateUserPromotions(multiUser.id);

    const multiSummary = await getWalletSummary(multiUser.id);
    const expectedTotal = 50 + mSettlement.totalBonusUsd + 5000;
    assert(multiSummary.totalEarned === expectedTotal, `Multi-source totalEarned equals $${expectedTotal}`, `Got: ${multiSummary.totalEarned}`);
    assert(multiSummary.ledgerBalance === expectedTotal, `Multi-source ledgerBalance equals $${expectedTotal}`, `Got: ${multiSummary.ledgerBalance}`);
    assert(multiSummary.breakdown.referral === 50, 'Referral breakdown is $50', `Got: ${multiSummary.breakdown.referral}`);
    assert(multiSummary.breakdown.matching === mSettlement.totalBonusUsd, `Matching breakdown is $${mSettlement.totalBonusUsd}`, `Got: ${multiSummary.breakdown.matching}`);
    assert(multiSummary.breakdown.promotion === 5000, 'Promotion breakdown is $5000', `Got: ${multiSummary.breakdown.promotion}`);
    assert(
      multiSummary.breakdown.referral + multiSummary.breakdown.matching + multiSummary.breakdown.promotion === multiSummary.ledgerBalance,
      'Breakdown sum exactly matches ledgerBalance',
      `Sum: ${multiSummary.breakdown.referral + multiSummary.breakdown.matching + multiSummary.breakdown.promotion}, Balance: ${multiSummary.ledgerBalance}`
    );

    // ----------------------------------------------------
    // TEST 7: Negative / Invalid Amount Corruption Prevention
    // ----------------------------------------------------
    console.log('\n--- TEST 7: Invalid Amount Rejection & DB Constraints ---');
    const invalidCredit = await postLedgerCredit({
      userId: multiUser.id,
      sourceType: 'REFERRAL_COMMISSION',
      sourceId: uuidv4(),
      sourceRef: 'INVALID-0',
      amount: -50,
      description: 'Illegal negative credit',
    });
    assert(invalidCredit === null, 'Negative amount is rejected before insertion');

    let dbConstraintBlocked = false;
    try {
      await db.query(
        `INSERT INTO financial_ledger_entries (
           id, public_txn_id, user_id, entry_type, source_type, source_id,
           source_ref, description, amount, currency, status, created_at
         ) VALUES ($1, $2, $3, 'CREDIT', 'REFERRAL_COMMISSION', $4, 'INVALID-RAW', 'Direct DB insert', -100, 'USD', 'SETTLED', CURRENT_TIMESTAMP)`,
        [uuidv4(), `TXN-ERR-${Date.now()}`, multiUser.id, uuidv4()]
      );
    } catch {
      dbConstraintBlocked = true;
    }
    assert(dbConstraintBlocked, 'Database check constraint chk_fle_amount prevents negative amounts');

    // ----------------------------------------------------
    // TEST 8: Safe Pagination
    // ----------------------------------------------------
    console.log('\n--- TEST 8: Pagination Controls ---');
    const page1 = await getWalletTransactions(multiUser.id, 1, 2);
    assert(page1.transactions.length === 2, 'Page 1 returns 2 items', `Got: ${page1.transactions.length}`);
    assert(page1.pagination.page === 1, 'Page number is 1');
    assert(page1.pagination.totalPages >= 2, 'Total pages calculated accurately', `Got: ${page1.pagination.totalPages}`);

    const page2 = await getWalletTransactions(multiUser.id, 2, 2);
    assert(page2.transactions.length >= 1, 'Page 2 returns remaining item(s)', `Got: ${page2.transactions.length}`);
    assert(page1.transactions[0].id !== page2.transactions[0].id, 'Page 1 and Page 2 items do not overlap');

    console.log('\n==================================================');
    console.log(`TASK #13 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('==================================================\n');

    if (failed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (err) {
    console.error('Fatal error during Task #13 tests:', err);
    process.exit(1);
  }
}

runTask13WalletTests();
