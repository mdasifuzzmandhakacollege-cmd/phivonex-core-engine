import { v4 as uuidv4 } from 'uuid';

/**
 * Deterministic Testnet User Account Balance Interface
 */
export interface TestnetUserAccount {
  id: string;
  publicId: string;
  email: string;
  fullName: string;
  role: 'USER' | 'ADMIN';
  balances: {
    usdtBalance: number;
    bnbBalance: number;
    phivoBalance: number;
    lockedPhivoBalance: number;
  };
  depositAddresses: {
    bnb: string;
    usdt: string;
  };
  referralCode: string;
  referredByCode?: string;
  createdAt: string;
}

/**
 * Simulated Ledger Transaction Record Interface
 */
export interface SimulatedLedgerRecord {
  id: string;
  publicTxnId: string;
  userId: string;
  entryType: 'CREDIT' | 'DEBIT';
  sourceType: 'USDT_DEPOSIT' | 'BNB_DEPOSIT' | 'NODE_PURCHASE' | 'REFERRAL_COMMISSION' | 'BINARY_MATCHING' | 'NODE_REWARD' | 'COIN_SWAP' | 'WITHDRAWAL_RESERVATION';
  sourceId: string;
  amount: number;
  currency: 'USDT' | 'BNB' | 'PHIVO';
  balanceAfter: number;
  description: string;
  txHash?: string;
  createdAt: string;
}

/**
 * Mocks deterministic testnet user account balances.
 */
export function generateDeterministicTestnetUser(seed = 'E2E-TESTNET-001'): TestnetUserAccount {
  const hashSeed = seed.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const suffix = (1000 + (hashSeed % 8999)).toString();

  return {
    id: `usr-testnet-${suffix}`,
    publicId: `PHX-TEST-${suffix}`,
    email: `testnet.operator.${suffix}@phivonex.network`,
    fullName: `Deterministic Testnet Operator ${suffix}`,
    role: 'USER',
    balances: {
      usdtBalance: 2500.00,
      bnbBalance: 5.75,
      phivoBalance: 12500.00,
      lockedPhivoBalance: 1000.00,
    },
    depositAddresses: {
      bnb: `0x71C${suffix}56EC7ab88b098defB751B7401B5f6d8976F`,
      usdt: `0x71C${suffix}56EC7ab88b098defB751B7401B5f6d8976F`,
    },
    referralCode: `REF-${suffix}`,
    referredByCode: 'GENESIS-REF-001',
    createdAt: new Date(Date.now() - 86400000 * 7).toISOString(),
  };
}

/**
 * Generates simulated ledger transaction records for E2E testing environment.
 */
export function generateMockLedgerTransactions(
  userId = 'usr-testnet-1001',
  count = 6
): SimulatedLedgerRecord[] {
  const baseTime = Date.now() - 86400000 * 3;
  const records: SimulatedLedgerRecord[] = [];

  const templates = [
    {
      entryType: 'CREDIT' as const,
      sourceType: 'USDT_DEPOSIT' as const,
      amount: 1000.0,
      currency: 'USDT' as const,
      balanceAfter: 1000.0,
      description: 'Testnet USDT Deposit confirmed on BNB Smart Chain',
      txHash: '0x8f2d6541a7c38e920d512a819b4cf177263b6528df5289a071f5442654bc6589',
    },
    {
      entryType: 'CREDIT' as const,
      sourceType: 'BNB_DEPOSIT' as const,
      amount: 2.5,
      currency: 'BNB' as const,
      balanceAfter: 2.5,
      description: 'Testnet native BNB Deposit confirmed on BNB Smart Chain',
      txHash: '0x3c9f2148a071f5442654bc65898f2d6541a7c38e920d512a819b4cf177263b65',
    },
    {
      entryType: 'DEBIT' as const,
      sourceType: 'NODE_PURCHASE' as const,
      amount: 1000.0,
      currency: 'USDT' as const,
      balanceAfter: 0.0,
      description: 'Genesis Node Activation payment (Stage 1 Tier)',
      txHash: '0x1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b',
    },
    {
      entryType: 'CREDIT' as const,
      sourceType: 'REFERRAL_COMMISSION' as const,
      amount: 50.0,
      currency: 'USDT' as const,
      balanceAfter: 50.0,
      description: 'Direct referral bonus credited for tier 1 activation',
      txHash: '0x9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b',
    },
    {
      entryType: 'CREDIT' as const,
      sourceType: 'NODE_REWARD' as const,
      amount: 500.0,
      currency: 'PHIVO' as const,
      balanceAfter: 500.0,
      description: 'Genesis Node protocol daily mining reward epoch #42',
      txHash: undefined,
    },
    {
      entryType: 'CREDIT' as const,
      sourceType: 'COIN_SWAP' as const,
      amount: 100.0,
      currency: 'USDT' as const,
      balanceAfter: 150.0,
      description: 'Swapped 1,000 PHIVO tokens to USDT @ $0.10 rate',
      txHash: undefined,
    },
  ];

  for (let i = 0; i < Math.min(count, templates.length); i++) {
    const t = templates[i];
    records.push({
      id: `ledg-test-${i + 1}`,
      publicTxnId: `TXN-TEST-${(100000 + i * 137).toString()}`,
      userId,
      entryType: t.entryType,
      sourceType: t.sourceType,
      sourceId: `src-ref-${100 + i}`,
      amount: t.amount,
      currency: t.currency,
      balanceAfter: t.balanceAfter,
      description: t.description,
      txHash: t.txHash,
      createdAt: new Date(baseTime + i * 14400000).toISOString(),
    });
  }

  return records;
}

/**
 * Creates full mock environment for E2E QA test suites.
 */
export function createFullDeterministicTestnetEnvironment(seed = 'E2E-TESTNET-RUN') {
  const user = generateDeterministicTestnetUser(seed);
  const ledger = generateMockLedgerTransactions(user.id, 6);

  return {
    user,
    ledger,
    nodes: [
      {
        id: `node-test-101`,
        publicNodeId: 'PX-00042',
        ownerUserId: user.id,
        pricingTierUsd: 1000,
        status: 'ACTIVE',
        activatedAt: new Date(Date.now() - 172800000).toISOString(),
      },
    ],
    summaryStats: {
      totalVolumeUsdt: 1000.0,
      totalCommissionsPaidUsdt: 50.0,
      totalPhivoSwapped: 1000.0,
      activeNodesCount: 1,
    },
  };
}
