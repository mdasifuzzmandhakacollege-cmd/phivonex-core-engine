import React from 'react';

interface PhxGlassCardProps {
  children: React.ReactNode;
  accent?: 'gold' | 'cyan' | 'emerald' | 'neutral';
  className?: string;
  onClick?: () => void;
}

export const PhxGlassCard: React.FC<PhxGlassCardProps> = ({
  children,
  accent = 'neutral',
  className = '',
  onClick,
}) => {
  const getAccentClass = () => {
    switch (accent) {
      case 'gold':
        return 'phx-glass-card-gold hover:border-[#F5B800]/60';
      case 'cyan':
        return 'phx-glass-card-cyan hover:border-[#00E5FF]/60';
      case 'emerald':
        return 'bg-[#00E676]/4 border border-[#00E676]/30 hover:border-[#00E676]/60';
      case 'neutral':
      default:
        return 'phx-glass-card hover:border-white/20';
    }
  };

  return (
    <div
      onClick={onClick}
      className={`relative p-6 transition-all duration-300 ease-out will-change-transform ${getAccentClass()} ${
        onClick ? 'cursor-pointer hover:-translate-y-1' : ''
      } ${className}`}
    >
      {/* Specular top-edge highlight */}
      <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none" />
      {children}
    </div>
  );
};
