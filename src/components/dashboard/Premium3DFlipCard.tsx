import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  RotateCw,
  Copy,
  Check,
  ArrowDownLeft,
  ArrowUpRight,
  Layers,
  Users,
  Sparkles,
  Share2,
  ArrowLeft,
} from 'lucide-react';
import { UserProfile } from '../../context/AuthContext';
import { PhivonexSymbol } from '../brand/PhivonexSymbol';
import { RankCrestEmblem } from '../brand/RankCrestEmblem';

interface Premium3DFlipCardProps {
  user: UserProfile | null;
  displayName?: string;
  availableUsdt: number;
  phivoBalance: number;
  phivoRate: number;
  activePortfolioCapitalUsd: number;
  activeNodes: number;
  currentRankLevel: number;
  currentRankName: string;
  unlockedGenerations: number;
  directPartnersCount: number;
  referralUrl: string;
  onNavigateTab?: (tab: string) => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export const Premium3DFlipCard: React.FC<Premium3DFlipCardProps> = ({
  user,
  availableUsdt,
  phivoBalance,
  phivoRate,
  activePortfolioCapitalUsd,
  currentRankLevel,
  currentRankName,
  unlockedGenerations,
  directPartnersCount,
  referralUrl,
  onNavigateTab,
  onRefresh,
  isRefreshing = false,
}) => {
  const [isFlipped, setIsFlipped] = useState(false);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [copiedReferral, setCopiedReferral] = useState(false);
  const sceneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      setPrefersReducedMotion(mediaQuery.matches);
      const listener = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
      mediaQuery.addEventListener('change', listener);
      return () => mediaQuery.removeEventListener('change', listener);
    }
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (prefersReducedMotion || !sceneRef.current) return;
      if (typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches) {
        return;
      }

      const rect = sceneRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const cx = rect.width / 2;
      const cy = rect.height / 2;

