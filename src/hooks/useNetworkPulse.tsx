import React, { useState, useEffect, useRef, useCallback } from 'react';
import { RefreshCw, Activity, Check, AlertCircle } from 'lucide-react';

export interface NetworkPulseDashboardData {
  publicNetwork: {
    activeNodes: number;
    genesisNodeCap: number;
    reservedNodes: number;
    availableNodes: number;
    allocationPercent: number;
    currentRewardEpoch: number;
    totalNetworkTransactions: number;
    networkStatus: 'OPERATIONAL' | 'HEALTHY' | 'SYNCHRONIZED' | 'DEGRADED' | 'UNKNOWN';
    updatedAt: string;
    conversionRateUsd?: number | null;
  } | null;
  userNetwork: {
    directReferrals: number;
    placedMembers: number;
    unplacedDirectReferrals: number;
    leftNetworkMembers: number;
    rightNetworkMembers: number;
  } | null;
  volume: {
    businessDate: string;
    today: { left: number; right: number };
    carry: { left: number; right: number };
    availableForFutureMatching: { left: number; right: number };
  } | null;
  wallet: {
    availableBalance: number;
    commissionBalance?: number;
    nodeRewardsBalance?: number;
    totalBalance?: number;
    currency?: string;
  } | null;
  tokenPrice: {
    priceUsd: number;
    source?: string;
    updatedAt?: string;
  } | null;
  lastUpdated: Date;
  latencyMs: number;
}

export interface UseNetworkPulseOptions {
  /**
   * Polling interval in milliseconds.
   * Default: 30,000ms (30 seconds)
   */
  intervalMs?: number;
  /**
   * Whether periodic polling is currently active.
   * Default: true
   */
  enabled?: boolean;
  /**
   * Whether to include authenticated user-scoped metrics (wallet, binary volume, network counts).
   * Default: true
   */
  fetchUserMetrics?: boolean;
  /**
   * Callback fired on successful poll or manual refresh.
   */
  onUpdateSuccess?: (data: NetworkPulseDashboardData) => void;
  /**
   * Callback fired on fetch failure.
   */
  onUpdateError?: (error: Error) => void;
}

export interface NetworkPulseButtonProps {
  className?: string;
  variant?: 'compact' | 'full' | 'icon-only';
  showCountdown?: boolean;
  showStatusDot?: boolean;
}

export interface UseNetworkPulseReturn {
  data: NetworkPulseDashboardData | null;
  loading: boolean;
  isUpdating: boolean;
  error: string | null;
  lastUpdated: Date | null;
  secondsUntilNextPulse: number;
  updateNow: () => Promise<void>;
  NetworkPulseButton: React.FC<NetworkPulseButtonProps>;
}

const DEFAULT_POLL_INTERVAL_MS = 30000; // 30 seconds

/**
 * useNetworkPulse
 * Periodically polls the dashboard and protocol network data every 30 seconds.
 * Provides an immediate 'updateNow' manual trigger and an included 'NetworkPulseButton' component.
 */
