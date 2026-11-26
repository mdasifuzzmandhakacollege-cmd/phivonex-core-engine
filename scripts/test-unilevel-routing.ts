import { getDb } from '../src/server/db/db';
import { enqueueUnilevelYieldEvent } from '../src/server/services/unilevelYieldEventService';
import { processPendingUnilevelYieldEvents } from '../src/server/services/roiGenerationService';
import { getWalletSummary } from '../src/server/services/walletLedgerService';

async function runTest() {
  const db = await getDb();
  console.log('=== STARTING ASSET-MATCHED 16-GEN UNILEVEL ROUTING LIVE TEST (QUALIFIED SPONSOR) ===');

  const usersRes = await db.query('SELECT id, public_id, email FROM users LIMIT 2');
  if (usersRes.rows.length < 2) {
    console.log('Not enough users in DB to run test.');
    return;
  }
  const sponsor = usersRes.rows[0];
  const downline = usersRes.rows[1];

  console.log(`Upline Sponsor (Gen-1): ${sponsor.public_id} (${sponsor.id})`);
  console.log(`Downline: ${downline.public_id} (${downline.id})`);

  // Give sponsor active trading position so Gen 1 is unlocked ($500 active principal)
  await db.query(
    `INSERT INTO user_trading_positions (id, user_id, tier_id, principal_amount, status, activated_at) 
     VALUES (gen_random_uuid(), $1, 'a1000001-0000-4000-8000-000000000001', 500.00000000, 'ACTIVE', NOW())
     ON CONFLICT DO NOTHING`,
    [sponsor.id]
  );

  await db.query(
    `INSERT INTO user_referrals (user_id, referral_code, sponsor_user_id, created_at) VALUES ($1, 'REF_TEST_99', $2, NOW()) ON CONFLICT (user_id) DO UPDATE SET sponsor_user_id = EXCLUDED.sponsor_user_id`,
    [downline.id, sponsor.id]
  );

  const epochDate = '2026-11-26';
  const yieldId1 = '33333333-3333-4333-8333-333333333333';
  const yieldId2 = '44444444-4444-4444-8444-444444444444';

  // 1. GENESIS_NODE yield event (10.00000000 PHIVO)
  const ev1 = await enqueueUnilevelYieldEvent(db, {
    sourceProductType: 'GENESIS_NODE',
    sourceYieldId: yieldId1,
    sourceUserId: downline.id,
    epochDate,
    sourceRoiUsd: '1.00000000',
    rawTokenAmount: '10.00000000',
    tokenReferencePriceUsd: '0.10000000',
  });
  console.log('Enqueued Genesis Node Yield Event:', ev1?.id);

  // 2. TRADING_POOL yield event ($10.00000000 USDT)
  const ev2 = await enqueueUnilevelYieldEvent(db, {
    sourceProductType: 'TRADING_POOL',
    sourceYieldId: yieldId2,
    sourceUserId: downline.id,
    epochDate,
    sourceRoiUsd: '10.00000000',
  });
  console.log('Enqueued Trading Pool Yield Event:', ev2?.id);

  const batchRes = await processPendingUnilevelYieldEvents(10);
  console.log('Batch Processing Result:', JSON.stringify(batchRes, null, 2));

  const payoutsRes = await db.query(
    `SELECT id, beneficiary_user_id, source_user_id, generation_level, source_product_type, source_yield_amount, royalty_amount, currency, status FROM unilevel_royalty_payouts WHERE beneficiary_user_id = $1 ORDER BY created_at DESC LIMIT 5`,
    [sponsor.id]
  );
  console.log('--- UNILEVEL ROYALTY PAYOUTS ROWS ---');
  console.table(payoutsRes.rows);

  const sponsorWallet = await getWalletSummary(sponsor.id);
  console.log('--- SPONSOR WALLET BALANCES ---');
  console.log(`Main USDT Wallet Balance: $${sponsorWallet.mainWalletBalance}`);
  console.log(`PHIVO Token Wallet Balance: ${sponsorWallet.phivoBalance} PHIVO`);

  console.log('=== TEST COMPLETED SUCCESSFULLY ===');
}

runTest().catch((err) => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
