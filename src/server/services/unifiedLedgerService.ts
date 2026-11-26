import { getDb, DatabaseClient } from '../db/db';
import {
  parseAmountToScaledBigInt,
  formatScaledBigInt,
  getUserMainUsdtBalanceExact,
} from './tradingPoolService';
import {
  LedgerEntryType,
  LedgerSourceType,
  syncUserLedger,
} from './walletLedgerService';

export type UnifiedStatementCategory =
  | 'PRODUCT_YIELD'
  | 'UNILEVEL_ROYALTY'
  | 'LEADERSHIP_RANK'
  | 'INVESTMENT_DEBIT'
  | 'WITHDRAWAL'
  | 'DEPOSIT';

export interface UserLedgerReconciliationResult {
  userId: string;
  totalSettledCredits: string;
  totalSettledDebits: string;
  netLedgerBalance: string;
  walletBalance: string;
  mainUsdtWalletBalance: string;
  nodeVaultBalance: string;
  mainWalletSettledCredits: string;
  mainWalletSettledDebits: string;
  mainWalletNetLedgerBalance: string;
  discrepancyUsd: string;
  mainWalletDiscrepancyUsd: string;
  isBalanced: boolean;
  settledEntryCount: number;
  verifiedAt: string;
}

export interface SystemLedgerReconciliationReport {
  totalUsersAudited: number;
  balancedUsersCount: number;
  discrepancyUsersCount: number;
  totalSystemSettledCreditsUsd: string;
  totalSystemSettledDebitsUsd: string;
  totalSystemNetLedgerBalanceUsd: string;
  totalSystemWalletBalanceUsd: string;
  totalSystemMainWalletBalanceUsd: string;
  totalSystemNodeVaultBalanceUsd: string;
  totalSystemDiscrepancyUsd: string;
  isSystemBalanced: boolean;
  discrepancies: UserLedgerReconciliationResult[];
  auditedUsers: UserLedgerReconciliationResult[];
  verifiedAt: string;
}

export interface UnifiedStatementEntry {
  id: string;
  publicTxnId: string;
  userId: string;
  category: UnifiedStatementCategory;
  entryType: LedgerEntryType;
  sourceType: LedgerSourceType | string;
  sourceId: string;
  sourceRef: string;
  description: string;
  amountUsd: string;
  amount: number;
  currency: string;
  status: 'SETTLED' | 'REVERSED' | 'PENDING';
  createdAt: string;
}

export interface UnifiedStatementResponse {
  userId: string;
  categoryFilter: string;
  entries: UnifiedStatementEntry[];
  summaryByCategory: {
    PRODUCT_YIELD: string;
    UNILEVEL_ROYALTY: string;
    LEADERSHIP_RANK: string;
    INVESTMENT_DEBIT: string;
    WITHDRAWAL: string;
    DEPOSIT: string;
  };
  reconciliation: UserLedgerReconciliationResult;
  pagination: {
    limit: number;
    offset: number;
    totalCount: number;
  };
}

/**
 * Maps a ledger row's source_type (and entry_type) into one of the 6 canonical
 * Task-09 unified statement categories.
 */
