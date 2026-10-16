import React, { useState, useEffect, useCallback } from 'react';
import {
  Trophy,
  CheckCircle2,
  Lock,
  ArrowRight,
  TrendingUp,
  ShieldCheck,
  Zap,
  RefreshCw,
  Users,
  ChevronRight,
  Check,
  Award,
} from 'lucide-react';
import { ActiveOfferCards } from './ActiveOfferCards';

export interface PromotionRule {
  id: string;
  rankKey: string;
  rankName: string;
  rankOrder: number;
  qualificationType: 'NONE' | 'MATCHING' | 'LEADERSHIP';
  requiredLeft: number;
  requiredRight: number;
  requiredLeaderRank: string | null;
  legBalanceRule: 'FLEXIBLE' | 'STRICT';
  rewardType?: 'USDT' | 'NON_CASH';
  rewardUsd: number;
  rewardTitle?: string | null;
  rewardDescription?: string | null;
  rewardDisplayValueUsd?: number | null;
  flushRule: string;
  status: 'ACTIVE' | 'INACTIVE';
  version: number;
}

export interface UserRankState {
  userId: string;
  currentRank: string;
  currentRankName: string;
  currentRankOrder: number;
  nextRank: string | null;
  nextRankName: string | null;
  nextRankOrder: number | null;
  qualificationType: 'NONE' | 'MATCHING' | 'LEADERSHIP' | null;
  stageProgress: {
    matching?: {
      leftProgress: number;
      rightProgress: number;
      requiredLeft: number;
      requiredRight: number;
      progressPct: number;
      cumulativeConsumedLeft: number;
      cumulativeConsumedRight: number;
      totalActiveVolumeLeft: number;
      totalActiveVolumeRight: number;
    };
    leadership?: {
      leftLeaders: number;
      rightLeaders: number;
      requiredLeft: number;
      requiredRight: number;
      requiredLeaderRank: string;
      requiredLeaderRankName: string;
      legBalanceRule: string;
      progressPct: number;
      leftLeaderDetails: Array<{ userId: string; publicId: string; fullName: string }>;
      rightLeaderDetails: Array<{ userId: string; publicId: string; fullName: string }>;
    };
  };
  completedEvents: Array<{
    id: string;
    publicPromotionId: string;
    rankKey: string;
    rankName: string;
    rankOrder: number;
    previousRank: string;
    qualificationType: string;
    requiredLeft: number;
    requiredRight: number;
    actualLeft: number;
    actualRight: number;
    consumedLeft: number;
    consumedRight: number;
    ruleVersion: number;
    rewardType?: 'USDT' | 'NON_CASH';
    rewardUsd: number;
    rewardTitle?: string | null;
    rewardDescription?: string | null;
    rewardDisplayValueUsd?: number | null;
    status: string;
    completedAt: string;
  }>;
  ladder: PromotionRule[];
  lastPromotedAt: string | null;
  lastEvaluatedAt: string | null;
}

interface PromotionSectionProps {
  data?: any;
  loading?: boolean;
  onNavigateTab?: (tab: string) => void;
}

