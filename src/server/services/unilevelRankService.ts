import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { getDb, DatabaseClient } from '../db/db';
import { generateLedgerTransactionPublicId } from '../utils/idGenerator';
import {
  parseAmountToScaledBigInt,
  formatScaledBigInt,
  calculateDailyYieldExact,
  getUserMainUsdtBalanceExact,
  DECIMAL_SCALE,
} from './tradingPoolService';
import { getUserActiveInvestmentBreakdownUsd } from './roiGenerationService';
import { getNodeBasePriceUsd } from './economicService';
import { isFeatureSwitchEnabled } from './unilevelConfigService';

export type UnilevelRankCode =
  | 'INITIATE_MEMBER'
  | 'QUANTUM_ARCHITECT'
  | 'APEX_STRATEGIST'
  | 'VANGUARD_COMMANDER'
  | 'SOVEREIGN_MARSHAL'
  | 'GLOBAL_AMBASSADOR'
  | 'TITAN_APEX_SOVEREIGN';

export interface UnilevelRankConfigRow {
  id: string;
  rankLevel: number;
  rankCode: UnilevelRankCode;
  rankName: string;
  requiredPersonalVolumeUsd: string;
  requiredPersonalVolumeScaled: bigint;
  requiredTeamVolumeUsd: string;
  requiredTeamVolumeScaled: bigint;
  maxSingleLegCapPct: string;
  maxSingleLegCapPctScaled: bigint;
  perLegCapUsd: string;
  perLegCapScaled: bigint;
  requiredDirectActiveLegs: number;
  requiredSubRankCode: UnilevelRankCode | null;
  requiredSubRankLevel: number | null;
  requiredSubRankLegs: number;
  milestoneBonusUsd: string;
  milestoneBonusScaled: bigint;
  globalPoolSharePct: string;
  rewardDescription: string | null;
  isActive: boolean;
}

export interface DirectLegBreakdownItem {
  legIndex: number;
  rootUserId: string;
  rootUserPublicId: string;
  rootUserFullName: string;
  rootPersonalActiveUsd: string;
  downlineSubtreeActiveUsd: string;
  rawLegVolumeUsd: string;
  rawLegVolumeScaled: bigint;
  cappedLegVolumeUsd: string;
  cappedLegVolumeScaled: bigint;
  perLegCapUsd: string;
  isCapped: boolean;
  overflowVolumeUsd: string;
  contributionPctOfTarget: string;
  highestRankInLeg: number;
  highestRankCodeInLeg: UnilevelRankCode;
  highestRankNameInLeg: string;
  memberCountInLeg: number;
  activeMemberCountInLeg: number;
  rankCountsInLeg: Record<number, number>;
}

export interface RankLadderProgressItem {
  rankId: string;
  rankLevel: number;
  rankCode: UnilevelRankCode;
  rankName: string;
  requiredPersonalVolumeUsd: string;
  requiredTeamVolumeUsd: string;
  maxSingleLegCapPct: string;
  perLegCapUsd: string;
  requiredDirectActiveLegs: number;
  requiredSubRankCode: UnilevelRankCode | null;
  requiredSubRankLevel: number | null;
  requiredSubRankLegs: number;
  milestoneBonusUsd: string;
  globalPoolSharePct: string;
  rewardDescription: string | null;
  isAchieved: boolean;
  isCurrentRank: boolean;
  isNextTargetRank: boolean;
  meetsPersonalVolume: boolean;
  meetsTeamVolume: boolean;
  meetsDirectActiveLegs: boolean;
  meetsSubRankLegs: boolean;
  qualifiesNow: boolean;
  qualifiedTeamVolumeUsd: string;
  missingPersonalVolumeUsd: string;
  missingTeamVolumeUsd: string;
  qualifyingSubRankDistinctLegsCount: number;
  missingSubRankLegs: number;
  progressPct: string;
  awardedAt: string | null;
  milestonePayoutId: string | null;
  ledgerEntryId: string | null;
}

export interface RankMilestonePayoutRecord {
  id: string;
  userId: string;
  rankId: string;
  rankLevel: number;
  rankCode: UnilevelRankCode;
  rankName: string;
  qualifiedTeamVolumeUsd: string;
  bonusAmountUsd: string;
  ledgerEntryId: string | null;
  awardedAt: string;
  createdAt: string;
}

export interface PromotedRankMilestoneSummary {
  rankLevel: number;
  rankCode: UnilevelRankCode;
  rankName: string;
  qualifiedTeamVolumeUsd: string;
  bonusAmountUsd: string;
  milestonePayoutId: string;
  ledgerEntryId: string | null;
}

export interface CascadedAncestorPromotionSummary {
  ancestorUserId: string;
  previousRankLevel: number;
  previousRankCode: UnilevelRankCode;
  newRankLevel: number;
  newRankCode: UnilevelRankCode;
  newlyPromotedRanks: PromotedRankMilestoneSummary[];
  totalBonusCreditedUsd: string;
}

export interface SingleUserRankEvaluationResult {
  userId: string;
  previousRankLevel: number;
  previousRankCode: UnilevelRankCode;
  currentRankLevel: number;
  currentRankCode: UnilevelRankCode;
  currentRankName: string;
  promoted: boolean;
  newlyPromotedRanks: PromotedRankMilestoneSummary[];
  totalBonusCreditedUsd: string;
  personalActiveInvestmentUsd: string;
  rawTeamVolumeUsd: string;
  qualifiedTeamVolumeUsd: string;
  strongestLegVolumeUsd: string;
  otherLegsVolumeUsd: string;
  perLegCapUsd: string;
  referenceVolumeRankLevel: number;
  directLegsCount: number;
  activeDirectLegsCount: number;
  directLegs: Omit<DirectLegBreakdownItem, 'rawLegVolumeScaled' | 'cappedLegVolumeScaled'>[];
  cascadedAncestorPromotions: CascadedAncestorPromotionSummary[];
  evaluatedAt: string;
}

export interface UnilevelRankOverviewResponse {
  userId: string;
  currentRank: {
    rankLevel: number;
    rankCode: UnilevelRankCode;
    rankName: string;
    milestoneBonusUsd: string;
    globalPoolSharePct: string;
    rewardDescription: string | null;
    promotedAt: string | null;
    lastEvaluatedAt: string | null;
  };
  nextTargetRank: RankLadderProgressItem | null;
  personalActiveInvestmentUsd: string;
  activeBreakdown: {
    tradingPoolActiveUsd: string;
    chronoVaultActiveUsd: string;
    genesisNodeActiveUsd: string;
    activeNodesCount: number;
  };
  teamVolumeSummary: {
    rawTeamVolumeUsd: string;
    qualifiedTeamVolumeUsd: string;
    nextRankQualifiedTeamVolumeUsd: string;
    nextRankRequiredTeamVolumeUsd: string;
    nextRankPerLegCapUsd: string;
    maxSingleLegCapPct: string;
    strongestLegVolumeUsd: string;
    otherLegsVolumeUsd: string;
    directLegsCount: number;
    activeDirectLegsCount: number;
  };
  directLegs: Omit<DirectLegBreakdownItem, 'rawLegVolumeScaled' | 'cappedLegVolumeScaled'>[];
  rankLadder: RankLadderProgressItem[];
  milestonePayouts: RankMilestonePayoutRecord[];
  totalMilestoneBonusEarnedUsd: string;
  mainUsdtWalletBalance: string;
}

const RANK_NAME_BY_LEVEL: Record<number, { code: UnilevelRankCode; name: string }> = {
  0: { code: 'INITIATE_MEMBER', name: 'Initiate Member' },
  1: { code: 'QUANTUM_ARCHITECT', name: 'Quantum Architect' },
  2: { code: 'APEX_STRATEGIST', name: 'Apex Strategist' },
  3: { code: 'VANGUARD_COMMANDER', name: 'Vanguard Commander' },
  4: { code: 'SOVEREIGN_MARSHAL', name: 'Sovereign Marshal' },
  5: { code: 'GLOBAL_AMBASSADOR', name: 'Global Ambassador' },
  6: { code: 'TITAN_APEX_SOVEREIGN', name: 'Titan Apex Sovereign' },
};

