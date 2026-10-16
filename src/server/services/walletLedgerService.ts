import { getDb, DatabaseClient } from '../db/db';
import { v4 as uuidv4 } from 'uuid';
import { generateLedgerTransactionPublicId } from '../utils/idGenerator';

export type LedgerEntryType = 'CREDIT' | 'DEBIT' | 'REVERSAL';
export type LedgerSourceType = 'REFERRAL_COMMISSION' | 'MATCHING_BONUS' | 'PROMOTION_BONUS' | 'NODE_REWARD' | 'WITHDRAWAL' | 'BLOCKCHAIN_DEPOSIT' | 'COIN_SWAP' | 'ADMIN_ADJUSTMENT' | 'WALLET_TRANSFER' | 'NODE_PURCHASE';

export interface LedgerTransaction {
  id: string;
  publicTxnId: string;
  userId: string;
  entryType: LedgerEntryType;
  sourceType: LedgerSourceType;
  sourceId: string;
  sourceRef: string;
  description: string;
  amount: number;
  currency: string;
  status: 'SETTLED' | 'REVERSED' | 'PENDING';
  createdAt: string;
}

export interface WalletSummaryResponse {
  totalEarned: number;
  totalReversed: number;
  totalWithdrawn: number;
  ledgerBalance: number;
  availableBalance: number;
  mainWalletBalance: number;
  nodeVaultBalance: number;
  transactionCount: number;
  breakdown: {
    referral: number;
    matching: number;
    promotion: number;
    nodeReward: number;
    swap?: number;
    deposit?: number;
  };
  grossBreakdown: {
    referral: number;
    matching: number;
    promotion: number;
    nodeReward: number;
    swap?: number;
    deposit?: number;
  };
}

export interface WalletTransactionsResponse {
  transactions: LedgerTransaction[];
  pagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
  };
}

/**
 * Post a CREDIT entry to the financial ledger with strict idempotency.
 * Guarded by UNIQUE(source_type, source_id, entry_type).
 */
export async function postLedgerCredit(params: {
  userId: string;
  sourceType: LedgerSourceType;
  sourceId: string;
  sourceRef: string;
  amount: number;
  description: string;
  currency?: string;
  createdAt?: Date;
  dbClient?: DatabaseClient;
}): Promise<LedgerTransaction | null> {
  const { userId, sourceType, sourceId, sourceRef, amount, description, currency, createdAt, dbClient } = params;
  if (!amount || amount <= 0) return null;

  const db = dbClient || (await getDb());
  const id = uuidv4();
  const publicTxnId = generateLedgerTransactionPublicId();
  const effectiveTime = createdAt || new Date();
  const resolvedCurrency = currency || (sourceType === 'COIN_SWAP' || sourceType === 'WITHDRAWAL' || sourceType === 'BLOCKCHAIN_DEPOSIT' ? 'USDT' : 'USD');

  // Strict idempotency: ON CONFLICT DO NOTHING
  const res = await db.query<{
    id: string;
    public_txn_id: string;
    user_id: string;
    entry_type: LedgerEntryType;
    source_type: LedgerSourceType;
    source_id: string;
    source_ref: string;
    description: string;
    amount: string | number;
    currency: string;
    status: 'SETTLED' | 'REVERSED' | 'PENDING';
    created_at: Date;
  }>(
    `
    INSERT INTO financial_ledger_entries (
      id, public_txn_id, user_id, entry_type, source_type, source_id,
      source_ref, description, amount, currency, status, created_at
    )
    VALUES ($1, $2, $3, 'CREDIT', $4, $5, $6, $7, $8, $9, 'SETTLED', $10)
    ON CONFLICT (source_type, source_id, entry_type) DO NOTHING
    RETURNING *
    `,
    [id, publicTxnId, userId, sourceType, sourceId, sourceRef, description, amount, resolvedCurrency, effectiveTime]
  );

  if (res.rows.length > 0) {
    const row = res.rows[0];
    return {
      id: row.id,
      publicTxnId: row.public_txn_id,
      userId: row.user_id,
      entryType: row.entry_type,
      sourceType: row.source_type,
      sourceId: row.source_id,
      sourceRef: row.source_ref,
      description: row.description,
      amount: Number(row.amount),
      currency: row.currency,
      status: row.status,
      createdAt: new Date(row.created_at).toISOString(),
    };
  }

  // Already posted: fetch existing
  const existing = await db.query<{
    id: string;
    public_txn_id: string;
    user_id: string;
    entry_type: LedgerEntryType;
    source_type: LedgerSourceType;
    source_id: string;
    source_ref: string;
    description: string;
    amount: string | number;
    currency: string;
    status: 'SETTLED' | 'REVERSED' | 'PENDING';
    created_at: Date;
  }>(
    `
    SELECT * FROM financial_ledger_entries
    WHERE source_type = $1 AND source_id = $2 AND entry_type = 'CREDIT'
    `,
    [sourceType, sourceId]
  );

  if (existing.rows.length > 0) {
    const row = existing.rows[0];
    return {
      id: row.id,
      publicTxnId: row.public_txn_id,
      userId: row.user_id,
      entryType: row.entry_type,
      sourceType: row.source_type,
      sourceId: row.source_id,
      sourceRef: row.source_ref,
      description: row.description,
      amount: Number(row.amount),
      currency: row.currency,
      status: row.status,
      createdAt: new Date(row.created_at).toISOString(),
    };
  }

  return null;
}

