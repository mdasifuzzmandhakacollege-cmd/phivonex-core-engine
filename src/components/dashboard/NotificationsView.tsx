import React, { useState, useEffect, useCallback } from 'react';
import {
  Bell,
  CheckCheck,
  Check,
  Filter,
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
  Zap,
  Smartphone,
  CheckCircle2,
  BellRing,
  Loader2,
  ExternalLink
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

export const NotificationsView: React.FC<NotificationsViewProps> = ({ user, onNavigateTab }) => {
  const {
    notifications,
    unreadCount,
    totalCount,
    loading,
    refreshing,
    error,
    filterType,
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

  const [markingAllRead, setMarkingAllRead] = useState(false);
  const [clearingRead, setClearingRead] = useState(false);

  // Web Push Messaging State
  const [pushSupported, setPushSupported] = useState<boolean>(true);
  const [pushPermission, setPushPermission] = useState<NotificationPermission>('default');
  const [pushLoading, setPushLoading] = useState<boolean>(false);
  const [isSubscribed, setIsSubscribed] = useState<boolean>(false);
  const [pushFeedback, setPushFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Check support and push status on mount
  useEffect(() => {
    checkPushSupport().then((supported) => {
      setPushSupported(supported);
      if (typeof window !== 'undefined' && 'Notification' in window) {
        setPushPermission(Notification.permission);
      }
    });

    // Check if user has active push token on server
    fetch('/api/notifications/push-status')
      .then((res) => res.json())
      .then((data) => {
        if (data.isSubscribed) {
          setIsSubscribed(true);
        }
      })
      .catch(() => {});
  }, []);

  const handleEnablePush = async () => {
    try {
      setPushLoading(true);
      setPushFeedback(null);
      const res = await requestPushPermissionAndToken();
      if (res.success) {
        setPushPermission('granted');
        setIsSubscribed(true);
        setPushFeedback({
          type: 'success',
          message: 'Notifications successfully activated! You will receive real-time alerts for deposits, node rewards, commissions, and withdrawals.',
        });
      } else {
        if (typeof window !== 'undefined' && 'Notification' in window) {
          setPushPermission(Notification.permission);
        }
        setPushFeedback({
          type: 'error',
          message: res.error || 'Failed to enable notifications.',
        });
      }
    } finally {
      setPushLoading(false);
    }
  };

  const handleMarkAsRead = async (id: string) => {
    await markAsRead(id);
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

  const handleDeleteNotification = async (id: string) => {
    await deleteNotification(id);
  };

  const handleClearReadNotifications = async () => {
    setClearingRead(true);
    try {
      await clearReadNotifications();
    } finally {
      setClearingRead(false);
    }
  };

  const getTypeMeta = (type: AppNotification['type']) => {
    switch (type) {
      case 'NODE_ACTIVATED':
        return {
          icon: Server,
          color: 'text-[#00CFFF]',
          bg: 'bg-[#00CFFF]/10 border-[#00CFFF]/30',
          badgeText: 'Node Infrastructure',
          destTab: 'nodes' as DashboardTab,
        };
      case 'REFERRAL_EARNED':
        return {
          icon: Users,
          color: 'text-[#32D583]',
          bg: 'bg-[#32D583]/10 border-[#32D583]/30',
          badgeText: 'Referral Bonus',
          destTab: 'referrals' as DashboardTab,
        };
      case 'MATCHING_EARNED':
        return {
          icon: GitFork,
          color: 'text-[#A855F7]',
          bg: 'bg-[#A855F7]/10 border-[#A855F7]/30',
          badgeText: 'Binary Matching',
          destTab: 'network' as DashboardTab,
        };
      case 'PROMOTION_EARNED':
        return {
          icon: CheckCheck,
          color: 'text-[#F59E0B]',
          bg: 'bg-[#F59E0B]/10 border-[#F59E0B]/30',
          badgeText: 'Milestone Promotion',
          destTab: 'network' as DashboardTab,
        };
      case 'PHIVO_REWARD':
        return {
          icon: Coins,
          color: 'text-[#10B981]',
          bg: 'bg-[#10B981]/10 border-[#10B981]/30',
          badgeText: 'Mining Reward',
          destTab: 'rewards' as DashboardTab,
        };
      case 'PHIVO_SWAP_COMPLETED':
        return {
          icon: ArrowLeftRight,
          color: 'text-[#38BDF8]',
          bg: 'bg-[#38BDF8]/10 border-[#38BDF8]/30',
          badgeText: 'Coin Swap',
          destTab: 'swap' as DashboardTab,
        };
      case 'USDT_DEPOSIT_CONFIRMED':
        return {
          icon: ArrowDownLeft,
          color: 'text-[#32D583]',
          bg: 'bg-[#32D583]/10 border-[#32D583]/30',
          badgeText: 'BSC Deposit',
          destTab: 'deposit' as DashboardTab,
        };
      case 'WITHDRAWAL_STATUS':
        return {
          icon: ArrowUpRight,
          color: 'text-[#F97316]',
          bg: 'bg-[#F97316]/10 border-[#F97316]/30',
          badgeText: 'Withdrawal',
          destTab: 'withdrawals' as DashboardTab,
        };
      case 'SECURITY_ALERT':
        return {
          icon: ShieldAlert,
          color: 'text-[#F04438]',
          bg: 'bg-[#F04438]/10 border-[#F04438]/30',
          badgeText: 'Security Notice',
          destTab: 'security' as DashboardTab,
        };
      default:
        return {
          icon: Bell,
          color: 'text-[#98A2B3]',
          bg: 'bg-white/5 border-white/10',
          badgeText: 'System Event',
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

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 sm:p-6 rounded-2xl bg-[#07101D] border border-white/[0.08] relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-[#00CFFF]/5 rounded-full blur-3xl pointer-events-none" />

        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-[#00CFFF]/10 border border-[#00CFFF]/30 flex items-center justify-center text-[#00CFFF]">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                <span>Protocol Notifications</span>
                {unreadCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-[#00CFFF]/20 border border-[#00CFFF]/40 text-[#00CFFF] text-xs font-mono font-semibold">
                    {unreadCount} unread
                  </span>
                )}
              </h1>
              <p className="text-xs text-[#98A2B3]">
                Real-time cryptographic audit trail of node activations, commissions, matching cycles, and balances.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-center">
          {/* Subtle Audio Alert Awareness Toggle */}
          <button
            onClick={() => toggleAudio()}
            className={`py-2 px-3 rounded-xl border text-xs font-medium flex items-center gap-2 transition-colors cursor-pointer min-h-[40px] ${
              audioEnabled
                ? 'bg-[#00CFFF]/10 border-[#00CFFF]/30 text-[#00CFFF] hover:bg-[#00CFFF]/20'
                : 'bg-white/[0.04] border-white/[0.08] text-[#98A2B3] hover:text-white hover:bg-white/[0.08]'
            }`}
            title={audioEnabled ? 'Audio alerts: Active (Click to Mute)' : 'Audio alerts: Muted (Click to Enable)'}
            aria-label="Toggle audio alerts"
          >
            {audioEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            <span className="hidden sm:inline">{audioEnabled ? 'Audio: On' : 'Audio: Muted'}</span>
          </button>

          <button
            onClick={() => refreshNotifications()}
            disabled={refreshing}
            className="p-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-[#98A2B3] hover:text-white transition-colors cursor-pointer min-h-[40px] min-w-[40px] flex items-center justify-center disabled:opacity-50"
            title="Refresh notifications"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-[#00CFFF]' : ''}`} />
          </button>

          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllAsRead}
              disabled={markingAllRead}
              className="py-2 px-3.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-xs text-white font-medium flex items-center gap-2 transition-colors cursor-pointer min-h-[40px] disabled:opacity-50"
            >
              <CheckCheck className="w-4 h-4 text-[#00CFFF]" />
              <span>Mark all read</span>
            </button>
          )}

          {notifications.some((n) => n.readAt) && (
            <button
              onClick={handleClearReadNotifications}
              className="py-2 px-3 rounded-xl bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.06] text-xs text-[#98A2B3] hover:text-white font-medium flex items-center gap-1.5 transition-colors cursor-pointer min-h-[40px]"
              title="Delete all read notifications"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear read</span>
            </button>
          )}
        </div>
      </div>

      {/* REAL-TIME NOTIFICATIONS CONTROL CARD */}
      <div className={`p-5 rounded-2xl border transition-all ${
        pushPermission === 'granted'
          ? 'bg-gradient-to-r from-[#07101D] via-[#052e16]/25 to-[#07101D] border-emerald-500/30 shadow-lg shadow-emerald-500/5'
          : 'bg-gradient-to-r from-[#07101D] via-[#0c1f38]/50 to-[#07101D] border-[#00CFFF]/25 shadow-lg shadow-[#00CFFF]/5'
      }`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2.5">
              <div className={`p-2 rounded-xl border ${
                pushPermission === 'granted'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  : 'bg-[#00CFFF]/10 border-[#00CFFF]/30 text-[#00CFFF]'
              }`}>
                <BellRing className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>Real-Time Notifications</span>
              </h3>
              <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold flex items-center gap-1.5 border ${
                pushPermission === 'granted'
                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                  : pushPermission === 'denied'
                  ? 'bg-rose-500/15 border-rose-500/30 text-rose-300'
                  : 'bg-[#00CFFF]/15 border-[#00CFFF]/30 text-[#00CFFF]'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${
                  pushPermission === 'granted' ? 'bg-emerald-400 animate-pulse' : pushPermission === 'denied' ? 'bg-rose-400' : 'bg-[#00CFFF]'
                }`} />
                {pushPermission === 'granted'
                  ? 'Active & Subscribed'
                  : pushPermission === 'denied'
                  ? 'Blocked in Browser'
                  : 'Ready to Activate'}
              </span>
            </div>

            <p className="text-xs text-[#98A2B3] leading-relaxed">
              Receive real-time account, transaction, node, reward and security notifications — even when the PHIVONEX tab is not open.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {pushPermission !== 'granted' ? (
              <button
                onClick={handleEnablePush}
                disabled={pushLoading || !pushSupported}
                className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#00CFFF] to-[#00A3FF] hover:from-[#00CFFF]/90 hover:to-[#00A3FF]/90 text-[#05070B] font-bold text-xs flex items-center gap-2 transition-all shadow-md shadow-[#00CFFF]/20 cursor-pointer disabled:opacity-50 min-h-[40px]"
              >
                {pushLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Connecting...</span>
                  </>
                ) : (
                  <>
                    <Radio className="w-4 h-4" />
                    <span>Enable Notifications</span>
                  </>
                )}
              </button>
            ) : (
              <button
                onClick={handleEnablePush}
                disabled={pushLoading}
                className="px-3.5 py-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-xs text-[#98A2B3] hover:text-white transition-all cursor-pointer min-h-[40px] flex items-center gap-2"
                title="Sync notification settings"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${pushLoading ? 'animate-spin' : ''}`} />
                <span className="font-medium">Sync Settings</span>
              </button>
            )}
          </div>
        </div>

        {/* Feedback Alert */}
        {pushFeedback && (
          <div className={`mt-3 p-3 rounded-xl text-xs flex items-center gap-2.5 ${
            pushFeedback.type === 'success'
              ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300'
              : 'bg-rose-500/10 border border-rose-500/20 text-rose-300'
          }`}>
            {pushFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{pushFeedback.message}</span>
          </div>
        )}
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-[#07101D] border border-white/[0.08]">
        {/* Type Filter Buttons */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none text-xs">
          {[
            { id: 'ALL', label: 'All Events' },
            { id: 'NODE_ACTIVATED', label: 'Nodes' },
            { id: 'REFERRAL_EARNED', label: 'Referrals' },
            { id: 'MATCHING_EARNED', label: 'Matching' },
            { id: 'PROMOTION_EARNED', label: 'Promotions' },
            { id: 'PHIVO_REWARD', label: 'Mining' },
            { id: 'PHIVO_SWAP_COMPLETED', label: 'Swaps' },
            { id: 'USDT_DEPOSIT_CONFIRMED', label: 'Deposits' },
            { id: 'WITHDRAWAL_STATUS', label: 'Withdrawals' },
            { id: 'SECURITY_ALERT', label: 'Security' },
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => setFilterType(cat.id)}
              className={`px-3 py-1.5 rounded-lg whitespace-nowrap font-medium transition-all cursor-pointer ${
                filterType === cat.id
                  ? 'bg-[#00CFFF] text-[#05070B] font-bold shadow-sm'
                  : 'bg-white/[0.02] text-[#98A2B3] hover:text-white hover:bg-white/[0.06]'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Unread Toggle */}
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-[#98A2B3] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={unreadOnly}
              onChange={(e) => setUnreadOnly(e.target.checked)}
              className="w-4 h-4 rounded border-white/20 bg-white/5 text-[#00CFFF] focus:ring-0 focus:ring-offset-0 cursor-pointer"
            />
            <span className={unreadOnly ? 'text-white font-medium' : ''}>Unread only</span>
          </label>
        </div>
      </div>

      {/* Notifications List */}
      {error ? (
        <div className="p-8 rounded-2xl bg-[#07101D] border border-[#F04438]/30 flex flex-col items-center justify-center text-center space-y-3">
          <AlertCircle className="w-8 h-8 text-[#F04438]" />
          <p className="text-sm text-white font-medium">{error}</p>
          <button
            onClick={() => refreshNotifications()}
            className="px-4 py-2 rounded-xl bg-white/[0.08] hover:bg-white/[0.12] text-xs text-white font-medium cursor-pointer"
          >
            Retry Connection
          </button>
        </div>
      ) : loading && !refreshing ? (
        <div className="p-16 rounded-2xl bg-[#07101D] border border-white/[0.08] flex flex-col items-center justify-center space-y-3">
          <RefreshCw className="w-6 h-6 text-[#00CFFF] animate-spin" />
          <p className="text-xs font-mono text-[#98A2B3]">Fetching cryptographically signed alerts...</p>
        </div>
      ) : notifications.length === 0 ? (
        <div className="p-16 rounded-2xl bg-[#07101D] border border-white/[0.08] flex flex-col items-center justify-center text-center space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-center text-[#98A2B3]">
            <Inbox className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-white">No Notifications Found</h3>
          <p className="text-xs text-[#98A2B3] max-w-sm">
            {unreadOnly
              ? 'You have caught up with all incoming system events! No unread notifications.'
              : 'There are no notifications matching your current filter criteria.'}
          </p>
          {unreadOnly && (
            <button
              onClick={() => setUnreadOnly(false)}
              className="text-xs text-[#00CFFF] hover:underline cursor-pointer pt-1"
            >
              Show all notifications
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map((notif) => {
            const meta = getTypeMeta(notif.type);
            const IconComponent = meta.icon;
            const isUnread = !notif.readAt;

            return (
              <div
                key={notif.id}
                className={`p-4 sm:p-5 rounded-2xl border transition-all flex flex-col sm:flex-row items-start justify-between gap-4 ${
                  isUnread
                    ? 'bg-[#0B1527] border-[#00CFFF]/30 shadow-lg shadow-[#00CFFF]/5'
                    : 'bg-[#07101D] border-white/[0.06] hover:border-white/[0.12]'
                }`}
              >
                <div className="flex items-start gap-3.5 w-full sm:w-auto">
                  {/* Type Icon */}
                  <div
                    className={`w-10 h-10 rounded-xl border flex-shrink-0 flex items-center justify-center ${meta.bg} ${meta.color}`}
                  >
                    <IconComponent className="w-5 h-5" />
                  </div>

                  {/* Body Content */}
                  <div className="space-y-1 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${meta.bg} ${meta.color}`}>
                        {meta.badgeText}
                      </span>
                      <span className="text-[11px] font-mono text-[#98A2B3]">
                        {notif.id}
                      </span>
                      {isUnread && (
                        <span className="w-2 h-2 rounded-full bg-[#00CFFF] animate-pulse" title="Unread" />
                      )}
                    </div>

                    <h4 className={`text-sm font-bold tracking-tight ${isUnread ? 'text-white' : 'text-[#E0E6ED]'}`}>
                      {notif.title}
                    </h4>

                    <p className="text-xs text-[#98A2B3] leading-relaxed">
                      {notif.message}
                    </p>

                    <div className="flex items-center gap-3 pt-1 text-[11px] text-[#98A2B3] font-mono">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 opacity-60" />
                        <span>{formatRelativeTime(notif.createdAt)}</span>
                      </span>
                      <span>•</span>
                      <span>{new Date(notif.createdAt).toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                {/* Actions on right */}
                <div className="flex items-center gap-2 self-end sm:self-center w-full sm:w-auto justify-end pt-2 sm:pt-0 border-t sm:border-t-0 border-white/[0.04]">
                  {onNavigateTab && (
                    <button
                      onClick={() => onNavigateTab(meta.destTab)}
                      className="px-3 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-xs text-[#98A2B3] hover:text-white font-medium transition-colors cursor-pointer"
                    >
                      View Details
                    </button>
                  )}

                  {isUnread && (
                    <button
                      onClick={() => handleMarkAsRead(notif.id)}
                      className="px-3 py-1.5 rounded-xl bg-[#00CFFF]/10 hover:bg-[#00CFFF]/20 border border-[#00CFFF]/30 text-xs text-[#00CFFF] font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                      title="Mark as read"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Mark read</span>
                    </button>
                  )}

                  <button
                    onClick={() => handleDeleteNotification(notif.id)}
                    className="p-1.5 rounded-lg bg-white/[0.02] hover:bg-[#F04438]/10 border border-transparent hover:border-[#F04438]/30 text-[#98A2B3] hover:text-[#F04438] transition-colors cursor-pointer"
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
