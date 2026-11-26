import React, { useState } from 'react';
import { Check } from 'lucide-react';

interface RoadmapPhase {
  id: string;
  phaseLabel: string;
  title: string;
  status: string;
  isActive: boolean;
  summary: string;
  milestones: string[];
  accent: string;
}

const ROADMAP_PHASES: RoadmapPhase[] = [
  {
    id: 'phase-1',
    phaseLabel: 'Phase 01',
    title: 'Core Infrastructure & Genesis Launch (Active)',
    status: 'Active',
    isActive: true,
    summary:
      'Foundation deployment of the 10,000-unit Genesis Node architecture, unified BEP-20 wallet settlement, and institutional reserve protection.',
    milestones: [
      'Genesis Core node registry and fixed 100M PHIVO architecture',
      'Unified multi-asset BEP-20 settlement and reserve accounting',
      'Global member portal with verified custody monitoring',
    ],
    accent: '#00E676',
  },
  {
    id: 'phase-2',
    phaseLabel: 'Phase 02',
    title: 'Liquidity Expansion & Native Mobile Suite (Android & iOS)',
    status: 'In Progress',
    isActive: false,
    summary:
      'Deepening institutional liquidity venues alongside dedicated mobile applications engineered for instant portfolio and settlement access.',
    milestones: [
      'Expanded multi-venue PHIVO liquidity and instant swap depth',
      'Dedicated Android and iOS mobile suite with biometric access',
      'Regional compliance readiness and localized onboarding rails',
    ],
    accent: '#F5B800',
  },
  {
    id: 'phase-3',
    phaseLabel: 'Phase 03',
    title: 'PHIVONEX Pay, Merchant SDK & Cross-Chain Bridge',
    status: 'Scheduled',
    isActive: false,
    summary:
      'Extending PHIVO utility directly into global digital commerce through turnkey merchant APIs and audited cross-chain interoperability.',
    milestones: [
      'PHIVONEX Pay checkout rails for global e-commerce and retail',
      'Open Merchant SDK for seamless BEP-20 invoice settlement',
      'Cross-chain liquidity bridge connecting major EVM networks',
    ],
    accent: '#00E5FF',
  },
  {
    id: 'phase-4',
    phaseLabel: 'Phase 04',
    title: 'Decentralized Governance (DAO) & Global Web3 Cloud',
    status: 'Horizon',
    isActive: false,
    summary:
      'Transitioning long-term ecosystem parameters to community-guided governance while scaling decentralized compute and Web3 cloud services.',
    milestones: [
      'On-chain governance framework for PHIVO and node stakeholders',
      'Decentralized Web3 cloud compute anchored by Genesis Nodes',
      'Autonomous treasury stewardship and global developer grants',
    ],
    accent: '#FFE082',
  },
];

export const GlobalRoadmapSection: React.FC = () => {
  const [selectedId, setSelectedId] = useState<string>('phase-1');

  return (
    <div className="space-y-6">
      {/* Horizontal Phase Track (Desktop visual guide) */}
      <div className="hidden lg:grid grid-cols-4 gap-6 px-2" aria-hidden="true">
        {ROADMAP_PHASES.map((phase) => {
          const isSelected = phase.id === selectedId;
          return (
            <div key={phase.id} className="flex items-center gap-3">
              <div
                className="w-3 h-3 rounded-full shrink-0 transition-transform duration-200"
                style={{
                  backgroundColor: isSelected || phase.isActive ? phase.accent : 'rgba(255,255,255,0.2)',
                  transform: isSelected ? 'scale(1.25)' : 'scale(1)',
                }}
              />
              <div
                className="h-px flex-1"
                style={{
                  background: isSelected
                    ? `linear-gradient(90deg, ${phase.accent}90, rgba(255,255,255,0.08))`
                    : 'rgba(255,255,255,0.08)',
                }}
              />
            </div>
          );
        })}
      </div>

      {/* 4 Interactive Timeline Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {ROADMAP_PHASES.map((phase) => {
          const isSelected = phase.id === selectedId;
          return (
            <button
              key={phase.id}
              type="button"
              onClick={() => setSelectedId(phase.id)}
              onMouseEnter={() => setSelectedId(phase.id)}
              className="text-left rounded-[22px] p-6 border transition-all duration-200 flex flex-col justify-between gap-5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F5B800]"
              style={{
                background: isSelected
                  ? 'rgba(18, 28, 25, 0.84)'
                  : 'rgba(14, 21, 19, 0.62)',
                borderColor: isSelected
                  ? `${phase.accent}66`
                  : 'rgba(255, 255, 255, 0.08)',
                backdropFilter: 'blur(20px)',
                boxShadow: isSelected
                  ? `0 18px 40px -22px ${phase.accent}45`
                  : 'none',
              }}
            >
              <div>
                <div className="flex items-center justify-between gap-2 text-xs font-mono mb-3">
                  <span style={{ color: phase.accent }} className="font-semibold">
                    {phase.phaseLabel}
                  </span>
                  <span className="text-slate-400">{phase.status}</span>
                </div>

                <h3
                  className="text-base sm:text-[17px] font-semibold text-white leading-snug tracking-tight"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  {phase.phaseLabel} — {phase.title}
                </h3>

                <p className="mt-3 text-xs sm:text-[13px] text-slate-400 leading-relaxed">
                  {phase.summary}
                </p>
              </div>

              <ul className="pt-4 border-t border-white/[0.07] space-y-2.5">
                {phase.milestones.map((m) => (
                  <li key={m} className="flex items-start gap-2 text-xs text-slate-300 leading-relaxed">
                    <Check
                      className="w-3.5 h-3.5 shrink-0 mt-0.5"
                      style={{ color: phase.accent }}
                    />
                    <span>{m}</span>
                  </li>
                ))}
              </ul>
            </button>
          );
        })}
      </div>
    </div>
  );
};
