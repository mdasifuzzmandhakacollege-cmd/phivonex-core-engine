import React, { useState, useEffect, useCallback } from 'react';
import {
  Sliders,
  DollarSign,
  TrendingUp,
  Server,
  Users,
  Gift,
  Coins,
  Shield,
  ShieldAlert,
  ShieldCheck,
  RefreshCw,
  Edit3,
  Lock,
  CheckCircle2,
  AlertTriangle,
  History,
  Info,
  Layers,
  ArrowRight,
  Power,
  Search,
  Filter,
  Check,
  Calendar,
  Sparkles,
  Zap,
  Globe
} from 'lucide-react';
import { recordAdminAuditToFirestore } from '../../services/firestoreAuditService';
import { AuditLogger } from '../../services/auditLogger';

export interface EconomicConfigItem {
  id: string;
  configKey: string;
  configValue: any;
  category: 'NODE' | 'REFERRAL' | 'MATCHING' | 'PROMOTION' | 'REWARDS' | 'COIN_PRICE' | 'GATEWAY';
  description: string;
  status: 'ACTIVE' | 'PAUSED' | 'DISABLED';
  version: number;
  effectiveFrom: string;
  updatedByAdminId: string | null;
  updatedByAdminPublicId: string;
  createdAt: string;
  updatedAt: string;
}

export interface EconomicAuditItem {
  id: string;
  configKey: string;
  category: string;
  oldValue: any;
  newValue: any;
  version: number;
  adminUserId: string | null;
  adminPublicId: string;
  reason: string | null;
  effectiveFrom: string;
  ipAddress: string | null;
  createdAt: string;
}

