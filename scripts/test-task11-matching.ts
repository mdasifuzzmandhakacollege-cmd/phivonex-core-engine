import { getDb } from '../src/server/db/db';
import { v4 as uuidv4 } from 'uuid';
import {
  calculateMatchingDecomposition,
  settleUserMatchingForDate,
  runDailyMatchingSettlementCycle,
  getUserMatchingSummary,
  getUserMatchingHistory,
  reverseMatchingSettlement,
  MATCHING_TIERS,
} from '../src/server/services/binaryMatchingService';
import { getDhakaBusinessDate, getPreviousDhakaBusinessDate } from '../src/server/utils/timezone';

async function runTask11MatchingTests() {
  console.log('==================================================');
  console.log('🧪 RUNNING TASK #11: DAILY BINARY MATCHING SETTLEMENT ENGINE TESTS');
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
  async function createTestUser(tag: string): Promise<{ id: string; publicId: string }> {
    const id = uuidv4();
    const publicId = `PX-${tag.toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const email = `test-${tag}-${Date.now()}-${Math.random()}@phivonex.test`;
    await db.query(
      `INSERT INTO users (id, public_id, full_name, email, country, password_hash, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'Bangladesh', 'hash_test', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [id, publicId, `Test ${tag}`, email]
    );
    await db.query(
      `INSERT INTO user_referrals (user_id, referral_code, created_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP)`,
      [id, `REF${Math.floor(100000 + Math.random() * 900000)}`]
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

  // Helper to get an active Genesis Node
  async function createActiveNode(ownerId: string): Promise<string> {
    const nodeRes = await db.query<{ id: string }>(
      `SELECT id FROM nodes WHERE status = 'AVAILABLE' ORDER BY node_number ASC LIMIT 1`
    );
    if (nodeRes.rows.length === 0) {
      // Fallback: create fresh node
      const freshId = uuidv4();
      await db.query(
        `INSERT INTO nodes (id, public_node_id, node_number, owner_user_id, status, activated_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [freshId, `ND-${Math.floor(100000 + Math.random() * 900000)}`, Math.floor(20000 + Math.random() * 70000), ownerId]
      );
      return freshId;
    }
    const nodeId = nodeRes.rows[0].id;
    await db.query(
      `UPDATE nodes 
       SET status = 'ACTIVE', owner_user_id = $1, activated_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [ownerId, nodeId]
    );
    return nodeId;
  }

  // ==========================================================================
  // SUITE 1: Pure Matching Tier Decomposition Tests (Greedy Largest-to-Smallest)
  // ==========================================================================
  console.log('--- Suite 1: Pure Matching Tier Decomposition ---');

  // Case 1A: 12 Left / 10 Right -> 8/8 ($2,000) + 2/2 ($500) = $2,500, Carry L 2 / R 0
  const d1 = calculateMatchingDecomposition(12, 10);
  assert(
    d1.totalBonusUsd === 2500 &&
    d1.consumedLeft === 10 &&
    d1.consumedRight === 10 &&
    d1.carryLeftAfter === 2 &&
    d1.carryRightAfter === 0 &&
    d1.components.length === 2 &&
    d1.components[0].tierUnits === 8 &&
    d1.components[0].bonusUsd === 2000 &&
    d1.components[1].tierUnits === 2 &&
    d1.components[1].bonusUsd === 500,
    '1A: 12 Left / 10 Right decomposes to 8/8 ($2,000) + 2/2 ($500) = $2,500, Carry L 2 / R 0'
  );

  // Case 1B: 55 Left / 53 Right -> 50/50 ($6,000) + 2/2 ($500) = $6,500, Carry L 3 / R 1
  const d2 = calculateMatchingDecomposition(55, 53);
  assert(
    d2.totalBonusUsd === 6500 &&
    d2.consumedLeft === 52 &&
    d2.consumedRight === 52 &&
    d2.carryLeftAfter === 3 &&
    d2.carryRightAfter === 1 &&
    d2.components.length === 2 &&
    d2.components[0].tierUnits === 50 &&
    d2.components[0].bonusUsd === 6000 &&
    d2.components[1].tierUnits === 2 &&
    d2.components[1].bonusUsd === 500,
    '1B: 55 Left / 53 Right decomposes to 50/50 ($6,000) + 2/2 ($500) = $6,500, Carry L 3 / R 1'
  );

  // Case 1C: 5 Left / 1 Right -> No matchable tier (< 2/2), $0, Carry L 5 / R 1
  const d3 = calculateMatchingDecomposition(5, 1);
  assert(
    d3.totalBonusUsd === 0 &&
    d3.consumedLeft === 0 &&
    d3.consumedRight === 0 &&
    d3.carryLeftAfter === 5 &&
    d3.carryRightAfter === 1 &&
    d3.components.length === 0,
    '1C: 5 Left / 1 Right yields $0 bonus and preserves full Carry L 5 / R 1'
  );

  // Case 1D: 105 Left / 105 Right -> 100/100 ($10,000) + 4/4 ($1,000) = $11,000, Carry L 1 / R 1
  const d4 = calculateMatchingDecomposition(105, 105);
  assert(
    d4.totalBonusUsd === 11000 &&
    d4.consumedLeft === 104 &&
    d4.consumedRight === 104 &&
    d4.carryLeftAfter === 1 &&
    d4.carryRightAfter === 1 &&
    d4.components.length === 2 &&
    d4.components[0].tierUnits === 100 &&
    d4.components[0].bonusUsd === 10000 &&
    d4.components[1].tierUnits === 4 &&
    d4.components[1].bonusUsd === 1000,
    '1D: 105 Left / 105 Right decomposes to 100/100 ($10,000) + 4/4 ($1,000) = $11,000, Carry L 1 / R 1'
  );

  // Case 1E: 0 Left / 0 Right -> $0, Carry L 0 / R 0
  const d5 = calculateMatchingDecomposition(0, 0);
  assert(
    d5.totalBonusUsd === 0 &&
    d5.consumedLeft === 0 &&
    d5.consumedRight === 0 &&
    d5.carryLeftAfter === 0 &&
    d5.carryRightAfter === 0 &&
    d5.components.length === 0,
    '1E: 0 Left / 0 Right yields $0 bonus and 0 carry'
  );

  // Case 1F: 1 Left / 1 Right -> $0, Carry L 1 / R 1 (No block below 2/2)
  const d6 = calculateMatchingDecomposition(1, 1);
  assert(
    d6.totalBonusUsd === 0 &&
    d6.consumedLeft === 0 &&
    d6.consumedRight === 0 &&
    d6.carryLeftAfter === 1 &&
    d6.carryRightAfter === 1 &&
    d6.components.length === 0,
    '1F: 1 Left / 1 Right yields $0 bonus (no tier below 2/2 generated)'
  );

  // Case 1G: Exact Tier Matches
  const exactTiers = [
    { units: 2, bonus: 500 },
    { units: 4, bonus: 1000 },
    { units: 8, bonus: 2000 },
    { units: 20, bonus: 4000 },
    { units: 50, bonus: 6000 },
    { units: 100, bonus: 10000 },
  ];

  for (const t of exactTiers) {
    const res = calculateMatchingDecomposition(t.units, t.units);
    assert(
      res.totalBonusUsd === t.bonus &&
      res.consumedLeft === t.units &&
      res.consumedRight === t.units &&
      res.carryLeftAfter === 0 &&
      res.carryRightAfter === 0 &&
      res.components.length === 1 &&
      res.components[0].tierUnits === t.units &&
      res.components[0].bonusUsd === t.bonus,
      `1G: Exact tier match ${t.units}/${t.units} produces $${t.bonus} with 0 carry`
    );
  }

  // ==========================================================================
  // SUITE 2: Atomic User Settlement & Carry-Forward Integration
  // ==========================================================================
  console.log('\n--- Suite 2: Atomic User Settlement & Carry-Forward Integration ---');

  const userA = await createTestUser('userA');
  const date1 = '2026-09-20';

  // Seed volume events for userA on date1: 12 Left, 10 Right
  for (let i = 0; i < 12; i++) {
    const dummySrc = await createTestUser(`srcL${i}`);
    const dummyNodeId = await createActiveNode(dummySrc.id);
    await db.query(
      `INSERT INTO binary_volume_events (id, public_event_id, beneficiary_user_id, source_user_id, source_node_id, side, volume_units, status, business_date, occurred_at, created_at)
       VALUES ($1, $2, $3, $4, $5, 'LEFT', 1, 'ACTIVE', $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [uuidv4(), `BVE-${Math.floor(100000 + Math.random() * 900000)}`, userA.id, dummySrc.id, dummyNodeId, date1]
    );
  }

  for (let i = 0; i < 10; i++) {
    const dummySrc = await createTestUser(`srcR${i}`);
    const dummyNodeId = await createActiveNode(dummySrc.id);
    await db.query(
      `INSERT INTO binary_volume_events (id, public_event_id, beneficiary_user_id, source_user_id, source_node_id, side, volume_units, status, business_date, occurred_at, created_at)
       VALUES ($1, $2, $3, $4, $5, 'RIGHT', 1, 'ACTIVE', $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [uuidv4(), `BVE-${Math.floor(100000 + Math.random() * 900000)}`, userA.id, dummySrc.id, dummyNodeId, date1]
    );
  }

  // Settle userA for date1
  const settleA1 = await settleUserMatchingForDate(db, userA.id, date1);

  assert(
    settleA1.availableLeft === 12 &&
    settleA1.availableRight === 10 &&
    settleA1.consumedLeft === 10 &&
    settleA1.consumedRight === 10 &&
    settleA1.carryLeftAfter === 2 &&
    settleA1.carryRightAfter === 0 &&
    settleA1.totalBonusUsd === 2500 &&
    settleA1.status === 'COMPLETED' &&
    settleA1.components.length === 2,
    '2A: Atomic settlement for userA date1 creates $2,500 bonus, consumes 10/10, carries L 2 / R 0'
  );

  // Verify binary_volume_balances table state
  const balA1 = await db.query<{ carry_left_units: number; carry_right_units: number; last_settled_business_date: string | Date }>(
    `SELECT carry_left_units, carry_right_units, last_settled_business_date FROM binary_volume_balances WHERE user_id = $1`,
    [userA.id]
  );
  const balRow = balA1.rows[0];
  const lastDateIso = balRow.last_settled_business_date instanceof Date
    ? balRow.last_settled_business_date.toISOString().split('T')[0]
    : String(balRow.last_settled_business_date);
  assert(
    balRow.carry_left_units === 2 &&
    balRow.carry_right_units === 0 &&
    lastDateIso.startsWith('2026-09-20'),
    '2B: binary_volume_balances updated with carry_left=2, carry_right=0, last_settled_business_date=2026-09-20'
  );

  // Now, on date2 ('2026-09-21'), userA receives new volume: 0 Left, 3 Right.
  // Available should be: previous carryLeft (2) + 0 = 2 Left, carryRight (0) + 3 = 3 Right.
  // Matching decomposition: 2/2 -> $500, consumed 2/2, carryLeftAfter = 0, carryRightAfter = 1.
  const date2 = '2026-09-21';
  for (let i = 0; i < 3; i++) {
    const dummySrc = await createTestUser(`srcR2_${i}`);
    const dummyNodeId = await createActiveNode(dummySrc.id);
    await db.query(
      `INSERT INTO binary_volume_events (id, public_event_id, beneficiary_user_id, source_user_id, source_node_id, side, volume_units, status, business_date, occurred_at, created_at)
       VALUES ($1, $2, $3, $4, $5, 'RIGHT', 1, 'ACTIVE', $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [uuidv4(), `BVE-${Math.floor(100000 + Math.random() * 900000)}`, userA.id, dummySrc.id, dummyNodeId, date2]
    );
  }

  const settleA2 = await settleUserMatchingForDate(db, userA.id, date2);
  assert(
    settleA2.carryLeftBefore === 2 &&
    settleA2.carryRightBefore === 0 &&
    settleA2.availableLeft === 2 &&
    settleA2.availableRight === 3 &&
    settleA2.consumedLeft === 2 &&
    settleA2.consumedRight === 2 &&
    settleA2.carryLeftAfter === 0 &&
    settleA2.carryRightAfter === 1 &&
    settleA2.totalBonusUsd === 500 &&
    settleA2.components.length === 1 &&
    settleA2.components[0].tierUnits === 2,
    '2C: Date2 uses carry-forward volume correctly: available 2L/3R -> 2/2 ($500), carryAfter 0L/1R'
  );

  // ==========================================================================
  // SUITE 3: Idempotency & Duplicate Run Protection
  // ==========================================================================
  console.log('\n--- Suite 3: Idempotency & Duplicate Protection ---');

  // Re-run settlement for userA on date1
  const retryA1 = await settleUserMatchingForDate(db, userA.id, date1);
  assert(
    retryA1.id === settleA1.id &&
    retryA1.publicSettlementId === settleA1.publicSettlementId &&
    retryA1.totalBonusUsd === settleA1.totalBonusUsd,
    '3A: Re-running settlement for same user & business date returns existing settlement record'
  );

  // Verify component count did not double
  const compCountRes = await db.query<{ count: string | number }>(
    `SELECT COUNT(*)::int AS count FROM binary_matching_components WHERE settlement_id = $1`,
    [settleA1.id]
  );
  assert(
    Number(compCountRes.rows[0].count) === 2,
    '3B: No duplicate components created when re-running settlement for same date'
  );

  // Verify settlements table has exactly 1 record for userA and date1
  const settsCountRes = await db.query<{ count: string | number }>(
    `SELECT COUNT(*)::int AS count FROM binary_matching_settlements WHERE user_id = $1 AND business_date = $2`,
    [userA.id, date1]
  );
  assert(
    Number(settsCountRes.rows[0].count) === 1,
    '3C: Exactly 1 settlement record exists due to UNIQUE(user_id, business_date)'
  );

  // ==========================================================================
  // SUITE 4: Global Run Safety (Midnight Cycle Execution)
  // ==========================================================================
  console.log('\n--- Suite 4: Global Run Safety (Midnight Settlement Cycle) ---');

  const cycleDay = Math.floor(10 + Math.random() * 18);
  const cycleDate = `2026-07-${cycleDay}`;
  // Seed an event for userA on cycleDate
  const dummySrc = await createTestUser('srcCycle');
  const dummyNodeId = await createActiveNode(dummySrc.id);
  await db.query(
    `INSERT INTO binary_volume_events (id, public_event_id, beneficiary_user_id, source_user_id, source_node_id, side, volume_units, status, business_date, occurred_at, created_at)
     VALUES ($1, $2, $3, $4, $5, 'LEFT', 5, 'ACTIVE', $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [uuidv4(), `BVE-${Math.floor(100000 + Math.random() * 900000)}`, userA.id, dummySrc.id, dummyNodeId, cycleDate]
  );

  const cycleResult1 = await runDailyMatchingSettlementCycle(cycleDate);
  assert(
    cycleResult1.status === 'COMPLETED' && cycleResult1.businessDate === cycleDate,
    '4A: Daily settlement cycle executes and marks status COMPLETED'
  );

  // Second worker attempting the same cycle
  const cycleResult2 = await runDailyMatchingSettlementCycle(cycleDate);
  assert(
    cycleResult2.status === 'SKIPPED_ALREADY_COMPLETED' &&
    cycleResult2.usersSettled === cycleResult1.usersSettled,
    '4B: Global run safety skips already completed settlement cycle without double-processing'
  );

  // ==========================================================================
  // SUITE 5: Non-Reversed Volume Constraint
  // ==========================================================================
  console.log('\n--- Suite 5: Only Active, Non-Reversed Volume Participates ---');

  const userB = await createTestUser('userB');
  const dateRev = '2026-09-23';

  // Add 10 Left Active, 10 Right Reversed
  const srcRev = await createTestUser('srcRev');

  // 10 active left
  for (let i = 0; i < 10; i++) {
    const nodeL = await createActiveNode(srcRev.id);
    await db.query(
      `INSERT INTO binary_volume_events (id, public_event_id, beneficiary_user_id, source_user_id, source_node_id, side, volume_units, status, business_date, occurred_at, created_at)
       VALUES ($1, $2, $3, $4, $5, 'LEFT', 1, 'ACTIVE', $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [uuidv4(), `BVE-${Math.floor(100000 + Math.random() * 900000)}`, userB.id, srcRev.id, nodeL, dateRev]
    );
  }

  // 10 REVERSED right
  for (let i = 0; i < 10; i++) {
    const nodeR = await createActiveNode(srcRev.id);
    await db.query(
      `INSERT INTO binary_volume_events (id, public_event_id, beneficiary_user_id, source_user_id, source_node_id, side, volume_units, status, business_date, occurred_at, created_at)
       VALUES ($1, $2, $3, $4, $5, 'RIGHT', 1, 'REVERSED', $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [uuidv4(), `BVE-${Math.floor(100000 + Math.random() * 900000)}`, userB.id, srcRev.id, nodeR, dateRev]
    );
  }

  const settleB = await settleUserMatchingForDate(db, userB.id, dateRev);
  assert(
    settleB.availableLeft === 10 &&
    settleB.availableRight === 0 &&
    settleB.consumedLeft === 0 &&
    settleB.consumedRight === 0 &&
    settleB.totalBonusUsd === 0 &&
    settleB.carryLeftAfter === 10 &&
    settleB.carryRightAfter === 0,
    '5A: Reversed volume is strictly ignored: 10 Active Left / 10 Reversed Right yields $0 bonus and 0 consumed'
  );

  // ==========================================================================
  // SUITE 6: Reversal Audit Foundation
  // ==========================================================================
  console.log('\n--- Suite 6: Financial Correction & Reversal Foundation ---');

  const reversedOk = await reverseMatchingSettlement(settleB.id);
  assert(reversedOk === true, '6A: reverseMatchingSettlement returns true');

  const checkRevRow = await db.query<{ status: string }>(
    `SELECT status FROM binary_matching_settlements WHERE id = $1`,
    [settleB.id]
  );
  assert(
    checkRevRow.rows[0].status === 'REVERSED',
    '6B: Settlement status transitions to REVERSED while preserving record in database'
  );

  // ==========================================================================
  // SUITE 7: Authenticated Query APIs (Summary & History)
  // ==========================================================================
  console.log('\n--- Suite 7: Authenticated Query APIs ---');

  // Total matching bonus earned for userA: date1 ($2,500) + date2 ($500) = $3,000
  const summaryA = await getUserMatchingSummary(userA.id);
  assert(
    summaryA.totalMatchingEarnedUsd === 3000,
    `7A: getUserMatchingSummary returns exact totalMatchingEarnedUsd ($3,000 expected, got $${summaryA.totalMatchingEarnedUsd})`
  );
  assert(
    summaryA.latestSettlement !== null &&
    summaryA.latestSettlement.components.length > 0 &&
    summaryA.nextSettlement.scheduledTime === '00:00 Asia/Dhaka',
    '7B: Summary includes latestSettlement with components and nextSettlement schedule'
  );

  const historyA = await getUserMatchingHistory(userA.id, 1, 10);
  assert(
    historyA.history.length >= 2 &&
    historyA.pagination.totalCount >= 2 &&
    historyA.history[0].components !== undefined,
    '7C: getUserMatchingHistory returns paginated settlement items with matching components'
  );

  console.log('\n==================================================');
  console.log(`TASK #11 TEST RESULTS: Passed: ${passed}, Failed: ${failed}`);
  console.log('==================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTask11MatchingTests().catch((err) => {
  console.error('Fatal error running Task #11 matching tests:', err);
  process.exit(1);
});
