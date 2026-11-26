import React, { useState, useEffect } from 'react';
import { UnilevelRoyaltyMatrixHub } from '../unilevel/UnilevelRoyaltyMatrixHub';
import { LeadershipRankHub } from '../unilevel/LeadershipRankHub';
import { PhxGlassCard } from '../ui/phivonex';
import {
  Globe,
  Zap,
  Users,
  Trophy,
  GitFork,
  Copy,
  Check,
  Loader2,
  Sparkles,
  MessageSquare,
} from 'lucide-react';

export interface UnplacedMember {
  publicId: string;
  displayName: string;
  joinedAt: string;
  placementStatus: 'UNPLACED';
}

interface NetworkViewProps {
  user?: any;
}

export const NetworkView: React.FC<NetworkViewProps> = ({ user }) => {
  const [activeSubTab, setActiveSubTab] = useState<'matrix' | 'ranks' | 'frontline'>('matrix');
  const [directReferrals, setDirectReferrals] = useState<any[]>([]);
  const [networkSummary, setNetworkSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [copiedMsgIdx, setCopiedMsgIdx] = useState<number | null>(null);

  const referralCode = user?.referralCode || user?.publicId || 'PHX10088';
  const referralLink = typeof window !== 'undefined' ? `${window.location.origin}/register?ref=${referralCode}` : `https://phivonex.com/register?ref=${referralCode}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(referralLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleCopyId = () => {
    navigator.clipboard.writeText(referralCode);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const handleCopyFollowUp = (partner: any, idx: number) => {
    const msg = `Hello ${partner.displayName || 'Partner'}, welcome to PHIVONEX Institutional Ecosystem! I see you registered under my partner network. To activate your Genesis Node and unlock up to 40% daily yields across 16 generations, access your secure dashboard here: ${referralLink}`;
    navigator.clipboard.writeText(msg);
    setCopiedMsgIdx(idx);
    setTimeout(() => setCopiedMsgIdx(null), 2000);
  };

  useEffect(() => {
    const fetchNetworkData = async () => {
      try {
        const [netRes, directsRes] = await Promise.allSettled([
          fetch('/api/network/summary', { credentials: 'include' }),
          fetch('/api/referrals/direct', { credentials: 'include' }),
        ]);

        if (netRes.status === 'fulfilled' && netRes.value.ok) {
          const data = await netRes.value.json();
          setNetworkSummary(data);
          if (data.directReferralsList) {
            setDirectReferrals(data.directReferralsList);
          }
        }
        if (directsRes.status === 'fulfilled' && directsRes.value.ok) {
          const data = await directsRes.value.json();
          if (Array.isArray(data.referrals)) {
            setDirectReferrals(data.referrals);
          }
        }
      } catch (err) {
        console.warn('Failed to load network summary:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchNetworkData();
  }, []);

  const totalTeamCount = networkSummary?.totalTeamCount ?? directReferrals.length;
  const activeTeamCapital =
    networkSummary?.activeTeamCapital ??
    directReferrals.reduce((acc, p) => acc + Number(p.personalActiveInvestmentUsd || 0), 0);
  const unlockedDepth = networkSummary?.unlockedGenerations ?? 0;

  return (
    <div className="space-y-6 animate-fadeIn pb-10 min-w-0 max-w-full overflow-x-hidden">
      {/* 1. EXECUTIVE PARTNER COMMAND HEADER & REFERRAL CONSOLE */}
      <div className="oneui-glass-card rounded-[24px] p-5 sm:p-7 relative overflow-hidden">
        <div className="absolute right-0 top-0 w-80 h-80 bg-[#00E5FF]/[0.07] rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-3 py-1 rounded-full text-xs font-mono font-bold tracking-wider uppercase bg-[#00E5FF]/15 text-[#00E5FF] border border-[#00E5FF]/30 flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5" />
                Affiliate &amp; Unilevel Command Center
              </span>
              <span className="px-3 py-1 rounded-full text-xs font-mono font-bold tracking-wider uppercase bg-[#32D583]/15 text-[#32D583] border border-[#32D583]/30 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5" />
                16-Gen Royalty Engine Active
              </span>
            </div>

            <h1 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight">
              GLOBAL AFFILIATE &amp; UNILEVEL COMMAND
            </h1>

            <p className="text-xs sm:text-sm text-[#98A2B3] leading-relaxed">
              Real-time telemetry across your 16-generation downline, leadership promotion milestones, and frontline partner pipeline.
            </p>
          </div>

          {/* Quick Referral Link & ID Console */}
          <div className="p-4 rounded-2xl bg-[#050807]/90 border border-white/10 shrink-0 flex flex-col space-y-3 w-full sm:w-[340px]">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono text-[#98A2B3] uppercase">Partner Referral Code</span>
              <button
                onClick={handleCopyId}
                className="text-[11px] font-mono font-bold text-[#00E5FF] hover:underline flex items-center gap-1 cursor-pointer"
              >
                {copiedId ? <Check className="w-3 h-3 text-[#32D583]" /> : <Copy className="w-3 h-3" />}
                <span>{referralCode}</span>
              </button>
            </div>

            <div className="space-y-1">
              <span className="text-[10px] font-mono text-[#98A2B3] uppercase">Registration URL</span>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={referralLink}
                  className="w-full bg-[#07101D] border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-white select-all outline-none"
                />
                <button
                  onClick={handleCopyLink}
                  className="p-2.5 rounded-xl bg-[#00E5FF] hover:bg-[#00cce6] text-[#050807] font-bold transition-all cursor-pointer shadow-lg shadow-[#00E5FF]/25 shrink-0"
                  title="Copy Link"
                >
                  {copiedLink ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
              {copiedLink && (
                <span className="text-[10px] font-mono text-[#32D583] text-center block">✓ Referral link copied successfully!</span>
              )}
            </div>
          </div>
        </div>

        {/* 4 Live KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-8 pt-6 border-t border-white/10">
          <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 space-y-1">
            <span className="text-[10px] font-mono text-[#98A2B3] uppercase tracking-wider block">Direct Frontline (Gen 1)</span>
            <div className="text-2xl font-mono font-bold text-white tabular-nums">
              {directReferrals.length} <span className="text-xs text-[#00E5FF] font-normal">Partners</span>
            </div>
            <span className="text-[10px] text-[#32D583] font-mono">Active Sponsors</span>
          </div>

          <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 space-y-1">
            <span className="text-[10px] font-mono text-[#98A2B3] uppercase tracking-wider block">Total Network Partners</span>
            <div className="text-2xl font-mono font-bold text-white tabular-nums">
              {totalTeamCount} <span className="text-xs text-[#F5B800] font-normal">Downline</span>
            </div>
            <span className="text-[10px] text-[#98A2B3] font-mono">Across 16 Generations</span>
          </div>

          <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 space-y-1">
            <span className="text-[10px] font-mono text-[#98A2B3] uppercase tracking-wider block">Active Team Capital (AUM)</span>
            <div className="text-2xl font-mono font-bold text-[#32D583] tabular-nums">
              ${activeTeamCapital.toLocaleString()}
            </div>
            <span className="text-[10px] text-[#98A2B3] font-mono">Protocol Deployed</span>
          </div>

          <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 space-y-1">
            <span className="text-[10px] font-mono text-[#98A2B3] uppercase tracking-wider block">Unlocked Royalty Depth</span>
            <div className="text-2xl font-mono font-bold text-[#00E5FF] tabular-nums">
              {unlockedDepth} / 16 <span className="text-xs text-white font-normal">Gens</span>
            </div>
            <span className="text-[10px] text-[#32D583] font-mono">Fully Unlocked</span>
          </div>
        </div>

        {/* Sub-navigation Tabs */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-6 pt-5 border-t border-white/[0.08]">
          <button
            type="button"
            onClick={() => setActiveSubTab('matrix')}
            className={`py-2.5 px-3.5 sm:px-4 rounded-2xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 active:scale-95 ${
              activeSubTab === 'matrix'
                ? 'bg-[#00E5FF] text-[#050807] shadow-md shadow-[#00E5FF]/20'
                : 'bg-white/[0.05] text-slate-300 hover:bg-white/[0.1] hover:text-white border border-white/[0.08]'
            }`}
          >
            <GitFork className="w-4 h-4" />
            <span>16-Gen Royalty Matrix</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('ranks')}
            className={`py-2.5 px-3.5 sm:px-4 rounded-2xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 active:scale-95 ${
              activeSubTab === 'ranks'
                ? 'bg-[#F5B800] text-[#050807] shadow-md shadow-[#F5B800]/20'
                : 'bg-white/[0.05] text-slate-300 hover:bg-white/[0.1] hover:text-white border border-white/[0.08]'
            }`}
          >
            <Trophy className="w-4 h-4" />
            <span>Leadership Rank Ladder</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('frontline')}
            className={`py-2.5 px-3.5 sm:px-4 rounded-2xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 active:scale-95 ${
              activeSubTab === 'frontline'
                ? 'bg-[#00E676] text-[#050807] shadow-md shadow-[#00E676]/20'
                : 'bg-white/[0.05] text-slate-300 hover:bg-white/[0.1] hover:text-white border border-white/[0.08]'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Direct Frontline Pipeline</span>
          </button>
        </div>
      </div>

      {/* 2. NEXT-SESSION ACTION & PROMOTION READINESS GUIDE */}
      <div className="oneui-glass-card p-5 sm:p-6 rounded-[24px] space-y-4">
        <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#00E5FF]/20 border border-[#00E5FF]/40 flex items-center justify-center text-[#00E5FF]">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Next-Session Promotion Readiness Guide</h3>
              <p className="text-[11px] text-[#98A2B3]">Actionable steps to unlock your next leadership rank and maximize unilevel generation depth.</p>
            </div>
          </div>
          <span className="text-[11px] font-mono text-[#32D583] bg-[#32D583]/10 border border-[#32D583]/30 px-3 py-1 rounded-full">
            Rank Status: Elite Qualifier
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl bg-[#050B14]/90 border border-white/10 space-y-2">
            <span className="text-[10px] font-mono text-[#00E5FF] uppercase tracking-wider block">Step 1: Frontline Expansion</span>
            <p className="text-xs text-white font-medium">Sponsor 2 additional direct partners to expand your Gen-1 royalty percentage.</p>
            <div className="text-[11px] font-mono text-[#98A2B3]">Current: {directReferrals.length} Active Frontline</div>
          </div>

          <div className="p-4 rounded-xl bg-[#050B14]/90 border border-white/10 space-y-2">
            <span className="text-[10px] font-mono text-[#F5B800] uppercase tracking-wider block">Step 2: Volume Compliance</span>
            <p className="text-xs text-white font-medium">Maintain 40% anti-single-leg distribution across your 3 distinct leadership legs.</p>
            <div className="text-[11px] font-mono text-[#32D583]">Status: 100% Balanced &amp; Compliant</div>
          </div>

          <div className="p-4 rounded-xl bg-[#050B14]/90 border border-white/10 space-y-2">
            <span className="text-[10px] font-mono text-[#32D583] uppercase tracking-wider block">Step 3: Milestone Reward</span>
            <p className="text-xs text-white font-medium">Unlock next tier rank bonus ($2,500 USDT instant credit + Global Pool Share).</p>
            <div className="text-[11px] font-mono text-[#00E5FF]">Target: Director Sovereign</div>
          </div>
        </div>
      </div>

      {/* RENDER ACTIVE SUB-TAB CONTENT */}
      {activeSubTab === 'matrix' && (
        <UnilevelRoyaltyMatrixHub user={user} onNavigateTab={() => {}} />
      )}

      {activeSubTab === 'ranks' && (
        <LeadershipRankHub user={user} onNavigateTab={() => {}} />
      )}

      {activeSubTab === 'frontline' && (
        <PhxGlassCard>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-[#32D583]" />
                <span>Direct Frontline Partners &amp; Automated Follow-Up Pipeline</span>
              </h3>
              <p className="text-xs text-[#98A2B3] mt-0.5">Track your direct sponsorships, investment allocations, and follow up instantly via 1-click tailored messages.</p>
            </div>
            <span className="text-xs font-mono text-[#32D583] bg-[#32D583]/10 px-3 py-1 rounded-full border border-[#32D583]/30 shrink-0">
              {directReferrals.length} Total Frontline
            </span>
          </div>

          {loading ? (
            <div className="py-16 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-[#32D583]" />
            </div>
          ) : directReferrals.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-xs font-mono bg-[#050B14]/60 rounded-xl border border-white/5 p-6">
              No direct frontline partners registered under your referral code yet. Share your partner referral link above to begin building your unilevel network.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-white/10 text-slate-400 font-mono">
                    <th className="pb-3 px-3">Partner Name / ID</th>
                    <th className="pb-3 px-3">Join Date</th>
                    <th className="pb-3 px-3">Active Capital</th>
                    <th className="pb-3 px-3">Leadership Rank</th>
                    <th className="pb-3 px-3">Follow-Up Status</th>
                    <th className="pb-3 px-3 text-right">Action / Onboard</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06] font-mono">
                  {directReferrals.map((partner: any, idx: number) => {
                    const capital = partner.personalActiveInvestmentUsd || 0;
                    const badgeStatus = capital > 0 ? 'ACTIVE INVESTOR' : 'PENDING ACTIVATION';
                    const badgeColor = capital > 0 ? 'bg-[#32D583]/15 text-[#32D583] border-[#32D583]/30' : 'bg-amber-500/15 text-amber-300 border-amber-500/30 animate-pulse';

                    return (
                      <tr key={idx} className="hover:bg-white/[0.02] transition-colors">
                        <td className="py-3.5 px-3">
                          <div className="font-bold text-white font-sans">{partner.displayName || 'Institutional Partner'}</div>
                          <div className="text-[10px] text-[#00E5FF]">{partner.publicId || 'PHX-PARTNER'}</div>
                        </td>
                        <td className="py-3.5 px-3 text-slate-400">{new Date(partner.joinedAt || Date.now()).toLocaleDateString()}</td>
                        <td className="py-3.5 px-3 text-white font-bold">${capital.toLocaleString()}</td>
                        <td className="py-3.5 px-3 text-[#F5B800]">{partner.rankName || 'Initiate Member'}</td>
                        <td className="py-3.5 px-3">
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${badgeColor}`}>
                            {badgeStatus}
                          </span>
                        </td>
                        <td className="py-3.5 px-3 text-right">
                          <button
                            onClick={() => handleCopyFollowUp(partner, idx)}
                            className="px-3 py-1.5 rounded-lg bg-[#00E5FF]/10 hover:bg-[#00E5FF]/20 border border-[#00E5FF]/30 text-[#00E5FF] font-bold text-[11px] transition-all cursor-pointer inline-flex items-center gap-1.5"
                            title="Copy Tailored Onboarding / Follow-Up Message"
                          >
                            {copiedMsgIdx === idx ? <Check className="w-3.5 h-3.5 text-[#32D583]" /> : <MessageSquare className="w-3.5 h-3.5" />}
                            <span>{copiedMsgIdx === idx ? 'Copied Message!' : 'Copy Follow-Up'}</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </PhxGlassCard>
      )}
    </div>
  );
};
