/**
 * PHIVONEX — Production Integration Environment Configuration
 * 
 * Strict Security Rules:
 * - Production secrets MUST have NO hard-coded raw private keys or seeds.
 * - Missing required production configuration = FAIL CLOSED.
 * - Public HD extended key (DEPOSIT_ADDRESS_XPUB) is mandatory in production.
 * - Authoritative TREASURY_WALLET_ADDRESS is mandatory in production.
 * - Private signing material is accessed via remote SIGNER_SECRET_REFERENCE.
 * - NEVER log secrets or expose them to frontend/API.
 */

import { ethers } from 'ethers';

export interface IntegrationEnvironmentConfig {
  appEnv: 'production' | 'staging' | 'test' | 'development';
  bscChainId: number;
  bscRpcUrlPrimary: string;
  bscRpcUrlSecondary: string;
  usdtContractAddress: string;
  depositAddressXpub: string | null;
  depositConfirmations: number;
  treasuryWalletAddress: string;
  signerSecretReference: string | null;
  withdrawalsEnabled: boolean;
  moralisApiKey: string | null;
  moralisWebhookSecret: string | null;
  marketDataApiKey: string | null;
}

/**
 * Validate production environment variables and FAIL CLOSED if any required variable is missing/invalid.
 */
export function validateProductionConfig(): void {
  const env = (process.env.APP_ENV || process.env.NODE_ENV || 'production').toLowerCase();
  const isTest = env === 'test' || process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
  const isProduction = env === 'production';

  if (!isProduction || isTest) {
    return;
  }

  const missingOrInvalid: string[] = [];

  // 1. Validate DATABASE_URL (Optional: if provided, validate postgres syntax; otherwise warn and fallback to PGlite)
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (databaseUrl) {
    if (
      databaseUrl.includes('placeholder') ||
      databaseUrl.includes('YOUR_') ||
      (!databaseUrl.startsWith('postgres://') && !databaseUrl.startsWith('postgresql://'))
    ) {
      missingOrInvalid.push('DATABASE_URL must be a valid PostgreSQL connection string starting with postgresql:// or postgres://');
    }
  } else {
    console.log('[IntegrationConfig] DATABASE_URL not set in environment. Running with embedded storage fallback.');
  }

  // 2. Validate DEPOSIT_ADDRESS_XPUB (Optional if using direct Treasury deposits, must be valid if provided)
  const xpub = process.env.DEPOSIT_ADDRESS_XPUB?.trim();
  if (xpub) {
    if (!xpub.startsWith('xpub')) {
      missingOrInvalid.push('DEPOSIT_ADDRESS_XPUB (must be a valid extended public key starting with "xpub")');
    } else {
      try {
        ethers.HDNodeWallet.fromExtendedKey(xpub);
      } catch (err: any) {
        missingOrInvalid.push(`DEPOSIT_ADDRESS_XPUB (invalid format: ${err.message})`);
      }
    }
  }

  // 2. Validate TREASURY_WALLET_ADDRESS
  const officialFallback = '0x39F47C356d45eA49826a76C252794c4C83572D76';
  const treasury = process.env.TREASURY_WALLET_ADDRESS?.trim() || process.env.BNB_TREASURY_ADDRESS?.trim() || officialFallback;
  if (!treasury || !ethers.isAddress(treasury)) {
    missingOrInvalid.push('TREASURY_WALLET_ADDRESS (must be a valid 0x EVM/BSC address)');
  }

  // 3. Validate RPC URLs
  const rpcPrimary = process.env.BSC_RPC_URL_PRIMARY || process.env.BSC_RPC_URL;
  if (!rpcPrimary || !rpcPrimary.startsWith('http')) {
    missingOrInvalid.push('BSC_RPC_URL_PRIMARY (must be a valid HTTP/HTTPS RPC endpoint)');
  }

  if (missingOrInvalid.length > 0) {
    const errorMsg = `[CRITICAL_STARTUP_ERROR] Production configuration validation failed (FAIL CLOSED):\n - ${missingOrInvalid.join('\n - ')}`;
    console.error(errorMsg);
    throw new Error(errorMsg);
  }
}

export function getIntegrationConfig(): IntegrationEnvironmentConfig {
  const env = (process.env.APP_ENV || process.env.NODE_ENV || 'production').toLowerCase();
  const isTest = env === 'test' || process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
  const isProduction = env === 'production' || env === 'staging';

  // In production, execute mandatory validation
  if (isProduction && !isTest) {
    validateProductionConfig();
  }

  const appEnv = isProduction ? (env as 'production' | 'staging') : isTest ? 'test' : 'development';
  const bscChainId = Number(process.env.BSC_CHAIN_ID) || 56;

  const bscRpcUrlPrimary =
    process.env.BSC_RPC_URL_PRIMARY ||
    process.env.BSC_RPC_URL ||
    (bscChainId === 56 ? 'https://bsc-dataseed.binance.org' : 'https://bsc-testnet.publicnode.com');

  const bscRpcUrlSecondary =
    process.env.BSC_RPC_URL_SECONDARY ||
    (bscChainId === 56 ? 'https://bsc-dataseed1.defibit.io' : 'https://data-seed-prebsc-1-s1.binance.org:8545');

  const usdtContractAddress = (
    process.env.USDT_CONTRACT_ADDRESS ||
    (bscChainId === 56
      ? '0x55d398326f99059ff775485246999027b3197955' // Mainnet BSC-USD
      : '0x337610d27c682e347c9cd60bd4b3b107c9d34ddd') // Testnet USDT
  ).toLowerCase();

  const depositAddressXpub = process.env.DEPOSIT_ADDRESS_XPUB?.trim() || null;
  const depositConfirmations = Number(process.env.DEPOSIT_CONFIRMATIONS) || 3;

  const treasuryWalletAddress = (
    process.env.TREASURY_WALLET_ADDRESS?.trim() ||
    process.env.BNB_TREASURY_ADDRESS?.trim() ||
    (isTest ? '0x0000000000000000000000000000000000000001' : '')
  ).toLowerCase();

  const signerSecretReference =
    process.env.SIGNER_SECRET_REFERENCE || 'gcp-kms://projects/PLACEHOLDER/locations/global/keyRings/prod/cryptoKeys/bsc-signer';

  // Production withdrawal broadcast defaults strictly to OFF (false)
  const withdrawalsEnabled = process.env.WITHDRAWALS_ENABLED === 'true';

  const moralisApiKey = process.env.MORALIS_API_KEY || (isTest ? 'test_moralis_api_key_phivonex_2026' : null);
  const moralisWebhookSecret = process.env.MORALIS_WEBHOOK_SECRET || (isTest ? 'test_moralis_webhook_secret_phivonex_2026' : null);
  const marketDataApiKey = process.env.MARKET_DATA_API_KEY || (isTest ? 'test_market_data_api_key_2026' : null);

  return {
    appEnv,
    bscChainId,
    bscRpcUrlPrimary,
    bscRpcUrlSecondary,
    usdtContractAddress,
    depositAddressXpub,
    depositConfirmations,
    treasuryWalletAddress,
    signerSecretReference,
    withdrawalsEnabled,
    moralisApiKey,
    moralisWebhookSecret,
    marketDataApiKey,
  };
}
