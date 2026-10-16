import React from 'react';
import { RefreshCw, Activity, Check, AlertCircle, Clock } from 'lucide-react';
import { useNetworkPulse, UseNetworkPulseReturn } from '../../hooks/useNetworkPulse';

export interface NetworkPulseTriggerProps {
  pulseState?: UseNetworkPulseReturn;
  className?: string;
  variant?: 'compact' | 'full' | 'banner' | 'pill';
  showCountdown?: boolean;
  onRefreshCompleted?: () => void;
}

export const NetworkPulseTrigger: React.FC<NetworkPulseTriggerProps> = ({
  pulseState,
  className = '',
  variant = 'compact',
  showCountdown = true,
  onRefreshCompleted,
}) => {
  // Use passed hook state or create an internal instance
  const internalPulse = useNetworkPulse({
    onUpdateSuccess: () => {
      onRefreshCompleted?.();
    },
  });

  const {
    isUpdating,
    error,
    lastUpdated,
    secondsUntilNextPulse,
    updateNow,
    data,
  } = pulseState || internalPulse;

  const handleTrigger = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await updateNow();
    onRefreshCompleted?.();
  };

  if (variant === 'banner') {
    return (
      <div
        className={`flex items-center justify-between px-3.5 py-2 rounded-xl bg-[#071324] border border-white/[0.08] text-xs font-mono ${className}`}
      >
        <div className="flex items-center gap-2.5 text-[#98A2B3]">
          <span className="relative flex h-2 w-2">
            {isUpdating ? (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#00CFFF] opacity-75" />
            ) : (
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            )}
          </span>
          <span className="text-white font-medium">Network Pulse</span>
          <span className="text-[11px] text-[#667085]">
            {lastUpdated
              ? `Synced ${lastUpdated.toLocaleTimeString()}`
              : 'Auto-sync active'}
          </span>
          {showCountdown && !isUpdating && (
            <span className="text-[10px] text-[#00CFFF]/80 bg-[#00CFFF]/10 px-1.5 py-0.5 rounded">
              Next in {secondsUntilNextPulse}s
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={handleTrigger}
          disabled={isUpdating}
          className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#00CFFF]/10 hover:bg-[#00CFFF]/20 border border-[#00CFFF]/30 text-[#00CFFF] font-semibold text-xs transition-colors cursor-pointer disabled:opacity-60"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isUpdating ? 'animate-spin' : ''}`} />
          <span>{isUpdating ? 'Updating...' : 'Update Now'}</span>
        </button>
      </div>
    );
  }

  if (variant === 'pill') {
    return (
      <div
        className={`inline-flex items-center gap-2 bg-[#07101D] border border-white/10 rounded-full pl-2.5 pr-1 py-1 text-xs font-mono ${className}`}
      >
        <span className="relative flex h-2 w-2">
          {isUpdating ? (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#00CFFF] opacity-75" />
          ) : (
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          )}
        </span>
        <span className="text-[11px] text-[#98A2B3]">
          {isUpdating ? 'Syncing...' : `Pulse: ${secondsUntilNextPulse}s`}
        </span>
        <button
          type="button"
          onClick={handleTrigger}
          disabled={isUpdating}
          title="Update dashboard data immediately"
          className="p-1 rounded-full bg-white/[0.06] hover:bg-[#00CFFF]/20 hover:text-[#00CFFF] text-[#CBD5E1] transition-colors cursor-pointer"
        >
          <RefreshCw className={`w-3 h-3 ${isUpdating ? 'animate-spin' : ''}`} />
        </button>
      </div>
    );
  }

  // Default compact button
  return (
    <button
      type="button"
      onClick={handleTrigger}
      disabled={isUpdating}
      title={
        lastUpdated
          ? `Synced ${lastUpdated.toLocaleTimeString()} · Next pulse in ${secondsUntilNextPulse}s`
          : 'Synchronize live dashboard data now'
      }
      aria-label="Update Now"
      className={`group inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-mono font-medium transition-all duration-200 cursor-pointer select-none active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed ${
        isUpdating
          ? 'bg-[#00CFFF]/10 border-[#00CFFF]/40 text-[#00CFFF]'
          : error
          ? 'bg-[#F04438]/10 border-[#F04438]/30 text-[#F04438]'
          : 'bg-[#071324] hover:bg-[#0B1C33] border-white/10 hover:border-[#00CFFF]/40 text-[#98A2B3] hover:text-white'
      } ${className}`}
    >
      <span className="relative flex h-2 w-2 items-center justify-center">
        {isUpdating ? (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#00CFFF] opacity-75" />
        ) : error ? (
          <span className="inline-flex h-1.5 w-1.5 rounded-full bg-[#F04438]" />
        ) : (
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
        )}
      </span>

      <RefreshCw
        className={`w-3.5 h-3.5 transition-transform duration-300 ${
          isUpdating ? 'animate-spin text-[#00CFFF]' : 'group-hover:rotate-180'
        }`}
      />

      <span>{isUpdating ? 'Updating...' : 'Update Now'}</span>

      {showCountdown && !isUpdating && (
        <span className="text-[10px] text-[#667085] bg-white/[0.06] px-1.5 py-0.5 rounded group-hover:text-[#98A2B3]">
          {secondsUntilNextPulse}s
        </span>
      )}
    </button>
  );
};