/**
 * Loads all 7 canonical Unilevel Leadership Ranks (`0..6`) from `unilevel_leadership_ranks`
 * and resolves `requiredSubRankLevel` and exact `perLegCapUsd = round8(requiredTeamVolume * maxSingleLegCapPct / 100)`.
 */
export async function getLeadershipRanksConfig(
  client?: DatabaseClient
): Promise<UnilevelRankConfigRow[]> {
  const db = client || (await getDb());

  const res = await db.query<{
    id: string;
    rank_level: number;
    rank_code: UnilevelRankCode;
    rank_name: string;
    required_personal_volume_usd: string;
    required_team_volume_usd: string;
    max_single_leg_cap_pct: string;
    required_direct_active_legs: number;
    required_sub_rank_code: UnilevelRankCode | null;
    required_sub_rank_legs: number;
    milestone_bonus_usd: string;
    global_pool_share_pct: string;
    reward_description: string | null;
    is_active: boolean;
  }>(
    `
    SELECT
      id,
      rank_level,
      rank_code,
      rank_name,
      ROUND(required_personal_volume_usd, 8)::text AS required_personal_volume_usd,
      ROUND(required_team_volume_usd, 8)::text AS required_team_volume_usd,
      ROUND(max_single_leg_cap_pct, 8)::text AS max_single_leg_cap_pct,
      required_direct_active_legs,
      required_sub_rank_code,
      required_sub_rank_legs,
      ROUND(milestone_bonus_usd, 8)::text AS milestone_bonus_usd,
      ROUND(global_pool_share_pct, 8)::text AS global_pool_share_pct,
      reward_description,
      is_active
    FROM unilevel_leadership_ranks
    WHERE rank_level BETWEEN 0 AND 6
    ORDER BY rank_level ASC
    `
  );

  const codeToLevel = new Map<string, number>();
  for (const row of res.rows) {
    codeToLevel.set(row.rank_code, Number(row.rank_level));
  }

  return res.rows.map((row) => {
    const reqPersonalScaled = parseAmountToScaledBigInt(row.required_personal_volume_usd);
    const reqTeamScaled = parseAmountToScaledBigInt(row.required_team_volume_usd);
    const capPctScaled = parseAmountToScaledBigInt(row.max_single_leg_cap_pct);
    const bonusScaled = parseAmountToScaledBigInt(row.milestone_bonus_usd);

    const { yieldAmountStr: perLegCapUsd, yieldAmountScaled: perLegCapScaled } =
      reqTeamScaled > 0n
        ? calculateDailyYieldExact(
            formatScaledBigInt(reqTeamScaled),
            formatScaledBigInt(capPctScaled)
          )
        : { yieldAmountStr: '0.00000000', yieldAmountScaled: 0n };

    const subRankCode = row.required_sub_rank_code || null;
    const subRankLevel =
      subRankCode && codeToLevel.has(subRankCode) ? codeToLevel.get(subRankCode)! : null;

    return {
      id: row.id,
      rankLevel: Number(row.rank_level),
      rankCode: row.rank_code,
      rankName: row.rank_name,
      requiredPersonalVolumeUsd: formatScaledBigInt(reqPersonalScaled),
      requiredPersonalVolumeScaled: reqPersonalScaled,
      requiredTeamVolumeUsd: formatScaledBigInt(reqTeamScaled),
      requiredTeamVolumeScaled: reqTeamScaled,
      maxSingleLegCapPct: formatScaledBigInt(capPctScaled),
      maxSingleLegCapPctScaled: capPctScaled,
      perLegCapUsd,
      perLegCapScaled,
      requiredDirectActiveLegs: Number(row.required_direct_active_legs || 0),
      requiredSubRankCode: subRankCode,
      requiredSubRankLevel: subRankLevel,
      requiredSubRankLegs: Number(row.required_sub_rank_legs || 0),
      milestoneBonusUsd: formatScaledBigInt(bonusScaled),
      milestoneBonusScaled: bonusScaled,
      globalPoolSharePct: formatScaledBigInt(parseAmountToScaledBigInt(row.global_pool_share_pct)),
      rewardDescription: row.reward_description || null,
      isActive: Boolean(row.is_active),
    };
  });
}

/**
 * Pure exact-decimal helper computing the 40% Anti-Single-Leg Cap against a given
 * `requiredTeamVolumeUsd` and `maxSingleLegCapPct` (canonical `40.00000000%`):
 * - `perLegCapUsd = round8(requiredTeamVolume * maxSingleLegCapPct / 100)`
 * - `countedLegVolume_i = min(legVolumeUsd_i, perLegCapUsd)`
 * - `totalQualifyingVolumeUsd = sum(countedLegVolume_i across all direct legs)`
 */
export function computeCappedTeamVolumeForRank(
  legs: Array<{ rawLegVolumeScaled: bigint }>,
  requiredTeamVolumeUsd: string,
  maxSingleLegCapPct = '40.00000000'
): {
  perLegCapUsd: string;
  perLegCapScaled: bigint;
  totalQualifyingVolumeUsd: string;
  totalQualifyingVolumeScaled: bigint;
  meetsTeamVolume: boolean;
  missingTeamVolumeUsd: string;
  perLegCountedScaled: bigint[];
} {
  const reqTeamScaled = parseAmountToScaledBigInt(requiredTeamVolumeUsd);
  const capPctScaled = parseAmountToScaledBigInt(maxSingleLegCapPct);

  if (reqTeamScaled <= 0n) {
    let rawSumScaled = 0n;
    const perLegCountedScaled: bigint[] = [];
    for (const leg of legs) {
      rawSumScaled += leg.rawLegVolumeScaled;
      perLegCountedScaled.push(leg.rawLegVolumeScaled);
    }
    return {
      perLegCapUsd: '0.00000000',
      perLegCapScaled: 0n,
      totalQualifyingVolumeUsd: formatScaledBigInt(rawSumScaled),
      totalQualifyingVolumeScaled: rawSumScaled,
      meetsTeamVolume: true,
      missingTeamVolumeUsd: '0.00000000',
      perLegCountedScaled,
    };
  }

  const { yieldAmountStr: perLegCapUsd, yieldAmountScaled: perLegCapScaled } =
    calculateDailyYieldExact(formatScaledBigInt(reqTeamScaled), formatScaledBigInt(capPctScaled));

  let totalQualifyingVolumeScaled = 0n;
  const perLegCountedScaled: bigint[] = [];

  for (const leg of legs) {
    const countedScaled =
      leg.rawLegVolumeScaled < perLegCapScaled ? leg.rawLegVolumeScaled : perLegCapScaled;
    perLegCountedScaled.push(countedScaled);
    totalQualifyingVolumeScaled += countedScaled;
  }

  const meetsTeamVolume = totalQualifyingVolumeScaled >= reqTeamScaled;
  const missingTeamScaled =
    reqTeamScaled > totalQualifyingVolumeScaled
      ? reqTeamScaled - totalQualifyingVolumeScaled
      : 0n;

  return {
    perLegCapUsd,
    perLegCapScaled,
    totalQualifyingVolumeUsd: formatScaledBigInt(totalQualifyingVolumeScaled),
    totalQualifyingVolumeScaled,
    meetsTeamVolume,
    missingTeamVolumeUsd: formatScaledBigInt(missingTeamScaled),
    perLegCountedScaled,
  };
}

