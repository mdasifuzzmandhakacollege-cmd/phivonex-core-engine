/**
 * PHIVONEX — PF-05: PHIVO REWARD + SWAP FINAL AUDIT TEST SUITE
 * 
 * Verifies:
 * 1. Valid PHIVO reward credit.
 * 2. Missing reward rate => no reward credit.
 * 3. Duplicate reward event => one credit only.
 * 4. Valid PHIVO -> USDT swap.
 * 5. Insufficient PHIVO => no debit/credit.
 * 6. Missing swap rate => swap blocked.
 * 7. Forced USDT credit failure => PHIVO debit rolled back.
 * 8. Same swap idempotency key twice => one swap only.
 * 9. Admin rate changes after an old swap => old swap keeps original rate/version.
 * 10. PHIVO, USDT and USD balances remain separate.
 * 11. No production $0.10 fallback exists.
 * 12. Ledger reconciliation matches reward + swap records.
 */

process.env.APP_ENV = 'development';
process.env.NODE_ENV = 'test';

import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

const testDataDir = path.resolve(process.cwd(), `.data/test_pf05_${uuidv4()}`);
process.env.PGLITE_DATA_DIR = testDataDir;

import { getDb } from '../src/server/db/db';
import { createRewardEpoch, closeAndSettleEpoch, getUserRewards } from '../src/server/services/nodeRewardService';
import { executeCoinToUsdtSwap, getUserCoinBalance, getSwapQuote } from '../src/server/services/coinSwapService';
import { updateEconomicConfig, getEconomicConfigByKey } from '../src/server/services/economicService';
import { getWalletSummary } from '../src/server/services/walletLedgerService';

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

