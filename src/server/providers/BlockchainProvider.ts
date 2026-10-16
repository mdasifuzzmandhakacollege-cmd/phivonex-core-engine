import { ethers } from 'ethers';
import { getIntegrationConfig } from '../../config/integrationConfig';

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'down';
  details: string;
}

export interface BlockchainProvider {
  getChainId(): number;
  getLatestBlockNumber(): Promise<number>;
  getNativeBalance(address: string): Promise<bigint>;
  getErc20Balance(contractAddress: string, walletAddress: string): Promise<bigint>;
  getTransactionReceipt(txHash: string): Promise<any>;
  isRpcHealthy(): Promise<{ primary: boolean; secondary: boolean; activeRpc: string }>;
  getHealthStatus(): Promise<HealthStatus>;
  getBalance(address: string): Promise<string>; // Returns formatted native balance as string
}

export class BlockchainProviderImpl implements BlockchainProvider {
  private config = getIntegrationConfig();
  private primaryProvider: ethers.JsonRpcProvider | null = null;
  private secondaryProvider: ethers.JsonRpcProvider | null = null;
  private currentActive: 'primary' | 'secondary' = 'primary';
  private lastFailoverTime: number = 0;

  constructor() {
    this.initializeProviders();
  }

  private initializeProviders() {
    if (this.config.appEnv === 'test') {
      return;
    }

    try {
      if (this.config.bscRpcUrlPrimary) {
        this.primaryProvider = new ethers.JsonRpcProvider(this.config.bscRpcUrlPrimary, undefined, {
          staticNetwork: true,
        });
      }
    } catch (err) {
      console.error('Failed to initialize primary provider in BlockchainProviderImpl:', err);
    }

    try {
      if (this.config.bscRpcUrlSecondary) {
        this.secondaryProvider = new ethers.JsonRpcProvider(this.config.bscRpcUrlSecondary, undefined, {
          staticNetwork: true,
        });
      }
    } catch (err) {
      console.error('Failed to initialize secondary provider in BlockchainProviderImpl:', err);
    }
  }

  private getActiveProvider(): ethers.JsonRpcProvider {
    if (this.config.appEnv === 'test') {
      throw new Error('Active provider is not available in mock/test environment');
    }

    if (this.currentActive === 'primary') {
      return this.primaryProvider || this.secondaryProvider || this.throwNoProviderError();
    } else {
      return this.secondaryProvider || this.primaryProvider || this.throwNoProviderError();
    }
  }

  private throwNoProviderError(): never {
    throw new Error('FATAL_RPC_ERROR: No blockchain RPC providers could be successfully initialized.');
  }