/**
 * Decomposes a user's direct referrals (`user_referrals.sponsor_user_id = userId`) into distinct Direct Legs,
 * traverses each leg's entire downline subtree via cycle-safe BFS, and computes:
 * 1. `rawLegVolumeUsd`: sum of active `user_trading_positions.principal_amount`, active `user_vault_positions.principal_amount`,
 *    and active `nodes` (`COALESCE(purchase_price_usd, getNodeBasePriceUsd())`) for the direct referral + all members in that leg's subtree.
 *    (Personal volume of `userId` himself is strictly excluded from `rawLegVolumeUsd`.)
 * 2. `highestRankInLeg`: maximum achieved `rank_level` among all members in that leg's subtree.
 * 3. `cappedLegVolumeUsd` & `isCapped` against the specified `referenceTeamVolumeUsd` and `referenceCapPct` (`40.00000000%`).
 */
export async function decomposeUserDirectLegs(
  client: DatabaseClient,
  userId: string,
  referenceTeamVolumeUsd = '25000.00000000',
  referenceCapPct = '40.00000000'
): Promise<{
  directLegs: DirectLegBreakdownItem[];
  rawTeamVolumeUsd: string;
  rawTeamVolumeScaled: bigint;
  qualifiedTeamVolumeUsd: string;
  qualifiedTeamVolumeScaled: bigint;
  perLegCapUsd: string;
  perLegCapScaled: bigint;
  strongestLegVolumeUsd: string;
  otherLegsVolumeUsd: string;
  directLegsCount: number;
  activeDirectLegsCount: number;
}> {
  const nodeBasePrice = await getNodeBasePriceUsd(client).catch(() => 1000);
  const defaultNodePriceStr = formatScaledBigInt(parseAmountToScaledBigInt(nodeBasePrice));

  // Fetch all direct referrals of userId
  const directsRes = await client.query<{
    user_id: string;
    public_id: string;
    full_name: string;
    created_at: Date;
  }>(
    `
    SELECT
      ur.user_id,
      u.public_id,
      u.full_name,
      ur.created_at
    FROM user_referrals ur
    JOIN users u ON u.id = ur.user_id
    WHERE ur.sponsor_user_id = $1
    ORDER BY ur.created_at ASC, u.public_id ASC
    `,
    [userId]
  );

  const globalVisited = new Set<string>([userId]);
  const rawLegsData: Array<{
    rootUserId: string;
    rootUserPublicId: string;
    rootUserFullName: string;
    rootPersonalActiveScaled: bigint;
    downlineSubtreeActiveScaled: bigint;
    rawLegVolumeScaled: bigint;
    highestRankInLeg: number;
    memberCountInLeg: number;
    activeMemberCountInLeg: number;
    rankCountsInLeg: Record<number, number>;
  }> = [];

  for (const directRoot of directsRes.rows) {
    if (globalVisited.has(directRoot.user_id)) {
      continue;
    }
    globalVisited.add(directRoot.user_id);

    // Cycle-safe BFS to gather all members in this direct leg's subtree
    const legMemberIds: string[] = [directRoot.user_id];
    let frontier: string[] = [directRoot.user_id];

    while (frontier.length > 0) {
      const childrenRes = await client.query<{ user_id: string }>(
        `
        SELECT ur.user_id
        FROM user_referrals ur
        WHERE ur.sponsor_user_id = ANY($1::uuid[])
        ORDER BY ur.created_at ASC, ur.user_id ASC
        `,
        [frontier]
      );

      const nextFrontier: string[] = [];
      for (const child of childrenRes.rows) {
        if (!globalVisited.has(child.user_id)) {
          globalVisited.add(child.user_id);
          legMemberIds.push(child.user_id);
          nextFrontier.push(child.user_id);
        }
      }
      frontier = nextFrontier;
    }

    // Query active investment principal and achieved rank for all members in this leg
    const membersMetricsRes = await client.query<{
      user_id: string;
      trading_usd: string;
      vault_usd: string;
      node_usd: string;
      achieved_rank_level: number;
    }>(
      `
      SELECT
        u.id AS user_id,
        COALESCE(
          (SELECT ROUND(COALESCE(SUM(utp.principal_amount), 0), 8)::text
           FROM user_trading_positions utp
           WHERE utp.user_id = u.id AND utp.status = 'ACTIVE'),
          '0.00000000'
        ) AS trading_usd,
        COALESCE(
          (SELECT ROUND(COALESCE(SUM(uvp.principal_amount), 0), 8)::text
           FROM user_vault_positions uvp
           WHERE uvp.user_id = u.id AND uvp.status = 'ACTIVE'),
          '0.00000000'
        ) AS vault_usd,
        COALESCE(
          (SELECT ROUND(COALESCE(SUM(COALESCE(n.purchase_price_usd, $2::numeric(20,8))), 0), 8)::text
           FROM nodes n
           WHERE n.owner_user_id = u.id AND n.status IN ('ACTIVE', 'EMITTING')),
          '0.00000000'
        ) AS node_usd,
        GREATEST(
          COALESCE(uur.current_rank_level, 0),
          COALESCE(
            (SELECT MAX(urmp.rank_level)
             FROM unilevel_rank_milestone_payouts urmp
             WHERE urmp.user_id = u.id),
            0
          )
        )::int AS achieved_rank_level
      FROM users u
      LEFT JOIN user_unilevel_ranks uur ON uur.user_id = u.id
      WHERE u.id = ANY($1::uuid[])
      `,
      [legMemberIds, defaultNodePriceStr]
    );

    let rootPersonalActiveScaled = 0n;
    let rawLegVolumeScaled = 0n;
    let highestRankInLeg = 0;
    let activeMemberCountInLeg = 0;
    const rankCountsInLeg: Record<number, number> = {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
      6: 0,
    };

    for (const m of membersMetricsRes.rows) {
      const mTrading = parseAmountToScaledBigInt(m.trading_usd || '0');
      const mVault = parseAmountToScaledBigInt(m.vault_usd || '0');
      const mNode = parseAmountToScaledBigInt(m.node_usd || '0');
      const mTotalScaled = mTrading + mVault + mNode;

      rawLegVolumeScaled += mTotalScaled;
      if (m.user_id === directRoot.user_id) {
        rootPersonalActiveScaled = mTotalScaled;
      }
      if (mTotalScaled > 0n) {
        activeMemberCountInLeg++;
      }

      const memberRank = Math.min(6, Math.max(0, Number(m.achieved_rank_level || 0)));
      if (memberRank > highestRankInLeg) {
        highestRankInLeg = memberRank;
      }
      for (let r = 1; r <= 6; r++) {
        if (memberRank >= r) {
          rankCountsInLeg[r] = (rankCountsInLeg[r] || 0) + 1;
        }
      }
    }

    const downlineSubtreeActiveScaled =
      rawLegVolumeScaled > rootPersonalActiveScaled
        ? rawLegVolumeScaled - rootPersonalActiveScaled
        : 0n;

    rawLegsData.push({
      rootUserId: directRoot.user_id,
      rootUserPublicId: directRoot.public_id,
      rootUserFullName: directRoot.full_name,
      rootPersonalActiveScaled,
      downlineSubtreeActiveScaled,
      rawLegVolumeScaled,
      highestRankInLeg,
      memberCountInLeg: legMemberIds.length,
      activeMemberCountInLeg,
      rankCountsInLeg,
    });
  }

  // Sort direct legs by rawLegVolumeScaled DESC so strongest leg is first
  rawLegsData.sort((a, b) => {
    if (b.rawLegVolumeScaled !== a.rawLegVolumeScaled) {
      return b.rawLegVolumeScaled > a.rawLegVolumeScaled ? 1 : -1;
    }
    if (b.highestRankInLeg !== a.highestRankInLeg) {
      return b.highestRankInLeg - a.highestRankInLeg;
    }
    return a.rootUserPublicId.localeCompare(b.rootUserPublicId);
  });

  const capEval = computeCappedTeamVolumeForRank(
    rawLegsData,
    referenceTeamVolumeUsd,
    referenceCapPct
  );
  const referenceTargetScaled = parseAmountToScaledBigInt(referenceTeamVolumeUsd);

  let rawTeamVolumeScaled = 0n;
  let strongestLegScaled = 0n;
  let activeDirectLegsCount = 0;

  const directLegs: DirectLegBreakdownItem[] = rawLegsData.map((leg, idx) => {
    rawTeamVolumeScaled += leg.rawLegVolumeScaled;
    if (idx === 0) {
      strongestLegScaled = leg.rawLegVolumeScaled;
    }
    if (leg.rawLegVolumeScaled > 0n || leg.highestRankInLeg > 0) {
      activeDirectLegsCount++;
    }

    const cappedScaled = capEval.perLegCountedScaled[idx] ?? leg.rawLegVolumeScaled;
    const isCapped =
      capEval.perLegCapScaled > 0n && leg.rawLegVolumeScaled > capEval.perLegCapScaled;
    const overflowScaled = isCapped ? leg.rawLegVolumeScaled - capEval.perLegCapScaled : 0n;

    // Contribution % of target volume (in 8 decimals)
    let contributionPctStr = '0.00000000';
    if (referenceTargetScaled > 0n && cappedScaled > 0n) {
      const pctScaled =
        (cappedScaled * 100n * DECIMAL_SCALE + referenceTargetScaled / 2n) / referenceTargetScaled;
      contributionPctStr = formatScaledBigInt(pctScaled);
    }

    const highestRankMeta = RANK_NAME_BY_LEVEL[leg.highestRankInLeg] || RANK_NAME_BY_LEVEL[0];

    return {
      legIndex: idx + 1,
      rootUserId: leg.rootUserId,
      rootUserPublicId: leg.rootUserPublicId,
      rootUserFullName: leg.rootUserFullName,
      rootPersonalActiveUsd: formatScaledBigInt(leg.rootPersonalActiveScaled),
      downlineSubtreeActiveUsd: formatScaledBigInt(leg.downlineSubtreeActiveScaled),
      rawLegVolumeUsd: formatScaledBigInt(leg.rawLegVolumeScaled),
      rawLegVolumeScaled: leg.rawLegVolumeScaled,
      cappedLegVolumeUsd: formatScaledBigInt(cappedScaled),
      cappedLegVolumeScaled: cappedScaled,
      perLegCapUsd: capEval.perLegCapUsd,
      isCapped,
      overflowVolumeUsd: formatScaledBigInt(overflowScaled),
      contributionPctOfTarget: contributionPctStr,
      highestRankInLeg: leg.highestRankInLeg,
      highestRankCodeInLeg: highestRankMeta.code,
      highestRankNameInLeg: highestRankMeta.name,
      memberCountInLeg: leg.memberCountInLeg,
      activeMemberCountInLeg: leg.activeMemberCountInLeg,
      rankCountsInLeg: leg.rankCountsInLeg,
    };
  });

  const otherLegsScaled =
    rawTeamVolumeScaled > strongestLegScaled ? rawTeamVolumeScaled - strongestLegScaled : 0n;

  return {
    directLegs,
    rawTeamVolumeUsd: formatScaledBigInt(rawTeamVolumeScaled),
    rawTeamVolumeScaled,
    qualifiedTeamVolumeUsd: capEval.totalQualifyingVolumeUsd,
    qualifiedTeamVolumeScaled: capEval.totalQualifyingVolumeScaled,
    perLegCapUsd: capEval.perLegCapUsd,
    perLegCapScaled: capEval.perLegCapScaled,
    strongestLegVolumeUsd: formatScaledBigInt(strongestLegScaled),
    otherLegsVolumeUsd: formatScaledBigInt(otherLegsScaled),
    directLegsCount: directLegs.length,
    activeDirectLegsCount,
  };
}

