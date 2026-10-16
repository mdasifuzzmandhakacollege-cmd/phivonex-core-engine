import React from 'react';
import { NetworkSummary } from '../types/network';
import { Activity, ShieldCheck, Cpu, Database, Radio, CheckCircle } from 'lucide-react';

interface NetworkIntelligenceProps {
  summary: NetworkSummary;
}

export const NetworkIntelligence: React.FC<NetworkIntelligenceProps> = ({ summary }) => {
  // Minimalist sparkline data representation
  const sparklinePoints = [32, 38, 42, 40, 48, 55, 52, 60, 68, 64, 72, 78, 85, 82, 91, 95];
  const maxPoint = Math.max(...sparklinePoints);
  const minPoint = Math.min(...sparklinePoints);

  const metrics = [
    { label: 'Coin Maximum Supply', value: '100,000,000', sub: 'Absolute Hardcap', accent: '#00C8FF' },
    { label: 'Genesis Nodes Target', value: '10,000', sub: 'Fixed Validator Cap', accent: '#1A8CFF' },
    { label: 'Nodes Activated', value: summary.activeNodes.toLocaleString(), sub: '36.89% Active', accent: '#32D583' },
    { label: 'Nodes Available', value: summary.availableNodes.toLocaleString(), sub: '6,258 Remaining', accent: '#98A2B3' },
    { label: 'Current Reward Epoch', value: `#${summary.currentRewardEpoch}`, sub: '68% Interval Progress', accent: '#6C5CFF' },
    { label: 'Reward Events Settled', value: '18,492', sub: 'Cryptographically Verified', accent: '#00C8FF' },
    { label: 'Network Transactions', value: summary.networkTransactions.toLocaleString(), sub: 'Throughput: 84 TPS', accent: '#32D583' },
    { label: 'Latest Checkpoint', value: summary.lastLedgerCheckpoint, sub: 'L1 Synced', accent: '#8247FF' },
  ];

  return (
    <section className="py-24 sm:py-32 relative border-t border-white/[0.06]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-16">
          <div>
            <div className="text-xs font-mono uppercase tracking-[0.2em] text-[#00C8FF] mb-3">
              CONSENSUS TELEMETRY
            </div>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white tracking-tight">
              Network Intelligence Command Center
            </h2>
            <p className="text-sm sm:text-base text-[#98A2B3] mt-2 max-w-xl">
              Real-time cryptographic consensus metrics, epoch progress, and ledger consistency benchmarks.
            </p>
          </div>

          <div className="px-3.5 py-1.5 rounded-lg bg-[#080B12] border border-white/[0.08] text-xs font-mono text-[#32D583] flex items-center gap-2 self-start md:self-end">
            <span className="w-2 h-2 rounded-full bg-[#32D583] animate-subtle-pulse" />
            <span>ALL SYSTEMS OPERATIONAL</span>
          </div>
        </div>

        {/* 8 Command Center Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {metrics.map((m, idx) => (
            <div
              key={idx}
              className="p-5 rounded-xl bg-[#080B12] border border-white/[0.06] hover:border-white/[0.15] transition-colors"
            >
              <span className="text-xs text-[#98A2B3] block mb-2">{m.label}</span>
              <span className="text-xl sm:text-2xl font-bold font-mono text-white tracking-tight tabular-nums block truncate">
                {m.value}
              </span>
              <span className="text-[11px] font-mono text-[#98A2B3] block mt-1">
                {m.sub}
              </span>
            </div>
          ))}
        </div>

        {/* Minimalist Telemetry Chart & Consensus Health Card */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Chart Left (8 cols) */}
          <div className="lg:col-span-8 p-6 sm:p-8 rounded-2xl bg-[#080B12] border border-white/[0.08]">
            <div className="flex items-center justify-between mb-6 text-xs font-mono">
              <div>
                <span className="text-white font-bold block text-sm">Throughput Activity (TPS Sparkline)</span>
                <span className="text-[#98A2B3]">24-hour ledger validation frequency</span>
              </div>
              <span className="text-[#00C8FF] font-bold">PEAK: 112 TPS</span>
            </div>

            {/* Minimal SVG Sparkline chart */}
            <div className="h-44 w-full relative flex items-end">
              <svg className="w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 100 100">
                <defs>
                  <linearGradient id="chartGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#00C8FF" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="#00C8FF" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* Area Fill */}
                <polygon
                  points={`0,100 ${sparklinePoints.map((pt, i) => `${(i / (sparklinePoints.length - 1)) * 100},${100 - ((pt - minPoint) / (maxPoint - minPoint)) * 80}`).join(' ')} 100,100`}
                  fill="url(#chartGrad)"
                />

                {/* Stroke Line */}
                <polyline
                  fill="none"
                  stroke="#00C8FF"
                  strokeWidth="2"
                  points={sparklinePoints.map((pt, i) => `${(i / (sparklinePoints.length - 1)) * 100},${100 - ((pt - minPoint) / (maxPoint - minPoint)) * 80}`).join(' ')}
                />
              </svg>
            </div>

            <div className="flex items-center justify-between text-[11px] font-mono text-[#98A2B3] mt-4 pt-3 border-t border-white/[0.06]">
              <span>T - 24 Hours</span>
              <span>Average Block Finality: 12.2s</span>
              <span>Present Moment</span>
            </div>
          </div>

          {/* Health Right (4 cols) */}
          <div className="lg:col-span-4 p-6 sm:p-8 rounded-2xl bg-[#080B12] border border-white/[0.08] flex flex-col justify-between">
            <div>
              <span className="text-xs font-mono text-[#00C8FF] uppercase tracking-wider block mb-2">
                SECURITY INVARIANTS
              </span>
              <h3 className="text-lg font-bold text-white mb-4">
                Consensus Health Proof
              </h3>

              <div className="space-y-3 text-xs font-mono text-[#98A2B3]">
                <div className="flex items-center justify-between pb-2 border-b border-white/[0.05]">
                  <span>Double-Sign Protection</span>
                  <span className="text-[#32D583] flex items-center gap-1">
                    <CheckCircle className="w-3.5 h-3.5" /> Enforced
                  </span>
                </div>

                <div className="flex items-center justify-between pb-2 border-b border-white/[0.05]">
                  <span>Byzantine Fault Quorum</span>
                  <span className="text-[#32D583]">67% Verified</span>
                </div>

                <div className="flex items-center justify-between pb-2 border-b border-white/[0.05]">
                  <span>State Invariant Drift</span>
                  <span className="text-white">0.000000%</span>
                </div>

                <div className="flex items-center justify-between">
                  <span>Audit Merkle Depth</span>
                  <span className="text-white">32 Levels</span>
                </div>
              </div>
            </div>

            <div className="mt-6 p-3 rounded-xl bg-white/[0.02] border border-white/[0.05] text-[11px] font-mono text-[#98A2B3]">
              &quot;Consensus invariants are mathematically audited continuously against L1 smart contract proofs.&quot;
            </div>
          </div>

        </div>

      </div>
    </section>
  );
};
