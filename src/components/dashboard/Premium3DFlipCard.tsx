import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  Mail,
  Globe,
  RotateCw,
  Wallet,
  Server,
  Trophy,
  Users,
  ShieldCheck,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
} from 'lucide-react';
import { UserProfile } from '../../context/AuthContext';
import { PhivonexSymbol } from '../brand/PhivonexSymbol';

interface Premium3DFlipCardProps {
  user: UserProfile | null;
  displayName: string;
  availableUsdt: number;
  activeNodes: number;
  currentRankName: string;
  networkStatus?: string;
  onNavigateTab?: (tab: string) => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export const Premium3DFlipCard: React.FC<Premium3DFlipCardProps> = ({
  user,
  displayName,
  availableUsdt,
  activeNodes,
  currentRankName,
  networkStatus = 'Synchronized',
  onNavigateTab,
  onRefresh,
  isRefreshing = false,
}) => {
  const [isFlipped, setIsFlipped] = useState(false);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const sceneRef = useRef<HTMLDivElement>(null);

  // Detect prefers-reduced-motion
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      setPrefersReducedMotion(mediaQuery.matches);
      const listener = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
      mediaQuery.addEventListener('change', listener);
      return () => mediaQuery.removeEventListener('change', listener);
    }
  }, []);

  // Desktop subtle pointer tilt (±3deg to ±4deg max)
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

      // Subtle tilt: max 3.2 degrees
      const tiltX = -((y - cy) / cy) * 3.2;
      const tiltY = ((x - cx) / cx) * 3.5;

      setTilt({ x: tiltX, y: tiltY });
    },
    [prefersReducedMotion]
  );

  const handleMouseEnter = () => setIsHovered(true);

  const handleMouseLeave = () => {
    setIsHovered(false);
    setTilt({ x: 0, y: 0 });
  };

  const handleFlipToggle = () => {
    setIsFlipped((prev) => !prev);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleFlipToggle();
    }
  };

  const formatCurrency = (val: number) => {
    return val.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  // Safe public identifier
  const publicId = user?.publicId || 'PHX-MEMBER';

  // Compute transform: combines flip state with pointer tilt
  const cardTransform = prefersReducedMotion
    ? isFlipped
      ? 'rotateY(180deg)'
      : 'rotateY(0deg)'
    : isFlipped
    ? `rotateY(${180 + (isHovered ? tilt.y * 0.4 : 0)}deg) rotateX(${isHovered ? tilt.x * 0.4 : 0}deg)`
    : `rotateY(${isHovered ? tilt.y : 0}deg) rotateX(${isHovered ? tilt.x : 0}deg)`;

  return (
    <div className="w-full space-y-2.5 select-none">
      {/* ========================================================
          1. CARD SCENE: Owns fixed dimensions & 3D perspective
         ======================================================== */}
      <div
        ref={sceneRef}
        className="card-scene relative w-full max-w-[940px] mx-auto"
        style={{ perspective: '1400px' }}
        onMouseMove={handleMouseMove}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {/* ========================================================
            2. CARD-3D: The single physical Visa-proportioned card
            Aspect Ratio 1.586 : 1 (ISO/IEC 7810 ID-1 Standard)
           ======================================================== */}
        <div
          role="button"
          tabIndex={0}
          aria-pressed={isFlipped}
          aria-label={
            isFlipped
              ? 'PHIVONEX Network Card. Press Enter or Space to return to Overview.'
              : 'PHIVONEX Overview Card. Press Enter or Space to show Network Card.'
          }
          onClick={(e) => {
            const target = e.target as HTMLElement;
            if (target.closest('button:not(.flip-trigger)')) return;
            handleFlipToggle();
          }}
          onKeyDown={handleKeyDown}
          className={`card-3d relative w-full rounded-2xl sm:rounded-3xl cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[#00CFFF] ${
            isFlipped ? 'is-flipped' : ''
          }`}
          style={{
            aspectRatio: '1.586 / 1',
            transformStyle: 'preserve-3d',
            transform: cardTransform,
            transition: isHovered
              ? 'transform 0.12s ease-out'
              : 'transform 780ms cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        >
          {/* ========================================================
              FRONT FACE: VISA-STYLE PHIVONEX OVERVIEW
              Absolute inset-0 (occupies exact same coordinates as Back)
             ======================================================== */}
          <div
            className="card-face card-front absolute inset-0 w-full h-full rounded-2xl sm:rounded-3xl p-3.5 sm:p-5 md:p-6 lg:p-7 overflow-hidden flex flex-col justify-between"
            style={{
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
              transform: 'rotateY(0deg)',
              background: 'linear-gradient(135deg, rgba(9, 21, 38, 0.98) 0%, rgba(6, 14, 27, 0.99) 55%, rgba(3, 7, 14, 0.99) 100%)',
              border: '1px solid rgba(0, 207, 255, 0.35)',
              boxShadow: isHovered
                ? '0 25px 50px -12px rgba(0, 0, 0, 0.85), 0 0 30px rgba(0, 207, 255, 0.2), inset 0 1px 1px rgba(255, 255, 255, 0.25), inset 0 0 20px rgba(0, 207, 255, 0.08)'
                : '0 20px 40px -15px rgba(0, 0, 0, 0.8), 0 0 20px rgba(0, 207, 255, 0.12), inset 0 1px 1px rgba(255, 255, 255, 0.2), inset 0 0 15px rgba(0, 207, 255, 0.05)',
            }}
          >
            {/* Top Specular Rim */}
            <div className="absolute top-0 inset-x-6 sm:inset-x-12 h-[1px] bg-gradient-to-r from-transparent via-[#80EAFF]/70 to-transparent pointer-events-none" />

            {/* Subtle Diagonal Brushed Glass Sheen */}
            <div
              className="absolute inset-0 pointer-events-none opacity-25"
              style={{
                background: 'linear-gradient(115deg, rgba(255,255,255,0.15) 0%, transparent 35%, rgba(0,207,255,0.08) 65%, transparent 100%)',
              }}
            />

            {/* Right Ambient Cyan Light Flare */}
            <div
              className="absolute right-0 top-1/2 -translate-y-1/2 w-48 h-48 sm:w-72 sm:h-72 rounded-full pointer-events-none"
              style={{
                background: 'radial-gradient(circle, rgba(0, 207, 255, 0.24) 0%, rgba(0, 136, 255, 0.08) 50%, transparent 75%)',
                filter: 'blur(30px)',
              }}
            />

            {/* FRONT TOP ROW: Status Badges & Quick Flip Control */}
            <div className="relative z-10 flex items-center justify-between gap-2">
              {/* Badges Container */}
              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap max-w-[80%]">
                {/* Account Active */}
                <span className="inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-0.5 rounded-full bg-[#052E1C]/90 border border-[#32D583]/40 text-[#32D583] text-[9px] sm:text-[10px] md:text-[11px] font-semibold tracking-wide whitespace-nowrap">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#32D583] animate-pulse" />
                  <span>Account Active</span>
                </span>

                {/* Email Verified */}
                <span className="inline-flex items-center gap-1 px-2 sm:px-2.5 py-0.5 rounded-full bg-[#08182B]/90 border border-[#00CFFF]/30 text-white/90 text-[9px] sm:text-[10px] md:text-[11px] whitespace-nowrap">
                  <Mail className="w-3 h-3 text-[#00CFFF]" />
                  <span>{user?.emailVerified ? 'Email Verified' : 'Confirmed'}</span>
                </span>

                {/* Network Synchronized (Hidden on ultra-narrow 320px screens if needed) */}
                <span className="hidden xs:inline-flex items-center gap-1 px-2 sm:px-2.5 py-0.5 rounded-full bg-[#08182B]/90 border border-[#00CFFF]/30 text-[#00CFFF] text-[9px] sm:text-[10px] md:text-[11px] whitespace-nowrap">
                  <Globe className="w-3 h-3 text-[#00CFFF]" />
                  <span>Network Synchronized</span>
                </span>
              </div>

              {/* Top-Right Flip Icon Indicator */}
              <div className="flex items-center gap-1.5 shrink-0">
                {onRefresh && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRefresh();
                    }}
                    disabled={isRefreshing}
                    className="p-1 sm:p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-[#98A2B3] hover:text-white transition-all cursor-pointer"
                    title="Synchronize metrics"
                    aria-label="Synchronize metrics"
                  >
                    <RotateCw className={`w-3 h-3 text-[#00CFFF] ${isRefreshing ? 'animate-spin' : ''}`} />
                  </button>
                )}
                <div
                  className="p-1 sm:p-1.5 rounded-lg bg-[#00CFFF]/10 border border-[#00CFFF]/30 text-[#00CFFF] transition-all hover:bg-[#00CFFF]/20"
                  title="Flip to Network Card"
                >
                  <RotateCw className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                </div>
              </div>
            </div>

            {/* FRONT MIDDLE: Greeting & 3D PHIVONEX Core Emblem */}
            <div className="relative z-10 flex items-center justify-between gap-3 sm:gap-6 my-auto">
              {/* Left Column: Greeting Typography */}
              <div className="space-y-1 sm:space-y-2 max-w-[62%]">
                <h1 className="text-[clamp(15px,3.2vw,32px)] font-black text-white tracking-tight leading-tight">
                  Welcome back,{' '}
                  <span className="text-[#00CFFF] drop-shadow-[0_0_14px_rgba(0,207,255,0.45)]">
                    {displayName}
                  </span>
                </h1>
                <p className="text-[clamp(8.5px,1.4vw,13px)] text-[#98A2B3] leading-relaxed line-clamp-2 sm:line-clamp-3">
                  Manage your PHIVONEX nodes, wallet balance, network growth, and daily rewards from your unified dashboard.
                </p>
              </div>

              {/* Right Column: 3D Emblem Core Motif */}
              <div className="shrink-0 flex flex-col items-center justify-center relative">
                <div className="relative w-[clamp(68px,15vw,170px)] h-[clamp(68px,15vw,170px)] flex items-center justify-center">
                  {/* Outer Glowing Energy Ring */}
                  <div className="absolute inset-0 rounded-full border border-[#00CFFF]/35 shadow-[0_0_15px_rgba(0,207,255,0.3)] pointer-events-none" />

                  {/* Concentric Tech Dashed Ring */}
                  <div
                    className="absolute inset-2 rounded-full border border-dashed border-[#00CFFF]/45 pointer-events-none opacity-80"
                    style={{ animation: prefersReducedMotion ? undefined : 'spin 45s linear infinite' }}
                  />

                  {/* Metallic 3D Base Disc */}
                  <div className="absolute inset-4 rounded-full bg-gradient-to-b from-[#0F2648] via-[#08172C] to-[#030812] border-2 border-[#00CFFF]/65 shadow-[0_10px_25px_rgba(0,0,0,0.65),_inset_0_2px_4px_rgba(128,234,255,0.65)] flex items-center justify-center overflow-hidden">
                    {/* Top Specular Disc Arc */}
                    <div className="absolute top-0 inset-x-1 h-1/2 bg-gradient-to-b from-white/[0.15] to-transparent rounded-t-full pointer-events-none" />

                    {/* Stylized PHIVONEX Symbol */}
                    <div className="relative z-10 transform scale-90 sm:scale-110 drop-shadow-[0_0_16px_rgba(0,207,255,0.65)]">
                      <PhivonexSymbol size={52} glow={true} animated={!prefersReducedMotion} />
                    </div>
                  </div>

                  {/* Light Pedestal Floor Reflection */}
                  <div
                    className="absolute -bottom-2 inset-x-2 h-4 rounded-full pointer-events-none"
                    style={{
                      background: 'radial-gradient(ellipse at center, rgba(0, 207, 255, 0.5) 0%, rgba(0, 136, 255, 0.15) 50%, transparent 80%)',
                      filter: 'blur(5px)',
                    }}
                  />
                </div>
              </div>
            </div>

            {/* FRONT BOTTOM ROW: Flip Action Pill & Subtle Brand Mark */}
            <div className="relative z-10 flex items-center justify-between gap-2 pt-1 border-t border-white/[0.06]">
              {/* Flip Button */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleFlipToggle();
                }}
                className="flip-trigger group inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 rounded-xl bg-gradient-to-r from-[#00CFFF]/15 via-[#00CFFF]/10 to-[#0077FF]/15 hover:from-[#00CFFF]/25 hover:to-[#0077FF]/25 border border-[#00CFFF]/45 text-[#00CFFF] hover:text-white text-[10px] sm:text-xs font-semibold tracking-wide transition-all shadow-sm active:scale-95 cursor-pointer"
                aria-label="Flip to Network Card"
              >
                <RotateCw className="w-3 h-3 text-[#00CFFF] transition-transform duration-500 group-hover:rotate-180" />
                <span>Flip Card</span>
                <ArrowRight className="w-3 h-3 text-[#00CFFF] transition-transform duration-300 group-hover:translate-x-0.5" />
              </button>

              {/* Brand Line */}
              <div className="text-[8.5px] sm:text-[10px] font-mono tracking-[0.3em] text-[#00CFFF]/75 uppercase">
                P H I V O N E X
              </div>
            </div>
          </div>

          {/* ========================================================
              BACK FACE: VISA-STYLE PHIVONEX NETWORK CARD
              Absolute inset-0 (occupies exact same coordinates as Front)
             ======================================================== */}
          <div
            className="card-face card-back absolute inset-0 w-full h-full rounded-2xl sm:rounded-3xl p-3.5 sm:p-5 md:p-6 lg:p-7 overflow-hidden flex flex-col justify-between"
            style={{
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
              transform: 'rotateY(180deg)',
              background: 'linear-gradient(135deg, rgba(8, 19, 36, 0.98) 0%, rgba(5, 13, 26, 0.99) 55%, rgba(3, 7, 14, 0.99) 100%)',
              border: '1px solid rgba(0, 207, 255, 0.35)',
              boxShadow: isHovered
                ? '0 25px 50px -12px rgba(0, 0, 0, 0.85), 0 0 30px rgba(0, 207, 255, 0.2), inset 0 1px 1px rgba(255, 255, 255, 0.25), inset 0 0 20px rgba(0, 207, 255, 0.08)'
                : '0 20px 40px -15px rgba(0, 0, 0, 0.8), 0 0 20px rgba(0, 207, 255, 0.12), inset 0 1px 1px rgba(255, 255, 255, 0.2), inset 0 0 15px rgba(0, 207, 255, 0.05)',
            }}
          >
            {/* Top Specular Rim */}
            <div className="absolute top-0 inset-x-6 sm:inset-x-12 h-[1px] bg-gradient-to-r from-transparent via-[#80EAFF]/70 to-transparent pointer-events-none" />

            {/* Faint Wireframe Globe Watermark Motif on the Right */}
            <div className="absolute -right-6 -bottom-6 w-40 h-40 sm:w-56 sm:h-56 opacity-10 pointer-events-none text-[#00CFFF]">
              <Globe className="w-full h-full stroke-[1]" />
            </div>

            {/* BACK TOP ROW: Protocol Identity & Network Card Branding */}
            <div className="relative z-10 flex items-center justify-between border-b border-white/[0.08] pb-2 sm:pb-3">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-[#00CFFF]/10 border border-[#00CFFF]/30 flex items-center justify-center text-[#00CFFF]">
                  <ShieldCheck className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="text-[8px] sm:text-[9.5px] font-mono tracking-wider text-[#98A2B3] uppercase">
                    Protocol Identity
                  </div>
                  <div className="text-[10px] sm:text-xs font-bold text-white font-mono">
                    {publicId}
                  </div>
                </div>
              </div>

              {/* Right: PHIVONEX NETWORK CARD Branding */}
              <div className="text-right">
                <div className="text-[10px] sm:text-xs md:text-sm font-extrabold tracking-[0.25em] text-[#00CFFF] uppercase">
                  PHIVONEX
                </div>
                <div className="text-[8px] sm:text-[9.5px] font-mono text-[#98A2B3] tracking-widest uppercase">
                  NETWORK CARD
                </div>
              </div>
            </div>

            {/* BACK MIDDLE: 4 Compact Data Modules in 2x2 Grid */}
            <div className="relative z-10 grid grid-cols-2 gap-2 sm:gap-3 my-auto">
              {/* Module 1: Wallet Status */}
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  onNavigateTab?.('wallet');
                }}
                className="p-2 sm:p-3 rounded-xl bg-[#050B14]/85 border border-white/[0.08] hover:border-[#00CFFF]/40 transition-all cursor-pointer group"
              >
                <div className="flex items-center justify-between text-[#98A2B3] mb-0.5">
                  <div className="flex items-center gap-1.5 text-[8.5px] sm:text-[10px] font-medium">
                    <Wallet className="w-3 h-3 text-[#00CFFF]" />
                    <span>Wallet Status</span>
                  </div>
                  <span className="flex items-center gap-1 text-[7.5px] sm:text-[9px] text-[#32D583] font-medium">
                    <span className="w-1 h-1 rounded-full bg-[#32D583]" />
                    <span>Active</span>
                  </span>
                </div>
                <div className="text-[11px] sm:text-sm md:text-base font-bold font-mono text-white tabular-nums truncate">
                  ${formatCurrency(availableUsdt)}{' '}
                  <span className="text-[8.5px] sm:text-[10px] text-[#98A2B3] font-normal">USDT</span>
                </div>
              </div>

              {/* Module 2: Active Nodes */}
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  onNavigateTab?.('nodes');
                }}
                className="p-2 sm:p-3 rounded-xl bg-[#050B14]/85 border border-white/[0.08] hover:border-[#00CFFF]/40 transition-all cursor-pointer group"
              >
                <div className="flex items-center justify-between text-[#98A2B3] mb-0.5">
                  <div className="flex items-center gap-1.5 text-[8.5px] sm:text-[10px] font-medium">
                    <Server className="w-3 h-3 text-[#00CFFF]" />
                    <span>Active Nodes</span>
                  </div>
                  <span className="flex items-center gap-1 text-[7.5px] sm:text-[9px] text-[#00CFFF] font-medium">
                    <span className="w-1 h-1 rounded-full bg-[#00CFFF]" />
                    <span>{activeNodes > 0 ? 'Mining' : 'Ready'}</span>
                  </span>
                </div>
                <div className="text-[11px] sm:text-sm md:text-base font-bold font-mono text-white tabular-nums truncate">
                  {activeNodes}{' '}
                  <span className="text-[8.5px] sm:text-[10px] text-[#98A2B3] font-normal">Nodes</span>
                </div>
              </div>

              {/* Module 3: Current Rank */}
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  onNavigateTab?.('network');
                }}
                className="p-2 sm:p-3 rounded-xl bg-[#050B14]/85 border border-white/[0.08] hover:border-[#00CFFF]/40 transition-all cursor-pointer group"
              >
                <div className="flex items-center justify-between text-[#98A2B3] mb-0.5">
                  <div className="flex items-center gap-1.5 text-[8.5px] sm:text-[10px] font-medium">
                    <Trophy className="w-3 h-3 text-[#FFB020]" />
                    <span>Current Rank</span>
                  </div>
                  <span className="flex items-center gap-1 text-[7.5px] sm:text-[9px] text-[#FFB020] font-medium">
                    <span className="w-1 h-1 rounded-full bg-[#FFB020]" />
                    <span>Tier</span>
                  </span>
                </div>
                <div className="text-[10.5px] sm:text-xs md:text-sm font-bold text-white truncate" title={currentRankName}>
                  {currentRankName}
                </div>
              </div>

              {/* Module 4: Network Status */}
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  onNavigateTab?.('network');
                }}
                className="p-2 sm:p-3 rounded-xl bg-[#050B14]/85 border border-white/[0.08] hover:border-[#00CFFF]/40 transition-all cursor-pointer group"
              >
                <div className="flex items-center justify-between text-[#98A2B3] mb-0.5">
                  <div className="flex items-center gap-1.5 text-[8.5px] sm:text-[10px] font-medium">
                    <Users className="w-3 h-3 text-[#00CFFF]" />
                    <span>Network</span>
                  </div>
                  <span className="flex items-center gap-1 text-[7.5px] sm:text-[9px] text-[#32D583] font-medium">
                    <span className="w-1 h-1 rounded-full bg-[#32D583]" />
                    <span>Mesh</span>
                  </span>
                </div>
                <div className="text-[10.5px] sm:text-xs md:text-sm font-bold text-[#00CFFF] truncate">
                  {networkStatus}
                </div>
              </div>
            </div>

            {/* BACK BOTTOM ROW: Return Button & Brand Slogan */}
            <div className="relative z-10 flex items-center justify-between gap-2 pt-1 border-t border-white/[0.06]">
              {/* Return Button */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleFlipToggle();
                }}
                className="flip-trigger group inline-flex items-center gap-1.5 px-3 sm:px-4 py-1.5 rounded-xl bg-gradient-to-r from-[#00CFFF]/15 to-[#0077FF]/15 hover:from-[#00CFFF]/25 hover:to-[#0077FF]/25 border border-[#00CFFF]/45 text-[#00CFFF] hover:text-white text-[10px] sm:text-xs font-semibold tracking-wide transition-all shadow-sm active:scale-95 cursor-pointer"
                aria-label="Return to Overview"
              >
                <ArrowLeft className="w-3 h-3 text-[#00CFFF] transition-transform duration-300 group-hover:-translate-x-0.5" />
                <span>Return to Overview</span>
              </button>

              {/* Brand Slogan */}
              <div className="text-[8px] sm:text-[9.5px] font-mono tracking-[0.25em] text-[#98A2B3] uppercase">
                BUILD • CONNECT • EVOLVE
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Pagination Indicators matching reference image dots underneath */}
      <div className="flex items-center justify-center gap-2 pt-0.5">
        <button
          type="button"
          onClick={() => setIsFlipped(false)}
          aria-label="Show Front Overview Card"
          className={`transition-all duration-300 rounded-full cursor-pointer ${
            !isFlipped
              ? 'w-7 sm:w-8 h-1.5 bg-gradient-to-r from-[#00CFFF] to-[#0088FF] shadow-[0_0_8px_rgba(0,207,255,0.6)]'
              : 'w-1.5 h-1.5 bg-white/20 hover:bg-white/40'
          }`}
        />
        <button
          type="button"
          onClick={() => setIsFlipped(true)}
          aria-label="Show Back Network Card"
          className={`transition-all duration-300 rounded-full cursor-pointer ${
            isFlipped
              ? 'w-7 sm:w-8 h-1.5 bg-gradient-to-r from-[#00CFFF] to-[#0088FF] shadow-[0_0_8px_rgba(0,207,255,0.6)]'
              : 'w-1.5 h-1.5 bg-white/20 hover:bg-white/40'
          }`}
        />
      </div>
    </div>
  );
};
