import React, { useState } from 'react';
import { Copy, Check, ExternalLink, ShieldCheck, FileCode, CheckCircle2 } from 'lucide-react';

interface SmartContractSectionProps {
  contractAddress: string;
  networkName: string;
  onViewAbi: () => void;
}

export const SmartContractSection: React.FC<SmartContractSectionProps> = ({
  contractAddress,
  networkName,
  onViewAbi,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(contractAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <section className="py-24 sm:py-32 relative border-t border-white/[0.06]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        <div className="max-w-3xl mb-16">
          <div className="text-xs font-mono uppercase tracking-[0.2em] text-[#00C8FF] mb-3">
            BSC SMART CONTRACT DEPLOYMENT
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white tracking-tight">
            Smart Contract Verification
          </h2>
          <p className="text-sm sm:text-base text-[#98A2B3] mt-3">
            All token mint limits, Genesis Node registry rules, and epoch checkpoint attestations are cryptographically governed by publicly verified smart contracts.
          </p>
        </div>

        {/* Verified Contract Card */}
        <div className="p-6 sm:p-10 rounded-3xl bg-[#080B12] border border-white/[0.08] shadow-2xl relative overflow-hidden">
          
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.06] pb-6 mb-8">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#32D583]/10 text-[#32D583] flex items-center justify-center border border-[#32D583]/20">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">PHIVONEX Protocol Core Registry</h3>
                <span className="text-xs text-[#98A2B3] font-mono">Solidity v0.8.24 // Formal Verification Passed</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-full bg-[#32D583]/15 text-[#32D583] border border-[#32D583]/30 text-xs font-mono font-bold flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                VERIFIED &amp; AUDITED
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 text-xs font-mono">
            <div>
              <span className="text-[#98A2B3] block mb-1">SETTLEMENT NETWORK</span>
              <span className="text-base font-bold text-white block">{networkName}</span>
              <span className="text-[11px] text-[#32D583] block mt-0.5">Chain ID: 56 // L1 Anchor Finalized</span>
            </div>

            <div>
              <span className="text-[#98A2B3] block mb-1">CONTRACT ADDRESS</span>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-sm font-bold text-[#00C8FF] select-all truncate bg-white/[0.03] px-3 py-1.5 rounded-lg border border-white/[0.06]">
                  {contractAddress}
                </span>
                <button
                  onClick={handleCopy}
                  className="px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-white flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-[#32D583]" />
                      <span className="text-[#32D583] font-bold">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          <div className="pt-6 border-t border-white/[0.06] flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-[#98A2B3]">
              <a
                href={`https://bscscan.com/address/${contractAddress}`}
                target="_blank"
                rel="noreferrer"
                className="hover:text-white flex items-center gap-1 transition-colors"
              >
                <span>View on BscScan Explorer</span>
                <ExternalLink className="w-3.5 h-3.5 text-[#00C8FF]" />
              </a>
              <span>•</span>
              <button
                onClick={onViewAbi}
                className="hover:text-white flex items-center gap-1 transition-colors cursor-pointer text-[#00C8FF]"
              >
                <FileCode className="w-3.5 h-3.5" />
                <span>Inspect Contract ABI &amp; Interface</span>
              </button>
            </div>

            <span className="text-xs font-mono text-[#98A2B3]">
              Bytecode Hash: <strong className="text-white">0x7d81...e492</strong>
            </span>
          </div>

        </div>

      </div>
    </section>
  );
};
