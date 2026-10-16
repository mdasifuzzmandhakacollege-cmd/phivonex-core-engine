import React from 'react';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';

export type PhivoCoinState =
  | 'dormant'
  | 'charging'
  | 'generated'
  | 'in-transit'
  | 'validated'
  | 'credited'
  | 'DORMANT'
  | 'CHARGING'
  | 'GENERATED'
  | 'IN_TRANSIT'
  | 'VALIDATED'
  | 'CREDITED';

export interface PhivoCoinProps {
  state?: PhivoCoinState;
  size?: number | string;
  className?: string;
  showBadge?: boolean;
  badgeText?: string;
  animated?: boolean;
  glow?: boolean;
  glowColor?: 'cyan' | 'gold' | 'green';
}

export const PhivoCoin: React.FC<PhivoCoinProps> = ({
  state = 'generated',
  size = 64,
  className = '',
  showBadge = false,
  badgeText = 'PHIVO',
  animated = true,
  glow = true,
  glowColor = 'cyan',
}) => {
  const normalizedState = typeof state === 'string' ? state.toLowerCase() : 'generated';

  const isDormant = normalizedState === 'dormant';
  const isCharging = normalizedState === 'charging';
  const isGenerated = normalizedState === 'generated';
  const isInTransit = normalizedState === 'in-transit';
  const isValidated = normalizedState === 'validated';
  const isCredited = normalizedState === 'credited';

  const glowShadows = {
    cyan: 'shadow-[0_0_40px_rgba(0,207,255,0.7)] border-[#00CFFF]/60',
    gold: 'shadow-[0_0_40px_rgba(255,184,0,0.7)] border-[#FFB800]/60',
    green: 'shadow-[0_0_40px_rgba(50,213,131,0.7)] border-[#32D583]/60',
  };

  return (
    <div
      className={`relative rounded-full inline-flex items-center justify-center select-none ${
        glow ? glowShadows[glowColor] : ''
      } ${className}`}
      style={{ width: size, height: size, perspective: 1000 }}
    >
      {/* State-based Ambient Glow Auras */}
      {(isCharging || animated) && !isDormant && (
        <div className="absolute inset-0 rounded-full bg-[#00CFFF]/30 blur-md animate-pulse pointer-events-none" />
      )}
      {(isGenerated || isCredited) && (
        <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-[#00CFFF]/40 via-[#FFD700]/30 to-[#00CFFF]/40 blur-md pointer-events-none" />
      )}
      {isValidated && (
        <div className="absolute inset-0 rounded-full bg-[#32D583]/40 blur-md animate-ping pointer-events-none" />
      )}

      {/* Main Token Container with Smooth Transitions */}
      <motion.div
        className="relative w-full h-full rounded-full flex items-center justify-center shadow-2xl transition-all duration-500 ease-out"
        animate={
          isCharging
            ? { scale: [1, 1.06, 1], rotate: [0, 3, -3, 0] }
            : isInTransit
            ? { rotate: [0, 25, 15], y: [-2, 2, -2] }
            : isValidated
            ? { scale: [1, 1.08, 1] }
            : isCredited
            ? { scale: [1.1, 0.95, 1] }
            : animated && !isDormant
            ? { y: [-2, 2, -2], rotateY: [-6, 6, -6], rotateX: [3, -3, 3] }
            : { scale: 1, rotate: 0 }
        }
        transition={
          isInTransit || (animated && !isDormant)
            ? { repeat: Infinity, duration: 4, ease: 'easeInOut' }
            : { duration: 0.5, ease: 'easeOut' }
        }
      >
        <svg
          viewBox="0 0 200 200"
          className="w-full h-full drop-shadow-xl"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="coinGoldRim" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={isDormant ? '#7A7A7A' : '#FFF4B8'} />
              <stop offset="25%" stopColor={isDormant ? '#4A4A4A' : '#E5A900'} />
              <stop offset="50%" stopColor={isDormant ? '#2A2A2A' : '#8C6200'} />
              <stop offset="75%" stopColor={isDormant ? '#5A5A5A' : '#FFD343'} />
              <stop offset="100%" stopColor={isDormant ? '#1A1A1A' : '#593D00'} />
            </linearGradient>

            <radialGradient id="coinDisc" cx="50%" cy="50%" r="52%">
              <stop offset="0%" stopColor={isDormant ? '#060B14' : '#0B1C38'} />
              <stop offset="65%" stopColor="#040D1F" />
              <stop offset="100%" stopColor="#01050D" />
            </radialGradient>

            <linearGradient id="coinCyanP" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={isDormant ? '#557788' : '#E0F7FF'} />
              <stop offset="35%" stopColor={isDormant ? '#224455' : '#00CFFF'} />
              <stop offset="70%" stopColor={isDormant ? '#112233' : '#0077FF'} />
              <stop offset="100%" stopColor="#001122" />
            </linearGradient>

            <linearGradient id="coinGoldSpine" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={isDormant ? '#555555' : '#FFE066'} />
              <stop offset="50%" stopColor={isDormant ? '#333333' : '#D49B00'} />
              <stop offset="100%" stopColor={isDormant ? '#111111' : '#6E4C00'} />
            </linearGradient>

            <filter id="coinGlow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation={isDormant ? 1 : 4} result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Outer Rim */}
          <circle cx="100" cy="100" r="96" fill="url(#coinGoldRim)" stroke={isDormant ? '#333' : '#FFF6C2'} strokeWidth="2" />
          <circle cx="100" cy="100" r="91" fill="#0A1424" stroke="#222" strokeWidth="2" />

          {/* Rim Cyan Markers */}
          <rect x="96" y="5" width="8" height="12" rx="2" fill={isDormant ? '#113344' : '#00CFFF'} filter="url(#coinGlow)" />
          <rect x="183" y="96" width="12" height="8" rx="2" fill={isDormant ? '#113344' : '#00CFFF'} filter="url(#coinGlow)" />
          <rect x="96" y="183" width="8" height="12" rx="2" fill={isDormant ? '#113344' : '#00CFFF'} filter="url(#coinGlow)" />
          <rect x="5" y="96" width="12" height="8" rx="2" fill={isDormant ? '#113344' : '#00CFFF'} filter="url(#coinGlow)" />

          {/* Inner Track */}
          <circle cx="100" cy="100" r="82" fill="none" stroke={isDormant ? '#112233' : '#00CFFF'} strokeWidth="2.5" filter="url(#coinGlow)" opacity={isDormant ? 0.3 : 0.9} />
          <circle cx="100" cy="100" r="77" fill="url(#coinDisc)" stroke="#003366" strokeWidth="1" />

          {/* Stylized P Emblem */}
          <path
            d="M60 46 L124 46 C144 46 156 57 156 75 C156 93 144 103 124 103 L94 103 L94 154 L60 154 Z M94 70 L120 70 C128 70 133 73 133 79 C133 85 128 88 120 88 L94 88 Z"
            fill="url(#coinCyanP)"
            stroke={isDormant ? '#335566' : '#E0F7FF'}
            strokeWidth="1.5"
          />

          {/* Gold Mechanical Spine */}
          <path
            d="M60 46 L76 46 L76 154 L60 154 Z"
            fill="url(#coinGoldSpine)"
            stroke={isDormant ? '#444' : '#FFF2A1'}
            strokeWidth="1"
          />

          {/* Circuit Connector & Node */}
          <path d="M76 86 L112 86" stroke="url(#coinGoldSpine)" strokeWidth="4" strokeLinecap="round" />
          <circle cx="112" cy="86" r="9" fill={isDormant ? '#113344' : '#00CFFF'} filter="url(#coinGlow)" />
          <circle cx="112" cy="86" r="4.5" fill="#FFFFFF" />
        </svg>

        {isValidated && (
          <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-[#32D583] text-slate-950 flex items-center justify-center shadow-lg border border-white">
            <Check className="w-3.5 h-3.5 stroke-[3]" />
          </div>
        )}
      </motion.div>

      {showBadge && (
        <motion.div
          className="absolute -bottom-6 px-2 py-0.5 rounded-full bg-[#00CFFF] text-slate-950 text-[10px] font-mono font-bold shadow-lg whitespace-nowrap z-30"
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -5 }}
        >
          {badgeText}
        </motion.div>
      )}
    </div>
  );
};
