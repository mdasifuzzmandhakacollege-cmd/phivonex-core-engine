import React from 'react';
import { PhivonexSymbol } from './PhivonexSymbol';

interface CryptoIconProps {
  size?: number | string;
  className?: string;
}

/**
 * Official Tether (USDT) Brand Icon
 * Emerald green badge (#26A17B) with crisp white Tether monogram symbol.
 */
export const UsdtIcon: React.FC<CryptoIconProps> = ({ size = 24, className = '' }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 select-none ${className}`}
      aria-label="Tether USDT Logo"
    >
      <defs>
        <linearGradient id="usdt-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#26A17B" />
          <stop offset="100%" stopColor="#1E8263" />
        </linearGradient>
      </defs>
      {/* Outer Coin Disk */}
      <circle cx="100" cy="100" r="96" fill="url(#usdt-grad)" stroke="#3BE0AB" strokeWidth="4" />
      {/* Specular Inner Rim */}
      <circle cx="100" cy="100" r="90" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeOpacity="0.25" />
      {/* Official Tether '₮' Emblem */}
      <path
        d="M 62 60 L 138 60 L 138 78 L 109 78 L 109 90 C 132 91 150 96 150 102 C 150 108 132 113 109 114 L 109 148 L 91 148 L 91 114 C 68 113 50 108 50 102 C 50 96 68 91 91 90 L 91 78 L 62 78 Z"
        fill="#FFFFFF"
      />
      {/* Inner Cutout Hole */}
      <path
        d="M 100 96 C 122 96 134 100 134 102 C 134 104 122 108 100 108 C 78 108 66 104 66 102 C 66 100 78 96 100 96 Z"
        fill="url(#usdt-grad)"
      />
    </svg>
  );
};

/**
 * Official Binance BNB Brand Icon
 * Pure Binance gold (#F0B90B) with the authentic diamond geometry.
 */
export const BnbIcon: React.FC<CryptoIconProps> = ({ size = 24, className = '' }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 select-none ${className}`}
      aria-label="BNB Smart Chain Logo"
    >
      <defs>
        <linearGradient id="bnb-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#F3BA2F" />
          <stop offset="100%" stopColor="#E2A612" />
        </linearGradient>
      </defs>
      {/* Outer Coin Disk */}
      <circle cx="100" cy="100" r="96" fill="url(#bnb-grad)" stroke="#FFE885" strokeWidth="3" />
      {/* Inner Subtle Ring */}
      <circle cx="100" cy="100" r="90" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeOpacity="0.25" />
      {/* Dark Contrasting Center & Emblem Group */}
      <g fill="#181A20">
        {/* Center Diamond */}
        <polygon points="100,74 126,100 100,126 74,100" />
        {/* Top Diamond */}
        <polygon points="100,34 122,56 108,70 100,62 92,70 78,56" />
        {/* Bottom Diamond */}
        <polygon points="100,166 78,144 92,130 100,138 108,130 122,144" />
        {/* Left Diamond */}
        <polygon points="34,100 56,78 70,92 62,100 70,108 56,122" />
        {/* Right Diamond */}
        <polygon points="166,100 144,122 130,108 138,100 130,92 144,78" />
      </g>
    </svg>
  );
};

/**
 * Official PHIVO Coin Brand Icon
 * 3D crypto coin disc with neon-cyan / deep-sapphire gradient rim and PHIVONEX symbol.
 */
export const PhivoCoinIcon: React.FC<CryptoIconProps> = ({ size = 24, className = '' }) => {
  const numericSize = typeof size === 'number' ? size : 24;
  return (
    <div
      style={{ width: size, height: size }}
      className={`relative inline-flex items-center justify-center shrink-0 rounded-full bg-gradient-to-br from-[#00CFFF]/25 via-[#07101D] to-[#04060A] border border-[#00CFFF]/50 shadow-md shadow-[#00CFFF]/20 overflow-hidden ${className}`}
      title="PHIVO Protocol Coin"
    >
      <div className="absolute inset-0 bg-[#00CFFF]/10 rounded-full pointer-events-none" />
      <PhivonexSymbol size={Math.round(numericSize * 0.72)} glow={false} />
    </div>
  );
};
