/**
 * PHIVONEX Server-Side Token & Contract Configuration
 * Task #19.1
 *
 * NOTE: Signing keys and secrets are strictly protected server-side.
 */

export const PHIVONEX_TOKEN_CONFIG = {
  contractAddress: '0x28FCa9DAEA98CBe39df0F09e61Cf4343A5796fd7',
  tokenSymbol: 'PHIVO',
  tokenName: 'PHIVONEX Ecosystem Coin (PHIVO)',
  decimals: 18,
  network: 'BNB Smart Chain (BEP-20)',
  mainnetChainId: 56,
  testnetChainId: 97,
  maxSupply: 100_000_000,
} as const;

export function getTokenContractAddress(): string {
  return PHIVONEX_TOKEN_CONFIG.contractAddress;
}
