import React from 'react';
import { ArrowDown, Hash, Wallet, Server, Layers, Award, FileCode, CheckCircle2 } from 'lucide-react';

export const TransparencySection: React.FC = () => {
  const verificationCards = [
    {
      title: 'Transaction References',
      desc: 'Every economic ledger event generates an immutable SHA-256 transaction hash that can be audited anytime.',
      icon: Hash,
      tag: 'PUBLIC HASHES',
    },
    {
      title: 'Wallet Activity',
      desc: 'Non-custodial address interactions, signature validations, and authorized transfers are publicly inspectable.',
      icon: Wallet,
      tag: 'NON-CUSTODIAL',
    },
    {
      title: 'Node Ownership',
      desc: 'Deterministic cryptographic mapping proves node allocation, validator address bindings, and license transfers.',
      icon: Server,
      tag: '10,000 REGISTRY',
    },
    {
      title: 'Supply Statistics',
      desc: 'Real-time circulation metrics and locked epoch reserves are mathematically bounded to the 100M hardcap.',
      icon: Layers,
      tag: '100M INVARIANT',
    },
    {
      title: 'Reward Records',
      desc: 'Epoch-by-epoch computational payout distribution calculations are archived with verifiable Merkle proofs.',
      icon: Award,
      tag: 'EPOCH AUDITS',
    },
    {
      title: 'Smart Contract References',
      desc: 'Open-source verified solidity contracts deployed on BNB Smart Chain with verified source code & ABI.',
      icon: FileCode,
      tag: 'VERIFIED CODE',
    },
  ];

  return (
    <section className="py-24 sm:py-32 relative border-t border-white/[0.06]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        <div className="max-w-3xl mb-16">
          <div className="text-xs font-mono uppercase tracking-[0.2em] text-[#00C8FF] mb-3">
            ZERO ASYMMETRY
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white tracking-tight">
            Transparency Is Part of the Product.
          </h2>
          <p className="text-sm sm:text-base text-[#98A2B3] mt-3">
            In traditional systems, internal ledgers are opaque corporate databases. In PHIVONEX, every event flows deterministically through open verification layers.
          </p>
        </div>

        {/* Verification Pipeline Flow */}
        <div className="p-6 sm:p-8 rounded-2xl bg-[#080B12] border border-white/[0.08] mb-12 shadow-xl">
          <span className="text-xs font-mono text-[#00C8FF] uppercase tracking-wider block mb-6 text-center sm:text-left">
            DETERMINISTIC VERIFICATION PIPELINE
          </span>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-center">
            
            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] text-center sm:text-left">
              <span className="text-xs font-mono text-[#98A2B3] block">STEP 01</span>
              <span className="text-sm font-bold text-white block mt-1">Network Event</span>
              <span className="text-[11px] text-[#98A2B3] block mt-0.5">Node action or transaction</span>
            </div>

            <div className="flex sm:flex-col items-center justify-center text-[#00C8FF]">
              <div className="hidden sm:block w-8 h-[1px] bg-gradient-to-r from-white/[0.1] to-[#00C8FF]" />
              <span className="sm:hidden font-mono text-xs">↓</span>
              <span className="hidden sm:inline font-mono text-xs text-center px-1">➜</span>
            </div>

            <div className="p-4 rounded-xl bg-[#00C8FF]/10 border border-[#00C8FF]/30 text-center sm:text-left">
              <span className="text-xs font-mono text-[#00C8FF] block">STEP 02</span>
              <span className="text-sm font-bold text-white block mt-1">PHIVONEX Ledger</span>
              <span className="text-[11px] text-[#98A2B3] block mt-0.5">Merkle root &amp; state commit</span>
            </div>

            <div className="p-4 rounded-xl bg-[#32D583]/10 border border-[#32D583]/30 text-center sm:text-left">
              <span className="text-xs font-mono text-[#32D583] block">STEP 03</span>
              <span className="text-sm font-bold text-white block mt-1">L1 Blockchain Settlement</span>
              <span className="text-[11px] text-[#98A2B3] block mt-0.5">Public explorer verification</span>
            </div>

          </div>
        </div>

        {/* 6 Verifiable Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {verificationCards.map((card, idx) => {
            const Icon = card.icon;
            return (
              <div
                key={idx}
                className="p-6 rounded-2xl bg-[#080B12] border border-white/[0.06] hover:border-[#00C8FF]/30 transition-all duration-200 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-9 h-9 rounded-xl bg-white/[0.03] text-[#00C8FF] flex items-center justify-center border border-white/[0.06]">
                      <Icon className="w-4 h-4" />
                    </div>
                    <span className="text-[10px] font-mono font-bold text-[#98A2B3] bg-white/[0.04] px-2 py-0.5 rounded">
                      {card.tag}
                    </span>
                  </div>

                  <h3 className="text-base font-bold text-white mb-2">
                    {card.title}
                  </h3>

                  <p className="text-xs sm:text-sm text-[#98A2B3] leading-relaxed">
                    {card.desc}
                  </p>
                </div>

                <div className="mt-6 pt-3 border-t border-white/[0.05] flex items-center gap-1.5 text-[11px] font-mono text-[#32D583]">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>Publicly Auditable 24/7</span>
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
};