/**
 * Internal helper that evaluates and promotes a single user inside an atomic PostgreSQL transaction
 * (`FOR UPDATE` row lock on `user_unilevel_ranks` and `users`).
 * - Initializes Rank 0 (`INITIATE_MEMBER`) if no row exists.
 * - Evaluates sequentially from `currentRankLevel + 1` up to `6` (**No Rank Skipping**).
 * - Inserts milestone payouts with `ON CONFLICT (user_id, rank_level) DO NOTHING`.
 * - Credits cash reward (`milestone_bonus_usd`) to the user's Main USDT Wallet (`SETTLED` `CREDIT` in `financial_ledger_entries` with `source_type = 'LEADERSHIP_RANK_REWARD'`).
 */
async function evaluateAndPromoteSingleUserInternal(
  userId: string
): Promise<SingleUserRankEvaluationResult> {
  const db = await getDb();

  return db.transaction(async (trx) => {
    // 1. Verify user exists and lock user rank state
    const userCheck = await trx.query<{ id: string }>(
      `SELECT id FROM users WHERE id = $1`,
      [userId]
    );
    if (userCheck.rowCount === 0) {
      const err: any = new Error(`USER_NOT_FOUND: User '${userId}' does not exist.`);
      err.code = 'USER_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }

    // Ensure baseline Rank 0 (INITIATE_MEMBER) row exists
    await trx.query(
      `
      INSERT INTO user_unilevel_ranks (
        user_id,
        current_rank_level,
        current_rank_code,
        personal_active_volume_usd,
        raw_team_volume_usd,
        qualified_team_volume_usd,
        strongest_leg_volume_usd,
        other_legs_volume_usd,
        last_evaluated_at,
        created_at,
        updated_at
      )
      VALUES ($1, 0, 'INITIATE_MEMBER', 0, 0, 0, 0, 0, NOW(), NOW(), NOW())
      ON CONFLICT (user_id) DO NOTHING
      `,
      [userId]
    );

    // Lock user's rank row FOR UPDATE
    const rankRowRes = await trx.query<{
      user_id: string;
      current_rank_level: number;
      current_rank_code: UnilevelRankCode;
    }>(
      `
      SELECT user_id, current_rank_level, current_rank_code
      FROM user_unilevel_ranks
      WHERE user_id = $1
      FOR UPDATE
      `,
      [userId]
    );

    const previousRankLevel = Number(rankRowRes.rows[0]?.current_rank_level || 0);
    const previousRankCode =
      (rankRowRes.rows[0]?.current_rank_code as UnilevelRankCode) || 'INITIATE_MEMBER';

    // 2. Load 7-stage rank definitions (0..6) and user's personal active investment + direct leg decomposition sequentially on trx client
    const rankConfigs = await getLeadershipRanksConfig(trx);
    const personalBreakdown = await getUserActiveInvestmentBreakdownUsd(trx, userId);
    const initialLegDecomp = await decomposeUserDirectLegs(
      trx,
      userId,
      '25000.00000000',
      '40.00000000'
    );

    const rankByLevel = new Map<number, UnilevelRankConfigRow>();
    for (const r of rankConfigs) {
      rankByLevel.set(r.rankLevel, r);
    }

    let currentRankLevel = previousRankLevel;
    let currentRankCode: UnilevelRankCode = previousRankCode;
    const newlyPromotedRanks: PromotedRankMilestoneSummary[] = [];
    let totalBonusCreditedScaled = 0n;

    // 2b. Check Master Ecosystem Feature Switch: 7-Stage Leadership Rank Engine
    const rankEngineEnabled = await isFeatureSwitchEnabled('leadership_rank_engine_enabled', trx);

    // 3. Sequential Rank Evaluation from currentRankLevel + 1 up to 6 (STRICT NO RANK SKIPPING)
    // If leadership_rank_engine_enabled is OFF, skip awarding new promotions/milestones while preserving telemetry.
    for (let targetLevel = currentRankLevel + 1; rankEngineEnabled && targetLevel <= 6; targetLevel++) {
      const targetRank = rankByLevel.get(targetLevel);
      if (!targetRank || !targetRank.isActive) {
        break; // Stop immediately if rank is inactive or missing
      }

      // Check A: Personal Active Investment requirement
      const meetsPersonalVolume =
        personalBreakdown.totalActiveScaled >= targetRank.requiredPersonalVolumeScaled;

      // Check B: 40% Anti-Single-Leg Capped Team Volume requirement (Volume Ranks 1..3)
      const capEvalForTarget = computeCappedTeamVolumeForRank(
        initialLegDecomp.directLegs,
        targetRank.requiredTeamVolumeUsd,
        targetRank.maxSingleLegCapPct
      );
      const meetsTeamVolume =
        targetRank.requiredTeamVolumeScaled > 0n ? capEvalForTarget.meetsTeamVolume : true;

      // Check C: Leadership Sub-Rank in 3 Distinct Direct Legs (Leadership Ranks 4..6)
      let qualifyingSubRankLegsCount = 0;
      let meetsSubRankLegs = true;
      if (targetRank.requiredSubRankLevel !== null && targetRank.requiredSubRankLegs > 0) {
        for (const leg of initialLegDecomp.directLegs) {
          if (leg.highestRankInLeg >= targetRank.requiredSubRankLevel) {
            qualifyingSubRankLegsCount++;
          }
        }
        meetsSubRankLegs = qualifyingSubRankLegsCount >= targetRank.requiredSubRankLegs;
      }

      const qualifiesForTarget = meetsPersonalVolume && meetsTeamVolume && meetsSubRankLegs;

      // STRICT NO RANK SKIPPING: If Rank k fails, stop immediately and do NOT evaluate k + 1
      if (!qualifiesForTarget) {
        break;
      }

      // Rank k qualifies! Insert into unilevel_rank_milestone_payouts with ON CONFLICT (user_id, rank_level) DO NOTHING
      const milestonePayoutId = uuidv4();
      const qualifiedVolToRecordStr =
        targetRank.requiredTeamVolumeScaled > 0n
          ? capEvalForTarget.totalQualifyingVolumeUsd
          : initialLegDecomp.rawTeamVolumeUsd;

      const milestoneIns = await trx.query<{ id: string }>(
        `
        INSERT INTO unilevel_rank_milestone_payouts (
          id,
          user_id,
          rank_id,
          rank_level,
          rank_code,
          qualified_team_volume_usd,
          bonus_amount_usd,
          ledger_entry_id,
          awarded_at,
          created_at
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6::numeric(20,8),
          $7::numeric(20,8),
          NULL,
          NOW(),
          NOW()
        )
        ON CONFLICT (user_id, rank_level) DO NOTHING
        RETURNING id
        `,
        [
          milestonePayoutId,
          userId,
          targetRank.id,
          targetRank.rankLevel,
          targetRank.rankCode,
          qualifiedVolToRecordStr,
          targetRank.milestoneBonusUsd,
        ]
      );

      let finalLedgerEntryId: string | null = null;
      let finalMilestoneId = milestonePayoutId;

      if (milestoneIns.rowCount > 0) {
        finalMilestoneId = milestoneIns.rows[0].id;

        // Credit one-time milestone cash reward to user's Main USDT Wallet if milestoneBonusScaled > 0
        if (targetRank.milestoneBonusScaled > 0n) {
          await trx.query(`SELECT id FROM users WHERE id = $1 FOR UPDATE`, [userId]);

          const ledgerEntryId = uuidv4();
          const publicTxnId = generateLedgerTransactionPublicId();
          const sourceRef = `RANK-L${targetRank.rankLevel}-${targetRank.rankCode}`;
          const description = `Unilevel Leadership Rank Milestone Reward (${targetRank.rankName} - Rank ${targetRank.rankLevel})`;

          const ledgerIns = await trx.query<{ id: string }>(
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
              'LEADERSHIP_RANK_REWARD',
              $4,
              $5,
              $6,
              $7::numeric(20,8),
              'USDT',
              'SETTLED',
              NOW()
            )
            ON CONFLICT (source_type, source_id, entry_type) DO NOTHING
            RETURNING id
            `,
            [
              ledgerEntryId,
              publicTxnId,
              userId,
              finalMilestoneId,
              sourceRef,
              description,
              targetRank.milestoneBonusUsd,
            ]
          );

          if (ledgerIns.rowCount > 0) {
            finalLedgerEntryId = ledgerIns.rows[0].id;
            totalBonusCreditedScaled += targetRank.milestoneBonusScaled;

            await trx.query(
              `UPDATE unilevel_rank_milestone_payouts SET ledger_entry_id = $1 WHERE id = $2`,
              [finalLedgerEntryId, finalMilestoneId]
            );
          }
        }

        // Update user_unilevel_ranks to rank_level = targetLevel
        await trx.query(
          `
          UPDATE user_unilevel_ranks
          SET
            current_rank_level = $2,
            current_rank_code = $3,
            promoted_at = NOW(),
            updated_at = NOW()
          WHERE user_id = $1
          `,
          [userId, targetRank.rankLevel, targetRank.rankCode]
        );

        // Record immutable security audit log for rank promotion
        await trx.query(
          `
          INSERT INTO security_audit_logs (
            trace_id, actor_user_id, action_type, severity, payload, created_at
          )
          VALUES ($1, $2, 'UNILEVEL_RANK_PROMOTION', 'INFO', $3::jsonb, NOW())
          `,
          [
            `TRACE-RANK-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
            userId,
            JSON.stringify({
              userId,
              previousRankLevel: currentRankLevel,
              newRankLevel: targetRank.rankLevel,
              newRankCode: targetRank.rankCode,
              newRankName: targetRank.rankName,
              personalActiveInvestmentUsd: personalBreakdown.totalActiveUsd,
              qualifiedTeamVolumeUsd: qualifiedVolToRecordStr,
              bonusAmountUsd: targetRank.milestoneBonusUsd,
              milestonePayoutId: finalMilestoneId,
              ledgerEntryId: finalLedgerEntryId,
            }),
          ]
        );

        newlyPromotedRanks.push({
          rankLevel: targetRank.rankLevel,
          rankCode: targetRank.rankCode,
          rankName: targetRank.rankName,
          qualifiedTeamVolumeUsd: qualifiedVolToRecordStr,
          bonusAmountUsd: targetRank.milestoneBonusUsd,
          milestonePayoutId: finalMilestoneId,
          ledgerEntryId: finalLedgerEntryId,
        });
      } else {
        // Milestone was already awarded in unilevel_rank_milestone_payouts; ensure user_unilevel_ranks is synced without re-paying
        await trx.query(
          `
          UPDATE user_unilevel_ranks
          SET
            current_rank_level = GREATEST(current_rank_level, $2),
            current_rank_code = CASE WHEN current_rank_level < $2 THEN $3 ELSE current_rank_code END,
            updated_at = NOW()
          WHERE user_id = $1
          `,
          [userId, targetRank.rankLevel, targetRank.rankCode]
        );
      }

      currentRankLevel = targetRank.rankLevel;
      currentRankCode = targetRank.rankCode;
    }

    // 4. Determine reference volume rank for displaying & storing qualified_team_volume_usd:
    // - If currentRankLevel === 0: use Rank 1 ($25,000 target, $10,000 per-leg cap)
    // - If currentRankLevel in 1..3: use currentRankLevel ($25k, $100k, or $350k target)
    // - If currentRankLevel >= 4: use Rank 3 ($350,000 target, $140,000 per-leg cap)
    const referenceVolumeRankLevel =
      currentRankLevel === 0 ? 1 : currentRankLevel <= 3 ? currentRankLevel : 3;
    const referenceVolumeRank = rankByLevel.get(referenceVolumeRankLevel);
    const refTeamVolStr = referenceVolumeRank?.requiredTeamVolumeUsd || '25000.00000000';
    const refCapPctStr = referenceVolumeRank?.maxSingleLegCapPct || '40.00000000';

    const finalLegDecomp = await decomposeUserDirectLegs(
      trx,
      userId,
      refTeamVolStr,
      refCapPctStr
    );

    // 5. Persist latest telemetry snapshot to user_unilevel_ranks
    await trx.query(
      `
      UPDATE user_unilevel_ranks
      SET
        current_rank_level = $2,
        current_rank_code = $3,
        personal_active_volume_usd = $4::numeric(20,8),
        raw_team_volume_usd = $5::numeric(20,8),
        qualified_team_volume_usd = $6::numeric(20,8),
        strongest_leg_volume_usd = $7::numeric(20,8),
        other_legs_volume_usd = $8::numeric(20,8),
        last_evaluated_at = NOW(),
        updated_at = NOW()
      WHERE user_id = $1
      `,
      [
        userId,
        currentRankLevel,
        currentRankCode,
        personalBreakdown.totalActiveUsd,
        finalLegDecomp.rawTeamVolumeUsd,
        finalLegDecomp.qualifiedTeamVolumeUsd,
        finalLegDecomp.strongestLegVolumeUsd,
        finalLegDecomp.otherLegsVolumeUsd,
      ]
    );

    const currentRankMeta =
      rankByLevel.get(currentRankLevel)?.rankName ||
      RANK_NAME_BY_LEVEL[currentRankLevel]?.name ||
      'Initiate Member';

    return {
      userId,
      previousRankLevel,
      previousRankCode,
      currentRankLevel,
      currentRankCode,
      currentRankName: currentRankMeta,
      promoted: newlyPromotedRanks.length > 0 || currentRankLevel > previousRankLevel,
      newlyPromotedRanks,
      totalBonusCreditedUsd: formatScaledBigInt(totalBonusCreditedScaled),
      personalActiveInvestmentUsd: personalBreakdown.totalActiveUsd,
      rawTeamVolumeUsd: finalLegDecomp.rawTeamVolumeUsd,
      qualifiedTeamVolumeUsd: finalLegDecomp.qualifiedTeamVolumeUsd,
      strongestLegVolumeUsd: finalLegDecomp.strongestLegVolumeUsd,
      otherLegsVolumeUsd: finalLegDecomp.otherLegsVolumeUsd,
      perLegCapUsd: finalLegDecomp.perLegCapUsd,
      referenceVolumeRankLevel,
      directLegsCount: finalLegDecomp.directLegsCount,
      activeDirectLegsCount: finalLegDecomp.activeDirectLegsCount,
      directLegs: finalLegDecomp.directLegs.map(
        ({ rawLegVolumeScaled: _r, cappedLegVolumeScaled: _c, ...rest }) => rest
      ),
      cascadedAncestorPromotions: [],
      evaluatedAt: new Date().toISOString(),
    };
  });
}

