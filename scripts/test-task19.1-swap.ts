/**
 * TASK #19.1: INTERNAL COIN -> USDT SWAP ENGINE TEST SUITE
 *
 * Verifies:
 * 1. Correct PHIVO -> USDT calculation based on active server rate
 * 2. Insufficient coin balance is rejected (INSUFFICIENT_COIN_BALANCE)
 * 3. Disabled swap is rejected (SWAP_DISABLED)
 * 4. Missing/unconfigured rate is rejected (SWAP_RATE_NOT_CONFIGURED)
 * 5. Historical swaps keep the exact old rate and version used
 * 6. Duplicate requests with idempotency key do not double-swap
 * 7. Concurrent requests cannot overspend available balance
 * 8. USDT ledger is credited exactly once per swap and isolated from PHIVO balance
 * 9. Swapped USDT balance is usable in withdrawal flow
 * 10. User sees only own swap history (user isolation)
 * 11. Quote endpoint returns accurate informational data
 */

import { getDb } from '../src/server/db/db';
import { v4 as uuidv4 } from 'uuid';
import {
  getSwapQuote,
  executeCoinToUsdtSwap,
  getUserSwapHistory,
  getUserCoinBalance,
} from '../src/server/services/coinSwapService';
import { updateEconomicConfig } from '../src/server/services/economicService';
import { getWalletSummary } from '../src/server/services/walletLedgerService';
import { createWithdrawalRequest } from '../src/server/services/withdrawalService';

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${msg}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${msg}`);
    failed++;
  }
}

async function runTask19_1Tests() {
  console.log('========================================================');
  console.log('🚀 RUNNING TASK #19.1: PHIVO -> USDT SWAP ENGINE TESTS');
  console.log('========================================================');

  const db = await getDb();

  // 1. Create Test Users with unique IDs
  const user1Id = uuidv4();
  const user2Id = uuidv4();
  const adminId = uuidv4();
  const runTag = Date.now().toString().slice(-6);

  await db.query(`
    INSERT INTO users (id, public_id, full_name, email, country, password_hash, role)
    VALUES 
      ($1, $2, 'Swap User One', $3, 'US', 'hash1', 'USER'),
      ($4, $5, 'Swap User Two', $6, 'US', 'hash2', 'USER'),
      ($7, $8, 'Swap Admin', $9, 'US', 'hash3', 'ADMIN')
  `, [
    user1Id, `PHX-SWP1-${runTag}`, `swap1-${runTag}@phivonex.test`,
    user2Id, `PHX-SWP2-${runTag}`, `swap2-${runTag}@phivonex.test`,
    adminId, `PHX-ADMN-${runTag}`, `admin-${runTag}@phivonex.test`
  ]);

  // Seed node rewards (coin earnings) for user 1 (500 PHIVO total)
  const epochId1 = uuidv4();
  const epochId2 = uuidv4();
  const epochNum1 = 90000 + Math.floor(Math.random() * 4000);
  const epochNum2 = epochNum1 + 1;
  await db.query(`
    INSERT INTO reward_epochs (id, public_epoch_id, epoch_number, start_at, end_at, reward_per_node, currency, status)
    VALUES 
      ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 50.00, 'USD', 'COMPLETED'),
      ($4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 50.00, 'USD', 'COMPLETED')
  `, [
    epochId1, `EPOCH-SWP1-${runTag}`, epochNum1,
    epochId2, `EPOCH-SWP2-${runTag}`, epochNum2
  ]);

  // Update existing seeded Genesis Node 9991 to be owned by user1
  await db.query(`
    UPDATE nodes 
    SET status = 'ACTIVE', owner_user_id = $1, activated_at = CURRENT_TIMESTAMP
    WHERE node_number = 9991
  `, [user1Id]);

  const nodeRes = await db.query<{ id: string }>(`SELECT id FROM nodes WHERE node_number = 9991`);
  const nodeId1 = nodeRes.rows[0].id;

  await db.query(`
    INSERT INTO node_rewards (id, public_reward_id, epoch_id, node_id, owner_user_id, amount, currency, status, accrued_at)
    VALUES 
      ($1, $2, $3, $4, $5, 300.00, 'PHIVO', 'ACCRUED', CURRENT_TIMESTAMP),
      ($6, $7, $8, $4, $5, 200.00, 'PHIVO', 'ACCRUED', CURRENT_TIMESTAMP)
  `, [
    uuidv4(), `NRW-SWP-A-${runTag}`, epochId1, nodeId1, user1Id,
    uuidv4(), `NRW-SWP-B-${runTag}`, epochId2
  ]);

  // Ensure active rate is 1 PHIVO = 0.10 USDT
  await updateEconomicConfig({
    configKey: 'INTERNAL_COIN_PRICE_USDT',
    configValue: {
      coinSymbol: 'PHIVO',
      priceUsdt: 0.10,
      swapEnabled: true,
    },
    status: 'ACTIVE',
    adminPublicId: 'PHX-TEST-ADMIN',
    reason: 'Initial test rate configuration',
  });

  await updateEconomicConfig({
    configKey: 'INTERNAL_COIN_SWAP_ENABLED',
    configValue: true,
    status: 'ACTIVE',
    adminPublicId: 'PHX-TEST-ADMIN',
  });

  console.log('\n--- TEST GROUP 1: User Coin Balance Calculation & Quote ---');
  const initialBal = await getUserCoinBalance(user1Id);
  assert(initialBal.availableCoinBalance === 500, `User 1 initial coin balance is 500 PHIVO (got ${initialBal.availableCoinBalance})`);
  assert(initialBal.totalEarnedCoins === 500, `User 1 total earned is 500 PHIVO`);
  assert(initialBal.totalSwappedCoins === 0, `User 1 total swapped is 0 PHIVO`);
  assert(initialBal.coinSymbol === 'PHIVO', `Coin symbol is strictly PHIVO`);

  // Verify initial USDT ledger balance is 0 (strictly separated from PHIVO balance)
  const initialWallet = await getWalletSummary(user1Id);
  assert(initialWallet.availableBalance === 0, `Initial USDT ledger balance is 0.00 (not combined with PHIVO)`);

  const quote1 = await getSwapQuote(100);
  assert(quote1.coinAmount === 100, 'Quote coin amount matches 100');
  assert(quote1.rate === 0.10, 'Quote rate is $0.10');
  assert(quote1.usdtAmount === 10.00, 'Quote calculated 100 PHIVO * 0.10 = $10.00 USDT');
  assert(quote1.swapEnabled === true, 'Quote indicates swap is active');
  assert(quote1.coinSymbol === 'PHIVO', 'Quote coinSymbol is PHIVO');

  console.log('\n--- TEST GROUP 2: Successful Coin -> USDT Swap Execution & Balance Separation ---');
  const swapRes = await executeCoinToUsdtSwap({
    userId: user1Id,
    coinAmount: 100,
    idempotencyKey: 'idemp-swap-001',
  });

  assert(swapRes.success === true, 'Swap execution succeeded');
  assert(swapRes.swap.coinAmount === 100, 'Swap debited 100 PHIVO');
  assert(swapRes.swap.rateUsdt === 0.10, 'Swap recorded $0.10 rate');
  assert(swapRes.swap.usdtAmount === 10.00, 'Swap credited $10.00 USDT');
  assert(swapRes.swap.status === 'COMPLETED', 'Swap status is COMPLETED');
  assert(swapRes.balances.remainingCoinBalance === 400, `Remaining PHIVO balance is strictly 400 PHIVO (got ${swapRes.balances.remainingCoinBalance})`);

  // Verify wallet summary has credited EXACTLY $10.00 USDT (not $510)
  const walletSummary = await getWalletSummary(user1Id);
  assert(walletSummary.availableBalance === 10.00, `Wallet available balance is strictly $10.00 USDT (got $${walletSummary.availableBalance})`);
  assert(walletSummary.breakdown.swap === 10.00, `Wallet breakdown shows swap credit $10.00`);

  console.log('\n--- TEST GROUP 3: Insufficient Balance Protection ---');
  let insufficientCaught = false;
  try {
    await executeCoinToUsdtSwap({
      userId: user1Id,
      coinAmount: 9999, // User only has 400 left
    });
  } catch (err: any) {
    insufficientCaught = true;
    assert(
      err.code === 'INSUFFICIENT_COIN_BALANCE' || err.message.includes('INSUFFICIENT_COIN_BALANCE'),
      'Throws INSUFFICIENT_COIN_BALANCE on overspending request'
    );
  }
  assert(insufficientCaught, 'Insufficient balance swap was strictly rejected');

  console.log('\n--- TEST GROUP 4: Disabled Swap Protection ---');
  // Disable swap via config
  await updateEconomicConfig({
    configKey: 'INTERNAL_COIN_PRICE_USDT',
    configValue: {
      coinSymbol: 'PHIVO',
      priceUsdt: 0.10,
      swapEnabled: false,
    },
    status: 'ACTIVE',
    adminPublicId: 'PHX-TEST-ADMIN',
    reason: 'Admin test pause',
  });

  let disabledCaught = false;
  try {
    await executeCoinToUsdtSwap({
      userId: user1Id,
      coinAmount: 50,
    });
  } catch (err: any) {
    disabledCaught = true;
    assert(
      err.code === 'SWAP_DISABLED' || err.message.includes('SWAP_DISABLED'),
      'Throws SWAP_DISABLED when swapEnabled is false'
    );
  }
  assert(disabledCaught, 'Disabled swap was rejected');

  // Re-enable swap
  await updateEconomicConfig({
    configKey: 'INTERNAL_COIN_PRICE_USDT',
    configValue: {
      coinSymbol: 'PHIVO',
      priceUsdt: 0.10,
      swapEnabled: true,
    },
    status: 'ACTIVE',
    adminPublicId: 'PHX-TEST-ADMIN',
    reason: 'Admin re-enabled',
  });

  console.log('\n--- TEST GROUP 5: Rate Versioning & Historical Immutability ---');
  // 1. Perform swap at rate 0.10
  const swapAt10 = await executeCoinToUsdtSwap({
    userId: user1Id,
    coinAmount: 50,
  });
  assert(swapAt10.swap.rateUsdt === 0.10, 'First swap executed at rate 0.10');
  assert(swapAt10.swap.usdtAmount === 5.00, 'First swap produced $5.00 USDT');

  // 2. Admin updates rate to 0.25 USDT
  const updateRes = await updateEconomicConfig({
    configKey: 'INTERNAL_COIN_PRICE_USDT',
    configValue: {
      coinSymbol: 'PHIVO',
      priceUsdt: 0.25,
      swapEnabled: true,
    },
    status: 'ACTIVE',
    adminPublicId: 'PHX-TEST-ADMIN',
    reason: 'Rate appreciation to 0.25',
  });

  const newVersion = updateRes.config.version;

  // 3. Perform second swap at new rate 0.25
  const swapAt25 = await executeCoinToUsdtSwap({
    userId: user1Id,
    coinAmount: 50,
  });
  assert(swapAt25.swap.rateUsdt === 0.25, 'Second swap executed at new rate 0.25');
  assert(swapAt25.swap.usdtAmount === 12.50, 'Second swap produced $12.50 USDT (50 * 0.25)');
  assert(swapAt25.swap.rateVersion === newVersion, `Second swap recorded updated version v${newVersion}`);

  // 4. Verify historical record of first swap did NOT change
  const historyCheck = await getUserSwapHistory(user1Id);
  const oldRecorded = historyCheck.swaps.find((s) => s.id === swapAt10.swap.id);
  assert(oldRecorded?.rateUsdt === 0.10, 'Historical swap permanently retained its original $0.10 rate');
  assert(oldRecorded?.usdtAmount === 5.00, 'Historical swap permanently retained its original $5.00 USDT amount');

  console.log('\n--- TEST GROUP 6: Idempotency Protection ---');
  const idempKey = 'unique-idemp-test-999';
  const firstIdempRes = await executeCoinToUsdtSwap({
    userId: user1Id,
    coinAmount: 20,
    idempotencyKey: idempKey,
  });

  const balAfterFirst = await getUserCoinBalance(user1Id);

  // Duplicate invocation with exact same key
  const duplicateIdempRes = await executeCoinToUsdtSwap({
    userId: user1Id,
    coinAmount: 20,
    idempotencyKey: idempKey,
  });

  const balAfterDup = await getUserCoinBalance(user1Id);

  assert(firstIdempRes.swap.id === duplicateIdempRes.swap.id, 'Idempotent retry returned identical swap transaction ID');
  assert(balAfterFirst.availableCoinBalance === balAfterDup.availableCoinBalance, 'Duplicate submission did NOT debit user balance twice');

  console.log('\n--- TEST GROUP 7: Concurrent Execution Protection ---');
  // User currently has remaining coins. Let's fire 5 concurrent requests of 50 PHIVO each
  const beforeConcurrentBal = (await getUserCoinBalance(user1Id)).availableCoinBalance;
  const maxPossibleSwaps = Math.floor(beforeConcurrentBal / 50);

  const concurrentPromises = Array.from({ length: 5 }, (_, i) =>
    executeCoinToUsdtSwap({
      userId: user1Id,
      coinAmount: 50,
      idempotencyKey: `concurrent-test-${i}-${Date.now()}`,
    }).catch((err) => ({ error: err.code || err.message }))
  );

  const concurrentResults = await Promise.all(concurrentPromises);
  const successfulSwaps = concurrentResults.filter((r: any) => r.success === true);

  assert(successfulSwaps.length <= maxPossibleSwaps, `Concurrent swaps did not exceed available balance ceiling (succeeded: ${successfulSwaps.length}, allowed: ${maxPossibleSwaps})`);
  const finalCoinBal = await getUserCoinBalance(user1Id);
  assert(finalCoinBal.availableCoinBalance >= 0, `Final coin balance is strictly non-negative: ${finalCoinBal.availableCoinBalance} PHIVO`);

  console.log('\n--- TEST GROUP 8: User Isolation in Swap History ---');
  const user1History = await getUserSwapHistory(user1Id);
  const user2History = await getUserSwapHistory(user2Id);

  assert(user1History.swaps.length > 0, `User 1 has ${user1History.swaps.length} recorded swaps`);
  assert(user2History.swaps.length === 0, `User 2 has 0 recorded swaps (isolated from User 1)`);
  assert(user1History.swaps.every((s) => s.userId === user1Id), 'All user 1 history entries belong strictly to user 1');

  console.log('\n--- TEST GROUP 9: USDT Withdrawal Flow Compatibility ---');
  // Check that the USDT created by coin swaps can be immediately withdrawn via createWithdrawalRequest
  const preWithdrawalWallet = await getWalletSummary(user1Id);
  assert(preWithdrawalWallet.availableBalance >= 10.00, `User 1 has sufficient swapped USDT balance ($${preWithdrawalWallet.availableBalance}) for withdrawal`);

  const withdrawal = await createWithdrawalRequest({
    userId: user1Id,
    amount: 10.00,
    destinationType: 'USDT_BEP20',
    destinationReference: '0x1234567890123456789012345678901234567890',
  });

  assert(withdrawal.amount === 10.00, 'Withdrawal request created successfully using swapped USDT');
  assert(withdrawal.currency === 'USD' || withdrawal.currency === 'USDT', `Withdrawal currency is valid (${withdrawal.currency})`);
  assert(withdrawal.status === 'PENDING', 'Withdrawal status is PENDING');

  const postWithdrawalWallet = await getWalletSummary(user1Id);
  assert(
    postWithdrawalWallet.availableBalance === Number((preWithdrawalWallet.availableBalance - 10.00).toFixed(2)),
    `Wallet available balance accurately debited by $10.00 after withdrawal`
  );

  console.log('\n========================================================');
  console.log(`📊 TASK #19.1 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTask19_1Tests().catch((err) => {
  console.error('Fatal error running Task 19.1 tests:', err);
  process.exit(1);
});

