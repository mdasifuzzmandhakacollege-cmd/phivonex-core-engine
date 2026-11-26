import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Sidebar, DashboardTab } from '../components/dashboard/Sidebar';
import { Topbar } from '../components/dashboard/Topbar';
import { MobileBottomNav } from '../components/dashboard/MobileBottomNav';
import { OverviewView } from '../components/dashboard/OverviewView';
import { ProfileView } from '../components/dashboard/ProfileView';
import { SecurityView } from '../components/dashboard/SecurityView';
import { RewardAnalytics } from '../components/dashboard/RewardAnalytics';
import { BuyNodeView } from '../components/dashboard/BuyNodeView';
import { NetworkView } from '../components/dashboard/NetworkView';
import { WalletView } from '../components/dashboard/WalletView';
import { WithdrawalsView } from '../components/dashboard/WithdrawalsView';
import { DepositView } from '../components/dashboard/DepositView';
import { NotificationsView } from '../components/dashboard/NotificationsView';
import { SupportView } from '../components/dashboard/SupportView';
import { PhivonexProductSuite } from '../components/products';
import { LegacyMemberHub } from '../components/legacy/LegacyMemberHub';
import { SmartLaunchModals } from '../components/common/SmartLaunchModals';
import { Loader2, AlertCircle, LogIn } from 'lucide-react';
import { PhivonexLogo } from '../components/brand/PhivonexLogo';

