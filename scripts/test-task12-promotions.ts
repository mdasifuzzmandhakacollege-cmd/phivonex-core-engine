process.env.APP_ENV = 'development';
process.env.NODE_ENV = 'test';

import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

// Set isolated temporary database directory BEFORE importing db
const testDataDir = path.resolve(process.cwd(), `.data/test_task12_${uuidv4()}`);
process.env.PGLITE_DATA_DIR = testDataDir;

import { getDb, closeDb } from '../src/server/db/db';
import {
  evaluateUserPromotions,
  reversePromotionBonus,
  OFFICIAL_PROMOTIONS,
} from '../src/server/services/promotionBonusService';

async function runTask12PromotionTests() {
  console.log('==================================================');
  console.log('🧪 RUNNING TASK #12: PROMOTION BONUS ENGINE TESTS');
  console.log('==================================================\n');

  let passed = 0;
  let failed = 0;

  try {
    const db = await getDb();

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
      [id, `REF${uuidv4().replace(/-/g, '').slice(0, 8).toUpperCase()}`]
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

  // Helper to get or create active Genesis Node
  async function createActiveNode(ownerId: string): Promise<string> {
    const nodeRes = await db.query<{ id: string }>(
      `SELECT id FROM nodes WHERE status = 'AVAILABLE' ORDER BY node_number ASC LIMIT 1`
    );
    if (nodeRes.rows.length === 0) {
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

  // Helper to add volume events to a user
  async function addBinaryVolume(beneficiaryId: string, side: 'LEFT' | 'RIGHT', count: number) {
    const dateStr = '2026-09-24';
    for (let i = 0; i < count; i++) {
      const dummySrc = await createTestUser(`src_${side}_${i}`);
      const dummyNodeId = await createActiveNode(dummySrc.id);
      await db.query(
        `INSERT INTO binary_volume_events (id, public_event_id, beneficiary_user_id, source_user_id, source_node_id, side, volume_units, status, business_date, occurred_at, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, 1, 'ACTIVE', $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [uuidv4(), `BVE-${Math.floor(100000 + Math.random() * 900000)}`, beneficiaryId, dummySrc.id, dummyNodeId, side, dateStr]
      );
    }
  }

  // ==========================================================================
  // TEST 1: Incomplete Qualification Creates Nothing
  // ==========================================================================
  console.log('--- Test 1: Incomplete Qualification ---');
  const user1 = await createTestUser('promoUser1');

  // Seed 19 Left, 20 Right (1 unit short on Left leg for 20/20)
  await addBinaryVolume(user1.id, 'LEFT', 19);
  await addBinaryVolume(user1.id, 'RIGHT', 20);

  const eval1 = await evaluateUserPromotions(user1.id);
  assert(
    eval1.currentProgress.leftUnits === 19 &&
    eval1.currentProgress.rightUnits === 20,
    '1A: Current progress accurately reflects 19 Left / 20 Right'
  );
  assert(
    eval1.achievedMilestones.length === 0,
    '1B: Incomplete qualification (19/20) awards 0 milestones'
  );
  assert(
    eval1.totalPromotionBonusEarned === 0,
    '1C: Total promotion bonus earned is $0'
  );
  assert(
    eval1.nextMilestone?.milestone === '20/20' &&
    eval1.nextMilestone?.leftNeeded === 1 &&
    eval1.nextMilestone?.rightNeeded === 0,
    '1D: Next milestone is 20/20 requiring 1 more unit on LEFT'
  );

  // ==========================================================================
  // TEST 2: 20/20 Milestone Creates $5,000 Once
  // ==========================================================================
  console.log('\n--- Test 2: 20/20 Milestone Award ($5,000) ---');
  // Add 1 more unit to LEFT leg -> now 20 Left / 20 Right
  await addBinaryVolume(user1.id, 'LEFT', 1);

  const eval2 = await evaluateUserPromotions(user1.id);
  assert(
    eval2.currentProgress.leftUnits === 20 &&
    eval2.currentProgress.rightUnits === 20,
    '2A: Volume reached exactly 20 Left / 20 Right'
  );
  assert(
    eval2.achievedMilestones.length === 1 &&
    eval2.achievedMilestones[0].milestone === '20/20' &&
    eval2.achievedMilestones[0].amountUsd === 5000 &&
    eval2.achievedMilestones[0].status === 'EARNED' &&
    Boolean(eval2.achievedMilestones[0].publicBonusId),
    '2B: 20/20 milestone creates $5,000 EARNED bonus record with publicBonusId'
  );
  assert(
    eval2.totalPromotionBonusEarned === 5000,
    '2C: Total promotion bonus earned is exactly $5,000'
  );
  assert(
    eval2.nextMilestone?.milestone === '50/50' &&
    eval2.nextMilestone?.leftNeeded === 30 &&
    eval2.nextMilestone?.rightNeeded === 30,
    '2D: Next milestone transitions to 50/50 requiring 30 Left and 30 Right'
  );

  // ==========================================================================
  // TEST 3: Duplicate Processing Creates No Duplicate Bonus
  // ==========================================================================
  console.log('\n--- Test 3: Idempotency & Duplicate Protection ---');
  const eval3 = await evaluateUserPromotions(user1.id);
  assert(
    eval3.achievedMilestones.length === 1 &&
    eval3.totalPromotionBonusEarned === 5000,
    '3A: Re-evaluating promotion produces identical single bonus without duplicate'
  );

  // Check database table directly
  const dbCount = await db.query<{ count: string | number }>(
    `SELECT COUNT(*)::int AS count FROM promotion_bonuses WHERE user_id = $1 AND milestone = '20/20'`,
    [user1.id]
  );
  assert(
    Number(dbCount.rows[0].count) === 1,
    '3B: Database row count is strictly 1 due to UNIQUE(user_id, milestone)'
  );

  // ==========================================================================
  // TEST 4: 50/50 Milestone Creates $10,000 Once
  // ==========================================================================
  console.log('\n--- Test 4: 50/50 Milestone Award ($10,000) ---');
  // Add 30 more units to Left, 30 more units to Right -> reaches 50/50
  await addBinaryVolume(user1.id, 'LEFT', 30);
  await addBinaryVolume(user1.id, 'RIGHT', 30);

  const eval4 = await evaluateUserPromotions(user1.id);
  assert(
    eval4.achievedMilestones.length === 2,
    '4A: User now has 2 achieved milestones (20/20 and 50/50)'
  );
  const m50 = eval4.achievedMilestones.find((m) => m.milestone === '50/50');
  assert(
    m50 !== undefined && m50.amountUsd === 10000 && m50.status === 'EARNED',
    '4B: 50/50 milestone awarded $10,000 bonus'
  );
  assert(
    eval4.totalPromotionBonusEarned === 15000,
    '4C: Total promotion bonus earned is $15,000 ($5,000 + $10,000)'
  );
  assert(
    eval4.nextMilestone?.milestone === '100/100' &&
    eval4.nextMilestone?.leftNeeded === 50 &&
    eval4.nextMilestone?.rightNeeded === 50,
    '4D: Next milestone transitions to 100/100 requiring 50 more units'
  );

  // ==========================================================================
  // TEST 5: 100/100 Milestone Creates $50,000 Once
  // ==========================================================================
  console.log('\n--- Test 5: 100/100 Milestone Award ($50,000) ---');
  // Add 50 more units to Left, 50 more units to Right -> reaches 100/100
  await addBinaryVolume(user1.id, 'LEFT', 50);
  await addBinaryVolume(user1.id, 'RIGHT', 50);

  const eval5 = await evaluateUserPromotions(user1.id);
  assert(
    eval5.achievedMilestones.length === 3,
    '5A: User now has all 3 achieved milestones (20/20, 50/50, 100/100)'
  );
  const m100 = eval5.achievedMilestones.find((m) => m.milestone === '100/100');
  assert(
    m100 !== undefined && m100.amountUsd === 50000 && m100.status === 'EARNED',
    '5B: 100/100 milestone awarded $50,000 bonus'
  );
  assert(
    eval5.totalPromotionBonusEarned === 65000,
    '5C: Total promotion bonus earned is exactly $65,000 ($5,000 + $10,000 + $50,000)'
  );
  assert(
    eval5.nextMilestone === null,
    '5D: nextMilestone is null since all official promotions are achieved'
  );

  // ==========================================================================
  // TEST 6: Direct Referrals Do Not Control Qualification
  // ==========================================================================
  console.log('\n--- Test 6: Sponsor/Referral Separation ---');
  const user2 = await createTestUser('promoUser2');
  // Add direct referrals for user2 that are NOT placed in binary tree
  for (let i = 0; i < 25; i++) {
    const dummyRef = await createTestUser(`direct_${i}`);
    await db.query(
      `UPDATE user_referrals SET sponsor_user_id = $1 WHERE user_id = $2`,
      [user2.id, dummyRef.id]
    );
  }

  const evalUser2 = await evaluateUserPromotions(user2.id);
  assert(
    evalUser2.currentProgress.leftUnits === 0 &&
    evalUser2.currentProgress.rightUnits === 0 &&
    evalUser2.achievedMilestones.length === 0 &&
    evalUser2.totalPromotionBonusEarned === 0,
    '6A: 25 unplaced direct referrals produce 0 binary volume and 0 promotion bonuses'
  );

  // ==========================================================================
  // TEST 7: User Data Isolation
  // ==========================================================================
  console.log('\n--- Test 7: User Isolation ---');
  assert(
    evalUser2.totalPromotionBonusEarned === 0 &&
    eval5.totalPromotionBonusEarned === 65000,
    '7A: User 2 sees 0 bonuses while User 1 sees 65,000 bonuses (strictly isolated)'
  );

  // ==========================================================================
  // TEST 8: Reversal Audit Foundation
  // ==========================================================================
  console.log('\n--- Test 8: Reversal Foundation ---');
  if (m100) {
    const revOk = await reversePromotionBonus(m100.id);
    assert(revOk === true, '8A: reversePromotionBonus returns true');

    const checkRev = await db.query<{ status: string }>(
      `SELECT status FROM promotion_bonuses WHERE id = $1`,
      [m100.id]
    );
    assert(
      checkRev.rows[0].status === 'REVERSED',
      '8B: Status transitions to REVERSED while audit record remains in database'
    );
  }

    console.log('\n==================================================');
    console.log(`TASK #12 TEST RESULTS: ${passed} PASSED | ${failed} FAILED`);
    console.log('==================================================\n');

    if (failed > 0) {
      throw new Error(`Task #12 tests failed: ${failed} failed`);
    }
  } finally {
    try {
      await closeDb();
      if (fs.existsSync(testDataDir)) {
        fs.rmSync(testDataDir, { recursive: true, force: true });
        console.log(`🧹 Cleaned up isolated test data dir: ${testDataDir}`);
      }
    } catch (cleanupErr) {
      console.warn('Notice: test directory cleanup error:', cleanupErr);
    }
  }
}

runTask12PromotionTests()
  .then(() => {
    console.log('✅ Task #12 promotion tests finished successfully.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Fatal error in Task #12 promotion tests:', err);
    process.exit(1);
  });
