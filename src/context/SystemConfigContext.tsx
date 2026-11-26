import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

export interface SystemConfigState {
  minWithdrawalAmount: number;
  maxDailyWithdrawalAmount: number;
  autoWithdrawalEnabled: boolean;
  coinPriceUsdt: number;
  nodeBasePriceUsd: number;
  directReferralCommissionRate: number;
  genesisNodeCap: number;
  captchaEnabled: boolean;
  cryptoDepositsEnabled: boolean;
  cryptoWithdrawalsEnabled: boolean;
  internalCoinSwapEnabled: boolean;
  nodeRewardsEnabled: boolean;
  systemNotice: string | null;
  lastUpdated: string;
  isConnected: boolean;
}

interface SystemConfigContextType extends SystemConfigState {
  refetchConfigs: () => Promise<void>;
}

const SystemConfigContext = createContext<SystemConfigContextType | undefined>(undefined);

export const SystemConfigProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [configs, setConfigs] = useState<SystemConfigState>({
    minWithdrawalAmount: 0.10,
    maxDailyWithdrawalAmount: 10000,
    autoWithdrawalEnabled: false,
    coinPriceUsdt: 0.10,
    nodeBasePriceUsd: 1000.0,
    directReferralCommissionRate: 0,
    genesisNodeCap: 10000,
    captchaEnabled: false,
    cryptoDepositsEnabled: true,
    cryptoWithdrawalsEnabled: true,
    internalCoinSwapEnabled: true,
    nodeRewardsEnabled: true,
    systemNotice: null,
    lastUpdated: new Date().toISOString(),
    isConnected: true,
  });

  // Authoritative PostgreSQL REST snapshot fetch
  const fetchConfigs = useCallback(async () => {
    try {
      const [platformRes, withdrawalRes, networkRes] = await Promise.all([
        fetch('/api/economic/platform-settings', { credentials: 'include' }).catch(() => null),
        fetch('/api/withdrawals/config', { credentials: 'include' }).catch(() => null),
        fetch('/api/public/network/summary', { credentials: 'include' }).catch(() => null),
      ]);

      const platformData = platformRes && platformRes.ok ? await platformRes.json().catch(() => null) : null;
      const withdrawalData = withdrawalRes && withdrawalRes.ok ? await withdrawalRes.json().catch(() => null) : null;
      const networkData = networkRes && networkRes.ok ? await networkRes.json().catch(() => null) : null;

      setConfigs((p) => {
        const next = { ...p, isConnected: true };
        let changed = false;

        if (platformData && platformData.success && platformData.settings) {
          const s = platformData.settings;
          if (typeof s.coinPriceUsdt === 'number' && s.coinPriceUsdt !== next.coinPriceUsdt) {
            next.coinPriceUsdt = s.coinPriceUsdt;
            changed = true;
          }
          if (typeof s.minWithdrawalAmount === 'number' && s.minWithdrawalAmount !== next.minWithdrawalAmount) {
            next.minWithdrawalAmount = s.minWithdrawalAmount;
            changed = true;
          }
          if (typeof s.autoWithdrawalEnabled === 'boolean' && s.autoWithdrawalEnabled !== next.autoWithdrawalEnabled) {
            next.autoWithdrawalEnabled = s.autoWithdrawalEnabled;
            changed = true;
          }
          if (typeof s.nodeBasePriceUsd === 'number' && s.nodeBasePriceUsd !== next.nodeBasePriceUsd) {
            next.nodeBasePriceUsd = s.nodeBasePriceUsd;
            changed = true;
          }
          if (typeof s.directReferralCommissionRate === 'number' && s.directReferralCommissionRate !== next.directReferralCommissionRate) {
            next.directReferralCommissionRate = s.directReferralCommissionRate;
            changed = true;
          }
          if (typeof s.cryptoDepositsEnabled === 'boolean' && s.cryptoDepositsEnabled !== next.cryptoDepositsEnabled) {
            next.cryptoDepositsEnabled = s.cryptoDepositsEnabled;
            changed = true;
          }
          if (typeof s.cryptoWithdrawalsEnabled === 'boolean' && s.cryptoWithdrawalsEnabled !== next.cryptoWithdrawalsEnabled) {
            next.cryptoWithdrawalsEnabled = s.cryptoWithdrawalsEnabled;
            changed = true;
          }
          if (typeof s.internalCoinSwapEnabled === 'boolean' && s.internalCoinSwapEnabled !== next.internalCoinSwapEnabled) {
            next.internalCoinSwapEnabled = s.internalCoinSwapEnabled;
            changed = true;
          }
          if (typeof s.nodeRewardsEnabled === 'boolean' && s.nodeRewardsEnabled !== next.nodeRewardsEnabled) {
            next.nodeRewardsEnabled = s.nodeRewardsEnabled;
            changed = true;
          }
        }

        if (withdrawalData) {
          if (typeof withdrawalData.minWithdrawalAmount === 'number' && withdrawalData.minWithdrawalAmount !== next.minWithdrawalAmount) {
            next.minWithdrawalAmount = withdrawalData.minWithdrawalAmount;
            changed = true;
          }
          if (typeof withdrawalData.autoWithdrawalEnabled === 'boolean' && withdrawalData.autoWithdrawalEnabled !== next.autoWithdrawalEnabled) {
            next.autoWithdrawalEnabled = withdrawalData.autoWithdrawalEnabled;
            changed = true;
          }
        }

        if (networkData) {
          if (typeof networkData.internalCoinPriceUsdt === 'number' && networkData.internalCoinPriceUsdt !== next.coinPriceUsdt) {
            next.coinPriceUsdt = networkData.internalCoinPriceUsdt;
            changed = true;
          }
          if (typeof networkData.nodeBasePriceUsd === 'number' && networkData.nodeBasePriceUsd !== next.nodeBasePriceUsd) {
            next.nodeBasePriceUsd = networkData.nodeBasePriceUsd;
            changed = true;
          }
          if (typeof networkData.minWithdrawalAmount === 'number' && networkData.minWithdrawalAmount !== next.minWithdrawalAmount) {
            next.minWithdrawalAmount = networkData.minWithdrawalAmount;
            changed = true;
          }
        }

        if (!changed) {
          return p;
        }
        next.lastUpdated = new Date().toISOString();
        return next;
      });
    } catch {
      // Silently rely on cached config and retry on next scheduled sync
    }
  }, []);

  // Connect to Server-Sent Events (SSE) Stream with resilient error handling
  useEffect(() => {
    let es: EventSource | null = null;
    try {
      es = new EventSource('/api/public/network/stream');

      es.addEventListener('system_config', (e) => {
        try {
          const payload = JSON.parse(e.data);
          if (payload && payload.key) {
            const key = String(payload.key).toUpperCase();
            const val = payload.value;

            setConfigs((prev) => {
              if (payload.updatedAt && prev.lastUpdated && new Date(payload.updatedAt).getTime() < new Date(prev.lastUpdated).getTime()) {
                return prev;
              }

              const updated = { ...prev, lastUpdated: new Date().toISOString() };
              if (key === 'MIN_WITHDRAWAL_AMOUNT') updated.minWithdrawalAmount = Number(val);
              if (key === 'MAX_DAILY_WITHDRAWAL_AMOUNT') updated.maxDailyWithdrawalAmount = Number(val);
              if (key === 'AUTO_WITHDRAWAL_ENABLED') updated.autoWithdrawalEnabled = Boolean(val);
              if (key === 'GENESIS_NODE_CAP') updated.genesisNodeCap = Number(val);
              if (key === 'INTERNAL_COIN_PRICE_USDT') {
                const price = typeof val === 'object' && val !== null ? val.priceUsdt : Number(val);
                if (typeof price === 'number') updated.coinPriceUsdt = price;
              }
              if (key === 'NODE_BASE_PRICE_USD') updated.nodeBasePriceUsd = Number(val);
              if (key === 'DIRECT_REFERRAL_COMMISSION_USD' || key === 'REFERRAL_COMMISSION_RATE') {
                updated.directReferralCommissionRate = Number(val);
              }
              if (key === 'CRYPTO_DEPOSITS_ENABLED') updated.cryptoDepositsEnabled = Boolean(val);
              if (key === 'CRYPTO_WITHDRAWALS_ENABLED') updated.cryptoWithdrawalsEnabled = Boolean(val);
              if (key === 'INTERNAL_COIN_SWAP_ENABLED') updated.internalCoinSwapEnabled = Boolean(val);
              if (key === 'NODE_REWARDS_ENABLED') updated.nodeRewardsEnabled = Boolean(val);
              if (key === 'SYSTEM_NOTICE') updated.systemNotice = val ? String(val) : null;
              return updated;
            });
          }
        } catch {
          // ignore non-JSON keepalive heartbeats
        }
      });

      es.onerror = () => {
        // Gracefully close on transport interruption; REST polling keeps settings synchronized
        if (es && es.readyState === EventSource.CLOSED) {
          es.close();
        }
      };
    } catch {
      // Fallback cleanly to REST polling
    }

    return () => {
      if (es) es.close();
    };
  }, []);

  // Periodic REST sync when tab is visible
  useEffect(() => {
    fetchConfigs();
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchConfigs();
      }
    }, 60000);

    const handleSync = () => {
      if (document.visibilityState === 'visible') {
        fetchConfigs();
      }
    };
    window.addEventListener('visibilitychange', handleSync);
    window.addEventListener('focus', handleSync);

    return () => {
      clearInterval(interval);
      window.removeEventListener('visibilitychange', handleSync);
      window.removeEventListener('focus', handleSync);
    };
  }, [fetchConfigs]);

  return (
    <SystemConfigContext.Provider value={{ ...configs, refetchConfigs: fetchConfigs }}>
      {children}
    </SystemConfigContext.Provider>
  );
};

export const useSystemConfig = () => {
  const context = useContext(SystemConfigContext);
  if (!context) {
    throw new Error('useSystemConfig must be used within a SystemConfigProvider');
  }
  return context;
};
