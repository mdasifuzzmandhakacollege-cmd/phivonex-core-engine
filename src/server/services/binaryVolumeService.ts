import { v4 as uuidv4 } from 'uuid';
import { DatabaseClient, getDb } from '../db/db';
import { generateVolumeEventPublicId } from '../utils/idGenerator';
import { getDhakaBusinessDate } from '../utils/timezone';

export type VolumeSide = 'LEFT' | 'RIGHT';
export type VolumeStatus = 'ACTIVE' | 'REVERSED';

export interface VolumeEventItem {
  id: string;
  publicEventId: string;
  beneficiaryUserId: string;
  sourceUserId: string;
  sourceNodeId: string;
  side: VolumeSide;
  volumeUnits: number;
  status: VolumeStatus;
  businessDate: string;
  occurredAt: string;
  createdAt: string;
}

export interface VolumeSummary {
  businessDate: string; // 'YYYY-MM-DD' in Asia/Dhaka
  today: {
    left: number;
    right: number;
  };
  carry: {
    left: number;
    right: number;
  };
  availableForFutureMatching: {
    left: number;
    right: number;
  };
}

export interface VolumeHistoryItem {
  businessDate: string;
  leftUnits: number;
  rightUnits: number;
}

export interface VolumeHistoryResponse {
  history: VolumeHistoryItem[];
  pagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
  };
}

export interface VolumePropagationResult {
  sourceNodeId: string;
  buyerUserId: string;
  eventsCreated: number;
  ancestorsProcessed: number;
  reason?: string;
}

/**
 * Traverses binary placement ancestry upwards and generates authoritative
 * volume events for each ancestor based on the leg through which the buyer is connected.
 * 
 * Rules:
 * - 1 ACTIVE eligible Genesis Node = 1 Volume Unit.
 * - Idempotent: UNIQUE(beneficiary_user_id, source_node_id) guarantees no duplicate volume.
 * - The buyer does NOT receive volume in own legs for own purchase.
 * - Sponsor relationship does not dictate binary volume side.
 * - Business date is computed server-side in Asia/Dhaka.
 */
export async function propagateNodeSalesVolume(
  dbClient: DatabaseClient | null,
  sourceNodeId: string,
  buyerUserId: string,
  occurredAtDate?: Date
): Promise<VolumePropagationResult> {
  const db = dbClient || (await getDb());

  // 1. Verify Node eligibility: MUST be ACTIVE
  const nodeRes = await db.query<{
    id: string;
    status: string;
    owner_user_id: string | null;
    activated_at: Date | null;
  }>(
    `SELECT id, status, owner_user_id, activated_at FROM nodes WHERE id = $1`,
    [sourceNodeId]
  );

  if (nodeRes.rows.length === 0) {
    return {
      sourceNodeId,
      buyerUserId,
      eventsCreated: 0,
      ancestorsProcessed: 0,
      reason: 'NODE_NOT_FOUND',
    };
  }

  const node = nodeRes.rows[0];
  if (node.status !== 'ACTIVE') {
    return {
      sourceNodeId,
      buyerUserId,
      eventsCreated: 0,
      ancestorsProcessed: 0,
      reason: `NODE_NOT_ACTIVE (status=${node.status})`,
    };
  }

  if (node.owner_user_id !== buyerUserId) {
    return {
      sourceNodeId,
      buyerUserId,
      eventsCreated: 0,
      ancestorsProcessed: 0,
      reason: 'BUYER_MISMATCH',
    };
  }

  // 2. Check if buyer is placed in the binary network
  const buyerPlacementRes = await db.query<{
    parent_user_id: string | null;
    side: VolumeSide | null;
    status: string;
  }>(
    `SELECT parent_user_id, side, status FROM binary_placements WHERE user_id = $1`,
    [buyerUserId]
  );

  const buyerPlacement = buyerPlacementRes.rows[0];
  if (!buyerPlacement || buyerPlacement.status !== 'PLACED' || !buyerPlacement.parent_user_id) {
    // Member is not yet placed in binary tree.
    // Sale will be backfilled when they are placed via backfillNodeSalesVolumeForPlacedMember.
    return {
      sourceNodeId,
      buyerUserId,
      eventsCreated: 0,
      ancestorsProcessed: 0,
      reason: 'BUYER_NOT_PLACED',
    };
  }

  // 3. Traverse binary placement ancestry upwards
  // For each ancestor, determine side using the first descendant directly below that ancestor in the path.
  interface AncestorStep {
    ancestorUserId: string;
    side: VolumeSide;
  }

  const ancestors: AncestorStep[] = [];
  let currentUserId = buyerUserId;
  const visited = new Set<string>([buyerUserId]);

  while (true) {
    const stepRes = await db.query<{
      parent_user_id: string | null;
      side: VolumeSide | null;
      status: string;
    }>(
      `SELECT parent_user_id, side, status FROM binary_placements WHERE user_id = $1`,
      [currentUserId]
    );

    const step = stepRes.rows[0];
    if (!step || step.status !== 'PLACED' || !step.parent_user_id || !step.side) {
      break; // Reached root or unplaced node
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
      side: legSide,
    });

    currentUserId = parentId;
  }

  if (ancestors.length === 0) {
    return {
      sourceNodeId,
      buyerUserId,
      eventsCreated: 0,
      ancestorsProcessed: 0,
      reason: 'NO_ANCESTORS',
    };
  }

  // 4. Determine effective date and Asia/Dhaka business date
  const effectiveTimestamp = occurredAtDate || (node.activated_at ? new Date(node.activated_at) : new Date());
  const businessDate = getDhakaBusinessDate(effectiveTimestamp);

  let eventsCreated = 0;

  // 5. Create volume events & update daily aggregation for each ancestor
  for (const step of ancestors) {
    const eventId = uuidv4();
    const publicEventId = generateVolumeEventPublicId();

    // Idempotent insert into binary_volume_events
    const insertRes = await db.query<{ id: string }>(
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
        effectiveTimestamp,
      ]
    );

    if (insertRes.rows.length > 0) {
      eventsCreated++;

      // Update daily aggregation in binary_daily_volumes
      const dailyId = uuidv4();
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

      // Ensure carry balance foundation row exists
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
    ancestorsProcessed: ancestors.length,
  };
}

