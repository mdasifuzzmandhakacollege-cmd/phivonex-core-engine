import React from 'react';
import {
  Sparkles,
  Clock,
  ArrowLeft,
  ArrowRight,
  GitFork,
  CheckCircle2,
  AlertCircle,
  Layers,
  Calendar,
  History,
  TrendingUp,
  ShieldCheck,
  Zap,
} from 'lucide-react';

export interface MatchingComponentPlan {
  sequenceNo: number;
  tierUnits: number;
  leftUnits: number;
  rightUnits: number;
  bonusUsd: number;
}

export interface MatchingSettlementItem {
  id: string;
  publicSettlementId: string;
  businessDate: string;
  availableLeft: number;
  availableRight: number;
  consumedLeft: number;
  consumedRight: number;
  carryLeftBefore: number;
  carryRightBefore: number;
  carryLeftAfter: number;
  carryRightAfter: number;
  totalBonusUsd: number;
  status: 'COMPLETED' | 'REVERSED';
  settledAt: string;
  components: MatchingComponentPlan[];
}

export interface MatchingSummary {
  todayVolume: {
    left: number;
    right: number;
  };
  carry: {
    left: number;
    right: number;
  };
  latestSettlement: MatchingSettlementItem | null;
  totalMatchingEarnedUsd: number;
  activeTiers?: Array<{ units: number; bonusUsd?: number; rewardUsd?: number }>;
  nextSettlement: {
    scheduledTime: string;
    nextSettlementIso: string;
    msUntilNext: number;
  };
}

interface MatchingSectionProps {
  summary: MatchingSummary | null;
  history: MatchingSettlementItem[];
  loading: boolean;
}

const APPROVED_MATCHING_TIERS = [
  { units: 2, bonusUsd: 500 },
  { units: 4, bonusUsd: 1000 },
  { units: 6, bonusUsd: 1500 },
  { units: 8, bonusUsd: 2000 },
  { units: 10, bonusUsd: 2500 },
  { units: 12, bonusUsd: 3000 },
  { units: 14, bonusUsd: 3500 },
  { units: 16, bonusUsd: 4000 },
  { units: 18, bonusUsd: 4500 },
  { units: 20, bonusUsd: 5000 },
];

