import React, { useState, useMemo } from 'react';
import {
  Activity,
  Server,
  Zap,
  Coins,
  Users,
  GitFork,
  ArrowDownLeft,
  ArrowUpRight,
  RotateCcw,
  CheckCircle2,
  Clock,
  Sparkles,
  ChevronRight,
  Copy,
  Check,
  Search,
  Filter,
  Layers,
  Award,
  ShieldCheck,
  X,
  ExternalLink,
} from 'lucide-react';
import { PhivoCoinIcon, UsdtIcon } from '../brand/CryptoIcons';
import { getTransactionUserDescription } from '../../utils/transactionDisplay';

export interface ActivityEventItem {
  id: string;
  publicTxnId: string;
  userId: string;
  entryType: 'CREDIT' | 'DEBIT' | 'REVERSAL';
  sourceType:
    | 'REFERRAL_COMMISSION'
    | 'MATCHING_BONUS'
    | 'PROMOTION_BONUS'
    | 'NODE_REWARD'
    | 'NODE_PURCHASE'
    | 'BLOCKCHAIN_DEPOSIT'
    | 'COIN_SWAP'
    | 'WITHDRAWAL'
    | string;
  sourceId: string;
  sourceRef: string;
  description: string;
  amount: number;
  currency: string;
  status: 'SETTLED' | 'REVERSED' | 'PENDING' | string;
  createdAt: string;
}

export type ActivityCategoryFilter =
  | 'ALL'
  | 'NODE_ACTIVATION'
  | 'REWARDS_CLAIMED'
  | 'REFERRAL'
  | 'MATCHING'
  | 'DEPOSIT_SWAP';

interface RecentActivityLogProps {
  transactions?: ActivityEventItem[];
  onNavigateTab?: (tabKey: string) => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export const RecentActivityLog: React.FC<RecentActivityLogProps> = ({
  transactions = [],
  onNavigateTab,
  onRefresh,
  isRefreshing = false,
}) => {
  const [activeCategory, setActiveCategory] = useState<ActivityCategoryFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedEvent, setSelectedEvent] = useState<ActivityEventItem | null>(null);
  const [copiedId, setCopiedId] = useState<boolean>(false);

  // Classify event into rich display category
  const getEventCategory = (tx: ActivityEventItem): ActivityCategoryFilter => {
    const st = (tx.sourceType || '').toUpperCase();
    if (st === 'NODE_PURCHASE') return 'NODE_ACTIVATION';
    if (st === 'NODE_REWARD') return 'REWARDS_CLAIMED';
    if (st === 'REFERRAL_COMMISSION') return 'REFERRAL';
    if (st === 'MATCHING_BONUS' || st === 'PROMOTION_BONUS') return 'MATCHING';
    if (st === 'BLOCKCHAIN_DEPOSIT' || st === 'COIN_SWAP' || st === 'WITHDRAWAL') return 'DEPOSIT_SWAP';
    return 'ALL';
  };

  // Filtered Activity List
  const filteredEvents = useMemo(() => {
    return transactions.filter((tx) => {
      if (activeCategory !== 'ALL') {
        const cat = getEventCategory(tx);
        if (cat !== activeCategory) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const desc = (tx.description || '').toLowerCase();
        const ref = (tx.sourceRef || '').toLowerCase();
        const txId = (tx.publicTxnId || '').toLowerCase();
        const userDesc = getTransactionUserDescription(tx).toLowerCase();
        return desc.includes(q) || ref.includes(q) || txId.includes(q) || userDesc.includes(q);
      }
      return true;
    });
  }, [transactions, activeCategory, searchQuery]);

  // Relative Time Helper (e.g., '2 mins ago', '1 hour ago', 'Just now')
  const getRelativeTime = (isoDateStr: string) => {
    if (!isoDateStr) return 'Recently';
    const date = new Date(isoDateStr);
    if (isNaN(date.getTime())) return 'Recently';

    const diffSeconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (diffSeconds < 30) return 'Just now';
    if (diffSeconds < 60) return `${diffSeconds}s ago`;
    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 30) return `${diffDays}d ago`;

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  const formatCurrency = (val: number, minimumFractionDigits = 2) => {
    return Number(val || 0).toLocaleString('en-US', {
      minimumFractionDigits,
      maximumFractionDigits: 2,
    });
  };

