import { ethers } from 'ethers';
import { getIntegrationConfig } from '../../config/integrationConfig';
import { WithdrawalSignerProvider, WithdrawalSignParams, WithdrawalSignResult } from './interfaces';

export class SimpleWithdrawalSignerProvider implements WithdrawalSignerProvider {
  private config = getIntegrationConfig();
  private lastNonce = -1;
  private nonceLock = Promise.resolve();

  /**
   * Returns whether withdrawals are globally enabled in this environment.
   */
  isWithdrawalEnabled(): boolean {
    // Defaults strictly to false in production unless explicitly configured
    return this.config.withdrawalsEnabled;
  }

  /**
   * Serialized sign and broadcast logic with a nonce queue lock.
   */
  async signAndBroadcastWithdrawal(params: WithdrawalSignParams): Promise<WithdrawalSignResult> {
    // 1. Withdrawal Switch Check
    if (!this.isWithdrawalEnabled() && this.config.appEnv !== 'test') {
      throw new Error('WITHDRAWALS_DISABLED: Outbound blockchain withdrawals are strictly disabled in this environment.');
    }

    // 2. Load and validate server-side secret reference
    const secretRef = this.config.signerSecretReference;
    if (!secretRef) {
      throw new Error('UNCONFIGURED_SIGNER_SECRET: Signer private key reference is unconfigured. Failing closed.');
    }

    // Never log raw private keys or display them in exceptions
    if (secretRef.startsWith('0x') && secretRef.length === 66 && this.config.appEnv === 'production') {
      throw new Error('SECURITY_VIOLATION: Raw private keys must not be hardcoded in environment variables. Use a secure vaults reference.');
    }

    // 3. Chain ID Validation
    const chainId = this.config.bscChainId;
    if (chainId !== 56 && chainId !== 97 && this.config.appEnv === 'production') {
      throw new Error(`INVALID_CHAIN_ID: Outbound blockchain transactions are only permitted on BNB Smart Chain (56/97). Chain: ${chainId}`);
    }

    // 4. Thread-Safe Serialized Execution Queue using the Nonce Lock
    return new Promise<WithdrawalSignResult>((resolve, reject) => {
      this.nonceLock = this.nonceLock
        .then(async () => {
          try {
            // Mock mode for Task #23.2 test mode & development environments
            const isMockMode = this.config.appEnv === 'test' || !this.config.withdrawalsEnabled;

            if (isMockMode) {
              const mockHash = `0xmock_tx_${params.withdrawalPublicId.toLowerCase()}_${Date.now()}`;
              this.lastNonce++;
              
              resolve({
                txHash: mockHash,
                nonce: this.lastNonce,
                fromAddress: '0xmock_treasury_wallet_signer_address',
                destination: params.destinationAddress,
                amountBnb: params.amountBnb,
                status: 'BROADCASTED',
                isMock: true,
              });
              return;
            }

            // Real-world signing logic (Unreachable unless withdrawals are explicitly enabled)
            const provider = new ethers.JsonRpcProvider(this.config.bscRpcUrlPrimary);
            
            // In a real production vault, we would resolve secretRef through Secret Manager
            // (e.g. Google Secret Manager) instead of using raw keys.
            const wallet = new ethers.Wallet(secretRef, provider);
            
            const currentNonce = await wallet.getNonce();
            const tx = await wallet.sendTransaction({
              to: params.destinationAddress,
              value: ethers.parseEther(params.amountBnb.toString()),
              nonce: currentNonce,
              gasLimit: params.gasLimit || 21000n,
            });

            resolve({
              txHash: tx.hash,
              nonce: currentNonce,
              fromAddress: wallet.address,
              destination: params.destinationAddress,
              amountBnb: params.amountBnb,
              status: 'BROADCASTED',
              isMock: false,
            });
          } catch (err: any) {
            reject(new Error(`WITHDRAWAL_SIGN_FAILED: ${err.message || err}`));
          }
        })
        .catch((err) => {
          reject(err);
        });
    });
  }
}

let signerProviderInstance: WithdrawalSignerProvider | null = null;

export function getWithdrawalSignerProvider(): WithdrawalSignerProvider {
  if (!signerProviderInstance) {
    signerProviderInstance = new SimpleWithdrawalSignerProvider();
  }
  return signerProviderInstance;
}
