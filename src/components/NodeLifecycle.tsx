import React, { useState } from 'react';
import { CheckCircle2, Server, Key, Radio, Award, Database, ArrowRight } from 'lucide-react';

export const NodeLifecycle: React.FC = () => {
  const [activeStepIndex, setActiveStepIndex] = useState(2); // 'ACTIVE' default

  const steps = [
    {
      id: 'available',
      badge: '01',
      title: 'AVAILABLE',
      short: 'Unallocated Registry',
      icon: Server,
      desc: 'Node slot resides in the unallocated Genesis registry smart contract pending allocation.',
      technical: 'State = Unclaimed. Token ID generated with cryptographic deterministic seed.',
    },
    {
      id: 'reserved',
      badge: '02',
      title: 'RESERVED',
      short: 'Wallet Binding',
      icon: Key,
      desc: 'Participant address commits tranche funding and locks ownership credential.',
      technical: 'Transaction signed with non-custodial wallet; lock-in period verified on BNB Smart Chain.',
    },
    {
      id: 'active',
      badge: '03',
      title: 'ACTIVE',
      short: 'Validator Sync',
      icon: Radio,
      desc: 'Node cryptographic keypair synchronizes with the PHIVONEX mesh network topology.',
      technical: 'Zero-knowledge node handshake; heartbeat signal confirmed at <45ms average latency.',
    },
    {
      id: 'participating',
      badge: '04',
      title: 'PARTICIPATING',
      short: 'Consensus Proofs',
      icon: CheckCircle2,
      desc: 'Node performs block state validation, cryptographic checkpointing, and consensus relay.',
      technical: 'Produces verifiable state witness attestations every 12-second block window.',
    },
    {
      id: 'reward-checkpoint',
      badge: '05',
      title: 'REWARD CHECKPOINT',
      short: 'Epoch Settlement',
      icon: Award,
      desc: 'Epoch concludes; computational uptime benchmark determines protocol reward allocation.',
      technical: 'Merkle root calculated for 3,689 active nodes; rewards accrued to epoch balance.',
    },
    {
      id: 'ledger-record',
      badge: '06',
      title: 'LEDGER RECORD',
      short: 'Immutable State',
      icon: Database,
      desc: 'All state transitions and reward claims are permanently committed to the ledger.',
      technical: 'State transition hash published with dual L1 commitment hash for public auditability.',
    },
  ];

  return (
    <section className="py-24 sm:py-32 relative border-t border-white/[0.06]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        <div className="max-w-3xl mb-16">
          <div className="text-xs font-mono uppercase tracking-[0.2em] text-[#00C8FF] mb-3">
            STATE MACHINE SPECIFICATION
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white tracking-tight">
            Node Lifecycle Architecture
          </h2>
          <p className="text-sm sm:text-base text-[#98A2B3] mt-3">
            Every Genesis Node transitions through six strictly defined deterministic states. Explore each phase of node operation.
          </p>
        </div>

        {/* Timeline Bar (Desktop Horizontal) */}
        <div className="hidden lg:grid grid-cols-6 gap-2 mb-8 relative">
          {/* Connector line */}
          <div className="absolute top-1/2 left-4 right-4 h-[2px] bg-white/[0.08] -translate-y-1/2 z-0" />

          {steps.map((step, idx) => {
            const isSelected = activeStepIndex === idx;
            const isPassed = idx < activeStepIndex;
            const Icon = step.icon;

            return (
              <button
                key={step.id}
                onClick={() => setActiveStepIndex(idx)}
                className={`relative z-10 flex flex-col items-center text-center p-3 rounded-xl transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-[#080B12] ring-1 ring-[#00C8FF] shadow-lg shadow-[#00C8FF]/10'
                    : 'hover:bg-white/[0.03]'
                }`}
              >
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-mono text-xs font-bold mb-2 transition-all ${
                    isSelected
                      ? 'bg-[#00C8FF] text-[#05070B] shadow-md shadow-[#00C8FF]/30 scale-110'
                      : isPassed
                      ? 'bg-[#32D583]/20 text-[#32D583] border border-[#32D583]/40'
                      : 'bg-[#080B12] text-[#98A2B3] border border-white/[0.1]'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </div>
                <span className={`text-xs font-bold tracking-tight block ${isSelected ? 'text-[#00C8FF]' : 'text-white'}`}>
                  {step.title}
                </span>
                <span className="text-[10px] text-[#98A2B3] block truncate max-w-full">
                  {step.short}
                </span>
              </button>
            );
          })}
        </div>

        {/* Mobile / Active Step Detail Showcase */}
        <div className="p-6 sm:p-8 rounded-2xl bg-[#080B12] border border-white/[0.08] shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-80 h-80 bg-[#00C8FF]/[0.03] rounded-full blur-3xl pointer-events-none" />

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            
            <div className="lg:col-span-8 space-y-4">
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono font-bold px-2.5 py-1 rounded bg-[#00C8FF]/10 text-[#00C8FF] border border-[#00C8FF]/20">
                  STAGE {steps[activeStepIndex].badge} OF 06
                </span>
                <span className="text-xs font-mono text-[#98A2B3]">
                  PROTOCOL INVARIANT CHECK
                </span>
              </div>

              <h3 className="text-2xl sm:text-3xl font-extrabold text-white">
                {steps[activeStepIndex].title}: {steps[activeStepIndex].short}
              </h3>

              <p className="text-base text-[#98A2B3] leading-relaxed">
                {steps[activeStepIndex].desc}
              </p>

              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] font-mono text-xs text-[#00C8FF]">
                <strong className="text-white block mb-1">Low-Level Machine Execution:</strong>
                {steps[activeStepIndex].technical}
              </div>
            </div>

            <div className="lg:col-span-4 flex flex-col gap-2">
              <span className="text-xs font-mono text-[#98A2B3] mb-1">SELECT STAGE TO AUDIT:</span>
              <div className="grid grid-cols-2 lg:grid-cols-1 gap-2">
                {steps.map((s, i) => (
                  <button
                    key={s.id}
                    onClick={() => setActiveStepIndex(i)}
                    className={`px-3 py-2 text-xs font-mono text-left rounded-lg border transition-all cursor-pointer flex items-center justify-between ${
                      activeStepIndex === i
                        ? 'bg-[#00C8FF]/15 border-[#00C8FF] text-white'
                        : 'bg-white/[0.02] border-white/[0.05] text-[#98A2B3] hover:text-white hover:bg-white/[0.04]'
                    }`}
                  >
                    <span>{s.badge}. {s.title}</span>
                    <ArrowRight className="w-3.5 h-3.5 opacity-50" />
                  </button>
                ))}
              </div>
            </div>

          </div>
        </div>

      </div>
    </section>
  );
};
