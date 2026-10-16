/**
 * PHIVONEX — PF-10: DYNAMIC ADMIN-CONTROLLED DAILY PHIVO REWARD & PUBLIC DATA AUDIT
 * 
 * Verifies:
 * A. Admin rate = 10 -> Active Node receives exactly 10 PHIVO.
 * B. Admin rate changed from 10 to 15 -> Previous reward remains 10, Next epoch gives 15.
 * C. Remaining allocation = 7, Admin rate = 10 -> Reward = 7, Remaining = 0, Status = MATURED.
 * D. Duplicate same-node same-epoch execution -> No duplicate reward (idempotency).
 * E. Admin changes rate during an active epoch -> Entire epoch uses one snapped config version.
 * F. Landing page contains no exact node count, node cap, active/available counter, or fixed "25 PHIVO/day" copy.
 */

process.env.APP_ENV = 'development';
process.env.NODE_ENV = 'test';

import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

const testDataDir = path.resolve(process.cwd(), `.data/test_pf10_${uuidv4()}`);
process.env.PGLITE_DATA_DIR = testDataDir;

import { getDb } from '../src/server/db/db';
import { createRewardEpoch, closeAndSettleEpoch, getUserRewards } from '../src/server/services/nodeRewardService';
import { updateEconomicConfig, getEconomicConfigByKey, getNodeRewardRatePerEpoch } from '../src/server/services/economicService';

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

