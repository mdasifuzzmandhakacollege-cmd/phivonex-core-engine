import React, { useState, useEffect } from 'react';
import { PhxGlassCard, TabularCounter } from '../ui/phivonex';
import { GitFork, Lock, Unlock, CheckCircle2, AlertCircle, Loader2, Copy, Check, Users, Trophy, ArrowRight } from 'lucide-react';

interface UnilevelRoyaltyMatrixHubProps {
  user: any;
  onNavigateTab: (tab: string) => void;
}

export const UnilevelRoyaltyMatrixHub: React.FC<UnilevelRoyaltyMatrixHubProps> = ({ user, onNavigateTab }) => {
  const [overview, setOverview] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [expandedGen, setExpandedGen] = useState<number | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  const fetchOverview = async () => {
    try {
      const res = await fetch('/api/unilevel/royalties/overview', { credentials: 'include' });
      const data = await res.json();
      if (data.success || data.data) {
        setOverview(data.data || data);
      }
    } catch (err) {
      console.warn('Failed to load unilevel royalty overview:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview();
  }, []);

  const referralUrl = overview?.referralUrl || `https://phivonex.com/register?ref=${user?.referralCode || 'PHX'}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(referralUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const personalActiveInvestment = overview?.personalActiveInvestmentUsd || 0;
  const directSponsorsCount = overview?.directActiveSponsorsCount || 0;
  const generations = overview?.generations || [];
  const recentPayouts = overview?.recentPayouts || [];

  return (
    <div className="space-y-6 animate-fadeIn min-w-0">
      {/* Hero Header & Qualification Telemetry */}
      <div className="oneui-glass-card rounded-[24px] p-5 sm:p-7 relative overflow-hidden">
        <div className="absolute right-0 top-0 w-80 h-80 bg-[#00E5FF]/[0.06] rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div className="space-y-3 max-w-xl">
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-full text-xs font-mono font-bold tracking-wider uppercase bg-[#00E5FF]/15 text-[#00E5FF] border border-[#00E5FF]/30">
                16-GENERATION ROI-ON-ROI DISTRIBUTION
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              PHIVONEX UNILEVEL ROYALTY MATRIX
            </h1>

            <p className="text-xs sm:text-sm text-[#98A2B3] leading-relaxed">
              Unlock up to 16 generations of recursive yield royalties (40.0% total distribution pool) based on active personal investment and direct partner sponsorship count.
            </p>
          </div>

          <div className="flex items-center gap-3 bg-[#050807]/90 backdrop-blur-md p-4 rounded-2xl border border-white/10 shrink-0">
            <button
              onClick={handleCopyLink}
              className="py-2.5 px-4 rounded-xl bg-[#00E5FF] hover:bg-[#00cce6] text-[#050807] font-bold text-xs flex items-center gap-2 transition-all cursor-pointer"
            >
              {copiedLink ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span>{copiedLink ? 'Copied Referral Link!' : 'Copy Referral Link'}</span>
            </button>
          </div>
        </div>

        {/* Quick Telemetry Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-8 pt-6 border-t border-white/10">
          <div className="p-4 rounded-2xl bg-[#050807]/60 border border-white/10">
            <span className="text-[10px] font-mono text-[#98A2B3] uppercase">Personal Active Capital</span>
            <div className="text-lg font-bold font-mono text-white mt-1">
              <TabularCounter value={personalActiveInvestment} decimals={2} prefix="$" />
            </div>
          </div>
          <div className="p-4 rounded-2xl bg-[#050807]/60 border border-white/10">
            <span className="text-[10px] font-mono text-[#98A2B3] uppercase">Active Direct Sponsors</span>
            <div className="text-lg font-bold font-mono text-[#00E5FF] mt-1">
              {directSponsorsCount} Partners
            </div>
          </div>
          <div className="p-4 rounded-2xl bg-[#050807]/60 border border-white/10">
            <span className="text-[10px] font-mono text-[#98A2B3] uppercase">Unlocked Generations</span>
            <div className="text-lg font-bold font-mono text-[#32D583] mt-1">
              {generations.filter((g: any) => g.isUnlocked).length} / 16 Unlocked
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="py-20 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-[#00E5FF]" />
        </div>
      ) : (
        <div className="space-y-6">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <GitFork className="w-5 h-5 text-[#00E5FF]" />
            <span>16-Generation Unilevel Access Grid</span>
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {generations.map((gen: any) => {
              const isUnlocked = gen.isUnlocked;
              const isExpanded = expandedGen === gen.generationLevel;

              return (
                <div
                  key={gen.generationLevel}
                  onClick={() => !isUnlocked && setExpandedGen(isExpanded ? null : gen.generationLevel)}
                  className={`p-4 sm:p-5 rounded-[22px] border transition-all relative overflow-hidden ${
                    isUnlocked
                      ? 'oneui-glass-card border-[#00E5FF]/35 shadow-lg shadow-[#00E5FF]/10'
                      : 'bg-[#050807]/75 border-white/[0.08] opacity-80 hover:opacity-100 cursor-pointer'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-mono font-bold text-white px-2.5 py-0.5 rounded-lg bg-white/[0.06]">
                      Generation {gen.generationLevel}
                    </span>
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                      isUnlocked ? 'bg-[#00E676]/15 text-[#00E676]' : 'bg-[#F5B800]/15 text-[#F5B800]'
                    }`}>
                      {gen.royaltyPercentage}% Royalty
                    </span>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">Status</span>
                      <span className={`font-bold flex items-center gap-1 ${isUnlocked ? 'text-[#00E676]' : 'text-[#F5B800]'}`}>
                        {isUnlocked ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                        {isUnlocked ? 'Unlocked' : 'Locked'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">USDT Earned</span>
                      <span className="font-mono text-[#F5B800] font-bold tabular-nums">
                        ${Number(gen.totalEarnedUsdt ?? gen.totalEarnedUsd ?? 0).toFixed(4)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">PHIVO Earned</span>
                      <span className="font-mono text-[#00E5FF] font-bold tabular-nums">
                        {Number(gen.totalEarnedPhivo ?? 0).toFixed(4)} PHIVO
                      </span>
                    </div>
                  </div>

                  {!isUnlocked && (
                    <div className="mt-3 pt-3 border-t border-white/10 text-[11px] text-[#F5B800]">
                      {gen.missingRequirementDescription || 'Click to view unlock requirements'}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Recent Settlements Feed */}
          <PhxGlassCard>
            <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
              <Trophy className="w-4 h-4 text-[#00E5FF]" />
              <span>Recent Royalty Settlement Feed</span>
            </h3>

            {recentPayouts.length === 0 ? (
              <p className="text-xs text-[#98A2B3] text-center py-8">No unilevel royalty settlements recorded yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-white/10 text-[#98A2B3] font-mono">
                      <th className="pb-3">Date</th>
                      <th className="pb-3">Source Product</th>
                      <th className="pb-3">Generation</th>
                      <th className="pb-3">Payout Amount</th>
                      <th className="pb-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06] font-mono">
                    {recentPayouts.map((p: any, idx: number) => (
                      <tr key={idx} className="hover:bg-white/[0.02]">
                        <td className="py-3 text-[#98A2B3]">{new Date(p.createdAt || p.epochDate).toLocaleDateString()}</td>
                        <td className="py-3 text-white font-sans font-semibold">{p.sourceProductType}</td>
                        <td className="py-3 text-[#00E5FF]">Gen {p.generationLevel}</td>
                        <td className="py-3 text-[#32D583] font-bold">
                          +{Number(p.royaltyAmount || p.amount || 0).toFixed(4)} {p.currency === 'PHIVO' ? 'PHIVO' : 'USDT'}
                        </td>
                        <td className="py-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            p.status === 'SETTLED' ? 'bg-[#32D583]/15 text-[#32D583]' : 'bg-[#F5B800]/15 text-[#F5B800]'
                          }`}>
                            {p.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </PhxGlassCard>
        </div>
      )}
    </div>
  );
};