/**
 * Backfills node sales volume when an unplaced member with active nodes
 * is subsequently placed into the binary network tree.
 * Idempotency guarantees no double-counting.
 */
export async function backfillNodeSalesVolumeForPlacedMember(
  dbClient: DatabaseClient | null,
  memberUserId: string
): Promise<number> {
  const db = dbClient || (await getDb());

  // Fetch all ACTIVE nodes owned by this member
  const activeNodesRes = await db.query<{
    id: string;
    activated_at: Date | null;
  }>(
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
      node.activated_at ? new Date(node.activated_at) : undefined
    );
    totalEventsCreated += result.eventsCreated;
  }

  return totalEventsCreated;
}

/**
 * Reverses volume events for a refunded or legitimately reversed node sale.
 * Transitions volume events: ACTIVE -> REVERSED.
 * Safely decrements daily volumes and maintains full audit history.
 */
export async function reverseNodeSalesVolume(
  dbClient: DatabaseClient | null,
  sourceNodeId: string
): Promise<number> {
  const db = dbClient || (await getDb());

  // Find all ACTIVE volume events for this node
  const eventsRes = await db.query<{
    id: string;
    beneficiary_user_id: string;
    side: VolumeSide;
    volume_units: number;
    business_date: string | Date;
  }>(
    `
    SELECT id, beneficiary_user_id, side, volume_units, business_date
    FROM binary_volume_events
    WHERE source_node_id = $1 AND status = 'ACTIVE'
    `,
    [sourceNodeId]
  );

  if (eventsRes.rows.length === 0) {
    return 0;
  }

  let reversedCount = 0;
  for (const ev of eventsRes.rows) {
    // 1. Mark event as REVERSED
    await db.query(
      `
      UPDATE binary_volume_events
      SET status = 'REVERSED', reversed_at = CURRENT_TIMESTAMP
      WHERE id = $1
      `,
      [ev.id]
    );

    // 2. Decrement daily volumes safely
    const bDate = typeof ev.business_date === 'string'
      ? ev.business_date.split('T')[0]
      : new Date(ev.business_date).toISOString().split('T')[0];

    await db.query(
      `
      UPDATE binary_daily_volumes
      SET
        left_units = GREATEST(0, left_units - (CASE WHEN $1 = 'LEFT' THEN $2 ELSE 0 END)),
        right_units = GREATEST(0, right_units - (CASE WHEN $1 = 'RIGHT' THEN $2 ELSE 0 END)),
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $3 AND business_date = $4
      `,
      [ev.side, ev.volume_units, ev.beneficiary_user_id, bDate]
    );

    reversedCount++;
  }

  return reversedCount;
}

