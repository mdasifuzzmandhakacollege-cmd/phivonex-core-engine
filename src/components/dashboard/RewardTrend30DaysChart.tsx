import React, { useState, useEffect } from 'react';
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
import { TrendingUp, Coins } from 'lucide-react';

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
  className = '',
}) => {
  const [chartData, setChartData] = useState<DailyRewardPoint[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [totalRewards30D, setTotalRewards30D] = useState<number>(0);
  const [referenceRate, setReferenceRate] = useState<number>(0.10);

  const fetchRewardTrend = async () => {
    try {
      const [rewardsRes, econRes] = await Promise.all([
        fetch('/api/rewards/me', { credentials: 'include' }).catch(() => null),
        fetch('/api/economic/public', { credentials: 'include' }).catch(() => null),
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
        const history: any[] = Array.isArray(rData.history) ? rData.history : [];

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
    } catch {
      // gracefully show empty state
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRewardTrend();
  }, []);

  return (
    <div className={`oneui-glass-card p-4 sm:p-6 rounded-[24px] space-y-5 min-w-0 overflow-hidden ${className}`}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 border-b border-white/[0.08]">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-2xl bg-[#00E5FF]/12 border border-[#00E5FF]/25 flex items-center justify-center text-[#00E5FF] shrink-0">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm sm:text-base font-bold text-white tracking-tight">
                PHIVO Rewards Earned (30 Days)
              </h3>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-[#00E676]/12 text-[#00E676] border border-[#00E676]/25">
                Active Trend
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Daily PHIVO emission distributions across your active Genesis nodes.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <div className="px-3 py-1.5 rounded-2xl bg-[#050807]/75 border border-white/[0.07] text-right font-mono">
            <div className="text-[10px] text-slate-400">30D Total Minted</div>
            <div className="text-sm font-bold text-[#00E5FF] tabular-nums">
              {totalRewards30D.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} PHIVO
            </div>
          </div>
          {onNavigateTab && (
            <button
              type="button"
              onClick={() => onNavigateTab('reward-analytics')}
              className="px-3.5 py-2.5 rounded-2xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-xs font-semibold text-white transition-all cursor-pointer active:scale-95"
            >
              View All
            </button>
          )}
        </div>
      </div>

      {/* Chart Container with explicit minWidth/height to prevent Recharts -1 console error */}
      <div className="w-full min-w-0 h-[256px] sm:h-[280px] pt-1">
        {loading ? (
          <div className="h-full w-full flex items-center justify-center text-xs font-mono text-slate-400">
            Loading 30-day reward distribution chart...
          </div>
        ) : chartData.length === 0 ? (
          <div className="h-full w-full flex items-center justify-center text-xs font-mono text-slate-400">
            No reward distribution records found for the last 30 days.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={256} minWidth={0}>
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -18, bottom: 0 }}>
              <defs>
                <linearGradient id="phivoRewardGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00E5FF" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#00E5FF" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="usdtValGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00E676" stopOpacity={0.28} />
                  <stop offset="95%" stopColor="#00E676" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis
                dataKey="displayDate"
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
                  color: '#F8FAFC',
                  boxShadow: '0 20px 30px -10px rgba(0, 0, 0, 0.7)',
                  fontSize: '12px',
                  fontFamily: 'JetBrains Mono, monospace',
                }}
                formatter={(value: any, name: any) => {
                  if (name === 'Daily Rewards (PHIVO)') {
                    return [`${Number(value).toFixed(2)} PHIVO`, 'Minted Rewards'];
                  }
                  return [`$${Number(value).toFixed(2)} USDT`, 'USD Valuation'];
                }}
                labelStyle={{ color: '#00E5FF', fontWeight: 'bold', marginBottom: '4px' }}
              />
              <Legend
                wrapperStyle={{ fontSize: '11px', paddingTop: '8px', fontFamily: 'JetBrains Mono, monospace' }}
              />
              <Area
                type="monotone"
                dataKey="rewards"
                name="Daily Rewards (PHIVO)"
                stroke="#00E5FF"
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#phivoRewardGradient)"
              />
              <Area
                type="monotone"
                dataKey="usdtValue"
                name="USD Valuation ($)"
                stroke="#00E676"
                strokeWidth={1.75}
                fillOpacity={1}
                fill="url(#usdtValGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Footer metadata */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400 pt-2 border-t border-white/[0.06]">
        <div className="flex items-center gap-1.5">
          <Coins className="w-3.5 h-3.5 text-[#00E5FF]" />
          <span className="font-mono tabular-nums">Benchmark Rate: ${referenceRate.toFixed(2)} USDT / PHIVO</span>
        </div>
        <div className="font-mono text-[10px] text-slate-500">
          30-Day Rolling Settlement Window
        </div>
      </div>
    </div>
  );
};
