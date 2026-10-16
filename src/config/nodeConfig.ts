/**
 * Authoritative PHIVONEX Genesis Node Configuration (Task #6)
 * Single source of truth for Node cap, pricing, statuses, and state transitions.
 */

export const GENESIS_NODE_CAP = 10000;
export const NODE_BASE_PRICE_USD = 1000;
export const RESERVATION_EXPIRY_MINUTES = 15;

export type NodeStatus = 'AVAILABLE' | 'RESERVED' | 'ACTIVE' | 'RETIRED';
export const NODE_STATUSES: NodeStatus[] = ['AVAILABLE', 'RESERVED', 'ACTIVE', 'RETIRED'];

export type NodeOrderStatus = 'PENDING' | 'SETTLING' | 'COMPLETED' | 'CANCELLED' | 'EXPIRED' | 'FAILED';
export const NODE_ORDER_STATUSES: NodeOrderStatus[] = ['PENDING', 'SETTLING', 'COMPLETED', 'CANCELLED', 'EXPIRED', 'FAILED'];

export type PaymentMethod = 'SIMULATED_INSTANT' | 'CRYPTO_USDT' | 'BANK_WIRE';
export const PAYMENT_METHODS: PaymentMethod[] = ['SIMULATED_INSTANT', 'CRYPTO_USDT', 'BANK_WIRE'];

/**
 * Allowed lifecycle state transitions for Nodes:
 * AVAILABLE -> RESERVED
 * RESERVED  -> ACTIVE | AVAILABLE
 * ACTIVE    -> RETIRED
 * RETIRED   -> (none)
 */
export const ALLOWED_STATE_TRANSITIONS: Record<NodeStatus, NodeStatus[]> = {
  AVAILABLE: ['RESERVED'],
  RESERVED: ['ACTIVE', 'AVAILABLE'],
  ACTIVE: ['RETIRED'],
  RETIRED: [],
};

/**
 * Allowed lifecycle state transitions for Node Orders:
 * PENDING   -> SETTLING | COMPLETED | CANCELLED | EXPIRED | FAILED
 * SETTLING  -> COMPLETED | FAILED
 * COMPLETED -> (none)
 * CANCELLED -> (none)
 * EXPIRED   -> (none)
 * FAILED    -> (none)
 */
export const ALLOWED_ORDER_TRANSITIONS: Record<NodeOrderStatus, NodeOrderStatus[]> = {
  PENDING: ['SETTLING', 'COMPLETED', 'CANCELLED', 'EXPIRED', 'FAILED'],
  SETTLING: ['COMPLETED', 'FAILED'],
  COMPLETED: [],
  CANCELLED: [],
  EXPIRED: [],
  FAILED: [],
};

/**
 * Server-side / client-side validation for state transitions
 */
export function isValidNodeStateTransition(current: NodeStatus, target: NodeStatus): boolean {
  return ALLOWED_STATE_TRANSITIONS[current]?.includes(target) || false;
}

/**
 * Server-side validation for order state transitions
 */
export function isValidOrderStateTransition(current: NodeOrderStatus, target: NodeOrderStatus): boolean {
  return ALLOWED_ORDER_TRANSITIONS[current]?.includes(target) || false;
}

/**
 * Generates human-readable, permanent public Node ID (e.g., PHX-NODE-000042)
 */
export function formatPublicNodeId(nodeNumber: number): string {
  if (nodeNumber < 1 || nodeNumber > GENESIS_NODE_CAP) {
    throw new Error(`Node number ${nodeNumber} out of Genesis range [1, ${GENESIS_NODE_CAP}]`);
  }
  return `PHX-NODE-${String(nodeNumber).padStart(6, '0')}`;
}
