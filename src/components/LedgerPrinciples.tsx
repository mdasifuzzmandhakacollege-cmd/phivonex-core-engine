import React from 'react';
import { Database, Hash, Repeat, GitCommit, ShieldCheck, Check } from 'lucide-react';

export const LedgerPrinciples: React.FC = () => {
  const principles = [
    {
      title: 'Immutable Event History',
      icon: Database,
      tag: 'APPEND-ONLY LOG',
      desc: 'All economic interactions, node allocations, and reward disbursements are written to an append-only event stream where past states can never be altered, mutated, or removed.',
      techSpec: 'Cryptographic SHA-256 Merkle DAG with parent hash referencing.',
    },
    {
      title: 'Unique Transaction References',
      icon: Hash,
      tag: 'DETERMINISTIC UUID',
      desc: 'Every single state change carries a collision-free, cryptographically verifiable transaction identifier linked to the initiating entity, timestamp, and epoch nonce.',
      techSpec: 'Deterministic UUID v5 + ECDSA signature commitment.',
    },
    {
      title: 'Idempotent Processing',
      icon: Repeat,
      tag: 'ZERO DOUBLE SPEND',
      desc: 'Repeated or retried RPC requests produce identical deterministic state transitions without risk of duplicate execution, double-claiming, or supply desynchronization.',
      techSpec: 'Strict idempotency keys with distributed Redis redlock guards.',
    },
    {
      title: 'Continuous Reconciliation',
      icon: GitCommit,
      tag: 'AUTOMATED AUDIT',
      desc: 'High-frequency background reconciliation daemons cross-validate in-memory caches against PostgreSQL ledger storage and external L1 blockchain settlement contracts.',
      techSpec: 'Sub-second discrepancy detection with automatic halt safeguards.',
    },
    {
      title: 'Audit History & Provable Proofs',
      icon: ShieldCheck,
      tag: 'VERIFIABLE INTEGRITY',
      desc: 'Enterprise partners, auditors, and node operators can independently verify ledger consistency using mathematical zero-knowledge state proofs without trusting any central party.',
      techSpec: 'Open-access public root verification for every 100-block boundary.',
    },
  ];

  return (
    <section id="ledger" className="py-24 sm:py-32 relative border-t border-white/[0.06]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        <div className="max-w-3xl mb-16">
          <div className="text-xs font-mono uppercase tracking-[0.2em] text-[#00C8FF] mb-3">
            CRYPTOGRAPHIC CERTAINTY
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white tracking-tight">
            Ledger Architecture Principles
          </h2>
          <p className="text-sm sm:text-base text-[#98A2B3] mt-3">
            Engineered from first principles for financial settlement, high concurrency, and mathematical transparency.
          </p>
        </div>

        {/* 5 Architecture Cards in 2/3 Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {principles.map((item, idx) => {
            const Icon = item.icon;
            return (
              <div
                key={idx}
                className="p-6 rounded-2xl bg-[#080B12] border border-white/[0.08] hover:border-[#00C8FF]/30 transition-all duration-200 flex flex-col justify-between group"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-10 h-10 rounded-xl bg-[#00C8FF]/10 text-[#00C8FF] flex items-center justify-center border border-[#00C8FF]/20 group-hover:scale-105 transition-transform">
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className="text-[10px] font-mono font-bold text-[#98A2B3] bg-white/[0.04] px-2.5 py-1 rounded">
                      {item.tag}
                    </span>
                  </div>

                  <h3 className="text-lg font-bold text-white mb-2 group-hover:text-[#00C8FF] transition-colors">
                    {item.title}
                  </h3>

                  <p className="text-xs sm:text-sm text-[#98A2B3] leading-relaxed mb-6">
                    {item.desc}
                  </p>
                </div>

                <div className="pt-4 border-t border-white/[0.06] font-mono text-[11px] text-[#00C8FF] bg-white/[0.01] -mx-6 -mb-6 p-4 rounded-b-2xl border-t">
                  <span className="text-[#98A2B3] block text-[10px] mb-0.5">TECHNICAL IMPLEMENTATION:</span>
                  {item.techSpec}
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
};
