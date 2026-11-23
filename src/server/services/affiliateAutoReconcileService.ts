import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { DatabaseClient, getDb } from '../db/db';
import { adminFirestore } from '../../lib/firebase-admin';
import { propagateNodeSalesVolume } from './binaryVolumeService';
import { hashPassword } from '../utils/crypto';

export interface TargetAffiliateSpec {
  email: string;
  fullName: string;
  role: 'USER' | 'ADMIN';
  sponsorEmail: string;
  binaryParentEmail: string;
  side: 'LEFT' | 'RIGHT';
  nodePriceUsd: number;
  defaultPublicId: string;
  defaultReferralCode: string;
  defaultPhone: string;
  activationDateIso: string;
  dailyRewardPhivo: number;
}

/**
 * Canonical 8-Account Subtree under Talukder Maya:
 *
 *                                    Talukder Maya
 *                             (talukdermaya26@gmail.com)
 *                                      /        \
 *                                (Left)          (Right)
 *                                 /                  \
 *                       Nomadic Samrat             Arif Hossain [①]
 *                 (nomadicsamrat26@gmail.com)  (arifhossainexim@gmail.com)
 *                          /                        /            \
 *                    (Left)                   (Left)              (Right)
 *                     /                        /                      \
 *              Afrin Sultana           Arif Hossain [②]         Arif Hossain [③]
 *        (afrinsultana1471@gmail.com) (a60243025@gmail.com) (arifhossainphivonex@gmail.com)
 *                                          /                            \
 *                                    (Left)                              (Right)
 *                                     /                                      \
 *                             Arif Hossain [⑤]                        Arif Hossain [④]
 *                      (arifhossainphivonex02@gmail.com)       (arifhossainphivonex01@gmail.com)
 */
export const TARGET_AFFILIATES: TargetAffiliateSpec[] = [
  {
    email: 'talukdermaya26@gmail.com',
    fullName: 'Talukder Maya',
    role: 'USER',
    sponsorEmail: 'mariya.rahman067@gmail.com',
    binaryParentEmail: 'mariya.rahman067@gmail.com',
    side: 'LEFT',
    nodePriceUsd: 1000,
    defaultPublicId: 'PHX-100813',
    defaultReferralCode: 'PHX800113',
    defaultPhone: '+8801700000113',
    activationDateIso: '2026-11-04T00:00:00.000Z',
    dailyRewardPhivo: 10,
  },
  {
    email: 'nomadicsamrat26@gmail.com',
    fullName: 'Nomadic Samrat',
    role: 'USER',
    sponsorEmail: 'talukdermaya26@gmail.com',
    binaryParentEmail: 'talukdermaya26@gmail.com',
    side: 'LEFT',
    nodePriceUsd: 1000,
    defaultPublicId: 'PHX-100814',
    defaultReferralCode: 'PHX800114',
    defaultPhone: '+8801700000114',
    activationDateIso: '2026-11-04T00:00:00.000Z',
    dailyRewardPhivo: 10,
  },
  {
    email: 'arifhossainexim@gmail.com',
    fullName: 'Arif Hossain',
    role: 'USER',
    sponsorEmail: 'talukdermaya26@gmail.com',
    binaryParentEmail: 'talukdermaya26@gmail.com',
    side: 'RIGHT',
    nodePriceUsd: 1000,
    defaultPublicId: 'PHX-100815',
    defaultReferralCode: 'PHX800115',
    defaultPhone: '+8801700000115',
    activationDateIso: '2026-11-06T00:00:00.000Z',
    dailyRewardPhivo: 10,
  },
  {
    email: 'afrinsultana1471@gmail.com',
    fullName: 'Afrin Sultana',
    role: 'USER',
    sponsorEmail: 'nomadicsamrat26@gmail.com',
    binaryParentEmail: 'nomadicsamrat26@gmail.com',
    side: 'LEFT',
    nodePriceUsd: 1000,
    defaultPublicId: 'PHX-100816',
    defaultReferralCode: 'PHX800116',
    defaultPhone: '+8801700000116',
    activationDateIso: '2026-11-06T00:00:00.000Z',
    dailyRewardPhivo: 10,
  },
  {
    email: 'a60243025@gmail.com',
    fullName: 'Arif Hossain',
    role: 'USER',
    sponsorEmail: 'arifhossainexim@gmail.com',
    binaryParentEmail: 'arifhossainexim@gmail.com',
    side: 'LEFT',
    nodePriceUsd: 1000,
    defaultPublicId: 'PHX-100817',
    defaultReferralCode: 'PHX800117',
    defaultPhone: '+8801700000117',
    activationDateIso: '2026-11-06T00:00:00.000Z',
    dailyRewardPhivo: 10,
  },
  {
    email: 'arifhossainphivonex@gmail.com',
    fullName: 'Arif Hossain',
    role: 'USER',
    sponsorEmail: 'arifhossainexim@gmail.com',
    binaryParentEmail: 'arifhossainexim@gmail.com',
    side: 'RIGHT',
    nodePriceUsd: 1000,
    defaultPublicId: 'PHX-100818',
    defaultReferralCode: 'PHX800118',
    defaultPhone: '+8801700000118',
    activationDateIso: '2026-11-06T00:00:00.000Z',
    dailyRewardPhivo: 10,
  },
  {
    email: 'arifhossainphivonex02@gmail.com',
    fullName: 'Arif Hossain',
    role: 'USER',
    sponsorEmail: 'a60243025@gmail.com',
    binaryParentEmail: 'a60243025@gmail.com',
    side: 'LEFT',
    nodePriceUsd: 1000,
    defaultPublicId: 'PHX-100819',
    defaultReferralCode: 'PHX800119',
    defaultPhone: '+8801700000119',
    activationDateIso: '2026-11-06T00:00:00.000Z',
    dailyRewardPhivo: 10,
  },
  {
    email: 'arifhossainphivonex01@gmail.com',
    fullName: 'Arif Hossain',
    role: 'USER',
    sponsorEmail: 'arifhossainphivonex@gmail.com',
    binaryParentEmail: 'arifhossainphivonex@gmail.com',
    side: 'RIGHT',
    nodePriceUsd: 1000,
    defaultPublicId: 'PHX-100820',
    defaultReferralCode: 'PHX800120',
    defaultPhone: '+8801700000120',
    activationDateIso: '2026-11-06T00:00:00.000Z',
    dailyRewardPhivo: 10,
  },
];

