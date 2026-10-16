import React from 'react';
import { PhivonexSymbol } from './PhivonexSymbol';

export interface PhivonexAppIconProps {
  size?: number;
  className?: string;
  glow?: boolean;
}

export const PhivonexAppIcon: React.FC<PhivonexAppIconProps> = ({
  size = 48,
  className = '',
  glow = true,
}) => {
  const symbolSize = Math.round(size * 0.65);
  const borderRadius = Math.round(size * 0.26);

  return (
    <div
      className={`relative inline-flex items-center justify-center bg-gradient-to-b from-[#0E1E38] via-[#07101D] to-[#04060A] border border-[#00CFFF]/45 select-none shrink-0 transition-all duration-300 ${glow ? 'shadow-lg shadow-[#00CFFF]/20' : ''} ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: `${borderRadius}px`,
      }}
      aria-label="PHIVONEX App Icon"
    >
      {/* Corner Ambient Glow */}
      <div
        className="absolute inset-0 bg-[#00CFFF]/[0.08] pointer-events-none"
        style={{ borderRadius: `${borderRadius}px` }}
      />
      {/* Top Rim Specular */}
      <div
        className="absolute top-0 inset-x-2 h-[1px] bg-gradient-to-r from-transparent via-[#80EAFF]/60 to-transparent pointer-events-none"
      />
      <PhivonexSymbol size={symbolSize} glow={glow} />
    </div>
  );
};