export const EconomicControls: React.FC = () => {
  const [configs, setConfigs] = useState<EconomicConfigItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<EconomicAuditItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [auditLoading, setAuditLoading] = useState<boolean>(false);
  const [activeSection, setActiveSection] = useState<string>('all');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Edit Modal State
  const [editingConfig, setEditingConfig] = useState<EconomicConfigItem | null>(null);
  const [editValueInput, setEditValueInput] = useState<string>('');
  const [editStatusInput, setEditStatusInput] = useState<'ACTIVE' | 'PAUSED' | 'DISABLED'>('ACTIVE');
  const [editReasonInput, setEditReasonInput] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);

  // Structured Tier Editors
  const [matchingTiersList, setMatchingTiersList] = useState<{ units: number; rewardUsd: number }[]>([]);
  const [promotionList, setPromotionList] = useState<{ milestone: string; units: number; rewardUsd: number }[]>([]);
  const [showRawJsonPreview, setShowRawJsonPreview] = useState<boolean>(false);

  // Coin price specific modal state
  const [coinPriceInput, setCoinPriceInput] = useState<string>('0.10');
  const [coinSwapEnabledInput, setCoinSwapEnabledInput] = useState<boolean>(true);

  // Audit filter
  const [auditFilterKey, setAuditFilterKey] = useState<string>('ALL');

  // Fetch configs
  const fetchConfigs = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/economics/configs');
      if (res.ok) {
        const data = await res.json();
        setConfigs(data.configs || []);
      }
    } catch (err) {
      console.error('[EconomicControls] Error fetching configs:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch audit logs
  const fetchAuditLogs = useCallback(async () => {
    try {
      setAuditLoading(true);
      const url = auditFilterKey === 'ALL'
        ? '/api/admin/economics/audit-logs?limit=30'
        : `/api/admin/economics/audit-logs?limit=30&configKey=${auditFilterKey}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setAuditLogs(data.logs || []);
      }
    } catch (err) {
      console.error('[EconomicControls] Error fetching audit logs:', err);
    } finally {
      setAuditLoading(false);
    }
  }, [auditFilterKey]);

  // Dual-mode Daily Mining Rewards / ROI Distribution State
  const [rewardAutomation, setRewardAutomation] = useState<{
    mode: 'AUTOMATIC' | 'MANUAL';
    scheduledTimeUtc: string;
    autoEnabled: boolean;
    lastSettledAt: string | null;
    lastEpochNumber: number | null;
    lastSettledBy: string | null;
    lastSettledMode: 'AUTOMATIC' | 'MANUAL' | null;
  }>({
    mode: 'AUTOMATIC',
    scheduledTimeUtc: '00:00',
    autoEnabled: true,
    lastSettledAt: null,
    lastEpochNumber: null,
    lastSettledBy: null,
    lastSettledMode: null,
  });
  const [updatingRewardMode, setUpdatingRewardMode] = useState<boolean>(false);
  const [triggeringRewardPayout, setTriggeringRewardPayout] = useState<boolean>(false);

  // Fetch reward automation
  const fetchRewardAutomation = useCallback(async () => {
    try {
      const res = await fetch('/api/rewards/distribution-control', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        if (data.config) {
          setRewardAutomation(data.config);
        }
      }
    } catch (err) {
      console.error('[EconomicControls] Error fetching reward automation:', err);
    }
  }, []);

  const handleToggleRewardMode = async (newMode: 'AUTOMATIC' | 'MANUAL') => {
    setUpdatingRewardMode(true);
    try {
      const res = await fetch('/api/rewards/distribution-control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ mode: newMode, scheduledTimeUtc: rewardAutomation.scheduledTimeUtc }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to update reward distribution mode');
      setRewardAutomation(data.config);
      setFeedback({
        type: 'success',
        message: `Daily reward distribution mode switched to ${newMode}. ${newMode === 'AUTOMATIC' ? 'Rewards will distribute automatically on schedule.' : 'Automated payouts paused; manual admin trigger required.'}`
      });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Error updating reward distribution mode' });
    } finally {
      setUpdatingRewardMode(false);
    }
  };

  const handleManualRewardDistribution = async () => {
    if (!window.confirm('Are you sure you want to trigger manual daily mining reward distribution right now? This will calculate and credit ROI to all active nodes immediately.')) {
      return;
    }
    setTriggeringRewardPayout(true);
    try {
      const res = await fetch('/api/rewards/manual-distribute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to execute manual distribution');
      setFeedback({
        type: 'success',
        message: data.message || 'Manual daily mining reward distribution executed successfully!'
      });
      fetchRewardAutomation();
      fetchConfigs();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Manual reward distribution failed.' });
    } finally {
      setTriggeringRewardPayout(false);
    }
  };

  useEffect(() => {
    fetchConfigs();
    fetchAuditLogs();
    fetchRewardAutomation();
  }, [fetchConfigs, fetchAuditLogs, fetchRewardAutomation]);

  // Helper to get config by key
  const getConfig = (key: string): EconomicConfigItem | undefined => {
    return configs.find((c) => c.configKey === key);
  };

  // Open Edit Modal
  const handleOpenEdit = (config: EconomicConfigItem) => {
    if (config.configKey === 'GENESIS_NODE_CAP') {
      setFeedback({
        type: 'error',
        message: 'Genesis Node Cap is strictly immutable (10,000 Genesis Nodes maximum supply).'
      });
      return;
    }

    setEditingConfig(config);
    setEditStatusInput(config.status);
    setEditReasonInput('');
    setShowRawJsonPreview(false);

    if (config.configKey === 'MATCHING_TIERS_CONFIG') {
      const val = Array.isArray(config.configValue) ? config.configValue : [];
      setMatchingTiersList(val.map((t: any) => ({ units: Number(t.units || 0), rewardUsd: Number(t.rewardUsd || 0) })));
      setEditValueInput(JSON.stringify(config.configValue, null, 2));
    } else if (config.configKey === 'PROMOTION_MILESTONES_CONFIG') {
      const val = Array.isArray(config.configValue) ? config.configValue : [];
      setPromotionList(val.map((m: any) => ({
        milestone: String(m.milestone || ''),
        units: Number(m.units || 0),
        rewardUsd: Number(m.rewardUsd || 0),
      })));
      setEditValueInput(JSON.stringify(config.configValue, null, 2));
    } else if (config.configKey === 'INTERNAL_COIN_PRICE_USDT') {
      const val = config.configValue || {};
      setCoinPriceInput(val.priceUsdt ? String(val.priceUsdt) : '');
      setCoinSwapEnabledInput(val.swapEnabled !== false);
      setEditValueInput(JSON.stringify(config.configValue, null, 2));
    } else if (typeof config.configValue === 'object' && config.configValue !== null) {
      setEditValueInput(JSON.stringify(config.configValue, null, 2));
    } else {
      setEditValueInput(String(config.configValue));
    }
  };

  // Submit Config Update
  const handleSaveConfig = async () => {
    if (!editingConfig) return;

    try {
      setSaving(true);
      setFeedback(null);

      if (!editReasonInput || editReasonInput.trim().length < 5) {
        throw new Error('Audit justification reason is required (minimum 5 characters).');
      }

      let parsedValue: any = editValueInput;

      if (editingConfig.configKey === 'MATCHING_TIERS_CONFIG') {
        if (!matchingTiersList || matchingTiersList.length === 0) {
          throw new Error('At least one binary matching tier must be configured.');
        }
        for (const t of matchingTiersList) {
          if (!t.units || t.units <= 0 || !t.rewardUsd || t.rewardUsd <= 0) {
            throw new Error('Each matching tier must have positive matched units and positive reward USD.');
          }
        }
        parsedValue = matchingTiersList;
      } else if (editingConfig.configKey === 'PROMOTION_MILESTONES_CONFIG') {
        if (!promotionList || promotionList.length === 0) {
          throw new Error('At least one promotion milestone must be configured.');
        }
        for (const m of promotionList) {
          if (!m.milestone || !m.milestone.trim() || !m.units || m.units <= 0 || !m.rewardUsd || m.rewardUsd <= 0) {
            throw new Error('Each promotion milestone must have a milestone name, positive units, and positive reward USD.');
          }
        }
        parsedValue = promotionList;
      } else if (editingConfig.configKey === 'NODE_BASE_PRICE_USD' || editingConfig.configKey === 'DIRECT_REFERRAL_COMMISSION_USD') {
        const num = parseFloat(editValueInput);
        if (isNaN(num) || num < 0) {
          throw new Error('Please enter a valid numeric value.');
        }
        parsedValue = num;
      } else if (editingConfig.configKey === 'BSC_REQUIRED_CONFIRMATIONS') {
        const num = parseInt(editValueInput, 10);
        if (isNaN(num) || num < 1) {
          throw new Error('Required confirmations must be an integer >= 1.');
        }
        parsedValue = num;
      } else if (editingConfig.configKey === 'NODE_REWARD_RATE_PER_EPOCH') {
        const num = parseFloat(editValueInput);
        if (isNaN(num) || num <= 0) {
          throw new Error('Reward rate must be a positive numeric amount (e.g. 10, 15, 20, 25).');
        }
        parsedValue = num;
      } else if (editingConfig.configKey === 'INTERNAL_COIN_PRICE_USDT') {
        const price = parseFloat(coinPriceInput);
        if (isNaN(price) || price <= 0) {
          throw new Error('Please enter a valid coin conversion price in USDT.');
        }
        parsedValue = {
          coinSymbol: 'PHIVO',
          priceUsdt: price,
          effectiveFrom: new Date().toISOString(),
          swapEnabled: coinSwapEnabledInput,
        };
      } else if (editingConfig.configKey === 'NODE_SALES_ENABLED' || editingConfig.configKey === 'NODE_REWARDS_ENABLED' || editingConfig.configKey === 'INTERNAL_COIN_SWAP_ENABLED' || editingConfig.configKey === 'CRYPTO_DEPOSITS_ENABLED' || editingConfig.configKey === 'CRYPTO_WITHDRAWALS_ENABLED' || editingConfig.configKey === 'AUTO_WITHDRAWAL_ENABLED') {
        parsedValue = editStatusInput === 'ACTIVE';
      } else if (typeof editingConfig.configValue === 'object') {
        try {
          parsedValue = JSON.parse(editValueInput);
        } catch {
          throw new Error('Invalid JSON format for configuration object.');
        }
      }

      const res = await fetch(`/api/admin/economics/configs/${editingConfig.configKey}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          value: parsedValue,
          status: editStatusInput,
          reason: editReasonInput.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Failed to update economic parameter.');
      }

      setFeedback({
        type: 'success',
        message: `Successfully updated ${editingConfig.configKey} to Version ${data.config.version}.`,
      });

      // Record to Firestore as authoritative audit storage engine via AuditLogger
      try {
        await AuditLogger.logConfigUpdate({
          configKey: editingConfig.configKey,
          oldValue: editingConfig.configValue,
          newValue: parsedValue,
          userUid: editingConfig.updatedByAdminPublicId || 'SUPER_ADMIN',
          reason: editReasonInput.trim() || undefined,
          details: `Updated economic parameter ${editingConfig.configKey} to status ${editStatusInput}.${editReasonInput ? ` Reason: ${editReasonInput}` : ''}`,
          metadata: {
            status: editStatusInput,
            version: data.config?.version,
            category: editingConfig.category,
          },
        });
      } catch (fErr) {
        console.warn('[EconomicControls] Non-blocking Firestore audit log warning:', fErr);
      }

      setEditingConfig(null);
      await fetchConfigs();
      await fetchAuditLogs();
    } catch (err: any) {
      console.error('[EconomicControls] Save error:', err);
      setFeedback({
        type: 'error',
        message: err.message || 'Error updating configuration parameter.',
      });
    } finally {
      setSaving(false);
    }
  };

  // Quick toggle helper for boolean master switches
  const handleQuickToggle = async (config: EconomicConfigItem) => {
    try {
      const nextStatus = config.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
      const nextVal = nextStatus === 'ACTIVE';

      const res = await fetch(`/api/admin/economics/configs/${config.configKey}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          value: nextVal,
          status: nextStatus,
          reason: `Admin quick toggle ${config.configKey} to ${nextStatus}`,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to toggle switch.');
      }

      setFeedback({
        type: 'success',
        message: `${config.configKey} switched to ${nextStatus} (v${data.config.version}).`,
      });

      await fetchConfigs();
      await fetchAuditLogs();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Toggle action failed.',
      });
    }
  };

  // Section configs
  const nodeBasePrice = getConfig('NODE_BASE_PRICE_USD');
  const nodeSalesEnabled = getConfig('NODE_SALES_ENABLED');
  const genesisCap = getConfig('GENESIS_NODE_CAP');
  const referralComm = getConfig('DIRECT_REFERRAL_COMMISSION_USD');
  const matchingTiers = getConfig('MATCHING_TIERS_CONFIG');
  const promotionTiers = getConfig('PROMOTION_MILESTONES_CONFIG');
  const nodeRewardsEnabled = getConfig('NODE_REWARDS_ENABLED');
  const rewardRate = getConfig('NODE_REWARD_RATE_PER_EPOCH');
  const internalCoinPrice = getConfig('INTERNAL_COIN_PRICE_USDT');
  const coinSwapEnabled = getConfig('INTERNAL_COIN_SWAP_ENABLED');
  const cryptoDeposits = getConfig('CRYPTO_DEPOSITS_ENABLED');
  const cryptoWithdrawals = getConfig('CRYPTO_WITHDRAWALS_ENABLED');
  const bscConfirmations = getConfig('BSC_REQUIRED_CONFIRMATIONS');
  const autoWithdrawal = getConfig('AUTO_WITHDRAWAL_ENABLED');

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* Top Banner & Refresh */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-2xl bg-[#07101D] border border-white/[0.08] shadow-xl">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-[#00CFFF]" />
            <h1 className="text-lg font-bold text-white">System Economic Parameters &amp; Monetary Governance</h1>
          </div>
          <p className="text-xs text-[#98A2B3] max-w-2xl leading-relaxed">
            Authoritative controls for Genesis Node pricing, referral commissions, matching tiers, mining rewards, internal coin conversion rates, and blockchain gateways. All parameter changes are strictly versioned with full audit trails.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              fetchConfigs();
              fetchAuditLogs();
            }}
            disabled={loading || auditLoading}
            className="px-3.5 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-white/90 hover:text-white border border-white/[0.08] text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading || auditLoading ? 'animate-spin' : ''}`} />
            Refresh Parameters
          </button>
        </div>
      </div>

      {/* Feedback Alert */}
      {feedback && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between text-xs animate-in fade-in duration-150 ${
            feedback.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-red-500/10 border-red-500/30 text-red-300'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="text-white/60 hover:text-white p-1"
          >
            &times;
          </button>
        </div>
      )}

      {/* SECTION 1: NODE CONTROL */}
      <div className="p-6 rounded-2xl bg-[#07101D] border border-white/[0.08] shadow-lg space-y-5">
        <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#00CFFF]/10 flex items-center justify-center text-[#00CFFF]">
              <Server className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Genesis Node Supply &amp; Pricing Controls</h2>
              <p className="text-xs text-[#98A2B3]">Configure base node price, toggle sales, and inspect immutable supply cap.</p>
            </div>
          </div>
          <span className="px-2.5 py-0.5 rounded-full bg-white/[0.06] text-[10px] font-mono font-bold text-white/80 uppercase">
            Section 1 / 7
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Node Base Price */}
          <div className="p-4 rounded-xl bg-[#05070B] border border-white/[0.06] flex flex-col justify-between space-y-3">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#98A2B3]">Node Base Price (USD)</span>
                <span className="text-[10px] font-mono text-[#00CFFF]">v{nodeBasePrice?.version || 1}</span>
              </div>
              <div className="text-2xl font-extrabold font-mono text-white mt-1">
                ${Number(nodeBasePrice?.configValue || 1000).toFixed(2)}
              </div>
              <p className="text-[11px] text-[#98A2B3] mt-1">
                Server-authoritative price charged per new Genesis Node order.
              </p>
            </div>
            <div className="pt-2 flex items-center justify-between border-t border-white/[0.04]">
              <span className="text-[10px] text-white/50 font-mono">
                Since {nodeBasePrice?.effectiveFrom ? new Date(nodeBasePrice.effectiveFrom).toLocaleDateString() : 'Genesis'}
              </span>
              <button
                onClick={() => nodeBasePrice && handleOpenEdit(nodeBasePrice)}
                className="px-2.5 py-1 rounded-lg bg-[#00CFFF]/10 hover:bg-[#00CFFF]/20 text-[#00CFFF] text-[11px] font-bold border border-[#00CFFF]/30 flex items-center gap-1 cursor-pointer"
              >
                <Edit3 className="w-3 h-3" /> Edit Price
              </button>
            </div>
          </div>

          {/* Node Sales Switch */}
          <div className="p-4 rounded-xl bg-[#05070B] border border-white/[0.06] flex flex-col justify-between space-y-3">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#98A2B3]">Node Sales Status</span>
                <span className="text-[10px] font-mono text-[#00CFFF]">v{nodeSalesEnabled?.version || 1}</span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span
                  className={`px-2.5 py-1 rounded-md text-xs font-mono font-bold flex items-center gap-1.5 ${
                    nodeSalesEnabled?.status === 'ACTIVE'
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : 'bg-red-500/10 text-red-400 border border-red-500/20'
                  }`}
                >
                  <Power className="w-3 h-3" />
                  {nodeSalesEnabled?.status === 'ACTIVE' ? 'SALES OPEN' : 'SALES PAUSED'}
                </span>
              </div>
              <p className="text-[11px] text-[#98A2B3] mt-1">
                Master switch. When paused, users cannot create new reservations.
              </p>
            </div>
            <div className="pt-2 flex items-center justify-between border-t border-white/[0.04]">
              <span className="text-[10px] text-white/50 font-mono">
                Updated by {nodeSalesEnabled?.updatedByAdminPublicId || 'ADMIN'}
              </span>
              <button
                onClick={() => nodeSalesEnabled && handleQuickToggle(nodeSalesEnabled)}
                className={`px-3 py-1 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer ${
                  nodeSalesEnabled?.status === 'ACTIVE'
                    ? 'bg-red-500/10 hover:bg-red-500/20 text-red-400 border-red-500/30'
                    : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                }`}
              >
                {nodeSalesEnabled?.status === 'ACTIVE' ? 'Pause Sales' : 'Resume Sales'}
              </button>
            </div>
          </div>

          {/* Genesis Node Cap (IMMUTABLE) */}
          <div className="p-4 rounded-xl bg-[#05070B] border border-amber-500/20 flex flex-col justify-between space-y-3 relative overflow-hidden">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-amber-400 flex items-center gap-1">
                  <Lock className="w-3.5 h-3.5 text-amber-400" />
                  Genesis Node Cap
                </span>
                <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  IMMUTABLE
                </span>
              </div>
              <div className="text-2xl font-extrabold font-mono text-white mt-1">
                10,000 Nodes
              </div>
              <p className="text-[11px] text-[#98A2B3] mt-1">
                Mathematical upper issuance limit. Hardcoded invariant cannot be altered.
              </p>
            </div>
            <div className="pt-2 flex items-center justify-between border-t border-white/[0.04] text-[10px] text-amber-300/80 font-mono">
              <span className="flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                Guaranteed by Smart Contract
              </span>
              <span>Fixed Supply</span>
            </div>
          </div>
        </div>

        {/* Private Admin Genesis Node Economics Card (Section 18) */}
        <div className="p-5 rounded-xl bg-[#050812] border border-[#00CFFF]/30 space-y-4">
          <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
            <div className="flex items-center gap-2 font-mono text-xs text-[#00CFFF] font-bold">
              <Coins className="w-4 h-4" />
              <span>GENESIS NODE LAUNCH ECONOMICS SUMMARY</span>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#00CFFF]/10 border border-[#00CFFF]/30 text-[#00CFFF]">
              Launch Standard V1.0
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs font-mono">
            <div className="p-3 rounded-lg bg-[#07101D] border border-white/[0.06]">
              <span className="text-[10px] text-[#98A2B3] block">Current Public Capacity</span>
              <span className="text-sm font-bold text-white">10,000 Nodes</span>
            </div>
            <div className="p-3 rounded-lg bg-[#07101D] border border-white/[0.06]">
              <span className="text-[10px] text-[#98A2B3] block">Node Price</span>
              <span className="text-sm font-bold text-white">$1,000 USD</span>
            </div>
            <div className="p-3 rounded-lg bg-[#07101D] border border-white/[0.06]">
              <span className="text-[10px] text-[#98A2B3] block">Reference PHIVO Price</span>
              <span className="text-sm font-bold text-white">$0.10 USD</span>
            </div>
            <div className="p-3 rounded-lg bg-[#07101D] border border-white/[0.06]">
              <span className="text-[10px] text-[#98A2B3] block">PHIVO Per Node</span>
              <span className="text-sm font-bold text-[#00CFFF]">10,000 PHIVO</span>
            </div>
            <div className="p-3 rounded-lg bg-[#07101D] border border-white/[0.06]">
              <span className="text-[10px] text-[#98A2B3] block">Daily PHIVO Emission</span>
              <span className="text-sm font-bold text-[#32D583]">
                {rewardRate?.configValue ? `${Number(rewardRate.configValue)} PHIVO / Day (Admin Controlled)` : 'Dynamic Protocol Governed'}
              </span>
            </div>
            <div className="p-3 rounded-lg bg-[#07101D] border border-white/[0.06]">
              <span className="text-[10px] text-[#98A2B3] block">Node Term</span>
              <span className="text-sm font-bold text-white">400 Days</span>
            </div>
            <div className="p-3 rounded-lg bg-[#07101D] border border-white/[0.06] col-span-2">
              <span className="text-[10px] text-[#98A2B3] block">Max Genesis Allocation at Capacity</span>
              <span className="text-sm font-bold text-[#00CFFF]">100,000,000 PHIVO (100% Supply)</span>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 2: DIRECT REFERRAL COMMISSION */}
      <div className="p-6 rounded-2xl bg-[#07101D] border border-white/[0.08] shadow-lg space-y-5">
        <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Direct Referral Commission Parameter</h2>
              <p className="text-xs text-[#98A2B3]">
                Set future reward earned by direct sponsors on activated node sales. Historical payouts remain unchanged.
              </p>
            </div>
          </div>
          <span className="px-2.5 py-0.5 rounded-full bg-white/[0.06] text-[10px] font-mono font-bold text-white/80 uppercase">
            Section 2 / 7
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 rounded-xl bg-[#05070B] border border-white/[0.06] space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#98A2B3]">Current Commission Rate</span>
              <span className="text-[10px] font-mono text-[#00CFFF]">v{referralComm?.version || 1}</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-extrabold font-mono text-emerald-400">
                ${Number(referralComm?.configValue || 50).toFixed(2)}
              </span>
              <span className="text-xs text-[#98A2B3]">USD per eligible Node activation</span>
            </div>
            <p className="text-[11px] text-[#98A2B3]">
              Credited instantly to the sponsor’s financial ledger upon successful on-chain or fiat payment settlement.
            </p>
            <div className="pt-2 flex items-center justify-between border-t border-white/[0.04]">
              <span className="text-[10px] text-white/50 font-mono">
                Effective since {referralComm?.effectiveFrom ? new Date(referralComm.effectiveFrom).toLocaleDateString() : 'Launch'}
              </span>
              <button
                onClick={() => referralComm && handleOpenEdit(referralComm)}
                className="px-3 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-[11px] font-bold border border-emerald-500/30 flex items-center gap-1 cursor-pointer"
              >
                <Edit3 className="w-3 h-3" /> Update Commission Rate
              </button>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-[#05070B] border border-white/[0.06] flex flex-col justify-center space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-white">
              <Info className="w-4 h-4 text-[#00CFFF]" />
              Historical Immutability Safeguard
            </div>
            <p className="text-[11px] text-[#98A2B3] leading-relaxed">
              When the direct referral rate is updated, it takes effect only for subsequent node purchases. All previously recorded referral commissions in <strong className="text-white font-mono">referral_commissions</strong> and <strong className="text-white font-mono">financial_ledger_entries</strong> preserve their exact earned amounts permanently.
            </p>
          </div>
        </div>
      </div>

      {/* SECTION 3: MATCHING TIERS & PROMOTION MILESTONES */}
      <div className="p-6 rounded-2xl bg-[#07101D] border border-white/[0.08] shadow-lg space-y-5">
        <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-400">
              <TrendingUp className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Binary Matching &amp; Career Promotion Tier Values</h2>
              <p className="text-xs text-[#98A2B3]">Configure volume thresholds and payout rewards for daily binary matching and career milestones.</p>
            </div>
          </div>
          <span className="px-2.5 py-0.5 rounded-full bg-white/[0.06] text-[10px] font-mono font-bold text-white/80 uppercase">
            Section 3 / 7
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Binary Matching Tiers */}
          <div className="p-4 rounded-xl bg-[#05070B] border border-white/[0.06] space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
              <span className="text-xs font-bold text-white">Daily Binary Matching Tiers</span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-[#00CFFF]">v{matchingTiers?.version || 1}</span>
                <button
                  onClick={() => matchingTiers && handleOpenEdit(matchingTiers)}
                  className="px-2 py-0.5 rounded bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 text-[10px] font-bold border border-purple-500/30 cursor-pointer"
                >
                  Edit Tiers
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="text-[#98A2B3] text-[10px] uppercase border-b border-white/[0.04]">
                    <th className="py-2 px-2">Matched Volume</th>
                    <th className="py-2 px-2 text-right">Daily Bonus (USD)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.02]">
                  {Array.isArray(matchingTiers?.configValue) ? (
                    matchingTiers.configValue.map((tier: any, idx: number) => (
                      <tr key={idx} className="hover:bg-white/[0.02]">
                        <td className="py-2 px-2 text-white font-bold">{tier.units} Left / {tier.units} Right</td>
                        <td className="py-2 px-2 text-right font-extrabold text-purple-400">${tier.rewardUsd}.00</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={2} className="py-2 px-2 text-center text-[#98A2B3]">Standard 2/2, 4/4, 8/8, 20/20, 50/50, 100/100 active</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Promotion Milestones */}
          <div className="p-4 rounded-xl bg-[#05070B] border border-white/[0.06] space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
              <span className="text-xs font-bold text-white">Career Promotion Milestones</span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-[#00CFFF]">v{promotionTiers?.version || 1}</span>
                <button
                  onClick={() => promotionTiers && handleOpenEdit(promotionTiers)}
                  className="px-2 py-0.5 rounded bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 text-[10px] font-bold border border-purple-500/30 cursor-pointer"
                >
                  Edit Milestones
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="text-[#98A2B3] text-[10px] uppercase border-b border-white/[0.04]">
                    <th className="py-2 px-2">Milestone Tier</th>
                    <th className="py-2 px-2">Volume Target</th>
                    <th className="py-2 px-2 text-right">One-Time Bonus</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.02]">
                  {Array.isArray(promotionTiers?.configValue) ? (
                    promotionTiers.configValue.map((m: any, idx: number) => (
                      <tr key={idx} className="hover:bg-white/[0.02]">
                        <td className="py-2 px-2 text-white font-bold">{m.milestone}</td>
                        <td className="py-2 px-2 text-[#98A2B3]">{m.units} Left / {m.units} Right</td>
                        <td className="py-2 px-2 text-right font-extrabold text-emerald-400">${m.rewardUsd}.00</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={3} className="py-2 px-2 text-center text-[#98A2B3]">20/20 ($500), 50/50 ($1500), 100/100 ($3500) active</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 4: NODE REWARD CONTROL */}
      <div className="p-6 rounded-2xl bg-[#07101D] border border-white/[0.08] shadow-lg space-y-5">
        <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-400">
              <Gift className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Genesis Node Mining Reward Distribution</h2>
              <p className="text-xs text-[#98A2B3]">
                Manage node mining rewards, configure payout rates per node / epoch, and enforce zero-default integrity.
              </p>
            </div>
          </div>
          <span className="px-2.5 py-0.5 rounded-full bg-white/[0.06] text-[10px] font-mono font-bold text-white/80 uppercase">
            Section 4 / 7
          </span>
        </div>

        {/* DUAL-MODE DAILY ROI / MINING REWARD DISTRIBUTION ENGINE (AUTOMATIC VS MANUAL) */}
        <div className="p-5 rounded-2xl bg-gradient-to-r from-amber-950/40 via-[#07101D] to-orange-950/30 border border-amber-500/40 space-y-4 shadow-2xl relative overflow-hidden">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-white/[0.08] pb-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0 mt-0.5">
                <Zap className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm sm:text-base font-bold text-white font-mono">
                    DAILY MINING REWARD / ROI EXECUTION MODE
                  </h3>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-extrabold uppercase tracking-wider ${
                      rewardAutomation.mode === 'AUTOMATIC'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    }`}
                  >
                    {rewardAutomation.mode === 'AUTOMATIC' ? '● AUTOMATIC ACTIVE' : '⏸ MANUAL ON-DEMAND'}
                  </span>
                </div>
                <p className="text-xs text-[#98A2B3] max-w-2xl leading-relaxed">
                  {rewardAutomation.mode === 'AUTOMATIC'
                    ? 'Automatic mode is active. Daily node mining yields are calculated and credited automatically according to the scheduled daily epoch time.'
                    : 'Automatic distribution is PAUSED. Mining rewards will only be credited when an administrator manually triggers the payout below.'}
                </p>
              </div>
            </div>

            {/* Mode Switch Buttons */}
            <div className="flex items-center gap-1.5 bg-[#05070B] p-1.5 rounded-xl border border-white/[0.1] shrink-0 self-start sm:self-auto">
              <button
                type="button"
                disabled={updatingRewardMode}
                onClick={() => handleToggleRewardMode('AUTOMATIC')}
                className={`px-4 py-2 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                  rewardAutomation.mode === 'AUTOMATIC'
                    ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/30'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                AUTOMATIC
              </button>
              <button
                type="button"
                disabled={updatingRewardMode}
                onClick={() => handleToggleRewardMode('MANUAL')}
                className={`px-4 py-2 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                  rewardAutomation.mode === 'MANUAL'
                    ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/30'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                MANUAL
              </button>
            </div>
          </div>

          {/* Operational Metrics Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono">
            <div className="p-3.5 rounded-xl bg-[#05070B] border border-white/[0.06]">
              <span className="text-[10px] text-[#98A2B3] block uppercase tracking-wider">Scheduled Run Time</span>
              <span className="text-sm font-bold text-white mt-0.5 block">
                {rewardAutomation.scheduledTimeUtc} UTC
              </span>
              <span className="text-[10px] text-slate-500 block mt-0.5">Daily consensus settlement cycle</span>
            </div>

            <div className="p-3.5 rounded-xl bg-[#05070B] border border-white/[0.06]">
              <span className="text-[10px] text-[#98A2B3] block uppercase tracking-wider">Last Settled Epoch</span>
              <span className="text-sm font-bold text-[#00CFFF] mt-0.5 block">
                {rewardAutomation.lastEpochNumber ? `Epoch #${rewardAutomation.lastEpochNumber}` : 'Recorded on Ledger'}
              </span>
              <span className="text-[10px] text-slate-500 block mt-0.5 truncate">
                {rewardAutomation.lastSettledAt ? new Date(rewardAutomation.lastSettledAt).toLocaleString() : 'Ready for execution'}
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-[#05070B] border border-white/[0.06]">
              <span className="text-[10px] text-[#98A2B3] block uppercase tracking-wider">Distribution Trigger</span>
              <span className={`text-sm font-bold mt-0.5 block ${rewardAutomation.mode === 'AUTOMATIC' ? 'text-emerald-400' : 'text-amber-400'}`}>
                {rewardAutomation.mode === 'AUTOMATIC' ? 'Active Auto-Scheduler' : 'Manual Trigger Enabled'}
              </span>
              <span className="text-[10px] text-slate-500 block mt-0.5">
                Current Mode: {rewardAutomation.mode}
              </span>
            </div>
          </div>

          {/* Manual Trigger Bar */}
          <div className="p-3.5 rounded-xl bg-[#05070B] border border-amber-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-xs text-[#98A2B3] flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                {rewardAutomation.mode === 'MANUAL'
                  ? 'Manual mode is enabled. Click the button to immediately credit daily ROI to all active Genesis Nodes.'
                  : 'Automatic mode is active. You can also trigger an immediate on-demand distribution at any time.'}
              </span>
            </div>

            <button
              type="button"
              disabled={triggeringRewardPayout}
              onClick={handleManualRewardDistribution}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 hover:from-amber-400 hover:to-orange-400 text-black font-extrabold text-xs font-mono uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-lg shadow-amber-500/20 cursor-pointer disabled:opacity-60 shrink-0"
            >
              <Zap className={`w-4 h-4 ${triggeringRewardPayout ? 'animate-spin' : ''}`} />
              <span>{triggeringRewardPayout ? 'Processing Distribution...' : 'Send Daily Mining Rewards (ROI) Now'}</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Rewards Master Switch */}
          <div className="p-4 rounded-xl bg-[#05070B] border border-white/[0.06] flex flex-col justify-between space-y-3">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#98A2B3]">Reward Engine Status</span>
                <span className="text-[10px] font-mono text-[#00CFFF]">v{nodeRewardsEnabled?.version || 1}</span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span
                  className={`px-2.5 py-1 rounded-md text-xs font-mono font-bold flex items-center gap-1.5 ${
                    nodeRewardsEnabled?.status === 'ACTIVE'
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : 'bg-red-500/10 text-red-400 border border-red-500/20'
                  }`}
                >
                  <Power className="w-3 h-3" />
                  {nodeRewardsEnabled?.status === 'ACTIVE' ? 'DISTRIBUTIONS ENABLED' : 'DISTRIBUTIONS PAUSED'}
                </span>
              </div>
              <p className="text-[11px] text-[#98A2B3] mt-1">
                When paused, daily epoch scheduler skips reward creation.
              </p>
            </div>
            <div className="pt-2 flex items-center justify-between border-t border-white/[0.04]">
              <span className="text-[10px] text-white/50 font-mono">
                Status: {nodeRewardsEnabled?.status || 'ACTIVE'}
              </span>
              <button
                onClick={() => nodeRewardsEnabled && handleQuickToggle(nodeRewardsEnabled)}
                className={`px-3 py-1 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer ${
                  nodeRewardsEnabled?.status === 'ACTIVE'
                    ? 'bg-red-500/10 hover:bg-red-500/20 text-red-400 border-red-500/30'
                    : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                }`}
              >
                {nodeRewardsEnabled?.status === 'ACTIVE' ? 'Pause Engine' : 'Enable Engine'}
              </button>
            </div>
          </div>

          {/* DAILY PHIVO REWARD Control */}
          <div className="p-4 rounded-xl bg-[#05070B] border border-white/[0.06] flex flex-col justify-between space-y-3">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white uppercase tracking-wider">DAILY PHIVO REWARD</span>
                <span className="text-[10px] font-mono text-[#00CFFF]">v{rewardRate?.version || 1}</span>
              </div>
              <div className="mt-1">
                {rewardRate?.configValue !== null && rewardRate?.configValue !== undefined ? (
                  <div>
                    <span className="text-xs text-[#98A2B3] block">Current Active Rate:</span>
                    <span className="text-2xl font-extrabold font-mono text-amber-400">
                      {Number(rewardRate.configValue)} <span className="text-xs text-[#98A2B3]">PHIVO / Eligible Epoch</span>
                    </span>
                  </div>
                ) : (
                  <span className="text-sm font-bold font-mono text-rose-400 flex items-center gap-1">
                    <AlertTriangle className="w-4 h-4 text-rose-400" />
                    UNCONFIGURED (Settlement Disabled)
                  </span>
                )}
              </div>
              <p className="text-[11px] text-[#98A2B3] mt-1">
                Authoritative protocol emission distributed per eligible active Node in future epochs.
              </p>
            </div>
            <div className="pt-2 flex items-center justify-between border-t border-white/[0.04]">
              <span className="text-[10px] text-white/50 font-mono">
                {rewardRate?.configValue ? `${Number(rewardRate.configValue)} PHIVO / Epoch` : 'No default assumed'}
              </span>
              <button
                onClick={() => rewardRate && handleOpenEdit(rewardRate)}
                className="px-3 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-[11px] font-bold border border-amber-500/30 flex items-center gap-1 cursor-pointer"
              >
                <Edit3 className="w-3 h-3" /> Set Daily PHIVO Reward
              </button>
            </div>
          </div>

          {/* Zero Default Integrity Box */}
          <div className="p-4 rounded-xl bg-[#05070B] border border-white/[0.06] flex flex-col justify-center space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300">
              <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
              Strict No-Invented-Default Rule
            </div>
            <p className="text-[11px] text-[#98A2B3] leading-relaxed">
              In accordance with core architecture, if no reward rate is explicitly configured by administration, epoch settlements strictly abort with <strong className="text-white font-mono">REWARD_RATE_NOT_CONFIGURED</strong>, preventing unintended payouts.
            </p>
          </div>
        </div>
      </div>

      {/* SECTION 5: INTERNAL COIN PRICE (VALUATION & SWAP) */}
      <div className="p-6 rounded-2xl bg-[#07101D] border border-white/[0.08] shadow-lg space-y-5">
        <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-500/10 flex items-center justify-center text-sky-400">
              <Coins className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">PHIVO Coin Valuation &amp; Swap Conversion Rate</h2>
              <p className="text-xs text-[#98A2B3]">
                Control the internal coin conversion rate against USDT (1 PHIVO = X USDT) and manage swap authorization.
              </p>
            </div>
          </div>
          <span className="px-2.5 py-0.5 rounded-full bg-white/[0.06] text-[10px] font-mono font-bold text-white/80 uppercase">
            Section 5 / 7
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Coin Price in USDT */}
          <div className="p-4 rounded-xl bg-[#05070B] border border-white/[0.06] flex flex-col justify-between space-y-3">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#98A2B3]">1 PHIVO =</span>
                <span className="text-[10px] font-mono text-[#00CFFF]">v{internalCoinPrice?.version || 1}</span>
              </div>
              <div className="text-3xl font-extrabold font-mono text-sky-400 mt-1">
                {internalCoinPrice?.configValue?.priceUsdt ? (
                  <>
                    ${Number(internalCoinPrice.configValue.priceUsdt).toFixed(4)}{' '}
                    <span className="text-xs text-white">USDT</span>
                  </>
                ) : (
                  <span className="text-sm font-semibold text-amber-400">Rate Not Configured</span>
                )}
              </div>
              <p className="text-[11px] text-[#98A2B3] mt-1">
                Authoritative exchange multiplier used when calculating coin swap payouts.
              </p>
            </div>
            <div className="pt-2 flex items-center justify-between border-t border-white/[0.04]">
              <span className="text-[10px] text-white/50 font-mono">
                Since {internalCoinPrice?.effectiveFrom ? new Date(internalCoinPrice.effectiveFrom).toLocaleDateString() : 'Launch'}
              </span>
              <button
                onClick={() => internalCoinPrice && handleOpenEdit(internalCoinPrice)}
                className="px-3 py-1 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 text-[11px] font-bold border border-sky-500/30 flex items-center gap-1 cursor-pointer"
              >
                <Edit3 className="w-3 h-3" /> Adjust Coin Rate
              </button>
            </div>
          </div>

          {/* Swap Enabled Switch */}
          <div className="p-4 rounded-xl bg-[#05070B] border border-white/[0.06] flex flex-col justify-between space-y-3">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#98A2B3]">Coin Swap Feature</span>
                <span className="text-[10px] font-mono text-[#00CFFF]">v{coinSwapEnabled?.version || 1}</span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span
                  className={`px-2.5 py-1 rounded-md text-xs font-mono font-bold flex items-center gap-1.5 ${
                    coinSwapEnabled?.status === 'ACTIVE'
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : 'bg-red-500/10 text-red-400 border border-red-500/20'
                  }`}
                >
                  <Power className="w-3 h-3" />
                  {coinSwapEnabled?.status === 'ACTIVE' ? 'SWAP ENABLED' : 'SWAP DISABLED'}
                </span>
              </div>
              <p className="text-[11px] text-[#98A2B3] mt-1">
                Enables or locks the user-facing coin-to-USDT conversion feature in dashboard.
              </p>
            </div>
            <div className="pt-2 flex items-center justify-between border-t border-white/[0.04]">
              <span className="text-[10px] text-white/50 font-mono">
                Updated by {coinSwapEnabled?.updatedByAdminPublicId || 'ADMIN'}
              </span>
              <button
                onClick={() => coinSwapEnabled && handleQuickToggle(coinSwapEnabled)}
                className={`px-3 py-1 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer ${
                  coinSwapEnabled?.status === 'ACTIVE'
                    ? 'bg-red-500/10 hover:bg-red-500/20 text-red-400 border-red-500/30'
                    : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                }`}
              >
                {coinSwapEnabled?.status === 'ACTIVE' ? 'Disable Swap' : 'Enable Swap'}
              </button>
            </div>
          </div>

          {/* Historical Rate Protection */}
          <div className="p-4 rounded-xl bg-[#05070B] border border-white/[0.06] flex flex-col justify-center space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-sky-300">
              <History className="w-4 h-4 text-sky-400 shrink-0" />
              Versioned Rate Guarantee
            </div>
            <p className="text-[11px] text-[#98A2B3] leading-relaxed">
              Every coin price change increments the rate version. Past swap orders and ledger transactions retain the exact rate recorded at the second of execution.
            </p>
          </div>
        </div>
      </div>

      {/* SECTION 6: BSC / USDT GATEWAY CONTROLS */}
      <div className="p-6 rounded-2xl bg-[#07101D] border border-white/[0.08] shadow-lg space-y-5">
        <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-teal-500/10 flex items-center justify-center text-teal-400">
              <Globe className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">BNB Smart Chain &amp; USDT Gateway Infrastructure Controls</h2>
              <p className="text-xs text-[#98A2B3]">
                Configure deposit listener, withdrawal broadcast engine, and block confirmation thresholds. Zero key exposure.
              </p>
            </div>
          </div>
          <span className="px-2.5 py-0.5 rounded-full bg-white/[0.06] text-[10px] font-mono font-bold text-white/80 uppercase">
            Section 6 / 7
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Crypto Deposits Toggle */}
          <div className="p-4 rounded-xl bg-[#05070B] border border-white/[0.06] flex flex-col justify-between space-y-3">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#98A2B3]">Crypto Deposits</span>
                <span className="text-[10px] font-mono text-[#00CFFF]">v{cryptoDeposits?.version || 1}</span>
              </div>
              <div className="text-sm font-bold font-mono text-white mt-1">
                {cryptoDeposits?.status === 'ACTIVE' ? (
                  <span className="text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> LISTENER ACTIVE
                  </span>
                ) : (
                  <span className="text-red-400 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" /> PAUSED
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={() => cryptoDeposits && handleQuickToggle(cryptoDeposits)}
              className="w-full py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-white text-[11px] font-bold border border-white/[0.08] cursor-pointer"
            >
              {cryptoDeposits?.status === 'ACTIVE' ? 'Pause Deposits' : 'Enable Deposits'}
            </button>
          </div>

          {/* Crypto Withdrawals Toggle */}
          <div className="p-4 rounded-xl bg-[#05070B] border border-white/[0.06] flex flex-col justify-between space-y-3">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#98A2B3]">On-Chain Withdrawals</span>
                <span className="text-[10px] font-mono text-[#00CFFF]">v{cryptoWithdrawals?.version || 1}</span>
              </div>
              <div className="text-sm font-bold font-mono text-white mt-1">
                {cryptoWithdrawals?.status === 'ACTIVE' ? (
                  <span className="text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> BROADCAST OPEN
                  </span>
                ) : (
                  <span className="text-red-400 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" /> PAUSED
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={() => cryptoWithdrawals && handleQuickToggle(cryptoWithdrawals)}
              className="w-full py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-white text-[11px] font-bold border border-white/[0.08] cursor-pointer"
            >
              {cryptoWithdrawals?.status === 'ACTIVE' ? 'Pause Withdrawals' : 'Enable Withdrawals'}
            </button>
          </div>

          {/* Required Confirmations */}
          <div className="p-4 rounded-xl bg-[#05070B] border border-white/[0.06] flex flex-col justify-between space-y-3">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#98A2B3]">Required Confirmations</span>
                <span className="text-[10px] font-mono text-[#00CFFF]">v{bscConfirmations?.version || 1}</span>
              </div>
              <div className="text-2xl font-extrabold font-mono text-white mt-1">
                {bscConfirmations?.configValue || 3} <span className="text-xs text-[#98A2B3]">Blocks</span>
              </div>
            </div>
            <button
              onClick={() => bscConfirmations && handleOpenEdit(bscConfirmations)}
              className="w-full py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-white text-[11px] font-bold border border-white/[0.08] cursor-pointer"
            >
              Adjust Confirmations
            </button>
          </div>

          {/* Auto Withdrawal Toggle */}
          <div className="p-4 rounded-xl bg-[#05070B] border border-white/[0.06] flex flex-col justify-between space-y-3">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#98A2B3]">Auto-Broadcast</span>
                <span className="text-[10px] font-mono text-[#00CFFF]">v{autoWithdrawal?.version || 1}</span>
              </div>
              <div className="text-sm font-bold font-mono text-white mt-1">
                {autoWithdrawal?.status === 'ACTIVE' && autoWithdrawal?.configValue ? (
                  <span className="text-amber-400">AUTOMATED</span>
                ) : (
                  <span className="text-sky-400">MANUAL ADMIN REVIEW</span>
                )}
              </div>
            </div>
            <button
              onClick={() => autoWithdrawal && handleQuickToggle(autoWithdrawal)}
              className="w-full py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-white text-[11px] font-bold border border-white/[0.08] cursor-pointer"
            >
              {autoWithdrawal?.status === 'ACTIVE' && autoWithdrawal?.configValue ? 'Switch to Manual' : 'Enable Automated'}
            </button>
          </div>
        </div>

        {/* Security Isolation Guarantee Banner */}
        <div className="p-3.5 rounded-xl bg-[#05070B] border border-teal-500/20 flex items-center gap-3 text-xs">
          <Shield className="w-5 h-5 text-teal-400 shrink-0" />
          <div className="text-[#98A2B3]">
            <strong className="text-white">Signer Isolation Architecture:</strong> Private keys, mnemonic seed phrases, and master derivation entropy remain strictly encapsulated in backend runtime memory. No secret keys are stored in database records or exposed over administrative endpoints.
          </div>
        </div>
      </div>

      {/* SECTION 7: VERSIONING & AUDIT LOG HISTORY */}
      <div className="p-6 rounded-2xl bg-[#07101D] border border-white/[0.08] shadow-lg space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-white/[0.08]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#00CFFF]/10 flex items-center justify-center text-[#00CFFF]">
              <History className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Economic Configuration Version &amp; Audit Trail Log</h2>
              <p className="text-xs text-[#98A2B3]">Authoritative ledger of all historical economic parameter adjustments with actor accountability.</p>
            </div>
          </div>

          {/* Filter key */}
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-[#98A2B3]" />
            <select
              value={auditFilterKey}
              onChange={(e) => setAuditFilterKey(e.target.value)}
              className="px-3 py-1.5 bg-[#05070B] border border-white/[0.1] rounded-lg text-xs text-white outline-none"
            >
              <option value="ALL">All Parameter Logs</option>
              <option value="NODE_BASE_PRICE_USD">Node Price</option>
              <option value="NODE_SALES_ENABLED">Node Sales Switch</option>
              <option value="DIRECT_REFERRAL_COMMISSION_USD">Referral Commission</option>
              <option value="MATCHING_TIERS_CONFIG">Matching Tiers</option>
              <option value="PROMOTION_MILESTONES_CONFIG">Promotion Milestones</option>
              <option value="NODE_REWARD_RATE_PER_EPOCH">Mining Reward Rate</option>
              <option value="INTERNAL_COIN_PRICE_USDT">Internal Coin Price</option>
              <option value="CRYPTO_DEPOSITS_ENABLED">Crypto Deposits</option>
              <option value="CRYPTO_WITHDRAWALS_ENABLED">Crypto Withdrawals</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-[#98A2B3] border-b border-white/[0.06] uppercase text-[10px] font-mono">
                <th className="py-2.5 px-3">Parameter Key</th>
                <th className="py-2.5 px-3">Category</th>
                <th className="py-2.5 px-3">Version</th>
                <th className="py-2.5 px-3">Old Value &rarr; New Value</th>
                <th className="py-2.5 px-3">Admin Operator</th>
                <th className="py-2.5 px-3">Reason / Audit Details</th>
                <th className="py-2.5 px-3">Timestamp (UTC)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {auditLogs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-[#98A2B3] font-mono text-xs">
                    {auditLoading ? 'Loading audit trail...' : 'No economic parameter adjustment logs recorded yet.'}
                  </td>
                </tr>
              ) : (
                auditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-3 px-3 font-mono font-bold text-white">{log.configKey}</td>
                    <td className="py-3 px-3">
                      <span className="px-1.5 py-0.5 rounded bg-white/[0.06] text-[10px] font-mono text-[#00CFFF]">
                        {log.category}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-mono text-amber-400 font-bold">v{log.version}</td>
                    <td className="py-3 px-3 font-mono text-[11px] max-w-xs">
                      <div className="truncate text-[#98A2B3]" title={JSON.stringify(log.oldValue)}>
                        Old: {JSON.stringify(log.oldValue)}
                      </div>
                      <div className="truncate text-emerald-400 font-bold" title={JSON.stringify(log.newValue)}>
                        New: {JSON.stringify(log.newValue)}
                      </div>
                    </td>
                    <td className="py-3 px-3 font-mono text-white">{log.adminPublicId}</td>
                    <td className="py-3 px-3 text-[#98A2B3] text-[11px]">{log.reason || 'Manual parameter adjustment'}</td>
                    <td className="py-3 px-3 font-mono text-[10px] text-[#98A2B3]">
                      {new Date(log.createdAt).toUTCString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* EDIT MODAL DIALOG */}
      {editingConfig && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150">
          <div className="bg-[#07101D] border border-white/[0.14] rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl relative">
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#00CFFF]/10 flex items-center justify-center text-[#00CFFF]">
                  <Edit3 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Adjust {editingConfig.configKey}</h3>
                  <p className="text-xs text-[#98A2B3]">Version {editingConfig.version} &rarr; {editingConfig.version + 1}</p>
                </div>
              </div>
              <button
                onClick={() => setEditingConfig(null)}
                className="text-[#98A2B3] hover:text-white text-lg p-1"
              >
                &times;
              </button>
            </div>

            {/* Description */}
            <div className="p-3 rounded-xl bg-[#05070B] border border-white/[0.06] text-xs text-[#98A2B3]">
              {editingConfig.description}
            </div>

            {/* Parameter Input Form */}
            {editingConfig.configKey === 'MATCHING_TIERS_CONFIG' ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-white block">Structured Matching Tiers Editor</label>
                  <button
                    type="button"
                    onClick={() => setMatchingTiersList([...matchingTiersList, { units: 1, rewardUsd: 50 }])}
                    className="px-2.5 py-1 rounded bg-[#00CFFF]/10 hover:bg-[#00CFFF]/20 text-[#00CFFF] text-[10px] font-bold border border-[#00CFFF]/30 cursor-pointer"
                  >
                    + Add Tier
                  </button>
                </div>
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {matchingTiersList.map((tier, idx) => (
                    <div key={idx} className="flex items-center gap-2 p-2 rounded-xl bg-[#05070B] border border-white/[0.08]">
                      <div className="flex-1 space-y-1">
                        <span className="text-[10px] text-[#98A2B3] block">Matched Volume Units</span>
                        <input
                          type="number"
                          min="1"
                          value={tier.units}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10) || 0;
                            const next = [...matchingTiersList];
                            next[idx] = { ...next[idx], units: val };
                            setMatchingTiersList(next);
                          }}
                          className="w-full px-2 py-1 bg-[#07101D] border border-white/[0.12] rounded text-xs text-white font-mono outline-none"
                        />
                      </div>
                      <div className="flex-1 space-y-1">
                        <span className="text-[10px] text-[#98A2B3] block">Daily Reward USD</span>
                        <input
                          type="number"
                          min="1"
                          value={tier.rewardUsd}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            const next = [...matchingTiersList];
                            next[idx] = { ...next[idx], rewardUsd: val };
                            setMatchingTiersList(next);
                          }}
                          className="w-full px-2 py-1 bg-[#07101D] border border-white/[0.12] rounded text-xs text-white font-mono outline-none"
                        />
                      </div>
                      {matchingTiersList.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setMatchingTiersList(matchingTiersList.filter((_, i) => i !== idx))}
                          className="text-rose-400 hover:text-rose-300 text-xs px-2 py-1 self-end mb-1"
                          title="Remove tier"
                        >
                          &times;
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {/* Read-Only Advanced Preview Accordion */}
                <div className="pt-2 border-t border-white/[0.06]">
                  <button
                    type="button"
                    onClick={() => setShowRawJsonPreview(!showRawJsonPreview)}
                    className="text-[10px] font-mono text-[#98A2B3] hover:text-white flex items-center gap-1 cursor-pointer"
                  >
                    <span>{showRawJsonPreview ? '▼ Hide' : '▶ Show'} Advanced / Raw Configuration Preview (Read-Only)</span>
                  </button>
                  {showRawJsonPreview && (
                    <pre className="mt-2 p-2.5 rounded-lg bg-[#05070B] border border-white/[0.08] text-[10px] font-mono text-[#98A2B3] max-h-32 overflow-auto select-all">
                      {JSON.stringify(matchingTiersList, null, 2)}
                    </pre>
                  )}
                </div>
              </div>
            ) : editingConfig.configKey === 'PROMOTION_MILESTONES_CONFIG' ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-white block">Structured Promotion Milestones Editor</label>
                  <button
                    type="button"
                    onClick={() => setPromotionList([...promotionList, { milestone: `Tier ${promotionList.length + 1}`, units: 10, rewardUsd: 500 }])}
                    className="px-2.5 py-1 rounded bg-[#00CFFF]/10 hover:bg-[#00CFFF]/20 text-[#00CFFF] text-[10px] font-bold border border-[#00CFFF]/30 cursor-pointer"
                  >
                    + Add Milestone
                  </button>
                </div>
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {promotionList.map((m, idx) => (
                    <div key={idx} className="flex flex-col gap-2 p-2 rounded-xl bg-[#05070B] border border-white/[0.08]">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 space-y-1">
                          <span className="text-[10px] text-[#98A2B3] block">Milestone / Rank Name</span>
                          <input
                            type="text"
                            value={m.milestone}
                            onChange={(e) => {
                              const next = [...promotionList];
                              next[idx] = { ...next[idx], milestone: e.target.value };
                              setPromotionList(next);
                            }}
                            className="w-full px-2 py-1 bg-[#07101D] border border-white/[0.12] rounded text-xs text-white outline-none"
                          />
                        </div>
                        {promotionList.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setPromotionList(promotionList.filter((_, i) => i !== idx))}
                            className="text-rose-400 hover:text-rose-300 text-xs px-2 py-1"
                            title="Remove milestone"
                          >
                            &times;
                          </button>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 space-y-1">
                          <span className="text-[10px] text-[#98A2B3] block">Volume Units (Left / Right)</span>
                          <input
                            type="number"
                            min="1"
                            value={m.units}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10) || 0;
                              const next = [...promotionList];
                              next[idx] = { ...next[idx], units: val };
                              setPromotionList(next);
                            }}
                            className="w-full px-2 py-1 bg-[#07101D] border border-white/[0.12] rounded text-xs text-white font-mono outline-none"
                          />
                        </div>
                        <div className="flex-1 space-y-1">
                          <span className="text-[10px] text-[#98A2B3] block">One-Time Bonus USD</span>
                          <input
                            type="number"
                            min="1"
                            value={m.rewardUsd}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value) || 0;
                              const next = [...promotionList];
                              next[idx] = { ...next[idx], rewardUsd: val };
                              setPromotionList(next);
                            }}
                            className="w-full px-2 py-1 bg-[#07101D] border border-white/[0.12] rounded text-xs text-white font-mono outline-none"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Read-Only Advanced Preview Accordion */}
                <div className="pt-2 border-t border-white/[0.06]">
                  <button
                    type="button"
                    onClick={() => setShowRawJsonPreview(!showRawJsonPreview)}
                    className="text-[10px] font-mono text-[#98A2B3] hover:text-white flex items-center gap-1 cursor-pointer"
                  >
                    <span>{showRawJsonPreview ? '▼ Hide' : '▶ Show'} Advanced / Raw Configuration Preview (Read-Only)</span>
                  </button>
                  {showRawJsonPreview && (
                    <pre className="mt-2 p-2.5 rounded-lg bg-[#05070B] border border-white/[0.08] text-[10px] font-mono text-[#98A2B3] max-h-32 overflow-auto select-all">
                      {JSON.stringify(promotionList, null, 2)}
                    </pre>
                  )}
                </div>
              </div>
            ) : editingConfig.configKey === 'INTERNAL_COIN_PRICE_USDT' ? (
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-white block">1 PHIVO Coin Price (in USDT)</label>
                  <input
                    type="number"
                    step="0.0001"
                    min="0.0001"
                    value={coinPriceInput}
                    onChange={(e) => setCoinPriceInput(e.target.value)}
                    className="w-full px-3 py-2 bg-[#05070B] border border-white/[0.12] rounded-xl text-xs text-white font-mono outline-none focus:border-[#00CFFF]"
                  />
                </div>
                <div className="flex items-center justify-between p-3 rounded-xl bg-[#05070B] border border-white/[0.06]">
                  <span className="text-xs font-medium text-white">Enable User Swaps</span>
                  <input
                    type="checkbox"
                    checked={coinSwapEnabledInput}
                    onChange={(e) => setCoinSwapEnabledInput(e.target.checked)}
                    className="w-4 h-4 accent-[#00CFFF] cursor-pointer"
                  />
                </div>
              </div>
            ) : typeof editingConfig.configValue === 'object' && editingConfig.configValue !== null ? (
              <div className="space-y-2">
                <label className="text-xs font-bold text-white block">Advanced / Raw Configuration Preview (Read-Only)</label>
                <pre className="p-3 bg-[#05070B] border border-white/[0.12] rounded-xl text-xs text-[#98A2B3] font-mono max-h-48 overflow-auto select-all">
                  {JSON.stringify(editingConfig.configValue, null, 2)}
                </pre>
              </div>
            ) : (
              <div className="space-y-1">
                <label className="text-xs font-bold text-white block">
                  {editingConfig.configKey === 'NODE_REWARD_RATE_PER_EPOCH'
                    ? 'New Rate (PHIVO / Eligible Epoch, e.g. 10, 15, 20, 25)'
                    : 'New Value'}
                </label>
                <input
                  type="text"
                  value={editValueInput}
                  onChange={(e) => setEditValueInput(e.target.value)}
                  className="w-full px-3 py-2 bg-[#05070B] border border-white/[0.12] rounded-xl text-xs text-white font-mono outline-none focus:border-[#00CFFF]"
                />
              </div>
            )}

            {/* Status Selector */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-white block">Parameter Status</label>
              <select
                value={editStatusInput}
                onChange={(e) => setEditStatusInput(e.target.value as any)}
                className="w-full px-3 py-2 bg-[#05070B] border border-white/[0.12] rounded-xl text-xs text-white outline-none"
              >
                <option value="ACTIVE">ACTIVE (Operational)</option>
                <option value="PAUSED">PAUSED (Suspended)</option>
                <option value="DISABLED">DISABLED</option>
              </select>
            </div>

            {/* Reason Input */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-white block">Audit Reason / Justification</label>
              <input
                type="text"
                placeholder="Explanation for this economic adjustment..."
                value={editReasonInput}
                onChange={(e) => setEditReasonInput(e.target.value)}
                className="w-full px-3 py-2 bg-[#05070B] border border-white/[0.12] rounded-xl text-xs text-white outline-none focus:border-[#00CFFF]"
              />
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setEditingConfig(null)}
                disabled={saving}
                className="px-4 py-2 rounded-xl bg-white/[0.08] hover:bg-white/[0.12] text-white text-xs font-bold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveConfig}
                disabled={saving}
                className="px-5 py-2 rounded-xl bg-[#00CFFF] hover:bg-[#00CFFF]/90 text-[#05070B] text-xs font-extrabold flex items-center gap-2 cursor-pointer shadow-lg active:scale-95"
              >
                {saving ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Apply Economic Change</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
