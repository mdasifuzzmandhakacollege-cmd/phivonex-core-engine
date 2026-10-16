import React from 'react';
import { PhivonexSymbol } from './PhivonexSymbol';
import { PhivonexWordmark } from './PhivonexWordmark';

export interface PhivonexLogoProps {
  variant?: 'horizontal' | 'stacked' | 'symbol-only' | 'app-icon';
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'hero';
  theme?: 'dark' | 'light' | 'monochrome';
  className?: string;
  withClearSpace?: boolean;
  animated?: boolean;
}

export const PhivonexLogo: React.FC<PhivonexLogoProps> = ({
  variant = 'horizontal',
  size = 'md',
  theme = 'dark',
  className = '',
  withClearSpace = false,
  animated = true,
}) => {
  // Size metrics
  const sizeMap = {
    sm: { symbol: 26, wordmarkHeight: 14, gap: 'gap-2.5', padding: 'p-1.5' },
    md: { symbol: 36, wordmarkHeight: 18, gap: 'gap-3', padding: 'p-2' },
    lg: { symbol: 44, wordmarkHeight: 22, gap: 'gap-3.5', padding: 'p-2.5' },
    xl: { symbol: 56, wordmarkHeight: 28, gap: 'gap-4', padding: 'p-3' },
    hero: { symbol: 88, wordmarkHeight: 42, gap: 'gap-5', padding: 'p-4' },
  };

  const currentSize = sizeMap[size] || sizeMap.md;

  if (variant === 'symbol-only') {
    return (
      <div className={`inline-flex items-center justify-center ${withClearSpace ? currentSize.padding : ''} ${className}`}>
        <PhivonexSymbol
          size={currentSize.symbol}
          variant={theme === 'light' ? 'light' : theme === 'monochrome' ? 'white' : 'color'}
          animated={animated}
        />
      </div>
    );
  }

  if (variant === 'app-icon') {
    const iconSizes = {
      sm: { box: 'w-8 h-8 rounded-lg', symbol: 20 },
      md: { box: 'w-11 h-11 rounded-xl', symbol: 28 },
      lg: { box: 'w-14 h-14 rounded-2xl', symbol: 36 },
      xl: { box: 'w-20 h-20 rounded-3xl', symbol: 52 },
      hero: { box: 'w-28 h-28 rounded-3xl', symbol: 72 },
    };
    const s = iconSizes[size] || iconSizes.md;

    return (
      <div
        className={`relative inline-flex items-center justify-center bg-gradient-to-br from-[#0E1E38] via-[#07101D] to-[#04060A] border border-[#00CFFF]/40 shadow-lg shadow-[#00CFFF]/15 overflow-hidden group select-none ${s.box} ${className}`}
      >
        <div className="absolute inset-0 bg-[#00CFFF]/[0.06] rounded-[inherit] pointer-events-none" />
        <PhivonexSymbol
          size={s.symbol}
          variant={theme === 'light' ? 'light' : theme === 'monochrome' ? 'white' : 'color'}
          animated={animated}
        />
      </div>
    );
  }

  if (variant === 'stacked') {
    return (
      <div
        className={`inline-flex flex-col items-center justify-center text-center ${currentSize.gap} ${withClearSpace ? currentSize.padding : ''} ${className}`}
      >
        <PhivonexSymbol
          size={currentSize.symbol * 1.3}
          variant={theme === 'light' ? 'light' : theme === 'monochrome' ? 'white' : 'color'}
          animated={animated}
        />
        <PhivonexWordmark
          height={currentSize.wordmarkHeight}
          theme={theme}
        />
      </div>
    );
  }

  // Default: Horizontal Lockup (Symbol + Wordmark)
  return (
    <div
      className={`inline-flex items-center ${currentSize.gap} ${withClearSpace ? currentSize.padding : ''} group ${className}`}
    >
      <PhivonexSymbol
        size={currentSize.symbol}
        variant={theme === 'light' ? 'light' : theme === 'monochrome' ? 'white' : 'color'}
        animated={animated}
      />
      <PhivonexWordmark
        height={currentSize.wordmarkHeight}
        theme={theme}
      />
    </div>
  );
};
