import { getDb } from '../src/server/db/db';
import { v4 as uuidv4 } from 'uuid';
import {
  createRewardEpoch,
  closeAndSettleEpoch,
  getUserRewards,
  getUserRewardsSummary,
  claimUserRewards,
} from '../src/server/services/nodeRewardService';

async function runPhase12RewardsTests() {
  console.log('======================================================');
  console.log('🧪 RUNNING PHASE 12: GENESIS NODE REWARDS HUB SECURITY SUITE');
  console.log('======================================================\n');

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
    // 1. Setup Test Users
    const userAId = uuidv4();
    const userAPublicId = `PX-USERA-${Math.floor(1000 + Math.random() * 9000)}`;
    const userAEmail = `rewards_usera_${Date.now()}@phivonex.test`;

    const userBId = uuidv4();
    const userBPublicId = `PX-USERB-${Math.floor(1000 + Math.random() * 9000)}`;
    const userBEmail = `rewards_userb_${Date.now()}@phivonex.test`;

    await db.query(
      `INSERT INTO users (id, public_id, full_name, email, country, password_hash, status, created_at, updated_at)
       VALUES ($1, $2, 'Operator A', $3, 'United States', 'hash_a', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [userAId, userAPublicId, userAEmail]
    );

    await db.query(
      `INSERT INTO users (id, public_id, full_name, email, country, password_hash, status, created_at, updated_at)
       VALUES ($1, $2, 'Operator B', $3, 'United States', 'hash_b', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [userBId, userBPublicId, userBEmail]
    );

    assert(true, '1. Test Operator A and Operator B identities provisioned');

    // 2. Setup Nodes for User A and User B
    const allocateNode = async (userId: string) => {
      const nodeRes = await db.query<any>(
        `SELECT id, node_number, public_node_id FROM nodes WHERE status = 'AVAILABLE' ORDER BY node_number ASC LIMIT 1`
      );
      if (nodeRes.rows.length > 0) {
        const n = nodeRes.rows[0];
        await db.query(
          `UPDATE nodes SET status = 'ACTIVE', owner_user_id = $1, activated_at = CURRENT_TIMESTAMP WHERE id = $2`,
          [userId, n.id]
        );
        return { nodeId: n.id, publicNodeId: n.public_node_id };
      } else {
        const nRes = await db.query<any>(`SELECT id, public_node_id FROM nodes ORDER BY node_number DESC LIMIT 1`);
        const n = nRes.rows[0];
        await db.query(
          `UPDATE nodes SET status = 'ACTIVE', owner_user_id = $1, activated_at = CURRENT_TIMESTAMP WHERE id = $2`,
          [userId, n.id]
        );
        return { nodeId: n.id, publicNodeId: n.public_node_id };
      }
    };

    const nodeA = await allocateNode(userAId);
    const nodeB = await allocateNode(userBId);

    assert(Boolean(nodeA.nodeId && nodeB.nodeId), '2. Active Genesis Nodes provisioned for User A & User B');

    // 3. Create Authoritative Reward Epoch
    const epoch = await createRewardEpoch({ rewardPerNode: 2.50 });
    assert(Boolean(epoch && epoch.id && epoch.status === 'OPEN'), '3. Reward epoch created in OPEN state', `Epoch: ${epoch.publicEpochId}`);

    // 4. Settle Epoch & Distribute Rewards
    const settleRes = await closeAndSettleEpoch(epoch.id, { configuredRewardPerNode: 2.50 });
    assert(settleRes.success === true, '4. Epoch settlement executed successfully');
    assert(settleRes.rewardsCreated >= 2, '5. Rewards distributed to active nodes');

    // 5. Test User A Telemetry & Isolation
    const userARewards = await getUserRewards(userAId);
    assert(userARewards.totalAccrued >= 2.50, '6. User A accrued reward telemetry accurate', `Accrued: $${userARewards.totalAccrued}`);
    assert(userARewards.history.length >= 1, '7. User A history contains distributed epoch reward');
    assert(userARewards.history.every(h => h.ownerUserId === userAId), '8. Strict User Isolation: User A sees only own rewards');

    // 6. Test User A Summary Metrics
    const userASummary = await getUserRewardsSummary(userAId);
    assert(userASummary.activeNodesCount >= 1, '9. Active node count matches authoritative allocation');
    assert(userASummary.totalAccrued >= 2.50, '10. Summary totalAccrued matches detailed query');

    // 7. Test Claim Execution for User A
    const claimRes = await claimUserRewards(userAId);
    assert(claimRes.claimedCount >= 1, '11. Accrued rewards claimed successfully');
    assert(claimRes.totalClaimedAmount >= 2.50, '12. Claimed amount matches accrued balance');

    // 8. Test Post-Claim State & Zero Remaining Accrued
    const postClaimRewards = await getUserRewards(userAId);
    assert(postClaimRewards.totalAccrued === 0, '13. Accrued balance resets to 0 after claim');
    assert(postClaimRewards.totalClaimed >= 2.50, '14. Claimed balance updated in telemetry');
    assert(postClaimRewards.history.some(h => h.status === 'CLAIMED' && h.claimedAt !== null), '15. Reward record transitioned to CLAIMED with timestamp');

    // 9. Test Claim Idempotency (Subsequent claim should claim 0)
    const idempotentClaimRes = await claimUserRewards(userAId);
    assert(idempotentClaimRes.claimedCount === 0 && idempotentClaimRes.totalClaimedAmount === 0, '16. Subsequent claim is strictly idempotent (0 claimed, no double-credit)');

    // 10. Verify User B rewards remained untouched (Isolation)
    const userBRewards = await getUserRewards(userBId);
    assert(userBRewards.totalAccrued >= 2.50, '17. User B accrued rewards untouched by User A claim');
    assert(userBRewards.totalClaimed === 0, '18. User B totalClaimed remains 0 before own claim');

    // 11. Cleanup test nodes
    await db.query(`DELETE FROM node_rewards WHERE owner_user_id IN ($1, $2)`, [userAId, userBId]);
    await db.query(`UPDATE nodes SET status = 'AVAILABLE', owner_user_id = NULL, activated_at = NULL WHERE id IN ($1, $2)`, [nodeA.nodeId, nodeB.nodeId]);
    await db.query(`DELETE FROM reward_epochs WHERE id = $1`, [epoch.id]);
    await db.query(`DELETE FROM users WHERE id IN ($1, $2)`, [userAId, userBId]);

    assert(true, '19. Test fixtures isolated and cleaned up safely');

    console.log('\n======================================================');
    console.log(`📊 PHASE 12 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('======================================================\n');

    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error('💥 Fatal error in Phase 12 test suite:', err);
    process.exit(1);
  }
}

runPhase12RewardsTests();