/**
 * Returns current-user volume summary:
 * - businessDate: Current Asia/Dhaka date (YYYY-MM-DD)
 * - today: Today's left/right node volume
 * - carry: Carry forward left/right units from binary_volume_balances
 * - availableForFutureMatching: carry + current unsettled eligible volume
 */
export async function getVolumeSummary(userId: string): Promise<VolumeSummary> {
  const db = await getDb();
  const currentDhakaDate = getDhakaBusinessDate();

  // 1. Fetch today's volume
  const todayRes = await db.query<{
    left_units: number;
    right_units: number;
  }>(
    `
    SELECT left_units, right_units
    FROM binary_daily_volumes
    WHERE user_id = $1 AND business_date = $2
    `,
    [userId, currentDhakaDate]
  );

  const todayLeft = todayRes.rows[0] ? Number(todayRes.rows[0].left_units) : 0;
  const todayRight = todayRes.rows[0] ? Number(todayRes.rows[0].right_units) : 0;

  // 2. Fetch carry forward balance
  const balanceRes = await db.query<{
    carry_left_units: number;
    carry_right_units: number;
    last_settled_business_date: Date | string | null;
  }>(
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

  // 3. Fetch unsettled eligible volume (status = 'ACTIVE')
  let unsettledQuery: string;
  let unsettledParams: any[];

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

  const unsettledRes = await db.query<{
    unsettled_left: number;
    unsettled_right: number;
  }>(unsettledQuery, unsettledParams);

  const unsettledLeft = unsettledRes.rows[0] ? Number(unsettledRes.rows[0].unsettled_left) : 0;
  const unsettledRight = unsettledRes.rows[0] ? Number(unsettledRes.rows[0].unsettled_right) : 0;

  // Available = carry + current unsettled eligible volume
  const availableLeft = carryLeft + unsettledLeft;
  const availableRight = carryRight + unsettledRight;

  return {
    businessDate: currentDhakaDate,
    today: {
      left: todayLeft,
      right: todayRight,
    },
    carry: {
      left: carryLeft,
      right: carryRight,
    },
    availableForFutureMatching: {
      left: availableLeft,
      right: availableRight,
    },
  };
}

/**
 * Returns paginated daily volume history for authenticated user.
 */
export async function getVolumeHistory(
  userId: string,
  page = 1,
  limit = 20
): Promise<VolumeHistoryResponse> {
  const db = await getDb();
  const safePage = Math.max(1, page);
  const safeLimit = Math.min(100, Math.max(1, limit));
  const offset = (safePage - 1) * safeLimit;

  // 1. Total count
  const countRes = await db.query<{ count: string | number }>(
    `SELECT COUNT(*)::int AS count FROM binary_daily_volumes WHERE user_id = $1`,
    [userId]
  );
  const totalCount = Number(countRes.rows[0]?.count || 0);

  // 2. Fetch history records
  const rowsRes = await db.query<{
    business_date: string | Date;
    left_units: number;
    right_units: number;
  }>(
    `
    SELECT business_date, left_units, right_units
    FROM binary_daily_volumes
    WHERE user_id = $1
    ORDER BY business_date DESC
    LIMIT $2 OFFSET $3
    `,
    [userId, safeLimit, offset]
  );

  const history: VolumeHistoryItem[] = rowsRes.rows.map((r) => ({
    businessDate:
      typeof r.business_date === 'string'
        ? r.business_date.split('T')[0]
        : new Date(r.business_date).toISOString().split('T')[0],
    leftUnits: Number(r.left_units),
    rightUnits: Number(r.right_units),
  }));

  return {
    history,
    pagination: {
      page: safePage,
      limit: safeLimit,
      totalCount,
      totalPages: Math.max(1, Math.ceil(totalCount / safeLimit)),
    },
  };
}
