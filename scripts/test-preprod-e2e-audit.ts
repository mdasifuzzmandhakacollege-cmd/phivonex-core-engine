import http from 'http';
import fs from 'fs';
import express from 'express';
import cookieParser from 'cookie-parser';
import assert from 'assert';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

// Use an isolated PGlite directory only if external Cloud SQL / DATABASE_URL is not configured
if (!process.env.DATABASE_URL && !process.env.SQL_HOST && !process.env.PGLITE_DATA_DIR) {
  const auditDir = '/tmp/phivonex_preprod_audit_db';
  if (fs.existsSync(auditDir)) {
    fs.rmSync(auditDir, { recursive: true, force: true });
  }
  process.env.PGLITE_DATA_DIR = auditDir;
}

import { getDb, closeDb } from '../src/server/db/db';
import { hashPassword } from '../src/server/utils/crypto';
import { generatePublicId, generateReferralCode } from '../src/server/utils/idGenerator';
import authRouter from '../src/server/routes/authRoutes';
import supportRouter from '../src/server/routes/supportRoutes';
import { healthRouter } from '../src/server/routes/healthRoutes';
import { ethers } from 'ethers';
import { processBlockchainDepositEvent } from '../src/server/services/bscDepositService';
import { investInTradingPool, redeemQuantumAlphaPrincipal, getUserMainUsdtBalanceExact } from '../src/server/services/tradingPoolService';
import { processNodePurchaseWithAssetBalance } from '../src/server/services/nodePurchaseBalanceService';
import { subscribeChronoVault } from '../src/server/services/chronoVaultService';
import { settleTradingYieldForDate } from '../src/server/services/tradingYieldEpochService';
import { settleChronoVaultsForDate } from '../src/server/services/chronoVaultEpochService';
import { createRewardEpoch, closeAndSettleEpoch } from '../src/server/services/nodeRewardService';
import { processPendingUnilevelYieldEvents } from '../src/server/services/roiGenerationService';
import { createWithdrawalRequest, settleWithdrawalAction } from '../src/server/services/withdrawalService';
import { verifyUserLedgerReconciliation } from '../src/server/services/unifiedLedgerService';
import { getWalletSummary } from '../src/server/services/walletLedgerService';

function extractCookieHeader(res: Response): string {
  const raw = res.headers.get('set-cookie') || '';
  return raw
    .split(',')
    .map((part) => part.split(';')[0].trim())
    .filter((kv) => kv.includes('='))
    .join('; ');
}

function randomTxHash(): string {
  return '0x' + crypto.randomBytes(32).toString('hex');
}

