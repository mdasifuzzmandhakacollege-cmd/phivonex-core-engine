import React from 'react';
import { UserCheck, Wallet, Compass, Power, Activity, Network, ArrowRight } from 'lucide-react';

interface HowItWorksProps {
  onStartAction: () => void;
}

export const HowItWorks: React.FC<HowItWorksProps> = ({ onStartAction }) => {
  const steps = [
    {
      num: '01',
      title: 'Create Account',
      desc: 'Register cryptographic authorization credentials secured by multi-factor authentication or Web3 keypairs.',
      icon: UserCheck,
      details: 'Instant verification without invasive data extraction.',
    },
    {
      num: '02',
      title: 'Access Wallet',
      desc: 'Connect your non-custodial wallet infrastructure to securely authorize transactions and verify digital signatures.',
      icon: Wallet,
      details: 'Full compatibility with EVM-based non-custodial wallets.',
    },
    {
      num: '03',
      title: 'Explore Nodes',
      desc: 'Inspect the live Genesis Node registry, available tranche tiers, and verifiable hardware criteria.',
      icon: Compass,
      details: 'Review transparent allocation parameters and on-ledger capacity.',
    },
    {
      num: '04',
      title: 'Activate Node',
      desc: 'Bind your node license to a validator client and broadcast the cryptographic heartbeat to the network mesh.',
      icon: Power,
      details: 'Automated cluster configuration scripts for Linux & Docker.',
    },
    {
      num: '05',
      title: 'Monitor Node',
      desc: 'Track epoch uptime, consensus attestations, latency metrics, and accrued protocol rewards in real-time.',
      icon: Activity,
      details: '24/7 telemetry console with instant event notifications.',
    },
    {
      num: '06',
      title: 'Participate in Ecosystem',
      desc: 'Deploy decentralized applications, participate in parameter governance votes, and verify economic ledger state.',
      icon: Network,
      details: 'Direct access to institutional APIs and developer toolkits.',
    },
  ];

  return (
    <section className="py-24 sm:py-32 relative border-t border-white/[0.06]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-16">
          <div>
            <div className="text-xs font-mono uppercase tracking-[0.2em] text-[#00C8FF] mb-3">
              OPERATIONAL ONBOARDING
            </div>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white tracking-tight">
              How PHIVONEX Works
            </h2>
            <p className="text-sm sm:text-base text-[#98A2B3] mt-2 max-w-xl">
              From cryptographic wallet setup to active validator participation: six systematic, transparent steps.
            </p>
          </div>

          <button
            onClick={onStartAction}
            className="px-5 py-2.5 text-xs font-semibold text-[#05070B] bg-[#00C8FF] hover:bg-white rounded-lg transition-colors flex items-center gap-1.5 self-start md:self-end cursor-pointer"
          >
            <span>Create Account</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* 6 Steps Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {steps.map((step, idx) => {
            const Icon = step.icon;
            return (
              <div
                key={idx}
                className="p-6 rounded-2xl bg-[#080B12] border border-white/[0.08] hover:border-[#00C8FF]/30 transition-all duration-200 flex flex-col justify-between group"
              >
                <div>
                  <div className="flex items-center justify-between mb-6">
                    <span className="text-3xl font-black font-mono text-white/20 group-hover:text-[#00C8FF] transition-colors">
                      {step.num}
                    </span>
                    <div className="w-10 h-10 rounded-xl bg-white/[0.03] text-[#00C8FF] flex items-center justify-center border border-white/[0.06] group-hover:border-[#00C8FF]/30 group-hover:scale-105 transition-all">
                      <Icon className="w-5 h-5" />
                    </div>
                  </div>

                  <h3 className="text-lg font-bold text-white mb-2 group-hover:text-[#00C8FF] transition-colors">
                    {step.title}
                  </h3>

                  <p className="text-xs sm:text-sm text-[#98A2B3] leading-relaxed mb-4">
                    {step.desc}
                  </p>
                </div>

                <div className="pt-4 border-t border-white/[0.06] text-[11px] font-mono text-[#00C8FF]">
                  {step.details}
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
};