/**
 * Post a REVERSAL entry to the financial ledger with strict idempotency.
 * Guarded by UNIQUE(source_type, source_id, entry_type).
 */
export async function postLedgerReversal(params: {
  userId: string;
  sourceType: LedgerSourceType;
  sourceId: string;
  sourceRef: string;
  amount: number;
  description: string;
  currency?: string;
  createdAt?: Date;
  dbClient?: DatabaseClient;
}): Promise<LedgerTransaction | null> {
  const { userId, sourceType, sourceId, sourceRef, amount, description, currency, createdAt, dbClient } = params;
  if (!amount || amount <= 0) return null;

  const db = dbClient || (await getDb());
  const id = uuidv4();
  const publicTxnId = generateLedgerTransactionPublicId();
  const effectiveTime = createdAt || new Date();
  const resolvedCurrency = currency || (sourceType === 'COIN_SWAP' || sourceType === 'WITHDRAWAL' || sourceType === 'BLOCKCHAIN_DEPOSIT' ? 'USDT' : 'USD');

  // Strict idempotency: ON CONFLICT DO NOTHING
  const res = await db.query<{
    id: string;
    public_txn_id: string;
    user_id: string;
    entry_type: LedgerEntryType;
    source_type: LedgerSourceType;
    source_id: string;
    source_ref: string;
    description: string;
    amount: string | number;
    currency: string;
    status: 'SETTLED' | 'REVERSED' | 'PENDING';
    created_at: Date;
  }>(
    `
    INSERT INTO financial_ledger_entries (
      id, public_txn_id, user_id, entry_type, source_type, source_id,
      source_ref, description, amount, currency, status, created_at
    )
    VALUES ($1, $2, $3, 'REVERSAL', $4, $5, $6, $7, $8, $9, 'SETTLED', $10)
    ON CONFLICT (source_type, source_id, entry_type) DO NOTHING
    RETURNING *
    `,
    [id, publicTxnId, userId, sourceType, sourceId, sourceRef, description, amount, resolvedCurrency, effectiveTime]
  );

  if (res.rows.length > 0) {
    const row = res.rows[0];
    return {
      id: row.id,
      publicTxnId: row.public_txn_id,
      userId: row.user_id,
      entryType: row.entry_type,
      sourceType: row.source_type,
      sourceId: row.source_id,
      sourceRef: row.source_ref,
      description: row.description,
      amount: Number(row.amount),
      currency: row.currency,
      status: row.status,
      createdAt: new Date(row.created_at).toISOString(),
    };
  }

  // Already posted: fetch existing
  const existing = await db.query<{
    id: string;
    public_txn_id: string;
    user_id: string;
    entry_type: LedgerEntryType;
    source_type: LedgerSourceType;
    source_id: string;
    source_ref: string;
    description: string;
    amount: string | number;
    currency: string;
    status: 'SETTLED' | 'REVERSED' | 'PENDING';
    created_at: Date;
  }>(
    `
    SELECT * FROM financial_ledger_entries
    WHERE source_type = $1 AND source_id = $2 AND entry_type = 'REVERSAL'
    `,
    [sourceType, sourceId]
  );

  if (existing.rows.length > 0) {
    const row = existing.rows[0];
    return {
      id: row.id,
      publicTxnId: row.public_txn_id,
      userId: row.user_id,
      entryType: row.entry_type,
      sourceType: row.source_type,
      sourceId: row.source_id,
      sourceRef: row.source_ref,
      description: row.description,
      amount: Number(row.amount),
      currency: row.currency,
      status: row.status,
      createdAt: new Date(row.created_at).toISOString(),
    };
  }

  return null;
}

