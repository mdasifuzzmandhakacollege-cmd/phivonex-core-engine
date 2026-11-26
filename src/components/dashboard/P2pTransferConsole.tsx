import React, { useState, useEffect, useCallback } from 'react';
import {
  Send,
  Search,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ShieldCheck,
  ArrowUpRight,
  ArrowDownLeft,
  Coins,
  DollarSign,
  Lock,
  Mail,
  RefreshCw,
} from 'lucide-react';
import { UserProfile } from '../../context/AuthContext';

interface P2pTransferConsoleProps {
  user: UserProfile | null;
}

interface VerifiedRecipient {
  recipientId: string;
  userCode: string;
  maskedEmail: string;
  displayName: string;
}

interface P2pHistoryItem {
  id: string;
  transferRef: string;
  direction: 'SENT' | 'RECEIVED';
  assetType: 'USDT' | 'PHIVO';
  grossAmount: string;
  feeAmount: string;
  netAmount: string;
  note: string | null;
  counterpartyCode: string;
  counterpartyName: string;
  counterpartyMaskedEmail: string;
  createdAt: string;
}

function generateIdempotencyUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `p2p-${crypto.randomUUID()}`;
  }
  return `p2p-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export const P2pTransferConsole: React.FC<P2pTransferConsoleProps> = ({ user }) => {
  const [assetType, setAssetType] = useState<'USDT' | 'PHIVO'>('USDT');
  const [recipientQuery, setRecipientQuery] = useState('');
  const [verifiedRecipient, setVerifiedRecipient] = useState<VerifiedRecipient | null>(null);
  const [verifyingRecipient, setVerifyingRecipient] = useState(false);

  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpHint, setOtpHint] = useState<string | null>(null);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pendingIdempotencyKey, setPendingIdempotencyKey] = useState<string>(() => generateIdempotencyUuid());

  const [mainUsdtAvailable, setMainUsdtAvailable] = useState<number>(0);
  const [claimedPhivoAvailable, setClaimedPhivoAvailable] = useState<number>(0);
  const [unclaimedAccruedPhivo, setUnclaimedAccruedPhivo] = useState<number>(0);
  const [p2pEnabled, setP2pEnabled] = useState<boolean>(true);
  const [p2pFeePct, setP2pFeePct] = useState<number>(0);

  const [history, setHistory] = useState<P2pHistoryItem[]>([]);
  const [loadingData, setLoadingData] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fetchP2pTelemetry = useCallback(async () => {
    try {
      const [walletRes, configRes, historyRes] = await Promise.all([
        fetch('/api/wallet/me', { credentials: 'include' }),
        fetch('/api/public/ecosystem-config', { credentials: 'include' }),
        fetch('/api/wallet/transfer/history?limit=15', { credentials: 'include' }),
      ]);

      if (walletRes.ok) {
        const w = await walletRes.json();
        setMainUsdtAvailable(Number(w.mainWalletBalance ?? w.availableBalance ?? 0));
        setClaimedPhivoAvailable(Number(w.claimedPhivoBalance ?? 0));
        setUnclaimedAccruedPhivo(Number(w.unclaimedAccruedPhivo ?? 0));
      }

      if (configRes.ok) {
        const c = await configRes.json();
        if (c.featureSwitches && typeof c.featureSwitches.p2p_internal_transfers_enabled === 'boolean') {
          setP2pEnabled(c.featureSwitches.p2p_internal_transfers_enabled);
        }
        if (c.p2pTransferFeePct !== undefined) {
          setP2pFeePct(Number(c.p2pTransferFeePct) || 0);
        }
      }

      if (historyRes.ok) {
        const h = await historyRes.json();
        if (Array.isArray(h.transfers)) {
          setHistory(h.transfers);
        }
      }
    } catch {
      // Non-fatal UI refresh error
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => {
    fetchP2pTelemetry();
    const handleSync = () => {
      fetchP2pTelemetry();
    };
    window.addEventListener('phivonex:balance-or-tx-updated', handleSync);
    return () => window.removeEventListener('phivonex:balance-or-tx-updated', handleSync);
  }, [fetchP2pTelemetry]);

  const activeAvailableBalance = assetType === 'USDT' ? mainUsdtAvailable : claimedPhivoAvailable;
  const numericAmount = Number(amount) || 0;
  const estimatedFee = numericAmount > 0 ? (numericAmount * p2pFeePct) / 100 : 0;
  const estimatedNet = Math.max(0, numericAmount - estimatedFee);

  const handleVerifyRecipient = async () => {
    const q = recipientQuery.trim();
    if (!q) {
      setErrorMsg('Enter a recipient email address or User Code (e.g., PHX-XXXXXX).');
      return;
    }
    setErrorMsg(null);
    setSuccessMsg(null);
    setVerifyingRecipient(true);
    setVerifiedRecipient(null);
    setOtpSent(false);
    setOtpCode('');

    try {
      const res = await fetch(`/api/wallet/transfer/recipient?query=${encodeURIComponent(q)}`, {
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Recipient could not be verified.');
      }
      setVerifiedRecipient(data.recipient);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to verify recipient.');
    } finally {
      setVerifyingRecipient(false);
    }
  };

  const handleRequestOtp = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!verifiedRecipient) {
      setErrorMsg('Verify the recipient account before requesting a verification code.');
      return;
    }
    if (numericAmount < 1) {
      setErrorMsg(`Minimum transfer amount is 1.00 ${assetType}.`);
      return;
    }
    if (numericAmount > activeAvailableBalance) {
      setErrorMsg(
        assetType === 'USDT'
          ? `Insufficient Main USDT balance. Available: $${mainUsdtAvailable.toFixed(2)} USDT.`
          : `Insufficient transferable PHIVO balance. Available: ${claimedPhivoAvailable.toFixed(4)} PHIVO.`
      );
      return;
    }

    setSendingOtp(true);
    try {
      const res = await fetch('/api/wallet/transfer/otp', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientQuery: verifiedRecipient.userCode,
          assetType,
          amount: numericAmount.toFixed(8),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to send verification code.');
      }
      setOtpSent(true);
      setOtpHint(data.message || 'A 6-digit verification code has been dispatched to your email.');
      setPendingIdempotencyKey(generateIdempotencyUuid());
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to request email verification code.');
    } finally {
      setSendingOtp(false);
    }
  };

  const handleConfirmTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!verifiedRecipient) {
      setErrorMsg('Please verify the recipient first.');
      return;
    }
    if (!/^\d{6}$/.test(otpCode.trim())) {
      setErrorMsg('Enter the 6-digit verification code sent to your email.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/wallet/transfer/send', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': pendingIdempotencyKey,
        },
        body: JSON.stringify({
          recipientId: verifiedRecipient.recipientId,
          recipientQuery: verifiedRecipient.userCode,
          assetType,
          amount: numericAmount.toFixed(8),
          note: note.trim() || null,
          otpCode: otpCode.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Transfer could not be completed.');
      }

      const tr = data.transfer;
      setSuccessMsg(
        `Transfer ${tr.transferRef} settled! ${Number(tr.netAmount).toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 4,
        })} ${tr.assetType} credited instantly to ${tr.recipient.displayName} (${tr.recipient.userCode}).`
      );
      setAmount('');
      setNote('');
      setOtpCode('');
      setOtpSent(false);
      setOtpHint(null);
      setVerifiedRecipient(null);
      setRecipientQuery('');
      setPendingIdempotencyKey(generateIdempotencyUuid());

      await fetchP2pTelemetry();
      window.dispatchEvent(new Event('phivonex:balance-or-tx-updated'));
    } catch (err: any) {
      setErrorMsg(err?.message || 'Transfer failed. Please check your details and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section
      id="p2p-transfer-console"
      aria-label="User-to-User P2P Balance Transfer"
      className="w-full max-w-full min-w-0 rounded-[28px] oneui-glass-card p-5 sm:p-6 space-y-6 border border-[#F5B800]/20"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-white/[0.08]">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-11 h-11 rounded-2xl bg-[#F5B800]/12 border border-[#F5B800]/30 flex items-center justify-center text-[#F5B800] shrink-0">
            <Send className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base sm:text-lg font-extrabold text-white tracking-tight">
                Instant Member-to-Member (P2P) Transfer
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-[#00E5FF]/12 text-[#00E5FF] border border-[#00E5FF]/30">
                {p2pFeePct === 0 ? '0% Fee' : `${p2pFeePct.toFixed(2)}% Fee`}
              </span>
            </div>
            <p className="text-xs text-[#98A2B3] mt-1">
              Transfer USDT Dollars or claimed PHIVO Coins instantly to any PHIVONEX member by Email or User Code (PHX-XXXXXX).
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => fetchP2pTelemetry()}
          className="self-start sm:self-center inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.09] border border-white/[0.08] text-xs font-semibold text-slate-300 transition-colors cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loadingData ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {!p2pEnabled && (
        <div className="p-4 rounded-2xl bg-[#F04438]/12 border border-[#F04438]/35 flex items-start gap-3 text-xs text-rose-200">
          <Lock className="w-4 h-4 text-[#F04438] shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-white">P2P Internal Transfers Paused</p>
            <p className="mt-0.5 text-rose-200/85">
              User-to-User balance transfers are temporarily paused by protocol governance. Your funds remain safe and fully accessible.
            </p>
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="p-3.5 rounded-2xl bg-[#F04438]/12 border border-[#F04438]/35 flex items-start gap-2.5 text-xs text-rose-200">
          <AlertCircle className="w-4 h-4 text-[#F04438] shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-3.5 rounded-2xl bg-[#00E676]/12 border border-[#00E676]/35 flex items-start gap-2.5 text-xs text-emerald-200">
          <CheckCircle2 className="w-4 h-4 text-[#00E676] shrink-0 mt-0.5" />
          <span>{successMsg}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-w-0">
        {/* Left: Transfer Composer */}
        <form onSubmit={handleConfirmTransfer} className="lg:col-span-7 space-y-4 min-w-0">
          {/* Asset Toggle */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-mono uppercase tracking-wider text-[#98A2B3] block">
              1. Select Transfer Asset
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setAssetType('USDT');
                  setOtpSent(false);
                  setOtpCode('');
                  setErrorMsg(null);
                }}
                className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                  assetType === 'USDT'
                    ? 'bg-[#00E676]/12 border-[#00E676]/50 shadow-[0_0_24px_rgba(0,230,118,0.12)]'
                    : 'bg-[#050807]/60 border-white/[0.08] hover:border-white/20'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-white flex items-center gap-1.5">
                    <DollarSign className="w-4 h-4 text-[#00E676]" />
                    USDT Dollar
                  </span>
                  <span className="text-[10px] font-mono text-[#00E676]">Main Wallet</span>
                </div>
                <div className="mt-1.5 font-mono text-sm sm:text-base font-bold text-white tabular-nums truncate">
                  ${mainUsdtAvailable.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setAssetType('PHIVO');
                  setOtpSent(false);
                  setOtpCode('');
                  setErrorMsg(null);
                }}
                className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                  assetType === 'PHIVO'
                    ? 'bg-[#F5B800]/12 border-[#F5B800]/50 shadow-[0_0_24px_rgba(245,184,0,0.12)]'
                    : 'bg-[#050807]/60 border-white/[0.08] hover:border-white/20'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-white flex items-center gap-1.5">
                    <Coins className="w-4 h-4 text-[#F5B800]" />
                    PHIVO Coin
                  </span>
                  <span className="text-[10px] font-mono text-[#F5B800]">Claimed</span>
                </div>
                <div className="mt-1.5 font-mono text-sm sm:text-base font-bold text-white tabular-nums truncate">
                  {claimedPhivoAvailable.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                </div>
              </button>
            </div>
            {assetType === 'PHIVO' && unclaimedAccruedPhivo > 0 && (
              <p className="text-[11px] font-mono text-[#00E5FF] mt-1">
                Note: You also have {unclaimedAccruedPhivo.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} PHIVO accrued in your Node Reward Wallet — claim rewards first to transfer them.
              </p>
            )}
          </div>

          {/* Recipient Lookup */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-mono uppercase tracking-wider text-[#98A2B3] block">
              2. Recipient Email or User Code (PHX-XXXXXX)
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={recipientQuery}
                onChange={(e) => {
                  setRecipientQuery(e.target.value);
                  setVerifiedRecipient(null);
                  setOtpSent(false);
                }}
                placeholder="member@domain.com or PHX-849201"
                disabled={!p2pEnabled || submitting}
                className="flex-1 min-w-0 px-3.5 py-2.5 rounded-xl bg-[#050807] border border-white/[0.12] text-white text-sm placeholder:text-slate-500 focus:border-[#00E5FF] focus:outline-none"
              />
              <button
                type="button"
                onClick={handleVerifyRecipient}
                disabled={!p2pEnabled || verifyingRecipient || !recipientQuery.trim()}
                className="px-4 py-2.5 rounded-xl bg-[#00E5FF]/15 hover:bg-[#00E5FF]/25 border border-[#00E5FF]/40 text-[#00E5FF] text-xs font-extrabold uppercase tracking-wider inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 shrink-0"
              >
                {verifyingRecipient ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Search className="w-4 h-4" />
                )}
                <span>Verify Recipient</span>
              </button>
            </div>

            {verifiedRecipient && (
              <div className="p-3 rounded-xl bg-[#00E676]/10 border border-[#00E676]/30 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <ShieldCheck className="w-4 h-4 text-[#00E676] shrink-0" />
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white truncate">
                      {verifiedRecipient.displayName}
                    </div>
                    <div className="text-[11px] font-mono text-[#98A2B3] truncate">
                      {verifiedRecipient.userCode} • {verifiedRecipient.maskedEmail}
                    </div>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded-md bg-[#00E676]/20 text-[#00E676] text-[10px] font-mono font-bold uppercase shrink-0">
                  Verified
                </span>
              </div>
            )}
          </div>

          {/* Amount & Memo */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-mono uppercase tracking-wider text-[#98A2B3]">
                  3. Amount ({assetType})
                </label>
                <button
                  type="button"
                  onClick={() => {
                    if (activeAvailableBalance > 0) {
                      setAmount(activeAvailableBalance.toFixed(assetType === 'USDT' ? 2 : 4));
                    }
                  }}
                  className="text-[10px] font-mono font-bold text-[#F5B800] hover:underline cursor-pointer"
                >
                  MAX
                </button>
              </div>
              <input
                type="number"
                step="any"
                min="1"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  setOtpSent(false);
                }}
                placeholder="Min 1.00"
                disabled={!p2pEnabled || submitting}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#050807] border border-white/[0.12] text-white font-mono text-sm tabular-nums placeholder:text-slate-500 focus:border-[#F5B800] focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-mono uppercase tracking-wider text-[#98A2B3] block">
                Memo / Note (Optional)
              </label>
              <input
                type="text"
                maxLength={160}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g., Partner settlement"
                disabled={!p2pEnabled || submitting}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#050807] border border-white/[0.12] text-white text-sm placeholder:text-slate-500 focus:border-[#F5B800] focus:outline-none"
              />
            </div>
          </div>

          {/* Live Fee & Net Preview */}
          {numericAmount > 0 && (
            <div className="p-3.5 rounded-xl bg-[#050807]/80 border border-white/[0.08] space-y-1.5 text-xs font-mono">
              <div className="flex justify-between text-[#98A2B3]">
                <span>Gross Debit</span>
                <span className="text-white tabular-nums">
                  {numericAmount.toFixed(4)} {assetType}
                </span>
              </div>
              <div className="flex justify-between text-[#98A2B3]">
                <span>Settlement Fee ({p2pFeePct.toFixed(2)}%)</span>
                <span className="text-[#F5B800] tabular-nums">
                  {estimatedFee.toFixed(4)} {assetType}
                </span>
              </div>
              <div className="flex justify-between pt-1.5 border-t border-white/[0.06] font-bold">
                <span className="text-white">Recipient Net Credit</span>
                <span className="text-[#00E676] tabular-nums">
                  {estimatedNet.toFixed(4)} {assetType}
                </span>
              </div>
            </div>
          )}

          {/* Step 4: Email OTP Authorization */}
          <div className="space-y-3 pt-1">
            {!otpSent ? (
              <button
                type="button"
                onClick={handleRequestOtp}
                disabled={!p2pEnabled || !verifiedRecipient || numericAmount < 1 || sendingOtp}
                className="w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-[#F5B800] to-[#ffcf33] hover:brightness-105 text-[#050807] font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-45"
              >
                {sendingOtp ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Mail className="w-4 h-4" />
                )}
                <span>Request 6-Digit Email Authorization Code</span>
              </button>
            ) : (
              <div className="p-4 rounded-2xl bg-[#00E5FF]/[0.06] border border-[#00E5FF]/30 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-[#00E5FF] flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4" />
                    Email Security Verification Required
                  </span>
                  <button
                    type="button"
                    onClick={handleRequestOtp}
                    disabled={sendingOtp}
                    className="text-[11px] font-mono text-[#F5B800] hover:underline cursor-pointer"
                  >
                    Resend Code
                  </button>
                </div>
                {otpHint && <p className="text-[11px] text-slate-300">{otpHint}</p>}
                <div className="flex flex-col sm:flex-row gap-2.5">
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="Enter 6-digit code"
                    className="sm:w-44 px-3.5 py-2.5 rounded-xl bg-[#050807] border border-[#00E5FF]/40 text-center font-mono text-base font-extrabold tracking-[0.25em] text-[#00E5FF] focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={submitting || otpCode.length !== 6}
                    className="flex-1 py-2.5 px-4 rounded-xl bg-[#00E676] hover:bg-[#00cf6a] text-[#050807] font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {submitting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                    <span>Confirm Instant Transfer</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </form>

        {/* Right: Recent P2P History */}
        <div className="lg:col-span-5 flex flex-col min-w-0 rounded-2xl bg-[#050807]/65 border border-white/[0.08] p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-mono uppercase tracking-wider text-[#98A2B3] font-bold">
              Recent P2P Transfers
            </h3>
            <span className="text-[10px] font-mono text-slate-500">
              {user?.publicId || 'Member Ledger'}
            </span>
          </div>

          {history.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-8 px-4 space-y-2">
              <div className="w-10 h-10 rounded-full bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-slate-500">
                <Send className="w-4 h-4" />
              </div>
              <p className="text-xs font-semibold text-slate-300">No P2P Transfers Yet</p>
              <p className="text-[11px] text-[#98A2B3] max-w-[230px]">
                Sent and received member transfers in USDT or PHIVO will appear here immediately after settlement.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
              {history.map((item) => {
                const isSent = item.direction === 'SENT';
                return (
                  <div
                    key={item.id}
                    className="p-3 rounded-xl bg-white/[0.025] border border-white/[0.06] flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                          isSent
                            ? 'bg-[#F5B800]/12 text-[#F5B800] border border-[#F5B800]/25'
                            : 'bg-[#00E676]/12 text-[#00E676] border border-[#00E676]/25'
                        }`}
                      >
                        {isSent ? (
                          <ArrowUpRight className="w-4 h-4" />
                        ) : (
                          <ArrowDownLeft className="w-4 h-4" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-white truncate">
                          {isSent ? 'To' : 'From'} {item.counterpartyName}
                        </div>
                        <div className="text-[10px] font-mono text-[#98A2B3] truncate">
                          {item.counterpartyCode} • {item.transferRef}
                        </div>
                        {item.note && (
                          <div className="text-[10px] text-slate-400 truncate mt-0.5">
                            &ldquo;{item.note}&rdquo;
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div
                        className={`font-mono text-xs font-extrabold tabular-nums ${
                          isSent ? 'text-[#F5B800]' : 'text-[#00E676]'
                        }`}
                      >
                        {isSent ? '-' : '+'}
                        {Number(isSent ? item.grossAmount : item.netAmount).toLocaleString('en-US', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 4,
                        })}{' '}
                        {item.assetType}
                      </div>
                      <div className="text-[10px] font-mono text-slate-500">
                        {new Date(item.createdAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