export function useNetworkPulse(options: UseNetworkPulseOptions = {}): UseNetworkPulseReturn {
  const {
    intervalMs = DEFAULT_POLL_INTERVAL_MS,
    enabled = true,
    fetchUserMetrics = true,
    onUpdateSuccess,
    onUpdateError,
  } = options;

  const [data, setData] = useState<NetworkPulseDashboardData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isUpdating, setIsUpdating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [secondsUntilNextPulse, setSecondsUntilNextPulse] = useState<number>(
    Math.round(intervalMs / 1000)
  );

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const tickerRef = useRef<NodeJS.Timeout | null>(null);
  const nextScheduledTimeRef = useRef<number>(Date.now() + intervalMs);
  const isUpdatingRef = useRef<boolean>(false);

  // Core fetch function
  const fetchDashboardData = useCallback(async (isManualTrigger = false) => {
    if (isUpdatingRef.current) return;
    isUpdatingRef.current = true;
    setIsUpdating(true);
    if (!isManualTrigger) {
      setError(null);
    }

    const startTime = performance.now();

    try {
      // 1. Fetch public network summary (always accessible)
      const publicPromise = fetch('/api/public/network/summary')
        .then((res) => (res.ok ? res.json() : null))
        .catch(() => null);

      // 2. Fetch token price if available
      const tokenPromise = fetch('/api/economic/token-price')
        .then((res) => (res.ok ? res.json() : null))
        .catch(() => null);

      // 3. User-specific authenticated endpoints
      const userNetworkPromise = fetchUserMetrics
        ? fetch('/api/network/summary', { credentials: 'include' })
            .then((res) => (res.ok ? res.json() : null))
            .catch(() => null)
        : Promise.resolve(null);

      const volumePromise = fetchUserMetrics
        ? fetch('/api/network/volume-summary', { credentials: 'include' })
            .then((res) => (res.ok ? res.json() : null))
            .catch(() => null)
        : Promise.resolve(null);

      const walletPromise = fetchUserMetrics
        ? fetch('/api/wallet/me', { credentials: 'include' })
            .then((res) => (res.ok ? res.json() : null))
            .catch(() => null)
        : Promise.resolve(null);

      const [publicNet, tokenInfo, userNet, volInfo, walletInfo] = await Promise.all([
        publicPromise,
        tokenPromise,
        userNetworkPromise,
        volumePromise,
        walletPromise,
      ]);

      const endTime = performance.now();
      const latency = Math.round(endTime - startTime);
      const timestamp = new Date();

      const consolidated: NetworkPulseDashboardData = {
        publicNetwork: publicNet,
        userNetwork: userNet,
        volume: volInfo,
        wallet: walletInfo,
        tokenPrice: tokenInfo
          ? {
              priceUsd: typeof tokenInfo.priceUsd === 'number' ? tokenInfo.priceUsd : 1.0,
              source: tokenInfo.source || 'PHIVONEX_ORACLE',
              updatedAt: tokenInfo.updatedAt || timestamp.toISOString(),
            }
          : null,
        lastUpdated: timestamp,
        latencyMs: latency,
      };

      setData(consolidated);
      setLastUpdated(timestamp);
      setError(null);

      if (onUpdateSuccess) {
        onUpdateSuccess(consolidated);
      }
    } catch (err: any) {
      const errMsg = err?.message || 'Network pulse sync failed';
      console.warn('[useNetworkPulse] Sync error:', errMsg);
      setError(errMsg);
      if (onUpdateError) {
        onUpdateError(err instanceof Error ? err : new Error(errMsg));
      }
    } finally {
      setLoading(false);
      setIsUpdating(false);
      isUpdatingRef.current = false;

      // Reset countdown ticker
      nextScheduledTimeRef.current = Date.now() + intervalMs;
      setSecondsUntilNextPulse(Math.round(intervalMs / 1000));
    }
  }, [fetchUserMetrics, intervalMs, onUpdateSuccess, onUpdateError]);

  // Manual Trigger: User clicks "Update Now"
  const updateNow = useCallback(async () => {
    // Reset any pending polling timeout so we restart a fresh 30-second window
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    await fetchDashboardData(true);

    if (enabled) {
      timerRef.current = setTimeout(() => {
        fetchDashboardData(false);
      }, intervalMs);
    }
  }, [fetchDashboardData, enabled, intervalMs]);

  // Periodic polling timer (every 30 seconds)
  useEffect(() => {
    if (!enabled) return;

    // Initial fetch on mount
    fetchDashboardData(false);

    const scheduleNextPoll = () => {
      nextScheduledTimeRef.current = Date.now() + intervalMs;
      setSecondsUntilNextPulse(Math.round(intervalMs / 1000));

      timerRef.current = setTimeout(async () => {
        await fetchDashboardData(false);
        scheduleNextPoll();
      }, intervalMs);
    };

    scheduleNextPoll();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [enabled, intervalMs, fetchDashboardData]);

  // 1-second interval ticker for visual countdown (e.g. 30s -> 0s)
  useEffect(() => {
    if (!enabled) return;

    tickerRef.current = setInterval(() => {
      const remainingMs = Math.max(0, nextScheduledTimeRef.current - Date.now());
      setSecondsUntilNextPulse(Math.ceil(remainingMs / 1000));
    }, 1000);

    return () => {
      if (tickerRef.current) clearInterval(tickerRef.current);
    };
  }, [enabled]);

  // Pre-bound "Update Now" Button Component returned directly by the hook
  const NetworkPulseButton: React.FC<NetworkPulseButtonProps> = useCallback(
    ({
      className = '',
      variant = 'compact',
      showCountdown = true,
      showStatusDot = true,
    }) => {
      const isCompact = variant === 'compact';
      const isIconOnly = variant === 'icon-only';

      return (
        <button
          type="button"
          onClick={updateNow}
          disabled={isUpdating}
          title={
            lastUpdated
              ? `Last updated at ${lastUpdated.toLocaleTimeString()} (${secondsUntilNextPulse}s until auto-pulse)`
              : 'Click to synchronize dashboard data'
          }
          aria-label="Update dashboard data now"
          className={`group relative inline-flex items-center gap-2 rounded-lg border font-mono text-xs transition-all duration-200 cursor-pointer select-none active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed ${
            isUpdating
              ? 'bg-[#00CFFF]/10 border-[#00CFFF]/40 text-[#00CFFF]'
              : error
              ? 'bg-[#F04438]/10 border-[#F04438]/30 text-[#F04438] hover:bg-[#F04438]/20'
              : 'bg-[#0B1528] border-white/10 text-[#98A2B3] hover:text-white hover:border-[#00CFFF]/40 hover:bg-[#071324]'
          } ${
            isIconOnly
              ? 'p-2'
              : isCompact
              ? 'px-2.5 py-1.5'
              : 'px-3.5 py-2'
          } ${className}`}
        >
          {/* Status Dot / Radar Pulse */}
          {showStatusDot && (
            <span className="relative flex h-2 w-2 items-center justify-center">
              {isUpdating ? (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#00CFFF] opacity-75" />
              ) : error ? (
                <span className="inline-flex h-2 w-2 rounded-full bg-[#F04438]" />
              ) : (
                <>
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60 duration-1000" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                </>
              )}
            </span>
          )}

          {/* Refresh Icon */}
          <RefreshCw
            className={`w-3.5 h-3.5 transition-transform duration-300 ${
              isUpdating ? 'animate-spin text-[#00CFFF]' : 'group-hover:rotate-180'
            }`}
          />

          {/* Button Text */}
          {!isIconOnly && (
            <span className="font-semibold tracking-wide whitespace-nowrap">
              {isUpdating ? 'Updating...' : 'Update Now'}
            </span>
          )}

          {/* 30-Second Countdown Badge */}
          {!isIconOnly && showCountdown && !isUpdating && (
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-white/[0.06] text-[#667085] group-hover:text-[#98A2B3]">
              {secondsUntilNextPulse}s
            </span>
          )}
        </button>
      );
    },
    [isUpdating, error, lastUpdated, secondsUntilNextPulse, updateNow]
  );

  return {
    data,
    loading,
    isUpdating,
    error,
    lastUpdated,
    secondsUntilNextPulse,
    updateNow,
    NetworkPulseButton,
  };
}
