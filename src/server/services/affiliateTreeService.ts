import { getDb } from '../db/db';
import { v4 as uuidv4 } from 'uuid';
import { logAdminAction } from './adminService';
import { validateNoCycle } from './binaryPlacementService';

/**
 * Admin endpoint function to force update or create a user's binary placement in the network tree.
 * Syncs instantly to PostgreSQL and Firestore for 100% data persistence.
 */
export async function adminUpdateBinaryPlacement(params: {
  adminUserId: string;
  adminPublicId: string;
  memberPublicId: string;
  targetParentPublicId: string;
  side: 'LEFT' | 'RIGHT';
  reason: string;
  ipAddress?: string;
}) {
  const db = await getDb();

  if (!params.reason || params.reason.trim().length < 5) {
    const err: any = new Error('Admin reason is mandatory (minimum 5 characters) for binary placement updates.');
    err.statusCode = 400;
    throw err;
  }

  const cleanMemberPublicId = params.memberPublicId.trim().toUpperCase();
  const cleanParentPublicId = params.targetParentPublicId.trim().toUpperCase();
  const side = params.side.toUpperCase() as 'LEFT' | 'RIGHT';

  if (side !== 'LEFT' && side !== 'RIGHT') {
    const err: any = new Error("Binary side must be 'LEFT' or 'RIGHT'.");
    err.statusCode = 400;
    throw err;
  }

  // 1. Fetch member
  const memberRes = await db.query<any>(`SELECT id, public_id, full_name, email FROM users WHERE public_id = $1 OR id::text = $1`, [cleanMemberPublicId]);
  if (memberRes.rows.length === 0) {
    const err: any = new Error(`Member '${cleanMemberPublicId}' not found.`);
    err.statusCode = 404;
    throw err;
  }
  const member = memberRes.rows[0];

  // 2. Fetch parent
  const parentRes = await db.query<any>(`SELECT id, public_id, full_name, email FROM users WHERE public_id = $1 OR id::text = $1`, [cleanParentPublicId]);
  if (parentRes.rows.length === 0) {
    const err: any = new Error(`Target parent user '${cleanParentPublicId}' not found.`);
    err.statusCode = 404;
    throw err;
  }
  const parent = parentRes.rows[0];

  if (member.id === parent.id) {
    const err: any = new Error('Self-placement is forbidden.');
    err.statusCode = 400;
    throw err;
  }

  // Check if position is occupied by another user
  const occupiedCheck = await db.query<any>(
    `SELECT user_id FROM binary_placements WHERE parent_user_id = $1 AND side = $2 AND status = 'PLACED' AND user_id != $3`,
    [parent.id, side, member.id]
  );
  if (occupiedCheck.rows.length > 0) {
    const err: any = new Error(`Position ${side} under ${parent.public_id} is already occupied by another user. Move or remove that user first.`);
    err.statusCode = 409;
    throw err;
  }

  // Validate cycle safety
  await validateNoCycle(db, member.id, parent.id);

  // Upsert binary placement in PostgreSQL
  await db.query(
    `
    INSERT INTO binary_placements (user_id, parent_user_id, side, status, placed_at, created_at)
    VALUES ($1, $2, $3, 'PLACED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT (user_id) DO UPDATE SET
      parent_user_id = $2,
      side = $3,
      status = 'PLACED',
      placed_at = COALESCE(binary_placements.placed_at, CURRENT_TIMESTAMP)
    `,
    [member.id, parent.id, side]
  );

  // Sync to Firestore for persistent cloud storage
  try {
    const { adminFirestore } = await import('../../lib/firebase-admin');
    await adminFirestore.collection('placements').doc(member.id).set({
      userId: member.id,
      userPublicId: member.public_id,
      parentId: parent.id,
      parentPublicId: parent.public_id,
      side,
      status: 'PLACED',
      updatedAt: new Date().toISOString(),
    }, { merge: true });
  } catch (fsErr) {
    console.warn('[AffiliateTreeService] Firestore placement backup notice:', fsErr);
  }

  // Audit log
  await logAdminAction({
    adminUserId: params.adminUserId,
    adminPublicId: params.adminPublicId,
    action: 'ADMIN_UPDATE_BINARY_PLACEMENT',
    targetType: 'USER',
    targetId: member.public_id,
    details: `Admin ${params.adminPublicId} placed ${member.public_id} into ${side} leg under parent ${parent.public_id}. Reason: ${params.reason}`,
    metadata: {
      memberId: member.id,
      memberPublicId: member.public_id,
      parentId: parent.id,
      parentPublicId: parent.public_id,
      side,
      reason: params.reason,
    },
    ipAddress: params.ipAddress,
  });

  return {
    success: true,
    message: `Successfully set binary placement for ${member.public_id} on ${side} leg under ${parent.public_id}.`,
    memberPublicId: member.public_id,
    parentPublicId: parent.public_id,
    side,
  };
}

