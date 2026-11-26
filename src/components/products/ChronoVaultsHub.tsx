import React, { useState, useEffect, useCallback } from 'react';
import { PhxGlassCard, TabularCounter } from '../ui/phivonex';
import { ChronoVaultEmblem } from '../brand';
import {
  Clock,
  ShieldCheck,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Lock,
  Calendar,
  X,
  FileCheck2,
  Layers,
} from 'lucide-react';

interface ChronoVaultsHubProps {
  user: any;
  onNavigateTab: (tab: string) => void;
}

interface VaultPlanView {
  code: string;
  name: string;
  durationDays: number;
  dailyRate: number;
  minAmount: number;
  accent: string;
  termBadge: string;
  isActive: boolean;
}

interface VaultPositionRecord {
  id: string;
  planCode: string;
  planName: string;
  principalAmount?: string;
  principalUsd?: string;
  dailyRatePctSnapshot: string;
  durationDays?: number;
  durationDaysSnapshot?: number;
  status: 'ACTIVE' | 'MATURED' | string;
  activatedAt: string;
  maturityAt: string;
  totalYieldEarned?: string;
  totalYieldPaidUsd?: string;
  progressPct?: string;
  principalReturnedAt?: string | null;
}

const DEFAULT_VAULT_PLANS: VaultPlanView[] = [
  {
    code: 'CHRONO_200D',
    name: 'Chrono Bronze Vault',
    durationDays: 200,
    dailyRate: 0.35,
    minAmount: 100,
    accent: '#CD7F32',
    termBadge: '200D',
    isActive: true,
  },
  {
    code: 'CHRONO_1Y',
    name: 'Chrono Silver Vault',
    durationDays: 365,
    dailyRate: 0.45,
    minAmount: 100,
    accent: '#C0C0C0',
    termBadge: '1Y',
    isActive: true,
  },
  {
    code: 'CHRONO_2Y',
    name: 'Chrono Cyan Vault',
    durationDays: 730,
    dailyRate: 0.55,
    minAmount: 100,
    accent: '#00E5FF',
    termBadge: '2Y',
    isActive: true,
  },
  {
    code: 'CHRONO_5Y',
    name: 'Chrono Gold Vault',
    durationDays: 1825,
    dailyRate: 0.65,
    minAmount: 100,
    accent: '#F5B800',
    termBadge: '5Y',
    isActive: true,
  },
  {
    code: 'CHRONO_10Y',
    name: 'Chrono Sovereign Vault',
    durationDays: 3650,
    dailyRate: 0.8,
    minAmount: 100,
    accent: '#7057FF',
    termBadge: '10Y',
    isActive: true,
  },
];

function computeExactMaturityUtcDate(durationDays: number): string {
  const targetMs = Date.now() + durationDays * 24 * 60 * 60 * 1000;
  return new Date(targetMs).toISOString().slice(0, 10) + ' UTC';
}

function formatIsoDateUtc(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().slice(0, 10) + ' UTC';
}

