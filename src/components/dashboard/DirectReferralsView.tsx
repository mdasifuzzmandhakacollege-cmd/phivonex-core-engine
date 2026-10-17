import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  Coins,
  Copy,
  Check,
  Share2,
  UserCheck,
  Loader2,
  AlertCircle,
  Clock,
  Sparkles,
  Server,
  ArrowRight,
  ShieldCheck,
  Layers,
  RefreshCw,
  ExternalLink,
  Info,
  GitFork,
  ArrowLeft,
  CheckCircle2,
  QrCode,
} from 'lucide-react';
import { UserProfile } from '../../context/AuthContext';
import { buildPublicReferralUrl } from '../../utils/referralUrl';
import { ReferralShareModal } from '../modals/ReferralShareModal';

interface ReferralProfileData {
  publicId: string;
  referralCode: string;
  referralUrl: string;
  sponsor: {
    publicId: string;
    displayName: string;
  } | null;
}

interface DirectReferral {
  publicId: string;
  displayName: string;
  joinedAt: string;
  placementStatus?: 'UNPLACED' | 'PLACED';
  teamSide?: 'LEFT' | 'RIGHT' | null;
  placedAt?: string | null;
  nodeActive?: boolean;
}

interface CommissionRecord {
  publicCommissionId: string;
  referredUserPublicId: string;
  nodePublicId: string;
  amountUsd: number;
  status: 'EARNED' | 'REVERSED';
  earnedAt: string;
  reversedAt?: string | null;
}

interface DirectReferralsViewProps {
  user: UserProfile | null;
  onNavigateTab?: (tab: string) => void;
}

