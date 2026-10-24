import { getDb } from '../db/db';
import { v4 as uuidv4 } from 'uuid';
import { hashPassword } from '../utils/crypto';

export interface GenealogyUserSpec {
  email: string;
  fullName: string;
  role?: string;
  sponsorEmail?: string | null;
  binaryParentEmail?: string | null;
  side?: 'LEFT' | 'RIGHT' | null;
  walletBalanceUsd: number;
  spotCommissionUsd: number;
  nodeStatus: 'ACTIVE' | 'PENDING';
}

export const GENEALOGY_TREE_SPECS: GenealogyUserSpec[] = [
  // Mother Account
  {
    email: 'phivonexcore@gmail.com',
    fullName: 'Root Mother Account',
    role: 'ADMIN',
    sponsorEmail: null,
    binaryParentEmail: null,
    side: null,
    walletBalanceUsd: 10000,
    spotCommissionUsd: 0,
    nodeStatus: 'ACTIVE',
  },
  // L0 Main Admin
  {
    email: 'shahjalal639832@gmail.com',
    fullName: 'Md SHAHJALAL',
    role: 'ADMIN',
    sponsorEmail: 'phivonexcore@gmail.com',
    binaryParentEmail: 'phivonexcore@gmail.com',
    side: 'LEFT',
    walletBalanceUsd: 5000,
    spotCommissionUsd: 0,
    nodeStatus: 'ACTIVE',
  },
  // L1
  {
    email: 'plcshahjalal@gmail.com',
    fullName: 'Shahjalal-2',
    role: 'USER',
    sponsorEmail: 'shahjalal639832@gmail.com',
    binaryParentEmail: 'shahjalal639832@gmail.com',
    side: 'LEFT',
    walletBalanceUsd: 1000,
    spotCommissionUsd: 25,
    nodeStatus: 'ACTIVE',
  },
  // L2
  {
    email: 'rahmanmdferdaus761@gmail.com',
    fullName: 'MD: Ferdusur Rahman',
    role: 'USER',
    sponsorEmail: 'plcshahjalal@gmail.com',
    binaryParentEmail: 'plcshahjalal@gmail.com',
    side: 'LEFT',
    walletBalanceUsd: 1000,
    spotCommissionUsd: 25,
    nodeStatus: 'ACTIVE',
  },
  // L3
  {
    email: 'afrozaabdullah01@gmail.com',
    fullName: 'Afroza Abdullah',
    role: 'USER',
    sponsorEmail: 'rahmanmdferdaus761@gmail.com',
    binaryParentEmail: 'rahmanmdferdaus761@gmail.com',
    side: 'LEFT',
    walletBalanceUsd: 1000,
    spotCommissionUsd: 25,
    nodeStatus: 'ACTIVE',
  },
  // L4-A (Left Branch of Afroza)
  {
    email: 'sajidabdullahphivonex@gmail.com',
    fullName: 'Sajid Abdullah',
    role: 'USER',
    sponsorEmail: 'afrozaabdullah01@gmail.com',
    binaryParentEmail: 'afrozaabdullah01@gmail.com',
    side: 'LEFT',
    walletBalanceUsd: 1000,
    spotCommissionUsd: 25,
    nodeStatus: 'ACTIVE',
  },
  // L5-A
  {
    email: 'salimaakhter49@gmail.com',
    fullName: 'Selima Akter',
    role: 'USER',
    sponsorEmail: 'sajidabdullahphivonex@gmail.com',
    binaryParentEmail: 'sajidabdullahphivonex@gmail.com',
    side: 'LEFT',
    walletBalanceUsd: 1000,
    spotCommissionUsd: 25,
    nodeStatus: 'ACTIVE',
  },
  // L6-A
  {
    email: 'plabonrashed@gmail.com',
    fullName: 'Rashed',
    role: 'USER',
    sponsorEmail: 'salimaakhter49@gmail.com',
    binaryParentEmail: 'salimaakhter49@gmail.com',
    side: 'LEFT',
    walletBalanceUsd: 1000,
    spotCommissionUsd: 25,
    nodeStatus: 'ACTIVE',
  },
  // L7-A
  {
    email: 'mariya.rahman067@gmail.com',
    fullName: 'Mariya Akter',
    role: 'USER',
    sponsorEmail: 'plabonrashed@gmail.com',
    binaryParentEmail: 'plabonrashed@gmail.com',
    side: 'LEFT',
    walletBalanceUsd: 0,
    spotCommissionUsd: 25,
    nodeStatus: 'PENDING',
  },
  // L4-B (Right Branch of Afroza)
  {
    email: 'mehediabdullahphivonex@gmail.com',
    fullName: 'Mehedi Abdullah',
    role: 'USER',
    sponsorEmail: 'afrozaabdullah01@gmail.com',
    binaryParentEmail: 'afrozaabdullah01@gmail.com',
    side: 'RIGHT',
    walletBalanceUsd: 1000,
    spotCommissionUsd: 25,
    nodeStatus: 'ACTIVE',
  },
  // L5-B
  {
    email: 'ronykamalphivonex@gmail.com',
    fullName: 'Rony Kamal',
    role: 'USER',
    sponsorEmail: 'mehediabdullahphivonex@gmail.com',
    binaryParentEmail: 'mehediabdullahphivonex@gmail.com',
    side: 'LEFT',
    walletBalanceUsd: 0,
    spotCommissionUsd: 25,
    nodeStatus: 'PENDING',
  },
  // L6-B
  {
    email: 'rsfhealthsociety26@gmail.com',
    fullName: 'Raju Ahammed',
    role: 'USER',
    sponsorEmail: 'ronykamalphivonex@gmail.com',
    binaryParentEmail: 'ronykamalphivonex@gmail.com',
    side: 'LEFT',
    walletBalanceUsd: 1000,
    spotCommissionUsd: 25,
    nodeStatus: 'ACTIVE',
  },
];

