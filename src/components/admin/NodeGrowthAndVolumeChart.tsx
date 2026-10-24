import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as d3 from 'd3';
import {
  Server,
  TrendingUp,
  Activity,
  Calendar,
  RefreshCw,
  Info,
  DollarSign,
  BarChart2,
  Filter,
} from 'lucide-react';

export interface DailyNodeVolumeDataPoint {
  date: string; // ISO format 'YYYY-MM-DD'
  timestamp: number;
  newActivations: number;
  cumulativeNodes: number;
  dailyVolumeUsdt: number;
}

interface NodeGrowthAndVolumeChartProps {
  data?: DailyNodeVolumeDataPoint[];
  onRefresh?: () => void;
  isLoading?: boolean;
}

export const NodeGrowthAndVolumeChart: React.FC<NodeGrowthAndVolumeChartProps> = ({
  data: externalData,
  onRefresh,
  isLoading = false,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [timeRange, setTimeRange] = useState<'7D' | '30D' | '90D' | 'ALL'>('30D');
  const [activeSeries, setActiveSeries] = useState<'BOTH' | 'NODES' | 'VOLUME'>('BOTH');
  const [tooltipData, setTooltipData] = useState<{
    point: DailyNodeVolumeDataPoint;
    x: number;
    y: number;
  } | null>(null);

  // Generate fallback/mock historical dataset if externalData is empty
  const chartData = useMemo(() => {
    if (externalData && externalData.length > 0) {
      let filtered = [...externalData].sort((a, b) => a.timestamp - b.timestamp);
      const now = Date.now();
      if (timeRange === '7D') {
        const cutoff = now - 7 * 24 * 60 * 60 * 1000;
        filtered = filtered.filter((d) => d.timestamp >= cutoff);
      } else if (timeRange === '30D') {
        const cutoff = now - 30 * 24 * 60 * 60 * 1000;
        filtered = filtered.filter((d) => d.timestamp >= cutoff);
      } else if (timeRange === '90D') {
        const cutoff = now - 90 * 24 * 60 * 60 * 1000;
        filtered = filtered.filter((d) => d.timestamp >= cutoff);
      }
      return filtered;
    }

    // Default 30-day realistic time-series
    const days = timeRange === '7D' ? 7 : timeRange === '30D' ? 30 : timeRange === '90D' ? 90 : 60;
    const mock: DailyNodeVolumeDataPoint[] = [];
    const now = new Date();
    let cumulative = 120;

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      
      const newAct = Math.floor(Math.random() * 8) + 1; // 1-8 new nodes/day
      cumulative += newAct;
      const volume = newAct * 1000 + Math.floor(Math.random() * 15000); // USDT volume

      mock.push({
        date: dateStr,
        timestamp: d.getTime(),
        newActivations: newAct,
        cumulativeNodes: cumulative,
        dailyVolumeUsdt: volume,
      });
    }

    return mock;
  }, [externalData, timeRange]);

  // Summary Metrics
  const totalVolumeInPeriod = useMemo(
    () => chartData.reduce((acc, curr) => acc + curr.dailyVolumeUsdt, 0),
    [chartData]
  );
  const latestCumulativeNodes = useMemo(
    () => (chartData.length > 0 ? chartData[chartData.length - 1].cumulativeNodes : 0),
    [chartData]
  );
  const totalNewActivations = useMemo(
    () => chartData.reduce((acc, curr) => acc + curr.newActivations, 0),
    [chartData]
  );

  // Render D3 Chart Effect
  useEffect(() => {
    if (!svgRef.current || chartData.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove(); // Clear previous drawing

    const containerWidth = containerRef.current?.clientWidth || 700;
    const height = 360;
    const margin = { top: 30, right: 60, bottom: 40, left: 60 };
    const width = containerWidth - margin.left - margin.right;

    svg
      .attr('width', containerWidth)
      .attr('height', height)
      .attr('viewBox', `0 0 ${containerWidth} ${height}`);

    const chartGroup = svg
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // X Scale: Date
    const xScale = d3
      .scaleTime()
      .domain(d3.extent(chartData, (d) => new Date(d.date)) as [Date, Date])
      .range([0, width]);

    // Y Scale Left: Cumulative Nodes
    const maxNodes = d3.max(chartData, (d) => d.cumulativeNodes) || 100;
    const minNodes = d3.min(chartData, (d) => d.cumulativeNodes) || 0;
    const yScaleNodes = d3
      .scaleLinear()
      .domain([Math.max(0, minNodes - 10), maxNodes + 15])
      .range([height - margin.top - margin.bottom, 0]);

    // Y Scale Right: Transaction Volume (USDT)
    const maxVolume = d3.max(chartData, (d) => d.dailyVolumeUsdt) || 10000;
    const yScaleVolume = d3
      .scaleLinear()
      .domain([0, maxVolume * 1.2])
      .range([height - margin.top - margin.bottom, 0]);

    // Gradients
    const defs = svg.append('defs');

    // Node Area Gradient (Cyan / Blue)
    const nodeGradient = defs
      .append('linearGradient')
      .attr('id', 'nodeAreaGradient')
      .attr('x1', '0%')
      .attr('y1', '0%')
      .attr('x2', '0%')
      .attr('y2', '100%');

    nodeGradient.append('stop').attr('offset', '0%').attr('stop-color', '#00CFFF').attr('stop-opacity', 0.35);
    nodeGradient.append('stop').attr('offset', '100%').attr('stop-color', '#00CFFF').attr('stop-opacity', 0.0);

    // Volume Bar Gradient (Emerald Green)
    const volumeGradient = defs
      .append('linearGradient')
      .attr('id', 'volumeBarGradient')
      .attr('x1', '0%')
      .attr('y1', '0%')
      .attr('x2', '0%')
      .attr('y2', '100%');

    volumeGradient.append('stop').attr('offset', '0%').attr('stop-color', '#32D583').attr('stop-opacity', 0.7);
    volumeGradient.append('stop').attr('offset', '100%').attr('stop-color', '#10B981').attr('stop-opacity', 0.25);

    // Gridlines
    const yGrid = d3
      .axisLeft(yScaleNodes)
      .tickSize(-width)
      .tickFormat(() => '');

    chartGroup
      .append('g')
      .attr('class', 'grid')
      .call(yGrid)
      .selectAll('line')
      .attr('stroke', 'rgba(255, 255, 255, 0.05)')
      .attr('stroke-dasharray', '3,3');

    // Render Bars: Daily Transaction Volume (if VOLUME or BOTH active)
    if (activeSeries === 'BOTH' || activeSeries === 'VOLUME') {
      const barWidth = Math.max(4, Math.min(24, (width / chartData.length) * 0.55));

      chartGroup
        .selectAll('.volume-bar')
        .data(chartData)
        .enter()
        .append('rect')
        .attr('class', 'volume-bar')
        .attr('x', (d) => (xScale(new Date(d.date)) || 0) - barWidth / 2)
        .attr('y', (d) => yScaleVolume(d.dailyVolumeUsdt))
        .attr('width', barWidth)
        .attr('height', (d) => height - margin.top - margin.bottom - yScaleVolume(d.dailyVolumeUsdt))
        .attr('fill', 'url(#volumeBarGradient)')
        .attr('rx', 3)
        .attr('opacity', 0.85);
    }

    // Render Area & Line: Cumulative Node Activation Growth (if NODES or BOTH active)
    if (activeSeries === 'BOTH' || activeSeries === 'NODES') {
      // Area
      const areaGenerator = d3
        .area<DailyNodeVolumeDataPoint>()
        .x((d) => xScale(new Date(d.date)))
        .y0(height - margin.top - margin.bottom)
        .y1((d) => yScaleNodes(d.cumulativeNodes))
        .curve(d3.curveMonotoneX);

      chartGroup
        .append('path')
        .datum(chartData)
        .attr('fill', 'url(#nodeAreaGradient)')
        .attr('d', areaGenerator);

      // Line
      const lineGenerator = d3
        .line<DailyNodeVolumeDataPoint>()
        .x((d) => xScale(new Date(d.date)))
        .y((d) => yScaleNodes(d.cumulativeNodes))
        .curve(d3.curveMonotoneX);

      chartGroup
        .append('path')
        .datum(chartData)
        .attr('fill', 'none')
        .attr('stroke', '#00CFFF')
        .attr('stroke-width', 2.5)
        .attr('d', lineGenerator);

      // Node Points
      chartGroup
        .selectAll('.node-dot')
        .data(chartData)
        .enter()
        .append('circle')
        .attr('class', 'node-dot')
        .attr('cx', (d) => xScale(new Date(d.date)))
        .attr('cy', (d) => yScaleNodes(d.cumulativeNodes))
        .attr('r', 3.5)
        .attr('fill', '#05070B')
        .attr('stroke', '#00CFFF')
        .attr('stroke-width', 2);
    }

    // X Axis (Dates)
    const xAxis = d3
      .axisBottom(xScale)
      .ticks(Math.min(chartData.length, 8))
      .tickFormat((d) => d3.timeFormat('%b %d')(d as Date));

    const xAxisG = chartGroup
      .append('g')
      .attr('transform', `translate(0, ${height - margin.top - margin.bottom})`)
      .call(xAxis);

    xAxisG.selectAll('text').attr('fill', '#98A2B3').attr('font-size', '10px').attr('font-family', 'monospace');
    xAxisG.selectAll('line').attr('stroke', 'rgba(255, 255, 255, 0.1)');
    xAxisG.select('.domain').attr('stroke', 'rgba(255, 255, 255, 0.15)');

    // Y Axis Left (Nodes)
    if (activeSeries === 'BOTH' || activeSeries === 'NODES') {
      const yAxisNodes = d3.axisLeft(yScaleNodes).ticks(5);
      const yAxisNodesG = chartGroup.append('g').call(yAxisNodes);
      yAxisNodesG.selectAll('text').attr('fill', '#00CFFF').attr('font-size', '10px').attr('font-family', 'monospace');
      yAxisNodesG.selectAll('line').attr('stroke', 'rgba(255, 255, 255, 0.08)');
      yAxisNodesG.select('.domain').attr('stroke', 'transparent');
    }

    // Y Axis Right (Volume USDT)
    if (activeSeries === 'BOTH' || activeSeries === 'VOLUME') {
      const yAxisVolume = d3
        .axisRight(yScaleVolume)
        .ticks(5)
        .tickFormat((d) => `$${d3.format('~s')(d)}`);

      const yAxisVolumeG = chartGroup
        .append('g')
        .attr('transform', `translate(${width}, 0)`)
        .call(yAxisVolume);

      yAxisVolumeG.selectAll('text').attr('fill', '#32D583').attr('font-size', '10px').attr('font-family', 'monospace');
      yAxisVolumeG.selectAll('line').attr('stroke', 'rgba(255, 255, 255, 0.08)');
      yAxisVolumeG.select('.domain').attr('stroke', 'transparent');
    }

    // Invisible Overlay for Interactive Tooltip Hovering
    const bisect = d3.bisector<DailyNodeVolumeDataPoint, Date>((d) => new Date(d.date)).left;

    chartGroup
      .append('rect')
      .attr('width', width)
      .attr('height', height - margin.top - margin.bottom)
      .attr('fill', 'transparent')
      .on('mousemove', (event) => {
        const [xPos] = d3.pointer(event);
        const xDate = xScale.invert(xPos);
        const idx = Math.min(chartData.length - 1, Math.max(0, bisect(chartData, xDate)));
        const d = chartData[idx];
        if (d) {
          const cx = xScale(new Date(d.date)) + margin.left;
          const cy = yScaleNodes(d.cumulativeNodes) + margin.top;
          setTooltipData({ point: d, x: cx, y: cy });
        }
      })
      .on('mouseleave', () => {
        setTooltipData(null);
      });
  }, [chartData, activeSeries, timeRange]);

  return (
    <div
      ref={containerRef}
      className="p-5 rounded-2xl bg-[#07101D] border border-white/[0.08] shadow-2xl space-y-4 relative overflow-hidden"
    >
      {/* Header Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.06] pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#00CFFF]/10 border border-[#00CFFF]/30 flex items-center justify-center text-[#00CFFF]">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <span>Genesis Node Growth & Daily Transaction Volume</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#00CFFF]/15 text-[#00CFFF] border border-[#00CFFF]/30 font-bold uppercase">
                D3 Engine
              </span>
            </h3>
            <p className="text-xs text-[#98A2B3]">
              Cross-referenced visual telemetry tracking cumulative validator node activations and daily USDT ledger volume.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Series Toggle */}
          <div className="flex items-center p-0.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-xs font-mono">
            <button
              onClick={() => setActiveSeries('BOTH')}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                activeSeries === 'BOTH'
                  ? 'bg-[#00CFFF] text-[#05070B] font-bold'
                  : 'text-[#98A2B3] hover:text-white'
              }`}
            >
              All Metrics
            </button>
            <button
              onClick={() => setActiveSeries('NODES')}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                activeSeries === 'NODES'
                  ? 'bg-[#00CFFF] text-[#05070B] font-bold'
                  : 'text-[#98A2B3] hover:text-white'
              }`}
            >
              Nodes Only
            </button>
            <button
              onClick={() => setActiveSeries('VOLUME')}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                activeSeries === 'VOLUME'
                  ? 'bg-[#32D583] text-[#05070B] font-bold'
                  : 'text-[#98A2B3] hover:text-white'
              }`}
            >
              Volume Only
            </button>
          </div>

          {/* Timeframe Select */}
          <div className="flex items-center p-0.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-xs font-mono">
            {(['7D', '30D', '90D', 'ALL'] as const).map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={`px-2 py-1 rounded-md transition-colors cursor-pointer ${
                  timeRange === range
                    ? 'bg-white/20 text-white font-bold'
                    : 'text-[#98A2B3] hover:text-white'
                }`}
              >
                {range}
              </button>
            ))}
          </div>

          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={isLoading}
              className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.1] text-white flex items-center justify-center cursor-pointer"
              title="Refresh Telemetry"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-[#00CFFF] ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          )}
        </div>
      </div>

      {/* Summary KPI Badges */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-between">
          <div>
            <div className="text-[10px] text-[#98A2B3] uppercase font-mono tracking-wider">
              Total Active Nodes
            </div>
            <div className="text-lg font-bold text-[#00CFFF] font-mono">
              {latestCumulativeNodes.toLocaleString()}
            </div>
          </div>
          <Server className="w-5 h-5 text-[#00CFFF]/50" />
        </div>

        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-between">
          <div>
            <div className="text-[10px] text-[#98A2B3] uppercase font-mono tracking-wider">
              New Activations ({timeRange})
            </div>
            <div className="text-lg font-bold text-white font-mono">
              +{totalNewActivations}
            </div>
          </div>
          <TrendingUp className="w-5 h-5 text-white/50" />
        </div>

        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-between">
          <div>
            <div className="text-[10px] text-[#98A2B3] uppercase font-mono tracking-wider">
              Ledger Volume ({timeRange})
            </div>
            <div className="text-lg font-bold text-[#32D583] font-mono">
              ${totalVolumeInPeriod.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT
            </div>
          </div>
          <DollarSign className="w-5 h-5 text-[#32D583]/50" />
        </div>
      </div>

      {/* Chart Legend */}
      <div className="flex items-center gap-6 text-xs font-mono text-[#98A2B3]">
        {(activeSeries === 'BOTH' || activeSeries === 'NODES') && (
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-[#00CFFF] inline-block shadow-sm shadow-[#00CFFF]/50" />
            <span>Cumulative Nodes (Left Axis)</span>
          </div>
        )}
        {(activeSeries === 'BOTH' || activeSeries === 'VOLUME') && (
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded bg-[#32D583] inline-block shadow-sm shadow-[#32D583]/50" />
            <span>Daily Volume USDT (Right Axis)</span>
          </div>
        )}
      </div>

      {/* D3 SVG Container */}
      <div className="relative w-full overflow-hidden min-h-[360px]">
        <svg ref={svgRef} className="w-full h-[360px] overflow-visible" />

        {/* Hover Tooltip Overlay */}
        {tooltipData && (
          <div
            className="absolute z-20 pointer-events-none p-3 rounded-xl bg-[#07101D]/95 border border-[#00CFFF]/40 shadow-2xl text-xs space-y-1.5 font-mono backdrop-blur-md transition-all transform -translate-x-1/2 -translate-y-full"
            style={{
              left: `${tooltipData.x}px`,
              top: `${Math.max(20, tooltipData.y - 15)}px`,
            }}
          >
            <div className="text-white font-bold border-b border-white/[0.1] pb-1 flex items-center justify-between gap-3">
              <span>{tooltipData.point.date}</span>
              <span className="text-[10px] text-[#00CFFF]">+{tooltipData.point.newActivations} new</span>
            </div>
            <div className="text-[#00CFFF] flex items-center justify-between gap-4">
              <span>Cumulative Nodes:</span>
              <span className="font-bold">{tooltipData.point.cumulativeNodes}</span>
            </div>
            <div className="text-[#32D583] flex items-center justify-between gap-4">
              <span>Daily Volume:</span>
              <span className="font-bold">${tooltipData.point.dailyVolumeUsdt.toLocaleString()} USDT</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
