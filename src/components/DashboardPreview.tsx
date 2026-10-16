import React, { useState } from 'react';
import {
  LayoutDashboard,
  Server,
  Award,
  ArrowLeftRight,
  Activity,
  Shield,
  Search,
  Bell,
  CheckCircle2,
  Cpu,
  ArrowUpRight
} from 'lucide-react';
import { PhivonexAppIcon } from './brand/PhivonexAppIcon';

export const DashboardPreview: React.FC = () => {
  const [activeTab, setActiveTab] = useState('Overview');

  const navItems = [
    { label: 'Overview', icon: LayoutDashboard },
    { label: 'My Nodes', icon: Server, badge: '2 Active' },
    { label: 'Rewards', icon: Award },
    { label: 'Transactions', icon: ArrowLeftRight },
    { label: 'Activity', icon: Activity },
    { label: 'Security', icon: Shield },
  ];

  return (
    <section className="py-24 sm:py-32 relative border-t border-white/[0.06] overflow-hidden">
      
      {/* Background radial glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[400px] bg-[#6C5CFF]/[0.035] rounded-full blur-[140px] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        
        <div className="max-w-3xl mb-12">
          <div className="text-xs font-mono uppercase tracking-[0.2em] text-[#00C8FF] mb-3">
            OPERATOR WORKSPACE
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white tracking-tight">
            Personal Dashboard Preview
          </h2>
          <p className="text-sm sm:text-base text-[#98A2B3] mt-3">
            Inspect the high-precision operator console designed for Genesis Node managers, stake validators, and institutional custody partners.
          </p>
        </div>

        {/* Embedded Dashboard Shell */}
        <div className="rounded-2xl bg-[#080B12] border border-white/[0.1] shadow-2xl overflow-hidden">
          
          {/* Top Frame Bar with Notice */}
          <div className="px-6 py-3 bg-[#05070B] border-b border-white/[0.08] flex items-center justify-between text-xs font-mono">
            <div className="flex items-center gap-2.5">
              <PhivonexAppIcon size={22} glow={false} />
              <span className="text-[#F7FAFC] font-bold tracking-tight">PHIVONEX Command Center</span>
            </div>
            <div className="px-2.5 py-0.5 rounded bg-white/[0.08] text-[#98A2B3] text-[11px]">
              Simulated Operator Workspace
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[500px]">
            
            {/* Sidebar (3 cols) */}
            <div className="lg:col-span-3 bg-[#080B12] border-r border-white/[0.06] p-4 flex flex-col justify-between">
              <div className="space-y-1">
                <div className="text-[11px] font-mono text-[#98A2B3] uppercase px-3 py-2">
                  Navigation
                </div>
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const isSelected = activeTab === item.label;
                  return (
                    <button
                      key={item.label}
                      onClick={() => setActiveTab(item.label)}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-[#00C8FF]/15 text-[#00C8FF] font-semibold'
                          : 'text-[#98A2B3] hover:text-white hover:bg-white/[0.04]'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon className="w-4 h-4" />
                        <span>{item.label}</span>
                      </div>
                      {item.badge && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#32D583]/10 text-[#32D583]">
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Operator Node Summary badge */}
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05] text-xs font-mono space-y-1 mt-4">
                <div className="text-[#98A2B3]">Operator Key:</div>
                <div className="text-white font-bold truncate">0x9F4c...182E</div>
                <div className="text-[#32D583] text-[11px]">● 2 Nodes Active</div>
              </div>
            </div>

            {/* Main Content Area (9 cols) */}
            <div className="lg:col-span-9 p-6 bg-[#0B1020]/40 space-y-6">
              
              {/* Top 6 KPI Metric Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="p-4 rounded-xl bg-[#080B12] border border-white/[0.06]">
                  <span className="text-[11px] text-[#98A2B3] block mb-1">My Nodes</span>
                  <span className="text-xl font-bold font-mono text-white">2 Assigned</span>
                  <span className="text-[10px] text-[#32D583] block mt-0.5">100% Uptime</span>
                </div>

                <div className="p-4 rounded-xl bg-[#080B12] border border-white/[0.06]">
                  <span className="text-[11px] text-[#98A2B3] block mb-1">Accrued Rewards</span>
                  <span className="text-xl font-bold font-mono text-[#00C8FF] tabular-nums">142.80 PHIVO</span>
                  <span className="text-[10px] text-[#98A2B3] block mt-0.5">Epoch #0284</span>
                </div>

                <div className="p-4 rounded-xl bg-[#080B12] border border-white/[0.06]">
                  <span className="text-[11px] text-[#98A2B3] block mb-1">Claimable Rewards</span>
                  <span className="text-xl font-bold font-mono text-white tabular-nums">48.24 PHIVO</span>
                  <span className="text-[10px] text-[#32D583] block mt-0.5">Settlement Ready</span>
                </div>

                <div className="p-4 rounded-xl bg-[#080B12] border border-white/[0.06]">
                  <span className="text-[11px] text-[#98A2B3] block mb-1">Active Epoch</span>
                  <span className="text-xl font-bold font-mono text-white">#0284</span>
                  <span className="text-[10px] text-[#00C8FF] block mt-0.5">68% Complete</span>
                </div>

                <div className="p-4 rounded-xl bg-[#080B12] border border-white/[0.06]">
                  <span className="text-[11px] text-[#98A2B3] block mb-1">Network Latency</span>
                  <span className="text-xl font-bold font-mono text-[#32D583]">22ms</span>
                  <span className="text-[10px] text-[#98A2B3] block mt-0.5">Benchmark: Optimal</span>
                </div>

                <div className="p-4 rounded-xl bg-[#080B12] border border-white/[0.06]">
                  <span className="text-[11px] text-[#98A2B3] block mb-1">Security Score</span>
                  <span className="text-xl font-bold font-mono text-white">A+</span>
                  <span className="text-[10px] text-[#32D583] block mt-0.5">Multi-Sig Verified</span>
                </div>
              </div>

              {/* Node Table Mockup */}
              <div className="p-4 sm:p-5 rounded-xl bg-[#080B12] border border-white/[0.06]">
                <div className="flex items-center justify-between mb-4 text-xs font-mono">
                  <span className="text-white font-bold">OPERATOR VALIDATOR NODES</span>
                  <span className="text-[#00C8FF]">2 / 10,000 REGISTERED</span>
                </div>

                <div className="space-y-2">
                  <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.05] flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-[#32D583]" />
                      <span className="text-white font-bold">PX-NODE-001294</span>
                      <span className="text-[#98A2B3] hidden sm:inline">Genesis Tier</span>
                    </div>
                    <div className="text-xs text-[#98A2B3]">
                      Uptime: <strong className="text-white">99.98%</strong>
                    </div>
                    <div className="text-xs text-[#00C8FF]">
                      Accrued: 71.40 PHIV
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-[#32D583]/15 text-[#32D583]">
                      VALIDATING
                    </span>
                  </div>

                  <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.05] flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-[#32D583]" />
                      <span className="text-white font-bold">PX-NODE-003681</span>
                      <span className="text-[#98A2B3] hidden sm:inline">Tier 2 Expansion</span>
                    </div>
                    <div className="text-xs text-[#98A2B3]">
                      Uptime: <strong className="text-white">99.94%</strong>
                    </div>
                    <div className="text-xs text-[#00C8FF]">
                      Accrued: 71.40 PHIV
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-[#32D583]/15 text-[#32D583]">
                      VALIDATING
                    </span>
                  </div>
                </div>
              </div>

            </div>

          </div>

        </div>

      </div>
    </section>
  );
};
