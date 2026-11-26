import React from 'react';
import { ArrowUpRight } from 'lucide-react';

interface EcosystemArchitectureGridProps {
  onExplore: () => void;
}

interface ArchitecturePillar {
  id: string;
  index: string;
  name: string;
  subtitle: string;
  description: string;
  attributes: string[];
  accent: string;
  glowRgb: string;
  emblem: React.ReactNode;
}

const PILLARS: ArchitecturePillar[] = [
  {
    id: 'genesis-core',
    index: '01',
    name: 'PHIVONEX GENESIS CORE™',
    subtitle: 'Decentralized Node Infrastructure',
    description:
      'A strictly bounded network layer of 10,000 Genesis Nodes engineered to anchor protocol continuity, decentralized participation, and structured PHIVO supply distribution over the long term.',
    attributes: ['10,000 Global Node Cap', 'Deterministic Protocol Distribution', 'BEP-20 Verified'],
    accent: '#F5B800',
    glowRgb: '245, 184, 0',
    emblem: (
      <svg width="44" height="44" viewBox="0 0 44 44" fill="none" aria-hidden="true">
        <rect x="2" y="2" width="40" height="40" rx="12" fill="rgba(245,184,0,0.08)" stroke="rgba(245,184,0,0.32)" />
        <polygon points="22,9 33,15.5 33,28.5 22,35 11,28.5 11,15.5" stroke="#F5B800" strokeWidth="1.7" fill="rgba(245,184,0,0.1)" />
        <polygon points="22,15 27.5,18.2 27.5,25.8 22,29 16.5,25.8 16.5,18.2" stroke="#FFE082" strokeWidth="1.4" />
        <circle cx="22" cy="22" r="2.4" fill="#FFE082" />
      </svg>
    ),
  },
  {
    id: 'quantum-alpha',
    index: '02',
    name: 'PHIVONEX QUANTUM ALPHA™',
    subtitle: 'Institutional Liquidity Protocol',
    description:
      'Structured liquidity provisioning designed with institutional risk controls, transparent session settlement, and disciplined capital allocation frameworks built for sustained ecosystem resilience.',
    attributes: ['Institutional Risk Controls', 'Session-Based Settlement', 'Transparent Accounting'],
    accent: '#00E5FF',
    glowRgb: '0, 229, 255',
    emblem: (
      <svg width="44" height="44" viewBox="0 0 44 44" fill="none" aria-hidden="true">
        <rect x="2" y="2" width="40" height="40" rx="12" fill="rgba(0,229,255,0.08)" stroke="rgba(0,229,255,0.32)" />
        <circle cx="22" cy="22" r="11.5" stroke="#00E5FF" strokeWidth="1.6" strokeDasharray="4 3" />
        <path d="M14 25.5L19.5 20L23.5 23.5L30.5 16.5" stroke="#00E5FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="30.5" cy="16.5" r="2.2" fill="#FFFFFF" />
      </svg>
    ),
  },
  {
    id: 'chrono-vaults',
    index: '03',
    name: 'PHIVONEX CHRONO VAULTS™',
    subtitle: 'Time-Locked Digital Asset Staking',
    description:
      'Programmable maturity horizons allowing long-term ecosystem participants to commit digital assets across transparent, verifiable lock durations aligned with multi-year network stability.',
    attributes: ['Programmable Lock Horizons', 'Automated Maturity Settlement', 'Segregated Vault Custody'],
    accent: '#00E676',
    glowRgb: '0, 230, 118',
    emblem: (
      <svg width="44" height="44" viewBox="0 0 44 44" fill="none" aria-hidden="true">
        <rect x="2" y="2" width="40" height="40" rx="12" fill="rgba(0,230,118,0.08)" stroke="rgba(0,230,118,0.32)" />
        <circle cx="22" cy="22" r="11" stroke="#00E676" strokeWidth="1.7" />
        <path d="M22 15.5V22L26.5 25" stroke="#00E676" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M18 9.5H26" stroke="#80F2B8" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'unified-wallet',
    index: '04',
    name: 'PHIVONEX UNIFIED WALLET',
    subtitle: 'Multi-Asset BEP-20 Settlement Hub',
    description:
      'A unified settlement environment bridging PHIVO and USDT across BNB Smart Chain with real-time conversion, transparent transaction records, and frictionless treasury portability.',
    attributes: ['Multi-Asset BEP-20 Rails', 'Instant Ecosystem Conversion', 'Real-Time Settlement Records'],
    accent: '#FFE082',
    glowRgb: '255, 224, 130',
    emblem: (
      <svg width="44" height="44" viewBox="0 0 44 44" fill="none" aria-hidden="true">
        <rect x="2" y="2" width="40" height="40" rx="12" fill="rgba(255,224,130,0.08)" stroke="rgba(255,224,130,0.32)" />
        <rect x="11" y="14" width="22" height="16" rx="4" stroke="#FFE082" strokeWidth="1.7" />
        <path d="M25 22H33" stroke="#00E5FF" strokeWidth="1.7" strokeLinecap="round" />
        <circle cx="26.5" cy="22" r="2" fill="#00E5FF" />
      </svg>
    ),
  },
];

export const EcosystemArchitectureGrid: React.FC<EcosystemArchitectureGridProps> = ({
  onExplore,
}) => {
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    e.currentTarget.style.setProperty('--spot-x', `${x}px`);
    e.currentTarget.style.setProperty('--spot-y', `${y}px`);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {PILLARS.map((pillar) => (
        <div
          key={pillar.id}
          onMouseMove={handleMouseMove}
          className="group relative rounded-[24px] p-7 sm:p-8 border border-white/[0.08] overflow-hidden transition-colors duration-200 hover:border-white/[0.18]"
          style={{
            background: 'rgba(14, 21, 19, 0.68)',
            backdropFilter: 'blur(24px)',
          }}
        >
          {/* Cursor-Tracking Spotlight Glow */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -inset-px opacity-0 group-hover:opacity-100 transition-opacity duration-300"
            style={{
              background: `radial-gradient(420px circle at var(--spot-x, 50%) var(--spot-y, 50%), rgba(${pillar.glowRgb}, 0.14), transparent 65%)`,
            }}
          />

          {/* Top Specular Hairline */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-8 top-0 h-px opacity-50 group-hover:opacity-100 transition-opacity duration-300"
            style={{
              background: `linear-gradient(90deg, transparent, ${pillar.accent}80, transparent)`,
            }}
          />

          <div className="relative z-10 flex flex-col h-full justify-between gap-6">
            <div>
              <div className="flex items-start justify-between gap-4 mb-6">
                {pillar.emblem}
                <span className="font-mono text-xs text-slate-500 tabular-nums">
                  {pillar.index} / 04
                </span>
              </div>

              <div className="text-xs font-medium tracking-wide mb-1.5" style={{ color: pillar.accent }}>
                {pillar.subtitle}
              </div>
              <h3
                className="text-xl sm:text-2xl font-semibold text-white tracking-tight"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                {pillar.name}
              </h3>

              <p className="mt-3.5 text-[15px] text-slate-300/90 leading-relaxed">
                {pillar.description}
              </p>
            </div>

            <div className="pt-5 border-t border-white/[0.07] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-400">
                {pillar.attributes.map((attr, idx) => (
                  <React.Fragment key={attr}>
                    <span>{attr}</span>
                    {idx < pillar.attributes.length - 1 && (
                      <span aria-hidden="true" className="text-slate-600">
                        ·
                      </span>
                    )}
                  </React.Fragment>
                ))}
              </div>

              <button
                type="button"
                onClick={onExplore}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-white hover:text-[#FFE082] transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F5B800] rounded"
              >
                <span>Access Portal</span>
                <ArrowUpRight className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
