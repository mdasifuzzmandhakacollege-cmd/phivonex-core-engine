import React from 'react';
import {
  Server,
  Network,
  Coins,
  ArrowLeftRight,
  Clock,
  Sparkles,
  ArrowRight,
  Layers,
  Lock,
  Radio,
  HelpCircle
} from 'lucide-react';
import { DashboardTab } from './Sidebar';
import { UserProfile } from '../../context/AuthContext';

interface PlaceholderViewProps {
  tab: DashboardTab;
  user: UserProfile | null;
  onNavigateTab: (tab: DashboardTab) => void;
}

export const PlaceholderView: React.FC<PlaceholderViewProps> = ({
  tab,
  user,
  onNavigateTab,
}) => {
  const getTabDetails = () => {
    switch (tab) {
      case 'nodes':
        return {
          title: 'My Node Infrastructure',
          icon: Server,
          phase: 'Phase 2 Protocol Activation',
          status: 'Scheduled in Release Roadmap',
          desc: 'Validator node deployment, hardware telemetry monitoring, and consensus staking will unlock following the Phase 2 Genesis activation.',
          highlights: [
            'Validator Node Tier Allocation',
            'Hardware Telemetry & Proof-of-Work / Proof-of-Stake metrics',
            'Real-Time Block Consensus Sync',
            'Automated Node Uptime Verification',
          ],
        };
      case 'network':
        return {
          title: 'Consensus Network Topology',
          icon: Network,
          phase: 'Phase 2 Topology Engine',
          status: 'Scheduled in Release Roadmap',
          desc: 'Global peer-to-peer network graphing, validator clustering, and cryptographic placement trees will be accessible in Phase 2.',
          highlights: [
            'Dynamic Dual-Leg Network Mapping',
            'Direct & Indirect Referral Tree Traversal',
            'Global Geographic Node Density',
            'Consensus Cluster Health Checks',
          ],
        };
      case 'support':
        return {
          title: 'PHIVONEX Protocol Support Center',
          icon: HelpCircle,
          phase: 'Live Support & Knowledge Desk',
          status: '24/7 Operations Desk',
          desc: 'Get direct technical assistance with node validator deployment, wallet withdrawals, binary structure positioning, and smart account security.',
          highlights: [
            'Direct Operator Support Desk: support@phivonex.com',
            'Official Community Channel: @phivonex_official',
            'Security & Incident Response Desk',
            'Automated Protocol Diagnostics & Status',
          ],
        };
      case 'rewards':
        return {
          title: 'Rewards & Mining Ledger',
          icon: Coins,
          phase: 'Phase 3 Ledger Activation',
          status: 'Scheduled in Release Roadmap',
          desc: 'Automated block rewards, daily mining distributions, and cryptographic ledger claim mechanisms will deploy in Phase 3.',
          highlights: [
            'Daily Mining Yield Calculations',
            'Epoch-Based Ledger Distributions',
            'Matching Bonus Accounting',
            'Cryptographic Claim Verification',
          ],
        };
      case 'transactions':
        return {
          title: 'Ledger Transactions & Activity',
          icon: ArrowLeftRight,
          phase: 'Phase 3 Protocol Ledger',
          status: 'Scheduled in Release Roadmap',
          desc: 'On-chain immutable transactions, transfer history, and multi-signature settlement logs will activate with the protocol ledger.',
          highlights: [
            'Immutable Transaction Hashes & Merkle Roots',
            'Internal Settlement Verification',
            'Exportable Audit Receipts',
            'Smart Contract Interaction History',
          ],
        };
      default:
        return {
          title: 'Upcoming Protocol Module',
          icon: Layers,
          phase: 'Future Protocol Phase',
          status: 'Under Active Architecture',
          desc: 'This capability is part of the phased PHIVONEX protocol architecture and will be deployed in a future milestone.',
          highlights: [
            'Phase-Locked Architectural Feature',
            'Security Audited Implementation',
            'No Mock Balances or Simulated Financials',
          ],
        };
    }
  };

  const details = getTabDetails();
  const Icon = details.icon;

  return (
    <div className="space-y-6 max-w-4xl mx-auto animate-fadeIn">
      <div className="p-6 sm:p-10 rounded-2xl bg-[#07101D] border border-white/[0.08] shadow-2xl relative overflow-hidden text-center sm:text-left">
        {/* Background glow */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-[#00CFFF]/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 relative z-10">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-[#00CFFF]/20 to-[#168BFF]/20 border border-[#00CFFF]/30 flex items-center justify-center text-[#00CFFF] shrink-0 shadow-lg shadow-[#00CFFF]/10">
            <Icon className="w-8 h-8" />
          </div>

          <div className="space-y-4 flex-1">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                <span className="text-[10px] font-mono uppercase bg-[#00CFFF]/10 text-[#00CFFF] border border-[#00CFFF]/30 px-2.5 py-0.5 rounded-full">
                  {details.phase}
                </span>
                <span className="text-[10px] font-mono uppercase bg-white/[0.04] text-[#98A2B3] border border-white/[0.08] px-2.5 py-0.5 rounded-full flex items-center gap-1">
                  <Clock className="w-3 h-3 text-[#98A2B3]" />
                  {details.status}
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight pt-1">
                {details.title}
              </h2>
            </div>

            <p className="text-sm text-[#98A2B3] leading-relaxed max-w-2xl">
              {details.desc}
            </p>

            <div className="pt-2">
              <h3 className="text-xs font-mono uppercase text-[#00CFFF] tracking-wider mb-3">
                Planned Functional Capabilities
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {details.highlights.map((h, i) => (
                  <div
                    key={i}
                    className="p-3 rounded-xl bg-[#05070B] border border-white/[0.06] text-xs text-[#D0D5DD] flex items-center gap-2.5"
                  >
                    <div className="w-1.5 h-1.5 rounded-full bg-[#00CFFF]" />
                    <span>{h}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-4 flex flex-col sm:flex-row items-center gap-3">
              <button
                onClick={() => onNavigateTab('overview')}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-[#00CFFF] hover:bg-[#00CFFF]/90 text-[#05070B] text-xs font-bold transition-all shadow-lg shadow-[#00CFFF]/10 flex items-center justify-center gap-2 cursor-pointer min-h-[44px]"
              >
                <span>Return to Overview</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => onNavigateTab('profile')}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.1] text-xs font-semibold text-white transition-colors cursor-pointer min-h-[44px]"
              >
                Manage Profile
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
