import React, { useState } from 'react';

interface AllocationSlice {
  id: string;
  label: string;
  percentage: number;
  tokens: string;
  color: string;
  mandate: string;
}

const ALLOCATION_SLICES: AllocationSlice[] = [
  {
    id: 'genesis',
    label: 'Genesis Node & Community',
    percentage: 50,
    tokens: '50,000,000 PHIVO',
    color: '#F5B800',
    mandate: 'Dedicated to long-term Genesis Node operators and ecosystem participants.',
  },
  {
    id: 'liquidity',
    label: 'Liquidity & Market Depth',
    percentage: 20,
    tokens: '20,000,000 PHIVO',
    color: '#00E5FF',
    mandate: 'Sustains seamless conversion depth across decentralized and institutional venues.',
  },
  {
    id: 'merchant',
    label: 'Ecosystem & Merchant SDK',
    percentage: 15,
    tokens: '15,000,000 PHIVO',
    color: '#00E676',
    mandate: 'Funds developer tooling, commerce rails, and real-world PHIVONEX Pay adoption.',
  },
  {
    id: 'reserve',
    label: 'Strategic Reserve',
    percentage: 10,
    tokens: '10,000,000 PHIVO',
    color: '#FFE082',
    mandate: 'Ring-fenced treasury reserve supporting protocol continuity and market stability.',
  },
  {
    id: 'contributors',
    label: 'Core Contributors & Vesting',
    percentage: 5,
    tokens: '5,000,000 PHIVO',
    color: '#94A3B8',
    mandate: 'Multi-year vested allocation aligning engineering and governance stewardship.',
  },
];

const UTILITY_CARDS = [
  {
    num: '01',
    title: 'Ecosystem Settlement',
    description:
      'Native unit of account powering protocol operations, node activations, and cross-module transfers across PHIVONEX.',
    accent: '#F5B800',
  },
  {
    num: '02',
    title: 'Instant Liquidity Conversion',
    description:
      'Frictionless conversion between PHIVO and USDT inside the Unified Wallet backed by structured liquidity depth.',
    accent: '#00E5FF',
  },
  {
    num: '03',
    title: 'Vault & Governance Access',
    description:
      'Grants eligibility for time-locked Chrono Vault participation and future decentralized protocol governance proposals.',
    accent: '#00E676',
  },
  {
    num: '04',
    title: 'Global Merchant Payments (PHIVONEX Pay)',
    description:
      'Designed as a borderless payment rail enabling instant, low-fee checkout for global digital and retail merchants.',
    accent: '#FFE082',
  },
];

const TOKEN_SPECS = [
  { label: 'Symbol', value: 'PHIVO' },
  { label: 'Network', value: 'BNB Smart Chain (BEP-20)' },
  { label: 'Max Supply', value: '100,000,000 PHIVO' },
  { label: 'Contract Status', value: 'Audited BEP-20 Protocol Layer' },
];