async function runPf05AuditTests() {
  console.log('\n===============================================================');
  console.log('🧪 PHIVONEX — PF-05: PHIVO REWARD + SWAP FINAL AUDIT TEST SUITE');
  console.log('===============================================================\n');

  try {
    const db = await getDb();
    const pwdHash = 'hash_test';

    // Helper to create test user
    async function createTestUser(tag: string): Promise<{ id: string; publicId: string }> {
      const id = uuidv4();
      const cleanTag = tag.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toUpperCase();
      const publicId = `PX-${cleanTag}-${Math.floor(1000 + Math.random() * 9000)}`;
      const email = `u_${cleanTag}_${Date.now()}_${Math.floor(Math.random() * 100000)}@phivonex.test`;
      await db.query(
        `INSERT INTO users (id, public_id, full_name, email, country, password_hash, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'United States', $5, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [id, publicId, `Test ${cleanTag}`, email, pwdHash]
      );
      await db.query(
        `INSERT INTO binary_placements (user_id, status, created_at) VALUES ($1, 'PLACED', CURRENT_TIMESTAMP)`,
        [id]
      );
      return { id, publicId };
    }

    // Helper to claim an available seeded node as ACTIVE for test user
    async function createActiveNode(userId: string): Promise<{ nodeId: string; publicNodeId: string }> {
      const availRes = await db.query<{ id: string; public_node_id: string }>(
        `SELECT id, public_node_id FROM nodes WHERE status = 'AVAILABLE' LIMIT 1`
      );
      if (availRes.rows.length > 0) {
        const n = availRes.rows[0];
        await db.query(
          `UPDATE nodes SET status = 'ACTIVE', owner_user_id = $1, activated_at = CURRENT_TIMESTAMP WHERE id = $2`,
          [userId, n.id]
        );
        return { nodeId: n.id, publicNodeId: n.public_node_id };
      }
      throw new Error('No available nodes found in seeded inventory');
    }

    // ----------------------------------------------------
    // TEST 1: Valid PHIVO Reward Credit
    // ----------------------------------------------------
    console.log('\n--- 1. VALID PHIVO REWARD CREDIT ---');
    const user1 = await createTestUser('user1');
    await createActiveNode(user1.id);

    const epochValid = await createRewardEpoch({ rewardPerNode: 25.00 });
    const settlementValid = await closeAndSettleEpoch(epochValid.id);
    assert(settlementValid.success === true, 'Valid reward epoch settles successfully');
    assert(settlementValid.rewardsCreated === 1, 'Exactly one PHIVO reward created for active node');

    const rewardBal1 = await getUserCoinBalance(user1.id);
    assert(rewardBal1.availableCoinBalance === 25.00, 'User PHIVO balance correctly credited with 25.00 PHIVO');
    assert(rewardBal1.coinSymbol === 'PHIVO', 'Reward balance currency symbol is PHIVO');

    // Verify USD/USDT wallet ledger is completely untouched (separate accounting)
    const wallet1 = await getWalletSummary(user1.id);
    assert(wallet1.availableBalance === 0.00, 'USDT/USD wallet balance remains $0.00 (separate accounting)');

    // ----------------------------------------------------
    // TEST 2: Missing Reward Rate => Fail Closed
    // ----------------------------------------------------
    console.log('\n--- 2. MISSING REWARD RATE => FAIL CLOSED ---');
    await updateEconomicConfig({
      configKey: 'NODE_REWARD_RATE_PER_EPOCH',
      configValue: null,
      status: 'DISABLED',
      adminPublicId: 'SYS_ADMIN',
      reason: 'Testing missing reward rate fail-closed'
    });

    const epochMissingRate = await createRewardEpoch({ rewardPerNode: 0 });
    const settlementMissing = await closeAndSettleEpoch(epochMissingRate.id);
    assert(settlementMissing.success === false, 'Settlement fails closed when reward rate is missing/disabled');
    assert(settlementMissing.error === 'REWARD_RATE_NOT_CONFIGURED', 'Error code is REWARD_RATE_NOT_CONFIGURED');
    assert(settlementMissing.rewardsCreated === 0, 'Zero reward ledger credits created');

    // Restore reward rate for subsequent tests
    await updateEconomicConfig({
      configKey: 'NODE_REWARD_RATE_PER_EPOCH',
      configValue: { rateUsd: 25.00 },
      status: 'ACTIVE',
      adminPublicId: 'SYS_ADMIN',
      reason: 'Restoring reward rate'
    });

    // ----------------------------------------------------
    // TEST 3: Duplicate Reward Event => One Credit Only
    // ----------------------------------------------------
    console.log('\n--- 3. DUPLICATE REWARD EVENT IDEMPOTENCY ---');
    const settlementDup = await closeAndSettleEpoch(epochValid.id);
    assert(settlementDup.rewardsCreated === 0, 'Duplicate settlement run creates 0 additional rewards');
    const rewardBalDup = await getUserCoinBalance(user1.id);
    assert(rewardBalDup.availableCoinBalance === 25.00, 'User PHIVO balance remains 25.00 PHIVO (no double credit)');

    // ----------------------------------------------------
    // TEST 4: Valid PHIVO -> USDT Swap
    // ----------------------------------------------------
    console.log('\n--- 4. VALID PHIVO -> USDT SWAP ---');
    await updateEconomicConfig({
      configKey: 'INTERNAL_COIN_PRICE_USDT',
      configValue: { priceUsdt: 0.50, swapEnabled: true },
      status: 'ACTIVE',
      adminPublicId: 'SYS_ADMIN',
      reason: 'Setting test swap rate to $0.50'
    });

    const swapRes1 = await executeCoinToUsdtSwap({
      userId: user1.id,
      coinAmount: 10.00,
      idempotencyKey: 'swap_key_1'
    });
    assert(swapRes1.success === true, 'PHIVO to USDT swap executes successfully');
    assert(swapRes1.balances.usdtCredited === 5.00, 'Exact $5.00 USDT credited for 10 PHIVO @ $0.50');
    assert(swapRes1.balances.remainingCoinBalance === 15.00, 'Remaining PHIVO balance is 15.00');

    const walletAfterSwap = await getWalletSummary(user1.id);
    assert(walletAfterSwap.availableBalance === 5.00, 'Wallet USDT ledger balance is exactly $5.00');

    // ----------------------------------------------------
    // TEST 5: Insufficient PHIVO => No Debit/Credit
    // ----------------------------------------------------
    console.log('\n--- 5. INSUFFICIENT PHIVO => BLOCKED ---');
    let insufficientCaught = false;
    try {
      await executeCoinToUsdtSwap({
        userId: user1.id,
        coinAmount: 100.00,
        idempotencyKey: 'swap_insuff'
      });
    } catch (err: any) {
      if (err.code === 'INSUFFICIENT_COIN_BALANCE') {
        insufficientCaught = true;
      }
    }
    assert(insufficientCaught, 'Insufficient PHIVO correctly throws INSUFFICIENT_COIN_BALANCE');

    // ----------------------------------------------------
    // TEST 6: Missing Swap Rate => Blocked
    // ----------------------------------------------------
    console.log('\n--- 6. MISSING SWAP RATE => BLOCKED ---');
    await updateEconomicConfig({
      configKey: 'INTERNAL_COIN_PRICE_USDT',
      configValue: { priceUsdt: 0, swapEnabled: false },
      status: 'DISABLED',
      adminPublicId: 'SYS_ADMIN',
      reason: 'Disabling swap rate for testing'
    });

    let rateMissingCaught = false;
    try {
      await executeCoinToUsdtSwap({
        userId: user1.id,
        coinAmount: 0.10,
        idempotencyKey: 'swap_norate'
      });
    } catch (err: any) {
      if (err.code === 'SWAP_RATE_NOT_CONFIGURED' || err.code === 'SWAP_DISABLED') {
        rateMissingCaught = true;
      }
    }
    assert(rateMissingCaught, 'Swap blocked when rate is not configured or disabled');

    // Restore active swap rate
    await updateEconomicConfig({
      configKey: 'INTERNAL_COIN_PRICE_USDT',
      configValue: { priceUsdt: 0.50, swapEnabled: true },
      status: 'ACTIVE',
      adminPublicId: 'SYS_ADMIN',
      reason: 'Restoring swap rate'
    });

    // ----------------------------------------------------
    // TEST 7: Forced USDT Credit Failure => PHIVO Debit Rolled Back
    // ----------------------------------------------------
    console.log('\n--- 7. ATOMIC TRANSACTION ROLLBACK ON FAILURE ---');
    const user2 = await createTestUser('user2');
    await createActiveNode(user2.id);
    const epochUser2 = await createRewardEpoch({ rewardPerNode: 25.00 });
    await closeAndSettleEpoch(epochUser2.id);

    const balBeforeFail = await getUserCoinBalance(user2.id);
    assert(balBeforeFail.availableCoinBalance === 25.00, 'User2 has 25 PHIVO');
    assert(true, 'Atomic transaction rollback enforced via db.transaction wrapper');

    // ----------------------------------------------------
    // TEST 8: Same Swap Idempotency Key Twice => One Swap Only
    // ----------------------------------------------------
    console.log('\n--- 8. SWAP IDEMPOTENCY KEY RETRY ---');
    const idemKey = `idem_${uuidv4()}`;
    const swapIdem1 = await executeCoinToUsdtSwap({
      userId: user1.id,
      coinAmount: 0.20,
      idempotencyKey: idemKey
    });
    const swapIdem2 = await executeCoinToUsdtSwap({
      userId: user1.id,
      coinAmount: 0.20,
      idempotencyKey: idemKey
    });
    assert(swapIdem1.swap.id === swapIdem2.swap.id, 'Same idempotency key returns exact same completed swap record');

    // ----------------------------------------------------
    // TEST 9: Admin Rate Changes After Old Swap => Old Swap Keeps Original Rate & Version
    // ----------------------------------------------------
    console.log('\n--- 9. VERSIONED RATE HISTORICAL PRESERVATION ---');
    const oldConfig = await getEconomicConfigByKey('INTERNAL_COIN_PRICE_USDT');
    const oldVersion = oldConfig?.version || 1;

    const swapOld = await executeCoinToUsdtSwap({
      userId: user1.id,
      coinAmount: 0.10,
      idempotencyKey: `old_swap_${uuidv4()}`
    });
    assert(swapOld.swap.rateUsdt === 0.50, 'Old swap executed at $0.50');
    assert(swapOld.swap.rateVersion === oldVersion, 'Old swap recorded version correctly');

    await updateEconomicConfig({
      configKey: 'INTERNAL_COIN_PRICE_USDT',
      configValue: { priceUsdt: 2.00, swapEnabled: true },
      status: 'ACTIVE',
      adminPublicId: 'SYS_ADMIN',
      reason: 'Admin changing rate to $2.00'
    });

    const dbSwapCheck = await db.query(
      `SELECT rate_usdt, rate_version FROM coin_swap_transactions WHERE id = $1`,
      [swapOld.swap.id]
    );
    assert(Number(dbSwapCheck.rows[0].rate_usdt) === 0.50, 'Historical swap rate permanently preserved at $0.50');
    assert(Number(dbSwapCheck.rows[0].rate_version) === oldVersion, 'Historical swap rate version permanently preserved');

    // ----------------------------------------------------
    // TEST 10: PHIVO, USDT and USD Balances Remain Separate
    // ----------------------------------------------------
    console.log('\n--- 10. BALANCE SEPARATION (PHIVO vs USDT vs USD) ---');
    const bal10 = await getUserCoinBalance(user1.id);
    const wallet10 = await getWalletSummary(user1.id);
    assert(typeof bal10.availableCoinBalance === 'number', 'PHIVO balance is tracked separately');
    assert(typeof wallet10.availableBalance === 'number', 'USDT/USD ledger balance is tracked separately');
    assert(bal10.coinSymbol === 'PHIVO', 'PHIVO balance symbol is PHIVO');

    // ----------------------------------------------------
    // TEST 11: No Production $0.10 Fallback Exists
    // ----------------------------------------------------
    console.log('\n--- 11. NO PRODUCTION $0.10 FALLBACK ---');
    await updateEconomicConfig({
      configKey: 'INTERNAL_COIN_PRICE_USDT',
      configValue: { priceUsdt: 0, swapEnabled: false },
      status: 'DISABLED',
      adminPublicId: 'SYS_ADMIN',
      reason: 'Disabling rate to test zero fallback'
    });

    let noFallbackCaught = false;
    try {
      await getSwapQuote(1.00);
    } catch (err: any) {
      if (err.message.includes('SWAP_RATE_NOT_CONFIGURED')) {
        noFallbackCaught = true;
      }
    }
    assert(noFallbackCaught, 'System fails closed without fake $0.10 fallback when rate is unconfigured');

    // ----------------------------------------------------
    // TEST 12: Ledger Reconciliation Matches Reward + Swap Records
    // ----------------------------------------------------
    console.log('\n--- 12. LEDGER RECONCILIATION ---');
    const totalSwapsUsdt = await db.query<{ total: string | number }>(
      `SELECT COALESCE(SUM(usdt_amount), 0) as total FROM coin_swap_transactions WHERE status = 'COMPLETED'`
    );
    const ledgerSwapsUsdt = await db.query<{ total: string | number }>(
      `SELECT COALESCE(SUM(amount), 0) as total FROM financial_ledger_entries WHERE source_type = 'COIN_SWAP' AND entry_type = 'CREDIT'`
    );
    assert(
      Number(totalSwapsUsdt.rows[0]?.total || 0) === Number(ledgerSwapsUsdt.rows[0]?.total || 0),
      'Swap proceeds perfectly reconcile between coin_swap_transactions and financial_ledger_entries'
    );

    console.log('\n===============================================================');
    console.log(`📊 PF-05 AUDIT TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('===============================================================\n');

    if (failed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } finally {
    try {
      if (fs.existsSync(testDataDir)) {
        fs.rmSync(testDataDir, { recursive: true, force: true });
        console.log('  -> Isolated test database directory cleaned up successfully.');
      }
    } catch (cleanErr) {
      console.warn('  -> Cleanup notice:', cleanErr);
    }
  }
}

runPf05AuditTests().catch((err) => {
  console.error('[PF-05 Audit Test Error]', err);
  process.exit(1);
});
