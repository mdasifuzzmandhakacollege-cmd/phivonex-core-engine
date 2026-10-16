import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  TrendingUp,
  Coins,
  ShieldCheck,
  Calendar,
  Layers,
  ArrowUpRight,
  RefreshCw,
  Sparkles,
  Zap,
  Activity,
  CheckCircle2,
  Clock,
  ExternalLink
} from 'lucide-react';
import { UserProfile } from '../../context/AuthContext';

interface RewardAnalyticsProps {
  user: UserProfile;
  onNavigateTab: (tab: string) => void;
}

interface EpochRewardItem {
  id: string;
  publicRewardId: string;
  epochNumber: number;
  publicEpochId: string;
  publicNodeId: string;
  nodeNumber: number;
  amount: number;
  status: 'ACCRUED' | 'CLAIMED' | 'REVERSED';
  accruedAt: string;
  claimedAt: string | null;
}

interface AnalyticsTelemetry {
  totalAccrued: number;
  totalClaimed: number;
  totalRewards: number;
  activeNodesCount: number;
  dailyEmissionRate: number;
  referenceRateUsd: number;
  history: EpochRewardItem[];
}

export const RewardAnalytics: React.FC<RewardAnalyticsProps> = ({ user: _user, onNavigateTab }) => {
  const [telemetry, setTelemetry] = useState<AnalyticsTelemetry>({
    totalAccrued: 0,
    totalClaimed: 0,
    totalRewards: 0,
    activeNodesCount: 1,
    dailyEmissionRate: 0,
    referenceRateUsd: 0.10,
    history: [],
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [timeframe, setTimeframe] = useState<'7D' | '30D' | 'ALL'>('30D');

  const fetchAnalytics = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const res = await fetch('/api/rewards/me', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        const history: EpochRewardItem[] = data.history || [];
        
        // Compute metrics
        let accrued = 0;
        let claimed = 0;
        history.forEach((h) => {
          if (h.status === 'CLAIMED') claimed += h.amount;
          else if (h.status === 'ACCRUED') accrued += h.amount;
        });

        setTelemetry({
          totalAccrued: data.totalAccrued ?? accrued,
          totalClaimed: data.totalClaimed ?? claimed,
          totalRewards: data.totalRewards ?? (accrued + claimed),
          activeNodesCount: data.activeNodesCount || 1,
          dailyEmissionRate: data.dailyEmissionRate ?? data.protocolDailyEmission ?? 0,
          referenceRateUsd: 0.10,
          history,
        });
      }
    } catch (err) {
      console.warn('[RewardAnalytics] Failed to fetch reward telemetry:', err);
    } finally {
      setLoading(false);
      if (isManual) setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, []);

  // Filter history based on timeframe
  const filteredHistory = telemetry.history.filter((item) => {
    if (timeframe === 'ALL') return true;
    const itemDate = new Date(item.accruedAt);
    const now = new Date();
    const diffDays = (now.getTime() - itemDate.getTime()) / (1000 * 3600 * 24);
    if (timeframe === '7D') return diffDays <= 7;
    if (timeframe === '30D') return diffDays <= 30;
    return true;
  });

  const totalUsdValue = telemetry.totalRewards * telemetry.referenceRateUsd;
  const dailyEpochUsd = telemetry.activeNodesCount * telemetry.dailyEmissionRate * telemetry.referenceRateUsd;

  return (
    <div className="space-y-6 sm:space-y-8 animate-fadeIn pb-12">
      {/* ========================================================
          1. HERO HEADER WITH TIMEFRAME SELECTOR
         ======================================================== */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#07101D] via-[#0B1728] to-[#07101D] border border-white/[0.08] p-5 sm:p-7 shadow-xl">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-72 h-72 bg-[#00CFFF]/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-[#32D583]/10 border border-[#32D583]/25 text-[#32D583] text-[11px] font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-[#32D583]" />
                Live Epoch Telemetry
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.08] text-[#98A2B3] text-[11px] font-mono">
                Rate: $0.10 USD / PHIVO
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight flex items-center gap-2">
              <BarChart3 className="w-7 h-7 text-[#00CFFF]" />
              <span>Reward Analytics &amp; Epochs</span>
            </h1>
            <p className="text-xs sm:text-sm text-[#98A2B3] max-w-2xl leading-relaxed">
              Visualize current and historical PHIVO Genesis Node epoch earnings, daily emission yields, and settlement audits.
            </p>
          </div>

          {/* Timeframe Toggles & Refresh */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <div className="flex items-center bg-white/[0.04] border border-white/[0.08] rounded-xl p-1">
              {(['7D', '30D', 'ALL'] as const).map((tf) => (
                <button
                  key={tf}
                  type="button"
                  onClick={() => setTimeframe(tf)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                    timeframe === tf
                      ? 'bg-[#00CFFF] text-[#05070B] shadow-sm'
                      : 'text-[#98A2B3] hover:text-white'
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => fetchAnalytics(true)}
              disabled={refreshing}
              className="p-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-[#98A2B3] hover:text-white transition-all cursor-pointer"
              title="Refresh Analytics"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-[#00CFFF]' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================
          2. METRICS OVERVIEW CARDS
         ======================================================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Lifetime Earnings */}
        <div className="p-5 rounded-2xl bg-[#07101D] border border-white/[0.08] shadow-xl relative overflow-hidden group hover:border-[#00CFFF]/30 transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-[#00CFFF]/5 rounded-full blur-xl pointer-events-none" />
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-mono text-[#98A2B3]">Total Lifetime Earnings</span>
            <div className="w-8 h-8 rounded-xl bg-[#00CFFF]/10 border border-[#00CFFF]/20 flex items-center justify-center text-[#00CFFF]">
              <Coins className="w-4 h-4" />
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-2xl sm:text-3xl font-bold font-mono text-white">
              {telemetry.totalRewards.toLocaleString()} <span className="text-xs font-sans text-[#00CFFF]">PHIVO</span>
            </div>
            <div className="text-xs font-mono text-[#32D583] flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5" />
              <span>≈ ${totalUsdValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD</span>
            </div>
          </div>
        </div>

        {/* Available Accrued Balance */}
        <div className="p-5 rounded-2xl bg-[#07101D] border border-white/[0.08] shadow-xl relative overflow-hidden group hover:border-[#32D583]/30 transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-[#32D583]/5 rounded-full blur-xl pointer-events-none" />
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-mono text-[#98A2B3]">Accrued Unclaimed</span>
            <div className="w-8 h-8 rounded-xl bg-[#32D583]/10 border border-[#32D583]/20 flex items-center justify-center text-[#32D583]">
              <Zap className="w-4 h-4" />
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-2xl sm:text-3xl font-bold font-mono text-white">
              {telemetry.totalAccrued.toLocaleString()} <span className="text-xs font-sans text-[#32D583]">PHIVO</span>
            </div>
            <div className="text-xs font-mono text-[#98A2B3]">
              Ready for instant vault settlement
            </div>
          </div>
        </div>

        {/* Estimated Daily Yield */}
        <div className="p-5 rounded-2xl bg-[#07101D] border border-white/[0.08] shadow-xl relative overflow-hidden group hover:border-[#F59E0B]/30 transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-[#F59E0B]/5 rounded-full blur-xl pointer-events-none" />
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-mono text-[#98A2B3]">Estimated Daily Yield</span>
            <div className="w-8 h-8 rounded-xl bg-[#F59E0B]/10 border border-[#F59E0B]/20 flex items-center justify-center text-[#F59E0B]">
              <Sparkles className="w-4 h-4" />
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-2xl sm:text-3xl font-bold font-mono text-white">
              {(telemetry.activeNodesCount * telemetry.dailyEmissionRate).toLocaleString()} <span className="text-xs font-sans text-[#F59E0B]">PHIVO/day</span>
            </div>
            <div className="text-xs font-mono text-[#32D583]">
              ≈ ${dailyEpochUsd.toFixed(2)} USD daily value
            </div>
          </div>
        </div>

        {/* Active Emitting Nodes */}
        <div className="p-5 rounded-2xl bg-[#07101D] border border-white/[0.08] shadow-xl relative overflow-hidden group hover:border-[#00CFFF]/30 transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-[#00CFFF]/5 rounded-full blur-xl pointer-events-none" />
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-mono text-[#98A2B3]">Active Genesis Nodes</span>
            <div className="w-8 h-8 rounded-xl bg-[#00CFFF]/10 border border-[#00CFFF]/20 flex items-center justify-center text-[#00CFFF]">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-2xl sm:text-3xl font-bold font-mono text-white">
              {telemetry.activeNodesCount} <span className="text-xs font-sans text-[#98A2B3]">Nodes</span>
            </div>
            <div className="text-xs font-mono text-[#98A2B3]">
              {telemetry.dailyEmissionRate > 0
                ? `Current Protocol Daily Emission: ${telemetry.dailyEmissionRate} PHIVO / Eligible Day`
                : 'Protocol Daily Emission Governed by Admin'}
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================
          3. VISUAL YIELD TREND CHART (HTML/CSS Bar Visualization)
         ======================================================== */}
      <div className="p-5 sm:p-7 rounded-2xl bg-[#07101D] border border-white/[0.08] shadow-xl space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/[0.06] pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#00CFFF]/10 border border-[#00CFFF]/25 flex items-center justify-center text-[#00CFFF]">
              <TrendingUp className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Epoch Emission &amp; Yield Distribution</h2>
              <p className="text-xs text-[#98A2B3]">Visual breakdown of PHIVO minted across recent emission epochs.</p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs font-mono text-[#98A2B3]">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-[#00CFFF]" /> Minted PHIVO
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-[#32D583]" /> Claimed
            </span>
          </div>
        </div>

        {/* Visual Bar Chart */}
        <div className="pt-4 pb-2">
          {filteredHistory.length === 0 ? (
            <div className="py-12 text-center text-sm font-mono text-[#98A2B3] bg-white/[0.01] rounded-xl border border-white/[0.04]">
              No epoch reward distribution events recorded in this timeframe yet.
            </div>
          ) : (
            <div className="h-64 flex items-end gap-2 sm:gap-4 px-2 overflow-x-auto pb-6 pt-4 border-b border-white/[0.06]">
              {filteredHistory.slice(-14).map((item, idx) => {
                const maxAmount = Math.max(...filteredHistory.map((h) => h.amount), 25);
                const heightPercent = Math.max(15, Math.min(100, (item.amount / maxAmount) * 100));
                return (
                  <div key={item.id || idx} className="flex-1 flex flex-col items-center gap-2 group min-w-[36px]">
                    {/* Tooltip on hover */}
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -translate-y-12 bg-[#0B1728] border border-white/[0.15] px-2 py-1 rounded-lg text-[10px] font-mono text-white shadow-lg pointer-events-none z-20 whitespace-nowrap">
                      Epoch #{item.epochNumber}: {item.amount} PHIVO
                    </div>

                    <div className="w-full bg-white/[0.02] h-48 rounded-lg flex items-end p-1 relative">
                      <div
                        style={{ height: `${heightPercent}%` }}
                        className={`w-full rounded-md transition-all duration-500 ${
                          item.status === 'CLAIMED'
                            ? 'bg-gradient-to-t from-[#32D583]/40 to-[#32D583]'
                            : 'bg-gradient-to-t from-[#00CFFF]/40 to-[#00CFFF]'
                        } group-hover:brightness-125`}
                      />
                    </div>
                    <span className="text-[10px] font-mono text-[#98A2B3] truncate w-full text-center">
                      Ep #{item.epochNumber}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ========================================================
          4. DETAILED HISTORICAL EPOCH LEDGER TABLE
         ======================================================== */}
      <div className="p-5 sm:p-7 rounded-2xl bg-[#07101D] border border-white/[0.08] shadow-xl space-y-5">
        <div className="flex items-center justify-between border-b border-white/[0.06] pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#00CFFF]/10 border border-[#00CFFF]/25 flex items-center justify-center text-[#00CFFF]">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Historical Epoch Ledger Audit</h2>
              <p className="text-xs text-[#98A2B3]">Complete cryptographic log of node reward distributions and settlement receipts.</p>
            </div>
          </div>
          <span className="text-xs font-mono text-[#00CFFF] bg-[#00CFFF]/10 border border-[#00CFFF]/20 px-3 py-1 rounded-lg">
            {filteredHistory.length} Epochs Recorded
          </span>
        </div>

        <div className="overflow-x-auto">
          {filteredHistory.length === 0 ? (
            <div className="py-12 text-center text-sm font-mono text-[#98A2B3]">
              No epoch records found.
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/[0.06] text-[#98A2B3] font-mono text-[10px] uppercase">
                  <th className="pb-3 font-semibold">Epoch ID</th>
                  <th className="pb-3 font-semibold">Node Number</th>
                  <th className="pb-3 font-semibold">Reward Amount</th>
                  <th className="pb-3 font-semibold">USD Valuation</th>
                  <th className="pb-3 font-semibold">Status</th>
                  <th className="pb-3 font-semibold text-right">Accrued Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {filteredHistory.map((item) => (
                  <tr key={item.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-3 font-mono text-white flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#00CFFF]" />
                      Epoch #{item.epochNumber} ({item.publicEpochId})
                    </td>
                    <td className="py-3 font-mono text-[#00CFFF]">
                      Genesis Node #{item.nodeNumber}
                    </td>
                    <td className="py-3 font-mono font-bold text-white tabular-nums">
                      +{item.amount} <span className="text-[10px] font-normal text-[#00CFFF]">PHIVO</span>
                    </td>
                    <td className="py-3 font-mono text-[#32D583] tabular-nums">
                      +${(item.amount * telemetry.referenceRateUsd).toFixed(2)} USD
                    </td>
                    <td className="py-3">
                      <span
                        className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded-full border inline-flex items-center gap-1 ${
                          item.status === 'CLAIMED'
                            ? 'bg-[#32D583]/10 text-[#32D583] border-[#32D583]/30'
                            : item.status === 'ACCRUED'
                            ? 'bg-[#00CFFF]/10 text-[#00CFFF] border-[#00CFFF]/30'
                            : 'bg-[#F04438]/10 text-[#F04438] border-[#F04438]/30'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            item.status === 'CLAIMED'
                              ? 'bg-[#32D583]'
                              : item.status === 'ACCRUED'
                              ? 'bg-[#00CFFF]'
                              : 'bg-[#F04438]'
                          }`}
                        />
                        {item.status}
                      </span>
                    </td>
                    <td className="py-3 text-[#98A2B3] font-mono text-[11px] text-right">
                      {new Date(item.accruedAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
