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
  Filter,
  DollarSign,
  ShieldCheck,
  Building2,
  QrCode,
  Send,
  Loader2,
  Info,
  ExternalLink,
  Ban,
  Check,
  X,
  Sparkles,
  Mail,
  KeyRound,
} from 'lucide-react';
import { UserProfile } from '../../context/AuthContext';
import { useSystemConfig } from '../../context/SystemConfigContext';
import { UsdtIcon, BnbIcon } from '../brand/CryptoIcons';

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
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  // Form states - BNB Smart Chain BEP-20 as primary default
  const [amountInput, setAmountInput] = useState<string>('');
  const [destinationType, setDestinationType] = useState<string>('USDT_BEP20');
  const [destinationRef, setDestinationRef] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  // OTP Verification Modal State
  const [isOtpModalOpen, setIsOtpModalOpen] = useState<boolean>(false);
  const [withdrawalOtp, setWithdrawalOtp] = useState<string>('');
  const [withdrawalIdempotencyKey, setWithdrawalIdempotencyKey] = useState<string>('');
  const [isRequestingOtp, setIsRequestingOtp] = useState<boolean>(false);
  const [isConfirmingWithdrawal, setIsConfirmingWithdrawal] = useState<boolean>(false);
  const [otpModalError, setOtpModalError] = useState<string | null>(null);
  const [otpResendCountdown, setOtpResendCountdown] = useState<number>(0);

  // Countdown timer for OTP resend
  useEffect(() => {
    if (otpResendCountdown <= 0) return;
    const timer = setInterval(() => {
      setOtpResendCountdown((prev) => Math.max(prev - 1, 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [otpResendCountdown]);

  // Filter & Search
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Selected Detail Modal
  const [selectedItem, setSelectedItem] = useState<WithdrawalItem | null>(null);

  // Fetch Wallet Balance & Withdrawal History & Config
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [walletRes, historyRes, configRes] = await Promise.all([
        fetch('/api/wallet/me', { credentials: 'include' }).catch(() => null),
        fetch('/api/withdrawals/me?limit=50', { credentials: 'include' }).catch(() => null),
        fetch('/api/withdrawals/config').catch(() => null),
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
            .reduce((acc: number, w: WithdrawalItem) => acc + (w.amount || 0), 0);
          setPendingTotal(pendingSum);
        }
      }
    } catch (err) {
      console.warn('[WithdrawalsView] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Real-time synchronization on balance or withdrawal status update
  useEffect(() => {
    const handleUpdate = () => {
      fetchData();
    };
    window.addEventListener('phivonex:balance-or-tx-updated', handleUpdate);
    return () => window.removeEventListener('phivonex:balance-or-tx-updated', handleUpdate);
  }, [fetchData]);

  // Handle Form Submission (Initiates 6-Digit OTP Verification)
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
      setFormError(`Minimum withdrawal amount is $${minWithdrawalAmount.toFixed(2)} USD.`);
      return;
    }

    if (numAmount > availableBalance) {
      setFormError(`Insufficient balance. Available balance is $${availableBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD.`);
      return;
    }

    const trimmedRef = destinationRef.trim();
    if (!trimmedRef) {
      setFormError('Please provide your payout wallet address or destination account.');
      return;
    }

    if (destinationType === 'USDT_BEP20' || destinationType === 'BNB' || destinationType === 'USDT_ERC20') {
      const evmRegex = /^0x[a-fA-F0-9]{40}$/;
      if (!evmRegex.test(trimmedRef)) {
        setFormError('Invalid wallet address format. EVM / BNB Smart Chain addresses must start with "0x" and be 42 characters long.');
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
      console.warn('[WithdrawalsView] OTP request error:', err);
      setFormError(err?.message || 'Network error occurred while requesting verification code.');
    } finally {
      setIsRequestingOtp(false);
    }
  };

  // Handle OTP Resend
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
      setOtpModalError(null);
    } catch (err: any) {
      setOtpModalError(err?.message || 'Failed to resend verification code.');
    } finally {
      setIsRequestingOtp(false);
    }
  };

  // Handle Final OTP Confirmation & Execution
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
    if (!withdrawalIdempotencyKey) {
      setWithdrawalIdempotencyKey(keyToUse);
    }

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
      setFormSuccess(`Withdrawal request ${data.publicWithdrawalId || ''} for $${numAmount.toFixed(2)} USD submitted successfully via ${formatDestinationLabel(destinationType)}.`);
      setAmountInput('');
      setDestinationRef('');
      setWithdrawalOtp('');
      await fetchData();
      window.dispatchEvent(new CustomEvent('phivonex:balance-or-tx-updated'));
    } catch (err: any) {
      clearTimeout(timeoutId);
      console.warn('[WithdrawalsView] Submit error:', err);
      if (err.name === 'AbortError') {
        setIsOtpModalOpen(false);
        setFormError('Request timed out. Please check your withdrawal history to verify status.');
      } else {
        setOtpModalError(err?.message || 'Network error occurred. Please try again.');
      }
    } finally {
      clearTimeout(timeoutId);
      setIsConfirmingWithdrawal(false);
      await fetchData();
    }
  };

  // Handle User Cancellation
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

      setFormSuccess(`Withdrawal ${publicWithdrawalId} cancelled successfully. Funds restored to available balance.`);
      await fetchData();
    } catch (err) {
      console.warn('[WithdrawalsView] Cancel error:', err);
      setFormError('Failed to cancel withdrawal due to network error.');
    } finally {
      setCancellingId(null);
    }
  };

  // Filtered list
  const filteredWithdrawals = withdrawals.filter((item) => {
    if (statusFilter !== 'ALL' && item.status !== statusFilter) {
      return false;
    }
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
      case 'BTC':
        return 'Bitcoin (BTC)';
      case 'ETH':
        return 'Ethereum (ETH)';
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
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-medium bg-[#F59E0B]/10 text-[#F59E0B] border border-[#F59E0B]/20">
            <Clock className="w-3 h-3" />
            Pending Review
          </span>
        );
      case 'APPROVED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-medium bg-[#00CFFF]/10 text-[#00CFFF] border border-[#00CFFF]/20">
            <CheckCircle2 className="w-3 h-3" />
            Approved — Awaiting Payout
          </span>
        );
      case 'PROCESSING':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-medium bg-[#A855F7]/10 text-[#A855F7] border border-[#A855F7]/20">
            <Loader2 className="w-3 h-3 animate-spin" />
            Blockchain Confirmation Pending
          </span>
        );
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-medium bg-[#32D583]/10 text-[#32D583] border border-[#32D583]/20">
            <CheckCircle2 className="w-3 h-3" />
            Completed
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-medium bg-[#F04438]/10 text-[#F04438] border border-[#F04438]/20">
            <XCircle className="w-3 h-3" />
            Rejected
          </span>
        );
      case 'FAILED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-medium bg-[#F04438]/10 text-[#F04438] border border-[#F04438]/20">
            <AlertTriangle className="w-3 h-3" />
            Failed
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-medium bg-white/[0.06] text-[#98A2B3] border border-white/[0.1]">
            <Ban className="w-3 h-3" />
            Cancelled
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 sm:space-y-8 animate-fadeIn pb-12">
      {/* ========================================================
          1. COMPACT PAGE HERO
         ======================================================== */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#07101D] via-[#0B1728] to-[#07101D] border border-white/[0.08] p-5 sm:p-7 shadow-xl">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-72 h-72 bg-[#00CFFF]/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-[#00CFFF]/10 border border-[#00CFFF]/25 text-[#00CFFF] text-[11px] font-semibold">
                <ArrowUpRight className="w-3.5 h-3.5" />
                Settlement Engine
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-[#32D583]/10 border border-[#32D583]/25 text-[#32D583] text-[11px] font-semibold">
                <ShieldCheck className="w-3 h-3" />
                BNB Smart Chain (BEP-20)
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              Withdrawals &amp; Settlements
            </h1>

            <p className="text-xs sm:text-sm text-[#98A2B3] max-w-2xl leading-relaxed">
              Request payout disbursements directly from your verified ledger balance to your personal Web3 wallet.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
            {onNavigateTab && (
              <button
                onClick={() => onNavigateTab('wallet')}
                className="px-3.5 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-white border border-white/[0.08] text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer min-h-[44px]"
              >
                <Wallet className="w-3.5 h-3.5 text-[#00CFFF]" />
                <span>Wallet</span>
              </button>
            )}
            <button
              onClick={fetchData}
              disabled={loading}
              className="px-3 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-[#98A2B3] hover:text-white border border-white/[0.08] text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 min-h-[44px]"
              title="Refresh withdrawals"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#00CFFF]' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>
      </div>

      {/* Notifications */}
      {formError && (
        <div className="p-4 rounded-xl bg-[#F04438]/10 border border-[#F04438]/30 flex items-center gap-3 text-xs text-[#FDA29B]">
          <AlertTriangle className="w-4 h-4 shrink-0 text-[#F04438]" />
          <span>{formError}</span>
        </div>
      )}

      {formSuccess && (
        <div className="p-4 rounded-xl bg-[#32D583]/10 border border-[#32D583]/30 flex items-center gap-3 text-xs text-[#32D583]">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{formSuccess}</span>
        </div>
      )}

      {/* ========================================================
          2. METRICS CARDS
         ======================================================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {/* Card 1: Available Balance */}
        <div className="p-4 sm:p-5 rounded-xl bg-[#07101D] border border-[#00CFFF]/30 space-y-2 relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-[#98A2B3]">
            <span className="font-medium">Available Ledger Balance</span>
            <div className="w-7 h-7 rounded-lg bg-[#00CFFF]/10 border border-[#00CFFF]/20 flex items-center justify-center text-[#00CFFF]">
              <Wallet className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-bold font-mono text-[#00CFFF] tabular-nums">
            ${availableBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-[#32D583] flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            <span>Eligible for instant withdrawal</span>
          </div>
        </div>

        {/* Card 2: Pending Reserved */}
        <div className="p-4 sm:p-5 rounded-xl bg-[#07101D] border border-white/[0.08] space-y-2 relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-[#98A2B3]">
            <span className="font-medium">In-Flight Reserved</span>
            <div className="w-7 h-7 rounded-lg bg-[#F59E0B]/10 border border-[#F59E0B]/20 flex items-center justify-center text-[#F59E0B]">
              <Clock className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-bold font-mono text-white tabular-nums">
            ${pendingTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-[#667085]">
            Locked in pending/processing requests
          </div>
        </div>

        {/* Card 3: Total Withdrawn */}
        <div className="p-4 sm:p-5 rounded-xl bg-[#07101D] border border-white/[0.08] space-y-2 relative overflow-hidden sm:col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between text-xs text-[#98A2B3]">
            <span className="font-medium">Lifetime Disbursed</span>
            <div className="w-7 h-7 rounded-lg bg-[#32D583]/10 border border-[#32D583]/20 flex items-center justify-center text-[#32D583]">
              <CheckCircle2 className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-bold font-mono text-[#32D583] tabular-nums">
            ${totalWithdrawn.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-[#667085]">
            Total settled completed payouts
          </div>
        </div>
      </div>

      {/* ========================================================
          3. MAIN WITHDRAWAL FORM & SAFEGUARDS
         ======================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Withdrawal Request Form (7 Cols) */}
        <div className="lg:col-span-7 p-5 sm:p-6 rounded-2xl bg-[#07101D] border border-white/[0.08] shadow-xl space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <Send className="w-4 h-4 text-[#00CFFF]" />
                <span>Request Payout</span>
              </h2>
              <p className="text-xs text-[#98A2B3]">
                Funds are reserved from your ledger balance upon submission.
              </p>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#32D583]/10 text-[#32D583] border border-[#32D583]/20">
              Low Network Gas
            </span>
          </div>

          <form onSubmit={handleSubmitRequest} className="space-y-4">
            {/* Amount Input */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <label className="font-medium text-white flex items-center gap-1">
                  <DollarSign className="w-3.5 h-3.5 text-[#00CFFF]" />
                  <span>Amount (USD)</span>
                </label>
                <span className="text-[#667085] font-mono text-[11px]">
                  Available: <strong className="text-white">${availableBalance.toFixed(2)}</strong>
                </span>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#667085] font-mono font-bold text-sm">
                  $
                </div>
                <input
                  type="number"
                  step="0.01"
                  min={minWithdrawalAmount}
                  max={availableBalance > 0 ? availableBalance : 0}
                  placeholder="0.00"
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                  className="w-full pl-8 pr-16 py-3 bg-[#05070B] border border-white/[0.1] focus:border-[#00CFFF] rounded-xl text-white font-mono font-semibold text-base outline-none transition-colors min-h-[44px]"
                  required
                />
                <button
                  type="button"
                  onClick={() => setAmountInput(availableBalance.toFixed(2))}
                  className="absolute inset-y-1.5 right-2 px-2.5 bg-[#00CFFF]/10 hover:bg-[#00CFFF]/20 text-[#00CFFF] border border-[#00CFFF]/30 rounded-lg text-xs font-mono font-bold transition-colors cursor-pointer"
                >
                  MAX
                </button>
              </div>
              <div className="text-[11px] text-[#667085] flex items-center justify-between">
                <span>Minimum withdrawal: ${minWithdrawalAmount.toFixed(2)} USD</span>
              </div>
            </div>

            {/* Payout Channel Selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-white block">
                Payout Method
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'USDT_BEP20', name: 'USDT (BEP-20)', sub: 'BNB Smart Chain (Recommended)', isPrimary: true },
                  { id: 'BNB', name: 'BNB (BEP-20)', sub: 'Native BNB Chain', isPrimary: true },
                  { id: 'USDT_ERC20', name: 'USDT (ERC-20)', sub: 'Ethereum Network', isPrimary: false },
                  { id: 'BANK_WIRE', name: 'Bank Wire / SWIFT', sub: 'Traditional Wire', isPrimary: false },
                ].map((item) => {
                  const selected = destinationType === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setDestinationType(item.id)}
                      className={`p-2.5 rounded-xl text-left border transition-all cursor-pointer relative min-h-[44px] ${
                        selected
                          ? 'bg-[#00CFFF]/10 border-[#00CFFF]/50 text-white'
                          : 'bg-[#05070B] border-white/[0.06] text-[#98A2B3] hover:text-white'
                      }`}
                    >
                      <div className="text-xs font-bold text-white">{item.name}</div>
                      <div className="text-[10px] text-[#667085] truncate">{item.sub}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Destination Address */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-white block">
                Destination Address / Details
              </label>
              <textarea
                rows={2}
                placeholder={
                  destinationType === 'BANK_WIRE'
                    ? 'Bank Name, Account Number, SWIFT/BIC Code, Account Holder Name'
                    : 'Enter your 0x... BNB Smart Chain (BEP-20) address'
                }
                value={destinationRef}
                onChange={(e) => setDestinationRef(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-[#05070B] border border-white/[0.1] focus:border-[#00CFFF] rounded-xl text-white font-mono text-xs outline-none transition-colors resize-none"
                required
              />
            </div>

            {/* Withdrawal Disabled Notice */}
            {!cryptoWithdrawalsEnabled && (
              <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center gap-2 text-xs text-amber-300">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                <span>
                  Cryptocurrency withdrawals are temporarily paused for maintenance. New requests cannot be initiated at this time.
                </span>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isRequestingOtp || submitting || availableBalance < minWithdrawalAmount || !cryptoWithdrawalsEnabled}
              className="w-full py-3 px-4 rounded-xl bg-[#00CFFF] hover:bg-[#00CFFF]/90 disabled:opacity-40 disabled:cursor-not-allowed text-[#05070B] font-bold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer min-h-[48px]"
            >
              {isRequestingOtp ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Dispatching Authorization Code...</span>
                </>
              ) : submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Submitting Request...</span>
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

        {/* Right Column: Safeguards (5 Cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="p-5 sm:p-6 rounded-2xl bg-[#07101D] border border-white/[0.08] shadow-xl space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#32D583]" />
              <span>Settlement Safeguards</span>
            </h3>

            <ul className="space-y-3 text-xs text-[#98A2B3]">
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-[#32D583] shrink-0 mt-0.5" />
                <span>
                  <strong className="text-white">Atomic Reservation:</strong> Funds are locked immediately upon request submission to eliminate double-spending.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-[#32D583] shrink-0 mt-0.5" />
                <span>
                  <strong className="text-white">Fast Execution:</strong> BEP-20 payouts on BNB Smart Chain process with high finality and low gas fees.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-[#32D583] shrink-0 mt-0.5" />
                <span>
                  <strong className="text-white">Cancel Anytime:</strong> Pending requests can be cancelled directly from your history to release funds instantly.
                </span>
              </li>
            </ul>

            <div className="p-3 rounded-xl bg-[#05070B] border border-white/[0.06] text-[11px] text-[#98A2B3] space-y-1">
              <div className="font-semibold text-white flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-[#00CFFF]" />
                <span>Supported Assets</span>
              </div>
              <p>
                Withdrawals are prioritized in <strong className="text-white">USDT (BEP-20)</strong> and <strong className="text-white">BNB</strong> on BNB Smart Chain.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================
          4. WITHDRAWAL HISTORY TABLE
         ======================================================== */}
      <div className="p-5 sm:p-6 rounded-2xl bg-[#07101D] border border-white/[0.08] shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/[0.06] pb-3">
          <div>
            <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#00CFFF]" />
              <span>Withdrawal History &amp; Status</span>
            </h2>
            <p className="text-xs text-[#98A2B3]">
              Audit log of all requested payouts and settlements.
            </p>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#98A2B3]" />
              <input
                type="text"
                placeholder="Search ID / Address..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 bg-[#05070B] border border-white/[0.1] rounded-lg text-xs text-white outline-none focus:border-[#00CFFF] w-36 sm:w-48 min-h-[36px]"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-2.5 py-1.5 bg-[#05070B] border border-white/[0.1] rounded-lg text-xs text-white outline-none focus:border-[#00CFFF] cursor-pointer min-h-[36px]"
            >
              <option value="ALL">All Statuses</option>
              <option value="PENDING">Pending Review</option>
              <option value="APPROVED">Approved — Awaiting Payout</option>
              <option value="PROCESSING">Blockchain Confirmation Pending</option>
              <option value="COMPLETED">Completed</option>
              <option value="REJECTED">Rejected</option>
              <option value="CANCELLED">Cancelled</option>
              <option value="FAILED">Failed</option>
            </select>
          </div>
        </div>

        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          {filteredWithdrawals.length === 0 && !loading ? (
            <div className="p-8 text-center text-xs text-[#98A2B3] font-mono border border-dashed border-white/[0.08] rounded-xl space-y-2">
              <div className="text-white font-medium">No withdrawal records found</div>
              <p className="text-[#667085]">
                Your withdrawal history will appear here once you submit a payout request.
              </p>
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="text-[#98A2B3] border-b border-white/[0.06] uppercase text-[10px] font-mono tracking-wider">
                  <th className="py-3 px-3">Public Request ID</th>
                  <th className="py-3 px-3">Channel / Destination</th>
                  <th className="py-3 px-3">Amount</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3">Date</th>
                  <th className="py-3 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {filteredWithdrawals.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => setSelectedItem(item)}
                    className="hover:bg-white/[0.02] transition-colors cursor-pointer group"
                  >
                    <td className="py-3 px-3 font-mono font-bold text-white">
                      {item.publicWithdrawalId}
                    </td>
                    <td className="py-3 px-3">
                      <div className="font-medium text-white">{formatDestinationLabel(item.destinationType)}</div>
                      <div className="font-mono text-[11px] text-[#667085] truncate max-w-[180px]">
                        {item.destinationReference}
                      </div>
                    </td>
                    <td className="py-3 px-3 font-mono font-bold text-[#00CFFF]">
                      ${item.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-3">
                      {getStatusBadge(item.status)}
                    </td>
                    <td className="py-3 px-3 text-[#98A2B3] font-mono text-[11px]">
                      {new Date(item.requestedAt).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                      {item.status === 'PENDING' ? (
                        <button
                          onClick={() => handleCancelRequest(item.publicWithdrawalId)}
                          disabled={cancellingId === item.publicWithdrawalId}
                          className="px-2.5 py-1 rounded-lg bg-[#F04438]/10 hover:bg-[#F04438]/20 text-[#F04438] border border-[#F04438]/30 font-medium text-[11px] transition-colors cursor-pointer min-h-[32px]"
                        >
                          {cancellingId === item.publicWithdrawalId ? 'Cancelling...' : 'Cancel'}
                        </button>
                      ) : (
                        <button
                          onClick={() => setSelectedItem(item)}
                          className="px-2.5 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-white border border-white/[0.08] font-medium text-[11px] transition-colors cursor-pointer min-h-[32px]"
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

        {/* Mobile Stacked Card View (<768px) */}
        <div className="block md:hidden space-y-3">
          {filteredWithdrawals.length === 0 && !loading ? (
            <div className="p-6 text-center text-xs text-[#98A2B3] font-mono border border-dashed border-white/[0.08] rounded-xl space-y-2">
              <div className="text-white font-medium">No withdrawals found</div>
              <p className="text-[#667085]">
                Requested payouts will appear here.
              </p>
            </div>
          ) : (
            filteredWithdrawals.map((item) => (
              <div
                key={item.id}
                onClick={() => setSelectedItem(item)}
                className="p-4 rounded-xl bg-[#05070B] border border-white/[0.06] space-y-2.5 cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-xs text-white">
                    {item.publicWithdrawalId}
                  </span>
                  <div>{getStatusBadge(item.status)}</div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="text-sm font-mono font-bold text-[#00CFFF]">
                    ${item.amount.toFixed(2)} USD
                  </div>
                  <span className="text-[10px] font-mono text-[#667085]">
                    {new Date(item.requestedAt).toLocaleDateString()}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs pt-1 border-t border-white/[0.04]">
                  <span className="text-[11px] text-[#98A2B3]">
                    {formatDestinationLabel(item.destinationType)}
                  </span>
                  {item.status === 'PENDING' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCancelRequest(item.publicWithdrawalId);
                      }}
                      disabled={cancellingId === item.publicWithdrawalId}
                      className="px-2.5 py-1 rounded bg-[#F04438]/10 text-[#F04438] border border-[#F04438]/30 text-[10px] font-bold cursor-pointer"
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

      {/* Extended Inspector Modal */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div
            className="fixed inset-0"
            onClick={() => setSelectedItem(null)}
            aria-hidden="true"
          />

          <div className="relative w-full max-w-lg bg-[#07101D] border border-white/[0.12] rounded-2xl p-5 sm:p-7 shadow-2xl space-y-5 z-10 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between border-b border-white/[0.08] pb-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-[#00CFFF]" />
                  <span>Withdrawal Inspector</span>
                </h3>
                <p className="text-xs text-[#98A2B3] font-mono">{selectedItem.publicWithdrawalId}</p>
              </div>
              <button
                onClick={() => setSelectedItem(null)}
                className="p-1.5 rounded-lg text-[#98A2B3] hover:text-white transition-colors cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3 p-3.5 rounded-xl bg-[#05070B] border border-white/[0.06]">
                <div>
                  <span className="text-[#667085] block text-[10px] uppercase font-mono">Amount</span>
                  <span className="text-lg font-bold font-mono text-[#00CFFF]">${selectedItem.amount.toFixed(2)} USD</span>
                </div>
                <div>
                  <span className="text-[#667085] block text-[10px] uppercase font-mono">Status</span>
                  <div className="mt-1">{getStatusBadge(selectedItem.status)}</div>
                </div>
              </div>

              <div className="space-y-2 p-3.5 rounded-xl bg-[#05070B] border border-white/[0.06] font-mono text-[11px]">
                <div className="flex justify-between">
                  <span className="text-[#667085]">Channel:</span>
                  <span className="text-white">{formatDestinationLabel(selectedItem.destinationType)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#667085]">Destination:</span>
                  <span className="text-white truncate max-w-[200px]">{selectedItem.destinationReference}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#667085]">Requested:</span>
                  <span className="text-white">{new Date(selectedItem.requestedAt).toLocaleString()}</span>
                </div>
                {selectedItem.approvedAt && (
                  <div className="flex justify-between text-[#32D583]">
                    <span>Approved:</span>
                    <span>{new Date(selectedItem.approvedAt).toLocaleString()}</span>
                  </div>
                )}
                {selectedItem.completedAt && (
                  <div className="flex justify-between text-[#32D583]">
                    <span>Completed:</span>
                    <span>{new Date(selectedItem.completedAt).toLocaleString()}</span>
                  </div>
                )}
                {selectedItem.rejectionReason && (
                  <div className="p-2 rounded bg-[#F04438]/10 text-[#F04438] text-[11px] mt-2">
                    <strong>Rejection:</strong> {selectedItem.rejectionReason}
                  </div>
                )}
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setSelectedItem(null)}
                className="px-5 py-2.5 rounded-xl bg-[#00CFFF] hover:bg-[#00CFFF]/90 text-[#05070B] font-bold text-xs transition-colors cursor-pointer min-h-[44px]"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          5. WITHDRAWAL OTP AUTHORIZATION MODAL
         ======================================================== */}
      {isOtpModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div
            className="fixed inset-0"
            onClick={() => { if (!isConfirmingWithdrawal) setIsOtpModalOpen(false); }}
            aria-hidden="true"
          />

          <div className="relative w-full max-w-md bg-[#07101D] border border-[#00CFFF]/30 rounded-2xl p-6 shadow-2xl space-y-4 z-10 text-xs">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
              <div className="flex items-center gap-2 text-white font-bold font-mono">
                <KeyRound className="w-4 h-4 text-[#00CFFF]" />
                <span>Authorize Fund Withdrawal</span>
              </div>
              <button
                disabled={isConfirmingWithdrawal}
                onClick={() => setIsOtpModalOpen(false)}
                className="p-1 rounded-md text-[#98A2B3] hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer disabled:opacity-30"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Verification Notice */}
            <div className="p-3.5 rounded-xl bg-[#00CFFF]/10 border border-[#00CFFF]/25 text-xs text-[#00CFFF] space-y-1">
              <div className="flex items-center gap-2 font-bold">
                <Mail className="w-4 h-4 shrink-0" />
                <span>6-Digit Authorization Code Dispatched</span>
              </div>
              <p className="text-[11px] text-[#98A2B3] leading-relaxed">
                A one-time cryptographic authorization code was dispatched to your registered account email.
              </p>
            </div>

            {/* Withdrawal Summary Box */}
            <div className="p-3.5 rounded-xl bg-[#05070B] border border-white/[0.06] space-y-2 text-[11px] font-mono">
              <div className="flex justify-between items-center">
                <span className="text-[#667085]">Withdrawal Amount:</span>
                <span className="text-[#00CFFF] font-bold text-sm">
                  ${parseFloat(amountInput || '0').toFixed(2)} USD
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[#667085]">Channel / Network:</span>
                <span className="text-white">{formatDestinationLabel(destinationType)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[#667085]">Destination Wallet:</span>
                <span className="text-[#98A2B3] truncate max-w-[200px]" title={destinationRef}>
                  {destinationRef}
                </span>
              </div>
              <div className="flex justify-between items-center text-[10px] text-amber-400 pt-1 border-t border-white/[0.04]">
                <span>Code Validity:</span>
                <span>10 Minutes</span>
              </div>
            </div>

            {otpModalError && (
              <div className="p-3 rounded-lg bg-[#F04438]/10 border border-[#F04438]/30 text-xs text-[#F04438] flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{otpModalError}</span>
              </div>
            )}

            <form onSubmit={handleConfirmWithdrawal} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-white mb-1.5">
                  Enter 6-Digit Verification Code
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  maxLength={6}
                  placeholder="123456"
                  value={withdrawalOtp}
                  onChange={(e) => setWithdrawalOtp(e.target.value.replace(/[^0-9]/g, ''))}
                  className="w-full bg-[#05070B] border border-white/[0.1] focus:border-[#00CFFF] rounded-xl px-4 py-3 text-center text-xl font-mono tracking-[0.4em] text-[#00CFFF] placeholder:text-white/20 focus:outline-none min-h-[48px]"
                />
              </div>

              <div className="flex items-center justify-between text-[11px] text-[#98A2B3] pt-1">
                <span>Didn't receive the code?</span>
                <button
                  type="button"
                  disabled={isRequestingOtp || otpResendCountdown > 0}
                  onClick={handleResendOtp}
                  className="text-[#00CFFF] hover:underline disabled:opacity-40 disabled:hover:no-underline font-medium cursor-pointer"
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
                  className="flex-1 py-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-[#98A2B3] font-medium text-xs cursor-pointer min-h-[44px] disabled:opacity-40"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isConfirmingWithdrawal || withdrawalOtp.trim().length !== 6}
                  className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-[#00CFFF] to-[#168BFF] text-[#05070B] font-bold text-xs hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-1.5 min-h-[44px]"
                >
                  {isConfirmingWithdrawal ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Authorizing...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Confirm Withdrawal</span>
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
