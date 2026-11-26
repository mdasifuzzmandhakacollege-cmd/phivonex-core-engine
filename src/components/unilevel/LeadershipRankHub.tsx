import React, { useState, useEffect } from 'react';
import { PhxGlassCard, TabularCounter } from '../ui/phivonex';
import { RankCrestEmblem } from '../brand';
import { LegCapRadialGauge } from './LegCapRadialGauge';
import { Trophy, ShieldCheck, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

interface LeadershipRankHubProps {
  user: any;
  onNavigateTab: (tab: string) => void;
}

export const LeadershipRankHub: React.FC<LeadershipRankHubProps> = ({ user, onNavigateTab }) => {
  const [overview, setOverview] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchOverview = async () => {
    try {
      const res = await fetch('/api/unilevel/ranks/overview', { credentials: 'include' });
      const data = await res.json();
      if (data.success || data.data) {
        setOverview(data.data || data);
      }
    } catch (err) {
      console.warn('Failed to load rank overview:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview();
  }, []);

  const currentRankLevel = overview?.currentRankLevel ?? overview?.rankLevel ?? 0;
  const currentRankName = overview?.currentRankName ?? 'Initiate Member';
  const legs = overview?.legs || [];
  const ranksList = overview?.ranksList || [
    { rankLevel: 0, rankCode: 'INITIATE_MEMBER', rankName: 'Initiate Member', milestoneRewardUsd: 0 },
    { rankLevel: 1, rankCode: 'QUANTUM_ARCHITECT', rankName: 'Quantum Architect', milestoneRewardUsd: 1000 },
    { rankLevel: 2, rankCode: 'APEX_STRATEGIST', rankName: 'Apex Strategist', milestoneRewardUsd: 5000 },
    { rankLevel: 3, rankCode: 'VANGUARD_COMMANDER', rankName: 'Vanguard Commander', milestoneRewardUsd: 15000 },
    { rankLevel: 4, rankCode: 'SOVEREIGN_MARSHAL', rankName: 'Sovereign Marshal', milestoneRewardUsd: 50000 },
    { rankLevel: 5, rankCode: 'GLOBAL_AMBASSADOR', rankName: 'Global Ambassador', milestoneRewardUsd: 100000 },
    { rankLevel: 6, rankCode: 'TITAN_APEX_SOVEREIGN', rankName: 'Titan Apex Sovereign', milestoneRewardUsd: 250000 },
  ];

  return (
    <div className="space-y-6 animate-fadeIn min-w-0">
      {/* Hero Header */}
      <div className="oneui-glass-card rounded-[24px] p-5 sm:p-7 relative overflow-hidden">
        <div className="absolute right-0 top-0 w-80 h-80 bg-[#F5B800]/[0.06] rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div className="space-y-3 max-w-xl">
            <span className="px-3 py-1 rounded-full text-xs font-mono font-bold tracking-wider uppercase bg-[#F5B800]/15 text-[#F5B800] border border-[#F5B800]/30">
              7-STAGE CAREER &amp; LEADERSHIP RANK ENGINE
            </span>

            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              PHIVONEX CAREER RANK &amp; 40% LEG-CAP RADIAL
            </h1>

            <p className="text-xs sm:text-sm text-[#98A2B3] leading-relaxed">
              Advance through 7 prestigious career ranks with automated 40% anti-single-leg volume capping and multi-leg leadership verification.
            </p>
          </div>

          <div className="flex items-center gap-4 bg-[#050807]/90 backdrop-blur-md p-4 rounded-2xl border border-white/10 shrink-0">
            <RankCrestEmblem rank={currentRankLevel} size={64} />
            <div>
              <span className="text-[10px] font-mono text-[#98A2B3] uppercase">Achieved Rank</span>
              <h3 className="text-sm font-bold text-white">{currentRankName}</h3>
              <span className="text-xs font-mono text-[#F5B800]">Level {currentRankLevel} / 6</span>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="py-20 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-[#F5B800]" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left: 40% Leg-Cap Radial Gauge */}
          <div className="space-y-6">
            <PhxGlassCard accent="gold">
              <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#F5B800]" />
                <span>40% Anti-Single-Leg Volume Cap</span>
              </h3>
              <p className="text-xs text-[#98A2B3] mb-6">Visualizing direct sponsorship legs and anti-single-leg volume normalization.</p>

              <div className="flex justify-center py-4">
                <LegCapRadialGauge legs={legs} size={180} />
              </div>

              <div className="space-y-3 mt-4 pt-4 border-t border-white/10">
                {legs.map((leg: any, idx: number) => (
                  <div key={idx} className="flex items-center justify-between text-xs font-mono">
                    <span className="text-white">Leg #{idx + 1} ({leg.legName || 'Partner'})</span>
                    <div className="text-right">
                      <span className="text-[#00E5FF]">${(leg.cappedVolumeUsd || 0).toLocaleString()}</span>
                      <span className="text-[#98A2B3] text-[10px] block">Raw: ${(leg.rawVolumeUsd || 0).toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </PhxGlassCard>
          </div>

          {/* Right 2 Cols: 7-Stage Career Ladder */}
          <div className="lg:col-span-2 space-y-4">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Trophy className="w-5 h-5 text-[#F5B800]" />
              <span>7-Stage Career Advancement Ladder</span>
            </h2>

            <div className="space-y-4">
              {ranksList.map((rank: any) => {
                const isAchieved = currentRankLevel >= rank.rankLevel;
                const isCurrent = currentRankLevel === rank.rankLevel;

                return (
                  <div
                    key={rank.rankLevel}
                    className={`p-5 rounded-2xl border flex items-center justify-between gap-4 transition-all ${
                      isCurrent
                        ? 'bg-[#F5B800]/10 border-[#F5B800] shadow-lg shadow-[#F5B800]/15'
                        : isAchieved
                        ? 'bg-[#07101D] border-[#32D583]/40'
                        : 'bg-[#050807]/70 border-white/10 opacity-70'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <RankCrestEmblem rank={rank.rankLevel} size={54} />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-[#98A2B3]">Rank {rank.rankLevel}</span>
                          {isAchieved && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#32D583]/15 text-[#32D583]">
                              Achieved
                            </span>
                          )}
                        </div>
                        <h3 className="text-sm font-bold text-white">{rank.rankName}</h3>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] font-mono text-[#98A2B3] uppercase">Milestone Bonus</span>
                      <div className="text-sm font-bold font-mono text-[#F5B800]">
                        ${(rank.milestoneRewardUsd || 0).toLocaleString()} USDT
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
