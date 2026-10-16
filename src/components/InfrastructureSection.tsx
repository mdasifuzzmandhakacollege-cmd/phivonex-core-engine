import React from 'react';
import { Network, Server, Database, Radio, Laptop, ArrowRight, Layers, Check } from 'lucide-react';

export const InfrastructureSection: React.FC = () => {
  const stackTags = [
    'API-First Architecture',
    'Event-Driven Reactive Core',
    'Transactional Ledger Engine',
    'PostgreSQL Relational Ledger',
    'Redis In-Memory State Cache',
    'Transactional Outbox Pattern',
    'WebSocket & SSE Realtime',
    'Strict Idempotency Guards',
    'Distributed Redlock Coordination',
    'Sub-Second Reconciliation',
    'Cryptographic Audit Trail',
    'Cloud-Native Kubernetes Federation',
  ];

  return (
    <section className="py-24 sm:py-32 relative border-t border-white/[0.06] overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        
        <div className="max-w-3xl mb-16">
          <div className="text-xs font-mono uppercase tracking-[0.2em] text-[#00C8FF] mb-3">
            BACKEND ENGINEERING
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white tracking-tight">
            Infrastructure Designed Beyond the Interface.
          </h2>
          <p className="text-sm sm:text-base text-[#98A2B3] mt-3">
            A resilient, distributed backend pipeline engineered for extreme throughput, zero state drift, and high availability.
          </p>
        </div>

        {/* Visualized Backend Architecture Pipeline */}
        <div className="p-8 sm:p-10 rounded-3xl bg-[#080B12] border border-white/[0.08] shadow-2xl mb-12">
          
          <div className="text-xs font-mono text-[#00C8FF] uppercase tracking-wider mb-8 flex items-center justify-between">
            <span>END-TO-END DATAFLOW PIPELINE</span>
            <span className="text-[#32D583]">MICROSECOND INTERNAL BUS</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-center text-xs font-mono">
            
            {/* Step 1 */}
            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] text-center">
              <span className="text-[#00C8FF] block text-[10px] mb-1">01 INGRESS</span>
              <span className="text-sm font-bold text-white block">API Gateway</span>
              <span className="text-[10px] text-[#98A2B3] block mt-1">mTLS &amp; Rate Limit</span>
            </div>

            <div className="hidden md:flex justify-center text-[#00C8FF]">➜</div>

            {/* Step 2 */}
            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] text-center">
              <span className="text-[#00C8FF] block text-[10px] mb-1">02 LOGIC</span>
              <span className="text-sm font-bold text-white block">Core Services</span>
              <span className="text-[10px] text-[#98A2B3] block mt-1">Validation &amp; Nonce</span>
            </div>

            <div className="hidden md:flex justify-center text-[#00C8FF]">➜</div>

            {/* Step 3 */}
            <div className="p-4 rounded-xl bg-[#00C8FF]/10 border border-[#00C8FF]/30 text-center">
              <span className="text-[#00C8FF] block text-[10px] mb-1">03 SETTLEMENT</span>
              <span className="text-sm font-bold text-white block">Economic Ledger</span>
              <span className="text-[10px] text-[#32D583] block mt-1">ACID State Store</span>
            </div>

            <div className="hidden md:flex justify-center text-[#00C8FF]">➜</div>

            {/* Step 4 */}
            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] text-center">
              <span className="text-[#00C8FF] block text-[10px] mb-1">04 REALTIME</span>
              <span className="text-sm font-bold text-white block">Realtime Gateway</span>
              <span className="text-[10px] text-[#98A2B3] block mt-1">WebSocket / SSE</span>
            </div>

          </div>

          <div className="mt-8 pt-6 border-t border-white/[0.06] grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs font-mono text-[#98A2B3]">
            <div className="p-3 bg-white/[0.01] rounded-lg border border-white/[0.04]">
              <strong className="text-white block mb-0.5">PostgreSQL &amp; Redis</strong>
              Primary relational ledger coupled with distributed cache locks for 100k+ op/sec.
            </div>
            <div className="p-3 bg-white/[0.01] rounded-lg border border-white/[0.04]">
              <strong className="text-white block mb-0.5">Transactional Outbox Pattern</strong>
              Guarantees at-least-once external event delivery and prevents dual-write failures.
            </div>
            <div className="p-3 bg-white/[0.01] rounded-lg border border-white/[0.04]">
              <strong className="text-white block mb-0.5">Automated Reconciliation</strong>
              Continuous consistency checking matches DB records against L1 state roots.
            </div>
          </div>

        </div>

        {/* 12 Production Infrastructure Highlights */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {stackTags.map((tag, idx) => (
            <div
              key={idx}
              className="p-3.5 rounded-xl bg-[#080B12] border border-white/[0.06] text-xs font-mono text-[#F5F7FA] flex items-center gap-2.5"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-[#00C8FF]" />
              <span className="truncate">{tag}</span>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
};
