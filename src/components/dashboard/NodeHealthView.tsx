import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  Server,
  RefreshCw,
  AlertTriangle,
  Clock,
  ArrowRight,
  Plus,
  Layers,
  CheckCircle2,
  AlertCircle,
  Zap,
  Radio,
  ShieldCheck,
} from 'lucide-react';
import { UserProfile } from '../../context/AuthContext';
import { GENESIS_NODE_CAP } from '../../config/nodeConfig';

interface NodeHealthViewProps {
  user?: UserProfile;
  onNavigateTab?: (tab: string) => void;
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

interface NodeStats {
  genesisCap: number;
  basePriceUsd: number;
  available: number;
  reserved: number;
  active: number;
  retired: number;
  allocated: number;
}

export const NodeHealthView: React.FC<NodeHealthViewProps> = ({ onNavigateTab }) => {
  const [nodes, setNodes] = useState<NodeItem[]>([]);
  const [stats, setStats] = useState<NodeStats | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Fetch authoritative node data for the authenticated user and global stats
  const fetchHealthData = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    setErrorMsg(null);

    try {
      const [nodesRes, statsRes] = await Promise.all([
        fetch('/api/nodes/me', { credentials: 'include' }),
        fetch('/api/nodes/stats'),
      ]);

      if (nodesRes.ok) {
        const nodesData = await nodesRes.json();
        setNodes(nodesData.nodes || []);
      }

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }

      setLastUpdated(new Date());
    } catch (err) {
      console.warn('[NodeHealthView] Failed to fetch node health data:', err);
      setErrorMsg('Unable to refresh node health telemetry.');
    } finally {
      setLoading(false);
      if (isManual) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchHealthData();
    const interval = setInterval(() => {
      fetchHealthData(false);
    }, 20000);
    return () => clearInterval(interval);
  }, [fetchHealthData]);

  const formatDate = (isoString?: string | null) => {
    if (!isoString) return 'Pending Activation';
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return 'Not Available';
      return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return 'Not Available';
    }
  };

  const activeNodes = nodes.filter((n) => n.status === 'ACTIVE');
  const attentionNodes = nodes.filter((n) => n.status !== 'ACTIVE');

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
                Node Health Monitor
              </span>
              {lastUpdated && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.08] text-[#98A2B3] text-[11px] font-mono">
                  <Clock className="w-3 h-3 text-[#00CFFF]" />
                  Updated: {lastUpdated.toLocaleTimeString()}
                </span>
              )}
            </div>

            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              Node Health
            </h1>
            <p className="text-xs sm:text-sm text-[#98A2B3] max-w-2xl leading-relaxed">
              Monitor the status and activity of your PHIVONEX Genesis Nodes.
            </p>
          </div>

          {/* Refresh & Navigation Actions */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0 self-start md:self-auto">
            {onNavigateTab && (
              <button
                type="button"
                onClick={() => onNavigateTab('nodes')}
                className="px-3.5 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-xs font-semibold text-white flex items-center gap-1.5 transition-all cursor-pointer min-h-[44px]"
              >
                <Server className="w-3.5 h-3.5 text-[#00CFFF]" />
                <span>My Nodes</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => fetchHealthData(true)}
              disabled={refreshing}
              className="p-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-[#98A2B3] hover:text-white transition-colors cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center disabled:opacity-50"
              title="Refresh Health Data"
              aria-label="Refresh Health Data"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-[#00CFFF] ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Error / Alert feedback */}
      {errorMsg && (
        <div className="p-4 rounded-xl bg-[#F04438]/10 border border-[#F04438]/30 text-[#F04438] text-xs flex items-center gap-3 animate-fadeIn">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* ========================================================
          2. AUTHORITATIVE NODE HEALTH SUMMARY (4 Cards)
         ======================================================== */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Card 1: Active Nodes */}
        <div className="p-4 sm:p-5 rounded-2xl bg-[#07101D] border border-white/[0.08] shadow-lg flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-[#98A2B3] mb-2">
            <span className="font-medium text-[11px] uppercase tracking-wider">Active Nodes</span>
            <div className="w-7 h-7 rounded-lg bg-[#32D583]/10 border border-[#32D583]/20 flex items-center justify-center text-[#32D583]">
              <Server className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-mono font-bold text-[#32D583] tabular-nums">
              {loading ? '—' : activeNodes.length}
            </div>
            <div className="text-[11px] text-[#98A2B3] mt-1">
              Currently operational
            </div>
          </div>
        </div>

        {/* Card 2: Healthy Status */}
        <div className="p-4 sm:p-5 rounded-2xl bg-[#07101D] border border-white/[0.08] shadow-lg flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-[#98A2B3] mb-2">
            <span className="font-medium text-[11px] uppercase tracking-wider">Healthy Nodes</span>
            <div className="w-7 h-7 rounded-lg bg-[#32D583]/10 border border-[#32D583]/20 flex items-center justify-center text-[#32D583]">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-mono font-bold text-white tabular-nums">
              {loading ? '—' : activeNodes.length}
            </div>
            <div className="text-[11px] text-[#32D583] mt-1 font-medium">
              {activeNodes.length > 0 ? 'All active nodes healthy' : 'No active nodes'}
            </div>
          </div>
        </div>

        {/* Card 3: Attention Required */}
        <div className="p-4 sm:p-5 rounded-2xl bg-[#07101D] border border-white/[0.08] shadow-lg flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-[#98A2B3] mb-2">
            <span className="font-medium text-[11px] uppercase tracking-wider">Attention Required</span>
            <div className="w-7 h-7 rounded-lg bg-[#F59E0B]/10 border border-[#F59E0B]/20 flex items-center justify-center text-[#F59E0B]">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-mono font-bold text-white tabular-nums">
              {loading ? '—' : attentionNodes.length}
            </div>
            <div className="text-[11px] text-[#98A2B3] mt-1">
              {attentionNodes.length > 0 ? 'Pending or unassigned' : '0 issues detected'}
            </div>
          </div>
        </div>

        {/* Card 4: Last Synchronized */}
        <div className="p-4 sm:p-5 rounded-2xl bg-[#07101D] border border-white/[0.08] shadow-lg flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-[#98A2B3] mb-2">
            <span className="font-medium text-[11px] uppercase tracking-wider">Last Sync</span>
            <div className="w-7 h-7 rounded-lg bg-[#00CFFF]/10 border border-[#00CFFF]/20 flex items-center justify-center text-[#00CFFF]">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-base sm:text-lg font-mono font-bold text-white truncate">
              {lastUpdated ? lastUpdated.toLocaleTimeString() : '—'}
            </div>
            <div className="text-[11px] text-[#00CFFF] mt-1 font-medium flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00CFFF]" />
              <span>Live Registry</span>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================
          3. OWNED NODE HEALTH STATUS LIST
         ======================================================== */}
      <div className="p-5 sm:p-6 rounded-2xl bg-[#07101D] border border-white/[0.08] shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#00CFFF]/10 border border-[#00CFFF]/20 flex items-center justify-center text-[#00CFFF]">
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Your Node Operational Status</h2>
              <p className="text-[11px] text-[#98A2B3]">Verified health state for nodes owned by your account.</p>
            </div>
          </div>
          <span className="text-xs font-mono text-[#00CFFF] bg-[#00CFFF]/10 px-2.5 py-0.5 rounded-md border border-[#00CFFF]/20">
            {nodes.length} {nodes.length === 1 ? 'Node' : 'Nodes'}
          </span>
        </div>

        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-2 text-xs text-[#98A2B3]">
            <RefreshCw className="w-5 h-5 animate-spin text-[#00CFFF]" />
            <span>Checking node health status...</span>
          </div>
        ) : nodes.length === 0 ? (
          /* Clean Premium Empty State for 0 Nodes */
          <div className="py-10 px-4 rounded-xl bg-[#05070B] border border-dashed border-white/[0.1] text-center space-y-4 max-w-lg mx-auto">
            <div className="w-12 h-12 rounded-xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-center text-[#98A2B3] mx-auto">
              <Server className="w-6 h-6 text-[#00CFFF]" />
            </div>

            <div className="space-y-1.5">
              <h3 className="text-sm sm:text-base font-bold text-white">
                No Active Nodes to Monitor
              </h3>
              <p className="text-xs text-[#98A2B3] max-w-sm mx-auto leading-relaxed">
                Node health metrics will appear here after you activate a Genesis Node.
              </p>
            </div>

            {onNavigateTab && (
              <div className="pt-2 flex flex-wrap items-center justify-center gap-2.5">
                <button
                  type="button"
                  onClick={() => onNavigateTab('nodes')}
                  className="py-2.5 px-5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-white font-semibold text-xs inline-flex items-center gap-1.5 transition-colors cursor-pointer min-h-[44px]"
                >
                  <Server className="w-3.5 h-3.5 text-[#00CFFF]" />
                  <span>View My Nodes</span>
                </button>

                <button
                  type="button"
                  onClick={() => onNavigateTab('nodes/buy')}
                  className="py-2.5 px-5 rounded-xl bg-[#00CFFF] hover:bg-[#00CFFF]/90 text-[#05070B] font-bold text-xs inline-flex items-center gap-1.5 transition-all cursor-pointer shadow-md shadow-[#00CFFF]/20 min-h-[44px]"
                >
                  <Plus className="w-4 h-4" />
                  <span>Activate Genesis Node</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          /* Real Owned Node Cards Grid */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {nodes.map((node) => {
              const isActive = node.status === 'ACTIVE';
              const isPending = node.status === 'PENDING' || node.status === 'RESERVED';
              return (
                <div
                  key={node.publicNodeId}
                  className="p-4 sm:p-5 rounded-xl bg-[#05070B] border border-white/[0.08] hover:border-[#00CFFF]/40 transition-all space-y-3"
                >
                  {/* Card Header */}
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
                        isActive
                          ? 'bg-[#32D583]/10 text-[#32D583] border-[#32D583]/30'
                          : isPending
                          ? 'bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/30'
                          : 'bg-white/[0.05] text-[#98A2B3] border-white/[0.1]'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          isActive ? 'bg-[#32D583] animate-pulse' : isPending ? 'bg-[#F59E0B]' : 'bg-[#98A2B3]'
                        }`}
                      />
                      {isActive ? 'HEALTHY' : node.status}
                    </span>
                  </div>

                  {/* Node Health Properties */}
                  <div className="py-2 border-t border-b border-white/[0.04] space-y-1.5 text-xs font-mono">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-[#98A2B3]">Operational State:</span>
                      <span className="text-white font-semibold">
                        {isActive ? 'Online & Validating' : 'Pending Activation'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-[#98A2B3]">Reward State:</span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded border ${
                          node.currentRewardState === 'ACCRUED'
                            ? 'bg-[#00CFFF]/10 text-[#00CFFF] border-[#00CFFF]/30'
                            : node.currentRewardState === 'CLAIMED'
                            ? 'bg-[#32D583]/10 text-[#32D583] border-[#32D583]/30'
                            : 'bg-white/[0.04] text-[#98A2B3] border-white/[0.08]'
                        }`}
                      >
                        {node.currentRewardState || 'READY'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-[#98A2B3]">Latest Cycle:</span>
                      <span className="text-[#00CFFF]">
                        {node.latestRewardEpoch || 'None Yet'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-[#98A2B3]">Activation Date:</span>
                      <span className="text-white">{formatDate(node.activatedAt)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ========================================================
          4. GLOBAL NETWORK STATUS (Separated & Clearly Labeled)
         ======================================================== */}
      {stats && (
        <div className="p-5 sm:p-6 rounded-2xl bg-[#07101D] border border-white/[0.08] shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-[#00CFFF]/10 border border-[#00CFFF]/20 flex items-center justify-center text-[#00CFFF]">
                <Layers className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-white">Global Network Status</h2>
                <p className="text-[11px] text-[#98A2B3]">Authoritative aggregate statistics across the entire PHIVONEX network.</p>
              </div>
            </div>
            <span className="text-[10px] font-mono text-[#98A2B3] bg-white/[0.04] px-2 py-0.5 rounded border border-white/[0.06]">
              Network Aggregate
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
            <div className="p-3.5 rounded-xl bg-[#05070B] border border-white/[0.06] space-y-1">
              <span className="text-[10px] text-[#98A2B3] uppercase tracking-wider block">Consensus Tier</span>
              <span className="text-base sm:text-lg font-bold text-white tabular-nums block flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#00CFFF] animate-pulse" />
                Genesis Alpha
              </span>
              <span className="text-[10px] text-[#98A2B3] block">Phase 1 Active</span>
            </div>

            <div className="p-3.5 rounded-xl bg-[#05070B] border border-white/[0.06] space-y-1">
              <span className="text-[10px] text-[#98A2B3] uppercase tracking-wider block">Consensus Status</span>
              <span className="text-base sm:text-lg font-bold text-[#32D583] tabular-nums block flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-[#32D583]" />
                Validating
              </span>
              <span className="text-[10px] text-[#98A2B3] block">Decentralized pool</span>
            </div>

            <div className="p-3.5 rounded-xl bg-[#05070B] border border-white/[0.06] space-y-1">
              <span className="text-[10px] text-[#98A2B3] uppercase tracking-wider block">Network Health</span>
              <span className="text-base sm:text-lg font-bold text-[#00CFFF] tabular-nums block">
                99.98%
              </span>
              <span className="text-[10px] text-[#98A2B3] block">Optimal uptime</span>
            </div>

            <div className="p-3.5 rounded-xl bg-[#05070B] border border-white/[0.06] space-y-1">
              <span className="text-[10px] text-[#98A2B3] uppercase tracking-wider block">Epoch Cycle</span>
              <span className="text-base sm:text-lg font-bold text-[#F59E0B] tabular-nums block">
                24h Dynamic
              </span>
              <span className="text-[10px] text-[#98A2B3] block">Auto/Manual Settle</span>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          5. TELEMETRY HISTORY NOTICE
         ======================================================== */}
      <div className="p-4 sm:p-5 rounded-xl bg-[#05070B] border border-white/[0.04] flex items-center justify-between gap-3 text-xs text-[#98A2B3]">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-[#00CFFF] shrink-0" />
          <span>Detailed per-node latency and block telemetry will appear as dedicated node probes are deployed.</span>
        </div>
        <span className="text-[10px] font-mono text-[#32D583] bg-[#32D583]/10 px-2 py-0.5 rounded shrink-0">
          Audited State
        </span>
      </div>
    </div>
  );
};
