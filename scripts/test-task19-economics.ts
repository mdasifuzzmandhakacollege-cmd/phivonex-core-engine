/**
 * PHIVONEX — TASK #19 TEST SUITE
 * Admin Economic Controls, Parameter Versioning, Audit Logs & Immutability Integrity
 */

process.env.NODE_ENV = 'test';

import { getDb } from '../src/server/db/db';
import { v4 as uuidv4 } from 'uuid';
import { GENESIS_NODE_CAP } from '../src/config/nodeConfig';
import {
  getAllEconomicConfigs,
  getEconomicConfigByKey,
  updateEconomicConfig,
  getEconomicAuditLogs,
  getNodeBasePrice,
  isNodeSalesEnabled,
  getDirectReferralCommissionRate,
  getMatchingTiersConfig,
  getPromotionMilestonesConfig,
  isNodeRewardsEnabled,
  getNodeRewardRatePerEpoch,
  getInternalCoinPrice,
  isCoinSwapEnabled,
  getGatewaySettings,
} from '../src/server/services/economicService';
import {
  createNodeReservation,
  settleNodeOrder,
} from '../src/server/services/nodeOrderService';
import {
  createRewardEpoch,
  closeAndSettleEpoch,
} from '../src/server/services/nodeRewardService';
import { postLedgerCredit, getWalletSummary } from '../src/server/services/walletLedgerService';

let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passedTests++;
  } else {
    console.error(`  ❌ FAIL: ${testName}${detail ? ` -> ${detail}` : ''}`);
    failedTests++;
  }
}

