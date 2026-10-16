import React, { useState, useEffect, useCallback } from 'react';
import {
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  RotateCcw,
  ShieldCheck,
  TrendingUp,
  Coins,
  Award,
  Users,
  GitFork,
  RefreshCw,
  Clock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  FileText,
  Filter,
  Layers,
  Search,
  X,
  Copy,
  Check,
  Hash,
  Eye,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { PhivoCoinIcon } from '../brand/CryptoIcons';
import { getTransactionDisplayLabel, getTransactionUserDescription } from '../../utils/transactionDisplay';
import { EcosystemWalletTransferCard } from './EcosystemWalletTransferCard';

export interface WalletBreakdown {
  referral: number;
  matching: number;
  promotion: number;
  nodeReward?: number;
  deposit?: number;
  swap?: number;
}

export interface WalletSummary {
  totalEarned: number;
  totalReversed: number;
  ledgerBalance: number;
  transactionCount: number;
  breakdown: WalletBreakdown;
  grossBreakdown?: WalletBreakdown;
}

export interface LedgerTransactionItem {
  id: string;
  publicTxnId: string;
  userId: string;
  entryType: 'CREDIT' | 'DEBIT' | 'REVERSAL';
  sourceType: 'REFERRAL_COMMISSION' | 'MATCHING_BONUS' | 'PROMOTION_BONUS' | 'NODE_REWARD' | 'DEPOSIT' | 'SWAP' | 'WITHDRAWAL' | string;
  sourceId: string;
  sourceRef: string;
  description: string;
  amount: number;
  currency: string;
  status: 'SETTLED' | 'REVERSED' | 'PENDING';
  createdAt: string;
}

export interface WalletTransactionsResponse {
  transactions: LedgerTransactionItem[];
  pagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
  };
}

export type TransactionFilterType =
  | 'all'
  | 'deposit'
  | 'node_activation'
  | 'referral_commission'
  | 'matching_bonus'
  | 'promotion_bonus';

const FILTER_OPTIONS: {
  id: TransactionFilterType;
  label: string;
  icon: React.FC<{ className?: string }>;
}[] = [
  { id: 'all', label: 'All Transactions', icon: Layers },
  { id: 'deposit', label: 'Deposits', icon: ArrowDownLeft },
  { id: 'referral_commission', label: 'Referral ($50)', icon: Users },
  { id: 'matching_bonus', label: 'Binary Matching', icon: GitFork },
  { id: 'promotion_bonus', label: 'Rank Promotion', icon: Award },
  { id: 'node_activation', label: 'Node Mining', icon: Coins },
];

interface WalletSectionProps {
  onNavigateTab?: (tab: string) => void;
}

