/**
 * PHIVONEX — One-Time Atomic Pre-Launch Reset, Canonical Unilevel Tree Reconstruction
 * & Active Genesis Node 10.00000000 PHIVO/day Backfill (Activation Date -> 2026-11-26 UTC).
 *
 * Executes strictly inside ONE PostgreSQL ACID transaction (`BEGIN ... COMMIT`):
 *   Step 1: Saves full JSON backup snapshot of prior balances, commissions, and node states into `security_audit_logs`.
 *   Step 2: Zeroes all old dollars, commissions, royalties, rank bonuses, test trading/vault positions, swaps,
 *           withdrawals, deposits, and ledger entries while preserving `users`, `user_referrals`,
 *           `binary_placements` (STRICTLY READ-ONLY), `nodes`, `node_orders`, `node_owners`, and `security_audit_logs`.
 *   Step 3: Runs `rebuildUnilevelHierarchyFromSponsors(trx)` strictly from referral-link sponsors.
 *   Step 4: Credits every Active Genesis Node `days_active * 10.00000000 PHIVO` (capped at `10,000.00000000 PHIVO`)
 *           from its UTC activation date through `2026-11-26` UTC exclusively into its Node Reward Wallet (`ACCRUED`),
 *           setting `claimed_phivo = 0.00000000` and `last_reward_date = '2026-11-26'`.
 *
 * Usage: npx tsx scripts/prepush-unilevel-and-node-backfill.ts
 */
import 'dotenv/config';
import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseClient, QueryResult, getDb, closeDb, getEffectiveDatabaseUrl } from '../src/server/db/db';
import { rebuildUnilevelHierarchyFromSponsors } from '../src/server/services/unilevelReconstructionService';
import { recordSecurityAuditLog } from '../src/server/services/unilevelConfigService';
import { verifyAllUsersLedgerReconciliation } from '../src/server/services/unifiedLedgerService';

const BACKFILL_CUTOFF_DATE = '2026-11-26';
const DAILY_BACKFILL_RATE = 10; // 10.00000000 PHIVO/day
const LIFETIME_CAP_PHIVO = 10000;

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

interface BackfilledNodeRow {
  nodeId: string;
  publicNodeId: string;
  nodeNumber: number;
  ownerUserId: string;
  userEmail: string;
  userCode: string;
  activationDateUtc: string;
  daysActive: number;
  backfilledPhivo: string;
  remainingPhivo: string;
}

