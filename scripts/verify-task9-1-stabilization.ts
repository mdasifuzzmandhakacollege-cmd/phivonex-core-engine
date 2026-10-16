import { getDb } from '../src/server/db/db';
import { GENESIS_NODE_CAP, NODE_BASE_PRICE_USD } from '../src/config/nodeConfig';
import { cleanupExpiredReservations } from '../src/server/services/nodeOrderService';

let passed = 0;
let failed = 0;

function assert(condition: boolean, desc: string, detail?: string) {
  if (condition) {
    console.log(`  [PASS] ${desc}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${desc}${detail ? ` -> ${detail}` : ''}`);
    failed++;
  }
}

async function verifyStabilization() {
  console.log('====================================================');
  console.log('PHIVONEX TASK #9.1: RUNTIME STABILIZATION VERIFICATION');
  console.log('====================================================\n');

  // 1. Concurrent getDb() Calls (Singleton Promise Barrier)
  console.log('--- 1. Testing Concurrent getDb() Singleton Initialization ---');
  const dbCalls = await Promise.all([
    getDb(),
    getDb(),
    getDb(),
    getDb(),
    getDb(),
  ]);

  const firstDb = dbCalls[0];
  const allIdentical = dbCalls.every((db) => db === firstDb);
  assert(allIdentical, 'All concurrent getDb() calls returned the exact same database client singleton');

  // 2. Genesis Node Supply Invariant
  console.log('\n--- 2. Verifying Genesis Node Supply Invariant ---');
  await cleanupExpiredReservations(firstDb);

  const statsRes = await firstDb.query<{ status: string; count: string | number }>(`
    SELECT status, COUNT(*)::int AS count 
    FROM nodes 
    GROUP BY status
  `);

  let available = 0;
  let reserved = 0;
  let active = 0;
  let retired = 0;

  for (const row of statsRes.rows) {
    const cnt = parseInt(String(row.count), 10) || 0;
    switch (row.status) {
      case 'AVAILABLE':
        available = cnt;
        break;
      case 'RESERVED':
        reserved = cnt;
        break;
      case 'ACTIVE':
        active = cnt;
        break;
      case 'RETIRED':
        retired = cnt;
        break;
    }
  }

  console.log(`  Live Node Stats: Available=${available}, Reserved=${reserved}, Active=${active}, Retired=${retired}`);
  
  const totalAccounted = available + reserved + active + retired;
  assert(
    totalAccounted === GENESIS_NODE_CAP,
    `Supply Invariant: available (${available}) + reserved (${reserved}) + active (${active}) + retired (${retired}) = ${GENESIS_NODE_CAP}`
  );

  // 3. Database Inventory Row Count & Uniqueness
  console.log('\n--- 3. Verifying Node Records Integrity ---');
  const nodeCountRes = await firstDb.query<{ count: string }>(`SELECT COUNT(*)::int AS count FROM nodes`);
  const totalRows = parseInt(nodeCountRes.rows[0]?.count || '0', 10);
  assert(totalRows === GENESIS_NODE_CAP, `Total node table rows equals 10,000 (Actual: ${totalRows})`);

  const duplicateCheck = await firstDb.query<{ count: string }>(
    `SELECT node_number, COUNT(*) FROM nodes GROUP BY node_number HAVING COUNT(*) > 1`
  );
  assert(duplicateCheck.rows.length === 0, 'Zero duplicate node numbers in inventory');

  // 4. Verify binary_placements & user_referrals tables integrity
  console.log('\n--- 4. Verifying Table Schemas & Constraints Integrity ---');
  const tables = ['users', 'sessions', 'security_events', 'user_referrals', 'nodes', 'node_orders', 'referral_commissions', 'binary_placements'];
  for (const table of tables) {
    const check = await firstDb.query(`SELECT 1 FROM ${table} LIMIT 1`);
    assert(check !== undefined, `Table '${table}' is accessible and operational`);
  }

  console.log('\n====================================================');
  console.log(`STABILIZATION VERIFICATION: ${passed} PASSED | ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

verifyStabilization().catch((err) => {
  console.error('[Verification Error]', err);
  process.exit(1);
});