/**
 * Post a DEBIT entry to the financial ledger with strict idempotency.
 * Guarded by UNIQUE(source_type, source_id, entry_type).
 */
export async function postLedgerDebit(params: {
  userId: string;
  sourceType: LedgerSourceType;
  sourceId: string;
  sourceRef: string;
  amount: number;
  description: string;
  currency?: string;
  createdAt?: Date;
  dbClient?: DatabaseClient;
}): Promise<LedgerTransaction | null> {
  const { userId, sourceType, sourceId, sourceRef, amount, description, currency, createdAt, dbClient } = params;
  if (!amount || amount <= 0) return null;

  const db = dbClient || (await getDb());
  const id = uuidv4();
  const publicTxnId = generateLedgerTransactionPublicId();
  const effectiveTime = createdAt || new Date();
  const resolvedCurrency = currency || (sourceType === 'COIN_SWAP' || sourceType === 'WITHDRAWAL' || sourceType === 'BLOCKCHAIN_DEPOSIT' ? 'USDT' : 'USD');

  // Strict idempotency: ON CONFLICT DO NOTHING
  const res = await db.query<{
    id: string;
    public_txn_id: string;
    user_id: string;
    entry_type: LedgerEntryType;
    source_type: LedgerSourceType;
    source_id: string;
    source_ref: string;
    description: string;
    amount: string | number;
    currency: string;
    status: 'SETTLED' | 'REVERSED' | 'PENDING';
    created_at: Date;
  }>(
    `
    INSERT INTO financial_ledger_entries (
      id, public_txn_id, user_id, entry_type, source_type, source_id,
      source_ref, description, amount, currency, status, created_at
    )
    VALUES ($1, $2, $3, 'DEBIT', $4, $5, $6, $7, $8, $9, 'SETTLED', $10)
    ON CONFLICT (source_type, source_id, entry_type) DO NOTHING
    RETURNING *
    `,
    [id, publicTxnId, userId, sourceType, sourceId, sourceRef, description, amount, resolvedCurrency, effectiveTime]
  );

  if (res.rows.length > 0) {
    const row = res.rows[0];
    return {
      id: row.id,
      publicTxnId: row.public_txn_id,
      userId: row.user_id,
      entryType: row.entry_type,
      sourceType: row.source_type,
      sourceId: row.source_id,
      sourceRef: row.source_ref,
      description: row.description,
      amount: Number(row.amount),
      currency: row.currency,
      status: row.status,
      createdAt: new Date(row.created_at).toISOString(),
    };
  }

  // Already posted: fetch existing
  const existing = await db.query<{
    id: string;
    public_txn_id: string;
    user_id: string;
    entry_type: LedgerEntryType;
    source_type: LedgerSourceType;
    source_id: string;
    source_ref: string;
    description: string;
    amount: string | number;
    currency: string;
    status: 'SETTLED' | 'REVERSED' | 'PENDING';
    created_at: Date;
  }>(
    `
    SELECT * FROM financial_ledger_entries
    WHERE source_type = $1 AND source_id = $2 AND entry_type = 'DEBIT'
    `,
    [sourceType, sourceId]
  );

  if (existing.rows.length > 0) {
    const row = existing.rows[0];
    return {
      id: row.id,
      publicTxnId: row.public_txn_id,
      userId: row.user_id,
      entryType: row.entry_type,
      sourceType: row.source_type,
      sourceId: row.source_id,
      sourceRef: row.source_ref,
      description: row.description,
      amount: Number(row.amount),
      currency: row.currency,
      status: row.status,
      createdAt: new Date(row.created_at).toISOString(),
    };
  }

  return null;
}

/**
 * Idempotently reconciles and synchronizes any unposted earnings/reversals
 * for a specific user into the authoritative financial ledger.
 */
