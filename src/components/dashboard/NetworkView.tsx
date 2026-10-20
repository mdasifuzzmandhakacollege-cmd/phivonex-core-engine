import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  GitFork,
  ArrowLeft,
  ArrowRight,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Clock,
  ChevronDown,
  ChevronUp,
  UserCheck,
  Layers,
  Info,
  BarChart3,
  Activity,
  Calendar,
  History,
} from 'lucide-react';
import {
  MatchingSection,
  MatchingSummary,
  MatchingSettlementItem,
} from './MatchingSection';
import {
  PromotionSection,
} from './PromotionSection';
import { PlacementManager } from './PlacementManager';

export interface VolumeSummary {
  businessDate: string;
  today: {
    left: number;
    right: number;
  };
  carry: {
    left: number;
    right: number;
  };
  availableForFutureMatching: {
    left: number;
    right: number;
  };
}

export interface VolumeHistoryItem {
  businessDate: string;
  leftUnits: number;
  rightUnits: number;
}

export interface UnplacedMember {
  publicId: string;
  displayName: string;
  joinedAt: string;
  placementStatus: 'UNPLACED';
}

export interface TreeNode {
  user: {
    publicId: string;
    displayName: string;
  };
  side: 'LEFT' | 'RIGHT' | null;
  placedAt: string | null;
  left: TreeNode | null;
  right: TreeNode | null;
}

export interface NetworkSummary {
  directReferrals: number;
  placedMembers: number;
  unplacedDirectReferrals: number;
  leftNetworkMembers: number;
  rightNetworkMembers: number;
}

