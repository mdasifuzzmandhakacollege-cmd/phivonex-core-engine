import path from 'path';
process.env.PGLITE_DATA_DIR = path.resolve(process.cwd(), '.data/pglite_test_t9');

import { getDb } from '../src/server/db/db';
import { v4 as uuidv4 } from 'uuid';
import {
  placeMember,
  getUnplacedDirectReferrals,
  getNetworkTree,
  getNetworkSummary,
  validateNoCycle,
  findNextAvailableSlot,
} from '../src/server/services/binaryPlacementService';

let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, details?: string) {
  if (condition) {
    console.log(`  [PASS] ${testName}`);
    passedTests++;
  } else {
    console.error(`  [FAIL] ${testName}${details ? ` -> ${details}` : ''}`);
    failedTests++;
  }
}

async function runTask9Tests() {
  console.log('====================================================');
  console.log('PHIVONEX TASK #9: BINARY PLACEMENT TREE TESTS');
  console.log('====================================================');

  const db = await getDb();
  const runId = Date.now();

  // Helper to create test user
  async function createTestUser(role: string, sponsorId: string | null = null) {
    const userId = uuidv4();
    const publicId = `PHX-T9${Math.floor(100000 + Math.random() * 900000)}`;
    const email = `user_${role.toLowerCase()}_${Math.floor(Math.random() * 1000000)}_${runId}@phivonex.test`;
    const phone = `+1999${Math.floor(1000000 + Math.random() * 9000000)}`;
    const refCode = `REF${Math.floor(10000 + Math.random() * 90000)}`;

    await db.query(
      `
      INSERT INTO users (id, public_id, email, phone, country, password_hash, full_name, status, created_at, updated_at)
      VALUES ($1, $2, $3, $4, 'United States', 'hash_placeholder', $5, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `,
      [userId, publicId, email, phone, `${role} Test User`]
    );

    await db.query(
      `
      INSERT INTO user_referrals (user_id, referral_code, sponsor_user_id, created_at)
      VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
      `,
      [userId, refCode, sponsorId]
    );

    await db.query(
      `
      INSERT INTO binary_placements (user_id, parent_user_id, side, status, placed_at, created_at)
      VALUES ($1, NULL, NULL, 'UNPLACED', NULL, CURRENT_TIMESTAMP)
      ON CONFLICT (user_id) DO NOTHING
      `,
      [userId]
    );

    return { id: userId, publicId, email, refCode };
  }

  // ----------------------------------------------------
  // TEST 1: Schema & Constraints Check
  // ----------------------------------------------------
  console.log('\n--- TEST 1: binary_placements Schema & Constraints ---');
  const tableCheck = await db.query(
    `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'binary_placements'`
  );
  assert(tableCheck.rows.length >= 6, 'binary_placements table exists with all required columns');

  // Verify unique index on (parent_user_id, side)
  const indexCheck = await db.query(
    `SELECT indexname FROM pg_indexes WHERE tablename = 'binary_placements' AND indexname = 'idx_binary_parent_side'`
  );
  assert(indexCheck.rows.length > 0, 'Unique index idx_binary_parent_side exists');

  // ----------------------------------------------------
  // TEST 2: Direct Sponsor vs Placement Independence
  // ----------------------------------------------------
  console.log('\n--- TEST 2: Sponsor Relationship vs Binary Placement Independence ---');
  const sponsorA = await createTestUser('SponsorA');
  const memberB = await createTestUser('MemberB', sponsorA.id);

  // Check initial unplaced status
  const unplacedBefore = await getUnplacedDirectReferrals(sponsorA.id);
  assert(
    unplacedBefore.some((m) => m.publicId === memberB.publicId),
    'Directly referred member B appears in Sponsor A unplaced list'
  );

  // Place member B into LEFT
  const placeResB = await placeMember(sponsorA.id, memberB.publicId, 'LEFT');
  assert(placeResB.status === 'PLACED', 'Member B is placed successfully');
  assert(placeResB.side === 'LEFT', 'Member B placed on LEFT side');
  assert(placeResB.parentPublicId === sponsorA.publicId, 'Member B binary parent is Sponsor A');

  // Verify sponsor relationship is untouched in user_referrals
  const refRowB = await db.query<{ sponsor_user_id: string }>(
    `SELECT sponsor_user_id FROM user_referrals WHERE user_id = $1`,
    [memberB.id]
  );
  assert(refRowB.rows[0].sponsor_user_id === sponsorA.id, 'Sponsor relationship in user_referrals remains intact');

  // ----------------------------------------------------
  // TEST 3: Direct RIGHT Placement
  // ----------------------------------------------------
  console.log('\n--- TEST 3: Direct RIGHT Placement ---');
  const memberC = await createTestUser('MemberC', sponsorA.id);
  const placeResC = await placeMember(sponsorA.id, memberC.publicId, 'RIGHT');
  assert(placeResC.status === 'PLACED', 'Member C is placed successfully');
  assert(placeResC.side === 'RIGHT', 'Member C placed on RIGHT side');
  assert(placeResC.parentPublicId === sponsorA.publicId, 'Member C binary parent is Sponsor A');

  // ----------------------------------------------------
  // TEST 4: BFS Spillover inside Selected Leg
  // ----------------------------------------------------
  console.log('\n--- TEST 4: BFS Spillover Inside Selected Leg ---');
  // Sponsor A now has:
  //         A
  //       /   \
  //      B     C
  // Now sponsor A refers Member D and places on LEFT:
  // Since A.LEFT is occupied by B, spillover should place D under B.LEFT.
  const memberD = await createTestUser('MemberD', sponsorA.id);
  const placeResD = await placeMember(sponsorA.id, memberD.publicId, 'LEFT');
  assert(placeResD.status === 'PLACED', 'Member D placed successfully via spillover');
  assert(placeResD.parentPublicId === memberB.publicId, 'Member D binary parent is Member B (spillover root)');
  assert(placeResD.side === 'LEFT', 'Member D placed in Member B LEFT slot');

  // Now sponsor A refers Member E and places on LEFT:
  // A.LEFT is B. B.LEFT is D. Next available slot in LEFT leg is B.RIGHT!
  const memberE = await createTestUser('MemberE', sponsorA.id);
  const placeResE = await placeMember(sponsorA.id, memberE.publicId, 'LEFT');
  assert(placeResE.status === 'PLACED', 'Member E placed successfully via spillover');
  assert(placeResE.parentPublicId === memberB.publicId, 'Member E binary parent is Member B');
  assert(placeResE.side === 'RIGHT', 'Member E placed in Member B RIGHT slot');

  // Now sponsor A refers Member F and places on LEFT:
  // A.LEFT is B. Both B.LEFT (D) and B.RIGHT (E) are full.
  // Next BFS slot is D.LEFT!
  const memberF = await createTestUser('MemberF', sponsorA.id);
  const placeResF = await placeMember(sponsorA.id, memberF.publicId, 'LEFT');
  assert(placeResF.status === 'PLACED', 'Member F placed successfully via BFS depth traversal');
  assert(placeResF.parentPublicId === memberD.publicId, 'Member F binary parent is Member D');
  assert(placeResF.side === 'LEFT', 'Member F placed in Member D LEFT slot');

  // ----------------------------------------------------
  // TEST 5: Non-Sponsor Placement Rejection
  // ----------------------------------------------------
  console.log('\n--- TEST 5: Non-Sponsor Placement Rejection ---');
  const sponsorOther = await createTestUser('SponsorOther');
  const orphanMember = await createTestUser('OrphanMember', sponsorOther.id);

  let nonSponsorError: any = null;
  try {
    await placeMember(sponsorA.id, orphanMember.publicId, 'LEFT');
  } catch (err) {
    nonSponsorError = err;
  }
  assert(nonSponsorError !== null, 'Non-sponsor placement was rejected');
  assert(
    nonSponsorError?.code === 'NOT_DIRECT_SPONSOR' || nonSponsorError?.statusCode === 403,
    'Returns 403 NOT_DIRECT_SPONSOR'
  );

  // ----------------------------------------------------
  // TEST 6: Immutability (Already Placed Member Cannot be Moved)
  // ----------------------------------------------------
  console.log('\n--- TEST 6: Placement Immutability ---');
  let rePlaceError: any = null;
  try {
    await placeMember(sponsorA.id, memberB.publicId, 'RIGHT');
  } catch (err) {
    rePlaceError = err;
  }
  assert(rePlaceError !== null, 'Re-placing an already PLACED member is rejected');
  assert(
    rePlaceError?.code === 'ALREADY_PLACED' || rePlaceError?.statusCode === 409,
    'Returns 409 ALREADY_PLACED'
  );

  // ----------------------------------------------------
  // TEST 7: Cycle Protection
  // ----------------------------------------------------
  console.log('\n--- TEST 7: Cycle Protection ---');
  // Attempt to place sponsor A under member F (which is descendant of A)
  let cycleError: any = null;
  try {
    await validateNoCycle(db, sponsorA.id, memberF.id);
  } catch (err) {
    cycleError = err;
  }
  assert(cycleError !== null, 'Cycle validation caught circular placement attempt');
  assert(
    cycleError?.code === 'CYCLE_DETECTED' || cycleError?.statusCode === 400,
    'Cycle error identified correctly'
  );

  // Self-parenting check
  let selfParentError: any = null;
  try {
    await validateNoCycle(db, sponsorA.id, sponsorA.id);
  } catch (err) {
    selfParentError = err;
  }
  assert(selfParentError !== null, 'Self-parenting check rejected');
  assert(selfParentError?.code === 'SELF_PARENT_FORBIDDEN', 'Self-parent error identified correctly');

  // ----------------------------------------------------
  // TEST 8: Database Constraint Against Duplicate Slots
  // ----------------------------------------------------
  console.log('\n--- TEST 8: Database Constraint Against Duplicate Slots ---');
  const dummyUser = await createTestUser('DummyUser');
  let duplicateSlotError: any = null;
  try {
    // Attempt raw SQL insert to place dummyUser into sponsorA's LEFT slot (already occupied by B)
    await db.query(
      `
      INSERT INTO binary_placements (user_id, parent_user_id, side, status, placed_at)
      VALUES ($1, $2, 'LEFT', 'PLACED', CURRENT_TIMESTAMP)
      `,
      [dummyUser.id, sponsorA.id]
    );
  } catch (err) {
    duplicateSlotError = err;
  }
  assert(duplicateSlotError !== null, 'DB constraint rejected duplicate slot placement');
  assert(
    duplicateSlotError?.code === '23505',
    'Postgres unique violation 23505 triggered on (parent_user_id, side)'
  );

  // ----------------------------------------------------
  // TEST 9: Unplaced Direct Referrals API Service
  // ----------------------------------------------------
  console.log('\n--- TEST 9: Unplaced Direct Referrals Service ---');
  const unplacedMember1 = await createTestUser('Unplaced1', sponsorA.id);
  const unplacedListAfter = await getUnplacedDirectReferrals(sponsorA.id);
  assert(
    unplacedListAfter.some((m) => m.publicId === unplacedMember1.publicId),
    'Unplaced direct referral appears in list'
  );
  // Privacy safe checks
  const unplacedObj = unplacedListAfter.find((m) => m.publicId === unplacedMember1.publicId)!;
  assert(unplacedObj.displayName.includes('.'), 'Display name is formatted safely (e.g. John D.)');
  assert((unplacedObj as any).email === undefined, 'Email is not exposed');
  assert((unplacedObj as any).phone === undefined, 'Phone is not exposed');
  assert((unplacedObj as any).id === undefined, 'Internal UUID is not exposed');

  // ----------------------------------------------------
  // TEST 10: Binary Network Tree Hierarchy Service
  // ----------------------------------------------------
  console.log('\n--- TEST 10: Network Tree Hierarchy Service ---');
  const tree = await getNetworkTree(sponsorA.id, 4);
  assert(tree !== null, 'Tree root returned');
  assert(tree?.user.publicId === sponsorA.publicId, 'Tree root is sponsor A');
  assert(tree?.left?.user.publicId === memberB.publicId, 'Tree left child is member B');
  assert(tree?.right?.user.publicId === memberC.publicId, 'Tree right child is member C');
  assert(tree?.left?.left?.user.publicId === memberD.publicId, 'Tree left->left child is member D');
  assert(tree?.left?.right?.user.publicId === memberE.publicId, 'Tree left->right child is member E');
  assert(tree?.left?.left?.left?.user.publicId === memberF.publicId, 'Tree left->left->left child is member F');
  // Privacy check on tree
  assert((tree?.user as any).email === undefined, 'Tree user does not expose email');
  assert((tree?.user as any).phone === undefined, 'Tree user does not expose phone');

  // ----------------------------------------------------
  // TEST 11: Network Summary Metrics
  // ----------------------------------------------------
  console.log('\n--- TEST 11: Network Summary Metrics ---');
  // Sponsor A direct referrals: B, C, D, E, F, Unplaced1 = 6
  // Placed direct referrals: B, C, D, E, F = 5
  // Unplaced direct referrals: Unplaced1 = 1
  // Left network size: B, D, E, F = 4
  // Right network size: C = 1
  const summary = await getNetworkSummary(sponsorA.id);
  assert(summary.directReferrals === 6, `directReferrals equals 6 (Actual: ${summary.directReferrals})`);
  assert(summary.placedMembers === 5, `placedMembers equals 5 (Actual: ${summary.placedMembers})`);
  assert(summary.unplacedDirectReferrals === 1, `unplacedDirectReferrals equals 1 (Actual: ${summary.unplacedDirectReferrals})`);
  assert(summary.leftNetworkMembers === 4, `leftNetworkMembers equals 4 (Actual: ${summary.leftNetworkMembers})`);
  assert(summary.rightNetworkMembers === 1, `rightNetworkMembers equals 1 (Actual: ${summary.rightNetworkMembers})`);

  // ----------------------------------------------------
  // TEST 12: Concurrency Safety Test
  // ----------------------------------------------------
  console.log('\n--- TEST 12: Concurrency & Slot Collision Safety ---');
  const concurrentSponsor = await createTestUser('ConcurrentSponsor');
  const concMember1 = await createTestUser('ConcMember1', concurrentSponsor.id);
  const concMember2 = await createTestUser('ConcMember2', concurrentSponsor.id);

  // Both attempt to place into LEFT simultaneously
  const [res1, res2] = await Promise.all([
    placeMember(concurrentSponsor.id, concMember1.publicId, 'LEFT'),
    placeMember(concurrentSponsor.id, concMember2.publicId, 'LEFT'),
  ]);

  assert(res1.status === 'PLACED' && res2.status === 'PLACED', 'Both concurrent placements succeeded');
  assert(
    (res1.parentPublicId === concurrentSponsor.publicId && res2.parentPublicId !== concurrentSponsor.publicId) ||
    (res2.parentPublicId === concurrentSponsor.publicId && res1.parentPublicId !== concurrentSponsor.publicId),
    'One took direct slot and the other spilled over safely without slot collision'
  );

  console.log('====================================================');
  console.log(`FINAL TEST SUMMARY: ${passedTests} PASSED | ${failedTests} FAILED`);
  console.log('====================================================');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTask9Tests().catch((err) => {
  console.error('[Test Error]', err);
  process.exit(1);
});
