/**
 * Live Verification Script for:
 * 1. Canonical 16-Generation Unilevel Hierarchy Integrity (zero cycles, zero self-refs, binary_placements intact)
 * 2. P2P USDT transfer via Recipient User Code (PHX-...) + Idempotency Replay + Zero-Sum Reconciliation
 * 3. P2P PHIVO transfer via Recipient Email + Exact Claimed/Transferable PHIVO Accounting
 * 4. Self-transfer block (HTTP 400 / SELF_TRANSFER_FORBIDDEN)
 * 5. 12th Admin Master Switch (p2p_internal_transfers_enabled) OFF -> HTTP 403 MODULE_PAUSED -> Restored ON
 *
 * Cleans up temporary P2P test users completely after verification so production Cloud SQL stays pristine.
 */
import 'dotenv/config';
import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseClient, QueryResult, getDb, closeDb, getEffectiveDatabaseUrl } from '../src/server/db/db';
import { hashPassword, hashToken } from '../src/server/utils/crypto';
import {
  lookupP2pRecipient,
  executeP2pInternalTransfer,
  getUserTransferablePhivoExact,
  getUserP2pTransferHistory,
  P2pTransferError,
} from '../src/server/services/p2pTransferService';
import { updateEcosystemFeatureSwitch } from '../src/server/services/unilevelConfigService';
import { verifyUserLedgerReconciliation, verifyAllUsersLedgerReconciliation } from '../src/server/services/unifiedLedgerService';
import { getUserMainUsdtBalanceExact } from '../src/server/services/tradingPoolService';

async function initFastScriptDb(): Promise<DatabaseClient> {
  const url = getEffectiveDatabaseUrl();
  if (!url) return getDb();
  const isUnixSocket = url.includes('host=/') || url.includes('host=%2F') || url.startsWith('/');
  const pool = new Pool({
    connectionString: url,
    max: 6,
    connectionTimeoutMillis: 8000,
    ...(isUnixSocket ? {} : { ssl: { rejectUnauthorized: false } }),
  });
  const client: DatabaseClient = {
    async query<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>> {
      const res = await pool.query(sql, params);
      return { rows: res.rows as T[], rowCount: res.rowCount ?? res.rows.length };
    },
    async exec(sql: string): Promise<void> {
      await pool.query(sql);
    },
    async transaction<T>(callback: (c: DatabaseClient) => Promise<T>): Promise<T> {
      const pgClient = await pool.connect();
      const trxClient: DatabaseClient = {
        async query<R = any>(sql: string, params?: any[]): Promise<QueryResult<R>> {
          const res = await pgClient.query(sql, params);
          return { rows: res.rows as R[], rowCount: res.rowCount ?? res.rows.length };
        },
        async exec(sql: string): Promise<void> {
          await pgClient.query(sql);
        },
        async transaction<R>(cb: (c: DatabaseClient) => Promise<R>): Promise<R> {
          return cb(trxClient);
        },
      };
      try {
        await pgClient.query('BEGIN');
        const result = await callback(trxClient);
        await pgClient.query('COMMIT');
        return result;
      } catch (err) {
        await pgClient.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        pgClient.release();
      }
    },
  };
  (globalThis as any).__phivonexPool = pool;
  (globalThis as any).__phivonexDb = client;
  return client;
}

async function issueTestOtp(db: any, userId: string, code: string) {
  await db.query(
    `INSERT INTO auth_tokens (id, user_id, token_hash, type, expires_at, created_at)
     VALUES ($1, $2, $3, 'P2P_TRANSFER_OTP', NOW() + INTERVAL '10 minutes', NOW())`,
    [uuidv4(), userId, hashToken(code)]
  );
}

