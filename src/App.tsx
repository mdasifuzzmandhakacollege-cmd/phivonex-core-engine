/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import { SystemConfigProvider } from './context/SystemConfigContext';
import { ThemeProvider } from './context/ThemeContext';


// Pages
import { RegisterPage } from './pages/RegisterPage';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { NetworkPublicPage } from './pages/NetworkPublicPage';
import { AdminPage } from './pages/AdminPage';
import { PublicLandingPage } from './pages/PublicLandingPage';

// Modals
import { LegalModal } from './components/modals/LegalModal';
import { PWAInstallPrompt } from './components/PWAInstallPrompt';
import { capturePendingReferralCode } from './utils/referralUrl';

function AppContent() {
  const { user, loading } = useAuth();
  const [pendingRefCode, setPendingRefCode] = useState<string | null>(null);

  const [currentPath, setCurrentPath] = useState<string>(() => {
    try {
      return window.location.pathname || '/';
    } catch {
      return '/';
    }
  });

  const [legalModalTitle, setLegalModalTitle] = useState<string | null>(null);

  // Capture referral code from URL parameter on initial load
  useEffect(() => {
    const code = capturePendingReferralCode();
    if (code) {
      setPendingRefCode(code);
    }
  }, []);

  // Synchronize history state for routing
  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname || '/');
      const code = capturePendingReferralCode();
      if (code) {
        setPendingRefCode(code);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = (to: string) => {
    try {
      window.history.pushState({}, '', to);
      const url = new URL(to, window.location.origin);
      setCurrentPath(url.pathname);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      setCurrentPath(to);
    }
  };

  // ROUTE: /network (Public Network & Telemetry Page)
  if (currentPath === '/network' || currentPath.startsWith('/network/')) {
    return <NetworkPublicPage onNavigate={navigate} />;
  }

  // ROUTE: /app (Authenticated Protocol Dashboard)
  if (currentPath === '/app' || currentPath.startsWith('/app/')) {
    if (!loading && !user) {
      return <LoginPage onNavigate={navigate} />;
    }
    return <DashboardPage onNavigate={navigate} currentPath={currentPath} />;
  }

  // ROUTE: /withdrawals (Alias for /app/withdrawals)
  if (currentPath === '/withdrawals' || currentPath.startsWith('/withdrawals/')) {
    if (!loading && !user) {
      return <LoginPage onNavigate={navigate} />;
    }
    return <DashboardPage onNavigate={navigate} currentPath="/app/withdrawals" />;
  }

  // ROUTE: /deposit (Alias for /app/deposit)
  if (currentPath === '/deposit' || currentPath.startsWith('/deposit/')) {
    if (!loading && !user) {
      return <LoginPage onNavigate={navigate} />;
    }
    return <DashboardPage onNavigate={navigate} currentPath="/app/deposit" />;
  }

  // ROUTE: /swap (Alias for /app/swap)
  if (currentPath === '/swap' || currentPath.startsWith('/swap/')) {
    if (!loading && !user) {
      return <LoginPage onNavigate={navigate} />;
    }
    return <DashboardPage onNavigate={navigate} currentPath="/app/swap" />;
  }

  // ROUTE: /notifications (Alias for /app/notifications)
  if (currentPath === '/notifications' || currentPath.startsWith('/notifications/')) {
    if (!loading && !user) {
      return <LoginPage onNavigate={navigate} />;
    }
    return <DashboardPage onNavigate={navigate} currentPath="/app/notifications" />;
  }

  // ROUTE: /rewards (Alias for /app/rewards)
  if (currentPath === '/rewards' || currentPath.startsWith('/rewards/')) {
    if (!loading && !user) {
      return <LoginPage onNavigate={navigate} />;
    }
    return <DashboardPage onNavigate={navigate} currentPath="/app/rewards" />;
  }

  // ROUTE: /admin (Protected Admin Control Plane)
  if (currentPath === '/admin' || currentPath.startsWith('/admin/')) {
    if (!loading && !user) {
      return <LoginPage onNavigate={navigate} />;
    }
    return <AdminPage onNavigate={navigate} currentPath={currentPath} />;
  }

  // ROUTE: /register
  if (currentPath === '/register' || currentPath.startsWith('/register/')) {
    if (!loading && user) {
      return <DashboardPage onNavigate={navigate} currentPath="/app" />;
    }
    return (
      <>
        <RegisterPage
          initialReferralCode={pendingRefCode || undefined}
          onNavigate={navigate}
          onOpenLegalModal={(title) => setLegalModalTitle(title)}
        />
        <LegalModal
          title={legalModalTitle}
          onClose={() => setLegalModalTitle(null)}
        />
      </>
    );
  }

  // ROUTE: /login
  if (currentPath === '/login' || currentPath.startsWith('/login/')) {
    if (!loading && user) {
      return <DashboardPage onNavigate={navigate} currentPath="/app" />;
    }
    return (
      <LoginPage
        onNavigate={navigate}
      />
    );
  }

  // DEFAULT ROUTE: Public Landing Page
  return (
    <>
      <PublicLandingPage onNavigate={navigate} user={user} />
      <PWAInstallPrompt />
    </>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <SystemConfigProvider>
          <NotificationProvider>
            <AppContent />
          </NotificationProvider>
        </SystemConfigProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
