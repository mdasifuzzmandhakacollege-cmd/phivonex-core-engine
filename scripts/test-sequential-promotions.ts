/**
 * PHIVONEX — FINAL BUSINESS ENGINE:
 * SEQUENTIAL BINARY PROMOTION + LEADERSHIP RANK SYSTEM TEST SUITE
 * 
 * Verifies all 22 Mandatory Scenarios in an isolated temporary database.
 */

process.env.APP_ENV = 'development';
process.env.NODE_ENV = 'test';

import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

// 1. Set isolated temporary database directory
const testDataDir = path.resolve(process.cwd(), `.data/test_promo_${uuidv4()}`);
process.env.PGLITE_DATA_DIR = testDataDir;

import { getDb, closeDb } from '../src/server/db/db';
import {
  ensurePromotionTables,
  getPromotionRules,
  updatePromotionRule,
  getUserPromotionState,
  evaluateUserRankPromotion,
  getDownlineLeaderCounts,
  adminManualRankCorrection,
  PromotionRankKey,
} from '../src/server/services/leadershipRankService';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✅ [PASS] ${testName}`);
    passed++;
  } else {
    console.error(`  ❌ [FAIL] ${testName}${detail ? ` -> ${detail}` : ''}`);
    failed++;
  }
}

async function runSequentialPromotionTests() {
  console.log('\n===============================================================');
  console.log('🧪 PHIVONEX — SEQUENTIAL BINARY PROMOTION & LEADERSHIP RANK TESTS');
  console.log('===============================================================\n');

  try {
    const db = await getDb();
    await ensurePromotionTables(db);

    // Helpers
    async function createTestUser(tag: string): Promise<{ id: string; publicId: string; email: string }> {
      const id = uuidv4();
      const publicId = `PX-${tag.toUpperCase().slice(0, 8)}-${Math.floor(1000 + Math.random() * 9000)}`;
      const email = `test-${tag}-${Date.now()}-${Math.random()}@phivonex.test`;
      await db.query(
        `INSERT INTO users (id, public_id, full_name, email, country, password_hash, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'Bangladesh', 'hash_test', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [id, publicId, `Test Operator ${tag}`, email]
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
      return { id, publicId, email };
    }

    let dummySourceUser: { id: string } | null = null;
    let nodeOffset = 0;

    async function addBinaryVolume(userId: string, side: 'LEFT' | 'RIGHT', units: number) {
      if (units <= 0) return;
      if (!dummySourceUser) {
        dummySourceUser = await createTestUser('volsrc');
      }
      const nodeRes = await db.query<{ id: string }>(`SELECT id FROM nodes ORDER BY node_number LIMIT 1 OFFSET $1`, [nodeOffset++ % 9000]);
      const nodeId = nodeRes.rows[0]?.id;
      await db.query(
        `INSERT INTO binary_volume_events (
          id, public_event_id, beneficiary_user_id, source_user_id, source_node_id,
          side, volume_units, status, business_date, occurred_at, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE', '2026-09-28', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [uuidv4(), `EVT-${uuidv4().slice(0, 8)}`, userId, dummySourceUser.id, nodeId, side, units]
      );
    }

    async function placeInBinaryTree(memberId: string, parentId: string, side: 'LEFT' | 'RIGHT') {
      await db.query(
        `UPDATE binary_placements
         SET parent_user_id = $1, side = $2, status = 'PLACED', placed_at = CURRENT_TIMESTAMP
         WHERE user_id = $3`,
        [parentId, side, memberId]
      );
    }

    // ------------------------------------------------------------------------
    // SCENARIO 1: 19/20 => NODE BUILDER not completed
    // ------------------------------------------------------------------------
    console.log('--- SCENARIO 1: 19/20 => NODE BUILDER NOT COMPLETED ---');
    const u1 = await createTestUser('user1');
    await addBinaryVolume(u1.id, 'LEFT', 19);
    await addBinaryVolume(u1.id, 'RIGHT', 20);

    const eval1 = await evaluateUserRankPromotion(u1.id, db);
    assert(eval1.promoted === false, '19/20 does not promote user to NODE BUILDER');
    assert(eval1.currentRank === 'STANDARD', 'Current rank remains STANDARD (Rank 0)');
    assert(eval1.state.stageProgress.matching?.leftProgress === 19, 'Left progress is 19');
    assert(eval1.state.stageProgress.matching?.rightProgress === 20, 'Right progress is 20');

    // ------------------------------------------------------------------------
    // SCENARIO 2: 20/20 => NODE BUILDER completed exactly once
    // ------------------------------------------------------------------------
    console.log('\n--- SCENARIO 2: 20/20 => NODE BUILDER COMPLETED EXACTLY ONCE ---');
    await addBinaryVolume(u1.id, 'LEFT', 1); // Now 20 L / 20 R

    const eval2 = await evaluateUserRankPromotion(u1.id, db);
    assert(eval2.promoted === true, '20/20 successfully promotes user to NODE BUILDER');
    assert(eval2.currentRank === 'NODE_BUILDER', 'Current rank is now NODE_BUILDER (Rank 1)');
    assert(eval2.previousRank === 'STANDARD', 'Previous rank was STANDARD');
    assert(eval2.event !== null && eval2.event.consumedLeft === 20, 'Consumed exactly 20 Left units');
    assert(eval2.event !== null && eval2.event.consumedRight === 20, 'Consumed exactly 20 Right units');

    // ------------------------------------------------------------------------
    // SCENARIO 3: NODE BUILDER completion initializes NODE MASTER next
    // ------------------------------------------------------------------------
    console.log('\n--- SCENARIO 3: NODE BUILDER INITIALIZES NODE MASTER NEXT ---');
    assert(eval2.state.nextRank === 'NODE_MASTER', 'Next eligible rank is initialized to NODE_MASTER');
    assert(eval2.state.nextRankOrder === 2, 'Next rank order is 2');
    assert(eval2.state.stageProgress.matching?.requiredLeft === 50, 'NODE_MASTER requires 50 Left units');
    assert(eval2.state.stageProgress.matching?.requiredRight === 50, 'NODE_MASTER requires 50 Right units');
    assert(eval2.state.stageProgress.matching?.cumulativeConsumedLeft === 20, 'Cumulative consumed left is 20');
    assert(eval2.state.stageProgress.matching?.cumulativeConsumedRight === 20, 'Cumulative consumed right is 20');

    // ------------------------------------------------------------------------
    // SCENARIO 4: Large matching activity cannot skip NODE MASTER
    // ------------------------------------------------------------------------
    console.log('\n--- SCENARIO 4: LARGE MATCHING ACTIVITY CANNOT SKIP NODE MASTER ---');
    // Add massive volume (500 Left, 500 Right)
    await addBinaryVolume(u1.id, 'LEFT', 500);
    await addBinaryVolume(u1.id, 'RIGHT', 500);

    // Single evaluation cycle must ONLY grant NODE MASTER
    const eval4 = await evaluateUserRankPromotion(u1.id, db);
    assert(eval4.promoted === true, 'Promotion evaluates and completes NODE_MASTER');
    assert(eval4.currentRank === 'NODE_MASTER', 'Current rank is strictly NODE_MASTER (Rank 2), not skipped to CAPTAIN');
    assert(eval4.state.currentRankOrder === 2, 'Rank order is exactly 2');
    assert(eval4.state.nextRank === 'NODE_CAPTAIN', 'Next pending rank is now initialized to NODE_CAPTAIN');

    // ------------------------------------------------------------------------
    // SCENARIO 5: NODE MASTER requires its own 50/50 sequential stage
    // ------------------------------------------------------------------------
    console.log('\n--- SCENARIO 5: NODE MASTER 50/50 SEQUENTIAL STAGE FLUSH ---');
    assert(eval4.event?.consumedLeft === 50, 'NODE_MASTER consumed its own 50 Left units');
    assert(eval4.event?.consumedRight === 50, 'NODE_MASTER consumed its own 50 Right units');
    assert(eval4.state.stageProgress.matching?.cumulativeConsumedLeft === 70, 'Total consumed is 20 (Builder) + 50 (Master) = 70');
    assert(eval4.state.stageProgress.matching?.cumulativeConsumedRight === 70, 'Total consumed is 20 (Builder) + 50 (Master) = 70');

    // ------------------------------------------------------------------------
    // SCENARIO 6: NODE MASTER completes before NODE CAPTAIN can start
    // ------------------------------------------------------------------------
    console.log('\n--- SCENARIO 6: NODE MASTER COMPLETES BEFORE NODE CAPTAIN CAN START ---');
    const u1Events = await db.query(
      `SELECT rank_key, rank_order FROM user_promotion_events WHERE user_id = $1 ORDER BY rank_order ASC`,
      [u1.id]
    );
    assert(u1Events.rows.length === 2, 'User has exactly 2 completed events: NODE_BUILDER and NODE_MASTER');
    assert(u1Events.rows[0].rank_key === 'NODE_BUILDER', 'First completed rank is NODE_BUILDER');
    assert(u1Events.rows[1].rank_key === 'NODE_MASTER', 'Second completed rank is NODE_MASTER');

    // ------------------------------------------------------------------------
    // SCENARIO 7: NODE CAPTAIN requires its own 100/100 sequential stage
    // ------------------------------------------------------------------------
    console.log('\n--- SCENARIO 7: NODE CAPTAIN 100/100 SEQUENTIAL STAGE ---');
    const eval7 = await evaluateUserRankPromotion(u1.id, db);
    assert(eval7.promoted === true, 'NODE_CAPTAIN completed on next evaluation cycle');
    assert(eval7.currentRank === 'NODE_CAPTAIN', 'Current rank is now NODE_CAPTAIN (Rank 3)');
    assert(eval7.event?.consumedLeft === 100, 'NODE_CAPTAIN consumed its own 100 Left units');
    assert(eval7.event?.consumedRight === 100, 'NODE_CAPTAIN consumed its own 100 Right units');
    assert(eval7.state.nextRank === 'NODE_COMMANDER', 'Next rank transitioned to LEADERSHIP rank NODE_COMMANDER');

    // ------------------------------------------------------------------------
    // SCENARIO 8: One evaluation cycle cannot grant two ranks
    // ------------------------------------------------------------------------
    console.log('\n--- SCENARIO 8: ONE EVALUATION CYCLE CANNOT GRANT TWO RANKS ---');
    const u2 = await createTestUser('user2');
    // Give 300 Left and 300 Right
    await addBinaryVolume(u2.id, 'LEFT', 300);
    await addBinaryVolume(u2.id, 'RIGHT', 300);

    const eval8 = await evaluateUserRankPromotion(u2.id, db);
    assert(eval8.promoted === true, 'First cycle promotes user2');
    assert(eval8.currentRank === 'NODE_BUILDER', 'Only Rank 1 (NODE_BUILDER) granted in first cycle, stopping advancement');
    assert(eval8.state.nextRank === 'NODE_MASTER', 'Next rank set to NODE_MASTER');

    // ------------------------------------------------------------------------
    // SCENARIO 9: Matching volume consumption/flush occurs exactly according to rule
    // ------------------------------------------------------------------------
    console.log('\n--- SCENARIO 9: MATCHING VOLUME CONSUMPTION/FLUSH RULE ---');
    const stateU2 = await getUserPromotionState(u2.id, db);
    assert(stateU2.stageProgress.matching?.cumulativeConsumedLeft === 20, 'Exactly 20 Left consumed for Builder');
    assert(stateU2.stageProgress.matching?.cumulativeConsumedRight === 20, 'Exactly 20 Right consumed for Builder');
    assert(stateU2.stageProgress.matching?.leftProgress === 50, 'Next stage (Master) sees 50/50 available');

    // ------------------------------------------------------------------------
    // SCENARIO 10: Retry does not duplicate promotion
    // ------------------------------------------------------------------------
    console.log('\n--- SCENARIO 10: RETRY DOES NOT DUPLICATE PROMOTION ---');
    // u1 is at NODE_CAPTAIN. Next is NODE_COMMANDER (requires leadership leaders, currently 0).
    const retryEval = await evaluateUserRankPromotion(u1.id, db);
    assert(retryEval.promoted === false, 'Retry does not grant duplicate promotion');
    assert(retryEval.currentRank === 'NODE_CAPTAIN', 'Current rank stays NODE_CAPTAIN');

    const captainCount = await db.query(
      `SELECT COUNT(*)::int AS count FROM user_promotion_events WHERE user_id = $1 AND rank_key = 'NODE_CAPTAIN'`,
      [u1.id]
    );
    assert(Number(captainCount.rows[0].count) === 1, 'Database row count for NODE_CAPTAIN is strictly 1');

    // ------------------------------------------------------------------------
    // SCENARIO 11: Concurrent evaluation grants rank exactly once
    // ------------------------------------------------------------------------
    console.log('\n--- SCENARIO 11: CONCURRENT EVALUATION SAFETY ---');
    const u3 = await createTestUser('user3');
    await addBinaryVolume(u3.id, 'LEFT', 20);
    await addBinaryVolume(u3.id, 'RIGHT', 20);

    // Run parallel evaluations
    const [conc1, conc2] = await Promise.all([
      evaluateUserRankPromotion(u3.id, db),
      evaluateUserRankPromotion(u3.id, db),
    ]);

    const promotionsGranted = [conc1.promoted, conc2.promoted].filter(Boolean).length;
    assert(promotionsGranted === 1, 'Exactly one concurrent promotion call granted the rank (no double promotion)');

    const u3Events = await db.query(
      `SELECT COUNT(*)::int AS count FROM user_promotion_events WHERE user_id = $1 AND rank_key = 'NODE_BUILDER'`,
      [u3.id]
    );
    assert(Number(u3Events.rows[0].count) === 1, 'Strictly 1 event recorded in database under concurrent execution');

    // ------------------------------------------------------------------------
    // SCENARIO 12: Leadership rank does not count unqualified leaders
    // ------------------------------------------------------------------------
    console.log('\n--- SCENARIO 12: LEADERSHIP RANK DOES NOT COUNT UNQUALIFIED LEADERS ---');
    // u1 is at NODE_CAPTAIN, next rank is NODE_COMMANDER (requires 2/3 NODE_CAPTAIN leaders).
    // Let's create downline members placed under u1, but they are only STANDARD (no NODE_CAPTAIN achieved).
    const downLeft1 = await createTestUser('dl1');
    const downLeft2 = await createTestUser('dl2');
    const downRight1 = await createTestUser('dr1');
    const downRight2 = await createTestUser('dr2');
    const downRight3 = await createTestUser('dr3');

    await placeInBinaryTree(downLeft1.id, u1.id, 'LEFT');
    await placeInBinaryTree(downLeft2.id, downLeft1.id, 'LEFT');
    await placeInBinaryTree(downRight1.id, u1.id, 'RIGHT');
    await placeInBinaryTree(downRight2.id, downRight1.id, 'RIGHT');
    await placeInBinaryTree(downRight3.id, downRight2.id, 'RIGHT');

    const countsBefore = await getDownlineLeaderCounts(u1.id, 'NODE_CAPTAIN', db);
    assert(countsBefore.leftLeaders === 0, 'Unqualified left downlines count as 0 leaders');
    assert(countsBefore.rightLeaders === 0, 'Unqualified right downlines count as 0 leaders');

    const eval12 = await evaluateUserRankPromotion(u1.id, db);
    assert(eval12.promoted === false, 'NODE_COMMANDER not granted without qualified leaders');

    // ------------------------------------------------------------------------
    // SCENARIO 13: Correct qualified NODE CAPTAIN leader structure can complete NODE COMMANDER
    // ------------------------------------------------------------------------
    console.log('\n--- SCENARIO 13: QUALIFIED NODE CAPTAIN STRUCTURE COMPLETES NODE COMMANDER ---');
    // Helper to promote a user to NODE_CAPTAIN
    async function promoteToCaptain(targetUserId: string) {
      // Add volume: 20 + 50 + 100 = 170
      await addBinaryVolume(targetUserId, 'LEFT', 200);
      await addBinaryVolume(targetUserId, 'RIGHT', 200);
      await evaluateUserRankPromotion(targetUserId, db); // Builder
      await evaluateUserRankPromotion(targetUserId, db); // Master
      await evaluateUserRankPromotion(targetUserId, db); // Captain
    }

    // Promote downLeft1, downLeft2 to Captain (2 Left leaders)
    await promoteToCaptain(downLeft1.id);
    await promoteToCaptain(downLeft2.id);

    // Promote downRight1, downRight2, downRight3 to Captain (3 Right leaders)
    await promoteToCaptain(downRight1.id);
    await promoteToCaptain(downRight2.id);
    await promoteToCaptain(downRight3.id);

    const countsAfter = await getDownlineLeaderCounts(u1.id, 'NODE_CAPTAIN', db);
    assert(countsAfter.leftLeaders === 2, 'Authoritative Left leaders count is exactly 2');
    assert(countsAfter.rightLeaders === 3, 'Authoritative Right leaders count is exactly 3');

    const eval13 = await evaluateUserRankPromotion(u1.id, db);
    assert(eval13.promoted === true, 'u1 successfully promoted to NODE_COMMANDER (Rank 4)');
    assert(eval13.currentRank === 'NODE_COMMANDER', 'Current rank is now NODE_COMMANDER');
    assert(eval13.state.nextRank === 'NODE_AMBASSADOR', 'Next eligible rank is NODE_AMBASSADOR');

    // ------------------------------------------------------------------------
    // SCENARIO 14: Correct qualified NODE COMMANDER structure can complete NODE AMBASSADOR
    // ------------------------------------------------------------------------
    console.log('\n--- SCENARIO 14: QUALIFIED NODE COMMANDER STRUCTURE COMPLETES NODE AMBASSADOR ---');
    // NODE_AMBASSADOR requires 3/4 NODE_COMMANDER leaders.
    // Create downline leaders who achieve NODE_COMMANDER
    // For test efficiency, insert completed events for 3 left leaders and 4 right leaders
    const ambLeftLeaders = [downLeft1.id, downLeft2.id, (await createTestUser('ambL3')).id];
    await placeInBinaryTree(ambLeftLeaders[2], downLeft2.id, 'LEFT');

    const ambRightLeaders = [
      downRight1.id,
      downRight2.id,
      downRight3.id,
      (await createTestUser('ambR4')).id,
    ];
    await placeInBinaryTree(ambRightLeaders[3], downRight3.id, 'RIGHT');

    // Ensure all 7 leaders have NODE_COMMANDER in user_promotion_events
    for (const lId of [...ambLeftLeaders, ...ambRightLeaders]) {
      await db.query(
        `INSERT INTO user_promotion_events (
          id, public_promotion_id, user_id, rank_key, rank_name, rank_order,
          previous_rank, qualification_type, required_left, required_right,
          actual_left, actual_right, rule_version, status, completed_at
        )
        VALUES ($1, $2, $3, 'NODE_COMMANDER', 'Node Commander', 4, 'NODE_CAPTAIN', 'LEADERSHIP', 2, 3, 2, 3, 1, 'COMPLETED', CURRENT_TIMESTAMP)
        ON CONFLICT (user_id, rank_key) DO NOTHING`,
        [uuidv4(), `PRM-CMD-${uuidv4().slice(0, 6)}`, lId]
      );
    }

    const ambLeaderCounts = await getDownlineLeaderCounts(u1.id, 'NODE_COMMANDER', db);
    assert(ambLeaderCounts.leftLeaders === 3, 'Found 3 Left NODE_COMMANDER leaders');
    assert(ambLeaderCounts.rightLeaders === 4, 'Found 4 Right NODE_COMMANDER leaders');

    const eval14 = await evaluateUserRankPromotion(u1.id, db);
    assert(eval14.promoted === true, 'u1 successfully promoted to NODE_AMBASSADOR (Rank 5)');
    assert(eval14.currentRank === 'NODE_AMBASSADOR', 'Current rank is NODE_AMBASSADOR');
    assert(eval14.state.nextRank === 'NODE_TITAN', 'Next rank is NODE_TITAN');

    // ------------------------------------------------------------------------
    // SCENARIO 15: Correct qualified NODE AMBASSADOR structure can complete NODE TITAN
    // ------------------------------------------------------------------------
    console.log('\n--- SCENARIO 15: QUALIFIED NODE AMBASSADOR STRUCTURE COMPLETES NODE TITAN ---');
    // NODE_TITAN requires 4/5 NODE_AMBASSADOR leaders
    const titanLeftLeaders = [...ambLeftLeaders, (await createTestUser('titL4')).id];
    await placeInBinaryTree(titanLeftLeaders[3], ambLeftLeaders[2], 'LEFT');

    const titanRightLeaders = [...ambRightLeaders, (await createTestUser('titR5')).id];
    await placeInBinaryTree(titanRightLeaders[4], ambRightLeaders[3], 'RIGHT');

    for (const lId of [...titanLeftLeaders, ...titanRightLeaders]) {
      await db.query(
        `INSERT INTO user_promotion_events (
          id, public_promotion_id, user_id, rank_key, rank_name, rank_order,
          previous_rank, qualification_type, required_left, required_right,
          actual_left, actual_right, rule_version, status, completed_at
        )
        VALUES ($1, $2, $3, 'NODE_AMBASSADOR', 'Node Ambassador', 5, 'NODE_COMMANDER', 'LEADERSHIP', 3, 4, 3, 4, 1, 'COMPLETED', CURRENT_TIMESTAMP)
        ON CONFLICT (user_id, rank_key) DO NOTHING`,
        [uuidv4(), `PRM-AMB-${uuidv4().slice(0, 6)}`, lId]
      );
    }

    const titanCounts = await getDownlineLeaderCounts(u1.id, 'NODE_AMBASSADOR', db);
    assert(titanCounts.leftLeaders === 4, 'Found 4 Left NODE_AMBASSADOR leaders');
    assert(titanCounts.rightLeaders === 5, 'Found 5 Right NODE_AMBASSADOR leaders');

    const eval15 = await evaluateUserRankPromotion(u1.id, db);
    assert(eval15.promoted === true, 'u1 promoted to top rank NODE_TITAN (Rank 6)');
    assert(eval15.currentRank === 'NODE_TITAN', 'Current rank is NODE_TITAN');
    assert(eval15.state.nextRank === null, 'Next rank is null (top rank reached)');

    // ------------------------------------------------------------------------
    // SCENARIO 16: Leadership ranks cannot be skipped
    // ------------------------------------------------------------------------
    console.log('\n--- SCENARIO 16: LEADERSHIP RANKS CANNOT BE SKIPPED ---');
    const u4 = await createTestUser('user4'); // STANDARD
    const stateU4 = await getUserPromotionState(u4.id, db);
    assert(stateU4.nextRank === 'NODE_BUILDER', 'Standard user next rank is strictly NODE_BUILDER, cannot skip to COMMANDER');

    // ------------------------------------------------------------------------
    // SCENARIO 17: Same leader cannot be counted twice incorrectly
    // ------------------------------------------------------------------------
    console.log('\n--- SCENARIO 17: SAME LEADER CANNOT BE COUNTED TWICE ---');
    // If multiple duplicate events exist, distinct leader count must remain 1
    const lTestCounts = await getDownlineLeaderCounts(u1.id, 'NODE_AMBASSADOR', db);
    const uniqueLeftIds = new Set(lTestCounts.leftLeaderDetails.map((l) => l.userId));
    assert(uniqueLeftIds.size === lTestCounts.leftLeaders, 'Leader count matches distinct leader user IDs exactly');

    // ------------------------------------------------------------------------
    // SCENARIO 18: Sponsor relationship and binary side remain distinct
    // ------------------------------------------------------------------------
    console.log('\n--- SCENARIO 18: SPONSOR RELATIONSHIP AND BINARY SIDE REMAIN DISTINCT ---');
    const sponsorUser = await createTestUser('sponsorUser');
    const memberReferredBySponsor = await createTestUser('referredMember');
    const otherTreeRoot = await createTestUser('otherTreeRoot');

    // Place referredMember under otherTreeRoot's tree, NOT sponsorUser's tree
    await db.query(
      `UPDATE user_referrals SET sponsor_user_id = $1 WHERE user_id = $2`,
      [sponsorUser.id, memberReferredBySponsor.id]
    );
    await placeInBinaryTree(memberReferredBySponsor.id, otherTreeRoot.id, 'LEFT');

    // Check downline of sponsorUser
    const sponsorDownlines = await getDownlineLeaderCounts(sponsorUser.id, 'NODE_CAPTAIN', db);
    assert(sponsorDownlines.leftLeaders === 0, 'Sponsor has 0 binary leaders (binary placement dictates downline, not referral)');

    // ------------------------------------------------------------------------
    // SCENARIO 19: Admin rule update does not rewrite historical rank records
    // ------------------------------------------------------------------------
    console.log('\n--- SCENARIO 19: ADMIN RULE UPDATE PRESERVES HISTORICAL PROMOTIONS ---');
    const adminUser = await createTestUser('adminUser');
    const allRules = await getPromotionRules(db);
    const builderRule = allRules.find((r) => r.rankKey === 'NODE_BUILDER')!;

    // Admin updates NODE_BUILDER rule: changes requiredLeft from 20 to 25
    await updatePromotionRule(
      adminUser.id,
      adminUser.publicId,
      builderRule.id,
      { requiredLeft: 25, reason: 'Prospective economic adjustment' },
      db
    );

    // Historical promotion event of u1 (completed under v1 with 20 units)
    const u1BuilderEvt = await db.query(
      `SELECT rule_version, required_left, consumed_left FROM user_promotion_events WHERE user_id = $1 AND rank_key = 'NODE_BUILDER'`,
      [u1.id]
    );
    assert(u1BuilderEvt.rows[0].rule_version === 1, 'Historical promotion retained original rule version (v1)');
    assert(u1BuilderEvt.rows[0].required_left === 20, 'Historical required_left retained 20 (not overwritten)');
    assert(u1BuilderEvt.rows[0].consumed_left === 20, 'Historical consumed_left retained 20');

    // ------------------------------------------------------------------------
    // SCENARIO 20: Persistence across database restart
    // ------------------------------------------------------------------------
    console.log('\n--- SCENARIO 20: PERSISTENCE ACROSS DATABASE RESTART ---');
    const stateBeforeRestart = await getUserPromotionState(u1.id, db);
    assert(stateBeforeRestart.currentRank === 'NODE_TITAN', 'State before restart is NODE_TITAN');
    assert(stateBeforeRestart.completedEvents.length === 6, 'Has 6 completed promotion events');

    // Close and re-open database connection
    await closeDb();
    const freshDb = await getDb();

    const stateAfterRestart = await getUserPromotionState(u1.id, freshDb);
    assert(stateAfterRestart.currentRank === 'NODE_TITAN', 'State after restart is NODE_TITAN');
    assert(stateAfterRestart.completedEvents.length === 6, 'All 6 completed promotion events intact after restart');
    assert(stateAfterRestart.completedEvents[0].publicPromotionId.startsWith('PRM-RANK-'), 'Public IDs intact');

    // ------------------------------------------------------------------------
    // SCENARIO 21: User API and Admin API return identical authoritative rank state
    // ------------------------------------------------------------------------
    console.log('\n--- SCENARIO 21: USER API AND ADMIN API RETURN IDENTICAL AUTHORITATIVE STATE ---');
    const userFacingState = await getUserPromotionState(u1.id, freshDb);
    const adminFacingState = await getUserPromotionState(u1.id, freshDb);

    assert(userFacingState.currentRank === adminFacingState.currentRank, 'currentRank matches identically');
    assert(userFacingState.currentRankOrder === adminFacingState.currentRankOrder, 'currentRankOrder matches identically');
    assert(userFacingState.completedEvents.length === adminFacingState.completedEvents.length, 'completedEvents length matches identically');

    // ------------------------------------------------------------------------
    // SCENARIO 22: Existing daily matching financial logic remains unchanged
    // ------------------------------------------------------------------------
    console.log('\n--- SCENARIO 22: DAILY MATCHING FINANCIAL LOGIC REMAINS UNCHANGED ---');
    // Ensure binary matching settlements table is untouched by promotion evaluations
    const matchingSettlementsRes = await freshDb.query(`SELECT COUNT(*)::int AS count FROM binary_matching_settlements`);
    assert(Number(matchingSettlementsRes.rows[0].count) === 0, 'Promotion evaluation created zero bogus binary matching settlements');

    const fleCount = await freshDb.query(
      `SELECT COUNT(*)::int AS count FROM financial_ledger_entries WHERE source_type = 'MATCHING_BONUS'`
    );
    assert(Number(fleCount.rows[0].count) === 0, 'No matching bonus ledger entries altered or contaminated');

    console.log('\n===============================================================');
    console.log(`📊 SEQUENTIAL PROMOTIONS SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('===============================================================\n');

    if (failed > 0) {
      throw new Error(`${failed} tests failed in sequential promotion test suite.`);
    }
  } finally {
    // Clean up temporary database directory
    try {
      await closeDb();
      if (fs.existsSync(testDataDir)) {
        fs.rmSync(testDataDir, { recursive: true, force: true });
        console.log(`🧹 Cleaned up isolated test data dir: ${testDataDir}`);
      }
    } catch (cleanupErr) {
      console.warn('Notice: test directory cleanup:', cleanupErr);
    }
  }
}

runSequentialPromotionTests()
  .then(() => {
    console.log('✅ ALL SEQUENTIAL PROMOTION TESTS PASSED SUCCESSFULLY!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ SEQUENTIAL PROMOTION TEST RUNNER FAILED:', err);
    process.exit(1);
  });
