import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { hashPassword } from '../utils/crypto';
import { getDb } from '../db/db';
import { adminAuth, adminFirestore } from '../../lib/firebase-admin';
import {
  AffiliateMasterNodeSpec,
  DEFAULT_AFFILIATE_MASTER_MAP,
} from '../../config/affiliateMasterMap';
import { propagateNodeSalesVolume } from './binaryVolumeService';
import { getNetworkTree, TreeNode } from './binaryPlacementService';

export type GenealogyNodeSpec = AffiliateMasterNodeSpec;

export const GENEALOGY_MASTER_TREE: AffiliateMasterNodeSpec[] = DEFAULT_AFFILIATE_MASTER_MAP;

export interface EnrichedMasterMapItem extends AffiliateMasterNodeSpec {
  userId: string | null;
  publicId: string | null;
  referralCode: string | null;
  activeNodePublicId: string | null;
  activeNodesCount: number;
  walletBalanceUsd: number;
  spotCommissionEarnedUsd: number;
  leftVolumeUnits: number;
  rightVolumeUnits: number;
  directReferralsCount: number;
  binaryStatus: 'PLACED' | 'UNPLACED';
}

function generateDeterministicPhone(index: number): string {
  return `+8801700000${String(100 + index).slice(-3)}`;
}

function generatePublicId(index: number): string {
  return `PHX-${100800 + index}`;
}

function generateReferralCode(index: number): string {
  return `PHX${800100 + index}`;
}

/**
 * Generates a deterministic RFC-4122 UUID from a namespace key so financial_ledger_entries
 * (which requires source_id UUID NOT NULL) can be upserted idempotently.
 */
