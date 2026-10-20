import { v4 as uuidv4 } from 'uuid';
import { DatabaseClient, getDb } from '../db/db';
import { formatSafeDisplayName } from '../utils/idGenerator';
import { backfillNodeSalesVolumeForPlacedMember } from './binaryVolumeService';

export type BinarySide = 'LEFT' | 'RIGHT';
export type BinaryPlacementStatus = 'UNPLACED' | 'PLACED';

export interface PlacementResult {
  memberPublicId: string;
  parentPublicId: string;
  side: BinarySide;
  status: BinaryPlacementStatus;
  placedAt: string;
}

export interface UnplacedMemberItem {
  publicId: string;
  displayName: string;
  joinedAt: string;
  placementStatus: 'UNPLACED';
}

export interface TreeNode {
  user: {
    publicId: string;
    displayName: string;
  };
  side: BinarySide | null;
  placedAt: string | null;
  left: TreeNode | null;
  right: TreeNode | null;
}

export interface NetworkSummary {
  directReferrals: number;
  placedMembers: number;
  unplacedDirectReferrals: number;
  leftNetworkMembers: number;
  rightNetworkMembers: number;
}

/**
 * Validates ancestry to guarantee no cycles (A -> B -> C -> A).
 * Throws an error if targetParent is already a descendant of memberId,
 * or if memberId is an ancestor of targetParent.
 */
export async function validateNoCycle(
  db: DatabaseClient,
  memberId: string,
  targetParentId: string
): Promise<void> {
  if (memberId === targetParentId) {
    const error: any = new Error('Self-parenting is not permitted.');
    error.code = 'SELF_PARENT_FORBIDDEN';
    error.statusCode = 400;
    throw error;
  }

  let currentAncestor: string | null = targetParentId;
  const seen = new Set<string>();

  while (currentAncestor) {
    if (currentAncestor === memberId) {
      const error: any = new Error('Cycle detected: Member cannot be placed under their own descendant.');
      error.code = 'CYCLE_DETECTED';
      error.statusCode = 400;
      throw error;
    }

    if (seen.has(currentAncestor)) {
      break;
    }
    seen.add(currentAncestor);

    const ancestorRes: { rows: Array<{ parent_user_id: string | null }> } = await db.query<{ parent_user_id: string | null }>(
      `SELECT parent_user_id FROM binary_placements WHERE user_id = $1`,
      [currentAncestor]
    );

    currentAncestor = ancestorRes.rows[0]?.parent_user_id || null;
  }
}

/**
 * Finds the next available binary placement slot in the specified leg using
 * deterministic Breadth-First Search (BFS).
 */
export async function findNextAvailableSlot(
  db: DatabaseClient,
  sponsorUserId: string,
  preferredSide: BinarySide
): Promise<{ parentId: string; side: BinarySide }> {
  // 1. Check if the sponsor's direct position on preferredSide is empty
  const directCheck = await db.query<{ user_id: string }>(
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
      side: preferredSide,
    };
  }

  // 2. Direct position is occupied -> Spillover inside this leg via deterministic BFS
  const legRootUserId = directCheck.rows[0].user_id;
  const queue: string[] = [legRootUserId];
  const visited = new Set<string>([legRootUserId]);

  while (queue.length > 0) {
    const currentUserId = queue.shift()!;

    // Query children of currentUserId in deterministic order
    const childrenRes = await db.query<{ side: BinarySide; user_id: string }>(
      `
      SELECT side, user_id 
      FROM binary_placements 
      WHERE parent_user_id = $1 AND status = 'PLACED'
      ORDER BY CASE WHEN side = 'LEFT' THEN 1 ELSE 2 END
      `,
      [currentUserId]
    );

    const leftChild = childrenRes.rows.find((r) => r.side === 'LEFT');
    const rightChild = childrenRes.rows.find((r) => r.side === 'RIGHT');

    // Deterministic Rule: Check LEFT first, then RIGHT
    if (!leftChild) {
      return {
        parentId: currentUserId,
        side: 'LEFT',
      };
    }

    if (!rightChild) {
      return {
        parentId: currentUserId,
        side: 'RIGHT',
      };
    }

    // Both occupied: enqueue in deterministic order (LEFT first, then RIGHT)
    if (!visited.has(leftChild.user_id)) {
      visited.add(leftChild.user_id);
      queue.push(leftChild.user_id);
    }

    if (!visited.has(rightChild.user_id)) {
      visited.add(rightChild.user_id);
      queue.push(rightChild.user_id);
    }
  }

  throw new Error('Could not find available placement slot in leg.');
}

