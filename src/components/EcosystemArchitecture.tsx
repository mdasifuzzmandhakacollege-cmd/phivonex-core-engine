import React from 'react';
import { Coins, Server, FileText, Wallet, Cpu, BarChart3, AppWindow, ArrowRight } from 'lucide-react';

export const EcosystemArchitecture: React.FC = () => {
  const subsystems = [
    {
      title: 'PHIVO Coin',
      desc: '100M Maximum Capped Settlement Currency',
      icon: Coins,
      color: '#00C8FF',
    },
    {
      title: 'Genesis Nodes (10,000)',
      desc: 'Decentralized Validator & Consensus Network',
      icon: Server,
      color: '#1A8CFF',
    },
    {
      title: 'Economic Ledger',
      desc: 'Immutable Append-Only Transaction Engine',
      icon: FileText,
      color: '#32D583',
    },
    {
      title: 'Native Wallet',
      desc: 'Non-Custodial Cryptographic Custody',
      icon: Wallet,
      color: '#6C5CFF',
    },
    {
      title: 'Protocol Reward Engine',
      desc: 'Epoch-Based Computational Uptime Settlement',
      icon: Cpu,
      color: '#8247FF',
    },
    {
      title: 'Real-Time Analytics',
      desc: 'Institutional Telemetry & Live Explorer',
      icon: BarChart3,
      color: '#00C8FF',
    },
    {
      title: 'Ecosystem Applications',
      desc: 'Enterprise Gateways, Oracles & Third-Party Tooling',
      icon: AppWindow,
      color: '#1A8CFF',
    },
  ];

  return (
    <section className="py-24 sm:py-32 relative border-t border-white/[0.06] overflow-hidden">
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        
        <div className="max-w-3xl mb-16">
          <div className="text-xs font-mono uppercase tracking-[0.2em] text-[#00C8FF] mb-3">
            TOPOLOGY &amp; MODULARITY
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white tracking-tight">
            Ecosystem Architecture
          </h2>
          <p className="text-sm sm:text-base text-[#98A2B3] mt-3">
            A cohesive interconnected framework designed so each module performs a deterministic, auditable role in the digital economy.
          </p>
        </div>

        {/* Visual Architecture Tree */}
        <div className="p-8 sm:p-12 rounded-3xl bg-[#080B12] border border-white/[0.08] shadow-2xl relative">
          
          {/* Central Root Hub */}
          <div className="flex flex-col items-center mb-12">
            <div className="px-6 py-3 rounded-2xl bg-gradient-to-r from-[#00C8FF] via-[#1A8CFF] to-[#6C5CFF] text-[#05070B] font-extrabold text-base sm:text-lg tracking-wider shadow-lg shadow-[#00C8FF]/20 flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#05070B] animate-subtle-pulse" />
              <span>PHIVONEX PROTOCOL ROOT</span>
            </div>
            {/* Trunk Line */}
            <div className="w-[2px] h-10 bg-gradient-to-b from-[#00C8FF] to-white/[0.1]" />
          </div>

          {/* Subsystem Nodes Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
            {subsystems.map((sub, idx) => {
              const Icon = sub.icon;
              return (
                <div
                  key={idx}
                  className="p-5 rounded-2xl bg-white/[0.02] border border-white/[0.06] hover:border-[#00C8FF]/40 hover:bg-[#0B1020] transition-all duration-200 group flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center gap-3 mb-3">
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center transition-transform group-hover:scale-105"
                        style={{ backgroundColor: `${sub.color}15`, color: sub.color }}
                      >
                        <Icon className="w-5 h-5" />
                      </div>
                      <span className="text-xs font-mono font-bold text-[#98A2B3]">
                        MODULE 0{idx + 1}
                      </span>
                    </div>

                    <h3 className="text-base font-bold text-white mb-1 group-hover:text-[#00C8FF] transition-colors">
                      {sub.title}
                    </h3>
                    <p className="text-xs text-[#98A2B3] leading-relaxed">
                      {sub.desc}
                    </p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-white/[0.05] flex items-center justify-between text-[11px] font-mono text-[#98A2B3]">
                    <span>STATUS</span>
                    <span className="text-[#32D583]">OPERATIONAL</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bus pulse note */}
          <div className="mt-8 text-center text-xs font-mono text-[#98A2B3]">
            Data bus updates synchronize via WebSocket &amp; SSE at sub-100ms message queues.
          </div>

        </div>

      </div>
    </section>
  );
};
