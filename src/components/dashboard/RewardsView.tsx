import React, { useState, useEffect, useCallback } from 'react';
import {
  Coins,
  Server,
  Zap,
  Clock,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ArrowRight,
  ArrowLeftRight,
  Sparkles,
  TrendingUp,
  ShieldCheck,
  Layers,
  ChevronRight,
  Activity,
  Calendar,
  DollarSign,
  Info,
  Check,
  Lock,
  ExternalLink,
} from 'lucide-react';
import { UserProfile } from '../../context/AuthContext';

interface RewardsViewProps {
  user: UserProfile;
  onNavigateTab: (tab: string) => void;
}

interface RewardHistoryItem {
  id: string;
  publicRewardId: string;
  epochId: string;
  epochNumber: number;
  publicEpochId: string;
  nodeId: string;
  publicNodeId: string;
  nodeNumber: number;
  ownerUserId: string;
  amount: number;
  currency: string;
  status: 'ACCRUED' | 'CLAIMED' | 'REVERSED';
  accruedAt: string;
  claimedAt: string | null;
  reversedAt?: string | null;
  createdAt: string;
}

interface RewardsTelemetry {
  totalAccrued: number;
  totalClaimed: number;
  totalRewards: number;
  latestEpoch: {
    id?: string;
    publicEpochId: string;
    epochNumber: number;
    rewardPerNode: number | null;
    status: string;
    settledAt: string | null;
  } | null;
  history: RewardHistoryItem[];
}

interface RewardsSummary {
  totalRewardsEarned: number;
  totalAccrued: number;
  totalClaimed: number;
  activeNodesCount: number;
  latestEpochNumber: number;
  latestSettlementTime: string | null;
}

interface NodeItem {
  publicNodeId: string;
  nodeNumber: number;
  status: string;
  activatedAt: string | null;
  totalRewards?: number;
  currentRewardState?: 'ACCRUED' | 'CLAIMED' | 'READY';
  latestRewardEpoch?: string | null;
}

interface TokenPriceData {
  priceUsd: number;
  coinSymbol: string;
  swapEnabled: boolean;
}

