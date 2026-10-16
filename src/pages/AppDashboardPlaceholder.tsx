import React, { useEffect, useState } from 'react';
import {
  ShieldCheck,
  LogOut,
  CheckCircle2,
  Globe,
  Mail,
  User,
  Activity,
  Copy,
  Check,
  Share2,
  Tag,
  UserCheck,
  Loader2
} from 'lucide-react';
import { PhivonexLogo } from '../components/brand/PhivonexLogo';
import { useAuth } from '../context/AuthContext';
import { buildPublicReferralUrl } from '../utils/referralUrl';

interface AppDashboardPlaceholderProps {
  onNavigate: (route: string) => void;
}

interface ReferralInfo {
  publicId: string;
  referralCode: string;
  referralUrl: string;
  sponsor: {
    publicId: string;
    displayName: string;
  } | null;
}

export const AppDashboardPlaceholder: React.FC<AppDashboardPlaceholderProps> = ({ onNavigate }) => {
  const { user, logout } = useAuth();
  const [referralInfo, setReferralInfo] = useState<ReferralInfo | null>(null);
  const [loadingReferral, setLoadingReferral] = useState(true);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    let isMounted = true;
    async function fetchReferralInfo() {
      try {
        const res = await fetch('/api/referrals/me', {
          credentials: 'include',
        });
        if (res.ok) {
          const data = await res.json();
          if (isMounted) setReferralInfo(data);
        }
      } catch (err) {
        console.warn('Failed to fetch referral info:', err);
      } finally {
        if (isMounted) setLoadingReferral(false);
      }
    }

    fetchReferralInfo();
    return () => {
      isMounted = false;
    };
  }, []);

  const effectiveReferralUrl = buildPublicReferralUrl(
    referralInfo?.referralCode || user?.referralCode || 'PHXGENESIS',
    referralInfo?.referralUrl
  );

  const handleCopyCode = () => {
    const code = referralInfo?.referralCode || user?.referralCode;
    if (!code) return;
    navigator.clipboard.writeText(code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleCopyLink = () => {
    if (!effectiveReferralUrl) return;
    navigator.clipboard.writeText(effectiveReferralUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleLogout = async () => {
    await logout();
    onNavigate('/');
  };

  return (
    <div className="min-h-screen bg-[#05070B] text-[#F7FAFC] flex flex-col justify-between font-sans selection:bg-[#00CFFF]/20 selection:text-[#00CFFF]">
      {/* Header */}
      <header className="border-b border-white/[0.08] bg-[#07101D]/80 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <button
            onClick={() => onNavigate('/')}
            className="flex items-center gap-2 group focus:outline-none cursor-pointer"
            aria-label="Back to home"
          >
            <PhivonexLogo size="md" />
          </button>

          <div className="flex items-center gap-3">
            <button
              onClick={() => onNavigate('/')}
              className="px-3.5 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.1] text-xs text-white font-medium transition-colors cursor-pointer"
            >
              Public Portal
            </button>
            <button
              onClick={handleLogout}
              className="px-3.5 py-1.5 rounded-lg bg-[#F04438]/10 hover:bg-[#F04438]/20 border border-[#F04438]/30 text-xs text-[#F04438] font-medium transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10 flex flex-col justify-center">
        <div className="bg-[#07101D]/90 border border-white/[0.08] rounded-2xl shadow-2xl p-6 sm:p-8 backdrop-blur-xl space-y-6">
          
          {/* Welcome Badge & Title */}
          <div className="space-y-2 text-center sm:text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#00CFFF]/10 border border-[#00CFFF]/30 text-xs font-mono text-[#00CFFF]">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>AUTHENTICATED OPERATOR SESSION</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#F7FAFC] tracking-tight">
              Welcome to PHIVONEX
            </h1>
            <p className="text-xs sm:text-sm text-[#98A2B3]">
              Your account has been authenticated. Below are your unique public ID, personal referral credentials, and verified session attributes.
            </p>
          </div>

          {/* BASIC REFERRAL & IDENTITY CARD (Task #3) */}
          <div className="p-5 rounded-2xl bg-gradient-to-br from-[#07101D] to-[#0D1B2A] border border-[#00CFFF]/30 shadow-lg space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/[0.08] pb-3">
              <div className="flex items-center gap-2 text-white font-bold text-sm">
                <Tag className="w-4 h-4 text-[#00CFFF]" />
                <span>Identity &amp; Referral Credentials</span>
              </div>
              <div className="text-[11px] font-mono text-[#00CFFF] bg-[#00CFFF]/10 px-2.5 py-0.5 rounded-full border border-[#00CFFF]/20 self-start sm:self-auto">
                Immutable Protocol State
              </div>
            </div>

            {loadingReferral ? (
              <div className="py-6 flex items-center justify-center text-xs text-[#98A2B3] gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-[#00CFFF]" />
                <span>Loading referral credentials...</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Public ID */}
                <div className="p-3.5 rounded-xl bg-[#05070B] border border-white/[0.08]">
                  <span className="text-[10px] text-[#98A2B3] block uppercase tracking-wider font-mono">
                    PHIVONEX Public User ID
                  </span>
                  <span className="text-base font-mono font-bold text-white tracking-wide block mt-0.5">
                    {referralInfo?.publicId || user?.publicId || 'PHX-PENDING'}
                  </span>
                  <span className="text-[10px] text-[#98A2B3] block mt-1">
                    Safe to share publicly across network registries.
                  </span>
                </div>

                {/* Referral Code */}
                <div className="p-3.5 rounded-xl bg-[#05070B] border border-white/[0.08]">
                  <span className="text-[10px] text-[#98A2B3] block uppercase tracking-wider font-mono">
                    Personal Referral Code
                  </span>
                  <div className="flex items-center justify-between mt-0.5">
                    <span className="text-base font-mono font-bold text-[#00CFFF] tracking-wider">
                      {referralInfo?.referralCode || user?.referralCode || 'PHX-PENDING'}
                    </span>
                    <button
                      onClick={handleCopyCode}
                      className="px-2.5 py-1 rounded-md bg-white/[0.06] hover:bg-white/[0.12] text-white text-[11px] font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      {copiedCode ? <Check className="w-3 h-3 text-[#32D583]" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedCode ? 'Copied' : 'Copy Code'}</span>
                    </button>
                  </div>
                </div>

                {/* Referral Link */}
                <div className="md:col-span-2 p-3.5 rounded-xl bg-[#05070B] border border-white/[0.08]">
                  <span className="text-[10px] text-[#98A2B3] block uppercase tracking-wider font-mono mb-1">
                    Personal Referral URL
                  </span>
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={effectiveReferralUrl}
                      className="flex-1 bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-2 text-xs font-mono text-[#98A2B3] select-all focus:outline-none"
                    />
                    <button
                      onClick={handleCopyLink}
                      className="px-4 py-2 rounded-lg bg-[#00CFFF] hover:bg-[#00CFFF]/90 text-[#05070B] font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer shrink-0 shadow-md shadow-[#00CFFF]/20"
                    >
                      {copiedLink ? <Check className="w-3.5 h-3.5 text-[#05070B]" /> : <Share2 className="w-3.5 h-3.5" />}
                      <span>{copiedLink ? 'Link Copied!' : 'Copy Link'}</span>
                    </button>
                  </div>
                </div>

                {/* Sponsor relationship (if applicable) */}
                {referralInfo?.sponsor && (
                  <div className="md:col-span-2 p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <UserCheck className="w-4 h-4 text-[#32D583]" />
                      <span className="text-white">
                        Sponsor: <strong className="text-[#32D583]">{referralInfo.sponsor.displayName}</strong>
                      </span>
                    </div>
                    <span className="text-[11px] font-mono text-[#98A2B3]">
                      ID: {referralInfo.sponsor.publicId}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* User Account Info Card */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 rounded-xl bg-[#05070B] border border-white/[0.08] text-xs">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#00CFFF]/10 border border-[#00CFFF]/30 flex items-center justify-center text-[#00CFFF] shrink-0">
                <User className="w-4 h-4" />
              </div>
              <div className="overflow-hidden">
                <span className="text-[10px] text-[#98A2B3] block">Operator</span>
                <span className="font-semibold text-white truncate block">{user?.fullName || 'Operator'}</span>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#168BFF]/10 border border-[#168BFF]/30 flex items-center justify-center text-[#168BFF] shrink-0">
                <Mail className="w-4 h-4" />
              </div>
              <div className="overflow-hidden">
                <span className="text-[10px] text-[#98A2B3] block">Email</span>
                <span className="font-semibold text-white truncate block">{user?.email || 'N/A'}</span>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#32D583]/10 border border-[#32D583]/30 flex items-center justify-center text-[#32D583] shrink-0">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[10px] text-[#98A2B3] block">Status</span>
                <span className="font-semibold text-[#32D583] block">{user?.status || 'ACTIVE'}</span>
              </div>
            </div>
          </div>

          {/* Scope Notice */}
          <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-start gap-2.5 text-xs text-[#98A2B3]">
            <Activity className="w-4 h-4 text-[#00CFFF] shrink-0 mt-0.5" />
            <div>
              <strong className="text-white font-semibold block mb-0.5">Task #3: Identity, Referral Code &amp; Sponsor Active</strong>
              <span>
                Personal referral code and sponsor association are locked and immutable. Binary-tree placement, referral commissions, wallets, and mining rewards will be configured in subsequent development tasks.
              </span>
            </div>
          </div>

          {/* Sign Out CTA */}
          <div className="pt-2 flex justify-end">
            <button
              onClick={handleLogout}
              className="px-5 py-2.5 rounded-lg bg-[#F04438]/10 hover:bg-[#F04438]/20 border border-[#F04438]/30 text-[#F04438] font-semibold text-xs flex items-center gap-2 transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign Out</span>
            </button>
          </div>

        </div>
      </main>

      {/* Footer */}
      <footer className="py-4 border-t border-white/[0.06] text-center text-[11px] text-[#98A2B3] font-mono">
        © 2026 PHIVONEX. All rights reserved.
      </footer>
    </div>
  );
};
