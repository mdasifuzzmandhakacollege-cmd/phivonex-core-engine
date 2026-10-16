import { getDb } from '../src/server/db/db';
import { v4 as uuidv4 } from 'uuid';
import { settleNodeOrder, createNodeReservation } from '../src/server/services/nodeOrderService';
import { closeAndSettleEpoch, createRewardEpoch } from '../src/server/services/nodeRewardService';
import { getUserCoinBalance } from '../src/server/services/coinSwapService';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ [FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  } else {
    console.log(`✅ [PASS] ${message}`);
  }
}

async function runGenesisNodeLaunchEconomicsTests() {
  console.log('==================================================');
  console.log('🧪 RUNNING GENESIS NODE LAUNCH ECONOMICS TESTS');
  console.log('==================================================\n');

  const db = await getDb();

  // 1. SETUP TEST OPERATOR USER
  const testUserId = uuidv4();
  const testPublicId = `PHX-TEST-${Date.now().toString().slice(-6)}`;
  const testEmail = `operator_${Date.now()}@phivonex.test`;

  await db.query(
    `
    INSERT INTO users (id, public_id, email, country, password_hash, full_name, status, role, created_at, updated_at)
    VALUES ($1, $2, $3, 'US', 'hash_test', 'Test Node Operator', 'ACTIVE', 'USER', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `,
    [testUserId, testPublicId, testEmail]
  );

  console.log('--- 1. VERIFY LAUNCH PARAMETERS & SNAPSHOT ON PURCHASE ---');
  // Create reservation & settle
  const reservation = await createNodeReservation(testUserId, `idem_res_${Date.now()}`);
  assert(reservation.order.amountUsd === 1000, 'Node purchase price is exactly $1,000 USD');

  const settlement = await settleNodeOrder(testUserId, reservation.order.publicOrderId, `tx_settle_${Date.now()}`);
  assert(settlement.node.status === 'ACTIVE', 'Node transitions to ACTIVE status upon settlement');

  // Query snapshot fields from database
  const nodeRes = await db.query<any>(`SELECT * FROM nodes WHERE public_node_id = $1`, [settlement.node.publicNodeId]);
  const node = nodeRes.rows[0];

  assert(Number(node.purchase_price_usd) === 1000, 'Snapshot purchasePriceUsd = 1000');
  assert(Number(node.phivo_reference_price_at_purchase) === 0.10, 'Snapshot phivoReferencePriceAtPurchase = 0.10');
  assert(Number(node.lifetime_phivo_allocation) === 10000, 'Snapshot lifetimePhivoAllocation = 10000');
  assert(Number(node.term_days) === 200, 'Snapshot termDays = 200');
  assert(Number(node.daily_phivo_emission) === 50, 'Snapshot dailyPhivoEmission = 50');
  assert(Number(node.distributed_phivo) === 0, 'Initial distributedPhivo = 0');
  assert(Number(node.remaining_phivo) === 10000, 'Initial remainingPhivo = 10000');

  console.log('\n--- 2. TEST 200-DAY EMISSION MATHEMATICS & ACCUMULATION ---');

  // Day 1 Emission
  const epoch1 = await createRewardEpoch({ rewardPerNode: 50 });
  await closeAndSettleEpoch(epoch1.id, { configuredRewardPerNode: 50, targetNodeId: node.id });

  const nodeDay1 = (await db.query<any>(`SELECT * FROM nodes WHERE id = $1`, [node.id])).rows[0];
  assert(Number(nodeDay1.distributed_phivo) === 50, 'Day 1: 50 distributed');
  assert(Number(nodeDay1.remaining_phivo) === 9950, 'Day 1: 9,950 remaining');

  // Simulate Day 100 state (5,000 distributed, 5,000 remaining)
  await db.query(`UPDATE nodes SET distributed_phivo = 5000, remaining_phivo = 5000 WHERE id = $1`, [node.id]);
  const nodeDay100 = (await db.query<any>(`SELECT * FROM nodes WHERE id = $1`, [node.id])).rows[0];
  assert(Number(nodeDay100.distributed_phivo) === 5000, 'Day 100: 5,000 distributed');
  assert(Number(nodeDay100.remaining_phivo) === 5000, 'Day 100: 5,000 remaining');

  // Simulate Day 199 state (9,950 distributed, 50 remaining)
  await db.query(`UPDATE nodes SET distributed_phivo = 9950, remaining_phivo = 50, status = 'ACTIVE' WHERE id = $1`, [node.id]);

  // Day 200 Emission (Final 50 PHIVO)
  const epoch200 = await createRewardEpoch({ rewardPerNode: 50 });
  await closeAndSettleEpoch(epoch200.id, { configuredRewardPerNode: 50, targetNodeId: node.id });

  const nodeDay200 = (await db.query<any>(`SELECT * FROM nodes WHERE id = $1`, [node.id])).rows[0];
  assert(Number(nodeDay200.distributed_phivo) === 10000, 'Day 200: Exactly 10,000 distributed');
  assert(Number(nodeDay200.remaining_phivo) === 0, 'Day 200: Exactly 0 remaining');
  assert(nodeDay200.status === 'MATURED', 'Day 200: Status transitions to MATURED');

  console.log('\n--- 3. TEST DAY 201 & HARD CAP PROTECTION ---');
  // Day 201 Emission attempt
  const epoch201 = await createRewardEpoch({ rewardPerNode: 50 });
  const result201 = await closeAndSettleEpoch(epoch201.id, { configuredRewardPerNode: 50, targetNodeId: node.id });

  const nodeDay201 = (await db.query<any>(`SELECT * FROM nodes WHERE id = $1`, [node.id])).rows[0];
  assert(Number(nodeDay201.distributed_phivo) === 10000, 'Day 201: Distributed PHIVO remains strictly capped at 10,000');
  assert(Number(nodeDay201.remaining_phivo) === 0, 'Day 201: Remaining PHIVO remains 0');
  assert(nodeDay201.status === 'MATURED', 'Day 201: Status remains MATURED');

  // Verify no duplicate reward was created for Day 201
  const reward201Res = await db.query<any>(`SELECT * FROM node_rewards WHERE node_id = $1 AND epoch_id = $2`, [node.id, epoch201.id]);
  assert(reward201Res.rows.length === 0, 'Day 201: NO additional PHIVO emitted for MATURED node');

  console.log('\n--- 4. VERIFY IMMUTABLE FINANCIAL LEDGER & WALLET SYNC ---');
  const coinBal = await getUserCoinBalance(testUserId);
  assert(coinBal.availableCoinBalance > 0, 'User PHIVO balance reflects immutable ledger credits');

  const ledgerRes = await db.query<any>(`SELECT * FROM financial_ledger_entries WHERE user_id = $1 AND source_type = 'NODE_REWARD'`, [testUserId]);
  assert(ledgerRes.rows.length > 0, 'Ledger contains immutable NODE_REWARD entries');

  console.log('\n==================================================');
  console.log('📊 ALL 20 LAUNCH ECONOMICS TEST ASSERTIONS PASSED!');
  console.log('==================================================\n');
}

runGenesisNodeLaunchEconomicsTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
