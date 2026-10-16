import React from 'react';
import {
  Home,
  Server,
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
  // Exactly 5 primary destinations as strictly required:
  // 1. Overview, 2. Nodes, 3. Deposit (Center Action), 4. Network, 5. Wallet
  const destinations: NavDestination[] = [
    {
      id: 'overview',
      label: 'Overview',
      icon: Home,
    },
    {
      id: 'nodes',
      label: 'Nodes',
      icon: Server,
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
      className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-[#050A14]/95 backdrop-blur-xl border-t border-white/[0.08] shadow-[0_-4px_25px_rgba(0,0,0,0.6)] px-2 pt-1 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
    >
      <div className="flex items-center justify-around max-w-md mx-auto relative">
        {destinations.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          // Center Deposit Action Button: Elevated, subtle cyan illumination
          if (item.isCenter) {
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                aria-label="Deposit Funds"
                aria-current={isActive ? 'page' : undefined}
                className="group flex flex-col items-center justify-center -mt-4 relative outline-none focus-visible:ring-2 focus-visible:ring-[#00CFFF] rounded-full cursor-pointer"
              >
                {/* Elevated Circular Cyan Button */}
                <div
                  className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200 shadow-lg ${
                    isActive
                      ? 'bg-gradient-to-tr from-[#00CFFF] to-[#38BDF8] text-[#050A14] shadow-[#00CFFF]/50 scale-105 ring-2 ring-[#00CFFF]'
                      : 'bg-gradient-to-tr from-[#00CFFF] via-[#00B4D8] to-[#0096C7] text-[#050A14] shadow-[#00CFFF]/30 hover:scale-105 active:scale-95'
                  }`}
                >
                  <Icon className="w-5 h-5 stroke-[2.6] transition-transform duration-200 group-hover:scale-110" />
                </div>
                {/* Short Label */}
                <span
                  className={`text-[10px] tracking-wide mt-1 font-semibold transition-colors duration-150 ${
                    isActive ? 'text-[#00CFFF]' : 'text-[#98A2B3] group-hover:text-white'
                  }`}
                >
                  {item.label}
                </span>
              </button>
            );
          }

          // Standard Nav Items
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
              className={`flex flex-col items-center justify-center min-w-[56px] min-h-[48px] py-1 px-2 rounded-xl transition-all duration-150 relative cursor-pointer active:scale-95 outline-none focus-visible:ring-1 focus-visible:ring-[#00CFFF] ${
                isActive ? 'text-[#00CFFF]' : 'text-[#667085] hover:text-[#98A2B3]'
              }`}
            >
              {/* Subtle top indicator bar when active */}
              {isActive && (
                <span className="absolute top-0 w-6 h-0.5 rounded-full bg-[#00CFFF] shadow-[0_0_8px_rgba(0,207,255,0.8)] animate-fadeIn" />
              )}

              <Icon
                className={`w-5 h-5 transition-transform duration-150 ${
                  isActive ? 'scale-110 text-[#00CFFF]' : 'text-[#667085]'
                }`}
              />

              <span
                className={`text-[10px] tracking-wide mt-1 transition-colors duration-150 ${
                  isActive ? 'font-bold text-[#00CFFF]' : 'font-medium text-[#667085]'
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
