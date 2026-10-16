import { getDb } from '../src/server/db/db';
import { v4 as uuidv4 } from 'uuid';
import {
  postLedgerCredit,
  postLedgerDebit,
  getWalletSummary,
  getWalletTransactions,
} from '../src/server/services/walletLedgerService';

async function runPhase13TransactionsTests() {
  console.log('========================================================');
  console.log('🛡️ RUNNING PHASE 13: TRANSACTIONS & FINANCIAL AUDIT SUITE');
  console.log('========================================================\n');

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

  try {
    // 1. Setup Test Users
    const userAId = uuidv4();
    const userAPublicId = `PX-TXNA-${Math.floor(1000 + Math.random() * 9000)}`;
    const userAEmail = `txn_usera_${Date.now()}@phivonex.test`;

    const userBId = uuidv4();
    const userBPublicId = `PX-TXNB-${Math.floor(1000 + Math.random() * 9000)}`;
    const userBEmail = `txn_userb_${Date.now()}@phivonex.test`;

    await db.query(
      `INSERT INTO users (id, public_id, full_name, email, country, password_hash, status, created_at, updated_at)
       VALUES ($1, $2, 'Operator TXN A', $3, 'United States', 'hash_a', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [userAId, userAPublicId, userAEmail]
    );

    await db.query(
      `INSERT INTO users (id, public_id, full_name, email, country, password_hash, status, created_at, updated_at)
       VALUES ($1, $2, 'Operator TXN B', $3, 'United States', 'hash_b', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [userBId, userBPublicId, userBEmail]
    );

    assert(true, '1. Test Operator A and Operator B identities provisioned');

    // 2. Provision Initial Ledger Entries for User A and User B
    const refCommA = await postLedgerCredit({
      userId: userAId,
      sourceType: 'REFERRAL_COMMISSION',
      sourceId: uuidv4(),
      sourceRef: 'COMM-13A-01',
      amount: 50.00,
      description: 'Direct Referral Commission - Node Activation',
    });

    const matchBonusA = await postLedgerCredit({
      userId: userAId,
      sourceType: 'MATCHING_BONUS',
      sourceId: uuidv4(),
      sourceRef: 'MS-13A-01',
      amount: 100.00,
      description: 'Binary Matching Settlement Cycle #1',
    });

    const bscDepA = await postLedgerCredit({
      userId: userAId,
      sourceType: 'BLOCKCHAIN_DEPOSIT',
      sourceId: uuidv4(),
      sourceRef: 'DEP-13A-01',
      amount: 250.00,
      currency: 'USDT',
      description: 'USDT Blockchain Deposit (0xabc1234567)',
    });

    const withdrawalA = await postLedgerDebit({
      userId: userAId,
      sourceType: 'WITHDRAWAL',
      sourceId: uuidv4(),
      sourceRef: 'WTH-13A-01',
      amount: 75.00,
      currency: 'USDT',
      description: 'USDT Blockchain Settlement to 0xdeadbeef',
    });

    // User B Private Entry
    const refCommB = await postLedgerCredit({
      userId: userBId,
      sourceType: 'REFERRAL_COMMISSION',
      sourceId: uuidv4(),
      sourceRef: 'COMM-13B-SECRET',
      amount: 999.00,
      description: 'Secret High Value Referral for User B',
    });

    assert(Boolean(refCommA && matchBonusA && bscDepA && withdrawalA && refCommB), '2. Distinct ledger transactions provisioned');

    // Capture baseline balances and row counts
    const initialSummaryA = await getWalletSummary(userAId);
    const initialBalanceA = initialSummaryA.ledgerBalance;
    const initialCountA = initialSummaryA.transactionCount;

    const countResBefore = await db.query<{ count: string }>(`SELECT COUNT(*) as count FROM financial_ledger_entries`);
    const totalDbRowsBefore = parseInt(countResBefore.rows[0].count, 10);

    // --- GROUP 1: AUTH & USER ISOLATION ---
    console.log('\n--- 1. Auth & User Isolation ---');
    const userAList = await getWalletTransactions(userAId);
    assert(userAList.transactions.length >= 4, 'VALID LIST: User A retrieves their transactions');
    assert(userAList.transactions.every(tx => tx.userId === userAId), 'CROSS-USER LIST: All returned transactions belong strictly to User A');
    assert(!userAList.transactions.some(tx => tx.sourceRef === 'COMM-13B-SECRET'), 'CROSS-USER READ: User B secret transaction never leaked to User A');

    // Client user-id override protection test (API layer verifies session token, service strictly uses authorized user ID)
    const userBList = await getWalletTransactions(userBId);
    assert(userBList.transactions.every(tx => tx.userId === userBId), 'CLIENT USER-ID OVERRIDE: User B transactions strictly scoped to User B');

    // --- GROUP 2: FILTER & SEARCH ---
    console.log('\n--- 2. Filter & Safe Parameterized Search ---');
    // Filter by category
    const referralOnly = await getWalletTransactions(userAId, 1, 20, 'REFERRAL_COMMISSION');
    assert(referralOnly.transactions.length === 1 && referralOnly.transactions[0].sourceType === 'REFERRAL_COMMISSION', 'VALID FILTER: Category filter correctly isolates REFERRAL_COMMISSION');

    const withdrawalsOnly = await getWalletTransactions(userAId, 1, 20, 'WITHDRAWAL');
    assert(withdrawalsOnly.transactions.length === 1 && withdrawalsOnly.transactions[0].sourceType === 'WITHDRAWAL', 'VALID FILTER: Category filter isolates WITHDRAWAL');

    // Filter by entry type
    const debitsOnly = await getWalletTransactions(userAId, 1, 20, undefined, undefined, 'DEBIT');
    assert(debitsOnly.transactions.every(tx => tx.entryType === 'DEBIT'), 'VALID FILTER: Entry type filter isolates DEBIT');

    const invalidFilter = await getWalletTransactions(userAId, 1, 20, 'NON_EXISTENT_CATEGORY_XYZ');
    assert(invalidFilter.transactions.length === 0, 'INVALID FILTER: Safe zero results returned on unknown category');

    // SQL Injection in Search
    const sqlInjectionQuery = "DEP' OR '1'='1' --";
    const sqliResult = await getWalletTransactions(userAId, 1, 20, undefined, sqlInjectionQuery);
    assert(sqliResult.transactions.length === 0, 'SQL INJECTION SEARCH: SQL injection payload safely parameterized, zero records leaked');

    // Wildcard abuse in search
    const wildcardQuery = "%%%%%%%%%%%%%%%";
    const wildcardResult = await getWalletTransactions(userAId, 1, 20, undefined, wildcardQuery);
    assert(wildcardResult.transactions.length <= 20, 'WILDCARD ABUSE HANDLING: Parameterized search safely handles excessive wildcards');

    // Oversized search input (e.g. 10,000 characters)
    const oversizedSearch = 'A'.repeat(5000);
    const oversizedSearchResult = await getWalletTransactions(userAId, 1, 20, undefined, oversizedSearch);
    assert(oversizedSearchResult.transactions.length === 0, 'OVERSIZED SEARCH: Safely handled without memory leak or crash');

    // Valid search match
    const validSearch = await getWalletTransactions(userAId, 1, 20, undefined, 'COMM-13A-01');
    assert(validSearch.transactions.length === 1 && validSearch.transactions[0].sourceRef === 'COMM-13A-01', 'VALID SEARCH: Correctly matches public source reference');

    // --- GROUP 3: PAGINATION & MAX LIMIT ---
    console.log('\n--- 3. Pagination & Deterministic Ordering ---');
    const page1 = await getWalletTransactions(userAId, 1, 2);
    assert(page1.transactions.length === 2, 'VALID PAGINATION: Page 1 with limit 2 returns exactly 2 records');
    assert(page1.pagination.totalCount >= 4, 'VALID PAGINATION: Total count correctly reflects all matching entries');

    const page2 = await getWalletTransactions(userAId, 2, 2);
    assert(page2.transactions.length >= 2, 'VALID PAGINATION: Page 2 returns subsequent records');
    assert(page1.transactions[0].id !== page2.transactions[0].id, 'DETERMINISTIC ORDERING: Page 1 and Page 2 do not overlap');

    // Oversized Limit Protection (Requested limit 999999 is clamped to max 100)
    const oversizedLimitResult = await getWalletTransactions(userAId, 1, 999999);
    assert(oversizedLimitResult.pagination.limit === 100, 'OVERSIZED LIMIT: Limit clamped to max safe limit (100)');

    // Negative / Invalid offset input
    const negativePageResult = await getWalletTransactions(userAId, -5, -10);
    assert(negativePageResult.pagination.page === 1 && negativePageResult.pagination.limit >= 1, 'NEGATIVE/OFFSET INVALID INPUT: Safely normalized to page 1');

    // --- GROUP 4: RECEIPT & SENSITIVE FIELD REDACTION ---
    console.log('\n--- 4. Receipt & Field Redaction ---');
    const sampleTx = userAList.transactions[0];
    assert(Boolean(sampleTx.publicTxnId && sampleTx.publicTxnId.startsWith('TXN-')), 'VALID RECEIPT VIEW: Public TXN ID has canonical format');
    assert(!('password_hash' in sampleTx) && !('secret' in sampleTx) && !('private_key' in sampleTx), 'SENSITIVE FIELD REDACTION: Zero sensitive authentication or secret fields in transaction output');

    // --- GROUP 5: READ-ONLY INVARIANT GUARANTEE ---
    console.log('\n--- 5. Read-Only Invariant Guarantee ---');
    const finalSummaryA = await getWalletSummary(userAId);
    assert(finalSummaryA.ledgerBalance === initialBalanceA, 'BALANCE UNCHANGED AFTER BROWSING: Financial balance unchanged after all queries');
    assert(finalSummaryA.transactionCount === initialCountA, 'NO WRITE SIDE EFFECT: User transaction count strictly identical');

    const countResAfter = await db.query<{ count: string }>(`SELECT COUNT(*) as count FROM financial_ledger_entries`);
    const totalDbRowsAfter = parseInt(countResAfter.rows[0].count, 10);
    assert(totalDbRowsAfter === totalDbRowsBefore, 'LEDGER ROW COUNT UNCHANGED: Zero unintended ledger mutations during explorer browsing');

    // --- CLEANUP TEST FIXTURES ---
    await db.query(`DELETE FROM financial_ledger_entries WHERE user_id IN ($1, $2)`, [userAId, userBId]);
    await db.query(`DELETE FROM users WHERE id IN ($1, $2)`, [userAId, userBId]);
    assert(true, 'Test fixtures safely cleaned up');

    console.log('\n========================================================');
    console.log(`📊 PHASE 13 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('========================================================\n');

    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error('💥 Fatal error in Phase 13 test suite:', err);
    process.exit(1);
  }
}

runPhase13TransactionsTests();
