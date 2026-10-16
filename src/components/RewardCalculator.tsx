import React, { useState, useMemo } from 'react';
import {
  Calculator,
  Sliders,
  Shield,
  HelpCircle,
  Copy,
  Check,
  Zap,
  Layers,
  ArrowRight,
  TrendingUp,
  Cpu,
  Server,
  Info,
  LineChart as LineChartIcon
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine
} from 'recharts';

interface RewardCalculatorProps {
  activeNodes?: number;
  onActionClick?: () => void;
}

export const RewardCalculator: React.FC<RewardCalculatorProps> = ({
  activeNodes = 3689,
  onActionClick,
}) => {
  // Inputs
  const [nodeCount, setNodeCount] = useState<number>(1);
  const [durationDays, setDurationDays] = useState<number>(30);
  const [isCustomDays, setIsCustomDays] = useState<boolean>(false);
  const [uptimePercent, setUptimePercent] = useState<number>(100);
  const [networkScenario, setNetworkScenario] = useState<'current' | 'expansion' | 'scale' | 'max'>('current');
  const [showFormula, setShowFormula] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  // Network scenario node counts
  const scenarioNodes = useMemo(() => {
    switch (networkScenario) {
      case 'expansion':
        return 5000;
      case 'scale':
        return 7500;
      case 'max':
        return 10000;
      case 'current':
      default:
        return activeNodes;
    }
  }, [networkScenario, activeNodes]);

  // Protocol mathematical constants
  // Total Genesis Node daily reward emission pool: 177,957.36 PHIVO / day
  // (yielding 48.24 PHIVO/day per node at current 3,689 active nodes, matching live telemetry)
  const DAILY_TOTAL_POOL = 177957.36;
  const EPOCHS_PER_DAY = 144; // 10-minute epochs

  // Calculations
  const dailyPerNode = useMemo(() => {
    return (DAILY_TOTAL_POOL / scenarioNodes) * (uptimePercent / 100);
  }, [scenarioNodes, uptimePercent]);

  const dailyTotal = useMemo(() => {
    return dailyPerNode * nodeCount;
  }, [dailyPerNode, nodeCount]);

  const totalEstimatedReward = useMemo(() => {
    return dailyTotal * durationDays;
  }, [dailyTotal, durationDays]);

  const totalEpochsValidated = useMemo(() => {
    return Math.round(durationDays * EPOCHS_PER_DAY * nodeCount * (uptimePercent / 100));
  }, [durationDays, nodeCount, uptimePercent]);

  const networkShare = useMemo(() => {
    return ((nodeCount / scenarioNodes) * 100).toFixed(4);
  }, [nodeCount, scenarioNodes]);

  // Generate curve data points for recharts line graph
  const chartData = useMemo(() => {
    const pointsCount = Math.min(Math.max(durationDays, 12), 24);
    const data = [];

    // Day 0 baseline
    data.push({
      day: 0,
      label: 'Day 0',
      reward: 0,
      epochs: 0,
    });

    const step = durationDays / pointsCount;
    for (let i = 1; i <= pointsCount; i++) {
      const currentDay = Math.min(durationDays, Math.round(i * step));
      const rewardAtDay = +(dailyTotal * currentDay).toFixed(2);
      const epochsAtDay = Math.round(currentDay * EPOCHS_PER_DAY * nodeCount * (uptimePercent / 100));

      data.push({
        day: currentDay,
        label: `Day ${currentDay}`,
        reward: rewardAtDay,
        epochs: epochsAtDay,
      });
    }

    return data;
  }, [durationDays, dailyTotal, nodeCount, uptimePercent]);

  // Copy estimate summary
  const handleCopy = () => {
    const summaryText = `PHIVONEX Protocol Reward Estimate Simulation:
Nodes: ${nodeCount}
Duration: ${durationDays} Days
Active Network Scenario: ${scenarioNodes.toLocaleString()} nodes
Uptime Benchmark: ${uptimePercent}%
Estimated Daily Reward: ${dailyTotal.toFixed(2)} PHIV
Total Estimated Reward: ${totalEstimatedReward.toFixed(2)} PHIV
Epochs Attested: ${totalEpochsValidated.toLocaleString()}
Notice: Illustrative protocol calculation only. Dynamic rewards depend on epoch quorum & uptime.`;
    navigator.clipboard.writeText(summaryText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const durationPresets = [
    { label: '30 Days', days: 30 },
    { label: '90 Days', days: 90 },
    { label: '180 Days', days: 180 },
    { label: '365 Days', days: 365 },
  ];

  const nodeCountPresets = [1, 2, 5, 10, 20];

  return (
    <div className="mt-12 pt-12 border-t border-white/[0.08]">
      
      {/* Sub-header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <div className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-[0.2em] text-[#00C8FF] mb-2">
            <Calculator className="w-3.5 h-3.5" />
            <span>INTERACTIVE ESTIMATION ENGINE</span>
          </div>
          <h3 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Protocol Reward Calculator
          </h3>
          <p className="text-xs sm:text-sm text-[#98A2B3] mt-1.5 max-w-2xl">
            Model projected epoch accrual across custom node counts, operational time horizons, and network participation scenarios based on published protocol emission rules.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFormula(!showFormula)}
            className="px-3 py-1.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.08] text-xs font-mono text-[#98A2B3] hover:text-white transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Info className="w-3.5 h-3.5 text-[#00C8FF]" />
            <span>{showFormula ? 'Hide Formula' : 'Inspect Formula'}</span>
          </button>
          <button
            onClick={handleCopy}
            className="px-3 py-1.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.08] text-xs font-mono text-[#98A2B3] hover:text-white transition-colors flex items-center gap-1.5 cursor-pointer"
            title="Copy estimate parameters to clipboard"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-[#32D583]" /> : <Copy className="w-3.5 h-3.5 text-[#00C8FF]" />}
            <span>{copied ? 'Copied' : 'Copy Estimate'}</span>
          </button>
        </div>
      </div>

      {/* Formula Collapsible Panel */}
      {showFormula && (
        <div className="p-4 sm:p-5 rounded-xl bg-[#05070B] border border-[#00C8FF]/30 text-xs font-mono mb-8 space-y-3 shadow-inner">
          <div className="flex items-center justify-between text-white font-bold">
            <span className="flex items-center gap-2 text-[#00C8FF]">
              <Cpu className="w-4 h-4" /> MATHEMATICAL REWARD FORMULATION
            </span>
            <span className="text-[11px] text-[#98A2B3]">PHIVONEX Protocol Spec v1.4</span>
          </div>
          <div className="p-3 bg-white/[0.02] rounded-lg border border-white/[0.06] text-[#F5F7FA] overflow-x-auto text-[11px]">
            <code>
              R_estimated = (Duration_Days × Daily_Pool_Emission) × (Node_Count / Total_Active_Nodes) × (Uptime_Factor / 100)
            </code>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[11px] text-[#98A2B3] pt-1">
            <div>
              <span className="text-white block font-semibold">Daily Emission Pool:</span>
              <span>177,957.36 PHIVO fixed daily allocation</span>
            </div>
            <div>
              <span className="text-white block font-semibold">Active Node Weight:</span>
              <span>Proportional share of total active validators</span>
            </div>
            <div>
              <span className="text-white block font-semibold">Uptime Slashing Factor:</span>
              <span>Attestation rate required ≥ 98% for epoch payout</span>
            </div>
          </div>
        </div>
      )}

      {/* Calculator Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Interactive Inputs (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* 1. Node Count Slider & Stepper */}
          <div className="p-5 rounded-2xl bg-[#080B12] border border-white/[0.08] space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <label htmlFor="node-count-input" className="text-xs font-mono text-white font-bold flex items-center gap-2">
                  <Server className="w-4 h-4 text-[#00C8FF]" />
                  <span>NODE COUNT</span>
                </label>
                <span className="text-[11px] text-[#98A2B3] block">Number of Genesis Nodes in validator portfolio</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setNodeCount((prev) => Math.max(1, prev - 1))}
                  className="w-7 h-7 rounded-md bg-white/[0.05] hover:bg-white/[0.1] text-white flex items-center justify-center font-mono font-bold cursor-pointer transition-colors"
                  aria-label="Decrease node count"
                >
                  -
                </button>
                <input
                  id="node-count-input"
                  type="number"
                  min="1"
                  max="100"
                  value={nodeCount}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    setNodeCount(isNaN(val) ? 1 : Math.min(100, Math.max(1, val)));
                  }}
                  className="w-16 py-1 px-2 text-center rounded-md bg-[#05070B] border border-white/[0.15] text-white font-mono font-bold text-sm focus:outline-none focus:border-[#00C8FF]"
                />
                <button
                  type="button"
                  onClick={() => setNodeCount((prev) => Math.min(100, prev + 1))}
                  className="w-7 h-7 rounded-md bg-white/[0.05] hover:bg-white/[0.1] text-white flex items-center justify-center font-mono font-bold cursor-pointer transition-colors"
                  aria-label="Increase node count"
                >
                  +
                </button>
              </div>
            </div>

            {/* Slider */}
            <input
              type="range"
              min="1"
              max="50"
              value={Math.min(nodeCount, 50)}
              onChange={(e) => setNodeCount(parseInt(e.target.value, 10))}
              className="w-full accent-[#00C8FF] cursor-pointer bg-white/[0.08] h-2 rounded-lg"
              aria-label="Node count slider"
            />

            {/* Presets */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-[10px] font-mono text-[#98A2B3]">QUICK PRESETS:</span>
              {nodeCountPresets.map((count) => (
                <button
                  key={count}
                  type="button"
                  onClick={() => setNodeCount(count)}
                  className={`px-2.5 py-1 rounded text-xs font-mono transition-colors cursor-pointer ${
                    nodeCount === count
                      ? 'bg-[#00C8FF] text-[#05070B] font-bold shadow-sm shadow-[#00C8FF]/20'
                      : 'bg-white/[0.03] text-[#98A2B3] hover:text-white hover:bg-white/[0.06] border border-white/[0.05]'
                  }`}
                >
                  {count} {count === 1 ? 'Node' : 'Nodes'}
                </button>
              ))}
            </div>
          </div>

          {/* 2. Duration Selector */}
          <div className="p-5 rounded-2xl bg-[#080B12] border border-white/[0.08] space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-mono text-white font-bold flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-[#32D583]" />
                  <span>TIME HORIZON (DURATION)</span>
                </span>
                <span className="text-[11px] text-[#98A2B3] block">Epoch accumulation validation period</span>
              </div>
              <span className="text-sm font-mono font-bold text-[#32D583] bg-[#32D583]/10 px-2.5 py-1 rounded border border-[#32D583]/20">
                {durationDays} Days ({Math.round(durationDays / 30 * 10) / 10} Mo)
              </span>
            </div>

            {/* Preset Pills */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {durationPresets.map((p) => (
                <button
                  key={p.days}
                  type="button"
                  onClick={() => {
                    setDurationDays(p.days);
                    setIsCustomDays(false);
                  }}
                  className={`py-2 px-3 rounded-lg text-xs font-mono font-medium transition-all cursor-pointer text-center border ${
                    durationDays === p.days && !isCustomDays
                      ? 'bg-[#32D583]/15 border-[#32D583] text-white font-bold shadow-sm shadow-[#32D583]/10'
                      : 'bg-white/[0.02] border-white/[0.06] text-[#98A2B3] hover:text-white hover:bg-white/[0.04]'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Custom Days Toggle */}
            <div className="pt-2">
              <div className="flex items-center justify-between text-[11px] font-mono text-[#98A2B3] mb-2">
                <span>Custom Duration Slider (7 – 730 Days)</span>
                <span>{durationDays} Days</span>
              </div>
              <input
                type="range"
                min="7"
                max="730"
                step="1"
                value={durationDays}
                onChange={(e) => {
                  setDurationDays(parseInt(e.target.value, 10));
                  setIsCustomDays(true);
                }}
                className="w-full accent-[#32D583] cursor-pointer bg-white/[0.08] h-2 rounded-lg"
                aria-label="Custom duration in days"
              />
            </div>
          </div>

          {/* 3. Scenario & Uptime Benchmark */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            
            {/* Network Quorum Scenario */}
            <div className="p-4 rounded-xl bg-[#080B12] border border-white/[0.08] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-white font-bold flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-[#6C5CFF]" />
                  <span>NETWORK PARTICIPATION</span>
                </span>
                <span className="text-[10px] font-mono text-[#98A2B3]">
                  {scenarioNodes.toLocaleString()} Nodes
                </span>
              </div>

              <div className="grid grid-cols-2 gap-1.5 pt-1">
                {[
                  { id: 'current', label: 'Active (3.7k)', count: 3689 },
                  { id: 'expansion', label: 'Tier 3 (5k)', count: 5000 },
                  { id: 'scale', label: 'Tier 4 (7.5k)', count: 7500 },
                  { id: 'max', label: 'Hardcap (10k)', count: 10000 },
                ].map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setNetworkScenario(s.id as any)}
                    className={`px-2 py-1.5 text-[11px] font-mono rounded border transition-colors cursor-pointer text-left ${
                      networkScenario === s.id
                        ? 'bg-[#6C5CFF]/20 border-[#6C5CFF] text-white font-bold'
                        : 'bg-white/[0.02] border-white/[0.05] text-[#98A2B3] hover:text-white'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <span className="text-[10px] text-[#98A2B3] block pt-1 leading-tight">
                Simulates protocol reward distribution under increasing validator competition.
              </span>
            </div>

            {/* Expected Uptime Benchmark */}
            <div className="p-4 rounded-xl bg-[#080B12] border border-white/[0.08] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-white font-bold flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-[#00C8FF]" />
                  <span>UPTIME BENCHMARK</span>
                </span>
                <span className="text-[10px] font-mono text-[#32D583]">
                  {uptimePercent}% Attestation
                </span>
              </div>

              <div className="grid grid-cols-3 gap-1.5 pt-1">
                {[
                  { rate: 100, label: '100%' },
                  { rate: 99.5, label: '99.5%' },
                  { rate: 98.0, label: '98.0%' },
                ].map((u) => (
                  <button
                    key={u.rate}
                    type="button"
                    onClick={() => setUptimePercent(u.rate)}
                    className={`px-2 py-1.5 text-[11px] font-mono rounded border transition-colors cursor-pointer text-center ${
                      uptimePercent === u.rate
                        ? 'bg-[#00C8FF]/20 border-[#00C8FF] text-white font-bold'
                        : 'bg-white/[0.02] border-white/[0.05] text-[#98A2B3] hover:text-white'
                    }`}
                  >
                    {u.label}
                  </button>
                ))}
              </div>
              <span className="text-[10px] text-[#98A2B3] block pt-1 leading-tight">
                Protocol invariants require &gt;98% validator uptime to receive full epoch block rewards.
              </span>
            </div>

          </div>

        </div>

        {/* Right Column: Output Telemetry Projection (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          
          <div className="p-6 rounded-2xl bg-gradient-to-b from-[#0B1020] via-[#080B12] to-[#05070B] border border-white/[0.12] shadow-2xl relative overflow-hidden flex flex-col justify-between space-y-6">
            
            {/* Top Glow Accent */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-[#00C8FF]/[0.06] rounded-full blur-3xl pointer-events-none" />

            <div>
              <div className="flex items-center justify-between text-xs font-mono mb-2">
                <span className="text-[#98A2B3] uppercase tracking-wider">PROJECTED PROTOCOL ACCRUAL</span>
                <span className="text-[#32D583] flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-[#32D583] animate-subtle-pulse" />
                  SIMULATED
                </span>
              </div>

              {/* Primary Output Metric */}
              <div className="py-2">
                <div className="text-3xl sm:text-4xl lg:text-5xl font-extrabold font-mono text-white tracking-tight tabular-nums text-balance">
                  {totalEstimatedReward.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  <span className="text-xl sm:text-2xl text-[#00C8FF] ml-2 font-bold">PHIVO</span>
                </div>
                <div className="text-xs font-mono text-[#98A2B3] mt-1">
                  Total projected emission for <strong className="text-white">{nodeCount} {nodeCount === 1 ? 'node' : 'nodes'}</strong> over <strong className="text-white">{durationDays} days</strong>
                </div>
              </div>

              {/* Sub-Metrics Grid */}
              <div className="grid grid-cols-2 gap-3 pt-4 border-t border-white/[0.08] font-mono text-xs">
                <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.05]">
                  <span className="text-[#98A2B3] block text-[10px] mb-0.5">DAILY RUN-RATE</span>
                  <span className="text-base font-bold text-[#00C8FF] tabular-nums">
                    {dailyTotal.toFixed(2)} PHIVO
                  </span>
                  <span className="text-[10px] text-[#98A2B3] block mt-0.5">
                    ~{(dailyTotal / 24).toFixed(2)} PHIVO / hr
                  </span>
                </div>

                <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.05]">
                  <span className="text-[#98A2B3] block text-[10px] mb-0.5">PER NODE DAILY</span>
                  <span className="text-base font-bold text-white tabular-nums">
                    {dailyPerNode.toFixed(2)} PHIVO
                  </span>
                  <span className="text-[10px] text-[#32D583] block mt-0.5">
                    At {uptimePercent}% uptime
                  </span>
                </div>

                <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.05]">
                  <span className="text-[#98A2B3] block text-[10px] mb-0.5">EPOCHS VALIDATED</span>
                  <span className="text-base font-bold text-white tabular-nums">
                    {totalEpochsValidated.toLocaleString()}
                  </span>
                  <span className="text-[10px] text-[#98A2B3] block mt-0.5">
                    10-min block rounds
                  </span>
                </div>

                <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.05]">
                  <span className="text-[#98A2B3] block text-[10px] mb-0.5">CONSENSUS WEIGHT</span>
                  <span className="text-base font-bold text-[#6C5CFF] tabular-nums">
                    {networkShare}%
                  </span>
                  <span className="text-[10px] text-[#98A2B3] block mt-0.5">
                    Of {scenarioNodes.toLocaleString()} nodes
                  </span>
                </div>
              </div>
            </div>

            {/* Action CTA within Calculator */}
            <div className="pt-4 border-t border-white/[0.08] space-y-3">
              {onActionClick && (
                <button
                  type="button"
                  onClick={onActionClick}
                  className="w-full py-3 px-4 rounded-xl text-xs font-mono font-bold text-[#05070B] bg-gradient-to-r from-[#00C8FF] to-[#1A8CFF] hover:brightness-110 active:scale-[0.99] transition-all shadow-lg shadow-[#00C8FF]/20 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>Simulate Node Allocation in Portal</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}

              <div className="flex items-center justify-between text-[11px] font-mono text-[#98A2B3]">
                <span>Genesis Tranche: Tier 2 (Expansion)</span>
                <span className="text-[#00C8FF]">1,250 USDT / Node</span>
              </div>
            </div>

          </div>

          {/* Mandatory Regulatory Risk & Non-Financial Disclaimer */}
          <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] text-[11px] font-sans text-[#98A2B3] flex items-start gap-2.5">
            <Shield className="w-4 h-4 text-[#FDB022] shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              <strong className="text-white font-mono">Mathematical Model Disclaimer:</strong> Projections represent protocol computational rewards calculated from published distribution parameters and 100% attestation reliability. This is not financial advice, interest yield, or guaranteed passive return.
            </p>
          </div>

        </div>

      </div>

      {/* Visual Recharts Line Graph: Estimated Reward Accumulation Trajectory */}
      <div className="mt-8 p-6 rounded-2xl bg-[#080B12] border border-white/[0.08] shadow-2xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 pb-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#00C8FF]/10 border border-[#00C8FF]/30 flex items-center justify-center text-[#00C8FF]">
              <LineChartIcon className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-sm sm:text-base font-bold text-white flex items-center gap-2 font-mono">
                <span>ESTIMATED ACCUMULATION TRAJECTORY</span>
                <span className="text-[10px] text-[#32D583] bg-[#32D583]/10 px-2 py-0.5 rounded border border-[#32D583]/20">
                  RECHART LINE GRAPH
                </span>
              </h4>
              <p className="text-xs text-[#98A2B3] mt-0.5">
                Compound epoch accrual curve over {durationDays} days for {nodeCount} {nodeCount === 1 ? 'node' : 'nodes'} at {uptimePercent}% uptime
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 font-mono text-xs">
            <div className="px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.06] flex items-center gap-2">
              <span className="w-2.5 h-0.5 bg-[#00C8FF] rounded-full inline-block" />
              <span className="text-[#98A2B3]">Total Accrual:</span>
              <span className="text-[#00C8FF] font-bold">
                {totalEstimatedReward.toLocaleString(undefined, { maximumFractionDigits: 1 })} PHIV
              </span>
            </div>
            <div className="hidden md:flex px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.06] items-center gap-2">
              <span className="text-[#98A2B3]">Final Epoch:</span>
              <span className="text-white font-bold">
                #{((284 + (durationDays * EPOCHS_PER_DAY))).toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {/* Chart Canvas */}
        <div className="w-full h-72 sm:h-80">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 15, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="rewardEmissionGlow" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00C8FF" stopOpacity={0.4} />
                  <stop offset="60%" stopColor="#00C8FF" stopOpacity={0.08} />
                  <stop offset="95%" stopColor="#00C8FF" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.05)" vertical={false} />
              <XAxis
                dataKey="day"
                tickLine={false}
                axisLine={{ stroke: 'rgba(255, 255, 255, 0.1)' }}
                stroke="#667085"
                tick={{ fill: '#98A2B3', fontSize: 11, fontFamily: 'monospace' }}
                tickFormatter={(val) => `Day ${val}`}
              />
              <YAxis
                tickLine={false}
                axisLine={{ stroke: 'rgba(255, 255, 255, 0.1)' }}
                stroke="#667085"
                tick={{ fill: '#98A2B3', fontSize: 11, fontFamily: 'monospace' }}
                tickFormatter={(val) => {
                  if (val >= 1000000) return `${(val / 1000000).toFixed(1)}M`;
                  if (val >= 1000) return `${(val / 1000).toFixed(1)}k`;
                  return `${val}`;
                }}
                domain={[0, 'auto']}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const d = payload[0].payload;
                    return (
                      <div className="p-3.5 bg-[#0B1020]/95 backdrop-blur-md border border-[#00C8FF]/40 rounded-xl shadow-2xl font-mono text-xs">
                        <div className="text-[#98A2B3] text-[10px] uppercase tracking-wider mb-1 flex items-center justify-between gap-4">
                          <span>{d.label}</span>
                          <span className="text-[#00C8FF]">Time Progress: {Math.round((d.day / durationDays) * 100)}%</span>
                        </div>
                        <div className="text-white font-bold text-lg flex items-baseline gap-1 my-0.5">
                          <span className="text-[#00C8FF]">
                            {Number(d.reward).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                          <span className="text-xs text-white/70">PHIVO</span>
                        </div>
                        <div className="mt-2 pt-2 border-t border-white/[0.08] space-y-1 text-[11px]">
                          <div className="flex items-center justify-between text-[#98A2B3]">
                            <span>Epochs Completed:</span>
                            <span className="text-[#32D583] font-semibold">{d.epochs.toLocaleString()}</span>
                          </div>
                          <div className="flex items-center justify-between text-[#98A2B3]">
                            <span>Daily Emission Rate:</span>
                            <span className="text-white font-semibold">{dailyTotal.toFixed(2)} PHIVO/d</span>
                          </div>
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Area
                type="monotone"
                dataKey="reward"
                stroke="#00C8FF"
                strokeWidth={2.5}
                fill="url(#rewardEmissionGlow)"
                activeDot={{
                  r: 6,
                  fill: '#00C8FF',
                  stroke: '#05070B',
                  strokeWidth: 2,
                  className: 'shadow-lg'
                }}
              />
              {/* Reference line for midpoint */}
              <ReferenceLine
                x={Math.round(durationDays / 2)}
                stroke="rgba(255, 255, 255, 0.15)"
                strokeDasharray="4 4"
                label={{
                  value: '50% Mark',
                  fill: '#98A2B3',
                  fontSize: 10,
                  position: 'top',
                  fontFamily: 'monospace'
                }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Chart Footer Legend & Context */}
        <div className="mt-4 pt-3 border-t border-white/[0.05] flex flex-wrap items-center justify-between gap-3 text-[11px] font-mono text-[#98A2B3]">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-[#00C8FF]" />
              Cumulative Attestation Curve
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#32D583]" />
              Uptime Invariant: ≥ 98%
            </span>
          </div>
          <span className="text-white/60">
            Hover along the line trajectory to inspect milestone reward projections.
          </span>
        </div>
      </div>

    </div>
  );
};

