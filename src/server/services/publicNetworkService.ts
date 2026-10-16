import { EventEmitter } from 'events';
import { getDb } from '../db/db';
import { GENESIS_NODE_CAP } from '../../config/nodeConfig';

export const publicNetworkEventEmitter = new EventEmitter();
// Increase max listeners for SSE subscribers
publicNetworkEventEmitter.setMaxListeners(100);

export interface PublicNetworkSummary {
  genesisNodeCap: number;
  activeNodes: number;
  reservedNodes: number;
  availableNodes: number;
  retiredNodes: number;
  allocationPercent: number;
  currentRewardEpoch: number;
  totalNetworkTransactions: number;
  networkStatus: 'OPERATIONAL' | 'HEALTHY' | 'SYNCHRONIZED' | 'DEGRADED' | 'UNKNOWN';
  updatedAt: string;
  conversionRateUsd?: number | null;
}

export interface PublicNetworkEvent {
  id: string;
  type: 'node.activated' | 'reward.epoch.completed' | 'matching.completed' | 'promotion.earned' | 'ledger.checkpoint';
  title: string;
  description: string;
  timestamp: string;
  publicId?: string;
}

/**
 * Retrieves safe, public network-wide aggregated summary metrics directly from DB.
 * Exposes zero private user data.
 */
export async function getPublicNetworkSummary(): Promise<PublicNetworkSummary> {
  const db = await getDb();

  // 1. Get Node Counts by Status
  const nodeCountRes = await db.query<{ status: string; count: string | number }>(
    `SELECT status, COUNT(*)::int AS count FROM nodes GROUP BY status`
  );

  let activeNodes = 0;
  let reservedNodes = 0;
  let availableNodes = 0;
  let retiredNodes = 0;

  for (const row of nodeCountRes.rows) {
    const cnt = Number(row.count || 0);
    if (row.status === 'ACTIVE') activeNodes = cnt;
    else if (row.status === 'RESERVED') reservedNodes = cnt;
    else if (row.status === 'AVAILABLE') availableNodes = cnt;
    else if (row.status === 'RETIRED') retiredNodes = cnt;
  }

  // If AVAILABLE is not explicitly counted (e.g. before initial query), calculate balance
  const totalAllocated = activeNodes + reservedNodes + retiredNodes;
  if (availableNodes === 0 && totalAllocated < GENESIS_NODE_CAP) {
    availableNodes = Math.max(0, GENESIS_NODE_CAP - totalAllocated);
  }

  const allocatedNodes = activeNodes + reservedNodes;
  const allocationPercent = Number(((allocatedNodes / GENESIS_NODE_CAP) * 100).toFixed(2));

  // 2. Get Current/Max Reward Epoch
  const epochRes = await db.query<{ max_epoch: string | number }>(
    `SELECT COALESCE(MAX(epoch_number), 1)::int AS max_epoch FROM reward_epochs`
  );
  const currentRewardEpoch = Number(epochRes.rows[0]?.max_epoch || 1);

  // 3. Get Total Network Ledger Transactions
  const txnRes = await db.query<{ count: string | number }>(
    `SELECT COUNT(*)::int AS count FROM financial_ledger_entries`
  );
  const totalNetworkTransactions = Number(txnRes.rows[0]?.count || 0);

  // 4. Query live INTERNAL_COIN_PRICE_USDT swap rate configuration (no invented fallback)
  let conversionRateUsd: number | null = null;
  try {
    const configRes = await db.query<{ config_value: string; status: string }>(
      `SELECT config_value, status FROM system_economic_configs WHERE config_key = 'INTERNAL_COIN_PRICE_USDT'`
    );
    if (configRes.rows.length > 0 && configRes.rows[0].status === 'ACTIVE') {
      const valStr = configRes.rows[0].config_value;
      const val = typeof valStr === 'string' ? JSON.parse(valStr) : valStr;
      if (val && typeof val.priceUsdt === 'number' && val.priceUsdt > 0) {
        conversionRateUsd = val.priceUsdt;
      }
    }
  } catch (err) {
    console.warn('[Public API] Error loading INTERNAL_COIN_PRICE_USDT config value for summary:', err);
  }

  // 5. Verify real backend network/database health status
  let networkStatus: 'OPERATIONAL' | 'HEALTHY' | 'SYNCHRONIZED' | 'DEGRADED' | 'UNKNOWN' = 'OPERATIONAL';
  try {
    await db.query('SELECT 1');
  } catch {
    networkStatus = 'DEGRADED';
  }

  return {
    genesisNodeCap: GENESIS_NODE_CAP,
    activeNodes,
    reservedNodes,
    availableNodes,
    retiredNodes,
    allocationPercent,
    currentRewardEpoch,
    totalNetworkTransactions,
    networkStatus,
    updatedAt: new Date().toISOString(),
    conversionRateUsd,
  };
}

/**
 * Retrieves sanitized, privacy-safe public events from real database records.
 * Never exposes emails, full names, phones, internal database UUIDs, or private wallet balances.
 */