export function classifyLedgerSourceCategory(
  sourceType: string,
  entryType?: string
): UnifiedStatementCategory {
  const st = (sourceType || '').toUpperCase();
  const et = (entryType || '').toUpperCase();

  if (
    st === 'TRADING_POOL_YIELD' ||
    st === 'CHRONO_VAULT_YIELD' ||
    st === 'CHRONO_VAULT_MATURITY' ||
    st === 'COIN_SWAP' ||
    st === 'NODE_REWARD'
  ) {
    return 'PRODUCT_YIELD';
  }

  if (
    st === 'UNILEVEL_ROYALTY' ||
    st === 'REFERRAL_COMMISSION' ||
    st === 'MATCHING_BONUS'
  ) {
    return 'UNILEVEL_ROYALTY';
  }

  if (
    st === 'LEADERSHIP_RANK_REWARD' ||
    st === 'PROMOTION_BONUS' ||
    st === 'GLOBAL_TURNOVER_POOL' ||
    st === 'FOUNDERS_COUNCIL_DIVIDEND'
  ) {
    return 'LEADERSHIP_RANK';
  }

  if (
    st === 'TRADING_POOL_DEPOSIT' ||
    st === 'CHRONO_VAULT_STAKING' ||
    st === 'NODE_PURCHASE' ||
    st === 'WALLET_TRANSFER'
  ) {
    return 'INVESTMENT_DEBIT';
  }

  if (st === 'WITHDRAWAL' || st === 'P2P_TRANSFER_SENT') {
    return 'WITHDRAWAL';
  }

  if (
    st === 'BLOCKCHAIN_DEPOSIT' ||
    st === 'USDT_DEPOSIT' ||
    st === 'BNB_DEPOSIT' ||
    st === 'DEPOSIT_CREDIT' ||
    st === 'TRADING_POOL_PRINCIPAL_RETURN' ||
    st === 'TRADING_POOL_PRINCIPAL_REDEMPTION' ||
    st === 'P2P_TRANSFER_RECEIVED' ||
    st === 'ADMIN_ADJUSTMENT'
  ) {
    if (st === 'ADMIN_ADJUSTMENT' && et === 'DEBIT') {
      return 'WITHDRAWAL';
    }
    return 'DEPOSIT';
  }

  return 'DEPOSIT';
}

/**
 * Returns the SQL source_type list matching a UnifiedStatementCategory.
 */
function getSourceTypesForCategory(category: UnifiedStatementCategory): string[] {
  switch (category) {
    case 'PRODUCT_YIELD':
      return [
        'TRADING_POOL_YIELD',
        'CHRONO_VAULT_YIELD',
        'CHRONO_VAULT_MATURITY',
        'COIN_SWAP',
        'NODE_REWARD',
      ];
    case 'UNILEVEL_ROYALTY':
      return ['UNILEVEL_ROYALTY', 'REFERRAL_COMMISSION', 'MATCHING_BONUS'];
    case 'LEADERSHIP_RANK':
      return [
        'LEADERSHIP_RANK_REWARD',
        'PROMOTION_BONUS',
        'GLOBAL_TURNOVER_POOL',
        'FOUNDERS_COUNCIL_DIVIDEND',
      ];
    case 'INVESTMENT_DEBIT':
      return [
        'TRADING_POOL_DEPOSIT',
        'CHRONO_VAULT_STAKING',
        'NODE_PURCHASE',
        'WALLET_TRANSFER',
      ];
    case 'WITHDRAWAL':
      return ['WITHDRAWAL', 'P2P_TRANSFER_SENT'];
    case 'DEPOSIT':
      return [
        'BLOCKCHAIN_DEPOSIT',
        'USDT_DEPOSIT',
        'BNB_DEPOSIT',
        'DEPOSIT_CREDIT',
        'TRADING_POOL_PRINCIPAL_RETURN',
        'TRADING_POOL_PRINCIPAL_REDEMPTION',
        'P2P_TRANSFER_RECEIVED',
        'ADMIN_ADJUSTMENT',
      ];
  }
}

/**
 * Computes totalSettledCredits and totalSettledDebits across financial_ledger_entries
 * for userId (NUMERIC(20,8) exact sum) and compares netLedgerBalance = totalSettledCredits - totalSettledDebits
 * against the user's current Main USDT Wallet + Node Vault balance (discrepancyUsd = walletBalance - netLedgerBalance).
 *
 * Supports both (client, userId) and (userId, client?) parameter orders.
 */
