import { getDb } from '../src/server/db/db';
import { v4 as uuidv4 } from 'uuid';
import { generatePublicId } from '../src/server/utils/idGenerator';
import { getDhakaBusinessDate } from '../src/server/utils/timezone';
import {
  propagateNodeSalesVolume,
  backfillNodeSalesVolumeForPlacedMember,
  reverseNodeSalesVolume,
  getVolumeSummary,
  getVolumeHistory,
} from '../src/server/services/binaryVolumeService';

async function runTask10VolumeTests() {
  console.log('==================================================');
  console.log('🧪 RUNNING TASK #10: BINARY NODE SALES VOLUME ENGINE TESTS');
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

  // Helper to place member under parent
  async function placeUser(userId: string, parentId: string | null, side: 'LEFT' | 'RIGHT' | null) {
    if (parentId && side) {
      await db.query(
        `UPDATE binary_placements 
         SET parent_user_id = $1, side = $2, status = 'PLACED', placed_at = CURRENT_TIMESTAMP
         WHERE user_id = $3`,
        [parentId, side, userId]
      );
    } else {
      await db.query(
        `UPDATE binary_placements 
         SET parent_user_id = NULL, side = NULL, status = 'PLACED', placed_at = CURRENT_TIMESTAMP
         WHERE user_id = $1`,
        [userId]
      );
    }
  }

  // Helper to create active Genesis Node for user
  async function createActiveNode(ownerId: string): Promise<string> {
    const nodeRes = await db.query<{ id: string }>(
      `SELECT id FROM nodes WHERE status = 'AVAILABLE' ORDER BY node_number ASC LIMIT 1`
    );
    if (nodeRes.rows.length === 0) {
      throw new Error('No available nodes in inventory for testing');
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

  // Helper to create non-active node
  async function createReservedNode(ownerId: string): Promise<string> {
    const nodeRes = await db.query<{ id: string }>(
      `SELECT id FROM nodes WHERE status = 'AVAILABLE' ORDER BY node_number DESC LIMIT 1`
    );
    if (nodeRes.rows.length === 0) {
      throw new Error('No available nodes in inventory for testing');
    }
    const nodeId = nodeRes.rows[0].id;

    await db.query(
      `UPDATE nodes 
       SET status = 'RESERVED', reserved_by_user_id = $1, reserved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [ownerId, nodeId]
    );
    return nodeId;
  }

  try {
    // ----------------------------------------------------
    // TEST 1: Dhaka Business Timezone Derivation
    // ----------------------------------------------------
    const dhakaDate = getDhakaBusinessDate();
    assert(
      /^\d{4}-\d{2}-\d{2}$/.test(dhakaDate),
      'Dhaka Business Date format YYYY-MM-DD',
      `Value: ${dhakaDate}`
    );

    // ----------------------------------------------------
    // TEST 2: Binary Tree Setup
    // Setup tree structure:
    //         User A (Root)
    //        /             \
    //     User B (LEFT)    User C (RIGHT)
    //      /
    //   User D (LEFT)
    // ----------------------------------------------------
    const userA = await createTestUser('UA');
    const userB = await createTestUser('UB');
    const userC = await createTestUser('UC');
    const userD = await createTestUser('UD');

    // Place A as root (placed, parent=null)
    await placeUser(userA.id, null, null);
    // Place B under A on LEFT
    await placeUser(userB.id, userA.id, 'LEFT');
    // Place C under A on RIGHT
    await placeUser(userC.id, userA.id, 'RIGHT');
    // Place D under B on LEFT
    await placeUser(userD.id, userB.id, 'LEFT');

    // ----------------------------------------------------
    // TEST 3: LEFT Descendant Node Activation gives LEFT +1
    // User D activates 1 Node.
    // Ancestors: B (direct parent, D is LEFT of B) -> receives LEFT +1
    //            A (grandparent, path goes through B which is LEFT of A) -> receives LEFT +1
    // User D receives NO volume for own node.
    // ----------------------------------------------------
    const nodeD1 = await createActiveNode(userD.id);
    const propD1 = await propagateNodeSalesVolume(db, nodeD1, userD.id);

    assert(propD1.eventsCreated === 2, `Propagated to 2 ancestors (Created: ${propD1.eventsCreated})`);

    // Check user B's volume events
    const bEvents = await db.query<{ side: string; volume_units: number }>(
      `SELECT side, volume_units FROM binary_volume_events WHERE beneficiary_user_id = $1 AND source_node_id = $2`,
      [userB.id, nodeD1]
    );
    assert(
      bEvents.rows.length === 1 && bEvents.rows[0].side === 'LEFT' && Number(bEvents.rows[0].volume_units) === 1,
      'Parent User B receives LEFT +1 for LEFT descendant D'
    );

    // Check user A's volume events
    const aEvents = await db.query<{ side: string; volume_units: number }>(
      `SELECT side, volume_units FROM binary_volume_events WHERE beneficiary_user_id = $1 AND source_node_id = $2`,
      [userA.id, nodeD1]
    );
    assert(
      aEvents.rows.length === 1 && aEvents.rows[0].side === 'LEFT' && Number(aEvents.rows[0].volume_units) === 1,
      'Root User A receives LEFT +1 for descendant D'
    );

    // Check buyer User D does NOT receive volume for own node
    const dEvents = await db.query(
      `SELECT 1 FROM binary_volume_events WHERE beneficiary_user_id = $1 AND source_node_id = $2`,
      [userD.id, nodeD1]
    );
    assert(dEvents.rows.length === 0, 'Buyer User D receives NO volume for own Node activation');

    // ----------------------------------------------------
    // TEST 4: RIGHT Descendant gives ancestor RIGHT +1
    // User C activates 1 Node.
    // Ancestor: A (C is RIGHT of A) -> receives RIGHT +1
    // ----------------------------------------------------
    const nodeC1 = await createActiveNode(userC.id);
    const propC1 = await propagateNodeSalesVolume(db, nodeC1, userC.id);
    assert(propC1.eventsCreated === 1, `Propagated to ancestor A (Created: ${propC1.eventsCreated})`);

    const aRightEvents = await db.query<{ side: string; volume_units: number }>(
      `SELECT side, volume_units FROM binary_volume_events WHERE beneficiary_user_id = $1 AND source_node_id = $2`,
      [userA.id, nodeC1]
    );
    assert(
      aRightEvents.rows.length === 1 && aRightEvents.rows[0].side === 'RIGHT' && Number(aRightEvents.rows[0].volume_units) === 1,
      'Root User A receives RIGHT +1 for RIGHT descendant C'
    );

    // ----------------------------------------------------
    // TEST 5: Deep Descendant Side Determination
    // Structure:
    // A
    // └── LEFT = B
    //     └── RIGHT = D2
    //         └── LEFT = E
    // If E activates a Node:
    // For A: LEFT +1
    // For B: RIGHT +1
    // For D2: LEFT +1
    // ----------------------------------------------------
    const userD2 = await createTestUser('UD2');
    const userE = await createTestUser('UE');

    // Place D2 under B on RIGHT
    await placeUser(userD2.id, userB.id, 'RIGHT');
    // Place E under D2 on LEFT
    await placeUser(userE.id, userD2.id, 'LEFT');

    const nodeE1 = await createActiveNode(userE.id);
    const propE1 = await propagateNodeSalesVolume(db, nodeE1, userE.id);
    assert(propE1.eventsCreated === 3, `Deep propagation created 3 events (Created: ${propE1.eventsCreated})`);

    const eEvForD2 = await db.query<{ side: string }>(
      `SELECT side FROM binary_volume_events WHERE beneficiary_user_id = $1 AND source_node_id = $2`,
      [userD2.id, nodeE1]
    );
    assert(eEvForD2.rows[0]?.side === 'LEFT', 'For D2: E is on LEFT leg');

    const eEvForB = await db.query<{ side: string }>(
      `SELECT side FROM binary_volume_events WHERE beneficiary_user_id = $1 AND source_node_id = $2`,
      [userB.id, nodeE1]
    );
    assert(eEvForB.rows[0]?.side === 'RIGHT', 'For B: E is under D2 which is on RIGHT leg');

    const eEvForA = await db.query<{ side: string }>(
      `SELECT side FROM binary_volume_events WHERE beneficiary_user_id = $1 AND source_node_id = $2`,
      [userA.id, nodeE1]
    );
    assert(eEvForA.rows[0]?.side === 'LEFT', 'For A: E is under B which is on LEFT leg');

    // ----------------------------------------------------
    // TEST 6: Sponsor Relationship Does NOT Determine Binary Volume
    // Create User S (Sponsor) who is NOT in the binary placement upline.
    // Set S as sponsor of E in user_referrals.
    // S must receive NO binary volume events.
    // ----------------------------------------------------
    const userS = await createTestUser('US');
    await db.query(`UPDATE user_referrals SET sponsor_user_id = $1 WHERE user_id = $2`, [userS.id, userE.id]);

    const sEvents = await db.query(
      `SELECT 1 FROM binary_volume_events WHERE beneficiary_user_id = $1 AND source_node_id = $2`,
      [userS.id, nodeE1]
    );
    assert(sEvents.rows.length === 0, 'Sponsor S (outside binary upline) receives 0 binary volume events');

    // ----------------------------------------------------
    // TEST 7: Multiple Nodes by Same Buyer Produce Multiple Volume Units
    // User C activates a second node (nodeC2).
    // Root User A must receive another volume unit on RIGHT.
    // ----------------------------------------------------
    const nodeC2 = await createActiveNode(userC.id);
    const propC2 = await propagateNodeSalesVolume(db, nodeC2, userC.id);
    assert(propC2.eventsCreated === 1, 'Second node from same buyer propagates 1 additional unit');

    const aCEvents = await db.query(
      `SELECT COUNT(*)::int AS count FROM binary_volume_events WHERE beneficiary_user_id = $1 AND source_user_id = $2`,
      [userA.id, userC.id]
    );
    assert(Number(aCEvents.rows[0]?.count) === 2, 'Ancestor A has 2 distinct volume events from buyer C');

    // ----------------------------------------------------
    // TEST 8: Reservation & Pending Orders Create ZERO Volume
    // ----------------------------------------------------
    const reservedNode = await createReservedNode(userC.id);
    const propReserved = await propagateNodeSalesVolume(db, reservedNode, userC.id);
    assert(propReserved.eventsCreated === 0, 'Reserved/pending node creates 0 volume events');

    // ----------------------------------------------------
    // TEST 9: Duplicate Protection / Idempotency under Retries
    // Replay propagation for nodeD1
    // ----------------------------------------------------
    const replayD1 = await propagateNodeSalesVolume(db, nodeD1, userD.id);
    assert(replayD1.eventsCreated === 0, 'Replaying propagation for same node creates 0 duplicate volume events');

    // Verify database constraint UNIQUE(beneficiary_user_id, source_node_id)
    let duplicateConstraintCaught = false;
    try {
      await db.query(
        `INSERT INTO binary_volume_events (id, public_event_id, beneficiary_user_id, source_user_id, source_node_id, side, volume_units, status, business_date)
         VALUES ($1, $2, $3, $4, $5, 'LEFT', 1, 'ACTIVE', $6)`,
        [uuidv4(), 'DUP-TEST', userB.id, userD.id, nodeD1, dhakaDate]
      );
    } catch (e: any) {
      duplicateConstraintCaught = true;
    }
    assert(duplicateConstraintCaught, 'Database-level UNIQUE(beneficiary_user_id, source_node_id) blocks duplicate');

    // ----------------------------------------------------
    // TEST 10: Activation BEFORE Placement (Backfill)
    // User X buys & activates 2 nodes while UNPLACED.
    // Volume should be 0 initially.
    // Then X is placed under B on LEFT.
    // Both nodes backfill to uplines (B and A).
    // ----------------------------------------------------
    const userX = await createTestUser('UX');
    // Ensure UNPLACED
    await db.query(`UPDATE binary_placements SET status = 'UNPLACED', parent_user_id = NULL, side = NULL WHERE user_id = $1`, [userX.id]);

    const nodeX1 = await createActiveNode(userX.id);
    const nodeX2 = await createActiveNode(userX.id);

    const propX1Pre = await propagateNodeSalesVolume(db, nodeX1, userX.id);
    assert(propX1Pre.eventsCreated === 0 && propX1Pre.reason === 'BUYER_NOT_PLACED', 'Activation while UNPLACED creates 0 volume initially');

    // Now place User X under D on LEFT
    await placeUser(userX.id, userD.id, 'LEFT');

    // Trigger backfill
    const backfilledCount = await backfillNodeSalesVolumeForPlacedMember(db, userX.id);
    // Ancestors of X: D, B, A (3 ancestors * 2 nodes = 6 events)
    assert(backfilledCount === 6, `Backfill created 6 volume events for 2 nodes across 3 ancestors (Created: ${backfilledCount})`);

    // Verify backfilled idempotency: calling backfill again creates 0
    const backfillReplay = await backfillNodeSalesVolumeForPlacedMember(db, userX.id);
    assert(backfillReplay === 0, 'Backfill replay is strictly idempotent (0 duplicate events)');

    // ----------------------------------------------------
    // TEST 11: Reversal Foundation
    // Reverse nodeX2:
    // Volume events should transition ACTIVE -> REVERSED.
    // Authoritative daily volume should decrement.
    // ----------------------------------------------------
    const reversedCount = await reverseNodeSalesVolume(db, nodeX2);
    assert(reversedCount === 3, `Reversal updated 3 ancestor events (Reversed: ${reversedCount})`);

    const reversedCheck = await db.query<{ status: string }>(
      `SELECT status FROM binary_volume_events WHERE source_node_id = $1`,
      [nodeX2]
    );
    const allReversed = reversedCheck.rows.every((r) => r.status === 'REVERSED');
    assert(allReversed, 'All volume events for reversed node have status = REVERSED');

    // ----------------------------------------------------
    // TEST 12: Volume Summary API Logic
    // Verify GET /api/network/volume-summary contract for User A
    // ----------------------------------------------------
    const summaryA = await getVolumeSummary(userA.id);
    assert(summaryA.businessDate === dhakaDate, `Summary businessDate matches Dhaka (${summaryA.businessDate})`);
    assert(typeof summaryA.today.left === 'number' && typeof summaryA.today.right === 'number', 'Summary contains numeric today.left and today.right');
    assert(typeof summaryA.carry.left === 'number' && typeof summaryA.carry.right === 'number', 'Summary contains numeric carry.left and carry.right');
    assert(
      typeof summaryA.availableForFutureMatching.left === 'number' &&
      typeof summaryA.availableForFutureMatching.right === 'number',
      'Summary contains availableForFutureMatching.left and right'
    );
    assert(
      summaryA.availableForFutureMatching.left >= summaryA.today.left,
      'availableForFutureMatching includes today unsettled volume'
    );

    // ----------------------------------------------------
    // TEST 13: Volume History API Logic
    // Verify GET /api/network/volume-history pagination for User A
    // ----------------------------------------------------
    const historyA = await getVolumeHistory(userA.id, 1, 10);
    assert(Array.isArray(historyA.history), 'History returns an array');
    assert(historyA.pagination.page === 1, 'Pagination page is 1');
    assert(historyA.pagination.totalCount >= 1, 'Pagination totalCount >= 1');
    if (historyA.history.length > 0) {
      const first = historyA.history[0];
      assert(
        typeof first.businessDate === 'string' &&
        typeof first.leftUnits === 'number' &&
        typeof first.rightUnits === 'number',
        'History record has businessDate, leftUnits, rightUnits'
      );
    }

  } catch (err: any) {
    console.error('Unhandled test exception:', err);
    failed++;
  }

  console.log('\n==================================================');
  console.log(`TASK #10 VOLUME TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('==================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTask10VolumeTests()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('Fatal test error:', e);
    process.exit(1);
  });