export async function getPublicNetworkEvents(limit = 20): Promise<PublicNetworkEvent[]> {
  const db = await getDb();
  const events: PublicNetworkEvent[] = [];

  try {
    // 1. Fetch Real Node Activations
    const activeNodesRes = await db.query<{ public_node_id: string; activated_at: Date }>(
      `SELECT public_node_id, activated_at 
       FROM nodes 
       WHERE status = 'ACTIVE' AND activated_at IS NOT NULL 
       ORDER BY activated_at DESC 
       LIMIT $1`,
      [limit]
    );

    for (const row of activeNodesRes.rows) {
      const ts = new Date(row.activated_at).toISOString();
      events.push({
        id: `evt-node-${row.public_node_id}`,
        type: 'node.activated',
        title: `${row.public_node_id} Activated`,
        description: `Genesis validator node ${row.public_node_id} successfully activated on protocol ledger.`,
        timestamp: ts,
        publicId: row.public_node_id,
      });
    }

    // 2. Fetch Real Reward Epochs
    const epochRes = await db.query<{ public_epoch_id: string; epoch_number: number; status: string; settled_at: Date; created_at: Date }>(
      `SELECT public_epoch_id, epoch_number, status, settled_at, created_at 
       FROM reward_epochs 
       ORDER BY created_at DESC 
       LIMIT $1`,
      [limit]
    );

    for (const row of epochRes.rows) {
      const ts = new Date(row.settled_at || row.created_at).toISOString();
      events.push({
        id: `evt-epoch-${row.public_epoch_id}`,
        type: 'reward.epoch.completed',
        title: `Reward Epoch #${row.epoch_number} ${row.status === 'COMPLETED' ? 'Completed' : 'Initiated'}`,
        description: `Mining reward epoch #${row.epoch_number} state verified on protocol ledger.`,
        timestamp: ts,
        publicId: row.public_epoch_id,
      });
    }

    // 3. Fetch Real Binary Matching Settlements
    const matchingRes = await db.query<{ public_settlement_id: string; business_date: Date | string; settled_at: Date }>(
      `SELECT public_settlement_id, business_date, settled_at 
       FROM binary_matching_settlements 
       WHERE status = 'COMPLETED' 
       ORDER BY settled_at DESC 
       LIMIT $1`,
      [limit]
    );

    for (const row of matchingRes.rows) {
      const ts = new Date(row.settled_at).toISOString();
      const dateStr = typeof row.business_date === 'string' ? row.business_date.split('T')[0] : new Date(row.business_date).toISOString().split('T')[0];
      events.push({
        id: `evt-match-${row.public_settlement_id}`,
        type: 'matching.completed',
        title: `Matching Settlement Completed`,
        description: `Binary team network consensus settlement finalized for date ${dateStr}.`,
        timestamp: ts,
        publicId: row.public_settlement_id,
      });
    }

    // 4. Fetch Real Promotion Milestone Bonuses
    const promoRes = await db.query<{ public_bonus_id: string; milestone: string; qualified_at: Date }>(
      `SELECT public_bonus_id, milestone, qualified_at 
       FROM promotion_bonuses 
       WHERE status = 'EARNED' 
       ORDER BY qualified_at DESC 
       LIMIT $1`,
      [limit]
    );

    for (const row of promoRes.rows) {
      const ts = new Date(row.qualified_at).toISOString();
      events.push({
        id: `evt-promo-${row.public_bonus_id}`,
        type: 'promotion.earned',
        title: `Promotion Milestone (${row.milestone}) Qualified`,
        description: `Network operator volume qualification reached milestone Tier ${row.milestone}.`,
        timestamp: ts,
        publicId: row.public_bonus_id,
      });
    }

    // 5. Fetch Real Ledger Checkpoints
    const fleRes = await db.query<{ public_txn_id: string; source_type: string; created_at: Date }>(
      `SELECT public_txn_id, source_type, created_at 
       FROM financial_ledger_entries 
       ORDER BY created_at DESC 
       LIMIT $1`,
      [limit]
    );

    for (const row of fleRes.rows) {
      const ts = new Date(row.created_at).toISOString();
      events.push({
        id: `evt-fle-${row.public_txn_id}`,
        type: 'ledger.checkpoint',
        title: `Ledger Checkpoint ${row.public_txn_id}`,
        description: `Cryptographic financial ledger entry posted for channel ${row.source_type}.`,
        timestamp: ts,
        publicId: row.public_txn_id,
      });
    }

    // Sort combined events by timestamp descending
    events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Return requested top slice
    return events.slice(0, limit);
  } catch (err) {
    console.error('[PublicNetworkService] Error fetching public network events:', err);
    return [];
  }
}

/**
 * Broadcasts a public event to all active real-time SSE stream listeners.
 */
export function broadcastPublicEvent(event: PublicNetworkEvent) {
  publicNetworkEventEmitter.emit('networkEvent', event);
}
