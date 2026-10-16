import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/db';
import { generateReconciliationPublicId } from '../utils/idGenerator';

export type ReconciliationRunStatus = 'RUNNING' | 'COMPLETED' | 'FAILED';
export type IntegrityStatus = 'CLEAN' | 'WARNING' | 'CRITICAL' | 'PENDING';

export type ReconciliationIssueType =
  | 'MISSING_LEDGER_CREDIT'
  | 'DUPLICATE_LEDGER_CREDIT'
  | 'ORPHAN_LEDGER_ENTRY'
  | 'MISMATCHED_SOURCE_AMOUNT'
  | 'INCORRECT_REVERSAL'
  | 'SWAP_MISMATCH'
  | 'WITHDRAWAL_RESERVATION_MISMATCH'
  | 'ASSET_BALANCE_NEGATIVE'
  | 'INVALID_CURRENCY_ISOLATION';

export interface ReconciliationIssueDraft {
  issueType: ReconciliationIssueType;
  sourceType: string;
  sourceReference: string;
  asset: 'USDT' | 'PHIVO' | 'USD';
  expectedAmount: number;
  actualAmount: number;
  userId?: string | null;
  description: string;
}

export interface ReconciliationRunSummary {
  id: string;
  publicRunId: string;
  startedAt: string;
  completedAt: string | null;
  status: ReconciliationRunStatus;
  issuesFound: number;
  createdBy: string | null;
  createdByPublicId: string | null;
  phivoIntegrity: IntegrityStatus;
  usdtIntegrity: IntegrityStatus;
  ledgerIntegrity: IntegrityStatus;
  withdrawalIntegrity: IntegrityStatus;
  swapIntegrity: IntegrityStatus;
  summary: {
    referralsChecked: number;
    matchingChecked: number;
    promotionsChecked: number;
    miningRewardsChecked: number;
    depositsChecked: number;
    withdrawalsChecked: number;
    swapsChecked: number;
    ledgerEntriesChecked: number;
    phivoDiscrepancies: number;
    usdtDiscrepancies: number;
    ledgerDiscrepancies: number;
    withdrawalDiscrepancies: number;
    swapDiscrepancies: number;
  };
  errorMessage?: string | null;
}

export interface ReconciliationIssueRecord {
  id: string;
  runId: string;
  issueType: string;
  sourceType: string;
  sourceReference: string;
  asset: string;
  expectedAmount: number;
  actualAmount: number;
  status: string;
  userId: string | null;
  description: string;
  createdAt: string;
}

/**
 * Execute server-side financial reconciliation run.
 * Completely read-only with respect to financial transactions (never alters balances or ledger rows).
 */