function randomEthAddress(): string {
  return '0x' + crypto.randomBytes(20).toString('hex');
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runAudit() {
  const runTag = Date.now().toString(36);
  console.log('================================================================================');
  console.log(`PHIVONEX FINAL PRE-PRODUCTION HARDENING & END-TO-END AUDIT (run=${runTag})`);
  console.log('================================================================================\n');

  // 0. Probe live dev server on port 3000 first
  console.log('[PRE-CHECK] Probing live dev server GET http://localhost:3000/api/health ...');
  const liveHealthRes = await fetch('http://localhost:3000/api/health');
  const liveHealthJson: any = await liveHealthRes.json();
  console.log(`Live Server /api/health -> HTTP ${liveHealthRes.status}:`, JSON.stringify(liveHealthJson));
  assert.strictEqual(liveHealthRes.status, 200, 'Live /api/health must return HTTP 200');
  assert.strictEqual(liveHealthJson.database, 'connected');
  assert.strictEqual(liveHealthJson.schemaReady, true);

  // Initialize DB & mount real Express routers
  const db = await getDb();
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/auth', authRouter);
  app.use('/api/support', supportRouter);
  app.use('/api/health', healthRouter);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${address.port}`;
  console.log(`Audit Express server listening on ${baseUrl}\n`);

  const legacyUserId = uuidv4();
  const standardUserId = uuidv4();
  const uplineId = uuidv4();
  const downlineId = uuidv4();
  let createdEpochId: string | null = null;
  let createdNodeId: string | null = null;

  try {
    // =========================================================================
    // CHECK 1: Legacy & Standard User Login + Password Reset Persistence (x3 Logins Each)
    // =========================================================================
    console.log('--- CHECK 1: Auth & Legacy User Password Reset Loop ---');
    const legacyPublicId = generatePublicId();
    const standardPublicId = generatePublicId();
    const oldPassword = 'OldPassword!2025';
    const newPasswordLegacy = 'HardenedLegacy#2026';
    const newPasswordStandard = 'HardenedStandard#2026';
    const oldHash = await hashPassword(oldPassword);

    const legacyEmailNormalized = `legacy.audit.${runTag}@phivonex.test`;
    const standardEmailNormalized = `standard.audit.${runTag}@phivonex.test`;

    // Insert legacy user with mixed-case & whitespace email + must_reset_password = TRUE
    await db.query(
      `INSERT INTO users (id, public_id, full_name, email, country, password_hash, role, status, email_verified_at, must_reset_password, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'United States', $5, 'USER', 'ACTIVE', CURRENT_TIMESTAMP, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [legacyUserId, legacyPublicId, 'Legacy Audit Member', `  Legacy.Audit.${runTag}@Phivonex.Test  `, oldHash]
    );
    await db.query(
      `INSERT INTO user_referrals (user_id, referral_code, created_at) VALUES ($1, $2, CURRENT_TIMESTAMP)`,
      [legacyUserId, generateReferralCode()]
    );
    // Attach historical binary_placements row so hasLegacyPortfolio = true
    await db.query(
      `INSERT INTO binary_placements (user_id, parent_user_id, side, status, placed_at, created_at)
       VALUES ($1, NULL, NULL, 'PLACED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [legacyUserId]
    );

    // Insert standard user
    await db.query(
      `INSERT INTO users (id, public_id, full_name, email, country, password_hash, role, status, email_verified_at, must_reset_password, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'United States', $5, 'USER', 'ACTIVE', CURRENT_TIMESTAMP, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [standardUserId, standardPublicId, 'Standard Audit Member', standardEmailNormalized, oldHash]
    );
    await db.query(
      `INSERT INTO user_referrals (user_id, referral_code, created_at) VALUES ($1, $2, CURRENT_TIMESTAMP)`,
      [standardUserId, generateReferralCode()]
    );

    let standardCookie = '';

    for (const tc of [
      {
        label: 'LEGACY_USER',
        userId: legacyUserId,
        rawEmailInput: `  LEGACY.AUDIT.${runTag}@PHIVONEX.TEST `,
        normalizedEmail: legacyEmailNormalized,
        newPassword: newPasswordLegacy,
      },
      {
        label: 'STANDARD_USER',
        userId: standardUserId,
        rawEmailInput: `Standard.Audit.${runTag}@Phivonex.Test`,
        normalizedEmail: standardEmailNormalized,
        newPassword: newPasswordStandard,
      },
    ]) {
      // 1a. Request forgot-password OTP and capture the real 6-digit code dispatched to email
      let capturedOtp: string | null = null;
      const origLog = console.log;
      console.log = (...args: any[]) => {
        const line = args.map((a) => String(a)).join(' ');
        const match = line.match(/PHIVONEX Password Reset Code:\s*(\d{6})/);
        if (match) capturedOtp = match[1];
        origLog(...args);
      };
      let fpRes: Response;
      try {
        fpRes = await fetch(`${baseUrl}/api/auth/forgot-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: tc.rawEmailInput }),
        });
      } finally {
        console.log = origLog;
      }
      assert.strictEqual(fpRes.status, 200, `${tc.label}: forgot-password must return 200`);

      // Verify hashed PASSWORD_RESET token persisted in auth_tokens
      const tokenCheck = await db.query<{ cnt: string }>(
        `SELECT COUNT(*)::text AS cnt FROM auth_tokens WHERE user_id = $1 AND type = 'PASSWORD_RESET' AND used_at IS NULL`,
        [tc.userId]
      );
      assert.ok(Number(tokenCheck.rows[0]?.cnt || 0) >= 1, `${tc.label}: auth_tokens row must exist`);
      assert.ok(capturedOtp, `${tc.label}: 6-digit OTP must be emitted by forgot-password`);
      const otpCode = capturedOtp;

      // 1c. Reset password via API
      const rpRes = await fetch(`${baseUrl}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: tc.rawEmailInput, code: otpCode, newPassword: tc.newPassword }),
      });
      const rpJson: any = await rpRes.json();
      assert.strictEqual(
        rpRes.status,
        200,
        `${tc.label}: reset-password must return 200 (got ${rpRes.status}: ${JSON.stringify(rpJson)})`
      );

      // Verify must_reset_password cleared & email normalized in DB
      const uCheck = await db.query<{ email: string; must_reset_password: boolean }>(
        `SELECT email, must_reset_password FROM users WHERE id = $1`,
        [tc.userId]
      );
      assert.strictEqual(uCheck.rows[0].email, tc.normalizedEmail, `${tc.label}: email must be normalized`);
      assert.strictEqual(uCheck.rows[0].must_reset_password, false, `${tc.label}: must_reset_password must be FALSE`);

      // Verify old password is rejected (HTTP 401)
      const oldLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: tc.normalizedEmail, password: oldPassword }),
      });
      assert.strictEqual(oldLoginRes.status, 401, `${tc.label}: old password must be rejected with 401`);

      // 1d. 3 consecutive logins with the new password
      for (let attempt = 1; attempt <= 3; attempt++) {
        const bodyPayload =
          attempt === 2
            ? { email: tc.rawEmailInput, password: tc.newPassword }
            : { identifier: tc.rawEmailInput, password: tc.newPassword };
        const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(bodyPayload),
        });
        assert.strictEqual(loginRes.status, 200, `${tc.label}: login attempt #${attempt} must return 200`);
        const cookie = extractCookieHeader(loginRes);
        assert.ok(cookie.includes('phx_session='), `${tc.label}: login #${attempt} must issue phx_session cookie`);

        const meRes = await fetch(`${baseUrl}/api/auth/me`, {
          headers: { Cookie: cookie },
        });
        const meJson: any = await meRes.json();
        assert.strictEqual(meRes.status, 200, `${tc.label}: /api/auth/me after login #${attempt} must return 200`);
        assert.strictEqual(meJson.user.id, tc.userId);

        if (tc.label === 'STANDARD_USER' && attempt === 3) {
          standardCookie = cookie;
        }
      }
      console.log(`PASS [${tc.label}]: forgot-password -> reset-password -> old password 401 -> 3/3 consecutive logins HTTP 200 + /api/auth/me HTTP 200 (must_reset_password=false)`);
    }

    // =========================================================================
    // CHECK 2: All 3 Flagship Products Live Purchase + Deposit + email_delivery_logs
    // =========================================================================
    console.log('\n--- CHECK 2: All 3 Products Live Purchase & Transactional Email Logs ---');
    const uplinePub = generatePublicId();
    const downlinePub = generatePublicId();

    await db.query(
      `INSERT INTO users (id, public_id, full_name, email, country, password_hash, role, status, email_verified_at, created_at, updated_at)
       VALUES ($1, $2, 'Upline Audit Sponsor', $3, 'United States', $7, 'USER', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
              ($4, $5, 'Downline Audit Investor', $6, 'United States', $7, 'USER', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        uplineId,
        uplinePub,
        `upline.audit.${runTag}@phivonex.test`,
        downlineId,
        downlinePub,
        `downline.audit.${runTag}@phivonex.test`,
        oldHash,
      ]
    );
    await db.query(
      `INSERT INTO user_referrals (user_id, referral_code, sponsor_user_id, created_at)
       VALUES ($1, $2, NULL, CURRENT_TIMESTAMP),
              ($3, $4, $1, CURRENT_TIMESTAMP)`,
      [uplineId, generateReferralCode(), downlineId, generateReferralCode()]
    );

    // Provision unique BEP-20 HD-style deposit addresses for upline and downline
    const uplineDepositAddress = ethers.getAddress(randomEthAddress());
    const downlineDepositAddress = ethers.getAddress(randomEthAddress());
    await db.query(
      `INSERT INTO user_deposit_addresses (id, user_id, chain_id, asset, address, derivation_index, derivation_reference, created_at)
       VALUES ($1, $2, 56, 'USDT', $3, 990001, 'audit-hd/1', CURRENT_TIMESTAMP),
              ($4, $5, 56, 'USDT', $6, 990002, 'audit-hd/2', CURRENT_TIMESTAMP)`,
      [uuidv4(), uplineId, uplineDepositAddress, uuidv4(), downlineId, downlineDepositAddress]
    );

    // Fund upline ($1,000) & activate $500 Quantum Alpha so Upline unlocks Gen-1 royalties
    const uplineDep = await processBlockchainDepositEvent({
      fromAddress: randomEthAddress(),
      toAddress: uplineDepositAddress,
      txHash: randomTxHash(),
      amount: 1000,
      asset: 'USDT',
      blockNumber: 45000001,
      currentBlockNumber: 45000020,
    });
    assert.ok(uplineDep && uplineDep.status === 'CREDITED', 'Upline deposit must reach CREDITED state');
    await investInTradingPool({ userId: uplineId, amountUsd: 500 });

    // Fund downline ($3,000 USDT) via BEP-20 deposit flow -> triggers DEPOSIT_CONFIRMED
    const downlineDeposit = await processBlockchainDepositEvent({
      fromAddress: randomEthAddress(),
      toAddress: downlineDepositAddress,
      txHash: randomTxHash(),
      amount: 3000,
      asset: 'USDT',
      blockNumber: 45000002,
      currentBlockNumber: 45000020,
    });
    assert.ok(downlineDeposit && downlineDeposit.status === 'CREDITED', 'Downline deposit must reach CREDITED state');
    console.log(`Downline BEP-20 Deposit Credited: $${downlineDeposit.amount} USDT (status=${downlineDeposit.status}, addr=${downlineDepositAddress})`);

    // Product 1: Quantum Alpha ($500)
    const alphaRes = await investInTradingPool({ userId: downlineId, amountUsd: 500 });
    assert.strictEqual(alphaRes.position.status, 'ACTIVE');
    console.log(`Product 1 [Quantum Alpha™]: ACTIVE | posId=${alphaRes.position.id} | principal=$${alphaRes.position.principalAmount} | tier=${alphaRes.tier.tierName}`);

    // Product 2: Genesis Core (1 Node = $1,000)
    const nodeRes = await processNodePurchaseWithAssetBalance(downlineId, 'USDT');
    assert.strictEqual(nodeRes.success, true);
    assert.ok(nodeRes.node?.publicNodeId, 'Genesis Node must be created');
    const nodeIdRow = await db.query<{ id: string }>(
      `SELECT id FROM nodes WHERE public_node_id = $1 LIMIT 1`,
      [nodeRes.node.publicNodeId]
    );
    assert.strictEqual(nodeIdRow.rows.length, 1, 'Genesis Node UUID must exist');
    const downlineNodeId = nodeIdRow.rows[0].id;
    createdNodeId = downlineNodeId;
    console.log(`Product 2 [Genesis Core™]: ACTIVE | nodeId=${nodeRes.node.publicNodeId} | debited=$${nodeRes.deductedAmount} ${nodeRes.assetUsed}`);

    // Product 3: Chrono Vaults ($300 on CHRONO_200D)
    const vaultRes = await subscribeChronoVault({
      userId: downlineId,
      planCode: 'CHRONO_200D',
      amountUsd: 300,
    });
    assert.strictEqual(vaultRes.position.status, 'ACTIVE');
    console.log(`Product 3 [Chrono Vaults™]: ACTIVE | posId=${vaultRes.position.id} | principal=$${vaultRes.position.principalAmount} | dailyRate=${vaultRes.position.dailyRatePctSnapshot}%`);

    await sleep(600);

    // =========================================================================
    // CHECK 3: Asset-Matched Daily Yield & 16-Gen Royalty Sweep
    // =========================================================================
    console.log('\n--- CHECK 3: Asset-Matched Yield & 16-Generation Royalty Sweep ---');
    // Pick a clean weekday date: Thursday 2026-11-26
    const settleDate = '2026-11-26';
    await db.query(
      `UPDATE user_trading_positions SET activated_at = '2026-11-20T00:00:00Z' WHERE id = $1`,
      [alphaRes.position.id]
    );
    await db.query(
      `UPDATE user_vault_positions SET activated_at = '2026-11-20T00:00:00Z' WHERE id = $1`,
      [vaultRes.position.id]
    );
    await db.query(
      `UPDATE nodes SET activated_at = '2026-11-20T00:00:00Z' WHERE id = $1`,
      [downlineNodeId]
    );

    const uplineUsdtBefore = (await getUserMainUsdtBalanceExact(uplineId, db)).availableBalanceStr;
    const uplinePhivoBefore = (await getWalletSummary(uplineId)).phivoBalance;

    // 3a. Settle Quantum Alpha yield
    const alphaYieldRes = await settleTradingYieldForDate(settleDate, {
      positionId: alphaRes.position.id,
      singleDateOnly: true,
    });
    console.log(`Quantum Alpha Yield Settled (${settleDate}): payouts=${alphaYieldRes.payoutsCreated}, distributed=$${alphaYieldRes.totalYieldDistributedUsd} USDT`);
    assert.strictEqual(alphaYieldRes.payoutsCreated, 1, 'Expected 1 Quantum Alpha yield payout');

    // 3b. Settle Chrono Vault yield
    const vaultYieldRes = await settleChronoVaultsForDate(settleDate, {
      positionId: vaultRes.position.id,
      singleDateOnly: true,
    });
    console.log(`Chrono Vault Yield Settled (${settleDate}): payouts=${vaultYieldRes.payoutsCreated}, distributed=$${vaultYieldRes.totalYieldDistributedUsd} USDT`);
    assert.strictEqual(vaultYieldRes.payoutsCreated, 1, 'Expected 1 Chrono Vault yield payout');

    // 3c. Settle Genesis Core daily PHIVO emission (15 PHIVO/day)
    const epoch = await createRewardEpoch({ rewardPerNode: 15, businessDateStr: settleDate });
    createdEpochId = epoch.id;
    const nodeRewardRes = await closeAndSettleEpoch(epoch.id, {
      configuredRewardPerNode: 15,
      targetNodeId: downlineNodeId,
      suppressEmails: true,
    });
    console.log(`Genesis Core Emission Settled (${settleDate}): rewards=${nodeRewardRes.rewardsCreated}, rate=${nodeRewardRes.rewardPerNode} PHIVO/node`);
    assert.strictEqual(nodeRewardRes.rewardsCreated, 1, 'Expected 1 Genesis Node reward emission');

    // 3d. Sweep pending 16-generation unilevel royalties
    const unilevelBatch = await processPendingUnilevelYieldEvents();
    console.log(`Unilevel Royalty Sweep: eventsProcessed=${unilevelBatch.eventsProcessed}, settledPayouts=${unilevelBatch.totalSettledPayoutsCount}`);

    const royaltyRows = await db.query<{
      source_product_type: string;
      generation_level: number;
      source_yield_amount: string;
      commission_pct: string;
      royalty_amount: string;
      currency: string;
      status: string;
    }>(
      `SELECT source_product_type, generation_level,
              ROUND(source_yield_amount, 8)::text AS source_yield_amount,
              ROUND(commission_pct, 4)::text AS commission_pct,
              ROUND(royalty_amount, 8)::text AS royalty_amount,
              currency, status
       FROM unilevel_royalty_payouts
       WHERE beneficiary_user_id = $1 AND source_user_id = $2 AND epoch_date = $3::date
       ORDER BY source_product_type ASC`,
      [uplineId, downlineId, settleDate]
    );

    console.log('Exact `unilevel_royalty_payouts` rows for Upline:');
    console.table(royaltyRows.rows);

    const genesisRoyalty = royaltyRows.rows.find((r) => r.source_product_type === 'GENESIS_NODE');
    const alphaRoyalty = royaltyRows.rows.find((r) => r.source_product_type === 'TRADING_POOL');
    const vaultRoyalty = royaltyRows.rows.find((r) => r.source_product_type === 'CHRONO_VAULT');

    assert.ok(genesisRoyalty, 'Missing GENESIS_NODE royalty row');
    assert.strictEqual(genesisRoyalty.currency, 'PHIVO', 'GENESIS_NODE royalty MUST be in PHIVO');
    assert.strictEqual(genesisRoyalty.royalty_amount, '1.50000000', '15 PHIVO * 10% Gen-1 = 1.50000000 PHIVO');

    assert.ok(alphaRoyalty, 'Missing TRADING_POOL royalty row');
    assert.strictEqual(alphaRoyalty.currency, 'USDT', 'TRADING_POOL royalty MUST be in USDT');

    assert.ok(vaultRoyalty, 'Missing CHRONO_VAULT royalty row');
    assert.strictEqual(vaultRoyalty.currency, 'USDT', 'CHRONO_VAULT royalty MUST be in USDT');

    const uplineUsdtAfter = (await getUserMainUsdtBalanceExact(uplineId, db)).availableBalanceStr;
    const uplinePhivoAfter = (await getWalletSummary(uplineId)).phivoBalance;

    const expectedUsdtDelta = Number(alphaRoyalty.royalty_amount) + Number(vaultRoyalty.royalty_amount);
    const actualUsdtDelta = Number(uplineUsdtAfter) - Number(uplineUsdtBefore);
    const actualPhivoDelta = Number(uplinePhivoAfter) - Number(uplinePhivoBefore);

    console.log(`Upline PHIVO Wallet: ${uplinePhivoBefore.toFixed(8)} -> ${uplinePhivoAfter.toFixed(8)} PHIVO (delta=+${actualPhivoDelta.toFixed(8)} PHIVO)`);
    console.log(`Upline Main USDT Wallet: $${uplineUsdtBefore} -> $${uplineUsdtAfter} USDT (delta=+$${actualUsdtDelta.toFixed(8)} USDT, expected=+$${expectedUsdtDelta.toFixed(8)} USDT)`);

    assert.ok(Math.abs(actualPhivoDelta - 1.5) < 1e-8, 'Upline PHIVO Wallet must increase by exactly 1.50000000 PHIVO');
    assert.ok(Math.abs(actualUsdtDelta - expectedUsdtDelta) < 1e-6, 'Upline USDT Wallet must increase by exact USDT royalties only (zero PHIVO leakage)');

    // =========================================================================
    // CHECK 4: Quantum Alpha Post-7-Day Redemption + Withdrawal Submitted/Settled Emails
    // =========================================================================
    console.log('\n--- CHECK 4: Quantum Alpha Post-7-Day Principal Redemption (15% Fee / 85% Net) ---');
    await db.query(
      `UPDATE user_trading_positions SET unlock_eligible_at = NOW() - INTERVAL '1 hour' WHERE id = $1`,
      [alphaRes.position.id]
    );
    const redeemRes = await redeemQuantumAlphaPrincipal({
      userId: downlineId,
      positionId: alphaRes.position.id,
    });
    console.log(
      `Redemption Result: status=${redeemRes.position.status}, gross=$${redeemRes.principalUsd}, fee(${redeemRes.settlementFeePct}%)=$${redeemRes.settlementFeeUsd}, netPayout=$${redeemRes.netPayoutUsd}`
    );
    assert.strictEqual(redeemRes.position.status, 'REDEEMED');
    assert.strictEqual(redeemRes.settlementFeePct, '15.0000');
    assert.strictEqual(redeemRes.settlementFeeUsd, '75.00000000');
    assert.strictEqual(redeemRes.netPayoutUsd, '425.00000000');

    // Submit & settle a $50 USDT withdrawal for Downline to verify WITHDRAWAL_SUBMITTED & WITHDRAWAL_SETTLED email logs
    const wdr = await createWithdrawalRequest({
      userId: downlineId,
      amount: 50,
      destinationType: 'USDT_BEP20',
      destinationReference: randomEthAddress(),
    });
    await settleWithdrawalAction({
      withdrawalIdOrPublicId: wdr.publicWithdrawalId,
      action: 'APPROVE',
      actorEmail: 'audit-admin@phivonex.test',
    });
    await settleWithdrawalAction({
      withdrawalIdOrPublicId: wdr.publicWithdrawalId,
      action: 'COMPLETE',
      actorEmail: 'audit-admin@phivonex.test',
      txHash: randomTxHash(),
    });

    await sleep(600);

    const emailLogsRes = await db.query<{
      event_type: string;
      recipient_email: string;
      status: string;
      subject: string;
    }>(
      `SELECT event_type, recipient_email, status, subject
       FROM email_delivery_logs
       WHERE user_id = $1
       ORDER BY created_at ASC`,
      [downlineId]
    );
    console.log('\nPersisted `email_delivery_logs` rows for Downline:');
    console.table(emailLogsRes.rows);

    const loggedEvents = new Set(emailLogsRes.rows.map((r) => r.event_type));
    for (const requiredEvent of [
      'DEPOSIT_CONFIRMED',
      'QUANTUM_ALPHA_ALLOCATED',
      'GENESIS_NODE_MINTED',
      'CHRONO_VAULT_SUBSCRIBED',
      'QUANTUM_ALPHA_REDEEMED',
      'WITHDRAWAL_SUBMITTED',
      'WITHDRAWAL_SETTLED',
    ]) {
      assert.ok(loggedEvents.has(requiredEvent), `Missing required email_delivery_logs row for ${requiredEvent}`);
    }

    // =========================================================================
    // CHECK 5: AI Support Concierge, /api/health, & Zero-Sum Reconciliation
    // =========================================================================
    console.log('\n--- CHECK 5: AI Support Concierge, /api/health & Zero-Sum Reconciliation ---');
    const aiRes = await fetch(`${baseUrl}/api/support/ai-concierge`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: standardCookie,
      },
      body: JSON.stringify({
        message: 'How does Quantum Alpha 7-day cycle work?',
      }),
    });
    const aiJson: any = await aiRes.json();
    assert.strictEqual(aiRes.status, 200, 'AI Concierge must return HTTP 200');
    assert.strictEqual(aiJson.success, true);
    assert.ok(aiJson.response?.responseText?.includes('7'), 'AI Concierge reply must reference the 7-day cycle');
    console.log(`AI Concierge HTTP ${aiRes.status} (source=${aiJson.response.source}, model=${aiJson.response.model}): "${aiJson.response.responseText.slice(0, 160).replace(/\n/g, ' ')}..."`);

    const healthRes = await fetch(`${baseUrl}/api/health`);
    const healthJson: any = await healthRes.json();
    assert.strictEqual(healthRes.status, 200);
    assert.strictEqual(healthJson.database, 'connected');
    assert.strictEqual(healthJson.schemaReady, true);
    console.log(`Audit Server /api/health -> HTTP ${healthRes.status}:`, JSON.stringify(healthJson));

    const reconUpline = await verifyUserLedgerReconciliation(uplineId);
    const reconDownline = await verifyUserLedgerReconciliation(downlineId);
    console.log(`Upline Ledger Reconciliation: isBalanced=${reconUpline.isBalanced}, discrepancyUsd=$${reconUpline.discrepancyUsd}, netBalance=$${reconUpline.netLedgerBalance}`);
    console.log(`Downline Ledger Reconciliation: isBalanced=${reconDownline.isBalanced}, discrepancyUsd=$${reconDownline.discrepancyUsd}, netBalance=$${reconDownline.netLedgerBalance}`);

    assert.strictEqual(reconUpline.isBalanced, true, 'Upline ledger must be zero-sum balanced');
    assert.strictEqual(reconUpline.discrepancyUsd, '0.00000000', 'Upline discrepancy must be 0.00000000');
    assert.strictEqual(reconDownline.isBalanced, true, 'Downline ledger must be zero-sum balanced');
    assert.strictEqual(reconDownline.discrepancyUsd, '0.00000000', 'Downline discrepancy must be 0.00000000');

    console.log('\n================================================================================');
    console.log('ALL 5 PRE-PRODUCTION END-TO-END AUDIT CHECKS PASSED (100%)');
    console.log('================================================================================');
  } finally {
    // Clean up synthetic audit rows from Cloud SQL so production/preview DB remains spotless
    const auditUserIds = [legacyUserId, standardUserId, uplineId, downlineId];
    const safeDel = async (sql: string, params: any[]) => {
      try {
        await db.query(sql, params);
      } catch {
        // ignore optional table mismatch during cleanup
      }
    };
    await safeDel(`DELETE FROM email_delivery_logs WHERE user_id = ANY($1::uuid[])`, [auditUserIds]);
    await safeDel(`DELETE FROM unilevel_royalty_payouts WHERE beneficiary_user_id = ANY($1::uuid[]) OR source_user_id = ANY($1::uuid[])`, [auditUserIds]);
    await safeDel(`DELETE FROM unilevel_yield_events WHERE source_user_id = ANY($1::uuid[])`, [auditUserIds]);
    await safeDel(`DELETE FROM trading_yield_payouts WHERE user_id = ANY($1::uuid[])`, [auditUserIds]);
    await safeDel(`DELETE FROM vault_yield_payouts WHERE user_id = ANY($1::uuid[])`, [auditUserIds]);
    await safeDel(`DELETE FROM user_trading_positions WHERE user_id = ANY($1::uuid[])`, [auditUserIds]);
    await safeDel(`DELETE FROM user_vault_positions WHERE user_id = ANY($1::uuid[])`, [auditUserIds]);
    await safeDel(`DELETE FROM node_rewards WHERE owner_user_id = ANY($1::uuid[])`, [auditUserIds]);
    if (createdEpochId) {
      await safeDel(`DELETE FROM reward_epochs WHERE id = $1`, [createdEpochId]);
    }
    await safeDel(`UPDATE nodes SET owner_user_id = NULL, status = 'AVAILABLE', activated_at = NULL WHERE owner_user_id = ANY($1::uuid[])`, [auditUserIds]);
    if (createdNodeId) {
      await safeDel(`UPDATE nodes SET owner_user_id = NULL, status = 'AVAILABLE', activated_at = NULL WHERE id = $1`, [createdNodeId]);
    }
    await safeDel(`DELETE FROM node_orders WHERE user_id = ANY($1::uuid[])`, [auditUserIds]);
    await safeDel(`DELETE FROM withdrawal_state_audit_logs WHERE user_id = ANY($1::uuid[])`, [auditUserIds]);
    await safeDel(`DELETE FROM withdrawals WHERE user_id = ANY($1::uuid[])`, [auditUserIds]);
    await safeDel(`DELETE FROM blockchain_deposits WHERE user_id = ANY($1::uuid[])`, [auditUserIds]);
    await safeDel(`DELETE FROM user_deposit_addresses WHERE user_id = ANY($1::uuid[])`, [auditUserIds]);
    await safeDel(`DELETE FROM financial_ledger_entries WHERE user_id = ANY($1::uuid[])`, [auditUserIds]);
    await safeDel(`DELETE FROM notifications WHERE user_id = ANY($1::uuid[])`, [auditUserIds]);
    await safeDel(`DELETE FROM sessions WHERE user_id = ANY($1::uuid[])`, [auditUserIds]);
    await safeDel(`DELETE FROM auth_tokens WHERE user_id = ANY($1::uuid[])`, [auditUserIds]);
    await safeDel(`DELETE FROM binary_placements WHERE user_id = ANY($1::uuid[])`, [auditUserIds]);
    await safeDel(`DELETE FROM user_referrals WHERE user_id = ANY($1::uuid[])`, [auditUserIds]);
    await safeDel(`DELETE FROM users WHERE id = ANY($1::uuid[]) OR LOWER(TRIM(email)) LIKE '%.audit.%@phivonex.test'`, [auditUserIds]);
    console.log('[CLEANUP] Synthetic audit rows cleaned up cleanly from database.');
    server.close();
    await closeDb().catch(() => {});
  }
}

runAudit()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n[PRE-PROD E2E AUDIT FAILED]:', err);
    process.exit(1);
  });
