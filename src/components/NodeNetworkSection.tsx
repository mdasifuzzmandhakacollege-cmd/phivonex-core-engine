import React from 'react';
import { Server, Fingerprint, Activity, Repeat, TrendingDown, ShieldCheck } from 'lucide-react';

export const NodeNetworkSection: React.FC = () => {
  const nodePillars = [
    {
      title: 'Limited Participation Units',
      desc: 'Only 10,000 Genesis Nodes will ever exist in the protocol registry. There is zero inflationary expansion.',
      icon: Server,
      accent: '#00CFFF',
    },
    {
      title: 'Unique Cryptographic Identity',
      desc: 'Each Node possesses a distinct immutable identifier, state registry, and cryptographic verification signature.',
      icon: Fingerprint,
      accent: '#168BFF',
    },
    {
      title: 'Supply-Impacting Activation',
      desc: 'Activating a Genesis Node locks hardware attestation and dynamically alters network active participation state.',
      icon: Activity,
      accent: '#7057FF',
    },
    {
      title: 'Zero Node Duplication on Transfer',
      desc: 'Ownership transfer operates strictly on peer-to-peer ledger state and never creates new or duplicate Nodes.',
      icon: Repeat,
      accent: '#32D583',
    },
    {
      title: 'Deflationary Primary Supply',
      desc: 'Remaining primary allocation decreases irrevocably as each Genesis Node is provisioned to an operator.',
      icon: TrendingDown,
      accent: '#00CFFF',
    },
  ];

  return (
    <section id="nodes" className="py-20 sm:py-28 relative border-t border-white/[0.06] bg-[#05070B] overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-16 space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.03] border border-white/[0.08] text-xs font-mono text-[#00CFFF]">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>VALIDATOR ARCHITECTURE</span>
          </div>
          
          <div className="text-4xl sm:text-5xl md:text-6xl font-extrabold font-mono tracking-tight text-[#F7FAFC] tabular-nums">
            10,000
          </div>
          <div className="text-xs sm:text-sm font-mono text-[#00CFFF] uppercase tracking-wider">
            Genesis Nodes
          </div>

          <p className="text-sm sm:text-base text-[#98A2B3] leading-relaxed max-w-2xl mx-auto pt-2">
            Genesis Nodes are foundational validator anchors of the PHIVONEX protocol. They secure the decentralized network, process block consensus, and earn deterministic epoch-based rewards.
          </p>
        </div>

        {/* 5 Core Genesis Node Mechanics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {nodePillars.map((pillar, idx) => {
            const Icon = pillar.icon;
            return (
              <div
                key={idx}
                className="p-6 rounded-2xl bg-[#07101D]/90 border border-white/[0.08] hover:border-[#00CFFF]/40 transition-all duration-200 group flex flex-col justify-between"
              >
                <div>
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center mb-4 transition-transform group-hover:scale-105"
                    style={{ backgroundColor: `${pillar.accent}15`, color: pillar.accent }}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <h3 className="text-base font-bold text-[#F7FAFC] mb-2 group-hover:text-[#00CFFF] transition-colors">
                    {pillar.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-[#98A2B3] leading-relaxed">
                    {pillar.desc}
                  </p>
                </div>

                <div className="mt-6 pt-4 border-t border-white/[0.06] flex items-center justify-between text-[11px] font-mono text-[#98A2B3]">
                  <span>Rule #{idx + 1}</span>
                  <span className="text-[#32D583]">Immutable Invariant</span>
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
};
