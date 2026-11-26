import React from 'react';

interface ChronoVaultEmblemProps {
  planCode?: 'CHRONO_200D' | 'CHRONO_1Y' | 'CHRONO_2Y' | 'CHRONO_5Y' | 'CHRONO_10Y';
  size?: number;
  className?: string;
}

export const ChronoVaultEmblem: React.FC<ChronoVaultEmblemProps> = ({
  planCode = 'CHRONO_5Y',
  size = 64,
  className = '',
}) => {
  const getVaultConfig = () => {
    switch (planCode) {
      case 'CHRONO_200D':
        return { name: 'Bronze Vault', color1: '#CD7F32', color2: '#E6A15C', rings: 1 };
      case 'CHRONO_1Y':
        return { name: 'Silver Vault', color1: '#C0C0C0', color2: '#E8E8E8', rings: 2 };
      case 'CHRONO_2Y':
        return { name: 'Cyan Vault', color1: '#00E5FF', color2: '#168BFF', rings: 3 };
      case 'CHRONO_5Y':
        return { name: 'Gold Vault', color1: '#F5B800', color2: '#FFE082', rings: 3 };
      case 'CHRONO_10Y':
      default:
        return { name: 'Sovereign Vault', color1: '#7057FF', color2: '#00E5FF', rings: 4 };
    }
  };

  const config = getVaultConfig();

  return (
    <div 
      role="img" 
      aria-label={`PHIVONEX Chrono Vault Emblem - ${config.name}`}
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
          <linearGradient id={`cv-grad-${planCode}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={config.color1} />
            <stop offset="100%" stopColor={config.color2} />
          </linearGradient>
        </defs>

        {/* Outer Vault Ring */}
        <circle cx="50" cy="50" r="44" stroke={`url(#cv-grad-${planCode})`} strokeWidth="3" strokeDasharray="8 4" opacity="0.8" />
        {config.rings >= 2 && (
          <circle cx="50" cy="50" r="34" stroke={`url(#cv-grad-${planCode})`} strokeWidth="2" opacity="0.6" />
        )}
        {config.rings >= 3 && (
          <circle cx="50" cy="50" r="24" stroke={`url(#cv-grad-${planCode})`} strokeWidth="1.5" strokeDasharray="2 2" opacity="0.7" />
        )}

        {/* Central Hex Lock / Clock Face */}
        <path
          d="M50 20L75 35V65L50 80L25 65V35L50 20Z"
          fill="#050807"
          stroke={`url(#cv-grad-${planCode})`}
          strokeWidth="3"
        />

        {/* Clock hands / Time crystal */}
        <line x1="50" y1="50" x2="50" y2="35" stroke={config.color1} strokeWidth="3" strokeLinecap="round" />
        <line x1="50" y1="50" x2="62" y2="54" stroke={config.color2} strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="50" cy="50" r="4" fill={config.color1} />
      </svg>
    </div>
  );
};
