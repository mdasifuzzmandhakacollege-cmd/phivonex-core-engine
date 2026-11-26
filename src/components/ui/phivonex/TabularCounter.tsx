import React from 'react';

interface TabularCounterProps {
  value: number | string;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  className?: string;
}

export const TabularCounter: React.FC<TabularCounterProps> = ({
  value,
  prefix = '',
  suffix = '',
  decimals = 2,
  className = '',
}) => {
  const numericValue = typeof value === 'number' ? value : parseFloat(value) || 0;
  const formatted = numericValue.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return (
    <span className={`phx-tabular-num font-mono tracking-tight ${className}`}>
      {prefix}{formatted}{suffix}
    </span>
  );
};
