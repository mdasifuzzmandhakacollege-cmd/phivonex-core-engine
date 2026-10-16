import React from 'react';
import { Lock, Eye, Cpu, CheckCircle } from 'lucide-react';

export const PrinciplesGrid: React.FC = () => {
  const principles = [
    {
      kicker: 'LIMITED',
      title: 'Defined Supply',
      description:
        'A fixed ceiling of 100,000,000 PHIVO Coins and exactly 10,000 Genesis Nodes. Inflationary dilution is prevented by immutable protocol rules.',
      specs: [
        'Strict 100,000,000 maximum coin ceiling',
        'Capped 10,000 Genesis Node registry',
        'Zero hidden minting or arbitrary inflation',
      ],
      icon: Lock,
      accent: '#00CFFF',
    },
    {
      kicker: 'TRANSPARENT',
      title: 'Live Ledger',
      description:
        'Every node transition, reward allocation, and state checkpoint writes directly to an immutable, publicly inspectable high-throughput event log.',
      specs: [
        'Idempotent cryptographic receipts for all actions',
        'Instant verification on settlement explorers',
        'No hidden administrative reserves or blackboxes',
      ],
      icon: Eye,
      accent: '#32D583',
    },
    {
      kicker: 'PROGRAMMABLE',
      title: 'Protocol-Driven Economy',
      description:
        'Incentives and distribution schedules operate purely on protocol-level rules and computational benchmarks, not human discretion or marketing cycles.',
      specs: [
        'Epoch-based reward calculation algorithms',
        'Verifiable uptime and throughput attestations',
        'Decentralized node ownership lifecycle',
      ],
      icon: Cpu,
      accent: '#7057FF',
    },
  ];

  return (
    <section className="py-20 sm:py-28 relative bg-[#05070B] border-t border-white/[0.06]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        <div className="text-center max-w-2xl mx-auto mb-16">
          <div className="text-xs font-mono uppercase tracking-[0.2em] text-[#00CFFF] mb-3">
            CORE PRINCIPLES
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-[#F7FAFC] tracking-tight">
            Engineered for Certainty
          </h2>
          <p className="text-sm sm:text-base text-[#98A2B3] mt-3">
            Three non-negotiable architectural pillars establish the transparent foundation of PHIVONEX.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
          {principles.map((item, idx) => {
            const Icon = item.icon;
            return (
              <div
                key={idx}
                className="group relative rounded-2xl bg-[#07101D]/90 p-8 border border-white/[0.08] hover:border-[#00CFFF]/40 transition-all duration-200 hover:-translate-y-1 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-6">
                    <span 
                      className="text-xs font-mono font-bold tracking-wider"
                      style={{ color: item.accent }}
                    >
                      {item.kicker}
                    </span>
                    <div 
                      className="w-10 h-10 rounded-xl flex items-center justify-center border border-white/[0.08] transition-colors"
                      style={{ backgroundColor: `${item.accent}12` }}
                    >
                      <Icon className="w-5 h-5" style={{ color: item.accent }} />
                    </div>
                  </div>

                  <h3 className="text-2xl font-bold text-[#F7FAFC] mb-3 tracking-tight">
                    {item.title}
                  </h3>

                  <p className="text-sm text-[#98A2B3] leading-relaxed mb-6">
                    {item.description}
                  </p>
                </div>

                <div className="pt-6 border-t border-white/[0.06] space-y-2.5">
                  {item.specs.map((spec, sIdx) => (
                    <div key={sIdx} className="flex items-start gap-2.5 text-xs text-[#98A2B3]">
                      <CheckCircle className="w-3.5 h-3.5 text-[#32D583] shrink-0 mt-0.5" />
                      <span>{spec}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
};