export async function verifyUserLedgerReconciliation(
  clientOrUserId: DatabaseClient | string,
  maybeUserIdOrClient?: string | DatabaseClient
): Promise<UserLedgerReconciliationResult> {
  let db: DatabaseClient;
  let userId: string;

  if (typeof clientOrUserId === 'string') {
    userId = clientOrUserId;
    db = (maybeUserIdOrClient as DatabaseClient) || (await getDb());
  } else {
    db = clientOrUserId || (await getDb());
    userId = String(maybeUserIdOrClient);
  }

  // Ensure legacy/deposit records are synced into financial_ledger_entries
  await syncUserLedger(userId, db);

  // Query all SETTLED USD/USDT entries for exact NUMERIC(20,8) scaled BigInt summation
  const entriesRes = await db.query<{
    entry_type: LedgerEntryType;
    source_type: string;
    description: string | null;
    amount: string;
  }>(
    `
    SELECT
      entry_type,
      source_type,
      description,
      amount::numeric(20,8)::text AS amount
    FROM financial_ledger_entries
    WHERE user_id = $1
      AND (status = 'SETTLED' OR status IS NULL)
      AND (UPPER(currency) IN ('USDT', 'USD') OR currency IS NULL OR currency = '')
    ORDER BY created_at ASC, id ASC
    `,
    [userId]
  );

  let totalSettledCreditsScaled = 0n;
  let totalSettledDebitsScaled = 0n;

  let nodeVaultCreditsScaled = 0n;
  let nodeVaultSpendsScaled = 0n;

  let mainWalletCreditsScaled = 0n;
  let mainWalletDebitsScaled = 0n;

  for (const row of entriesRes.rows) {
    const amtScaled = parseAmountToScaledBigInt(row.amount || '0');
    const desc = (row.description || '').toLowerCase();
    const isNodeVaultCreditLeg =
      row.source_type === 'WALLET_TRANSFER' &&
      row.entry_type === 'CREDIT' &&
      (desc.includes('main') || desc.includes('transfer from'));
    const isNodeVaultSpendLeg =
      row.source_type === 'NODE_PURCHASE' && row.entry_type === 'DEBIT';

    if (row.entry_type === 'CREDIT') {
      totalSettledCreditsScaled += amtScaled;
      if (isNodeVaultCreditLeg) {
        nodeVaultCreditsScaled += amtScaled;
      } else {
        mainWalletCreditsScaled += amtScaled;
      }
    } else if (row.entry_type === 'DEBIT') {
      totalSettledDebitsScaled += amtScaled;
      if (isNodeVaultSpendLeg) {
        nodeVaultSpendsScaled += amtScaled;
      } else {
        mainWalletDebitsScaled += amtScaled;
      }
    } else if (row.entry_type === 'REVERSAL') {
      if (row.source_type === 'WITHDRAWAL') {
        totalSettledCreditsScaled += amtScaled;
        mainWalletCreditsScaled += amtScaled;
      } else {
        totalSettledDebitsScaled += amtScaled;
        mainWalletDebitsScaled += amtScaled;
      }
    }
  }

  // Node purchase spend funded directly from Main USDT deposit balance (exceeding Node Vault transfers)
  const mainFundedNodeSpendScaled =
    nodeVaultSpendsScaled > nodeVaultCreditsScaled
      ? nodeVaultSpendsScaled - nodeVaultCreditsScaled
      : 0n;
  mainWalletDebitsScaled += mainFundedNodeSpendScaled;

  const netLedgerBalanceScaled = totalSettledCreditsScaled - totalSettledDebitsScaled;
  const clampedNodeVaultNetScaled =
    nodeVaultCreditsScaled > nodeVaultSpendsScaled
      ? nodeVaultCreditsScaled - nodeVaultSpendsScaled
      : 0n;
  const mainWalletNetLedgerScaled = netLedgerBalanceScaled - clampedNodeVaultNetScaled;

  // Authoritative wallet & node vault balance query
  const exactBalances = await getUserMainUsdtBalanceExact(userId, db);
  const walletBalanceScaled = exactBalances.ledgerBalanceScaled;
  const mainUsdtWalletBalanceScaled = exactBalances.availableBalanceScaled;
  const nodeVaultBalanceScaled = exactBalances.nodeVaultBalanceScaled;

  const discrepancyScaled = walletBalanceScaled - netLedgerBalanceScaled;
  const mainWalletDiscrepancyScaled = mainUsdtWalletBalanceScaled - mainWalletNetLedgerScaled;

  const discrepancyUsd = formatScaledBigInt(discrepancyScaled);
  const mainWalletDiscrepancyUsd = formatScaledBigInt(mainWalletDiscrepancyScaled);

  return {
    userId,
    totalSettledCredits: formatScaledBigInt(totalSettledCreditsScaled),
    totalSettledDebits: formatScaledBigInt(totalSettledDebitsScaled),
    netLedgerBalance: formatScaledBigInt(netLedgerBalanceScaled),
    walletBalance: formatScaledBigInt(walletBalanceScaled),
    mainUsdtWalletBalance: formatScaledBigInt(mainUsdtWalletBalanceScaled),
    nodeVaultBalance: formatScaledBigInt(nodeVaultBalanceScaled),
    mainWalletSettledCredits: formatScaledBigInt(mainWalletCreditsScaled),
    mainWalletSettledDebits: formatScaledBigInt(mainWalletDebitsScaled),
    mainWalletNetLedgerBalance: formatScaledBigInt(mainWalletNetLedgerScaled),
    discrepancyUsd,
    mainWalletDiscrepancyUsd,
    isBalanced: discrepancyScaled === 0n && mainWalletDiscrepancyScaled === 0n,
    settledEntryCount: entriesRes.rows.length,
    verifiedAt: new Date().toISOString(),
  };
}

