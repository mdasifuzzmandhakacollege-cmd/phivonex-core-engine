import React from 'react';
import { Coins, Server, Award, Landmark, Database, ArrowRight } from 'lucide-react';

export const EconomicModel: React.FC = () => {
  const modules = [
    {
      title: 'PHIVO Coin',
      cap: '100,000,000 Cap',
      role: 'Unit of Account & Gas',
      desc: 'Used for transaction fees, state commitment staking, and ecosystem utility. Strict 100M cap prevents dilution.',
      icon: Coins,
      accent: '#00C8FF',
    },
    {
      title: 'Genesis Nodes',
      cap: '10,000 Cap',
      role: 'Consensus Backbone',
      desc: 'Limited validator anchors that process blocks, verify ledger state, and safeguard network decentralization.',
      icon: Server,
      accent: '#1A8CFF',
    },
    {
      title: 'Reward Pool',
      cap: '45,000,000 Allocation',
      role: 'Uptime Incentives',
      desc: 'Time-locked vault distributed purely through protocol epoch algorithms to verified active nodes.',
      icon: Award,
      accent: '#32D583',
    },
    {
      title: 'Protocol Treasury',
      cap: 'Multi-Sig Governed',
      role: 'Ecosystem Sustainability',
      desc: 'Dedicated to long-term developer grants, institutional integrations, and cross-chain bridge liquidity.',
      icon: Landmark,
      accent: '#6C5CFF',
    },
    {
      title: 'Network Ledger',
      cap: 'High-Throughput State',
      role: 'Authoritative Truth',
      desc: 'High-frequency append-only state engine with idempotent receipts and automated reconciliation.',
      icon: Database,
      accent: '#8247FF',
    },
  ];

  return (
    <section className="py-24 sm:py-32 relative border-t border-white/[0.06]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        <div className="max-w-3xl mb-16">
          <div className="text-xs font-mono uppercase tracking-[0.2em] text-[#00C8FF] mb-3">
            SEPARATION OF CONCERNS
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white tracking-tight">
            Economic Modular Structure
          </h2>
          <p className="text-sm sm:text-base text-[#98A2B3] mt-3">
            Five isolated, specialized economic subsystems maintain system equilibrium without circular dependencies or inflationary traps.
          </p>
        </div>

        {/* 5 modules grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {modules.map((m, idx) => {
            const Icon = m.icon;
            return (
              <div
                key={idx}
                className="p-5 rounded-2xl bg-[#080B12] border border-white/[0.06] hover:border-white/[0.2] transition-all duration-200 flex flex-col justify-between group"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center border border-white/[0.08]"
                      style={{ backgroundColor: `${m.accent}15`, color: m.accent }}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <span className="text-[10px] font-mono font-bold text-[#98A2B3]">
                      0{idx + 1}
                    </span>
                  </div>

                  <h3 className="text-base font-bold text-white mb-1 group-hover:text-[#00C8FF] transition-colors">
                    {m.title}
                  </h3>

                  <div className="text-xs font-mono font-semibold mb-2" style={{ color: m.accent }}>
                    {m.cap}
                  </div>

                  <span className="text-[11px] font-mono text-[#98A2B3] block mb-3">
                    Role: {m.role}
                  </span>

                  <p className="text-xs text-[#98A2B3] leading-relaxed">
                    {m.desc}
                  </p>
                </div>

                <div className="mt-6 pt-3 border-t border-white/[0.05] text-[10px] font-mono text-[#98A2B3] flex items-center justify-between">
                  <span>DISCIPLINE</span>
                  <span className="text-white">ENFORCED</span>
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
};
