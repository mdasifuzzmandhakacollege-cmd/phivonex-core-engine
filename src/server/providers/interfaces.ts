/**
 * PHIVONEX — Task #23.2 Provider Abstraction Layer Interfaces
 * 
 * Business logic depends solely on these interfaces, so financial operations
 * are completely decoupled from any single third-party provider (e.g., Moralis).
 */

export interface MarketPriceResult {
  asset: string;
  currency: 'USD' | 'USDT';
  price: number;
  timestampMs: number;
  isStale: boolean;
  source: string;
}

export interface DepositEventPayload {
  chainId: number;
  txHash: string;
  blockNumber: number;
  contractAddress: string;
  fromAddress: string;
  toAddress: string;
  amount: number;
  asset: 'USDT' | 'BNB';
  signature?: string;
  confirmations?: number;
}

export interface DepositProcessResult {
  credited: boolean;
  depositId?: string;
  reason?: string;
  userId?: string;
  alreadyProcessed?: boolean;
}

export interface WithdrawalSignParams {
  withdrawalPublicId: string;
  userId: string;
  destinationAddress: string;
  amountBnb: number;
  gasLimit?: bigint;
}

export interface WithdrawalSignResult {
  txHash: string;
  nonce: number;
  fromAddress: string;
  destination: string;
  amountBnb: number;
  status: 'BROADCASTED' | 'CONFIRMED' | 'FAILED';
  isMock: boolean;
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'down';
  details: string;
}

/**
 * 1. Blockchain RPC & Query Provider Interface
 */
export interface BlockchainProvider {
  getChainId(): number;
  getLatestBlockNumber(): Promise<number>;
  getNativeBalance(address: string): Promise<bigint>;
  getErc20Balance(contractAddress: string, walletAddress: string): Promise<bigint>;
  getTransactionReceipt(txHash: string): Promise<any>;
  isRpcHealthy(): Promise<{ primary: boolean; secondary: boolean; activeRpc: string }>;
  getHealthStatus(): Promise<HealthStatus>;
}

/**
 * 2. Market Data Price Provider Interface
 */
export interface MarketDataProvider {
  getAssetPrice(asset: string, quoteCurrency?: 'USD' | 'USDT'): Promise<MarketPriceResult>;
}

/**
 * 3. Deposit Event Sync / Webhook Provider Interface
 */
export interface DepositEventProvider {
  verifyWebhookSignature(headers: Record<string, string | string[] | undefined>, rawBody: string | Buffer): boolean;
  processDepositEvent(payload: DepositEventPayload): Promise<DepositProcessResult>;
}

/**
 * 4. Withdrawal Signer / Broadcast Provider Interface
 */
export interface WithdrawalSignerProvider {
  isWithdrawalEnabled(): boolean;
  signAndBroadcastWithdrawal(params: WithdrawalSignParams): Promise<WithdrawalSignResult>;
}
