import { PGlite } from '@electric-sql/pglite';
import path from 'path';

async function cleanupPreviewTestData() {
  console.log('====================================================');
  console.log('🧹 PHIVONEX — PREVIEW DATABASE TEST CONTAMINATION CLEANUP');
  console.log('====================================================\n');

  const dataDir = path.resolve(process.cwd(), '.data/pglite_db');
  const db = new PGlite(dataDir);
  await db.waitReady;

  try {
    // 1. Inspect initial state
    const initialUsers = await db.query<{ count: string | number }>('SELECT COUNT(*)::int AS count FROM users');
    const initialNodes = await db.query<{ status: string; count: string | number }>(
      'SELECT status, COUNT(*)::int AS count FROM nodes GROUP BY status'
    );
    console.log('Initial user count:', initialUsers.rows[0].count);
    console.log('Initial node stats:', initialNodes.rows);

    // 2. Identify test users
    const testUsersRes = await db.query<{ id: string; email: string }>(
      `SELECT id, email FROM users WHERE email LIKE '%@phivonex.test%' OR email LIKE 'test-%'`
    );
    console.log(`Found ${testUsersRes.rows.length} test users to purge.`);

    const realUsersRes = await db.query<{ id: string; email: string }>(
      `SELECT id, email FROM users WHERE email NOT LIKE '%@phivonex.test%' AND email NOT LIKE 'test-%'`
    );
    console.log(`Preserving ${realUsersRes.rows.length} real users:`, realUsersRes.rows.map(u => u.email));

    // 3. Reset nodes assigned to test users back to AVAILABLE
    const resetNodesRes = await db.query(
      `UPDATE nodes
       SET status = 'AVAILABLE',
           owner_user_id = NULL,
           activated_at = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE owner_user_id IN (
         SELECT id FROM users WHERE email LIKE '%@phivonex.test%' OR email LIKE 'test-%'
       )`
    );
    console.log(`Reset contaminated nodes back to AVAILABLE: ${resetNodesRes.affectedRows ?? 'ok'}`);

    // 4. Delete dependent test records
    await db.query(`
      DELETE FROM binary_volume_events
      WHERE beneficiary_user_id IN (SELECT id FROM users WHERE email LIKE '%@phivonex.test%' OR email LIKE 'test-%')
         OR source_user_id IN (SELECT id FROM users WHERE email LIKE '%@phivonex.test%' OR email LIKE 'test-%')
    `);
    console.log('Deleted test binary_volume_events.');

    await db.query(`
      DELETE FROM promotion_bonuses
      WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@phivonex.test%' OR email LIKE 'test-%')
    `);
    console.log('Deleted test promotion_bonuses.');

    await db.query(`
      DELETE FROM notifications
      WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@phivonex.test%' OR email LIKE 'test-%')
    `);
    console.log('Deleted test notifications.');

    await db.query(`
      DELETE FROM financial_ledger_entries
      WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@phivonex.test%' OR email LIKE 'test-%')
    `);
    console.log('Deleted test financial_ledger_entries.');

    await db.query(`
      DELETE FROM binary_placements
      WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@phivonex.test%' OR email LIKE 'test-%')
    `);
    console.log('Deleted test binary_placements.');

    await db.query(`
      DELETE FROM binary_volume_balances
      WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@phivonex.test%' OR email LIKE 'test-%')
    `);
    console.log('Deleted test binary_volume_balances.');

    await db.query(`
      DELETE FROM user_referrals
      WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@phivonex.test%' OR email LIKE 'test-%')
         OR sponsor_user_id IN (SELECT id FROM users WHERE email LIKE '%@phivonex.test%' OR email LIKE 'test-%')
    `);
    console.log('Deleted test user_referrals.');

    // 5. Purge test users
    await db.query(`
      DELETE FROM users
      WHERE email LIKE '%@phivonex.test%' OR email LIKE 'test-%'
    `);
    console.log('Purged test users.');

    // 6. Verification
    const finalUsers = await db.query<{ count: string | number }>('SELECT COUNT(*)::int AS count FROM users');
    const finalRealUsers = await db.query<{ id: string; email: string }>('SELECT id, email FROM users');
    const finalNodes = await db.query<{ status: string; count: string | number }>(
      'SELECT status, COUNT(*)::int AS count FROM nodes GROUP BY status ORDER BY status'
    );
    const finalActiveNodes = await db.query<{ count: string | number }>(
      `SELECT COUNT(*)::int AS count FROM nodes WHERE status = 'ACTIVE'`
    );

    console.log('\n--- VERIFICATION AFTER CLEANUP ---');
    console.log('Remaining users:', finalUsers.rows[0].count);
    console.log('Users list:', finalRealUsers.rows);
    console.log('Final node stats:', finalNodes.rows);
    console.log('Active nodes count:', finalActiveNodes.rows[0].count);

    if (Number(finalActiveNodes.rows[0].count) !== 0) {
      throw new Error(`Expected 0 active nodes after cleanup, got: ${finalActiveNodes.rows[0].count}`);
    }

    console.log('\n✅ PREVIEW DATABASE TEST CONTAMINATION CLEANUP COMPLETE!');
  } finally {
    await db.close();
  }
}

cleanupPreviewTestData()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Cleanup failed:', err);
    process.exit(1);
  });