  const handleCopyPublicId = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  // Get visual badge & icon configs per event type
  const getEventBadgeConfig = (tx: ActivityEventItem) => {
    const st = (tx.sourceType || '').toUpperCase();
    switch (st) {
      case 'NODE_PURCHASE':
        return {
          label: 'Node Activation',
          bgColor: 'bg-[#32D583]/10',
          borderColor: 'border-[#32D583]/30',
          textColor: 'text-[#32D583]',
          icon: Server,
        };
      case 'NODE_REWARD':
        return {
          label: 'Mining Reward',
          bgColor: 'bg-[#00CFFF]/10',
          borderColor: 'border-[#00CFFF]/30',
          textColor: 'text-[#00CFFF]',
          icon: Sparkles,
        };
      case 'REFERRAL_COMMISSION':
        return {
          label: 'Direct Referral ($50)',
          bgColor: 'bg-[#168BFF]/10',
          borderColor: 'border-[#168BFF]/30',
          textColor: 'text-[#168BFF]',
          icon: Zap,
        };
      case 'MATCHING_BONUS':
        return {
          label: 'Binary Matching',
          bgColor: 'bg-[#32D583]/10',
          borderColor: 'border-[#32D583]/30',
          textColor: 'text-[#32D583]',
          icon: GitFork,
        };
      case 'PROMOTION_BONUS':
        return {
          label: 'Rank Milestone',
          bgColor: 'bg-[#F59E0B]/10',
          borderColor: 'border-[#F59E0B]/30',
          textColor: 'text-[#F59E0B]',
          icon: Award,
        };
      case 'BLOCKCHAIN_DEPOSIT':
        return {
          label: 'Deposit Credited',
          bgColor: 'bg-[#32D583]/10',
          borderColor: 'border-[#32D583]/30',
          textColor: 'text-[#32D583]',
          icon: ArrowDownLeft,
        };
      case 'COIN_SWAP':
        return {
          label: 'Coin Swap',
          bgColor: 'bg-[#F59E0B]/10',
          borderColor: 'border-[#F59E0B]/30',
          textColor: 'text-[#F59E0B]',
          icon: RotateCcw,
        };
      default:
        return {
          label: tx.entryType === 'CREDIT' ? 'Credit Received' : 'Transaction',
          bgColor: 'bg-white/[0.04]',
          borderColor: 'border-white/[0.08]',
          textColor: 'text-white',
          icon: Activity,
        };
    }
  };

