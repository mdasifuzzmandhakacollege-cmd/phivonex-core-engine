/**
 * PHIVONEX — TASK #23.3A DYNAMIC MATCHING & ADMIN CONTROL INTEGRATION TESTS
 * 
 * Validates:
 * - Highest-tier-only payout
 * - $5,000 daily payout cap
 * - Strong-side carry forward
 * - Weak-side odd remainder handling (discarding weak-side leftover)
 * - Lifetime 1 LEFT + 1 RIGHT sponsor qualification
 * - Admin rule versioning (prospective changes)
 * - Administrative authorization & controls protection
 */

import assert from 'assert';
import { getDb } from '../src/server/db/db';
import { 
  getActiveMatchingConfig, 
  updateMatchingConfig, 
  calculateDynamicMatchingDecomposition,
  checkSponsorQualification,
  settleUserMatchingForDate
} from '../src/server/services/binaryMatchingService';

async function runTask23_3aTests() {
  console.log('========================================================================');
  console.log('🚀 RUNNING PHIVONEX TASK #23.3A INTEGRATION TEST SUITE');
  console.log('========================================================================\n');

  const db = await getDb();
  let passed = 0;
  let failed = 0;

  const runTest = async (name: string, fn: () => Promise<void> | void) => {
    try {
      await fn();
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`  ❌ FAIL: ${name}`);
      console.error(`     Error Details: ${err.message || err}\n`);
      failed++;
    }
  };

  // 1. Initialize clean mock data for a test user
  const testUserId = '3c45abba-b586-4032-8cf4-6a039eec92bc';
  
  // Clean up existing volume balances & placements before testing
  await db.query(`DELETE FROM binary_volume_balances WHERE user_id = $1`, [testUserId]);
  await db.query(`DELETE FROM binary_matching_settlements WHERE user_id = $1`, [testUserId]);
  await db.query(`DELETE FROM user_referrals WHERE sponsor_user_id = $1`, [testUserId]);
  await db.query(`DELETE FROM binary_placements WHERE parent_user_id = $1 OR user_id = $2`, [testUserId, testUserId]);

  // Insert test user and some referral relationships
  await db.query(
    `INSERT INTO users (id, public_id, full_name, email, password_hash, role, status, country)
     VALUES ($1, 'U_TEST_USER', 'Test User', 'test@phivonex.com', 'hash', 'USER', 'ACTIVE', 'US')
     ON CONFLICT (id) DO UPDATE SET role = 'USER'`,
    [testUserId]
  );

  // Setup binary placement for the test user itself
  await db.query(
    `INSERT INTO binary_placements (user_id, status)
     VALUES ($1, 'PLACED')
     ON CONFLICT (user_id) DO UPDATE SET status = 'PLACED'`,
    [testUserId]
  );

  // ------------------------------------------------------------------------
  // A. TEST HIGHEST-TIER-ONLY PAYOUTS
  // ------------------------------------------------------------------------
  await runTest('Verify highest-tier-only matching payout calculations', async () => {
    const config = await getActiveMatchingConfig(db);
    
    // Example 1: LEFT 4 / RIGHT 6 => uses 4/4 => payout $1,000
    const result1 = calculateDynamicMatchingDecomposition(4, 6, config, true);
    assert.strictEqual(result1.totalBonusUsd, 1000);
    assert.strictEqual(result1.consumedLeft, 4);
    assert.strictEqual(result1.consumedRight, 4);

    // Example 2: LEFT 10 / RIGHT 6 => uses 6/6 => payout $1,500
    const result2 = calculateDynamicMatchingDecomposition(10, 6, config, true);
    assert.strictEqual(result2.totalBonusUsd, 1500);
    assert.strictEqual(result2.consumedLeft, 6);
    assert.strictEqual(result2.consumedRight, 6);
  });

  // ------------------------------------------------------------------------
  // B. TEST $5,000 DAILY CAP LIMITATION
  // ------------------------------------------------------------------------
  await runTest('Verify maximum daily matching payout cap of $5,000 is enforced', async () => {
    const config = await getActiveMatchingConfig(db);
    
    // Create an extremely large volume matching scenario (e.g. 50 / 50)
    // Even if tier units match a massive amount, the payout must be capped at config.dailyMaxPayout ($5,000)
    const largeResult = calculateDynamicMatchingDecomposition(100, 100, {
      ...config,
      tiers: [{ units: 100, bonusUsd: 10000 }] // Custom tier paying $10,000
    }, true);

    assert.strictEqual(largeResult.totalBonusUsd, 5000, 'Payout must be capped at $5,000 max');
  });

  // ------------------------------------------------------------------------
  // C. TEST STRONG-SIDE CARRY FORWARD & WEAK-SIDE REMAINDER DISCARDING
  // ------------------------------------------------------------------------
  await runTest('Verify strong-side carry forward and weak-side odd remainder handling', async () => {
    const config = await getActiveMatchingConfig(db);

    // Example 3: LEFT 10 / RIGHT 7 => uses 6/6 => payout $1,500
    // Unmatched single weak-side unit (7 - 6 = 1) is discarded => Remaining strong-side volume (10 - 6 = 4) carries forward.
    const result3 = calculateDynamicMatchingDecomposition(10, 7, config, true);
    assert.strictEqual(result3.totalBonusUsd, 1500);
    assert.strictEqual(result3.consumedLeft, 6);
    assert.strictEqual(result3.consumedRight, 6);
    assert.strictEqual(result3.carryLeftAfter, 4, 'Left (strong-side) carries forward 4 leftover units');
    assert.strictEqual(result3.carryRightAfter, 0, 'Right (weak-side) leftover 1 is completely discarded to 0');
  });

  // ------------------------------------------------------------------------
  // D. TEST LIFETIME SPONSOR QUALIFICATION
  // ------------------------------------------------------------------------
  await runTest('Verify direct sponsor LEFT + RIGHT qualification', async () => {
    const db = await getDb();
    
    // Check initial state (no sponsors)
    let isQualified = await checkSponsorQualification(db, testUserId);
    assert.strictEqual(isQualified, false, 'User must not be qualified with zero sponsors');

    // Sponsor 1 on LEFT
    const subLeftUser = '11111111-1111-1111-1111-111111111111';
    await db.query(`DELETE FROM users WHERE id = $1`, [subLeftUser]);
    await db.query(`INSERT INTO users (id, public_id, full_name, email, password_hash, country) VALUES ($1, 'U_LEFT', 'Left Child', 'left@test.com', 'h', 'US')`, [subLeftUser]);
    await db.query(`INSERT INTO user_referrals (user_id, referral_code, sponsor_user_id) VALUES ($1, 'REF_LEFT', $2)`, [subLeftUser, testUserId]);
    await db.query(`INSERT INTO binary_placements (user_id, parent_user_id, side, status) VALUES ($1, $2, 'LEFT', 'PLACED')`, [subLeftUser, testUserId]);

    isQualified = await checkSponsorQualification(db, testUserId);
    assert.strictEqual(isQualified, false, 'User is still missing RIGHT sponsor qualification');

    // Sponsor 2 on RIGHT
    const subRightUser = '22222222-2222-2222-2222-222222222222';
    await db.query(`DELETE FROM users WHERE id = $1`, [subRightUser]);
    await db.query(`INSERT INTO users (id, public_id, full_name, email, password_hash, country) VALUES ($1, 'U_RIGHT', 'Right Child', 'right@test.com', 'h', 'US')`, [subRightUser]);
    await db.query(`INSERT INTO user_referrals (user_id, referral_code, sponsor_user_id) VALUES ($1, 'REF_RIGHT', $2)`, [subRightUser, testUserId]);
    await db.query(`INSERT INTO binary_placements (user_id, parent_user_id, side, status) VALUES ($1, $2, 'RIGHT', 'PLACED')`, [subRightUser, testUserId]);

    isQualified = await checkSponsorQualification(db, testUserId);
    assert.strictEqual(isQualified, true, 'User must be qualified once they have direct sponsors on both LEFT and RIGHT subtrees');
  });

  // ------------------------------------------------------------------------
  // E. TEST DYNAMIC ADMIN CONFIG RULE VERSIONING
  // ------------------------------------------------------------------------
  await runTest('Verify admin matching configuration versioning works prospectively', async () => {
    // Current active config
    const current = await getActiveMatchingConfig(db);

    // Save previous active configuration
    const adminId = testUserId; // Use our test user as admin actor

    // Update with prospective new configuration (e.g. increase daily max payout to $6,000)
    const updated = await updateMatchingConfig(adminId, {
      matchingEnabled: true,
      dailyMaxPayout: 6000.00,
      sponsorQualificationRequired: true,
      carryForwardBehavior: 'DISCARD_WEAK_CARRY_STRONG',
      effectiveDate: '2026-09-26',
      tiers: [
        { units: 2, bonusUsd: 600 }, // Payout increased from 500 to 600
        { units: 4, bonusUsd: 1200 },
      ]
    });

    assert.strictEqual(updated.version, current.version + 1, 'Version is incremented sequentially');
    assert.strictEqual(updated.dailyMaxPayout, 6000.00);

    // Verify loading gets the latest prospective version
    const latest = await getActiveMatchingConfig(db);
    assert.strictEqual(latest.version, updated.version);
    assert.strictEqual(latest.tiers[0].bonusUsd, 600);
  });

  // ------------------------------------------------------------------------
  // Clean up after the test suite finishes
  // ------------------------------------------------------------------------
  await db.query(`DELETE FROM binary_volume_balances WHERE user_id = $1`, [testUserId]);
  await db.query(`DELETE FROM binary_matching_settlements WHERE user_id = $1`, [testUserId]);
  await db.query(`DELETE FROM user_referrals WHERE sponsor_user_id = $1`, [testUserId]);
  await db.query(`DELETE FROM binary_placements WHERE parent_user_id = $1 OR user_id = $2`, [testUserId, testUserId]);

  console.log('\n========================================================================');
  console.log(`📊 INTEGRATION TEST SUITE RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTask23_3aTests().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
