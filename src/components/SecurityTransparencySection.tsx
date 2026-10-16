import React from 'react';
import { ShieldCheck, Lock, CheckCircle, FileText, Search, Key, Database, ArrowUpRight } from 'lucide-react';

interface SecurityTransparencySectionProps {
  onOpenWhitepaper?: () => void;
  onExploreExplorer?: () => void;
}

export const SecurityTransparencySection: React.FC<SecurityTransparencySectionProps> = ({
  onOpenWhitepaper,
  onExploreExplorer,
}) => {
  const securityItems = [
    {
      title: 'Secure Authentication',
      desc: 'Cryptographic public/private key pairs and multi-signature authorization prevent unauthorized node actions.',
      icon: Key,
    },
    {
      title: 'Transaction Validation',
      desc: 'Every state transition is verified by independent consensus nodes before inclusion in finalized blocks.',
      icon: CheckCircle,
    },
    {
      title: 'Idempotent Processing',
      desc: 'Duplicate requests and replayed transactions are mathematically rejected by strict sequence nonce enforcement.',
      icon: Database,
    },
    {
      title: 'Audit Records',
      desc: 'Complete immutable historical audit trails are preserved across all epochs and node state mutations.',
      icon: FileText,
    },
    {
      title: 'Smart Contract Verification',
      desc: 'Deterministic smart contract and protocol logic enforce the 100M coin cap and 10,000 node ceiling without backdoors.',
      icon: ShieldCheck,
    },
    {
      title: 'Transaction References & Explorer Access',
      desc: 'Public block explorers and open RPC gateways permit independent third-party verification of all ledger hashes.',
      icon: Search,
    },
  ];

  return (
    <section className="py-20 sm:py-28 relative border-t border-white/[0.06] bg-[#05070B] overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16 space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.03] border border-white/[0.08] text-xs font-mono text-[#00CFFF]">
            <Lock className="w-3.5 h-3.5" />
            <span>ENTERPRISE-GRADE ASSURANCE</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-[#F7FAFC] tracking-tight">
            Security &amp; Transparency
          </h2>
          <p className="text-sm sm:text-base text-[#98A2B3] leading-relaxed">
            PHIVONEX is engineered for institutional certainty. Protocol security, deterministic validation, and public auditability are built directly into the core consensus layer.
          </p>
        </div>

        {/* 6 Enterprise Security Pillars */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
          {securityItems.map((item, idx) => {
            const Icon = item.icon;
            return (
              <div
                key={idx}
                className="p-6 rounded-2xl bg-[#07101D]/90 border border-white/[0.08] hover:border-[#00CFFF]/40 transition-all duration-200 group flex flex-col justify-between"
              >
                <div>
                  <div className="w-10 h-10 rounded-xl bg-[#00CFFF]/10 border border-[#00CFFF]/20 flex items-center justify-center text-[#00CFFF] mb-4 group-hover:scale-105 transition-transform">
                    <Icon className="w-5 h-5" />
                  </div>
                  <h3 className="text-base font-bold text-[#F7FAFC] mb-2 group-hover:text-[#00CFFF] transition-colors">
                    {item.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-[#98A2B3] leading-relaxed">
                    {item.desc}
                  </p>
                </div>

                <div className="mt-6 pt-4 border-t border-white/[0.06] flex items-center justify-between text-[11px] font-mono text-[#98A2B3]">
                  <span>Standard TLS 1.3 / Ed25519</span>
                  <span className="text-[#32D583]">Compliant</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Verification Strip */}
        <div className="p-6 rounded-2xl bg-gradient-to-r from-[#07101D] via-[#0A1428] to-[#07101D] border border-white/[0.08] flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-mono">
          <div className="flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-[#32D583]" />
            <span className="text-white">Smart Contract Verified &amp; Open for Independent Audit</span>
          </div>
          <button
            onClick={onOpenWhitepaper}
            className="text-[#00CFFF] hover:text-white transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <span>Review Security Whitepaper</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>

      </div>
    </section>
  );
};