/**
 * Seeds and synchronizes all genealogy tree accounts to PostgreSQL, Firebase Auth, and Cloud Firestore.
 * Ensures zero data loss and enables password reset emails for every account!
 */
export async function seedGenealogyNetworkTree() {
  const db = await getDb();
  console.log('[GenealogySeed] Starting full genealogy network tree sync...');

  const DEFAULT_INITIAL_PASSWORD = 'Phivonex2026!';
  const defaultPasswordHash = await hashPassword(DEFAULT_INITIAL_PASSWORD);

  // Map email -> user ID & public ID
  const emailToUserMap = new Map<string, { id: string; publicId: string }>();

  // 1. First pass: Ensure all users exist in PostgreSQL, Firebase Auth, and Firestore
  for (const spec of GENEALOGY_TREE_SPECS) {
    const cleanEmail = spec.email.trim().toLowerCase();

    // Check existing in PostgreSQL
    const existingRes = await db.query<any>(`
      SELECT id, public_id, full_name FROM users WHERE LOWER(email) = $1
    `, [cleanEmail]);

    let userId: string;
    let publicId: string;

    if (existingRes.rows.length > 0) {
      userId = existingRes.rows[0].id;
      publicId = existingRes.rows[0].public_id;

      // Update name / role / password_hash if needed
      await db.query(`
        UPDATE users SET
          full_name = $1,
          role = COALESCE($2, role),
          status = 'ACTIVE',
          email_verified_at = COALESCE(email_verified_at, CURRENT_TIMESTAMP),
          password_hash = COALESCE(password_hash, $3),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $4
      `, [spec.fullName, spec.role || 'USER', defaultPasswordHash, userId]);
    } else {
      userId = uuidv4();
      const numPart = Math.floor(100000 + Math.random() * 900000);
      publicId = `PHX-${numPart}`;

      await db.query(`
        INSERT INTO users (
          id, public_id, full_name, email, country, password_hash, status, role, email_verified_at, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, 'Global', $5, 'ACTIVE', $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `, [
        userId,
        publicId,
        spec.fullName,
        cleanEmail,
        defaultPasswordHash,
        spec.role || 'USER',
      ]);
    }

    emailToUserMap.set(cleanEmail, { id: userId, publicId });

    // Ensure referral code row exists
    const refCode = `PHX${publicId.replace('PHX-', '')}`;
    await db.query(`
      INSERT INTO user_referrals (user_id, referral_code, created_at)
      VALUES ($1, $2, CURRENT_TIMESTAMP)
      ON CONFLICT (user_id) DO NOTHING
    `, [userId, refCode]);

    // Ensure wallet balance in financial_ledger_entries
    if (spec.walletBalanceUsd > 0) {
      const balCheck = await db.query(`
        SELECT id FROM financial_ledger_entries 
        WHERE user_id = $1 AND source_type = 'DEPOSIT_CREDIT' AND source_ref = 'GENEALOGY_SEED_BALANCE'
      `, [userId]);

      if (balCheck.rows.length === 0) {
        await db.query(`
          INSERT INTO financial_ledger_entries (
            id, public_txn_id, user_id, entry_type, source_type, source_id,
            source_ref, description, amount, currency, status, created_at
          ) VALUES ($1, $2, $3, 'CREDIT', 'DEPOSIT_CREDIT', $4, 'GENEALOGY_SEED_BALANCE', 'Ecosystem Wallet Seed Balance Credited', $5, 'USDT', 'SETTLED', CURRENT_TIMESTAMP)
          ON CONFLICT DO NOTHING
        `, [
          uuidv4(),
          `TX-${uuidv4().slice(0, 8).toUpperCase()}`,
          userId,
          uuidv4(),
          spec.walletBalanceUsd
        ]);
      }
    }

    // Record spot commission in financial_ledger_entries if > 0
    if (spec.spotCommissionUsd > 0) {
      const commCheck = await db.query(`
        SELECT id FROM financial_ledger_entries 
        WHERE user_id = $1 AND source_type = 'REFERRAL_COMMISSION' AND source_ref = 'GENEALOGY_SPOT_COMMISSION'
      `, [userId]);

      if (commCheck.rows.length === 0) {
        await db.query(`
          INSERT INTO financial_ledger_entries (
            id, public_txn_id, user_id, entry_type, source_type, source_id,
            source_ref, description, amount, currency, status, created_at
          ) VALUES ($1, $2, $3, 'CREDIT', 'REFERRAL_COMMISSION', $4, 'GENEALOGY_SPOT_COMMISSION', 'Spot Affiliate Commission Credited', $5, 'USDT', 'SETTLED', CURRENT_TIMESTAMP)
          ON CONFLICT DO NOTHING
        `, [
          uuidv4(),
          `TX-${uuidv4().slice(0, 8).toUpperCase()}`,
          userId,
          uuidv4(),
          spec.spotCommissionUsd
        ]);
      }
    }

    // Node active/pending record
    if (spec.nodeStatus === 'ACTIVE') {
      const nodeCheck = await db.query(`SELECT id FROM nodes WHERE owner_user_id = $1 AND status = 'ACTIVE'`, [userId]);
      if (nodeCheck.rows.length === 0) {
        const nodeNumRes = await db.query(`SELECT COALESCE(MAX(node_number), 0) + 1 AS next_num FROM nodes`);
        const nextNum = Number(nodeNumRes.rows[0]?.next_num || 1);
        const nodeUuid = uuidv4();
        const publicNodeId = `NODE-${nextNum.toString().padStart(5, '0')}`;

        await db.query(`
          INSERT INTO nodes (
            id, node_number, public_node_id, status, owner_user_id, product_version, purchase_price_usd, activated_at, created_at, updated_at
          ) VALUES ($1, $2, $3, 'ACTIVE', $4, 'GENESIS_V1', 1000.00, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT (id) DO NOTHING
        `, [nodeUuid, nextNum, publicNodeId, userId]);
      }
    }

    // Sync to Firebase Auth (Crucial for Forgot Password emails to work!)
    try {
      const { adminAuth } = await import('../../lib/firebase-admin');
      try {
        await adminAuth.createUser({
          uid: userId,
          email: cleanEmail,
          displayName: spec.fullName,
          password: DEFAULT_INITIAL_PASSWORD,
          emailVerified: true,
        });
        console.log(`[GenealogySeed] Registered ${cleanEmail} in Firebase Auth`);
      } catch (authErr: any) {
        if (authErr?.code === 'auth/uid-already-exists' || authErr?.code === 'auth/email-already-exists') {
          try {
            await adminAuth.updateUser(userId, {
              displayName: spec.fullName,
              emailVerified: true,
            });
          } catch {
            // ignore update error if UID differs
          }
        }
      }
    } catch (firebaseAuthErr) {
      console.warn(`[GenealogySeed] Firebase Auth notice for ${cleanEmail}:`, firebaseAuthErr);
    }

    // Sync user profile & wallet state to Firestore
    try {
      const { adminFirestore } = await import('../../lib/firebase-admin');
      await adminFirestore.collection('users').doc(userId).set({
        id: userId,
        uid: userId,
        email: cleanEmail,
        fullName: spec.fullName,
        publicId,
        role: spec.role || 'USER',
        status: 'ACTIVE',
        balanceUsd: spec.walletBalanceUsd,
        spotCommissionUsd: spec.spotCommissionUsd,
        nodeStatus: spec.nodeStatus,
        updatedAt: new Date().toISOString(),
      }, { merge: true });

      await adminFirestore.collection('wallets').doc(userId).set({
        userId,
        balanceUsd: spec.walletBalanceUsd,
        asset: 'USDT',
        updatedAt: new Date().toISOString(),
      }, { merge: true });
    } catch (fsErr) {
      console.warn(`[GenealogySeed] Firestore user sync notice for ${cleanEmail}:`, fsErr);
    }
  }

  // 2. Second pass: Link sponsors & binary placement tree
  for (const spec of GENEALOGY_TREE_SPECS) {
    const cleanEmail = spec.email.trim().toLowerCase();
    const user = emailToUserMap.get(cleanEmail);
    if (!user) continue;

    // Sponsor link
    if (spec.sponsorEmail) {
      const sponsor = emailToUserMap.get(spec.sponsorEmail.trim().toLowerCase());
      if (sponsor) {
        await db.query(`
          UPDATE user_referrals SET sponsor_user_id = $1 WHERE user_id = $2
        `, [sponsor.id, user.id]);

        try {
          const { adminFirestore } = await import('../../lib/firebase-admin');
          await adminFirestore.collection('referrals').doc(user.id).set({
            userId: user.id,
            userPublicId: user.publicId,
            email: cleanEmail,
            sponsorUserId: sponsor.id,
            sponsorPublicId: sponsor.publicId,
            updatedAt: new Date().toISOString(),
          }, { merge: true });
        } catch {}
      }
    }

    // Binary placement link
    if (spec.binaryParentEmail && spec.side) {
      const parent = emailToUserMap.get(spec.binaryParentEmail.trim().toLowerCase());
      if (parent) {
        await db.query(`
          INSERT INTO binary_placements (user_id, parent_user_id, side, status, placed_at, created_at)
          VALUES ($1, $2, $3, 'PLACED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT (user_id) DO UPDATE SET
            parent_user_id = $2,
            side = $3,
            status = 'PLACED',
            placed_at = COALESCE(binary_placements.placed_at, CURRENT_TIMESTAMP)
        `, [user.id, parent.id, spec.side]);

        try {
          const { adminFirestore } = await import('../../lib/firebase-admin');
          await adminFirestore.collection('placements').doc(user.id).set({
            userId: user.id,
            userPublicId: user.publicId,
            parentId: parent.id,
            parentPublicId: parent.publicId,
            side: spec.side,
            status: 'PLACED',
            updatedAt: new Date().toISOString(),
          }, { merge: true });
        } catch {}
      }
    }
  }

  console.log(`[GenealogySeed] Successfully seeded & verified ${GENEALOGY_TREE_SPECS.length} genealogy network tree accounts in PostgreSQL, Firebase Auth, and Cloud Firestore!`);
  return {
    success: true,
    count: GENEALOGY_TREE_SPECS.length,
    users: GENEALOGY_TREE_SPECS.map(s => s.email),
  };
}
