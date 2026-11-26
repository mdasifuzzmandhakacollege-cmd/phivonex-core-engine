import { v4 as uuidv4 } from 'uuid';
import { getDb, DatabaseClient } from '../db/db';
import { generateLedgerTransactionPublicId } from '../utils/idGenerator';
import {
  parseAmountToScaledBigInt,
  formatScaledBigInt,
  calculateDailyYieldExact,
  getUserMainUsdtBalanceExact,
} from './tradingPoolService';
import { formatUtcDate } from './tradingYieldEpochService';
import { getNodeBasePriceUsd } from './economicService';
import { UnilevelSourceProductType, UnilevelYieldEventStatus } from './unilevelYieldEventService';
import { isFeatureSwitchEnabled } from './unilevelConfigService';

// Process-level mutex preventing overlapping batch sweeps in the same Node process
let unilevelBatchLock: Promise<void> = Promise.resolve();

async function withUnilevelBatchLock<T>(fn: () => Promise<T>): Promise<T> {
  const prev = unilevelBatchLock;
  let release!: () => void;
  const next = new Promise<void>((resolve) => {
    release = resolve;
  });
  unilevelBatchLock = prev.then(() => next);
  try {
    await prev;
    return await fn();
  } finally {
    release();
  }
}

export type UnilevelRoyaltyStatus = 'SETTLED' | 'SKIPPED_LOCKED' | 'FLUSHED' | 'REVERSED';

export interface UnilevelGenerationMatrixRow {
  generationLevel: number;
  commissionPct: string;
  minPersonalInvestment: string;
  minDirectActiveSponsors: number;
  isActive: boolean;
  isUnlocked: boolean;
  missingPersonalUsd: string;
  missingDirectSponsors: number;
  totalEarnedUsd?: string;
  todayEarnedUsd?: string;
  settledCount?: number;
  skippedLockedCount?: number;
}

export interface UserGenerationMatrixEvaluation {
  userId: string;
  personalActiveInvestmentUsd: string;
  activeBreakdown: {
    tradingPoolActiveUsd: string;
    chronoVaultActiveUsd: string;
    genesisNodeActiveUsd: string;
    activeNodesCount: number;
  };
  directActiveSponsorsCount: number;
  unlockedGenerationsCount: number;
  totalConfiguredCommissionPct: string;
  generations: UnilevelGenerationMatrixRow[];
}

export interface UnilevelYieldEventRow {
  id: string;
  source_product_type: UnilevelSourceProductType;
  source_yield_id: string;
  source_user_id: string;
  epoch_date: string;
  source_roi_usd: string;
  raw_token_amount: string | null;
  token_reference_price_usd: string | null;
  processing_status: UnilevelYieldEventStatus;
}

export interface SingleEventProcessingResult {
  eventId: string;
  sourceProductType: UnilevelSourceProductType;
  sourceYieldId: string;
  sourceUserId: string;
  epochDate: string;
  sourceRoiUsd: string;
  ancestorsEvaluated: number;
  settledPayoutsCount: number;
  skippedLockedCount: number;
  duplicatePayoutsSkipped: number;
  totalRoyaltyDistributedUsd: string;
}

export interface BatchUnilevelProcessingResult {
  eventsClaimed: number;
  eventsProcessed: number;
  totalSettledPayoutsCount: number;
  totalSkippedLockedCount: number;
  totalDuplicatePayoutsSkipped: number;
  totalRoyaltyDistributedUsd: string;
  touchedEpochDates: string[];
  completedAt: string;
}

export interface UnilevelRoyaltyPayoutRecord {
  id: string;
  beneficiaryUserId: string;
  sourceUserId: string;
  sourceUserPublicId: string | null;
  sourceUserName: string | null;
  generationLevel: number;
  sourceProductType: UnilevelSourceProductType;
  sourceYieldId: string;
  epochDate: string;
  sourceYieldAmount: string;
  commissionPct: string;
  royaltyAmount: string;
  currency: string;
  status: UnilevelRoyaltyStatus;
  ledgerEntryId: string | null;
  settledAt: string;
  createdAt: string;
}

export interface UnilevelRoyaltyOverviewResponse {
  personalActiveInvestmentUsd: string;
  activeBreakdown: {
    tradingPoolActiveUsd: string;
    chronoVaultActiveUsd: string;
    genesisNodeActiveUsd: string;
    activeNodesCount: number;
  };
  directActiveSponsorsCount: number;
  unlockedGenerationsCount: number;
  maxGenerations: number;
  totalConfiguredCommissionPct: string;
  mainUsdtWalletBalance: string;
  totalLifetimeRoyaltyUsd: string;
  todayRoyaltyUsd: string;
  totalSettledPayoutsCount: number;
  totalSkippedLockedCount: number;
  byProductBreakdown: {
    genesisNodeRoyaltyUsd: string;
    tradingPoolRoyaltyUsd: string;
    chronoVaultRoyaltyUsd: string;
  };
  generationMatrix: UnilevelGenerationMatrixRow[];
  payoutHistory: {
    items: UnilevelRoyaltyPayoutRecord[];
    pagination: {
      page: number;
      limit: number;
      totalCount: number;
      totalPages: number;
    };
  };
}

// 40.00000000% maximum cap across all 16 generations (scaled by 10^8)
const MAX_TOTAL_GENERATION_COMMISSION_PCT_SCALED = 4_000_000_000n; // 40.00000000

