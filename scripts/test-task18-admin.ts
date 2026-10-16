import { getDb } from '../src/server/db/db';
import { v4 as uuidv4 } from 'uuid';
import {
  getAdminSummaryMetrics,
  getAdminUsersList,
  getAdminNodesList,
  getAdminOrdersList,
  getAdminWithdrawalsList,
  getAdminTransactionsList,
  getAdminAuditLogs,
  logAdminAction,
} from '../src/server/services/adminService';
import { createWithdrawalRequest, settleWithdrawalAction } from '../src/server/services/withdrawalService';
import { postLedgerCredit, getWalletSummary } from '../src/server/services/walletLedgerService';

async function runTask18AdminTests() {
  console.log('\n==================================================');
  console.log('🧪 RUNNING TASK #18: ADMIN PANEL FOUNDATION TESTS');
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

  // Create isolated Test Users: Admin User & Normal User
  const adminUserId = uuidv4();
  const normalUserId = uuidv4();

  const adminPublicId = `PHX-ADM-${Date.now().toString().slice(-4)}`;
  const normalPublicId = `PHX-USR-${Date.now().toString().slice(-4)}`;

  await db.query(
    `INSERT INTO users (id, public_id, full_name, email, country, password_hash, role, status)
     VALUES ($1, $2, 'Admin Operator', $3, 'USA', 'secret_hash_adm', 'ADMIN', 'ACTIVE')`,
    [adminUserId, adminPublicId, `admin_${Date.now()}@test.com`]
  );

  await db.query(
    `INSERT INTO users (id, public_id, full_name, email, country, password_hash, role, status)
     VALUES ($1, $2, 'Normal User', $3, 'USA', 'secret_hash_usr', 'USER', 'ACTIVE')`,
    [normalUserId, normalPublicId, `user_${Date.now()}@test.com`]
  );

  try {
    // --- 1. ADMIN DASHBOARD SUMMARY METRICS ---
    console.log('\n--- 1. ADMIN DASHBOARD SUMMARY METRICS ---');
    const summary = await getAdminSummaryMetrics();

    assert(typeof summary.totalUsers === 'number' && summary.totalUsers >= 2, 'Summary returns real totalUsers count');
    assert(typeof summary.activeUsers === 'number' && summary.activeUsers >= 2, 'Summary returns activeUsers count');
    assert(summary.genesisNodeCap === 10000, 'Genesis Node Cap is strictly 10,000');
    assert(typeof summary.activeNodes === 'number', 'Summary returns activeNodes count');
    assert(typeof summary.availableNodes === 'number', 'Summary returns availableNodes count');
    assert(typeof summary.ledgerTransactionsCount === 'number', 'Summary returns ledgerTransactionsCount');
    assert(typeof summary.pendingWithdrawalsCount === 'number', 'Summary returns pendingWithdrawalsCount');

    // --- 2. USERS VIEW & SECRET EXCLUSION ---
    console.log('\n--- 2. USERS VIEW & AUTH SECRETS EXCLUSION ---');
    const usersData = await getAdminUsersList(1, 20);
    assert(usersData.users.length >= 2, 'Users list returns registered users');

    const sampleUser = usersData.users.find((u) => u.id === normalUserId);
    assert(!!sampleUser, 'Found created normal user in users list');
    assert(sampleUser?.publicId === normalPublicId, 'User public ID matches');
    assert((sampleUser as any).password_hash === undefined, 'Password hash is strictly EXCLUDED from users list');
    assert((sampleUser as any).token_hash === undefined, 'Session token hashes are strictly EXCLUDED');

    // --- 3. READ-ONLY VIEWS (NODES, ORDERS, TRANSACTIONS) ---
    console.log('\n--- 3. READ-ONLY VIEWS (NODES, ORDERS, TRANSACTIONS) ---');
    const nodesData = await getAdminNodesList(1, 10);
    assert(Array.isArray(nodesData.nodes) && nodesData.nodes.length > 0, 'Admin can view nodes inventory');

    const ordersData = await getAdminOrdersList(1, 10);
    assert(Array.isArray(ordersData.orders), 'Admin can view node orders');

    const txsData = await getAdminTransactionsList(1, 10);
    assert(Array.isArray(txsData.transactions), 'Admin can view financial ledger transactions');

    // --- 4. WITHDRAWAL SETTLEMENT & AUDIT LOGGING ---
    console.log('\n--- 4. WITHDRAWAL SETTLEMENT & AUDIT LOGGING ---');
    // Credit $300 to normal user and create a $100 withdrawal
    const creditId = uuidv4();
    await postLedgerCredit({
      userId: normalUserId,
      sourceType: 'REFERRAL_COMMISSION',
      sourceId: creditId,
      sourceRef: 'COMM-ADM-TEST',
      amount: 300.0,
      description: 'Admin Test Referral Commission',
    });

    const wdr = await createWithdrawalRequest({
      userId: normalUserId,
      amount: 100.0,
      destinationType: 'USDT_TRC20',
      destinationReference: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
    });

    assert(wdr.status === 'PENDING', 'Created $100 withdrawal in PENDING state');

    // Admin approves withdrawal
    const approvedWdr = await settleWithdrawalAction({
      withdrawalIdOrPublicId: wdr.publicWithdrawalId,
      action: 'APPROVE',
    });
    assert(approvedWdr.status === 'APPROVED', 'Admin APPROVE action transitioned withdrawal to APPROVED');

    // Write audit log entry
    await logAdminAction({
      adminUserId,
      adminPublicId,
      action: 'WITHDRAWAL_APPROVED',
      targetType: 'WITHDRAWAL',
      targetId: approvedWdr.publicWithdrawalId,
      details: `Admin ${adminPublicId} approved withdrawal ${approvedWdr.publicWithdrawalId} for $100.00 USD.`,
      metadata: { amount: 100.0, status: 'APPROVED' },
    });

    // Admin completes withdrawal
    const completedWdr = await settleWithdrawalAction({
      withdrawalIdOrPublicId: wdr.publicWithdrawalId,
      action: 'COMPLETE',
      txHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    });
    assert(completedWdr.status === 'COMPLETED', 'Admin COMPLETE action transitioned withdrawal to COMPLETED');

    await logAdminAction({
      adminUserId,
      adminPublicId,
      action: 'WITHDRAWAL_COMPLETED',
      targetType: 'WITHDRAWAL',
      targetId: completedWdr.publicWithdrawalId,
      details: `Admin ${adminPublicId} completed withdrawal ${completedWdr.publicWithdrawalId}.`,
      metadata: { amount: 100.0, status: 'COMPLETED' },
    });

    // --- 5. AUDIT LOG INSPECTION ---
    console.log('\n--- 5. AUDIT LOG INSPECTION ---');
    const auditData = await getAdminAuditLogs(1, 10);
    assert(auditData.logs.length >= 2, 'Admin audit log contains logged financial actions');

    const approveLog = auditData.logs.find((l) => l.action === 'WITHDRAWAL_APPROVED' && l.targetId === wdr.publicWithdrawalId);
    assert(!!approveLog, 'Audit log entry found for WITHDRAWAL_APPROVED');
    assert(approveLog?.adminPublicId === adminPublicId, 'Audit log records correct admin public ID');

    // --- 6. LEDGER INVARIANT AFTER ADMIN SETTLEMENT ---
    console.log('\n--- 6. LEDGER INVARIANT AFTER ADMIN SETTLEMENT ---');
    const userSummary = await getWalletSummary(normalUserId);
    assert(userSummary.totalEarned === 300.0, 'Normal user earned $300.00');
    assert(userSummary.totalWithdrawn === 100.0, 'Normal user completed withdrawal $100.00');
    assert(userSummary.availableBalance === 200.0, 'Normal user available balance is $200.00');

  } catch (err) {
    console.error('Fatal error during Task #18 test run:', err);
    failed++;
  }

  console.log('\n==================================================');
  console.log(`📊 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('==================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTask18AdminTests().catch((err) => {
  console.error('Unhandled rejection in test runner:', err);
  process.exit(1);
});