export const MatchingSection: React.FC<MatchingSectionProps> = ({
  summary,
  history,
  loading: _loading,
}) => {
  const formatUsd = (amount: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const formatDate = (dateStr: string): string => {
    try {
      const [year, month, day] = dateStr.split('-').map(Number);
      const d = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
      return d.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  const availableLeft = (summary?.todayVolume.left ?? 0) + (summary?.carry.left ?? 0);
  const availableRight = (summary?.todayVolume.right ?? 0) + (summary?.carry.right ?? 0);

  // Find next eligible tier
  const displayTiers = summary?.activeTiers && summary.activeTiers.length > 0
    ? summary.activeTiers
    : APPROVED_MATCHING_TIERS;

  // Find current eligible highest tier
  let currentEligibleTier: { units: number; bonusUsd: number } | null = null;
  for (const tier of [...displayTiers].sort((a, b) => b.units - a.units)) {
    const bonus = (tier as any).bonusUsd ?? (tier as any).rewardUsd ?? 0;
    if (availableLeft >= tier.units && availableRight >= tier.units) {
      currentEligibleTier = { units: tier.units, bonusUsd: bonus };
      break;
    }
  }

  return (
    <div className="p-5 sm:p-6 rounded-2xl bg-[#07101D] border border-white/[0.08] shadow-xl space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/[0.06] pb-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#00CFFF]/10 border border-[#00CFFF]/20 flex items-center justify-center text-[#00CFFF] shrink-0">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white tracking-wide">
              Daily Binary Matching
            </h2>
            <p className="text-xs text-[#98A2B3]">
              Daily settlement consumes paired Left/Right node sales volume.
            </p>
          </div>
        </div>

        {/* Next Daily Settlement Badge */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs font-mono self-start sm:self-auto">
          <Clock className="w-3.5 h-3.5 text-[#00CFFF]" />
          <span className="text-[#98A2B3]">Next Settlement:</span>
          <span className="font-bold text-white">{summary?.nextSettlement?.scheduledTime || '18:00 UTC'}</span>
        </div>
      </div>

      {/* 4 Metric Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* 1. Today's Node Sales */}
        <div className="p-4 rounded-xl bg-[#05070B] border border-white/[0.06] space-y-2">
          <div className="flex items-center justify-between text-xs font-mono text-[#98A2B3]">
            <span className="uppercase tracking-wider">Today's Sales</span>
            <TrendingUp className="w-4 h-4 text-[#00CFFF]" />
          </div>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <div>
              <div className="text-[10px] text-[#98A2B3]">Left</div>
              <div className="text-xl font-bold font-mono text-[#00CFFF] tabular-nums">
                {summary ? summary.todayVolume.left : '0'}
              </div>
              <div className="text-[10px] text-[#667085]">Units</div>
            </div>
            <div className="border-l border-white/[0.06] pl-2">
              <div className="text-[10px] text-[#98A2B3]">Right</div>
              <div className="text-xl font-bold font-mono text-[#32D583] tabular-nums">
                {summary ? summary.todayVolume.right : '0'}
              </div>
              <div className="text-[10px] text-[#667085]">Units</div>
            </div>
          </div>
        </div>

        {/* 2. Carry Forward */}
        <div className="p-4 rounded-xl bg-[#05070B] border border-white/[0.06] space-y-2">
          <div className="flex items-center justify-between text-xs font-mono text-[#98A2B3]">
            <span className="uppercase tracking-wider">Carry Forward</span>
            <GitFork className="w-4 h-4 text-[#F59E0B]" />
          </div>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <div>
              <div className="text-[10px] text-[#98A2B3]">Left Carry</div>
              <div className="text-xl font-bold font-mono text-[#00CFFF] tabular-nums">
                {summary ? summary.carry.left : '0'}
              </div>
              <div className="text-[10px] text-[#667085]">Units</div>
            </div>
            <div className="border-l border-white/[0.06] pl-2">
              <div className="text-[10px] text-[#98A2B3]">Right Carry</div>
              <div className="text-xl font-bold font-mono text-[#32D583] tabular-nums">
                {summary ? summary.carry.right : '0'}
              </div>
              <div className="text-[10px] text-[#667085]">Units</div>
            </div>
          </div>
        </div>

        {/* 3. Available for Matching */}
        <div className="p-4 rounded-xl bg-[#05070B] border border-white/[0.06] space-y-2">
          <div className="flex items-center justify-between text-xs font-mono text-[#98A2B3]">
            <span className="uppercase tracking-wider">Available Volume</span>
            <Layers className="w-4 h-4 text-[#00CFFF]" />
          </div>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <div>
              <div className="text-[10px] text-[#98A2B3]">Left Total</div>
              <div className="text-xl font-bold font-mono text-white tabular-nums">
                {availableLeft}
              </div>
              <div className="text-[10px] text-[#667085]">Units</div>
            </div>
            <div className="border-l border-white/[0.06] pl-2">
              <div className="text-[10px] text-[#98A2B3]">Right Total</div>
              <div className="text-xl font-bold font-mono text-white tabular-nums">
                {availableRight}
              </div>
              <div className="text-[10px] text-[#667085]">Units</div>
            </div>
          </div>
        </div>

        {/* 4. Total Matching Bonus Earned */}
        <div className="p-4 rounded-xl bg-[#05070B] border border-white/[0.06] space-y-2">
          <div className="flex items-center justify-between text-xs font-mono text-[#98A2B3]">
            <span className="uppercase tracking-wider">Total Earned</span>
            <ShieldCheck className="w-4 h-4 text-[#32D583]" />
          </div>
          <div className="pt-1">
            <div className="text-xl font-bold font-mono text-[#32D583] tabular-nums">
              {summary ? formatUsd(summary.totalMatchingEarnedUsd) : '$0.00'}
            </div>
            <div className="text-[10px] text-[#98A2B3] mt-0.5">
              {currentEligibleTier
                ? `Eligible: ${currentEligibleTier.units}/${currentEligibleTier.units} ($${currentEligibleTier.bonusUsd.toLocaleString()})`
                : 'No tier reached yet'}
            </div>
          </div>
        </div>
      </div>

      {/* Approved 10-Tier Matching Table */}
      <div className="p-4 rounded-xl bg-[#05070B] border border-white/[0.06] space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-[#00CFFF]" />
            <span className="font-semibold text-white">Daily Matching Tiers</span>
            <span className="text-[#98A2B3] text-[11px]">(Highest eligible tier settles daily)</span>
          </div>
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#00CFFF]/10 text-[#00CFFF] border border-[#00CFFF]/20">
            Max Payout: $5,000 / day
          </span>
        </div>

        <p className="text-[11px] text-[#98A2B3]">
          Only the highest eligible tier is settled for a daily cycle. Strong-side excess volume carries forward.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs font-mono">
          {displayTiers.map((tier, idx) => {
            const reward = (tier as any).bonusUsd ?? (tier as any).rewardUsd ?? 0;
            const isReached = availableLeft >= tier.units && availableRight >= tier.units;
            const isCurrent = currentEligibleTier?.units === tier.units;

            return (
              <div
                key={idx}
                className={`p-2.5 rounded-lg border transition-all text-center ${
                  isCurrent
                    ? 'bg-[#32D583]/10 border-[#32D583]/40 shadow-sm'
                    : isReached
                    ? 'bg-white/[0.04] border-white/[0.1]'
                    : 'bg-white/[0.02] border-white/[0.04]'
                }`}
              >
                <div className="text-[#98A2B3] text-[10px]">Tier {idx + 1}</div>
                <div className="font-bold text-white text-xs mt-0.5">
                  {tier.units}L / {tier.units}R
                </div>
                <div className="text-[#32D583] text-xs font-bold mt-1 tabular-nums">
                  ${reward.toLocaleString()}
                </div>
                {isCurrent && (
                  <div className="text-[9px] text-[#32D583] font-bold mt-0.5">
                    ● Eligible
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Matching History */}
      <div className="space-y-3">
        <div className="flex items-center justify-between border-b border-white/[0.06] pb-2">
          <div className="flex items-center gap-2 text-xs font-mono text-[#98A2B3]">
            <History className="w-4 h-4 text-[#00CFFF]" />
            <span className="font-semibold uppercase tracking-wider text-white">Matching Settlement History</span>
          </div>
          <span className="text-[11px] font-mono text-[#98A2B3]">
            {history.length} {history.length === 1 ? 'Settlement' : 'Settlements'}
          </span>
        </div>

        {history.length === 0 ? (
          <div className="p-6 rounded-xl bg-[#05070B] border border-dashed border-white/[0.06] text-center space-y-1">
            <div className="text-xs font-mono text-white">No matching settlements yet.</div>
            <div className="text-[11px] text-[#667085]">
              The matching engine settles automatically at 18:00 UTC.
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {history.slice(0, 5).map((settlement) => (
              <div
                key={settlement.id}
                className="p-4 rounded-xl bg-[#05070B] border border-white/[0.06] space-y-3 text-xs"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/[0.04] pb-2">
                  <div className="flex items-center gap-2.5 font-mono">
                    <span className="font-bold text-white">
                      {formatDate(settlement.businessDate)}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-white/[0.04] text-[#98A2B3] border border-white/[0.06]">
                      {settlement.publicSettlementId}
                    </span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded font-semibold ${
                        settlement.status === 'COMPLETED'
                          ? 'bg-[#32D583]/10 text-[#32D583] border border-[#32D583]/20'
                          : 'bg-[#F04438]/10 text-[#F04438] border border-[#F04438]/20'
                      }`}
                    >
                      {settlement.status}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 font-mono">
                    <span className="text-[#98A2B3]">Bonus Settled:</span>
                    <span className="text-sm font-bold text-[#32D583] tabular-nums">
                      {formatUsd(settlement.totalBonusUsd)}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
                  <div>
                    <span className="text-[#667085] text-[10px] block">Available Volume:</span>
                    <span className="text-white">
                      L {settlement.availableLeft} / R {settlement.availableRight}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#667085] text-[10px] block">Consumed Units:</span>
                    <span className="text-[#00CFFF]">
                      L {settlement.consumedLeft} / R {settlement.consumedRight}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#667085] text-[10px] block">Carry Forward:</span>
                    <span className="text-[#32D583] font-bold">
                      L {settlement.carryLeftAfter} / R {settlement.carryRightAfter}
                    </span>
                  </div>
                  <div className="text-right sm:text-left">
                    <span className="text-[#667085] text-[10px] block">Settled At:</span>
                    <span className="text-[#98A2B3]">
                      {new Date(settlement.settledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