/**
 * Computes a user's active investment principal breakdown across all 3 PHIVONEX product lines:
 * 1. `user_trading_positions` where `status = 'ACTIVE'` (`SUM(principal_amount)`)
 * 2. `user_vault_positions` where `status = 'ACTIVE'` (`SUM(principal_amount)`)
 * 3. `nodes` where `owner_user_id = $1 AND status IN ('ACTIVE', 'EMITTING')` (`SUM(COALESCE(purchase_price_usd, nodeBasePriceUsd))`)
 */
export async function getUserActiveInvestmentBreakdownUsd(
  client: DatabaseClient,
  userId: string
): Promise<{
  totalActiveUsd: string;
  totalActiveScaled: bigint;
  tradingPoolActiveUsd: string;
  chronoVaultActiveUsd: string;
  genesisNodeActiveUsd: string;
  activeNodesCount: number;
}> {
  const nodeBasePrice = await getNodeBasePriceUsd(client).catch(() => 1000);
  const defaultNodePriceStr = formatScaledBigInt(parseAmountToScaledBigInt(nodeBasePrice));

  const res = await client.query<{
    trading_active_usd: string;
    vault_active_usd: string;
    node_active_usd: string;
    active_nodes_count: string | number;
  }>(
    `
    SELECT
      COALESCE(
        (SELECT ROUND(COALESCE(SUM(principal_amount), 0), 8)::text
         FROM user_trading_positions
         WHERE user_id = $1 AND status = 'ACTIVE'),
        '0.00000000'
      ) AS trading_active_usd,
      COALESCE(
        (SELECT ROUND(COALESCE(SUM(principal_amount), 0), 8)::text
         FROM user_vault_positions
         WHERE user_id = $1 AND status = 'ACTIVE'),
        '0.00000000'
      ) AS vault_active_usd,
      COALESCE(
        (SELECT ROUND(COALESCE(SUM(COALESCE(purchase_price_usd, $2::numeric(20,8))), 0), 8)::text
         FROM nodes
         WHERE owner_user_id = $1 AND status IN ('ACTIVE', 'EMITTING')),
        '0.00000000'
      ) AS node_active_usd,
      COALESCE(
        (SELECT COUNT(*)::int
         FROM nodes
         WHERE owner_user_id = $1 AND status IN ('ACTIVE', 'EMITTING')),
        0
      ) AS active_nodes_count
    `,
    [userId, defaultNodePriceStr]
  );

  const row = res.rows[0];
  const tradingScaled = parseAmountToScaledBigInt(row?.trading_active_usd || '0');
  const vaultScaled = parseAmountToScaledBigInt(row?.vault_active_usd || '0');
  const nodeScaled = parseAmountToScaledBigInt(row?.node_active_usd || '0');
  const totalActiveScaled = tradingScaled + vaultScaled + nodeScaled;

  return {
    totalActiveUsd: formatScaledBigInt(totalActiveScaled),
    totalActiveScaled,
    tradingPoolActiveUsd: formatScaledBigInt(tradingScaled),
    chronoVaultActiveUsd: formatScaledBigInt(vaultScaled),
    genesisNodeActiveUsd: formatScaledBigInt(nodeScaled),
    activeNodesCount: Number(row?.active_nodes_count || 0),
  };
}

/**
 * Returns the exact `NUMERIC(20,8)` string of a user's total active investment principal in USD
 * summed across Quantum Alpha Trading Pool, Chrono Vaults, and Genesis Core Nodes.
 */
export async function getUserActiveInvestmentUsd(
  client: DatabaseClient,
  userId: string
): Promise<string> {
  const breakdown = await getUserActiveInvestmentBreakdownUsd(client, userId);
  return breakdown.totalActiveUsd;
}

/**
 * Counts distinct direct referrals (`user_referrals.sponsor_user_id = $1`)
 * who currently have `getUserActiveInvestmentUsd(client, referral.user_id) > 0`.
 */
export async function getUserDirectActiveSponsorsCount(
  client: DatabaseClient,
  userId: string
): Promise<number> {
  const directsRes = await client.query<{ user_id: string }>(
    `
    SELECT DISTINCT ur.user_id
    FROM user_referrals ur
    WHERE ur.sponsor_user_id = $1
    `,
    [userId]
  );

  if (directsRes.rowCount === 0) {
    return 0;
  }

  let activeDirectsCount = 0;
  for (const row of directsRes.rows) {
    const activeUsdStr = await getUserActiveInvestmentUsd(client, row.user_id);
    if (parseAmountToScaledBigInt(activeUsdStr) > 0n) {
      activeDirectsCount++;
    }
  }

  return activeDirectsCount;
}

/**
 * Evaluates a user's 16-Generation Unilevel qualification matrix (`1..16`)
 * against `unilevel_generation_configs`.
 */
