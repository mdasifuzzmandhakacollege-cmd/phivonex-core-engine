import React, { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw,
  Clock,
  ArrowRight,
  ShieldCheck,
  Coins,
  Repeat,
  Info,
} from 'lucide-react';
import { PhivoCoinIcon } from '../brand/CryptoIcons';
import { useSystemConfig } from '../../context/SystemConfigContext';

export interface TokenPricePoint {
  timestamp: string;
  timeLabel: string;
  price: number;
}

export interface TokenPriceTrendData {
  tokenSymbol: string;
  tokenName: string;
  currentPrice: number;
  updatedAt: string;
}

interface TokenPriceTrendChartProps {
  onNavigateTab?: (tab: string) => void;
  className?: string;
  compact?: boolean;
}

/**
 * PhivoEcosystemRateCard (formerly TokenPriceTrendChart)
 * 
 * Calm, institutional reference-rate presentation for PHIVO.
 * Reflects protocol-governed internal benchmark pricing against USDT,
 * avoiding misleading pseudo-market trading charts, tickers, or fake orderbook metrics.
 */
export const TokenPriceTrendChart: React.FC<TokenPriceTrendChartProps> = ({
  onNavigateTab,
  className = '',
}) => {
  const { coinPriceUsdt, lastUpdated } = useSystemConfig();
  const [currentRate, setCurrentRate] = useState<number>(coinPriceUsdt || 0.1);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [syncTime, setSyncTime] = useState<string>('');
  const [userPhivoBalance, setUserPhivoBalance] = useState<number>(0);

  // Sync rate live from system config
  useEffect(() => {
    if (typeof coinPriceUsdt === 'number' && coinPriceUsdt > 0) {
      setCurrentRate(coinPriceUsdt);
    }
  }, [coinPriceUsdt]);

  // Fetch current user PHIVO balance from authoritative wallet summary
  const fetchWalletRateData = useCallback(async (isManual = false) => {
    if (isManual) setIsRefreshing(true);
    try {
      const [walletRes, econRes] = await Promise.all([
        fetch('/api/wallet/me', { credentials: 'include' }).catch(() => null),
        fetch('/api/economic/public').catch(() => null),
      ]);

      if (walletRes && walletRes.ok) {
        const wData = await walletRes.json();
        if (typeof wData.phivoBalance === 'number') {
          setUserPhivoBalance(wData.phivoBalance);
        }
      }

      if (econRes && econRes.ok) {
        const eData = await econRes.json();
        if (typeof eData.phivoPriceUsd === 'number') {
          setCurrentRate(eData.phivoPriceUsd);
        }
      }

      setSyncTime(new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) + ' UTC');
    } catch (err) {
      console.warn('[PhivoEcosystemRateCard] Failed to sync rate:', err);
    } finally {
      if (isManual) setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchWalletRateData(false);
    const interval = setInterval(() => fetchWalletRateData(false), 20000);
    return () => clearInterval(interval);
  }, [fetchWalletRateData]);

  const approxValueUsdt = userPhivoBalance * currentRate;

  const formatNumber = (val: number, decimals = 2) => {
    return val.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  };

  return (
    <div
      className={`rounded-2xl bg-[#07101D] border border-white/[0.08] shadow-xl p-5 sm:p-6 backdrop-blur-xl relative overflow-hidden space-y-4 ${className}`}
    >
      {/* Background ambient lighting */}
      <div className="absolute top-0 right-0 -mr-24 -mt-24 w-80 h-80 rounded-full blur-3xl pointer-events-none bg-[#00CFFF]/5" />

      {/* Top Header */}
      <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#00CFFF]/20 to-[#168BFF]/10 border border-[#00CFFF]/30 flex items-center justify-center shrink-0 shadow-md shadow-[#00CFFF]/10">
            <PhivoCoinIcon size={24} />
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-bold text-white tracking-tight">
                PHIVO Reference Rate
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#00CFFF]/10 text-[#00CFFF] border border-[#00CFFF]/20">
                Protocol Benchmark
              </span>
            </div>
            <p className="text-xs text-[#98A2B3]">
              Authoritative internal exchange benchmark for node mining rewards and liquidity swaps.
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
          <button
            type="button"
            onClick={() => fetchWalletRateData(true)}
            disabled={isRefreshing}
            className="p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-[#98A2B3] hover:text-white transition-all cursor-pointer min-h-[38px] flex items-center justify-center"
            title="Refresh exchange rate"
            aria-label="Refresh exchange rate"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#00CFFF] ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>

          {onNavigateTab && (
            <button
              type="button"
              onClick={() => onNavigateTab('swap')}
              className="px-3.5 py-2 rounded-xl bg-[#00CFFF]/10 hover:bg-[#00CFFF]/20 border border-[#00CFFF]/30 text-[#00CFFF] hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer min-h-[38px]"
            >
              <Repeat className="w-3.5 h-3.5" />
              <span>Swap PHIVO</span>
            </button>
          )}
        </div>
      </div>

      {/* 4 Clean Utility Modules */}
      <div className="relative z-10 grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Module 1: Current Rate */}
        <div className="p-3.5 rounded-xl bg-[#050B14]/80 border border-white/[0.05] space-y-1">
          <div className="text-[11px] text-[#98A2B3] font-medium">Reference Rate</div>
          <div className="text-xl sm:text-2xl font-mono font-bold text-white tabular-nums">
            ${currentRate.toFixed(4)}{' '}
            <span className="text-xs text-[#98A2B3] font-normal">USDT</span>
          </div>
          <div className="text-[10px] text-[#32D583] flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#32D583]" />
            <span>Configured Protocol Rate</span>
          </div>
        </div>

        {/* Module 2: PHIVO Balance */}
        <div className="p-3.5 rounded-xl bg-[#050B14]/80 border border-white/[0.05] space-y-1">
          <div className="text-[11px] text-[#98A2B3] font-medium">Your PHIVO Balance</div>
          <div className="text-xl sm:text-2xl font-mono font-bold text-[#00CFFF] tabular-nums">
            {formatNumber(userPhivoBalance, 2)}
          </div>
          <div className="text-[10px] text-[#98A2B3]">
            Unified Ecosystem Wallet
          </div>
        </div>

        {/* Module 3: Approx Valuation */}
        <div className="p-3.5 rounded-xl bg-[#050B14]/80 border border-white/[0.05] space-y-1">
          <div className="text-[11px] text-[#98A2B3] font-medium">Approx. Reference Value</div>
          <div className="text-xl sm:text-2xl font-mono font-bold text-white tabular-nums">
            ${formatNumber(approxValueUsdt, 2)}{' '}
            <span className="text-xs text-[#98A2B3] font-normal">USDT</span>
          </div>
          <div className="text-[10px] text-[#98A2B3]">
            At benchmark protocol rate
          </div>
        </div>

        {/* Module 4: Protocol Governance */}
        <div className="p-3.5 rounded-xl bg-[#050B14]/80 border border-white/[0.05] space-y-1">
          <div className="text-[11px] text-[#98A2B3] font-medium">Rate Synchronization</div>
          <div className="text-sm sm:text-base font-mono font-bold text-white pt-1">
            {syncTime || 'Synchronized'}
          </div>
          <div className="text-[10px] text-[#32D583] flex items-center gap-1">
            <ShieldCheck className="w-3 h-3 text-[#32D583]" />
            <span>Authoritative System State</span>
          </div>
        </div>
      </div>

      {/* Explanatory Footnote */}
      <div className="relative z-10 pt-2 flex items-center gap-2 text-[11px] text-[#667085]">
        <Info className="w-3.5 h-3.5 text-[#98A2B3] shrink-0" />
        <span>
          PHIVO is the native protocol utility token. Its internal conversion rate is governed by economic parameters and liquidity thresholds, benchmarked against USDT.
        </span>
      </div>
    </div>
  );
};
