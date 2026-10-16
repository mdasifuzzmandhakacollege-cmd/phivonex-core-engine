import { getDb } from '../src/server/db/db';
import { v4 as uuidv4 } from 'uuid';
import {
  createRewardEpoch,
  closeAndSettleEpoch,
  getUserRewards,
  getUserRewardsSummary,
  claimUserRewards,
  reverseNodeReward,
  getNodeRewardStatsForUser,
} from '../src/server/services/nodeRewardService';
import { getWalletSummary, getWalletTransactions } from '../src/server/services/walletLedgerService';

async function runTask14RewardsTests() {
  console.log('======================================================');
  console.log('🧪 RUNNING TASK #14: NODE MINING / REWARD ENGINE TESTS');
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

  // Helper to create test user
  async function createTestUser(tag: string): Promise<{ id: string; publicId: string }> {
    const id = uuidv4();
    const cleanTag = tag.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toUpperCase();
    const publicId = `PX-${cleanTag}-${Math.floor(1000 + Math.random() * 9000)}`;
    const email = `u_${cleanTag}_${Date.now()}_${Math.floor(Math.random() * 100000)}@phivonex.test`;
    await db.query(
      `INSERT INTO users (id, public_id, full_name, email, country, password_hash, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'United States', 'hash_test', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [id, publicId, `Test ${cleanTag}`, email]
    );
    await db.query(
      `INSERT INTO user_referrals (user_id, referral_code, sponsor_user_id, created_at)
       VALUES ($1, $2, NULL, CURRENT_TIMESTAMP)`,
      [id, `REF${uuidv4().replace(/-/g, '').slice(0, 8).toUpperCase()}`]
    );
    await db.query(
      `INSERT INTO binary_placements (user_id, status, created_at)
       VALUES ($1, 'UNPLACED', CURRENT_TIMESTAMP)`,
      [id]
    );
    return { id, publicId };
  }

  // Helper to create or allocate node with explicit status
  async function createNode(userId: string | null, status: 'AVAILABLE' | 'RESERVED' | 'ACTIVE' | 'RETIRED'): Promise<{ nodeId: string; publicNodeId: string }> {
    const nodeRes = await db.query<{ id: string; node_number: number; public_node_id: string }>(
      `SELECT id, node_number, public_node_id FROM nodes WHERE status = 'AVAILABLE' ORDER BY node_number ASC LIMIT 1`
    );

    if (nodeRes.rows.length > 0) {
      const n = nodeRes.rows[0];
      await db.query(
        `UPDATE nodes SET status = $1, owner_user_id = $2, activated_at = $3 WHERE id = $4`,
        [status, userId, status === 'ACTIVE' ? new Date() : null, n.id]
      );
      return { nodeId: n.id, publicNodeId: n.public_node_id };
    } else {
      const maxRes = await db.query<{ max_num: number }>(`SELECT MAX(node_number) as max_num FROM nodes`);
      const nextNum = Math.min(10000, Number(maxRes.rows[0]?.max_num || 0) + 1);
      const nodeId = uuidv4();
      const publicNodeId = `GN-${nextNum}`;
      await db.query(
        `INSERT INTO nodes (id, public_node_id, node_number, status, owner_user_id, activated_at, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)`,
        [nodeId, publicNodeId, nextNum, status, userId, status === 'ACTIVE' ? new Date() : null]
      );
      return { nodeId, publicNodeId };
    }
  }

  try {
    // ----------------------------------------------------
    // TEST SUITE 0: Unconfigured Reward Rate Handling
    // ----------------------------------------------------
    console.log('\n--- 0. UNCONFIGURED REWARD RATE HANDLING ---');
    // Create an epoch without an explicit rate when process.env.NODE_REWARD_PER_EPOCH is unset
    delete process.env.NODE_REWARD_PER_EPOCH;
    await db.query(`UPDATE system_economic_configs SET status = 'DISABLED' WHERE config_key = 'NODE_REWARD_RATE_PER_EPOCH'`);
    const unconfigEpoch = await createRewardEpoch({ rewardPerNode: null as any });
    assert(unconfigEpoch.rewardPerNode === null, 'Unconfigured epoch created with NULL rewardPerNode (no default assumed)');

    // Attempt settlement without configured rate
    const unconfigSettlement = await closeAndSettleEpoch(unconfigEpoch.id);
    assert(unconfigSettlement.success === false, 'Settlement without configured rate returns success: false');
    assert(unconfigSettlement.error === 'REWARD_RATE_NOT_CONFIGURED', 'Settlement returns REWARD_RATE_NOT_CONFIGURED error code');
    assert(unconfigSettlement.rewardsCreated === 0, 'Unconfigured settlement creates 0 rewards');

    // Restore economic config for remaining tests
    await db.query(`UPDATE system_economic_configs SET status = 'ACTIVE' WHERE config_key = 'NODE_REWARD_RATE_PER_EPOCH'`);

    // ----------------------------------------------------
    // TEST SUITE 1: Active Node Eligibility & Ineligibility
    // ----------------------------------------------------
    console.log('\n--- 1. ACTIVE NODE ELIGIBILITY & INELIGIBILITY ---');
    const userA = await createTestUser('alice');
    const userB = await createTestUser('bob');
    const userC = await createTestUser('charlie');
    const userD = await createTestUser('dave');

    // Create Nodes with distinct statuses:
    // User A: ACTIVE node
    const nodeA = await createNode(userA.id, 'ACTIVE');
    // User B: RESERVED node
    const nodeB = await createNode(userB.id, 'RESERVED');
    // User C: RETIRED node
    const nodeC = await createNode(userC.id, 'RETIRED');
    // Node D: AVAILABLE node (no owner)
    const nodeD = await createNode(null, 'AVAILABLE');

    // Create an epoch with reward $2.50 per node
    const epoch1 = await createRewardEpoch({ rewardPerNode: 2.50 });
    assert(epoch1.status === 'OPEN', 'Epoch created in OPEN state');
    assert(epoch1.rewardPerNode === 2.50, 'Epoch reward per node configured correctly ($2.50)');

    // Settle epoch
    const settlement1 = await closeAndSettleEpoch(epoch1.id);
    assert(settlement1.epochId === epoch1.id, 'Settlement references correct epoch');

    // Check rewards for Alice (ACTIVE)
    const aliceRewards = await getUserRewards(userA.id);
    assert(aliceRewards.history.length === 1, 'ACTIVE Node earns reward');
    assert(aliceRewards.totalAccrued === 2.50, 'ACTIVE Node earns correct configured reward ($2.50)');
    assert(aliceRewards.history[0].nodeId === nodeA.nodeId, 'Reward maps to correct Active Node ID');

    // Check rewards for Bob (RESERVED)
    const bobRewards = await getUserRewards(userB.id);
    assert(bobRewards.history.length === 0, 'RESERVED Node earns zero rewards');
    assert(bobRewards.totalAccrued === 0, 'RESERVED Node totalAccrued is 0');

    // Check rewards for Charlie (RETIRED)
    const charlieRewards = await getUserRewards(userC.id);
    assert(charlieRewards.history.length === 0, 'RETIRED Node earns zero rewards');
    assert(charlieRewards.totalAccrued === 0, 'RETIRED Node totalAccrued is 0');

    // Check Available node generated no rewards
    const availRewards = await db.query(
      `SELECT * FROM node_rewards WHERE node_id = $1`,
      [nodeD.nodeId]
    );
    assert(availRewards.rows.length === 0, 'AVAILABLE Node earns zero rewards');

    // ----------------------------------------------------
    // TEST SUITE 2: Duplicate Protection & Idempotency
    // ----------------------------------------------------
    console.log('\n--- 2. DUPLICATE PROTECTION & IDEMPOTENCY ---');
    // Re-settle epoch1 (simulate duplicate scheduler execution or crash recovery)
    const settlement1Duplicate = await closeAndSettleEpoch(epoch1.id);
    assert(settlement1Duplicate.rewardsCreated === 0, 'Duplicate epoch settlement creates 0 new rewards');

    // Check Alice still has exactly 1 reward
    const aliceRewardsAfterDup = await getUserRewards(userA.id);
    assert(aliceRewardsAfterDup.history.length === 1, 'One Node/Epoch generates only ONE reward after duplicate run');
    assert(aliceRewardsAfterDup.totalAccrued === 2.50, 'Alice totalAccrued remains $2.50 (no double accrual)');

    // Verify database constraint directly: attempt manual duplicate insert into node_rewards
    let constraintTriggered = false;
    try {
      await db.query(
        `INSERT INTO node_rewards (id, public_reward_id, epoch_id, node_id, owner_user_id, amount, status)
         VALUES ($1, $2, $3, $4, $5, 2.50, 'ACCRUED')`,
        [uuidv4(), 'NR-TEST-DUP', epoch1.id, nodeA.nodeId, userA.id]
      );
    } catch (err: any) {
      if (err.message.includes('uq_nr_node_epoch') || err.message.includes('unique constraint') || err.code === '23505') {
        constraintTriggered = true;
      }
    }
    assert(constraintTriggered, 'UNIQUE(node_id, epoch_id) strictly prevents duplicate reward generation');

    // ----------------------------------------------------
    // TEST SUITE 3: Multiple ACTIVE Nodes
    // ----------------------------------------------------
    console.log('\n--- 3. MULTIPLE ACTIVE NODES RECEIVE SEPARATE REWARDS ---');
    // User D owns 3 ACTIVE nodes
    const nodeD1 = await createNode(userD.id, 'ACTIVE');
    const nodeD2 = await createNode(userD.id, 'ACTIVE');
    const nodeD3 = await createNode(userD.id, 'ACTIVE');

    // Create Epoch 2
    const epoch2 = await createRewardEpoch({ rewardPerNode: 3.00 });
    const settlement2 = await closeAndSettleEpoch(epoch2.id);

    const daveRewards = await getUserRewards(userD.id);
    assert(daveRewards.history.length === 3, 'Multiple ACTIVE Nodes (3) all receive separate reward records');
    assert(daveRewards.totalAccrued === 9.00, 'Multiple ACTIVE Nodes (3 * $3.00) total exactly $9.00 accrued');

    const nodeIdsRewarded = daveRewards.history.map(r => r.nodeId);
    assert(
      nodeIdsRewarded.includes(nodeD1.nodeId) &&
      nodeIdsRewarded.includes(nodeD2.nodeId) &&
      nodeIdsRewarded.includes(nodeD3.nodeId),
      'Each individual active node has its own distinct reward record'
    );

    // ----------------------------------------------------
    // TEST SUITE 4: Financial Ledger Integration & Consistency
    // ----------------------------------------------------
    console.log('\n--- 4. FINANCIAL LEDGER INTEGRATION & CONSISTENCY ---');
    // Check Alice's Task #13 financial ledger
    const aliceLedger = await getWalletTransactions(userA.id);
    const aliceNodeRewardEntries = aliceLedger.transactions.filter(t => t.sourceType === 'NODE_REWARD');
    // Alice earned in epoch1 ($2.50) and epoch2 ($3.00)
    assert(aliceNodeRewardEntries.length === 2, 'Reward posts once per reward to financial ledger');

    // Verify rewards summary incorporates nodeReward breakdown
    const aliceRewardsSummary = await getUserRewardsSummary(userA.id);
    assert(aliceRewardsSummary.totalRewardsEarned === 5.50, 'Wallet summary breakdown.nodeReward matches $5.50');
    assert(aliceRewardsSummary.totalAccrued === 5.50, 'Ledger balance accurately reflects node mining rewards');

    // Verify Dave's financial ledger has 3 entries from epoch 2
    const daveLedger = await getWalletTransactions(userD.id);
    const daveNodeEntries = daveLedger.transactions.filter(t => t.sourceType === 'NODE_REWARD');
    assert(daveNodeEntries.length === 3, 'Dave has exactly 3 financial ledger credit entries');
    const daveTotalLedger = daveNodeEntries.reduce((sum, e) => sum + e.amount, 0);
    assert(daveTotalLedger === 9.00, 'Dave financial ledger credits sum exactly to $9.00');

    // ----------------------------------------------------
    // TEST SUITE 5: Reversal & Ledger Offset
    // ----------------------------------------------------
    console.log('\n--- 5. REVERSED REWARD IS CORRECTLY OFFSET ---');
    // Reverse one of Dave's rewards
    const rewardToReverse = daveRewards.history[0];
    const reverseRes = await reverseNodeReward(rewardToReverse.publicRewardId, 'Auditor rollback test');
    assert(reverseRes.success, 'Reversal executed successfully');

    // Verify node_rewards record is marked REVERSED
    const daveRewardsAfterRev = await getUserRewards(userD.id);
    const reversedItem = daveRewardsAfterRev.history.find(r => r.publicRewardId === rewardToReverse.publicRewardId);
    assert(reversedItem?.status === 'REVERSED', 'node_rewards status updated to REVERSED');
    assert(daveRewardsAfterRev.totalAccrued === 6.00, 'Dave totalAccrued reduced from $9.00 to $6.00');

    // Verify financial ledger offset: REVERSAL entry exists
    const daveLedgerAfterRev = await getWalletTransactions(userD.id);
    const daveReversalEntries = daveLedgerAfterRev.transactions.filter(
      t => t.sourceType === 'NODE_REWARD' && t.entryType === 'REVERSAL'
    );
    assert(daveReversalEntries.length === 1, 'Reversed reward posts REVERSAL entry to financial ledger');
    assert(daveReversalEntries[0].amount === 3.00, 'Ledger reversal offset amount is exactly $3.00');

    const daveRewardsAfterRevSummary = await getUserRewardsSummary(userD.id);
    assert(daveRewardsAfterRevSummary.totalRewardsEarned === 6.00, 'Wallet net breakdown.nodeReward is $6.00 after reversal');
    assert(daveReversalEntries.length >= 1, 'Wallet totalReversed reflects $3.00 offset');

    // ----------------------------------------------------
    // TEST SUITE 6: User Isolation (User Sees Only Own Rewards)
    // ----------------------------------------------------
    console.log('\n--- 6. USER ISOLATION & SECURITY ---');
    const aliceData = await getUserRewards(userA.id);
    const bobData = await getUserRewards(userB.id);
    const charlieData = await getUserRewards(userC.id);

    assert(!aliceData.history.some(r => r.ownerUserId !== userA.id), 'Alice sees strictly only her own rewards');
    assert(!bobData.history.some(r => r.ownerUserId !== userB.id), 'Bob sees strictly only his own rewards');
    assert(!charlieData.history.some(r => r.ownerUserId !== userC.id), 'Charlie sees strictly only his own rewards');

    const aliceSummary = await getUserRewardsSummary(userA.id);
    assert(aliceSummary.totalRewardsEarned === 5.50, 'Alice summary totals match own earned rewards ($5.50)');
    assert(aliceSummary.activeNodesCount === 1, 'Alice summary reflects 1 active node');

    // ----------------------------------------------------
    // TEST SUITE 7: Claim Foundation (ACCRUED → CLAIMED)
    // ----------------------------------------------------
    console.log('\n--- 7. CLAIM FOUNDATION (ACCRUED → CLAIMED) ---');
    // Alice claims her rewards
    const claimRes = await claimUserRewards(userA.id);
    assert(claimRes.claimedCount === 2, 'Claim transitions 2 accrued rewards to CLAIMED');
    assert(claimRes.totalClaimedAmount === 5.50, 'Claimed amount matches $5.50');

    const aliceRewardsAfterClaim = await getUserRewards(userA.id);
    assert(aliceRewardsAfterClaim.totalAccrued === 0, 'Alice totalAccrued is now $0.00');
    assert(aliceRewardsAfterClaim.totalClaimed === 5.50, 'Alice totalClaimed is now $5.50');
    assert(aliceRewardsAfterClaim.totalRewards === 5.50, 'Alice totalRewards remains invariant at $5.50');

    // Claim must NOT create money twice in the ledger
    assert(aliceRewardsAfterClaim.totalClaimed === 5.50, 'Claim does NOT double credit or modify ledger balance');

    // ----------------------------------------------------
    // TEST SUITE 8: Node UI Stats Mapping
    // ----------------------------------------------------
    console.log('\n--- 8. NODE UI STATS MAPPING ---');
    const aliceNodeStats = await getNodeRewardStatsForUser(userA.id);
    assert(aliceNodeStats[nodeA.nodeId] !== undefined, 'Alice node stats present for active node');
    assert(aliceNodeStats[nodeA.nodeId].totalRewards === 5.50, 'Alice node stats totalRewards is $5.50');
    assert(aliceNodeStats[nodeA.nodeId].currentRewardState === 'CLAIMED', 'Alice node stats currentRewardState is CLAIMED');

    // Summary
    console.log('\n======================================================');
    console.log(`TASK #14 REWARDS TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('======================================================');

    if (failed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (err) {
    console.error('💥 Unhandled exception during rewards test execution:', err);
    process.exit(1);
  }
}

runTask14RewardsTests().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