export async function evaluateUserGenerationMatrix(
  client: DatabaseClient,
  userId: string
): Promise<UserGenerationMatrixEvaluation> {
  const [breakdown, directActiveSponsorsCount, configsRes] = await Promise.all([
    getUserActiveInvestmentBreakdownUsd(client, userId),
    getUserDirectActiveSponsorsCount(client, userId),
    client.query<{
      generation_level: number;
      commission_pct: string;
      required_direct_active_referrals: number;
      required_personal_active_usd: string;
      is_active: boolean;
    }>(
      `
      SELECT
        generation_level,
        ROUND(commission_pct, 8)::text AS commission_pct,
        required_direct_active_referrals,
        ROUND(required_personal_active_usd, 8)::text AS required_personal_active_usd,
        is_active
      FROM unilevel_generation_configs
      WHERE generation_level BETWEEN 1 AND 16
      ORDER BY generation_level ASC
      `
    ),
  ]);

  const personalScaled = breakdown.totalActiveScaled;
  let unlockedGenerationsCount = 0;
  let totalCommissionPctScaled = 0n;

  const generations: UnilevelGenerationMatrixRow[] = configsRes.rows.map((cfg) => {
    const genLevel = Number(cfg.generation_level);
    const commScaled = parseAmountToScaledBigInt(cfg.commission_pct);
    const minPersonalScaled = parseAmountToScaledBigInt(cfg.required_personal_active_usd);
    const minDirects = Number(cfg.required_direct_active_referrals || 0);
    const isActive = Boolean(cfg.is_active);

    if (isActive) {
      totalCommissionPctScaled += commScaled;
    }

    const meetsPersonal = personalScaled >= minPersonalScaled;
    const meetsDirects = directActiveSponsorsCount >= minDirects;
    const isUnlocked = isActive && meetsPersonal && meetsDirects;

    if (isUnlocked) {
      unlockedGenerationsCount++;
    }

    const missingPersonalScaled =
      minPersonalScaled > personalScaled ? minPersonalScaled - personalScaled : 0n;
    const missingDirectSponsors =
      minDirects > directActiveSponsorsCount ? minDirects - directActiveSponsorsCount : 0;

    return {
      generationLevel: genLevel,
      commissionPct: formatScaledBigInt(commScaled),
      minPersonalInvestment: formatScaledBigInt(minPersonalScaled),
      minDirectActiveSponsors: minDirects,
      isActive,
      isUnlocked,
      missingPersonalUsd: formatScaledBigInt(missingPersonalScaled),
      missingDirectSponsors,
    };
  });

  return {
    userId,
    personalActiveInvestmentUsd: breakdown.totalActiveUsd,
    activeBreakdown: {
      tradingPoolActiveUsd: breakdown.tradingPoolActiveUsd,
      chronoVaultActiveUsd: breakdown.chronoVaultActiveUsd,
      genesisNodeActiveUsd: breakdown.genesisNodeActiveUsd,
      activeNodesCount: breakdown.activeNodesCount,
    },
    directActiveSponsorsCount,
    unlockedGenerationsCount,
    totalConfiguredCommissionPct: formatScaledBigInt(totalCommissionPctScaled),
    generations,
  };
}

/**
 * Processes a single `unilevel_yield_events` row inside the caller's PostgreSQL ACID transaction:
 * 1. Traverses upward via `user_referrals.sponsor_user_id` from `eventRow.source_user_id` for `generationLevel = 1..16`.
 * 2. Stops early if `sponsor_user_id IS NULL` or if a cycle is detected (`visitedUserIds.has(sponsorUserId)`).
 * 3. Loads active generation rules from `unilevel_generation_configs` (`1..16`) and verifies total active `commission_pct <= 40.00000000%`.
 * 4. Evaluates each ancestor at depth `k` strictly against Generation `k` rules (`SKIP_UNQUALIFIED` — zero dynamic compression).
 *    - If `!isUnlocked`: inserts an audit record in `unilevel_royalty_payouts` (`status = 'SKIPPED_LOCKED'`, `royalty_amount = 0.00000000`, `ledger_entry_id = NULL`) and credits `$0.00000000`.
 *    - If `isUnlocked`: computes `commissionUsd = round8(source_roi_usd * commission_pct / 100)`, inserts `SETTLED` row in `unilevel_royalty_payouts`, credits `beneficiary_user_id`'s Main USDT Wallet in `financial_ledger_entries` (`source_type = 'UNILEVEL_ROYALTY'`), and links `ledger_entry_id`.
 * 5. Asserts total distributed `commission_usd <= round8(source_roi_usd * 0.40)`.
 * 6. Updates `unilevel_yield_events` to `processing_status = 'PROCESSED'`, `processed_at = NOW()`.
 */