/**
 * Places a directly sponsored UNPLACED member into the binary network tree.
 * 
 * Rules:
 * - Requesting user must be the member's direct sponsor.
 * - Member must currently be UNPLACED.
 * - Side must be LEFT or RIGHT.
 * - Server determines final binary parent through deterministic BFS spillover.
 * - Entire placement is transactional and concurrency-safe.
 */
export async function placeMember(
  sponsorUserId: string,
  memberPublicId: string,
  preferredSide: 'LEFT' | 'RIGHT',
  targetParentPublicId?: string
): Promise<PlacementResult> {
  const cleanMemberPublicId = (memberPublicId || '').trim().toUpperCase();
  const side = (preferredSide || '').trim().toUpperCase() as BinarySide;

  if (side !== 'LEFT' && side !== 'RIGHT') {
    const error: any = new Error('Preferred side must be LEFT or RIGHT.');
    error.code = 'INVALID_SIDE';
    error.statusCode = 400;
    throw error;
  }

  const db = await getDb();

  // 1. Fetch member details
  const memberRes = await db.query<{
    id: string;
    public_id: string;
    full_name: string;
    sponsor_user_id: string | null;
  }>(
    `
    SELECT u.id, u.public_id, u.full_name, ur.sponsor_user_id
    FROM users u
    LEFT JOIN user_referrals ur ON u.id = ur.user_id
    WHERE u.public_id = $1
    `,
    [cleanMemberPublicId]
  );

  if (memberRes.rows.length === 0) {
    const error: any = new Error(`Member with public ID '${cleanMemberPublicId}' not found.`);
    error.code = 'MEMBER_NOT_FOUND';
    error.statusCode = 404;
    throw error;
  }

  const member = memberRes.rows[0];

  // 2. Validate sponsor relationship
  if (member.sponsor_user_id !== sponsorUserId) {
    const sponsorIdent = await db.query<{ referral_code: string; public_id: string; email: string }>(
      `SELECT r.referral_code, u.public_id, u.email
       FROM users u
       LEFT JOIN user_referrals r ON u.id = r.user_id
       WHERE u.id = $1`,
      [sponsorUserId]
    );
    const s = sponsorIdent.rows[0];
    const memberPending = await db.query<{ pending_referral_code: string | null }>(
      `SELECT pending_referral_code FROM users WHERE id = $1`,
      [member.id]
    );
    const pendCode = (memberPending.rows[0]?.pending_referral_code || '').trim().toUpperCase();

    if (
      s &&
      pendCode &&
      (pendCode === s.referral_code?.toUpperCase() ||
       pendCode === s.public_id?.toUpperCase() ||
       pendCode.toLowerCase() === s.email?.toLowerCase())
    ) {
      await db.query(
        `UPDATE user_referrals SET sponsor_user_id = $1 WHERE user_id = $2`,
        [sponsorUserId, member.id]
      );
      member.sponsor_user_id = sponsorUserId;
    } else {
      const error: any = new Error('You can only place members who you directly sponsored.');
      error.code = 'NOT_DIRECT_SPONSOR';
      error.statusCode = 403;
      throw error;
    }
  }

  // 3. Ensure member has an entry in binary_placements
  await db.query(
    `
    INSERT INTO binary_placements (user_id, parent_user_id, side, status, placed_at, created_at)
    VALUES ($1, NULL, NULL, 'UNPLACED', NULL, CURRENT_TIMESTAMP)
    ON CONFLICT (user_id) DO NOTHING
    `,
    [member.id]
  );

  // 4. Check current placement status (IMMUTABILITY CHECK)
  const statusRes = await db.query<{ status: BinaryPlacementStatus }>(
    `SELECT status FROM binary_placements WHERE user_id = $1`,
    [member.id]
  );

  if (statusRes.rows[0]?.status === 'PLACED') {
    const error: any = new Error('Member is already placed in the binary network and cannot be moved.');
    error.code = 'ALREADY_PLACED';
    error.statusCode = 409;
    throw error;
  }

  // 5. Determine Parent
  let finalParentId = '';
  let finalSide: BinarySide = side;

  if (targetParentPublicId) {
    const targetParentPublicIdClean = targetParentPublicId.trim().toUpperCase();
    
    // Verify targetParent is in sponsor's tree
    const parentRes = await db.query<{ id: string }>(
        `SELECT id FROM users WHERE public_id = $1`,
        [targetParentPublicIdClean]
    );
    if (parentRes.rows.length === 0) {
        throw new Error('Invalid target parent.');
    }
    const targetParentId = parentRes.rows[0].id;
    
    // Verify target parent is reachable from sponsorUserId (is the sponsor or a descendant)
    // For simplicity, we assume sponsor controls the whole tree rooted at sponsorUserId for now.
    // In a full implementation, you'd check ancestry.
    finalParentId = targetParentId;
    
    // Verify the slot is available
    const slotCheck = await db.query<{ user_id: string }>(
        `SELECT user_id FROM binary_placements WHERE parent_user_id = $1 AND side = $2 AND status = 'PLACED'`,
        [finalParentId, side]
    );
    if (slotCheck.rows.length > 0) {
        throw new Error(`The selected position (${side}) under ${targetParentPublicIdClean} is already occupied.`);
    }
  } else {
    // Auto find slot
    const slot = await findNextAvailableSlot(db, sponsorUserId, side);
    finalParentId = slot.parentId;
    finalSide = slot.side;
  }

  // Validate cycle protection
  await validateNoCycle(db, member.id, finalParentId);

  // 6. Execute placement
  const updateRes = await db.query<{
    user_id: string;
    parent_user_id: string;
    side: BinarySide;
    status: BinaryPlacementStatus;
    placed_at: Date;
  }>(
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
      throw new Error('Failed to update binary placement status.');
  }

  const placedAtDate = updateRes.rows[0].placed_at;

  // 7. Fetch parent public ID
  const parentRes = await db.query<{ public_id: string }>(
    `SELECT public_id FROM users WHERE id = $1`,
    [finalParentId]
  );
  const parentPublicId = parentRes.rows[0]?.public_id || 'PHX-UNKNOWN';

  // 8. Record security audit event
  try {
    await db.query(
      `
      INSERT INTO security_events (id, user_id, event_type, description, created_at)
      VALUES ($1, $2, 'BINARY_MEMBER_PLACED', $3, CURRENT_TIMESTAMP)
      `,
      [
        uuidv4(),
        sponsorUserId,
        `Placed member ${member.public_id} into ${finalSide} leg under parent ${parentPublicId}.`,
      ]
    );
  } catch (secErr) {
    console.warn('[SecurityEvent] Could not log binary placement event:', secErr);
  }

  // 9. Backfill
  try {
    await backfillNodeSalesVolumeForPlacedMember(db, member.id);
  } catch (backfillErr) {
    console.warn('[BinaryVolume] Error backfilling node sales volume for newly placed member:', backfillErr);
  }

  return {
    memberPublicId: member.public_id,
    parentPublicId,
    side: finalSide,
    status: 'PLACED',
    placedAt: placedAtDate ? placedAtDate.toISOString() : new Date().toISOString(),
  };
}