  /**
   * Automatically executes the given action on the active provider. If it times out or fails,
   * switches the active provider and retries.
   */
  private async executeWithFailover<T>(action: (provider: ethers.JsonRpcProvider) => Promise<T>): Promise<T> {
    if (this.config.appEnv === 'test') {
      throw new Error('executeWithFailover should not be called in mock/test environment');
    }

    const provider = this.getActiveProvider();
    try {
      // 5-second RPC Timeout Protection
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('RPC_TIMEOUT')), 5000)
      );
      return await Promise.race([action(provider), timeoutPromise]);
    } catch (err: any) {
      console.warn(`[BlockchainProviderImpl] RPC call failed on active provider (${this.currentActive}):`, err.message || err);
      
      // Toggle active provider to failover
      this.currentActive = this.currentActive === 'primary' ? 'secondary' : 'primary';
      this.lastFailoverTime = Date.now();
      console.warn(`[BlockchainProviderImpl] Failover triggered. Active RPC endpoint switched to: ${this.currentActive}`);

      const backupProvider = this.getActiveProvider();
      try {
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('RPC_TIMEOUT')), 5000)
        );
        return await Promise.race([action(backupProvider), timeoutPromise]);
      } catch (backupErr: any) {
        console.error('[BlockchainProviderImpl] Backup RPC endpoint also failed:', backupErr.message || backupErr);
        throw new Error(`ALL_RPC_ENDPOINTS_FAILED: ${backupErr.message || backupErr}`);
      }
    }
  }

  getChainId(): number {
    return this.config.bscChainId;
  }

  async getLatestBlockNumber(): Promise<number> {
    if (this.config.appEnv === 'test') {
      return 29012345;
    }
    return this.executeWithFailover(async (provider) => {
      return await provider.getBlockNumber();
    });
  }

  async getNativeBalance(address: string): Promise<bigint> {
    if (this.config.appEnv === 'test') {
      return ethers.parseEther('1.5'); // Mock 1.5 BNB
    }
    return this.executeWithFailover(async (provider) => {
      return await provider.getBalance(address);
    });
  }

  async getBalance(address: string): Promise<string> {
    const rawBalance = await this.getNativeBalance(address);
    return ethers.formatEther(rawBalance);
  }

  async getErc20Balance(contractAddress: string, walletAddress: string): Promise<bigint> {
    if (this.config.appEnv === 'test') {
      return ethers.parseUnits('2500', 18); // Mock 2,500 USDT
    }
    return this.executeWithFailover(async (provider) => {
      const abi = ['function balanceOf(address owner) view returns (uint256)'];
      const contract = new ethers.Contract(contractAddress, abi, provider);
      return await contract.balanceOf(walletAddress);
    });
  }

  async getTransactionReceipt(txHash: string): Promise<any> {
    if (this.config.appEnv === 'test') {
      return {
        blockNumber: 29012345,
        status: 1,
        from: '0x1234567890123456789012345678901234567890',
        to: this.config.usdtContractAddress,
      };
    }
    return this.executeWithFailover(async (provider) => {
      return await provider.getTransactionReceipt(txHash);
    });
  }

  async isRpcHealthy(): Promise<{ primary: boolean; secondary: boolean; activeRpc: string }> {
    if (this.config.appEnv === 'test') {
      return { primary: true, secondary: true, activeRpc: 'MOCK_TEST_RPC' };
    }

    let primary = false;
    let secondary = false;

    if (this.primaryProvider) {
      try {
        await Promise.race([
          this.primaryProvider.getBlockNumber(),
          new Promise<never>((_, r) => setTimeout(() => r(new Error('timeout')), 3000)),
        ]);
        primary = true;
      } catch {}
    }

    if (this.secondaryProvider) {
      try {
        await Promise.race([
          this.secondaryProvider.getBlockNumber(),
          new Promise<never>((_, r) => setTimeout(() => r(new Error('timeout')), 3000)),
        ]);
        secondary = true;
      } catch {}
    }

    const activeRpc = this.currentActive === 'primary' ? 'Primary RPC' : 'Secondary RPC';
    return { primary, secondary, activeRpc };
  }

  async getHealthStatus(): Promise<HealthStatus> {
    if (this.config.appEnv === 'test') {
      return {
        status: 'healthy',
        details: 'Mock test RPC blockchain provider is running.'
      };
    }

    try {
      const health = await this.isRpcHealthy();
      if (health.primary && health.secondary) {
        return {
          status: 'healthy',
          details: 'Both primary and secondary RPC endpoints are online.'
        };
      } else if (health.primary || health.secondary) {
        const activeRpcName = health.primary ? 'Primary RPC' : 'Secondary RPC';
        return {
          status: 'degraded',
          details: `One of the RPC endpoints is offline. Active and working endpoint: ${activeRpcName}.`
        };
      } else {
        return {
          status: 'down',
          details: 'All configured RPC endpoints are down or unreachable. Blockchain integration is offline.'
        };
      }
    } catch (err: any) {
      return {
        status: 'down',
        details: `Failed to evaluate RPC health: ${err.message || err}`
      };
    }
  }
}

// Export singleton instance management
let blockchainProviderInstance: BlockchainProvider | null = null;

export function getBlockchainProvider(): BlockchainProvider {
  if (!blockchainProviderInstance) {
    blockchainProviderInstance = new BlockchainProviderImpl();
  }
  return blockchainProviderInstance;
}
