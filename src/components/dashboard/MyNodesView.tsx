import React, { useState, useEffect, useCallback } from 'react';
import {
  Server,
  Layers,
  Coins,
  RefreshCw,
  Clock,
  CheckCircle2,
  AlertCircle,
  Activity,
  Plus,
  ArrowRight,
  Sparkles,
  Zap,
  Check,
  ShieldCheck,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import { UserProfile } from '../../context/AuthContext';
import { GENESIS_NODE_CAP, NODE_BASE_PRICE_USD } from '../../config/nodeConfig';
import { GenesisEngineAnimation } from '../GenesisEngineAnimation';

interface MyNodesViewProps {
  user: UserProfile;
  onNavigateTab: (tab: string) => void;
}

interface NodeItem {
  publicNodeId: string;
  nodeNumber: number;
  status: string;
  productVersion?: string;
  purchasePriceUsd?: number;
  phivoReferencePriceAtPurchase?: number;
  lifetimePhivoAllocation?: number;
  termDays?: number;
  dailyPhivoEmission?: number;
  purchaseTimestamp?: string | null;
  activatedAt: string | null;
  maturityTimestamp?: string | null;
  distributedPhivo?: number;
  remainingPhivo?: number;
  progressPercent?: number;
  currentDay?: number;
  totalRewards?: number;
  currentRewardState?: 'ACCRUED' | 'CLAIMED' | 'READY';
  latestRewardEpoch?: string | null;
}

interface NodeOrder {
  publicOrderId: string;
  publicNodeId: string;
  nodeNumber: number;
  amountUsd: number;
  currency: string;
  status: 'PENDING' | 'SETTLING' | 'COMPLETED' | 'CANCELLED' | 'EXPIRED' | 'FAILED';
  createdAt: string;
  secondsRemaining: number;
}

interface NodeStats {
  genesisCap: number;
  basePriceUsd: number;
  available: number;
  reserved: number;
  active: number;
  retired: number;
  allocated: number;
}

interface RewardHistoryItem {
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

interface RewardsTelemetry {
  totalAccrued: number;
  totalClaimed: number;
  totalRewards: number;
  latestEpoch: {
    publicEpochId: string;
    epochNumber: number;
    rewardPerNode: number;
    status: string;
    settledAt: string | null;
  } | null;
  history: RewardHistoryItem[];
}

export const MyNodesView: React.FC<MyNodesViewProps> = ({ user: _user, onNavigateTab }) => {
  const [nodes, setNodes] = useState<NodeItem[]>([]);
  const [orders, setOrders] = useState<NodeOrder[]>([]);
  const [stats, setStats] = useState<NodeStats | null>(null);
  const [rewards, setRewards] = useState<RewardsTelemetry | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [claimSuccessMsg, setClaimSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchNodeData = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    setErrorMsg(null);
    try {
      const [nodesRes, statsRes, ordersRes, rewardsRes] = await Promise.all([
        fetch('/api/nodes/me', { credentials: 'include' }),
        fetch('/api/nodes/stats'),
        fetch('/api/node-orders/me', { credentials: 'include' }),
        fetch('/api/rewards/me', { credentials: 'include' }),
      ]);

      if (nodesRes.ok) {
        const nodesData = await nodesRes.json();
        setNodes(nodesData.nodes || []);
      }

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }

      if (ordersRes.ok) {
        const ordersData = await ordersRes.json();
        setOrders(ordersData.orders || []);
      }

      if (rewardsRes.ok) {
        const rewardsData = await rewardsRes.json();
        setRewards(rewardsData);
      }
    } catch (err) {
      console.warn('[MyNodesView] Failed to load node data:', err);
      setErrorMsg('Unable to refresh node data.');
    } finally {
      setLoading(false);
      if (isManual) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchNodeData();
    const interval = setInterval(() => {
      fetchNodeData(false);
    }, 20000);
    return () => clearInterval(interval);
  }, [fetchNodeData]);

  const handleClaim = async () => {
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
        throw new Error(data.message || 'Failed to claim rewards');
      }
      setClaimSuccessMsg(data.message || 'Rewards claimed successfully.');
      await fetchNodeData(true);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error occurred while claiming rewards.');
    } finally {
      setClaiming(false);
    }
  };

  const formatDate = (isoString?: string | null) => {
    if (!isoString) return 'Pending Activation';
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return 'Not Available';
      return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return 'Not Available';
    }
  };

  const activeNodes = nodes.filter((n) => n.status === 'ACTIVE');
  const basePrice = stats?.basePriceUsd ?? NODE_BASE_PRICE_USD;

  return (
    <div className="space-y-6 sm:space-y-8 animate-fadeIn pb-12">
      {/* ========================================================
          1. COMPACT PAGE HERO
         ======================================================== */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#07101D] via-[#0B1728] to-[#07101D] border border-white/[0.08] p-5 sm:p-7 shadow-xl">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-72 h-72 bg-[#00CFFF]/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-[#00CFFF]/10 border border-[#00CFFF]/25 text-[#00CFFF] text-[11px] font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-[#00CFFF]" />
                Genesis Phase
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.08] text-[#98A2B3] text-[11px] font-mono">
                Cap: {GENESIS_NODE_CAP.toLocaleString()} Nodes
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              My Genesis Nodes
            </h1>
            <p className="text-xs sm:text-sm text-[#98A2B3] max-w-2xl leading-relaxed">
              Manage your PHIVONEX Genesis Nodes, activation status, and node rewards.
            </p>
          </div>

          {/* Action CTAs & Refresh Button */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0 self-start md:self-auto">
            <button
              type="button"
              onClick={() => onNavigateTab('node-health')}
              className="px-3.5 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-xs font-semibold text-white flex items-center gap-1.5 transition-all cursor-pointer min-h-[44px]"
            >
              <Activity className="w-3.5 h-3.5 text-[#00CFFF]" />
              <span>Node Health</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigateTab('nodes/buy')}
              className="px-4 py-2 rounded-xl bg-[#00CFFF] hover:bg-[#00CFFF]/90 text-[#05070B] font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-md shadow-[#00CFFF]/20 min-h-[44px]"
            >
              <Plus className="w-4 h-4" />
              <span>Activate Genesis Node</span>
            </button>

            <button
              type="button"
              onClick={() => fetchNodeData(true)}
              disabled={refreshing}
              className="p-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-[#98A2B3] hover:text-white transition-colors cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center disabled:opacity-50"
              title="Refresh Node Data"
              aria-label="Refresh Node Data"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-[#00CFFF] ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Notifications / Feedback */}
      {errorMsg && (
        <div className="p-4 rounded-xl bg-[#F04438]/10 border border-[#F04438]/30 text-[#F04438] text-xs flex items-center gap-3 animate-fadeIn">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {claimSuccessMsg && (
        <div className="p-4 rounded-xl bg-[#32D583]/10 border border-[#32D583]/30 text-[#32D583] text-xs flex items-center gap-3 animate-fadeIn">
          <Check className="w-4 h-4 shrink-0" />
          <span>{claimSuccessMsg}</span>
        </div>
      )}

      {/* ========================================================
          2. COMPACT NODE SUMMARY GRID (4 Cards)
         ======================================================== */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Card 1: Genesis Cap */}
        <div className="p-4 sm:p-5 rounded-2xl bg-[#07101D] border border-white/[0.08] shadow-lg flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-[#98A2B3] mb-2">
            <span className="font-medium text-[11px] uppercase tracking-wider">Genesis Node Cap</span>
            <div className="w-7 h-7 rounded-lg bg-[#00CFFF]/10 border border-[#00CFFF]/20 flex items-center justify-center text-[#00CFFF]">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-mono font-bold text-white tabular-nums">
              {(stats?.genesisCap ?? GENESIS_NODE_CAP).toLocaleString()}
            </div>
            <div className="text-[11px] text-[#98A2B3] mt-1">
              Fixed protocol supply
            </div>
          </div>
        </div>

        {/* Card 2: Network Health */}
        <div className="p-4 sm:p-5 rounded-2xl bg-[#07101D] border border-white/[0.08] shadow-lg flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-[#98A2B3] mb-2">
            <span className="font-medium text-[11px] uppercase tracking-wider">Network Health</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-[#32D583]">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-mono font-bold text-[#32D583] flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#32D583] animate-pulse" />
              Optimal (100%)
            </div>
            <div className="text-[11px] text-[#98A2B3] mt-1">
              Active Decentralized Consensus
            </div>
          </div>
        </div>

        {/* Card 3: My Nodes */}
        <div className="p-4 sm:p-5 rounded-2xl bg-[#07101D] border border-white/[0.08] shadow-lg flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-[#98A2B3] mb-2">
            <span className="font-medium text-[11px] uppercase tracking-wider">My Nodes</span>
            <div className="w-7 h-7 rounded-lg bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-white">
              <Server className="w-4 h-4 text-[#00CFFF]" />
            </div>
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-mono font-bold text-white tabular-nums">
              {nodes.length}
            </div>
            <div className="text-[11px] text-[#98A2B3] mt-1">
              Registered to your account
            </div>
          </div>
        </div>

        {/* Card 4: Active Nodes */}
        <div className="p-4 sm:p-5 rounded-2xl bg-[#07101D] border border-white/[0.08] shadow-lg flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-[#98A2B3] mb-2">
            <span className="font-medium text-[11px] uppercase tracking-wider">Active Nodes</span>
            <div className="w-7 h-7 rounded-lg bg-[#32D583]/10 border border-[#32D583]/20 flex items-center justify-center text-[#32D583]">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-mono font-bold text-[#32D583] tabular-nums">
              {activeNodes.length}
            </div>
            <div className="flex items-center gap-1 text-[11px] text-[#32D583] mt-1 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-[#32D583]" />
              <span>{activeNodes.length > 0 ? 'Active & Earning' : 'Ready to activate'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================
          3. CLEAN REWARD SUMMARY CARD
         ======================================================== */}
      <div className="p-5 sm:p-6 rounded-2xl bg-[#07101D] border border-white/[0.08] shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/[0.06] pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#00CFFF]/10 border border-[#00CFFF]/20 flex items-center justify-center text-[#00CFFF]">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Node Mining Rewards</h2>
              <p className="text-[11px] text-[#98A2B3]">Audited rewards earned from your active Genesis Nodes.</p>
            </div>
          </div>

          {(rewards?.totalAccrued ?? 0) > 0 && (
            <button
              type="button"
              onClick={handleClaim}
              disabled={claiming}
              className="px-4 py-2 rounded-xl bg-[#00CFFF] hover:bg-[#00CFFF]/90 text-[#05070B] font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-md shadow-[#00CFFF]/20 min-h-[40px] shrink-0 disabled:opacity-50"
            >
              {claiming ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Claiming...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Claim Accrued (${(rewards?.totalAccrued ?? 0).toFixed(2)})</span>
                </>
              )}
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* Total Earned */}
          <div className="p-3.5 rounded-xl bg-[#05070B] border border-white/[0.06] space-y-1">
            <span className="text-[10px] text-[#98A2B3] uppercase tracking-wider font-mono block">Total Earned</span>
            <span className="text-base sm:text-lg font-mono font-bold text-[#00CFFF] tabular-nums block">
              ${(rewards?.totalRewards ?? 0).toFixed(2)} USD
            </span>
            <span className="text-[10px] text-[#98A2B3] block">All-time node rewards</span>
          </div>

          {/* Accrued */}
          <div className="p-3.5 rounded-xl bg-[#05070B] border border-white/[0.06] space-y-1">
            <span className="text-[10px] text-[#98A2B3] uppercase tracking-wider font-mono block">Accrued (Ready)</span>
            <span className="text-base sm:text-lg font-mono font-bold text-[#32D583] tabular-nums block">
              ${(rewards?.totalAccrued ?? 0).toFixed(2)} USD
            </span>
            <span className="text-[10px] text-[#98A2B3] block">Pending claim</span>
          </div>

          {/* Claimed */}
          <div className="p-3.5 rounded-xl bg-[#05070B] border border-white/[0.06] space-y-1">
            <span className="text-[10px] text-[#98A2B3] uppercase tracking-wider font-mono block">Claimed / Settled</span>
            <span className="text-base sm:text-lg font-mono font-bold text-white tabular-nums block">
              ${(rewards?.totalClaimed ?? 0).toFixed(2)} USD
            </span>
            <span className="text-[10px] text-[#98A2B3] block">Transferred to wallet</span>
          </div>

          {/* Latest Cycle */}
          <div className="p-3.5 rounded-xl bg-[#05070B] border border-white/[0.06] space-y-1">
            <span className="text-[10px] text-[#98A2B3] uppercase tracking-wider font-mono block">Latest Cycle</span>
            <span className="text-xs sm:text-sm font-mono font-semibold text-white truncate block">
              {rewards?.latestEpoch?.publicEpochId || 'None Yet'}
            </span>
            <span className="text-[10px] text-[#98A2B3] block">Last reward distribution</span>
          </div>
        </div>
      </div>

      {/* ========================================================
          4. OWNED NODE LIST / EMPTY STATE
         ======================================================== */}
      <div className="p-5 sm:p-6 rounded-2xl bg-[#07101D] border border-white/[0.08] shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#00CFFF]/10 border border-[#00CFFF]/20 flex items-center justify-center text-[#00CFFF]">
              <Server className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Your Genesis Nodes</h2>
              <p className="text-[11px] text-[#98A2B3]">Genesis nodes registered to your PHIVONEX account.</p>
            </div>
          </div>
          <span className="text-xs font-mono text-[#00CFFF] bg-[#00CFFF]/10 px-2.5 py-0.5 rounded-md border border-[#00CFFF]/20">
            {nodes.length} {nodes.length === 1 ? 'Node' : 'Nodes'} Owned
          </span>
        </div>

        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-2 text-xs text-[#98A2B3]">
            <RefreshCw className="w-5 h-5 animate-spin text-[#00CFFF]" />
            <span>Loading nodes...</span>
          </div>
        ) : nodes.length === 0 ? (
          /* Compact Premium Empty State */
          <div className="py-10 px-4 rounded-xl bg-[#05070B] border border-dashed border-white/[0.1] text-center space-y-4 max-w-lg mx-auto">
            <div className="w-12 h-12 rounded-xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-center text-[#98A2B3] mx-auto">
              <Server className="w-6 h-6 text-[#00CFFF]" />
            </div>

            <div className="space-y-1.5">
              <h3 className="text-sm sm:text-base font-bold text-white">
                No Genesis Nodes Yet
              </h3>
              <p className="text-xs text-[#98A2B3] max-w-sm mx-auto leading-relaxed">
                Your Genesis Nodes will appear here after activation.
              </p>
            </div>

            <div className="pt-2 flex flex-wrap items-center justify-center gap-2.5">
              <button
                type="button"
                onClick={() => onNavigateTab('nodes/buy')}
                className="py-2.5 px-5 rounded-xl bg-[#00CFFF] hover:bg-[#00CFFF]/90 text-[#05070B] font-bold text-xs inline-flex items-center gap-1.5 transition-all cursor-pointer shadow-md shadow-[#00CFFF]/20 min-h-[44px]"
              >
                <span>Activate Genesis Node (${basePrice.toLocaleString()} USD)</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => onNavigateTab('node-health')}
                className="py-2.5 px-4 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer min-h-[44px]"
              >
                <span>Learn About Genesis Nodes</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Primary Genesis Engine Machinery Visualization */}
            {nodes[0] && (
              <GenesisEngineAnimation
                nodeNumber={nodes[0].nodeNumber}
                publicNodeId={nodes[0].publicNodeId}
                distributedPhivo={nodes[0].distributedPhivo ?? 0}
                remainingPhivo={nodes[0].remainingPhivo ?? 10000}
                currentDay={nodes[0].currentDay ?? 1}
                totalDays={nodes[0].termDays ?? 200}
                status={nodes[0].status}
                isEmitting={nodes[0].status === 'ACTIVE' || nodes[0].status === 'EMITTING'}
              />
            )}

            {/* Owned Node Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {nodes.map((node) => {
              const isActive = node.status === 'ACTIVE' || node.status === 'EMITTING';
              const isMatured = node.status === 'MATURED';
              const isPending = node.status === 'PENDING' || node.status === 'RESERVED';

              const price = node.purchasePriceUsd || 1000;
              const allocation = node.lifetimePhivoAllocation || 10000;
              const daily = node.dailyPhivoEmission || 50;
              const term = node.termDays || 200;
              const dist = node.distributedPhivo ?? 0;
              const rem = node.remainingPhivo ?? Math.max(0, allocation - dist);
              const progress = node.progressPercent ?? Math.min(100, Number(((dist / allocation) * 100).toFixed(2)));
              const day = node.currentDay ?? (isMatured ? 200 : Math.min(200, Math.floor(dist / daily) + 1));

              return (
                <div
                  key={node.publicNodeId}
                  className="p-4 sm:p-5 rounded-2xl bg-[#05070B] border border-white/[0.08] hover:border-[#00CFFF]/40 transition-all space-y-4 flex flex-col justify-between"
                >
                  {/* Top: Public ID & Status */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-[#00CFFF]/10 border border-[#00CFFF]/20 flex items-center justify-center text-[#00CFFF] shrink-0">
                        <Server className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <span className="text-xs font-mono font-bold text-white block truncate">
                          {node.publicNodeId}
                        </span>
                        <span className="text-[10px] font-mono text-[#98A2B3] block">
                          Node #{node.nodeNumber}
                        </span>
                      </div>
                    </div>

                    <span
                      className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded-full flex items-center gap-1 border shrink-0 ${
                        isMatured
                          ? 'bg-[#FDB022]/10 text-[#FDB022] border-[#FDB022]/30'
                          : isActive
                          ? 'bg-[#32D583]/10 text-[#32D583] border-[#32D583]/30'
                          : isPending
                          ? 'bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/30'
                          : 'bg-white/[0.05] text-[#98A2B3] border-white/[0.1]'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          isMatured ? 'bg-[#FDB022]' : isActive ? 'bg-[#32D583] animate-pulse' : 'bg-[#98A2B3]'
                        }`}
                      />
                      {isMatured ? 'MATURED' : isActive ? 'ACTIVE' : node.status}
                    </span>
                  </div>

                  {/* Node Launch Economics Telemetry (Section 11) */}
                  <div className="py-2.5 border-t border-b border-white/[0.06] space-y-2 text-xs font-mono">
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div>
                        <span className="text-[#98A2B3] text-[10px] block">PURCHASE PRICE</span>
                        <span className="text-white font-bold">${price.toLocaleString()} USD</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[#98A2B3] text-[10px] block">LIFETIME ALLOC</span>
                        <span className="text-[#00CFFF] font-bold">{allocation.toLocaleString()} PHIVO</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div>
                        <span className="text-[#98A2B3] text-[10px] block">DAILY EMISSION</span>
                        <span className="text-[#32D583] font-bold">{daily} PHIVO / Day</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[#98A2B3] text-[10px] block">REF DAILY VALUE</span>
                        <span className="text-white font-bold">$2.50 @ $0.10</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                      <div>
                        <span className="text-[#98A2B3] text-[10px] block">DISTRIBUTED</span>
                        <span className="text-[#00CFFF] font-bold">{dist.toLocaleString()} PHIVO</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[#98A2B3] text-[10px] block">REMAINING</span>
                        <span className="text-[#F7B27A] font-bold">{rem.toLocaleString()} PHIVO</span>
                      </div>
                    </div>

                    {/* Progress Bar (Section 12) */}
                    <div className="pt-2 space-y-1">
                      <div className="flex items-center justify-between text-[10px] text-[#98A2B3]">
                        <span>DAY {day} / {term}</span>
                        <span className="font-bold text-[#00CFFF]">{progress}%</span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-white/[0.08] overflow-hidden">
                        <div
                          className={`h-full transition-all duration-500 rounded-full ${
                            isMatured ? 'bg-[#FDB022]' : 'bg-gradient-to-r from-[#00CFFF] to-[#32D583]'
                          }`}
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[9px] text-[#667085] pt-0.5">
                        <span>Day 1</span>
                        <span>Day 50</span>
                        <span>Day 100</span>
                        <span>Day 150</span>
                        <span>Day 200</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-[#98A2B3] pt-1">
                      <span>Activated: {formatDate(node.activatedAt)}</span>
                      <span>Maturity: {formatDate(node.maturityTimestamp || node.activatedAt)}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => onNavigateTab('node-health')}
                      className="w-full py-2 px-3 rounded-lg bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.06] text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer min-h-[38px]"
                    >
                      <Activity className="w-3.5 h-3.5 text-[#00CFFF]" />
                      <span>Node Health Details</span>
                    </button>
                  </div>
                </div>
              );
            })}
            </div>
          </div>
        )}
      </div>

      {/* ========================================================
          5. NODE REWARD HISTORY
         ======================================================== */}
      <div className="p-5 sm:p-6 rounded-2xl bg-[#07101D] border border-white/[0.08] shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#00CFFF]/10 border border-[#00CFFF]/20 flex items-center justify-center text-[#00CFFF]">
              <Coins className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Node Reward History</h2>
              <p className="text-[11px] text-[#98A2B3]">Historical record of rewards earned by your active Genesis Nodes.</p>
            </div>
          </div>
          <span className="text-xs font-mono text-[#98A2B3]">
            {rewards?.history.length ?? 0} Events
          </span>
        </div>

        {loading ? (
          <div className="py-8 flex justify-center text-xs text-[#98A2B3]">
            <RefreshCw className="w-4 h-4 animate-spin text-[#00CFFF]" />
          </div>
        ) : !rewards?.history || rewards.history.length === 0 ? (
          <div className="py-8 text-center text-xs text-[#98A2B3] bg-[#05070B] rounded-xl border border-dashed border-white/[0.06] space-y-1">
            <Coins className="w-6 h-6 mx-auto text-[#98A2B3]/40 mb-1" />
            <p className="font-medium text-white">No node rewards recorded yet.</p>
            <p className="text-[11px] text-[#667085]">Active nodes will record rewards when scheduled distributions occur.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/[0.06] text-[#98A2B3] font-mono text-[10px] uppercase">
                  <th className="pb-3 font-semibold">Reward ID</th>
                  <th className="pb-3 font-semibold">Node ID</th>
                  <th className="pb-3 font-semibold">Cycle</th>
                  <th className="pb-3 font-semibold">Amount</th>
                  <th className="pb-3 font-semibold">Status</th>
                  <th className="pb-3 font-semibold text-right">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {rewards.history.slice(0, 10).map((item) => (
                  <tr key={item.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-3 font-mono text-white font-medium">{item.publicRewardId}</td>
                    <td className="py-3 font-mono text-[#00CFFF]">{item.publicNodeId}</td>
                    <td className="py-3 font-mono text-white">{item.publicEpochId}</td>
                    <td className="py-3 font-mono text-[#32D583] font-bold tabular-nums">
                      +${Number(item.amount).toFixed(2)} USD
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
                      {formatDate(item.accruedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ========================================================
          6. ORDERS & RESERVATIONS HISTORY (If Exists)
         ======================================================== */}
      {orders.length > 0 && (
        <div className="p-5 sm:p-6 rounded-2xl bg-[#07101D] border border-white/[0.08] shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-[#00CFFF]/10 border border-[#00CFFF]/20 flex items-center justify-center text-[#00CFFF]">
                <Clock className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-white">Node Orders &amp; Reservations</h2>
                <p className="text-[11px] text-[#98A2B3]">Record of node purchase orders and activation requests.</p>
              </div>
            </div>
            <button
              onClick={() => onNavigateTab('nodes/buy')}
              className="text-xs text-[#00CFFF] hover:text-white font-medium flex items-center gap-1 cursor-pointer transition-colors"
            >
              <span>Order Node</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/[0.06] text-[#98A2B3] font-mono text-[10px] uppercase">
                  <th className="pb-3 font-semibold">Order ID</th>
                  <th className="pb-3 font-semibold">Node ID</th>
                  <th className="pb-3 font-semibold">Amount</th>
                  <th className="pb-3 font-semibold">Status</th>
                  <th className="pb-3 font-semibold">Date</th>
                  <th className="pb-3 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {orders.map((ord) => (
                  <tr key={ord.publicOrderId} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-3 font-mono text-white">{ord.publicOrderId}</td>
                    <td className="py-3 font-mono text-[#00CFFF]">{ord.publicNodeId}</td>
                    <td className="py-3 font-mono text-white tabular-nums">${ord.amountUsd.toLocaleString()} USD</td>
                    <td className="py-3">
                      <span
                        className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded-full border inline-flex items-center gap-1 ${
                          ord.status === 'COMPLETED'
                            ? 'bg-[#32D583]/10 text-[#32D583] border-[#32D583]/30'
                            : ord.status === 'PENDING'
                            ? 'bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/30'
                            : 'bg-white/[0.05] text-[#98A2B3] border-white/[0.1]'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            ord.status === 'COMPLETED'
                              ? 'bg-[#32D583]'
                              : ord.status === 'PENDING'
                              ? 'bg-[#F59E0B]'
                              : 'bg-[#98A2B3]'
                          }`}
                        />
                        {ord.status}
                      </span>
                    </td>
                    <td className="py-3 text-[#98A2B3] font-mono text-[11px]">
                      {formatDate(ord.createdAt)}
                    </td>
                    <td className="py-3 text-right">
                      {ord.status === 'PENDING' && ord.secondsRemaining > 0 ? (
                        <button
                          type="button"
                          onClick={() => onNavigateTab('nodes/buy')}
                          className="text-[11px] font-mono text-[#F59E0B] hover:underline cursor-pointer"
                        >
                          Complete Payment ({ord.secondsRemaining}s)
                        </button>
                      ) : (
                        <span className="text-[11px] text-[#98A2B3] font-mono">Settled</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