export async function processSingleUnilevelYieldEvent(
  client: DatabaseClient,
  eventRow: UnilevelYieldEventRow
): Promise<SingleEventProcessingResult> {
  const sourceRoiScaled = parseAmountToScaledBigInt(eventRow.source_roi_usd);
  const sourceRoiStr = formatScaledBigInt(sourceRoiScaled);

  // Load 16-generation configuration
  const configsRes = await client.query<{
    generation_level: number;
    commission_pct: string;
    required_direct_active_referrals: number;
    required_personal_active_usd: string;
    is_active: boolean;
  }>(
    `
    SELECT
      generation_level,
      ROUND(commission_pct, 8)::text AS commission_pct,
      required_direct_active_referrals,
      ROUND(required_personal_active_usd, 8)::text AS required_personal_active_usd,
      is_active
    FROM unilevel_generation_configs
    WHERE generation_level BETWEEN 1 AND 16
    ORDER BY generation_level ASC
    `
  );

  const configByLevel = new Map<
    number,
    {
      generationLevel: number;
      commissionPctStr: string;
      commissionPctScaled: bigint;
      minDirects: number;
      minPersonalScaled: bigint;
      isActive: boolean;
    }
  >();

  let totalActivePctScaled = 0n;
  for (const row of configsRes.rows) {
    const level = Number(row.generation_level);
    const pctScaled = parseAmountToScaledBigInt(row.commission_pct);
    const minPersonalScaled = parseAmountToScaledBigInt(row.required_personal_active_usd);
    const isActive = Boolean(row.is_active);

    if (isActive) {
      totalActivePctScaled += pctScaled;
    }

    configByLevel.set(level, {
      generationLevel: level,
      commissionPctStr: formatScaledBigInt(pctScaled),
      commissionPctScaled: pctScaled,
      minDirects: Number(row.required_direct_active_referrals || 0),
      minPersonalScaled,
      isActive,
    });
  }

  if (totalActivePctScaled > MAX_TOTAL_GENERATION_COMMISSION_PCT_SCALED) {
    throw new Error(
      `UNILEVEL_CAP_VIOLATION: Active 16-generation commission sum (${formatScaledBigInt(
        totalActivePctScaled
      )}%) exceeds the 40.00000000% maximum cap.`
    );
  }

  // Determine asset-matched base yield amount (PHIVO coins for GENESIS_NODE; USDT for TRADING_POOL/CHRONO_VAULT)
  const isGenesis = eventRow.source_product_type === 'GENESIS_NODE';
  const baseYieldAmountStr =
    isGenesis && eventRow.raw_token_amount
      ? formatScaledBigInt(parseAmountToScaledBigInt(eventRow.raw_token_amount))
      : sourceRoiStr;
  const currency = isGenesis ? 'PHIVO' : 'USDT';

  // Max allowed total royalty in the event's matching payout currency = round8(baseYieldAmount * 40 / 100)
  const { yieldAmountScaled: maxTotalRoyaltyScaled } = calculateDailyYieldExact(
    baseYieldAmountStr,
    '40.00000000'
  );

  const visitedUserIds = new Set<string>([eventRow.source_user_id]);
  let currentChildUserId = eventRow.source_user_id;

  let ancestorsEvaluated = 0;
  let settledPayoutsCount = 0;
  let skippedLockedCount = 0;
  let duplicatePayoutsSkipped = 0;
  let totalRoyaltyDistributedScaled = 0n;

  for (let generationLevel = 1; generationLevel <= 16; generationLevel++) {
    // Find immediate sponsor of currentChildUserId
    const refRes = await client.query<{ sponsor_user_id: string | null }>(
      `
      SELECT sponsor_user_id
      FROM user_referrals
      WHERE user_id = $1
      LIMIT 1
      `,
      [currentChildUserId]
    );

    const sponsorUserId = refRes.rows[0]?.sponsor_user_id || null;
    if (!sponsorUserId) {
      break; // Reached top of sponsor tree
    }

    if (visitedUserIds.has(sponsorUserId)) {
      console.warn(
        `[RoiGenerationService] Cycle guard triggered at generation ${generationLevel} for sourceUser=${eventRow.source_user_id}, sponsor=${sponsorUserId}`
      );
      break;
    }
    visitedUserIds.add(sponsorUserId);
    currentChildUserId = sponsorUserId;

    const cfg = configByLevel.get(generationLevel);
    if (!cfg || !cfg.isActive || cfg.commissionPctScaled <= 0n) {
      continue;
    }

    ancestorsEvaluated++;

    // Evaluate ancestor's active personal investment and direct active sponsors
    const [ancestorActiveUsdStr, ancestorDirectActiveCount] = await Promise.all([
      getUserActiveInvestmentUsd(client, sponsorUserId),
      getUserDirectActiveSponsorsCount(client, sponsorUserId),
    ]);

    const ancestorActiveScaled = parseAmountToScaledBigInt(ancestorActiveUsdStr);
    const isUnlocked =
      ancestorActiveScaled >= cfg.minPersonalScaled &&
      ancestorDirectActiveCount >= cfg.minDirects;

    // STRICT NON-COMPRESSION (`SKIP_UNQUALIFIED`):
    // Ancestor at depth `generationLevel` is evaluated strictly against `generationLevel` rules.
    if (!isUnlocked) {
      const skippedPayoutId = uuidv4();
      const skipIns = await client.query<{ id: string }>(
        `
        INSERT INTO unilevel_royalty_payouts (
          id,
          beneficiary_user_id,
          source_user_id,
          generation_level,
          source_product_type,
          source_yield_id,
          epoch_date,
          source_yield_amount,
          commission_pct,
          royalty_amount,
          currency,
          status,
          ledger_entry_id,
          settled_at,
          created_at
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7::date,
          $8::numeric(20,8),
          $9::numeric(20,8),
          0.00000000,
          $10::varchar,
          'SKIPPED_LOCKED',
          NULL,
          NOW(),
          NOW()
        )
        ON CONFLICT (source_product_type, source_yield_id, beneficiary_user_id, generation_level) DO NOTHING
        RETURNING id
        `,
        [
          skippedPayoutId,
          sponsorUserId,
          eventRow.source_user_id,
          generationLevel,
          eventRow.source_product_type,
          eventRow.source_yield_id,
          eventRow.epoch_date,
          baseYieldAmountStr,
          cfg.commissionPctStr,
          currency,
        ]
      );

      if (skipIns.rowCount > 0) {
        skippedLockedCount++;
      } else {
        duplicatePayoutsSkipped++;
      }
      continue;
    }

    // Qualified ancestor: calculate exact NUMERIC(20,8) royalty = round8(base_amount * commission_pct / 100)
    const { yieldAmountStr: commissionAmountStr, yieldAmountScaled: commissionScaled } =
      calculateDailyYieldExact(baseYieldAmountStr, cfg.commissionPctStr);

    if (commissionScaled <= 0n) {
      continue;
    }

    if (totalRoyaltyDistributedScaled + commissionScaled > maxTotalRoyaltyScaled) {
      throw new Error(
        `UNILEVEL_PAYOUT_CAP_EXCEEDED: Distributed royalty would exceed 40% cap for event ${eventRow.id}.`
      );
    }

    const payoutId = uuidv4();
    const payoutIns = await client.query<{ id: string }>(
      `
      INSERT INTO unilevel_royalty_payouts (
        id,
        beneficiary_user_id,
        source_user_id,
        generation_level,
        source_product_type,
        source_yield_id,
        epoch_date,
        source_yield_amount,
        commission_pct,
        royalty_amount,
        currency,
        status,
        ledger_entry_id,
        settled_at,
        created_at
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7::date,
        $8::numeric(20,8),
        $9::numeric(20,8),
        $10::numeric(20,8),
        $11::varchar,
        'SETTLED',
        NULL,
        NOW(),
        NOW()
      )
      ON CONFLICT (source_product_type, source_yield_id, beneficiary_user_id, generation_level) DO NOTHING
      RETURNING id
      `,
      [
        payoutId,
        sponsorUserId,
        eventRow.source_user_id,
        generationLevel,
        eventRow.source_product_type,
        eventRow.source_yield_id,
        eventRow.epoch_date,
        baseYieldAmountStr,
        cfg.commissionPctStr,
        commissionAmountStr,
        currency,
      ]
    );

    if (payoutIns.rowCount === 0) {
      duplicatePayoutsSkipped++;
      continue;
    }

    // Lock beneficiary user row and credit respective wallet (PHIVO wallet or Main USDT wallet in financial_ledger_entries)
    await client.query(`SELECT id FROM users WHERE id = $1 FOR UPDATE`, [sponsorUserId]);

    const ledgerEntryId = uuidv4();
    const publicTxnId = generateLedgerTransactionPublicId();
    const sourceRef = `UNILEVEL-G${generationLevel}-${eventRow.epoch_date}`;
    const description = `16-Gen Unilevel Royalty (Gen ${generationLevel} @ ${Number(
      cfg.commissionPctStr
    ).toFixed(2)}% in ${currency} from ${eventRow.source_product_type} - ${eventRow.epoch_date})`;

    const ledgerIns = await client.query<{ id: string }>(
      `
      INSERT INTO financial_ledger_entries (
        id,
        public_txn_id,
        user_id,
        entry_type,
        source_type,
        source_id,
        source_ref,
        description,
        amount,
        currency,
        status,
        created_at
      )
      VALUES (
        $1,
        $2,
        $3,
        'CREDIT',
        'UNILEVEL_ROYALTY',
        $4,
        $5,
        $6,
        $7::numeric(20,8),
        $8::varchar,
        'SETTLED',
        NOW()
      )
      ON CONFLICT (source_type, source_id, entry_type) DO NOTHING
      RETURNING id
      `,
      [
        ledgerEntryId,
        publicTxnId,
        sponsorUserId,
        payoutId,
        sourceRef,
        description,
        commissionAmountStr,
        currency,
      ]
    );

    const finalLedgerId = ledgerIns.rowCount > 0 ? ledgerIns.rows[0].id : null;
    if (finalLedgerId) {
      await client.query(
        `UPDATE unilevel_royalty_payouts SET ledger_entry_id = $1 WHERE id = $2`,
        [finalLedgerId, payoutId]
      );
    }

    settledPayoutsCount++;
    totalRoyaltyDistributedScaled += commissionScaled;
  }

  // Final invariant assertion: total distributed commission <= 40% of source ROI
  if (totalRoyaltyDistributedScaled > maxTotalRoyaltyScaled) {
    throw new Error(
      `UNILEVEL_INVARIANT_VIOLATION: Total distributed royalty (${formatScaledBigInt(
        totalRoyaltyDistributedScaled
      )}) exceeded 40% cap (${formatScaledBigInt(maxTotalRoyaltyScaled)})`
    );
  }

  // Mark yield event as PROCESSED
  await client.query(
    `
    UPDATE unilevel_yield_events
    SET
      processing_status = 'PROCESSED',
      processed_at = NOW()
    WHERE id = $1
    `,
    [eventRow.id]
  );

  return {
    eventId: eventRow.id,
    sourceProductType: eventRow.source_product_type,
    sourceYieldId: eventRow.source_yield_id,
    sourceUserId: eventRow.source_user_id,
    epochDate: eventRow.epoch_date,
    sourceRoiUsd: sourceRoiStr,
    ancestorsEvaluated,
    settledPayoutsCount,
    skippedLockedCount,
    duplicatePayoutsSkipped,
    totalRoyaltyDistributedUsd: formatScaledBigInt(totalRoyaltyDistributedScaled),
  };
}

