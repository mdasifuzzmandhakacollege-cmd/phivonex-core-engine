import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  User,
  Tag,
  Copy,
  Check,
  Share2,
  UserCheck,
  Clock,
  Server,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowRight,
  Repeat,
  Coins,
  Users,
  GitFork,
  ChevronRight,
  Activity,
  Trophy,
  Zap,
  ShieldCheck,
  ShieldAlert,
  QrCode,
} from 'lucide-react';
import { UserProfile } from '../../context/AuthContext';
import { buildPublicReferralUrl } from '../../utils/referralUrl';
import { ReferralShareModal } from '../modals/ReferralShareModal';
import { BinanceKYCModal } from '../modals/BinanceKYCModal';
import { PhivoCoinIcon, UsdtIcon } from '../brand/CryptoIcons';
import { TokenPriceTrendChart } from './TokenPriceTrendChart';
import { PromotionalBannerCarousel } from './PromotionalBannerCarousel';
import { ActiveOfferCards } from './ActiveOfferCards';
import { Premium3DFlipCard } from './Premium3DFlipCard';
import { useSystemConfig } from '../../context/SystemConfigContext';
import { getTransactionUserDescription } from '../../utils/transactionDisplay';

// TypeScript Interfaces for Authoritative Data
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
  grossBreakdown?: WalletBreakdown;
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

interface NodeSummaryData {
  totalNodes: number;
  activeNodes: number;
  totalRewardsPhivo: number;
  latestRewardEpoch?: string | null;
}

interface MatchingSummaryData {
  todayVolume: {
    left: number;
    right: number;
  };
  carry: {
    left: number;
    right: number;
  };
  totalMatchingEarnedUsd: number;
  nextSettlement?: {
    scheduledTime: string;
    nextSettlementIso: string;
  };
}

interface UserRankStatusData {
  currentRank: string;
  currentRankName: string;
  nextRank: string | null;
  nextRankName: string | null;
  stageProgress?: {
    matching?: {
      leftProgress: number;
      rightProgress: number;
      requiredLeft: number;
      requiredRight: number;
      progressPct: number;
    };
    leadership?: {
      progressPct: number;
      requiredLeaderRank?: string;
    };
  };
  rewardUsd?: number;
}

interface OverviewViewProps {
  user: UserProfile | null;
  onNavigateTab?: (tab: string) => void;
}

