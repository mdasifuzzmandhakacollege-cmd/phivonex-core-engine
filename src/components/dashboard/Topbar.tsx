import React, { useState, useRef, useEffect } from 'react';
import {
  Menu,
  LogOut,
  User,
  ShieldCheck,
  ChevronDown,
  ExternalLink,
  Shield,
  Activity,
} from 'lucide-react';
import { PhivonexLogo } from '../brand/PhivonexLogo';
import { UserProfile } from '../../context/AuthContext';
import { useSystemConfig } from '../../context/SystemConfigContext';
import { DashboardTab } from './Sidebar';
import { BinanceKYCModal } from '../modals/BinanceKYCModal';

interface TopbarProps {
  user: UserProfile | null;
  activeTab: DashboardTab;
  onOpenMobileMenu: () => void;
  onSelectTab: (tab: DashboardTab) => void;
  onLogout: () => Promise<void>;
  onNavigate: (route: string) => void;
}

export const Topbar: React.FC<TopbarProps> = ({
  user,
  onOpenMobileMenu,
  onSelectTab,
  onLogout,
  onNavigate,
}) => {
  const { isConnected } = useSystemConfig();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isKycModalOpen, setIsKycModalOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const isAdmin = Boolean(
    user && (
      user.isAdmin === true ||
      (user.role || '').toUpperCase() === 'ADMIN' ||
      (user.role || '').toUpperCase() === 'SUPER_ADMIN' ||
      user.email?.toLowerCase().trim() === 'md.asifuzzman.dhakacollege@gmail.com' ||
      user.email?.toLowerCase().trim() === 'admin@phivonex.com'
    )
  );

  // Close profile menu on outside click or Escape key
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const getInitials = (name?: string) => {
    if (!name) return 'PHX';
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  return (
    <header className="sticky top-0 z-20 h-16 w-full max-w-full bg-[#050807]/82 backdrop-blur-2xl border-b border-white/[0.08] px-3 sm:px-6 lg:px-8 flex items-center justify-between gap-2">
      {/* Left: Sleek Glass Hamburger Menu Button + Existing PhivonexLogo (Untouched) */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          className="lg:hidden min-h-[44px] min-w-[44px] rounded-2xl bg-[rgba(14,21,19,0.78)] hover:bg-white/[0.08] border border-white/[0.12] text-[#D0D5DD] hover:text-white transition-all cursor-pointer flex items-center justify-center active:scale-95 shrink-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
          aria-label="Open navigation menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <button
          type="button"
          onClick={() => onSelectTab('overview')}
          className="flex items-center min-w-0 cursor-pointer select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00E5FF] rounded-xl py-1"
          title="PHIVONEX Dashboard Overview"
        >
          <PhivonexLogo size="sm" />
        </button>
      </div>

      {/* Right: Compact Live Mainnet Emerald Indicator + User Avatar Pill */}
      <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
        {/* Compact Live Mainnet Indicator */}
        <div
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-[#00E676]/[0.08] border border-[#00E676]/25 text-[#00E676] text-[10px] sm:text-[11px] font-mono font-semibold tracking-wide shrink-0"
          title={isConnected ? 'Mainnet protocol connection synchronized' : 'Reconnecting to mainnet'}
        >
          <span className="relative flex h-2 w-2 shrink-0">
            <span
              className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${
                isConnected ? 'bg-[#00E676] animate-ping' : 'bg-[#F5B800]'
              }`}
            />
            <span
              className={`relative inline-flex rounded-full h-2 w-2 ${
                isConnected ? 'bg-[#00E676]' : 'bg-[#F5B800]'
              }`}
            />
          </span>
          <span className="hidden xs:inline whitespace-nowrap">Live Mainnet</span>
          <span className="xs:hidden whitespace-nowrap">Live</span>
        </div>

        {/* User Avatar Pill with Metallic Gold/Cyan Rank Ring */}
        <div className="relative" ref={userMenuRef}>
          <button
            type="button"
            onClick={() => setIsUserMenuOpen((prev) => !prev)}
            className="flex items-center gap-1.5 sm:gap-2 pl-1.5 pr-2.5 py-1 rounded-full bg-[rgba(14,21,19,0.82)] hover:bg-white/[0.08] border border-white/[0.12] transition-all cursor-pointer min-h-[44px] active:scale-95 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
            aria-expanded={isUserMenuOpen}
            aria-haspopup="true"
            aria-label="Open member profile and security menu"
          >
            {/* Metallic Rank Ring Avatar */}
            <div className="p-[1.5px] rounded-full bg-gradient-to-tr from-[#F5B800] via-[#00E5FF] to-[#00E676] shrink-0">
              <div className="w-8 h-8 rounded-full bg-[#050807] flex items-center justify-center text-[11px] font-mono font-bold text-white tracking-tight">
                {getInitials(user?.fullName)}
              </div>
            </div>

            <div className="hidden sm:flex flex-col items-start min-w-0 max-w-[110px]">
              <span className="text-[11px] font-bold text-white truncate w-full leading-tight">
                {user?.fullName?.split(' ')[0] || 'Member'}
              </span>
              <span className="text-[9px] font-mono text-[#00E5FF] truncate w-full leading-tight">
                {user?.publicId || 'PHX-MEMBER'}
              </span>
            </div>

            <ChevronDown
              className={`w-3.5 h-3.5 text-[#98A2B3] transition-transform duration-200 ${
                isUserMenuOpen ? 'rotate-180 text-white' : ''
              }`}
            />
          </button>

          {/* One UI 9.5 Glass Dropdown Menu */}
          {isUserMenuOpen && (
            <div className="absolute right-0 mt-2.5 w-[min(calc(100vw-1.5rem),18rem)] rounded-[24px] bg-[#0B1210]/95 backdrop-blur-2xl border border-white/[0.14] shadow-[0_24px_60px_-15px_rgba(0,0,0,0.9)] p-2.5 z-50 animate-fadeIn">
              {/* Profile Identity Header */}
              <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.07] mb-2 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-white truncate">
                    {user?.fullName || 'Member Account'}
                  </span>
                  <span className="text-[10px] font-mono font-bold text-[#00E676] bg-[#00E676]/10 px-2 py-0.5 rounded-full border border-[#00E676]/25 shrink-0">
                    {user?.status || 'ACTIVE'}
                  </span>
                </div>
                <div className="text-[11px] font-mono text-[#00E5FF] truncate">
                  {user?.publicId || 'PHX-MEMBER'}
                </div>
                <div className="text-[10px] text-[#98A2B3] truncate">
                  {user?.email || ''}
                </div>
              </div>

              {/* Navigation Actions */}
              <div className="space-y-1">
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => {
                      onNavigate('/admin');
                      setIsUserMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs text-[#F5B800] bg-[#F5B800]/10 hover:bg-[#F5B800]/20 border border-[#F5B800]/30 transition-colors cursor-pointer min-h-[44px] font-bold mb-1"
                  >
                    <Shield className="w-4 h-4 text-[#F5B800] shrink-0" />
                    <span className="truncate">Admin Control Plane</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    onSelectTab('profile');
                    setIsUserMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-[#D0D5DD] hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer min-h-[44px]"
                >
                  <User className="w-4 h-4 text-[#00E5FF] shrink-0" />
                  <span>Account Profile</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    setIsKycModalOpen(true);
                  }}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-xs text-[#D0D5DD] hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer min-h-[44px]"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <ShieldCheck className="w-4 h-4 text-[#F5B800] shrink-0" />
                    <span className="truncate">Identity Verification (KYC)</span>
                  </div>
                  <span
                    className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold shrink-0 ${
                      user?.kycStatus === 'VERIFIED'
                        ? 'bg-[#00E676]/15 text-[#00E676]'
                        : user?.kycStatus === 'PENDING'
                        ? 'bg-[#F5B800]/15 text-[#F5B800]'
                        : 'bg-white/[0.07] text-[#D0D5DD]'
                    }`}
                  >
                    {user?.kycStatus || 'Unverified'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onSelectTab('security');
                    setIsUserMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-[#D0D5DD] hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer min-h-[44px]"
                >
                  <ShieldCheck className="w-4 h-4 text-[#00E676] shrink-0" />
                  <span>Security &amp; Sessions</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onNavigate('/');
                    setIsUserMenuOpen(false);
                  }}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs text-[#D0D5DD] hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer min-h-[44px]"
                >
                  <div className="flex items-center gap-2.5">
                    <Activity className="w-4 h-4 text-[#00E5FF] shrink-0" />
                    <span>Public Portal</span>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-[#98A2B3]" />
                </button>

                <div className="my-1.5 border-t border-white/[0.08]" />

                <button
                  type="button"
                  onClick={async () => {
                    setIsUserMenuOpen(false);
                    await onLogout();
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-[#F04438] hover:bg-[#F04438]/10 transition-colors cursor-pointer min-h-[44px] font-semibold"
                >
                  <LogOut className="w-4 h-4 shrink-0" />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Identity Verification Modal */}
      <BinanceKYCModal
        isOpen={isKycModalOpen}
        onClose={() => setIsKycModalOpen(false)}
      />
    </header>
  );
};