/**
 * Admin sweep verifying zero-sum ledger integrity across users.
 */
export async function verifyAllUsersLedgerReconciliation(
  limit: number = 500
): Promise<SystemLedgerReconciliationReport> {
  const db = await getDb();
  const safeLimit = Math.min(5000, Math.max(1, Number(limit) || 500));

  const usersRes = await db.query<{ id: string }>(
    `
    SELECT u.id
    FROM users u
    ORDER BY
      EXISTS (SELECT 1 FROM financial_ledger_entries fle WHERE fle.user_id = u.id) DESC,
      u.created_at DESC
    LIMIT $1
    `,
    [safeLimit]
  );

  let totalCreditsScaled = 0n;
  let totalDebitsScaled = 0n;
  let totalNetLedgerScaled = 0n;
  let totalWalletScaled = 0n;
  let totalMainWalletScaled = 0n;
  let totalNodeVaultScaled = 0n;
  let totalDiscrepancyScaled = 0n;

  const auditedUsers: UserLedgerReconciliationResult[] = [];
  const discrepancies: UserLedgerReconciliationResult[] = [];

  for (const row of usersRes.rows) {
    const rec = await verifyUserLedgerReconciliation(db, row.id);
    auditedUsers.push(rec);

    totalCreditsScaled += parseAmountToScaledBigInt(rec.totalSettledCredits);
    totalDebitsScaled += parseAmountToScaledBigInt(rec.totalSettledDebits);
    totalNetLedgerScaled += parseAmountToScaledBigInt(rec.netLedgerBalance);
    totalWalletScaled += parseAmountToScaledBigInt(rec.walletBalance);
    totalMainWalletScaled += parseAmountToScaledBigInt(rec.mainUsdtWalletBalance);
    totalNodeVaultScaled += parseAmountToScaledBigInt(rec.nodeVaultBalance);
    totalDiscrepancyScaled += parseAmountToScaledBigInt(rec.discrepancyUsd);

    if (!rec.isBalanced) {
      discrepancies.push(rec);
    }
  }

  return {
    totalUsersAudited: auditedUsers.length,
    balancedUsersCount: auditedUsers.length - discrepancies.length,
    discrepancyUsersCount: discrepancies.length,
    totalSystemSettledCreditsUsd: formatScaledBigInt(totalCreditsScaled),
    totalSystemSettledDebitsUsd: formatScaledBigInt(totalDebitsScaled),
    totalSystemNetLedgerBalanceUsd: formatScaledBigInt(totalNetLedgerScaled),
    totalSystemWalletBalanceUsd: formatScaledBigInt(totalWalletScaled),
    totalSystemMainWalletBalanceUsd: formatScaledBigInt(totalMainWalletScaled),
    totalSystemNodeVaultBalanceUsd: formatScaledBigInt(totalNodeVaultScaled),
    totalSystemDiscrepancyUsd: formatScaledBigInt(totalDiscrepancyScaled),
    isSystemBalanced: discrepancies.length === 0 && totalDiscrepancyScaled === 0n,
    discrepancies,
    auditedUsers,
    verifiedAt: new Date().toISOString(),
  };
}