export const RewardsView: React.FC<RewardsViewProps> = ({ user: _user, onNavigateTab }) => {
  const [rewards, setRewards] = useState<RewardsTelemetry | null>(null);
  const [summary, setSummary] = useState<RewardsSummary | null>(null);
  const [nodes, setNodes] = useState<NodeItem[]>([]);
  const [tokenPrice, setTokenPrice] = useState<TokenPriceData>({
    priceUsd: 0.10,
    coinSymbol: 'PHIVO',
    swapEnabled: true,
  });

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [claimSuccessMsg, setClaimSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Filters and pagination
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACCRUED' | 'CLAIMED'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const itemsPerPage = 8;

  // Fetch authoritative rewards data from endpoints
  const fetchRewardsData = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    setErrorMsg(null);
    try {
      const [rewardsRes, historyRes, summaryRes, nodesRes, priceRes] = await Promise.all([
        fetch('/api/rewards/me', { credentials: 'include' }),
        fetch('/api/rewards/history', { credentials: 'include' }),
        fetch('/api/rewards/summary', { credentials: 'include' }),
        fetch('/api/nodes/me', { credentials: 'include' }),
        fetch('/api/economic/token-price'),
      ]);

      let historyItems: RewardHistoryItem[] = [];

      if (historyRes.ok) {
        const hData = await historyRes.json();
        if (Array.isArray(hData.history)) {
          historyItems = hData.history;
        }
      }

      if (rewardsRes.ok) {
        const rData = await rewardsRes.json();
        setRewards({
          ...rData,
          history: historyItems.length > 0 ? historyItems : rData.history || [],
        });
      } else {
        throw new Error('Failed to load rewards data');
      }

      if (summaryRes.ok) {
        const sData = await summaryRes.json();
        setSummary(sData);
      }

      if (nodesRes.ok) {
        const nData = await nodesRes.json();
        setNodes(nData.nodes || []);
      }

      if (priceRes.ok) {
        const pData = await priceRes.json();
        if (pData.priceUsd) {
          setTokenPrice({
            priceUsd: Number(pData.priceUsd),
            coinSymbol: pData.coinSymbol || 'PHIVO',
            swapEnabled: pData.swapEnabled ?? true,
          });
        }
      }
    } catch (err: any) {
      console.warn('[RewardsView] Error loading reward telemetry:', err);
      setErrorMsg(err.message || 'Unable to synchronize protocol reward data.');
    } finally {
      setLoading(false);
      if (isManual) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchRewardsData();
    const interval = setInterval(() => {
      fetchRewardsData(false);
    }, 20000);
    return () => clearInterval(interval);
  }, [fetchRewardsData]);

  // Claim action: Transitions ACCRUED -> CLAIMED server-side
  const handleClaimRewards = async () => {
    if (claiming) return;
    setClaiming(true);
    setClaimSuccessMsg(null);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/rewards/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to claim protocol rewards');
      }

      setClaimSuccessMsg(data.message || 'Accrued rewards claimed successfully.');
      await fetchRewardsData(true);
    } catch (err: any) {
      console.error('[RewardsView] Claim failed:', err);
      setErrorMsg(err.message || 'Reward claim could not be processed.');
    } finally {
      setClaiming(false);
    }
  };

  // Safe formatting helpers
  const formatCurrency = (val?: number | null) => {
    const num = Number(val || 0);
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const formatPhivo = (val?: number | null) => {
    const num = Number(val || 0);
    return num.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  };

  const formatDate = (isoString?: string | null) => {
    if (!isoString) return 'Pending / Open';
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return 'Invalid Date';
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Compute active node count
  const activeNodes = nodes.filter((n) => n.status === 'ACTIVE');
  const totalAccrued = summary?.totalAccrued ?? rewards?.totalAccrued ?? 0;
  const totalClaimed = summary?.totalClaimed ?? rewards?.totalClaimed ?? 0;
  const totalEarned = summary?.totalRewardsEarned ?? rewards?.totalRewards ?? 0;
  const rewardRate = rewards?.latestEpoch?.rewardPerNode ?? 2.50;
  const dailyProduction = activeNodes.length * (rewardRate || 2.50);
  const dailyProductionPhivo = tokenPrice.priceUsd > 0 ? dailyProduction / tokenPrice.priceUsd : 0;

  // Filter and stably sort history
  const historyList = rewards?.history || [];
  const filteredHistory = historyList
    .filter((item) => {
      if (statusFilter !== 'ALL' && item.status !== statusFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          item.publicRewardId.toLowerCase().includes(q) ||
          item.publicEpochId.toLowerCase().includes(q) ||
          item.publicNodeId.toLowerCase().includes(q) ||
          `node #${item.nodeNumber}`.toLowerCase().includes(q)
        );
      }
      return true;
    })
    .sort((a, b) => {
      // 1. Stable Sort by Accrued Date DESC
      const timeA = new Date(a.accruedAt).getTime();
      const timeB = new Date(b.accruedAt).getTime();
      if (timeB !== timeA) {
        return timeB - timeA;
      }
      // 2. Stable Sort by Epoch Number DESC
      if ((b.epochNumber || 0) !== (a.epochNumber || 0)) {
        return (b.epochNumber || 0) - (a.epochNumber || 0);
      }
      // 3. Stable Sort by Public Reward ID ASC
      return a.publicRewardId.localeCompare(b.publicRewardId);
    });

  const totalPages = Math.ceil(filteredHistory.length / itemsPerPage) || 1;
  const paginatedHistory = filteredHistory.slice(
    (page - 1) * itemsPerPage,
    page * itemsPerPage
  );

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* 1. Header Banner & Action Bar */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#07101D] via-[#0A1628] to-[#040914] border border-white/[0.08] p-6 sm:p-8 shadow-2xl">
        {/* Glow decorative effects */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-[#00CFFF]/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
        <div className="absolute bottom-0 left-1/3 w-64 h-64 bg-[#32D583]/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#00CFFF]/10 border border-[#00CFFF]/30 text-[#00CFFF] text-xs font-mono">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Genesis Mining Protocol</span>
              </div>

              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#32D583]/10 border border-[#32D583]/30 text-[#32D583] text-xs font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-[#32D583] animate-pulse" />
                <span>Consensus Live</span>
              </div>

              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/[0.08] text-[#98A2B3] text-xs font-mono">
                <span>Epoch #{summary?.latestEpochNumber || rewards?.latestEpoch?.epochNumber || 1}</span>
              </div>
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Genesis Node Mining Rewards Hub
            </h1>

            <p className="text-sm text-[#98A2B3] leading-relaxed">
              Real-time telemetry, authoritative epoch distributions, and claim engine for your active PHIVONEX Genesis Nodes. Rewards are settled each epoch directly onto the cryptographic protocol ledger.
            </p>
          </div>

          {/* Quick Action Controls */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => fetchRewardsData(true)}
              disabled={refreshing}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-white text-xs font-mono transition-all cursor-pointer min-h-[44px] disabled:opacity-50"
              title="Refresh Telemetry"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-[#00CFFF]' : 'text-[#98A2B3]'}`} />
              <span>{refreshing ? 'Syncing...' : 'Sync Data'}</span>
            </button>

            <button
              onClick={() => onNavigateTab('swap')}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#168BFF]/15 hover:bg-[#168BFF]/25 border border-[#168BFF]/30 text-[#00CFFF] text-xs font-bold transition-all cursor-pointer min-h-[44px]"
            >
              <ArrowLeftRight className="w-4 h-4" />
              <span>Coin Swap</span>
            </button>

            <button
              onClick={handleClaimRewards}
              disabled={claiming || totalAccrued <= 0}
              className={`inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer min-h-[44px] shadow-lg ${
                totalAccrued > 0
                  ? 'bg-gradient-to-r from-[#00CFFF] to-[#168BFF] text-[#05070B] hover:brightness-110 shadow-[#00CFFF]/20'
                  : 'bg-white/[0.05] text-[#98A2B3] border border-white/[0.08] cursor-not-allowed opacity-60'
              }`}
            >
              {claiming ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Processing Claim...</span>
                </>
              ) : (
                <>
                  <Coins className="w-4 h-4" />
                  <span>Claim All (${formatCurrency(totalAccrued)})</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Feedback Alert Banners */}
        {claimSuccessMsg && (
          <div className="mt-6 p-4 rounded-xl bg-[#32D583]/10 border border-[#32D583]/30 text-[#32D583] text-xs flex items-center justify-between gap-3 animate-fadeIn">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{claimSuccessMsg}</span>
            </div>
            <button
              onClick={() => setClaimSuccessMsg(null)}
              className="text-[#32D583]/70 hover:text-[#32D583] text-xs font-mono underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {errorMsg && (
          <div className="mt-6 p-4 rounded-xl bg-[#F04438]/10 border border-[#F04438]/30 text-[#F04438] text-xs flex items-center justify-between gap-3 animate-fadeIn">
            <div className="flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
            <button
              onClick={() => setErrorMsg(null)}
              className="text-[#F04438]/70 hover:text-[#F04438] text-xs font-mono underline"
            >
              Dismiss
            </button>
          </div>
        )}
      </div>

      {/* 2. Key Performance Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Unclaimed / Accrued Rewards */}
        <div className="p-5 rounded-2xl bg-[#07101D] border border-white/[0.08] shadow-lg relative overflow-hidden group hover:border-[#00CFFF]/40 transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-[#00CFFF]/5 rounded-full blur-xl pointer-events-none group-hover:bg-[#00CFFF]/10 transition-all" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-[#98A2B3] uppercase tracking-wider">Unclaimed Accrued</span>
            <div className="w-8 h-8 rounded-lg bg-[#00CFFF]/10 flex items-center justify-center text-[#00CFFF]">
              <Zap className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-extrabold text-white tracking-tight font-mono">
              ${formatCurrency(totalAccrued)}
            </div>
            <div className="text-[11px] text-[#00CFFF] mt-1 font-mono flex items-center gap-1">
              <span>Ready for immediate claim</span>
            </div>
          </div>
        </div>

        {/* Claimed Rewards */}
        <div className="p-5 rounded-2xl bg-[#07101D] border border-white/[0.08] shadow-lg relative overflow-hidden group hover:border-[#32D583]/40 transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-[#32D583]/5 rounded-full blur-xl pointer-events-none group-hover:bg-[#32D583]/10 transition-all" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-[#98A2B3] uppercase tracking-wider">Total Claimed</span>
            <div className="w-8 h-8 rounded-lg bg-[#32D583]/10 flex items-center justify-center text-[#32D583]">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-extrabold text-white tracking-tight font-mono">
              ${formatCurrency(totalClaimed)}
            </div>
            <div className="text-[11px] text-[#98A2B3] mt-1 font-mono">
              Settled to user wallet ledger
            </div>
          </div>
        </div>

        {/* Lifetime Rewards Earned */}
        <div className="p-5 rounded-2xl bg-[#07101D] border border-white/[0.08] shadow-lg relative overflow-hidden group hover:border-white/[0.2] transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-[#98A2B3] uppercase tracking-wider">Lifetime Mining</span>
            <div className="w-8 h-8 rounded-lg bg-white/[0.05] flex items-center justify-center text-white">
              <Coins className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-extrabold text-white tracking-tight font-mono">
              ${formatCurrency(totalEarned)}
            </div>
            <div className="text-[11px] text-[#98A2B3] mt-1 font-mono">
              Cumulative production value
            </div>
          </div>
        </div>

        {/* Active Genesis Nodes & Mining Rate */}
        <div className="p-5 rounded-2xl bg-[#07101D] border border-white/[0.08] shadow-lg relative overflow-hidden group hover:border-[#00CFFF]/40 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-[#98A2B3] uppercase tracking-wider">Active Genesis Nodes</span>
            <div className="w-8 h-8 rounded-lg bg-[#00CFFF]/10 flex items-center justify-center text-[#00CFFF]">
              <Server className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-extrabold text-[#00CFFF] tracking-tight font-mono flex items-baseline gap-2">
              <span>{activeNodes.length}</span>
              <span className="text-xs text-[#98A2B3] font-normal">/ {nodes.length} Total</span>
            </div>
            <div className="text-[11px] text-[#32D583] mt-1 font-mono">
              +${formatCurrency(dailyProduction)} / epoch cadence
            </div>
          </div>
        </div>
      </div>

      {/* 3. Mining Mechanics & Protocol Telemetry Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Production Rate Card */}
        <div className="p-6 rounded-2xl bg-[#07101D] border border-white/[0.08] space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#00CFFF]/10 flex items-center justify-center text-[#00CFFF]">
                <TrendingUp className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-bold text-white">Emission Telemetry</h3>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#00CFFF]/10 text-[#00CFFF] border border-[#00CFFF]/20">
              Epoch Base
            </span>
          </div>

          <div className="space-y-3 font-mono text-xs">
            <div className="flex items-center justify-between py-1 border-b border-white/[0.04]">
              <span className="text-[#98A2B3]">Rate Per Node / Epoch:</span>
              <span className="text-white font-bold">${formatCurrency(rewardRate)} USD</span>
            </div>

            <div className="flex items-center justify-between py-1 border-b border-white/[0.04]">
              <span className="text-[#98A2B3]">Current PHIVO Oracle Price:</span>
              <span className="text-[#00CFFF] font-bold">${formatCurrency(tokenPrice.priceUsd)} USDT</span>
            </div>

            <div className="flex items-center justify-between py-1 border-b border-white/[0.04]">
              <span className="text-[#98A2B3]">PHIVO Yield Per Node:</span>
              <span className="text-white font-bold">
                {tokenPrice.priceUsd > 0 ? (rewardRate / tokenPrice.priceUsd).toFixed(2) : '25.00'} PHIVO
              </span>
            </div>

            <div className="flex items-center justify-between py-1 border-b border-white/[0.04]">
              <span className="text-[#98A2B3]">Est. Daily Production:</span>
              <span className="text-[#32D583] font-bold">
                ~{dailyProductionPhivo.toFixed(2)} PHIVO (${formatCurrency(dailyProduction)})
              </span>
            </div>

            <div className="flex items-center justify-between py-1">
              <span className="text-[#98A2B3]">Consensus Cadence:</span>
              <span className="text-white">24-Hour Epoch Cycle</span>
            </div>
          </div>

          <div className="pt-2">
            <button
              onClick={() => onNavigateTab('swap')}
              className="w-full py-2.5 px-4 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-white border border-white/[0.08] text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer min-h-[44px]"
            >
              <span>Instant Swap Accrued to USDT</span>
              <ArrowRight className="w-3.5 h-3.5 text-[#00CFFF]" />
            </button>
          </div>
        </div>

        {/* Latest Epoch Status & Consensus Card */}
        <div className="p-6 rounded-2xl bg-[#07101D] border border-white/[0.08] space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#32D583]/10 flex items-center justify-center text-[#32D583]">
                <Activity className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-bold text-white">Consensus & Epoch</h3>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#32D583]/10 text-[#32D583] border border-[#32D583]/20">
              Consensus Node
            </span>
          </div>

          <div className="space-y-3 font-mono text-xs">
            <div className="flex items-center justify-between py-1 border-b border-white/[0.04]">
              <span className="text-[#98A2B3]">Latest Public Epoch:</span>
              <span className="text-[#00CFFF] font-bold">
                {rewards?.latestEpoch?.publicEpochId || `EP-${String(summary?.latestEpochNumber || 1).padStart(4, '0')}`}
              </span>
            </div>

            <div className="flex items-center justify-between py-1 border-b border-white/[0.04]">
              <span className="text-[#98A2B3]">Epoch Status:</span>
              <span className="text-[#32D583] font-bold">
                {rewards?.latestEpoch?.status || 'SETTLED / OPEN'}
              </span>
            </div>

            <div className="flex items-center justify-between py-1 border-b border-white/[0.04]">
              <span className="text-[#98A2B3]">Last Settlement Timestamp:</span>
              <span className="text-white text-[11px]">
                {formatDate(summary?.latestSettlementTime || rewards?.latestEpoch?.settledAt)}
              </span>
            </div>

            <div className="flex items-center justify-between py-1 border-b border-white/[0.04]">
              <span className="text-[#98A2B3]">Settlement Mechanism:</span>
              <span className="text-white">Server-Authoritative Ledger</span>
            </div>

            <div className="flex items-center justify-between py-1">
              <span className="text-[#98A2B3]">Double-Claim Protection:</span>
              <span className="text-[#32D583] flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" /> Enforced
              </span>
            </div>
          </div>

          <div className="pt-2">
            <button
              onClick={() => onNavigateTab('node-health')}
              className="w-full py-2.5 px-4 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-white border border-white/[0.08] text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer min-h-[44px]"
            >
              <span>View Node Health Telemetry</span>
              <ChevronRight className="w-3.5 h-3.5 text-[#98A2B3]" />
            </button>
          </div>
        </div>

        {/* Halving & Emission Schedule Card */}
        <div className="p-6 rounded-2xl bg-[#07101D] border border-white/[0.08] space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-400">
                <Clock className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-bold text-white">Halving & Supply Schedule</h3>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
              Era 1 (Genesis)
            </span>
          </div>

          <div className="space-y-3 font-mono text-xs">
            <div className="flex items-center justify-between py-1 border-b border-white/[0.04]">
              <span className="text-[#98A2B3]">Total Genesis Cap:</span>
              <span className="text-white font-bold">5,000 Nodes Hard-Capped</span>
            </div>

            <div className="flex items-center justify-between py-1 border-b border-white/[0.04]">
              <span className="text-[#98A2B3]">Emission Decay Model:</span>
              <span className="text-white">Quarterly Halving Algorithm</span>
            </div>

            <div className="flex items-center justify-between py-1 border-b border-white/[0.04]">
              <span className="text-[#98A2B3]">Reward Token:</span>
              <span className="text-[#00CFFF] font-bold">PHIVO (BSC-Compatible)</span>
            </div>

            <div className="flex items-center justify-between py-1 border-b border-white/[0.04]">
              <span className="text-[#98A2B3]">Eligibility Rule:</span>
              <span className="text-white">Node Status: ACTIVE</span>
            </div>

            <div className="flex items-center justify-between py-1">
              <span className="text-[#98A2B3]">Next Halving Check:</span>
              <span className="text-amber-400 font-bold">Epoch #90 (Mainnet)</span>
            </div>
          </div>

          <div className="pt-2">
            <button
              onClick={() => onNavigateTab('nodes')}
              className="w-full py-2.5 px-4 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-white border border-white/[0.08] text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer min-h-[44px]"
            >
              <span>Manage Genesis Nodes ({nodes.length})</span>
              <Server className="w-3.5 h-3.5 text-[#00CFFF]" />
            </button>
          </div>
        </div>
      </div>

      {/* 4. Active Node Allocation & Reward Breakdown Table */}
      <div className="rounded-3xl bg-[#07101D] border border-white/[0.08] overflow-hidden shadow-xl">
        <div className="p-6 border-b border-white/[0.08] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Server className="w-4 h-4 text-[#00CFFF]" />
              <h3 className="text-base font-bold text-white">Your Genesis Node Portfolio</h3>
            </div>
            <p className="text-xs text-[#98A2B3]">
              Individual node status and participation in the reward consensus protocol.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => onNavigateTab('nodes/buy')}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#00CFFF]/10 hover:bg-[#00CFFF]/20 border border-[#00CFFF]/30 text-[#00CFFF] text-xs font-bold transition-all cursor-pointer min-h-[40px]"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Acquire Additional Nodes</span>
            </button>
          </div>
        </div>

        {nodes.length === 0 ? (
          <div className="p-12 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-white/[0.04] border border-white/[0.08] mx-auto flex items-center justify-center text-[#98A2B3]">
              <Server className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-white">No Genesis Nodes Activated</h4>
              <p className="text-xs text-[#98A2B3] max-w-md mx-auto">
                You currently do not have any active Genesis Nodes earning protocol mining rewards. Activate a node to participate in daily epoch distributions.
              </p>
            </div>
            <button
              onClick={() => onNavigateTab('nodes/buy')}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#00CFFF] to-[#168BFF] text-[#05070B] text-xs font-bold shadow-lg shadow-[#00CFFF]/20 cursor-pointer min-h-[44px]"
            >
              <span>Acquire Genesis Node</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-[#98A2B3]">
              <thead className="bg-white/[0.02] border-b border-white/[0.06] text-[11px] font-mono uppercase text-[#98A2B3]">
                <tr>
                  <th className="px-6 py-4">Node Identifier</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Activated At</th>
                  <th className="px-6 py-4">Total Generated</th>
                  <th className="px-6 py-4">Reward State</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {nodes.map((node) => {
                  const isActive = node.status === 'ACTIVE';
                  return (
                    <tr key={node.publicNodeId} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-6 py-4 font-mono">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`w-2.5 h-2.5 rounded-full ${
                              isActive ? 'bg-[#32D583] shadow-sm shadow-[#32D583]' : 'bg-[#98A2B3]'
                            }`}
                          />
                          <div>
                            <div className="text-white font-bold">{node.publicNodeId}</div>
                            <div className="text-[10px] text-[#98A2B3]">Node #{node.nodeNumber}</div>
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono uppercase ${
                            isActive
                              ? 'bg-[#32D583]/10 text-[#32D583] border border-[#32D583]/20'
                              : 'bg-white/[0.04] text-[#98A2B3] border border-white/[0.08]'
                          }`}
                        >
                          {isActive && <span className="w-1.5 h-1.5 rounded-full bg-[#32D583] animate-pulse" />}
                          {node.status}
                        </span>
                      </td>

                      <td className="px-6 py-4 font-mono text-[11px]">
                        {formatDate(node.activatedAt)}
                      </td>

                      <td className="px-6 py-4 font-mono text-white font-semibold">
                        ${formatCurrency(node.totalRewards || 0)}
                      </td>

                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono ${
                            node.currentRewardState === 'ACCRUED'
                              ? 'bg-[#00CFFF]/10 text-[#00CFFF] border border-[#00CFFF]/20'
                              : 'bg-white/[0.04] text-[#98A2B3]'
                          }`}
                        >
                          {node.currentRewardState || (isActive ? 'EARNING' : 'INACTIVE')}
                        </span>
                      </td>

                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => onNavigateTab('node-health')}
                          className="text-[#00CFFF] hover:text-white transition-colors font-mono text-xs inline-flex items-center gap-1 cursor-pointer"
                        >
                          <span>Telemetry</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 5. Authoritative Reward Distribution Ledger & History */}
      <div className="rounded-3xl bg-[#07101D] border border-white/[0.08] overflow-hidden shadow-xl space-y-6 p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Coins className="w-4 h-4 text-[#00CFFF]" />
              <h3 className="text-base font-bold text-white">Epoch Settlement & Distribution Ledger</h3>
            </div>
            <p className="text-xs text-[#98A2B3]">
              Immutable audit log of all epoch mining rewards earned by your Genesis Nodes.
            </p>
          </div>

          {/* Filter Bar & Search */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center rounded-xl bg-white/[0.03] border border-white/[0.08] p-1">
              {(['ALL', 'ACCRUED', 'CLAIMED'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => {
                    setStatusFilter(tab);
                    setPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all cursor-pointer ${
                    statusFilter === tab
                      ? 'bg-[#00CFFF]/15 text-[#00CFFF] font-bold shadow-sm'
                      : 'text-[#98A2B3] hover:text-white'
                  }`}
                >
                  {tab === 'ALL' ? 'All' : tab === 'ACCRUED' ? 'Unclaimed' : 'Claimed'}
                </button>
              ))}
            </div>

            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="Search Epoch / Node ID..."
                className="w-48 sm:w-60 px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-xs placeholder-[#98A2B3] focus:outline-none focus:border-[#00CFFF]/50 font-mono"
              />
            </div>
          </div>
        </div>

        {/* History Table */}
        {filteredHistory.length === 0 ? (
          <div className="py-12 text-center space-y-2 border border-white/[0.04] rounded-2xl bg-white/[0.01]">
            <Info className="w-6 h-6 text-[#98A2B3] mx-auto opacity-40" />
            <p className="text-xs text-[#98A2B3]">
              {historyList.length === 0
                ? 'No epoch distribution records found on your operator account yet.'
                : 'No distribution records match the selected filter criteria.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-[#98A2B3]">
              <thead className="bg-white/[0.02] border-b border-white/[0.06] text-[11px] font-mono uppercase text-[#98A2B3]">
                <tr>
                  <th className="px-4 py-3">Public Reward ID</th>
                  <th className="px-4 py-3">Epoch</th>
                  <th className="px-4 py-3">Source Node</th>
                  <th className="px-4 py-3">Reward Amount</th>
                  <th className="px-4 py-3">Distribution State</th>
                  <th className="px-4 py-3">Accrued Date</th>
                  <th className="px-4 py-3">Claimed Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {paginatedHistory.map((item) => {
                  const isAccrued = item.status === 'ACCRUED';
                  const isClaimed = item.status === 'CLAIMED';
                  const isReversed = item.status === 'REVERSED';

                  return (
                    <tr key={item.id} className="hover:bg-white/[0.02] transition-colors font-mono">
                      <td className="px-4 py-3 text-white font-semibold">{item.publicRewardId}</td>

                      <td className="px-4 py-3 text-[#00CFFF]">
                        {item.publicEpochId || `EP-${String(item.epochNumber).padStart(4, '0')}`}
                      </td>

                      <td className="px-4 py-3 text-white">
                        <div className="flex items-center gap-1.5">
                          <Server className="w-3 h-3 text-[#98A2B3]" />
                          <span>{item.publicNodeId}</span>
                        </div>
                      </td>

                      <td className="px-4 py-3 text-white font-bold">
                        ${formatCurrency(item.amount)} {item.currency}
                      </td>

                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            isAccrued
                              ? 'bg-[#00CFFF]/10 text-[#00CFFF] border border-[#00CFFF]/30'
                              : isClaimed
                              ? 'bg-[#32D583]/10 text-[#32D583] border border-[#32D583]/30'
                              : 'bg-[#F04438]/10 text-[#F04438] border border-[#F04438]/30'
                          }`}
                        >
                          {isAccrued ? (
                            <>
                              <Clock className="w-3 h-3" /> Unclaimed
                            </>
                          ) : isClaimed ? (
                            <>
                              <Check className="w-3 h-3" /> Claimed
                            </>
                          ) : (
                            <>
                              <AlertCircle className="w-3 h-3" /> Reversed
                            </>
                          )}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-[11px] text-[#98A2B3]">
                        {formatDate(item.accruedAt)}
                      </td>

                      <td className="px-4 py-3 text-[11px] text-[#98A2B3]">
                        {item.claimedAt ? formatDate(item.claimedAt) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Controls */}
        {filteredHistory.length > itemsPerPage && (
          <div className="flex items-center justify-between pt-4 border-t border-white/[0.06] text-xs font-mono text-[#98A2B3]">
            <div>
              Showing {Math.min((page - 1) * itemsPerPage + 1, filteredHistory.length)} to{' '}
              {Math.min(page * itemsPerPage, filteredHistory.length)} of {filteredHistory.length} rewards
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-white disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-all"
              >
                Previous
              </button>
              <span>
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-white disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-all"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 6. Quick Actions Footer Card */}
      <div className="p-6 rounded-3xl bg-gradient-to-r from-[#07101D] to-[#0D1B2E] border border-white/[0.08] flex flex-col sm:flex-row items-center justify-between gap-6">
        <div className="space-y-1 text-center sm:text-left">
          <h4 className="text-sm font-bold text-white">Looking to convert or optimize your rewards?</h4>
          <p className="text-xs text-[#98A2B3]">
            Swap your accrued or claimed PHIVO tokens to USDT at zero slippage using the internal protocol oracle.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => onNavigateTab('swap')}
            className="px-5 py-2.5 rounded-xl bg-[#00CFFF] hover:bg-[#00CFFF]/90 text-[#05070B] text-xs font-bold transition-all cursor-pointer min-h-[44px] flex items-center gap-2 shadow-lg shadow-[#00CFFF]/10"
          >
            <ArrowLeftRight className="w-4 h-4" />
            <span>Launch Coin Swap</span>
          </button>
        </div>
      </div>
    </div>
  );
};
