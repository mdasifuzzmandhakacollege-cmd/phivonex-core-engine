import React, { useState, useEffect } from 'react';
import { Terminal, Shield, RefreshCw, CheckCircle, AlertTriangle, Play, Pause } from 'lucide-react';
import { RewardCalculator } from './RewardCalculator';

interface RewardConsoleProps {
  activeNodes?: number;
  onLaunchApp?: () => void;
}

export const RewardConsole: React.FC<RewardConsoleProps> = ({
  activeNodes = 3689,
  onLaunchApp,
}) => {
  const [accrued, setAccrued] = useState(48.24);
  const [claimed, setClaimed] = useState(312.80);
  const [epochSeconds, setEpochSeconds] = useState(412); // seconds remaining in 600s epoch
  const [isSimulating, setIsSimulating] = useState(true);

  // Subtle real-time increment to demonstrate active protocol accrual
  useEffect(() => {
    if (!isSimulating) return;
    const timer = setInterval(() => {
      setAccrued((prev) => +(prev + 0.02).toFixed(2));
      setEpochSeconds((prev) => (prev <= 0 ? 600 : prev - 1));
    }, 2500);
    return () => clearInterval(timer);
  }, [isSimulating]);

  const progressPercent = Math.min(100, Math.round(((600 - epochSeconds) / 600) * 100));

  return (
    <section id="rewards" className="py-24 sm:py-32 relative border-t border-white/[0.06] overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        <div className="max-w-3xl mb-12">
          <div className="text-xs font-mono uppercase tracking-[0.2em] text-[#00C8FF] mb-3">
            VALIDATOR TELEMETRY &amp; ESTIMATION
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white tracking-tight">
            Protocol Reward Console
          </h2>
          <p className="text-sm sm:text-base text-[#98A2B3] mt-3">
            Real-time telemetry interface demonstrating an individual active Genesis Node participating in epoch validation alongside mathematical reward projection modeling.
          </p>
        </div>

        {/* The Node Console Frame */}
        <div className="rounded-2xl bg-[#080B12] border border-white/[0.1] shadow-2xl overflow-hidden font-mono">
          
          {/* Console Header Bar */}
          <div className="px-6 py-4 bg-[#0B1020] border-b border-white/[0.08] flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-[#F04438]/80" />
                <span className="w-3 h-3 rounded-full bg-[#FDB022]/80" />
                <span className="w-3 h-3 rounded-full bg-[#32D583]/80" />
              </div>
              <span className="text-xs text-white font-semibold tracking-wider">
                NODE TELEMETRY CONSOLE // PX-SESSION-004217
              </span>
            </div>

            <div className="flex items-center gap-4 text-xs">
              <span className="text-[#32D583] flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#32D583] animate-subtle-pulse" />
                STATUS: ACTIVE
              </span>
              <button
                onClick={() => setIsSimulating(!isSimulating)}
                className="text-[#98A2B3] hover:text-white flex items-center gap-1 cursor-pointer transition-colors"
                title={isSimulating ? 'Pause Telemetry Simulation' : 'Resume Telemetry Simulation'}
              >
                {isSimulating ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 text-[#00C8FF]" />}
                <span>{isSimulating ? 'Live Feed' : 'Paused'}</span>
              </button>
            </div>
          </div>

          {/* Console Body Grid */}
          <div className="p-6 sm:p-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            
            {/* Card 1: Node Identifier */}
            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
              <span className="text-xs text-[#98A2B3] block mb-1">NODE IDENTIFIER</span>
              <span className="text-lg sm:text-xl font-bold text-white block truncate">
                PX-NODE-004217
              </span>
              <span className="text-[11px] text-[#00C8FF] block mt-1">
                Cluster: EU-Central-02
              </span>
            </div>

            {/* Card 2: Current Epoch */}
            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
              <span className="text-xs text-[#98A2B3] block mb-1">CURRENT EPOCH</span>
              <span className="text-lg sm:text-xl font-bold text-white block">
                #0284
              </span>
              <div className="flex items-center justify-between text-[11px] text-[#98A2B3] mt-1">
                <span>Progress: {progressPercent}%</span>
                <span>{epochSeconds}s rem</span>
              </div>
              <div className="w-full h-1.5 bg-white/[0.05] rounded-full overflow-hidden mt-1.5">
                <div
                  className="h-full bg-[#00C8FF] rounded-full transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            {/* Card 3: Accrued in Current Epoch */}
            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
              <span className="text-xs text-[#98A2B3] block mb-1">ACCRUED IN EPOCH</span>
              <span className="text-lg sm:text-xl font-bold text-[#00C8FF] block tabular-nums">
                {accrued.toFixed(2)} PHIV
              </span>
              <span className="text-[11px] text-[#32D583] block mt-1">
                State: Accruing Uptime Proofs
              </span>
            </div>

            {/* Card 4: Historical Claimed */}
            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
              <span className="text-xs text-[#98A2B3] block mb-1">SETTLED &amp; CLAIMED</span>
              <span className="text-lg sm:text-xl font-bold text-white block tabular-nums">
                {claimed.toFixed(2)} PHIV
              </span>
              <span className="text-[11px] text-[#98A2B3] block mt-1">
                Last Checkpoint: 8m ago
              </span>
            </div>

          </div>

          {/* Verification Log Stream inside the Console */}
          <div className="px-6 py-4 bg-[#05070B] border-t border-white/[0.06] text-xs font-mono text-[#98A2B3] space-y-2">
            <div className="flex items-center gap-2 text-white">
              <span className="text-[#00C8FF]">➜</span>
              <span>Attestation Engine: Consensus packet verified with 0x4a9...b71</span>
              <span className="text-white/40 ml-auto hidden sm:inline">RTT: 18ms</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[#32D583]">✓</span>
              <span>Merkle Root Checkpoint committed to L1 settlement bridge</span>
              <span className="text-white/40 ml-auto hidden sm:inline">Block #42188941</span>
            </div>
          </div>

          {/* Mandatory Trust & Risk Disclaimer */}
          <div className="px-6 py-3 bg-[#0B1020] border-t border-white/[0.08] text-[11px] text-[#98A2B3] flex items-center gap-2">
            <Shield className="w-4 h-4 text-[#FDB022] shrink-0" />
            <span>
              <strong>Protocol Governance Policy:</strong> PHIVONEX rewards are dynamically computed from computational uptime and consensus activity. There is no guaranteed return, fixed percentage, or passive income promise.
            </span>
          </div>

        </div>

        {/* Integrated Reward Calculator Component */}
        <RewardCalculator
          activeNodes={activeNodes}
          onActionClick={onLaunchApp}
        />

      </div>
    </section>
  );
};
