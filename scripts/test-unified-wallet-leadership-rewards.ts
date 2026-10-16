import { getDb } from '../src/server/db/db';
import { v4 as uuidv4 } from 'uuid';
import { executeAdminWalletAdjustment } from '../src/server/services/adminService';
import { validateUserNodePurchaseBalances, processNodePurchaseWithAssetBalance } from '../src/server/services/nodePurchaseBalanceService';
import { getWalletSummary, getWalletTransactions } from '../src/server/services/walletLedgerService';
import { getPromotionRules, updatePromotionRule } from '../src/server/services/leadershipRankService';
import { getTransactionDisplayLabel, getTransactionUserDescription } from '../src/utils/transactionDisplay';

async function runTest() {
  console.log('=== TEST: UNIFIED USDT WALLET + ACCOUNT CREDIT LABEL + LEADERSHIP NON-CASH REWARDS ===\n');
  const db = await getDb();

  // Clean / setup test user and admin
  const randNum = Math.floor(100000 + Math.random() * 900000);
  const testAdminId = uuidv4();
  const testAdminPublicId = `ADM-TEST-${randNum}`;
  const testUserId1 = uuidv4();
  const testUserPublicId1 = `USR-TEST-U1-${randNum}`;
  const testUserId2 = uuidv4();
  const testUserPublicId2 = `USR-TEST-U2-${randNum}`;

  await db.query(
    `INSERT INTO users (id, public_id, email, password_hash, full_name, country, role, status, created_at, updated_at)
     VALUES 
       ($1, $2, $3, 'hash', 'Test Admin', 'US', 'ADMIN', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
       ($4, $5, $6, 'hash', 'Test User 1', 'US', 'MEMBER', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
       ($7, $8, $9, 'hash', 'Test User 2', 'US', 'MEMBER', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT (id) DO NOTHING`,
    [
      testAdminId, testAdminPublicId, `admin-${randNum}@example.com`,
      testUserId1, testUserPublicId1, `user1-${randNum}@example.com`,
      testUserId2, testUserPublicId2, `user2-${randNum}@example.com`,
    ]
  );

  console.log('1. Checking Centralized Transaction Display Mappings...');
  if (getTransactionDisplayLabel('ADMIN_ADJUSTMENT', 'CREDIT') !== 'Account Credit') {
    throw new Error('Display label for ADMIN_ADJUSTMENT CREDIT must be "Account Credit"');
  }
  if (getTransactionDisplayLabel('ADMIN_ADJUSTMENT', 'DEBIT') !== 'Account Debit') {
    throw new Error('Display label for ADMIN_ADJUSTMENT DEBIT must be "Account Debit"');
  }
  if (getTransactionDisplayLabel('BLOCKCHAIN_DEPOSIT') !== 'USDT Deposit') {
    throw new Error('Display label for BLOCKCHAIN_DEPOSIT must be "USDT Deposit"');
  }
  if (getTransactionDisplayLabel('NODE_PURCHASE') !== 'Genesis Node Purchase') {
    throw new Error('Display label for NODE_PURCHASE must be "Genesis Node Purchase"');
  }
  const sanitizedDesc = getTransactionUserDescription({
    sourceType: 'ADMIN_ADJUSTMENT',
    entryType: 'CREDIT',
    description: 'Admin Adjustment (CREDIT): Secret Internal Reason',
  });
  if (sanitizedDesc !== 'Account Credit') {
    throw new Error(`Sanitized description for user should be "Account Credit", got: ${sanitizedDesc}`);
  }
  console.log('✓ Transaction display mappings verified.\n');

  console.log('2. Testing Unified USDT Balance for Node Purchase ($0 Deposit + $1,000 Admin Credit)...');
  // Credit User 1 with $1,000 USDT via Admin Adjustment (Internal source_type = ADMIN_ADJUSTMENT)
  const adjustResult = await executeAdminWalletAdjustment({
    adminUserId: testAdminId,
    adminPublicId: testAdminPublicId,
    targetUserId: testUserId1,
    direction: 'CREDIT',
    asset: 'USDT',
    amount: 1000,
    reason: 'Enterprise seed funding grant',
    ipAddress: '127.0.0.1',
  });

  // Check that financial ledger entry in DB has source_type = 'ADMIN_ADJUSTMENT'
  const fleRes = await db.query<any>(
    `SELECT source_type, entry_type, description FROM financial_ledger_entries WHERE public_txn_id = $1`,
    [adjustResult.transaction.publicTxnId]
  );
  if (fleRes.rows[0]?.source_type !== 'ADMIN_ADJUSTMENT') {
    throw new Error(`Internal source_type in financial_ledger_entries must remain ADMIN_ADJUSTMENT, got: ${fleRes.rows[0]?.source_type}`);
  }

  // Check wallet summary
  const summary1 = await getWalletSummary(testUserId1);
  console.log(`User 1 available balance: $${summary1.availableBalance} USDT`);
  if (summary1.availableBalance < 1000) {
    throw new Error(`Expected available balance >= 1000, got ${summary1.availableBalance}`);
  }

  // Check user transaction presentation
  const txList1 = await getWalletTransactions(testUserId1, 1, 10);
  const adjustmentTx = txList1.transactions.find((t) => t.sourceType === 'ADMIN_ADJUSTMENT');
  if (!adjustmentTx) {
    throw new Error('Could not find ADMIN_ADJUSTMENT in financial ledger transactions');
  }
  if (adjustmentTx.description !== 'Account Credit') {
    throw new Error(`Expected user description "Account Credit", got "${adjustmentTx.description}"`);
  }
  console.log(`✓ User transaction correctly presented as "${adjustmentTx.description}" with internal source_type "${adjustmentTx.sourceType}"`);

  // Validate Node purchase eligibility with $0 blockchain deposit
  const balValidation1 = await validateUserNodePurchaseBalances(testUserId1);
  console.log('Node balance validation result for User 1:', balValidation1.usdtBalance);
  if (!balValidation1.canActivateWithUsdt) {
    throw new Error('User 1 should be eligible to activate node using unified USDT balance');
  }

  // Execute Node Purchase using the unified USDT balance
  const purchaseResult1 = await processNodePurchaseWithAssetBalance(testUserId1, 'USDT');
  console.log(`✓ Node purchase successful! Order ID: ${purchaseResult1.order.publicOrderId}, Node: ${purchaseResult1.node.publicNodeId}`);
  
  const summary1After = await getWalletSummary(testUserId1);
  console.log(`User 1 remaining balance after node purchase: $${summary1After.availableBalance} USDT`);
  if (summary1After.availableBalance !== 0) {
    throw new Error(`Expected remaining balance 0, got ${summary1After.availableBalance}`);
  }

  console.log('\n3. Testing Mixed Funding ($500 Blockchain Deposit + $500 Account Credit)...');
  // Credit $500 Blockchain Deposit for User 2
  await db.query(
    `INSERT INTO blockchain_deposits (
       id, public_deposit_id, user_id, asset, amount, tx_hash,
       from_address, to_address, block_number, status, confirmations,
       credited_at, created_at, updated_at
     ) VALUES (
       $1, $2, $3, 'USDT', 500, $4,
       '0xsender', '0xrecipient', 123456, 'CREDITED', 15,
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
     )`,
    [uuidv4(), `DEP-TEST-${randNum}`, testUserId2, `0xmocktx_${randNum}`]
  );

  // Credit $500 via Admin Adjustment
  await executeAdminWalletAdjustment({
    adminUserId: testAdminId,
    adminPublicId: testAdminPublicId,
    targetUserId: testUserId2,
    direction: 'CREDIT',
    asset: 'USDT',
    amount: 500,
    reason: 'Co-funding match promotion',
    ipAddress: '127.0.0.1',
  });

  const summary2 = await getWalletSummary(testUserId2);
  console.log(`User 2 unified balance: $${summary2.availableBalance} USDT`);
  if (summary2.availableBalance < 1000) {
    throw new Error(`Expected mixed balance >= 1000, got ${summary2.availableBalance}`);
  }

  // Purchase node with mixed funding
  const purchaseResult2 = await processNodePurchaseWithAssetBalance(testUserId2, 'USDT');
  console.log(`✓ Mixed funding node purchase successful! Order: ${purchaseResult2.order.publicOrderId}`);
  const summary2After = await getWalletSummary(testUserId2);
  console.log(`User 2 remaining balance: $${summary2After.availableBalance} USDT`);
  if (summary2After.availableBalance !== 0) {
    throw new Error(`Expected remaining balance 0, got ${summary2After.availableBalance}`);
  }

  console.log('\n4. Testing Leadership & Rank Reward Flexibility (USDT vs NON_CASH)...');
  const rules = await getPromotionRules();
  const nodeCaptainRule = rules.find((r) => r.rankKey === 'NODE_CAPTAIN');
  if (!nodeCaptainRule) {
    throw new Error('Could not find NODE_CAPTAIN rule');
  }

  // Update NODE_CAPTAIN to Non-Cash reward: "International Tour & Luxury Retreat"
  console.log(`Current NODE_CAPTAIN rule version: v${nodeCaptainRule.version}, rewardUsd: $${nodeCaptainRule.rewardUsd}`);
  const updatedCaptainRule = await updatePromotionRule(
    testAdminId,
    testAdminPublicId,
    nodeCaptainRule.id,
    {
      expectedVersion: nodeCaptainRule.version,
      rewardType: 'NON_CASH',
      rewardTitle: 'International Tour & Luxury Retreat',
      rewardDescription: 'All-inclusive 7-day executive retreat for two guests with VIP gala pass.',
      rewardDisplayValueUsd: 15000,
      reason: 'Upgrading Node Captain to International Luxury Tour recognition tier',
    }
  );

  console.log('✓ Successfully updated NODE_CAPTAIN rule:');
  console.log(`  rewardType: ${updatedCaptainRule.rewardType}`);
  console.log(`  rewardTitle: ${updatedCaptainRule.rewardTitle}`);
  console.log(`  rewardDisplayValueUsd: $${updatedCaptainRule.rewardDisplayValueUsd}`);
  console.log(`  rewardUsd (wallet payout): $${updatedCaptainRule.rewardUsd}`);
  if (updatedCaptainRule.rewardUsd !== 0) {
    throw new Error('Non-cash reward must have rewardUsd = 0 so no cash is credited');
  }

  // Update NODE_COMMANDER to Non-Cash "Executive Car Reward"
  const nodeCommanderRule = rules.find((r) => r.rankKey === 'NODE_COMMANDER');
  if (nodeCommanderRule) {
    const updatedCommanderRule = await updatePromotionRule(
      testAdminId,
      testAdminPublicId,
      nodeCommanderRule.id,
      {
        expectedVersion: nodeCommanderRule.version,
        rewardType: 'NON_CASH',
        rewardTitle: 'Executive Luxury Car Reward',
        rewardDescription: 'Brand new luxury sedan fully titled with executive recognition plaque.',
        rewardDisplayValueUsd: 65000,
        reason: 'Adding Executive Luxury Car Reward tier for Node Commanders',
      }
    );
    console.log(`✓ Successfully updated NODE_COMMANDER rule to ${updatedCommanderRule.rewardTitle} (Est. $${updatedCommanderRule.rewardDisplayValueUsd})`);
  }

  console.log('\n=== ALL AUDIT & FEATURE CHECKS PASSED SUCCESSFULLY! ===');
  process.exit(0);
}

runTest().catch((err) => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
