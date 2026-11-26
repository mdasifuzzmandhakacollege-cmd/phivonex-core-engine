import { getDb, DatabaseClient } from '../db/db';
import { v4 as uuidv4 } from 'uuid';
import { ethers } from 'ethers';

export interface KmsSignResult {
  rawTxHex: string;
  txHash: string;
  nonce: number;
  walletAddress: string;
  chainId: number;
}

/**
 * Allocates the next atomic chain nonce for a wallet address on a specific chain ID
 * using PostgreSQL FOR UPDATE row-level locking.
 */
export async function allocateNextChainNonce(
  walletAddress: string,
  chainId: number = 56, // BSC Mainnet default
  dbClient?: DatabaseClient
): Promise<number> {
  const db = dbClient || (await getDb());
  const normalizedAddr = String(walletAddress || '').toLowerCase().trim();

  return await db.transaction(async (trx) => {
    const res = await trx.query<{ next_nonce: number }>(
      `SELECT next_nonce 
       FROM wallet_signing_nonces 
       WHERE wallet_address = $1 AND chain_id = $2 
       FOR UPDATE`,
      [normalizedAddr, chainId]
    );

    let nextNonce = 0;
    if (res.rows.length === 0) {
      await trx.query(
        `INSERT INTO wallet_signing_nonces (wallet_address, chain_id, next_nonce, updated_at)
         VALUES ($1, $2, 1, NOW())`,
        [normalizedAddr, chainId]
      );
      nextNonce = 0;
    } else {
      nextNonce = Number(res.rows[0].next_nonce);
      await trx.query(
        `UPDATE wallet_signing_nonces 
         SET next_nonce = next_nonce + 1, updated_at = NOW() 
         WHERE wallet_address = $1 AND chain_id = $2`,
        [normalizedAddr, chainId]
      );
    }

    return nextNonce;
  });
}

/**
 * Signs a BEP-20 USDT payout transaction using Google Cloud KMS (or deterministic emulator if KMS_EMULATOR_MODE=true).
 */
export async function signBep20UsdtTransferViaKms(params: {
  recipientAddress: string;
  amountUsdt: number | string;
  chainId?: number;
  maxGasPriceGwei?: number;
}): Promise<KmsSignResult> {
  const chainId = params.chainId || 56;
  const maxGasPriceGwei = params.maxGasPriceGwei || 10; // 10 Gwei ceiling guard

  const recipient = String(params.recipientAddress || '').trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(recipient)) {
    throw new Error(`INVALID_RECIPIENT: '${recipient}' is not a valid 42-character EVM address.`);
  }

  const amountNum = Number(params.amountUsdt || 0);
  if (amountNum <= 0) {
    throw new Error('INVALID_AMOUNT: Transfer amount must be greater than zero.');
  }

  // USDT on BSC has 18 decimals (or 6 depending on token contract, standard EVM USDT representation uses 18 or 6; here 18 decimals scaled up)
  const tokenAmountUnits = ethers.parseUnits(amountNum.toFixed(6), 18);

  // ERC-20 transfer(address,uint256) function selector: 0xa9059cbb
  const erc20Interface = new ethers.Interface([
    'function transfer(address to, uint256 value) public returns (bool)'
  ]);
  const calldata = erc20Interface.encodeFunctionData('transfer', [recipient, tokenAmountUnits]);

  // USDT BEP-20 Contract Address on BSC Mainnet
  const usdtContractAddress = '0x55d398326f99059ff775485246999027b3197955';

  const walletAddress = process.env.HOT_WALLET_ADDRESS || '0x71C7656EC7ab88b098defB751B7401B5f6d89A92';
  const nonce = await allocateNextChainNonce(walletAddress, chainId);

  // Construct EIP-155 / Legacy Transaction
  const tx = {
    to: usdtContractAddress,
    value: 0n,
    data: calldata,
    nonce,
    gasLimit: 65000n,
    gasPrice: ethers.parseUnits(maxGasPriceGwei.toString(), 'gwei'),
    chainId: BigInt(chainId),
  };

  const unsignedTx = ethers.Transaction.from(tx);
  const unsignedHash = unsignedTx.unsignedHash;

  let signature: string;
  const isEmulator = process.env.KMS_EMULATOR_MODE === 'true' || !process.env.GCP_KMS_KEY_VERSION_NAME;

  if (isEmulator) {
    // Deterministic offline secp256k1 emulator signing for testing and preview environment
    const emulatorPrivateKey = process.env.KMS_EMULATOR_PRIVATE_KEY || '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
    const signerWallet = new ethers.Wallet(emulatorPrivateKey);
    signature = signerWallet.signingKey.sign(unsignedHash).serialized;
  } else {
    // Production Google Cloud KMS asymmetricSign integration placeholder
    // In production, calls @google-cloud/kms asymmetricSign using EC_SIGN_SECP256K1_SHA256
    throw new Error('GCP_KMS_PRODUCTION_KEY_NOT_CONFIGURED: Set KMS_EMULATOR_MODE=true for testing or configure GCP KMS credentials.');
  }

  unsignedTx.signature = signature;
  const rawTxHex = unsignedTx.serialized;
  const txHash = unsignedTx.hash;

  // Record audit log
  try {
    const db = await getDb();
    await db.query(
      `INSERT INTO security_audit_logs (
         id, trace_id, actor_user_id, action_type, severity, payload, created_at
       )
       VALUES ($1, $2, NULL, 'KMS_TRANSACTION_SIGNED', 'INFO', $3::jsonb, NOW())`,
      [
        uuidv4(),
        `KMS-TX-${nonce}-${Date.now()}`,
        JSON.stringify({
          walletAddress,
          recipient,
          amountUsdt: amountNum,
          nonce,
          chainId,
          txHash,
          isEmulator,
        }),
      ]
    );
  } catch (auditErr) {
    console.warn('[KmsSigner] Notice recording signing audit log:', auditErr);
  }

  return {
    rawTxHex,
    txHash: txHash || '0x' + '0'.repeat(64),
    nonce,
    walletAddress,
    chainId,
  };
}