/**
 * Evaluates and promotes a user sequentially through Ranks 0..6 (`evaluateAndPromoteUserRank(userId)`).
 * - If `userId` promotes by at least 1 rank (and `options?.cascadeToAncestors !== false`),
 *   automatically cascades rank evaluation upward along `userId`'s ancestor chain (`user_referrals.sponsor_user_id`)
 *   so uplines immediately qualify for Ranks 4, 5, or 6 when their leg leaders advance.
 */
export async function evaluateAndPromoteUserRank(
  userId: string,
  options?: { cascadeToAncestors?: boolean }
): Promise<SingleUserRankEvaluationResult> {
  const cascade = options?.cascadeToAncestors !== false;
  const userResult = await evaluateAndPromoteSingleUserInternal(userId);

  if (cascade && userResult.promoted) {
    const db = await getDb();
    const visited = new Set<string>([userId]);
    let currentChildId = userId;

    while (true) {
      const refRes = await db.query<{ sponsor_user_id: string | null }>(
        `SELECT sponsor_user_id FROM user_referrals WHERE user_id = $1 LIMIT 1`,
        [currentChildId]
      );
      const sponsorId = refRes.rows[0]?.sponsor_user_id || null;
      if (!sponsorId || visited.has(sponsorId)) {
        break;
      }
      visited.add(sponsorId);
      currentChildId = sponsorId;

      const ancestorEval = await evaluateAndPromoteSingleUserInternal(sponsorId);
      if (ancestorEval.promoted) {
        userResult.cascadedAncestorPromotions.push({
          ancestorUserId: sponsorId,
          previousRankLevel: ancestorEval.previousRankLevel,
          previousRankCode: ancestorEval.previousRankCode,
          newRankLevel: ancestorEval.currentRankLevel,
          newRankCode: ancestorEval.currentRankCode,
          newlyPromotedRanks: ancestorEval.newlyPromotedRanks,
          totalBonusCreditedUsd: ancestorEval.totalBonusCreditedUsd,
        });
      }
    }
  }

  return userResult;
}

