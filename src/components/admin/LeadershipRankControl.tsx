import React, { useState, useEffect } from 'react';
import {
  Trophy,
  Award,
  ShieldCheck,
  Zap,
  Lock,
  RefreshCw,
  Search,
  Edit2,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowRight,
  TrendingUp,
  Users,
  ChevronRight,
  Check,
} from 'lucide-react';

interface PromotionRule {
  id: string;
  rankKey: string;
  rankName: string;
  rankOrder: number;
  qualificationType: 'NONE' | 'MATCHING' | 'LEADERSHIP';
  requiredLeft: number;
  requiredRight: number;
  requiredLeaderRank: string | null;
  legBalanceRule: 'FLEXIBLE' | 'STRICT';
  rewardType: 'USDT' | 'NON_CASH';
  rewardUsd: number;
  rewardTitle?: string | null;
  rewardDescription?: string | null;
  rewardDisplayValueUsd?: number | null;
  flushRule: string;
  status: 'ACTIVE' | 'INACTIVE';
  version: number;
  effectiveDate: string;
  achieversCount: number;
}

interface UserPromotionState {
  userId: string;
  currentRank: string;
  currentRankName: string;
  currentRankOrder: number;
  nextRank: string | null;
  nextRankName: string | null;
  nextRankOrder: number | null;
  qualificationType: 'NONE' | 'MATCHING' | 'LEADERSHIP' | null;
  stageProgress: {
    matching?: {
      leftProgress: number;
      rightProgress: number;
      requiredLeft: number;
      requiredRight: number;
      progressPct: number;
      cumulativeConsumedLeft: number;
      cumulativeConsumedRight: number;
      totalActiveVolumeLeft: number;
      totalActiveVolumeRight: number;
    };
    leadership?: {
      leftLeaders: number;
      rightLeaders: number;
      requiredLeft: number;
      requiredRight: number;
      requiredLeaderRank: string;
      requiredLeaderRankName: string;
      legBalanceRule: string;
      progressPct: number;
      leftLeaderDetails: Array<{ userId: string; publicId: string; fullName: string }>;
      rightLeaderDetails: Array<{ userId: string; publicId: string; fullName: string }>;
    };
  };
  completedEvents: Array<{
    id: string;
    publicPromotionId: string;
    rankKey: string;
    rankName: string;
    rankOrder: number;
    previousRank: string;
    qualificationType: string;
    requiredLeft: number;
    requiredRight: number;
    actualLeft: number;
    actualRight: number;
    consumedLeft: number;
    consumedRight: number;
    ruleVersion: number;
    rewardUsd: number;
    status: string;
    completedAt: string;
  }>;
  lastPromotedAt: string | null;
  lastEvaluatedAt: string | null;
}

interface AuditLog {
  id: string;
  userId: string;
  action: string;
  fromRank: string | null;
  toRank: string | null;
  details: any;
  actorType: string;
  actorId: string | null;
  reason: string | null;
  createdAt: string;
}