  return (
    <div className="p-5 sm:p-6 rounded-2xl bg-[#07101D] border border-white/[0.08] shadow-xl space-y-4">
      {/* 1. Component Header with Live Protocol Pulse */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/[0.06] pb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-[#00CFFF]/10 border border-[#00CFFF]/25 flex items-center justify-center text-[#00CFFF]">
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white tracking-wide">Real-Time Recent Activity Log</h3>
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#32D583]/10 border border-[#32D583]/25 text-[#32D583]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#32D583] animate-pulse" />
                <span>LIVE SYNC</span>
              </span>
            </div>
            <p className="text-[11px] text-[#98A2B3] mt-0.5">
              Live protocol telemetry for node activations, mining rewards, and direct referral commissions.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={isRefreshing}
              className="p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-[#98A2B3] hover:text-white transition-all cursor-pointer"
              title="Refresh Activity Log"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-[#00CFFF]' : ''}`} />
            </button>
          )}

          {onNavigateTab && (
            <button
              type="button"
              onClick={() => onNavigateTab('wallet')}
              className="text-xs text-[#00CFFF] hover:text-white font-medium flex items-center gap-1 cursor-pointer transition-colors px-2.5 py-1.5 rounded-xl bg-[#00CFFF]/10 border border-[#00CFFF]/20"
            >
              <span>Full Ledger</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* 2. Category Filter Bar */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
        <button
          type="button"
          onClick={() => setActiveCategory('ALL')}
          className={`px-3 py-1.5 rounded-xl font-medium whitespace-nowrap transition-all cursor-pointer ${
            activeCategory === 'ALL'
              ? 'bg-[#00CFFF] text-[#05070B] font-bold shadow-md shadow-[#00CFFF]/20'
              : 'bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] text-[#98A2B3]'
          }`}
        >
          All Activity ({transactions.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveCategory('NODE_ACTIVATION')}
          className={`px-3 py-1.5 rounded-xl font-medium whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
            activeCategory === 'NODE_ACTIVATION'
              ? 'bg-[#32D583] text-black font-bold shadow-md shadow-[#32D583]/20'
              : 'bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] text-[#98A2B3]'
          }`}
        >
          <Server className="w-3.5 h-3.5" />
          <span>Node Activations</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveCategory('REWARDS_CLAIMED')}
          className={`px-3 py-1.5 rounded-xl font-medium whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
            activeCategory === 'REWARDS_CLAIMED'
              ? 'bg-[#00CFFF] text-black font-bold shadow-md shadow-[#00CFFF]/20'
              : 'bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] text-[#98A2B3]'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Mining Rewards</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveCategory('REFERRAL')}
          className={`px-3 py-1.5 rounded-xl font-medium whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
            activeCategory === 'REFERRAL'
              ? 'bg-[#168BFF] text-white font-bold shadow-md shadow-[#168BFF]/20'
              : 'bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] text-[#98A2B3]'
          }`}
        >
          <Zap className="w-3.5 h-3.5" />
          <span>Referral ($50)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveCategory('MATCHING')}
          className={`px-3 py-1.5 rounded-xl font-medium whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
            activeCategory === 'MATCHING'
              ? 'bg-[#32D583] text-black font-bold shadow-md shadow-[#32D583]/20'
              : 'bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] text-[#98A2B3]'
          }`}
        >
          <GitFork className="w-3.5 h-3.5" />
          <span>Matching & Rank</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveCategory('DEPOSIT_SWAP')}
          className={`px-3 py-1.5 rounded-xl font-medium whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
            activeCategory === 'DEPOSIT_SWAP'
              ? 'bg-[#F59E0B] text-black font-bold shadow-md shadow-[#F59E0B]/20'
              : 'bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] text-[#98A2B3]'
          }`}
        >
          <ArrowDownLeft className="w-3.5 h-3.5" />
          <span>Deposits & Swaps</span>
        </button>
      </div>

      {/* 3. Event List Visualization */}
      {filteredEvents.length === 0 ? (
        <div className="py-10 text-center space-y-2.5 rounded-xl bg-[#050B14]/60 border border-white/[0.04]">
          <div className="w-10 h-10 rounded-full bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mx-auto text-[#98A2B3]">
            <Clock className="w-5 h-5 text-[#00CFFF]" />
          </div>
          <p className="text-xs font-semibold text-white">No activity logged for this filter category.</p>
          <p className="text-[11px] text-[#98A2B3]">
            {activeCategory === 'REFERRAL'
              ? 'Sponsor new team members to trigger $50 direct referral spot commissions.'
              : activeCategory === 'NODE_ACTIVATION'
              ? 'Activate Genesis Nodes to begin daily PHIVO mining emission.'
              : 'Protocol events will appear here in real-time as transactions settle.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredEvents.slice(0, 8).map((tx) => {
            const badge = getEventBadgeConfig(tx);
            const BadgeIcon = badge.icon;
            const isCredit = tx.entryType === 'CREDIT';
            const userDesc = getTransactionUserDescription(tx);
            const relTime = getRelativeTime(tx.createdAt);

            return (
              <div
                key={tx.id}
                onClick={() => setSelectedEvent(tx)}
                className="p-3.5 rounded-xl bg-[#050B14]/80 hover:bg-[#081222] border border-white/[0.05] hover:border-[#00CFFF]/30 transition-all duration-150 flex items-center justify-between gap-3 cursor-pointer group"
              >
                {/* Left: Event Icon + Title */}
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 transition-transform group-hover:scale-105 ${badge.bgColor} ${badge.borderColor} ${badge.textColor}`}
                  >
                    <BadgeIcon className="w-4.5 h-4.5" />
                  </div>

                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white group-hover:text-[#00CFFF] transition-colors truncate">
                        {userDesc}
                      </span>
                      <span
                        className={`hidden sm:inline-flex px-2 py-0.5 rounded text-[10px] font-mono font-semibold border ${badge.bgColor} ${badge.borderColor} ${badge.textColor}`}
                      >
                        {badge.label}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-[10px] text-[#98A2B3] font-mono">
                      <span>{relTime}</span>
                      <span>•</span>
                      <span className="truncate">{tx.sourceRef || tx.publicTxnId}</span>
                    </div>
                  </div>
                </div>

                {/* Right: Amount & Status Badge */}
                <div className="text-right shrink-0 space-y-0.5">
                  <div className="text-xs sm:text-sm font-mono font-bold tabular-nums">
                    <span className={isCredit ? 'text-[#32D583]' : 'text-white'}>
                      {isCredit ? '+' : '-'}${formatCurrency(tx.amount)} {tx.currency || 'USD'}
                    </span>
                  </div>

                  <div className="flex items-center justify-end gap-1 text-[10px] font-mono text-[#32D583]">
                    <CheckCircle2 className="w-3 h-3 text-[#32D583]" />
                    <span>{tx.status || 'SETTLED'}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 4. Interactive Detail Modal / Drawer */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
          <div
            className="w-full max-w-lg rounded-2xl bg-[#07101D] border border-white/[0.12] shadow-2xl p-6 space-y-5 relative"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#00CFFF]/10 border border-[#00CFFF]/30 flex items-center justify-center text-[#00CFFF]">
                  <Activity className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">Protocol Event Telemetry</h4>
                  <p className="text-[11px] text-[#98A2B3] font-mono">
                    Ref: {selectedEvent.publicTxnId || selectedEvent.id}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedEvent(null)}
                className="w-8 h-8 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] flex items-center justify-center text-[#98A2B3] hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Event Overview */}
            <div className="p-4 rounded-xl bg-[#050B14] border border-white/[0.06] space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#98A2B3]">Event Description</span>
                <span className="text-xs font-mono text-[#32D583] flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Verified Settled</span>
                </span>
              </div>
              <div className="text-sm font-bold text-white">
                {getTransactionUserDescription(selectedEvent)}
              </div>
              <div className="text-2xl font-mono font-extrabold text-[#32D583]">
                ${formatCurrency(selectedEvent.amount)} {selectedEvent.currency || 'USD'}
              </div>
            </div>

            {/* Technical Detail Grid */}
            <div className="space-y-2.5 text-xs font-mono">
              <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.04] flex items-center justify-between">
                <span className="text-[#98A2B3] font-sans">Public Transaction ID</span>
                <div className="flex items-center gap-1.5 text-white font-bold">
                  <span>{selectedEvent.publicTxnId}</span>
                  <button
                    type="button"
                    onClick={() => handleCopyPublicId(selectedEvent.publicTxnId)}
                    className="p-1 hover:text-[#00CFFF] transition-colors cursor-pointer"
                  >
                    {copiedId ? <Check className="w-3.5 h-3.5 text-[#32D583]" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.04] flex items-center justify-between">
                <span className="text-[#98A2B3] font-sans">Source Reference</span>
                <span className="text-[#00CFFF] font-bold">{selectedEvent.sourceRef || 'GENESIS_PROTOCOL'}</span>
              </div>

              <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.04] flex items-center justify-between">
                <span className="text-[#98A2B3] font-sans">Category / Channel</span>
                <span className="text-white font-bold uppercase">{selectedEvent.sourceType}</span>
              </div>

              <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.04] flex items-center justify-between">
                <span className="text-[#98A2B3] font-sans">Settled Timestamp</span>
                <span className="text-white font-bold">{new Date(selectedEvent.createdAt).toLocaleString()}</span>
              </div>
            </div>

            {/* Footer Action */}
            <button
              type="button"
              onClick={() => setSelectedEvent(null)}
              className="w-full py-2.5 rounded-xl bg-[#00CFFF] hover:bg-[#00CFFF]/90 text-black font-bold text-xs transition-colors cursor-pointer shadow-md shadow-[#00CFFF]/20"
            >
              Close Event Telemetry
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
