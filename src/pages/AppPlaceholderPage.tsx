import React from 'react';
import { ShieldCheck, LogOut, ArrowLeft, Terminal, Cpu } from 'lucide-react';
import { PhivonexLogo } from '../components/brand/PhivonexLogo';
import { PhivonexAppIcon } from '../components/brand/PhivonexAppIcon';

interface AppPlaceholderPageProps {
  onNavigate: (route: string) => void;
  userEmail?: string;
}

export const AppPlaceholderPage: React.FC<AppPlaceholderPageProps> = ({
  onNavigate,
  userEmail
}) => {
  const handleSignOut = () => {
    try {
      localStorage.removeItem('phivonex_session');
    } catch {
      // ignore
    }
    onNavigate('/login');
  };

  return (
    <div className="min-h-screen bg-[#05070B] text-[#F7FAFC] flex flex-col justify-between selection:bg-[#00CFFF]/20 selection:text-[#00CFFF]">
      
      {/* Top Header */}
      <header className="border-b border-white/[0.08] bg-[#07101D]/80 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <button
            onClick={() => onNavigate('/')}
            className="flex items-center gap-2 group focus:outline-none cursor-pointer"
            aria-label="Back to home"
          >
            <PhivonexLogo size="md" />
          </button>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.08] text-xs font-mono text-[#98A2B3]">
              <span className="w-2 h-2 rounded-full bg-[#32D583]" />
              <span>Operator Session Active</span>
            </div>
            
            <button
              onClick={handleSignOut}
              className="px-3.5 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.1] text-xs text-[#F7FAFC] font-medium transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5 text-[#00CFFF]" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-10 relative">
        {/* Ambient atmospheric glows */}
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-[#00CFFF]/[0.035] rounded-full blur-[160px] pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-[#7057FF]/[0.03] rounded-full blur-[140px] pointer-events-none" />

        <div className="w-full max-w-2xl relative z-10 text-center">
          
          <div className="bg-[#07101D]/90 border border-white/[0.08] rounded-2xl shadow-2xl p-8 sm:p-12 backdrop-blur-xl">
            
            {/* Logo Icon */}
            <div className="flex justify-center mb-6">
              <PhivonexAppIcon size={64} glow={true} />
            </div>

            {/* Headline */}
            <h1 className="text-3xl sm:text-4xl font-extrabold text-[#F7FAFC] tracking-tight font-sans mb-3">
              Welcome to PHIVONEX
            </h1>

            {/* Subtext */}
            <p className="text-sm sm:text-base text-[#98A2B3] max-w-lg mx-auto leading-relaxed mb-8">
              Your operator account has been authenticated. The PHIVONEX node management console, economic ledger telemetry, and validator workspace are undergoing final phase deployment.
            </p>

            {/* System Status Pill */}
            <div className="p-4 rounded-xl bg-[#05070B] border border-white/[0.06] max-w-md mx-auto mb-8 text-left font-mono text-xs text-[#98A2B3] space-y-2">
              <div className="flex items-center justify-between">
                <span>Protocol Core:</span>
                <span className="text-[#32D583]">ONLINE (v1.0.0-rc2)</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Genesis Node Cap:</span>
                <span className="text-[#F7FAFC]">10,000 Hard Limit</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Maximum Coin Supply:</span>
                <span className="text-[#00CFFF]">100,000,000 PHIVO</span>
              </div>
            </div>

            {/* Navigation Actions */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                onClick={() => onNavigate('/')}
                className="w-full sm:w-auto px-6 py-3 rounded-lg bg-gradient-to-r from-[#00CFFF] to-[#168BFF] text-[#05070B] font-semibold text-xs flex items-center justify-center gap-2 hover:brightness-110 transition-all cursor-pointer shadow-lg shadow-[#00CFFF]/20"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Return to Ecosystem Explorer</span>
              </button>

              <button
                onClick={handleSignOut}
                className="w-full sm:w-auto px-6 py-3 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.1] text-white font-medium text-xs transition-colors cursor-pointer"
              >
                Sign Out
              </button>
            </div>

          </div>

          <div className="mt-6 text-center text-xs text-[#98A2B3] font-mono">
            <span>PHIVONEX Node Economy Protocol · Confidential Operator Workspace</span>
          </div>

        </div>
      </main>

      {/* Footer */}
      <footer className="py-4 border-t border-white/[0.06] text-center text-[11px] text-[#98A2B3] font-mono">
        © 2026 PHIVONEX Ecosystem. All rights reserved.
      </footer>
    </div>
  );
};
