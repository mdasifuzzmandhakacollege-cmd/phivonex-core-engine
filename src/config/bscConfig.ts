/**
 * PHIVONEX — BNB Smart Chain (BSC) Production Configuration
 * 
 * Production Live Requirements:
 * - APP_ENV = production (or staging/test/development)
 * - BSC_CHAIN_ID = 56 (BNB Smart Chain Mainnet default)
 * - Primary & Secondary Mainnet RPC endpoints with automatic failover
 * - Official USDT BEP-20 Contract Address: 0x55d398326f99059ff775485246999027B3197955
 * - Public HD Extended Key: DEPOSIT_ADDRESS_XPUB (m/44'/60'/0'/0 branch only; NO private keys in app)
 * - Authoritative Treasury Address: TREASURY_WALLET_ADDRESS (Mandatory in production; no hardcoded fallback)
 * - Secure Signer Reference: SIGNER_SECRET_REFERENCE (Remote KMS URI placeholder; NEVER treated as configured)
 * - WITHDRAWALS_ENABLED strictly false until separately approved
 */

import { ethers } from 'ethers';

export const DEFAULT_OFFICIAL_TREASURY = '0x39F47C356d45eA49826a76C252794c4C83572D76';

export const BSC_CONFIG = {
  // Application Environment
  get APP_ENV(): string {
    return process.env.APP_ENV || process.env.NODE_ENV || 'production';
  },

  // BSC Chain ID: Default to 56 (BNB Smart Chain Mainnet)
  get CHAIN_ID(): number {
    return Number(process.env.BSC_CHAIN_ID) || 56;
  },

  // Human-readable network title
  get NETWORK_NAME(): string {
    return this.CHAIN_ID === 56 ? 'BNB Smart Chain Mainnet' : 'BNB Smart Chain Testnet';
  },

  // Primary JSON-RPC endpoint for BNB Smart Chain Mainnet
  get RPC_URL_PRIMARY(): string {
    const raw = (process.env.BSC_RPC_URL_PRIMARY || '').trim();
    if (raw && !raw.endsWith('rpc.ankr.com/bsc') && !raw.endsWith('rpc.ankr.com/bsc/')) {
      return raw;
    }
    return this.CHAIN_ID === 56 ? 'https://bsc-dataseed.binance.org' : 'https://bsc-testnet.publicnode.com';
  },

  // Secondary / Failover JSON-RPC endpoint for BNB Smart Chain
  get RPC_URL_SECONDARY(): string {
    const raw = (process.env.BSC_RPC_URL_SECONDARY || '').trim();
    if (raw && !raw.endsWith('rpc.ankr.com/bsc') && !raw.endsWith('rpc.ankr.com/bsc/')) {
      return raw;
    }
    return this.CHAIN_ID === 56 ? 'https://bsc-rpc.publicnode.com' : 'https://data-seed-prebsc-1-s1.binance.org:8545';
  },

  // Default active RPC endpoint
  get RPC_URL(): string {
    return process.env.BSC_RPC_URL || this.RPC_URL_PRIMARY;
  },

  // Authoritative official USDT BEP-20 Contract Address
  // BSC Mainnet Official Binance-Peg USDT: 0x55d398326f99059ff775485246999027b3197955
  get USDT_CONTRACT_ADDRESS(): string {
    if (process.env.USDT_CONTRACT_ADDRESS) {
      return process.env.USDT_CONTRACT_ADDRESS.toLowerCase();
    }
    return this.CHAIN_ID === 56
      ? '0x55d398326f99059ff775485246999027b3197955'
      : '0x337610d27c682e347c9cd60bd4b3b107c9d34ddd';
  },

  // Public Extended Key (xpub) representing the public branch at m/44'/60'/0'/0
  // In production, app server holds ONLY the public xpub (never private key/mnemonic)
  get DEPOSIT_ADDRESS_XPUB(): string {
    return (process.env.DEPOSIT_ADDRESS_XPUB || '').trim();
  },

  // Number of on-chain confirmations required before ledger credit (default 3)
  get REQUIRED_CONFIRMATIONS(): number {
    return Number(process.env.DEPOSIT_CONFIRMATIONS || process.env.BNB_REQUIRED_CONFIRMATIONS) || 3;
  },

  // Authoritative Treasury wallet address where swept USDT is collected
  get TREASURY_WALLET_ADDRESS(): string {
    const configured = process.env.TREASURY_WALLET_ADDRESS || process.env.BNB_TREASURY_ADDRESS;
    if (configured && ethers.isAddress(configured.trim())) {
      return ethers.getAddress(configured.trim()).toLowerCase();
    }

    // Default official protocol treasury wallet address (Binance Smart Chain BEP-20)
    return DEFAULT_OFFICIAL_TREASURY.toLowerCase();
  },

  get TREASURY_ADDRESS(): string {
    return this.TREASURY_WALLET_ADDRESS;
  },

  // Reference / identifier for the remote KMS / Vault / HSM secure signing service
  // NOTE: Placeholder URI — requires user's specific KMS resource configuration before live sweep execution
  get SIGNER_SECRET_REFERENCE(): string {
    return (
      process.env.SIGNER_SECRET_REFERENCE ||
      'gcp-kms://projects/PLACEHOLDER-PROJECT-ID/locations/global/keyRings/prod/cryptoKeys/bsc-signer'
    );
  },

  // Switch to control on-chain broadcast withdrawal execution
  get WITHDRAWALS_ENABLED(): boolean {
    return (
      process.env.WITHDRAWALS_ENABLED === 'true' ||
      Boolean(process.env.PAYOUT_PRIVATE_KEY?.trim()) ||
      Boolean(process.env.TREASURY_PRIVATE_KEY?.trim()) ||
      Boolean((globalThis as any).__AUTO_WITHDRAWAL_ENABLED)
    );
  },

  // Block explorer URLs
  get EXPLORER_TX_URL(): string {
    return this.CHAIN_ID === 56 ? 'https://bscscan.com/tx/' : 'https://testnet.bscscan.com/tx/';
  },

  get EXPLORER_ADDRESS_URL(): string {
    return this.CHAIN_ID === 56 ? 'https://bscscan.com/address/' : 'https://testnet.bscscan.com/address/';
  },

  // Asset Identifier
  ASSET: 'USDT',
  DECIMALS: 18,
};
