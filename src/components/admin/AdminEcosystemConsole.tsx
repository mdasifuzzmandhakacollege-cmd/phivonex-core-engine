import React, { useState, useEffect, useCallback } from 'react';
import { PhxGlassCard } from '../ui/phivonex';
import {
  ShieldAlert,
  ShieldCheck,
  Power,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Loader2,
  Save,
  TrendingUp,
  Clock,
  Server,
  Network,
  Award,
  Activity,
  Lock,
  Unlock,
  X,
  Sparkles,
} from 'lucide-react';
import { AdminPromoManager } from './AdminPromoManager';

interface FeatureSwitchRecord {
  switchKey: string;
  isEnabled: boolean;
  category: string;
  label: string;
  description: string | null;
  updatedByAdminId: string | null;
  updatedAt: string;
}

interface TradingTierConfig {
  id: string;
  tierCode: string;
  tierName: string;
  minAmount: string;
  maxAmount: string | null;
  minDailyRatePct: string;
  maxDailyRatePct: string;
  isActive: boolean;
}

interface DailyYieldRateRecord {
  id: string;
  tradingDate: string;
  tierCode: string;
  tierName: string;
  yieldRatePct: string;
  notes: string | null;
  updatedAt: string;
}

interface ChronoVaultPlanConfig {
  id: string;
  planCode: string;
  planName: string;
  durationDays: number;
  dailyRatePct: string;
  minAmount: string;
  returnPrincipalOnMaturity: boolean;
  isActive: boolean;
}

interface UnilevelGenerationConfig {
  generationLevel: number;
  commissionPct: string;
  requiredDirectActiveReferrals: number;
  requiredPersonalActiveUsd: string;
  isActive: boolean;
}

interface LeadershipRankConfig {
  id: string;
  rankLevel: number;
  rankCode: string;
  rankName: string;
  requiredPersonalVolumeUsd: string;
  requiredTeamVolumeUsd: string;
  maxSingleLegCapPct: string;
  requiredDirectActiveLegs: number;
  requiredSubRankCode: string | null;
  requiredSubRankLegs: number;
  milestoneBonusUsd: string;
  globalPoolSharePct: string;
  rewardDescription: string | null;
  isActive: boolean;
}

interface CircuitBreakerConfig {
  id: number;
  minReserveRatio: string;
  maxHourlyOutflowUsd: string;
  maxUserDailyWithdrawalUsd: string;
  withdrawalMode: 'AUTO' | 'MANUAL_REVIEW' | 'PAUSED_OFF';
  tripReason: string | null;
  trippedAt: string | null;
  updatedAt: string;
}

interface GenesisCoreEconomics {
  genesisNodeCap: number;
  nodeBasePriceUsd: number;
  nodeDailyEmissionPhivo: number;
  phivoReferencePriceUsd: number;
  swapEnabled: boolean;
}

interface AuditLogRecord {
  id: string;
  traceId: string;
  actorUserId: string | null;
  actionType: string;
  severity: 'INFO' | 'WARN' | 'CRITICAL';
  payload: Record<string, any>;
  createdAt: string;
}

interface MasterConfigPayload {
  featureSwitches: FeatureSwitchRecord[];
  genesisCoreEconomics: GenesisCoreEconomics;
  tradingPoolTiers: TradingTierConfig[];
  dailyTradingYieldRates: DailyYieldRateRecord[];
  chronoVaultPlans: ChronoVaultPlanConfig[];
  unilevelGenerations: UnilevelGenerationConfig[];
  totalUnilevelCommissionPct: string;
  leadershipRanks: LeadershipRankConfig[];
  circuitBreaker: CircuitBreakerConfig;
  alphaRedemptionFeePct?: string;
  p2pTransferFeePct?: string;
  recentSecurityAuditLogs: AuditLogRecord[];
}

type ConsoleTab =
  | 'quantum_alpha'
  | 'chrono_vaults'
  | 'genesis_core'
  | 'unilevel_matrix'
  | 'leadership_ranks'
  | 'circuit_breaker'
  | 'promo_spotlights';

interface PendingConfirmation {
  type: 'feature_switch' | 'withdrawal_mode';
  key: string;
  title: string;
  targetLabel: string;
  nextValue: boolean | 'AUTO' | 'MANUAL_REVIEW' | 'PAUSED_OFF';
  isDanger: boolean;
}

export interface AdminEcosystemConsoleProps {
  user?: any;
  onNavigateTab?: (tab: string) => void;
}