/**
 * Helper to record / update `ecosystem_yield_settlement_cycles` for `engine_type = 'UNILEVEL_ROYALTY'`.
 */
async function updateUnilevelRoyaltySettlementCycle(
  db: DatabaseClient,
  epochDate: string
): Promise<void> {
  const aggRes = await db.query<{
    events_count: string | number;
    total_source_yield: string;
    total_royalty: string;
  }>(
    `
    SELECT
      (SELECT COUNT(*)::int FROM unilevel_yield_events WHERE epoch_date = $1::date AND processing_status = 'PROCESSED') AS events_count,
      (SELECT ROUND(COALESCE(SUM(source_roi_usd), 0), 8)::text FROM unilevel_yield_events WHERE epoch_date = $1::date AND processing_status = 'PROCESSED') AS total_source_yield,
      (SELECT ROUND(COALESCE(SUM(royalty_amount), 0), 8)::text FROM unilevel_royalty_payouts WHERE epoch_date = $1::date AND status = 'SETTLED') AS total_royalty
    `,
    [epochDate]
  );

  const positionsProcessed = Number(aggRes.rows[0]?.events_count || 0);
  const totalYieldDistributed = aggRes.rows[0]?.total_source_yield || '0.00000000';
  const totalRoyaltyDistributed = aggRes.rows[0]?.total_royalty || '0.00000000';

  await db.query(
    `
    INSERT INTO ecosystem_yield_settlement_cycles (
      epoch_date,
      engine_type,
      status,
      positions_processed,
      total_yield_distributed,
      total_royalty_distributed,
      started_at,
      completed_at,
      created_at
    )
    VALUES (
      $1::date,
      'UNILEVEL_ROYALTY',
      'COMPLETED',
      $2,
      $3::numeric(20,8),
      $4::numeric(20,8),
      NOW(),
      NOW(),
      NOW()
    )
    ON CONFLICT (epoch_date, engine_type) DO UPDATE SET
      status = 'COMPLETED',
      positions_processed = EXCLUDED.positions_processed,
      total_yield_distributed = EXCLUDED.total_yield_distributed,
      total_royalty_distributed = EXCLUDED.total_royalty_distributed,
      completed_at = NOW(),
      error_message = NULL
    `,
    [epochDate, positionsProcessed, totalYieldDistributed, totalRoyaltyDistributed]
  );
}