interface DashboardPageProps {
  onNavigate: (route: string) => void;
  currentPath?: string;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({ onNavigate, currentPath = '/app' }) => {
  const { user, loading, logout } = useAuth();

  // Helper to determine initial tab from URL path
  const getTabFromPath = (path: string): DashboardTab => {
    const cleanPath = path.toLowerCase().split('?')[0];
    if (cleanPath === '/app/products' || cleanPath.startsWith('/app/products/')) return 'products';
    if (cleanPath === '/app/network' || cleanPath.startsWith('/app/network/')) return 'network';
    if (cleanPath === '/app/reward-analytics' || cleanPath.startsWith('/app/reward-analytics/')) return 'reward-analytics';
    if (cleanPath === '/app/wallet' || cleanPath.startsWith('/app/wallet/')) return 'wallet';
    if (cleanPath === '/app/deposit' || cleanPath.startsWith('/app/deposit/')) return 'deposit';
    if (cleanPath === '/app/withdrawals' || cleanPath.startsWith('/app/withdrawals/')) return 'withdrawals';
    if (cleanPath === '/app/notifications' || cleanPath.startsWith('/app/notifications/')) return 'notifications';
    if (cleanPath === '/app/profile' || cleanPath.startsWith('/app/profile/')) return 'profile';
    if (cleanPath === '/app/security' || cleanPath.startsWith('/app/security/')) return 'security';
    if (cleanPath === '/app/support' || cleanPath.startsWith('/app/support/')) return 'support';
    if (cleanPath === '/app/legacy' || cleanPath.startsWith('/app/legacy/')) return 'legacy';
    // Backwards compatibility mappings for removed/merged tabs:
    if (cleanPath === '/app/unilevel-matrix' || cleanPath === '/app/leadership-ranks' || cleanPath === '/app/referrals') return 'network';
    if (cleanPath === '/app/nodes' || cleanPath === '/app/node-health' || cleanPath === '/app/swap' || cleanPath === '/app/transactions' || cleanPath === '/app/rewards' || cleanPath === '/app/unified-ledger') return 'wallet';
    return 'overview';
  };

  const [activeTab, setActiveTab] = useState<DashboardTab>(() => getTabFromPath(currentPath));
  const [activeProductHub, setActiveProductHub] = useState<'alpha' | 'genesis' | 'chrono'>('alpha');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [hasLegacyPortfolio, setHasLegacyPortfolio] = useState(false);

  // Stealth Legacy Isolation: Only enable Legacy Portfolio tab if backend confirms historical records
  useEffect(() => {
    if (!user) {
      setHasLegacyPortfolio(false);
      return;
    }
    let cancelled = false;
    fetch('/api/legacy/status', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data && data.hasLegacyPortfolio === true) {
          setHasLegacyPortfolio(true);
        } else if (!cancelled) {
          setHasLegacyPortfolio(false);
        }
      })
      .catch(() => {
        if (!cancelled) setHasLegacyPortfolio(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Lock body scroll and listen for Escape key when mobile menu is open
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden';
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          setIsMobileMenuOpen(false);
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => {
        document.body.style.overflow = '';
        window.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [isMobileMenuOpen]);

  // Sync activeTab when currentPath prop changes
  useEffect(() => {
    const matchedTab = getTabFromPath(currentPath);
    if (matchedTab !== activeTab) {
      setActiveTab(matchedTab);
    }
  }, [currentPath]);

  // Route protection: If authentication check is complete and no user is present, redirect to /login
  useEffect(() => {
    if (!loading && !user) {
      onNavigate('/login');
    }
  }, [loading, user, onNavigate]);

  // Handle switching tabs and syncing browser URL
  const handleSelectTab = (tab: DashboardTab) => {
    setActiveTab(tab);
    const targetUrl = tab === 'overview' ? '/app' : `/app/${tab}`;
    onNavigate(targetUrl);
  };

  // Unified tab + sub-product router for Overview, 3D Flip Card, and Promo Carousel CTAs
  const handleNavigateTarget = (target: string) => {
    const normalized = (target || '').trim().toLowerCase();
    if (normalized === 'nodes/buy') {
      onNavigate('/app/nodes/buy');
      return;
    }
    if (normalized === 'products:alpha') {
      setActiveProductHub('alpha');
      handleSelectTab('products');
      return;
    }
    if (normalized === 'products:genesis' || normalized === 'nodes') {
      setActiveProductHub('genesis');
      handleSelectTab('products');
      return;
    }
    if (normalized === 'products:chrono') {
      setActiveProductHub('chrono');
      handleSelectTab('products');
      return;
    }
    if (normalized === 'unilevel-matrix' || normalized === 'leadership-ranks' || normalized === 'referrals') {
      handleSelectTab('network');
      return;
    }
    if (normalized === 'wallet:transfer' || normalized === 'transfer' || normalized === 'p2p') {
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem('phivonex_scroll_p2p', '1');
      }
      handleSelectTab('wallet');
      setTimeout(() => {
        window.dispatchEvent(new Event('phivonex:focus-p2p-transfer'));
      }, 150);
      return;
    }
    if (normalized === 'swap' || normalized === 'transactions' || normalized === 'rewards') {
      handleSelectTab('wallet');
      return;
    }
    handleSelectTab((normalized || 'overview') as DashboardTab);
  };

  // Handle session logout
  const handleLogout = async () => {
    try {
      await logout();
    } catch (err) {
      console.warn('Logout encountered error:', err);
    } finally {
      onNavigate('/login');
    }
  };

  // 1. Loading State
  if (loading) {
    return (
      <div className="min-h-screen bg-[#050807] text-white flex flex-col items-center justify-center p-4 selection:bg-[#00E5FF]/20">
        <div className="p-8 rounded-[28px] oneui-glass-card flex flex-col items-center text-center space-y-4 max-w-sm w-full">
          <PhivonexLogo size="lg" />
          <div className="flex items-center gap-3 text-xs font-mono text-[#00E5FF] pt-2">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Verifying session security...</span>
          </div>
          <p className="text-[11px] text-[#98A2B3]">
            Establishing secure session with PHIVONEX protocol workspace.
          </p>
        </div>
      </div>
    );
  }

  // 2. Unauthenticated State (Fallback before redirect)
  if (!user) {
    return (
      <div className="min-h-screen bg-[#050807] text-white flex flex-col items-center justify-center p-4">
        <div className="p-8 rounded-[28px] oneui-glass-card flex flex-col items-center text-center space-y-4 max-w-sm w-full">
          <div className="w-12 h-12 rounded-2xl bg-[#F04438]/10 border border-[#F04438]/30 flex items-center justify-center text-[#F04438]">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-white">Authentication Required</h2>
          <p className="text-xs text-[#98A2B3]">
            Your member session is invalid or expired. Please sign in to access the protocol dashboard.
          </p>
          <button
            onClick={() => onNavigate('/login')}
            className="w-full py-2.5 px-4 rounded-2xl bg-[#00E5FF] hover:bg-[#00E5FF]/90 text-[#050807] font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer min-h-[44px]"
          >
            <LogIn className="w-4 h-4" />
            <span>Proceed to Login</span>
          </button>
        </div>
      </div>
    );
  }

  // Render view based on activeTab
  const renderTabContent = () => {
    if (currentPath === '/app/nodes/buy' || currentPath.startsWith('/app/nodes/buy')) {
      return (
        <BuyNodeView
          user={user}
          onNavigateTab={handleNavigateTarget}
        />
      );
    }

    switch (activeTab) {
      case 'overview':
        return (
          <OverviewView
            user={user}
            onNavigateTab={handleNavigateTarget}
          />
        );
      case 'products':
        return (
          <PhivonexProductSuite
            user={user}
            initialProduct={activeProductHub}
            onNavigateTab={handleNavigateTarget}
          />
        );
      case 'network':
        return <NetworkView user={user} />;
      case 'reward-analytics':
        return (
          <RewardAnalytics
            user={user}
            onNavigateTab={handleNavigateTarget}
          />
        );
      case 'wallet':
        return <WalletView user={user} onNavigateTab={handleNavigateTarget} />;
      case 'deposit':
        return <DepositView user={user} onNavigateTab={handleNavigateTarget} />;
      case 'withdrawals':
        return <WithdrawalsView user={user} onNavigateTab={handleNavigateTarget} />;
      case 'notifications':
        return <NotificationsView user={user} onNavigateTab={handleNavigateTarget} />;
      case 'profile':
        return (
          <ProfileView
            user={user}
            onNavigateTab={handleNavigateTarget}
          />
        );
      case 'security':
        return (
          <SecurityView
            user={user}
            onNavigateTab={handleNavigateTarget}
            onLogout={handleLogout}
          />
        );
      case 'support':
        return (
          <SupportView
            displayName={user?.fullName}
            email={user?.email}
          />
        );
      case 'legacy':
        return hasLegacyPortfolio ? (
          <LegacyMemberHub
            user={user}
            onNavigateTab={handleNavigateTarget}
          />
        ) : (
          <OverviewView
            user={user}
            onNavigateTab={handleNavigateTarget}
          />
        );
      default:
        return (
          <OverviewView
            user={user}
            onNavigateTab={handleNavigateTarget}
          />
        );
    }
  };

  const ADMIN_EMAILS = [
    'md.asifuzzman.dhakacollege@gmail.com',
    'admin@phivonex.com',
  ];
  const isAdmin = Boolean(
    user && (
      user.isAdmin === true ||
      (user.role || '').toUpperCase() === 'ADMIN' ||
      (user.role || '').toUpperCase() === 'SUPER_ADMIN' ||
      (user.email && ADMIN_EMAILS.includes(user.email.toLowerCase().trim()))
    )
  );

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-[#050807] text-[#F7FAFC] flex font-sans selection:bg-[#00E5FF]/20 selection:text-[#00E5FF]">
      {/* Subtle One UI 9.5 Ambient Atmospheric Glows */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 overflow-hidden z-0"
      >
        <div className="absolute -top-32 left-1/4 w-[28rem] h-[28rem] rounded-full bg-[#00E5FF]/[0.04] blur-[120px]" />
        <div className="absolute top-1/3 -right-24 w-[24rem] h-[24rem] rounded-full bg-[#F5B800]/[0.035] blur-[120px]" />
      </div>

      {/* Desktop Sidebar (hidden on mobile) */}
      <div className="hidden lg:block fixed inset-y-0 left-0 z-30 w-64">
        <Sidebar
          activeTab={activeTab}
          onSelectTab={handleSelectTab}
          publicId={user.publicId}
          isAdmin={isAdmin}
          hasLegacyPortfolio={hasLegacyPortfolio}
          onNavigate={onNavigate}
        />
      </div>

      {/* Mobile Slide-out Drawer & Overlay */}
      {isMobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex" role="dialog" aria-modal="true" aria-label="Navigation Menu">
          <div
            className="fixed inset-0 bg-black/75 backdrop-blur-md transition-opacity"
            onClick={() => setIsMobileMenuOpen(false)}
            aria-hidden="true"
          />

          <div className="relative flex flex-col w-[min(86vw,340px)] h-[100dvh] max-h-[100dvh] z-10 overflow-hidden shadow-2xl animate-slideRight">
            <Sidebar
              activeTab={activeTab}
              onSelectTab={handleSelectTab}
              publicId={user.publicId}
              isMobile={true}
              onCloseMobile={() => setIsMobileMenuOpen(false)}
              isAdmin={isAdmin}
              hasLegacyPortfolio={hasLegacyPortfolio}
              onNavigate={onNavigate}
            />
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="relative z-10 flex-1 flex flex-col lg:pl-64 min-w-0 max-w-full">
        <Topbar
          user={user}
          activeTab={activeTab}
          onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
          onSelectTab={handleSelectTab}
          onLogout={handleLogout}
          onNavigate={onNavigate}
        />

        <main className="flex-1 w-full max-w-7xl mx-auto min-w-0 px-3 sm:px-6 lg:px-8 pt-[max(1rem,env(safe-area-inset-top))] sm:pt-6 pb-[calc(5.75rem+env(safe-area-inset-bottom))] lg:pb-10">
          {renderTabContent()}
        </main>
      </div>

      <MobileBottomNav
        activeTab={activeTab}
        onSelectTab={handleSelectTab}
        currentPath={currentPath}
      />

      <SmartLaunchModals isAuthenticated={!!user} />
    </div>
  );
};
