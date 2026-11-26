import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  Sparkles,
  TrendingUp,
  Server,
  Clock,
} from 'lucide-react';

export interface OverviewPromoBanner {
  id: string;
  slug: string;
  badgeText: string;
  title: string;
  subtitle: string;
  ctaLabel: string;
  targetTab: string;
  accentTheme: 'gold' | 'cyan' | 'emerald';
  showNodeScarcity: boolean;
  isActive: boolean;
  sortOrder: number;
}

export interface GenesisSupplyTelemetry {
  totalCap: number;
  soldCount: number;
  remainingCount: number;
}

interface OverviewPromoCarouselProps {
  onNavigateTab: (tab: string) => void;
}

const DEFAULT_FALLBACK_PROMOS: OverviewPromoBanner[] = [
  {
    id: 'fallback-alpha',
    slug: 'quantum-alpha-spotlight',
    badgeText: 'FLAGSHIP TRADING DESK',
    title: 'PHIVONEX QUANTUM ALPHA™',
    subtitle: '7-Day Liquid Institutional Trading Pool • Mon–Fri Automated Settlement',
    ctaLabel: 'Open Quantum Alpha',
    targetTab: 'products:alpha',
    accentTheme: 'cyan',
    showNodeScarcity: false,
    isActive: true,
    sortOrder: 1,
  },
  {
    id: 'fallback-genesis',
    slug: 'genesis-core-scarcity',
    badgeText: 'LIMITED GLOBAL SUPPLY',
    title: 'PHIVONEX GENESIS CORE™',
    subtitle: 'Hard-Capped at 10,000 Validator Nodes Worldwide • Daily PHIVO Emission',
    ctaLabel: 'Claim Genesis Node',
    targetTab: 'products:genesis',
    accentTheme: 'emerald',
    showNodeScarcity: true,
    isActive: true,
    sortOrder: 2,
  },
  {
    id: 'fallback-chrono',
    slug: 'chrono-vaults-spotlight',
    badgeText: 'FIXED-TERM YIELD',
    title: 'PHIVONEX CHRONO VAULTS™',
    subtitle: 'Lock USDT for 200 Days to 10 Years • Predictable Daily Yield + 100% Principal Return',
    ctaLabel: 'Explore Chrono Vaults',
    targetTab: 'products:chrono',
    accentTheme: 'gold',
    showNodeScarcity: false,
    isActive: true,
    sortOrder: 3,
  },
];

const ACCENT_STYLES: Record<
  'gold' | 'cyan' | 'emerald',
  {
    border: string;
    glow: string;
    badgeBg: string;
    badgeText: string;
    ctaBg: string;
    progressGrad: string;
    sweepGrad: string;
    Icon: React.ComponentType<{ className?: string }>;
  }
> = {
  cyan: {
    border: 'border-[#00E5FF]/30',
    glow: 'radial-gradient(circle at 85% 20%, rgba(0, 229, 255, 0.22), transparent 60%)',
    badgeBg: 'bg-[#00E5FF]/12 border-[#00E5FF]/35',
    badgeText: 'text-[#00E5FF]',
    ctaBg: 'bg-gradient-to-r from-[#00E5FF] to-[#00B8D4] text-[#050807] shadow-[0_10px_24px_-10px_rgba(0,229,255,0.65)]',
    progressGrad: 'from-[#00E5FF] to-[#00E676]',
    sweepGrad: 'linear-gradient(90deg, transparent, rgba(0, 229, 255, 0.14), transparent)',
    Icon: TrendingUp,
  },
  emerald: {
    border: 'border-[#00E676]/30',
    glow: 'radial-gradient(circle at 85% 20%, rgba(0, 230, 118, 0.22), transparent 60%)',
    badgeBg: 'bg-[#00E676]/12 border-[#00E676]/35',
    badgeText: 'text-[#00E676]',
    ctaBg: 'bg-gradient-to-r from-[#00E676] to-[#00C853] text-[#050807] shadow-[0_10px_24px_-10px_rgba(0,230,118,0.65)]',
    progressGrad: 'from-[#00E676] via-[#00E5FF] to-[#F5B800]',
    sweepGrad: 'linear-gradient(90deg, transparent, rgba(0, 230, 118, 0.14), transparent)',
    Icon: Server,
  },
  gold: {
    border: 'border-[#F5B800]/35',
    glow: 'radial-gradient(circle at 85% 20%, rgba(245, 184, 0, 0.22), transparent 60%)',
    badgeBg: 'bg-[#F5B800]/14 border-[#F5B800]/40',
    badgeText: 'text-[#F5B800]',
    ctaBg: 'bg-gradient-to-r from-[#F5B800] to-[#FFD54F] text-[#050807] shadow-[0_10px_24px_-10px_rgba(245,184,0,0.65)]',
    progressGrad: 'from-[#F5B800] to-[#FFD54F]',
    sweepGrad: 'linear-gradient(90deg, transparent, rgba(245, 184, 0, 0.16), transparent)',
    Icon: Clock,
  },
};

