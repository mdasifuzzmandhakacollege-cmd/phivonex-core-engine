import React, { useState, useMemo } from 'react';
import {
  Activity,
  Server,
  TrendingUp,
  Clock,
  Sparkles,
  ChevronRight,
  Copy,
  Check,
  Layers,
  Award,
  ShieldCheck,
  X,
  RotateCcw,
  ArrowDownLeft,
  ArrowUpRight,
} from 'lucide-react';
import { getTransactionUserDescription } from '../../utils/transactionDisplay';

export interface ActivityEventItem {
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
  status: 'SETTLED' | 'REVERSED' | 'PENDING' | string;
  createdAt: string;
}

export type ActivityCategoryFilter =
  | 'ALL'
  | 'TRADING_YIELD'
  | 'VAULT_YIELD'
  | 'NODE_MINING'
  | 'UNILEVEL_ROYALTIES'
  | 'RANK_MILESTONES'
  | 'DEPOSITS_WITHDRAWALS';

interface RecentActivityLogProps {
  transactions?: ActivityEventItem[];
  onNavigateTab?: (tabKey: string) => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

const FILTER_PILLS: Array<{
  id: ActivityCategoryFilter;
  label: string;
  activeClass: string;
}> = [
  {
    id: 'ALL',
    label: 'All',
    activeClass: 'bg-[#00E5FF] text-[#050807] border-[#00E5FF]',
  },
  {
    id: 'TRADING_YIELD',
    label: 'Trading Yield',
    activeClass: 'bg-[#00E5FF]/20 text-[#00E5FF] border-[#00E5FF]/50',
  },
  {
    id: 'VAULT_YIELD',
    label: 'Vault Yield',
    activeClass: 'bg-[#F5B800]/20 text-[#F5B800] border-[#F5B800]/50',
  },
  {
    id: 'NODE_MINING',
    label: 'Node Mining',
    activeClass: 'bg-[#00E676]/20 text-[#00E676] border-[#00E676]/50',
  },
  {
    id: 'UNILEVEL_ROYALTIES',
    label: '16-Gen Royalties',
    activeClass: 'bg-[#00E5FF]/20 text-[#00E5FF] border-[#00E5FF]/50',
  },
  {
    id: 'RANK_MILESTONES',
    label: 'Rank Milestones',
    activeClass: 'bg-[#F5B800]/20 text-[#F5B800] border-[#F5B800]/50',
  },
  {
    id: 'DEPOSITS_WITHDRAWALS',
    label: 'Deposits & Withdrawals',
    activeClass: 'bg-white/15 text-white border-white/35',
  },
];

export const RecentActivityLog: React.FC<RecentActivityLogProps> = ({
  transactions = [],
  onNavigateTab,
  onRefresh,
  isRefreshing = false,
}) => {
  const [activeCategory, setActiveCategory] = useState<ActivityCategoryFilter>('ALL');
  const [selectedEvent, setSelectedEvent] = useState<ActivityEventItem | null>(null);
  const [copiedId, setCopiedId] = useState<boolean>(false);

  const getEventCategory = (tx: ActivityEventItem): ActivityCategoryFilter => {
    const st = (tx.sourceType || '').toUpperCase();
    if (st.includes('TRADING_POOL') || st.includes('QUANTUM_ALPHA')) return 'TRADING_YIELD';
    if (st.includes('CHRONO_VAULT')) return 'VAULT_YIELD';
    if (st === 'NODE_REWARD' || st === 'NODE_PURCHASE' || st.includes('GENESIS_NODE')) return 'NODE_MINING';
    if (st.includes('UNILEVEL_ROYALTY') || st === 'REFERRAL_COMMISSION') return 'UNILEVEL_ROYALTIES';
    if (st.includes('RANK') || st === 'PROMOTION_BONUS' || st === 'LEADERSHIP_RANK_REWARD') return 'RANK_MILESTONES';
    if (
      st.includes('DEPOSIT') ||
      st.includes('WITHDRAWAL') ||
      st === 'COIN_SWAP' ||
      st.includes('SWAP') ||
      st.includes('REDEMPTION')
    ) {
      return 'DEPOSITS_WITHDRAWALS';
    }
    return 'ALL';
  };

  const filteredEvents = useMemo(() => {
    if (activeCategory === 'ALL') return transactions;
    return transactions.filter((tx) => getEventCategory(tx) === activeCategory);
  }, [transactions, activeCategory]);

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

  const formatAmount = (val: number, currency?: string) => {
    const isPhivo = (currency || '').toUpperCase() === 'PHIVO';
    const formatted = Number(val || 0).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: isPhivo ? 4 : 2,
    });
    return isPhivo ? `${formatted} PHIVO` : `$${formatted} ${currency || 'USDT'}`;
  };

  const handleCopyPublicId = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const getEventBadgeConfig = (tx: ActivityEventItem) => {
    const st = (tx.sourceType || '').toUpperCase();
    if (st.includes('TRADING_POOL') || st.includes('QUANTUM_ALPHA')) {
      return {
        label: 'Trading Yield',
        bgColor: 'bg-[#00E5FF]/10',
        borderColor: 'border-[#00E5FF]/30',
        textColor: 'text-[#00E5FF]',
        icon: TrendingUp,
      };
    }
    if (st.includes('CHRONO_VAULT')) {
      return {
        label: 'Vault Yield',
        bgColor: 'bg-[#F5B800]/10',
        borderColor: 'border-[#F5B800]/30',
        textColor: 'text-[#F5B800]',
        icon: Clock,
      };
    }
    if (st === 'NODE_PURCHASE') {
      return {
        label: 'Node Activated',
        bgColor: 'bg-[#00E676]/10',
        borderColor: 'border-[#00E676]/30',
        textColor: 'text-[#00E676]',
        icon: Server,
      };
    }
    if (st === 'NODE_REWARD' || st.includes('GENESIS_NODE')) {
      return {
        label: 'Node Mining',
        bgColor: 'bg-[#00E676]/10',
        borderColor: 'border-[#00E676]/30',
        textColor: 'text-[#00E676]',
        icon: Sparkles,
      };
    }
    if (st.includes('UNILEVEL_ROYALTY') || st === 'REFERRAL_COMMISSION') {
      return {
        label: '16-Gen Royalty',
        bgColor: 'bg-[#00E5FF]/10',
        borderColor: 'border-[#00E5FF]/30',
        textColor: 'text-[#00E5FF]',
        icon: Layers,
      };
    }
    if (st.includes('RANK') || st === 'PROMOTION_BONUS') {
      return {
        label: 'Rank Milestone',
        bgColor: 'bg-[#F5B800]/10',
        borderColor: 'border-[#F5B800]/30',
        textColor: 'text-[#F5B800]',
        icon: Award,
      };
    }
    if (st.includes('DEPOSIT')) {
      return {
        label: 'Deposit',
        bgColor: 'bg-[#00E676]/10',
        borderColor: 'border-[#00E676]/30',
        textColor: 'text-[#00E676]',
        icon: ArrowDownLeft,
      };
    }
    if (st.includes('WITHDRAWAL')) {
      return {
        label: 'Withdrawal',
        bgColor: 'bg-white/[0.06]',
        borderColor: 'border-white/[0.15]',
        textColor: 'text-white',
        icon: ArrowUpRight,
      };
    }
    if (st.includes('SWAP')) {
      return {
        label: 'PHIVO Swap',
        bgColor: 'bg-[#F5B800]/10',
        borderColor: 'border-[#F5B800]/30',
        textColor: 'text-[#F5B800]',
        icon: RotateCcw,
      };
    }
    return {
      label: tx.entryType === 'CREDIT' ? 'Settlement Credit' : 'Settlement',
      bgColor: 'bg-white/[0.04]',
      borderColor: 'border-white/[0.1]',
      textColor: 'text-white',
      icon: Activity,
    };
  };

  return (
    <section
      aria-label="Real-Time Activity Log"
      className="w-full max-w-full min-w-0 p-4 sm:p-6 rounded-[24px] oneui-glass-card space-y-4"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/[0.07] pb-3.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-2xl bg-[#00E5FF]/10 border border-[#00E5FF]/25 flex items-center justify-center text-[#00E5FF] shrink-0">
            <Activity className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm sm:text-base font-bold text-white tracking-tight">
                Real-Time Activity Log
              </h3>
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#00E676]/10 border border-[#00E676]/30 text-[#00E676]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#00E676] animate-pulse" />
                <span>LIVE</span>
              </span>
            </div>
            <p className="text-[11px] text-[#98A2B3] mt-0.5 truncate">
              Trading pool yields, vault settlements, node mining, and 16-Gen royalties.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={isRefreshing}
              className="min-h-[38px] min-w-[38px] rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.1] text-[#98A2B3] hover:text-white flex items-center justify-center transition-all cursor-pointer active:scale-95"
              title="Refresh activity log"
              aria-label="Refresh activity log"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-[#00E5FF]' : ''}`} />
            </button>
          )}

          {onNavigateTab && (
            <button
              type="button"
              onClick={() => onNavigateTab('wallet')}
              className="min-h-[38px] text-xs text-[#00E5FF] hover:text-white font-semibold flex items-center gap-1 cursor-pointer transition-colors px-3 py-1.5 rounded-xl bg-[#00E5FF]/10 border border-[#00E5FF]/25"
            >
              <span>Full Ledger</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Category Filter Pills (Horizontal Scroll Safe on 360px) */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none -mx-1 px-1">
        {FILTER_PILLS.map((pill) => {
          const isSelected = activeCategory === pill.id;
          return (
            <button
              key={pill.id}
              type="button"
              onClick={() => setActiveCategory(pill.id)}
              className={`min-h-[36px] px-3 py-1.5 rounded-full border text-[11px] font-semibold whitespace-nowrap transition-all cursor-pointer shrink-0 active:scale-95 ${
                isSelected
                  ? pill.activeClass
                  : 'bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.08] text-[#98A2B3] hover:text-white'
              }`}
            >
              {pill.label}
            </button>
          );
        })}
      </div>

      {/* Activity Feed */}
      {filteredEvents.length === 0 ? (
        <div className="py-10 px-4 text-center space-y-2 rounded-2xl bg-black/30 border border-white/[0.06]">
          <div className="w-10 h-10 rounded-full bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mx-auto text-[#00E5FF]">
            <Clock className="w-5 h-5" />
          </div>
          <p className="text-xs font-semibold text-white">No settled activity in this category yet.</p>
          <p className="text-[11px] text-[#98A2B3] max-w-sm mx-auto">
            {activeCategory === 'TRADING_YIELD'
              ? 'Allocate USDT into Quantum Alpha™ to receive automated Mon–Fri trading yields.'
              : activeCategory === 'VAULT_YIELD'
              ? 'Open a Chrono Vault™ fixed-term stake to track daily USDT vault settlements.'
              : activeCategory === 'NODE_MINING'
              ? 'Activate a Genesis Core™ validator node to emit daily PHIVO coins.'
              : activeCategory === 'UNILEVEL_ROYALTIES'
              ? 'Grow your 16-Generation Unilevel partner network to earn asset-matched royalties.'
              : 'Settled deposits, yields, swaps, and withdrawals appear here in real time.'}
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
                className="p-3 sm:p-3.5 rounded-2xl bg-black/30 hover:bg-white/[0.05] border border-white/[0.06] hover:border-[#00E5FF]/30 transition-all duration-150 flex items-center justify-between gap-2.5 cursor-pointer group min-w-0"
              >
                <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
                  <div
                    className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${badge.bgColor} ${badge.borderColor} ${badge.textColor}`}
                  >
                    <BadgeIcon className="w-4 h-4" />
                  </div>

                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-bold text-white group-hover:text-[#00E5FF] transition-colors truncate">
                        {userDesc}
                      </span>
                      <span
                        className={`hidden sm:inline-flex px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold border shrink-0 ${badge.bgColor} ${badge.borderColor} ${badge.textColor}`}
                      >
                        {badge.label}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-[10px] text-[#98A2B3] font-mono min-w-0">
                      <span className="shrink-0">{relTime}</span>
                      <span>•</span>
                      <span className="truncate">{tx.publicTxnId || tx.sourceRef}</span>
                    </div>
                  </div>
                </div>

                <div className="text-right shrink-0 space-y-0.5 pl-1">
                  <div className="text-xs sm:text-sm font-mono font-bold tabular-nums whitespace-nowrap">
                    <span className={isCredit ? 'text-[#00E676]' : 'text-white'}>
                      {isCredit ? '+' : '-'}
                      {formatAmount(tx.amount, tx.currency)}
                    </span>
                  </div>
                  <div className="text-[10px] font-mono text-[#00E676]/90 uppercase">
                    {tx.status || 'SETTLED'}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Event Detail Modal */}
      {selectedEvent && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn"
          onClick={() => setSelectedEvent(null)}
        >
          <div
            className="w-full max-w-md rounded-[28px] bg-[#0B1210] border border-white/[0.14] shadow-2xl p-5 sm:p-6 space-y-4 relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3.5">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-2xl bg-[#00E5FF]/10 border border-[#00E5FF]/30 flex items-center justify-center text-[#00E5FF] shrink-0">
                  <Activity className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h4 className="text-sm font-bold text-white truncate">Settlement Receipt</h4>
                  <p className="text-[11px] text-[#98A2B3] font-mono truncate">
                    {selectedEvent.publicTxnId || selectedEvent.id}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedEvent(null)}
                className="w-9 h-9 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.1] flex items-center justify-center text-[#98A2B3] hover:text-white cursor-pointer shrink-0"
                aria-label="Close receipt"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 rounded-2xl bg-black/40 border border-white/[0.07] space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#98A2B3]">Status</span>
                <span className="font-mono text-[#00E676] flex items-center gap-1 font-semibold">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Verified Settled</span>
                </span>
              </div>
              <div className="text-sm font-bold text-white">
                {getTransactionUserDescription(selectedEvent)}
              </div>
              <div className="text-2xl font-mono font-extrabold text-[#00E676] tabular-nums">
                {selectedEvent.entryType === 'CREDIT' ? '+' : '-'}
                {formatAmount(selectedEvent.amount, selectedEvent.currency)}
              </div>
            </div>

            <div className="space-y-2 text-xs font-mono">
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-between gap-2">
                <span className="text-[#98A2B3] font-sans">Reference ID</span>
                <div className="flex items-center gap-1.5 text-white font-bold min-w-0">
                  <span className="truncate">{selectedEvent.publicTxnId}</span>
                  <button
                    type="button"
                    onClick={() => handleCopyPublicId(selectedEvent.publicTxnId)}
                    className="p-1 hover:text-[#00E5FF] cursor-pointer shrink-0"
                    aria-label="Copy Reference ID"
                  >
                    {copiedId ? <Check className="w-3.5 h-3.5 text-[#00E676]" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-between gap-2">
                <span className="text-[#98A2B3] font-sans">Settled Time</span>
                <span className="text-white font-semibold">
                  {new Date(selectedEvent.createdAt).toLocaleString()}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setSelectedEvent(null)}
              className="w-full min-h-[44px] py-2.5 rounded-2xl bg-[#00E5FF] hover:bg-[#00E5FF]/90 text-[#050807] font-bold text-xs transition-colors cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </section>
  );
};