export async function runFinancialReconciliation(options?: {
  adminUserId?: string | null;
  adminPublicId?: string | null;
}): Promise<ReconciliationRunSummary> {
  const db = await getDb();
  const runId = uuidv4();
  const publicRunId = generateReconciliationPublicId();
  const startedAt = new Date();

  // 1. Create run record in RUNNING status
  await db.query(
    `
    INSERT INTO financial_reconciliation_runs (
      id, public_run_id, started_at, status, issues_found,
      created_by, created_by_public_id, phivo_integrity, usdt_integrity,
      ledger_integrity, withdrawal_integrity, swap_integrity
    )
    VALUES ($1, $2, $3, 'RUNNING', 0, $4, $5, 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING')
    `,
    [runId, publicRunId, startedAt, options?.adminUserId || null, options?.adminPublicId || 'SYSTEM_AUDITOR']
  );

  const issues: ReconciliationIssueDraft[] = [];

  let referralsChecked = 0;
  let matchingChecked = 0;
  let promotionsChecked = 0;
  let miningRewardsChecked = 0;
  let depositsChecked = 0;
  let withdrawalsChecked = 0;
  let swapsChecked = 0;
  let ledgerEntriesChecked = 0;

  try {
    // =========================================================================
    // CHECK 1: DIRECT REFERRAL COMMISSIONS vs FINANCIAL LEDGER
    // =========================================================================
    const refCommsRes = await db.query(
      `SELECT id, public_commission_id, sponsor_user_id, amount_usd, status FROM referral_commissions`
    );
    referralsChecked = refCommsRes.rows.length;

    for (const ref of refCommsRes.rows) {
      const expAmount = Number(ref.amount_usd);

      // Check CREDIT entries
      const credits = await db.query(
        `SELECT id, amount, entry_type, currency FROM financial_ledger_entries
         WHERE source_type = 'REFERRAL_COMMISSION' AND (source_id = $1 OR source_ref = $2) AND entry_type = 'CREDIT'`,
        [ref.id, ref.public_commission_id]
      );

      if (credits.rows.length === 0) {
        issues.push({
          issueType: 'MISSING_LEDGER_CREDIT',
          sourceType: 'REFERRAL_COMMISSION',
          sourceReference: ref.public_commission_id,
          asset: 'USDT',
          expectedAmount: expAmount,
          actualAmount: 0,
          userId: ref.sponsor_user_id,
          description: `Direct referral commission ${ref.public_commission_id} has no corresponding CREDIT entry in financial_ledger_entries.`,
        });
      } else if (credits.rows.length > 1) {
        issues.push({
          issueType: 'DUPLICATE_LEDGER_CREDIT',
          sourceType: 'REFERRAL_COMMISSION',
          sourceReference: ref.public_commission_id,
          asset: 'USDT',
          expectedAmount: expAmount,
          actualAmount: credits.rows.reduce((sum, r) => sum + Number(r.amount), 0),
          userId: ref.sponsor_user_id,
          description: `Direct referral commission ${ref.public_commission_id} has ${credits.rows.length} duplicate CREDIT entries in financial_ledger_entries.`,
        });
      } else {
        const actAmount = Number(credits.rows[0].amount);
        if (Math.abs(actAmount - expAmount) > 0.0001) {
          issues.push({
            issueType: 'MISMATCHED_SOURCE_AMOUNT',
            sourceType: 'REFERRAL_COMMISSION',
            sourceReference: ref.public_commission_id,
            asset: 'USDT',
            expectedAmount: expAmount,
            actualAmount: actAmount,
            userId: ref.sponsor_user_id,
            description: `Referral commission ${ref.public_commission_id} amount ($${expAmount.toFixed(2)}) mismatches ledger credit ($${actAmount.toFixed(2)}).`,
          });
        }
      }

      // Check REVERSAL entries if commission was reversed
      if (ref.status === 'REVERSED') {
        const reversals = await db.query(
          `SELECT id, amount FROM financial_ledger_entries
           WHERE source_type = 'REFERRAL_COMMISSION' AND source_id = $1 AND entry_type = 'REVERSAL'`,
          [ref.id]
        );
        if (reversals.rows.length === 0) {
          issues.push({
            issueType: 'INCORRECT_REVERSAL',
            sourceType: 'REFERRAL_COMMISSION',
            sourceReference: ref.public_commission_id,
            asset: 'USDT',
            expectedAmount: expAmount,
            actualAmount: 0,
            userId: ref.sponsor_user_id,
            description: `Commission ${ref.public_commission_id} marked REVERSED in domain table, but missing REVERSAL in financial ledger.`,
          });
        }
      }
    }

    // =========================================================================
    // CHECK 2: BINARY MATCHING BONUSES vs FINANCIAL LEDGER
    // =========================================================================
    const matchRes = await db.query(
      `SELECT id, public_settlement_id, user_id, total_bonus_usd, status FROM binary_matching_settlements WHERE total_bonus_usd > 0`
    );
    matchingChecked = matchRes.rows.length;

    for (const m of matchRes.rows) {
      const expAmount = Number(m.total_bonus_usd);

      const credits = await db.query(
        `SELECT id, amount FROM financial_ledger_entries
         WHERE source_type = 'MATCHING_BONUS' AND (source_id = $1 OR source_ref = $2) AND entry_type = 'CREDIT'`,
        [m.id, m.public_settlement_id]
      );

      if (credits.rows.length === 0) {
        issues.push({
          issueType: 'MISSING_LEDGER_CREDIT',
          sourceType: 'MATCHING_BONUS',
          sourceReference: m.public_settlement_id,
          asset: 'USDT',
          expectedAmount: expAmount,
          actualAmount: 0,
          userId: m.user_id,
          description: `Matching settlement ${m.public_settlement_id} ($${expAmount.toFixed(2)}) is missing ledger CREDIT entry.`,
        });
      } else if (credits.rows.length > 1) {
        issues.push({
          issueType: 'DUPLICATE_LEDGER_CREDIT',
          sourceType: 'MATCHING_BONUS',
          sourceReference: m.public_settlement_id,
          asset: 'USDT',
          expectedAmount: expAmount,
          actualAmount: credits.rows.reduce((sum, r) => sum + Number(r.amount), 0),
          userId: m.user_id,
          description: `Matching settlement ${m.public_settlement_id} has duplicate ledger credits.`,
        });
      } else {
        const actAmount = Number(credits.rows[0].amount);
        if (Math.abs(actAmount - expAmount) > 0.0001) {
          issues.push({
            issueType: 'MISMATCHED_SOURCE_AMOUNT',
            sourceType: 'MATCHING_BONUS',
            sourceReference: m.public_settlement_id,
            asset: 'USDT',
            expectedAmount: expAmount,
            actualAmount: actAmount,
            userId: m.user_id,
            description: `Matching settlement ${m.public_settlement_id} amount mismatches ledger credit.`,
          });
        }
      }
    }

    // =========================================================================
    // CHECK 3: PROMOTION BONUSES vs FINANCIAL LEDGER
    // =========================================================================
    const promoRes = await db.query(
      `SELECT id, public_bonus_id, user_id, amount_usd, milestone, status FROM promotion_bonuses WHERE status = 'EARNED'`
    );
    promotionsChecked = promoRes.rows.length;

    for (const p of promoRes.rows) {
      const expAmount = Number(p.amount_usd);

      const credits = await db.query(
        `SELECT id, amount FROM financial_ledger_entries
         WHERE source_type = 'PROMOTION_BONUS' AND (source_id = $1 OR source_ref = $2) AND entry_type = 'CREDIT'`,
        [p.id, p.public_bonus_id]
      );

      if (credits.rows.length === 0) {
        issues.push({
          issueType: 'MISSING_LEDGER_CREDIT',
          sourceType: 'PROMOTION_BONUS',
          sourceReference: p.public_bonus_id,
          asset: 'USDT',
          expectedAmount: expAmount,
          actualAmount: 0,
          userId: p.user_id,
          description: `Promotion bonus ${p.public_bonus_id} (${p.milestone}) is missing ledger CREDIT entry.`,
        });
      } else if (credits.rows.length > 1) {
        issues.push({
          issueType: 'DUPLICATE_LEDGER_CREDIT',
          sourceType: 'PROMOTION_BONUS',
          sourceReference: p.public_bonus_id,
          asset: 'USDT',
          expectedAmount: expAmount,
          actualAmount: credits.rows.reduce((sum, r) => sum + Number(r.amount), 0),
          userId: p.user_id,
          description: `Promotion bonus ${p.public_bonus_id} has duplicate ledger credits.`,
        });
      } else {
        const actAmount = Number(credits.rows[0].amount);
        if (Math.abs(actAmount - expAmount) > 0.0001) {
          issues.push({
            issueType: 'MISMATCHED_SOURCE_AMOUNT',
            sourceType: 'PROMOTION_BONUS',
            sourceReference: p.public_bonus_id,
            asset: 'USDT',
            expectedAmount: expAmount,
            actualAmount: actAmount,
            userId: p.user_id,
            description: `Promotion bonus ${p.public_bonus_id} amount mismatches ledger credit.`,
          });
        }
      }
    }

    // =========================================================================
    // CHECK 4: BLOCKCHAIN DEPOSITS vs FINANCIAL LEDGER
    // =========================================================================
    const depRes = await db.query(
      `SELECT id, public_deposit_id, user_id, asset, amount, status FROM blockchain_deposits WHERE status = 'CREDITED'`
    );
    depositsChecked = depRes.rows.length;

    for (const d of depRes.rows) {
      const expAmount = Number(d.amount);

      const credits = await db.query(
        `SELECT id, amount, currency FROM financial_ledger_entries
         WHERE source_type = 'BLOCKCHAIN_DEPOSIT' AND (source_id = $1 OR source_ref = $2) AND entry_type = 'CREDIT'`,
        [d.id, d.public_deposit_id]
      );

      if (credits.rows.length === 0) {
        issues.push({
          issueType: 'MISSING_LEDGER_CREDIT',
          sourceType: 'BLOCKCHAIN_DEPOSIT',
          sourceReference: d.public_deposit_id,
          asset: 'USDT',
          expectedAmount: expAmount,
          actualAmount: 0,
          userId: d.user_id,
          description: `Blockchain deposit ${d.public_deposit_id} is marked CREDITED but has no entry in financial_ledger_entries.`,
        });
      } else if (credits.rows.length > 1) {
        issues.push({
          issueType: 'DUPLICATE_LEDGER_CREDIT',
          sourceType: 'BLOCKCHAIN_DEPOSIT',
          sourceReference: d.public_deposit_id,
          asset: 'USDT',
          expectedAmount: expAmount,
          actualAmount: credits.rows.reduce((sum, r) => sum + Number(r.amount), 0),
          userId: d.user_id,
          description: `Blockchain deposit ${d.public_deposit_id} has duplicate ledger credits.`,
        });
      } else {
        const actAmount = Number(credits.rows[0].amount);
        if (Math.abs(actAmount - expAmount) > 0.0001) {
          issues.push({
            issueType: 'MISMATCHED_SOURCE_AMOUNT',
            sourceType: 'BLOCKCHAIN_DEPOSIT',
            sourceReference: d.public_deposit_id,
            asset: 'USDT',
            expectedAmount: expAmount,
            actualAmount: actAmount,
            userId: d.user_id,
            description: `Deposit ${d.public_deposit_id} amount mismatches ledger credit.`,
          });
        }
      }
    }

    // =========================================================================
    // CHECK 5: COIN SWAPS (PHIVO -> USDT) vs FINANCIAL LEDGER & ASSET BALANCES
    // =========================================================================
    const swapRes = await db.query(
      `SELECT id, public_swap_id, user_id, coin_amount, rate_usdt, usdt_amount, status FROM coin_swap_transactions WHERE status = 'COMPLETED'`
    );
    swapsChecked = swapRes.rows.length;

    for (const s of swapRes.rows) {
      const expUsdtAmount = Number(s.usdt_amount);
      const coinAmount = Number(s.coin_amount);
      const rateUsdt = Number(s.rate_usdt);

      // Verify math invariant: usdt_amount == coin_amount * rate_usdt
      const calculatedUsdt = Math.round(coinAmount * rateUsdt * 10000) / 10000;
      if (Math.abs(calculatedUsdt - expUsdtAmount) > 0.01) {
        issues.push({
          issueType: 'SWAP_MISMATCH',
          sourceType: 'COIN_SWAP',
          sourceReference: s.public_swap_id,
          asset: 'USDT',
          expectedAmount: calculatedUsdt,
          actualAmount: expUsdtAmount,
          userId: s.user_id,
          description: `Coin swap ${s.public_swap_id} exchange calculation mismatch: ${coinAmount} @ ${rateUsdt} should equal ${calculatedUsdt} USDT, found ${expUsdtAmount} USDT.`,
        });
      }

      // Verify ledger credit for USDT payout
      const credits = await db.query(
        `SELECT id, amount, currency FROM financial_ledger_entries
         WHERE source_type = 'COIN_SWAP' AND source_id = $1 AND entry_type = 'CREDIT'`,
        [s.id]
      );

      if (credits.rows.length === 0) {
        issues.push({
          issueType: 'MISSING_LEDGER_CREDIT',
          sourceType: 'COIN_SWAP',
          sourceReference: s.public_swap_id,
          asset: 'USDT',
          expectedAmount: expUsdtAmount,
          actualAmount: 0,
          userId: s.user_id,
          description: `Completed swap ${s.public_swap_id} has no corresponding USDT credit in financial ledger.`,
        });
      } else if (credits.rows.length > 1) {
        issues.push({
          issueType: 'DUPLICATE_LEDGER_CREDIT',
          sourceType: 'COIN_SWAP',
          sourceReference: s.public_swap_id,
          asset: 'USDT',
          expectedAmount: expUsdtAmount,
          actualAmount: credits.rows.reduce((sum, r) => sum + Number(r.amount), 0),
          userId: s.user_id,
          description: `Completed swap ${s.public_swap_id} has duplicate USDT credits in financial ledger.`,
        });
      } else {
        const actAmount = Number(credits.rows[0].amount);
        if (Math.abs(actAmount - expUsdtAmount) > 0.0001) {
          issues.push({
            issueType: 'MISMATCHED_SOURCE_AMOUNT',
            sourceType: 'COIN_SWAP',
            sourceReference: s.public_swap_id,
            asset: 'USDT',
            expectedAmount: expUsdtAmount,
            actualAmount: actAmount,
            userId: s.user_id,
            description: `Swap ${s.public_swap_id} amount mismatches financial ledger entry.`,
          });
        }
      }
    }

    // =========================================================================
    // CHECK 6: WITHDRAWALS vs FINANCIAL LEDGER RESERVATIONS & REVERSALS
    // =========================================================================
    const wdrRes = await db.query(
      `SELECT id, public_withdrawal_id, user_id, amount, status FROM withdrawals`
    );
    withdrawalsChecked = wdrRes.rows.length;

    for (const w of wdrRes.rows) {
      const expAmount = Number(w.amount);

      // Non-rejected/cancelled withdrawals MUST have a DEBIT entry reserving the funds
      const debits = await db.query(
        `SELECT id, amount FROM financial_ledger_entries
         WHERE source_type = 'WITHDRAWAL' AND source_id = $1 AND entry_type = 'DEBIT'`,
        [w.id]
      );

      if (debits.rows.length === 0) {
        issues.push({
          issueType: 'WITHDRAWAL_RESERVATION_MISMATCH',
          sourceType: 'WITHDRAWAL',
          sourceReference: w.public_withdrawal_id,
          asset: 'USDT',
          expectedAmount: expAmount,
          actualAmount: 0,
          userId: w.user_id,
          description: `Withdrawal ${w.public_withdrawal_id} has no DEBIT entry reserving funds in financial ledger.`,
        });
      } else {
        const actDebit = Number(debits.rows[0].amount);
        if (Math.abs(actDebit - expAmount) > 0.0001) {
          issues.push({
            issueType: 'MISMATCHED_SOURCE_AMOUNT',
            sourceType: 'WITHDRAWAL',
            sourceReference: w.public_withdrawal_id,
            asset: 'USDT',
            expectedAmount: expAmount,
            actualAmount: actDebit,
            userId: w.user_id,
            description: `Withdrawal ${w.public_withdrawal_id} amount ($${expAmount.toFixed(2)}) mismatches reserved debit amount ($${actDebit.toFixed(2)}).`,
          });
        }
      }

      // If status is REJECTED, CANCELLED, or FAILED, funds MUST be released via REVERSAL
      if (w.status === 'REJECTED' || w.status === 'CANCELLED' || w.status === 'FAILED') {
        const reversals = await db.query(
          `SELECT id, amount FROM financial_ledger_entries
           WHERE source_type = 'WITHDRAWAL' AND source_id = $1 AND entry_type = 'REVERSAL'`,
          [w.id]
        );

        if (reversals.rows.length === 0) {
          issues.push({
            issueType: 'INCORRECT_REVERSAL',
            sourceType: 'WITHDRAWAL',
            sourceReference: w.public_withdrawal_id,
            asset: 'USDT',
            expectedAmount: expAmount,
            actualAmount: 0,
            userId: w.user_id,
            description: `Withdrawal ${w.public_withdrawal_id} is in status ${w.status} but lacks a REVERSAL entry to release reserved balance.`,
          });
        }
      }
    }

    // =========================================================================
    // CHECK 7: PHIVO MINING REWARDS vs FINANCIAL LEDGER
    // =========================================================================
    const rewardRes = await db.query(
      `SELECT id, public_reward_id, owner_user_id, amount, status FROM node_rewards WHERE status IN ('ACCRUED', 'CLAIMED')`
    );
    miningRewardsChecked = rewardRes.rows.length;

    for (const r of rewardRes.rows) {
      const expAmount = Number(r.amount);

      const credits = await db.query(
        `SELECT id, amount, currency FROM financial_ledger_entries
         WHERE source_type = 'NODE_REWARD' AND source_id = $1 AND entry_type = 'CREDIT'`,
        [r.id]
      );

      if (credits.rows.length === 0) {
        issues.push({
          issueType: 'MISSING_LEDGER_CREDIT',
          sourceType: 'NODE_REWARD',
          sourceReference: r.public_reward_id,
          asset: 'PHIVO',
          expectedAmount: expAmount,
          actualAmount: 0,
          userId: r.owner_user_id,
          description: `Node mining reward ${r.public_reward_id} (${expAmount} PHIVO) is missing corresponding CREDIT entry in financial ledger.`,
        });
      } else if (credits.rows.length > 1) {
        issues.push({
          issueType: 'DUPLICATE_LEDGER_CREDIT',
          sourceType: 'NODE_REWARD',
          sourceReference: r.public_reward_id,
          asset: 'PHIVO',
          expectedAmount: expAmount,
          actualAmount: credits.rows.reduce((sum, row) => sum + Number(row.amount), 0),
          userId: r.owner_user_id,
          description: `Node mining reward ${r.public_reward_id} has duplicate credit entries in ledger.`,
        });
      } else {
        const actAmount = Number(credits.rows[0].amount);
        if (Math.abs(actAmount - expAmount) > 0.0001) {
          issues.push({
            issueType: 'MISMATCHED_SOURCE_AMOUNT',
            sourceType: 'NODE_REWARD',
            sourceReference: r.public_reward_id,
            asset: 'PHIVO',
            expectedAmount: expAmount,
            actualAmount: actAmount,
            userId: r.owner_user_id,
            description: `Node reward ${r.public_reward_id} amount mismatches financial ledger entry.`,
          });
        }
      }
    }

    // =========================================================================
    // CHECK 8: ORPHAN FINANCIAL LEDGER ENTRIES
    // (Ledger entries pointing to non-existent domain records)
    // =========================================================================
    const allLedgerRes = await db.query(
      `SELECT id, public_txn_id, user_id, source_type, source_id, amount, entry_type, currency FROM financial_ledger_entries`
    );
    ledgerEntriesChecked = allLedgerRes.rows.length;

    for (const entry of allLedgerRes.rows) {
      let domainFound = false;

      switch (entry.source_type) {
        case 'REFERRAL_COMMISSION': {
          const chk = await db.query(`SELECT id FROM referral_commissions WHERE id = $1`, [entry.source_id]);
          domainFound = chk.rows.length > 0;
          break;
        }
        case 'MATCHING_BONUS': {
          const chk = await db.query(`SELECT id FROM binary_matching_settlements WHERE id = $1`, [entry.source_id]);
          domainFound = chk.rows.length > 0;
          break;
        }
        case 'PROMOTION_BONUS': {
          const chk = await db.query(`SELECT id FROM promotion_bonuses WHERE id = $1`, [entry.source_id]);
          domainFound = chk.rows.length > 0;
          break;
        }
        case 'NODE_REWARD': {
          const chk = await db.query(`SELECT id FROM node_rewards WHERE id = $1`, [entry.source_id]);
          domainFound = chk.rows.length > 0;
          break;
        }
        case 'BLOCKCHAIN_DEPOSIT': {
          const chk = await db.query(`SELECT id FROM blockchain_deposits WHERE id = $1`, [entry.source_id]);
          domainFound = chk.rows.length > 0;
          break;
        }
        case 'COIN_SWAP': {
          const chk = await db.query(`SELECT id FROM coin_swap_transactions WHERE id = $1`, [entry.source_id]);
          domainFound = chk.rows.length > 0;
          break;
        }
        case 'WITHDRAWAL': {
          const chk = await db.query(`SELECT id FROM withdrawals WHERE id = $1`, [entry.source_id]);
          domainFound = chk.rows.length > 0;
          break;
        }
        default:
          domainFound = false;
      }

      if (!domainFound) {
        issues.push({
          issueType: 'ORPHAN_LEDGER_ENTRY',
          sourceType: entry.source_type,
          sourceReference: entry.public_txn_id,
          asset: entry.currency === 'PHIVO' ? 'PHIVO' : 'USDT',
          expectedAmount: 0,
          actualAmount: Number(entry.amount),
          userId: entry.user_id,
          description: `Ledger entry ${entry.public_txn_id} references non-existent source entity (source_type: ${entry.source_type}, source_id: ${entry.source_id}).`,
        });
      }
    }

    // =========================================================================
    // CHECK 9: SEPARATE ASSET BALANCE INVARIANTS (PHIVO vs USDT vs USD)
    // =========================================================================
    // Check that no user has a negative PHIVO balance (mined rewards - swapped coins >= 0)
    const usersRes = await db.query(`SELECT id, public_id FROM users`);
    for (const u of usersRes.rows) {
      // 9.1 PHIVO Invariant
      const minedPhivoRes = await db.query<{ total: string }>(
        `SELECT COALESCE(SUM(amount), 0) as total FROM node_rewards WHERE owner_user_id = $1 AND status IN ('ACCRUED', 'CLAIMED')`,
        [u.id]
      );
      const swappedPhivoRes = await db.query<{ total: string }>(
        `SELECT COALESCE(SUM(coin_amount), 0) as total FROM coin_swap_transactions WHERE user_id = $1 AND status = 'COMPLETED'`,
        [u.id]
      );
      const minedPhivo = Number(minedPhivoRes.rows[0].total);
      const swappedPhivo = Number(swappedPhivoRes.rows[0].total);
      const netPhivo = minedPhivo - swappedPhivo;

      if (netPhivo < -0.000001) {
        issues.push({
          issueType: 'ASSET_BALANCE_NEGATIVE',
          sourceType: 'USER_BALANCE_PHIVO',
          sourceReference: u.public_id,
          asset: 'PHIVO',
          expectedAmount: 0,
          actualAmount: netPhivo,
          userId: u.id,
          description: `User ${u.public_id} has negative PHIVO balance (${netPhivo.toFixed(4)} PHIVO). Mined ${minedPhivo.toFixed(4)}, Swapped ${swappedPhivo.toFixed(4)}.`,
        });
      }

      // 9.2 USDT Invariant (Credits - Debits + Reversals in USDT ledger >= 0)
      const usdtLedgerRes = await db.query<{
        credits: string;
        debits: string;
        reversals: string;
      }>(
        `
        SELECT 
          COALESCE(SUM(CASE WHEN entry_type = 'CREDIT' THEN amount ELSE 0 END), 0) as credits,
          COALESCE(SUM(CASE WHEN entry_type = 'DEBIT' THEN amount ELSE 0 END), 0) as debits,
          COALESCE(SUM(CASE WHEN entry_type = 'REVERSAL' THEN amount ELSE 0 END), 0) as reversals
        FROM financial_ledger_entries
        WHERE user_id = $1 AND (currency = 'USDT' OR currency = 'USD')
        `,
        [u.id]
      );

      const credits = Number(usdtLedgerRes.rows[0].credits);
      const debits = Number(usdtLedgerRes.rows[0].debits);
      const reversals = Number(usdtLedgerRes.rows[0].reversals);
      const netUsdt = credits - debits + reversals;

      if (netUsdt < -0.0001) {
        issues.push({
          issueType: 'ASSET_BALANCE_NEGATIVE',
          sourceType: 'USER_BALANCE_USDT',
          sourceReference: u.public_id,
          asset: 'USDT',
          expectedAmount: 0,
          actualAmount: netUsdt,
          userId: u.id,
          description: `User ${u.public_id} has negative USDT ledger balance ($${netUsdt.toFixed(2)}).`,
        });
      }
    }

    // =========================================================================
    // 2. Persist Issues to financial_reconciliation_issues
    // =========================================================================
    for (const iss of issues) {
      await db.query(
        `
        INSERT INTO financial_reconciliation_issues (
          id, run_id, issue_type, source_type, source_reference,
          asset, expected_amount, actual_amount, status, user_id, description, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'DETECTED', $9, $10, CURRENT_TIMESTAMP)
        `,
        [
          uuidv4(),
          runId,
          iss.issueType,
          iss.sourceType,
          iss.sourceReference,
          iss.asset,
          iss.expectedAmount,
          iss.actualAmount,
          iss.userId || null,
          iss.description,
        ]
      );
    }

    // =========================================================================
    // 3. Compute Category Integrity Statuses
    // =========================================================================
    const phivoIssues = issues.filter((i) => i.asset === 'PHIVO');
    const usdtIssues = issues.filter((i) => i.asset === 'USDT' || i.asset === 'USD');
    const withdrawalIssues = issues.filter((i) => i.sourceType === 'WITHDRAWAL');
    const swapIssues = issues.filter((i) => i.sourceType === 'COIN_SWAP');
    const orphanOrDupIssues = issues.filter(
      (i) => i.issueType === 'ORPHAN_LEDGER_ENTRY' || i.issueType === 'DUPLICATE_LEDGER_CREDIT'
    );

    const phivoIntegrity: IntegrityStatus = phivoIssues.length === 0 ? 'CLEAN' : 'CRITICAL';
    const usdtIntegrity: IntegrityStatus = usdtIssues.length === 0 ? 'CLEAN' : 'CRITICAL';
    const withdrawalIntegrity: IntegrityStatus = withdrawalIssues.length === 0 ? 'CLEAN' : 'CRITICAL';
    const swapIntegrity: IntegrityStatus = swapIssues.length === 0 ? 'CLEAN' : 'CRITICAL';
    const ledgerIntegrity: IntegrityStatus =
      orphanOrDupIssues.length === 0 && issues.length === 0 ? 'CLEAN' : issues.length > 0 ? 'WARNING' : 'CLEAN';

    const completedAt = new Date();
    const summaryData = {
      referralsChecked,
      matchingChecked,
      promotionsChecked,
      miningRewardsChecked,
      depositsChecked,
      withdrawalsChecked,
      swapsChecked,
      ledgerEntriesChecked,
      phivoDiscrepancies: phivoIssues.length,
      usdtDiscrepancies: usdtIssues.length,
      ledgerDiscrepancies: issues.length,
      withdrawalDiscrepancies: withdrawalIssues.length,
      swapDiscrepancies: swapIssues.length,
    };

    // Update run record to COMPLETED
    await db.query(
      `
      UPDATE financial_reconciliation_runs
      SET completed_at = $1,
          status = 'COMPLETED',
          issues_found = $2,
          phivo_integrity = $3,
          usdt_integrity = $4,
          ledger_integrity = $5,
          withdrawal_integrity = $6,
          swap_integrity = $7,
          summary = $8
      WHERE id = $9
      `,
      [
        completedAt,
        issues.length,
        phivoIntegrity,
        usdtIntegrity,
        ledgerIntegrity,
        withdrawalIntegrity,
        swapIntegrity,
        JSON.stringify(summaryData),
        runId,
      ]
    );

    // =========================================================================
    // 4. Log to Audit Trail (admin_audit_logs)
    // Privacy-safe: zero private keys, secrets, or passwords logged
    // =========================================================================
    try {
      await db.query(
        `
        INSERT INTO admin_audit_logs (
          id, admin_user_id, admin_public_id, action, target_type, target_id, details, created_at
        )
        VALUES ($1, $2, $3, 'FINANCIAL_RECONCILIATION_RUN', 'RECONCILIATION_RUN', $4, $5, CURRENT_TIMESTAMP)
        `,
        [
          uuidv4(),
          options?.adminUserId || null,
          options?.adminPublicId || 'SYSTEM_AUDITOR',
          publicRunId,
          JSON.stringify({
            publicRunId,
            status: 'COMPLETED',
            issuesFound: issues.length,
            phivoIntegrity,
            usdtIntegrity,
            ledgerIntegrity,
            withdrawalIntegrity,
            swapIntegrity,
          }),
        ]
      );
    } catch (auditErr) {
      console.warn('[ReconciliationService] Warning: Failed to record audit log:', auditErr);
    }

    return {
      id: runId,
      publicRunId,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      status: 'COMPLETED',
      issuesFound: issues.length,
      createdBy: options?.adminUserId || null,
      createdByPublicId: options?.adminPublicId || 'SYSTEM_AUDITOR',
      phivoIntegrity,
      usdtIntegrity,
      ledgerIntegrity,
      withdrawalIntegrity,
      swapIntegrity,
      summary: summaryData,
    };
  } catch (err: any) {
    console.error('[ReconciliationService] Fatal error during reconciliation run:', err);
    // Update run record to FAILED
    await db.query(
      `
      UPDATE financial_reconciliation_runs
      SET completed_at = CURRENT_TIMESTAMP,
          status = 'FAILED',
          error_message = $1
      WHERE id = $2
      `,
      [err.message || 'Unknown reconciliation failure', runId]
    );

    throw err;
  }
}