function deterministicUuid(key: string): string {
  const hash = crypto.createHash('sha256').update(key).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

/**
 * Loads the persisted Master Affiliate Map from Firestore if available,
 * falling back to DEFAULT_AFFILIATE_MASTER_MAP from src/config/affiliateMasterMap.ts
 */
export async function loadSavedMasterMapSpecs(): Promise<AffiliateMasterNodeSpec[]> {
  try {
    const docSnap = await adminFirestore
      .collection('system_configs')
      .doc('affiliate_master_map')
      .get();
    if (docSnap.exists) {
      const data = docSnap.data();
      if (data && Array.isArray(data.specs) && data.specs.length > 0) {
        return data.specs as AffiliateMasterNodeSpec[];
      }
    }
  } catch (_err) {
    // Ignore in test / offline environments
  }
  return DEFAULT_AFFILIATE_MASTER_MAP;
}

/**
 * Saves custom Master Affiliate Map specs to Firestore for permanent persistence across deployments.
 */
export async function saveMasterMapSpecsToFirestore(
  specs: AffiliateMasterNodeSpec[]
): Promise<void> {
  try {
    await adminFirestore
      .collection('system_configs')
      .doc('affiliate_master_map')
      .set(
        {
          specs,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
  } catch (err: any) {
    console.warn('[GenealogySeed] Could not persist master map config to Firestore:', err.message);
  }
}

/**
 * Seeds, reconciles, and activates the full Affiliate Genealogy Tree across:
 * 1. PostgreSQL (users, user_referrals, binary_placements, nodes, node_orders, node_owners, financial_ledger_entries, binary_volume_*)
 * 2. Firebase Authentication (creates/updates accounts so Forgot Password & Login work seamlessly)
 * 3. Cloud Firestore (backs up users, user_referrals, binary_placements, nodes, and system_configs)
 */
export async function seedGenealogyNetworkTree(
  customSpecs?: AffiliateMasterNodeSpec[]
): Promise<{
  success: boolean;
  seededAccounts: Array<{
    level: string;
    fullName: string;
    email: string;
    publicId: string;
    referralCode: string;
    sponsorEmail: string | null;
    binaryParentEmail: string | null;
    side: string | null;
    nodeStatus: string;
    activeNodePublicId: string | null;
    spotCommissionUsd: number;
    firebaseSynced: boolean;
  }>;
  count: number;
}> {
  const db = await getDb();
  const activeSpecs =
    customSpecs && Array.isArray(customSpecs) && customSpecs.length > 0
      ? customSpecs
      : await loadSavedMasterMapSpecs();

  if (customSpecs && customSpecs.length > 0) {
    await saveMasterMapSpecsToFirestore(customSpecs);
  }

  const defaultPasswordHash = await hashPassword('Phivonex@2026');

  const emailToUserMap = new Map<
    string,
    {
      id: string;
      publicId: string;
      email: string;
      fullName: string;
      referralCode: string;
      role: string;
      firebaseSynced: boolean;
    }
  >();

  // ---------------------------------------------------------------------------
  // STEP 1: Ensure all users exist in PostgreSQL, Firebase Auth & Firestore
  // ---------------------------------------------------------------------------
  for (let i = 0; i < activeSpecs.length; i++) {
    const spec = activeSpecs[i];
    const cleanEmail = spec.email.trim().toLowerCase();

    const existingRes = await db.query<{
      id: string;
      public_id: string;
      email: string;
      full_name: string;
      role: string;
    }>(
      `SELECT id, public_id, email, full_name, role FROM users WHERE LOWER(email) = $1 LIMIT 1`,
      [cleanEmail]
    );

    let userId: string;
    let publicId: string;

    if (existingRes.rows.length > 0) {
      userId = existingRes.rows[0].id;
      publicId = existingRes.rows[0].public_id;

      await db.query(
        `UPDATE users SET full_name = $1, role = $2, status = 'ACTIVE', updated_at = NOW() WHERE id = $3`,
        [spec.fullName.trim(), spec.role, userId]
      );
    } else {
      userId = uuidv4();
      publicId = generatePublicId(i + 1);
      const phone = generateDeterministicPhone(i + 1);

      const pubCheck = await db.query(`SELECT id FROM users WHERE public_id = $1`, [publicId]);
      if (pubCheck.rows.length > 0) {
        publicId = `PHX-${Math.floor(200000 + Math.random() * 799999)}`;
      }

      const phoneCheck = await db.query(`SELECT id FROM users WHERE phone = $1`, [phone]);
      const finalPhone =
        phoneCheck.rows.length > 0
          ? `+88018${Math.floor(10000000 + Math.random() * 89999999)}`
          : phone;

      await db.query(
        `
        INSERT INTO users (
          id, public_id, full_name, email, phone, country, password_hash, role, status, email_verified_at, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, 'Bangladesh', $6, $7, 'ACTIVE', NOW(), NOW(), NOW())
        `,
        [
          userId,
          publicId,
          spec.fullName.trim(),
          cleanEmail,
          finalPhone,
          defaultPasswordHash,
          spec.role,
        ]
      );
    }

    // Check existing referral_code in user_referrals
    const refCodeRes = await db.query<{ referral_code: string }>(
      `SELECT referral_code FROM user_referrals WHERE user_id = $1 LIMIT 1`,
      [userId]
    );

    let referralCode: string;
    if (refCodeRes.rows.length > 0) {
      referralCode = refCodeRes.rows[0].referral_code;
    } else {
      referralCode = generateReferralCode(i + 1);
      const rcCheck = await db.query(
        `SELECT user_id FROM user_referrals WHERE referral_code = $1`,
        [referralCode]
      );
      if (rcCheck.rows.length > 0) {
        referralCode = `PHX${Math.floor(100000 + Math.random() * 899999)}`;
      }
      await db.query(
        `INSERT INTO user_referrals (user_id, referral_code, sponsor_user_id, created_at)
         VALUES ($1, $2, NULL, NOW())
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

    // Sync with Firebase Auth so Forgot Password & Login work seamlessly
    let firebaseSynced = false;
    try {
      try {
        const fbUser = await adminAuth.getUserByEmail(cleanEmail);
        await adminAuth.updateUser(fbUser.uid, {
          displayName: spec.fullName.trim(),
          emailVerified: true,
          disabled: false,
        });
        firebaseSynced = true;
      } catch (fbErr: any) {
        if (fbErr.code === 'auth/user-not-found') {
          await adminAuth.createUser({
            uid: userId,
            email: cleanEmail,
            password: 'Phivonex@2026',
            displayName: spec.fullName.trim(),
            emailVerified: true,
            disabled: false,
          });
          firebaseSynced = true;
        }
      }
    } catch (_authSyncErr) {
      // Safe fallback in offline/test mode
    }

    // Sync user profile to Firestore
    try {
      await adminFirestore
        .collection('users')
        .doc(userId)
        .set(
          {
            id: userId,
            public_id: publicId,
            publicId,
            full_name: spec.fullName.trim(),
            fullName: spec.fullName.trim(),
            email: cleanEmail,
            country: 'Bangladesh',
            role: spec.role,
            status: 'ACTIVE',
            referralCode,
            levelLabel: spec.levelLabel,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
    } catch (_fsErr) {
      // Ignore in offline/test mode
    }

    emailToUserMap.set(cleanEmail, {
      id: userId,
      publicId,
      email: cleanEmail,
      fullName: spec.fullName.trim(),
      referralCode,
      role: spec.role,
      firebaseSynced,
    });
  }

  // ---------------------------------------------------------------------------
  // STEP 2: Link Direct Sponsors (user_referrals) & Binary Tree (binary_placements)
  // ---------------------------------------------------------------------------
  // First clear any conflicting placements among these 12 accounts so re-parenting never hits idx_binary_parent_side collision
  const mapUserIds = Array.from(emailToUserMap.values()).map((u) => u.id);
  if (mapUserIds.length > 0) {
    await db.query(
      `UPDATE binary_placements
       SET parent_user_id = NULL, side = NULL, status = 'UNPLACED'
       WHERE user_id = ANY($1::uuid[])`,
      [mapUserIds]
    );
  }

  for (const spec of activeSpecs) {
    const cleanEmail = spec.email.trim().toLowerCase();
    const user = emailToUserMap.get(cleanEmail)!;

    const sponsorUser = spec.sponsorEmail
      ? emailToUserMap.get(spec.sponsorEmail.trim().toLowerCase()) || null
      : null;
    const parentUser = spec.binaryParentEmail
      ? emailToUserMap.get(spec.binaryParentEmail.trim().toLowerCase()) || null
      : null;

    if (sponsorUser && sponsorUser.id !== user.id) {
      await db.query(
        `
        INSERT INTO user_referrals (
          user_id, referral_code, sponsor_user_id, created_at
        ) VALUES ($1, $2, $3, NOW())
        ON CONFLICT (user_id) DO UPDATE SET
          sponsor_user_id = EXCLUDED.sponsor_user_id,
          referral_code = EXCLUDED.referral_code
        `,
        [user.id, user.referralCode, sponsorUser.id]
      );

      try {
        await adminFirestore
          .collection('user_referrals')
          .doc(user.id)
          .set(
            {
              user_id: user.id,
              userPublicId: user.publicId,
              userEmail: user.email,
              sponsor_user_id: sponsorUser.id,
              sponsorPublicId: sponsorUser.publicId,
              sponsorEmail: sponsorUser.email,
              referral_code: user.referralCode,
              updatedAt: new Date().toISOString(),
            },
            { merge: true }
          );
      } catch (_e) {}
    } else {
      // Root account: ensure user_referrals row has referral_code and NULL sponsor
      await db.query(
        `
        INSERT INTO user_referrals (
          user_id, referral_code, sponsor_user_id, created_at
        ) VALUES ($1, $2, NULL, NOW())
        ON CONFLICT (user_id) DO UPDATE SET
          sponsor_user_id = NULL,
          referral_code = EXCLUDED.referral_code
        `,
        [user.id, user.referralCode]
      );
    }

    if (parentUser && spec.side && parentUser.id !== user.id) {
      // Free slot if occupied by a non-map account
      await db.query(
        `UPDATE binary_placements
         SET parent_user_id = NULL, side = NULL, status = 'UNPLACED'
         WHERE parent_user_id = $1 AND side = $2 AND status = 'PLACED' AND user_id != $3`,
        [parentUser.id, spec.side, user.id]
      );

      await db.query(
        `
        INSERT INTO binary_placements (
          user_id, parent_user_id, side, status, placed_at, created_at
        ) VALUES ($1, $2, $3, 'PLACED', NOW(), NOW())
        ON CONFLICT (user_id) DO UPDATE SET
          parent_user_id = EXCLUDED.parent_user_id,
          side = EXCLUDED.side,
          status = 'PLACED',
          placed_at = COALESCE(binary_placements.placed_at, NOW())
        `,
        [user.id, parentUser.id, spec.side]
      );

      try {
        await adminFirestore
          .collection('binary_placements')
          .doc(user.id)
          .set(
            {
              user_id: user.id,
              userPublicId: user.publicId,
              userEmail: user.email,
              sponsor_user_id: sponsorUser ? sponsorUser.id : parentUser.id,
              parent_user_id: parentUser.id,
              parentPublicId: parentUser.publicId,
              parentEmail: parentUser.email,
              side: spec.side,
              status: 'PLACED',
              placed_at: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
            { merge: true }
          );
      } catch (_e) {}
    } else {
      // Root Mother account
      await db.query(
        `
        INSERT INTO binary_placements (
          user_id, parent_user_id, side, status, placed_at, created_at
        ) VALUES ($1, NULL, NULL, 'PLACED', NOW(), NOW())
        ON CONFLICT (user_id) DO UPDATE SET
          parent_user_id = NULL,
          side = NULL,
          status = 'PLACED',
          placed_at = COALESCE(binary_placements.placed_at, NOW())
        `,
        [user.id]
      );
    }
  }

  // ---------------------------------------------------------------------------
  // STEP 3: Node Activation ($1,000), Spot Commissions ($25) & Binary Volume
  // ---------------------------------------------------------------------------
  const seededAccounts: Array<{
    level: string;
    fullName: string;
    email: string;
    publicId: string;
    referralCode: string;
    sponsorEmail: string | null;
    binaryParentEmail: string | null;
    side: string | null;
    nodeStatus: string;
    activeNodePublicId: string | null;
    spotCommissionUsd: number;
    firebaseSynced: boolean;
  }> = [];

  for (let i = 0; i < activeSpecs.length; i++) {
    const spec = activeSpecs[i];
    const cleanEmail = spec.email.trim().toLowerCase();
    const user = emailToUserMap.get(cleanEmail)!;
    const nodePrice = Number(spec.nodePriceUsd || 1000);
    let activeNodePublicId: string | null = null;

    const fundSourceUuid = deterministicUuid(`SEED-NODE-FUND:${user.id}`);
    const purchaseSourceUuid = deterministicUuid(`SEED-NODE-PURCHASE:${user.id}`);
    const spotSourceUuid = deterministicUuid(`SEED-SPOT-COMM:${user.id}`);
    const extraBalSourceUuid = deterministicUuid(`SEED-EXTRA-BAL:${user.id}`);

    // Also remove any legacy unspent ADMIN_ADJUSTMENT seed credits from older seed versions
    await db.query(
      `DELETE FROM financial_ledger_entries
       WHERE user_id = $1
         AND source_type = 'ADMIN_ADJUSTMENT'
         AND (
           source_ref LIKE 'GENEALOGY-INIT-%'
           OR source_ref LIKE 'SEED-%'
           OR description LIKE 'Initial Node & Affiliate Wallet Balance%'
           OR description LIKE '%Mother%Seed%'
           OR amount = 10000
         )`,
      [user.id]
    );

    if (spec.nodeStatus === 'ACTIVE') {
      // 1. Check if user already has an ACTIVE node
      const existingNodeRes = await db.query<{
        id: string;
        public_node_id: string;
        node_number: number;
      }>(
        `SELECT id, public_node_id, node_number
         FROM nodes
         WHERE owner_user_id = $1 AND status = 'ACTIVE'
         ORDER BY activated_at ASC NULLS LAST
         LIMIT 1`,
        [user.id]
      );

      let nodeId: string;
      let nodeNumber: number;
      if (existingNodeRes.rows.length > 0) {
        nodeId = existingNodeRes.rows[0].id;
        activeNodePublicId = existingNodeRes.rows[0].public_node_id;
        nodeNumber = existingNodeRes.rows[0].node_number;
      } else {
        // Claim an AVAILABLE node within valid 1..10000 range
        const availNodeRes = await db.query<{
          id: string;
          public_node_id: string;
          node_number: number;
        }>(
          `SELECT id, public_node_id, node_number
           FROM nodes
           WHERE status = 'AVAILABLE' AND owner_user_id IS NULL
           ORDER BY node_number ASC
           LIMIT 1`
        );

        if (availNodeRes.rows.length > 0) {
          nodeId = availNodeRes.rows[0].id;
          activeNodePublicId = availNodeRes.rows[0].public_node_id;
          nodeNumber = availNodeRes.rows[0].node_number;

          await db.query(
            `UPDATE nodes
             SET status = 'ACTIVE',
                 owner_user_id = $1,
                 purchase_price_usd = $2,
                 purchase_timestamp = NOW(),
                 activated_at = NOW(),
                 maturity_timestamp = NOW() + INTERVAL '200 days',
                 updated_at = NOW()
             WHERE id = $3`,
            [user.id, nodePrice, nodeId]
          );
        } else {
          // Fallback if nodes table was not pre-populated in a minimal test environment
          const usedNumsRes = await db.query<{ max_num: number }>(
            `SELECT COALESCE(MAX(node_number), 0)::int AS max_num FROM nodes WHERE node_number < 10000`
          );
          nodeNumber = Math.min(10000, Math.max(1, (usedNumsRes.rows[0]?.max_num || 0) + 1));
          nodeId = uuidv4();
          activeNodePublicId = `PHX-NODE-${String(nodeNumber).padStart(5, '0')}`;

          const upsertedNode = await db.query<{ id: string; public_node_id: string }>(
            `INSERT INTO nodes (
               id, node_number, public_node_id, status, owner_user_id, purchase_price_usd,
               purchase_timestamp, activated_at, maturity_timestamp, created_at, updated_at
             ) VALUES ($1, $2, $3, 'ACTIVE', $4, $5, NOW(), NOW(), NOW() + INTERVAL '200 days', NOW(), NOW())
             ON CONFLICT (node_number) DO UPDATE SET
               status = 'ACTIVE',
               owner_user_id = EXCLUDED.owner_user_id,
               purchase_timestamp = COALESCE(nodes.purchase_timestamp, NOW()),
               activated_at = COALESCE(nodes.activated_at, NOW()),
               updated_at = NOW()
             RETURNING id, public_node_id`,
            [nodeId, nodeNumber, activeNodePublicId, user.id, nodePrice]
          );
          nodeId = upsertedNode.rows[0].id;
          activeNodePublicId = upsertedNode.rows[0].public_node_id;
        }
      }

      // 2. Ensure COMPLETED node_orders record exists for this node
      const existingOrderRes = await db.query<{ id: string; public_order_id: string }>(
        `SELECT id, public_order_id FROM node_orders WHERE user_id = $1 AND node_id = $2 AND status = 'COMPLETED' LIMIT 1`,
        [user.id, nodeId]
      );

      let publicOrderId: string;
      if (existingOrderRes.rows.length > 0) {
        publicOrderId = existingOrderRes.rows[0].public_order_id;
      } else {
        const orderId = uuidv4();
        publicOrderId = `PHX-ORD-${800100 + i}`;
        const ordCollision = await db.query(
          `SELECT id FROM node_orders WHERE public_order_id = $1`,
          [publicOrderId]
        );
        if (ordCollision.rows.length > 0) {
          publicOrderId = `PHX-ORD-${Math.floor(100000 + Math.random() * 899999)}`;
        }

        await db.query(
          `INSERT INTO node_orders (
             id, public_order_id, user_id, node_id, node_number, amount_usd, currency,
             status, payment_method, payment_reference, reserved_at, expires_at, completed_at, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, 'USD', 'COMPLETED', 'WALLET_USD', $7, NOW(), NOW() + INTERVAL '1 day', NOW(), NOW(), NOW())`,
          [
            orderId,
            publicOrderId,
            user.id,
            nodeId,
            nodeNumber,
            nodePrice,
            `MASTER-MAP-NODE-${user.publicId}`,
          ]
        );
      }

      // Clean up any stale PENDING order for this user now that they are ACTIVE
      await db.query(
        `DELETE FROM node_orders WHERE user_id = $1 AND status = 'PENDING' AND payment_reference LIKE 'GENEALOGY-PENDING-%'`,
        [user.id]
      );

      // 3. Ensure node_owners record exists
      await db.query(
        `INSERT INTO node_owners (
           id, node_id, user_id, acquired_via, acquired_at, is_current_owner
         ) VALUES ($1, $2, $3, 'PURCHASE', NOW(), TRUE)
         ON CONFLICT (node_id, user_id) DO UPDATE SET
           is_current_owner = TRUE`,
        [uuidv4(), nodeId, user.id]
      );

      // 4. Post $1,000 BLOCKCHAIN_DEPOSIT (CREDIT) + $1,000 NODE_PURCHASE (DEBIT)
      // so the $1,000 node activation is properly funded and deducted in the ledger
      await db.query(
        `
        INSERT INTO financial_ledger_entries (
          id, public_txn_id, user_id, entry_type, source_type, source_id,
          source_ref, description, amount, currency, status, created_at
        ) VALUES ($1, $2, $3, 'CREDIT', 'BLOCKCHAIN_DEPOSIT', $4, $5, $6, $7, 'USDT', 'SETTLED', NOW())
        ON CONFLICT (source_type, source_id, entry_type) DO UPDATE SET
          amount = EXCLUDED.amount,
          status = 'SETTLED'
        `,
        [
          uuidv4(),
          `PHX-TXN-FND${100 + i}`,
          user.id,
          fundSourceUuid,
          `DEP-${user.publicId}`,
          `Genesis Node Activation Deposit ($${nodePrice.toLocaleString()} USDT)`,
          nodePrice,
        ]
      );

      await db.query(
        `
        INSERT INTO financial_ledger_entries (
          id, public_txn_id, user_id, entry_type, source_type, source_id,
          source_ref, description, amount, currency, status, created_at
        ) VALUES ($1, $2, $3, 'DEBIT', 'NODE_PURCHASE', $4, $5, $6, $7, 'USD', 'SETTLED', NOW())
        ON CONFLICT (source_type, source_id, entry_type) DO UPDATE SET
          amount = EXCLUDED.amount,
          status = 'SETTLED'
        `,
        [
          uuidv4(),
          `PHX-TXN-NOD${100 + i}`,
          user.id,
          purchaseSourceUuid,
          publicOrderId,
          `Genesis Node Activation (${activeNodePublicId}) — Deducted $${nodePrice.toLocaleString()}`,
          nodePrice,
        ]
      );

      // 5. Propagate Binary Sales Volume (1 Node Unit) up the binary tree idempotently
      try {
        await propagateNodeSalesVolume(db, nodeId, user.id);
      } catch (_volErr) {
        // Safe ignore if already attributed
      }

      // 6. Sync active node to Firestore
      try {
        await adminFirestore
          .collection('nodes')
          .doc(nodeId)
          .set(
            {
              id: nodeId,
              public_node_id: activeNodePublicId,
              owner_user_id: user.id,
              ownerEmail: user.email,
              ownerPublicId: user.publicId,
              status: 'ACTIVE',
              purchase_price_usd: nodePrice,
              updatedAt: new Date().toISOString(),
            },
            { merge: true }
          );
      } catch (_e) {}
    } else {
      // PENDING node status
      await db.query(
        `DELETE FROM financial_ledger_entries WHERE user_id = $1 AND source_id IN ($2, $3)`,
        [user.id, fundSourceUuid, purchaseSourceUuid]
      );
    }

    // -------------------------------------------------------------------------
    // STEP 4: Credit Spot Commission ($25) & Extra Wallet Balance
    // -------------------------------------------------------------------------
    const spotAmount = Number(spec.spotCommissionUsd || 0);

    if (spotAmount > 0) {
      await db.query(
        `
        INSERT INTO financial_ledger_entries (
          id, public_txn_id, user_id, entry_type, source_type, source_id,
          source_ref, description, amount, currency, status, created_at
        ) VALUES ($1, $2, $3, 'CREDIT', 'REFERRAL_COMMISSION', $4, $5, $6, $7, 'USD', 'SETTLED', NOW())
        ON CONFLICT (source_type, source_id, entry_type) DO UPDATE SET
          amount = EXCLUDED.amount,
          description = EXCLUDED.description,
          status = 'SETTLED'
        `,
        [
          uuidv4(),
          `PHX-TXN-SPT${100 + i}`,
          user.id,
          spotSourceUuid,
          `PHX-COM-SPOT${100 + i}`,
          `Affiliate Spot Referral Commission ($${spotAmount.toFixed(2)} USD)`,
          spotAmount,
        ]
      );
    } else {
      await db.query(
        `DELETE FROM financial_ledger_entries WHERE user_id = $1 AND source_id = $2`,
        [user.id, spotSourceUuid]
      );
    }

    // Optional Extra Spendable Wallet Balance (if admin sets extraWalletBalanceUsd > 0)
    const extraBalAmount = Number(spec.extraWalletBalanceUsd || 0);
    if (extraBalAmount > 0) {
      await db.query(
        `
        INSERT INTO financial_ledger_entries (
          id, public_txn_id, user_id, entry_type, source_type, source_id,
          source_ref, description, amount, currency, status, created_at
        ) VALUES ($1, $2, $3, 'CREDIT', 'ADMIN_ADJUSTMENT', $4, $5, $6, $7, 'USD', 'SETTLED', NOW())
        ON CONFLICT (source_type, source_id, entry_type) DO UPDATE SET
          amount = EXCLUDED.amount,
          status = 'SETTLED'
        `,
        [
          uuidv4(),
          `PHX-TXN-EXT${100 + i}`,
          user.id,
          extraBalSourceUuid,
          `ADM-BAL-${user.publicId}`,
          `Admin Master Map Wallet Credit ($${extraBalAmount.toFixed(2)} USD)`,
          extraBalAmount,
        ]
      );
    } else {
      await db.query(
        `DELETE FROM financial_ledger_entries WHERE user_id = $1 AND source_id = $2`,
        [user.id, extraBalSourceUuid]
      );
    }

    seededAccounts.push({
      level: spec.levelLabel,
      fullName: spec.fullName,
      email: cleanEmail,
      publicId: user.publicId,
      referralCode: user.referralCode,
      sponsorEmail: spec.sponsorEmail,
      binaryParentEmail: spec.binaryParentEmail,
      side: spec.side,
      nodeStatus: spec.nodeStatus,
      activeNodePublicId,
      spotCommissionUsd: spotAmount,
      firebaseSynced: user.firebaseSynced,
    });
  }

  return {
    success: true,
    seededAccounts,
    count: seededAccounts.length,
  };
}

/**
 * Returns the live status of all accounts in the Master Affiliate Map along with
 * the full multi-level binary tree for the Admin Affiliate Tree Editor.
 */
export async function getAffiliateMasterMapStatus(): Promise<{
  specs: EnrichedMasterMapItem[];
  rootTree: TreeNode | null;
}> {
  const db = await getDb();
  const savedSpecs = await loadSavedMasterMapSpecs();
  const enriched: EnrichedMasterMapItem[] = [];
  let rootUserId: string | null = null;

  for (const spec of savedSpecs) {
    const cleanEmail = spec.email.trim().toLowerCase();
    const userRes = await db.query<{
      id: string;
      public_id: string;
      full_name: string;
      role: string;
    }>(
      `SELECT id, public_id, full_name, role FROM users WHERE LOWER(email) = $1 LIMIT 1`,
      [cleanEmail]
    );

    if (userRes.rows.length === 0) {
      enriched.push({
        ...spec,
        userId: null,
        publicId: null,
        referralCode: null,
        activeNodePublicId: null,
        activeNodesCount: 0,
        walletBalanceUsd: 0,
        spotCommissionEarnedUsd: 0,
        leftVolumeUnits: 0,
        rightVolumeUnits: 0,
        directReferralsCount: 0,
        binaryStatus: 'UNPLACED',
      });
      continue;
    }

    const u = userRes.rows[0];
    if (!rootUserId || spec.levelLabel === 'MOTHER') {
      rootUserId = u.id;
    }

    const [refRes, nodeRes, balRes, volRes, dirCountRes, bpRes] = await Promise.all([
      db.query<{ referral_code: string }>(
        `SELECT referral_code FROM user_referrals WHERE user_id = $1 LIMIT 1`,
        [u.id]
      ),
      db.query<{ public_node_id: string }>(
        `SELECT public_node_id FROM nodes WHERE owner_user_id = $1 AND status = 'ACTIVE' ORDER BY activated_at ASC`,
        [u.id]
      ),
      db.query<{
        credits: string | number;
        debits: string | number;
        reversals: string | number;
        spot_comm: string | number;
      }>(
        `
        SELECT
          COALESCE(SUM(CASE WHEN entry_type = 'CREDIT' AND status = 'SETTLED' THEN amount ELSE 0 END), 0) AS credits,
          COALESCE(SUM(CASE WHEN entry_type = 'DEBIT' AND status IN ('SETTLED', 'PENDING') THEN amount ELSE 0 END), 0) AS debits,
          COALESCE(SUM(CASE WHEN entry_type = 'REVERSAL' AND status = 'SETTLED' THEN amount ELSE 0 END), 0) AS reversals,
          COALESCE(SUM(CASE WHEN entry_type = 'CREDIT' AND source_type = 'REFERRAL_COMMISSION' AND status = 'SETTLED' THEN amount ELSE 0 END), 0) AS spot_comm
        FROM financial_ledger_entries
        WHERE user_id = $1
        `,
        [u.id]
      ),
      db.query<{ left_units: number; right_units: number }>(
        `
        SELECT
          COALESCE(SUM(CASE WHEN side = 'LEFT' THEN volume_units ELSE 0 END), 0)::int AS left_units,
          COALESCE(SUM(CASE WHEN side = 'RIGHT' THEN volume_units ELSE 0 END), 0)::int AS right_units
        FROM binary_volume_events
        WHERE beneficiary_user_id = $1 AND status = 'ACTIVE'
        `,
        [u.id]
      ),
      db.query<{ cnt: number }>(
        `SELECT COUNT(*)::int AS cnt FROM user_referrals WHERE sponsor_user_id = $1`,
        [u.id]
      ),
      db.query<{ status: string; side: 'LEFT' | 'RIGHT' | null }>(
        `SELECT status, side FROM binary_placements WHERE user_id = $1 LIMIT 1`,
        [u.id]
      ),
    ]);

    const credits = Number(balRes.rows[0]?.credits || 0);
    const debits = Number(balRes.rows[0]?.debits || 0);
    const reversals = Number(balRes.rows[0]?.reversals || 0);
    const walletBalanceUsd = Math.max(0, Number((credits - debits - reversals).toFixed(2)));
    const spotCommissionEarnedUsd = Number(balRes.rows[0]?.spot_comm || 0);

    enriched.push({
      ...spec,
      userId: u.id,
      publicId: u.public_id,
      referralCode: refRes.rows[0]?.referral_code || null,
      activeNodePublicId: nodeRes.rows[0]?.public_node_id || null,
      activeNodesCount: nodeRes.rows.length,
      nodeStatus: nodeRes.rows.length > 0 ? 'ACTIVE' : spec.nodeStatus,
      walletBalanceUsd,
      spotCommissionEarnedUsd,
      leftVolumeUnits: Number(volRes.rows[0]?.left_units || 0),
      rightVolumeUnits: Number(volRes.rows[0]?.right_units || 0),
      directReferralsCount: Number(dirCountRes.rows[0]?.cnt || 0),
      binaryStatus: bpRes.rows[0]?.status === 'PLACED' ? 'PLACED' : 'UNPLACED',
    });
  }

  let rootTree: TreeNode | null = null;
  if (rootUserId) {
    rootTree = await getNetworkTree(rootUserId, 10);
  }

  return {
    specs: enriched,
    rootTree,
  };
}