export const OverviewPromoCarousel: React.FC<OverviewPromoCarouselProps> = ({
  onNavigateTab,
}) => {
  const [promos, setPromos] = useState<OverviewPromoBanner[]>(DEFAULT_FALLBACK_PROMOS);
  const [supply, setSupply] = useState<GenesisSupplyTelemetry>({
    totalCap: 10000,
    soldCount: 0,
    remainingCount: 10000,
  });
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const touchStartX = useRef<number | null>(null);

  const fetchPromos = useCallback(async () => {
    try {
      const res = await fetch('/api/ecosystem/promos', { credentials: 'include' });
      if (!res.ok) return;
      const json = await res.json();
      if (json?.success && Array.isArray(json.promos)) {
        setPromos(json.promos);
        setActiveIndex((prev) =>
          json.promos.length > 0 ? Math.min(prev, json.promos.length - 1) : 0
        );
      }
      if (json?.genesisSupply) {
        setSupply({
          totalCap: Number(json.genesisSupply.totalCap ?? 10000),
          soldCount: Number(json.genesisSupply.soldCount ?? 0),
          remainingCount: Number(json.genesisSupply.remainingCount ?? 10000),
        });
      }
    } catch {
      // Retain institutional defaults on transient network error
    }
  }, []);

  useEffect(() => {
    fetchPromos();
  }, [fetchPromos]);

  // Smooth 5-second auto-advance, paused cleanly on hover or touch
  useEffect(() => {
    if (isPaused || promos.length <= 1) return;
    const timer = window.setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % promos.length);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [isPaused, promos.length]);

  if (promos.length === 0) {
    return null;
  }

  const current = promos[activeIndex] || promos[0];
  const theme = ACCENT_STYLES[current.accentTheme] || ACCENT_STYLES.cyan;
  const SlideIcon = theme.Icon;

  const handlePrev = () => {
    setActiveIndex((prev) => (prev - 1 + promos.length) % promos.length);
  };

  const handleNext = () => {
    setActiveIndex((prev) => (prev + 1) % promos.length);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    setIsPaused(true);
    touchStartX.current = e.touches[0]?.clientX ?? null;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const start = touchStartX.current;
    const end = e.changedTouches[0]?.clientX ?? null;
    if (start !== null && end !== null) {
      const delta = end - start;
      if (delta > 42) handlePrev();
      else if (delta < -42) handleNext();
    }
    touchStartX.current = null;
    setIsPaused(false);
  };

  return (
    <section
      aria-label="PHIVONEX Product & Supply Spotlights"
      className="w-full max-w-full min-w-0"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div
        className={`relative w-full min-w-0 rounded-[24px] overflow-hidden oneui-glass-card ${theme.border} p-4 sm:p-5 lg:p-6 transition-colors duration-300`}
      >
        {/* Ambient Accent Glow */}
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none transition-opacity duration-500"
          style={{ background: theme.glow }}
        />

        {/* Metallic GPU-Composited 60fps Light Sweep */}
        <div
          aria-hidden="true"
          className="animate-phx-light-sweep absolute inset-y-0 left-0 w-1/3 pointer-events-none"
          style={{ background: theme.sweepGrad }}
        />

        {/* Main Content Grid */}
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4 min-w-0">
          <div className="min-w-0 flex-1 space-y-2">
            {/* Badge Row */}
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[10px] font-mono font-bold uppercase tracking-wider ${theme.badgeBg} ${theme.badgeText}`}
              >
                <Sparkles className="w-3 h-3 shrink-0" />
                <span>{current.badgeText}</span>
              </span>

              {promos.length > 1 && (
                <span className="text-[10px] font-mono text-[#98A2B3] tabular-nums">
                  {activeIndex + 1} / {promos.length}
                </span>
              )}
            </div>

            {/* Title & Subtitle */}
            <div className="flex items-start gap-3 min-w-0">
              <div
                className={`hidden sm:flex w-10 h-10 rounded-2xl border items-center justify-center shrink-0 mt-0.5 ${theme.badgeBg} ${theme.badgeText}`}
              >
                <SlideIcon className="w-5 h-5" />
              </div>
              <div className="min-w-0 space-y-1">
                <h2 className="text-base sm:text-lg font-extrabold text-white tracking-tight leading-snug break-words">
                  {current.title}
                </h2>
                <p className="text-xs sm:text-[13px] text-[#D0D5DD]/85 leading-relaxed">
                  {current.subtitle}
                </p>
              </div>
            </div>

            {/* Live 10,000 Genesis Node Scarcity Telemetry Bar */}
            {current.showNodeScarcity && (
              <div className="pt-1.5 max-w-xl space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-[11px] font-mono">
                  <span className="text-[#00E676] font-bold tabular-nums">
                    {supply.remainingCount.toLocaleString('en-US')} / {supply.totalCap.toLocaleString('en-US')} Nodes Remaining
                  </span>
                  <span className="text-[#98A2B3] tabular-nums">
                    {supply.soldCount.toLocaleString('en-US')} Claimed
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-white/[0.08] overflow-hidden">
                  <div
                    className={`h-full rounded-full bg-gradient-to-r ${theme.progressGrad} transition-all duration-700`}
                    style={{
                      width: `${Math.max(
                        4,
                        Math.min(100, supply.totalCap > 0 ? (supply.soldCount / supply.totalCap) * 100 : 4)
                      )}%`,
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* CTA & Carousel Controls */}
          <div className="flex items-center justify-between md:justify-end gap-2.5 shrink-0 pt-1 md:pt-0">
            <button
              type="button"
              onClick={() => onNavigateTab(current.targetTab || 'products:alpha')}
              className={`min-h-[44px] px-4 sm:px-5 py-2.5 rounded-2xl font-extrabold text-xs inline-flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-95 whitespace-nowrap ${theme.ctaBg}`}
            >
              <span>{current.ctaLabel}</span>
              <ArrowRight className="w-4 h-4 shrink-0" />
            </button>

            {promos.length > 1 && (
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={handlePrev}
                  className="min-h-[40px] min-w-[40px] rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-[#D0D5DD] hover:text-white flex items-center justify-center transition-all cursor-pointer active:scale-95"
                  aria-label="Previous spotlight"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleNext}
                  className="min-h-[40px] min-w-[40px] rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-[#D0D5DD] hover:text-white flex items-center justify-center transition-all cursor-pointer active:scale-95"
                  aria-label="Next spotlight"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Dot Indicators */}
        {promos.length > 1 && (
          <div className="relative z-10 flex items-center justify-center gap-1.5 mt-4">
            {promos.map((p, idx) => {
              const isSelected = idx === activeIndex;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setActiveIndex(idx)}
                  aria-label={`View spotlight ${idx + 1}: ${p.title}`}
                  className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${
                    isSelected
                      ? 'w-7 bg-[#00E5FF]'
                      : 'w-2 bg-white/20 hover:bg-white/40'
                  }`}
                />
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};
