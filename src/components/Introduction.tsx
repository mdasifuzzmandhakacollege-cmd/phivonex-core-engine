import React from 'react';
import { Coins, Server, Award, FileText, Wallet, AppWindow, Cpu, ShieldCheck } from 'lucide-react';

export const Introduction: React.FC = () => {
  const subsystems = [
    {
      name: 'PHIVO Coin',
      desc: '100,000,000 capped native asset powering transaction settlement and network fuel.',
      icon: Coins,
      accent: '#00CFFF',
    },
    {
      name: 'Genesis Nodes',
      desc: '10,000 limited validator nodes that secure the mesh consensus network.',
      icon: Server,
      accent: '#168BFF',
    },
    {
      name: 'Node Participation',
      desc: 'Verifiable operator involvement with hardware attestation and epoch consensus.',
      icon: Cpu,
      accent: '#7057FF',
    },
    {
      name: 'Network Rewards',
      desc: 'Predictable, protocol-driven rewards programmatically emitted to active nodes.',
      icon: Award,
      accent: '#32D583',
    },
    {
      name: 'Wallet Infrastructure',
      desc: 'Secure key custody, instant signing, and institutional asset management.',
      icon: Wallet,
      accent: '#00CFFF',
    },
    {
      name: 'Live Ledger & Apps',
      desc: 'Publicly inspectable state verification and decentralized ecosystem applications.',
      icon: AppWindow,
      accent: '#168BFF',
    },
  ];

  return (
    <section id="ecosystem" className="py-20 sm:py-28 relative border-t border-white/[0.06] bg-[#05070B] overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16 space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.03] border border-white/[0.08] text-xs font-mono text-[#00CFFF]">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>ECOSYSTEM OVERVIEW</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-[#F7FAFC] tracking-tight">
            What is PHIVONEX?
          </h2>
          <p className="text-sm sm:text-base text-[#98A2B3] leading-relaxed">
            PHIVONEX is an institutional-grade decentralized infrastructure protocol. It unifies capped coin economics, 10,000 Genesis Nodes, deterministic rewards, non-custodial wallet tools, and a transparent live ledger into one resilient ecosystem.
          </p>
        </div>

        {/* 6 Grid Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {subsystems.map((item, idx) => {
            const Icon = item.icon;
            return (
              <div
                key={idx}
                className="p-6 rounded-2xl bg-[#07101D]/90 border border-white/[0.08] hover:border-[#00CFFF]/40 hover:bg-[#0A1428] transition-all duration-200 group flex flex-col justify-between"
              >
                <div>
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center mb-4 transition-transform group-hover:scale-105"
                    style={{ backgroundColor: `${item.accent}18`, color: item.accent }}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <h3 className="text-base font-bold text-[#F7FAFC] mb-2 group-hover:text-[#00CFFF] transition-colors">
                    {item.name}
                  </h3>
                  <p className="text-xs sm:text-sm text-[#98A2B3] leading-relaxed">
                    {item.desc}
                  </p>
                </div>

                <div className="mt-6 pt-4 border-t border-white/[0.06] flex items-center justify-between text-[11px] font-mono text-[#98A2B3]">
                  <span>Component {idx + 1} of 6</span>
                  <span className="text-[#32D583]">Verified Active</span>
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
};
