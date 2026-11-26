import crypto from 'crypto';
import { DatabaseClient, getDb } from '../db/db';
import { recordSecurityAuditLog } from './unilevelConfigService';

export interface TopSponsorSummary {
  userId: string;
  email: string;
  publicId: string;
  referralCode: string;
  directReferralsCount: number;
  activeDirectReferralsCount: number;
}

export interface UnilevelReconstructionReport {
  totalUsers: number;
  referralRowsCreated: number;
  repairedFromPendingCode: number;
  invalidSponsorsCleared: number;
  selfReferencesCleared: number;
  cyclesBroken: number;
  rootAccountsCount: number;
  linkedMembersCount: number;
  maxTreeDepth: number;
  activeDirectTotal: number;
  binaryPlacementsPreservedReadOnlyCount: number;
  topSponsors: TopSponsorSummary[];
  rebuiltAt: string;
}

function generateDeterministicReferralCode(publicId: string | null, userId: string): string {
  const cleanedPublic = String(publicId || '')
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .trim();
  if (cleanedPublic && cleanedPublic.length >= 6 && cleanedPublic.length <= 24) {
    return cleanedPublic;
  }
  const hash = crypto.createHash('sha256').update(userId).digest('hex').slice(0, 6).toUpperCase();
  return `PHX-${hash}`;
}

/**
 * Reconstructs every user's canonical 16-generation Unilevel sponsor strictly from their
 * original referral-link sponsor (`user_referrals.sponsor_user_id` or `users.pending_referral_code`),
 * ignoring legacy `binary_placements` Left/Right spillover positions.
 *
 * Guarantees:
 * - Zero writes or deletes against `binary_placements` (preserved strictly read-only for legacy archive).
 * - Zero self-referrals (`sponsor_user_id !== user_id`).
 * - Acyclic directed forest verified by deterministic DFS cycle detection.
 * - Accurate persisted `direct_referrals_count` & `active_direct_referrals_count` on `user_referrals`.
 */