/**
 * Evaluates `userId` AND every ancestor in `userId`'s sponsor chain upward (bottom-to-top, cycle-safe).
 * Hooked after investment commits (`investInTradingPool`, `subscribeChronoVault`, `settleNodeOrder`, `adminActivateNodeForUser`)
 * because a user's new investment increases BOTH the user's personal volume AND every ancestor's leg volume.
 */
export async function evaluateAndPromoteUserAndAncestors(userId: string): Promise<{
  userEvaluation: SingleUserRankEvaluationResult;
  ancestorEvaluations: SingleUserRankEvaluationResult[];
}> {
  const db = await getDb();
  const userEvaluation = await evaluateAndPromoteSingleUserInternal(userId);
  const ancestorEvaluations: SingleUserRankEvaluationResult[] = [];

  const visited = new Set<string>([userId]);
  let currentChildId = userId;

  while (true) {
    const refRes = await db.query<{ sponsor_user_id: string | null }>(
      `SELECT sponsor_user_id FROM user_referrals WHERE user_id = $1 LIMIT 1`,
      [currentChildId]
    );
    const sponsorId = refRes.rows[0]?.sponsor_user_id || null;
    if (!sponsorId || visited.has(sponsorId)) {
      break;
    }
    visited.add(sponsorId);
    currentChildId = sponsorId;

    const ancestorEval = await evaluateAndPromoteSingleUserInternal(sponsorId);
    ancestorEvaluations.push(ancestorEval);

    if (ancestorEval.promoted) {
      userEvaluation.cascadedAncestorPromotions.push({
        ancestorUserId: sponsorId,
        previousRankLevel: ancestorEval.previousRankLevel,
        previousRankCode: ancestorEval.previousRankCode,
        newRankLevel: ancestorEval.currentRankLevel,
        newRankCode: ancestorEval.currentRankCode,
        newlyPromotedRanks: ancestorEval.newlyPromotedRanks,
        totalBonusCreditedUsd: ancestorEval.totalBonusCreditedUsd,
      });
    }
  }

  return {
    userEvaluation,
    ancestorEvaluations,
  };
}

/**
 * Sweeps and evaluates all users across the Unilevel network (ordered bottom-up by creation date DESC so downline leaders
 * promote before their uplines are evaluated for Leadership Ranks 4..6).
 */
