import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { DatabaseClient, getDb } from '../db/db';
import { adminFirestore, adminAuth } from '../../lib/firebase-admin';
import { propagateNodeSalesVolume } from './binaryVolumeService';
import { hashPassword } from '../utils/crypto';

interface TargetAffiliateSpec {
  email: string;
  fullName: string;
  role: 'USER' | 'ADMIN';
  sponsorEmail: string;
  binaryParentEmail: string;
  side: 'LEFT' | 'RIGHT';
  nodePriceUsd: number;
  referralCommissionUsd: number;
  activationDateIso: string;
  dailyRewardPhivo: number;
}

const TARGET_AFFILIATES: TargetAffiliateSpec[] = [
  {
    email: 'talukdermaya26@gmail.com',
    fullName: 'Talukder Maya',
    role: 'USER',
    sponsorEmail: 'mariya.rahman067@gmail.com',
    binaryParentEmail: 'mariya.rahman067@gmail.com',
    side: 'LEFT',
    nodePriceUsd: 1000,
    referralCommissionUsd: 50, // $50 spot commission for referring Nomadic Samrat
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
    referralCommissionUsd: 0,
    activationDateIso: '2026-11-04T00:00:00.000Z',
    dailyRewardPhivo: 10,
  },
];

function deterministicUuid(key: string): string {
  const hash = crypto.createHash('sha256').update(key).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

let isReconciling = false;
let lastReconcileTime = 0;

/**
 * Checks whether the special affiliate accounts need reconciliation.
 * Returns true if any of the target accounts has 0 active nodes or missing sponsor.
 */
export async function needAffiliateReconciliation(db: DatabaseClient): Promise<boolean> {
  try {
    const res = await db.query<{
      email: string;
      sponsor_user_id: string | null;
      active_node_count: number;
    }>(
      `
      SELECT 
        u.email,
        ur.sponsor_user_id,
        (SELECT COUNT(*)::int FROM nodes n WHERE n.owner_user_id = u.id AND n.status IN ('ACTIVE', 'PURCHASED', 'EMITTING', 'MATURED')) AS active_node_count
      FROM users u
      LEFT JOIN user_referrals ur ON u.id = ur.user_id
      WHERE LOWER(u.email) IN ('talukdermaya26@gmail.com', 'nomadicsamrat26@gmail.com')
      `
    );

    // If either user is missing from DB, or has 0 active nodes, or has no sponsor, we must reconcile!
    if (res.rows.length < 2) return true;
    for (const r of res.rows) {
      if (Number(r.active_node_count || 0) !== 1) return true;
      if (!r.sponsor_user_id) return true;
    }
    return false;
  } catch (_e) {
    return true;
  }
}

/**
 * Reconciles and guarantees that talukdermaya26@gmail.com and nomadicsamrat26@gmail.com:
 * 1. Exist and have status = 'ACTIVE'
 * 2. Are linked to their proper sponsors (mariya.rahman067 -> talukdermaya -> nomadicsamrat)
 * 3. Have EXACTLY 1 ACTIVE $1,000 Genesis Node assigned (no 0, no duplicates)
 * 4. Have completed node order and ledger entries ($1000 deposit credit, $1000 purchase debit)
 * 5. Have $50 USDT referral commission credited to talukdermaya26@gmail.com
 * 6. Have daily mining rewards (10 PHIVO/day) credited from activation date to today
 */
export async function reconcileSpecificAffiliateAccounts(customDb?: DatabaseClient): Promise<{
  success: boolean;
  reconciled: Array<{
    email: string;
    publicId: string;
    nodePublicId: string;
    nodeNumber: number;
    activeNodesCount: number;
    spotCommissionUsd: number;
    miningRewardPhivo: number;
  }>;
}> {
  // Prevent parallel overlapping runs
  if (isReconciling) {
    return { success: true, reconciled: [] };
  }

  // Throttle to max once every 5 seconds unless forced
  const now = Date.now();
  if (now - lastReconcileTime < 5000) {
    return { success: true, reconciled: [] };
  }

  isReconciling = true;
  try {
    const db = customDb || (await getDb());
    const defaultPasswordHash = await hashPassword('Phivonex@2026');
    const reconciledResults: any[] = [];

    // Step 1: Ensure users exist in users table
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

      if (userRes.rows.length > 0) {
        userId = userRes.rows[0].id;
        publicId = userRes.rows[0].public_id;

        await db.query(
          `UPDATE users SET status = 'ACTIVE', email_verified_at = COALESCE(email_verified_at, NOW()), updated_at = NOW() WHERE id = $1`,
          [userId]
        );
      } else {
        userId = uuidv4();
        publicId = cleanEmail.includes('maya') ? 'PHX-100813' : 'PHX-100814';

        // Check if public_id already taken
        const pubCheck = await db.query(`SELECT id FROM users WHERE public_id = $1`, [publicId]);
        if (pubCheck.rows.length > 0) {
          publicId = `PHX-${Math.floor(200000 + Math.random() * 799999)}`;
        }

        const phone = cleanEmail.includes('maya') ? '+8801700000113' : '+8801700000114';

        await db.query(
          `
          INSERT INTO users (
            id, public_id, full_name, email, phone, country, password_hash, role, status, email_verified_at, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, 'Bangladesh', $6, $7, 'ACTIVE', NOW(), NOW(), NOW())
          `,
          [
            userId,
            publicId,
            spec.fullName,
            cleanEmail,
            phone,
            defaultPasswordHash,
            spec.role,
          ]
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
        referralCode = cleanEmail.includes('maya') ? 'PHX800113' : 'PHX800114';
        await db.query(
          `INSERT INTO user_referrals (user_id, referral_code, created_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (user_id) DO NOTHING`,
          [userId, referralCode]
        );
      }

      // Ensure binary_volume_balances exists
      await db.query(
        `INSERT INTO binary_volume_balances (user_id, carry_left_units, carry_right_units, updated_at)
         VALUES ($1, 0, 0, NOW())
         ON CONFLICT (user_id) DO NOTHING`,
        [userId]
      );
    }

    // Step 2: Ensure Sponsor linking and Binary Tree Placement
    for (const spec of TARGET_AFFILIATES) {
      const cleanEmail = spec.email.toLowerCase().trim();
      const userRes = await db.query<{ id: string; public_id: string; referral_code: string }>(
        `SELECT u.id, u.public_id, ur.referral_code 
         FROM users u 
         LEFT JOIN user_referrals ur ON u.id = ur.user_id 
         WHERE LOWER(u.email) = $1 LIMIT 1`,
        [cleanEmail]
      );
      if (userRes.rows.length === 0) continue;
      const user = userRes.rows[0];

      // Find sponsor user ID
      const sponsorClean = spec.sponsorEmail.toLowerCase().trim();
      let sponsorRes = await db.query<{ id: string; public_id: string }>(
        `SELECT id, public_id FROM users WHERE LOWER(email) = $1 LIMIT 1`,
        [sponsorClean]
      );

      // If sponsor not found, fall back to root mother or first admin
      if (sponsorRes.rows.length === 0) {
        sponsorRes = await db.query<{ id: string; public_id: string }>(
          `SELECT id, public_id FROM users WHERE role = 'ADMIN' ORDER BY created_at ASC LIMIT 1`
        );
      }

      if (sponsorRes.rows.length > 0 && sponsorRes.rows[0].id !== user.id) {
        const sponsorId = sponsorRes.rows[0].id;
        await db.query(
          `
          INSERT INTO user_referrals (user_id, referral_code, sponsor_user_id, created_at)
          VALUES ($1, $2, $3, NOW())
          ON CONFLICT (user_id) DO UPDATE SET
            sponsor_user_id = EXCLUDED.sponsor_user_id
          `,
          [user.id, user.referral_code || `PHX${Math.floor(100000 + Math.random() * 899999)}`, sponsorId]
        );
      }

      // Binary tree placement
      const parentClean = spec.binaryParentEmail.toLowerCase().trim();
      let parentRes = await db.query<{ id: string }>(
        `SELECT id FROM users WHERE LOWER(email) = $1 LIMIT 1`,
        [parentClean]
      );
      if (parentRes.rows.length === 0) {
        parentRes = sponsorRes;
      }

      if (parentRes.rows.length > 0 && parentRes.rows[0].id !== user.id) {
        const parentId = parentRes.rows[0].id;
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

    // Step 3: Ensure EXACTLY 1 ACTIVE NODE ($1,000 Genesis Node) per account
    for (const spec of TARGET_AFFILIATES) {
      const cleanEmail = spec.email.toLowerCase().trim();
      const userRes = await db.query<{ id: string; public_id: string }>(
        `SELECT id, public_id FROM users WHERE LOWER(email) = $1 LIMIT 1`,
        [cleanEmail]
      );
      if (userRes.rows.length === 0) continue;
      const user = userRes.rows[0];

      // Query current nodes owned by this user
      const ownedNodes = await db.query<{
        id: string;
        node_number: number;
        public_node_id: string;
        status: string;
      }>(
        `SELECT id, node_number, public_node_id, status 
         FROM nodes 
         WHERE owner_user_id = $1 
         ORDER BY node_number ASC`,
        [user.id]
      );

      let activeNodeId: string;
      let activeNodeNumber: number;
      let activeNodePublicId: string;

      if (ownedNodes.rows.length > 0) {
        // User already has at least one node: Keep the FIRST one active
        const first = ownedNodes.rows[0];
        activeNodeId = first.id;
        activeNodeNumber = first.node_number;
        activeNodePublicId = first.public_node_id;

        await db.query(
          `UPDATE nodes 
           SET status = 'ACTIVE', 
               purchase_price_usd = 1000, 
               activated_at = COALESCE(activated_at, $1::timestamptz), 
               maturity_timestamp = COALESCE(maturity_timestamp, NOW() + INTERVAL '200 days'),
               updated_at = NOW() 
           WHERE id = $2`,
          [spec.activationDateIso, activeNodeId]
        );

        // If user had DUPLICATE nodes (e.g. 2 nodes), release extras back to AVAILABLE pool!
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
          console.log(`[AutoReconcile] Released ${extraNodeIds.length} duplicate nodes for ${cleanEmail}`);
        }
      } else {
        // User has 0 nodes: Claim 1 from AVAILABLE pool or create a clean node
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
                 maturity_timestamp = COALESCE(maturity_timestamp, NOW() + INTERVAL '200 days'),
                 updated_at = NOW() 
             WHERE id = $3`,
            [user.id, spec.activationDateIso, activeNodeId]
          );
        } else {
          // If nodes pool is empty, assign deterministic node 100 or 101
          const targetNodeNum = cleanEmail.includes('maya') ? 100 : 101;
          const maxNumRes = await db.query<{ max_num: number }>(
            `SELECT COALESCE(MAX(node_number), 0)::int AS max_num FROM nodes WHERE node_number < 10000`
          );
          activeNodeNumber = targetNodeNum || (maxNumRes.rows[0]?.max_num || 100) + 1;
          activeNodeId = uuidv4();
          activeNodePublicId = `PHX-NODE-${String(activeNodeNumber).padStart(5, '0')}`;

          const upserted = await db.query<{ id: string; public_node_id: string; node_number: number }>(
            `INSERT INTO nodes (
               id, node_number, public_node_id, status, owner_user_id, purchase_price_usd,
               purchase_timestamp, activated_at, maturity_timestamp, created_at, updated_at
             ) VALUES ($1, $2, $3, 'ACTIVE', $4, 1000, $5::timestamptz, $5::timestamptz, NOW() + INTERVAL '200 days', NOW(), NOW())
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

      // Ensure node_orders record exists
      const publicOrderId = `ORD-${user.public_id}-${activeNodePublicId}`;
      const existingOrder = await db.query(
        `SELECT id FROM node_orders WHERE public_order_id = $1 OR (user_id = $2 AND node_id = $3 AND status = 'COMPLETED') LIMIT 1`,
        [publicOrderId, user.id, activeNodeId]
      );

      if (existingOrder.rows.length === 0) {
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
            uuidv4(),
            publicOrderId,
            user.id,
            activeNodeId,
            activeNodeNumber,
            `RECONCILE-${user.public_id}`,
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

      // Ensure $1,000 BLOCKCHAIN_DEPOSIT (CREDIT) + $1,000 NODE_PURCHASE (DEBIT)
      const fundSourceUuid = deterministicUuid(`NODE-FUND:${user.id}`);
      const purchaseSourceUuid = deterministicUuid(`NODE-PURCHASE:${user.id}`);

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
          `PHX-TXN-DEP-${user.public_id}`,
          user.id,
          fundSourceUuid,
          `DEP-${user.public_id}`,
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
          `PHX-TXN-NOD-${user.public_id}`,
          user.id,
          purchaseSourceUuid,
          publicOrderId,
          `Genesis Node Activation (${activeNodePublicId}) — Deducted $1,000`,
          spec.activationDateIso,
        ]
      );

      // Step 4: Ensure Referral / Spot Commission ($50 USDT)
      if (spec.referralCommissionUsd > 0) {
        const spotSourceUuid = deterministicUuid(`SPOT-COMM:${user.id}`);
        await db.query(
          `
          INSERT INTO financial_ledger_entries (
            id, public_txn_id, user_id, entry_type, source_type, source_id,
            source_ref, description, amount, currency, status, created_at
          ) VALUES ($1, $2, $3, 'CREDIT', 'REFERRAL_COMMISSION', $4, $5, $6, $7, 'USD', 'SETTLED', NOW())
          ON CONFLICT (source_type, source_id, entry_type) DO UPDATE SET
            amount = EXCLUDED.amount,
            status = 'SETTLED'
          `,
          [
            uuidv4(),
            `PHX-TXN-REF-${user.public_id}`,
            user.id,
            spotSourceUuid,
            `REF-COMM-${user.public_id}`,
            `Affiliate Spot Referral Commission ($${spec.referralCommissionUsd.toFixed(2)} USD)`,
            spec.referralCommissionUsd,
          ]
        );
      }

      // Step 5: Ensure Daily Mining Rewards (10 PHIVO/day) from Nov 4, 2026 to today
      const activationMs = new Date(spec.activationDateIso).getTime();
      const currentMs = Date.now();
      const elapsedDays = Math.max(1, Math.floor((currentMs - activationMs) / (1000 * 60 * 60 * 24)) + 1);
      const targetPhivo = elapsedDays * spec.dailyRewardPhivo;

      const phivoRes = await db.query<{ total: number }>(
        `SELECT COALESCE(SUM(amount), 0)::float AS total 
         FROM financial_ledger_entries 
         WHERE user_id = $1 AND source_type = 'NODE_REWARD' AND currency = 'PHIVO' AND status = 'SETTLED'`,
        [user.id]
      );
      const currentPhivo = Number(phivoRes.rows[0]?.total || 0);

      if (currentPhivo < targetPhivo) {
        const diffPhivo = targetPhivo - currentPhivo;
        const rewardSourceUuid = deterministicUuid(`NODE-REWARD-DAILY:${user.id}:${elapsedDays}`);

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
            `PHX-RWD-${user.public_id}-${elapsedDays}`,
            user.id,
            rewardSourceUuid,
            `RWD-${activeNodePublicId}`,
            `Daily Genesis Node Mining Reward (${elapsedDays} days accrued @ 10 PHIVO/day)`,
            diffPhivo,
          ]
        );
      }

      // Propagate binary sales volume
      try {
        await propagateNodeSalesVolume(db, activeNodeId, user.id);
      } catch (_e) {}

      // Background Firestore backup if available
      try {
        await adminFirestore.collection('users').doc(user.id).set(
          {
            id: user.id,
            public_id: user.public_id,
            email: cleanEmail,
            fullName: spec.fullName,
            status: 'ACTIVE',
            activeNodePublicId,
            nodeCount: 1,
            spotCommissionEarnedUsd: spec.referralCommissionUsd,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );

        await adminFirestore.collection('nodes').doc(activeNodeId).set(
          {
            id: activeNodeId,
            public_node_id: activeNodePublicId,
            owner_user_id: user.id,
            ownerEmail: cleanEmail,
            status: 'ACTIVE',
            purchase_price_usd: 1000,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      } catch (_fsErr) {}

      reconciledResults.push({
        email: cleanEmail,
        publicId: user.public_id,
        nodePublicId: activeNodePublicId,
        nodeNumber: activeNodeNumber,
        activeNodesCount: 1,
        spotCommissionUsd: spec.referralCommissionUsd,
        miningRewardPhivo: targetPhivo,
      });
    }

    lastReconcileTime = Date.now();
    console.log('[AutoReconcile] Successfully reconciled affiliate accounts:', reconciledResults);
    return { success: true, reconciled: reconciledResults };
  } catch (err: any) {
    console.error('[AutoReconcile] Error during affiliate accounts reconciliation:', err?.message || err);
    return { success: false, reconciled: [] };
  } finally {
    isReconciling = false;
  }
}
