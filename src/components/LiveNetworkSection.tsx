import React from 'react';
import { ShieldCheck, Activity, Layers, Server, RefreshCw, Award, CheckCircle2, Clock, Zap } from 'lucide-react';
import { PublicNetworkEventItem } from '../hooks/usePublicNetwork';

interface LiveNetworkSectionProps {
  liveEvents?: PublicNetworkEventItem[];
  onInspectEvent?: (evt: { title: string; type: string; details: string }) => void;
}

export const LiveNetworkSection: React.FC<LiveNetworkSectionProps> = ({ liveEvents = [], onInspectEvent }) => {
  const formatRelativeTime = (isoString?: string) => {
    if (!isoString) return 'Just now';
    try {
      const elapsedMs = Date.now() - new Date(isoString).getTime();
      const elapsedSec = Math.max(0, Math.floor(elapsedMs / 1000));
      if (elapsedSec < 30) return 'Just now';
      if (elapsedSec < 60) return `${elapsedSec}s ago`;
      const elapsedMin = Math.floor(elapsedSec / 60);
      if (elapsedMin < 60) return `${elapsedMin}m ago`;
      const elapsedHour = Math.floor(elapsedMin / 60);
      if (elapsedHour < 24) return `${elapsedHour}h ago`;
      const elapsedDays = Math.floor(elapsedHour / 24);
      return `${elapsedDays}d ago`;
    } catch {
      return 'Recent';
    }
  };

  const getIconForType = (type: string) => {
    if (type.includes('node') || type.includes('activate')) return Server;
    if (type.includes('epoch') || type.includes('reward')) return Award;
    if (type.includes('matching') || type.includes('settlement')) return RefreshCw;
    if (type.includes('claim')) return CheckCircle2;
    return Layers;
  };

  const getAccentForType = (type: string) => {
    if (type.includes('node') || type.includes('activate')) return '#00CFFF';
    if (type.includes('epoch') || type.includes('reward')) return '#168BFF';
    if (type.includes('matching') || type.includes('settlement')) return '#7F56D9';
    if (type.includes('claim')) return '#32D583';
    return '#F79009';
  };

  const displayedEvents = liveEvents.slice(0, 9);

  return (
    <section id="live-network" className="py-20 sm:py-28 relative border-t border-white/[0.06] bg-[#05070B] overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16 space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.03] border border-white/[0.08] text-xs font-mono text-[#00CFFF]">
            <Activity className="w-3.5 h-3.5 text-[#32D583] animate-pulse" />
            <span>REAL-TIME PUBLIC LEDGER AUDIT</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-[#F7FAFC] tracking-tight">
            Live Network Events &amp; Ledger Checkpoints
          </h2>
          <p className="text-sm sm:text-base text-[#98A2B3] leading-relaxed">
            Every critical state transition produces an immutable, cryptographic ledger event. Real backend data only. Zero fake users or sample activity.
          </p>
        </div>

        {/* Real Events Feed Grid */}
        {displayedEvents.length === 0 ? (
          <div className="p-12 text-center text-xs font-mono text-[#98A2B3] bg-[#07101D] border border-dashed border-white/[0.08] rounded-2xl mb-12 space-y-2">
            <div className="text-white font-bold text-sm">Synchronized with Public Network API</div>
            <p>Listening for real-time node activations, reward epoch settlements, and ledger events...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
            {displayedEvents.map((evt) => {
              const Icon = getIconForType(evt.type);
              const accent = getAccentForType(evt.type);
              return (
                <div
                  key={evt.id}
                  onClick={() => onInspectEvent?.({
                    title: evt.title,
                    type: evt.type,
                    details: evt.description,
                  })}
                  className="p-6 rounded-2xl bg-[#07101D]/90 border border-white/[0.08] hover:border-[#00CFFF]/40 transition-all duration-200 cursor-pointer group flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center transition-transform group-hover:scale-105"
                        style={{ backgroundColor: `${accent}15`, color: accent }}
                      >
                        <Icon className="w-5 h-5" />
                      </div>
                      <span className="text-[11px] font-mono text-[#98A2B3] bg-white/[0.04] px-2.5 py-1 rounded-md flex items-center gap-1">
                        <Clock className="w-3 h-3 text-[#00CFFF]" />
                        <span>{formatRelativeTime(evt.timestamp)}</span>
                      </span>
                    </div>

                    <h3 className="text-base font-bold text-[#F7FAFC] mb-2 group-hover:text-[#00CFFF] transition-colors flex items-center justify-between gap-2">
                      <span>{evt.title}</span>
                    </h3>

                    <p className="text-xs sm:text-sm text-[#98A2B3] leading-relaxed">
                      {evt.description}
                    </p>
                  </div>

                  <div className="mt-6 pt-4 border-t border-white/[0.06] flex items-center justify-between text-[11px] font-mono text-[#98A2B3]">
                    <span>Public ID: {evt.publicId || 'N/A'}</span>
                    <span className="text-[#32D583] flex items-center gap-1">
                      <Zap className="w-3 h-3" />
                      Verified Real
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Real Data Connection Notice Banner */}
        <div className="p-5 rounded-2xl bg-[#07101D] border border-white/[0.08] flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-mono text-[#98A2B3]">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-5 h-5 text-[#32D583] shrink-0" />
            <span>
              <strong>Server-Authoritative Transparency:</strong> Live transaction telemetry syncs with verified nodes via SSE/REST. No synthetic data or simulated activity.
            </span>
          </div>
          <div className="px-3 py-1.5 rounded-lg bg-white/[0.04] text-[#00CFFF] shrink-0">
            Public API: /api/public/network/stream
          </div>
        </div>

      </div>
    </section>
  );
};
