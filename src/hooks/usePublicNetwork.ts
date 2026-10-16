import { useState, useEffect, useRef, useCallback } from 'react';

export interface PublicNetworkSummaryData {
  genesisNodeCap: number;
  activeNodes: number;
  reservedNodes: number;
  availableNodes: number;
  retiredNodes: number;
  allocationPercent: number;
  currentRewardEpoch: number;
  totalNetworkTransactions: number;
  networkStatus: 'OPERATIONAL' | 'HEALTHY' | 'SYNCHRONIZED' | 'DEGRADED' | 'UNKNOWN';
  updatedAt: string;
  conversionRateUsd?: number | null;
}

export interface PublicNetworkEventItem {
  id: string;
  type: string;
  title: string;
  description: string;
  timestamp: string;
  publicId?: string;
}

const DEFAULT_SUMMARY: PublicNetworkSummaryData = {
  genesisNodeCap: 10000,
  activeNodes: 0,
  reservedNodes: 0,
  availableNodes: 10000,
  retiredNodes: 0,
  allocationPercent: 0,
  currentRewardEpoch: 1,
  totalNetworkTransactions: 0,
  networkStatus: 'UNKNOWN',
  updatedAt: new Date().toISOString(),
  conversionRateUsd: null,
};

export function usePublicNetwork() {
  const [summary, setSummary] = useState<PublicNetworkSummaryData>(DEFAULT_SUMMARY);
  const [events, setEvents] = useState<PublicNetworkEventItem[]>([]);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch REST API initial baseline
  const fetchInitialData = useCallback(async () => {
    try {
      setError(null);
      const [sumRes, evtRes] = await Promise.all([
        fetch('/api/public/network/summary').catch(() => null),
        fetch('/api/public/network/events?limit=20').catch(() => null),
      ]);

      if (sumRes && sumRes.ok) {
        const sumData = await sumRes.json();
        setSummary((prev) => ({ ...prev, ...sumData }));
      }

      if (evtRes && evtRes.ok) {
        const evtData = await evtRes.json();
        if (Array.isArray(evtData)) {
          setEvents(evtData);
        }
      }
    } catch (err: any) {
      console.warn('[usePublicNetwork] Initial fetch fallback:', err?.message || err);
      setError('Using last verified network state');
    } finally {
      setLoading(false);
    }
  }, []);

  // Realtime SSE Connection with auto-reconnect fallback
  useEffect(() => {
    let isMounted = true;

    // Fetch REST initial snapshot
    fetchInitialData();

    function connectSSE() {
      if (!isMounted) return;

      try {
        if (eventSourceRef.current) {
          eventSourceRef.current.close();
        }

        const es = new EventSource('/api/public/network/stream');
        eventSourceRef.current = es;

        es.onopen = () => {
          if (isMounted) {
            setIsConnected(true);
            setError(null);
          }
        };

        es.addEventListener('summary', (e) => {
          if (!isMounted) return;
          try {
            const data = JSON.parse(e.data);
            setSummary((prev) => ({ ...prev, ...data }));
          } catch {
            // Ignore parse errors
          }
        });

        // Universal handler for event types
        const handleEvent = (e: MessageEvent) => {
          if (!isMounted) return;
          try {
            const newEvt: PublicNetworkEventItem = JSON.parse(e.data);
            if (newEvt && newEvt.id) {
              setEvents((prev) => {
                // Deduplicate and prepend
                const filtered = prev.filter((item) => item.id !== newEvt.id);
                return [newEvt, ...filtered].slice(0, 30);
              });
            }
          } catch {
            // Ignore parse errors
          }
        };

        es.addEventListener('node.activated', handleEvent);
        es.addEventListener('reward.epoch.completed', handleEvent);
        es.addEventListener('matching.completed', handleEvent);
        es.addEventListener('promotion.earned', handleEvent);
        es.addEventListener('network.status', handleEvent);

        es.onerror = () => {
          if (!isMounted) return;
          setIsConnected(false);
          es.close();
          eventSourceRef.current = null;

          // Safe reconnect after 5 seconds without raising unhandled rejections
          if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
          reconnectTimerRef.current = setTimeout(() => {
            if (isMounted) connectSSE();
          }, 5000);
        };
      } catch (sseErr) {
        if (isMounted) {
          setIsConnected(false);
          console.warn('[usePublicNetwork] SSE initialization error:', sseErr);
        }
      }
    }

    connectSSE();

    return () => {
      isMounted = false;
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
    };
  }, [fetchInitialData]);

  return {
    summary,
    events,
    isConnected,
    loading,
    error,
    refetch: fetchInitialData,
  };
}