/**
 * Returns unified chronological ledger entries categorized across:
 * - PRODUCT_YIELD (TRADING_POOL_YIELD, CHRONO_VAULT_YIELD, CHRONO_VAULT_MATURITY, COIN_SWAP)
 * - UNILEVEL_ROYALTY (UNILEVEL_ROYALTY)
 * - LEADERSHIP_RANK (LEADERSHIP_RANK_REWARD)
 * - INVESTMENT_DEBIT (TRADING_POOL_DEPOSIT, CHRONO_VAULT_STAKING, NODE_PURCHASE)
 * - WITHDRAWAL & DEPOSIT
 * Includes summary totals by category and live reconciliation status (isBalanced: discrepancyUsd === '0.00000000').
 */
export async function getUserUnifiedStatement(params: {
  userId: string;
  category?: string;
  limit?: number;
  offset?: number;
}): Promise<UnifiedStatementResponse> {
  const { userId, category, limit = 50, offset = 0 } = params;
  const db = await getDb();

  // Run reconciliation (which also runs syncUserLedger)
  const reconciliation = await verifyUserLedgerReconciliation(db, userId);

  const safeLimit = Math.min(200, Math.max(1, Number(limit) || 50));
  const safeOffset = Math.max(0, Number(offset) || 0);

  // 1. Compute category summary totals across all settled USD/USDT entries for this user
  const allEntriesRes = await db.query<{
    entry_type: LedgerEntryType;
    source_type: string;
    description: string | null;
    amount: string;
    currency: string;
  }>(
    `
    SELECT
      entry_type,
      source_type,
      description,
      amount::numeric(20,8)::text AS amount,
      COALESCE(currency, 'USDT') AS currency
    FROM financial_ledger_entries
    WHERE user_id = $1
      AND (status = 'SETTLED' OR status IS NULL)
      AND (UPPER(currency) IN ('USDT', 'USD') OR currency IS NULL OR currency = '')
    `,
    [userId]
  );

  const categoryTotalsScaled: Record<UnifiedStatementCategory, bigint> = {
    PRODUCT_YIELD: 0n,
    UNILEVEL_ROYALTY: 0n,
    LEADERSHIP_RANK: 0n,
    INVESTMENT_DEBIT: 0n,
    WITHDRAWAL: 0n,
    DEPOSIT: 0n,
  };

  for (const row of allEntriesRes.rows) {
    const amtScaled = parseAmountToScaledBigInt(row.amount || '0');
    const cat = classifyLedgerSourceCategory(row.source_type, row.entry_type);

    if (cat === 'INVESTMENT_DEBIT') {
      // Only sum DEBIT entries for investment debits (avoid double-counting internal WALLET_TRANSFER credit leg)
      if (row.entry_type === 'DEBIT') {
        categoryTotalsScaled.INVESTMENT_DEBIT += amtScaled;
      }
    } else if (cat === 'WITHDRAWAL') {
      if (row.entry_type === 'DEBIT') {
        categoryTotalsScaled.WITHDRAWAL += amtScaled;
      } else if (row.entry_type === 'REVERSAL') {
        categoryTotalsScaled.WITHDRAWAL =
          categoryTotalsScaled.WITHDRAWAL > amtScaled
            ? categoryTotalsScaled.WITHDRAWAL - amtScaled
            : 0n;
      }
    } else {
      if (row.entry_type === 'CREDIT') {
        categoryTotalsScaled[cat] += amtScaled;
      } else if (row.entry_type === 'REVERSAL') {
        categoryTotalsScaled[cat] =
          categoryTotalsScaled[cat] > amtScaled ? categoryTotalsScaled[cat] - amtScaled : 0n;
      }
    }
  }

  // 2. Build filtered query for paginated statement entries
  const normalizedCategory = category ? category.trim().toUpperCase() : 'ALL';
  const whereClauses: string[] = ['user_id = $1'];
  const queryParams: any[] = [userId];
  let paramIdx = 2;

  const validCategories: UnifiedStatementCategory[] = [
    'PRODUCT_YIELD',
    'UNILEVEL_ROYALTY',
    'LEADERSHIP_RANK',
    'INVESTMENT_DEBIT',
    'WITHDRAWAL',
    'DEPOSIT',
  ];

  if (normalizedCategory && normalizedCategory !== 'ALL') {
    if (validCategories.includes(normalizedCategory as UnifiedStatementCategory)) {
      const sourceTypes = getSourceTypesForCategory(
        normalizedCategory as UnifiedStatementCategory
      );
      whereClauses.push(`source_type = ANY($${paramIdx}::text[])`);
      queryParams.push(sourceTypes);
      paramIdx++;
    } else {
      whereClauses.push(`source_type = $${paramIdx}`);
      queryParams.push(normalizedCategory);
      paramIdx++;
    }
  }

  const whereSql = whereClauses.join(' AND ');

  const countRes = await db.query<{ count: string | number }>(
    `SELECT COUNT(*)::int AS count FROM financial_ledger_entries WHERE ${whereSql}`,
    queryParams
  );
  const totalCount = Number(countRes.rows[0]?.count || 0);

  const rowsRes = await db.query<{
    id: string;
    public_txn_id: string;
    user_id: string;
    entry_type: LedgerEntryType;
    source_type: string;
    source_id: string;
    source_ref: string;
    description: string;
    amount: string;
    currency: string;
    status: 'SETTLED' | 'REVERSED' | 'PENDING';
    created_at: Date;
  }>(
    `
    SELECT
      id,
      public_txn_id,
      user_id,
      entry_type,
      source_type,
      source_id,
      source_ref,
      description,
      amount::numeric(20,8)::text AS amount,
      COALESCE(currency, 'USDT') AS currency,
      COALESCE(status, 'SETTLED') AS status,
      created_at
    FROM financial_ledger_entries
    WHERE ${whereSql}
    ORDER BY created_at DESC, id DESC
    LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
    `,
    [...queryParams, safeLimit, safeOffset]
  );

  const entries: UnifiedStatementEntry[] = rowsRes.rows.map((row) => {
    const amountScaled = parseAmountToScaledBigInt(row.amount || '0');
    const amountUsd = formatScaledBigInt(amountScaled);
    return {
      id: row.id,
      publicTxnId: row.public_txn_id,
      userId: row.user_id,
      category: classifyLedgerSourceCategory(row.source_type, row.entry_type),
      entryType: row.entry_type,
      sourceType: row.source_type,
      sourceId: row.source_id,
      sourceRef: row.source_ref,
      description: row.description,
      amountUsd,
      amount: Number(amountUsd),
      currency: row.currency,
      status: row.status,
      createdAt: new Date(row.created_at).toISOString(),
    };
  });

  return {
    userId,
    categoryFilter: normalizedCategory || 'ALL',
    entries,
    summaryByCategory: {
      PRODUCT_YIELD: formatScaledBigInt(categoryTotalsScaled.PRODUCT_YIELD),
      UNILEVEL_ROYALTY: formatScaledBigInt(categoryTotalsScaled.UNILEVEL_ROYALTY),
      LEADERSHIP_RANK: formatScaledBigInt(categoryTotalsScaled.LEADERSHIP_RANK),
      INVESTMENT_DEBIT: formatScaledBigInt(categoryTotalsScaled.INVESTMENT_DEBIT),
      WITHDRAWAL: formatScaledBigInt(categoryTotalsScaled.WITHDRAWAL),
      DEPOSIT: formatScaledBigInt(categoryTotalsScaled.DEPOSIT),
    },
    reconciliation,
    pagination: {
      limit: safeLimit,
      offset: safeOffset,
      totalCount,
    },
  };
}
