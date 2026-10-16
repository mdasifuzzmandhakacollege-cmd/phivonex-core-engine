import { ethers } from 'ethers';
import { BSC_CONFIG } from '../../config/bscConfig';
import { getDb } from '../db/db';
import { v4 as uuidv4 } from 'uuid';

export interface UserDepositAddressRecord {
  id: string;
  userId: string;
  chainId: number;
  asset: string;
  address: string;
  derivationIndex: number;
  derivationReference: string;
  createdAt: string;
}

export async function getOrCreateUserDepositAddress(
  userId: string,
  requestedAsset: string = 'USDT'
): Promise<UserDepositAddressRecord> {
  const db = await getDb();
  const assetName = requestedAsset.toUpperCase() === 'BNB' ? 'BNB' : 'USDT';
  const chainId = BSC_CONFIG.CHAIN_ID;

  // 1. Check if already exists in DB
  const existing = await db.query<any>(
    `SELECT * FROM user_deposit_addresses WHERE user_id = $1 AND chain_id = $2 AND asset = $3`,
    [userId, chainId, assetName]
  );

  if (existing.rows.length > 0) {
    const row = existing.rows[0];
    return {
      id: row.id,
      userId: row.user_id,
      chainId: row.chain_id,
      asset: row.asset,
      address: row.address,
      derivationIndex: row.derivation_index,
      derivationReference: row.derivation_reference,
      createdAt: new Date(row.created_at).toISOString(),
    };
  }

  // 2. Generate or assign deposit address for this user
  const xpub = getDepositAddressXpub();
  let address: string;
  let derivationIndex = 0;
  let derivationReference: string;

  if (xpub && xpub.startsWith('xpub')) {
    const countRes = await db.query<{ cnt: string | number }>(
      `SELECT COUNT(*) AS cnt FROM user_deposit_addresses WHERE chain_id = $1`,
      [chainId]
    );
    derivationIndex = Number(countRes.rows[0]?.cnt || 0) + 1;
    const derived = deriveAddressFromXpub(xpub, derivationIndex);
    address = derived.address;
    derivationReference = derived.derivationReference;
  } else {
    // Official Centralized Treasury Deposit Address (PF-03 architecture)
    address = ethers.getAddress(BSC_CONFIG.TREASURY_WALLET_ADDRESS);
    derivationReference = 'direct-treasury';
    derivationIndex = 0;
  }

  const id = uuidv4();

  await db.query(
    `
    INSERT INTO user_deposit_addresses (
      id, user_id, chain_id, asset, address, derivation_index, derivation_reference, created_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
    ON CONFLICT (user_id, chain_id, asset) DO UPDATE SET
      address = EXCLUDED.address,
      derivation_reference = EXCLUDED.derivation_reference,
      derivation_index = EXCLUDED.derivation_index
    `,
    [id, userId, chainId, assetName, address, derivationIndex, derivationReference]
  );

  // Re-fetch in case of concurrent insert
  const finalRes = await db.query<any>(
    `SELECT * FROM user_deposit_addresses WHERE user_id = $1 AND chain_id = $2 AND asset = $3`,
    [userId, chainId, assetName]
  );

  const row = finalRes.rows[0];
  return {
    id: row.id,
    userId: row.user_id,
    chainId: row.chain_id,
    asset: row.asset,
    address: row.address,
    derivationIndex: row.derivation_index,
    derivationReference: row.derivation_reference,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export function getDepositAddressXpub(): string {
  return (process.env.DEPOSIT_ADDRESS_XPUB || '').trim();
}

export function deriveAddressFromXpub(xpub: string, index: number) {
  if (!xpub || !xpub.startsWith('xpub')) {
    throw new Error('INVALID_XPUB: A valid public extended key (xpub) is required.');
  }
  if (typeof index !== 'number' || index < 0) {
    throw new Error('INVALID_INDEX: Derivation index must be a non-negative integer.');
  }
  const root = ethers.HDNodeWallet.fromExtendedKey(xpub);
  const child = root.deriveChild(index);
  return { address: ethers.getAddress(child.address), derivationReference: `m/44'/60'/0'/0/${index}` };
}

export function deriveUserBnbAddress(userIdOrIndex: any, _xpub?: string) {
  const entropy = ethers.keccak256(ethers.toUtf8Bytes(`user-bnb-${userIdOrIndex}`));
  const wallet = new ethers.Wallet(entropy);
  return { address: ethers.getAddress(wallet.address), derivationReference: 'derived-address' };
}

export async function findUserByDepositAddress(address: string, chainId?: number): Promise<string | null> {
  const db = await getDb();
  const targetChainId = chainId || BSC_CONFIG.CHAIN_ID;
  const checksumAddress = ethers.isAddress(address) ? ethers.getAddress(address) : address;

  const res = await db.query<{ user_id: string }>(
    `SELECT user_id FROM user_deposit_addresses WHERE address = $1 AND chain_id = $2`,
    [checksumAddress, targetChainId]
  );

  if (res.rows.length > 0) {
    return res.rows[0].user_id;
  }
  return null;
}
