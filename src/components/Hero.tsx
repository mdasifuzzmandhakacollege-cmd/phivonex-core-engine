import React, { useState, useEffect } from 'react';
import { ArrowRight, Activity } from 'lucide-react';
import { HeroNetworkVisualization } from './HeroNetworkVisualization';
import { PhivonexSymbol } from './brand/PhivonexSymbol';

interface HeroProps {
  onExploreClick: () => void;
  onViewLiveNetwork: () => void;
  onInspectNode?: (nodeInfo: { id: string; role: string; latency: string }) => void;
}

export const Hero: React.FC<HeroProps> = ({ onExploreClick, onViewLiveNetwork, onInspectNode }) => {
  const [introStep, setIntroStep] = useState(0);

  useEffect(() => {
    const t1 = setTimeout(() => setIntroStep(1), 150);
    const t2 = setTimeout(() => setIntroStep(2), 350);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  return (
    <section className="relative min-h-[90vh] lg:min-h-screen flex items-center justify-center pt-28 sm:pt-32 pb-16 overflow-hidden bg-[#05070B]">
      {/* Ambient background lighting aligned to the logo palette */}
      <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-[580px] h-[580px] bg-[#00CFFF]/[0.05] rounded-full blur-[150px] pointer-events-none" />
      <div className="absolute top-1/3 right-1/4 w-[520px] h-[520px] bg-[#7057FF]/[0.045] rounded-full blur-[170px] pointer-events-none" />
      <div className="absolute bottom-10 left-1/2 -translate-x-1/2 w-[650px] h-[250px] bg-[#168BFF]/[0.035] rounded-full blur-[130px] pointer-events-none" />

      {/* Subtle grid pattern */}
      <div 
        className="absolute inset-0 opacity-[0.035] pointer-events-none" 
        style={{
          backgroundImage: `linear-gradient(to right, rgba(255, 255, 255, 0.2) 1px, transparent 1px), linear-gradient(to bottom, rgba(255, 255, 255, 0.2) 1px, transparent 1px)`,
          backgroundSize: '48px 48px'
        }}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
          
          {/* Left Column: Narrative Copy */}
          <div className="lg:col-span-6 xl:col-span-6 flex flex-col justify-center space-y-6 lg:space-y-8 text-left">
            
            {/* Brand Intro Lockup */}
            <div className="inline-flex items-center gap-3">
              <div 
                className={`transition-all duration-500 ease-out ${
                  introStep >= 0 ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
                }`}
              >
                <div className="px-3 py-1.5 rounded-lg bg-[#07101D]/90 border border-white/[0.08] backdrop-blur-md flex items-center gap-2.5 shadow-sm shadow-[#00CFFF]/10">
                  <PhivonexSymbol size={22} animated={introStep >= 1} glow={introStep >= 1} />
                  <span className="text-xs font-mono uppercase tracking-[0.16em] text-[#00CFFF]">
                    PHIVONEX PROTOCOL
                  </span>
                </div>
              </div>
              <span className="hidden sm:inline-block text-xs font-mono text-[#98A2B3]">
                Layer-1 Node Ledger
              </span>
            </div>

            {/* Headline */}
            <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-[64px] font-extrabold tracking-tight text-[#F7FAFC] leading-[1.08] text-balance">
              Powering a Transparent{' '}
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-[#00CFFF] via-[#168BFF] to-[#7057FF]">
                Node Economy
              </span>
            </h1>

            {/* Supporting Text */}
            <p className="text-base sm:text-lg lg:text-xl text-[#98A2B3] leading-relaxed max-w-xl font-normal">
              PHIVONEX is a digital ecosystem built around limited network nodes, transparent supply mechanics, protocol-based rewards, and live network data.
            </p>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3.5 pt-2">
              <button
                onClick={onExploreClick}
                className="px-6 py-3.5 text-sm font-semibold text-[#05070B] bg-gradient-to-r from-[#00CFFF] to-[#168BFF] hover:brightness-110 active:scale-[0.99] rounded-lg shadow-lg shadow-[#00CFFF]/20 transition-all flex items-center justify-center gap-2 group cursor-pointer whitespace-nowrap"
              >
                <span>Explore PHIVONEX</span>
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </button>

              <button
                onClick={onViewLiveNetwork}
                className="px-6 py-3.5 text-sm font-medium text-[#F7FAFC] bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.1] hover:border-white/[0.18] rounded-lg transition-all flex items-center justify-center gap-2 group cursor-pointer whitespace-nowrap"
              >
                <Activity className="w-4 h-4 text-[#00CFFF] group-hover:rotate-12 transition-transform" />
                <span>View Live Network</span>
              </button>
            </div>

            {/* Trust Line */}
            <div className="pt-4 border-t border-white/[0.08]">
              <div className="flex flex-wrap items-center gap-y-2 gap-x-3 text-xs sm:text-sm text-[#98A2B3] font-mono">
                <span className="text-[#F7FAFC] font-medium">100M Max Coin Supply</span>
                <span className="text-white/30" aria-hidden="true">•</span>
                <span className="text-[#F7FAFC] font-medium">Limited Genesis Nodes</span>
                <span className="text-white/30" aria-hidden="true">•</span>
                <span className="text-[#00CFFF] font-medium">Live Ledger Visibility</span>
              </div>
            </div>

          </div>

          {/* Right Column: High-Performance Network Topology Visualization */}
          <div className="lg:col-span-6 xl:col-span-6 relative w-full flex items-center justify-center">
            <div className="w-full max-w-[560px] aspect-square rounded-2xl border border-white/[0.08] bg-[#07101D]/70 backdrop-blur-md relative overflow-hidden shadow-2xl shadow-[#00CFFF]/10">
              
              {/* Subtle top header bar for the canvas frame */}
              <div className="absolute top-0 left-0 right-0 h-10 px-4 flex items-center justify-between border-b border-white/[0.08] bg-[#07101D]/90 z-20 text-[11px] font-mono text-[#98A2B3]">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#32D583]" />
                  <span>Mesh Topology · Real-Time Attestation</span>
                </div>
                <span className="text-[#00CFFF]">Active Relays</span>
              </div>

              <div className="pt-10 w-full h-full">
                <HeroNetworkVisualization onNodeSelect={onInspectNode} />
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
};
