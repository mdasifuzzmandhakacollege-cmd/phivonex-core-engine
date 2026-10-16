import { getDb } from '../src/server/db/db';
import { v4 as uuidv4 } from 'uuid';
import {
  getUser360Details,
  executeAdminWalletAdjustment,
  setUserAccountStatus,
  revokeUserSessions,
} from '../src/server/services/adminService';
import { getWalletSummary } from '../src/server/services/walletLedgerService';
import { getUserCoinBalance } from '../src/server/services/coinSwapService';

async function runTask24User360Tests() {
  console.log('\n==================================================');
  console.log('🧪 RUNNING TASK #24: ADMIN USER 360 & WALLET CONTROL TESTS');
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

  // Create isolated Test Users: Admin User & Target User
  const adminUserId = uuidv4();
  const targetUserId = uuidv4();

  const adminPublicId = `PHX-ADM-${Date.now().toString().slice(-5)}`;
  const targetPublicId = `PHX-USR-${Date.now().toString().slice(-5)}`;

  await db.query(
    `INSERT INTO users (id, public_id, full_name, email, country, password_hash, role, status)
     VALUES ($1, $2, 'Master Admin', $3, 'USA', 'hash_adm', 'SUPER_ADMIN', 'ACTIVE')`,
    [adminUserId, adminPublicId, `admin_360_${Date.now()}@test.com`]
  );

  await db.query(
    `INSERT INTO users (id, public_id, full_name, email, country, password_hash, role, status)
     VALUES ($1, $2, 'Target User 360', $3, 'USA', 'hash_usr', 'USER', 'ACTIVE')`,
    [targetUserId, targetPublicId, `target_360_${Date.now()}@test.com`]
  );

  // Create mock active session for target user
  const sessionId = uuidv4();
  await db.query(
    `INSERT INTO sessions (id, user_id, token_hash, ip_address, expires_at)
     VALUES ($1, $2, 'token_hash_360', '127.0.0.1', CURRENT_TIMESTAMP + INTERVAL '1 day')`,
    [sessionId, targetUserId]
  );

  try {
    // --- 1. USER 360° INSPECTION API ---
    console.log('--- 1. USER 360° INSPECTION API ---');
    const u360 = await getUser360Details(targetUserId);

    assert(u360.profile.publicId === targetPublicId, 'User 360 returns correct user public ID');
    assert(u360.profile.fullName === 'Target User 360', 'User 360 returns full name');
    assert(u360.profile.status === 'ACTIVE', 'User 360 returns account status');
    assert(typeof u360.walletOverview.usdtAvailableBalance === 'number', 'User 360 returns USDT balance');
    assert(typeof u360.walletOverview.phivoAvailableBalance === 'number', 'User 360 returns PHIVO balance');
    assert(Array.isArray(u360.transactions), 'User 360 returns ledger transactions list');
    assert(Array.isArray(u360.sessions) && u360.sessions.length > 0, 'User 360 returns active sessions list');

    // --- 2. VALID USDT CREDIT & DEBIT ADJUSTMENTS ---
    console.log('\n--- 2. VALID USDT CREDIT & DEBIT ADJUSTMENTS ---');
    
    // Credit 250 USDT
    const creditRes = await executeAdminWalletAdjustment({
      adminUserId,
      adminPublicId,
      targetUserId,
      asset: 'USDT',
      direction: 'CREDIT',
      amount: 250.0,
      reason: 'Initial test reconciliation credit',
      idempotencyKey: `idem-usdt-cred-${Date.now()}`,
    });

    assert(creditRes.success === true, 'USDT Credit adjustment returns success');
    assert(creditRes.transaction.amount === 250.0, 'USDT Credit amount is 250.0');
    assert(creditRes.transaction.newBalance === 250.0, 'USDT New balance is 250.0');

    // Check server-authoritative USDT balance
    const usdtBal1 = await getWalletSummary(targetUserId);
    assert(usdtBal1.availableBalance === 250.0, 'Wallet summary reflects 250.0 USDT available balance');

    // Debit 50 USDT
    const debitRes = await executeAdminWalletAdjustment({
      adminUserId,
      adminPublicId,
      targetUserId,
      asset: 'USDT',
      direction: 'DEBIT',
      amount: 50.0,
      reason: 'Fee adjustment deduction',
      idempotencyKey: `idem-usdt-deb-${Date.now()}`,
    });

    assert(debitRes.success === true, 'USDT Debit adjustment returns success');
    assert(debitRes.transaction.newBalance === 200.0, 'USDT New balance after debit is 200.0');

    const usdtBal2 = await getWalletSummary(targetUserId);
    assert(usdtBal2.availableBalance === 200.0, 'Wallet summary reflects 200.0 USDT available balance after debit');

    // --- 3. VALID PHIVO CREDIT & DEBIT ADJUSTMENTS ---
    console.log('\n--- 3. VALID PHIVO CREDIT & DEBIT ADJUSTMENTS ---');

    // Credit 1000 PHIVO
    const phivoCredRes = await executeAdminWalletAdjustment({
      adminUserId,
      adminPublicId,
      targetUserId,
      asset: 'PHIVO',
      direction: 'CREDIT',
      amount: 1000.0,
      reason: 'Manual PHIVO reward adjustment',
      idempotencyKey: `idem-phivo-cred-${Date.now()}`,
    });

    assert(phivoCredRes.success === true, 'PHIVO Credit adjustment returns success');
    assert(phivoCredRes.transaction.newBalance === 1000.0, 'PHIVO New balance is 1000.0');

    const phivoBal1 = await getUserCoinBalance(targetUserId);
    assert(phivoBal1.availableCoinBalance === 1000.0, 'Coin balance reflects 1000.0 PHIVO');

    // Debit 300 PHIVO
    const phivoDebRes = await executeAdminWalletAdjustment({
      adminUserId,
      adminPublicId,
      targetUserId,
      asset: 'PHIVO',
      direction: 'DEBIT',
      amount: 300.0,
      reason: 'Correction debit for erroneous PHIVO distribution',
      idempotencyKey: `idem-phivo-deb-${Date.now()}`,
    });

    assert(phivoDebRes.success === true, 'PHIVO Debit adjustment returns success');
    assert(phivoDebRes.transaction.newBalance === 700.0, 'PHIVO New balance after debit is 700.0');

    const phivoBal2 = await getUserCoinBalance(targetUserId);
    assert(phivoBal2.availableCoinBalance === 700.0, 'Coin balance reflects 700.0 PHIVO after debit');

    // --- 4. NEGATIVE BALANCE PROTECTION ---
    console.log('\n--- 4. NEGATIVE BALANCE PROTECTION ---');
    try {
      await executeAdminWalletAdjustment({
        adminUserId,
        adminPublicId,
        targetUserId,
        asset: 'USDT',
        direction: 'DEBIT',
        amount: 99999.0, // Exceeds 200 USDT current balance
        reason: 'Excessive debit attempt',
      });
      assert(false, 'Debit exceeding balance should throw Insufficient Balance error');
    } catch (err: any) {
      assert(err.message.includes('INSUFFICIENT_BALANCE'), 'Debit exceeding balance blocked with INSUFFICIENT_BALANCE error');
    }

    // Verify balance remains 200.0 USDT after rejected debit
    const usdtBal3 = await getWalletSummary(targetUserId);
    assert(usdtBal3.availableBalance === 200.0, 'USDT balance remains intact at 200.0 after rejected debit');

    // --- 5. INPUT VALIDATION & SAFETY ---
    console.log('\n--- 5. INPUT VALIDATION & SAFETY ---');

    // Zero amount
    try {
      await executeAdminWalletAdjustment({
        adminUserId,
        adminPublicId,
        targetUserId,
        asset: 'USDT',
        direction: 'CREDIT',
        amount: 0,
        reason: 'Zero credit test',
      });
      assert(false, 'Zero amount should be rejected');
    } catch (err: any) {
      assert(err.message.includes('greater than 0'), 'Zero amount blocked correctly');
    }

    // Negative amount
    try {
      await executeAdminWalletAdjustment({
        adminUserId,
        adminPublicId,
        targetUserId,
        asset: 'USDT',
        direction: 'CREDIT',
        amount: -50,
        reason: 'Negative credit test',
      });
      assert(false, 'Negative amount should be rejected');
    } catch (err: any) {
      assert(err.message.includes('greater than 0'), 'Negative amount blocked correctly');
    }

    // Short reason
    try {
      await executeAdminWalletAdjustment({
        adminUserId,
        adminPublicId,
        targetUserId,
        asset: 'USDT',
        direction: 'CREDIT',
        amount: 10,
        reason: '123', // < 5 chars
      });
      assert(false, 'Short reason should be rejected');
    } catch (err: any) {
      assert(err.message.includes('minimum 5 characters'), 'Short reason (< 5 chars) blocked correctly');
    }

    // --- 6. IDEMPOTENCY & DUPLICATE PROTECTION ---
    console.log('\n--- 6. IDEMPOTENCY & DUPLICATE PROTECTION ---');
    const sameKey = `idem-duplicate-${Date.now()}`;

    // First request
    const req1 = await executeAdminWalletAdjustment({
      adminUserId,
      adminPublicId,
      targetUserId,
      asset: 'USDT',
      direction: 'CREDIT',
      amount: 100.0,
      reason: 'Idempotency test initial request',
      idempotencyKey: sameKey,
    });

    assert(req1.success === true && req1.isDuplicate === false, 'First idempotency request executes new transaction');

    // Duplicate request with identical key
    const req2 = await executeAdminWalletAdjustment({
      adminUserId,
      adminPublicId,
      targetUserId,
      asset: 'USDT',
      direction: 'CREDIT',
      amount: 100.0,
      reason: 'Idempotency test retry request',
      idempotencyKey: sameKey,
    });

    assert(req2.success === true && req2.isDuplicate === true, 'Duplicate idempotency request returns existing transaction without double credit');
    assert(req2.transaction.publicTxnId === req1.transaction.publicTxnId, 'Public Txn ID matches original transaction');

    // Check balance: 200 + 100 = 300 (NOT 400)
    const usdtBalIdem = await getWalletSummary(targetUserId);
    assert(usdtBalIdem.availableBalance === 300.0, 'Balance is exactly 300.0 USDT (no double credit occurred)');

    // --- 7. ACCOUNT STATUS & SESSION MANAGEMENT ---
    console.log('\n--- 7. ACCOUNT STATUS & SESSION MANAGEMENT ---');

    // Lock account
    const lockRes = await setUserAccountStatus({
      adminUserId,
      adminPublicId,
      targetUserId,
      status: 'LOCKED',
      reason: 'Security investigation lock',
    });

    assert(lockRes.success === true && lockRes.status === 'LOCKED', 'User account locked successfully');

    // Verify session revoked on lock
    const activeSessionsRes = await db.query(`SELECT revoked_at FROM sessions WHERE id = $1`, [sessionId]);
    assert(activeSessionsRes.rows[0]?.revoked_at !== null, 'Active sessions revoked upon account lock');

    // Unlock account
    const unlockRes = await setUserAccountStatus({
      adminUserId,
      adminPublicId,
      targetUserId,
      status: 'ACTIVE',
      reason: 'Security investigation completed',
    });

    assert(unlockRes.success === true && unlockRes.status === 'ACTIVE', 'User account unlocked successfully');

    // --- 8. AUDIT LOG VERIFICATION ---
    console.log('\n--- 8. AUDIT LOG VERIFICATION ---');
    const auditRes = await db.query<any>(
      `SELECT action, details FROM admin_audit_logs WHERE target_id = $1 ORDER BY created_at DESC`,
      [targetPublicId]
    );

    assert(auditRes.rows.length >= 4, 'Audit logs recorded for user management actions');
    const actionsLogged = auditRes.rows.map((a) => a.action);
    assert(actionsLogged.includes('ADMIN_WALLET_CREDIT'), 'ADMIN_WALLET_CREDIT logged');
    assert(actionsLogged.includes('ADMIN_WALLET_DEBIT'), 'ADMIN_WALLET_DEBIT logged');
    assert(actionsLogged.includes('ADMIN_USER_LOCK'), 'ADMIN_USER_LOCK logged');
    assert(actionsLogged.includes('ADMIN_USER_UNLOCK'), 'ADMIN_USER_UNLOCK logged');

    console.log('\n==================================================');
    console.log(`📊 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('==================================================\n');

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Fatal error during Task #24 test execution:', err);
    process.exit(1);
  }
}

runTask24User360Tests().then(() => process.exit(0)).catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
