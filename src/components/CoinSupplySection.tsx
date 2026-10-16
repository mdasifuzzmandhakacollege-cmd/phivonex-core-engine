import React from 'react';
import { Award, Zap, Server, Globe2, ShieldCheck } from 'lucide-react';

export const CoinSupplySection: React.FC = () => {
  const pillars = [
    {
      title: 'Ecosystem Utility',
      desc: 'Powers transaction gas, protocol execution, and non-custodial cryptographic authorization.',
      icon: Zap,
      accent: '#00CFFF',
    },
    {
      title: 'Network Economy',
      desc: 'Serves as the deterministic unit of settlement and staking reserve across independent node operators.',
      icon: Server,
      accent: '#168BFF',
    },
    {
      title: 'Reward Participation',
      desc: 'Programmatically distributed to active Genesis Nodes across periodic validation epochs.',
      icon: Award,
      accent: '#7057FF',
    },
    {
      title: 'Future Platform Usage',
      desc: 'Fuels interoperability with decentralized applications, cross-chain bridges, and enterprise modules.',
      icon: Globe2,
      accent: '#32D583',
    },
  ];

  return (
    <section id="coin" className="py-20 sm:py-28 relative border-t border-white/[0.06] bg-[#05070B] overflow-hidden">
      {/* Subtle radial aura */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] h-[300px] bg-[#00CFFF]/[0.035] rounded-full blur-[140px] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        
        {/* Dominant Header Statement */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.03] border border-white/[0.08] text-xs font-mono text-[#00CFFF] mb-4">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>FIXED MONETARY CAP</span>
          </div>

          <h2 className="text-sm sm:text-base font-mono uppercase tracking-widest text-[#98A2B3] mb-2">
            PHIVO Coin
          </h2>

          <div className="text-5xl sm:text-6xl md:text-7xl font-extrabold font-mono tracking-tight text-[#F7FAFC] tabular-nums select-all">
            100,000,000
          </div>
          <div className="text-xs sm:text-sm font-mono text-[#00CFFF] mt-2">
            MAXIMUM COIN SUPPLY
          </div>

          <p className="text-sm sm:text-base text-[#98A2B3] mt-5 leading-relaxed max-w-2xl mx-auto">
            The supply is strictly capped by protocol mathematics. New coins are never arbitrarily minted; distribution is governed exclusively by verified network participation.
          </p>
        </div>

        {/* 4 Clean Utility Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {pillars.map((item, idx) => {
            const Icon = item.icon;
            return (
              <div
                key={idx}
                className="p-6 rounded-2xl bg-[#07101D]/90 border border-white/[0.08] hover:border-[#00CFFF]/40 transition-all duration-200 group flex flex-col justify-between"
              >
                <div>
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center mb-4 transition-transform group-hover:scale-105"
                    style={{ backgroundColor: `${item.accent}15`, color: item.accent }}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <h3 className="text-base font-bold text-[#F7FAFC] mb-2 group-hover:text-[#00CFFF] transition-colors">
                    {item.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-[#98A2B3] leading-relaxed">
                    {item.desc}
                  </p>
                </div>

                <div className="mt-6 pt-4 border-t border-white/[0.06] text-[11px] font-mono text-[#98A2B3]">
                  <span>Enforced by Smart Contract</span>
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
};
