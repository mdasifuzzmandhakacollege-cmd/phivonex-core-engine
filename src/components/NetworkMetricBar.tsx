import React from 'react';
import { NetworkSummary } from '../types/network';
import { ShieldCheck, ArrowUpRight, Cpu, Layers, Radio, Activity } from 'lucide-react';

interface NetworkMetricBarProps {
  metrics: NetworkSummary;
  onViewLedger: () => void;
  isApiConnected?: boolean;
}

export const NetworkMetricBar: React.FC<NetworkMetricBarProps> = ({ 
  metrics, 
  onViewLedger,
  isApiConnected = false 
}) => {
  const cards = [
    {
      label: 'Maximum Coin Supply',
      value: '100,000,000',
      subtext: 'Immutable Protocol Cap',
      indicator: 'fixed',
      icon: Layers,
    },
    {
      label: 'Genesis Node Supply',
      value: '10,000',
      subtext: 'Hardcoded Maximum',
      indicator: 'fixed',
      icon: Cpu,
    },
    {
      label: 'Active Nodes',
      value: isApiConnected ? metrics.activeNodes.toLocaleString() : 'Live (Connecting)',
      subtext: isApiConnected ? 'Validated Operators' : 'Mainnet Sync in Progress',
      indicator: 'live',
      icon: Radio,
    },
    {
      label: 'Remaining Nodes',
      value: isApiConnected ? metrics.availableNodes.toLocaleString() : '10,000 Available',
      subtext: isApiConnected ? `${metrics.allocationPercent}% Allocated` : 'Primary Stage 1',
      indicator: 'live',
      icon: Activity,
    },
    {
      label: 'Network Transactions',
      value: isApiConnected ? metrics.networkTransactions.toLocaleString() : 'Live Data Available in Explorer',
      subtext: 'Verifiable Ledger Events',
      indicator: 'live',
      icon: ShieldCheck,
    },
    {
      label: 'Network Status',
      value: 'OPERATIONAL',
      subtext: 'Consensus Online',
      indicator: 'operational',
      icon: Radio,
    },
  ];

  return (
    <section className="relative z-20 -mt-8 mb-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* Integrity banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 bg-[#07101D]/90 border border-white/[0.08] rounded-t-xl text-xs font-mono text-[#98A2B3] backdrop-blur-md">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#32D583]" />
          <span className="text-[#F7FAFC] font-medium">KEY PROTOCOL METRICS</span>
          <span className="text-white/30 hidden sm:inline">|</span>
          <span className="text-[#00CFFF] hidden sm:inline">LAYER-1 NODE CONSENSUS</span>
        </div>
        <button
          onClick={onViewLedger}
          className="text-xs text-[#00CFFF] hover:text-white flex items-center gap-1 transition-colors cursor-pointer"
        >
          <span>View Live Network</span>
          <ArrowUpRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Grid of 6 metric cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-[1px] bg-white/[0.08] border-x border-b border-white/[0.08] rounded-b-xl overflow-hidden shadow-2xl">
        {cards.map((card, idx) => {
          const isOperational = card.indicator === 'operational';
          const isLive = card.indicator === 'live';

          return (
            <div
              key={idx}
              className="p-4 sm:p-5 bg-[#07101D]/95 hover:bg-[#0A1428] transition-colors duration-200 flex flex-col justify-between group"
            >
              <div className="flex items-center justify-between text-xs text-[#98A2B3] mb-3">
                <span className="truncate pr-1">{card.label}</span>
                {isOperational ? (
                  <span className="w-1.5 h-1.5 rounded-full bg-[#32D583]" />
                ) : isLive ? (
                  <span className="w-1.5 h-1.5 rounded-full bg-[#00CFFF]" />
                ) : (
                  <span className="text-[10px] font-mono text-[#98A2B3]/70">CAP</span>
                )}
              </div>

              <div>
                <div className={`text-lg sm:text-xl font-bold font-mono tracking-tight tabular-nums transition-colors ${
                  isOperational ? 'text-[#32D583]' : 'text-white group-hover:text-[#00CFFF]'
                }`}>
                  {card.value}
                </div>
                <div className="text-[11px] text-[#98A2B3] mt-1 truncate">
                  {card.subtext}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
