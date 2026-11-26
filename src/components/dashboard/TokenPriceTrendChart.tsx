import React, { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw,
  ShieldCheck,
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

export const TokenPriceTrendChart: React.FC<TokenPriceTrendChartProps> = ({
  onNavigateTab,
  className = '',
}) => {
  const { coinPriceUsdt } = useSystemConfig();
  const [currentRate, setCurrentRate] = useState<number>(coinPriceUsdt || 0.1);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [syncTime, setSyncTime] = useState<string>('');
  const [userPhivoBalance, setUserPhivoBalance] = useState<number>(0);

  useEffect(() => {
    if (typeof coinPriceUsdt === 'number' && coinPriceUsdt > 0) {
      setCurrentRate(coinPriceUsdt);
    }
  }, [coinPriceUsdt]);

  const fetchWalletRateData = useCallback(async (isManual = false) => {
    if (isManual) setIsRefreshing(true);
    try {
      const [walletRes, econRes] = await Promise.all([
        fetch('/api/wallet/me', { credentials: 'include' }).catch(() => null),
        fetch('/api/economic/public', { credentials: 'include' }).catch(() => null),
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

      setSyncTime(
        new Date().toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        }) + ' UTC'
      );
    } catch {
      // keep previous rate
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

  const formatNumber = (val: number, decimals = 2) =>
    val.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });

  return (
    <div
      className={`oneui-glass-card rounded-[24px] p-4 sm:p-6 relative overflow-hidden space-y-4 min-w-0 ${className}`}
    >
      <div className="absolute top-0 right-0 -mr-20 -mt-20 w-72 h-72 rounded-full blur-3xl pointer-events-none bg-[#00E5FF]/[0.06]" />

      {/* Top Header */}
      <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-white/[0.08]">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-2xl bg-[#00E5FF]/12 border border-[#00E5FF]/30 flex items-center justify-center shrink-0">
            <PhivoCoinIcon size={24} />
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm sm:text-base font-bold text-white tracking-tight">
                PHIVO Reference Rate
              </h3>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-[#00E5FF]/12 text-[#00E5FF] border border-[#00E5FF]/25">
                Protocol Benchmark
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Internal exchange benchmark for validator rewards and USDT liquidity swaps.
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
          <button
            type="button"
            onClick={() => fetchWalletRateData(true)}
            disabled={isRefreshing}
            className="p-2.5 rounded-2xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-slate-300 hover:text-white transition-all cursor-pointer min-h-[40px] flex items-center justify-center active:scale-95"
            title="Refresh exchange rate"
            aria-label="Refresh exchange rate"
          >
            <RefreshCw className={`w-4 h-4 text-[#00E5FF] ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>

          {onNavigateTab && (
            <button
              type="button"
              onClick={() => onNavigateTab('wallet')}
              className="px-3.5 py-2 rounded-2xl bg-[#00E5FF]/12 hover:bg-[#00E5FF]/20 border border-[#00E5FF]/30 text-[#00E5FF] hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer min-h-[40px] active:scale-95"
            >
              <Repeat className="w-3.5 h-3.5" />
              <span>Swap PHIVO</span>
            </button>
          )}
        </div>
      </div>

      {/* 4 Clean Utility Modules */}
      <div className="relative z-10 grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-2xl bg-[#050807]/65 border border-white/[0.07] space-y-1 min-w-0">
          <div className="text-[11px] text-slate-400 font-medium">Reference Rate</div>
          <div className="text-lg sm:text-xl font-mono font-bold text-white tabular-nums truncate">
            ${currentRate.toFixed(4)}{' '}
            <span className="text-xs text-slate-400 font-normal">USDT</span>
          </div>
          <div className="text-[10px] text-[#00E676] flex items-center gap-1.5 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00E676]" />
            <span>Active Benchmark</span>
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-[#050807]/65 border border-white/[0.07] space-y-1 min-w-0">
          <div className="text-[11px] text-slate-400 font-medium">Your PHIVO Balance</div>
          <div className="text-lg sm:text-xl font-mono font-bold text-[#00E5FF] tabular-nums truncate">
            {formatNumber(userPhivoBalance, 2)}
          </div>
          <div className="text-[10px] text-slate-400">
            Unified Ecosystem Wallet
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-[#050807]/65 border border-white/[0.07] space-y-1 min-w-0">
          <div className="text-[11px] text-slate-400 font-medium">Approx. Valuation</div>
          <div className="text-lg sm:text-xl font-mono font-bold text-[#F5B800] tabular-nums truncate">
            ${formatNumber(approxValueUsdt, 2)}{' '}
            <span className="text-xs text-slate-400 font-normal">USDT</span>
          </div>
          <div className="text-[10px] text-slate-400">
            At protocol benchmark
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-[#050807]/65 border border-white/[0.07] space-y-1 min-w-0">
          <div className="text-[11px] text-slate-400 font-medium">Rate Sync</div>
          <div className="text-sm sm:text-base font-mono font-bold text-white pt-0.5 tabular-nums truncate">
            {syncTime || 'Synchronized'}
          </div>
          <div className="text-[10px] text-[#00E676] flex items-center gap-1">
            <ShieldCheck className="w-3 h-3 text-[#00E676]" />
            <span>Verified Protocol State</span>
          </div>
        </div>
      </div>

      {/* Explanatory Footnote */}
      <div className="relative z-10 pt-1 flex items-start gap-2 text-[11px] text-slate-400">
        <Info className="w-3.5 h-3.5 text-[#00E5FF] shrink-0 mt-0.5" />
        <span>
          PHIVO is the native ecosystem utility asset. Its internal conversion benchmark is governed by protocol liquidity parameters against USDT.
        </span>
      </div>
    </div>
  );
};
