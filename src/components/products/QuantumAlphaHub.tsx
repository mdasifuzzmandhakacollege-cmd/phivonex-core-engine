import React, { useState, useEffect, useRef, useCallback } from 'react';
import { PhxGlassCard, TabularCounter } from '../ui/phivonex';
import { QuantumAlphaEmblem } from '../brand';
import {
  TrendingUp,
  ShieldCheck,
  Zap,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Clock,
  Lock,
  Unlock,
  X,
  ArrowDownLeft,
  Calendar,
  Activity,
} from 'lucide-react';

interface QuantumAlphaHubProps {
  user: any;
  onNavigateTab: (tab: string) => void;
}

interface MarketTickerQuote {
  symbol: string;
  pair: string;
  price: number;
  changePct: number;
}

interface AlphaPositionRecord {
  id: string;
  tierCode: string;
  tierName: string;
  principalAmount?: string;
  principalUsd?: string;
  status: 'ACTIVE' | 'CLOSED' | 'REDEEMED';
  activatedAt: string;
  unlockEligibleAt: string;
  isRedeemable: boolean;
  redeemedAt: string | null;
  settlementFeePct: string | null;
  settlementFeeUsd: string | null;
  netRedeemedUsd: string | null;
  totalYieldEarned?: string;
  totalYieldEarnedUsd?: string;
  lastSettledDate?: string | null;
}

const DEFAULT_MARKET_QUOTES: MarketTickerQuote[] = [
  { symbol: 'BTCUSDT', pair: 'BTC/USDT', price: 94285.4, changePct: 2.18 },
  { symbol: 'ETHUSDT', pair: 'ETH/USDT', price: 3412.75, changePct: 1.64 },
  { symbol: 'BNBUSDT', pair: 'BNB/USDT', price: 688.2, changePct: 1.12 },
  { symbol: 'SOLUSDT', pair: 'SOL/USDT', price: 214.85, changePct: 3.45 },
  { symbol: 'XRPUSDT', pair: 'XRP/USDT', price: 1.482, changePct: -0.62 },
  { symbol: 'PHIVOUSDT', pair: 'PHIVO/USDT', price: 0.1, changePct: 0.0 },
];

const TIER_PRESETS = [
  {
    code: 'ALPHA_CORE',
    name: 'Alpha Core',
    range: '$200 – $1,000 USDT',
    rateLabel: '0.35% / Day',
    defaultRate: 0.0035,
    quickAmount: '500',
    accent: 'cyan' as const,
  },
  {
    code: 'ALPHA_PRIME',
    name: 'Alpha Prime',
    range: '$1,001 – $5,000 USDT',
    rateLabel: '0.70% / Day',
    defaultRate: 0.007,
    quickAmount: '2500',
    accent: 'cyan' as const,
  },
  {
    code: 'ALPHA_SOVEREIGN',
    name: 'Alpha Sovereign',
    range: '$5,001+ USDT',
    rateLabel: '0.95% / Day',
    defaultRate: 0.0095,
    quickAmount: '5500',
    accent: 'gold' as const,
  },
];

