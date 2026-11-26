import React from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

export interface ChartData {
  date: string;
  rewards: number;
  usdt: number;
}

interface RewardEarningsChartProps {
  data: ChartData[];
}

export const RewardEarningsChart: React.FC<RewardEarningsChartProps> = ({ data }) => {
  return (
    <div className="h-[256px] w-full min-w-0">
      <ResponsiveContainer width="100%" height={256} minWidth={0}>
        <AreaChart data={data} margin={{ top: 10, right: 10, left: -16, bottom: 0 }}>
          <defs>
            <linearGradient id="analyticsPhivoGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#00E5FF" stopOpacity={0.35} />
              <stop offset="95%" stopColor="#00E5FF" stopOpacity={0.0} />
            </linearGradient>
            <linearGradient id="analyticsUsdtGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#00E676" stopOpacity={0.28} />
              <stop offset="95%" stopColor="#00E676" stopOpacity={0.0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
          <XAxis
            dataKey="date"
            stroke="#64748B"
            tick={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fill: '#94A3B8' }}
            tickLine={false}
          />
          <YAxis
            stroke="#64748B"
            tick={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fill: '#94A3B8' }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'rgba(14, 21, 19, 0.96)',
              borderColor: 'rgba(255,255,255,0.14)',
              borderRadius: '16px',
              color: '#F9FAFB',
              fontSize: '12px',
              fontFamily: 'JetBrains Mono, monospace',
            }}
            itemStyle={{ color: '#F9FAFB' }}
          />
          <Legend wrapperStyle={{ fontSize: '11px', fontFamily: 'JetBrains Mono, monospace' }} />
          <Area
            type="monotone"
            dataKey="rewards"
            stroke="#00E5FF"
            strokeWidth={2}
            fill="url(#analyticsPhivoGrad)"
            name="Rewards (PHIVO)"
          />
          <Area
            type="monotone"
            dataKey="usdt"
            stroke="#00E676"
            strokeWidth={2}
            fill="url(#analyticsUsdtGrad)"
            name="Valuation (USDT)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};
