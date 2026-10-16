import { getDb } from '../src/server/db/db';
import {
  GENESIS_NODE_CAP,
  NODE_BASE_PRICE_USD,
  isValidNodeStateTransition,
  formatPublicNodeId,
  NodeStatus
} from '../src/config/nodeConfig';
import { v4 as uuidv4 } from 'uuid';
import { generatePublicId } from '../src/server/utils/idGenerator';

async function runTask6NodeTests() {
  console.log('==================================================');
  console.log('🧪 RUNNING TASK #6: GENESIS NODE INVENTORY TESTS');
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

  try {
    // 1. Total Genesis Inventory Count
    const totalCountRes = await db.query<{ count: string | number }>(
      `SELECT COUNT(*)::int AS count FROM nodes`
    );
    const totalCount = parseInt(String(totalCountRes.rows[0]?.count || '0'), 10);
    assert(totalCount === GENESIS_NODE_CAP, `Inventory Contains Exactly 10,000 Nodes (Found: ${totalCount})`);

    // 2. Unique Node Numbers & Range Check
    const minMaxRes = await db.query<{ min_num: number; max_num: number; distinct_nums: number }>(
      `SELECT MIN(node_number) AS min_num, MAX(node_number) AS max_num, COUNT(DISTINCT node_number)::int AS distinct_nums FROM nodes`
    );
    const minNum = Number(minMaxRes.rows[0].min_num);
    const maxNum = Number(minMaxRes.rows[0].max_num);
    const distinctNums = Number(minMaxRes.rows[0].distinct_nums);

    assert(minNum === 1 && maxNum === 10000, `Node Numbers Range [1, 10000] (Min: ${minNum}, Max: ${maxNum})`);
    assert(distinctNums === 10000, `All 10,000 Node Numbers Are Unique (Distinct: ${distinctNums})`);

    // 3. Unique Public Node IDs & Format
    const distinctRes = await db.query<{ distinct_ids: number }>(
      `SELECT COUNT(DISTINCT public_node_id)::int AS distinct_ids FROM nodes`
    );
    const sample1Res = await db.query<{ public_node_id: string }>(
      `SELECT public_node_id FROM nodes WHERE node_number = 1`
    );
    const sample10000Res = await db.query<{ public_node_id: string }>(
      `SELECT public_node_id FROM nodes WHERE node_number = 10000`
    );
    const distinctIds = Number(distinctRes.rows[0].distinct_ids);
    const sample1 = sample1Res.rows[0].public_node_id;
    const sample10000 = sample10000Res.rows[0].public_node_id;

    assert(distinctIds === 10000, `All 10,000 Public Node IDs Are Unique (Distinct: ${distinctIds})`);
    assert(sample1 === 'PHX-NODE-000001', `Node #1 Format Correct ('${sample1}')`);
    assert(sample10000 === 'PHX-NODE-010000', `Node #10000 Format Correct ('${sample10000}')`);

    // 4. DB Constraint: Cap cannot exceed 10,000
    let capExceededCaught = false;
    try {
      await db.query(
        `INSERT INTO nodes (id, node_number, public_node_id, status) VALUES ($1, $2, $3, $4)`,
        [uuidv4(), 10001, 'PHX-NODE-010001', 'AVAILABLE']
      );
    } catch {
      capExceededCaught = true;
    }
    assert(capExceededCaught, 'DB Constraint Rejects Node Number > 10,000');

    // 5. DB Constraint: Node number < 1 rejected
    let subZeroCaught = false;
    try {
      await db.query(
        `INSERT INTO nodes (id, node_number, public_node_id, status) VALUES ($1, $2, $3, $4)`,
        [uuidv4(), 0, 'PHX-NODE-000000', 'AVAILABLE']
      );
    } catch {
      subZeroCaught = true;
    }
    assert(subZeroCaught, 'DB Constraint Rejects Node Number < 1');

    // 6. DB Constraint: AVAILABLE node must NOT have an owner
    const testUserId = uuidv4();
    await db.query(
      `INSERT INTO users (id, public_id, full_name, email, country, password_hash)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [testUserId, generatePublicId(), 'Test Node Owner', `node.tester.${Date.now()}@phivonex.org`, 'United States', '$argon2id$v=19$m=65536,t=3,p=4$fakehash']
    );

    let availableWithOwnerCaught = false;
    try {
      await db.query(
        `UPDATE nodes SET status = 'AVAILABLE', owner_user_id = $1 WHERE node_number = 1`,
        [testUserId]
      );
    } catch {
      availableWithOwnerCaught = true;
    }
    assert(availableWithOwnerCaught, 'DB Constraint Enforces AVAILABLE Node Cannot Have Owner');

    // 7. DB Constraint: ACTIVE node requires an owner
    let activeWithoutOwnerCaught = false;
    try {
      await db.query(
        `UPDATE nodes SET status = 'ACTIVE', owner_user_id = NULL WHERE node_number = 1`
      );
    } catch {
      activeWithoutOwnerCaught = true;
    }
    assert(activeWithoutOwnerCaught, 'DB Constraint Enforces ACTIVE Node Requires Owner');

    // 8. Lifecycle State Transitions Validation
    assert(isValidNodeStateTransition('AVAILABLE', 'RESERVED') === true, 'Valid Transition: AVAILABLE -> RESERVED');
    assert(isValidNodeStateTransition('RESERVED', 'ACTIVE') === true, 'Valid Transition: RESERVED -> ACTIVE');
    assert(isValidNodeStateTransition('RESERVED', 'AVAILABLE') === true, 'Valid Transition: RESERVED -> AVAILABLE');
    assert(isValidNodeStateTransition('ACTIVE', 'RETIRED') === true, 'Valid Transition: ACTIVE -> RETIRED');
    assert(isValidNodeStateTransition('ACTIVE', 'AVAILABLE') === false, 'Invalid Transition Rejected: ACTIVE -> AVAILABLE');
    assert(isValidNodeStateTransition('RETIRED', 'AVAILABLE') === false, 'Invalid Transition Rejected: RETIRED -> AVAILABLE');
    assert(isValidNodeStateTransition('AVAILABLE', 'ACTIVE') === false, 'Invalid Direct Transition Rejected: AVAILABLE -> ACTIVE');

    // 9. Supply Statistics & Invariant Check (available + reserved + active + retired = 10000)
    const statsRes = await db.query<{ status: string; count: number }>(
      `SELECT status, COUNT(*)::int AS count FROM nodes GROUP BY status`
    );
    let availableCount = 0;
    let reservedCount = 0;
    let activeCount = 0;
    let retiredCount = 0;

    for (const row of statsRes.rows) {
      const c = Number(row.count);
      if (row.status === 'AVAILABLE') availableCount = c;
      if (row.status === 'RESERVED') reservedCount = c;
      if (row.status === 'ACTIVE') activeCount = c;
      if (row.status === 'RETIRED') retiredCount = c;
    }

    const totalSum = statsRes.rows.reduce((sum, r) => sum + Number(r.count), 0);
    assert(totalSum === GENESIS_NODE_CAP, `Supply Invariant Holds (Sum: ${totalSum} === 10,000)`);
    assert(NODE_BASE_PRICE_USD === 1000, `Authoritative Base Price USD Is Exactly $1,000`);

    // 10. User Isolation on Owned Nodes
    // Assign Node #5 to testUserId as ACTIVE
    await db.query(
      `UPDATE nodes SET status = 'ACTIVE', owner_user_id = $1, activated_at = CURRENT_TIMESTAMP WHERE node_number = 5`,
      [testUserId]
    );

    const userOwnedRes = await db.query(
      `SELECT public_node_id, node_number, status, activated_at FROM nodes WHERE owner_user_id = $1`,
      [testUserId]
    );
    assert(userOwnedRes.rows.length === 1, 'User Owns Exactly 1 Active Node');
    assert(userOwnedRes.rows[0].node_number === 5, 'User Owns Node #5');
    assert(userOwnedRes.rows[0].public_node_id === 'PHX-NODE-000005', 'Public Node ID Matches PHX-NODE-000005');

    // Other user query gets 0 nodes
    const otherUserId = uuidv4();
    const otherUserNodesRes = await db.query(
      `SELECT public_node_id FROM nodes WHERE owner_user_id = $1`,
      [otherUserId]
    );
    assert(otherUserNodesRes.rows.length === 0, 'Isolated User Queries Return Empty Node List');

    // Reset test node back to AVAILABLE
    await db.query(
      `UPDATE nodes SET status = 'AVAILABLE', owner_user_id = NULL, activated_at = NULL WHERE node_number = 5`
    );

    // Verify Invariant preserved
    const finalStats = await db.query<{ status: string; count: number }>(`SELECT status, COUNT(*)::int AS count FROM nodes GROUP BY status`);
    const finalSum = finalStats.rows.reduce((acc, r) => acc + Number(r.count), 0);
    assert(finalSum === GENESIS_NODE_CAP, `All 10,000 Nodes Preserved in Genesis Invariant (Sum: ${finalSum})`);

  } catch (err) {
    console.error('Test run failed with unhandled error:', err);
    failed++;
  }

  console.log('\n==================================================');
  console.log(`📊 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('==================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTask6NodeTests();
