import React from 'react';

interface LegData {
  legIndex?: number;
  legName?: string;
  rawVolumeUsd: number;
  cappedVolumeUsd: number;
  isCapped: boolean;
}

interface LegCapRadialGaugeProps {
  legs: LegData[];
  size?: number;
  className?: string;
}

export const LegCapRadialGauge: React.FC<LegCapRadialGaugeProps> = ({
  legs = [],
  size = 200,
  className = '',
}) => {
  const center = size / 2;
  const radius = size * 0.38;
  const strokeWidth = size * 0.12;

  // Calculate total raw vs capped volume
  const totalRaw = legs.reduce((acc, l) => acc + (l.rawVolumeUsd || 0), 0);
  const totalCapped = legs.reduce((acc, l) => acc + (l.cappedVolumeUsd || 0), 0);
  const capEfficiency = totalRaw > 0 ? (totalCapped / totalRaw) * 100 : 100;

  // Colors for up to 5 legs
  const colors = ['#00E5FF', '#32D583', '#F5B800', '#7057FF', '#FF8A00'];

  let cumulativeAngle = 0;

  return (
    <div className={`relative flex flex-col items-center justify-center ${className}`}>
      <svg width={size} height={size} className="transform -rotate-90">
        <circle
          cx={center}
          cy={center}
          r={radius}
          stroke="rgba(255, 255, 255, 0.06)"
          strokeWidth={strokeWidth}
          fill="transparent"
        />

        {legs.map((leg, idx) => {
          const rawVal = leg.rawVolumeUsd || 0;
          if (totalRaw <= 0) return null;
          const percentage = rawVal / totalRaw;
          const circumference = 2 * Math.PI * radius;
          const strokeDasharray = `${percentage * circumference} ${circumference}`;
          const strokeDashoffset = -cumulativeAngle * circumference;
          cumulativeAngle += percentage;

          return (
            <circle
              key={idx}
              cx={center}
              cy={center}
              r={radius}
              stroke={colors[idx % colors.length]}
              strokeWidth={strokeWidth}
              strokeDasharray={strokeDasharray}
              strokeDashoffset={strokeDashoffset}
              fill="transparent"
              className="transition-all duration-700 ease-out"
            />
          );
        })}
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
        <span className="text-xl font-extrabold font-mono text-white tabular-nums">
          {capEfficiency.toFixed(0)}%
        </span>
        <span className="text-[10px] text-[#98A2B3] uppercase tracking-wider font-medium">Leg Cap Efficiency</span>
      </div>
    </div>
  );
};
