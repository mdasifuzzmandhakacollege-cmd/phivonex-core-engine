import { getIntegrationConfig } from '../../config/integrationConfig';
import { getBlockchainProvider } from '../providers/BlockchainProvider';
import { HealthStatus } from '../providers/interfaces';

export interface IntegrationHealthSummary {
  blockchainProvider: HealthStatus;
  primaryRpc: {
    url: string; // Masked for security
    healthy: boolean;
  };
  secondaryRpc: {
    url: string; // Masked for security
    healthy: boolean;
  };
  depositProvider: {
    type: 'Moralis' | 'Internal' | 'Mock';
    configured: boolean;
  };
  marketDataProvider: {
    status: 'healthy' | 'degraded' | 'down' | 'unconfigured' | 'test';
    details: string;
  };
  signerConfiguration: {
    status: 'CONFIGURED' | 'TEST_MOCK' | 'UNCONFIGURED';
    withdrawalsEnabled: boolean;
  };
}

export async function getIntegrationHealthStatus(): Promise<IntegrationHealthSummary> {
  const config = getIntegrationConfig();
  const bscProvider = getBlockchainProvider();

  // 1. Fetch blockchain RPC health and details
  let blockchainProviderHealth: HealthStatus = {
    status: 'down',
    details: 'Provider not initialized.'
  };
  let rpcHealth = { primary: false, secondary: false, activeRpc: 'None' };

  try {
    blockchainProviderHealth = await bscProvider.getHealthStatus();
    rpcHealth = await bscProvider.isRpcHealthy();
  } catch (err: any) {
    blockchainProviderHealth = {
      status: 'down',
      details: `Failed to query RPC status: ${err.message || err}`
    };
  }

  // Helper to safely mask RPC URLs (keep protocol and host/subdomain but hide path/api keys)
  const maskUrl = (url: string): string => {
    try {
      const parsed = new URL(url);
      return `${parsed.protocol}//${parsed.host}/...`;
    } catch {
      return 'http://...';
    }
  };

  // 2. Deposit Provider configuration check (Moralis)
  const depositConfigured = Boolean(config.moralisApiKey && config.moralisWebhookSecret);
  const depositType = config.appEnv === 'test' ? 'Mock' : 'Moralis';

  // 3. Market Data Provider check
  const hasMarketApiKey = Boolean(config.marketDataApiKey);
  const marketStatus = config.appEnv === 'test' 
    ? 'test' 
    : hasMarketApiKey 
      ? 'healthy' 
      : 'unconfigured';
  const marketDetails = config.appEnv === 'test'
    ? 'Running in mock test mode with simulated rates.'
    : hasMarketApiKey
      ? 'Market data provider API key loaded.'
      : 'Market data API key is missing. Falling back to local params.';

  // 4. Signer configuration
  let signerStatus: 'CONFIGURED' | 'TEST_MOCK' | 'UNCONFIGURED' = 'UNCONFIGURED';
  if (config.appEnv === 'test') {
    signerStatus = 'TEST_MOCK';
  } else if (config.signerSecretReference) {
    signerStatus = 'CONFIGURED';
  }

  return {
    blockchainProvider: blockchainProviderHealth,
    primaryRpc: {
      url: maskUrl(config.bscRpcUrlPrimary),
      healthy: rpcHealth.primary,
    },
    secondaryRpc: {
      url: maskUrl(config.bscRpcUrlSecondary),
      healthy: rpcHealth.secondary,
    },
    depositProvider: {
      type: depositType,
      configured: depositConfigured,
    },
    marketDataProvider: {
      status: marketStatus,
      details: marketDetails,
    },
    signerConfiguration: {
      status: signerStatus,
      withdrawalsEnabled: config.withdrawalsEnabled,
    },
  };
}
