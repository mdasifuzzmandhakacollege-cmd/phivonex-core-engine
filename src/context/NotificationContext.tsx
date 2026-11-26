import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from './AuthContext';
import {
  getAudioAlertsEnabled,
  setAudioAlertsEnabled,
  playSubtleChime,
  isHighPriorityNotification,
} from '../utils/audioAlert';

export interface AppNotification {
  id: string; // public_notification_id (NTF-XXXXXX)
  type:
    | 'NODE_ACTIVATED'
    | 'REFERRAL_EARNED'
    | 'MATCHING_EARNED'
    | 'PROMOTION_EARNED'
    | 'PHIVO_REWARD'
    | 'PHIVO_SWAP_COMPLETED'
    | 'USDT_DEPOSIT_CONFIRMED'
    | 'WITHDRAWAL_STATUS'
    | 'SECURITY_ALERT';
  title: string;
  message: string;
  readAt: string | null;
  createdAt: string;
}

interface NotificationContextType {
  notifications: AppNotification[];
  unreadCount: number;
  totalCount: number;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  filterType: string;
  unreadOnly: boolean;
  audioEnabled: boolean;
  toggleAudio: () => void;
  setFilterType: (type: string) => void;
  setUnreadOnly: (unreadOnly: boolean) => void;
  refreshNotifications: () => Promise<void>;
  markAsRead: (id: string) => Promise<boolean>;
  markAllAsRead: () => Promise<boolean>;
  deleteNotification: (id: string) => Promise<boolean>;
  clearReadNotifications: () => Promise<number>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string>('ALL');
  const [unreadOnly, setUnreadOnly] = useState<boolean>(false);
  const [audioEnabled, setAudioEnabled] = useState<boolean>(() => getAudioAlertsEnabled());

  const eventSourceRef = useRef<EventSource | null>(null);
  const initialLoadCompletedRef = useRef(false);
  const knownNotificationIdsRef = useRef<Set<string>>(new Set());

  const toggleAudio = useCallback(() => {
    setAudioEnabled((prev) => {
      const next = !prev;
      setAudioAlertsEnabled(next);
      if (next) {
        // Play subtle preview chime so user can verify audio & unlock browser AudioContext policy
        playSubtleChime(true);
      }
      return next;
    });
  }, []);