      const tiltX = -((y - cy) / cy) * 2.5;
      const tiltY = ((x - cx) / cx) * 2.8;
      setTilt({ x: tiltX, y: tiltY });
    },
    [prefersReducedMotion]
  );

  const handleMouseLeave = () => {
    setIsHovered(false);
    setTilt({ x: 0, y: 0 });
  };

  const handleFlipToggle = () => {
    setIsFlipped((prev) => !prev);
  };

  const handleCopyPublicId = (e: React.MouseEvent) => {
    e.stopPropagation();
    const id = user?.publicId || 'PHX-MEMBER';
    navigator.clipboard.writeText(id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const handleCopyReferralLink = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!referralUrl) return;
    navigator.clipboard.writeText(referralUrl);
    setCopiedReferral(true);
    setTimeout(() => setCopiedReferral(false), 2200);
  };

  const formatUsd = (val: number) =>
    Number(val || 0).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const formatPhivo = (val: number) =>
    Number(val || 0).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const publicId = user?.publicId || 'PHX-MEMBER';
  const phivoValueUsd = phivoBalance * (phivoRate || 0.1);
  const clampedGenerations = Math.max(0, Math.min(16, unlockedGenerations || 0));

  const cardTransform = prefersReducedMotion
    ? isFlipped
      ? 'rotateY(180deg)'
      : 'rotateY(0deg)'
    : isFlipped
    ? `rotateY(${180 + (isHovered ? tilt.y * 0.35 : 0)}deg) rotateX(${isHovered ? tilt.x * 0.35 : 0}deg)`
    : `rotateY(${isHovered ? tilt.y : 0}deg) rotateX(${isHovered ? tilt.x : 0}deg)`;

  return (
    <section aria-label="PHIVONEX Interactive Balance Card" className="w-full max-w-full min-w-0 space-y-2.5 select-none">
      <div
        ref={sceneRef}
        className="relative w-full max-w-full"
        style={{ perspective: '1600px' }}
        onMouseMove={handleMouseMove}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={handleMouseLeave}
      >
        {/* CSS Grid Overlay ensures Front and Back share exact natural height with zero clipping at 360px */}
        <div
          className="grid w-full transition-transform"
          style={{
            transformStyle: 'preserve-3d',
            transform: cardTransform,
            transition: isHovered
              ? 'transform 140ms ease-out'
              : 'transform 720ms cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        >
          {/* ================================================================
              FRONT FACE: ONE UI 9.5 HOLOGRAPHIC BALANCE & PORTFOLIO CARD
             ================================================================ */}
          <div
            className={`col-start-1 row-start-1 relative w-full min-w-0 rounded-[28px] p-4 sm:p-6 lg:p-7 overflow-hidden flex flex-col justify-between gap-4 sm:gap-5 ${
              isFlipped ? 'pointer-events-none' : 'pointer-events-auto'
            }`}
            style={{
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
              transform: 'rotateY(0deg)',
              background:
                'linear-gradient(145deg, rgba(16, 26, 23, 0.86) 0%, rgba(10, 17, 15, 0.90) 52%, rgba(6, 11, 10, 0.94) 100%)',
              backdropFilter: 'blur(28px)',
              WebkitBackdropFilter: 'blur(28px)',
              border: '1px solid rgba(255, 255, 255, 0.13)',
              boxShadow:
                '0 24px 60px -22px rgba(0, 0, 0, 0.9), 0 0 36px -12px rgba(0, 229, 255, 0.16), inset 0 1px 0 rgba(255, 255, 255, 0.22)',
            }}
          >
            {/* Top Specular Rim Highlight */}
            <div
              aria-hidden="true"
              className="absolute top-0 inset-x-8 h-[1px] bg-gradient-to-r from-transparent via-[#00E5FF]/70 to-transparent pointer-events-none"
            />

            {/* Subtle Holographic Cyan/Gold Refraction Orbs */}
            <div
              aria-hidden="true"
              className="absolute -top-20 -right-16 w-60 h-60 rounded-full pointer-events-none"
              style={{
                background:
                  'radial-gradient(circle, rgba(0, 229, 255, 0.18) 0%, rgba(245, 184, 0, 0.08) 45%, transparent 72%)',
                filter: 'blur(28px)',
              }}
            />
            <div
              aria-hidden="true"
              className="absolute -bottom-24 -left-16 w-56 h-56 rounded-full pointer-events-none"
              style={{
                background:
                  'radial-gradient(circle, rgba(0, 230, 118, 0.12) 0%, transparent 70%)',
                filter: 'blur(28px)',
              }}
            />

            {/* FRONT TOP BAR: Account Active + PHIVONEX ID Copy + Flip Button */}
            <div className="relative z-10 flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-wrap">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#00E676]/12 border border-[#00E676]/35 text-[#00E676] text-[10px] sm:text-[11px] font-semibold tracking-wide whitespace-nowrap">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#00E676] animate-pulse" />
                  <span>Account Active</span>
                </span>

                <button
                  type="button"
                  onClick={handleCopyPublicId}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.1] text-[#D0D5DD] hover:text-white text-[10px] sm:text-[11px] font-mono transition-colors cursor-pointer active:scale-95"
                  title="Copy PHIVONEX ID"
                >
                  <span className="truncate max-w-[110px] sm:max-w-none">{publicId}</span>
                  {copiedId ? (
                    <Check className="w-3 h-3 text-[#00E676] shrink-0" />
                  ) : (
                    <Copy className="w-3 h-3 text-[#00E5FF] shrink-0" />
                  )}
                </button>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {onRefresh && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRefresh();
                    }}
                    disabled={isRefreshing}
                    className="min-h-[36px] min-w-[36px] rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.1] text-[#98A2B3] hover:text-white flex items-center justify-center transition-all cursor-pointer active:scale-95"
                    aria-label="Refresh portfolio balances"
                    title="Refresh balances"
                  >
                    <RotateCw className={`w-3.5 h-3.5 text-[#00E5FF] ${isRefreshing ? 'animate-spin' : ''}`} />
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleFlipToggle}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] rounded-xl bg-[#00E5FF]/12 hover:bg-[#00E5FF]/20 border border-[#00E5FF]/40 text-[#00E5FF] hover:text-white text-[11px] font-semibold tracking-wide transition-all cursor-pointer active:scale-95"
                  aria-label="Flip card to Leadership & Referral identity"
                >
                  <span>Flip Card</span>
                  <RotateCw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* FRONT HERO BALANCE DISPLAY */}
            <div className="relative z-10 flex items-center justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <div className="text-[10px] sm:text-[11px] font-mono uppercase tracking-[0.16em] text-[#98A2B3]">
                  Available USDT Balance
                </div>
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span
                    className="font-mono font-extrabold text-white tabular-nums tracking-tight leading-none"
                    style={{ fontSize: 'clamp(1.75rem, 6vw, 2.5rem)' }}
                  >
                    ${formatUsd(availableUsdt)}
                  </span>
                  <span className="text-xs sm:text-sm font-mono font-semibold text-[#00E5FF]">
                    USDT
                  </span>
                </div>
              </div>

              <div className="hidden sm:flex w-14 h-14 rounded-2xl bg-[#050807]/70 border border-white/[0.1] items-center justify-center shrink-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]">
                <PhivonexSymbol size={34} glow={true} animated={!prefersReducedMotion} />
              </div>
            </div>

            {/* FRONT DUAL SPLIT STRIP: PHIVO MINING WALLET + ACTIVE PORTFOLIO CAPITAL */}
            <div className="relative z-10 grid grid-cols-1 xs:grid-cols-2 gap-2.5 sm:gap-3">
              <div
                onClick={() => onNavigateTab?.('wallet')}
                className="p-3 sm:p-3.5 rounded-2xl bg-black/35 hover:bg-black/45 border border-white/[0.08] hover:border-[#00E5FF]/35 transition-all cursor-pointer min-w-0"
              >
                <div className="flex items-center justify-between gap-1 text-[10px] font-mono uppercase tracking-wider text-[#98A2B3]">
                  <span className="truncate">PHIVO Mining Wallet</span>
                  <Sparkles className="w-3 h-3 text-[#00E5FF] shrink-0" />
                </div>
                <div className="mt-1 flex items-baseline gap-1.5 flex-wrap">
                  <span className="text-sm sm:text-base font-mono font-bold text-[#00E5FF] tabular-nums">
                    {formatPhivo(phivoBalance)}
                  </span>
                  <span className="text-[10px] font-mono text-[#98A2B3]">PHIVO</span>
                </div>
                <div className="text-[10px] sm:text-[11px] font-mono text-[#D0D5DD]/80 tabular-nums mt-0.5 truncate">
                  ≈ ${formatUsd(phivoValueUsd)} USD (@ ${(phivoRate || 0.1).toFixed(2)})
                </div>
              </div>

              <div
                onClick={() => onNavigateTab?.('products:alpha')}
                className="p-3 sm:p-3.5 rounded-2xl bg-black/35 hover:bg-black/45 border border-white/[0.08] hover:border-[#F5B800]/35 transition-all cursor-pointer min-w-0"
              >
                <div className="flex items-center justify-between gap-1 text-[10px] font-mono uppercase tracking-wider text-[#98A2B3]">
                  <span className="truncate">Active Portfolio Capital</span>
                  <Layers className="w-3 h-3 text-[#F5B800] shrink-0" />
                </div>
                <div className="mt-1 flex items-baseline gap-1.5 flex-wrap">
                  <span className="text-sm sm:text-base font-mono font-bold text-white tabular-nums">
                    ${formatUsd(activePortfolioCapitalUsd)}
                  </span>
                  <span className="text-[10px] font-mono text-[#F5B800]">USDT</span>
                </div>
                <div className="text-[10px] sm:text-[11px] text-[#98A2B3] mt-0.5 truncate">
                  Alpha™ • Vaults™ • Genesis Core™
                </div>
              </div>
            </div>

            {/* FRONT INTEGRATED QUICK PILLS: Deposit • Withdraw • Allocate Capital */}
            <div className="relative z-10 grid grid-cols-3 gap-2 pt-1">
              <button
                type="button"
                onClick={() => onNavigateTab?.('deposit')}
                className="min-h-[44px] px-2.5 py-2 rounded-2xl bg-gradient-to-r from-[#00E5FF] to-[#00B8D4] hover:brightness-110 text-[#050807] font-bold text-[11px] sm:text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-95 shadow-[0_10px_24px_-10px_rgba(0,229,255,0.65)]"
              >
                <ArrowDownLeft className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Deposit</span>
              </button>

              <button
                type="button"
                onClick={() => onNavigateTab?.('withdrawals')}
                className="min-h-[44px] px-2.5 py-2 rounded-2xl bg-white/[0.07] hover:bg-white/[0.12] border border-white/[0.12] text-white font-semibold text-[11px] sm:text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-95"
              >
                <ArrowUpRight className="w-3.5 h-3.5 text-[#D0D5DD] shrink-0" />
                <span className="truncate">Withdraw</span>
              </button>

              <button
                type="button"
                onClick={() => onNavigateTab?.('products:alpha')}
                className="min-h-[44px] px-2.5 py-2 rounded-2xl bg-[#F5B800]/14 hover:bg-[#F5B800]/22 border border-[#F5B800]/40 text-[#F5B800] hover:text-white font-bold text-[11px] sm:text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-95"
              >
                <Layers className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Allocate</span>
              </button>
            </div>
          </div>

          {/* ================================================================
              BACK FACE: LEADERSHIP RANK, 16-GEN DEPTH & PARTNER REFERRAL LINK
             ================================================================ */}
          <div
            className={`col-start-1 row-start-1 relative w-full min-w-0 rounded-[28px] p-4 sm:p-6 lg:p-7 overflow-hidden flex flex-col justify-between gap-4 sm:gap-5 ${
              isFlipped ? 'pointer-events-auto' : 'pointer-events-none'
            }`}
            style={{
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
              transform: 'rotateY(180deg)',
              background:
                'linear-gradient(145deg, rgba(20, 24, 18, 0.90) 0%, rgba(11, 17, 15, 0.92) 55%, rgba(6, 10, 9, 0.96) 100%)',
              backdropFilter: 'blur(28px)',
              WebkitBackdropFilter: 'blur(28px)',
              border: '1px solid rgba(245, 184, 0, 0.28)',
              boxShadow:
                '0 24px 60px -22px rgba(0, 0, 0, 0.92), 0 0 36px -12px rgba(245, 184, 0, 0.16), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
            }}
          >
            {/* Top Metallic Gold Specular Rim */}
            <div
              aria-hidden="true"
              className="absolute top-0 inset-x-8 h-[1px] bg-gradient-to-r from-transparent via-[#F5B800]/75 to-transparent pointer-events-none"
            />

            {/* Back Top Bar */}
            <div className="relative z-10 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#F5B800]">
                  PHIVONEX Partner Identity
                </div>
                <div className="text-xs font-mono font-bold text-white truncate">
                  {publicId}
                </div>
              </div>

              <button
                type="button"
                onClick={handleFlipToggle}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.14] text-white text-[11px] font-semibold transition-all cursor-pointer active:scale-95 shrink-0"
                aria-label="Flip back to Balance Card"
              >
                <ArrowLeft className="w-3.5 h-3.5 text-[#F5B800]" />
                <span>Flip Back</span>
              </button>
            </div>

            {/* Leadership Rank Hero Strip */}
            <div className="relative z-10 flex items-center gap-3.5 p-3.5 rounded-2xl bg-black/35 border border-[#F5B800]/25">
              <RankCrestEmblem rank={currentRankLevel} size={50} />
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-mono uppercase tracking-wider text-[#98A2B3]">
                  Current Leadership Rank
                </div>
                <div className="text-base sm:text-lg font-extrabold text-white truncate">
                  #{currentRankLevel} {currentRankName}
                </div>
                <div className="text-[11px] text-[#F5B800] font-medium truncate">
                  7-Stage Career &amp; Leadership Ladder
                </div>
              </div>
            </div>

            {/* Unilevel Depth & Direct Partners Stats */}
            <div className="relative z-10 grid grid-cols-2 gap-2.5 sm:gap-3">
              <div
                onClick={() => onNavigateTab?.('network')}
                className="p-3 rounded-2xl bg-black/35 hover:bg-black/45 border border-white/[0.08] cursor-pointer transition-colors min-w-0"
              >
                <div className="text-[10px] font-mono uppercase tracking-wider text-[#98A2B3] truncate">
                  Unlocked Unilevel Depth
                </div>
                <div className="mt-1 flex items-baseline gap-1 font-mono font-extrabold text-white tabular-nums">
                  <span className="text-lg sm:text-xl text-[#00E5FF]">{clampedGenerations}</span>
                  <span className="text-xs text-[#98A2B3]">/ 16 Generations</span>
                </div>
              </div>

              <div
                onClick={() => onNavigateTab?.('network')}
                className="p-3 rounded-2xl bg-black/35 hover:bg-black/45 border border-white/[0.08] cursor-pointer transition-colors min-w-0"
              >
                <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-[#98A2B3]">
                  <span className="truncate">Direct Partners</span>
                  <Users className="w-3.5 h-3.5 text-[#00E676] shrink-0" />
                </div>
                <div className="mt-1 flex items-baseline gap-1.5 font-mono font-extrabold text-white tabular-nums">
                  <span className="text-lg sm:text-xl text-[#00E676]">{directPartnersCount}</span>
                  <span className="text-xs text-[#98A2B3]">Gen-1 Active</span>
                </div>
              </div>
            </div>

            {/* 1-Tap Copy Partner Referral Link */}
            <div className="relative z-10 flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleCopyReferralLink}
                className="flex-1 min-h-[44px] px-4 py-2.5 rounded-2xl bg-gradient-to-r from-[#F5B800] to-[#FFD54F] hover:brightness-105 text-[#050807] font-extrabold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-95 shadow-[0_12px_28px_-12px_rgba(245,184,0,0.65)]"
              >
                {copiedReferral ? (
                  <>
                    <Check className="w-4 h-4 shrink-0" />
                    <span>Partner Referral Link Copied</span>
                  </>
                ) : (
                  <>
                    <Share2 className="w-4 h-4 shrink-0" />
                    <span className="truncate">Copy Partner Referral Link</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Subtle Face Indicator Dots */}
      <div className="flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => setIsFlipped(false)}
          aria-label="Show Balance Front Face"
          className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${
            !isFlipped
              ? 'w-8 bg-gradient-to-r from-[#00E5FF] to-[#00E676]'
              : 'w-2 bg-white/20 hover:bg-white/40'
          }`}
        />
        <button
          type="button"
          onClick={() => setIsFlipped(true)}
          aria-label="Show Leadership & Referral Back Face"
          className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${
            isFlipped
              ? 'w-8 bg-gradient-to-r from-[#F5B800] to-[#FFD54F]'
              : 'w-2 bg-white/20 hover:bg-white/40'
          }`}
        />
      </div>
    </section>
  );
};
