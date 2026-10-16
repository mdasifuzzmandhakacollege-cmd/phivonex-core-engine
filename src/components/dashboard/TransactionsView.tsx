import React, { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeftRight,
  ArrowUpRight,
  ArrowDownLeft,
  RotateCcw,
  Search,
  RefreshCw,
  Clock,
  CheckCircle2,
  AlertCircle,
  Coins,
  Wallet,
  Server,
  Users,
  GitFork,
  Award,
  Sparkles,
  ChevronRight,
  ChevronLeft,
  Copy,
  Check,
  ExternalLink,
  ShieldCheck,
  Filter,
  X,
  FileText,
  Info,
  DollarSign,
  Layers,
} from 'lucide-react';
import { UserProfile } from '../../context/AuthContext';
import { getTransactionDisplayLabel, getTransactionUserDescription } from '../../utils/transactionDisplay';

interface TransactionsViewProps {
  user: UserProfile;
  onNavigateTab: (tab: string) => void;
}

export interface LedgerTransaction {
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

interface WalletSummary {
  totalEarned: number;
  totalReversed: number;
  totalWithdrawn: number;
  ledgerBalance: number;
  availableBalance: number;
  transactionCount: number;
  breakdown: {
    referral: number;
    matching: number;
    promotion: number;
    nodeReward: number;
    swap: number;
    deposit: number;
  };
}

interface PaginationData {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
}

const CATEGORY_OPTIONS = [
  { id: 'ALL', label: 'All Categories' },
  { id: 'NODE_REWARD', label: 'Genesis Mining', icon: Server },
  { id: 'REFERRAL_COMMISSION', label: 'Direct Referral', icon: Users },
  { id: 'MATCHING_BONUS', label: 'Binary Matching', icon: GitFork },
  { id: 'PROMOTION_BONUS', label: 'Rank Promotion', icon: Award },
  { id: 'BLOCKCHAIN_DEPOSIT', label: 'USDT Deposit', icon: ArrowDownLeft },
  { id: 'ADMIN_ADJUSTMENT', label: 'Account Credit / Debit', icon: ShieldCheck },
  { id: 'NODE_PURCHASE', label: 'Genesis Node Purchase', icon: Server },
  { id: 'WITHDRAWAL', label: 'Withdrawal', icon: ArrowUpRight },
  { id: 'COIN_SWAP', label: 'Coin Swap', icon: ArrowLeftRight },
];

const ENTRY_TYPE_OPTIONS = [
  { id: 'ALL', label: 'All Entries' },
  { id: 'CREDIT', label: 'Credits (+)' },
  { id: 'DEBIT', label: 'Debits (-)' },
  { id: 'REVERSAL', label: 'Reversals (↺)' },
];

export const TransactionsView: React.FC<TransactionsViewProps> = ({ user: _user, onNavigateTab }) => {
  const [transactions, setTransactions] = useState<LedgerTransaction[]>([]);
  const [summary, setSummary] = useState<WalletSummary | null>(null);
  const [pagination, setPagination] = useState<PaginationData>({
    page: 1,
    limit: 15,
    totalCount: 0,
    totalPages: 1,
  });

  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [entryTypeFilter, setEntryTypeFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Inspector modal state
  const [selectedTx, setSelectedTx] = useState<LedgerTransaction | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
      setPagination((prev) => ({ ...prev, page: 1 }));
    }, 350);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch summary and paginated transactions from server
  const fetchTransactions = useCallback(
    async (isManual = false) => {
      if (isManual) setRefreshing(true);
      setErrorMsg(null);

      try {
        const queryParams = new URLSearchParams();
        queryParams.set('page', String(pagination.page));
        queryParams.set('limit', String(pagination.limit));

        if (categoryFilter !== 'ALL') {
          queryParams.set('type', categoryFilter);
        }
        if (entryTypeFilter !== 'ALL') {
          queryParams.set('entryType', entryTypeFilter);
        }
        if (debouncedSearch) {
          queryParams.set('search', debouncedSearch);
        }

        const [txRes, summaryRes] = await Promise.all([
          fetch(`/api/wallet/transactions?${queryParams.toString()}`, { credentials: 'include' }),
          fetch('/api/wallet/summary', { credentials: 'include' }),
        ]);

        if (txRes.ok) {
          const txData = await txRes.json();
          setTransactions(txData.transactions || []);
          if (txData.pagination) {
            setPagination((prev) => ({
              ...prev,
              totalCount: txData.pagination.totalCount ?? 0,
              totalPages: txData.pagination.totalPages ?? 1,
            }));
          }
        } else {
          throw new Error('Failed to load transaction ledger records.');
        }

        if (summaryRes.ok) {
          const sumData = await summaryRes.json();
          setSummary(sumData);
        }
      } catch (err: any) {
        console.warn('[TransactionsView] Fetch error:', err);
        setErrorMsg(err.message || 'Unable to load transaction records.');
      } finally {
        setLoading(false);
        if (isManual) setRefreshing(false);
      }
    },
    [pagination.page, pagination.limit, categoryFilter, entryTypeFilter, debouncedSearch]
  );

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  // Real-time synchronization on transaction ledger or balance updates
  useEffect(() => {
    const handleUpdate = () => {
      fetchTransactions(true);
    };
    window.addEventListener('phivonex:balance-or-tx-updated', handleUpdate);
    return () => window.removeEventListener('phivonex:balance-or-tx-updated', handleUpdate);
  }, [fetchTransactions]);