export async function syncUserLedger(userId: string, dbClient?: DatabaseClient): Promise<void> {
  const db = dbClient || (await getDb());

  // 1. Reconcile Referral Commissions
  const commRes = await db.query<{
    id: string;
    public_commission_id: string;
    amount_usd: string | number;
    status: string;
    earned_at: Date;
    reversed_at: Date | null;
  }>(
    `
    SELECT id, public_commission_id, amount_usd, status, earned_at, reversed_at
    FROM referral_commissions
    WHERE sponsor_user_id = $1
    `,
    [userId]
  );

  for (const c of commRes.rows) {
    // Post CREDIT
    await postLedgerCredit({
      userId,
      sourceType: 'REFERRAL_COMMISSION',
      sourceId: c.id,
      sourceRef: c.public_commission_id,
      amount: Number(c.amount_usd),
      description: 'Direct Referral Commission - Node Activation',
      createdAt: new Date(c.earned_at),
      dbClient: db,
    });

    // If reversed, post REVERSAL
    if (c.status === 'REVERSED') {
      await postLedgerReversal({
        userId,
        sourceType: 'REFERRAL_COMMISSION',
        sourceId: c.id,
        sourceRef: c.public_commission_id,
        amount: Number(c.amount_usd),
        description: 'Direct Referral Commission Reversal',
        createdAt: c.reversed_at ? new Date(c.reversed_at) : new Date(),
        dbClient: db,
      });
    }
  }

  // 2. Reconcile Matching Settlements
  const matchRes = await db.query<{
    id: string;
    public_settlement_id: string;
    business_date: string | Date;
    total_bonus_usd: string | number;
    status: string;
    settled_at: Date;
  }>(
    `
    SELECT id, public_settlement_id, business_date, total_bonus_usd, status, settled_at
    FROM binary_matching_settlements
    WHERE user_id = $1 AND total_bonus_usd > 0
    `,
    [userId]
  );

  for (const m of matchRes.rows) {
    const bDate = typeof m.business_date === 'string' ? m.business_date.split('T')[0] : new Date(m.business_date).toISOString().split('T')[0];

    // Post CREDIT
    await postLedgerCredit({
      userId,
      sourceType: 'MATCHING_BONUS',
      sourceId: m.id,
      sourceRef: m.public_settlement_id,
      amount: Number(m.total_bonus_usd),
      description: `Daily Binary Matching Settlement (${bDate})`,
      createdAt: new Date(m.settled_at),
      dbClient: db,
    });

    // If reversed, post REVERSAL
    if (m.status === 'REVERSED') {
      await postLedgerReversal({
        userId,
        sourceType: 'MATCHING_BONUS',
        sourceId: m.id,
        sourceRef: m.public_settlement_id,
        amount: Number(m.total_bonus_usd),
        description: `Daily Binary Matching Settlement Reversal (${bDate})`,
        createdAt: new Date(),
        dbClient: db,
      });
    }
  }

  // 3. Reconcile Promotion Bonuses
  const promoRes = await db.query<{
    id: string;
    public_bonus_id: string;
    milestone: string;
    amount_usd: string | number;
    status: string;
    qualified_at: Date;
  }>(
    `
    SELECT id, public_bonus_id, milestone, amount_usd, status, qualified_at
    FROM promotion_bonuses
    WHERE user_id = $1
    `,
    [userId]
  );

  for (const p of promoRes.rows) {
    // Post CREDIT
    await postLedgerCredit({
      userId,
      sourceType: 'PROMOTION_BONUS',
      sourceId: p.id,
      sourceRef: p.public_bonus_id,
      amount: Number(p.amount_usd),
      description: `Promotion Milestone Bonus - ${p.milestone}`,
      createdAt: new Date(p.qualified_at),
      dbClient: db,
    });

    // If reversed, post REVERSAL
    if (p.status === 'REVERSED') {
      await postLedgerReversal({
        userId,
        sourceType: 'PROMOTION_BONUS',
        sourceId: p.id,
        sourceRef: p.public_bonus_id,
        amount: Number(p.amount_usd),
        description: `Promotion Milestone Bonus Reversal - ${p.milestone}`,
        createdAt: new Date(),
        dbClient: db,
      });
    }
  }

  // 4. Reconcile Node Rewards
  const nodeRewRes = await db.query<{
    id: string;
    public_reward_id: string;
    amount: string | number;
    status: string;
    accrued_at: Date;
    reversed_at: Date | null;
  }>(
    `
    SELECT id, public_reward_id, amount, status, accrued_at, reversed_at
    FROM node_rewards
    WHERE owner_user_id = $1
    `,
    [userId]
  );

  for (const nr of nodeRewRes.rows) {
    // Post CREDIT
    await postLedgerCredit({
      userId,
      sourceType: 'NODE_REWARD',
      sourceId: nr.id,
      sourceRef: nr.public_reward_id,
      amount: Number(nr.amount),
      currency: 'PHIVO',
      description: 'Genesis Node Mining Reward',
      createdAt: new Date(nr.accrued_at),
      dbClient: db,
    });

    // If reversed, post REVERSAL
    if (nr.status === 'REVERSED') {
      await postLedgerReversal({
        userId,
        sourceType: 'NODE_REWARD',
        sourceId: nr.id,
        sourceRef: nr.public_reward_id,
        amount: Number(nr.amount),
        currency: 'PHIVO',
        description: 'Genesis Node Mining Reward Reversal',
        createdAt: nr.reversed_at ? new Date(nr.reversed_at) : new Date(),
        dbClient: db,
      });
    }
  }

  // 5. Reconcile Confirmed/Credited Blockchain Deposits into Financial Ledger
  const depRes = await db.query<{
    id: string;
    public_deposit_id: string;
    amount: string | number;
    asset: string;
    tx_hash: string;
    status: string;
    credited_at: Date;
    confirmed_at: Date;
    created_at: Date;
  }>(
    `
    SELECT id, public_deposit_id, amount, asset, tx_hash, status, credited_at, confirmed_at, created_at
    FROM blockchain_deposits
    WHERE user_id = $1 AND status IN ('CREDITED', 'CONFIRMED', 'SWEPT')
    `,
    [userId]
  );

  for (const d of depRes.rows) {
    const assetName = (d.asset || 'USDT').toUpperCase();
    const effectiveDate = d.credited_at || d.confirmed_at || d.created_at || new Date();
    await postLedgerCredit({
      userId,
      sourceType: 'BLOCKCHAIN_DEPOSIT',
      sourceId: d.id,
      sourceRef: d.public_deposit_id,
      amount: Number(d.amount),
      currency: assetName === 'BNB' ? 'BNB' : 'USDT',
      description: `${assetName} Blockchain Deposit (${d.tx_hash ? d.tx_hash.slice(0, 10) : 'Verified'})`,
      createdAt: new Date(effectiveDate),
      dbClient: db,
    });
  }
}

