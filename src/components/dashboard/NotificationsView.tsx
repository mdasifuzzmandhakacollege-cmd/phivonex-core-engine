import React, { useState, useEffect } from 'react';
import {
  Bell,
  CheckCheck,
  Check,
  Server,
  Users,
  GitFork,
  Coins,
  ArrowLeftRight,
  ArrowDownLeft,
  ArrowUpRight,
  ShieldAlert,
  Clock,
  RefreshCw,
  Inbox,
  AlertCircle,
  Trash2,
  Volume2,
  VolumeX,
  Radio,
  CheckCircle2,
  BellRing,
  Loader2,
} from 'lucide-react';
import { UserProfile } from '../../context/AuthContext';
import { useNotifications, AppNotification } from '../../context/NotificationContext';
import { DashboardTab } from './Sidebar';
import {
  checkPushSupport,
  requestPushPermissionAndToken,
} from '../../services/webPushService';

interface NotificationsViewProps {
  user: UserProfile;
  onNavigateTab?: (tab: DashboardTab) => void;
}

type CategoryFilter = 'ALL' | 'YIELDS_ROYALTIES' | 'WALLET_SECURITY' | 'SYSTEM';

export const NotificationsView: React.FC<NotificationsViewProps> = ({ user: _user, onNavigateTab }) => {
  const {
    notifications,
    unreadCount,
    loading,
    refreshing,
    error,
    unreadOnly,
    audioEnabled,
    toggleAudio,
    setFilterType,
    setUnreadOnly,
    refreshNotifications,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearReadNotifications,
  } = useNotifications();

  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('ALL');
  const [markingAllRead, setMarkingAllRead] = useState(false);

  const [pushSupported, setPushSupported] = useState<boolean>(true);
  const [pushPermission, setPushPermission] = useState<NotificationPermission>('default');
  const [pushLoading, setPushLoading] = useState<boolean>(false);
  const [pushFeedback, setPushFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Ensure server-side filter stays 'ALL' so our 4 clean One UI 9.5 categories work smoothly client-side
  useEffect(() => {
    setFilterType('ALL');
  }, [setFilterType]);

  useEffect(() => {
    checkPushSupport().then((supported) => {
      setPushSupported(supported);
      if (typeof window !== 'undefined' && 'Notification' in window) {
        setPushPermission(Notification.permission);
      }
    });

    fetch('/api/notifications/push-status', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .catch(() => null);
  }, []);

  const handleEnablePush = async () => {
    try {
      setPushLoading(true);
      setPushFeedback(null);
      const res = await requestPushPermissionAndToken();
      if (res.success) {
        setPushPermission('granted');
        setPushFeedback({
          type: 'success',
          message: 'Real-time alerts activated for deposits, yields, royalties, and security events.',
        });
      } else {
        if (typeof window !== 'undefined' && 'Notification' in window) {
          setPushPermission(Notification.permission);
        }
        setPushFeedback({
          type: 'error',
          message: res.error || 'Unable to enable browser notifications.',
        });
      }
    } finally {
      setPushLoading(false);
    }
  };

  const handleMarkAllAsRead = async () => {
    if (unreadCount === 0 || markingAllRead) return;
    setMarkingAllRead(true);
    try {
      await markAllAsRead();
    } finally {
      setMarkingAllRead(false);
    }
  };

  const getCategoryForType = (type: AppNotification['type']): CategoryFilter => {
    switch (type) {
      case 'REFERRAL_EARNED':
      case 'MATCHING_EARNED':
      case 'PROMOTION_EARNED':
      case 'PHIVO_REWARD':
        return 'YIELDS_ROYALTIES';
      case 'PHIVO_SWAP_COMPLETED':
      case 'USDT_DEPOSIT_CONFIRMED':
      case 'WITHDRAWAL_STATUS':
      case 'SECURITY_ALERT':
        return 'WALLET_SECURITY';
      case 'NODE_ACTIVATED':
      default:
        return 'SYSTEM';
    }
  };

  const getTypeMeta = (type: AppNotification['type']) => {
    switch (type) {
      case 'NODE_ACTIVATED':
        return {
          icon: Server,
          color: 'text-[#00E5FF]',
          bg: 'bg-[#00E5FF]/12 border-[#00E5FF]/30',
          badgeText: 'Genesis Node',
          destTab: 'products' as DashboardTab,
        };
      case 'REFERRAL_EARNED':
        return {
          icon: Users,
          color: 'text-[#00E676]',
          bg: 'bg-[#00E676]/12 border-[#00E676]/30',
          badgeText: '16-Gen Royalty',
          destTab: 'network' as DashboardTab,
        };
      case 'MATCHING_EARNED':
        return {
          icon: GitFork,
          color: 'text-[#00E5FF]',
          bg: 'bg-[#00E5FF]/12 border-[#00E5FF]/30',
          badgeText: 'Yield Settlement',
          destTab: 'reward-analytics' as DashboardTab,
        };
      case 'PROMOTION_EARNED':
        return {
          icon: CheckCheck,
          color: 'text-[#F5B800]',
          bg: 'bg-[#F5B800]/12 border-[#F5B800]/30',
          badgeText: 'Rank Milestone',
          destTab: 'network' as DashboardTab,
        };
      case 'PHIVO_REWARD':
        return {
          icon: Coins,
          color: 'text-[#00E676]',
          bg: 'bg-[#00E676]/12 border-[#00E676]/30',
          badgeText: 'PHIVO Emission',
          destTab: 'reward-analytics' as DashboardTab,
        };
      case 'PHIVO_SWAP_COMPLETED':
        return {
          icon: ArrowLeftRight,
          color: 'text-[#00E5FF]',
          bg: 'bg-[#00E5FF]/12 border-[#00E5FF]/30',
          badgeText: 'PHIVO Swap',
          destTab: 'wallet' as DashboardTab,
        };
      case 'USDT_DEPOSIT_CONFIRMED':
        return {
          icon: ArrowDownLeft,
          color: 'text-[#00E676]',
          bg: 'bg-[#00E676]/12 border-[#00E676]/30',
          badgeText: 'BEP-20 Deposit',
          destTab: 'deposit' as DashboardTab,
        };
      case 'WITHDRAWAL_STATUS':
        return {
          icon: ArrowUpRight,
          color: 'text-[#F5B800]',
          bg: 'bg-[#F5B800]/12 border-[#F5B800]/30',
          badgeText: 'Withdrawal',
          destTab: 'withdrawals' as DashboardTab,
        };
      case 'SECURITY_ALERT':
        return {
          icon: ShieldAlert,
          color: 'text-[#FF4D4F]',
          bg: 'bg-[#FF4D4F]/12 border-[#FF4D4F]/30',
          badgeText: 'Security Alert',
          destTab: 'security' as DashboardTab,
        };
      default:
        return {
          icon: Bell,
          color: 'text-slate-300',
          bg: 'bg-white/[0.06] border-white/[0.12]',
          badgeText: 'System Notice',
          destTab: 'overview' as DashboardTab,
        };
    }
  };

  const formatRelativeTime = (isoString: string) => {
    try {
      const diffMs = Date.now() - new Date(isoString).getTime();
      const diffSec = Math.floor(diffMs / 1000);
      if (diffSec < 60) return 'just now';
      const diffMin = Math.floor(diffSec / 60);
      if (diffMin < 60) return `${diffMin}m ago`;
      const diffHrs = Math.floor(diffMin / 60);
      if (diffHrs < 24) return `${diffHrs}h ago`;
      const diffDays = Math.floor(diffHrs / 24);
      return `${diffDays}d ago`;
    } catch {
      return '';
    }
  };

  const visibleNotifications = notifications.filter((n) => {
    if (categoryFilter === 'ALL') return true;
    return getCategoryForType(n.type) === categoryFilter;
  });

  const CATEGORY_PILLS: { id: CategoryFilter; label: string }[] = [
    { id: 'ALL', label: 'All' },
    { id: 'YIELDS_ROYALTIES', label: 'Yields & Royalties' },
    { id: 'WALLET_SECURITY', label: 'Wallet & Security' },
    { id: 'SYSTEM', label: 'System' },
  ];

  return (
    <div className="space-y-6 animate-fadeIn pb-10 min-w-0 max-w-full overflow-x-hidden">
      {/* 1. ONE UI 9.5 ALERT CENTER HEADER */}
      <div className="oneui-glass-card rounded-[24px] p-5 sm:p-7 relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-14 -mr-14 w-72 h-72 bg-[#00E5FF]/[0.07] rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-[#00E5FF]/12 border border-[#00E5FF]/30 flex items-center justify-center text-[#00E5FF] shrink-0">
              <Bell className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
                  Alert Center
                </h1>
                {unreadCount > 0 && (
                  <span className="px-2.5 py-0.5 rounded-full bg-[#00E5FF]/15 border border-[#00E5FF]/35 text-[#00E5FF] text-xs font-mono font-bold">
                    {unreadCount} unread
                  </span>
                )}
              </div>
              <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
                Real-time notifications across daily yields, 16-generation royalties, wallet transfers, and security events.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => toggleAudio()}
              className={`py-2 px-3 rounded-2xl border text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer min-h-[40px] active:scale-95 ${
                audioEnabled
                  ? 'bg-[#00E5FF]/12 border-[#00E5FF]/30 text-[#00E5FF]'
                  : 'bg-white/[0.05] border-white/[0.1] text-slate-400 hover:text-white'
              }`}
            >
              {audioEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              <span>{audioEnabled ? 'Audio On' : 'Muted'}</span>
            </button>

            <button
              type="button"
              onClick={() => refreshNotifications()}
              disabled={refreshing}
              className="p-2.5 rounded-2xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.1] text-slate-300 hover:text-white transition-all cursor-pointer min-h-[40px] min-w-[40px] flex items-center justify-center disabled:opacity-50 active:scale-95"
              title="Refresh notifications"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-[#00E5FF]' : ''}`} />
            </button>

            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllAsRead}
                disabled={markingAllRead}
                className="py-2 px-3.5 rounded-2xl bg-[#00E5FF] hover:bg-[#00E5FF]/90 text-[#050807] text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer min-h-[40px] disabled:opacity-50 active:scale-95"
              >
                <CheckCheck className="w-4 h-4" />
                <span>Mark All as Read</span>
              </button>
            )}

            {notifications.some((n) => n.readAt) && (
              <button
                type="button"
                onClick={() => clearReadNotifications()}
                className="py-2 px-3 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-xs text-slate-300 hover:text-white font-semibold flex items-center gap-1.5 transition-all cursor-pointer min-h-[40px] active:scale-95"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear Read</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 2. PUSH ALERTS BANNER */}
      <div className="oneui-glass-card rounded-[24px] p-4 sm:p-5 space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div
              className={`p-2.5 rounded-2xl border shrink-0 ${
                pushPermission === 'granted'
                  ? 'bg-[#00E676]/12 border-[#00E676]/30 text-[#00E676]'
                  : 'bg-[#00E5FF]/12 border-[#00E5FF]/30 text-[#00E5FF]'
              }`}
            >
              <BellRing className="w-5 h-5" />
            </div>
            <div className="space-y-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-bold text-white">Real-Time Push Alerts</h2>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold border ${
                    pushPermission === 'granted'
                      ? 'bg-[#00E676]/12 border-[#00E676]/30 text-[#00E676]'
                      : pushPermission === 'denied'
                      ? 'bg-[#FF4D4F]/12 border-[#FF4D4F]/30 text-[#FF8587]'
                      : 'bg-[#00E5FF]/12 border-[#00E5FF]/30 text-[#00E5FF]'
                  }`}
                >
                  {pushPermission === 'granted'
                    ? 'Active'
                    : pushPermission === 'denied'
                    ? 'Blocked in Browser'
                    : 'Ready to Enable'}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Receive instant alerts for deposits, daily settlements, royalty credits, and withdrawal authorizations.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleEnablePush}
            disabled={pushLoading || !pushSupported}
            className="px-4 py-2.5 rounded-2xl bg-[#00E5FF]/15 hover:bg-[#00E5FF]/25 border border-[#00E5FF]/35 text-[#00E5FF] font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50 min-h-[42px] shrink-0 active:scale-95"
          >
            {pushLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Radio className="w-4 h-4" />}
            <span>{pushPermission === 'granted' ? 'Sync Device' : 'Enable Push Alerts'}</span>
          </button>
        </div>

        {pushFeedback && (
          <div
            className={`p-3 rounded-2xl text-xs flex items-center gap-2 ${
              pushFeedback.type === 'success'
                ? 'bg-[#00E676]/12 border border-[#00E676]/25 text-[#00E676]'
                : 'bg-[#FF4D4F]/12 border border-[#FF4D4F]/25 text-[#FF8587]'
            }`}
          >
            {pushFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{pushFeedback.message}</span>
          </div>
        )}
      </div>

      {/* 3. 4 CLEAN CATEGORY FILTER PILLS */}
      <div className="oneui-glass-card rounded-[22px] p-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {CATEGORY_PILLS.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setCategoryFilter(cat.id)}
              className={`px-3.5 py-2 rounded-2xl text-xs font-bold transition-all cursor-pointer active:scale-95 ${
                categoryFilter === cat.id
                  ? 'bg-[#00E5FF] text-[#050807] shadow-md shadow-[#00E5FF]/20'
                  : 'bg-white/[0.04] text-slate-400 hover:text-white hover:bg-white/[0.08] border border-white/[0.06]'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none px-1">
          <input
            type="checkbox"
            checked={unreadOnly}
            onChange={(e) => setUnreadOnly(e.target.checked)}
            className="w-4 h-4 rounded border-white/20 bg-white/5 accent-[#00E5FF] cursor-pointer"
          />
          <span className={unreadOnly ? 'text-white font-semibold' : ''}>Unread only</span>
        </label>
      </div>

      {/* 4. NOTIFICATIONS FEED */}
      {error ? (
        <div className="oneui-glass-card rounded-[24px] p-8 border-[#FF4D4F]/30 flex flex-col items-center justify-center text-center space-y-3">
          <AlertCircle className="w-8 h-8 text-[#FF4D4F]" />
          <p className="text-sm text-white font-semibold">{error}</p>
          <button
            type="button"
            onClick={() => refreshNotifications()}
            className="px-4 py-2 rounded-2xl bg-white/[0.08] hover:bg-white/[0.14] text-xs text-white font-semibold cursor-pointer"
          >
            Retry
          </button>
        </div>
      ) : loading && !refreshing ? (
        <div className="oneui-glass-card rounded-[24px] p-14 flex flex-col items-center justify-center space-y-3">
          <RefreshCw className="w-6 h-6 text-[#00E5FF] animate-spin" />
          <p className="text-xs font-mono text-slate-400">Synchronizing alert feed...</p>
        </div>
      ) : visibleNotifications.length === 0 ? (
        <div className="oneui-glass-card rounded-[24px] p-14 flex flex-col items-center justify-center text-center space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-slate-400">
            <Inbox className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-white">No Alerts in This Category</h3>
          <p className="text-xs text-slate-400 max-w-sm">
            {unreadOnly
              ? 'You are completely caught up with all unread alerts.'
              : 'New yield settlements, royalties, and account notices will appear here automatically.'}
          </p>
          {unreadOnly && (
            <button
              type="button"
              onClick={() => setUnreadOnly(false)}
              className="text-xs text-[#00E5FF] hover:underline cursor-pointer font-semibold"
            >
              Show all alerts
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {visibleNotifications.map((notif) => {
            const meta = getTypeMeta(notif.type);
            const IconComponent = meta.icon;
            const isUnread = !notif.readAt;

            return (
              <div
                key={notif.id}
                className={`p-4 sm:p-5 rounded-[22px] border transition-all flex flex-col sm:flex-row items-start justify-between gap-4 ${
                  isUnread
                    ? 'oneui-glass-card border-[#00E5FF]/35 shadow-lg shadow-[#00E5FF]/10'
                    : 'bg-[#0e1513]/55 backdrop-blur-xl border-white/[0.07] hover:border-white/[0.14]'
                }`}
              >
                <div className="flex items-start gap-3.5 w-full sm:w-auto min-w-0">
                  <div
                    className={`w-10 h-10 rounded-2xl border flex-shrink-0 flex items-center justify-center ${meta.bg} ${meta.color}`}
                  >
                    <IconComponent className="w-5 h-5" />
                  </div>

                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full border ${meta.bg} ${meta.color}`}>
                        {meta.badgeText}
                      </span>
                      <span className="text-[11px] font-mono text-slate-400">{notif.id}</span>
                      {isUnread && (
                        <span
                          className="w-2 h-2 rounded-full bg-[#00E5FF] shadow-[0_0_8px_#00E5FF]"
                          title="Unread"
                        />
                      )}
                    </div>

                    <h4 className={`text-sm font-bold tracking-tight ${isUnread ? 'text-white' : 'text-slate-200'}`}>
                      {notif.title}
                    </h4>

                    <p className="text-xs text-slate-400 leading-relaxed">{notif.message}</p>

                    <div className="flex flex-wrap items-center gap-2.5 pt-1 text-[11px] text-slate-500 font-mono">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>{formatRelativeTime(notif.createdAt)}</span>
                      </span>
                      <span>•</span>
                      <span>{new Date(notif.createdAt).toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center w-full sm:w-auto justify-end pt-2 sm:pt-0 border-t sm:border-t-0 border-white/[0.06] shrink-0">
                  {onNavigateTab && (
                    <button
                      type="button"
                      onClick={() => onNavigateTab(meta.destTab)}
                      className="px-3 py-1.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-xs text-slate-300 hover:text-white font-semibold transition-colors cursor-pointer"
                    >
                      Open
                    </button>
                  )}

                  {isUnread && (
                    <button
                      type="button"
                      onClick={() => markAsRead(notif.id)}
                      className="px-3 py-1.5 rounded-xl bg-[#00E5FF]/12 hover:bg-[#00E5FF]/20 border border-[#00E5FF]/30 text-xs text-[#00E5FF] font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Read</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => deleteNotification(notif.id)}
                    className="p-2 rounded-xl bg-white/[0.03] hover:bg-[#FF4D4F]/15 border border-transparent hover:border-[#FF4D4F]/30 text-slate-400 hover:text-[#FF4D4F] transition-colors cursor-pointer"
                    title="Delete notification"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
