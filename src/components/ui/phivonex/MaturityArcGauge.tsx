import React from 'react';

interface MaturityArcGaugeProps {
  value: number; // current value (e.g. distributed phivo)
  max?: number; // max value (e.g. 10000)
  size?: number;
  strokeWidth?: number;
  label?: string;
  className?: string;
}

export const MaturityArcGauge: React.FC<MaturityArcGaugeProps> = ({
  value,
  max = 10000,
  size = 120,
  strokeWidth = 10,
  label = 'Maturity Progress',
  className = '',
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(Math.max(value / max, 0), 1);
  const strokeDashoffset = circumference - progress * circumference;

  return (
    <div className={`relative flex flex-col items-center justify-center ${className}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Background Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="rgba(255, 255, 255, 0.08)"
          strokeWidth={strokeWidth}
          fill="transparent"
        />
        {/* Progress Arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="url(#arc-gradient)"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          fill="transparent"
          style={{ transition: 'stroke-dashoffset 0.6s ease-out' }}
        />
        <defs>
          <linearGradient id="arc-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#00E5FF" />
            <stop offset="100%" stopColor="#00E676" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-lg font-bold font-mono text-white phx-tabular-num">
          {(progress * 100).toFixed(1)}%
        </span>
        <span className="text-[10px] text-[#98A2B3] uppercase tracking-wider">{label}</span>
      </div>
    </div>
  );
};
