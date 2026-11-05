import { getDb } from '../src/server/db/db';
import { seedGenealogyNetworkTree } from '../src/server/services/genealogySeedService';

async function fixDuplicates() {
  const db = await getDb();
  console.log('Finding users with multiple active nodes...');
  const usersRes = await db.query<{ owner_user_id: string }>(
    `SELECT owner_user_id FROM nodes WHERE status IN ('ACTIVE', 'PURCHASED', 'EMITTING', 'MATURED') GROUP BY owner_user_id HAVING COUNT(*) > 1`
  );

  for (const row of usersRes.rows) {
    const userId = row.owner_user_id;
    const nodesRes = await db.query<{ id: string }>(
      `SELECT id FROM nodes WHERE owner_user_id = $1 ORDER BY created_at ASC`,
      [userId]
    );
    const extraIds = nodesRes.rows.slice(1).map((n) => n.id);
    if (extraIds.length > 0) {
      console.log(`Cleaning up ${extraIds.length} extra nodes for user ${userId}`);
      await db.query(
        `UPDATE nodes SET status = 'AVAILABLE', owner_user_id = NULL, purchase_timestamp = NULL, activated_at = NULL, maturity_timestamp = NULL, distributed_phivo = 0, remaining_phivo = 10000, updated_at = NOW() WHERE id = ANY($1::uuid[])`,
        [extraIds]
      );
    }
  }

  console.log('Re-running seedGenealogyNetworkTree...');
  await seedGenealogyNetworkTree();
  console.log('Duplicate node fix completed successfully.');
}

fixDuplicates().catch((err) => {
  console.error('Fix duplicate nodes failed:', err);
  process.exit(1);
});