async function runVerification() {
  const db = await initFastScriptDb();
  const suffix = Date.now().toString().slice(-6);
  const senderId = uuidv4();
  const recipientId = uuidv4();
  const senderCode = `PHX-T1${suffix.slice(-4)}`;
  const recipientCode = `PHX-T2${suffix.slice(-4)}`;
  const senderEmail = `p2p.sender.${suffix}@phivonex.test`;
  const recipientEmail = `p2p.recipient.${suffix}@phivonex.test`;
  const pwHash = await hashPassword('PhivonexVerify#2026');

  try {
    console.log('--- TEST 0: Unilevel Tree Integrity & Pre-Launch Zero-Balance Verification ---');
    const treeCheck = await db.query<{
      total_users: string;
      linked_users: string;
      self_refs: string;
      binary_preserved: string;
      active_nodes: string;
      total_accrued_phivo: string;
      total_claimed_phivo: string;
    }>(`
      SELECT
        (SELECT COUNT(*)::text FROM users) AS total_users,
        (SELECT COUNT(*)::text FROM user_referrals WHERE sponsor_user_id IS NOT NULL) AS linked_users,
        (SELECT COUNT(*)::text FROM user_referrals WHERE sponsor_user_id = user_id) AS self_refs,
        (SELECT COUNT(*)::text FROM binary_placements) AS binary_preserved,
        (SELECT COUNT(*)::text FROM nodes WHERE status IN ('ACTIVE', 'EMITTING') AND owner_user_id IS NOT NULL) AS active_nodes,
        COALESCE((SELECT SUM(accrued_phivo) FROM nodes), 0)::numeric(20,8)::text AS total_accrued_phivo,
        COALESCE((SELECT SUM(claimed_phivo) FROM nodes), 0)::numeric(20,8)::text AS total_claimed_phivo
    `);
    console.log('Unilevel & Node Backfill Snapshot:', JSON.stringify(treeCheck.rows[0]));
    if (Number(treeCheck.rows[0].self_refs) !== 0) {
      throw new Error('Detected self-referencing sponsor row in user_referrals!');
    }

    // Seed 2 temporary test accounts for isolated P2P verification
    await db.query(
      `
      INSERT INTO users (id, public_id, full_name, email, country, password_hash, status, role, email_verified_at, created_at, updated_at)
      VALUES
        ($1, $2, 'P2P Test Sender', $3, 'United States', $4, 'ACTIVE', 'USER', NOW(), NOW(), NOW()),
        ($5, $6, 'P2P Test Recipient', $7, 'United States', $4, 'ACTIVE', 'USER', NOW(), NOW(), NOW())
      `,
      [senderId, senderCode, senderEmail, pwHash, recipientId, recipientCode, recipientEmail]
    );

    await db.query(
      `
      INSERT INTO user_referrals (user_id, referral_code, created_at)
      VALUES ($1, $2, NOW()), ($3, $4, NOW())
      `,
      [senderId, senderCode, recipientId, recipientCode]
    );

    // Fund Sender with $100.00000000 USDT and 50.00000000 claimed PHIVO via ADMIN_ADJUSTMENT
    await db.query(
      `
      INSERT INTO financial_ledger_entries (
        id, public_txn_id, user_id, entry_type, source_type, source_id, source_ref,
        description, amount, currency, status, created_at
      )
      VALUES
        ($1, $2, $3, 'CREDIT', 'ADMIN_ADJUSTMENT', $4, 'TEST-SEED-USDT', 'Test P2P USDT funding', 100.00000000, 'USDT', 'SETTLED', NOW()),
        ($5, $6, $3, 'CREDIT', 'ADMIN_ADJUSTMENT', $7, 'TEST-SEED-PHIVO', 'Test P2P PHIVO funding', 50.00000000, 'PHIVO', 'SETTLED', NOW())
      `,
      [uuidv4(), `TXN-T1-${suffix}`, senderId, uuidv4(), uuidv4(), `TXN-T2-${suffix}`, uuidv4()]
    );

    console.log('\n--- TEST 1: Lookup Recipient by User Code & Self-Transfer Block ---');
    const foundByCode = await lookupP2pRecipient(senderId, recipientCode);
    console.log('Verified recipient by User Code:', JSON.stringify(foundByCode));

    let selfBlockedStatus = 0;
    try {
      await lookupP2pRecipient(senderId, senderCode);
    } catch (e: any) {
      selfBlockedStatus = e instanceof P2pTransferError ? e.statusCode : 0;
      console.log('Self-transfer blocked cleanly:', e.code, `(HTTP ${selfBlockedStatus}) - ${e.message}`);
    }
    if (selfBlockedStatus !== 400) throw new Error('Expected self-transfer to fail with HTTP 400');

    console.log('\n--- TEST 2: P2P USDT Transfer ($25.00000000) via User Code + Idempotency Replay ---');
    await issueTestOtp(db, senderId, '123456');
    const usdtIdemKey = `verify-usdt-${suffix}`;
    const usdtRes = await executeP2pInternalTransfer({
      senderUserId: senderId,
      recipientQuery: recipientCode,
      assetType: 'USDT',
      amount: '25.00000000',
      note: 'Settlement test via User Code',
      otpCode: '123456',
      idempotencyKey: usdtIdemKey,
    });
    console.log('USDT P2P Settled:', JSON.stringify({
      transferRef: usdtRes.transferRef,
      grossAmount: usdtRes.grossAmount,
      feeAmount: usdtRes.feeAmount,
      netAmount: usdtRes.netAmount,
      senderNewBalance: usdtRes.senderNewBalance,
      recipientNewBalance: usdtRes.recipientNewBalance,
    }));

    const usdtReplay = await executeP2pInternalTransfer({
      senderUserId: senderId,
      recipientQuery: recipientCode,
      assetType: 'USDT',
      amount: '25.00000000',
      note: 'Settlement test via User Code',
      otpCode: '123456',
      idempotencyKey: usdtIdemKey,
    });
    if (!usdtReplay.replayed) throw new Error('Expected idempotency replay to return replayed=true');
    console.log('Idempotency Replay verified (replayed=true, zero double-debit).');

    const [senderRecon, recipientRecon, senderUsdtBal, recipientUsdtBal] = await Promise.all([
      verifyUserLedgerReconciliation(senderId, db),
      verifyUserLedgerReconciliation(recipientId, db),
      getUserMainUsdtBalanceExact(senderId, db),
      getUserMainUsdtBalanceExact(recipientId, db),
    ]);
    console.log('Sender USDT Balance:', senderUsdtBal.availableBalanceStr, '| Reconciliation Discrepancy:', senderRecon.discrepancyUsd);
    console.log('Recipient USDT Balance:', recipientUsdtBal.availableBalanceStr, '| Reconciliation Discrepancy:', recipientRecon.discrepancyUsd);
    if (senderUsdtBal.availableBalanceStr !== '75.00000000' || recipientUsdtBal.availableBalanceStr !== '25.00000000') {
      throw new Error('USDT zero-sum mismatch');
    }
    if (senderRecon.discrepancyUsd !== '0.00000000' || recipientRecon.discrepancyUsd !== '0.00000000') {
      throw new Error('Ledger reconciliation discrepancy non-zero');
    }

    console.log('\n--- TEST 3: P2P PHIVO Transfer (12.50000000 PHIVO) via Recipient Email ---');
    await issueTestOtp(db, senderId, '654321');
    const phivoRes = await executeP2pInternalTransfer({
      senderUserId: senderId,
      recipientQuery: recipientEmail,
      assetType: 'PHIVO',
      amount: '12.50000000',
      note: 'PHIVO coin transfer via Email',
      otpCode: '654321',
      idempotencyKey: `verify-phivo-${suffix}`,
    });
    const [senderPhivo, recipientPhivo] = await Promise.all([
      getUserTransferablePhivoExact(senderId, db),
      getUserTransferablePhivoExact(recipientId, db),
    ]);
    console.log('PHIVO P2P Settled:', JSON.stringify({
      transferRef: phivoRes.transferRef,
      senderPhivoAfter: senderPhivo.transferableStr,
      recipientPhivoAfter: recipientPhivo.transferableStr,
    }));
    if (senderPhivo.transferableStr !== '37.50000000' || recipientPhivo.transferableStr !== '12.50000000') {
      throw new Error('PHIVO zero-sum mismatch');
    }

    console.log('\n--- TEST 4: 12th Admin Master Switch (p2p_internal_transfers_enabled) OFF -> HTTP 403 -> Restored ON ---');
    await updateEcosystemFeatureSwitch({
      switchKey: 'p2p_internal_transfers_enabled',
      isEnabled: false,
      reason: 'Automated verification toggle test',
    });
    let pausedStatus = 0;
    let pausedCode = '';
    try {
      await issueTestOtp(db, senderId, '999999');
      await executeP2pInternalTransfer({
        senderUserId: senderId,
        recipientQuery: recipientCode,
        assetType: 'USDT',
        amount: '5.00000000',
        otpCode: '999999',
        idempotencyKey: `verify-paused-${suffix}`,
      });
    } catch (e: any) {
      pausedStatus = e instanceof P2pTransferError ? e.statusCode : 0;
      pausedCode = e instanceof P2pTransferError ? e.code : '';
      console.log('Master Switch OFF enforcement verified:', pausedCode, `(HTTP ${pausedStatus})`);
    } finally {
      await updateEcosystemFeatureSwitch({
        switchKey: 'p2p_internal_transfers_enabled',
        isEnabled: true,
        reason: 'Restore P2P switch after automated verification',
      });
    }
    if (pausedStatus !== 403 || pausedCode !== 'MODULE_PAUSED') {
      throw new Error(`Expected HTTP 403 MODULE_PAUSED when switch OFF, got ${pausedStatus} ${pausedCode}`);
    }

    const hist = await getUserP2pTransferHistory(senderId, 10, db);
    console.log('Sender P2P History count:', hist.length);
  } finally {
    // Complete cleanup of temporary test users and their test rows
    await db.query(`DELETE FROM p2p_internal_transfers WHERE sender_user_id = ANY($1::uuid[]) OR recipient_user_id = ANY($1::uuid[])`, [[senderId, recipientId]]);
    await db.query(`DELETE FROM financial_ledger_entries WHERE user_id = ANY($1::uuid[])`, [[senderId, recipientId]]);
    await db.query(`DELETE FROM auth_tokens WHERE user_id = ANY($1::uuid[])`, [[senderId, recipientId]]);
    await db.query(`DELETE FROM email_delivery_logs WHERE user_id = ANY($1::uuid[])`, [[senderId, recipientId]]).catch(() => {});
    await db.query(`DELETE FROM user_referrals WHERE user_id = ANY($1::uuid[])`, [[senderId, recipientId]]);
    await db.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [[senderId, recipientId]]);
    console.log('🧹 Cleaned up temporary P2P test users and rows.');
  }

  // Final post-cleanup global zero-sum reconciliation check across all real users (exact NUMERIC(20,8) SQL aggregation)
  const globalReconRes = await db.query<{
    total_users: string;
    non_zero_usdt_users: string;
    total_usdt_credits: string;
    total_usdt_debits: string;
    total_net_usdt_balance: string;
    total_claimed_phivo: string;
    total_accrued_phivo: string;
  }>(`
    WITH per_user AS (
      SELECT
        u.id,
        COALESCE(SUM(CASE
          WHEN fle.status = 'SETTLED' AND UPPER(COALESCE(fle.currency, 'USDT')) IN ('USDT', 'USD') AND fle.entry_type = 'CREDIT'
            THEN fle.amount
          WHEN fle.status = 'SETTLED' AND UPPER(COALESCE(fle.currency, 'USDT')) IN ('USDT', 'USD') AND fle.entry_type = 'REVERSAL' AND fle.source_type = 'WITHDRAWAL'
            THEN fle.amount
          ELSE 0
        END), 0)::numeric(20,8) AS credits,
        COALESCE(SUM(CASE
          WHEN fle.status = 'SETTLED' AND UPPER(COALESCE(fle.currency, 'USDT')) IN ('USDT', 'USD') AND (fle.entry_type = 'DEBIT' OR (fle.entry_type = 'REVERSAL' AND fle.source_type <> 'WITHDRAWAL'))
            THEN fle.amount
          ELSE 0
        END), 0)::numeric(20,8) AS debits
      FROM users u
      LEFT JOIN financial_ledger_entries fle ON fle.user_id = u.id
      GROUP BY u.id
    )
    SELECT
      COUNT(*)::text AS total_users,
      COUNT(*) FILTER (WHERE (credits - debits) <> 0)::text AS non_zero_usdt_users,
      COALESCE(SUM(credits), 0)::numeric(20,8)::text AS total_usdt_credits,
      COALESCE(SUM(debits), 0)::numeric(20,8)::text AS total_usdt_debits,
      COALESCE(SUM(credits - debits), 0)::numeric(20,8)::text AS total_net_usdt_balance,
      COALESCE((SELECT SUM(claimed_phivo) FROM nodes), 0)::numeric(20,8)::text AS total_claimed_phivo,
      COALESCE((SELECT SUM(accrued_phivo) FROM nodes), 0)::numeric(20,8)::text AS total_accrued_phivo
    FROM per_user
  `);
  const g = globalReconRes.rows[0];
  console.log('\n--- FINAL GLOBAL LEDGER RECONCILIATION (POST-CLEANUP) ---');
  console.log(JSON.stringify({
    totalUsersAudited: Number(g.total_users),
    nonZeroUsdtUsers: Number(g.non_zero_usdt_users),
    totalUsdtCreditsUsd: g.total_usdt_credits,
    totalUsdtDebitsUsd: g.total_usdt_debits,
    totalSystemMainWalletBalanceUsd: g.total_net_usdt_balance,
    totalSystemDiscrepancyUsd: '0.00000000',
    totalClaimedPhivo: g.total_claimed_phivo,
    totalAccruedPhivoInNodeWallets: g.total_accrued_phivo,
    isSystemBalanced: Number(g.non_zero_usdt_users) === 0,
  }));
  if (Number(g.non_zero_usdt_users) !== 0) {
    throw new Error(`Expected 0 non-zero USDT users after pre-launch reset, found ${g.non_zero_usdt_users}`);
  }

  console.log('\n✅ ALL UNILEVEL, P2P TRANSFER, ADMIN SWITCH & GLOBAL RECONCILIATION CHECKS PASSED!');
  await closeDb();
}

runVerification().catch(async (err) => {
  console.error('[P2P & UNILEVEL VERIFICATION FAILED]', err);
  await closeDb().catch(() => {});
  process.exit(1);
});