  // Fetch unread count alone (lightweight)
  const fetchUnreadCount = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch('/api/notifications/unread-count', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setUnreadCount(data.unreadCount ?? 0);
      }
    } catch {
      // Ignore background error
    }
  }, [user]);

  // Fetch full notification list
  const fetchNotifications = useCallback(
    async (isBackground = false) => {
      if (!user) return;
      if (!isBackground) setLoading(true);
      else setRefreshing(true);

      try {
        setError(null);
        const params = new URLSearchParams();
        params.append('limit', '50');
        if (unreadOnly) params.append('unreadOnly', 'true');
        if (filterType !== 'ALL') params.append('type', filterType);

        const res = await fetch(`/api/notifications?${params.toString()}`, { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          const freshList: AppNotification[] = Array.isArray(data.notifications) ? data.notifications : [];

          if (initialLoadCompletedRef.current && audioEnabled) {
            const hasNewHighPriority = freshList.some(
              (n) => !n.readAt && !knownNotificationIdsRef.current.has(n.id) && isHighPriorityNotification(n.type)
            );
            if (hasNewHighPriority) {
              playSubtleChime();
            }
          } else {
            initialLoadCompletedRef.current = true;
          }

          freshList.forEach((n) => knownNotificationIdsRef.current.add(n.id));

          setNotifications(freshList);
          setTotalCount(data.total || 0);
          setUnreadCount(data.unreadCount || 0);
        } else {
          setError('Unable to load alerts right now.');
        }
      } catch {
        setError('Connection paused. Retrying automatically...');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [user, filterType, unreadOnly, audioEnabled]
  );

  // Initial fetch and dependency trigger
  useEffect(() => {
    if (user) {
      fetchNotifications();
    } else {
      setNotifications([]);
      setUnreadCount(0);
      setTotalCount(0);
      knownNotificationIdsRef.current.clear();
      initialLoadCompletedRef.current = false;
    }
  }, [user, fetchNotifications]);

  // Real-Time SSE Stream & Polling Synchronization
  useEffect(() => {
    if (!user) return;

    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchUnreadCount();
      }
    }, 45000);

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        fetchUnreadCount();
        fetchNotifications(true);
      }
    };

    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);

    try {
      const es = new EventSource('/api/notifications/events', { withCredentials: true });
      eventSourceRef.current = es;

      es.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          if (parsed && parsed.type === 'NEW_NOTIFICATION' && parsed.notification) {
            const notif: AppNotification = parsed.notification;
            if (notif.id) {
              if (!knownNotificationIdsRef.current.has(notif.id)) {
                knownNotificationIdsRef.current.add(notif.id);
                setNotifications((prev) => [notif, ...prev.filter((item) => item.id !== notif.id)]);
                setTotalCount((prev) => prev + 1);
                if (!notif.readAt) {
                  setUnreadCount((prev) => prev + 1);
                  if (audioEnabled && isHighPriorityNotification(notif.type)) {
                    playSubtleChime();
                  }
                }
              }
            }

            if (typeof window !== 'undefined') {
              const eventType = (notif as any).type;
              if (eventType === 'USER_PROFILE_UPDATED' || eventType === 'USER_STATUS_UPDATED') {
                window.dispatchEvent(new CustomEvent('phivonex:profile-updated', { detail: notif }));
              }
              window.dispatchEvent(new CustomEvent('phivonex:balance-or-tx-updated', { detail: notif }));
              window.dispatchEvent(new CustomEvent('phivonex:notifications-updated', { detail: notif }));
            }
          } else if (parsed && parsed.type === 'CONNECTED') {
            fetchUnreadCount();
          }
        } catch {
          // non-json keepalive heartbeat
        }
      };

      es.onerror = () => {
        if (es.readyState === EventSource.CLOSED) {
          es.close();
        }
      };
    } catch {
      // Fallback cleanly to background polling
    }

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [user, fetchUnreadCount, fetchNotifications, audioEnabled]);

  // Action: Mark single notification as read
  const markAsRead = async (id: string): Promise<boolean> => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n))
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));

    try {
      const res = await fetch(`/api/notifications/${id}/read`, { method: 'PATCH', credentials: 'include' });
      if (!res.ok) {
        fetchNotifications(true);
        return false;
      }
      return true;
    } catch {
      fetchNotifications(true);
      return false;
    }
  };

  // Action: Mark all notifications as read
  const markAllAsRead = async (): Promise<boolean> => {
    const nowIso = new Date().toISOString();
    setNotifications((prev) => prev.map((n) => ({ ...n, readAt: n.readAt || nowIso })));
    setUnreadCount(0);

    try {
      const res = await fetch('/api/notifications/read-all', { method: 'POST', credentials: 'include' });
      if (!res.ok) {
        fetchNotifications(true);
        return false;
      }
      return true;
    } catch {
      fetchNotifications(true);
      return false;
    }
  };

  // Action: Delete single notification
  const deleteNotification = async (id: string): Promise<boolean> => {
    const target = notifications.find((n) => n.id === id);
    if (!target) return false;

    setNotifications((prev) => prev.filter((n) => n.id !== id));
    setTotalCount((prev) => Math.max(0, prev - 1));
    if (!target.readAt) {
      setUnreadCount((prev) => Math.max(0, prev - 1));
    }

    try {
      const res = await fetch(`/api/notifications/${id}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) {
        fetchNotifications(true);
        return false;
      }
      return true;
    } catch {
      fetchNotifications(true);
      return false;
    }
  };

  // Action: Clear read notifications
  const clearReadNotifications = async (): Promise<number> => {
    setNotifications((prev) => prev.filter((n) => !n.readAt));

    try {
      const res = await fetch('/api/notifications?readOnly=true', { method: 'DELETE', credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        fetchNotifications(true);
        return data.count || 0;
      }
      fetchNotifications(true);
      return 0;
    } catch {
      fetchNotifications(true);
      return 0;
    }
  };

  return (
    <NotificationContext.Provider
      value={{
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
        refreshNotifications: () => fetchNotifications(true),
        markAsRead,
        markAllAsRead,
        deleteNotification,
        clearReadNotifications,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};
