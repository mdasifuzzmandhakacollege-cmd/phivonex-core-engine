import React from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
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
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis dataKey="date" stroke="#9CA3AF" />
          <YAxis stroke="#9CA3AF" />
          <Tooltip 
            contentStyle={{ backgroundColor: '#0B1728', borderColor: '#374151', color: '#F9FAFB' }}
            itemStyle={{ color: '#F9FAFB' }}
          />
          <Legend />
          <Area type="monotone" dataKey="rewards" stackId="1" stroke="#00CFFF" fill="#00CFFF" name="Rewards (PHIVO)" />
          <Area type="monotone" dataKey="usdt" stackId="1" stroke="#32D583" fill="#32D583" name="Earnings (USDT)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};
