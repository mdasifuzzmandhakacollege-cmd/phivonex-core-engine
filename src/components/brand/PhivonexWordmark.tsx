import React from 'react';

export interface PhivonexWordmarkProps {
  height?: number | string;
  className?: string;
  theme?: 'dark' | 'light' | 'monochrome';
}

export const PhivonexWordmark: React.FC<PhivonexWordmarkProps> = ({
  height = 24,
  className = '',
  theme = 'dark',
}) => {
  const uid = React.useId().replace(/:/g, '');
  const isLight = theme === 'light';
  const isMonochrome = theme === 'monochrome';

  return (
    <svg
      height={height}
      viewBox="0 0 630 102"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`select-none shrink-0 ${className}`}
      aria-label="PHIVONEX"
    >
      <defs>
        {/* Silver Metallic Gradient for Dark Theme */}
        <linearGradient id={`silverType-${uid}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="45%" stopColor="#EDF2F7" />
          <stop offset="70%" stopColor="#CBD5E1" />
          <stop offset="100%" stopColor="#94A3B8" />
        </linearGradient>

        {/* Deep Slate / Navy Gradient for Light Theme */}
        <linearGradient id={`navyType-${uid}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#07101D" />
          <stop offset="100%" stopColor="#0F1E36" />
        </linearGradient>

        {/* Vibrant Cyan Gradient for 'O' Beacon */}
        <linearGradient id={`cyanBeacon-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#80EAFF" />
          <stop offset="40%" stopColor="#00CFFF" />
          <stop offset="100%" stopColor="#168BFF" />
        </linearGradient>

        {/* Glow for 'O' Beacon in Dark Theme */}
        <filter id={`beaconGlow-${uid}`} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Letter P */}
      <path
        d="M 0 102 L 0 0 L 38 0 C 56 0 68 8 68 28 C 68 46 56 54 38 54 L 18 54 L 18 102 L 0 102 Z M 18 38 L 36 38 C 45 38 50 34 50 27 C 50 20 45 16 36 16 L 18 16 L 18 38 Z"
        fill={isMonochrome ? '#FFFFFF' : isLight ? `url(#navyType-${uid})` : `url(#silverType-${uid})`}
      />

      {/* Letter H */}
      <path
        d="M 84 102 L 84 0 L 102 0 L 102 42 L 138 42 L 138 0 L 156 0 L 156 102 L 138 102 L 138 58 L 102 58 L 102 102 L 84 102 Z"
        fill={isMonochrome ? '#FFFFFF' : isLight ? `url(#navyType-${uid})` : `url(#silverType-${uid})`}
      />

      {/* Letter I */}
      <path
        d="M 174 102 L 174 0 L 192 0 L 192 102 L 174 102 Z"
        fill={isMonochrome ? '#FFFFFF' : isLight ? `url(#navyType-${uid})` : `url(#silverType-${uid})`}
      />

      {/* Letter V */}
      <path
        d="M 208 0 L 227 0 L 246 72 L 265 0 L 284 0 L 256 102 L 236 102 L 208 0 Z"
        fill={isMonochrome ? '#FFFFFF' : isLight ? `url(#navyType-${uid})` : `url(#silverType-${uid})`}
      />

      {/* Letter O (Beacon Key) */}
      <g transform="translate(300, 0)">
        {!isMonochrome && !isLight && (
          <rect
            x="-4"
            y="-4"
            width="76"
            height="110"
            rx="14"
            fill="#00CFFF"
            fillOpacity="0.16"
            filter={`url(#beaconGlow-${uid})`}
          />
        )}
        <path
          d="M 12 0 L 56 0 C 64 0 68 6 68 14 L 68 88 C 68 96 64 102 56 102 L 12 102 C 4 102 0 96 0 88 L 0 14 C 0 6 4 0 12 0 Z M 18 86 L 50 86 C 52 86 54 84 54 82 L 54 20 C 54 18 52 16 50 16 L 18 16 C 16 16 14 18 14 20 L 14 82 C 14 84 16 86 18 86 Z"
          fill={isMonochrome ? '#FFFFFF' : `url(#cyanBeacon-${uid})`}
        />
        <rect
          x="24"
          y="24"
          width="20"
          height="54"
          rx="4"
          fill={isMonochrome ? 'rgba(255,255,255,0.4)' : '#00CFFF'}
          fillOpacity={isLight ? 0.25 : 0.4}
        />
        {!isMonochrome && (
          <rect
            x="29"
            y="30"
            width="10"
            height="42"
            rx="2"
            fill="#80EAFF"
            fillOpacity={isLight ? 0.6 : 0.85}
          />
        )}
      </g>

      {/* Letter N */}
      <g transform="translate(386, 0)">
        <path
          d="M 0 102 L 0 0 L 18 0 L 52 64 L 52 0 L 70 0 L 70 102 L 52 102 L 18 38 L 18 102 L 0 102 Z"
          fill={isMonochrome ? '#FFFFFF' : isLight ? `url(#navyType-${uid})` : `url(#silverType-${uid})`}
        />
      </g>

      {/* Letter E */}
      <g transform="translate(472, 0)">
        <path
          d="M 0 102 L 0 0 L 60 0 L 60 16 L 18 16 L 18 42 L 54 42 L 54 58 L 18 58 L 18 86 L 62 86 L 62 102 L 0 102 Z"
          fill={isMonochrome ? '#FFFFFF' : isLight ? `url(#navyType-${uid})` : `url(#silverType-${uid})`}
        />
      </g>

      {/* Letter X */}
      <g transform="translate(550, 0)">
        <path
          d="M 0 0 L 22 0 L 40 46 L 58 0 L 80 0 L 52 50 L 82 102 L 60 102 L 40 56 L 20 102 L 0 102 L 28 50 L 0 0 Z"
          fill={isMonochrome ? '#FFFFFF' : isLight ? `url(#navyType-${uid})` : `url(#silverType-${uid})`}
        />
      </g>
    </svg>
  );
};