async function runPrePushResetAndBackfill() {
  const db = await initFastScriptDb();

  console.log('================================================================================');
  console.log('PHIVONEX ATOMIC PRE-LAUNCH RESET, UNILEVEL RECONSTRUCTION & NODE BACKFILL');
  console.log(`Backfill Cutoff Date (UTC): ${BACKFILL_CUTOFF_DATE} | Rate: ${DAILY_BACKFILL_RATE}.00000000 PHIVO/day`);
  console.log('================================================================================\n');

  const txOutcome = await db.transaction(async (trx) => {
    // ------------------------------------------------------------------------
    // STEP 1: Capture Pre-Reset Backup Snapshot into security_audit_logs
    // ------------------------------------------------------------------------
    const priorBalancesRes = await trx.query<{
      user_id: string;
      email: string;
      public_id: string | null;
      usdt_net: string;
      phivo_ledger_net: string;
    }>(
      `
      SELECT
        u.id AS user_id,
        u.email,
        u.public_id,
        COALESCE(SUM(CASE
          WHEN fle.status = 'SETTLED' AND UPPER(COALESCE(fle.currency, 'USDT')) IN ('USDT', 'USD') THEN
            CASE
              WHEN fle.entry_type = 'CREDIT' THEN fle.amount
              WHEN fle.entry_type = 'DEBIT' THEN -fle.amount
              WHEN fle.entry_type = 'REVERSAL' AND fle.source_type = 'WITHDRAWAL' THEN fle.amount
              WHEN fle.entry_type = 'REVERSAL' THEN -fle.amount
              ELSE 0
            END
          ELSE 0
        END), 0)::numeric(20,8)::text AS usdt_net,
        COALESCE(SUM(CASE
          WHEN fle.status = 'SETTLED' AND UPPER(COALESCE(fle.currency, '')) = 'PHIVO' THEN
            CASE
              WHEN fle.entry_type = 'CREDIT' THEN fle.amount
              WHEN fle.entry_type IN ('DEBIT', 'REVERSAL') THEN -fle.amount
              ELSE 0
            END
          ELSE 0
        END), 0)::numeric(20,8)::text AS phivo_ledger_net
      FROM users u
      LEFT JOIN financial_ledger_entries fle ON fle.user_id = u.id
      GROUP BY u.id, u.email, u.public_id
      ORDER BY u.created_at ASC
      `
    );

    const priorNodesRes = await trx.query<{
      id: string;
      public_node_id: string;
      owner_user_id: string | null;
      status: string;
      activated_at: Date | null;
      created_at: Date;
      distributed_phivo: string | null;
      remaining_phivo: string | null;
    }>(
      `
      SELECT id, public_node_id, owner_user_id, status, activated_at, created_at,
             distributed_phivo::text, remaining_phivo::text
      FROM nodes
      WHERE owner_user_id IS NOT NULL
      ORDER BY node_number ASC
      `
    );

    const priorCountsRes = await trx.query<{
      ledger_rows: string;
      royalty_rows: string;
      node_reward_rows: string;
      binary_placements_rows: string;
    }>(
      `
      SELECT
        (SELECT COUNT(*)::text FROM financial_ledger_entries) AS ledger_rows,
        (SELECT COUNT(*)::text FROM unilevel_royalty_payouts) AS royalty_rows,
        (SELECT COUNT(*)::text FROM node_rewards) AS node_reward_rows,
        (SELECT COUNT(*)::text FROM binary_placements) AS binary_placements_rows
      `
    );

    const snapshotAuditId = await recordSecurityAuditLog(trx, {
      actionType: 'PRE_LAUNCH_RESET_BACKUP_SNAPSHOT',
      severity: 'WARN',
      payload: {
        capturedAtUtc: new Date().toISOString(),
        cutoffDateUtc: BACKFILL_CUTOFF_DATE,
        dailyBackfillRatePhivo: DAILY_BACKFILL_RATE,
        priorRowCounts: priorCountsRes.rows[0],
        priorUserBalancesCount: priorBalancesRes.rows.length,
        priorNonZeroUserBalances: priorBalancesRes.rows.filter(
          (b) => Number(b.usdt_net) !== 0 || Number(b.phivo_ledger_net) !== 0
        ),
        priorOwnedNodes: priorNodesRes.rows.map((n) => ({
          id: n.id,
          publicNodeId: n.public_node_id,
          ownerUserId: n.owner_user_id,
          status: n.status,
          activatedAt: n.activated_at ? new Date(n.activated_at).toISOString() : null,
          createdAt: new Date(n.created_at).toISOString(),
          distributedPhivo: n.distributed_phivo,
          remainingPhivo: n.remaining_phivo,
        })),
      },
    });

    // ------------------------------------------------------------------------
    // STEP 2: Atomic Zero-Out of Old Balances, Commissions, Payouts & Test Positions
    //         PRESERVES: users, user_referrals, binary_placements (read-only),
    //                    nodes (ownership & activation dates), node_orders,
    //                    node_owners, security_audit_logs, master configs.
    // ------------------------------------------------------------------------
    const tablesToClear = [
      'p2p_internal_transfers',
      'unilevel_royalty_payouts',
      'unilevel_yield_events',
      'unilevel_rank_milestone_payouts',
      'user_unilevel_ranks',
      'global_turnover_pool_payouts',
      'global_turnover_pool_distributions',
      'founders_council_dividend_payouts',
      'ecosystem_yield_settlement_cycles',
      'trading_yield_payouts',
      'user_trading_positions',
      'vault_yield_payouts',
      'user_vault_positions',
      'coin_swap_transactions',
      'blockchain_withdrawals',
      'withdrawal_status_logs',
      'withdrawals',
      'blockchain_deposits',
      'referral_commissions',
      'matching_bonuses',
      'promotion_bonuses',
      'node_rewards',
      'reward_epochs',
      'financial_ledger_entries',
    ];

    const clearedCounts: Record<string, number> = {};
    for (const tbl of tablesToClear) {
      const existsRes = await trx.query<{ reg: string | null }>(
        `SELECT to_regclass($1)::text AS reg`,
        [`public.${tbl}`]
      );
      if (existsRes.rows[0]?.reg) {
        const delRes = await trx.query(`DELETE FROM ${tbl}`);
        clearedCounts[tbl] = delRes.rowCount;
      }
    }

    // Reset node emission counters cleanly before applying deterministic backfill
    await trx.query(`
      UPDATE nodes
      SET
        distributed_phivo = 0.00000000,
        remaining_phivo = COALESCE(lifetime_phivo_allocation, 10000.00000000),
        accrued_phivo = 0.00000000,
        claimed_phivo = 0.00000000,
        last_reward_date = NULL,
        updated_at = NOW()
    `);

    // ------------------------------------------------------------------------
    // STEP 3: Canonical 16-Generation Unilevel Hierarchy Reconstruction
    // ------------------------------------------------------------------------
    const unilevelReport = await rebuildUnilevelHierarchyFromSponsors(trx);

    // ------------------------------------------------------------------------
    // STEP 4: Active Genesis Node 10.00000000 PHIVO/day Backfill (-> 2026-11-26 UTC)
    // ------------------------------------------------------------------------
    const activeNodesRes = await trx.query<{
      node_id: string;
      public_node_id: string;
      node_number: number;
      owner_user_id: string;
      user_email: string;
      user_code: string | null;
      referral_code: string | null;
      activation_date_utc: string;
      lifetime_cap: string;
      days_active: number;
    }>(
      `
      SELECT
        n.id AS node_id,
        n.public_node_id,
        n.node_number,
        n.owner_user_id,
        u.email AS user_email,
        u.public_id AS user_code,
        ur.referral_code,
        ((COALESCE(n.activated_at, n.created_at) AT TIME ZONE 'UTC')::date)::text AS activation_date_utc,
        COALESCE(n.lifetime_phivo_allocation, 10000.00000000)::text AS lifetime_cap,
        GREATEST(1, (DATE '${BACKFILL_CUTOFF_DATE}' - (COALESCE(n.activated_at, n.created_at) AT TIME ZONE 'UTC')::date) + 1)::int AS days_active
      FROM nodes n
      JOIN users u ON u.id = n.owner_user_id
      LEFT JOIN user_referrals ur ON ur.user_id = u.id
      WHERE n.status IN ('ACTIVE', 'EMITTING')
        AND n.owner_user_id IS NOT NULL
      ORDER BY n.node_number ASC, n.created_at ASC
      `
    );

    const backfilledNodes: BackfilledNodeRow[] = [];
    let totalBackfilledPhivo = 0;

    if (activeNodesRes.rows.length > 0) {
      const epochId = uuidv4();
      const publicEpochId = 'PHX-EPOCH-0001';
      const epochStart = new Date(`${BACKFILL_CUTOFF_DATE}T00:00:00.000Z`);
      const epochEnd = new Date(`${BACKFILL_CUTOFF_DATE}T23:59:59.000Z`);
      const settleAt = new Date(`${BACKFILL_CUTOFF_DATE}T00:05:00.000Z`);

      await trx.query(
        `
        INSERT INTO reward_epochs (
          id, public_epoch_id, epoch_number, start_at, end_at,
          reward_per_node, currency, status, settled_at, created_at
        )
        VALUES ($1, $2, 1, $3, $4, $5::numeric(20,8), 'PHIVO', 'COMPLETED', $6, NOW())
        `,
        [epochId, publicEpochId, epochStart, epochEnd, DAILY_BACKFILL_RATE.toFixed(8), settleAt]
      );

      for (let i = 0; i < activeNodesRes.rows.length; i++) {
        const row = activeNodesRes.rows[i];
        const lifetimeCap = Number(row.lifetime_cap || LIFETIME_CAP_PHIVO);
        const rawPhivo = row.days_active * DAILY_BACKFILL_RATE;
        const backfilled = Math.min(lifetimeCap, rawPhivo);
        const remaining = Math.max(0, lifetimeCap - backfilled);
        const backfilledStr = backfilled.toFixed(8);
        const remainingStr = remaining.toFixed(8);

        totalBackfilledPhivo += backfilled;

        const rewardId = uuidv4();
        const publicRewardId = `NRW-BF-${String(row.node_number || i + 1).padStart(5, '0')}`;

        // Credit exclusively into Node Reward Wallet (status = 'ACCRUED', claimed_phivo = 0)
        await trx.query(
          `
          INSERT INTO node_rewards (
            id, public_reward_id, epoch_id, node_id, owner_user_id,
            amount, currency, status, accrued_at,
            reward_rate_used, economic_config_version, business_date, created_at
          )
          VALUES (
            $1, $2, $3, $4, $5,
            $6::numeric(20,8), 'PHIVO', 'ACCRUED', $7,
            $8, 1, $9, NOW()
          )
          `,
          [
            rewardId,
            publicRewardId,
            epochId,
            row.node_id,
            row.owner_user_id,
            backfilledStr,
            settleAt,
            DAILY_BACKFILL_RATE,
            BACKFILL_CUTOFF_DATE,
          ]
        );

        await trx.query(
          `
          UPDATE nodes
          SET
            status = CASE WHEN $2::numeric(20,8) <= 0 THEN 'MATURED' ELSE 'ACTIVE' END,
            distributed_phivo = $1::numeric(20,8),
            remaining_phivo = $2::numeric(20,8),
            accrued_phivo = $1::numeric(20,8),
            claimed_phivo = 0.00000000,
            last_reward_date = $3::date,
            updated_at = NOW()
          WHERE id = $4
          `,
          [backfilledStr, remainingStr, BACKFILL_CUTOFF_DATE, row.node_id]
        );

        backfilledNodes.push({
          nodeId: row.node_id,
          publicNodeId: row.public_node_id,
          nodeNumber: row.node_number,
          ownerUserId: row.owner_user_id,
          userEmail: row.user_email,
          userCode: String(row.user_code || row.referral_code || 'N/A').toUpperCase(),
          activationDateUtc: row.activation_date_utc.slice(0, 10),
          daysActive: row.days_active,
          backfilledPhivo: backfilledStr,
          remainingPhivo: remainingStr,
        });
      }
    }

    // Mark pre-launch reset complete in unilevel_master_configs so server restarts never re-run legacy seeders
    // or double-pay 2026-11-26 daily node emissions.
    await trx.query(
      `
      INSERT INTO unilevel_master_configs (config_key, config_value, description, updated_at)
      VALUES (
        'pre_launch_unilevel_reset_completed',
        1.00000000,
        'Atomic pre-launch reset, Unilevel hierarchy reconstruction, and 10 PHIVO/day backfill through 2026-11-26 UTC completed',
        NOW()
      )
      ON CONFLICT (config_key) DO UPDATE SET
        config_value = 1.00000000,
        description = EXCLUDED.description,
        updated_at = NOW()
      `
    );

    await recordSecurityAuditLog(trx, {
      actionType: 'PRE_LAUNCH_NODE_BACKFILL_COMPLETED',
      severity: 'INFO',
      payload: {
        snapshotAuditId,
        cutoffDateUtc: BACKFILL_CUTOFF_DATE,
        dailyRatePhivo: DAILY_BACKFILL_RATE,
        activeNodesBackfilled: backfilledNodes.length,
        totalBackfilledPhivo: totalBackfilledPhivo.toFixed(8),
        clearedRowCounts: clearedCounts,
      },
    });

    return {
      snapshotAuditId,
      clearedCounts,
      unilevelReport,
      backfilledNodes,
      totalBackfilledPhivo: totalBackfilledPhivo.toFixed(8),
    };
  });

  // Post-commit zero-sum reconciliation audit across every user
  const recon = await verifyAllUsersLedgerReconciliation(500);

  // Verify binary_placements intact & all users have $0.00 USDT and 0.00000000 claimed PHIVO
  const claimedCheckRes = await db.query<{
    total_claimed_phivo: string;
    total_accrued_phivo: string;
    binary_count: string;
  }>(
    `
    SELECT
      COALESCE((SELECT SUM(claimed_phivo) FROM nodes), 0)::numeric(20,8)::text AS total_claimed_phivo,
      COALESCE((SELECT SUM(accrued_phivo) FROM nodes), 0)::numeric(20,8)::text AS total_accrued_phivo,
      (SELECT COUNT(*)::text FROM binary_placements) AS binary_count
    `
  );

  console.log('1. BACKUP SNAPSHOT SAVED');
  console.log(`   - security_audit_logs ID: ${txOutcome.snapshotAuditId}`);
  console.log(`   - binary_placements preserved read-only: ${claimedCheckRes.rows[0].binary_count} rows`);
  console.log('   - Cleared pre-launch tables:', JSON.stringify(txOutcome.clearedCounts));

  console.log('\n2. CANONICAL 16-GENERATION UNILEVEL RECONSTRUCTION');
  console.log(JSON.stringify(txOutcome.unilevelReport, null, 2));

  console.log('\n3. POST-RESET ZERO-SUM LEDGER RECONCILIATION');
  console.log(`   - Users Audited: ${recon.totalUsersAudited}`);
  console.log(`   - Balanced Users: ${recon.balancedUsersCount}/${recon.totalUsersAudited}`);
  console.log(`   - Total System Main USDT Balance: $${recon.totalSystemMainWalletBalanceUsd}`);
  console.log(`   - Total System Discrepancy USD: $${recon.totalSystemDiscrepancyUsd}`);
  console.log(`   - Total Claimed PHIVO Wallet: ${claimedCheckRes.rows[0].total_claimed_phivo} PHIVO`);
  console.log(`   - Total Accrued PHIVO in Node Reward Wallets: ${claimedCheckRes.rows[0].total_accrued_phivo} PHIVO`);

  console.log('\n4. ACTIVE GENESIS NODE BACKFILL TABLE (10.00000000 PHIVO/DAY -> 2026-11-26 UTC)');
  console.log(`   Total Active Genesis Nodes Backfilled: ${txOutcome.backfilledNodes.length}`);
  console.log(`   Total Accrued PHIVO Credited: ${txOutcome.totalBackfilledPhivo} PHIVO\n`);
  console.log(
    '| User Email | User Code | Node Serial | Activation Date (UTC) | Days Active (Through 2026-11-26) | Accrued PHIVO in Node Reward Wallet |'
  );
  console.log(
    '|---|---|---|---|---|---|'
  );
  for (const n of txOutcome.backfilledNodes) {
    console.log(
      `| ${n.userEmail} | ${n.userCode} | ${n.publicNodeId} | ${n.activationDateUtc} | ${n.daysActive} | ${n.backfilledPhivo} PHIVO |`
    );
  }

  await closeDb();
}

runPrePushResetAndBackfill().catch(async (err) => {
  console.error('[PRE-LAUNCH BACKFILL ERROR]', err);
  await closeDb().catch(() => {});
  process.exit(1);
});
