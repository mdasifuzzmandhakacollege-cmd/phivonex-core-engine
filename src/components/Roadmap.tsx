import React from 'react';
import { CheckCircle2, Clock, Calendar, ShieldCheck } from 'lucide-react';

export const Roadmap: React.FC = () => {
  const milestones = [
    {
      phase: '01',
      title: 'Foundation',
      status: 'Completed',
      statusColor: '#32D583',
      icon: CheckCircle2,
      description: 'Core protocol specification, economic invariant modeling, cryptographic schema design, and Genesis smart contract verification.',
    },
    {
      phase: '02',
      title: 'Node Network',
      status: 'In Progress',
      statusColor: '#00CFFF',
      icon: Clock,
      description: 'Genesis Node allocation rollout, operator hardware attestation, mesh consensus onboarding, and testnet epoch reward benchmarking.',
    },
    {
      phase: '03',
      title: 'Public Network',
      status: 'Planned',
      statusColor: '#98A2B3',
      icon: Calendar,
      description: 'Mainnet decentralized ledger launch, public block explorer activation, non-custodial wallet infrastructure, and multi-validator peering.',
    },
    {
      phase: '04',
      title: 'Ecosystem Expansion',
      status: 'Planned',
      statusColor: '#98A2B3',
      icon: Calendar,
      description: 'Decentralized application SDKs, cross-chain liquidity bridges, institutional telemetry APIs, and ecosystem developer tooling.',
    },
    {
      phase: '05',
      title: 'Global Growth',
      status: 'Planned',
      statusColor: '#98A2B3',
      icon: Calendar,
      description: 'Enterprise validator consortium integration, secondary node escrow mechanisms, and global regulatory compliance modules.',
    },
  ];

  return (
    <section id="roadmap" className="py-20 sm:py-28 relative border-t border-white/[0.06] bg-[#05070B] overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16 space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.03] border border-white/[0.08] text-xs font-mono text-[#00CFFF]">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>DEVELOPMENT TRAJECTORY</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-[#F7FAFC] tracking-tight">
            Protocol Roadmap
          </h2>
          <p className="text-sm sm:text-base text-[#98A2B3] leading-relaxed">
            The strategic roadmap guiding the deployment, decentralization, and global scaling of PHIVONEX.
          </p>
        </div>

        {/* 5-Milestone Timeline */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 lg:gap-6">
          {milestones.map((m, idx) => {
            const Icon = m.icon;
            const isCompleted = m.status === 'Completed';
            const isInProgress = m.status === 'In Progress';

            return (
              <div
                key={idx}
                className={`p-6 rounded-2xl border transition-all duration-200 flex flex-col justify-between ${
                  isInProgress
                    ? 'bg-[#07101D] border-[#00CFFF]/40 shadow-lg shadow-[#00CFFF]/5'
                    : 'bg-[#07101D]/70 border-white/[0.08]'
                }`}
              >
                <div>
                  {/* Top Phase & Status */}
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs font-mono font-bold text-[#98A2B3]">
                      Phase {m.phase}
                    </span>
                    <span
                      className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-medium flex items-center gap-1"
                      style={{
                        backgroundColor: `${m.statusColor}15`,
                        color: m.statusColor,
                        border: `1px solid ${m.statusColor}30`,
                      }}
                    >
                      <Icon className="w-3 h-3" />
                      <span>{m.status}</span>
                    </span>
                  </div>

                  <h3 className="text-base font-bold text-[#F7FAFC] mb-2.5">
                    {m.title}
                  </h3>

                  <p className="text-xs text-[#98A2B3] leading-relaxed">
                    {m.description}
                  </p>
                </div>

                <div className="mt-6 pt-4 border-t border-white/[0.06] text-[11px] font-mono text-[#98A2B3]">
                  {isCompleted && <span className="text-[#32D583]">Milestone Finalized</span>}
                  {isInProgress && <span className="text-[#00CFFF]">Active Development</span>}
                  {!isCompleted && !isInProgress && <span>Target Phase</span>}
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
};
