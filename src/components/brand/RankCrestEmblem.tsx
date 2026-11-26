import React from 'react';

interface RankCrestEmblemProps {
  rank: number; // 0 to 6
  size?: number;
  className?: string;
}

export const RankCrestEmblem: React.FC<RankCrestEmblemProps> = ({
  rank = 0,
  size = 64,
  className = '',
}) => {
  const getRankStyle = (r: number) => {
    switch (r) {
      case 1:
        return { name: 'Quantum Architect', primary: '#00E5FF', secondary: '#168BFF', shape: 'polygon(50% 5%, 95% 25%, 95% 75%, 50% 95%, 5% 75%, 5% 25%)' };
      case 2:
        return { name: 'Apex Strategist', primary: '#00E676', secondary: '#00E5FF', shape: 'polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)' };
      case 3:
        return { name: 'Vanguard Commander', primary: '#F5B800', secondary: '#FF8A00', shape: 'polygon(50% 10%, 90% 30%, 90% 90%, 50% 100%, 10% 90%, 10% 30%)' };
      case 4:
        return { name: 'Sovereign Marshal', primary: '#F5B800', secondary: '#FFE082', shape: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)' };
      case 5:
        return { name: 'Global Ambassador', primary: '#7057FF', secondary: '#F5B800', shape: 'circle' };
      case 6:
        return { name: 'Titan Apex Sovereign', primary: '#FFFFFF', secondary: '#F5B800', shape: 'polygon(50% 0%, 85% 15%, 100% 50%, 85% 85%, 50% 100%, 15% 85%, 0% 50%, 15% 15%)' };
      case 0:
      default:
        return { name: 'Initiate Member', primary: '#98A2B3', secondary: '#475569', shape: 'polygon(50% 15%, 85% 35%, 85% 75%, 50% 85%, 15% 75%, 15% 35%)' };
    }
  };

  const st = getRankStyle(rank);

  return (
    <div 
      role="img" 
      aria-label={`PHIVONEX Rank Crest - Rank ${rank}: ${st.name}`}
      className={`relative flex items-center justify-center shrink-0 ${className}`}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id={`rank-grad-${rank}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={st.primary} />
            <stop offset="100%" stopColor={st.secondary} />
          </linearGradient>
        </defs>

        {/* Outer Shield / Halo */}
        <circle cx="50" cy="50" r="45" stroke={`url(#rank-grad-${rank})`} strokeWidth="2" strokeDasharray="6 3" opacity="0.6" className="animate-[spin_30s_linear_infinite]" />

        {/* Crest Base */}
        <path
          d="M50 10L85 30V70L50 90L15 70V30L50 10Z"
          fill="#07101D"
          stroke={`url(#rank-grad-${rank})`}
          strokeWidth="3.5"
          strokeLinejoin="round"
        />

        {/* Inner Star / Chevron count based on rank */}
        {rank > 0 && (
          <polygon
            points="50,28 62,55 85,55 66,70 73,92 50,78 27,92 34,70 15,55 38,55"
            fill={`url(#rank-grad-${rank})`}
            opacity="0.3"
          />
        )}

        {/* Rank Number / Symbol */}
        <text
          x="50"
          y="58"
          fill="#FFFFFF"
          fontFamily="JetBrains Mono, monospace"
          fontSize="26"
          fontWeight="800"
          textAnchor="middle"
          className="drop-shadow-[0_0_8px_rgba(255,255,255,0.7)]"
        >
          {rank === 0 ? 'Φ' : `R${rank}`}
        </text>
      </svg>
    </div>
  );
};
