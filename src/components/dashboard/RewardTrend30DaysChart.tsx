import React, { useState, useEffect } from 'react';
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
import { TrendingUp, Calendar, RefreshCw, Coins } from 'lucide-react';

interface DailyRewardPoint {
  dateStr: string;
  displayDate: string;
  rewards: number;
  usdtValue: number;
}

interface RewardTrend30DaysChartProps {
  onNavigateTab?: (tab: string) => void;
  className?: string;
}

export const RewardTrend30DaysChart: React.FC<RewardTrend30DaysChartProps> = ({
  onNavigateTab,
  className = ''
}) => {
  const [chartData, setChartData] = useState<DailyRewardPoint[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [totalRewards30D, setTotalRewards30D] = useState<number>(0);
  const [referenceRate, setReferenceRate] = useState<number>(0.10);

  const fetchRewardTrend = async () => {
    try {
      const [rewardsRes, econRes] = await Promise.all([
        fetch('/api/rewards/me', { credentials: 'include' }).catch(() => null),
        fetch('/api/economic/public').catch(() => null),
      ]);

      let refRate = 0.10;
      if (econRes && econRes.ok) {
        const eData = await econRes.json();
        if (typeof eData.phivoPriceUsd === 'number') {
          refRate = eData.phivoPriceUsd;
          setReferenceRate(refRate);
        }
      }

      if (rewardsRes && rewardsRes.ok) {
        const rData = await rewardsRes.json();
        const history: any[] = rData.history || [];

        // Build a map for the last 30 days (from 30 days ago to today)
        const now = new Date();
        const dailyMap = new Map<string, number>();

        for (let i = 29; i >= 0; i--) {
          const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
          const dateStr = d.toISOString().split('T')[0];
          dailyMap.set(dateStr, 0);
        }

        let sum30D = 0;
        history.forEach((item) => {
          if (item.accruedAt && item.status !== 'REVERSED') {
            const dateStr = new Date(item.accruedAt).toISOString().split('T')[0];
            if (dailyMap.has(dateStr)) {
              const current = dailyMap.get(dateStr) || 0;
              const amt = Number(item.amount || 0);
              dailyMap.set(dateStr, current + amt);
              sum30D += amt;
            }
          }
        });

        setTotalRewards30D(sum30D);

        const formatted: DailyRewardPoint[] = Array.from(dailyMap.entries()).map(([dateStr, rewards]) => {
          const parts = dateStr.split('-');
          const displayDate = parts.length === 3 ? `${parts[1]}/${parts[2]}` : dateStr;
          return {
            dateStr,
            displayDate,
            rewards: Number(rewards.toFixed(2)),
            usdtValue: Number((rewards * refRate).toFixed(2)),
          };
        });

        setChartData(formatted);
      }
    } catch (err) {
      console.warn('[RewardTrend30DaysChart] Failed to load 30-day reward trend:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRewardTrend();
  }, []);

  return (
    <div className={`p-5 sm:p-6 rounded-2xl bg-[#07101D] border border-white/[0.08] shadow-xl space-y-5 ${className}`}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#00CFFF]/10 border border-[#00CFFF]/25 flex items-center justify-center text-[#00CFFF] shrink-0">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-white tracking-tight">
                PHIVO Rewards Earned (Last 30 Days)
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#32D583]/10 text-[#32D583] border border-[#32D583]/25">
                Active Mining Trend
              </span>
            </div>
            <p className="text-xs text-[#98A2B3]">
              Daily trend graph of minted PHIVO reward distributions across your validator nodes.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="px-3 py-1.5 rounded-xl bg-[#050B14] border border-white/[0.05] text-right font-mono">
            <div className="text-[10px] text-[#98A2B3]">30D Total Minted</div>
            <div className="text-sm font-bold text-[#00CFFF]">
              {totalRewards30D.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} PHIVO
            </div>
          </div>
          {onNavigateTab && (
            <button
              type="button"
              onClick={() => onNavigateTab('rewards')}
              className="px-3 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-xs font-semibold text-white transition-all cursor-pointer"
            >
              View All
            </button>
          )}
        </div>
      </div>

      {/* Chart Container */}
      <div className="h-64 sm:h-72 w-full pt-2">
        {loading ? (
          <div className="h-full w-full flex items-center justify-center text-xs font-mono text-[#98A2B3]">
            Loading 30-day reward trend telemetry...
          </div>
        ) : chartData.length === 0 ? (
          <div className="h-full w-full flex items-center justify-center text-xs font-mono text-[#98A2B3]">
            No reward distribution records found for the last 30 days.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="phivoRewardGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00CFFF" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#00CFFF" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="usdtValGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#32D583" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#32D583" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
              <XAxis 
                dataKey="displayDate" 
                stroke="#64748B" 
                tick={{ fontSize: 11, fontFamily: 'monospace' }} 
                tickLine={false}
              />
              <YAxis 
                stroke="#64748B" 
                tick={{ fontSize: 11, fontFamily: 'monospace' }} 
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#07101D',
                  borderColor: '#334155',
                  borderRadius: '12px',
                  color: '#F8FAFC',
                  boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
                  fontSize: '12px',
                  fontFamily: 'monospace'
                }}
                formatter={(value: any, name: any) => {
                  if (name === 'Daily Rewards (PHIVO)') {
                    return [`${Number(value).toFixed(2)} PHIVO`, 'Minted Rewards'];
                  }
                  return [`$${Number(value).toFixed(2)} USDT`, 'USD Valuation'];
                }}
                labelStyle={{ color: '#00CFFF', fontWeight: 'bold', marginBottom: '4px' }}
              />
              <Legend 
                wrapperStyle={{ fontSize: '11px', paddingTop: '8px', fontFamily: 'monospace' }}
              />
              <Area
                type="monotone"
                dataKey="rewards"
                name="Daily Rewards (PHIVO)"
                stroke="#00CFFF"
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#phivoRewardGradient)"
              />
              <Area
                type="monotone"
                dataKey="usdtValue"
                name="USD Valuation ($)"
                stroke="#32D583"
                strokeWidth={1.5}
                fillOpacity={1}
                fill="url(#usdtValGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Footer metadata */}
      <div className="flex items-center justify-between text-[11px] text-[#64748B] pt-2 border-t border-white/[0.04]">
        <div className="flex items-center gap-1.5">
          <Coins className="w-3.5 h-3.5 text-[#00CFFF]" />
          <span>Epoch Benchmark Rate: ${referenceRate.toFixed(2)} USDT / PHIVO</span>
        </div>
        <div className="font-mono text-[10px]">
          Refreshed via Recharts Engine
        </div>
      </div>
    </div>
  );
};