/**
 * Batch Processor for `unilevel_yield_events`:
 * - Fetches `PENDING` rows ordered by `created_at ASC`.
 * - Inside per-event ACID transactions, locks each event row with `FOR UPDATE SKIP LOCKED`
 *   so concurrent workers can never double-process an event.
 * - Updates `ecosystem_yield_settlement_cycles` (`engine_type = 'UNILEVEL_ROYALTY'`) for all touched epoch dates.
 */
export async function processPendingUnilevelYieldEvents(
  limit = 200
): Promise<BatchUnilevelProcessingResult> {
  return withUnilevelBatchLock(async () => {
    const db = await getDb();
    const safeLimit = Math.min(1000, Math.max(1, Math.floor(Number(limit) || 200)));

    // Enforce Master Ecosystem Feature Switch: 16-Gen Unilevel Royalty Engine
    const royaltyEngineEnabled = await isFeatureSwitchEnabled('unilevel_royalty_engine_enabled', db);
    if (!royaltyEngineEnabled) {
      console.warn(
        '[RoiGenerationService] Paused by protocol governance (unilevel_royalty_engine_enabled = FALSE). Pending yield events remain queued safely.'
      );
      return {
        eventsClaimed: 0,
        eventsProcessed: 0,
        totalSettledPayoutsCount: 0,
        totalSkippedLockedCount: 0,
        totalDuplicatePayoutsSkipped: 0,
        totalRoyaltyDistributedUsd: '0.00000000',
        touchedEpochDates: [],
        completedAt: new Date().toISOString(),
      };
    }

    const candidateIdsRes = await db.query<{ id: string }>(
      `
      SELECT id
      FROM unilevel_yield_events
      WHERE processing_status = 'PENDING'
      ORDER BY created_at ASC, id ASC
      LIMIT $1
      `,
      [safeLimit]
    );

    let eventsProcessed = 0;
    let totalSettledPayoutsCount = 0;
    let totalSkippedLockedCount = 0;
    let totalDuplicatePayoutsSkipped = 0;
    let totalRoyaltyScaled = 0n;
    const touchedEpochDates = new Set<string>();

    for (const candidate of candidateIdsRes.rows) {
      const outcome = await db.transaction(async (trx) => {
        const lockedRes = await trx.query<UnilevelYieldEventRow>(
          `
          SELECT
            id,
            source_product_type,
            source_yield_id,
            source_user_id,
            epoch_date::text AS epoch_date,
            ROUND(source_roi_usd, 8)::text AS source_roi_usd,
            CASE WHEN raw_token_amount IS NULL THEN NULL ELSE ROUND(raw_token_amount, 8)::text END AS raw_token_amount,
            CASE WHEN token_reference_price_usd IS NULL THEN NULL ELSE ROUND(token_reference_price_usd, 8)::text END AS token_reference_price_usd,
            processing_status
          FROM unilevel_yield_events
          WHERE id = $1
            AND processing_status = 'PENDING'
          FOR UPDATE SKIP LOCKED
          `,
          [candidate.id]
        );

        if (lockedRes.rowCount === 0) {
          return null;
        }

        const eventRow = lockedRes.rows[0];
        return processSingleUnilevelYieldEvent(trx, eventRow);
      });

      if (outcome) {
        eventsProcessed++;
        totalSettledPayoutsCount += outcome.settledPayoutsCount;
        totalSkippedLockedCount += outcome.skippedLockedCount;
        totalDuplicatePayoutsSkipped += outcome.duplicatePayoutsSkipped;
        totalRoyaltyScaled += parseAmountToScaledBigInt(outcome.totalRoyaltyDistributedUsd);
        touchedEpochDates.add(outcome.epochDate);
      }
    }

    for (const epochDate of touchedEpochDates) {
      await updateUnilevelRoyaltySettlementCycle(db, epochDate).catch((err) => {
        console.warn('[RoiGenerationService] Notice updating settlement cycle:', err);
      });
    }

    return {
      eventsClaimed: candidateIdsRes.rowCount,
      eventsProcessed,
      totalSettledPayoutsCount,
      totalSkippedLockedCount,
      totalDuplicatePayoutsSkipped,
      totalRoyaltyDistributedUsd: formatScaledBigInt(totalRoyaltyScaled),
      touchedEpochDates: Array.from(touchedEpochDates).sort(),
      completedAt: new Date().toISOString(),
    };
  });
}

