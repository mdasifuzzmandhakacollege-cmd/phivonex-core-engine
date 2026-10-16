export type NetworkStatus = 'operational' | 'degraded' | 'maintenance' | 'offline';

export type ActivityEventType = 
  | 'node_activated'
  | 'reward_epoch_completed'
  | 'ownership_updated'
  | 'reward_claim_confirmed'
  | 'ledger_checkpoint'
  | 'system_event';

export interface LedgerEvent {
  id: string;
  type: ActivityEventType;
  title: string;
  txHash: string;
  nodeId?: string;
  blockNumber: number;
  timestamp: string;
  status: 'confirmed' | 'finalized';
  details: string;
  amount?: string;
}

export interface NodeTier {
  id: string;
  name: string;
  price: string;
  allocated: number;
  cap: number;
  status: 'completed' | 'active' | 'upcoming';
  description: string;
}

export interface NetworkSummary {
  coinMaxSupply: number;
  genesisNodeCap: number;
  allocatedNodes: number;
  availableNodes: number;
  allocationPercent: number;
  activeNodes: number;
  networkTransactions: number;
  currentRewardEpoch: number;
  epochProgressPercent: number;
  networkStatus: NetworkStatus;
  lastLedgerCheckpoint: string;
  currentTier: string;
  nextTier: string;
  tierAllocated: number;
  tierCap: number;
  currentPrice: string;
  nextPrice: string;
  nodesUntilNextStage: number;
  updatedAt: string;
  contractAddress: string;
  networkName: string;
}
