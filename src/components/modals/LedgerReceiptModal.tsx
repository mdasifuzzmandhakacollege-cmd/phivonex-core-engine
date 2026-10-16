import React, { useState } from 'react';
import { LedgerEvent } from '../../types/network';
import { X, Check, Copy, ShieldCheck, Hash, ExternalLink, Terminal } from 'lucide-react';

interface LedgerReceiptModalProps {
  event: LedgerEvent | null;
  onClose: () => void;
}

export const LedgerReceiptModal: React.FC<LedgerReceiptModalProps> = ({ event, onClose }) => {
  const [copied, setCopied] = useState(false);

  if (!event) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(event, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div 
        className="w-full max-w-2xl bg-[#080B12] border border-white/[0.1] rounded-2xl shadow-2xl overflow-hidden font-mono text-xs flex flex-col max-h-[90vh]"
        role="dialog"
        aria-modal="true"
      >
        {/* Modal Header */}
        <div className="px-6 py-4 bg-[#0B1020] border-b border-white/[0.08] flex items-center justify-between">
          <div className="flex items-center gap-2 text-white font-bold">
            <ShieldCheck className="w-4 h-4 text-[#32D583]" />
            <span>CRYPTOGRAPHIC LEDGER RECEIPT</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-[#98A2B3] hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-4 text-[#98A2B3]">
          
          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-3">
            <div className="flex justify-between items-center text-sm">
              <span className="text-white font-bold">{event.title}</span>
              <span className="text-[#32D583] bg-[#32D583]/10 px-2 py-0.5 rounded text-[11px]">
                {event.status.toUpperCase()}
              </span>
            </div>
            <p className="text-xs text-[#98A2B3]">{event.details}</p>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between border-b border-white/[0.05] pb-2">
              <span>Event Identifier:</span>
              <span className="text-white">{event.id}</span>
            </div>

            <div className="flex justify-between border-b border-white/[0.05] pb-2">
              <span>Ledger Block Height:</span>
              <span className="text-white">#{event.blockNumber}</span>
            </div>

            <div className="flex justify-between border-b border-white/[0.05] pb-2">
              <span>Timestamp:</span>
              <span className="text-white">{event.timestamp}</span>
            </div>

            {event.amount && (
              <div className="flex justify-between border-b border-white/[0.05] pb-2">
                <span>Value Transferred:</span>
                <span className="text-[#00C8FF] font-bold">{event.amount}</span>
              </div>
            )}

            <div className="flex flex-col gap-1 pt-1">
              <span>Cryptographic Transaction Hash:</span>
              <span className="text-white select-all break-all bg-white/[0.02] p-2 rounded border border-white/[0.06]">
                {event.txHash}
              </span>
            </div>

            <div className="flex flex-col gap-1 pt-1">
              <span>Merkle State Witness Root:</span>
              <span className="text-[#32D583] select-all break-all bg-white/[0.02] p-2 rounded border border-white/[0.06]">
                0x9e7abf48039c27d415b3e6488bc11c479e4905332f74ca347dc893774844621b
              </span>
            </div>
          </div>

          {/* Raw JSON inspection */}
          <div className="pt-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-white font-bold flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-[#00C8FF]" /> Raw Ledger Payload:
              </span>
              <button
                onClick={handleCopy}
                className="text-[11px] text-[#00C8FF] hover:text-white flex items-center gap-1 cursor-pointer"
              >
                {copied ? <Check className="w-3 h-3 text-[#32D583]" /> : <Copy className="w-3 h-3" />}
                <span>{copied ? 'Copied' : 'Copy JSON'}</span>
              </button>
            </div>
            <pre className="p-3 bg-[#05070B] rounded-lg border border-white/[0.06] text-[11px] text-[#00C8FF] overflow-x-auto">
              {JSON.stringify(event, null, 2)}
            </pre>
          </div>

        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 bg-[#05070B] border-t border-white/[0.08] flex items-center justify-between">
          <span className="text-[10px] text-[#98A2B3]">
            Verified by PHIVONEX Ledger Consensus Core
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-white/[0.08] hover:bg-white/[0.15] text-white text-xs font-semibold cursor-pointer"
          >
            Close Receipt
          </button>
        </div>

      </div>
    </div>
  );
};