const DEFAULT_LADDER: PromotionRule[] = [
  {
    id: '1',
    rankKey: 'STANDARD',
    rankName: 'Standard Member',
    rankOrder: 0,
    qualificationType: 'NONE',
    requiredLeft: 0,
    requiredRight: 0,
    requiredLeaderRank: null,
    legBalanceRule: 'FLEXIBLE',
    rewardUsd: 0,
    flushRule: 'NONE',
    status: 'ACTIVE',
    version: 1,
  },
  {
    id: '2',
    rankKey: 'NODE_BUILDER',
    rankName: 'Node Builder',
    rankOrder: 1,
    qualificationType: 'MATCHING',
    requiredLeft: 20,
    requiredRight: 20,
    requiredLeaderRank: null,
    legBalanceRule: 'STRICT',
    rewardUsd: 0,
    flushRule: 'CONSUME_STAGE_REQUIREMENT',
    status: 'ACTIVE',
    version: 1,
  },
  {
    id: '3',
    rankKey: 'NODE_MASTER',
    rankName: 'Node Master',
    rankOrder: 2,
    qualificationType: 'MATCHING',
    requiredLeft: 50,
    requiredRight: 50,
    requiredLeaderRank: null,
    legBalanceRule: 'STRICT',
    rewardUsd: 0,
    flushRule: 'CONSUME_STAGE_REQUIREMENT',
    status: 'ACTIVE',
    version: 1,
  },
  {
    id: '4',
    rankKey: 'NODE_CAPTAIN',
    rankName: 'Node Captain',
    rankOrder: 3,
    qualificationType: 'MATCHING',
    requiredLeft: 100,
    requiredRight: 100,
    requiredLeaderRank: null,
    legBalanceRule: 'STRICT',
    rewardUsd: 0,
    flushRule: 'CONSUME_STAGE_REQUIREMENT',
    status: 'ACTIVE',
    version: 1,
  },
  {
    id: '5',
    rankKey: 'NODE_COMMANDER',
    rankName: 'Node Commander',
    rankOrder: 4,
    qualificationType: 'LEADERSHIP',
    requiredLeft: 2,
    requiredRight: 3,
    requiredLeaderRank: 'NODE_CAPTAIN',
    legBalanceRule: 'FLEXIBLE',
    rewardUsd: 0,
    flushRule: 'NONE',
    status: 'ACTIVE',
    version: 1,
  },
  {
    id: '6',
    rankKey: 'NODE_AMBASSADOR',
    rankName: 'Node Ambassador',
    rankOrder: 5,
    qualificationType: 'LEADERSHIP',
    requiredLeft: 3,
    requiredRight: 4,
    requiredLeaderRank: 'NODE_COMMANDER',
    legBalanceRule: 'FLEXIBLE',
    rewardUsd: 0,
    flushRule: 'NONE',
    status: 'ACTIVE',
    version: 1,
  },
  {
    id: '7',
    rankKey: 'NODE_TITAN',
    rankName: 'Node Titan',
    rankOrder: 6,
    qualificationType: 'LEADERSHIP',
    requiredLeft: 4,
    requiredRight: 5,
    requiredLeaderRank: 'NODE_AMBASSADOR',
    legBalanceRule: 'FLEXIBLE',
    rewardUsd: 0,
    flushRule: 'NONE',
    status: 'ACTIVE',
    version: 1,
  },
];