/**
 * Retrieves the complete 16-Generation Unilevel Royalty Overview for an authenticated user:
 * - `personalActiveInvestmentUsd` & product-line breakdown
 * - `directActiveSponsorsCount`
 * - Full 16-generation unlock matrix (`1..16` with unlocked/locked status, missing requirements, total earned per level, today's royalty, settled & skipped counts)
 * - Lifetime & today's royalty totals + product breakdown (`GENESIS_NODE`, `TRADING_POOL`, `CHRONO_VAULT`)
 * - Paginated recent `unilevel_royalty_payouts` history
 */
export async function getUserUnilevelRoyaltyOverview(
  userId: string,
  options?: { page?: number; limit?: number }
): Promise<UnilevelRoyaltyOverviewResponse> {
  const db = await getDb();
  const safePage = Math.max(1, Math.floor(Number(options?.page) || 1));
  const safeLimit = Math.min(100, Math.max(1, Math.floor(Number(options?.limit) || 25)));
  const offset = (safePage - 1) * safeLimit;
  const todayUtcStr = formatUtcDate(new Date());

  const [matrixEval, walletBal, levelStatsRes, productStatsRes, countRes, historyRes] =
    await Promise.all([
      evaluateUserGenerationMatrix(db, userId),
      getUserMainUsdtBalanceExact(userId, db),
      db.query<{
        generation_level: number;
        total_earned_usd: string;
        today_earned_usd: string;
        settled_count: string | number;
        skipped_locked_count: string | number;
      }>(
        `
        SELECT
          generation_level,
          ROUND(COALESCE(SUM(CASE WHEN status = 'SETTLED' THEN royalty_amount ELSE 0 END), 0), 8)::text AS total_earned_usd,
          ROUND(COALESCE(SUM(CASE WHEN status = 'SETTLED' AND epoch_date = $2::date THEN royalty_amount ELSE 0 END), 0), 8)::text AS today_earned_usd,
          COUNT(*) FILTER (WHERE status = 'SETTLED')::int AS settled_count,
          COUNT(*) FILTER (WHERE status = 'SKIPPED_LOCKED')::int AS skipped_locked_count
        FROM unilevel_royalty_payouts
        WHERE beneficiary_user_id = $1
        GROUP BY generation_level
        `,
        [userId, todayUtcStr]
      ),
      db.query<{
        source_product_type: UnilevelSourceProductType;
        total_usd: string;
      }>(
        `
        SELECT
          source_product_type,
          ROUND(COALESCE(SUM(royalty_amount), 0), 8)::text AS total_usd
        FROM unilevel_royalty_payouts
        WHERE beneficiary_user_id = $1 AND status = 'SETTLED'
        GROUP BY source_product_type
        `,
        [userId]
      ),
      db.query<{ total_count: string | number }>(
        `
        SELECT COUNT(*)::int AS total_count
        FROM unilevel_royalty_payouts
        WHERE beneficiary_user_id = $1
        `,
        [userId]
      ),
      db.query<{
        id: string;
        beneficiary_user_id: string;
        source_user_id: string;
        source_user_public_id: string | null;
        source_user_name: string | null;
        generation_level: number;
        source_product_type: UnilevelSourceProductType;
        source_yield_id: string;
        epoch_date: string;
        source_yield_amount: string;
        commission_pct: string;
        royalty_amount: string;
        currency: string;
        status: UnilevelRoyaltyStatus;
        ledger_entry_id: string | null;
        settled_at: Date;
        created_at: Date;
      }>(
        `
        SELECT
          urp.id,
          urp.beneficiary_user_id,
          urp.source_user_id,
          u.public_id AS source_user_public_id,
          u.full_name AS source_user_name,
          urp.generation_level,
          urp.source_product_type,
          urp.source_yield_id,
          urp.epoch_date::text AS epoch_date,
          ROUND(urp.source_yield_amount, 8)::text AS source_yield_amount,
          ROUND(urp.commission_pct, 8)::text AS commission_pct,
          ROUND(urp.royalty_amount, 8)::text AS royalty_amount,
          urp.currency,
          urp.status,
          urp.ledger_entry_id,
          urp.settled_at,
          urp.created_at
        FROM unilevel_royalty_payouts urp
        LEFT JOIN users u ON u.id = urp.source_user_id
        WHERE urp.beneficiary_user_id = $1
        ORDER BY urp.epoch_date DESC, urp.settled_at DESC, urp.generation_level ASC
        LIMIT $2 OFFSET $3
        `,
        [userId, safeLimit, offset]
      ),
    ]);

  const statsByLevel = new Map<
    number,
    {
      totalEarnedUsd: string;
      todayEarnedUsd: string;
      settledCount: number;
      skippedLockedCount: number;
    }
  >();

  let totalLifetimeScaled = 0n;
  let todayRoyaltyScaled = 0n;
  let totalSettledPayoutsCount = 0;
  let totalSkippedLockedCount = 0;

  for (const row of levelStatsRes.rows) {
    const lvl = Number(row.generation_level);
    const totalScaled = parseAmountToScaledBigInt(row.total_earned_usd);
    const todayScaled = parseAmountToScaledBigInt(row.today_earned_usd);
    const settledCnt = Number(row.settled_count || 0);
    const skippedCnt = Number(row.skipped_locked_count || 0);

    totalLifetimeScaled += totalScaled;
    todayRoyaltyScaled += todayScaled;
    totalSettledPayoutsCount += settledCnt;
    totalSkippedLockedCount += skippedCnt;

    statsByLevel.set(lvl, {
      totalEarnedUsd: formatScaledBigInt(totalScaled),
      todayEarnedUsd: formatScaledBigInt(todayScaled),
      settledCount: settledCnt,
      skippedLockedCount: skippedCnt,
    });
  }

  let genesisNodeRoyaltyScaled = 0n;
  let tradingPoolRoyaltyScaled = 0n;
  let chronoVaultRoyaltyScaled = 0n;

  for (const row of productStatsRes.rows) {
    const amtScaled = parseAmountToScaledBigInt(row.total_usd);
    if (row.source_product_type === 'GENESIS_NODE') {
      genesisNodeRoyaltyScaled += amtScaled;
    } else if (row.source_product_type === 'TRADING_POOL') {
      tradingPoolRoyaltyScaled += amtScaled;
    } else if (row.source_product_type === 'CHRONO_VAULT') {
      chronoVaultRoyaltyScaled += amtScaled;
    }
  }

  const generationMatrix: UnilevelGenerationMatrixRow[] = matrixEval.generations.map((g) => {
    const st = statsByLevel.get(g.generationLevel);
    return {
      ...g,
      totalEarnedUsd: st?.totalEarnedUsd || '0.00000000',
      todayEarnedUsd: st?.todayEarnedUsd || '0.00000000',
      settledCount: st?.settledCount || 0,
      skippedLockedCount: st?.skippedLockedCount || 0,
    };
  });

  const totalCount = Number(countRes.rows[0]?.total_count || 0);
  const totalPages = Math.max(1, Math.ceil(totalCount / safeLimit));

  const items: UnilevelRoyaltyPayoutRecord[] = historyRes.rows.map((r) => ({
    id: r.id,
    beneficiaryUserId: r.beneficiary_user_id,
    sourceUserId: r.source_user_id,
    sourceUserPublicId: r.source_user_public_id,
    sourceUserName: r.source_user_name,
    generationLevel: Number(r.generation_level),
    sourceProductType: r.source_product_type,
    sourceYieldId: r.source_yield_id,
    epochDate: r.epoch_date,
    sourceYieldAmount: r.source_yield_amount,
    commissionPct: r.commission_pct,
    royaltyAmount: r.royalty_amount,
    currency: r.currency,
    status: r.status,
    ledgerEntryId: r.ledger_entry_id,
    settledAt: new Date(r.settled_at).toISOString(),
    createdAt: new Date(r.created_at).toISOString(),
  }));

  return {
    personalActiveInvestmentUsd: matrixEval.personalActiveInvestmentUsd,
    activeBreakdown: matrixEval.activeBreakdown,
    directActiveSponsorsCount: matrixEval.directActiveSponsorsCount,
    unlockedGenerationsCount: matrixEval.unlockedGenerationsCount,
    maxGenerations: 16,
    totalConfiguredCommissionPct: matrixEval.totalConfiguredCommissionPct,
    mainUsdtWalletBalance: walletBal.availableBalanceStr,
    totalLifetimeRoyaltyUsd: formatScaledBigInt(totalLifetimeScaled),
    todayRoyaltyUsd: formatScaledBigInt(todayRoyaltyScaled),
    totalSettledPayoutsCount,
    totalSkippedLockedCount,
    byProductBreakdown: {
      genesisNodeRoyaltyUsd: formatScaledBigInt(genesisNodeRoyaltyScaled),
      tradingPoolRoyaltyUsd: formatScaledBigInt(tradingPoolRoyaltyScaled),
      chronoVaultRoyaltyUsd: formatScaledBigInt(chronoVaultRoyaltyScaled),
    },
    generationMatrix,
    payoutHistory: {
      items,
      pagination: {
        page: safePage,
        limit: safeLimit,
        totalCount,
        totalPages,
      },
    },
  };
}