export const PhivoTokenomicsSection: React.FC = () => {
  const [selectedId, setSelectedId] = useState<string>('genesis');
  const activeSlice =
    ALLOCATION_SLICES.find((s) => s.id === selectedId) || ALLOCATION_SLICES[0];

  // SVG Donut geometry
  const radius = 92;
  const circumference = 2 * Math.PI * radius;

  let cumulativePct = 0;
  const segments = ALLOCATION_SLICES.map((slice) => {
    const strokeLength = (slice.percentage / 100) * circumference;
    const gap = 3.5;
    const dashArray = `${Math.max(strokeLength - gap, 2)} ${circumference}`;
    const dashOffset = -(cumulativePct / 100) * circumference;
    cumulativePct += slice.percentage;
    return {
      ...slice,
      dashArray,
      dashOffset,
    };
  });

  return (
    <div className="space-y-8">
      {/* Top 2-Column Split: Interactive Donut Chart + Token Specification & Legend */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Donut Visualization Card */}
        <div
          className="lg:col-span-7 rounded-[24px] p-7 sm:p-9 border border-white/[0.08] flex flex-col justify-between gap-8"
          style={{
            background: 'rgba(14, 21, 19, 0.68)',
            backdropFilter: 'blur(24px)',
          }}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3
                className="text-xl font-semibold text-white tracking-tight"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                Fixed Supply Distribution
              </h3>
              <p className="text-sm text-slate-400 mt-1">
                Hard-capped at 100,000,000 PHIVO with zero uncapped minting.
              </p>
            </div>
            <span className="font-mono text-xs text-[#FFE082] tabular-nums shrink-0">
              100,000,000 MAX
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-8 items-center">
            {/* Interactive Donut SVG */}
            <div className="sm:col-span-6 flex items-center justify-center">
              <div className="relative w-[240px] h-[240px]">
                <svg
                  viewBox="0 0 240 240"
                  className="w-full h-full -rotate-90"
                  role="img"
                  aria-label="PHIVO 100,000,000 fixed token supply allocation chart"
                >
                  <circle
                    cx="120"
                    cy="120"
                    r={radius}
                    fill="none"
                    stroke="rgba(255,255,255,0.05)"
                    strokeWidth="22"
                  />
                  {segments.map((seg) => {
                    const isSelected = seg.id === activeSlice.id;
                    return (
                      <circle
                        key={seg.id}
                        cx="120"
                        cy="120"
                        r={radius}
                        fill="none"
                        stroke={seg.color}
                        strokeWidth={isSelected ? 26 : 20}
                        strokeDasharray={seg.dashArray}
                        strokeDashoffset={seg.dashOffset}
                        strokeLinecap="butt"
                        opacity={isSelected ? 1 : 0.68}
                        className="transition-all duration-200 cursor-pointer"
                        onMouseEnter={() => setSelectedId(seg.id)}
                        onClick={() => setSelectedId(seg.id)}
                      />
                    );
                  })}
                </svg>

                {/* Center Readout */}
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 pointer-events-none">
                  <span
                    className="text-3xl font-bold font-mono tabular-nums"
                    style={{ color: activeSlice.color }}
                  >
                    {activeSlice.percentage}%
                  </span>
                  <span className="text-xs font-medium text-white mt-1 leading-snug max-w-[132px]">
                    {activeSlice.label}
                  </span>
                  <span className="text-[11px] font-mono text-slate-400 tabular-nums mt-1">
                    {activeSlice.tokens}
                  </span>
                </div>
              </div>
            </div>

            {/* Interactive Allocation Breakdown List */}
            <div className="sm:col-span-6 space-y-2.5">
              {ALLOCATION_SLICES.map((slice) => {
                const isSelected = slice.id === activeSlice.id;
                return (
                  <button
                    key={slice.id}
                    type="button"
                    onMouseEnter={() => setSelectedId(slice.id)}
                    onClick={() => setSelectedId(slice.id)}
                    className={`w-full text-left px-3.5 py-2.5 rounded-xl border transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F5B800] ${
                      isSelected
                        ? 'bg-white/[0.06] border-white/[0.18]'
                        : 'bg-white/[0.015] border-white/[0.05] hover:bg-white/[0.04]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          aria-hidden="true"
                          className="w-2.5 h-2.5 rounded-sm shrink-0"
                          style={{ backgroundColor: slice.color }}
                        />
                        <span className="text-xs sm:text-[13px] font-medium text-slate-100 truncate">
                          {slice.label}
                        </span>
                      </div>
                      <span
                        className="font-mono text-xs font-semibold tabular-nums shrink-0"
                        style={{ color: isSelected ? slice.color : '#CBD5E1' }}
                      >
                        {slice.percentage}%
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Focused Slice Mandate Caption */}
          <div className="pt-4 border-t border-white/[0.07] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
            <span className="text-slate-300">{activeSlice.mandate}</span>
            <span className="font-mono text-slate-400 tabular-nums shrink-0">
              {activeSlice.tokens}
            </span>
          </div>
        </div>

        {/* Clean Token Specification Card */}
        <div
          className="lg:col-span-5 rounded-[24px] p-7 sm:p-9 border border-white/[0.08] flex flex-col justify-between gap-6"
          style={{
            background: 'rgba(14, 21, 19, 0.68)',
            backdropFilter: 'blur(24px)',
          }}
        >
          <div>
            <span className="text-xs font-medium text-[#00E5FF] tracking-wide">
              Token Specification
            </span>
            <h3
              className="text-xl sm:text-2xl font-semibold text-white tracking-tight mt-1.5"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              PHIVO Protocol Standard
            </h3>
            <p className="text-sm text-slate-400 mt-2 leading-relaxed">
              Engineered on BNB Smart Chain for deterministic settlement finality, verifiable supply boundaries, and global wallet interoperability.
            </p>
          </div>

          <dl className="divide-y divide-white/[0.07]">
            {TOKEN_SPECS.map((spec) => (
              <div
                key={spec.label}
                className="py-4 flex items-center justify-between gap-4"
              >
                <dt className="text-xs text-slate-400">{spec.label}</dt>
                <dd className="text-sm font-mono font-semibold text-white text-right tabular-nums">
                  {spec.value}
                </dd>
              </div>
            ))}
          </dl>

          <div className="pt-3 border-t border-white/[0.07] text-xs text-slate-400 leading-relaxed">
            Fixed monetary architecture designed so real ecosystem settlement, liquidity depth, and merchant demand anchor token utility over time.
          </div>
        </div>
      </div>

      {/* 4 Real-World Utility Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {UTILITY_CARDS.map((item) => (
          <div
            key={item.num}
            className="rounded-[20px] p-6 border border-white/[0.08] transition-colors duration-200 hover:border-white/[0.16]"
            style={{
              background: 'rgba(14, 21, 19, 0.62)',
              backdropFilter: 'blur(20px)',
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <span
                className="font-mono text-xs font-semibold tabular-nums"
                style={{ color: item.accent }}
              >
                {item.num}
              </span>
              <span
                aria-hidden="true"
                className="h-px w-8"
                style={{ backgroundColor: `${item.accent}55` }}
              />
            </div>
            <h4
              className="text-base font-semibold text-white tracking-tight"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {item.title}
            </h4>
            <p className="mt-2.5 text-sm text-slate-400 leading-relaxed">
              {item.description}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};