export const DirectReferralsView: React.FC<DirectReferralsViewProps> = ({
  user,
  onNavigateTab,
}) => {
  const [profileData, setProfileData] = useState<ReferralProfileData | null>(null);
  const [directs, setDirects] = useState<DirectReferral[]>([]);
  const [commissions, setCommissions] = useState<CommissionRecord[]>([]);
  const [totalEarnedUsd, setTotalEarnedUsd] = useState<number>(0);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [sharedLink, setSharedLink] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [placingMemberId, setPlacingMemberId] = useState<string | null>(null);
  const [placementMessage, setPlacementMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const loadData = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    setError(null);

    try {
      const [profRes, directsRes, commsRes] = await Promise.all([
        fetch('/api/referrals/me', { credentials: 'include' }),
        fetch('/api/referrals/direct', { credentials: 'include' }),
        fetch('/api/referral-commissions/me', { credentials: 'include' }),
      ]);

      if (profRes.ok) {
        const prof = await profRes.json();
        setProfileData(prof);
      }

      if (directsRes.ok) {
        const dirData = await directsRes.json();
        setDirects(dirData.referrals || []);
      }

      if (commsRes.ok) {
        const commData = await commsRes.json();
        setCommissions(commData.commissions || []);
        setTotalEarnedUsd(commData.totalEarnedUsd || 0);
      }
    } catch (err: any) {
      console.warn('[DirectReferralsView] Failed to fetch direct referral data:', err);
      setError(err.message || 'Unable to synchronize direct referral information.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const rawCode = profileData?.referralCode || user?.referralCode || '';
  const isPendingCode =
    !rawCode ||
    rawCode.toUpperCase() === 'PHX-PENDING' ||
    rawCode.trim() === '';

  const displayCode = isPendingCode ? 'Generating...' : rawCode;

  const effectiveReferralUrl = isPendingCode
    ? ''
    : buildPublicReferralUrl(rawCode, profileData?.referralUrl);

  const handleCopyCode = () => {
    if (isPendingCode || !displayCode) return;
    navigator.clipboard.writeText(displayCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleCopyLink = () => {
    if (isPendingCode || !effectiveReferralUrl) return;
    navigator.clipboard.writeText(effectiveReferralUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleShare = () => {
    if (isPendingCode || !effectiveReferralUrl) return;
    setShareModalOpen(true);
  };

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return iso;
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return iso;
    }
  };

  const formatDateTime = (iso: string) => {
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return iso;
      return d.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  const handleQuickPlace = async (memberPublicId: string, side: 'LEFT' | 'RIGHT') => {
    setPlacingMemberId(memberPublicId);
    setPlacementMessage(null);
    try {
      const res = await fetch('/api/network/place', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          memberPublicId,
          preferredSide: side,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Placement failed');
      }
      setPlacementMessage({
        text: `Successfully placed into ${data.side} team!`,
        type: 'success',
      });
      await loadData();
    } catch (err: any) {
      setPlacementMessage({
        text: err.message || 'Failed to place member.',
        type: 'error',
      });
    } finally {
      setPlacingMemberId(null);
    }
  };

  // Calculate distinct activated node count from earned commissions
  const earnedCommissions = commissions.filter((c) => c.status === 'EARNED');
  const eligibleActivatedNodesCount = earnedCommissions.length;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <Loader2 className="w-8 h-8 text-[#00CFFF] animate-spin" />
        <p className="text-xs font-mono text-[#98A2B3] uppercase tracking-wider">
          Loading direct referral data...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 sm:space-y-8 animate-fadeIn pb-12">
      {/* ========================================================
          1. COMPACT PAGE HERO
         ======================================================== */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#07101D] via-[#0B1728] to-[#07101D] border border-white/[0.08] p-5 sm:p-7 shadow-xl">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-72 h-72 bg-[#00CFFF]/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-[#00CFFF]/10 border border-[#00CFFF]/25 text-[#00CFFF] text-[11px] font-semibold">
                <Users className="w-3.5 h-3.5" />
                Referral Program
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-[#32D583]/10 border border-[#32D583]/25 text-[#32D583] text-[11px] font-semibold">
                <Sparkles className="w-3 h-3" />
                $50 per eligible activated node
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              Direct Referrals
            </h1>

            <p className="text-xs sm:text-sm text-[#98A2B3] max-w-2xl leading-relaxed">
              Invite users with your referral link and track eligible direct referral activity.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto">
            <button
              onClick={() => loadData(true)}
              disabled={refreshing}
              className="px-3 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-[#98A2B3] hover:text-white border border-white/[0.08] text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 min-h-[44px]"
              title="Refresh referral metrics"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-[#00CFFF]' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-[#F04438]/10 border border-[#F04438]/30 flex items-center gap-3 text-xs text-[#F04438]">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ========================================================
          2. COMPACT KPI GRID
         ======================================================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* KPI 1: Direct Referrals */}
        <div className="p-4 sm:p-5 rounded-xl bg-[#07101D] border border-white/[0.08] space-y-2 relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-[#98A2B3]">
            <span className="font-medium">Direct Referrals</span>
            <div className="w-7 h-7 rounded-lg bg-[#00CFFF]/10 border border-[#00CFFF]/20 flex items-center justify-center text-[#00CFFF]">
              <Users className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-bold font-mono text-white tabular-nums">
            {directs.length}
          </div>
          <div className="text-[11px] text-[#667085]">
            Registered with your referral code
          </div>
        </div>

        {/* KPI 2: Eligible Activated Nodes */}
        <div className="p-4 sm:p-5 rounded-xl bg-[#07101D] border border-white/[0.08] space-y-2 relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-[#98A2B3]">
            <span className="font-medium">Eligible Activated Nodes</span>
            <div className="w-7 h-7 rounded-lg bg-[#00CFFF]/10 border border-[#00CFFF]/20 flex items-center justify-center text-[#00CFFF]">
              <Server className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-bold font-mono text-white tabular-nums">
            {eligibleActivatedNodesCount}
          </div>
          <div className="text-[11px] text-[#667085]">
            Qualifying node activations
          </div>
        </div>

        {/* KPI 3: Settled Referral Rewards */}
        <div className="p-4 sm:p-5 rounded-xl bg-[#07101D] border border-[#32D583]/20 space-y-2 relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-[#98A2B3]">
            <span className="font-medium">Settled Rewards</span>
            <div className="w-7 h-7 rounded-lg bg-[#32D583]/10 border border-[#32D583]/20 flex items-center justify-center text-[#32D583]">
              <Coins className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-bold font-mono text-[#32D583] tabular-nums">
            ${totalEarnedUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-[#32D583]/80">
            Credited to wallet ledger
          </div>
        </div>

        {/* KPI 4: Pending / Processing Rewards */}
        <div className="p-4 sm:p-5 rounded-xl bg-[#07101D] border border-white/[0.08] space-y-2 relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-[#98A2B3]">
            <span className="font-medium">Processing Status</span>
            <div className="w-7 h-7 rounded-lg bg-white/[0.05] border border-white/[0.1] flex items-center justify-center text-[#98A2B3]">
              <Clock className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-bold font-mono text-white tabular-nums">
            $0.00
          </div>
          <div className="text-[11px] text-[#667085]">
            All eligible rewards settled
          </div>
        </div>
      </div>

      {/* ========================================================
          3. REFERRAL CREDENTIAL CARD (CODE + LINK)
         ======================================================== */}
      <div className="p-5 sm:p-6 rounded-2xl bg-[#07101D] border border-white/[0.08] shadow-xl space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/[0.06] pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#00CFFF]/10 border border-[#00CFFF]/20 flex items-center justify-center text-[#00CFFF]">
              <Share2 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white">
                Your Referral Credentials
              </h2>
              <p className="text-xs text-[#98A2B3]">
                $50 direct referral reward per eligible activated node.
              </p>
            </div>
          </div>

          {profileData?.sponsor && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white/[0.03] border border-white/[0.06] text-xs text-[#98A2B3] self-start sm:self-auto">
              <UserCheck className="w-3.5 h-3.5 text-[#32D583]" />
              <span>Sponsor:</span>
              <span className="text-white font-medium">{profileData.sponsor.displayName}</span>
              <span className="font-mono text-[11px] text-[#00CFFF]">({profileData.sponsor.publicId})</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          {/* Referral Code */}
          <div className="space-y-2">
            <label className="text-xs font-mono text-[#98A2B3] uppercase tracking-wider block">
              Referral Code
            </label>
            <div className="flex items-center gap-2">
              <div className="flex-1 px-4 py-3 rounded-xl bg-[#05070B] border border-white/[0.08] font-mono text-sm font-bold text-[#00CFFF] tracking-wider select-all truncate min-h-[44px] flex items-center">
                {displayCode}
              </div>
              <button
                onClick={handleCopyCode}
                disabled={isPendingCode}
                className="px-4 py-3 rounded-xl bg-[#00CFFF]/10 hover:bg-[#00CFFF]/20 text-[#00CFFF] border border-[#00CFFF]/30 font-mono text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed min-h-[44px]"
                title={isPendingCode ? 'Referral code is generating' : 'Copy referral code'}
              >
                {copiedCode ? <Check className="w-4 h-4 text-[#32D583]" /> : <Copy className="w-4 h-4" />}
                <span>{copiedCode ? 'Copied' : 'Copy Code'}</span>
              </button>
            </div>
          </div>

          {/* Referral Link */}
          <div className="space-y-2">
            <label className="text-xs font-mono text-[#98A2B3] uppercase tracking-wider block">
              Referral Link
            </label>
            <div className="flex items-center gap-2">
              <div className="flex-1 px-4 py-3 rounded-xl bg-[#05070B] border border-white/[0.08] font-mono text-xs text-[#F7FAFC] truncate select-all min-h-[44px] flex items-center">
                {isPendingCode ? (
                  <span className="text-[#667085] italic">Generating link...</span>
                ) : (
                  effectiveReferralUrl
                )}
              </div>
              <button
                onClick={handleCopyLink}
                disabled={isPendingCode}
                className="px-4 py-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-white border border-white/[0.1] font-mono text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed min-h-[44px] shrink-0"
                title={isPendingCode ? 'Referral link is generating' : 'Copy invitation link'}
              >
                {copiedLink ? <Check className="w-4 h-4 text-[#32D583]" /> : <Copy className="w-4 h-4" />}
                <span>{copiedLink ? 'Copied' : 'Copy Link'}</span>
              </button>
              <button
                onClick={handleShare}
                disabled={isPendingCode}
                className="px-4 py-3 rounded-xl bg-[#00CFFF] hover:bg-[#00CFFF]/90 text-[#05070B] font-mono text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed min-h-[44px] shrink-0 shadow-[0_0_20px_rgba(0,207,255,0.25)]"
                title="Open QR Code with Project Logo & Social Share"
              >
                <QrCode className="w-4 h-4" />
                <Share2 className="w-4 h-4" />
                <span className="font-bold">Share & QR</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================
          4. TWO-COLUMN: DIRECT REFERRAL LIST & RECENT REWARDS
         ======================================================== */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Column 1: Direct Referral List */}
        <div className="p-5 sm:p-6 rounded-2xl bg-[#07101D] border border-white/[0.08] space-y-4 flex flex-col">
          <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-[#00CFFF]" />
              <h3 className="text-sm font-bold text-white">
                Direct Referrals ({directs.length})
              </h3>
            </div>
            <span className="text-[11px] text-[#667085]">
              Privacy Protected
            </span>
          </div>

          {placementMessage && (
            <div className={`p-3 rounded-xl text-xs flex items-center justify-between gap-2 animate-fadeIn ${
              placementMessage.type === 'success'
                ? 'bg-[#32D583]/10 border border-[#32D583]/30 text-[#32D583]'
                : 'bg-[#F04438]/10 border border-[#F04438]/30 text-[#F04438]'
            }`}>
              <span>{placementMessage.text}</span>
              <button
                type="button"
                onClick={() => setPlacementMessage(null)}
                className="text-white hover:underline text-[10px] font-mono cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          )}

          {directs.length === 0 ? (
            <div className="py-12 px-4 rounded-xl bg-[#05070B] border border-white/[0.04] text-center space-y-3 my-auto">
              <div className="w-12 h-12 rounded-xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mx-auto text-[#667085]">
                <Users className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-semibold text-white">No Direct Referrals Yet</h4>
                <p className="text-xs text-[#98A2B3] max-w-sm mx-auto">
                  Share your referral link to invite users to PHIVONEX.
                </p>
              </div>
              <button
                onClick={handleCopyLink}
                disabled={isPendingCode}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#00CFFF]/10 hover:bg-[#00CFFF]/20 text-[#00CFFF] border border-[#00CFFF]/30 text-xs font-semibold transition-all cursor-pointer disabled:opacity-50 min-h-[44px]"
              >
                {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>Copy Referral Link</span>
              </button>
            </div>
          ) : (
            <div className="space-y-2.5 max-h-[440px] overflow-y-auto custom-scrollbar pr-1">
              {directs.map((ref, idx) => (
                <div
                  key={idx}
                  className="p-3.5 rounded-xl bg-[#05070B] border border-white/[0.06] hover:border-white/[0.12] transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-[#00CFFF]/10 border border-[#00CFFF]/20 flex items-center justify-center text-xs font-mono font-bold text-[#00CFFF] shrink-0">
                      #{idx + 1}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-white truncate">
                        {ref.displayName}
                      </div>
                      <div className="text-[11px] font-mono text-[#00CFFF] truncate">
                        {ref.publicId}
                      </div>
                      <div className="text-[10px] font-mono text-[#667085] flex items-center gap-1 mt-0.5">
                        <Clock className="w-2.5 h-2.5" />
                        <span>Joined: {formatDate(ref.joinedAt)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                    {ref.placementStatus === 'PLACED' ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-mono font-semibold bg-[#32D583]/10 text-[#32D583] border border-[#32D583]/20">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Placed: {ref.teamSide} Team</span>
                      </span>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={placingMemberId === ref.publicId}
                          onClick={() => handleQuickPlace(ref.publicId, 'LEFT')}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#00CFFF]/10 hover:bg-[#00CFFF]/20 text-[#00CFFF] border border-[#00CFFF]/30 text-[11px] font-mono font-semibold transition-all cursor-pointer disabled:opacity-50 min-h-[32px]"
                        >
                          <ArrowLeft className="w-3 h-3" />
                          <span>Place LEFT</span>
                        </button>
                        <button
                          type="button"
                          disabled={placingMemberId === ref.publicId}
                          onClick={() => handleQuickPlace(ref.publicId, 'RIGHT')}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#32D583]/10 hover:bg-[#32D583]/20 text-[#32D583] border border-[#32D583]/30 text-[11px] font-mono font-semibold transition-all cursor-pointer disabled:opacity-50 min-h-[32px]"
                        >
                          <span>Place RIGHT</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {onNavigateTab && (
                <div className="pt-2 border-t border-white/[0.04]">
                  <button
                    type="button"
                    onClick={() => onNavigateTab('network')}
                    className="w-full py-2.5 rounded-xl bg-white/[0.02] hover:bg-white/[0.06] text-xs font-mono text-[#00CFFF] flex items-center justify-center gap-1.5 transition-all cursor-pointer min-h-[40px]"
                  >
                    <GitFork className="w-3.5 h-3.5" />
                    <span>View Binary Tree & Spillover Network</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Column 2: Recent Referral Rewards */}
        <div className="p-5 sm:p-6 rounded-2xl bg-[#07101D] border border-white/[0.08] space-y-4 flex flex-col">
          <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
            <div className="flex items-center gap-2">
              <Coins className="w-4 h-4 text-[#32D583]" />
              <h3 className="text-sm font-bold text-white">
                Recent Referral Rewards ({commissions.length})
              </h3>
            </div>
            <span className="text-xs font-mono font-bold text-[#32D583] tabular-nums">
              ${totalEarnedUsd.toFixed(2)} Total
            </span>
          </div>

          {commissions.length === 0 ? (
            <div className="py-12 px-4 rounded-xl bg-[#05070B] border border-white/[0.04] text-center space-y-3 my-auto">
              <div className="w-12 h-12 rounded-xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mx-auto text-[#667085]">
                <Coins className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-semibold text-white">No Referral Rewards Yet</h4>
                <p className="text-xs text-[#98A2B3] max-w-sm mx-auto">
                  Eligible referral rewards will appear here after qualifying node activations are settled.
                </p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-white/[0.06] max-h-[400px] overflow-y-auto custom-scrollbar pr-1">
              {commissions.slice(0, 10).map((comm, idx) => (
                <div key={idx} className="py-3 flex items-center justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-white">
                        {comm.publicCommissionId}
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase tracking-wider ${
                          comm.status === 'EARNED'
                            ? 'bg-[#32D583]/10 text-[#32D583] border border-[#32D583]/30'
                            : 'bg-[#F04438]/10 text-[#F04438] border border-[#F04438]/30'
                        }`}
                      >
                        {comm.status === 'EARNED' ? 'Settled' : 'Reversed'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-[10px] font-mono text-[#98A2B3]">
                      <span>Node: <span className="text-[#00CFFF]">{comm.nodePublicId}</span></span>
                      <span>•</span>
                      <span>By: <span className="text-white">{comm.referredUserPublicId}</span></span>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-sm font-mono font-bold text-[#32D583] tabular-nums">
                      +${comm.amountUsd.toFixed(2)}
                    </div>
                    <div className="text-[10px] font-mono text-[#667085]">
                      {formatDateTime(comm.earnedAt)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {commissions.length > 0 && onNavigateTab && (
            <div className="pt-2 border-t border-white/[0.04]">
              <button
                onClick={() => onNavigateTab('wallet')}
                className="w-full py-2 rounded-xl bg-white/[0.02] hover:bg-white/[0.06] text-xs font-mono text-[#00CFFF] flex items-center justify-center gap-1.5 transition-all cursor-pointer min-h-[44px]"
              >
                <span>View Full Wallet Ledger</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ========================================================
          5. CONCISE REFERRAL RULES CARD
         ======================================================== */}
      <div className="p-4 sm:p-5 rounded-xl bg-[#07101D] border border-white/[0.06] flex items-start gap-3 text-xs text-[#98A2B3]">
        <Info className="w-4 h-4 text-[#00CFFF] shrink-0 mt-0.5" />
        <div className="space-y-1.5">
          <p className="text-white font-semibold">Referral Rules</p>
          <ul className="space-y-1 text-[11px] leading-relaxed list-disc list-inside text-[#98A2B3]">
            <li>Direct referral relationship is recorded at registration.</li>
            <li>A referral reward applies only to eligible activated nodes.</li>
            <li>Reward status is shown after settlement.</li>
          </ul>
        </div>
      </div>

      {/* Branded Referral Share & QR Code Modal */}
      <ReferralShareModal
        isOpen={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        referralCode={displayCode}
        referralUrl={effectiveReferralUrl}
        userName={user?.fullName || profileData?.sponsor?.displayName}
      />
    </div>
  );
};
