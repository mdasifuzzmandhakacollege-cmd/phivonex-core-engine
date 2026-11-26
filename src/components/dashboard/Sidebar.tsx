import React from 'react';
import {
  LayoutDashboard,
  GitFork,
  User,
  ShieldCheck,
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  Bell,
  X,
  BarChart3,
  HelpCircle,
  Layers,
  Archive,
} from 'lucide-react';
import { PhivonexLogo } from '../brand/PhivonexLogo';

export type DashboardTab =
  | 'overview'
  | 'products'
  | 'network'
  | 'reward-analytics'
  | 'wallet'
  | 'deposit'
  | 'withdrawals'
  | 'notifications'
  | 'profile'
  | 'security'
  | 'support'
  | 'legacy';

interface SidebarProps {
  activeTab: DashboardTab;
  onSelectTab: (tab: DashboardTab) => void;
  publicId?: string;
  isMobile?: boolean;
  onCloseMobile?: () => void;
  isAdmin?: boolean;
  hasLegacyPortfolio?: boolean;
  onNavigate?: (route: string) => void;
}

interface NavItem {
  id: DashboardTab;
  label: string;
  icon: React.ElementType;
  accent?: 'cyan' | 'gold' | 'emerald' | 'amber';
}

const CORE_NAV_ITEMS: NavItem[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, accent: 'cyan' },
  { id: 'products', label: 'Ecosystem Hubs', icon: Layers, accent: 'gold' },
  { id: 'network', label: 'Network', icon: GitFork, accent: 'cyan' },
  { id: 'reward-analytics', label: 'Reward Analytics', icon: BarChart3, accent: 'gold' },
  { id: 'wallet', label: 'Wallet & Ledger', icon: Wallet, accent: 'emerald' },
  { id: 'deposit', label: 'Deposit (BNB/USDT)', icon: ArrowDownLeft, accent: 'emerald' },
  { id: 'withdrawals', label: 'Withdrawals', icon: ArrowUpRight, accent: 'cyan' },
  { id: 'notifications', label: 'Notifications', icon: Bell, accent: 'cyan' },
  { id: 'profile', label: 'Profile', icon: User, accent: 'cyan' },
  { id: 'security', label: 'Security', icon: ShieldCheck, accent: 'emerald' },
  { id: 'support', label: 'Support Center', icon: HelpCircle, accent: 'cyan' },
];

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  publicId,
  isMobile = false,
  onCloseMobile,
  isAdmin = false,
  hasLegacyPortfolio = false,
  onNavigate,
}) => {
  const navItems: NavItem[] = hasLegacyPortfolio
    ? [
        ...CORE_NAV_ITEMS,
        { id: 'legacy', label: 'Legacy Portfolio', icon: Archive, accent: 'amber' },
      ]
    : CORE_NAV_ITEMS;

  return (
    <aside
      className={`flex flex-col h-[100dvh] max-h-[100dvh] bg-[#0e1513]/85 backdrop-blur-2xl border-r border-white/[0.1] shadow-[inset_-1px_0_0_rgba(255,255,255,0.06)] overflow-hidden ${
        isMobile ? 'w-full rounded-r-[24px]' : 'w-64 select-none'
      }`}
      role="navigation"
      aria-label="Sidebar Navigation"
    >
      {/* 1. DRAWER HEADER */}
      <div
        className={`flex-shrink-0 px-4 pt-4 pb-3.5 border-b border-white/[0.08] space-y-3 ${
          isMobile ? 'pt-[max(1rem,env(safe-area-inset-top))] pl-[max(1rem,env(safe-area-inset-left))]' : ''
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <PhivonexLogo size="md" />
          </div>

          {isMobile && onCloseMobile && (
            <button
              type="button"
              onClick={onCloseMobile}
              className="p-2 rounded-2xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.1] text-slate-300 hover:text-white transition-all cursor-pointer min-h-[42px] min-w-[42px] flex items-center justify-center active:scale-95 shrink-0"
              aria-label="Close navigation drawer"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Admin Control Plane Fast Link */}
        {isAdmin && (
          <button
            type="button"
            onClick={() => {
              if (onNavigate) {
                onNavigate('/admin');
                if (isMobile && onCloseMobile) {
                  onCloseMobile();
                }
              }
            }}
            className="w-full flex items-center justify-between px-3 py-2.5 rounded-2xl text-xs font-bold transition-all cursor-pointer min-h-[42px] bg-[#FF4D4F]/12 hover:bg-[#FF4D4F]/22 text-[#FF7A7B] border border-[#FF4D4F]/30 shadow-md active:scale-[0.98]"
          >
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-6 h-6 rounded-xl bg-[#FF4D4F]/20 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-3.5 h-3.5 text-[#FF4D4F]" />
              </div>
              <span className="truncate">Admin Control Plane</span>
            </div>
            <ArrowUpRight className="w-3.5 h-3.5 text-[#FF4D4F] shrink-0" />
          </button>
        )}
      </div>

      {/* 2. DRAWER NAVIGATION SCROLL AREA */}
      <div
        className={`flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-3 space-y-1 ${
          isMobile ? 'pl-[max(0.75rem,env(safe-area-inset-left))]' : ''
        }`}
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        <div className="px-2.5 pb-1.5 text-[10px] font-mono uppercase tracking-[0.16em] text-slate-400">
          Workspace Navigation
        </div>

        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          const isGold = item.accent === 'gold' || item.accent === 'amber';

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onSelectTab(item.id);
                if (isMobile && onCloseMobile) {
                  onCloseMobile();
                }
              }}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-2xl text-xs font-medium transition-all duration-200 cursor-pointer min-h-[44px] group relative overflow-hidden active:scale-[0.98] ${
                isActive
                  ? isGold
                    ? 'bg-gradient-to-r from-[#F5B800]/18 via-[#F5B800]/10 to-transparent text-white border border-[#F5B800]/35 shadow-[0_8px_24px_-12px_rgba(245,184,0,0.45)] font-semibold'
                    : 'bg-gradient-to-r from-[#00E5FF]/18 via-[#00E5FF]/8 to-transparent text-white border border-[#00E5FF]/35 shadow-[0_8px_24px_-12px_rgba(0,229,255,0.45)] font-semibold'
                  : 'text-slate-400 hover:text-white hover:bg-white/[0.05] border border-transparent hover:border-white/[0.08]'
              }`}
              aria-current={isActive ? 'page' : undefined}
            >
              {/* Left active edge accent */}
              {isActive && (
                <span
                  aria-hidden="true"
                  className={`absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-r-full ${
                    isGold
                      ? 'bg-[#F5B800] shadow-[0_0_10px_#F5B800]'
                      : 'bg-[#00E5FF] shadow-[0_0_10px_#00E5FF]'
                  }`}
                />
              )}

              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all duration-200 shrink-0 ${
                    isActive
                      ? isGold
                        ? 'bg-[#F5B800]/20 text-[#F5B800] border border-[#F5B800]/30'
                        : 'bg-[#00E5FF]/20 text-[#00E5FF] border border-[#00E5FF]/30'
                      : 'bg-white/[0.04] text-slate-400 group-hover:text-white group-hover:bg-white/[0.08]'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </div>
                <span className="truncate tracking-tight">{item.label}</span>
              </div>

              {isActive && (
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    isGold
                      ? 'bg-[#F5B800] shadow-[0_0_8px_#F5B800]'
                      : 'bg-[#00E5FF] shadow-[0_0_8px_#00E5FF]'
                  }`}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* 3. DRAWER FOOTER (Clean Mainnet Live + PHIVONEX ID) */}
      <div
        className={`flex-shrink-0 px-3.5 py-3.5 border-t border-white/[0.08] bg-[#050807]/70 backdrop-blur-xl ${
          isMobile
            ? 'pb-[max(0.85rem,env(safe-area-inset-bottom))] pl-[max(0.9rem,env(safe-area-inset-left))]'
            : ''
        }`}
      >
        <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/[0.08] space-y-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
          <div className="flex items-center justify-between text-[11px]">
            <div className="flex items-center gap-2 text-[#00E676] font-mono font-semibold">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00E676] opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#00E676]" />
              </span>
              <span>Mainnet Live</span>
            </div>
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">BEP-20</span>
          </div>

          <div className="pt-2 flex items-center justify-between text-[11px] font-mono border-t border-white/[0.06] gap-2">
            <span className="text-slate-400 shrink-0">PHIVONEX ID</span>
            <span className="text-white font-semibold truncate tabular-nums">
              {publicId || 'PHX-MEMBER'}
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
};
