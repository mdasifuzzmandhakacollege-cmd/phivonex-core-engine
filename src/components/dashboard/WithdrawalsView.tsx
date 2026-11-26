import React, { useState, useEffect, useCallback } from 'react';
import {
  ArrowUpRight,
  Wallet,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Search,
  DollarSign,
  ShieldCheck,
  Send,
  Loader2,
  Info,
  Ban,
  Check,
  X,
  Mail,
  KeyRound,
} from 'lucide-react';
import { UserProfile } from '../../context/AuthContext';
import { useSystemConfig } from '../../context/SystemConfigContext';

interface WithdrawalsViewProps {
  user: UserProfile;
  onNavigateTab?: (tab: string) => void;
}

export interface WithdrawalItem {
  id: string;
  publicWithdrawalId: string;
  userId: string;
  amount: number;
  currency: string;
  destinationType: string;
  destinationReference: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  requestedAt: string;
  approvedAt: string | null;
  rejectedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  failedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
}

export const WithdrawalsView: React.FC<WithdrawalsViewProps> = ({ user: _user, onNavigateTab }) => {
  const { minWithdrawalAmount: realTimeMinAmount, cryptoWithdrawalsEnabled, autoWithdrawalEnabled } = useSystemConfig();
  const [availableBalance, setAvailableBalance] = useState<number>(0);
  const [totalWithdrawn, setTotalWithdrawn] = useState<number>(0);
  const [pendingTotal, setPendingTotal] = useState<number>(0);
  const [minWithdrawalAmount, setMinWithdrawalAmount] = useState<number>(realTimeMinAmount || 0.10);

  useEffect(() => {
    if (typeof realTimeMinAmount === 'number' && realTimeMinAmount >= 0) {
      setMinWithdrawalAmount(realTimeMinAmount);
    }
  }, [realTimeMinAmount]);

  const [withdrawals, setWithdrawals] = useState<WithdrawalItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const [amountInput, setAmountInput] = useState<string>('');
  const [destinationType, setDestinationType] = useState<string>('USDT_BEP20');
  const [destinationRef, setDestinationRef] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  const [isOtpModalOpen, setIsOtpModalOpen] = useState<boolean>(false);
  const [withdrawalOtp, setWithdrawalOtp] = useState<string>('');
  const [withdrawalIdempotencyKey, setWithdrawalIdempotencyKey] = useState<string>('');
  const [isRequestingOtp, setIsRequestingOtp] = useState<boolean>(false);
  const [isConfirmingWithdrawal, setIsConfirmingWithdrawal] = useState<boolean>(false);
  const [otpModalError, setOtpModalError] = useState<string | null>(null);
  const [otpResendCountdown, setOtpResendCountdown] = useState<number>(0);

  useEffect(() => {
    if (otpResendCountdown <= 0) return;
    const timer = setInterval(() => {
      setOtpResendCountdown((prev) => Math.max(prev - 1, 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [otpResendCountdown]);

  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedItem, setSelectedItem] = useState<WithdrawalItem | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [walletRes, historyRes, configRes] = await Promise.all([
        fetch('/api/wallet/me', { credentials: 'include' }).catch(() => null),
        fetch('/api/withdrawals/me?limit=50', { credentials: 'include' }).catch(() => null),
        fetch('/api/withdrawals/config', { credentials: 'include' }).catch(() => null),
      ]);

      if (walletRes && walletRes.ok) {
        const walletData = await walletRes.json();
        setAvailableBalance(Number(walletData.availableBalance ?? walletData.ledgerBalance ?? 0));
        setTotalWithdrawn(Number(walletData.totalWithdrawn ?? 0));
      }

      if (configRes && configRes.ok) {
        const configData = await configRes.json();
        if (typeof configData.minWithdrawalAmount === 'number') {
          setMinWithdrawalAmount(configData.minWithdrawalAmount);
        }
      }

      if (historyRes && historyRes.ok) {
        const historyData = await historyRes.json();
        if (Array.isArray(historyData.withdrawals)) {
          setWithdrawals(historyData.withdrawals);
          const pendingSum = historyData.withdrawals
            .filter((w: WithdrawalItem) => w.status === 'PENDING' || w.status === 'APPROVED' || w.status === 'PROCESSING')
            .reduce((acc: number, w: WithdrawalItem) => acc + Number(w.amount || 0), 0);
          setPendingTotal(pendingSum);
        }
      }
    } catch {
      // keep previous state cleanly
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const handleUpdate = () => fetchData();
    window.addEventListener('phivonex:balance-or-tx-updated', handleUpdate);
    return () => window.removeEventListener('phivonex:balance-or-tx-updated', handleUpdate);
  }, [fetchData]);

  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);
    setOtpModalError(null);

    const numAmount = parseFloat(amountInput);
    if (isNaN(numAmount) || numAmount <= 0) {
      setFormError('Please enter a valid positive withdrawal amount.');
      return;
    }

    if (numAmount < minWithdrawalAmount) {
      setFormError(`Minimum withdrawal amount is $${minWithdrawalAmount.toFixed(2)} USDT.`);
      return;
    }

    if (numAmount > availableBalance) {
      setFormError(
        `Insufficient balance. Available balance is $${availableBalance.toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })} USDT.`
      );
      return;
    }

    const trimmedRef = destinationRef.trim();
    if (!trimmedRef) {
      setFormError('Please provide your destination BEP-20 wallet address.');
      return;
    }

    if (destinationType === 'USDT_BEP20' || destinationType === 'BNB' || destinationType === 'USDT_ERC20') {
      if (!/^0x[a-fA-F0-9]{40}$/.test(trimmedRef)) {
        setFormError('Invalid wallet address format. BEP-20 / EVM addresses must start with "0x" and be 42 characters long.');
        return;
      }
    }

    setIsRequestingOtp(true);
    try {
      const res = await fetch('/api/withdrawals/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          amount: numAmount,
          destinationType,
          destinationReference: trimmedRef,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setFormError(data.message || 'Failed to request withdrawal authorization code.');
        return;
      }

      const intentKey = `wdr-ui-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      setWithdrawalIdempotencyKey(intentKey);
      setWithdrawalOtp('');
      setOtpModalError(null);
      setIsOtpModalOpen(true);
      setOtpResendCountdown(60);
    } catch (err: any) {
      setFormError(err?.message || 'Network error occurred while requesting verification code.');
    } finally {
      setIsRequestingOtp(false);
    }
  };

  const handleResendOtp = async () => {
    if (otpResendCountdown > 0) return;
    const numAmount = parseFloat(amountInput);
    const trimmedRef = destinationRef.trim();
    if (isNaN(numAmount) || !trimmedRef) return;

    setIsRequestingOtp(true);
    setOtpModalError(null);
    try {
      const res = await fetch('/api/withdrawals/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          amount: numAmount,
          destinationType,
          destinationReference: trimmedRef,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setOtpModalError(data.message || 'Failed to resend code.');
        return;
      }
      setOtpResendCountdown(60);
    } catch (err: any) {
      setOtpModalError(err?.message || 'Failed to resend verification code.');
    } finally {
      setIsRequestingOtp(false);
    }
  };

  const handleConfirmWithdrawal = async (e: React.FormEvent) => {
    e.preventDefault();
    setOtpModalError(null);

    const cleanOtp = withdrawalOtp.trim();
    if (!cleanOtp || cleanOtp.length !== 6) {
      setOtpModalError('Please enter the 6-digit verification code sent to your email.');
      return;
    }

    const numAmount = parseFloat(amountInput);
    const trimmedRef = destinationRef.trim();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000);
    const keyToUse = withdrawalIdempotencyKey || `wdr-ui-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    try {
      setIsConfirmingWithdrawal(true);
      const res = await fetch('/api/withdrawals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        signal: controller.signal,
        body: JSON.stringify({
          amount: numAmount,
          destinationType,
          destinationReference: trimmedRef,
          otp: cleanOtp,
          idempotencyKey: keyToUse,
        }),
      });

      clearTimeout(timeoutId);
      const data = await res.json();

      if (!res.ok) {
        setOtpModalError(data.message || 'Failed to authorize withdrawal.');
        return;
      }

      setIsOtpModalOpen(false);
      setWithdrawalIdempotencyKey('');
      setFormSuccess(
        `Withdrawal request ${data.publicWithdrawalId || ''} for $${numAmount.toFixed(2)} USDT submitted via ${formatDestinationLabel(destinationType)}.`
      );
      setAmountInput('');
      setDestinationRef('');
      setWithdrawalOtp('');
      await fetchData();
      window.dispatchEvent(new CustomEvent('phivonex:balance-or-tx-updated'));
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        setIsOtpModalOpen(false);
        setFormError('Request timed out. Check your withdrawal history to confirm status.');
      } else {
        setOtpModalError(err?.message || 'Network error occurred. Please try again.');
      }
    } finally {
      clearTimeout(timeoutId);
      setIsConfirmingWithdrawal(false);
      await fetchData();
    }
  };

  const handleCancelRequest = async (publicWithdrawalId: string) => {
    try {
      setCancellingId(publicWithdrawalId);
      setFormError(null);
      const res = await fetch(`/api/withdrawals/${publicWithdrawalId}/cancel`, {
        method: 'POST',
        credentials: 'include',
      });

      if (!res.ok) {
        const data = await res.json();
        setFormError(data.message || 'Failed to cancel withdrawal.');
        return;
      }

      setFormSuccess(`Withdrawal ${publicWithdrawalId} cancelled. Funds restored to your available balance.`);
      await fetchData();
    } catch {
      setFormError('Failed to cancel withdrawal due to a network error.');
    } finally {
      setCancellingId(null);
    }
  };

  const filteredWithdrawals = withdrawals.filter((item) => {
    if (statusFilter !== 'ALL' && item.status !== statusFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        item.publicWithdrawalId.toLowerCase().includes(q) ||
        item.destinationReference.toLowerCase().includes(q) ||
        item.destinationType.toLowerCase().includes(q) ||
        item.amount.toString().includes(q)
      );
    }
    return true;
  });

  const formatDestinationLabel = (type: string) => {
    switch (type) {
      case 'USDT_BEP20':
      case 'BEP20':
        return 'USDT (BEP-20)';
      case 'BNB':
        return 'BNB (BEP-20)';
      case 'USDT_ERC20':
        return 'USDT (ERC-20)';
      case 'BANK_WIRE':
        return 'Bank Wire / SWIFT';
      default:
        return type;
    }
  };

  const getStatusBadge = (status: WithdrawalItem['status']) => {
    switch (status) {
      case 'PENDING':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold bg-[#F5B800]/12 text-[#F5B800] border border-[#F5B800]/30">
            <Clock className="w-3 h-3" />
            Pending Review
          </span>
        );
      case 'APPROVED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold bg-[#00E5FF]/12 text-[#00E5FF] border border-[#00E5FF]/30">
            <CheckCircle2 className="w-3 h-3" />
            Approved
          </span>
        );
      case 'PROCESSING':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold bg-purple-500/15 text-purple-300 border border-purple-500/30">
            <Loader2 className="w-3 h-3 animate-spin" />
            Processing
          </span>
        );
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold bg-[#00E676]/12 text-[#00E676] border border-[#00E676]/30">
            <CheckCircle2 className="w-3 h-3" />
            Completed
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold bg-[#FF4D4F]/12 text-[#FF4D4F] border border-[#FF4D4F]/30">
            <XCircle className="w-3 h-3" />
            Rejected
          </span>
        );
      case 'FAILED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold bg-[#FF4D4F]/12 text-[#FF4D4F] border border-[#FF4D4F]/30">
            <AlertTriangle className="w-3 h-3" />
            Failed
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold bg-white/[0.06] text-slate-400 border border-white/[0.1]">
            <Ban className="w-3 h-3" />
            Cancelled
          </span>
        );
    }
  };

  // Live Circuit-Breaker Status Pill
  const circuitBreakerStatus = !cryptoWithdrawalsEnabled
    ? {
        label: 'PAUSED',
        classes: 'bg-[#FF4D4F]/15 border-[#FF4D4F]/35 text-[#FF4D4F]',
        dot: 'bg-[#FF4D4F]',
      }
    : autoWithdrawalEnabled
    ? {
        label: 'AUTO SETTLEMENT ACTIVE',
        classes: 'bg-[#00E676]/15 border-[#00E676]/35 text-[#00E676]',
        dot: 'bg-[#00E676] animate-pulse',
      }
    : {
        label: 'MANUAL REVIEW',
        classes: 'bg-[#F5B800]/15 border-[#F5B800]/35 text-[#F5B800]',
        dot: 'bg-[#F5B800]',
      };

  const isAddressValid =
    destinationType === 'BANK_WIRE'
      ? destinationRef.trim().length > 8
      : /^0x[a-fA-F0-9]{40}$/.test(destinationRef.trim());

  return (
    <div className="space-y-6 animate-fadeIn pb-10 min-w-0 max-w-full overflow-x-hidden">
      {/* 1. ONE UI 9.5 HERO HEADER + CIRCUIT-BREAKER STATUS PILL */}
      <div className="oneui-glass-card rounded-[24px] p-5 sm:p-7 relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-14 -mr-14 w-72 h-72 bg-[#00E5FF]/[0.07] rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="space-y-2 min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-[11px] font-mono font-bold ${circuitBreakerStatus.classes}`}
              >
                <span className={`w-2 h-2 rounded-full ${circuitBreakerStatus.dot}`} />
                {circuitBreakerStatus.label}
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#00E5FF]/12 border border-[#00E5FF]/25 text-[#00E5FF] text-[11px] font-mono font-semibold">
                <ShieldCheck className="w-3 h-3" />
                BEP-20 · Min ${minWithdrawalAmount.toFixed(2)} USDT
              </span>
            </div>

            <h1 className="text-xl sm:text-3xl font-extrabold text-white tracking-tight">
              BEP-20 Withdrawal Console
            </h1>

            <p className="text-xs sm:text-sm text-slate-400 max-w-2xl leading-relaxed">
              Withdraw verified Main Wallet USDT directly to your personal BNB Smart Chain address with 6-digit email authorization.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {onNavigateTab && (
              <button
                type="button"
                onClick={() => onNavigateTab('wallet')}
                className="px-3.5 py-2 rounded-2xl bg-white/[0.05] hover:bg-white/[0.1] text-white border border-white/[0.1] text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer min-h-[42px] active:scale-95"
              >
                <Wallet className="w-3.5 h-3.5 text-[#00E5FF]" />
                <span>Wallet</span>
              </button>
            )}
            <button
              type="button"
              onClick={fetchData}
              disabled={loading}
              className="px-3 py-2 rounded-2xl bg-white/[0.05] hover:bg-white/[0.1] text-slate-300 hover:text-white border border-white/[0.1] text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 min-h-[42px] active:scale-95"
              title="Refresh withdrawals"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#00E5FF]' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>
      </div>

      {/* Notifications */}
      {formError && (
        <div className="p-4 rounded-2xl bg-[#FF4D4F]/12 border border-[#FF4D4F]/30 flex items-center gap-3 text-xs text-[#FF8587]">
          <AlertTriangle className="w-4 h-4 shrink-0 text-[#FF4D4F]" />
          <span>{formError}</span>
        </div>
      )}

      {formSuccess && (
        <div className="p-4 rounded-2xl bg-[#00E676]/12 border border-[#00E676]/30 flex items-center gap-3 text-xs text-[#00E676]">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{formSuccess}</span>
        </div>
      )}

      {/* 2. METRICS CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <div className="oneui-glass-card rounded-[22px] p-4 sm:p-5 space-y-1.5 min-w-0 border-[#00E5FF]/25">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Available Balance</span>
            <Wallet className="w-4 h-4 text-[#00E5FF]" />
          </div>
          <div className="text-2xl sm:text-3xl font-bold font-mono text-[#00E5FF] tabular-nums truncate">
            ${availableBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-[#00E676] flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            <span>Ready for BEP-20 payout</span>
          </div>
        </div>

        <div className="oneui-glass-card rounded-[22px] p-4 sm:p-5 space-y-1.5 min-w-0">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>In-Flight Reserved</span>
            <Clock className="w-4 h-4 text-[#F5B800]" />
          </div>
          <div className="text-2xl sm:text-3xl font-bold font-mono text-white tabular-nums truncate">
            ${pendingTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-slate-400">Reserved in active requests</div>
        </div>

        <div className="oneui-glass-card rounded-[22px] p-4 sm:p-5 space-y-1.5 min-w-0">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Lifetime Disbursed</span>
            <ArrowUpRight className="w-4 h-4 text-[#00E676]" />
          </div>
          <div className="text-2xl sm:text-3xl font-bold font-mono text-[#00E676] tabular-nums truncate">
            ${totalWithdrawn.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-slate-400">Completed on-chain payouts</div>
        </div>
      </div>

      {/* 3. WITHDRAWAL FORM & SAFEGUARDS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-7 oneui-glass-card rounded-[24px] p-5 sm:p-6 space-y-5 min-w-0">
          <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <Send className="w-4 h-4 text-[#00E5FF]" />
                <span>Request Payout</span>
              </h2>
              <p className="text-xs text-slate-400">
                Minimum ${minWithdrawalAmount.toFixed(2)} USDT · Protected by Email OTP.
              </p>
            </div>
            <span className="text-[10px] font-mono px-2.5 py-1 rounded-full bg-[#00E676]/12 text-[#00E676] border border-[#00E676]/25 shrink-0">
              BEP-20 Rail
            </span>
          </div>

          <form onSubmit={handleSubmitRequest} className="space-y-4">
            {/* Amount Input */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <label className="font-semibold text-white flex items-center gap-1">
                  <DollarSign className="w-3.5 h-3.5 text-[#00E5FF]" />
                  <span>Amount (USDT)</span>
                </label>
                <span className="text-slate-400 font-mono text-[11px]">
                  Available: <strong className="text-white">${availableBalance.toFixed(2)}</strong>
                </span>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 font-mono font-bold text-sm">
                  $
                </div>
                <input
                  type="number"
                  step="0.01"
                  min={minWithdrawalAmount}
                  max={availableBalance > 0 ? availableBalance : undefined}
                  placeholder="0.00"
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                  className="w-full pl-8 pr-16 py-3 bg-[#050807]/85 border border-white/[0.1] focus:border-[#00E5FF] rounded-2xl text-white font-mono font-semibold text-base outline-none transition-colors min-h-[46px]"
                  required
                />
                <button
                  type="button"
                  onClick={() => setAmountInput(availableBalance.toFixed(2))}
                  className="absolute inset-y-1.5 right-2 px-3 bg-[#00E5FF]/15 hover:bg-[#00E5FF]/25 text-[#00E5FF] border border-[#00E5FF]/35 rounded-xl text-xs font-mono font-bold transition-colors cursor-pointer"
                >
                  MAX
                </button>
              </div>
              <div className="text-[11px] text-slate-400 font-mono">
                Minimum withdrawal: ${minWithdrawalAmount.toFixed(2)} USDT
              </div>
            </div>

            {/* Payout Channel Selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-white block">Payout Network</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'USDT_BEP20', name: 'USDT (BEP-20)', sub: 'BNB Smart Chain' },
                  { id: 'BNB', name: 'BNB (BEP-20)', sub: 'Native BNB Chain' },
                  { id: 'USDT_ERC20', name: 'USDT (ERC-20)', sub: 'Ethereum Network' },
                  { id: 'BANK_WIRE', name: 'Bank Wire / SWIFT', sub: 'Institutional Wire' },
                ].map((item) => {
                  const selected = destinationType === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setDestinationType(item.id)}
                      className={`p-3 rounded-2xl text-left border transition-all cursor-pointer min-h-[48px] active:scale-[0.98] ${
                        selected
                          ? 'bg-[#00E5FF]/12 border-[#00E5FF]/45 text-white'
                          : 'bg-[#050807]/70 border-white/[0.08] text-slate-400 hover:text-white'
                      }`}
                    >
                      <div className="text-xs font-bold text-white truncate">{item.name}</div>
                      <div className="text-[10px] text-slate-400 truncate">{item.sub}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Destination Address with live 0x validation */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <label className="font-semibold text-white">Destination Address</label>
                {destinationRef.trim().length > 0 && (
                  <span
                    className={`text-[10px] font-mono font-semibold ${
                      isAddressValid ? 'text-[#00E676]' : 'text-[#F5B800]'
                    }`}
                  >
                    {isAddressValid ? 'Valid Format' : 'Requires 0x + 40 hex chars'}
                  </span>
                )}
              </div>
              <textarea
                rows={2}
                placeholder={
                  destinationType === 'BANK_WIRE'
                    ? 'Bank Name, Account Number, SWIFT/BIC Code, Account Holder'
                    : '0x... (42-character BEP-20 wallet address)'
                }
                value={destinationRef}
                onChange={(e) => setDestinationRef(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-[#050807]/85 border border-white/[0.1] focus:border-[#00E5FF] rounded-2xl text-white font-mono text-xs outline-none transition-colors resize-none"
                required
              />
            </div>

            {!cryptoWithdrawalsEnabled && (
              <div className="p-3.5 rounded-2xl bg-[#FF4D4F]/12 border border-[#FF4D4F]/30 flex items-center gap-2 text-xs text-[#FF8587]">
                <AlertTriangle className="w-4 h-4 shrink-0 text-[#FF4D4F]" />
                <span>Withdrawals are temporarily paused for scheduled maintenance.</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isRequestingOtp || availableBalance < minWithdrawalAmount || !cryptoWithdrawalsEnabled}
              className="w-full py-3 px-4 rounded-2xl bg-[#00E5FF] hover:bg-[#00E5FF]/90 disabled:opacity-40 disabled:cursor-not-allowed text-[#050807] font-bold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer min-h-[48px] active:scale-[0.99] shadow-lg shadow-[#00E5FF]/20"
            >
              {isRequestingOtp ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Sending Authorization Code...</span>
                </>
              ) : !cryptoWithdrawalsEnabled ? (
                <>
                  <Ban className="w-4 h-4" />
                  <span>Withdrawals Temporarily Paused</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Request Withdrawal Authorization</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* Right Column: Settlement Safeguards */}
        <div className="lg:col-span-5 space-y-4">
          <div className="oneui-glass-card rounded-[24px] p-5 sm:p-6 space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#00E676]" />
              <span>Settlement Safeguards</span>
            </h3>

            <ul className="space-y-3 text-xs text-slate-300">
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-[#00E676] shrink-0 mt-0.5" />
                <span>
                  <strong className="text-white">Circuit-Breaker Protection:</strong> Automated treasury thresholds protect platform liquidity and route high-value requests for multi-sig review.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-[#00E676] shrink-0 mt-0.5" />
                <span>
                  <strong className="text-white">Email OTP Authorization:</strong> Every payout requires a fresh 6-digit verification code sent to your verified account email.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-[#00E676] shrink-0 mt-0.5" />
                <span>
                  <strong className="text-white">Instant Cancellation:</strong> Pending requests can be cancelled directly from your history to restore funds immediately.
                </span>
              </li>
            </ul>

            <div className="p-3.5 rounded-2xl bg-[#050807]/75 border border-white/[0.08] text-[11px] text-slate-400 space-y-1">
              <div className="font-semibold text-white flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-[#00E5FF]" />
                <span>Current Settlement Mode</span>
              </div>
              <p>
                Mode: <strong className="text-white font-mono">{circuitBreakerStatus.label}</strong> · Minimum payout: <strong className="text-white font-mono">${minWithdrawalAmount.toFixed(2)} USDT</strong>.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 4. WITHDRAWAL HISTORY */}
      <div className="oneui-glass-card rounded-[24px] p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/[0.08] pb-3">
          <div>
            <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#00E5FF]" />
              <span>Withdrawal History</span>
            </h2>
            <p className="text-xs text-slate-400">Audit log of all requested payouts and on-chain settlements.</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search ID / Address..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-2 bg-[#050807]/85 border border-white/[0.1] rounded-xl text-xs text-white outline-none focus:border-[#00E5FF] w-36 sm:w-48"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 bg-[#050807]/85 border border-white/[0.1] rounded-xl text-xs text-white outline-none focus:border-[#00E5FF] cursor-pointer"
            >
              <option value="ALL">All Statuses</option>
              <option value="PENDING">Pending Review</option>
              <option value="APPROVED">Approved</option>
              <option value="PROCESSING">Processing</option>
              <option value="COMPLETED">Completed</option>
              <option value="REJECTED">Rejected</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>
        </div>

        {/* Desktop Table */}
        <div className="hidden md:block overflow-x-auto">
          {filteredWithdrawals.length === 0 && !loading ? (
            <div className="p-8 text-center text-xs text-slate-400 font-mono border border-dashed border-white/[0.1] rounded-2xl space-y-1.5">
              <div className="text-white font-semibold">No withdrawal records yet</div>
              <p>Your payout history will appear here once you submit a withdrawal request.</p>
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="text-slate-400 border-b border-white/[0.08] uppercase text-[10px] font-mono tracking-wider">
                  <th className="py-3 px-3">Request ID</th>
                  <th className="py-3 px-3">Network / Destination</th>
                  <th className="py-3 px-3">Amount</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3">Date</th>
                  <th className="py-3 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {filteredWithdrawals.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => setSelectedItem(item)}
                    className="hover:bg-white/[0.03] transition-colors cursor-pointer"
                  >
                    <td className="py-3 px-3 font-mono font-bold text-white">{item.publicWithdrawalId}</td>
                    <td className="py-3 px-3">
                      <div className="font-semibold text-white">{formatDestinationLabel(item.destinationType)}</div>
                      <div className="font-mono text-[11px] text-slate-400 truncate max-w-[180px]">
                        {item.destinationReference}
                      </div>
                    </td>
                    <td className="py-3 px-3 font-mono font-bold text-[#00E5FF] tabular-nums">
                      ${item.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-3">{getStatusBadge(item.status)}</td>
                    <td className="py-3 px-3 text-slate-400 font-mono text-[11px]">
                      {new Date(item.requestedAt).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                      {item.status === 'PENDING' ? (
                        <button
                          type="button"
                          onClick={() => handleCancelRequest(item.publicWithdrawalId)}
                          disabled={cancellingId === item.publicWithdrawalId}
                          className="px-3 py-1.5 rounded-xl bg-[#FF4D4F]/12 hover:bg-[#FF4D4F]/20 text-[#FF4D4F] border border-[#FF4D4F]/30 font-semibold text-[11px] transition-colors cursor-pointer"
                        >
                          {cancellingId === item.publicWithdrawalId ? 'Cancelling...' : 'Cancel'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setSelectedItem(item)}
                          className="px-3 py-1.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-white border border-white/[0.1] font-semibold text-[11px] transition-colors cursor-pointer"
                        >
                          Inspect
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Mobile Stacked Cards */}
        <div className="block md:hidden space-y-3">
          {filteredWithdrawals.length === 0 && !loading ? (
            <div className="p-6 text-center text-xs text-slate-400 font-mono border border-dashed border-white/[0.1] rounded-2xl space-y-1">
              <div className="text-white font-semibold">No withdrawals found</div>
              <p>Requested payouts will appear here.</p>
            </div>
          ) : (
            filteredWithdrawals.map((item) => (
              <div
                key={item.id}
                onClick={() => setSelectedItem(item)}
                className="p-4 rounded-2xl bg-[#050807]/75 border border-white/[0.08] space-y-2.5 cursor-pointer"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono font-bold text-xs text-white truncate">{item.publicWithdrawalId}</span>
                  <div className="shrink-0">{getStatusBadge(item.status)}</div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="text-sm font-mono font-bold text-[#00E5FF] tabular-nums">
                    ${item.amount.toFixed(2)} USDT
                  </div>
                  <span className="text-[10px] font-mono text-slate-400">
                    {new Date(item.requestedAt).toLocaleDateString()}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs pt-2 border-t border-white/[0.06]">
                  <span className="text-[11px] text-slate-400">{formatDestinationLabel(item.destinationType)}</span>
                  {item.status === 'PENDING' && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCancelRequest(item.publicWithdrawalId);
                      }}
                      disabled={cancellingId === item.publicWithdrawalId}
                      className="px-2.5 py-1 rounded-xl bg-[#FF4D4F]/12 text-[#FF4D4F] border border-[#FF4D4F]/30 text-[10px] font-bold cursor-pointer"
                    >
                      {cancellingId === item.publicWithdrawalId ? 'Cancelling...' : 'Cancel'}
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Inspector Modal */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div className="fixed inset-0" onClick={() => setSelectedItem(null)} aria-hidden="true" />
          <div className="relative w-full max-w-lg oneui-glass-card rounded-[28px] p-5 sm:p-7 space-y-5 z-10 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between border-b border-white/[0.08] pb-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-[#00E5FF]" />
                  <span>Withdrawal Inspector</span>
                </h3>
                <p className="text-xs text-slate-400 font-mono">{selectedItem.publicWithdrawalId}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedItem(null)}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3 p-4 rounded-2xl bg-[#050807]/80 border border-white/[0.08]">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-mono">Amount</span>
                  <span className="text-lg font-bold font-mono text-[#00E5FF] tabular-nums">
                    ${selectedItem.amount.toFixed(2)} USDT
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-mono">Status</span>
                  <div className="mt-1">{getStatusBadge(selectedItem.status)}</div>
                </div>
              </div>

              <div className="space-y-2 p-4 rounded-2xl bg-[#050807]/80 border border-white/[0.08] font-mono text-[11px]">
                <div className="flex justify-between gap-2">
                  <span className="text-slate-400">Channel:</span>
                  <span className="text-white">{formatDestinationLabel(selectedItem.destinationType)}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-400">Destination:</span>
                  <span className="text-white truncate max-w-[200px]">{selectedItem.destinationReference}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-400">Requested:</span>
                  <span className="text-white">{new Date(selectedItem.requestedAt).toLocaleString()}</span>
                </div>
                {selectedItem.approvedAt && (
                  <div className="flex justify-between gap-2 text-[#00E676]">
                    <span>Approved:</span>
                    <span>{new Date(selectedItem.approvedAt).toLocaleString()}</span>
                  </div>
                )}
                {selectedItem.completedAt && (
                  <div className="flex justify-between gap-2 text-[#00E676]">
                    <span>Completed:</span>
                    <span>{new Date(selectedItem.completedAt).toLocaleString()}</span>
                  </div>
                )}
                {selectedItem.rejectionReason && (
                  <div className="p-2.5 rounded-xl bg-[#FF4D4F]/12 text-[#FF8587] text-[11px] mt-2">
                    <strong>Rejection Reason:</strong> {selectedItem.rejectionReason}
                  </div>
                )}
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedItem(null)}
                className="px-5 py-2.5 rounded-2xl bg-[#00E5FF] hover:bg-[#00E5FF]/90 text-[#050807] font-bold text-xs transition-colors cursor-pointer min-h-[42px]"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. WITHDRAWAL OTP AUTHORIZATION MODAL */}
      {isOtpModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div
            className="fixed inset-0"
            onClick={() => {
              if (!isConfirmingWithdrawal) setIsOtpModalOpen(false);
            }}
            aria-hidden="true"
          />

          <div className="relative w-full max-w-md oneui-glass-card border-[#00E5FF]/35 rounded-[28px] p-6 space-y-4 z-10 text-xs">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
              <div className="flex items-center gap-2 text-white font-bold font-mono">
                <KeyRound className="w-4 h-4 text-[#00E5FF]" />
                <span>Authorize Withdrawal</span>
              </div>
              <button
                type="button"
                disabled={isConfirmingWithdrawal}
                onClick={() => setIsOtpModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer disabled:opacity-30"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#00E5FF]/10 border border-[#00E5FF]/25 text-xs text-[#00E5FF] space-y-1">
              <div className="flex items-center gap-2 font-bold">
                <Mail className="w-4 h-4 shrink-0" />
                <span>6-Digit Verification Code Sent</span>
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                Enter the one-time authorization code sent to your registered account email.
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#050807]/80 border border-white/[0.08] space-y-2 text-[11px] font-mono">
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Amount:</span>
                <span className="text-[#00E5FF] font-bold text-sm tabular-nums">
                  ${parseFloat(amountInput || '0').toFixed(2)} USDT
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Network:</span>
                <span className="text-white">{formatDestinationLabel(destinationType)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Destination:</span>
                <span className="text-slate-300 truncate max-w-[200px]" title={destinationRef}>
                  {destinationRef}
                </span>
              </div>
            </div>

            {otpModalError && (
              <div className="p-3 rounded-xl bg-[#FF4D4F]/12 border border-[#FF4D4F]/30 text-xs text-[#FF8587] flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-[#FF4D4F]" />
                <span>{otpModalError}</span>
              </div>
            )}

            <form onSubmit={handleConfirmWithdrawal} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-white mb-1.5">
                  Enter 6-Digit Verification Code
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  maxLength={6}
                  placeholder="000000"
                  value={withdrawalOtp}
                  onChange={(e) => setWithdrawalOtp(e.target.value.replace(/[^0-9]/g, ''))}
                  className="w-full bg-[#050807]/85 border border-white/[0.12] focus:border-[#00E5FF] rounded-2xl px-4 py-3 text-center text-xl font-mono tracking-[0.4em] text-[#00E5FF] placeholder:text-white/20 focus:outline-none min-h-[48px]"
                />
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                <span>Did not receive the code?</span>
                <button
                  type="button"
                  disabled={isRequestingOtp || otpResendCountdown > 0}
                  onClick={handleResendOtp}
                  className="text-[#00E5FF] hover:underline disabled:opacity-40 font-semibold cursor-pointer"
                >
                  {isRequestingOtp
                    ? 'Resending...'
                    : otpResendCountdown > 0
                    ? `Resend in ${otpResendCountdown}s`
                    : 'Resend Code'}
                </button>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  disabled={isConfirmingWithdrawal}
                  onClick={() => setIsOtpModalOpen(false)}
                  className="flex-1 py-2.5 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] text-slate-300 font-semibold text-xs cursor-pointer min-h-[44px] disabled:opacity-40"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isConfirmingWithdrawal || withdrawalOtp.trim().length !== 6}
                  className="flex-1 py-2.5 rounded-2xl bg-[#00E5FF] text-[#050807] font-bold text-xs hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-1.5 min-h-[44px]"
                >
                  {isConfirmingWithdrawal ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Authorizing...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Confirm Payout</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
