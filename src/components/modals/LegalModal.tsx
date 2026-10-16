import React from 'react';
import { X, Shield, FileText, CheckCircle2, AlertTriangle, Download } from 'lucide-react';
import { PhivonexLogo } from '../brand/PhivonexLogo';
import { PhivonexSymbol } from '../brand/PhivonexSymbol';
import { PhivonexAppIcon } from '../brand/PhivonexAppIcon';

interface LegalModalProps {
  title: string | null;
  onClose: () => void;
}

export const LegalModal: React.FC<LegalModalProps> = ({ title, onClose }) => {
  if (!title) return null;

  const getContent = () => {
    switch (title) {
      case 'Brand Guidelines & Assets':
      case 'Brand Assets':
        return (
          <div className="space-y-6 text-xs font-sans text-[#98A2B3] leading-relaxed">
            <div>
              <h4 className="text-sm font-bold text-white font-mono mb-1">Official PHIVONEX Brand Identity</h4>
              <p>
                The PHIVONEX visual identity consists of a geometric futuristic “P”-style network symbol with faceted cyan/blue/violet gradients, three interconnected internal constellation nodes, and the metallic uppercase wordmark with cyan beacon accent.
              </p>
            </div>

            {/* Logo Preview Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Dark Mode Version */}
              <div className="p-4 rounded-xl bg-[#05070B] border border-white/[0.08] space-y-3">
                <span className="text-[10px] font-mono text-[#00CFFF] uppercase block">Primary Logo (Dark Surfaces)</span>
                <div className="h-20 flex items-center justify-center p-3 bg-[#07101D] rounded-lg border border-white/[0.04]">
                  <PhivonexLogo size="md" theme="dark" />
                </div>
                <div className="flex items-center justify-between text-[11px] font-mono pt-1">
                  <span>phivonex-logo.svg</span>
                  <a
                    href="/brand/phivonex-logo.svg"
                    download="phivonex-logo.svg"
                    className="text-[#00CFFF] hover:underline flex items-center gap-1"
                  >
                    <Download className="w-3 h-3" /> Download
                  </a>
                </div>
              </div>

              {/* Light Mode Version */}
              <div className="p-4 rounded-xl bg-[#F8FAFC] border border-slate-200 space-y-3 text-slate-800">
                <span className="text-[10px] font-mono text-[#07101D] uppercase block">Secondary Logo (Light Surfaces)</span>
                <div className="h-20 flex items-center justify-center p-3 bg-white rounded-lg border border-slate-200">
                  <PhivonexLogo size="md" theme="light" />
                </div>
                <div className="flex items-center justify-between text-[11px] font-mono pt-1 text-slate-600">
                  <span>phivonex-logo-light.svg</span>
                  <a
                    href="/brand/phivonex-logo-light.svg"
                    download="phivonex-logo-light.svg"
                    className="text-[#168BFF] hover:underline flex items-center gap-1"
                  >
                    <Download className="w-3 h-3" /> Download
                  </a>
                </div>
              </div>

              {/* Symbol Only */}
              <div className="p-4 rounded-xl bg-[#07101D] border border-white/[0.08] space-y-3">
                <span className="text-[10px] font-mono text-[#00CFFF] uppercase block">Network Symbol &amp; Nodes</span>
                <div className="h-20 flex items-center justify-center gap-6 p-3 bg-[#05070B] rounded-lg border border-white/[0.04]">
                  <PhivonexSymbol size={44} />
                  <PhivonexSymbol size={44} variant="white" />
                </div>
                <div className="flex items-center justify-between text-[11px] font-mono pt-1">
                  <span>phivonex-symbol.svg</span>
                  <a
                    href="/brand/phivonex-symbol.svg"
                    download="phivonex-symbol.svg"
                    className="text-[#00CFFF] hover:underline flex items-center gap-1"
                  >
                    <Download className="w-3 h-3" /> Download
                  </a>
                </div>
              </div>

              {/* App Icon */}
              <div className="p-4 rounded-xl bg-[#07101D] border border-white/[0.08] space-y-3">
                <span className="text-[10px] font-mono text-[#00CFFF] uppercase block">App Icon &amp; PWA Favicon</span>
                <div className="h-20 flex items-center justify-center gap-4 p-3 bg-[#05070B] rounded-lg border border-white/[0.04]">
                  <PhivonexAppIcon size={44} />
                  <span className="text-[11px] text-[#98A2B3] font-mono">192x192 · 512x512 PNG</span>
                </div>
                <div className="flex items-center justify-between text-[11px] font-mono pt-1">
                  <span>phivonex-app-icon-512.png</span>
                  <a
                    href="/brand/phivonex-app-icon-512.png"
                    download="phivonex-app-icon-512.png"
                    className="text-[#00CFFF] hover:underline flex items-center gap-1"
                  >
                    <Download className="w-3 h-3" /> Download
                  </a>
                </div>
              </div>
            </div>

            {/* Brand Rules & Color Tokens */}
            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-3">
              <h5 className="font-mono text-white text-xs font-bold uppercase">Color System Tokens</h5>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-[10px] font-mono">
                <div className="p-2 rounded bg-[#05070B] border border-white/20 text-center">
                  <div className="w-full h-4 rounded bg-[#05070B] mb-1 border border-white/10" />
                  <span>#05070B</span>
                </div>
                <div className="p-2 rounded bg-[#07101D] border border-white/20 text-center">
                  <div className="w-full h-4 rounded bg-[#07101D] mb-1" />
                  <span>#07101D</span>
                </div>
                <div className="p-2 rounded bg-white/[0.04] border border-white/10 text-center">
                  <div className="w-full h-4 rounded bg-[#00CFFF] mb-1" />
                  <span className="text-[#00CFFF]">#00CFFF</span>
                </div>
                <div className="p-2 rounded bg-white/[0.04] border border-white/10 text-center">
                  <div className="w-full h-4 rounded bg-[#168BFF] mb-1" />
                  <span className="text-[#168BFF]">#168BFF</span>
                </div>
                <div className="p-2 rounded bg-white/[0.04] border border-white/10 text-center">
                  <div className="w-full h-4 rounded bg-[#1760E8] mb-1" />
                  <span className="text-[#1760E8]">#1760E8</span>
                </div>
                <div className="p-2 rounded bg-white/[0.04] border border-white/10 text-center">
                  <div className="w-full h-4 rounded bg-[#7057FF] mb-1" />
                  <span className="text-[#7057FF]">#7057FF</span>
                </div>
              </div>
              <div className="text-[11px] text-[#98A2B3] pt-1">
                <strong>Clear Space Rule:</strong> Maintain at least 25% of the symbol width as empty padding around all borders and text elements.
              </div>
            </div>
          </div>
        );

      case 'Terms of Service':
        return (
          <div className="space-y-4 text-xs font-sans text-[#98A2B3] leading-relaxed">
            <h4 className="text-sm font-bold text-white font-mono">1. Agreement to Terms</h4>
            <p>
              By accessing the PHIVONEX network website, running validator nodes, or querying the public ledger API, you agree to be bound by protocol specifications, network consensus standards, and applicable technological guidelines.
            </p>
            <h4 className="text-sm font-bold text-white font-mono">2. Node Operator Invariants</h4>
            <p>
              Node operators are independently responsible for maintaining uninterrupted server uptime, valid cryptographic keys, and adhering to validator latency limits. The network implements automated slashing and penalization rules for malicious double-signing.
            </p>
            <h4 className="text-sm font-bold text-white font-mono">3. No Guaranteed Outcomes</h4>
            <p>
              PHIVONEX does not guarantee any economic yield or token appreciation. Rewards represent computational compensation generated through deterministic mathematical algorithms.
            </p>
          </div>
        );

      case 'Risk Disclosure':
        return (
          <div className="space-y-4 text-xs font-sans text-[#98A2B3] leading-relaxed">
            <div className="p-3 bg-[#FDB022]/10 border border-[#FDB022]/30 rounded-lg text-[#FDB022] flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Digital asset protocols, blockchain nodes, and cryptographic systems involve inherent risks.</span>
            </div>
            <h4 className="text-sm font-bold text-white font-mono">Technical &amp; Execution Risks</h4>
            <p>
              Validator hardware failure, power interruptions, software bugs in node client implementations, or internet service provider partitions may result in missed epoch attestations.
            </p>
            <h4 className="text-sm font-bold text-white font-mono">Regulatory Risks</h4>
            <p>
              The regulatory treatment of digital assets, decentralized autonomous organizations, and node participation remains dynamic. Operators must verify their jurisdictional compliance.
            </p>
          </div>
        );

      case 'Privacy Policy':
        return (
          <div className="space-y-4 text-xs font-sans text-[#98A2B3] leading-relaxed">
            <h4 className="text-sm font-bold text-white font-mono">Zero Invasive Data Collection</h4>
            <p>
              PHIVONEX does not collect or sell personal identifying data, track behavioral profiling cookies, or harvest biometric telemetry. Interactions with the protocol are mediated purely via cryptographic public addresses.
            </p>
            <h4 className="text-sm font-bold text-white font-mono">Public Ledger Data</h4>
            <p>
              Please note that all transactions, node registrations, and epoch claims published to the PHIVONEX economic ledger and BNB Smart Chain are publicly viewable by nature of decentralized ledger technology.
            </p>
          </div>
        );

      case 'Cookie Policy':
        return (
          <div className="space-y-4 text-xs font-sans text-[#98A2B3] leading-relaxed">
            <h4 className="text-sm font-bold text-white font-mono">Essential Session Storage Only</h4>
            <p>
              The PHIVONEX interface uses only essential local storage tokens necessary to persist operator theme choices and testnet wallet connection states. No third-party tracking or advertising scripts are executed.
            </p>
          </div>
        );

      case 'AML & Sanctions Compliance':
        return (
          <div className="space-y-4 text-xs font-sans text-[#98A2B3] leading-relaxed">
            <h4 className="text-sm font-bold text-white font-mono">Sanctions Screening &amp; Protocol Integrity</h4>
            <p>
              The PHIVONEX foundation strictly adheres to international AML, counter-terrorist financing, and sanctions guidelines. Public wallet addresses identified on OFAC, EU, or international sanctions lists are prohibited from node registration.
            </p>
          </div>
        );

      case 'Restricted Jurisdictions':
        return (
          <div className="space-y-4 text-xs font-sans text-[#98A2B3] leading-relaxed">
            <h4 className="text-sm font-bold text-white font-mono">Geographic Limitations</h4>
            <p>
              Access to node participation and primary allocation may be restricted for residents or citizens of countries subject to comprehensive sanctions, including Cuba, Iran, North Korea, Syria, and the Crimea/Donetsk/Luhansk regions.
            </p>
          </div>
        );

      case 'Smart Contract ABI':
        return (
          <div className="space-y-4 text-xs font-mono text-[#98A2B3] leading-relaxed">
            <div className="flex items-center justify-between text-white font-bold">
              <span>Solidity ABI Definition // PhivonexRegistryCore.sol</span>
              <span className="text-[#32D583]">Compiler: v0.8.24</span>
            </div>
            <pre className="p-4 bg-[#05070B] rounded-xl border border-white/[0.08] text-[11px] text-[#00CFFF] overflow-x-auto max-h-80">
{`[
  {
    "inputs": [],
    "name": "MAX_COIN_SUPPLY",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function",
    "constant": true,
    "value": "100000000000000000000000000"
  },
  {
    "inputs": [],
    "name": "GENESIS_NODE_CAP",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function",
    "constant": true,
    "value": "10000"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "nodeId", "type": "uint256" }],
    "name": "getNodeStatus",
    "outputs": [
      { "internalType": "address", "name": "operator", "type": "address" },
      { "internalType": "uint8", "name": "state", "type": "uint8" },
      { "internalType": "uint256", "name": "lastAttestationEpoch", "type": "uint256" }
    ],
    "stateMutability": "view",
    "type": "function"
  }
]`}
            </pre>
          </div>
        );

      default:
        return (
          <div className="space-y-4 text-xs font-sans text-[#98A2B3] leading-relaxed">
            <h4 className="text-sm font-bold text-white font-mono">{title}</h4>
            <p>
              Official technical document maintained by the PHIVONEX core developer engineering working group. Complete documentation, whitepapers, and integration guides are updated with each minor protocol epoch.
            </p>
          </div>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div 
        className="w-full max-w-2xl bg-[#080B12] border border-white/[0.1] rounded-2xl shadow-2xl overflow-hidden font-sans text-xs flex flex-col max-h-[90vh]"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="px-6 py-4 bg-[#0B1020] border-b border-white/[0.08] flex items-center justify-between">
          <div className="flex items-center gap-2 text-white font-bold font-mono">
            <FileText className="w-4 h-4 text-[#00CFFF]" />
            <span className="uppercase">{title}</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-[#98A2B3] hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto">
          {getContent()}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-[#05070B] border-t border-white/[0.08] flex items-center justify-between">
          <span className="text-[10px] font-mono text-[#98A2B3]">
            PHIVONEX Protocol Governance
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-white/[0.08] hover:bg-white/[0.15] text-white text-xs font-semibold cursor-pointer"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
};
