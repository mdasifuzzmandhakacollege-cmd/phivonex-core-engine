import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';

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
    nodeBasePriceUsd: 50.0,
    directReferralCommissionRate: 10,
    genesisNodeCap: 1000,
    captchaEnabled: false,
    cryptoDepositsEnabled: true,
    cryptoWithdrawalsEnabled: true,
    internalCoinSwapEnabled: true,
    nodeRewardsEnabled: true,
    systemNotice: null,
    lastUpdated: new Date().toISOString(),
    isConnected: true,
  });

  // REST Snapshot fetch
  const fetchConfigs = useCallback(async () => {
    try {
      const [platformRes, withdrawalRes, networkRes] = await Promise.all([
        fetch('/api/economic/platform-settings').catch(() => null),
        fetch('/api/withdrawals/config').catch(() => null),
        fetch('/api/public/network/summary').catch(() => null),
      ]);

      if (platformRes && platformRes.ok) {
        platformRes.json().then((data) => {
          if (data && data.success && data.settings) {
            const s = data.settings;
            setConfigs((p) => ({
              ...p,
              coinPriceUsdt: typeof s.coinPriceUsdt === 'number' ? s.coinPriceUsdt : p.coinPriceUsdt,
              minWithdrawalAmount: typeof s.minWithdrawalAmount === 'number' ? s.minWithdrawalAmount : p.minWithdrawalAmount,
              autoWithdrawalEnabled: typeof s.autoWithdrawalEnabled === 'boolean' ? s.autoWithdrawalEnabled : p.autoWithdrawalEnabled,
              nodeBasePriceUsd: typeof s.nodeBasePriceUsd === 'number' ? s.nodeBasePriceUsd : p.nodeBasePriceUsd,
              directReferralCommissionRate: typeof s.directReferralCommissionRate === 'number' ? s.directReferralCommissionRate : p.directReferralCommissionRate,
              cryptoDepositsEnabled: typeof s.cryptoDepositsEnabled === 'boolean' ? s.cryptoDepositsEnabled : p.cryptoDepositsEnabled,
              cryptoWithdrawalsEnabled: typeof s.cryptoWithdrawalsEnabled === 'boolean' ? s.cryptoWithdrawalsEnabled : p.cryptoWithdrawalsEnabled,
              internalCoinSwapEnabled: typeof s.internalCoinSwapEnabled === 'boolean' ? s.internalCoinSwapEnabled : p.internalCoinSwapEnabled,
              nodeRewardsEnabled: typeof s.nodeRewardsEnabled === 'boolean' ? s.nodeRewardsEnabled : p.nodeRewardsEnabled,
              lastUpdated: new Date().toISOString(),
            }));
          }
        }).catch(() => {});
      }

      setConfigs((prev) => {
        const next = { ...prev };

        if (withdrawalRes && withdrawalRes.ok) {
          withdrawalRes.json().then((data) => {
            if (typeof data.minWithdrawalAmount === 'number' && data.minWithdrawalAmount !== next.minWithdrawalAmount) {
              setConfigs((p) => ({ ...p, minWithdrawalAmount: data.minWithdrawalAmount }));
            }
          }).catch(() => {});
        }

        if (networkRes && networkRes.ok) {
          networkRes.json().then((data) => {
            if (data) {
              setConfigs((p) => ({
                ...p,
                coinPriceUsdt: typeof data.internalCoinPriceUsdt === 'number' ? data.internalCoinPriceUsdt : p.coinPriceUsdt,
                nodeBasePriceUsd: typeof data.nodeBasePriceUsd === 'number' ? data.nodeBasePriceUsd : p.nodeBasePriceUsd,
                minWithdrawalAmount: typeof data.minWithdrawalAmount === 'number' ? data.minWithdrawalAmount : p.minWithdrawalAmount,
                lastUpdated: new Date().toISOString(),
              }));
            }
          }).catch(() => {});
        }

        return next;
      });
    } catch (err) {
      console.warn('[SystemConfigContext] REST sync error:', err);
    }
  }, []);

  // 1. Subscribe to Firestore Real-Time Settings Snapshots
  useEffect(() => {
    let unsubscribeWithdrawals: () => void = () => {};
    let unsubscribeConfigs: () => void = () => {};
    let unsubscribeEconomic: () => void = () => {};

    try {
      // Document 1: 'withdrawals'
      unsubscribeWithdrawals = onSnapshot(
        doc(db, 'system_settings', 'withdrawals'),
        (snapshot) => {
          if (snapshot.exists()) {
            const data = snapshot.data();
            setConfigs((prev) => ({
              ...prev,
              minWithdrawalAmount: typeof data.minWithdrawalAmount === 'number' ? data.minWithdrawalAmount : prev.minWithdrawalAmount,
              autoWithdrawalEnabled: typeof data.autoWithdrawalEnabled === 'boolean' ? data.autoWithdrawalEnabled : prev.autoWithdrawalEnabled,
              lastUpdated: data.updatedAt || new Date().toISOString(),
              isConnected: true,
            }));
          }
        },
        (err) => {
          // Gracefully fallback to REST endpoints
          fetchConfigs();
        }
      );

      // Document 2: 'configs'
      unsubscribeConfigs = onSnapshot(
        doc(db, 'system_settings', 'configs'),
        (snapshot) => {
          if (snapshot.exists()) {
            const data = snapshot.data();
            setConfigs((prev) => {
              const updated = { ...prev, isConnected: true };
              if (typeof data.MIN_WITHDRAWAL_AMOUNT === 'number') updated.minWithdrawalAmount = data.MIN_WITHDRAWAL_AMOUNT;
              if (typeof data.AUTO_WITHDRAWAL_ENABLED === 'boolean') updated.autoWithdrawalEnabled = data.AUTO_WITHDRAWAL_ENABLED;
              if (typeof data.INTERNAL_COIN_PRICE_USDT === 'number') updated.coinPriceUsdt = data.INTERNAL_COIN_PRICE_USDT;
              if (typeof data.NODE_BASE_PRICE_USD === 'number') updated.nodeBasePriceUsd = data.NODE_BASE_PRICE_USD;
              if (typeof data.DIRECT_REFERRAL_COMMISSION_USD === 'number') updated.directReferralCommissionRate = data.DIRECT_REFERRAL_COMMISSION_USD;
              updated.lastUpdated = data.updatedAt || new Date().toISOString();
              return updated;
            });
          }
        },
        (err) => {
          // Gracefully fallback to REST endpoints
          fetchConfigs();
        }
      );

      // Document 3: 'economic'
      unsubscribeEconomic = onSnapshot(
        doc(db, 'system_settings', 'economic'),
        (snapshot) => {
          if (snapshot.exists()) {
            const data = snapshot.data();
            setConfigs((prev) => {
              const updated = { ...prev, isConnected: true };
              if (typeof data.INTERNAL_COIN_PRICE_USDT === 'number') updated.coinPriceUsdt = data.INTERNAL_COIN_PRICE_USDT;
              if (typeof data.NODE_BASE_PRICE_USD === 'number') updated.nodeBasePriceUsd = data.NODE_BASE_PRICE_USD;
              if (typeof data.GENESIS_NODE_CAP === 'number') updated.genesisNodeCap = data.GENESIS_NODE_CAP;
              updated.lastUpdated = data.updatedAt || new Date().toISOString();
              return updated;
            });
          }
        },
        (err) => {
          // Gracefully fallback to REST endpoints
          fetchConfigs();
        }
      );
    } catch (e) {
      fetchConfigs();
    }

    return () => {
      unsubscribeWithdrawals();
      unsubscribeConfigs();
      unsubscribeEconomic();
    };
  }, []);

  // 2. Connect to Server-Sent Events (SSE) Stream
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
                return prev; // Ignore out-of-order older event
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
              if (key === 'PROMOTIONAL_OFFERS_UPDATED' || key === 'PROMOTIONAL_BANNERS_UPDATED') {
                updated.lastUpdated = new Date().toISOString();
              }
              return updated;
            });
          }
        } catch {
          // ignore parse errors
        }
      });
    } catch (err) {
      console.warn('[SystemConfigContext] SSE connection error:', err);
    }

    return () => {
      if (es) es.close();
    };
  }, []);

  // 3. Fallback fast poll every 4 seconds to guarantee sync
  useEffect(() => {
    fetchConfigs();
    const interval = setInterval(() => {
      fetchConfigs();
    }, 4000);

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
