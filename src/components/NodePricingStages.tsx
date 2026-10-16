import React, { useState } from 'react';
import { NODE_TIERS } from '../data/networkData';
import { NetworkSummary } from '../types/network';
import { Info, Check, ArrowRight, Layers, HelpCircle } from 'lucide-react';

interface NodePricingStagesProps {
  summary: NetworkSummary;
  onSelectTier: (tierId: string) => void;
}

export const NodePricingStages: React.FC<NodePricingStagesProps> = ({ summary, onSelectTier }) => {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <section className="py-20 sm:py-28 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header with clear non-hyped disclaimer */}
        <div className="max-w-3xl mb-12">
          <div className="text-xs font-mono uppercase tracking-[0.2em] text-[#00C8FF] mb-3">
            DISTRIBUTION PROGRESSION
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Node Allocation Stages
          </h2>
          <div className="flex items-center gap-2 mt-3 text-sm text-[#98A2B3]">
            <span>Genesis Nodes are distributed in predefined tranches of 2,000 nodes each.</span>
            <div className="relative inline-block">
              <button
                onMouseEnter={() => setShowTooltip(true)}
                onMouseLeave={() => setShowTooltip(false)}
                onClick={() => setShowTooltip(!showTooltip)}
                className="text-[#00C8FF] hover:text-white transition-colors cursor-pointer"
                aria-label="Pricing Stage Disclaimer"
              >
                <HelpCircle className="w-4 h-4" />
              </button>
              {showTooltip && (
                <div className="absolute left-0 bottom-6 w-72 p-3 bg-[#080B12] border border-white/[0.1] rounded-lg text-xs font-mono text-[#F5F7FA] shadow-xl z-30">
                  Pricing follows published Node distribution rules. Pricing stage progression reflects protocol distribution tranches, not a guaranteed return or financial appreciation.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Current Active Stage Telemetry Summary */}
        <div className="p-6 rounded-2xl bg-gradient-to-r from-[#00C8FF]/10 via-transparent to-[#6C5CFF]/10 border border-[#00C8FF]/20 mb-10 flex flex-wrap items-center justify-between gap-6">
          <div>
            <span className="text-xs font-mono text-[#00C8FF] block uppercase tracking-wider">
              ACTIVE TRANCHE
            </span>
            <span className="text-2xl font-bold text-white">Tier 2 (Ecosystem Expansion)</span>
            <span className="text-xs text-[#98A2B3] block mt-0.5">
              Current Node Price: <strong className="text-white font-mono">1,250 USDT</strong>
            </span>
          </div>

          <div className="flex items-center gap-6 text-xs font-mono">
            <div>
              <span className="text-[#98A2B3] block">Allocated in Tier 2</span>
              <span className="text-lg font-bold text-white font-mono tabular-nums">1,742 / 2,000</span>
            </div>
            <div className="w-[1px] h-8 bg-white/[0.1]" />
            <div>
              <span className="text-[#98A2B3] block">Nodes Until Next Stage</span>
              <span className="text-lg font-bold text-[#00C8FF] font-mono tabular-nums">258</span>
            </div>
            <div className="w-[1px] h-8 bg-white/[0.1]" />
            <div>
              <span className="text-[#98A2B3] block">Next Tier Price</span>
              <span className="text-lg font-bold text-[#98A2B3] font-mono">1,500 USDT</span>
            </div>
          </div>
        </div>

        {/* Five Tiers Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {NODE_TIERS.map((tier, idx) => {
            const isCompleted = tier.status === 'completed';
            const isActive = tier.status === 'active';
            const isUpcoming = tier.status === 'upcoming';

            return (
              <div
                key={tier.id}
                className={`p-5 rounded-xl border flex flex-col justify-between transition-all duration-200 ${
                  isActive
                    ? 'bg-[#0B1020] border-[#00C8FF] shadow-lg shadow-[#00C8FF]/10 ring-1 ring-[#00C8FF]/30'
                    : isCompleted
                    ? 'bg-[#080B12]/60 border-white/[0.06] opacity-75'
                    : 'bg-[#080B12]/40 border-white/[0.04]'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between text-xs font-mono mb-3">
                    <span className="text-[#98A2B3]">TRANCHE 0{idx + 1}</span>
                    {isCompleted ? (
                      <span className="text-[#32D583] flex items-center gap-1">
                        <Check className="w-3 h-3" /> Filled
                      </span>
                    ) : isActive ? (
                      <span className="text-[#00C8FF] font-bold flex items-center gap-1 animate-subtle-pulse">
                        ● Active
                      </span>
                    ) : (
                      <span className="text-[#98A2B3]">Upcoming</span>
                    )}
                  </div>

                  <h3 className="text-base font-bold text-white mb-1">{tier.name}</h3>
                  <div className="text-xl font-mono font-extrabold text-white mb-3">
                    {tier.price}
                  </div>

                  <p className="text-xs text-[#98A2B3] leading-relaxed mb-4">
                    {tier.description}
                  </p>
                </div>

                <div className="pt-4 border-t border-white/[0.06]">
                  <div className="flex items-center justify-between text-[11px] font-mono text-[#98A2B3] mb-1.5">
                    <span>Tranche Cap</span>
                    <span className="text-white font-mono tabular-nums">
                      {tier.allocated.toLocaleString()} / {tier.cap.toLocaleString()}
                    </span>
                  </div>

                  <div className="w-full h-1.5 bg-white/[0.05] rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        isCompleted ? 'bg-[#32D583]' : isActive ? 'bg-[#00C8FF]' : 'bg-transparent'
                      }`}
                      style={{ width: `${(tier.allocated / tier.cap) * 100}%` }}
                    />
                  </div>

                  {isActive && (
                    <button
                      onClick={() => onSelectTier(tier.id)}
                      className="mt-4 w-full py-2 px-3 text-xs font-semibold text-center text-[#05070B] bg-[#00C8FF] hover:bg-white rounded-lg transition-colors cursor-pointer"
                    >
                      Inspect Tier Details
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Disclaimer footer */}
        <div className="mt-8 text-center text-xs font-mono text-[#98A2B3]">
          Notice: Pricing stage progression follows protocol tranche parameters. Does not guarantee market valuation.
        </div>

      </div>
    </section>
  );
};