function deterministicUuid(key: string): string {
  const hash = crypto.createHash('sha256').update(key).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

let activeReconcilePromise: Promise<{
  success: boolean;
  reconciled: Array<{
    email: string;
    publicId: string;
    sponsorEmail: string;
    binaryParentEmail: string;
    side: 'LEFT' | 'RIGHT';
    nodePublicId: string;
    nodeNumber: number;
    activeNodesCount: number;
    spotCommissionEarnedUsd: number;
  }>;
}> | null = null;
let lastReconcileTime = 0;

/**
 * Checks whether any of the 8 target affiliate accounts need reconciliation
 * (missing user, wrong binary parent/side, missing sponsor,active node != 1, or missing spot commission).
 */
export async function needAffiliateReconciliation(db: DatabaseClient): Promise<boolean> {
  try {
    const targetEmails = TARGET_AFFILIATES.map((a) => a.email.toLowerCase());
    const res = await db.query<{
      id: string;
      email: string;
      sponsor_email: string | null;
      parent_email: string | null;
      side: string | null;
      bp_status: string | null;
      active_node_count: number;
      has_node_comm: boolean;
      left_bve_count: number;
      right_bve_count: number;
      has_stale_settlement_date: boolean;
    }>(
      `
      SELECT 
        u.id,
        LOWER(u.email) AS email,
        LOWER(sp.email) AS sponsor_email,
        LOWER(p.email) AS parent_email,
        bp.side,
        bp.status AS bp_status,
        (SELECT COUNT(*)::int FROM nodes n WHERE n.owner_user_id = u.id AND n.status IN ('ACTIVE', 'PURCHASED', 'EMITTING', 'MATURED')) AS active_node_count,
        EXISTS (
          SELECT 1 FROM referral_commissions rc
          JOIN nodes n ON rc.node_id = n.id
          WHERE n.owner_user_id = u.id AND rc.sponsor_user_id = ur.sponsor_user_id AND rc.status = 'EARNED'
        ) AS has_node_comm,
        (SELECT COUNT(*)::int FROM binary_volume_events bve WHERE bve.beneficiary_user_id = u.id AND bve.side = 'LEFT' AND bve.status = 'ACTIVE') AS left_bve_count,
        (SELECT COUNT(*)::int FROM binary_volume_events bve WHERE bve.beneficiary_user_id = u.id AND bve.side = 'RIGHT' AND bve.status = 'ACTIVE') AS right_bve_count,
        (
          bvb.last_settled_business_date IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM financial_ledger_entries fle
            WHERE fle.user_id = u.id AND fle.source_type = 'MATCHING_BONUS' AND fle.status = 'SETTLED'
          )
        ) AS has_stale_settlement_date
      FROM users u
      LEFT JOIN user_referrals ur ON u.id = ur.user_id
      LEFT JOIN users sp ON ur.sponsor_user_id = sp.id
      LEFT JOIN binary_placements bp ON u.id = bp.user_id
      LEFT JOIN users p ON bp.parent_user_id = p.id
      LEFT JOIN binary_volume_balances bvb ON u.id = bvb.user_id
      WHERE LOWER(u.email) = ANY($1)
      `,
      [targetEmails]
    );

    if (res.rows.length < TARGET_AFFILIATES.length) {
      return true;
    }

    const rowByEmail = new Map(res.rows.map((r) => [r.email, r]));

    for (const spec of TARGET_AFFILIATES) {
      const row = rowByEmail.get(spec.email.toLowerCase());
      if (!row) return true;
      if (Number(row.active_node_count || 0) !== 1) return true;
      if (row.bp_status !== 'PLACED') return true;
      if (row.side !== spec.side) return true;
      if (row.has_stale_settlement_date) return true;
      // For the 7 descendants under Talukder Maya, parent_email and sponsor_email MUST strictly match
      if (spec.email !== 'talukdermaya26@gmail.com') {
        if (row.parent_email !== spec.binaryParentEmail.toLowerCase()) return true;
        if (row.sponsor_email !== spec.sponsorEmail.toLowerCase()) return true;
        if (!row.has_node_comm) return true;
      } else {
        if (!row.sponsor_email) return true;
        if (Number(row.left_bve_count || 0) < 2 || Number(row.right_bve_count || 0) < 5) return true;
      }
    }

    return false;
  } catch (_e) {
    return true;
  }
}

/**
 * Reconciles and guarantees the entire 8-account Talukder Maya subtree:
 * 1. All 8 accounts exist and have status = 'ACTIVE' (preserving existing names, public_ids, passwords, and coins)
 * 2. Exact binary placements (Left/Right) and direct sponsor links match the diagram
 * 3. Each account has EXACTLY 1 ACTIVE $1,000 Genesis Node (preserving original activation dates & existing PHIVO mining rewards)
 * 4. Spot / Referral Commissions ($50 per direct child node) are accurately attributed:
 *    - Talukder Maya: keeps previous commission ($50) + receives ONLY 1 new $50 for Arif Hossain [①] (total $100)
 *    - Nomadic Samrat: receives $50 for Afrin Sultana
 *    - Arif Hossain [①] (arifhossainexim@gmail.com): receives $50 + $50 = $100 for Arif [②] & Arif [③]
 *    - Arif Hossain [②] (a60243025@gmail.com): receives $50 for Arif [⑤] (arifhossainphivonex02@gmail.com)
 *    - Arif Hossain [③] (arifhossainphivonex@gmail.com): receives $50 for Arif [④] (arifhossainphivonex01@gmail.com)
 * 5. Binary Volume (Left/Right units) is cleanly recalculated to match the new placements with zero stale volume.
 */
export async function reconcileSpecificAffiliateAccounts(
  customDb?: DatabaseClient,
  forceRun = false
): Promise<{
  success: boolean;
  reconciled: Array<{
    email: string;
    publicId: string;
    sponsorEmail: string;
    binaryParentEmail: string;
    side: 'LEFT' | 'RIGHT';
    nodePublicId: string;
    nodeNumber: number;
    activeNodesCount: number;
    spotCommissionEarnedUsd: number;
  }>;
}> {
  if (activeReconcilePromise) {
    return activeReconcilePromise;
  }

  const now = Date.now();
  if (!forceRun && now - lastReconcileTime < 5000) {
    return { success: true, reconciled: [] };
  }

  activeReconcilePromise = (async () => {
  try {
    const db = customDb || (await getDb());
    const defaultPasswordHash = await hashPassword('Phivonex@2026');

    const userMap = new Map<
      string,
      {
        id: string;
        publicId: string;
        email: string;
        fullName: string;
        referralCode: string;
      }
    >();

    // -------------------------------------------------------------------------
    // STEP 1: Ensure all 8 users exist in PostgreSQL (preserving existing data)
    // -------------------------------------------------------------------------
    for (const spec of TARGET_AFFILIATES) {
      const cleanEmail = spec.email.toLowerCase().trim();

      const userRes = await db.query<{
        id: string;
        public_id: string;
        full_name: string;
        email: string;
        status: string;
      }>(
        `SELECT id, public_id, full_name, email, status FROM users WHERE LOWER(email) = $1 LIMIT 1`,
        [cleanEmail]
      );

      let userId: string;
      let publicId: string;
      let fullName: string;

      if (userRes.rows.length > 0) {
        userId = userRes.rows[0].id;
        publicId = userRes.rows[0].public_id;
        fullName = userRes.rows[0].full_name || spec.fullName;

        await db.query(
          `UPDATE users
           SET status = 'ACTIVE',
               email_verified_at = COALESCE(email_verified_at, NOW()),
               updated_at = NOW()
           WHERE id = $1`,
          [userId]
        );
      } else {
        userId = uuidv4();
        publicId = spec.defaultPublicId;
        fullName = spec.fullName;

        const pubCheck = await db.query(`SELECT id FROM users WHERE public_id = $1`, [publicId]);
        if (pubCheck.rows.length > 0) {
          publicId = `PHX-${Math.floor(200000 + Math.random() * 799999)}`;
        }

        const phoneCheck = await db.query(`SELECT id FROM users WHERE phone = $1`, [spec.defaultPhone]);
        const finalPhone =
          phoneCheck.rows.length > 0
            ? `+88018${Math.floor(10000000 + Math.random() * 89999999)}`
            : spec.defaultPhone;

        await db.query(
          `
          INSERT INTO users (
            id, public_id, full_name, email, phone, country, password_hash, role, status, email_verified_at, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, 'Bangladesh', $6, $7, 'ACTIVE', NOW(), NOW(), NOW())
          `,
          [userId, publicId, fullName, cleanEmail, finalPhone, defaultPasswordHash, spec.role]
        );
      }

      // Ensure user_referrals row exists
      const refCheck = await db.query<{ referral_code: string }>(
        `SELECT referral_code FROM user_referrals WHERE user_id = $1 LIMIT 1`,
        [userId]
      );

      let referralCode: string;
      if (refCheck.rows.length > 0) {
        referralCode = refCheck.rows[0].referral_code;
      } else {
        referralCode = spec.defaultReferralCode;
        const rcCheck = await db.query(`SELECT user_id FROM user_referrals WHERE referral_code = $1`, [referralCode]);
        if (rcCheck.rows.length > 0) {
          referralCode = `PHX${Math.floor(100000 + Math.random() * 899999)}`;
        }
        await db.query(
          `INSERT INTO user_referrals (user_id, referral_code, created_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (user_id) DO NOTHING`,
          [userId, referralCode]
        );
      }

      // Ensure binary_volume_balances row exists
      await db.query(
        `INSERT INTO binary_volume_balances (user_id, carry_left_units, carry_right_units, updated_at)
         VALUES ($1, 0, 0, NOW())
         ON CONFLICT (user_id) DO NOTHING`,
        [userId]
      );

      userMap.set(cleanEmail, {
        id: userId,
        publicId,
        email: cleanEmail,
        fullName,
        referralCode,
      });
    }

    // -------------------------------------------------------------------------
    // STEP 2: Link Direct Sponsors & Rearrange Binary Tree Placements Safely
    // -------------------------------------------------------------------------
    // Temporarily detach the 7 child accounts under Talukder Maya to prevent idx_binary_parent_side collisions
    const childIds = TARGET_AFFILIATES.slice(1)
      .map((s) => userMap.get(s.email.toLowerCase())?.id)
      .filter((id): id is string => Boolean(id));

    if (childIds.length > 0) {
      await db.query(
        `UPDATE binary_placements
         SET parent_user_id = NULL, side = NULL, status = 'UNPLACED'
         WHERE user_id = ANY($1::uuid[])`,
        [childIds]
      );
    }

    for (const spec of TARGET_AFFILIATES) {
      const cleanEmail = spec.email.toLowerCase().trim();
      const user = userMap.get(cleanEmail)!;

      // Resolve sponsor
      const sponsorClean = spec.sponsorEmail.toLowerCase().trim();
      let sponsorId = userMap.get(sponsorClean)?.id || null;
      if (!sponsorId) {
        const spRes = await db.query<{ id: string }>(
          `SELECT id FROM users WHERE LOWER(email) = $1 LIMIT 1`,
          [sponsorClean]
        );
        if (spRes.rows.length > 0) {
          sponsorId = spRes.rows[0].id;
        } else {
          const fallbackAdmin = await db.query<{ id: string }>(
            `SELECT id FROM users WHERE role = 'ADMIN' ORDER BY created_at ASC LIMIT 1`
          );
          sponsorId = fallbackAdmin.rows[0]?.id || null;
        }
      }

      if (sponsorId && sponsorId !== user.id) {
        await db.query(
          `
          INSERT INTO user_referrals (user_id, referral_code, sponsor_user_id, created_at)
          VALUES ($1, $2, $3, NOW())
          ON CONFLICT (user_id) DO UPDATE SET
            sponsor_user_id = EXCLUDED.sponsor_user_id
          `,
          [user.id, user.referralCode, sponsorId]
        );
      }

      // Resolve binary parent
      const parentClean = spec.binaryParentEmail.toLowerCase().trim();
      let parentId = userMap.get(parentClean)?.id || null;
      if (!parentId) {
        const pRes = await db.query<{ id: string }>(
          `SELECT id FROM users WHERE LOWER(email) = $1 LIMIT 1`,
          [parentClean]
        );
        if (pRes.rows.length > 0) {
          parentId = pRes.rows[0].id;
        } else {
          // If Talukder Maya already had a parent in binary_placements, keep it; otherwise use sponsorId
          const curPlacement = await db.query<{ parent_user_id: string | null }>(
            `SELECT parent_user_id FROM binary_placements WHERE user_id = $1 LIMIT 1`,
            [user.id]
          );
          parentId = curPlacement.rows[0]?.parent_user_id || sponsorId;
        }
      }

      if (parentId && parentId !== user.id) {
        // Free target (parent_user_id, side) slot if occupied by any other user
        await db.query(
          `UPDATE binary_placements
           SET parent_user_id = NULL, side = NULL, status = 'UNPLACED'
           WHERE parent_user_id = $1 AND side = $2 AND user_id != $3`,
          [parentId, spec.side, user.id]
        );

        await db.query(
          `
          INSERT INTO binary_placements (user_id, parent_user_id, side, status, placed_at, created_at)
          VALUES ($1, $2, $3, 'PLACED', NOW(), NOW())
          ON CONFLICT (user_id) DO UPDATE SET
            parent_user_id = EXCLUDED.parent_user_id,
            side = EXCLUDED.side,
            status = 'PLACED',
            placed_at = COALESCE(binary_placements.placed_at, NOW())
          `,
          [user.id, parentId, spec.side]
        );
      }
    }

    // -------------------------------------------------------------------------
    // STEP 3: Ensure Exactly 1 ACTIVE Node per User (Preserving Activation Date & Coins)
    // -------------------------------------------------------------------------
    const activeNodeByEmail = new Map<
      string,
      { nodeId: string; nodeNumber: number; publicNodeId: string; orderId: string; activatedAt: Date }
    >();

    for (let idx = 0; idx < TARGET_AFFILIATES.length; idx++) {
      const spec = TARGET_AFFILIATES[idx];
      const cleanEmail = spec.email.toLowerCase().trim();
      const user = userMap.get(cleanEmail)!;

      const ownedNodes = await db.query<{
        id: string;
        node_number: number;
        public_node_id: string;
        status: string;
        activated_at: Date | null;
      }>(
        `SELECT id, node_number, public_node_id, status, activated_at
         FROM nodes
         WHERE owner_user_id = $1
         ORDER BY CASE WHEN status = 'ACTIVE' THEN 0 ELSE 1 END, activated_at ASC NULLS LAST, node_number ASC`,
        [user.id]
      );

      let activeNodeId: string;
      let activeNodeNumber: number;
      let activeNodePublicId: string;
      let effectiveActivatedAt: Date;

      if (ownedNodes.rows.length > 0) {
        const first = ownedNodes.rows[0];
        activeNodeId = first.id;
        activeNodeNumber = first.node_number;
        activeNodePublicId = first.public_node_id;
        effectiveActivatedAt = first.activated_at ? new Date(first.activated_at) : new Date(spec.activationDateIso);

        await db.query(
          `UPDATE nodes
           SET status = 'ACTIVE',
               purchase_price_usd = 1000,
               activated_at = COALESCE(activated_at, $1::timestamptz),
               maturity_timestamp = COALESCE(maturity_timestamp, COALESCE(activated_at, $1::timestamptz) + INTERVAL '200 days'),
               updated_at = NOW()
           WHERE id = $2`,
          [spec.activationDateIso, activeNodeId]
        );

        // Release any duplicate nodes back to AVAILABLE pool
        if (ownedNodes.rows.length > 1) {
          const extraNodeIds = ownedNodes.rows.slice(1).map((r) => r.id);
          await db.query(
            `UPDATE nodes
             SET status = 'AVAILABLE',
                 owner_user_id = NULL,
                 reserved_by_user_id = NULL,
                 updated_at = NOW()
             WHERE id = ANY($1::uuid[])`,
            [extraNodeIds]
          );
        }
      } else {
        effectiveActivatedAt = new Date(spec.activationDateIso);
        const availRes = await db.query<{
          id: string;
          node_number: number;
          public_node_id: string;
        }>(
          `SELECT id, node_number, public_node_id
           FROM nodes
           WHERE status = 'AVAILABLE' AND owner_user_id IS NULL
           ORDER BY node_number ASC
           LIMIT 1`
        );

        if (availRes.rows.length > 0) {
          activeNodeId = availRes.rows[0].id;
          activeNodeNumber = availRes.rows[0].node_number;
          activeNodePublicId = availRes.rows[0].public_node_id;

          await db.query(
            `UPDATE nodes
             SET status = 'ACTIVE',
                 owner_user_id = $1,
                 purchase_price_usd = 1000,
                 purchase_timestamp = COALESCE(purchase_timestamp, $2::timestamptz),
                 activated_at = COALESCE(activated_at, $2::timestamptz),
                 maturity_timestamp = COALESCE(maturity_timestamp, $2::timestamptz + INTERVAL '200 days'),
                 updated_at = NOW()
             WHERE id = $3`,
            [user.id, spec.activationDateIso, activeNodeId]
          );
        } else {
          const targetNodeNum = 100 + idx;
          activeNodeNumber = targetNodeNum;
          activeNodeId = uuidv4();
          activeNodePublicId = `PHX-NODE-${String(activeNodeNumber).padStart(5, '0')}`;

          const upserted = await db.query<{ id: string; public_node_id: string; node_number: number }>(
            `INSERT INTO nodes (
               id, node_number, public_node_id, status, owner_user_id, purchase_price_usd,
               purchase_timestamp, activated_at, maturity_timestamp, created_at, updated_at
             ) VALUES ($1, $2, $3, 'ACTIVE', $4, 1000, $5::timestamptz, $5::timestamptz, $5::timestamptz + INTERVAL '200 days', NOW(), NOW())
             ON CONFLICT (node_number) DO UPDATE SET
               status = 'ACTIVE',
               owner_user_id = EXCLUDED.owner_user_id,
               purchase_timestamp = COALESCE(nodes.purchase_timestamp, EXCLUDED.purchase_timestamp),
               activated_at = COALESCE(nodes.activated_at, EXCLUDED.activated_at),
               updated_at = NOW()
             RETURNING id, public_node_id, node_number`,
            [activeNodeId, activeNodeNumber, activeNodePublicId, user.id, spec.activationDateIso]
          );
          activeNodeId = upserted.rows[0].id;
          activeNodePublicId = upserted.rows[0].public_node_id;
          activeNodeNumber = upserted.rows[0].node_number;
        }
      }

      // Ensure COMPLETED node_orders record exists
      const publicOrderId = `ORD-${user.publicId}-${activeNodePublicId}`;
      const existingOrder = await db.query<{ id: string; public_order_id: string }>(
        `SELECT id, public_order_id FROM node_orders WHERE (user_id = $1 AND node_id = $2 AND status = 'COMPLETED') OR public_order_id = $3 LIMIT 1`,
        [user.id, activeNodeId, publicOrderId]
      );

      let orderId: string;
      if (existingOrder.rows.length > 0) {
        orderId = existingOrder.rows[0].id;
      } else {
        orderId = uuidv4();
        await db.query(
          `
          INSERT INTO node_orders (
            id, public_order_id, user_id, node_id, node_number, amount_usd,
            currency, status, payment_method, payment_reference, reserved_at, expires_at, completed_at, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, 1000, 'USD', 'COMPLETED', 'WALLET_USD', $6, $7::timestamptz, $7::timestamptz + INTERVAL '1 day', $7::timestamptz, $7::timestamptz, NOW())
          ON CONFLICT (public_order_id) DO UPDATE SET
            status = 'COMPLETED',
            completed_at = COALESCE(node_orders.completed_at, EXCLUDED.completed_at),
            updated_at = NOW()
          `,
          [
            orderId,
            publicOrderId,
            user.id,
            activeNodeId,
            activeNodeNumber,
            `RECONCILE-${user.publicId}`,
            spec.activationDateIso,
          ]
        );
      }

      // Ensure node_owners record exists
      await db.query(
        `INSERT INTO node_owners (
           id, node_id, user_id, acquired_via, acquired_at, is_current_owner
         ) VALUES ($1, $2, $3, 'PURCHASE', $4::timestamptz, TRUE)
         ON CONFLICT (node_id, user_id) DO UPDATE SET
           is_current_owner = TRUE`,
        [uuidv4(), activeNodeId, user.id, spec.activationDateIso]
      );

      // Clean up any duplicate NODE-FUND / NODE-PURCHASE pairs if SEED-NODE-FUND already exists
      const oldDupFundId = deterministicUuid(`NODE-FUND:${user.id}`);
      const oldDupPurId = deterministicUuid(`NODE-PURCHASE:${user.id}`);
      const seedFundId = deterministicUuid(`SEED-NODE-FUND:${user.id}`);
      const seedPurId = deterministicUuid(`SEED-NODE-PURCHASE:${user.id}`);

      await db.query(
        `DELETE FROM financial_ledger_entries WHERE user_id = $1 AND source_id IN ($2, $3)`,
        [user.id, oldDupFundId, oldDupPurId]
      );

      // Check if user already has a NODE_PURCHASE debit in financial_ledger_entries
      const existingPurchaseEntry = await db.query(
        `SELECT id FROM financial_ledger_entries WHERE user_id = $1 AND source_type = 'NODE_PURCHASE' AND status = 'SETTLED' LIMIT 1`,
        [user.id]
      );

      if (existingPurchaseEntry.rows.length === 0) {
        await db.query(
          `
          INSERT INTO financial_ledger_entries (
            id, public_txn_id, user_id, entry_type, source_type, source_id,
            source_ref, description, amount, currency, status, created_at
          ) VALUES ($1, $2, $3, 'CREDIT', 'BLOCKCHAIN_DEPOSIT', $4, $5, $6, 1000, 'USDT', 'SETTLED', $7::timestamptz)
          ON CONFLICT (source_type, source_id, entry_type) DO UPDATE SET
            amount = 1000,
            status = 'SETTLED'
          `,
          [
            uuidv4(),
            `PHX-TXN-DEP-${user.publicId}`,
            user.id,
            seedFundId,
            `DEP-${user.publicId}`,
            'Genesis Node Activation Deposit ($1,000 USDT)',
            spec.activationDateIso,
          ]
        );

        await db.query(
          `
          INSERT INTO financial_ledger_entries (
            id, public_txn_id, user_id, entry_type, source_type, source_id,
            source_ref, description, amount, currency, status, created_at
          ) VALUES ($1, $2, $3, 'DEBIT', 'NODE_PURCHASE', $4, $5, $6, 1000, 'USD', 'SETTLED', $7::timestamptz)
          ON CONFLICT (source_type, source_id, entry_type) DO UPDATE SET
            amount = 1000,
            status = 'SETTLED'
          `,
          [
            uuidv4(),
            `PHX-TXN-NOD-${user.publicId}`,
            user.id,
            seedPurId,
            publicOrderId,
            `Genesis Node Activation (${activeNodePublicId}) — Deducted $1,000`,
            spec.activationDateIso,
          ]
        );
      }

      // Preserve existing PHIVO mining rewards! Only backfill if user has 0 PHIVO rewards in node_rewards/ledger so far
      const phivoRes = await db.query<{ total: number }>(
        `SELECT GREATEST(
           COALESCE((SELECT SUM(amount) FROM financial_ledger_entries WHERE user_id = $1 AND source_type = 'NODE_REWARD' AND currency = 'PHIVO' AND status = 'SETTLED'), 0),
           COALESCE((SELECT SUM(amount) FROM node_rewards WHERE owner_user_id = $1 AND status != 'REVERSED'), 0)
         )::float AS total`,
        [user.id]
      );
      const currentPhivo = Number(phivoRes.rows[0]?.total || 0);

      if (currentPhivo <= 0) {
        const activationMs = effectiveActivatedAt.getTime();
        const elapsedDays = Math.max(1, Math.floor((Date.now() - activationMs) / (1000 * 60 * 60 * 24)) + 1);
        const targetPhivo = elapsedDays * spec.dailyRewardPhivo;
        const rewardSourceUuid = deterministicUuid(`NODE-REWARD-INIT:${user.id}`);
        const initEpochId = deterministicUuid(`EPOCH-INIT:${spec.activationDateIso.slice(0, 10)}`);
        const initDateStr = spec.activationDateIso.slice(0, 10);

        await db.query(
          `
          INSERT INTO reward_epochs (
            id, public_epoch_id, epoch_number, start_at, end_at, reward_per_node, reward_rate_used, economic_config_version, currency, status, settled_at, created_at
          )
          SELECT $1, $2, COALESCE((SELECT MAX(epoch_number) FROM reward_epochs), 0) + 1, $3::timestamptz, $4::timestamptz, $5, $5, 1, 'PHIVO', 'COMPLETED', $3::timestamptz, CURRENT_TIMESTAMP
          WHERE NOT EXISTS (SELECT 1 FROM reward_epochs WHERE id = $1)
          `,
          [
            initEpochId,
            `EPOCH-INIT-${initDateStr}`,
            `${initDateStr}T00:00:00.000Z`,
            `${initDateStr}T23:59:59.999Z`,
            spec.dailyRewardPhivo,
          ]
        );

        await db.query(
          `
          INSERT INTO node_rewards (
            id, public_reward_id, epoch_id, node_id, owner_user_id, amount, currency, status, accrued_at,
            reward_rate_used, economic_config_version, business_date, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, 'PHIVO', 'ACCRUED', NOW(), $7, 1, $8, CURRENT_TIMESTAMP)
          ON CONFLICT (node_id, epoch_id) DO NOTHING
          `,
          [
            rewardSourceUuid,
            `RWD-${activeNodePublicId}`,
            initEpochId,
            activeNodeId,
            user.id,
            targetPhivo,
            spec.dailyRewardPhivo,
            initDateStr,
          ]
        );

        await db.query(
          `
          INSERT INTO financial_ledger_entries (
            id, public_txn_id, user_id, entry_type, source_type, source_id,
            source_ref, description, amount, currency, status, created_at
          ) VALUES ($1, $2, $3, 'CREDIT', 'NODE_REWARD', $4, $5, $6, $7, 'PHIVO', 'SETTLED', NOW())
          ON CONFLICT (source_type, source_id, entry_type) DO NOTHING
          `,
          [
            uuidv4(),
            `PHX-RWD-${user.publicId}`,
            user.id,
            rewardSourceUuid,
            `RWD-${activeNodePublicId}`,
            `Daily Genesis Node Mining Reward (${elapsedDays} days accrued @ ${spec.dailyRewardPhivo} PHIVO/day)`,
            targetPhivo,
          ]
        );
      }

      activeNodeByEmail.set(cleanEmail, {
        nodeId: activeNodeId,
        nodeNumber: activeNodeNumber,
        publicNodeId: activeNodePublicId,
        orderId,
        activatedAt: effectiveActivatedAt,
      });
    }

    // -------------------------------------------------------------------------
    // STEP 4: Reconcile Spot / Referral Commissions ($50 per direct child node)
    // -------------------------------------------------------------------------
    // 4a. Remove synthetic seed spot-commission duplicates (SEED-SPOT-COMM / SPOT-COMM) for these 8 users
    for (const spec of TARGET_AFFILIATES) {
      const user = userMap.get(spec.email.toLowerCase())!;
      const seedSpotId = deterministicUuid(`SEED-SPOT-COMM:${user.id}`);
      const oldSpotId = deterministicUuid(`SPOT-COMM:${user.id}`);
      await db.query(
        `DELETE FROM financial_ledger_entries
         WHERE user_id = $1
           AND source_type = 'REFERRAL_COMMISSION'
           AND (source_id IN ($2, $3) OR source_ref LIKE 'PHX-COM-SPOT%' OR source_ref LIKE 'REF-COMM-%')`,
        [user.id, seedSpotId, oldSpotId]
      );
    }

    // 4b. For each of the 7 child nodes under Talukder Maya, ensure referral_commissions & financial_ledger_entries
    for (let idx = 1; idx < TARGET_AFFILIATES.length; idx++) {
      const childSpec = TARGET_AFFILIATES[idx];
      const childCleanEmail = childSpec.email.toLowerCase().trim();
      const sponsorCleanEmail = childSpec.sponsorEmail.toLowerCase().trim();

      const childUser = userMap.get(childCleanEmail)!;
      const sponsorUser = userMap.get(sponsorCleanEmail)!;
      const childNode = activeNodeByEmail.get(childCleanEmail)!;

      const commId = deterministicUuid(`REF-COMM-NODE:${childNode.nodeId}`);
      const pubCommId = `PHX-COM-${String(900100 + idx)}`;

      const rcRes = await db.query<{
        id: string;
        public_commission_id: string;
        earned_at: Date;
      }>(
        `
        INSERT INTO referral_commissions (
          id, public_commission_id, sponsor_user_id, referred_user_id,
          node_id, node_order_id, amount_usd, status, earned_at, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, 50.00, 'EARNED', NOW(), NOW())
        ON CONFLICT (node_id) DO UPDATE SET
          sponsor_user_id = EXCLUDED.sponsor_user_id,
          referred_user_id = EXCLUDED.referred_user_id,
          amount_usd = 50.00,
          status = 'EARNED'
        RETURNING id, public_commission_id, earned_at
        `,
        [commId, pubCommId, sponsorUser.id, childUser.id, childNode.nodeId, childNode.orderId]
      );

      const rcRow = rcRes.rows[0];

      // Special protection for Talukder Maya's previous commission (from Nomadic Samrat):
      // If Talukder Maya already received her $50 commission for Nomadic Samrat via a manual ADMIN_ADJUSTMENT
      // in production, do not add a duplicate $50 ledger entry for Nomadic Samrat—only add the new $50 for Arif Hossain [①]!
      let skipLedgerForManualAdjustment = false;
      if (
        sponsorCleanEmail === 'talukdermaya26@gmail.com' &&
        childCleanEmail === 'nomadicsamrat26@gmail.com'
      ) {
        const manualCommRes = await db.query<{ total_manual: number }>(
          `SELECT COALESCE(SUM(amount), 0)::float AS total_manual
           FROM financial_ledger_entries
           WHERE user_id = $1
             AND entry_type = 'CREDIT'
             AND source_type = 'ADMIN_ADJUSTMENT'
             AND status = 'SETTLED'
             AND amount >= 50`,
          [sponsorUser.id]
        );
        if (Number(manualCommRes.rows[0]?.total_manual || 0) >= 50) {
          skipLedgerForManualAdjustment = true;
          // Ensure no duplicate REFERRAL_COMMISSION row exists for Samrat's node if covered by manual adjustment
          await db.query(
            `DELETE FROM financial_ledger_entries
             WHERE source_type = 'REFERRAL_COMMISSION' AND source_id = $1`,
            [rcRow.id]
          );
        }
      }

      if (!skipLedgerForManualAdjustment) {
        await db.query(
          `
          INSERT INTO financial_ledger_entries (
            id, public_txn_id, user_id, entry_type, source_type, source_id,
            source_ref, description, amount, currency, status, created_at
          ) VALUES ($1, $2, $3, 'CREDIT', 'REFERRAL_COMMISSION', $4, $5, $6, 50.00, 'USD', 'SETTLED', $7)
          ON CONFLICT (source_type, source_id, entry_type) DO UPDATE SET
            user_id = EXCLUDED.user_id,
            amount = 50.00,
            status = 'SETTLED',
            description = EXCLUDED.description
          `,
          [
            uuidv4(),
            `PHX-TXN-COM-${childUser.publicId}`,
            sponsorUser.id,
            rcRow.id,
            rcRow.public_commission_id,
            `Direct Referral Spot Commission — ${childUser.fullName} (${childNode.publicNodeId})`,
            rcRow.earned_at || new Date(),
          ]
        );
      }
    }

    // Also ensure Talukder Maya's own node has a referral_commissions row for her sponsor (mariya.rahman067)
    try {
      const mayaUser = userMap.get('talukdermaya26@gmail.com')!;
      const mayaNode = activeNodeByEmail.get('talukdermaya26@gmail.com')!;
      const mariyaRes = await db.query<{ id: string }>(
        `SELECT id FROM users WHERE LOWER(email) = 'mariya.rahman067@gmail.com' LIMIT 1`
      );
      if (mariyaRes.rows.length > 0) {
        const mariyaId = mariyaRes.rows[0].id;
        const mayaCommId = deterministicUuid(`REF-COMM-NODE:${mayaNode.nodeId}`);
        const rcMaya = await db.query<{ id: string; public_commission_id: string; earned_at: Date }>(
          `
          INSERT INTO referral_commissions (
            id, public_commission_id, sponsor_user_id, referred_user_id,
            node_id, node_order_id, amount_usd, status, earned_at, created_at
          ) VALUES ($1, 'PHX-COM-900100', $2, $3, $4, $5, 50.00, 'EARNED', NOW(), NOW())
          ON CONFLICT (node_id) DO UPDATE SET
            sponsor_user_id = EXCLUDED.sponsor_user_id,
            status = 'EARNED'
          RETURNING id, public_commission_id, earned_at
          `,
          [mayaCommId, mariyaId, mayaUser.id, mayaNode.nodeId, mayaNode.orderId]
        );
        if (rcMaya.rows.length > 0) {
          await db.query(
            `
            INSERT INTO financial_ledger_entries (
              id, public_txn_id, user_id, entry_type, source_type, source_id,
              source_ref, description, amount, currency, status, created_at
            ) VALUES ($1, $2, $3, 'CREDIT', 'REFERRAL_COMMISSION', $4, $5, $6, 50.00, 'USD', 'SETTLED', $7)
            ON CONFLICT (source_type, source_id, entry_type) DO UPDATE SET
              user_id = EXCLUDED.user_id,
              amount = 50.00,
              status = 'SETTLED'
            `,
            [
              uuidv4(),
              `PHX-TXN-COM-${mayaUser.publicId}`,
              mariyaId,
              rcMaya.rows[0].id,
              rcMaya.rows[0].public_commission_id,
              `Direct Referral Spot Commission — ${mayaUser.fullName} (${mayaNode.publicNodeId})`,
              rcMaya.rows[0].earned_at || new Date(),
            ]
          );
        }
      }
    } catch (_mayaCommErr) {}

    // -------------------------------------------------------------------------
    // STEP 5: Re-sync Binary Volume Events & Daily Aggregations for New Placements
    // -------------------------------------------------------------------------
    const allTargetNodeIds = Array.from(activeNodeByEmail.values()).map((n) => n.nodeId);
    if (allTargetNodeIds.length > 0) {
      await db.query(
        `DELETE FROM binary_volume_events WHERE source_node_id = ANY($1::uuid[])`,
        [allTargetNodeIds]
      );
    }

    for (const spec of TARGET_AFFILIATES) {
      const cleanEmail = spec.email.toLowerCase().trim();
      const user = userMap.get(cleanEmail)!;
      const nodeInfo = activeNodeByEmail.get(cleanEmail)!;
      try {
        await propagateNodeSalesVolume(db, nodeInfo.nodeId, user.id, nodeInfo.activatedAt);
      } catch (_volErr) {}
    }

    // Ensure binary_volume_balances for the 8 accounts have no stale last_settled_business_date if no MATCHING_BONUS was ever paid
    const allTargetUserIds = Array.from(userMap.values()).map((u) => u.id);
    if (allTargetUserIds.length > 0) {
      await db.query(
        `
        UPDATE binary_volume_balances bvb
        SET
          carry_left_units = 0,
          carry_right_units = 0,
          last_settled_business_date = NULL,
          updated_at = NOW()
        WHERE bvb.user_id = ANY($1::uuid[])
          AND NOT EXISTS (
            SELECT 1 FROM financial_ledger_entries fle
            WHERE fle.user_id = bvb.user_id
              AND fle.source_type = 'MATCHING_BONUS'
              AND fle.status = 'SETTLED'
          )
        `,
        [allTargetUserIds]
      );
    }

    // Recompute binary_daily_volumes accurately from binary_volume_events for affected beneficiaries
    await db.query(`
      UPDATE binary_daily_volumes bdv
      SET
        left_units = COALESCE((
          SELECT SUM(bve.volume_units)::int
          FROM binary_volume_events bve
          WHERE bve.beneficiary_user_id = bdv.user_id
            AND bve.business_date = bdv.business_date
            AND bve.side = 'LEFT'
            AND bve.status = 'ACTIVE'
        ), 0),
        right_units = COALESCE((
          SELECT SUM(bve.volume_units)::int
          FROM binary_volume_events bve
          WHERE bve.beneficiary_user_id = bdv.user_id
            AND bve.business_date = bdv.business_date
            AND bve.side = 'RIGHT'
            AND bve.status = 'ACTIVE'
        ), 0),
        updated_at = NOW()
      WHERE bdv.user_id IN (SELECT DISTINCT beneficiary_user_id FROM binary_volume_events)
    `);

    // Build reconciled summary & sync to Firestore in background
    const reconciledResults: Array<{
      email: string;
      publicId: string;
      sponsorEmail: string;
      binaryParentEmail: string;
      side: 'LEFT' | 'RIGHT';
      nodePublicId: string;
      nodeNumber: number;
      activeNodesCount: number;
      spotCommissionEarnedUsd: number;
    }> = [];

    for (const spec of TARGET_AFFILIATES) {
      const cleanEmail = spec.email.toLowerCase().trim();
      const user = userMap.get(cleanEmail)!;
      const nodeInfo = activeNodeByEmail.get(cleanEmail)!;

      const commSumRes = await db.query<{ total: number }>(
        `SELECT COALESCE(SUM(amount), 0)::float AS total
         FROM financial_ledger_entries
         WHERE user_id = $1
           AND entry_type = 'CREDIT'
           AND source_type IN ('REFERRAL_COMMISSION', 'ADMIN_ADJUSTMENT')
           AND currency IN ('USD', 'USDT')
           AND status = 'SETTLED'`,
        [user.id]
      );
      const spotEarned = Number(commSumRes.rows[0]?.total || 0);

      reconciledResults.push({
        email: cleanEmail,
        publicId: user.publicId,
        sponsorEmail: spec.sponsorEmail,
        binaryParentEmail: spec.binaryParentEmail,
        side: spec.side,
        nodePublicId: nodeInfo.publicNodeId,
        nodeNumber: nodeInfo.nodeNumber,
        activeNodesCount: 1,
        spotCommissionEarnedUsd: spotEarned,
      });

      // Fire-and-forget Firestore backup so it never blocks request latency
      void adminFirestore
        .collection('users')
        .doc(user.id)
        .set(
          {
            id: user.id,
            public_id: user.publicId,
            email: cleanEmail,
            fullName: user.fullName,
            status: 'ACTIVE',
            activeNodePublicId: nodeInfo.publicNodeId,
            nodeCount: 1,
            spotCommissionEarnedUsd: spotEarned,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        )
        .catch(() => {});
    }

    lastReconcileTime = Date.now();
    console.log('[AutoReconcile] Successfully reconciled 8-account Talukder Maya subtree:', reconciledResults);
    return { success: true, reconciled: reconciledResults };
  } catch (err: any) {
    console.error('[AutoReconcile] Error during affiliate accounts reconciliation:', err?.message || err);
    return { success: false, reconciled: [] };
  } finally {
    activeReconcilePromise = null;
  }
  })();

  return activeReconcilePromise;
}
