import React, { useState, useEffect, useCallback } from 'react';
import {
  ArrowUpRight,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Loader2,
  RefreshCw,
  Search,
  Filter,
  Copy,
  Check,
  ExternalLink,
  ShieldCheck,
  ShieldAlert,
  ArrowRight,
  Info,
  DollarSign,
  Activity,
  Layers,
  FileText,
  AlertCircle,
  Zap,
  Power
} from 'lucide-react';
import { recordAdminAuditToFirestore } from '../../services/firestoreAuditService';
import { AuditLogger } from '../../services/auditLogger';

export type WithdrawalStateAction = 'APPROVE' | 'REJECT' | 'MARK_PROCESSING' | 'COMPLETE' | 'FAIL';

export interface AdminWithdrawalRecord {
  id: string;
  publicWithdrawalId: string;
  userId: string;
  userPublicId: string;
  userName: string;
  userEmail: string;
  amount: number;
  currency: string;
  destinationType: string;
  destinationReference: string;
  status: 'PENDING' | 'APPROVED' | 'PROCESSING' | 'COMPLETED' | 'REJECTED' | 'FAILED' | 'CANCELLED';
  requestedAt: string;
  approvedAt: string | null;
  rejectedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  failedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
}

interface WithdrawalManagementProps {
  summaryMetrics?: any;
  onRefreshSummary?: () => void;
}

const REJECTION_PRESETS = [
  'Invalid or unverified destination address',
  'Compliance / Security verification required',
  'Hot wallet liquidity reserve rebalancing',
  'Network gas / Broadcast failure',
  'Requested cancellation by user account',
  'Suspicious transaction pattern flagged',
];