export const OverviewView: React.FC<OverviewViewProps> = ({ user, onNavigateTab }) => {
  const { coinPriceUsdt, nodeBasePriceUsd, directReferralCommissionRate, lastUpdated } = useSystemConfig();

  // 1. Data States
  const [referralData, setReferralData] = useState<ReferralMeResponse | null>(null);
  const [walletData, setWalletData] = useState<WalletSummary | null>(null);
  const [recentTransactions, setRecentTransactions] = useState<LedgerTransactionItem[]>([]);
  const [nodeData, setNodeData] = useState<NodeSummaryData | null>(null);
  const [matchingData, setMatchingData] = useState<MatchingSummaryData | null>(null);
  const [rankData, setRankData] = useState<UserRankStatusData | null>(null);
  const [directReferralsCount, setDirectReferralsCount] = useState<number>(0);
  const [phivoRate, setPhivoRate] = useState<number>(coinPriceUsdt || 0.1);

  // 2. UI & Interaction States
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [isKycModalOpen, setIsKycModalOpen] = useState(false);

  // Fetch all authoritative dashboard data in parallel
  const fetchDashboardData = useCallback(async (isManual = false) => {
    if (isManual) setIsRefreshing(true);

    try {
      const [
        refRes,
        walletRes,
        txRes,
        nodesRes,
        rewardsRes,
        matchingRes,
        rankRes,
        directsRes,
        econRes
      ] = await Promise.allSettled([
        fetch('/api/referrals/me', { credentials: 'include' }),
        fetch('/api/wallet/me', { credentials: 'include' }),
        fetch('/api/wallet/transactions?page=1&limit=5', { credentials: 'include' }),
        fetch('/api/nodes/me', { credentials: 'include' }),
        fetch('/api/rewards/me', { credentials: 'include' }),
        fetch('/api/matching/summary', { credentials: 'include' }),
        fetch('/api/promotions/ranks/me', { credentials: 'include' }),
        fetch('/api/referrals/direct', { credentials: 'include' }),
        fetch('/api/economic/public'),
      ]);

      // 1. Referral Me
      if (refRes.status === 'fulfilled' && refRes.value.ok) {
        const data = await refRes.value.json();
        setReferralData(data);
      }

      // 2. Wallet Me
      if (walletRes.status === 'fulfilled' && walletRes.value.ok) {
        const data = await walletRes.value.json();
        setWalletData(data);
      }

      // 3. Recent Transactions
      if (txRes.status === 'fulfilled' && txRes.value.ok) {
        const data = await txRes.value.json();
        setRecentTransactions(data.transactions || []);
      }

      // 4. Node Summary
      let totalNodesCount = 0;
      let activeNodesCount = 0;
      if (nodesRes.status === 'fulfilled' && nodesRes.value.ok) {
        const data = await nodesRes.value.json();
        const userNodes = data.nodes || [];
        totalNodesCount = userNodes.length;
        activeNodesCount = userNodes.filter((n: any) => n.status === 'ACTIVE').length;
      }

      let totalMiningRewards = 0;
      let latestEpoch = null;
      if (rewardsRes.status === 'fulfilled' && rewardsRes.value.ok) {
        const rData = await rewardsRes.value.json();
        totalMiningRewards = rData.totalAccrued || rData.totalRewards || 0;
        latestEpoch = rData.latestEpoch?.publicEpochId || null;
      }

      setNodeData({
        totalNodes: totalNodesCount,
        activeNodes: activeNodesCount,
        totalRewardsPhivo: totalMiningRewards,
        latestRewardEpoch: latestEpoch,
      });

      // 5. Binary Matching
      if (matchingRes.status === 'fulfilled' && matchingRes.value.ok) {
        const data = await matchingRes.value.json();
        setMatchingData(data);
      }

      // 6. Promotions / Rank
      if (rankRes.status === 'fulfilled' && rankRes.value.ok) {
        const data = await rankRes.value.json();
        setRankData(data.state || data);
      }

      // 7. Direct Referrals Count
      if (directsRes.status === 'fulfilled' && directsRes.value.ok) {
        const data = await directsRes.value.json();
        setDirectReferralsCount(Array.isArray(data.referrals) ? data.referrals.length : 0);
      }

      // 8. Economic Public (Rate)
      if (econRes.status === 'fulfilled' && econRes.value.ok) {
        const data = await econRes.value.json();
        if (typeof data.phivoPriceUsd === 'number') {
          setPhivoRate(data.phivoPriceUsd);
        }
      }
    } catch (err: any) {
      console.warn('[OverviewView] Data fetch warning:', err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
    // Auto refresh every 20 seconds
    const interval = setInterval(() => {
      fetchDashboardData(false);
    }, 20000);
    return () => clearInterval(interval);
  }, [fetchDashboardData]);

  // Synchronize PHIVO conversion rate live from system config
  useEffect(() => {
    if (typeof coinPriceUsdt === 'number' && coinPriceUsdt > 0) {
      setPhivoRate(coinPriceUsdt);
    }
  }, [coinPriceUsdt]);

  // Live refresh overview metrics on system config or promotional updates
  useEffect(() => {
    fetchDashboardData(false);
  }, [lastUpdated, fetchDashboardData]);

  // Live refresh on balance, transaction, or notification updates
  useEffect(() => {
    const handleUpdate = () => {
      fetchDashboardData(false);
    };
    window.addEventListener('phivonex:balance-or-tx-updated', handleUpdate);
    return () => window.removeEventListener('phivonex:balance-or-tx-updated', handleUpdate);
  }, [fetchDashboardData]);

  // Copy Handlers
  const rawReferralCode = referralData?.referralCode || user?.referralCode;
  const isReferralPending = !rawReferralCode || rawReferralCode === 'PHX-PENDING' || rawReferralCode.trim() === '';
  const displayReferralCode = isReferralPending ? 'Not Available Yet' : rawReferralCode;

  const handleCopyId = () => {
    const id = referralData?.publicId || user?.publicId;
    if (!id) return;
    navigator.clipboard.writeText(id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const effectiveReferralUrl = isReferralPending
    ? ''
    : buildPublicReferralUrl(rawReferralCode, referralData?.referralUrl);

  const handleCopyCode = () => {
    if (isReferralPending || !rawReferralCode) return;
    navigator.clipboard.writeText(rawReferralCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleCopyLink = () => {
    if (isReferralPending || !effectiveReferralUrl) return;
    navigator.clipboard.writeText(effectiveReferralUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  // Safe navigation helper
  const navigateTo = (tabKey: string) => {
    if (onNavigateTab) {
      onNavigateTab(tabKey);
    }
  };

  // Calculations & Formatters
  const firstName = useMemo(() => {
    if (!user?.fullName) return 'Member';
    const parts = user.fullName.trim().split(' ');
    return parts[0] || 'Member';
  }, [user?.fullName]);

  const availableUsdt = walletData?.availableBalance ?? walletData?.ledgerBalance ?? 0;
  const phivoBalance = walletData?.phivoBalance ?? 0;
  const phivoValueUsdt = phivoBalance * phivoRate;

  // Strict Total Earnings Reconciled Calculation:
  // ONLY genuinely earned income rewards (Referral + Matching + Promotion + Node Rewards).
  // Excludes Account Credit, deposits, swaps, and funding adjustments.
  const totalEarnedUsd = walletData?.breakdown
    ? ((walletData.breakdown.referral || 0) +
       (walletData.breakdown.matching || 0) +
       (walletData.breakdown.promotion || 0) +
       (walletData.breakdown.nodeReward || 0))
    : (walletData?.totalEarned ?? 0);

  const activeNodesCount = nodeData?.activeNodes ?? 0;
  const currentRankName = rankData?.currentRankName || 'Standard Member';
  const nextRankName = rankData?.nextRankName;

  // Dynamic direct referral reward per eligible node (based on node base price & commission rate)
  const directRewardPerNode = (nodeBasePriceUsd && directReferralCommissionRate)
    ? (nodeBasePriceUsd * (directReferralCommissionRate / 100))
    : 50;

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'Not Available';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return 'Not Available';
      return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return 'Not Available';
    }
  };

  const formatCurrency = (val: number, minimumFractionDigits = 2) => {
    return val.toLocaleString('en-US', {
      minimumFractionDigits,
      maximumFractionDigits: 2,
    });
  };

  return (
    <div className="space-y-6 sm:space-y-8 animate-fadeIn pb-12">
      {/* ========================================================
          0. BINANCE-GRADE KYC STATUS BANNER (REAL-TIME SYNC)
         ======================================================== */}
      {user?.kycStatus !== 'VERIFIED' && (
        <div className={`p-4 rounded-2xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg transition-all animate-fadeIn ${
          user?.kycStatus === 'PENDING'
            ? 'bg-amber-950/30 border-amber-500/30 text-amber-200'
            : user?.kycStatus === 'REJECTED'
            ? 'bg-rose-950/30 border-rose-500/30 text-rose-200'
            : 'bg-gradient-to-r from-amber-950/40 via-[#0A162B] to-[#07101E] border-amber-500/30 text-amber-100'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-2xl border flex items-center justify-center shrink-0 ${
              user?.kycStatus === 'PENDING'
                ? 'bg-amber-500/20 border-amber-500/30 text-amber-300 animate-pulse'
                : user?.kycStatus === 'REJECTED'
                ? 'bg-rose-500/20 border-rose-500/30 text-rose-300'
                : 'bg-amber-500/20 border-amber-400/30 text-amber-300'
            }`}>
              {user?.kycStatus === 'PENDING' ? (
                <Clock className="w-5 h-5 text-amber-400 animate-spin" />
              ) : user?.kycStatus === 'REJECTED' ? (
                <ShieldAlert className="w-5 h-5 text-rose-400" />
              ) : (
                <ShieldCheck className="w-5 h-5 text-amber-400" />
              )}
            </div>
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="text-xs sm:text-sm font-bold text-white font-mono">
                  {user?.kycStatus === 'PENDING'
                    ? 'Identity Verification Under Review'
                    : user?.kycStatus === 'REJECTED'
                    ? 'Identity Verification Attention Required'
                    : 'Level 1 Identity Verification (KYC)'}
                </span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                  user?.kycStatus === 'PENDING'
                    ? 'bg-amber-500/20 text-amber-300'
                    : user?.kycStatus === 'REJECTED'
                    ? 'bg-rose-500/20 text-rose-300'
                    : 'bg-amber-500/20 text-amber-300'
                }`}>
                  {user?.kycStatus || 'Action Required'}
                </span>
              </div>
              <p className="text-[11px] text-[#98A2B3]">
                {user?.kycStatus === 'PENDING'
                  ? 'Your identity documents and biometric facial scan are undergoing real-time review. Estimated completion: 2-10 mins.'
                  : user?.kycStatus === 'REJECTED'
                  ? `Previous submission note: "${user?.kycRejectReason || 'Please resubmit sharp document images'}". Click below to resubmit.`
                  : 'Unlock up to 100,000 USDT daily withdrawal capacity and unrestricted Genesis Node privileges.'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsKycModalOpen(true)}
            className={`px-4 py-2 rounded-xl font-bold text-xs font-mono shrink-0 flex items-center gap-1.5 transition-all shadow-md cursor-pointer ${
              user?.kycStatus === 'PENDING'
                ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40'
                : user?.kycStatus === 'REJECTED'
                ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/30'
                : 'bg-amber-400 hover:bg-amber-300 text-black shadow-amber-400/20'
            }`}
          >
            <span>{user?.kycStatus === 'PENDING' ? 'View Review Status' : user?.kycStatus === 'REJECTED' ? 'Resubmit Documents' : 'Verify Identity Now'}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ========================================================
          0. DYNAMIC PROMOTIONAL & PROTOCOL NOTICES
         ======================================================== */}
      <PromotionalBannerCarousel onNavigateTab={navigateTo} />
      <ActiveOfferCards onNavigateTab={navigateTo} />

      {/* ========================================================
          1. PREMIUM 3D FLIP OVERVIEW HERO CARD (UNTOUCHED)
         ======================================================== */}
      <Premium3DFlipCard
        user={user}
        displayName={firstName}
        availableUsdt={availableUsdt}
        activeNodes={activeNodesCount}
        currentRankName={currentRankName}
        networkStatus="Synchronized"
        onNavigateTab={navigateTo}
        onRefresh={() => fetchDashboardData(true)}
        isRefreshing={isRefreshing}
      />

      {/* ========================================================
          2. PRIMARY METRICS GRID (6 Coherent Cards)
         ======================================================== */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
        {/* Metric 1: Available USDT */}
        <div
          onClick={() => navigateTo('wallet')}
          className="p-4 sm:p-5 rounded-2xl bg-[#07101D] border border-white/[0.08] hover:border-[#00CFFF]/40 transition-all duration-200 shadow-lg cursor-pointer group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between text-xs text-[#98A2B3] mb-2">
            <span className="font-medium text-xs">USDT Balance</span>
            <div className="w-7 h-7 rounded-lg bg-[#00CFFF]/10 border border-[#00CFFF]/20 flex items-center justify-center text-[#00CFFF] group-hover:scale-110 transition-transform">
              <UsdtIcon size={16} />
            </div>
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-mono font-bold text-white tabular-nums">
              ${formatCurrency(availableUsdt)}
            </div>
            <div className="flex items-center gap-1 text-[11px] text-[#00CFFF] mt-1 font-medium group-hover:translate-x-0.5 transition-transform">
              <span>Deposit / Manage</span>
              <ArrowRight className="w-3 h-3" />
            </div>
          </div>
        </div>

        {/* Metric 2: PHIVO Balance */}
        <div
          onClick={() => navigateTo('swap')}
          className="p-4 sm:p-5 rounded-2xl bg-[#07101D] border border-white/[0.08] hover:border-[#00CFFF]/40 transition-all duration-200 shadow-lg cursor-pointer group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between text-xs text-[#98A2B3] mb-2">
            <span className="font-medium text-xs">PHIVO Balance</span>
            <div className="w-7 h-7 rounded-lg bg-[#00CFFF]/10 border border-[#00CFFF]/20 flex items-center justify-center text-[#00CFFF] group-hover:scale-110 transition-transform">
              <PhivoCoinIcon size={16} />
            </div>
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-mono font-bold text-[#00CFFF] tabular-nums">
              {formatCurrency(phivoBalance)}
            </div>
            <div className="text-[11px] text-[#98A2B3] mt-1 font-mono">
              ≈ ${formatCurrency(phivoValueUsdt)} USDT
            </div>
          </div>
        </div>

        {/* Metric 3: Active Nodes */}
        <div
          onClick={() => navigateTo('nodes')}
          className="p-4 sm:p-5 rounded-2xl bg-[#07101D] border border-white/[0.08] hover:border-[#32D583]/40 transition-all duration-200 shadow-lg cursor-pointer group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between text-xs text-[#98A2B3] mb-2">
            <span className="font-medium text-xs">Active Nodes</span>
            <div className="w-7 h-7 rounded-lg bg-[#32D583]/10 border border-[#32D583]/20 flex items-center justify-center text-[#32D583] group-hover:scale-110 transition-transform">
              <Server className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-mono font-bold text-white tabular-nums flex items-baseline gap-1.5">
              <span>{activeNodesCount}</span>
              <span className="text-xs font-normal text-[#98A2B3]">Nodes</span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-[#32D583] mt-1 font-medium">
              <span className={`w-1.5 h-1.5 rounded-full ${activeNodesCount > 0 ? 'bg-[#32D583] animate-pulse' : 'bg-[#98A2B3]'}`} />
              <span>{activeNodesCount > 0 ? 'Mining Active' : 'Ready to activate'}</span>
            </div>
          </div>
        </div>

        {/* Metric 4: Current Rank */}
        <div
          onClick={() => navigateTo('rewards')}
          className="p-4 sm:p-5 rounded-2xl bg-[#07101D] border border-white/[0.08] hover:border-[#F59E0B]/40 transition-all duration-200 shadow-lg cursor-pointer group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between text-xs text-[#98A2B3] mb-2">
            <span className="font-medium text-xs">Current Rank</span>
            <div className="w-7 h-7 rounded-lg bg-[#F59E0B]/10 border border-[#F59E0B]/20 flex items-center justify-center text-[#F59E0B] group-hover:scale-110 transition-transform">
              <Trophy className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-base sm:text-lg font-bold text-white truncate">
              {currentRankName}
            </div>
            <div className="text-[11px] text-[#F59E0B] mt-1 font-medium truncate">
              {nextRankName ? `Next: ${nextRankName}` : (currentRankName === 'Crown Ambassador' ? 'Highest Tier' : 'Tier In Progress')}
            </div>
          </div>
        </div>

        {/* Metric 5: Total Earnings (Strictly Reconciled Rewards) */}
        <div
          onClick={() => navigateTo('wallet')}
          className="p-4 sm:p-5 rounded-2xl bg-[#07101D] border border-white/[0.08] hover:border-[#32D583]/40 transition-all duration-200 shadow-lg cursor-pointer group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between text-xs text-[#98A2B3] mb-2">
            <span className="font-medium text-xs">Total Earnings</span>
            <div className="w-7 h-7 rounded-lg bg-[#32D583]/10 border border-[#32D583]/20 flex items-center justify-center text-[#32D583] group-hover:scale-110 transition-transform">
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-mono font-bold text-[#32D583] tabular-nums">
              ${formatCurrency(totalEarnedUsd)}
            </div>
            <div className="text-[11px] text-[#98A2B3] mt-1 truncate">
              Protocol rewards earned
            </div>
          </div>
        </div>

        {/* Metric 6: Direct Referrals */}
        <div
          onClick={() => navigateTo('referrals')}
          className="p-4 sm:p-5 rounded-2xl bg-[#07101D] border border-white/[0.08] hover:border-[#168BFF]/40 transition-all duration-200 shadow-lg cursor-pointer group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between text-xs text-[#98A2B3] mb-2">
            <span className="font-medium text-xs">Direct Referrals</span>
            <div className="w-7 h-7 rounded-lg bg-[#168BFF]/10 border border-[#168BFF]/20 flex items-center justify-center text-[#168BFF] group-hover:scale-110 transition-transform">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-mono font-bold text-white tabular-nums flex items-baseline gap-1.5">
              <span>{directReferralsCount}</span>
              <span className="text-xs font-normal text-[#98A2B3]">Members</span>
            </div>
            <div className="text-[11px] text-[#168BFF] mt-1 font-medium truncate">
              ${directRewardPerNode} per eligible node
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================
          3. QUICK ACTIONS (Consistent Button Hierarchy)
         ======================================================== */}
      <div className="p-4 sm:p-5 rounded-2xl bg-[#07101D] border border-white/[0.08] shadow-lg space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[#98A2B3] flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5 text-[#00CFFF]" />
          <span>Quick Actions</span>
        </h2>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {/* Action 1: Deposit USDT (Primary) */}
          <button
            onClick={() => navigateTo('deposit')}
            className="p-3.5 rounded-xl bg-[#00CFFF]/10 hover:bg-[#00CFFF]/20 border border-[#00CFFF]/30 hover:border-[#00CFFF]/60 transition-all duration-150 flex items-center gap-3 text-left cursor-pointer min-h-[52px] group"
          >
            <div className="w-8 h-8 rounded-lg bg-[#00CFFF]/20 flex items-center justify-center text-[#00CFFF] shrink-0 group-hover:scale-105 transition-transform">
              <ArrowDownLeft className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <span className="text-xs font-bold text-white block truncate">Deposit USDT</span>
              <span className="text-[10px] text-[#00CFFF] block truncate">BEP-20 Network</span>
            </div>
          </button>

          {/* Action 2: Activate Node (Primary) */}
          <button
            onClick={() => navigateTo('nodes')}
            className="p-3.5 rounded-xl bg-[#32D583]/10 hover:bg-[#32D583]/20 border border-[#32D583]/30 hover:border-[#32D583]/60 transition-all duration-150 flex items-center gap-3 text-left cursor-pointer min-h-[52px] group"
          >
            <div className="w-8 h-8 rounded-lg bg-[#32D583]/20 flex items-center justify-center text-[#32D583] shrink-0 group-hover:scale-105 transition-transform">
              <Server className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <span className="text-xs font-bold text-white block truncate">Activate Node</span>
              <span className="text-[10px] text-[#32D583] block truncate">${nodeBasePriceUsd || 1000} Genesis</span>
            </div>
          </button>

          {/* Action 3: Swap PHIVO (Secondary) */}
          <button
            onClick={() => navigateTo('swap')}
            className="p-3.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.08] hover:border-[#00CFFF]/30 transition-all duration-150 flex items-center gap-3 text-left cursor-pointer min-h-[52px] group"
          >
            <div className="w-8 h-8 rounded-lg bg-white/[0.05] flex items-center justify-center text-[#98A2B3] group-hover:text-[#00CFFF] shrink-0 transition-colors">
              <Repeat className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <span className="text-xs font-bold text-white block truncate">Swap PHIVO</span>
              <span className="text-[10px] text-[#98A2B3] block truncate">Protocol Liquidity</span>
            </div>
          </button>

          {/* Action 4: Withdraw (Secondary) */}
          <button
            onClick={() => navigateTo('withdrawals')}
            className="p-3.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.08] hover:border-white/[0.15] transition-all duration-150 flex items-center gap-3 text-left cursor-pointer min-h-[52px] group"
          >
            <div className="w-8 h-8 rounded-lg bg-white/[0.05] flex items-center justify-center text-[#98A2B3] shrink-0">
              <ArrowUpRight className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <span className="text-xs font-bold text-white block truncate">Withdraw</span>
              <span className="text-[10px] text-[#98A2B3] block truncate">External Wallet</span>
            </div>
          </button>

          {/* Action 5: Invite & Earn (Secondary) */}
          <button
            onClick={() => navigateTo('referrals')}
            className="col-span-2 sm:col-span-1 p-3.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.08] hover:border-[#168BFF]/30 transition-all duration-150 flex items-center gap-3 text-left cursor-pointer min-h-[52px] group"
          >
            <div className="w-8 h-8 rounded-lg bg-white/[0.05] flex items-center justify-center text-[#168BFF] shrink-0">
              <Share2 className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <span className="text-xs font-bold text-white block truncate">Invite &amp; Earn</span>
              <span className="text-[10px] text-[#98A2B3] block truncate">Referral Link</span>
            </div>
          </button>
        </div>
      </div>

      {/* ========================================================
          4. PHIVO REFERENCE RATE (Institutional Utility Card)
         ======================================================== */}
      <TokenPriceTrendChart onNavigateTab={onNavigateTab} compact={false} />

      {/* ========================================================
          5. CORE PERFORMANCE GRID (Nodes & Binary Network)
         ======================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Genesis Node Summary */}
        <div className="p-5 sm:p-6 rounded-2xl bg-[#07101D] border border-white/[0.08] shadow-xl flex flex-col justify-between space-y-5">
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-[#32D583]/10 border border-[#32D583]/20 flex items-center justify-center text-[#32D583]">
                  <Server className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-white">Genesis Node Summary</h3>
              </div>

              {/* Truthful Node Status Badge */}
              {activeNodesCount > 0 ? (
                <span className="text-[11px] font-medium text-[#32D583] bg-[#32D583]/10 border border-[#32D583]/25 px-2.5 py-0.5 rounded-full flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#32D583] animate-pulse" />
                  <span>Mining Active ({activeNodesCount})</span>
                </span>
              ) : (
                <span className="text-[11px] font-medium text-[#98A2B3] bg-white/[0.04] border border-white/[0.08] px-2.5 py-0.5 rounded-full flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#98A2B3]" />
                  <span>Ready to Activate</span>
                </span>
              )}
            </div>

            <p className="text-xs text-[#98A2B3] leading-relaxed">
              Your active Genesis Nodes validate protocol consensus and generate daily PHIVO mining rewards through the halving schedule.
            </p>

            <div className="grid grid-cols-3 gap-3 pt-1">
              <div className="p-3 rounded-xl bg-[#050B14]/80 border border-white/[0.05]">
                <span className="text-[10px] text-[#98A2B3] uppercase tracking-wider font-medium block">Active</span>
                <span className="text-lg font-bold font-mono text-white mt-0.5 block tabular-nums">
                  {nodeData?.activeNodes ?? 0}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-[#050B14]/80 border border-white/[0.05]">
                <span className="text-[10px] text-[#98A2B3] uppercase tracking-wider font-medium block">Total Owned</span>
                <span className="text-lg font-bold font-mono text-white mt-0.5 block tabular-nums">
                  {nodeData?.totalNodes ?? 0}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-[#050B14]/80 border border-white/[0.05]">
                <span className="text-[10px] text-[#98A2B3] uppercase tracking-wider font-medium block">Mined PHIVO</span>
                <span className="text-lg font-bold font-mono text-[#00CFFF] mt-0.5 block tabular-nums truncate">
                  {formatCurrency(nodeData?.totalRewardsPhivo ?? 0)}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={() => navigateTo('nodes')}
              className="flex-1 py-2.5 px-4 rounded-xl bg-[#00CFFF] hover:bg-[#00CFFF]/90 text-[#05070B] text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer min-h-[42px] shadow-md shadow-[#00CFFF]/15"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Activate Node</span>
            </button>
            <button
              onClick={() => navigateTo('nodes')}
              className="py-2.5 px-4 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-white text-xs font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer min-h-[42px]"
            >
              <span>Manage Nodes</span>
              <ChevronRight className="w-3.5 h-3.5 text-[#98A2B3]" />
            </button>
          </div>
        </div>

        {/* Right: Binary Network Progress */}
        <div className="p-5 sm:p-6 rounded-2xl bg-[#07101D] border border-white/[0.08] shadow-xl flex flex-col justify-between space-y-5">
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-[#00CFFF]/10 border border-[#00CFFF]/20 flex items-center justify-center text-[#00CFFF]">
                  <GitFork className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-white">Binary Network Progress</h3>
              </div>
              <span className="text-[11px] font-mono text-[#98A2B3] bg-white/[0.04] px-2 py-0.5 rounded-md flex items-center gap-1">
                <Clock className="w-3 h-3 text-[#00CFFF]" />
                <span>Daily 18:00 UTC</span>
              </span>
            </div>

            <p className="text-xs text-[#98A2B3] leading-relaxed">
              Paired sales volume between Left and Right team legs settles daily. Remaining units carry forward to the next cycle.
            </p>

            {/* Symmetrical Left / Right Modules */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              {/* Left Leg */}
              <div className="p-3.5 rounded-xl bg-[#050B14]/80 border border-white/[0.05] space-y-1">
                <div className="flex items-center justify-between text-xs text-[#98A2B3]">
                  <span className="font-semibold text-[#00CFFF]">LEFT LEG</span>
                  <span className="text-[10px] font-mono">Today / Carry</span>
                </div>
                <div className="flex items-baseline gap-2 pt-1">
                  <span className="text-xl font-mono font-bold text-white tabular-nums">
                    {matchingData?.todayVolume?.left ?? 0}
                  </span>
                  <span className="text-xs font-mono text-[#98A2B3] tabular-nums">
                    (+{matchingData?.carry?.left ?? 0} carry)
                  </span>
                </div>
              </div>

              {/* Right Leg */}
              <div className="p-3.5 rounded-xl bg-[#050B14]/80 border border-white/[0.05] space-y-1">
                <div className="flex items-center justify-between text-xs text-[#98A2B3]">
                  <span className="font-semibold text-[#32D583]">RIGHT LEG</span>
                  <span className="text-[10px] font-mono">Today / Carry</span>
                </div>
                <div className="flex items-baseline gap-2 pt-1">
                  <span className="text-xl font-mono font-bold text-white tabular-nums">
                    {matchingData?.todayVolume?.right ?? 0}
                  </span>
                  <span className="text-xs font-mono text-[#98A2B3] tabular-nums">
                    (+{matchingData?.carry?.right ?? 0} carry)
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-white/[0.06]">
            <div>
              <span className="text-[10px] text-[#98A2B3] block uppercase tracking-wider font-medium">Matching Rewards</span>
              <span className="text-base font-bold font-mono text-[#32D583] tabular-nums">
                ${formatCurrency(matchingData?.totalMatchingEarnedUsd ?? walletData?.breakdown?.matching ?? 0)}
              </span>
            </div>
            <button
              onClick={() => navigateTo('network')}
              className="py-2 px-3.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer min-h-[40px]"
            >
              <span>View Network Tree</span>
              <ArrowRight className="w-3.5 h-3.5 text-[#00CFFF]" />
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================
          6. LEADERSHIP & PROMOTION PROGRESS
         ======================================================== */}
      <div className="p-5 sm:p-6 rounded-2xl bg-[#07101D] border border-white/[0.08] shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/[0.06] pb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#F59E0B]/10 border border-[#F59E0B]/20 flex items-center justify-center text-[#F59E0B]">
              <Trophy className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Leadership &amp; Promotion Progress</h3>
              <p className="text-[11px] text-[#98A2B3]">Track your sequential rank advancement through the PHIVONEX career ladder.</p>
            </div>
          </div>
          <button
            onClick={() => navigateTo('rewards')}
            className="text-xs text-[#00CFFF] hover:text-white font-medium flex items-center gap-1 self-start sm:self-auto cursor-pointer transition-colors"
          >
            <span>View Rank Ladder</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
          {/* Current vs Next Badge */}
          <div className="p-4 rounded-xl bg-[#050B14]/80 border border-white/[0.05] space-y-2">
            <span className="text-[10px] text-[#98A2B3] uppercase tracking-wider font-medium block">Career Rank</span>
            <div className="flex items-center gap-2">
              <span className="text-base font-bold text-white">{currentRankName}</span>
              {nextRankName && (
                <>
                  <ArrowRight className="w-4 h-4 text-[#F59E0B]" />
                  <span className="text-sm font-bold text-[#F59E0B]">{nextRankName}</span>
                </>
              )}
            </div>
            <span className="text-[11px] text-[#98A2B3] block">
              {rankData?.rewardUsd ? `Milestone Reward: $${formatCurrency(rankData.rewardUsd)}` : 'Active Network Participation'}
            </span>
          </div>

          {/* Matching Leg Progress Bars */}
          <div className="md:col-span-2 p-4 rounded-xl bg-[#050B14]/80 border border-white/[0.05] space-y-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-[#98A2B3] font-sans">Left Team Requirement:</span>
                <span className="text-white font-bold tabular-nums">
                  {rankData?.stageProgress?.matching?.leftProgress ?? 0} / {rankData?.stageProgress?.matching?.requiredLeft ?? 20}
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-white/[0.06] overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#00CFFF] to-[#168BFF] rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(
                      100,
                      ((rankData?.stageProgress?.matching?.leftProgress ?? 0) /
                        (rankData?.stageProgress?.matching?.requiredLeft || 20)) *
                        100
                    )}%`,
                  }}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-[#98A2B3] font-sans">Right Team Requirement:</span>
                <span className="text-white font-bold tabular-nums">
                  {rankData?.stageProgress?.matching?.rightProgress ?? 0} / {rankData?.stageProgress?.matching?.requiredRight ?? 20}
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-white/[0.06] overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#32D583] to-[#12B76A] rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(
                      100,
                      ((rankData?.stageProgress?.matching?.rightProgress ?? 0) /
                        (rankData?.stageProgress?.matching?.requiredRight || 20)) *
                        100
                    )}%`,
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================
          7. REFERRAL SECTION (Clean Read-Only Copy Modules)
         ======================================================== */}
      <div className="p-5 sm:p-6 rounded-2xl bg-[#07101D] border border-white/[0.08] shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/[0.06] pb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#00CFFF]/10 border border-[#00CFFF]/20 flex items-center justify-center text-[#00CFFF]">
              <Tag className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Your Referral Link &amp; Code</h3>
              <p className="text-[11px] text-[#98A2B3]">Current direct reward: ${directRewardPerNode} per eligible activated node.</p>
            </div>
          </div>
          <button
            onClick={() => navigateTo('referrals')}
            className="text-xs text-[#00CFFF] hover:text-white font-medium flex items-center gap-1 self-start sm:self-auto cursor-pointer transition-colors"
          >
            <span>View All Referrals ({directReferralsCount})</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Referral Code Box */}
          <div className="p-3.5 rounded-xl bg-[#050B14]/80 border border-white/[0.05] space-y-2 flex flex-col justify-between">
            <div>
              <span className="text-[10px] text-[#98A2B3] uppercase tracking-wider font-medium block">Referral Code</span>
              <span className={`text-xl font-mono font-bold mt-1 block tracking-wider ${isReferralPending ? 'text-[#98A2B3] text-sm' : 'text-[#00CFFF]'}`}>
                {displayReferralCode}
              </span>
            </div>
            <button
              onClick={handleCopyCode}
              disabled={isReferralPending}
              className={`w-full py-2 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors min-h-[38px] ${
                isReferralPending
                  ? 'bg-white/[0.02] border-white/[0.04] text-[#667085] cursor-not-allowed'
                  : 'bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.08] text-white cursor-pointer'
              }`}
            >
              {copiedCode ? <Check className="w-3.5 h-3.5 text-[#32D583]" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedCode ? 'Copied' : 'Copy Code'}</span>
            </button>
          </div>

          {/* Referral Link & 1-Click Share */}
          <div className="md:col-span-2 p-3.5 rounded-xl bg-[#050B14]/80 border border-white/[0.05] space-y-2 flex flex-col justify-between">
            <div>
              <span className="text-[10px] text-[#98A2B3] uppercase tracking-wider font-medium block">Registration Link</span>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mt-1">
                <input
                  type="text"
                  readOnly
                  value={isReferralPending ? 'Referral link generating...' : effectiveReferralUrl}
                  className="flex-1 bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-2 text-xs font-mono text-white select-all focus:outline-none min-h-[38px]"
                />
                <button
                  onClick={handleCopyLink}
                  disabled={isReferralPending}
                  className={`px-3 py-2 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition-all shrink-0 min-h-[38px] ${
                    isReferralPending
                      ? 'bg-white/[0.04] border border-white/[0.08] text-[#667085] cursor-not-allowed'
                      : 'bg-white/[0.08] hover:bg-white/[0.15] text-white border border-white/[0.1] cursor-pointer'
                  }`}
                >
                  {copiedLink ? <Check className="w-3.5 h-3.5 text-[#32D583]" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedLink ? 'Copied' : 'Copy'}</span>
                </button>
                <button
                  onClick={() => setShareModalOpen(true)}
                  disabled={isReferralPending}
                  className={`px-3.5 py-2 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition-all shrink-0 min-h-[38px] shadow-[0_0_20px_rgba(0,207,255,0.25)] ${
                    isReferralPending
                      ? 'bg-white/[0.04] border border-white/[0.08] text-[#667085] cursor-not-allowed'
                      : 'bg-[#00CFFF] hover:bg-[#00CFFF]/90 text-[#05070B] cursor-pointer'
                  }`}
                  title="Open QR Code & Social Share"
                >
                  <QrCode className="w-3.5 h-3.5" />
                  <Share2 className="w-3.5 h-3.5" />
                  <span>Share & QR</span>
                </button>
              </div>
            </div>

            {/* Sponsor attribution */}
            <div className="flex items-center gap-2 text-[11px] text-[#98A2B3] pt-1 border-t border-white/[0.04]">
              <UserCheck className="w-3.5 h-3.5 text-[#32D583]" />
              <span>
                {referralData?.sponsor ? (
                  <>Sponsor: <strong className="text-white font-medium">{referralData.sponsor.displayName}</strong> ({referralData.sponsor.publicId})</>
                ) : (
                  <>Direct Genesis Account (No intermediate sponsor)</>
                )}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================
          8. WALLET & EARNINGS BREAKDOWN (Reconciled Financial Summary)
         ======================================================== */}
      <div className="p-5 sm:p-6 rounded-2xl bg-[#07101D] border border-white/[0.08] shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#00CFFF]/10 border border-[#00CFFF]/20 flex items-center justify-center text-[#00CFFF]">
              <Coins className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Wallet &amp; Earnings Breakdown</h3>
              <p className="text-[11px] text-[#98A2B3]">Reconciled summary of your multi-stream earnings.</p>
            </div>
          </div>
          <button
            onClick={() => navigateTo('wallet')}
            className="text-xs text-[#00CFFF] hover:text-white font-medium flex items-center gap-1 cursor-pointer transition-colors"
          >
            <span>Open Wallet</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* Direct Referral Bonus */}
          <div className="p-3.5 rounded-xl bg-[#050B14]/80 border border-white/[0.05] space-y-1">
            <span className="text-[10px] text-[#98A2B3] uppercase tracking-wider font-medium block">Direct Referrals</span>
            <span className="text-base sm:text-lg font-mono font-bold text-white tabular-nums block">
              ${formatCurrency(walletData?.breakdown?.referral ?? 0)}
            </span>
            <span className="text-[10px] text-[#98A2B3] block">Direct sponsorship</span>
          </div>

          {/* Daily Matching Bonus */}
          <div className="p-3.5 rounded-xl bg-[#050B14]/80 border border-white/[0.05] space-y-1">
            <span className="text-[10px] text-[#98A2B3] uppercase tracking-wider font-medium block">Binary Matching</span>
            <span className="text-base sm:text-lg font-mono font-bold text-[#32D583] tabular-nums block">
              ${formatCurrency(walletData?.breakdown?.matching ?? 0)}
            </span>
            <span className="text-[10px] text-[#98A2B3] block">Paired volume settlements</span>
          </div>

          {/* Promotion Milestones */}
          <div className="p-3.5 rounded-xl bg-[#050B14]/80 border border-white/[0.05] space-y-1">
            <span className="text-[10px] text-[#98A2B3] uppercase tracking-wider font-medium block">Promotion Rewards</span>
            <span className="text-base sm:text-lg font-mono font-bold text-[#F59E0B] tabular-nums block">
              ${formatCurrency(walletData?.breakdown?.promotion ?? 0)}
            </span>
            <span className="text-[10px] text-[#98A2B3] block">Rank milestones</span>
          </div>

          {/* Node Rewards */}
          <div className="p-3.5 rounded-xl bg-[#050B14]/80 border border-white/[0.05] space-y-1">
            <span className="text-[10px] text-[#98A2B3] uppercase tracking-wider font-medium block">Node Mining</span>
            <span className="text-base sm:text-lg font-mono font-bold text-[#00CFFF] tabular-nums block">
              {formatCurrency(nodeData?.totalRewardsPhivo ?? 0)} <span className="text-xs">PHIVO</span>
            </span>
            <span className="text-[10px] text-[#98A2B3] block">Genesis validator rewards</span>
          </div>
        </div>
      </div>

      {/* ========================================================
          9. RECENT ACCOUNT ACTIVITY (4-5 Latest Events)
         ======================================================== */}
      <div className="p-5 sm:p-6 rounded-2xl bg-[#07101D] border border-white/[0.08] shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-white">
              <Activity className="w-4 h-4 text-[#00CFFF]" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Recent Account Activity</h3>
              <p className="text-[11px] text-[#98A2B3]">Latest settled transactions and network rewards.</p>
            </div>
          </div>
          <button
            onClick={() => navigateTo('wallet')}
            className="text-xs text-[#00CFFF] hover:text-white font-medium flex items-center gap-1 cursor-pointer transition-colors"
          >
            <span>View All Transactions</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {recentTransactions.length === 0 ? (
          <div className="py-8 text-center space-y-2">
            <div className="w-10 h-10 rounded-full bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mx-auto text-[#98A2B3]">
              <Clock className="w-5 h-5" />
            </div>
            <p className="text-xs text-[#98A2B3]">No transactions recorded yet.</p>
            <p className="text-[11px] text-[#667085]">Activate a node or make a deposit to start earning rewards.</p>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.04] overflow-hidden">
            {recentTransactions.slice(0, 5).map((tx) => {
              const isCredit = tx.entryType === 'CREDIT';
              return (
                <div key={tx.id} className="py-3 flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${
                        isCredit
                          ? 'bg-[#32D583]/10 border-[#32D583]/20 text-[#32D583]'
                          : 'bg-[#F04438]/10 border-[#F04438]/20 text-[#F04438]'
                      }`}
                    >
                      {isCredit ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                    </div>
                    <div className="min-w-0">
                      <span className="text-xs font-semibold text-white block truncate">
                        {getTransactionUserDescription(tx)}
                      </span>
                      <span className="text-[10px] text-[#98A2B3] font-mono block">
                        {formatDate(tx.createdAt)}
                      </span>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span
                      className={`text-xs font-mono font-bold block tabular-nums ${
                        isCredit ? 'text-[#32D583]' : 'text-white'
                      }`}
                    >
                      {isCredit ? '+' : '-'}${formatCurrency(tx.amount)} {tx.currency}
                    </span>
                    <span className="text-[10px] font-mono text-[#32D583] inline-flex items-center gap-1">
                      <span className="w-1 h-1 rounded-full bg-[#32D583]" />
                      <span>{tx.status}</span>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ========================================================
          10. ACCOUNT PROFILE SNAPSHOT (Compact Clean Footer)
         ======================================================== */}
      <div className="p-5 sm:p-6 rounded-2xl bg-[#07101D] border border-white/[0.08] shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-[#98A2B3]">
              <User className="w-4 h-4 text-[#00CFFF]" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Account Profile Snapshot</h3>
              <p className="text-[11px] text-[#98A2B3]">Verified account attributes and registry identifier.</p>
            </div>
          </div>
          <button
            onClick={() => navigateTo('profile')}
            className="text-xs text-[#00CFFF] hover:text-white font-medium flex items-center gap-1 cursor-pointer transition-colors"
          >
            <span>View Full Profile</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          {/* Public PHIVONEX ID */}
          <div className="p-3.5 rounded-xl bg-[#050B14]/80 border border-white/[0.05] space-y-1">
            <span className="text-[10px] text-[#98A2B3] uppercase tracking-wider font-medium block">PHIVONEX ID</span>
            <div className="flex items-center justify-between">
              <span className="text-xs sm:text-sm font-mono font-bold text-[#00CFFF] truncate">
                {referralData?.publicId || user?.publicId || 'PHX-PENDING'}
              </span>
              <button
                onClick={handleCopyId}
                className="p-1 text-[#98A2B3] hover:text-white transition-colors cursor-pointer"
                title="Copy ID"
                aria-label="Copy PHIVONEX ID"
              >
                {copiedId ? <Check className="w-3.5 h-3.5 text-[#32D583]" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Account Status */}
          <div className="p-3.5 rounded-xl bg-[#050B14]/80 border border-white/[0.05] space-y-1">
            <span className="text-[10px] text-[#98A2B3] uppercase tracking-wider font-medium block">Status</span>
            <span className="text-xs sm:text-sm font-bold text-[#32D583] flex items-center gap-1.5 pt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#32D583]" />
              <span>{user?.status ? user.status.toUpperCase() : 'ACTIVE'}</span>
            </span>
          </div>

          {/* Country */}
          <div className="p-3.5 rounded-xl bg-[#050B14]/80 border border-white/[0.05] space-y-1">
            <span className="text-[10px] text-[#98A2B3] uppercase tracking-wider font-medium block">Country</span>
            <span className="text-xs sm:text-sm font-semibold text-white truncate block pt-0.5">
              {user?.country && user.country.trim() !== '' ? user.country : 'Not Set'}
            </span>
          </div>

          {/* Member Since */}
          <div className="p-3.5 rounded-xl bg-[#050B14]/80 border border-white/[0.05] space-y-1">
            <span className="text-[10px] text-[#98A2B3] uppercase tracking-wider font-medium block">Member Since</span>
            <span className="text-xs sm:text-sm font-semibold text-white truncate block pt-0.5">
              {formatDate(user?.createdAt)}
            </span>
          </div>
        </div>
      </div>

      {/* Branded Referral Share & QR Code Modal */}
      <ReferralShareModal
        isOpen={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        referralCode={displayReferralCode}
        referralUrl={effectiveReferralUrl}
        userName={user?.fullName || referralData?.sponsor?.displayName}
      />

      {/* Binance-Grade KYC Modal */}
      <BinanceKYCModal
        isOpen={isKycModalOpen}
        onClose={() => setIsKycModalOpen(false)}
      />
    </div>
  );
};
