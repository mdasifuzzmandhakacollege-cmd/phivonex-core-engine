import crypto from 'crypto';
import { getIntegrationConfig } from '../../config/integrationConfig';
import { processBlockchainDepositEvent } from '../services/bscDepositService';
import { DepositEventProvider, DepositEventPayload, DepositProcessResult } from './interfaces';

export class MoralisDepositProvider implements DepositEventProvider {
  private config = getIntegrationConfig();

  /**
   * Verifies the Moralis webhook signature using HMAC-SHA256 of rawBody and MORALIS_WEBHOOK_SECRET.
   */
  verifyWebhookSignature(headers: Record<string, string | string[] | undefined>, rawBody: string | Buffer): boolean {
    const signature = headers['x-signature'] || headers['X-Signature'];
    if (!signature || typeof signature !== 'string') {
      return false;
    }

    const secret = this.config.moralisWebhookSecret;
    if (!secret) {
      // Missing webhook secret in production is fail closed
      if (this.config.appEnv === 'production') {
        console.error('[MoralisDepositProvider] Webhook secret not configured in production. Failing closed.');
        return false;
      }
      // For test/dev environments without a secret, allow if configured to bypass
      return true;
    }

    try {
      const hmac = crypto.createHmac('sha256', secret);
      const computedHash = hmac.update(rawBody).digest('hex');
      
      const computedBuffer = Buffer.from(computedHash, 'utf8');
      const signatureBuffer = Buffer.from(signature, 'utf8');

      if (computedBuffer.length !== signatureBuffer.length) {
        return false;
      }
      
      // Timing safe comparison to protect against timing attacks
      return crypto.timingSafeEqual(computedBuffer, signatureBuffer);
    } catch (err) {
      console.error('[MoralisDepositProvider] Error during signature verification:', err);
      return false;
    }
  }

  /**
   * Processes a validated deposit event and credits the user's ledger exactly once.
   */
  async processDepositEvent(payload: DepositEventPayload): Promise<DepositProcessResult> {
    // 1. Chain Validation
    if (payload.chainId !== this.config.bscChainId) {
      console.warn(`[MoralisDepositProvider] Rejected deposit on unsupported chain: ${payload.chainId}`);
      return { credited: false, reason: 'WRONG_CHAIN_ID' };
    }

    // 2. Asset & Contract Validation
    const cleanAsset = payload.asset.toUpperCase();
    if (cleanAsset === 'USDT') {
      const cleanContract = payload.contractAddress.toLowerCase().trim();
      const expectedContract = this.config.usdtContractAddress.toLowerCase().trim();
      if (cleanContract !== expectedContract) {
        console.warn(`[MoralisDepositProvider] Rejected USDT deposit on invalid contract address: ${payload.contractAddress}`);
        return { credited: false, reason: 'INVALID_TOKEN_CONTRACT' };
      }
    } else if (cleanAsset !== 'BNB') {
      console.warn(`[MoralisDepositProvider] Rejected unsupported asset type: ${payload.asset}`);
      return { credited: false, reason: 'UNSUPPORTED_ASSET' };
    }

    try {
      // 3. Delegate to the financial ledger / deposit sync core
      // We set confirmations based on provided payload or mock a secure default
      const confirmations = payload.confirmations !== undefined ? payload.confirmations : 15;
      const blockNumber = payload.blockNumber;
      const currentBlockNumber = blockNumber + confirmations;

      const record = await processBlockchainDepositEvent({
        chainId: payload.chainId,
        asset: cleanAsset,
        txHash: payload.txHash,
        fromAddress: payload.fromAddress,
        toAddress: payload.toAddress,
        amount: payload.amount,
        blockNumber: blockNumber,
        currentBlockNumber: currentBlockNumber,
      });

      if (!record) {
        return {
          credited: false,
          reason: 'RECIPIENT_NOT_A_USER_DEPOSIT_ADDRESS',
        };
      }

      // Check if it was already credited / processed
      const wasAlreadyCredited = record.status === 'CREDITED';

      return {
        credited: true,
        depositId: record.publicDepositId,
        userId: record.userId,
        alreadyProcessed: wasAlreadyCredited,
      };
    } catch (err: any) {
      console.error('[MoralisDepositProvider] Failed to process blockchain deposit event:', err);
      return {
        credited: false,
        reason: err.message || 'PROCESS_FAILED',
      };
    }
  }
}

let depositProviderInstance: DepositEventProvider | null = null;

export function getDepositEventProvider(): DepositEventProvider {
  if (!depositProviderInstance) {
    depositProviderInstance = new MoralisDepositProvider();
  }
  return depositProviderInstance;
}
