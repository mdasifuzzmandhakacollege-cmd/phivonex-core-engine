import { getDb } from '../src/server/db/db';
import { v4 as uuidv4 } from 'uuid';
import { executeEcosystemWalletTransfer, getWalletSummary, getWalletTransactions } from '../src/server/services/walletLedgerService';
import { executeAdminWalletAdjustment } from '../src/server/services/adminService';

async function runTest() {
  console.log('=== TEST: ECOSYSTEM WALLET TRANSFER ===\n');
  const db = await getDb();

  const testUserId = uuidv4();
  const randNum = Math.floor(100000 + Math.random() * 900000);
  const testAdminId = uuidv4();

  // Create test user and admin user
  await db.query(
    `INSERT INTO users (id, public_id, full_name, email, country, password_hash, status, created_at, updated_at)
     VALUES ($1, $2, 'Transfer Tester', $3, 'US', 'hash', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [testUserId, `PHX-TRF-${randNum}`, `trf_user_${randNum}@example.com`]
  );
  await db.query(
    `INSERT INTO users (id, public_id, full_name, email, country, password_hash, role, status, created_at, updated_at)
     VALUES ($1, $2, 'Admin Tester', $3, 'US', 'hash', 'ADMIN', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [testAdminId, `ADM-TEST-${randNum}`, `admin_trf_${randNum}@example.com`]
  );

  // 1. Credit $1,500 USDT via Admin Adjustment
  await executeAdminWalletAdjustment({
    adminUserId: testAdminId,
    adminPublicId: 'ADM-TEST-TRF',
    targetUserId: testUserId,
    amount: 1500,
    asset: 'USDT',
    direction: 'CREDIT',
    reason: 'Test Deposit Credit for Wallet Transfer',
  });

  const summary1 = await getWalletSummary(testUserId);
  console.log('1. User Initial Balance:', summary1.availableBalance, 'USDT');
  if (summary1.availableBalance < 1500) {
    throw new Error(`Expected $1500, got ${summary1.availableBalance}`);
  }

  // 2. Execute Ecosystem Transfer $1,000 from Main Wallet to Node Purchase Vault
  console.log('2. Executing Ecosystem Transfer of $1,000 USDT to Node Vault...');
  const transferRes = await executeEcosystemWalletTransfer(
    testUserId,
    'MAIN_WALLET',
    'NODE_VAULT',
    1000,
    'USDT'
  );

  console.log('✓ Transfer executed successfully:', transferRes);

  // 3. Verify ledger transactions
  const txs = await getWalletTransactions(testUserId, 1, 20);
  const transferTx = txs.transactions.find((t) => t.sourceType === 'WALLET_TRANSFER');
  if (!transferTx) {
    throw new Error('Could not find WALLET_TRANSFER entry in ledger');
  }
  console.log('✓ Verified WALLET_TRANSFER entry in ledger:', transferTx.description);

  console.log('\n=== ALL ECOSYSTEM WALLET TRANSFER TESTS PASSED! ===');
}

runTest().catch((err) => {
  console.error('❌ TEST FAILED:', err);
  process.exit(1);
});
