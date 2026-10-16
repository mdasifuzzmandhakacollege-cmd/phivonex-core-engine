import React from 'react';

export interface PhivonexSymbolProps {
  size?: number | string;
  className?: string;
  variant?: 'color' | 'white' | 'light';
  animated?: boolean;
  glow?: boolean;
}

export const PhivonexSymbol: React.FC<PhivonexSymbolProps> = ({
  size = 36,
  className = '',
  variant = 'color',
  animated = true,
  glow = true,
}) => {
  const isWhite = variant === 'white';
  const isLight = variant === 'light';

  const uid = React.useId().replace(/:/g, '');

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 select-none ${className}`}
      aria-label="PHIVONEX Network App Logo"
    >
      <defs>
        {/* Outer Neon Aura */}
        <radialGradient id={`aura-${uid}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#00CFFF" stopOpacity={glow ? 0.45 : 0} />
          <stop offset="60%" stopColor="#0088FF" stopOpacity={glow ? 0.2 : 0} />
          <stop offset="100%" stopColor="#0044AA" stopOpacity="0" />
        </radialGradient>

        {/* Squircle Tile Background Gradient */}
        <linearGradient id={`tileBg-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#0B1C38" />
          <stop offset="40%" stopColor="#060E1E" />
          <stop offset="100%" stopColor="#02050B" />
        </linearGradient>

        {/* Squircle Border Gradient */}
        <linearGradient id={`borderGrad-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#80EAFF" />
          <stop offset="30%" stopColor="#00CFFF" />
          <stop offset="70%" stopColor="#0066FF" />
          <stop offset="100%" stopColor="#00CFFF" />
        </linearGradient>

        {/* Outer Arch "P" Ribbon Gradient */}
        <linearGradient id={`outerArch-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={isLight ? '#00CFFF' : '#80EAFF'} />
          <stop offset="35%" stopColor="#00CFFF" />
          <stop offset="70%" stopColor="#0088FF" />
          <stop offset="100%" stopColor="#0044CC" />
        </linearGradient>

        {/* Stem Gradient */}
        <linearGradient id={`stemGrad-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#00CFFF" />
          <stop offset="50%" stopColor="#0077FF" />
          <stop offset="100%" stopColor="#003399" />
        </linearGradient>

        {/* Inner Chevron Arrow Gradient */}
        <linearGradient id={`chevronGrad-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#B3F4FF" />
          <stop offset="50%" stopColor="#00CFFF" />
          <stop offset="100%" stopColor="#0088FF" />
        </linearGradient>

        {/* Inner Fold Shadow Gradient */}
        <linearGradient id={`foldShadow-${uid}`} x1="100%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#002b66" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#001133" stopOpacity="0.4" />
        </linearGradient>

        {/* Specular Glow Filter */}
        <filter id={`neonGlow-${uid}`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="8" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* 1. Ambient Glow Halo */}
      {!isWhite && (
        <rect
          x="16"
          y="16"
          width="480"
          height="480"
          rx="108"
          fill={`url(#aura-${uid})`}
        />
      )}

      {/* 2. Glassmorphic Squircle Frame Base */}
      <rect
        x="32"
        y="32"
        width="448"
        height="448"
        rx="96"
        fill={`url(#tileBg-${uid})`}
        stroke={`url(#borderGrad-${uid})`}
        strokeWidth="6"
        filter={glow && !isWhite ? `url(#neonGlow-${uid})` : undefined}
      />

      {/* Top Inner Specular Rim */}
      <path
        d="M 64 68 C 160 40, 352 40, 448 68"
        stroke="#80EAFF"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.6"
      />

      {/* 3. Main Stylized 3D "P" Logo Group */}
      <g transform="translate(15, 12)">
        {/* Shadow / Base Layer for 3D Depth */}
        <path
          d="M 130 400 L 130 280 L 188 220 L 250 220 C 350 220, 410 170, 410 115 C 410 60, 340 10, 240 10 L 130 10 L 130 400 Z"
          fill="none"
        />

        {/* STEM (Left Vertical / Diagonal Pillar of P) */}
        <path
          d="M 130 100 L 190 100 L 190 320 L 130 400 L 130 100 Z"
          fill={isWhite ? '#FFFFFF' : `url(#stemGrad-${uid})`}
        />
        {/* Stem Bevel Shadow */}
        <path
          d="M 130 400 L 190 320 L 190 230 L 130 230 Z"
          fill={isWhite ? 'rgba(255,255,255,0.7)' : 'url(#foldShadow-' + uid + ')'}
        />

        {/* OUTER "P" ARCH LOOP */}
        <path
          d="M 190 100 L 250 100 C 330 100, 390 140, 390 200 C 390 260, 320 300, 240 300 L 190 300 L 250 240 C 290 240, 330 220, 330 190 C 330 160, 290 145, 240 145 L 190 145 Z"
          fill={isWhite ? '#FFFFFF' : `url(#outerArch-${uid})`}
        />

        {/* INNER CHEVRON ARROW (Middle Glowing Arrow Layer '>') */}
        <path
          d="M 210 145 L 290 200 L 210 255 L 250 255 L 330 200 L 250 145 Z"
          fill={isWhite ? '#FFFFFF' : `url(#chevronGrad-${uid})`}
          className={animated ? 'animate-pulse' : ''}
          style={{ animationDuration: '3s' }}
        />

        {/* LOWER RETURN FOLD RIBBON */}
        <path
          d="M 190 300 L 240 300 C 300 300, 340 270, 360 235 L 315 210 C 295 230, 260 245, 220 245 L 190 245 Z"
          fill={isWhite ? 'rgba(255,255,255,0.85)' : `url(#outerArch-${uid})`}
          opacity="0.9"
        />

        {/* SPECULAR HIGHLIGHT BRIGHT LINES */}
        <path
          d="M 130 100 L 190 100 L 250 100 C 330 100, 390 140, 390 200"
          stroke="#FFFFFF"
          strokeWidth="4"
          strokeLinecap="round"
          opacity="0.8"
        />
        <path
          d="M 210 145 L 290 200 L 210 255"
          stroke="#FFFFFF"
          strokeWidth="3"
          strokeLinecap="round"
          opacity="0.95"
        />
        <path
          d="M 130 100 L 130 400"
          stroke="#80EAFF"
          strokeWidth="3"
          strokeLinecap="round"
          opacity="0.75"
        />
      </g>
    </svg>
  );
};
