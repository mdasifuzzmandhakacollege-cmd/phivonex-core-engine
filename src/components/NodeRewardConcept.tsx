import React from 'react';
import { Award, Clock, CheckCircle2, ShieldAlert, Cpu, Layers } from 'lucide-react';

export const NodeRewardConcept: React.FC = () => {
  return (
    <section id="rewards" className="py-20 sm:py-28 relative border-t border-white/[0.06] bg-[#05070B] overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          
          {/* Left Column: Conceptual Overview */}
          <div className="lg:col-span-6 space-y-6">
            <div className="text-xs font-mono uppercase tracking-[0.2em] text-[#00CFFF]">
              DETERMINISTIC INCENTIVES
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-[#F7FAFC] tracking-tight leading-tight">
              Node Reward &amp; Mining Architecture
            </h2>
            <p className="text-sm sm:text-base text-[#98A2B3] leading-relaxed">
              PHIVONEX replaces arbitrary staking schemes with deterministic, epoch-based reward distribution. Active Genesis Nodes validate network transactions and establish checkpoint attestations.
            </p>
            <p className="text-sm sm:text-base text-[#98A2B3] leading-relaxed">
              Rewards accrue strictly as compensation for verified uptime and computational participation in the Layer-1 mesh network.
            </p>

            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.08] flex items-start gap-3 text-xs text-[#98A2B3] leading-relaxed">
              <ShieldAlert className="w-4 h-4 text-[#FDB022] shrink-0 mt-0.5" />
              <span>
                <strong className="text-white">Protocol Disclaimer:</strong> Node participation does not guarantee financial return or future market value.
              </span>
            </div>
          </div>

          {/* Right Column: Example Node Status Card */}
          <div className="lg:col-span-6">
            <div className="bg-[#07101D]/90 border border-white/[0.08] rounded-2xl shadow-2xl p-6 sm:p-8 backdrop-blur-xl">
              
              {/* Header */}
              <div className="flex items-center justify-between pb-4 border-b border-white/[0.08] mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-[#00CFFF]/10 border border-[#00CFFF]/30 flex items-center justify-center text-[#00CFFF]">
                    <Cpu className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-mono text-[#98A2B3] block">OPERATOR NODE CONSOLE</span>
                    <span className="text-sm font-bold text-white font-mono">Node #PX-00042</span>
                  </div>
                </div>
                <div className="px-2.5 py-1 rounded-full bg-[#32D583]/10 border border-[#32D583]/30 text-[#32D583] text-[11px] font-mono flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#32D583]" />
                  <span>ONLINE</span>
                </div>
              </div>

              {/* Required Node Metric Items */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                
                {/* 1. Node Status */}
                <div className="p-4 rounded-xl bg-[#05070B] border border-white/[0.06]">
                  <span className="text-xs text-[#98A2B3] block mb-1">Node Status</span>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-[#32D583]" />
                    <span className="text-base font-bold text-[#F7FAFC] font-mono">Active</span>
                  </div>
                  <span className="text-[10px] text-[#32D583] font-mono block mt-1">99.98% Attestation</span>
                </div>

                {/* 2. Reward Status */}
                <div className="p-4 rounded-xl bg-[#05070B] border border-white/[0.06]">
                  <span className="text-xs text-[#98A2B3] block mb-1">Reward Status</span>
                  <div className="flex items-center gap-2">
                    <Award className="w-4 h-4 text-[#00CFFF]" />
                    <span className="text-base font-bold text-[#00CFFF] font-mono">Accruing</span>
                  </div>
                  <span className="text-[10px] text-[#98A2B3] font-mono block mt-1">Per-Block Invariant</span>
                </div>

                {/* 3. Current Epoch */}
                <div className="p-4 rounded-xl bg-[#05070B] border border-white/[0.06]">
                  <span className="text-xs text-[#98A2B3] block mb-1">Current Epoch</span>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-[#7057FF]" />
                    <span className="text-base font-bold text-[#F7FAFC] font-mono">Live (Epoch 142)</span>
                  </div>
                  <span className="text-[10px] text-[#98A2B3] font-mono block mt-1">60s Epoch Cycle</span>
                </div>

                {/* 4. Reward Checkpoint */}
                <div className="p-4 rounded-xl bg-[#05070B] border border-white/[0.06]">
                  <span className="text-xs text-[#98A2B3] block mb-1">Reward Checkpoint</span>
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-[#168BFF]" />
                    <span className="text-base font-bold text-[#F7FAFC] font-mono">Live Verified</span>
                  </div>
                  <span className="text-[10px] text-[#32D583] font-mono block mt-1">State Root Confirmed</span>
                </div>

              </div>

              {/* 5. Claimable Reward Banner */}
              <div className="p-4 rounded-xl bg-[#00CFFF]/[0.06] border border-[#00CFFF]/30 flex items-center justify-between">
                <div>
                  <span className="text-xs font-mono text-[#98A2B3] block">Claimable Reward</span>
                  <span className="text-xl font-bold font-mono text-white">Live State Sync</span>
                </div>
                <div className="px-3 py-1.5 rounded-lg bg-white/[0.08] text-xs font-mono text-[#00CFFF]">
                  Protocol Ready
                </div>
              </div>

            </div>
          </div>

        </div>

      </div>
    </section>
  );
};