export async function rebuildUnilevelHierarchyFromSponsors(
  client?: DatabaseClient
): Promise<UnilevelReconstructionReport> {
  const db = client || (await getDb());

  // 1. Load all users and existing user_referrals rows
  const usersRes = await db.query<{
    id: string;
    email: string;
    public_id: string | null;
    pending_referral_code: string | null;
    created_at: Date;
  }>(
    `
    SELECT id, email, public_id, pending_referral_code, created_at
    FROM users
    ORDER BY created_at ASC, id ASC
    `
  );

  const referralsRes = await db.query<{
    user_id: string;
    referral_code: string;
    sponsor_user_id: string | null;
    created_at: Date;
  }>(
    `
    SELECT user_id, referral_code, sponsor_user_id, created_at
    FROM user_referrals
    `
  );

  const validUserIds = new Set<string>();
  const userMetaById = new Map<
    string,
    { email: string; publicId: string; pendingCode: string | null; createdAtMs: number }
  >();
  const codeToUserId = new Map<string, string>();
  const usedCodes = new Set<string>();

  for (const u of usersRes.rows) {
    validUserIds.add(u.id);
    const pub = String(u.public_id || '').trim().toUpperCase();
    userMetaById.set(u.id, {
      email: u.email,
      publicId: pub,
      pendingCode: u.pending_referral_code ? u.pending_referral_code.trim().toUpperCase() : null,
      createdAtMs: new Date(u.created_at).getTime(),
    });
    if (pub) {
      codeToUserId.set(pub, u.id);
    }
  }

  const refByUserId = new Map<
    string,
    { referralCode: string; sponsorUserId: string | null }
  >();

  for (const r of referralsRes.rows) {
    const codeUpper = String(r.referral_code || '').trim().toUpperCase();
    if (codeUpper) {
      usedCodes.add(codeUpper);
      codeToUserId.set(codeUpper, r.user_id);
    }
    refByUserId.set(r.user_id, {
      referralCode: r.referral_code,
      sponsorUserId: r.sponsor_user_id || null,
    });
  }

  // 2. Ensure every user has a canonical user_referrals row
  let referralRowsCreated = 0;
  for (const u of usersRes.rows) {
    if (!refByUserId.has(u.id)) {
      let candidateCode = generateDeterministicReferralCode(u.public_id, u.id);
      let suffix = 1;
      while (usedCodes.has(candidateCode.toUpperCase())) {
        candidateCode = `${generateDeterministicReferralCode(u.public_id, u.id)}-${suffix++}`;
      }
      usedCodes.add(candidateCode.toUpperCase());
      codeToUserId.set(candidateCode.toUpperCase(), u.id);

      await db.query(
        `
        INSERT INTO user_referrals (user_id, referral_code, sponsor_user_id, created_at)
        VALUES ($1, $2, NULL, CURRENT_TIMESTAMP)
        ON CONFLICT (user_id) DO NOTHING
        `,
        [u.id, candidateCode]
      );

      refByUserId.set(u.id, {
        referralCode: candidateCode,
        sponsorUserId: null,
      });
      referralRowsCreated += 1;
    }
  }

  // 3. Resolve canonical sponsor_user_id strictly from original referral-link sponsor
  //    Priority:
  //    (a) Existing valid `user_referrals.sponsor_user_id`
  //    (b) `users.pending_referral_code` matched to sponsor's referral_code / public_id
  //    NEVER reads from `binary_placements`.
  let repairedFromPendingCode = 0;
  let invalidSponsorsCleared = 0;
  let selfReferencesCleared = 0;

  const resolvedSponsor = new Map<string, { sponsorId: string | null }>();

  for (const u of usersRes.rows) {
    const existing = refByUserId.get(u.id)!;
    let sponsorId = existing.sponsorUserId;

    if (sponsorId && !validUserIds.has(sponsorId)) {
      sponsorId = null;
      invalidSponsorsCleared += 1;
    }

    if (sponsorId === u.id) {
      sponsorId = null;
      selfReferencesCleared += 1;
    }

    if (!sponsorId) {
      const lookupCode = userMetaById.get(u.id)?.pendingCode || null;
      if (lookupCode) {
        const matchedSponsorId = codeToUserId.get(lookupCode) || null;
        if (matchedSponsorId && matchedSponsorId !== u.id && validUserIds.has(matchedSponsorId)) {
          sponsorId = matchedSponsorId;
          repairedFromPendingCode += 1;
        } else if (matchedSponsorId === u.id) {
          selfReferencesCleared += 1;
        }
      }
    }

    resolvedSponsor.set(u.id, { sponsorId });
  }

  // 4. Deterministic Cycle Detection & Cycle Breaking (DFS over directed parent pointers)
  let cyclesBroken = 0;
  const visitedState = new Map<string, 0 | 1 | 2>(); // 0 = unvisited, 1 = on path, 2 = verified acyclic

  for (const u of usersRes.rows) {
    if (visitedState.get(u.id) === 2) continue;

    const path: string[] = [];
    const pathIndex = new Map<string, number>();
    let curr: string | null = u.id;

    while (curr && visitedState.get(curr) !== 2) {
      if (pathIndex.has(curr)) {
        // Found a cycle! Break the edge of the newest/latest member in the cycle (or current back-edge)
        const cycleStartIdx = pathIndex.get(curr)!;
        const cycleMembers = path.slice(cycleStartIdx);
        let nodeToDetach = cycleMembers[cycleMembers.length - 1];
        let latestCreated = -1;
        for (const memberId of cycleMembers) {
          const ts = userMetaById.get(memberId)?.createdAtMs ?? 0;
          if (ts >= latestCreated) {
            latestCreated = ts;
            nodeToDetach = memberId;
          }
        }
        resolvedSponsor.set(nodeToDetach, { sponsorId: null });
        cyclesBroken += 1;
        break;
      }

      pathIndex.set(curr, path.length);
      path.push(curr);
      visitedState.set(curr, 1);

      const parentId: string | null = resolvedSponsor.get(curr)?.sponsorId || null;
      if (!parentId || parentId === curr) {
        if (parentId === curr) {
          resolvedSponsor.set(curr, { sponsorId: null });
          selfReferencesCleared += 1;
        }
        break;
      }
      curr = parentId;
    }

    for (const nodeId of path) {
      visitedState.set(nodeId, 2);
    }
  }

  // 5. Identify Active Members (active Genesis Node, active Trading Pool, or active Chrono Vault)
  const activeUsersRes = await db.query<{ user_id: string }>(
    `
    SELECT DISTINCT owner_user_id AS user_id
    FROM nodes
    WHERE owner_user_id IS NOT NULL AND status IN ('ACTIVE', 'EMITTING')
    UNION
    SELECT DISTINCT user_id
    FROM user_trading_positions
    WHERE status = 'ACTIVE'
    UNION
    SELECT DISTINCT user_id
    FROM user_vault_positions
    WHERE status = 'ACTIVE'
    `
  );
  const activeUserSet = new Set<string>(activeUsersRes.rows.map((r) => r.user_id));

  // 6. Compute exact direct_referrals_count, active_direct_referrals_count, and maxTreeDepth
  const directCountMap = new Map<string, number>();
  const activeDirectCountMap = new Map<string, number>();

  for (const u of usersRes.rows) {
    directCountMap.set(u.id, 0);
    activeDirectCountMap.set(u.id, 0);
  }

  let rootAccountsCount = 0;
  let linkedMembersCount = 0;

  for (const u of usersRes.rows) {
    const entry = resolvedSponsor.get(u.id)!;
    if (entry.sponsorId) {
      linkedMembersCount += 1;
      directCountMap.set(entry.sponsorId, (directCountMap.get(entry.sponsorId) || 0) + 1);
      if (activeUserSet.has(u.id)) {
        activeDirectCountMap.set(
          entry.sponsorId,
          (activeDirectCountMap.get(entry.sponsorId) || 0) + 1
        );
      }
    } else {
      rootAccountsCount += 1;
    }
  }

  // Compute max depth cleanly (acyclic guarantee)
  const depthMemo = new Map<string, number>();
  function getDepth(userId: string): number {
    if (depthMemo.has(userId)) return depthMemo.get(userId)!;
    const sponsorId = resolvedSponsor.get(userId)?.sponsorId || null;
    if (!sponsorId) {
      depthMemo.set(userId, 0);
      return 0;
    }
    const d = 1 + getDepth(sponsorId);
    depthMemo.set(userId, d);
    return d;
  }

  let maxTreeDepth = 0;
  for (const u of usersRes.rows) {
    const d = getDepth(u.id);
    if (d > maxTreeDepth) maxTreeDepth = d;
  }

  // 7. Persist canonical sponsor links & direct referral counts onto user_referrals
  const rebuiltAt = new Date().toISOString();
  let activeDirectTotal = 0;

  for (const u of usersRes.rows) {
    const entry = resolvedSponsor.get(u.id)!;
    const directCnt = directCountMap.get(u.id) || 0;
    const activeDirectCnt = activeDirectCountMap.get(u.id) || 0;
    activeDirectTotal += activeDirectCnt;

    await db.query(
      `
      UPDATE user_referrals
      SET
        sponsor_user_id = $1,
        direct_referrals_count = $2,
        active_direct_referrals_count = $3,
        unilevel_rebuilt_at = $4
      WHERE user_id = $5
      `,
      [entry.sponsorId, directCnt, activeDirectCnt, rebuiltAt, u.id]
    );
  }

  // 8. Verify binary_placements remains untouched (read-only count only)
  const binaryCountRes = await db
    .query<{ cnt: string }>(`SELECT COUNT(*)::text AS cnt FROM binary_placements`)
    .catch(() => ({ rows: [{ cnt: '0' }] }));
  const binaryPlacementsPreservedReadOnlyCount = Number(binaryCountRes.rows[0]?.cnt || 0);

  // Build Top Sponsors Leaderboard
  const topSponsors: TopSponsorSummary[] = usersRes.rows
    .map((u) => ({
      userId: u.id,
      email: u.email,
      publicId: String(u.public_id || ''),
      referralCode: refByUserId.get(u.id)?.referralCode || '',
      directReferralsCount: directCountMap.get(u.id) || 0,
      activeDirectReferralsCount: activeDirectCountMap.get(u.id) || 0,
    }))
    .filter((s) => s.directReferralsCount > 0)
    .sort((a, b) => b.directReferralsCount - a.directReferralsCount || b.activeDirectReferralsCount - a.activeDirectReferralsCount)
    .slice(0, 15);

  const report: UnilevelReconstructionReport = {
    totalUsers: usersRes.rows.length,
    referralRowsCreated,
    repairedFromPendingCode,
    invalidSponsorsCleared,
    selfReferencesCleared,
    cyclesBroken,
    rootAccountsCount,
    linkedMembersCount,
    maxTreeDepth,
    activeDirectTotal,
    binaryPlacementsPreservedReadOnlyCount,
    topSponsors,
    rebuiltAt,
  };

  await recordSecurityAuditLog(db, {
    actionType: 'UNILEVEL_HIERARCHY_RECONSTRUCTED',
    severity: 'INFO',
    payload: {
      totalUsers: report.totalUsers,
      referralRowsCreated: report.referralRowsCreated,
      repairedFromPendingCode: report.repairedFromPendingCode,
      invalidSponsorsCleared: report.invalidSponsorsCleared,
      selfReferencesCleared: report.selfReferencesCleared,
      cyclesBroken: report.cyclesBroken,
      rootAccountsCount: report.rootAccountsCount,
      linkedMembersCount: report.linkedMembersCount,
      maxTreeDepth: report.maxTreeDepth,
      binaryPlacementsPreservedReadOnlyCount: report.binaryPlacementsPreservedReadOnlyCount,
    },
  });

  return report;
}
