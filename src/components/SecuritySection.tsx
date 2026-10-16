import React from 'react';
import { KeyRound, ShieldAlert, CheckCheck, Shuffle, FileSearch, LineChart, Lock } from 'lucide-react';

export const SecuritySection: React.FC = () => {
  const securityPillars = [
    {
      title: 'Secure Authentication',
      desc: 'Cryptographic challenge-response handshakes using ECDSA secp256k1 signatures eliminate brittle password attack vectors.',
      icon: KeyRound,
    },
    {
      title: 'Wallet Protection',
      desc: 'Non-custodial architecture guarantees private keys remain on participant hardware. Zero central key escrow.',
      icon: Lock,
    },
    {
      title: 'Transaction Validation',
      desc: 'Formal verification invariants ensure gas limits, sender nonce sequentiality, and balance sufficiency prior to state admission.',
      icon: CheckCheck,
    },
    {
      title: 'Distributed Idempotency',
      desc: 'Double-spend prevention via distributed atomicity locks prevents replay attacks even under severe network partitions.',
      icon: Shuffle,
    },
    {
      title: 'Audit Logging & Forensic Traces',
      desc: 'Every RPC invocation, administrative adjustment, and contract emission is mirrored to a cryptographically sealed WORM log.',
      icon: FileSearch,
    },
    {
      title: 'Infrastructure Monitoring',
      desc: 'Round-the-clock automated penetration heuristics, DDoS mitigation scrubbers, and validator node health probes.',
      icon: LineChart,
    },
  ];

  return (
    <section className="py-24 sm:py-32 relative border-t border-white/[0.06] overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        
        <div className="max-w-3xl mb-16">
          <div className="text-xs font-mono uppercase tracking-[0.2em] text-[#00C8FF] mb-3">
            DEFENSE-IN-DEPTH
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white tracking-tight">
            Enterprise Security Architecture
          </h2>
          <p className="text-sm sm:text-base text-[#98A2B3] mt-3">
            Zero-trust cryptographic protocols built from the silicon level upward to protect node operators and digital assets.
          </p>
        </div>

        {/* Layered Perimeter Technical Diagram */}
        <div className="p-8 sm:p-10 rounded-2xl bg-[#080B12] border border-white/[0.08] mb-12 shadow-2xl">
          <div className="text-xs font-mono text-[#00C8FF] uppercase tracking-wider mb-6 flex items-center justify-between">
            <span>MULTI-LAYER SECURITY PERIMETER</span>
            <span className="text-[#32D583]">HARDENED INVARIANTS</span>
          </div>

          <div className="space-y-3">
            <div className="p-4 rounded-xl bg-gradient-to-r from-[#00C8FF]/10 to-transparent border border-[#00C8FF]/30 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-full bg-[#00C8FF] text-[#05070B] font-mono text-xs font-bold flex items-center justify-center">1</span>
                <div>
                  <span className="text-sm font-bold text-white block">Layer 1: External Perimeter &amp; Transport</span>
                  <span className="text-xs text-[#98A2B3]">Cloudflare Magic Transit DDoS mitigation, TLS 1.3 mTLS inter-service tunnels</span>
                </div>
              </div>
              <span className="text-xs font-mono text-[#00C8FF]">ENCRYPTED WIRE</span>
            </div>

            <div className="p-4 rounded-xl bg-gradient-to-r from-[#1A8CFF]/10 to-transparent border border-[#1A8CFF]/30 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-full bg-[#1A8CFF] text-white font-mono text-xs font-bold flex items-center justify-center">2</span>
                <div>
                  <span className="text-sm font-bold text-white block">Layer 2: Validator Node Network Isolation</span>
                  <span className="text-xs text-[#98A2B3]">Private wireguard peer discovery, zero exposed RPC endpoints, rate-limited gossip</span>
                </div>
              </div>
              <span className="text-xs font-mono text-[#1A8CFF]">ISOLATED MESH</span>
            </div>

            <div className="p-4 rounded-xl bg-gradient-to-r from-[#6C5CFF]/10 to-transparent border border-[#6C5CFF]/30 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-full bg-[#6C5CFF] text-white font-mono text-xs font-bold flex items-center justify-center">3</span>
                <div>
                  <span className="text-sm font-bold text-white block">Layer 3: Cryptographic State Engine</span>
                  <span className="text-xs text-[#98A2B3]">ECDSA deterministic signatures, ACID ledger rollback safeguards, idempotent locks</span>
                </div>
              </div>
              <span className="text-xs font-mono text-[#6C5CFF]">IMMUTABLE ROOT</span>
            </div>
          </div>
        </div>

        {/* 6 Security Topics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {securityPillars.map((item, idx) => {
            const Icon = item.icon;
            return (
              <div
                key={idx}
                className="p-6 rounded-2xl bg-[#080B12] border border-white/[0.06] hover:border-white/[0.15] transition-colors flex flex-col justify-between"
              >
                <div>
                  <div className="w-9 h-9 rounded-xl bg-white/[0.03] text-[#00C8FF] flex items-center justify-center border border-white/[0.06] mb-4">
                    <Icon className="w-4 h-4" />
                  </div>
                  <h3 className="text-base font-bold text-white mb-2">
                    {item.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-[#98A2B3] leading-relaxed">
                    {item.desc}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
};