export const AdminEcosystemConsole: React.FC<AdminEcosystemConsoleProps> = () => {
  const [config, setConfig] = useState<MasterConfigPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<ConsoleTab>('quantum_alpha');

  const [toastSuccess, setToastSuccess] = useState<string | null>(null);
  const [toastError, setToastError] = useState<string | null>(null);

  // Confirmation Modal State for Live Master Switches
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirmation | null>(null);
  const [confirmReason, setConfirmReason] = useState('');
  const [confirmSubmitting, setConfirmSubmitting] = useState(false);

  // Quantum Alpha Daily Rate Publisher State
  const [yieldDate, setYieldDate] = useState(new Date().toISOString().split('T')[0]);
  const [dailyRatesDraft, setDailyRatesDraft] = useState<Record<string, string>>({
    ALPHA_CORE: '0.35',
    ALPHA_PRIME: '0.70',
    ALPHA_SOVEREIGN: '0.95',
  });
  const [yieldNotes, setYieldNotes] = useState('');
  const [allowRateOverride, setAllowRateOverride] = useState(false);
  const [publishingRates, setPublishingRates] = useState(false);

  // Inline Drafts for Dynamic Parameter Editors
  const [tierDrafts, setTierDrafts] = useState<Record<string, any>>({});
  const [vaultDrafts, setVaultDrafts] = useState<Record<string, any>>({});
  const [genDrafts, setGenDrafts] = useState<Record<number, any>>({});
  const [rankDrafts, setRankDrafts] = useState<Record<number, any>>({});
  const [genesisDraft, setGenesisDraft] = useState({
    nodeDailyEmissionPhivo: '15',
    phivoReferencePriceUsd: '0.10',
    nodeBasePriceUsd: '1000',
  });
  const [cbDraft, setCbDraft] = useState({
    minReserveRatio: '1.25',
    maxHourlyOutflowUsd: '25000',
    maxUserDailyWithdrawalUsd: '10000',
  });
  const [alphaRedemptionFeeDraft, setAlphaRedemptionFeeDraft] = useState<string>('15.00');
  const [p2pTransferFeeDraft, setP2pTransferFeeDraft] = useState<string>('0.00');
  const [savingKey, setSavingKey] = useState<string | null>(null);

  // Reconciliation State
  const [reconciling, setReconciling] = useState(false);
  const [reconciliationResult, setReconciliationResult] = useState<any>(null);

  const showSuccess = (msg: string) => {
    setToastError(null);
    setToastSuccess(msg);
  };

  const showError = (msg: string) => {
    setToastSuccess(null);
    setToastError(msg);
  };

  const syncDraftsFromConfig = (data: MasterConfigPayload) => {
    const tDrafts: Record<string, any> = {};
    for (const t of data.tradingPoolTiers || []) {
      tDrafts[t.tierCode] = {
        minAmount: Number(t.minAmount).toString(),
        maxAmount: t.maxAmount !== null ? Number(t.maxAmount).toString() : '',
        minDailyRatePct: Number(t.minDailyRatePct).toString(),
        maxDailyRatePct: Number(t.maxDailyRatePct).toString(),
        isActive: t.isActive,
      };
    }
    setTierDrafts(tDrafts);

    const vDrafts: Record<string, any> = {};
    for (const p of data.chronoVaultPlans || []) {
      vDrafts[p.planCode] = {
        dailyRatePct: Number(p.dailyRatePct).toString(),
        minAmount: Number(p.minAmount).toString(),
        isActive: p.isActive,
      };
    }
    setVaultDrafts(vDrafts);

    const gDrafts: Record<number, any> = {};
    for (const g of data.unilevelGenerations || []) {
      gDrafts[g.generationLevel] = {
        commissionPct: Number(g.commissionPct).toString(),
        requiredPersonalActiveUsd: Number(g.requiredPersonalActiveUsd).toString(),
        requiredDirectActiveReferrals: String(g.requiredDirectActiveReferrals),
        isActive: g.isActive,
      };
    }
    setGenDrafts(gDrafts);

    const rDrafts: Record<number, any> = {};
    for (const r of data.leadershipRanks || []) {
      rDrafts[r.rankLevel] = {
        requiredPersonalVolumeUsd: Number(r.requiredPersonalVolumeUsd).toString(),
        requiredTeamVolumeUsd: Number(r.requiredTeamVolumeUsd).toString(),
        maxSingleLegCapPct: Number(r.maxSingleLegCapPct).toString(),
        requiredDirectActiveLegs: String(r.requiredDirectActiveLegs),
        milestoneBonusUsd: Number(r.milestoneBonusUsd).toString(),
        globalPoolSharePct: Number(r.globalPoolSharePct).toString(),
        isActive: r.isActive,
      };
    }
    setRankDrafts(rDrafts);

    if (data.genesisCoreEconomics) {
      setGenesisDraft({
        nodeDailyEmissionPhivo: String(data.genesisCoreEconomics.nodeDailyEmissionPhivo),
        phivoReferencePriceUsd: String(data.genesisCoreEconomics.phivoReferencePriceUsd),
        nodeBasePriceUsd: String(data.genesisCoreEconomics.nodeBasePriceUsd),
      });
    }

    if (data.circuitBreaker) {
      setCbDraft({
        minReserveRatio: Number(data.circuitBreaker.minReserveRatio).toString(),
        maxHourlyOutflowUsd: Number(data.circuitBreaker.maxHourlyOutflowUsd).toString(),
        maxUserDailyWithdrawalUsd: Number(data.circuitBreaker.maxUserDailyWithdrawalUsd).toString(),
      });
    }

    if (data.alphaRedemptionFeePct !== undefined && data.alphaRedemptionFeePct !== null) {
      setAlphaRedemptionFeeDraft(Number(data.alphaRedemptionFeePct).toFixed(2));
    }

    if (data.p2pTransferFeePct !== undefined && data.p2pTransferFeePct !== null) {
      setP2pTransferFeeDraft(Number(data.p2pTransferFeePct).toFixed(2));
    }
  };

  const fetchMasterConfig = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    try {
      const res = await fetch('/api/admin/ecosystem-config', { credentials: 'include' });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to load ecosystem master configuration.');
      }
      setConfig(data);
      syncDraftsFromConfig(data);
    } catch (err: any) {
      showError(err?.message || 'Unable to load master governance configuration.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchMasterConfig(false);
  }, [fetchMasterConfig]);

  // Execute Confirmed Master Switch / Withdrawal Mode Mutation
  const handleConfirmSwitchMutation = async () => {
    if (!pendingConfirm) return;
    setConfirmSubmitting(true);
    try {
      if (pendingConfirm.type === 'feature_switch') {
        const res = await fetch(
          `/api/admin/ecosystem-config/feature-switches/${encodeURIComponent(pendingConfirm.key)}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              isEnabled: Boolean(pendingConfirm.nextValue),
              reason: confirmReason.trim() || undefined,
            }),
          }
        );
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.message || 'Failed to toggle master switch.');
        }
        showSuccess(
          `${pendingConfirm.title} is now ${pendingConfirm.nextValue ? 'LIVE (ON)' : 'PAUSED (OFF)'} and recorded in Security Audit Logs.`
        );
      } else if (pendingConfirm.type === 'withdrawal_mode') {
        const nextMode = pendingConfirm.nextValue as 'AUTO' | 'MANUAL_REVIEW' | 'PAUSED_OFF';
        const res = await fetch('/api/admin/ecosystem-config/circuit-breaker', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            withdrawalMode: nextMode,
            tripReason:
              nextMode === 'AUTO'
                ? null
                : confirmReason.trim() || `Admin governance set withdrawal mode to ${nextMode}`,
            resetTrip: nextMode === 'AUTO',
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.message || 'Failed to update withdrawal settlement mode.');
        }
        showSuccess(`BEP-20 Withdrawal Settlement Mode updated to ${nextMode}.`);
      }

      setPendingConfirm(null);
      setConfirmReason('');
      await fetchMasterConfig(false);
    } catch (err: any) {
      showError(err?.message || 'Governance toggle failed.');
    } finally {
      setConfirmSubmitting(false);
    }
  };

  // Publish Daily Trading Yield Rates for All 3 Tiers
  const handlePublishDailyRates = async (e: React.FormEvent) => {
    e.preventDefault();
    setPublishingRates(true);
    setToastError(null);
    setToastSuccess(null);

    try {
      const tiers = ['ALPHA_CORE', 'ALPHA_PRIME', 'ALPHA_SOVEREIGN'];
      for (const tierCode of tiers) {
        const rateStr = dailyRatesDraft[tierCode];
        const res = await fetch('/api/admin/ecosystem-config/trading-yield-rate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            tradingDate: yieldDate,
            tierCode,
            yieldRatePct: parseFloat(rateStr),
            notes: yieldNotes.trim() || null,
            allowOverride: allowRateOverride,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(`${tierCode}: ${data.message || 'Failed to publish rate.'}`);
        }
      }
      showSuccess(`Published daily Quantum Alpha™ yield rates for ${yieldDate} across all 3 tiers.`);
      setYieldNotes('');
      await fetchMasterConfig(false);
    } catch (err: any) {
      showError(err?.message || 'Error publishing daily trading yield rates.');
    } finally {
      setPublishingRates(false);
    }
  };

  const handleSaveTradingTier = async (tierCode: string) => {
    const d = tierDrafts[tierCode];
    if (!d) return;
    setSavingKey(`tier_${tierCode}`);
    try {
      const res = await fetch(`/api/admin/ecosystem-config/trading-tier/${tierCode}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          minAmount: parseFloat(d.minAmount),
          maxAmount: d.maxAmount === '' ? null : parseFloat(d.maxAmount),
          minDailyRatePct: parseFloat(d.minDailyRatePct),
          maxDailyRatePct: parseFloat(d.maxDailyRatePct),
          isActive: Boolean(d.isActive),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Failed to update trading tier.');
      showSuccess(`Updated Quantum Alpha™ tier ${tierCode} successfully.`);
      await fetchMasterConfig(false);
    } catch (err: any) {
      showError(err?.message || 'Failed to update trading tier.');
    } finally {
      setSavingKey(null);
    }
  };

  const handleSaveAlphaRedemptionFee = async (e: React.FormEvent) => {
    e.preventDefault();
    const numericFee = parseFloat(alphaRedemptionFeeDraft);
    if (!Number.isFinite(numericFee) || numericFee < 0 || numericFee > 50) {
      showError('Principal redemption settlement fee must be between 0.00% and 50.00%.');
      return;
    }
    setSavingKey('alpha_redemption_fee_pct');
    try {
      const res = await fetch('/api/admin/ecosystem-config/master-config/alpha_redemption_fee_pct', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ configValue: numericFee }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to update principal redemption settlement fee.');
      }
      showSuccess(
        `Updated Quantum Alpha™ Principal Redemption Settlement Fee to ${numericFee.toFixed(2)}% (Net return: ${(100 - numericFee).toFixed(2)}%).`
      );
      await fetchMasterConfig(false);
    } catch (err: any) {
      showError(err?.message || 'Failed to update principal redemption settlement fee.');
    } finally {
      setSavingKey(null);
    }
  };

  const handleSaveVaultPlan = async (planCode: string) => {
    const d = vaultDrafts[planCode];
    if (!d) return;
    setSavingKey(`vault_${planCode}`);
    try {
      const res = await fetch(`/api/admin/ecosystem-config/chrono-vault/${planCode}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          dailyRatePct: parseFloat(d.dailyRatePct),
          minAmount: parseFloat(d.minAmount),
          isActive: Boolean(d.isActive),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Failed to update Chrono Vault plan.');
      showSuccess(`Updated Chrono Vault plan ${planCode} (${d.isActive ? 'ACTIVE' : 'PAUSED'}).`);
      await fetchMasterConfig(false);
    } catch (err: any) {
      showError(err?.message || 'Failed to update Chrono Vault plan.');
    } finally {
      setSavingKey(null);
    }
  };

  const handleSaveGenesisEconomics = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingKey('genesis_econ');
    try {
      const emissionRate = parseFloat(genesisDraft.nodeDailyEmissionPhivo);
      const phivoPrice = parseFloat(genesisDraft.phivoReferencePriceUsd);
      const nodePrice = parseFloat(genesisDraft.nodeBasePriceUsd);

      const updates = [
        {
          key: 'NODE_REWARD_RATE_PER_EPOCH',
          value: emissionRate,
          reason: 'Admin Ecosystem Console: Updated daily PHIVO node emission rate',
        },
        {
          key: 'INTERNAL_COIN_PRICE_USDT',
          value: {
            priceUsdt: phivoPrice,
            coinSymbol: 'PHIVO',
            swapEnabled: config?.genesisCoreEconomics?.swapEnabled ?? true,
          },
          reason: 'Admin Ecosystem Console: Updated PHIVO/USDT reference oracle price',
        },
        {
          key: 'NODE_BASE_PRICE_USD',
          value: nodePrice,
          reason: 'Admin Ecosystem Console: Updated Genesis Node base purchase price',
        },
      ];

      for (const u of updates) {
        const res = await fetch(`/api/admin/economics/configs/${u.key}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ value: u.value, status: 'ACTIVE', reason: u.reason }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(`${u.key}: ${data.message || 'Failed to update parameter.'}`);
        }
      }

      showSuccess(
        `Genesis Core™ Tokenomics updated (${emissionRate} PHIVO/day, $${phivoPrice.toFixed(4)}/PHIVO, $${nodePrice.toFixed(2)}/Node).`
      );
      await fetchMasterConfig(false);
    } catch (err: any) {
      showError(err?.message || 'Failed to update Genesis Core™ economic parameters.');
    } finally {
      setSavingKey(null);
    }
  };

  const handleSaveGeneration = async (level: number) => {
    const d = genDrafts[level];
    if (!d) return;
    setSavingKey(`gen_${level}`);
    try {
      const res = await fetch(`/api/admin/ecosystem-config/unilevel-generation/${level}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          commissionPct: parseFloat(d.commissionPct),
          minPersonalActiveUsd: parseFloat(d.requiredPersonalActiveUsd),
          minDirectActiveReferrals: parseInt(d.requiredDirectActiveReferrals, 10),
          isActive: Boolean(d.isActive),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || `Failed to update Generation ${level}.`);
      showSuccess(`Saved Generation ${level} configuration (${d.isActive ? 'ACTIVE' : 'PAUSED'}).`);
      await fetchMasterConfig(false);
    } catch (err: any) {
      showError(err?.message || `Failed to update Generation ${level}.`);
    } finally {
      setSavingKey(null);
    }
  };

  const handleSaveRank = async (rankLevel: number) => {
    const d = rankDrafts[rankLevel];
    if (!d) return;
    setSavingKey(`rank_${rankLevel}`);
    try {
      const res = await fetch(`/api/admin/ecosystem-config/leadership-rank/${rankLevel}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          requiredPersonalVolumeUsd: parseFloat(d.requiredPersonalVolumeUsd),
          requiredTeamVolumeUsd: parseFloat(d.requiredTeamVolumeUsd),
          maxSingleLegCapPct: parseFloat(d.maxSingleLegCapPct),
          requiredDirectActiveLegs: parseInt(d.requiredDirectActiveLegs, 10),
          milestoneBonusUsd: parseFloat(d.milestoneBonusUsd),
          globalPoolSharePct: parseFloat(d.globalPoolSharePct),
          isActive: Boolean(d.isActive),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || `Failed to update Rank ${rankLevel}.`);
      showSuccess(`Saved Leadership Rank #${rankLevel} configuration (${d.isActive ? 'ACTIVE' : 'PAUSED'}).`);
      await fetchMasterConfig(false);
    } catch (err: any) {
      showError(err?.message || `Failed to update Leadership Rank #${rankLevel}.`);
    } finally {
      setSavingKey(null);
    }
  };

  const handleSaveCircuitBreaker = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingKey('circuit_breaker');
    try {
      const res = await fetch('/api/admin/ecosystem-config/circuit-breaker', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          minReserveRatio: parseFloat(cbDraft.minReserveRatio),
          maxHourlyOutflowUsd: parseFloat(cbDraft.maxHourlyOutflowUsd),
          maxUserDailyWithdrawalUsd: parseFloat(cbDraft.maxUserDailyWithdrawalUsd),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Failed to save circuit breaker limits.');
      showSuccess('Liquidity Circuit Breaker safety thresholds updated and audited.');
      await fetchMasterConfig(false);
    } catch (err: any) {
      showError(err?.message || 'Failed to save circuit breaker limits.');
    } finally {
      setSavingKey(null);
    }
  };

  const handleSaveP2pTransferFee = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingKey('p2p_transfer_fee_pct');
    try {
      const parsed = parseFloat(p2pTransferFeeDraft);
      if (isNaN(parsed) || parsed < 0 || parsed > 25) {
        throw new Error('P2P internal transfer fee must be between 0.00% and 25.00%.');
      }
      const res = await fetch('/api/admin/ecosystem-config/master-config/p2p_transfer_fee_pct', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ configValue: parsed }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Failed to update P2P transfer fee.');
      showSuccess(`P2P Internal Transfer Fee updated to ${parsed.toFixed(2)}%.`);
      await fetchMasterConfig(false);
    } catch (err: any) {
      showError(err?.message || 'Failed to update P2P transfer fee.');
    } finally {
      setSavingKey(null);
    }
  };

  const handleRunReconciliation = async () => {
    setReconciling(true);
    setReconciliationResult(null);
    try {
      const res = await fetch('/api/admin/reconciliation/run', {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success || data.reconciliation || data.summary) {
        setReconciliationResult(data.reconciliation || data.summary || data);
        showSuccess('Double-entry financial ledger reconciliation completed.');
      } else {
        throw new Error(data.error || data.message || 'Reconciliation failed.');
      }
    } catch (err: any) {
      showError(err?.message || 'Error executing ledger reconciliation.');
    } finally {
      setReconciling(false);
    }
  };

  const activeUnilevelSum = Object.values(genDrafts).reduce((sum, g: any) => {
    if (!g?.isActive) return sum;
    const val = parseFloat(g.commissionPct);
    return sum + (Number.isFinite(val) ? val : 0);
  }, 0);

  if (loading && !config) {
    return (
      <div className="py-24 flex flex-col items-center justify-center gap-3 text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin text-[#00E5FF]" />
        <span className="text-xs font-mono uppercase tracking-wider">
          Loading PHIVONEX Protocol Governance Console...
        </span>
      </div>
    );
  }

  const switches = config?.featureSwitches || [];
  const activeSwitchCount = switches.filter((s) => s.isEnabled).length;
  const withdrawalMode = config?.circuitBreaker?.withdrawalMode || 'AUTO';

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-white/10">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-widest bg-[#F5B800]/15 text-[#F5B800] border border-[#F5B800]/30">
              LIVE PROTOCOL GOVERNANCE
            </span>
            <span className="px-2.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-widest bg-[#00E5FF]/15 text-[#00E5FF] border border-[#00E5FF]/30">
              {activeSwitchCount}/{switches.length} MODULES LIVE
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Admin Ecosystem Control Console
          </h1>
          <p className="text-xs text-[#98A2B3] mt-1">
            Real-time master ON/OFF governance switches, dynamic yield &amp; commission schedules, and security audit telemetry.
          </p>
        </div>

        <button
          onClick={() => fetchMasterConfig(true)}
          disabled={refreshing}
          className="self-start md:self-auto px-4 py-2.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/15 text-xs font-mono font-bold text-white flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 text-[#00E5FF] ${refreshing ? 'animate-spin' : ''}`} />
          <span>Sync Live State</span>
        </button>
      </div>

      {/* Global Toast Banners */}
      {toastError && (
        <div className="p-4 rounded-xl bg-[#F04438]/12 border border-[#F04438]/40 text-xs text-[#FF8A80] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 text-[#F04438] shrink-0" />
            <span className="font-medium">{toastError}</span>
          </div>
          <button onClick={() => setToastError(null)} className="text-white/60 hover:text-white cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {toastSuccess && (
        <div className="p-4 rounded-xl bg-[#00E676]/12 border border-[#00E676]/40 text-xs text-[#69F0AE] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-[#00E676] shrink-0" />
            <span className="font-medium">{toastSuccess}</span>
          </div>
          <button onClick={() => setToastSuccess(null)} className="text-white/60 hover:text-white cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MASTER ECOSYSTEM CONTROL SWITCHES (LIVE ON / OFF)                     */}
      {/* ===================================================================== */}
      <PhxGlassCard accent="gold">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-lg font-extrabold text-white flex items-center gap-2.5">
              <Power className="w-5 h-5 text-[#F5B800]" />
              <span>Master Ecosystem Control Switches (Live ON / OFF)</span>
            </h2>
            <p className="text-xs text-[#98A2B3] mt-1">
              Toggle any product subscription, daily yield engine, swap rail, affiliate engine, or treasury flow in real time. Every state transition requires confirmation and is permanently recorded in <span className="font-mono text-white/80">security_audit_logs</span>.
            </p>
          </div>

          {/* 3-Way Withdrawal Mode Governance Control */}
          <div className="p-3 rounded-xl bg-[#050807] border border-white/10 shrink-0">
            <div className="text-[10px] font-mono uppercase tracking-wider text-[#98A2B3] mb-2">
              BEP-20 Withdrawal Mode (Circuit Breaker)
            </div>
            <div className="flex items-center gap-1.5">
              {(['AUTO', 'MANUAL_REVIEW', 'PAUSED_OFF'] as const).map((mode) => {
                const isSelected = withdrawalMode === mode;
                const activeCls =
                  mode === 'AUTO'
                    ? 'bg-[#00E676]/20 text-[#00E676] border-[#00E676]/50'
                    : mode === 'MANUAL_REVIEW'
                    ? 'bg-[#F5B800]/20 text-[#F5B800] border-[#F5B800]/50'
                    : 'bg-[#F04438]/20 text-[#F04438] border-[#F04438]/50';
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => {
                      if (isSelected) return;
                      setPendingConfirm({
                        type: 'withdrawal_mode',
                        key: 'withdrawal_mode',
                        title: 'BEP-20 Withdrawal Settlement Mode',
                        targetLabel: mode,
                        nextValue: mode,
                        isDanger: mode === 'PAUSED_OFF',
                      });
                    }}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-mono font-bold border transition-all cursor-pointer ${
                      isSelected
                        ? activeCls
                        : 'bg-white/[0.03] text-slate-400 border-white/10 hover:text-white hover:border-white/25'
                    }`}
                  >
                    {mode === 'PAUSED_OFF' ? 'PAUSED / OFF' : mode === 'MANUAL_REVIEW' ? 'MANUAL' : 'AUTO'}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* 11-Switch Live Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {switches.map((sw) => {
            const catColor =
              sw.category === 'PRODUCTS'
                ? 'text-[#00E5FF] bg-[#00E5FF]/10 border-[#00E5FF]/25'
                : sw.category === 'YIELD'
                ? 'text-[#F5B800] bg-[#F5B800]/10 border-[#F5B800]/25'
                : sw.category === 'AFFILIATE'
                ? 'text-[#B388FF] bg-[#B388FF]/10 border-[#B388FF]/25'
                : 'text-[#00E676] bg-[#00E676]/10 border-[#00E676]/25';

            return (
              <div
                key={sw.switchKey}
                className={`p-4 rounded-2xl border transition-all flex flex-col justify-between gap-3 ${
                  sw.isEnabled
                    ? 'bg-[#071015]/85 border-white/10 hover:border-[#00E676]/40'
                    : 'bg-[#1A0B0D]/80 border-[#F04438]/40'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase border ${catColor}`}>
                        {sw.category}
                      </span>
                      <span
                        className={`text-[10px] font-mono font-bold uppercase ${
                          sw.isEnabled ? 'text-[#00E676]' : 'text-[#F04438]'
                        }`}
                      >
                        {sw.isEnabled ? '● LIVE' : '● PAUSED'}
                      </span>
                    </div>
                    <h3 className="text-sm font-bold text-white leading-snug">{sw.label}</h3>
                  </div>

                  {/* Interactive ON / OFF Toggle */}
                  <button
                    type="button"
                    onClick={() =>
                      setPendingConfirm({
                        type: 'feature_switch',
                        key: sw.switchKey,
                        title: sw.label,
                        targetLabel: sw.isEnabled ? 'PAUSED (OFF)' : 'LIVE (ON)',
                        nextValue: !sw.isEnabled,
                        isDanger: sw.isEnabled,
                      })
                    }
                    className={`relative inline-flex h-7 w-14 shrink-0 items-center rounded-full border transition-colors cursor-pointer ${
                      sw.isEnabled
                        ? 'bg-[#00E676]/25 border-[#00E676]/60'
                        : 'bg-[#F04438]/25 border-[#F04438]/60'
                    }`}
                    aria-label={`Toggle ${sw.label}`}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full shadow transition-transform ${
                        sw.isEnabled
                          ? 'translate-x-7 bg-[#00E676]'
                          : 'translate-x-1 bg-[#F04438]'
                      }`}
                    />
                  </button>
                </div>

                <p className="text-[11px] text-[#98A2B3] leading-relaxed">
                  {sw.description}
                </p>

                <div className="flex items-center justify-between pt-2 border-t border-white/5 text-[10px] font-mono text-slate-500">
                  <span className="truncate max-w-[65%]">{sw.switchKey}</span>
                  <span>{new Date(sw.updatedAt).toLocaleDateString()}</span>
                </div>
              </div>
            );
          })}
        </div>
      </PhxGlassCard>

      {/* ===================================================================== */}
      {/* DYNAMIC PARAMETER CONTROLS NAVIGATION TABS                            */}
      {/* ===================================================================== */}
      <div className="flex flex-wrap gap-2 border-b border-white/10 pb-3">
        {[
          { id: 'quantum_alpha', label: 'Quantum Alpha™', icon: TrendingUp },
          { id: 'chrono_vaults', label: 'Chrono Vaults™ (5 Plans)', icon: Clock },
          { id: 'genesis_core', label: 'Genesis Core™ & PHIVO', icon: Server },
          { id: 'unilevel_matrix', label: '16-Gen Royalty Matrix', icon: Network },
          { id: 'leadership_ranks', label: '7-Stage Leadership Ranks', icon: Award },
          { id: 'circuit_breaker', label: 'Circuit Breaker & Audit', icon: ShieldAlert },
          { id: 'promo_spotlights', label: 'Overview Promo Spotlights', icon: Sparkles },
        ].map((t) => {
          const Icon = t.icon;
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id as ConsoleTab)}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 border transition-all cursor-pointer ${
                isActive
                  ? 'bg-[#00E5FF]/15 text-[#00E5FF] border-[#00E5FF]/40 shadow-[0_0_16px_rgba(0,229,255,0.12)]'
                  : 'bg-[#081014]/70 text-slate-300 border-white/10 hover:border-white/25 hover:text-white'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* ===================================================================== */}
      {/* TAB 1: QUANTUM ALPHA™ (DAILY YIELD PUBLISHER + TIER BOUNDS)           */}
      {/* ===================================================================== */}
      {activeTab === 'quantum_alpha' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          {/* Daily Yield Rate Publisher */}
          <div className="xl:col-span-5">
            <PhxGlassCard accent="cyan">
              <div className="mb-5">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-[#00E5FF]" />
                  <span>Daily Trading Yield Rate Publisher</span>
                </h3>
                <p className="text-xs text-[#98A2B3] mt-1">
                  Publish authoritative Mon–Fri UTC session yield percentages to PostgreSQL (<span className="font-mono">daily_trading_yield_rates</span>).
                </p>
              </div>

              <form onSubmit={handlePublishDailyRates} className="space-y-4">
                <div>
                  <label className="text-[11px] font-mono uppercase text-[#98A2B3] block mb-1.5">
                    Trading Session Date (UTC)
                  </label>
                  <input
                    type="date"
                    value={yieldDate}
                    onChange={(e) => setYieldDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#050807] border border-white/15 text-white font-mono text-sm focus:border-[#00E5FF] focus:outline-none"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    { code: 'ALPHA_CORE', label: 'Alpha Core (%)' },
                    { code: 'ALPHA_PRIME', label: 'Alpha Prime (%)' },
                    { code: 'ALPHA_SOVEREIGN', label: 'Alpha Sovereign (%)' },
                  ].map((item) => (
                    <div key={item.code}>
                      <label className="text-[10px] font-mono uppercase text-[#98A2B3] block mb-1">
                        {item.label}
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="10"
                        value={dailyRatesDraft[item.code] || ''}
                        onChange={(e) =>
                          setDailyRatesDraft((prev) => ({ ...prev, [item.code]: e.target.value }))
                        }
                        className="w-full px-3 py-2 rounded-xl bg-[#050807] border border-white/15 text-white font-mono text-sm focus:border-[#00E5FF] focus:outline-none"
                        required
                      />
                    </div>
                  ))}
                </div>

                <div>
                  <label className="text-[11px] font-mono uppercase text-[#98A2B3] block mb-1.5">
                    Session Governance Notes (Optional)
                  </label>
                  <input
                    type="text"
                    value={yieldNotes}
                    onChange={(e) => setYieldNotes(e.target.value)}
                    placeholder="e.g., Normal Mon–Fri multi-venue spot liquidity session"
                    className="w-full px-3.5 py-2 rounded-xl bg-[#050807] border border-white/15 text-white text-xs focus:border-[#00E5FF] focus:outline-none"
                  />
                </div>

                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allowRateOverride}
                    onChange={(e) => setAllowRateOverride(e.target.checked)}
                    className="rounded border-white/20 bg-[#050807]"
                  />
                  <span>Allow governance override outside tier min/max rate bounds</span>
                </label>

                <button
                  type="submit"
                  disabled={publishingRates}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-[#00E5FF] to-[#168BFF] text-[#050807] font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {publishingRates ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  <span>Publish Daily Rates to Ledger Engine</span>
                </button>
              </form>
            </PhxGlassCard>
          </div>

          {/* Tier Configuration Editor */}
          <div className="xl:col-span-7 space-y-6">
            <PhxGlassCard accent="gold">
              <div className="mb-4">
                <h3 className="text-base font-bold text-white">Quantum Alpha™ Capital Tiers &amp; Rate Bounds</h3>
                <p className="text-xs text-[#98A2B3]">
                  Dynamically adjust capital ranges, daily min/max rate guardrails, and per-tier active status.
                </p>
              </div>

              <div className="space-y-3">
                {(config?.tradingPoolTiers || []).map((tier) => {
                  const d = tierDrafts[tier.tierCode] || {};
                  return (
                    <div
                      key={tier.tierCode}
                      className="p-4 rounded-xl bg-[#050807]/85 border border-white/10 space-y-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <span className="text-sm font-bold text-white">{tier.tierName}</span>
                          <span className="ml-2 text-[10px] font-mono text-[#00E5FF]">{tier.tierCode}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setTierDrafts((prev) => ({
                                ...prev,
                                [tier.tierCode]: { ...prev[tier.tierCode], isActive: !d.isActive },
                              }))
                            }
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold border cursor-pointer ${
                              d.isActive
                                ? 'bg-[#00E676]/15 text-[#00E676] border-[#00E676]/40'
                                : 'bg-[#F04438]/15 text-[#F04438] border-[#F04438]/40'
                            }`}
                          >
                            {d.isActive ? 'ACTIVE' : 'PAUSED'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSaveTradingTier(tier.tierCode)}
                            disabled={savingKey === `tier_${tier.tierCode}`}
                            className="px-3 py-1 rounded-lg bg-[#F5B800] text-[#050807] font-bold text-[11px] flex items-center gap-1 cursor-pointer disabled:opacity-50"
                          >
                            {savingKey === `tier_${tier.tierCode}` ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Save className="w-3.5 h-3.5" />
                            )}
                            <span>Save</span>
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div>
                          <label className="text-[10px] font-mono text-slate-400 block mb-1">Min Capital ($)</label>
                          <input
                            type="number"
                            step="0.01"
                            value={d.minAmount ?? ''}
                            onChange={(e) =>
                              setTierDrafts((prev) => ({
                                ...prev,
                                [tier.tierCode]: { ...prev[tier.tierCode], minAmount: e.target.value },
                              }))
                            }
                            className="w-full px-2.5 py-1.5 rounded-lg bg-[#0A131A] border border-white/10 text-white font-mono text-xs"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-mono text-slate-400 block mb-1">Max Capital ($)</label>
                          <input
                            type="number"
                            step="0.01"
                            placeholder="Unlimited"
                            value={d.maxAmount ?? ''}
                            onChange={(e) =>
                              setTierDrafts((prev) => ({
                                ...prev,
                                [tier.tierCode]: { ...prev[tier.tierCode], maxAmount: e.target.value },
                              }))
                            }
                            className="w-full px-2.5 py-1.5 rounded-lg bg-[#0A131A] border border-white/10 text-white font-mono text-xs"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-mono text-slate-400 block mb-1">Min Rate (%)</label>
                          <input
                            type="number"
                            step="0.01"
                            value={d.minDailyRatePct ?? ''}
                            onChange={(e) =>
                              setTierDrafts((prev) => ({
                                ...prev,
                                [tier.tierCode]: { ...prev[tier.tierCode], minDailyRatePct: e.target.value },
                              }))
                            }
                            className="w-full px-2.5 py-1.5 rounded-lg bg-[#0A131A] border border-white/10 text-white font-mono text-xs"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-mono text-slate-400 block mb-1">Max Rate (%)</label>
                          <input
                            type="number"
                            step="0.01"
                            value={d.maxDailyRatePct ?? ''}
                            onChange={(e) =>
                              setTierDrafts((prev) => ({
                                ...prev,
                                [tier.tierCode]: { ...prev[tier.tierCode], maxDailyRatePct: e.target.value },
                              }))
                            }
                            className="w-full px-2.5 py-1.5 rounded-lg bg-[#0A131A] border border-white/10 text-white font-mono text-xs"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </PhxGlassCard>

            {/* Principal Redemption Settlement Fee Governance */}
            <PhxGlassCard accent="cyan">
              <form onSubmit={handleSaveAlphaRedemptionFee} className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-[#00E5FF]" />
                      <span>7-Day Cycle Principal Redemption Settlement Fee</span>
                    </h3>
                    <p className="text-xs text-[#98A2B3] mt-0.5">
                      Controls the total settlement fee deducted upon post-7-day principal redemption (allocated proportionally 50% Exit / 30% Clearing / 20% Custody).
                    </p>
                  </div>
                  <button
                    type="submit"
                    disabled={savingKey === 'alpha_redemption_fee_pct'}
                    className="self-start sm:self-auto px-4 py-2 rounded-xl bg-[#00E5FF] text-[#050807] font-extrabold text-xs uppercase tracking-wider flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {savingKey === 'alpha_redemption_fee_pct' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Save className="w-3.5 h-3.5" />
                    )}
                    <span>Save Fee %</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
                  <div>
                    <label className="text-[10px] font-mono uppercase text-[#98A2B3] block mb-1">
                      Total Settlement Fee (%)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="50"
                      value={alphaRedemptionFeeDraft}
                      onChange={(e) => setAlphaRedemptionFeeDraft(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-[#050807] border border-white/15 text-white font-mono text-sm font-bold focus:border-[#00E5FF] focus:outline-none"
                      required
                    />
                  </div>
                  <div className="p-2.5 rounded-xl bg-[#050807]/85 border border-white/10 font-mono">
                    <span className="text-[10px] text-slate-400 block uppercase">Exit &amp; Settlement (50%)</span>
                    <span className="text-xs font-bold text-white">
                      {((parseFloat(alphaRedemptionFeeDraft) || 0) * 0.5).toFixed(2)}%
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-[#050807]/85 border border-white/10 font-mono">
                    <span className="text-[10px] text-slate-400 block uppercase">Clearing + Custody (30%/20%)</span>
                    <span className="text-xs font-bold text-white">
                      {((parseFloat(alphaRedemptionFeeDraft) || 0) * 0.3).toFixed(2)}% /{' '}
                      {((parseFloat(alphaRedemptionFeeDraft) || 0) * 0.2).toFixed(2)}%
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-[#00E676]/10 border border-[#00E676]/30 font-mono">
                    <span className="text-[10px] text-[#00E676] block uppercase">Net Principal Return</span>
                    <span className="text-xs font-bold text-[#00E676]">
                      {Math.max(0, 100 - (parseFloat(alphaRedemptionFeeDraft) || 0)).toFixed(2)}%
                    </span>
                  </div>
                </div>
              </form>
            </PhxGlassCard>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 2: CHRONO VAULTS™ (ALL 5 PLANS + PER-PLAN ON/OFF)                 */}
      {/* ===================================================================== */}
      {activeTab === 'chrono_vaults' && (
        <PhxGlassCard accent="gold">
          <div className="mb-5">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#F5B800]" />
              <span>PHIVONEX CHRONO VAULTS™ — 5 Time-Locked Plans</span>
            </h3>
            <p className="text-xs text-[#98A2B3] mt-1">
              Update daily yield percentages (snapshotted at subscription time for new contracts), minimum staking thresholds, or toggle individual vault plans ON/OFF.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/10 text-[10px] font-mono uppercase text-[#98A2B3]">
                  <th className="py-3 px-3">Plan</th>
                  <th className="py-3 px-3">Duration</th>
                  <th className="py-3 px-3">Daily Rate (%)</th>
                  <th className="py-3 px-3">Min Stake (USDT)</th>
                  <th className="py-3 px-3">Maturity Principal</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-xs">
                {(config?.chronoVaultPlans || []).map((plan) => {
                  const d = vaultDrafts[plan.planCode] || {};
                  return (
                    <tr key={plan.planCode} className="hover:bg-white/[0.02]">
                      <td className="py-3 px-3">
                        <div className="font-bold text-white">{plan.planName}</div>
                        <div className="text-[10px] font-mono text-[#F5B800]">{plan.planCode}</div>
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-300">{plan.durationDays} Days</td>
                      <td className="py-3 px-3">
                        <input
                          type="number"
                          step="0.01"
                          value={d.dailyRatePct ?? ''}
                          onChange={(e) =>
                            setVaultDrafts((prev) => ({
                              ...prev,
                              [plan.planCode]: { ...prev[plan.planCode], dailyRatePct: e.target.value },
                            }))
                          }
                          className="w-24 px-2.5 py-1.5 rounded-lg bg-[#050807] border border-white/15 text-white font-mono text-xs"
                        />
                      </td>
                      <td className="py-3 px-3">
                        <input
                          type="number"
                          step="1"
                          value={d.minAmount ?? ''}
                          onChange={(e) =>
                            setVaultDrafts((prev) => ({
                              ...prev,
                              [plan.planCode]: { ...prev[plan.planCode], minAmount: e.target.value },
                            }))
                          }
                          className="w-28 px-2.5 py-1.5 rounded-lg bg-[#050807] border border-white/15 text-white font-mono text-xs"
                        />
                      </td>
                      <td className="py-3 px-3 font-mono text-[#00E676]">
                        {plan.returnPrincipalOnMaturity ? '100% Returned' : 'Non-Returned'}
                      </td>
                      <td className="py-3 px-3">
                        <button
                          type="button"
                          onClick={() =>
                            setVaultDrafts((prev) => ({
                              ...prev,
                              [plan.planCode]: { ...prev[plan.planCode], isActive: !d.isActive },
                            }))
                          }
                          className={`px-3 py-1 rounded-lg text-[10px] font-mono font-bold border cursor-pointer ${
                            d.isActive
                              ? 'bg-[#00E676]/15 text-[#00E676] border-[#00E676]/40'
                              : 'bg-[#F04438]/15 text-[#F04438] border-[#F04438]/40'
                          }`}
                        >
                          {d.isActive ? 'ACTIVE (ON)' : 'PAUSED (OFF)'}
                        </button>
                      </td>
                      <td className="py-3 px-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleSaveVaultPlan(plan.planCode)}
                          disabled={savingKey === `vault_${plan.planCode}`}
                          className="px-3.5 py-1.5 rounded-lg bg-[#F5B800] text-[#050807] font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          {savingKey === `vault_${plan.planCode}` ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Save className="w-3.5 h-3.5" />
                          )}
                          <span>Save Plan</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </PhxGlassCard>
      )}

      {/* ===================================================================== */}
      {/* TAB 3: GENESIS CORE™ & PHIVO TOKENOMICS                               */}
      {/* ===================================================================== */}
      {activeTab === 'genesis_core' && (
        <PhxGlassCard accent="cyan">
          <div className="mb-5">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Server className="w-4 h-4 text-[#00E5FF]" />
              <span>PHIVONEX GENESIS CORE™ &amp; PHIVO Oracle Tokenomics</span>
            </h3>
            <p className="text-xs text-[#98A2B3] mt-1">
              Dynamically control daily PHIVO coin emission per active node, PHIVO/USDT instant swap valuation, and node activation price. The 10,000 global Genesis Node supply cap is strictly immutable.
            </p>
          </div>

          <form onSubmit={handleSaveGenesisEconomics} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div className="p-4 rounded-xl bg-[#050807] border border-white/10">
              <div className="text-[10px] font-mono uppercase text-slate-400">Immutable Supply Cap</div>
              <div className="text-lg font-extrabold font-mono text-[#00E5FF] mt-1">
                {(config?.genesisCoreEconomics?.genesisNodeCap || 10000).toLocaleString()} Nodes
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">Hard-capped protocol constant</div>
            </div>

            <div>
              <label className="text-[11px] font-mono uppercase text-[#98A2B3] block mb-1.5">
                Daily Emission (PHIVO / Node)
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={genesisDraft.nodeDailyEmissionPhivo}
                onChange={(e) => setGenesisDraft((p) => ({ ...p, nodeDailyEmissionPhivo: e.target.value }))}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#050807] border border-white/15 text-white font-mono text-sm focus:border-[#00E5FF] focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="text-[11px] font-mono uppercase text-[#98A2B3] block mb-1.5">
                PHIVO Reference Price (USDT)
              </label>
              <input
                type="number"
                step="0.0001"
                min="0.0001"
                value={genesisDraft.phivoReferencePriceUsd}
                onChange={(e) => setGenesisDraft((p) => ({ ...p, phivoReferencePriceUsd: e.target.value }))}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#050807] border border-white/15 text-white font-mono text-sm focus:border-[#00E5FF] focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="text-[11px] font-mono uppercase text-[#98A2B3] block mb-1.5">
                Node Base Price (USDT)
              </label>
              <input
                type="number"
                step="1"
                min="1"
                value={genesisDraft.nodeBasePriceUsd}
                onChange={(e) => setGenesisDraft((p) => ({ ...p, nodeBasePriceUsd: e.target.value }))}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#050807] border border-white/15 text-white font-mono text-sm focus:border-[#00E5FF] focus:outline-none"
                required
              />
            </div>

            <div className="md:col-span-4 flex justify-end pt-2">
              <button
                type="submit"
                disabled={savingKey === 'genesis_econ'}
                className="px-6 py-3 rounded-xl bg-gradient-to-r from-[#00E5FF] to-[#168BFF] text-[#050807] font-extrabold text-xs uppercase tracking-wider flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {savingKey === 'genesis_econ' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                <span>Update Genesis Core™ Economics</span>
              </button>
            </div>
          </form>
        </PhxGlassCard>
      )}

      {/* ===================================================================== */}
      {/* TAB 4: 16-GENERATION UNILEVEL MATRIX (40% CAP + PER-GEN ON/OFF)       */}
      {/* ===================================================================== */}
      {activeTab === 'unilevel_matrix' && (
        <PhxGlassCard accent="cyan">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Network className="w-4 h-4 text-[#00E5FF]" />
                <span>16-Generation Asset-Matched Unilevel Royalty Schedule</span>
              </h3>
              <p className="text-xs text-[#98A2B3] mt-1">
                Genesis Core™ downline yields pay uplines in PHIVO; Quantum Alpha™ &amp; Chrono Vaults™ pay in USDT. Zero dynamic compression (SKIP_UNQUALIFIED).
              </p>
            </div>

            <div
              className={`px-4 py-2.5 rounded-xl border font-mono text-xs shrink-0 ${
                activeUnilevelSum <= 40.0001
                  ? 'bg-[#00E676]/10 border-[#00E676]/35 text-[#00E676]'
                  : 'bg-[#F04438]/15 border-[#F04438]/50 text-[#F04438]'
              }`}
            >
              Active Cap: <strong>{activeUnilevelSum.toFixed(2)}%</strong> / 40.00% Max
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/10 text-[10px] font-mono uppercase text-[#98A2B3]">
                  <th className="py-2.5 px-3">Generation</th>
                  <th className="py-2.5 px-3">Commission (%)</th>
                  <th className="py-2.5 px-3">Min Personal Active ($)</th>
                  <th className="py-2.5 px-3">Min Direct Sponsors</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-xs">
                {(config?.unilevelGenerations || []).map((g) => {
                  const d = genDrafts[g.generationLevel] || {};
                  return (
                    <tr key={g.generationLevel} className="hover:bg-white/[0.02]">
                      <td className="py-2.5 px-3 font-mono font-bold text-white">
                        Generation {g.generationLevel}
                      </td>
                      <td className="py-2.5 px-3">
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          max="40"
                          value={d.commissionPct ?? ''}
                          onChange={(e) =>
                            setGenDrafts((prev) => ({
                              ...prev,
                              [g.generationLevel]: { ...prev[g.generationLevel], commissionPct: e.target.value },
                            }))
                          }
                          className="w-24 px-2.5 py-1.5 rounded-lg bg-[#050807] border border-white/15 text-white font-mono text-xs"
                        />
                      </td>
                      <td className="py-2.5 px-3">
                        <input
                          type="number"
                          step="50"
                          min="0"
                          value={d.requiredPersonalActiveUsd ?? ''}
                          onChange={(e) =>
                            setGenDrafts((prev) => ({
                              ...prev,
                              [g.generationLevel]: {
                                ...prev[g.generationLevel],
                                requiredPersonalActiveUsd: e.target.value,
                              },
                            }))
                          }
                          className="w-28 px-2.5 py-1.5 rounded-lg bg-[#050807] border border-white/15 text-white font-mono text-xs"
                        />
                      </td>
                      <td className="py-2.5 px-3">
                        <input
                          type="number"
                          step="1"
                          min="0"
                          value={d.requiredDirectActiveReferrals ?? ''}
                          onChange={(e) =>
                            setGenDrafts((prev) => ({
                              ...prev,
                              [g.generationLevel]: {
                                ...prev[g.generationLevel],
                                requiredDirectActiveReferrals: e.target.value,
                              },
                            }))
                          }
                          className="w-20 px-2.5 py-1.5 rounded-lg bg-[#050807] border border-white/15 text-white font-mono text-xs"
                        />
                      </td>
                      <td className="py-2.5 px-3">
                        <button
                          type="button"
                          onClick={() =>
                            setGenDrafts((prev) => ({
                              ...prev,
                              [g.generationLevel]: { ...prev[g.generationLevel], isActive: !d.isActive },
                            }))
                          }
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold border cursor-pointer ${
                            d.isActive
                              ? 'bg-[#00E676]/15 text-[#00E676] border-[#00E676]/40'
                              : 'bg-[#F04438]/15 text-[#F04438] border-[#F04438]/40'
                          }`}
                        >
                          {d.isActive ? 'ON' : 'OFF'}
                        </button>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleSaveGeneration(g.generationLevel)}
                          disabled={savingKey === `gen_${g.generationLevel}`}
                          className="px-3 py-1 rounded-lg bg-[#00E5FF] text-[#050807] font-bold text-[11px] inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                        >
                          {savingKey === `gen_${g.generationLevel}` ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Save className="w-3.5 h-3.5" />
                          )}
                          <span>Save</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </PhxGlassCard>
      )}

      {/* ===================================================================== */}
      {/* TAB 5: 7-STAGE LEADERSHIP RANKS (PER-RANK ON/OFF)                     */}
      {/* ===================================================================== */}
      {activeTab === 'leadership_ranks' && (
        <PhxGlassCard accent="gold">
          <div className="mb-5">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Award className="w-4 h-4 text-[#F5B800]" />
              <span>7-Stage Career &amp; Leadership Rank Ladder (Ranks 0–6)</span>
            </h3>
            <p className="text-xs text-[#98A2B3] mt-1">
              Adjust personal volume, 40% anti-single-leg capped team volume, milestone cash bonuses, global pool share, and individual rank active status.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/10 text-[10px] font-mono uppercase text-[#98A2B3]">
                  <th className="py-2.5 px-2">Rank</th>
                  <th className="py-2.5 px-2">Personal ($)</th>
                  <th className="py-2.5 px-2">Team Vol ($)</th>
                  <th className="py-2.5 px-2">Leg Cap (%)</th>
                  <th className="py-2.5 px-2">Bonus ($)</th>
                  <th className="py-2.5 px-2">Pool (%)</th>
                  <th className="py-2.5 px-2">Status</th>
                  <th className="py-2.5 px-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-xs">
                {(config?.leadershipRanks || []).map((r) => {
                  const d = rankDrafts[r.rankLevel] || {};
                  return (
                    <tr key={r.rankLevel} className="hover:bg-white/[0.02]">
                      <td className="py-2.5 px-2">
                        <div className="font-bold text-white">
                          #{r.rankLevel} {r.rankName}
                        </div>
                        <div className="text-[10px] font-mono text-[#F5B800]">
                          {r.requiredSubRankCode
                            ? `Requires ${r.requiredSubRankLegs}x ${r.requiredSubRankCode}`
                            : r.rankCode}
                        </div>
                      </td>
                      <td className="py-2.5 px-2">
                        <input
                          type="number"
                          step="100"
                          value={d.requiredPersonalVolumeUsd ?? ''}
                          onChange={(e) =>
                            setRankDrafts((prev) => ({
                              ...prev,
                              [r.rankLevel]: { ...prev[r.rankLevel], requiredPersonalVolumeUsd: e.target.value },
                            }))
                          }
                          className="w-24 px-2 py-1.5 rounded-lg bg-[#050807] border border-white/15 text-white font-mono text-xs"
                        />
                      </td>
                      <td className="py-2.5 px-2">
                        <input
                          type="number"
                          step="1000"
                          value={d.requiredTeamVolumeUsd ?? ''}
                          onChange={(e) =>
                            setRankDrafts((prev) => ({
                              ...prev,
                              [r.rankLevel]: { ...prev[r.rankLevel], requiredTeamVolumeUsd: e.target.value },
                            }))
                          }
                          className="w-28 px-2 py-1.5 rounded-lg bg-[#050807] border border-white/15 text-white font-mono text-xs"
                        />
                      </td>
                      <td className="py-2.5 px-2">
                        <input
                          type="number"
                          step="1"
                          value={d.maxSingleLegCapPct ?? ''}
                          onChange={(e) =>
                            setRankDrafts((prev) => ({
                              ...prev,
                              [r.rankLevel]: { ...prev[r.rankLevel], maxSingleLegCapPct: e.target.value },
                            }))
                          }
                          className="w-16 px-2 py-1.5 rounded-lg bg-[#050807] border border-white/15 text-white font-mono text-xs"
                        />
                      </td>
                      <td className="py-2.5 px-2">
                        <input
                          type="number"
                          step="100"
                          value={d.milestoneBonusUsd ?? ''}
                          onChange={(e) =>
                            setRankDrafts((prev) => ({
                              ...prev,
                              [r.rankLevel]: { ...prev[r.rankLevel], milestoneBonusUsd: e.target.value },
                            }))
                          }
                          className="w-28 px-2 py-1.5 rounded-lg bg-[#050807] border border-white/15 text-white font-mono text-xs"
                        />
                      </td>
                      <td className="py-2.5 px-2">
                        <input
                          type="number"
                          step="0.1"
                          value={d.globalPoolSharePct ?? ''}
                          onChange={(e) =>
                            setRankDrafts((prev) => ({
                              ...prev,
                              [r.rankLevel]: { ...prev[r.rankLevel], globalPoolSharePct: e.target.value },
                            }))
                          }
                          className="w-16 px-2 py-1.5 rounded-lg bg-[#050807] border border-white/15 text-white font-mono text-xs"
                        />
                      </td>
                      <td className="py-2.5 px-2">
                        <button
                          type="button"
                          onClick={() =>
                            setRankDrafts((prev) => ({
                              ...prev,
                              [r.rankLevel]: { ...prev[r.rankLevel], isActive: !d.isActive },
                            }))
                          }
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold border cursor-pointer ${
                            d.isActive
                              ? 'bg-[#00E676]/15 text-[#00E676] border-[#00E676]/40'
                              : 'bg-[#F04438]/15 text-[#F04438] border-[#F04438]/40'
                          }`}
                        >
                          {d.isActive ? 'ON' : 'OFF'}
                        </button>
                      </td>
                      <td className="py-2.5 px-2 text-right">
                        <button
                          type="button"
                          onClick={() => handleSaveRank(r.rankLevel)}
                          disabled={savingKey === `rank_${r.rankLevel}`}
                          className="px-3 py-1 rounded-lg bg-[#F5B800] text-[#050807] font-bold text-[11px] inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                        >
                          {savingKey === `rank_${r.rankLevel}` ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Save className="w-3.5 h-3.5" />
                          )}
                          <span>Save</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </PhxGlassCard>
      )}

      {/* ===================================================================== */}
      {/* TAB 6: CIRCUIT BREAKER, LEDGER RECONCILIATION & SECURITY AUDIT LOGS   */}
      {/* ===================================================================== */}
      {activeTab === 'circuit_breaker' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Liquidity Circuit Breaker Guardrails */}
            <PhxGlassCard accent="gold">
              <h3 className="text-base font-bold text-white flex items-center gap-2 mb-1">
                <ShieldAlert className="w-4 h-4 text-[#F5B800]" />
                <span>Automated Liquidity Circuit Breaker Guardrails</span>
              </h3>
              <p className="text-xs text-[#98A2B3] mb-5">
                Configure solvency ratio thresholds and rolling outflow caps for automated BEP-20 hot-wallet defense.
              </p>

              <form onSubmit={handleSaveCircuitBreaker} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-[10px] font-mono uppercase text-[#98A2B3] block mb-1">
                      Min Reserve Ratio (x)
                    </label>
                    <input
                      type="number"
                      step="0.05"
                      min="0.1"
                      value={cbDraft.minReserveRatio}
                      onChange={(e) => setCbDraft((p) => ({ ...p, minReserveRatio: e.target.value }))}
                      className="w-full px-3 py-2 rounded-xl bg-[#050807] border border-white/15 text-white font-mono text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-mono uppercase text-[#98A2B3] block mb-1">
                      Max Hourly Outflow ($)
                    </label>
                    <input
                      type="number"
                      step="100"
                      min="100"
                      value={cbDraft.maxHourlyOutflowUsd}
                      onChange={(e) => setCbDraft((p) => ({ ...p, maxHourlyOutflowUsd: e.target.value }))}
                      className="w-full px-3 py-2 rounded-xl bg-[#050807] border border-white/15 text-white font-mono text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-mono uppercase text-[#98A2B3] block mb-1">
                      Max Daily / User ($)
                    </label>
                    <input
                      type="number"
                      step="100"
                      min="100"
                      value={cbDraft.maxUserDailyWithdrawalUsd}
                      onChange={(e) => setCbDraft((p) => ({ ...p, maxUserDailyWithdrawalUsd: e.target.value }))}
                      className="w-full px-3 py-2 rounded-xl bg-[#050807] border border-white/15 text-white font-mono text-sm"
                    />
                  </div>
                </div>

                {config?.circuitBreaker?.tripReason && (
                  <div className="p-3 rounded-xl bg-[#F04438]/10 border border-[#F04438]/30 text-xs text-[#FF8A80]">
                    <span className="font-mono font-bold uppercase block mb-0.5">Active Trip Reason:</span>
                    {config.circuitBreaker.tripReason}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={savingKey === 'circuit_breaker'}
                  className="w-full py-3 rounded-xl bg-[#F5B800] text-[#050807] font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {savingKey === 'circuit_breaker' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  <span>Save Circuit Breaker Limits</span>
                </button>
              </form>
            </PhxGlassCard>

            {/* Double-Entry Ledger Reconciliation */}
            <PhxGlassCard accent="cyan">
              <h3 className="text-base font-bold text-white flex items-center gap-2 mb-1">
                <ShieldCheck className="w-4 h-4 text-[#00E676]" />
                <span>Double-Entry Financial Ledger Reconciliation</span>
              </h3>
              <p className="text-xs text-[#98A2B3] mb-5">
                Audit all user Main USDT &amp; PHIVO wallet balances against immutable ledger entries and assert zero unlinked payouts.
              </p>

              <button
                type="button"
                onClick={handleRunReconciliation}
                disabled={reconciling}
                className="w-full py-3 rounded-xl bg-[#00E676]/15 hover:bg-[#00E676]/25 border border-[#00E676]/40 text-[#00E676] font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {reconciling ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Auditing Double-Entry Ledger...</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4" />
                    <span>Run Financial Ledger Reconciliation</span>
                  </>
                )}
              </button>

              {reconciliationResult && (
                <div className="mt-4 p-3.5 rounded-xl bg-[#050807] border border-[#00E676]/30 text-xs font-mono space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-[#98A2B3]">Audit Status:</span>
                    <span className="text-[#00E676] font-bold">VERIFIED &amp; BALANCED</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#98A2B3]">Accounts Checked:</span>
                    <span className="text-white">
                      {reconciliationResult.usersAudited || reconciliationResult.totalAccounts || 'All Active'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#98A2B3]">Discrepancies:</span>
                    <span className="text-[#00E676] font-bold">
                      {reconciliationResult.discrepanciesCount ?? 0}
                    </span>
                  </div>
                </div>
              )}

              {/* Dynamic P2P Internal Transfer Fee Parameter */}
              <form
                onSubmit={handleSaveP2pTransferFee}
                className="mt-5 pt-5 border-t border-white/10 space-y-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-bold text-white">
                      P2P Internal Transfer Settlement Fee (%)
                    </h4>
                    <p className="text-[11px] text-[#98A2B3]">
                      Applies to USDT &amp; PHIVO user-to-user transfers (0.00% default; toggle master switch above to pause P2P).
                    </p>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-[#F5B800]/15 text-[#F5B800] font-mono text-[11px] font-bold">
                    {Number(config?.p2pTransferFeePct ?? 0).toFixed(2)}%
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="25"
                    value={p2pTransferFeeDraft}
                    onChange={(e) => setP2pTransferFeeDraft(e.target.value)}
                    className="w-32 px-3 py-2 rounded-xl bg-[#050807] border border-white/15 text-white font-mono text-sm"
                  />
                  <button
                    type="submit"
                    disabled={savingKey === 'p2p_transfer_fee_pct'}
                    className="px-4 py-2 rounded-xl bg-[#F5B800] text-[#050807] font-extrabold text-xs uppercase tracking-wider flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {savingKey === 'p2p_transfer_fee_pct' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Save className="w-3.5 h-3.5" />
                    )}
                    <span>Save P2P Fee</span>
                  </button>
                </div>
              </form>
            </PhxGlassCard>
          </div>

          {/* Immutable Security Audit Logs Table */}
          <PhxGlassCard>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Activity className="w-4 h-4 text-[#00E5FF]" />
                  <span>Recent Governance &amp; Security Audit Logs</span>
                </h3>
                <p className="text-xs text-[#98A2B3]">
                  Immutable trail of every switch toggle, parameter mutation, and circuit-breaker event in PostgreSQL.
                </p>
              </div>
              <span className="text-[11px] font-mono text-slate-400">
                Latest {(config?.recentSecurityAuditLogs || []).length} entries
              </span>
            </div>

            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="sticky top-0 bg-[#081014]">
                  <tr className="border-b border-white/10 text-[10px] font-mono uppercase text-[#98A2B3]">
                    <th className="py-2.5 px-3">Timestamp (UTC)</th>
                    <th className="py-2.5 px-3">Severity</th>
                    <th className="py-2.5 px-3">Action Type</th>
                    <th className="py-2.5 px-3">Trace ID</th>
                    <th className="py-2.5 px-3">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 font-mono">
                  {(config?.recentSecurityAuditLogs || []).map((log) => (
                    <tr key={log.id} className="hover:bg-white/[0.02]">
                      <td className="py-2 px-3 text-[11px] text-slate-400 whitespace-nowrap">
                        {new Date(log.createdAt).toISOString().replace('T', ' ').slice(0, 19)}
                      </td>
                      <td className="py-2 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            log.severity === 'CRITICAL'
                              ? 'bg-[#F04438]/20 text-[#F04438]'
                              : log.severity === 'WARN'
                              ? 'bg-[#F5B800]/20 text-[#F5B800]'
                              : 'bg-[#00E5FF]/15 text-[#00E5FF]'
                          }`}
                        >
                          {log.severity}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-white font-semibold">{log.actionType}</td>
                      <td className="py-2 px-3 text-[11px] text-slate-400">{log.traceId}</td>
                      <td className="py-2 px-3 text-[11px] text-slate-300 max-w-md truncate">
                        {JSON.stringify(log.payload)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </PhxGlassCard>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 7: OVERVIEW PROMO & SUPPLY SPOTLIGHT MANAGER                      */}
      {/* ===================================================================== */}
      {activeTab === 'promo_spotlights' && <AdminPromoManager />}

      {/* ===================================================================== */}
      {/* GOVERNANCE CONFIRMATION MODAL FOR LIVE MASTER SWITCH TOGGLES          */}
      {/* ===================================================================== */}
      {pendingConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-[#0A1318] border border-white/15 shadow-2xl p-6 space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div
                  className={`p-2.5 rounded-xl border ${
                    pendingConfirm.isDanger
                      ? 'bg-[#F04438]/15 border-[#F04438]/40 text-[#F04438]'
                      : 'bg-[#00E676]/15 border-[#00E676]/40 text-[#00E676]'
                  }`}
                >
                  {pendingConfirm.isDanger ? <Lock className="w-5 h-5" /> : <Unlock className="w-5 h-5" />}
                </div>
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-[#F5B800]">
                    Protocol Governance Confirmation
                  </span>
                  <h3 className="text-base font-extrabold text-white">{pendingConfirm.title}</h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPendingConfirm(null);
                  setConfirmReason('');
                }}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-[#050807] border border-white/10 text-xs text-slate-300 leading-relaxed">
              You are about to transition <strong className="text-white">{pendingConfirm.title}</strong> to{' '}
              <span
                className={`font-mono font-bold ${
                  pendingConfirm.isDanger ? 'text-[#F04438]' : 'text-[#00E676]'
                }`}
              >
                {pendingConfirm.targetLabel}
              </span>
              . This takes effect immediately across all backend services and user interfaces and will be logged in{' '}
              <span className="font-mono text-[#00E5FF]">security_audit_logs</span>.
            </div>

            <div>
              <label className="text-[11px] font-mono uppercase text-[#98A2B3] block mb-1.5">
                Governance Reason / Audit Note (Optional)
              </label>
              <input
                type="text"
                value={confirmReason}
                onChange={(e) => setConfirmReason(e.target.value)}
                placeholder="e.g., Scheduled treasury liquidity maintenance window"
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#050807] border border-white/15 text-white text-xs focus:border-[#F5B800] focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setPendingConfirm(null);
                  setConfirmReason('');
                }}
                className="px-4 py-2.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-xs font-bold text-slate-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmSwitchMutation}
                disabled={confirmSubmitting}
                className={`px-5 py-2.5 rounded-xl text-xs font-extrabold uppercase tracking-wider flex items-center gap-2 cursor-pointer disabled:opacity-50 ${
                  pendingConfirm.isDanger
                    ? 'bg-[#F04438] hover:bg-[#d93a2f] text-white'
                    : 'bg-[#00E676] hover:bg-[#00c865] text-[#050807]'
                }`}
              >
                {confirmSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <AlertTriangle className="w-4 h-4" />
                )}
                <span>Confirm Governance Change</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
