import React from 'react';
import { PhivonexLogo } from './brand/PhivonexLogo';

interface FooterProps {
  onOpenLegal: (title: string) => void;
  onExploreClick: () => void;
}

export const Footer: React.FC<FooterProps> = ({ onOpenLegal, onExploreClick }) => {
  return (
    <footer className="bg-[#05070B] border-t border-white/[0.08] text-xs text-[#98A2B3] font-sans">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-16">
        
        {/* Main Grid: Brand + 5 Link Columns */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-8 mb-12">
          
          {/* Brand Info Column */}
          <div className="col-span-2 space-y-4">
            <PhivonexLogo size="md" />
            <p className="text-xs text-[#98A2B3] max-w-sm leading-relaxed">
              Decentralized Layer-1 blockchain infrastructure powering a transparent node economy with strict supply invariants.
            </p>
            <div className="text-[11px] font-mono text-[#00CFFF]">
              SHA-256 Protocol Ledger Architecture
            </div>
          </div>

          {/* 1. Ecosystem */}
          <div className="space-y-3">
            <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-[#F7FAFC]">
              Ecosystem
            </h4>
            <ul className="space-y-2.5">
              <li>
                <a href="#coin" className="hover:text-[#00CFFF] transition-colors">
                  Coin
                </a>
              </li>
              <li>
                <a href="#nodes" className="hover:text-[#00CFFF] transition-colors">
                  Nodes
                </a>
              </li>
              <li>
                <a href="#live-network" className="hover:text-[#00CFFF] transition-colors">
                  Live Network
                </a>
              </li>
            </ul>
          </div>

          {/* 2. Resources */}
          <div className="space-y-3">
            <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-[#F7FAFC]">
              Resources
            </h4>
            <ul className="space-y-2.5">
              <li>
                <button
                  onClick={() => onOpenLegal('Technical Whitepaper')}
                  className="hover:text-[#00CFFF] transition-colors text-left cursor-pointer"
                >
                  Documentation
                </button>
              </li>
              <li>
                <button
                  onClick={() => onOpenLegal('Smart Contract ABI & Verification')}
                  className="hover:text-[#00CFFF] transition-colors text-left cursor-pointer"
                >
                  Smart Contracts
                </button>
              </li>
              <li>
                <a href="#roadmap" className="hover:text-[#00CFFF] transition-colors">
                  Roadmap
                </a>
              </li>
              <li>
                <a href="#faq" className="hover:text-[#00CFFF] transition-colors">
                  FAQ
                </a>
              </li>
            </ul>
          </div>

          {/* 3. Company */}
          <div className="space-y-3">
            <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-[#F7FAFC]">
              Company
            </h4>
            <ul className="space-y-2.5">
              <li>
                <button
                  onClick={() => onOpenLegal('About PHIVONEX Foundation')}
                  className="hover:text-[#00CFFF] transition-colors text-left cursor-pointer"
                >
                  About
                </button>
              </li>
              <li>
                <button
                  onClick={() => onOpenLegal('Contact & Operator Relations')}
                  className="hover:text-[#00CFFF] transition-colors text-left cursor-pointer"
                >
                  Contact
                </button>
              </li>
            </ul>
          </div>

          {/* 4. Legal */}
          <div className="space-y-3">
            <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-[#F7FAFC]">
              Legal
            </h4>
            <ul className="space-y-2.5">
              <li>
                <button
                  onClick={() => onOpenLegal('Terms of Service')}
                  className="hover:text-[#00CFFF] transition-colors text-left cursor-pointer"
                >
                  Terms of Service
                </button>
              </li>
              <li>
                <button
                  onClick={() => onOpenLegal('Privacy Policy')}
                  className="hover:text-[#00CFFF] transition-colors text-left cursor-pointer"
                >
                  Privacy Policy
                </button>
              </li>
              <li>
                <button
                  onClick={() => onOpenLegal('Risk Disclosure')}
                  className="hover:text-[#00CFFF] transition-colors text-left cursor-pointer"
                >
                  Risk Disclosure
                </button>
              </li>
              <li>
                <button
                  onClick={() => onOpenLegal('AML & Compliance Protocol')}
                  className="hover:text-[#00CFFF] transition-colors text-left cursor-pointer"
                >
                  AML / Compliance
                </button>
              </li>
              <li>
                <button
                  onClick={() => onOpenLegal('Restricted Jurisdictions Policy')}
                  className="hover:text-[#00CFFF] transition-colors text-left cursor-pointer"
                >
                  Restricted Jurisdictions
                </button>
              </li>
            </ul>
          </div>

        </div>

        {/* Community Links & Copyright */}
        <div className="pt-8 border-t border-white/[0.08] flex flex-col sm:flex-row items-center justify-between gap-4">
          
          {/* Community links */}
          <div className="flex items-center gap-6 text-xs font-mono">
            <span className="text-[#F7FAFC] font-medium">Community:</span>
            <a href="https://x.com" target="_blank" rel="noreferrer" className="hover:text-[#00CFFF] transition-colors">
              X
            </a>
            <a href="https://telegram.org" target="_blank" rel="noreferrer" className="hover:text-[#00CFFF] transition-colors">
              Telegram
            </a>
            <a href="https://discord.com" target="_blank" rel="noreferrer" className="hover:text-[#00CFFF] transition-colors">
              Discord
            </a>
            <a href="https://github.com" target="_blank" rel="noreferrer" className="hover:text-[#00CFFF] transition-colors">
              GitHub
            </a>
          </div>

          {/* Copyright */}
          <div className="text-[11px] font-mono text-[#98A2B3]">
            © 2026 PHIVONEX. All rights reserved.
          </div>

        </div>

      </div>
    </footer>
  );
};
