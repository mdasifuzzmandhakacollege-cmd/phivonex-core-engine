import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowRight,
  Repeat,
  Users,
  Activity,
  Trophy,
  Zap,
  ShieldCheck,
  ShieldAlert,
  Clock,
  Layers,
  Share2,
  Send,
} from 'lucide-react';
import { UserProfile } from '../../context/AuthContext';
import { buildPublicReferralUrl } from '../../utils/referralUrl';
import { ReferralShareModal } from '../modals/ReferralShareModal';
import { BinanceKYCModal } from '../modals/BinanceKYCModal';
import { TokenPriceTrendChart } from './TokenPriceTrendChart';
import { RewardTrend30DaysChart } from './RewardTrend30DaysChart';
import { Premium3DFlipCard } from './Premium3DFlipCard';
import { OverviewPromoCarousel } from './OverviewPromoCarousel';
import { RecentActivityLog } from './RecentActivityLog';
import { useSystemConfig } from '../../context/SystemConfigContext';

interface ReferralMeResponse {
  publicId: string;
  referralCode: string;
  referralUrl: string;
  sponsor: {
    publicId: string;
    displayName: string;
  } | null;
}

interface WalletBreakdown {
  referral: number;
  matching: number;
  promotion: number;
  nodeReward?: number;
  quantumAlpha?: number;
  chronoVaults?: number;
  unilevelRoyalty?: number;
  deposit?: number;
  swap?: number;
}

interface WalletSummary {
  totalEarned: number;
  totalReversed: number;
  ledgerBalance: number;
  availableBalance?: number;
  phivoBalance?: number;
  transactionCount: number;
  breakdown: WalletBreakdown;
}

interface LedgerTransactionItem {
  id: string;
  publicTxnId: string;
  userId: string;
  entryType: 'CREDIT' | 'DEBIT' | 'REVERSAL';
  sourceType: string;
  sourceId: string;
  sourceRef: string;
  description: string;
  amount: number;
  currency: string;
  status: 'SETTLED' | 'REVERSED' | 'PENDING';
  createdAt: string;
}

interface UnilevelRoyaltiesOverview {
  personalActiveInvestmentUsd: number;
  unlockedGenerationsCount: number;
  directActiveSponsorsCount: number;
  usdtRoyaltiesTotal: number;
  phivoRoyaltiesTotal: number;
  activeNodesCount: number;
}

interface UnilevelRankOverview {
  currentRankLevel: number;
  currentRankName: string;
  nextRankName: string | null;
  progressPct: number;
}

interface OverviewViewProps {
  user: UserProfile | null;
  onNavigateTab?: (tab: string) => void;
}