function computeLockProgressPct(activatedAt: string, maturityAt: string): number {
  const start = new Date(activatedAt).getTime();
  const end = new Date(maturityAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  const elapsed = Math.max(0, Date.now() - start);
  return Math.min(100, (elapsed / (end - start)) * 100);
}

export const ChronoVaultsHub: React.FC<ChronoVaultsHubProps> = () => {
  const [selectedPlanCode, setSelectedPlanCode] = useState<string>('CHRONO_5Y');
  const [amountInput, setAmountInput] = useState<string>('1000');
  const [overview, setOverview] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [vaultSubscriptionsEnabled, setVaultSubscriptionsEnabled] = useState<boolean>(true);

  // Mandatory Chrono Vault Subscription Terms & Conditions Modal
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const fetchOverview = useCallback(async () => {
    try {
      const [res, cfgRes] = await Promise.all([
        fetch('/api/chrono-vaults/overview', { credentials: 'include' }),
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
          typeof cfgData.featureSwitches.chrono_vaults_subscriptions_enabled === 'boolean'
        ) {
          setVaultSubscriptionsEnabled(cfgData.featureSwitches.chrono_vaults_subscriptions_enabled);
        }
      }
    } catch (err) {
      console.warn('Failed to load Chrono Vaults overview:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  // Merge dynamic admin plan configs from backend over defaults
  const serverPlans: any[] = overview?.activePlans || overview?.plans || [];
  const vaultPlans: VaultPlanView[] = DEFAULT_VAULT_PLANS.map((def) => {
    const match = serverPlans.find((sp) => sp.planCode === def.code);
    if (!match) return def;
    return {
      ...def,
      name: match.planName || def.name,
      durationDays: Number(match.durationDays) || def.durationDays,
      dailyRate: parseFloat(match.dailyRatePct) || def.dailyRate,
      minAmount: parseFloat(match.minAmount) || def.minAmount,
      isActive: match.isActive !== undefined ? Boolean(match.isActive) : true,
    };
  });

  const activePlan = vaultPlans.find((p) => p.code === selectedPlanCode) || vaultPlans[3];
  const numericAmount = parseFloat(amountInput) || 0;
  const dailyYieldUsd = numericAmount * (activePlan.dailyRate / 100);
  const totalYieldUsd = dailyYieldUsd * activePlan.durationDays;
  const totalPayoutUsd = numericAmount + totalYieldUsd;
  const exactMaturityUtc = computeExactMaturityUtcDate(activePlan.durationDays);

  const activePositions: VaultPositionRecord[] = overview?.activePositions || [];
  const maturedPositions: VaultPositionRecord[] = overview?.maturedPositions || [];
  const allPositions: VaultPositionRecord[] = [...activePositions, ...maturedPositions];

  const handleRequestLockModal = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (numericAmount < activePlan.minAmount) {
      setErrorMsg(
        `Minimum staking capital for ${activePlan.name} is $${activePlan.minAmount.toFixed(2)} USDT.`
      );
      return;
    }

    if (!activePlan.isActive) {
      setErrorMsg(`${activePlan.name} is currently paused by protocol governance.`);
      return;
    }

    setModalError(null);
    setTermsAccepted(false);
    setShowTermsModal(true);
  };

  const handleConfirmLockCapital = async () => {
    if (!termsAccepted) return;
    setModalError(null);
    setSubscribing(true);

    try {
      const res = await fetch('/api/chrono-vaults/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planCode: selectedPlanCode, amountUsd: numericAmount }),
        credentials: 'include',
      });
      const data = await res.json();
      if (res.ok && (data.success || data.positionId || data.position)) {
        setSuccessMsg(
          `Locked $${numericAmount.toFixed(2)} USDT into ${activePlan.name} (${activePlan.durationDays} Days @ ${activePlan.dailyRate.toFixed(2)}%/day). Maturity: ${exactMaturityUtc}.`
        );
        setShowTermsModal(false);
        await fetchOverview();
      } else {
        setModalError(
          data.message || data.error || 'Vault subscription failed. Please verify your Main USDT Wallet balance.'
        );
      }
    } catch (err: any) {
      setModalError(err?.message || 'Network error while locking Chrono Vault capital.');
    } finally {
      setSubscribing(false);
    }
  };

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Hero Header */}
      <div className="rounded-[28px] bg-gradient-to-br from-[#050807] via-[#13100A] to-[#050807] border border-white/10 p-6 sm:p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute -right-12 -top-12 w-96 h-96 bg-[#F5B800]/8 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="max-w-2xl space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-3 py-1 rounded-full text-[11px] font-mono font-bold tracking-wider uppercase bg-[#F5B800]/15 text-[#F5B800] border border-[#F5B800]/35">
                FIXED-TERM TIME-LOCKED VAULTS
              </span>
              <span className="text-[11px] font-mono text-[#00E5FF] px-2.5 py-1 rounded-lg bg-[#00E5FF]/10 border border-[#00E5FF]/25">
                7 DAYS / WEEK UTC YIELD
              </span>
              <span className="text-[11px] font-mono text-[#00E676] px-2.5 py-1 rounded-lg bg-[#00E676]/10 border border-[#00E676]/25">
                100% PRINCIPAL AT MATURITY
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              PHIVONEX CHRONO VAULTS™
            </h1>

            <p className="text-xs sm:text-sm text-[#98A2B3] leading-relaxed">
              Structured institutional fixed-term staking vaults spanning 200 days to 10 years, featuring automated 7-day daily USDT yield distributions and full 100% principal redemption upon contract maturity.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 font-mono shrink-0">
            <div className="p-3.5 rounded-xl bg-[#050807]/85 border border-white/10">
              <span className="text-[10px] text-[#98A2B3] uppercase block">Locked Principal</span>
              <div className="text-base font-extrabold text-white tabular-nums mt-0.5">
                ${parseFloat(overview?.userSummary?.totalActivePrincipalUsd || overview?.userSummary?.totalLockedPrincipalUsd || '0').toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
            <div className="p-3.5 rounded-xl bg-[#050807]/85 border border-white/10">
              <span className="text-[10px] text-[#98A2B3] uppercase block">Vault Yield Earned</span>
              <div className="text-base font-extrabold text-[#00E676] tabular-nums mt-0.5">
                +${parseFloat(overview?.userSummary?.totalLifetimeYieldUsd || overview?.userSummary?.totalYieldEarnedUsd || '0').toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {!vaultSubscriptionsEnabled && (
        <div className="p-4 rounded-xl bg-[#F5B800]/10 border border-[#F5B800]/35 text-xs text-[#F5B800] flex items-center gap-3">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <div>
            <div className="font-mono font-bold uppercase tracking-wider">
              Module Temporarily Paused by Protocol Governance
            </div>
            <p className="text-[#98A2B3] mt-0.5">
              New Chrono Vault subscriptions are temporarily paused by protocol governance. Existing active vault contracts remain securely locked and continue earning daily yields.
            </p>
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-[#F04438]/10 border border-[#F04438]/35 text-xs text-[#FF8A80] flex items-center gap-2.5">
          <AlertCircle className="w-4 h-4 text-[#F04438] shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-3.5 rounded-xl bg-[#00E676]/10 border border-[#00E676]/35 text-xs text-[#69F0AE] flex items-center gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-[#00E676] shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* All 5 Chrono Vault Tiers */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-extrabold text-white flex items-center gap-2">
            <Clock className="w-5 h-5 text-[#F5B800]" />
            <span>Select Chrono Vault Duration</span>
          </h2>
          <span className="text-xs font-mono text-[#98A2B3]">7 Days / Week Payout Schedule</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {vaultPlans.map((plan) => {
            const isSelected = selectedPlanCode === plan.code;
            return (
              <button
                key={plan.code}
                type="button"
                onClick={() => setSelectedPlanCode(plan.code)}
                className={`text-left p-5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between gap-4 ${
                  isSelected
                    ? 'bg-[#0C141F] border-[#F5B800] shadow-[0_0_24px_rgba(245,184,0,0.14)] scale-[1.01]'
                    : 'bg-[#050807]/85 border-white/10 hover:border-white/25 hover:bg-[#09121B]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <ChronoVaultEmblem planCode={plan.code as any} size={46} />
                  <span className="text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-lg bg-white/[0.06] text-white border border-white/10">
                    {plan.termBadge}
                  </span>
                </div>

                <div className="space-y-1">
                  <h3 className="text-sm font-extrabold text-white leading-snug">{plan.name}</h3>
                  <div className="text-lg font-extrabold font-mono text-[#F5B800] tabular-nums">
                    +{plan.dailyRate.toFixed(2)}%{' '}
                    <span className="text-[10px] font-normal text-[#98A2B3]">/ Day</span>
                  </div>
                  <div className="text-[10px] font-mono text-slate-400">
                    {plan.durationDays.toLocaleString()} Days • Min ${plan.minAmount}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Subscription Calculator & Governance Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8">
          <PhxGlassCard accent="gold">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
              <div>
                <h3 className="text-lg font-extrabold text-white flex items-center gap-2">
                  <Lock className="w-5 h-5 text-[#F5B800]" />
                  <span>Vault Yield &amp; Maturity Calculator</span>
                </h3>
                <p className="text-xs text-[#98A2B3] mt-0.5">
                  Configure your lock principal for <strong className="text-white">{activePlan.name}</strong> ({activePlan.durationDays.toLocaleString()} Days @ {activePlan.dailyRate.toFixed(2)}%/day).
                </p>
              </div>
              <div className="text-left sm:text-right px-3 py-1.5 rounded-xl bg-[#050807]/80 border border-white/10">
                <span className="text-[10px] font-mono text-[#98A2B3] uppercase block">Min Stake</span>
                <span className="text-xs font-mono text-white font-bold">${activePlan.minAmount.toFixed(2)} USDT</span>
              </div>
            </div>

            <form onSubmit={handleRequestLockModal} className="space-y-5">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-mono text-[#98A2B3] uppercase">Staking Principal (USDT)</label>
                  <span className="text-xs font-mono text-[#F5B800] font-semibold">
                    Exact Maturity: {exactMaturityUtc}
                  </span>
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-white/50 font-mono text-lg">
                    $
                  </div>
                  <input
                    type="number"
                    min={activePlan.minAmount}
                    step="1"
                    value={amountInput}
                    onChange={(e) => setAmountInput(e.target.value)}
                    className="w-full pl-9 pr-16 py-3.5 rounded-xl bg-[#050807] border border-white/15 text-white font-mono text-xl font-extrabold tabular-nums focus:outline-none focus:border-[#F5B800] transition-colors"
                    placeholder="1000"
                    required
                  />
                  <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none text-xs font-mono text-[#98A2B3] font-bold">
                    USDT
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2">
                {['100', '500', '1000', '5000'].map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setAmountInput(val)}
                    className={`py-2.5 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer border ${
                      numericAmount === parseFloat(val)
                        ? 'bg-[#F5B800]/20 text-[#F5B800] border-[#F5B800]'
                        : 'bg-white/[0.03] text-[#98A2B3] border-white/[0.08] hover:bg-white/[0.06] hover:text-white'
                    }`}
                  >
                    ${Number(val).toLocaleString()}
                  </button>
                ))}
              </div>

              {/* 4-Metric Projection Strip */}
              <div className="p-4 rounded-xl bg-[#050807]/80 border border-white/10 grid grid-cols-2 sm:grid-cols-4 gap-4 font-mono">
                <div>
                  <span className="text-[10px] text-[#98A2B3] uppercase block">Daily Yield (7d/wk)</span>
                  <div className="text-sm font-extrabold text-[#00E676] tabular-nums mt-1">
                    +<TabularCounter value={dailyYieldUsd} decimals={2} prefix="$" />
                  </div>
                </div>
                <div>
                  <span className="text-[10px] text-[#98A2B3] uppercase block">Total Term Yield</span>
                  <div className="text-sm font-extrabold text-[#F5B800] tabular-nums mt-1">
                    +<TabularCounter value={totalYieldUsd} decimals={2} prefix="$" />
                  </div>
                </div>
                <div>
                  <span className="text-[10px] text-[#98A2B3] uppercase block">Total Payout + Principal</span>
                  <div className="text-sm font-extrabold text-[#00E5FF] tabular-nums mt-1">
                    <TabularCounter value={totalPayoutUsd} decimals={2} prefix="$" />
                  </div>
                </div>
                <div>
                  <span className="text-[10px] text-[#98A2B3] uppercase block">Maturity Date</span>
                  <div className="text-xs font-bold text-white mt-1.5">{exactMaturityUtc}</div>
                </div>
              </div>

              <button
                type="submit"
                disabled={subscribing || !vaultSubscriptionsEnabled || !activePlan.isActive}
                className="w-full py-4 px-6 rounded-xl bg-gradient-to-r from-[#F5B800] to-[#FF9D00] hover:brightness-110 text-[#050807] font-extrabold text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-lg shadow-[#F5B800]/20 cursor-pointer disabled:opacity-50"
              >
                {!vaultSubscriptionsEnabled || !activePlan.isActive ? (
                  <span>Module Temporarily Paused by Protocol Governance</span>
                ) : (
                  <>
                    <span>Subscribe &amp; Lock Vault</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          </PhxGlassCard>
        </div>

        <div className="lg:col-span-4">
          <PhxGlassCard className="h-full">
            <h3 className="text-sm font-extrabold text-white mb-4 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#F5B800]" />
              <span>Vault Terms &amp; Settlement Structure</span>
            </h3>
            <ul className="space-y-3.5 text-xs text-[#98A2B3] leading-relaxed">
              <li className="flex items-start gap-2.5">
                <div className="w-1.5 h-1.5 rounded-full bg-[#F5B800] mt-1.5 shrink-0" />
                <span>
                  <strong className="text-white">Daily 7-Day UTC Yield:</strong> Staking returns distribute every day of the week directly into your Main USDT Wallet.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <div className="w-1.5 h-1.5 rounded-full bg-[#00E676] mt-1.5 shrink-0" />
                <span>
                  <strong className="text-white">100% Principal Redemption:</strong> Full initial USDT principal is automatically released to your Main USDT Wallet on the contract maturity date.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <div className="w-1.5 h-1.5 rounded-full bg-[#00E5FF] mt-1.5 shrink-0" />
                <span>
                  <strong className="text-white">Rate Lock Guarantee:</strong> Your daily percentage rate is locked at contract activation for the entire selected vault duration.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <div className="w-1.5 h-1.5 rounded-full bg-white/60 mt-1.5 shrink-0" />
                <span>
                  <strong className="text-white">Fixed Time-Lock Discipline:</strong> Locked principal remains committed until the maturity timestamp to sustain higher fixed yields.
                </span>
              </li>
            </ul>
          </PhxGlassCard>
        </div>
      </div>

      {/* Active & Matured Chrono Vault Positions */}
      <PhxGlassCard accent="gold">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
          <div>
            <h2 className="text-lg font-extrabold text-white flex items-center gap-2">
              <Layers className="w-5 h-5 text-[#F5B800]" />
              <span>My Active &amp; Matured Chrono Vault Contracts</span>
            </h2>
            <p className="text-xs text-[#98A2B3] mt-0.5">
              Monitor locked vault durations, accrued daily USDT yields, and scheduled principal release dates.
            </p>
          </div>
          <div className="flex items-center gap-2 font-mono text-[11px]">
            <span className="px-2.5 py-1 rounded-lg bg-[#F5B800]/15 text-[#F5B800] border border-[#F5B800]/30">
              {activePositions.length} Locked
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-[#00E676]/15 text-[#00E676] border border-[#00E676]/30">
              {maturedPositions.length} Matured
            </span>
          </div>
        </div>

        {loading ? (
          <div className="py-12 flex items-center justify-center">
            <Loader2 className="w-7 h-7 animate-spin text-[#F5B800]" />
          </div>
        ) : allPositions.length === 0 ? (
          <div className="py-12 text-center rounded-2xl bg-[#050807]/70 border border-white/8">
            <Lock className="w-10 h-10 text-white/20 mx-auto mb-3" />
            <h3 className="text-sm font-bold text-white">No Active Chrono Vaults</h3>
            <p className="text-xs text-[#98A2B3] mt-1 max-w-md mx-auto">
              Select a vault duration above and lock at least $100.00 USDT to start receiving automated 7-day daily USDT yield distributions.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {allPositions.map((pos) => {
              const principalVal = parseFloat(pos.principalAmount || pos.principalUsd || '0');
              const yieldVal = parseFloat(pos.totalYieldEarned || pos.totalYieldPaidUsd || '0');
              const rateVal = parseFloat(pos.dailyRatePctSnapshot || '0');
              const durationVal = pos.durationDays ?? pos.durationDaysSnapshot ?? 0;
              const isMatured = pos.status === 'MATURED';
              const progressPct = isMatured
                ? 100
                : pos.progressPct
                ? parseFloat(pos.progressPct)
                : computeLockProgressPct(pos.activatedAt, pos.maturityAt);

              return (
                <div
                  key={pos.id}
                  className="p-4 sm:p-5 rounded-2xl bg-[#050807]/85 border border-white/10 space-y-3.5"
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <ChronoVaultEmblem planCode={pos.planCode as any} size={44} />
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-extrabold text-white">{pos.planName}</span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase border ${
                              isMatured
                                ? 'bg-[#00E676]/15 text-[#00E676] border-[#00E676]/35'
                                : 'bg-[#F5B800]/15 text-[#F5B800] border-[#F5B800]/35'
                            }`}
                          >
                            {isMatured ? 'MATURED • PRINCIPAL RETURNED' : `LOCKED • ${rateVal.toFixed(2)}% / DAY`}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-mono text-[#98A2B3] mt-1">
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-slate-500" />
                            Locked: {formatIsoDateUtc(pos.activatedAt)}
                          </span>
                          <span className="inline-flex items-center gap-1 text-white">
                            <Clock className="w-3 h-3 text-[#F5B800]" />
                            Maturity: {formatIsoDateUtc(pos.maturityAt)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-6 font-mono tabular-nums">
                      <div>
                        <span className="text-[10px] text-[#98A2B3] uppercase block">Locked Principal</span>
                        <span className="text-sm font-extrabold text-white">
                          ${principalVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-[#98A2B3] uppercase block">Yield Paid</span>
                        <span className="text-sm font-extrabold text-[#00E676]">
                          +${yieldVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-[#98A2B3] uppercase block">Duration</span>
                        <span className="text-sm font-bold text-[#F5B800]">
                          {durationVal.toLocaleString()}d
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Lock Progress Bar */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[10px] font-mono text-[#98A2B3]">
                      <span>Vault Maturity Progress</span>
                      <span className="text-white font-bold">{progressPct.toFixed(1)}%</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-white/[0.05] overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ${
                          isMatured
                            ? 'bg-[#00E676]'
                            : 'bg-gradient-to-r from-[#F5B800] to-[#00E5FF]'
                        }`}
                        style={{ width: `${Math.max(progressPct, 1.2)}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </PhxGlassCard>

      {/* Mandatory Chrono Vault Subscription Terms & Conditions Modal */}
      {showTermsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div className="w-full max-w-lg rounded-3xl bg-[#071018] border border-[#F5B800]/40 shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-white/10 flex items-start justify-between gap-4 bg-gradient-to-r from-[#F5B800]/12 to-transparent">
              <div>
                <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#F5B800]">
                  CHRONO VAULTS™ LOCK-IN AGREEMENT
                </span>
                <h3 className="text-lg font-extrabold text-white mt-1 flex items-center gap-2">
                  <FileCheck2 className="w-5 h-5 text-[#F5B800]" />
                  <span>Chrono Vault Subscription Terms &amp; Conditions</span>
                </h3>
              </div>
              <button
                type="button"
                onClick={() => !subscribing && setShowTermsModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Contract Summary Grid */}
              <div className="grid grid-cols-2 gap-3 font-mono text-xs">
                <div className="p-3.5 rounded-xl bg-[#050807] border border-white/10">
                  <span className="text-[10px] text-[#98A2B3] uppercase block">Selected Vault</span>
                  <span className="text-sm font-extrabold text-white mt-0.5 block">{activePlan.name}</span>
                  <span className="text-[10px] text-[#F5B800]">
                    {activePlan.durationDays.toLocaleString()} Days @ +{activePlan.dailyRate.toFixed(2)}%/day
                  </span>
                </div>
                <div className="p-3.5 rounded-xl bg-[#050807] border border-white/10">
                  <span className="text-[10px] text-[#98A2B3] uppercase block">Locked Principal</span>
                  <span className="text-sm font-extrabold text-white mt-0.5 block tabular-nums">
                    ${numericAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT
                  </span>
                  <span className="text-[10px] text-[#00E676]">
                    Daily: +${dailyYieldUsd.toFixed(2)} USDT
                  </span>
                </div>
              </div>

              {/* Settlement Terms Box */}
              <div className="rounded-2xl bg-[#050807]/90 border border-white/10 p-4 space-y-2.5 text-xs text-[#98A2B3] leading-relaxed">
                <div className="text-[10px] font-mono uppercase tracking-wider text-white font-bold flex items-center gap-1.5 mb-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#F5B800]" />
                  <span>Lock-In &amp; Settlement Schedule</span>
                </div>
                <p>
                  1. <strong className="text-white">Fixed Principal Time-Lock:</strong> Your principal of{' '}
                  <span className="font-mono text-white">${numericAmount.toFixed(2)} USDT</span> will remain locked until the exact contract maturity date:{' '}
                  <span className="font-mono text-[#F5B800] font-bold">{exactMaturityUtc}</span>. Early principal withdrawal is not permitted prior to maturity.
                </p>
                <p>
                  2. <strong className="text-white">7-Day Daily UTC Yield:</strong> Daily staking yield of{' '}
                  <span className="font-mono text-[#00E676]">+${dailyYieldUsd.toFixed(2)} USDT</span> ({activePlan.dailyRate.toFixed(2)}%/day) is credited 7 days per week directly to your Main USDT Wallet.
                </p>
                <p>
                  3. <strong className="text-white">100% Principal Redemption at Maturity:</strong> Upon reaching <span className="font-mono text-white">{exactMaturityUtc}</span>, 100% of your locked principal (${numericAmount.toFixed(2)} USDT) is automatically returned to your Main USDT Wallet.
                </p>
              </div>

              {/* Mandatory Checkbox */}
              <label className="flex items-start gap-3 p-3.5 rounded-xl bg-white/[0.03] border border-white/10 cursor-pointer hover:border-[#F5B800]/40 transition-colors">
                <input
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                  className="mt-0.5 rounded border-white/25 bg-[#050807] text-[#F5B800] focus:ring-[#F5B800]"
                />
                <span className="text-xs text-slate-200 leading-relaxed">
                  I have read, understood, and agree to the Chrono Vault Lock-In Terms &amp; Settlement Schedule
                </span>
              </label>

              {modalError && (
                <div className="p-3 rounded-xl bg-[#F04438]/12 border border-[#F04438]/40 text-xs text-[#FF8A80] flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-[#F04438] shrink-0" />
                  <span>{modalError}</span>
                </div>
              )}

              <div className="flex items-center gap-3 pt-1">
                <button
                  type="button"
                  disabled={subscribing}
                  onClick={() => setShowTermsModal(false)}
                  className="flex-1 py-3 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/15 text-xs font-bold text-white cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!termsAccepted || subscribing}
                  onClick={handleConfirmLockCapital}
                  className="flex-1 py-3 rounded-xl bg-gradient-to-r from-[#F5B800] to-[#FF9D00] text-[#050807] font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 shadow-lg shadow-[#F5B800]/20"
                >
                  {subscribing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Locking Capital...</span>
                    </>
                  ) : (
                    <>
                      <Lock className="w-4 h-4" />
                      <span>Confirm &amp; Lock Capital</span>
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