function formatMarketPrice(price: number): string {
  if (price >= 1000) {
    return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (price >= 1) {
    return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  }
  return price.toFixed(4);
}

function formatUtcDateShort(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
}

function formatRemainingCountdown(unlockIso: string, nowMs: number): string {
  const diffMs = new Date(unlockIso).getTime() - nowMs;
  if (diffMs <= 0) return 'Unlocked';
  const totalMinutes = Math.ceil(diffMs / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const mins = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export const QuantumAlphaHub: React.FC<QuantumAlphaHubProps> = () => {
  const [overview, setOverview] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [investing, setInvesting] = useState(false);
  const [amountInput, setAmountInput] = useState<string>('500');
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [subscriptionsEnabled, setSubscriptionsEnabled] = useState<boolean>(true);
  const [marketQuotes, setMarketQuotes] = useState<MarketTickerQuote[]>(DEFAULT_MARKET_QUOTES);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  // Post-7-Day Principal Redemption Settlement Breakdown Modal State
  const [redeemModalPos, setRedeemModalPos] = useState<AlphaPositionRecord | null>(null);
  const [redeeming, setRedeeming] = useState(false);
  const [redeemModalError, setRedeemModalError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameId = useRef<number | null>(null);
  const isVisibleRef = useRef<boolean>(true);

  const fetchOverview = useCallback(async () => {
    try {
      const [res, cfgRes] = await Promise.all([
        fetch('/api/trading-pool/overview', { credentials: 'include' }),
        fetch('/api/public/ecosystem-config'),
      ]);
      const data = await res.json();
      if (data.success || data.overview) {
        setOverview(data.overview || data);
      }
      if (cfgRes.ok) {
        const cfgData = await cfgRes.json();
        if (
          cfgData?.featureSwitches &&
          typeof cfgData.featureSwitches.quantum_alpha_subscriptions_enabled === 'boolean'
        ) {
          setSubscriptionsEnabled(cfgData.featureSwitches.quantum_alpha_subscriptions_enabled);
        }
      }
    } catch (err) {
      console.warn('Failed to load Quantum Alpha overview:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  // Tick every 30s so 7-day cycle countdowns stay accurate in real time
  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  // Poll live Binance 24h market prices every 15s (graceful fallback on network blocks)
  useEffect(() => {
    let cancelled = false;

    const fetchBinanceQuotes = async () => {
      try {
        const symbols = encodeURIComponent(
          JSON.stringify(['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT'])
        );
        const res = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbols=${symbols}`);
        if (!res.ok) throw new Error('Binance feed unavailable');
        const rows = await res.json();
        if (!Array.isArray(rows) || cancelled) return;

        const pairMap: Record<string, string> = {
          BTCUSDT: 'BTC/USDT',
          ETHUSDT: 'ETH/USDT',
          BNBUSDT: 'BNB/USDT',
          SOLUSDT: 'SOL/USDT',
          XRPUSDT: 'XRP/USDT',
        };

        const mapped: MarketTickerQuote[] = rows
          .filter((r: any) => pairMap[r.symbol])
          .map((r: any) => ({
            symbol: r.symbol,
            pair: pairMap[r.symbol],
            price: parseFloat(r.lastPrice) || 0,
            changePct: parseFloat(r.priceChangePercent) || 0,
          }));

        if (mapped.length > 0 && !cancelled) {
          mapped.push({
            symbol: 'PHIVOUSDT',
            pair: 'PHIVO/USDT',
            price: 0.1,
            changePct: 0.0,
          });
          setMarketQuotes(mapped);
        }
      } catch {
        // Maintain smooth simulated micro-ticks around fallback reference prices if public endpoint is blocked
        if (!cancelled) {
          setMarketQuotes((prev) =>
            prev.map((q) => {
              if (q.symbol === 'PHIVOUSDT') return q;
              const delta = (Math.random() - 0.49) * 0.0012;
              return {
                ...q,
                price: Number((q.price * (1 + delta)).toFixed(q.price >= 100 ? 2 : 4)),
              };
            })
          );
        }
      }
    };

    fetchBinanceQuotes();
    const interval = window.setInterval(fetchBinanceQuotes, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  // Crisp Dual-Wave Execution Pulse Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let step = 0;

    const render = () => {
      if (!isVisibleRef.current) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const width = canvas.width;
      const height = canvas.height;

      ctx.strokeStyle = 'rgba(0, 229, 255, 0.045)';
      ctx.lineWidth = 1;
      for (let x = 0; x < width; x += 48) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += 36) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.strokeStyle = 'rgba(0, 229, 255, 0.55)';
      ctx.lineWidth = 2;
      for (let i = 0; i < width; i++) {
        const y =
          height * 0.54 +
          Math.sin(i * 0.014 + step) * 22 +
          Math.cos(i * 0.007 + step * 0.6) * 12;
        if (i === 0) ctx.moveTo(i, y);
        else ctx.lineTo(i, y);
      }
      ctx.stroke();

      ctx.beginPath();
      ctx.strokeStyle = 'rgba(245, 184, 0, 0.45)';
      ctx.lineWidth = 1.75;
      for (let i = 0; i < width; i++) {
        const y =
          height * 0.56 +
          Math.cos(i * 0.019 - step * 0.9) * 18 +
          Math.sin(i * 0.01 + step * 0.7) * 10;
        if (i === 0) ctx.moveTo(i, y);
        else ctx.lineTo(i, y);
      }
      ctx.stroke();

      step += 0.025;
      animationFrameId.current = requestAnimationFrame(render);
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        isVisibleRef.current = entry.isIntersecting;
        if (entry.isIntersecting && !animationFrameId.current) {
          render();
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(canvas);
    render();

    return () => {
      observer.disconnect();
      if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
    };
  }, []);

  const now = new Date();
  const dayOfWeek = now.getUTCDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  const numericAmount = parseFloat(amountInput) || 0;
  const currentTier =
    numericAmount >= 5001
      ? 'ALPHA_SOVEREIGN'
      : numericAmount >= 1001
      ? 'ALPHA_PRIME'
      : 'ALPHA_CORE';

  const activeTierPreset = TIER_PRESETS.find((t) => t.code === currentTier) || TIER_PRESETS[0];
  const estimatedDaily = numericAmount * activeTierPreset.defaultRate;
  const estimatedWeekly = estimatedDaily * 5;

  const allPositions: AlphaPositionRecord[] = overview?.allPositions || overview?.activePositions || [];
  const activePositions = allPositions.filter((p) => p.status === 'ACTIVE');
  const redeemedPositions = allPositions.filter((p) => p.status === 'REDEEMED');
  const totalActivePrincipal = parseFloat(overview?.userSummary?.totalActivePrincipalUsd || '0');
  const totalEarnedYield = parseFloat(
    overview?.userSummary?.totalLifetimeYieldUsd || overview?.userSummary?.totalYieldEarnedUsd || '0'
  );

  // Dynamic admin-configurable total settlement fee % (default 15.00%)
  const alphaRedemptionFeePct = parseFloat(overview?.alphaRedemptionFeePct || '15.0000');
  const safeFeePct = Number.isFinite(alphaRedemptionFeePct) ? alphaRedemptionFeePct : 15;
  const exitFeePct = safeFeePct * 0.5;
  const clearingFeePct = safeFeePct * 0.3;
  const custodyFeePct = safeFeePct * 0.2;
  const netReturnPct = Math.max(0, 100 - safeFeePct);

  const handleInvest = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (numericAmount < 200) {
      setErrorMsg('Minimum capital allocation for PHIVONEX QUANTUM ALPHA™ is $200.00 USDT.');
      return;
    }

    setInvesting(true);
    try {
      const res = await fetch('/api/trading-pool/invest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountUsd: numericAmount, tierCode: currentTier }),
        credentials: 'include',
      });
      const data = await res.json();
      if (res.ok && (data.success || data.positionId)) {
        setSuccessMsg(
          `Allocated $${numericAmount.toFixed(2)} USDT into PHIVONEX QUANTUM ALPHA™ (${activeTierPreset.name}). Your 7-day weekly liquidity cycle is now active.`
        );
        await fetchOverview();
      } else {
        setErrorMsg(
          data.message || data.error || 'Capital allocation failed. Please verify your Main USDT Wallet balance.'
        );
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Network error while executing Quantum Alpha allocation.');
    } finally {
      setInvesting(false);
    }
  };

  const handleConfirmRedemption = async () => {
    if (!redeemModalPos) return;
    setRedeeming(true);
    setRedeemModalError(null);

    try {
      const idempotencyKey = `alpha-redeem-${redeemModalPos.id}-${Date.now()}`;
      const res = await fetch('/api/trading-pool/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          positionId: redeemModalPos.id,
          idempotencyKey,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setRedeemModalError(data.message || data.error || 'Unable to process principal redemption.');
        return;
      }

      const netCredited = parseFloat(data.netPayoutUsd || '0').toFixed(2);
      setSuccessMsg(
        `Principal redemption settled. $${netCredited} USDT has been credited directly to your Main USDT Wallet.`
      );
      setRedeemModalPos(null);
      await fetchOverview();
    } catch (err: any) {
      setRedeemModalError(err?.message || 'Network error during principal redemption.');
    } finally {
      setRedeeming(false);
    }
  };

  const modalPrincipal = redeemModalPos
    ? parseFloat(redeemModalPos.principalAmount || redeemModalPos.principalUsd || '0') || 0
    : 0;
  const modalExitFeeUsd = modalPrincipal * (exitFeePct / 100);
  const modalClearingFeeUsd = modalPrincipal * (clearingFeePct / 100);
  const modalCustodyFeeUsd = modalPrincipal * (custodyFeePct / 100);
  const modalTotalFeeUsd = modalPrincipal * (safeFeePct / 100);
  const modalNetPayoutUsd = Math.max(0, modalPrincipal - modalTotalFeeUsd);

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Hero Banner with 60fps Live Market Ticker Flowing Behind & Into ACTIVE TIER Badge */}
      <div className="relative rounded-[28px] overflow-hidden bg-gradient-to-br from-[#050807] via-[#09131C] to-[#050807] border border-white/10 shadow-2xl">
        {/* Background Canvas Pulse Wave */}
        <div className="absolute inset-0 opacity-45 pointer-events-none">
          <canvas ref={canvasRef} width={920} height={260} className="w-full h-full object-cover" />
        </div>

        {/* Top Live Binance-Pro 60fps Scrolling Market Feed Ribbon */}
        <div className="relative z-10 border-b border-white/10 bg-[#050807]/85 backdrop-blur-md overflow-hidden py-2.5">
          <div className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-[#050807] to-transparent z-10" />
          <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-[#050807] to-transparent z-10" />

          <div className="animate-phx-ticker flex items-center gap-6 px-4">
            {[...marketQuotes, ...marketQuotes].map((quote, idx) => {
              const isPos = quote.changePct >= 0;
              return (
                <div
                  key={`${quote.symbol}-${idx}`}
                  className="flex items-center gap-2.5 shrink-0 font-mono text-xs tabular-nums"
                >
                  <span className="font-bold text-white tracking-tight">{quote.pair}</span>
                  <span className="text-slate-200 font-semibold">${formatMarketPrice(quote.price)}</span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      quote.symbol === 'PHIVOUSDT'
                        ? 'bg-[#F5B800]/15 text-[#F5B800]'
                        : isPos
                        ? 'bg-[#00E676]/15 text-[#00E676]'
                        : 'bg-[#F04438]/15 text-[#F04438]'
                    }`}
                  >
                    {quote.symbol === 'PHIVOUSDT'
                      ? 'REF'
                      : `${isPos ? '+' : ''}${quote.changePct.toFixed(2)}%`}
                  </span>
                  <span className="text-white/15 ml-2">|</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Hero Main Content */}
        <div className="relative z-10 p-6 sm:p-8">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
            <div className="space-y-3 max-w-2xl">
              <div className="flex flex-wrap items-center gap-2.5">
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-mono font-bold tracking-wider uppercase border ${
                    isWeekend
                      ? 'bg-[#F5B800]/15 text-[#F5B800] border-[#F5B800]/35'
                      : 'bg-[#00E676]/15 text-[#00E676] border-[#00E676]/35 shadow-[0_0_14px_rgba(0,230,118,0.3)]'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      isWeekend ? 'bg-[#F5B800]' : 'bg-[#00E676] animate-ping'
                    }`}
                  />
                  {isWeekend ? 'WEEKEND SETTLEMENT WINDOW' : 'LIVE TRADING SESSION (MON–FRI)'}
                </span>
                <span className="text-[11px] font-mono text-[#00E5FF] px-2.5 py-1 rounded-lg bg-[#00E5FF]/10 border border-[#00E5FF]/25">
                  7-DAY WEEKLY LIQUIDITY CYCLE
                </span>
              </div>

              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                PHIVONEX QUANTUM ALPHA™
              </h1>

              <p className="text-xs sm:text-sm text-[#98A2B3] leading-relaxed">
                Institutional multi-venue liquidity protocol delivering structured Monday–Friday trading returns with real-time order-book execution, disciplined risk controls, and flexible weekly principal liquidity.
              </p>
            </div>

            {/* ACTIVE TIER Badge with Live Data Stream Glow Passing Behind */}
            <div className="relative shrink-0 w-full lg:w-auto">
              <div className="relative overflow-hidden rounded-2xl bg-[#050807]/90 backdrop-blur-xl border border-[#00E5FF]/30 p-4 shadow-[0_0_32px_rgba(0,229,255,0.12)]">
                {/* Ambient ticker-wave stream passing behind Active Tier */}
                <div className="pointer-events-none absolute inset-x-0 bottom-1 overflow-hidden opacity-20">
                  <div className="animate-phx-ticker flex items-center gap-4 text-[9px] font-mono text-[#00E5FF]">
                    {[...marketQuotes, ...marketQuotes].map((q, i) => (
                      <span key={`stream-${i}`} className="shrink-0">
                        {q.pair} ${formatMarketPrice(q.price)}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="relative z-10 flex items-center gap-4">
                  <QuantumAlphaEmblem tier={currentTier} size={62} />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-[#98A2B3] uppercase tracking-widest">
                        Active Tier
                      </span>
                      <span className="w-1.5 h-1.5 rounded-full bg-[#00E676] animate-pulse" />
                    </div>
                    <h3 className="text-base font-extrabold text-white mt-0.5">{activeTierPreset.name}</h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs font-mono font-bold text-[#00E5FF]">
                        {activeTierPreset.rateLabel}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400">Mon–Fri</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Institutional Telemetry Strip */}
          <div className="mt-6 pt-6 border-t border-white/10 grid grid-cols-2 lg:grid-cols-4 gap-3 font-mono">
            <div className="p-3.5 rounded-xl bg-[#050807]/80 border border-white/10">
              <span className="text-[10px] text-[#98A2B3] block uppercase">Your Active Capital</span>
              <div className="text-sm sm:text-base font-bold text-white tabular-nums mt-1">
                $<TabularCounter value={totalActivePrincipal} decimals={2} />{' '}
                <span className="text-[10px] text-[#00E5FF]">USDT</span>
              </div>
            </div>
            <div className="p-3.5 rounded-xl bg-[#050807]/80 border border-white/10">
              <span className="text-[10px] text-[#98A2B3] block uppercase">Cumulative Alpha Yield</span>
              <div className="text-sm sm:text-base font-bold text-[#00E676] tabular-nums mt-1">
                +$<TabularCounter value={totalEarnedYield} decimals={2} />
              </div>
            </div>
            <div className="p-3.5 rounded-xl bg-[#050807]/80 border border-white/10">
              <span className="text-[10px] text-[#98A2B3] block uppercase">Liquidity Cycle</span>
              <div className="text-sm sm:text-base font-bold text-[#F5B800] mt-1">7 Days (Weekly)</div>
            </div>
            <div className="p-3.5 rounded-xl bg-[#050807]/80 border border-white/10">
              <span className="text-[10px] text-[#98A2B3] block uppercase">Execution Schedule</span>
              <div className="text-sm sm:text-base font-bold text-[#00E5FF] mt-1">Mon–Fri UTC</div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid: Clean Allocation Console & Interactive Tier Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7">
          <PhxGlassCard accent={activeTierPreset.accent}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
              <div>
                <h2 className="text-lg font-extrabold text-white flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-[#00E5FF]" />
                  <span>Capital Allocation Console</span>
                </h2>
                <p className="text-xs text-[#98A2B3] mt-0.5">
                  7-Day Weekly Liquidity Cycle • Principal Redeemable After 7 Days
                </p>
              </div>
              <div className="text-left sm:text-right px-3 py-1.5 rounded-xl bg-[#050807]/80 border border-white/10">
                <span className="text-[10px] font-mono text-[#98A2B3] uppercase block">Min Allocation</span>
                <span className="text-xs font-mono text-white font-bold">$200.00 USDT</span>
              </div>
            </div>

            {!subscriptionsEnabled && (
              <div className="mb-4 p-4 rounded-xl bg-[#F5B800]/10 border border-[#F5B800]/35 text-xs text-[#F5B800] flex items-center gap-3">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <div>
                  <div className="font-mono font-bold uppercase tracking-wider">
                    Module Temporarily Paused by Protocol Governance
                  </div>
                  <p className="text-[#98A2B3] mt-0.5">
                    New Quantum Alpha™ allocations are temporarily paused. Existing active positions continue operating normally.
                  </p>
                </div>
              </div>
            )}

            {errorMsg && (
              <div className="mb-4 p-3.5 rounded-xl bg-[#F04438]/10 border border-[#F04438]/35 text-xs text-[#FF8A80] flex items-center gap-2.5">
                <AlertCircle className="w-4 h-4 text-[#F04438] shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {successMsg && (
              <div className="mb-4 p-3.5 rounded-xl bg-[#00E676]/10 border border-[#00E676]/35 text-xs text-[#69F0AE] flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-[#00E676] shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}

            <form onSubmit={handleInvest} className="space-y-5">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-mono text-[#98A2B3] uppercase">Allocation Amount (USDT)</label>
                  <span className="text-xs font-mono text-[#00E676] font-semibold">
                    100% Deployed • Instant Activation
                  </span>
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-white/50 font-mono text-lg">
                    $
                  </div>
                  <input
                    type="number"
                    min="200"
                    step="1"
                    value={amountInput}
                    onChange={(e) => setAmountInput(e.target.value)}
                    className="w-full pl-9 pr-16 py-3.5 rounded-xl bg-[#050807] border border-white/15 text-white font-mono text-xl font-extrabold tabular-nums focus:outline-none focus:border-[#00E5FF] transition-colors"
                    placeholder="500"
                    required
                  />
                  <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none text-xs font-mono text-[#98A2B3] font-bold">
                    USDT
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2">
                {['200', '1000', '2500', '5500'].map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setAmountInput(val)}
                    className={`py-2.5 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer border ${
                      numericAmount === parseFloat(val)
                        ? 'bg-[#00E5FF]/20 text-[#00E5FF] border-[#00E5FF]'
                        : 'bg-white/[0.03] text-[#98A2B3] border-white/[0.08] hover:bg-white/[0.06] hover:text-white'
                    }`}
                  >
                    ${Number(val).toLocaleString()}
                  </button>
                ))}
              </div>

              <div className="p-4 rounded-xl bg-[#050807]/75 border border-white/10 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <span className="text-[10px] font-mono text-[#98A2B3] uppercase block">Selected Tier</span>
                  <div className="text-sm font-extrabold text-white mt-1">{activeTierPreset.name}</div>
                  <span className="text-[10px] font-mono text-[#00E5FF]">{activeTierPreset.rateLabel}</span>
                </div>
                <div>
                  <span className="text-[10px] font-mono text-[#98A2B3] uppercase block">Est. Daily Session</span>
                  <div className="text-base font-extrabold font-mono text-[#00E676] tabular-nums mt-1">
                    +<TabularCounter value={estimatedDaily} decimals={2} prefix="$" />
                  </div>
                  <span className="text-[10px] font-mono text-slate-400">Credited Mon–Fri</span>
                </div>
                <div>
                  <span className="text-[10px] font-mono text-[#98A2B3] uppercase block">Est. Weekly (5 Days)</span>
                  <div className="text-base font-extrabold font-mono text-[#F5B800] tabular-nums mt-1">
                    +<TabularCounter value={estimatedWeekly} decimals={2} prefix="$" />
                  </div>
                  <span className="text-[10px] font-mono text-slate-400">Main USDT Wallet</span>
                </div>
              </div>

              <button
                type="submit"
                disabled={investing || !subscriptionsEnabled}
                className="w-full py-4 px-6 rounded-xl bg-gradient-to-r from-[#00E5FF] to-[#168BFF] hover:from-[#1eeaff] hover:to-[#2b95ff] text-[#050807] font-extrabold text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-lg shadow-[#00E5FF]/20 cursor-pointer disabled:opacity-50"
              >
                {!subscriptionsEnabled ? (
                  <span>Module Temporarily Paused by Protocol Governance</span>
                ) : investing ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Allocating Liquidity Capital...</span>
                  </>
                ) : (
                  <>
                    <span>Activate Quantum Alpha Allocation</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          </PhxGlassCard>
        </div>

        {/* Right Column: Interactive Tier Architecture & Cycle Rules */}
        <div className="lg:col-span-5 space-y-6">
          <PhxGlassCard>
            <h3 className="text-sm font-extrabold text-white mb-4 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#F5B800]" />
              <span>Interactive Tier Architecture</span>
            </h3>
            <div className="space-y-3">
              {TIER_PRESETS.map((tier) => {
                const isSelected = currentTier === tier.code;
                const isGold = tier.accent === 'gold';
                return (
                  <button
                    key={tier.code}
                    type="button"
                    onClick={() => setAmountInput(tier.quickAmount)}
                    className={`w-full text-left p-3.5 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? isGold
                          ? 'bg-[#F5B800]/12 border-[#F5B800] shadow-[0_0_16px_rgba(245,184,0,0.12)]'
                          : 'bg-[#00E5FF]/12 border-[#00E5FF] shadow-[0_0_16px_rgba(0,229,255,0.12)]'
                        : 'bg-white/[0.02] border-white/[0.08] hover:border-white/20 hover:bg-white/[0.04]'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs font-bold text-white mb-1">
                      <span className="flex items-center gap-2">
                        <span>{tier.name}</span>
                        {isSelected && (
                          <span
                            className={`text-[9px] font-mono uppercase px-1.5 py-0.5 rounded ${
                              isGold ? 'bg-[#F5B800]/20 text-[#F5B800]' : 'bg-[#00E5FF]/20 text-[#00E5FF]'
                            }`}
                          >
                            Selected
                          </span>
                        )}
                      </span>
                      <span className={`font-mono font-bold ${isGold ? 'text-[#F5B800]' : 'text-[#00E5FF]'}`}>
                        {tier.rateLabel}
                      </span>
                    </div>
                    <p className="text-[11px] font-mono text-[#98A2B3]">{tier.range}</p>
                  </button>
                );
              })}
            </div>
          </PhxGlassCard>

          <PhxGlassCard>
            <h3 className="text-sm font-extrabold text-white mb-3 flex items-center gap-2">
              <Zap className="w-4 h-4 text-[#00E676]" />
              <span>Liquidity Protocol Highlights</span>
            </h3>
            <ul className="space-y-2.5 text-xs text-[#98A2B3]">
              <li className="flex items-start gap-2.5">
                <div className="w-1.5 h-1.5 rounded-full bg-[#00E676] mt-1.5 shrink-0" />
                <span>
                  <strong className="text-white">7-Day Weekly Liquidity Cycle</strong> — Each capital allocation completes a 7-day liquidity cycle, after which principal becomes eligible for direct redemption.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <div className="w-1.5 h-1.5 rounded-full bg-[#00E5FF] mt-1.5 shrink-0" />
                <span>
                  <strong className="text-white">Monday–Friday Trading Yield</strong> — Daily session returns settle directly into your Main USDT Wallet across five weekly market sessions.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <div className="w-1.5 h-1.5 rounded-full bg-[#F5B800] mt-1.5 shrink-0" />
                <span>
                  <strong className="text-white">100% Active Capital Allocation</strong> — Full deposited principal enters institutional multi-venue execution immediately upon activation.
                </span>
              </li>
            </ul>
          </PhxGlassCard>
        </div>
      </div>

      {/* Active & Settled Quantum Alpha Positions */}
      <PhxGlassCard accent="cyan">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
          <div>
            <h2 className="text-lg font-extrabold text-white flex items-center gap-2">
              <Activity className="w-5 h-5 text-[#00E5FF]" />
              <span>Active &amp; Redeemed Quantum Alpha Positions</span>
            </h2>
            <p className="text-xs text-[#98A2B3] mt-0.5">
              Track your 7-day weekly cycle countdowns, cumulative trading yield, and eligible principal redemptions.
            </p>
          </div>
          <div className="flex items-center gap-2 font-mono text-[11px]">
            <span className="px-2.5 py-1 rounded-lg bg-[#00E676]/12 text-[#00E676] border border-[#00E676]/30">
              {activePositions.length} Active
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-white/[0.05] text-slate-300 border border-white/10">
              {redeemedPositions.length} Redeemed
            </span>
          </div>
        </div>

        {loading ? (
          <div className="py-12 flex items-center justify-center">
            <Loader2 className="w-7 h-7 animate-spin text-[#00E5FF]" />
          </div>
        ) : allPositions.length === 0 ? (
          <div className="py-12 text-center rounded-2xl bg-[#050807]/70 border border-white/8">
            <TrendingUp className="w-10 h-10 text-white/20 mx-auto mb-3" />
            <h3 className="text-sm font-bold text-white">No Quantum Alpha Positions Yet</h3>
            <p className="text-xs text-[#98A2B3] mt-1 max-w-md mx-auto">
              Allocate at least $200.00 USDT above to initiate your first 7-day weekly liquidity cycle and earn Monday–Friday trading session returns.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {allPositions.map((pos) => {
              const unlockMs = new Date(pos.unlockEligibleAt).getTime();
              const isUnlocked = pos.status === 'ACTIVE' && (pos.isRedeemable || nowMs >= unlockMs);
              const isRedeemed = pos.status === 'REDEEMED';
              const principalVal = parseFloat(pos.principalAmount || pos.principalUsd || '0');
              const yieldVal = parseFloat(pos.totalYieldEarned || pos.totalYieldEarnedUsd || '0');
              const countdownText = formatRemainingCountdown(pos.unlockEligibleAt, nowMs);

              return (
                <div
                  key={pos.id}
                  className={`p-4 sm:p-5 rounded-2xl border transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-4 ${
                    isRedeemed
                      ? 'bg-[#050807]/60 border-white/8 opacity-85'
                      : isUnlocked
                      ? 'bg-[#07131A]/90 border-[#00E676]/35'
                      : 'bg-[#050807]/85 border-white/10'
                  }`}
                >
                  <div className="flex items-start sm:items-center gap-4">
                    <QuantumAlphaEmblem tier={pos.tierCode as any} size={46} />
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-extrabold text-white">{pos.tierName}</span>
                        {isRedeemed ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-slate-500/20 text-slate-300 border border-slate-500/30">
                            REDEEMED
                          </span>
                        ) : isUnlocked ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-[#00E676]/15 text-[#00E676] border border-[#00E676]/35">
                            <Unlock className="w-3 h-3" />
                            Weekly Cycle Complete • Redeemable
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-[#F5B800]/15 text-[#F5B800] border border-[#F5B800]/35">
                            <Lock className="w-3 h-3" />
                            Weekly Cycle Locked • Unlocks in {countdownText}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-mono text-[#98A2B3]">
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-slate-500" />
                          Activated: {formatUtcDateShort(pos.activatedAt)}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-500" />
                          {isRedeemed && pos.redeemedAt
                            ? `Redeemed: ${formatUtcDateShort(pos.redeemedAt)}`
                            : `Unlock Date: ${formatUtcDateShort(pos.unlockEligibleAt)}`}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap sm:flex-nowrap items-center justify-between lg:justify-end gap-5 pt-3 lg:pt-0 border-t lg:border-t-0 border-white/8">
                    <div className="flex items-center gap-5 font-mono tabular-nums">
                      <div>
                        <span className="text-[10px] text-[#98A2B3] uppercase block">Principal</span>
                        <span className="text-sm font-bold text-white">
                          ${principalVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-[#98A2B3] uppercase block">Yield Earned</span>
                        <span className="text-sm font-bold text-[#00E676]">
                          +${yieldVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                      {isRedeemed && pos.netRedeemedUsd && (
                        <div>
                          <span className="text-[10px] text-[#98A2B3] uppercase block">Net Settled</span>
                          <span className="text-sm font-bold text-[#00E5FF]">
                            ${parseFloat(pos.netRedeemedUsd).toFixed(2)}
                          </span>
                        </div>
                      )}
                    </div>

                    {!isRedeemed && (
                      <button
                        type="button"
                        disabled={!isUnlocked}
                        onClick={() => {
                          setRedeemModalError(null);
                          setRedeemModalPos(pos);
                        }}
                        className={`px-4 py-2.5 rounded-xl text-xs font-extrabold uppercase tracking-wider flex items-center gap-1.5 transition-all shrink-0 ${
                          isUnlocked
                            ? 'bg-gradient-to-r from-[#F5B800] to-[#FF9D00] text-[#050807] hover:brightness-110 shadow-lg shadow-[#F5B800]/20 cursor-pointer'
                            : 'bg-white/[0.04] text-slate-500 border border-white/10 cursor-not-allowed'
                        }`}
                      >
                        <ArrowDownLeft className="w-3.5 h-3.5" />
                        <span>{isUnlocked ? 'Redeem Principal' : `Locked (${countdownText})`}</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </PhxGlassCard>

      {/* Post-7-Day Principal Redemption Settlement Breakdown Modal */}
      {redeemModalPos && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div className="w-full max-w-lg rounded-3xl bg-[#071018] border border-[#F5B800]/40 shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-white/10 flex items-start justify-between gap-4 bg-gradient-to-r from-[#F5B800]/10 to-transparent">
              <div>
                <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#F5B800]">
                  QUANTUM ALPHA™ LIQUIDITY EXIT
                </span>
                <h3 className="text-lg font-extrabold text-white mt-1">
                  Principal Redemption Settlement Breakdown
                </h3>
              </div>
              <button
                type="button"
                onClick={() => !redeeming && setRedeemModalPos(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div className="p-4 rounded-2xl bg-[#050807] border border-white/10 flex items-center justify-between font-mono">
                <div>
                  <span className="text-[10px] text-[#98A2B3] uppercase block">Original Principal</span>
                  <span className="text-lg font-extrabold text-white tabular-nums">
                    ${modalPrincipal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-[#98A2B3] uppercase block">Tier</span>
                  <span className="text-xs font-bold text-[#00E5FF]">{redeemModalPos.tierName}</span>
                </div>
              </div>

              {/* Itemized Institutional Settlement Breakdown */}
              <div className="rounded-2xl bg-[#050807]/90 border border-white/10 p-4 space-y-3 text-xs font-mono tabular-nums">
                <div className="text-[10px] uppercase tracking-wider text-[#98A2B3] pb-2 border-b border-white/10">
                  Institutional Settlement Fee Breakdown
                </div>

                <div className="flex items-center justify-between text-slate-300">
                  <span>Liquidity Pool Exit &amp; Settlement Fee ({exitFeePct.toFixed(2)}%)</span>
                  <span className="text-[#FF8A80]">-${modalExitFeeUsd.toFixed(2)} USDT</span>
                </div>

                <div className="flex items-center justify-between text-slate-300">
                  <span>Institutional Execution &amp; Clearing Fee ({clearingFeePct.toFixed(2)}%)</span>
                  <span className="text-[#FF8A80]">-${modalClearingFeeUsd.toFixed(2)} USDT</span>
                </div>

                <div className="flex items-center justify-between text-slate-300">
                  <span>Network Custody &amp; Reserve Fee ({custodyFeePct.toFixed(2)}%)</span>
                  <span className="text-[#FF8A80]">-${modalCustodyFeeUsd.toFixed(2)} USDT</span>
                </div>

                <div className="flex items-center justify-between pt-2.5 border-t border-white/10 font-bold text-[#F5B800]">
                  <span>Total Settlement Deduction ({safeFeePct.toFixed(2)}%)</span>
                  <span>-${modalTotalFeeUsd.toFixed(2)} USDT</span>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-white/15 text-sm font-extrabold text-[#00E676]">
                  <span>Net Principal Credited ({netReturnPct.toFixed(2)}%)</span>
                  <span>${modalNetPayoutUsd.toFixed(2)} USDT</span>
                </div>
              </div>

              <p className="text-[11px] text-[#98A2B3] leading-relaxed">
                Upon confirmation, this Quantum Alpha™ position will be closed and{' '}
                <strong className="text-white">${modalNetPayoutUsd.toFixed(2)} USDT</strong> will be credited immediately to your Main USDT Wallet. Previously earned trading yields remain untouched in your wallet.
              </p>

              {redeemModalError && (
                <div className="p-3 rounded-xl bg-[#F04438]/12 border border-[#F04438]/40 text-xs text-[#FF8A80] flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-[#F04438] shrink-0" />
                  <span>{redeemModalError}</span>
                </div>
              )}

              <div className="flex items-center gap-3 pt-1">
                <button
                  type="button"
                  disabled={redeeming}
                  onClick={() => setRedeemModalPos(null)}
                  className="flex-1 py-3 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/15 text-xs font-bold text-white cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={redeeming}
                  onClick={handleConfirmRedemption}
                  className="flex-1 py-3 rounded-xl bg-gradient-to-r from-[#F5B800] to-[#FF9D00] text-[#050807] font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 shadow-lg shadow-[#F5B800]/20"
                >
                  {redeeming ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Settling...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Confirm Principal Redemption</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
