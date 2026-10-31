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

      const platformData = platformRes && platformRes.ok ? await platformRes.json().catch(() => null) : null;
      const withdrawalData = withdrawalRes && withdrawalRes.ok ? await withdrawalRes.json().catch(() => null) : null;
      const networkData = networkRes && networkRes.ok ? await networkRes.json().catch(() => null) : null;

      setConfigs((p) => {
        let next = { ...p };
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

        if (withdrawalData && typeof withdrawalData.minWithdrawalAmount === 'number' && withdrawalData.minWithdrawalAmount !== next.minWithdrawalAmount) {
          next.minWithdrawalAmount = withdrawalData.minWithdrawalAmount;
          changed = true;
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

  // 3. Fallback poll every 60 seconds when tab is visible (SSE + Firestore handle real-time push)
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
