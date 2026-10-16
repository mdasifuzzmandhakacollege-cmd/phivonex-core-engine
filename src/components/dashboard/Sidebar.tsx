import React from 'react';
import {
  LayoutDashboard,
  Server,
  Activity,
  GitFork,
  Coins,
  ArrowLeftRight,
  User,
  ShieldCheck,
  Radio,
  Users,
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  Bell,
  X,
  BarChart3,
  HelpCircle
} from 'lucide-react';
import { PhivonexLogo } from '../brand/PhivonexLogo';

export type DashboardTab =
  | 'overview'
  | 'nodes'
  | 'node-health'
  | 'reward-analytics'
  | 'network'
  | 'referrals'
  | 'wallet'
  | 'swap'
  | 'deposit'
  | 'withdrawals'
  | 'notifications'
  | 'rewards'
  | 'transactions'
  | 'profile'
  | 'security'
  | 'support';

interface SidebarProps {
  activeTab: DashboardTab;
  onSelectTab: (tab: DashboardTab) => void;
  publicId?: string;
  isMobile?: boolean;
  onCloseMobile?: () => void;
  isAdmin?: boolean;
  onNavigate?: (route: string) => void;
}

interface NavItem {
  id: DashboardTab;
  label: string;
  icon: React.ElementType;
  comingSoon?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'nodes', label: 'My Nodes', icon: Server },
  { id: 'node-health', label: 'Node Health', icon: Activity },
  { id: 'reward-analytics', label: 'Reward Analytics', icon: BarChart3 },
  { id: 'network', label: 'Network', icon: GitFork },
  { id: 'referrals', label: 'Direct Referrals', icon: Users },
  { id: 'wallet', label: 'Wallet & Ledger', icon: Wallet },
  { id: 'swap', label: 'Coin Swap', icon: ArrowLeftRight },
  { id: 'deposit', label: 'Deposit (BNB/USDT)', icon: ArrowDownLeft },
  { id: 'withdrawals', label: 'Withdrawals', icon: ArrowUpRight },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'rewards', label: 'Rewards', icon: Coins },
  { id: 'transactions', label: 'Transactions', icon: ArrowLeftRight },
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'security', label: 'Security', icon: ShieldCheck },
  { id: 'support', label: 'Support Center', icon: HelpCircle },
];

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  publicId,
  isMobile = false,
  onCloseMobile,
  isAdmin = false,
  onNavigate,
}) => {
  return (
    <aside
      className={`flex flex-col h-[100dvh] max-h-[100dvh] bg-[#07101D] border-r border-white/[0.08] overflow-hidden ${
        isMobile ? 'w-full' : 'w-64 select-none'
      }`}
      role="navigation"
      aria-label="Sidebar Navigation"
    >
      {/* 1. DRAWER HEADER (Fixed, non-scrolling) */}
      <div
        className={`flex-shrink-0 px-4 pt-4 pb-3 border-b border-white/[0.06] space-y-3 ${
          isMobile ? 'pt-[max(1rem,env(safe-area-inset-top))] pl-[max(1rem,env(safe-area-inset-left))]' : ''
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PhivonexLogo size="md" />
          </div>

          {isMobile && onCloseMobile && (
            <button
              onClick={onCloseMobile}
              className="p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-[#98A2B3] hover:text-white transition-colors cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center active:scale-95"
              aria-label="Close navigation drawer"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Admin Control Plane Fast Link */}
        {isAdmin && (
          <button
            onClick={() => {
              if (onNavigate) {
                onNavigate('/admin');
                if (isMobile && onCloseMobile) {
                  onCloseMobile();
                }
              }
            }}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer min-h-[42px] bg-[#F04438]/15 hover:bg-[#F04438]/25 text-[#F04438] border border-[#F04438]/30 shadow-md active:scale-98"
          >
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-md bg-[#F04438]/20 flex items-center justify-center">
                <ShieldCheck className="w-3.5 h-3.5 text-[#F04438]" />
              </div>
              <span>Admin Control Plane</span>
            </div>
            <ArrowUpRight className="w-3.5 h-3.5 text-[#F04438]" />
          </button>
        )}
      </div>

      {/* 2. DRAWER NAVIGATION SCROLL AREA (Fluid, scrollable independently) */}
      <div
        className={`flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-3 space-y-1 scrollbar-thin ${
          isMobile ? 'pl-[max(0.75rem,env(safe-area-inset-left))]' : ''
        }`}
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        <div className="px-2 pb-1.5 text-[10px] font-mono uppercase tracking-wider text-[#98A2B3]">
          Protocol Navigation
        </div>

        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => {
                onSelectTab(item.id);
                if (isMobile && onCloseMobile) {
                  onCloseMobile();
                }
              }}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all duration-150 cursor-pointer min-h-[44px] group active:scale-98 ${
                isActive
                  ? 'bg-gradient-to-r from-[#00CFFF]/15 to-[#168BFF]/10 text-white border border-[#00CFFF]/30 shadow-sm shadow-[#00CFFF]/10 font-semibold'
                  : 'text-[#98A2B3] hover:text-white hover:bg-white/[0.04] border border-transparent'
              }`}
              aria-current={isActive ? 'page' : undefined}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors shrink-0 ${
                    isActive
                      ? 'bg-[#00CFFF]/20 text-[#00CFFF]'
                      : 'bg-white/[0.03] text-[#98A2B3] group-hover:text-white group-hover:bg-white/[0.06]'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </div>
                <span className="truncate">{item.label}</span>
              </div>

              {item.comingSoon ? (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/[0.05] text-[#98A2B3] border border-white/[0.08] shrink-0">
                  Soon
                </span>
              ) : isActive ? (
                <div className="w-1.5 h-1.5 rounded-full bg-[#00CFFF] shadow-sm shadow-[#00CFFF] shrink-0" />
              ) : null}
            </button>
          );
        })}
      </div>

      {/* 3. DRAWER FOOTER (Fixed at bottom, compact, safe-area padded) */}
      <div
        className={`flex-shrink-0 px-4 py-3 border-t border-white/[0.06] bg-[#050A14]/80 backdrop-blur-sm space-y-2 ${
          isMobile
            ? 'pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))]'
            : ''
        }`}
      >
        {/* Compact Node Telemetry */}
        <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <div className="flex items-center gap-1.5 text-[#32D583] font-mono">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#32D583] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#32D583]"></span>
              </span>
              <span>Mainnet Beta</span>
            </div>
            <span className="text-[10px] font-mono text-[#00CFFF]">TLS 1.3</span>
          </div>

          <div className="pt-1 flex items-center justify-between text-[10px] font-mono text-[#98A2B3] border-t border-white/[0.04]">
            <span className="text-white/50">Operator:</span>
            <span className="text-white font-semibold truncate ml-1">{publicId || 'PHX-OPERATOR'}</span>
          </div>
        </div>

        {/* Compact Version & Sync info */}
        <div className="flex items-center justify-between px-1 text-[10px] font-mono text-white/40">
          <span>PHIVONEX v1.0.4</span>
          <span className="flex items-center gap-1 text-[#00CFFF]">
            <Radio className="w-2.5 h-2.5 text-[#00CFFF]" />
            Live Sync
          </span>
        </div>
      </div>
    </aside>
  );
};