export const NetworkView: React.FC = () => {
  const [summary, setSummary] = useState<NetworkSummary | null>(null);
  const [unplacedList, setUnplacedList] = useState<UnplacedMember[]>([]);
  const [treeData, setTreeData] = useState<TreeNode | null>(null);
  const [volumeSummary, setVolumeSummary] = useState<VolumeSummary | null>(null);
  const [volumeHistory, setVolumeHistory] = useState<VolumeHistoryItem[]>([]);
  const [matchingSummary, setMatchingSummary] = useState<MatchingSummary | null>(null);
  const [matchingHistory, setMatchingHistory] = useState<MatchingSettlementItem[]>([]);
  const [showHistory, setShowHistory] = useState<boolean>(false);
  const [depth, setDepth] = useState<number>(3);
  const [selectedMember, setSelectedMember] = useState<UnplacedMember | null>(null);

  const [loading, setLoading] = useState<boolean>(true);
  const [placingMember, setPlacingMember] = useState<{
    member: UnplacedMember;
    side: 'LEFT' | 'RIGHT';
  } | null>(null);
  const [submittingPlacement, setSubmittingPlacement] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Fetch summary, unplaced, tree, binary sales volume, and matching bonus
  const fetchNetworkData = useCallback(async (currentDepth = depth) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [summaryRes, unplacedRes, treeRes, volumeRes, historyRes, matchingSumRes, matchingHistRes] = await Promise.all([
        fetch('/api/network/summary', { credentials: 'include' }),
        fetch('/api/network/unplaced', { credentials: 'include' }),
        fetch(`/api/network/tree?depth=${currentDepth}`, { credentials: 'include' }),
        fetch('/api/network/volume-summary', { credentials: 'include' }),
        fetch('/api/network/volume-history?page=1&limit=5', { credentials: 'include' }),
        fetch('/api/matching/summary', { credentials: 'include' }),
        fetch('/api/matching/history?page=1&limit=10', { credentials: 'include' }),
      ]);

      if (summaryRes.ok) {
        const summaryData = await summaryRes.json();
        setSummary(summaryData);
      }
      if (unplacedRes.ok) {
        const unplacedData = await unplacedRes.json();
        setUnplacedList(unplacedData.unplaced || []);
      }
      if (treeRes.ok) {
        const treeJson = await treeRes.json();
        setTreeData(treeJson.tree || null);
      }
      if (volumeRes.ok) {
        const volData = await volumeRes.json();
        setVolumeSummary(volData);
      }
      if (historyRes.ok) {
        const histData = await historyRes.json();
        setVolumeHistory(histData.history || []);
      }
      if (matchingSumRes.ok) {
        const sumData = await matchingSumRes.json();
        setMatchingSummary(sumData);
      }
      if (matchingHistRes.ok) {
        const histData = await matchingHistRes.json();
        setMatchingHistory(histData.history || []);
      }
    } catch (err: any) {
      console.warn('[NetworkView] Error fetching network:', err);
      setErrorMsg(err.message || 'Unable to connect to network service.');
    } finally {
      setLoading(false);
    }
  }, [depth]);

  useEffect(() => {
    fetchNetworkData(depth);
  }, [fetchNetworkData, depth]);

  const handleConfirmPlacement = async () => {
    if (!placingMember) return;
    setSubmittingPlacement(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch('/api/network/place', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          memberPublicId: placingMember.member.publicId,
          preferredSide: placingMember.side,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Placement failed.');
      }

      setSuccessMsg(
        `Successfully placed ${placingMember.member.displayName} into ${data.side} team.`
      );
      setPlacingMember(null);
      await fetchNetworkData(depth);
    } catch (err: any) {
      console.warn('[NetworkView] Placement error:', err);
      setErrorMsg(err.message || 'Failed to complete placement.');
    } finally {
      setSubmittingPlacement(false);
    }
  };

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
                Binary Structure
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.08] text-[#98A2B3] text-[11px] font-mono">
                Daily Global Settlement (18:00 UTC)
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              Network
            </h1>
            <p className="text-xs sm:text-sm text-[#98A2B3] max-w-2xl leading-relaxed">
              Track your binary team, daily matching progress, and PHIVONEX promotion rank.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0 self-start md:self-auto">
            {/* Depth selector */}
            <div className="flex items-center bg-[#05070B] border border-white/[0.08] rounded-xl p-1">
              <span className="text-xs text-[#98A2B3] px-2 font-mono">Depth:</span>
              {[2, 3, 4, 5].map((d) => (
                <button
                  key={d}
                  onClick={() => setDepth(d)}
                  className={`px-2.5 py-1 text-xs font-mono rounded-lg transition-colors cursor-pointer ${
                    depth === d
                      ? 'bg-[#00CFFF] text-[#05070B] font-bold shadow-sm'
                      : 'text-[#98A2B3] hover:text-white'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>

            <button
              onClick={() => fetchNetworkData(depth)}
              disabled={loading}
              className="p-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-[#98A2B3] hover:text-white transition-colors cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center disabled:opacity-50"
              title="Refresh Network Data"
              aria-label="Refresh Network Data"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-[#00CFFF] ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Notifications */}
      {errorMsg && (
        <div className="p-4 rounded-xl bg-[#F04438]/10 border border-[#F04438]/30 text-[#F04438] text-xs flex items-center justify-between gap-3 animate-fadeIn">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button
            onClick={() => setErrorMsg(null)}
            className="text-white hover:underline text-xs font-mono cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {successMsg && (
        <div className="p-4 rounded-xl bg-[#32D583]/10 border border-[#32D583]/30 text-[#32D583] text-xs flex items-center justify-between gap-3 animate-fadeIn">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button
            onClick={() => setSuccessMsg(null)}
            className="text-white hover:underline text-xs font-mono cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ========================================================
          2. COMPACT SUMMARY KPI GRID
         ======================================================== */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        {/* Direct Referrals */}
        <div className="p-4 rounded-2xl bg-[#07101D] border border-white/[0.08] shadow-lg flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-[#98A2B3] mb-2">
            <span className="font-medium text-[11px] uppercase tracking-wider">Direct Referrals</span>
            <Users className="w-4 h-4 text-[#00CFFF]" />
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-mono font-bold text-white tabular-nums">
              {summary ? summary.directReferrals : '0'}
            </div>
            <div className="text-[11px] text-[#98A2B3] mt-1">Directly sponsored</div>
          </div>
        </div>

        {/* Placed Members */}
        <div className="p-4 rounded-2xl bg-[#07101D] border border-white/[0.08] shadow-lg flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-[#98A2B3] mb-2">
            <span className="font-medium text-[11px] uppercase tracking-wider">Placed Members</span>
            <UserCheck className="w-4 h-4 text-[#32D583]" />
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-mono font-bold text-[#32D583] tabular-nums">
              {summary ? summary.placedMembers : '0'}
            </div>
            <div className="text-[11px] text-[#98A2B3] mt-1">In binary tree</div>
          </div>
        </div>

        {/* Unplaced Referrals */}
        <div className="p-4 rounded-2xl bg-[#07101D] border border-white/[0.08] shadow-lg flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-[#98A2B3] mb-2">
            <span className="font-medium text-[11px] uppercase tracking-wider">Unplaced</span>
            <Clock className="w-4 h-4 text-[#F59E0B]" />
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-mono font-bold text-[#F59E0B] tabular-nums">
              {summary ? summary.unplacedDirectReferrals : '0'}
            </div>
            <div className="text-[11px] text-[#98A2B3] mt-1">Pending placement</div>
          </div>
        </div>

        {/* Left Network */}
        <div className="p-4 rounded-2xl bg-[#07101D] border border-white/[0.08] shadow-lg flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-[#98A2B3] mb-2">
            <span className="font-medium text-[11px] uppercase tracking-wider">Left Team</span>
            <ArrowLeft className="w-4 h-4 text-[#00CFFF]" />
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-mono font-bold text-[#00CFFF] tabular-nums">
              {summary ? summary.leftNetworkMembers : '0'}
            </div>
            <div className="text-[11px] text-[#98A2B3] mt-1">Left subtree members</div>
          </div>
        </div>

        {/* Right Network */}
        <div className="p-4 rounded-2xl bg-[#07101D] border border-white/[0.08] shadow-lg flex flex-col justify-between col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between text-xs text-[#98A2B3] mb-2">
            <span className="font-medium text-[11px] uppercase tracking-wider">Right Team</span>
            <ArrowRight className="w-4 h-4 text-[#32D583]" />
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-mono font-bold text-[#32D583] tabular-nums">
              {summary ? summary.rightNetworkMembers : '0'}
            </div>
            <div className="text-[11px] text-[#98A2B3] mt-1">Right subtree members</div>
          </div>
        </div>
      </div>

      {/* ========================================================
          3. BINARY SALES VOLUME SECTION
         ======================================================== */}
      <div className="p-5 sm:p-6 rounded-2xl bg-[#07101D] border border-white/[0.08] shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/[0.06] pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#00CFFF]/10 border border-[#00CFFF]/20 flex items-center justify-center text-[#00CFFF]">
              <BarChart3 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Binary Sales Volume</h2>
              <p className="text-[11px] text-[#98A2B3]">Genesis Node volume attributed through binary tree ancestry (1 Active Node = 1 Unit).</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-xs font-mono text-[#98A2B3] self-start sm:self-auto">
            <Calendar className="w-3.5 h-3.5 text-[#00CFFF]" />
            <span>Cycle Date:</span>
            <span className="text-white font-bold">{volumeSummary?.businessDate || '—'}</span>
          </div>
        </div>

        {/* 3 Metric Groups */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Today's Sales */}
          <div className="p-4 rounded-xl bg-[#05070B] border border-white/[0.06] space-y-2">
            <div className="flex items-center justify-between border-b border-white/[0.04] pb-1.5 text-xs font-mono text-[#98A2B3]">
              <span className="uppercase">Today's Sales</span>
              <Activity className="w-3.5 h-3.5 text-[#00CFFF]" />
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div>
                <div className="text-[10px] text-[#98A2B3]">Today's Left</div>
                <div className="text-xl font-bold font-mono text-[#00CFFF] tabular-nums">
                  {volumeSummary ? volumeSummary.today.left : '0'}
                </div>
                <div className="text-[10px] text-[#667085]">Node Units</div>
              </div>
              <div className="border-l border-white/[0.06] pl-3">
                <div className="text-[10px] text-[#98A2B3]">Today's Right</div>
                <div className="text-xl font-bold font-mono text-[#32D583] tabular-nums">
                  {volumeSummary ? volumeSummary.today.right : '0'}
                </div>
                <div className="text-[10px] text-[#667085]">Node Units</div>
              </div>
            </div>
          </div>

          {/* Carry Forward */}
          <div className="p-4 rounded-xl bg-[#05070B] border border-white/[0.06] space-y-2">
            <div className="flex items-center justify-between border-b border-white/[0.04] pb-1.5 text-xs font-mono text-[#98A2B3]">
              <span className="uppercase">Carry Forward</span>
              <GitFork className="w-3.5 h-3.5 text-[#F59E0B]" />
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div>
                <div className="text-[10px] text-[#98A2B3]">Carry Left</div>
                <div className="text-xl font-bold font-mono text-[#00CFFF] tabular-nums">
                  {volumeSummary ? volumeSummary.carry.left : '0'}
                </div>
                <div className="text-[10px] text-[#667085]">Node Units</div>
              </div>
              <div className="border-l border-white/[0.06] pl-3">
                <div className="text-[10px] text-[#98A2B3]">Carry Right</div>
                <div className="text-xl font-bold font-mono text-[#32D583] tabular-nums">
                  {volumeSummary ? volumeSummary.carry.right : '0'}
                </div>
                <div className="text-[10px] text-[#667085]">Node Units</div>
              </div>
            </div>
          </div>

          {/* Available Volume */}
          <div className="p-4 rounded-xl bg-[#05070B] border border-white/[0.06] space-y-2">
            <div className="flex items-center justify-between border-b border-white/[0.04] pb-1.5 text-xs font-mono text-[#98A2B3]">
              <span className="uppercase">Available Volume</span>
              <Layers className="w-3.5 h-3.5 text-[#00CFFF]" />
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div>
                <div className="text-[10px] text-[#98A2B3]">Available Left</div>
                <div className="text-xl font-bold font-mono text-white tabular-nums">
                  {volumeSummary ? volumeSummary.availableForFutureMatching.left : '0'}
                </div>
                <div className="text-[10px] text-[#667085]">Total Units</div>
              </div>
              <div className="border-l border-white/[0.06] pl-3">
                <div className="text-[10px] text-[#98A2B3]">Available Right</div>
                <div className="text-xl font-bold font-mono text-white tabular-nums">
                  {volumeSummary ? volumeSummary.availableForFutureMatching.right : '0'}
                </div>
                <div className="text-[10px] text-[#667085]">Total Units</div>
              </div>
            </div>
          </div>
        </div>

        {/* Volume History Toggle */}
        <div>
          <button
            type="button"
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center gap-1.5 text-xs font-mono text-[#98A2B3] hover:text-white transition-colors cursor-pointer"
          >
            <History className="w-3.5 h-3.5 text-[#00CFFF]" />
            <span>{showHistory ? 'Hide' : 'Show'} Volume History</span>
            {showHistory ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {showHistory && (
            <div className="mt-3 p-3 rounded-xl bg-[#05070B] border border-white/[0.06] overflow-x-auto">
              {volumeHistory.length === 0 ? (
                <div className="text-xs font-mono text-[#98A2B3] py-2 text-center">
                  No daily volume records generated yet.
                </div>
              ) : (
                <table className="w-full text-xs font-mono text-left">
                  <thead>
                    <tr className="border-b border-white/[0.04] text-[#98A2B3] text-[10px] uppercase">
                      <th className="py-2 px-2">Business Date</th>
                      <th className="py-2 px-2 text-right text-[#00CFFF]">Left Units</th>
                      <th className="py-2 px-2 text-right text-[#32D583]">Right Units</th>
                      <th className="py-2 px-2 text-right text-white">Total Units</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04]">
                    {volumeHistory.map((item) => (
                      <tr key={item.businessDate} className="hover:bg-white/[0.02]">
                        <td className="py-2 px-2 text-white">{item.businessDate}</td>
                        <td className="py-2 px-2 text-right text-[#00CFFF] font-bold">{item.leftUnits}</td>
                        <td className="py-2 px-2 text-right text-[#32D583] font-bold">{item.rightUnits}</td>
                        <td className="py-2 px-2 text-right text-white font-bold">{item.leftUnits + item.rightUnits}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ========================================================
          4. DAILY BINARY MATCHING SECTION (10 Approved Tiers)
         ======================================================== */}
      <MatchingSection
        summary={matchingSummary}
        history={matchingHistory}
        loading={loading}
      />

      {/* ========================================================
          5. SEQUENTIAL PROMOTION SECTION (7 Sequential Ranks)
         ======================================================== */}
      <PromotionSection />

      {/* ========================================================
          6. UNPLACED DIRECT REFERRALS SECTION
         ======================================================== */}
      <div className="p-5 sm:p-6 rounded-2xl bg-[#07101D] border border-white/[0.08] shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/[0.06] pb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#F59E0B]/10 border border-[#F59E0B]/20 flex items-center justify-center text-[#F59E0B]">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Unplaced Direct Referrals</h2>
              <p className="text-[11px] text-[#98A2B3]">
                Place new direct referrals into your LEFT or RIGHT binary team.
              </p>
            </div>
          </div>
          <span className="text-xs font-mono text-[#F59E0B] bg-[#F59E0B]/10 px-2.5 py-0.5 rounded-md border border-[#F59E0B]/20 self-start sm:self-auto">
            {unplacedList.length} Pending
          </span>
        </div>

        {unplacedList.length === 0 ? (
          <div className="p-8 text-center border border-dashed border-white/[0.06] rounded-xl bg-[#05070B] space-y-1">
            <CheckCircle2 className="w-7 h-7 text-[#32D583] mx-auto mb-1 opacity-80" />
            <p className="text-xs font-bold text-white">All direct referrals are placed</p>
            <p className="text-[11px] text-[#98A2B3]">
              When new members register with your referral code, they will appear here awaiting team placement.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {unplacedList.map((m) => (
              <div
                key={m.publicId}
                className="p-4 rounded-xl bg-[#05070B] border border-white/[0.06] hover:border-[#F59E0B]/30 transition-all flex flex-col justify-between space-y-3"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-[#F59E0B]/10 border border-[#F59E0B]/20 flex items-center justify-center font-bold text-[#F59E0B] text-xs font-mono">
                      {m.displayName.charAt(0)}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white">{m.displayName}</div>
                      <div className="text-[11px] font-mono text-[#00CFFF]">{m.publicId}</div>
                    </div>
                  </div>
                  <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-[#F59E0B]/10 border border-[#F59E0B]/20 text-[#F59E0B]">
                    UNPLACED
                  </span>
                </div>

                <div className="text-[10px] font-mono text-[#98A2B3] flex items-center justify-between border-t border-white/[0.04] pt-2">
                  <span>Joined:</span>
                  <span>{new Date(m.joinedAt).toLocaleDateString()}</span>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setPlacingMember({ member: m, side: 'LEFT' })}
                    className="flex items-center justify-center gap-1 py-2 px-3 rounded-lg bg-[#00CFFF]/10 hover:bg-[#00CFFF]/20 text-[#00CFFF] border border-[#00CFFF]/30 text-xs font-mono font-medium transition-all cursor-pointer min-h-[40px]"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Place LEFT</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPlacingMember({ member: m, side: 'RIGHT' })}
                    className="flex items-center justify-center gap-1 py-2 px-3 rounded-lg bg-[#32D583]/10 hover:bg-[#32D583]/20 text-[#32D583] border border-[#32D583]/30 text-xs font-mono font-medium transition-all cursor-pointer min-h-[40px]"
                  >
                    <span>Place RIGHT</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ========================================================
          7. INTERACTIVE BINARY TREE VIEW (Horizontally Safe)
         ======================================================== */}
      <div className="p-5 sm:p-6 rounded-2xl bg-[#07101D] border border-white/[0.08] shadow-xl overflow-hidden space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/[0.06] pb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#00CFFF]/10 border border-[#00CFFF]/20 flex items-center justify-center text-[#00CFFF]">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Binary Tree Structure</h2>
              <p className="text-[11px] text-[#98A2B3]">
                Visual structure of your binary tree down to depth {depth}.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs font-mono">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#00CFFF]" />
              <span className="text-[#98A2B3]">Left Team</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#32D583]" />
              <span className="text-[#98A2B3]">Right Team</span>
            </div>
          </div>
        </div>

        {/* Tree Container */}
        <div className="w-full overflow-x-auto py-6 px-3 bg-[#05070B] rounded-xl border border-white/[0.06] min-h-[380px] flex items-center justify-center">
          {loading && !treeData ? (
            <div className="flex flex-col items-center justify-center space-y-2 py-10">
              <RefreshCw className="w-6 h-6 text-[#00CFFF] animate-spin" />
              <p className="text-xs font-mono text-[#98A2B3]">Loading binary tree...</p>
            </div>
          ) : treeData ? (
            <div className="min-w-fit flex flex-col items-center">
              <BinaryTreeNodeRenderer node={treeData} isRoot={true} rootVolume={volumeSummary} />
            </div>
          ) : (
            <div className="text-center py-10 text-[#98A2B3] text-xs font-mono">
              No binary tree data found.
            </div>
          )}
        </div>
      </div>

      {/* ========================================================
          8. CONFIRMATION PLACEMENT MODAL
         ======================================================== */}
      {placingMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-md bg-[#07101D] border border-white/[0.12] rounded-2xl p-6 shadow-2xl space-y-5">
            <div className="flex items-center gap-3">
              <div
                className={`p-3 rounded-xl border ${
                  placingMember.side === 'LEFT'
                    ? 'bg-[#00CFFF]/10 border-[#00CFFF]/30 text-[#00CFFF]'
                    : 'bg-[#32D583]/10 border-[#32D583]/30 text-[#32D583]'
                }`}
              >
                <GitFork className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Confirm Network Placement</h3>
                <p className="text-xs text-[#98A2B3]">Review placement details</p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-[#05070B] border border-white/[0.06] space-y-2 text-xs font-mono">
              <div className="flex justify-between">
                <span className="text-[#98A2B3]">Member:</span>
                <span className="text-white font-semibold">{placingMember.member.displayName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#98A2B3]">Public ID:</span>
                <span className="text-[#00CFFF] font-bold">{placingMember.member.publicId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#98A2B3]">Target Leg:</span>
                <span
                  className={`font-bold px-2 py-0.5 rounded ${
                    placingMember.side === 'LEFT'
                      ? 'bg-[#00CFFF]/20 text-[#00CFFF]'
                      : 'bg-[#32D583]/20 text-[#32D583]'
                  }`}
                >
                  {placingMember.side} TEAM
                </span>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-[#F59E0B]/10 border border-[#F59E0B]/20 text-[#F59E0B] text-xs flex items-start gap-2.5">
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                <strong>Placement Notice:</strong> Once placed, this member is permanently assigned to the selected team leg.
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setPlacingMember(null)}
                disabled={submittingPlacement}
                className="flex-1 py-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-[#98A2B3] hover:text-white text-xs font-mono font-medium transition-colors border border-white/[0.08] cursor-pointer min-h-[44px]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmPlacement}
                disabled={submittingPlacement}
                className={`flex-1 py-2.5 rounded-xl text-[#05070B] text-xs font-mono font-bold transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer min-h-[44px] ${
                  placingMember.side === 'LEFT'
                    ? 'bg-[#00CFFF] hover:bg-[#00CFFF]/90 shadow-[#00CFFF]/20'
                    : 'bg-[#32D583] hover:bg-[#32D583]/90 shadow-[#32D583]/20'
                } disabled:opacity-50`}
              >
                {submittingPlacement ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Placing...</span>
                  </>
                ) : (
                  <span>Confirm Placement</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Recursive binary tree visualizer component
 */
interface NodeRendererProps {
  node: TreeNode | null;
  isRoot?: boolean;
  side?: 'LEFT' | 'RIGHT';
  rootVolume?: VolumeSummary | null;
}

const BinaryTreeNodeRenderer: React.FC<NodeRendererProps & { onPlace?: (side: 'LEFT' | 'RIGHT', parentId: string) => void }> = ({ node, isRoot = false, side, rootVolume, onPlace }) => {
  if (!node) {
    return (
      <div className="flex flex-col items-center">
        <button 
          onClick={() => onPlace?.(side || 'LEFT', 'parent_id_placeholder')}
          className="w-32 sm:w-40 p-3 rounded-xl border border-dashed border-white/[0.1] bg-[#05070B] text-center hover:bg-[#00CFFF]/10 transition-colors"
        >
          <div className="text-[10px] font-mono uppercase tracking-wider text-[#667085] mb-1">
            {side || 'Position'}
          </div>
          <div className="text-xs font-mono text-[#00CFFF]">Click to Place</div>
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center">
      {/* Node Card */}
      <div
        className={`w-32 sm:w-40 p-3 rounded-xl border transition-all relative ${
          isRoot
            ? 'bg-[#0B1728] border-[#00CFFF]/40 shadow-lg shadow-[#00CFFF]/10'
            : node.side === 'LEFT'
            ? 'bg-[#05070B] border-[#00CFFF]/30'
            : 'bg-[#05070B] border-[#32D583]/30'
        }`}
      >
        <div className="flex items-center justify-between mb-1">
          <span
            className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded uppercase ${
              isRoot
                ? 'bg-[#00CFFF]/20 text-[#00CFFF]'
                : node.side === 'LEFT'
                ? 'bg-[#00CFFF]/10 text-[#00CFFF]'
                : 'bg-[#32D583]/10 text-[#32D583]'
            }`}
          >
            {isRoot ? 'YOU' : node.side}
          </span>
          {node.placedAt && (
            <span className="text-[9px] font-mono text-[#667085]">
              {new Date(node.placedAt).toLocaleDateString(undefined, {
                month: 'numeric',
                day: 'numeric',
              })}
            </span>
          )}
        </div>

        <div className="text-xs font-bold text-white truncate">{node.user.displayName}</div>
        <div className="text-[10px] font-mono text-[#00CFFF] truncate mt-0.5">
          {node.user.publicId}
        </div>

        {/* Root Volume Badges */}
        {isRoot && rootVolume && (
          <div className="mt-2 pt-1.5 border-t border-white/[0.06] grid grid-cols-2 gap-1 text-[9px] font-mono">
            <div className="text-[#00CFFF] flex items-center justify-between">
              <span>L:</span>
              <span className="font-bold">{rootVolume.availableForFutureMatching.left}</span>
            </div>
            <div className="text-[#32D583] flex items-center justify-between border-l border-white/[0.06] pl-1">
              <span>R:</span>
              <span className="font-bold">{rootVolume.availableForFutureMatching.right}</span>
            </div>
          </div>
        )}
      </div>

      {/* Branch Connectors and Children */}
      <div className="w-0.5 h-5 bg-white/[0.1]"></div>

      <div className="relative flex justify-center items-start pt-0">
        <div className="grid grid-cols-2 gap-3 sm:gap-6 relative">
          <div className="absolute top-0 left-1/4 right-1/4 h-0.5 bg-white/[0.1]"></div>

          {/* Left Branch */}
          <div className="flex flex-col items-center">
            <div className="w-0.5 h-3 bg-[#00CFFF]/40"></div>
            <BinaryTreeNodeRenderer node={node.left} side="LEFT" />
          </div>

          {/* Right Branch */}
          <div className="flex flex-col items-center">
            <div className="w-0.5 h-3 bg-[#32D583]/40"></div>
            <BinaryTreeNodeRenderer node={node.right} side="RIGHT" />
          </div>
        </div>
      </div>
    </div>
  );
};
