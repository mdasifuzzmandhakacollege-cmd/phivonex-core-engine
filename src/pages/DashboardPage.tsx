import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { Sidebar, DashboardTab } from '../components/dashboard/Sidebar';
import { Topbar } from '../components/dashboard/Topbar';
import { MobileBottomNav } from '../components/dashboard/MobileBottomNav';
import { OverviewView } from '../components/dashboard/OverviewView';
import { ProfileView } from '../components/dashboard/ProfileView';
import { SecurityView } from '../components/dashboard/SecurityView';
import { MyNodesView } from '../components/dashboard/MyNodesView';
import { NodeHealthView } from '../components/dashboard/NodeHealthView';
import { RewardAnalytics } from '../components/dashboard/RewardAnalytics';
import { BuyNodeView } from '../components/dashboard/BuyNodeView';
import { DirectReferralsView } from '../components/dashboard/DirectReferralsView';
import { NetworkView } from '../components/dashboard/NetworkView';
import { WalletView } from '../components/dashboard/WalletView';
import { WithdrawalsView } from '../components/dashboard/WithdrawalsView';
import { DepositView } from '../components/dashboard/DepositView';
import { SwapView } from '../components/dashboard/SwapView';
import { NotificationsView } from '../components/dashboard/NotificationsView';
import { RewardsView } from '../components/dashboard/RewardsView';
import { TransactionsView } from '../components/dashboard/TransactionsView';
import { PlaceholderView } from '../components/dashboard/PlaceholderView';
import { NotificationPermissionModal } from '../components/notifications/NotificationPermissionModal';
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
    if (cleanPath === '/app/profile' || cleanPath.startsWith('/app/profile/')) return 'profile';
    if (cleanPath === '/app/security' || cleanPath.startsWith('/app/security/')) return 'security';
    if (cleanPath === '/app/node-health' || cleanPath.startsWith('/app/node-health/')) return 'node-health';
    if (cleanPath === '/app/reward-analytics' || cleanPath.startsWith('/app/reward-analytics/')) return 'reward-analytics';
    if (cleanPath === '/app/nodes' || cleanPath.startsWith('/app/nodes/')) return 'nodes';
    if (cleanPath === '/app/network' || cleanPath.startsWith('/app/network/')) return 'network';
    if (cleanPath === '/app/referrals' || cleanPath.startsWith('/app/referrals/')) return 'referrals';
    if (cleanPath === '/app/wallet' || cleanPath.startsWith('/app/wallet/')) return 'wallet';
    if (cleanPath === '/app/swap' || cleanPath.startsWith('/app/swap/')) return 'swap';
    if (cleanPath === '/app/deposit' || cleanPath.startsWith('/app/deposit/')) return 'deposit';
    if (cleanPath === '/app/withdrawals' || cleanPath.startsWith('/app/withdrawals/')) return 'withdrawals';
    if (cleanPath === '/app/notifications' || cleanPath.startsWith('/app/notifications/')) return 'notifications';
    if (cleanPath === '/app/rewards' || cleanPath.startsWith('/app/rewards/')) return 'rewards';
    if (cleanPath === '/app/transactions' || cleanPath.startsWith('/app/transactions/')) return 'transactions';
    return 'overview';
  };

  const [activeTab, setActiveTab] = useState<DashboardTab>(() => getTabFromPath(currentPath));
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

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
      <div className="min-h-screen bg-[#05070B] text-white flex flex-col items-center justify-center p-4 selection:bg-[#00CFFF]/20">
        <div className="p-8 rounded-2xl bg-[#07101D] border border-white/[0.08] shadow-2xl flex flex-col items-center text-center space-y-4 max-w-sm w-full">
          <PhivonexLogo size="lg" />
          <div className="flex items-center gap-3 text-xs font-mono text-[#00CFFF] pt-2">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Verifying session security...</span>
          </div>
          <p className="text-[11px] text-[#98A2B3]">
            Establishing cryptographic handshake with PHIVONEX protocol node.
          </p>
        </div>
      </div>
    );
  }

  // 2. Unauthenticated State (Fallback before redirect)
  if (!user) {
    return (
      <div className="min-h-screen bg-[#05070B] text-white flex flex-col items-center justify-center p-4">
        <div className="p-8 rounded-2xl bg-[#07101D] border border-white/[0.08] shadow-2xl flex flex-col items-center text-center space-y-4 max-w-sm w-full">
          <div className="w-12 h-12 rounded-xl bg-[#F04438]/10 border border-[#F04438]/30 flex items-center justify-center text-[#F04438]">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-white">Authentication Required</h2>
          <p className="text-xs text-[#98A2B3]">
            Your operator session is invalid or expired. Please sign in to access the protocol dashboard.
          </p>
          <button
            onClick={() => onNavigate('/login')}
            className="w-full py-2.5 px-4 rounded-xl bg-[#00CFFF] hover:bg-[#00CFFF]/90 text-[#05070B] font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer min-h-[44px]"
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
          onNavigateTab={(tab) => {
            if (tab === 'nodes') {
              handleSelectTab('nodes');
            } else {
              handleSelectTab(tab as DashboardTab);
            }
          }}
        />
      );
    }

    switch (activeTab) {
      case 'overview':
        return (
          <OverviewView
            user={user}
            onNavigateTab={(tab) => {
              if (tab === 'nodes/buy') {
                onNavigate('/app/nodes/buy');
              } else {
                handleSelectTab(tab as DashboardTab);
              }
            }}
          />
        );
      case 'nodes':
        return (
          <MyNodesView
            user={user}
            onNavigateTab={(tab) => {
              if (tab === 'nodes/buy') {
                onNavigate('/app/nodes/buy');
              } else {
                handleSelectTab(tab as DashboardTab);
              }
            }}
          />
        );
      case 'node-health':
        return (
          <NodeHealthView
            user={user}
            onNavigateTab={(tab) => handleSelectTab(tab as DashboardTab)}
          />
        );
      case 'reward-analytics':
        return (
          <RewardAnalytics
            user={user}
            onNavigateTab={(tab) => handleSelectTab(tab as DashboardTab)}
          />
        );
      case 'network':
        return <NetworkView />;
      case 'wallet':
        return <WalletView user={user} onNavigateTab={(tab) => handleSelectTab(tab as DashboardTab)} />;
      case 'transactions':
        return <TransactionsView user={user} onNavigateTab={(tab) => handleSelectTab(tab as DashboardTab)} />;
      case 'swap':
        return <SwapView user={user} onNavigateTab={(tab) => handleSelectTab(tab as DashboardTab)} />;
      case 'deposit':
        return <DepositView user={user} onNavigateTab={(tab) => handleSelectTab(tab as DashboardTab)} />;
      case 'withdrawals':
        return <WithdrawalsView user={user} onNavigateTab={(tab) => handleSelectTab(tab as DashboardTab)} />;
      case 'notifications':
        return <NotificationsView user={user} onNavigateTab={(tab) => handleSelectTab(tab as DashboardTab)} />;
      case 'rewards':
        return (
          <RewardsView
            user={user}
            onNavigateTab={(tab) => {
              if (tab === 'nodes/buy') {
                onNavigate('/app/nodes/buy');
              } else {
                handleSelectTab(tab as DashboardTab);
              }
            }}
          />
        );
      case 'referrals':
        return (
          <DirectReferralsView
            user={user}
            onNavigateTab={(tab) => {
              if (tab === 'nodes/buy') {
                onNavigate('/app/nodes/buy');
              } else {
                handleSelectTab(tab as DashboardTab);
              }
            }}
          />
        );
      case 'profile':
        return (
          <ProfileView
            user={user}
            onNavigateTab={(tab) => handleSelectTab(tab as DashboardTab)}
          />
        );
      case 'security':
        return (
          <SecurityView
            user={user}
            onNavigateTab={(tab) => handleSelectTab(tab as DashboardTab)}
            onLogout={handleLogout}
          />
        );
      case 'support':
        return (
          <PlaceholderView
            tab={activeTab}
            user={user}
            onNavigateTab={handleSelectTab}
          />
        );
      default:
        return (
          <PlaceholderView
            tab={activeTab}
            user={user}
            onNavigateTab={handleSelectTab}
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

  // 3. Authenticated Dashboard Layout
  return (
    <div className="min-h-screen bg-[#05070B] text-[#F7FAFC] flex font-sans selection:bg-[#00CFFF]/20 selection:text-[#00CFFF]">
      {/* Desktop Sidebar (hidden on mobile) */}
      <div className="hidden lg:block fixed inset-y-0 left-0 z-30 w-64">
        <Sidebar
          activeTab={activeTab}
          onSelectTab={handleSelectTab}
          publicId={user.publicId}
          isAdmin={isAdmin}
          onNavigate={onNavigate}
        />
      </div>

      {/* Mobile Slide-out Drawer & Overlay */}
      {isMobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex" role="dialog" aria-modal="true" aria-label="Navigation Menu">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
            onClick={() => setIsMobileMenuOpen(false)}
            aria-hidden="true"
          />

          {/* Drawer Content */}
          <div className="relative flex flex-col w-[min(88vw,360px)] h-[100dvh] max-h-[100dvh] bg-[#07101D] border-r border-white/[0.08] z-10 overflow-hidden shadow-2xl animate-slideRight">
            <Sidebar
              activeTab={activeTab}
              onSelectTab={handleSelectTab}
              publicId={user.publicId}
              isMobile={true}
              onCloseMobile={() => setIsMobileMenuOpen(false)}
              isAdmin={isAdmin}
              onNavigate={onNavigate}
            />
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col lg:pl-64 min-w-0">
        {/* Topbar */}
        <Topbar
          user={user}
          activeTab={activeTab}
          onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
          onSelectTab={handleSelectTab}
          onLogout={handleLogout}
          onNavigate={onNavigate}
        />

        {/* Dynamic Main Body Content (with bottom padding on mobile so persistent bottom nav never obstructs content) */}
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 pb-28 lg:pb-8">
          {renderTabContent()}
        </main>
      </div>

      {/* Persistent Native-Style Mobile Bottom Navigation Bar (5 Items: Overview, Nodes, Deposit [Center], Network, Wallet) */}
      <MobileBottomNav
        activeTab={activeTab}
        onSelectTab={handleSelectTab}
        currentPath={currentPath}
      />

      {/* Global Notification Permission Prompt Modal */}
      <NotificationPermissionModal userPublicId={user.publicId} />
    </div>
  );
};
