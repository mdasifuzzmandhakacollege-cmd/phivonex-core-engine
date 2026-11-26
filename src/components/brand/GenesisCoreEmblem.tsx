import React from 'react';

interface GenesisCoreEmblemProps {
  status?: 'ACTIVE' | 'MATURED';
  size?: number;
  className?: string;
}

export const GenesisCoreEmblem: React.FC<GenesisCoreEmblemProps> = ({
  status = 'ACTIVE',
  size = 64,
  className = '',
}) => {
  const isMatured = status === 'MATURED';
  const accentColor = isMatured ? '#00E676' : '#00E5FF';

  return (
    <div 
      role="img" 
      aria-label={`PHIVONEX Genesis Core Emblem - ${status}`}
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
          <linearGradient id="gc-gold" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#F5B800" />
            <stop offset="100%" stopColor="#FFE082" />
          </linearGradient>
          <linearGradient id="gc-cyan" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={accentColor} />
            <stop offset="100%" stopColor="#168BFF" />
          </linearGradient>
        </defs>

        {/* Outer Gyroscopic Ring 1 */}
        <ellipse cx="50" cy="50" rx="42" ry="18" stroke="url(#gc-gold)" strokeWidth="2" transform="rotate(30 50 50)" opacity="0.8" />
        
        {/* Outer Gyroscopic Ring 2 */}
        <ellipse cx="50" cy="50" rx="42" ry="18" stroke="url(#gc-gold)" strokeWidth="2" transform="rotate(-30 50 50)" opacity="0.8" />

        {/* Central Obsidian Cube / Diamond */}
        <polygon points="50,18 82,36 82,72 50,90 18,72 18,36" fill="#050807" stroke="url(#gc-cyan)" strokeWidth="3" />

        {/* Inner Floating Crystal Core */}
        <polygon points="50,30 68,50 50,70 32,50" fill="url(#gc-cyan)" className="animate-pulse" />

        <circle cx="50" cy="50" r="6" fill="#FFFFFF" className="drop-shadow-[0_0_8px_#FFFFFF]" />
      </svg>
    </div>
  );
};
