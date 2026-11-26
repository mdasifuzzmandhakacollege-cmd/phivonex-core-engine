import React from 'react';
import { TabularCounter } from './TabularCounter';

interface OdometerYieldProps {
  rate: number;
  label?: string;
  className?: string;
}

export const OdometerYield: React.FC<OdometerYieldProps> = ({
  rate,
  label = 'Daily Yield Rate',
  className = '',
}) => {
  return (
    <div className={`flex flex-col items-start ${className}`}>
      <span className="text-xs text-[#98A2B3] uppercase tracking-wider font-medium mb-1">{label}</span>
      <div className="flex items-baseline gap-1">
        <TabularCounter value={rate} decimals={2} suffix="%" className="text-2xl font-bold text-[#00E5FF]" />
        <span className="text-xs text-emerald-400 font-medium">↑ Live</span>
      </div>
    </div>
  );
};