export async function evaluateAllUsersUnilevelRanks(limit = 500): Promise<{
  usersEvaluated: number;
  usersPromoted: number;
  totalMilestonesAwarded: number;
  totalBonusCreditedUsd: string;
  promotions: Array<{
    userId: string;
    previousRankLevel: number;
    newRankLevel: number;
    newRankCode: UnilevelRankCode;
    totalBonusCreditedUsd: string;
  }>;
}> {
  const db = await getDb();
  const safeLimit = Math.min(5000, Math.max(1, Math.floor(Number(limit) || 500)));

  const usersRes = await db.query<{ id: string }>(
    `
    SELECT id
    FROM users
    WHERE status = 'ACTIVE'
    ORDER BY created_at DESC, id ASC
    LIMIT $1
    `,
    [safeLimit]
  );

  let usersEvaluated = 0;
  let usersPromoted = 0;
  let totalMilestonesAwarded = 0;
  let totalBonusScaled = 0n;
  const promotions: Array<{
    userId: string;
    previousRankLevel: number;
    newRankLevel: number;
    newRankCode: UnilevelRankCode;
    totalBonusCreditedUsd: string;
  }> = [];

  for (const row of usersRes.rows) {
    const res = await evaluateAndPromoteUserRank(row.id, { cascadeToAncestors: true });
    usersEvaluated++;

    if (res.promoted) {
      usersPromoted++;
      totalMilestonesAwarded += res.newlyPromotedRanks.length;
      totalBonusScaled += parseAmountToScaledBigInt(res.totalBonusCreditedUsd);
      promotions.push({
        userId: row.id,
        previousRankLevel: res.previousRankLevel,
        newRankLevel: res.currentRankLevel,
        newRankCode: res.currentRankCode,
        totalBonusCreditedUsd: res.totalBonusCreditedUsd,
      });
    }

    for (const casc of res.cascadedAncestorPromotions) {
      usersPromoted++;
      totalMilestonesAwarded += casc.newlyPromotedRanks.length;
      totalBonusScaled += parseAmountToScaledBigInt(casc.totalBonusCreditedUsd);
      promotions.push({
        userId: casc.ancestorUserId,
        previousRankLevel: casc.previousRankLevel,
        newRankLevel: casc.newRankLevel,
        newRankCode: casc.newRankCode,
        totalBonusCreditedUsd: casc.totalBonusCreditedUsd,
      });
    }
  }

  return {
    usersEvaluated,
    usersPromoted,
    totalMilestonesAwarded,
    totalBonusCreditedUsd: formatScaledBigInt(totalBonusScaled),
    promotions,
  };
}

/**
 * Returns the comprehensive 7-Stage Unilevel Career & Leadership Rank Overview for a user:
 * - Syncs and evaluates the user's current rank first so telemetry is 100% live.
 * - Returns current rank (0..6), next target rank, personal active investment breakdown,
 *   per-direct-leg volume breakdown (`rawLegVolumeUsd`, `cappedLegVolumeUsd` at 40%, `isCapped`, `highestRankInLeg`),
 *   full 7-rank ladder progress, and one-time milestone payout history.
 */
