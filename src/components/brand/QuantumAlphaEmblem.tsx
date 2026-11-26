import React from 'react';

interface QuantumAlphaEmblemProps {
  tier?: 'ALPHA_CORE' | 'ALPHA_PRIME' | 'ALPHA_SOVEREIGN';
  size?: number;
  className?: string;
}

export const QuantumAlphaEmblem: React.FC<QuantumAlphaEmblemProps> = ({
  tier = 'ALPHA_PRIME',
  size = 64,
  className = '',
}) => {
  const isSovereign = tier === 'ALPHA_SOVEREIGN';
  const isCore = tier === 'ALPHA_CORE';

  const primaryColor = isSovereign ? '#F5B800' : isCore ? '#00E5FF' : '#FFE082';
  const secondaryColor = isSovereign ? '#FFE082' : isCore ? '#168BFF' : '#00E5FF';
  const gradId = 'qa-grad-' + tier;
  const gradUrl = 'url(#' + gradId + ')';

  return (
    <div 
      role="img" 
      aria-label={`PHIVONEX Quantum Alpha Emblem - ${tier}`}
      className={`relative flex items-center justify-center shrink-0 ${className}`}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="drop-shadow-[0_0_15px_rgba(0,229,255,0.3)]"
      >
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={primaryColor} />
            <stop offset="100%" stopColor={secondaryColor} />
          </linearGradient>
          <radialGradient id="qa-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={primaryColor} stopOpacity="0.4" />
            <stop offset="100%" stopColor="#050807" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Background glow */}
        <circle cx="50" cy="50" r="45" fill="url(#qa-glow)" />

        {/* Outer Hexagon */}
        <path
          d="M50 8L88.85 30V74L50 96L11.15 74V30L50 8Z"
          fill="#0A1224"
          stroke={gradUrl}
          strokeWidth="3"
          strokeLinejoin="round"
        />

        {/* Inner Rotating/Dynamic Wave Rings */}
        <circle cx="50" cy="50" r="32" stroke={gradUrl} strokeWidth="1.5" strokeDasharray="4 4" opacity="0.6" className="animate-[spin_20s_linear_infinite]" />
        
        {/* Quantum Waveform Path */}
        <path
          d="M25 50C35 30 40 70 50 50C60 30 65 70 75 50"
          stroke={gradUrl}
          strokeWidth="3.5"
          strokeLinecap="round"
          className="drop-shadow-[0_0_8px_rgba(0,229,255,0.8)]"
        />

        {/* Central Phi Monogram */}
        <text
          x="50"
          y="58"
          fill="#FFFFFF"
          fontFamily="JetBrains Mono, monospace"
          fontSize="30"
          fontWeight="800"
          textAnchor="middle"
          className="drop-shadow-[0_0_10px_rgba(255,255,255,0.6)]"
        >
          Φ
        </text>
      </svg>
    </div>
  );
};
