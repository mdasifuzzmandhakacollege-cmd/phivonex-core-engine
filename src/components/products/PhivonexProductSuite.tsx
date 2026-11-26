import React, { useState, useEffect } from 'react';
import { QuantumAlphaHub } from './QuantumAlphaHub';
import { GenesisCoreHub } from './GenesisCoreHub';
import { ChronoVaultsHub } from './ChronoVaultsHub';
import { TrendingUp, Server, Clock } from 'lucide-react';

interface PhivonexProductSuiteProps {
  user: any;
  onNavigateTab: (tab: string) => void;
  initialProduct?: 'alpha' | 'genesis' | 'chrono';
}

const PRODUCT_TABS = [
  {
    id: 'alpha' as const,
    title: 'Quantum Alpha™',
    mobileTitle: 'Alpha',
    subtitle: '7-Day Liquid Trading Pool',
    icon: TrendingUp,
    activeClasses:
      'bg-gradient-to-r from-[#00E5FF]/18 via-[#00E5FF]/10 to-[#168BFF]/15 text-[#00E5FF] border-[#00E5FF]/45 shadow-[0_0_24px_rgba(0,229,255,0.14)]',
    dotColor: 'bg-[#00E5FF]',
  },
  {
    id: 'genesis' as const,
    title: 'Genesis Core™',
    mobileTitle: 'Genesis',
    subtitle: '10,000 Capped Validator Nodes',
    icon: Server,
    activeClasses:
      'bg-gradient-to-r from-[#00E676]/16 via-[#00E5FF]/10 to-[#00E676]/14 text-[#00E676] border-[#00E676]/45 shadow-[0_0_24px_rgba(0,230,118,0.12)]',
    dotColor: 'bg-[#00E676]',
  },
  {
    id: 'chrono' as const,
    title: 'Chrono Vaults™',
    mobileTitle: 'Vaults',
    subtitle: 'Fixed-Term Institutional Staking',
    icon: Clock,
    activeClasses:
      'bg-gradient-to-r from-[#F5B800]/20 via-[#F5B800]/10 to-[#FF8A00]/15 text-[#F5B800] border-[#F5B800]/45 shadow-[0_0_24px_rgba(245,184,0,0.14)]',
    dotColor: 'bg-[#F5B800]',
  },
];

export const PhivonexProductSuite: React.FC<PhivonexProductSuiteProps> = ({
  user,
  onNavigateTab,
  initialProduct = 'alpha',
}) => {
  const [activeProduct, setActiveProduct] = useState<'alpha' | 'genesis' | 'chrono'>(initialProduct);

  useEffect(() => {
    setActiveProduct(initialProduct);
  }, [initialProduct]);

  return (
    <div className="space-y-6 min-w-0 max-w-full overflow-x-hidden animate-fadeIn">
      {/* One UI 9.5 Institutional Product Suite Switcher */}
      <div className="grid grid-cols-3 gap-1.5 sm:gap-3 p-1.5 rounded-[24px] oneui-glass-card max-w-3xl mx-auto">
        {PRODUCT_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeProduct === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveProduct(tab.id)}
              className={`group relative py-2.5 sm:py-3 px-2 sm:px-4 rounded-[18px] text-left border transition-all cursor-pointer flex items-center justify-center sm:justify-start gap-2 sm:gap-3 min-w-0 active:scale-[0.98] ${
                isActive
                  ? tab.activeClasses
                  : 'bg-white/[0.02] border-transparent text-slate-400 hover:text-white hover:bg-white/[0.05] hover:border-white/10'
              }`}
            >
              <div
                className={`w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center shrink-0 border transition-colors ${
                  isActive
                    ? 'bg-[#050807]/70 border-current/30'
                    : 'bg-white/[0.04] border-white/10 text-slate-400 group-hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs sm:text-sm font-extrabold tracking-tight truncate hidden sm:inline">
                    {tab.title}
                  </span>
                  <span className="text-[11px] font-extrabold tracking-tight truncate sm:hidden">
                    {tab.mobileTitle}
                  </span>
                  {isActive && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${tab.dotColor}`} />}
                </div>
                <span className="hidden md:block text-[10px] font-mono text-slate-400 truncate mt-0.5">
                  {tab.subtitle}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Active Flagship Product Hub */}
      <div className="pt-1 min-w-0">
        {activeProduct === 'alpha' && <QuantumAlphaHub user={user} onNavigateTab={onNavigateTab} />}
        {activeProduct === 'genesis' && <GenesisCoreHub user={user} onNavigateTab={onNavigateTab} />}
        {activeProduct === 'chrono' && <ChronoVaultsHub user={user} onNavigateTab={onNavigateTab} />}
      </div>
    </div>
  );
};