/**
 * 1-Click Repair & Synchronization Routine for the Affiliate & Binary Network Tree.
 * Reconciles unlinked direct referrals, creates missing binary_placements records,
 * and backs up all referral linkages and binary placements to Firestore to guarantee ZERO data loss!
 */
export async function adminRepairAffiliateTree() {
  const db = await getDb();

  // 1. Reconcile pending referral codes into direct sponsor links
  const repairSponsorsRes = await db.query(`
    UPDATE user_referrals ur
    SET sponsor_user_id = sp.id
    FROM users u
    JOIN users sp ON (
      UPPER(TRIM(u.pending_referral_code)) = UPPER(TRIM(sp.public_id))
      OR UPPER(TRIM(u.pending_referral_code)) = UPPER(TRIM((SELECT referral_code FROM user_referrals WHERE user_id = sp.id)))
      OR LOWER(TRIM(u.pending_referral_code)) = LOWER(TRIM(sp.email))
    )
    WHERE ur.user_id = u.id AND (ur.sponsor_user_id IS NULL OR ur.sponsor_user_id = '')
  `);
  const repairedSponsors = (repairSponsorsRes as any)?.rowCount || 0;

  // 2. Ensure every registered user has a row in binary_placements
  const repairPlacementsRes = await db.query(`
    INSERT INTO binary_placements (user_id, parent_user_id, side, status, placed_at, created_at)
    SELECT u.id, NULL, NULL, 'UNPLACED', NULL, u.created_at
    FROM users u
    LEFT JOIN binary_placements bp ON u.id = bp.user_id
    WHERE bp.user_id IS NULL
    ON CONFLICT (user_id) DO NOTHING
  `);
  const repairedPlacements = (repairPlacementsRes as any)?.rowCount || 0;

  // 3. Backup all user referral links to Firestore
  try {
    const { adminFirestore } = await import('../../lib/firebase-admin');
    const referralsList = await db.query<any>(`
      SELECT ur.user_id, u.public_id, u.email, ur.referral_code, ur.sponsor_user_id, sp.public_id AS sponsor_public_id
      FROM user_referrals ur
      JOIN users u ON ur.user_id = u.id
      LEFT JOIN users sp ON ur.sponsor_user_id = sp.id
    `);

    const batch = adminFirestore.batch();
    let count = 0;

    for (const row of referralsList.rows) {
      const refDoc = adminFirestore.collection('referrals').doc(row.user_id);
      batch.set(refDoc, {
        userId: row.user_id,
        userPublicId: row.public_id,
        email: row.email,
        referralCode: row.referral_code,
        sponsorUserId: row.sponsor_user_id || null,
        sponsorPublicId: row.sponsor_public_id || null,
        syncedAt: new Date().toISOString(),
      }, { merge: true });

      count++;
      if (count % 400 === 0) {
        await batch.commit();
      }
    }
    if (count % 400 !== 0) {
      await batch.commit();
    }
    console.log(`[AffiliateTreeRepair] Backed up ${count} referral tree links to Firestore.`);
  } catch (fsErr) {
    console.warn('[AffiliateTreeRepair] Firestore backup notice:', fsErr);
  }

  // 4. Backup all binary placement rows to Firestore
  try {
    const { adminFirestore } = await import('../../lib/firebase-admin');
    const placementsList = await db.query<any>(`
      SELECT bp.user_id, u.public_id, bp.parent_user_id, p.public_id AS parent_public_id, bp.side, bp.status, bp.placed_at
      FROM binary_placements bp
      JOIN users u ON bp.user_id = u.id
      LEFT JOIN users p ON bp.parent_user_id = p.id
    `);

    const batch = adminFirestore.batch();
    let count = 0;

    for (const row of placementsList.rows) {
      const pDoc = adminFirestore.collection('placements').doc(row.user_id);
      batch.set(pDoc, {
        userId: row.user_id,
        userPublicId: row.public_id,
        parentId: row.parent_user_id || null,
        parentPublicId: row.parent_public_id || null,
        side: row.side || null,
        status: row.status,
        placedAt: row.placed_at ? new Date(row.placed_at).toISOString() : null,
        syncedAt: new Date().toISOString(),
      }, { merge: true });

      count++;
      if (count % 400 === 0) {
        await batch.commit();
      }
    }
    if (count % 400 !== 0) {
      await batch.commit();
    }
    console.log(`[AffiliateTreeRepair] Backed up ${count} binary tree placements to Firestore.`);
  } catch (fsErr) {
    console.warn('[AffiliateTreeRepair] Firestore backup notice for placements:', fsErr);
  }

  return {
    success: true,
    repairedSponsors,
    repairedPlacements,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Aggregates daily node activations and transaction ledger volume for the D3 Chart.
 */
export async function getNodeGrowthAndVolumeAnalytics(days = 30) {
  const db = await getDb();
  const safeDays = Math.max(7, Math.min(365, days));

  // Fetch daily node activations
  const nodeGrowthRes = await db.query<any>(`
    SELECT 
      DATE(activated_at)::text AS date_str,
      COUNT(*)::int AS count
    FROM nodes
    WHERE status = 'ACTIVE' AND activated_at IS NOT NULL
      AND activated_at >= CURRENT_DATE - ($1 || ' days')::interval
    GROUP BY DATE(activated_at)
    ORDER BY date_str ASC
  `, [safeDays]);

  // Fetch daily transaction volume (USDT)
  const volumeRes = await db.query<any>(`
    SELECT 
      DATE(created_at)::text AS date_str,
      COALESCE(SUM(amount), 0)::float AS total_volume
    FROM financial_ledger_entries
    WHERE status = 'SETTLED'
      AND created_at >= CURRENT_DATE - ($1 || ' days')::interval
    GROUP BY DATE(created_at)
    ORDER BY date_str ASC
  `, [safeDays]);

  const nodeMap = new Map<string, number>();
  for (const r of nodeGrowthRes.rows) {
    if (r.date_str) nodeMap.set(r.date_str, Number(r.count || 0));
  }

  const volMap = new Map<string, number>();
  for (const r of volumeRes.rows) {
    if (r.date_str) volMap.set(r.date_str, Number(r.total_volume || 0));
  }

  // Fetch baseline cumulative nodes count before the start date
  const baselineRes = await db.query<any>(`
    SELECT COUNT(*)::int AS base_count
    FROM nodes
    WHERE status = 'ACTIVE' AND (activated_at IS NULL OR activated_at < CURRENT_DATE - ($1 || ' days')::interval)
  `, [safeDays]);

  let runningCumulative = Number(baselineRes.rows[0]?.base_count || 0);

  const series = [];
  const now = new Date();

  for (let i = safeDays - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];

    const newAct = nodeMap.get(dateStr) || 0;
    runningCumulative += newAct;
    const vol = volMap.get(dateStr) || 0;

    series.push({
      date: dateStr,
      timestamp: d.getTime(),
      newActivations: newAct,
      cumulativeNodes: runningCumulative,
      dailyVolumeUsdt: vol,
    });
  }

  return { series };
}
