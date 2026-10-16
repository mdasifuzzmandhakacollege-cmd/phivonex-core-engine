import React from 'react';
import {
  Server,
  Activity,
  Layers,
  Coins,
  ShieldCheck,
  Radio,
  Clock,
  RefreshCw,
  Zap,
  CheckCircle2,
  Lock,
  ArrowRight,
  Database,
  Cpu,
  Workflow,
  Globe,
  Sliders
} from 'lucide-react';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { PhivonexLogo } from '../components/brand/PhivonexLogo';
import { PHIVONEX_TOKEN_CONFIG } from '../server/config/tokenConfig';

interface NetworkPublicPageProps {
  onNavigate: (route: string) => void;
}

export const NetworkPublicPage: React.FC<NetworkPublicPageProps> = ({ onNavigate }) => {
  return (
    <div className="min-h-screen bg-[#05070B] text-[#F7FAFC] font-sans selection:bg-[#00CFFF]/20 selection:text-[#00CFFF]">
      {/* Public Navigation */}
      <Navbar
        onExploreClick={() => onNavigate('/')}
        onLaunchAppClick={() => onNavigate('/login')}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-10 text-left">
        {/* Header Hero Banner */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#07101D] via-[#0B182D] to-[#07101D] border border-[#00CFFF]/30 p-8 sm:p-10 shadow-2xl space-y-6">
          <div className="absolute top-0 right-0 -mt-10 -mr-10 w-80 h-80 bg-[#00CFFF]/10 rounded-full blur-3xl pointer-events-none" />

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
            <div className="space-y-3 max-w-2xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#00CFFF]/10 border border-[#00CFFF]/30 text-xs font-mono text-[#00CFFF]">
                <Radio className="w-3.5 h-3.5 text-[#32D583] animate-pulse" />
                <span>PHIVONEX NETWORK ARCHITECTURE EXPLORER</span>
              </div>
              <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
                Protocol Architecture &amp; Specifications
              </h1>
              <p className="text-sm text-[#98A2B3] leading-relaxed">
                Verifiable protocol specifications, BEP-20 token mechanics, and server-authoritative double-entry ledger security standards for the PHIVONEX ecosystem.
              </p>
            </div>

            <div className="flex flex-col items-stretch sm:items-end gap-3 shrink-0">
              <div className="px-4 py-3 rounded-2xl bg-[#05070B] border border-white/[0.08] flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-[#32D583] shadow-lg shadow-[#32D583]/50 animate-pulse" />
                <div>
                  <div className="text-[10px] font-mono text-[#98A2B3] uppercase">Protocol Health</div>
                  <div className="text-xs font-mono font-bold text-white">
                    SYSTEMS SYNCHRONIZED
                  </div>
                </div>
              </div>

              <button
                onClick={() => onNavigate('/')}
                className="px-4 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-xs font-mono text-white flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <ArrowRight className="w-3.5 h-3.5 text-[#00CFFF]" />
                <span>Return to Ecosystem Home</span>
              </button>
            </div>
          </div>
        </div>

        {/* 6 Key Architectural Pillars Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          
          <div className="p-6 rounded-2xl bg-[#07101D] border border-white/[0.08] space-y-3">
            <div className="flex items-center justify-between text-xs text-[#98A2B3]">
              <span className="font-mono uppercase text-[11px] tracking-wider">Genesis Node Standard</span>
              <Server className="w-4 h-4 text-[#00CFFF]" />
            </div>
            <div className="text-2xl font-mono font-extrabold text-[#00CFFF]">
              10,000 Cap
            </div>
            <p className="text-xs text-[#98A2B3]">
              Fixed Genesis V1 participation allocation
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-[#07101D] border border-white/[0.08] space-y-3">
            <div className="flex items-center justify-between text-xs text-[#98A2B3]">
              <span className="font-mono uppercase text-[11px] tracking-wider">BEP-20 Standard</span>
              <Coins className="w-4 h-4 text-[#32D583]" />
            </div>
            <div className="text-2xl font-mono font-extrabold text-[#32D583]">
              100M PHIVO
            </div>
            <p className="text-xs text-[#98A2B3]">
              Maximum token supply cap on BSC
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-[#07101D] border border-white/[0.08] space-y-3">
            <div className="flex items-center justify-between text-xs text-[#98A2B3]">
              <span className="font-mono uppercase text-[11px] tracking-wider">Emission Schedule</span>
              <Zap className="w-4 h-4 text-[#F79009]" />
            </div>
            <div className="text-xl sm:text-2xl font-mono font-extrabold text-[#F79009]">
              Protocol Governed
            </div>
            <p className="text-xs text-[#98A2B3]">
              Daily PHIVO emission is governed by the active protocol economic configuration.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-[#07101D] border border-white/[0.08] space-y-3">
            <div className="flex items-center justify-between text-xs text-[#98A2B3]">
              <span className="font-mono uppercase text-[11px] tracking-wider">Node Term</span>
              <Clock className="w-4 h-4 text-purple-400" />
            </div>
            <div className="text-2xl font-mono font-extrabold text-purple-400">
              200 Days
            </div>
            <p className="text-xs text-[#98A2B3]">
              Eligible daily reward allocation term
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-[#07101D] border border-white/[0.08] space-y-3">
            <div className="flex items-center justify-between text-xs text-[#98A2B3]">
              <span className="font-mono uppercase text-[11px] tracking-wider">Ledger Security</span>
              <Database className="w-4 h-4 text-[#00CFFF]" />
            </div>
            <div className="text-2xl font-mono font-extrabold text-white">
              Double-Entry
            </div>
            <p className="text-xs text-[#98A2B3]">
              Server-authoritative financial ledger
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-[#07101D] border border-white/[0.08] space-y-3">
            <div className="flex items-center justify-between text-xs text-[#98A2B3]">
              <span className="font-mono uppercase text-[11px] tracking-wider">Security Engine</span>
              <ShieldCheck className="w-4 h-4 text-[#32D583]" />
            </div>
            <div className="text-2xl font-mono font-extrabold text-[#32D583]">
              Audited State
            </div>
            <p className="text-xs text-[#98A2B3]">
              Transaction isolation &amp; role validation
            </p>
          </div>

        </div>

        {/* Protocol Specifications Panel */}
        <div className="p-8 rounded-3xl bg-[#07101D] border border-white/[0.08] shadow-2xl space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.08] pb-4">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Cpu className="w-5 h-5 text-[#00CFFF]" />
                <span>Genesis Node Specifications</span>
              </h2>
              <p className="text-xs text-[#98A2B3] mt-0.5">
                Purchase-time snapshot model and verified allocation rules.
              </p>
            </div>
            <span className="text-xs font-mono text-[#00CFFF] bg-[#00CFFF]/10 px-3 py-1.5 rounded-full border border-[#00CFFF]/20">
              Genesis V1 Standard
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs font-mono">
            <div className="p-4 rounded-2xl bg-[#05070B] border border-white/[0.06] space-y-1">
              <span className="text-[10px] text-[#98A2B3] uppercase">Reference Cost</span>
              <span className="text-sm font-bold text-white block">$1,000 USD (Informational)</span>
            </div>
            <div className="p-4 rounded-2xl bg-[#05070B] border border-white/[0.06] space-y-1">
              <span className="text-[10px] text-[#98A2B3] uppercase">Lifetime Cap</span>
              <span className="text-sm font-bold text-emerald-400 block">10,000 PHIVO / Node</span>
            </div>
            <div className="p-4 rounded-2xl bg-[#05070B] border border-white/[0.06] space-y-1">
              <span className="text-[10px] text-[#98A2B3] uppercase">Daily Emissions</span>
              <span className="text-sm font-bold text-amber-400 block">Protocol Governed</span>
            </div>
            <div className="p-4 rounded-2xl bg-[#05070B] border border-white/[0.06] space-y-1">
              <span className="text-[10px] text-[#98A2B3] uppercase">Eligible Duration</span>
              <span className="text-sm font-bold text-purple-400 block">200 Daily Epochs</span>
            </div>
          </div>
        </div>

        {/* Operational Privacy Notice */}
        <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/[0.08] flex items-start gap-4 text-xs text-[#98A2B3]">
          <Lock className="w-5 h-5 text-[#00CFFF] shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h3 className="font-bold text-white text-sm">
              Operational Privacy &amp; Data Security
            </h3>
            <p className="leading-relaxed">
              PHIVONEX enforces strict privacy standards. Public interfaces provide architectural specifications and conceptual protocol flows while keeping private account details, transaction activity, and database credentials protected.
            </p>
          </div>
        </div>

        {/* CTA */}
        <div className="p-8 rounded-3xl bg-gradient-to-r from-[#00CFFF]/10 via-[#07101D] to-[#32D583]/10 border border-[#00CFFF]/30 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="space-y-1">
            <h3 className="text-lg font-bold text-white">
              Ready to explore the PHIVONEX Dashboard?
            </h3>
            <p className="text-xs text-[#98A2B3]">
              Sign in to manage your Genesis Nodes, wallet balances, and rewards.
            </p>
          </div>

          <button
            onClick={() => onNavigate('/login')}
            className="px-6 py-3 rounded-2xl bg-[#00CFFF] hover:bg-[#00CFFF]/90 text-[#05070B] font-extrabold text-xs flex items-center gap-2 transition-all cursor-pointer shadow-lg shadow-[#00CFFF]/20 shrink-0"
          >
            <span>Login</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </main>

      <Footer
        onOpenLegal={() => {}}
        onExploreClick={() => onNavigate('/')}
      />
    </div>
  );
};
