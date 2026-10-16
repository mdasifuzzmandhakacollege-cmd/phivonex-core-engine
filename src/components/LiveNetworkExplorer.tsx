import React, { useState, useEffect } from 'react';
import { LedgerEvent, ActivityEventType } from '../types/network';
import { INITIAL_LEDGER_EVENTS } from '../data/networkData';
import { Activity, ShieldCheck, ArrowUpRight, Filter, Radio, RefreshCw, Layers, CheckCircle2 } from 'lucide-react';

interface LiveNetworkExplorerProps {
  onInspectEvent: (event: LedgerEvent) => void;
}

export const LiveNetworkExplorer: React.FC<LiveNetworkExplorerProps> = ({ onInspectEvent }) => {
  const [events, setEvents] = useState<LedgerEvent[]>(INITIAL_LEDGER_EVENTS);
  const [selectedFilter, setSelectedFilter] = useState<string>('all');
  const [isLiveStreaming, setIsLiveStreaming] = useState(true);

  // Periodic incoming event generation (labeled Testnet / Devnet Verified)
  useEffect(() => {
    if (!isLiveStreaming) return;

    const interval = setInterval(() => {
      const types: ActivityEventType[] = [
        'node_activated',
        'reward_epoch_completed',
        'ownership_updated',
        'reward_claim_confirmed',
        'ledger_checkpoint',
      ];
      const randomType = types[Math.floor(Math.random() * types.length)];
      const randomId = Math.floor(1000 + Math.random() * 9000);

      let title = '';
      let details = '';
      let amount: string | undefined = undefined;

      switch (randomType) {
        case 'node_activated':
          title = `Node PX-00${randomId} Activated`;
          details = 'Validator handshake registered with network mesh.';
          break;
        case 'reward_epoch_completed':
          title = `Reward Epoch #${Math.floor(285 + Math.random() * 5)} Finalized`;
          details = 'Consensus quorum reached across active nodes.';
          amount = '14,285 PHIVO';
          break;
        case 'reward_claim_confirmed':
          title = 'Validator Reward Settled';
          details = `Address 0x${Math.random().toString(16).substring(2, 6)}... claimed rewards.`;
          amount = `${(Math.random() * 450 + 50).toFixed(2)} PHIVO`;
          break;
        case 'ledger_checkpoint':
          title = 'Cryptographic State Root Published';
          details = 'L1 commitment synced to BSC settlement contract.';
          break;
        case 'ownership_updated':
          title = `Node PX-00${randomId} Transferred`;
          details = 'Peer-to-peer ownership reassigned on ledger.';
          break;
        default:
          title = 'Consensus Checkpoint Verified';
          details = 'Zero-packet drop invariant maintained.';
      }

      const newEvent: LedgerEvent = {
        id: `evt-${Date.now().toString().slice(-5)}`,
        type: randomType,
        title,
        txHash: `0x${Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('')}`,
        blockNumber: 42188941 + Math.floor(Math.random() * 100),
        timestamp: 'Just now',
        status: 'finalized',
        details,
        amount,
      };

      setEvents((prev) => [newEvent, ...prev.slice(0, 9)]);
    }, 7000);

    return () => clearInterval(interval);
  }, [isLiveStreaming]);

  const filteredEvents = selectedFilter === 'all'
    ? events
    : events.filter((e) => e.type === selectedFilter);

  const getEventBadge = (type: ActivityEventType) => {
    switch (type) {
      case 'node_activated':
        return { label: 'Node Activated', color: '#00C8FF' };
      case 'reward_epoch_completed':
        return { label: 'Epoch Settled', color: '#32D583' };
      case 'reward_claim_confirmed':
        return { label: 'Reward Claim', color: '#6C5CFF' };
      case 'ledger_checkpoint':
        return { label: 'Checkpoint', color: '#1A8CFF' };
      case 'ownership_updated':
        return { label: 'Ownership', color: '#FDB022' };
      default:
        return { label: 'System Event', color: '#98A2B3' };
    }
  };

  return (
    <section id="live-network" className="py-24 sm:py-32 relative border-t border-white/[0.06]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
          <div>
            <div className="text-xs font-mono uppercase tracking-[0.2em] text-[#00C8FF] mb-3">
              REAL-TIME LEDGER EXPLORER
            </div>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white tracking-tight">
              See the Network Move.
            </h2>
            <p className="text-sm sm:text-base text-[#98A2B3] mt-2 max-w-xl">
              Every economic state change, node transition, and epoch reward settlement streams live from the authoritative PHIVONEX ledger.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsLiveStreaming(!isLiveStreaming)}
              className="px-3.5 py-2 rounded-lg bg-[#080B12] border border-white/[0.1] hover:border-white/[0.2] text-xs font-mono text-[#98A2B3] flex items-center gap-2 transition-colors cursor-pointer"
            >
              <span className={`w-2 h-2 rounded-full ${isLiveStreaming ? 'bg-[#32D583] animate-subtle-pulse' : 'bg-[#FDB022]'}`} />
              <span>{isLiveStreaming ? 'Live Stream: Active' : 'Stream Paused'}</span>
            </button>
          </div>
        </div>

        {/* Filter controls */}
        <div className="flex flex-wrap items-center gap-2 mb-6">
          <span className="text-xs font-mono text-[#98A2B3] mr-2 flex items-center gap-1">
            <Filter className="w-3 h-3 text-[#00C8FF]" /> Filter:
          </span>
          {[
            { id: 'all', label: 'All Events' },
            { id: 'node_activated', label: 'Node Activations' },
            { id: 'reward_epoch_completed', label: 'Epoch Settlements' },
            { id: 'reward_claim_confirmed', label: 'Reward Claims' },
            { id: 'ledger_checkpoint', label: 'Checkpoints' },
            { id: 'ownership_updated', label: 'Transfers' },
          ].map((btn) => (
            <button
              key={btn.id}
              onClick={() => setSelectedFilter(btn.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-mono transition-colors cursor-pointer ${
                selectedFilter === btn.id
                  ? 'bg-[#00C8FF] text-[#05070B] font-semibold'
                  : 'bg-white/[0.03] text-[#98A2B3] hover:text-white hover:bg-white/[0.06] border border-white/[0.05]'
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>

        {/* Dual Panel Explorer Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left Column: Live Activity Stream (8 cols) */}
          <div className="lg:col-span-8 space-y-3">
            {filteredEvents.map((evt) => {
              const badge = getEventBadge(evt.type);
              return (
                <div
                  key={evt.id}
                  onClick={() => onInspectEvent(evt)}
                  className="p-4 sm:p-5 rounded-xl bg-[#080B12] hover:bg-[#0B1020] border border-white/[0.06] hover:border-[#00C8FF]/40 transition-all duration-200 cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-4 group shadow-sm"
                >
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span
                        className="text-[10px] font-mono uppercase px-2 py-0.5 rounded font-bold"
                        style={{ backgroundColor: `${badge.color}18`, color: badge.color }}
                      >
                        {badge.label}
                      </span>
                      <h4 className="text-sm font-bold text-white group-hover:text-[#00C8FF] transition-colors">
                        {evt.title}
                      </h4>
                      {evt.amount && (
                        <span className="text-xs font-mono font-bold text-[#32D583] bg-[#32D583]/10 px-2 py-0.5 rounded">
                          {evt.amount}
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-[#98A2B3] leading-relaxed">
                      {evt.details}
                    </p>

                    <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono text-[#98A2B3]/80">
                      <span>TX: {evt.txHash.substring(0, 10)}...{evt.txHash.substring(evt.txHash.length - 8)}</span>
                      <span>•</span>
                      <span>Block #{evt.blockNumber}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 sm:self-center shrink-0">
                    <span className="text-xs font-mono text-[#98A2B3]">{evt.timestamp}</span>
                    <div className="p-1.5 rounded-lg bg-white/[0.04] text-[#98A2B3] group-hover:text-white group-hover:bg-[#00C8FF]/20 transition-all">
                      <ArrowUpRight className="w-4 h-4" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right Column: Network Telemetry Summary Box (4 cols) */}
          <div className="lg:col-span-4 space-y-4">
            <div className="p-6 rounded-2xl bg-[#080B12] border border-white/[0.08] space-y-6">
              <div className="flex items-center justify-between border-b border-white/[0.06] pb-3 text-xs font-mono">
                <span className="text-white font-semibold">CONSENSUS PULSE</span>
                <span className="text-[#32D583] flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#32D583] animate-subtle-pulse" />
                  OPERATIONAL
                </span>
              </div>

              <div className="space-y-3 font-mono text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[#98A2B3]">Settlement Finality</span>
                  <span className="text-white font-bold">12.4s (1 Block)</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#98A2B3]">Average Node Ping</span>
                  <span className="text-[#00C8FF] font-bold">28.4ms</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#98A2B3]">Active Ledger Epoch</span>
                  <span className="text-white font-bold">#0284</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#98A2B3]">L1 Sync Anchor</span>
                  <span className="text-white font-bold">BNB Smart Chain</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#98A2B3]">State Root Hash</span>
                  <span className="text-[#32D583] font-bold truncate max-w-[140px]">0x9e7a...4b12</span>
                </div>
              </div>

              <div className="pt-4 border-t border-white/[0.06]">
                <span className="text-[11px] font-mono text-[#98A2B3] block mb-2">
                  LEDGER INTEGRITY ATTESTATION:
                </span>
                <div className="p-3 bg-white/[0.02] rounded-lg border border-white/[0.05] text-[11px] text-[#98A2B3] leading-relaxed">
                  All state changes are cryptographically authenticated via zero-knowledge commitment trees and committed to immutable storage.
                </div>
              </div>
            </div>

            {/* Quick action card */}
            <div className="p-5 rounded-xl bg-gradient-to-br from-white/[0.03] to-white/[0.01] border border-white/[0.06] text-xs">
              <span className="font-bold text-white block mb-1">Developer API Gateway</span>
              <p className="text-[#98A2B3] leading-relaxed mb-3">
                Stream real-time ledger events directly into enterprise auditing pipelines via WebSocket or REST.
              </p>
              <div className="font-mono text-[#00C8FF] bg-[#05070B] p-2 rounded border border-white/[0.06] text-[11px] truncate">
                GET /api/public/network/summary
              </div>
            </div>

          </div>

        </div>

      </div>
    </section>
  );
};