export const PromotionSection: React.FC<PromotionSectionProps> = ({ onNavigateTab }) => {
  const [rankState, setRankState] = useState<UserRankState | null>(null);
  const [loadingRank, setLoadingRank] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const formatDate = (dateStr: string | null): string => {
    if (!dateStr) return 'Not Available';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return 'Not Available';
      return d.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return 'Not Available';
    }
  };

  // Fetch Authoritative Rank State
  const fetchRankState = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    else setLoadingRank(true);
    try {
      const res = await fetch('/api/promotions/ranks/me', { credentials: 'include' });
      const data = await res.json();
      if (res.ok && data.success) {
        setRankState(data.state);
      }
    } catch (err) {
      console.warn('[PromotionSection] Error fetching rank state:', err);
    } finally {
      setLoadingRank(false);
      if (isManual) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchRankState();
  }, [fetchRankState]);

  const currentRankName = rankState?.currentRankName || 'Standard Member';
  const currentRankOrder = rankState?.currentRankOrder ?? 0;
  const nextRankName = rankState?.nextRankName;
  const matchingStage = rankState?.stageProgress.matching;
  const leadershipStage = rankState?.stageProgress.leadership;

  const ladder = rankState?.ladder && rankState.ladder.length > 0
    ? rankState.ladder
    : DEFAULT_LADDER;

  return (
    <div className="space-y-6">
      {/* Active Promotional Offer Cards */}
      <ActiveOfferCards onNavigateTab={onNavigateTab} />

      <div className="p-5 sm:p-6 rounded-2xl bg-[#07101D] border border-white/[0.08] shadow-xl space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.06] pb-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#F59E0B]/10 border border-[#F59E0B]/20 flex items-center justify-center text-[#F59E0B] shrink-0">
            <Trophy className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-white tracking-wide">Promotion &amp; Rank Ladder</h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#F59E0B]/10 text-[#F59E0B] border border-[#F59E0B]/20 font-bold">
                Sequential Progression
              </span>
            </div>
            <p className="text-xs text-[#98A2B3]">
              Advance through PHIVONEX promotion ranks step-by-step.
            </p>
          </div>
        </div>

        {/* Current Rank Badge & Refresh Button */}
        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#05070B] border border-white/[0.06] text-white">
            <ShieldCheck className="w-4 h-4 text-[#00CFFF]" />
            <div>
              <div className="text-[9px] uppercase font-mono text-[#98A2B3]">Current Rank</div>
              <div className="text-xs font-bold font-mono text-[#00CFFF]">
                {currentRankName}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => fetchRankState(true)}
            disabled={refreshing || loadingRank}
            className="px-3 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-xs font-semibold text-white flex items-center gap-1.5 transition-all cursor-pointer min-h-[44px] disabled:opacity-50"
            title="Refresh Rank Status"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#00CFFF] ${refreshing ? 'animate-spin' : ''}`} />
            <span>{refreshing ? 'Updating...' : 'Refresh Rank Status'}</span>
          </button>
        </div>
      </div>

      {/* Target Stage Spotlight */}
      {nextRankName ? (
        <div className="p-4 sm:p-5 rounded-xl bg-[#05070B] border border-white/[0.06] space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/[0.04] pb-3">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-[#F59E0B]" />
              <span className="text-xs font-mono uppercase text-[#98A2B3]">
                Target Rank:
              </span>
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-[#F59E0B]/10 text-[#F59E0B] border border-[#F59E0B]/20 font-bold">
                {nextRankName}
              </span>
            </div>

            <span className="text-xs font-mono text-[#98A2B3]">
              Qualification: {rankState?.qualificationType === 'MATCHING' ? 'Volume Matching' : 'Leadership Downline'}
            </span>
          </div>

          {/* If Target is MATCHING based (Node Builder, Node Master, Node Captain) */}
          {matchingStage && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Left Leg Progress */}
                <div className="p-3.5 rounded-lg bg-[#07101D] border border-white/[0.04] space-y-2">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-[#98A2B3]">Left Team Requirement</span>
                    <span className="text-[#00CFFF] font-bold tabular-nums">
                      {matchingStage.leftProgress} / {matchingStage.requiredLeft} Units
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-white/[0.06] overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-[#00CFFF] to-[#168BFF] rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.min(100, (matchingStage.leftProgress / matchingStage.requiredLeft) * 100)}%`,
                      }}
                    />
                  </div>
                </div>

                {/* Right Leg Progress */}
                <div className="p-3.5 rounded-lg bg-[#07101D] border border-white/[0.04] space-y-2">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-[#98A2B3]">Right Team Requirement</span>
                    <span className="text-[#32D583] font-bold tabular-nums">
                      {matchingStage.rightProgress} / {matchingStage.requiredRight} Units
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-white/[0.06] overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-[#32D583] to-[#12B76A] rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.min(100, (matchingStage.rightProgress / matchingStage.requiredRight) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs font-mono text-[#98A2B3] pt-1">
                <span>
                  Stage Requirement: <strong>{matchingStage.requiredLeft} Left / {matchingStage.requiredRight} Right</strong> matching units.
                </span>
                <span className="text-[#F59E0B] font-bold">
                  Overall Completion: {matchingStage.progressPct}%
                </span>
              </div>
            </div>
          )}

          {/* If Target is LEADERSHIP based (Node Commander, Node Ambassador, Node Titan) */}
          {leadershipStage && (
            <div className="space-y-3">
              <div className="p-3.5 rounded-lg bg-[#07101D] border border-white/[0.04] space-y-3">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-[#F59E0B] font-bold flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5" />
                    Leadership Requirement: {leadershipStage.requiredLeft} / {leadershipStage.requiredRight} Qualified {leadershipStage.requiredLeaderRankName}
                  </span>
                  <span className="text-[#F59E0B] font-bold">
                    {leadershipStage.progressPct}% Qualified
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono">
                  <div className="p-3 rounded-lg bg-[#05070B] border border-white/[0.04]">
                    <div className="text-[#98A2B3]">Left Leg Leaders</div>
                    <div className="text-lg font-bold font-mono text-white mt-1 tabular-nums">
                      {leadershipStage.leftLeaders} / {leadershipStage.requiredLeft}
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-[#05070B] border border-white/[0.04]">
                    <div className="text-[#98A2B3]">Right Leg Leaders</div>
                    <div className="text-lg font-bold font-mono text-white mt-1 tabular-nums">
                      {leadershipStage.rightLeaders} / {leadershipStage.requiredRight}
                    </div>
                  </div>
                </div>

                <div className="w-full h-2 rounded-full bg-white/[0.06] overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#F59E0B] to-[#D97706] rounded-full transition-all duration-500"
                    style={{ width: `${leadershipStage.progressPct}%` }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="p-5 rounded-xl bg-[#05070B] border border-[#32D583]/30 flex items-center gap-3">
          <ShieldCheck className="w-8 h-8 text-[#32D583] shrink-0" />
          <div>
            <div className="text-sm font-bold font-mono text-white">Top Rank Achieved</div>
            <div className="text-xs text-[#98A2B3]">
              You have completed all promotion ranks up to Rank 6 (Node Titan).
            </div>
          </div>
        </div>
      )}

      {/* The 7-Rank Progression Ladder */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs font-mono text-[#98A2B3] uppercase tracking-wider">
          <span className="flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-[#00CFFF]" />
            Official Promotion Ladder Sequence
          </span>
          <span className="text-[#667085]">Rank 0 through Rank 6</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {ladder.map((rule) => {
            const isCompleted = currentRankOrder >= rule.rankOrder;
            const isCurrentTarget = nextRankName === rule.rankKey;

            return (
              <div
                key={rule.rankKey}
                className={`p-3.5 rounded-xl border transition-all text-xs font-mono space-y-2 ${
                  isCompleted
                    ? 'bg-[#32D583]/5 border-[#32D583]/30'
                    : isCurrentTarget
                    ? 'bg-[#F59E0B]/5 border-[#F59E0B]/40 shadow-sm'
                    : 'bg-[#05070B] border-white/[0.04] opacity-70'
                }`}
              >
                <div className="flex items-center justify-between pb-2 border-b border-white/[0.04]">
                  <span className="font-bold text-white">#{rule.rankOrder} {rule.rankName}</span>
                  {isCompleted ? (
                    <span className="flex items-center gap-1 text-[10px] text-[#32D583] font-bold">
                      <Check className="w-3 h-3" /> COMPLETED
                    </span>
                  ) : isCurrentTarget ? (
                    <span className="flex items-center gap-1 text-[10px] text-[#F59E0B] font-bold">
                      <Zap className="w-3 h-3" /> TARGET
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[10px] text-[#667085]">
                      <Lock className="w-3 h-3" /> LOCKED
                    </span>
                  )}
                </div>

                <div className="space-y-1 text-[11px]">
                  <div className="text-[#98A2B3]">
                    Type: <strong className="text-white">{rule.qualificationType}</strong>
                  </div>
                  <div className="text-white">
                    {rule.qualificationType === 'MATCHING'
                      ? `${rule.requiredLeft}L / ${rule.requiredRight}R Matching Units`
                      : rule.qualificationType === 'LEADERSHIP'
                      ? `${rule.requiredLeft} / ${rule.requiredRight} ${rule.requiredLeaderRank} Leaders`
                      : 'Default Tier'}
                  </div>
                  <div className="pt-1.5 border-t border-white/[0.04]">
                    {rule.rewardType === 'NON_CASH' ? (
                      <div className="flex items-center gap-1 text-amber-400 font-semibold text-[10px]">
                        <Award className="w-3 h-3 text-amber-400 shrink-0" />
                        <span>{rule.rewardTitle || 'Non-Cash Reward'}</span>
                        {rule.rewardDisplayValueUsd && (
                          <span className="text-[#98A2B3]">(${Number(rule.rewardDisplayValueUsd).toLocaleString()})</span>
                        )}
                      </div>
                    ) : rule.rewardUsd > 0 ? (
                      <span className="text-emerald-400 font-semibold text-[10px]">
                        ${Number(rule.rewardUsd).toLocaleString()} USDT Reward
                      </span>
                    ) : (
                      <span className="text-[#667085] text-[10px]">Recognition Tier</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Completed Rank Achievements History */}
      {rankState && rankState.completedEvents.length > 0 && (
        <div className="p-4 rounded-xl bg-[#05070B] border border-white/[0.06] space-y-3">
          <div className="text-xs font-mono uppercase text-[#98A2B3] tracking-wider border-b border-white/[0.04] pb-2 flex items-center justify-between">
            <span>Rank History</span>
            <span className="text-[10px] text-[#667085]">{rankState.completedEvents.length} Achieved</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="text-[#667085] border-b border-white/[0.04] text-[10px]">
                  <th className="py-2 px-2">Promotion ID</th>
                  <th className="py-2 px-2">Rank Achieved</th>
                  <th className="py-2 px-2">Order</th>
                  <th className="py-2 px-2">Type</th>
                  <th className="py-2 px-2">Reward</th>
                  <th className="py-2 px-2">Date Completed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {rankState.completedEvents.map((evt) => (
                  <tr key={evt.id} className="hover:bg-white/[0.02]">
                    <td className="py-2.5 px-2 text-[#00CFFF]">{evt.publicPromotionId}</td>
                    <td className="py-2.5 px-2 font-bold text-white">{evt.rankName}</td>
                    <td className="py-2.5 px-2 text-[#98A2B3]">#{evt.rankOrder}</td>
                    <td className="py-2.5 px-2 text-[#98A2B3]">{evt.qualificationType}</td>
                    <td className="py-2.5 px-2">
                      {evt.rewardType === 'NON_CASH' ? (
                        <span className="text-amber-400 font-semibold flex items-center gap-1 text-[11px]">
                          <Award className="w-3 h-3 text-amber-400 shrink-0" />
                          <span>{evt.rewardTitle || 'Non-Cash Entitlement'}</span>
                        </span>
                      ) : evt.rewardUsd > 0 ? (
                        <span className="text-emerald-400 font-bold">${Number(evt.rewardUsd).toLocaleString()} USDT</span>
                      ) : (
                        <span className="text-[#667085]">—</span>
                      )}
                    </td>
                    <td className="py-2.5 px-2 text-[#98A2B3]">{formatDate(evt.completedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
    </div>
  );
};