/**
 * Returns the user's wallet summary:
 * - totalEarned
 * - totalReversed
 * - ledgerBalance
 * - transactionCount
 * - breakdown by source type (referral, matching, promotion, nodeReward, deposit, swap)
 */
export async function getWalletSummary(userId: string): Promise<WalletSummaryResponse> {
  // Sync unposted earnings and deposits first
  await syncUserLedger(userId);

  const db = await getDb();

  // Aggregate by entry_type and source_type for USD/USDT cash ledger
  const aggRes = await db.query<{
    entry_type: LedgerEntryType;
    source_type: LedgerSourceType;
    total_amount: string | number;
    count: string | number;
  }>(
    `
    SELECT 
      entry_type,
      source_type,
      COALESCE(SUM(amount), 0) AS total_amount,
      COUNT(*) AS count
    FROM financial_ledger_entries
    WHERE user_id = $1 AND status = 'SETTLED' AND (currency = 'USDT' OR currency = 'USD')
    GROUP BY entry_type, source_type
    `,
    [userId]
  );

  let totalEarned = 0;
  let earningReversals = 0;
  let totalDebited = 0;
  let withdrawalReversals = 0;
  let transactionCount = 0;

  const grossCredits = {
    referral: 0,
    matching: 0,
    promotion: 0,
    nodeReward: 0,
    swap: 0,
    deposit: 0,
  };

  const reversals = {
    referral: 0,
    matching: 0,
    promotion: 0,
    nodeReward: 0,
    swap: 0,
    deposit: 0,
  };

  for (const row of aggRes.rows) {
    const amt = Number(row.total_amount);
    const cnt = Number(row.count);
    transactionCount += cnt;

    const st = row.source_type;
    const isEarningSource = st === 'REFERRAL_COMMISSION' || st === 'MATCHING_BONUS' || st === 'PROMOTION_BONUS' || st === 'NODE_REWARD';

    if (row.entry_type === 'CREDIT') {
      if (isEarningSource) {
        totalEarned += amt;
      }
      if (row.source_type === 'REFERRAL_COMMISSION') grossCredits.referral += amt;
      else if (row.source_type === 'MATCHING_BONUS') grossCredits.matching += amt;
      else if (row.source_type === 'PROMOTION_BONUS') grossCredits.promotion += amt;
      else if (row.source_type === 'NODE_REWARD') grossCredits.nodeReward += amt;
      else if (row.source_type === 'COIN_SWAP') grossCredits.swap += amt;
      else if (row.source_type === 'BLOCKCHAIN_DEPOSIT') grossCredits.deposit += amt;
    } else if (row.entry_type === 'REVERSAL') {
      if (row.source_type === 'WITHDRAWAL') {
        withdrawalReversals += amt;
      } else {
        if (isEarningSource) {
          earningReversals += amt;
        }
        if (row.source_type === 'REFERRAL_COMMISSION') reversals.referral += amt;
        else if (row.source_type === 'MATCHING_BONUS') reversals.matching += amt;
        else if (row.source_type === 'PROMOTION_BONUS') reversals.promotion += amt;
        else if (row.source_type === 'NODE_REWARD') reversals.nodeReward += amt;
        else if (row.source_type === 'COIN_SWAP') reversals.swap += amt;
        else if (row.source_type === 'BLOCKCHAIN_DEPOSIT') reversals.deposit += amt;
      }
    } else if (row.entry_type === 'DEBIT') {
      totalDebited += amt;
    }
  }

  // Net breakdown per channel
  const breakdown = {
    referral: Math.max(0, grossCredits.referral - reversals.referral),
    matching: Math.max(0, grossCredits.matching - reversals.matching),
    promotion: Math.max(0, grossCredits.promotion - reversals.promotion),
    nodeReward: Math.max(0, grossCredits.nodeReward - reversals.nodeReward),
    swap: Math.max(0, grossCredits.swap - reversals.swap),
    deposit: Math.max(0, grossCredits.deposit - reversals.deposit),
  };

  const netWithdrawn = Math.max(0, totalDebited - withdrawalReversals);
  const balRes = await db.query<{ available_balance: string | number }>(
    `
    SELECT 
      COALESCE(SUM(CASE 
        WHEN entry_type = 'CREDIT' THEN amount 
        WHEN entry_type = 'DEBIT' THEN -amount 
        WHEN entry_type = 'REVERSAL' AND source_type = 'WITHDRAWAL' THEN amount 
        WHEN entry_type = 'REVERSAL' THEN -amount 
        ELSE 0 
      END), 0) AS available_balance
    FROM financial_ledger_entries
    WHERE user_id = $1 AND status = 'SETTLED' AND (currency = 'USDT' OR currency = 'USD')
    `,
    [userId]
  );
  const ledgerBalance = Math.max(0, Number(balRes.rows[0]?.available_balance || 0));

  // Calculate distinct Node Purchase Vault and Main Wallet balances
  const transfersRes = await db.query<{
    entry_type: LedgerEntryType;
    source_type: LedgerSourceType;
    description: string;
    amount: string | number;
  }>(
    `
    SELECT entry_type, source_type, description, amount
    FROM financial_ledger_entries
    WHERE user_id = $1 AND status = 'SETTLED' AND (currency = 'USDT' OR currency = 'USD') AND source_type IN ('WALLET_TRANSFER', 'NODE_PURCHASE')
    `,
    [userId]
  );

  let nodeVaultCredits = 0;
  let nodeVaultDebits = 0;

  for (const tr of transfersRes.rows) {
    const amt = Number(tr.amount);
    const desc = (tr.description || '').toLowerCase();

    if (tr.source_type === 'WALLET_TRANSFER') {
      if (tr.entry_type === 'CREDIT' && (desc.includes('main') || desc.includes('transfer from'))) {
        nodeVaultCredits += amt;
      }
    } else if (tr.source_type === 'NODE_PURCHASE' && tr.entry_type === 'DEBIT') {
      nodeVaultDebits += amt;
    }
  }

  const nodeVaultBalance = Math.max(0, nodeVaultCredits - nodeVaultDebits);
  const mainWalletBalance = Math.max(0, ledgerBalance - nodeVaultBalance);

  return {
    totalEarned,
    totalReversed: earningReversals,
    totalWithdrawn: netWithdrawn,
    ledgerBalance,
    availableBalance: ledgerBalance,
    mainWalletBalance,
    nodeVaultBalance,
    transactionCount,
    breakdown,
    grossBreakdown: grossCredits,
  };
}