export const WalletSection: React.FC<WalletSectionProps> = ({ onNavigateTab }) => {
  const [summary, setSummary] = useState<WalletSummary | null>(null);
  const [transactions, setTransactions] = useState<LedgerTransactionItem[]>([]);
  const [selectedType, setSelectedType] = useState<TransactionFilterType>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedTxDetail, setSelectedTxDetail] = useState<LedgerTransactionItem | null>(null);
  const [copiedTxnField, setCopiedTxnField] = useState<string | null>(null);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    totalCount: 0,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchWalletData = useCallback(
    async (
      targetPage = 1,
      currentFilter = selectedType,
      currentSearch = searchQuery
    ) => {
      try {
        setErrorMsg(null);
        const filterParam = currentFilter !== 'all' ? `&type=${currentFilter}` : '';
        const searchParam = currentSearch.trim()
          ? `&search=${encodeURIComponent(currentSearch.trim())}`
          : '';
        const [sumRes, txRes] = await Promise.all([
          fetch('/api/wallet/me', { credentials: 'include' }),
          fetch(
            `/api/wallet/transactions?page=${targetPage}&limit=10${filterParam}${searchParam}`,
            { credentials: 'include' }
          ),
        ]);

        if (!sumRes.ok) {
          throw new Error(`HTTP ${sumRes.status}: Failed to load wallet summary`);
        }
        if (!txRes.ok) {
          throw new Error(`HTTP ${txRes.status}: Failed to load transactions`);
        }

        const sumData: WalletSummary = await sumRes.json();
        const txData: WalletTransactionsResponse = await txRes.json();

        setSummary(sumData);
        setTransactions(txData.transactions || []);
        setPagination(
          txData.pagination || { page: 1, limit: 10, totalCount: 0, totalPages: 1 }
        );
      } catch (err: any) {
        console.warn('[WalletSection] Error fetching wallet data:', err);
        setErrorMsg(err.message || 'Unable to connect to wallet ledger service.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [selectedType, searchQuery]
  );

  useEffect(() => {
    fetchWalletData(1, selectedType, searchQuery);
  }, [fetchWalletData, selectedType, searchQuery]);

  // Real-time synchronization on balance, transaction, or withdrawal status update
  useEffect(() => {
    const handleUpdate = () => {
      fetchWalletData(pagination.page, selectedType, searchQuery);
    };
    window.addEventListener('phivonex:balance-or-tx-updated', handleUpdate);
    return () => window.removeEventListener('phivonex:balance-or-tx-updated', handleUpdate);
  }, [fetchWalletData, pagination.page, selectedType, searchQuery]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchWalletData(pagination.page, selectedType, searchQuery);
  };

  const handleFilterChange = (filterId: TransactionFilterType) => {
    if (filterId === selectedType) return;
    setSelectedType(filterId);
    setLoading(true);
    fetchWalletData(1, filterId, searchQuery);
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  const handleClearSearch = () => {
    setSearchQuery('');
  };

  const displayTransactions = React.useMemo(() => {
    let result = transactions;

    if (selectedType !== 'all') {
      result = result.filter((tx) => {
        const s = (tx.sourceType || '').toUpperCase();
        if (selectedType === 'node_activation') {
          return s === 'NODE_REWARD' || s === 'NODE_ACTIVATION' || s === 'NODE_MINING';
        }
        if (selectedType === 'referral_commission') {
          return s === 'REFERRAL_COMMISSION' || s === 'REFERRAL';
        }
        if (selectedType === 'matching_bonus') {
          return s === 'MATCHING_BONUS' || s === 'MATCHING';
        }
        if (selectedType === 'promotion_bonus') {
          return s === 'PROMOTION_BONUS' || s === 'PROMOTION';
        }
        if (selectedType === 'deposit') {
          return s === 'DEPOSIT';
        }
        return true;
      });
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (tx) =>
          (tx.publicTxnId || '').toLowerCase().includes(q) ||
          (tx.description || '').toLowerCase().includes(q) ||
          (tx.sourceRef || '').toLowerCase().includes(q) ||
          (tx.sourceId || '').toLowerCase().includes(q) ||
          (tx.id || '').toLowerCase().includes(q)
      );
    }

    return result;
  }, [transactions, selectedType, searchQuery]);

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > pagination.totalPages || newPage === pagination.page)
      return;
    setLoading(true);
    fetchWalletData(newPage, selectedType, searchQuery);
  };

  const formatUsd = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount || 0);
  };

  const formatDate = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return isoStr;
      return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoStr;
    }
  };

  const getSourceIcon = (sourceType: string) => {
    switch (sourceType) {
      case 'ADMIN_ADJUSTMENT':
        return <ShieldCheck className="w-4 h-4 text-[#00CFFF]" />;
      case 'REFERRAL_COMMISSION':
      case 'REFERRAL':
        return <Users className="w-4 h-4 text-[#00CFFF]" />;
      case 'MATCHING_BONUS':
      case 'MATCHING':
        return <GitFork className="w-4 h-4 text-[#7F56D9]" />;
      case 'PROMOTION_BONUS':
      case 'PROMOTION':
        return <Award className="w-4 h-4 text-[#F79009]" />;
      case 'NODE_REWARD':
      case 'NODE_MINING':
        return <PhivoCoinIcon size={16} />;
      case 'DEPOSIT':
      case 'BLOCKCHAIN_DEPOSIT':
        return <ArrowDownLeft className="w-4 h-4 text-[#32D583]" />;
      case 'WITHDRAWAL':
        return <ArrowUpRight className="w-4 h-4 text-[#F04438]" />;
      default:
        return <Coins className="w-4 h-4 text-[#98A2B3]" />;
    }
  };

  const getSourceLabel = (sourceType: string, entryType?: string) => {
    return getTransactionDisplayLabel(sourceType, entryType);
  };

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
                <Wallet className="w-3.5 h-3.5" />
                Financial Ledger
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-[#32D583]/10 border border-[#32D583]/25 text-[#32D583] text-[11px] font-semibold">
                <ShieldCheck className="w-3 h-3" />
                Authoritative Double-Entry
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              Wallet & Ledger
            </h1>

            <p className="text-xs sm:text-sm text-[#98A2B3] max-w-2xl leading-relaxed">
              Real-time audit ledger tracking all node mining rewards, direct referral commissions, binary matching, and promotion bonuses.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
            {onNavigateTab && (
              <>
                <button
                  onClick={() => onNavigateTab('deposit')}
                  className="px-3.5 py-2 rounded-xl bg-[#00CFFF] hover:bg-[#00CFFF]/90 text-[#05070B] text-xs font-bold font-mono flex items-center gap-1.5 transition-all cursor-pointer min-h-[44px] shadow-sm shadow-[#00CFFF]/20"
                >
                  <ArrowDownLeft className="w-3.5 h-3.5" />
                  <span>Deposit</span>
                </button>
                <button
                  onClick={() => onNavigateTab('swap')}
                  className="px-3.5 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-white border border-white/[0.1] text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer min-h-[44px]"
                >
                  <Coins className="w-3.5 h-3.5 text-[#00CFFF]" />
                  <span>Swap PHIVO</span>
                </button>
                <button
                  onClick={() => onNavigateTab('withdrawals')}
                  className="px-3.5 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-white border border-white/[0.1] text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer min-h-[44px]"
                >
                  <ArrowUpRight className="w-3.5 h-3.5 text-[#F04438]" />
                  <span>Withdraw</span>
                </button>
              </>
            )}
            <button
              onClick={handleRefresh}
              disabled={refreshing || loading}
              className="px-3 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-[#98A2B3] hover:text-white border border-white/[0.08] text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 min-h-[44px]"
              title="Refresh ledger"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-[#00CFFF]' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-xl bg-[#F04438]/10 border border-[#F04438]/30 flex items-center gap-3 text-xs text-[#FDA29B]">
          <AlertCircle className="w-4 h-4 shrink-0 text-[#F04438]" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* ========================================================
          2. PRIMARY METRIC CARDS
         ======================================================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Card 1: Available Ledger Balance */}
        <div className="p-4 sm:p-5 rounded-xl bg-[#07101D] border border-[#00CFFF]/30 space-y-2 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-[#00CFFF]/5 rounded-full blur-xl pointer-events-none" />
          <div className="flex items-center justify-between text-xs text-[#98A2B3]">
            <span className="font-medium">Ledger Balance</span>
            <div className="w-7 h-7 rounded-lg bg-[#00CFFF]/10 border border-[#00CFFF]/20 flex items-center justify-center text-[#00CFFF]">
              <Wallet className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-bold font-mono text-[#00CFFF] tabular-nums">
            {loading ? '...' : formatUsd(summary?.ledgerBalance || 0)}
          </div>
          <div className="text-[11px] text-[#32D583] flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            <span>Available for withdrawal / swap</span>
          </div>
        </div>

        {/* Card 2: Cumulative Total Earned */}
        <div className="p-4 sm:p-5 rounded-xl bg-[#07101D] border border-white/[0.08] space-y-2 relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-[#98A2B3]">
            <span className="font-medium">Total Earned</span>
            <div className="w-7 h-7 rounded-lg bg-[#32D583]/10 border border-[#32D583]/20 flex items-center justify-center text-[#32D583]">
              <TrendingUp className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-bold font-mono text-[#32D583] tabular-nums">
            {loading ? '...' : formatUsd(summary?.totalEarned || 0)}
          </div>
          <div className="text-[11px] text-[#667085]">
            Gross protocol earnings
          </div>
        </div>

        {/* Card 3: Total Reversed / Offsets */}
        <div className="p-4 sm:p-5 rounded-xl bg-[#07101D] border border-white/[0.08] space-y-2 relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-[#98A2B3]">
            <span className="font-medium">Total Reversed</span>
            <div className="w-7 h-7 rounded-lg bg-[#F79009]/10 border border-[#F79009]/20 flex items-center justify-center text-[#F79009]">
              <RotateCcw className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-bold font-mono text-white/90 tabular-nums">
            {loading ? '...' : formatUsd(summary?.totalReversed || 0)}
          </div>
          <div className="text-[11px] text-[#667085]">
            Audited corrections &amp; offsets
          </div>
        </div>

        {/* Card 4: Audited Transactions */}
        <div className="p-4 sm:p-5 rounded-xl bg-[#07101D] border border-white/[0.08] space-y-2 relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-[#98A2B3]">
            <span className="font-medium">Audited Records</span>
            <div className="w-7 h-7 rounded-lg bg-white/[0.05] border border-white/[0.1] flex items-center justify-center text-[#98A2B3]">
              <FileText className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-bold font-mono text-white tabular-nums">
            {loading ? '...' : summary?.transactionCount ?? 0}
          </div>
          <div className="text-[11px] text-[#667085]">
            Immutable ledger entries
          </div>
        </div>
      </div>

      {/* ========================================================
          3. ECOSYSTEM WALLET TRANSFER CARD
         ======================================================== */}
      <EcosystemWalletTransferCard
        availableBalance={summary?.ledgerBalance || 0}
        mainWalletBalance={(summary as any)?.mainWalletBalance || 0}
        nodeVaultBalance={(summary as any)?.nodeVaultBalance || 0}
        onTransferSuccess={handleRefresh}
      />

      {/* ========================================================
          3. 5-CHANNEL EARNINGS BREAKDOWN
         ======================================================== */}
      <div className="p-5 sm:p-6 rounded-2xl bg-[#07101D] border border-white/[0.08] shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
          <div className="space-y-0.5">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Coins className="w-4 h-4 text-[#00CFFF]" />
              <span>Earnings Sources Breakdown</span>
            </h3>
            <p className="text-xs text-[#98A2B3]">
              Authoritative ledger allocations categorized by reward stream.
            </p>
          </div>
          <span className="text-[11px] font-mono text-[#32D583] hidden sm:inline">
            Reconciled
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
          {/* Channel 1: Deposits */}
          <div className="p-4 rounded-xl bg-[#05070B] border border-white/[0.06] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#98A2B3] flex items-center gap-1.5">
                <ArrowDownLeft className="w-3.5 h-3.5 text-[#32D583]" />
                <span>Deposits</span>
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#32D583]/10 text-[#32D583]">
                BEP-20
              </span>
            </div>
            <div className="text-xl font-mono font-bold text-white tabular-nums">
              {loading ? '...' : formatUsd(summary?.breakdown.deposit || 0)}
            </div>
            <p className="text-[10px] text-[#667085]">
              On-chain USDT deposit funding
            </p>
          </div>

          {/* Channel 2: Direct Referral */}
          <div className="p-4 rounded-xl bg-[#05070B] border border-white/[0.06] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#98A2B3] flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-[#00CFFF]" />
                <span>Referral</span>
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#00CFFF]/10 text-[#00CFFF]">
                $50 / Node
              </span>
            </div>
            <div className="text-xl font-mono font-bold text-white tabular-nums">
              {loading ? '...' : formatUsd(summary?.breakdown.referral || 0)}
            </div>
            <p className="text-[10px] text-[#667085]">
              Direct sponsor commissions
            </p>
          </div>

          {/* Channel 3: Binary Matching */}
          <div className="p-4 rounded-xl bg-[#05070B] border border-white/[0.06] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#98A2B3] flex items-center gap-1.5">
                <GitFork className="w-3.5 h-3.5 text-[#7F56D9]" />
                <span>Matching</span>
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#7F56D9]/10 text-[#D6BBFB]">
                Daily Pairs
              </span>
            </div>
            <div className="text-xl font-mono font-bold text-white tabular-nums">
              {loading ? '...' : formatUsd(summary?.breakdown.matching || 0)}
            </div>
            <p className="text-[10px] text-[#667085]">
              Daily binary pairs settlement
            </p>
          </div>

          {/* Channel 4: Promotion Bonuses */}
          <div className="p-4 rounded-xl bg-[#05070B] border border-white/[0.06] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#98A2B3] flex items-center gap-1.5">
                <Award className="w-3.5 h-3.5 text-[#F79009]" />
                <span>Promotion</span>
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#F79009]/10 text-[#FEC84B]">
                Ladder
              </span>
            </div>
            <div className="text-xl font-mono font-bold text-white tabular-nums">
              {loading ? '...' : formatUsd(summary?.breakdown.promotion || 0)}
            </div>
            <p className="text-[10px] text-[#667085]">
              Leadership rank milestones
            </p>
          </div>

          {/* Channel 5: Node Mining */}
          <div className="p-4 rounded-xl bg-[#05070B] border border-white/[0.06] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#98A2B3] flex items-center gap-1.5">
                <PhivoCoinIcon size={14} />
                <span>Node Mining</span>
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#00CFFF]/10 text-[#00CFFF]">
                Epoch
              </span>
            </div>
            <div className="text-xl font-mono font-bold text-white tabular-nums">
              {loading ? '...' : formatUsd(summary?.breakdown.nodeReward || 0)}
            </div>
            <p className="text-[10px] text-[#667085]">
              Genesis validator epoch accruals
            </p>
          </div>
        </div>
      </div>

      {/* ========================================================
          4. TRANSACTION LEDGER TABLE WITH FILTERS & SEARCH
         ======================================================== */}
      <div className="p-5 sm:p-6 rounded-2xl bg-[#07101D] border border-white/[0.08] shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/[0.06] pb-3">
          <div className="space-y-0.5">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#00CFFF]" />
              <span>Ledger Transaction History</span>
            </h3>
            <p className="text-xs text-[#98A2B3]">
              Immutable double-entry records with verifiable references.
            </p>
          </div>

          <span className="text-xs font-mono text-[#98A2B3] bg-white/[0.03] px-3 py-1 rounded-full border border-white/[0.06] self-start sm:self-auto">
            {displayTransactions.length} of {pagination.totalCount} entries
          </span>
        </div>

        {/* Filter Chips and Search Bar */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-[#05070B] p-3 rounded-xl border border-white/[0.06]">
          {/* Search Box */}
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 text-[#00CFFF] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={handleSearchChange}
              placeholder="Search by Txn ID, reference, or description..."
              className="w-full bg-[#07101D] border border-white/[0.1] focus:border-[#00CFFF]/60 rounded-xl pl-9 pr-8 py-2 text-xs text-white placeholder-[#98A2B3] focus:outline-none transition-all font-mono min-h-[44px]"
            />
            {searchQuery && (
              <button
                onClick={handleClearSearch}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#98A2B3] hover:text-white p-1 rounded-lg hover:bg-white/[0.08] transition-colors cursor-pointer"
                title="Clear Search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Filter Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0 scrollbar-none">
            {FILTER_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const isActive = selectedType === opt.id;
              return (
                <button
                  key={opt.id}
                  onClick={() => handleFilterChange(opt.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all shrink-0 cursor-pointer border min-h-[44px] ${
                    isActive
                      ? 'bg-[#00CFFF]/10 text-[#00CFFF] border-[#00CFFF]/40 font-bold'
                      : 'bg-white/[0.03] hover:bg-white/[0.08] text-[#98A2B3] hover:text-white border-white/[0.08]'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-[#00CFFF]' : 'text-[#98A2B3]'}`} />
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Transactions Desktop Table */}
        <div className="hidden md:block overflow-x-auto">
          {displayTransactions.length === 0 && !loading ? (
            <div className="p-8 text-center text-xs text-[#98A2B3] font-mono border border-dashed border-white/[0.08] rounded-xl space-y-2">
              <div className="text-white font-medium">No ledger transactions found</div>
              <p className="text-[#667085]">
                {searchQuery
                  ? `No transactions match "${searchQuery}".`
                  : 'New ledger settlements and deposits will appear here automatically.'}
              </p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-white/[0.06] text-[#98A2B3] font-mono text-[11px] uppercase tracking-wider">
                  <th className="py-3 px-3">Date</th>
                  <th className="py-3 px-3">Txn ID</th>
                  <th className="py-3 px-3">Type</th>
                  <th className="py-3 px-3">Channel</th>
                  <th className="py-3 px-3">Reference</th>
                  <th className="py-3 px-3">Description</th>
                  <th className="py-3 px-3 text-right">Amount</th>
                  <th className="py-3 px-3 text-center">Status</th>
                  <th className="py-3 px-3 text-right">Inspect</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {displayTransactions.map((tx) => {
                  const isCredit = tx.entryType === 'CREDIT';
                  const isReversal = tx.entryType === 'REVERSAL';

                  return (
                    <tr
                      key={tx.id}
                      onClick={() => setSelectedTxDetail(tx)}
                      className="hover:bg-white/[0.04] transition-colors cursor-pointer group"
                    >
                      <td className="py-3 px-3 text-[#98A2B3] font-mono whitespace-nowrap">
                        {formatDate(tx.createdAt)}
                      </td>
                      <td className="py-3 px-3 font-mono font-bold text-[#00CFFF] whitespace-nowrap">
                        {tx.publicTxnId}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        {isCredit ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-[#32D583]/10 text-[#32D583] border border-[#32D583]/20">
                            <ArrowDownLeft className="w-3 h-3" />
                            CREDIT
                          </span>
                        ) : isReversal ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-[#F79009]/10 text-[#F79009] border border-[#F79009]/20">
                            <RotateCcw className="w-3 h-3" />
                            REVERSAL
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-[#F04438]/10 text-[#F04438] border border-[#F04438]/20">
                            <ArrowUpRight className="w-3 h-3" />
                            DEBIT
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 text-white">
                          {getSourceIcon(tx.sourceType)}
                          <span className="text-xs font-medium">{getSourceLabel(tx.sourceType, tx.entryType)}</span>
                        </div>
                      </td>
                      <td className="py-3 px-3 font-mono text-[#98A2B3] text-[11px] whitespace-nowrap">
                        {tx.sourceRef}
                      </td>
                      <td className="py-3 px-3 text-[#98A2B3] max-w-xs truncate">
                        {getTransactionUserDescription(tx)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold whitespace-nowrap">
                        <span className={isCredit ? 'text-[#32D583]' : isReversal ? 'text-[#F79009]' : 'text-[#F04438]'}>
                          {isCredit ? '+' : '-'}{formatUsd(tx.amount)}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-[#32D583]/10 text-[#32D583]">
                          <CheckCircle2 className="w-3 h-3" />
                          {tx.status}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right whitespace-nowrap">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedTxDetail(tx);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-white/[0.04] hover:bg-[#00CFFF]/20 border border-white/[0.08] hover:border-[#00CFFF]/40 text-[#00CFFF] text-[11px] font-mono transition-all inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Eye className="w-3 h-3" />
                          <span>View</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Transactions Mobile Stacked Card View (<768px) */}
        <div className="block md:hidden space-y-3">
          {displayTransactions.length === 0 && !loading ? (
            <div className="p-6 text-center text-xs text-[#98A2B3] font-mono border border-dashed border-white/[0.08] rounded-xl space-y-2">
              <div className="text-white font-medium">No transactions found</div>
              <p className="text-[#667085]">
                {searchQuery
                  ? `No results for "${searchQuery}".`
                  : 'Settled transactions will appear here.'}
              </p>
            </div>
          ) : (
            displayTransactions.map((tx) => {
              const isCredit = tx.entryType === 'CREDIT';
              const isReversal = tx.entryType === 'REVERSAL';

              return (
                <div
                  key={tx.id}
                  onClick={() => setSelectedTxDetail(tx)}
                  className="p-4 rounded-xl bg-[#05070B] border border-white/[0.06] space-y-2.5 cursor-pointer active:bg-white/[0.04] transition-all"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-xs text-[#00CFFF]">
                        {tx.publicTxnId}
                      </span>
                      <span
                        className={`inline-flex items-center px-1.5 py-0.5 rounded font-mono text-[9px] font-bold ${
                          isCredit
                            ? 'bg-[#32D583]/10 text-[#32D583]'
                            : isReversal
                            ? 'bg-[#F79009]/10 text-[#F79009]'
                            : 'bg-[#F04438]/10 text-[#F04438]'
                        }`}
                      >
                        {tx.entryType}
                      </span>
                    </div>

                    <div className="font-mono font-bold text-sm">
                      <span className={isCredit ? 'text-[#32D583]' : isReversal ? 'text-[#F79009]' : 'text-[#F04438]'}>
                        {isCredit ? '+' : '-'}{formatUsd(tx.amount)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-[#98A2B3]">
                    <div className="flex items-center gap-1.5 text-white">
                      {getSourceIcon(tx.sourceType)}
                      <span>{getSourceLabel(tx.sourceType, tx.entryType)}</span>
                    </div>
                    <span className="text-[11px] font-mono text-[#667085]">
                      {formatDate(tx.createdAt)}
                    </span>
                  </div>

                  <p className="text-[11px] text-[#667085] truncate">
                    {getTransactionUserDescription(tx)}
                  </p>
                </div>
              );
            })
          )}
        </div>

        {/* Pagination Footer */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between pt-4 border-t border-white/[0.06] text-xs font-mono">
            <span className="text-[#98A2B3]">
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handlePageChange(pagination.page - 1)}
                disabled={pagination.page <= 1 || loading}
                className="p-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-white disabled:opacity-30 cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label="Previous Page"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => handlePageChange(pagination.page + 1)}
                disabled={pagination.page >= pagination.totalPages || loading}
                className="p-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-white disabled:opacity-30 cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label="Next Page"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ========================================================
          5. EXTENDED TRANSACTION DETAIL MODAL
         ======================================================== */}
      {selectedTxDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div
            className="fixed inset-0"
            onClick={() => setSelectedTxDetail(null)}
            aria-hidden="true"
          />

          <div className="relative w-full max-w-xl bg-[#07101D] border border-white/[0.12] rounded-2xl p-5 sm:p-7 shadow-2xl space-y-5 z-10 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-white/[0.08] pb-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#00CFFF]/10 border border-[#00CFFF]/20 flex items-center justify-center text-[#00CFFF]">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    Ledger Transaction Details
                  </h3>
                  <p className="text-xs font-mono text-[#00CFFF]">
                    {selectedTxDetail.publicTxnId}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSelectedTxDetail(null)}
                className="p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.1] text-[#98A2B3] hover:text-white transition-colors cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Amount Banner */}
            <div className="p-4 rounded-xl bg-[#05070B] border border-white/[0.06] flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-[10px] font-mono text-[#98A2B3] uppercase block">
                  Amount
                </span>
                <div className="text-2xl font-mono font-bold">
                  <span
                    className={
                      selectedTxDetail.entryType === 'CREDIT'
                        ? 'text-[#32D583]'
                        : selectedTxDetail.entryType === 'REVERSAL'
                        ? 'text-[#F79009]'
                        : 'text-[#F04438]'
                    }
                  >
                    {selectedTxDetail.entryType === 'CREDIT' ? '+' : '-'}
                    {formatUsd(selectedTxDetail.amount)}
                  </span>
                </div>
              </div>

              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-mono text-xs font-bold bg-[#32D583]/10 text-[#32D583] border border-[#32D583]/20">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {selectedTxDetail.status}
              </span>
            </div>

            {/* Metadata Fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-[#05070B] border border-white/[0.06] space-y-1">
                <span className="text-[10px] font-mono text-[#667085] uppercase block">Source Channel</span>
                <div className="flex items-center gap-2 text-white font-medium">
                  {getSourceIcon(selectedTxDetail.sourceType)}
                  <span>{getSourceLabel(selectedTxDetail.sourceType, selectedTxDetail.entryType)}</span>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-[#05070B] border border-white/[0.06] space-y-1">
                <span className="text-[10px] font-mono text-[#667085] uppercase block">Reference</span>
                <div className="font-mono text-white truncate">
                  {selectedTxDetail.sourceRef || '—'}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-[#05070B] border border-white/[0.06] space-y-1 sm:col-span-2">
                <span className="text-[10px] font-mono text-[#667085] uppercase block">Timestamp (UTC)</span>
                <div className="font-mono text-white text-[11px]">
                  {selectedTxDetail.createdAt}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-[#05070B] border border-white/[0.06] space-y-1 sm:col-span-2">
                <span className="text-[10px] font-mono text-[#667085] uppercase block">Description</span>
                <div className="text-white text-xs leading-relaxed">
                  {getTransactionUserDescription(selectedTxDetail)}
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-white/[0.06]">
              <button
                onClick={() => {
                  const payload = JSON.stringify(selectedTxDetail, null, 2);
                  navigator.clipboard.writeText(payload);
                  setCopiedTxnField('json');
                  setTimeout(() => setCopiedTxnField(null), 2000);
                }}
                className="w-full sm:w-auto px-4 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-xs font-mono text-white flex items-center justify-center gap-1.5 transition-all cursor-pointer min-h-[44px]"
              >
                {copiedTxnField === 'json' ? <Check className="w-3.5 h-3.5 text-[#32D583]" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedTxnField === 'json' ? 'Copied' : 'Copy JSON'}</span>
              </button>

              <button
                onClick={() => setSelectedTxDetail(null)}
                className="w-full sm:w-auto px-6 py-2 rounded-xl bg-[#00CFFF] hover:bg-[#00CFFF]/90 text-[#05070B] font-bold text-xs transition-colors cursor-pointer min-h-[44px]"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
