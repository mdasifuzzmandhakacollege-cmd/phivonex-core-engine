import React, { useState, useEffect, useCallback } from 'react';
import {
  BarChart3,
  TrendingUp,
  Coins,
  Calendar,
  Layers,
  RefreshCw,
  Download,
  GitFork,
  Trophy,
  CheckCircle2,
  Sparkles,
  Wallet,
} from 'lucide-react';
import { RewardEarningsChart } from './RewardEarningsChart';
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

interface GenerationStat {
  generationLevel: number;
  royaltyPercentage: number;
  isUnlocked: boolean;
  totalEarnedUsdt: number;
  totalEarnedPhivo: number;
}

interface RankMilestone {
  rankLevel: number;
  rankName: string;
  milestoneRewardUsd: number;
}

interface LedgerAuditRow {
  id: string;
  category: string;
  title: string;
  currency: 'USDT' | 'PHIVO';
  amount: number;
  status: string;
  createdAt: string;
}

export const RewardAnalytics: React.FC<RewardAnalyticsProps> = ({ user: _user, onNavigateTab }) => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [timeframe, setTimeframe] = useState<'7D' | '30D' | 'ALL'>('30D');
  const [ledgerFilter, setLedgerFilter] = useState<'ALL' | 'USDT' | 'PHIVO'>('ALL');

  const [referenceRateUsd, setReferenceRateUsd] = useState<number>(0.10);
  const [totalPhivoMinted, setTotalPhivoMinted] = useState<number>(0);
  const [totalAccruedPhivo, setTotalAccruedPhivo] = useState<number>(0);
  const [activeNodesCount, setActiveNodesCount] = useState<number>(0);
  const [dailyEmissionRate, setDailyEmissionRate] = useState<number>(0);
  const [epochHistory, setEpochHistory] = useState<EpochRewardItem[]>([]);

  // Asset-matched 16-Gen Royalty totals
  const [totalRoyaltyUsdt, setTotalRoyaltyUsdt] = useState<number>(0);
  const [totalRoyaltyPhivo, setTotalRoyaltyPhivo] = useState<number>(0);
  const [generations, setGenerations] = useState<GenerationStat[]>([]);

  // Product yields + Rank milestones
  const [quantumAlphaUsdt, setQuantumAlphaUsdt] = useState<number>(0);
  const [chronoVaultUsdt, setChronoVaultUsdt] = useState<number>(0);
  const [rankBonusUsdt, setRankBonusUsdt] = useState<number>(0);
  const [currentRankLevel, setCurrentRankLevel] = useState<number>(0);
  const [currentRankName, setCurrentRankName] = useState<string>('Initiate Member');
  const [ranksList, setRanksList] = useState<RankMilestone[]>([
    { rankLevel: 0, rankName: 'Initiate Member', milestoneRewardUsd: 0 },
    { rankLevel: 1, rankName: 'Quantum Architect', milestoneRewardUsd: 1000 },
    { rankLevel: 2, rankName: 'Apex Strategist', milestoneRewardUsd: 5000 },
    { rankLevel: 3, rankName: 'Vanguard Commander', milestoneRewardUsd: 15000 },
    { rankLevel: 4, rankName: 'Sovereign Marshal', milestoneRewardUsd: 50000 },
    { rankLevel: 5, rankName: 'Global Ambassador', milestoneRewardUsd: 100000 },
    { rankLevel: 6, rankName: 'Titan Apex Sovereign', milestoneRewardUsd: 250000 },
  ]);

  const [auditRows, setAuditRows] = useState<LedgerAuditRow[]>([]);

  const fetchAnalytics = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const [rewardsRes, royaltiesRes, ranksRes, statementRes, econRes] = await Promise.allSettled([
        fetch('/api/rewards/me', { credentials: 'include' }),
        fetch('/api/unilevel/royalties/overview', { credentials: 'include' }),
        fetch('/api/unilevel/ranks/overview', { credentials: 'include' }),
        fetch('/api/wallet/unified-statement', { credentials: 'include' }),
        fetch('/api/economic/public', { credentials: 'include' }),
      ]);

      let rate = 0.10;
      if (econRes.status === 'fulfilled' && econRes.value.ok) {
        const econ = await econRes.value.json().catch(() => null);
        if (econ && typeof econ.phivoPriceUsd === 'number' && econ.phivoPriceUsd > 0) {
          rate = econ.phivoPriceUsd;
          setReferenceRateUsd(rate);
        }
      }

      const combinedRows: LedgerAuditRow[] = [];

      // 1. Node Rewards
      if (rewardsRes.status === 'fulfilled' && rewardsRes.value.ok) {
        const data = await rewardsRes.value.json().catch(() => ({}));
        const history: EpochRewardItem[] = Array.isArray(data.history) ? data.history : [];
        let accrued = 0;
        let claimed = 0;
        history.forEach((h) => {
          const amt = Number(h.amount || 0);
          if (h.status === 'CLAIMED') claimed += amt;
          else if (h.status === 'ACCRUED') accrued += amt;

          combinedRows.push({
            id: `NODE-${h.id || h.publicRewardId}`,
            category: 'Genesis Core Mining',
            title: `Epoch #${h.epochNumber || 0} · Node #${h.nodeNumber || 1}`,
            currency: 'PHIVO',
            amount: amt,
            status: h.status || 'SETTLED',
            createdAt: h.accruedAt || new Date().toISOString(),
          });
        });

        setEpochHistory(history);
        setTotalAccruedPhivo(Number(data.totalAccrued ?? accrued));
        setTotalPhivoMinted(Number(data.totalRewards ?? accrued + claimed));
        setActiveNodesCount(Number(data.activeNodesCount ?? 0));
        setDailyEmissionRate(Number(data.dailyEmissionRate ?? data.protocolDailyEmission ?? 0));
      }

      // 2. 16-Generation Asset-Matched Royalties (USDT & PHIVO separate)
      if (royaltiesRes.status === 'fulfilled' && royaltiesRes.value.ok) {
        const rJson = await royaltiesRes.value.json().catch(() => ({}));
        const ov = rJson.data || rJson;
        const gens: any[] = Array.isArray(ov.generations) ? ov.generations : [];
        let sumUsdt = 0;
        let sumPhivo = 0;
        const normalizedGens: GenerationStat[] = gens.map((g) => {
          const usdt = Number(g.totalEarnedUsdt ?? g.totalEarnedUsd ?? 0);
          const phivo = Number(g.totalEarnedPhivo ?? 0);
          sumUsdt += usdt;
          sumPhivo += phivo;
          return {
            generationLevel: Number(g.generationLevel || 0),
            royaltyPercentage: Number(g.royaltyPercentage || 0),
            isUnlocked: Boolean(g.isUnlocked),
            totalEarnedUsdt: usdt,
            totalEarnedPhivo: phivo,
          };
        });
        setGenerations(normalizedGens);
        setTotalRoyaltyUsdt(Number(ov.totalRoyaltyUsdt ?? ov.totalUsdtRoyalties ?? sumUsdt));
        setTotalRoyaltyPhivo(Number(ov.totalRoyaltyPhivo ?? ov.totalPhivoRoyalties ?? sumPhivo));

        const recentPayouts: any[] = Array.isArray(ov.recentPayouts) ? ov.recentPayouts : [];
        recentPayouts.forEach((p, idx) => {
          const curr: 'USDT' | 'PHIVO' =
            String(p.payoutCurrency || p.currency || 'USDT').toUpperCase() === 'PHIVO' ? 'PHIVO' : 'USDT';
          combinedRows.push({
            id: `ROY-${p.id || idx}`,
            category: `Gen-${p.generationLevel || 1} Royalty`,
            title: p.sourceProduct || `Generation ${p.generationLevel || 1} Affiliate Royalty`,
            currency: curr,
            amount: Number(p.royaltyAmount ?? p.amount ?? 0),
            status: p.status || 'SETTLED',
            createdAt: p.createdAt || new Date().toISOString(),
          });
        });
      }

      // 3. Ranks Overview
      if (ranksRes.status === 'fulfilled' && ranksRes.value.ok) {
        const rkJson = await ranksRes.value.json().catch(() => ({}));
        const ov = rkJson.data || rkJson;
        setCurrentRankLevel(Number(ov.currentRankLevel ?? ov.rankLevel ?? 0));
        setCurrentRankName(ov.currentRankName || 'Initiate Member');
        if (Array.isArray(ov.ranksList) && ov.ranksList.length > 0) {
          setRanksList(ov.ranksList);
        }
      }

      // 4. Unified Statement (Trading Pool, Chrono Vaults, Rank Milestones)
      if (statementRes.status === 'fulfilled' && statementRes.value.ok) {
        const stJson = await statementRes.value.json().catch(() => ({}));
        const st = stJson.statement || stJson;
        const entries: any[] = Array.isArray(st.entries) ? st.entries : [];
        let alphaSum = 0;
        let chronoSum = 0;
        let rankSum = 0;

        entries.forEach((e, idx) => {
          const src = String(e.sourceType || e.category || '').toUpperCase();
          const amt = Number(e.amount ?? e.amountUsd ?? 0);
          if (src.includes('TRADING') || src.includes('ALPHA')) {
            alphaSum += amt;
          } else if (src.includes('CHRONO') || src.includes('VAULT')) {
            chronoSum += amt;
          } else if (src.includes('RANK') || src.includes('PROMOTION') || src.includes('MILESTONE')) {
            rankSum += amt;
          }

          if (amt > 0 && (src.includes('TRADING') || src.includes('CHRONO') || src.includes('RANK') || src.includes('YIELD'))) {
            combinedRows.push({
              id: `LED-${e.id || idx}`,
              category: src.replace(/_/g, ' '),
              title: e.description || 'Protocol Settlement',
              currency: String(e.currency || 'USDT').toUpperCase() === 'PHIVO' ? 'PHIVO' : 'USDT',
              amount: amt,
              status: e.status || 'SETTLED',
              createdAt: e.createdAt || new Date().toISOString(),
            });
          }
        });

        setQuantumAlphaUsdt(alphaSum);
        setChronoVaultUsdt(chronoSum);
        setRankBonusUsdt(rankSum);
      }

      combinedRows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setAuditRows(combinedRows);
    } catch {
      // gracefully show loaded partial data
    } finally {
      setLoading(false);
      if (isManual) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchAnalytics(false);
  }, [fetchAnalytics]);

  // Filter epoch history by timeframe
  const filteredEpochs = epochHistory.filter((item) => {
    if (timeframe === 'ALL') return true;
    const diffDays = (Date.now() - new Date(item.accruedAt).getTime()) / (1000 * 3600 * 24);
    if (timeframe === '7D') return diffDays <= 7;
    return diffDays <= 30;
  });

  const filteredAuditRows = auditRows.filter((row) => {
    if (ledgerFilter !== 'ALL' && row.currency !== ledgerFilter) return false;
    if (timeframe === 'ALL') return true;
    const diffDays = (Date.now() - new Date(row.createdAt).getTime()) / (1000 * 3600 * 24);
    return timeframe === '7D' ? diffDays <= 7 : diffDays <= 30;
  });

  // 5-Stream Income Valuation in USD equivalent
  const genesisPhivoUsd = totalPhivoMinted * referenceRateUsd;
  const royaltyTotalUsd = totalRoyaltyUsdt + totalRoyaltyPhivo * referenceRateUsd;
  const totalCombinedUsd = quantumAlphaUsdt + genesisPhivoUsd + chronoVaultUsdt + royaltyTotalUsd + rankBonusUsdt;

  const streams = [
    { label: 'Quantum Alpha (USDT)', value: quantumAlphaUsdt, color: '#00E5FF' },
    { label: 'Genesis Core (PHIVO)', value: genesisPhivoUsd, color: '#00E676' },
    { label: 'Chrono Vaults (USDT)', value: chronoVaultUsdt, color: '#F5B800' },
    { label: '16-Gen Royalties', value: royaltyTotalUsd, color: '#A855F7' },
    { label: 'Rank Milestones', value: rankBonusUsdt, color: '#38BDF8' },
  ];

  // Export CSV Statement
  const handleExportCsv = () => {
    const header = ['Timestamp', 'Record ID', 'Stream Category', 'Description', 'Amount', 'Currency', 'Status'];
    const lines = [
      header.join(','),
      ...filteredAuditRows.map((r) =>
        [
          `"${new Date(r.createdAt).toISOString()}"`,
          `"${r.id}"`,
          `"${r.category.replace(/"/g, '""')}"`,
          `"${r.title.replace(/"/g, '""')}"`,
          r.amount.toFixed(8),
          r.currency,
          r.status,
        ].join(',')
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `PHIVONEX-Reward-Statement-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-10 min-w-0 max-w-full overflow-x-hidden">
      {/* 1. HERO HEADER WITH TIMEFRAME & CSV EXPORT */}
      <div className="oneui-glass-card rounded-[24px] p-5 sm:p-7 relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-14 -mr-14 w-72 h-72 bg-[#00E5FF]/[0.07] rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="space-y-2 min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#00E676]/12 border border-[#00E676]/25 text-[#00E676] text-[11px] font-mono font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-[#00E676]" />
                5-Stream Income Command
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white/[0.05] border border-white/[0.08] text-slate-300 text-[11px] font-mono">
                1 PHIVO = ${referenceRateUsd.toFixed(2)} USDT
              </span>
            </div>

            <h1 className="text-xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
              <BarChart3 className="w-6 h-6 sm:w-7 sm:h-7 text-[#00E5FF] shrink-0" />
              <span className="truncate">Reward Analytics &amp; Income Ledger</span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 max-w-2xl leading-relaxed">
              Asset-matched audit across USDT yields, PHIVO validator emissions, 16-generation royalties, and leadership milestone payouts.
            </p>
          </div>

          {/* Controls */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <div className="flex items-center bg-[#050807]/70 border border-white/[0.1] rounded-2xl p-1">
              {(['7D', '30D', 'ALL'] as const).map((tf) => (
                <button
                  key={tf}
                  type="button"
                  onClick={() => setTimeframe(tf)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer ${
                    timeframe === tf
                      ? 'bg-[#00E5FF] text-[#050807] shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={handleExportCsv}
              className="px-3.5 py-2 rounded-2xl bg-[#F5B800]/15 hover:bg-[#F5B800]/25 border border-[#F5B800]/35 text-[#F5B800] text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV Statement</span>
            </button>

            <button
              type="button"
              onClick={() => fetchAnalytics(true)}
              disabled={refreshing}
              className="p-2.5 rounded-2xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.1] text-slate-300 hover:text-white transition-all cursor-pointer active:scale-95"
              title="Refresh Analytics"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-[#00E5FF]' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* 2. EXECUTIVE KPI CARDS (SEPARATE USDT vs PHIVO) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="oneui-glass-card rounded-[24px] p-4 sm:p-5 space-y-2 min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400">Combined Yield Value</span>
            <div className="w-8 h-8 rounded-xl bg-[#00E676]/12 border border-[#00E676]/25 flex items-center justify-center text-[#00E676]">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-mono font-bold text-white tabular-nums truncate">
            ${totalCombinedUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] font-mono text-[#00E676] flex items-center gap-1">
            <TrendingUp className="w-3.5 h-3.5" />
            <span>5-Stream USD Equivalent</span>
          </div>
        </div>

        <div className="oneui-glass-card rounded-[24px] p-4 sm:p-5 space-y-2 min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400">USDT Royalties (16-Gen)</span>
            <div className="w-8 h-8 rounded-xl bg-[#F5B800]/12 border border-[#F5B800]/25 flex items-center justify-center text-[#F5B800]">
              <GitFork className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-mono font-bold text-[#F5B800] tabular-nums truncate">
            ${totalRoyaltyUsdt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}{' '}
            <span className="text-xs font-normal text-slate-400">USDT</span>
          </div>
          <div className="text-[11px] font-mono text-slate-400">
            From Alpha &amp; Chrono yields
          </div>
        </div>

        <div className="oneui-glass-card rounded-[24px] p-4 sm:p-5 space-y-2 min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400">PHIVO Royalties (16-Gen)</span>
            <div className="w-8 h-8 rounded-xl bg-[#00E5FF]/12 border border-[#00E5FF]/25 flex items-center justify-center text-[#00E5FF]">
              <Coins className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-mono font-bold text-[#00E5FF] tabular-nums truncate">
            {totalRoyaltyPhivo.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}{' '}
            <span className="text-xs font-normal text-slate-400">PHIVO</span>
          </div>
          <div className="text-[11px] font-mono text-slate-400">
            From Genesis Core node emissions
          </div>
        </div>

        <div className="oneui-glass-card rounded-[24px] p-4 sm:p-5 space-y-2 min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400">Node Emissions</span>
            <div className="w-8 h-8 rounded-xl bg-[#00E5FF]/12 border border-[#00E5FF]/25 flex items-center justify-center text-[#00E5FF]">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-mono font-bold text-white tabular-nums truncate">
            {totalPhivoMinted.toLocaleString('en-US', { maximumFractionDigits: 2 })}{' '}
            <span className="text-xs font-normal text-[#00E5FF]">PHIVO</span>
          </div>
          <div className="text-[11px] font-mono text-slate-400 truncate">
            {activeNodesCount} Nodes · {totalAccruedPhivo.toFixed(2)} Unclaimed
            {dailyEmissionRate > 0 ? ` · ${dailyEmissionRate}/d` : ''}
          </div>
        </div>
      </div>

      {/* 3. VISUAL 5-STREAM INCOME SHARE BAR */}
      <div className="oneui-glass-card rounded-[24px] p-4 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#F5B800]" />
            <h2 className="text-sm sm:text-base font-bold text-white">5-Stream Income Composition</h2>
          </div>
          <span className="text-[11px] font-mono text-slate-400">Asset-Matched Settlement Mix</span>
        </div>

        <div className="h-3 w-full rounded-full bg-white/[0.06] overflow-hidden flex">
          {totalCombinedUsd > 0 ? (
            streams.map((s) => {
              const pct = (s.value / totalCombinedUsd) * 100;
              if (pct <= 0) return null;
              return (
                <div
                  key={s.label}
                  style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: s.color }}
                  className="h-full transition-all duration-500"
                  title={`${s.label}: $${s.value.toFixed(2)}`}
                />
              );
            })
          ) : (
            <div className="h-full w-full bg-gradient-to-r from-[#00E5FF]/25 via-[#00E676]/25 to-[#F5B800]/25" />
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
          {streams.map((s) => (
            <div key={s.label} className="p-3 rounded-2xl bg-[#050807]/65 border border-white/[0.07] space-y-1 min-w-0">
              <div className="flex items-center gap-1.5 text-[11px] text-slate-300 truncate">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                <span className="truncate">{s.label}</span>
              </div>
              <div className="text-sm font-mono font-bold text-white tabular-nums">
                ${s.value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 4. 16-GEN ASSET-MATCHED ROYALTY BREAKDOWN & 7-RANK MILESTONE STRIP */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* 16-Gen Breakdown Table */}
        <div className="lg:col-span-2 oneui-glass-card rounded-[24px] p-4 sm:p-6 space-y-4 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-white/[0.08]">
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white">16-Generation Asset-Matched Royalties</h2>
              <p className="text-xs text-slate-400">Itemized USDT dollar royalties and PHIVO coin royalties per generation.</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('network')}
              className="px-3 py-1.5 rounded-xl bg-[#00E5FF]/12 hover:bg-[#00E5FF]/20 border border-[#00E5FF]/30 text-[#00E5FF] text-xs font-semibold cursor-pointer"
            >
              Open Matrix
            </button>
          </div>

          <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="sticky top-0 bg-[#0e1513] z-10">
                <tr className="border-b border-white/[0.08] text-slate-400 text-[10px] uppercase">
                  <th className="py-2.5 px-2">Gen</th>
                  <th className="py-2.5 px-2">Rate</th>
                  <th className="py-2.5 px-2">Status</th>
                  <th className="py-2.5 px-2 text-right">USDT Earned</th>
                  <th className="py-2.5 px-2 text-right">PHIVO Earned</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {(generations.length > 0
                  ? generations
                  : Array.from({ length: 16 }, (_, idx) => ({
                      generationLevel: idx + 1,
                      royaltyPercentage: idx === 0 ? 10 : idx === 1 ? 5 : 2,
                      isUnlocked: false,
                      totalEarnedUsdt: 0,
                      totalEarnedPhivo: 0,
                    }))
                ).map((g) => (
                  <tr key={g.generationLevel} className="hover:bg-white/[0.03]">
                    <td className="py-2 px-2 text-white font-bold">Gen {g.generationLevel}</td>
                    <td className="py-2 px-2 text-[#00E5FF]">{g.royaltyPercentage}%</td>
                    <td className="py-2 px-2">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          g.isUnlocked
                            ? 'bg-[#00E676]/12 text-[#00E676] border border-[#00E676]/25'
                            : 'bg-white/[0.05] text-slate-400 border border-white/[0.08]'
                        }`}
                      >
                        {g.isUnlocked ? 'Unlocked' : 'Locked'}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-right text-[#F5B800] tabular-nums">
                      ${g.totalEarnedUsdt.toFixed(4)}
                    </td>
                    <td className="py-2 px-2 text-right text-[#00E5FF] tabular-nums">
                      {g.totalEarnedPhivo.toFixed(4)} PHIVO
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 7-Rank Milestone Tracker */}
        <div className="oneui-glass-card rounded-[24px] p-4 sm:p-6 space-y-4 min-w-0">
          <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
            <div className="flex items-center gap-2">
              <Trophy className="w-4 h-4 text-[#F5B800]" />
              <h2 className="text-sm sm:text-base font-bold text-white">7-Rank Milestones</h2>
            </div>
            <span className="text-[11px] font-mono text-[#F5B800]">{currentRankName}</span>
          </div>

          <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
            {ranksList.map((r) => {
              const achieved = currentRankLevel >= r.rankLevel;
              return (
                <div
                  key={r.rankLevel}
                  className={`p-3 rounded-2xl border flex items-center justify-between gap-2 ${
                    achieved
                      ? 'bg-[#00E676]/10 border-[#00E676]/30'
                      : 'bg-[#050807]/60 border-white/[0.07]'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <CheckCircle2
                      className={`w-4 h-4 shrink-0 ${achieved ? 'text-[#00E676]' : 'text-slate-600'}`}
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-white truncate">{r.rankName}</div>
                      <div className="text-[10px] font-mono text-slate-400">Rank {r.rankLevel}</div>
                    </div>
                  </div>
                  <span className="text-xs font-mono font-bold text-[#F5B800] shrink-0 tabular-nums">
                    ${Number(r.milestoneRewardUsd || 0).toLocaleString()}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 5. EPOCH EMISSION VISUAL CHART */}
      <div className="oneui-glass-card rounded-[24px] p-4 sm:p-6 space-y-4 min-w-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-white/[0.08]">
          <div>
            <h2 className="text-sm sm:text-base font-bold text-white">Epoch Emission &amp; Yield Trend</h2>
            <p className="text-xs text-slate-400">Visual distribution of minted PHIVO and USD valuation across epochs.</p>
          </div>
        </div>

        {loading ? (
          <div className="py-12 text-center text-xs font-mono text-slate-400">Loading emission chart...</div>
        ) : filteredEpochs.length === 0 ? (
          <div className="py-12 text-center text-xs font-mono text-slate-400 bg-[#050807]/50 rounded-2xl border border-white/[0.06]">
            No epoch reward distribution events recorded in this timeframe yet.
          </div>
        ) : (
          <RewardEarningsChart
            data={filteredEpochs.map((item) => ({
              date: new Date(item.accruedAt).toLocaleDateString(),
              rewards: item.amount,
              usdt: Number((item.amount * referenceRateUsd).toFixed(2)),
            }))}
          />
        )}
      </div>

      {/* 6. FILTERABLE MASTER AUDIT LEDGER */}
      <div className="oneui-glass-card rounded-[24px] p-4 sm:p-6 space-y-4 min-w-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/[0.08]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#00E5FF]/12 border border-[#00E5FF]/25 flex items-center justify-center text-[#00E5FF] shrink-0">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white">Master Reward Audit Ledger</h2>
              <p className="text-xs text-slate-400">Itemized settlement receipts across USDT &amp; PHIVO income streams.</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {(['ALL', 'USDT', 'PHIVO'] as const).map((curr) => (
              <button
                key={curr}
                type="button"
                onClick={() => setLedgerFilter(curr)}
                className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer ${
                  ledgerFilter === curr
                    ? 'bg-[#00E5FF] text-[#050807]'
                    : 'bg-white/[0.05] text-slate-400 hover:text-white'
                }`}
              >
                {curr}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          {filteredAuditRows.length === 0 ? (
            <div className="py-10 text-center text-xs font-mono text-slate-400">
              No reward settlement records found for the selected filter.
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/[0.08] text-slate-400 font-mono text-[10px] uppercase">
                  <th className="pb-3 px-2">Stream</th>
                  <th className="pb-3 px-2">Details</th>
                  <th className="pb-3 px-2 text-right">Amount</th>
                  <th className="pb-3 px-2">Status</th>
                  <th className="pb-3 px-2 text-right">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05] font-mono">
                {filteredAuditRows.slice(0, 50).map((row) => (
                  <tr key={row.id} className="hover:bg-white/[0.03] transition-colors">
                    <td className="py-3 px-2 text-white font-semibold whitespace-nowrap">{row.category}</td>
                    <td className="py-3 px-2 text-slate-300 font-sans">{row.title}</td>
                    <td
                      className={`py-3 px-2 text-right font-bold tabular-nums whitespace-nowrap ${
                        row.currency === 'PHIVO' ? 'text-[#00E5FF]' : 'text-[#00E676]'
                      }`}
                    >
                      +{row.amount.toFixed(4)} {row.currency}
                    </td>
                    <td className="py-3 px-2">
                      <span className="px-2 py-0.5 rounded-full text-[10px] uppercase bg-[#00E676]/12 text-[#00E676] border border-[#00E676]/25">
                        {row.status}
                      </span>
                    </td>
                    <td className="py-3 px-2 text-right text-slate-400 whitespace-nowrap">
                      {new Date(row.createdAt).toLocaleString()}
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