/**
 * Returns the user's ledger transactions with safe pagination and optional type filtering.
 */
export async function getWalletTransactions(
  userId: string,
  page = 1,
  limit = 20,
  typeFilter?: string,
  searchQuery?: string,
  entryTypeFilter?: string
): Promise<WalletTransactionsResponse> {
  await syncUserLedger(userId);

  const db = await getDb();
  let actualPage = 1;
  let actualLimit = 20;
  if (typeof page === 'object' && page !== null) {
    actualPage = Number((page as any).page) || 1;
    actualLimit = Number((page as any).limit) || 20;
  } else {
    actualPage = Number(page) || 1;
    actualLimit = Number(limit) || 20;
  }

  const safePage = Math.max(1, actualPage);
  const safeLimit = Math.min(100, Math.max(1, actualLimit));
  const offset = (safePage - 1) * safeLimit;

  // Determine normalized source types to filter
  let types: string[] | null = null;
  if (typeFilter && typeFilter !== 'all' && typeFilter !== 'ALL') {
    const u = typeFilter.toUpperCase();
    if (u === 'NODE_ACTIVATION' || u === 'NODE_REWARD' || u === 'NODE_MINING') {
      types = ['NODE_REWARD'];
    } else if (u === 'REFERRAL_COMMISSION' || u === 'REFERRAL') {
      types = ['REFERRAL_COMMISSION'];
    } else if (u === 'MATCHING_BONUS' || u === 'MATCHING') {
      types = ['MATCHING_BONUS'];
    } else if (u === 'PROMOTION_BONUS' || u === 'PROMOTION') {
      types = ['PROMOTION_BONUS'];
    } else if (u === 'BLOCKCHAIN_DEPOSIT' || u === 'DEPOSIT') {
      types = ['BLOCKCHAIN_DEPOSIT'];
    } else if (u === 'WITHDRAWAL') {
      types = ['WITHDRAWAL'];
    } else if (u === 'COIN_SWAP' || u === 'SWAP') {
      types = ['COIN_SWAP'];
    } else {
      types = [u];
    }
  }

  // Determine normalized entry type (CREDIT, DEBIT, REVERSAL)
  let normalizedEntryType: LedgerEntryType | null = null;
  if (entryTypeFilter && entryTypeFilter !== 'all' && entryTypeFilter !== 'ALL') {
    const et = entryTypeFilter.toUpperCase();
    if (et === 'CREDIT' || et === 'DEBIT' || et === 'REVERSAL') {
      normalizedEntryType = et as LedgerEntryType;
    }
  }

  const cleanSearch = searchQuery ? searchQuery.trim().slice(0, 100) : '';

  let whereClauses = ['user_id = $1'];
  let queryParams: any[] = [userId];
  let paramIdx = 2;

  if (types && types.length > 0) {
    whereClauses.push(`source_type = ANY($${paramIdx}::text[])`);
    queryParams.push(types);
    paramIdx++;
  }

  if (normalizedEntryType) {
    whereClauses.push(`entry_type = $${paramIdx}`);
    queryParams.push(normalizedEntryType);
    paramIdx++;
  }

  if (cleanSearch) {
    whereClauses.push(`(public_txn_id ILIKE $${paramIdx} OR description ILIKE $${paramIdx} OR source_ref ILIKE $${paramIdx} OR id::text ILIKE $${paramIdx})`);
    queryParams.push(`%${cleanSearch}%`);
    paramIdx++;
  }

  const whereSql = whereClauses.join(' AND ');

  const countRes = await db.query<{ count: string | number }>(
    `SELECT COUNT(*)::int AS count FROM financial_ledger_entries WHERE ${whereSql}`,
    queryParams
  );
  const totalCount = Number(countRes.rows[0]?.count || 0);

  const limitParamIdx = paramIdx;
  const offsetParamIdx = paramIdx + 1;
  const txQueryParams = [...queryParams, safeLimit, offset];

  const txRes = await db.query<any>(
    `
    SELECT *
    FROM financial_ledger_entries
    WHERE ${whereSql}
    ORDER BY created_at DESC, id DESC
    LIMIT $${limitParamIdx} OFFSET $${offsetParamIdx}
    `,
    txQueryParams
  );
  const txRows = txRes.rows;

  const totalPages = Math.ceil(totalCount / safeLimit) || 1;

  const transactions: LedgerTransaction[] = txRows.map((row) => {
    let cleanDescription = row.description;
    if (row.source_type === 'ADMIN_ADJUSTMENT' || (cleanDescription && /admin adjustment/i.test(cleanDescription))) {
      cleanDescription = row.entry_type === 'DEBIT' ? 'Account Debit' : 'Account Credit';
    }

    return {
      id: row.id,
      publicTxnId: row.public_txn_id,
      userId: row.user_id,
      entryType: row.entry_type,
      sourceType: row.source_type,
      sourceId: row.source_id,
      sourceRef: row.source_ref,
      description: cleanDescription,
      amount: Number(row.amount),
      currency: row.currency,
      status: row.status,
      createdAt: new Date(row.created_at).toISOString(),
    };
  });

  return {
    transactions,
    pagination: {
      page: safePage,
      limit: safeLimit,
      totalCount,
      totalPages,
    },
  };
}