export const LeadershipRankControl: React.FC = () => {
  const [rules, setRules] = useState<PromotionRule[]>([]);
  const [loadingRules, setLoadingRules] = useState(false);
  const [rulesError, setRulesError] = useState<string | null>(null);

  // Edit rule modal state
  const [editingRule, setEditingRule] = useState<PromotionRule | null>(null);
  const [editReqLeft, setEditReqLeft] = useState<number>(0);
  const [editReqRight, setEditReqRight] = useState<number>(0);
  const [editReqLeaderRank, setEditReqLeaderRank] = useState<string>('');
  const [editLegBalanceRule, setEditLegBalanceRule] = useState<'FLEXIBLE' | 'STRICT'>('FLEXIBLE');
  const [editRewardType, setEditRewardType] = useState<'USDT' | 'NON_CASH'>('USDT');
  const [editRewardUsd, setEditRewardUsd] = useState<number>(0);
  const [editRewardTitle, setEditRewardTitle] = useState<string>('');
  const [editRewardDescription, setEditRewardDescription] = useState<string>('');
  const [editRewardDisplayValueUsd, setEditRewardDisplayValueUsd] = useState<string>('');
  const [editStatus, setEditStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');
  const [editReason, setEditReason] = useState<string>('');
  const [savingRule, setSavingRule] = useState(false);

  // User inspection state
  const [searchQuery, setSearchQuery] = useState('');
  const [inspectedUser, setInspectedUser] = useState<any | null>(null);
  const [userState, setUserState] = useState<UserPromotionState | null>(null);
  const [userAuditLogs, setUserAuditLogs] = useState<AuditLog[]>([]);
  const [searchingUser, setSearchingUser] = useState(false);
  const [userSearchError, setUserSearchError] = useState<string | null>(null);
  const [evaluatingUser, setEvaluatingUser] = useState(false);

  // Manual correction modal state
  const [showCorrectionModal, setShowCorrectionModal] = useState(false);
  const [correctionRank, setCorrectionRank] = useState<string>('NODE_BUILDER');
  const [correctionReason, setCorrectionReason] = useState<string>('');
  const [correctingRank, setCorrectingRank] = useState(false);

  // Fetch ladder rules
  const fetchRules = async () => {
    setLoadingRules(true);
    setRulesError(null);
    try {
      const res = await fetch('/api/promotions/ranks/rules');
      const data = await res.json();
      if (res.ok && data.success) {
        setRules(data.rules || []);
      } else {
        setRulesError(data.message || 'Failed to load promotion rules.');
      }
    } catch (err: any) {
      setRulesError(err.message || 'Network error fetching promotion rules.');
    } finally {
      setLoadingRules(false);
    }
  };

  useEffect(() => {
    fetchRules();
  }, []);

  const openEditModal = (rule: PromotionRule) => {
    setEditingRule(rule);
    setEditReqLeft(rule.requiredLeft);
    setEditReqRight(rule.requiredRight);
    setEditReqLeaderRank(rule.requiredLeaderRank || '');
    setEditLegBalanceRule(rule.legBalanceRule);
    setEditRewardType(rule.rewardType || 'USDT');
    setEditRewardUsd(rule.rewardUsd || 0);
    setEditRewardTitle(rule.rewardTitle || '');
    setEditRewardDescription(rule.rewardDescription || '');
    setEditRewardDisplayValueUsd(
      rule.rewardDisplayValueUsd !== null && rule.rewardDisplayValueUsd !== undefined
        ? String(rule.rewardDisplayValueUsd)
        : ''
    );
    setEditStatus(rule.status);
    setEditReason('');
  };

  const handleSaveRule = async () => {
    if (!editingRule) return;
    if (!editReason || editReason.trim().length < 5) {
      alert('Audit reason is mandatory (minimum 5 characters).');
      return;
    }

    if (editRewardType === 'NON_CASH' && (!editRewardTitle || editRewardTitle.trim().length < 3)) {
      alert('Reward title is required (minimum 3 characters) for non-cash rewards.');
      return;
    }

    setSavingRule(true);
    try {
      const res = await fetch(`/api/promotions/ranks/rules/${editingRule.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requiredLeft: Number(editReqLeft),
          requiredRight: Number(editReqRight),
          requiredLeaderRank: editReqLeaderRank ? editReqLeaderRank : null,
          legBalanceRule: editLegBalanceRule,
          rewardType: editRewardType,
          rewardUsd: editRewardType === 'USDT' ? Number(editRewardUsd) : 0,
          rewardTitle: editRewardType === 'NON_CASH' ? editRewardTitle.trim() : null,
          rewardDescription: editRewardType === 'NON_CASH' ? (editRewardDescription.trim() || null) : null,
          rewardDisplayValueUsd:
            editRewardType === 'NON_CASH' && editRewardDisplayValueUsd && !isNaN(Number(editRewardDisplayValueUsd))
              ? Number(editRewardDisplayValueUsd)
              : null,
          status: editStatus,
          expectedVersion: editingRule.version,
          reason: editReason.trim(),
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setEditingRule(null);
        await fetchRules();
      } else {
        alert(data.message || 'Failed to update rule.');
      }
    } catch (err: any) {
      alert(err.message || 'Network error updating rule.');
    } finally {
      setSavingRule(false);
    }
  };

  // Search user by email, name, or public ID
  const handleSearchUser = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) return;

    setSearchingUser(true);
    setUserSearchError(null);
    setInspectedUser(null);
    setUserState(null);
    setUserAuditLogs([]);

    try {
      // Find user from /api/admin/users
      const usersRes = await fetch('/api/admin/users');
      const usersData = await usersRes.json();
      const query = searchQuery.trim().toLowerCase();
      const matched = (usersData.users || []).find(
        (u: any) =>
          u.id.toLowerCase() === query ||
          u.publicId.toLowerCase() === query ||
          u.email.toLowerCase() === query ||
          u.fullName.toLowerCase().includes(query)
      );

      if (!matched) {
        setUserSearchError(`No operator found matching "${searchQuery}".`);
        setSearchingUser(false);
        return;
      }

      setInspectedUser(matched);

      // Fetch user rank state and audit logs
      const stateRes = await fetch(`/api/promotions/ranks/user/${matched.id}`);
      const stateData = await stateRes.json();
      if (stateRes.ok && stateData.success) {
        setUserState(stateData.state);
        setUserAuditLogs(stateData.auditLogs || []);
      } else {
        setUserSearchError(stateData.message || 'Could not fetch rank data for user.');
      }
    } catch (err: any) {
      setUserSearchError(err.message || 'Network error inspecting user.');
    } finally {
      setSearchingUser(false);
    }
  };

  const handleEvaluateUser = async () => {
    if (!inspectedUser) return;
    setEvaluatingUser(true);
    try {
      const res = await fetch(`/api/promotions/ranks/evaluate/${inspectedUser.id}`, {
        method: 'POST',
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setUserState(data.result.state);
        // Refresh audit logs
        const auditRes = await fetch(`/api/promotions/ranks/user/${inspectedUser.id}`);
        const auditData = await auditRes.json();
        if (auditRes.ok && auditData.success) {
          setUserAuditLogs(auditData.auditLogs || []);
        }
        if (data.result.promoted) {
          alert(`Success: User promoted to ${data.result.currentRank}!`);
        } else {
          alert(`Evaluation completed: ${data.result.reason}`);
        }
      } else {
        alert(data.message || 'Evaluation failed.');
      }
    } catch (err: any) {
      alert(err.message || 'Error executing evaluation.');
    } finally {
      setEvaluatingUser(false);
    }
  };

  const handleManualCorrection = async () => {
    if (!inspectedUser) return;
    if (!correctionReason || correctionReason.trim().length < 5) {
      alert('Mandatory reason required (minimum 5 characters).');
      return;
    }

    setCorrectingRank(true);
    try {
      const res = await fetch('/api/promotions/ranks/admin/correct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: inspectedUser.id,
          targetRank: correctionRank,
          reason: correctionReason.trim(),
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setUserState(data.state);
        setShowCorrectionModal(false);
        setCorrectionReason('');
        // Refresh audit logs
        const auditRes = await fetch(`/api/promotions/ranks/user/${inspectedUser.id}`);
        const auditData = await auditRes.json();
        if (auditRes.ok && auditData.success) {
          setUserAuditLogs(auditData.auditLogs || []);
        }
        alert(`Authoritative manual rank correction completed.`);
      } else {
        alert(data.message || 'Correction failed.');
      }
    } catch (err: any) {
      alert(err.message || 'Error executing correction.');
    } finally {
      setCorrectingRank(false);
    }
  };

  const formatUsd = (val: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(val);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-[#07101D] to-[#0A1830] border border-white/[0.08] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3.5">
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
            <Trophy className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-white tracking-wide">Sequential Promotion &amp; Leadership Engine</h1>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#00CFFF]/10 text-[#00CFFF] border border-[#00CFFF]/20">
                Authoritative Ladder
              </span>
            </div>
            <p className="text-xs text-[#98A2B3] mt-1">
              Strict sequential rank progression, volume flush accounting, and downline leadership qualification matrix.
            </p>
          </div>
        </div>

        <button
          onClick={fetchRules}
          disabled={loadingRules}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-xs font-mono text-white border border-white/10 transition cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loadingRules ? 'animate-spin' : ''}`} />
          <span>Refresh Rules</span>
        </button>
      </div>

      {/* Section 1: The 7-Rank Promotion Rules Ladder */}
      <div className="p-6 rounded-2xl bg-[#07101D] border border-white/[0.08] space-y-4">
        <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
          <div className="flex items-center gap-2">
            <Award className="w-4 h-4 text-amber-400" />
            <h2 className="text-sm font-bold text-white">Configured Promotion Rules Ladder</h2>
          </div>
          <span className="text-xs font-mono text-[#98A2B3]">7 Sequential Ranks (0 to 6)</span>
        </div>

        {rulesError && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400 flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            <span>{rulesError}</span>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-[#98A2B3] border-b border-white/[0.06] uppercase text-[10px] font-mono">
                <th className="py-2.5 px-3">Order</th>
                <th className="py-2.5 px-3">Rank Name</th>
                <th className="py-2.5 px-3">Key</th>
                <th className="py-2.5 px-3">Type</th>
                <th className="py-2.5 px-3">LEFT Req</th>
                <th className="py-2.5 px-3">RIGHT Req</th>
                <th className="py-2.5 px-3">Required Leader</th>
                <th className="py-2.5 px-3">Leg Rule</th>
                <th className="py-2.5 px-3">Reward</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Version</th>
                <th className="py-2.5 px-3">Achievers</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {rules.map((rule) => (
                <tr key={rule.id} className="hover:bg-white/[0.02]">
                  <td className="py-3 px-3 font-mono font-bold text-[#00CFFF]">#{rule.rankOrder}</td>
                  <td className="py-3 px-3 font-medium text-white flex items-center gap-1.5">
                    {rule.rankOrder >= 4 ? (
                      <ShieldCheck className="w-3.5 h-3.5 text-purple-400" />
                    ) : rule.rankOrder > 0 ? (
                      <Zap className="w-3.5 h-3.5 text-amber-400" />
                    ) : null}
                    <span>{rule.rankName}</span>
                  </td>
                  <td className="py-3 px-3 font-mono text-[11px] text-[#98A2B3]">{rule.rankKey}</td>
                  <td className="py-3 px-3">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                        rule.qualificationType === 'MATCHING'
                          ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                          : rule.qualificationType === 'LEADERSHIP'
                          ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                          : 'bg-slate-500/10 text-slate-400'
                      }`}
                    >
                      {rule.qualificationType}
                    </span>
                  </td>
                  <td className="py-3 px-3 font-mono font-bold text-white">
                    {rule.qualificationType === 'MATCHING' ? `${rule.requiredLeft} Units` : `${rule.requiredLeft} Leaders`}
                  </td>
                  <td className="py-3 px-3 font-mono font-bold text-white">
                    {rule.qualificationType === 'MATCHING' ? `${rule.requiredRight} Units` : `${rule.requiredRight} Leaders`}
                  </td>
                  <td className="py-3 px-3 font-mono text-[#00CFFF]">
                    {rule.requiredLeaderRank || '—'}
                  </td>
                  <td className="py-3 px-3 font-mono text-[11px] text-[#98A2B3]">
                    {rule.qualificationType === 'LEADERSHIP' ? rule.legBalanceRule : '—'}
                  </td>
                  <td className="py-3 px-3 font-mono">
                    {rule.rewardType === 'NON_CASH' ? (
                      <div className="flex flex-col">
                        <span className="text-amber-400 font-bold flex items-center gap-1 text-[11px]">
                          <Award className="w-3 h-3 text-amber-400 shrink-0" />
                          <span>{rule.rewardTitle || 'Non-Cash Reward'}</span>
                        </span>
                        {rule.rewardDisplayValueUsd && (
                          <span className="text-[10px] text-[#98A2B3]">
                            (Est: {formatUsd(rule.rewardDisplayValueUsd)})
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-emerald-400 font-bold">
                        {rule.rewardUsd > 0 ? `${formatUsd(rule.rewardUsd)} USDT` : '—'}
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-3">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                        rule.status === 'ACTIVE'
                          ? 'bg-[#32D583]/10 text-[#32D583]'
                          : 'bg-[#F04438]/10 text-[#F04438]'
                      }`}
                    >
                      {rule.status}
                    </span>
                  </td>
                  <td className="py-3 px-3 font-mono text-[#98A2B3]">v{rule.version}</td>
                  <td className="py-3 px-3 font-mono font-bold text-white">{rule.achieversCount}</td>
                  <td className="py-3 px-3 text-right">
                    {rule.rankOrder > 0 ? (
                      <button
                        onClick={() => openEditModal(rule)}
                        className="px-2.5 py-1 rounded bg-white/[0.05] hover:bg-white/[0.1] text-white text-[11px] font-mono border border-white/10 flex items-center gap-1 ml-auto cursor-pointer"
                      >
                        <Edit2 className="w-3 h-3 text-[#00CFFF]" /> Edit
                      </button>
                    ) : (
                      <span className="px-2 py-0.5 rounded bg-slate-500/10 text-[#98A2B3] text-[10px] font-mono font-bold uppercase border border-slate-500/20 whitespace-nowrap">
                        IMMUTABLE BASE TIER
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Section 2: User Rank Inspector */}
      <div className="p-6 rounded-2xl bg-[#07101D] border border-white/[0.08] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/[0.06] pb-3">
          <div>
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <Search className="w-4 h-4 text-[#00CFFF]" />
              User Authoritative Rank Inspector
            </h2>
            <p className="text-xs text-[#98A2B3]">
              Examine live sequential stage progression, consumed matching volume, downline leader counts, and immutable audit logs.
            </p>
          </div>

          <form onSubmit={handleSearchUser} className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Search Public ID, Email, Name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="px-3 py-1.5 bg-[#05070B] border border-white/[0.1] rounded-lg text-xs text-white outline-none w-64"
            />
            <button
              type="submit"
              disabled={searchingUser || !searchQuery.trim()}
              className="px-3 py-1.5 rounded-lg bg-[#00CFFF] hover:bg-[#00B4E0] text-black font-bold text-xs flex items-center gap-1 cursor-pointer disabled:opacity-50"
            >
              {searchingUser ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
              <span>Inspect</span>
            </button>
          </form>
        </div>

        {userSearchError && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
            {userSearchError}
          </div>
        )}

        {inspectedUser && userState && (
          <div className="space-y-6 pt-2">
            {/* Operator Summary Header */}
            <div className="p-4 rounded-xl bg-[#0B1528] border border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-white">{inspectedUser.fullName}</span>
                  <span className="font-mono text-xs text-[#00CFFF] px-2 py-0.5 rounded bg-[#00CFFF]/10 border border-[#00CFFF]/20">
                    {inspectedUser.publicId}
                  </span>
                  <span className="text-xs text-[#98A2B3]">{inspectedUser.email}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-[#98A2B3] font-mono">
                  <span>Current Rank: <strong className="text-white">{userState.currentRankName} (#{userState.currentRankOrder})</strong></span>
                  <span>•</span>
                  <span>Next Target: <strong className="text-amber-400">{userState.nextRankName || 'TOP RANK'}</strong></span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleEvaluateUser}
                  disabled={evaluatingUser}
                  className="px-3.5 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 text-xs font-mono font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${evaluatingUser ? 'animate-spin' : ''}`} />
                  <span>Evaluate Rank</span>
                </button>

                <button
                  onClick={() => setShowCorrectionModal(true)}
                  className="px-3.5 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-[#98A2B3] hover:text-white border border-white/10 text-xs font-mono flex items-center gap-1.5 cursor-pointer"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  <span>Manual Correction</span>
                </button>
              </div>
            </div>

            {/* Stage Progress Detail */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Matching Progress */}
              {userState.stageProgress.matching && (
                <div className="p-4 rounded-xl bg-[#0B1528] border border-amber-500/20 space-y-3">
                  <div className="flex items-center justify-between border-b border-white/5 pb-2">
                    <span className="text-xs font-mono text-amber-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5" /> Matching Stage Progress ({userState.nextRankName})
                    </span>
                    <span className="text-xs font-mono text-white font-bold">
                      {userState.stageProgress.matching.progressPct}%
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                    <div className="p-2.5 rounded-lg bg-[#07101D] border border-white/5">
                      <div className="text-[#98A2B3]">LEFT Leg Progress</div>
                      <div className="text-lg font-bold text-white mt-1">
                        {userState.stageProgress.matching.leftProgress} / {userState.stageProgress.matching.requiredLeft}
                      </div>
                      <div className="text-[10px] text-[#98A2B3] mt-1">
                        Total: {userState.stageProgress.matching.totalActiveVolumeLeft} | Consumed: {userState.stageProgress.matching.cumulativeConsumedLeft}
                      </div>
                    </div>

                    <div className="p-2.5 rounded-lg bg-[#07101D] border border-white/5">
                      <div className="text-[#98A2B3]">RIGHT Leg Progress</div>
                      <div className="text-lg font-bold text-white mt-1">
                        {userState.stageProgress.matching.rightProgress} / {userState.stageProgress.matching.requiredRight}
                      </div>
                      <div className="text-[10px] text-[#98A2B3] mt-1">
                        Total: {userState.stageProgress.matching.totalActiveVolumeRight} | Consumed: {userState.stageProgress.matching.cumulativeConsumedRight}
                      </div>
                    </div>
                  </div>

                  <div className="w-full h-2 rounded-full bg-white/5 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-amber-500 to-orange-400 rounded-full"
                      style={{ width: `${userState.stageProgress.matching.progressPct}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Leadership Progress */}
              {userState.stageProgress.leadership && (
                <div className="p-4 rounded-xl bg-[#0B1528] border border-purple-500/20 space-y-3">
                  <div className="flex items-center justify-between border-b border-white/5 pb-2">
                    <span className="text-xs font-mono text-purple-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5" /> Leadership Downline Progress ({userState.nextRankName})
                    </span>
                    <span className="text-xs font-mono text-white font-bold">
                      {userState.stageProgress.leadership.progressPct}%
                    </span>
                  </div>

                  <div className="text-xs font-mono text-[#98A2B3]">
                    Required Leaders: <strong className="text-white">{userState.stageProgress.leadership.requiredLeft} LEFT / {userState.stageProgress.leadership.requiredRight} RIGHT</strong> ({userState.stageProgress.leadership.requiredLeaderRankName})
                    <span className="ml-2 px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-300 text-[10px]">
                      Rule: {userState.stageProgress.leadership.legBalanceRule}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                    <div className="p-2.5 rounded-lg bg-[#07101D] border border-white/5">
                      <div className="text-[#98A2B3]">LEFT Qualified Leaders</div>
                      <div className="text-lg font-bold text-purple-300 mt-1">
                        {userState.stageProgress.leadership.leftLeaders}
                      </div>
                      <div className="text-[10px] text-[#98A2B3] mt-1 truncate">
                        {userState.stageProgress.leadership.leftLeaderDetails.map((l) => l.publicId).join(', ') || 'None'}
                      </div>
                    </div>

                    <div className="p-2.5 rounded-lg bg-[#07101D] border border-white/5">
                      <div className="text-[#98A2B3]">RIGHT Qualified Leaders</div>
                      <div className="text-lg font-bold text-purple-300 mt-1">
                        {userState.stageProgress.leadership.rightLeaders}
                      </div>
                      <div className="text-[10px] text-[#98A2B3] mt-1 truncate">
                        {userState.stageProgress.leadership.rightLeaderDetails.map((l) => l.publicId).join(', ') || 'None'}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Completed Events Table */}
              <div className="p-4 rounded-xl bg-[#0B1528] border border-white/10 space-y-3 md:col-span-2">
                <div className="text-xs font-mono uppercase text-[#98A2B3] tracking-wider border-b border-white/5 pb-2">
                  Completed Promotion Events History ({userState.completedEvents.length})
                </div>

                {userState.completedEvents.length === 0 ? (
                  <div className="text-xs text-[#98A2B3] font-mono py-2">
                    No promotions completed yet. Operator is at STANDARD (Rank 0).
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs font-mono">
                      <thead>
                        <tr className="text-[#98A2B3] border-b border-white/[0.06] text-[10px]">
                          <th className="py-2 px-2">Public ID</th>
                          <th className="py-2 px-2">Rank Achieved</th>
                          <th className="py-2 px-2">Order</th>
                          <th className="py-2 px-2">Type</th>
                          <th className="py-2 px-2">Volume Consumed (L/R)</th>
                          <th className="py-2 px-2">Reward</th>
                          <th className="py-2 px-2">Rule Version</th>
                          <th className="py-2 px-2">Completed At</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.04]">
                        {userState.completedEvents.map((evt) => (
                          <tr key={evt.id} className="hover:bg-white/[0.02]">
                            <td className="py-2 px-2 text-[#00CFFF]">{evt.publicPromotionId}</td>
                            <td className="py-2 px-2 font-bold text-white">{evt.rankName}</td>
                            <td className="py-2 px-2">#{evt.rankOrder}</td>
                            <td className="py-2 px-2">{evt.qualificationType}</td>
                            <td className="py-2 px-2">{evt.consumedLeft} / {evt.consumedRight}</td>
                            <td className="py-2 px-2 text-emerald-400">{evt.rewardUsd > 0 ? formatUsd(evt.rewardUsd) : '—'}</td>
                            <td className="py-2 px-2 text-[#98A2B3]">v{evt.ruleVersion}</td>
                            <td className="py-2 px-2 text-[#98A2B3]">{new Date(evt.completedAt).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Audit Logs */}
              <div className="p-4 rounded-xl bg-[#0B1528] border border-white/10 space-y-3 md:col-span-2">
                <div className="text-xs font-mono uppercase text-[#98A2B3] tracking-wider border-b border-white/5 pb-2">
                  Immutable Promotion Audit Logs ({userAuditLogs.length})
                </div>

                <div className="max-h-60 overflow-y-auto space-y-2">
                  {userAuditLogs.map((log) => (
                    <div key={log.id} className="p-2.5 rounded-lg bg-[#07101D] border border-white/5 text-xs font-mono space-y-1">
                      <div className="flex items-center justify-between text-[#98A2B3]">
                        <span className="text-white font-bold">{log.action}</span>
                        <span>{new Date(log.createdAt).toLocaleString()}</span>
                      </div>
                      <div className="text-[11px] text-[#98A2B3]">
                        Transition: <strong className="text-cyan-300">{log.fromRank || 'NONE'}</strong> → <strong className="text-emerald-300">{log.toRank || 'NONE'}</strong> | Actor: {log.actorType} ({log.actorId || 'SYS'})
                      </div>
                      {log.reason && (
                        <div className="text-[10px] text-amber-300">
                          Reason: {log.reason}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Edit Rule Modal */}
      {editingRule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-lg p-6 rounded-2xl bg-[#0B1528] border border-white/10 space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-[#00CFFF]" />
                Edit Rule: {editingRule.rankName} (#{editingRule.rankOrder})
              </h3>
              <button
                onClick={() => setEditingRule(null)}
                className="text-[#98A2B3] hover:text-white text-xs font-mono cursor-pointer"
              >
                Cancel
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="text-[#98A2B3] block mb-1">Required LEFT ({editingRule.qualificationType})</label>
                <input
                  type="number"
                  value={editReqLeft}
                  onChange={(e) => setEditReqLeft(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-[#05070B] border border-white/10 rounded-lg text-white font-mono"
                />
              </div>

              <div>
                <label className="text-[#98A2B3] block mb-1">Required RIGHT ({editingRule.qualificationType})</label>
                <input
                  type="number"
                  value={editReqRight}
                  onChange={(e) => setEditReqRight(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-[#05070B] border border-white/10 rounded-lg text-white font-mono"
                />
              </div>

              {editingRule.qualificationType === 'LEADERSHIP' && (
                <>
                  <div>
                    <label className="text-[#98A2B3] block mb-1">Required Leader Rank</label>
                    <select
                      value={editReqLeaderRank}
                      onChange={(e) => setEditReqLeaderRank(e.target.value)}
                      className="w-full px-3 py-2 bg-[#05070B] border border-white/10 rounded-lg text-white font-mono"
                    >
                      <option value="NODE_BUILDER">NODE_BUILDER</option>
                      <option value="NODE_MASTER">NODE_MASTER</option>
                      <option value="NODE_CAPTAIN">NODE_CAPTAIN</option>
                      <option value="NODE_COMMANDER">NODE_COMMANDER</option>
                      <option value="NODE_AMBASSADOR">NODE_AMBASSADOR</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[#98A2B3] block mb-1">Leg Balance Rule</label>
                    <select
                      value={editLegBalanceRule}
                      onChange={(e) => setEditLegBalanceRule(e.target.value as any)}
                      className="w-full px-3 py-2 bg-[#05070B] border border-white/10 rounded-lg text-white font-mono"
                    >
                      <option value="FLEXIBLE">FLEXIBLE (e.g. 2/3 or 3/2)</option>
                      <option value="STRICT">STRICT (exact Left and Right)</option>
                    </select>
                  </div>
                </>
              )}

              <div className="col-span-2 p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-3">
                <label className="text-[#98A2B3] block text-xs font-semibold uppercase tracking-wider">
                  Reward Model Configuration
                </label>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer text-white">
                    <input
                      type="radio"
                      name="rewardType"
                      checked={editRewardType === 'USDT'}
                      onChange={() => setEditRewardType('USDT')}
                      className="accent-[#00CFFF]"
                    />
                    <span>USDT Monetary Reward</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-white">
                    <input
                      type="radio"
                      name="rewardType"
                      checked={editRewardType === 'NON_CASH'}
                      onChange={() => setEditRewardType('NON_CASH')}
                      className="accent-amber-400"
                    />
                    <span className="text-amber-400 font-medium">Non-Cash / Recognition Reward</span>
                  </label>
                </div>

                {editRewardType === 'USDT' ? (
                  <div>
                    <label className="text-[#98A2B3] block mb-1">Authoritative USDT Reward ($)</label>
                    <input
                      type="number"
                      value={editRewardUsd}
                      onChange={(e) => setEditRewardUsd(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-[#05070B] border border-white/10 rounded-lg text-white font-mono text-xs"
                      placeholder="e.g. 5000"
                    />
                    <span className="text-[10px] text-[#98A2B3] mt-1 block">
                      Posted directly to user spendable ledger balance upon rank achievement.
                    </span>
                  </div>
                ) : (
                  <div className="space-y-3 pt-1">
                    <div>
                      <label className="text-[#98A2B3] block mb-1">Quick Recognition Presets</label>
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          { title: 'International Tour', est: '5000' },
                          { title: 'Luxury Travel Package', est: '10000' },
                          { title: 'Executive Car Reward', est: '50000' },
                          { title: 'Device / Tech Gift', est: '2000' },
                          { title: 'Custom Recognition Reward', est: '' },
                        ].map((preset) => (
                          <button
                            key={preset.title}
                            type="button"
                            onClick={() => {
                              setEditRewardTitle(preset.title);
                              if (preset.est) setEditRewardDisplayValueUsd(preset.est);
                            }}
                            className="px-2.5 py-1 rounded-md bg-white/[0.05] hover:bg-white/[0.1] text-amber-300 text-[11px] font-mono border border-amber-500/20 cursor-pointer"
                          >
                            + {preset.title}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[#98A2B3] block mb-1">Reward Title *</label>
                        <input
                          type="text"
                          value={editRewardTitle}
                          onChange={(e) => setEditRewardTitle(e.target.value)}
                          placeholder="e.g. International Tour or Car Reward"
                          className="w-full px-3 py-2 bg-[#05070B] border border-white/10 rounded-lg text-white text-xs"
                        />
                      </div>
                      <div>
                        <label className="text-[#98A2B3] block mb-1">Est. Display Value USD (Optional)</label>
                        <input
                          type="number"
                          value={editRewardDisplayValueUsd}
                          onChange={(e) => setEditRewardDisplayValueUsd(e.target.value)}
                          placeholder="e.g. 25000"
                          className="w-full px-3 py-2 bg-[#05070B] border border-white/10 rounded-lg text-white font-mono text-xs"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-[#98A2B3] block mb-1">Reward Description / Terms (Optional)</label>
                      <input
                        type="text"
                        value={editRewardDescription}
                        onChange={(e) => setEditRewardDescription(e.target.value)}
                        placeholder="e.g. All-inclusive luxury resort package for 2 guests"
                        className="w-full px-3 py-2 bg-[#05070B] border border-white/10 rounded-lg text-white text-xs"
                      />
                    </div>
                    <span className="text-[10px] text-amber-400/80 block">
                      Non-cash rewards represent tangible gifts or honors and never automatically credit financial ledger balances.
                    </span>
                  </div>
                )}
              </div>

              <div className="col-span-2">
                <label className="text-[#98A2B3] block mb-1">Rule Status</label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as any)}
                  className="w-full px-3 py-2 bg-[#05070B] border border-white/10 rounded-lg text-white font-mono text-xs"
                >
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="INACTIVE">INACTIVE</option>
                </select>
              </div>

              <div className="col-span-2">
                <label className="text-[#98A2B3] block mb-1">Mandatory Audit Reason (min 5 chars) *</label>
                <textarea
                  rows={2}
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                  placeholder="Specify economic/business justification for updating this rank rule..."
                  className="w-full px-3 py-2 bg-[#05070B] border border-white/10 rounded-lg text-white text-xs outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
              <button
                onClick={() => setEditingRule(null)}
                className="px-4 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white text-xs font-mono cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveRule}
                disabled={savingRule || editReason.trim().length < 5}
                className="px-4 py-1.5 rounded-lg bg-[#00CFFF] hover:bg-[#00B4E0] text-black text-xs font-bold font-mono flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {savingRule ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                <span>Save Prospective Rule (v{editingRule.version + 1})</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Rank Correction Modal */}
      {showCorrectionModal && inspectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md p-6 rounded-2xl bg-[#0B1528] border border-white/10 space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-amber-400" />
                Manual Rank Correction
              </h3>
              <button
                onClick={() => setShowCorrectionModal(false)}
                className="text-[#98A2B3] hover:text-white text-xs font-mono cursor-pointer"
              >
                Cancel
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-[#98A2B3] block mb-1">Target Rank</label>
                <select
                  value={correctionRank}
                  onChange={(e) => setCorrectionRank(e.target.value)}
                  className="w-full px-3 py-2 bg-[#05070B] border border-white/10 rounded-lg text-white font-mono"
                >
                  {rules.map((r) => (
                    <option key={r.rankKey} value={r.rankKey}>
                      #{r.rankOrder} — {r.rankName} ({r.rankKey})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[#98A2B3] block mb-1">Mandatory Correction Reason (min 5 chars) *</label>
                <textarea
                  rows={3}
                  value={correctionReason}
                  onChange={(e) => setCorrectionReason(e.target.value)}
                  placeholder="Detail the authoritative administrative justification for this correction..."
                  className="w-full px-3 py-2 bg-[#05070B] border border-white/10 rounded-lg text-white text-xs outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
              <button
                onClick={() => setShowCorrectionModal(false)}
                className="px-4 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white text-xs font-mono cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleManualCorrection}
                disabled={correctingRank || correctionReason.trim().length < 5}
                className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold font-mono flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {correctingRank ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                <span>Apply Audited Correction</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