export const WithdrawalManagement: React.FC<WithdrawalManagementProps> = ({
  summaryMetrics,
  onRefreshSummary,
}) => {
  const [withdrawals, setWithdrawals] = useState<AdminWithdrawalRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);

  // Modal State
  const [selectedTarget, setSelectedTarget] = useState<{
    item: AdminWithdrawalRecord;
    action: WithdrawalStateAction;
  } | null>(null);
  const [reasonInput, setReasonInput] = useState<string>('');
  const [txHashInput, setTxHashInput] = useState<string>('');
  const [actionInProgress, setActionInProgress] = useState<boolean>(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Automated Payout Switch & Min Withdrawal State
  const [autoWithdrawalEnabled, setAutoWithdrawalEnabled] = useState<boolean>(false);
  const [isSignerConfigured, setIsSignerConfigured] = useState<boolean>(false);
  const [payoutWalletAddress, setPayoutWalletAddress] = useState<string | null>(null);
  const [minWithdrawalInput, setMinWithdrawalInput] = useState<string>('0.10');
  const [savingMinAmount, setSavingMinAmount] = useState<boolean>(false);
  const [togglingMode, setTogglingMode] = useState<boolean>(false);
  const [instantPayoutLoadingId, setInstantPayoutLoadingId] = useState<string | null>(null);

  // Fetch Auto-Withdrawal Mode & Minimum Amount
  const fetchMode = useCallback(async () => {
    try {
      const res = await fetch('/api/withdrawals/admin/mode');
      if (res.ok) {
        const data = await res.json();
        setAutoWithdrawalEnabled(Boolean(data.autoWithdrawalEnabled));
        setIsSignerConfigured(Boolean(data.isSignerConfigured));
        setPayoutWalletAddress(data.payoutWalletAddress || null);
        if (typeof data.minWithdrawalAmount === 'number') {
          setMinWithdrawalInput(String(data.minWithdrawalAmount));
        }
      }
    } catch (e) {
      console.warn('[WithdrawalManagement] Failed to read auto mode/min amount:', e);
    }
  }, []);

  const handleSaveMinAmount = async () => {
    try {
      setSavingMinAmount(true);
      const num = parseFloat(minWithdrawalInput);
      if (isNaN(num) || num < 0) {
        setFeedbackMessage({ type: 'error', text: 'Please enter a valid non-negative number for minimum withdrawal.' });
        return;
      }
      const res = await fetch('/api/withdrawals/admin/min-amount', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ minAmount: num }),
      });
      const data = await res.json();
      if (res.ok) {
        setFeedbackMessage({
          type: 'success',
          text: data.message || `Minimum withdrawal limit updated to $${num.toFixed(2)} USD (${num} USDT).`,
        });
      } else {
        throw new Error(data.message || 'Failed to save minimum withdrawal limit');
      }
    } catch (err: any) {
      setFeedbackMessage({
        type: 'error',
        text: err.message || 'Failed to update minimum withdrawal limit',
      });
    } finally {
      setSavingMinAmount(false);
    }
  };

  const handleToggleMode = async () => {
    try {
      setTogglingMode(true);
      const nextState = !autoWithdrawalEnabled;
      const res = await fetch('/api/withdrawals/admin/mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: nextState }),
      });
      const data = await res.json();
      if (res.ok) {
        setAutoWithdrawalEnabled(data.autoWithdrawalEnabled);
        setFeedbackMessage({
          type: 'success',
          text: data.message,
        });
      } else {
        throw new Error(data.message || 'Failed to toggle mode');
      }
    } catch (err: any) {
      setFeedbackMessage({
        type: 'error',
        text: err.message || 'Failed to toggle payout mode',
      });
    } finally {
      setTogglingMode(false);
    }
  };

  const handleInstantPayout = async (publicId: string) => {
    try {
      setInstantPayoutLoadingId(publicId);
      const res = await fetch('/api/withdrawals/admin/instant-payout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicId }),
      });
      const data = await res.json();
      if (res.ok) {
        setFeedbackMessage({
          type: 'success',
          text: data.message || `Instant payout broadcasted successfully! TxHash: ${data.data?.txHash}`,
        });
      } else {
        throw new Error(data.message || 'Failed to execute instant payout');
      }
    } catch (err: any) {
      setFeedbackMessage({
        type: 'error',
        text: err.message || 'Instant payout execution failed',
      });
    } finally {
      setInstantPayoutLoadingId(null);
      fetchWithdrawals();
      if (onRefreshSummary) onRefreshSummary();
    }
  };

  // Detail Modal / Drawer
  const [inspectItem, setInspectItem] = useState<AdminWithdrawalRecord | null>(null);

  // Copy helper
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Fetch withdrawals from admin API
  const fetchWithdrawals = useCallback(async () => {
    try {
      setLoading(true);
      const url = `/api/admin/withdrawals?page=${page}&limit=15&status=${statusFilter}&search=${encodeURIComponent(
        searchQuery
      )}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setWithdrawals(data.withdrawals || []);
        if (data.pagination) {
          setTotalPages(data.pagination.totalPages || 1);
          setTotalCount(data.pagination.totalCount || 0);
        }
      } else {
        console.error('[WithdrawalManagement] Failed to fetch withdrawals');
      }
    } catch (err) {
      console.error('[WithdrawalManagement] Error fetching:', err);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, searchQuery]);

  useEffect(() => {
    fetchWithdrawals();
    fetchMode();
  }, [fetchWithdrawals, fetchMode]);

  // Handle action submission
  const handleExecuteStateTransition = async () => {
    if (!selectedTarget) return;

    const { item, action } = selectedTarget;
    if ((action === 'REJECT' || action === 'FAIL') && !reasonInput.trim()) {
      setFeedbackMessage({
        type: 'error',
        text: `Please specify a reason for marking this withdrawal as ${action}.`,
      });
      return;
    }

    if (action === 'COMPLETE') {
      const cleanHash = txHashInput.trim();
      if (!cleanHash || !/^0x[a-fA-F0-9]{64}$/.test(cleanHash)) {
        setFeedbackMessage({
          type: 'error',
          text: 'Please provide a valid 66-character on-chain transaction hash (starting with 0x) to mark as COMPLETED.',
        });
        return;
      }
    }

    try {
      setActionInProgress(true);
      setFeedbackMessage(null);

      const res = await fetch('/api/admin/withdrawals/settle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          publicId: item.publicWithdrawalId,
          action: action === 'MARK_PROCESSING' ? 'PROCESSING' : action,
          rejectionReason: reasonInput.trim() || undefined,
          txHash: txHashInput.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || `Failed to transition withdrawal to ${action}.`);
      }

      setFeedbackMessage({
        type: 'success',
        text: data.txHash
          ? `Successfully processed and recorded payout on-chain! TxHash: ${data.txHash}`
          : `Successfully transitioned withdrawal ${item.publicWithdrawalId} to ${action}. Ledger updated accordingly.`,
      });

      // Record treasury/settlement movement to Cloud Firestore via AuditLogger
      try {
        if (action === 'COMPLETE' || action === 'APPROVE') {
          await AuditLogger.logTreasuryMovement({
            actionType: `WITHDRAWAL_${action}`,
            amount: item.amount,
            currency: item.currency,
            toAddress: item.destinationReference,
            userUid: 'SUPER_ADMIN',
            details: `Processed treasury payout for withdrawal ${item.publicWithdrawalId} (${item.amount} ${item.currency}) to ${item.destinationReference}.${reasonInput.trim() ? ` Note: ${reasonInput.trim()}` : ''}`,
            metadata: {
              withdrawalId: item.publicWithdrawalId,
              action,
              userPublicId: item.userPublicId,
              destinationType: item.destinationType,
              destinationReference: item.destinationReference,
              previousStatus: item.status,
            },
          });
        } else {
          await AuditLogger.logSettlement({
            actionType: `WITHDRAWAL_${action}`,
            withdrawalId: item.publicWithdrawalId,
            amount: item.amount,
            currency: item.currency,
            destinationAddress: item.destinationReference,
            userUid: 'SUPER_ADMIN',
            details: `Administrative withdrawal state update: ${action} for ${item.publicWithdrawalId}.${reasonInput.trim() ? ` Note: ${reasonInput.trim()}` : ''}`,
            metadata: {
              action,
              reason: reasonInput.trim() || undefined,
              previousStatus: item.status,
            },
          });
        }
      } catch (fErr) {
        console.warn('[WithdrawalManagement] Non-blocking Firestore audit log warning:', fErr);
      }

      setSelectedTarget(null);
      setReasonInput('');
      setTxHashInput('');
      fetchWithdrawals();
      if (onRefreshSummary) {
        onRefreshSummary();
      }
    } catch (err: any) {
      console.error('[WithdrawalManagement] Action execution error:', err);
      setFeedbackMessage({
        type: 'error',
        text: err.message || 'Failed to execute state transition.',
      });
    } finally {
      setActionInProgress(false);
    }
  };

  // Helper for Status Badge
  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Clock className="w-3 h-3 animate-pulse" />
            PENDING REVIEW
          </span>
        );
      case 'APPROVED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-mono font-bold bg-sky-500/10 text-sky-400 border border-sky-500/20">
            <CheckCircle2 className="w-3 h-3" />
            APPROVED — AWAITING PAYOUT
          </span>
        );
      case 'PROCESSING':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-mono font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20">
            <RefreshCw className="w-3 h-3 animate-spin" />
            BLOCKCHAIN CONFIRMATION PENDING
          </span>
        );
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <ShieldCheck className="w-3 h-3" />
            SETTLED / COMPLETED
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-mono font-bold bg-red-500/10 text-red-400 border border-red-500/20">
            <XCircle className="w-3 h-3" />
            REJECTED
          </span>
        );
      case 'FAILED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-mono font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <AlertTriangle className="w-3 h-3" />
            FAILED
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-mono font-bold bg-slate-500/10 text-slate-400 border border-slate-500/20">
            <AlertCircle className="w-3 h-3" />
            USER CANCELLED
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-white/10 text-white">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Automated Blockchain Payout Engine & Mode Switch */}
      <div className={`p-5 rounded-2xl border transition-all ${
        autoWithdrawalEnabled 
          ? 'bg-gradient-to-r from-[#07101D] via-[#052e16]/30 to-[#07101D] border-emerald-500/40 shadow-emerald-500/10' 
          : 'bg-gradient-to-r from-[#07101D] via-[#2d1b00]/30 to-[#07101D] border-amber-500/40 shadow-amber-500/10'
      } shadow-xl flex flex-col gap-4`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
              autoWithdrawalEnabled ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
            }`}>
              <Zap className={`w-6 h-6 ${autoWithdrawalEnabled ? 'fill-emerald-400' : ''}`} />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-bold text-white">Automated Blockchain Payout Engine</h3>
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider border ${
                  autoWithdrawalEnabled
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                }`}>
                  {autoWithdrawalEnabled ? '🟢 FULL AUTOMATIC (24/7 ACTIVE)' : '⏸️ MANUAL APPROVAL MODE'}
                </span>
              </div>
              <p className="text-xs text-[#98A2B3] mt-1 max-w-2xl leading-relaxed">
                {autoWithdrawalEnabled ? (
                  <span>
                    <strong className="text-emerald-400">Full Automatic Mode Active:</strong> Public withdrawal requests trigger backend smart contract calls directly to the user's wallet without delay.
                  </span>
                ) : (
                  <span>
                    <strong className="text-amber-400">Manual Approval Mode Active:</strong> Public withdrawal requests enter the queue below for administrator 1-click review and payout execution.
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={handleToggleMode}
              disabled={togglingMode}
              className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all cursor-pointer shadow-lg active:scale-95 whitespace-nowrap ${
                autoWithdrawalEnabled
                  ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40'
                  : 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40'
              }`}
            >
              {togglingMode ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Power className="w-4 h-4" />
              )}
              <span>{autoWithdrawalEnabled ? 'Switch to Manual Approval' : 'Switch to Full Automatic'}</span>
            </button>
          </div>
        </div>

        {/* Mother Payout Wallet Signer Status Bar */}
        <div className={`px-4 py-2.5 rounded-xl border text-xs font-mono flex flex-wrap items-center justify-between gap-2 ${
          isSignerConfigured
            ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300'
            : 'bg-amber-950/30 border-amber-500/30 text-amber-200'
        }`}>
          <div className="flex items-center gap-2">
            <ShieldCheck className={`w-4 h-4 shrink-0 ${isSignerConfigured ? 'text-emerald-400' : 'text-amber-400'}`} />
            {isSignerConfigured ? (
              <span>
                <strong>Mother Payout Signer Connected:</strong> {payoutWalletAddress}
              </span>
            ) : (
              <span>
                <strong>Mother Wallet Signer (`PAYOUT_PRIVATE_KEY`):</strong> Not configured in Server Secrets. Set <code className="px-1.5 py-0.5 rounded bg-black/40 text-amber-300">PAYOUT_PRIVATE_KEY</code> in <strong>AI Studio Settings → Secrets</strong> (or Cloud Run Env) for 1-click auto broadcast, or use <strong>Complete</strong> below with a manual TxHash.
              </span>
            )}
          </div>
          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
            isSignerConfigured ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'
          }`}>
            {isSignerConfigured ? 'SIGNER READY' : 'MANUAL / AWAITING SECRET'}
          </span>
        </div>
      </div>

      {/* Minimum Withdrawal Amount Governance Card */}
      <div className="p-5 rounded-2xl bg-[#07101D] border border-cyan-500/30 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 flex items-center justify-center shrink-0">
            <DollarSign className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-white">Minimum Withdrawal Limit Setting</h3>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                DYNAMIC RULE
              </span>
            </div>
            <p className="text-xs text-[#98A2B3] mt-1 max-w-xl">
              Set the minimum threshold required for user withdrawal requests. Instantly displayed and enforced across both User &amp; Admin Panels.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <div className="flex items-center gap-2 bg-[#05070B] p-1.5 rounded-xl border border-white/[0.12]">
            <span className="text-xs font-mono font-bold text-[#98A2B3] pl-2">$</span>
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="0.10"
              value={minWithdrawalInput}
              onChange={(e) => setMinWithdrawalInput(e.target.value)}
              className="w-28 bg-transparent text-white font-mono font-bold text-sm outline-none"
            />
            <span className="text-xs font-mono text-cyan-400 pr-2">USDT</span>
          </div>

          <div className="flex items-center gap-1">
            {['0.10', '1.00', '10.00', '50.00'].map((val) => (
              <button
                key={val}
                type="button"
                onClick={() => setMinWithdrawalInput(val)}
                className="px-2 py-1 rounded bg-white/[0.05] hover:bg-white/[0.1] text-white/80 hover:text-white text-[11px] font-mono font-bold border border-white/[0.08] transition-colors cursor-pointer"
              >
                ${val}
              </button>
            ))}
          </div>

          <button
            onClick={handleSaveMinAmount}
            disabled={savingMinAmount}
            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:brightness-110 text-white font-bold text-xs flex items-center gap-2 transition-all cursor-pointer shadow-lg active:scale-95 whitespace-nowrap"
          >
            {savingMinAmount ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CheckCircle2 className="w-4 h-4" />
            )}
            <span>Save Minimum Limit</span>
          </button>
        </div>
      </div>

      {/* Top Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-[#07101D] border border-white/[0.08] relative overflow-hidden shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#98A2B3] uppercase tracking-wider">Pending Review</span>
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-400">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold font-mono text-white">
              ${(summaryMetrics?.pendingWithdrawalsAmount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-xs text-amber-400/90 mt-1 flex items-center gap-1 font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
              {summaryMetrics?.pendingWithdrawalsCount || 0} requests awaiting decision
            </div>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-[#07101D] border border-white/[0.08] relative overflow-hidden shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#98A2B3] uppercase tracking-wider">In Processing / Approved</span>
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-400">
              <RefreshCw className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold font-mono text-white">
              ${((summaryMetrics?.approvedWithdrawalsAmount || 0) + (summaryMetrics?.processingWithdrawalsAmount || 0)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-xs text-purple-400/90 mt-1 flex items-center gap-1 font-mono">
              {((summaryMetrics?.approvedWithdrawalsCount || 0) + (summaryMetrics?.processingWithdrawalsCount || 0))} in pipeline
            </div>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-[#07101D] border border-white/[0.08] relative overflow-hidden shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#98A2B3] uppercase tracking-wider">Settled &amp; Completed</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold font-mono text-white">
              ${(summaryMetrics?.completedWithdrawalsTotal || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-xs text-emerald-400/90 mt-1 flex items-center gap-1 font-mono">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {summaryMetrics?.completedWithdrawalsCount || 0} successfully settled
            </div>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-[#07101D] border border-white/[0.08] relative overflow-hidden shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#98A2B3] uppercase tracking-wider">Rejected &amp; Failed</span>
            <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center text-red-400">
              <XCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold font-mono text-white">
              ${((summaryMetrics?.rejectedWithdrawalsAmount || 0) + (summaryMetrics?.failedWithdrawalsAmount || 0)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-xs text-red-400/90 mt-1 flex items-center gap-1 font-mono">
              {((summaryMetrics?.rejectedWithdrawalsCount || 0) + (summaryMetrics?.failedWithdrawalsCount || 0))} reversed back to ledger
            </div>
          </div>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedbackMessage && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between text-xs animate-in fade-in duration-200 ${
            feedbackMessage.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-red-500/10 border-red-500/30 text-red-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedbackMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            )}
            <span>{feedbackMessage.text}</span>
          </div>
          <button
            onClick={() => setFeedbackMessage(null)}
            className="text-white/60 hover:text-white p-1 rounded-lg"
          >
            &times;
          </button>
        </div>
      )}

      {/* Main Table Container */}
      <div className="p-6 rounded-2xl bg-[#07101D] border border-white/[0.08] shadow-xl space-y-4">
        {/* Header and Filter Controls */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-white/[0.08]">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <ArrowUpRight className="w-5 h-5 text-[#00CFFF]" />
              Withdrawal State Management &amp; Settlement Control
            </h2>
            <p className="text-xs text-[#98A2B3] mt-0.5">
              Authorized admin execution of withdrawal lifecycle transitions: Approve, Reject, Mark Processing, Complete, and Fail.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Search */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#98A2B3]" />
              <input
                type="text"
                placeholder="Search ID, User, Dest..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                className="pl-8 pr-3 py-1.5 bg-[#05070B] border border-white/[0.1] rounded-lg text-xs text-white placeholder-[#98A2B3] outline-none focus:border-[#00CFFF] w-56 transition-colors"
              />
            </div>

            {/* Status Filter Dropdown */}
            <div className="flex items-center gap-1.5 bg-[#05070B] border border-white/[0.1] rounded-lg px-2.5 py-1.5">
              <Filter className="w-3.5 h-3.5 text-[#98A2B3]" />
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
                className="bg-transparent text-xs text-white outline-none cursor-pointer pr-1"
              >
                <option value="ALL" className="bg-[#07101D] text-white">All Statuses</option>
                <option value="PENDING" className="bg-[#07101D] text-white">Pending Review</option>
                <option value="APPROVED" className="bg-[#07101D] text-white">Approved</option>
                <option value="PROCESSING" className="bg-[#07101D] text-white">Processing</option>
                <option value="COMPLETED" className="bg-[#07101D] text-white">Completed / Settled</option>
                <option value="REJECTED" className="bg-[#07101D] text-white">Rejected</option>
                <option value="FAILED" className="bg-[#07101D] text-white">Failed</option>
                <option value="CANCELLED" className="bg-[#07101D] text-white">Cancelled by User</option>
              </select>
            </div>

            {/* Refresh Button */}
            <button
              onClick={() => {
                fetchWithdrawals();
                if (onRefreshSummary) onRefreshSummary();
              }}
              disabled={loading}
              className="p-2 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-white/80 hover:text-white border border-white/[0.08] transition-colors"
              title="Refresh Withdrawal List"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-[#98A2B3] border-b border-white/[0.06] uppercase text-[10px] font-mono">
                <th className="py-3 px-3">Withdrawal ID</th>
                <th className="py-3 px-3">User Account</th>
                <th className="py-3 px-3">Amount</th>
                <th className="py-3 px-3">Destination Channel</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-3">Ledger Impact</th>
                <th className="py-3 px-3">Timeline</th>
                <th className="py-3 px-3 text-right">State Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {loading && withdrawals.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-[#98A2B3]">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Loader2 className="w-6 h-6 animate-spin text-[#00CFFF]" />
                      <span>Loading withdrawal requests...</span>
                    </div>
                  </td>
                </tr>
              ) : withdrawals.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-[#98A2B3]">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <FileText className="w-8 h-8 text-white/20" />
                      <span className="text-sm font-medium text-white/60">No withdrawal records matching query</span>
                      <span className="text-xs text-white/40">Try resetting status filters or search keywords</span>
                    </div>
                  </td>
                </tr>
              ) : (
                withdrawals.map((w) => (
                  <tr key={w.id} className="hover:bg-white/[0.02] transition-colors group">
                    {/* Public ID */}
                    <td className="py-3.5 px-3">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-bold text-white group-hover:text-[#00CFFF] transition-colors">
                          {w.publicWithdrawalId}
                        </span>
                        <button
                          onClick={() => handleCopy(w.publicWithdrawalId, `id-${w.id}`)}
                          className="text-[#98A2B3] hover:text-white transition-colors p-0.5"
                          title="Copy ID"
                        >
                          {copiedId === `id-${w.id}` ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                      <div className="text-[10px] text-[#98A2B3] font-mono">
                        {new Date(w.requestedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </td>

                    {/* User Info */}
                    <td className="py-3.5 px-3">
                      <div className="font-medium text-white">{w.userName}</div>
                      <div className="font-mono text-[11px] text-[#00CFFF] flex items-center gap-1">
                        <span>{w.userPublicId}</span>
                        {w.userEmail && <span className="text-[#98A2B3] text-[10px]">({w.userEmail})</span>}
                      </div>
                    </td>

                    {/* Amount */}
                    <td className="py-3.5 px-3">
                      <div className="font-mono font-extrabold text-sm text-white">
                        ${w.amount.toFixed(2)}
                      </div>
                      <div className="font-mono text-[10px] text-[#98A2B3]">
                        {w.currency || 'USD'}
                      </div>
                    </td>

                    {/* Destination Channel */}
                    <td className="py-3.5 px-3 max-w-[220px]">
                      <div className="font-bold text-white flex items-center gap-1.5">
                        <span className="px-1.5 py-0.5 rounded bg-white/[0.06] text-[10px] font-mono">
                          {w.destinationType}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className="font-mono text-[11px] text-[#98A2B3] truncate" title={w.destinationReference}>
                          {w.destinationReference}
                        </span>
                        <button
                          onClick={() => handleCopy(w.destinationReference, `ref-${w.id}`)}
                          className="text-[#98A2B3] hover:text-white shrink-0 p-0.5"
                          title="Copy Destination"
                        >
                          {copiedId === `ref-${w.id}` ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    </td>

                    {/* Status */}
                    <td className="py-3.5 px-3">
                      {renderStatusBadge(w.status)}
                      {w.rejectionReason && (
                        <div
                          className="text-[10px] text-red-400/90 italic truncate max-w-[180px] mt-1"
                          title={w.rejectionReason}
                        >
                          Note: {w.rejectionReason}
                        </div>
                      )}
                    </td>

                    {/* Financial Ledger Impact */}
                    <td className="py-3.5 px-3">
                      {w.status === 'PENDING' && (
                        <span className="text-[11px] font-mono text-amber-300/90 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                          Funds Reserved (Debit)
                        </span>
                      )}
                      {w.status === 'APPROVED' && (
                        <span className="text-[11px] font-mono text-sky-300/90 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-sky-400"></span>
                          Reserved &amp; Authorized
                        </span>
                      )}
                      {w.status === 'PROCESSING' && (
                        <span className="text-[11px] font-mono text-purple-300/90 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-ping"></span>
                          Broadcast in progress
                        </span>
                      )}
                      {w.status === 'COMPLETED' && (
                        <span className="text-[11px] font-mono text-emerald-400 flex items-center gap-1">
                          <ShieldCheck className="w-3 h-3" />
                          Debit Finalized
                        </span>
                      )}
                      {(w.status === 'REJECTED' || w.status === 'FAILED' || w.status === 'CANCELLED') && (
                        <span className="text-[11px] font-mono text-red-400/90 flex items-center gap-1">
                          <ArrowRight className="w-3 h-3 text-emerald-400" />
                          Reversal Credited
                        </span>
                      )}
                    </td>

                    {/* Timeline */}
                    <td className="py-3.5 px-3 font-mono text-[11px] text-[#98A2B3]">
                      <div>Req: {new Date(w.requestedAt).toLocaleDateString()}</div>
                      {w.completedAt && (
                        <div className="text-emerald-400 text-[10px]">
                          Done: {new Date(w.completedAt).toLocaleDateString()}
                        </div>
                      )}
                      {w.rejectedAt && (
                        <div className="text-red-400 text-[10px]">
                          Rej: {new Date(w.rejectedAt).toLocaleDateString()}
                        </div>
                      )}
                      {w.failedAt && (
                        <div className="text-rose-400 text-[10px]">
                          Fail: {new Date(w.failedAt).toLocaleDateString()}
                        </div>
                      )}
                    </td>

                    {/* State Action Buttons */}
                    <td className="py-3.5 px-3 text-right">
                      <div className="flex items-center justify-end gap-1.5 flex-wrap">
                        {/* PENDING State Transitions */}
                        {w.status === 'PENDING' && (
                          <>
                            <button
                              onClick={() => setSelectedTarget({ item: w, action: 'APPROVE' })}
                              className="px-2.5 py-1.5 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/30 text-[11px] font-bold transition-all shadow-sm active:scale-95 cursor-pointer"
                              title="Approve withdrawal request (Transitions to Approved - Awaiting Payout)"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => handleInstantPayout(w.publicWithdrawalId)}
                              disabled={instantPayoutLoadingId === w.publicWithdrawalId}
                              className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500/30 via-teal-500/30 to-emerald-500/30 hover:from-emerald-500/40 hover:to-teal-500/40 text-emerald-300 border border-emerald-500/50 text-[11px] font-extrabold transition-all shadow-md active:scale-95 flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                              title="1-Click Approve and Disburse to User Wallet"
                            >
                              {instantPayoutLoadingId === w.publicWithdrawalId ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                              ) : (
                                <Zap className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                              )}
                              <span>⚡ Instant Payout</span>
                            </button>
                            <button
                              onClick={() => setSelectedTarget({ item: w, action: 'REJECT' })}
                              className="px-2.5 py-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 text-[11px] font-bold transition-all shadow-sm active:scale-95 cursor-pointer"
                              title="Reject withdrawal and refund balance"
                            >
                              Reject &amp; Refund
                            </button>
                          </>
                        )}

                        {/* APPROVED State Transitions */}
                        {w.status === 'APPROVED' && (
                          <>
                            <button
                              onClick={() => handleInstantPayout(w.publicWithdrawalId)}
                              disabled={instantPayoutLoadingId === w.publicWithdrawalId}
                              className="px-3 py-1 rounded-lg bg-gradient-to-r from-amber-500/25 to-emerald-500/25 hover:from-amber-500/35 hover:to-emerald-500/35 text-emerald-300 border border-emerald-500/40 text-[11px] font-extrabold transition-all shadow-sm active:scale-95 flex items-center gap-1.5 cursor-pointer"
                              title="Broadcast On-Chain Payout via PAYOUT_PRIVATE_KEY"
                            >
                              {instantPayoutLoadingId === w.publicWithdrawalId ? (
                                <Loader2 className="w-3 h-3 animate-spin text-emerald-400" />
                              ) : (
                                <Zap className="w-3 h-3 text-amber-400 fill-amber-400" />
                              )}
                              <span>⚡ Broadcast Payout</span>
                            </button>
                            <button
                              onClick={() => setSelectedTarget({ item: w, action: 'MARK_PROCESSING' })}
                              className="px-2.5 py-1 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[11px] font-bold transition-all shadow-sm active:scale-95"
                              title="Mark as processing / in broadcast"
                            >
                              Mark Processing
                            </button>
                            <button
                              onClick={() => setSelectedTarget({ item: w, action: 'COMPLETE' })}
                              className="px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[11px] font-bold transition-all shadow-sm active:scale-95"
                              title="Mark payout transfer complete"
                            >
                              Complete
                            </button>
                            <button
                              onClick={() => setSelectedTarget({ item: w, action: 'FAIL' })}
                              className="px-2 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[11px] font-bold transition-all shadow-sm active:scale-95"
                              title="Mark transfer failed and refund"
                            >
                              Fail
                            </button>
                            <button
                              onClick={() => setSelectedTarget({ item: w, action: 'REJECT' })}
                              className="px-2 py-1 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 text-[11px] font-bold transition-all shadow-sm active:scale-95"
                              title="Reject and refund"
                            >
                              Reject
                            </button>
                          </>
                        )}

                        {/* PROCESSING State Transitions */}
                        {w.status === 'PROCESSING' && (
                          <>
                            <button
                              onClick={() => setSelectedTarget({ item: w, action: 'COMPLETE' })}
                              className="px-3 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-[11px] font-extrabold transition-all shadow-sm active:scale-95"
                              title="Complete and seal settlement"
                            >
                              Complete
                            </button>
                            <button
                              onClick={() => setSelectedTarget({ item: w, action: 'FAIL' })}
                              className="px-2 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[11px] font-bold transition-all shadow-sm active:scale-95"
                              title="Fail payout transfer and refund"
                            >
                              Fail
                            </button>
                            <button
                              onClick={() => setSelectedTarget({ item: w, action: 'REJECT' })}
                              className="px-2 py-1 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 text-[11px] font-bold transition-all shadow-sm active:scale-95"
                              title="Reject and refund"
                            >
                              Reject
                            </button>
                          </>
                        )}

                        {/* Terminal State Details Button */}
                        {(w.status === 'COMPLETED' || w.status === 'REJECTED' || w.status === 'FAILED' || w.status === 'CANCELLED') && (
                          <button
                            onClick={() => setInspectItem(w)}
                            className="px-2.5 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-white/70 hover:text-white border border-white/[0.08] text-[11px] font-mono transition-colors flex items-center gap-1"
                          >
                            <Info className="w-3 h-3" />
                            Details
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-4 border-t border-white/[0.08] text-xs text-[#98A2B3]">
          <div>
            Showing <strong className="text-white">{withdrawals.length}</strong> of{' '}
            <strong className="text-white">{totalCount}</strong> requests (Page{' '}
            <strong className="text-white">{page}</strong> of <strong className="text-white">{totalPages}</strong>)
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] disabled:opacity-40 disabled:pointer-events-none text-white font-medium border border-white/[0.08] transition-colors"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
              className="px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] disabled:opacity-40 disabled:pointer-events-none text-white font-medium border border-white/[0.08] transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Confirmation Modal for State Transitions */}
      {selectedTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150">
          <div className="bg-[#07101D] border border-white/[0.14] rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl relative">
            {/* Modal Header */}
            <div className="flex items-start justify-between pb-3 border-b border-white/[0.08]">
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    selectedTarget.action === 'APPROVE'
                      ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20'
                      : selectedTarget.action === 'MARK_PROCESSING'
                      ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                      : selectedTarget.action === 'COMPLETE'
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : selectedTarget.action === 'REJECT'
                      ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                      : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                  }`}
                >
                  {selectedTarget.action === 'APPROVE' && <CheckCircle2 className="w-5 h-5" />}
                  {selectedTarget.action === 'MARK_PROCESSING' && <RefreshCw className="w-5 h-5 animate-spin" />}
                  {selectedTarget.action === 'COMPLETE' && <ShieldCheck className="w-5 h-5" />}
                  {selectedTarget.action === 'REJECT' && <XCircle className="w-5 h-5" />}
                  {selectedTarget.action === 'FAIL' && <AlertTriangle className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    Confirm Transition to {selectedTarget.action === 'MARK_PROCESSING' ? 'PROCESSING' : selectedTarget.action}
                  </h3>
                  <p className="text-xs text-[#98A2B3]">
                    Financial state machine execution for withdrawal payout
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedTarget(null)}
                className="text-[#98A2B3] hover:text-white p-1 rounded-lg text-lg leading-none"
              >
                &times;
              </button>
            </div>

            {/* Target Withdrawal Summary Card */}
            <div className="p-4 rounded-xl bg-[#05070B] border border-white/[0.08] space-y-2.5 text-xs">
              <div className="flex justify-between items-center pb-2 border-b border-white/[0.06]">
                <span className="text-[#98A2B3]">Withdrawal ID:</span>
                <span className="font-mono font-bold text-white">{selectedTarget.item.publicWithdrawalId}</span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-white/[0.06]">
                <span className="text-[#98A2B3]">User Account:</span>
                <span className="font-mono text-[#00CFFF]">
                  {selectedTarget.item.userName} ({selectedTarget.item.userPublicId})
                </span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-white/[0.06]">
                <span className="text-[#98A2B3]">Payout Amount:</span>
                <span className="font-mono font-extrabold text-base text-white">
                  ${selectedTarget.item.amount.toFixed(2)} {selectedTarget.item.currency}
                </span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-white/[0.06]">
                <span className="text-[#98A2B3]">Current State:</span>
                <span>{renderStatusBadge(selectedTarget.item.status)}</span>
              </div>
              <div className="flex flex-col gap-1 pt-1">
                <span className="text-[#98A2B3]">Destination Channel &amp; Reference:</span>
                <span className="font-mono text-[11px] text-white/90 bg-white/[0.03] p-2 rounded-lg break-all border border-white/[0.04]">
                  <strong className="text-[#00CFFF] font-sans">[{selectedTarget.item.destinationType}]</strong>{' '}
                  {selectedTarget.item.destinationReference}
                </span>
              </div>
            </div>

            {/* Financial Ledger Impact Callout */}
            <div
              className={`p-3.5 rounded-xl border text-xs space-y-1 ${
                selectedTarget.action === 'APPROVE'
                  ? 'bg-sky-500/10 border-sky-500/20 text-sky-200'
                  : selectedTarget.action === 'MARK_PROCESSING'
                  ? 'bg-purple-500/10 border-purple-500/20 text-purple-200'
                  : selectedTarget.action === 'COMPLETE'
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-200'
                  : selectedTarget.action === 'REJECT'
                  ? 'bg-red-500/10 border-red-500/20 text-red-200'
                  : 'bg-rose-500/10 border-rose-500/20 text-rose-200'
              }`}
            >
              <div className="font-bold flex items-center gap-1.5">
                <Info className="w-4 h-4 shrink-0" />
                Ledger Impact Notice
              </div>
              <p className="text-[11px] opacity-90 leading-relaxed">
                {selectedTarget.action === 'APPROVE' &&
                  'Authorizes the withdrawal payout. Funds will remain safely reserved from the user’s eligible balance.'}
                {selectedTarget.action === 'MARK_PROCESSING' &&
                  'Flags this transaction as currently processing / broadcasting to blockchain or payment channel. User cancellation is locked.'}
                {selectedTarget.action === 'COMPLETE' &&
                  'Permanently seals the payout settlement. The financial ledger debit is locked as final.'}
                {selectedTarget.action === 'REJECT' &&
                  `Rejects the request. A financial ledger REVERSAL credit of $${selectedTarget.item.amount.toFixed(
                    2
                  )} USD will be generated immediately, restoring funds to the user's available balance.`}
                {selectedTarget.action === 'FAIL' &&
                  `Marks the payout transfer as failed. A financial ledger REVERSAL credit of $${selectedTarget.item.amount.toFixed(
                    2
                  )} USD will be generated immediately, restoring funds to the user's available balance.`}
              </p>
            </div>

            {/* Transaction Hash Input for COMPLETE */}
            {selectedTarget.action === 'COMPLETE' && (
              <div className="space-y-2">
                <label className="text-xs font-bold text-white flex items-center justify-between">
                  <span>
                    Verified On-Chain Transaction Hash (0x...) <span className="text-emerald-400">*</span>
                  </span>
                  <span className="text-[10px] text-[#98A2B3]">66-character EVM TxHash</span>
                </label>
                <input
                  type="text"
                  placeholder="0x..."
                  value={txHashInput}
                  onChange={(e) => setTxHashInput(e.target.value)}
                  className="w-full px-3 py-2 bg-[#05070B] border border-white/[0.12] rounded-xl text-xs font-mono text-white placeholder-[#98A2B3] outline-none focus:border-emerald-400 transition-colors"
                />
              </div>
            )}

            {/* Reason / Notes Input for REJECT and FAIL */}
            {(selectedTarget.action === 'REJECT' || selectedTarget.action === 'FAIL') && (
              <div className="space-y-2">
                <label className="text-xs font-bold text-white flex items-center justify-between">
                  <span>
                    Rejection / Failure Reason <span className="text-red-400">*</span>
                  </span>
                  <span className="text-[10px] text-[#98A2B3]">Required for audit trail</span>
                </label>

                {/* Preset suggestions */}
                <div className="flex flex-wrap gap-1.5 pb-1">
                  {REJECTION_PRESETS.map((preset, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setReasonInput(preset)}
                      className="px-2 py-1 rounded bg-white/[0.04] hover:bg-white/[0.08] text-[10px] text-[#98A2B3] hover:text-white border border-white/[0.06] transition-colors"
                    >
                      {preset}
                    </button>
                  ))}
                </div>

                <textarea
                  rows={2}
                  placeholder="Enter specific explanation for rejecting/failing this transfer..."
                  value={reasonInput}
                  onChange={(e) => setReasonInput(e.target.value)}
                  className="w-full px-3 py-2 bg-[#05070B] border border-white/[0.12] rounded-xl text-xs text-white placeholder-[#98A2B3] outline-none focus:border-red-400 transition-colors"
                />
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setSelectedTarget(null);
                  setReasonInput('');
                }}
                disabled={actionInProgress}
                className="px-4 py-2.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.12] text-white text-xs font-bold transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteStateTransition}
                disabled={actionInProgress}
                className={`px-5 py-2.5 rounded-xl text-xs font-extrabold flex items-center gap-2 transition-all shadow-lg active:scale-95 disabled:opacity-50 ${
                  selectedTarget.action === 'APPROVE'
                    ? 'bg-sky-500 hover:bg-sky-400 text-[#05070B]'
                    : selectedTarget.action === 'MARK_PROCESSING'
                    ? 'bg-purple-500 hover:bg-purple-400 text-white'
                    : selectedTarget.action === 'COMPLETE'
                    ? 'bg-emerald-500 hover:bg-emerald-400 text-[#05070B]'
                    : selectedTarget.action === 'REJECT'
                    ? 'bg-red-500 hover:bg-red-400 text-white'
                    : 'bg-rose-500 hover:bg-rose-400 text-white'
                }`}
              >
                {actionInProgress ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Executing Transition...</span>
                  </>
                ) : (
                  <>
                    <span>Confirm {selectedTarget.action === 'MARK_PROCESSING' ? 'Processing' : selectedTarget.action}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inspect Item Details Modal */}
      {inspectItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150">
          <div className="bg-[#07101D] border border-white/[0.14] rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#00CFFF]" />
                Withdrawal Record Details
              </h3>
              <button
                onClick={() => setInspectItem(null)}
                className="text-[#98A2B3] hover:text-white p-1 rounded-lg text-lg leading-none"
              >
                &times;
              </button>
            </div>

            <div className="p-4 rounded-xl bg-[#05070B] border border-white/[0.08] space-y-3 text-xs font-mono">
              <div className="flex justify-between">
                <span className="text-[#98A2B3]">Public ID:</span>
                <span className="text-white font-bold">{inspectItem.publicWithdrawalId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#98A2B3]">Internal UUID:</span>
                <span className="text-white/70 text-[10px]">{inspectItem.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#98A2B3]">User Account:</span>
                <span className="text-[#00CFFF]">{inspectItem.userName} ({inspectItem.userPublicId})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#98A2B3]">Amount:</span>
                <span className="text-white font-bold">${inspectItem.amount.toFixed(2)} USD</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#98A2B3]">Destination Channel:</span>
                <span className="text-white">{inspectItem.destinationType}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[#98A2B3]">Destination Address / Ref:</span>
                <span className="text-white break-all bg-white/[0.04] p-2 rounded text-[10px]">
                  {inspectItem.destinationReference}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#98A2B3]">Current Status:</span>
                <div>{renderStatusBadge(inspectItem.status)}</div>
              </div>
              {inspectItem.rejectionReason && (
                <div className="flex flex-col gap-1 bg-red-500/10 p-2 rounded border border-red-500/20 text-red-300">
                  <span className="font-bold">Rejection / Failure Reason:</span>
                  <span>{inspectItem.rejectionReason}</span>
                </div>
              )}
            </div>

            {/* Audit Timestamps */}
            <div className="p-4 rounded-xl bg-[#05070B] border border-white/[0.08] space-y-2 text-xs font-mono">
              <div className="text-[10px] text-[#98A2B3] uppercase tracking-wider font-bold">Lifecycle Timestamps</div>
              <div className="flex justify-between text-[#98A2B3]">
                <span>Requested At:</span>
                <span className="text-white">{new Date(inspectItem.requestedAt).toUTCString()}</span>
              </div>
              {inspectItem.approvedAt && (
                <div className="flex justify-between text-sky-400">
                  <span>Approved At:</span>
                  <span>{new Date(inspectItem.approvedAt).toUTCString()}</span>
                </div>
              )}
              {inspectItem.completedAt && (
                <div className="flex justify-between text-emerald-400">
                  <span>Completed At:</span>
                  <span>{new Date(inspectItem.completedAt).toUTCString()}</span>
                </div>
              )}
              {inspectItem.rejectedAt && (
                <div className="flex justify-between text-red-400">
                  <span>Rejected At:</span>
                  <span>{new Date(inspectItem.rejectedAt).toUTCString()}</span>
                </div>
              )}
              {inspectItem.failedAt && (
                <div className="flex justify-between text-rose-400">
                  <span>Failed At:</span>
                  <span>{new Date(inspectItem.failedAt).toUTCString()}</span>
                </div>
              )}
              {inspectItem.cancelledAt && (
                <div className="flex justify-between text-slate-400">
                  <span>Cancelled At:</span>
                  <span>{new Date(inspectItem.cancelledAt).toUTCString()}</span>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setInspectItem(null)}
                className="px-4 py-2 rounded-xl bg-white/[0.08] hover:bg-white/[0.12] text-white text-xs font-bold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
