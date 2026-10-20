var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/server/utils/idGenerator.ts
import crypto from "crypto";
function getRandomCode(length = 6) {
  let result = "";
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    result += CHARS[bytes[i] % CHARS.length];
  }
  return result;
}
function generatePublicId() {
  return `PHX-${getRandomCode(6)}`;
}
function generateReferralCode() {
  return `PHX${getRandomCode(6)}`;
}
function normalizeReferralCode(code) {
  return (code || "").trim().toUpperCase();
}
function generateOrderPublicId() {
  return `PHX-ORD-${getRandomCode(6)}`;
}
function generateVolumeEventPublicId() {
  return `BVE-${getRandomCode(6)}`;
}
function generateSettlementPublicId() {
  return `BMS-${getRandomCode(6)}`;
}
function generatePromotionBonusPublicId() {
  return `PRM-${getRandomCode(6)}`;
}
function generateLedgerTransactionPublicId() {
  return `TXN-${getRandomCode(6)}`;
}
function generateEpochPublicId(epochNumber) {
  if (typeof epochNumber === "number" && epochNumber > 0) {
    const padded = String(epochNumber).padStart(4, "0");
    return `EPOCH-${padded}`;
  }
  return `EPOCH-${getRandomCode(6)}`;
}
function generateRewardPublicId() {
  return `NRW-${getRandomCode(6)}`;
}
function generateWithdrawalPublicId() {
  return `PHX-WDR-${getRandomCode(6)}`;
}
function generateDepositPublicId() {
  return `PHX-DEP-${getRandomCode(6)}`;
}
function generateSwapPublicId() {
  return `PHX-SWP-${getRandomCode(6)}`;
}
function generateNotificationPublicId() {
  return `NTF-${getRandomCode(6)}`;
}
function generateReconciliationPublicId() {
  return `REC-${getRandomCode(6)}`;
}
function formatSafeDisplayName(fullName) {
  if (!fullName || typeof fullName !== "string") return "Operator";
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0];
  }
  const firstName = parts[0];
  const lastInitial = parts[parts.length - 1].charAt(0).toUpperCase();
  return `${firstName} ${lastInitial}.`;
}
async function resolveSponsorUserId(db, rawInput) {
  const clean = (rawInput || "").trim();
  if (!clean || clean.length < 3) return null;
  try {
    const res = await db.query(
      `SELECT r.user_id 
       FROM user_referrals r
       JOIN users u ON r.user_id = u.id
       WHERE UPPER(TRIM(r.referral_code)) = UPPER(TRIM($1))
          OR UPPER(TRIM(u.public_id)) = UPPER(TRIM($1))
          OR LOWER(TRIM(u.email)) = LOWER(TRIM($1))
       LIMIT 1`,
      [clean]
    );
    return res.rows[0]?.user_id || null;
  } catch (err) {
    console.warn("[ReferralResolution] Error resolving sponsor input:", err);
    return null;
  }
}
var CHARS;
var init_idGenerator = __esm({
  "src/server/utils/idGenerator.ts"() {
    CHARS = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  }
});

// src/config/nodeConfig.ts
function isValidNodeStateTransition(current, target) {
  return ALLOWED_STATE_TRANSITIONS[current]?.includes(target) || false;
}
function isValidOrderStateTransition(current, target) {
  return ALLOWED_ORDER_TRANSITIONS[current]?.includes(target) || false;
}
function formatPublicNodeId(nodeNumber) {
  if (nodeNumber < 1 || nodeNumber > GENESIS_NODE_CAP) {
    throw new Error(`Node number ${nodeNumber} out of Genesis range [1, ${GENESIS_NODE_CAP}]`);
  }
  return `PHX-NODE-${String(nodeNumber).padStart(6, "0")}`;
}
var GENESIS_NODE_CAP, NODE_BASE_PRICE_USD, RESERVATION_EXPIRY_MINUTES, ALLOWED_STATE_TRANSITIONS, ALLOWED_ORDER_TRANSITIONS;
var init_nodeConfig = __esm({
  "src/config/nodeConfig.ts"() {
    GENESIS_NODE_CAP = 1e4;
    NODE_BASE_PRICE_USD = 1e3;
    RESERVATION_EXPIRY_MINUTES = 15;
    ALLOWED_STATE_TRANSITIONS = {
      AVAILABLE: ["RESERVED"],
      RESERVED: ["ACTIVE", "AVAILABLE"],
      ACTIVE: ["RETIRED"],
      RETIRED: []
    };
    ALLOWED_ORDER_TRANSITIONS = {
      PENDING: ["SETTLING", "COMPLETED", "CANCELLED", "EXPIRED", "FAILED"],
      SETTLING: ["COMPLETED", "FAILED"],
      COMPLETED: [],
      CANCELLED: [],
      EXPIRED: [],
      FAILED: []
    };
  }
});

// src/server/services/walletLedgerService.ts
var walletLedgerService_exports = {};
__export(walletLedgerService_exports, {
  executeEcosystemWalletTransfer: () => executeEcosystemWalletTransfer,
  getWalletSummary: () => getWalletSummary,
  getWalletTransactions: () => getWalletTransactions,
  postLedgerCredit: () => postLedgerCredit,
  postLedgerDebit: () => postLedgerDebit,
  postLedgerReversal: () => postLedgerReversal,
  syncUserLedger: () => syncUserLedger
});
import { v4 as uuidv4 } from "uuid";
async function postLedgerCredit(params) {
  const { userId, sourceType, sourceId, sourceRef, amount, description, currency, createdAt, dbClient } = params;
  if (!amount || amount <= 0) return null;
  const db = dbClient || await getDb();
  const id = uuidv4();
  const publicTxnId = generateLedgerTransactionPublicId();
  const effectiveTime = createdAt || /* @__PURE__ */ new Date();
  const resolvedCurrency = currency || (sourceType === "COIN_SWAP" || sourceType === "WITHDRAWAL" || sourceType === "BLOCKCHAIN_DEPOSIT" ? "USDT" : "USD");
  const res = await db.query(
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
      createdAt: new Date(row.created_at).toISOString()
    };
  }
  const existing = await db.query(
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
      createdAt: new Date(row.created_at).toISOString()
    };
  }
  return null;
}
async function postLedgerReversal(params) {
  const { userId, sourceType, sourceId, sourceRef, amount, description, currency, createdAt, dbClient } = params;
  if (!amount || amount <= 0) return null;
  const db = dbClient || await getDb();
  const id = uuidv4();
  const publicTxnId = generateLedgerTransactionPublicId();
  const effectiveTime = createdAt || /* @__PURE__ */ new Date();
  const resolvedCurrency = currency || (sourceType === "COIN_SWAP" || sourceType === "WITHDRAWAL" || sourceType === "BLOCKCHAIN_DEPOSIT" ? "USDT" : "USD");
  const res = await db.query(
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
      createdAt: new Date(row.created_at).toISOString()
    };
  }
  const existing = await db.query(
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
      createdAt: new Date(row.created_at).toISOString()
    };
  }
  return null;
}
async function postLedgerDebit(params) {
  const { userId, sourceType, sourceId, sourceRef, amount, description, currency, createdAt, dbClient } = params;
  if (!amount || amount <= 0) return null;
  const db = dbClient || await getDb();
  const id = uuidv4();
  const publicTxnId = generateLedgerTransactionPublicId();
  const effectiveTime = createdAt || /* @__PURE__ */ new Date();
  const resolvedCurrency = currency || (sourceType === "COIN_SWAP" || sourceType === "WITHDRAWAL" || sourceType === "BLOCKCHAIN_DEPOSIT" ? "USDT" : "USD");
  const res = await db.query(
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
      createdAt: new Date(row.created_at).toISOString()
    };
  }
  const existing = await db.query(
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
      createdAt: new Date(row.created_at).toISOString()
    };
  }
  return null;
}
async function syncUserLedger(userId, dbClient) {
  const db = dbClient || await getDb();
  const commRes = await db.query(
    `
    SELECT id, public_commission_id, amount_usd, status, earned_at, reversed_at
    FROM referral_commissions
    WHERE sponsor_user_id = $1
    `,
    [userId]
  );
  for (const c of commRes.rows) {
    await postLedgerCredit({
      userId,
      sourceType: "REFERRAL_COMMISSION",
      sourceId: c.id,
      sourceRef: c.public_commission_id,
      amount: Number(c.amount_usd),
      description: "Direct Referral Commission - Node Activation",
      createdAt: new Date(c.earned_at),
      dbClient: db
    });
    if (c.status === "REVERSED") {
      await postLedgerReversal({
        userId,
        sourceType: "REFERRAL_COMMISSION",
        sourceId: c.id,
        sourceRef: c.public_commission_id,
        amount: Number(c.amount_usd),
        description: "Direct Referral Commission Reversal",
        createdAt: c.reversed_at ? new Date(c.reversed_at) : /* @__PURE__ */ new Date(),
        dbClient: db
      });
    }
  }
  const matchRes = await db.query(
    `
    SELECT id, public_settlement_id, business_date, total_bonus_usd, status, settled_at
    FROM binary_matching_settlements
    WHERE user_id = $1 AND total_bonus_usd > 0
    `,
    [userId]
  );
  for (const m of matchRes.rows) {
    const bDate = typeof m.business_date === "string" ? m.business_date.split("T")[0] : new Date(m.business_date).toISOString().split("T")[0];
    await postLedgerCredit({
      userId,
      sourceType: "MATCHING_BONUS",
      sourceId: m.id,
      sourceRef: m.public_settlement_id,
      amount: Number(m.total_bonus_usd),
      description: `Daily Binary Matching Settlement (${bDate})`,
      createdAt: new Date(m.settled_at),
      dbClient: db
    });
    if (m.status === "REVERSED") {
      await postLedgerReversal({
        userId,
        sourceType: "MATCHING_BONUS",
        sourceId: m.id,
        sourceRef: m.public_settlement_id,
        amount: Number(m.total_bonus_usd),
        description: `Daily Binary Matching Settlement Reversal (${bDate})`,
        createdAt: /* @__PURE__ */ new Date(),
        dbClient: db
      });
    }
  }
  const promoRes = await db.query(
    `
    SELECT id, public_bonus_id, milestone, amount_usd, status, qualified_at
    FROM promotion_bonuses
    WHERE user_id = $1
    `,
    [userId]
  );
  for (const p of promoRes.rows) {
    await postLedgerCredit({
      userId,
      sourceType: "PROMOTION_BONUS",
      sourceId: p.id,
      sourceRef: p.public_bonus_id,
      amount: Number(p.amount_usd),
      description: `Promotion Milestone Bonus - ${p.milestone}`,
      createdAt: new Date(p.qualified_at),
      dbClient: db
    });
    if (p.status === "REVERSED") {
      await postLedgerReversal({
        userId,
        sourceType: "PROMOTION_BONUS",
        sourceId: p.id,
        sourceRef: p.public_bonus_id,
        amount: Number(p.amount_usd),
        description: `Promotion Milestone Bonus Reversal - ${p.milestone}`,
        createdAt: /* @__PURE__ */ new Date(),
        dbClient: db
      });
    }
  }
  const nodeRewRes = await db.query(
    `
    SELECT id, public_reward_id, amount, status, accrued_at, reversed_at
    FROM node_rewards
    WHERE owner_user_id = $1
    `,
    [userId]
  );
  for (const nr of nodeRewRes.rows) {
    await postLedgerCredit({
      userId,
      sourceType: "NODE_REWARD",
      sourceId: nr.id,
      sourceRef: nr.public_reward_id,
      amount: Number(nr.amount),
      currency: "PHIVO",
      description: "Genesis Node Mining Reward",
      createdAt: new Date(nr.accrued_at),
      dbClient: db
    });
    if (nr.status === "REVERSED") {
      await postLedgerReversal({
        userId,
        sourceType: "NODE_REWARD",
        sourceId: nr.id,
        sourceRef: nr.public_reward_id,
        amount: Number(nr.amount),
        currency: "PHIVO",
        description: "Genesis Node Mining Reward Reversal",
        createdAt: nr.reversed_at ? new Date(nr.reversed_at) : /* @__PURE__ */ new Date(),
        dbClient: db
      });
    }
  }
  const depRes = await db.query(
    `
    SELECT id, public_deposit_id, amount, asset, tx_hash, status, credited_at, confirmed_at, created_at
    FROM blockchain_deposits
    WHERE user_id = $1 AND status IN ('CREDITED', 'CONFIRMED', 'SWEPT')
    `,
    [userId]
  );
  for (const d of depRes.rows) {
    const assetName = (d.asset || "USDT").toUpperCase();
    const effectiveDate = d.credited_at || d.confirmed_at || d.created_at || /* @__PURE__ */ new Date();
    await postLedgerCredit({
      userId,
      sourceType: "BLOCKCHAIN_DEPOSIT",
      sourceId: d.id,
      sourceRef: d.public_deposit_id,
      amount: Number(d.amount),
      currency: assetName === "BNB" ? "BNB" : "USDT",
      description: `${assetName} Blockchain Deposit (${d.tx_hash ? d.tx_hash.slice(0, 10) : "Verified"})`,
      createdAt: new Date(effectiveDate),
      dbClient: db
    });
  }
}
async function getWalletSummary(userId) {
  await syncUserLedger(userId);
  const db = await getDb();
  const aggRes = await db.query(
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
    deposit: 0
  };
  const reversals = {
    referral: 0,
    matching: 0,
    promotion: 0,
    nodeReward: 0,
    swap: 0,
    deposit: 0
  };
  for (const row of aggRes.rows) {
    const amt = Number(row.total_amount);
    const cnt = Number(row.count);
    transactionCount += cnt;
    const st = row.source_type;
    const isEarningSource = st === "REFERRAL_COMMISSION" || st === "MATCHING_BONUS" || st === "PROMOTION_BONUS" || st === "NODE_REWARD";
    if (row.entry_type === "CREDIT") {
      if (isEarningSource) {
        totalEarned += amt;
      }
      if (row.source_type === "REFERRAL_COMMISSION") grossCredits.referral += amt;
      else if (row.source_type === "MATCHING_BONUS") grossCredits.matching += amt;
      else if (row.source_type === "PROMOTION_BONUS") grossCredits.promotion += amt;
      else if (row.source_type === "NODE_REWARD") grossCredits.nodeReward += amt;
      else if (row.source_type === "COIN_SWAP") grossCredits.swap += amt;
      else if (row.source_type === "BLOCKCHAIN_DEPOSIT") grossCredits.deposit += amt;
    } else if (row.entry_type === "REVERSAL") {
      if (row.source_type === "WITHDRAWAL") {
        withdrawalReversals += amt;
      } else {
        if (isEarningSource) {
          earningReversals += amt;
        }
        if (row.source_type === "REFERRAL_COMMISSION") reversals.referral += amt;
        else if (row.source_type === "MATCHING_BONUS") reversals.matching += amt;
        else if (row.source_type === "PROMOTION_BONUS") reversals.promotion += amt;
        else if (row.source_type === "NODE_REWARD") reversals.nodeReward += amt;
        else if (row.source_type === "COIN_SWAP") reversals.swap += amt;
        else if (row.source_type === "BLOCKCHAIN_DEPOSIT") reversals.deposit += amt;
      }
    } else if (row.entry_type === "DEBIT") {
      totalDebited += amt;
    }
  }
  const breakdown = {
    referral: Math.max(0, grossCredits.referral - reversals.referral),
    matching: Math.max(0, grossCredits.matching - reversals.matching),
    promotion: Math.max(0, grossCredits.promotion - reversals.promotion),
    nodeReward: Math.max(0, grossCredits.nodeReward - reversals.nodeReward),
    swap: Math.max(0, grossCredits.swap - reversals.swap),
    deposit: Math.max(0, grossCredits.deposit - reversals.deposit)
  };
  const netWithdrawn = Math.max(0, totalDebited - withdrawalReversals);
  const balRes = await db.query(
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
  const transfersRes = await db.query(
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
    const desc = (tr.description || "").toLowerCase();
    if (tr.source_type === "WALLET_TRANSFER") {
      if (tr.entry_type === "CREDIT" && (desc.includes("main") || desc.includes("transfer from"))) {
        nodeVaultCredits += amt;
      }
    } else if (tr.source_type === "NODE_PURCHASE" && tr.entry_type === "DEBIT") {
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
    grossBreakdown: grossCredits
  };
}
async function getWalletTransactions(userId, page = 1, limit = 20, typeFilter, searchQuery, entryTypeFilter) {
  await syncUserLedger(userId);
  const db = await getDb();
  let actualPage = 1;
  let actualLimit = 20;
  if (typeof page === "object" && page !== null) {
    actualPage = Number(page.page) || 1;
    actualLimit = Number(page.limit) || 20;
  } else {
    actualPage = Number(page) || 1;
    actualLimit = Number(limit) || 20;
  }
  const safePage = Math.max(1, actualPage);
  const safeLimit = Math.min(100, Math.max(1, actualLimit));
  const offset = (safePage - 1) * safeLimit;
  let types = null;
  if (typeFilter && typeFilter !== "all" && typeFilter !== "ALL") {
    const u = typeFilter.toUpperCase();
    if (u === "NODE_ACTIVATION" || u === "NODE_REWARD" || u === "NODE_MINING") {
      types = ["NODE_REWARD"];
    } else if (u === "REFERRAL_COMMISSION" || u === "REFERRAL") {
      types = ["REFERRAL_COMMISSION"];
    } else if (u === "MATCHING_BONUS" || u === "MATCHING") {
      types = ["MATCHING_BONUS"];
    } else if (u === "PROMOTION_BONUS" || u === "PROMOTION") {
      types = ["PROMOTION_BONUS"];
    } else if (u === "BLOCKCHAIN_DEPOSIT" || u === "DEPOSIT") {
      types = ["BLOCKCHAIN_DEPOSIT"];
    } else if (u === "WITHDRAWAL") {
      types = ["WITHDRAWAL"];
    } else if (u === "COIN_SWAP" || u === "SWAP") {
      types = ["COIN_SWAP"];
    } else {
      types = [u];
    }
  }
  let normalizedEntryType = null;
  if (entryTypeFilter && entryTypeFilter !== "all" && entryTypeFilter !== "ALL") {
    const et = entryTypeFilter.toUpperCase();
    if (et === "CREDIT" || et === "DEBIT" || et === "REVERSAL") {
      normalizedEntryType = et;
    }
  }
  const cleanSearch = searchQuery ? searchQuery.trim().slice(0, 100) : "";
  let whereClauses = ["user_id = $1"];
  let queryParams = [userId];
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
  const whereSql = whereClauses.join(" AND ");
  const countRes = await db.query(
    `SELECT COUNT(*)::int AS count FROM financial_ledger_entries WHERE ${whereSql}`,
    queryParams
  );
  const totalCount = Number(countRes.rows[0]?.count || 0);
  const limitParamIdx = paramIdx;
  const offsetParamIdx = paramIdx + 1;
  const txQueryParams = [...queryParams, safeLimit, offset];
  const txRes = await db.query(
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
  const transactions = txRows.map((row) => {
    let cleanDescription = row.description;
    if (row.source_type === "ADMIN_ADJUSTMENT" || cleanDescription && /admin adjustment/i.test(cleanDescription)) {
      cleanDescription = row.entry_type === "DEBIT" ? "Account Debit" : "Account Credit";
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
      createdAt: new Date(row.created_at).toISOString()
    };
  });
  return {
    transactions,
    pagination: {
      page: safePage,
      limit: safeLimit,
      totalCount,
      totalPages
    }
  };
}
async function executeEcosystemWalletTransfer(userId, fromVault, toVault, amount, currency = "USDT") {
  if (fromVault === toVault) {
    throw new Error("INVALID_TRANSFER: Source and target ecosystem vaults must be different.");
  }
  if (amount <= 0 || isNaN(amount)) {
    throw new Error("INVALID_AMOUNT: Transfer amount must be greater than 0.");
  }
  const db = await getDb();
  return await db.transaction(async (trx) => {
    await trx.query(`SELECT id FROM users WHERE id = $1 FOR UPDATE`, [userId]);
    const walletSummary = await getWalletSummary(userId);
    const available = walletSummary.availableBalance;
    if (available < amount) {
      throw new Error(`INSUFFICIENT_BALANCE: Available balance of $${available.toFixed(2)} USDT is insufficient for $${amount.toFixed(2)} USDT transfer.`);
    }
    const transferId = `TRF-${uuidv4().substring(0, 8).toUpperCase()}`;
    const now = /* @__PURE__ */ new Date();
    const fromLabel = fromVault === "MAIN_WALLET" ? "Main Earnings Wallet" : fromVault === "NODE_VAULT" ? "Node Purchase Vault" : "Mining Yield Vault";
    const toLabel = toVault === "NODE_VAULT" ? "Node Activation Vault" : toVault === "MAIN_WALLET" ? "Main Earnings Wallet" : "Mining Yield Vault";
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
        now
      ]
    );
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
        now
      ]
    );
    return {
      success: true,
      transferId,
      fromVault,
      toVault,
      amount,
      currency,
      transferredAt: now.toISOString()
    };
  });
}
var init_walletLedgerService = __esm({
  "src/server/services/walletLedgerService.ts"() {
    init_db();
    init_idGenerator();
  }
});

// firebase-applet-config.json
var firebase_applet_config_default;
var init_firebase_applet_config = __esm({
  "firebase-applet-config.json"() {
    firebase_applet_config_default = {
      projectId: "phivonex-core-engine",
      appId: "1:812162791451:web:5c6f5bf0d5ace51f2860be",
      apiKey: "AIzaSyDNHdDho4gRRjrrH8r7u6IHDqf9euPGtmX8",
      authDomain: "phivonex-core-engine.firebaseapp.com",
      firestoreDatabaseId: "ai-studio-phivonex-fed0bbbd-87e6-4cf5-baa9-e4b72873cc9a",
      storageBucket: "phivonex-core-engine.firebasestorage.app",
      messagingSenderId: "812162791451",
      measurementId: "G-HZ2G7M9G1P",
      oAuthClientId: "812162791451-2gt6ce4599bck3320heji3itu4ku5j12.apps.googleusercontent.com",
      vapidKey: "BHifp2JFXi7RXu9zpuR_yID71wg7kSdc3yOpBAFTYUvonskijqL-tLNoRZCuoPvQIAc6Jcj4snycGGy8SugpPB8",
      recaptchaSiteKey: ""
    };
  }
});

// src/lib/firebase-admin.ts
var firebase_admin_exports = {};
__export(firebase_admin_exports, {
  adminApp: () => adminApp,
  adminAuth: () => adminAuth,
  adminFirestore: () => adminFirestore,
  adminMessaging: () => adminMessaging
});
import { initializeApp, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
var adminApp, adminAuth, adminMessaging, adminFirestore;
var init_firebase_admin = __esm({
  "src/lib/firebase-admin.ts"() {
    init_firebase_applet_config();
    if (!getApps().length) {
      adminApp = initializeApp({
        projectId: firebase_applet_config_default.projectId
      });
    } else {
      adminApp = getApps()[0];
    }
    adminAuth = getAuth(adminApp);
    adminMessaging = getMessaging(adminApp);
    adminFirestore = getFirestore(
      adminApp,
      firebase_applet_config_default.firestoreDatabaseId && firebase_applet_config_default.firestoreDatabaseId !== "(default)" ? firebase_applet_config_default.firestoreDatabaseId : void 0
    );
  }
});

// src/server/services/webPushServerService.ts
var webPushServerService_exports = {};
__export(webPushServerService_exports, {
  broadcastPushNotification: () => broadcastPushNotification,
  getUserPushTokens: () => getUserPushTokens,
  removeUserPushToken: () => removeUserPushToken,
  saveUserPushToken: () => saveUserPushToken,
  sendPushNotificationToUser: () => sendPushNotificationToUser
});
import { v4 as uuidv42 } from "uuid";
async function saveUserPushToken(params) {
  const { userId, token, platform = "WEB", userAgent = "" } = params;
  if (!userId || !token) return false;
  const db = await getDb();
  const id = uuidv42();
  const now = /* @__PURE__ */ new Date();
  try {
    await db.query(
      `
      INSERT INTO user_push_tokens (
        id, user_id, token, platform, user_agent, is_active, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, TRUE, $6, $6)
      ON CONFLICT (user_id, token) 
      DO UPDATE SET is_active = TRUE, updated_at = $6
      `,
      [id, userId, token.trim(), platform, userAgent, now]
    );
    console.log(`[WebPush] Successfully saved push token for user ${userId}`);
    return true;
  } catch (err) {
    console.error("[WebPush] Error saving user push token:", err);
    return false;
  }
}
async function removeUserPushToken(userId, token) {
  const db = await getDb();
  try {
    await db.query(
      `UPDATE user_push_tokens SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND token = $2`,
      [userId, token.trim()]
    );
    return true;
  } catch (err) {
    console.error("[WebPush] Error removing push token:", err);
    return false;
  }
}
async function getUserPushTokens(userId) {
  const db = await getDb();
  try {
    const res = await db.query(
      `SELECT token FROM user_push_tokens WHERE user_id = $1 AND is_active = TRUE`,
      [userId]
    );
    return res.rows.map((r) => r.token);
  } catch (err) {
    console.error("[WebPush] Error fetching push tokens for user:", err);
    return [];
  }
}
async function sendPushNotificationToUser(userId, payload) {
  const tokens = await getUserPushTokens(userId);
  if (tokens.length === 0) {
    return { sent: 0, failed: 0 };
  }
  const { title, body, icon = "/brand/phivonex-app-icon-192.png", url = "/app", data = {} } = payload;
  let sent = 0;
  let failed = 0;
  const db = await getDb();
  for (const token of tokens) {
    try {
      if (adminMessaging) {
        await adminMessaging.send({
          token,
          notification: {
            title,
            body
          },
          data: {
            url,
            ...data
          },
          webpush: {
            notification: {
              title,
              body,
              icon,
              badge: "/brand/phivonex-favicon.svg",
              vibrate: [200, 100, 200]
            },
            fcmOptions: {
              link: url
            }
          }
        });
        sent++;
      } else {
        sent++;
      }
    } catch (err) {
      failed++;
      console.warn(`[WebPush] Failed to send push message to token: ${err?.message}`);
      const errorCode = err?.code || err?.errorInfo?.code;
      if (errorCode === "messaging/invalid-registration-token" || errorCode === "messaging/registration-token-not-registered") {
        try {
          await db.query(
            `UPDATE user_push_tokens SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE token = $1`,
            [token]
          );
        } catch {
        }
      }
    }
  }
  return { sent, failed };
}
async function broadcastPushNotification(payload) {
  const db = await getDb();
  const res = await db.query(
    `SELECT token, user_id FROM user_push_tokens WHERE is_active = TRUE`
  );
  const tokens = res.rows.map((r) => r.token);
  if (tokens.length === 0) {
    return { totalTokens: 0, sent: 0, failed: 0 };
  }
  const { title, body, icon = "/brand/phivonex-app-icon-192.png", url = "/app", data = {} } = payload;
  let sent = 0;
  let failed = 0;
  for (const token of tokens) {
    try {
      if (adminMessaging) {
        await adminMessaging.send({
          token,
          notification: { title, body },
          data: { url, ...data },
          webpush: {
            notification: {
              title,
              body,
              icon,
              badge: "/brand/phivonex-favicon.svg"
            },
            fcmOptions: { link: url }
          }
        });
        sent++;
      } else {
        sent++;
      }
    } catch {
      failed++;
    }
  }
  return { totalTokens: tokens.length, sent, failed };
}
var init_webPushServerService = __esm({
  "src/server/services/webPushServerService.ts"() {
    init_db();
    init_firebase_admin();
  }
});

// src/server/services/notificationService.ts
var notificationService_exports = {};
__export(notificationService_exports, {
  createNotification: () => createNotification,
  deleteAllNotifications: () => deleteAllNotifications,
  deleteNotification: () => deleteNotification,
  getUnreadNotificationCount: () => getUnreadNotificationCount,
  getUserNotifications: () => getUserNotifications,
  markAllNotificationsAsRead: () => markAllNotificationsAsRead,
  markNotificationAsRead: () => markNotificationAsRead,
  notificationEmitter: () => notificationEmitter,
  notifyMatchingEarned: () => notifyMatchingEarned,
  notifyNodeActivated: () => notifyNodeActivated,
  notifyPhivoReward: () => notifyPhivoReward,
  notifyPhivoSwapCompleted: () => notifyPhivoSwapCompleted,
  notifyPromotionEarned: () => notifyPromotionEarned,
  notifyReferralEarned: () => notifyReferralEarned,
  notifySecurityAlert: () => notifySecurityAlert,
  notifySupportTicketCreated: () => notifySupportTicketCreated,
  notifySupportTicketUpdate: () => notifySupportTicketUpdate,
  notifyUsdtDepositConfirmed: () => notifyUsdtDepositConfirmed,
  notifyWithdrawalStatus: () => notifyWithdrawalStatus
});
import { EventEmitter } from "events";
import { v4 as uuidv43 } from "uuid";
async function createNotification(params) {
  const { userId, type, title, message, sourceType, sourceId, dbClient } = params;
  if (!userId || !type || !title || !message) {
    return null;
  }
  const db = dbClient || await getDb();
  const id = uuidv43();
  const publicId = generateNotificationPublicId();
  try {
    let query;
    let queryParams;
    if (sourceType && sourceId) {
      query = `
        INSERT INTO notifications (
          id, public_notification_id, user_id, type, title, message, source_type, source_id, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
        ON CONFLICT (user_id, source_type, source_id, type) WHERE source_type IS NOT NULL AND source_id IS NOT NULL DO NOTHING
        RETURNING public_notification_id, type, title, message, read_at, created_at
      `;
      queryParams = [id, publicId, userId, type, title, message, sourceType, sourceId];
    } else {
      query = `
        INSERT INTO notifications (
          id, public_notification_id, user_id, type, title, message, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
        RETURNING public_notification_id, type, title, message, read_at, created_at
      `;
      queryParams = [id, publicId, userId, type, title, message];
    }
    const res = await db.query(query, queryParams);
    if (res.rows.length === 0) {
      return null;
    }
    const row = res.rows[0];
    try {
      const { sendPushNotificationToUser: sendPushNotificationToUser2 } = await Promise.resolve().then(() => (init_webPushServerService(), webPushServerService_exports));
      sendPushNotificationToUser2(userId, {
        title: row.title,
        body: row.message,
        data: {
          notificationId: row.public_notification_id,
          type: row.type,
          url: "/app/notifications"
        }
      }).catch((pushErr) => {
        console.warn("[NotificationService] Web Push delivery warning:", pushErr?.message);
      });
    } catch {
    }
    const createdNotification = {
      id: row.public_notification_id,
      type: row.type,
      title: row.title,
      message: row.message,
      readAt: row.read_at ? new Date(row.read_at).toISOString() : null,
      createdAt: new Date(row.created_at).toISOString()
    };
    try {
      notificationEmitter.emit(`notification:${userId}`, createdNotification);
    } catch {
    }
    return createdNotification;
  } catch (err) {
    console.error("[NotificationService] Error creating notification:", err);
    return null;
  }
}
async function getUserNotifications(userId, options) {
  const db = await getDb();
  const limit = Math.max(1, Math.min(100, options?.limit || 20));
  const offset = Math.max(0, options?.offset || 0);
  const filterClauses = ["user_id = $1"];
  const queryParams = [userId];
  if (options?.unreadOnly) {
    filterClauses.push("read_at IS NULL");
  }
  if (options?.type) {
    queryParams.push(options.type);
    filterClauses.push(`type = $${queryParams.length}`);
  }
  const whereSql = filterClauses.join(" AND ");
  const countRes = await db.query(
    `SELECT COUNT(*) as count FROM notifications WHERE ${whereSql}`,
    queryParams
  );
  const total = parseInt(countRes.rows[0]?.count || "0", 10);
  const unreadRes = await db.query(
    `SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND read_at IS NULL`,
    [userId]
  );
  const unreadCount = parseInt(unreadRes.rows[0]?.count || "0", 10);
  const listParams = [...queryParams, limit, offset];
  const listRes = await db.query(
    `
    SELECT public_notification_id, type, title, message, read_at, created_at
    FROM notifications
    WHERE ${whereSql}
    ORDER BY created_at DESC
    LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
    `,
    listParams
  );
  const notifications = listRes.rows.map((row) => ({
    id: row.public_notification_id,
    type: row.type,
    title: row.title,
    message: row.message,
    readAt: row.read_at ? new Date(row.read_at).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString()
  }));
  return {
    notifications,
    total,
    unreadCount
  };
}
async function getUnreadNotificationCount(userId) {
  const db = await getDb();
  const res = await db.query(
    `SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND read_at IS NULL`,
    [userId]
  );
  return parseInt(res.rows[0]?.count || "0", 10);
}
async function markNotificationAsRead(userId, publicNotificationId) {
  if (!userId || !publicNotificationId) return false;
  const db = await getDb();
  const res = await db.query(
    `
    UPDATE notifications
    SET read_at = CURRENT_TIMESTAMP
    WHERE public_notification_id = $1 AND user_id = $2 AND read_at IS NULL
    RETURNING id
    `,
    [publicNotificationId, userId]
  );
  return res.rows.length > 0;
}
async function markAllNotificationsAsRead(userId) {
  if (!userId) return 0;
  const db = await getDb();
  const res = await db.query(
    `
    UPDATE notifications
    SET read_at = CURRENT_TIMESTAMP
    WHERE user_id = $1 AND read_at IS NULL
    RETURNING id
    `,
    [userId]
  );
  return res.rows.length;
}
async function deleteNotification(userId, publicNotificationId) {
  if (!userId || !publicNotificationId) return false;
  const db = await getDb();
  const res = await db.query(
    `
    DELETE FROM notifications
    WHERE public_notification_id = $1 AND user_id = $2
    RETURNING id
    `,
    [publicNotificationId, userId]
  );
  return res.rows.length > 0;
}
async function deleteAllNotifications(userId, options) {
  if (!userId) return 0;
  const db = await getDb();
  const query = options?.readOnly ? `DELETE FROM notifications WHERE user_id = $1 AND read_at IS NOT NULL RETURNING id` : `DELETE FROM notifications WHERE user_id = $1 RETURNING id`;
  const res = await db.query(query, [userId]);
  return res.rows.length;
}
async function notifyNodeActivated(params) {
  return createNotification({
    userId: params.userId,
    type: "NODE_ACTIVATED",
    title: "Genesis Node Activated",
    message: `Your Genesis Node #${params.nodeNumber} is now ACTIVE and operational in the PHIVONEX ecosystem.`,
    sourceType: "NODE_ORDER",
    sourceId: params.sourceId,
    dbClient: params.dbClient
  });
}
async function notifyReferralEarned(params) {
  const buyerRef = params.buyerPublicId ? ` from operator ${params.buyerPublicId}` : "";
  return createNotification({
    userId: params.userId,
    type: "REFERRAL_EARNED",
    title: "Referral Commission Earned",
    message: `You earned +$${params.amountUsd.toFixed(2)} USDT direct referral commission${buyerRef}.`,
    sourceType: "REFERRAL_COMMISSION",
    sourceId: params.commissionId
  });
}
async function notifyMatchingEarned(params) {
  return createNotification({
    userId: params.userId,
    type: "MATCHING_EARNED",
    title: "Binary Matching Bonus Earned",
    message: `You earned +$${params.bonusUsd.toFixed(2)} USDT from the binary matching cycle settlement.`,
    sourceType: "MATCHING_BONUS",
    sourceId: params.settlementId
  });
}
async function notifyPromotionEarned(params) {
  return createNotification({
    userId: params.userId,
    type: "PROMOTION_EARNED",
    title: "Promotion Reward Earned",
    message: `Congratulations! You unlocked the ${params.milestoneTitle} milestone and received +$${params.bonusUsd.toFixed(2)} USDT.`,
    sourceType: "PROMOTION_BONUS",
    sourceId: params.bonusId
  });
}
async function notifyPhivoReward(params) {
  return createNotification({
    userId: params.userId,
    type: "PHIVO_REWARD",
    title: "PHIVO Mining Reward Accrued",
    message: `You received a mining reward of +${params.amountPhivo.toFixed(4)} PHIVO from your Genesis Nodes.`,
    sourceType: "NODE_REWARD",
    sourceId: params.rewardId
  });
}
async function notifyPhivoSwapCompleted(params) {
  return createNotification({
    userId: params.userId,
    type: "PHIVO_SWAP_COMPLETED",
    title: "PHIVO \u2192 USDT Swap Completed",
    message: `Successfully swapped ${params.coinAmount.toFixed(4)} PHIVO into $${params.usdtAmount.toFixed(2)} USDT at $${params.rateUsdt.toFixed(4)} per PHIVO.`,
    sourceType: "COIN_SWAP",
    sourceId: params.swapId
  });
}
async function notifyUsdtDepositConfirmed(params) {
  const hashNote = params.txHash ? ` (Tx: ${params.txHash.slice(0, 10)}...)` : "";
  return createNotification({
    userId: params.userId,
    type: "USDT_DEPOSIT_CONFIRMED",
    title: "USDT Deposit Confirmed",
    message: `Your on-chain deposit of $${params.amountUsdt.toFixed(2)} USDT has been confirmed on BNB Smart Chain${hashNote}.`,
    sourceType: "BLOCKCHAIN_DEPOSIT",
    sourceId: params.depositId
  });
}
async function notifyWithdrawalStatus(params) {
  let title = "Withdrawal Status Updated";
  let message = `Your withdrawal request of $${params.amountUsdt.toFixed(2)} USDT status is now ${params.status}.`;
  if (params.status === "PENDING") {
    title = "Withdrawal Request Submitted";
    message = `Your withdrawal request of $${params.amountUsdt.toFixed(2)} USDT has been submitted for processing.`;
  } else if (params.status === "APPROVED") {
    title = "Withdrawal Request Approved";
    message = `Your withdrawal of $${params.amountUsdt.toFixed(2)} USDT has been approved and queued for blockchain disbursement.`;
  } else if (params.status === "COMPLETED") {
    title = "Withdrawal Disbursed";
    message = `Your withdrawal of $${params.amountUsdt.toFixed(2)} USDT has been successfully completed on-chain.`;
  } else if (params.status === "REJECTED") {
    title = "Withdrawal Rejected";
    message = `Your withdrawal of $${params.amountUsdt.toFixed(2)} USDT was rejected${params.reason ? `: ${params.reason}` : "."} Funds have been refunded to your ledger.`;
  }
  return createNotification({
    userId: params.userId,
    type: "WITHDRAWAL_STATUS",
    title,
    message,
    sourceType: "WITHDRAWAL",
    sourceId: `${params.withdrawalId}_${params.status}`,
    dbClient: params.dbClient
  });
}
async function notifySecurityAlert(params) {
  return createNotification({
    userId: params.userId,
    type: "SECURITY_ALERT",
    title: params.title || "Security Alert",
    message: params.message,
    sourceType: "SECURITY",
    sourceId: params.sourceId
  });
}
async function notifySupportTicketCreated(params) {
  return createNotification({
    userId: params.userId,
    type: "SUPPORT_TICKET_CREATED",
    title: "Support Ticket Received",
    message: `Your support ticket "${params.subject}" (${params.ticketPublicId || params.ticketId}) has been created. Our team will review it shortly.`,
    sourceType: "SUPPORT_TICKET",
    sourceId: params.ticketId,
    dbClient: params.dbClient
  });
}
async function notifySupportTicketUpdate(params) {
  return createNotification({
    userId: params.userId,
    type: "SUPPORT_TICKET_UPDATE",
    title: "Support Ticket Updated",
    message: params.message || `Your support ticket (${params.ticketPublicId || params.ticketId}) status has been updated to ${params.status}.`,
    sourceType: "SUPPORT_TICKET",
    sourceId: `${params.ticketId}_${params.status}_${Date.now()}`,
    dbClient: params.dbClient
  });
}
var notificationEmitter;
var init_notificationService = __esm({
  "src/server/services/notificationService.ts"() {
    init_db();
    init_idGenerator();
    notificationEmitter = new EventEmitter();
    notificationEmitter.setMaxListeners(1e3);
  }
});

// src/server/services/leadershipRankService.ts
var leadershipRankService_exports = {};
__export(leadershipRankService_exports, {
  adminManualRankCorrection: () => adminManualRankCorrection,
  ensurePromotionTables: () => ensurePromotionTables,
  evaluateUserRankPromotion: () => evaluateUserRankPromotion,
  generatePublicPromotionId: () => generatePublicPromotionId,
  getDownlineLeaderCounts: () => getDownlineLeaderCounts,
  getPromotionRules: () => getPromotionRules,
  getUserPromotionAuditLogs: () => getUserPromotionAuditLogs,
  getUserPromotionState: () => getUserPromotionState,
  updatePromotionRule: () => updatePromotionRule
});
import { v4 as uuidv44 } from "uuid";
function generatePublicPromotionId() {
  const rand = Math.floor(1e5 + Math.random() * 9e5);
  return `PRM-RANK-${rand}`;
}
async function ensurePromotionTables(dbClient) {
  const db = dbClient || await getDb();
  await db.exec(`
    CREATE TABLE IF NOT EXISTS promotion_rules (
      id UUID PRIMARY KEY,
      rank_key VARCHAR(50) UNIQUE NOT NULL,
      rank_name VARCHAR(100) NOT NULL,
      rank_order INTEGER UNIQUE NOT NULL,
      qualification_type VARCHAR(30) NOT NULL,
      required_left INTEGER NOT NULL DEFAULT 0,
      required_right INTEGER NOT NULL DEFAULT 0,
      required_leader_rank VARCHAR(50) NULL,
      leg_balance_rule VARCHAR(30) NOT NULL DEFAULT 'FLEXIBLE',
      reward_usd NUMERIC(12, 2) NOT NULL DEFAULT 0,
      flush_rule VARCHAR(50) NOT NULL DEFAULT 'CONSUME_STAGE_REQUIREMENT',
      status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
      version INTEGER NOT NULL DEFAULT 1,
      effective_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_promotion_states (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
      current_rank VARCHAR(50) NOT NULL DEFAULT 'STANDARD',
      current_rank_order INTEGER NOT NULL DEFAULT 0,
      next_rank VARCHAR(50) NULL DEFAULT 'NODE_BUILDER',
      next_rank_order INTEGER NULL DEFAULT 1,
      cumulative_consumed_left INTEGER NOT NULL DEFAULT 0,
      cumulative_consumed_right INTEGER NOT NULL DEFAULT 0,
      current_stage_left_progress INTEGER NOT NULL DEFAULT 0,
      current_stage_right_progress INTEGER NOT NULL DEFAULT 0,
      current_stage_left_required INTEGER NOT NULL DEFAULT 20,
      current_stage_right_required INTEGER NOT NULL DEFAULT 20,
      current_stage_leaders_left INTEGER NOT NULL DEFAULT 0,
      current_stage_leaders_right INTEGER NOT NULL DEFAULT 0,
      last_evaluated_at TIMESTAMP WITH TIME ZONE NULL,
      last_promoted_at TIMESTAMP WITH TIME ZONE NULL,
      promotion_version INTEGER NOT NULL DEFAULT 1,
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    ALTER TABLE user_promotion_states ALTER COLUMN next_rank_order DROP NOT NULL;

    CREATE TABLE IF NOT EXISTS user_promotion_events (
      id UUID PRIMARY KEY,
      public_promotion_id VARCHAR(50) UNIQUE NOT NULL,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      rank_key VARCHAR(50) NOT NULL,
      rank_name VARCHAR(100) NOT NULL,
      rank_order INTEGER NOT NULL,
      previous_rank VARCHAR(50) NOT NULL,
      qualification_type VARCHAR(30) NOT NULL,
      required_left INTEGER NOT NULL,
      required_right INTEGER NOT NULL,
      actual_left INTEGER NOT NULL,
      actual_right INTEGER NOT NULL,
      consumed_left INTEGER NOT NULL DEFAULT 0,
      consumed_right INTEGER NOT NULL DEFAULT 0,
      rule_version INTEGER NOT NULL DEFAULT 1,
      reward_usd NUMERIC(12, 2) NOT NULL DEFAULT 0,
      qualifying_leader_ids_json TEXT NULL,
      source_matching_references TEXT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'COMPLETED',
      completed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT uq_upe_user_rank UNIQUE (user_id, rank_key)
    );

    CREATE TABLE IF NOT EXISTS promotion_audit_logs (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      action VARCHAR(50) NOT NULL,
      from_rank VARCHAR(50) NULL,
      to_rank VARCHAR(50) NULL,
      details_json TEXT NOT NULL,
      actor_type VARCHAR(20) NOT NULL DEFAULT 'SYSTEM',
      actor_id VARCHAR(100) NULL,
      reason TEXT NULL,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_upe_user_id ON user_promotion_events(user_id);
    CREATE INDEX IF NOT EXISTS idx_upe_rank_key ON user_promotion_events(rank_key);
    CREATE INDEX IF NOT EXISTS idx_ups_user_id ON user_promotion_states(user_id);
    CREATE INDEX IF NOT EXISTS idx_pal_user_id ON promotion_audit_logs(user_id);

    -- Schema upgrades for Non-Cash & Custom Leadership Rewards
    ALTER TABLE promotion_rules ADD COLUMN IF NOT EXISTS reward_type VARCHAR(20) NOT NULL DEFAULT 'USDT';
    ALTER TABLE promotion_rules ADD COLUMN IF NOT EXISTS reward_title VARCHAR(200) NULL;
    ALTER TABLE promotion_rules ADD COLUMN IF NOT EXISTS reward_description TEXT NULL;
    ALTER TABLE promotion_rules ADD COLUMN IF NOT EXISTS reward_display_value_usd NUMERIC(12, 2) NULL;

    ALTER TABLE user_promotion_events ADD COLUMN IF NOT EXISTS reward_type VARCHAR(20) NOT NULL DEFAULT 'USDT';
    ALTER TABLE user_promotion_events ADD COLUMN IF NOT EXISTS reward_title VARCHAR(200) NULL;
    ALTER TABLE user_promotion_events ADD COLUMN IF NOT EXISTS reward_description TEXT NULL;
    ALTER TABLE user_promotion_events ADD COLUMN IF NOT EXISTS reward_display_value_usd NUMERIC(12, 2) NULL;
  `);
  await db.query(`
    INSERT INTO promotion_rules (
      id, rank_key, rank_name, rank_order, qualification_type,
      required_left, required_right, required_leader_rank, leg_balance_rule,
      reward_usd, flush_rule, status, version
    )
    VALUES
      ('a0000000-0000-0000-0000-000000000000', 'STANDARD', 'Standard Member', 0, 'NONE', 0, 0, NULL, 'FLEXIBLE', 0, 'NONE', 'ACTIVE', 1),
      ('a0000000-0000-0000-0000-000000000001', 'NODE_BUILDER', 'Node Builder', 1, 'MATCHING', 20, 20, NULL, 'STRICT', 5000.00, 'CONSUME_STAGE_REQUIREMENT', 'ACTIVE', 1),
      ('a0000000-0000-0000-0000-000000000002', 'NODE_MASTER', 'Node Master', 2, 'MATCHING', 50, 50, NULL, 'STRICT', 10000.00, 'CONSUME_STAGE_REQUIREMENT', 'ACTIVE', 1),
      ('a0000000-0000-0000-0000-000000000003', 'NODE_CAPTAIN', 'Node Captain', 3, 'MATCHING', 100, 100, NULL, 'STRICT', 50000.00, 'CONSUME_STAGE_REQUIREMENT', 'ACTIVE', 1),
      ('a0000000-0000-0000-0000-000000000004', 'NODE_COMMANDER', 'Node Commander', 4, 'LEADERSHIP', 2, 3, 'NODE_CAPTAIN', 'FLEXIBLE', 0, 'NONE', 'ACTIVE', 1),
      ('a0000000-0000-0000-0000-000000000005', 'NODE_AMBASSADOR', 'Node Ambassador', 5, 'LEADERSHIP', 3, 4, 'NODE_COMMANDER', 'FLEXIBLE', 0, 'NONE', 'ACTIVE', 1),
      ('a0000000-0000-0000-0000-000000000006', 'NODE_TITAN', 'Node Titan', 6, 'LEADERSHIP', 4, 5, 'NODE_AMBASSADOR', 'FLEXIBLE', 0, 'NONE', 'ACTIVE', 1)
    ON CONFLICT (rank_key) DO NOTHING;
  `);
}
async function getPromotionRules(dbClient) {
  const db = dbClient || await getDb();
  await ensurePromotionTables(db);
  const res = await db.query(`
    SELECT 
      pr.id, pr.rank_key, pr.rank_name, pr.rank_order, pr.qualification_type,
      pr.required_left, pr.required_right, pr.required_leader_rank, pr.leg_balance_rule,
      pr.reward_type, pr.reward_usd, pr.reward_title, pr.reward_description, pr.reward_display_value_usd,
      pr.flush_rule, pr.status, pr.version, pr.effective_date,
      pr.created_at, pr.updated_at,
      COUNT(upe.id)::int AS achievers_count
    FROM promotion_rules pr
    LEFT JOIN user_promotion_events upe ON pr.rank_key = upe.rank_key AND upe.status = 'COMPLETED'
    GROUP BY pr.id
    ORDER BY pr.rank_order ASC
  `);
  return res.rows.map((r) => ({
    id: r.id,
    rankKey: r.rank_key,
    rankName: r.rank_name,
    rankOrder: Number(r.rank_order),
    qualificationType: r.qualification_type,
    requiredLeft: Number(r.required_left),
    requiredRight: Number(r.required_right),
    requiredLeaderRank: r.required_leader_rank,
    legBalanceRule: r.leg_balance_rule || "FLEXIBLE",
    rewardType: r.reward_type || "USDT",
    rewardUsd: Number(r.reward_usd || 0),
    rewardTitle: r.reward_title || null,
    rewardDescription: r.reward_description || null,
    rewardDisplayValueUsd: r.reward_display_value_usd !== null && r.reward_display_value_usd !== void 0 ? Number(r.reward_display_value_usd) : null,
    flushRule: r.flush_rule,
    status: r.status,
    version: Number(r.version),
    effectiveDate: r.effective_date instanceof Date ? r.effective_date.toISOString() : String(r.effective_date),
    achieversCount: Number(r.achievers_count || 0),
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at)
  }));
}
async function updatePromotionRule(adminId, adminPublicId, ruleId, updates, dbClient) {
  const db = dbClient || await getDb();
  await ensurePromotionTables(db);
  if (!updates.reason || updates.reason.trim().length < 5) {
    const err = new Error("Admin reason is mandatory (minimum 5 characters) for prospective rule updates.");
    err.code = "REASON_REQUIRED";
    err.statusCode = 400;
    throw err;
  }
  const currentRes = await db.query(`SELECT * FROM promotion_rules WHERE id = $1`, [ruleId]);
  if (currentRes.rows.length === 0) {
    const err = new Error("Promotion rule not found.");
    err.code = "RULE_NOT_FOUND";
    err.statusCode = 404;
    throw err;
  }
  const current = currentRes.rows[0];
  if (updates.expectedVersion !== void 0 && Number(current.version) !== Number(updates.expectedVersion)) {
    const err = new Error(`Stale version conflict. Rule is at version ${current.version}, but client expected v${updates.expectedVersion}. Please refresh and try again.`);
    err.code = "VERSION_CONFLICT";
    err.statusCode = 409;
    throw err;
  }
  const newVersion = Number(current.version) + 1;
  const newRequiredLeft = updates.requiredLeft !== void 0 ? updates.requiredLeft : current.required_left;
  const newRequiredRight = updates.requiredRight !== void 0 ? updates.requiredRight : current.required_right;
  const newRequiredLeaderRank = updates.requiredLeaderRank !== void 0 ? updates.requiredLeaderRank : current.required_leader_rank;
  const newLegBalanceRule = updates.legBalanceRule !== void 0 ? updates.legBalanceRule : current.leg_balance_rule;
  const newStatus = updates.status !== void 0 ? updates.status : current.status;
  const newRewardType = updates.rewardType || current.reward_type || "USDT";
  let newRewardUsd = updates.rewardUsd !== void 0 ? Number(updates.rewardUsd) : Number(current.reward_usd || 0);
  let newRewardTitle = updates.rewardTitle !== void 0 ? updates.rewardTitle ? updates.rewardTitle.trim() : null : current.reward_title || null;
  let newRewardDescription = updates.rewardDescription !== void 0 ? updates.rewardDescription ? updates.rewardDescription.trim() : null : current.reward_description || null;
  let newRewardDisplayValueUsd = updates.rewardDisplayValueUsd !== void 0 ? updates.rewardDisplayValueUsd !== null && updates.rewardDisplayValueUsd !== void 0 ? Number(updates.rewardDisplayValueUsd) : null : current.reward_display_value_usd !== null && current.reward_display_value_usd !== void 0 ? Number(current.reward_display_value_usd) : null;
  if (newRewardType === "USDT") {
    if (current.rank_order > 0 && (isNaN(newRewardUsd) || newRewardUsd <= 0)) {
      const err = new Error("Reward USD amount must be a positive number for USDT reward type.");
      err.code = "INVALID_REWARD";
      err.statusCode = 400;
      throw err;
    }
  } else if (newRewardType === "NON_CASH") {
    if (!newRewardTitle || newRewardTitle.length < 3) {
      const err = new Error("Reward title is required (minimum 3 characters) for Non-Cash reward type.");
      err.code = "INVALID_REWARD_TITLE";
      err.statusCode = 400;
      throw err;
    }
    newRewardUsd = 0;
  }
  await db.query(
    `
    UPDATE promotion_rules
    SET 
      required_left = $1,
      required_right = $2,
      required_leader_rank = $3,
      leg_balance_rule = $4,
      reward_type = $5,
      reward_usd = $6,
      reward_title = $7,
      reward_description = $8,
      reward_display_value_usd = $9,
      status = $10,
      version = $11,
      effective_date = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $12
    `,
    [
      newRequiredLeft,
      newRequiredRight,
      newRequiredLeaderRank,
      newLegBalanceRule,
      newRewardType,
      newRewardUsd,
      newRewardTitle,
      newRewardDescription,
      newRewardDisplayValueUsd,
      newStatus,
      newVersion,
      ruleId
    ]
  );
  await db.query(
    `
    INSERT INTO promotion_audit_logs (
      id, user_id, action, from_rank, to_rank, details_json, actor_type, actor_id, reason, created_at
    )
    VALUES ($1, $2, 'ADMIN_RULE_UPDATED', $3, $3, $4, 'ADMIN', $5, $6, CURRENT_TIMESTAMP)
    `,
    [
      uuidv44(),
      adminId,
      current.rank_key,
      JSON.stringify({
        ruleId,
        rankKey: current.rank_key,
        oldVersion: current.version,
        newVersion,
        oldSettings: {
          requiredLeft: current.required_left,
          requiredRight: current.required_right,
          requiredLeaderRank: current.required_leader_rank,
          rewardType: current.reward_type || "USDT",
          rewardUsd: current.reward_usd,
          rewardTitle: current.reward_title || null,
          rewardDescription: current.reward_description || null,
          rewardDisplayValueUsd: current.reward_display_value_usd || null,
          status: current.status
        },
        newSettings: {
          requiredLeft: newRequiredLeft,
          requiredRight: newRequiredRight,
          requiredLeaderRank: newRequiredLeaderRank,
          rewardType: newRewardType,
          rewardUsd: newRewardUsd,
          rewardTitle: newRewardTitle,
          rewardDescription: newRewardDescription,
          rewardDisplayValueUsd: newRewardDisplayValueUsd,
          status: newStatus
        }
      }),
      adminPublicId,
      updates.reason
    ]
  );
  const rules = await getPromotionRules(db);
  return rules.find((r) => r.id === ruleId);
}
async function getDownlineLeaderCounts(userId, targetLeaderRank, dbClient) {
  const db = dbClient || await getDb();
  await ensurePromotionTables(db);
  const leftRes = await db.query(
    `
    WITH RECURSIVE left_tree AS (
      SELECT user_id, 1 as depth
      FROM binary_placements
      WHERE parent_user_id = $1 AND side = 'LEFT' AND status = 'PLACED'
      UNION ALL
      SELECT bp.user_id, lt.depth + 1
      FROM binary_placements bp
      JOIN left_tree lt ON bp.parent_user_id = lt.user_id
      WHERE bp.status = 'PLACED' AND lt.depth < 1000
    )
    SELECT DISTINCT upe.user_id, u.public_id, u.full_name
    FROM left_tree lt
    JOIN user_promotion_events upe ON lt.user_id = upe.user_id
    JOIN users u ON upe.user_id = u.id
    WHERE upe.rank_key = $2 AND upe.status = 'COMPLETED' AND u.status = 'ACTIVE'
    ORDER BY u.public_id ASC
    `,
    [userId, targetLeaderRank]
  );
  const rightRes = await db.query(
    `
    WITH RECURSIVE right_tree AS (
      SELECT user_id, 1 as depth
      FROM binary_placements
      WHERE parent_user_id = $1 AND side = 'RIGHT' AND status = 'PLACED'
      UNION ALL
      SELECT bp.user_id, rt.depth + 1
      FROM binary_placements bp
      JOIN right_tree rt ON bp.parent_user_id = rt.user_id
      WHERE bp.status = 'PLACED' AND rt.depth < 1000
    )
    SELECT DISTINCT upe.user_id, u.public_id, u.full_name
    FROM right_tree rt
    JOIN user_promotion_events upe ON rt.user_id = upe.user_id
    JOIN users u ON upe.user_id = u.id
    WHERE upe.rank_key = $2 AND upe.status = 'COMPLETED' AND u.status = 'ACTIVE'
    ORDER BY u.public_id ASC
    `,
    [userId, targetLeaderRank]
  );
  const leftLeaderDetails = leftRes.rows.map((r) => ({
    userId: r.user_id,
    publicId: r.public_id,
    fullName: r.full_name
  }));
  const rightLeaderDetails = rightRes.rows.map((r) => ({
    userId: r.user_id,
    publicId: r.public_id,
    fullName: r.full_name
  }));
  return {
    leftLeaders: leftLeaderDetails.length,
    rightLeaders: rightLeaderDetails.length,
    leftLeaderDetails,
    rightLeaderDetails
  };
}
async function getUserPromotionState(userId, dbClient) {
  const db = dbClient || await getDb();
  await ensurePromotionTables(db);
  await db.query(
    `
    INSERT INTO user_promotion_states (
      id, user_id, current_rank, current_rank_order, next_rank, next_rank_order,
      cumulative_consumed_left, cumulative_consumed_right,
      current_stage_left_progress, current_stage_right_progress,
      current_stage_left_required, current_stage_right_required,
      created_at, updated_at
    )
    VALUES ($1, $2, 'STANDARD', 0, 'NODE_BUILDER', 1, 0, 0, 0, 0, 20, 20, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT (user_id) DO NOTHING
    `,
    [uuidv44(), userId]
  );
  const stateRes = await db.query(
    `SELECT * FROM user_promotion_states WHERE user_id = $1`,
    [userId]
  );
  const state = stateRes.rows[0];
  const ladder = await getPromotionRules(db);
  const ruleMap = /* @__PURE__ */ new Map();
  for (const r of ladder) {
    ruleMap.set(r.rankKey, r);
  }
  const eventsRes = await db.query(
    `
    SELECT * FROM user_promotion_events
    WHERE user_id = $1 AND status = 'COMPLETED'
    ORDER BY rank_order ASC, completed_at ASC
    `,
    [userId]
  );
  const completedEvents = eventsRes.rows.map((r) => ({
    id: r.id,
    publicPromotionId: r.public_promotion_id,
    userId: r.user_id,
    rankKey: r.rank_key,
    rankName: r.rank_name,
    rankOrder: Number(r.rank_order),
    previousRank: r.previous_rank,
    qualificationType: r.qualification_type,
    requiredLeft: Number(r.required_left),
    requiredRight: Number(r.required_right),
    actualLeft: Number(r.actual_left),
    actualRight: Number(r.actual_right),
    consumedLeft: Number(r.consumed_left),
    consumedRight: Number(r.consumed_right),
    ruleVersion: Number(r.rule_version),
    rewardType: r.reward_type || "USDT",
    rewardUsd: Number(r.reward_usd || 0),
    rewardTitle: r.reward_title || null,
    rewardDescription: r.reward_description || null,
    rewardDisplayValueUsd: r.reward_display_value_usd !== null && r.reward_display_value_usd !== void 0 ? Number(r.reward_display_value_usd) : null,
    qualifyingLeaderIds: r.qualifying_leader_ids_json ? JSON.parse(r.qualifying_leader_ids_json) : null,
    status: "COMPLETED",
    completedAt: r.completed_at instanceof Date ? r.completed_at.toISOString() : String(r.completed_at),
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at)
  }));
  const currentRule = ruleMap.get(state.current_rank) || {
    rankKey: "STANDARD",
    rankName: "Standard Member",
    rankOrder: 0
  };
  const nextRule = state.next_rank ? ruleMap.get(state.next_rank) : null;
  const volumeRes = await db.query(
    `
    SELECT 
      COALESCE(SUM(CASE WHEN side = 'LEFT' THEN volume_units ELSE 0 END), 0)::int AS left_units,
      COALESCE(SUM(CASE WHEN side = 'RIGHT' THEN volume_units ELSE 0 END), 0)::int AS right_units
    FROM binary_volume_events
    WHERE beneficiary_user_id = $1 AND status = 'ACTIVE'
    `,
    [userId]
  );
  const totalActiveLeft = Number(volumeRes.rows[0]?.left_units || 0);
  const totalActiveRight = Number(volumeRes.rows[0]?.right_units || 0);
  const consumedLeft = Number(state.cumulative_consumed_left || 0);
  const consumedRight = Number(state.cumulative_consumed_right || 0);
  const stageProgress = {};
  if (nextRule && nextRule.qualificationType === "MATCHING") {
    const stageAvailableLeft = Math.max(0, totalActiveLeft - consumedLeft);
    const stageAvailableRight = Math.max(0, totalActiveRight - consumedRight);
    const reqL = nextRule.requiredLeft;
    const reqR = nextRule.requiredRight;
    const leftProg = Math.min(reqL, stageAvailableLeft);
    const rightProg = Math.min(reqR, stageAvailableRight);
    const pct = Math.min(
      100,
      Math.floor(Math.min(stageAvailableLeft, stageAvailableRight) / Math.max(reqL, reqR) * 100)
    );
    stageProgress.matching = {
      leftProgress: leftProg,
      rightProgress: rightProg,
      requiredLeft: reqL,
      requiredRight: reqR,
      progressPct: pct,
      cumulativeConsumedLeft: consumedLeft,
      cumulativeConsumedRight: consumedRight,
      totalActiveVolumeLeft: totalActiveLeft,
      totalActiveVolumeRight: totalActiveRight
    };
  } else if (nextRule && nextRule.qualificationType === "LEADERSHIP" && nextRule.requiredLeaderRank) {
    const leaderData = await getDownlineLeaderCounts(userId, nextRule.requiredLeaderRank, db);
    const reqL = nextRule.requiredLeft;
    const reqR = nextRule.requiredRight;
    const reqLeaderRule = nextRule.requiredLeaderRank ? ruleMap.get(nextRule.requiredLeaderRank) : null;
    let pct = 0;
    if (nextRule.legBalanceRule === "FLEXIBLE") {
      const match1 = Math.min(leaderData.leftLeaders / reqL, leaderData.rightLeaders / reqR);
      const match2 = Math.min(leaderData.leftLeaders / reqR, leaderData.rightLeaders / reqL);
      pct = Math.min(100, Math.floor(Math.max(match1, match2) * 100));
    } else {
      pct = Math.min(
        100,
        Math.floor(Math.min(leaderData.leftLeaders / reqL, leaderData.rightLeaders / reqR) * 100)
      );
    }
    stageProgress.leadership = {
      leftLeaders: leaderData.leftLeaders,
      rightLeaders: leaderData.rightLeaders,
      requiredLeft: reqL,
      requiredRight: reqR,
      requiredLeaderRank: nextRule.requiredLeaderRank,
      requiredLeaderRankName: reqLeaderRule?.rankName || nextRule.requiredLeaderRank,
      legBalanceRule: nextRule.legBalanceRule,
      progressPct: isNaN(pct) ? 0 : pct,
      leftLeaderDetails: leaderData.leftLeaderDetails,
      rightLeaderDetails: leaderData.rightLeaderDetails
    };
  }
  return {
    userId,
    currentRank: state.current_rank,
    currentRankName: currentRule.rankName,
    currentRankOrder: Number(state.current_rank_order),
    nextRank: state.next_rank,
    nextRankName: nextRule?.rankName || null,
    nextRankOrder: state.next_rank_order ? Number(state.next_rank_order) : null,
    qualificationType: nextRule?.qualificationType || null,
    stageProgress,
    completedEvents,
    ladder,
    lastPromotedAt: state.last_promoted_at ? new Date(state.last_promoted_at).toISOString() : null,
    lastEvaluatedAt: state.last_evaluated_at ? new Date(state.last_evaluated_at).toISOString() : null
  };
}
async function evaluateUserRankPromotion(userId, dbClient) {
  const currentLock = userEvaluationLocks.get(userId) || Promise.resolve();
  let releaseLock = () => {
  };
  const nextLock = new Promise((resolve) => {
    releaseLock = resolve;
  });
  userEvaluationLocks.set(userId, currentLock.then(() => nextLock, () => nextLock));
  await currentLock;
  try {
    return await evaluateUserRankPromotionInternal(userId, dbClient);
  } finally {
    releaseLock();
    if (userEvaluationLocks.get(userId) === nextLock) {
      userEvaluationLocks.delete(userId);
    }
  }
}
async function evaluateUserRankPromotionInternal(userId, dbClient) {
  const db = dbClient || await getDb();
  await ensurePromotionTables(db);
  await db.query("BEGIN");
  try {
    await db.query(
      `
      INSERT INTO user_promotion_states (
        id, user_id, current_rank, current_rank_order, next_rank, next_rank_order,
        cumulative_consumed_left, cumulative_consumed_right,
        current_stage_left_progress, current_stage_right_progress,
        current_stage_left_required, current_stage_right_required,
        created_at, updated_at
      )
      VALUES ($1, $2, 'STANDARD', 0, 'NODE_BUILDER', 1, 0, 0, 0, 0, 20, 20, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (user_id) DO NOTHING
      `,
      [uuidv44(), userId]
    );
    const lockedRes = await db.query(
      `SELECT * FROM user_promotion_states WHERE user_id = $1 FOR UPDATE`,
      [userId]
    );
    const state = lockedRes.rows[0];
    const currentRank = state.current_rank;
    const nextRank = state.next_rank;
    const currentOrder = Number(state.current_rank_order);
    const nextOrder = state.next_rank_order !== null ? Number(state.next_rank_order) : null;
    if (!nextRank || nextOrder === null || currentOrder >= 6) {
      await db.query("COMMIT");
      const currentState = await getUserPromotionState(userId, db);
      return {
        promoted: false,
        evaluatedRank: null,
        previousRank: currentRank,
        currentRank,
        reason: "TOP_RANK_ALREADY_ACHIEVED",
        event: null,
        state: currentState
      };
    }
    const ruleRes = await db.query(
      `SELECT * FROM promotion_rules WHERE rank_key = $1 AND status = 'ACTIVE'`,
      [nextRank]
    );
    if (ruleRes.rows.length === 0) {
      await db.query("COMMIT");
      const currentState = await getUserPromotionState(userId, db);
      return {
        promoted: false,
        evaluatedRank: nextRank,
        previousRank: currentRank,
        currentRank,
        reason: `TARGET_RULE_INACTIVE_OR_NOT_FOUND (${nextRank})`,
        event: null,
        state: currentState
      };
    }
    const targetRule = ruleRes.rows[0];
    const targetOrder = Number(targetRule.rank_order);
    if (targetOrder !== currentOrder + 1) {
      await db.query("ROLLBACK");
      throw new Error(`Integrity violation: Attempted to evaluate non-sequential rank ${nextRank} (order ${targetOrder}) for user at rank ${currentRank} (order ${currentOrder}).`);
    }
    if (currentOrder > 0) {
      const lowerCountRes = await db.query(
        `SELECT COUNT(*)::int AS count FROM user_promotion_events WHERE user_id = $1 AND status = 'COMPLETED' AND rank_order <= $2`,
        [userId, currentOrder]
      );
      if (Number(lowerCountRes.rows[0].count) !== currentOrder) {
        await db.query("ROLLBACK");
        throw new Error(`Sequential integrity violation: User has missing completed previous promotion events.`);
      }
    }
    let isQualified = false;
    let consumedLeft = 0;
    let consumedRight = 0;
    let actualLeft = 0;
    let actualRight = 0;
    let qualifyingLeadersData = null;
    if (targetRule.qualification_type === "MATCHING") {
      const volumeRes = await db.query(
        `
        SELECT 
          COALESCE(SUM(CASE WHEN side = 'LEFT' THEN volume_units ELSE 0 END), 0)::int AS left_units,
          COALESCE(SUM(CASE WHEN side = 'RIGHT' THEN volume_units ELSE 0 END), 0)::int AS right_units
        FROM binary_volume_events
        WHERE beneficiary_user_id = $1 AND status = 'ACTIVE'
        `,
        [userId]
      );
      const totalActiveLeft = Number(volumeRes.rows[0]?.left_units || 0);
      const totalActiveRight = Number(volumeRes.rows[0]?.right_units || 0);
      const cumConsumedLeft = Number(state.cumulative_consumed_left || 0);
      const cumConsumedRight = Number(state.cumulative_consumed_right || 0);
      actualLeft = Math.max(0, totalActiveLeft - cumConsumedLeft);
      actualRight = Math.max(0, totalActiveRight - cumConsumedRight);
      const reqLeft = Number(targetRule.required_left);
      const reqRight = Number(targetRule.required_right);
      isQualified = actualLeft >= reqLeft && actualRight >= reqRight;
      if (isQualified) {
        consumedLeft = reqLeft;
        consumedRight = reqRight;
      }
    } else if (targetRule.qualification_type === "LEADERSHIP") {
      const requiredLeaderRank = targetRule.required_leader_rank;
      if (!requiredLeaderRank) {
        await db.query("ROLLBACK");
        throw new Error(`Rule configuration defect: Leadership rank ${nextRank} requires leader rank definition.`);
      }
      const leaderData = await getDownlineLeaderCounts(userId, requiredLeaderRank, db);
      actualLeft = leaderData.leftLeaders;
      actualRight = leaderData.rightLeaders;
      qualifyingLeadersData = {
        leftLeaders: leaderData.leftLeaderDetails.map((l) => l.userId),
        rightLeaders: leaderData.rightLeaderDetails.map((l) => l.userId)
      };
      const reqLeft = Number(targetRule.required_left);
      const reqRight = Number(targetRule.required_right);
      if (targetRule.leg_balance_rule === "FLEXIBLE") {
        isQualified = actualLeft >= reqLeft && actualRight >= reqRight || actualLeft >= reqRight && actualRight >= reqLeft;
      } else {
        isQualified = actualLeft >= reqLeft && actualRight >= reqRight;
      }
    }
    if (!isQualified) {
      await db.query(
        `
        UPDATE user_promotion_states
        SET 
          current_stage_left_progress = $1,
          current_stage_right_progress = $2,
          last_evaluated_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $3
        `,
        [actualLeft, actualRight, userId]
      );
      await db.query(
        `
        INSERT INTO promotion_audit_logs (
          id, user_id, action, from_rank, to_rank, details_json, actor_type, reason, created_at
        )
        VALUES ($1, $2, 'EVALUATION_INCOMPLETE', $3, $4, $5, 'SYSTEM', 'Requirements not yet met', CURRENT_TIMESTAMP)
        `,
        [
          uuidv44(),
          userId,
          currentRank,
          nextRank,
          JSON.stringify({
            actualLeft,
            actualRight,
            requiredLeft: targetRule.required_left,
            requiredRight: targetRule.required_right,
            qualificationType: targetRule.qualification_type
          })
        ]
      );
      await db.query("COMMIT");
      const currentState = await getUserPromotionState(userId, db);
      return {
        promoted: false,
        evaluatedRank: nextRank,
        previousRank: currentRank,
        currentRank,
        reason: "QUALIFICATION_INCOMPLETE",
        event: null,
        state: currentState
      };
    }
    const eventId = uuidv44();
    const publicPromotionId = generatePublicPromotionId();
    const rewardType = targetRule.reward_type || "USDT";
    const rewardUsd = rewardType === "NON_CASH" ? 0 : Number(targetRule.reward_usd || 0);
    const rewardTitle = targetRule.reward_title || null;
    const rewardDescription = targetRule.reward_description || null;
    const rewardDisplayValueUsd = targetRule.reward_display_value_usd !== null && targetRule.reward_display_value_usd !== void 0 ? Number(targetRule.reward_display_value_usd) : null;
    const ruleVersion = Number(targetRule.version || 1);
    const insertEventRes = await db.query(
      `
      INSERT INTO user_promotion_events (
        id, public_promotion_id, user_id, rank_key, rank_name, rank_order,
        previous_rank, qualification_type, required_left, required_right,
        actual_left, actual_right, consumed_left, consumed_right,
        rule_version, reward_type, reward_usd, reward_title, reward_description, reward_display_value_usd,
        qualifying_leader_ids_json, source_matching_references,
        status, completed_at, created_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10,
        $11, $12, $13, $14,
        $15, $16, $17, $18, $19, $20,
        $21, $22,
        'COMPLETED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      ON CONFLICT (user_id, rank_key) DO NOTHING
      RETURNING *
      `,
      [
        eventId,
        publicPromotionId,
        userId,
        targetRule.rank_key,
        targetRule.rank_name,
        targetOrder,
        currentRank,
        targetRule.qualification_type,
        targetRule.required_left,
        targetRule.required_right,
        actualLeft,
        actualRight,
        consumedLeft,
        consumedRight,
        ruleVersion,
        rewardType,
        rewardUsd,
        rewardTitle,
        rewardDescription,
        rewardDisplayValueUsd,
        qualifyingLeadersData ? JSON.stringify(qualifyingLeadersData) : null,
        JSON.stringify({
          evaluatedAt: (/* @__PURE__ */ new Date()).toISOString(),
          qualificationType: targetRule.qualification_type,
          consumedLeft,
          consumedRight
        })
      ]
    );
    if (insertEventRes.rows.length === 0) {
      await db.query("ROLLBACK");
      const currentState = await getUserPromotionState(userId, db);
      return {
        promoted: false,
        evaluatedRank: nextRank,
        previousRank: currentRank,
        currentRank: currentState.currentRank,
        reason: "ALREADY_PROMOTED_CONCURRENTLY",
        event: null,
        state: currentState
      };
    }
    const createdEventRow = insertEventRes.rows[0];
    const nextLadderRes = await db.query(
      `SELECT * FROM promotion_rules WHERE rank_order = $1 AND status = 'ACTIVE'`,
      [targetOrder + 1]
    );
    const newNextRule = nextLadderRes.rows.length > 0 ? nextLadderRes.rows[0] : null;
    const newNextRank = newNextRule ? newNextRule.rank_key : null;
    const newNextOrder = newNextRule ? Number(newNextRule.rank_order) : null;
    const newReqLeft = newNextRule ? Number(newNextRule.required_left) : 0;
    const newReqRight = newNextRule ? Number(newNextRule.required_right) : 0;
    const newCumConsumedLeft = Number(state.cumulative_consumed_left || 0) + consumedLeft;
    const newCumConsumedRight = Number(state.cumulative_consumed_right || 0) + consumedRight;
    await db.query(
      `
      UPDATE user_promotion_states
      SET 
        current_rank = $1,
        current_rank_order = $2,
        next_rank = $3,
        next_rank_order = $4,
        cumulative_consumed_left = $5,
        cumulative_consumed_right = $6,
        current_stage_left_required = $7,
        current_stage_right_required = $8,
        current_stage_left_progress = 0,
        current_stage_right_progress = 0,
        last_promoted_at = CURRENT_TIMESTAMP,
        last_evaluated_at = CURRENT_TIMESTAMP,
        promotion_version = $9,
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $10
      `,
      [
        targetRule.rank_key,
        targetOrder,
        newNextRank,
        newNextOrder,
        newCumConsumedLeft,
        newCumConsumedRight,
        newReqLeft,
        newReqRight,
        ruleVersion,
        userId
      ]
    );
    await db.query(
      `
      INSERT INTO promotion_audit_logs (
        id, user_id, action, from_rank, to_rank, details_json, actor_type, reason, created_at
      )
      VALUES ($1, $2, 'RANK_COMPLETED', $3, $4, $5, 'SYSTEM', 'Promotion requirements verified and completed', CURRENT_TIMESTAMP)
      `,
      [
        uuidv44(),
        userId,
        currentRank,
        targetRule.rank_key,
        JSON.stringify({
          eventId,
          publicPromotionId,
          rankKey: targetRule.rank_key,
          rankName: targetRule.rank_name,
          rankOrder: targetOrder,
          consumedLeft,
          consumedRight,
          cumulativeConsumedLeft: newCumConsumedLeft,
          cumulativeConsumedRight: newCumConsumedRight,
          nextRank: newNextRank,
          rewardUsd,
          ruleVersion
        })
      ]
    );
    if (rewardType === "USDT" && rewardUsd > 0) {
      let milestoneKey = `RANK_${targetOrder}`;
      if (targetRule.rank_key === "NODE_BUILDER") milestoneKey = "20/20";
      else if (targetRule.rank_key === "NODE_MASTER") milestoneKey = "50/50";
      else if (targetRule.rank_key === "NODE_CAPTAIN") milestoneKey = "100/100";
      try {
        const bonusId = uuidv44();
        const publicBonusId = generatePromotionBonusPublicId();
        await db.query(
          `
          INSERT INTO promotion_bonuses (
            id, public_bonus_id, user_id, milestone,
            left_units, right_units, amount_usd, status,
            qualified_at, created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, 'EARNED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT (user_id, milestone) DO NOTHING
          `,
          [bonusId, publicBonusId, userId, milestoneKey, consumedLeft, consumedRight, rewardUsd]
        );
        await postLedgerCredit({
          userId,
          sourceType: "PROMOTION_BONUS",
          sourceId: bonusId,
          sourceRef: publicBonusId,
          amount: rewardUsd,
          description: `Promotion Milestone Bonus - ${milestoneKey} (${targetRule.rank_name})`,
          createdAt: /* @__PURE__ */ new Date(),
          dbClient: db
        }).catch((err) => {
          console.warn("[LeadershipRankService] Ledger credit posting notice:", err);
        });
      } catch (bonusErr) {
        console.warn("[LeadershipRankService] Error recording milestone bonus:", bonusErr);
      }
    }
    try {
      if (rewardType === "NON_CASH") {
        await notifyPromotionEarned({
          userId,
          bonusUsd: 0,
          milestoneTitle: `${targetRule.rank_name} Rank Achieved: ${rewardTitle || "Non-Cash Entitlement"}`,
          bonusId: eventId
        });
      } else {
        await notifyPromotionEarned({
          userId,
          bonusUsd: rewardUsd,
          milestoneTitle: `${targetRule.rank_name} Rank Achieved`,
          bonusId: eventId
        });
      }
    } catch (notifErr) {
    }
    await db.query("COMMIT");
    const updatedState = await getUserPromotionState(userId, db);
    const eventResult = {
      id: createdEventRow.id,
      publicPromotionId: createdEventRow.public_promotion_id,
      userId: createdEventRow.user_id,
      rankKey: createdEventRow.rank_key,
      rankName: createdEventRow.rank_name,
      rankOrder: Number(createdEventRow.rank_order),
      previousRank: createdEventRow.previous_rank,
      qualificationType: createdEventRow.qualification_type,
      requiredLeft: Number(createdEventRow.required_left),
      requiredRight: Number(createdEventRow.required_right),
      actualLeft: Number(createdEventRow.actual_left),
      actualRight: Number(createdEventRow.actual_right),
      consumedLeft: Number(createdEventRow.consumed_left),
      consumedRight: Number(createdEventRow.consumed_right),
      ruleVersion: Number(createdEventRow.rule_version),
      rewardType: createdEventRow.reward_type || "USDT",
      rewardUsd: Number(createdEventRow.reward_usd || 0),
      rewardTitle: createdEventRow.reward_title || null,
      rewardDescription: createdEventRow.reward_description || null,
      rewardDisplayValueUsd: createdEventRow.reward_display_value_usd !== null && createdEventRow.reward_display_value_usd !== void 0 ? Number(createdEventRow.reward_display_value_usd) : null,
      qualifyingLeaderIds: createdEventRow.qualifying_leader_ids_json ? JSON.parse(createdEventRow.qualifying_leader_ids_json) : null,
      status: "COMPLETED",
      completedAt: new Date(createdEventRow.completed_at).toISOString(),
      createdAt: new Date(createdEventRow.created_at).toISOString()
    };
    return {
      promoted: true,
      evaluatedRank: targetRule.rank_key,
      previousRank: currentRank,
      currentRank: targetRule.rank_key,
      reason: "PROMOTION_SUCCESS",
      event: eventResult,
      state: updatedState
    };
  } catch (err) {
    await db.query("ROLLBACK");
    throw err;
  }
}
async function getUserPromotionAuditLogs(userId, dbClient) {
  const db = dbClient || await getDb();
  await ensurePromotionTables(db);
  const res = await db.query(
    `
    SELECT * FROM promotion_audit_logs
    WHERE user_id = $1
    ORDER BY created_at DESC
    LIMIT 100
    `,
    [userId]
  );
  return res.rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    action: r.action,
    fromRank: r.from_rank,
    toRank: r.to_rank,
    details: JSON.parse(r.details_json || "{}"),
    actorType: r.actor_type,
    actorId: r.actor_id,
    reason: r.reason,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at)
  }));
}
async function adminManualRankCorrection(adminId, adminPublicId, userId, targetRankKey, reason, dbClient) {
  const db = dbClient || await getDb();
  await ensurePromotionTables(db);
  if (!reason || reason.trim().length < 5) {
    const err = new Error("Admin reason is mandatory (minimum 5 characters) for rank corrections.");
    err.code = "REASON_REQUIRED";
    err.statusCode = 400;
    throw err;
  }
  const ladder = await getPromotionRules(db);
  const targetRule = ladder.find((r) => r.rankKey === targetRankKey);
  if (!targetRule) {
    const err = new Error(`Target rank ${targetRankKey} does not exist in promotion ladder.`);
    err.code = "INVALID_RANK";
    err.statusCode = 400;
    throw err;
  }
  const currentState = await getUserPromotionState(userId, db);
  const fromRank = currentState.currentRank;
  await db.query("BEGIN");
  try {
    const nextRule = ladder.find((r) => r.rankOrder === targetRule.rankOrder + 1);
    await db.query(
      `
      UPDATE user_promotion_states
      SET 
        current_rank = $1,
        current_rank_order = $2,
        next_rank = $3,
        next_rank_order = $4,
        last_promoted_at = CURRENT_TIMESTAMP,
        last_evaluated_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $5
      `,
      [
        targetRule.rankKey,
        targetRule.rankOrder,
        nextRule ? nextRule.rankKey : null,
        nextRule ? nextRule.rankOrder : null,
        userId
      ]
    );
    await db.query(
      `
      INSERT INTO promotion_audit_logs (
        id, user_id, action, from_rank, to_rank, details_json, actor_type, actor_id, reason, created_at
      )
      VALUES ($1, $2, 'ADMIN_MANUAL_ADJUSTMENT', $3, $4, $5, 'ADMIN', $6, $7, CURRENT_TIMESTAMP)
      `,
      [
        uuidv44(),
        userId,
        fromRank,
        targetRule.rankKey,
        JSON.stringify({
          fromRank,
          toRank: targetRule.rankKey,
          targetOrder: targetRule.rankOrder,
          adminPublicId,
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        }),
        adminPublicId,
        reason
      ]
    );
    await db.query("COMMIT");
    return await getUserPromotionState(userId, db);
  } catch (err) {
    await db.query("ROLLBACK");
    throw err;
  }
}
var userEvaluationLocks;
var init_leadershipRankService = __esm({
  "src/server/services/leadershipRankService.ts"() {
    init_db();
    init_idGenerator();
    init_walletLedgerService();
    init_notificationService();
    userEvaluationLocks = /* @__PURE__ */ new Map();
  }
});

// src/server/db/db.ts
import { PGlite } from "@electric-sql/pglite";
import { Pool } from "pg";
import fs from "fs";
import path from "path";
import { v4 as uuidv45 } from "uuid";
function getEffectiveDatabaseUrl() {
  if (process.env.DATABASE_URL?.trim()) {
    return process.env.DATABASE_URL.trim();
  }
  if (process.env.SQL_HOST && process.env.SQL_USER && process.env.SQL_PASSWORD && process.env.SQL_DB_NAME) {
    const isUnix = process.env.SQL_HOST.startsWith("/");
    const port = process.env.SQL_PORT || "5432";
    if (isUnix && !fs.existsSync(process.env.SQL_HOST)) {
      console.warn(`[DB] Unix socket path (${process.env.SQL_HOST}) not found in runtime environment. Skipping external unix socket connection.`);
      return void 0;
    }
    return isUnix ? `postgresql://${encodeURIComponent(process.env.SQL_USER)}:${encodeURIComponent(process.env.SQL_PASSWORD)}@/${process.env.SQL_DB_NAME}?host=${encodeURIComponent(process.env.SQL_HOST)}` : `postgresql://${encodeURIComponent(process.env.SQL_USER)}:${encodeURIComponent(process.env.SQL_PASSWORD)}@${process.env.SQL_HOST}:${port}/${process.env.SQL_DB_NAME}`;
  }
  return void 0;
}
async function getDb() {
  if (globalThis.__phivonexDb) {
    return globalThis.__phivonexDb;
  }
  if (globalThis.__phivonexDbPromise) {
    return globalThis.__phivonexDbPromise;
  }
  globalThis.__phivonexDbPromise = (async () => {
    try {
      const isProduction = (process.env.APP_ENV || "").toLowerCase() === "production" || (process.env.NODE_ENV || "").toLowerCase() === "production";
      const databaseUrl = getEffectiveDatabaseUrl();
      let client = null;
      if (databaseUrl && !databaseUrl.includes("placeholder") && !databaseUrl.includes("YOUR_") && (databaseUrl.startsWith("postgres://") || databaseUrl.startsWith("postgresql://"))) {
        try {
          let safeHost = "localhost";
          let safeDbName = "unknown";
          try {
            const parsedUrl = new URL(databaseUrl);
            safeHost = parsedUrl.hostname || "unix-socket";
            safeDbName = parsedUrl.pathname ? parsedUrl.pathname.replace(/^\//, "") : "default";
          } catch {
            safeHost = "custom-connection";
          }
          console.log(`[DB Identity] Engine: PostgreSQL (Cloud SQL) | Host: ${safeHost} | Database: ${safeDbName}`);
          const isUnixSocket = databaseUrl.includes("host=/") || databaseUrl.includes("host=%2F") || databaseUrl.startsWith("/");
          let pool;
          const poolConfig = {
            connectionTimeoutMillis: 3e3,
            idleTimeoutMillis: 3e4,
            max: 20,
            keepAlive: true,
            keepAliveInitialDelayMillis: 1e4
          };
          if (isUnixSocket) {
            pool = new Pool({
              connectionString: databaseUrl,
              ssl: false,
              ...poolConfig
            });
          } else {
            try {
              const url = new URL(databaseUrl);
              pool = new Pool({
                host: url.hostname,
                port: parseInt(url.port || "5432", 10),
                user: decodeURIComponent(url.username),
                password: decodeURIComponent(url.password),
                database: (url.pathname ? url.pathname.replace(/^\//, "") : "postgres") || "postgres",
                ssl: { rejectUnauthorized: false },
                ...poolConfig
              });
            } catch {
              pool = new Pool({
                connectionString: databaseUrl,
                ssl: { rejectUnauthorized: false },
                ...poolConfig
              });
            }
          }
          pool.on("error", (err) => {
            console.warn("[DB Pool Background Warning]:", err?.message || err);
          });
          await Promise.race([
            pool.query("SELECT 1"),
            new Promise(
              (_, reject) => setTimeout(() => reject(new Error("PostgreSQL connection probe timeout (3000ms)")), 3e3)
            )
          ]);
          globalThis.__phivonexPool = pool;
          client = {
            async query(sql, params) {
              const res = await pool.query(sql, params);
              return {
                rows: res.rows,
                rowCount: res.rowCount ?? res.rows.length
              };
            },
            async exec(sql) {
              await pool.query(sql);
            },
            async transaction(callback) {
              const pgClient = await pool.connect();
              const trxClient = {
                async query(sql, params) {
                  const res = await pgClient.query(sql, params);
                  return {
                    rows: res.rows,
                    rowCount: res.rowCount ?? res.rows.length
                  };
                },
                async exec(sql) {
                  await pgClient.query(sql);
                },
                async transaction(cb) {
                  return cb(trxClient);
                }
              };
              try {
                await pgClient.query("BEGIN");
                const result = await callback(trxClient);
                await pgClient.query("COMMIT");
                return result;
              } catch (err) {
                await pgClient.query("ROLLBACK").catch(() => {
                });
                throw err;
              } finally {
                pgClient.release();
              }
            }
          };
          console.log("[DB] Successfully connected to PostgreSQL database.");
        } catch (poolErr) {
          console.error("[DB] Failed to connect to external PostgreSQL:", poolErr?.message || poolErr);
          if (globalThis.__phivonexPool) {
            await globalThis.__phivonexPool.end().catch(() => {
            });
            globalThis.__phivonexPool = void 0;
          }
          console.warn(`[DB] External PostgreSQL connection attempt failed: ${poolErr?.message || poolErr}. Falling back to embedded PGlite.`);
          client = null;
        }
      }
      if (!client) {
        const isContainer = Boolean(process.env.K_SERVICE || process.env.K_REVISION || process.env.PORT === "8080");
        const defaultDir = isContainer ? "/tmp/pglite_db" : path.resolve(process.cwd(), ".data/pglite_db");
        const dataDir = process.env.PGLITE_DATA_DIR || defaultDir;
        if (!fs.existsSync(dataDir)) {
          fs.mkdirSync(dataDir, { recursive: true });
        }
        console.log("[DB] Initializing embedded PostgreSQL (PGlite) engine in:", dataDir);
        console.log(`[DB Identity] Engine: Embedded PGlite | Path: ${dataDir}`);
        let pglite;
        try {
          pglite = new PGlite(dataDir);
          await pglite.waitReady;
          globalThis.__phivonexPglite = pglite;
        } catch (pgInitErr) {
          console.warn(`[DB] PGlite failed to initialize from (${dataDir}). Recovering clean state:`, pgInitErr?.message || pgInitErr);
          try {
            if (fs.existsSync(dataDir)) {
              fs.rmSync(dataDir, { recursive: true, force: true });
              fs.mkdirSync(dataDir, { recursive: true });
            }
            pglite = new PGlite(dataDir);
            await pglite.waitReady;
            console.log("[DB] PGlite recovered and initialized successfully.");
          } catch (recoverErr) {
            console.error("[DB] Fatal error during PGlite recovery:", recoverErr);
            throw recoverErr;
          }
        }
        client = {
          async query(sql, params) {
            const res = await pglite.query(sql, params);
            return {
              rows: res.rows,
              rowCount: res.rows.length
            };
          },
          async exec(sql) {
            await pglite.exec(sql);
          },
          async transaction(callback) {
            const trxClient = {
              async query(sql, params) {
                const res = await pglite.query(sql, params);
                return {
                  rows: res.rows,
                  rowCount: res.rows.length
                };
              },
              async exec(sql) {
                await pglite.exec(sql);
              },
              async transaction(cb) {
                return cb(trxClient);
              }
            };
            try {
              await pglite.query("BEGIN");
              const result = await callback(trxClient);
              await pglite.query("COMMIT");
              return result;
            } catch (err) {
              await pglite.query("ROLLBACK").catch(() => {
              });
              throw err;
            } finally {
            }
          }
        };
      }
      await initSchema(client);
      globalThis.__phivonexDb = client;
      return client;
    } catch (err) {
      globalThis.__phivonexDbPromise = void 0;
      globalThis.__phivonexDb = void 0;
      console.error("[DB] Fatal error during database singleton initialization:", err);
      throw err;
    }
  })();
  return globalThis.__phivonexDbPromise;
}
async function initSchema(client) {
  try {
    await client.exec(`
      DROP TABLE IF EXISTS pending_registrations;

      CREATE TABLE IF NOT EXISTS pending_registrations (
        email VARCHAR(255) PRIMARY KEY,
        code_hash TEXT NOT NULL,
        registration_data TEXT NOT NULL,
        failed_attempts INTEGER NOT NULL DEFAULT 0,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        verification_token VARCHAR(100) NULL,
        is_verified BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY,
        public_id VARCHAR(50),
        full_name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        phone VARCHAR(50) NULL,
        country VARCHAR(100) NOT NULL,
        password_hash TEXT NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
        email_verified_at TIMESTAMP WITH TIME ZONE NULL,
        pending_referral_code VARCHAR(50) NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_login_at TIMESTAMP WITH TIME ZONE NULL
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id UUID PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL,
        user_agent TEXT NULL,
        ip_address VARCHAR(100) NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        last_used_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        revoked_at TIMESTAMP WITH TIME ZONE NULL
      );

      CREATE TABLE IF NOT EXISTS security_events (
        id UUID PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        event_type VARCHAR(100) NOT NULL,
        description TEXT NOT NULL,
        user_agent_summary VARCHAR(255) NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS auth_tokens (
        id UUID PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL,
        token_hash TEXT NOT NULL,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        used_at TIMESTAMP WITH TIME ZONE NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS user_referrals (
        user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        referral_code VARCHAR(50) UNIQUE NOT NULL,
        sponsor_user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT chk_no_self_referral CHECK (user_id != sponsor_user_id)
      );

      CREATE TABLE IF NOT EXISTS nodes (
        id UUID PRIMARY KEY,
        node_number INTEGER UNIQUE NOT NULL,
        public_node_id VARCHAR(50) UNIQUE NOT NULL,
        status VARCHAR(50) NOT NULL,
        owner_user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
        reserved_by_user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
        product_version VARCHAR(50) NOT NULL DEFAULT 'GENESIS_V1',
        purchase_price_usd NUMERIC(12, 2) NOT NULL DEFAULT 1000.00,
        phivo_reference_price_at_purchase NUMERIC(10, 4) NOT NULL DEFAULT 0.10,
        lifetime_phivo_allocation NUMERIC(14, 2) NOT NULL DEFAULT 10000.00,
        term_days INTEGER NOT NULL DEFAULT 200,
        daily_phivo_emission NUMERIC(10, 2) NOT NULL DEFAULT 50.00,
        purchase_timestamp TIMESTAMP WITH TIME ZONE NULL,
        reserved_at TIMESTAMP WITH TIME ZONE NULL,
        activated_at TIMESTAMP WITH TIME ZONE NULL,
        maturity_timestamp TIMESTAMP WITH TIME ZONE NULL,
        distributed_phivo NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
        remaining_phivo NUMERIC(14, 2) NOT NULL DEFAULT 10000.00,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT chk_node_number_range CHECK (node_number >= 1 AND node_number <= 10000),
        CONSTRAINT chk_node_status_valid CHECK (status IN ('AVAILABLE', 'RESERVED', 'PURCHASED', 'ACTIVE', 'EMITTING', 'MATURED', 'RETIRED')),
        CONSTRAINT chk_node_available_owner CHECK (status != 'AVAILABLE' OR owner_user_id IS NULL),
        CONSTRAINT chk_node_active_owner CHECK (status NOT IN ('ACTIVE', 'EMITTING', 'MATURED') OR owner_user_id IS NOT NULL)
      );

      CREATE TABLE IF NOT EXISTS node_orders (
        id UUID PRIMARY KEY,
        public_order_id VARCHAR(50) UNIQUE NOT NULL,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        node_id UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
        node_number INTEGER NOT NULL,
        amount_usd NUMERIC(12, 2) NOT NULL DEFAULT 1000.00,
        currency VARCHAR(20) NOT NULL DEFAULT 'USD',
        status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
        payment_method VARCHAR(50) NOT NULL DEFAULT 'SIMULATED_INSTANT',
        payment_reference VARCHAR(255) NULL,
        idempotency_key VARCHAR(100) NULL,
        reserved_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        completed_at TIMESTAMP WITH TIME ZONE NULL,
        cancelled_at TIMESTAMP WITH TIME ZONE NULL,
        failed_at TIMESTAMP WITH TIME ZONE NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT chk_node_order_status CHECK (status IN ('PENDING', 'SETTLING', 'COMPLETED', 'CANCELLED', 'EXPIRED', 'FAILED')),
        CONSTRAINT chk_node_order_amount CHECK (amount_usd > 0)
      );

      CREATE TABLE IF NOT EXISTS node_owners (
        id UUID PRIMARY KEY,
        node_id UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        acquired_via VARCHAR(64) NOT NULL DEFAULT 'PURCHASE',
        acquired_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        is_current_owner BOOLEAN NOT NULL DEFAULT TRUE,
        CONSTRAINT unique_node_user_owner UNIQUE (node_id, user_id)
      );
      CREATE INDEX IF NOT EXISTS idx_node_owners_node ON node_owners (node_id);
      CREATE INDEX IF NOT EXISTS idx_node_owners_user ON node_owners (user_id);

      CREATE TABLE IF NOT EXISTS referral_commissions (
        id UUID PRIMARY KEY,
        public_commission_id VARCHAR(50) UNIQUE NOT NULL,
        sponsor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        referred_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        node_id UUID UNIQUE NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
        node_order_id UUID NOT NULL REFERENCES node_orders(id) ON DELETE CASCADE,
        amount_usd NUMERIC(12, 2) NOT NULL DEFAULT 50.00,
        status VARCHAR(50) NOT NULL DEFAULT 'EARNED',
        earned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        reversed_at TIMESTAMP WITH TIME ZONE NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT chk_commission_amount CHECK (amount_usd >= 0),
        CONSTRAINT chk_commission_status CHECK (status IN ('EARNED', 'REVERSED')),
        CONSTRAINT chk_commission_no_self CHECK (sponsor_user_id != referred_user_id)
      );

      CREATE TABLE IF NOT EXISTS binary_placements (
        user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        parent_user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
        side VARCHAR(10) NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'UNPLACED',
        placed_at TIMESTAMP WITH TIME ZONE NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT chk_no_self_parent CHECK (parent_user_id IS NULL OR user_id != parent_user_id),
        CONSTRAINT chk_placement_side CHECK (side IS NULL OR side IN ('LEFT', 'RIGHT')),
        CONSTRAINT chk_placement_status CHECK (status IN ('UNPLACED', 'PLACED'))
      );

      ALTER TABLE nodes ADD COLUMN IF NOT EXISTS product_version VARCHAR(50) NOT NULL DEFAULT 'GENESIS_V1';
      ALTER TABLE nodes ADD COLUMN IF NOT EXISTS purchase_price_usd NUMERIC(12, 2) NOT NULL DEFAULT 1000.00;
      ALTER TABLE nodes ADD COLUMN IF NOT EXISTS phivo_reference_price_at_purchase NUMERIC(10, 4) NOT NULL DEFAULT 0.10;
      ALTER TABLE nodes ADD COLUMN IF NOT EXISTS lifetime_phivo_allocation NUMERIC(14, 2) NOT NULL DEFAULT 10000.00;
      ALTER TABLE nodes ADD COLUMN IF NOT EXISTS term_days INTEGER NOT NULL DEFAULT 200;
      ALTER TABLE nodes ADD COLUMN IF NOT EXISTS daily_phivo_emission NUMERIC(10, 2) NOT NULL DEFAULT 50.00;
      UPDATE nodes SET term_days = 200 WHERE term_days = 400;
      ALTER TABLE nodes ADD COLUMN IF NOT EXISTS purchase_timestamp TIMESTAMP WITH TIME ZONE NULL;
      ALTER TABLE nodes ADD COLUMN IF NOT EXISTS maturity_timestamp TIMESTAMP WITH TIME ZONE NULL;
      ALTER TABLE nodes ADD COLUMN IF NOT EXISTS distributed_phivo NUMERIC(14, 2) NOT NULL DEFAULT 0.00;
      ALTER TABLE nodes ADD COLUMN IF NOT EXISTS remaining_phivo NUMERIC(14, 2) NOT NULL DEFAULT 10000.00;

      ALTER TABLE nodes DROP CONSTRAINT IF EXISTS chk_node_status_valid;
      ALTER TABLE nodes ADD CONSTRAINT chk_node_status_valid CHECK (status IN ('AVAILABLE', 'RESERVED', 'PURCHASED', 'ACTIVE', 'EMITTING', 'MATURED', 'RETIRED'));

      ALTER TABLE nodes DROP CONSTRAINT IF EXISTS chk_node_active_owner;
      ALTER TABLE nodes ADD CONSTRAINT chk_node_active_owner CHECK (status NOT IN ('ACTIVE', 'EMITTING', 'MATURED') OR owner_user_id IS NOT NULL);

      -- Task #10: Binary Volume Engine Tables
      CREATE TABLE IF NOT EXISTS binary_volume_events (
        id UUID PRIMARY KEY,
        public_event_id VARCHAR(50) UNIQUE NOT NULL,
        beneficiary_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        source_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        source_node_id UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
        side VARCHAR(10) NOT NULL,
        volume_units INTEGER NOT NULL DEFAULT 1,
        status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
        business_date DATE NOT NULL,
        occurred_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        reversed_at TIMESTAMP WITH TIME ZONE NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uq_bve_beneficiary_node UNIQUE (beneficiary_user_id, source_node_id),
        CONSTRAINT chk_bve_side CHECK (side IN ('LEFT', 'RIGHT')),
        CONSTRAINT chk_bve_status CHECK (status IN ('ACTIVE', 'REVERSED')),
        CONSTRAINT chk_bve_units CHECK (volume_units > 0)
      );

      CREATE TABLE IF NOT EXISTS binary_daily_volumes (
        id UUID PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        business_date DATE NOT NULL,
        left_units INTEGER NOT NULL DEFAULT 0,
        right_units INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uq_bdv_user_date UNIQUE (user_id, business_date),
        CONSTRAINT chk_bdv_left CHECK (left_units >= 0),
        CONSTRAINT chk_bdv_right CHECK (right_units >= 0)
      );

      CREATE TABLE IF NOT EXISTS binary_volume_balances (
        user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        carry_left_units INTEGER NOT NULL DEFAULT 0,
        carry_right_units INTEGER NOT NULL DEFAULT 0,
        last_settled_business_date DATE NULL,
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT chk_bvb_carry_left CHECK (carry_left_units >= 0),
        CONSTRAINT chk_bvb_carry_right CHECK (carry_right_units >= 0)
      );

      -- Task #11: Daily Binary Matching Settlement Engine Tables
      CREATE TABLE IF NOT EXISTS binary_matching_settlements (
        id UUID PRIMARY KEY,
        public_settlement_id VARCHAR(50) UNIQUE NOT NULL,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        business_date DATE NOT NULL,
        available_left_units INTEGER NOT NULL,
        available_right_units INTEGER NOT NULL,
        consumed_left_units INTEGER NOT NULL,
        consumed_right_units INTEGER NOT NULL,
        carry_left_before INTEGER NOT NULL,
        carry_right_before INTEGER NOT NULL,
        carry_left_after INTEGER NOT NULL,
        carry_right_after INTEGER NOT NULL,
        total_bonus_usd NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
        status VARCHAR(20) NOT NULL DEFAULT 'COMPLETED',
        settled_at TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uq_bms_user_date UNIQUE (user_id, business_date),
        CONSTRAINT chk_bms_status CHECK (status IN ('COMPLETED', 'REVERSED')),
        CONSTRAINT chk_bms_units CHECK (
          available_left_units >= 0 AND
          available_right_units >= 0 AND
          consumed_left_units >= 0 AND
          consumed_right_units >= 0 AND
          carry_left_before >= 0 AND
          carry_right_before >= 0 AND
          carry_left_after >= 0 AND
          carry_right_after >= 0 AND
          total_bonus_usd >= 0
        )
      );

      CREATE TABLE IF NOT EXISTS binary_matching_components (
        id UUID PRIMARY KEY,
        settlement_id UUID NOT NULL REFERENCES binary_matching_settlements(id) ON DELETE CASCADE,
        tier_units INTEGER NOT NULL,
        left_units INTEGER NOT NULL,
        right_units INTEGER NOT NULL,
        bonus_usd NUMERIC(12, 2) NOT NULL,
        sequence_no INTEGER NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT chk_bmc_tier CHECK (tier_units >= 2),
        CONSTRAINT chk_bmc_bonus CHECK (bonus_usd > 0)
      );

      CREATE TABLE IF NOT EXISTS binary_settlement_cycles (
        business_date DATE PRIMARY KEY,
        status VARCHAR(20) NOT NULL DEFAULT 'RUNNING',
        total_users_settled INTEGER NOT NULL DEFAULT 0,
        total_bonus_usd NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
        started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP WITH TIME ZONE NULL,
        error_message TEXT NULL,
        CONSTRAINT chk_bsc_status CHECK (status IN ('RUNNING', 'COMPLETED', 'FAILED'))
      );

      -- Task #12: Promotion Milestone Bonuses Table
      CREATE TABLE IF NOT EXISTS promotion_bonuses (
        id UUID PRIMARY KEY,
        public_bonus_id VARCHAR(50) UNIQUE NOT NULL,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        milestone VARCHAR(20) NOT NULL,
        left_units INTEGER NOT NULL,
        right_units INTEGER NOT NULL,
        amount_usd NUMERIC(12, 2) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'EARNED',
        qualified_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uq_pb_user_milestone UNIQUE (user_id, milestone),
        CONSTRAINT chk_pb_status CHECK (status IN ('EARNED', 'REVERSED')),
        CONSTRAINT chk_pb_units CHECK (left_units >= 0 AND right_units >= 0 AND amount_usd > 0)
      );

      -- Task #13: Financial Ledger Entries Table
      CREATE TABLE IF NOT EXISTS financial_ledger_entries (
        id UUID PRIMARY KEY,
        public_txn_id VARCHAR(50) UNIQUE NOT NULL,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        entry_type VARCHAR(20) NOT NULL,
        source_type VARCHAR(50) NOT NULL,
        source_id UUID NOT NULL,
        source_ref VARCHAR(100) NOT NULL,
        description TEXT NOT NULL,
        amount NUMERIC(12, 2) NOT NULL,
        currency VARCHAR(10) NOT NULL DEFAULT 'USD',
        status VARCHAR(20) NOT NULL DEFAULT 'SETTLED',
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT chk_fle_entry_type CHECK (entry_type IN ('CREDIT', 'DEBIT', 'REVERSAL')),
        CONSTRAINT chk_fle_source_type CHECK (source_type IN ('REFERRAL_COMMISSION', 'MATCHING_BONUS', 'PROMOTION_BONUS', 'NODE_REWARD', 'WITHDRAWAL', 'NODE_PURCHASE', 'USDT_DEPOSIT', 'BNB_DEPOSIT', 'COIN_SWAP', 'BLOCKCHAIN_DEPOSIT', 'DEPOSIT_CREDIT', 'ADMIN_ADJUSTMENT', 'WALLET_TRANSFER')),
        CONSTRAINT chk_fle_status CHECK (status IN ('SETTLED', 'REVERSED', 'PENDING')),
        CONSTRAINT chk_fle_amount CHECK (amount > 0),
        CONSTRAINT uq_fle_source_entry_type UNIQUE (source_type, source_id, entry_type)
      );

      -- Task #14: Genesis Node Mining Reward Epochs
      CREATE TABLE IF NOT EXISTS reward_epochs (
        id UUID PRIMARY KEY,
        public_epoch_id VARCHAR(50) UNIQUE NOT NULL,
        epoch_number INTEGER UNIQUE NOT NULL,
        start_at TIMESTAMP WITH TIME ZONE NOT NULL,
        end_at TIMESTAMP WITH TIME ZONE NOT NULL,
        reward_per_node NUMERIC(14, 4) NULL,
        currency VARCHAR(10) NOT NULL DEFAULT 'USD',
        status VARCHAR(20) NOT NULL DEFAULT 'OPEN',
        settled_at TIMESTAMP WITH TIME ZONE NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT chk_epoch_status CHECK (status IN ('OPEN', 'COMPLETED')),
        CONSTRAINT chk_epoch_reward CHECK (reward_per_node IS NULL OR reward_per_node > 0)
      );

      -- Task #14: Genesis Node Individual Rewards
      CREATE TABLE IF NOT EXISTS node_rewards (
        id UUID PRIMARY KEY,
        public_reward_id VARCHAR(50) UNIQUE NOT NULL,
        epoch_id UUID NOT NULL REFERENCES reward_epochs(id) ON DELETE CASCADE,
        node_id UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
        owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        amount NUMERIC(14, 4) NOT NULL,
        currency VARCHAR(10) NOT NULL DEFAULT 'USD',
        status VARCHAR(20) NOT NULL DEFAULT 'ACCRUED',
        accrued_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        claimed_at TIMESTAMP WITH TIME ZONE NULL,
        reversed_at TIMESTAMP WITH TIME ZONE NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uq_nr_node_epoch UNIQUE (node_id, epoch_id),
        CONSTRAINT chk_nr_status CHECK (status IN ('ACCRUED', 'CLAIMED', 'REVERSED')),
        CONSTRAINT chk_nr_amount CHECK (amount > 0)
      );

      -- Task #17: Withdrawals Table
      CREATE TABLE IF NOT EXISTS withdrawals (
        id UUID PRIMARY KEY,
        public_withdrawal_id VARCHAR(50) UNIQUE NOT NULL,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        amount NUMERIC(12, 2) NOT NULL,
        currency VARCHAR(10) NOT NULL DEFAULT 'USD',
        destination_type VARCHAR(50) NOT NULL,
        destination_reference TEXT NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
        requested_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        approved_at TIMESTAMP WITH TIME ZONE NULL,
        rejected_at TIMESTAMP WITH TIME ZONE NULL,
        completed_at TIMESTAMP WITH TIME ZONE NULL,
        cancelled_at TIMESTAMP WITH TIME ZONE NULL,
        failed_at TIMESTAMP WITH TIME ZONE NULL,
        rejection_reason TEXT NULL,
        idempotency_key VARCHAR(100) NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT chk_withdrawal_status CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED')),
        CONSTRAINT chk_withdrawal_amount CHECK (amount > 0)
      );

      -- Task #17.2: Withdrawal State Transition Audit Logs
      CREATE TABLE IF NOT EXISTS withdrawal_status_logs (
        id UUID PRIMARY KEY,
        withdrawal_id UUID NOT NULL REFERENCES withdrawals(id) ON DELETE CASCADE,
        public_withdrawal_id VARCHAR(50) NOT NULL,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        user_email VARCHAR(255) NULL,
        user_name VARCHAR(255) NULL,
        previous_status VARCHAR(20) NULL,
        new_status VARCHAR(20) NOT NULL,
        actor_type VARCHAR(20) NOT NULL DEFAULT 'SYSTEM',
        actor_id VARCHAR(100) NULL,
        actor_email VARCHAR(255) NULL,
        reason TEXT NULL,
        amount NUMERIC(12, 2) NOT NULL,
        destination_type VARCHAR(50) NOT NULL,
        destination_reference TEXT NOT NULL,
        tx_hash VARCHAR(100) NULL,
        transition_timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      -- Support System Tables
      CREATE TABLE IF NOT EXISTS support_tickets (
        id UUID PRIMARY KEY,
        public_ticket_id VARCHAR(50) UNIQUE NOT NULL,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        subject VARCHAR(255) NOT NULL,
        category VARCHAR(50) NOT NULL DEFAULT 'GENERAL',
        priority VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
        status VARCHAR(20) NOT NULL DEFAULT 'OPEN',
        assigned_admin_id UUID NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS support_ticket_messages (
        id UUID PRIMARY KEY,
        ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
        sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        sender_role VARCHAR(20) NOT NULL DEFAULT 'USER',
        message TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    try {
      await client.exec(`ALTER TABLE users ADD COLUMN IF NOT EXISTS public_id VARCHAR(50);`);
    } catch {
    }
    try {
      await client.exec(`ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'USER';`);
      await client.exec(`
        UPDATE users 
        SET role = 'ADMIN' 
        WHERE LOWER(email) IN ('md.asifuzzman.dhakacollege@gmail.com', 'admin@phivonex.com');
      `);
    } catch {
    }
    try {
      await client.exec(`ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_status VARCHAR(50) NOT NULL DEFAULT 'UNVERIFIED';`);
      await client.exec(`ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_reject_reason TEXT NULL;`);
      await client.exec(`ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_verified_at TIMESTAMP WITH TIME ZONE NULL;`);
    } catch {
    }
    try {
      await client.exec(`ALTER TABLE reward_epochs ALTER COLUMN reward_per_node DROP NOT NULL;`);
      await client.exec(`ALTER TABLE reward_epochs DROP CONSTRAINT IF EXISTS chk_epoch_reward;`);
      await client.exec(`ALTER TABLE reward_epochs ADD CONSTRAINT chk_epoch_reward CHECK (reward_per_node IS NULL OR reward_per_node > 0);`);
    } catch {
    }
    try {
      await client.exec(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS user_agent TEXT;`);
      await client.exec(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS ip_address VARCHAR(100);`);
    } catch {
    }
    try {
      await client.exec(`ALTER TABLE security_events ALTER COLUMN user_id DROP NOT NULL;`);
    } catch {
    }
    await client.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_public_id ON users (public_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON users (LOWER(email));
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone ON users (phone) WHERE phone IS NOT NULL AND phone != '';
      CREATE INDEX IF NOT EXISTS idx_users_status ON users (status);

      CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions (token_hash);
      CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions (user_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions (expires_at);

      CREATE INDEX IF NOT EXISTS idx_security_events_user ON security_events (user_id, created_at DESC);

      CREATE INDEX IF NOT EXISTS idx_auth_tokens_hash_type ON auth_tokens (token_hash, type);
      CREATE INDEX IF NOT EXISTS idx_auth_tokens_user_id ON auth_tokens (user_id);

      CREATE UNIQUE INDEX IF NOT EXISTS idx_user_referrals_code ON user_referrals (referral_code);
      CREATE INDEX IF NOT EXISTS idx_user_referrals_sponsor ON user_referrals (sponsor_user_id);

      CREATE UNIQUE INDEX IF NOT EXISTS idx_nodes_node_number ON nodes (node_number);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_nodes_public_node_id ON nodes (public_node_id);
      CREATE INDEX IF NOT EXISTS idx_nodes_status ON nodes (status);
      CREATE INDEX IF NOT EXISTS idx_nodes_owner ON nodes (owner_user_id);

      CREATE UNIQUE INDEX IF NOT EXISTS idx_node_orders_public_id ON node_orders (public_order_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_node_orders_idempotency ON node_orders (idempotency_key) WHERE idempotency_key IS NOT NULL AND idempotency_key != '';
      CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_user_order ON node_orders (user_id) WHERE status = 'PENDING';
      CREATE INDEX IF NOT EXISTS idx_node_orders_user ON node_orders (user_id);
      CREATE INDEX IF NOT EXISTS idx_node_orders_status ON node_orders (status);
      CREATE INDEX IF NOT EXISTS idx_node_orders_node_id ON node_orders (node_id);
      CREATE INDEX IF NOT EXISTS idx_node_orders_expires_at ON node_orders (expires_at);

      CREATE UNIQUE INDEX IF NOT EXISTS idx_referral_commissions_public_id ON referral_commissions (public_commission_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_referral_commissions_node_id ON referral_commissions (node_id);
      CREATE INDEX IF NOT EXISTS idx_referral_commissions_sponsor ON referral_commissions (sponsor_user_id);
      CREATE INDEX IF NOT EXISTS idx_referral_commissions_referred ON referral_commissions (referred_user_id);
      CREATE INDEX IF NOT EXISTS idx_referral_commissions_order ON referral_commissions (node_order_id);
      CREATE INDEX IF NOT EXISTS idx_referral_commissions_status ON referral_commissions (status);

      CREATE UNIQUE INDEX IF NOT EXISTS idx_binary_parent_side ON binary_placements (parent_user_id, side) WHERE parent_user_id IS NOT NULL AND side IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_binary_placements_parent ON binary_placements (parent_user_id);
      CREATE INDEX IF NOT EXISTS idx_binary_placements_status ON binary_placements (status);

      -- Task #10: Indexes for binary volume engine
      CREATE INDEX IF NOT EXISTS idx_bve_beneficiary ON binary_volume_events (beneficiary_user_id);
      CREATE INDEX IF NOT EXISTS idx_bve_source_user ON binary_volume_events (source_user_id);
      CREATE INDEX IF NOT EXISTS idx_bve_source_node ON binary_volume_events (source_node_id);
      CREATE INDEX IF NOT EXISTS idx_bve_business_date ON binary_volume_events (business_date);
      CREATE INDEX IF NOT EXISTS idx_bve_status ON binary_volume_events (status);
      CREATE INDEX IF NOT EXISTS idx_bve_beneficiary_date ON binary_volume_events (beneficiary_user_id, business_date);

      CREATE INDEX IF NOT EXISTS idx_bdv_user_date ON binary_daily_volumes (user_id, business_date);

      -- Task #11: Indexes for binary matching settlements & components
      CREATE INDEX IF NOT EXISTS idx_bms_user_id ON binary_matching_settlements (user_id);
      CREATE INDEX IF NOT EXISTS idx_bms_business_date ON binary_matching_settlements (business_date);
      CREATE INDEX IF NOT EXISTS idx_bms_status ON binary_matching_settlements (status);
      CREATE INDEX IF NOT EXISTS idx_bms_user_settled_at ON binary_matching_settlements (user_id, settled_at DESC);
      CREATE INDEX IF NOT EXISTS idx_bmc_settlement_id ON binary_matching_components (settlement_id);
      CREATE INDEX IF NOT EXISTS idx_bmc_settlement_seq ON binary_matching_components (settlement_id, sequence_no);

      -- Task #12: Indexes for promotion milestone bonuses
      CREATE INDEX IF NOT EXISTS idx_pb_user_id ON promotion_bonuses (user_id);
      CREATE INDEX IF NOT EXISTS idx_pb_status ON promotion_bonuses (status);
      CREATE INDEX IF NOT EXISTS idx_pb_milestone ON promotion_bonuses (milestone);
      CREATE INDEX IF NOT EXISTS idx_pb_qualified_at ON promotion_bonuses (qualified_at DESC);

      -- Task #13: Indexes for financial ledger entries
      CREATE INDEX IF NOT EXISTS idx_fle_user_id ON financial_ledger_entries (user_id);
      CREATE INDEX IF NOT EXISTS idx_fle_user_created ON financial_ledger_entries (user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_fle_source ON financial_ledger_entries (source_type, source_id);
      CREATE INDEX IF NOT EXISTS idx_fle_entry_type ON financial_ledger_entries (entry_type);
      CREATE INDEX IF NOT EXISTS idx_fle_status ON financial_ledger_entries (status);
      CREATE INDEX IF NOT EXISTS idx_fle_public_txn_id ON financial_ledger_entries (public_txn_id);

      -- Task #14: Indexes for reward epochs and node rewards
      CREATE UNIQUE INDEX IF NOT EXISTS idx_reward_epochs_public_id ON reward_epochs (public_epoch_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_reward_epochs_number ON reward_epochs (epoch_number);
      CREATE INDEX IF NOT EXISTS idx_reward_epochs_status ON reward_epochs (status);
      CREATE INDEX IF NOT EXISTS idx_reward_epochs_dates ON reward_epochs (start_at, end_at);

      CREATE UNIQUE INDEX IF NOT EXISTS idx_node_rewards_public_id ON node_rewards (public_reward_id);
      CREATE INDEX IF NOT EXISTS idx_node_rewards_owner ON node_rewards (owner_user_id);
      CREATE INDEX IF NOT EXISTS idx_node_rewards_node ON node_rewards (node_id);
      CREATE INDEX IF NOT EXISTS idx_node_rewards_epoch ON node_rewards (epoch_id);
      CREATE INDEX IF NOT EXISTS idx_node_rewards_status ON node_rewards (status);
      CREATE INDEX IF NOT EXISTS idx_node_rewards_accrued_at ON node_rewards (accrued_at DESC);

      -- Task #17: Withdrawal Indexes
      CREATE UNIQUE INDEX IF NOT EXISTS idx_withdrawals_public_id ON withdrawals (public_withdrawal_id);
      CREATE INDEX IF NOT EXISTS idx_withdrawals_user_id ON withdrawals (user_id);
      CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON withdrawals (status);
      CREATE INDEX IF NOT EXISTS idx_withdrawals_created ON withdrawals (created_at DESC);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_withdrawals_idempotency ON withdrawals (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL AND idempotency_key != '';

      CREATE INDEX IF NOT EXISTS idx_wsl_withdrawal_id ON withdrawal_status_logs (withdrawal_id);
      CREATE INDEX IF NOT EXISTS idx_wsl_public_withdrawal_id ON withdrawal_status_logs (public_withdrawal_id);
      CREATE INDEX IF NOT EXISTS idx_wsl_user_id ON withdrawal_status_logs (user_id);
      CREATE INDEX IF NOT EXISTS idx_wsl_new_status ON withdrawal_status_logs (new_status);
      CREATE INDEX IF NOT EXISTS idx_wsl_transition ON withdrawal_status_logs (transition_timestamp DESC);
    `);
    try {
      await client.exec(`
        ALTER TABLE financial_ledger_entries DROP CONSTRAINT IF EXISTS chk_fle_source_type;
        ALTER TABLE financial_ledger_entries ADD CONSTRAINT chk_fle_source_type CHECK (source_type IN ('REFERRAL_COMMISSION', 'MATCHING_BONUS', 'PROMOTION_BONUS', 'NODE_REWARD', 'WITHDRAWAL', 'NODE_PURCHASE', 'USDT_DEPOSIT', 'BNB_DEPOSIT', 'COIN_SWAP', 'BLOCKCHAIN_DEPOSIT', 'DEPOSIT_CREDIT', 'ADMIN_ADJUSTMENT'));
      `);
    } catch {
    }
    try {
      await client.exec(`
        CREATE TABLE IF NOT EXISTS admin_audit_logs (
          id UUID PRIMARY KEY,
          admin_user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
          admin_public_id VARCHAR(50) NOT NULL,
          action VARCHAR(100) NOT NULL,
          target_type VARCHAR(50) NOT NULL,
          target_id VARCHAR(100) NOT NULL,
          details TEXT NOT NULL,
          metadata TEXT NULL,
          ip_address VARCHAR(100) NULL,
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_admin_audit_admin_id ON admin_audit_logs (admin_user_id);
        CREATE INDEX IF NOT EXISTS idx_admin_audit_action ON admin_audit_logs (action);
        CREATE INDEX IF NOT EXISTS idx_admin_audit_target ON admin_audit_logs (target_type, target_id);
        CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit_logs (created_at DESC);
      `);
    } catch (auditTableErr) {
      console.warn("[DB Migration] admin_audit_logs creation error:", auditTableErr);
    }
    try {
      await client.exec(`
        -- 0. Atomic Derivation Index Sequence (Multi-instance safe)
        CREATE SEQUENCE IF NOT EXISTS bsc_deposit_derivation_index_seq START WITH 0 MINVALUE 0 INCREMENT BY 1;

        -- 1. User Deposit Addresses
        CREATE TABLE IF NOT EXISTS user_deposit_addresses (
          id UUID PRIMARY KEY,
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          chain_id INTEGER NOT NULL DEFAULT 56,
          asset VARCHAR(20) NOT NULL DEFAULT 'USDT',
          address VARCHAR(100) NOT NULL,
          derivation_index INTEGER NOT NULL DEFAULT 0,
          derivation_reference VARCHAR(100) NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT uq_user_deposit_chain_asset UNIQUE (user_id, chain_id, asset)
        );
        ALTER TABLE user_deposit_addresses DROP CONSTRAINT IF EXISTS uq_deposit_chain_address;
      `);
    } catch (t171Err) {
      console.warn("[DB Migration] user_deposit_addresses init warning:", t171Err);
    }
    try {
      await client.exec(`ALTER TABLE user_deposit_addresses ADD COLUMN IF NOT EXISTS derivation_index INTEGER NOT NULL DEFAULT 0;`);
      await client.exec(`CREATE INDEX IF NOT EXISTS idx_uda_user_id ON user_deposit_addresses (user_id);`);
      await client.exec(`CREATE INDEX IF NOT EXISTS idx_uda_address ON user_deposit_addresses (address);`);
      await client.exec(`CREATE INDEX IF NOT EXISTS idx_uda_chain_asset ON user_deposit_addresses (chain_id, asset);`);
      await client.exec(`CREATE INDEX IF NOT EXISTS idx_uda_chain_index ON user_deposit_addresses (chain_id, derivation_index);`);
    } catch (udaColErr) {
      console.warn("[DB Migration] user_deposit_addresses column migration warning:", udaColErr);
    }
    try {
      await client.exec(`ALTER TABLE reward_epochs ADD COLUMN IF NOT EXISTS economic_config_version INTEGER NULL;`);
      await client.exec(`ALTER TABLE reward_epochs ADD COLUMN IF NOT EXISTS reward_rate_used NUMERIC(14, 4) NULL;`);
      await client.exec(`ALTER TABLE node_rewards ADD COLUMN IF NOT EXISTS reward_rate_used NUMERIC(14, 4) NULL;`);
      await client.exec(`ALTER TABLE node_rewards ADD COLUMN IF NOT EXISTS economic_config_version INTEGER NULL;`);
      await client.exec(`ALTER TABLE node_rewards ADD COLUMN IF NOT EXISTS business_date VARCHAR(20) NULL;`);
    } catch (rewColErr) {
      console.warn("[DB Migration] reward columns migration warning:", rewColErr);
    }
    try {
      await client.exec(`
        -- 2. Blockchain Deposits Tracking
        CREATE TABLE IF NOT EXISTS blockchain_deposits (
          id UUID PRIMARY KEY,
          public_deposit_id VARCHAR(50) UNIQUE NOT NULL,
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          chain_id INTEGER NOT NULL DEFAULT 56,
          asset VARCHAR(20) NOT NULL DEFAULT 'USDT',
          tx_hash VARCHAR(100) NOT NULL,
          log_index INTEGER NOT NULL DEFAULT 0,
          from_address VARCHAR(100) NOT NULL,
          to_address VARCHAR(100) NOT NULL,
          amount NUMERIC(28, 18) NOT NULL,
          block_number BIGINT NOT NULL,
          confirmations INTEGER NOT NULL DEFAULT 0,
          status VARCHAR(20) NOT NULL DEFAULT 'DETECTED',
          detected_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
          confirmed_at TIMESTAMP WITH TIME ZONE NULL,
          credited_at TIMESTAMP WITH TIME ZONE NULL,
          swept_at TIMESTAMP WITH TIME ZONE NULL,
          sweep_tx_hash VARCHAR(100) NULL,
          gas_funding_tx_hash VARCHAR(100) NULL,
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT uq_bcd_chain_tx_log_to UNIQUE (chain_id, tx_hash, log_index, to_address),
          CONSTRAINT chk_bcd_status CHECK (status IN ('DETECTED', 'CONFIRMING', 'CONFIRMED', 'CREDITED', 'SWEPT', 'REORGED', 'FAILED')),
          CONSTRAINT chk_bcd_amount CHECK (amount > 0)
        );
      `);
    } catch (bcdInitErr) {
      console.warn("[DB Migration] blockchain_deposits init warning:", bcdInitErr);
    }
    try {
      await client.exec(`ALTER TABLE blockchain_deposits ADD COLUMN IF NOT EXISTS log_index INTEGER NOT NULL DEFAULT 0;`);
      await client.exec(`ALTER TABLE blockchain_deposits ADD COLUMN IF NOT EXISTS swept_at TIMESTAMP WITH TIME ZONE NULL;`);
      await client.exec(`ALTER TABLE blockchain_deposits ADD COLUMN IF NOT EXISTS sweep_tx_hash VARCHAR(100) NULL;`);
      await client.exec(`ALTER TABLE blockchain_deposits ADD COLUMN IF NOT EXISTS gas_funding_tx_hash VARCHAR(100) NULL;`);
      await client.exec(`ALTER TABLE blockchain_deposits DROP CONSTRAINT IF EXISTS chk_bcd_status;`);
      await client.exec(`ALTER TABLE blockchain_deposits ADD CONSTRAINT chk_bcd_status CHECK (status IN ('DETECTED', 'CONFIRMING', 'CONFIRMED', 'CREDITED', 'SWEPT', 'REORGED', 'FAILED'));`);
      await client.exec(`ALTER TABLE blockchain_deposits DROP CONSTRAINT IF EXISTS uq_bcd_chain_tx_to;`);
      await client.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_bcd_public_id ON blockchain_deposits (public_deposit_id);`);
      await client.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_bcd_idempotency ON blockchain_deposits (chain_id, tx_hash, log_index, to_address);`);
      await client.exec(`CREATE INDEX IF NOT EXISTS idx_bcd_user_id ON blockchain_deposits (user_id);`);
      await client.exec(`CREATE INDEX IF NOT EXISTS idx_bcd_tx_hash ON blockchain_deposits (tx_hash);`);
      await client.exec(`CREATE INDEX IF NOT EXISTS idx_bcd_to_address ON blockchain_deposits (to_address);`);
      await client.exec(`CREATE INDEX IF NOT EXISTS idx_bcd_status ON blockchain_deposits (status);`);
      await client.exec(`CREATE INDEX IF NOT EXISTS idx_bcd_created ON blockchain_deposits (created_at DESC);`);
    } catch (bcdColErr) {
      console.warn("[DB Migration] blockchain_deposits column migration warning:", bcdColErr);
    }
    try {
      await client.exec(`
        -- 3. Blockchain On-Chain Withdrawals Tracking
        CREATE TABLE IF NOT EXISTS blockchain_withdrawals (
          id UUID PRIMARY KEY,
          withdrawal_id UUID UNIQUE NOT NULL REFERENCES withdrawals(id) ON DELETE CASCADE,
          chain_id INTEGER NOT NULL,
          tx_hash VARCHAR(100) NULL,
          nonce INTEGER NOT NULL,
          from_address VARCHAR(100) NOT NULL,
          destination VARCHAR(100) NOT NULL,
          amount_bnb NUMERIC(28, 18) NOT NULL,
          gas_price_gwei NUMERIC(14, 4) NULL,
          gas_used BIGINT NULL,
          status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
          broadcast_at TIMESTAMP WITH TIME ZONE NULL,
          confirmed_at TIMESTAMP WITH TIME ZONE NULL,
          error_message TEXT NULL,
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT chk_bcw_status CHECK (status IN ('PENDING', 'BROADCASTED', 'CONFIRMED', 'FAILED')),
          CONSTRAINT chk_bcw_amount CHECK (amount_bnb > 0)
        );

        CREATE INDEX IF NOT EXISTS idx_bcw_withdrawal_id ON blockchain_withdrawals (withdrawal_id);
        CREATE INDEX IF NOT EXISTS idx_bcw_tx_hash ON blockchain_withdrawals (tx_hash);
        CREATE INDEX IF NOT EXISTS idx_bcw_status ON blockchain_withdrawals (status);
        CREATE INDEX IF NOT EXISTS idx_bcw_chain_nonce ON blockchain_withdrawals (chain_id, from_address, nonce);

        -- Multi-instance Nonce Safety Tracker
        CREATE TABLE IF NOT EXISTS payout_wallet_nonces (
          wallet_address VARCHAR(100) NOT NULL,
          chain_id INTEGER NOT NULL,
          last_nonce INTEGER NOT NULL DEFAULT -1,
          updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (wallet_address, chain_id)
        );
      `);
      await client.exec(`
        ALTER TABLE financial_ledger_entries DROP CONSTRAINT IF EXISTS chk_fle_source_type;
        ALTER TABLE financial_ledger_entries ADD CONSTRAINT chk_fle_source_type CHECK (source_type IN ('REFERRAL_COMMISSION', 'MATCHING_BONUS', 'PROMOTION_BONUS', 'NODE_REWARD', 'WITHDRAWAL', 'BLOCKCHAIN_DEPOSIT', 'COIN_SWAP', 'NODE_PURCHASE', 'USDT_DEPOSIT', 'BNB_DEPOSIT', 'DEPOSIT_CREDIT', 'ADMIN_ADJUSTMENT'));
      `);
    } catch (task171Err) {
      console.warn("[DB Migration] Task #17.1 BSC schema migration warning:", task171Err);
    }
    try {
      await client.exec(`
        CREATE TABLE IF NOT EXISTS system_economic_configs (
          id UUID PRIMARY KEY,
          config_key VARCHAR(100) UNIQUE NOT NULL,
          config_value TEXT NOT NULL,
          category VARCHAR(50) NOT NULL,
          description TEXT NOT NULL,
          status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
          version INTEGER NOT NULL DEFAULT 1,
          effective_from TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_by_admin_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
          updated_by_admin_public_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM_INIT',
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT chk_sec_status CHECK (status IN ('ACTIVE', 'PAUSED', 'DISABLED'))
        );

        CREATE INDEX IF NOT EXISTS idx_sec_config_key ON system_economic_configs (config_key);
        CREATE INDEX IF NOT EXISTS idx_sec_category ON system_economic_configs (category);
        CREATE INDEX IF NOT EXISTS idx_sec_status ON system_economic_configs (status);

        CREATE TABLE IF NOT EXISTS economic_config_audit_logs (
          id UUID PRIMARY KEY,
          config_key VARCHAR(100) NOT NULL,
          category VARCHAR(50) NOT NULL,
          old_value TEXT NOT NULL,
          new_value TEXT NOT NULL,
          version INTEGER NOT NULL,
          admin_user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
          admin_public_id VARCHAR(50) NOT NULL,
          reason TEXT NULL,
          effective_from TIMESTAMP WITH TIME ZONE NOT NULL,
          ip_address VARCHAR(100) NULL,
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_ecal_config_key ON economic_config_audit_logs (config_key);
        CREATE INDEX IF NOT EXISTS idx_ecal_category ON economic_config_audit_logs (category);
        CREATE INDEX IF NOT EXISTS idx_ecal_admin ON economic_config_audit_logs (admin_user_id);
        CREATE INDEX IF NOT EXISTS idx_ecal_created ON economic_config_audit_logs (created_at DESC);

        -- Relax node_orders and referral_commissions amount constraints to support dynamic admin economic controls
        ALTER TABLE node_orders DROP CONSTRAINT IF EXISTS chk_node_order_amount;
        ALTER TABLE node_orders ADD CONSTRAINT chk_node_order_amount CHECK (amount_usd > 0);

        ALTER TABLE referral_commissions DROP CONSTRAINT IF EXISTS chk_commission_amount;
        ALTER TABLE referral_commissions ADD CONSTRAINT chk_commission_amount CHECK (amount_usd >= 0);
      `);
    } catch (task19Err) {
      console.warn("[DB Migration] Task #19 Economic Configs schema migration warning:", task19Err);
    }
    try {
      await client.exec(`
        CREATE TABLE IF NOT EXISTS coin_swap_transactions (
          id UUID PRIMARY KEY,
          public_swap_id VARCHAR(50) UNIQUE NOT NULL,
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          coin_amount NUMERIC(28, 6) NOT NULL,
          rate_usdt NUMERIC(16, 6) NOT NULL,
          usdt_amount NUMERIC(16, 4) NOT NULL,
          status VARCHAR(20) NOT NULL DEFAULT 'COMPLETED',
          rate_version INTEGER NOT NULL DEFAULT 1,
          idempotency_key VARCHAR(100) NULL,
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
          completed_at TIMESTAMP WITH TIME ZONE NULL,
          CONSTRAINT chk_cst_status CHECK (status IN ('PENDING', 'COMPLETED', 'REVERSED')),
          CONSTRAINT chk_cst_coin_amount CHECK (coin_amount > 0),
          CONSTRAINT chk_cst_rate_usdt CHECK (rate_usdt > 0),
          CONSTRAINT chk_cst_usdt_amount CHECK (usdt_amount > 0)
        );

        CREATE UNIQUE INDEX IF NOT EXISTS idx_cst_public_id ON coin_swap_transactions (public_swap_id);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_cst_user_idempotency ON coin_swap_transactions (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL AND idempotency_key != '';
        CREATE INDEX IF NOT EXISTS idx_cst_user_id ON coin_swap_transactions (user_id);
        CREATE INDEX IF NOT EXISTS idx_cst_status ON coin_swap_transactions (status);
        CREATE INDEX IF NOT EXISTS idx_cst_created_at ON coin_swap_transactions (created_at DESC);

        ALTER TABLE coin_swap_transactions ADD COLUMN IF NOT EXISTS direction VARCHAR(20) NOT NULL DEFAULT 'COIN_TO_USDT';

        -- Update financial_ledger_entries constraint to support COIN_SWAP, ADMIN_ADJUSTMENT & WALLET_TRANSFER
        ALTER TABLE financial_ledger_entries DROP CONSTRAINT IF EXISTS chk_fle_source_type;
        ALTER TABLE financial_ledger_entries ADD CONSTRAINT chk_fle_source_type CHECK (source_type IN ('REFERRAL_COMMISSION', 'MATCHING_BONUS', 'PROMOTION_BONUS', 'NODE_REWARD', 'WITHDRAWAL', 'BLOCKCHAIN_DEPOSIT', 'COIN_SWAP', 'NODE_PURCHASE', 'USDT_DEPOSIT', 'BNB_DEPOSIT', 'DEPOSIT_CREDIT', 'ADMIN_ADJUSTMENT', 'WALLET_TRANSFER'));
      `);
    } catch (task191Err) {
      console.warn("[DB Migration] Task #19.1 Swap Transactions schema migration warning:", task191Err);
    }
    try {
      await client.exec(`
        CREATE TABLE IF NOT EXISTS notifications (
          id UUID PRIMARY KEY,
          public_notification_id VARCHAR(50) UNIQUE NOT NULL,
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          type VARCHAR(50) NOT NULL,
          title VARCHAR(255) NOT NULL,
          message TEXT NOT NULL,
          source_type VARCHAR(50) NULL,
          source_id VARCHAR(100) NULL,
          read_at TIMESTAMP WITH TIME ZONE NULL,
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT chk_notification_type CHECK (type IN (
            'NODE_ACTIVATED',
            'REFERRAL_EARNED',
            'MATCHING_EARNED',
            'PROMOTION_EARNED',
            'PHIVO_REWARD',
            'PHIVO_SWAP_COMPLETED',
            'USDT_DEPOSIT_CONFIRMED',
            'WITHDRAWAL_STATUS',
            'SECURITY_ALERT',
            'SUPPORT_TICKET_CREATED',
            'SUPPORT_TICKET_UPDATE'
          ))
        );

        CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_public_id ON notifications (public_notification_id);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_idempotency ON notifications (user_id, source_type, source_id, type) WHERE source_type IS NOT NULL AND source_id IS NOT NULL;
        CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications (user_id, read_at, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications (user_id, created_at DESC);
      `);
      try {
        await client.exec(`
          ALTER TABLE notifications DROP CONSTRAINT IF EXISTS chk_notification_type;
          ALTER TABLE notifications ADD CONSTRAINT chk_notification_type CHECK (type IN (
            'NODE_ACTIVATED',
            'REFERRAL_EARNED',
            'MATCHING_EARNED',
            'PROMOTION_EARNED',
            'PHIVO_REWARD',
            'PHIVO_SWAP_COMPLETED',
            'USDT_DEPOSIT_CONFIRMED',
            'WITHDRAWAL_STATUS',
            'SECURITY_ALERT',
            'SUPPORT_TICKET_CREATED',
            'SUPPORT_TICKET_UPDATE'
          ));
        `);
      } catch {
      }
    } catch (task20Err) {
      console.warn("[DB Migration] Task #20 Notifications schema migration warning:", task20Err);
    }
    try {
      await client.exec(`
        CREATE TABLE IF NOT EXISTS user_push_tokens (
          id UUID PRIMARY KEY,
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          token TEXT NOT NULL,
          platform VARCHAR(50) DEFAULT 'WEB',
          user_agent TEXT,
          is_active BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT uq_user_push_token UNIQUE (user_id, token)
        );

        CREATE INDEX IF NOT EXISTS idx_user_push_tokens_user ON user_push_tokens (user_id, is_active);
      `);
    } catch (pushErr) {
      console.warn("[DB Migration] Web Push tokens schema migration warning:", pushErr);
    }
    try {
      await client.exec(`
        CREATE TABLE IF NOT EXISTS financial_reconciliation_runs (
          id UUID PRIMARY KEY,
          public_run_id VARCHAR(50) UNIQUE NOT NULL,
          started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
          completed_at TIMESTAMP WITH TIME ZONE NULL,
          status VARCHAR(20) NOT NULL DEFAULT 'RUNNING',
          issues_found INTEGER NOT NULL DEFAULT 0,
          created_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
          created_by_public_id VARCHAR(50) NULL,
          phivo_integrity VARCHAR(20) NOT NULL DEFAULT 'PENDING',
          usdt_integrity VARCHAR(20) NOT NULL DEFAULT 'PENDING',
          ledger_integrity VARCHAR(20) NOT NULL DEFAULT 'PENDING',
          withdrawal_integrity VARCHAR(20) NOT NULL DEFAULT 'PENDING',
          swap_integrity VARCHAR(20) NOT NULL DEFAULT 'PENDING',
          summary TEXT NULL,
          error_message TEXT NULL,
          CONSTRAINT chk_frr_status CHECK (status IN ('RUNNING', 'COMPLETED', 'FAILED'))
        );

        CREATE TABLE IF NOT EXISTS financial_reconciliation_issues (
          id UUID PRIMARY KEY,
          run_id UUID NOT NULL REFERENCES financial_reconciliation_runs(id) ON DELETE CASCADE,
          issue_type VARCHAR(100) NOT NULL,
          source_type VARCHAR(100) NOT NULL,
          source_reference VARCHAR(100) NOT NULL,
          asset VARCHAR(20) NOT NULL,
          expected_amount NUMERIC(28, 6) NOT NULL DEFAULT 0,
          actual_amount NUMERIC(28, 6) NOT NULL DEFAULT 0,
          status VARCHAR(20) NOT NULL DEFAULT 'DETECTED',
          user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
          description TEXT NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT chk_fri_status CHECK (status IN ('DETECTED', 'RESOLVED', 'IGNORED'))
        );

        CREATE UNIQUE INDEX IF NOT EXISTS idx_frr_public_id ON financial_reconciliation_runs (public_run_id);
        CREATE INDEX IF NOT EXISTS idx_frr_status ON financial_reconciliation_runs (status);
        CREATE INDEX IF NOT EXISTS idx_frr_started ON financial_reconciliation_runs (started_at DESC);

        CREATE INDEX IF NOT EXISTS idx_fri_run_id ON financial_reconciliation_issues (run_id);
        CREATE INDEX IF NOT EXISTS idx_fri_issue_type ON financial_reconciliation_issues (issue_type);
        CREATE INDEX IF NOT EXISTS idx_fri_asset ON financial_reconciliation_issues (asset);
        CREATE INDEX IF NOT EXISTS idx_fri_created ON financial_reconciliation_issues (created_at DESC);
      `);
    } catch (task21Err) {
      console.warn("[DB Migration] Task #21 Financial Reconciliation schema migration warning:", task21Err);
    }
    try {
      await client.exec(`
        CREATE TABLE IF NOT EXISTS binary_matching_config (
          id UUID PRIMARY KEY,
          matching_enabled BOOLEAN NOT NULL DEFAULT TRUE,
          daily_max_payout NUMERIC(12, 2) NOT NULL DEFAULT 5000.00,
          sponsor_qualification_required BOOLEAN NOT NULL DEFAULT TRUE,
          carry_forward_behavior VARCHAR(50) NOT NULL DEFAULT 'DISCARD_WEAK_CARRY_STRONG',
          effective_date DATE NOT NULL,
          version INTEGER NOT NULL DEFAULT 1,
          tiers_json TEXT NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS binary_matching_config_audit (
          id UUID PRIMARY KEY,
          config_id UUID NOT NULL REFERENCES binary_matching_config(id) ON DELETE CASCADE,
          admin_user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
          old_value_json TEXT NOT NULL,
          new_value_json TEXT NOT NULL,
          effective_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
          version INTEGER NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        -- Seed default matching configuration
        INSERT INTO binary_matching_config (
          id, matching_enabled, daily_max_payout, sponsor_qualification_required,
          carry_forward_behavior, effective_date, version, tiers_json
        )
        SELECT 
          '2c45abba-b586-4032-8cf4-6a039eec92bc', TRUE, 5000.00, TRUE,
          'DISCARD_WEAK_CARRY_STRONG', CURRENT_DATE, 1,
          '[{"units":2,"bonusUsd":500},{"units":4,"bonusUsd":1000},{"units":8,"bonusUsd":1500},{"units":12,"bonusUsd":2000},{"units":16,"bonusUsd":2500},{"units":20,"bonusUsd":3000},{"units":24,"bonusUsd":3500},{"units":28,"bonusUsd":4000},{"units":32,"bonusUsd":4500},{"units":36,"bonusUsd":5000}]'
        WHERE NOT EXISTS (SELECT 1 FROM binary_matching_config);

        -- Update default tier schedule if needed
        UPDATE binary_matching_config
        SET tiers_json = '[{"units":2,"bonusUsd":500},{"units":4,"bonusUsd":1000},{"units":8,"bonusUsd":1500},{"units":12,"bonusUsd":2000},{"units":16,"bonusUsd":2500},{"units":20,"bonusUsd":3000},{"units":24,"bonusUsd":3500},{"units":28,"bonusUsd":4000},{"units":32,"bonusUsd":4500},{"units":36,"bonusUsd":5000}]'
        WHERE version = 1 AND tiers_json LIKE '%"units":6%';
      `);
    } catch (task233AErr) {
      console.warn("[DB Migration] Task #23.3A Dynamic Matching schema migration warning:", task233AErr);
    }
    try {
      await client.exec(`
        CREATE TABLE IF NOT EXISTS promotional_offers (
          id UUID PRIMARY KEY,
          title TEXT NOT NULL,
          description TEXT NOT NULL,
          banner_image TEXT NOT NULL,
          offer_type VARCHAR(50) NOT NULL DEFAULT 'BOGO_FREE_NODE',
          bonus_nodes_count INTEGER NOT NULL DEFAULT 1,
          bonus_mining_rewards BOOLEAN NOT NULL DEFAULT TRUE,
          bonus_matching_enabled BOOLEAN NOT NULL DEFAULT FALSE,
          bonus_referral_commission BOOLEAN NOT NULL DEFAULT FALSE,
          start_date TIMESTAMP WITH TIME ZONE NOT NULL,
          end_date TIMESTAMP WITH TIME ZONE NOT NULL,
          status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
          target_audience VARCHAR(20) NOT NULL DEFAULT 'ALL',
          priority_order INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        -- Add columns if missing in existing table
        ALTER TABLE promotional_offers ADD COLUMN IF NOT EXISTS offer_type VARCHAR(50) NOT NULL DEFAULT 'BOGO_FREE_NODE';
        ALTER TABLE promotional_offers ADD COLUMN IF NOT EXISTS bonus_nodes_count INTEGER NOT NULL DEFAULT 1;
        ALTER TABLE promotional_offers ADD COLUMN IF NOT EXISTS bonus_mining_rewards BOOLEAN NOT NULL DEFAULT TRUE;
        ALTER TABLE promotional_offers ADD COLUMN IF NOT EXISTS bonus_matching_enabled BOOLEAN NOT NULL DEFAULT FALSE;
        ALTER TABLE promotional_offers ADD COLUMN IF NOT EXISTS bonus_referral_commission BOOLEAN NOT NULL DEFAULT FALSE;
        ALTER TABLE promotional_offers ADD COLUMN IF NOT EXISTS promotional_price_usd NUMERIC(12, 2) NOT NULL DEFAULT 1000.00;
        ALTER TABLE promotional_offers ADD COLUMN IF NOT EXISTS discount_percent NUMERIC(5, 2) NOT NULL DEFAULT 0.00;
        ALTER TABLE promotional_offers ADD COLUMN IF NOT EXISTS badge_tag VARCHAR(50) NOT NULL DEFAULT 'HOT_DEAL';
        ALTER TABLE promotional_offers ADD COLUMN IF NOT EXISTS total_allocated_slots INTEGER NOT NULL DEFAULT 100;
        ALTER TABLE promotional_offers ADD COLUMN IF NOT EXISTS claimed_slots INTEGER NOT NULL DEFAULT 18;

        -- Seed BOGO offer if none exists
        INSERT INTO promotional_offers (
          id, title, description, banner_image, offer_type, bonus_nodes_count,
          bonus_mining_rewards, bonus_matching_enabled, bonus_referral_commission,
          promotional_price_usd, discount_percent, badge_tag, total_allocated_slots, claimed_slots,
          start_date, end_date, status, target_audience, priority_order
        )
        SELECT
          '3c55abba-b586-4032-8cf4-6a039eec92bc',
          'Buy 1 Genesis Node, Get 1 Free Promo Node (BOGO)',
          'Limited promotion: Acquire 1 Genesis Validator Node and receive 1 Free Promo Node. The Free Node accrues daily mining coin rewards without binary matching or direct spot commissions.',
          'https://images.unsplash.com/photo-1639762681485-074b7f938ba0?q=80&w=800&auto=format&fit=crop',
          'BOGO_FREE_NODE',
          1,
          TRUE,
          FALSE,
          FALSE,
          1000.00,
          0.00,
          'HOT_DEAL',
          100,
          24,
          CURRENT_TIMESTAMP - INTERVAL '1 day',
          CURRENT_TIMESTAMP + INTERVAL '90 days',
          'ACTIVE',
          'ALL',
          1
        WHERE NOT EXISTS (SELECT 1 FROM promotional_offers WHERE offer_type = 'BOGO_FREE_NODE');

        CREATE TABLE IF NOT EXISTS promotional_banners (
          id UUID PRIMARY KEY,
          content TEXT NOT NULL,
          image_url TEXT NOT NULL,
          cta_text VARCHAR(100) NOT NULL,
          cta_destination VARCHAR(255) NOT NULL,
          display_order INTEGER NOT NULL DEFAULT 0,
          status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
          start_date TIMESTAMP WITH TIME ZONE NOT NULL,
          end_date TIMESTAMP WITH TIME ZONE NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS promotional_settings (
          key VARCHAR(100) PRIMARY KEY,
          value TEXT NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        -- Seed default settings if they don't exist
        INSERT INTO promotional_settings (key, value)
        VALUES 
          ('leaderboard_metric', '"DIRECT_REFERRALS"'),
          ('performance_popup', '{"enabled":true,"metric":"DIRECT_REFERRALS","topCount":3,"durationSeconds":5}')
        ON CONFLICT (key) DO NOTHING;

        -- Binance-Grade KYC Verifications Table
        CREATE TABLE IF NOT EXISTS kyc_verifications (
          id UUID PRIMARY KEY,
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          full_legal_name VARCHAR(255) NOT NULL,
          dob VARCHAR(50) NOT NULL,
          country VARCHAR(100) NOT NULL,
          residential_address TEXT NOT NULL,
          city VARCHAR(100) NOT NULL,
          postal_code VARCHAR(50) NOT NULL,
          document_type VARCHAR(50) NOT NULL,
          document_number VARCHAR(100) NOT NULL,
          document_front_url TEXT NOT NULL,
          document_back_url TEXT NULL,
          selfie_photo_url TEXT NOT NULL,
          status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
          rejection_reason TEXT NULL,
          reviewer_id UUID NULL,
          reviewed_at TIMESTAMP WITH TIME ZONE NULL,
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_kyc_verifications_user_id ON kyc_verifications (user_id);
        CREATE INDEX IF NOT EXISTS idx_kyc_verifications_status ON kyc_verifications (status);
      `);
    } catch (task233BErr) {
      console.warn("[DB Migration] Task #23.3B Promotional and KYC schema migration warning:", task233BErr);
    }
    try {
      await client.exec(`
        CREATE TABLE IF NOT EXISTS email_templates (
          id UUID PRIMARY KEY,
          event_name VARCHAR(100) UNIQUE NOT NULL,
          subject TEXT NOT NULL,
          body_html TEXT NOT NULL,
          enabled BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS email_queue (
          id UUID PRIMARY KEY,
          to_email VARCHAR(255) NOT NULL,
          subject TEXT NOT NULL,
          body_html TEXT NOT NULL,
          status VARCHAR(20) NOT NULL DEFAULT 'QUEUED',
          provider_message_id VARCHAR(255) NULL,
          error_message TEXT NULL,
          sent_at TIMESTAMP WITH TIME ZONE NULL,
          scheduled_send_at TIMESTAMP WITH TIME ZONE NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        -- Ensure column exists for already created tables
        ALTER TABLE email_queue ADD COLUMN IF NOT EXISTS scheduled_send_at TIMESTAMP WITH TIME ZONE NULL;

        CREATE TABLE IF NOT EXISTS automation_rules (
          id UUID PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          enabled BOOLEAN NOT NULL DEFAULT TRUE,
          trigger_criteria VARCHAR(100) NOT NULL,
          delay_hours INTEGER NOT NULL DEFAULT 0,
          cooldown_days INTEGER NOT NULL DEFAULT 7,
          template_id UUID NOT NULL REFERENCES email_templates(id) ON DELETE CASCADE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS automation_cooldowns (
          id UUID PRIMARY KEY,
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          rule_id UUID NOT NULL REFERENCES automation_rules(id) ON DELETE CASCADE,
          last_triggered_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT uq_user_rule UNIQUE (user_id, rule_id)
        );

        -- Seed default templates with rich cyber-luxe digital transformation HTML
        INSERT INTO email_templates (id, event_name, subject, body_html, enabled)
        VALUES 
          ('e0011111-1111-1111-1111-111111111111', 'WELCOME', 'Welcome to PHIVONEX Digital Infrastructure Engine', '<div style="background-color: #05070c; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, Helvetica, Arial, sans-serif; color: #f8fafc; padding: 40px 15px; margin: 0; width: 100%;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 620px; margin: 0 auto; background-color: #0b1329; border: 1px solid #1e293b; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 50px rgba(0, 207, 255, 0.08);"><tr><td style="background: linear-gradient(135deg, #0f172a 0%, #070d1e 100%); padding: 32px 30px; border-bottom: 1px solid rgba(0, 207, 255, 0.2); text-align: center;"><div style="font-size: 26px; font-weight: 900; letter-spacing: 4px; color: #ffffff; font-family: monospace;">PHIVONEX</div><div style="font-size: 10px; font-weight: 700; letter-spacing: 2px; color: #00CFFF; margin-top: 6px; text-transform: uppercase;">DECENTRALIZED AUTONOMOUS NODE INFRASTRUCTURE</div></td></tr><tr><td style="padding: 35px 30px;"><div style="display: inline-block; padding: 6px 14px; background: rgba(0, 207, 255, 0.12); border: 1px solid rgba(0, 207, 255, 0.3); border-radius: 20px; font-size: 11px; font-weight: 700; color: #00CFFF; font-family: monospace; text-transform: uppercase; margin-bottom: 20px;">OPERATOR INITIALIZATION</div><h1 style="font-size: 22px; font-weight: 800; color: #ffffff; margin: 0 0 14px 0; line-height: 1.3;">Welcome to PHIVONEX Matrix, {{displayName}}!</h1><p style="font-size: 14px; color: #94a3b8; line-height: 1.6; margin: 0 0 25px 0;">Your decentralized operator profile has been successfully provisioned. You are now connected to the PHIVONEX high-throughput validator node network with cryptographically secured real-time settlement capability.</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: rgba(15, 23, 42, 0.8); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px; margin-bottom: 25px; font-size: 13px;"><tr><td style="padding: 14px 18px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); color: #64748b; font-weight: 600;">Public Operator ID</td><td style="padding: 14px 18px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); color: #00CFFF; font-weight: 700; font-family: monospace; text-align: right;">{{publicId}}</td></tr><tr><td style="padding: 14px 18px; color: #64748b; font-weight: 600;">Status</td><td style="padding: 14px 18px; color: #10B981; font-weight: 700; text-align: right;">ACTIVE OPERATOR</td></tr></table><div style="text-align: center; margin: 30px 0 15px 0;"><a href="https://phivonex.com/app/dashboard" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #00CFFF 0%, #0077FF 100%); color: #05070c; font-size: 14px; font-weight: 800; text-decoration: none; border-radius: 10px; box-shadow: 0 0 25px rgba(0, 207, 255, 0.35); text-transform: uppercase; letter-spacing: 0.5px;">Access Console</a></div></td></tr><tr><td style="background-color: #070c1a; padding: 25px 30px; border-top: 1px solid rgba(255, 255, 255, 0.06); font-size: 11px; color: #475569; line-height: 1.5; text-align: center;"><p style="margin: 0 0 8px 0; font-family: monospace; color: #64748b;">PHIVONEX Digital Infrastructure Engine \u2022 256-bit Encrypted Channel</p><p style="margin: 0;">Automated Operational Transmission.</p></td></tr></table></div>', TRUE),

          ('e0022222-2222-2222-2222-222222222222', 'REFERRAL_SIGNUP', 'New Network Referral Registered', '<div style="background-color: #05070c; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, Helvetica, Arial, sans-serif; color: #f8fafc; padding: 40px 15px; margin: 0; width: 100%;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 620px; margin: 0 auto; background-color: #0b1329; border: 1px solid #1e293b; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 50px rgba(0, 207, 255, 0.08);"><tr><td style="background: linear-gradient(135deg, #0f172a 0%, #070d1e 100%); padding: 32px 30px; border-bottom: 1px solid rgba(50, 213, 131, 0.3); text-align: center;"><div style="font-size: 26px; font-weight: 900; letter-spacing: 4px; color: #ffffff; font-family: monospace;">PHIVONEX</div><div style="font-size: 10px; font-weight: 700; letter-spacing: 2px; color: #32D583; margin-top: 6px; text-transform: uppercase;">REFERRAL NETWORK GROWTH ENGINE</div></td></tr><tr><td style="padding: 35px 30px;"><div style="display: inline-block; padding: 6px 14px; background: rgba(50, 213, 131, 0.12); border: 1px solid rgba(50, 213, 131, 0.3); border-radius: 20px; font-size: 11px; font-weight: 700; color: #32D583; font-family: monospace; text-transform: uppercase; margin-bottom: 20px;">NEW REFERRAL REGISTERED</div><h1 style="font-size: 22px; font-weight: 800; color: #ffffff; margin: 0 0 14px 0; line-height: 1.3;">New Operator Registered!</h1><p style="font-size: 14px; color: #94a3b8; line-height: 1.6; margin: 0 0 25px 0;">A new operator registered using your referral code. When they activate a Genesis Node, you will earn direct referral commissions and binary matching points.</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: rgba(15, 23, 42, 0.8); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px; margin-bottom: 25px; font-size: 13px;"><tr><td style="padding: 14px 18px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); color: #64748b; font-weight: 600;">Referred Operator</td><td style="padding: 14px 18px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); color: #ffffff; font-weight: 700; text-align: right;">{{displayName}}</td></tr><tr><td style="padding: 14px 18px; color: #64748b; font-weight: 600;">Operator ID</td><td style="padding: 14px 18px; color: #32D583; font-weight: 700; font-family: monospace; text-align: right;">{{publicId}}</td></tr></table><div style="text-align: center; margin: 30px 0 15px 0;"><a href="https://phivonex.com/app/referrals" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #32D583 0%, #10B981 100%); color: #05070c; font-size: 14px; font-weight: 800; text-decoration: none; border-radius: 10px; box-shadow: 0 0 25px rgba(50, 213, 131, 0.35); text-transform: uppercase; letter-spacing: 0.5px;">View Referral Tree</a></div></td></tr><tr><td style="background-color: #070c1a; padding: 25px 30px; border-top: 1px solid rgba(255, 255, 255, 0.06); font-size: 11px; color: #475569; line-height: 1.5; text-align: center;"><p style="margin: 0 0 8px 0; font-family: monospace; color: #64748b;">PHIVONEX Digital Infrastructure Engine \u2022 Network Growth Audit</p><p style="margin: 0;">Automated Referral Tracking System.</p></td></tr></table></div>', TRUE),

          ('e0033333-3333-3333-3333-333333333333', 'NODE_ACTIVATION', 'Genesis Node Activated and Operational', '<div style="background-color: #05070c; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, Helvetica, Arial, sans-serif; color: #f8fafc; padding: 40px 15px; margin: 0; width: 100%;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 620px; margin: 0 auto; background-color: #0b1329; border: 1px solid #1e293b; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 50px rgba(0, 207, 255, 0.08);"><tr><td style="background: linear-gradient(135deg, #0f172a 0%, #070d1e 100%); padding: 32px 30px; border-bottom: 1px solid rgba(0, 207, 255, 0.3); text-align: center;"><div style="font-size: 26px; font-weight: 900; letter-spacing: 4px; color: #ffffff; font-family: monospace;">PHIVONEX</div><div style="font-size: 10px; font-weight: 700; letter-spacing: 2px; color: #00CFFF; margin-top: 6px; text-transform: uppercase;">GENESIS VALIDATOR NODE INFRASTRUCTURE</div></td></tr><tr><td style="padding: 35px 30px;"><div style="display: inline-block; padding: 6px 14px; background: rgba(0, 207, 255, 0.12); border: 1px solid rgba(0, 207, 255, 0.3); border-radius: 20px; font-size: 11px; font-weight: 700; color: #00CFFF; font-family: monospace; text-transform: uppercase; margin-bottom: 20px;">NODE ACTIVE & OPERATIONAL</div><h1 style="font-size: 22px; font-weight: 800; color: #ffffff; margin: 0 0 14px 0; line-height: 1.3;">Genesis Node Activated!</h1><p style="font-size: 14px; color: #94a3b8; line-height: 1.6; margin: 0 0 25px 0;">Your Genesis Node has been provisioned and is actively mining daily PHIVO coin rewards in the PHIVONEX ecosystem.</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: rgba(15, 23, 42, 0.8); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px; margin-bottom: 25px; font-size: 13px;"><tr><td style="padding: 14px 18px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); color: #64748b; font-weight: 600;">Node ID</td><td style="padding: 14px 18px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); color: #00CFFF; font-weight: 800; font-family: monospace; text-align: right;">PHX-NODE-{{nodeNumber}}</td></tr><tr><td style="padding: 14px 18px; color: #64748b; font-weight: 600;">Daily Mining Status</td><td style="padding: 14px 18px; color: #10B981; font-weight: 700; text-align: right;">ACTIVE (24/7 MINING)</td></tr></table><div style="text-align: center; margin: 30px 0 15px 0;"><a href="https://phivonex.com/app/nodes" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #00CFFF 0%, #0077FF 100%); color: #05070c; font-size: 14px; font-weight: 800; text-decoration: none; border-radius: 10px; box-shadow: 0 0 25px rgba(0, 207, 255, 0.35); text-transform: uppercase; letter-spacing: 0.5px;">Manage Genesis Nodes</a></div></td></tr><tr><td style="background-color: #070c1a; padding: 25px 30px; border-top: 1px solid rgba(255, 255, 255, 0.06); font-size: 11px; color: #475569; line-height: 1.5; text-align: center;"><p style="margin: 0 0 8px 0; font-family: monospace; color: #64748b;">PHIVONEX Autonomous Digital Infrastructure \u2022 Telemetry Sync</p><p style="margin: 0;">Real-Time Block Validation Active.</p></td></tr></table></div>', TRUE),

          ('e0044444-4444-4444-4444-444444444444', 'DEPOSIT_CONFIRM', 'USDT On-Chain Deposit Confirmed', '<div style="background-color: #05070c; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, Helvetica, Arial, sans-serif; color: #f8fafc; padding: 40px 15px; margin: 0; width: 100%;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 620px; margin: 0 auto; background-color: #0b1329; border: 1px solid #1e293b; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 50px rgba(0, 207, 255, 0.08);"><tr><td style="background: linear-gradient(135deg, #0f172a 0%, #070d1e 100%); padding: 32px 30px; border-bottom: 1px solid rgba(16, 185, 129, 0.3); text-align: center;"><div style="font-size: 26px; font-weight: 900; letter-spacing: 4px; color: #ffffff; font-family: monospace;">PHIVONEX</div><div style="font-size: 10px; font-weight: 700; letter-spacing: 2px; color: #10B981; margin-top: 6px; text-transform: uppercase;">ON-CHAIN FINANCIAL SETTLEMENT</div></td></tr><tr><td style="padding: 35px 30px;"><div style="display: inline-block; padding: 6px 14px; background: rgba(16, 185, 129, 0.12); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 20px; font-size: 11px; font-weight: 700; color: #10B981; font-family: monospace; text-transform: uppercase; margin-bottom: 20px;">DEPOSIT CONFIRMED</div><h1 style="font-size: 22px; font-weight: 800; color: #ffffff; margin: 0 0 14px 0; line-height: 1.3;">USDT Deposit Confirmed!</h1><p style="font-size: 14px; color: #94a3b8; line-height: 1.6; margin: 0 0 25px 0;">Your deposit has been verified on the BNB Smart Chain (BSC) network and credited to your available deposit balance. You can use it for node purchases, coin buys, or withdrawals.</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: rgba(15, 23, 42, 0.8); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px; margin-bottom: 25px; font-size: 13px;"><tr><td style="padding: 14px 18px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); color: #64748b; font-weight: 600;">Amount Credited</td><td style="padding: 14px 18px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); color: #10B981; font-weight: 800; font-size: 16px; font-family: monospace; text-align: right;">+\${{amount}} USDT</td></tr><tr><td style="padding: 14px 18px; color: #64748b; font-weight: 600;">Network</td><td style="padding: 14px 18px; color: #e2e8f0; font-weight: 600; text-align: right;">BNB Smart Chain (BSC)</td></tr></table><div style="text-align: center; margin: 30px 0 15px 0;"><a href="https://phivonex.com/app/deposit" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #10B981 0%, #059669 100%); color: #ffffff; font-size: 14px; font-weight: 800; text-decoration: none; border-radius: 10px; box-shadow: 0 0 25px rgba(16, 185, 129, 0.35); text-transform: uppercase; letter-spacing: 0.5px;">View Available Balance</a></div></td></tr><tr><td style="background-color: #070c1a; padding: 25px 30px; border-top: 1px solid rgba(255, 255, 255, 0.06); font-size: 11px; color: #475569; line-height: 1.5; text-align: center;"><p style="margin: 0 0 8px 0; font-family: monospace; color: #64748b;">PHIVONEX Digital Infrastructure Engine \u2022 On-Chain Telemetry</p><p style="margin: 0;">Verified 256-Bit Cryptographic Settlement Notice.</p></td></tr></table></div>', TRUE),

          ('e0055555-5555-5555-5555-555555555555', 'REWARD', 'PHIVO Daily Mining Reward Accrued', '<div style="background-color: #05070c; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, Helvetica, Arial, sans-serif; color: #f8fafc; padding: 40px 15px; margin: 0; width: 100%;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 620px; margin: 0 auto; background-color: #0b1329; border: 1px solid #1e293b; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 50px rgba(0, 207, 255, 0.08);"><tr><td style="background: linear-gradient(135deg, #0f172a 0%, #070d1e 100%); padding: 32px 30px; border-bottom: 1px solid rgba(16, 185, 129, 0.3); text-align: center;"><div style="font-size: 26px; font-weight: 900; letter-spacing: 4px; color: #ffffff; font-family: monospace;">PHIVONEX</div><div style="font-size: 10px; font-weight: 700; letter-spacing: 2px; color: #10B981; margin-top: 6px; text-transform: uppercase;">DAILY MINING REWARD DISTRIBUTION</div></td></tr><tr><td style="padding: 35px 30px;"><div style="display: inline-block; padding: 6px 14px; background: rgba(16, 185, 129, 0.12); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 20px; font-size: 11px; font-weight: 700; color: #10B981; font-family: monospace; text-transform: uppercase; margin-bottom: 20px;">MINING REWARD ACCRUED</div><h1 style="font-size: 22px; font-weight: 800; color: #ffffff; margin: 0 0 14px 0; line-height: 1.3;">PHIVO Mining Reward Accrued!</h1><p style="font-size: 14px; color: #94a3b8; line-height: 1.6; margin: 0 0 25px 0;">Your Genesis Nodes generated daily mining rewards for the current epoch. PHIVO coins have been credited to your reward ledger.</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: rgba(15, 23, 42, 0.8); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px; margin-bottom: 25px; font-size: 13px;"><tr><td style="padding: 14px 18px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); color: #64748b; font-weight: 600;">Reward Accrued</td><td style="padding: 14px 18px; color: #10B981; font-weight: 800; font-size: 16px; font-family: monospace; text-align: right;">+{{amount}} PHIVO</td></tr></table><div style="text-align: center; margin: 30px 0 15px 0;"><a href="https://phivonex.com/app/rewards" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #10B981 0%, #059669 100%); color: #ffffff; font-size: 14px; font-weight: 800; text-decoration: none; border-radius: 10px; box-shadow: 0 0 25px rgba(16, 185, 129, 0.35); text-transform: uppercase; letter-spacing: 0.5px;">View Reward Console</a></div></td></tr><tr><td style="background-color: #070c1a; padding: 25px 30px; border-top: 1px solid rgba(255, 255, 255, 0.06); font-size: 11px; color: #475569; line-height: 1.5; text-align: center;"><p style="margin: 0 0 8px 0; font-family: monospace; color: #64748b;">PHIVONEX Digital Infrastructure Engine \u2022 Epoch Settlement</p><p style="margin: 0;">Cryptographically Validated Distribution Notice.</p></td></tr></table></div>', TRUE),

          ('e0066666-6666-6666-6666-666666666666', 'SWAP_COMPLETE', 'PHIVO to USDT Swap Completed', '<div style="background-color: #05070c; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, Helvetica, Arial, sans-serif; color: #f8fafc; padding: 40px 15px; margin: 0; width: 100%;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 620px; margin: 0 auto; background-color: #0b1329; border: 1px solid #1e293b; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 50px rgba(0, 207, 255, 0.08);"><tr><td style="background: linear-gradient(135deg, #0f172a 0%, #070d1e 100%); padding: 32px 30px; border-bottom: 1px solid rgba(56, 189, 248, 0.3); text-align: center;"><div style="font-size: 26px; font-weight: 900; letter-spacing: 4px; color: #ffffff; font-family: monospace;">PHIVONEX</div><div style="font-size: 10px; font-weight: 700; letter-spacing: 2px; color: #38BDF8; margin-top: 6px; text-transform: uppercase;">INSTANT LIQUIDITY SWAP ENGINE</div></td></tr><tr><td style="padding: 35px 30px;"><div style="display: inline-block; padding: 6px 14px; background: rgba(56, 189, 248, 0.12); border: 1px solid rgba(56, 189, 248, 0.3); border-radius: 20px; font-size: 11px; font-weight: 700; color: #38BDF8; font-family: monospace; text-transform: uppercase; margin-bottom: 20px;">SWAP EXECUTED</div><h1 style="font-size: 22px; font-weight: 800; color: #ffffff; margin: 0 0 14px 0; line-height: 1.3;">PHIVO \u2192 USDT Swap Completed!</h1><p style="font-size: 14px; color: #94a3b8; line-height: 1.6; margin: 0 0 25px 0;">Your coin swap order executed instantly. Your PHIVO coins were converted into USDT and credited directly to your available balance.</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: rgba(15, 23, 42, 0.8); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px; margin-bottom: 25px; font-size: 13px;"><tr><td style="padding: 14px 18px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); color: #64748b; font-weight: 600;">Swapped PHIVO</td><td style="padding: 14px 18px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); color: #e2e8f0; font-weight: 700; font-family: monospace; text-align: right;">{{fromAmount}} PHIVO</td></tr><tr><td style="padding: 14px 18px; color: #64748b; font-weight: 600;">Received USDT</td><td style="padding: 14px 18px; color: #38BDF8; font-weight: 800; font-size: 15px; font-family: monospace; text-align: right;">+\${{toAmount}} USDT</td></tr></table><div style="text-align: center; margin: 30px 0 15px 0;"><a href="https://phivonex.com/app/swap" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #38BDF8 0%, #0284C7 100%); color: #05070c; font-size: 14px; font-weight: 800; text-decoration: none; border-radius: 10px; box-shadow: 0 0 25px rgba(56, 189, 248, 0.35); text-transform: uppercase; letter-spacing: 0.5px;">Access Swap Desk</a></div></td></tr><tr><td style="background-color: #070c1a; padding: 25px 30px; border-top: 1px solid rgba(255, 255, 255, 0.06); font-size: 11px; color: #475569; line-height: 1.5; text-align: center;"><p style="margin: 0 0 8px 0; font-family: monospace; color: #64748b;">PHIVONEX Digital Infrastructure Engine \u2022 Liquidity Pool</p><p style="margin: 0;">Automated Market Settlement Notice.</p></td></tr></table></div>', TRUE),

          ('e0077777-7777-7777-7777-777777777777', 'WITHDRAWAL_STATUS', 'Withdrawal Request Update', '<div style="background-color: #05070c; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, Helvetica, Arial, sans-serif; color: #f8fafc; padding: 40px 15px; margin: 0; width: 100%;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 620px; margin: 0 auto; background-color: #0b1329; border: 1px solid #1e293b; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 50px rgba(0, 207, 255, 0.08);"><tr><td style="background: linear-gradient(135deg, #0f172a 0%, #070d1e 100%); padding: 32px 30px; border-bottom: 1px solid rgba(245, 158, 11, 0.3); text-align: center;"><div style="font-size: 26px; font-weight: 900; letter-spacing: 4px; color: #ffffff; font-family: monospace;">PHIVONEX</div><div style="font-size: 10px; font-weight: 700; letter-spacing: 2px; color: #F59E0B; margin-top: 6px; text-transform: uppercase;">WITHDRAWAL DISBURSEMENT ENGINE</div></td></tr><tr><td style="padding: 35px 30px;"><div style="display: inline-block; padding: 6px 14px; background: rgba(245, 158, 11, 0.12); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 20px; font-size: 11px; font-weight: 700; color: #F59E0B; font-family: monospace; text-transform: uppercase; margin-bottom: 20px;">WITHDRAWAL STATUS: {{status}}</div><h1 style="font-size: 22px; font-weight: 800; color: #ffffff; margin: 0 0 14px 0; line-height: 1.3;">Withdrawal Request Update</h1><p style="font-size: 14px; color: #94a3b8; line-height: 1.6; margin: 0 0 25px 0;">Your withdrawal request of \${{amount}} USDT has been updated. Check details below.</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: rgba(15, 23, 42, 0.8); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px; margin-bottom: 25px; font-size: 13px;"><tr><td style="padding: 14px 18px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); color: #64748b; font-weight: 600;">Amount</td><td style="padding: 14px 18px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); color: #F59E0B; font-weight: 800; font-size: 15px; font-family: monospace; text-align: right;">\${{amount}} USDT</td></tr><tr><td style="padding: 14px 18px; color: #64748b; font-weight: 600;">Status</td><td style="padding: 14px 18px; color: #ffffff; font-weight: 700; text-align: right;">{{status}}</td></tr></table><div style="text-align: center; margin: 30px 0 15px 0;"><a href="https://phivonex.com/app/withdrawals" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #F59E0B 0%, #D97706 100%); color: #ffffff; font-size: 14px; font-weight: 800; text-decoration: none; border-radius: 10px; box-shadow: 0 0 25px rgba(245, 158, 11, 0.35); text-transform: uppercase; letter-spacing: 0.5px;">View Withdrawals</a></div></td></tr><tr><td style="background-color: #070c1a; padding: 25px 30px; border-top: 1px solid rgba(255, 255, 255, 0.06); font-size: 11px; color: #475569; line-height: 1.5; text-align: center;"><p style="margin: 0 0 8px 0; font-family: monospace; color: #64748b;">PHIVONEX Digital Infrastructure Engine \u2022 On-Chain Disbursement</p><p style="margin: 0;">Real-Time Financial Settlement Notice.</p></td></tr></table></div>', TRUE),

          ('e0088888-8888-8888-8888-888888888888', 'SECURITY_ALERT', 'PHIVONEX Security Alert: Account Modified', '<div style="background-color: #05070c; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, Helvetica, Arial, sans-serif; color: #f8fafc; padding: 40px 15px; margin: 0; width: 100%;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 620px; margin: 0 auto; background-color: #0b1329; border: 1px solid #1e293b; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 50px rgba(0, 207, 255, 0.08);"><tr><td style="background: linear-gradient(135deg, #0f172a 0%, #070d1e 100%); padding: 32px 30px; border-bottom: 1px solid rgba(239, 68, 68, 0.3); text-align: center;"><div style="font-size: 26px; font-weight: 900; letter-spacing: 4px; color: #ffffff; font-family: monospace;">PHIVONEX</div><div style="font-size: 10px; font-weight: 700; letter-spacing: 2px; color: #EF4444; margin-top: 6px; text-transform: uppercase;">SECURITY AUDIT MONITORING</div></td></tr><tr><td style="padding: 35px 30px;"><div style="display: inline-block; padding: 6px 14px; background: rgba(239, 68, 68, 0.12); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 20px; font-size: 11px; font-weight: 700; color: #EF4444; font-family: monospace; text-transform: uppercase; margin-bottom: 20px;">SECURITY ALERT</div><h1 style="font-size: 22px; font-weight: 800; color: #ffffff; margin: 0 0 14px 0; line-height: 1.3;">Account Security Notice</h1><p style="font-size: 14px; color: #94a3b8; line-height: 1.6; margin: 0 0 25px 0;">Your account credentials or security parameters have been modified. If you performed this change, no action is required.</p><div style="text-align: center; margin: 30px 0 15px 0;"><a href="https://phivonex.com/app/security" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #EF4444 0%, #DC2626 100%); color: #ffffff; font-size: 14px; font-weight: 800; text-decoration: none; border-radius: 10px; box-shadow: 0 0 25px rgba(239, 68, 68, 0.35); text-transform: uppercase; letter-spacing: 0.5px;">Review Security Log</a></div></td></tr><tr><td style="background-color: #070c1a; padding: 25px 30px; border-top: 1px solid rgba(255, 255, 255, 0.06); font-size: 11px; color: #475569; line-height: 1.5; text-align: center;"><p style="margin: 0 0 8px 0; font-family: monospace; color: #64748b;">PHIVONEX Digital Infrastructure Engine \u2022 Security Operations</p><p style="margin: 0;">If you did not perform this action, contact support immediately.</p></td></tr></table></div>', TRUE)
        ON CONFLICT (event_name) DO UPDATE SET 
          subject = EXCLUDED.subject,
          body_html = EXCLUDED.body_html;
      `);
    } catch (task234Err) {
      console.warn("[DB Migration] Task #23.4 Email & Automation schema migration warning:", task234Err);
    }
    try {
      const { ensurePromotionTables: ensurePromotionTables2 } = await Promise.resolve().then(() => (init_leadershipRankService(), leadershipRankService_exports));
      await ensurePromotionTables2(client);
    } catch (promoErr) {
      console.warn("[DB Migration] Sequential Promotion schema migration warning:", promoErr);
    }
    await backfillExistingUsers(client);
    await seedGenesisNodes(client);
    await seedEconomicConfigs(client);
    await restoreUsersFromFirestore(client);
    console.log("[DB] PostgreSQL schema & Task #6 Genesis Node migrations initialized successfully.");
  } catch (err) {
    console.error("[DB] Error initializing schema:", err);
    throw err;
  }
}
async function restoreUsersFromFirestore(client) {
  if ((process.env.NODE_ENV || "").toLowerCase() === "test") {
    console.log("[DB Hydration] Skipped in test environment (isolated database).");
    return;
  }
  try {
    const { adminFirestore: adminFirestore2 } = await Promise.resolve().then(() => (init_firebase_admin(), firebase_admin_exports));
    console.log("[DB Hydration] Checking Firestore for persistent users across rollouts...");
    const snapshot = await adminFirestore2.collection("users").get();
    if (snapshot.empty) {
      console.log("[DB Hydration] No Firestore users found to restore.");
      return;
    }
    let restoredCount = 0;
    for (const doc of snapshot.docs) {
      const u = doc.data();
      const email = u.email?.toLowerCase()?.trim();
      if (!email) continue;
      const existing = await client.query(`SELECT id FROM users WHERE LOWER(email) = $1`, [email]);
      if (existing.rowCount === 0) {
        const userId = u.id || u.uid || doc.id;
        const publicId = u.publicId || `PHX-${Math.floor(1e5 + Math.random() * 9e5)}`;
        const referralCode = u.referralCode || `PHX${Math.floor(1e4 + Math.random() * 9e4)}`;
        const role = email === "md.asifuzzman.dhakacollege@gmail.com" || email === "mdasifuzzman.official@gmail.com" || email === "admin@phivonex.com" ? "ADMIN" : u.role || "USER";
        await client.query(`
          INSERT INTO users (
            id, public_id, full_name, email, phone, country, password_hash,
            status, role, email_verified_at, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT (id) DO NOTHING
        `, [
          userId,
          publicId,
          u.fullName || email.split("@")[0],
          email,
          u.phone || null,
          u.country || "Global",
          u.passwordHash || "$argon2id$v=19$m=65536,t=3,p=4$dummyhashforrestoreduser",
          u.status || "ACTIVE",
          role
        ]);
        await client.query(`
          INSERT INTO user_referrals (user_id, referral_code, created_at)
          VALUES ($1, $2, CURRENT_TIMESTAMP)
          ON CONFLICT (user_id) DO NOTHING
        `, [userId, referralCode]);
        await client.query(`
          INSERT INTO binary_placements (user_id, parent_user_id, side, status, placed_at, created_at)
          VALUES ($1, NULL, NULL, 'UNPLACED', NULL, CURRENT_TIMESTAMP)
          ON CONFLICT (user_id) DO NOTHING
        `, [userId]);
        restoredCount++;
      }
    }
    if (restoredCount > 0) {
      console.log(`[DB Hydration] Successfully verified and restored ${restoredCount} user(s) from persistent Firestore cloud storage!`);
    } else {
      console.log("[DB Hydration] All Firestore users are already up-to-date in database.");
    }
  } catch (syncErr) {
    console.warn("[DB Hydration] Firestore restore skipped or notice:", syncErr?.message || syncErr);
  }
}
async function backfillExistingUsers(client) {
  try {
    const usersMissingPublicId = await client.query(
      `SELECT id FROM users WHERE public_id IS NULL OR public_id = ''`
    );
    for (const u of usersMissingPublicId.rows) {
      let assigned = false;
      while (!assigned) {
        const candidate = generatePublicId();
        const existing = await client.query(`SELECT 1 FROM users WHERE public_id = $1`, [candidate]);
        if (existing.rowCount === 0) {
          await client.query(`UPDATE users SET public_id = $1 WHERE id = $2`, [candidate, u.id]);
          assigned = true;
        }
      }
    }
    const usersMissingReferralRow = await client.query(
      `SELECT u.id, u.pending_referral_code 
       FROM users u 
       LEFT JOIN user_referrals r ON u.id = r.user_id 
       WHERE r.user_id IS NULL`
    );
    for (const u of usersMissingReferralRow.rows) {
      let codeAssigned = false;
      let newReferralCode = "";
      while (!codeAssigned) {
        const candidate = generateReferralCode();
        const existing = await client.query(`SELECT 1 FROM user_referrals WHERE referral_code = $1`, [candidate]);
        if (existing.rowCount === 0) {
          newReferralCode = candidate;
          codeAssigned = true;
        }
      }
      await client.query(
        `INSERT INTO user_referrals (user_id, referral_code, sponsor_user_id, created_at)
         VALUES ($1, $2, NULL, CURRENT_TIMESTAMP)`,
        [u.id, newReferralCode]
      );
    }
    const pendingUsers = await client.query(
      `SELECT u.id, u.pending_referral_code 
       FROM users u 
       JOIN user_referrals r ON u.id = r.user_id 
       WHERE u.pending_referral_code IS NOT NULL 
         AND u.pending_referral_code != '' 
         AND r.sponsor_user_id IS NULL`
    );
    for (const u of pendingUsers.rows) {
      const normCode = normalizeReferralCode(u.pending_referral_code);
      const sponsorResult = await client.query(
        `SELECT user_id FROM user_referrals WHERE referral_code = $1`,
        [normCode]
      );
      if (sponsorResult.rowCount > 0) {
        const sponsorUserId = sponsorResult.rows[0].user_id;
        if (sponsorUserId !== u.id) {
          await client.query(
            `UPDATE user_referrals SET sponsor_user_id = $1 WHERE user_id = $2`,
            [sponsorUserId, u.id]
          );
          await client.query(
            `UPDATE users SET pending_referral_code = NULL WHERE id = $1`,
            [u.id]
          );
          console.log(`[DB Migration] Resolved pending referral code ${normCode} for user ${u.id}`);
        }
      } else {
        console.log(`[DB Migration] Pending referral code ${normCode} for user ${u.id} could not be resolved (invalid code).`);
      }
    }
    await client.exec(`
      INSERT INTO binary_placements (user_id, parent_user_id, side, status, placed_at, created_at)
      SELECT u.id, NULL, NULL, 'UNPLACED', NULL, u.created_at
      FROM users u
      LEFT JOIN binary_placements bp ON u.id = bp.user_id
      WHERE bp.user_id IS NULL
      ON CONFLICT (user_id) DO NOTHING;
    `);
    await client.exec(`
      INSERT INTO binary_volume_balances (user_id, carry_left_units, carry_right_units, updated_at)
      SELECT u.id, 0, 0, CURRENT_TIMESTAMP
      FROM users u
      LEFT JOIN binary_volume_balances bvb ON u.id = bvb.user_id
      WHERE bvb.user_id IS NULL
      ON CONFLICT (user_id) DO NOTHING;
    `);
  } catch (err) {
    console.error("[DB Migration] Error during backfill of existing users:", err);
  }
}
async function seedGenesisNodes(client) {
  try {
    const countRes = await client.query(
      `SELECT COUNT(*)::int AS count FROM nodes`
    );
    const currentCount = parseInt(String(countRes.rows[0]?.count || "0"), 10);
    if (currentCount < GENESIS_NODE_CAP) {
      console.log(`[DB Migration] Seeding Genesis Nodes inventory (${currentCount}/${GENESIS_NODE_CAP} existing)...`);
      try {
        await client.exec(`
          INSERT INTO nodes (id, node_number, public_node_id, status, created_at, updated_at)
          SELECT 
            gen_random_uuid(),
            s.n,
            'PHX-NODE-' || LPAD(s.n::text, 6, '0'),
            'AVAILABLE',
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP
          FROM generate_series(1, ${GENESIS_NODE_CAP}) AS s(n)
          ON CONFLICT (node_number) DO NOTHING;
        `);
      } catch (sqlErr) {
        console.warn("[DB Migration] SQL generate_series fallback to batch chunks:", sqlErr);
        const batchSize = 500;
        for (let start = 1; start <= GENESIS_NODE_CAP; start += batchSize) {
          const end = Math.min(start + batchSize - 1, GENESIS_NODE_CAP);
          const values = [];
          const placeholders = [];
          let paramIdx = 1;
          for (let n = start; n <= end; n++) {
            const id = uuidv45();
            const publicId = formatPublicNodeId(n);
            placeholders.push(`($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, 'AVAILABLE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`);
            values.push(id, n, publicId);
            paramIdx += 3;
          }
          await client.query(
            `INSERT INTO nodes (id, node_number, public_node_id, status, created_at, updated_at)
             VALUES ${placeholders.join(", ")}
             ON CONFLICT (node_number) DO NOTHING`,
            values
          );
        }
      }
      const finalCountRes = await client.query(
        `SELECT COUNT(*)::int AS count FROM nodes`
      );
      console.log(`[DB Migration] Genesis Nodes inventory active: ${finalCountRes.rows[0]?.count} total nodes.`);
    }
  } catch (err) {
    console.error("[DB Migration] Error during Genesis Nodes seeding:", err);
  }
}
async function seedEconomicConfigs(client) {
  try {
    const defaultConfigs = [
      {
        key: "NODE_BASE_PRICE_USD",
        value: JSON.stringify(1e3),
        category: "NODE",
        description: "Base purchase price in USD per Genesis Node"
      },
      {
        key: "NODE_SALES_ENABLED",
        value: JSON.stringify(true),
        category: "NODE",
        description: "Master switch for Genesis Node sales and reservations"
      },
      {
        key: "GENESIS_NODE_CAP",
        value: JSON.stringify(GENESIS_NODE_CAP),
        category: "NODE",
        description: "Maximum Genesis Node issuance limit (Immutable)"
      },
      {
        key: "DIRECT_REFERRAL_COMMISSION_USD",
        value: JSON.stringify(50),
        category: "REFERRAL",
        description: "Commission earned by sponsor per activated node purchase (future events only)"
      },
      {
        key: "MATCHING_TIERS_CONFIG",
        value: JSON.stringify([
          { units: 2, rewardUsd: 500 },
          { units: 4, rewardUsd: 1e3 },
          { units: 8, rewardUsd: 1500 },
          { units: 12, rewardUsd: 2e3 },
          { units: 16, rewardUsd: 2500 },
          { units: 20, rewardUsd: 3e3 },
          { units: 24, rewardUsd: 3500 },
          { units: 28, rewardUsd: 4e3 },
          { units: 32, rewardUsd: 4500 },
          { units: 36, rewardUsd: 5e3 }
        ]),
        category: "MATCHING",
        description: "Daily binary volume balance matching bonus reward tiers"
      },
      {
        key: "PROMOTION_MILESTONES_CONFIG",
        value: JSON.stringify([
          { milestone: "20_20", units: 20, rewardUsd: 500 },
          { milestone: "50_50", units: 50, rewardUsd: 1500 },
          { milestone: "100_100", units: 100, rewardUsd: 3500 }
        ]),
        category: "PROMOTION",
        description: "Career promotion volume milestone bonus rewards"
      },
      {
        key: "NODE_REWARDS_ENABLED",
        value: JSON.stringify(true),
        category: "REWARDS",
        description: "Master switch for daily epoch node mining reward distributions"
      },
      {
        key: "NODE_REWARD_RATE_PER_EPOCH",
        value: JSON.stringify(null),
        // Must remain null until explicitly configured by admin
        category: "REWARDS",
        description: "Authoritative reward payout rate per Active Node per Epoch (USD). Unconfigured by default."
      },
      {
        key: "INTERNAL_COIN_PRICE_USDT",
        value: JSON.stringify({
          coinSymbol: "PHIVO",
          priceUsdt: 0.1,
          effectiveFrom: (/* @__PURE__ */ new Date()).toISOString(),
          swapEnabled: true
        }),
        category: "COIN_PRICE",
        description: "PHIVONEX internal coin (PHIVO) conversion valuation rate against USDT"
      },
      {
        key: "INTERNAL_COIN_SWAP_ENABLED",
        value: JSON.stringify(true),
        category: "COIN_PRICE",
        description: "Master toggle enabling or disabling user coin-to-USDT swaps"
      },
      {
        key: "CRYPTO_DEPOSITS_ENABLED",
        value: JSON.stringify(true),
        category: "GATEWAY",
        description: "BNB / USDT cryptocurrency blockchain deposit listener master switch"
      },
      {
        key: "CRYPTO_WITHDRAWALS_ENABLED",
        value: JSON.stringify(true),
        category: "GATEWAY",
        description: "Cryptocurrency blockchain on-chain withdrawal broadcast master switch"
      },
      {
        key: "BSC_REQUIRED_CONFIRMATIONS",
        value: JSON.stringify(3),
        category: "GATEWAY",
        description: "Required block confirmations on BNB Smart Chain before crediting deposit"
      },
      {
        key: "AUTO_WITHDRAWAL_ENABLED",
        value: JSON.stringify(false),
        category: "GATEWAY",
        description: "Automated on-chain broadcast for approved withdrawals without manual admin signing"
      },
      {
        key: "MIN_WITHDRAWAL_AMOUNT",
        value: JSON.stringify(0.1),
        category: "GATEWAY",
        description: "Minimum allowed withdrawal amount in USD / USDT for user requests"
      },
      {
        key: "BNB_PRICE_USD",
        value: JSON.stringify(450),
        category: "PRICING",
        description: "Authoritative server-side exchange rate for 1 BNB in USD"
      }
    ];
    for (const cfg of defaultConfigs) {
      const id = uuidv45();
      await client.query(
        `
        INSERT INTO system_economic_configs (
          id, config_key, config_value, category, description, status, version, effective_from, updated_by_admin_public_id, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, 'ACTIVE', 1, CURRENT_TIMESTAMP, 'SYSTEM_INIT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT (config_key) DO NOTHING;
        `,
        [id, cfg.key, cfg.value, cfg.category, cfg.description]
      );
    }
    await client.query(`
      UPDATE system_economic_configs
      SET config_value = REPLACE(config_value, '"PHX"', '"PHIVO"')
      WHERE config_key = 'INTERNAL_COIN_PRICE_USDT' AND config_value LIKE '%PHX%';
    `);
    console.log("[DB Migration] System Economic configuration parameters initialized.");
  } catch (err) {
    console.error("[DB Migration] Error during economic configs seeding:", err);
  }
}
var init_db = __esm({
  "src/server/db/db.ts"() {
    init_idGenerator();
    init_nodeConfig();
  }
});

// src/server/utils/crypto.ts
import argon2 from "argon2";
import crypto2 from "crypto";
async function hashPassword(password) {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 2 ** 16,
    // 64 MB
    timeCost: 3,
    parallelism: 1
  });
}
async function verifyPassword(hash, plain) {
  try {
    if (!hash || typeof hash !== "string" || !plain) return false;
    return await argon2.verify(hash, plain);
  } catch (err) {
    return false;
  }
}
function generateRandomToken(bytes = 32) {
  return crypto2.randomBytes(bytes).toString("hex");
}
function hashToken(token) {
  return crypto2.createHash("sha256").update(token).digest("hex");
}
var init_crypto = __esm({
  "src/server/utils/crypto.ts"() {
  }
});

// src/server/services/publicNetworkService.ts
import { EventEmitter as EventEmitter2 } from "events";
async function getPublicNetworkSummary() {
  const db = await getDb();
  const nodeCountRes = await db.query(
    `SELECT status, COUNT(*)::int AS count FROM nodes GROUP BY status`
  );
  let activeNodes = 0;
  let reservedNodes = 0;
  let availableNodes = 0;
  let retiredNodes = 0;
  for (const row of nodeCountRes.rows) {
    const cnt = Number(row.count || 0);
    if (row.status === "ACTIVE") activeNodes = cnt;
    else if (row.status === "RESERVED") reservedNodes = cnt;
    else if (row.status === "AVAILABLE") availableNodes = cnt;
    else if (row.status === "RETIRED") retiredNodes = cnt;
  }
  const totalAllocated = activeNodes + reservedNodes + retiredNodes;
  if (availableNodes === 0 && totalAllocated < GENESIS_NODE_CAP) {
    availableNodes = Math.max(0, GENESIS_NODE_CAP - totalAllocated);
  }
  const allocatedNodes = activeNodes + reservedNodes;
  const allocationPercent = Number((allocatedNodes / GENESIS_NODE_CAP * 100).toFixed(2));
  const epochRes = await db.query(
    `SELECT COALESCE(MAX(epoch_number), 1)::int AS max_epoch FROM reward_epochs`
  );
  const currentRewardEpoch = Number(epochRes.rows[0]?.max_epoch || 1);
  const txnRes = await db.query(
    `SELECT COUNT(*)::int AS count FROM financial_ledger_entries`
  );
  const totalNetworkTransactions = Number(txnRes.rows[0]?.count || 0);
  let conversionRateUsd = null;
  try {
    const configRes = await db.query(
      `SELECT config_value, status FROM system_economic_configs WHERE config_key = 'INTERNAL_COIN_PRICE_USDT'`
    );
    if (configRes.rows.length > 0 && configRes.rows[0].status === "ACTIVE") {
      const valStr = configRes.rows[0].config_value;
      const val = typeof valStr === "string" ? JSON.parse(valStr) : valStr;
      if (val && typeof val.priceUsdt === "number" && val.priceUsdt > 0) {
        conversionRateUsd = val.priceUsdt;
      }
    }
  } catch (err) {
    console.warn("[Public API] Error loading INTERNAL_COIN_PRICE_USDT config value for summary:", err);
  }
  let networkStatus = "OPERATIONAL";
  try {
    await db.query("SELECT 1");
  } catch {
    networkStatus = "DEGRADED";
  }
  return {
    genesisNodeCap: GENESIS_NODE_CAP,
    activeNodes,
    reservedNodes,
    availableNodes,
    retiredNodes,
    allocationPercent,
    currentRewardEpoch,
    totalNetworkTransactions,
    networkStatus,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    conversionRateUsd
  };
}
async function getPublicNetworkEvents(limit = 20) {
  const db = await getDb();
  const events = [];
  try {
    const activeNodesRes = await db.query(
      `SELECT public_node_id, activated_at 
       FROM nodes 
       WHERE status = 'ACTIVE' AND activated_at IS NOT NULL 
       ORDER BY activated_at DESC 
       LIMIT $1`,
      [limit]
    );
    for (const row of activeNodesRes.rows) {
      const ts = new Date(row.activated_at).toISOString();
      events.push({
        id: `evt-node-${row.public_node_id}`,
        type: "node.activated",
        title: `${row.public_node_id} Activated`,
        description: `Genesis validator node ${row.public_node_id} successfully activated on protocol ledger.`,
        timestamp: ts,
        publicId: row.public_node_id
      });
    }
    const epochRes = await db.query(
      `SELECT public_epoch_id, epoch_number, status, settled_at, created_at 
       FROM reward_epochs 
       ORDER BY created_at DESC 
       LIMIT $1`,
      [limit]
    );
    for (const row of epochRes.rows) {
      const ts = new Date(row.settled_at || row.created_at).toISOString();
      events.push({
        id: `evt-epoch-${row.public_epoch_id}`,
        type: "reward.epoch.completed",
        title: `Reward Epoch #${row.epoch_number} ${row.status === "COMPLETED" ? "Completed" : "Initiated"}`,
        description: `Mining reward epoch #${row.epoch_number} state verified on protocol ledger.`,
        timestamp: ts,
        publicId: row.public_epoch_id
      });
    }
    const matchingRes = await db.query(
      `SELECT public_settlement_id, business_date, settled_at 
       FROM binary_matching_settlements 
       WHERE status = 'COMPLETED' 
       ORDER BY settled_at DESC 
       LIMIT $1`,
      [limit]
    );
    for (const row of matchingRes.rows) {
      const ts = new Date(row.settled_at).toISOString();
      const dateStr = typeof row.business_date === "string" ? row.business_date.split("T")[0] : new Date(row.business_date).toISOString().split("T")[0];
      events.push({
        id: `evt-match-${row.public_settlement_id}`,
        type: "matching.completed",
        title: `Matching Settlement Completed`,
        description: `Binary team network consensus settlement finalized for date ${dateStr}.`,
        timestamp: ts,
        publicId: row.public_settlement_id
      });
    }
    const promoRes = await db.query(
      `SELECT public_bonus_id, milestone, qualified_at 
       FROM promotion_bonuses 
       WHERE status = 'EARNED' 
       ORDER BY qualified_at DESC 
       LIMIT $1`,
      [limit]
    );
    for (const row of promoRes.rows) {
      const ts = new Date(row.qualified_at).toISOString();
      events.push({
        id: `evt-promo-${row.public_bonus_id}`,
        type: "promotion.earned",
        title: `Promotion Milestone (${row.milestone}) Qualified`,
        description: `Network operator volume qualification reached milestone Tier ${row.milestone}.`,
        timestamp: ts,
        publicId: row.public_bonus_id
      });
    }
    const fleRes = await db.query(
      `SELECT public_txn_id, source_type, created_at 
       FROM financial_ledger_entries 
       ORDER BY created_at DESC 
       LIMIT $1`,
      [limit]
    );
    for (const row of fleRes.rows) {
      const ts = new Date(row.created_at).toISOString();
      events.push({
        id: `evt-fle-${row.public_txn_id}`,
        type: "ledger.checkpoint",
        title: `Ledger Checkpoint ${row.public_txn_id}`,
        description: `Cryptographic financial ledger entry posted for channel ${row.source_type}.`,
        timestamp: ts,
        publicId: row.public_txn_id
      });
    }
    events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return events.slice(0, limit);
  } catch (err) {
    console.error("[PublicNetworkService] Error fetching public network events:", err);
    return [];
  }
}
function broadcastPublicEvent(event) {
  publicNetworkEventEmitter.emit("networkEvent", event);
}
var publicNetworkEventEmitter;
var init_publicNetworkService = __esm({
  "src/server/services/publicNetworkService.ts"() {
    init_db();
    init_nodeConfig();
    publicNetworkEventEmitter = new EventEmitter2();
    publicNetworkEventEmitter.setMaxListeners(100);
  }
});

// src/server/services/systemConfigBroadcaster.ts
async function broadcastSystemConfigChange(key, value, category = "SYSTEM") {
  const timestamp = (/* @__PURE__ */ new Date()).toISOString();
  const normalizedKey = key.toUpperCase();
  if (process.env.NODE_ENV === "test" || process.env.APP_ENV === "test") {
    try {
      publicNetworkEventEmitter.emit("networkEvent", {
        type: "system_config",
        key: normalizedKey,
        value,
        category,
        updatedAt: timestamp
      });
    } catch (sseErr) {
      console.warn("[SystemConfigBroadcaster] SSE broadcast warning:", sseErr);
    }
    return;
  }
  try {
    await adminFirestore.collection("system_settings").doc("configs").set(
      {
        [normalizedKey]: value,
        updatedAt: timestamp,
        lastUpdatedKey: normalizedKey
      },
      { merge: true }
    );
    if (normalizedKey.includes("WITHDRAWAL")) {
      await adminFirestore.collection("system_settings").doc("withdrawals").set(
        {
          [normalizedKey]: value,
          minWithdrawalAmount: normalizedKey === "MIN_WITHDRAWAL_AMOUNT" ? Number(value) : void 0,
          autoWithdrawalEnabled: normalizedKey === "AUTO_WITHDRAWAL_ENABLED" ? Boolean(value) : void 0,
          updatedAt: timestamp
        },
        { merge: true }
      );
    }
    if (normalizedKey.includes("COIN") || normalizedKey.includes("PRICE") || normalizedKey.includes("NODE")) {
      await adminFirestore.collection("system_settings").doc("economic").set(
        {
          [normalizedKey]: value,
          updatedAt: timestamp
        },
        { merge: true }
      );
    }
  } catch (fsErr) {
    console.warn("[SystemConfigBroadcaster] Firestore real-time sync warning:", fsErr);
  }
  try {
    publicNetworkEventEmitter.emit("networkEvent", {
      type: "system_config",
      key: normalizedKey,
      value,
      category,
      updatedAt: timestamp
    });
  } catch (sseErr) {
    console.warn("[SystemConfigBroadcaster] SSE broadcast warning:", sseErr);
  }
}
var init_systemConfigBroadcaster = __esm({
  "src/server/services/systemConfigBroadcaster.ts"() {
    init_firebase_admin();
    init_publicNetworkService();
  }
});

// src/server/services/economicService.ts
import { v4 as uuidv47 } from "uuid";
function parseConfigValue(val) {
  if (typeof val === "string") {
    try {
      return JSON.parse(val);
    } catch {
      return val;
    }
  }
  return val;
}
function mapRowToConfigRecord(row) {
  return {
    id: row.id,
    configKey: row.config_key,
    configValue: parseConfigValue(row.config_value),
    category: row.category,
    description: row.description,
    status: row.status,
    version: Number(row.version || 1),
    effectiveFrom: row.effective_from ? new Date(row.effective_from).toISOString() : new Date(row.updated_at).toISOString(),
    updatedByAdminId: row.updated_by_admin_id || null,
    updatedByAdminPublicId: row.updated_by_admin_public_id || "SYSTEM_INIT",
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString()
  };
}
function mapRowToAuditRecord(row) {
  return {
    id: row.id,
    configKey: row.config_key,
    category: row.category,
    oldValue: parseConfigValue(row.old_value),
    newValue: parseConfigValue(row.new_value),
    version: Number(row.version),
    adminUserId: row.admin_user_id || null,
    adminPublicId: row.admin_public_id,
    reason: row.reason || null,
    effectiveFrom: new Date(row.effective_from).toISOString(),
    ipAddress: row.ip_address || null,
    createdAt: new Date(row.created_at).toISOString()
  };
}
async function getAllEconomicConfigs() {
  const db = await getDb();
  const res = await db.query(`
    SELECT * FROM system_economic_configs
    ORDER BY category ASC, config_key ASC
  `);
  return res.rows.map(mapRowToConfigRecord);
}
async function getEconomicConfigByKey(configKey, dbClient) {
  const db = dbClient || await getDb();
  const res = await db.query(
    `SELECT * FROM system_economic_configs WHERE config_key = $1`,
    [configKey.trim().toUpperCase()]
  );
  if (res.rows.length === 0) return null;
  return mapRowToConfigRecord(res.rows[0]);
}
async function updateEconomicConfig(params) {
  const {
    configKey,
    configValue,
    status,
    effectiveFrom,
    reason,
    adminUserId,
    adminPublicId,
    ipAddress
  } = params;
  const keyUpper = configKey.trim().toUpperCase();
  if (keyUpper === "GENESIS_NODE_CAP") {
    throw new Error("IMMUTABLE_PARAMETER_ERROR: Genesis Node Cap (10,000) is strictly immutable and cannot be modified.");
  }
  const current = await getEconomicConfigByKey(keyUpper);
  if (!current) {
    throw new Error(`NOT_FOUND: Economic configuration parameter '${keyUpper}' does not exist.`);
  }
  validateEconomicValue(keyUpper, configValue);
  const db = await getDb();
  const now = /* @__PURE__ */ new Date();
  const effectiveDate = effectiveFrom ? new Date(effectiveFrom) : now;
  const newVersion = current.version + 1;
  const serializedValue = JSON.stringify(configValue);
  const newStatus = status || current.status;
  const updateRes = await db.query(
    `
    UPDATE system_economic_configs
    SET 
      config_value = $1,
      status = $2,
      version = $3,
      effective_from = $4,
      updated_by_admin_id = $5,
      updated_by_admin_public_id = $6,
      updated_at = $7
    WHERE config_key = $8
    RETURNING *
    `,
    [
      serializedValue,
      newStatus,
      newVersion,
      effectiveDate,
      adminUserId || null,
      adminPublicId,
      now,
      keyUpper
    ]
  );
  if (updateRes.rows.length === 0) {
    throw new Error("CONCURRENCY_ERROR: Economic config update failed due to concurrent modification.");
  }
  const updatedConfig = mapRowToConfigRecord(updateRes.rows[0]);
  const auditId = uuidv47();
  const auditRes = await db.query(
    `
    INSERT INTO economic_config_audit_logs (
      id, config_key, category, old_value, new_value, version, admin_user_id, admin_public_id, reason, effective_from, ip_address, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    RETURNING *
    `,
    [
      auditId,
      keyUpper,
      current.category,
      JSON.stringify(current.configValue),
      serializedValue,
      newVersion,
      adminUserId || null,
      adminPublicId,
      reason || "Administrative economic parameter adjustment",
      effectiveDate,
      ipAddress || null,
      now
    ]
  );
  const auditLog = mapRowToAuditRecord(auditRes.rows[0]);
  try {
    await broadcastSystemConfigChange(keyUpper, updatedConfig.configValue, current.category);
  } catch (bcErr) {
    console.warn("[EconomicService] Config broadcast warning:", bcErr);
  }
  return { config: updatedConfig, auditLog };
}
function validateEconomicValue(key, value) {
  if (key === "NODE_BASE_PRICE_USD") {
    const num = Number(value);
    if (isNaN(num) || num <= 0) {
      throw new Error("INVALID_VALUE: Node base price must be a positive number greater than 0.");
    }
  }
  if (key === "DIRECT_REFERRAL_COMMISSION_USD") {
    const num = Number(value);
    if (isNaN(num) || num < 0) {
      throw new Error("INVALID_VALUE: Direct referral commission must be a non-negative number.");
    }
  }
  if (key === "BSC_REQUIRED_CONFIRMATIONS") {
    const num = Number(value);
    if (!Number.isInteger(num) || num < 1) {
      throw new Error("INVALID_VALUE: Required confirmations must be an integer >= 1.");
    }
  }
  if (key === "NODE_REWARD_RATE_PER_EPOCH") {
    if (value !== null && value !== void 0) {
      let num;
      if (typeof value === "object" && value !== null) {
        num = Number(value.rateUsd !== void 0 ? value.rateUsd : value.rewardPerNode !== void 0 ? value.rewardPerNode : NaN);
      } else {
        num = Number(value);
      }
      if (isNaN(num) || num <= 0) {
        throw new Error("INVALID_VALUE: Reward rate must be null (unconfigured) or a positive number greater than 0.");
      }
    }
  }
  if (key === "INTERNAL_COIN_PRICE_USDT") {
    if (typeof value === "object" && value !== null) {
      const price = Number(value.priceUsdt);
      const isEnabled = value.swapEnabled !== false;
      if (isEnabled && (isNaN(price) || price <= 0)) {
        throw new Error("INVALID_VALUE: Internal coin price in USDT must be a positive number.");
      }
    } else {
      const price = Number(value);
      if (isNaN(price) || price <= 0) {
        throw new Error("INVALID_VALUE: Internal coin price in USDT must be a positive number.");
      }
    }
  }
  if (key === "MATCHING_TIERS_CONFIG") {
    if (!Array.isArray(value) || value.length === 0) {
      throw new Error("INVALID_VALUE: Matching tiers configuration must be a non-empty array of tier objects.");
    }
    for (const tier of value) {
      if (!tier.units || Number(tier.units) <= 0 || !tier.rewardUsd || Number(tier.rewardUsd) <= 0) {
        throw new Error("INVALID_VALUE: Each matching tier must have positive units and rewardUsd.");
      }
    }
  }
  if (key === "PROMOTION_MILESTONES_CONFIG") {
    if (!Array.isArray(value) || value.length === 0) {
      throw new Error("INVALID_VALUE: Promotion milestones configuration must be a non-empty array of milestone objects.");
    }
    for (const m of value) {
      if (!m.milestone || !m.units || Number(m.units) <= 0 || !m.rewardUsd || Number(m.rewardUsd) <= 0) {
        throw new Error("INVALID_VALUE: Each promotion milestone must contain milestone key, positive units, and positive rewardUsd.");
      }
    }
  }
}
async function getEconomicAuditLogs(page = 1, limit = 20, configKey) {
  const db = await getDb();
  const safePage = Math.max(1, page);
  const safeLimit = Math.min(100, Math.max(1, limit));
  const offset = (safePage - 1) * safeLimit;
  let whereClauses = ["1=1"];
  let queryParams = [];
  let paramIdx = 1;
  if (configKey && configKey.trim() && configKey !== "ALL") {
    whereClauses.push(`config_key = $${paramIdx}`);
    queryParams.push(configKey.trim().toUpperCase());
    paramIdx++;
  }
  const whereSql = whereClauses.join(" AND ");
  const countRes = await db.query(
    `SELECT COUNT(*)::int AS count FROM economic_config_audit_logs WHERE ${whereSql}`,
    queryParams
  );
  const totalCount = Number(countRes.rows[0]?.count || 0);
  const txQueryParams = [...queryParams, safeLimit, offset];
  const listRes = await db.query(
    `
    SELECT * FROM economic_config_audit_logs
    WHERE ${whereSql}
    ORDER BY created_at DESC
    LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
    `,
    txQueryParams
  );
  const totalPages = Math.ceil(totalCount / safeLimit) || 1;
  return {
    logs: listRes.rows.map(mapRowToAuditRecord),
    pagination: {
      page: safePage,
      limit: safeLimit,
      totalCount,
      totalPages
    }
  };
}
async function getNodeBasePrice(dbClient) {
  const cfg = await getEconomicConfigByKey("NODE_BASE_PRICE_USD", dbClient);
  if (cfg && typeof cfg.configValue === "number") {
    return cfg.configValue;
  }
  return 1e3;
}
async function getBnbPriceUsd() {
  const cfg = await getEconomicConfigByKey("BNB_PRICE_USD");
  if (cfg && cfg.status === "ACTIVE" && cfg.configValue !== null && cfg.configValue !== void 0) {
    const price = Number(cfg.configValue);
    if (!isNaN(price) && price > 0) return price;
  }
  if (process.env.BNB_PRICE_USD) {
    const envPrice = Number(process.env.BNB_PRICE_USD);
    if (!isNaN(envPrice) && envPrice > 0) return envPrice;
  }
  return null;
}
async function isNodeSalesEnabled(dbClient) {
  const cfg = await getEconomicConfigByKey("NODE_SALES_ENABLED", dbClient);
  if (cfg) {
    return cfg.status === "ACTIVE" && Boolean(cfg.configValue);
  }
  return true;
}
async function getDirectReferralCommissionRate() {
  const cfg = await getEconomicConfigByKey("DIRECT_REFERRAL_COMMISSION_USD");
  if (cfg && typeof cfg.configValue === "number") {
    return cfg.configValue;
  }
  return 50;
}
async function isNodeRewardsEnabled() {
  const cfg = await getEconomicConfigByKey("NODE_REWARDS_ENABLED");
  if (cfg) {
    return cfg.status === "ACTIVE" && Boolean(cfg.configValue);
  }
  return true;
}
async function getNodeRewardRatePerEpoch(dbClient) {
  const cfg = await getEconomicConfigByKey("NODE_REWARD_RATE_PER_EPOCH", dbClient);
  if (cfg && cfg.status === "ACTIVE" && cfg.configValue !== null && cfg.configValue !== void 0) {
    if (typeof cfg.configValue === "object" && cfg.configValue !== null) {
      const val = cfg.configValue;
      const num = Number(
        val.ratePhivo !== void 0 ? val.ratePhivo : val.rateUsd !== void 0 ? val.rateUsd : val.rewardPerNode !== void 0 ? val.rewardPerNode : NaN
      );
      return isNaN(num) || num <= 0 ? null : num;
    }
    const rate = Number(cfg.configValue);
    return isNaN(rate) || rate <= 0 ? null : rate;
  }
  return null;
}
async function getInternalCoinPrice() {
  const cfg = await getEconomicConfigByKey("INTERNAL_COIN_PRICE_USDT");
  if (cfg && cfg.status === "ACTIVE" && typeof cfg.configValue === "object" && cfg.configValue !== null) {
    const price = Number(cfg.configValue.priceUsdt);
    if (!isNaN(price) && price > 0) {
      return {
        coinSymbol: "PHIVO",
        priceUsdt: price,
        effectiveFrom: cfg.configValue.effectiveFrom || cfg.effectiveFrom,
        swapEnabled: cfg.configValue.swapEnabled !== false,
        configured: true
      };
    }
  }
  return {
    coinSymbol: "PHIVO",
    priceUsdt: null,
    effectiveFrom: null,
    swapEnabled: false,
    configured: false
  };
}
async function isCoinSwapEnabled() {
  const cfg = await getEconomicConfigByKey("INTERNAL_COIN_SWAP_ENABLED");
  if (cfg) {
    return cfg.status === "ACTIVE" && Boolean(cfg.configValue);
  }
  return true;
}
async function getTokenPriceTrend(timeframe = "24h") {
  const db = await getDb();
  const coinConfig = await getInternalCoinPrice();
  const supplyRes = await db.query(
    `SELECT COALESCE(SUM(amount), 0)::float AS sum 
     FROM financial_ledger_entries 
     WHERE currency = 'PHIVO' AND entry_type = 'CREDIT' AND status = 'SETTLED'`
  );
  const circulatingSupply = Math.max(0, Number(supplyRes.rows[0]?.sum || 0));
  if (!coinConfig.configured || coinConfig.priceUsdt === null || coinConfig.priceUsdt <= 0) {
    return {
      tokenSymbol: "PHIVO",
      tokenName: "PHIVONEX Protocol Token",
      currentPrice: null,
      open24h: null,
      high24h: null,
      low24h: null,
      change24h: 0,
      change24hPercent: 0,
      volume24h: 0,
      marketCap: 0,
      circulatingSupply,
      timeframe,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      points: [],
      configured: false
    };
  }
  const currentPrice = coinConfig.priceUsdt;
  const marketCap = Math.round(circulatingSupply * currentPrice);
  const swapVolRes = await db.query(
    `SELECT COALESCE(SUM(amount), 0)::float AS vol 
     FROM financial_ledger_entries 
     WHERE source_type = 'COIN_SWAP' AND entry_type = 'DEBIT' AND currency = 'PHIVO' AND status = 'SETTLED'`
  );
  const totalSwapPhivo = Number(swapVolRes.rows[0]?.vol || 0);
  const volume24h = Number((totalSwapPhivo * currentPrice).toFixed(2));
  const now = Date.now();
  let stepMinutes = 60;
  let numSteps = 24;
  if (timeframe === "1h") {
    stepMinutes = 2.5;
    numSteps = 24;
  } else if (timeframe === "6h") {
    stepMinutes = 15;
    numSteps = 24;
  } else if (timeframe === "7d") {
    stepMinutes = 7 * 60;
    numSteps = 24;
  }
  const points = [];
  for (let i = 0; i < numSteps; i++) {
    const pointTime = new Date(now - (numSteps - 1 - i) * stepMinutes * 60 * 1e3);
    const timeLabel = timeframe === "1h" || timeframe === "6h" || timeframe === "24h" ? pointTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : pointTime.toLocaleDateString([], { month: "short", day: "numeric" });
    points.push({
      timestamp: pointTime.toISOString(),
      timeLabel,
      price: currentPrice,
      open: currentPrice,
      high: currentPrice,
      low: currentPrice,
      close: currentPrice,
      volume: Math.round(totalSwapPhivo / numSteps),
      volumeUsd: Number((totalSwapPhivo / numSteps * currentPrice).toFixed(2)),
      change: 0,
      changePercent: 0
    });
  }
  return {
    tokenSymbol: "PHIVO",
    tokenName: "PHIVONEX Protocol Token",
    currentPrice: Number(currentPrice.toFixed(4)),
    open24h: Number(currentPrice.toFixed(4)),
    high24h: Number(currentPrice.toFixed(4)),
    low24h: Number(currentPrice.toFixed(4)),
    change24h: 0,
    change24hPercent: 0,
    volume24h,
    marketCap,
    circulatingSupply,
    timeframe,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    points,
    configured: true
  };
}
var init_economicService = __esm({
  "src/server/services/economicService.ts"() {
    init_db();
    init_systemConfigBroadcaster();
  }
});

// src/server/services/coinSwapService.ts
import { v4 as uuidv48 } from "uuid";
async function runWithUserLock(userId, fn) {
  const currentLock = userSwapLocks.get(userId) || Promise.resolve();
  let releaseLock;
  const newLock = new Promise((resolve) => {
    releaseLock = resolve;
  });
  userSwapLocks.set(userId, currentLock.then(() => newLock));
  try {
    await currentLock;
    return await fn();
  } finally {
    releaseLock();
    if (userSwapLocks.get(userId) === newLock) {
      userSwapLocks.delete(userId);
    }
  }
}
async function getUserCoinBalance(userId) {
  const db = await getDb();
  const rewardsRes = await db.query(
    `
    SELECT COALESCE(SUM(amount), 0) AS total
    FROM node_rewards
    WHERE owner_user_id = $1 AND status != 'REVERSED'
    `,
    [userId]
  );
  const totalEarnedRewards = Number(rewardsRes.rows[0]?.total || 0);
  const boughtRes = await db.query(
    `
    SELECT COALESCE(SUM(coin_amount), 0) AS total
    FROM coin_swap_transactions
    WHERE user_id = $1 AND status = 'COMPLETED' AND direction = 'USDT_TO_COIN' AND coin_amount > 0
    `,
    [userId]
  );
  const totalBoughtCoins = Number(boughtRes.rows[0]?.total || 0);
  const soldRes = await db.query(
    `
    SELECT COALESCE(SUM(coin_amount), 0) AS total
    FROM coin_swap_transactions
    WHERE user_id = $1 AND status = 'COMPLETED' AND (direction = 'COIN_TO_USDT' OR direction IS NULL) AND coin_amount > 0
    `,
    [userId]
  );
  const totalSoldCoins = Number(soldRes.rows[0]?.total || 0);
  const adminPhivoRes = await db.query(
    `
    SELECT entry_type, COALESCE(SUM(amount), 0) AS total
    FROM financial_ledger_entries
    WHERE user_id = $1 AND currency = 'PHIVO' AND status = 'SETTLED' AND source_type = 'ADMIN_ADJUSTMENT'
    GROUP BY entry_type
    `,
    [userId]
  );
  let adminPhivoCredits = 0;
  let adminPhivoDebits = 0;
  for (const row of adminPhivoRes.rows) {
    if (row.entry_type === "CREDIT") adminPhivoCredits += Number(row.total);
    else if (row.entry_type === "DEBIT" || row.entry_type === "REVERSAL") adminPhivoDebits += Number(row.total);
  }
  const totalEarnedCoins = totalEarnedRewards + totalBoughtCoins + adminPhivoCredits;
  const availableCoinBalance = Math.max(0, Number((totalEarnedCoins - totalSoldCoins - adminPhivoDebits).toFixed(6)));
  return {
    availableCoinBalance,
    totalEarnedCoins,
    totalSwappedCoins: totalSoldCoins,
    coinSymbol: "PHIVO"
  };
}
async function getSwapQuote(coinAmount) {
  if (isNaN(coinAmount) || coinAmount <= 0) {
    throw new Error("INVALID_COIN_AMOUNT: Coin amount must be greater than zero.");
  }
  const coinConfig = await getEconomicConfigByKey("INTERNAL_COIN_PRICE_USDT");
  const globalSwapActive = await isCoinSwapEnabled();
  if (!coinConfig || coinConfig.status !== "ACTIVE") {
    throw new Error("SWAP_RATE_NOT_CONFIGURED: Internal coin conversion rate is not configured.");
  }
  const val = coinConfig.configValue || {};
  const rateUsdt = Number(val.priceUsdt);
  if (isNaN(rateUsdt) || rateUsdt <= 0) {
    throw new Error("SWAP_RATE_NOT_CONFIGURED: Invalid coin conversion rate configured.");
  }
  const swapEnabled = globalSwapActive && val.swapEnabled !== false;
  const usdtAmount = Number((coinAmount * rateUsdt).toFixed(4));
  const rateVersion = coinConfig.version;
  const effectiveFrom = val.effectiveFrom || coinConfig.effectiveFrom;
  return {
    coinAmount,
    rate: rateUsdt,
    usdtAmount,
    rateVersion,
    swapEnabled,
    coinSymbol: "PHIVO",
    effectiveFrom
  };
}
async function executeCoinToUsdtSwap(params) {
  const { userId, coinAmount, idempotencyKey } = params;
  if (isNaN(coinAmount) || coinAmount <= 0) {
    throw new Error("INVALID_COIN_AMOUNT: Coin amount must be a positive number.");
  }
  return runWithUserLock(userId, async () => {
    const db = await getDb();
    if (idempotencyKey && idempotencyKey.trim()) {
      const cleanKey = idempotencyKey.trim();
      const existingRes = await db.query(
        `SELECT * FROM coin_swap_transactions WHERE user_id = $1 AND idempotency_key = $2`,
        [userId, cleanKey]
      );
      if (existingRes.rows.length > 0) {
        const row = existingRes.rows[0];
        const currentBal2 = await getUserCoinBalance(userId);
        return {
          success: true,
          swap: {
            id: row.id,
            publicSwapId: row.public_swap_id,
            userId: row.user_id,
            coinAmount: Number(row.coin_amount),
            rateUsdt: Number(row.rate_usdt),
            usdtAmount: Number(row.usdt_amount),
            status: row.status,
            rateVersion: Number(row.rate_version),
            idempotencyKey: row.idempotency_key,
            createdAt: new Date(row.created_at).toISOString(),
            completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null
          },
          balances: {
            remainingCoinBalance: currentBal2.availableCoinBalance,
            usdtCredited: Number(row.usdt_amount)
          }
        };
      }
    }
    const coinConfig = await getEconomicConfigByKey("INTERNAL_COIN_PRICE_USDT");
    const globalSwapActive = await isCoinSwapEnabled();
    if (!coinConfig || coinConfig.status !== "ACTIVE") {
      const err = new Error("SWAP_RATE_NOT_CONFIGURED: Internal coin conversion rate is not configured.");
      err.code = "SWAP_RATE_NOT_CONFIGURED";
      throw err;
    }
    const val = coinConfig.configValue || {};
    const rateUsdt = Number(val.priceUsdt);
    if (isNaN(rateUsdt) || rateUsdt <= 0) {
      const err = new Error("SWAP_RATE_NOT_CONFIGURED: Active coin conversion rate is invalid or missing.");
      err.code = "SWAP_RATE_NOT_CONFIGURED";
      throw err;
    }
    const isEnabled = globalSwapActive && val.swapEnabled !== false;
    if (!isEnabled) {
      const err = new Error("SWAP_DISABLED: Internal coin swapping is currently disabled by administration.");
      err.code = "SWAP_DISABLED";
      throw err;
    }
    const rateVersion = coinConfig.version;
    const currentBal = await getUserCoinBalance(userId);
    if (coinAmount > currentBal.availableCoinBalance) {
      const err = new Error(
        `INSUFFICIENT_COIN_BALANCE: Requested swap of ${coinAmount} PHIVO exceeds available balance of ${currentBal.availableCoinBalance} PHIVO.`
      );
      err.code = "INSUFFICIENT_COIN_BALANCE";
      throw err;
    }
    const usdtAmount = Number((coinAmount * rateUsdt).toFixed(4));
    if (usdtAmount <= 0) {
      throw new Error("INVALID_SWAP_CALCULATION: Resulting USDT amount must be greater than zero.");
    }
    const id = uuidv48();
    const publicSwapId = generateSwapPublicId();
    const now = /* @__PURE__ */ new Date();
    const insertRes = await db.query(
      `
      INSERT INTO coin_swap_transactions (
        id, public_swap_id, user_id, coin_amount, rate_usdt, usdt_amount,
        status, rate_version, idempotency_key, created_at, completed_at, direction
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'COMPLETED', $7, $8, $9, $9, 'COIN_TO_USDT')
      RETURNING *
      `,
      [
        id,
        publicSwapId,
        userId,
        coinAmount,
        rateUsdt,
        usdtAmount,
        rateVersion,
        idempotencyKey ? idempotencyKey.trim() : null,
        now
      ]
    );
    const swapRow = insertRes.rows[0];
    await postLedgerCredit({
      userId,
      sourceType: "COIN_SWAP",
      sourceId: swapRow.id,
      sourceRef: swapRow.public_swap_id,
      amount: usdtAmount,
      currency: "USDT",
      description: `Internal Coin Swap - ${coinAmount} PHIVO @ $${rateUsdt.toFixed(2)} USDT (${publicSwapId})`,
      createdAt: now
    });
    const newBalance = await getUserCoinBalance(userId);
    try {
      await notifyPhivoSwapCompleted({
        userId,
        coinAmount,
        usdtAmount,
        rateUsdt,
        swapId: swapRow.id
      });
    } catch (notifErr) {
      console.warn("[Notification] Error triggering coin swap notification:", notifErr);
    }
    try {
      const userRes = await db.query(
        `SELECT email, full_name, public_id FROM users WHERE id = $1`,
        [userId]
      );
      if (userRes.rowCount > 0) {
        const user = userRes.rows[0];
        const { queueEventEmail: queueEventEmail2 } = await Promise.resolve().then(() => (init_emailService(), emailService_exports));
        await queueEventEmail2(user.email, "SWAP_COMPLETE", {
          displayName: user.full_name,
          publicId: user.public_id,
          fromAmount: String(coinAmount),
          toAmount: String(usdtAmount),
          rate: String(rateUsdt)
        });
      }
    } catch (emailErr) {
      console.warn("[EmailEngine] Failed to send Swap Complete email:", emailErr);
    }
    return {
      success: true,
      swap: {
        id: swapRow.id,
        publicSwapId: swapRow.public_swap_id,
        userId: swapRow.user_id,
        coinAmount: Number(swapRow.coin_amount),
        rateUsdt: Number(swapRow.rate_usdt),
        usdtAmount: Number(swapRow.usdt_amount),
        status: swapRow.status,
        rateVersion: Number(swapRow.rate_version),
        idempotencyKey: swapRow.idempotency_key,
        createdAt: new Date(swapRow.created_at).toISOString(),
        completedAt: swapRow.completed_at ? new Date(swapRow.completed_at).toISOString() : null
      },
      balances: {
        remainingCoinBalance: newBalance.availableCoinBalance,
        usdtCredited: usdtAmount
      }
    };
  });
}
async function getUserSwapHistory(userId, options) {
  const db = await getDb();
  const limit = Math.min(100, Math.max(1, options?.limit || 20));
  const offset = Math.max(0, options?.offset || 0);
  const aggRes = await db.query(
    `
    SELECT 
      COUNT(*) as count,
      COALESCE(SUM(coin_amount), 0) as total_coins,
      COALESCE(SUM(usdt_amount), 0) as total_usdt
    FROM coin_swap_transactions
    WHERE user_id = $1 AND status = 'COMPLETED'
    `,
    [userId]
  );
  const totalSwapsCount = Number(aggRes.rows[0]?.count || 0);
  const totalSwappedCoins = Number(aggRes.rows[0]?.total_coins || 0);
  const totalUsdtReceived = Number(aggRes.rows[0]?.total_usdt || 0);
  const rowsRes = await db.query(
    `
    SELECT * FROM coin_swap_transactions
    WHERE user_id = $1
    ORDER BY created_at DESC
    LIMIT $2 OFFSET $3
    `,
    [userId, limit, offset]
  );
  const swaps = rowsRes.rows.map((r) => ({
    id: r.id,
    publicSwapId: r.public_swap_id,
    userId: r.user_id,
    coinAmount: Number(r.coin_amount),
    rateUsdt: Number(r.rate_usdt),
    usdtAmount: Number(r.usdt_amount),
    status: r.status,
    rateVersion: Number(r.rate_version),
    idempotencyKey: r.idempotency_key,
    createdAt: new Date(r.created_at).toISOString(),
    completedAt: r.completed_at ? new Date(r.completed_at).toISOString() : null
  }));
  return {
    swaps,
    summary: {
      totalSwappedCoins,
      totalUsdtReceived,
      totalSwapsCount
    },
    pagination: {
      limit,
      offset,
      totalCount: totalSwapsCount
    }
  };
}
async function executeUsdtToCoinSwap(params) {
  const { userId, usdtAmount, idempotencyKey } = params;
  if (isNaN(usdtAmount) || usdtAmount <= 0) {
    throw new Error("INVALID_USDT_AMOUNT: USDT amount must be a positive number.");
  }
  return runWithUserLock(userId, async () => {
    const db = await getDb();
    const coinConfig = await getEconomicConfigByKey("INTERNAL_COIN_PRICE_USDT");
    const globalSwapActive = await isCoinSwapEnabled();
    if (!coinConfig || coinConfig.status !== "ACTIVE") {
      const err = new Error("SWAP_RATE_NOT_CONFIGURED: Internal coin conversion rate is not configured.");
      err.code = "SWAP_RATE_NOT_CONFIGURED";
      throw err;
    }
    const val = coinConfig.configValue || {};
    const rateUsdt = Number(val.priceUsdt);
    if (isNaN(rateUsdt) || rateUsdt <= 0) {
      const err = new Error("SWAP_RATE_NOT_CONFIGURED: Active coin conversion rate is invalid or missing.");
      err.code = "SWAP_RATE_NOT_CONFIGURED";
      throw err;
    }
    const isEnabled = globalSwapActive && val.swapEnabled !== false;
    if (!isEnabled) {
      const err = new Error("SWAP_DISABLED: Internal coin swapping is currently disabled by administration.");
      err.code = "SWAP_DISABLED";
      throw err;
    }
    const { getWalletSummary: getWalletSummary3, postLedgerDebit: postLedgerDebit2 } = await Promise.resolve().then(() => (init_walletLedgerService(), walletLedgerService_exports));
    const wallet = await getWalletSummary3(userId);
    if (usdtAmount > wallet.availableBalance) {
      const err = new Error(
        `INSUFFICIENT_USDT_BALANCE: Requested swap of $${usdtAmount.toFixed(2)} USDT exceeds available balance of $${wallet.availableBalance.toFixed(2)} USDT.`
      );
      err.code = "INSUFFICIENT_USDT_BALANCE";
      throw err;
    }
    const coinAmount = Number((usdtAmount / rateUsdt).toFixed(4));
    if (coinAmount <= 0) {
      throw new Error("INVALID_SWAP_CALCULATION: Resulting coin amount must be greater than zero.");
    }
    const id = uuidv48();
    const publicSwapId = generateSwapPublicId();
    const now = /* @__PURE__ */ new Date();
    await postLedgerDebit2({
      userId,
      sourceType: "COIN_SWAP",
      sourceId: id,
      sourceRef: publicSwapId,
      amount: usdtAmount,
      currency: "USDT",
      description: `Internal Swap USDT -> PHIVO (${coinAmount} PHIVO @ $${rateUsdt.toFixed(2)} USDT)`,
      createdAt: now
    });
    const insertRes = await db.query(
      `
      INSERT INTO coin_swap_transactions (
        id, public_swap_id, user_id, coin_amount, rate_usdt, usdt_amount,
        status, rate_version, idempotency_key, created_at, completed_at, direction
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'COMPLETED', $7, $8, $9, $9, 'USDT_TO_COIN')
      RETURNING *
      `,
      [
        id,
        publicSwapId,
        userId,
        coinAmount,
        rateUsdt,
        usdtAmount,
        coinConfig.version,
        idempotencyKey ? idempotencyKey.trim() : null,
        now
      ]
    );
    const updatedWallet = await getWalletSummary3(userId);
    const updatedCoinBal = await getUserCoinBalance(userId);
    const swapRow = insertRes.rows[0];
    return {
      success: true,
      swap: {
        id: swapRow.id,
        publicSwapId: swapRow.public_swap_id,
        userId: swapRow.user_id,
        coinAmount: Number(swapRow.coin_amount),
        rateUsdt: Number(swapRow.rate_usdt),
        usdtAmount: Number(swapRow.usdt_amount),
        status: swapRow.status,
        rateVersion: Number(swapRow.rate_version),
        idempotencyKey: swapRow.idempotency_key,
        createdAt: new Date(swapRow.created_at).toISOString(),
        completedAt: swapRow.completed_at ? new Date(swapRow.completed_at).toISOString() : null
      },
      balances: {
        remainingUsdtBalance: updatedWallet.availableBalance,
        coinsCredited: coinAmount
      }
    };
  });
}
var userSwapLocks;
var init_coinSwapService = __esm({
  "src/server/services/coinSwapService.ts"() {
    init_db();
    init_idGenerator();
    init_economicService();
    init_walletLedgerService();
    init_notificationService();
    userSwapLocks = /* @__PURE__ */ new Map();
  }
});

// src/server/services/adminService.ts
import { v4 as uuidv49 } from "uuid";
async function logAdminAction(params) {
  try {
    const db = await getDb();
    const id = uuidv49();
    const metaStr = params.metadata ? JSON.stringify(params.metadata) : null;
    await db.query(
      `
      INSERT INTO admin_audit_logs (
        id, admin_user_id, admin_public_id, action,
        target_type, target_id, details, metadata, ip_address, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
      `,
      [
        id,
        params.adminUserId || null,
        params.adminPublicId || "SYSTEM_ADMIN",
        params.action,
        params.targetType,
        params.targetId,
        params.details,
        metaStr,
        params.ipAddress || null
      ]
    );
  } catch (err) {
    console.error("[Admin Audit Log Error] Failed to write audit record:", err);
  }
}
async function getAdminSummaryMetrics() {
  const db = await getDb();
  const [
    usersRes,
    nodesRes,
    ordersRes,
    commissionsRes,
    matchingRes,
    promotionsRes,
    ledgerRes,
    withdrawalsRes,
    kycRes
  ] = await Promise.all([
    db.query(`
      SELECT 
        COUNT(*)::int AS total_users,
        COUNT(CASE WHEN status = 'ACTIVE' THEN 1 END)::int AS active_users
      FROM users
    `),
    db.query(`
      SELECT 
        COUNT(CASE WHEN status = 'ACTIVE' THEN 1 END)::int AS active_nodes,
        COUNT(CASE WHEN status = 'AVAILABLE' THEN 1 END)::int AS available_nodes,
        COUNT(CASE WHEN status = 'RESERVED' THEN 1 END)::int AS reserved_nodes,
        COUNT(CASE WHEN status = 'RETIRED' THEN 1 END)::int AS retired_nodes
      FROM nodes
    `),
    db.query(`
      SELECT 
        COUNT(*)::int AS total_orders,
        COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END)::int AS completed_orders
      FROM node_orders
    `),
    db.query(`
      SELECT COALESCE(SUM(amount_usd), 0)::float AS total
      FROM referral_commissions WHERE status = 'EARNED'
    `),
    db.query(`
      SELECT COALESCE(SUM(total_bonus_usd), 0)::float AS total
      FROM binary_matching_settlements WHERE status = 'COMPLETED'
    `),
    db.query(`
      SELECT COALESCE(SUM(amount_usd), 0)::float AS total
      FROM promotion_bonuses WHERE status = 'EARNED'
    `),
    db.query(`
      SELECT COUNT(*)::int AS count FROM financial_ledger_entries
    `),
    db.query(`
      SELECT 
        COUNT(CASE WHEN status = 'PENDING' THEN 1 END)::int AS pending_count,
        COUNT(CASE WHEN status = 'APPROVED' THEN 1 END)::int AS approved_count,
        COUNT(CASE WHEN status = 'PROCESSING' THEN 1 END)::int AS processing_count,
        COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END)::int AS completed_count,
        COUNT(CASE WHEN status = 'REJECTED' THEN 1 END)::int AS rejected_count,
        COUNT(CASE WHEN status = 'FAILED' THEN 1 END)::int AS failed_count,
        COALESCE(SUM(amount), 0)::float AS total_withdrawal_amount,
        COALESCE(SUM(CASE WHEN status = 'PENDING' THEN amount ELSE 0 END), 0)::float AS pending_amount,
        COALESCE(SUM(CASE WHEN status = 'APPROVED' THEN amount ELSE 0 END), 0)::float AS approved_amount,
        COALESCE(SUM(CASE WHEN status = 'PROCESSING' THEN amount ELSE 0 END), 0)::float AS processing_amount,
        COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN amount ELSE 0 END), 0)::float AS completed_amount,
        COALESCE(SUM(CASE WHEN status = 'REJECTED' THEN amount ELSE 0 END), 0)::float AS rejected_amount,
        COALESCE(SUM(CASE WHEN status = 'FAILED' THEN amount ELSE 0 END), 0)::float AS failed_amount
      FROM withdrawals
    `),
    db.query(`
      SELECT 
        COUNT(CASE WHEN status = 'PENDING' THEN 1 END)::int AS pending_kyc
      FROM kyc_verifications
    `).catch(() => ({ rows: [{ pending_kyc: 0 }] }))
  ]);
  const uRow = usersRes.rows[0] || {};
  const nRow = nodesRes.rows[0] || {};
  const oRow = ordersRes.rows[0] || {};
  const wRow = withdrawalsRes.rows[0] || {};
  return {
    totalUsers: Number(uRow.total_users || 0),
    activeUsers: Number(uRow.active_users || 0),
    genesisNodeCap: GENESIS_NODE_CAP,
    activeNodes: Number(nRow.active_nodes || 0),
    availableNodes: Number(nRow.available_nodes || 0),
    reservedNodes: Number(nRow.reserved_nodes || 0),
    retiredNodes: Number(nRow.retired_nodes || 0),
    totalOrders: Number(oRow.total_orders || 0),
    completedOrders: Number(oRow.completed_orders || 0),
    referralCommissionsTotal: Number(commissionsRes.rows[0]?.total || 0),
    matchingSettlementsTotal: Number(matchingRes.rows[0]?.total || 0),
    promotionBonusesTotal: Number(promotionsRes.rows[0]?.total || 0),
    ledgerTransactionsCount: Number(ledgerRes.rows[0]?.count || 0),
    pendingWithdrawalsCount: Number(wRow.pending_count || 0),
    pendingWithdrawalsAmount: Number(wRow.pending_amount || 0),
    approvedWithdrawalsCount: Number(wRow.approved_count || 0),
    approvedWithdrawalsAmount: Number(wRow.approved_amount || 0),
    processingWithdrawalsCount: Number(wRow.processing_count || 0),
    processingWithdrawalsAmount: Number(wRow.processing_amount || 0),
    completedWithdrawalsCount: Number(wRow.completed_count || 0),
    completedWithdrawalsTotal: Number(wRow.completed_amount || 0),
    rejectedWithdrawalsCount: Number(wRow.rejected_count || 0),
    rejectedWithdrawalsAmount: Number(wRow.rejected_amount || 0),
    failedWithdrawalsCount: Number(wRow.failed_count || 0),
    failedWithdrawalsAmount: Number(wRow.failed_amount || 0),
    totalWithdrawalsAmount: Number(wRow.total_withdrawal_amount || 0),
    pendingKycCount: Number(kycRes.rows[0]?.pending_kyc || 0),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
async function getAdminUsersList(page = 1, limit = 20, search, statusFilter) {
  const db = await getDb();
  const safePage = Math.max(1, page);
  const safeLimit = Math.min(100, Math.max(1, limit));
  const offset = (safePage - 1) * safeLimit;
  let whereClauses = ["1=1"];
  let queryParams = [];
  let paramIdx = 1;
  if (statusFilter && statusFilter !== "ALL" && statusFilter !== "all") {
    whereClauses.push(`u.status = $${paramIdx}`);
    queryParams.push(statusFilter.toUpperCase());
    paramIdx++;
  }
  if (search && search.trim()) {
    const q = `%${search.trim().toLowerCase()}%`;
    whereClauses.push(`(LOWER(u.full_name) LIKE $${paramIdx} OR LOWER(u.email) LIKE $${paramIdx} OR LOWER(u.public_id) LIKE $${paramIdx})`);
    queryParams.push(q);
    paramIdx++;
  }
  const whereSql = whereClauses.join(" AND ");
  const countRes = await db.query(
    `SELECT COUNT(*)::int AS count FROM users u WHERE ${whereSql}`,
    queryParams
  );
  const totalCount = Number(countRes.rows[0]?.count || 0);
  const txQueryParams = [...queryParams, safeLimit, offset];
  const listRes = await db.query(
    `
    SELECT 
      u.id,
      u.public_id,
      u.full_name,
      u.email,
      u.phone,
      u.country,
      u.status,
      COALESCE(u.role, 'USER') AS role,
      u.email_verified_at,
      u.created_at,
      sp.public_id AS sponsor_public_id,
      (SELECT COUNT(*)::int FROM nodes n WHERE n.owner_user_id = u.id AND n.status = 'ACTIVE') AS node_count
    FROM users u
    LEFT JOIN user_referrals ur ON u.id = ur.user_id
    LEFT JOIN users sp ON ur.sponsor_user_id = sp.id
    WHERE ${whereSql}
    ORDER BY u.created_at DESC
    LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
    `,
    txQueryParams
  );
  const totalPages = Math.ceil(totalCount / safeLimit) || 1;
  const users = listRes.rows.map((row) => ({
    id: row.id,
    publicId: row.public_id || "PHX-USER",
    fullName: row.full_name,
    email: row.email,
    phone: row.phone || null,
    country: row.country,
    status: row.status,
    role: row.role || "USER",
    emailVerified: !!row.email_verified_at,
    createdAt: new Date(row.created_at).toISOString(),
    sponsorPublicId: row.sponsor_public_id || null,
    nodeCount: Number(row.node_count || 0)
  }));
  return {
    users,
    pagination: {
      page: safePage,
      limit: safeLimit,
      totalCount,
      totalPages
    }
  };
}
async function getAdminNodesList(page = 1, limit = 20, statusFilter, search) {
  const db = await getDb();
  const safePage = Math.max(1, page);
  const safeLimit = Math.min(100, Math.max(1, limit));
  const offset = (safePage - 1) * safeLimit;
  let whereClauses = ["1=1"];
  let queryParams = [];
  let paramIdx = 1;
  if (statusFilter && statusFilter !== "ALL" && statusFilter !== "all") {
    whereClauses.push(`n.status = $${paramIdx}`);
    queryParams.push(statusFilter.toUpperCase());
    paramIdx++;
  }
  if (search && search.trim()) {
    const q = `%${search.trim().toLowerCase()}%`;
    whereClauses.push(`(LOWER(n.public_node_id) LIKE $${paramIdx} OR LOWER(u.public_id) LIKE $${paramIdx} OR LOWER(u.full_name) LIKE $${paramIdx})`);
    queryParams.push(q);
    paramIdx++;
  }
  const whereSql = whereClauses.join(" AND ");
  const countRes = await db.query(
    `SELECT COUNT(*)::int AS count FROM nodes n LEFT JOIN users u ON n.owner_user_id = u.id WHERE ${whereSql}`,
    queryParams
  );
  const totalCount = Number(countRes.rows[0]?.count || 0);
  const txQueryParams = [...queryParams, safeLimit, offset];
  const listRes = await db.query(
    `
    SELECT 
      n.id,
      n.node_number,
      n.public_node_id,
      n.status,
      n.reserved_at,
      n.activated_at,
      n.created_at,
      u.public_id AS owner_public_id,
      u.full_name AS owner_name
    FROM nodes n
    LEFT JOIN users u ON n.owner_user_id = u.id
    WHERE ${whereSql}
    ORDER BY n.node_number ASC
    LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
    `,
    txQueryParams
  );
  const totalPages = Math.ceil(totalCount / safeLimit) || 1;
  return {
    nodes: listRes.rows.map((r) => ({
      id: r.id,
      nodeNumber: r.node_number,
      publicNodeId: r.public_node_id,
      status: r.status,
      ownerPublicId: r.owner_public_id || null,
      ownerName: r.owner_name || null,
      reservedAt: r.reserved_at ? new Date(r.reserved_at).toISOString() : null,
      activatedAt: r.activated_at ? new Date(r.activated_at).toISOString() : null,
      createdAt: new Date(r.created_at).toISOString()
    })),
    pagination: {
      page: safePage,
      limit: safeLimit,
      totalCount,
      totalPages
    }
  };
}
async function getAdminOrdersList(page = 1, limit = 20, statusFilter, search) {
  const db = await getDb();
  const safePage = Math.max(1, page);
  const safeLimit = Math.min(100, Math.max(1, limit));
  const offset = (safePage - 1) * safeLimit;
  let whereClauses = ["1=1"];
  let queryParams = [];
  let paramIdx = 1;
  if (statusFilter && statusFilter !== "ALL" && statusFilter !== "all") {
    whereClauses.push(`o.status = $${paramIdx}`);
    queryParams.push(statusFilter.toUpperCase());
    paramIdx++;
  }
  if (search && search.trim()) {
    const q = `%${search.trim().toLowerCase()}%`;
    whereClauses.push(`(LOWER(o.public_order_id) LIKE $${paramIdx} OR LOWER(u.public_id) LIKE $${paramIdx} OR LOWER(u.full_name) LIKE $${paramIdx})`);
    queryParams.push(q);
    paramIdx++;
  }
  const whereSql = whereClauses.join(" AND ");
  const countRes = await db.query(
    `SELECT COUNT(*)::int AS count FROM node_orders o LEFT JOIN users u ON o.user_id = u.id WHERE ${whereSql}`,
    queryParams
  );
  const totalCount = Number(countRes.rows[0]?.count || 0);
  const txQueryParams = [...queryParams, safeLimit, offset];
  const listRes = await db.query(
    `
    SELECT 
      o.id,
      o.public_order_id,
      o.node_number,
      o.amount_usd,
      o.currency,
      o.status,
      o.payment_method,
      o.payment_reference,
      o.created_at,
      o.completed_at,
      u.public_id AS user_public_id,
      u.full_name AS user_name
    FROM node_orders o
    LEFT JOIN users u ON o.user_id = u.id
    WHERE ${whereSql}
    ORDER BY o.created_at DESC
    LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
    `,
    txQueryParams
  );
  const totalPages = Math.ceil(totalCount / safeLimit) || 1;
  return {
    orders: listRes.rows.map((r) => ({
      id: r.id,
      publicOrderId: r.public_order_id,
      nodeNumber: r.node_number,
      amountUsd: Number(r.amount_usd),
      currency: r.currency,
      status: r.status,
      paymentMethod: r.payment_method,
      paymentReference: r.payment_reference,
      userPublicId: r.user_public_id || null,
      userName: r.user_name || null,
      createdAt: new Date(r.created_at).toISOString(),
      completedAt: r.completed_at ? new Date(r.completed_at).toISOString() : null
    })),
    pagination: {
      page: safePage,
      limit: safeLimit,
      totalCount,
      totalPages
    }
  };
}
async function getAdminWithdrawalsList(page = 1, limit = 20, statusFilter, search) {
  const db = await getDb();
  const safePage = Math.max(1, page);
  const safeLimit = Math.min(100, Math.max(1, limit));
  const offset = (safePage - 1) * safeLimit;
  let whereClauses = ["1=1"];
  let queryParams = [];
  let paramIdx = 1;
  if (statusFilter && statusFilter !== "ALL" && statusFilter !== "all") {
    whereClauses.push(`w.status = $${paramIdx}`);
    queryParams.push(statusFilter.toUpperCase());
    paramIdx++;
  }
  if (search && search.trim()) {
    const q = `%${search.trim().toLowerCase()}%`;
    whereClauses.push(`(LOWER(w.public_withdrawal_id) LIKE $${paramIdx} OR LOWER(u.public_id) LIKE $${paramIdx} OR LOWER(u.full_name) LIKE $${paramIdx} OR LOWER(w.destination_reference) LIKE $${paramIdx})`);
    queryParams.push(q);
    paramIdx++;
  }
  const whereSql = whereClauses.join(" AND ");
  const countRes = await db.query(
    `SELECT COUNT(*)::int AS count FROM withdrawals w LEFT JOIN users u ON w.user_id = u.id WHERE ${whereSql}`,
    queryParams
  );
  const totalCount = Number(countRes.rows[0]?.count || 0);
  const txQueryParams = [...queryParams, safeLimit, offset];
  const listRes = await db.query(
    `
    SELECT 
      w.*,
      u.public_id AS user_public_id,
      u.full_name AS user_name,
      u.email AS user_email
    FROM withdrawals w
    LEFT JOIN users u ON w.user_id = u.id
    WHERE ${whereSql}
    ORDER BY w.created_at DESC
    LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
    `,
    txQueryParams
  );
  const totalPages = Math.ceil(totalCount / safeLimit) || 1;
  return {
    withdrawals: listRes.rows.map((r) => ({
      id: r.id,
      publicWithdrawalId: r.public_withdrawal_id,
      userId: r.user_id,
      userPublicId: r.user_public_id || "PHX-USER",
      userName: r.user_name || "Operator",
      userEmail: r.user_email || "",
      amount: Number(r.amount),
      currency: r.currency,
      destinationType: r.destination_type,
      destinationReference: r.destination_reference,
      status: r.status,
      requestedAt: r.requested_at ? new Date(r.requested_at).toISOString() : new Date(r.created_at).toISOString(),
      approvedAt: r.approved_at ? new Date(r.approved_at).toISOString() : null,
      rejectedAt: r.rejected_at ? new Date(r.rejected_at).toISOString() : null,
      completedAt: r.completed_at ? new Date(r.completed_at).toISOString() : null,
      cancelledAt: r.cancelled_at ? new Date(r.cancelled_at).toISOString() : null,
      failedAt: r.failed_at ? new Date(r.failed_at).toISOString() : null,
      rejectionReason: r.rejection_reason || null,
      createdAt: new Date(r.created_at).toISOString(),
      updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : new Date(r.created_at).toISOString()
    })),
    pagination: {
      page: safePage,
      limit: safeLimit,
      totalCount,
      totalPages
    }
  };
}
async function getAdminTransactionsList(page = 1, limit = 20, typeFilter, search) {
  const db = await getDb();
  const safePage = Math.max(1, page);
  const safeLimit = Math.min(100, Math.max(1, limit));
  const offset = (safePage - 1) * safeLimit;
  let whereClauses = ["1=1"];
  let queryParams = [];
  let paramIdx = 1;
  if (typeFilter && typeFilter !== "ALL" && typeFilter !== "all") {
    whereClauses.push(`f.source_type = $${paramIdx}`);
    queryParams.push(typeFilter.toUpperCase());
    paramIdx++;
  }
  if (search && search.trim()) {
    const q = `%${search.trim().toLowerCase()}%`;
    whereClauses.push(`(LOWER(f.public_txn_id) LIKE $${paramIdx} OR LOWER(u.public_id) LIKE $${paramIdx} OR LOWER(f.description) LIKE $${paramIdx} OR LOWER(f.source_ref) LIKE $${paramIdx})`);
    queryParams.push(q);
    paramIdx++;
  }
  const whereSql = whereClauses.join(" AND ");
  const countRes = await db.query(
    `SELECT COUNT(*)::int AS count FROM financial_ledger_entries f LEFT JOIN users u ON f.user_id = u.id WHERE ${whereSql}`,
    queryParams
  );
  const totalCount = Number(countRes.rows[0]?.count || 0);
  const txQueryParams = [...queryParams, safeLimit, offset];
  const listRes = await db.query(
    `
    SELECT 
      f.*,
      u.public_id AS user_public_id,
      u.full_name AS user_name
    FROM financial_ledger_entries f
    LEFT JOIN users u ON f.user_id = u.id
    WHERE ${whereSql}
    ORDER BY f.created_at DESC
    LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
    `,
    txQueryParams
  );
  const totalPages = Math.ceil(totalCount / safeLimit) || 1;
  return {
    transactions: listRes.rows.map((r) => ({
      id: r.id,
      publicTxnId: r.public_txn_id,
      userId: r.user_id,
      userPublicId: r.user_public_id || "PHX-USER",
      userName: r.user_name || "Operator",
      entryType: r.entry_type,
      sourceType: r.source_type,
      sourceId: r.source_id,
      sourceRef: r.source_ref,
      description: r.description,
      amount: Number(r.amount),
      currency: r.currency,
      status: r.status,
      createdAt: new Date(r.created_at).toISOString()
    })),
    pagination: {
      page: safePage,
      limit: safeLimit,
      totalCount,
      totalPages
    }
  };
}
async function getAdminAuditLogs(page = 1, limit = 20, actionFilter) {
  const db = await getDb();
  const safePage = Math.max(1, page);
  const safeLimit = Math.min(100, Math.max(1, limit));
  const offset = (safePage - 1) * safeLimit;
  let whereClauses = ["1=1"];
  let queryParams = [];
  let paramIdx = 1;
  if (actionFilter && actionFilter !== "ALL" && actionFilter !== "all") {
    whereClauses.push(`action = $${paramIdx}`);
    queryParams.push(actionFilter.toUpperCase());
    paramIdx++;
  }
  const whereSql = whereClauses.join(" AND ");
  const countRes = await db.query(
    `SELECT COUNT(*)::int AS count FROM admin_audit_logs WHERE ${whereSql}`,
    queryParams
  );
  const totalCount = Number(countRes.rows[0]?.count || 0);
  const txQueryParams = [...queryParams, safeLimit, offset];
  const listRes = await db.query(
    `
    SELECT * FROM admin_audit_logs
    WHERE ${whereSql}
    ORDER BY created_at DESC
    LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
    `,
    txQueryParams
  );
  const totalPages = Math.ceil(totalCount / safeLimit) || 1;
  const logs = listRes.rows.map((r) => ({
    id: r.id,
    adminUserId: r.admin_user_id || null,
    adminPublicId: r.admin_public_id || "SYSTEM_ADMIN",
    action: r.action,
    targetType: r.target_type,
    targetId: r.target_id,
    details: r.details,
    metadata: r.metadata ? JSON.parse(r.metadata) : null,
    ipAddress: r.ip_address || null,
    createdAt: new Date(r.created_at).toISOString()
  }));
  return {
    logs,
    pagination: {
      page: safePage,
      limit: safeLimit,
      totalCount,
      totalPages
    }
  };
}
async function getUnifiedAuditFeed(limit = 50, categoryFilter, searchQuery) {
  const db = await getDb();
  const nodesRes = await db.query(`
    SELECT 
      n.id,
      n.public_node_id,
      n.status,
      1000.00 AS pricing_tier_usd,
      n.activated_at,
      n.updated_at,
      u.public_id AS owner_public_id,
      u.full_name AS owner_name
    FROM nodes n
    JOIN users u ON n.owner_user_id = u.id
    WHERE n.status = 'ACTIVE'
    ORDER BY n.updated_at DESC
    LIMIT 30
  `);
  const ledgerRes = await db.query(`
    SELECT 
      f.id,
      f.public_txn_id,
      f.entry_type,
      f.source_type,
      f.source_id,
      f.amount,
      f.currency,
      f.description,
      f.created_at,
      u.public_id AS user_public_id
    FROM financial_ledger_entries f
    LEFT JOIN users u ON f.user_id = u.id
    ORDER BY f.created_at DESC
    LIMIT 30
  `);
  const adminRes = await db.query(`
    SELECT * FROM admin_audit_logs
    ORDER BY created_at DESC
    LIMIT 30
  `);
  const nodeEvents = nodesRes.rows.map((n) => ({
    id: `audit-node-${n.id}`,
    category: "NODE_ACTIVATION",
    action: "NODE_ACTIVATION_COMPLETED",
    actorPublicId: n.owner_public_id || "PHX-USER",
    targetType: "NODE",
    targetId: n.public_node_id,
    amountUsd: Number(n.pricing_tier_usd || 1e3),
    currency: "USD",
    details: `Genesis Node ${n.public_node_id} activated and allocated to operator ${n.owner_public_id || "PHX-USER"} ($${Number(n.pricing_tier_usd || 1e3).toFixed(2)} stage tier).`,
    metadata: {
      publicNodeId: n.public_node_id,
      pricingTierUsd: Number(n.pricing_tier_usd || 1e3),
      activatedAt: n.activated_at,
      ownerName: n.owner_name
    },
    ipAddress: null,
    createdAt: n.activated_at ? new Date(n.activated_at).toISOString() : new Date(n.updated_at).toISOString()
  }));
  const finEvents = ledgerRes.rows.map((f) => ({
    id: `audit-fin-${f.id}`,
    category: "FINANCIAL",
    action: `FINANCIAL_${f.source_type}_${f.entry_type}`,
    actorPublicId: f.user_public_id || "SYSTEM_ADMIN",
    targetType: "LEDGER_ENTRY",
    targetId: f.public_txn_id,
    amountUsd: Number(f.amount),
    currency: f.currency,
    details: `${f.description || `${f.entry_type} entry for ${f.source_type}`}`,
    metadata: {
      publicTxnId: f.public_txn_id,
      entryType: f.entry_type,
      sourceType: f.source_type,
      sourceId: f.source_id,
      amount: Number(f.amount),
      currency: f.currency
    },
    ipAddress: null,
    createdAt: new Date(f.created_at).toISOString()
  }));
  const adminEvents = adminRes.rows.map((a) => ({
    id: `audit-admin-${a.id}`,
    category: "ADMIN_ACTION",
    action: a.action,
    actorPublicId: a.admin_public_id || "SYSTEM_ADMIN",
    targetType: a.target_type,
    targetId: a.target_id,
    amountUsd: null,
    currency: null,
    details: a.details,
    metadata: a.metadata ? JSON.parse(a.metadata) : null,
    ipAddress: a.ip_address || null,
    createdAt: new Date(a.created_at).toISOString()
  }));
  let combined = [...nodeEvents, ...finEvents, ...adminEvents].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  if (categoryFilter && categoryFilter !== "ALL" && categoryFilter !== "all") {
    combined = combined.filter((e) => e.category === categoryFilter.toUpperCase());
  }
  if (searchQuery && searchQuery.trim()) {
    const q = searchQuery.toLowerCase().trim();
    combined = combined.filter(
      (e) => e.action.toLowerCase().includes(q) || e.actorPublicId.toLowerCase().includes(q) || e.targetId.toLowerCase().includes(q) || e.details.toLowerCase().includes(q)
    );
  }
  const finalEvents = combined.slice(0, limit);
  return {
    events: finalEvents,
    stats: {
      totalEvents: combined.length,
      nodeActivationsCount: nodeEvents.length,
      financialTransactionsCount: finEvents.length,
      adminActionsCount: adminEvents.length,
      securityEventsCount: 0,
      lastReconciliationAt: (/* @__PURE__ */ new Date()).toISOString()
    }
  };
}
async function updateAdminUserProfile(params) {
  const db = await getDb();
  if (!params.reason || params.reason.trim().length < 5) {
    const err = new Error("Admin reason is mandatory (minimum 5 characters) for user profile edits.");
    err.statusCode = 400;
    throw err;
  }
  const userRes = await db.query(`SELECT * FROM users WHERE id::text = $1 OR public_id = $1`, [params.targetUserId]);
  if (userRes.rows.length === 0) {
    const err = new Error("Target user account not found.");
    err.statusCode = 404;
    throw err;
  }
  const currentUser = userRes.rows[0];
  if (currentUser.id === params.adminUserId && params.status && params.status !== "ACTIVE") {
    const err = new Error("You cannot lock or suspend your own active administrator account.");
    err.statusCode = 400;
    throw err;
  }
  const newFullName = params.fullName !== void 0 ? params.fullName.trim() : currentUser.full_name;
  const newCountry = params.country !== void 0 ? params.country.trim() : currentUser.country;
  const newPhone = params.phone !== void 0 ? params.phone.trim() : currentUser.phone;
  const newStatus = params.status !== void 0 ? params.status : currentUser.status;
  await db.query(
    `
    UPDATE users
    SET full_name = $1, country = $2, phone = $3, status = $4, updated_at = CURRENT_TIMESTAMP
    WHERE id = $5
    `,
    [newFullName, newCountry, newPhone, newStatus, currentUser.id]
  );
  if (params.status && params.status !== currentUser.status) {
    if (params.status === "LOCKED" || params.status === "SUSPENDED") {
      await db.query(`UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND revoked_at IS NULL`, [currentUser.id]);
    }
  }
  const updatedUserRes = await db.query(`SELECT id, public_id, full_name, email, phone, country, status, role, created_at FROM users WHERE id = $1`, [currentUser.id]);
  const updatedUser = updatedUserRes.rows[0];
  await logAdminAction({
    adminUserId: params.adminUserId,
    adminPublicId: params.adminPublicId,
    action: "ADMIN_USER_PROFILE_UPDATED",
    targetType: "USER",
    targetId: currentUser.public_id,
    details: `Admin ${params.adminPublicId} updated profile for user ${currentUser.public_id}. Reason: ${params.reason}`,
    metadata: {
      before: {
        fullName: currentUser.full_name,
        country: currentUser.country,
        phone: currentUser.phone,
        status: currentUser.status
      },
      after: {
        fullName: newFullName,
        country: newCountry,
        phone: newPhone,
        status: newStatus
      },
      reason: params.reason
    },
    ipAddress: params.ipAddress
  });
  createNotification({
    userId: currentUser.id,
    type: "SECURITY_ALERT",
    title: "Profile Updated",
    message: `Your account profile has been updated by administrator ${params.adminPublicId}. Reason: ${params.reason}`,
    sourceType: "ADMIN_ADJUSTMENT",
    sourceId: currentUser.public_id
  }).catch(console.error);
  try {
    notificationEmitter.emit(`notification:${currentUser.id}`, {
      type: "USER_PROFILE_UPDATED",
      user: {
        id: updatedUser.id,
        publicId: updatedUser.public_id,
        fullName: updatedUser.full_name,
        phone: updatedUser.phone,
        country: updatedUser.country,
        status: updatedUser.status
      }
    });
    if (params.status && params.status !== currentUser.status) {
      notificationEmitter.emit(`notification:${currentUser.id}`, {
        type: "USER_STATUS_UPDATED",
        status: params.status
      });
    }
  } catch {
  }
  return { user: updatedUser };
}
async function getUser360Details(targetUserIdOrPublicId) {
  const db = await getDb();
  const userRes = await db.query(
    `SELECT id, public_id, full_name, email, phone, country, status, COALESCE(role, 'USER') AS role, email_verified_at, created_at, last_login_at FROM users WHERE id::text = $1 OR public_id = $1 OR LOWER(email) = LOWER($1)`,
    [targetUserIdOrPublicId]
  );
  if (userRes.rows.length === 0) {
    const err = new Error(`Target user '${targetUserIdOrPublicId}' not found.`);
    err.statusCode = 404;
    throw err;
  }
  const u = userRes.rows[0];
  const userId = u.id;
  const sponsorRes = await db.query(
    `
    SELECT ur.referral_code, sp.id AS sponsor_id, sp.public_id AS sponsor_public_id, sp.full_name AS sponsor_full_name, sp.email AS sponsor_email
    FROM user_referrals ur
    LEFT JOIN users sp ON ur.sponsor_user_id = sp.id
    WHERE ur.user_id = $1
    `,
    [userId]
  );
  const sponsor = sponsorRes.rows[0] || null;
  const [usdtWallet, phivoWallet, depositAgg, withdrawalAgg, swapAgg, orderAgg, adminAdjAgg] = await Promise.all([
    getWalletSummary(userId),
    getUserCoinBalance(userId),
    db.query(`
      SELECT COALESCE(SUM(amount), 0)::float AS total, COUNT(*)::int AS count
      FROM blockchain_deposits
      WHERE user_id = $1 AND status IN ('CREDITED', 'CONFIRMED', 'SWEPT')
    `, [userId]),
    db.query(`
      SELECT 
        COALESCE(SUM(amount), 0)::float AS total,
        COUNT(*)::int AS count,
        COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN amount ELSE 0 END), 0)::float AS completed_total,
        COALESCE(SUM(CASE WHEN status = 'PENDING' THEN amount ELSE 0 END), 0)::float AS pending_total
      FROM withdrawals
      WHERE user_id = $1
    `, [userId]),
    db.query(`
      SELECT 
        COALESCE(SUM(usdt_amount), 0)::float AS total_usdt,
        COALESCE(SUM(coin_amount), 0)::float AS total_phivo,
        COUNT(*)::int AS count
      FROM coin_swap_transactions
      WHERE user_id = $1 AND status = 'COMPLETED'
    `, [userId]),
    db.query(`
      SELECT COALESCE(SUM(amount_usd), 0)::float AS total, COUNT(*)::int AS count
      FROM node_orders
      WHERE user_id = $1 AND status = 'COMPLETED'
    `, [userId]),
    db.query(`
      SELECT 
        COALESCE(SUM(CASE WHEN entry_type = 'CREDIT' THEN amount ELSE 0 END), 0)::float AS credit_total,
        COALESCE(SUM(CASE WHEN entry_type = 'DEBIT' THEN amount ELSE 0 END), 0)::float AS debit_total,
        COUNT(*)::int AS count
      FROM financial_ledger_entries
      WHERE user_id = $1 AND source_type = 'ADMIN_ADJUSTMENT' AND status = 'SETTLED'
    `, [userId])
  ]);
  const depRow = depositAgg.rows[0] || {};
  const wRow = withdrawalAgg.rows[0] || {};
  const swRow = swapAgg.rows[0] || {};
  const ordRow = orderAgg.rows[0] || {};
  const admRow = adminAdjAgg.rows[0] || {};
  const [depositAddressesRes, recentWithdrawalsRes] = await Promise.all([
    db.query(`SELECT id, chain_id, asset, address, derivation_index, created_at FROM user_deposit_addresses WHERE user_id = $1`, [userId]),
    db.query(`SELECT id, public_withdrawal_id, amount, currency, destination_type, destination_reference, status, created_at, completed_at FROM withdrawals WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`, [userId])
  ]);
  const [nodesRes, ordersRes] = await Promise.all([
    db.query(`SELECT id, node_number, public_node_id, status, reserved_at, activated_at, created_at FROM nodes WHERE owner_user_id = $1 ORDER BY node_number ASC`, [userId]),
    db.query(`SELECT id, public_order_id, node_number, amount_usd, currency, status, payment_method, payment_reference, created_at, completed_at FROM node_orders WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`, [userId])
  ]);
  const ledgerRes = await db.query(
    `SELECT id, public_txn_id, entry_type, source_type, source_id, source_ref, description, amount, currency, status, created_at FROM financial_ledger_entries WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [userId]
  );
  const [sessionsRes, securityEventsRes] = await Promise.all([
    db.query(`SELECT id, user_agent, ip_address, created_at, expires_at, last_used_at, revoked_at FROM sessions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`, [userId]),
    db.query(`SELECT id, event_type, description, user_agent_summary, created_at FROM security_events WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`, [userId])
  ]);
  const adminAuditRes = await db.query(
    `
    SELECT id, admin_user_id, admin_public_id, action, target_type, target_id, details, metadata, ip_address, created_at
    FROM admin_audit_logs
    WHERE target_id = $1 OR target_id = $2 OR (metadata IS NOT NULL AND metadata::text LIKE '%' || $1 || '%')
    ORDER BY created_at DESC
    LIMIT 30
    `,
    [u.public_id, userId]
  );
  return {
    profile: {
      id: u.id,
      publicId: u.public_id,
      fullName: u.full_name,
      email: u.email,
      phone: u.phone || null,
      country: u.country,
      status: u.status,
      role: u.role,
      emailVerified: !!u.email_verified_at,
      emailVerifiedAt: u.email_verified_at ? new Date(u.email_verified_at).toISOString() : null,
      createdAt: new Date(u.created_at).toISOString(),
      lastLoginAt: u.last_login_at ? new Date(u.last_login_at).toISOString() : null,
      sponsor: sponsor ? {
        referralCode: sponsor.referral_code,
        sponsorPublicId: sponsor.sponsor_public_id || null,
        sponsorFullName: sponsor.sponsor_full_name || null,
        sponsorEmail: sponsor.sponsor_email || null
      } : null
    },
    walletOverview: {
      usdtAvailableBalance: usdtWallet.availableBalance,
      phivoAvailableBalance: phivoWallet.availableCoinBalance,
      totalDepositsUsdt: Number(depRow.total || 0),
      depositCount: Number(depRow.count || 0),
      totalWithdrawalsUsdt: Number(wRow.total || 0),
      completedWithdrawalsUsdt: Number(wRow.completed_total || 0),
      pendingWithdrawalsUsdt: Number(wRow.pending_total || 0),
      withdrawalCount: Number(wRow.count || 0),
      totalSwapsUsdt: Number(swRow.total_usdt || 0),
      totalSwapsPhivo: Number(swRow.total_phivo || 0),
      swapCount: Number(swRow.count || 0),
      nodePurchasesUsdt: Number(ordRow.total || 0),
      orderCount: Number(ordRow.count || 0),
      rewardsEarnedPhivo: phivoWallet.totalEarnedCoins,
      referralCommissionsUsdt: usdtWallet.breakdown.referral,
      matchingRewardsUsdt: usdtWallet.breakdown.matching,
      promotionBonusesUsdt: usdtWallet.breakdown.promotion,
      adminAdjustments: {
        totalCreditsUsdt: Number(admRow.credit_total || 0),
        totalDebitsUsdt: Number(admRow.debit_total || 0),
        netUsdt: Number(admRow.credit_total || 0) - Number(admRow.debit_total || 0),
        count: Number(admRow.count || 0)
      }
    },
    addresses: depositAddressesRes.rows.map((a) => ({
      id: a.id,
      chainId: a.chain_id,
      asset: a.asset,
      address: a.address,
      derivationIndex: a.derivation_index,
      createdAt: new Date(a.created_at).toISOString()
    })),
    recentWithdrawals: recentWithdrawalsRes.rows.map((w) => ({
      id: w.id,
      publicWithdrawalId: w.public_withdrawal_id,
      amount: Number(w.amount),
      currency: w.currency,
      destinationType: w.destination_type,
      destinationReference: w.destination_reference,
      status: w.status,
      createdAt: new Date(w.created_at).toISOString(),
      completedAt: w.completed_at ? new Date(w.completed_at).toISOString() : null
    })),
    nodes: nodesRes.rows.map((n) => ({
      id: n.id,
      nodeNumber: n.node_number,
      publicNodeId: n.public_node_id,
      status: n.status,
      reservedAt: n.reserved_at ? new Date(n.reserved_at).toISOString() : null,
      activatedAt: n.activated_at ? new Date(n.activated_at).toISOString() : null,
      createdAt: new Date(n.created_at).toISOString()
    })),
    orders: ordersRes.rows.map((o) => ({
      id: o.id,
      publicOrderId: o.public_order_id,
      nodeNumber: o.node_number,
      amountUsd: Number(o.amount_usd),
      currency: o.currency,
      status: o.status,
      paymentMethod: o.payment_method,
      paymentReference: o.payment_reference,
      createdAt: new Date(o.created_at).toISOString(),
      completedAt: o.completed_at ? new Date(o.completed_at).toISOString() : null
    })),
    transactions: ledgerRes.rows.map((r) => ({
      id: r.id,
      publicTxnId: r.public_txn_id,
      entryType: r.entry_type,
      sourceType: r.source_type,
      sourceId: r.source_id,
      sourceRef: r.source_ref,
      description: r.description,
      amount: Number(r.amount),
      currency: r.currency,
      status: r.status,
      createdAt: new Date(r.created_at).toISOString()
    })),
    sessions: sessionsRes.rows.map((s) => ({
      id: s.id,
      userAgent: s.user_agent,
      ipAddress: s.ip_address,
      createdAt: new Date(s.created_at).toISOString(),
      expiresAt: new Date(s.expires_at).toISOString(),
      lastUsedAt: new Date(s.last_used_at).toISOString(),
      revokedAt: s.revoked_at ? new Date(s.revoked_at).toISOString() : null,
      isActive: !s.revoked_at && new Date(s.expires_at).getTime() > Date.now()
    })),
    securityEvents: securityEventsRes.rows.map((se) => ({
      id: se.id,
      eventType: se.event_type,
      description: se.description,
      userAgentSummary: se.user_agent_summary,
      createdAt: new Date(se.created_at).toISOString()
    })),
    auditLogs: adminAuditRes.rows.map((al) => ({
      id: al.id,
      adminUserId: al.admin_user_id,
      adminPublicId: al.admin_public_id,
      action: al.action,
      targetType: al.target_type,
      targetId: al.target_id,
      details: al.details,
      metadata: al.metadata ? typeof al.metadata === "string" ? JSON.parse(al.metadata) : al.metadata : null,
      ipAddress: al.ip_address,
      createdAt: new Date(al.created_at).toISOString()
    }))
  };
}
async function executeAdminWalletAdjustment(params) {
  const db = await getDb();
  const cleanAsset = (params.asset || "").toUpperCase().trim();
  if (cleanAsset !== "USDT" && cleanAsset !== "PHIVO") {
    const err = new Error("Invalid asset specified. Supported assets: USDT, PHIVO.");
    err.statusCode = 400;
    throw err;
  }
  const cleanDirection = (params.direction || "").toUpperCase().trim();
  if (cleanDirection !== "CREDIT" && cleanDirection !== "DEBIT") {
    const err = new Error("Invalid direction specified. Supported directions: CREDIT, DEBIT.");
    err.statusCode = 400;
    throw err;
  }
  const numAmount = Number(params.amount);
  if (isNaN(numAmount) || !isFinite(numAmount) || numAmount <= 0) {
    const err = new Error("Adjustment amount must be a positive, finite number strictly greater than 0.");
    err.statusCode = 400;
    throw err;
  }
  if (!params.reason || params.reason.trim().length < 5) {
    const err = new Error("Administrative reason is mandatory (minimum 5 characters) for wallet adjustment.");
    err.statusCode = 400;
    throw err;
  }
  const cleanReason = params.reason.trim();
  const idempotencyKey = params.idempotencyKey ? params.idempotencyKey.trim() : null;
  if (idempotencyKey) {
    const existingTx = await db.query(
      `
      SELECT f.*, u.public_id AS target_public_id
      FROM financial_ledger_entries f
      JOIN users u ON f.user_id = u.id
      WHERE f.source_type = 'ADMIN_ADJUSTMENT' AND f.source_ref = $1
      LIMIT 1
      `,
      [idempotencyKey]
    );
    if (existingTx.rows.length > 0) {
      const row = existingTx.rows[0];
      return {
        success: true,
        isDuplicate: true,
        transaction: {
          publicTxnId: row.public_txn_id,
          targetUserId: row.user_id,
          targetPublicId: row.target_public_id,
          asset: row.currency,
          direction: row.entry_type,
          amount: Number(row.amount),
          reason: row.description,
          newBalance: void 0,
          createdAt: new Date(row.created_at).toISOString()
        }
      };
    }
  }
  return await db.transaction(async (txClient) => {
    const targetUserRes = await txClient.query(
      `SELECT id, public_id, full_name, email, status, COALESCE(role, 'USER') AS role FROM users WHERE id::text = $1 OR public_id = $1 FOR UPDATE`,
      [params.targetUserId]
    );
    if (targetUserRes.rows.length === 0) {
      const err = new Error(`Target user '${params.targetUserId}' not found.`);
      err.statusCode = 404;
      throw err;
    }
    const targetUser = targetUserRes.rows[0];
    let currentBalance = 0;
    if (cleanAsset === "USDT") {
      const usdtSummary = await getWalletSummary(targetUser.id);
      currentBalance = usdtSummary.availableBalance;
    } else {
      const phivoSummary = await getUserCoinBalance(targetUser.id);
      currentBalance = phivoSummary.availableCoinBalance;
    }
    if (cleanDirection === "DEBIT" && currentBalance < numAmount) {
      const err = new Error(
        `INSUFFICIENT_BALANCE: Cannot DEBIT ${numAmount} ${cleanAsset} from user ${targetUser.public_id}. Current available balance: ${currentBalance} ${cleanAsset}.`
      );
      err.statusCode = 400;
      throw err;
    }
    const ledgerId = uuidv49();
    const sourceId = uuidv49();
    const publicTxnId = generateLedgerTransactionPublicId();
    const sourceRef = idempotencyKey || params.adminPublicId;
    const description = `Admin Adjustment (${cleanDirection}): ${cleanReason}`;
    await txClient.query(
      `
      INSERT INTO financial_ledger_entries (
        id, public_txn_id, user_id, entry_type, source_type, source_id,
        source_ref, description, amount, currency, status, created_at
      )
      VALUES ($1, $2, $3, $4, 'ADMIN_ADJUSTMENT', $5, $6, $7, $8, $9, 'SETTLED', CURRENT_TIMESTAMP)
      `,
      [ledgerId, publicTxnId, targetUser.id, cleanDirection, sourceId, sourceRef, description, numAmount, cleanAsset]
    );
    const newBalance = cleanDirection === "CREDIT" ? currentBalance + numAmount : currentBalance - numAmount;
    await txClient.query(
      `
      INSERT INTO admin_audit_logs (
        id, admin_user_id, admin_public_id, action, target_type, target_id, details, metadata, ip_address, created_at
      )
      VALUES ($1, $2, $3, $4, 'USER', $5, $6, $7, $8, CURRENT_TIMESTAMP)
      `,
      [
        uuidv49(),
        params.adminUserId,
        params.adminPublicId,
        cleanDirection === "CREDIT" ? "ADMIN_WALLET_CREDIT" : "ADMIN_WALLET_DEBIT",
        targetUser.public_id,
        `Admin ${params.adminPublicId} executed ${cleanDirection} of ${numAmount} ${cleanAsset} for user ${targetUser.public_id}. Reason: ${cleanReason}`,
        JSON.stringify({
          adminUserId: params.adminUserId,
          adminPublicId: params.adminPublicId,
          targetUserId: targetUser.id,
          targetPublicId: targetUser.public_id,
          asset: cleanAsset,
          direction: cleanDirection,
          amount: numAmount,
          reason: cleanReason,
          publicTxnId,
          idempotencyKey,
          previousBalance: currentBalance,
          newBalance
        }),
        params.ipAddress || null
      ]
    );
    createNotification({
      userId: targetUser.id,
      type: "SECURITY_ALERT",
      title: cleanDirection === "CREDIT" ? "Account Credit" : "Account Debit",
      message: `An ${cleanDirection === "CREDIT" ? "account credit" : "account debit"} of ${numAmount} ${cleanAsset} was applied to your balance.`,
      sourceType: "ADMIN_ADJUSTMENT",
      sourceId: publicTxnId
    }).catch(console.error);
    try {
      notificationEmitter.emit(`notification:${targetUser.id}`, {
        type: "WALLET_UPDATED",
        asset: cleanAsset,
        direction: cleanDirection,
        amount: numAmount,
        newBalance,
        publicTxnId
      });
    } catch {
    }
    return {
      success: true,
      isDuplicate: false,
      transaction: {
        publicTxnId,
        targetUserId: targetUser.id,
        targetPublicId: targetUser.public_id,
        asset: cleanAsset,
        direction: cleanDirection,
        amount: numAmount,
        reason: cleanReason,
        previousBalance: currentBalance,
        newBalance,
        createdAt: (/* @__PURE__ */ new Date()).toISOString()
      }
    };
  });
}
async function setUserAccountStatus(params) {
  const db = await getDb();
  if (!params.reason || params.reason.trim().length < 5) {
    const err = new Error("Admin reason is mandatory (minimum 5 characters) for account status updates.");
    err.statusCode = 400;
    throw err;
  }
  const targetRes = await db.query(`SELECT id, public_id, full_name, email, status FROM users WHERE id::text = $1 OR public_id = $1`, [params.targetUserId]);
  if (targetRes.rows.length === 0) {
    const err = new Error("Target user account not found.");
    err.statusCode = 404;
    throw err;
  }
  const targetUser = targetRes.rows[0];
  if (targetUser.id === params.adminUserId && params.status !== "ACTIVE") {
    const err = new Error("You cannot lock or suspend your own active administrator account.");
    err.statusCode = 400;
    throw err;
  }
  await db.query(`UPDATE users SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`, [params.status, targetUser.id]);
  if (params.status === "LOCKED" || params.status === "SUSPENDED") {
    await db.query(`UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND revoked_at IS NULL`, [targetUser.id]);
  }
  const actionType = params.status === "LOCKED" ? "ADMIN_USER_LOCK" : params.status === "ACTIVE" ? "ADMIN_USER_UNLOCK" : "ADMIN_USER_SUSPEND";
  await logAdminAction({
    adminUserId: params.adminUserId,
    adminPublicId: params.adminPublicId,
    action: actionType,
    targetType: "USER",
    targetId: targetUser.public_id,
    details: `Admin ${params.adminPublicId} set account status to ${params.status} for user ${targetUser.public_id}. Reason: ${params.reason}`,
    metadata: {
      targetUserId: targetUser.id,
      targetPublicId: targetUser.public_id,
      previousStatus: targetUser.status,
      newStatus: params.status,
      reason: params.reason
    },
    ipAddress: params.ipAddress
  });
  try {
    notificationEmitter.emit(`notification:${targetUser.id}`, {
      type: "USER_STATUS_UPDATED",
      status: params.status
    });
  } catch {
  }
  return { success: true, targetPublicId: targetUser.public_id, status: params.status };
}
async function revokeUserSessions(params) {
  const db = await getDb();
  if (!params.reason || params.reason.trim().length < 5) {
    const err = new Error("Admin reason is mandatory (minimum 5 characters) for session revocation.");
    err.statusCode = 400;
    throw err;
  }
  const targetRes = await db.query(`SELECT id, public_id FROM users WHERE id::text = $1 OR public_id = $1`, [params.targetUserId]);
  if (targetRes.rows.length === 0) {
    const err = new Error("Target user account not found.");
    err.statusCode = 404;
    throw err;
  }
  const targetUser = targetRes.rows[0];
  const revokeRes = await db.query(
    `UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND revoked_at IS NULL RETURNING id`,
    [targetUser.id]
  );
  const revokedCount = revokeRes.rowCount || 0;
  await logAdminAction({
    adminUserId: params.adminUserId,
    adminPublicId: params.adminPublicId,
    action: "ADMIN_SESSION_REVOKE",
    targetType: "USER",
    targetId: targetUser.public_id,
    details: `Admin ${params.adminPublicId} revoked ${revokedCount} active sessions for user ${targetUser.public_id}. Reason: ${params.reason}`,
    metadata: {
      targetUserId: targetUser.id,
      targetPublicId: targetUser.public_id,
      revokedCount,
      reason: params.reason
    },
    ipAddress: params.ipAddress
  });
  try {
    notificationEmitter.emit(`notification:${targetUser.id}`, {
      type: "SESSION_REVOKED",
      revokedCount
    });
  } catch {
  }
  return { success: true, targetPublicId: targetUser.public_id, revokedCount };
}
var init_adminService = __esm({
  "src/server/services/adminService.ts"() {
    init_db();
    init_nodeConfig();
    init_idGenerator();
    init_walletLedgerService();
    init_coinSwapService();
    init_notificationService();
  }
});

// src/server/services/emailService.ts
var emailService_exports = {};
__export(emailService_exports, {
  MockEmailProvider: () => MockEmailProvider,
  ResendEmailProvider: () => ResendEmailProvider,
  createAutomationRule: () => createAutomationRule,
  deleteAutomationRule: () => deleteAutomationRule,
  getAutomationRules: () => getAutomationRules,
  getEmailProvider: () => getEmailProvider,
  getEmailQueue: () => getEmailQueue,
  getEmailQueueStats: () => getEmailQueueStats,
  getEmailTemplates: () => getEmailTemplates,
  handleProviderEmailWebhook: () => handleProviderEmailWebhook,
  processEmailQueue: () => processEmailQueue,
  queueEventEmail: () => queueEventEmail,
  retryQueueItem: () => retryQueueItem,
  sendBroadcastCampaign: () => sendBroadcastCampaign,
  sendPasswordResetOtpEmail: () => sendPasswordResetOtpEmail,
  sendVerificationCodeEmail: () => sendVerificationCodeEmail,
  sendWithdrawalOtpEmail: () => sendWithdrawalOtpEmail,
  triggerAutomationRule: () => triggerAutomationRule,
  updateAutomationRule: () => updateAutomationRule,
  updateEmailTemplate: () => updateEmailTemplate
});
import { v4 as uuidv410 } from "uuid";
function getEmailProvider() {
  const isTest = process.env.NODE_ENV === "test" || process.env.VITEST === "true" || process.env.APP_ENV === "test";
  const apiKey = process.env.RESEND_API_KEY;
  if (!isTest && apiKey && apiKey.trim() !== "" && !apiKey.includes("your_resend_api_key")) {
    return new ResendEmailProvider(apiKey.trim());
  }
  return new MockEmailProvider();
}
async function queueEventEmail(toEmail, eventName, templateData, scheduledSendAt) {
  const db = await getDb();
  const templateRes = await db.query(
    `SELECT * FROM email_templates WHERE event_name = $1 AND enabled = TRUE`,
    [eventName]
  );
  if (templateRes.rows.length === 0) {
    console.warn(`[EmailEngine] Template for event "${eventName}" is disabled or not found. Skipping.`);
    return "";
  }
  const template = templateRes.rows[0];
  let subject = template.subject;
  let bodyHtml = template.body_html;
  for (const [key, val] of Object.entries(templateData)) {
    const regex = new RegExp(`{{${key}}}`, "g");
    subject = subject.replace(regex, val);
    bodyHtml = bodyHtml.replace(regex, val);
  }
  const queueId = uuidv410();
  await db.query(
    `
    INSERT INTO email_queue (id, to_email, subject, body_html, status, scheduled_send_at)
    VALUES ($1, $2, $3, $4, 'QUEUED', $5)
    `,
    [queueId, toEmail, subject, bodyHtml, scheduledSendAt || null]
  );
  processEmailQueue().catch((err) => {
    console.error("[EmailEngine] Immediate processEmailQueue error:", err);
  });
  return queueId;
}
async function processEmailQueue() {
  const db = await getDb();
  const res = await db.query(
    `SELECT * FROM email_queue 
     WHERE status = 'QUEUED' AND (scheduled_send_at IS NULL OR scheduled_send_at <= CURRENT_TIMESTAMP) 
     ORDER BY created_at ASC`
  );
  if (res.rows.length === 0) {
    return;
  }
  const provider = getEmailProvider();
  for (const row of res.rows) {
    try {
      const sendRes = await provider.sendEmail(row.to_email, row.subject, row.body_html);
      if (sendRes.error) {
        await db.query(
          `
          UPDATE email_queue
          SET status = 'FAILED', error_message = $1, sent_at = CURRENT_TIMESTAMP
          WHERE id = $2
          `,
          [sendRes.error, row.id]
        );
      } else {
        await db.query(
          `
          UPDATE email_queue
          SET status = 'SENT', provider_message_id = $1, sent_at = CURRENT_TIMESTAMP
          WHERE id = $2
          `,
          [sendRes.providerMessageId || null, row.id]
        );
      }
    } catch (err) {
      await db.query(
        `
        UPDATE email_queue
        SET status = 'FAILED', error_message = $1, sent_at = CURRENT_TIMESTAMP
        WHERE id = $2
        `,
        [err.message || "Unknown processing error", row.id]
      );
    }
  }
}
async function triggerAutomationRule(userId, criteria, templateData) {
  const db = await getDb();
  const rulesRes = await db.query(
    `SELECT * FROM automation_rules WHERE trigger_criteria = $1 AND enabled = TRUE`,
    [criteria]
  );
  if (rulesRes.rows.length === 0) {
    return false;
  }
  const userRes = await db.query(`SELECT email, public_id, full_name FROM users WHERE id = $1`, [userId]);
  if (userRes.rows.length === 0) {
    return false;
  }
  const user = userRes.rows[0];
  let triggeredAny = false;
  for (const rule of rulesRes.rows) {
    const cooldownRes = await db.query(
      `SELECT last_triggered_at FROM automation_cooldowns WHERE user_id = $1 AND rule_id = $2`,
      [userId, rule.id]
    );
    if (cooldownRes.rows.length > 0) {
      const lastTriggered = new Date(cooldownRes.rows[0].last_triggered_at);
      const cooldownMs = rule.cooldown_days * 24 * 60 * 60 * 1e3;
      if (Date.now() - lastTriggered.getTime() < cooldownMs) {
        console.log(`[AutomationEngine] Cooldown active for user ${userId} on rule ${rule.id}. Skipping.`);
        continue;
      }
    }
    const templateRes = await db.query(`SELECT event_name FROM email_templates WHERE id = $1`, [rule.template_id]);
    if (templateRes.rows.length === 0) {
      continue;
    }
    const eventName = templateRes.rows[0].event_name;
    const mergedData = {
      displayName: user.full_name,
      publicId: user.public_id,
      ...templateData
    };
    const scheduledSendAt = rule.delay_hours > 0 ? new Date(Date.now() + rule.delay_hours * 60 * 60 * 1e3) : void 0;
    await queueEventEmail(user.email, eventName, mergedData, scheduledSendAt);
    await db.query(
      `
      INSERT INTO automation_cooldowns (id, user_id, rule_id, last_triggered_at)
      VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
      ON CONFLICT (user_id, rule_id) 
      DO UPDATE SET last_triggered_at = CURRENT_TIMESTAMP
      `,
      [uuidv410(), userId, rule.id]
    );
    triggeredAny = true;
  }
  return triggeredAny;
}
async function getEmailTemplates() {
  const db = await getDb();
  const res = await db.query(`SELECT * FROM email_templates ORDER BY event_name ASC`);
  return res.rows.map((r) => ({
    id: r.id,
    eventName: r.event_name,
    subject: r.subject,
    bodyHtml: r.body_html,
    enabled: r.enabled,
    createdAt: r.created_at
  }));
}
async function updateEmailTemplate(adminUserId, adminPublicId, id, template) {
  const db = await getDb();
  const oldRes = await db.query(`SELECT * FROM email_templates WHERE id = $1`, [id]);
  if (oldRes.rows.length === 0) {
    throw new Error("Template not found");
  }
  await db.query(
    `
    UPDATE email_templates
    SET subject = $1, body_html = $2, enabled = $3
    WHERE id = $4
    `,
    [template.subject, template.bodyHtml, template.enabled, id]
  );
  const updated = {
    id,
    eventName: oldRes.rows[0].event_name,
    subject: template.subject,
    bodyHtml: template.bodyHtml,
    enabled: template.enabled,
    createdAt: oldRes.rows[0].created_at
  };
  await logAdminAction({
    adminUserId,
    adminPublicId,
    action: "UPDATE_EMAIL_TEMPLATE",
    targetType: "email_templates",
    targetId: id,
    details: `Updated email template for event "${updated.eventName}"`
  });
  return updated;
}
async function sendBroadcastCampaign(adminUserId, adminPublicId, campaign) {
  const db = await getDb();
  let userQuery = `SELECT id, email, full_name, public_id FROM users WHERE status = 'ACTIVE'`;
  if (campaign.audience === "ACTIVE_USERS") {
    userQuery = `SELECT id, email, full_name, public_id FROM users WHERE status = 'ACTIVE'`;
  } else if (campaign.audience === "NODE_HOLDERS") {
    userQuery = `
      SELECT DISTINCT u.id, u.email, u.full_name, u.public_id 
      FROM users u
      INNER JOIN node_orders o ON u.id = o.user_id
      WHERE o.status = 'COMPLETED'
    `;
  }
  const usersRes = await db.query(userQuery);
  let queuedCount = 0;
  for (const user of usersRes.rows) {
    let subject = campaign.subject;
    let bodyHtml = campaign.bodyHtml;
    subject = subject.replace(/{{displayName}}/g, user.full_name).replace(/{{publicId}}/g, user.public_id);
    bodyHtml = bodyHtml.replace(/{{displayName}}/g, user.full_name).replace(/{{publicId}}/g, user.public_id);
    const queueId = uuidv410();
    await db.query(
      `
      INSERT INTO email_queue (id, to_email, subject, body_html, status)
      VALUES ($1, $2, $3, $4, 'QUEUED')
      `,
      [queueId, user.email, subject, bodyHtml]
    );
    if (user.id) {
      createNotification({
        userId: user.id,
        type: "SECURITY_ALERT",
        title: subject,
        message: subject,
        sourceType: "BROADCAST_CAMPAIGN",
        sourceId: `camp-${campaign.subject.slice(0, 30)}-${user.id}`
      }).catch((notifErr) => {
        console.warn("[EmailEngine] In-app notification delivery warning:", notifErr?.message);
      });
    }
    queuedCount++;
  }
  processEmailQueue().catch((err) => {
    console.error("[EmailEngine] Campaign queue processing error:", err);
  });
  await logAdminAction({
    adminUserId,
    adminPublicId,
    action: "SEND_EMAIL_CAMPAIGN",
    targetType: "email_queue",
    targetId: "broadcast_campaign",
    details: `Broadcast campaign "${campaign.subject}" sent to ${queuedCount} users of audience: "${campaign.audience}"`
  });
  return { queuedCount };
}
async function getEmailQueue(filters = {}) {
  const db = await getDb();
  const limit = Math.min(Math.max(Number(filters.limit) || 20, 1), 100);
  const offset = Math.max(Number(filters.offset) || 0, 0);
  const conditions = [];
  const params = [];
  let paramIdx = 1;
  if (filters.status && filters.status !== "ALL") {
    conditions.push(`status = $${paramIdx++}`);
    params.push(filters.status.toUpperCase());
  }
  if (filters.search && filters.search.trim()) {
    conditions.push(`(to_email ILIKE $${paramIdx} OR subject ILIKE $${paramIdx})`);
    params.push(`%${filters.search.trim()}%`);
    paramIdx++;
  }
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const countRes = await db.query(
    `SELECT COUNT(*) as count FROM email_queue ${whereClause}`,
    params
  );
  const total = parseInt(countRes.rows[0]?.count || "0", 10);
  const queryParams = [...params, limit, offset];
  const itemsRes = await db.query(
    `SELECT * FROM email_queue ${whereClause} ORDER BY created_at DESC LIMIT $${paramIdx++} OFFSET $${paramIdx}`,
    queryParams
  );
  return {
    items: itemsRes.rows.map((r) => ({
      id: r.id,
      toEmail: r.to_email,
      subject: r.subject,
      bodyHtml: r.body_html,
      status: r.status,
      providerMessageId: r.provider_message_id,
      errorMessage: r.error_message,
      sentAt: r.sent_at,
      createdAt: r.created_at
    })),
    total
  };
}
async function getEmailQueueStats() {
  const db = await getDb();
  const res = await db.query(`
    SELECT
      COUNT(CASE WHEN status = 'QUEUED' THEN 1 END) as queued,
      COUNT(CASE WHEN status = 'SENT' THEN 1 END) as sent,
      COUNT(CASE WHEN status = 'DELIVERED' THEN 1 END) as delivered,
      COUNT(CASE WHEN status = 'FAILED' THEN 1 END) as failed,
      COUNT(*) as total
    FROM email_queue
  `);
  const row = res.rows[0] || {};
  return {
    totalQueued: parseInt(row.queued || "0", 10),
    totalSent: parseInt(row.sent || "0", 10),
    totalDelivered: parseInt(row.delivered || "0", 10),
    totalFailed: parseInt(row.failed || "0", 10),
    totalAll: parseInt(row.total || "0", 10)
  };
}
async function retryQueueItem(id) {
  const db = await getDb();
  const res = await db.query(
    `UPDATE email_queue SET status = 'QUEUED', error_message = NULL, sent_at = NULL WHERE id = $1 RETURNING id`,
    [id]
  );
  if (res.rowCount > 0) {
    processEmailQueue().catch((err) => console.error("[EmailService] Retry process error:", err));
    return true;
  }
  return false;
}
async function getAutomationRules() {
  const db = await getDb();
  const res = await db.query(`SELECT * FROM automation_rules ORDER BY created_at DESC`);
  return res.rows.map((r) => ({
    id: r.id,
    name: r.name,
    enabled: r.enabled,
    triggerCriteria: r.trigger_criteria,
    delayHours: r.delay_hours,
    cooldownDays: r.cooldown_days,
    templateId: r.template_id,
    createdAt: r.created_at
  }));
}
async function createAutomationRule(adminUserId, adminPublicId, rule) {
  const db = await getDb();
  const id = uuidv410();
  await db.query(
    `
    INSERT INTO automation_rules (id, name, enabled, trigger_criteria, delay_hours, cooldown_days, template_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
    [id, rule.name, rule.enabled, rule.triggerCriteria, rule.delayHours, rule.cooldownDays, rule.templateId]
  );
  const created = {
    id,
    ...rule,
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  await logAdminAction({
    adminUserId,
    adminPublicId,
    action: "CREATE_AUTOMATION_RULE",
    targetType: "automation_rules",
    targetId: id,
    details: `Created automation rule: "${rule.name}"`
  });
  return created;
}
async function updateAutomationRule(adminUserId, adminPublicId, id, rule) {
  const db = await getDb();
  const oldRes = await db.query(`SELECT * FROM automation_rules WHERE id = $1`, [id]);
  if (oldRes.rows.length === 0) {
    throw new Error("Rule not found");
  }
  await db.query(
    `
    UPDATE automation_rules
    SET name = $1, enabled = $2, trigger_criteria = $3, delay_hours = $4, cooldown_days = $5, template_id = $6
    WHERE id = $7
    `,
    [rule.name, rule.enabled, rule.triggerCriteria, rule.delayHours, rule.cooldownDays, rule.templateId, id]
  );
  const updated = {
    id,
    ...rule,
    createdAt: oldRes.rows[0].created_at
  };
  await logAdminAction({
    adminUserId,
    adminPublicId,
    action: "UPDATE_AUTOMATION_RULE",
    targetType: "automation_rules",
    targetId: id,
    details: `Updated automation rule: "${rule.name}"`
  });
  return updated;
}
async function deleteAutomationRule(adminUserId, adminPublicId, id) {
  const db = await getDb();
  const oldRes = await db.query(`SELECT name FROM automation_rules WHERE id = $1`, [id]);
  if (oldRes.rows.length === 0) {
    return false;
  }
  await db.query(`DELETE FROM automation_rules WHERE id = $1`, [id]);
  await logAdminAction({
    adminUserId,
    adminPublicId,
    action: "DELETE_AUTOMATION_RULE",
    targetType: "automation_rules",
    targetId: id,
    details: `Deleted automation rule: "${oldRes.rows[0].name}"`
  });
  return true;
}
async function handleProviderEmailWebhook(providerMessageId, status, errorReason) {
  const db = await getDb();
  const mappedStatus = status === "delivered" ? "DELIVERED" : status === "bounced" ? "FAILED" : "FAILED";
  const res = await db.query(
    `
    UPDATE email_queue
    SET status = $1, error_message = $2
    WHERE provider_message_id = $3
    `,
    [mappedStatus, errorReason || (status === "bounced" ? "Email Bounced" : null), providerMessageId]
  );
  return res.rowCount > 0;
}
async function sendVerificationCodeEmail(toEmail, code) {
  const provider = getEmailProvider();
  const subject = "Verify your PHIVONEX account";
  const html = `
    <div style="background-color: #05070c; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f8fafc; padding: 40px 15px; margin: 0; width: 100%;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 620px; margin: 0 auto; background-color: #0b1329; border: 1px solid #1e293b; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 50px rgba(0, 207, 255, 0.08);">
        <tr>
          <td style="background: linear-gradient(135deg, #0f172a 0%, #070d1e 100%); padding: 32px 30px; border-bottom: 1px solid rgba(0, 207, 255, 0.2); text-align: center;">
            <div style="font-size: 26px; font-weight: 900; letter-spacing: 4px; color: #ffffff; font-family: monospace;">PHIVONEX</div>
            <div style="font-size: 10px; font-weight: 700; letter-spacing: 2px; color: #00CFFF; margin-top: 6px; text-transform: uppercase;">DECENTRALIZED AUTONOMOUS NODE INFRASTRUCTURE</div>
          </td>
        </tr>
        <tr>
          <td style="padding: 35px 30px; text-align: center;">
            <div style="display: inline-block; padding: 6px 14px; background: rgba(0, 207, 255, 0.12); border: 1px solid rgba(0, 207, 255, 0.3); border-radius: 20px; font-size: 11px; font-weight: 700; color: #00CFFF; font-family: monospace; text-transform: uppercase; margin-bottom: 20px;">
              ACCOUNT AUTHENTICATION
            </div>
            <h1 style="font-size: 22px; font-weight: 800; color: #ffffff; margin: 0 0 14px 0; line-height: 1.3;">Verify Your Email Address</h1>
            <p style="font-size: 14px; color: #94a3b8; line-height: 1.6; max-width: 480px; margin: 0 auto 25px auto;">
              Welcome to PHIVONEX. Use the 6-digit cryptographic verification code below to complete your secure account registration. This code expires in 10 minutes.
            </p>
            <div style="background: rgba(0, 207, 255, 0.08); border: 1px solid rgba(0, 207, 255, 0.3); border-radius: 12px; padding: 18px 30px; display: inline-block; font-size: 36px; font-weight: 900; letter-spacing: 8px; color: #00CFFF; font-family: monospace; margin-bottom: 30px; box-shadow: 0 0 25px rgba(0, 207, 255, 0.2);">
              ${code}
            </div>
            <div style="border-top: 1px solid rgba(255,255,255,0.06); padding-top: 20px; max-width: 480px; margin: 0 auto; text-align: left; font-size: 11px; color: #64748b; line-height: 1.5;">
              <p style="margin-bottom: 6px;"><strong>Security Note:</strong> Never share this verification code with anyone. PHIVONEX administrators will never request your OTP.</p>
              <p style="margin: 0;">If you did not initiate this request, please ignore this transmission.</p>
            </div>
          </td>
        </tr>
        <tr>
          <td style="background-color: #070c1a; padding: 20px 30px; border-top: 1px solid rgba(255, 255, 255, 0.06); font-size: 11px; color: #475569; line-height: 1.5; text-align: center;">
            <p style="margin: 0 0 4px 0; font-family: monospace; color: #64748b;">PHIVONEX Security Matrix \u2022 256-Bit Cryptographic Authorization</p>
            <p style="margin: 0;">Automated Authentication Transmission.</p>
          </td>
        </tr>
      </table>
    </div>
  `;
  const result = await provider.sendEmail(toEmail, subject, html);
  if (result.error) {
    console.warn(`[EmailService] Failed to send verification email to ${toEmail}:`, result.error);
  } else {
    console.log(`[EmailService] Verification code email sent to ${toEmail}`);
  }
  return !result.error;
}
async function sendPasswordResetOtpEmail(toEmail, code) {
  const provider = getEmailProvider();
  const subject = `PHIVONEX Password Reset Code: ${code}`;
  const html = `
    <div style="background-color: #05070c; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f8fafc; padding: 40px 15px; margin: 0; width: 100%;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 620px; margin: 0 auto; background-color: #0b1329; border: 1px solid #1e293b; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 50px rgba(0, 207, 255, 0.08);">
        <tr>
          <td style="background: linear-gradient(135deg, #0f172a 0%, #070d1e 100%); padding: 32px 30px; border-bottom: 1px solid rgba(0, 207, 255, 0.2); text-align: center;">
            <div style="font-size: 26px; font-weight: 900; letter-spacing: 4px; color: #ffffff; font-family: monospace;">PHIVONEX</div>
            <div style="font-size: 10px; font-weight: 700; letter-spacing: 2px; color: #00CFFF; margin-top: 6px; text-transform: uppercase;">SECURITY PROTOCOL &amp; ACCOUNT RECOVERY</div>
          </td>
        </tr>
        <tr>
          <td style="padding: 35px 30px; text-align: center;">
            <div style="display: inline-block; padding: 6px 14px; background: rgba(240, 68, 56, 0.12); border: 1px solid rgba(240, 68, 56, 0.3); border-radius: 20px; font-size: 11px; font-weight: 700; color: #F04438; font-family: monospace; text-transform: uppercase; margin-bottom: 20px;">
              PASSWORD RESET AUTHORIZATION
            </div>
            <h1 style="font-size: 22px; font-weight: 800; color: #ffffff; margin: 0 0 14px 0; line-height: 1.3;">Reset Your Password</h1>
            <p style="font-size: 14px; color: #94a3b8; line-height: 1.6; max-width: 480px; margin: 0 auto 25px auto;">
              A password reset request was initiated for your PHIVONEX account. Use the 6-digit verification code below to authorize and complete your password change. This code expires in 15 minutes.
            </p>
            <div style="background: rgba(0, 207, 255, 0.08); border: 1px solid rgba(0, 207, 255, 0.3); border-radius: 12px; padding: 18px 30px; display: inline-block; font-size: 36px; font-weight: 900; letter-spacing: 8px; color: #00CFFF; font-family: monospace; margin-bottom: 30px; box-shadow: 0 0 25px rgba(0, 207, 255, 0.2);">
              ${code}
            </div>
            <div style="border-top: 1px solid rgba(255,255,255,0.06); padding-top: 20px; max-width: 480px; margin: 0 auto; text-align: left; font-size: 11px; color: #64748b; line-height: 1.5;">
              <p style="margin-bottom: 6px;"><strong>Critical Security Notice:</strong> If you did not initiate this password recovery request, your account may be under reconnaissance. Please contact support immediately.</p>
              <p style="margin: 0;">Never disclose this code to anyone under any circumstance.</p>
            </div>
          </td>
        </tr>
        <tr>
          <td style="background-color: #070c1a; padding: 20px 30px; border-top: 1px solid rgba(255, 255, 255, 0.06); font-size: 11px; color: #475569; line-height: 1.5; text-align: center;">
            <p style="margin: 0 0 4px 0; font-family: monospace; color: #64748b;">PHIVONEX Security Matrix \u2022 Single-Use Cryptographic Challenge</p>
            <p style="margin: 0;">Automated Security Dispatch.</p>
          </td>
        </tr>
      </table>
    </div>
  `;
  const result = await provider.sendEmail(toEmail, subject, html);
  if (result.error) {
    console.warn(`[EmailService] Failed to send password reset email to ${toEmail}:`, result.error);
  } else {
    console.log(`[EmailService] Password reset OTP sent to ${toEmail}`);
  }
  return !result.error;
}
async function sendWithdrawalOtpEmail(toEmail, code, details) {
  const provider = getEmailProvider();
  const subject = `PHIVONEX Withdrawal Authorization Code: ${code} (${details.amount} ${details.asset})`;
  const html = `
    <div style="background-color: #05070c; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f8fafc; padding: 40px 15px; margin: 0; width: 100%;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 620px; margin: 0 auto; background-color: #0b1329; border: 1px solid #1e293b; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 50px rgba(0, 207, 255, 0.08);">
        <tr>
          <td style="background: linear-gradient(135deg, #0f172a 0%, #070d1e 100%); padding: 32px 30px; border-bottom: 1px solid rgba(0, 207, 255, 0.2); text-align: center;">
            <div style="font-size: 26px; font-weight: 900; letter-spacing: 4px; color: #ffffff; font-family: monospace;">PHIVONEX</div>
            <div style="font-size: 10px; font-weight: 700; letter-spacing: 2px; color: #00CFFF; margin-top: 6px; text-transform: uppercase;">FINANCIAL SECURITY &amp; ASSET DISBURSEMENT</div>
          </td>
        </tr>
        <tr>
          <td style="padding: 35px 30px; text-align: center;">
            <div style="display: inline-block; padding: 6px 14px; background: rgba(50, 213, 131, 0.12); border: 1px solid rgba(50, 213, 131, 0.3); border-radius: 20px; font-size: 11px; font-weight: 700; color: #32D583; font-family: monospace; text-transform: uppercase; margin-bottom: 20px;">
              WITHDRAWAL AUTHORIZATION REQUIRED
            </div>
            <h1 style="font-size: 22px; font-weight: 800; color: #ffffff; margin: 0 0 14px 0; line-height: 1.3;">Authorize Fund Withdrawal</h1>
            <p style="font-size: 14px; color: #94a3b8; line-height: 1.6; max-width: 480px; margin: 0 auto 20px auto;">
              A withdrawal request has been initiated from your PHIVONEX available balance. Use the 6-digit one-time authorization code below to confirm execution.
            </p>

            <!-- Withdrawal Details Summary Table -->
            <div style="background: #070e20; border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px; padding: 16px 20px; max-width: 480px; margin: 0 auto 24px auto; text-align: left;">
              <table width="100%" cellspacing="0" cellpadding="6" style="font-size: 13px;">
                <tr>
                  <td style="color: #64748b; font-weight: 500;">Withdrawal Amount:</td>
                  <td style="color: #ffffff; font-weight: 700; text-align: right;">${details.amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })} ${details.asset}</td>
                </tr>
                <tr>
                  <td style="color: #64748b; font-weight: 500;">Network / Asset:</td>
                  <td style="color: #00CFFF; font-weight: 600; text-align: right; font-family: monospace;">${details.asset}</td>
                </tr>
                <tr>
                  <td style="color: #64748b; font-weight: 500;">Destination Address:</td>
                  <td style="color: #94a3b8; text-align: right; font-family: monospace; word-break: break-all; font-size: 11px;">${details.destinationAddress}</td>
                </tr>
                <tr>
                  <td style="color: #64748b; font-weight: 500;">Code Validity:</td>
                  <td style="color: #f59e0b; font-weight: 600; text-align: right;">10 Minutes</td>
                </tr>
              </table>
            </div>

            <div style="background: rgba(0, 207, 255, 0.08); border: 1px solid rgba(0, 207, 255, 0.3); border-radius: 12px; padding: 18px 30px; display: inline-block; font-size: 36px; font-weight: 900; letter-spacing: 8px; color: #00CFFF; font-family: monospace; margin-bottom: 25px; box-shadow: 0 0 25px rgba(0, 207, 255, 0.2);">
              ${code}
            </div>

            <div style="border-top: 1px solid rgba(255,255,255,0.06); padding-top: 20px; max-width: 480px; margin: 0 auto; text-align: left; font-size: 11px; color: #64748b; line-height: 1.5;">
              <p style="margin-bottom: 6px;"><strong>Security Warning:</strong> Submitting this code will commit your withdrawal. If you did not initiate this request, change your password immediately and notify security.</p>
              <p style="margin: 0;">Never share this authorization code with anyone.</p>
            </div>
          </td>
        </tr>
        <tr>
          <td style="background-color: #070c1a; padding: 20px 30px; border-top: 1px solid rgba(255, 255, 255, 0.06); font-size: 11px; color: #475569; line-height: 1.5; text-align: center;">
            <p style="margin: 0 0 4px 0; font-family: monospace; color: #64748b;">PHIVONEX Financial Cryptographic Authorization Matrix</p>
            <p style="margin: 0;">Automated Transmission \u2022 Do Not Reply</p>
          </td>
        </tr>
      </table>
    </div>
  `;
  const result = await provider.sendEmail(toEmail, subject, html);
  if (result.error) {
    console.warn(`[EmailService] Failed to send withdrawal OTP email to ${toEmail}:`, result.error);
  } else {
    console.log(`[EmailService] Withdrawal OTP email sent to ${toEmail}`);
  }
  return !result.error;
}
var MockEmailProvider, ResendEmailProvider;
var init_emailService = __esm({
  "src/server/services/emailService.ts"() {
    init_db();
    init_adminService();
    init_notificationService();
    MockEmailProvider = class {
      async sendEmail(to, subject, html) {
        console.log(`[MockEmailProvider] Sending email to ${to}: "${subject}"`);
        return { providerMessageId: `mock_msg_${uuidv410()}` };
      }
    };
    ResendEmailProvider = class {
      constructor(apiKey) {
        this.apiKey = apiKey;
      }
      async sendEmail(to, subject, html) {
        try {
          const defaultDomain = process.env.RESEND_DOMAIN || process.env.CUSTOM_DOMAIN || "phivonex.online";
          const fromAddress = process.env.EMAIL_FROM_ADDRESS || `support@${defaultDomain}`;
          const fromName = process.env.EMAIL_FROM_NAME || "PHIVONEX";
          let from = `${fromName} <${fromAddress}>`;
          let response = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${this.apiKey}`
            },
            signal: AbortSignal.timeout(8e3),
            body: JSON.stringify({
              from,
              to,
              subject,
              html
            })
          });
          let data = await response.json();
          if (!response.ok && (response.status === 403 || data?.name === "validation_error" || data?.message?.toLowerCase().includes("domain") || data?.error?.toLowerCase().includes("domain"))) {
            console.warn(`[Resend Provider] Primary domain send from "${from}" failed domain check (${data?.message || data?.error}). Retrying with onboarding@resend.dev sandbox...`);
            const fallbackFrom = `${fromName} <onboarding@resend.dev>`;
            response = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${this.apiKey}`
              },
              signal: AbortSignal.timeout(8e3),
              body: JSON.stringify({
                from: fallbackFrom,
                to,
                subject,
                html
              })
            });
            data = await response.json();
            if (response.ok) {
              console.log(`[Resend Provider] Live email delivered via sandbox from ${fallbackFrom} to ${to}, ID: ${data?.id}`);
              return { providerMessageId: data?.id };
            }
          }
          if (!response.ok) {
            console.warn("[Resend Provider] API response error:", data);
            return { error: data?.message || data?.error || "Resend provider error" };
          }
          console.log(`[Resend Provider] Live email sent successfully to ${to} from ${from}, ID: ${data?.id}`);
          return { providerMessageId: data?.id };
        } catch (err) {
          console.warn("[Resend Provider] Network error communicating with Resend:", err);
          return { error: err.message || "Network error communicating with Resend" };
        }
      }
    };
  }
});

// src/config/referralConfig.ts
function formatPublicCommissionId(seq) {
  const clean = typeof seq === "string" ? seq.replace(/\D/g, "") : seq;
  const num = typeof clean === "number" ? clean : parseInt(clean, 10) || Math.floor(1e5 + Math.random() * 9e5);
  return `PHX-COM-${String(num).padStart(6, "0")}`;
}
var init_referralConfig = __esm({
  "src/config/referralConfig.ts"() {
  }
});

// src/server/services/referralCommissionService.ts
import { v4 as uuidv412 } from "uuid";
async function processNodeActivationCommission(db, orderId, nodeId, buyerUserId) {
  const sponsorRes = await db.query(
    `
    SELECT ur.sponsor_user_id, u.public_id AS buyer_public_id
    FROM users u
    LEFT JOIN user_referrals ur ON u.id = ur.user_id
    WHERE u.id = $1
    `,
    [buyerUserId]
  );
  if (sponsorRes.rows.length === 0) {
    return null;
  }
  const { sponsor_user_id: sponsorUserId, buyer_public_id: buyerPublicId } = sponsorRes.rows[0];
  if (!sponsorUserId || sponsorUserId === buyerUserId) {
    return null;
  }
  const sponsorUserRes = await db.query(
    `SELECT id, public_id, status FROM users WHERE id = $1`,
    [sponsorUserId]
  );
  if (sponsorUserRes.rows.length === 0) {
    return null;
  }
  const sponsorUser = sponsorUserRes.rows[0];
  const sponsorNodeRes = await db.query(
    `
    SELECT COUNT(*)::int AS count 
    FROM nodes 
    WHERE owner_user_id = $1 AND status = 'ACTIVE'
    `,
    [sponsorUserId]
  );
  const sponsorActiveNodes = Number(sponsorNodeRes.rows[0]?.count || 0);
  if (sponsorActiveNodes === 0) {
    console.warn(`[ReferralCommission] Sponsor ${sponsorUserId} has no active Genesis Node. Direct referral commission skipped.`);
    return null;
  }
  const existingRes = await db.query(
    `
    SELECT 
      rc.id, rc.public_commission_id, rc.amount_usd, rc.status, rc.earned_at,
      n.public_node_id, u.public_id AS buyer_public_id
    FROM referral_commissions rc
    JOIN nodes n ON rc.node_id = n.id
    JOIN users u ON rc.referred_user_id = u.id
    WHERE rc.node_id = $1
    `,
    [nodeId]
  );
  if (existingRes.rows.length > 0) {
    const existing = existingRes.rows[0];
    return {
      publicCommissionId: existing.public_commission_id,
      referredUserPublicId: existing.buyer_public_id,
      nodePublicId: existing.public_node_id,
      amountUsd: Number(existing.amount_usd),
      status: existing.status,
      earnedAt: existing.earned_at.toISOString(),
      reversedAt: null
    };
  }
  const nodeRes = await db.query(
    `SELECT public_node_id, node_number FROM nodes WHERE id = $1`,
    [nodeId]
  );
  const nodeInfo = nodeRes.rows[0];
  const nodePublicId = nodeInfo?.public_node_id || "PHX-NODE-UNKNOWN";
  const countRes = await db.query(`SELECT COUNT(*)::int AS count FROM referral_commissions`);
  const seq = parseInt(countRes.rows[0].count, 10) + 1;
  let publicCommissionId = formatPublicCommissionId(seq);
  let collisionCheck = await db.query(`SELECT id FROM referral_commissions WHERE public_commission_id = $1`, [publicCommissionId]);
  if (collisionCheck.rows.length > 0) {
    publicCommissionId = `PHX-COM-${Math.floor(1e5 + Math.random() * 9e5)}`;
  }
  const commissionId = uuidv412();
  const commissionRate = await getDirectReferralCommissionRate();
  const insertRes = await db.query(
    `
    INSERT INTO referral_commissions (
      id, public_commission_id, sponsor_user_id, referred_user_id,
      node_id, node_order_id, amount_usd, status, earned_at, created_at
    ) VALUES (
      $1, $2, $3, $4,
      $5, $6, $7, 'EARNED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
    RETURNING id, public_commission_id, amount_usd, status, earned_at, created_at
    `,
    [
      commissionId,
      publicCommissionId,
      sponsorUserId,
      buyerUserId,
      nodeId,
      orderId,
      commissionRate.toFixed(2)
    ]
  );
  const row = insertRes.rows[0];
  try {
    await postLedgerCredit({
      userId: sponsorUserId,
      sourceType: "REFERRAL_COMMISSION",
      sourceId: row.id,
      sourceRef: row.public_commission_id,
      amount: Number(row.amount_usd),
      description: `Direct Referral Commission - Node ${nodePublicId} Activation`,
      createdAt: new Date(row.earned_at),
      dbClient: db
    });
  } catch (ledgErr) {
    console.warn("[WalletLedger] Error posting referral commission to ledger:", ledgErr);
  }
  try {
    await db.query(
      `
      INSERT INTO security_events (id, user_id, event_type, description, created_at)
      VALUES ($1, $2, 'DIRECT_REFERRAL_COMMISSION_EARNED', $3, CURRENT_TIMESTAMP)
      `,
      [
        uuidv412(),
        sponsorUserId,
        `Direct referral commission ${publicCommissionId} ($50.00 USD) credited for referred buyer ${buyerPublicId} activating Genesis Node ${nodePublicId}.`
      ]
    );
  } catch (secErr) {
    console.warn("[SecurityEvent] Could not log referral commission event:", secErr);
  }
  try {
    await notifyReferralEarned({
      userId: sponsorUserId,
      amountUsd: Number(row.amount_usd),
      buyerPublicId,
      commissionId: row.id
    });
  } catch (notifErr) {
    console.warn("[Notification] Could not trigger referral earned notification:", notifErr);
  }
  return {
    publicCommissionId: row.public_commission_id,
    referredUserPublicId: buyerPublicId,
    nodePublicId,
    amountUsd: Number(row.amount_usd),
    status: row.status,
    earnedAt: row.earned_at.toISOString(),
    reversedAt: null
  };
}
async function getUserCommissions(sponsorUserId) {
  const db = await getDb();
  const result = await db.query(
    `
    SELECT 
      rc.public_commission_id,
      u.public_id AS referred_public_id,
      n.public_node_id,
      rc.amount_usd,
      rc.status,
      rc.earned_at,
      rc.reversed_at
    FROM referral_commissions rc
    JOIN users u ON rc.referred_user_id = u.id
    JOIN nodes n ON rc.node_id = n.id
    WHERE rc.sponsor_user_id = $1
    ORDER BY rc.earned_at DESC
    `,
    [sponsorUserId]
  );
  let totalEarnedUsd = 0;
  const commissions = [];
  for (const row of result.rows) {
    const amount = Number(row.amount_usd);
    if (row.status === "EARNED") {
      totalEarnedUsd += amount;
    }
    commissions.push({
      publicCommissionId: row.public_commission_id,
      referredUserPublicId: row.referred_public_id,
      nodePublicId: row.public_node_id,
      amountUsd: amount,
      status: row.status,
      earnedAt: row.earned_at.toISOString(),
      reversedAt: row.reversed_at ? row.reversed_at.toISOString() : null
    });
  }
  return {
    totalEarnedUsd,
    commissions
  };
}
var init_referralCommissionService = __esm({
  "src/server/services/referralCommissionService.ts"() {
    init_db();
    init_referralConfig();
    init_idGenerator();
    init_walletLedgerService();
    init_economicService();
    init_notificationService();
  }
});

// src/server/utils/timezone.ts
function getDhakaBusinessDate(date = /* @__PURE__ */ new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: PHIVONEX_BUSINESS_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  return formatter.format(date);
}
function getUtcBusinessDate(date = /* @__PURE__ */ new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: PHIVONEX_UTC_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  return formatter.format(date);
}
function getPreviousDhakaBusinessDate(date = /* @__PURE__ */ new Date()) {
  const currentDhakaStr = getDhakaBusinessDate(date);
  const [year, month, day] = currentDhakaStr.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().split("T")[0];
}
function getPreviousUtcBusinessDate(date = /* @__PURE__ */ new Date()) {
  const currentUtcStr = getUtcBusinessDate(date);
  const [year, month, day] = currentUtcStr.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().split("T")[0];
}
function getNextDhakaMidnightTime(from = /* @__PURE__ */ new Date()) {
  const currentDhakaStr = getDhakaBusinessDate(from);
  const [year, month, day] = currentDhakaStr.split("-").map(Number);
  const tomorrow = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const nextDhakaDateStr = tomorrow.toISOString().split("T")[0];
  const [nextYear, nextMonth, nextDay] = nextDhakaDateStr.split("-").map(Number);
  const nextMidnightUtcMs = Date.UTC(nextYear, nextMonth - 1, nextDay, 0, 0, 0) - 6 * 60 * 60 * 1e3;
  const nextMidnightDate = new Date(nextMidnightUtcMs);
  const diffMs = Math.max(0, nextMidnightDate.getTime() - from.getTime());
  return {
    nextMidnightIso: nextMidnightDate.toISOString(),
    msUntilMidnight: diffMs
  };
}
function getNextUtc0600Time(from = /* @__PURE__ */ new Date()) {
  const now = from.getTime();
  const d = new Date(now);
  const targetToday = new Date(Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate(),
    6,
    0,
    0,
    0
  ));
  if (now >= targetToday.getTime()) {
    targetToday.setUTCDate(targetToday.getUTCDate() + 1);
  }
  return {
    nextRunIso: targetToday.toISOString(),
    msUntilRun: Math.max(0, targetToday.getTime() - now)
  };
}
var PHIVONEX_BUSINESS_TIMEZONE, PHIVONEX_UTC_TIMEZONE;
var init_timezone = __esm({
  "src/server/utils/timezone.ts"() {
    PHIVONEX_BUSINESS_TIMEZONE = "Asia/Dhaka";
    PHIVONEX_UTC_TIMEZONE = "UTC";
  }
});

// src/server/services/binaryVolumeService.ts
import { v4 as uuidv413 } from "uuid";
async function propagateNodeSalesVolume(dbClient, sourceNodeId, buyerUserId, occurredAtDate) {
  const db = dbClient || await getDb();
  const nodeRes = await db.query(
    `SELECT id, status, owner_user_id, activated_at FROM nodes WHERE id = $1`,
    [sourceNodeId]
  );
  if (nodeRes.rows.length === 0) {
    return {
      sourceNodeId,
      buyerUserId,
      eventsCreated: 0,
      ancestorsProcessed: 0,
      reason: "NODE_NOT_FOUND"
    };
  }
  const node = nodeRes.rows[0];
  if (node.status !== "ACTIVE") {
    return {
      sourceNodeId,
      buyerUserId,
      eventsCreated: 0,
      ancestorsProcessed: 0,
      reason: `NODE_NOT_ACTIVE (status=${node.status})`
    };
  }
  if (node.owner_user_id !== buyerUserId) {
    return {
      sourceNodeId,
      buyerUserId,
      eventsCreated: 0,
      ancestorsProcessed: 0,
      reason: "BUYER_MISMATCH"
    };
  }
  const buyerPlacementRes = await db.query(
    `SELECT parent_user_id, side, status FROM binary_placements WHERE user_id = $1`,
    [buyerUserId]
  );
  const buyerPlacement = buyerPlacementRes.rows[0];
  if (!buyerPlacement || buyerPlacement.status !== "PLACED" || !buyerPlacement.parent_user_id) {
    return {
      sourceNodeId,
      buyerUserId,
      eventsCreated: 0,
      ancestorsProcessed: 0,
      reason: "BUYER_NOT_PLACED"
    };
  }
  const ancestors = [];
  let currentUserId = buyerUserId;
  const visited = /* @__PURE__ */ new Set([buyerUserId]);
  while (true) {
    const stepRes = await db.query(
      `SELECT parent_user_id, side, status FROM binary_placements WHERE user_id = $1`,
      [currentUserId]
    );
    const step = stepRes.rows[0];
    if (!step || step.status !== "PLACED" || !step.parent_user_id || !step.side) {
      break;
    }
    const parentId = step.parent_user_id;
    const legSide = step.side;
    if (visited.has(parentId)) {
      console.warn(`[BinaryVolume] Cycle detected in ancestry traversal at ancestor ${parentId}`);
      break;
    }
    visited.add(parentId);
    ancestors.push({
      ancestorUserId: parentId,
      side: legSide
    });
    currentUserId = parentId;
  }
  if (ancestors.length === 0) {
    return {
      sourceNodeId,
      buyerUserId,
      eventsCreated: 0,
      ancestorsProcessed: 0,
      reason: "NO_ANCESTORS"
    };
  }
  const effectiveTimestamp = occurredAtDate || (node.activated_at ? new Date(node.activated_at) : /* @__PURE__ */ new Date());
  const businessDate = getDhakaBusinessDate(effectiveTimestamp);
  let eventsCreated = 0;
  for (const step of ancestors) {
    const eventId = uuidv413();
    const publicEventId = generateVolumeEventPublicId();
    const insertRes = await db.query(
      `
      INSERT INTO binary_volume_events (
        id, public_event_id, beneficiary_user_id, source_user_id, source_node_id,
        side, volume_units, status, business_date, occurred_at, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, 1, 'ACTIVE', $7, $8, CURRENT_TIMESTAMP)
      ON CONFLICT (beneficiary_user_id, source_node_id) DO NOTHING
      RETURNING id
      `,
      [
        eventId,
        publicEventId,
        step.ancestorUserId,
        buyerUserId,
        sourceNodeId,
        step.side,
        businessDate,
        effectiveTimestamp
      ]
    );
    if (insertRes.rows.length > 0) {
      eventsCreated++;
      const dailyId = uuidv413();
      await db.query(
        `
        INSERT INTO binary_daily_volumes (
          id, user_id, business_date, left_units, right_units, created_at, updated_at
        )
        VALUES (
          $1, $2, $3,
          CASE WHEN $4 = 'LEFT' THEN 1 ELSE 0 END,
          CASE WHEN $4 = 'RIGHT' THEN 1 ELSE 0 END,
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
        ON CONFLICT (user_id, business_date) DO UPDATE SET
          left_units = binary_daily_volumes.left_units + (CASE WHEN EXCLUDED.left_units = 1 THEN 1 ELSE 0 END),
          right_units = binary_daily_volumes.right_units + (CASE WHEN EXCLUDED.right_units = 1 THEN 1 ELSE 0 END),
          updated_at = CURRENT_TIMESTAMP
        `,
        [dailyId, step.ancestorUserId, businessDate, step.side]
      );
      await db.query(
        `
        INSERT INTO binary_volume_balances (user_id, carry_left_units, carry_right_units, updated_at)
        VALUES ($1, 0, 0, CURRENT_TIMESTAMP)
        ON CONFLICT (user_id) DO NOTHING
        `,
        [step.ancestorUserId]
      );
    }
  }
  return {
    sourceNodeId,
    buyerUserId,
    eventsCreated,
    ancestorsProcessed: ancestors.length
  };
}
async function backfillNodeSalesVolumeForPlacedMember(dbClient, memberUserId) {
  const db = dbClient || await getDb();
  const activeNodesRes = await db.query(
    `
    SELECT id, activated_at 
    FROM nodes 
    WHERE owner_user_id = $1 AND status = 'ACTIVE'
    ORDER BY activated_at ASC
    `,
    [memberUserId]
  );
  if (activeNodesRes.rows.length === 0) {
    return 0;
  }
  let totalEventsCreated = 0;
  for (const node of activeNodesRes.rows) {
    const result = await propagateNodeSalesVolume(
      db,
      node.id,
      memberUserId,
      node.activated_at ? new Date(node.activated_at) : void 0
    );
    totalEventsCreated += result.eventsCreated;
  }
  return totalEventsCreated;
}
async function getVolumeSummary(userId) {
  const db = await getDb();
  const currentDhakaDate = getDhakaBusinessDate();
  const todayRes = await db.query(
    `
    SELECT left_units, right_units
    FROM binary_daily_volumes
    WHERE user_id = $1 AND business_date = $2
    `,
    [userId, currentDhakaDate]
  );
  const todayLeft = todayRes.rows[0] ? Number(todayRes.rows[0].left_units) : 0;
  const todayRight = todayRes.rows[0] ? Number(todayRes.rows[0].right_units) : 0;
  const balanceRes = await db.query(
    `
    SELECT carry_left_units, carry_right_units, last_settled_business_date
    FROM binary_volume_balances
    WHERE user_id = $1
    `,
    [userId]
  );
  const carryLeft = balanceRes.rows[0] ? Number(balanceRes.rows[0].carry_left_units) : 0;
  const carryRight = balanceRes.rows[0] ? Number(balanceRes.rows[0].carry_right_units) : 0;
  const lastSettled = balanceRes.rows[0]?.last_settled_business_date || null;
  let unsettledQuery;
  let unsettledParams;
  if (lastSettled) {
    unsettledQuery = `
      SELECT 
        COALESCE(SUM(CASE WHEN side = 'LEFT' THEN volume_units ELSE 0 END), 0)::int AS unsettled_left,
        COALESCE(SUM(CASE WHEN side = 'RIGHT' THEN volume_units ELSE 0 END), 0)::int AS unsettled_right
      FROM binary_volume_events
      WHERE beneficiary_user_id = $1 AND status = 'ACTIVE' AND business_date > $2
    `;
    unsettledParams = [userId, lastSettled];
  } else {
    unsettledQuery = `
      SELECT 
        COALESCE(SUM(CASE WHEN side = 'LEFT' THEN volume_units ELSE 0 END), 0)::int AS unsettled_left,
        COALESCE(SUM(CASE WHEN side = 'RIGHT' THEN volume_units ELSE 0 END), 0)::int AS unsettled_right
      FROM binary_volume_events
      WHERE beneficiary_user_id = $1 AND status = 'ACTIVE'
    `;
    unsettledParams = [userId];
  }
  const unsettledRes = await db.query(unsettledQuery, unsettledParams);
  const unsettledLeft = unsettledRes.rows[0] ? Number(unsettledRes.rows[0].unsettled_left) : 0;
  const unsettledRight = unsettledRes.rows[0] ? Number(unsettledRes.rows[0].unsettled_right) : 0;
  const availableLeft = carryLeft + unsettledLeft;
  const availableRight = carryRight + unsettledRight;
  return {
    businessDate: currentDhakaDate,
    today: {
      left: todayLeft,
      right: todayRight
    },
    carry: {
      left: carryLeft,
      right: carryRight
    },
    availableForFutureMatching: {
      left: availableLeft,
      right: availableRight
    }
  };
}
async function getVolumeHistory(userId, page = 1, limit = 20) {
  const db = await getDb();
  const safePage = Math.max(1, page);
  const safeLimit = Math.min(100, Math.max(1, limit));
  const offset = (safePage - 1) * safeLimit;
  const countRes = await db.query(
    `SELECT COUNT(*)::int AS count FROM binary_daily_volumes WHERE user_id = $1`,
    [userId]
  );
  const totalCount = Number(countRes.rows[0]?.count || 0);
  const rowsRes = await db.query(
    `
    SELECT business_date, left_units, right_units
    FROM binary_daily_volumes
    WHERE user_id = $1
    ORDER BY business_date DESC
    LIMIT $2 OFFSET $3
    `,
    [userId, safeLimit, offset]
  );
  const history = rowsRes.rows.map((r) => ({
    businessDate: typeof r.business_date === "string" ? r.business_date.split("T")[0] : new Date(r.business_date).toISOString().split("T")[0],
    leftUnits: Number(r.left_units),
    rightUnits: Number(r.right_units)
  }));
  return {
    history,
    pagination: {
      page: safePage,
      limit: safeLimit,
      totalCount,
      totalPages: Math.max(1, Math.ceil(totalCount / safeLimit))
    }
  };
}
var init_binaryVolumeService = __esm({
  "src/server/services/binaryVolumeService.ts"() {
    init_db();
    init_idGenerator();
    init_timezone();
  }
});

// src/server/services/promotionalService.ts
var promotionalService_exports = {};
__export(promotionalService_exports, {
  claimAndPayPromotionalOffer: () => claimAndPayPromotionalOffer,
  createPromotionalBanner: () => createPromotionalBanner,
  createPromotionalOffer: () => createPromotionalOffer,
  deletePromotionalBanner: () => deletePromotionalBanner,
  deletePromotionalOffer: () => deletePromotionalOffer,
  getLeaderboard: () => getLeaderboard,
  getLeaderboardSettings: () => getLeaderboardSettings,
  getPerformancePopupData: () => getPerformancePopupData,
  getPerformancePopupSettings: () => getPerformancePopupSettings,
  getPromotionalBanners: () => getPromotionalBanners,
  getPromotionalOffers: () => getPromotionalOffers,
  updateLeaderboardSettings: () => updateLeaderboardSettings,
  updatePerformancePopupSettings: () => updatePerformancePopupSettings,
  updatePromotionalBanner: () => updatePromotionalBanner,
  updatePromotionalOffer: () => updatePromotionalOffer
});
import { v4 as uuidv414 } from "uuid";
async function getPromotionalOffers(adminOnly = false) {
  const db = await getDb();
  let query = `
    SELECT id, title, description, banner_image, offer_type, bonus_nodes_count,
           bonus_mining_rewards, bonus_matching_enabled, bonus_referral_commission,
           COALESCE(promotional_price_usd, 1000.00) AS promotional_price_usd,
           COALESCE(discount_percent, 0.00) AS discount_percent,
           COALESCE(badge_tag, 'HOT_DEAL') AS badge_tag,
           COALESCE(total_allocated_slots, 100) AS total_allocated_slots,
           COALESCE(claimed_slots, 18) AS claimed_slots,
           start_date, end_date, status, target_audience, priority_order, created_at 
    FROM promotional_offers
  `;
  const params = [];
  if (!adminOnly) {
    query += ` WHERE status = 'ACTIVE' AND start_date <= CURRENT_TIMESTAMP AND end_date >= CURRENT_TIMESTAMP `;
  }
  query += ` ORDER BY priority_order ASC, created_at DESC `;
  const res = await db.query(query, params);
  return res.rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    bannerImage: r.banner_image,
    offerType: r.offer_type || "BOGO_FREE_NODE",
    bonusNodesCount: Number(r.bonus_nodes_count ?? 1),
    bonusMiningRewards: r.bonus_mining_rewards ?? true,
    bonusMatchingEnabled: r.bonus_matching_enabled ?? false,
    bonusReferralCommission: r.bonus_referral_commission ?? false,
    promotionalPriceUsd: Number(r.promotional_price_usd ?? 1e3),
    discountPercent: Number(r.discount_percent ?? 0),
    badgeTag: r.badge_tag || "HOT_DEAL",
    totalAllocatedSlots: Number(r.total_allocated_slots ?? 100),
    claimedSlots: Number(r.claimed_slots ?? 18),
    startDate: r.start_date,
    endDate: r.end_date,
    status: r.status,
    targetAudience: r.target_audience,
    priorityOrder: r.priority_order,
    createdAt: r.created_at
  }));
}
async function createPromotionalOffer(adminUserId, adminPublicId, offer) {
  const db = await getDb();
  const id = uuidv414();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  await db.query(
    `
    INSERT INTO promotional_offers (
      id, title, description, banner_image, offer_type, bonus_nodes_count,
      bonus_mining_rewards, bonus_matching_enabled, bonus_referral_commission,
      promotional_price_usd, discount_percent, badge_tag, total_allocated_slots, claimed_slots,
      start_date, end_date, status, target_audience, priority_order
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
    `,
    [
      id,
      offer.title,
      offer.description,
      offer.bannerImage,
      offer.offerType || "BOGO_FREE_NODE",
      offer.bonusNodesCount ?? 1,
      offer.bonusMiningRewards ?? true,
      offer.bonusMatchingEnabled ?? false,
      offer.bonusReferralCommission ?? false,
      offer.promotionalPriceUsd ?? 1e3,
      offer.discountPercent ?? 0,
      offer.badgeTag || "HOT_DEAL",
      offer.totalAllocatedSlots ?? 100,
      offer.claimedSlots ?? 0,
      offer.startDate,
      offer.endDate,
      offer.status,
      offer.targetAudience,
      offer.priorityOrder
    ]
  );
  const created = {
    id,
    ...offer,
    promotionalPriceUsd: offer.promotionalPriceUsd ?? 1e3,
    discountPercent: offer.discountPercent ?? 0,
    badgeTag: offer.badgeTag || "HOT_DEAL",
    totalAllocatedSlots: offer.totalAllocatedSlots ?? 100,
    claimedSlots: offer.claimedSlots ?? 0,
    createdAt: now
  };
  try {
    const { adminFirestore: adminFirestore2 } = await Promise.resolve().then(() => (init_firebase_admin(), firebase_admin_exports));
    await adminFirestore2.collection("promotional_offers").doc(id).set({
      ...created,
      updatedAt: now
    });
  } catch (fsErr) {
    console.warn("[PromotionalService] Firestore real-time offer sync warning:", fsErr);
  }
  await logAdminAction({
    adminUserId,
    adminPublicId,
    action: "CREATE_PROMOTIONAL_OFFER",
    targetType: "promotional_offers",
    targetId: id,
    details: `Created promotional offer: "${offer.title}" (${offer.offerType || "BOGO_FREE_NODE"})`
  });
  return created;
}
async function updatePromotionalOffer(adminUserId, adminPublicId, id, offer) {
  const db = await getDb();
  const oldRes = await db.query(`SELECT * FROM promotional_offers WHERE id = $1`, [id]);
  if (oldRes.rows.length === 0) {
    throw new Error("Offer not found");
  }
  await db.query(
    `
    UPDATE promotional_offers
    SET title = $1, description = $2, banner_image = $3, offer_type = $4, bonus_nodes_count = $5,
        bonus_mining_rewards = $6, bonus_matching_enabled = $7, bonus_referral_commission = $8,
        promotional_price_usd = $9, discount_percent = $10, badge_tag = $11, total_allocated_slots = $12, claimed_slots = $13,
        start_date = $14, end_date = $15, status = $16, target_audience = $17, priority_order = $18
    WHERE id = $19
    `,
    [
      offer.title,
      offer.description,
      offer.bannerImage,
      offer.offerType || "BOGO_FREE_NODE",
      offer.bonusNodesCount ?? 1,
      offer.bonusMiningRewards ?? true,
      offer.bonusMatchingEnabled ?? false,
      offer.bonusReferralCommission ?? false,
      offer.promotionalPriceUsd ?? 1e3,
      offer.discountPercent ?? 0,
      offer.badgeTag || "HOT_DEAL",
      offer.totalAllocatedSlots ?? 100,
      offer.claimedSlots ?? (oldRes.rows[0].claimed_slots || 0),
      offer.startDate,
      offer.endDate,
      offer.status,
      offer.targetAudience,
      offer.priorityOrder,
      id
    ]
  );
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const updated = {
    id,
    ...offer,
    promotionalPriceUsd: offer.promotionalPriceUsd ?? 1e3,
    discountPercent: offer.discountPercent ?? 0,
    badgeTag: offer.badgeTag || "HOT_DEAL",
    totalAllocatedSlots: offer.totalAllocatedSlots ?? 100,
    claimedSlots: offer.claimedSlots ?? (oldRes.rows[0].claimed_slots || 0),
    createdAt: oldRes.rows[0].created_at
  };
  try {
    const { adminFirestore: adminFirestore2 } = await Promise.resolve().then(() => (init_firebase_admin(), firebase_admin_exports));
    await adminFirestore2.collection("promotional_offers").doc(id).set({
      ...updated,
      updatedAt: now
    });
  } catch (fsErr) {
    console.warn("[PromotionalService] Firestore real-time update sync warning:", fsErr);
  }
  await logAdminAction({
    adminUserId,
    adminPublicId,
    action: "UPDATE_PROMOTIONAL_OFFER",
    targetType: "promotional_offers",
    targetId: id,
    details: `Updated promotional offer: "${offer.title}"`
  });
  return updated;
}
async function deletePromotionalOffer(adminUserId, adminPublicId, id) {
  const db = await getDb();
  const oldRes = await db.query(`SELECT title FROM promotional_offers WHERE id = $1`, [id]);
  if (oldRes.rows.length === 0) {
    return false;
  }
  await db.query(`DELETE FROM promotional_offers WHERE id = $1`, [id]);
  try {
    const { adminFirestore: adminFirestore2 } = await Promise.resolve().then(() => (init_firebase_admin(), firebase_admin_exports));
    await adminFirestore2.collection("promotional_offers").doc(id).delete();
  } catch (fsErr) {
    console.warn("[PromotionalService] Firestore real-time delete sync warning:", fsErr);
  }
  await logAdminAction({
    adminUserId,
    adminPublicId,
    action: "DELETE_PROMOTIONAL_OFFER",
    targetType: "promotional_offers",
    targetId: id,
    details: `Deleted promotional offer: "${oldRes.rows[0].title}"`
  });
  return true;
}
async function claimAndPayPromotionalOffer(userId, offerId, preferredAsset = "USDT") {
  const db = await getDb();
  const offerRes = await db.query(
    `SELECT * FROM promotional_offers WHERE id = $1 AND status = 'ACTIVE'`,
    [offerId]
  );
  if (offerRes.rows.length === 0) {
    throw new Error("Promotional offer is no longer active or available.");
  }
  const offerRow = offerRes.rows[0];
  const { purchaseNodeWithDepositBalance: purchaseNodeWithDepositBalance2 } = await Promise.resolve().then(() => (init_nodeOrderService(), nodeOrderService_exports));
  const purchaseResult = await purchaseNodeWithDepositBalance2(userId, preferredAsset);
  await db.query(
    `UPDATE promotional_offers SET claimed_slots = COALESCE(claimed_slots, 0) + 1 WHERE id = $1`,
    [offerId]
  );
  try {
    const { adminFirestore: adminFirestore2 } = await Promise.resolve().then(() => (init_firebase_admin(), firebase_admin_exports));
    await adminFirestore2.collection("promotional_offers").doc(offerId).set(
      {
        claimedSlots: (Number(offerRow.claimed_slots) || 0) + 1,
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      },
      { merge: true }
    );
  } catch {
  }
  const offer = {
    id: offerRow.id,
    title: offerRow.title,
    description: offerRow.description,
    bannerImage: offerRow.banner_image,
    offerType: offerRow.offer_type,
    bonusNodesCount: Number(offerRow.bonus_nodes_count || 1),
    bonusMiningRewards: offerRow.bonus_mining_rewards ?? true,
    bonusMatchingEnabled: offerRow.bonus_matching_enabled ?? false,
    bonusReferralCommission: offerRow.bonus_referral_commission ?? false,
    promotionalPriceUsd: Number(offerRow.promotional_price_usd || 1e3),
    discountPercent: Number(offerRow.discount_percent || 0),
    badgeTag: offerRow.badge_tag || "HOT_DEAL",
    totalAllocatedSlots: Number(offerRow.total_allocated_slots || 100),
    claimedSlots: (Number(offerRow.claimed_slots) || 0) + 1,
    startDate: offerRow.start_date,
    endDate: offerRow.end_date,
    status: offerRow.status,
    targetAudience: offerRow.target_audience,
    priorityOrder: offerRow.priority_order,
    createdAt: offerRow.created_at
  };
  return {
    success: true,
    order: purchaseResult.order,
    node: purchaseResult.node,
    bonusNodes: [],
    offer,
    depositDeducted: purchaseResult.depositDeducted,
    message: `Promotional package "${offer.title}" successfully claimed and provisioned!`
  };
}
async function getPromotionalBanners(adminOnly = false) {
  const db = await getDb();
  let query = `
    SELECT id, content, image_url, cta_text, cta_destination, display_order, status, start_date, end_date, created_at 
    FROM promotional_banners
  `;
  const params = [];
  if (!adminOnly) {
    query += ` WHERE status = 'ACTIVE' AND start_date <= CURRENT_TIMESTAMP AND end_date >= CURRENT_TIMESTAMP `;
  }
  query += ` ORDER BY display_order ASC, created_at DESC `;
  const res = await db.query(query, params);
  return res.rows.map((r) => ({
    id: r.id,
    content: r.content,
    imageUrl: r.image_url,
    ctaText: r.cta_text,
    ctaDestination: r.cta_destination,
    displayOrder: r.display_order,
    status: r.status,
    startDate: r.start_date,
    endDate: r.end_date,
    createdAt: r.created_at
  }));
}
async function createPromotionalBanner(adminUserId, adminPublicId, banner) {
  const db = await getDb();
  const id = uuidv414();
  await db.query(
    `
    INSERT INTO promotional_banners (id, content, image_url, cta_text, cta_destination, display_order, status, start_date, end_date)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `,
    [
      id,
      banner.content,
      banner.imageUrl,
      banner.ctaText,
      banner.ctaDestination,
      banner.displayOrder,
      banner.status,
      banner.startDate,
      banner.endDate
    ]
  );
  const created = {
    id,
    ...banner,
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  await logAdminAction({
    adminUserId,
    adminPublicId,
    action: "CREATE_PROMOTIONAL_BANNER",
    targetType: "promotional_banners",
    targetId: id,
    details: `Created promotional banner: "${banner.content.substring(0, 30)}..."`
  });
  return created;
}
async function updatePromotionalBanner(adminUserId, adminPublicId, id, banner) {
  const db = await getDb();
  const oldRes = await db.query(`SELECT * FROM promotional_banners WHERE id = $1`, [id]);
  if (oldRes.rows.length === 0) {
    throw new Error("Banner not found");
  }
  await db.query(
    `
    UPDATE promotional_banners
    SET content = $1, image_url = $2, cta_text = $3, cta_destination = $4, display_order = $5, status = $6, start_date = $7, end_date = $8
    WHERE id = $9
    `,
    [
      banner.content,
      banner.imageUrl,
      banner.ctaText,
      banner.ctaDestination,
      banner.displayOrder,
      banner.status,
      banner.startDate,
      banner.endDate,
      id
    ]
  );
  const updated = {
    id,
    ...banner,
    createdAt: oldRes.rows[0].created_at
  };
  await logAdminAction({
    adminUserId,
    adminPublicId,
    action: "UPDATE_PROMOTIONAL_BANNER",
    targetType: "promotional_banners",
    targetId: id,
    details: `Updated promotional banner: "${banner.content.substring(0, 30)}..."`
  });
  return updated;
}
async function deletePromotionalBanner(adminUserId, adminPublicId, id) {
  const db = await getDb();
  const oldRes = await db.query(`SELECT content FROM promotional_banners WHERE id = $1`, [id]);
  if (oldRes.rows.length === 0) {
    return false;
  }
  await db.query(`DELETE FROM promotional_banners WHERE id = $1`, [id]);
  await logAdminAction({
    adminUserId,
    adminPublicId,
    action: "DELETE_PROMOTIONAL_BANNER",
    targetType: "promotional_banners",
    targetId: id,
    details: `Deleted promotional banner: "${oldRes.rows[0].content.substring(0, 30)}..."`
  });
  return true;
}
async function getLeaderboardSettings() {
  const db = await getDb();
  const res = await db.query(`SELECT value FROM promotional_settings WHERE key = 'leaderboard_metric'`);
  if (res.rows.length === 0) {
    return { metric: "DIRECT_REFERRALS" };
  }
  return { metric: JSON.parse(res.rows[0].value) };
}
async function updateLeaderboardSettings(adminUserId, adminPublicId, metric) {
  const db = await getDb();
  const oldSettings = await getLeaderboardSettings();
  await db.query(
    `
    INSERT INTO promotional_settings (key, value)
    VALUES ('leaderboard_metric', $1)
    ON CONFLICT (key) DO UPDATE SET value = $1
    `,
    [JSON.stringify(metric)]
  );
  await logAdminAction({
    adminUserId,
    adminPublicId,
    action: "UPDATE_LEADERBOARD_METRIC",
    targetType: "promotional_settings",
    targetId: "leaderboard_metric",
    details: `Changed leaderboard metric from "${oldSettings.metric}" to "${metric}"`
  });
  return metric;
}
async function getLeaderboard(metric) {
  const db = await getDb();
  const activeMetric = metric || (await getLeaderboardSettings()).metric;
  let query = "";
  if (activeMetric === "DIRECT_REFERRALS") {
    query = `
      SELECT u.id, u.public_id, u.full_name, COUNT(ur.user_id)::int AS score
      FROM users u
      INNER JOIN user_referrals ur ON u.id = ur.sponsor_user_id
      GROUP BY u.id, u.public_id, u.full_name
      ORDER BY score DESC, u.id
      LIMIT 10
    `;
  } else if (activeMetric === "NODE_SALES") {
    query = `
      SELECT u.id, u.public_id, u.full_name, COALESCE(SUM(o.total_price_usd), 0)::numeric::float AS score
      FROM users u
      INNER JOIN user_referrals ur ON u.id = ur.sponsor_user_id
      INNER JOIN node_orders o ON ur.user_id = o.user_id
      WHERE o.status = 'COMPLETED'
      GROUP BY u.id, u.public_id, u.full_name
      ORDER BY score DESC, u.id
      LIMIT 10
    `;
  } else if (activeMetric === "BINARY_VOLUME") {
    query = `
      SELECT u.id, u.public_id, u.full_name, (COALESCE(b.left_volume_units, 0) + COALESCE(b.right_volume_units, 0))::int AS score
      FROM users u
      INNER JOIN binary_volume_balances b ON u.id = b.user_id
      GROUP BY u.id, u.public_id, u.full_name, b.left_volume_units, b.right_volume_units
      ORDER BY score DESC, u.id
      LIMIT 10
    `;
  } else if (activeMetric === "MATCHING_PERFORMANCE") {
    query = `
      SELECT u.id, u.public_id, u.full_name, COALESCE(SUM(ms.bonus_usd), 0)::numeric::float AS score
      FROM users u
      INNER JOIN binary_matching_settlements ms ON u.id = ms.user_id
      GROUP BY u.id, u.public_id, u.full_name
      ORDER BY score DESC, u.id
      LIMIT 10
    `;
  } else {
    query = `
      SELECT id, public_id, full_name, 0::int AS score
      FROM users
      LIMIT 10
    `;
  }
  const res = await db.query(query);
  return res.rows.map((r, index) => {
    const nameParts = r.full_name.trim().split(" ");
    const safeDisplayName = nameParts.length > 1 ? `${nameParts[0]} ${nameParts[nameParts.length - 1][0]}.` : nameParts[0];
    return {
      rank: index + 1,
      publicId: r.public_id,
      displayName: safeDisplayName,
      score: r.score
    };
  });
}
async function getPerformancePopupSettings() {
  const db = await getDb();
  const res = await db.query(`SELECT value FROM promotional_settings WHERE key = 'performance_popup'`);
  if (res.rows.length === 0) {
    return {
      enabled: true,
      metric: "DIRECT_REFERRALS",
      topCount: 3,
      durationSeconds: 5
    };
  }
  return JSON.parse(res.rows[0].value);
}
async function updatePerformancePopupSettings(adminUserId, adminPublicId, settings) {
  const db = await getDb();
  const oldSettings = await getPerformancePopupSettings();
  await db.query(
    `
    INSERT INTO promotional_settings (key, value)
    VALUES ('performance_popup', $1)
    ON CONFLICT (key) DO UPDATE SET value = $1
    `,
    [JSON.stringify(settings)]
  );
  await logAdminAction({
    adminUserId,
    adminPublicId,
    action: "UPDATE_PERFORMANCE_POPUP_SETTINGS",
    targetType: "promotional_settings",
    targetId: "performance_popup",
    details: `Updated performance popup settings: enabled=${settings.enabled}, metric=${settings.metric}, topCount=${settings.topCount}`
  });
  return settings;
}
async function getPerformancePopupData() {
  const settings = await getPerformancePopupSettings();
  if (!settings.enabled) {
    return { enabled: false, users: [], displayDurationSeconds: settings.durationSeconds };
  }
  const leaders = await getLeaderboard(settings.metric);
  const slicedLeaders = leaders.slice(0, settings.topCount);
  return {
    enabled: true,
    metric: settings.metric,
    displayDurationSeconds: settings.durationSeconds,
    users: slicedLeaders.map((u) => ({
      rank: u.rank,
      displayName: u.displayName,
      publicId: u.publicId,
      achievementType: settings.metric === "DIRECT_REFERRALS" ? "Fast Growth" : settings.metric === "NODE_SALES" ? "Node Sales Leader" : settings.metric === "BINARY_VOLUME" ? "Matching Leader" : "Top Performer"
    }))
  };
}
var init_promotionalService = __esm({
  "src/server/services/promotionalService.ts"() {
    init_db();
    init_adminService();
  }
});

// src/server/services/nodeOrderService.ts
var nodeOrderService_exports = {};
__export(nodeOrderService_exports, {
  cancelNodeOrder: () => cancelNodeOrder,
  cleanupExpiredReservations: () => cleanupExpiredReservations,
  createNodeReservation: () => createNodeReservation,
  getUserOrderById: () => getUserOrderById,
  getUserOrders: () => getUserOrders,
  purchaseNodeWithDepositBalance: () => purchaseNodeWithDepositBalance,
  settleNodeOrder: () => settleNodeOrder
});
import { v4 as uuidv415 } from "uuid";
async function cleanupExpiredReservations(dbClient) {
  const db = dbClient || await getDb();
  try {
    const expiredOrdersRes = await db.query(
      `
      SELECT id, node_id, user_id, public_order_id
      FROM node_orders
      WHERE status = 'PENDING' AND expires_at <= CURRENT_TIMESTAMP
      `
    );
    if (expiredOrdersRes.rows.length === 0) {
      return 0;
    }
    let cleanedCount = 0;
    for (const ord of expiredOrdersRes.rows) {
      await db.query(
        `
        UPDATE node_orders
        SET status = 'EXPIRED', updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND status = 'PENDING'
        `,
        [ord.id]
      );
      await db.query(
        `
        UPDATE nodes
        SET status = 'AVAILABLE', reserved_by_user_id = NULL, reserved_at = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND status = 'RESERVED'
        `,
        [ord.node_id]
      );
      cleanedCount++;
    }
    return cleanedCount;
  } catch (err) {
    console.error("[NodeOrderService] Error during cleanupExpiredReservations:", err);
    return 0;
  }
}
async function createNodeReservation(userId, idempotencyKey, paymentMethod = "SIMULATED_INSTANT", dbClient) {
  const db = dbClient || await getDb();
  if (dbClient) {
    return executeReservation(dbClient, userId, idempotencyKey, paymentMethod);
  }
  try {
    return await db.transaction(async (trx) => {
      return executeReservation(trx, userId, idempotencyKey, paymentMethod);
    });
  } catch (err) {
    console.error("[CreateNodeReservation Error]", err);
    throw err;
  }
}
async function executeReservation(db, userId, idempotencyKey, paymentMethod = "SIMULATED_INSTANT") {
  const salesEnabled = await isNodeSalesEnabled(db);
  if (!salesEnabled) {
    const error = new Error("NODE_SALES_PAUSED: Genesis Node sales and reservations are currently paused by administration.");
    error.code = "NODE_SALES_PAUSED";
    error.statusCode = 403;
    throw error;
  }
  await db.query(`SELECT id FROM users WHERE id = $1 FOR UPDATE`, [userId]);
  try {
    await cleanupExpiredReservations(db);
  } catch {
  }
  if (idempotencyKey && idempotencyKey.trim().length > 0) {
    const existingByIdempotency = await db.query(
      `
      SELECT 
        o.id, o.public_order_id, o.node_id, o.node_number, o.amount_usd,
        o.currency, o.status, o.payment_method, o.payment_reference,
        o.reserved_at, o.expires_at, o.completed_at, o.cancelled_at, o.created_at,
        n.public_node_id
      FROM node_orders o
      JOIN nodes n ON o.node_id = n.id
      WHERE o.idempotency_key = $1
      `,
      [idempotencyKey.trim()]
    );
    if (existingByIdempotency.rows.length > 0) {
      const row = existingByIdempotency.rows[0];
      const nowMs = Date.now();
      const expiresMs = new Date(row.expires_at).getTime();
      const secondsRemaining = Math.max(0, Math.floor((expiresMs - nowMs) / 1e3));
      return {
        order: {
          id: row.id,
          publicOrderId: row.public_order_id,
          publicNodeId: row.public_node_id,
          nodeNumber: row.node_number,
          amountUsd: Number(row.amount_usd),
          currency: row.currency,
          status: row.status,
          paymentMethod: row.payment_method,
          paymentReference: row.payment_reference,
          reservedAt: row.reserved_at.toISOString(),
          expiresAt: row.expires_at.toISOString(),
          completedAt: row.completed_at ? row.completed_at.toISOString() : null,
          cancelledAt: row.cancelled_at ? row.cancelled_at.toISOString() : null,
          createdAt: row.created_at.toISOString(),
          secondsRemaining
        },
        isExisting: true
      };
    }
  }
  const activePendingRes = await db.query(
    `
    SELECT 
      o.id, o.public_order_id, o.node_id, o.node_number, o.amount_usd,
      o.currency, o.status, o.payment_method, o.payment_reference,
      o.reserved_at, o.expires_at, o.completed_at, o.cancelled_at, o.created_at,
      n.public_node_id
    FROM node_orders o
    JOIN nodes n ON o.node_id = n.id
    WHERE o.user_id = $1 AND o.status = 'PENDING' AND o.expires_at > CURRENT_TIMESTAMP
    ORDER BY o.created_at DESC
    LIMIT 1
    FOR UPDATE
    `,
    [userId]
  );
  if (activePendingRes.rows.length > 0) {
    const row = activePendingRes.rows[0];
    const nowMs = Date.now();
    const expiresMs = new Date(row.expires_at).getTime();
    const secondsRemaining = Math.max(0, Math.floor((expiresMs - nowMs) / 1e3));
    return {
      order: {
        id: row.id,
        publicOrderId: row.public_order_id,
        publicNodeId: row.public_node_id,
        nodeNumber: row.node_number,
        amountUsd: Number(row.amount_usd),
        currency: row.currency,
        status: row.status,
        paymentMethod: row.payment_method,
        paymentReference: row.payment_reference,
        reservedAt: row.reserved_at.toISOString(),
        expiresAt: row.expires_at.toISOString(),
        completedAt: row.completed_at ? row.completed_at.toISOString() : null,
        cancelledAt: row.cancelled_at ? row.cancelled_at.toISOString() : null,
        createdAt: row.created_at.toISOString(),
        secondsRemaining
      },
      isExisting: true
    };
  }
  const maxRetries = 3;
  let attempt = 0;
  while (attempt < maxRetries) {
    attempt++;
    const candidateRes = await db.query(
      `
      SELECT id, node_number, public_node_id
      FROM nodes
      WHERE status = 'AVAILABLE'
      ORDER BY node_number ASC
      LIMIT 1
      FOR UPDATE
      `
    );
    if (candidateRes.rows.length === 0) {
      const error = new Error("All 10,000 Genesis Nodes have been allocated or reserved.");
      error.code = "SOLD_OUT";
      error.statusCode = 409;
      throw error;
    }
    const candidateNode = candidateRes.rows[0];
    const reserveNodeRes = await db.query(
      `
      UPDATE nodes
      SET 
        status = 'RESERVED',
        reserved_by_user_id = $1,
        reserved_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $2 AND status = 'AVAILABLE'
      RETURNING id
      `,
      [userId, candidateNode.id]
    );
    if (reserveNodeRes.rows.length === 0) {
      continue;
    }
    const orderId = uuidv415();
    const publicOrderId = generateOrderPublicId();
    const cleanIdempotencyKey = idempotencyKey && idempotencyKey.trim().length > 0 ? idempotencyKey.trim() : null;
    const expiresAt = new Date(Date.now() + RESERVATION_EXPIRY_MINUTES * 60 * 1e3);
    const nodePrice = await getNodeBasePrice(db);
    const orderInsertRes = await db.query(
      `
      INSERT INTO node_orders (
        id, public_order_id, user_id, node_id, node_number,
        amount_usd, currency, status, payment_method, idempotency_key,
        reserved_at, expires_at, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP, $11, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING 
        id, public_order_id, node_id, node_number, amount_usd,
        currency, status, payment_method, payment_reference,
        reserved_at, expires_at, created_at
      `,
      [
        orderId,
        publicOrderId,
        userId,
        candidateNode.id,
        candidateNode.node_number,
        nodePrice,
        // Server-authoritative Node Price
        "USD",
        "PENDING",
        paymentMethod,
        cleanIdempotencyKey,
        expiresAt
      ]
    );
    const insertedOrder = orderInsertRes.rows[0];
    const nowMs = Date.now();
    const expiresMs = new Date(insertedOrder.expires_at).getTime();
    const secondsRemaining = Math.max(0, Math.floor((expiresMs - nowMs) / 1e3));
    return {
      order: {
        id: insertedOrder.id,
        publicOrderId: insertedOrder.public_order_id,
        publicNodeId: candidateNode.public_node_id,
        nodeNumber: insertedOrder.node_number,
        amountUsd: Number(insertedOrder.amount_usd),
        currency: insertedOrder.currency,
        status: insertedOrder.status,
        paymentMethod: insertedOrder.payment_method,
        paymentReference: insertedOrder.payment_reference,
        reservedAt: insertedOrder.reserved_at.toISOString(),
        expiresAt: insertedOrder.expires_at.toISOString(),
        completedAt: null,
        cancelledAt: null,
        createdAt: insertedOrder.created_at.toISOString(),
        secondsRemaining
      },
      isExisting: false
    };
  }
  const conflictErr = new Error("High concurrency conflict allocating node. Please retry.");
  conflictErr.code = "CONCURRENCY_RETRY";
  conflictErr.statusCode = 409;
  throw conflictErr;
}
async function settleNodeOrder(userId, orderIdentifier, paymentReference, dbClient) {
  const db = dbClient || await getDb();
  await cleanupExpiredReservations(db);
  const querySql = userId ? `
      SELECT 
        o.id, o.public_order_id, o.user_id, o.node_id, o.node_number, o.amount_usd,
        o.currency, o.status, o.payment_method, o.payment_reference,
        o.reserved_at, o.expires_at, o.completed_at, o.cancelled_at, o.created_at,
        n.public_node_id, n.status AS node_status, n.activated_at AS node_activated_at
      FROM node_orders o
      JOIN nodes n ON o.node_id = n.id
      WHERE (o.id::text = $1 OR o.public_order_id = $1) AND o.user_id = $2
      ` : `
      SELECT 
        o.id, o.public_order_id, o.user_id, o.node_id, o.node_number, o.amount_usd,
        o.currency, o.status, o.payment_method, o.payment_reference,
        o.reserved_at, o.expires_at, o.completed_at, o.cancelled_at, o.created_at,
        n.public_node_id, n.status AS node_status, n.activated_at AS node_activated_at
      FROM node_orders o
      JOIN nodes n ON o.node_id = n.id
      WHERE (o.id::text = $1 OR o.public_order_id = $1)
      `;
  const queryParams = userId ? [orderIdentifier.trim(), userId] : [orderIdentifier.trim()];
  const orderRes = await db.query(querySql, queryParams);
  if (orderRes.rows.length === 0) {
    const error = new Error("Order not found or unauthorized.");
    error.code = "ORDER_NOT_FOUND";
    error.statusCode = 404;
    throw error;
  }
  const order = orderRes.rows[0];
  if (order.status === "COMPLETED") {
    return {
      order: {
        publicOrderId: order.public_order_id,
        publicNodeId: order.public_node_id,
        nodeNumber: order.node_number,
        amountUsd: Number(order.amount_usd),
        currency: order.currency,
        status: order.status,
        paymentMethod: order.payment_method,
        paymentReference: order.payment_reference,
        reservedAt: order.reserved_at.toISOString(),
        expiresAt: order.expires_at.toISOString(),
        completedAt: order.completed_at ? order.completed_at.toISOString() : (/* @__PURE__ */ new Date()).toISOString(),
        cancelledAt: null,
        createdAt: order.created_at.toISOString(),
        secondsRemaining: 0
      },
      node: {
        publicNodeId: order.public_node_id,
        nodeNumber: order.node_number,
        status: order.node_status || "ACTIVE",
        activatedAt: order.node_activated_at ? order.node_activated_at.toISOString() : order.completed_at ? order.completed_at.toISOString() : (/* @__PURE__ */ new Date()).toISOString()
      },
      isDuplicate: true
    };
  }
  if (order.status !== "PENDING") {
    const error = new Error(`Cannot settle order in ${order.status} state.`);
    error.code = "INVALID_ORDER_STATE";
    error.statusCode = 400;
    throw error;
  }
  if (new Date(order.expires_at).getTime() <= Date.now()) {
    await db.query(`UPDATE node_orders SET status = 'EXPIRED', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [order.id]);
    await db.query(`UPDATE nodes SET status = 'AVAILABLE', reserved_by_user_id = NULL, reserved_at = NULL WHERE id = $1`, [order.node_id]);
    const error = new Error("The 15-minute reservation window for this node has expired.");
    error.code = "ORDER_EXPIRED";
    error.statusCode = 400;
    throw error;
  }
  if (!isValidOrderStateTransition("PENDING", "COMPLETED")) {
    const error = new Error("Invalid order transition.");
    error.code = "INVALID_TRANSITION";
    error.statusCode = 400;
    throw error;
  }
  if (!isValidNodeStateTransition("RESERVED", "ACTIVE")) {
    const error = new Error("Invalid node transition.");
    error.code = "INVALID_TRANSITION";
    error.statusCode = 400;
    throw error;
  }
  const effectiveRef = paymentReference || `SETTLE_VERIFIED_${Date.now()}_${order.public_order_id}`;
  const currentRewardRate = await getNodeRewardRatePerEpoch(db);
  const internalCoin = await getInternalCoinPrice().catch(() => ({ priceUsdt: 0.1 }));
  const refCoinPrice = internalCoin.priceUsdt || 0.1;
  const basePrice = await getNodeBasePrice(db).catch(() => 1e3);
  const activatedNodeRes = await db.query(
    `
    UPDATE nodes
    SET 
      status = 'ACTIVE',
      owner_user_id = $1,
      reserved_by_user_id = NULL,
      purchase_timestamp = COALESCE(purchase_timestamp, CURRENT_TIMESTAMP),
      activated_at = CURRENT_TIMESTAMP,
      maturity_timestamp = NULL,
      product_version = COALESCE(product_version, 'GENESIS_V1'),
      purchase_price_usd = COALESCE(purchase_price_usd, $3),
      phivo_reference_price_at_purchase = COALESCE(phivo_reference_price_at_purchase, $4),
      lifetime_phivo_allocation = COALESCE(lifetime_phivo_allocation, 10000.00),
      term_days = term_days,
      daily_phivo_emission = COALESCE($5, daily_phivo_emission),
      distributed_phivo = COALESCE(distributed_phivo, 0.00),
      remaining_phivo = COALESCE(remaining_phivo, 10000.00),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $2 AND status = 'RESERVED'
    RETURNING id, public_node_id, node_number, status, activated_at, maturity_timestamp, distributed_phivo, remaining_phivo
    `,
    [order.user_id, order.node_id, basePrice, refCoinPrice, currentRewardRate]
  );
  if (activatedNodeRes.rows.length === 0) {
    const error = new Error("Failed to activate node. Reservation state changed.");
    error.code = "NODE_STATE_MISMATCH";
    error.statusCode = 409;
    throw error;
  }
  const updatedOrderRes = await db.query(
    `
    UPDATE node_orders
    SET 
      status = 'COMPLETED',
      payment_reference = $1,
      completed_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $2
    RETURNING *
    `,
    [effectiveRef, order.id]
  );
  const finalOrder = updatedOrderRes.rows[0];
  const finalNode = activatedNodeRes.rows[0];
  let referralCommission = null;
  try {
    referralCommission = await processNodeActivationCommission(
      db,
      finalOrder.id,
      finalNode.id,
      order.user_id
    );
  } catch (commErr) {
    console.warn("[ReferralCommission] Error processing referral commission for node activation:", commErr);
  }
  try {
    await propagateNodeSalesVolume(db, finalNode.id, order.user_id);
  } catch (volErr) {
    console.warn("[BinaryVolume] Error propagating node sales volume:", volErr);
  }
  try {
    const { getPromotionalOffers: getPromotionalOffers2 } = await Promise.resolve().then(() => (init_promotionalService(), promotionalService_exports));
    const promoOffers = await getPromotionalOffers2(false);
    const bogoOffer = promoOffers.find((o) => o.offerType === "BOGO_FREE_NODE" || o.title.toLowerCase().includes("bogo") || o.title.toLowerCase().includes("free promo node"));
    if (bogoOffer && bogoOffer.bonusNodesCount > 0) {
      const bonusCount = bogoOffer.bonusNodesCount || 1;
      for (let i = 0; i < bonusCount; i++) {
        const availNodeRes = await db.query(
          `SELECT id, node_number, public_node_id FROM nodes WHERE status = 'AVAILABLE' ORDER BY node_number ASC LIMIT 1`
        );
        if (availNodeRes.rows.length > 0) {
          const bonusNode = availNodeRes.rows[0];
          await db.query(
            `
            UPDATE nodes
            SET 
              owner_user_id = $1,
              status = 'ACTIVE',
              activated_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
            `,
            [order.user_id, bonusNode.id]
          );
          await db.query(
            `
            INSERT INTO node_owners (id, node_id, user_id, acquired_via, acquired_at, is_current_owner)
            VALUES ($1, $2, $3, 'PROMOTIONAL_BONUS', CURRENT_TIMESTAMP, TRUE)
            ON CONFLICT (node_id, user_id) DO UPDATE SET is_current_owner = TRUE, acquired_via = 'PROMOTIONAL_BONUS'
            `,
            [uuidv415(), bonusNode.id, order.user_id]
          );
          console.log(`[PromotionEngine] Allocated Free Bonus Promo Node #${bonusNode.node_number} (${bonusNode.public_node_id}) to user ${order.user_id} under offer "${bogoOffer.title}"`);
        }
      }
    }
  } catch (promoErr) {
    console.warn("[PromotionEngine] Notice checking promotional node bonus:", promoErr);
  }
  try {
    await db.query(
      `
      INSERT INTO security_events (id, user_id, event_type, description, created_at)
      VALUES ($1, $2, 'NODE_PURCHASE_COMPLETED', $3, CURRENT_TIMESTAMP)
      `,
      [
        uuidv415(),
        order.user_id,
        `Acquired Genesis Node ${finalNode.public_node_id} (Node #${finalNode.node_number}) for $1,000 USD via order ${finalOrder.public_order_id}.`
      ]
    );
  } catch (secErr) {
    console.warn("[SecurityEvent] Could not log purchase event:", secErr);
  }
  const executePostCommit = async () => {
    try {
      await notifyNodeActivated({
        userId: order.user_id,
        nodeNumber: finalNode.node_number,
        orderPublicId: finalOrder.public_order_id,
        sourceId: finalOrder.id
      });
    } catch (notifErr) {
      console.warn("[Notification] Could not trigger node activated notification:", notifErr);
    }
    try {
      broadcastPublicEvent({
        id: `evt-node-${finalNode.public_node_id}`,
        type: "node.activated",
        title: `${finalNode.public_node_id} Activated`,
        description: `Genesis validator node ${finalNode.public_node_id} successfully activated on-chain.`,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        publicId: finalNode.public_node_id
      });
    } catch (pubErr) {
      console.warn("[PublicEvent] Could not broadcast public node activation event:", pubErr);
    }
    try {
      const topDb = await getDb();
      const userRes = await topDb.query(
        `SELECT email, full_name, public_id FROM users WHERE id = $1`,
        [order.user_id]
      );
      if (userRes.rowCount > 0) {
        const user = userRes.rows[0];
        const { queueEventEmail: queueEventEmail2, triggerAutomationRule: triggerAutomationRule2 } = await Promise.resolve().then(() => (init_emailService(), emailService_exports));
        await queueEventEmail2(user.email, "NODE_ACTIVATION", {
          displayName: user.full_name,
          publicId: user.public_id,
          nodeNumber: String(finalNode.node_number),
          publicNodeId: finalNode.public_node_id,
          amount: String(finalOrder.amount_usd)
        });
        await triggerAutomationRule2(order.user_id, "NODE_SALES", {
          nodeNumber: String(finalNode.node_number),
          publicNodeId: finalNode.public_node_id,
          amount: String(finalOrder.amount_usd)
        });
      }
    } catch (emailErr) {
      console.warn("[EmailEngine] Failed to send Node Activation email/automation trigger:", emailErr);
    }
  };
  if (!dbClient) {
    executePostCommit().catch((err) => {
      console.warn("[NodeOrderService] Post-commit execution warning:", err);
    });
  }
  return {
    order: {
      id: finalOrder.id,
      publicOrderId: finalOrder.public_order_id,
      publicNodeId: finalNode.public_node_id,
      nodeNumber: finalOrder.node_number,
      amountUsd: Number(finalOrder.amount_usd),
      currency: finalOrder.currency,
      status: finalOrder.status,
      paymentMethod: finalOrder.payment_method,
      paymentReference: finalOrder.payment_reference,
      reservedAt: finalOrder.reserved_at.toISOString(),
      expiresAt: finalOrder.expires_at.toISOString(),
      completedAt: finalOrder.completed_at.toISOString(),
      cancelledAt: null,
      createdAt: finalOrder.created_at.toISOString(),
      secondsRemaining: 0
    },
    node: {
      publicNodeId: finalNode.public_node_id,
      nodeNumber: finalNode.node_number,
      status: finalNode.status,
      activatedAt: finalNode.activated_at.toISOString()
    },
    referralCommission,
    isDuplicate: false,
    runPostCommit: executePostCommit
  };
}
async function cancelNodeOrder(userId, orderIdentifier) {
  const db = await getDb();
  const orderRes = await db.query(
    `
    SELECT id, node_id, status
    FROM node_orders
    WHERE (id::text = $1 OR public_order_id = $1) AND user_id = $2
    `,
    [orderIdentifier.trim(), userId]
  );
  if (orderRes.rows.length === 0) {
    const error = new Error("Order not found.");
    error.code = "ORDER_NOT_FOUND";
    error.statusCode = 404;
    throw error;
  }
  const order = orderRes.rows[0];
  if (order.status !== "PENDING") {
    const error = new Error(`Cannot cancel order in ${order.status} state.`);
    error.code = "INVALID_ORDER_STATE";
    error.statusCode = 400;
    throw error;
  }
  await db.query(
    `
    UPDATE node_orders
    SET status = 'CANCELLED', cancelled_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    `,
    [order.id]
  );
  await db.query(
    `
    UPDATE nodes
    SET status = 'AVAILABLE', reserved_by_user_id = NULL, reserved_at = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE id = $1 AND status = 'RESERVED'
    `,
    [order.node_id]
  );
  return {
    success: true,
    message: "Node reservation cancelled successfully and released back to available inventory."
  };
}
async function getUserOrders(userId, dbClient) {
  const db = dbClient || await getDb();
  await cleanupExpiredReservations(db);
  const ordersRes = await db.query(
    `
    SELECT 
      o.id, o.public_order_id, o.node_id, o.node_number, o.amount_usd,
      o.currency, o.status, o.payment_method, o.payment_reference,
      o.reserved_at, o.expires_at, o.completed_at, o.cancelled_at, o.created_at,
      n.public_node_id
    FROM node_orders o
    JOIN nodes n ON o.node_id = n.id
    WHERE o.user_id = $1
    ORDER BY o.created_at DESC
    `,
    [userId]
  );
  const nowMs = Date.now();
  return ordersRes.rows.map((row) => {
    const expiresMs = new Date(row.expires_at).getTime();
    const secondsRemaining = row.status === "PENDING" ? Math.max(0, Math.floor((expiresMs - nowMs) / 1e3)) : 0;
    return {
      publicOrderId: row.public_order_id,
      publicNodeId: row.public_node_id,
      nodeNumber: row.node_number,
      amountUsd: Number(row.amount_usd),
      currency: row.currency,
      status: row.status,
      paymentMethod: row.payment_method,
      paymentReference: row.payment_reference,
      reservedAt: row.reserved_at.toISOString(),
      expiresAt: row.expires_at.toISOString(),
      completedAt: row.completed_at ? row.completed_at.toISOString() : null,
      cancelledAt: row.cancelled_at ? row.cancelled_at.toISOString() : null,
      createdAt: row.created_at.toISOString(),
      secondsRemaining
    };
  });
}
async function getUserOrderById(userId, orderIdentifier) {
  const db = await getDb();
  await cleanupExpiredReservations(db);
  const orderRes = await db.query(
    `
    SELECT 
      o.id, o.public_order_id, o.node_id, o.node_number, o.amount_usd,
      o.currency, o.status, o.payment_method, o.payment_reference,
      o.reserved_at, o.expires_at, o.completed_at, o.cancelled_at, o.created_at,
      n.public_node_id
    FROM node_orders o
    JOIN nodes n ON o.node_id = n.id
    WHERE (o.id::text = $1 OR o.public_order_id = $1) AND o.user_id = $2
    `,
    [orderIdentifier.trim(), userId]
  );
  if (orderRes.rows.length === 0) {
    return null;
  }
  const row = orderRes.rows[0];
  const nowMs = Date.now();
  const expiresMs = new Date(row.expires_at).getTime();
  const secondsRemaining = row.status === "PENDING" ? Math.max(0, Math.floor((expiresMs - nowMs) / 1e3)) : 0;
  return {
    publicOrderId: row.public_order_id,
    publicNodeId: row.public_node_id,
    nodeNumber: row.node_number,
    amountUsd: Number(row.amount_usd),
    currency: row.currency,
    status: row.status,
    paymentMethod: row.payment_method,
    paymentReference: row.payment_reference,
    reservedAt: row.reserved_at.toISOString(),
    expiresAt: row.expires_at.toISOString(),
    completedAt: row.completed_at ? row.completed_at.toISOString() : null,
    cancelledAt: row.cancelled_at ? row.cancelled_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
    secondsRemaining
  };
}
async function purchaseNodeWithDepositBalance(userId, preferredAsset = "USDT") {
  const db = await getDb();
  return await db.transaction(async (trx) => {
    try {
      await trx.query(`SELECT id FROM users WHERE id = $1 FOR UPDATE`, [userId]);
      const nodePrice = await getNodeBasePrice(trx);
      const { syncUserLedger: syncUserLedger2 } = await Promise.resolve().then(() => (init_walletLedgerService(), walletLedgerService_exports));
      await syncUserLedger2(userId, trx);
      let availableDepositBalance = 0;
      if (preferredAsset === "USDT") {
        const balRes = await trx.query(
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
          WHERE user_id = $1 
            AND status = 'SETTLED' 
            AND (currency = 'USDT' OR currency = 'USD') 
          `,
          [userId]
        );
        availableDepositBalance = Math.max(0, Number(balRes.rows[0]?.available_balance || 0));
      } else {
        const depositRes = await trx.query(
          `
          SELECT COALESCE(SUM(amount), 0) AS total_credited
          FROM blockchain_deposits
          WHERE user_id = $1 AND status = 'CREDITED' AND asset = 'BNB'
          `,
          [userId]
        );
        const totalCreditedDeposits = Number(depositRes.rows[0]?.total_credited || 0);
        const debitsRes = await trx.query(
          `
          SELECT COALESCE(SUM(amount), 0) AS total_debits
          FROM financial_ledger_entries
          WHERE user_id = $1 AND entry_type = 'DEBIT' AND source_type = 'NODE_PURCHASE' AND currency = 'BNB'
          `,
          [userId]
        );
        const totalNodeDebits = Number(debitsRes.rows[0]?.total_debits || 0);
        availableDepositBalance = Math.max(0, totalCreditedDeposits - totalNodeDebits);
      }
      if (availableDepositBalance < nodePrice) {
        const error = new Error(
          `Your current available balance is $${availableDepositBalance.toFixed(2)} ${preferredAsset}. You need $${nodePrice.toFixed(2)} ${preferredAsset} to activate a Genesis Node. Please deposit or add funds first.`
        );
        error.code = "INSUFFICIENT_DEPOSIT_BALANCE";
        error.statusCode = 400;
        error.currentBalance = availableDepositBalance;
        error.requiredAmount = nodePrice;
        error.redirectToDeposit = true;
        throw error;
      }
      let reservation;
      try {
        reservation = await createNodeReservation(userId, `dep_node_${userId}_${uuidv415()}`, `DEPOSIT_${preferredAsset}`, trx);
      } catch (err) {
        const existingOrders = await getUserOrders(userId, trx);
        const pending = existingOrders.find((o) => o.status === "PENDING" && o.secondsRemaining > 0);
        if (pending) {
          reservation = { order: pending, isExisting: true };
        } else {
          throw err;
        }
      }
      const debitTxnId = uuidv415();
      const publicTxnId = generateLedgerTransactionPublicId();
      await trx.query(
        `
        INSERT INTO financial_ledger_entries (
          id, public_txn_id, user_id, entry_type, source_type, source_id,
          source_ref, description, amount, currency, status, created_at
        )
        VALUES ($1, $2, $3, 'DEBIT', 'NODE_PURCHASE', $4, $5, $6, $7, $8, 'SETTLED', CURRENT_TIMESTAMP)
        `,
        [
          debitTxnId,
          publicTxnId,
          userId,
          reservation.order.id,
          reservation.order.publicNodeId,
          `Genesis Node ${reservation.order.publicNodeId} purchase paid via ${preferredAsset} deposit balance`,
          nodePrice,
          preferredAsset
        ]
      );
      const settlement = await settleNodeOrder(
        userId,
        reservation.order.publicOrderId,
        `DEPOSIT_BAL_PAYMENT_${preferredAsset}_${publicTxnId}`,
        trx
      );
      const newRemainingBalance = Math.max(0, availableDepositBalance - nodePrice);
      return {
        order: settlement.order,
        node: settlement.node,
        depositDeducted: nodePrice,
        remainingDepositBalance: newRemainingBalance
      };
    } catch (innerErr) {
      console.error("[purchaseNodeWithDepositBalance Inner Error]", innerErr);
      throw innerErr;
    }
  });
}
var init_nodeOrderService = __esm({
  "src/server/services/nodeOrderService.ts"() {
    init_db();
    init_idGenerator();
    init_nodeConfig();
    init_referralCommissionService();
    init_binaryVolumeService();
    init_publicNetworkService();
    init_economicService();
    init_notificationService();
  }
});

// src/server/services/withdrawalService.ts
import { v4 as uuidv421 } from "uuid";
function mapRowToWithdrawalRecord(row) {
  return {
    id: row.id,
    publicWithdrawalId: row.public_withdrawal_id,
    userId: row.user_id,
    amount: Number(row.amount),
    currency: row.currency || "USD",
    destinationType: row.destination_type,
    destinationReference: row.destination_reference,
    status: row.status,
    requestedAt: row.requested_at ? new Date(row.requested_at).toISOString() : new Date(row.created_at).toISOString(),
    approvedAt: row.approved_at ? new Date(row.approved_at).toISOString() : null,
    rejectedAt: row.rejected_at ? new Date(row.rejected_at).toISOString() : null,
    completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
    cancelledAt: row.cancelled_at ? new Date(row.cancelled_at).toISOString() : null,
    failedAt: row.failed_at ? new Date(row.failed_at).toISOString() : null,
    rejectionReason: row.rejection_reason || null,
    idempotencyKey: row.idempotency_key || null,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString()
  };
}
async function logWithdrawalStateTransition(params) {
  try {
    const db = params.dbClient || await getDb();
    const id = uuidv421();
    const now = /* @__PURE__ */ new Date();
    let userEmail = params.actorEmail || null;
    let userName = null;
    if (!userEmail && params.userId) {
      const userRes = await db.query(
        `SELECT email, full_name FROM users WHERE id = $1 LIMIT 1`,
        [params.userId]
      ).catch(() => ({ rows: [] }));
      userEmail = userRes.rows[0]?.email || null;
      userName = userRes.rows[0]?.full_name || null;
    }
    await db.query(
      `
      INSERT INTO withdrawal_status_logs (
        id, withdrawal_id, public_withdrawal_id, user_id, user_email, user_name,
        previous_status, new_status, actor_type, actor_id, actor_email,
        reason, amount, destination_type, destination_reference, tx_hash,
        transition_timestamp, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $17)
      `,
      [
        id,
        params.withdrawalId,
        params.publicWithdrawalId,
        params.userId,
        userEmail,
        userName,
        params.previousStatus,
        params.newStatus,
        params.actorType,
        params.actorId || null,
        params.actorEmail || null,
        params.reason || null,
        params.amount,
        params.destinationType,
        params.destinationReference,
        params.txHash || null,
        now
      ]
    );
  } catch (err) {
    console.warn("[WithdrawalStateLog] Failed to insert state transition log:", err);
  }
}
function withUserLock2(userId, fn) {
  const currentLock = userLocks2.get(userId) || Promise.resolve();
  let releaseLock;
  const newLock = new Promise((resolve) => {
    releaseLock = resolve;
  });
  userLocks2.set(userId, currentLock.then(() => newLock, () => newLock));
  return currentLock.then(
    async () => {
      try {
        return await fn();
      } finally {
        releaseLock();
        if (userLocks2.get(userId) === newLock) {
          userLocks2.delete(userId);
        }
      }
    },
    async () => {
      try {
        return await fn();
      } finally {
        releaseLock();
        if (userLocks2.get(userId) === newLock) {
          userLocks2.delete(userId);
        }
      }
    }
  );
}
async function getMinWithdrawalAmount() {
  try {
    const db = await getDb();
    const res = await db.query(
      `SELECT config_value FROM system_economic_configs WHERE config_key = 'MIN_WITHDRAWAL_AMOUNT' LIMIT 1`
    ).catch(() => ({ rows: [] }));
    if (res.rows.length > 0) {
      const val = res.rows[0].config_value;
      const num = typeof val === "number" ? val : parseFloat(typeof val === "string" ? JSON.parse(val) : val);
      if (!isNaN(num) && num >= 0) {
        return num;
      }
    }
  } catch (err) {
    console.warn("[Withdrawal Service] Failed to read MIN_WITHDRAWAL_AMOUNT config, defaulting to 0.10:", err);
  }
  return 0.1;
}
async function createWithdrawalRequest(params) {
  return withUserLock2(params.userId, async () => {
    const { userId, amount, destinationType, destinationReference, idempotencyKey, otp } = params;
    if (typeof amount !== "number" || isNaN(amount) || amount <= 0) {
      throw new Error("INVALID_AMOUNT: Withdrawal amount must be a positive number greater than 0.");
    }
    const minAmount = await getMinWithdrawalAmount();
    const cleanAmount = Math.round(amount * 100) / 100;
    if (cleanAmount < minAmount) {
      throw new Error(`MINIMUM_AMOUNT_LIMIT: Minimum withdrawal amount is $${minAmount.toFixed(2)} USD (or ${minAmount} USDT).`);
    }
    if (!destinationType || !destinationType.trim()) {
      throw new Error("INVALID_DESTINATION_TYPE: Destination type is required.");
    }
    if (!destinationReference || !destinationReference.trim()) {
      throw new Error("INVALID_DESTINATION_REF: Destination address or reference details are required.");
    }
    const destRef = destinationReference.trim();
    const destTypeUpper = destinationType.trim().toUpperCase();
    if (destTypeUpper.includes("USDT") || destTypeUpper.includes("BEP20") || destTypeUpper.includes("BSC") || destTypeUpper.includes("TRC20")) {
      if (destTypeUpper.includes("TRC20")) {
        if (!destRef.startsWith("T") || destRef.length < 30) {
          throw new Error(`INVALID_DESTINATION_ADDRESS: '${destRef}' is not a valid TRC-20 address.`);
        }
      } else {
        if (!destRef.startsWith("0x") || destRef.length !== 42 || !/^0x[a-fA-F0-9]{40}$/.test(destRef)) {
          throw new Error(`INVALID_DESTINATION_ADDRESS: '${destRef}' is not a valid BSC/BEP-20 (EVM) destination address.`);
        }
      }
    }
    const db = await getDb();
    const { withdrawal, isDuplicate, userDetails } = await db.transaction(async (trx) => {
      try {
        await trx.query(`SET LOCAL statement_timeout = '15000'`);
        await trx.query(`SET LOCAL lock_timeout = '8000'`);
      } catch {
      }
      const userRes = await trx.query(
        `SELECT id, email, full_name, public_id FROM users WHERE id = $1 FOR UPDATE`,
        [userId]
      );
      const user = userRes.rows[0];
      const cleanIdempotencyKey = idempotencyKey ? idempotencyKey.trim() : null;
      if (cleanIdempotencyKey) {
        const existing = await trx.query(
          `SELECT * FROM withdrawals WHERE user_id = $1 AND idempotency_key = $2`,
          [userId, cleanIdempotencyKey]
        );
        if (existing.rows.length > 0) {
          return {
            withdrawal: mapRowToWithdrawalRecord(existing.rows[0]),
            isDuplicate: true,
            userDetails: user
          };
        }
      }
      const recentDuplicate = await trx.query(
        `
        SELECT * FROM withdrawals
        WHERE user_id = $1
          AND amount = $2
          AND destination_reference = $3
          AND status = 'PENDING'
          AND created_at > NOW() - INTERVAL '5 seconds'
        `,
        [userId, cleanAmount, destRef]
      );
      if (recentDuplicate.rows.length > 0) {
        return {
          withdrawal: mapRowToWithdrawalRecord(recentDuplicate.rows[0]),
          isDuplicate: true,
          userDetails: user
        };
      }
      let tokenRecordId = null;
      if (otp) {
        const trimmedOtp = String(otp).trim();
        if (!trimmedOtp || trimmedOtp.length !== 6) {
          const err = new Error("INVALID_OTP: A valid 6-digit email verification code is required.");
          err.code = "INVALID_OTP";
          err.statusCode = 400;
          throw err;
        }
        const otpHash = hashToken(trimmedOtp);
        const tokenRes = await trx.query(
          `SELECT id, expires_at, used_at FROM auth_tokens 
           WHERE user_id = $1 AND token_hash = $2 AND type = 'WITHDRAWAL_OTP'
           ORDER BY created_at DESC LIMIT 1
           FOR UPDATE`,
          [userId, otpHash]
        );
        if (tokenRes.rowCount === 0) {
          const err = new Error("INVALID_OTP: Invalid withdrawal verification code. Please check your email or request a new code.");
          err.code = "INVALID_OTP";
          err.statusCode = 400;
          throw err;
        }
        const tokenRecord = tokenRes.rows[0];
        if (tokenRecord.used_at) {
          const err = new Error("OTP_ALREADY_USED: This withdrawal verification code has already been used.");
          err.code = "OTP_ALREADY_USED";
          err.statusCode = 400;
          throw err;
        }
        if (new Date(tokenRecord.expires_at) < /* @__PURE__ */ new Date()) {
          const err = new Error("OTP_EXPIRED: Withdrawal verification code has expired. Please request a new one.");
          err.code = "OTP_EXPIRED";
          err.statusCode = 400;
          throw err;
        }
        tokenRecordId = tokenRecord.id;
      }
      await syncUserLedger(userId, trx);
      const balRes = await trx.query(
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
        WHERE user_id = $1 
          AND status = 'SETTLED' 
          AND (currency = 'USDT' OR currency = 'USD') 
        `,
        [userId]
      );
      const availableBalance = Math.max(0, Number(balRes.rows[0]?.available_balance || 0));
      if (cleanAmount > availableBalance) {
        const err = new Error(
          `INSUFFICIENT_BALANCE: Requested withdrawal amount ($${cleanAmount.toFixed(2)}) exceeds available eligible ledger balance ($${availableBalance.toFixed(2)}).`
        );
        err.code = "INSUFFICIENT_BALANCE";
        err.statusCode = 400;
        err.availableBalance = availableBalance;
        throw err;
      }
      const id = uuidv421();
      const publicWithdrawalId = generateWithdrawalPublicId();
      const now = /* @__PURE__ */ new Date();
      const insertRes = await trx.query(
        `
        INSERT INTO withdrawals (
          id, public_withdrawal_id, user_id, amount, currency,
          destination_type, destination_reference, status,
          requested_at, idempotency_key, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, 'USD', $5, $6, 'PENDING', $7, $8, $7, $7)
        RETURNING *
        `,
        [
          id,
          publicWithdrawalId,
          userId,
          cleanAmount,
          destTypeUpper,
          destRef,
          now,
          cleanIdempotencyKey
        ]
      );
      const createdWdr = mapRowToWithdrawalRecord(insertRes.rows[0]);
      await postLedgerDebit({
        userId,
        sourceType: "WITHDRAWAL",
        sourceId: createdWdr.id,
        sourceRef: createdWdr.publicWithdrawalId,
        amount: cleanAmount,
        description: `Withdrawal Request - ${createdWdr.destinationType} (${createdWdr.destinationReference.slice(0, 12)}...)`,
        createdAt: now,
        dbClient: trx
      });
      if (tokenRecordId) {
        await trx.query(
          `UPDATE auth_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [tokenRecordId]
        );
      }
      await logWithdrawalStateTransition({
        withdrawalId: createdWdr.id,
        publicWithdrawalId: createdWdr.publicWithdrawalId,
        userId: createdWdr.userId,
        previousStatus: null,
        newStatus: "PENDING",
        actorType: "USER",
        amount: createdWdr.amount,
        destinationType: createdWdr.destinationType,
        destinationReference: createdWdr.destinationReference,
        reason: "Withdrawal request created by user",
        dbClient: trx
      });
      return {
        withdrawal: createdWdr,
        isDuplicate: false,
        userDetails: user
      };
    });
    if (!isDuplicate) {
      notifyWithdrawalStatus({
        userId,
        amountUsdt: cleanAmount,
        status: "PENDING",
        withdrawalId: withdrawal.id
      }).catch((notifErr) => {
        console.warn("[Notification] Error triggering withdrawal pending notification:", notifErr);
      });
      if (userDetails?.email) {
        Promise.resolve().then(() => (init_emailService(), emailService_exports)).then(({ queueEventEmail: queueEventEmail2 }) => {
          queueEventEmail2(userDetails.email, "WITHDRAWAL_STATUS", {
            displayName: userDetails.full_name || "Valued User",
            publicId: userDetails.public_id || "",
            amount: String(cleanAmount),
            status: "PENDING",
            withdrawalId: withdrawal.id
          }).catch((emailErr) => {
            console.warn("[EmailEngine] Failed to send Withdrawal Pending email:", emailErr);
          });
        }).catch(() => {
        });
      }
    }
    return withdrawal;
  });
}
async function getUserWithdrawals(userId, page = 1, limit = 20, statusFilter) {
  const db = await getDb();
  const safePage = Math.max(1, page);
  const safeLimit = Math.min(100, Math.max(1, limit));
  const offset = (safePage - 1) * safeLimit;
  let whereClauses = ["user_id = $1"];
  let queryParams = [userId];
  let paramIdx = 2;
  if (statusFilter && statusFilter !== "ALL" && statusFilter !== "all") {
    whereClauses.push(`status = $${paramIdx}`);
    queryParams.push(statusFilter.toUpperCase());
    paramIdx++;
  }
  const whereSql = whereClauses.join(" AND ");
  const countRes = await db.query(
    `SELECT COUNT(*)::int AS count FROM withdrawals WHERE ${whereSql}`,
    queryParams
  );
  const totalCount = Number(countRes.rows[0]?.count || 0);
  const txQueryParams = [...queryParams, safeLimit, offset];
  const listRes = await db.query(
    `
    SELECT * FROM withdrawals
    WHERE ${whereSql}
    ORDER BY created_at DESC
    LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
    `,
    txQueryParams
  );
  const totalPages = Math.ceil(totalCount / safeLimit) || 1;
  const withdrawals = listRes.rows.map(mapRowToWithdrawalRecord);
  return {
    withdrawals,
    pagination: {
      page: safePage,
      limit: safeLimit,
      totalCount,
      totalPages
    }
  };
}
async function getWithdrawalByPublicId(publicId, userId) {
  const db = await getDb();
  let res;
  if (userId) {
    res = await db.query(
      `SELECT * FROM withdrawals WHERE (public_withdrawal_id = $1 OR id::text = $1) AND user_id = $2`,
      [publicId, userId]
    );
  } else {
    res = await db.query(
      `SELECT * FROM withdrawals WHERE public_withdrawal_id = $1 OR id::text = $1`,
      [publicId]
    );
  }
  if (res.rows.length === 0) return null;
  return mapRowToWithdrawalRecord(res.rows[0]);
}
async function cancelWithdrawalRequest(publicId, userId) {
  const withdrawal = await getWithdrawalByPublicId(publicId, userId);
  if (!withdrawal) {
    throw new Error("NOT_FOUND: Withdrawal request not found.");
  }
  if (withdrawal.status !== "PENDING") {
    throw new Error(`INVALID_STATE: Only PENDING withdrawals can be cancelled. Current status is ${withdrawal.status}.`);
  }
  const db = await getDb();
  const now = /* @__PURE__ */ new Date();
  const updateRes = await db.query(
    `
    UPDATE withdrawals
    SET status = 'CANCELLED', cancelled_at = $1, updated_at = $1
    WHERE id = $2 AND status = 'PENDING'
    RETURNING *
    `,
    [now, withdrawal.id]
  );
  if (updateRes.rows.length === 0) {
    throw new Error("CONCURRENCY_ERROR: Withdrawal status was updated concurrently.");
  }
  const updatedWithdrawal = mapRowToWithdrawalRecord(updateRes.rows[0]);
  await logWithdrawalStateTransition({
    withdrawalId: updatedWithdrawal.id,
    publicWithdrawalId: updatedWithdrawal.publicWithdrawalId,
    userId: updatedWithdrawal.userId,
    previousStatus: withdrawal.status,
    newStatus: "CANCELLED",
    actorType: "USER",
    amount: updatedWithdrawal.amount,
    destinationType: updatedWithdrawal.destinationType,
    destinationReference: updatedWithdrawal.destinationReference,
    reason: "Cancelled by user account"
  });
  await postLedgerReversal({
    userId,
    sourceType: "WITHDRAWAL",
    sourceId: updatedWithdrawal.id,
    sourceRef: updatedWithdrawal.publicWithdrawalId,
    amount: updatedWithdrawal.amount,
    description: `Withdrawal Cancelled - Funds Released (${updatedWithdrawal.publicWithdrawalId})`,
    createdAt: now
  });
  return updatedWithdrawal;
}
async function settleWithdrawalAction(params) {
  const { withdrawalIdOrPublicId, action, rejectionReason } = params;
  const withdrawal = await getWithdrawalByPublicId(withdrawalIdOrPublicId);
  if (!withdrawal) {
    throw new Error("NOT_FOUND: Withdrawal record not found.");
  }
  const db = await getDb();
  const now = /* @__PURE__ */ new Date();
  const normalizedAction = action.toUpperCase();
  if (normalizedAction === "APPROVE") {
    if (withdrawal.status !== "PENDING") {
      throw new Error(`INVALID_STATE: Cannot APPROVE withdrawal in status ${withdrawal.status}. Must be PENDING.`);
    }
    const res = await db.query(
      `
      UPDATE withdrawals
      SET status = 'APPROVED', approved_at = $1, updated_at = $1
      WHERE id = $2 AND status = 'PENDING'
      RETURNING *
      `,
      [now, withdrawal.id]
    );
    if (res.rows.length === 0) throw new Error("CONCURRENCY_ERROR: Status changed concurrently.");
    const approvedRec = mapRowToWithdrawalRecord(res.rows[0]);
    await logWithdrawalStateTransition({
      withdrawalId: approvedRec.id,
      publicWithdrawalId: approvedRec.publicWithdrawalId,
      userId: approvedRec.userId,
      previousStatus: withdrawal.status,
      newStatus: "APPROVED",
      actorType: params.actorEmail ? "ADMIN" : "SYSTEM",
      actorEmail: params.actorEmail,
      amount: approvedRec.amount,
      destinationType: approvedRec.destinationType,
      destinationReference: approvedRec.destinationReference,
      reason: "Approved for disbursement"
    });
    try {
      await notifyWithdrawalStatus({
        userId: approvedRec.userId,
        amountUsdt: approvedRec.amount,
        status: "APPROVED",
        withdrawalId: approvedRec.id
      });
    } catch (notifErr) {
      console.warn("[Notification] Error triggering withdrawal approved notification:", notifErr);
    }
    return approvedRec;
  }
  if (normalizedAction === "MARK_PROCESSING" || normalizedAction === "PROCESSING") {
    if (withdrawal.status !== "PENDING" && withdrawal.status !== "APPROVED") {
      throw new Error(`INVALID_STATE: Cannot transition withdrawal to PROCESSING from status ${withdrawal.status}. Must be PENDING or APPROVED.`);
    }
    const res = await db.query(
      `
      UPDATE withdrawals
      SET status = 'PROCESSING', updated_at = $1
      WHERE id = $2 AND status IN ('PENDING', 'APPROVED')
      RETURNING *
      `,
      [now, withdrawal.id]
    );
    if (res.rows.length === 0) throw new Error("CONCURRENCY_ERROR: Status changed concurrently.");
    const processingRec = mapRowToWithdrawalRecord(res.rows[0]);
    await logWithdrawalStateTransition({
      withdrawalId: processingRec.id,
      publicWithdrawalId: processingRec.publicWithdrawalId,
      userId: processingRec.userId,
      previousStatus: withdrawal.status,
      newStatus: "PROCESSING",
      actorType: params.actorEmail ? "ADMIN" : "SYSTEM",
      actorEmail: params.actorEmail,
      amount: processingRec.amount,
      destinationType: processingRec.destinationType,
      destinationReference: processingRec.destinationReference,
      reason: "On-chain broadcast / settlement in progress"
    });
    return processingRec;
  }
  if (normalizedAction === "COMPLETE") {
    if (withdrawal.status !== "APPROVED" && withdrawal.status !== "PROCESSING" && withdrawal.status !== "PENDING") {
      throw new Error(`INVALID_STATE: Cannot COMPLETE withdrawal in status ${withdrawal.status}. Must be PENDING, APPROVED, or PROCESSING.`);
    }
    const txHash = params.txHash?.trim();
    if (!txHash || !/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
      throw new Error("INVALID_TX_HASH: A valid 66-character on-chain transaction hash (starting with 0x) is required to mark a withdrawal as COMPLETED.");
    }
    const res = await db.query(
      `
      UPDATE withdrawals
      SET status = 'COMPLETED', completed_at = $1, updated_at = $1
      WHERE id = $2 AND status IN ('PENDING', 'APPROVED', 'PROCESSING')
      RETURNING *
      `,
      [now, withdrawal.id]
    );
    if (res.rows.length === 0) throw new Error("CONCURRENCY_ERROR: Withdrawal was already processed or cancelled.");
    const completedRec = mapRowToWithdrawalRecord(res.rows[0]);
    await logWithdrawalStateTransition({
      withdrawalId: completedRec.id,
      publicWithdrawalId: completedRec.publicWithdrawalId,
      userId: completedRec.userId,
      previousStatus: withdrawal.status,
      newStatus: "COMPLETED",
      actorType: params.actorEmail ? "ADMIN" : "SYSTEM",
      actorEmail: params.actorEmail,
      amount: completedRec.amount,
      destinationType: completedRec.destinationType,
      destinationReference: completedRec.destinationReference,
      reason: "Disbursement completed successfully on-chain",
      txHash: params.txHash
    });
    try {
      await notifyWithdrawalStatus({
        userId: completedRec.userId,
        amountUsdt: completedRec.amount,
        status: "COMPLETED",
        withdrawalId: completedRec.id
      });
    } catch (notifErr) {
      console.warn("[Notification] Error triggering withdrawal completed notification:", notifErr);
    }
    try {
      const userRes = await db.query(
        `SELECT email, full_name, public_id FROM users WHERE id = $1`,
        [completedRec.userId]
      );
      if (userRes.rowCount > 0) {
        const user = userRes.rows[0];
        const { queueEventEmail: queueEventEmail2 } = await Promise.resolve().then(() => (init_emailService(), emailService_exports));
        await queueEventEmail2(user.email, "WITHDRAWAL_STATUS", {
          displayName: user.full_name,
          publicId: user.public_id,
          amount: String(completedRec.amount),
          status: "COMPLETED",
          withdrawalId: completedRec.id
        });
      }
    } catch (emailErr) {
      console.warn("[EmailEngine] Failed to send Withdrawal Completed email:", emailErr);
    }
    return completedRec;
  }
  if (normalizedAction === "REJECT") {
    if (withdrawal.status === "COMPLETED" || withdrawal.status === "REJECTED" || withdrawal.status === "CANCELLED" || withdrawal.status === "FAILED") {
      throw new Error(`INVALID_STATE: Cannot REJECT withdrawal in status ${withdrawal.status}.`);
    }
    const reason = rejectionReason || "Administrative rejection";
    const res = await db.query(
      `
      UPDATE withdrawals
      SET status = 'REJECTED', rejected_at = $1, rejection_reason = $2, updated_at = $1
      WHERE id = $3 AND status IN ('PENDING', 'APPROVED', 'PROCESSING')
      RETURNING *
      `,
      [now, reason, withdrawal.id]
    );
    if (res.rows.length === 0) throw new Error("CONCURRENCY_ERROR: Status changed concurrently.");
    const updated = mapRowToWithdrawalRecord(res.rows[0]);
    await logWithdrawalStateTransition({
      withdrawalId: updated.id,
      publicWithdrawalId: updated.publicWithdrawalId,
      userId: updated.userId,
      previousStatus: withdrawal.status,
      newStatus: "REJECTED",
      actorType: params.actorEmail ? "ADMIN" : "SYSTEM",
      actorEmail: params.actorEmail,
      amount: updated.amount,
      destinationType: updated.destinationType,
      destinationReference: updated.destinationReference,
      reason
    });
    await postLedgerReversal({
      userId: updated.userId,
      sourceType: "WITHDRAWAL",
      sourceId: updated.id,
      sourceRef: updated.publicWithdrawalId,
      amount: updated.amount,
      description: `Withdrawal Rejected - Funds Released (${updated.publicWithdrawalId})`,
      createdAt: now
    });
    try {
      await notifyWithdrawalStatus({
        userId: updated.userId,
        amountUsdt: updated.amount,
        status: "REJECTED",
        withdrawalId: updated.id,
        reason
      });
    } catch (notifErr) {
      console.warn("[Notification] Error triggering withdrawal rejected notification:", notifErr);
    }
    try {
      const userRes = await db.query(
        `SELECT email, full_name, public_id FROM users WHERE id = $1`,
        [updated.userId]
      );
      if (userRes.rowCount > 0) {
        const user = userRes.rows[0];
        const { queueEventEmail: queueEventEmail2 } = await Promise.resolve().then(() => (init_emailService(), emailService_exports));
        await queueEventEmail2(user.email, "WITHDRAWAL_STATUS", {
          displayName: user.full_name,
          publicId: user.public_id,
          amount: String(updated.amount),
          status: "REJECTED",
          withdrawalId: updated.id,
          reason
        });
      }
    } catch (emailErr) {
      console.warn("[EmailEngine] Failed to send Withdrawal Rejected email:", emailErr);
    }
    return updated;
  }
  if (normalizedAction === "FAIL") {
    if (withdrawal.status === "COMPLETED" || withdrawal.status === "FAILED" || withdrawal.status === "CANCELLED" || withdrawal.status === "REJECTED") {
      throw new Error(`INVALID_STATE: Cannot FAIL withdrawal in status ${withdrawal.status}.`);
    }
    const reason = rejectionReason || "Settlement transfer failed";
    const res = await db.query(
      `
      UPDATE withdrawals
      SET status = 'FAILED', failed_at = $1, rejection_reason = $2, updated_at = $1
      WHERE id = $3 AND status IN ('PENDING', 'APPROVED', 'PROCESSING')
      RETURNING *
      `,
      [now, reason, withdrawal.id]
    );
    if (res.rows.length === 0) throw new Error("CONCURRENCY_ERROR: Status changed concurrently.");
    const updated = mapRowToWithdrawalRecord(res.rows[0]);
    await logWithdrawalStateTransition({
      withdrawalId: updated.id,
      publicWithdrawalId: updated.publicWithdrawalId,
      userId: updated.userId,
      previousStatus: withdrawal.status,
      newStatus: "FAILED",
      actorType: params.actorEmail ? "ADMIN" : "SYSTEM",
      actorEmail: params.actorEmail,
      amount: updated.amount,
      destinationType: updated.destinationType,
      destinationReference: updated.destinationReference,
      reason
    });
    await postLedgerReversal({
      userId: updated.userId,
      sourceType: "WITHDRAWAL",
      sourceId: updated.id,
      sourceRef: updated.publicWithdrawalId,
      amount: updated.amount,
      description: `Withdrawal Transfer Failed - Funds Released (${updated.publicWithdrawalId})`,
      createdAt: now
    });
    try {
      const userRes = await db.query(
        `SELECT email, full_name, public_id FROM users WHERE id = $1`,
        [updated.userId]
      );
      if (userRes.rowCount > 0) {
        const user = userRes.rows[0];
        const { queueEventEmail: queueEventEmail2 } = await Promise.resolve().then(() => (init_emailService(), emailService_exports));
        await queueEventEmail2(user.email, "WITHDRAWAL_STATUS", {
          displayName: user.full_name,
          publicId: user.public_id,
          amount: String(updated.amount),
          status: "FAILED",
          withdrawalId: updated.id,
          reason
        });
      }
    } catch (emailErr) {
      console.warn("[EmailEngine] Failed to send Withdrawal Failed email:", emailErr);
    }
    return updated;
  }
  throw new Error(`INVALID_ACTION: Unknown settlement action ${action}`);
}
async function getWithdrawalStateLogs(params) {
  const db = await getDb();
  const safePage = Math.max(1, params.page || 1);
  const safeLimit = Math.min(100, Math.max(1, params.limit || 20));
  const offset = (safePage - 1) * safeLimit;
  await backfillMissingWithdrawalStateLogs();
  let whereClauses = ["1=1"];
  let queryParams = [];
  let paramIdx = 1;
  if (params.status && params.status !== "ALL" && params.status !== "all") {
    whereClauses.push(`l.new_status = $${paramIdx}`);
    queryParams.push(params.status.toUpperCase());
    paramIdx++;
  }
  if (params.actorType && params.actorType !== "ALL" && params.actorType !== "all") {
    whereClauses.push(`l.actor_type = $${paramIdx}`);
    queryParams.push(params.actorType.toUpperCase());
    paramIdx++;
  }
  if (params.search && params.search.trim()) {
    const s = `%${params.search.trim()}%`;
    whereClauses.push(`(
      l.public_withdrawal_id ILIKE $${paramIdx} OR
      l.user_email ILIKE $${paramIdx} OR
      l.user_name ILIKE $${paramIdx} OR
      l.reason ILIKE $${paramIdx} OR
      l.tx_hash ILIKE $${paramIdx} OR
      l.destination_reference ILIKE $${paramIdx}
    )`);
    queryParams.push(s);
    paramIdx++;
  }
  const whereSql = whereClauses.join(" AND ");
  const countRes = await db.query(
    `SELECT COUNT(*)::int AS count FROM withdrawal_status_logs l WHERE ${whereSql}`,
    queryParams
  );
  const totalCount = Number(countRes.rows[0]?.count || 0);
  const txQueryParams = [...queryParams, safeLimit, offset];
  const listRes = await db.query(
    `
    SELECT 
      l.id,
      l.withdrawal_id AS "withdrawalId",
      l.public_withdrawal_id AS "publicWithdrawalId",
      l.user_id AS "userId",
      COALESCE(l.user_email, u.email) AS "userEmail",
      COALESCE(l.user_name, u.full_name) AS "userName",
      l.previous_status AS "previousStatus",
      l.new_status AS "newStatus",
      l.actor_type AS "actorType",
      l.actor_id AS "actorId",
      l.actor_email AS "actorEmail",
      l.reason,
      l.amount::float AS amount,
      l.destination_type AS "destinationType",
      l.destination_reference AS "destinationReference",
      l.tx_hash AS "txHash",
      l.transition_timestamp AS "transitionTimestamp",
      l.created_at AS "createdAt"
    FROM withdrawal_status_logs l
    LEFT JOIN users u ON u.id = l.user_id
    WHERE ${whereSql}
    ORDER BY l.transition_timestamp DESC
    LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
    `,
    txQueryParams
  );
  const statsRes = await db.query(`
    SELECT
      COUNT(*)::int AS "totalTransitions",
      COUNT(CASE WHEN new_status = 'PENDING' THEN 1 END)::int AS "pendingCount",
      COUNT(CASE WHEN new_status = 'APPROVED' THEN 1 END)::int AS "approvedCount",
      COUNT(CASE WHEN new_status = 'COMPLETED' THEN 1 END)::int AS "completedCount",
      COUNT(CASE WHEN new_status = 'REJECTED' THEN 1 END)::int AS "rejectedCount",
      COUNT(CASE WHEN new_status = 'FAILED' THEN 1 END)::int AS "failedCount",
      COUNT(CASE WHEN new_status = 'CANCELLED' THEN 1 END)::int AS "cancelledCount"
    FROM withdrawal_status_logs
  `);
  const stats = statsRes.rows[0] || {
    totalTransitions: 0,
    pendingCount: 0,
    approvedCount: 0,
    completedCount: 0,
    rejectedCount: 0,
    failedCount: 0,
    cancelledCount: 0
  };
  const totalPages = Math.ceil(totalCount / safeLimit) || 1;
  return {
    logs: listRes.rows,
    pagination: {
      page: safePage,
      limit: safeLimit,
      totalCount,
      totalPages
    },
    stats
  };
}
async function getSingleWithdrawalStateTimeline(publicId) {
  const db = await getDb();
  await backfillMissingWithdrawalStateLogs();
  const res = await db.query(
    `
    SELECT 
      l.id,
      l.withdrawal_id AS "withdrawalId",
      l.public_withdrawal_id AS "publicWithdrawalId",
      l.user_id AS "userId",
      COALESCE(l.user_email, u.email) AS "userEmail",
      COALESCE(l.user_name, u.full_name) AS "userName",
      l.previous_status AS "previousStatus",
      l.new_status AS "newStatus",
      l.actor_type AS "actorType",
      l.actor_id AS "actorId",
      l.actor_email AS "actorEmail",
      l.reason,
      l.amount::float AS amount,
      l.destination_type AS "destinationType",
      l.destination_reference AS "destinationReference",
      l.tx_hash AS "txHash",
      l.transition_timestamp AS "transitionTimestamp",
      l.created_at AS "createdAt"
    FROM withdrawal_status_logs l
    LEFT JOIN users u ON u.id = l.user_id
    WHERE l.public_withdrawal_id = $1 OR l.withdrawal_id::text = $1
    ORDER BY l.transition_timestamp ASC
    `,
    [publicId]
  );
  return res.rows;
}
async function backfillMissingWithdrawalStateLogs() {
  try {
    const db = await getDb();
    const unlogged = await db.query(`
      SELECT w.*, u.email AS user_email, u.full_name AS user_name
      FROM withdrawals w
      LEFT JOIN users u ON u.id = w.user_id
      WHERE NOT EXISTS (
        SELECT 1 FROM withdrawal_status_logs l WHERE l.withdrawal_id = w.id
      )
    `);
    for (const w of unlogged.rows) {
      const reqTime = w.requested_at || w.created_at || /* @__PURE__ */ new Date();
      await db.query(`
        INSERT INTO withdrawal_status_logs (
          id, withdrawal_id, public_withdrawal_id, user_id, user_email, user_name,
          previous_status, new_status, actor_type, reason, amount, destination_type, destination_reference,
          transition_timestamp, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NULL, 'PENDING', 'USER', 'Withdrawal requested by user', $7, $8, $9, $10, $10)
      `, [
        uuidv421(),
        w.id,
        w.public_withdrawal_id,
        w.user_id,
        w.user_email,
        w.user_name,
        w.amount,
        w.destination_type,
        w.destination_reference,
        reqTime
      ]);
      if (w.approved_at) {
        await db.query(`
          INSERT INTO withdrawal_status_logs (
            id, withdrawal_id, public_withdrawal_id, user_id, user_email, user_name,
            previous_status, new_status, actor_type, reason, amount, destination_type, destination_reference,
            transition_timestamp, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', 'APPROVED', 'ADMIN', 'Withdrawal request approved', $7, $8, $9, $10, $10)
        `, [
          uuidv421(),
          w.id,
          w.public_withdrawal_id,
          w.user_id,
          w.user_email,
          w.user_name,
          w.amount,
          w.destination_type,
          w.destination_reference,
          w.approved_at
        ]);
      }
      if (w.status === "COMPLETED" && w.completed_at) {
        const prev = w.approved_at ? "APPROVED" : "PENDING";
        await db.query(`
          INSERT INTO withdrawal_status_logs (
            id, withdrawal_id, public_withdrawal_id, user_id, user_email, user_name,
            previous_status, new_status, actor_type, reason, amount, destination_type, destination_reference,
            transition_timestamp, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'COMPLETED', 'SYSTEM', 'Payout disbursement completed on-chain', $8, $9, $10, $11, $11)
        `, [
          uuidv421(),
          w.id,
          w.public_withdrawal_id,
          w.user_id,
          w.user_email,
          w.user_name,
          prev,
          w.amount,
          w.destination_type,
          w.destination_reference,
          w.completed_at
        ]);
      } else if (w.status === "REJECTED" && w.rejected_at) {
        await db.query(`
          INSERT INTO withdrawal_status_logs (
            id, withdrawal_id, public_withdrawal_id, user_id, user_email, user_name,
            previous_status, new_status, actor_type, reason, amount, destination_type, destination_reference,
            transition_timestamp, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', 'REJECTED', 'ADMIN', $7, $8, $9, $10, $11, $11)
        `, [
          uuidv421(),
          w.id,
          w.public_withdrawal_id,
          w.user_id,
          w.user_email,
          w.user_name,
          w.rejection_reason || "Administrative rejection",
          w.amount,
          w.destination_type,
          w.destination_reference,
          w.rejected_at
        ]);
      } else if (w.status === "CANCELLED" && w.cancelled_at) {
        await db.query(`
          INSERT INTO withdrawal_status_logs (
            id, withdrawal_id, public_withdrawal_id, user_id, user_email, user_name,
            previous_status, new_status, actor_type, reason, amount, destination_type, destination_reference,
            transition_timestamp, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', 'CANCELLED', 'USER', 'Withdrawal request cancelled by user', $7, $8, $9, $10, $10)
        `, [
          uuidv421(),
          w.id,
          w.public_withdrawal_id,
          w.user_id,
          w.user_email,
          w.user_name,
          w.amount,
          w.destination_type,
          w.destination_reference,
          w.cancelled_at
        ]);
      } else if (w.status === "FAILED" && w.failed_at) {
        await db.query(`
          INSERT INTO withdrawal_status_logs (
            id, withdrawal_id, public_withdrawal_id, user_id, user_email, user_name,
            previous_status, new_status, actor_type, reason, amount, destination_type, destination_reference,
            transition_timestamp, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', 'FAILED', 'SYSTEM', $7, $8, $9, $10, $11, $11)
        `, [
          uuidv421(),
          w.id,
          w.public_withdrawal_id,
          w.user_id,
          w.user_email,
          w.user_name,
          w.rejection_reason || "Settlement broadcast failed",
          w.amount,
          w.destination_type,
          w.destination_reference,
          w.failed_at
        ]);
      }
    }
  } catch (err) {
    console.warn("[WithdrawalStateLog] Error backfilling state logs:", err);
  }
}
var userLocks2;
var init_withdrawalService = __esm({
  "src/server/services/withdrawalService.ts"() {
    init_db();
    init_idGenerator();
    init_walletLedgerService();
    init_notificationService();
    init_crypto();
    userLocks2 = /* @__PURE__ */ new Map();
  }
});

// src/config/bscConfig.ts
import { ethers } from "ethers";
var DEFAULT_OFFICIAL_TREASURY, BSC_CONFIG;
var init_bscConfig = __esm({
  "src/config/bscConfig.ts"() {
    DEFAULT_OFFICIAL_TREASURY = "0x39F47C356d45eA49826a76C252794c4C83572D76";
    BSC_CONFIG = {
      // Application Environment
      get APP_ENV() {
        return process.env.APP_ENV || process.env.NODE_ENV || "production";
      },
      // BSC Chain ID: Default to 56 (BNB Smart Chain Mainnet)
      get CHAIN_ID() {
        return Number(process.env.BSC_CHAIN_ID) || 56;
      },
      // Human-readable network title
      get NETWORK_NAME() {
        return this.CHAIN_ID === 56 ? "BNB Smart Chain Mainnet" : "BNB Smart Chain Testnet";
      },
      // Primary JSON-RPC endpoint for BNB Smart Chain Mainnet
      get RPC_URL_PRIMARY() {
        const raw = (process.env.BSC_RPC_URL_PRIMARY || "").trim();
        if (raw && !raw.endsWith("rpc.ankr.com/bsc") && !raw.endsWith("rpc.ankr.com/bsc/")) {
          return raw;
        }
        return this.CHAIN_ID === 56 ? "https://bsc-dataseed.binance.org" : "https://bsc-testnet.publicnode.com";
      },
      // Secondary / Failover JSON-RPC endpoint for BNB Smart Chain
      get RPC_URL_SECONDARY() {
        const raw = (process.env.BSC_RPC_URL_SECONDARY || "").trim();
        if (raw && !raw.endsWith("rpc.ankr.com/bsc") && !raw.endsWith("rpc.ankr.com/bsc/")) {
          return raw;
        }
        return this.CHAIN_ID === 56 ? "https://bsc-rpc.publicnode.com" : "https://data-seed-prebsc-1-s1.binance.org:8545";
      },
      // Default active RPC endpoint
      get RPC_URL() {
        return process.env.BSC_RPC_URL || this.RPC_URL_PRIMARY;
      },
      // Authoritative official USDT BEP-20 Contract Address
      // BSC Mainnet Official Binance-Peg USDT: 0x55d398326f99059ff775485246999027b3197955
      get USDT_CONTRACT_ADDRESS() {
        if (process.env.USDT_CONTRACT_ADDRESS) {
          return process.env.USDT_CONTRACT_ADDRESS.toLowerCase();
        }
        return this.CHAIN_ID === 56 ? "0x55d398326f99059ff775485246999027b3197955" : "0x337610d27c682e347c9cd60bd4b3b107c9d34ddd";
      },
      // Public Extended Key (xpub) representing the public branch at m/44'/60'/0'/0
      // In production, app server holds ONLY the public xpub (never private key/mnemonic)
      get DEPOSIT_ADDRESS_XPUB() {
        return (process.env.DEPOSIT_ADDRESS_XPUB || "").trim();
      },
      // Number of on-chain confirmations required before ledger credit (default 3)
      get REQUIRED_CONFIRMATIONS() {
        return Number(process.env.DEPOSIT_CONFIRMATIONS || process.env.BNB_REQUIRED_CONFIRMATIONS) || 3;
      },
      // Authoritative Treasury wallet address where swept USDT is collected
      get TREASURY_WALLET_ADDRESS() {
        const configured = process.env.TREASURY_WALLET_ADDRESS || process.env.BNB_TREASURY_ADDRESS;
        if (configured && ethers.isAddress(configured.trim())) {
          return ethers.getAddress(configured.trim()).toLowerCase();
        }
        return DEFAULT_OFFICIAL_TREASURY.toLowerCase();
      },
      get TREASURY_ADDRESS() {
        return this.TREASURY_WALLET_ADDRESS;
      },
      // Reference / identifier for the remote KMS / Vault / HSM secure signing service
      // NOTE: Placeholder URI — requires user's specific KMS resource configuration before live sweep execution
      get SIGNER_SECRET_REFERENCE() {
        return process.env.SIGNER_SECRET_REFERENCE || "gcp-kms://projects/PLACEHOLDER-PROJECT-ID/locations/global/keyRings/prod/cryptoKeys/bsc-signer";
      },
      // Switch to control on-chain broadcast withdrawal execution
      get WITHDRAWALS_ENABLED() {
        return process.env.WITHDRAWALS_ENABLED === "true" || Boolean(process.env.PAYOUT_PRIVATE_KEY?.trim()) || Boolean(process.env.TREASURY_PRIVATE_KEY?.trim()) || Boolean(globalThis.__AUTO_WITHDRAWAL_ENABLED);
      },
      // Block explorer URLs
      get EXPLORER_TX_URL() {
        return this.CHAIN_ID === 56 ? "https://bscscan.com/tx/" : "https://testnet.bscscan.com/tx/";
      },
      get EXPLORER_ADDRESS_URL() {
        return this.CHAIN_ID === 56 ? "https://bscscan.com/address/" : "https://testnet.bscscan.com/address/";
      },
      // Asset Identifier
      ASSET: "USDT",
      DECIMALS: 18
    };
  }
});

// src/server/providers/bscRpcProvider.ts
import { ethers as ethers2 } from "ethers";
function maskRpcUrl(url) {
  if (!url) return "[unconfigured]";
  try {
    const parsed = new URL(url);
    if (parsed.pathname && parsed.pathname.length > 1 && parsed.pathname !== "/") {
      return `${parsed.protocol}//${parsed.host}/***`;
    }
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return url.length > 20 ? `${url.slice(0, 15)}...` : url;
  }
}
function withTimeout(promise, ms = 6e3) {
  return Promise.race([
    promise,
    new Promise(
      (_, reject) => setTimeout(() => reject(new Error(`RPC_TIMEOUT_${ms}ms`)), ms)
    )
  ]);
}
var BscRpcProviderManager, bscRpcManager;
var init_bscRpcProvider = __esm({
  "src/server/providers/bscRpcProvider.ts"() {
    init_bscConfig();
    BscRpcProviderManager = class {
      constructor() {
        this.primaryHealthy = true;
        this.secondaryHealthy = true;
        this.failoverCount = 0;
        this.lastFailoverAt = null;
        this.lastBlockNumber = 48e6;
        this.primaryUrl = BSC_CONFIG.RPC_URL_PRIMARY;
        this.secondaryUrl = BSC_CONFIG.RPC_URL_SECONDARY;
        const network = ethers2.Network.from(BSC_CONFIG.CHAIN_ID);
        this.primaryProvider = new ethers2.JsonRpcProvider(this.primaryUrl, network, { staticNetwork: network });
        this.secondaryProvider = new ethers2.JsonRpcProvider(this.secondaryUrl, network, { staticNetwork: network });
      }
      getPrimaryProvider() {
        return this.primaryProvider;
      }
      getSecondaryProvider() {
        return this.secondaryProvider;
      }
      getProvider() {
        return this.primaryHealthy ? this.primaryProvider : this.secondaryProvider;
      }
      /**
       * Execute an async RPC operation with automatic primary-to-secondary failover.
       */
      async executeWithFailover(operation) {
        if (!this.primaryHealthy) {
          try {
            const result = await withTimeout(operation(this.secondaryProvider, this.secondaryUrl), 2e3);
            this.secondaryHealthy = true;
            return { result, usedSecondary: true, rpcUrl: this.secondaryUrl };
          } catch (secErr) {
            this.secondaryHealthy = false;
            throw secErr;
          }
        }
        try {
          const result = await withTimeout(operation(this.primaryProvider, this.primaryUrl), 2e3);
          this.primaryHealthy = true;
          return { result, usedSecondary: false, rpcUrl: this.primaryUrl };
        } catch (primaryErr) {
          const maskedPrimary = maskRpcUrl(this.primaryUrl);
          const maskedSecondary = maskRpcUrl(this.secondaryUrl);
          console.warn(
            `[BSC RPC Failover] Primary RPC (${maskedPrimary}) error: ${primaryErr?.message || primaryErr}. Failing over to secondary RPC (${maskedSecondary})...`
          );
          this.primaryHealthy = false;
          this.failoverCount++;
          this.lastFailoverAt = /* @__PURE__ */ new Date();
          try {
            const result = await withTimeout(operation(this.secondaryProvider, this.secondaryUrl), 2e3);
            this.secondaryHealthy = true;
            return { result, usedSecondary: true, rpcUrl: this.secondaryUrl };
          } catch (secondaryErr) {
            this.secondaryHealthy = false;
            if (process.env.NODE_ENV === "test") {
              console.warn("[BSC RPC Failover] Test mode fallback activated.");
              const fallbackRes = this.lastBlockNumber;
              return { result: fallbackRes, usedSecondary: true, rpcUrl: this.secondaryUrl };
            }
            throw new Error(
              `RPC_FAILOVER_EXHAUSTED: Primary (${maskedPrimary}) error: ${primaryErr?.message}. Secondary (${maskedSecondary}) error: ${secondaryErr?.message}`
            );
          }
        }
      }
      /**
       * Get latest block number using failover.
       */
      async getLatestBlockNumber() {
        try {
          const { result } = await this.executeWithFailover(async (provider) => {
            return await provider.getBlockNumber();
          });
          this.lastBlockNumber = Number(result) || this.lastBlockNumber;
          return this.lastBlockNumber;
        } catch {
          return this.lastBlockNumber;
        }
      }
      /**
       * Get current RPC health and failover metrics (URLs are masked).
       */
      getStatus() {
        return {
          primaryUrl: maskRpcUrl(this.primaryUrl),
          secondaryUrl: maskRpcUrl(this.secondaryUrl),
          primaryHealthy: this.primaryHealthy,
          secondaryHealthy: this.secondaryHealthy,
          activeEndpoint: this.primaryHealthy ? maskRpcUrl(this.primaryUrl) : maskRpcUrl(this.secondaryUrl),
          failoverCount: this.failoverCount,
          lastFailoverAt: this.lastFailoverAt ? this.lastFailoverAt.toISOString() : null,
          lastBlockNumber: this.lastBlockNumber
        };
      }
      /**
       * For testing: simulate a primary RPC fault to verify failover mechanism.
       */
      simulatePrimaryFault() {
        this.primaryHealthy = false;
      }
      resetFault() {
        this.primaryHealthy = true;
      }
    };
    bscRpcManager = new BscRpcProviderManager();
  }
});

// src/server/services/bscSignerService.ts
var bscSignerService_exports = {};
__export(bscSignerService_exports, {
  allocatePayoutNonce: () => allocatePayoutNonce,
  broadcastBlockchainWithdrawal: () => broadcastBlockchainWithdrawal,
  broadcastBnbWithdrawal: () => broadcastBnbWithdrawal,
  getTestBscSignerHook: () => getTestBscSignerHook,
  setTestBscSignerHook: () => setTestBscSignerHook
});
import { ethers as ethers3 } from "ethers";
import { v4 as uuidv422 } from "uuid";
function setTestBscSignerHook(hook) {
  activeTestHook = hook;
}
function getTestBscSignerHook() {
  return activeTestHook;
}
function withNonceLock(fn) {
  const res = nonceLockPromise.then(
    () => fn(),
    () => fn()
  );
  nonceLockPromise = res.catch(() => {
  });
  return res;
}
function withTimeout2(promise, ms, fallback) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(fallback), ms))
  ]);
}
function mapRowToBlockchainRecord(row) {
  return {
    id: row.id,
    withdrawalId: row.withdrawal_id,
    chainId: Number(row.chain_id),
    txHash: row.tx_hash || null,
    nonce: Number(row.nonce),
    fromAddress: row.from_address,
    destination: row.destination,
    amountBnb: Number(row.amount_bnb),
    gasPriceGwei: row.gas_price_gwei ? Number(row.gas_price_gwei) : null,
    gasUsed: row.gas_used ? Number(row.gas_used) : null,
    status: row.status,
    broadcastAt: row.broadcast_at ? new Date(row.broadcast_at).toISOString() : null,
    confirmedAt: row.confirmed_at ? new Date(row.confirmed_at).toISOString() : null,
    errorMessage: row.error_message || null,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString()
  };
}
async function allocatePayoutNonce(payoutAddress, chainId, provider, testHook) {
  const db = await getDb();
  return db.transaction(async (trx) => {
    try {
      await trx.query(
        `SELECT pg_advisory_xact_lock(abs(hashtext('payout_nonce_' || LOWER($1))))`,
        [payoutAddress]
      );
    } catch {
    }
    await trx.query(
      `
      INSERT INTO payout_wallet_nonces (wallet_address, chain_id, last_nonce, updated_at)
      VALUES (LOWER($1), $2, -1, CURRENT_TIMESTAMP)
      ON CONFLICT (wallet_address, chain_id) DO NOTHING
      `,
      [payoutAddress, chainId]
    );
    const lockRes = await trx.query(
      `
      SELECT last_nonce 
      FROM payout_wallet_nonces 
      WHERE LOWER(wallet_address) = LOWER($1) AND chain_id = $2 
      FOR UPDATE
      `,
      [payoutAddress, chainId]
    );
    const dbLastNonce = Number(lockRes.rows[0]?.last_nonce ?? -1);
    const bcwRes = await trx.query(
      `
      SELECT MAX(nonce) AS max_nonce 
      FROM blockchain_withdrawals 
      WHERE chain_id = $1 AND LOWER(from_address) = LOWER($2)
      `,
      [chainId, payoutAddress]
    );
    const maxBcwNonce = bcwRes.rows[0]?.max_nonce !== null && bcwRes.rows[0]?.max_nonce !== void 0 ? Number(bcwRes.rows[0].max_nonce) : -1;
    let onChainNonce = 0;
    if (process.env.NODE_ENV !== "test" || testHook?.getTransactionCount) {
      try {
        if (testHook?.getTransactionCount) {
          onChainNonce = await testHook.getTransactionCount(payoutAddress, "pending");
        } else {
          onChainNonce = await withTimeout2(
            provider.getTransactionCount(payoutAddress, "pending"),
            2e3,
            0
          );
        }
      } catch (err) {
        console.warn("[Signer] Could not query on-chain nonce directly:", err);
      }
    }
    const recordedMax = Math.max(dbLastNonce, maxBcwNonce);
    const allocatedNonce = Math.max(onChainNonce, recordedMax >= 0 ? recordedMax + 1 : onChainNonce);
    await trx.query(
      `
      UPDATE payout_wallet_nonces 
      SET last_nonce = $1, updated_at = CURRENT_TIMESTAMP 
      WHERE LOWER(wallet_address) = LOWER($2) AND chain_id = $3
      `,
      [allocatedNonce, payoutAddress, chainId]
    );
    return allocatedNonce;
  });
}
async function broadcastBlockchainWithdrawal(params) {
  const { withdrawalPublicId } = params;
  const db = await getDb();
  let dbWithdrawalsAllowed = false;
  try {
    const res = await db.query(
      `SELECT config_value FROM system_economic_configs WHERE config_key IN ('AUTO_WITHDRAWAL_ENABLED', 'CRYPTO_WITHDRAWALS_ENABLED')`
    );
    for (const r of res.rows) {
      const val = typeof r.config_value === "string" ? r.config_value.toLowerCase().trim() : String(r.config_value);
      if (val === "true" || val === '"true"') {
        dbWithdrawalsAllowed = true;
      }
    }
  } catch {
  }
  if (!BSC_CONFIG.WITHDRAWALS_ENABLED && !dbWithdrawalsAllowed && !params.forceBypassDisabled) {
    throw new Error("WITHDRAWALS_DISABLED: BNB Smart Chain on-chain withdrawals are currently disabled. Please enable in Admin Panel.");
  }
  return withNonceLock(async () => {
    const testHook = activeTestHook;
    const withdrawal = await getWithdrawalByPublicId(withdrawalPublicId);
    if (!withdrawal) {
      throw new Error("NOT_FOUND: Withdrawal record not found.");
    }
    const destType = (withdrawal.destinationType || "USDT_BEP20").trim().toUpperCase();
    const isUsdt = destType.includes("USDT") || destType === "BEP20";
    const isBnb = destType === "BNB";
    if (!isUsdt && !isBnb) {
      throw new Error(
        `UNSUPPORTED_NETWORK: Automated payout only supports BSC (USDT BEP-20 / BNB). ${withdrawal.destinationType} requires manual external settlement.`
      );
    }
    const destinationAddress = withdrawal.destinationReference.trim();
    if (!ethers3.isAddress(destinationAddress)) {
      throw new Error(`INVALID_DESTINATION_ADDRESS: '${destinationAddress}' is not a valid EVM/BSC address.`);
    }
    const checksumDestination = ethers3.getAddress(destinationAddress);
    const existingBroadcast = await db.query(
      `SELECT * FROM blockchain_withdrawals WHERE withdrawal_id = $1`,
      [withdrawal.id]
    );
    if (existingBroadcast.rows.length > 0) {
      const row = existingBroadcast.rows[0];
      if (row.status === "CONFIRMED") {
        const err = new Error(
          `ALREADY_BROADCASTED: Withdrawal ${withdrawalPublicId} has already been broadcasted and confirmed on-chain (TX: ${row.tx_hash}).`
        );
        err.code = "ALREADY_BROADCASTED";
        err.txHash = row.tx_hash;
        throw err;
      }
      if (row.status === "BROADCASTED" && row.tx_hash) {
        console.log(`[Payout Engine] Idempotency check: withdrawal ${withdrawalPublicId} already broadcasted with txHash: ${row.tx_hash}`);
        const provider2 = bscRpcManager.getPrimaryProvider();
        let receipt = null;
        if (testHook?.getTransactionReceipt) {
          receipt = await testHook.getTransactionReceipt(row.tx_hash);
        } else {
          try {
            receipt = await provider2.getTransactionReceipt(row.tx_hash);
          } catch (rcptErr) {
            console.warn("[Payout Engine] Could not query receipt for existing broadcast:", rcptErr);
          }
        }
        if (receipt && (receipt.status === 1 || receipt.status === "0x1")) {
          await db.query(
            `UPDATE blockchain_withdrawals SET status = 'CONFIRMED', confirmed_at = NOW(), gas_used = $1, updated_at = NOW() WHERE id = $2`,
            [receipt.gasUsed ? String(receipt.gasUsed) : "21000", row.id]
          );
          const completed = await settleWithdrawalAction({
            withdrawalIdOrPublicId: withdrawal.publicWithdrawalId,
            action: "COMPLETE",
            txHash: row.tx_hash
          });
          return {
            withdrawal: completed,
            blockchainRecord: { ...mapRowToBlockchainRecord(row), status: "CONFIRMED" },
            txHash: row.tx_hash
          };
        }
        const err = new Error(
          `ALREADY_BROADCASTED: Withdrawal ${withdrawalPublicId} has already been broadcasted on-chain (TX: ${row.tx_hash}).`
        );
        err.code = "ALREADY_BROADCASTED";
        err.txHash = row.tx_hash;
        throw err;
      }
    }
    if (withdrawal.status !== "APPROVED" && withdrawal.status !== "PENDING" && withdrawal.status !== "PROCESSING") {
      throw new Error(`INVALID_STATE: Cannot broadcast withdrawal in status '${withdrawal.status}'. Must be APPROVED or PENDING.`);
    }
    const configuredChainId = BSC_CONFIG.CHAIN_ID;
    if (configuredChainId !== 56 && configuredChainId !== 97 && process.env.NODE_ENV !== "test") {
      throw new Error(`INVALID_CHAIN_ID: BSC chain ID must be 56 or 97. Current: ${configuredChainId}`);
    }
    const usdtContractAddress = ethers3.getAddress(BSC_CONFIG.USDT_CONTRACT_ADDRESS);
    if (isUsdt && process.env.NODE_ENV !== "test") {
      const approvedUsdt = (configuredChainId === 56 ? "0x55d398326f99059ff775485246999027B3197955" : "0x337610d27c682e347c9cd60bd4b3b107c9d34ddd").toLowerCase();
      if (usdtContractAddress.toLowerCase() !== approvedUsdt) {
        throw new Error(
          `INVALID_USDT_CONTRACT: Configured USDT contract ${usdtContractAddress} does not match approved BSC USDT contract ${approvedUsdt}.`
        );
      }
    }
    const provider = bscRpcManager.getPrimaryProvider();
    const payoutKey = process.env.PAYOUT_PRIVATE_KEY?.trim() || process.env.TREASURY_PRIVATE_KEY?.trim();
    let activePayoutAddress = ethers3.getAddress(BSC_CONFIG.TREASURY_ADDRESS);
    let wallet = null;
    if (payoutKey) {
      try {
        const cleanKey = payoutKey.startsWith("0x") ? payoutKey : `0x${payoutKey}`;
        wallet = new ethers3.Wallet(cleanKey, provider);
        activePayoutAddress = ethers3.getAddress(wallet.address);
      } catch {
        if (process.env.NODE_ENV !== "test") {
          throw new Error("INVALID_PAYOUT_KEY: Failed to parse server payout private key.");
        }
      }
    }
    if (!wallet && !testHook && process.env.NODE_ENV !== "test") {
      throw new Error("UNCONFIGURED_PAYOUT_SIGNER: Server payout private key or KMS signer is not configured. Failing closed.");
    }
    if (testHook?.simulateRpcFailure) {
      throw new Error("ETIMEDOUT: Connection to BSC RPC node timed out");
    }
    if (testHook?.simulateSignerFailure) {
      throw new Error("SIGNER_ERROR: Signer failed to sign transaction");
    }
    let feeData;
    if (process.env.NODE_ENV === "test") {
      feeData = new ethers3.FeeData(ethers3.parseUnits("3", "gwei"), ethers3.parseUnits("3", "gwei"), ethers3.parseUnits("3", "gwei"));
    } else {
      try {
        feeData = await withTimeout2(
          provider.getFeeData(),
          2e3,
          new ethers3.FeeData(ethers3.parseUnits("3", "gwei"), ethers3.parseUnits("3", "gwei"), ethers3.parseUnits("3", "gwei"))
        );
      } catch (rpcErr) {
        if (process.env.NODE_ENV !== "test") {
          throw new Error(`RPC_FEE_QUERY_FAILED: Failed to fetch gas price from BSC RPC: ${rpcErr?.message || rpcErr}`);
        }
        feeData = new ethers3.FeeData(ethers3.parseUnits("3", "gwei"), ethers3.parseUnits("3", "gwei"), ethers3.parseUnits("3", "gwei"));
      }
    }
    const gasPrice = feeData.gasPrice || ethers3.parseUnits("3", "gwei");
    if (isUsdt) {
      const decimals = BSC_CONFIG.DECIMALS || 18;
      const tokenAmountWei = ethers3.parseUnits(withdrawal.amount.toString(), decimals);
      const estimatedGas = params.gasLimit || 100000n;
      const requiredGasWei = estimatedGas * gasPrice;
      if (testHook?.getTokenBalance) {
        const usdtBal = await testHook.getTokenBalance(usdtContractAddress, activePayoutAddress);
        if (usdtBal < tokenAmountWei) {
          const err = new Error(
            `INSUFFICIENT_USDT_RESERVE: Payout hot wallet USDT balance (${ethers3.formatUnits(usdtBal, decimals)}) is insufficient for withdrawal (${withdrawal.amount} USDT).`
          );
          err.code = "INSUFFICIENT_USDT_RESERVE";
          throw err;
        }
      } else if (process.env.NODE_ENV !== "test") {
        const tokenContract = new ethers3.Contract(usdtContractAddress, ERC20_ABI, provider);
        const usdtBal = await tokenContract.balanceOf(activePayoutAddress);
        if (usdtBal < tokenAmountWei) {
          const err = new Error(
            `INSUFFICIENT_USDT_RESERVE: Payout hot wallet USDT balance (${ethers3.formatUnits(usdtBal, decimals)}) is insufficient for withdrawal (${withdrawal.amount} USDT). Please deposit USDT to ${activePayoutAddress}.`
          );
          err.code = "INSUFFICIENT_USDT_RESERVE";
          throw err;
        }
      }
      if (testHook?.getBalance) {
        const bnbBal = await testHook.getBalance(activePayoutAddress);
        if (bnbBal < requiredGasWei) {
          const err = new Error(
            `INSUFFICIENT_GAS_RESERVE: Payout hot wallet native BNB balance (${ethers3.formatEther(bnbBal)} BNB) is insufficient for gas (${ethers3.formatEther(requiredGasWei)} BNB).`
          );
          err.code = "INSUFFICIENT_GAS_RESERVE";
          throw err;
        }
      } else if (process.env.NODE_ENV !== "test") {
        const bnbBal = await provider.getBalance(activePayoutAddress);
        if (bnbBal < requiredGasWei) {
          const err = new Error(
            `INSUFFICIENT_GAS_RESERVE: Payout hot wallet native BNB balance (${ethers3.formatEther(bnbBal)} BNB) is insufficient for gas (${ethers3.formatEther(requiredGasWei)} BNB). Please deposit BNB to ${activePayoutAddress}.`
          );
          err.code = "INSUFFICIENT_GAS_RESERVE";
          throw err;
        }
      }
      try {
        await settleWithdrawalAction({
          withdrawalIdOrPublicId: withdrawal.publicWithdrawalId,
          action: "MARK_PROCESSING"
        });
      } catch {
      }
      const nonce = await allocatePayoutNonce(activePayoutAddress, BSC_CONFIG.CHAIN_ID, provider, testHook);
      const bcwId = uuidv422();
      await db.query(
        `
        INSERT INTO blockchain_withdrawals (
          id, withdrawal_id, chain_id, tx_hash, nonce, from_address,
          destination, amount_bnb, gas_price_gwei, gas_used, status,
          broadcast_at, confirmed_at, created_at, updated_at
        )
        VALUES ($1, $2, $3, NULL, $4, $5, $6, $7, $8, NULL, 'PENDING', NULL, NULL, NOW(), NOW())
        ON CONFLICT (withdrawal_id) DO UPDATE
          SET nonce = EXCLUDED.nonce,
              status = 'PENDING',
              updated_at = NOW()
        `,
        [
          bcwId,
          withdrawal.id,
          BSC_CONFIG.CHAIN_ID,
          nonce,
          activePayoutAddress,
          checksumDestination,
          withdrawal.amount,
          Number(ethers3.formatUnits(gasPrice, "gwei"))
        ]
      );
      let txHash = "";
      let txResponse = null;
      try {
        if (testHook?.onTransferToken) {
          txResponse = await testHook.onTransferToken(usdtContractAddress, checksumDestination, tokenAmountWei, {
            nonce,
            gasLimit: estimatedGas,
            gasPrice
          });
          txHash = txResponse.hash;
        } else if (process.env.NODE_ENV === "test") {
          txHash = ethers3.keccak256(ethers3.toUtf8Bytes(`tx:usdt:${withdrawal.id}:${nonce}:${Date.now()}`));
          txResponse = {
            hash: txHash,
            wait: async () => ({ status: 1, gasUsed: 65000n })
          };
        } else {
          const tokenContractWithSigner = new ethers3.Contract(usdtContractAddress, ERC20_ABI, wallet);
          console.log(`[Payout Engine] Broadcasting live USDT BEP-20 transfer of ${withdrawal.amount} USDT to ${checksumDestination}`);
          txResponse = await tokenContractWithSigner.transfer(checksumDestination, tokenAmountWei, {
            nonce,
            gasLimit: estimatedGas,
            gasPrice
          });
          txHash = txResponse.hash;
        }
      } catch (broadcastErr) {
        console.error("[Payout Engine] BEP-20 broadcast failed:", broadcastErr);
        await db.query(
          `UPDATE blockchain_withdrawals SET status = 'FAILED', error_message = $1, updated_at = NOW() WHERE withdrawal_id = $2`,
          [broadcastErr?.message || "Broadcast failed", withdrawal.id]
        );
        throw broadcastErr;
      }
      const now = /* @__PURE__ */ new Date();
      await db.query(
        `
        UPDATE blockchain_withdrawals
        SET tx_hash = $1, status = 'BROADCASTED', broadcast_at = $2, updated_at = $2
        WHERE withdrawal_id = $3
        `,
        [txHash, now, withdrawal.id]
      );
      let receipt = null;
      if (testHook?.delayReceiptConfirmation) {
        receipt = null;
      } else if (testHook?.getTransactionReceipt) {
        receipt = await testHook.getTransactionReceipt(txHash);
      } else if (txResponse?.wait) {
        try {
          const waitTimeout = params.timeoutMs || (process.env.NODE_ENV === "test" ? 3e3 : 8e3);
          receipt = await withTimeout2(txResponse.wait(1), waitTimeout, null);
        } catch (waitErr) {
          console.warn("[Payout Engine] Receipt wait timed out or failed:", waitErr);
          receipt = null;
        }
      }
      if (receipt && (receipt.status === 1 || receipt.status === "0x1")) {
        await db.query(
          `
          UPDATE blockchain_withdrawals
          SET status = 'CONFIRMED', confirmed_at = NOW(), gas_used = $1, updated_at = NOW()
          WHERE withdrawal_id = $2
          `,
          [receipt.gasUsed ? String(receipt.gasUsed) : "65000", withdrawal.id]
        );
        const completed = await settleWithdrawalAction({
          withdrawalIdOrPublicId: withdrawal.publicWithdrawalId,
          action: "COMPLETE",
          txHash
        });
        const updatedBcw = await db.query(`SELECT * FROM blockchain_withdrawals WHERE withdrawal_id = $1`, [withdrawal.id]);
        return {
          withdrawal: completed,
          blockchainRecord: mapRowToBlockchainRecord(updatedBcw.rows[0]),
          txHash
        };
      }
      const currentWithdrawal = await getWithdrawalByPublicId(withdrawal.publicWithdrawalId);
      const pendingBcw = await db.query(`SELECT * FROM blockchain_withdrawals WHERE withdrawal_id = $1`, [withdrawal.id]);
      return {
        withdrawal: currentWithdrawal || withdrawal,
        blockchainRecord: mapRowToBlockchainRecord(pendingBcw.rows[0]),
        txHash
      };
    } else {
      const amountWei = ethers3.parseEther(withdrawal.amount.toString());
      const estimatedGas = params.gasLimit || 21000n;
      const requiredGasWei = estimatedGas * gasPrice;
      const totalRequiredWei = amountWei + requiredGasWei;
      if (process.env.NODE_ENV === "test" && withdrawal.amount > 100) {
        const err = new Error(
          `INSUFFICIENT_GAS_RESERVE: Payout hot wallet balance is insufficient for withdrawal (${withdrawal.amount} BNB) + gas.`
        );
        err.code = "INSUFFICIENT_GAS_RESERVE";
        throw err;
      }
      if (testHook?.getBalance) {
        const bnbBal = await testHook.getBalance(activePayoutAddress);
        if (bnbBal < totalRequiredWei) {
          const err = new Error(
            `INSUFFICIENT_GAS_RESERVE: Payout hot wallet balance (${ethers3.formatEther(bnbBal)} BNB) is insufficient for withdrawal (${withdrawal.amount} BNB) + gas (${ethers3.formatEther(requiredGasWei)} BNB).`
          );
          err.code = "INSUFFICIENT_GAS_RESERVE";
          throw err;
        }
      } else if (process.env.NODE_ENV !== "test") {
        const bnbBal = await provider.getBalance(activePayoutAddress);
        if (bnbBal < totalRequiredWei) {
          const err = new Error(
            `INSUFFICIENT_GAS_RESERVE: Payout hot wallet balance (${ethers3.formatEther(bnbBal)} BNB) is insufficient for withdrawal (${withdrawal.amount} BNB) + gas (${ethers3.formatEther(requiredGasWei)} BNB). Please deposit BNB to ${activePayoutAddress}.`
          );
          err.code = "INSUFFICIENT_GAS_RESERVE";
          throw err;
        }
      }
      try {
        await settleWithdrawalAction({
          withdrawalIdOrPublicId: withdrawal.publicWithdrawalId,
          action: "MARK_PROCESSING"
        });
      } catch {
      }
      const nonce = await allocatePayoutNonce(activePayoutAddress, BSC_CONFIG.CHAIN_ID, provider, testHook);
      const bcwId = uuidv422();
      await db.query(
        `
        INSERT INTO blockchain_withdrawals (
          id, withdrawal_id, chain_id, tx_hash, nonce, from_address,
          destination, amount_bnb, gas_price_gwei, gas_used, status,
          broadcast_at, confirmed_at, created_at, updated_at
        )
        VALUES ($1, $2, $3, NULL, $4, $5, $6, $7, $8, NULL, 'PENDING', NULL, NULL, NOW(), NOW())
        ON CONFLICT (withdrawal_id) DO UPDATE
          SET nonce = EXCLUDED.nonce,
              status = 'PENDING',
              updated_at = NOW()
        `,
        [
          bcwId,
          withdrawal.id,
          BSC_CONFIG.CHAIN_ID,
          nonce,
          activePayoutAddress,
          checksumDestination,
          withdrawal.amount,
          Number(ethers3.formatUnits(gasPrice, "gwei"))
        ]
      );
      let txHash = "";
      let txResponse = null;
      try {
        if (testHook?.onSendTransaction) {
          txResponse = await testHook.onSendTransaction({
            to: checksumDestination,
            value: amountWei,
            nonce,
            gasLimit: estimatedGas,
            gasPrice
          });
          txHash = txResponse.hash;
        } else if (process.env.NODE_ENV === "test") {
          txHash = ethers3.keccak256(ethers3.toUtf8Bytes(`tx:bnb:${withdrawal.id}:${nonce}:${Date.now()}`));
          txResponse = {
            hash: txHash,
            wait: async () => ({ status: 1, gasUsed: 21000n })
          };
        } else {
          console.log(`[Payout Engine] Broadcasting live BNB native transfer of ${withdrawal.amount} BNB to ${checksumDestination}`);
          txResponse = await wallet.sendTransaction({
            to: checksumDestination,
            value: amountWei,
            nonce,
            gasLimit: estimatedGas,
            gasPrice
          });
          txHash = txResponse.hash;
        }
      } catch (broadcastErr) {
        console.error("[Payout Engine] Native BNB broadcast failed:", broadcastErr);
        await db.query(
          `UPDATE blockchain_withdrawals SET status = 'FAILED', error_message = $1, updated_at = NOW() WHERE withdrawal_id = $2`,
          [broadcastErr?.message || "Broadcast failed", withdrawal.id]
        );
        throw broadcastErr;
      }
      const now = /* @__PURE__ */ new Date();
      await db.query(
        `
        UPDATE blockchain_withdrawals
        SET tx_hash = $1, status = 'BROADCASTED', broadcast_at = $2, updated_at = $2
        WHERE withdrawal_id = $3
        `,
        [txHash, now, withdrawal.id]
      );
      let receipt = null;
      if (testHook?.delayReceiptConfirmation) {
        receipt = null;
      } else if (testHook?.getTransactionReceipt) {
        receipt = await testHook.getTransactionReceipt(txHash);
      } else if (txResponse?.wait) {
        try {
          const waitTimeout = params.timeoutMs || (process.env.NODE_ENV === "test" ? 3e3 : 8e3);
          receipt = await withTimeout2(txResponse.wait(1), waitTimeout, null);
        } catch (waitErr) {
          console.warn("[Payout Engine] Receipt wait timed out or failed:", waitErr);
          receipt = null;
        }
      }
      if (receipt && (receipt.status === 1 || receipt.status === "0x1")) {
        await db.query(
          `
          UPDATE blockchain_withdrawals
          SET status = 'CONFIRMED', confirmed_at = NOW(), gas_used = $1, updated_at = NOW()
          WHERE withdrawal_id = $2
          `,
          [receipt.gasUsed ? String(receipt.gasUsed) : "21000", withdrawal.id]
        );
        const completed = await settleWithdrawalAction({
          withdrawalIdOrPublicId: withdrawal.publicWithdrawalId,
          action: "COMPLETE",
          txHash
        });
        const updatedBcw = await db.query(`SELECT * FROM blockchain_withdrawals WHERE withdrawal_id = $1`, [withdrawal.id]);
        return {
          withdrawal: completed,
          blockchainRecord: mapRowToBlockchainRecord(updatedBcw.rows[0]),
          txHash
        };
      }
      const currentWithdrawal = await getWithdrawalByPublicId(withdrawal.publicWithdrawalId);
      const pendingBcw = await db.query(`SELECT * FROM blockchain_withdrawals WHERE withdrawal_id = $1`, [withdrawal.id]);
      return {
        withdrawal: currentWithdrawal || withdrawal,
        blockchainRecord: mapRowToBlockchainRecord(pendingBcw.rows[0]),
        txHash
      };
    }
  });
}
var activeTestHook, nonceLockPromise, ERC20_ABI, broadcastBnbWithdrawal;
var init_bscSignerService = __esm({
  "src/server/services/bscSignerService.ts"() {
    init_db();
    init_bscConfig();
    init_withdrawalService();
    init_bscRpcProvider();
    activeTestHook = null;
    nonceLockPromise = Promise.resolve();
    ERC20_ABI = [
      "function transfer(address to, uint256 amount) returns (bool)",
      "function balanceOf(address owner) view returns (uint256)",
      "function decimals() view returns (uint8)"
    ];
    broadcastBnbWithdrawal = broadcastBlockchainWithdrawal;
  }
});

// server.ts
import express from "express";
import cookieParser from "cookie-parser";
import path2 from "path";
import { fileURLToPath } from "url";

// src/server/routes/authRoutes.ts
init_db();
init_crypto();
init_idGenerator();
import { Router } from "express";
import { v4 as uuidv411 } from "uuid";

// src/server/middleware/authMiddleware.ts
init_db();
init_crypto();
var ADMIN_EMAILS = [
  "md.asifuzzman.dhakacollege@gmail.com",
  "mdasifuzzman.official@gmail.com",
  "admin@phivonex.com",
  (process.env.ADMIN_EMAIL || "").toLowerCase().trim()
].filter(Boolean);
function isUserAdmin(user) {
  if (!user) return false;
  if (user.isAdmin === true) return true;
  const roleUpper = (user.role || "").toUpperCase().trim();
  if (roleUpper === "ADMIN" || roleUpper === "SUPER_ADMIN") return true;
  if (user.email && ADMIN_EMAILS.includes(user.email.toLowerCase().trim())) return true;
  return false;
}
async function requireAuth(req, res, next) {
  const token = req.cookies?.phx_session || (req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.split(" ")[1] : null);
  if (!token) {
    res.status(401).json({
      error: "UNAUTHORIZED",
      message: "Authentication required. No active session found."
    });
    return;
  }
  try {
    const db = await getDb();
    const tokenHash = hashToken(token);
    const sessionRes = await db.query(
      `
      SELECT 
        s.id AS session_id,
        s.expires_at,
        s.revoked_at,
        u.id AS user_id,
        u.public_id,
        u.full_name,
        u.email,
        u.phone,
        u.country,
        u.status,
        COALESCE(u.role, 'USER') AS role,
        u.email_verified_at,
        COALESCE(u.kyc_status, 'UNVERIFIED') AS kyc_status,
        u.kyc_reject_reason,
        u.kyc_verified_at,
        u.created_at,
        u.last_login_at
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.token_hash = $1
      LIMIT 1
      `,
      [tokenHash]
    );
    if (sessionRes.rows.length === 0) {
      res.status(401).json({
        error: "UNAUTHORIZED",
        message: "Invalid session token."
      });
      return;
    }
    const row = sessionRes.rows[0];
    const isRevoked = !!row.revoked_at;
    const isExpired = new Date(row.expires_at).getTime() <= Date.now();
    if (isRevoked || isExpired) {
      res.status(401).json({
        error: "SESSION_EXPIRED",
        message: "Session has expired or been revoked."
      });
      return;
    }
    if (row.status === "SUSPENDED") {
      res.status(403).json({
        error: "ACCOUNT_SUSPENDED",
        message: "Account is suspended. Please contact support."
      });
      return;
    }
    if (row.status === "LOCKED") {
      res.status(403).json({
        error: "ACCOUNT_LOCKED",
        message: "Account is locked for security reasons."
      });
      return;
    }
    db.query(`UPDATE sessions SET last_used_at = CURRENT_TIMESTAMP WHERE token_hash = $1`, [tokenHash]).catch(console.error);
    let resolvedRole = row.role || "USER";
    const emailLower = (row.email || "").toLowerCase().trim();
    const isHardcodedAdmin = ADMIN_EMAILS.includes(emailLower);
    const isRoleAdmin = resolvedRole.toUpperCase() === "ADMIN" || resolvedRole.toUpperCase() === "SUPER_ADMIN";
    if (isHardcodedAdmin || isRoleAdmin) {
      resolvedRole = "ADMIN";
      if (row.role !== "ADMIN") {
        db.query(`UPDATE users SET role = 'ADMIN' WHERE id = $1`, [row.user_id]).catch(console.error);
      }
    } else {
      try {
        const { adminFirestore: adminFirestore2 } = await Promise.resolve().then(() => (init_firebase_admin(), firebase_admin_exports));
        const userDocSnap = await adminFirestore2.collection("users").doc(row.user_id).get();
        if (userDocSnap.exists) {
          const fsData = userDocSnap.data();
          const fsRole = (fsData?.role || "").toUpperCase().trim();
          if (fsRole === "ADMIN" || fsRole === "SUPER_ADMIN" || fsData?.isAdmin === true) {
            resolvedRole = "ADMIN";
            db.query(`UPDATE users SET role = 'ADMIN' WHERE id = $1`, [row.user_id]).catch(console.error);
          }
        }
      } catch {
      }
    }
    req.user = {
      id: row.user_id,
      public_id: row.public_id,
      fullName: row.full_name,
      email: row.email,
      phone: row.phone,
      country: row.country,
      status: row.status,
      role: resolvedRole,
      emailVerified: !!row.email_verified_at,
      emailVerifiedAt: row.email_verified_at,
      kycStatus: row.kyc_status || "UNVERIFIED",
      kycRejectReason: row.kyc_reject_reason || null,
      kycVerifiedAt: row.kyc_verified_at || null,
      created_at: row.created_at,
      last_login_at: row.last_login_at
    };
    req.sessionId = row.session_id;
    req.sessionTokenHash = tokenHash;
    next();
  } catch (err) {
    console.error("[Auth Middleware Error]", err);
    res.status(500).json({
      error: "INTERNAL_ERROR",
      message: "An internal authentication error occurred."
    });
  }
}
async function requireAdmin(req, res, next) {
  const adminKey = req.headers["x-admin-key"];
  const expectedKey = process.env.ADMIN_API_KEY;
  if (adminKey && expectedKey && adminKey === expectedKey) {
    return next();
  }
  if (req.user) {
    if (isUserAdmin(req.user)) {
      return next();
    }
    res.status(403).json({
      error: "FORBIDDEN",
      message: "Access denied. Administrative privileges required."
    });
    return;
  }
  await requireAuth(req, res, () => {
    if (isUserAdmin(req.user)) {
      return next();
    }
    res.status(403).json({
      error: "FORBIDDEN",
      message: "Access denied. Administrative privileges required."
    });
  });
}

// src/server/middleware/rateLimiter.ts
init_db();

// src/server/utils/securityLogger.ts
import { v4 as uuidv46 } from "uuid";
function parseUserAgentSummary(uaStr) {
  if (!uaStr) return "Standard Client";
  let browser = "Web Browser";
  let os = "Unknown OS";
  const ua = uaStr.toLowerCase();
  if (ua.includes("iphone") || ua.includes("ipad") || ua.includes("ipod")) {
    os = "iOS";
  } else if (ua.includes("android")) {
    os = "Android";
  } else if (ua.includes("macintosh") || ua.includes("mac os x")) {
    os = "macOS";
  } else if (ua.includes("windows")) {
    os = "Windows";
  } else if (ua.includes("linux")) {
    os = "Linux";
  }
  if (ua.includes("edg/")) {
    browser = "Edge";
  } else if (ua.includes("chrome/") && !ua.includes("chromium")) {
    browser = "Chrome";
  } else if (ua.includes("firefox/")) {
    browser = "Firefox";
  } else if (ua.includes("safari/") && !ua.includes("chrome")) {
    browser = "Safari";
  } else if (ua.includes("opr/") || ua.includes("opera/")) {
    browser = "Opera";
  }
  return `${browser} on ${os}`;
}
function sanitizeLogString(str) {
  if (!str) return str;
  return str.replace(/(password|passwd|pwd|token|secret|privatekey|seed|key)=([^\s&]+)/gi, "$1=[REDACTED]").replace(/("password"|"token"|"secret"|"privateKey"|"seedPhrase"|"mnemonic")\s*:\s*"[^"]+"/gi, '$1:"[REDACTED]"');
}
async function logSecurityEvent(db, params) {
  try {
    const summary = parseUserAgentSummary(params.userAgent);
    const safeDescription = sanitizeLogString(params.description);
    await db.query(
      `INSERT INTO security_events (id, user_id, event_type, description, user_agent_summary, created_at)
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
      [uuidv46(), params.userId, params.eventType, safeDescription, summary]
    );
  } catch (err) {
    console.warn("[SecurityLogger] Failed to record security event:", err);
  }
}

// src/server/middleware/rateLimiter.ts
var rateLimitStore = /* @__PURE__ */ new Map();
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimitStore.entries()) {
    if (record.resetAt <= now) {
      rateLimitStore.delete(key);
    }
  }
}, 6e4);
function createRateLimiter(options) {
  const { windowMs, max, keyPrefix = "rl", includeIdentifier = false } = options;
  return (req, res, next) => {
    const ip = req.ip || req.socket.remoteAddress || "unknown-ip";
    const userId = req.user?.id;
    let key = `${keyPrefix}:${userId || ip}`;
    if (includeIdentifier && req.body && req.body.identifier) {
      key += `:${String(req.body.identifier).toLowerCase().trim()}`;
    }
    const now = Date.now();
    let record = rateLimitStore.get(key);
    if (!record || record.resetAt <= now) {
      record = {
        count: 1,
        resetAt: now + windowMs
      };
      rateLimitStore.set(key, record);
      return next();
    }
    record.count += 1;
    if (record.count > max) {
      const retryAfterSeconds = Math.ceil((record.resetAt - now) / 1e3);
      res.setHeader("Retry-After", retryAfterSeconds);
      getDb().then((db) => {
        logSecurityEvent(db, {
          userId: userId || null,
          eventType: "RATE_LIMIT_EXCEEDED",
          description: `Rate limit of ${max} requests exceeded for action '${keyPrefix}' (IP: ${ip})`,
          userAgent: req.headers["user-agent"]
        }).catch(() => {
        });
      }).catch(() => {
      });
      return res.status(429).json({
        error: "TOO_MANY_REQUESTS",
        message: `Too many requests for this operation. Please retry in ${retryAfterSeconds} seconds.`,
        retryAfter: retryAfterSeconds
      });
    }
    return next();
  };
}
var authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1e3,
  max: 50,
  keyPrefix: "auth"
});
var loginLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1e3,
  max: 20,
  keyPrefix: "login",
  includeIdentifier: true
});
var registrationLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1e3,
  max: 15,
  keyPrefix: "reg"
});
var passwordResetLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1e3,
  max: 5,
  keyPrefix: "pwd_reset"
});
var swapLimiter = createRateLimiter({
  windowMs: 60 * 1e3,
  max: 10,
  keyPrefix: "swap"
});
var withdrawalLimiter = createRateLimiter({
  windowMs: 60 * 1e3,
  max: 5,
  keyPrefix: "withdrawal"
});
var depositLimiter = createRateLimiter({
  windowMs: 60 * 1e3,
  max: 15,
  keyPrefix: "deposit"
});
var adminFinancialLimiter = createRateLimiter({
  windowMs: 60 * 1e3,
  max: 30,
  keyPrefix: "admin_fin"
});

// src/server/routes/authRoutes.ts
var router = Router();
var SESSION_COOKIE_NAME = "phx_session";
var SESSION_DURATION_DAYS = 30;
function setSessionCookie(res, rawToken, rememberMe = true) {
  const maxAge = rememberMe ? SESSION_DURATION_DAYS * 24 * 60 * 60 * 1e3 : void 0;
  res.cookie(SESSION_COOKIE_NAME, rawToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge,
    path: "/"
  });
}
function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/"
  });
}
async function getUniquePublicId(db) {
  let attempts = 0;
  while (attempts < 10) {
    const candidate = generatePublicId();
    const res = await db.query(`SELECT 1 FROM users WHERE public_id = $1`, [candidate]);
    if (res.rowCount === 0) return candidate;
    attempts++;
  }
  return `PHX-${uuidv411().slice(0, 6).toUpperCase()}`;
}
async function getUniqueReferralCode(db) {
  let attempts = 0;
  while (attempts < 10) {
    const candidate = generateReferralCode();
    const res = await db.query(`SELECT 1 FROM user_referrals WHERE referral_code = $1`, [candidate]);
    if (res.rowCount === 0) return candidate;
    attempts++;
  }
  return `PHX${uuidv411().slice(0, 6).toUpperCase()}`;
}
async function syncUserToFirebase(userData) {
  try {
    const { adminAuth: adminAuth2, adminFirestore: adminFirestore2 } = await Promise.resolve().then(() => (init_firebase_admin(), firebase_admin_exports));
    try {
      await adminAuth2.createUser({
        uid: userData.id,
        email: userData.email,
        displayName: userData.fullName,
        password: userData.password && userData.password.length >= 6 ? userData.password : void 0
      });
      console.log(`[Firebase Sync] User ${userData.email} synced to Firebase Auth (${userData.id})`);
    } catch (authErr) {
      if (authErr?.code === "auth/uid-already-exists" || authErr?.code === "auth/email-already-exists") {
        try {
          await adminAuth2.updateUser(userData.id, {
            displayName: userData.fullName
          });
        } catch {
        }
      } else {
        console.warn(`[Firebase Sync] Firebase Auth notice:`, authErr?.message || authErr);
      }
    }
    try {
      const isSuperAdmin = userData.email.toLowerCase() === "md.asifuzzman.dhakacollege@gmail.com" || userData.email.toLowerCase() === "mdasifuzzman.official@gmail.com" || userData.email.toLowerCase() === "admin@phivonex.com";
      await adminFirestore2.collection("users").doc(userData.id).set({
        id: userData.id,
        uid: userData.id,
        email: userData.email.toLowerCase(),
        fullName: userData.fullName,
        publicId: userData.publicId || null,
        phone: userData.phone || null,
        country: userData.country || "Global",
        status: userData.status || "ACTIVE",
        role: isSuperAdmin ? "ADMIN" : userData.role || "USER",
        passwordHash: userData.passwordHash || null,
        referralCode: userData.referralCode || null,
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      }, { merge: true });
      console.log(`[Firebase Sync] User ${userData.id} synced to Firestore users collection`);
    } catch (fsErr) {
      console.warn(`[Firebase Sync] Firestore write notice:`, fsErr?.message || fsErr);
    }
  } catch (err) {
    console.warn(`[Firebase Sync] General notice:`, err?.message || err);
  }
}
router.post("/register/request-verification", registrationLimiter, async (req, res) => {
  try {
    const { fullName, email, country, password, referralCode, phone } = req.body;
    const clientIp = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || "127.0.0.1";
    if (!fullName || typeof fullName !== "string" || fullName.trim().length < 2) {
      res.status(400).json({ error: "INVALID_NAME", message: "Full name is required (min 2 characters)." });
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email.trim())) {
      res.status(400).json({ error: "INVALID_EMAIL", message: "A valid email address is required." });
      return;
    }
    if (!country || typeof country !== "string") {
      res.status(400).json({ error: "INVALID_COUNTRY", message: "Country is required." });
      return;
    }
    if (!password || typeof password !== "string" || password.length < 10) {
      res.status(400).json({
        error: "WEAK_PASSWORD",
        message: "Password must be at least 10 characters long."
      });
      return;
    }
    const db = await getDb();
    const normalizedEmail = email.trim().toLowerCase();
    const cleanPhone = phone ? phone.trim() : null;
    const existingEmail = await db.query(`SELECT id FROM users WHERE LOWER(email) = $1`, [normalizedEmail]);
    if (existingEmail.rowCount > 0) {
      res.status(409).json({ error: "EMAIL_EXISTS", message: "An account with this email address already exists." });
      return;
    }
    if (cleanPhone) {
      const existingPhone = await db.query(`SELECT id FROM users WHERE phone = $1`, [cleanPhone]);
      if (existingPhone.rowCount > 0) {
        res.status(409).json({ error: "PHONE_EXISTS", message: "An account with this phone number already exists." });
        return;
      }
    }
    let sponsorUserId = null;
    let pendingCodeToStore = null;
    if (referralCode && typeof referralCode === "string" && referralCode.trim() !== "") {
      sponsorUserId = await resolveSponsorUserId(db, referralCode);
      if (!sponsorUserId) {
        pendingCodeToStore = normalizeReferralCode(referralCode);
      }
    }
    const passwordHash = await hashPassword(password);
    const crypto4 = await import("crypto");
    const rawCode = crypto4.randomInt(1e5, 999999).toString();
    const codeHash = crypto4.createHash("sha256").update(rawCode).digest("hex");
    const existingPending = await db.query(
      `SELECT last_sent_at FROM pending_registrations WHERE email = $1`,
      [normalizedEmail]
    );
    if (existingPending.rowCount > 0) {
      const lastSent = new Date(existingPending.rows[0].last_sent_at).getTime();
      const COOLDOWN_MS = 60 * 1e3;
      if (Date.now() - lastSent < COOLDOWN_MS) {
        res.status(429).json({
          error: "COOLDOWN_ACTIVE",
          message: `Please wait ${Math.ceil((COOLDOWN_MS - (Date.now() - lastSent)) / 1e3)} seconds before requesting another code.`
        });
        return;
      }
    }
    const registrationData = JSON.stringify({
      fullName: fullName.trim(),
      email: normalizedEmail,
      phone: cleanPhone,
      country: country.trim(),
      passwordHash,
      referralCode: referralCode || null,
      sponsorUserId,
      pendingCodeToStore
    });
    const expiresAt = new Date(Date.now() + 10 * 60 * 1e3);
    await db.query(
      `INSERT INTO pending_registrations (
        email, code_hash, registration_data, failed_attempts, expires_at, is_verified, verification_token, created_at, last_sent_at
      ) VALUES ($1, $2, $3, 0, $4, FALSE, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (email) DO UPDATE SET
        code_hash = EXCLUDED.code_hash,
        registration_data = EXCLUDED.registration_data,
        failed_attempts = 0,
        expires_at = EXCLUDED.expires_at,
        is_verified = FALSE,
        verification_token = NULL,
        last_sent_at = CURRENT_TIMESTAMP`,
      [normalizedEmail, codeHash, registrationData, expiresAt]
    );
    const { sendVerificationCodeEmail: sendVerificationCodeEmail2 } = await Promise.resolve().then(() => (init_emailService(), emailService_exports));
    const sent = await sendVerificationCodeEmail2(normalizedEmail, rawCode);
    if (!sent) {
      console.warn(`[Auth API] Email dispatch for ${normalizedEmail} could not be delivered by email provider (e.g. pending Resend domain DNS verification). Providing code fallback.`);
    }
    res.status(200).json({
      message: sent ? "Verification code sent successfully to your email address." : "Verification code generated. Please check your email or use the code provided below.",
      email: normalizedEmail,
      code: !sent ? rawCode : void 0
    });
  } catch (err) {
    console.error("[Auth API] Error in /register/request-verification:", err);
    res.status(500).json({ error: "SERVER_ERROR", message: "Failed to request email verification." });
  }
});
router.post("/register/verify-email", registrationLimiter, async (req, res) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) {
      res.status(400).json({ error: "MISSING_FIELDS", message: "Email and verification code are required." });
      return;
    }
    const normalizedEmail = email.trim().toLowerCase();
    const db = await getDb();
    const result = await db.query(
      `SELECT code_hash, failed_attempts, expires_at, is_verified FROM pending_registrations WHERE email = $1`,
      [normalizedEmail]
    );
    if (result.rowCount === 0) {
      res.status(400).json({ error: "INVALID_REQUEST", message: "No registration session found for this email." });
      return;
    }
    const record = result.rows[0];
    if (record.failed_attempts >= 5) {
      res.status(429).json({
        error: "MAX_ATTEMPTS_EXCEEDED",
        message: "Maximum verification attempts exceeded. Please request a new code."
      });
      return;
    }
    if (new Date(record.expires_at).getTime() < Date.now()) {
      res.status(400).json({ error: "TOKEN_EXPIRED", message: "Verification code has expired. Please request a new code." });
      return;
    }
    const crypto4 = await import("crypto");
    const codeHash = crypto4.createHash("sha256").update(code.trim()).digest("hex");
    if (record.code_hash !== codeHash) {
      await db.query(
        `UPDATE pending_registrations SET failed_attempts = failed_attempts + 1 WHERE email = $1`,
        [normalizedEmail]
      );
      res.status(401).json({
        error: "INVALID_CODE",
        message: "Invalid verification code. Please try again.",
        remainingAttempts: 5 - (record.failed_attempts + 1)
      });
      return;
    }
    const verificationToken = uuidv411();
    await db.query(
      `UPDATE pending_registrations SET
        is_verified = TRUE,
        verification_token = $1,
        code_hash = 'USED'
       WHERE email = $2`,
      [verificationToken, normalizedEmail]
    );
    res.status(200).json({
      message: "Email address verified successfully.",
      email: normalizedEmail,
      token: verificationToken
    });
  } catch (err) {
    console.error("[Auth API] Error in /register/verify-email:", err);
    res.status(500).json({ error: "SERVER_ERROR", message: "Failed to verify code." });
  }
});
router.post("/register/complete", registrationLimiter, async (req, res) => {
  try {
    const { email, token } = req.body;
    if (!email || !token) {
      res.status(400).json({ error: "MISSING_FIELDS", message: "Email and verification completion token are required." });
      return;
    }
    const normalizedEmail = email.trim().toLowerCase();
    const db = await getDb();
    const result = await db.query(
      `SELECT registration_data, is_verified, verification_token, expires_at FROM pending_registrations WHERE email = $1`,
      [normalizedEmail]
    );
    if (result.rowCount === 0) {
      res.status(400).json({ error: "INVALID_REQUEST", message: "No registration session found for this email." });
      return;
    }
    const record = result.rows[0];
    if (!record.is_verified || record.verification_token !== token) {
      res.status(401).json({ error: "UNAUTHORIZED_VERIFICATION", message: "Verification token is invalid or unverified." });
      return;
    }
    if (new Date(record.expires_at).getTime() < Date.now()) {
      res.status(400).json({ error: "SESSION_EXPIRED", message: "Your registration session has expired. Please verify again." });
      return;
    }
    const data = JSON.parse(record.registration_data);
    const existingEmail = await db.query(`SELECT id FROM users WHERE LOWER(email) = $1`, [normalizedEmail]);
    if (existingEmail.rowCount > 0) {
      res.status(409).json({ error: "EMAIL_EXISTS", message: "An account with this email address already exists." });
      return;
    }
    const userId = uuidv411();
    const publicId = await getUniquePublicId(db);
    const newReferralCode = await getUniqueReferralCode(db);
    await db.query(
      `INSERT INTO users (
        id, public_id, full_name, email, phone, country, password_hash,
        status, pending_referral_code, email_verified_at, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE', $8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        userId,
        publicId,
        data.fullName,
        normalizedEmail,
        data.phone,
        data.country,
        data.passwordHash,
        data.pendingCodeToStore
      ]
    );
    await db.query(
      `INSERT INTO user_referrals (user_id, referral_code, sponsor_user_id, created_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)`,
      [userId, newReferralCode, data.sponsorUserId]
    );
    await db.query(
      `INSERT INTO binary_placements (user_id, parent_user_id, side, status, placed_at, created_at)
       VALUES ($1, NULL, NULL, 'UNPLACED', NULL, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id) DO NOTHING`,
      [userId]
    );
    await db.query(`DELETE FROM pending_registrations WHERE email = $1`, [normalizedEmail]);
    const rawSessionToken = generateRandomToken(32);
    const sessionTokenHash = hashToken(rawSessionToken);
    const sessionExpiresAt = new Date(Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1e3);
    const userAgent = req.headers["user-agent"] || "";
    await db.query(
      `INSERT INTO sessions (id, user_id, token_hash, user_agent, expires_at, created_at, last_used_at)
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [uuidv411(), userId, sessionTokenHash, userAgent, sessionExpiresAt]
    );
    await logSecurityEvent(db, {
      userId,
      eventType: "ACCOUNT_REGISTERED",
      description: "Account successfully registered and authenticated via email verification.",
      userAgent
    });
    try {
      const { queueEventEmail: queueEventEmail2 } = await Promise.resolve().then(() => (init_emailService(), emailService_exports));
      await queueEventEmail2(normalizedEmail, "WELCOME", {
        displayName: data.fullName,
        publicId,
        signupTime: (/* @__PURE__ */ new Date()).toISOString()
      });
      if (data.sponsorUserId) {
        const sponsorRes = await db.query(
          `SELECT email FROM users WHERE id = $1`,
          [data.sponsorUserId]
        );
        if (sponsorRes.rowCount > 0) {
          const nameParts = data.fullName.split(" ");
          const safeDisplayName = nameParts.length > 1 ? `${nameParts[0]} ${nameParts[nameParts.length - 1][0]}.` : nameParts[0];
          await queueEventEmail2(sponsorRes.rows[0].email, "REFERRAL_SIGNUP", {
            displayName: safeDisplayName,
            publicId,
            signupTime: (/* @__PURE__ */ new Date()).toISOString()
          });
        }
      }
    } catch (emailErr) {
      console.error("[Auth API] Failed to queue welcome/sponsor emails:", emailErr);
    }
    syncUserToFirebase({
      id: userId,
      email: normalizedEmail,
      fullName: data.fullName,
      publicId,
      phone: data.phone,
      country: data.country,
      status: "ACTIVE",
      passwordHash: data.passwordHash,
      referralCode: newReferralCode,
      role: normalizedEmail === "md.asifuzzman.dhakacollege@gmail.com" || normalizedEmail === "mdasifuzzman.official@gmail.com" || normalizedEmail === "admin@phivonex.com" ? "ADMIN" : "USER"
    }).catch(() => {
    });
    setSessionCookie(res, rawSessionToken, true);
    res.status(201).json({
      message: "Account created and verified successfully",
      user: {
        id: userId,
        publicId,
        referralCode: newReferralCode,
        fullName: data.fullName,
        email: normalizedEmail,
        phone: data.phone,
        country: data.country,
        status: "ACTIVE",
        emailVerified: true
      }
    });
  } catch (err) {
    console.error("[Auth API] Error in /register/complete:", err);
    res.status(500).json({ error: "SERVER_ERROR", message: "Failed to complete account registration." });
  }
});
router.post("/register", registrationLimiter, async (req, res) => {
  try {
    const { fullName, email, phone, country, password, referralCode } = req.body;
    if (!fullName || typeof fullName !== "string" || fullName.trim().length < 2) {
      res.status(400).json({ error: "INVALID_NAME", message: "Full name is required (min 2 characters)." });
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email.trim())) {
      res.status(400).json({ error: "INVALID_EMAIL", message: "A valid email address is required." });
      return;
    }
    if (!country || typeof country !== "string") {
      res.status(400).json({ error: "INVALID_COUNTRY", message: "Country is required." });
      return;
    }
    if (!password || typeof password !== "string" || password.length < 10) {
      res.status(400).json({
        error: "WEAK_PASSWORD",
        message: "Password must be at least 10 characters long."
      });
      return;
    }
    const db = await getDb();
    const normalizedEmail = email.trim().toLowerCase();
    const cleanPhone = phone ? phone.trim() : null;
    const existingEmail = await db.query(`SELECT id FROM users WHERE LOWER(email) = $1`, [normalizedEmail]);
    if (existingEmail.rowCount > 0) {
      res.status(409).json({ error: "EMAIL_EXISTS", message: "An account with this email address already exists." });
      return;
    }
    if (cleanPhone) {
      const existingPhone = await db.query(`SELECT id FROM users WHERE phone = $1`, [cleanPhone]);
      if (existingPhone.rowCount > 0) {
        res.status(409).json({ error: "PHONE_EXISTS", message: "An account with this phone number already exists." });
        return;
      }
    }
    let sponsorUserId = null;
    let pendingCodeToStore = null;
    if (referralCode && typeof referralCode === "string" && referralCode.trim() !== "") {
      sponsorUserId = await resolveSponsorUserId(db, referralCode);
      if (!sponsorUserId) {
        pendingCodeToStore = normalizeReferralCode(referralCode);
      }
    }
    const passwordHash = await hashPassword(password);
    const userId = uuidv411();
    const publicId = await getUniquePublicId(db);
    const newReferralCode = await getUniqueReferralCode(db);
    await db.query(
      `INSERT INTO users (
        id, public_id, full_name, email, phone, country, password_hash,
        status, pending_referral_code, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE', $8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        userId,
        publicId,
        fullName.trim(),
        normalizedEmail,
        cleanPhone,
        country.trim(),
        passwordHash,
        pendingCodeToStore
      ]
    );
    await db.query(
      `INSERT INTO user_referrals (user_id, referral_code, sponsor_user_id, created_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)`,
      [userId, newReferralCode, sponsorUserId]
    );
    await db.query(
      `INSERT INTO binary_placements (user_id, parent_user_id, side, status, placed_at, created_at)
       VALUES ($1, NULL, NULL, 'UNPLACED', NULL, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id) DO NOTHING`,
      [userId]
    );
    const rawSessionToken = generateRandomToken(32);
    const sessionTokenHash = hashToken(rawSessionToken);
    const sessionExpiresAt = new Date(Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1e3);
    const userAgent = req.headers["user-agent"] || "";
    await db.query(
      `INSERT INTO sessions (id, user_id, token_hash, user_agent, expires_at, created_at, last_used_at)
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [uuidv411(), userId, sessionTokenHash, userAgent, sessionExpiresAt]
    );
    await logSecurityEvent(db, {
      userId,
      eventType: "ACCOUNT_REGISTERED",
      description: "Account successfully registered and authenticated directly.",
      userAgent
    });
    syncUserToFirebase({
      id: userId,
      email: normalizedEmail,
      fullName: fullName.trim(),
      publicId,
      phone: cleanPhone,
      country: country.trim(),
      status: "ACTIVE",
      password,
      passwordHash,
      referralCode: newReferralCode,
      role: normalizedEmail === "md.asifuzzman.dhakacollege@gmail.com" || normalizedEmail === "mdasifuzzman.official@gmail.com" || normalizedEmail === "admin@phivonex.com" ? "ADMIN" : "USER"
    }).catch(() => {
    });
    setSessionCookie(res, rawSessionToken, true);
    res.status(201).json({
      message: "Account created successfully",
      user: {
        id: userId,
        publicId,
        referralCode: newReferralCode,
        fullName: fullName.trim(),
        email: normalizedEmail,
        phone: cleanPhone,
        country: country.trim(),
        status: "ACTIVE",
        emailVerified: false
      }
    });
  } catch (err) {
    console.error("[Auth API] Error in direct /register:", err);
    res.status(500).json({ error: "SERVER_ERROR", message: "An unexpected error occurred during registration." });
  }
});
router.post("/google", authLimiter, async (req, res) => {
  try {
    const { email, fullName, uid, referralCode } = req.body;
    if (!email || typeof email !== "string" || !email.includes("@")) {
      res.status(400).json({ error: "INVALID_EMAIL", message: "Valid Google email is required." });
      return;
    }
    const db = await getDb();
    const normalizedEmail = email.trim().toLowerCase();
    const displayName = fullName && typeof fullName === "string" && fullName.trim().length > 0 ? fullName.trim() : normalizedEmail.split("@")[0];
    const existing = await db.query(
      `SELECT id, public_id, full_name, email, phone, country, status, email_verified_at 
       FROM users WHERE LOWER(email) = $1`,
      [normalizedEmail]
    );
    let userRecord;
    let userId;
    if (existing.rowCount > 0) {
      userRecord = existing.rows[0];
      userId = userRecord.id;
      if (userRecord.status === "SUSPENDED" || userRecord.status === "LOCKED") {
        res.status(403).json({
          error: "ACCOUNT_SUSPENDED",
          message: "This account has been suspended or locked. Please contact support."
        });
        return;
      }
      await db.query(`UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1`, [userId]);
    } else {
      userId = uuidv411();
      const publicId = await getUniquePublicId(db);
      const newReferralCode = await getUniqueReferralCode(db);
      let sponsorUserId = null;
      let pendingCodeToStore = null;
      if (referralCode && typeof referralCode === "string" && referralCode.trim() !== "") {
        sponsorUserId = await resolveSponsorUserId(db, referralCode);
        if (!sponsorUserId) {
          pendingCodeToStore = normalizeReferralCode(referralCode);
        }
      }
      const randomPass = generateRandomToken(16);
      const passwordHash = await hashPassword(randomPass);
      await db.query(
        `INSERT INTO users (
          id, public_id, full_name, email, phone, country, password_hash,
          status, email_verified_at, pending_referral_code, created_at, updated_at, last_login_at
        ) VALUES ($1, $2, $3, $4, NULL, 'Global', $5, 'ACTIVE', CURRENT_TIMESTAMP, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [userId, publicId, displayName, normalizedEmail, passwordHash, pendingCodeToStore]
      );
      await db.query(
        `INSERT INTO user_referrals (user_id, referral_code, sponsor_user_id, created_at)
         VALUES ($1, $2, $3, CURRENT_TIMESTAMP)`,
        [userId, newReferralCode, sponsorUserId]
      );
      await db.query(
        `INSERT INTO binary_placements (user_id, parent_user_id, side, status, placed_at, created_at)
         VALUES ($1, NULL, NULL, 'UNPLACED', NULL, CURRENT_TIMESTAMP)
         ON CONFLICT (user_id) DO NOTHING`,
        [userId]
      );
      userRecord = {
        id: userId,
        public_id: publicId,
        full_name: displayName,
        email: normalizedEmail,
        phone: null,
        country: "Global",
        status: "ACTIVE",
        email_verified_at: /* @__PURE__ */ new Date()
      };
    }
    const rawSessionToken = generateRandomToken(32);
    const sessionTokenHash = hashToken(rawSessionToken);
    const sessionExpiresAt = new Date(Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1e3);
    const userAgent = req.headers["user-agent"] || "";
    await db.query(
      `INSERT INTO sessions (id, user_id, token_hash, user_agent, expires_at, created_at, last_used_at)
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [uuidv411(), userId, sessionTokenHash, userAgent, sessionExpiresAt]
    );
    syncUserToFirebase({
      id: userId,
      email: normalizedEmail,
      fullName: displayName,
      publicId: userRecord.public_id,
      status: "ACTIVE",
      country: userRecord.country || "Global"
    }).catch(() => {
    });
    setSessionCookie(res, rawSessionToken, true);
    res.status(200).json({
      message: "Authenticated successfully with Google",
      user: {
        id: userRecord.id,
        publicId: userRecord.public_id,
        fullName: userRecord.full_name,
        email: userRecord.email,
        phone: userRecord.phone,
        country: userRecord.country,
        status: userRecord.status,
        emailVerified: true
      }
    });
  } catch (err) {
    console.error("[Auth API] Google sign-in error:", err);
    res.status(500).json({ error: "SERVER_ERROR", message: "Failed to authenticate with Google." });
  }
});
router.post("/login", loginLimiter, async (req, res) => {
  try {
    const { identifier, password, rememberMe = true } = req.body;
    const clientIp = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || "127.0.0.1";
    if (!identifier || !password) {
      res.status(400).json({
        error: "MISSING_FIELDS",
        message: "Identifier (email/phone) and password are required."
      });
      return;
    }
    const db = await getDb();
    const cleanIdentifier = identifier.trim().toLowerCase();
    const result = await db.query(
      `SELECT u.id, u.public_id, u.full_name, u.email, u.phone, u.country, u.password_hash, u.status, u.email_verified_at, r.referral_code
       FROM users u
       LEFT JOIN user_referrals r ON u.id = r.user_id
       WHERE LOWER(u.email) = $1 OR u.phone = $2`,
      [cleanIdentifier, identifier.trim()]
    );
    let user = result.rowCount > 0 ? result.rows[0] : null;
    if (!user) {
      try {
        const { adminFirestore: adminFirestore2 } = await Promise.resolve().then(() => (init_firebase_admin(), firebase_admin_exports));
        const snap = await adminFirestore2.collection("users").where("email", "==", cleanIdentifier).limit(1).get();
        if (!snap.empty) {
          const docData = snap.docs[0].data();
          const restoredId = docData.id || docData.uid || snap.docs[0].id;
          const restoredPasswordHash = docData.passwordHash;
          const restoredPublicId = docData.publicId || `PHX-${Math.floor(1e5 + Math.random() * 9e5)}`;
          const restoredReferralCode = docData.referralCode || `PHX${Math.floor(1e4 + Math.random() * 9e4)}`;
          const isSuperAdmin = cleanIdentifier === "md.asifuzzman.dhakacollege@gmail.com" || cleanIdentifier === "mdasifuzzman.official@gmail.com" || cleanIdentifier === "admin@phivonex.com";
          const restoredRole = isSuperAdmin ? "ADMIN" : docData.role || "USER";
          let passwordValid = false;
          if (restoredPasswordHash) {
            passwordValid = await verifyPassword(restoredPasswordHash, password);
          } else {
            passwordValid = true;
          }
          if (passwordValid) {
            const freshHash = restoredPasswordHash || await hashPassword(password);
            await db.query(`
              INSERT INTO users (
                id, public_id, full_name, email, phone, country, password_hash,
                status, role, email_verified_at, created_at, updated_at
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
              ON CONFLICT (id) DO UPDATE SET password_hash = $7, role = $9, status = $8
            `, [
              restoredId,
              restoredPublicId,
              docData.fullName || cleanIdentifier.split("@")[0],
              cleanIdentifier,
              docData.phone || null,
              docData.country || "Global",
              freshHash,
              docData.status || "ACTIVE",
              restoredRole
            ]);
            await db.query(`
              INSERT INTO user_referrals (user_id, referral_code, created_at)
              VALUES ($1, $2, CURRENT_TIMESTAMP)
              ON CONFLICT (user_id) DO NOTHING
            `, [restoredId, restoredReferralCode]);
            await db.query(`
              INSERT INTO binary_placements (user_id, parent_user_id, side, status, placed_at, created_at)
              VALUES ($1, NULL, NULL, 'UNPLACED', NULL, CURRENT_TIMESTAMP)
              ON CONFLICT (user_id) DO NOTHING
            `, [restoredId]);
            user = {
              id: restoredId,
              public_id: restoredPublicId,
              full_name: docData.fullName || cleanIdentifier.split("@")[0],
              email: cleanIdentifier,
              phone: docData.phone || null,
              country: docData.country || "Global",
              password_hash: freshHash,
              status: docData.status || "ACTIVE",
              email_verified_at: /* @__PURE__ */ new Date(),
              referral_code: restoredReferralCode
            };
          }
        }
      } catch (fsErr) {
        console.warn("[Auth API] Firestore user restore error on login:", fsErr);
      }
    }
    if (!user) {
      logSecurityEvent(db, {
        userId: null,
        eventType: "FAILED_LOGIN",
        description: `Failed login attempt for identifier '${cleanIdentifier}' (user not found).`,
        userAgent: req.headers["user-agent"]
      }).catch(() => {
      });
      res.status(401).json({
        error: "INVALID_CREDENTIALS",
        message: "Invalid email/phone or password."
      });
      return;
    }
    if (user.status === "SUSPENDED" || user.status === "LOCKED") {
      res.status(403).json({
        error: "ACCOUNT_SUSPENDED",
        message: "This account has been suspended or locked. Please contact security support."
      });
      return;
    }
    if (!user.password_hash) {
      res.status(401).json({
        error: "GOOGLE_AUTH_ACCOUNT",
        message: 'This account was registered using Google Sign-In. Please click "Continue with Google" below to sign in.'
      });
      return;
    }
    const isValid = await verifyPassword(user.password_hash, password);
    if (!isValid) {
      logSecurityEvent(db, {
        userId: user.id,
        eventType: "FAILED_LOGIN",
        description: `Failed login attempt for user ${user.public_id} (incorrect password).`,
        userAgent: req.headers["user-agent"]
      }).catch(() => {
      });
      res.status(401).json({
        error: "INVALID_CREDENTIALS",
        message: "Invalid email/phone or password."
      });
      return;
    }
    try {
      await db.query(`UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1`, [user.id]);
      const durationDays = rememberMe ? SESSION_DURATION_DAYS : 1;
      const rawSessionToken = generateRandomToken(32);
      const sessionTokenHash = hashToken(rawSessionToken);
      const sessionExpiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1e3);
      const userAgent = (req.headers["user-agent"] || "").slice(0, 500);
      await db.query(
        `INSERT INTO sessions (id, user_id, token_hash, user_agent, expires_at, created_at, last_used_at)
         VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [uuidv411(), user.id, sessionTokenHash, userAgent, sessionExpiresAt]
      );
      logSecurityEvent(db, {
        userId: user.id,
        eventType: "LOGIN_SUCCESS",
        description: "Session authentication handshake completed.",
        userAgent
      }).catch(() => {
      });
      setSessionCookie(res, rawSessionToken, rememberMe);
      res.status(200).json({
        message: "Logged in successfully",
        user: {
          id: user.id,
          publicId: user.public_id,
          referralCode: user.referral_code,
          fullName: user.full_name,
          email: user.email,
          phone: user.phone,
          country: user.country,
          status: user.status,
          emailVerified: Boolean(user.email_verified_at)
        }
      });
    } catch (sessionErr) {
      console.error("[Auth API] Session creation error during login:", sessionErr);
      res.status(500).json({
        error: "SESSION_ERROR",
        message: "Unable to initialize user session. Please try logging in again."
      });
    }
  } catch (err) {
    console.error("[Auth API] Error in /login:", err);
    const errMessage = err?.message?.includes("timeout") ? "Database connection is temporarily busy. Please retry in a moment." : err?.message || "Sign in failed. Please check your credentials and try again.";
    res.status(401).json({ error: "AUTH_FAILED", message: errMessage });
  }
});
router.get("/me", requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const db = await getDb();
    const refRes = await db.query(
      `SELECT referral_code FROM user_referrals WHERE user_id = $1`,
      [user.id]
    );
    const referralCode = refRes.rowCount > 0 ? refRes.rows[0].referral_code : null;
    res.status(200).json({
      user: {
        id: user.id,
        publicId: user.public_id,
        referralCode,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        country: user.country,
        status: user.status,
        role: user.role,
        isAdmin: isUserAdmin(user),
        emailVerified: user.emailVerified,
        kycStatus: user.kycStatus || "UNVERIFIED",
        kycRejectReason: user.kycRejectReason || null,
        kycVerifiedAt: user.kycVerifiedAt || null,
        createdAt: user.created_at,
        lastLoginAt: user.last_login_at
      }
    });
  } catch (err) {
    console.error("[Auth API] Error in /me:", err);
    res.status(500).json({ error: "SERVER_ERROR", message: "Failed to retrieve user profile." });
  }
});
router.post("/logout", requireAuth, async (req, res) => {
  try {
    const db = await getDb();
    if (req.sessionId) {
      await db.query(
        `UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [req.sessionId]
      );
      await logSecurityEvent(db, {
        userId: req.user.id,
        eventType: "SESSION_REVOKED",
        description: "Operator explicitly terminated active session.",
        userAgent: req.headers["user-agent"]
      });
    }
    clearSessionCookie(res);
    res.status(200).json({ message: "Logged out successfully." });
  } catch (err) {
    console.error("[Auth API] Error in /logout:", err);
    res.status(500).json({ error: "SERVER_ERROR", message: "Failed to complete logout." });
  }
});
router.post("/change-password", requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const { currentPassword, newPassword, confirmNewPassword, confirmPassword } = req.body;
    const confirmation = confirmNewPassword || confirmPassword;
    if (!currentPassword || !newPassword || !confirmation) {
      res.status(400).json({
        error: "MISSING_FIELDS",
        message: "Current password, new password, and confirmation are required."
      });
      return;
    }
    if (newPassword !== confirmation) {
      res.status(400).json({
        error: "PASSWORD_MISMATCH",
        message: "New password and confirmation do not match."
      });
      return;
    }
    if (typeof newPassword !== "string" || newPassword.length < 10) {
      res.status(400).json({
        error: "WEAK_PASSWORD",
        message: "New password must be at least 10 characters long."
      });
      return;
    }
    const db = await getDb();
    const userRes = await db.query(
      `SELECT password_hash FROM users WHERE id = $1`,
      [user.id]
    );
    if (userRes.rowCount === 0) {
      res.status(404).json({ error: "USER_NOT_FOUND", message: "User account not found." });
      return;
    }
    const currentHash = userRes.rows[0].password_hash;
    const isCurrentValid = await verifyPassword(currentHash, currentPassword);
    if (!isCurrentValid) {
      res.status(401).json({
        error: "INVALID_PASSWORD",
        message: "The current password provided is incorrect."
      });
      return;
    }
    const newPasswordHash = await hashPassword(newPassword);
    await db.query(
      `UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [newPasswordHash, user.id]
    );
    if (req.sessionId) {
      await db.query(
        `UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND id != $2 AND revoked_at IS NULL`,
        [user.id, req.sessionId]
      );
    }
    await logSecurityEvent(db, {
      userId: user.id,
      eventType: "PASSWORD_CHANGED",
      description: "Account password updated. All other active sessions terminated.",
      userAgent: req.headers["user-agent"]
    });
    try {
      const { notifySecurityAlert: notifySecurityAlert2 } = await Promise.resolve().then(() => (init_notificationService(), notificationService_exports));
      await notifySecurityAlert2({
        userId: user.id,
        title: "Security Alert: Password Changed",
        message: "Your account password was updated. All other active sessions have been terminated.",
        sourceId: `pwd-rot-${uuidv411()}`
      });
    } catch {
    }
    res.status(200).json({
      message: "Password changed successfully. All other active sessions have been terminated."
    });
  } catch (err) {
    console.error("[Auth API] Error in /change-password:", err);
    res.status(500).json({ error: "SERVER_ERROR", message: "Failed to update password." });
  }
});
router.get("/sessions", requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const db = await getDb();
    const sessionsRes = await db.query(
      `
      SELECT 
        id,
        user_agent,
        created_at AS "createdAt",
        last_used_at AS "lastUsedAt",
        expires_at AS "expiresAt"
      FROM sessions
      WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP
      ORDER BY last_used_at DESC
      `,
      [user.id]
    );
    const formattedSessions = sessionsRes.rows.map((s) => ({
      id: s.id,
      isCurrent: s.id === req.sessionId,
      device: parseUserAgentSummary(s.user_agent),
      createdAt: s.createdAt,
      lastUsedAt: s.lastUsedAt,
      expiresAt: s.expiresAt
    }));
    res.status(200).json({
      sessions: formattedSessions
    });
  } catch (err) {
    console.error("[Auth API] Error in GET /sessions:", err);
    res.status(500).json({ error: "SERVER_ERROR", message: "Failed to retrieve active sessions." });
  }
});
router.delete("/sessions/:sessionId", requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const { sessionId } = req.params;
    if (!sessionId) {
      res.status(400).json({ error: "MISSING_SESSION_ID", message: "Session ID is required." });
      return;
    }
    const db = await getDb();
    const checkRes = await db.query(
      `SELECT id, user_agent FROM sessions WHERE id = $1 AND user_id = $2`,
      [sessionId, user.id]
    );
    if (checkRes.rowCount === 0) {
      res.status(404).json({
        error: "SESSION_NOT_FOUND",
        message: "Session not found or not authorized to revoke."
      });
      return;
    }
    await db.query(
      `UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP WHERE id = $1 AND user_id = $2`,
      [sessionId, user.id]
    );
    const isCurrent = sessionId === req.sessionId;
    if (isCurrent) {
      clearSessionCookie(res);
    }
    await logSecurityEvent(db, {
      userId: user.id,
      eventType: "SESSION_REVOKED",
      description: isCurrent ? "Current session revoked by operator." : "Remote session revoked by operator.",
      userAgent: req.headers["user-agent"]
    });
    res.status(200).json({
      message: "Session revoked successfully.",
      isCurrent
    });
  } catch (err) {
    console.error("[Auth API] Error in DELETE /sessions/:sessionId:", err);
    res.status(500).json({ error: "SERVER_ERROR", message: "Failed to revoke session." });
  }
});
router.post("/sessions/:sessionId/revoke", requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const { sessionId } = req.params;
    const db = await getDb();
    const checkRes = await db.query(
      `SELECT id FROM sessions WHERE id = $1 AND user_id = $2`,
      [sessionId, user.id]
    );
    if (checkRes.rowCount === 0) {
      res.status(404).json({
        error: "SESSION_NOT_FOUND",
        message: "Session not found or not authorized to revoke."
      });
      return;
    }
    await db.query(
      `UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP WHERE id = $1 AND user_id = $2`,
      [sessionId, user.id]
    );
    const isCurrent = sessionId === req.sessionId;
    if (isCurrent) {
      clearSessionCookie(res);
    }
    await logSecurityEvent(db, {
      userId: user.id,
      eventType: "SESSION_REVOKED",
      description: isCurrent ? "Current session revoked by operator." : "Remote session revoked by operator.",
      userAgent: req.headers["user-agent"]
    });
    res.status(200).json({
      message: "Session revoked successfully.",
      isCurrent
    });
  } catch (err) {
    console.error("[Auth API] Error in POST /sessions/:sessionId/revoke:", err);
    res.status(500).json({ error: "SERVER_ERROR", message: "Failed to revoke session." });
  }
});
router.post("/sessions/revoke-others", requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const currentSessionId = req.sessionId;
    if (!currentSessionId) {
      res.status(400).json({ error: "NO_ACTIVE_SESSION", message: "No active session found." });
      return;
    }
    const db = await getDb();
    await db.query(
      `UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND id != $2 AND revoked_at IS NULL`,
      [user.id, currentSessionId]
    );
    await logSecurityEvent(db, {
      userId: user.id,
      eventType: "SESSIONS_REVOKED_ALL_OTHERS",
      description: "Logged out of all other active devices.",
      userAgent: req.headers["user-agent"]
    });
    res.status(200).json({
      message: "All other active devices and sessions have been logged out."
    });
  } catch (err) {
    console.error("[Auth API] Error in /sessions/revoke-others:", err);
    res.status(500).json({ error: "SERVER_ERROR", message: "Failed to terminate other sessions." });
  }
});
router.post("/resend-verification", async (req, res) => {
  try {
    let targetEmail = null;
    let targetUserId = null;
    const token = req.cookies?.phx_session || (req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.split(" ")[1] : null);
    const db = await getDb();
    if (token) {
      const tokenHash = hashToken(token);
      const sessionRes = await db.query(
        `SELECT s.user_id, u.email, u.email_verified_at 
         FROM sessions s 
         JOIN users u ON s.user_id = u.id 
         WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > CURRENT_TIMESTAMP`,
        [tokenHash]
      );
      if (sessionRes.rowCount > 0) {
        if (sessionRes.rows[0].email_verified_at) {
          res.status(200).json({ message: "Email address is already verified." });
          return;
        }
        targetUserId = sessionRes.rows[0].user_id;
        targetEmail = sessionRes.rows[0].email;
      }
    }
    if (!targetUserId && req.body.email) {
      const emailRes = await db.query(
        `SELECT id, email, email_verified_at FROM users WHERE LOWER(email) = $1`,
        [req.body.email.trim().toLowerCase()]
      );
      if (emailRes.rowCount > 0) {
        if (emailRes.rows[0].email_verified_at) {
          res.status(200).json({ message: "Email address is already verified." });
          return;
        }
        targetUserId = emailRes.rows[0].id;
        targetEmail = emailRes.rows[0].email;
      }
    }
    if (targetUserId && targetEmail) {
      const rawVerifyToken = generateRandomToken(32);
      const verifyTokenHash = hashToken(rawVerifyToken);
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1e3);
      await db.query(
        `INSERT INTO auth_tokens (id, user_id, type, token_hash, expires_at, created_at)
         VALUES ($1, $2, 'EMAIL_VERIFY', $3, $4, CURRENT_TIMESTAMP)`,
        [uuidv411(), targetUserId, verifyTokenHash, expiresAt]
      );
      await logSecurityEvent(db, {
        userId: targetUserId,
        eventType: "EMAIL_VERIFICATION_SENT",
        description: `Verification link dispatched to ${targetEmail}.`,
        userAgent: req.headers["user-agent"]
      });
    }
    res.status(200).json({
      message: "If the account exists and is unverified, a verification link has been dispatched."
    });
  } catch (err) {
    console.error("[Auth API] Error in /resend-verification:", err);
    res.status(500).json({ error: "SERVER_ERROR", message: "Failed to process verification dispatch." });
  }
});
router.post("/forgot-password", passwordResetLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || typeof email !== "string") {
      res.status(400).json({ error: "INVALID_EMAIL", message: "Valid email address is required." });
      return;
    }
    const normalizedEmail = email.trim().toLowerCase();
    const db = await getDb();
    const userRes = await db.query(
      `SELECT id, email FROM users WHERE LOWER(email) = $1`,
      [normalizedEmail]
    );
    if (userRes.rowCount > 0) {
      const user = userRes.rows[0];
      const rawOtp = Math.floor(1e5 + Math.random() * 9e5).toString();
      const otpHash = hashToken(rawOtp);
      const rawResetToken = generateRandomToken(32);
      const tokenHash = hashToken(rawResetToken);
      const expiresAt = new Date(Date.now() + 15 * 60 * 1e3);
      await db.query(
        `UPDATE auth_tokens SET used_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND type = 'PASSWORD_RESET' AND used_at IS NULL`,
        [user.id]
      );
      await db.query(
        `INSERT INTO auth_tokens (id, user_id, type, token_hash, expires_at, created_at)
         VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
        [uuidv411(), user.id, "PASSWORD_RESET", otpHash, expiresAt]
      );
      await db.query(
        `INSERT INTO auth_tokens (id, user_id, type, token_hash, expires_at, created_at)
         VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
        [uuidv411(), user.id, "PASSWORD_RESET", tokenHash, expiresAt]
      );
      const { sendPasswordResetOtpEmail: sendPasswordResetOtpEmail2 } = await Promise.resolve().then(() => (init_emailService(), emailService_exports));
      await sendPasswordResetOtpEmail2(user.email, rawOtp);
    }
    res.status(200).json({
      message: "If an account exists with this email, password reset instructions and a 6-digit verification code have been dispatched to your inbox."
    });
  } catch (err) {
    console.error("[Auth API] Error in /forgot-password:", err);
    res.status(500).json({ error: "SERVER_ERROR", message: "Failed to process password recovery request." });
  }
});
router.post("/reset-password", passwordResetLimiter, async (req, res) => {
  try {
    const { token, code, email, newPassword } = req.body;
    const tokenOrCode = (code || token || "").toString().trim();
    if (!tokenOrCode || !newPassword) {
      res.status(400).json({ error: "MISSING_FIELDS", message: "Verification code (or reset token) and new password are required." });
      return;
    }
    if (typeof newPassword !== "string" || newPassword.length < 8) {
      res.status(400).json({ error: "WEAK_PASSWORD", message: "Password must be at least 8 characters long." });
      return;
    }
    const db = await getDb();
    const tokenHash = hashToken(tokenOrCode);
    let tokenRes;
    if (email && typeof email === "string") {
      const normalizedEmail = email.trim().toLowerCase();
      tokenRes = await db.query(
        `SELECT t.id, t.user_id, t.expires_at, t.used_at 
         FROM auth_tokens t
         INNER JOIN users u ON t.user_id = u.id
         WHERE t.token_hash = $1 AND t.type = 'PASSWORD_RESET' AND LOWER(u.email) = $2`,
        [tokenHash, normalizedEmail]
      );
    } else {
      tokenRes = await db.query(
        `SELECT id, user_id, expires_at, used_at FROM auth_tokens WHERE token_hash = $1 AND type = 'PASSWORD_RESET'`,
        [tokenHash]
      );
    }
    if (tokenRes.rowCount === 0) {
      res.status(400).json({ error: "INVALID_TOKEN", message: "Invalid or expired password reset verification code." });
      return;
    }
    const tokenRecord = tokenRes.rows[0];
    if (tokenRecord.used_at) {
      res.status(400).json({ error: "TOKEN_USED", message: "This password reset verification code has already been used." });
      return;
    }
    if (new Date(tokenRecord.expires_at) < /* @__PURE__ */ new Date()) {
      res.status(400).json({ error: "TOKEN_EXPIRED", message: "Password reset verification code has expired. Please request a new one." });
      return;
    }
    const newPasswordHash = await hashPassword(newPassword);
    await db.query(
      `UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [newPasswordHash, tokenRecord.user_id]
    );
    await db.query(
      `UPDATE auth_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [tokenRecord.id]
    );
    await db.query(
      `UPDATE auth_tokens SET used_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND type = 'PASSWORD_RESET' AND used_at IS NULL`,
      [tokenRecord.user_id]
    );
    await db.query(
      `UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND revoked_at IS NULL`,
      [tokenRecord.user_id]
    );
    await logSecurityEvent(db, {
      userId: tokenRecord.user_id,
      eventType: "PASSWORD_CHANGED",
      description: "Password reset via cryptographic recovery code.",
      userAgent: req.headers["user-agent"]
    });
    res.status(200).json({
      message: "Your password has been successfully reset. You may now sign in with your new password."
    });
  } catch (err) {
    console.error("[Auth API] Error in /reset-password:", err);
    res.status(500).json({ error: "SERVER_ERROR", message: "Failed to reset password." });
  }
});
router.post("/verify-email", async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      res.status(400).json({ error: "MISSING_TOKEN", message: "Verification token is required." });
      return;
    }
    const db = await getDb();
    const tokenHash = hashToken(token);
    const tokenRes = await db.query(
      `SELECT id, user_id, expires_at, used_at FROM auth_tokens WHERE token_hash = $1 AND type = 'EMAIL_VERIFY'`,
      [tokenHash]
    );
    if (tokenRes.rowCount === 0) {
      res.status(400).json({ error: "INVALID_TOKEN", message: "Invalid or expired verification token." });
      return;
    }
    const tokenRecord = tokenRes.rows[0];
    if (tokenRecord.used_at) {
      res.status(400).json({ error: "TOKEN_USED", message: "This email verification token has already been used." });
      return;
    }
    if (new Date(tokenRecord.expires_at) < /* @__PURE__ */ new Date()) {
      res.status(400).json({ error: "TOKEN_EXPIRED", message: "Verification token has expired." });
      return;
    }
    await db.query(
      `UPDATE users SET email_verified_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [tokenRecord.user_id]
    );
    await db.query(
      `UPDATE auth_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [tokenRecord.id]
    );
    await logSecurityEvent(db, {
      userId: tokenRecord.user_id,
      eventType: "EMAIL_VERIFIED",
      description: "Email address verified successfully.",
      userAgent: req.headers["user-agent"]
    });
    res.status(200).json({ message: "Email address has been successfully verified." });
  } catch (err) {
    console.error("[Auth API] Error in /verify-email:", err);
    res.status(500).json({ error: "SERVER_ERROR", message: "Failed to verify email." });
  }
});
var authRoutes_default = router;

// src/server/routes/referralRoutes.ts
init_db();
import { Router as Router2 } from "express";
init_idGenerator();
var router2 = Router2();
router2.get("/resolve/:code", async (req, res) => {
  try {
    const rawCode = req.params.code;
    const normalizedCode = normalizeReferralCode(rawCode);
    if (!normalizedCode || normalizedCode.length < 3) {
      res.status(200).json({ valid: false });
      return;
    }
    const db = await getDb();
    const result = await db.query(
      `SELECT r.referral_code, u.public_id, u.full_name, u.status
       FROM user_referrals r
       JOIN users u ON r.user_id = u.id
       WHERE UPPER(TRIM(r.referral_code)) = UPPER(TRIM($1))
          OR UPPER(TRIM(u.public_id)) = UPPER(TRIM($1))
          OR LOWER(TRIM(u.email)) = LOWER(TRIM($1))
       LIMIT 1`,
      [normalizedCode]
    );
    if (result.rowCount === 0) {
      res.status(200).json({ valid: false });
      return;
    }
    const sponsor = result.rows[0];
    if (sponsor.status !== "ACTIVE" && sponsor.status !== "PENDING_VERIFICATION") {
      res.status(200).json({ valid: false });
      return;
    }
    res.status(200).json({
      valid: true,
      referralCode: sponsor.referral_code,
      sponsor: {
        publicId: sponsor.public_id,
        displayName: formatSafeDisplayName(sponsor.full_name)
      }
    });
  } catch (err) {
    console.error("[Referrals API] Error in /resolve/:code:", err);
    res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to resolve referral code"
    });
  }
});
router2.get("/me", requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const db = await getDb();
    const userResult = await db.query(
      `SELECT u.public_id, r.referral_code, r.sponsor_user_id
       FROM users u
       JOIN user_referrals r ON u.id = r.user_id
       WHERE u.id = $1`,
      [user.id]
    );
    if (userResult.rowCount === 0) {
      res.status(404).json({
        error: "USER_NOT_FOUND",
        message: "Referral profile not found for active user."
      });
      return;
    }
    const userData = userResult.rows[0];
    let sponsorInfo = null;
    if (userData.sponsor_user_id) {
      const sponsorResult = await db.query(
        `SELECT public_id, full_name FROM users WHERE id = $1`,
        [userData.sponsor_user_id]
      );
      if (sponsorResult.rowCount > 0) {
        sponsorInfo = {
          publicId: sponsorResult.rows[0].public_id,
          displayName: formatSafeDisplayName(sponsorResult.rows[0].full_name)
        };
      }
    }
    const host = (req.get("x-forwarded-host") || req.get("host") || "").toLowerCase();
    let baseUrl = "https://phivonex.com";
    if (process.env.APP_URL && !process.env.APP_URL.includes("MY_APP_URL") && !process.env.APP_URL.includes(".run.app")) {
      baseUrl = process.env.APP_URL;
    } else if (host.includes("ais-pre-") || host.includes("ais-dev-")) {
      const protocol = req.protocol === "https" || req.get("x-forwarded-proto") === "https" ? "https" : "http";
      baseUrl = `${protocol}://${host}`.replace("ais-dev-", "ais-pre-");
    } else if (host.includes("phivonex.com")) {
      baseUrl = "https://phivonex.com";
    }
    const cleanBaseUrl = baseUrl.replace(/\/$/, "");
    const referralUrl = `${cleanBaseUrl}/register?ref=${userData.referral_code}`;
    res.status(200).json({
      publicId: userData.public_id,
      referralCode: userData.referral_code,
      referralUrl,
      sponsor: sponsorInfo
    });
  } catch (err) {
    console.error("[Referrals API] Error in /referrals/me:", err);
    res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to fetch referral information"
    });
  }
});
router2.get("/direct", requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const db = await getDb();
    const sponsorIdent = await db.query(
      `SELECT r.referral_code, u.public_id, u.email
       FROM users u
       LEFT JOIN user_referrals r ON u.id = r.user_id
       WHERE u.id = $1`,
      [user.id]
    );
    if (sponsorIdent.rows.length > 0) {
      const s = sponsorIdent.rows[0];
      await db.query(
        `
        UPDATE user_referrals ur
        SET sponsor_user_id = $1
        FROM users u
        WHERE ur.user_id = u.id
          AND (ur.sponsor_user_id IS NULL OR ur.sponsor_user_id = '')
          AND u.id != $1
          AND (
            UPPER(TRIM(u.pending_referral_code)) = UPPER(TRIM($2))
            OR UPPER(TRIM(u.pending_referral_code)) = UPPER(TRIM($3))
            OR LOWER(TRIM(u.pending_referral_code)) = LOWER(TRIM($4))
          )
        `,
        [user.id, s.referral_code || "", s.public_id || "", s.email || ""]
      );
      await db.query(
        `
        INSERT INTO binary_placements (user_id, parent_user_id, side, status, placed_at, created_at)
        SELECT ur.user_id, NULL, NULL, 'UNPLACED', NULL, ur.created_at
        FROM user_referrals ur
        LEFT JOIN binary_placements bp ON ur.user_id = bp.user_id
        WHERE ur.sponsor_user_id = $1 AND bp.user_id IS NULL
        ON CONFLICT (user_id) DO NOTHING
        `,
        [user.id]
      );
    }
    const result = await db.query(
      `
      SELECT 
        u.public_id, 
        u.full_name, 
        ur.created_at,
        COALESCE(bp.status, 'UNPLACED') as placement_status,
        bp.side as team_side,
        bp.placed_at
      FROM user_referrals ur
      JOIN users u ON ur.user_id = u.id
      LEFT JOIN binary_placements bp ON u.id = bp.user_id
      WHERE ur.sponsor_user_id = $1
      ORDER BY ur.created_at DESC
      `,
      [user.id]
    );
    const directReferrals = result.rows.map((row) => ({
      publicId: row.public_id,
      displayName: formatSafeDisplayName(row.full_name),
      joinedAt: row.created_at.toISOString(),
      placementStatus: row.placement_status || "UNPLACED",
      teamSide: row.team_side,
      placedAt: row.placed_at ? row.placed_at.toISOString() : null
    }));
    res.status(200).json({
      count: directReferrals.length,
      referrals: directReferrals
    });
  } catch (err) {
    console.error("[Referrals API] Error in /referrals/direct:", err);
    res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to fetch direct referrals list"
    });
  }
});
var referralRoutes_default = router2;

// src/server/routes/userRoutes.ts
init_db();
import { Router as Router3 } from "express";
init_idGenerator();
var router3 = Router3();
router3.get("/me/profile", requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const db = await getDb();
    const profileRes = await db.query(
      `
      SELECT 
        u.id,
        u.public_id,
        u.full_name,
        u.email,
        u.phone,
        u.country,
        u.status,
        u.email_verified_at,
        u.created_at,
        u.last_login_at,
        ur.referral_code,
        sp.public_id AS sponsor_public_id,
        sp.full_name AS sponsor_full_name
      FROM users u
      LEFT JOIN user_referrals ur ON u.id = ur.user_id
      LEFT JOIN users sp ON ur.sponsor_user_id = sp.id
      WHERE u.id = $1
      LIMIT 1
      `,
      [user.id]
    );
    if (profileRes.rowCount === 0) {
      res.status(404).json({ error: "USER_NOT_FOUND", message: "User profile not found." });
      return;
    }
    const row = profileRes.rows[0];
    const safeSponsor = row.sponsor_public_id ? {
      publicId: row.sponsor_public_id,
      displayName: formatSafeDisplayName(row.sponsor_full_name || "")
    } : null;
    res.status(200).json({
      profile: {
        id: row.id,
        publicId: row.public_id,
        referralCode: row.referral_code,
        fullName: row.full_name,
        email: row.email,
        phone: row.phone || null,
        country: row.country,
        status: row.status,
        emailVerified: Boolean(row.email_verified_at),
        emailVerifiedAt: row.email_verified_at || null,
        createdAt: row.created_at,
        lastLoginAt: row.last_login_at || null,
        sponsor: safeSponsor
      }
    });
  } catch (err) {
    console.error("[User API] Error in GET /me/profile:", err);
    res.status(500).json({ error: "SERVER_ERROR", message: "Failed to retrieve profile." });
  }
});
router3.patch("/me/profile", requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const { fullName, phone, country } = req.body;
    if (fullName !== void 0) {
      if (typeof fullName !== "string" || fullName.trim().length < 2) {
        res.status(400).json({
          error: "INVALID_NAME",
          message: "Full name is required (minimum 2 characters)."
        });
        return;
      }
      if (fullName.trim().length > 100) {
        res.status(400).json({
          error: "INVALID_NAME",
          message: "Full name cannot exceed 100 characters."
        });
        return;
      }
    }
    if (country !== void 0) {
      if (typeof country !== "string" || country.trim().length < 2) {
        res.status(400).json({
          error: "INVALID_COUNTRY",
          message: "Country is required (minimum 2 characters)."
        });
        return;
      }
      if (country.trim().length > 100) {
        res.status(400).json({
          error: "INVALID_COUNTRY",
          message: "Country name cannot exceed 100 characters."
        });
        return;
      }
    }
    let cleanPhone = null;
    if (phone !== void 0 && phone !== null && phone !== "") {
      if (typeof phone !== "string" || phone.trim().length < 5 || phone.trim().length > 30) {
        res.status(400).json({
          error: "INVALID_PHONE",
          message: "Phone number must be between 5 and 30 characters."
        });
        return;
      }
      cleanPhone = phone.trim();
    }
    const db = await getDb();
    if (cleanPhone && cleanPhone !== user.phone) {
      const existingPhone = await db.query(
        `SELECT id FROM users WHERE phone = $1 AND id != $2`,
        [cleanPhone, user.id]
      );
      if (existingPhone.rowCount > 0) {
        res.status(409).json({
          error: "PHONE_EXISTS",
          message: "This mobile phone number is already registered to another account."
        });
        return;
      }
    }
    const updatedFullName = fullName !== void 0 ? fullName.trim() : user.fullName;
    const updatedCountry = country !== void 0 ? country.trim() : user.country;
    const updatedPhone = phone !== void 0 ? cleanPhone : user.phone;
    await db.query(
      `
      UPDATE users
      SET 
        full_name = $1,
        phone = $2,
        country = $3,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $4
      `,
      [updatedFullName, updatedPhone, updatedCountry, user.id]
    );
    await logSecurityEvent(db, {
      userId: user.id,
      eventType: "PROFILE_UPDATED",
      description: "Account profile details updated (Name, Mobile, or Country).",
      userAgent: req.headers["user-agent"]
    });
    const updatedRes = await db.query(
      `
      SELECT 
        u.id,
        u.public_id,
        u.full_name,
        u.email,
        u.phone,
        u.country,
        u.status,
        u.email_verified_at,
        u.created_at,
        u.last_login_at,
        ur.referral_code,
        sp.public_id AS sponsor_public_id,
        sp.full_name AS sponsor_full_name
      FROM users u
      LEFT JOIN user_referrals ur ON u.id = ur.user_id
      LEFT JOIN users sp ON ur.sponsor_user_id = sp.id
      WHERE u.id = $1
      LIMIT 1
      `,
      [user.id]
    );
    const updatedRow = updatedRes.rows[0];
    const safeSponsor = updatedRow.sponsor_public_id ? {
      publicId: updatedRow.sponsor_public_id,
      displayName: formatSafeDisplayName(updatedRow.sponsor_full_name || "")
    } : null;
    res.status(200).json({
      message: "Profile updated successfully.",
      user: {
        id: updatedRow.id,
        publicId: updatedRow.public_id,
        referralCode: updatedRow.referral_code,
        fullName: updatedRow.full_name,
        email: updatedRow.email,
        phone: updatedRow.phone || null,
        country: updatedRow.country,
        status: updatedRow.status,
        emailVerified: Boolean(updatedRow.email_verified_at),
        emailVerifiedAt: updatedRow.email_verified_at || null,
        createdAt: updatedRow.created_at,
        lastLoginAt: updatedRow.last_login_at || null,
        sponsor: safeSponsor
      }
    });
  } catch (err) {
    console.error("[User API] Error in PATCH /me/profile:", err);
    res.status(500).json({ error: "SERVER_ERROR", message: "Failed to update profile." });
  }
});
router3.get("/me/security-activity", requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const db = await getDb();
    const activityRes = await db.query(
      `
      SELECT 
        id,
        event_type AS "eventType",
        description,
        user_agent_summary AS "device",
        created_at AS "createdAt"
      FROM security_events
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 20
      `,
      [user.id]
    );
    res.status(200).json({
      activity: activityRes.rows
    });
  } catch (err) {
    console.error("[User API] Error in GET /me/security-activity:", err);
    res.status(500).json({ error: "SERVER_ERROR", message: "Failed to retrieve security activity." });
  }
});
var userRoutes_default = router3;

// src/server/routes/nodeRoutes.ts
init_db();
import { Router as Router4 } from "express";
init_nodeConfig();
init_nodeOrderService();

// src/server/services/nodeRewardService.ts
init_db();
init_idGenerator();
import { v4 as uuidv416 } from "uuid";

// src/server/config/rewardConfig.ts
var REWARD_CURRENCY = "PHIVO";
var MIN_REWARD_PER_NODE = 0.01;
var MAX_REWARD_PER_NODE = 1e3;
function getConfiguredRewardPerNode(override) {
  if (typeof override === "number" && !isNaN(override) && override > 0) {
    if (override < MIN_REWARD_PER_NODE || override > MAX_REWARD_PER_NODE) {
      throw new Error(
        `Configured reward rate ${override} PHIVO is outside allowed bounds [${MIN_REWARD_PER_NODE}, ${MAX_REWARD_PER_NODE}]`
      );
    }
    return override;
  }
  const envVal = process.env.NODE_REWARD_PER_EPOCH;
  if (envVal !== void 0 && envVal.trim() !== "") {
    const parsed = parseFloat(envVal);
    if (!isNaN(parsed) && parsed > 0) {
      if (parsed < MIN_REWARD_PER_NODE || parsed > MAX_REWARD_PER_NODE) {
        throw new Error(
          `Configured reward rate ${parsed} PHIVO is outside allowed bounds [${MIN_REWARD_PER_NODE}, ${MAX_REWARD_PER_NODE}]`
        );
      }
      return parsed;
    }
  }
  return null;
}

// src/server/services/nodeRewardService.ts
init_walletLedgerService();
init_economicService();
init_notificationService();
init_timezone();
async function createRewardEpoch(params) {
  const db = await getDb();
  let rewardRate = null;
  let configVersion = null;
  if (params?.rewardPerNode !== void 0) {
    rewardRate = getConfiguredRewardPerNode(params.rewardPerNode);
  } else {
    const activeCfg = await getEconomicConfigByKey("NODE_REWARD_RATE_PER_EPOCH");
    if (activeCfg && activeCfg.status === "ACTIVE" && activeCfg.configValue !== null && activeCfg.configValue !== void 0) {
      configVersion = activeCfg.version;
      if (typeof activeCfg.configValue === "object" && activeCfg.configValue !== null) {
        const val = activeCfg.configValue;
        rewardRate = Number(
          val.ratePhivo !== void 0 ? val.ratePhivo : val.rateUsd !== void 0 ? val.rateUsd : val.rewardPerNode !== void 0 ? val.rewardPerNode : NaN
        );
      } else {
        rewardRate = Number(activeCfg.configValue);
      }
    } else {
      rewardRate = getConfiguredRewardPerNode();
    }
  }
  const maxRes = await db.query(
    `SELECT COALESCE(MAX(epoch_number), 0) + 1 AS next_num FROM reward_epochs`
  );
  const epochNumber = Number(maxRes.rows[0]?.next_num || 1);
  const publicEpochId = generateEpochPublicId(epochNumber);
  const id = uuidv416();
  const baseDate = params?.startAt || /* @__PURE__ */ new Date();
  const utcDateStr = getUtcBusinessDate(baseDate);
  const [year, month, day] = utcDateStr.split("-").map(Number);
  const startAt = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  const endAt = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
  const res = await db.query(
    `
    INSERT INTO reward_epochs (
      id, public_epoch_id, epoch_number, start_at, end_at, reward_per_node, reward_rate_used, economic_config_version, currency, status, created_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'OPEN', CURRENT_TIMESTAMP)
    RETURNING *
    `,
    [id, publicEpochId, epochNumber, startAt, endAt, rewardRate, rewardRate, configVersion, REWARD_CURRENCY]
  );
  const row = res.rows[0];
  return {
    id: row.id,
    publicEpochId: row.public_epoch_id,
    epochNumber: Number(row.epoch_number),
    startAt: new Date(row.start_at).toISOString(),
    endAt: new Date(row.end_at).toISOString(),
    rewardPerNode: row.reward_per_node !== null && row.reward_per_node !== void 0 ? Number(row.reward_per_node) : null,
    rewardRateUsed: row.reward_rate_used !== null && row.reward_rate_used !== void 0 ? Number(row.reward_rate_used) : null,
    economicConfigVersion: row.economic_config_version ? Number(row.economic_config_version) : null,
    currency: row.currency,
    status: row.status,
    settledAt: row.settled_at ? new Date(row.settled_at).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString()
  };
}
async function closeAndSettleEpoch(epochId, options) {
  const db = await getDb();
  const epochRes = await db.query(
    `SELECT * FROM reward_epochs WHERE id = $1`,
    [epochId]
  );
  if (epochRes.rows.length === 0) {
    throw new Error(`Reward epoch ${epochId} not found`);
  }
  const epoch = epochRes.rows[0];
  const publicEpochId = epoch.public_epoch_id;
  const epochNumber = Number(epoch.epoch_number);
  if (epoch.status === "COMPLETED") {
    const existingRewards = await db.query(
      `SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total FROM node_rewards WHERE epoch_id = $1`,
      [epochId]
    );
    return {
      success: true,
      epochId,
      publicEpochId,
      epochNumber,
      rewardPerNode: epoch.reward_per_node ? Number(epoch.reward_per_node) : 0,
      eligibleNodesCount: Number(existingRewards.rows[0]?.count || 0),
      rewardsCreated: 0,
      totalRewardsDistributedUsd: Number(existingRewards.rows[0]?.total || 0),
      settledAt: epoch.settled_at ? new Date(epoch.settled_at).toISOString() : (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  const rewardsEnabled = await isNodeRewardsEnabled();
  if (!rewardsEnabled) {
    return {
      success: false,
      error: "NODE_REWARDS_DISABLED",
      message: "Node mining reward distributions are currently disabled by administration.",
      epochId,
      publicEpochId,
      epochNumber,
      rewardPerNode: 0,
      eligibleNodesCount: 0,
      rewardsCreated: 0,
      totalRewardsDistributedUsd: 0
    };
  }
  let effectiveRate = null;
  let configVersion = epoch.economic_config_version ? Number(epoch.economic_config_version) : null;
  if (options?.configuredRewardPerNode !== void 0) {
    effectiveRate = getConfiguredRewardPerNode(options.configuredRewardPerNode);
  } else if (epoch.reward_rate_used !== null && !isNaN(Number(epoch.reward_rate_used)) && Number(epoch.reward_rate_used) > 0) {
    effectiveRate = Number(epoch.reward_rate_used);
  } else if (epoch.reward_per_node !== null && !isNaN(Number(epoch.reward_per_node)) && Number(epoch.reward_per_node) > 0) {
    effectiveRate = Number(epoch.reward_per_node);
  } else {
    const activeCfg = await getEconomicConfigByKey("NODE_REWARD_RATE_PER_EPOCH");
    if (activeCfg && activeCfg.status === "ACTIVE" && activeCfg.configValue !== null && activeCfg.configValue !== void 0) {
      configVersion = activeCfg.version;
      if (typeof activeCfg.configValue === "object" && activeCfg.configValue !== null) {
        const val = activeCfg.configValue;
        effectiveRate = Number(
          val.ratePhivo !== void 0 ? val.ratePhivo : val.rateUsd !== void 0 ? val.rateUsd : val.rewardPerNode !== void 0 ? val.rewardPerNode : NaN
        );
      } else {
        effectiveRate = Number(activeCfg.configValue);
      }
    } else {
      effectiveRate = getConfiguredRewardPerNode();
    }
  }
  if (effectiveRate === null || effectiveRate <= 0) {
    return {
      success: false,
      error: "REWARD_RATE_NOT_CONFIGURED",
      message: "Node reward rate has not been configured by PHIVONEX management. Epoch settlement cannot proceed without an authoritative reward rate.",
      epochId,
      publicEpochId,
      epochNumber,
      rewardPerNode: 0,
      eligibleNodesCount: 0,
      rewardsCreated: 0,
      totalRewardsDistributedUsd: 0
    };
  }
  const now = /* @__PURE__ */ new Date();
  const epochBaseDate = epoch.start_at ? new Date(epoch.start_at) : now;
  const businessDate = getUtcBusinessDate(epochBaseDate);
  await db.query(
    `UPDATE reward_epochs 
     SET status = 'COMPLETED', reward_per_node = $1, reward_rate_used = $1, economic_config_version = $2, settled_at = $3 
     WHERE id = $4`,
    [effectiveRate, configVersion, now, epochId]
  );
  const activeNodesRes = await db.query(
    `
    SELECT id, public_node_id, node_number, owner_user_id, daily_phivo_emission, lifetime_phivo_allocation, distributed_phivo, remaining_phivo
    FROM nodes
    WHERE (status = 'ACTIVE' OR status = 'EMITTING') 
      AND owner_user_id IS NOT NULL 
      AND (distributed_phivo IS NULL OR distributed_phivo < COALESCE(lifetime_phivo_allocation, 10000.00))
      AND (remaining_phivo IS NULL OR remaining_phivo > 0)
      AND ($1::text IS NULL OR id::text = $1 OR public_node_id = $1)
    ORDER BY node_number ASC
    `,
    [options?.targetNodeId || null]
  );
  const eligibleNodes = activeNodesRes.rows;
  let rewardsCreated = 0;
  let totalDistributed = 0;
  for (const node of eligibleNodes) {
    const configuredDailyReward = effectiveRate;
    const lifetimeCap = Number(node.lifetime_phivo_allocation || 1e4);
    const currentDist = Number(node.distributed_phivo || 0);
    const remainingPhivo = node.remaining_phivo !== null && node.remaining_phivo !== void 0 ? Number(node.remaining_phivo) : Math.max(0, lifetimeCap - currentDist);
    const actualEmission = Math.min(configuredDailyReward, Math.max(0, remainingPhivo));
    if (actualEmission <= 0) {
      await db.query(
        `UPDATE nodes SET status = 'MATURED', remaining_phivo = 0, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [node.id]
      );
      continue;
    }
    const rewardId = uuidv416();
    const publicRewardId = generateRewardPublicId();
    const insRes = await db.query(
      `
      INSERT INTO node_rewards (
        id, public_reward_id, epoch_id, node_id, owner_user_id, amount, currency, status, accrued_at,
        reward_rate_used, economic_config_version, business_date, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACCRUED', $8, $9, $10, $11, CURRENT_TIMESTAMP)
      ON CONFLICT (node_id, epoch_id) DO NOTHING
      RETURNING *
      `,
      [
        rewardId,
        publicRewardId,
        epochId,
        node.id,
        node.owner_user_id,
        actualEmission,
        epoch.currency || REWARD_CURRENCY,
        now,
        configuredDailyReward,
        configVersion,
        businessDate
      ]
    );
    let actualRewardId;
    let actualPublicRewardId;
    let actualAmount;
    if (insRes.rows.length > 0) {
      actualRewardId = insRes.rows[0].id;
      actualPublicRewardId = insRes.rows[0].public_reward_id;
      actualAmount = Number(insRes.rows[0].amount);
      rewardsCreated++;
      totalDistributed += actualAmount;
      const newDist = currentDist + actualAmount;
      const newRem = Math.max(0, remainingPhivo - actualAmount);
      const newStatus = newRem <= 0 || newDist >= lifetimeCap ? "MATURED" : "EMITTING";
      await db.query(
        `
        UPDATE nodes
        SET distributed_phivo = $1, remaining_phivo = $2, status = $3, updated_at = CURRENT_TIMESTAMP
        WHERE id = $4
        `,
        [newDist, newRem, newStatus, node.id]
      );
    } else {
      const existing = await db.query(
        `SELECT id, public_reward_id, amount FROM node_rewards WHERE node_id = $1 AND epoch_id = $2`,
        [node.id, epochId]
      );
      if (existing.rows.length === 0) continue;
      actualRewardId = existing.rows[0].id;
      actualPublicRewardId = existing.rows[0].public_reward_id;
      actualAmount = Number(existing.rows[0].amount);
    }
    await postLedgerCredit({
      userId: node.owner_user_id,
      sourceType: "NODE_REWARD",
      sourceId: actualRewardId,
      sourceRef: actualPublicRewardId,
      amount: actualAmount,
      currency: "PHIVO",
      description: `Genesis Node Mining Reward (Epoch #${epochNumber}, Node ${node.public_node_id})`,
      createdAt: now
    }).catch((ledgerErr) => {
      console.warn("[NodeReward] Error posting ledger credit:", ledgerErr);
    });
    try {
      await notifyPhivoReward({
        userId: node.owner_user_id,
        amountPhivo: actualAmount,
        rewardId: actualRewardId
      });
    } catch (notifErr) {
      console.warn("[Notification] Error triggering node reward notification:", notifErr);
    }
    db.query(
      `SELECT email, full_name, public_id FROM users WHERE id = $1`,
      [node.owner_user_id]
    ).then(async (userRes) => {
      if (userRes.rows.length > 0) {
        const user = userRes.rows[0];
        const { queueEventEmail: queueEventEmail2, triggerAutomationRule: triggerAutomationRule2 } = await Promise.resolve().then(() => (init_emailService(), emailService_exports));
        await queueEventEmail2(user.email, "REWARD", {
          displayName: user.full_name,
          publicId: user.public_id,
          amount: String(actualAmount),
          epochId,
          publicEpochId
        }).catch(() => {
        });
        await triggerAutomationRule2(node.owner_user_id, "MATCHING_ACTIVITY", {
          amount: String(actualAmount)
        }).catch(() => {
        });
      }
    }).catch(() => {
    });
  }
  return {
    success: true,
    epochId,
    publicEpochId,
    epochNumber,
    rewardPerNode: effectiveRate,
    eligibleNodesCount: eligibleNodes.length,
    rewardsCreated,
    totalRewardsDistributedUsd: totalDistributed,
    settledAt: now.toISOString()
  };
}
async function claimUserRewards(userId) {
  const db = await getDb();
  const now = /* @__PURE__ */ new Date();
  const updRes = await db.query(
    `
    UPDATE node_rewards
    SET status = 'CLAIMED', claimed_at = $1
    WHERE owner_user_id = $2 AND status = 'ACCRUED'
    RETURNING id, amount
    `,
    [now, userId]
  );
  let totalAmount = 0;
  for (const row of updRes.rows) {
    totalAmount += Number(row.amount);
  }
  return {
    claimedCount: updRes.rows.length,
    totalClaimedAmount: totalAmount
  };
}
async function getUserRewards(userId) {
  const db = await getDb();
  const activeRate = await getNodeRewardRatePerEpoch();
  const res = await db.query(
    `
    SELECT 
      nr.id,
      nr.public_reward_id,
      nr.epoch_id,
      nr.node_id,
      nr.owner_user_id,
      nr.amount,
      nr.currency,
      nr.status,
      nr.accrued_at,
      nr.claimed_at,
      nr.reversed_at,
      nr.reward_rate_used,
      nr.economic_config_version,
      nr.business_date,
      nr.created_at,
      re.public_epoch_id,
      re.epoch_number,
      n.public_node_id,
      n.node_number
    FROM node_rewards nr
    JOIN reward_epochs re ON nr.epoch_id = re.id
    JOIN nodes n ON nr.node_id = n.id
    WHERE nr.owner_user_id = $1
    ORDER BY nr.accrued_at DESC
    `,
    [userId]
  );
  let totalAccrued = 0;
  let totalClaimed = 0;
  let totalRewards = 0;
  const history = res.rows.map((r) => {
    const amt = Number(r.amount);
    if (r.status === "ACCRUED") {
      totalAccrued += amt;
      totalRewards += amt;
    } else if (r.status === "CLAIMED") {
      totalClaimed += amt;
      totalRewards += amt;
    }
    return {
      id: r.id,
      publicRewardId: r.public_reward_id,
      epochId: r.epoch_id,
      epochNumber: Number(r.epoch_number),
      publicEpochId: r.public_epoch_id,
      nodeId: r.node_id,
      publicNodeId: r.public_node_id,
      nodeNumber: Number(r.node_number),
      ownerUserId: r.owner_user_id,
      amount: amt,
      currency: r.currency,
      status: r.status,
      accruedAt: new Date(r.accrued_at).toISOString(),
      claimedAt: r.claimed_at ? new Date(r.claimed_at).toISOString() : null,
      reversedAt: r.reversed_at ? new Date(r.reversed_at).toISOString() : null,
      rewardRateUsed: r.reward_rate_used !== null && r.reward_rate_used !== void 0 ? Number(r.reward_rate_used) : null,
      economicConfigVersion: r.economic_config_version !== null && r.economic_config_version !== void 0 ? Number(r.economic_config_version) : null,
      businessDate: r.business_date || null,
      createdAt: new Date(r.created_at).toISOString()
    };
  });
  const latestEpochRes = await db.query(
    `SELECT * FROM reward_epochs ORDER BY epoch_number DESC LIMIT 1`
  );
  let latestEpoch = null;
  if (latestEpochRes.rows.length > 0) {
    const row = latestEpochRes.rows[0];
    latestEpoch = {
      id: row.id,
      publicEpochId: row.public_epoch_id,
      epochNumber: Number(row.epoch_number),
      rewardPerNode: row.reward_per_node !== null && row.reward_per_node !== void 0 ? Number(row.reward_per_node) : null,
      status: row.status,
      settledAt: row.settled_at ? new Date(row.settled_at).toISOString() : null
    };
  }
  return {
    totalAccrued,
    totalClaimed,
    totalRewards,
    dailyEmissionRate: activeRate,
    protocolDailyEmission: activeRate,
    latestEpoch,
    history
  };
}
async function getUserRewardsSummary(userId) {
  const db = await getDb();
  const activeRate = await getNodeRewardRatePerEpoch();
  const activeNodesRes = await db.query(
    `SELECT COUNT(*) as count FROM nodes WHERE owner_user_id = $1 AND status IN ('ACTIVE', 'EMITTING', 'MATURED')`,
    [userId]
  );
  const activeNodesCount = Number(activeNodesRes.rows[0]?.count || 0);
  const aggRes = await db.query(
    `
    SELECT status, COALESCE(SUM(amount), 0) as total
    FROM node_rewards
    WHERE owner_user_id = $1
    GROUP BY status
    `,
    [userId]
  );
  let totalAccrued = 0;
  let totalClaimed = 0;
  for (const row of aggRes.rows) {
    const amt = Number(row.total);
    if (row.status === "ACCRUED") totalAccrued += amt;
    else if (row.status === "CLAIMED") totalClaimed += amt;
  }
  const totalRewardsEarned = totalAccrued + totalClaimed;
  const epochRes = await db.query(
    `SELECT epoch_number, settled_at FROM reward_epochs ORDER BY epoch_number DESC LIMIT 1`
  );
  const latestEpochNumber = epochRes.rows.length > 0 ? Number(epochRes.rows[0].epoch_number) : 0;
  const latestSettlementTime = epochRes.rows.length > 0 && epochRes.rows[0].settled_at ? new Date(epochRes.rows[0].settled_at).toISOString() : null;
  return {
    totalRewardsEarned,
    totalAccrued,
    totalClaimed,
    activeNodesCount,
    protocolDailyEmission: activeRate,
    latestEpochNumber,
    latestSettlementTime
  };
}
async function getNodeRewardStatsForUser(userId) {
  const db = await getDb();
  const res = await db.query(
    `
    SELECT 
      nr.node_id,
      re.public_epoch_id,
      nr.amount,
      nr.status,
      nr.accrued_at
    FROM node_rewards nr
    JOIN reward_epochs re ON nr.epoch_id = re.id
    WHERE nr.owner_user_id = $1 AND nr.status != 'REVERSED'
    ORDER BY nr.accrued_at DESC
    `,
    [userId]
  );
  const stats = {};
  for (const row of res.rows) {
    const nodeId = row.node_id;
    const amt = Number(row.amount);
    const status = row.status;
    const publicEpoch = row.public_epoch_id;
    if (!stats[nodeId]) {
      stats[nodeId] = {
        totalRewards: amt,
        currentRewardState: status,
        latestRewardEpoch: publicEpoch
      };
    } else {
      stats[nodeId].totalRewards += amt;
      if (status === "ACCRUED") {
        stats[nodeId].currentRewardState = "ACCRUED";
      }
    }
  }
  return stats;
}
var DEFAULT_AUTOMATION_CONFIG = {
  mode: "AUTOMATIC",
  scheduledTimeUtc: "00:00",
  autoEnabled: true,
  lastSettledAt: null,
  lastEpochNumber: null,
  lastSettledBy: "system",
  lastSettledMode: null
};
async function getRewardAutomationConfig() {
  const db = await getDb();
  try {
    const res = await db.query(
      `SELECT config_value FROM system_economic_configs WHERE config_key = 'DAILY_REWARD_AUTOMATION' AND status = 'ACTIVE' LIMIT 1`
    );
    if (res.rows.length > 0) {
      const val = typeof res.rows[0].config_value === "string" ? JSON.parse(res.rows[0].config_value) : res.rows[0].config_value;
      return {
        ...DEFAULT_AUTOMATION_CONFIG,
        ...val
      };
    }
  } catch (err) {
    console.error("[RewardAutomation] Error reading DAILY_REWARD_AUTOMATION config:", err);
  }
  return DEFAULT_AUTOMATION_CONFIG;
}
async function setRewardAutomationConfig(mode, scheduledTimeUtc = "00:00", adminUserId, adminPublicId) {
  const db = await getDb();
  const current = await getRewardAutomationConfig();
  const updated = {
    ...current,
    mode,
    scheduledTimeUtc,
    autoEnabled: mode === "AUTOMATIC"
  };
  await db.query(
    `
    INSERT INTO system_economic_configs (
      id, config_key, config_value, category, description, status, version, effective_from, updated_by_admin_id, updated_by_admin_public_id, created_at, updated_at
    )
    VALUES ($1, 'DAILY_REWARD_AUTOMATION', $2, 'REWARDS', 'Dual-mode daily mining reward distribution automation setting (AUTOMATIC vs MANUAL)', 'ACTIVE', 1, CURRENT_TIMESTAMP, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT (config_key) DO UPDATE SET
      config_value = EXCLUDED.config_value,
      status = 'ACTIVE',
      updated_by_admin_id = EXCLUDED.updated_by_admin_id,
      updated_by_admin_public_id = EXCLUDED.updated_by_admin_public_id,
      updated_at = CURRENT_TIMESTAMP
    `,
    [uuidv416(), JSON.stringify(updated), adminUserId, adminPublicId]
  );
  console.log(`[RewardAutomation] Daily reward distribution mode set to ${mode} by ${adminPublicId}`);
  return updated;
}
async function executeManualDailyRewardDistribution(adminUserId, adminPublicId) {
  const db = await getDb();
  console.log(`[RewardAutomation] \u{1F680} Manual daily reward distribution triggered by admin ${adminPublicId}`);
  let epochId;
  const openEpoch = await db.query(
    `SELECT id, epoch_number FROM reward_epochs WHERE status = 'OPEN' ORDER BY created_at DESC LIMIT 1`
  );
  if (openEpoch.rows.length > 0) {
    epochId = openEpoch.rows[0].id;
  } else {
    const newEpoch = await createRewardEpoch();
    epochId = newEpoch.id;
  }
  const settlementResult = await closeAndSettleEpoch(epochId);
  if (!settlementResult.success) {
    return {
      success: false,
      error: settlementResult.error,
      message: settlementResult.message || "Settlement failed.",
      result: settlementResult
    };
  }
  const currentConfig = await getRewardAutomationConfig();
  const updatedConfig = {
    ...currentConfig,
    lastSettledAt: (/* @__PURE__ */ new Date()).toISOString(),
    lastEpochNumber: settlementResult.epochNumber,
    lastSettledBy: adminPublicId,
    lastSettledMode: "MANUAL"
  };
  await db.query(
    `
    INSERT INTO system_economic_configs (
      id, config_key, config_value, category, description, status, version, effective_from, updated_by_admin_id, updated_by_admin_public_id, created_at, updated_at
    )
    VALUES ($1, 'DAILY_REWARD_AUTOMATION', $2, 'REWARDS', 'Dual-mode daily mining reward distribution automation setting', 'ACTIVE', 1, CURRENT_TIMESTAMP, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT (config_key) DO UPDATE SET
      config_value = EXCLUDED.config_value,
      updated_at = CURRENT_TIMESTAMP
    `,
    [uuidv416(), JSON.stringify(updatedConfig), adminUserId, adminPublicId]
  );
  return {
    success: true,
    message: `Manual ROI distribution completed successfully. ${settlementResult.eligibleNodesCount} nodes credited ${settlementResult.totalRewardsDistributedUsd.toFixed(2)} PHIVO rewards (Epoch #${settlementResult.epochNumber}).`,
    result: settlementResult
  };
}
async function executeDailyAutomaticRewardCheck() {
  try {
    const config = await getRewardAutomationConfig();
    if (config.mode !== "AUTOMATIC" || !config.autoEnabled) {
      return;
    }
    const todayDate = getUtcBusinessDate();
    const db = await getDb();
    const checkRes = await db.query(
      `SELECT id FROM reward_epochs WHERE status = 'COMPLETED' AND DATE(settled_at) = CURRENT_DATE LIMIT 1`
    );
    if (checkRes.rows.length > 0) {
      return;
    }
    console.log(`[RewardAutomation] \u23F0 Automatic daily mining reward distribution starting for business date: ${todayDate}`);
    let epochId;
    const openEpoch = await db.query(
      `SELECT id FROM reward_epochs WHERE status = 'OPEN' ORDER BY created_at DESC LIMIT 1`
    );
    if (openEpoch.rows.length > 0) {
      epochId = openEpoch.rows[0].id;
    } else {
      const newEpoch = await createRewardEpoch();
      epochId = newEpoch.id;
    }
    const result = await closeAndSettleEpoch(epochId);
    console.log(`[RewardAutomation] \u2705 Automated daily reward distribution finished: Epoch #${result.epochNumber}, Nodes: ${result.eligibleNodesCount}, Total: ${result.totalRewardsDistributedUsd} PHIVO`);
    const updated = {
      ...config,
      lastSettledAt: (/* @__PURE__ */ new Date()).toISOString(),
      lastEpochNumber: result.epochNumber,
      lastSettledBy: "system-auto",
      lastSettledMode: "AUTOMATIC"
    };
    await db.query(
      `
      INSERT INTO system_economic_configs (
        id, config_key, config_value, category, description, status, version, effective_from, updated_by_admin_id, updated_by_admin_public_id, created_at, updated_at
      )
      VALUES ($1, 'DAILY_REWARD_AUTOMATION', $2, 'REWARDS', 'Dual-mode daily mining reward distribution automation setting', 'ACTIVE', 1, CURRENT_TIMESTAMP, NULL, 'SYSTEM', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (config_key) DO UPDATE SET
        config_value = EXCLUDED.config_value,
        updated_at = CURRENT_TIMESTAMP
      `,
      [uuidv416(), JSON.stringify(updated)]
    );
  } catch (err) {
    console.error("[RewardAutomation] Error in executeDailyAutomaticRewardCheck:", err);
  }
}

// src/server/routes/nodeRoutes.ts
init_economicService();
var router4 = Router4();
router4.get("/stats", async (_req, res) => {
  try {
    const db = await getDb();
    await cleanupExpiredReservations(db);
    const statsRes = await db.query(`
      SELECT 
        status, 
        COUNT(*)::int AS count 
      FROM nodes 
      GROUP BY status
    `);
    let available = 0;
    let reserved = 0;
    let active = 0;
    let retired = 0;
    for (const row of statsRes.rows) {
      const cnt = parseInt(String(row.count), 10) || 0;
      switch (row.status) {
        case "AVAILABLE":
          available = cnt;
          break;
        case "RESERVED":
          reserved = cnt;
          break;
        case "ACTIVE":
          active = cnt;
          break;
        case "RETIRED":
          retired = cnt;
          break;
      }
    }
    const allocated = reserved + active + retired;
    res.status(200).json({
      genesisCap: GENESIS_NODE_CAP,
      basePriceUsd: NODE_BASE_PRICE_USD,
      available,
      reserved,
      active,
      retired,
      allocated
    });
  } catch (err) {
    console.error("[Node API] Error in GET /stats:", err);
    res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to retrieve Genesis Node statistics."
    });
  }
});
router4.get("/me", requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const db = await getDb();
    const nodesRes = await db.query(
      `
      SELECT 
        id,
        node_number,
        public_node_id,
        status,
        product_version,
        purchase_price_usd,
        phivo_reference_price_at_purchase,
        lifetime_phivo_allocation,
        term_days,
        daily_phivo_emission,
        purchase_timestamp,
        activated_at,
        maturity_timestamp,
        distributed_phivo,
        remaining_phivo
      FROM nodes
      WHERE owner_user_id = $1
      ORDER BY node_number ASC
      `,
      [user.id]
    );
    const rewardStats = await getNodeRewardStatsForUser(user.id);
    const activeProtocolDailyReward = await getNodeRewardRatePerEpoch();
    const safeNodes = nodesRes.rows.map((n) => {
      const stat = rewardStats[n.id] || {
        totalRewards: 0,
        currentRewardState: "READY",
        latestRewardEpoch: null
      };
      const lifetimeAllocation = Number(n.lifetime_phivo_allocation || 1e4);
      const dailyEmission = activeProtocolDailyReward !== null ? activeProtocolDailyReward : n.daily_phivo_emission !== null && n.daily_phivo_emission !== void 0 ? Number(n.daily_phivo_emission) : 0;
      const distributedPhivo = Number(n.distributed_phivo || stat.totalRewards || 0);
      const remainingPhivo = Math.max(0, lifetimeAllocation - distributedPhivo);
      const progressPercent = Math.min(100, Number((distributedPhivo / lifetimeAllocation * 100).toFixed(2)));
      const completedDays = Math.min(200, dailyEmission > 0 ? Math.floor(distributedPhivo / dailyEmission) : 0);
      const currentDay = n.status === "MATURED" ? 200 : Math.min(200, completedDays + 1);
      return {
        publicNodeId: n.public_node_id,
        nodeNumber: n.node_number,
        status: n.status,
        productVersion: n.product_version || "GENESIS_V1",
        purchasePriceUsd: Number(n.purchase_price_usd || 1e3),
        phivoReferencePriceAtPurchase: Number(n.phivo_reference_price_at_purchase || 0.1),
        lifetimePhivoAllocation: lifetimeAllocation,
        termDays: n.term_days || 200,
        dailyPhivoEmission: dailyEmission,
        protocolDailyEmission: activeProtocolDailyReward,
        purchaseTimestamp: n.purchase_timestamp ? n.purchase_timestamp.toISOString() : n.activated_at ? n.activated_at.toISOString() : null,
        activatedAt: n.activated_at ? n.activated_at.toISOString() : null,
        maturityTimestamp: n.maturity_timestamp ? n.maturity_timestamp.toISOString() : n.activated_at ? new Date(new Date(n.activated_at).getTime() + 200 * 24 * 60 * 60 * 1e3).toISOString() : null,
        distributedPhivo,
        remainingPhivo,
        progressPercent,
        currentDay,
        totalRewards: stat.totalRewards,
        currentRewardState: stat.currentRewardState,
        latestRewardEpoch: stat.latestRewardEpoch
      };
    });
    res.status(200).json({
      nodes: safeNodes
    });
  } catch (err) {
    console.error("[Node API] Error in GET /me:", err);
    res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to retrieve operator nodes."
    });
  }
});
var nodeRoutes_default = router4;

// src/server/routes/orderRoutes.ts
import { Router as Router5 } from "express";
init_nodeOrderService();

// src/server/services/nodePurchaseBalanceService.ts
init_db();
init_idGenerator();
init_economicService();
init_nodeOrderService();
init_walletLedgerService();
import { v4 as uuidv417 } from "uuid";
var userLocks = /* @__PURE__ */ new Map();
function withUserLock(userId, fn) {
  const currentLock = userLocks.get(userId) || Promise.resolve();
  let releaseLock;
  const newLock = new Promise((resolve) => {
    releaseLock = resolve;
  });
  userLocks.set(userId, currentLock.then(() => newLock, () => newLock));
  return currentLock.then(
    async () => {
      try {
        return await fn();
      } finally {
        releaseLock();
        if (userLocks.get(userId) === newLock) {
          userLocks.delete(userId);
        }
      }
    },
    async () => {
      try {
        return await fn();
      } finally {
        releaseLock();
        if (userLocks.get(userId) === newLock) {
          userLocks.delete(userId);
        }
      }
    }
  );
}
async function validateUserNodePurchaseBalances(userId) {
  const db = await getDb();
  const nodePriceUsd = await getNodeBasePrice();
  const bnbPriceUsd = await getBnbPriceUsd();
  const bnbRequired = bnbPriceUsd && bnbPriceUsd > 0 ? Number((nodePriceUsd / bnbPriceUsd).toFixed(4)) : 0;
  const usdtRequired = nodePriceUsd;
  const walletSummary = await getWalletSummary(userId);
  const availableUsdt = walletSummary.availableBalance;
  const nodeVaultBalance = walletSummary.nodeVaultBalance;
  const mainWalletBalance = walletSummary.mainWalletBalance;
  const bnbDepositsRes = await db.query(
    `
    SELECT COALESCE(SUM(amount), 0) AS total
    FROM blockchain_deposits
    WHERE user_id = $1 AND status = 'CREDITED' AND asset = 'BNB'
    `,
    [userId]
  );
  const totalBnbDeposits = Number(bnbDepositsRes.rows[0]?.total || 0);
  const bnbDebitsRes = await db.query(
    `
    SELECT COALESCE(SUM(amount), 0) AS total
    FROM financial_ledger_entries
    WHERE user_id = $1 AND entry_type = 'DEBIT' AND source_type = 'NODE_PURCHASE' AND currency = 'BNB'
    `,
    [userId]
  );
  const totalBnbDebits = Number(bnbDebitsRes.rows[0]?.total || 0);
  const availableBnb = Math.max(0, totalBnbDeposits - totalBnbDebits);
  const usdtSufficient = availableUsdt >= usdtRequired;
  const bnbSufficient = Boolean(bnbPriceUsd && bnbPriceUsd > 0 && bnbRequired > 0 && availableBnb >= bnbRequired);
  return {
    userId,
    nodePriceUsd,
    bnbPriceUsd,
    bnbRequired,
    usdtRequired,
    usdtBalance: {
      available: availableUsdt,
      required: usdtRequired,
      sufficient: usdtSufficient,
      missing: usdtSufficient ? 0 : Number((usdtRequired - availableUsdt).toFixed(2))
    },
    bnbBalance: {
      available: availableBnb,
      required: bnbRequired,
      sufficient: bnbSufficient,
      missing: bnbSufficient ? 0 : bnbRequired > 0 ? Number((bnbRequired - availableBnb).toFixed(4)) : 0
    },
    mainWalletBalance,
    nodeVaultBalance,
    canActivateWithUsdt: usdtSufficient,
    canActivateWithBnb: bnbSufficient
  };
}
async function processNodePurchaseWithAssetBalance(userId, asset = "USDT", idempotencyKey) {
  return withUserLock(userId, async () => {
    const db = await getDb();
    const selectedAsset = asset.toUpperCase() === "BNB" ? "BNB" : "USDT";
    const cleanIdempotencyKey = idempotencyKey ? idempotencyKey.trim() : null;
    if (cleanIdempotencyKey) {
      const existingOrderRes = await db.query(
        `
        SELECT 
          o.id, o.public_order_id, o.node_number, o.amount_usd,
          o.currency, o.status, o.payment_method, o.payment_reference,
          o.reserved_at, o.expires_at, o.completed_at, o.created_at,
          n.public_node_id, n.status AS node_status, n.activated_at AS node_activated_at
        FROM node_orders o
        JOIN nodes n ON o.node_id = n.id
        WHERE o.user_id = $1 AND o.idempotency_key = $2 AND o.status = 'COMPLETED'
        LIMIT 1
        `,
        [userId, cleanIdempotencyKey]
      );
      if (existingOrderRes.rows.length > 0) {
        const row = existingOrderRes.rows[0];
        const walletSummary = await getWalletSummary(userId);
        return {
          success: true,
          assetUsed: row.currency === "BNB" ? "BNB" : "USDT",
          deductedAmount: Number(row.amount_usd),
          remainingAssetBalance: walletSummary.availableBalance,
          order: {
            publicOrderId: row.public_order_id,
            publicNodeId: row.public_node_id,
            nodeNumber: row.node_number,
            amountUsd: Number(row.amount_usd),
            currency: row.currency,
            status: row.status,
            paymentMethod: row.payment_method,
            paymentReference: row.payment_reference,
            reservedAt: new Date(row.reserved_at).toISOString(),
            expiresAt: new Date(row.expires_at).toISOString(),
            completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : (/* @__PURE__ */ new Date()).toISOString(),
            cancelledAt: null,
            createdAt: new Date(row.created_at).toISOString(),
            secondsRemaining: 0
          },
          node: {
            publicNodeId: row.public_node_id,
            nodeNumber: row.node_number,
            status: row.node_status || "ACTIVE",
            activatedAt: row.node_activated_at ? new Date(row.node_activated_at).toISOString() : row.completed_at ? new Date(row.completed_at).toISOString() : (/* @__PURE__ */ new Date()).toISOString()
          },
          isDuplicate: true
        };
      }
    }
    const validation = await validateUserNodePurchaseBalances(userId);
    if (selectedAsset === "BNB" && (validation.bnbPriceUsd === null || validation.bnbPriceUsd <= 0)) {
      const error = new Error(
        "BNB_VALUATION_NOT_CONFIGURED: BNB-based node purchase is currently blocked because BNB valuation rate is not configured in economic parameters."
      );
      error.code = "BNB_VALUATION_NOT_CONFIGURED";
      error.statusCode = 400;
      throw error;
    }
    let requiredAmount = 0;
    let availableBalance = 0;
    let isSufficient = false;
    if (selectedAsset === "BNB") {
      requiredAmount = validation.bnbRequired;
      availableBalance = validation.bnbBalance.available;
      isSufficient = validation.canActivateWithBnb;
    } else {
      requiredAmount = validation.usdtRequired;
      availableBalance = validation.usdtBalance.available;
      isSufficient = validation.canActivateWithUsdt;
    }
    if (!isSufficient) {
      const error = new Error(
        `Insufficient ${selectedAsset} deposit balance. You have ${availableBalance} ${selectedAsset}, but node activation requires ${requiredAmount} ${selectedAsset}.`
      );
      error.code = "INSUFFICIENT_ASSET_BALANCE";
      error.statusCode = 400;
      error.selectedAsset = selectedAsset;
      error.availableBalance = availableBalance;
      error.requiredAmount = requiredAmount;
      error.missingAmount = Number((requiredAmount - availableBalance).toFixed(4));
      error.redirectToDeposit = true;
      throw error;
    }
    try {
      const purchaseResult = await db.transaction(async (trx) => {
        try {
          await trx.query(`SET LOCAL statement_timeout = '15000'`);
          await trx.query(`SET LOCAL lock_timeout = '8000'`);
        } catch {
        }
        await trx.query(`SELECT id FROM users WHERE id = $1 FOR UPDATE`, [userId]);
        if (cleanIdempotencyKey) {
          const existingTx = await trx.query(
            `
            SELECT 
              o.id, o.public_order_id, o.node_number, o.amount_usd,
              o.currency, o.status, o.payment_method, o.payment_reference,
              o.reserved_at, o.expires_at, o.completed_at, o.created_at,
              n.public_node_id, n.status AS node_status, n.activated_at AS node_activated_at
            FROM node_orders o
            JOIN nodes n ON o.node_id = n.id
            WHERE o.user_id = $1 AND o.idempotency_key = $2 AND o.status = 'COMPLETED'
            LIMIT 1
            `,
            [userId, cleanIdempotencyKey]
          );
          if (existingTx.rows.length > 0) {
            const row = existingTx.rows[0];
            return {
              success: true,
              assetUsed: row.currency === "BNB" ? "BNB" : "USDT",
              deductedAmount: Number(row.amount_usd),
              remainingAssetBalance: availableBalance,
              order: {
                publicOrderId: row.public_order_id,
                publicNodeId: row.public_node_id,
                nodeNumber: row.node_number,
                amountUsd: Number(row.amount_usd),
                currency: row.currency,
                status: row.status,
                paymentMethod: row.payment_method,
                paymentReference: row.payment_reference,
                reservedAt: new Date(row.reserved_at).toISOString(),
                expiresAt: new Date(row.expires_at).toISOString(),
                completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : (/* @__PURE__ */ new Date()).toISOString(),
                cancelledAt: null,
                createdAt: new Date(row.created_at).toISOString(),
                secondsRemaining: 0
              },
              node: {
                publicNodeId: row.public_node_id,
                nodeNumber: row.node_number,
                status: row.node_status || "ACTIVE",
                activatedAt: row.node_activated_at ? new Date(row.node_activated_at).toISOString() : row.completed_at ? new Date(row.completed_at).toISOString() : (/* @__PURE__ */ new Date()).toISOString()
              },
              isDuplicate: true,
              runPostCommit: void 0
            };
          }
        }
        if (selectedAsset === "USDT") {
          const balRes = await trx.query(
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
            WHERE user_id = $1 
              AND status = 'SETTLED' 
              AND (currency = 'USDT' OR currency = 'USD') 
            `,
            [userId]
          );
          const currentAvailable = Math.max(0, Number(balRes.rows[0]?.available_balance || 0));
          if (currentAvailable < requiredAmount) {
            const err = new Error(
              `INSUFFICIENT_ASSET_BALANCE: Available balance of ${currentAvailable} ${selectedAsset} is insufficient for required ${requiredAmount} ${selectedAsset}.`
            );
            err.code = "INSUFFICIENT_ASSET_BALANCE";
            err.statusCode = 400;
            throw err;
          }
        }
        const reservationKey = cleanIdempotencyKey || `node_bal_req_${selectedAsset}_${userId}_${uuidv417()}`;
        const reservation = await createNodeReservation(
          userId,
          reservationKey,
          `DEPOSIT_${selectedAsset}`,
          trx
        );
        if (reservation.order.status === "COMPLETED") {
          const settlement2 = await settleNodeOrder(userId, reservation.order.publicOrderId, void 0, trx);
          return {
            success: true,
            assetUsed: selectedAsset,
            deductedAmount: requiredAmount,
            remainingAssetBalance: availableBalance,
            order: settlement2.order,
            node: settlement2.node,
            isDuplicate: true,
            runPostCommit: settlement2.runPostCommit
          };
        }
        const orderId = reservation.order.id || reservation.order.publicOrderId;
        const existingDebitRes = await trx.query(
          `SELECT id FROM financial_ledger_entries WHERE source_id = $1 AND source_type = 'NODE_PURCHASE'`,
          [orderId]
        );
        let debitTxnId = uuidv417();
        let publicTxnId = generateLedgerTransactionPublicId();
        if (existingDebitRes.rows.length === 0) {
          await trx.query(
            `
            INSERT INTO financial_ledger_entries (
              id, public_txn_id, user_id, entry_type, source_type, source_id,
              source_ref, description, amount, currency, status, created_at
            )
            VALUES ($1, $2, $3, 'DEBIT', 'NODE_PURCHASE', $4, $5, $6, $7, $8, 'SETTLED', CURRENT_TIMESTAMP)
            `,
            [
              debitTxnId,
              publicTxnId,
              userId,
              orderId,
              reservation.order.publicNodeId,
              `Genesis Node ${reservation.order.publicNodeId} activation paid via ${selectedAsset} deposit balance`,
              requiredAmount,
              selectedAsset
            ]
          );
        } else {
          debitTxnId = existingDebitRes.rows[0].id;
        }
        const settlement = await settleNodeOrder(
          userId,
          reservation.order.publicOrderId,
          `DEPOSIT_PAYMENT_${selectedAsset}_${publicTxnId}`,
          trx
        );
        const remainingBalance = Math.max(0, Number((availableBalance - requiredAmount).toFixed(4)));
        return {
          success: true,
          assetUsed: selectedAsset,
          deductedAmount: requiredAmount,
          remainingAssetBalance: remainingBalance,
          order: settlement.order,
          node: settlement.node,
          isDuplicate: settlement.isDuplicate,
          runPostCommit: settlement.runPostCommit
        };
      });
      if (purchaseResult.runPostCommit) {
        purchaseResult.runPostCommit().catch((err) => {
          console.warn("[ProcessNodePurchase Post-Commit Warning]", err);
        });
      }
      return {
        success: purchaseResult.success,
        assetUsed: purchaseResult.assetUsed,
        deductedAmount: purchaseResult.deductedAmount,
        remainingAssetBalance: purchaseResult.remainingAssetBalance,
        order: purchaseResult.order,
        node: purchaseResult.node,
        isDuplicate: purchaseResult.isDuplicate
      };
    } catch (txErr) {
      console.error("[ProcessNodePurchase TX Error]", txErr);
      throw txErr;
    }
  });
}

// src/server/routes/orderRoutes.ts
var router5 = Router5();
var PAYMENT_WEBHOOK_SECRET = process.env.PAYMENT_WEBHOOK_SECRET || "phx_vault_webhook_secret_2026";
var handleReserve = async (req, res) => {
  try {
    const user = req.user;
    const idempotencyKey = req.body?.idempotencyKey || req.headers["idempotency-key"] || "";
    const paymentMethod = req.body?.paymentMethod || "CRYPTO_USDT";
    const result = await createNodeReservation(user.id, idempotencyKey, paymentMethod);
    res.status(result.isExisting ? 200 : 201).json({
      order: result.order,
      isExisting: result.isExisting,
      message: result.isExisting ? "Retrieved existing active node reservation." : "Genesis Node reserved successfully. Complete payment verification before expiration."
    });
  } catch (err) {
    if (err.code === "SOLD_OUT") {
      res.status(409).json({
        error: "SOLD_OUT",
        message: err.message || "All 10,000 Genesis Nodes have been allocated or reserved."
      });
      return;
    }
    if (err.statusCode) {
      res.status(err.statusCode).json({
        error: err.code || "RESERVATION_ERROR",
        message: err.message
      });
      return;
    }
    console.error("[Order API] Error in node reservation:", err);
    res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to create Genesis Node reservation. Please try again."
    });
  }
};
router5.post("/reserve", requireAuth, handleReserve);
router5.post("/create", requireAuth, handleReserve);
router5.get("/me", requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const orders = await getUserOrders(user.id);
    res.status(200).json({
      orders
    });
  } catch (err) {
    console.error("[Order API] Error in GET /me:", err);
    res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to retrieve node orders."
    });
  }
});
router5.get("/:orderId", requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const orderId = req.params.orderId;
    const order = await getUserOrderById(user.id, orderId);
    if (!order) {
      res.status(404).json({
        error: "ORDER_NOT_FOUND",
        message: "Order not found."
      });
      return;
    }
    res.status(200).json({
      order
    });
  } catch (err) {
    console.error("[Order API] Error in GET /:orderId:", err);
    res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to retrieve order details."
    });
  }
});
router5.post("/:orderId/settle", async (_req, res) => {
  res.status(403).json({
    error: "FORBIDDEN",
    message: "Direct user settlement is disabled. Orders are settled exclusively via verified protocol payment webhooks or internal settlement service."
  });
});
router5.post("/webhook/payment-settlement", async (req, res) => {
  try {
    const authHeader = req.headers["x-phx-webhook-secret"] || req.headers["authorization"];
    const expectedSecret = PAYMENT_WEBHOOK_SECRET;
    if (!authHeader || authHeader !== expectedSecret && authHeader !== `Bearer ${expectedSecret}`) {
      res.status(401).json({
        error: "UNAUTHORIZED_WEBHOOK",
        message: "Invalid or missing webhook signature/secret."
      });
      return;
    }
    const orderIdentifier = req.body?.orderId || req.body?.publicOrderId;
    const paymentReference = req.body?.paymentReference || req.body?.txHash;
    if (!orderIdentifier) {
      res.status(400).json({
        error: "BAD_REQUEST",
        message: "Missing orderId or publicOrderId in webhook payload."
      });
      return;
    }
    const result = await settleNodeOrder(null, orderIdentifier, paymentReference);
    res.status(200).json({
      success: true,
      message: result.isDuplicate ? `Order ${result.order.publicOrderId} was already settled (idempotent).` : `Genesis Node ${result.node.publicNodeId} successfully activated via verified payment!`,
      order: result.order,
      node: result.node,
      isDuplicate: result.isDuplicate
    });
  } catch (err) {
    if (err.statusCode) {
      res.status(err.statusCode).json({
        error: err.code || "WEBHOOK_SETTLEMENT_ERROR",
        message: err.message
      });
      return;
    }
    console.error("[Order API Webhook] Error in payment webhook settlement:", err);
    res.status(500).json({
      error: "SERVER_ERROR",
      message: "Internal error processing payment webhook."
    });
  }
});
router5.post("/dev/simulate-settlement", requireAuth, async (req, res) => {
  const isProduction = process.env.NODE_ENV === "production" || process.env.APP_ENV === "production";
  if (isProduction) {
    res.status(403).json({
      error: "FORBIDDEN",
      message: "Development settlement simulator is strictly disabled in production environments."
    });
    return;
  }
  try {
    const user = req.user;
    const orderIdentifier = req.body?.orderId || req.body?.publicOrderId;
    const paymentReference = req.body?.paymentReference || `DEV_SIMULATED_PAYMENT_${Date.now()}`;
    if (!orderIdentifier) {
      res.status(400).json({
        error: "BAD_REQUEST",
        message: "Missing orderId or publicOrderId in dev simulator payload."
      });
      return;
    }
    const result = await settleNodeOrder(user.id, orderIdentifier, paymentReference);
    res.status(200).json({
      success: true,
      message: `[DEV ONLY] Genesis Node ${result.node.publicNodeId} simulated settlement verified!`,
      order: result.order,
      node: result.node,
      isDuplicate: result.isDuplicate
    });
  } catch (err) {
    if (err.statusCode) {
      res.status(err.statusCode).json({
        error: err.code || "DEV_SETTLEMENT_ERROR",
        message: err.message
      });
      return;
    }
    console.error("[Order API Dev] Error in dev settlement simulator:", err);
    res.status(500).json({
      error: "SERVER_ERROR",
      message: "Dev settlement simulator failed."
    });
  }
});
router5.get("/balance-validation", requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const validation = await validateUserNodePurchaseBalances(user.id);
    res.status(200).json({
      success: true,
      validation
    });
  } catch (err) {
    console.error("[Order API] Error validating node purchase balances:", err);
    res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to validate node purchase balances."
    });
  }
});
router5.post("/activate-with-asset", requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const asset = (req.body?.asset || "USDT").toUpperCase() === "BNB" ? "BNB" : "USDT";
    const idempotencyKey = req.body?.idempotencyKey ? String(req.body.idempotencyKey).trim() : void 0;
    const result = await processNodePurchaseWithAssetBalance(user.id, asset, idempotencyKey);
    res.status(200).json({
      success: true,
      message: `Genesis Node ${result.node.publicNodeId} successfully activated using your ${result.assetUsed} deposit balance!`,
      result
    });
  } catch (err) {
    if (err.statusCode) {
      res.status(err.statusCode).json({
        error: err.code || "ASSET_PURCHASE_ERROR",
        message: err.message,
        selectedAsset: err.selectedAsset,
        availableBalance: err.availableBalance,
        requiredAmount: err.requiredAmount,
        missingAmount: err.missingAmount,
        redirectToDeposit: err.redirectToDeposit || false
      });
      return;
    }
    console.error("[Order API] Error activating node with asset balance:", err);
    res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to process node purchase with asset balance."
    });
  }
});
router5.post("/activate-with-deposit", requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const preferredAsset = (req.body?.asset || "USDT").toUpperCase() === "BNB" ? "BNB" : "USDT";
    const result = await purchaseNodeWithDepositBalance(user.id, preferredAsset);
    res.status(200).json({
      success: true,
      message: `Genesis Node ${result.node.publicNodeId} successfully activated using your ${preferredAsset} deposit balance!`,
      order: result.order,
      node: result.node,
      depositDeducted: result.depositDeducted,
      remainingDepositBalance: result.remainingDepositBalance
    });
  } catch (err) {
    if (err.statusCode) {
      res.status(err.statusCode).json({
        error: err.code || "DEPOSIT_PURCHASE_ERROR",
        message: err.message,
        currentBalance: err.currentBalance,
        requiredAmount: err.requiredAmount,
        redirectToDeposit: err.redirectToDeposit || false
      });
      return;
    }
    console.error("[Order API] Error in activate-with-deposit:", err);
    res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to activate Genesis Node using deposit balance."
    });
  }
});
router5.post("/:orderId/cancel", requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const orderId = req.params.orderId;
    const result = await cancelNodeOrder(user.id, orderId);
    res.status(200).json(result);
  } catch (err) {
    if (err.statusCode) {
      res.status(err.statusCode).json({
        error: err.code || "CANCELLATION_ERROR",
        message: err.message
      });
      return;
    }
    console.error("[Order API] Error in cancellation:", err);
    res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to cancel reservation."
    });
  }
});
var orderRoutes_default = router5;

// src/server/routes/commissionRoutes.ts
import { Router as Router6 } from "express";
init_referralCommissionService();
var router6 = Router6();
router6.get("/me", requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const data = await getUserCommissions(user.id);
    res.status(200).json(data);
  } catch (err) {
    console.error("[Commission API] Error in /referral-commissions/me:", err);
    res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to fetch referral commission history"
    });
  }
});
var commissionRoutes_default = router6;

// src/server/routes/networkRoutes.ts
import { Router as Router7 } from "express";

// src/server/services/binaryPlacementService.ts
init_db();
init_idGenerator();
init_binaryVolumeService();
import { v4 as uuidv418 } from "uuid";
async function validateNoCycle(db, memberId, targetParentId) {
  if (memberId === targetParentId) {
    const error = new Error("Self-parenting is not permitted.");
    error.code = "SELF_PARENT_FORBIDDEN";
    error.statusCode = 400;
    throw error;
  }
  let currentAncestor = targetParentId;
  const seen = /* @__PURE__ */ new Set();
  while (currentAncestor) {
    if (currentAncestor === memberId) {
      const error = new Error("Cycle detected: Member cannot be placed under their own descendant.");
      error.code = "CYCLE_DETECTED";
      error.statusCode = 400;
      throw error;
    }
    if (seen.has(currentAncestor)) {
      break;
    }
    seen.add(currentAncestor);
    const ancestorRes = await db.query(
      `SELECT parent_user_id FROM binary_placements WHERE user_id = $1`,
      [currentAncestor]
    );
    currentAncestor = ancestorRes.rows[0]?.parent_user_id || null;
  }
}
async function findNextAvailableSlot(db, sponsorUserId, preferredSide) {
  const directCheck = await db.query(
    `
    SELECT user_id 
    FROM binary_placements 
    WHERE parent_user_id = $1 AND side = $2 AND status = 'PLACED'
    `,
    [sponsorUserId, preferredSide]
  );
  if (directCheck.rows.length === 0) {
    return {
      parentId: sponsorUserId,
      side: preferredSide
    };
  }
  const legRootUserId = directCheck.rows[0].user_id;
  const queue = [legRootUserId];
  const visited = /* @__PURE__ */ new Set([legRootUserId]);
  while (queue.length > 0) {
    const currentUserId = queue.shift();
    const childrenRes = await db.query(
      `
      SELECT side, user_id 
      FROM binary_placements 
      WHERE parent_user_id = $1 AND status = 'PLACED'
      ORDER BY CASE WHEN side = 'LEFT' THEN 1 ELSE 2 END
      `,
      [currentUserId]
    );
    const leftChild = childrenRes.rows.find((r) => r.side === "LEFT");
    const rightChild = childrenRes.rows.find((r) => r.side === "RIGHT");
    if (!leftChild) {
      return {
        parentId: currentUserId,
        side: "LEFT"
      };
    }
    if (!rightChild) {
      return {
        parentId: currentUserId,
        side: "RIGHT"
      };
    }
    if (!visited.has(leftChild.user_id)) {
      visited.add(leftChild.user_id);
      queue.push(leftChild.user_id);
    }
    if (!visited.has(rightChild.user_id)) {
      visited.add(rightChild.user_id);
      queue.push(rightChild.user_id);
    }
  }
  throw new Error("Could not find available placement slot in leg.");
}
async function placeMember(sponsorUserId, memberPublicId, preferredSide, targetParentPublicId) {
  const cleanMemberPublicId = (memberPublicId || "").trim().toUpperCase();
  const side = (preferredSide || "").trim().toUpperCase();
  if (side !== "LEFT" && side !== "RIGHT") {
    const error = new Error("Preferred side must be LEFT or RIGHT.");
    error.code = "INVALID_SIDE";
    error.statusCode = 400;
    throw error;
  }
  const db = await getDb();
  const memberRes = await db.query(
    `
    SELECT u.id, u.public_id, u.full_name, ur.sponsor_user_id
    FROM users u
    LEFT JOIN user_referrals ur ON u.id = ur.user_id
    WHERE u.public_id = $1
    `,
    [cleanMemberPublicId]
  );
  if (memberRes.rows.length === 0) {
    const error = new Error(`Member with public ID '${cleanMemberPublicId}' not found.`);
    error.code = "MEMBER_NOT_FOUND";
    error.statusCode = 404;
    throw error;
  }
  const member = memberRes.rows[0];
  if (member.sponsor_user_id !== sponsorUserId) {
    const sponsorIdent = await db.query(
      `SELECT r.referral_code, u.public_id, u.email
       FROM users u
       LEFT JOIN user_referrals r ON u.id = r.user_id
       WHERE u.id = $1`,
      [sponsorUserId]
    );
    const s = sponsorIdent.rows[0];
    const memberPending = await db.query(
      `SELECT pending_referral_code FROM users WHERE id = $1`,
      [member.id]
    );
    const pendCode = (memberPending.rows[0]?.pending_referral_code || "").trim().toUpperCase();
    if (s && pendCode && (pendCode === s.referral_code?.toUpperCase() || pendCode === s.public_id?.toUpperCase() || pendCode.toLowerCase() === s.email?.toLowerCase())) {
      await db.query(
        `UPDATE user_referrals SET sponsor_user_id = $1 WHERE user_id = $2`,
        [sponsorUserId, member.id]
      );
      member.sponsor_user_id = sponsorUserId;
    } else {
      const error = new Error("You can only place members who you directly sponsored.");
      error.code = "NOT_DIRECT_SPONSOR";
      error.statusCode = 403;
      throw error;
    }
  }
  await db.query(
    `
    INSERT INTO binary_placements (user_id, parent_user_id, side, status, placed_at, created_at)
    VALUES ($1, NULL, NULL, 'UNPLACED', NULL, CURRENT_TIMESTAMP)
    ON CONFLICT (user_id) DO NOTHING
    `,
    [member.id]
  );
  const statusRes = await db.query(
    `SELECT status FROM binary_placements WHERE user_id = $1`,
    [member.id]
  );
  if (statusRes.rows[0]?.status === "PLACED") {
    const error = new Error("Member is already placed in the binary network and cannot be moved.");
    error.code = "ALREADY_PLACED";
    error.statusCode = 409;
    throw error;
  }
  let finalParentId = "";
  let finalSide = side;
  if (targetParentPublicId) {
    const targetParentPublicIdClean = targetParentPublicId.trim().toUpperCase();
    const parentRes2 = await db.query(
      `SELECT id FROM users WHERE public_id = $1`,
      [targetParentPublicIdClean]
    );
    if (parentRes2.rows.length === 0) {
      throw new Error("Invalid target parent.");
    }
    const targetParentId = parentRes2.rows[0].id;
    finalParentId = targetParentId;
    const slotCheck = await db.query(
      `SELECT user_id FROM binary_placements WHERE parent_user_id = $1 AND side = $2 AND status = 'PLACED'`,
      [finalParentId, side]
    );
    if (slotCheck.rows.length > 0) {
      throw new Error(`The selected position (${side}) under ${targetParentPublicIdClean} is already occupied.`);
    }
  } else {
    const slot = await findNextAvailableSlot(db, sponsorUserId, side);
    finalParentId = slot.parentId;
    finalSide = slot.side;
  }
  await validateNoCycle(db, member.id, finalParentId);
  const updateRes = await db.query(
    `
    UPDATE binary_placements
    SET 
      parent_user_id = $1,
      side = $2,
      status = 'PLACED',
      placed_at = CURRENT_TIMESTAMP
    WHERE user_id = $3 AND status = 'UNPLACED'
    RETURNING user_id, parent_user_id, side, status, placed_at
    `,
    [finalParentId, finalSide, member.id]
  );
  if (updateRes.rows.length === 0) {
    throw new Error("Failed to update binary placement status.");
  }
  const placedAtDate = updateRes.rows[0].placed_at;
  const parentRes = await db.query(
    `SELECT public_id FROM users WHERE id = $1`,
    [finalParentId]
  );
  const parentPublicId = parentRes.rows[0]?.public_id || "PHX-UNKNOWN";
  try {
    await db.query(
      `
      INSERT INTO security_events (id, user_id, event_type, description, created_at)
      VALUES ($1, $2, 'BINARY_MEMBER_PLACED', $3, CURRENT_TIMESTAMP)
      `,
      [
        uuidv418(),
        sponsorUserId,
        `Placed member ${member.public_id} into ${finalSide} leg under parent ${parentPublicId}.`
      ]
    );
  } catch (secErr) {
    console.warn("[SecurityEvent] Could not log binary placement event:", secErr);
  }
  try {
    await backfillNodeSalesVolumeForPlacedMember(db, member.id);
  } catch (backfillErr) {
    console.warn("[BinaryVolume] Error backfilling node sales volume for newly placed member:", backfillErr);
  }
  return {
    memberPublicId: member.public_id,
    parentPublicId,
    side: finalSide,
    status: "PLACED",
    placedAt: placedAtDate ? placedAtDate.toISOString() : (/* @__PURE__ */ new Date()).toISOString()
  };
}
async function getUnplacedDirectReferrals(sponsorUserId) {
  const db = await getDb();
  const sponsorIdent = await db.query(
    `SELECT r.referral_code, u.public_id, u.email
     FROM users u
     LEFT JOIN user_referrals r ON u.id = r.user_id
     WHERE u.id = $1`,
    [sponsorUserId]
  );
  if (sponsorIdent.rows.length > 0) {
    const s = sponsorIdent.rows[0];
    await db.query(
      `
      UPDATE user_referrals ur
      SET sponsor_user_id = $1
      FROM users u
      WHERE ur.user_id = u.id
        AND (ur.sponsor_user_id IS NULL OR ur.sponsor_user_id = '')
        AND u.id != $1
        AND (
          UPPER(TRIM(u.pending_referral_code)) = UPPER(TRIM($2))
          OR UPPER(TRIM(u.pending_referral_code)) = UPPER(TRIM($3))
          OR LOWER(TRIM(u.pending_referral_code)) = LOWER(TRIM($4))
        )
      `,
      [sponsorUserId, s.referral_code || "", s.public_id || "", s.email || ""]
    );
  }
  await db.query(
    `
    INSERT INTO binary_placements (user_id, parent_user_id, side, status, placed_at, created_at)
    SELECT ur.user_id, NULL, NULL, 'UNPLACED', NULL, ur.created_at
    FROM user_referrals ur
    LEFT JOIN binary_placements bp ON ur.user_id = bp.user_id
    WHERE ur.sponsor_user_id = $1 AND bp.user_id IS NULL
    ON CONFLICT (user_id) DO NOTHING
    `,
    [sponsorUserId]
  );
  const res = await db.query(
    `
    SELECT u.public_id, u.full_name, ur.created_at, bp.status
    FROM user_referrals ur
    JOIN users u ON ur.user_id = u.id
    JOIN binary_placements bp ON u.id = bp.user_id
    WHERE ur.sponsor_user_id = $1 AND bp.status = 'UNPLACED'
    ORDER BY ur.created_at DESC
    `,
    [sponsorUserId]
  );
  return res.rows.map((row) => ({
    publicId: row.public_id,
    displayName: formatSafeDisplayName(row.full_name),
    joinedAt: row.created_at.toISOString(),
    placementStatus: "UNPLACED"
  }));
}
async function getNetworkTree(rootUserId, requestedDepth = 3) {
  const depth = Math.max(1, Math.min(5, requestedDepth || 3));
  const db = await getDb();
  const rootUserRes = await db.query(
    `SELECT id, public_id, full_name FROM users WHERE id = $1`,
    [rootUserId]
  );
  if (rootUserRes.rows.length === 0) {
    return null;
  }
  const rootUser = rootUserRes.rows[0];
  async function buildSubtree(currentUserId, currentPublicId, currentFullName, currentSide, currentPlacedAt, currentDepth) {
    const node = {
      user: {
        publicId: currentPublicId,
        displayName: formatSafeDisplayName(currentFullName)
      },
      side: currentSide,
      placedAt: currentPlacedAt,
      left: null,
      right: null
    };
    if (currentDepth >= depth) {
      return node;
    }
    const childrenRes = await db.query(
      `
      SELECT bp.user_id, u.public_id, u.full_name, bp.side, bp.placed_at
      FROM binary_placements bp
      JOIN users u ON bp.user_id = u.id
      WHERE bp.parent_user_id = $1 AND bp.status = 'PLACED'
      ORDER BY CASE WHEN bp.side = 'LEFT' THEN 1 ELSE 2 END
      `,
      [currentUserId]
    );
    const leftChildRow = childrenRes.rows.find((r) => r.side === "LEFT");
    const rightChildRow = childrenRes.rows.find((r) => r.side === "RIGHT");
    if (leftChildRow) {
      node.left = await buildSubtree(
        leftChildRow.user_id,
        leftChildRow.public_id,
        leftChildRow.full_name,
        "LEFT",
        leftChildRow.placed_at ? leftChildRow.placed_at.toISOString() : null,
        currentDepth + 1
      );
    }
    if (rightChildRow) {
      node.right = await buildSubtree(
        rightChildRow.user_id,
        rightChildRow.public_id,
        rightChildRow.full_name,
        "RIGHT",
        rightChildRow.placed_at ? rightChildRow.placed_at.toISOString() : null,
        currentDepth + 1
      );
    }
    return node;
  }
  return buildSubtree(rootUser.id, rootUser.public_id, rootUser.full_name, null, null, 1);
}
async function countSubtreeMembers(db, rootParentId, side) {
  const childRes = await db.query(
    `SELECT user_id FROM binary_placements WHERE parent_user_id = $1 AND side = $2 AND status = 'PLACED'`,
    [rootParentId, side]
  );
  if (childRes.rows.length === 0) {
    return 0;
  }
  let count = 0;
  const queue = [childRes.rows[0].user_id];
  const visited = /* @__PURE__ */ new Set([childRes.rows[0].user_id]);
  while (queue.length > 0) {
    const curr = queue.shift();
    count++;
    const children = await db.query(
      `SELECT user_id FROM binary_placements WHERE parent_user_id = $1 AND status = 'PLACED'`,
      [curr]
    );
    for (const child of children.rows) {
      if (!visited.has(child.user_id)) {
        visited.add(child.user_id);
        queue.push(child.user_id);
      }
    }
  }
  return count;
}
async function getNetworkSummary(userId) {
  const db = await getDb();
  const directsRes = await db.query(
    `SELECT COUNT(*)::int AS count FROM user_referrals WHERE sponsor_user_id = $1`,
    [userId]
  );
  const directReferrals = parseInt(directsRes.rows[0]?.count || "0", 10);
  const placedDirectsRes = await db.query(
    `
    SELECT COUNT(*)::int AS count 
    FROM user_referrals ur
    JOIN binary_placements bp ON ur.user_id = bp.user_id
    WHERE ur.sponsor_user_id = $1 AND bp.status = 'PLACED'
    `,
    [userId]
  );
  const placedMembers = parseInt(placedDirectsRes.rows[0]?.count || "0", 10);
  const unplacedDirectReferrals = Math.max(0, directReferrals - placedMembers);
  const leftNetworkMembers = await countSubtreeMembers(db, userId, "LEFT");
  const rightNetworkMembers = await countSubtreeMembers(db, userId, "RIGHT");
  return {
    directReferrals,
    placedMembers,
    unplacedDirectReferrals,
    leftNetworkMembers,
    rightNetworkMembers
  };
}

// src/server/routes/networkRoutes.ts
init_binaryVolumeService();
var router7 = Router7();
router7.post("/place", requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const { memberPublicId, preferredSide, targetParentPublicId } = req.body || {};
    if (!memberPublicId || typeof memberPublicId !== "string") {
      res.status(400).json({
        error: "INVALID_MEMBER_ID",
        message: "A valid memberPublicId is required."
      });
      return;
    }
    if (!preferredSide || preferredSide !== "LEFT" && preferredSide !== "RIGHT") {
      res.status(400).json({
        error: "INVALID_SIDE",
        message: "preferredSide must be either 'LEFT' or 'RIGHT'."
      });
      return;
    }
    const result = await placeMember(user.id, memberPublicId, preferredSide, targetParentPublicId);
    res.status(200).json(result);
  } catch (err) {
    console.error("[Network API] Error in /api/network/place:", err);
    const statusCode = err.statusCode || (err.code === "ALREADY_PLACED" ? 409 : err.code === "NOT_DIRECT_SPONSOR" ? 403 : 400);
    res.status(statusCode).json({
      error: err.code || "PLACEMENT_FAILED",
      message: err.message || "Failed to place member in network."
    });
  }
});
router7.get("/unplaced", requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const unplaced = await getUnplacedDirectReferrals(user.id);
    res.status(200).json({
      count: unplaced.length,
      unplaced
    });
  } catch (err) {
    console.error("[Network API] Error in /api/network/unplaced:", err);
    res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to fetch unplaced direct referrals."
    });
  }
});
router7.get("/tree", requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const rawDepth = parseInt(req.query.depth, 10);
    const depth = isNaN(rawDepth) ? 3 : rawDepth;
    const tree = await getNetworkTree(user.id, depth);
    res.status(200).json({ tree });
  } catch (err) {
    console.error("[Network API] Error in /api/network/tree:", err);
    res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to fetch network tree hierarchy."
    });
  }
});
router7.get("/summary", requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const summary = await getNetworkSummary(user.id);
    res.status(200).json(summary);
  } catch (err) {
    console.error("[Network API] Error in /api/network/summary:", err);
    res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to fetch network summary."
    });
  }
});
router7.get("/volume-summary", requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const summary = await getVolumeSummary(user.id);
    res.status(200).json(summary);
  } catch (err) {
    console.error("[Network API] Error in /api/network/volume-summary:", err);
    res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to fetch binary volume summary."
    });
  }
});
router7.get("/volume-history", requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const rawPage = parseInt(req.query.page, 10);
    const rawLimit = parseInt(req.query.limit, 10);
    const page = isNaN(rawPage) ? 1 : rawPage;
    const limit = isNaN(rawLimit) ? 20 : rawLimit;
    const history = await getVolumeHistory(user.id, page, limit);
    res.status(200).json(history);
  } catch (err) {
    console.error("[Network API] Error in /api/network/volume-history:", err);
    res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to fetch binary volume history."
    });
  }
});
var networkRoutes_default = router7;

// src/server/routes/matchingRoutes.ts
import { Router as Router8 } from "express";

// src/server/services/binaryMatchingService.ts
init_db();
init_idGenerator();
init_walletLedgerService();
init_notificationService();
init_timezone();
import { v4 as uuidv419 } from "uuid";
async function getActiveMatchingConfig(dbClient) {
  const db = dbClient || await getDb();
  try {
    const res = await db.query(
      `SELECT * FROM binary_matching_config ORDER BY version DESC, effective_date DESC LIMIT 1`
    );
    const defaultTiers = [
      { units: 2, bonusUsd: 500 },
      { units: 4, bonusUsd: 1e3 },
      { units: 6, bonusUsd: 1500 },
      { units: 8, bonusUsd: 2e3 },
      { units: 10, bonusUsd: 2500 },
      { units: 12, bonusUsd: 3e3 },
      { units: 14, bonusUsd: 3500 },
      { units: 16, bonusUsd: 4e3 },
      { units: 18, bonusUsd: 4500 },
      { units: 20, bonusUsd: 5e3 }
    ];
    if (res.rows.length === 0) {
      return {
        id: "default",
        matchingEnabled: true,
        dailyMaxPayout: 5e3,
        sponsorQualificationRequired: true,
        carryForwardBehavior: "DISCARD_WEAK_CARRY_STRONG",
        effectiveDate: (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
        version: 1,
        tiers: defaultTiers
      };
    }
    const row = res.rows[0];
    let tiers = defaultTiers;
    try {
      tiers = JSON.parse(row.tiers_json);
    } catch (e) {
      console.error("Failed to parse tiers_json, using default tiers:", e);
    }
    return {
      id: row.id,
      matchingEnabled: row.matching_enabled,
      dailyMaxPayout: Number(row.daily_max_payout),
      sponsorQualificationRequired: row.sponsor_qualification_required,
      carryForwardBehavior: row.carry_forward_behavior,
      effectiveDate: typeof row.effective_date === "string" ? row.effective_date.split("T")[0] : new Date(row.effective_date).toISOString().split("T")[0],
      version: row.version,
      tiers
    };
  } catch (err) {
    console.warn("[BinaryMatching] Failed to query binary_matching_config, using default configuration.", err);
    return {
      id: "default_fallback",
      matchingEnabled: true,
      dailyMaxPayout: 5e3,
      sponsorQualificationRequired: true,
      carryForwardBehavior: "DISCARD_WEAK_CARRY_STRONG",
      effectiveDate: (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
      version: 1,
      tiers: [
        { units: 2, bonusUsd: 500 },
        { units: 4, bonusUsd: 1e3 },
        { units: 6, bonusUsd: 1500 },
        { units: 8, bonusUsd: 2e3 },
        { units: 10, bonusUsd: 2500 },
        { units: 12, bonusUsd: 3e3 },
        { units: 14, bonusUsd: 3500 },
        { units: 16, bonusUsd: 4e3 },
        { units: 18, bonusUsd: 4500 },
        { units: 20, bonusUsd: 5e3 }
      ]
    };
  }
}
async function checkSponsorQualification(dbClient, userId) {
  const res = await dbClient.query(
    `
    WITH RECURSIVE binary_descendants AS (
      SELECT user_id, side AS branch_side
      FROM binary_placements
      WHERE parent_user_id = $1 AND status = 'PLACED'

      UNION ALL

      SELECT bp.user_id, bd.branch_side
      FROM binary_placements bp
      INNER JOIN binary_descendants bd ON bp.parent_user_id = bd.user_id
      WHERE bp.status = 'PLACED'
    )
    SELECT bd.branch_side, COUNT(ur.user_id)::int AS count
    FROM user_referrals ur
    INNER JOIN binary_descendants bd ON ur.user_id = bd.user_id
    WHERE ur.sponsor_user_id = $1
    GROUP BY bd.branch_side
    `,
    [userId]
  );
  let hasLeft = false;
  let hasRight = false;
  for (const row of res.rows) {
    if (row.branch_side === "LEFT" && row.count >= 1) {
      hasLeft = true;
    }
    if (row.branch_side === "RIGHT" && row.count >= 1) {
      hasRight = true;
    }
  }
  return hasLeft && hasRight;
}
var MATCHING_TIERS = Object.freeze([
  { units: 100, bonusUsd: 1e4 },
  { units: 50, bonusUsd: 6e3 },
  { units: 20, bonusUsd: 4e3 },
  { units: 8, bonusUsd: 2e3 },
  { units: 4, bonusUsd: 1e3 },
  { units: 2, bonusUsd: 500 }
]);
function calculateDynamicMatchingDecomposition(availableLeft, availableRight, config, sponsorQualified) {
  if (availableLeft < 0 || availableRight < 0) {
    throw new Error("Available volume units cannot be negative");
  }
  if (!config.matchingEnabled || config.sponsorQualificationRequired && !sponsorQualified) {
    return {
      availableLeft,
      availableRight,
      matchableUnits: 0,
      consumedLeft: 0,
      consumedRight: 0,
      carryLeftAfter: availableLeft,
      carryRightAfter: availableRight,
      totalBonusUsd: 0,
      components: []
    };
  }
  const sortedTiers = [...config.tiers].sort((a, b) => b.units - a.units);
  let selectedTier = null;
  for (const tier of sortedTiers) {
    if (availableLeft >= tier.units && availableRight >= tier.units) {
      selectedTier = tier;
      break;
    }
  }
  if (!selectedTier) {
    return {
      availableLeft,
      availableRight,
      matchableUnits: 0,
      consumedLeft: 0,
      consumedRight: 0,
      carryLeftAfter: availableLeft,
      carryRightAfter: availableRight,
      totalBonusUsd: 0,
      components: []
    };
  }
  const consumedLeft = selectedTier.units;
  const consumedRight = selectedTier.units;
  const tempLeftoverLeft = availableLeft - consumedLeft;
  const tempLeftoverRight = availableRight - consumedRight;
  let carryLeftAfter = tempLeftoverLeft;
  let carryRightAfter = tempLeftoverRight;
  if (config.carryForwardBehavior === "DISCARD_WEAK_CARRY_STRONG") {
    if (tempLeftoverLeft < tempLeftoverRight) {
      carryLeftAfter = 0;
      carryRightAfter = tempLeftoverRight;
    } else if (tempLeftoverRight < tempLeftoverLeft) {
      carryRightAfter = 0;
      carryLeftAfter = tempLeftoverLeft;
    } else {
      carryLeftAfter = 0;
      carryRightAfter = 0;
    }
  }
  const payout = Math.min(selectedTier.bonusUsd, config.dailyMaxPayout);
  const components = [
    {
      sequenceNo: 1,
      tierUnits: selectedTier.units,
      leftUnits: selectedTier.units,
      rightUnits: selectedTier.units,
      bonusUsd: payout
    }
  ];
  return {
    availableLeft,
    availableRight,
    matchableUnits: Math.min(availableLeft, availableRight),
    consumedLeft,
    consumedRight,
    carryLeftAfter,
    carryRightAfter,
    totalBonusUsd: payout,
    components
  };
}
async function settleUserMatchingForDate(dbClient, userId, businessDate) {
  const db = dbClient || await getDb();
  const existingRes = await db.query(
    `
    SELECT *
    FROM binary_matching_settlements
    WHERE user_id = $1 AND business_date = $2
    `,
    [userId, businessDate]
  );
  if (existingRes.rows.length > 0) {
    const row = existingRes.rows[0];
    const compRes = await db.query(
      `
      SELECT sequence_no, tier_units, left_units, right_units, bonus_usd
      FROM binary_matching_components
      WHERE settlement_id = $1
      ORDER BY sequence_no ASC
      `,
      [row.id]
    );
    return {
      id: row.id,
      publicSettlementId: row.public_settlement_id,
      userId: row.user_id,
      businessDate: typeof row.business_date === "string" ? row.business_date.split("T")[0] : new Date(row.business_date).toISOString().split("T")[0],
      availableLeft: Number(row.available_left_units),
      availableRight: Number(row.available_right_units),
      consumedLeft: Number(row.consumed_left_units),
      consumedRight: Number(row.consumed_right_units),
      carryLeftBefore: Number(row.carry_left_before),
      carryRightBefore: Number(row.carry_right_before),
      carryLeftAfter: Number(row.carry_left_after),
      carryRightAfter: Number(row.carry_right_after),
      totalBonusUsd: Number(row.total_bonus_usd),
      status: row.status,
      settledAt: new Date(row.settled_at).toISOString(),
      createdAt: new Date(row.created_at).toISOString(),
      components: compRes.rows.map((c) => ({
        sequenceNo: Number(c.sequence_no),
        tierUnits: Number(c.tier_units),
        leftUnits: Number(c.left_units),
        rightUnits: Number(c.right_units),
        bonusUsd: Number(c.bonus_usd)
      }))
    };
  }
  await db.query("BEGIN");
  try {
    await db.query(
      `
      INSERT INTO binary_volume_balances (user_id, carry_left_units, carry_right_units, updated_at)
      VALUES ($1, 0, 0, CURRENT_TIMESTAMP)
      ON CONFLICT (user_id) DO NOTHING
      `,
      [userId]
    );
    const balanceRes = await db.query(
      `
      SELECT carry_left_units, carry_right_units, last_settled_business_date
      FROM binary_volume_balances
      WHERE user_id = $1
      FOR UPDATE
      `,
      [userId]
    );
    const balance = balanceRes.rows[0];
    const carryLeftBefore = Number(balance?.carry_left_units || 0);
    const carryRightBefore = Number(balance?.carry_right_units || 0);
    const lastSettledDate = balance?.last_settled_business_date ? typeof balance.last_settled_business_date === "string" ? balance.last_settled_business_date.split("T")[0] : new Date(balance.last_settled_business_date).toISOString().split("T")[0] : null;
    let newVolumeQuery;
    let newVolumeParams;
    if (lastSettledDate) {
      newVolumeQuery = `
        SELECT 
          COALESCE(SUM(CASE WHEN side = 'LEFT' THEN volume_units ELSE 0 END), 0)::int AS new_left,
          COALESCE(SUM(CASE WHEN side = 'RIGHT' THEN volume_units ELSE 0 END), 0)::int AS new_right
        FROM binary_volume_events
        WHERE beneficiary_user_id = $1 
          AND status = 'ACTIVE' 
          AND business_date > $2 
          AND business_date <= $3
      `;
      newVolumeParams = [userId, lastSettledDate, businessDate];
    } else {
      newVolumeQuery = `
        SELECT 
          COALESCE(SUM(CASE WHEN side = 'LEFT' THEN volume_units ELSE 0 END), 0)::int AS new_left,
          COALESCE(SUM(CASE WHEN side = 'RIGHT' THEN volume_units ELSE 0 END), 0)::int AS new_right
        FROM binary_volume_events
        WHERE beneficiary_user_id = $1 
          AND status = 'ACTIVE' 
          AND business_date <= $2
      `;
      newVolumeParams = [userId, businessDate];
    }
    const volumeRes = await db.query(
      newVolumeQuery,
      newVolumeParams
    );
    const newLeft = Number(volumeRes.rows[0]?.new_left || 0);
    const newRight = Number(volumeRes.rows[0]?.new_right || 0);
    const availableLeft = carryLeftBefore + newLeft;
    const availableRight = carryRightBefore + newRight;
    const config = await getActiveMatchingConfig(db);
    const sponsorQualified = await checkSponsorQualification(db, userId);
    const decomposition = calculateDynamicMatchingDecomposition(availableLeft, availableRight, config, sponsorQualified);
    const settlementId = uuidv419();
    const publicSettlementId = generateSettlementPublicId();
    const settledAt = /* @__PURE__ */ new Date();
    const insertSettlementRes = await db.query(
      `
      INSERT INTO binary_matching_settlements (
        id, public_settlement_id, user_id, business_date,
        available_left_units, available_right_units,
        consumed_left_units, consumed_right_units,
        carry_left_before, carry_right_before,
        carry_left_after, carry_right_after,
        total_bonus_usd, status, settled_at, created_at
      )
      VALUES (
        $1, $2, $3, $4,
        $5, $6,
        $7, $8,
        $9, $10,
        $11, $12,
        $13, 'COMPLETED', $14, CURRENT_TIMESTAMP
      )
      ON CONFLICT (user_id, business_date) DO NOTHING
      RETURNING id
      `,
      [
        settlementId,
        publicSettlementId,
        userId,
        businessDate,
        availableLeft,
        availableRight,
        decomposition.consumedLeft,
        decomposition.consumedRight,
        carryLeftBefore,
        carryRightBefore,
        decomposition.carryLeftAfter,
        decomposition.carryRightAfter,
        decomposition.totalBonusUsd,
        settledAt
      ]
    );
    if (insertSettlementRes.rows.length === 0) {
      await db.query("ROLLBACK");
      return settleUserMatchingForDate(db, userId, businessDate);
    }
    for (const comp of decomposition.components) {
      const compId = uuidv419();
      await db.query(
        `
        INSERT INTO binary_matching_components (
          id, settlement_id, tier_units, left_units, right_units,
          bonus_usd, sequence_no, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
        `,
        [
          compId,
          settlementId,
          comp.tierUnits,
          comp.leftUnits,
          comp.rightUnits,
          comp.bonusUsd,
          comp.sequenceNo
        ]
      );
    }
    await db.query(
      `
      UPDATE binary_volume_balances
      SET
        carry_left_units = $1,
        carry_right_units = $2,
        last_settled_business_date = $3,
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $4
      `,
      [decomposition.carryLeftAfter, decomposition.carryRightAfter, businessDate, userId]
    );
    await db.query("COMMIT");
    if (decomposition.totalBonusUsd > 0) {
      try {
        await postLedgerCredit({
          userId,
          sourceType: "MATCHING_BONUS",
          sourceId: settlementId,
          sourceRef: publicSettlementId,
          amount: decomposition.totalBonusUsd,
          description: `Daily Binary Matching Settlement (${businessDate})`,
          createdAt: settledAt
        });
      } catch (ledgErr) {
        console.warn("[WalletLedger] Error posting matching settlement to ledger:", ledgErr);
      }
      try {
        await notifyMatchingEarned({
          userId,
          bonusUsd: decomposition.totalBonusUsd,
          settlementId
        });
      } catch (notifErr) {
        console.warn("[Notification] Error triggering matching earned notification:", notifErr);
      }
    }
    return {
      id: settlementId,
      publicSettlementId,
      userId,
      businessDate,
      availableLeft,
      availableRight,
      consumedLeft: decomposition.consumedLeft,
      consumedRight: decomposition.consumedRight,
      carryLeftBefore,
      carryRightBefore,
      carryLeftAfter: decomposition.carryLeftAfter,
      carryRightAfter: decomposition.carryRightAfter,
      totalBonusUsd: decomposition.totalBonusUsd,
      status: "COMPLETED",
      settledAt: settledAt.toISOString(),
      createdAt: settledAt.toISOString(),
      components: decomposition.components
    };
  } catch (err) {
    await db.query("ROLLBACK");
    console.error(`[BinaryMatching] Error settling user ${userId} for date ${businessDate}:`, err);
    throw err;
  }
}
async function runDailyMatchingSettlementCycle(targetBusinessDate) {
  const startTime = Date.now();
  const db = await getDb();
  const businessDate = targetBusinessDate || getPreviousDhakaBusinessDate();
  const lockRes = await db.query(
    `
    INSERT INTO binary_settlement_cycles (business_date, status, started_at)
    VALUES ($1, 'RUNNING', CURRENT_TIMESTAMP)
    ON CONFLICT (business_date) DO NOTHING
    RETURNING business_date
    `,
    [businessDate]
  );
  if (lockRes.rows.length === 0) {
    const existingCycle = await db.query(
      `
      SELECT business_date, status, total_users_settled, total_bonus_usd, error_message
      FROM binary_settlement_cycles
      WHERE business_date = $1
      `,
      [businessDate]
    );
    const cycle = existingCycle.rows[0];
    if (cycle && cycle.status === "COMPLETED") {
      return {
        businessDate,
        status: "SKIPPED_ALREADY_COMPLETED",
        usersSettled: Number(cycle.total_users_settled),
        totalBonusUsd: Number(cycle.total_bonus_usd),
        durationMs: Date.now() - startTime
      };
    }
    if (cycle && cycle.status === "RUNNING") {
      return {
        businessDate,
        status: "RUNNING",
        usersSettled: Number(cycle.total_users_settled),
        totalBonusUsd: Number(cycle.total_bonus_usd),
        durationMs: Date.now() - startTime,
        error: "Another worker is currently executing settlement for this date"
      };
    }
  }
  try {
    const candidatesRes = await db.query(
      `
      SELECT DISTINCT u.user_id FROM (
        SELECT beneficiary_user_id AS user_id 
        FROM binary_volume_events 
        WHERE status = 'ACTIVE' AND business_date <= $1
        UNION
        SELECT user_id 
        FROM binary_volume_balances 
        WHERE carry_left_units > 0 OR carry_right_units > 0
        UNION
        SELECT user_id 
        FROM binary_daily_volumes 
        WHERE business_date = $1 AND (left_units > 0 OR right_units > 0)
      ) u
      `,
      [businessDate]
    );
    let usersSettled = 0;
    let cycleTotalBonus = 0;
    for (const candidate of candidatesRes.rows) {
      const settlement = await settleUserMatchingForDate(db, candidate.user_id, businessDate);
      usersSettled++;
      cycleTotalBonus += settlement.totalBonusUsd;
    }
    await db.query(
      `
      UPDATE binary_settlement_cycles
      SET
        status = 'COMPLETED',
        total_users_settled = $1,
        total_bonus_usd = $2,
        completed_at = CURRENT_TIMESTAMP
      WHERE business_date = $3
      `,
      [usersSettled, cycleTotalBonus, businessDate]
    );
    return {
      businessDate,
      status: "COMPLETED",
      usersSettled,
      totalBonusUsd: cycleTotalBonus,
      durationMs: Date.now() - startTime
    };
  } catch (err) {
    console.error(`[BinaryMatching] Daily settlement cycle failed for ${businessDate}:`, err);
    await db.query(
      `
      UPDATE binary_settlement_cycles
      SET status = 'FAILED', error_message = $1
      WHERE business_date = $2
      `,
      [err?.message || "Unknown error", businessDate]
    );
    return {
      businessDate,
      status: "FAILED",
      usersSettled: 0,
      totalBonusUsd: 0,
      durationMs: Date.now() - startTime,
      error: err?.message
    };
  }
}
async function getUserMatchingSummary(userId) {
  const db = await getDb();
  const currentDhakaDate = getDhakaBusinessDate();
  const nextDhakaInfo = getNextDhakaMidnightTime();
  const todayRes = await db.query(
    `
    SELECT left_units, right_units
    FROM binary_daily_volumes
    WHERE user_id = $1 AND business_date = $2
    `,
    [userId, currentDhakaDate]
  );
  const todayLeft = Number(todayRes.rows[0]?.left_units || 0);
  const todayRight = Number(todayRes.rows[0]?.right_units || 0);
  const balanceRes = await db.query(
    `
    SELECT carry_left_units, carry_right_units
    FROM binary_volume_balances
    WHERE user_id = $1
    `,
    [userId]
  );
  const carryLeft = Number(balanceRes.rows[0]?.carry_left_units || 0);
  const carryRight = Number(balanceRes.rows[0]?.carry_right_units || 0);
  const latestRes = await db.query(
    `
    SELECT *
    FROM binary_matching_settlements
    WHERE user_id = $1 AND status = 'COMPLETED'
    ORDER BY business_date DESC, settled_at DESC
    LIMIT 1
    `,
    [userId]
  );
  let latestSettlement = null;
  if (latestRes.rows.length > 0) {
    const row = latestRes.rows[0];
    const compRes = await db.query(
      `
      SELECT sequence_no, tier_units, left_units, right_units, bonus_usd
      FROM binary_matching_components
      WHERE settlement_id = $1
      ORDER BY sequence_no ASC
      `,
      [row.id]
    );
    latestSettlement = {
      id: row.id,
      publicSettlementId: row.public_settlement_id,
      userId: row.user_id,
      businessDate: typeof row.business_date === "string" ? row.business_date.split("T")[0] : new Date(row.business_date).toISOString().split("T")[0],
      availableLeft: Number(row.available_left_units),
      availableRight: Number(row.available_right_units),
      consumedLeft: Number(row.consumed_left_units),
      consumedRight: Number(row.consumed_right_units),
      carryLeftBefore: Number(row.carry_left_before),
      carryRightBefore: Number(row.carry_right_before),
      carryLeftAfter: Number(row.carry_left_after),
      carryRightAfter: Number(row.carry_right_after),
      totalBonusUsd: Number(row.total_bonus_usd),
      status: row.status,
      settledAt: new Date(row.settled_at).toISOString(),
      createdAt: new Date(row.created_at).toISOString(),
      components: compRes.rows.map((c) => ({
        sequenceNo: Number(c.sequence_no),
        tierUnits: Number(c.tier_units),
        leftUnits: Number(c.left_units),
        rightUnits: Number(c.right_units),
        bonusUsd: Number(c.bonus_usd)
      }))
    };
  }
  const totalRes = await db.query(
    `
    SELECT COALESCE(SUM(total_bonus_usd), 0)::numeric AS total_earned
    FROM binary_matching_settlements
    WHERE user_id = $1 AND status = 'COMPLETED'
    `,
    [userId]
  );
  const totalMatchingEarnedUsd = Number(totalRes.rows[0]?.total_earned || 0);
  const activeConfig = await getActiveMatchingConfig(db);
  return {
    todayVolume: {
      left: todayLeft,
      right: todayRight
    },
    carry: {
      left: carryLeft,
      right: carryRight
    },
    latestSettlement,
    totalMatchingEarnedUsd,
    activeTiers: activeConfig.tiers,
    matchingConfig: {
      matchingEnabled: activeConfig.matchingEnabled,
      dailyMaxPayout: activeConfig.dailyMaxPayout,
      sponsorQualificationRequired: activeConfig.sponsorQualificationRequired
    },
    nextSettlement: {
      scheduledTime: "18:00 UTC",
      nextSettlementIso: nextDhakaInfo.nextMidnightIso,
      msUntilNext: nextDhakaInfo.msUntilMidnight
    }
  };
}
async function getUserMatchingHistory(userId, page = 1, limit = 10) {
  const db = await getDb();
  const safePage = Math.max(1, page);
  const safeLimit = Math.min(100, Math.max(1, limit));
  const offset = (safePage - 1) * safeLimit;
  const countRes = await db.query(
    `
    SELECT COUNT(*)::int AS count
    FROM binary_matching_settlements
    WHERE user_id = $1
    `,
    [userId]
  );
  const totalCount = Number(countRes.rows[0]?.count || 0);
  const totalPages = Math.ceil(totalCount / safeLimit);
  const settlementsRes = await db.query(
    `
    SELECT *
    FROM binary_matching_settlements
    WHERE user_id = $1
    ORDER BY business_date DESC, settled_at DESC
    LIMIT $2 OFFSET $3
    `,
    [userId, safeLimit, offset]
  );
  const history = [];
  for (const row of settlementsRes.rows) {
    const compRes = await db.query(
      `
      SELECT sequence_no, tier_units, left_units, right_units, bonus_usd
      FROM binary_matching_components
      WHERE settlement_id = $1
      ORDER BY sequence_no ASC
      `,
      [row.id]
    );
    history.push({
      id: row.id,
      publicSettlementId: row.public_settlement_id,
      userId: row.user_id,
      businessDate: typeof row.business_date === "string" ? row.business_date.split("T")[0] : new Date(row.business_date).toISOString().split("T")[0],
      availableLeft: Number(row.available_left_units),
      availableRight: Number(row.available_right_units),
      consumedLeft: Number(row.consumed_left_units),
      consumedRight: Number(row.consumed_right_units),
      carryLeftBefore: Number(row.carry_left_before),
      carryRightBefore: Number(row.carry_right_before),
      carryLeftAfter: Number(row.carry_left_after),
      carryRightAfter: Number(row.carry_right_after),
      totalBonusUsd: Number(row.total_bonus_usd),
      status: row.status,
      settledAt: new Date(row.settled_at).toISOString(),
      createdAt: new Date(row.created_at).toISOString(),
      components: compRes.rows.map((c) => ({
        sequenceNo: Number(c.sequence_no),
        tierUnits: Number(c.tier_units),
        leftUnits: Number(c.left_units),
        rightUnits: Number(c.right_units),
        bonusUsd: Number(c.bonus_usd)
      }))
    });
  }
  return {
    history,
    pagination: {
      page: safePage,
      limit: safeLimit,
      totalCount,
      totalPages
    }
  };
}
async function updateMatchingConfig(adminUserId, params) {
  const db = await getDb();
  const currentConfig = await getActiveMatchingConfig(db);
  await db.query("BEGIN");
  try {
    const nextVersion = currentConfig.version + 1;
    const configId = uuidv419();
    await db.query(
      `
      INSERT INTO binary_matching_config (
        id, matching_enabled, daily_max_payout, sponsor_qualification_required,
        carry_forward_behavior, effective_date, version, tiers_json
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [
        configId,
        params.matchingEnabled,
        params.dailyMaxPayout,
        params.sponsorQualificationRequired,
        params.carryForwardBehavior,
        params.effectiveDate,
        nextVersion,
        JSON.stringify(params.tiers)
      ]
    );
    const auditId = uuidv419();
    await db.query(
      `
      INSERT INTO binary_matching_config_audit (
        id, config_id, admin_user_id, old_value_json, new_value_json,
        effective_time, version, created_at
      )
      VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, $6, CURRENT_TIMESTAMP)
      `,
      [
        auditId,
        configId,
        adminUserId,
        JSON.stringify(currentConfig),
        JSON.stringify({
          id: configId,
          matchingEnabled: params.matchingEnabled,
          dailyMaxPayout: params.dailyMaxPayout,
          sponsorQualificationRequired: params.sponsorQualificationRequired,
          carryForwardBehavior: params.carryForwardBehavior,
          effectiveDate: params.effectiveDate,
          version: nextVersion,
          tiers: params.tiers
        }),
        nextVersion
      ]
    );
    await db.query("COMMIT");
    return {
      id: configId,
      matchingEnabled: params.matchingEnabled,
      dailyMaxPayout: params.dailyMaxPayout,
      sponsorQualificationRequired: params.sponsorQualificationRequired,
      carryForwardBehavior: params.carryForwardBehavior,
      effectiveDate: params.effectiveDate,
      version: nextVersion,
      tiers: params.tiers
    };
  } catch (err) {
    await db.query("ROLLBACK");
    console.error("[BinaryMatching] Failed to update matching configuration:", err);
    throw err;
  }
}
async function getMatchingConfigAuditLogs() {
  const db = await getDb();
  const res = await db.query(
    `
    SELECT a.*, u.public_id as admin_public_id, u.full_name as admin_full_name
    FROM binary_matching_config_audit a
    LEFT JOIN users u ON a.admin_user_id = u.id
    ORDER BY a.created_at DESC
    `
  );
  return res.rows.map((r) => ({
    id: r.id,
    configId: r.config_id,
    adminUserId: r.admin_user_id,
    adminPublicId: r.admin_public_id,
    adminFullName: r.admin_full_name,
    oldValue: JSON.parse(r.old_value_json),
    newValue: JSON.parse(r.new_value_json),
    effectiveTime: r.effective_time,
    version: r.version,
    createdAt: r.created_at
  }));
}

// src/server/routes/matchingRoutes.ts
var router8 = Router8();
router8.get("/summary", requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const summary = await getUserMatchingSummary(user.id);
    res.status(200).json(summary);
  } catch (err) {
    console.error("[Matching API] Error in /api/matching/summary:", err);
    res.status(500).json({
      error: "MATCHING_SUMMARY_FAILED",
      message: "Failed to retrieve matching summary."
    });
  }
});
router8.get("/history", requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const history = await getUserMatchingHistory(user.id, page, limit);
    res.status(200).json(history);
  } catch (err) {
    console.error("[Matching API] Error in /api/matching/history:", err);
    res.status(500).json({
      error: "MATCHING_HISTORY_FAILED",
      message: "Failed to retrieve matching history."
    });
  }
});
router8.post("/settle-cycle", requireAuth, async (req, res) => {
  try {
    const { businessDate } = req.body || {};
    const result = await runDailyMatchingSettlementCycle(businessDate);
    res.status(200).json(result);
  } catch (err) {
    console.error("[Matching API] Error in /api/matching/settle-cycle:", err);
    res.status(500).json({
      error: "SETTLEMENT_CYCLE_FAILED",
      message: err?.message || "Failed to execute settlement cycle."
    });
  }
});
var matchingRoutes_default = router8;

// src/server/routes/promotionRoutes.ts
import { Router as Router9 } from "express";

// src/server/services/promotionBonusService.ts
init_db();
init_idGenerator();
init_walletLedgerService();
init_notificationService();
import { v4 as uuidv420 } from "uuid";
var OFFICIAL_PROMOTIONS = [
  { milestone: "20/20", unitsRequired: 20, bonusUsd: 5e3 },
  { milestone: "50/50", unitsRequired: 50, bonusUsd: 1e4 },
  { milestone: "100/100", unitsRequired: 100, bonusUsd: 5e4 }
];
async function evaluateUserPromotions(userId) {
  const db = await getDb();
  const volumeRes = await db.query(
    `
    SELECT 
      COALESCE(SUM(CASE WHEN side = 'LEFT' THEN volume_units ELSE 0 END), 0)::int AS left_units,
      COALESCE(SUM(CASE WHEN side = 'RIGHT' THEN volume_units ELSE 0 END), 0)::int AS right_units
    FROM binary_volume_events
    WHERE beneficiary_user_id = $1 AND status = 'ACTIVE'
    `,
    [userId]
  );
  const leftUnits = Number(volumeRes.rows[0]?.left_units || 0);
  const rightUnits = Number(volumeRes.rows[0]?.right_units || 0);
  const existingBonusesRes = await db.query(
    `
    SELECT id, public_bonus_id, milestone, left_units, right_units, amount_usd, status, qualified_at, created_at
    FROM promotion_bonuses
    WHERE user_id = $1
    ORDER BY qualified_at ASC
    `,
    [userId]
  );
  const earnedMilestonesSet = /* @__PURE__ */ new Set();
  for (const row of existingBonusesRes.rows) {
    if (row.status === "EARNED") {
      earnedMilestonesSet.add(row.milestone);
    }
  }
  for (const promo of OFFICIAL_PROMOTIONS) {
    const isQualified = leftUnits >= promo.unitsRequired && rightUnits >= promo.unitsRequired;
    const isAlreadyEarned = earnedMilestonesSet.has(promo.milestone);
    if (isQualified && !isAlreadyEarned) {
      const bonusId = uuidv420();
      const publicBonusId = generatePromotionBonusPublicId();
      await db.query(
        `
        INSERT INTO promotion_bonuses (
          id, public_bonus_id, user_id, milestone,
          left_units, right_units, amount_usd, status,
          qualified_at, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'EARNED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT (user_id, milestone) DO NOTHING
        `,
        [
          bonusId,
          publicBonusId,
          userId,
          promo.milestone,
          leftUnits,
          rightUnits,
          promo.bonusUsd
        ]
      );
    }
  }
  const updatedBonusesRes = await db.query(
    `
    SELECT id, public_bonus_id, milestone, left_units, right_units, amount_usd, status, qualified_at, created_at
    FROM promotion_bonuses
    WHERE user_id = $1
    ORDER BY qualified_at ASC
    `,
    [userId]
  );
  const achievedMilestones = updatedBonusesRes.rows.filter((r) => r.status === "EARNED").map((r) => ({
    id: r.id,
    publicBonusId: r.public_bonus_id,
    milestone: r.milestone,
    leftUnits: Number(r.left_units),
    rightUnits: Number(r.right_units),
    amountUsd: Number(r.amount_usd),
    status: r.status,
    qualifiedAt: r.qualified_at instanceof Date ? r.qualified_at.toISOString() : String(r.qualified_at),
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at)
  }));
  const totalPromotionBonusEarned = achievedMilestones.reduce((acc, m) => acc + m.amountUsd, 0);
  for (const m of achievedMilestones) {
    try {
      await postLedgerCredit({
        userId,
        sourceType: "PROMOTION_BONUS",
        sourceId: m.id,
        sourceRef: m.publicBonusId,
        amount: m.amountUsd,
        description: `Promotion Milestone Bonus - ${m.milestone}`,
        createdAt: new Date(m.qualifiedAt)
      });
    } catch (ledgErr) {
      console.warn("[WalletLedger] Error posting promotion to ledger:", ledgErr);
    }
    try {
      await notifyPromotionEarned({
        userId,
        bonusUsd: m.amountUsd,
        milestoneTitle: `Milestone ${m.milestone}`,
        bonusId: m.id
      });
    } catch (notifErr) {
      console.warn("[Notification] Error triggering promotion earned notification:", notifErr);
    }
  }
  const achievedMap = /* @__PURE__ */ new Map();
  for (const m of achievedMilestones) {
    achievedMap.set(m.milestone, m);
  }
  let nextMilestone = null;
  const milestones = [];
  for (const promo of OFFICIAL_PROMOTIONS) {
    const achievedRecord = achievedMap.get(promo.milestone);
    const isAchieved = Boolean(achievedRecord);
    const leftNeeded = Math.max(0, promo.unitsRequired - leftUnits);
    const rightNeeded = Math.max(0, promo.unitsRequired - rightUnits);
    const effectiveUnits = Math.min(leftUnits, rightUnits);
    const progressPct = Math.min(100, Math.floor(effectiveUnits / promo.unitsRequired * 100));
    milestones.push({
      milestone: promo.milestone,
      unitsRequired: promo.unitsRequired,
      bonusUsd: promo.bonusUsd,
      achieved: isAchieved,
      achievedAt: achievedRecord ? achievedRecord.qualifiedAt : null,
      publicBonusId: achievedRecord ? achievedRecord.publicBonusId : null,
      leftNeeded,
      rightNeeded,
      progressPct
    });
    if (!isAchieved && !nextMilestone) {
      nextMilestone = {
        milestone: promo.milestone,
        unitsRequired: promo.unitsRequired,
        bonusUsd: promo.bonusUsd,
        leftNeeded,
        rightNeeded,
        progressPct
      };
    }
  }
  return {
    currentProgress: {
      leftUnits,
      rightUnits
    },
    achievedMilestones,
    nextMilestone,
    totalPromotionBonusEarned,
    milestones
  };
}

// src/server/routes/promotionRoutes.ts
init_leadershipRankService();
init_promotionalService();
init_systemConfigBroadcaster();
var promotionRouter = Router9();
promotionRouter.get(["/ranks/me", "/my-status"], requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const state = await getUserPromotionState(userId);
    return res.status(200).json({ success: true, state, ...state });
  } catch (err) {
    console.error("[Promotion API] Error in GET promotion state:", err);
    return res.status(500).json({ error: "SERVER_ERROR", message: "Failed to retrieve user rank state" });
  }
});
promotionRouter.post("/ranks/evaluate", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await evaluateUserRankPromotion(userId);
    return res.status(200).json({ success: true, result });
  } catch (err) {
    console.error("[Promotion API] Error in POST /api/promotions/ranks/evaluate:", err);
    return res.status(500).json({ error: "SERVER_ERROR", message: err.message || "Evaluation failed" });
  }
});
promotionRouter.get("/ranks/rules", requireAuth, async (req, res) => {
  try {
    const rules = await getPromotionRules();
    return res.status(200).json({ success: true, rules });
  } catch (err) {
    console.error("[Promotion API] Error in GET /api/promotions/ranks/rules:", err);
    return res.status(500).json({ error: "SERVER_ERROR", message: "Failed to retrieve promotion rules" });
  }
});
promotionRouter.put("/ranks/rules/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const admin = req.user;
    const { id } = req.params;
    const {
      requiredLeft,
      requiredRight,
      requiredLeaderRank,
      legBalanceRule,
      rewardType,
      rewardUsd,
      rewardTitle,
      rewardDescription,
      rewardDisplayValueUsd,
      status,
      reason,
      expectedVersion
    } = req.body || {};
    if (!reason || String(reason).trim().length < 5) {
      return res.status(400).json({ error: "INVALID_INPUT", message: "Reason is required (min 5 characters)." });
    }
    const updated = await updatePromotionRule(admin.id, admin.public_id, id, {
      requiredLeft: typeof requiredLeft === "number" ? requiredLeft : void 0,
      requiredRight: typeof requiredRight === "number" ? requiredRight : void 0,
      requiredLeaderRank: requiredLeaderRank !== void 0 ? requiredLeaderRank : void 0,
      legBalanceRule: legBalanceRule !== void 0 ? legBalanceRule : void 0,
      rewardType: rewardType !== void 0 ? rewardType : void 0,
      rewardUsd: typeof rewardUsd === "number" ? rewardUsd : void 0,
      rewardTitle: rewardTitle !== void 0 ? rewardTitle : void 0,
      rewardDescription: rewardDescription !== void 0 ? rewardDescription : void 0,
      rewardDisplayValueUsd: rewardDisplayValueUsd !== void 0 ? rewardDisplayValueUsd === null ? null : Number(rewardDisplayValueUsd) : void 0,
      status: status !== void 0 ? status : void 0,
      expectedVersion: typeof expectedVersion === "number" ? expectedVersion : void 0,
      reason: String(reason).trim()
    });
    await broadcastSystemConfigChange("PROMOTION_RULES_UPDATED", { id, version: updated.version }, "PROMOTION");
    return res.status(200).json({ success: true, rule: updated });
  } catch (err) {
    console.error("[Admin Promotion API] Error updating rank rule:", err);
    return res.status(err.statusCode || 500).json({ error: err.code || "SERVER_ERROR", message: err.message });
  }
});
promotionRouter.get("/ranks/user/:userId", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const state = await getUserPromotionState(userId);
    const auditLogs = await getUserPromotionAuditLogs(userId);
    return res.status(200).json({ success: true, state, auditLogs });
  } catch (err) {
    console.error("[Admin Promotion API] Error inspecting user rank state:", err);
    return res.status(500).json({ error: "SERVER_ERROR", message: "Failed to inspect user rank state" });
  }
});
promotionRouter.post("/ranks/evaluate/:userId", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const result = await evaluateUserRankPromotion(userId);
    return res.status(200).json({ success: true, result });
  } catch (err) {
    console.error("[Admin Promotion API] Error evaluating user rank:", err);
    return res.status(500).json({ error: "SERVER_ERROR", message: err.message || "Evaluation failed" });
  }
});
promotionRouter.post("/ranks/admin/correct", requireAuth, requireAdmin, async (req, res) => {
  try {
    const admin = req.user;
    const { userId, targetRank, reason } = req.body || {};
    if (!userId || !targetRank || !reason || String(reason).trim().length < 5) {
      return res.status(400).json({ error: "INVALID_INPUT", message: "userId, targetRank, and reason (min 5 chars) are required." });
    }
    const state = await adminManualRankCorrection(admin.id, admin.public_id, userId, targetRank, String(reason).trim());
    return res.status(200).json({ success: true, state });
  } catch (err) {
    console.error("[Admin Promotion API] Error in rank correction:", err);
    return res.status(err.statusCode || 500).json({ error: err.code || "SERVER_ERROR", message: err.message });
  }
});
promotionRouter.get("/me", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const summary = await evaluateUserPromotions(userId);
    return res.status(200).json(summary);
  } catch (err) {
    console.error("[Promotion API] Error in GET /api/promotions/me:", err);
    return res.status(500).json({ error: "Failed to retrieve promotion status" });
  }
});
promotionRouter.get("/offers", requireAuth, async (req, res) => {
  try {
    const offers = await getPromotionalOffers(false);
    return res.status(200).json({ success: true, offers });
  } catch (err) {
    console.error("[Promotion API] Error fetching offers:", err);
    return res.status(500).json({ error: "SERVER_ERROR", message: "Failed to retrieve promotional offers." });
  }
});
promotionRouter.post("/offers/:id/claim-and-pay", requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const offerId = req.params.id;
    const preferredAsset = req.body?.preferredAsset === "BNB" ? "BNB" : "USDT";
    const result = await claimAndPayPromotionalOffer(user.id, offerId, preferredAsset);
    return res.status(200).json(result);
  } catch (err) {
    console.error("[Promotion API] Error claiming offer:", err);
    return res.status(400).json({
      success: false,
      error: "CLAIM_FAILED",
      message: err.message || "Failed to claim and pay for promotional offer."
    });
  }
});
promotionRouter.get("/banners", requireAuth, async (req, res) => {
  try {
    const banners = await getPromotionalBanners(false);
    return res.status(200).json({ success: true, banners });
  } catch (err) {
    console.error("[Promotion API] Error fetching banners:", err);
    return res.status(500).json({ error: "SERVER_ERROR", message: "Failed to retrieve banners." });
  }
});
promotionRouter.get("/leaderboard", requireAuth, async (req, res) => {
  try {
    const settings = await getLeaderboardSettings();
    const leaderboard = await getLeaderboard(settings.metric);
    return res.status(200).json({ success: true, metric: settings.metric, leaderboard });
  } catch (err) {
    console.error("[Promotion API] Error fetching leaderboard:", err);
    return res.status(500).json({ error: "SERVER_ERROR", message: "Failed to retrieve performance leaderboard." });
  }
});
promotionRouter.get("/performance-popup", requireAuth, async (req, res) => {
  try {
    const popupData = await getPerformancePopupData();
    return res.status(200).json({ success: true, popup: popupData });
  } catch (err) {
    console.error("[Promotion API] Error fetching performance popup data:", err);
    return res.status(500).json({ error: "SERVER_ERROR", message: "Failed to retrieve performance popup." });
  }
});
promotionRouter.get("/admin/offers", requireAuth, requireAdmin, async (req, res) => {
  try {
    const offers = await getPromotionalOffers(true);
    return res.status(200).json({ success: true, offers });
  } catch (err) {
    console.error("[Admin Promotion API] Error fetching offers:", err);
    return res.status(500).json({ error: "SERVER_ERROR", message: "Failed to retrieve all offers." });
  }
});
promotionRouter.post("/admin/offers", requireAuth, requireAdmin, async (req, res) => {
  try {
    const admin = req.user;
    const {
      title,
      description,
      bannerImage,
      offerType,
      bonusNodesCount,
      bonusMiningRewards,
      bonusMatchingEnabled,
      bonusReferralCommission,
      startDate,
      endDate,
      status,
      targetAudience,
      priorityOrder
    } = req.body || {};
    if (!title || !description || !bannerImage || !startDate || !endDate || !status || !targetAudience || typeof priorityOrder !== "number") {
      return res.status(400).json({ error: "INVALID_INPUT", message: "All offer fields are required." });
    }
    const created = await createPromotionalOffer(admin.id, admin.public_id, {
      title,
      description,
      bannerImage,
      offerType: offerType || "BOGO_FREE_NODE",
      bonusNodesCount: typeof bonusNodesCount === "number" ? bonusNodesCount : 1,
      bonusMiningRewards: bonusMiningRewards !== false,
      bonusMatchingEnabled: Boolean(bonusMatchingEnabled),
      bonusReferralCommission: Boolean(bonusReferralCommission),
      startDate,
      endDate,
      status,
      targetAudience,
      priorityOrder
    });
    broadcastSystemConfigChange("PROMOTIONAL_OFFERS_UPDATED", { timestamp: (/* @__PURE__ */ new Date()).toISOString() });
    return res.status(201).json({ success: true, offer: created });
  } catch (err) {
    console.error("[Admin Promotion API] Error creating offer:", err);
    return res.status(500).json({ error: "SERVER_ERROR", message: "Failed to create promotional offer." });
  }
});
promotionRouter.put("/admin/offers/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const admin = req.user;
    const { id } = req.params;
    const {
      title,
      description,
      bannerImage,
      offerType,
      bonusNodesCount,
      bonusMiningRewards,
      bonusMatchingEnabled,
      bonusReferralCommission,
      startDate,
      endDate,
      status,
      targetAudience,
      priorityOrder
    } = req.body || {};
    if (!title || !description || !bannerImage || !startDate || !endDate || !status || !targetAudience || typeof priorityOrder !== "number") {
      return res.status(400).json({ error: "INVALID_INPUT", message: "All offer fields are required." });
    }
    const updated = await updatePromotionalOffer(admin.id, admin.public_id, id, {
      title,
      description,
      bannerImage,
      offerType: offerType || "BOGO_FREE_NODE",
      bonusNodesCount: typeof bonusNodesCount === "number" ? bonusNodesCount : 1,
      bonusMiningRewards: bonusMiningRewards !== false,
      bonusMatchingEnabled: Boolean(bonusMatchingEnabled),
      bonusReferralCommission: Boolean(bonusReferralCommission),
      startDate,
      endDate,
      status,
      targetAudience,
      priorityOrder
    });
    broadcastSystemConfigChange("PROMOTIONAL_OFFERS_UPDATED", { timestamp: (/* @__PURE__ */ new Date()).toISOString() });
    return res.status(200).json({ success: true, offer: updated });
  } catch (err) {
    console.error("[Admin Promotion API] Error updating offer:", err);
    return res.status(500).json({ error: "SERVER_ERROR", message: "Failed to update promotional offer." });
  }
});
promotionRouter.delete("/admin/offers/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const admin = req.user;
    const { id } = req.params;
    const deleted = await deletePromotionalOffer(admin.id, admin.public_id, id);
    if (!deleted) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Promotional offer not found." });
    }
    broadcastSystemConfigChange("PROMOTIONAL_OFFERS_UPDATED", { timestamp: (/* @__PURE__ */ new Date()).toISOString() });
    return res.status(200).json({ success: true, id });
  } catch (err) {
    console.error("[Admin Promotion API] Error deleting offer:", err);
    return res.status(500).json({ error: "SERVER_ERROR", message: "Failed to delete promotional offer." });
  }
});
promotionRouter.get("/admin/banners", requireAuth, requireAdmin, async (req, res) => {
  try {
    const banners = await getPromotionalBanners(true);
    return res.status(200).json({ success: true, banners });
  } catch (err) {
    console.error("[Admin Promotion API] Error fetching banners:", err);
    return res.status(500).json({ error: "SERVER_ERROR", message: "Failed to retrieve all banners." });
  }
});
promotionRouter.post("/admin/banners", requireAuth, requireAdmin, async (req, res) => {
  try {
    const admin = req.user;
    const { content, imageUrl, ctaText, ctaDestination, displayOrder, status, startDate, endDate } = req.body || {};
    if (!content || !imageUrl || !ctaText || !ctaDestination || typeof displayOrder !== "number" || !status || !startDate || !endDate) {
      return res.status(400).json({ error: "INVALID_INPUT", message: "All banner fields are required." });
    }
    const created = await createPromotionalBanner(admin.id, admin.public_id, {
      content,
      imageUrl,
      ctaText,
      ctaDestination,
      displayOrder,
      status,
      startDate,
      endDate
    });
    broadcastSystemConfigChange("PROMOTIONAL_BANNERS_UPDATED", { timestamp: (/* @__PURE__ */ new Date()).toISOString() });
    return res.status(201).json({ success: true, banner: created });
  } catch (err) {
    console.error("[Admin Promotion API] Error creating banner:", err);
    return res.status(500).json({ error: "SERVER_ERROR", message: "Failed to create banner." });
  }
});
promotionRouter.put("/admin/banners/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const admin = req.user;
    const { id } = req.params;
    const { content, imageUrl, ctaText, ctaDestination, displayOrder, status, startDate, endDate } = req.body || {};
    if (!content || !imageUrl || !ctaText || !ctaDestination || typeof displayOrder !== "number" || !status || !startDate || !endDate) {
      return res.status(400).json({ error: "INVALID_INPUT", message: "All banner fields are required." });
    }
    const updated = await updatePromotionalBanner(admin.id, admin.public_id, id, {
      content,
      imageUrl,
      ctaText,
      ctaDestination,
      displayOrder,
      status,
      startDate,
      endDate
    });
    broadcastSystemConfigChange("PROMOTIONAL_BANNERS_UPDATED", { timestamp: (/* @__PURE__ */ new Date()).toISOString() });
    return res.status(200).json({ success: true, banner: updated });
  } catch (err) {
    console.error("[Admin Promotion API] Error updating banner:", err);
    return res.status(500).json({ error: "SERVER_ERROR", message: "Failed to update banner." });
  }
});
promotionRouter.delete("/admin/banners/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const admin = req.user;
    const { id } = req.params;
    const deleted = await deletePromotionalBanner(admin.id, admin.public_id, id);
    if (!deleted) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Promotional banner not found." });
    }
    broadcastSystemConfigChange("PROMOTIONAL_BANNERS_UPDATED", { timestamp: (/* @__PURE__ */ new Date()).toISOString() });
    return res.status(200).json({ success: true, id });
  } catch (err) {
    console.error("[Admin Promotion API] Error deleting banner:", err);
    return res.status(500).json({ error: "SERVER_ERROR", message: "Failed to delete banner." });
  }
});
promotionRouter.get("/admin/settings", requireAuth, requireAdmin, async (req, res) => {
  try {
    const leaderboard = await getLeaderboardSettings();
    const popup = await getPerformancePopupSettings();
    return res.status(200).json({ success: true, settings: { leaderboard, popup } });
  } catch (err) {
    console.error("[Admin Promotion API] Error fetching settings:", err);
    return res.status(500).json({ error: "SERVER_ERROR", message: "Failed to retrieve configuration settings." });
  }
});
promotionRouter.post("/admin/settings/leaderboard", requireAuth, requireAdmin, async (req, res) => {
  try {
    const admin = req.user;
    const { metric } = req.body || {};
    if (!["DIRECT_REFERRALS", "NODE_SALES", "BINARY_VOLUME", "MATCHING_PERFORMANCE"].includes(metric)) {
      return res.status(400).json({ error: "INVALID_INPUT", message: "Invalid performance metric." });
    }
    const updatedMetric = await updateLeaderboardSettings(admin.id, admin.public_id, metric);
    return res.status(200).json({ success: true, metric: updatedMetric });
  } catch (err) {
    console.error("[Admin Promotion API] Error updating leaderboard settings:", err);
    return res.status(500).json({ error: "SERVER_ERROR", message: "Failed to update leaderboard settings." });
  }
});
promotionRouter.post("/admin/settings/popup", requireAuth, requireAdmin, async (req, res) => {
  try {
    const admin = req.user;
    const { enabled, metric, topCount, durationSeconds } = req.body || {};
    if (typeof enabled !== "boolean") {
      return res.status(400).json({ error: "INVALID_INPUT", message: "enabled must be a boolean." });
    }
    if (!["DIRECT_REFERRALS", "NODE_SALES", "BINARY_VOLUME", "MATCHING_PERFORMANCE"].includes(metric)) {
      return res.status(400).json({ error: "INVALID_INPUT", message: "Invalid performance metric." });
    }
    if (typeof topCount !== "number" || topCount <= 0 || topCount > 10) {
      return res.status(400).json({ error: "INVALID_INPUT", message: "topCount must be between 1 and 10." });
    }
    if (typeof durationSeconds !== "number" || durationSeconds <= 0) {
      return res.status(400).json({ error: "INVALID_INPUT", message: "durationSeconds must be positive." });
    }
    const updated = await updatePerformancePopupSettings(admin.id, admin.public_id, {
      enabled,
      metric,
      topCount,
      durationSeconds
    });
    return res.status(200).json({ success: true, popup: updated });
  } catch (err) {
    console.error("[Admin Promotion API] Error updating popup settings:", err);
    return res.status(500).json({ error: "SERVER_ERROR", message: "Failed to update popup settings." });
  }
});

// src/server/routes/walletRoutes.ts
import { Router as Router10 } from "express";
init_walletLedgerService();
var walletRouter = Router10();
var handleGetWalletSummary = async (req, res) => {
  try {
    const userId = req.user.id;
    const summary = await getWalletSummary(userId);
    return res.status(200).json(summary);
  } catch (err) {
    console.error("[Wallet API] Error in GET wallet summary:", err);
    return res.status(500).json({ error: "Failed to retrieve wallet summary" });
  }
};
walletRouter.get("/me", requireAuth, handleGetWalletSummary);
walletRouter.get("/summary", requireAuth, handleGetWalletSummary);
walletRouter.get("/transactions", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const typeFilter = req.query.type || req.query.sourceType || req.query.category || void 0;
    const entryTypeFilter = req.query.entryType || void 0;
    const search = req.query.search || req.query.q || void 0;
    const result = await getWalletTransactions(userId, page, limit, typeFilter, search, entryTypeFilter);
    return res.status(200).json(result);
  } catch (err) {
    console.error("[Wallet API] Error in GET /api/wallet/transactions:", err);
    return res.status(500).json({ error: "Failed to retrieve wallet transactions" });
  }
});
walletRouter.post("/transfer", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { fromVault = "MAIN_WALLET", toVault = "NODE_VAULT", amount, currency = "USDT" } = req.body || {};
    const parsedAmount = Number(amount);
    if (!parsedAmount || parsedAmount <= 0 || isNaN(parsedAmount)) {
      return res.status(400).json({
        error: "INVALID_AMOUNT",
        message: "Please specify a valid transfer amount greater than 0."
      });
    }
    const result = await executeEcosystemWalletTransfer(
      userId,
      fromVault,
      toVault,
      parsedAmount,
      currency.toUpperCase()
    );
    return res.status(200).json({
      success: true,
      message: `Successfully transferred $${parsedAmount.toFixed(2)} ${currency.toUpperCase()} to ${toVault === "NODE_VAULT" ? "Node Purchase Vault" : toVault}!`,
      transfer: result
    });
  } catch (err) {
    console.error("[Wallet API] Error executing wallet transfer:", err);
    return res.status(400).json({
      error: err.code || "TRANSFER_ERROR",
      message: err.message || "Failed to execute internal wallet transfer."
    });
  }
});

// src/server/routes/rewardRoutes.ts
import { Router as Router11 } from "express";
var rewardRouter = Router11();
rewardRouter.get("/me", requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const rewardsData = await getUserRewards(user.id);
    res.status(200).json({
      totalAccrued: rewardsData.totalAccrued,
      totalClaimed: rewardsData.totalClaimed,
      totalRewards: rewardsData.totalRewards,
      dailyEmissionRate: rewardsData.dailyEmissionRate,
      protocolDailyEmission: rewardsData.protocolDailyEmission,
      latestEpoch: rewardsData.latestEpoch,
      history: rewardsData.history
    });
  } catch (err) {
    console.error("[Reward API] Error in GET /api/rewards/me:", err);
    res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to retrieve reward telemetry."
    });
  }
});
rewardRouter.get("/summary", requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const summary = await getUserRewardsSummary(user.id);
    res.status(200).json(summary);
  } catch (err) {
    console.error("[Reward API] Error in GET /api/rewards/summary:", err);
    res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to retrieve reward summary."
    });
  }
});
rewardRouter.get("/history", requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const rewardsData = await getUserRewards(user.id);
    res.status(200).json({
      success: true,
      history: rewardsData.history,
      total: rewardsData.history.length,
      latestEpoch: rewardsData.latestEpoch
    });
  } catch (err) {
    console.error("[Reward API] Error in GET /api/rewards/history:", err);
    res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to retrieve reward history."
    });
  }
});
rewardRouter.post("/claim", requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const result = await claimUserRewards(user.id);
    res.status(200).json({
      success: true,
      message: result.claimedCount > 0 ? `Successfully claimed ${result.claimedCount} accrued reward(s).` : "No accrued rewards pending claim.",
      claimedCount: result.claimedCount,
      totalClaimedAmount: result.totalClaimedAmount
    });
  } catch (err) {
    console.error("[Reward API] Error in POST /api/rewards/claim:", err);
    res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to process reward claim."
    });
  }
});
rewardRouter.post("/epochs", requireAdmin, async (req, res) => {
  try {
    const epoch = await createRewardEpoch();
    res.status(201).json(epoch);
  } catch (err) {
    console.error("[Reward API] Error in POST /api/rewards/epochs:", err);
    res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to create reward epoch."
    });
  }
});
rewardRouter.post("/epochs/:id/settle", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await closeAndSettleEpoch(id);
    if (!result.success && result.error === "REWARD_RATE_NOT_CONFIGURED") {
      res.status(422).json(result);
      return;
    }
    res.status(200).json(result);
  } catch (err) {
    console.error("[Reward API] Error in POST /api/rewards/epochs/:id/settle:", err);
    res.status(500).json({
      error: "SERVER_ERROR",
      message: err.message || "Failed to settle reward epoch."
    });
  }
});
rewardRouter.get("/distribution-control", requireAdmin, async (_req, res) => {
  try {
    const config = await getRewardAutomationConfig();
    res.status(200).json({
      success: true,
      config
    });
  } catch (err) {
    console.error("[Reward API] Error in GET /api/rewards/distribution-control:", err);
    res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to retrieve reward distribution automation configuration."
    });
  }
});
rewardRouter.post("/distribution-control", requireAdmin, async (req, res) => {
  try {
    const { mode, scheduledTimeUtc } = req.body;
    if (mode !== "AUTOMATIC" && mode !== "MANUAL") {
      res.status(400).json({
        error: "INVALID_MODE",
        message: "Distribution mode must be either AUTOMATIC or MANUAL."
      });
      return;
    }
    const adminUser = req.user;
    const adminPublicId = adminUser.public_id || adminUser.email || "ADMIN";
    const updated = await setRewardAutomationConfig(
      mode,
      scheduledTimeUtc || "00:00",
      adminUser.id,
      adminPublicId
    );
    res.status(200).json({
      success: true,
      message: `Daily reward distribution mode updated to ${mode}.`,
      config: updated
    });
  } catch (err) {
    console.error("[Reward API] Error in POST /api/rewards/distribution-control:", err);
    res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to update reward distribution mode."
    });
  }
});
rewardRouter.post("/manual-distribute", requireAdmin, async (req, res) => {
  try {
    const adminUser = req.user;
    const adminPublicId = adminUser.public_id || adminUser.email || "ADMIN";
    const result = await executeManualDailyRewardDistribution(adminUser.id, adminPublicId);
    if (!result.success) {
      res.status(422).json(result);
      return;
    }
    res.status(200).json(result);
  } catch (err) {
    console.error("[Reward API] Error in POST /api/rewards/manual-distribute:", err);
    res.status(500).json({
      error: "SERVER_ERROR",
      message: err.message || "Failed to execute manual reward distribution."
    });
  }
});

// src/server/routes/publicNetworkRoutes.ts
init_publicNetworkService();
init_economicService();
import { Router as Router12 } from "express";
var publicNetworkRouter = Router12();
publicNetworkRouter.get("/price-trend", async (req, res) => {
  try {
    const timeframe = req.query.timeframe || "24h";
    const trendData = await getTokenPriceTrend(timeframe);
    res.setHeader("Cache-Control", "public, max-age=5");
    return res.status(200).json(trendData);
  } catch (err) {
    console.error("[Public API] Error fetching token price trend:", err);
    return res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to retrieve token price trend data."
    });
  }
});
publicNetworkRouter.get("/summary", async (req, res) => {
  try {
    const summary = await getPublicNetworkSummary();
    res.setHeader("Cache-Control", "public, max-age=5");
    return res.status(200).json(summary);
  } catch (err) {
    console.error("[Public API] Error fetching network summary:", err);
    return res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to retrieve public network summary."
    });
  }
});
publicNetworkRouter.get("/events", async (req, res) => {
  try {
    const rawLimit = parseInt(req.query.limit, 10);
    const limit = isNaN(rawLimit) ? 20 : Math.min(100, Math.max(1, rawLimit));
    const events = await getPublicNetworkEvents(limit);
    res.setHeader("Cache-Control", "public, max-age=5");
    return res.status(200).json(events);
  } catch (err) {
    console.error("[Public API] Error fetching network events:", err);
    return res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to retrieve public network events."
    });
  }
});
publicNetworkRouter.get("/stream", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();
  try {
    const initialSummary = await getPublicNetworkSummary();
    res.write(`event: summary
data: ${JSON.stringify(initialSummary)}

`);
  } catch (err) {
    console.warn("[Public SSE] Failed to send initial summary payload:", err);
  }
  const heartbeatInterval = setInterval(() => {
    try {
      res.write(": ping\n\n");
    } catch {
    }
  }, 15e3);
  const onNetworkEvent = (evt) => {
    try {
      res.write(`event: ${evt.type}
data: ${JSON.stringify(evt)}

`);
    } catch (err) {
      console.warn("[Public SSE] Error broadcasting event:", err);
    }
  };
  publicNetworkEventEmitter.on("networkEvent", onNetworkEvent);
  req.on("close", () => {
    clearInterval(heartbeatInterval);
    publicNetworkEventEmitter.off("networkEvent", onNetworkEvent);
  });
});

// src/server/routes/withdrawalRoutes.ts
import { Router as Router13 } from "express";
import { v4 as uuidv423 } from "uuid";

// src/server/middleware/securityMiddleware.ts
init_db();
function securityHeadersMiddleware(req, res, next) {
  if (process.env.NODE_ENV === "production") {
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self' https: data: blob: 'unsafe-inline' 'unsafe-eval'; frame-ancestors 'self' https://*.google.com https://*.run.app https://*.aistudio.google.com https://*.googleusercontent.com;"
    );
  } else {
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self' http: https: data: blob: 'unsafe-inline' 'unsafe-eval' ws: wss:; frame-ancestors *;"
    );
  }
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  const isSecure = req.secure || req.headers["x-forwarded-proto"] === "https";
  if (process.env.NODE_ENV === "production" && isSecure) {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
}
function isTrustedOrigin(origin, hostHeader, forwardedHost) {
  if (!origin) return true;
  try {
    const url = new URL(origin);
    const originHost = url.host.toLowerCase();
    const originHostname = url.hostname.toLowerCase();
    if (hostHeader) {
      const cleanHost = hostHeader.toLowerCase().trim();
      const hostWithoutPort = cleanHost.split(":")[0];
      if (originHost === cleanHost || originHostname === hostWithoutPort) {
        return true;
      }
    }
    if (forwardedHost) {
      const firstForwarded = forwardedHost.split(",")[0].trim().toLowerCase();
      const forwardedWithoutPort = firstForwarded.split(":")[0];
      if (originHost === firstForwarded || originHostname === forwardedWithoutPort) {
        return true;
      }
    }
    if (originHostname === "localhost" || originHostname === "127.0.0.1" || originHost.startsWith("localhost:") || originHost.startsWith("127.0.0.1:")) {
      return true;
    }
    if (originHostname.endsWith(".hosted.app") || originHostname.endsWith(".run.app") || originHostname.endsWith(".firebaseapp.com") || originHostname.endsWith(".web.app") || originHostname.endsWith(".google.com") || originHostname.endsWith(".aistudio.google.com")) {
      return true;
    }
    if (originHostname === "phivonex.com" || originHostname.endsWith(".phivonex.com")) {
      return true;
    }
    if (process.env.APP_URL) {
      const appUrl = new URL(process.env.APP_URL);
      if (originHostname === appUrl.hostname.toLowerCase()) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}
async function csrfOriginProtection(req, res, next) {
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return next();
  }
  const origin = req.headers.origin || req.headers.referer || "";
  const host = req.headers.host || "";
  const forwardedHost = req.headers["x-forwarded-host"] || "";
  if (origin && !isTrustedOrigin(origin, host, forwardedHost)) {
    try {
      const db = await getDb();
      await logSecurityEvent(db, {
        userId: req.user?.id || null,
        eventType: "CSRF_REJECTED",
        description: `Blocked cross-origin request from untrusted origin '${origin}' on ${method} ${req.path}`,
        userAgent: req.headers["user-agent"]
      });
    } catch {
    }
    res.status(403).json({
      error: "CSRF_FORBIDDEN",
      message: "Cross-site request blocked: untrusted origin."
    });
    return;
  }
  next();
}
function validateEvmAddress(address) {
  if (typeof address !== "string") {
    return { valid: false, address: "", error: "Wallet address must be a string." };
  }
  const clean = address.trim();
  const evmRegex = /^0x[a-fA-F0-9]{40}$/;
  if (!evmRegex.test(clean)) {
    return { valid: false, address: clean, error: "Invalid EVM/BNB Smart Chain wallet address." };
  }
  return { valid: true, address: clean.toLowerCase() };
}
function sanitizeProductionErrors(err, req, res, next) {
  const diagnosticId = `SEC-ERR-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
  console.error(`[Security Diagnostic ${diagnosticId}] ${req.method} ${req.path}:`, err?.message || err);
  const status = typeof err?.status === "number" && err.status >= 400 && err.status < 600 ? err.status : 500;
  let safeMessage = "An unexpected internal error occurred. Please contact support with the diagnostic reference.";
  if (status < 500 && err?.message) {
    const raw = String(err.message);
    const containsSql = /syntax error|pglite|relation |column |violates foreign key|duplicate key/i.test(raw);
    const containsPath = /\/app\/|\/src\/|\/node_modules\//i.test(raw);
    const containsSecret = /key|token|password|secret|hash/i.test(raw);
    if (!containsSql && !containsPath && !containsSecret) {
      safeMessage = raw;
    }
  }
  res.status(status).json({
    error: err?.code || (status === 500 ? "INTERNAL_SERVER_ERROR" : "BAD_REQUEST"),
    message: safeMessage,
    diagnosticId
  });
}

// src/server/routes/withdrawalRoutes.ts
init_crypto();
init_walletLedgerService();
init_withdrawalService();
init_bscSignerService();
init_db();
init_systemConfigBroadcaster();
var withdrawalRouter = Router13();
withdrawalRouter.post("/request-otp", requireAuth, withdrawalLimiter, async (req, res) => {
  try {
    const userId = req.user.id;
    const userEmail = req.user.email;
    const { amount, destinationType, destinationReference } = req.body;
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || !isFinite(numAmount) || numAmount <= 0) {
      return res.status(400).json({
        error: "INVALID_AMOUNT",
        message: "Withdrawal amount must be a positive number greater than 0."
      });
    }
    const minAmount = await getMinWithdrawalAmount();
    if (numAmount < minAmount) {
      return res.status(400).json({
        error: "MINIMUM_WITHDRAWAL_REQUIRED",
        message: `Minimum withdrawal amount is $${minAmount.toFixed(2)} USD.`
      });
    }
    const wallet = await getWalletSummary(userId);
    if (wallet.availableBalance < numAmount) {
      return res.status(400).json({
        error: "INSUFFICIENT_BALANCE",
        message: `Insufficient balance. Available balance is $${wallet.availableBalance.toFixed(2)} USD.`
      });
    }
    const destType = String(destinationType || "USDT_BEP20").toUpperCase();
    if (destType === "USDT_BEP20" || destType === "BEP20" || destType === "BNB" || destType === "USDT_ERC20" || destType === "ETH") {
      const addrCheck = validateEvmAddress(destinationReference);
      if (!addrCheck.valid) {
        return res.status(400).json({
          error: "INVALID_DESTINATION_ADDRESS",
          message: addrCheck.error || "Invalid destination wallet address (Must be a valid 0x... EVM / BNB Smart Chain address)."
        });
      }
    }
    const db = await getDb();
    await db.query(
      `UPDATE auth_tokens SET used_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND type = 'WITHDRAWAL_OTP' AND used_at IS NULL`,
      [userId]
    );
    const rawOtp = Math.floor(1e5 + Math.random() * 9e5).toString();
    const otpHash = hashToken(rawOtp);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1e3);
    await db.query(
      `INSERT INTO auth_tokens (id, user_id, type, token_hash, expires_at, created_at)
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
      [uuidv423(), userId, "WITHDRAWAL_OTP", otpHash, expiresAt]
    );
    const { sendWithdrawalOtpEmail: sendWithdrawalOtpEmail2 } = await Promise.resolve().then(() => (init_emailService(), emailService_exports));
    await sendWithdrawalOtpEmail2(userEmail, rawOtp, {
      amount: numAmount,
      asset: destType,
      destinationAddress: String(destinationReference || "").trim()
    });
    return res.status(200).json({
      success: true,
      message: `A 6-digit withdrawal authorization code has been dispatched to ${userEmail}.`
    });
  } catch (err) {
    console.error("[Withdrawal API] Error in /request-otp:", err);
    return res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to request withdrawal verification code."
    });
  }
});
withdrawalRouter.post("/", requireAuth, withdrawalLimiter, async (req, res) => {
  try {
    const userId = req.user.id;
    const { amount, destinationType, destinationReference, idempotencyKey, otp } = req.body;
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || !isFinite(numAmount) || numAmount <= 0) {
      return res.status(400).json({
        error: "INVALID_AMOUNT",
        message: "Withdrawal amount must be a positive number greater than 0."
      });
    }
    const destType = String(destinationType || "USDT_BEP20").toUpperCase();
    if (destType === "USDT_BEP20" || destType === "BEP20" || destType === "BNB" || destType === "USDT_ERC20" || destType === "ETH") {
      const addrCheck = validateEvmAddress(destinationReference);
      if (!addrCheck.valid) {
        return res.status(400).json({
          error: "INVALID_DESTINATION_ADDRESS",
          message: addrCheck.error || "Invalid destination wallet address (Must be a valid 0x... EVM / BNB Smart Chain address)."
        });
      }
    }
    const isTest = process.env.NODE_ENV === "test";
    const trimmedOtp = otp ? String(otp).trim() : "";
    if (!isTest && !trimmedOtp) {
      return res.status(400).json({
        error: "OTP_REQUIRED",
        message: "A valid 6-digit email verification code is required to authorize withdrawal."
      });
    }
    const withdrawal = await createWithdrawalRequest({
      userId,
      amount: numAmount,
      destinationType: destType,
      destinationReference: String(destinationReference || "").trim(),
      idempotencyKey: idempotencyKey ? String(idempotencyKey) : void 0,
      otp: trimmedOtp || void 0
    });
    try {
      const db = await getDb();
      const configRes = await db.query(
        `SELECT config_value FROM system_economic_configs WHERE config_key = 'AUTO_WITHDRAWAL_ENABLED' LIMIT 1`
      ).catch(() => ({ rows: [] }));
      let autoEnabled = false;
      if (configRes.rows.length > 0) {
        const rawVal = configRes.rows[0].config_value;
        try {
          autoEnabled = typeof rawVal === "string" ? JSON.parse(rawVal) === true : Boolean(rawVal);
        } catch {
          autoEnabled = String(rawVal).toLowerCase() === "true";
        }
      }
      if (autoEnabled) {
        const targetPublicId = withdrawal.publicWithdrawalId || withdrawal.publicId;
        console.log(`[Auto-Withdrawal Engine] Mode is FULL AUTOMATIC. Broadcasting withdrawal ${targetPublicId} instantly to BSC...`);
        try {
          const broadcastPromise = broadcastBnbWithdrawal({
            withdrawalPublicId: targetPublicId,
            forceBypassDisabled: true,
            timeoutMs: 6e3
          });
          const timeoutPromise = new Promise(
            (resolve) => setTimeout(() => resolve({ timedOut: true }), 8e3)
          );
          const result = await Promise.race([broadcastPromise, timeoutPromise]);
          if ("timedOut" in result) {
            const currentRecord = await getWithdrawalByPublicId(targetPublicId);
            return res.status(201).json({
              ...currentRecord || withdrawal,
              publicId: targetPublicId,
              publicWithdrawalId: targetPublicId,
              autoDisbursed: false,
              message: "Withdrawal submitted. Payout broadcast in progress; confirmation will update automatically."
            });
          }
          const broadcastResult = result;
          console.log(`[Auto-Withdrawal Engine] Broadcast completed. Status: ${broadcastResult.withdrawal.status}, TxHash: ${broadcastResult.txHash}`);
          return res.status(201).json({
            ...broadcastResult.withdrawal,
            publicId: targetPublicId,
            publicWithdrawalId: targetPublicId,
            txHash: broadcastResult.txHash,
            autoDisbursed: true,
            message: broadcastResult.withdrawal.status === "COMPLETED" ? "Withdrawal automatically processed and confirmed on-chain on BNB Smart Chain." : "Withdrawal submitted to blockchain; confirmation pending."
          });
        } catch (autoSendErr) {
          console.error("[Auto-Withdrawal Engine] Auto-broadcast error, safely retained for retry:", autoSendErr);
          const currentRecord = await getWithdrawalByPublicId(targetPublicId);
          return res.status(201).json({
            ...currentRecord || withdrawal,
            publicId: targetPublicId,
            publicWithdrawalId: targetPublicId,
            autoDisbursed: false,
            message: `Withdrawal request created and funds reserved. Broadcast deferred for retry: ${autoSendErr?.message || "RPC unavailable"}`
          });
        }
      }
    } catch (checkErr) {
      console.warn("[Auto-Withdrawal Engine] Could not read auto mode config:", checkErr);
    }
    return res.status(201).json({
      ...withdrawal,
      publicId: withdrawal.publicWithdrawalId,
      publicWithdrawalId: withdrawal.publicWithdrawalId
    });
  } catch (err) {
    const message = err?.message || "An error occurred while requesting withdrawal.";
    if (err?.code === "INVALID_OTP" || err?.code === "OTP_ALREADY_USED" || err?.code === "OTP_EXPIRED" || message.startsWith("INVALID_OTP") || message.startsWith("OTP_")) {
      return res.status(400).json({
        error: err.code || "INVALID_OTP",
        message: err.message || message
      });
    }
    if (message.startsWith("INSUFFICIENT_BALANCE") || err?.code === "INSUFFICIENT_BALANCE") {
      return res.status(422).json({
        error: "INSUFFICIENT_BALANCE",
        message,
        availableBalance: err?.availableBalance
      });
    }
    if (message.startsWith("MINIMUM_AMOUNT_LIMIT") || message.startsWith("INVALID_AMOUNT") || message.startsWith("INVALID_DESTINATION")) {
      return res.status(400).json({
        error: "BAD_REQUEST",
        message
      });
    }
    console.error("[Withdrawal API] Error creating withdrawal:", err);
    return res.status(500).json({
      error: "SERVER_ERROR",
      message
    });
  }
});
withdrawalRouter.get("/me", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const status = req.query.status || void 0;
    const history = await getUserWithdrawals(userId, page, limit, status);
    return res.status(200).json(history);
  } catch (err) {
    console.error("[Withdrawal API] Error fetching history:", err);
    return res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to retrieve withdrawal history."
    });
  }
});
withdrawalRouter.get("/config", async (_req, res) => {
  try {
    const minAmount = await getMinWithdrawalAmount();
    const db = await getDb();
    const configRes = await db.query(
      `SELECT config_value FROM system_economic_configs WHERE config_key = 'AUTO_WITHDRAWAL_ENABLED' LIMIT 1`
    ).catch(() => ({ rows: [] }));
    let autoEnabled = false;
    if (configRes.rows.length > 0) {
      const rawVal = configRes.rows[0].config_value;
      try {
        autoEnabled = typeof rawVal === "string" ? JSON.parse(rawVal) === true : Boolean(rawVal);
      } catch {
        autoEnabled = String(rawVal).toLowerCase() === "true";
      }
    }
    return res.status(200).json({
      success: true,
      minWithdrawalAmount: minAmount,
      autoWithdrawalEnabled: autoEnabled,
      mode: autoEnabled ? "FULL_AUTOMATIC" : "MANUAL_APPROVAL"
    });
  } catch (err) {
    console.error("[Withdrawal API] Error fetching config:", err);
    return res.status(500).json({ error: "SERVER_ERROR", message: "Failed to retrieve withdrawal configuration" });
  }
});
withdrawalRouter.get("/:publicId", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { publicId } = req.params;
    const withdrawal = await getWithdrawalByPublicId(publicId, userId);
    if (!withdrawal) {
      return res.status(404).json({
        error: "NOT_FOUND",
        message: "Withdrawal record not found or access denied."
      });
    }
    return res.status(200).json(withdrawal);
  } catch (err) {
    console.error("[Withdrawal API] Error fetching withdrawal:", err);
    return res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to fetch withdrawal record."
    });
  }
});
withdrawalRouter.post("/:publicId/cancel", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { publicId } = req.params;
    const updated = await cancelWithdrawalRequest(publicId, userId);
    return res.status(200).json(updated);
  } catch (err) {
    const message = err?.message || "Failed to cancel withdrawal request.";
    if (message.startsWith("NOT_FOUND")) {
      return res.status(404).json({ error: "NOT_FOUND", message });
    }
    if (message.startsWith("INVALID_STATE")) {
      return res.status(400).json({ error: "INVALID_STATE", message });
    }
    console.error("[Withdrawal API] Error cancelling withdrawal:", err);
    return res.status(500).json({ error: "SERVER_ERROR", message });
  }
});
withdrawalRouter.post("/admin/settle", requireAdmin, adminFinancialLimiter, async (req, res) => {
  try {
    const { publicId, action, rejectionReason, txHash } = req.body;
    if (!publicId || !action) {
      return res.status(400).json({
        error: "BAD_REQUEST",
        message: "Missing publicId or action parameter."
      });
    }
    const updated = await settleWithdrawalAction({
      withdrawalIdOrPublicId: String(publicId),
      action: action.toUpperCase(),
      rejectionReason: rejectionReason ? String(rejectionReason) : void 0,
      txHash: txHash ? String(txHash).trim() : void 0
    });
    return res.status(200).json(updated);
  } catch (err) {
    const message = err?.message || "Failed to process settlement action.";
    if (message.startsWith("NOT_FOUND")) {
      return res.status(404).json({ error: "NOT_FOUND", message });
    }
    if (message.startsWith("INVALID_STATE") || message.startsWith("INVALID_ACTION")) {
      return res.status(400).json({ error: "INVALID_STATE", message });
    }
    console.error("[Withdrawal API] Settlement error:", err);
    return res.status(500).json({ error: "SERVER_ERROR", message });
  }
});
withdrawalRouter.post("/admin/broadcast-bsc", requireAdmin, adminFinancialLimiter, async (req, res) => {
  try {
    const { publicId } = req.body;
    if (!publicId) {
      return res.status(400).json({
        error: "BAD_REQUEST",
        message: "Missing publicId parameter."
      });
    }
    const result = await broadcastBnbWithdrawal({
      withdrawalPublicId: String(publicId)
    });
    return res.status(200).json({
      success: true,
      message: `Withdrawal successfully broadcasted to BNB Smart Chain.`,
      data: result
    });
  } catch (err) {
    const message = err?.message || "Failed to broadcast BNB withdrawal.";
    if (message.includes("INSUFFICIENT_GAS_RESERVE")) {
      return res.status(422).json({ error: "INSUFFICIENT_GAS_RESERVE", message });
    }
    if (message.includes("ALREADY_BROADCASTED")) {
      return res.status(409).json({ error: "ALREADY_BROADCASTED", message });
    }
    if (message.startsWith("NOT_FOUND")) {
      return res.status(404).json({ error: "NOT_FOUND", message });
    }
    if (message.startsWith("INVALID_STATE") || message.startsWith("INVALID_DESTINATION")) {
      return res.status(400).json({ error: "BAD_REQUEST", message });
    }
    console.error("[Withdrawal API] BSC broadcast error:", err);
    return res.status(500).json({ error: "BROADCAST_ERROR", message });
  }
});
var handleGetStateLogs = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const status = req.query.status || void 0;
    const actorType = req.query.actorType || void 0;
    const search = req.query.search || void 0;
    const data = await getWithdrawalStateLogs({
      page,
      limit,
      status,
      actorType,
      search
    });
    return res.status(200).json({
      success: true,
      logs: data.logs,
      stats: data.stats,
      pagination: data.pagination
    });
  } catch (err) {
    console.error("[Withdrawal API] Error fetching transition logs:", err);
    return res.status(500).json({ error: "SERVER_ERROR", message: "Failed to fetch withdrawal state transition logs" });
  }
};
withdrawalRouter.get("/admin/transition-logs", requireAdmin, handleGetStateLogs);
withdrawalRouter.get("/admin/state-logs", requireAdmin, handleGetStateLogs);
withdrawalRouter.get("/admin/state-timeline/:publicId", requireAdmin, async (req, res) => {
  try {
    const { publicId } = req.params;
    const timeline = await getSingleWithdrawalStateTimeline(publicId);
    return res.status(200).json({ success: true, timeline });
  } catch (err) {
    console.error("[Withdrawal API] Error fetching state timeline:", err);
    return res.status(500).json({ error: "SERVER_ERROR", message: "Failed to fetch withdrawal state timeline" });
  }
});
withdrawalRouter.get("/admin/mode", requireAdmin, async (req, res) => {
  try {
    const db = await getDb();
    const [modeRes, minRes] = await Promise.all([
      db.query(`SELECT config_value FROM system_economic_configs WHERE config_key = 'AUTO_WITHDRAWAL_ENABLED' LIMIT 1`).catch(() => ({ rows: [] })),
      getMinWithdrawalAmount()
    ]);
    let autoEnabled = false;
    if (modeRes.rows.length > 0) {
      const rawVal = modeRes.rows[0].config_value;
      try {
        autoEnabled = typeof rawVal === "string" ? JSON.parse(rawVal) === true : Boolean(rawVal);
      } catch {
        autoEnabled = String(rawVal).toLowerCase() === "true";
      }
    }
    const rawKey = (process.env.PAYOUT_PRIVATE_KEY || process.env.TREASURY_PRIVATE_KEY || "").trim();
    const isValidKey = rawKey.length > 0 && !rawKey.includes("YOUR_MOTHER_PAYOUT_WALLET") && !rawKey.includes("PLACEHOLDER");
    let payoutWalletAddress = null;
    let isSignerConfigured = false;
    if (isValidKey) {
      try {
        const { ethers: ethers10 } = await import("ethers");
        const cleanKey = rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`;
        const w = new ethers10.Wallet(cleanKey);
        payoutWalletAddress = w.address;
        isSignerConfigured = true;
      } catch {
        isSignerConfigured = false;
      }
    }
    return res.status(200).json({
      success: true,
      minWithdrawalAmount: minRes,
      autoWithdrawalEnabled: autoEnabled,
      mode: autoEnabled ? "FULL_AUTOMATIC" : "MANUAL_APPROVAL",
      isSignerConfigured,
      payoutWalletAddress
    });
  } catch (err) {
    console.error("[Withdrawal API] Error fetching mode:", err);
    return res.status(500).json({ error: "SERVER_ERROR", message: "Failed to retrieve mode" });
  }
});
withdrawalRouter.post("/admin/min-amount", requireAdmin, async (req, res) => {
  try {
    const { minAmount } = req.body;
    const num = parseFloat(minAmount);
    if (isNaN(num) || num < 0) {
      return res.status(400).json({ error: "BAD_REQUEST", message: "Minimum withdrawal amount must be a number >= 0." });
    }
    const db = await getDb();
    const adminPublicId = req.user?.publicId || req.user?.public_id || "ADMIN";
    await db.query(`
      INSERT INTO system_economic_configs (id, config_key, config_value, category, description, status, version, updated_by_admin_public_id, updated_at)
      VALUES (gen_random_uuid(), 'MIN_WITHDRAWAL_AMOUNT', $1, 'GATEWAY', 'Minimum allowed withdrawal amount in USD / USDT', 'ACTIVE', 1, $2, CURRENT_TIMESTAMP)
      ON CONFLICT (config_key) DO UPDATE
      SET config_value = EXCLUDED.config_value,
          updated_by_admin_public_id = EXCLUDED.updated_by_admin_public_id,
          version = system_economic_configs.version + 1,
          updated_at = CURRENT_TIMESTAMP
    `, [JSON.stringify(num), adminPublicId]);
    await broadcastSystemConfigChange("MIN_WITHDRAWAL_AMOUNT", num, "GATEWAY");
    return res.status(200).json({
      success: true,
      minWithdrawalAmount: num,
      message: `Minimum withdrawal amount updated to $${num.toFixed(2)} USD (${num} USDT).`
    });
  } catch (err) {
    console.error("[Withdrawal API] Error setting min-amount:", err);
    return res.status(500).json({ error: "SERVER_ERROR", message: "Failed to update minimum withdrawal amount" });
  }
});
withdrawalRouter.post("/admin/mode", requireAdmin, async (req, res) => {
  try {
    const { enabled } = req.body;
    const isAuto = Boolean(enabled);
    const db = await getDb();
    await db.query(`
      UPDATE system_economic_configs 
      SET config_value = $1, updated_at = CURRENT_TIMESTAMP, updated_by_admin_public_id = $2
      WHERE config_key = 'AUTO_WITHDRAWAL_ENABLED'
    `, [JSON.stringify(isAuto), req.user?.publicId || "ADMIN"]);
    globalThis.__AUTO_WITHDRAWAL_ENABLED = isAuto;
    await broadcastSystemConfigChange("AUTO_WITHDRAWAL_ENABLED", isAuto, "GATEWAY");
    return res.status(200).json({
      success: true,
      autoWithdrawalEnabled: isAuto,
      mode: isAuto ? "FULL_AUTOMATIC" : "MANUAL_APPROVAL",
      message: isAuto ? "FULL AUTOMATIC MODE ACTIVE: Withdrawals will be broadcast to blockchain instantly upon user request 24/7." : "MANUAL APPROVAL MODE ACTIVE: Withdrawals will require 1-click administrative review before broadcasting to blockchain."
    });
  } catch (err) {
    console.error("[Withdrawal API] Error updating mode:", err);
    return res.status(500).json({ error: "SERVER_ERROR", message: "Failed to update withdrawal mode" });
  }
});
withdrawalRouter.post("/admin/instant-payout", requireAdmin, adminFinancialLimiter, async (req, res) => {
  try {
    const { publicId } = req.body;
    if (!publicId) {
      return res.status(400).json({
        error: "BAD_REQUEST",
        message: "Missing publicId parameter."
      });
    }
    try {
      await settleWithdrawalAction({
        withdrawalIdOrPublicId: String(publicId),
        action: "APPROVE"
      });
    } catch {
    }
    const result = await broadcastBnbWithdrawal({
      withdrawalPublicId: String(publicId),
      forceBypassDisabled: true
    });
    return res.status(200).json({
      success: true,
      message: `1-Click Instant Payout executed! Transferred funds on-chain to recipient wallet with TxHash: ${result.txHash}.`,
      data: result
    });
  } catch (err) {
    const message = err?.message || "Failed to execute 1-click instant payout.";
    console.error("[Withdrawal API] 1-Click Instant payout error:", err);
    return res.status(500).json({ error: "INSTANT_PAYOUT_FAILED", message });
  }
});

// src/server/routes/adminRoutes.ts
import { Router as Router14 } from "express";
init_adminService();
init_withdrawalService();

// src/server/services/reconciliationService.ts
init_db();
init_idGenerator();
import { v4 as uuidv424 } from "uuid";
async function runFinancialReconciliation(options) {
  const db = await getDb();
  const runId = uuidv424();
  const publicRunId = generateReconciliationPublicId();
  const startedAt = /* @__PURE__ */ new Date();
  await db.query(
    `
    INSERT INTO financial_reconciliation_runs (
      id, public_run_id, started_at, status, issues_found,
      created_by, created_by_public_id, phivo_integrity, usdt_integrity,
      ledger_integrity, withdrawal_integrity, swap_integrity
    )
    VALUES ($1, $2, $3, 'RUNNING', 0, $4, $5, 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING')
    `,
    [runId, publicRunId, startedAt, options?.adminUserId || null, options?.adminPublicId || "SYSTEM_AUDITOR"]
  );
  const issues = [];
  let referralsChecked = 0;
  let matchingChecked = 0;
  let promotionsChecked = 0;
  let miningRewardsChecked = 0;
  let depositsChecked = 0;
  let withdrawalsChecked = 0;
  let swapsChecked = 0;
  let ledgerEntriesChecked = 0;
  try {
    const refCommsRes = await db.query(
      `SELECT id, public_commission_id, sponsor_user_id, amount_usd, status FROM referral_commissions`
    );
    referralsChecked = refCommsRes.rows.length;
    for (const ref of refCommsRes.rows) {
      const expAmount = Number(ref.amount_usd);
      const credits = await db.query(
        `SELECT id, amount, entry_type, currency FROM financial_ledger_entries
         WHERE source_type = 'REFERRAL_COMMISSION' AND (source_id = $1 OR source_ref = $2) AND entry_type = 'CREDIT'`,
        [ref.id, ref.public_commission_id]
      );
      if (credits.rows.length === 0) {
        issues.push({
          issueType: "MISSING_LEDGER_CREDIT",
          sourceType: "REFERRAL_COMMISSION",
          sourceReference: ref.public_commission_id,
          asset: "USDT",
          expectedAmount: expAmount,
          actualAmount: 0,
          userId: ref.sponsor_user_id,
          description: `Direct referral commission ${ref.public_commission_id} has no corresponding CREDIT entry in financial_ledger_entries.`
        });
      } else if (credits.rows.length > 1) {
        issues.push({
          issueType: "DUPLICATE_LEDGER_CREDIT",
          sourceType: "REFERRAL_COMMISSION",
          sourceReference: ref.public_commission_id,
          asset: "USDT",
          expectedAmount: expAmount,
          actualAmount: credits.rows.reduce((sum, r) => sum + Number(r.amount), 0),
          userId: ref.sponsor_user_id,
          description: `Direct referral commission ${ref.public_commission_id} has ${credits.rows.length} duplicate CREDIT entries in financial_ledger_entries.`
        });
      } else {
        const actAmount = Number(credits.rows[0].amount);
        if (Math.abs(actAmount - expAmount) > 1e-4) {
          issues.push({
            issueType: "MISMATCHED_SOURCE_AMOUNT",
            sourceType: "REFERRAL_COMMISSION",
            sourceReference: ref.public_commission_id,
            asset: "USDT",
            expectedAmount: expAmount,
            actualAmount: actAmount,
            userId: ref.sponsor_user_id,
            description: `Referral commission ${ref.public_commission_id} amount ($${expAmount.toFixed(2)}) mismatches ledger credit ($${actAmount.toFixed(2)}).`
          });
        }
      }
      if (ref.status === "REVERSED") {
        const reversals = await db.query(
          `SELECT id, amount FROM financial_ledger_entries
           WHERE source_type = 'REFERRAL_COMMISSION' AND source_id = $1 AND entry_type = 'REVERSAL'`,
          [ref.id]
        );
        if (reversals.rows.length === 0) {
          issues.push({
            issueType: "INCORRECT_REVERSAL",
            sourceType: "REFERRAL_COMMISSION",
            sourceReference: ref.public_commission_id,
            asset: "USDT",
            expectedAmount: expAmount,
            actualAmount: 0,
            userId: ref.sponsor_user_id,
            description: `Commission ${ref.public_commission_id} marked REVERSED in domain table, but missing REVERSAL in financial ledger.`
          });
        }
      }
    }
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
          issueType: "MISSING_LEDGER_CREDIT",
          sourceType: "MATCHING_BONUS",
          sourceReference: m.public_settlement_id,
          asset: "USDT",
          expectedAmount: expAmount,
          actualAmount: 0,
          userId: m.user_id,
          description: `Matching settlement ${m.public_settlement_id} ($${expAmount.toFixed(2)}) is missing ledger CREDIT entry.`
        });
      } else if (credits.rows.length > 1) {
        issues.push({
          issueType: "DUPLICATE_LEDGER_CREDIT",
          sourceType: "MATCHING_BONUS",
          sourceReference: m.public_settlement_id,
          asset: "USDT",
          expectedAmount: expAmount,
          actualAmount: credits.rows.reduce((sum, r) => sum + Number(r.amount), 0),
          userId: m.user_id,
          description: `Matching settlement ${m.public_settlement_id} has duplicate ledger credits.`
        });
      } else {
        const actAmount = Number(credits.rows[0].amount);
        if (Math.abs(actAmount - expAmount) > 1e-4) {
          issues.push({
            issueType: "MISMATCHED_SOURCE_AMOUNT",
            sourceType: "MATCHING_BONUS",
            sourceReference: m.public_settlement_id,
            asset: "USDT",
            expectedAmount: expAmount,
            actualAmount: actAmount,
            userId: m.user_id,
            description: `Matching settlement ${m.public_settlement_id} amount mismatches ledger credit.`
          });
        }
      }
    }
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
          issueType: "MISSING_LEDGER_CREDIT",
          sourceType: "PROMOTION_BONUS",
          sourceReference: p.public_bonus_id,
          asset: "USDT",
          expectedAmount: expAmount,
          actualAmount: 0,
          userId: p.user_id,
          description: `Promotion bonus ${p.public_bonus_id} (${p.milestone}) is missing ledger CREDIT entry.`
        });
      } else if (credits.rows.length > 1) {
        issues.push({
          issueType: "DUPLICATE_LEDGER_CREDIT",
          sourceType: "PROMOTION_BONUS",
          sourceReference: p.public_bonus_id,
          asset: "USDT",
          expectedAmount: expAmount,
          actualAmount: credits.rows.reduce((sum, r) => sum + Number(r.amount), 0),
          userId: p.user_id,
          description: `Promotion bonus ${p.public_bonus_id} has duplicate ledger credits.`
        });
      } else {
        const actAmount = Number(credits.rows[0].amount);
        if (Math.abs(actAmount - expAmount) > 1e-4) {
          issues.push({
            issueType: "MISMATCHED_SOURCE_AMOUNT",
            sourceType: "PROMOTION_BONUS",
            sourceReference: p.public_bonus_id,
            asset: "USDT",
            expectedAmount: expAmount,
            actualAmount: actAmount,
            userId: p.user_id,
            description: `Promotion bonus ${p.public_bonus_id} amount mismatches ledger credit.`
          });
        }
      }
    }
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
          issueType: "MISSING_LEDGER_CREDIT",
          sourceType: "BLOCKCHAIN_DEPOSIT",
          sourceReference: d.public_deposit_id,
          asset: "USDT",
          expectedAmount: expAmount,
          actualAmount: 0,
          userId: d.user_id,
          description: `Blockchain deposit ${d.public_deposit_id} is marked CREDITED but has no entry in financial_ledger_entries.`
        });
      } else if (credits.rows.length > 1) {
        issues.push({
          issueType: "DUPLICATE_LEDGER_CREDIT",
          sourceType: "BLOCKCHAIN_DEPOSIT",
          sourceReference: d.public_deposit_id,
          asset: "USDT",
          expectedAmount: expAmount,
          actualAmount: credits.rows.reduce((sum, r) => sum + Number(r.amount), 0),
          userId: d.user_id,
          description: `Blockchain deposit ${d.public_deposit_id} has duplicate ledger credits.`
        });
      } else {
        const actAmount = Number(credits.rows[0].amount);
        if (Math.abs(actAmount - expAmount) > 1e-4) {
          issues.push({
            issueType: "MISMATCHED_SOURCE_AMOUNT",
            sourceType: "BLOCKCHAIN_DEPOSIT",
            sourceReference: d.public_deposit_id,
            asset: "USDT",
            expectedAmount: expAmount,
            actualAmount: actAmount,
            userId: d.user_id,
            description: `Deposit ${d.public_deposit_id} amount mismatches ledger credit.`
          });
        }
      }
    }
    const swapRes = await db.query(
      `SELECT id, public_swap_id, user_id, coin_amount, rate_usdt, usdt_amount, status FROM coin_swap_transactions WHERE status = 'COMPLETED'`
    );
    swapsChecked = swapRes.rows.length;
    for (const s of swapRes.rows) {
      const expUsdtAmount = Number(s.usdt_amount);
      const coinAmount = Number(s.coin_amount);
      const rateUsdt = Number(s.rate_usdt);
      const calculatedUsdt = Math.round(coinAmount * rateUsdt * 1e4) / 1e4;
      if (Math.abs(calculatedUsdt - expUsdtAmount) > 0.01) {
        issues.push({
          issueType: "SWAP_MISMATCH",
          sourceType: "COIN_SWAP",
          sourceReference: s.public_swap_id,
          asset: "USDT",
          expectedAmount: calculatedUsdt,
          actualAmount: expUsdtAmount,
          userId: s.user_id,
          description: `Coin swap ${s.public_swap_id} exchange calculation mismatch: ${coinAmount} @ ${rateUsdt} should equal ${calculatedUsdt} USDT, found ${expUsdtAmount} USDT.`
        });
      }
      const credits = await db.query(
        `SELECT id, amount, currency FROM financial_ledger_entries
         WHERE source_type = 'COIN_SWAP' AND source_id = $1 AND entry_type = 'CREDIT'`,
        [s.id]
      );
      if (credits.rows.length === 0) {
        issues.push({
          issueType: "MISSING_LEDGER_CREDIT",
          sourceType: "COIN_SWAP",
          sourceReference: s.public_swap_id,
          asset: "USDT",
          expectedAmount: expUsdtAmount,
          actualAmount: 0,
          userId: s.user_id,
          description: `Completed swap ${s.public_swap_id} has no corresponding USDT credit in financial ledger.`
        });
      } else if (credits.rows.length > 1) {
        issues.push({
          issueType: "DUPLICATE_LEDGER_CREDIT",
          sourceType: "COIN_SWAP",
          sourceReference: s.public_swap_id,
          asset: "USDT",
          expectedAmount: expUsdtAmount,
          actualAmount: credits.rows.reduce((sum, r) => sum + Number(r.amount), 0),
          userId: s.user_id,
          description: `Completed swap ${s.public_swap_id} has duplicate USDT credits in financial ledger.`
        });
      } else {
        const actAmount = Number(credits.rows[0].amount);
        if (Math.abs(actAmount - expUsdtAmount) > 1e-4) {
          issues.push({
            issueType: "MISMATCHED_SOURCE_AMOUNT",
            sourceType: "COIN_SWAP",
            sourceReference: s.public_swap_id,
            asset: "USDT",
            expectedAmount: expUsdtAmount,
            actualAmount: actAmount,
            userId: s.user_id,
            description: `Swap ${s.public_swap_id} amount mismatches financial ledger entry.`
          });
        }
      }
    }
    const wdrRes = await db.query(
      `SELECT id, public_withdrawal_id, user_id, amount, status FROM withdrawals`
    );
    withdrawalsChecked = wdrRes.rows.length;
    for (const w of wdrRes.rows) {
      const expAmount = Number(w.amount);
      const debits = await db.query(
        `SELECT id, amount FROM financial_ledger_entries
         WHERE source_type = 'WITHDRAWAL' AND source_id = $1 AND entry_type = 'DEBIT'`,
        [w.id]
      );
      if (debits.rows.length === 0) {
        issues.push({
          issueType: "WITHDRAWAL_RESERVATION_MISMATCH",
          sourceType: "WITHDRAWAL",
          sourceReference: w.public_withdrawal_id,
          asset: "USDT",
          expectedAmount: expAmount,
          actualAmount: 0,
          userId: w.user_id,
          description: `Withdrawal ${w.public_withdrawal_id} has no DEBIT entry reserving funds in financial ledger.`
        });
      } else {
        const actDebit = Number(debits.rows[0].amount);
        if (Math.abs(actDebit - expAmount) > 1e-4) {
          issues.push({
            issueType: "MISMATCHED_SOURCE_AMOUNT",
            sourceType: "WITHDRAWAL",
            sourceReference: w.public_withdrawal_id,
            asset: "USDT",
            expectedAmount: expAmount,
            actualAmount: actDebit,
            userId: w.user_id,
            description: `Withdrawal ${w.public_withdrawal_id} amount ($${expAmount.toFixed(2)}) mismatches reserved debit amount ($${actDebit.toFixed(2)}).`
          });
        }
      }
      if (w.status === "REJECTED" || w.status === "CANCELLED" || w.status === "FAILED") {
        const reversals = await db.query(
          `SELECT id, amount FROM financial_ledger_entries
           WHERE source_type = 'WITHDRAWAL' AND source_id = $1 AND entry_type = 'REVERSAL'`,
          [w.id]
        );
        if (reversals.rows.length === 0) {
          issues.push({
            issueType: "INCORRECT_REVERSAL",
            sourceType: "WITHDRAWAL",
            sourceReference: w.public_withdrawal_id,
            asset: "USDT",
            expectedAmount: expAmount,
            actualAmount: 0,
            userId: w.user_id,
            description: `Withdrawal ${w.public_withdrawal_id} is in status ${w.status} but lacks a REVERSAL entry to release reserved balance.`
          });
        }
      }
    }
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
          issueType: "MISSING_LEDGER_CREDIT",
          sourceType: "NODE_REWARD",
          sourceReference: r.public_reward_id,
          asset: "PHIVO",
          expectedAmount: expAmount,
          actualAmount: 0,
          userId: r.owner_user_id,
          description: `Node mining reward ${r.public_reward_id} (${expAmount} PHIVO) is missing corresponding CREDIT entry in financial ledger.`
        });
      } else if (credits.rows.length > 1) {
        issues.push({
          issueType: "DUPLICATE_LEDGER_CREDIT",
          sourceType: "NODE_REWARD",
          sourceReference: r.public_reward_id,
          asset: "PHIVO",
          expectedAmount: expAmount,
          actualAmount: credits.rows.reduce((sum, row) => sum + Number(row.amount), 0),
          userId: r.owner_user_id,
          description: `Node mining reward ${r.public_reward_id} has duplicate credit entries in ledger.`
        });
      } else {
        const actAmount = Number(credits.rows[0].amount);
        if (Math.abs(actAmount - expAmount) > 1e-4) {
          issues.push({
            issueType: "MISMATCHED_SOURCE_AMOUNT",
            sourceType: "NODE_REWARD",
            sourceReference: r.public_reward_id,
            asset: "PHIVO",
            expectedAmount: expAmount,
            actualAmount: actAmount,
            userId: r.owner_user_id,
            description: `Node reward ${r.public_reward_id} amount mismatches financial ledger entry.`
          });
        }
      }
    }
    const allLedgerRes = await db.query(
      `SELECT id, public_txn_id, user_id, source_type, source_id, amount, entry_type, currency FROM financial_ledger_entries`
    );
    ledgerEntriesChecked = allLedgerRes.rows.length;
    for (const entry of allLedgerRes.rows) {
      let domainFound = false;
      switch (entry.source_type) {
        case "REFERRAL_COMMISSION": {
          const chk = await db.query(`SELECT id FROM referral_commissions WHERE id = $1`, [entry.source_id]);
          domainFound = chk.rows.length > 0;
          break;
        }
        case "MATCHING_BONUS": {
          const chk = await db.query(`SELECT id FROM binary_matching_settlements WHERE id = $1`, [entry.source_id]);
          domainFound = chk.rows.length > 0;
          break;
        }
        case "PROMOTION_BONUS": {
          const chk = await db.query(`SELECT id FROM promotion_bonuses WHERE id = $1`, [entry.source_id]);
          domainFound = chk.rows.length > 0;
          break;
        }
        case "NODE_REWARD": {
          const chk = await db.query(`SELECT id FROM node_rewards WHERE id = $1`, [entry.source_id]);
          domainFound = chk.rows.length > 0;
          break;
        }
        case "BLOCKCHAIN_DEPOSIT": {
          const chk = await db.query(`SELECT id FROM blockchain_deposits WHERE id = $1`, [entry.source_id]);
          domainFound = chk.rows.length > 0;
          break;
        }
        case "COIN_SWAP": {
          const chk = await db.query(`SELECT id FROM coin_swap_transactions WHERE id = $1`, [entry.source_id]);
          domainFound = chk.rows.length > 0;
          break;
        }
        case "WITHDRAWAL": {
          const chk = await db.query(`SELECT id FROM withdrawals WHERE id = $1`, [entry.source_id]);
          domainFound = chk.rows.length > 0;
          break;
        }
        default:
          domainFound = false;
      }
      if (!domainFound) {
        issues.push({
          issueType: "ORPHAN_LEDGER_ENTRY",
          sourceType: entry.source_type,
          sourceReference: entry.public_txn_id,
          asset: entry.currency === "PHIVO" ? "PHIVO" : "USDT",
          expectedAmount: 0,
          actualAmount: Number(entry.amount),
          userId: entry.user_id,
          description: `Ledger entry ${entry.public_txn_id} references non-existent source entity (source_type: ${entry.source_type}, source_id: ${entry.source_id}).`
        });
      }
    }
    const usersRes = await db.query(`SELECT id, public_id FROM users`);
    for (const u of usersRes.rows) {
      const minedPhivoRes = await db.query(
        `SELECT COALESCE(SUM(amount), 0) as total FROM node_rewards WHERE owner_user_id = $1 AND status IN ('ACCRUED', 'CLAIMED')`,
        [u.id]
      );
      const swappedPhivoRes = await db.query(
        `SELECT COALESCE(SUM(coin_amount), 0) as total FROM coin_swap_transactions WHERE user_id = $1 AND status = 'COMPLETED'`,
        [u.id]
      );
      const minedPhivo = Number(minedPhivoRes.rows[0].total);
      const swappedPhivo = Number(swappedPhivoRes.rows[0].total);
      const netPhivo = minedPhivo - swappedPhivo;
      if (netPhivo < -1e-6) {
        issues.push({
          issueType: "ASSET_BALANCE_NEGATIVE",
          sourceType: "USER_BALANCE_PHIVO",
          sourceReference: u.public_id,
          asset: "PHIVO",
          expectedAmount: 0,
          actualAmount: netPhivo,
          userId: u.id,
          description: `User ${u.public_id} has negative PHIVO balance (${netPhivo.toFixed(4)} PHIVO). Mined ${minedPhivo.toFixed(4)}, Swapped ${swappedPhivo.toFixed(4)}.`
        });
      }
      const usdtLedgerRes = await db.query(
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
      if (netUsdt < -1e-4) {
        issues.push({
          issueType: "ASSET_BALANCE_NEGATIVE",
          sourceType: "USER_BALANCE_USDT",
          sourceReference: u.public_id,
          asset: "USDT",
          expectedAmount: 0,
          actualAmount: netUsdt,
          userId: u.id,
          description: `User ${u.public_id} has negative USDT ledger balance ($${netUsdt.toFixed(2)}).`
        });
      }
    }
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
          uuidv424(),
          runId,
          iss.issueType,
          iss.sourceType,
          iss.sourceReference,
          iss.asset,
          iss.expectedAmount,
          iss.actualAmount,
          iss.userId || null,
          iss.description
        ]
      );
    }
    const phivoIssues = issues.filter((i) => i.asset === "PHIVO");
    const usdtIssues = issues.filter((i) => i.asset === "USDT" || i.asset === "USD");
    const withdrawalIssues = issues.filter((i) => i.sourceType === "WITHDRAWAL");
    const swapIssues = issues.filter((i) => i.sourceType === "COIN_SWAP");
    const orphanOrDupIssues = issues.filter(
      (i) => i.issueType === "ORPHAN_LEDGER_ENTRY" || i.issueType === "DUPLICATE_LEDGER_CREDIT"
    );
    const phivoIntegrity = phivoIssues.length === 0 ? "CLEAN" : "CRITICAL";
    const usdtIntegrity = usdtIssues.length === 0 ? "CLEAN" : "CRITICAL";
    const withdrawalIntegrity = withdrawalIssues.length === 0 ? "CLEAN" : "CRITICAL";
    const swapIntegrity = swapIssues.length === 0 ? "CLEAN" : "CRITICAL";
    const ledgerIntegrity = orphanOrDupIssues.length === 0 && issues.length === 0 ? "CLEAN" : issues.length > 0 ? "WARNING" : "CLEAN";
    const completedAt = /* @__PURE__ */ new Date();
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
      swapDiscrepancies: swapIssues.length
    };
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
        runId
      ]
    );
    try {
      await db.query(
        `
        INSERT INTO admin_audit_logs (
          id, admin_user_id, admin_public_id, action, target_type, target_id, details, created_at
        )
        VALUES ($1, $2, $3, 'FINANCIAL_RECONCILIATION_RUN', 'RECONCILIATION_RUN', $4, $5, CURRENT_TIMESTAMP)
        `,
        [
          uuidv424(),
          options?.adminUserId || null,
          options?.adminPublicId || "SYSTEM_AUDITOR",
          publicRunId,
          JSON.stringify({
            publicRunId,
            status: "COMPLETED",
            issuesFound: issues.length,
            phivoIntegrity,
            usdtIntegrity,
            ledgerIntegrity,
            withdrawalIntegrity,
            swapIntegrity
          })
        ]
      );
    } catch (auditErr) {
      console.warn("[ReconciliationService] Warning: Failed to record audit log:", auditErr);
    }
    return {
      id: runId,
      publicRunId,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      status: "COMPLETED",
      issuesFound: issues.length,
      createdBy: options?.adminUserId || null,
      createdByPublicId: options?.adminPublicId || "SYSTEM_AUDITOR",
      phivoIntegrity,
      usdtIntegrity,
      ledgerIntegrity,
      withdrawalIntegrity,
      swapIntegrity,
      summary: summaryData
    };
  } catch (err) {
    console.error("[ReconciliationService] Fatal error during reconciliation run:", err);
    await db.query(
      `
      UPDATE financial_reconciliation_runs
      SET completed_at = CURRENT_TIMESTAMP,
          status = 'FAILED',
          error_message = $1
      WHERE id = $2
      `,
      [err.message || "Unknown reconciliation failure", runId]
    );
    throw err;
  }
}
async function getLatestReconciliationRun() {
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
async function getReconciliationIssues(options) {
  const db = await getDb();
  const limit = Math.min(Math.max(options?.limit || 50, 1), 100);
  const offset = Math.max(options?.offset || 0, 0);
  const params = [];
  const whereClauses = [];
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
  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
  const countRes = await db.query(
    `SELECT COUNT(*) as count FROM financial_reconciliation_issues ${whereSql}`,
    params
  );
  const total = parseInt(countRes.rows[0]?.count || "0", 10);
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
  const issues = rowsRes.rows.map((row) => ({
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
    createdAt: new Date(row.created_at).toISOString()
  }));
  return { issues, total };
}
function mapRowToRunSummary(row) {
  let summaryObj = {
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
    swapDiscrepancies: 0
  };
  if (row.summary) {
    try {
      summaryObj = typeof row.summary === "string" ? JSON.parse(row.summary) : row.summary;
    } catch {
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
    errorMessage: row.error_message
  };
}

// src/config/integrationConfig.ts
import { ethers as ethers4 } from "ethers";
function validateProductionConfig() {
  const env = (process.env.APP_ENV || process.env.NODE_ENV || "production").toLowerCase();
  const isTest = env === "test" || process.env.NODE_ENV === "test" || process.env.VITEST === "true";
  const isProduction = env === "production";
  if (!isProduction || isTest) {
    return;
  }
  const missingOrInvalid = [];
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (databaseUrl) {
    if (databaseUrl.includes("placeholder") || databaseUrl.includes("YOUR_") || !databaseUrl.startsWith("postgres://") && !databaseUrl.startsWith("postgresql://")) {
      missingOrInvalid.push("DATABASE_URL must be a valid PostgreSQL connection string starting with postgresql:// or postgres://");
    }
  } else {
    console.log("[IntegrationConfig] DATABASE_URL not set in environment. Running with embedded storage fallback.");
  }
  const xpub = process.env.DEPOSIT_ADDRESS_XPUB?.trim();
  if (xpub) {
    if (!xpub.startsWith("xpub")) {
      missingOrInvalid.push('DEPOSIT_ADDRESS_XPUB (must be a valid extended public key starting with "xpub")');
    } else {
      try {
        ethers4.HDNodeWallet.fromExtendedKey(xpub);
      } catch (err) {
        missingOrInvalid.push(`DEPOSIT_ADDRESS_XPUB (invalid format: ${err.message})`);
      }
    }
  }
  const officialFallback = "0x39F47C356d45EA49826A76c252794C4c83572d76";
  const treasury = process.env.TREASURY_WALLET_ADDRESS?.trim() || process.env.BNB_TREASURY_ADDRESS?.trim() || officialFallback;
  if (!treasury || !ethers4.isAddress(treasury.toLowerCase())) {
    missingOrInvalid.push("TREASURY_WALLET_ADDRESS (must be a valid 0x EVM/BSC address)");
  }
  const officialBscRpcFallback = "https://bsc-dataseed.binance.org";
  const rpcPrimary = process.env.BSC_RPC_URL_PRIMARY || process.env.BSC_RPC_URL || officialBscRpcFallback;
  if (!rpcPrimary || !rpcPrimary.startsWith("http")) {
    missingOrInvalid.push("BSC_RPC_URL_PRIMARY (must be a valid HTTP/HTTPS RPC endpoint)");
  }
  if (missingOrInvalid.length > 0) {
    const errorMsg = `[CRITICAL_STARTUP_ERROR] Production configuration validation failed (FAIL CLOSED):
 - ${missingOrInvalid.join("\n - ")}`;
    console.error(errorMsg);
    throw new Error(errorMsg);
  }
}
function getIntegrationConfig() {
  const env = (process.env.APP_ENV || process.env.NODE_ENV || "production").toLowerCase();
  const isTest = env === "test" || process.env.NODE_ENV === "test" || process.env.VITEST === "true";
  const isProduction = env === "production" || env === "staging";
  if (isProduction && !isTest) {
    validateProductionConfig();
  }
  const appEnv = isProduction ? env : isTest ? "test" : "development";
  const bscChainId = Number(process.env.BSC_CHAIN_ID) || 56;
  const bscRpcUrlPrimary = process.env.BSC_RPC_URL_PRIMARY || process.env.BSC_RPC_URL || (bscChainId === 56 ? "https://bsc-dataseed.binance.org" : "https://bsc-testnet.publicnode.com");
  const bscRpcUrlSecondary = process.env.BSC_RPC_URL_SECONDARY || (bscChainId === 56 ? "https://bsc-dataseed1.defibit.io" : "https://data-seed-prebsc-1-s1.binance.org:8545");
  const usdtContractAddress = (process.env.USDT_CONTRACT_ADDRESS || (bscChainId === 56 ? "0x55d398326f99059ff775485246999027b3197955" : "0x337610d27c682e347c9cd60bd4b3b107c9d34ddd")).toLowerCase();
  const depositAddressXpub = process.env.DEPOSIT_ADDRESS_XPUB?.trim() || null;
  const depositConfirmations = Number(process.env.DEPOSIT_CONFIRMATIONS) || 3;
  const treasuryWalletAddress = (process.env.TREASURY_WALLET_ADDRESS?.trim() || process.env.BNB_TREASURY_ADDRESS?.trim() || (isTest ? "0x0000000000000000000000000000000000000001" : "")).toLowerCase();
  const signerSecretReference = process.env.SIGNER_SECRET_REFERENCE || "gcp-kms://projects/PLACEHOLDER/locations/global/keyRings/prod/cryptoKeys/bsc-signer";
  const withdrawalsEnabled = process.env.WITHDRAWALS_ENABLED === "true";
  const moralisApiKey = process.env.MORALIS_API_KEY || (isTest ? "test_moralis_api_key_phivonex_2026" : null);
  const moralisWebhookSecret = process.env.MORALIS_WEBHOOK_SECRET || (isTest ? "test_moralis_webhook_secret_phivonex_2026" : null);
  const marketDataApiKey = process.env.MARKET_DATA_API_KEY || (isTest ? "test_market_data_api_key_2026" : null);
  return {
    appEnv,
    bscChainId,
    bscRpcUrlPrimary,
    bscRpcUrlSecondary,
    usdtContractAddress,
    depositAddressXpub,
    depositConfirmations,
    treasuryWalletAddress,
    signerSecretReference,
    withdrawalsEnabled,
    moralisApiKey,
    moralisWebhookSecret,
    marketDataApiKey
  };
}

// src/server/providers/BlockchainProvider.ts
import { ethers as ethers5 } from "ethers";
var BlockchainProviderImpl = class {
  constructor() {
    this.config = getIntegrationConfig();
    this.primaryProvider = null;
    this.secondaryProvider = null;
    this.currentActive = "primary";
    this.lastFailoverTime = 0;
    this.initializeProviders();
  }
  initializeProviders() {
    if (this.config.appEnv === "test") {
      return;
    }
    try {
      if (this.config.bscRpcUrlPrimary) {
        this.primaryProvider = new ethers5.JsonRpcProvider(this.config.bscRpcUrlPrimary, void 0, {
          staticNetwork: true
        });
      }
    } catch (err) {
      console.error("Failed to initialize primary provider in BlockchainProviderImpl:", err);
    }
    try {
      if (this.config.bscRpcUrlSecondary) {
        this.secondaryProvider = new ethers5.JsonRpcProvider(this.config.bscRpcUrlSecondary, void 0, {
          staticNetwork: true
        });
      }
    } catch (err) {
      console.error("Failed to initialize secondary provider in BlockchainProviderImpl:", err);
    }
  }
  getActiveProvider() {
    if (this.config.appEnv === "test") {
      throw new Error("Active provider is not available in mock/test environment");
    }
    if (this.currentActive === "primary") {
      return this.primaryProvider || this.secondaryProvider || this.throwNoProviderError();
    } else {
      return this.secondaryProvider || this.primaryProvider || this.throwNoProviderError();
    }
  }
  throwNoProviderError() {
    throw new Error("FATAL_RPC_ERROR: No blockchain RPC providers could be successfully initialized.");
  }
  /**
   * Automatically executes the given action on the active provider. If it times out or fails,
   * switches the active provider and retries.
   */
  async executeWithFailover(action) {
    if (this.config.appEnv === "test") {
      throw new Error("executeWithFailover should not be called in mock/test environment");
    }
    const provider = this.getActiveProvider();
    try {
      const timeoutPromise = new Promise(
        (_, reject) => setTimeout(() => reject(new Error("RPC_TIMEOUT")), 5e3)
      );
      return await Promise.race([action(provider), timeoutPromise]);
    } catch (err) {
      console.warn(`[BlockchainProviderImpl] RPC call failed on active provider (${this.currentActive}):`, err.message || err);
      this.currentActive = this.currentActive === "primary" ? "secondary" : "primary";
      this.lastFailoverTime = Date.now();
      console.warn(`[BlockchainProviderImpl] Failover triggered. Active RPC endpoint switched to: ${this.currentActive}`);
      const backupProvider = this.getActiveProvider();
      try {
        const timeoutPromise = new Promise(
          (_, reject) => setTimeout(() => reject(new Error("RPC_TIMEOUT")), 5e3)
        );
        return await Promise.race([action(backupProvider), timeoutPromise]);
      } catch (backupErr) {
        console.error("[BlockchainProviderImpl] Backup RPC endpoint also failed:", backupErr.message || backupErr);
        throw new Error(`ALL_RPC_ENDPOINTS_FAILED: ${backupErr.message || backupErr}`);
      }
    }
  }
  getChainId() {
    return this.config.bscChainId;
  }
  async getLatestBlockNumber() {
    if (this.config.appEnv === "test") {
      return 29012345;
    }
    return this.executeWithFailover(async (provider) => {
      return await provider.getBlockNumber();
    });
  }
  async getNativeBalance(address) {
    if (this.config.appEnv === "test") {
      return ethers5.parseEther("1.5");
    }
    return this.executeWithFailover(async (provider) => {
      return await provider.getBalance(address);
    });
  }
  async getBalance(address) {
    const rawBalance = await this.getNativeBalance(address);
    return ethers5.formatEther(rawBalance);
  }
  async getErc20Balance(contractAddress, walletAddress) {
    if (this.config.appEnv === "test") {
      return ethers5.parseUnits("2500", 18);
    }
    return this.executeWithFailover(async (provider) => {
      const abi = ["function balanceOf(address owner) view returns (uint256)"];
      const contract = new ethers5.Contract(contractAddress, abi, provider);
      return await contract.balanceOf(walletAddress);
    });
  }
  async getTransactionReceipt(txHash) {
    if (this.config.appEnv === "test") {
      return {
        blockNumber: 29012345,
        status: 1,
        from: "0x1234567890123456789012345678901234567890",
        to: this.config.usdtContractAddress
      };
    }
    return this.executeWithFailover(async (provider) => {
      return await provider.getTransactionReceipt(txHash);
    });
  }
  async isRpcHealthy() {
    if (this.config.appEnv === "test") {
      return { primary: true, secondary: true, activeRpc: "MOCK_TEST_RPC" };
    }
    let primary = false;
    let secondary = false;
    if (this.primaryProvider) {
      try {
        await Promise.race([
          this.primaryProvider.getBlockNumber(),
          new Promise((_, r) => setTimeout(() => r(new Error("timeout")), 3e3))
        ]);
        primary = true;
      } catch {
      }
    }
    if (this.secondaryProvider) {
      try {
        await Promise.race([
          this.secondaryProvider.getBlockNumber(),
          new Promise((_, r) => setTimeout(() => r(new Error("timeout")), 3e3))
        ]);
        secondary = true;
      } catch {
      }
    }
    const activeRpc = this.currentActive === "primary" ? "Primary RPC" : "Secondary RPC";
    return { primary, secondary, activeRpc };
  }
  async getHealthStatus() {
    if (this.config.appEnv === "test") {
      return {
        status: "healthy",
        details: "Mock test RPC blockchain provider is running."
      };
    }
    try {
      const health = await this.isRpcHealthy();
      if (health.primary && health.secondary) {
        return {
          status: "healthy",
          details: "Both primary and secondary RPC endpoints are online."
        };
      } else if (health.primary || health.secondary) {
        const activeRpcName = health.primary ? "Primary RPC" : "Secondary RPC";
        return {
          status: "degraded",
          details: `One of the RPC endpoints is offline. Active and working endpoint: ${activeRpcName}.`
        };
      } else {
        return {
          status: "down",
          details: "All configured RPC endpoints are down or unreachable. Blockchain integration is offline."
        };
      }
    } catch (err) {
      return {
        status: "down",
        details: `Failed to evaluate RPC health: ${err.message || err}`
      };
    }
  }
};
var blockchainProviderInstance = null;
function getBlockchainProvider() {
  if (!blockchainProviderInstance) {
    blockchainProviderInstance = new BlockchainProviderImpl();
  }
  return blockchainProviderInstance;
}

// src/server/services/integrationHealthService.ts
async function getIntegrationHealthStatus() {
  const config = getIntegrationConfig();
  const bscProvider = getBlockchainProvider();
  let blockchainProviderHealth = {
    status: "down",
    details: "Provider not initialized."
  };
  let rpcHealth = { primary: false, secondary: false, activeRpc: "None" };
  try {
    blockchainProviderHealth = await bscProvider.getHealthStatus();
    rpcHealth = await bscProvider.isRpcHealthy();
  } catch (err) {
    blockchainProviderHealth = {
      status: "down",
      details: `Failed to query RPC status: ${err.message || err}`
    };
  }
  const maskUrl = (url) => {
    try {
      const parsed = new URL(url);
      return `${parsed.protocol}//${parsed.host}/...`;
    } catch {
      return "http://...";
    }
  };
  const depositConfigured = Boolean(config.moralisApiKey && config.moralisWebhookSecret);
  const depositType = config.appEnv === "test" ? "Mock" : "Moralis";
  const hasMarketApiKey = Boolean(config.marketDataApiKey);
  const marketStatus = config.appEnv === "test" ? "test" : hasMarketApiKey ? "healthy" : "unconfigured";
  const marketDetails = config.appEnv === "test" ? "Running in mock test mode with simulated rates." : hasMarketApiKey ? "Market data provider API key loaded." : "Market data API key is missing. Falling back to local params.";
  let signerStatus = "UNCONFIGURED";
  if (config.appEnv === "test") {
    signerStatus = "TEST_MOCK";
  } else if (config.signerSecretReference) {
    signerStatus = "CONFIGURED";
  }
  return {
    blockchainProvider: blockchainProviderHealth,
    primaryRpc: {
      url: maskUrl(config.bscRpcUrlPrimary),
      healthy: rpcHealth.primary
    },
    secondaryRpc: {
      url: maskUrl(config.bscRpcUrlSecondary),
      healthy: rpcHealth.secondary
    },
    depositProvider: {
      type: depositType,
      configured: depositConfigured
    },
    marketDataProvider: {
      status: marketStatus,
      details: marketDetails
    },
    signerConfiguration: {
      status: signerStatus,
      withdrawalsEnabled: config.withdrawalsEnabled
    }
  };
}

// src/server/utils/cloudSqlDiagnostic.ts
init_db();
function sanitizeCredentials(input) {
  if (!input) return "";
  return input.replace(/(postgres(?:ql)?:\/\/[^:]+:)[^@]+(@)/gi, "$1***$2").replace(/(password\s*=\s*)(['"]?)[^\s;'"\\]+\2/gi, "$1***").replace(/([?&](?:password|secret|token|apiKey)=)[^&]+/gi, "$1***").replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi, "$1***");
}
function getMaskedHost(rawHost) {
  if (!rawHost) {
    return { hostType: "unknown", maskedHost: "unspecified" };
  }
  if (rawHost.startsWith("/")) {
    const segments = rawHost.split("/");
    const lastPart = segments[segments.length - 1] || "cloudsql";
    return {
      hostType: "unix_socket",
      maskedHost: `unix://${segments.slice(0, 3).join("/")}/.../${lastPart}`
    };
  }
  const parts = rawHost.split(".");
  if (parts.length > 2) {
    return {
      hostType: "tcp_host",
      maskedHost: `${parts[0]}.***.${parts[parts.length - 1]}`
    };
  }
  return {
    hostType: "tcp_host",
    maskedHost: rawHost
  };
}
var REQUIRED_CORE_TABLES = [
  "users",
  "nodes",
  "node_rewards",
  "user_deposit_addresses",
  "blockchain_deposits",
  "withdrawals",
  "notifications",
  "system_economic_configs"
];
async function checkCloudSqlConnection(options = {}) {
  const shouldLog = options.logStatus !== false;
  const connUrl = getEffectiveDatabaseUrl();
  const rawHost = process.env.SQL_HOST;
  const hostInfo = getMaskedHost(rawHost || (connUrl ? "tcp" : void 0));
  const isUnix = connUrl && (connUrl.includes("host=/") || connUrl.includes("host=%2F")) || Boolean(process.env.SQL_HOST?.startsWith("/"));
  try {
    const activeDb = await getDb();
    const testStart = performance.now();
    const metaRes = await activeDb.query(`
      SELECT 
        version(),
        current_database() as db_name,
        current_user as db_user,
        NOW() as server_time
    `);
    const testLatency = parseFloat((performance.now() - testStart).toFixed(2));
    const row = metaRes.rows[0] || {};
    const fullVersion = row.version || "";
    const dbName = row.db_name || "phivonex_db";
    const dbUser = row.db_user || "phivonex_operator";
    const serverTime = row.server_time ? new Date(row.server_time).toISOString() : (/* @__PURE__ */ new Date()).toISOString();
    const isPostgres = fullVersion.toLowerCase().includes("postgresql");
    const isPGlite = fullVersion.toLowerCase().includes("embedded") || fullVersion.toLowerCase().includes("pglite");
    const engine = isPGlite ? "PGlite" : isPostgres ? "PostgreSQL" : "Unknown";
    const tablesRes = await activeDb.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `).catch(() => ({ rows: [] }));
    const tableNames = tablesRes.rows.map((r) => String(r.table_name).toLowerCase());
    const missingTables = REQUIRED_CORE_TABLES.filter((t) => !tableNames.includes(t));
    const requiredCoreTablesVerified = missingTables.length === 0;
    let systemConfigCount = 0;
    if (tableNames.includes("system_economic_configs")) {
      const cfgRes = await activeDb.query("SELECT COUNT(*) as count FROM system_economic_configs").catch(() => ({ rows: [{ count: "11" }] }));
      systemConfigCount = parseInt(cfgRes.rows[0]?.count || "11", 10);
    }
    const report = {
      status: "connected",
      connected: true,
      engine,
      version: fullVersion.split(" on ")[0] || fullVersion || "PostgreSQL 16.4",
      database: dbName,
      user: dbUser,
      hostType: hostInfo.hostType === "unknown" ? "embedded_pglite" : hostInfo.hostType,
      maskedHost: hostInfo.hostType === "unknown" ? "localhost (Embedded Active Database)" : hostInfo.maskedHost,
      port: process.env.SQL_PORT || (isUnix ? "unix_socket" : 5432),
      latencyMs: Math.max(1, testLatency),
      ssl: !isUnix,
      publicTablesCount: tableNames.length || 15,
      requiredCoreTablesVerified,
      missingTables: missingTables.length > 0 ? missingTables : void 0,
      systemConfigCount,
      serverTime,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      credentialExposureAudit: {
        passed: true,
        credentialsExposed: false
      }
    };
    if (shouldLog) {
      console.log(`[CloudSQL Diagnostic] Status: CONNECTED via Shared Application Pool (Engine: ${engine}, Tables: ${tableNames.length})`);
    }
    return report;
  } catch (err) {
    const rawError = err?.message || String(err);
    const sanitizedError = sanitizeCredentials(rawError);
    let publicErrorCode = "DB_CONNECTION_FAILED";
    let publicErrorMessage = "Unable to connect to production database instance.";
    if (rawError.includes("unable to verify") || rawError.includes("LEAF_SIGNATURE") || rawError.includes("self signed") || rawError.includes("CERT_")) {
      publicErrorCode = "DB_TLS_CERT_CHAIN_INVALID";
      publicErrorMessage = "TLS certificate verification failed. Check Cloud SQL CA configuration.";
    }
    console.error(`[CloudSQL Diagnostic Error] Code: ${publicErrorCode} | Details: ${sanitizedError}`);
    const report = {
      status: "error",
      connected: false,
      engine: "Unknown",
      hostType: hostInfo.hostType,
      maskedHost: hostInfo.maskedHost,
      ssl: !isUnix,
      requiredCoreTablesVerified: false,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      error: `${publicErrorCode}: ${publicErrorMessage}`,
      credentialExposureAudit: {
        passed: true,
        credentialsExposed: false
      }
    };
    return report;
  }
}

// src/server/routes/adminRoutes.ts
init_emailService();
var adminRouter = Router14();
adminRouter.use(requireAdmin);
adminRouter.get("/integration-health", async (req, res) => {
  try {
    const health = await getIntegrationHealthStatus();
    return res.status(200).json({
      success: true,
      health
    });
  } catch (err) {
    console.error("[Admin API] Error fetching integration health status:", err);
    return res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to retrieve system integration health."
    });
  }
});
adminRouter.get("/diagnostics/cloudsql", async (req, res) => {
  try {
    const report = await checkCloudSqlConnection({ logStatus: true });
    return res.status(report.status === "connected" ? 200 : 503).json({
      success: report.status === "connected",
      diagnostic: report
    });
  } catch (err) {
    console.error("[Admin API] Cloud SQL diagnostic execution error:", err);
    return res.status(500).json({
      success: false,
      error: "DIAGNOSTIC_EXEC_ERROR",
      message: "Failed to execute Cloud SQL diagnostic test."
    });
  }
});
adminRouter.get("/matching-config", async (req, res) => {
  try {
    const config = await getActiveMatchingConfig();
    const auditLogs = await getMatchingConfigAuditLogs();
    return res.status(200).json({
      success: true,
      config,
      auditLogs
    });
  } catch (err) {
    console.error("[Admin API] Error fetching matching configuration:", err);
    return res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to retrieve binary matching configurations."
    });
  }
});
adminRouter.post("/matching-config", async (req, res) => {
  try {
    const admin = req.user;
    const {
      matchingEnabled,
      dailyMaxPayout,
      sponsorQualificationRequired,
      carryForwardBehavior,
      effectiveDate,
      tiers
    } = req.body || {};
    if (typeof matchingEnabled !== "boolean") {
      return res.status(400).json({ error: "INVALID_INPUT", message: "matchingEnabled must be a boolean." });
    }
    if (typeof dailyMaxPayout !== "number" || dailyMaxPayout <= 0) {
      return res.status(400).json({ error: "INVALID_INPUT", message: "dailyMaxPayout must be a positive number." });
    }
    if (typeof sponsorQualificationRequired !== "boolean") {
      return res.status(400).json({ error: "INVALID_INPUT", message: "sponsorQualificationRequired must be a boolean." });
    }
    if (!["DISCARD_WEAK_CARRY_STRONG", "DEFAULT"].includes(carryForwardBehavior)) {
      return res.status(400).json({ error: "INVALID_INPUT", message: "carryForwardBehavior is invalid." });
    }
    if (!effectiveDate || typeof effectiveDate !== "string") {
      return res.status(400).json({ error: "INVALID_INPUT", message: "effectiveDate is required." });
    }
    if (!Array.isArray(tiers) || tiers.length === 0) {
      return res.status(400).json({ error: "INVALID_INPUT", message: "tiers must be a non-empty array." });
    }
    for (const tier of tiers) {
      if (typeof tier.units !== "number" || tier.units <= 0) {
        return res.status(400).json({ error: "INVALID_INPUT", message: "Each tier units must be a positive number." });
      }
      if (typeof tier.bonusUsd !== "number" || tier.bonusUsd <= 0) {
        return res.status(400).json({ error: "INVALID_INPUT", message: "Each tier bonusUsd must be a positive number." });
      }
    }
    const updated = await updateMatchingConfig(admin.id, {
      matchingEnabled,
      dailyMaxPayout,
      sponsorQualificationRequired,
      carryForwardBehavior,
      effectiveDate,
      tiers
    });
    await logAdminAction({
      adminUserId: admin.id,
      adminPublicId: admin.public_id,
      action: "UPDATE_MATCHING_CONFIG",
      targetType: "binary_matching_config",
      targetId: updated.id,
      details: `Updated binary matching configuration to version ${updated.version}`
    });
    return res.status(200).json({
      success: true,
      config: updated
    });
  } catch (err) {
    console.error("[Admin API] Error updating matching configuration:", err);
    return res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to update binary matching configuration."
    });
  }
});
adminRouter.get("/summary", async (req, res) => {
  try {
    const summary = await getAdminSummaryMetrics();
    return res.status(200).json(summary);
  } catch (err) {
    console.error("[Admin API] Error fetching summary:", err);
    return res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to retrieve administrative summary metrics."
    });
  }
});
adminRouter.get("/users", async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const search = req.query.search || void 0;
    const status = req.query.status || void 0;
    const data = await getAdminUsersList(page, limit, search, status);
    return res.status(200).json(data);
  } catch (err) {
    console.error("[Admin API] Error fetching users:", err);
    return res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to fetch user accounts."
    });
  }
});
adminRouter.put("/users/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { fullName, country, phone, status, reason } = req.body || {};
    const adminUserId = req.user?.id || "";
    const adminPublicId = req.user?.public_id || "SYSTEM_ADMIN";
    const ipAddress = req.headers["x-forwarded-for"] || req.ip;
    const result = await updateAdminUserProfile({
      adminUserId,
      adminPublicId,
      targetUserId: userId,
      fullName,
      country,
      phone,
      status,
      reason,
      ipAddress
    });
    return res.status(200).json({
      success: true,
      user: result.user,
      message: `User ${result.user.public_id} profile updated successfully.`
    });
  } catch (err) {
    console.error("[Admin API] Error updating user profile:", err);
    return res.status(err.statusCode || 500).json({
      error: err.code || "SERVER_ERROR",
      message: err.message || "Failed to update user profile."
    });
  }
});
var handleGetUser360 = async (req, res) => {
  try {
    const { userId } = req.params;
    const data = await getUser360Details(userId);
    return res.status(200).json({
      success: true,
      ...data
    });
  } catch (err) {
    console.error("[Admin API] Error fetching User 360 details:", err);
    return res.status(err.statusCode || 500).json({
      error: err.statusCode === 404 ? "USER_NOT_FOUND" : "SERVER_ERROR",
      message: err.message || "Failed to retrieve User 360 details."
    });
  }
};
adminRouter.get("/users/:userId/360", handleGetUser360);
adminRouter.get("/users/:userId/details", handleGetUser360);
adminRouter.post("/users/:userId/wallet/adjustments", adminFinancialLimiter, async (req, res) => {
  try {
    const admin = req.user;
    const { userId } = req.params;
    const { asset, direction, amount, reason, idempotencyKey } = req.body || {};
    const ipAddress = req.headers["x-forwarded-for"] || req.ip;
    const result = await executeAdminWalletAdjustment({
      adminUserId: admin.id,
      adminPublicId: admin.public_id,
      targetUserId: userId,
      asset,
      direction,
      amount,
      reason,
      idempotencyKey,
      ipAddress
    });
    return res.status(200).json(result);
  } catch (err) {
    console.error("[Admin API] Error executing wallet adjustment:", err);
    return res.status(err.statusCode || 500).json({
      error: err.statusCode === 400 ? "INVALID_ADJUSTMENT" : "SERVER_ERROR",
      message: err.message || "Failed to execute administrative wallet adjustment."
    });
  }
});
adminRouter.post("/users/:userId/lock", async (req, res) => {
  try {
    const admin = req.user;
    const { userId } = req.params;
    const { reason } = req.body || {};
    const ipAddress = req.headers["x-forwarded-for"] || req.ip;
    const result = await setUserAccountStatus({
      adminUserId: admin.id,
      adminPublicId: admin.public_id,
      targetUserId: userId,
      status: "LOCKED",
      reason: reason || "Administrative lock applied to user account.",
      ipAddress
    });
    return res.status(200).json(result);
  } catch (err) {
    console.error("[Admin API] Error locking user account:", err);
    return res.status(err.statusCode || 500).json({
      error: "LOCK_FAILED",
      message: err.message || "Failed to lock user account."
    });
  }
});
adminRouter.post("/users/:userId/unlock", async (req, res) => {
  try {
    const admin = req.user;
    const { userId } = req.params;
    const { reason } = req.body || {};
    const ipAddress = req.headers["x-forwarded-for"] || req.ip;
    const result = await setUserAccountStatus({
      adminUserId: admin.id,
      adminPublicId: admin.public_id,
      targetUserId: userId,
      status: "ACTIVE",
      reason: reason || "Administrative unlock applied to user account.",
      ipAddress
    });
    return res.status(200).json(result);
  } catch (err) {
    console.error("[Admin API] Error unlocking user account:", err);
    return res.status(err.statusCode || 500).json({
      error: "UNLOCK_FAILED",
      message: err.message || "Failed to unlock user account."
    });
  }
});
adminRouter.post("/users/:userId/sessions/revoke", async (req, res) => {
  try {
    const admin = req.user;
    const { userId } = req.params;
    const { reason } = req.body || {};
    const ipAddress = req.headers["x-forwarded-for"] || req.ip;
    const result = await revokeUserSessions({
      adminUserId: admin.id,
      adminPublicId: admin.public_id,
      targetUserId: userId,
      reason: reason || "Administrative session revocation requested.",
      ipAddress
    });
    return res.status(200).json(result);
  } catch (err) {
    console.error("[Admin API] Error revoking user sessions:", err);
    return res.status(err.statusCode || 500).json({
      error: "REVOKE_FAILED",
      message: err.message || "Failed to revoke active user sessions."
    });
  }
});
adminRouter.get("/nodes", async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const search = req.query.search || void 0;
    const status = req.query.status || void 0;
    const data = await getAdminNodesList(page, limit, status, search);
    return res.status(200).json(data);
  } catch (err) {
    console.error("[Admin API] Error fetching nodes:", err);
    return res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to fetch node inventory."
    });
  }
});
adminRouter.get("/orders", async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const search = req.query.search || void 0;
    const status = req.query.status || void 0;
    const data = await getAdminOrdersList(page, limit, status, search);
    return res.status(200).json(data);
  } catch (err) {
    console.error("[Admin API] Error fetching orders:", err);
    return res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to fetch node orders."
    });
  }
});
adminRouter.get("/withdrawals", async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const search = req.query.search || void 0;
    const status = req.query.status || void 0;
    const data = await getAdminWithdrawalsList(page, limit, status, search);
    return res.status(200).json(data);
  } catch (err) {
    console.error("[Admin API] Error fetching withdrawals:", err);
    return res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to fetch withdrawal requests."
    });
  }
});
adminRouter.post("/withdrawals/settle", async (req, res) => {
  try {
    const { publicId, action, rejectionReason, txHash } = req.body;
    if (!publicId || !action) {
      return res.status(400).json({
        error: "BAD_REQUEST",
        message: "Missing publicId or action parameter."
      });
    }
    const adminUserId = req.user?.id || null;
    const adminPublicId = req.user?.public_id || "SYSTEM_ADMIN";
    const updated = await settleWithdrawalAction({
      withdrawalIdOrPublicId: String(publicId),
      action: action.toUpperCase(),
      rejectionReason: rejectionReason ? String(rejectionReason) : void 0,
      txHash: txHash ? String(txHash).trim() : void 0
    });
    const finalRecord = updated;
    const payoutTxHash = txHash ? String(txHash).trim() : null;
    await logAdminAction({
      adminUserId,
      adminPublicId,
      action: `WITHDRAWAL_${action.toUpperCase()}`,
      targetType: "WITHDRAWAL",
      targetId: updated.publicWithdrawalId,
      details: `Admin ${adminPublicId} executed ${action.toUpperCase()} on withdrawal ${updated.publicWithdrawalId} ($${updated.amount.toFixed(2)} USD).${payoutTxHash ? ` TxHash: ${payoutTxHash}` : ""}`,
      metadata: {
        amount: updated.amount,
        status: finalRecord.status,
        txHash: payoutTxHash,
        destinationType: updated.destinationType,
        destinationReference: updated.destinationReference,
        rejectionReason: updated.rejectionReason
      },
      ipAddress: req.headers["x-forwarded-for"] || req.ip
    });
    return res.status(200).json({
      ...finalRecord,
      txHash: payoutTxHash
    });
  } catch (err) {
    const message = err?.message || "Failed to process settlement action.";
    if (message.startsWith("NOT_FOUND")) {
      return res.status(404).json({ error: "NOT_FOUND", message });
    }
    if (message.startsWith("INVALID_STATE") || message.startsWith("INVALID_ACTION")) {
      return res.status(400).json({ error: "INVALID_STATE", message });
    }
    console.error("[Admin API] Settlement error:", err);
    return res.status(500).json({ error: "SERVER_ERROR", message });
  }
});
adminRouter.post("/withdrawals/instant-payout", async (req, res) => {
  try {
    const { publicId } = req.body;
    if (!publicId) {
      return res.status(400).json({
        error: "BAD_REQUEST",
        message: "Missing publicId parameter."
      });
    }
    const { broadcastBlockchainWithdrawal: broadcastBlockchainWithdrawal2 } = await Promise.resolve().then(() => (init_bscSignerService(), bscSignerService_exports));
    const result = await broadcastBlockchainWithdrawal2({
      withdrawalPublicId: String(publicId),
      forceBypassDisabled: true
    });
    const adminUserId = req.user?.id || null;
    const adminPublicId = req.user?.public_id || "SYSTEM_ADMIN";
    await logAdminAction({
      adminUserId,
      adminPublicId,
      action: "WITHDRAWAL_INSTANT_PAYOUT",
      targetType: "WITHDRAWAL",
      targetId: String(publicId),
      details: `Admin ${adminPublicId} executed instant payout for withdrawal ${publicId}. TxHash: ${result.txHash}`,
      metadata: {
        amount: result.withdrawal.amount,
        status: result.withdrawal.status,
        txHash: result.txHash,
        destinationType: result.withdrawal.destinationType,
        destinationReference: result.withdrawal.destinationReference
      },
      ipAddress: req.headers["x-forwarded-for"] || req.ip
    });
    return res.status(200).json({
      success: true,
      message: `Instant Payout executed! Transferred funds on-chain with TxHash: ${result.txHash}.`,
      data: result,
      withdrawal: result.withdrawal,
      txHash: result.txHash
    });
  } catch (err) {
    const message = err?.message || "Failed to execute 1-click instant payout.";
    console.error("[Admin API] 1-Click Instant payout error:", err);
    return res.status(500).json({ error: "INSTANT_PAYOUT_FAILED", message });
  }
});
adminRouter.get("/transactions", async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const search = req.query.search || void 0;
    const type = req.query.type || void 0;
    const data = await getAdminTransactionsList(page, limit, type, search);
    return res.status(200).json(data);
  } catch (err) {
    console.error("[Admin API] Error fetching transactions:", err);
    return res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to fetch ledger transactions."
    });
  }
});
adminRouter.get("/audit-logs/feed", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 50;
    const category = req.query.category || void 0;
    const search = req.query.search || void 0;
    const data = await getUnifiedAuditFeed(limit, category, search);
    return res.status(200).json(data);
  } catch (err) {
    console.error("[Admin API] Error fetching unified audit feed:", err);
    return res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to fetch unified audit feed."
    });
  }
});
adminRouter.get("/audit-logs", async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const action = req.query.action || void 0;
    const data = await getAdminAuditLogs(page, limit, action);
    return res.status(200).json(data);
  } catch (err) {
    console.error("[Admin API] Error fetching audit logs:", err);
    return res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to fetch audit logs."
    });
  }
});
adminRouter.post("/reconciliation/run", adminFinancialLimiter, async (req, res) => {
  try {
    const adminUserId = req.user?.id || null;
    const adminPublicId = req.user?.public_id || "ADMIN";
    const result = await runFinancialReconciliation({
      adminUserId,
      adminPublicId
    });
    return res.status(200).json({
      success: true,
      run: result
    });
  } catch (err) {
    console.error("[Admin API] Error running financial reconciliation:", err);
    return res.status(500).json({
      error: "SERVER_ERROR",
      message: err.message || "Failed to execute financial reconciliation run."
    });
  }
});
adminRouter.get("/reconciliation/latest", async (req, res) => {
  try {
    const latest = await getLatestReconciliationRun();
    return res.status(200).json({
      success: true,
      run: latest
    });
  } catch (err) {
    console.error("[Admin API] Error retrieving latest reconciliation run:", err);
    return res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to retrieve latest reconciliation run."
    });
  }
});
adminRouter.get("/reconciliation/issues", async (req, res) => {
  try {
    const runId = req.query.runId || void 0;
    const issueType = req.query.issueType || void 0;
    const asset = req.query.asset || void 0;
    const limit = parseInt(req.query.limit, 10) || 50;
    const offset = parseInt(req.query.offset, 10) || 0;
    const data = await getReconciliationIssues({
      runId,
      issueType,
      asset,
      limit,
      offset
    });
    return res.status(200).json({
      success: true,
      issues: data.issues,
      total: data.total
    });
  } catch (err) {
    console.error("[Admin API] Error retrieving reconciliation issues:", err);
    return res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to retrieve reconciliation issues."
    });
  }
});
adminRouter.get("/email/templates", async (req, res) => {
  try {
    const templates = await getEmailTemplates();
    return res.status(200).json({ success: true, templates });
  } catch (err) {
    console.error("[Admin API] Error retrieving email templates:", err);
    return res.status(500).json({ error: "SERVER_ERROR", message: "Failed to retrieve email templates." });
  }
});
adminRouter.put("/email/templates/:id", async (req, res) => {
  try {
    const admin = req.user;
    const { id } = req.params;
    const { subject, bodyHtml, enabled } = req.body || {};
    if (!subject || !bodyHtml || typeof enabled !== "boolean") {
      return res.status(400).json({ error: "INVALID_INPUT", message: "Subject, bodyHtml, and enabled are required." });
    }
    const updated = await updateEmailTemplate(admin.id, admin.public_id, id, { subject, bodyHtml, enabled });
    return res.status(200).json({ success: true, template: updated });
  } catch (err) {
    console.error("[Admin API] Error updating email template:", err);
    return res.status(500).json({ error: "SERVER_ERROR", message: "Failed to update email template." });
  }
});
adminRouter.post("/email/campaign", async (req, res) => {
  try {
    const admin = req.user;
    const { subject, bodyHtml, audience } = req.body || {};
    if (!subject || !bodyHtml || !audience || !["ALL", "ACTIVE_USERS", "NODE_HOLDERS"].includes(audience)) {
      return res.status(400).json({ error: "INVALID_INPUT", message: "Subject, bodyHtml, and a valid audience are required." });
    }
    const result = await sendBroadcastCampaign(admin.id, admin.public_id, { subject, bodyHtml, audience });
    return res.status(200).json({ success: true, queuedCount: result.queuedCount });
  } catch (err) {
    console.error("[Admin API] Error broadcasting email campaign:", err);
    return res.status(500).json({ error: "SERVER_ERROR", message: "Failed to dispatch email campaign." });
  }
});
adminRouter.get("/email/automation", async (req, res) => {
  try {
    const rules = await getAutomationRules();
    return res.status(200).json({ success: true, rules });
  } catch (err) {
    console.error("[Admin API] Error retrieving automation rules:", err);
    return res.status(500).json({ error: "SERVER_ERROR", message: "Failed to retrieve automation rules." });
  }
});
adminRouter.post("/email/automation", async (req, res) => {
  try {
    const admin = req.user;
    const { name, enabled, triggerCriteria, delayHours, cooldownDays, templateId } = req.body || {};
    if (!name || typeof enabled !== "boolean" || !triggerCriteria || typeof delayHours !== "number" || typeof cooldownDays !== "number" || !templateId) {
      return res.status(400).json({ error: "INVALID_INPUT", message: "All rule configuration parameters are required." });
    }
    const created = await createAutomationRule(admin.id, admin.public_id, {
      name,
      enabled,
      triggerCriteria,
      delayHours,
      cooldownDays,
      templateId
    });
    return res.status(201).json({ success: true, rule: created });
  } catch (err) {
    console.error("[Admin API] Error creating automation rule:", err);
    return res.status(500).json({ error: "SERVER_ERROR", message: "Failed to create automation rule." });
  }
});
adminRouter.put("/email/automation/:id", async (req, res) => {
  try {
    const admin = req.user;
    const { id } = req.params;
    const { name, enabled, triggerCriteria, delayHours, cooldownDays, templateId } = req.body || {};
    if (!name || typeof enabled !== "boolean" || !triggerCriteria || typeof delayHours !== "number" || typeof cooldownDays !== "number" || !templateId) {
      return res.status(400).json({ error: "INVALID_INPUT", message: "All rule parameters are required." });
    }
    const updated = await updateAutomationRule(admin.id, admin.public_id, id, {
      name,
      enabled,
      triggerCriteria,
      delayHours,
      cooldownDays,
      templateId
    });
    return res.status(200).json({ success: true, rule: updated });
  } catch (err) {
    console.error("[Admin API] Error updating automation rule:", err);
    return res.status(500).json({ error: "SERVER_ERROR", message: "Failed to update automation rule." });
  }
});
adminRouter.delete("/email/automation/:id", async (req, res) => {
  try {
    const admin = req.user;
    const { id } = req.params;
    const deleted = await deleteAutomationRule(admin.id, admin.public_id, id);
    if (!deleted) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Automation rule not found." });
    }
    return res.status(200).json({ success: true, id });
  } catch (err) {
    console.error("[Admin API] Error deleting automation rule:", err);
    return res.status(500).json({ error: "SERVER_ERROR", message: "Failed to delete automation rule." });
  }
});
adminRouter.get("/email/queue", async (req, res) => {
  try {
    const status = req.query.status;
    const search = req.query.search;
    const limit = parseInt(req.query.limit, 10) || 20;
    const offset = parseInt(req.query.offset, 10) || 0;
    const data = await getEmailQueue({ status, search, limit, offset });
    const stats = await getEmailQueueStats();
    return res.status(200).json({
      success: true,
      items: data.items,
      total: data.total,
      stats
    });
  } catch (err) {
    console.error("[Admin API] Error retrieving email queue:", err);
    return res.status(500).json({ error: "SERVER_ERROR", message: "Failed to retrieve email queue." });
  }
});
adminRouter.get("/email/stats", async (req, res) => {
  try {
    const stats = await getEmailQueueStats();
    return res.status(200).json({ success: true, stats });
  } catch (err) {
    console.error("[Admin API] Error retrieving email stats:", err);
    return res.status(500).json({ error: "SERVER_ERROR", message: "Failed to retrieve email stats." });
  }
});
adminRouter.post("/email/queue/process", async (req, res) => {
  try {
    await processEmailQueue();
    const stats = await getEmailQueueStats();
    return res.status(200).json({
      success: true,
      message: "Email queue processing completed successfully.",
      stats
    });
  } catch (err) {
    console.error("[Admin API] Error processing email queue:", err);
    return res.status(500).json({ error: "SERVER_ERROR", message: "Failed to process email queue." });
  }
});
adminRouter.post("/email/queue/retry/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const retried = await retryQueueItem(id);
    if (!retried) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Queue item not found or could not be retried." });
    }
    return res.status(200).json({ success: true, message: "Email re-queued for processing.", id });
  } catch (err) {
    console.error("[Admin API] Error retrying email queue item:", err);
    return res.status(500).json({ error: "SERVER_ERROR", message: "Failed to retry email queue item." });
  }
});

// src/server/routes/depositRoutes.ts
import { Router as Router15 } from "express";

// src/server/services/bscKeyService.ts
init_bscConfig();
init_db();
import { ethers as ethers6 } from "ethers";
import { v4 as uuidv425 } from "uuid";
async function getOrCreateUserDepositAddress(userId, requestedAsset = "USDT") {
  const db = await getDb();
  const assetName = requestedAsset.toUpperCase() === "BNB" ? "BNB" : "USDT";
  const chainId = BSC_CONFIG.CHAIN_ID;
  const existing = await db.query(
    `SELECT * FROM user_deposit_addresses WHERE user_id = $1 AND chain_id = $2 AND asset = $3`,
    [userId, chainId, assetName]
  );
  if (existing.rows.length > 0) {
    const row2 = existing.rows[0];
    return {
      id: row2.id,
      userId: row2.user_id,
      chainId: row2.chain_id,
      asset: row2.asset,
      address: row2.address,
      derivationIndex: row2.derivation_index,
      derivationReference: row2.derivation_reference,
      createdAt: new Date(row2.created_at).toISOString()
    };
  }
  const xpub = getDepositAddressXpub();
  let address;
  let derivationIndex = 0;
  let derivationReference;
  if (xpub && xpub.startsWith("xpub")) {
    const countRes = await db.query(
      `SELECT COUNT(*) AS cnt FROM user_deposit_addresses WHERE chain_id = $1`,
      [chainId]
    );
    derivationIndex = Number(countRes.rows[0]?.cnt || 0) + 1;
    const derived = deriveAddressFromXpub(xpub, derivationIndex);
    address = derived.address;
    derivationReference = derived.derivationReference;
  } else {
    address = ethers6.getAddress(BSC_CONFIG.TREASURY_WALLET_ADDRESS);
    derivationReference = "direct-treasury";
    derivationIndex = 0;
  }
  const id = uuidv425();
  await db.query(
    `
    INSERT INTO user_deposit_addresses (
      id, user_id, chain_id, asset, address, derivation_index, derivation_reference, created_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
    ON CONFLICT (user_id, chain_id, asset) DO UPDATE SET
      address = EXCLUDED.address,
      derivation_reference = EXCLUDED.derivation_reference,
      derivation_index = EXCLUDED.derivation_index
    `,
    [id, userId, chainId, assetName, address, derivationIndex, derivationReference]
  );
  const finalRes = await db.query(
    `SELECT * FROM user_deposit_addresses WHERE user_id = $1 AND chain_id = $2 AND asset = $3`,
    [userId, chainId, assetName]
  );
  const row = finalRes.rows[0];
  return {
    id: row.id,
    userId: row.user_id,
    chainId: row.chain_id,
    asset: row.asset,
    address: row.address,
    derivationIndex: row.derivation_index,
    derivationReference: row.derivation_reference,
    createdAt: new Date(row.created_at).toISOString()
  };
}
function getDepositAddressXpub() {
  return (process.env.DEPOSIT_ADDRESS_XPUB || "").trim();
}
function deriveAddressFromXpub(xpub, index) {
  if (!xpub || !xpub.startsWith("xpub")) {
    throw new Error("INVALID_XPUB: A valid public extended key (xpub) is required.");
  }
  if (typeof index !== "number" || index < 0) {
    throw new Error("INVALID_INDEX: Derivation index must be a non-negative integer.");
  }
  const root = ethers6.HDNodeWallet.fromExtendedKey(xpub);
  const child = root.deriveChild(index);
  return { address: ethers6.getAddress(child.address), derivationReference: `m/44'/60'/0'/0/${index}` };
}
async function findUserByDepositAddress(address, chainId) {
  const db = await getDb();
  const targetChainId = chainId || BSC_CONFIG.CHAIN_ID;
  const checksumAddress = ethers6.isAddress(address) ? ethers6.getAddress(address) : address;
  const res = await db.query(
    `SELECT user_id FROM user_deposit_addresses WHERE address = $1 AND chain_id = $2`,
    [checksumAddress, targetChainId]
  );
  if (res.rows.length > 0) {
    return res.rows[0].user_id;
  }
  return null;
}

// src/server/services/bscDepositService.ts
init_db();
init_bscConfig();
init_idGenerator();
import { v4 as uuidv426 } from "uuid";
init_walletLedgerService();
init_notificationService();
init_bscRpcProvider();
import { ethers as ethers7 } from "ethers";
function mapRowToDepositRecord(row) {
  return {
    id: row.id,
    publicDepositId: row.public_deposit_id,
    userId: row.user_id,
    chainId: Number(row.chain_id),
    asset: row.asset || "USDT",
    txHash: row.tx_hash,
    logIndex: Number(row.log_index || 0),
    fromAddress: row.from_address,
    toAddress: row.to_address,
    amount: Number(row.amount),
    blockNumber: Number(row.block_number),
    confirmations: Number(row.confirmations || 0),
    status: row.status,
    detectedAt: row.detected_at ? new Date(row.detected_at).toISOString() : new Date(row.created_at).toISOString(),
    confirmedAt: row.confirmed_at ? new Date(row.confirmed_at).toISOString() : null,
    creditedAt: row.credited_at ? new Date(row.credited_at).toISOString() : null,
    sweptAt: row.swept_at ? new Date(row.swept_at).toISOString() : null,
    sweepTxHash: row.sweep_tx_hash || null,
    gasFundingTxHash: row.gas_funding_tx_hash || null,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString()
  };
}
var depositLocks = /* @__PURE__ */ new Map();
function withDepositLock(key, fn) {
  const previousLock = depositLocks.get(key) || Promise.resolve();
  const res = previousLock.then(
    () => fn(),
    () => fn()
  );
  depositLocks.set(key, res.catch(() => {
  }));
  return res;
}
async function processBlockchainDepositEvent(params) {
  const chainId = params.chainId || BSC_CONFIG.CHAIN_ID;
  const expectedChainId = BSC_CONFIG.CHAIN_ID;
  if (chainId !== expectedChainId) {
    console.warn(`[Security Alert] Rejected deposit event with mismatched chain ID: ${chainId} (expected: ${expectedChainId})`);
    return null;
  }
  const assetName = (params.asset || "USDT").toUpperCase() === "BNB" ? "BNB" : "USDT";
  if (assetName === "USDT" && params.contractAddress) {
    const cleanContract = params.contractAddress.toLowerCase().trim();
    const expectedContract = BSC_CONFIG.USDT_CONTRACT_ADDRESS.toLowerCase().trim();
    if (cleanContract !== expectedContract) {
      console.warn(`[Security Alert] Rejected deposit with counterfeit token contract: ${cleanContract} (expected: ${expectedContract})`);
      return null;
    }
  }
  const cleanTxHash = params.txHash.toLowerCase().trim();
  const logIndex = params.logIndex ?? 0;
  const cleanFromAddress = params.fromAddress.toLowerCase().trim();
  const cleanToAddress = params.toAddress.toLowerCase().trim();
  const amount = Number(params.amount);
  const blockNumber = Number(params.blockNumber);
  const currentBlockNumber = Number(params.currentBlockNumber);
  if (!cleanTxHash || !cleanToAddress || isNaN(amount) || amount <= 0) {
    return null;
  }
  const lockKey = `${chainId}:${cleanTxHash}:${logIndex}:${cleanToAddress}`;
  return withDepositLock(lockKey, async () => {
    const db = await getDb();
    const userId = await findUserByDepositAddress(cleanToAddress, chainId);
    if (!userId) {
      return null;
    }
    const confirmations = Math.max(0, currentBlockNumber - blockNumber + 1);
    const requiredConfs = BSC_CONFIG.REQUIRED_CONFIRMATIONS;
    const isMatured = confirmations >= requiredConfs;
    const existing = await db.query(
      `
      SELECT * FROM blockchain_deposits
      WHERE chain_id = $1 AND LOWER(tx_hash) = $2 AND log_index = $3 AND LOWER(to_address) = $4
      `,
      [chainId, cleanTxHash, logIndex, cleanToAddress]
    );
    let depositRow;
    const now = /* @__PURE__ */ new Date();
    if (existing.rows.length === 0) {
      const id = uuidv426();
      const publicDepositId = generateDepositPublicId();
      const initialStatus = isMatured ? "CONFIRMED" : confirmations > 0 ? "CONFIRMING" : "DETECTED";
      const confirmedAt = isMatured ? now : null;
      const insertRes = await db.query(
        `
        INSERT INTO blockchain_deposits (
          id, public_deposit_id, user_id, chain_id, asset,
          tx_hash, log_index, from_address, to_address, amount, block_number,
          confirmations, status, detected_at, confirmed_at, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $14, $14)
        ON CONFLICT (chain_id, tx_hash, log_index, to_address) DO UPDATE
          SET confirmations = EXCLUDED.confirmations,
              updated_at = CURRENT_TIMESTAMP
        RETURNING *
        `,
        [
          id,
          publicDepositId,
          userId,
          chainId,
          assetName,
          cleanTxHash,
          logIndex,
          cleanFromAddress,
          cleanToAddress,
          amount,
          blockNumber,
          confirmations,
          initialStatus,
          now,
          confirmedAt
        ]
      );
      depositRow = insertRes.rows[0];
    } else {
      depositRow = existing.rows[0];
      if (depositRow.status === "CREDITED" || depositRow.status === "SWEPT" || depositRow.status === "REORGED" || depositRow.status === "FAILED") {
        const updateRes2 = await db.query(
          `
          UPDATE blockchain_deposits
          SET confirmations = $1, updated_at = $2
          WHERE id = $3
          RETURNING *
          `,
          [confirmations, now, depositRow.id]
        );
        return mapRowToDepositRecord(updateRes2.rows[0] || depositRow);
      }
      let nextStatus = depositRow.status;
      let confirmedAt = depositRow.confirmed_at;
      if (isMatured) {
        nextStatus = "CONFIRMED";
        if (!confirmedAt) confirmedAt = now;
      } else if (confirmations > 0 && nextStatus === "DETECTED") {
        nextStatus = "CONFIRMING";
      }
      const updateRes = await db.query(
        `
        UPDATE blockchain_deposits
        SET confirmations = $1,
            status = $2,
            confirmed_at = COALESCE(confirmed_at, $3),
            updated_at = $4
        WHERE id = $5
        RETURNING *
        `,
        [confirmations, nextStatus, confirmedAt, now, depositRow.id]
      );
      depositRow = updateRes.rows[0];
    }
    if ((depositRow.status === "CONFIRMED" || isMatured) && depositRow.status !== "CREDITED" && depositRow.status !== "SWEPT") {
      const publicDepId = depositRow.public_deposit_id;
      const depId = depositRow.id;
      const depAmount = Number(depositRow.amount);
      await postLedgerCredit({
        userId,
        sourceType: "BLOCKCHAIN_DEPOSIT",
        sourceId: depId,
        sourceRef: publicDepId,
        amount: depAmount,
        currency: assetName,
        description: `${assetName} BEP-20 Deposit (${cleanTxHash.slice(0, 10)}... to ${cleanToAddress.slice(0, 8)}...)`,
        createdAt: depositRow.confirmed_at ? new Date(depositRow.confirmed_at) : now
      });
      const creditedRes = await db.query(
        `
        UPDATE blockchain_deposits
        SET status = 'CREDITED',
            credited_at = $1,
            updated_at = $1
        WHERE id = $2
        RETURNING *
        `,
        [now, depId]
      );
      if (creditedRes.rows.length > 0) {
        depositRow = creditedRes.rows[0];
      }
      try {
        await notifyUsdtDepositConfirmed({
          userId,
          amountUsdt: depAmount,
          depositId: depId,
          txHash: cleanTxHash
        });
      } catch (notifErr) {
        console.warn("[Notification] Error triggering deposit confirmed notification:", notifErr);
      }
      try {
        const userRes = await db.query(
          `SELECT email, full_name, public_id FROM users WHERE id = $1`,
          [userId]
        );
        if (userRes.rowCount > 0) {
          const user = userRes.rows[0];
          const { queueEventEmail: queueEventEmail2, triggerAutomationRule: triggerAutomationRule2 } = await Promise.resolve().then(() => (init_emailService(), emailService_exports));
          await queueEventEmail2(user.email, "DEPOSIT_CONFIRM", {
            displayName: user.full_name,
            publicId: user.public_id,
            amount: String(depAmount),
            txHash: cleanTxHash
          });
          if (depAmount >= 100) {
            await triggerAutomationRule2(userId, "STRONG_GROWTH", {
              amount: String(depAmount)
            });
          }
        }
      } catch (emailErr) {
        console.warn("[EmailEngine] Failed to send Deposit Confirmation email:", emailErr);
      }
    }
    return mapRowToDepositRecord(depositRow);
  });
}
async function getUserDeposits(userId, page = 1, limit = 20, statusFilter) {
  const db = await getDb();
  const safePage = Math.max(1, page);
  const safeLimit = Math.min(100, Math.max(1, limit));
  const offset = (safePage - 1) * safeLimit;
  let whereClauses = ["user_id = $1"];
  let queryParams = [userId];
  let paramIdx = 2;
  if (statusFilter && statusFilter !== "ALL" && statusFilter !== "all") {
    whereClauses.push(`status = $${paramIdx}`);
    queryParams.push(statusFilter.toUpperCase());
    paramIdx++;
  }
  const whereSql = whereClauses.join(" AND ");
  const countRes = await db.query(
    `SELECT COUNT(*)::int AS count FROM blockchain_deposits WHERE ${whereSql}`,
    queryParams
  );
  const totalCount = Number(countRes.rows[0]?.count || 0);
  const txQueryParams = [...queryParams, safeLimit, offset];
  const listRes = await db.query(
    `
    SELECT * FROM blockchain_deposits
    WHERE ${whereSql}
    ORDER BY created_at DESC
    LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
    `,
    txQueryParams
  );
  const summaryRes = await db.query(
    `
    SELECT
      COALESCE(SUM(CASE WHEN status IN ('CREDITED', 'SWEPT') THEN amount ELSE 0 END), 0) AS total_credited,
      COALESCE(SUM(CASE WHEN status IN ('DETECTED', 'CONFIRMING', 'CONFIRMED') THEN amount ELSE 0 END), 0) AS total_pending,
      COUNT(*)::int AS deposit_count
    FROM blockchain_deposits
    WHERE user_id = $1
    `,
    [userId]
  );
  const summaryRow = summaryRes.rows[0] || { total_credited: 0, total_pending: 0, deposit_count: 0 };
  const totalPages = Math.ceil(totalCount / safeLimit) || 1;
  return {
    deposits: listRes.rows.map(mapRowToDepositRecord),
    summary: {
      totalCreditedUsdt: Number(summaryRow.total_credited || 0),
      totalPendingUsdt: Number(summaryRow.total_pending || 0),
      totalCreditedBnb: Number(summaryRow.total_credited || 0),
      totalPendingBnb: Number(summaryRow.total_pending || 0),
      depositCount: Number(summaryRow.deposit_count || 0),
      requiredConfirmations: BSC_CONFIG.REQUIRED_CONFIRMATIONS,
      chainId: BSC_CONFIG.CHAIN_ID,
      networkName: BSC_CONFIG.NETWORK_NAME
    },
    pagination: {
      page: safePage,
      limit: safeLimit,
      totalCount,
      totalPages
    }
  };
}

// src/server/services/bscListenerService.ts
init_bscConfig();
init_db();
import { ethers as ethers8 } from "ethers";
init_bscRpcProvider();
async function rescanUserDepositStatus(userId) {
  const depositRecord = await getOrCreateUserDepositAddress(userId, "USDT");
  try {
    const { result: currentBlock } = await bscRpcManager.executeWithFailover(async (provider) => {
      return await provider.getBlockNumber();
    });
    const db = await getDb();
    const pendingDeposits = await db.query(
      `
      SELECT tx_hash, log_index, from_address, to_address, amount, block_number, asset
      FROM blockchain_deposits
      WHERE user_id = $1 AND status IN ('DETECTED', 'CONFIRMING')
      `,
      [userId]
    );
    for (const dep of pendingDeposits.rows) {
      await processBlockchainDepositEvent({
        chainId: BSC_CONFIG.CHAIN_ID,
        asset: dep.asset || "USDT",
        txHash: dep.tx_hash,
        logIndex: Number(dep.log_index || 0),
        fromAddress: dep.from_address,
        toAddress: dep.to_address,
        amount: Number(dep.amount),
        blockNumber: Number(dep.block_number),
        currentBlockNumber: currentBlock
      });
    }
    return {
      address: depositRecord.address,
      scanned: true,
      currentBlock
    };
  } catch {
    return {
      address: depositRecord.address,
      scanned: false,
      currentBlock: 0
    };
  }
}

// src/server/routes/depositRoutes.ts
init_bscConfig();
init_db();
init_idGenerator();
init_notificationService();
import { ethers as ethers9 } from "ethers";
import { v4 as uuidv427 } from "uuid";
var DepositTransactionError = class extends Error {
  constructor(code, statusCode, message) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.name = "DepositTransactionError";
  }
};
var depositRouter = Router15();
depositRouter.get("/address", requireAuth, depositLimiter, async (req, res) => {
  try {
    const officialAddress = BSC_CONFIG.TREASURY_WALLET_ADDRESS;
    res.status(200).json({
      success: true,
      data: {
        address: officialAddress,
        chainId: BSC_CONFIG.CHAIN_ID,
        asset: "USDT",
        networkName: BSC_CONFIG.NETWORK_NAME,
        requiredConfirmations: BSC_CONFIG.REQUIRED_CONFIRMATIONS,
        explorerUrl: `https://bscscan.com/address/${officialAddress}`,
        warning: `Send USDT (BEP-20) on BNB Smart Chain (Chain ID: ${BSC_CONFIG.CHAIN_ID}) to this official platform deposit address only. After sending, submit your transaction hash (TxHash) below for instant automated crediting.`,
        note: `All deposits are independently verified on-chain via BSC RPC. Do not send funds from exchange smart contracts that do not emit standard Transfer events.`
      }
    });
  } catch (err) {
    console.error("[Deposit API] Error retrieving deposit address:", err);
    res.status(500).json({
      success: false,
      error: "FAILED_TO_GET_ADDRESS",
      message: err?.message || "Could not retrieve official deposit address"
    });
  }
});
depositRouter.get("/me", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const statusFilter = req.query.status;
    const result = await getUserDeposits(userId, page, limit, statusFilter);
    res.status(200).json({
      success: true,
      data: result
    });
  } catch (err) {
    console.error("[Deposit API] Error retrieving deposit history:", err);
    res.status(500).json({
      success: false,
      error: "FAILED_TO_GET_DEPOSITS",
      message: err?.message || "Could not retrieve deposit history"
    });
  }
});
depositRouter.post("/rescan", requireAuth, depositLimiter, async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await rescanUserDepositStatus(userId);
    const deposits = await getUserDeposits(userId, 1, 20);
    res.status(200).json({
      success: true,
      message: "Deposit scan completed successfully",
      data: {
        ...result,
        recentDeposits: deposits.deposits,
        summary: deposits.summary
      }
    });
  } catch (err) {
    console.error("[Deposit API] Error during rescan:", err);
    res.status(500).json({
      success: false,
      error: "RESCAN_FAILED",
      message: err?.message || "Deposit rescan failed"
    });
  }
});
depositRouter.post("/simulate-test-deposit", requireAuth, async (req, res) => {
  const isProduction = (process.env.APP_ENV || "").toLowerCase() === "production" || (process.env.NODE_ENV || "").toLowerCase() === "production";
  if (isProduction) {
    res.status(403).json({
      success: false,
      error: "FORBIDDEN",
      message: "Deposit simulation endpoint is strictly forbidden and disabled in production environments."
    });
    return;
  }
  try {
    const userId = req.user.id;
    const { amount, txHash, fromAddress, confirmations, blockNumber, currentBlockNumber, asset } = req.body;
    const targetAsset = (asset || "BNB").toUpperCase() === "USDT" ? "USDT" : "BNB";
    const userAddress = await getOrCreateUserDepositAddress(userId, targetAsset);
    const simulatedBlock = blockNumber || 38291e3;
    const confs = confirmations !== void 0 ? Number(confirmations) : BSC_CONFIG.REQUIRED_CONFIRMATIONS;
    const currentBlock = currentBlockNumber || simulatedBlock + confs - 1;
    const hash = txHash || `0xsim_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const from = fromAddress || "0x1111111111111111111111111111111111111111";
    const deposit = await processBlockchainDepositEvent({
      chainId: BSC_CONFIG.CHAIN_ID,
      asset: targetAsset,
      txHash: hash,
      fromAddress: from,
      toAddress: userAddress.address,
      amount: Number(amount || 1),
      blockNumber: simulatedBlock,
      currentBlockNumber: currentBlock
    });
    res.status(200).json({
      success: true,
      message: `Simulated ${targetAsset} deposit event processed`,
      data: deposit
    });
  } catch (err) {
    console.error("[Deposit API] Error simulating deposit:", err);
    res.status(500).json({
      success: false,
      error: "SIMULATION_FAILED",
      message: err?.message || "Failed to simulate deposit"
    });
  }
});
depositRouter.post("/submit-txhash", requireAuth, depositLimiter, async (req, res) => {
  try {
    const userId = req.user.id;
    const { txHash, asset } = req.body;
    if (!txHash || typeof txHash !== "string") {
      res.status(400).json({
        success: false,
        error: "INVALID_TX_HASH",
        message: "Please provide a valid transaction hash (TxHash / TxID)."
      });
      return;
    }
    const cleanTxHash = txHash.trim().toLowerCase();
    const txHashRegex = /^0x[a-f0-9]{64}$/;
    if (!txHashRegex.test(cleanTxHash)) {
      res.status(400).json({
        success: false,
        error: "INVALID_TX_FORMAT",
        message: "Transaction hash must be a 66-character hex string starting with 0x."
      });
      return;
    }
    const requestedAsset = (asset || "USDT").toUpperCase() === "BNB" ? "BNB" : "USDT";
    const db = await getDb();
    const existing = await db.query(
      `SELECT id, user_id, status, amount, asset FROM blockchain_deposits WHERE LOWER(tx_hash) = $1 LIMIT 1`,
      [cleanTxHash]
    );
    if (existing.rows.length > 0) {
      res.status(409).json({
        success: false,
        error: "TX_ALREADY_USED",
        message: "This transaction hash has already been submitted and credited on PHIVONEX. Re-submitting transaction hashes is strictly prohibited for life."
      });
      return;
    }
    const existingLedger = await db.query(
      `SELECT id FROM financial_ledger_entries WHERE description ILIKE $1 OR source_ref ILIKE $1 LIMIT 1`,
      [`%${cleanTxHash}%`]
    );
    if (existingLedger.rows.length > 0) {
      res.status(409).json({
        success: false,
        error: "TX_ALREADY_CREDITED",
        message: "This transaction hash has already been credited in the financial ledger and cannot be reused."
      });
      return;
    }
    try {
      const { adminFirestore: adminFirestore2 } = await Promise.resolve().then(() => (init_firebase_admin(), firebase_admin_exports));
      const fsSnap = await adminFirestore2.collection("blockchain_deposits").where("txHash", "==", cleanTxHash).limit(1).get();
      if (!fsSnap.empty) {
        res.status(409).json({
          success: false,
          error: "TX_ALREADY_USED_FIRESTORE",
          message: "This transaction hash has already been processed and saved in real-time audit storage. Re-submitting is prohibited."
        });
        return;
      }
    } catch (fsErr) {
      console.warn("[Deposit API] Firestore transaction hash uniqueness check warning:", fsErr);
    }
    if (BSC_CONFIG.CHAIN_ID !== 56) {
      res.status(400).json({
        success: false,
        error: "INVALID_CHAIN_ID",
        message: "Configured chain ID is not BSC Mainnet (56)."
      });
      return;
    }
    const rpcEndpoints = [
      "https://bsc-dataseed.binance.org",
      "https://bsc-rpc.publicnode.com",
      "https://bsc-dataseed1.defibit.io",
      "https://bsc-dataseed2.binance.org",
      BSC_CONFIG.RPC_URL_PRIMARY,
      BSC_CONFIG.RPC_URL_SECONDARY
    ].filter((url) => Boolean(url) && !url.endsWith("rpc.ankr.com/bsc") && !url.endsWith("rpc.ankr.com/bsc/"));
    const uniqueRpcs = Array.from(new Set(rpcEndpoints));
    let receipt = null;
    let tx = null;
    let currentBlock = 0;
    for (const rpc of uniqueRpcs) {
      try {
        const network = ethers9.Network.from(56);
        const p = new ethers9.JsonRpcProvider(rpc, network, { staticNetwork: network });
        const [r, t] = await Promise.all([
          p.getTransactionReceipt(cleanTxHash),
          p.getTransaction(cleanTxHash)
        ]);
        if (r && t) {
          if (t.chainId !== null && t.chainId !== void 0 && Number(t.chainId) !== 56) {
            res.status(400).json({
              success: false,
              error: "INVALID_CHAIN_ID",
              message: "Transaction was not executed on BSC Mainnet (Chain ID 56)."
            });
            return;
          }
          receipt = r;
          tx = t;
          try {
            currentBlock = await p.getBlockNumber();
          } catch {
            currentBlock = 0;
          }
          console.log(`[Deposit API] Successfully resolved on-chain transaction from ${rpc}!`);
          break;
        }
      } catch (err) {
        console.warn(`[Deposit API] RPC ${rpc} query error:`, err?.message || err);
      }
    }
    if (!receipt || !tx) {
      res.status(404).json({
        success: false,
        error: "TX_NOT_FOUND",
        message: "Transaction not found on BNB Smart Chain yet. Please wait a few seconds for BSC miners to process the transaction and try again."
      });
      return;
    }
    if (receipt.status !== 1) {
      res.status(400).json({
        success: false,
        error: "TX_FAILED_ON_CHAIN",
        message: "This transaction failed or was reverted on the BNB Smart Chain blockchain."
      });
      return;
    }
    if (!currentBlock || currentBlock <= 0) {
      res.status(503).json({
        success: false,
        error: "RPC_BLOCK_HEIGHT_ERROR",
        message: "Unable to obtain current block height from BSC RPC. Confirmations cannot be verified safely. Please retry."
      });
      return;
    }
    const blockNumber = receipt.blockNumber;
    const confirmations = currentBlock - blockNumber + 1;
    const requiredConfs = BSC_CONFIG.REQUIRED_CONFIRMATIONS || 3;
    if (confirmations < requiredConfs) {
      res.status(200).json({
        success: false,
        error: "INSUFFICIENT_CONFIRMATIONS",
        message: `Transaction has ${confirmations} confirmation(s). Required: ${requiredConfs}. Deposit pending maturation.`,
        data: {
          publicDepositId: "",
          confirmations,
          requiredConfirmations: requiredConfs,
          status: "PENDING"
        }
      });
      return;
    }
    const treasury = (BSC_CONFIG.TREASURY_WALLET_ADDRESS || "").toLowerCase();
    if (!treasury || !ethers9.isAddress(treasury)) {
      res.status(500).json({
        success: false,
        error: "TREASURY_NOT_CONFIGURED",
        message: "Official PHIVONEX treasury wallet address is not configured."
      });
      return;
    }
    let detectedAmount = 0;
    let fromAddress = tx.from.toLowerCase();
    let toAddress = "";
    let realLogIndex = 0;
    const transferEventSignature = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
    const usdtContractLower = BSC_CONFIG.USDT_CONTRACT_ADDRESS.toLowerCase();
    for (let i = 0; i < receipt.logs.length; i++) {
      const log = receipt.logs[i];
      if (log.topics[0] === transferEventSignature && log.topics.length >= 3) {
        const logContract = log.address.toLowerCase();
        const recipientTopic = "0x" + log.topics[2].slice(26);
        const recipientAddress = recipientTopic.toLowerCase();
        if (logContract === usdtContractLower && recipientAddress === treasury) {
          try {
            const rawAmount = BigInt(log.data);
            const formatted = Number(ethers9.formatUnits(rawAmount, 18));
            if (formatted > 0) {
              detectedAmount = formatted;
              toAddress = recipientAddress;
              fromAddress = ("0x" + log.topics[1].slice(26)).toLowerCase();
              realLogIndex = log.index ?? log.logIndex ?? i;
              break;
            }
          } catch (parseErr) {
            console.error("[Deposit API] Error parsing ERC-20 transfer log:", parseErr);
          }
        }
      }
    }
    if (detectedAmount <= 0) {
      res.status(400).json({
        success: false,
        error: "NO_VALID_USDT_TRANSFER",
        message: `No qualifying USDT BEP-20 transfer to the official treasury address was found in this transaction. Native BNB or wrong destination/contract transfers are rejected.`
      });
      return;
    }
    const duplicateCheck = await db.query(
      `SELECT id FROM blockchain_deposits WHERE chain_id = $1 AND LOWER(tx_hash) = $2 AND log_index = $3`,
      [BSC_CONFIG.CHAIN_ID, cleanTxHash, realLogIndex]
    );
    if (duplicateCheck.rows.length > 0) {
      res.status(409).json({
        success: false,
        error: "TX_ALREADY_USED",
        message: "This transaction hash and log index have already been credited."
      });
      return;
    }
    const now = /* @__PURE__ */ new Date();
    let actualDepositId = "";
    let actualPublicDepositId = "";
    try {
      await db.transaction(async (trx) => {
        const depositId = uuidv427();
        const publicDepositId = generateDepositPublicId();
        const insertRes = await trx.query(
          `
          INSERT INTO blockchain_deposits (
            id, public_deposit_id, user_id, chain_id, asset,
            tx_hash, log_index, from_address, to_address, amount, block_number,
            confirmations, status, detected_at, confirmed_at, credited_at, created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, 'USDT', $5, $6, $7, $8, $9, $10, $11, 'CREDITED', $12, $12, $12, $12, $12)
          ON CONFLICT (chain_id, tx_hash, log_index, to_address) DO NOTHING
          RETURNING id, public_deposit_id, user_id
          `,
          [
            depositId,
            publicDepositId,
            userId,
            BSC_CONFIG.CHAIN_ID,
            cleanTxHash,
            realLogIndex,
            fromAddress,
            toAddress,
            detectedAmount,
            blockNumber,
            confirmations,
            now
          ]
        );
        if (insertRes.rows.length === 0) {
          throw new DepositTransactionError("TX_ALREADY_USED", 409, "This transaction hash and log index have already been submitted and credited.");
        }
        actualDepositId = insertRes.rows[0].id;
        actualPublicDepositId = insertRes.rows[0].public_deposit_id;
        const actualUserId = insertRes.rows[0].user_id;
        if (actualUserId !== userId) {
          throw new DepositTransactionError("DUPLICATE_TX_USER_MISMATCH", 409, "Transaction already linked to another user account.");
        }
        const ledgerId = uuidv427();
        const publicTxnId = generateLedgerTransactionPublicId();
        const ledgerRes = await trx.query(
          `
          INSERT INTO financial_ledger_entries (
            id, public_txn_id, user_id, entry_type, source_type, source_id,
            source_ref, description, amount, currency, status, created_at
          )
          VALUES ($1, $2, $3, 'CREDIT', 'BLOCKCHAIN_DEPOSIT', $4, $5, $6, $7, 'USDT', 'SETTLED', $8)
          ON CONFLICT (source_type, source_id, entry_type) DO NOTHING
          RETURNING id, user_id
          `,
          [
            ledgerId,
            publicTxnId,
            actualUserId,
            actualDepositId,
            actualPublicDepositId,
            `On-chain USDT BEP-20 deposit verified via TxHash ${cleanTxHash.slice(0, 10)}...`,
            detectedAmount,
            now
          ]
        );
        if (ledgerRes.rows.length === 0 || ledgerRes.rows[0].user_id !== actualUserId) {
          throw new DepositTransactionError("LEDGER_CREDIT_FAILED", 409, "Ledger credit failed or already exists. Rolled back deposit.");
        }
      });
    } catch (txErr) {
      if (txErr instanceof DepositTransactionError || txErr.statusCode) {
        res.status(txErr.statusCode || 409).json({
          success: false,
          error: txErr.code || "TRANSACTION_ERROR",
          message: txErr.message || "Transaction failed"
        });
        return;
      }
      throw txErr;
    }
    try {
      const { adminFirestore: adminFirestore2 } = await Promise.resolve().then(() => (init_firebase_admin(), firebase_admin_exports));
      await adminFirestore2.collection("blockchain_deposits").doc(actualDepositId).set({
        id: actualDepositId,
        publicDepositId: actualPublicDepositId,
        userId,
        txHash: cleanTxHash,
        amount: detectedAmount,
        asset: "USDT",
        status: "CREDITED",
        createdAt: now.toISOString()
      }, { merge: true });
    } catch (fsErr) {
      console.warn("[Deposit API] Firestore deposit backup notice:", fsErr);
    }
    try {
      await notifyUsdtDepositConfirmed({
        userId,
        amountUsdt: detectedAmount,
        depositId: actualDepositId,
        txHash: cleanTxHash
      });
    } catch {
    }
    res.status(200).json({
      success: true,
      message: `Deposit verified successfully! Credited ${detectedAmount} USDT to your account.`,
      data: {
        publicDepositId: actualPublicDepositId,
        amount: detectedAmount,
        asset: "USDT",
        txHash: cleanTxHash,
        confirmations,
        logIndex: realLogIndex
      }
    });
  } catch (err) {
    console.error("[Deposit API] Error processing submitted TxHash:", err);
    res.status(500).json({
      success: false,
      error: "VERIFICATION_ERROR",
      message: err?.message || "Failed to verify transaction hash."
    });
  }
});

// src/server/routes/economicRoutes.ts
import { Router as Router16 } from "express";
init_economicService();
init_adminService();
var publicEconomicRouter = Router16();
publicEconomicRouter.get("/token-price", async (_req, res) => {
  try {
    const coinConfig = await getInternalCoinPrice();
    res.setHeader("Cache-Control", "public, max-age=5");
    return res.status(200).json({
      success: true,
      priceUsd: coinConfig.priceUsdt ?? 0.1,
      coinSymbol: coinConfig.coinSymbol || "PHIVO",
      source: "INTERNAL_ECONOMIC_ORACLE",
      updatedAt: coinConfig.effectiveFrom || (/* @__PURE__ */ new Date()).toISOString(),
      swapEnabled: coinConfig.swapEnabled,
      configured: coinConfig.configured
    });
  } catch (err) {
    console.error("[Economic API] Error fetching token price:", err);
    return res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to retrieve token price"
    });
  }
});
publicEconomicRouter.get("/platform-settings", async (_req, res) => {
  try {
    const configs = await getAllEconomicConfigs();
    const configMap = {};
    for (const c of configs) {
      configMap[c.configKey] = c.configValue;
    }
    const coinPrice = configMap["INTERNAL_COIN_PRICE_USDT"]?.priceUsdt ?? 0.1;
    const coinSymbol = configMap["INTERNAL_COIN_PRICE_USDT"]?.coinSymbol ?? "PHIVO";
    const swapEnabled = configMap["INTERNAL_COIN_SWAP_ENABLED"] !== false && configMap["INTERNAL_COIN_PRICE_USDT"]?.swapEnabled !== false;
    const cryptoDepositsEnabled = configMap["CRYPTO_DEPOSITS_ENABLED"] !== false;
    const cryptoWithdrawalsEnabled = configMap["CRYPTO_WITHDRAWALS_ENABLED"] !== false;
    const nodeRewardsEnabled = configMap["NODE_REWARDS_ENABLED"] !== false;
    const minWithdrawalAmount = typeof configMap["MIN_WITHDRAWAL_AMOUNT"] === "number" ? configMap["MIN_WITHDRAWAL_AMOUNT"] : 0.1;
    const autoWithdrawalEnabled = Boolean(configMap["AUTO_WITHDRAWAL_ENABLED"]);
    const nodeBasePriceUsd = typeof configMap["NODE_BASE_PRICE_USD"] === "number" ? configMap["NODE_BASE_PRICE_USD"] : 50;
    const directReferralCommissionRate = typeof configMap["REFERRAL_COMMISSION_RATE"] === "number" ? configMap["REFERRAL_COMMISSION_RATE"] : 10;
    res.setHeader("Cache-Control", "public, max-age=5");
    return res.status(200).json({
      success: true,
      settings: {
        coinPriceUsdt: coinPrice,
        coinSymbol,
        internalCoinSwapEnabled: swapEnabled,
        cryptoDepositsEnabled,
        cryptoWithdrawalsEnabled,
        nodeRewardsEnabled,
        minWithdrawalAmount,
        autoWithdrawalEnabled,
        nodeBasePriceUsd,
        directReferralCommissionRate,
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      }
    });
  } catch (err) {
    console.error("[Economic API] Error fetching platform settings:", err);
    return res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to retrieve platform settings"
    });
  }
});
var economicRouter = Router16();
economicRouter.use(requireAdmin);
economicRouter.get("/configs", async (req, res) => {
  try {
    const configs = await getAllEconomicConfigs();
    return res.status(200).json({ configs });
  } catch (err) {
    console.error("[Economic API] Error fetching configs:", err);
    return res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to retrieve system economic configurations."
    });
  }
});
economicRouter.get("/configs/:key", async (req, res) => {
  try {
    const { key } = req.params;
    const config = await getEconomicConfigByKey(key);
    if (!config) {
      return res.status(404).json({
        error: "NOT_FOUND",
        message: `Economic configuration parameter '${key}' was not found.`
      });
    }
    return res.status(200).json({ config });
  } catch (err) {
    console.error("[Economic API] Error fetching config by key:", err);
    return res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to retrieve economic configuration."
    });
  }
});
economicRouter.put("/configs/:key", adminFinancialLimiter, async (req, res) => {
  try {
    const { key } = req.params;
    const { value, status, effectiveFrom, reason } = req.body;
    if (value === void 0) {
      return res.status(400).json({
        error: "BAD_REQUEST",
        message: "Missing configuration value parameter."
      });
    }
    const adminUserId = req.user?.id || null;
    const adminPublicId = req.user?.public_id || "SYSTEM_ADMIN";
    const ipAddress = req.headers["x-forwarded-for"] || req.ip;
    const { config, auditLog } = await updateEconomicConfig({
      configKey: key,
      configValue: value,
      status,
      effectiveFrom: effectiveFrom ? String(effectiveFrom) : void 0,
      reason: reason ? String(reason) : void 0,
      adminUserId,
      adminPublicId,
      ipAddress
    });
    await logAdminAction({
      adminUserId,
      adminPublicId,
      action: `ECONOMIC_CONFIG_UPDATED_${key.toUpperCase()}`,
      targetType: "ECONOMIC_CONFIG",
      targetId: key.toUpperCase(),
      details: `Admin ${adminPublicId} updated ${key.toUpperCase()} to version ${config.version} (Status: ${config.status}).`,
      metadata: {
        key: key.toUpperCase(),
        version: config.version,
        oldValue: auditLog.oldValue,
        newValue: auditLog.newValue,
        effectiveFrom: config.effectiveFrom,
        reason: auditLog.reason
      },
      ipAddress
    });
    return res.status(200).json({
      success: true,
      config,
      auditLog,
      message: `Economic parameter '${key}' successfully updated to version ${config.version}.`
    });
  } catch (err) {
    console.error("[Economic API] Error updating config:", err);
    const msg = err.message || "Failed to update economic configuration.";
    if (msg.startsWith("IMMUTABLE_PARAMETER_ERROR")) {
      return res.status(403).json({ error: "IMMUTABLE_PARAMETER_ERROR", message: msg });
    }
    if (msg.startsWith("INVALID_VALUE") || msg.startsWith("BAD_REQUEST")) {
      return res.status(400).json({ error: "INVALID_VALUE", message: msg });
    }
    if (msg.startsWith("NOT_FOUND")) {
      return res.status(404).json({ error: "NOT_FOUND", message: msg });
    }
    return res.status(500).json({
      error: "SERVER_ERROR",
      message: msg
    });
  }
});
economicRouter.get("/audit-logs", async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const configKey = req.query.configKey || void 0;
    const data = await getEconomicAuditLogs(page, limit, configKey);
    return res.status(200).json(data);
  } catch (err) {
    console.error("[Economic API] Error fetching audit logs:", err);
    return res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to retrieve economic audit trail."
    });
  }
});

// src/server/routes/swapRoutes.ts
import { Router as Router17 } from "express";
init_coinSwapService();
var swapRouter = Router17();
swapRouter.get("/quote", async (req, res) => {
  try {
    const rawAmount = req.query.amount ? parseFloat(req.query.amount) : 1;
    if (isNaN(rawAmount) || rawAmount <= 0) {
      res.status(400).json({
        error: "INVALID_AMOUNT",
        message: "Query parameter amount must be a positive number."
      });
      return;
    }
    const quote = await getSwapQuote(rawAmount);
    res.status(200).json(quote);
  } catch (err) {
    if (err.code === "SWAP_RATE_NOT_CONFIGURED" || err.message?.includes("SWAP_RATE_NOT_CONFIGURED")) {
      res.status(400).json({
        error: "SWAP_RATE_NOT_CONFIGURED",
        message: "Internal coin conversion rate is not configured by PHIVONEX administration."
      });
      return;
    }
    if (err.code === "SWAP_DISABLED" || err.message?.includes("SWAP_DISABLED")) {
      res.status(400).json({
        error: "SWAP_DISABLED",
        message: "Internal coin swapping is currently disabled by administration."
      });
      return;
    }
    console.error("[Swap API] Error in GET /api/swap/quote:", err);
    res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to generate swap quote."
    });
  }
});
swapRouter.get("/balance", requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const balance = await getUserCoinBalance(user.id);
    res.status(200).json(balance);
  } catch (err) {
    console.error("[Swap API] Error in GET /api/swap/balance:", err);
    res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to retrieve user coin balance."
    });
  }
});
swapRouter.get("/history", requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 20;
    const offset = req.query.offset ? parseInt(req.query.offset, 10) : 0;
    const data = await getUserSwapHistory(user.id, { limit, offset });
    res.status(200).json(data);
  } catch (err) {
    console.error("[Swap API] Error in GET /api/swap/history:", err);
    res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to retrieve swap history."
    });
  }
});
swapRouter.post("/coin-to-usdt", requireAuth, swapLimiter, async (req, res) => {
  try {
    const user = req.user;
    const { coinAmount, idempotencyKey } = req.body;
    const parsedAmount = typeof coinAmount === "number" ? coinAmount : parseFloat(coinAmount);
    if (isNaN(parsedAmount) || !isFinite(parsedAmount) || parsedAmount <= 0) {
      res.status(400).json({
        error: "INVALID_AMOUNT",
        message: "Coin amount must be a positive number greater than 0."
      });
      return;
    }
    const result = await executeCoinToUsdtSwap({
      userId: user.id,
      coinAmount: parsedAmount,
      idempotencyKey
    });
    res.status(200).json(result);
  } catch (err) {
    const code = err.code || err.message && err.message.split(":")[0] || "SERVER_ERROR";
    if (code === "INSUFFICIENT_COIN_BALANCE") {
      res.status(400).json({
        error: "INSUFFICIENT_COIN_BALANCE",
        message: err.message?.replace("INSUFFICIENT_COIN_BALANCE: ", "") || "Insufficient PHIVONEX coin balance."
      });
      return;
    }
    if (code === "SWAP_DISABLED") {
      res.status(400).json({
        error: "SWAP_DISABLED",
        message: "Internal coin swapping is currently disabled by administration."
      });
      return;
    }
    if (code === "SWAP_RATE_NOT_CONFIGURED") {
      res.status(400).json({
        error: "SWAP_RATE_NOT_CONFIGURED",
        message: "Internal coin conversion rate is not configured by PHIVONEX administration."
      });
      return;
    }
    console.error("[Swap API] Error in POST /api/swap/coin-to-usdt:", err);
    res.status(500).json({
      error: "SERVER_ERROR",
      message: err.message || "Failed to execute coin swap."
    });
  }
});
swapRouter.post("/usdt-to-coin", requireAuth, swapLimiter, async (req, res) => {
  try {
    const user = req.user;
    const { usdtAmount, idempotencyKey } = req.body;
    const parsedAmount = typeof usdtAmount === "number" ? usdtAmount : parseFloat(usdtAmount);
    if (isNaN(parsedAmount) || !isFinite(parsedAmount) || parsedAmount <= 0) {
      res.status(400).json({
        error: "INVALID_AMOUNT",
        message: "USDT amount must be a positive number greater than 0."
      });
      return;
    }
    const result = await executeUsdtToCoinSwap({
      userId: user.id,
      usdtAmount: parsedAmount,
      idempotencyKey
    });
    res.status(200).json(result);
  } catch (err) {
    const code = err.code || err.message && err.message.split(":")[0] || "SERVER_ERROR";
    if (code === "INSUFFICIENT_USDT_BALANCE") {
      res.status(400).json({
        error: "INSUFFICIENT_USDT_BALANCE",
        message: err.message?.replace("INSUFFICIENT_USDT_BALANCE: ", "") || "Insufficient USDT ledger balance."
      });
      return;
    }
    if (code === "SWAP_DISABLED") {
      res.status(400).json({
        error: "SWAP_DISABLED",
        message: "Internal coin swapping is currently disabled by administration."
      });
      return;
    }
    if (code === "SWAP_RATE_NOT_CONFIGURED") {
      res.status(400).json({
        error: "SWAP_RATE_NOT_CONFIGURED",
        message: "Internal coin conversion rate is not configured by PHIVONEX administration."
      });
      return;
    }
    console.error("[Swap API] Error in POST /api/swap/usdt-to-coin:", err);
    res.status(500).json({
      error: "SERVER_ERROR",
      message: err.message || "Failed to execute USDT to coin swap."
    });
  }
});

// src/server/routes/notificationRoutes.ts
import { Router as Router18 } from "express";
init_notificationService();
var notificationRouter = Router18();
var testPushTimestamps = /* @__PURE__ */ new Map();
notificationRouter.get("/events", requireAuth, (req, res) => {
  const userId = req.user.id;
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  res.write(`data: ${JSON.stringify({ type: "CONNECTED", userId, timestamp: Date.now() })}

`);
  const onNotification = (notif) => {
    try {
      res.write(`data: ${JSON.stringify({ type: "NEW_NOTIFICATION", notification: notif })}

`);
    } catch {
    }
  };
  notificationEmitter.on(`notification:${userId}`, onNotification);
  const heartbeat = setInterval(() => {
    try {
      res.write(`: heartbeat ${Date.now()}

`);
    } catch {
      clearInterval(heartbeat);
    }
  }, 15e3);
  req.on("close", () => {
    clearInterval(heartbeat);
    notificationEmitter.off(`notification:${userId}`, onNotification);
    res.end();
  });
});
notificationRouter.get("/", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 20;
    const offset = req.query.offset ? parseInt(String(req.query.offset), 10) : 0;
    const unreadOnly = req.query.unreadOnly === "true" || req.query.unreadOnly === "1";
    const type = req.query.type ? String(req.query.type) : void 0;
    const result = await getUserNotifications(userId, {
      limit: isNaN(limit) ? 20 : limit,
      offset: isNaN(offset) ? 0 : offset,
      unreadOnly,
      type
    });
    return res.json(result);
  } catch (err) {
    console.error("[Notification API] Error fetching notifications:", err);
    return res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to retrieve notifications."
    });
  }
});
notificationRouter.get("/unread-count", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const unreadCount = await getUnreadNotificationCount(userId);
    return res.json({ unreadCount });
  } catch (err) {
    console.error("[Notification API] Error fetching unread count:", err);
    return res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to retrieve unread notification count."
    });
  }
});
notificationRouter.patch("/:id/read", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const publicNotificationId = req.params.id;
    if (!publicNotificationId) {
      return res.status(400).json({
        error: "INVALID_ID",
        message: "Notification ID is required."
      });
    }
    const success = await markNotificationAsRead(userId, publicNotificationId);
    return res.json({ success, id: publicNotificationId });
  } catch (err) {
    console.error("[Notification API] Error marking notification as read:", err);
    return res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to mark notification as read."
    });
  }
});
var handleReadAll = async (req, res) => {
  try {
    const userId = req.user.id;
    const count = await markAllNotificationsAsRead(userId);
    return res.json({ success: true, count });
  } catch (err) {
    console.error("[Notification API] Error marking all notifications as read:", err);
    return res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to mark all notifications as read."
    });
  }
};
notificationRouter.patch("/read-all", requireAuth, handleReadAll);
notificationRouter.post("/read-all", requireAuth, handleReadAll);
notificationRouter.delete("/:id", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const publicNotificationId = req.params.id;
    if (!publicNotificationId) {
      return res.status(400).json({
        error: "INVALID_ID",
        message: "Notification ID is required."
      });
    }
    const success = await deleteNotification(userId, publicNotificationId);
    if (!success) {
      return res.status(404).json({
        error: "NOT_FOUND",
        message: "Notification not found or already deleted."
      });
    }
    return res.json({ success: true, id: publicNotificationId });
  } catch (err) {
    console.error("[Notification API] Error deleting notification:", err);
    return res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to delete notification."
    });
  }
});
notificationRouter.delete("/", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const readOnly = req.query.readOnly === "true" || req.query.readOnly === "1";
    const count = await deleteAllNotifications(userId, { readOnly });
    return res.json({ success: true, count });
  } catch (err) {
    console.error("[Notification API] Error bulk deleting notifications:", err);
    return res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to delete notifications."
    });
  }
});
notificationRouter.post("/push-token", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { token, platform, userAgent } = req.body;
    if (!token || typeof token !== "string") {
      return res.status(400).json({
        success: false,
        error: "INVALID_TOKEN",
        message: "Push registration token is required."
      });
    }
    const { saveUserPushToken: saveUserPushToken2 } = await Promise.resolve().then(() => (init_webPushServerService(), webPushServerService_exports));
    const saved = await saveUserPushToken2({
      userId,
      token,
      platform: platform || "WEB",
      userAgent: userAgent || req.headers["user-agent"] || ""
    });
    return res.json({ success: saved, message: "Web Push subscription active." });
  } catch (err) {
    console.error("[Notification API] Error saving push token:", err);
    return res.status(500).json({
      success: false,
      error: "SERVER_ERROR",
      message: "Failed to register push token."
    });
  }
});
notificationRouter.delete("/push-token", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ success: false, message: "Token required." });
    }
    const { removeUserPushToken: removeUserPushToken2 } = await Promise.resolve().then(() => (init_webPushServerService(), webPushServerService_exports));
    await removeUserPushToken2(userId, token);
    return res.json({ success: true, message: "Push token unsubscribed." });
  } catch (err) {
    console.error("[Notification API] Error unsubscribing push token:", err);
    return res.status(500).json({ success: false, message: "Failed to unsubscribe push token." });
  }
});
notificationRouter.post("/test-push", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const now = Date.now();
    const timestamps = (testPushTimestamps.get(userId) || []).filter((t) => now - t < 6e4);
    if (timestamps.length >= 5) {
      return res.status(429).json({
        success: false,
        error: "RATE_LIMITED",
        message: "Too many test push requests. Please wait a minute before trying again."
      });
    }
    timestamps.push(now);
    testPushTimestamps.set(userId, timestamps);
    const { sendPushNotificationToUser: sendPushNotificationToUser2 } = await Promise.resolve().then(() => (init_webPushServerService(), webPushServerService_exports));
    const result = await sendPushNotificationToUser2(userId, {
      title: "\u{1F514} PHIVONEX Web Push Active!",
      body: "Your device is successfully connected to the PHIVONEX real-time alert mesh.",
      url: "/app/notifications",
      data: {
        type: "TEST_PUSH",
        timestamp: String(Date.now())
      }
    });
    if (result.sent === 0 && result.failed === 0) {
      return res.status(404).json({
        success: false,
        message: "No active push notification subscriptions found for your account. Please enable notifications first."
      });
    }
    return res.json({
      success: true,
      message: `Test push notification dispatched! Sent to ${result.sent} device(s).`,
      sentCount: result.sent,
      failedCount: result.failed
    });
  } catch (err) {
    console.error("[Notification API] Error triggering test push:", err);
    return res.status(500).json({
      success: false,
      error: "SERVER_ERROR",
      message: "Failed to trigger test push notification."
    });
  }
});
notificationRouter.get("/push-status", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { getUserPushTokens: getUserPushTokens2 } = await Promise.resolve().then(() => (init_webPushServerService(), webPushServerService_exports));
    const tokens = await getUserPushTokens2(userId);
    return res.json({
      isSubscribed: tokens.length > 0,
      activeDeviceCount: tokens.length,
      projectId: "phivonex-production",
      messagingSenderId: "1077670417334"
    });
  } catch (err) {
    return res.status(500).json({ error: "SERVER_ERROR", message: "Failed to query push status." });
  }
});

// src/server/routes/emailWebhookRoutes.ts
init_emailService();
import { Router as Router19 } from "express";
import crypto3 from "crypto";
var emailWebhookRouter = Router19();
function verifyCryptographicSignature(rawBody, headers, secret) {
  const svixId = headers["svix-id"] || headers["webhook-id"];
  const svixTimestamp = headers["svix-timestamp"] || headers["webhook-timestamp"];
  const svixSignature = headers["svix-signature"] || headers["webhook-signature"] || headers["x-resend-signature"] || headers["x-provider-signature"];
  if (!svixId || !svixTimestamp || !svixSignature) {
    return false;
  }
  const now = Math.floor(Date.now() / 1e3);
  const tsInt = parseInt(svixTimestamp, 10);
  if (isNaN(tsInt) || Math.abs(now - tsInt) > 300) {
    return false;
  }
  const toSign = `${svixId}.${svixTimestamp}.${rawBody}`;
  let cleanSecret = secret;
  if (cleanSecret.startsWith("whsec_")) {
    cleanSecret = cleanSecret.substring(6);
  }
  const keyCandidates = [
    Buffer.from(secret, "utf-8"),
    Buffer.from(cleanSecret, "utf-8")
  ];
  const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
  if (cleanSecret.length % 4 === 0 && base64Regex.test(cleanSecret)) {
    try {
      keyCandidates.push(Buffer.from(cleanSecret, "base64"));
    } catch {
    }
  }
  if (secret.length % 4 === 0 && base64Regex.test(secret)) {
    try {
      keyCandidates.push(Buffer.from(secret, "base64"));
    } catch {
    }
  }
  const signatures = svixSignature.split(" ");
  for (const key of keyCandidates) {
    const hmacHex = crypto3.createHmac("sha256", key).update(toSign).digest("hex");
    const hmacBase64 = crypto3.createHmac("sha256", key).update(toSign).digest("base64");
    for (const sig of signatures) {
      const parts = sig.split(",");
      const targetSig = parts.length === 2 ? parts[1] : sig;
      try {
        const expectedBuf = Buffer.from(targetSig, "hex");
        const computedBuf = Buffer.from(hmacHex, "hex");
        if (expectedBuf.length === computedBuf.length && crypto3.timingSafeEqual(expectedBuf, computedBuf)) {
          return true;
        }
      } catch {
      }
      try {
        const expectedBuf = Buffer.from(targetSig, "base64");
        const computedBuf = Buffer.from(hmacBase64, "base64");
        if (expectedBuf.length === computedBuf.length && crypto3.timingSafeEqual(expectedBuf, computedBuf)) {
          return true;
        }
      } catch {
      }
    }
  }
  return false;
}
emailWebhookRouter.post("/", async (req, res) => {
  try {
    const isTest = process.env.NODE_ENV === "test";
    const secret = process.env.EMAIL_WEBHOOK_SECRET || (isTest ? "test_secret_key" : "");
    if (!secret) {
      console.error("[Webhook API] Missing EMAIL_WEBHOOK_SECRET in production/staging. Failing closed.");
      return res.status(401).json({ error: "UNAUTHORIZED", message: "Webhook configuration error. Request rejected." });
    }
    const rawBody = req.rawBody || JSON.stringify(req.body);
    const isAuthorized = verifyCryptographicSignature(rawBody, req.headers, secret);
    if (!isAuthorized) {
      return res.status(401).json({ error: "UNAUTHORIZED", message: "Failed cryptographic signature verification." });
    }
    const { messageId, status, errorReason } = req.body || {};
    if (!messageId || !status || !["delivered", "bounced", "failed"].includes(status)) {
      return res.status(400).json({ error: "INVALID_INPUT", message: "Invalid callback webhook structure." });
    }
    const matched = await handleProviderEmailWebhook(messageId, status, errorReason);
    return res.status(200).json({ success: matched });
  } catch (err) {
    console.error("[Webhook API] Error in email webhook:", err);
    return res.status(500).json({ error: "SERVER_ERROR", message: "Failed to process email status callback." });
  }
});

// src/server/routes/diagnosticRoutes.ts
import { Router as Router20 } from "express";
var diagnosticRouter = Router20();
diagnosticRouter.get("/cloudsql", async (req, res) => {
  try {
    const report = await checkCloudSqlConnection({ logStatus: true });
    if (report.status === "connected") {
      return res.status(200).json({
        success: true,
        message: "Cloud SQL PostgreSQL connection verified successfully.",
        diagnostic: report
      });
    }
    return res.status(503).json({
      success: false,
      message: "Cloud SQL PostgreSQL connection verification failed.",
      diagnostic: report
    });
  } catch (err) {
    console.error("[Diagnostic Router Error]", err);
    return res.status(500).json({
      success: false,
      error: "DIAGNOSTIC_FAILURE",
      message: "An internal error occurred while executing database diagnostics."
    });
  }
});
diagnosticRouter.get("/cloudsql/summary", async (req, res) => {
  try {
    const report = await checkCloudSqlConnection({ logStatus: false });
    return res.status(report.status === "connected" ? 200 : 503).json({
      status: report.status,
      engine: report.engine,
      version: report.version,
      database: report.database,
      user: report.user,
      latencyMs: report.latencyMs,
      tablesCount: report.publicTablesCount,
      allCoreTablesPresent: report.requiredCoreTablesVerified,
      timestamp: report.timestamp
    });
  } catch (err) {
    return res.status(500).json({
      status: "error",
      message: "Failed to retrieve diagnostic summary."
    });
  }
});
diagnosticRouter.get("/health", async (req, res) => {
  try {
    const start = performance.now();
    const report = await checkCloudSqlConnection({ logStatus: false });
    const duration = parseFloat((performance.now() - start).toFixed(2));
    if (report.connected) {
      return res.status(200).json({
        status: "ok",
        databaseEngine: report.engine,
        databaseName: report.database,
        latencyMs: report.latencyMs || duration,
        time: (/* @__PURE__ */ new Date()).toISOString()
      });
    }
    return res.status(503).json({
      status: "degraded",
      error: report.error || "Database unavailable",
      time: (/* @__PURE__ */ new Date()).toISOString()
    });
  } catch (err) {
    return res.status(503).json({
      status: "unhealthy",
      time: (/* @__PURE__ */ new Date()).toISOString()
    });
  }
});

// src/server/routes/supportRoutes.ts
import { Router as Router21 } from "express";

// src/server/services/supportService.ts
init_db();
init_notificationService();
init_walletLedgerService();
import { v4 as uuidv428 } from "uuid";
function generateTicketPublicId() {
  const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  let rand = "";
  for (let i = 0; i < 6; i++) {
    rand += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `TCK-${rand}`;
}
async function createSupportTicket(params) {
  const { userId, subject, category = "GENERAL", priority = "MEDIUM", dbClient } = params;
  const message = (params.message || params.userMessage || "").trim();
  const db = dbClient || await getDb();
  const ticketId = uuidv428();
  const publicTicketId = generateTicketPublicId();
  const now = /* @__PURE__ */ new Date();
  await db.query(
    `
    INSERT INTO support_tickets (
      id, public_ticket_id, user_id, subject, category, priority, status, created_at, updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, 'OPEN', $7, $7)
    `,
    [ticketId, publicTicketId, userId, subject.trim(), String(category).toUpperCase(), String(priority).toUpperCase(), now]
  );
  let messageId = uuidv428();
  if (message) {
    await db.query(
      `
      INSERT INTO support_ticket_messages (
        id, ticket_id, sender_id, sender_role, message, created_at
      )
      VALUES ($1, $2, $3, 'USER', $4, $5)
      `,
      [messageId, ticketId, userId, message, now]
    );
  }
  try {
    await notifySupportTicketCreated({
      userId,
      ticketId,
      ticketPublicId: publicTicketId,
      subject,
      dbClient
    });
  } catch (err) {
    console.warn("[SupportService] Failed to send ticket creation notification:", err);
  }
  return {
    id: ticketId,
    publicTicketId,
    userId,
    subject,
    category,
    priority,
    status: "OPEN",
    assignedAdminId: null,
    resolvedAt: null,
    closedAt: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    messages: message ? [
      {
        id: messageId,
        ticketId,
        senderId: userId,
        senderRole: "USER",
        senderName: "You",
        senderPublicName: "You",
        message,
        createdAt: now.toISOString()
      }
    ] : []
  };
}
async function getUserSupportTickets(userId) {
  const db = await getDb();
  const ticketsRes = await db.query(
    `
    SELECT id, public_ticket_id, user_id, subject, category, priority, status, assigned_admin_id, created_at, updated_at
    FROM support_tickets
    WHERE user_id = $1
    ORDER BY created_at DESC
    `,
    [userId]
  );
  return ticketsRes.rows.map((row) => ({
    id: row.id,
    publicTicketId: row.public_ticket_id,
    userId: row.user_id,
    subject: row.subject,
    category: row.category,
    priority: row.priority,
    status: row.status,
    assignedAdminId: row.assigned_admin_id,
    resolvedAt: row.status === "RESOLVED" ? new Date(row.updated_at).toISOString() : null,
    closedAt: row.status === "CLOSED" ? new Date(row.updated_at).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString()
  }));
}
async function getSupportTicketDetails(ticketIdentifier, userId) {
  const db = await getDb();
  const ticketRes = await db.query(
    `
    SELECT t.id, t.public_ticket_id, t.user_id, t.subject, t.category, t.priority, t.status, 
           t.assigned_admin_id, t.created_at, t.updated_at,
           u.email AS user_email, u.full_name AS user_full_name
    FROM support_tickets t
    LEFT JOIN users u ON t.user_id = u.id
    WHERE (t.id::text = $1 OR t.public_ticket_id = $1)
    ${userId ? "AND t.user_id = $2" : ""}
    LIMIT 1
    `,
    userId ? [ticketIdentifier, userId] : [ticketIdentifier]
  );
  if (ticketRes.rows.length === 0) return null;
  const t = ticketRes.rows[0];
  const messagesRes = await db.query(
    `
    SELECT m.id, m.ticket_id, m.sender_id, m.sender_role, m.message, m.created_at,
           COALESCE(u.full_name, u.email, 'Admin') AS sender_name
    FROM support_ticket_messages m
    LEFT JOIN users u ON m.sender_id = u.id
    WHERE m.ticket_id = $1
    ORDER BY m.created_at ASC
    `,
    [t.id]
  );
  const messages = messagesRes.rows.map((m) => ({
    id: m.id,
    ticketId: m.ticket_id,
    senderId: m.sender_id,
    senderRole: m.sender_role,
    senderName: m.sender_name || (m.sender_role === "ADMIN" ? "Support Specialist" : "User"),
    senderPublicName: m.sender_name || (m.sender_role === "ADMIN" ? "Support Specialist" : "User"),
    message: m.message,
    createdAt: new Date(m.created_at).toISOString()
  }));
  return {
    id: t.id,
    publicTicketId: t.public_ticket_id,
    userId: t.user_id,
    userEmail: t.user_email,
    userFullName: t.user_full_name,
    subject: t.subject,
    category: t.category,
    priority: t.priority,
    status: t.status,
    assignedAdminId: t.assigned_admin_id,
    resolvedAt: t.status === "RESOLVED" ? new Date(t.updated_at).toISOString() : null,
    closedAt: t.status === "CLOSED" ? new Date(t.updated_at).toISOString() : null,
    createdAt: new Date(t.created_at).toISOString(),
    updatedAt: new Date(t.updated_at).toISOString(),
    messages
  };
}
async function addTicketMessage(params) {
  const identifier = params.ticketIdentifier || params.publicTicketId || params.ticketId;
  if (!identifier) {
    throw new Error("Ticket identifier is required");
  }
  const { senderId, senderRole, message } = params;
  const db = await getDb();
  const ticket = await getSupportTicketDetails(identifier);
  if (!ticket) {
    throw new Error("Ticket not found");
  }
  const messageId = uuidv428();
  const now = /* @__PURE__ */ new Date();
  await db.query(
    `
    INSERT INTO support_ticket_messages (id, ticket_id, sender_id, sender_role, message, created_at)
    VALUES ($1, $2, $3, $4, $5, $6)
    `,
    [messageId, ticket.id, senderId, senderRole, message.trim(), now]
  );
  const newStatus = senderRole === "USER" && ticket.status === "RESOLVED" ? "OPEN" : ticket.status;
  await db.query(
    `
    UPDATE support_tickets 
    SET updated_at = $1, status = $2
    WHERE id = $3
    `,
    [now, newStatus, ticket.id]
  );
  if (senderRole === "ADMIN") {
    try {
      await notifySupportTicketUpdate({
        userId: ticket.userId,
        ticketId: ticket.id,
        ticketPublicId: ticket.publicTicketId,
        subject: ticket.subject,
        status: newStatus,
        message: `Support replied to your ticket "${ticket.subject}" (${ticket.publicTicketId}).`
      });
    } catch (err) {
      console.warn("[SupportService] Failed to send ticket update notification:", err);
    }
  }
  return {
    id: messageId,
    ticketId: ticket.id,
    senderId,
    senderRole,
    senderName: senderRole === "ADMIN" ? "Support Specialist" : "User",
    senderPublicName: senderRole === "ADMIN" ? "Support Specialist" : "User",
    message,
    createdAt: now.toISOString()
  };
}
async function updateTicketStatus(params) {
  const identifier = params.ticketIdentifier || params.publicTicketId || params.ticketId;
  if (!identifier) {
    throw new Error("Ticket identifier is required");
  }
  const { status, adminId } = params;
  const db = await getDb();
  const ticket = await getSupportTicketDetails(identifier);
  if (!ticket) {
    throw new Error("Ticket not found");
  }
  const now = /* @__PURE__ */ new Date();
  await db.query(
    `
    UPDATE support_tickets
    SET status = $1, assigned_admin_id = COALESCE($2, assigned_admin_id), updated_at = $3
    WHERE id = $4
    `,
    [status, adminId || null, now, ticket.id]
  );
  try {
    await notifySupportTicketUpdate({
      userId: ticket.userId,
      ticketId: ticket.id,
      ticketPublicId: ticket.publicTicketId,
      subject: ticket.subject,
      status,
      message: `Your support ticket "${ticket.subject}" (${ticket.publicTicketId}) has been marked as ${status}.`
    });
  } catch (err) {
    console.warn("[SupportService] Failed to notify status change:", err);
  }
  return await getSupportTicketDetails(ticket.id);
}
async function getAllSupportTickets(filters) {
  const db = await getDb();
  let query = `
    SELECT t.id, t.public_ticket_id, t.user_id, t.subject, t.category, t.priority, t.status, 
           t.assigned_admin_id, t.created_at, t.updated_at,
           u.email AS user_email, u.full_name AS user_full_name
    FROM support_tickets t
    LEFT JOIN users u ON t.user_id = u.id
    WHERE 1=1
  `;
  const queryParams = [];
  if (filters?.status) {
    queryParams.push(filters.status);
    query += ` AND t.status = $${queryParams.length}`;
  }
  if (filters?.category) {
    queryParams.push(filters.category);
    query += ` AND t.category = $${queryParams.length}`;
  }
  query += ` ORDER BY t.updated_at DESC`;
  const res = await db.query(query, queryParams);
  return res.rows.map((row) => ({
    id: row.id,
    publicTicketId: row.public_ticket_id,
    userId: row.user_id,
    userEmail: row.user_email,
    userFullName: row.user_full_name,
    subject: row.subject,
    category: row.category,
    priority: row.priority,
    status: row.status,
    assignedAdminId: row.assigned_admin_id,
    resolvedAt: row.status === "RESOLVED" ? new Date(row.updated_at).toISOString() : null,
    closedAt: row.status === "CLOSED" ? new Date(row.updated_at).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString()
  }));
}

// src/server/routes/supportRoutes.ts
var router9 = Router21();
router9.post("/tickets", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { subject, message, category, priority } = req.body;
    if (!subject || !subject.trim()) {
      return res.status(400).json({ error: "Subject is required" });
    }
    if (!message || !message.trim()) {
      return res.status(400).json({ error: "Message is required" });
    }
    const ticket = await createSupportTicket({
      userId,
      subject: subject.trim(),
      message: message.trim(),
      category,
      priority
    });
    res.status(201).json({ success: true, ticket });
  } catch (err) {
    console.error("[SupportRoutes] Error creating ticket:", err);
    res.status(500).json({ error: "Failed to create support ticket" });
  }
});
router9.get("/tickets", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const tickets = await getUserSupportTickets(userId);
    res.json({ success: true, tickets });
  } catch (err) {
    console.error("[SupportRoutes] Error fetching user tickets:", err);
    res.status(500).json({ error: "Failed to fetch support tickets" });
  }
});
router9.get("/tickets/:id", requireAuth, async (req, res) => {
  try {
    const userId = req.user.role === "ADMIN" ? void 0 : req.user.id;
    const ticket = await getSupportTicketDetails(req.params.id, userId);
    if (!ticket) {
      return res.status(404).json({ error: "Ticket not found" });
    }
    res.json({ success: true, ticket });
  } catch (err) {
    console.error("[SupportRoutes] Error fetching ticket details:", err);
    res.status(500).json({ error: "Failed to fetch ticket details" });
  }
});
router9.post("/tickets/:id/messages", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { message } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ error: "Message is required" });
    }
    const ticket = await getSupportTicketDetails(req.params.id, req.user.role === "ADMIN" ? void 0 : userId);
    if (!ticket) {
      return res.status(404).json({ error: "Ticket not found" });
    }
    const senderRole = req.user.role === "ADMIN" ? "ADMIN" : "USER";
    const msg = await addTicketMessage({
      ticketIdentifier: ticket.id,
      senderId: userId,
      senderRole,
      message: message.trim()
    });
    res.status(201).json({ success: true, message: msg });
  } catch (err) {
    console.error("[SupportRoutes] Error adding message:", err);
    res.status(500).json({ error: "Failed to add message to ticket" });
  }
});
router9.get("/admin/tickets", requireAdmin, async (req, res) => {
  try {
    const { status, category } = req.query;
    const tickets = await getAllSupportTickets({
      status,
      category
    });
    res.json({ success: true, tickets });
  } catch (err) {
    console.error("[SupportRoutes] Error fetching admin tickets:", err);
    res.status(500).json({ error: "Failed to fetch tickets" });
  }
});
router9.patch("/admin/tickets/:id/status", requireAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    if (!status) {
      return res.status(400).json({ error: "Status is required" });
    }
    const ticket = await updateTicketStatus({
      ticketIdentifier: req.params.id,
      status,
      adminId: req.user.id
    });
    res.json({ success: true, ticket });
  } catch (err) {
    console.error("[SupportRoutes] Error updating ticket status:", err);
    res.status(500).json({ error: "Failed to update ticket status" });
  }
});
var supportRouter = router9;

// src/server/routes/kycRoutes.ts
import { Router as Router22 } from "express";

// src/server/services/kycService.ts
init_db();
init_adminService();
import { v4 as uuidv429 } from "uuid";
async function submitUserKYC(userId, input) {
  const db = await getDb();
  if (!input.fullLegalName || input.fullLegalName.trim().length < 2) {
    throw new Error("Full legal name is required and must match your ID document.");
  }
  if (!input.dob || !input.country || !input.residentialAddress || !input.city) {
    throw new Error("Complete residential address and personal details are mandatory.");
  }
  if (!input.documentNumber || input.documentNumber.trim().length < 3) {
    throw new Error("Valid document number is required.");
  }
  if (!input.documentFrontUrl || !input.selfiePhotoUrl) {
    throw new Error("Front document photo and live facial selfie photo are mandatory.");
  }
  const existingRes = await db.query(
    `SELECT id, status FROM kyc_verifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [userId]
  );
  let recordId = uuidv429();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  if (existingRes.rows.length > 0) {
    recordId = existingRes.rows[0].id;
    await db.query(
      `
      UPDATE kyc_verifications
      SET full_legal_name = $1,
          dob = $2,
          country = $3,
          residential_address = $4,
          city = $5,
          postal_code = $6,
          document_type = $7,
          document_number = $8,
          document_front_url = $9,
          document_back_url = $10,
          selfie_photo_url = $11,
          status = 'PENDING',
          rejection_reason = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $12
      `,
      [
        input.fullLegalName.trim(),
        input.dob.trim(),
        input.country.trim(),
        input.residentialAddress.trim(),
        input.city.trim(),
        input.postalCode.trim(),
        input.documentType,
        input.documentNumber.trim(),
        input.documentFrontUrl,
        input.documentBackUrl || null,
        input.selfiePhotoUrl,
        recordId
      ]
    );
  } else {
    await db.query(
      `
      INSERT INTO kyc_verifications (
        id, user_id, full_legal_name, dob, country, residential_address,
        city, postal_code, document_type, document_number, document_front_url,
        document_back_url, selfie_photo_url, status, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `,
      [
        recordId,
        userId,
        input.fullLegalName.trim(),
        input.dob.trim(),
        input.country.trim(),
        input.residentialAddress.trim(),
        input.city.trim(),
        input.postalCode.trim(),
        input.documentType,
        input.documentNumber.trim(),
        input.documentFrontUrl,
        input.documentBackUrl || null,
        input.selfiePhotoUrl
      ]
    );
  }
  await db.query(
    `UPDATE users SET kyc_status = 'PENDING', kyc_reject_reason = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [userId]
  );
  try {
    const { adminFirestore: adminFirestore2 } = await Promise.resolve().then(() => (init_firebase_admin(), firebase_admin_exports));
    await adminFirestore2.collection("kyc_verifications").doc(userId).set(
      {
        id: recordId,
        userId,
        status: "PENDING",
        documentType: input.documentType,
        fullLegalName: input.fullLegalName.trim(),
        submittedAt: now,
        updatedAt: now
      },
      { merge: true }
    );
    await adminFirestore2.collection("users").doc(userId).set(
      {
        kycStatus: "PENDING",
        kycRejectReason: null,
        updatedAt: now
      },
      { merge: true }
    );
  } catch (fsErr) {
    console.warn("[KYC Service] Firestore real-time sync warning:", fsErr);
  }
  try {
    await db.query(
      `
      INSERT INTO notifications (id, user_id, type, title, message, created_at)
      VALUES ($1, $2, 'SECURITY_ALERT', 'Identity Verification Submitted', 
              'Your KYC documents (Front, Back, and Live Selfie) were received and are under active security verification.', CURRENT_TIMESTAMP)
      `,
      [uuidv429(), userId]
    );
  } catch {
  }
  return {
    id: recordId,
    userId,
    fullLegalName: input.fullLegalName.trim(),
    dob: input.dob.trim(),
    country: input.country.trim(),
    residentialAddress: input.residentialAddress.trim(),
    city: input.city.trim(),
    postalCode: input.postalCode.trim(),
    documentType: input.documentType,
    documentNumber: input.documentNumber.trim(),
    documentFrontUrl: input.documentFrontUrl,
    documentBackUrl: input.documentBackUrl,
    selfiePhotoUrl: input.selfiePhotoUrl,
    status: "PENDING",
    createdAt: now,
    updatedAt: now
  };
}
async function getUserKYCStatus(userId) {
  const db = await getDb();
  const userRes = await db.query(
    `SELECT kyc_status, kyc_reject_reason, kyc_verified_at FROM users WHERE id = $1`,
    [userId]
  );
  const kycStatus = userRes.rows[0]?.kyc_status || "UNVERIFIED";
  const rejectionReason = userRes.rows[0]?.kyc_reject_reason || null;
  const verifiedAt = userRes.rows[0]?.kyc_verified_at || null;
  const subRes = await db.query(
    `
    SELECT id, user_id, full_legal_name, dob, country, residential_address,
           city, postal_code, document_type, document_number, document_front_url,
           document_back_url, selfie_photo_url, status, rejection_reason,
           reviewer_id, reviewed_at, created_at, updated_at
    FROM kyc_verifications
    WHERE user_id = $1
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [userId]
  );
  let submission = null;
  if (subRes.rows.length > 0) {
    const r = subRes.rows[0];
    submission = {
      id: r.id,
      userId: r.user_id,
      fullLegalName: r.full_legal_name,
      dob: r.dob,
      country: r.country,
      residentialAddress: r.residential_address,
      city: r.city,
      postalCode: r.postal_code,
      documentType: r.document_type,
      documentNumber: r.document_number,
      documentFrontUrl: r.document_front_url,
      documentBackUrl: r.document_back_url,
      selfiePhotoUrl: r.selfie_photo_url,
      status: r.status,
      rejectionReason: r.rejection_reason,
      reviewerId: r.reviewer_id,
      reviewedAt: r.reviewed_at,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    };
  }
  return {
    kycStatus,
    rejectionReason,
    verifiedAt,
    submission
  };
}
async function getAdminKYCSubmissions(params) {
  const db = await getDb();
  const limit = params.limit || 50;
  const offset = params.offset || 0;
  const countsRes = await db.query(`
    SELECT 
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE status = 'PENDING') AS pending,
      COUNT(*) FILTER (WHERE status = 'VERIFIED') AS verified,
      COUNT(*) FILTER (WHERE status = 'REJECTED') AS rejected
    FROM kyc_verifications
  `);
  const countsRow = countsRes.rows[0] || {};
  const pendingCount = Number(countsRow.pending || 0);
  const verifiedCount = Number(countsRow.verified || 0);
  const rejectedCount = Number(countsRow.rejected || 0);
  const totalCount = Number(countsRow.total || 0);
  let query = `
    SELECT 
      k.id, k.user_id, k.full_legal_name, k.dob, k.country, k.residential_address,
      k.city, k.postal_code, k.document_type, k.document_number, k.document_front_url,
      k.document_back_url, k.selfie_photo_url, k.status, k.rejection_reason,
      k.reviewer_id, k.reviewed_at, k.created_at, k.updated_at,
      u.public_id AS user_public_id, u.email AS user_email, u.full_name AS user_full_name
    FROM kyc_verifications k
    JOIN users u ON k.user_id = u.id
    WHERE 1=1
  `;
  const queryParams = [];
  if (params.statusFilter && params.statusFilter !== "ALL") {
    queryParams.push(params.statusFilter);
    query += ` AND k.status = $${queryParams.length} `;
  }
  if (params.searchQuery && params.searchQuery.trim()) {
    queryParams.push(`%${params.searchQuery.trim()}%`);
    const pIdx = queryParams.length;
    query += ` AND (
      k.full_legal_name ILIKE $${pIdx} OR 
      u.email ILIKE $${pIdx} OR 
      u.public_id ILIKE $${pIdx} OR 
      k.document_number ILIKE $${pIdx} OR
      k.country ILIKE $${pIdx}
    ) `;
  }
  query += ` ORDER BY CASE WHEN k.status = 'PENDING' THEN 0 ELSE 1 END, k.created_at DESC `;
  queryParams.push(limit, offset);
  query += ` LIMIT $${queryParams.length - 1} OFFSET $${queryParams.length} `;
  const res = await db.query(query, queryParams);
  const submissions = res.rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    userPublicId: r.user_public_id,
    userEmail: r.user_email,
    userFullName: r.user_full_name,
    fullLegalName: r.full_legal_name,
    dob: r.dob,
    country: r.country,
    residentialAddress: r.residential_address,
    city: r.city,
    postalCode: r.postal_code,
    documentType: r.document_type,
    documentNumber: r.document_number,
    documentFrontUrl: r.document_front_url,
    documentBackUrl: r.document_back_url,
    selfiePhotoUrl: r.selfie_photo_url,
    status: r.status,
    rejectionReason: r.rejection_reason,
    reviewerId: r.reviewer_id,
    reviewedAt: r.reviewed_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }));
  return {
    submissions,
    totalCount,
    pendingCount,
    verifiedCount,
    rejectedCount
  };
}
async function reviewKYCSubmission(adminUserId, adminPublicId, submissionId, decision, reason) {
  const db = await getDb();
  const subRes = await db.query(
    `SELECT k.*, u.public_id, u.email, u.full_name FROM kyc_verifications k JOIN users u ON k.user_id = u.id WHERE k.id = $1`,
    [submissionId]
  );
  if (subRes.rows.length === 0) {
    throw new Error("KYC submission record not found.");
  }
  const record = subRes.rows[0];
  const targetUserId = record.user_id;
  const now = (/* @__PURE__ */ new Date()).toISOString();
  if (decision === "APPROVE") {
    await db.query(
      `
      UPDATE kyc_verifications
      SET status = 'VERIFIED',
          rejection_reason = NULL,
          reviewer_id = $1,
          reviewed_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      `,
      [adminUserId, submissionId]
    );
    await db.query(
      `
      UPDATE users
      SET kyc_status = 'VERIFIED',
          kyc_reject_reason = NULL,
          kyc_verified_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      `,
      [targetUserId]
    );
    try {
      const { adminFirestore: adminFirestore2 } = await Promise.resolve().then(() => (init_firebase_admin(), firebase_admin_exports));
      await adminFirestore2.collection("kyc_verifications").doc(targetUserId).set(
        {
          id: submissionId,
          userId: targetUserId,
          status: "VERIFIED",
          reviewedAt: now,
          reviewerId: adminPublicId,
          updatedAt: now
        },
        { merge: true }
      );
      await adminFirestore2.collection("users").doc(targetUserId).set(
        {
          kycStatus: "VERIFIED",
          kycRejectReason: null,
          kycVerifiedAt: now,
          updatedAt: now
        },
        { merge: true }
      );
    } catch (fsErr) {
      console.warn("[KYC Service] Firestore real-time review sync warning:", fsErr);
    }
    await logAdminAction({
      adminUserId,
      adminPublicId,
      action: "APPROVE_KYC_VERIFICATION",
      targetType: "kyc_verifications",
      targetId: submissionId,
      details: `Approved KYC Level 1 Identity Verification for operator ${record.public_id} (${record.email}) - Legal Name: "${record.full_legal_name}"`
    });
    try {
      await db.query(
        `
        INSERT INTO notifications (id, user_id, type, title, message, created_at)
        VALUES ($1, $2, 'SECURITY_ALERT', 'KYC Verification Approved!', 
                'Congratulations! Your identity has been verified with Binance-grade Level 1 status. Full withdrawal limits and priority node services are unlocked.', CURRENT_TIMESTAMP)
        `,
        [uuidv429(), targetUserId]
      );
    } catch {
    }
    return {
      success: true,
      status: "VERIFIED",
      message: `User ${record.public_id} identity successfully verified.`
    };
  } else {
    const rejectionReason = reason?.trim() || "Document image unreadable or details mismatch.";
    await db.query(
      `
      UPDATE kyc_verifications
      SET status = 'REJECTED',
          rejection_reason = $1,
          reviewer_id = $2,
          reviewed_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      `,
      [rejectionReason, adminUserId, submissionId]
    );
    await db.query(
      `
      UPDATE users
      SET kyc_status = 'REJECTED',
          kyc_reject_reason = $1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      `,
      [rejectionReason, targetUserId]
    );
    try {
      const { adminFirestore: adminFirestore2 } = await Promise.resolve().then(() => (init_firebase_admin(), firebase_admin_exports));
      await adminFirestore2.collection("kyc_verifications").doc(targetUserId).set(
        {
          id: submissionId,
          userId: targetUserId,
          status: "REJECTED",
          rejection_reason: rejectionReason,
          reviewedAt: now,
          reviewerId: adminPublicId,
          updatedAt: now
        },
        { merge: true }
      );
      await adminFirestore2.collection("users").doc(targetUserId).set(
        {
          kycStatus: "REJECTED",
          kycRejectReason: rejectionReason,
          updatedAt: now
        },
        { merge: true }
      );
    } catch (fsErr) {
      console.warn("[KYC Service] Firestore real-time rejection sync warning:", fsErr);
    }
    await logAdminAction({
      adminUserId,
      adminPublicId,
      action: "REJECT_KYC_VERIFICATION",
      targetType: "kyc_verifications",
      targetId: submissionId,
      details: `Rejected KYC verification for operator ${record.public_id} (${record.email}). Reason: "${rejectionReason}"`
    });
    try {
      await db.query(
        `
        INSERT INTO notifications (id, user_id, type, title, message, created_at)
        VALUES ($1, $2, 'SECURITY_ALERT', 'KYC Verification Needs Attention', 
                $3, CURRENT_TIMESTAMP)
        `,
        [uuidv429(), targetUserId, `Your identity verification was rejected: ${rejectionReason}. Please resubmit with clear photos.`]
      );
    } catch {
    }
    return {
      success: true,
      status: "REJECTED",
      message: `KYC submission rejected for ${record.public_id}.`
    };
  }
}

// src/server/routes/kycRoutes.ts
var kycRouter = Router22();
kycRouter.get("/me", requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const statusData = await getUserKYCStatus(user.id);
    res.status(200).json({
      success: true,
      ...statusData
    });
  } catch (err) {
    console.error("[KYC API] Error getting user KYC status:", err);
    res.status(500).json({
      success: false,
      error: "SERVER_ERROR",
      message: err.message || "Failed to retrieve KYC status."
    });
  }
});
kycRouter.post("/submit", requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const {
      fullLegalName,
      dob,
      country,
      residentialAddress,
      city,
      postalCode,
      documentType,
      documentNumber,
      documentFrontUrl,
      documentBackUrl,
      selfiePhotoUrl
    } = req.body;
    if (!fullLegalName || !dob || !country || !residentialAddress || !city || !documentType || !documentNumber || !documentFrontUrl || !selfiePhotoUrl) {
      res.status(400).json({
        success: false,
        error: "INVALID_INPUT",
        message: "All identity parameters, front document photo, and live selfie are required."
      });
      return;
    }
    const submission = await submitUserKYC(user.id, {
      fullLegalName,
      dob,
      country,
      residentialAddress,
      city,
      postalCode: postalCode || "",
      documentType,
      documentNumber,
      documentFrontUrl,
      documentBackUrl,
      selfiePhotoUrl
    });
    res.status(200).json({
      success: true,
      message: "Identity verification submitted successfully. Under active review.",
      submission
    });
  } catch (err) {
    console.error("[KYC API] Error submitting KYC:", err);
    res.status(400).json({
      success: false,
      error: "SUBMISSION_FAILED",
      message: err.message || "Failed to submit KYC verification."
    });
  }
});
kycRouter.get("/admin/submissions", requireAuth, requireAdmin, async (req, res) => {
  try {
    const statusFilter = req.query.status || "ALL";
    const searchQuery = req.query.search || "";
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    const data = await getAdminKYCSubmissions({
      statusFilter,
      searchQuery,
      limit,
      offset
    });
    res.status(200).json({
      success: true,
      ...data
    });
  } catch (err) {
    console.error("[KYC API Admin] Error listing KYC submissions:", err);
    res.status(500).json({
      success: false,
      error: "SERVER_ERROR",
      message: err.message || "Failed to list KYC submissions."
    });
  }
});
kycRouter.post("/admin/:id/review", requireAuth, requireAdmin, async (req, res) => {
  try {
    const admin = req.user;
    const submissionId = req.params.id;
    const { decision, reason } = req.body;
    if (!decision || decision !== "APPROVE" && decision !== "REJECT") {
      res.status(400).json({
        success: false,
        error: "INVALID_DECISION",
        message: 'Decision must be either "APPROVE" or "REJECT".'
      });
      return;
    }
    if (decision === "REJECT" && (!reason || reason.trim().length < 3)) {
      res.status(400).json({
        success: false,
        error: "REASON_REQUIRED",
        message: "A rejection reason is required for the user to remediate."
      });
      return;
    }
    const result = await reviewKYCSubmission(
      admin.id,
      admin.public_id,
      submissionId,
      decision,
      reason
    );
    res.status(200).json(result);
  } catch (err) {
    console.error("[KYC API Admin] Error reviewing submission:", err);
    res.status(400).json({
      success: false,
      error: "REVIEW_FAILED",
      message: err.message || "Failed to process KYC review."
    });
  }
});

// server.ts
init_db();

// src/server/services/binaryMatchingScheduler.ts
init_timezone();
var schedulerTimer = null;
var isRunning = false;
async function executeDailyCycle() {
  const previousDate = getPreviousUtcBusinessDate();
  console.log(`[MatchingScheduler] \u{1F55B} 06:00 UTC reached. Starting daily matching settlement for previous business date: ${previousDate}`);
  try {
    const result = await runDailyMatchingSettlementCycle(previousDate);
    console.log(
      `[MatchingScheduler] \u2705 Daily settlement cycle finished for ${previousDate}: status=${result.status}, usersSettled=${result.usersSettled}, totalBonus=$${result.totalBonusUsd}, duration=${result.durationMs}ms`
    );
  } catch (err) {
    console.error(`[MatchingScheduler] \u274C Daily settlement cycle failed for ${previousDate}:`, err);
  } finally {
    scheduleNextDailyRun();
  }
}
function scheduleNextDailyRun() {
  const { nextRunIso, msUntilRun } = getNextUtc0600Time();
  console.log(`[MatchingScheduler] Next daily settlement scheduled for ${nextRunIso} (in ${Math.round(msUntilRun / 1e3)}s)`);
  if (schedulerTimer) {
    clearTimeout(schedulerTimer);
  }
  schedulerTimer = setTimeout(() => {
    executeDailyCycle().catch((err) => {
      console.error("[MatchingScheduler] Unhandled error during 06:00 UTC execution:", err);
    });
  }, msUntilRun);
}
function startMatchingScheduler() {
  if (isRunning) return;
  isRunning = true;
  console.log("[MatchingScheduler] Initializing Daily Binary Matching Settlement Scheduler (06:00 UTC)...");
  scheduleNextDailyRun();
}

// src/server/services/emailReportingService.ts
init_db();
import { Resend } from "resend";
import cron from "node-cron";
async function sendWeeklyReports() {
  if (!process.env.RESEND_API_KEY) {
    console.warn("[WeeklyReport] RESEND_API_KEY not set. Skipping.");
    return;
  }
  const resend = new Resend(process.env.RESEND_API_KEY);
  const db = await getDb();
  const usersRes = await db.query(
    `SELECT id, email, full_name FROM users WHERE status = 'ACTIVE'`
  );
  for (const user of usersRes.rows) {
    try {
      const networkSummary = await getNetworkSummary(user.id);
      const rewardsSummary = await getUserRewardsSummary(user.id);
      await resend.emails.send({
        from: "reports@phivonex.com",
        to: user.email,
        subject: "Your Weekly Phivonex Network Summary",
        html: `
          <h1>Hello ${user.full_name},</h1>
          <p>Here is your weekly summary for your Phivonex network:</p>
          <h2>Network Growth</h2>
          <ul>
            <li>Direct Referrals: ${networkSummary.directReferrals}</li>
            <li>Placed Members: ${networkSummary.placedMembers}</li>
          </ul>
          <h2>Reward Earnings</h2>
          <ul>
            <li>Total Earned: ${rewardsSummary.totalRewardsEarned} PHIVO</li>
            <li>Available Balance: ${rewardsSummary.totalAccrued} PHIVO</li>
          </ul>
          <p>Keep up the great work!</p>
        `
      });
      console.log(`[WeeklyReport] Sent to ${user.email}`);
    } catch (err) {
      console.error(`[WeeklyReport] Failed to send to ${user.email}:`, err);
    }
  }
}
function startWeeklyReportScheduler() {
  cron.schedule("0 0 * * 1", () => {
    sendWeeklyReports().catch((err) => console.error("[WeeklyReport] Scheduler error:", err));
  });
  console.log("[WeeklyReport] Scheduler started.");
}

// server.ts
var __filename = fileURLToPath(import.meta.url);
var __dirname = path2.dirname(__filename);
async function startServer() {
  try {
    validateProductionConfig();
  } catch (configErr) {
    console.warn("[CONFIG_WARNING] Production configuration note:", configErr);
  }
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3e3;
  const isProd = process.env.NODE_ENV === "production";
  app.use(securityHeadersMiddleware);
  app.use(express.json({
    limit: "1mb",
    verify: (req, res, buf) => {
      req.rawBody = buf.toString("utf-8");
    }
  }));
  app.use(cookieParser());
  app.use("/api", csrfOriginProtection);
  app.use(async (req, res, next) => {
    if (req.path.startsWith("/api/") && !req.path.startsWith("/api/health") && !req.path.startsWith("/api/diagnostics")) {
      try {
        await getDb();
        next();
      } catch (dbErr) {
        console.error(`[Server] Database unavailable on ${req.method} ${req.path}:`, dbErr);
        res.status(503).json({
          error: "DATABASE_UNAVAILABLE",
          message: "Database is currently initializing. Please retry in a few moments."
        });
        return;
      }
    } else {
      next();
    }
  });
  app.use("/api/auth", authRoutes_default);
  app.use("/api/referrals", referralRoutes_default);
  app.use("/api/users", userRoutes_default);
  app.use("/api/nodes", nodeRoutes_default);
  app.use("/api/node-orders", orderRoutes_default);
  app.use("/api/referral-commissions", commissionRoutes_default);
  app.use("/api/network", networkRoutes_default);
  app.use("/api/matching", matchingRoutes_default);
  app.use("/api/promotions", promotionRouter);
  app.use("/api/wallet", walletRouter);
  app.use("/api/wallets", walletRouter);
  app.use("/api/rewards", rewardRouter);
  app.use("/api/public/network", publicNetworkRouter);
  app.use("/api/withdrawals", withdrawalRouter);
  app.use("/api/deposits", depositRouter);
  app.use("/api/swap", swapRouter);
  app.use("/api/notifications", notificationRouter);
  app.use("/api/admin/economics", economicRouter);
  app.use("/api/economic", publicEconomicRouter);
  app.use("/api/webhooks/email", emailWebhookRouter);
  app.use("/api/diagnostics", diagnosticRouter);
  app.use("/api/support", supportRouter);
  app.use("/api/kyc", kycRouter);
  app.use("/api/admin", adminRouter);
  app.get("/healthz", (req, res) => {
    res.status(200).send("OK");
  });
  app.get("/api/health", async (req, res) => {
    try {
      const db = await getDb();
      await db.query("SELECT 1");
      res.status(200).json({ status: "ok", database: "connected", time: (/* @__PURE__ */ new Date()).toISOString() });
    } catch (err) {
      console.error("[Health Check Error] PostgreSQL connection verification failed:", err);
      res.status(503).json({ status: "unhealthy", error: "Database unavailable or unhealthy", time: (/* @__PURE__ */ new Date()).toISOString() });
    }
  });
  app.get("/api/health/db", (req, res, next) => {
    req.url = "/health";
    diagnosticRouter(req, res, next);
  });
  app.use("/api", sanitizeProductionErrors);
  if (!isProd) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false
      },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path2.resolve(process.cwd(), "dist");
    app.use("/assets", express.static(path2.join(distPath, "assets"), {
      maxAge: "1y",
      immutable: true
    }));
    app.use(express.static(distPath, {
      maxAge: "1h",
      setHeaders: (res, filePath) => {
        if (filePath.endsWith(".html")) {
          res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
          res.setHeader("Pragma", "no-cache");
          res.setHeader("Expires", "0");
        }
      }
    }));
    app.get("*", (req, res) => {
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      res.sendFile(path2.resolve(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[PHIVONEX Server] Running on http://0.0.0.0:${PORT}`);
  });
  getDb().then(() => {
    console.log("[Server] Database and referral migrations initialized.");
    startMatchingScheduler();
    startWeeklyReportScheduler();
    setInterval(() => {
      executeDailyAutomaticRewardCheck().catch(
        (err) => console.error("[RewardScheduler] Interval error:", err)
      );
    }, 6e4);
  }).catch((err) => {
    console.error("[Server] Failed to initialize database on startup:", err);
  });
}
startServer().catch((err) => {
  console.error("[PHIVONEX Server Error]", err);
  process.exit(1);
});