/**
 * Executes atomic internal transfer between ecosystem wallets / vaults
 * (e.g., Main Earnings Wallet -> Node Purchase Vault).
 * Performs double-entry ledger debit & credit inside a single DB transaction.
 */
export async function executeEcosystemWalletTransfer(
  userId: string,
  fromVault: 'MAIN_WALLET' | 'NODE_VAULT' | 'MINING_VAULT',
  toVault: 'MAIN_WALLET' | 'NODE_VAULT' | 'MINING_VAULT',
  amount: number,
  currency: string = 'USDT'
): Promise<{
  success: boolean;
  transferId: string;
  fromVault: string;
  toVault: string;
  amount: number;
  currency: string;
  transferredAt: string;
}> {
  if (fromVault === toVault) {
    throw new Error('INVALID_TRANSFER: Source and target ecosystem vaults must be different.');
  }
  if (amount <= 0 || isNaN(amount)) {
    throw new Error('INVALID_AMOUNT: Transfer amount must be greater than 0.');
  }

  const db = await getDb();
  return await db.transaction(async (trx) => {
    // Lock user row
    await trx.query(`SELECT id FROM users WHERE id = $1 FOR UPDATE`, [userId]);

    // Check available balance in source vault
    const walletSummary = await getWalletSummary(userId);
    const available = walletSummary.availableBalance;
    if (available < amount) {
      throw new Error(`INSUFFICIENT_BALANCE: Available balance of $${available.toFixed(2)} USDT is insufficient for $${amount.toFixed(2)} USDT transfer.`);
    }

    const transferId = `TRF-${uuidv4().substring(0, 8).toUpperCase()}`;
    const now = new Date();

    const fromLabel = fromVault === 'MAIN_WALLET' ? 'Main Earnings Wallet' : fromVault === 'NODE_VAULT' ? 'Node Purchase Vault' : 'Mining Yield Vault';
    const toLabel = toVault === 'NODE_VAULT' ? 'Node Activation Vault' : toVault === 'MAIN_WALLET' ? 'Main Earnings Wallet' : 'Mining Yield Vault';

    // Debit source vault
    const debitTxnId = `TXN-TRF-OUT-${uuidv4().substring(0, 8).toUpperCase()}`;
    await trx.query(
      `
      INSERT INTO financial_ledger_entries (
        id, public_txn_id, user_id, entry_type, source_type, source_id,
        source_ref, description, amount, currency, status, created_at
      ) VALUES ($1, $2, $3, 'DEBIT', 'WALLET_TRANSFER', $4, $5, $6, $7, $8, 'SETTLED', $9)
      `,
      [
        uuidv4(),
        debitTxnId,
        userId,
        uuidv4(),
        transferId,
        `Ecosystem Transfer to ${toLabel}`,
        amount,
        currency,
        now,
      ]
    );

    // Credit target vault
    const creditTxnId = `TXN-TRF-IN-${uuidv4().substring(0, 8).toUpperCase()}`;
    await trx.query(
      `
      INSERT INTO financial_ledger_entries (
        id, public_txn_id, user_id, entry_type, source_type, source_id,
        source_ref, description, amount, currency, status, created_at
      ) VALUES ($1, $2, $3, 'CREDIT', 'WALLET_TRANSFER', $4, $5, $6, $7, $8, 'SETTLED', $9)
      `,
      [
        uuidv4(),
        creditTxnId,
        userId,
        uuidv4(),
        transferId,
        `Ecosystem Transfer from ${fromLabel}`,
        amount,
        currency,
        now,
      ]
    );

    return {
      success: true,
      transferId,
      fromVault,
      toVault,
      amount,
      currency,
      transferredAt: now.toISOString(),
    };
  });
}