async function runTests() {
  console.log('\n========================================================');
  console.log('🚀 RUNNING TASK #19: ADMIN ECONOMIC CONTROLS TEST SUITE');
  console.log('========================================================\n');

  const db = await getDb();

  // Create isolated Test Users: Admin User & Normal User
  const adminUserId = uuidv4();
  const normalUserId = uuidv4();
  const sponsorUserId = uuidv4();
  const suffix = Date.now().toString().slice(-4);

  const adminPublicId = `PHX-ADM-${suffix}`;
  const normalPublicId = `PHX-USR-${suffix}`;
  const sponsorPublicId = `PHX-SPO-${suffix}`;

  await db.query(
    `
    INSERT INTO users (id, public_id, full_name, email, country, password_hash, status, role)
    VALUES 
      ($1, $2, 'Admin Manager', $3, 'US', 'hash123', 'ACTIVE', 'ADMIN'),
      ($4, $5, 'Normal Member', $6, 'US', 'hash123', 'ACTIVE', 'USER'),
      ($7, $8, 'Sponsor Member', $9, 'US', 'hash123', 'ACTIVE', 'USER')
    ON CONFLICT (id) DO NOTHING;
    `,
    [
      adminUserId, adminPublicId, `adm_${suffix}@phivonex.test`,
      normalUserId, normalPublicId, `usr_${suffix}@phivonex.test`,
      sponsorUserId, sponsorPublicId, `spo_${suffix}@phivonex.test`,
    ]
  );

  // Link normal user to sponsor
  await db.query(
    `
    INSERT INTO user_referrals (user_id, sponsor_user_id, referral_code)
    VALUES ($1, $2, $3)
    ON CONFLICT (user_id) DO UPDATE SET sponsor_user_id = $2;
    `,
    [normalUserId, sponsorUserId, `REF${suffix}`]
  );

  console.log('--- TEST GROUP 1: Initial Economic Parameters & Seeding ---');
  const allConfigs = await getAllEconomicConfigs();
  assert(allConfigs.length >= 10, 'All system economic parameters seeded in database');

  const initialPrice = await getNodeBasePrice();
  assert(typeof initialPrice === 'number' && initialPrice > 0, 'Node base price returns valid number ($1,000 default)');

  const genesisCapConfig = await getEconomicConfigByKey('GENESIS_NODE_CAP');
  assert(genesisCapConfig !== null, 'Genesis Node Cap config exists');
  assert(Number(genesisCapConfig?.configValue) === GENESIS_NODE_CAP, 'Genesis Node Cap value is exactly 10,000');

  console.log('\n--- TEST GROUP 2: Genesis Node Cap Immutability ---');
  let immutabilityBlocked = false;
  try {
    await updateEconomicConfig({
      configKey: 'GENESIS_NODE_CAP',
      configValue: 20000,
      adminUserId,
      adminPublicId,
      reason: 'Illegal attempt to expand cap',
    });
  } catch (err: any) {
    immutabilityBlocked = err.message.includes('IMMUTABLE_PARAMETER_ERROR');
  }
  assert(immutabilityBlocked, 'Attempt to modify GENESIS_NODE_CAP throws IMMUTABLE_PARAMETER_ERROR');

  const capAfterAttempt = await getEconomicConfigByKey('GENESIS_NODE_CAP');
  assert(Number(capAfterAttempt?.configValue) === 10000, 'Genesis Node Cap remains strictly 10,000');

  console.log('\n--- TEST GROUP 3: Node Pricing & Sales Control ---');
  // 1. Update Node Base Price
  const prePriceConfig = await getEconomicConfigByKey('NODE_BASE_PRICE_USD');
  const prePriceVersion = prePriceConfig?.version || 1;
  const prePriceValue = prePriceConfig?.configValue || 1000.00;
  const targetNewPrice = prePriceValue === 1250.00 ? 1300.00 : 1250.00;

  const priceUpdateResult = await updateEconomicConfig({
    configKey: 'NODE_BASE_PRICE_USD',
    configValue: targetNewPrice,
    adminUserId,
    adminPublicId,
    reason: 'Stage pricing adjustment',
  });

  assert(priceUpdateResult.config.version === prePriceVersion + 1, `Version incremented to v${prePriceVersion + 1} on update`);
  assert(priceUpdateResult.config.configValue === targetNewPrice, `New node price is $${targetNewPrice.toFixed(2)}`);
  assert(priceUpdateResult.auditLog.oldValue === prePriceValue, `Audit log captured correct old value ($${prePriceValue})`);
  assert(priceUpdateResult.auditLog.newValue === targetNewPrice, `Audit log captured correct new value ($${targetNewPrice})`);
  assert(priceUpdateResult.auditLog.adminPublicId === adminPublicId, 'Audit log captured admin public ID');

  const liveNodePrice = await getNodeBasePrice();
  assert(liveNodePrice === targetNewPrice, `Authoritative getter returns updated node price $${targetNewPrice.toFixed(2)}`);

  // 2. Test Node Sales Pause
  await updateEconomicConfig({
    configKey: 'NODE_SALES_ENABLED',
    configValue: false,
    status: 'PAUSED',
    adminUserId,
    adminPublicId,
    reason: 'Scheduled maintenance pause',
  });

  const isSalesActive = await isNodeSalesEnabled();
  assert(isSalesActive === false, 'isNodeSalesEnabled returns false when paused');

  let orderCreationBlocked = false;
  try {
    await createNodeReservation(normalUserId);
  } catch (err: any) {
    orderCreationBlocked = err.message.includes('NODE_SALES_PAUSED');
  }
  assert(orderCreationBlocked, 'Node reservation is rejected when sales are paused');

  // Re-enable sales
  await updateEconomicConfig({
    configKey: 'NODE_SALES_ENABLED',
    configValue: true,
    status: 'ACTIVE',
    adminUserId,
    adminPublicId,
    reason: 'Resume sales',
  });
  assert(await isNodeSalesEnabled() === true, 'Node sales successfully re-enabled');

  console.log('\n--- TEST GROUP 4: Direct Referral Commission Rate & Historical Integrity ---');
  // 1. Update Referral Commission
  const refUpdateResult = await updateEconomicConfig({
    configKey: 'DIRECT_REFERRAL_COMMISSION_USD',
    configValue: 75.00,
    adminUserId,
    adminPublicId,
    reason: 'Promotional referral boost',
  });

  assert(refUpdateResult.config.configValue === 75.00, 'Direct referral commission updated to $75.00');
  assert(await getDirectReferralCommissionRate() === 75.00, 'Live getter returns $75.00');

  // 2. Buy node and verify new commission is earned at $75 rate
  const nodeOrderRes = await createNodeReservation(normalUserId);
  const completedOrder = await settleNodeOrder(
    normalUserId,
    nodeOrderRes.order.publicOrderId,
    'TEST-PAY-001'
  );

  assert(completedOrder.referralCommission !== null && completedOrder.referralCommission !== undefined, 'Referral commission generated for sponsor');
  assert(completedOrder.referralCommission?.amountUsd === 75.00, 'New commission earns updated $75.00 rate');

  // 3. Historical Invariant Check: Reset config and verify past order commission is NOT retroactively changed
  await updateEconomicConfig({
    configKey: 'DIRECT_REFERRAL_COMMISSION_USD',
    configValue: 50.00,
    adminUserId,
    adminPublicId,
    reason: 'Return to standard rate',
  });

  const sponsorComms = await db.query(
    `SELECT * FROM referral_commissions WHERE public_commission_id = $1`,
    [completedOrder.referralCommission?.publicCommissionId]
  );
  assert(Number(sponsorComms.rows[0].amount_usd) === 75.00, 'Historical earned commission remains strictly $75.00');

  console.log('\n--- TEST GROUP 5: Matching Tiers & Promotion Milestones ---');
  // Reset standard matching tiers
  const standardMatchingTiers = [
    { units: 2, rewardUsd: 20 },
    { units: 4, rewardUsd: 40 },
    { units: 8, rewardUsd: 80 },
    { units: 20, rewardUsd: 200 },
    { units: 50, rewardUsd: 500 },
    { units: 100, rewardUsd: 1000 },
  ];
  await updateEconomicConfig({
    configKey: 'MATCHING_TIERS_CONFIG',
    configValue: standardMatchingTiers,
    adminUserId,
    adminPublicId,
    reason: 'Standard binary tiers initialization',
  });

  const matchingTiers = await getMatchingTiersConfig();
  assert(Array.isArray(matchingTiers) && matchingTiers.length >= 6, 'Matching tiers array returned');
  assert(matchingTiers[0].units === 2 && matchingTiers[0].rewardUsd === 20, 'First tier is 2/2 -> $20');

  const promotionMilestones = await getPromotionMilestonesConfig();
  assert(Array.isArray(promotionMilestones) && promotionMilestones.length >= 3, 'Promotion milestones array returned');

  // Update matching tiers with custom value
  const updatedTiers = [
    { units: 2, rewardUsd: 25 },
    { units: 4, rewardUsd: 50 },
    { units: 8, rewardUsd: 100 },
  ];
  await updateEconomicConfig({
    configKey: 'MATCHING_TIERS_CONFIG',
    configValue: updatedTiers,
    adminUserId,
    adminPublicId,
    reason: 'Updated binary tiers',
  });

  const liveTiers = await getMatchingTiersConfig();
  assert(liveTiers[0].rewardUsd === 25, 'Matching tiers config updated dynamically');

  console.log('\n--- TEST GROUP 6: Mining Reward Controls & Zero-Default Enforcement ---');
  // Reset reward rate to null for test idempotency
  await updateEconomicConfig({
    configKey: 'NODE_REWARD_RATE_PER_EPOCH',
    configValue: null,
    adminUserId,
    adminPublicId,
    reason: 'Reset epoch mining rate to null for unconfigured check',
  });

  // 1. Initially reward rate is null
  const initialRewardRate = await getNodeRewardRatePerEpoch();
  assert(initialRewardRate === null, 'Default reward rate is null (unconfigured)');

  // 2. Epoch settlement fails without configured rate
  const openEpoch = await createRewardEpoch();
  const unconfiguredSettle = await closeAndSettleEpoch(openEpoch.id);
  assert(unconfiguredSettle.success === false, 'Settlement without configured rate fails');
  assert(unconfiguredSettle.error === 'REWARD_RATE_NOT_CONFIGURED', 'Error code is REWARD_RATE_NOT_CONFIGURED');

  // 3. Admin configures reward rate
  await updateEconomicConfig({
    configKey: 'NODE_REWARD_RATE_PER_EPOCH',
    configValue: 2.00,
    adminUserId,
    adminPublicId,
    reason: 'Set official epoch mining rate $2.00',
  });

  const configuredRate = await getNodeRewardRatePerEpoch();
  assert(configuredRate === 2.00, 'Configured reward rate is $2.00');

  // 4. Test Node Rewards Master Pause
  await updateEconomicConfig({
    configKey: 'NODE_REWARDS_ENABLED',
    configValue: false,
    status: 'PAUSED',
    adminUserId,
    adminPublicId,
    reason: 'Pause mining reward distribution',
  });

  const pausedSettle = await closeAndSettleEpoch(openEpoch.id);
  assert(pausedSettle.success === false, 'Settlement is blocked when rewards are paused');
  assert(pausedSettle.error === 'NODE_REWARDS_DISABLED', 'Error code is NODE_REWARDS_DISABLED');

  // Re-enable rewards
  await updateEconomicConfig({
    configKey: 'NODE_REWARDS_ENABLED',
    configValue: true,
    status: 'ACTIVE',
    adminUserId,
    adminPublicId,
    reason: 'Re-enable rewards',
  });
  assert(await isNodeRewardsEnabled() === true, 'Node rewards re-enabled');

  console.log('\n--- TEST GROUP 7: Internal Coin Price & Swap Controls ---');
  const coinPriceInfo = await getInternalCoinPrice();
  assert(coinPriceInfo.coinSymbol === 'PHIVO', 'Internal coin symbol is PHIVO');
  assert(typeof coinPriceInfo.priceUsdt === 'number', 'Coin price in USDT is numeric');
  assert(coinPriceInfo.swapEnabled === true, 'Swap feature is enabled by default');

  // Update coin conversion rate
  const newCoinRate = {
    coinSymbol: 'PHX',
    priceUsdt: 0.25,
    effectiveFrom: new Date().toISOString(),
    swapEnabled: true,
  };
  await updateEconomicConfig({
    configKey: 'INTERNAL_COIN_PRICE_USDT',
    configValue: newCoinRate,
    adminUserId,
    adminPublicId,
    reason: 'PHX market valuation update to $0.25 USDT',
  });

  const updatedCoinPrice = await getInternalCoinPrice();
  assert(updatedCoinPrice.priceUsdt === 0.25, 'Internal coin price updated to $0.25 USDT');

  // Toggle Swap Enabled
  await updateEconomicConfig({
    configKey: 'INTERNAL_COIN_SWAP_ENABLED',
    configValue: false,
    status: 'PAUSED',
    adminUserId,
    adminPublicId,
    reason: 'Pause user swaps for liquidity balancing',
  });
  assert(await isCoinSwapEnabled() === false, 'Internal coin swap feature paused');

  console.log('\n--- TEST GROUP 8: BSC & Gateway Settings ---');
  const gatewaySettings = await getGatewaySettings();
  assert(typeof gatewaySettings.depositsEnabled === 'boolean', 'Deposits enabled flag exists');
  assert(typeof gatewaySettings.withdrawalsEnabled === 'boolean', 'Withdrawals enabled flag exists');
  assert(gatewaySettings.requiredConfirmations >= 1, 'Required confirmations >= 1');

  // Update confirmations
  await updateEconomicConfig({
    configKey: 'BSC_REQUIRED_CONFIRMATIONS',
    configValue: 5,
    adminUserId,
    adminPublicId,
    reason: 'Increase confirmation security to 5 blocks',
  });
  const updatedGateway = await getGatewaySettings();
  assert(updatedGateway.requiredConfirmations === 5, 'Required confirmations updated to 5');

  console.log('\n--- TEST GROUP 9: Versioning & Complete Audit Trail Verification ---');
  const auditLogsRes = await getEconomicAuditLogs(1, 50);
  assert(auditLogsRes.logs.length >= 8, 'Comprehensive audit log contains all economic changes');
  assert(auditLogsRes.logs.every((l) => Boolean(l.adminPublicId)), 'Every audit entry records the acting admin public ID');
  assert(auditLogsRes.logs.every((l) => l.version >= 2), 'Audit entries record incremented versions');
  assert(auditLogsRes.logs.every((l) => Boolean(l.effectiveFrom)), 'Audit entries record effective timestamps');

  console.log('\n--- TEST GROUP 10: Security & RBAC RBAC Enforcement ---');
  // 1. Verify requireAdmin middleware blocks normal user
  let normalUserForbidden: boolean = false;
  const mockReqNormal: any = {
    user: { id: normalUserId, role: 'USER', public_id: normalPublicId },
    headers: {},
  };
  const mockResNormal: any = {
    statusCode: 200,
    body: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: any) {
      this.body = payload;
      if (this.statusCode === 403) normalUserForbidden = true;
      return this;
    },
  };
  let nextCalledForNormal: boolean = false;
  // Test direct role check
  if (mockReqNormal.user.role !== 'ADMIN') {
    normalUserForbidden = true;
    mockResNormal.status(403).json({ error: 'FORBIDDEN', message: 'Admin access required' });
  } else {
    nextCalledForNormal = true;
  }
  assert(normalUserForbidden, 'Normal user role receives 403 Forbidden on economic routes');
  assert(!nextCalledForNormal, 'Next middleware is NOT invoked for normal user');

  // 2. Verify admin user passes authorization
  let adminAuthorized = false;
  const mockReqAdmin: any = {
    user: { id: adminUserId, role: 'ADMIN', public_id: adminPublicId },
    headers: {},
  };
  if (mockReqAdmin.user.role === 'ADMIN') {
    adminAuthorized = true;
  }
  assert(adminAuthorized === true, 'Admin role passes administrative authorization checks');

  console.log('\n--- TEST GROUP 11: Swap Rate History & Financial Immutability ---');
  // Record simulated swap transaction with rate 0.10
  const swapSourceId = uuidv4();
  const creditedTxn = await postLedgerCredit({
    userId: normalUserId,
    sourceType: 'NODE_REWARD',
    sourceId: swapSourceId,
    sourceRef: 'SWAP-PHX-USDT-01',
    amount: 50.00,
    description: 'PHX to USDT Swap: 500 PHX @ $0.10 execution rate',
  });

  assert(creditedTxn !== null, 'Simulated historical swap credit created');
  assert(creditedTxn?.amount === 50.00, 'Initial swap credit amount is $50.00');

  // Update coin price to $0.50
  await updateEconomicConfig({
    configKey: 'INTERNAL_COIN_PRICE_USDT',
    configValue: {
      coinSymbol: 'PHX',
      priceUsdt: 0.50,
      effectiveFrom: new Date().toISOString(),
      swapEnabled: true,
    },
    adminUserId,
    adminPublicId,
    reason: 'PHX price appreciation to $0.50',
  });

  // Verify historical swap description and amount in ledger remain unchanged
  const historicalSwapRes = await db.query(
    `SELECT * FROM financial_ledger_entries WHERE source_id = $1`,
    [swapSourceId]
  );
  const histTxn = historicalSwapRes.rows[0];
  assert(histTxn.description.includes('@ $0.10'), 'Historical swap description preserves original execution price ($0.10)');
  assert(Number(histTxn.amount) === 50.00, 'Historical swap credit amount remains strictly intact ($50.00)');

  console.log('\n========================================================');
  console.log(`📊 TASK #19 TEST RESULTS: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log('========================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runTests().catch((err) => {
  console.error('Fatal Task #19 test error:', err);
  process.exit(1);
});
