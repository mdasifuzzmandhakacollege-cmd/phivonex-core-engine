import React from 'react';
import {
  Home,
  Layers,
  ArrowDown,
  GitFork,
  Wallet,
} from 'lucide-react';
import { DashboardTab } from './Sidebar';

interface MobileBottomNavProps {
  activeTab: DashboardTab;
  onSelectTab: (tab: DashboardTab) => void;
  currentPath?: string;
}

interface NavDestination {
  id: DashboardTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  isCenter?: boolean;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeTab,
  onSelectTab,
}) => {
  const destinations: NavDestination[] = [
    {
      id: 'overview',
      label: 'Overview',
      icon: Home,
    },
    {
      id: 'products',
      label: 'Hubs',
      icon: Layers,
    },
    {
      id: 'deposit',
      label: 'Deposit',
      icon: ArrowDown,
      isCenter: true,
    },
    {
      id: 'network',
      label: 'Network',
      icon: GitFork,
    },
    {
      id: 'wallet',
      label: 'Wallet',
      icon: Wallet,
    },
  ];

  return (
    <nav
      role="navigation"
      aria-label="Mobile Navigation Bar"
      className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-[#050807]/88 backdrop-blur-2xl border-t border-white/[0.1] shadow-[0_-12px_36px_rgba(0,0,0,0.75)] px-2 pt-1.5 pb-[max(0.55rem,env(safe-area-inset-bottom))]"
    >
      <div className="flex items-center justify-around max-w-md mx-auto relative min-w-0">
        {destinations.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          if (item.isCenter) {
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                aria-label="Deposit Funds"
                aria-current={isActive ? 'page' : undefined}
                className="group flex flex-col items-center justify-center -mt-5 relative outline-none focus-visible:ring-2 focus-visible:ring-[#00E5FF] rounded-full cursor-pointer shrink-0"
              >
                <div
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-200 border ${
                    isActive
                      ? 'bg-gradient-to-tr from-[#00E5FF] to-[#00E676] text-[#050807] border-white/40 shadow-[0_8px_24px_rgba(0,229,255,0.45)] scale-105'
                      : 'bg-gradient-to-tr from-[#00E5FF] via-[#00C4E0] to-[#0099B8] text-[#050807] border-white/25 shadow-[0_6px_18px_rgba(0,229,255,0.3)] hover:scale-105 active:scale-95'
                  }`}
                >
                  <Icon className="w-5 h-5 stroke-[2.6] transition-transform duration-200 group-hover:scale-110" />
                </div>
                <span
                  className={`text-[10px] tracking-wide mt-1 font-semibold transition-colors duration-150 ${
                    isActive ? 'text-[#00E5FF]' : 'text-slate-300 group-hover:text-white'
                  }`}
                >
                  {item.label}
                </span>
              </button>
            );
          }

          const isGoldTab = item.id === 'products';

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
              className={`flex flex-col items-center justify-center min-w-[54px] min-h-[48px] py-1 px-2 rounded-2xl transition-all duration-200 relative cursor-pointer active:scale-95 outline-none focus-visible:ring-1 focus-visible:ring-[#00E5FF] ${
                isActive
                  ? isGoldTab
                    ? 'text-[#F5B800] bg-[#F5B800]/10'
                    : 'text-[#00E5FF] bg-[#00E5FF]/10'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {isActive && (
                <span
                  className={`absolute top-0.5 w-6 h-[2.5px] rounded-full ${
                    isGoldTab
                      ? 'bg-[#F5B800] shadow-[0_0_8px_rgba(245,184,0,0.85)]'
                      : 'bg-[#00E5FF] shadow-[0_0_8px_rgba(0,229,255,0.85)]'
                  }`}
                />
              )}

              <Icon
                className={`w-[19px] h-[19px] transition-transform duration-200 ${
                  isActive ? 'scale-105' : ''
                }`}
              />

              <span
                className={`text-[10px] tracking-wide mt-1 transition-colors duration-150 ${
                  isActive ? 'font-bold' : 'font-medium'
                }`}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