export const OverviewView: React.FC<OverviewViewProps> = ({ user, onNavigateTab }) => {
  const { coinPriceUsdt, nodeBasePriceUsd } = useSystemConfig();

  const [referralData, setReferralData] = useState<ReferralMeResponse | null>(null);
  const [walletData, setWalletData] = useState<WalletSummary | null>(null);
  const [recentTransactions, setRecentTransactions] = useState<LedgerTransactionItem[]>([]);
  const [activeNodesCount, setActiveNodesCount] = useState<number>(0);
  const [totalMinedPhivo, setTotalMinedPhivo] = useState<number>(0);
  const [directReferralsCount, setDirectReferralsCount] = useState<number>(0);
  const [phivoRate, setPhivoRate] = useState<number>(coinPriceUsdt || 0.1);
  const [royaltiesOverview, setRoyaltiesOverview] = useState<UnilevelRoyaltiesOverview>({
    personalActiveInvestmentUsd: 0,
    unlockedGenerationsCount: 0,
    directActiveSponsorsCount: 0,
    usdtRoyaltiesTotal: 0,
    phivoRoyaltiesTotal: 0,
    activeNodesCount: 0,
  });
  const [rankOverview, setRankOverview] = useState<UnilevelRankOverview>({
    currentRankLevel: 0,
    currentRankName: 'Initiate Member',
    nextRankName: 'Quantum Architect',
    progressPct: 0,
  });

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [isKycModalOpen, setIsKycModalOpen] = useState(false);

  const fetchDashboardData = useCallback(async (isManual = false) => {
    if (isManual) setIsRefreshing(true);

    try {
      const [
        refRes,
        walletRes,
        txRes,
        nodesRes,
        rewardsRes,
        royaltiesRes,
        rankRes,
        directsRes,
        econRes,
      ] = await Promise.allSettled([
        fetch('/api/referrals/me', { credentials: 'include' }),
        fetch('/api/wallet/me', { credentials: 'include' }),
        fetch('/api/wallet/transactions?page=1&limit=25', { credentials: 'include' }),
        fetch('/api/nodes/me', { credentials: 'include' }),
        fetch('/api/rewards/me', { credentials: 'include' }),
        fetch('/api/unilevel/royalties/overview?page=1&limit=10', { credentials: 'include' }),
        fetch('/api/unilevel/ranks/overview', { credentials: 'include' }),
        fetch('/api/referrals/direct', { credentials: 'include' }),
        fetch('/api/economic/public'),
      ]);

      if (refRes.status === 'fulfilled' && refRes.value.ok) {
        const data = await refRes.value.json();
        setReferralData(data);
      }

      if (walletRes.status === 'fulfilled' && walletRes.value.ok) {
        const data = await walletRes.value.json();
        setWalletData(data);
      }

      if (txRes.status === 'fulfilled' && txRes.value.ok) {
        const data = await txRes.value.json();
        setRecentTransactions(Array.isArray(data.transactions) ? data.transactions : []);
      }

      if (nodesRes.status === 'fulfilled' && nodesRes.value.ok) {
        const data = await nodesRes.value.json();
        const userNodes = Array.isArray(data.nodes) ? data.nodes : [];
        const active = userNodes.filter(
          (n: any) => n.status === 'ACTIVE' || n.status === 'EMITTING'
        ).length;
        setActiveNodesCount(active);
      }

      if (rewardsRes.status === 'fulfilled' && rewardsRes.value.ok) {
        const rData = await rewardsRes.value.json();
        const accrued = Number(rData.totalAccrued || 0);
        const claimed = Number(rData.totalClaimed || 0);
        setTotalMinedPhivo(Number(rData.totalRewards ?? accrued + claimed));
      }

      if (royaltiesRes.status === 'fulfilled' && royaltiesRes.value.ok) {
        const json = await royaltiesRes.value.json();
        const d = json?.data || json;
        if (d) {
          const tradingRoyalty = Number(d.byProductBreakdown?.tradingPoolRoyaltyUsd || 0);
          const vaultRoyalty = Number(d.byProductBreakdown?.chronoVaultRoyaltyUsd || 0);
          const nodeRoyaltyPhivo = Number(d.byProductBreakdown?.genesisNodeRoyaltyUsd || 0);
          setRoyaltiesOverview({
            personalActiveInvestmentUsd: Number(d.personalActiveInvestmentUsd || 0),
            unlockedGenerationsCount: Number(d.unlockedGenerationsCount || 0),
            directActiveSponsorsCount: Number(d.directActiveSponsorsCount || 0),
            usdtRoyaltiesTotal: tradingRoyalty + vaultRoyalty,
            phivoRoyaltiesTotal: nodeRoyaltyPhivo,
            activeNodesCount: Number(d.activeBreakdown?.activeNodesCount || 0),
          });
        }
      }

      if (rankRes.status === 'fulfilled' && rankRes.value.ok) {
        const json = await rankRes.value.json();
        const d = json?.data || json;
        if (d?.currentRank) {
          const qualifiedVol = Number(d.teamVolumeSummary?.nextRankQualifiedTeamVolumeUsd || 0);
          const requiredVol = Number(d.teamVolumeSummary?.nextRankRequiredTeamVolumeUsd || 0);
          const computedPct =
            d.nextTargetRank && requiredVol > 0
              ? Math.min(100, Math.round((qualifiedVol / requiredVol) * 100))
              : d.currentRank.rankLevel >= 6
              ? 100
              : 0;

          setRankOverview({
            currentRankLevel: Number(d.currentRank.rankLevel || 0),
            currentRankName: d.currentRank.rankName || 'Initiate Member',
            nextRankName: d.nextTargetRank?.rankName || null,
            progressPct: computedPct,
          });
        }
      }

      if (directsRes.status === 'fulfilled' && directsRes.value.ok) {
        const data = await directsRes.value.json();
        setDirectReferralsCount(Array.isArray(data.referrals) ? data.referrals.length : 0);
      }

      if (econRes.status === 'fulfilled' && econRes.value.ok) {
        const data = await econRes.value.json();
        if (typeof data.phivoPriceUsd === 'number' && data.phivoPriceUsd > 0) {
          setPhivoRate(data.phivoPriceUsd);
        }
      }
    } catch (err) {
      console.warn('[OverviewView] Sync notice:', err);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchDashboardData(false);
      }
    }, 60000);
    return () => clearInterval(interval);
  }, [fetchDashboardData]);

  useEffect(() => {
    if (typeof coinPriceUsdt === 'number' && coinPriceUsdt > 0) {
      setPhivoRate(coinPriceUsdt);
    }
  }, [coinPriceUsdt]);

  useEffect(() => {
    const handleUpdate = () => fetchDashboardData(false);
    window.addEventListener('phivonex:balance-or-tx-updated', handleUpdate);
    return () => window.removeEventListener('phivonex:balance-or-tx-updated', handleUpdate);
  }, [fetchDashboardData]);

  const rawReferralCode =
    referralData?.referralCode ||
    user?.referralCode ||
    (user?.publicId ? `PHX-${user.publicId.replace('PHX-', '')}` : 'PHX-MEMBER');
  const effectiveReferralUrl = buildPublicReferralUrl(rawReferralCode, referralData?.referralUrl);

  const firstName = useMemo(() => {
    if (!user?.fullName) return 'Member';
    return user.fullName.trim().split(/\s+/)[0] || 'Member';
  }, [user?.fullName]);

  const navigateTo = (tabKey: string) => {
    onNavigateTab?.(tabKey);
  };

  const availableUsdt = walletData?.availableBalance ?? walletData?.ledgerBalance ?? 0;
  const phivoBalance = walletData?.phivoBalance ?? 0;
  const effectiveRate = phivoRate || 0.1;

  const activePortfolioCapitalUsd =
    royaltiesOverview.personalActiveInvestmentUsd > 0
      ? royaltiesOverview.personalActiveInvestmentUsd
      : activeNodesCount * (nodeBasePriceUsd || 1000);

  const usdtEarnedFromWallet = walletData?.breakdown
    ? (walletData.breakdown.quantumAlpha || 0) +
      (walletData.breakdown.chronoVaults || 0) +
      (walletData.breakdown.unilevelRoyalty || 0) +
      (walletData.breakdown.promotion || 0) +
      (walletData.breakdown.referral || 0)
    : walletData?.totalEarned ?? 0;

  const phivoEarnedUsd = (totalMinedPhivo + royaltiesOverview.phivoRoyaltiesTotal) * effectiveRate;
  const totalAllTimeEarningsUsd = usdtEarnedFromWallet + phivoEarnedUsd;

  const totalDirectPartners = Math.max(
    directReferralsCount,
    royaltiesOverview.directActiveSponsorsCount
  );

  const formatUsd = (val: number) =>
    Number(val || 0).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  return (
    <div className="w-full max-w-full min-w-0 space-y-5 sm:space-y-6 animate-fadeIn">
      {/* Compact KYC Verification Banner (Shown only until Verified) */}
      {user?.kycStatus !== 'VERIFIED' && (
        <div
          className={`w-full min-w-0 p-3.5 sm:p-4 rounded-[24px] border flex flex-col sm:flex-row sm:items-center justify-between gap-3 backdrop-blur-xl ${
            user?.kycStatus === 'PENDING'
              ? 'bg-amber-950/25 border-[#F5B800]/30'
              : user?.kycStatus === 'REJECTED'
              ? 'bg-rose-950/25 border-[#F04438]/35'
              : 'bg-[rgba(14,21,19,0.78)] border-[#F5B800]/30'
          }`}
        >
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-2xl bg-[#F5B800]/15 border border-[#F5B800]/35 flex items-center justify-center shrink-0">
              {user?.kycStatus === 'PENDING' ? (
                <Clock className="w-4 h-4 text-[#F5B800]" />
              ) : user?.kycStatus === 'REJECTED' ? (
                <ShieldAlert className="w-4 h-4 text-[#F04438]" />
              ) : (
                <ShieldCheck className="w-4 h-4 text-[#F5B800]" />
              )}
            </div>
            <div className="min-w-0">
              <div className="text-xs sm:text-sm font-bold text-white leading-snug">
                {user?.kycStatus === 'PENDING'
                  ? 'Identity Verification Under Review'
                  : user?.kycStatus === 'REJECTED'
                  ? 'Identity Verification Requires Resubmission'
                  : 'Complete Level 1 Identity Verification'}
              </div>
              <p className="text-[11px] text-[#98A2B3] leading-relaxed mt-0.5">
                {user?.kycStatus === 'PENDING'
                  ? 'Your verification submission is being reviewed.'
                  : 'Unlock full BEP-20 withdrawal capacity and institutional member limits.'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsKycModalOpen(true)}
            className="min-h-[42px] px-4 py-2 rounded-2xl bg-[#F5B800] hover:brightness-105 text-[#050807] font-extrabold text-xs inline-flex items-center justify-center gap-1.5 shrink-0 cursor-pointer transition-all active:scale-95"
          >
            <span>{user?.kycStatus === 'PENDING' ? 'View Status' : 'Verify Now'}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 1. HERO: INTERACTIVE 3D HOLOGRAPHIC BALANCE FLIP CARD */}
      <Premium3DFlipCard
        user={user}
        displayName={firstName}
        availableUsdt={availableUsdt}
        phivoBalance={phivoBalance}
        phivoRate={effectiveRate}
        activePortfolioCapitalUsd={activePortfolioCapitalUsd}
        activeNodes={Math.max(activeNodesCount, royaltiesOverview.activeNodesCount)}
        currentRankLevel={rankOverview.currentRankLevel}
        currentRankName={rankOverview.currentRankName}
        unlockedGenerations={royaltiesOverview.unlockedGenerationsCount}
        directPartnersCount={totalDirectPartners}
        referralUrl={effectiveReferralUrl}
        onNavigateTab={navigateTo}
        onRefresh={() => fetchDashboardData(true)}
        isRefreshing={isRefreshing}
      />

      {/* 2. ADMIN-CONTROLLED ANIMATED PROMO & SUPPLY SPOTLIGHT CAROUSEL */}
      <OverviewPromoCarousel onNavigateTab={navigateTo} />

      {/* 3. COMPACT 4-CARD TELEMETRY GRID (2x2 ON 360px MOBILE, 4-COL ON DESKTOP) */}
      <section
        aria-label="Key Portfolio Telemetry"
        className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 w-full max-w-full min-w-0"
      >
        {/* Card 1: Total All-Time Earnings */}
        <div
          onClick={() => navigateTo('reward-analytics')}
          className="min-w-0 p-3.5 sm:p-5 rounded-[24px] oneui-glass-card hover:border-[#00E676]/40 transition-all cursor-pointer flex flex-col justify-between gap-2.5 group"
        >
          <div className="flex items-center justify-between gap-1.5">
            <span className="text-[11px] sm:text-xs font-semibold text-[#98A2B3] truncate">
              Total All-Time Earnings
            </span>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-[#00E676]/12 border border-[#00E676]/25 flex items-center justify-center text-[#00E676] shrink-0">
              <Activity className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
          </div>
          <div className="min-w-0">
            <div
              className="font-mono font-extrabold text-[#00E676] tabular-nums truncate leading-tight"
              style={{ fontSize: 'clamp(1.05rem, 3.8vw, 1.5rem)' }}
            >
              ${formatUsd(totalAllTimeEarningsUsd)}
            </div>
            <div className="text-[10px] sm:text-[11px] font-mono text-[#98A2B3] mt-1 truncate">
              USDT + PHIVO Value
            </div>
          </div>
        </div>

        {/* Card 2: 16-Gen Unilevel Royalties */}
        <div
          onClick={() => navigateTo('network')}
          className="min-w-0 p-3.5 sm:p-5 rounded-[24px] oneui-glass-card hover:border-[#00E5FF]/40 transition-all cursor-pointer flex flex-col justify-between gap-2.5 group"
        >
          <div className="flex items-center justify-between gap-1.5">
            <span className="text-[11px] sm:text-xs font-semibold text-[#98A2B3] truncate">
              16-Gen Royalties
            </span>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-[#00E5FF]/12 border border-[#00E5FF]/25 flex items-center justify-center text-[#00E5FF] shrink-0">
              <Layers className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
          </div>
          <div className="min-w-0">
            <div
              className="font-mono font-extrabold text-white tabular-nums truncate leading-tight"
              style={{ fontSize: 'clamp(1.05rem, 3.8vw, 1.5rem)' }}
            >
              ${formatUsd(royaltiesOverview.usdtRoyaltiesTotal)}
            </div>
            <div className="flex items-center justify-between gap-1 text-[10px] sm:text-[11px] font-mono mt-1">
              <span className="text-[#00E5FF] truncate">
                +{royaltiesOverview.phivoRoyaltiesTotal.toFixed(2)} PHIVO
              </span>
              <span className="text-[#98A2B3] shrink-0">
                {royaltiesOverview.unlockedGenerationsCount}/16
              </span>
            </div>
          </div>
        </div>

        {/* Card 3: Leadership Rank */}
        <div
          onClick={() => navigateTo('network')}
          className="min-w-0 p-3.5 sm:p-5 rounded-[24px] oneui-glass-card hover:border-[#F5B800]/40 transition-all cursor-pointer flex flex-col justify-between gap-2.5 group"
        >
          <div className="flex items-center justify-between gap-1.5">
            <span className="text-[11px] sm:text-xs font-semibold text-[#98A2B3] truncate">
              Leadership Rank
            </span>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-[#F5B800]/12 border border-[#F5B800]/25 flex items-center justify-center text-[#F5B800] shrink-0">
              <Trophy className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
          </div>
          <div className="min-w-0 space-y-1.5">
            <div className="text-xs sm:text-sm font-extrabold text-white truncate leading-tight">
              #{rankOverview.currentRankLevel} {rankOverview.currentRankName}
            </div>
            <div className="h-1.5 w-full rounded-full bg-white/[0.08] overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#F5B800] to-[#00E5FF] transition-all duration-500"
                style={{ width: `${Math.max(8, rankOverview.progressPct)}%` }}
              />
            </div>
            <div className="text-[10px] font-mono text-[#F5B800] truncate">
              {rankOverview.nextRankName
                ? `Next: ${rankOverview.nextRankName}`
                : 'Apex Sovereign Achieved'}
            </div>
          </div>
        </div>

        {/* Card 4: Direct Partners (Clean Institutional Copy — ZERO legacy $50 copy) */}
        <div
          onClick={() => navigateTo('network')}
          className="min-w-0 p-3.5 sm:p-5 rounded-[24px] oneui-glass-card hover:border-[#00E5FF]/40 transition-all cursor-pointer flex flex-col justify-between gap-2.5 group"
        >
          <div className="flex items-center justify-between gap-1.5">
            <span className="text-[11px] sm:text-xs font-semibold text-[#98A2B3] truncate">
              Direct Partners
            </span>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-[#00E5FF]/12 border border-[#00E5FF]/25 flex items-center justify-center text-[#00E5FF] shrink-0">
              <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
          </div>
          <div className="min-w-0">
            <div className="flex items-baseline gap-1.5">
              <span
                className="font-mono font-extrabold text-white tabular-nums leading-tight"
                style={{ fontSize: 'clamp(1.1rem, 3.8vw, 1.5rem)' }}
              >
                {totalDirectPartners}
              </span>
              <span className="text-[10px] sm:text-xs text-[#98A2B3] truncate">Active Gen-1</span>
            </div>
            <div className="text-[10px] sm:text-[11px] text-[#00E5FF] font-medium mt-1 truncate">
              16-Gen Unilevel Frontline
            </div>
          </div>
        </div>
      </section>

      {/* 4. ONE-TAP QUICK ACTIONS PILL STRIP */}
      <section
        aria-label="Quick Actions"
        className="w-full max-w-full min-w-0 p-3.5 sm:p-4 rounded-[24px] oneui-glass-card space-y-3"
      >
        <div className="flex items-center justify-between px-1">
          <h2 className="text-[11px] font-mono uppercase tracking-[0.16em] text-[#98A2B3] flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-[#00E5FF]" />
            <span>Quick Actions</span>
          </h2>
          <span className="text-[10px] font-mono text-[#00E5FF] tabular-nums">
            1 PHIVO = ${effectiveRate.toFixed(4)} USDT
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-2.5">
          <button
            type="button"
            onClick={() => navigateTo('deposit')}
            className="min-h-[48px] px-3 py-2.5 rounded-2xl bg-[#00E5FF]/12 hover:bg-[#00E5FF]/20 border border-[#00E5FF]/35 flex items-center gap-2.5 text-left transition-all cursor-pointer active:scale-95 min-w-0"
          >
            <div className="w-8 h-8 rounded-xl bg-[#00E5FF]/20 flex items-center justify-center text-[#00E5FF] shrink-0">
              <ArrowDownLeft className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <span className="text-xs font-bold text-white block truncate">Deposit</span>
              <span className="text-[10px] text-[#00E5FF] block truncate">USDT BEP-20</span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => navigateTo('wallet:transfer')}
            className="min-h-[48px] px-3 py-2.5 rounded-2xl bg-[#F5B800]/14 hover:bg-[#F5B800]/22 border border-[#F5B800]/40 flex items-center gap-2.5 text-left transition-all cursor-pointer active:scale-95 min-w-0"
          >
            <div className="w-8 h-8 rounded-xl bg-[#F5B800]/20 flex items-center justify-center text-[#F5B800] shrink-0">
              <Send className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <span className="text-xs font-bold text-white block truncate">Send / Transfer</span>
              <span className="text-[10px] text-[#F5B800] block truncate">Instant P2P</span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => navigateTo('products:alpha')}
            className="min-h-[48px] px-3 py-2.5 rounded-2xl bg-[#F5B800]/12 hover:bg-[#F5B800]/20 border border-[#F5B800]/35 flex items-center gap-2.5 text-left transition-all cursor-pointer active:scale-95 min-w-0"
          >
            <div className="w-8 h-8 rounded-xl bg-[#F5B800]/20 flex items-center justify-center text-[#F5B800] shrink-0">
              <Layers className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <span className="text-xs font-bold text-white block truncate">Ecosystem Hubs</span>
              <span className="text-[10px] text-[#F5B800] block truncate">3 Flagship Suites</span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => navigateTo('wallet')}
            className="min-h-[48px] px-3 py-2.5 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.09] flex items-center gap-2.5 text-left transition-all cursor-pointer active:scale-95 min-w-0"
          >
            <div className="w-8 h-8 rounded-xl bg-white/[0.07] flex items-center justify-center text-[#00E5FF] shrink-0">
              <Repeat className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <span className="text-xs font-bold text-white block truncate">Swap PHIVO</span>
              <span className="text-[10px] text-[#98A2B3] block truncate">Instant Liquidity</span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => navigateTo('withdrawals')}
            className="min-h-[48px] px-3 py-2.5 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.09] flex items-center gap-2.5 text-left transition-all cursor-pointer active:scale-95 min-w-0"
          >
            <div className="w-8 h-8 rounded-xl bg-white/[0.07] flex items-center justify-center text-[#D0D5DD] shrink-0">
              <ArrowUpRight className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <span className="text-xs font-bold text-white block truncate">Withdraw</span>
              <span className="text-[10px] text-[#98A2B3] block truncate">BEP-20 Payout</span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setShareModalOpen(true)}
            className="min-h-[48px] px-3 py-2.5 rounded-2xl bg-[#00E676]/10 hover:bg-[#00E676]/18 border border-[#00E676]/30 flex items-center gap-2.5 text-left transition-all cursor-pointer active:scale-95 min-w-0"
          >
            <div className="w-8 h-8 rounded-xl bg-[#00E676]/18 flex items-center justify-center text-[#00E676] shrink-0">
              <Share2 className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <span className="text-xs font-bold text-white block truncate">Invite &amp; Earn</span>
              <span className="text-[10px] text-[#00E676] block truncate">Partner QR &amp; Link</span>
            </div>
          </button>
        </div>
      </section>

      {/* 5. LIVE PHIVO REFERENCE RATE & 30-DAY EARNINGS TELEMETRY */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-5 w-full max-w-full min-w-0">
        <div className="min-w-0">
          <TokenPriceTrendChart onNavigateTab={onNavigateTab} compact={true} />
        </div>
        <div className="min-w-0">
          <RewardTrend30DaysChart onNavigateTab={onNavigateTab} />
        </div>
      </div>

      {/* 6. REAL-TIME ACTIVITY LOG */}
      <RecentActivityLog
        transactions={recentTransactions}
        onNavigateTab={navigateTo}
        onRefresh={() => fetchDashboardData(true)}
        isRefreshing={isRefreshing}
      />

      {/* Modals */}
      <ReferralShareModal
        isOpen={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        referralCode={rawReferralCode}
        referralUrl={effectiveReferralUrl}
      />

      <BinanceKYCModal
        isOpen={isKycModalOpen}
        onClose={() => setIsKycModalOpen(false)}
      />
    </div>
  );
};