let unilevelRoyaltySchedulerStarted = false;
let unilevelRoyaltyIntervalHandle: NodeJS.Timeout | null = null;

/**
 * Starts the automated 16-Generation Unilevel ROI-on-ROI Outbox Processor.
 * - Executes an immediate startup sweep for any `PENDING` rows in `unilevel_yield_events`.
 * - Runs a 60-second background sweep interval (guarded by `withUnilevelBatchLock` and `FOR UPDATE SKIP LOCKED`).
 */
export function startUnilevelRoyaltyScheduler(): void {
  if (unilevelRoyaltySchedulerStarted) return;
  unilevelRoyaltySchedulerStarted = true;

  const runSweep = async () => {
    try {
      await processPendingUnilevelYieldEvents(200);
    } catch (err) {
      console.error('[UnilevelRoyaltyScheduler] Error processing pending yield events:', err);
    }
  };

  runSweep().catch((err) =>
    console.error('[UnilevelRoyaltyScheduler] Initial sweep error:', err)
  );

  unilevelRoyaltyIntervalHandle = setInterval(() => {
    runSweep().catch((err) =>
      console.error('[UnilevelRoyaltyScheduler] Interval sweep error:', err)
    );
  }, 60_000);

  if (
    unilevelRoyaltyIntervalHandle &&
    typeof unilevelRoyaltyIntervalHandle.unref === 'function'
  ) {
    unilevelRoyaltyIntervalHandle.unref();
  }

  console.log(
    '[UnilevelRoyaltyScheduler] 16-Generation Unilevel ROI-on-ROI outbox processor initialized.'
  );
}