async function runPf10Tests() {
  console.log('\n===============================================================');
  console.log('🧪 PHIVONEX — PF-10: DYNAMIC DAILY REWARD & PUBLIC DATA AUDIT');
  console.log('===============================================================\n');

  try {
    const db = await getDb();

    // Helper: Create user
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
        `INSERT INTO binary_placements (user_id, status, created_at) VALUES ($1, 'PLACED', CURRENT_TIMESTAMP)`,
        [id]
      );
      return { id, publicId };
    }

    const adminUser = await createTestUser('admin');
    const adminUserId = adminUser.id;
    const adminPublicId = adminUser.publicId;

    await db.query(`UPDATE users SET role = 'ADMIN' WHERE id = $1`, [adminUserId]);

    // Helper: Create an active node
    async function createActiveNode(
      userId: string,
      custom?: { remainingPhivo?: number; distributedPhivo?: number; lifetimeAllocation?: number }
    ): Promise<{ nodeId: string; publicNodeId: string }> {
      const availRes = await db.query<{ id: string; public_node_id: string }>(
        `SELECT id, public_node_id FROM nodes WHERE status = 'AVAILABLE' LIMIT 1`
      );
      if (availRes.rows.length === 0) {
        throw new Error('No available nodes found in seeded inventory');
      }
      const n = availRes.rows[0];
      const lifetime = custom?.lifetimeAllocation ?? 10000.00;
      const distributed = custom?.distributedPhivo ?? 0.00;
      const remaining = custom?.remainingPhivo ?? (lifetime - distributed);

      await db.query(
        `UPDATE nodes 
         SET status = 'ACTIVE', 
             owner_user_id = $1, 
             activated_at = CURRENT_TIMESTAMP,
             lifetime_phivo_allocation = $2,
             distributed_phivo = $3,
             remaining_phivo = $4
         WHERE id = $5`,
        [userId, lifetime, distributed, remaining, n.id]
      );
      return { nodeId: n.id, publicNodeId: n.public_node_id };
    }

    // =========================================================================
    // TEST A: Admin rate = 10 -> Active Node receives exactly 10 PHIVO
    // =========================================================================
    console.log('--- TEST A: Admin Rate = 10 PHIVO ---');
    const userA = await createTestUser('userA');
    const nodeA = await createActiveNode(userA.id);

    const { config: config10 } = await updateEconomicConfig({
      configKey: 'NODE_REWARD_RATE_PER_EPOCH',
      configValue: 10,
      adminUserId,
      adminPublicId,
      reason: 'Set initial daily reward to 10 PHIVO per node',
    });

    assert(Number(config10.configValue) === 10, 'Admin config successfully saved rate = 10 PHIVO');
    assert(config10.version >= 1, `Config version incremented (version ${config10.version})`);

    const epochA = await createRewardEpoch();
    assert(epochA.rewardPerNode === 10, 'New epoch snapshots configured rate of 10 PHIVO');
    assert(epochA.economicConfigVersion === config10.version, 'Epoch snapshots economic config version');

    const settleA = await closeAndSettleEpoch(epochA.id);
    assert(settleA.success === true, 'Epoch A settlement succeeded');

    const rewardsA = await db.query<{ amount: string | number; reward_rate_used: string | number; economic_config_version: number }>(
      `SELECT amount, reward_rate_used, economic_config_version FROM node_rewards WHERE node_id = $1 AND epoch_id = $2`,
      [nodeA.nodeId, epochA.id]
    );

    assert(rewardsA.rows.length === 1, 'Exactly one reward record created for active node');
    assert(Number(rewardsA.rows[0].amount) === 10, 'Active Node receives exactly 10 PHIVO');
    assert(Number(rewardsA.rows[0].reward_rate_used) === 10, 'Reward record snapshots reward_rate_used = 10');
    assert(rewardsA.rows[0].economic_config_version === config10.version, 'Reward record preserves economic_config_version');

    // =========================================================================
    // TEST B: Admin rate changed from 10 to 15 -> Previous reward remains 10, Next gives 15
    // =========================================================================
    console.log('\n--- TEST B: Admin Rate Changed to 15 PHIVO (Next Epoch Only) ---');
    const { config: config15 } = await updateEconomicConfig({
      configKey: 'NODE_REWARD_RATE_PER_EPOCH',
      configValue: 15,
      adminUserId,
      adminPublicId,
      reason: 'Increase daily reward to 15 PHIVO for future epochs',
    });

    assert(Number(config15.configValue) === 15, 'Admin config updated to 15 PHIVO');
    assert(config15.version === config10.version + 1, 'Config version advanced to next version');

    // Create next epoch
    const epochB = await createRewardEpoch();
    assert(epochB.rewardPerNode === 15, 'Next epoch snapshots new rate of 15 PHIVO');
    assert(epochB.economicConfigVersion === config15.version, 'Next epoch references new version');

    const settleB = await closeAndSettleEpoch(epochB.id);
    assert(settleB.success === true, 'Epoch B settlement succeeded');

    // Check new reward
    const rewardsB = await db.query<{ amount: string | number; reward_rate_used: string | number; economic_config_version: number }>(
      `SELECT amount, reward_rate_used, economic_config_version FROM node_rewards WHERE node_id = $1 AND epoch_id = $2`,
      [nodeA.nodeId, epochB.id]
    );
    assert(Number(rewardsB.rows[0].amount) === 15, 'Next epoch awards exactly 15 PHIVO');
    assert(Number(rewardsB.rows[0].reward_rate_used) === 15, 'Reward record captures new rate = 15');

    // Check historical epoch A reward is completely untouched (immutability)
    const historicalReward = await db.query<{ amount: string | number; reward_rate_used: string | number }>(
      `SELECT amount, reward_rate_used FROM node_rewards WHERE node_id = $1 AND epoch_id = $2`,
      [nodeA.nodeId, epochA.id]
    );
    assert(Number(historicalReward.rows[0].amount) === 10, 'Historical Epoch A reward remains permanently 10 PHIVO (immutable)');
    assert(Number(historicalReward.rows[0].reward_rate_used) === 10, 'Historical reward_rate_used remains 10');

    // =========================================================================
    // TEST C: Remaining allocation = 7, Admin rate = 10 -> Reward = 7, Remaining = 0, Status = MATURED
    // =========================================================================
    console.log('\n--- TEST C: Lifetime Allocation Safety Cap (Remaining = 7, Rate = 10) ---');
    const userC = await createTestUser('userC');
    const nodeC = await createActiveNode(userC.id, {
      lifetimeAllocation: 10000.00,
      distributedPhivo: 9993.00,
      remainingPhivo: 7.00,
    });

    // Reset rate to 10
    await updateEconomicConfig({
      configKey: 'NODE_REWARD_RATE_PER_EPOCH',
      configValue: 10,
      adminUserId,
      adminPublicId,
      reason: 'Set rate to 10 for cap test',
    });

    const epochC = await createRewardEpoch();
    const settleC = await closeAndSettleEpoch(epochC.id, { targetNodeId: nodeC.nodeId });
    assert(settleC.success === true, 'Epoch C settled for near-cap node');

    const rewardC = await db.query<{ amount: string | number }>(
      `SELECT amount FROM node_rewards WHERE node_id = $1 AND epoch_id = $2`,
      [nodeC.nodeId, epochC.id]
    );
    assert(Number(rewardC.rows[0].amount) === 7, 'Reward strictly capped at remaining allocation: min(10, 7) = 7 PHIVO');

    // Check node final state
    const nodeCAfter = await db.query<{ status: string; distributed_phivo: string | number; remaining_phivo: string | number }>(
      `SELECT status, distributed_phivo, remaining_phivo FROM nodes WHERE id = $1`,
      [nodeC.nodeId]
    );
    assert(Number(nodeCAfter.rows[0].remaining_phivo) === 0, 'Node remaining_phivo is exactly 0');
    assert(Number(nodeCAfter.rows[0].distributed_phivo) === 10000.00, 'Distributed reaches exactly 10,000 PHIVO lifetime cap');
    assert(nodeCAfter.rows[0].status === 'MATURED', 'Node status automatically transitioned to MATURED');

    // Next epoch: Matured node must NOT emit any more rewards
    const epochC2 = await createRewardEpoch();
    await closeAndSettleEpoch(epochC2.id, { targetNodeId: nodeC.nodeId });
    const rewardC2 = await db.query(
      `SELECT id FROM node_rewards WHERE node_id = $1 AND epoch_id = $2`,
      [nodeC.nodeId, epochC2.id]
    );
    assert(rewardC2.rows.length === 0, 'MATURED node receives ZERO rewards in subsequent epochs (no over-emission)');

    // =========================================================================
    // TEST D: Duplicate same-node same-epoch execution -> No duplicate reward
    // =========================================================================
    console.log('\n--- TEST D: Duplicate Execution Idempotency ---');
    const duplicateSettle = await closeAndSettleEpoch(epochA.id);
    assert(duplicateSettle.success === true, 'Duplicate closeAndSettleEpoch returns success');
    assert(duplicateSettle.rewardsCreated === 0, 'Duplicate execution creates 0 additional rewards');

    const allRewardsEpochA = await db.query<{ count: string | number }>(
      `SELECT COUNT(*) as count FROM node_rewards WHERE node_id = $1 AND epoch_id = $2`,
      [nodeA.nodeId, epochA.id]
    );
    assert(Number(allRewardsEpochA.rows[0].count) === 1, 'Strictly 1 reward record exists for Node + Epoch (no duplicates)');

    // =========================================================================
    // TEST E: Admin changes rate during an active epoch -> Entire epoch uses snapped version
    // =========================================================================
    console.log('\n--- TEST E: Epoch Config Version Snapshotting ---');
    // Set rate to 20
    const { config: config20 } = await updateEconomicConfig({
      configKey: 'NODE_REWARD_RATE_PER_EPOCH',
      configValue: 20,
      adminUserId,
      adminPublicId,
      reason: 'Set rate to 20',
    });

    // Create epoch E
    const epochE = await createRewardEpoch();
    assert(epochE.rewardPerNode === 20, 'Epoch E initialized with rate = 20');
    assert(epochE.economicConfigVersion === config20.version, 'Epoch E snapshotted config version');

    // Now Admin changes rate to 30 BEFORE or DURING epoch settlement
    await updateEconomicConfig({
      configKey: 'NODE_REWARD_RATE_PER_EPOCH',
      configValue: 30,
      adminUserId,
      adminPublicId,
      reason: 'Mid-stream admin adjustment to 30',
    });

    // Settle Epoch E: it must preserve the snapped rate (20) and version
    const settleE = await closeAndSettleEpoch(epochE.id, { targetNodeId: nodeA.nodeId });
    assert(settleE.success === true, 'Epoch E settlement succeeded');

    const rewardE = await db.query<{ amount: string | number; reward_rate_used: string | number; economic_config_version: number }>(
      `SELECT amount, reward_rate_used, economic_config_version FROM node_rewards WHERE node_id = $1 AND epoch_id = $2`,
      [nodeA.nodeId, epochE.id]
    );
    assert(Number(rewardE.rows[0].amount) === 20, 'Epoch E distributed snapped rate = 20 (not 30)');
    assert(Number(rewardE.rows[0].reward_rate_used) === 20, 'Reward record records snapped rate = 20');
    assert(rewardE.rows[0].economic_config_version === config20.version, 'Reward record preserves original snapped version');

    // =========================================================================
    // TEST F: Public Landing Page Content Verification
    // =========================================================================
    console.log('\n--- TEST F: Landing Page Public Data Removal Verification ---');
    const landingPagePath = path.resolve(process.cwd(), 'src/pages/PublicLandingPage.tsx');
    const landingContent = fs.readFileSync(landingPagePath, 'utf8');

    // 1. Check absence of exact node quantities / counts
    const forbiddenPatterns = [
      /10,000\s+Nodes/i,
      /Genesis\s+Cap/i,
      /Node\s+Limit/i,
      /25\s+PHIVO\s*\/\s*Day/i,
      /25\s+PHIVO\s*\/\s*Eligible\s+Day/i,
      /400\s*[×x]\s*25\s+PHIVO/i,
      /Current Genesis Capacity:\s*10,000/i,
      /10,000 Genesis Node cap/i,
    ];

    for (const pattern of forbiddenPatterns) {
      const match = landingContent.match(pattern);
      assert(!match, `Landing page does NOT contain forbidden pattern: ${pattern}`, match ? `Found: "${match[0]}"` : undefined);
    }

    // 2. Check presence of approved protocol-governed text
    assert(
      landingContent.includes('Daily PHIVO emission is governed by the active protocol economic configuration.'),
      'Landing page includes required protocol governance copy'
    );
    assert(
      landingContent.includes('Genesis Node Economy'),
      'Landing page contains approved conceptual phrase "Genesis Node Economy"'
    );
    assert(
      landingContent.includes('Structured Node Participation'),
      'Landing page contains approved conceptual phrase "Structured Node Participation"'
    );
    assert(
      landingContent.includes('Genesis V1 Architecture'),
      'Landing page contains approved conceptual phrase "Genesis V1 Architecture"'
    );

    console.log('\n===============================================================');
    console.log(`SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('===============================================================\n');

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Test execution error:', err);
    process.exit(1);
  } finally {
    try {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  }
}

runPf10Tests();