  const handleCopy = (text: string, fieldKey: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedField(fieldKey);
    setTimeout(() => {
      setCopiedField(null);
    }, 2000);
  };

  const formatCurrency = (amount?: number | null) => {
    const num = Number(amount || 0);
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const formatDate = (isoString?: string | null) => {
    if (!isoString) return '—';
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return 'Invalid Date';
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getSourceTypeDetails = (sourceType: string, entryType?: string) => {
    switch (sourceType) {
      case 'ADMIN_ADJUSTMENT':
        return {
          label: getTransactionDisplayLabel(sourceType, entryType),
          icon: ShieldCheck,
          color: 'text-[#00CFFF]',
          bg: 'bg-[#00CFFF]/10',
        };
      case 'NODE_PURCHASE':
        return { label: 'Genesis Node Purchase', icon: Server, color: 'text-amber-400', bg: 'bg-amber-400/10' };
      case 'NODE_REWARD':
        return { label: 'Genesis Mining', icon: Server, color: 'text-[#00CFFF]', bg: 'bg-[#00CFFF]/10' };
      case 'REFERRAL_COMMISSION':
        return { label: 'Direct Referral', icon: Users, color: 'text-[#168BFF]', bg: 'bg-[#168BFF]/10' };
      case 'MATCHING_BONUS':
        return { label: 'Binary Matching', icon: GitFork, color: 'text-[#875BF7]', bg: 'bg-[#875BF7]/10' };
      case 'PROMOTION_BONUS':
        return { label: 'Rank Promotion', icon: Award, color: 'text-[#FDB022]', bg: 'bg-[#FDB022]/10' };
      case 'BLOCKCHAIN_DEPOSIT':
        return { label: 'USDT Deposit', icon: ArrowDownLeft, color: 'text-[#32D583]', bg: 'bg-[#32D583]/10' };
      case 'WITHDRAWAL':
        return { label: 'Withdrawal', icon: ArrowUpRight, color: 'text-[#F04438]', bg: 'bg-[#F04438]/10' };
      case 'COIN_SWAP':
        return { label: 'Coin Swap', icon: ArrowLeftRight, color: 'text-[#2E90FA]', bg: 'bg-[#2E90FA]/10' };
      default:
        return { label: getTransactionDisplayLabel(sourceType, entryType), icon: FileText, color: 'text-[#98A2B3]', bg: 'bg-white/[0.04]' };
    }
  };

  const getEntryTypePill = (entryType: 'CREDIT' | 'DEBIT' | 'REVERSAL') => {
    if (entryType === 'CREDIT') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#32D583]/10 text-[#32D583] border border-[#32D583]/30">
          <ArrowDownLeft className="w-3 h-3" />
          CREDIT
        </span>
      );
    }
    if (entryType === 'DEBIT') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#F04438]/10 text-[#F04438] border border-[#F04438]/30">
          <ArrowUpRight className="w-3 h-3" />
          DEBIT
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">
        <RotateCcw className="w-3 h-3" />
        REVERSAL
      </span>
    );
  };

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* 1. Header Banner & Actions */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#07101D] via-[#0A1628] to-[#040914] border border-white/[0.08] p-6 sm:p-8 shadow-2xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-[#00CFFF]/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
        <div className="absolute bottom-0 left-1/4 w-64 h-64 bg-[#168BFF]/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#00CFFF]/10 border border-[#00CFFF]/30 text-[#00CFFF] text-xs font-mono">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Authoritative Financial Ledger</span>
              </div>

              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#32D583]/10 border border-[#32D583]/30 text-[#32D583] text-xs font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-[#32D583] animate-pulse" />
                <span>Double-Entry Balanced</span>
              </div>

              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/[0.08] text-[#98A2B3] text-xs font-mono">
                <span>{summary?.transactionCount || pagination.totalCount} Recorded Entries</span>
              </div>
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Protocol Ledger & Financial Audit Explorer
            </h1>

            <p className="text-sm text-[#98A2B3] leading-relaxed">
              Cryptographic transaction history, multi-channel ledger movements, and immutable receipt audit trail. All credits, debits, reversals, and settlements are strictly recorded server-side.
            </p>
          </div>

          {/* Quick Actions */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => fetchTransactions(true)}
              disabled={refreshing}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-white text-xs font-mono transition-all cursor-pointer min-h-[44px] disabled:opacity-50"
              title="Refresh Ledger Telemetry"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-[#00CFFF]' : 'text-[#98A2B3]'}`} />
              <span>{refreshing ? 'Syncing...' : 'Sync Ledger'}</span>
            </button>

            <button
              onClick={() => onNavigateTab('wallet')}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#00CFFF]/15 hover:bg-[#00CFFF]/25 border border-[#00CFFF]/30 text-[#00CFFF] text-xs font-bold transition-all cursor-pointer min-h-[44px]"
            >
              <Wallet className="w-4 h-4" />
              <span>Wallet & Balances</span>
            </button>

            <button
              onClick={() => onNavigateTab('withdrawals')}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-white text-xs font-semibold transition-all cursor-pointer min-h-[44px]"
            >
              <ArrowUpRight className="w-4 h-4 text-[#F04438]" />
              <span>Withdrawals</span>
            </button>
          </div>
        </div>

        {errorMsg && (
          <div className="mt-6 p-4 rounded-xl bg-[#F04438]/10 border border-[#F04438]/30 text-[#F04438] text-xs flex items-center justify-between gap-3 animate-fadeIn">
            <div className="flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
            <button
              onClick={() => setErrorMsg(null)}
              className="text-[#F04438]/70 hover:text-[#F04438] text-xs font-mono underline cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}
      </div>

      {/* 2. Ledger Aggregate Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Available Ledger Balance */}
        <div className="p-5 rounded-2xl bg-[#07101D] border border-white/[0.08] shadow-lg relative overflow-hidden group hover:border-[#00CFFF]/40 transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-[#00CFFF]/5 rounded-full blur-xl pointer-events-none group-hover:bg-[#00CFFF]/10 transition-all" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-[#98A2B3] uppercase tracking-wider">Authoritative Balance</span>
            <div className="w-8 h-8 rounded-lg bg-[#00CFFF]/10 flex items-center justify-center text-[#00CFFF]">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-extrabold text-white tracking-tight font-mono">
              ${formatCurrency(summary?.availableBalance ?? summary?.ledgerBalance)}
            </div>
            <div className="text-[11px] text-[#00CFFF] mt-1 font-mono flex items-center gap-1">
              <span>Settled cash balance</span>
            </div>
          </div>
        </div>

        {/* Total Gross Credits */}
        <div className="p-5 rounded-2xl bg-[#07101D] border border-white/[0.08] shadow-lg relative overflow-hidden group hover:border-[#32D583]/40 transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-[#32D583]/5 rounded-full blur-xl pointer-events-none group-hover:bg-[#32D583]/10 transition-all" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-[#98A2B3] uppercase tracking-wider">Gross Credits</span>
            <div className="w-8 h-8 rounded-lg bg-[#32D583]/10 flex items-center justify-center text-[#32D583]">
              <ArrowDownLeft className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-extrabold text-[#32D583] tracking-tight font-mono">
              +${formatCurrency(summary?.totalEarned)}
            </div>
            <div className="text-[11px] text-[#98A2B3] mt-1 font-mono">
              All earned commissions & deposits
            </div>
          </div>
        </div>

        {/* Total Debits / Settled Withdrawals */}
        <div className="p-5 rounded-2xl bg-[#07101D] border border-white/[0.08] shadow-lg relative overflow-hidden group hover:border-[#F04438]/40 transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-[#F04438]/5 rounded-full blur-xl pointer-events-none group-hover:bg-[#F04438]/10 transition-all" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-[#98A2B3] uppercase tracking-wider">Gross Debits</span>
            <div className="w-8 h-8 rounded-lg bg-[#F04438]/10 flex items-center justify-center text-[#F04438]">
              <ArrowUpRight className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-extrabold text-[#F04438] tracking-tight font-mono">
              -${formatCurrency(summary?.totalWithdrawn)}
            </div>
            <div className="text-[11px] text-[#98A2B3] mt-1 font-mono">
              Settled blockchain withdrawals
            </div>
          </div>
        </div>

        {/* Total Reversals & Adjustments */}
        <div className="p-5 rounded-2xl bg-[#07101D] border border-white/[0.08] shadow-lg relative overflow-hidden group hover:border-amber-500/40 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-[#98A2B3] uppercase tracking-wider">Reversals</span>
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-400">
              <RotateCcw className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-extrabold text-amber-400 tracking-tight font-mono">
              ${formatCurrency(summary?.totalReversed)}
            </div>
            <div className="text-[11px] text-[#98A2B3] mt-1 font-mono">
              Audit & correction offsets
            </div>
          </div>
        </div>
      </div>

      {/* 3. Transaction Explorer & Filter Controls */}
      <div className="rounded-3xl bg-[#07101D] border border-white/[0.08] overflow-hidden shadow-xl space-y-6 p-6">
        {/* Top Control Bar */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <ArrowLeftRight className="w-4 h-4 text-[#00CFFF]" />
              <h3 className="text-base font-bold text-white">Ledger Transaction Explorer</h3>
            </div>
            <p className="text-xs text-[#98A2B3]">
              Showing {pagination.totalCount} ledger entries. Click any record to inspect the cryptographic audit receipt.
            </p>
          </div>

          {/* Search Box */}
          <div className="relative w-full lg:w-72">
            <Search className="w-4 h-4 text-[#98A2B3] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search TXN-ID, Ref, or Description..."
              className="w-full pl-9 pr-8 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-xs placeholder-[#98A2B3] focus:outline-none focus:border-[#00CFFF]/50 font-mono"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#98A2B3] hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Filters Row */}
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-white/[0.06]">
          {/* Category Dropdown / Pills */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 max-w-full">
            <span className="text-[11px] font-mono text-[#98A2B3] uppercase tracking-wider shrink-0 flex items-center gap-1">
              <Filter className="w-3 h-3 text-[#00CFFF]" />
              Category:
            </span>
            <div className="flex items-center gap-1.5 flex-nowrap">
              {CATEGORY_OPTIONS.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => {
                    setCategoryFilter(cat.id);
                    setPagination((p) => ({ ...p, page: 1 }));
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono whitespace-nowrap transition-all cursor-pointer ${
                    categoryFilter === cat.id
                      ? 'bg-[#00CFFF]/15 text-[#00CFFF] border border-[#00CFFF]/30 font-bold shadow-sm'
                      : 'bg-white/[0.02] text-[#98A2B3] hover:text-white hover:bg-white/[0.04] border border-transparent'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Entry Type Filter */}
          <div className="flex items-center gap-1.5 ml-auto">
            <span className="text-[11px] font-mono text-[#98A2B3] uppercase tracking-wider shrink-0">
              Type:
            </span>
            <div className="flex items-center rounded-xl bg-white/[0.03] border border-white/[0.08] p-1">
              {ENTRY_TYPE_OPTIONS.map((et) => (
                <button
                  key={et.id}
                  onClick={() => {
                    setEntryTypeFilter(et.id);
                    setPagination((p) => ({ ...p, page: 1 }));
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-mono transition-all cursor-pointer ${
                    entryTypeFilter === et.id
                      ? 'bg-[#00CFFF]/15 text-[#00CFFF] font-bold shadow-sm'
                      : 'text-[#98A2B3] hover:text-white'
                  }`}
                >
                  {et.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Transactions Table / List */}
        {loading ? (
          <div className="p-16 text-center space-y-3">
            <RefreshCw className="w-7 h-7 text-[#00CFFF] animate-spin mx-auto" />
            <p className="text-xs text-[#98A2B3] font-mono">Synchronizing financial ledger transactions...</p>
          </div>
        ) : transactions.length === 0 ? (
          <div className="p-14 text-center space-y-3 border border-white/[0.04] rounded-2xl bg-white/[0.01]">
            <Info className="w-8 h-8 text-[#98A2B3] mx-auto opacity-40" />
            <h4 className="text-sm font-bold text-white">No Transactions Found</h4>
            <p className="text-xs text-[#98A2B3] max-w-md mx-auto">
              {debouncedSearch || categoryFilter !== 'ALL' || entryTypeFilter !== 'ALL'
                ? 'No financial ledger entries match your filter criteria.'
                : 'No transactions recorded on this operator account yet.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-[#98A2B3]">
              <thead className="bg-white/[0.02] border-b border-white/[0.06] text-[11px] font-mono uppercase text-[#98A2B3]">
                <tr>
                  <th className="px-4 py-3.5">Public TXN ID</th>
                  <th className="px-4 py-3.5">Entry Type</th>
                  <th className="px-4 py-3.5">Category</th>
                  <th className="px-4 py-3.5">Description & Reference</th>
                  <th className="px-4 py-3.5 text-right">Amount</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-4 py-3.5">Timestamp</th>
                  <th className="px-4 py-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {transactions.map((tx) => {
                  const details = getSourceTypeDetails(tx.sourceType, tx.entryType);
                  const Icon = details.icon;
                  const isCredit = tx.entryType === 'CREDIT';
                  const isDebit = tx.entryType === 'DEBIT';
                  const isReversal = tx.entryType === 'REVERSAL';

                  return (
                    <tr
                      key={tx.id}
                      onClick={() => setSelectedTx(tx)}
                      className="hover:bg-white/[0.02] transition-colors font-mono cursor-pointer group"
                    >
                      {/* Public TXN ID */}
                      <td className="px-4 py-3.5 text-white font-semibold">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[#00CFFF] group-hover:underline">{tx.publicTxnId}</span>
                        </div>
                      </td>

                      {/* Entry Type */}
                      <td className="px-4 py-3.5">{getEntryTypePill(tx.entryType)}</td>

                      {/* Category */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5">
                          <div className={`w-5 h-5 rounded-md ${details.bg} flex items-center justify-center ${details.color}`}>
                            <Icon className="w-3 h-3" />
                          </div>
                          <span className="text-white text-[11px]">{details.label}</span>
                        </div>
                      </td>

                      {/* Description & Reference */}
                      <td className="px-4 py-3.5 max-w-xs truncate">
                        <div className="text-white text-xs truncate">{getTransactionUserDescription(tx)}</div>
                        {tx.sourceRef && (
                          <div className="text-[10px] text-[#98A2B3] truncate">Ref: {tx.sourceRef}</div>
                        )}
                      </td>

                      {/* Amount */}
                      <td className="px-4 py-3.5 text-right font-bold">
                        <span
                          className={
                            isCredit
                              ? 'text-[#32D583]'
                              : isDebit
                              ? 'text-[#F04438]'
                              : 'text-amber-400'
                          }
                        >
                          {isCredit ? '+' : isDebit ? '-' : '↺'}${formatCurrency(tx.amount)} {tx.currency}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3.5">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold ${
                            tx.status === 'SETTLED'
                              ? 'bg-[#32D583]/10 text-[#32D583] border border-[#32D583]/20'
                              : tx.status === 'REVERSED'
                              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                              : 'bg-white/[0.04] text-[#98A2B3]'
                          }`}
                        >
                          {tx.status === 'SETTLED' && <Check className="w-2.5 h-2.5" />}
                          {tx.status}
                        </span>
                      </td>

                      {/* Timestamp */}
                      <td className="px-4 py-3.5 text-[11px] text-[#98A2B3]">
                        {formatDate(tx.createdAt)}
                      </td>

                      {/* Action */}
                      <td className="px-4 py-3.5 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedTx(tx);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-[#00CFFF] text-[11px] font-mono inline-flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          <span>Inspect</span>
                          <ChevronRight className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {pagination.totalPages > 1 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-white/[0.06] text-xs font-mono text-[#98A2B3]">
            <div>
              Showing page <span className="text-white font-bold">{pagination.page}</span> of{' '}
              <span className="text-white font-bold">{pagination.totalPages}</span> ({pagination.totalCount} total entries)
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setPagination((p) => ({ ...p, page: Math.max(1, p.page - 1) }))}
                disabled={pagination.page <= 1 || loading}
                className="px-3.5 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-white disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-all flex items-center gap-1"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Previous</span>
              </button>

              <button
                onClick={() => setPagination((p) => ({ ...p, page: Math.min(pagination.totalPages, p.page + 1) }))}
                disabled={pagination.page >= pagination.totalPages || loading}
                className="px-3.5 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-white disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-all flex items-center gap-1"
              >
                <span>Next</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 4. Audit Receipt Inspector Modal */}
      {selectedTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div
            className="relative w-full max-w-lg rounded-3xl bg-[#07101D] border border-white/[0.12] p-6 sm:p-8 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-white/[0.08]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#00CFFF]/10 border border-[#00CFFF]/20 flex items-center justify-center text-[#00CFFF]">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Financial Audit Receipt</h3>
                  <p className="text-xs text-[#98A2B3] font-mono">Immutable Double-Entry Ledger Record</p>
                </div>
              </div>

              <button
                onClick={() => setSelectedTx(null)}
                className="p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-[#98A2B3] hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Amount Hero */}
            <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/[0.06] text-center space-y-1">
              <div className="text-xs font-mono text-[#98A2B3] uppercase">Recorded Transaction Value</div>
              <div
                className={`text-3xl font-extrabold font-mono ${
                  selectedTx.entryType === 'CREDIT'
                    ? 'text-[#32D583]'
                    : selectedTx.entryType === 'DEBIT'
                    ? 'text-[#F04438]'
                    : 'text-amber-400'
                }`}
              >
                {selectedTx.entryType === 'CREDIT' ? '+' : selectedTx.entryType === 'DEBIT' ? '-' : '↺'}$
                {formatCurrency(selectedTx.amount)} {selectedTx.currency}
              </div>
              <div className="flex items-center justify-center gap-2 pt-2">
                {getEntryTypePill(selectedTx.entryType)}
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono bg-white/[0.04] text-white border border-white/[0.08]">
                  {selectedTx.status}
                </span>
              </div>
            </div>

            {/* Receipt Details Grid */}
            <div className="space-y-3 font-mono text-xs">
              {/* Public TXN ID */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                <span className="text-[#98A2B3]">Public TXN ID:</span>
                <div className="flex items-center gap-2">
                  <span className="text-white font-bold">{selectedTx.publicTxnId}</span>
                  <button
                    onClick={() => handleCopy(selectedTx.publicTxnId, 'txnId')}
                    className="p-1 rounded text-[#00CFFF] hover:bg-[#00CFFF]/10 transition-colors"
                    title="Copy Transaction ID"
                  >
                    {copiedField === 'txnId' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* Source Category */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                <span className="text-[#98A2B3]">Source Channel:</span>
                <span className="text-[#00CFFF] font-semibold">{getTransactionDisplayLabel(selectedTx.sourceType, selectedTx.entryType)}</span>
              </div>

              {/* Source Reference */}
              {selectedTx.sourceRef && (
                <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                  <span className="text-[#98A2B3]">Source Reference:</span>
                  <div className="flex items-center gap-2">
                    <span className="text-white truncate max-w-[180px]">{selectedTx.sourceRef}</span>
                    <button
                      onClick={() => handleCopy(selectedTx.sourceRef, 'sourceRef')}
                      className="p-1 rounded text-[#00CFFF] hover:bg-[#00CFFF]/10 transition-colors"
                      title="Copy Source Reference"
                    >
                      {copiedField === 'sourceRef' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              )}

              {/* Canonical Timestamp */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                <span className="text-[#98A2B3]">Settlement Time:</span>
                <span className="text-white text-[11px]">{formatDate(selectedTx.createdAt)}</span>
              </div>

              {/* ISO UTC Timestamp */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                <span className="text-[#98A2B3]">UTC Timestamp:</span>
                <span className="text-[#98A2B3] text-[10px]">{new Date(selectedTx.createdAt).toUTCString()}</span>
              </div>

              {/* Description */}
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] space-y-1">
                <span className="text-[#98A2B3] block">Ledger Description:</span>
                <p className="text-white text-xs">{getTransactionUserDescription(selectedTx)}</p>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="pt-2 flex items-center justify-end gap-3">
              <button
                onClick={() => setSelectedTx(null)}
                className="px-5 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-white text-xs font-semibold transition-colors cursor-pointer min-h-[44px]"
              >
                Close Receipt
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