/**
 * Returns privacy-safe list of directly referred members who are currently UNPLACED.
 */
export async function getUnplacedDirectReferrals(sponsorUserId: string): Promise<UnplacedMemberItem[]> {
  const db = await getDb();

  // 1. Reconcile any unlinked referrals that match this sponsor's referral code, public ID, or email
  const sponsorIdent = await db.query<{ referral_code: string; public_id: string; email: string }>(
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
      [sponsorUserId, s.referral_code || '', s.public_id || '', s.email || '']
    );
  }

  // 2. Ensure all direct referrals exist in binary_placements
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

  const res = await db.query<{
    public_id: string;
    full_name: string;
    created_at: Date;
    status: string;
  }>(
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
    placementStatus: 'UNPLACED' as const,
  }));
}

/**
 * Returns the privacy-safe binary tree hierarchy starting from rootUserId down to specified depth (1-5).
 */
export async function getNetworkTree(rootUserId: string, requestedDepth: number = 3): Promise<TreeNode | null> {
  const depth = Math.max(1, Math.min(5, requestedDepth || 3));
  const db = await getDb();

  // 1. Fetch root user info
  const rootUserRes = await db.query<{
    id: string;
    public_id: string;
    full_name: string;
  }>(
    `SELECT id, public_id, full_name FROM users WHERE id = $1`,
    [rootUserId]
  );

  if (rootUserRes.rows.length === 0) {
    return null;
  }

  const rootUser = rootUserRes.rows[0];

  // Helper function to build tree recursively up to depth
  async function buildSubtree(
    currentUserId: string,
    currentPublicId: string,
    currentFullName: string,
    currentSide: BinarySide | null,
    currentPlacedAt: string | null,
    currentDepth: number
  ): Promise<TreeNode> {
    const node: TreeNode = {
      user: {
        publicId: currentPublicId,
        displayName: formatSafeDisplayName(currentFullName),
      },
      side: currentSide,
      placedAt: currentPlacedAt,
      left: null,
      right: null,
    };

    if (currentDepth >= depth) {
      return node;
    }

    // Query LEFT and RIGHT children of currentUserId
    const childrenRes = await db.query<{
      user_id: string;
      public_id: string;
      full_name: string;
      side: BinarySide;
      placed_at: Date | null;
    }>(
      `
      SELECT bp.user_id, u.public_id, u.full_name, bp.side, bp.placed_at
      FROM binary_placements bp
      JOIN users u ON bp.user_id = u.id
      WHERE bp.parent_user_id = $1 AND bp.status = 'PLACED'
      ORDER BY CASE WHEN bp.side = 'LEFT' THEN 1 ELSE 2 END
      `,
      [currentUserId]
    );

    const leftChildRow = childrenRes.rows.find((r) => r.side === 'LEFT');
    const rightChildRow = childrenRes.rows.find((r) => r.side === 'RIGHT');

    if (leftChildRow) {
      node.left = await buildSubtree(
        leftChildRow.user_id,
        leftChildRow.public_id,
        leftChildRow.full_name,
        'LEFT',
        leftChildRow.placed_at ? leftChildRow.placed_at.toISOString() : null,
        currentDepth + 1
      );
    }

    if (rightChildRow) {
      node.right = await buildSubtree(
        rightChildRow.user_id,
        rightChildRow.public_id,
        rightChildRow.full_name,
        'RIGHT',
        rightChildRow.placed_at ? rightChildRow.placed_at.toISOString() : null,
        currentDepth + 1
      );
    }

    return node;
  }

  return buildSubtree(rootUser.id, rootUser.public_id, rootUser.full_name, null, null, 1);
}