export async function getUserUnilevelRankOverview(
  userId: string
): Promise<UnilevelRankOverviewResponse> {
  // Run live evaluation first so any newly qualified rank is promoted before building telemetry
  await evaluateAndPromoteUserRank(userId, { cascadeToAncestors: true });

  const db = await getDb();
  const [rankConfigs, personalBreakdown, userRankRes, milestonesRes, walletBal] =
    await Promise.all([
      getLeadershipRanksConfig(db),
      getUserActiveInvestmentBreakdownUsd(db, userId),
      db.query<{
        current_rank_level: number;
        current_rank_code: UnilevelRankCode;
        promoted_at: Date | null;
        last_evaluated_at: Date | null;
      }>(
        `
        SELECT current_rank_level, current_rank_code, promoted_at, last_evaluated_at
        FROM user_unilevel_ranks
        WHERE user_id = $1
        `,
        [userId]
      ),
      db.query<{
        id: string;
        user_id: string;
        rank_id: string;
        rank_level: number;
        rank_code: UnilevelRankCode;
        qualified_team_volume_usd: string;
        bonus_amount_usd: string;
        ledger_entry_id: string | null;
        awarded_at: Date;
        created_at: Date;
      }>(
        `
        SELECT
          id,
          user_id,
          rank_id,
          rank_level,
          rank_code,
          ROUND(qualified_team_volume_usd, 8)::text AS qualified_team_volume_usd,
          ROUND(bonus_amount_usd, 8)::text AS bonus_amount_usd,
          ledger_entry_id,
          awarded_at,
          created_at
        FROM unilevel_rank_milestone_payouts
        WHERE user_id = $1
        ORDER BY rank_level ASC
        `,
        [userId]
      ),
      getUserMainUsdtBalanceExact(userId, db),
    ]);

  const currentRankLevel = Number(userRankRes.rows[0]?.current_rank_level || 0);
  const rankByLevel = new Map<number, UnilevelRankConfigRow>();
  for (const r of rankConfigs) {
    rankByLevel.set(r.rankLevel, r);
  }

  const currentRankCfg = rankByLevel.get(currentRankLevel) || rankConfigs[0];
  const nextRankLevel = currentRankLevel < 6 ? currentRankLevel + 1 : null;
  const nextRankCfg = nextRankLevel !== null ? rankByLevel.get(nextRankLevel) || null : null;

  // For the per-direct-leg radial gauge breakdown:
  // If the next target rank has a team volume target (e.g. Rank 1 $25k, Rank 2 $100k, Rank 3 $350k),
  // use that next rank's volume target; otherwise if current rank is 1..3, use current rank's target, or Rank 3 ($350k) for Ranks 4..6.
  const activeVolumeRankForGauge =
    nextRankCfg && nextRankCfg.requiredTeamVolumeScaled > 0n
      ? nextRankCfg
      : currentRankCfg && currentRankCfg.requiredTeamVolumeScaled > 0n
      ? currentRankCfg
      : rankByLevel.get(3) || rankByLevel.get(1)!;

  const currentOrFirstVolumeRank =
    currentRankLevel === 0
      ? rankByLevel.get(1)!
      : currentRankLevel <= 3
      ? rankByLevel.get(currentRankLevel)!
      : rankByLevel.get(3)!;

  const [gaugeLegDecomp, currentVolLegDecomp] = await Promise.all([
    decomposeUserDirectLegs(
      db,
      userId,
      activeVolumeRankForGauge.requiredTeamVolumeUsd,
      activeVolumeRankForGauge.maxSingleLegCapPct
    ),
    decomposeUserDirectLegs(
      db,
      userId,
      currentOrFirstVolumeRank.requiredTeamVolumeUsd,
      currentOrFirstVolumeRank.maxSingleLegCapPct
    ),
  ]);

  const milestoneByLevel = new Map<
    number,
    {
      id: string;
      ledgerEntryId: string | null;
      awardedAt: string;
      qualifiedTeamVolumeUsd: string;
      bonusAmountUsd: string;
    }
  >();

  let totalMilestoneBonusScaled = 0n;
  const milestonePayouts: RankMilestonePayoutRecord[] = milestonesRes.rows.map((m) => {
    const lvl = Number(m.rank_level);
    const bonusScaled = parseAmountToScaledBigInt(m.bonus_amount_usd);
    totalMilestoneBonusScaled += bonusScaled;
    const awardedIso = new Date(m.awarded_at).toISOString();

    milestoneByLevel.set(lvl, {
      id: m.id,
      ledgerEntryId: m.ledger_entry_id,
      awardedAt: awardedIso,
      qualifiedTeamVolumeUsd: m.qualified_team_volume_usd,
      bonusAmountUsd: m.bonus_amount_usd,
    });

    return {
      id: m.id,
      userId: m.user_id,
      rankId: m.rank_id,
      rankLevel: lvl,
      rankCode: m.rank_code,
      rankName: rankByLevel.get(lvl)?.rankName || RANK_NAME_BY_LEVEL[lvl]?.name || m.rank_code,
      qualifiedTeamVolumeUsd: m.qualified_team_volume_usd,
      bonusAmountUsd: m.bonus_amount_usd,
      ledgerEntryId: m.ledger_entry_id,
      awardedAt: awardedIso,
      createdAt: new Date(m.created_at).toISOString(),
    };
  });

  // Build full 7-rank ladder progress (0..6)
  const rankLadder: RankLadderProgressItem[] = rankConfigs.map((cfg) => {
    const isAchieved = currentRankLevel >= cfg.rankLevel;
    const isCurrentRank = currentRankLevel === cfg.rankLevel;
    const isNextTargetRank = nextRankLevel === cfg.rankLevel;

    const meetsPersonalVolume =
      personalBreakdown.totalActiveScaled >= cfg.requiredPersonalVolumeScaled;
    const missingPersonalScaled =
      cfg.requiredPersonalVolumeScaled > personalBreakdown.totalActiveScaled
        ? cfg.requiredPersonalVolumeScaled - personalBreakdown.totalActiveScaled
        : 0n;

    const capEval = computeCappedTeamVolumeForRank(
      gaugeLegDecomp.directLegs,
      cfg.requiredTeamVolumeUsd,
      cfg.maxSingleLegCapPct
    );
    const meetsTeamVolume =
      cfg.requiredTeamVolumeScaled > 0n ? capEval.meetsTeamVolume : true;

    const meetsDirectActiveLegs =
      gaugeLegDecomp.activeDirectLegsCount >= cfg.requiredDirectActiveLegs;

    let qualifyingSubRankDistinctLegsCount = 0;
    let meetsSubRankLegs = true;
    let missingSubRankLegs = 0;

    if (cfg.requiredSubRankLevel !== null && cfg.requiredSubRankLegs > 0) {
      for (const leg of gaugeLegDecomp.directLegs) {
        if (leg.highestRankInLeg >= cfg.requiredSubRankLevel) {
          qualifyingSubRankDistinctLegsCount++;
        }
      }
      meetsSubRankLegs = qualifyingSubRankDistinctLegsCount >= cfg.requiredSubRankLegs;
      missingSubRankLegs =
        cfg.requiredSubRankLegs > qualifyingSubRankDistinctLegsCount
          ? cfg.requiredSubRankLegs - qualifyingSubRankDistinctLegsCount
          : 0;
    }

    const qualifiesNow =
      cfg.isActive && meetsPersonalVolume && meetsTeamVolume && meetsSubRankLegs;

    // Progress percentage calculation
    let progressPct = isAchieved ? '100.0000' : '0.0000';
    if (!isAchieved) {
      if (cfg.requiredTeamVolumeScaled > 0n) {
        const volRatio = Math.min(
          1,
          Number(capEval.totalQualifyingVolumeScaled) / Number(cfg.requiredTeamVolumeScaled)
        );
        const persRatio =
          cfg.requiredPersonalVolumeScaled > 0n
            ? Math.min(
                1,
                Number(personalBreakdown.totalActiveScaled) /
                  Number(cfg.requiredPersonalVolumeScaled)
              )
            : 1;
        progressPct = ((volRatio * 0.8 + persRatio * 0.2) * 100).toFixed(4);
      } else if (cfg.requiredSubRankLegs > 0) {
        const legRatio = Math.min(
          1,
          qualifyingSubRankDistinctLegsCount / cfg.requiredSubRankLegs
        );
        const persRatio =
          cfg.requiredPersonalVolumeScaled > 0n
            ? Math.min(
                1,
                Number(personalBreakdown.totalActiveScaled) /
                  Number(cfg.requiredPersonalVolumeScaled)
              )
            : 1;
        progressPct = ((legRatio * 0.8 + persRatio * 0.2) * 100).toFixed(4);
      }
    }

    const milestoneInfo = milestoneByLevel.get(cfg.rankLevel);

    return {
      rankId: cfg.id,
      rankLevel: cfg.rankLevel,
      rankCode: cfg.rankCode,
      rankName: cfg.rankName,
      requiredPersonalVolumeUsd: cfg.requiredPersonalVolumeUsd,
      requiredTeamVolumeUsd: cfg.requiredTeamVolumeUsd,
      maxSingleLegCapPct: cfg.maxSingleLegCapPct,
      perLegCapUsd: cfg.perLegCapUsd,
      requiredDirectActiveLegs: cfg.requiredDirectActiveLegs,
      requiredSubRankCode: cfg.requiredSubRankCode,
      requiredSubRankLevel: cfg.requiredSubRankLevel,
      requiredSubRankLegs: cfg.requiredSubRankLegs,
      milestoneBonusUsd: cfg.milestoneBonusUsd,
      globalPoolSharePct: cfg.globalPoolSharePct,
      rewardDescription: cfg.rewardDescription,
      isAchieved,
      isCurrentRank,
      isNextTargetRank,
      meetsPersonalVolume,
      meetsTeamVolume,
      meetsDirectActiveLegs,
      meetsSubRankLegs,
      qualifiesNow,
      qualifiedTeamVolumeUsd: capEval.totalQualifyingVolumeUsd,
      missingPersonalVolumeUsd: formatScaledBigInt(missingPersonalScaled),
      missingTeamVolumeUsd: capEval.missingTeamVolumeUsd,
      qualifyingSubRankDistinctLegsCount,
      missingSubRankLegs,
      progressPct,
      awardedAt: milestoneInfo?.awardedAt || null,
      milestonePayoutId: milestoneInfo?.id || null,
      ledgerEntryId: milestoneInfo?.ledgerEntryId || null,
    };
  });

  const nextTargetRankItem =
    nextRankLevel !== null
      ? rankLadder.find((r) => r.rankLevel === nextRankLevel) || null
      : null;

  return {
    userId,
    currentRank: {
      rankLevel: currentRankCfg.rankLevel,
      rankCode: currentRankCfg.rankCode,
      rankName: currentRankCfg.rankName,
      milestoneBonusUsd: currentRankCfg.milestoneBonusUsd,
      globalPoolSharePct: currentRankCfg.globalPoolSharePct,
      rewardDescription: currentRankCfg.rewardDescription,
      promotedAt: userRankRes.rows[0]?.promoted_at
        ? new Date(userRankRes.rows[0].promoted_at).toISOString()
        : null,
      lastEvaluatedAt: userRankRes.rows[0]?.last_evaluated_at
        ? new Date(userRankRes.rows[0].last_evaluated_at).toISOString()
        : null,
    },
    nextTargetRank: nextTargetRankItem,
    personalActiveInvestmentUsd: personalBreakdown.totalActiveUsd,
    activeBreakdown: {
      tradingPoolActiveUsd: personalBreakdown.tradingPoolActiveUsd,
      chronoVaultActiveUsd: personalBreakdown.chronoVaultActiveUsd,
      genesisNodeActiveUsd: personalBreakdown.genesisNodeActiveUsd,
      activeNodesCount: personalBreakdown.activeNodesCount,
    },
    teamVolumeSummary: {
      rawTeamVolumeUsd: gaugeLegDecomp.rawTeamVolumeUsd,
      qualifiedTeamVolumeUsd: currentVolLegDecomp.qualifiedTeamVolumeUsd,
      nextRankQualifiedTeamVolumeUsd: gaugeLegDecomp.qualifiedTeamVolumeUsd,
      nextRankRequiredTeamVolumeUsd: activeVolumeRankForGauge.requiredTeamVolumeUsd,
      nextRankPerLegCapUsd: gaugeLegDecomp.perLegCapUsd,
      maxSingleLegCapPct: activeVolumeRankForGauge.maxSingleLegCapPct,
      strongestLegVolumeUsd: gaugeLegDecomp.strongestLegVolumeUsd,
      otherLegsVolumeUsd: gaugeLegDecomp.otherLegsVolumeUsd,
      directLegsCount: gaugeLegDecomp.directLegsCount,
      activeDirectLegsCount: gaugeLegDecomp.activeDirectLegsCount,
    },
    directLegs: gaugeLegDecomp.directLegs.map(
      ({ rawLegVolumeScaled: _r, cappedLegVolumeScaled: _c, ...rest }) => rest
    ),
    rankLadder,
    milestonePayouts,
    totalMilestoneBonusEarnedUsd: formatScaledBigInt(totalMilestoneBonusScaled),
    mainUsdtWalletBalance: walletBal.availableBalanceStr,
  };
}
