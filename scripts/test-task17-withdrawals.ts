import { getDb } from '../src/server/db/db';
import { v4 as uuidv4 } from 'uuid';
import { postLedgerCredit, getWalletSummary } from '../src/server/services/walletLedgerService';
import {
  createWithdrawalRequest,
  getUserWithdrawals,
  getWithdrawalByPublicId,
  cancelWithdrawalRequest,
  settleWithdrawalAction,
} from '../src/server/services/withdrawalService';

async function runTask17WithdrawalTests() {
  console.log('\n==================================================');
  console.log('🧪 RUNNING TASK #17: WITHDRAWAL / SETTLEMENT TESTS');
  console.log('==================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, description: string) {
    if (condition) {
      console.log(`✅ [PASS] ${description}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${description}`);
      failed++;
    }
  }

  const db = await getDb();

  // Create isolated Test Users (User A & User B)
  const userAId = uuidv4();
  const userBId = uuidv4();

  await db.query(
    `INSERT INTO users (id, public_id, full_name, email, country, password_hash, role)
     VALUES ($1, $2, 'Withdrawal User A', $3, 'USA', 'hash_test', 'USER')`,
    [userAId, `PHX-WDR-A-${Date.now().toString().slice(-4)}`, `wdr_a_${Date.now()}@test.com`]
  );

  await db.query(
    `INSERT INTO users (id, public_id, full_name, email, country, password_hash, role)
     VALUES ($1, $2, 'Withdrawal User B', $3, 'USA', 'hash_test', 'USER')`,
    [userBId, `PHX-WDR-B-${Date.now().toString().slice(-4)}`, `wdr_b_${Date.now()}@test.com`]
  );

  try {
    // --- 1. INITIAL BALANCE & INSUFFICIENT BALANCE TEST ---
    console.log('\n--- 1. INSUFFICIENT BALANCE & VALIDATION ---');
    const initSummary = await getWalletSummary(userAId);
    assert(initSummary.availableBalance === 0, 'User A initial available balance is $0.00');

    let errorThrown = false;
    try {
      await createWithdrawalRequest({
        userId: userAId,
        amount: 50.0,
        destinationType: 'USDT_TRC20',
        destinationReference: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
      });
    } catch (err: any) {
      errorThrown = true;
      assert(
        err.message.includes('INSUFFICIENT_BALANCE'),
        'Withdrawal request exceeding balance throws INSUFFICIENT_BALANCE error'
      );
    }
    assert(errorThrown, 'Zero balance withdrawal request was rejected');

    // --- 2. CREDIT EARNINGS & VALID WITHDRAWAL ---
    console.log('\n--- 2. CREDIT EARNINGS & VALID WITHDRAWAL REQUEST ---');
    const credit1Id = uuidv4();
    await postLedgerCredit({
      userId: userAId,
      sourceType: 'REFERRAL_COMMISSION',
      sourceId: credit1Id,
      sourceRef: 'COMM-TEST-100',
      amount: 500.0,
      description: 'Referral Commission Earning',
    });

    const summaryAfterCredit = await getWalletSummary(userAId);
    assert(summaryAfterCredit.availableBalance === 500.0, 'User A earned $500.00, available balance is $500.00');

    // Create valid withdrawal request of $200.00
    const wdr1 = await createWithdrawalRequest({
      userId: userAId,
      amount: 200.0,
      destinationType: 'USDT_TRC20',
      destinationReference: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
      idempotencyKey: 'idemp-wdr-001',
    });

    assert(wdr1.status === 'PENDING', 'Withdrawal request created with PENDING status');
    assert(wdr1.amount === 200.0, 'Withdrawal amount matches requested $200.00');
    assert(wdr1.publicWithdrawalId.startsWith('PHX-WDR-'), 'Withdrawal public ID has correct prefix');

    const summaryAfterWdr1 = await getWalletSummary(userAId);
    assert(
      summaryAfterWdr1.availableBalance === 300.0,
      'Available balance reduced from $500.00 to $300.00 after $200.00 withdrawal reservation'
    );

    // --- 3. IDEMPOTENCY & DUPLICATE PROTECTION ---
    console.log('\n--- 3. IDEMPOTENCY & DUPLICATE SUBMISSION PROTECTION ---');
    const wdr1Duplicate = await createWithdrawalRequest({
      userId: userAId,
      amount: 200.0,
      destinationType: 'USDT_TRC20',
      destinationReference: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
      idempotencyKey: 'idemp-wdr-001',
    });

    assert(wdr1Duplicate.id === wdr1.id, 'Duplicate idempotency key returns exact existing withdrawal record');

    const summaryAfterDuplicate = await getWalletSummary(userAId);
    assert(
      summaryAfterDuplicate.availableBalance === 300.0,
      'Duplicate request does NOT double-debit balance (remains $300.00)'
    );

    // --- 4. CONCURRENCY OVERSPEND PROTECTION ---
    console.log('\n--- 4. CONCURRENCY OVERSPEND PROTECTION ---');
    // Available balance is $300. Attempt 2 concurrent withdrawals of $200 each (Total $400 > $300)
    let failedConcurrent = 0;
    let succeededConcurrent = 0;

    const concurrentResults = await Promise.allSettled([
      createWithdrawalRequest({
        userId: userAId,
        amount: 200.0,
        destinationType: 'BTC',
        destinationReference: '1BTCAddress11111',
      }),
      createWithdrawalRequest({
        userId: userAId,
        amount: 200.0,
        destinationType: 'BTC',
        destinationReference: '1BTCAddress22222',
      }),
    ]);

    for (const res of concurrentResults) {
      if (res.status === 'fulfilled') succeededConcurrent++;
      else failedConcurrent++;
    }

    assert(succeededConcurrent === 1, 'Exactly 1 concurrent $200 withdrawal succeeded');
    assert(failedConcurrent === 1, 'Exactly 1 concurrent $200 withdrawal was rejected due to overspend');

    const summaryAfterConcurrent = await getWalletSummary(userAId);
    assert(
      summaryAfterConcurrent.availableBalance === 100.0,
      'Available balance is $100.00 after 2 successful $200 withdrawals ($500 - $400)'
    );

    // --- 5. CANCEL & FUNDS RELEASE ---
    console.log('\n--- 5. CANCEL PENDING WITHDRAWAL & FUNDS RELEASE ---');
    const cancelledWdr = await cancelWithdrawalRequest(wdr1.publicWithdrawalId, userAId);
    assert(cancelledWdr.status === 'CANCELLED', 'Withdrawal status updated to CANCELLED');

    const summaryAfterCancel = await getWalletSummary(userAId);
    assert(
      summaryAfterCancel.availableBalance === 300.0,
      'Cancelling $200.00 withdrawal releases reserved funds back (balance restored to $300.00)'
    );

    // --- 6. SETTLEMENT STATE MACHINE (APPROVE -> COMPLETE) ---
    console.log('\n--- 6. SETTLEMENT STATE MACHINE (APPROVE -> COMPLETE) ---');
    // Find the active pending $200 withdrawal
    const historyA = await getUserWithdrawals(userAId, 1, 10, 'PENDING');
    const activeWdr = historyA.withdrawals[0];

    const approvedWdr = await settleWithdrawalAction({
      withdrawalIdOrPublicId: activeWdr.publicWithdrawalId,
      action: 'APPROVE',
    });
    assert(approvedWdr.status === 'APPROVED', 'Admin APPROVE transitions withdrawal state to APPROVED');

    const completedWdr = await settleWithdrawalAction({
      withdrawalIdOrPublicId: activeWdr.publicWithdrawalId,
      action: 'COMPLETE',
      txHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    });
    assert(completedWdr.status === 'COMPLETED', 'Admin COMPLETE transitions withdrawal state to COMPLETED');

    const summaryAfterComplete = await getWalletSummary(userAId);
    assert(
      summaryAfterComplete.availableBalance === 300.0,
      'Completed withdrawal maintains correct debited balance ($300.00)'
    );
    assert(
      summaryAfterComplete.totalWithdrawn === 200.0,
      'Total withdrawn metric accurately reflects $200.00 completed'
    );

    // --- 7. REJECTED / FAILED SETTLEMENT RELEASES FUNDS ---
    console.log('\n--- 7. REJECTED / FAILED / PROCESSING STATE MACHINE TRANSITIONS ---');
    // Create new withdrawal of $250.00
    const wdr3 = await createWithdrawalRequest({
      userId: userAId,
      amount: 250.0,
      destinationType: 'ETH',
      destinationReference: '0xETHAddress000111',
    });

    const summaryWdr3Created = await getWalletSummary(userAId);
    assert(summaryWdr3Created.availableBalance === 50.0, 'Available balance is $50.00 after $250.00 request');

    // Reject wdr3
    const rejectedWdr = await settleWithdrawalAction({
      withdrawalIdOrPublicId: wdr3.publicWithdrawalId,
      action: 'REJECT',
      rejectionReason: 'Invalid wallet address provided',
    });

    assert(rejectedWdr.status === 'REJECTED', 'Status updated to REJECTED');
    assert(rejectedWdr.rejectionReason === 'Invalid wallet address provided', 'Rejection reason saved');

    const summaryAfterReject = await getWalletSummary(userAId);
    assert(
      summaryAfterReject.availableBalance === 300.0,
      'Rejected withdrawal releases reserved $250.00 back to available balance ($300.00)'
    );

    // Test MARK_PROCESSING -> FAIL flow
    const wdr4 = await createWithdrawalRequest({
      userId: userAId,
      amount: 150.0,
      destinationType: 'BNB',
      destinationReference: '0xBNBHotWalletFailAddress',
    });

    const processingWdr = await settleWithdrawalAction({
      withdrawalIdOrPublicId: wdr4.publicWithdrawalId,
      action: 'MARK_PROCESSING',
    });
    assert(processingWdr.status === 'PROCESSING', 'Transition to PROCESSING succeeded');

    const summaryDuringProcessing = await getWalletSummary(userAId);
    assert(
      summaryDuringProcessing.availableBalance === 150.0,
      'Funds remain reserved during PROCESSING state ($150.00)'
    );

    const failedWdr = await settleWithdrawalAction({
      withdrawalIdOrPublicId: wdr4.publicWithdrawalId,
      action: 'FAIL',
      rejectionReason: 'On-chain broadcast transaction dropped due to network timeout',
    });
    assert(failedWdr.status === 'FAILED', 'Transition to FAILED succeeded');
    assert(failedWdr.rejectionReason === 'On-chain broadcast transaction dropped due to network timeout', 'Failure reason recorded');

    const summaryAfterFail = await getWalletSummary(userAId);
    assert(
      summaryAfterFail.availableBalance === 300.0,
      'Failed withdrawal releases reserved $150.00 back to available balance ($300.00)'
    );

    // --- 8. USER ISOLATION & SECURITY ---
    console.log('\n--- 8. USER ISOLATION & SECURITY ---');
    // User B attempts to access User A's withdrawal
    const isolatedSearch = await getWithdrawalByPublicId(activeWdr.publicWithdrawalId, userBId);
    assert(isolatedSearch === null, 'User B searching User A withdrawal returns null (Strict Isolation)');

    let cancelOtherError = false;
    try {
      await cancelWithdrawalRequest(activeWdr.publicWithdrawalId, userBId);
    } catch {
      cancelOtherError = true;
    }
    assert(cancelOtherError, 'User B cannot cancel User A withdrawal request');

    // --- 9. FINAL LEDGER BALANCE INVARIANT ---
    console.log('\n--- 9. FINAL LEDGER BALANCE INVARIANT ---');
    const finalSummaryA = await getWalletSummary(userAId);
    assert(
      finalSummaryA.totalEarned === 500.0,
      'Total Earned remains invariant at $500.00'
    );
    assert(
      finalSummaryA.totalWithdrawn === 200.0,
      'Total Withdrawn remains invariant at $200.00'
    );
    assert(
      finalSummaryA.availableBalance === 300.0,
      'Available Balance equals Earned ($500) minus Completed Withdrawn ($200) = $300.00'
    );

  } catch (err) {
    console.error('Fatal error during Task #17 test run:', err);
    failed++;
  }

  console.log('\n==================================================');
  console.log(`📊 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('==================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTask17WithdrawalTests().catch((err) => {
  console.error('Unhandled rejection in test runner:', err);
  process.exit(1);
});
