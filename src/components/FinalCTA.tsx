import React from 'react';
import { ArrowRight, Activity, FileText } from 'lucide-react';
import { PhivonexAppIcon } from './brand/PhivonexAppIcon';

interface FinalCTAProps {
  onLaunchApp: () => void;
  onExploreNetwork: () => void;
  onReadDocs: () => void;
}

export const FinalCTA: React.FC<FinalCTAProps> = ({
  onLaunchApp,
  onExploreNetwork,
  onReadDocs,
}) => {
  return (
    <section className="py-24 sm:py-32 relative border-t border-white/[0.06] bg-[#05070B] overflow-hidden">
      {/* Ambient background glows */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-[#00CFFF]/[0.045] rounded-full blur-[150px] pointer-events-none" />
      <div className="absolute bottom-10 right-1/4 w-[400px] h-[300px] bg-[#7057FF]/[0.035] rounded-full blur-[150px] pointer-events-none" />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
        
        <div className="bg-[#07101D]/90 border border-white/[0.08] rounded-3xl p-8 sm:p-14 backdrop-blur-xl shadow-2xl shadow-[#00CFFF]/5">
          
          {/* Official Icon Symbol */}
          <div className="flex justify-center mb-6">
            <PhivonexAppIcon size={56} glow={true} />
          </div>

          {/* Main Headline */}
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-[#F7FAFC] tracking-tight mb-4">
            Enter the PHIVONEX Network
          </h2>

          {/* Description */}
          <p className="text-sm sm:text-base md:text-lg text-[#98A2B3] max-w-2xl mx-auto leading-relaxed mb-8">
            Explore the network, understand the ecosystem, and follow PHIVONEX as the platform evolves.
          </p>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3.5 max-w-xl mx-auto">
            
            {/* 1. Launch PHIVONEX */}
            <button
              onClick={onLaunchApp}
              className="w-full sm:w-auto px-6 py-3.5 rounded-lg bg-gradient-to-r from-[#00CFFF] to-[#168BFF] text-[#05070B] font-semibold text-xs flex items-center justify-center gap-2 hover:brightness-110 active:scale-[0.99] transition-all cursor-pointer shadow-lg shadow-[#00CFFF]/20 whitespace-nowrap"
            >
              <span>Launch PHIVONEX</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            {/* 2. Explore Live Network */}
            <button
              onClick={onExploreNetwork}
              className="w-full sm:w-auto px-6 py-3.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.1] text-[#F7FAFC] font-medium text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Activity className="w-4 h-4 text-[#00CFFF]" />
              <span>Explore Live Network</span>
            </button>

            {/* 3. Read Documentation */}
            <button
              onClick={onReadDocs}
              className="w-full sm:w-auto px-6 py-3.5 rounded-lg bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.08] text-[#98A2B3] hover:text-[#F7FAFC] font-medium text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
            >
              <FileText className="w-4 h-4 text-[#7057FF]" />
              <span>Read Documentation</span>
            </button>

          </div>

          {/* Subtext */}
          <div className="mt-8 pt-6 border-t border-white/[0.06] flex items-center justify-center gap-4 text-xs font-mono text-[#98A2B3]">
            <span>100M Fixed Supply</span>
            <span className="text-white/20">•</span>
            <span>10,000 Genesis Nodes</span>
            <span className="text-white/20">•</span>
            <span className="text-[#32D583]">Immutable Protocol</span>
          </div>

        </div>

      </div>
    </section>
  );
};
