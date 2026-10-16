import React, { useState } from 'react';
import { X, Wallet, ShieldCheck, Server, ArrowRight, CheckCircle2, Radio, Zap } from 'lucide-react';
import { PhivonexAppIcon } from '../brand/PhivonexAppIcon';

interface LaunchAppModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LaunchAppModal: React.FC<LaunchAppModalProps> = ({ isOpen, onClose }) => {
  const [walletConnected, setWalletConnected] = useState(false);
  const [activeTab, setActiveTab] = useState<'nodes' | 'faucet' | 'console'>('nodes');
  const [pingSuccess, setPingSuccess] = useState(false);

  if (!isOpen) return null;

  const handleConnectWallet = () => {
    setWalletConnected(true);
  };

  const handleTestPing = () => {
    setPingSuccess(true);
    setTimeout(() => setPingSuccess(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div 
        className="w-full max-w-2xl bg-[#080B12] border border-white/[0.1] rounded-2xl shadow-2xl overflow-hidden font-mono text-xs flex flex-col max-h-[90vh]"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="px-6 py-4 bg-[#0B1020] border-b border-white/[0.08] flex items-center justify-between">
          <div className="flex items-center gap-3 text-white font-bold">
            <PhivonexAppIcon size={26} glow={false} />
            <span>PHIVONEX Decentralized Operator Portal</span>
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
        <div className="p-6 overflow-y-auto space-y-6">
          
          {/* Wallet connection banner */}
          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <span className="text-white font-bold block text-sm">
                {walletConnected ? 'Wallet Connected (Simulation)' : 'Connect Operator Wallet'}
              </span>
              <span className="text-xs text-[#98A2B3]">
                {walletConnected ? 'Address: 0x71aE...49B1 (Testnet Authorized)' : 'Non-custodial cryptographic signature authentication'}
              </span>
            </div>

            {!walletConnected ? (
              <button
                onClick={handleConnectWallet}
                className="px-4 py-2 text-xs font-semibold text-[#05070B] bg-[#00C8FF] hover:bg-white rounded-lg transition-colors flex items-center gap-2 cursor-pointer self-start sm:self-center shrink-0"
              >
                <Wallet className="w-3.5 h-3.5" />
                <span>Connect Wallet</span>
              </button>
            ) : (
              <span className="px-3 py-1 rounded-full bg-[#32D583]/15 text-[#32D583] border border-[#32D583]/30 text-xs font-bold flex items-center gap-1.5 self-start sm:self-center shrink-0">
                <CheckCircle2 className="w-3.5 h-3.5" />
                CONNECTED
              </span>
            )}
          </div>

          {/* Tab Navigation */}
          <div className="flex items-center gap-2 border-b border-white/[0.06] pb-2">
            <button
              onClick={() => setActiveTab('nodes')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                activeTab === 'nodes' ? 'bg-[#00C8FF]/15 text-[#00C8FF] font-bold' : 'text-[#98A2B3] hover:text-white'
              }`}
            >
              Genesis Node Explorer
            </button>
            <button
              onClick={() => setActiveTab('faucet')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                activeTab === 'faucet' ? 'bg-[#00C8FF]/15 text-[#00C8FF] font-bold' : 'text-[#98A2B3] hover:text-white'
              }`}
            >
              Hardware Validator Ping
            </button>
          </div>

          {activeTab === 'nodes' && (
            <div className="space-y-3">
              <span className="text-xs text-[#98A2B3] block">
                Select a Genesis Node to simulate validator activation and state commitment:
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 rounded-xl bg-[#0B1020] border border-white/[0.08] space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-white font-bold">PX-NODE-003743</span>
                    <span className="text-[#32D583] text-[10px]">AVAILABLE</span>
                  </div>
                  <div className="text-[11px] text-[#98A2B3]">
                    Tranche: Tier 2 (Expansion)
                    <br />
                    Price: 1,250 USDT
                  </div>
                  <button
                    onClick={handleTestPing}
                    className="w-full py-1.5 bg-[#00C8FF]/10 text-[#00C8FF] hover:bg-[#00C8FF] hover:text-[#05070B] rounded border border-[#00C8FF]/30 transition-all font-bold cursor-pointer"
                  >
                    Simulate Allocation
                  </button>
                </div>

                <div className="p-3.5 rounded-xl bg-[#0B1020] border border-white/[0.08] space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-white font-bold">PX-NODE-003744</span>
                    <span className="text-[#32D583] text-[10px]">AVAILABLE</span>
                  </div>
                  <div className="text-[11px] text-[#98A2B3]">
                    Tranche: Tier 2 (Expansion)
                    <br />
                    Price: 1,250 USDT
                  </div>
                  <button
                    onClick={handleTestPing}
                    className="w-full py-1.5 bg-[#00C8FF]/10 text-[#00C8FF] hover:bg-[#00C8FF] hover:text-[#05070B] rounded border border-[#00C8FF]/30 transition-all font-bold cursor-pointer"
                  >
                    Simulate Allocation
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'faucet' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-2">
                <span className="text-white font-bold block">Heartbeat Benchmark Engine</span>
                <p className="text-xs text-[#98A2B3] leading-relaxed">
                  Send a zero-knowledge latency packet across the 22 simulated regional nodes to benchmark validator consensus responsiveness.
                </p>
                <button
                  onClick={handleTestPing}
                  className="px-4 py-2 bg-[#00C8FF] text-[#05070B] font-bold rounded-lg hover:bg-white transition-colors cursor-pointer flex items-center gap-2"
                >
                  <Radio className="w-4 h-4" />
                  <span>Transmit Network Heartbeat</span>
                </button>
              </div>

              {pingSuccess && (
                <div className="p-3 rounded-lg bg-[#32D583]/10 border border-[#32D583]/30 text-[#32D583] flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>Heartbeat Verified: 18ms latency across 22 relay nodes. Invariant state valid.</span>
                </div>
              )}
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-[#05070B] border-t border-white/[0.08] flex items-center justify-between">
          <span className="text-[10px] text-[#98A2B3]">
            PHIVONEX Testnet Environment v1.4.2
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