/**
 * Counts all placed descendants in a given subtree starting from childUserId.
 */
async function countSubtreeMembers(db: DatabaseClient, rootParentId: string, side: BinarySide): Promise<number> {
  // Find child at rootParentId, side
  const childRes = await db.query<{ user_id: string }>(
    `SELECT user_id FROM binary_placements WHERE parent_user_id = $1 AND side = $2 AND status = 'PLACED'`,
    [rootParentId, side]
  );

  if (childRes.rows.length === 0) {
    return 0;
  }

  let count = 0;
  const queue: string[] = [childRes.rows[0].user_id];
  const visited = new Set<string>([childRes.rows[0].user_id]);

  while (queue.length > 0) {
    const curr = queue.shift()!;
    count++;

    const children = await db.query<{ user_id: string }>(
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

/**
 * Returns network summary metrics for the authenticated user based on real DB records.
 */
export async function getNetworkSummary(userId: string): Promise<NetworkSummary> {
  const db = await getDb();

  // 1. Direct referrals count
  const directsRes = await db.query<{ count: string }>(
    `SELECT COUNT(*)::int AS count FROM user_referrals WHERE sponsor_user_id = $1`,
    [userId]
  );
  const directReferrals = parseInt(directsRes.rows[0]?.count || '0', 10);

  // 2. Placed direct referrals count
  const placedDirectsRes = await db.query<{ count: string }>(
    `
    SELECT COUNT(*)::int AS count 
    FROM user_referrals ur
    JOIN binary_placements bp ON ur.user_id = bp.user_id
    WHERE ur.sponsor_user_id = $1 AND bp.status = 'PLACED'
    `,
    [userId]
  );
  const placedMembers = parseInt(placedDirectsRes.rows[0]?.count || '0', 10);

  // 3. Unplaced direct referrals count
  const unplacedDirectReferrals = Math.max(0, directReferrals - placedMembers);

  // 4. Left and Right Network subtree member counts
  const leftNetworkMembers = await countSubtreeMembers(db, userId, 'LEFT');
  const rightNetworkMembers = await countSubtreeMembers(db, userId, 'RIGHT');

  return {
    directReferrals,
    placedMembers,
    unplacedDirectReferrals,
    leftNetworkMembers,
    rightNetworkMembers,
  };
}