/**
 * Retrieve the latest completed or running financial reconciliation run.
 */
export async function getLatestReconciliationRun(): Promise<ReconciliationRunSummary | null> {
  const db = await getDb();
  const res = await db.query(
    `
    SELECT * FROM financial_reconciliation_runs
    ORDER BY started_at DESC
    LIMIT 1
    `
  );

  if (res.rows.length === 0) return null;
  return mapRowToRunSummary(res.rows[0]);
}

/**
 * Retrieve paginated reconciliation issues with optional filtering.
 */
export async function getReconciliationIssues(options?: {
  runId?: string;
  issueType?: string;
  asset?: string;
  limit?: number;
  offset?: number;
}): Promise<{ issues: ReconciliationIssueRecord[]; total: number }> {
  const db = await getDb();
  const limit = Math.min(Math.max(options?.limit || 50, 1), 100);
  const offset = Math.max(options?.offset || 0, 0);

  const params: any[] = [];
  const whereClauses: string[] = [];

  if (options?.runId) {
    params.push(options.runId);
    whereClauses.push(`run_id = $${params.length}`);
  }
  if (options?.issueType) {
    params.push(options.issueType);
    whereClauses.push(`issue_type = $${params.length}`);
  }
  if (options?.asset) {
    params.push(options.asset);
    whereClauses.push(`asset = $${params.length}`);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const countRes = await db.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM financial_reconciliation_issues ${whereSql}`,
    params
  );
  const total = parseInt(countRes.rows[0]?.count || '0', 10);

  params.push(limit);
  const limitIdx = params.length;
  params.push(offset);
  const offsetIdx = params.length;

  const rowsRes = await db.query(
    `
    SELECT * FROM financial_reconciliation_issues
    ${whereSql}
    ORDER BY created_at DESC
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `,
    params
  );

  const issues: ReconciliationIssueRecord[] = rowsRes.rows.map((row: any) => ({
    id: row.id,
    runId: row.run_id,
    issueType: row.issue_type,
    sourceType: row.source_type,
    sourceReference: row.source_reference,
    asset: row.asset,
    expectedAmount: Number(row.expected_amount),
    actualAmount: Number(row.actual_amount),
    status: row.status,
    userId: row.user_id,
    description: row.description,
    createdAt: new Date(row.created_at).toISOString(),
  }));

  return { issues, total };
}

function mapRowToRunSummary(row: any): ReconciliationRunSummary {
  let summaryObj: any = {
    referralsChecked: 0,
    matchingChecked: 0,
    promotionsChecked: 0,
    miningRewardsChecked: 0,
    depositsChecked: 0,
    withdrawalsChecked: 0,
    swapsChecked: 0,
    ledgerEntriesChecked: 0,
    phivoDiscrepancies: 0,
    usdtDiscrepancies: 0,
    ledgerDiscrepancies: 0,
    withdrawalDiscrepancies: 0,
    swapDiscrepancies: 0,
  };

  if (row.summary) {
    try {
      summaryObj = typeof row.summary === 'string' ? JSON.parse(row.summary) : row.summary;
    } catch {
      // Ignore parse fallback
    }
  }

  return {
    id: row.id,
    publicRunId: row.public_run_id,
    startedAt: new Date(row.started_at).toISOString(),
    completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
    status: row.status,
    issuesFound: Number(row.issues_found || 0),
    createdBy: row.created_by,
    createdByPublicId: row.created_by_public_id,
    phivoIntegrity: row.phivo_integrity,
    usdtIntegrity: row.usdt_integrity,
    ledgerIntegrity: row.ledger_integrity,
    withdrawalIntegrity: row.withdrawal_integrity,
    swapIntegrity: row.swap_integrity,
    summary: summaryObj,
    errorMessage: row.error_message,
  };
}
