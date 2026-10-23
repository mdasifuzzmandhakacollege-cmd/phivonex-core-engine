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
  Copy,
  Check,
  Share2,
  ShieldCheck,
  Zap,
  Globe,
  Award,
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

export const NetworkView: React.FC<{ user?: any }> = ({ user }) => {
  const [summary, setSummary] = useState<NetworkSummary | null>(null);
  const [unplacedList, setUnplacedList] = useState<UnplacedMember[]>([]);
  const [treeData, setTreeData] = useState<TreeNode | null>(null);
  const [volumeSummary, setVolumeSummary] = useState<VolumeSummary | null>(null);
  const [volumeHistory, setVolumeHistory] = useState<VolumeHistoryItem[]>([]);
  const [matchingSummary, setMatchingSummary] = useState<MatchingSummary | null>(null);
  const [matchingHistory, setMatchingHistory] = useState<MatchingSettlementItem[]>([]);
  const [showHistory, setShowHistory] = useState<boolean>(false);
  const [depth, setDepth] = useState<number>(3);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [inspectNode, setInspectNode] = useState<TreeNode | null>(null);

  const [loading, setLoading] = useState<boolean>(true);
  const [placingMember, setPlacingMember] = useState<{
    member: UnplacedMember;
    side: 'LEFT' | 'RIGHT';
  } | null>(null);
  const [submittingPlacement, setSubmittingPlacement] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const referralCode = user?.referralCode || user?.publicId || 'PHX10088';
  const referralLink = `${window.location.origin}/register?ref=${referralCode}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(referralLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const fetchNetworkData = useCallback(async (currentDepth = depth) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [summaryRes, unplacedRes, treeRes, volumeRes, historyRes, matchingSumRes, matchingHistRes] = await Promise.all([
        fetch('/api/network/summary', { credentials: 'include' }).catch(() => null),
        fetch('/api/network/unplaced', { credentials: 'include' }).catch(() => null),
        fetch(`/api/network/tree?depth=${currentDepth}`, { credentials: 'include' }).catch(() => null),
        fetch('/api/network/volume-summary', { credentials: 'include' }).catch(() => null),
        fetch('/api/network/volume-history?page=1&limit=5', { credentials: 'include' }).catch(() => null),
        fetch('/api/matching/summary', { credentials: 'include' }).catch(() => null),
        fetch('/api/matching/history?page=1&limit=10', { credentials: 'include' }).catch(() => null),
      ]);

      if (summaryRes && summaryRes.ok) {
        setSummary(await summaryRes.json());
      }
      if (unplacedRes && unplacedRes.ok) {
        const data = await unplacedRes.json();
        setUnplacedList(data.unplaced || []);
      }
      if (treeRes && treeRes.ok) {
        const data = await treeRes.json();
        setTreeData(data.tree || null);
      }
      if (volumeRes && volumeRes.ok) {
        setVolumeSummary(await volumeRes.json());
      }
      if (historyRes && historyRes.ok) {
        const data = await historyRes.json();
        setVolumeHistory(data.history || []);
      }
      if (matchingSumRes && matchingSumRes.ok) {
        setMatchingSummary(await matchingSumRes.json());
      }
      if (matchingHistRes && matchingHistRes.ok) {
        const data = await matchingHistRes.json();
        setMatchingHistory(data.history || []);
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

      setSuccessMsg(`Successfully placed ${placingMember.member.displayName} into ${data.side} team.`);
      setPlacingMember(null);
      await fetchNetworkData(depth);
    } catch (err: any) {
      console.warn('[NetworkView] Placement error:', err);
      setErrorMsg(err.message || 'Failed to complete placement.');
    } finally {
      setSubmittingPlacement(false);
    }
  };

  // Calculate balance percentage
  const leftTotal = summary?.leftNetworkMembers || 0;
  const rightTotal = summary?.rightNetworkMembers || 0;
  const totalTeam = leftTotal + rightTotal;
  const leftPercent = totalTeam > 0 ? Math.round((leftTotal / totalTeam) * 100) : 50;
  const rightPercent = totalTeam > 0 ? 100 - leftPercent : 50;

  return (
    <div className="space-y-6 sm:space-y-8 animate-fadeIn pb-12">
      {/* ========================================================
          1. AFFILIATE COMMAND CENTER HERO & REFERRAL CARD
         ======================================================== */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#07101D] via-[#0B1728] to-[#07101D] border border-white/[0.08] p-6 sm:p-8 shadow-2xl">
        <div className="absolute top-0 right-0 -mt-12 -mr-12 w-80 h-80 bg-[#00CFFF]/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 -mb-16 w-64 h-64 bg-[#32D583]/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#00CFFF]/15 border border-[#00CFFF]/30 text-[#00CFFF] text-xs font-mono font-bold tracking-wider uppercase">
                <Globe className="w-3.5 h-3.5 animate-spin-slow" />
                Global Affiliate Command Center
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.04] border border-white/[0.08] text-[#32D583] text-xs font-mono font-bold">
                <Zap className="w-3.5 h-3.5 text-[#32D583]" />
                Live Binary Matrix Sync
              </span>
            </div>

            <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
              Network Tree &amp; Matrix
            </h1>
            <p className="text-xs sm:text-sm text-[#98A2B3] max-w-2xl leading-relaxed">
              Experience the ultra-modern decentralized genealogical gene tree. Monitor team equilibrium, unplaced referrals, daily matching bonuses, and instant referral sharing.
            </p>
          </div>

          {/* Quick Referral Share Box */}
          <div className="p-4 rounded-2xl bg-[#05070B]/90 border border-white/[0.1] shadow-xl backdrop-blur-md flex flex-col space-y-2.5 min-w-[280px] sm:min-w-[320px]">
            <div className="flex items-center justify-between text-xs text-[#98A2B3] font-mono">
              <span>Your Referral Link</span>
              <span className="text-[#00CFFF] font-bold">{referralCode}</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={referralLink}
                className="w-full bg-[#07101D] border border-white/[0.08] rounded-xl px-3 py-2 text-xs font-mono text-white select-all focus:outline-none"
              />
              <button
                type="button"
                onClick={handleCopyLink}
                className="p-2.5 rounded-xl bg-[#00CFFF] hover:bg-[#00CFFF]/90 text-[#05070B] font-bold transition-all cursor-pointer flex items-center justify-center shrink-0 shadow-lg shadow-[#00CFFF]/20 active:scale-95"
                title="Copy Referral Link"
              >
                {copiedLink ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            {copiedLink && (
              <div className="text-[10px] font-mono text-[#32D583] text-center animate-fadeIn">
                ✓ Referral link copied to clipboard!
              </div>
            )}
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
          <button onClick={() => setErrorMsg(null)} className="text-white hover:underline text-xs font-mono cursor-pointer">
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
          <button onClick={() => setSuccessMsg(null)} className="text-white hover:underline text-xs font-mono cursor-pointer">
            Dismiss
          </button>
        </div>
      )}

      {/* ========================================================
          2. KPI SUMMARY METRICS GRID
         ======================================================== */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        {/* Direct Referrals */}
        <div className="p-4 sm:p-5 rounded-2xl bg-[#07101D] border border-white/[0.08] shadow-lg flex flex-col justify-between group hover:border-[#00CFFF]/30 transition-all">
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
        <div className="p-4 sm:p-5 rounded-2xl bg-[#07101D] border border-white/[0.08] shadow-lg flex flex-col justify-between group hover:border-[#32D583]/30 transition-all">
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
        <div className="p-4 sm:p-5 rounded-2xl bg-[#07101D] border border-white/[0.08] shadow-lg flex flex-col justify-between group hover:border-[#F59E0B]/30 transition-all">
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
        <div className="p-4 sm:p-5 rounded-2xl bg-[#07101D] border border-white/[0.08] shadow-lg flex flex-col justify-between group hover:border-[#00CFFF]/30 transition-all">
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
        <div className="p-4 sm:p-5 rounded-2xl bg-[#07101D] border border-white/[0.08] shadow-lg flex flex-col justify-between col-span-2 sm:col-span-1 group hover:border-[#32D583]/30 transition-all">
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
          3. TEAM EQUILIBRIUM & LEG BALANCE METER
         ======================================================== */}
      <div className="p-5 sm:p-6 rounded-2xl bg-[#07101D] border border-white/[0.08] shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#00CFFF]/10 border border-[#00CFFF]/20 flex items-center justify-center text-[#00CFFF]">
              <GitFork className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Team Equilibrium &amp; Leg Balance</h2>
              <p className="text-[11px] text-[#98A2B3]">Real-time ratio between Left and Right team distribution.</p>
            </div>
          </div>
          <div className="text-xs font-mono text-[#00CFFF] bg-[#00CFFF]/10 px-2.5 py-1 rounded-lg border border-[#00CFFF]/20">
            Total Team: {totalTeam} Members
          </div>
        </div>

        {/* Visual Progress Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs font-mono">
            <span className="text-[#00CFFF]">Left Team: {leftTotal} ({leftPercent}%)</span>
            <span className="text-[#32D583]">Right Team: {rightTotal} ({rightPercent}%)</span>
          </div>
          <div className="h-3 w-full bg-[#05070B] rounded-full overflow-hidden p-0.5 border border-white/[0.08] flex">
            <div
              className="bg-gradient-to-r from-[#00CFFF] to-[#168BFF] h-full rounded-l-full transition-all duration-500"
              style={{ width: `${leftPercent}%` }}
            />
            <div
              className="bg-gradient-to-r from-[#10B981] to-[#32D583] h-full rounded-r-full transition-all duration-500"
              style={{ width: `${rightPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* ========================================================
          4. BINARY SALES VOLUME SECTION
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
          5. DAILY BINARY MATCHING SECTION
         ======================================================== */}
      <MatchingSection
        summary={matchingSummary}
        history={matchingHistory}
        loading={loading}
      />

      {/* ========================================================
          6. SEQUENTIAL PROMOTION SECTION
         ======================================================== */}
      <PromotionSection />

      {/* ========================================================
          7. UNPLACED DIRECT REFERRALS SECTION
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
          8. INTERACTIVE BINARY GENE TREE VIEW (International Grade)
         ======================================================== */}
      <div className="p-5 sm:p-6 rounded-2xl bg-[#07101D] border border-white/[0.08] shadow-xl overflow-hidden space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/[0.06] pb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#00CFFF]/10 border border-[#00CFFF]/20 flex items-center justify-center text-[#00CFFF]">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Genealogical Binary Tree</h2>
              <p className="text-[11px] text-[#98A2B3]">
                Interactive gene tree visualization down to depth {depth}. Click any node to inspect details.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center bg-[#05070B] border border-white/[0.08] rounded-xl p-1">
              <span className="text-[11px] text-[#98A2B3] px-2 font-mono">Depth:</span>
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
          </div>
        </div>

        {/* Tree Container */}
        <div className="w-full overflow-x-auto py-8 px-4 bg-[#05070B] rounded-2xl border border-white/[0.06] min-h-[420px] flex items-center justify-center shadow-inner">
          {loading && !treeData ? (
            <div className="flex flex-col items-center justify-center space-y-3 py-12">
              <RefreshCw className="w-7 h-7 text-[#00CFFF] animate-spin" />
              <p className="text-xs font-mono text-[#98A2B3]">Loading binary gene tree...</p>
            </div>
          ) : treeData ? (
            <div className="min-w-fit flex flex-col items-center">
              <BinaryTreeNodeRenderer
                node={treeData}
                isRoot={true}
                rootVolume={volumeSummary}
                onInspect={(node) => setInspectNode(node)}
              />
            </div>
          ) : (
            <div className="text-center py-12 text-[#98A2B3] text-xs font-mono">
              No binary tree data found.
            </div>
          )}
        </div>
      </div>

      {/* ========================================================
          9. CONFIRMATION PLACEMENT MODAL
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

      {/* ========================================================
          10. NODE INSPECT MODAL
         ======================================================== */}
      {inspectNode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-sm bg-[#07101D] border border-white/[0.12] rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#00CFFF]/15 border border-[#00CFFF]/30 flex items-center justify-center text-[#00CFFF] font-bold">
                  {inspectNode.user.displayName.charAt(0)}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">{inspectNode.user.displayName}</h3>
                  <p className="text-[11px] font-mono text-[#00CFFF]">{inspectNode.user.publicId}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInspectNode(null)}
                className="text-[#98A2B3] hover:text-white text-xs font-mono cursor-pointer p-1"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2 text-xs font-mono">
              <div className="flex justify-between p-2.5 rounded-lg bg-[#05070B] border border-white/[0.04]">
                <span className="text-[#98A2B3]">Position Side:</span>
                <span className="text-white font-bold">{inspectNode.side || 'ROOT'}</span>
              </div>
              <div className="flex justify-between p-2.5 rounded-lg bg-[#05070B] border border-white/[0.04]">
                <span className="text-[#98A2B3]">Placed At:</span>
                <span className="text-white">{inspectNode.placedAt ? new Date(inspectNode.placedAt).toLocaleDateString() : 'Direct Ancestor'}</span>
              </div>
              <div className="flex justify-between p-2.5 rounded-lg bg-[#05070B] border border-white/[0.04]">
                <span className="text-[#98A2B3]">Subtree Status:</span>
                <span className="text-[#32D583] font-bold">ACTIVE</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setInspectNode(null)}
              className="w-full py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-white text-xs font-mono font-bold transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Recursive binary gene tree visualizer component with interactive inspect
 */
interface NodeRendererProps {
  node: TreeNode | null;
  isRoot?: boolean;
  side?: 'LEFT' | 'RIGHT';
  rootVolume?: VolumeSummary | null;
  onInspect?: (node: TreeNode) => void;
}

const BinaryTreeNodeRenderer: React.FC<NodeRendererProps> = ({ node, isRoot = false, side, rootVolume, onInspect }) => {
  if (!node) {
    return (
      <div className="flex flex-col items-center">
        <div className="w-28 sm:w-36 p-3 rounded-xl border border-dashed border-white/[0.1] bg-[#05070B] text-center opacity-60">
          <div className="text-[9px] font-mono uppercase tracking-wider text-[#667085] mb-0.5">
            {side || 'Position'}
          </div>
          <div className="text-[11px] font-mono text-[#98A2B3]">Empty Slot</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center">
      {/* Node Card */}
      <div
        onClick={() => onInspect?.(node)}
        className={`w-32 sm:w-40 p-3 rounded-2xl border transition-all relative cursor-pointer group hover:scale-105 ${
          isRoot
            ? 'bg-gradient-to-br from-[#0B1728] to-[#07101D] border-[#00CFFF]/50 shadow-xl shadow-[#00CFFF]/15'
            : node.side === 'LEFT'
            ? 'bg-[#05070B] border-[#00CFFF]/30 hover:border-[#00CFFF]'
            : 'bg-[#05070B] border-[#32D583]/30 hover:border-[#32D583]'
        }`}
      >
        <div className="flex items-center justify-between mb-1.5">
          <span
            className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
              isRoot
                ? 'bg-[#00CFFF]/25 text-[#00CFFF] border border-[#00CFFF]/40'
                : node.side === 'LEFT'
                ? 'bg-[#00CFFF]/15 text-[#00CFFF]'
                : 'bg-[#32D583]/15 text-[#32D583]'
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

        <div className="text-xs font-bold text-white truncate group-hover:text-[#00CFFF] transition-colors">{node.user.displayName}</div>
        <div className="text-[10px] font-mono text-[#00CFFF] truncate mt-0.5">
          {node.user.publicId}
        </div>

        {/* Root Volume Badges */}
        {isRoot && rootVolume && (
          <div className="mt-2.5 pt-2 border-t border-white/[0.08] grid grid-cols-2 gap-1 text-[9px] font-mono">
            <div className="text-[#00CFFF] flex items-center justify-between">
              <span>L:</span>
              <span className="font-bold">{rootVolume.availableForFutureMatching.left}</span>
            </div>
            <div className="text-[#32D583] flex items-center justify-between border-l border-white/[0.08] pl-1">
              <span>R:</span>
              <span className="font-bold">{rootVolume.availableForFutureMatching.right}</span>
            </div>
          </div>
        )}
      </div>

      {/* Branch Connectors and Children */}
      <div className="w-0.5 h-6 bg-gradient-to-b from-white/[0.2] to-white/[0.1]"></div>

      <div className="relative flex justify-center items-start pt-0">
        <div className="grid grid-cols-2 gap-4 sm:gap-8 relative">
          <div className="absolute top-0 left-1/4 right-1/4 h-0.5 bg-white/[0.15]"></div>

          {/* Left Branch */}
          <div className="flex flex-col items-center">
            <div className="w-0.5 h-4 bg-[#00CFFF]/50"></div>
            <BinaryTreeNodeRenderer node={node.left} side="LEFT" rootVolume={rootVolume} onInspect={onInspect} />
          </div>

          {/* Right Branch */}
          <div className="flex flex-col items-center">
            <div className="w-0.5 h-4 bg-[#32D583]/50"></div>
            <BinaryTreeNodeRenderer node={node.right} side="RIGHT" rootVolume={rootVolume} onInspect={onInspect} />
          </div>
        </div>
      </div>
    </div>
  );
};
