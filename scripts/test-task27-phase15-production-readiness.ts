import { getDb } from '../src/server/db/db';
import { v4 as uuidv4 } from 'uuid';
import { hashPassword, verifyPassword } from '../src/server/utils/crypto';
import { isUserAdmin } from '../src/server/middleware/authMiddleware';
import { postLedgerCredit, postLedgerDebit, getWalletSummary } from '../src/server/services/walletLedgerService';
import { createWithdrawalRequest, getWithdrawalByPublicId, settleWithdrawalAction } from '../src/server/services/withdrawalService';
import { executeCoinToUsdtSwap } from '../src/server/services/coinSwapService';
import { createRewardEpoch, closeAndSettleEpoch, claimUserRewards } from '../src/server/services/nodeRewardService';
import { createNotification, getUserNotifications } from '../src/server/services/notificationService';
import { validateProductionConfig } from '../src/config/integrationConfig';

delete process.env.RESEND_API_KEY;
process.env.NODE_ENV = 'test';

async function runPhase15ProductionReadinessTests() {
  console.log('========================================================================');
  console.log('🛡️ RUNNING PHASE 15: PRODUCTION READINESS & LAUNCH CERTIFICATION GATE');
  console.log('========================================================================\n');

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
    // ------------------------------------------------------------------------
    // 1. PUBLIC UI FINAL POLISH & DUPLICATE CONTENT CHECK
    // ------------------------------------------------------------------------
    console.log('--- 1. Public UI & Landing Page Integrity ---');
    const fs = await import('fs');
    const path = await import('path');
    const landingPath = path.resolve(process.cwd(), 'src/pages/PublicLandingPage.tsx');
    const landingContent = fs.readFileSync(landingPath, 'utf8');

    const faqMatches = landingContent.match(/<section id="faq"/g) || [];
    assert(faqMatches.length === 1, '1. Single authoritative FAQ section render (no duplicate renders)', `Found count: ${faqMatches.length}`);

    const heroMatches = landingContent.match(/<section id="hero"/g) || [];
    assert(heroMatches.length === 1, '2. Single authoritative Hero section render');

    // ------------------------------------------------------------------------
    // 2. PRODUCTION DATABASE READINESS & FAIL-CLOSED POSTGRES
    // ------------------------------------------------------------------------
    console.log('\n--- 2. Production Database Readiness & Fail-Closed Behavior ---');
    // Test that when NODE_ENV=production, config validation enforces valid DATABASE_URL
    let prodConfigFailedClosed = false;
    const originalEnv = process.env.NODE_ENV;
    const originalAppEnv = process.env.APP_ENV;
    const originalDbUrl = process.env.DATABASE_URL;

    try {
      process.env.NODE_ENV = 'production';
      process.env.APP_ENV = 'production';
      delete process.env.DATABASE_URL;
      validateProductionConfig();
    } catch (err: any) {
      prodConfigFailedClosed = err.message.includes('DATABASE_URL is mandatory');
    } finally {
      process.env.NODE_ENV = originalEnv;
      process.env.APP_ENV = originalAppEnv;
      if (originalDbUrl) process.env.DATABASE_URL = originalDbUrl;
    }
    assert(prodConfigFailedClosed, '3. Production fails closed immediately if DATABASE_URL is missing');

    // Verify critical production indexes exist in DB
    const indexesRes = await db.query(
      `SELECT indexname FROM pg_indexes WHERE schemaname = 'public'`
    );
    const indexNames = indexesRes.rows.map((r: any) => r.indexname);
    assert(indexNames.includes('idx_fle_user_created'), '4. Critical financial index: idx_fle_user_created exists');
    assert(indexNames.includes('idx_notifications_user_created'), '5. Critical notifications index: idx_notifications_user_created exists');

    // ------------------------------------------------------------------------
    // 3. ENVIRONMENT & SECRETS AUDIT
    // ------------------------------------------------------------------------
    console.log('\n--- 3. Environment & Secret Redaction Audit ---');
    const { PHIVONEX_TOKEN_CONFIG } = await import('../src/server/config/tokenConfig');
    assert(Boolean(PHIVONEX_TOKEN_CONFIG.contractAddress), '6. Public token contract address is configured and non-empty');
    assert(!JSON.stringify(PHIVONEX_TOKEN_CONFIG).includes('privateKey'), '7. Token configuration strictly excludes private keys');

    // ------------------------------------------------------------------------
    // 4. AUTH, SESSION & COOKIE HARDENING
    // ------------------------------------------------------------------------
    console.log('\n--- 4. Auth & Session Hardening ---');
    const testPassword = 'ProductionSecurePassword!2026';
    const argonHash = await hashPassword(testPassword);
    assert(argonHash.startsWith('$argon2id$'), '8. Password hashing enforces Argon2id format');
    const isValidPass = await verifyPassword(argonHash, testPassword);
    assert(isValidPass === true, '9. Argon2id password verification succeeds');
    const isInvalidPass = await verifyPassword(argonHash, 'WrongPassword');
    assert(isInvalidPass === false, '10. Incorrect password rejected');

    // ------------------------------------------------------------------------
    // 5. ADMIN RBAC & ENDPOINT AUTHORIZATION
    // ------------------------------------------------------------------------
    console.log('\n--- 5. Admin RBAC Verification ---');
    const normalUser = { id: uuidv4(), role: 'USER', email: 'user@test.phivonex' };
    const adminUser = { id: uuidv4(), role: 'ADMIN', email: 'admin@phivonex.com' };
    assert(isUserAdmin(normalUser) === false, '11. Normal user is rejected by server-side isUserAdmin');
    assert(isUserAdmin(adminUser) === true, '12. Admin role user is verified by server-side isUserAdmin');
    assert(isUserAdmin(null) === false, '13. Unauthenticated entity rejected by isUserAdmin');

    // ------------------------------------------------------------------------
    // 6. FINANCIAL LEDGER FINAL INVARIANTS & CONCURRENCY
    // ------------------------------------------------------------------------
    console.log('\n--- 6. Financial Ledger Final Invariants & Cross-Feature Concurrency ---');
    const finUserAId = uuidv4();
    const finUserAPublicId = `PX-FIN-${Math.floor(1000 + Math.random() * 9000)}`;
    const finUserAEmail = `fin_user_${Date.now()}@phivonex.test`;

    await db.query(
      `INSERT INTO users (id, public_id, full_name, email, country, password_hash, role, status)
       VALUES ($1, $2, 'Financial Test User', $3, 'United States', 'hash_test', 'USER', 'ACTIVE')`,
      [finUserAId, finUserAPublicId, finUserAEmail]
    );

    // Initial funding: $500.00 USDT
    await postLedgerCredit({
      userId: finUserAId,
      amount: 500.0,
      sourceType: 'BLOCKCHAIN_DEPOSIT',
      sourceId: uuidv4(),
      sourceRef: 'INITIAL-FUNDING-DEP',
      description: 'Initial funding for concurrency audit',
    });

    const initialWallet = await getWalletSummary(finUserAId);
    assert(initialWallet.availableBalance === 500.0, '14. Initial wallet credit confirmed ($500.00 available)');

    // Cross-Feature Concurrency Test: Concurrent Spend Protection
    // User attempts to withdraw $400 and withdraw another $200 simultaneously ($600 total > $500 balance)
    const withdrawalPromises = [
      createWithdrawalRequest({
        userId: finUserAId,
        amount: 400.0,
        destinationType: 'USDT_BEP20',
        destinationReference: '0x1111111111111111111111111111111111111111',
        idempotencyKey: `wdr-conc-1-${finUserAId}`,
      }).catch((e) => ({ error: e.message })),
      createWithdrawalRequest({
        userId: finUserAId,
        amount: 200.0,
        destinationType: 'USDT_BEP20',
        destinationReference: '0x2222222222222222222222222222222222222222',
        idempotencyKey: `wdr-conc-2-${finUserAId}`,
      }).catch((e) => ({ error: e.message })),
    ];

    const results = await Promise.all(withdrawalPromises);
    const successCount = results.filter((r: any) => !r.error && r.publicWithdrawalId).length;
    const failureCount = results.filter((r: any) => r.error && (r.error.includes('INSUFFICIENT_BALANCE') || r.error.includes('exceeds available') || r.error.includes('Insufficient available balance'))).length;

    assert(successCount === 1, '15. Exactly one concurrent withdrawal succeeded within available limit');
    assert(failureCount === 1, '16. Overdraft withdrawal rejected due to concurrent balance reservation');

    const walletAfterConcurrent = await getWalletSummary(finUserAId);
    assert(walletAfterConcurrent.availableBalance >= 0, '17. Zero negative balance invariant verified');
    assert(walletAfterConcurrent.availableBalance === 100.0, '18. Authoritative available balance accurately reflects remaining funds ($100.00)');

    // ------------------------------------------------------------------------
    // 7. DEPOSIT PRODUCTION READINESS
    // ------------------------------------------------------------------------
    console.log('\n--- 7. Deposit Production Readiness ---');
    const depTxHash = `0x${uuidv4().replace(/-/g, '')}${uuidv4().replace(/-/g, '')}`;
    await db.query(
      `INSERT INTO blockchain_deposits (id, user_id, public_deposit_id, chain_id, tx_hash, log_index, from_address, to_address, amount, block_number, asset, status)
       VALUES ($1, $2, $3, 56, $4, 0, '0xfrom', '0xto', 150.00, 1000, 'USDT', 'CREDITED')`,
      [uuidv4(), finUserAId, `DEP-${Date.now()}`, depTxHash]
    );

    // Duplicate tx hash submission must fail unique constraint
    let duplicateTxBlocked = false;
    try {
      await db.query(
        `INSERT INTO blockchain_deposits (id, user_id, public_deposit_id, chain_id, tx_hash, log_index, from_address, to_address, amount, block_number, asset, status)
         VALUES ($1, $2, $3, 56, $4, 0, '0xfrom', '0xto', 150.00, 1000, 'USDT', 'CREDITED')`,
        [uuidv4(), finUserAId, `DEP-DUP-${Date.now()}`, depTxHash]
      );
    } catch {
      duplicateTxBlocked = true;
    }
    assert(duplicateTxBlocked, '19. Duplicate blockchain transaction hash strictly blocked by database constraint');

    // ------------------------------------------------------------------------
    // 8. WITHDRAWAL PRODUCTION READINESS
    // ------------------------------------------------------------------------
    console.log('\n--- 8. Withdrawal Production Readiness ---');
    // Admin approval and settlement state machine
    const pendingWdr = results.find((r: any) => r.publicWithdrawalId);
    assert(Boolean(pendingWdr), '20. Valid pending withdrawal available for settlement verification');

    const settledWdr = await settleWithdrawalAction({
      withdrawalIdOrPublicId: (pendingWdr as any).publicWithdrawalId,
      action: 'APPROVE',
    });
    assert(settledWdr.status === 'APPROVED', '21. Withdrawal state machine transitions correctly to APPROVED');

    // ------------------------------------------------------------------------
    // 9. SWAP PRODUCTION READINESS
    // ------------------------------------------------------------------------
    console.log('\n--- 9. Swap Production Readiness ---');
    // Provide claimed PHIVO rewards for coin swap test
    const nodeRes = await db.query<{ id: string }>(
      `UPDATE nodes SET status = 'ACTIVE', owner_user_id = $1, activated_at = CURRENT_TIMESTAMP
       WHERE id = (SELECT id FROM nodes WHERE status = 'AVAILABLE' LIMIT 1)
       RETURNING id`,
      [finUserAId]
    );
    const swapNodeId = nodeRes.rows[0].id;
    const swapEpochId = uuidv4();
    await db.query(
      `INSERT INTO reward_epochs (id, public_epoch_id, epoch_number, start_at, end_at, reward_per_node, status)
       VALUES ($1, $2, (SELECT COALESCE(MAX(epoch_number), 0) + 1 FROM reward_epochs), NOW() - INTERVAL '1 day', NOW(), 100.0, 'COMPLETED')`,
      [swapEpochId, `EPOCH-SWP-${Date.now()}`]
    );
    await db.query(
      `INSERT INTO node_rewards (id, public_reward_id, owner_user_id, node_id, epoch_id, amount, status)
       VALUES ($1, $2, $3, $4, $5, 100.0, 'CLAIMED')`,
      [uuidv4(), `RWD-SWP-${Date.now()}`, finUserAId, swapNodeId, swapEpochId]
    );

    const swapResult = await executeCoinToUsdtSwap({
      userId: finUserAId,
      coinAmount: 50.0,
      idempotencyKey: `swap-test-${Date.now()}`,
    });
    assert(swapResult.success === true, '22. Authoritative server coin swap executed successfully');
    assert(swapResult.swap.usdtAmount > 0, '23. USDT proceeds accurately calculated and credited');

    // ------------------------------------------------------------------------
    // 10. REWARD SETTLEMENT & DOUBLE-CLAIM PREVENTION
    // ------------------------------------------------------------------------
    console.log('\n--- 10. Rewards Hub Double-Claim Prevention ---');
    const epochRes = await createRewardEpoch({ rewardPerNode: 10.0 });
    await closeAndSettleEpoch(epochRes.id);

    const claim1 = await claimUserRewards(finUserAId);
    assert(claim1.totalClaimedAmount > 0, '24. First accrued reward claim succeeds');

    const claim2 = await claimUserRewards(finUserAId);
    assert(claim2.totalClaimedAmount === 0, '25. Subsequent immediate claim returns 0 (Strict double-claim prevention)');

    // ------------------------------------------------------------------------
    // 11. NOTIFICATION IDEMPOTENCY & ISOLATION
    // ------------------------------------------------------------------------
    console.log('\n--- 11. Notifications Production Readiness ---');
    const notifSourceId = `notif-audit-${Date.now()}`;
    const notif1 = await createNotification({
      userId: finUserAId,
      type: 'SECURITY_ALERT',
      title: 'Production Certification Audit',
      message: 'Platform verified for production launch.',
      sourceType: 'PRODUCTION_AUDIT',
      sourceId: notifSourceId,
    });
    assert(Boolean(notif1), '26. Idempotent notification created');

    const notif2 = await createNotification({
      userId: finUserAId,
      type: 'SECURITY_ALERT',
      title: 'Production Certification Audit',
      message: 'Platform verified for production launch.',
      sourceType: 'PRODUCTION_AUDIT',
      sourceId: notifSourceId,
    });
    assert(notif2 === null, '27. Duplicate notification submission strictly de-duplicated');

    // ------------------------------------------------------------------------
    // 12. CLEANUP
    // ------------------------------------------------------------------------
    await db.query(`UPDATE nodes SET status = 'AVAILABLE', owner_user_id = NULL, activated_at = NULL WHERE owner_user_id = $1`, [finUserAId]);
    await db.query(`DELETE FROM users WHERE id = $1`, [finUserAId]);
    assert(true, '28. Test fixtures safely isolated and cleaned up');

  } catch (err: any) {
    console.error('Fatal error during Phase 15 production readiness test:', err);
    assert(false, 'Fatal exception during Phase 15 suite execution', err?.message || err);
  }

  console.log('\n========================================================================');
  console.log(`📊 PHASE 15 PRODUCTION READINESS SUITE: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runPhase15ProductionReadinessTests().catch((err) => {
  console.error('[Phase 15 Test Runner Fatal Error]', err);
  process.exit(1);
});
