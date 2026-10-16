import React, { useState } from 'react';
import { ArrowRightLeft, ShieldCheck, Zap, Loader2, CheckCircle2, AlertCircle, Coins, ArrowRight, Wallet, Server, Lock } from 'lucide-react';

interface EcosystemWalletTransferCardProps {
  availableBalance: number;
  mainWalletBalance?: number;
  nodeVaultBalance?: number;
  onTransferSuccess?: () => void;
}

export const EcosystemWalletTransferCard: React.FC<EcosystemWalletTransferCardProps> = ({
  availableBalance,
  mainWalletBalance,
  nodeVaultBalance,
  onTransferSuccess,
}) => {
  const effectiveMainBalance = mainWalletBalance !== undefined ? mainWalletBalance : availableBalance;
  const effectiveNodeBalance = nodeVaultBalance !== undefined ? nodeVaultBalance : 0;
  const [fromVault, setFromVault] = useState<'MAIN_WALLET' | 'NODE_VAULT'>('MAIN_WALLET');
  const [toVault, setToVault] = useState<'MAIN_WALLET' | 'NODE_VAULT'>('NODE_VAULT');
  const [amount, setAmount] = useState<number | ''>(1000);
  const [loading, setLoading] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const handleSwapVaults = () => {
    setFromVault((prev) => (prev === 'MAIN_WALLET' ? 'NODE_VAULT' : 'MAIN_WALLET'));
    setToVault((prev) => (prev === 'NODE_VAULT' ? 'MAIN_WALLET' : 'NODE_VAULT'));
  };

  const handleExecuteTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = Number(amount);
    if (!numAmount || numAmount <= 0) {
      setFeedback({ type: 'error', message: 'Please enter a valid transfer amount.' });
      return;
    }
    if (fromVault === 'MAIN_WALLET' && numAmount > availableBalance) {
      setFeedback({
        type: 'error',
        message: `Insufficient balance. Available: $${availableBalance.toFixed(2)} USDT, Requested: $${numAmount.toFixed(2)} USDT.`,
      });
      return;
    }

    setLoading(true);
    setFeedback(null);

    try {
      const res = await fetch('/api/wallet/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          fromVault,
          toVault,
          amount: numAmount,
          currency: 'USDT',
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Internal wallet transfer failed.');
      }

      setFeedback({
        type: 'success',
        message: data.message || `Successfully transferred $${numAmount.toFixed(2)} USDT to ${toVault === 'NODE_VAULT' ? 'Node Purchase Vault' : 'Main Wallet'}!`,
      });

      if (onTransferSuccess) {
        onTransferSuccess();
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err?.message || 'Transfer failed. Please try again.',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 rounded-2xl border border-[#00CFFF]/30 bg-gradient-to-br from-[#07101D] via-[#08182B] to-[#05070B] shadow-2xl space-y-6 text-left">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.08] pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-[#00CFFF]/10 border border-[#00CFFF]/30 text-[#00CFFF]">
            <ArrowRightLeft className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-white">Ecosystem Wallet Transfer</h3>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">
                0% Fee Instant
              </span>
            </div>
            <p className="text-xs text-[#98A2B3] mt-0.5">
              Move balances instantly between internal ecosystem vaults to manage Node purchases & earnings.
            </p>
          </div>
        </div>

        <div className="text-right">
          <span className="text-[10px] uppercase font-mono text-[#98A2B3] block">Node Purchase Vault Balance</span>
          <span className="text-lg font-bold font-mono text-[#00CFFF] tabular-nums">
            ${effectiveNodeBalance.toFixed(2)} USDT
          </span>
        </div>
      </div>

      {/* Transfer Direction Selector */}
      <form onSubmit={handleExecuteTransfer} className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-center">
          
          {/* Source Vault */}
          <div className="md:col-span-2 p-3.5 rounded-xl bg-[#05070B] border border-white/[0.08] space-y-1">
            <span className="text-[10px] uppercase font-mono text-[#98A2B3]">Source Vault (From)</span>
            <div className="flex items-center gap-2 text-xs font-bold text-white">
              {fromVault === 'MAIN_WALLET' ? (
                <>
                  <Wallet className="w-4 h-4 text-emerald-400" />
                  <span>Main Earnings Wallet</span>
                </>
              ) : (
                <>
                  <Server className="w-4 h-4 text-[#00CFFF]" />
                  <span>Node Purchase Vault</span>
                </>
              )}
            </div>
            <p className="text-[10px] font-mono text-emerald-400/90">
              Available: ${fromVault === 'MAIN_WALLET' ? effectiveMainBalance.toFixed(2) : effectiveNodeBalance.toFixed(2)} USDT
            </p>
          </div>

          {/* Direction Swap Button */}
          <div className="flex justify-center">
            <button
              type="button"
              onClick={handleSwapVaults}
              className="p-3 rounded-xl bg-[#00CFFF]/10 hover:bg-[#00CFFF]/20 border border-[#00CFFF]/30 text-[#00CFFF] transition-all cursor-pointer shadow-md hover:scale-105"
              title="Switch transfer direction"
            >
              <ArrowRightLeft className="w-4 h-4" />
            </button>
          </div>

          {/* Destination Vault */}
          <div className="md:col-span-2 p-3.5 rounded-xl bg-[#05070B] border border-[#00CFFF]/25 space-y-1">
            <span className="text-[10px] uppercase font-mono text-[#00CFFF]">Target Vault (To)</span>
            <div className="flex items-center gap-2 text-xs font-bold text-white">
              {toVault === 'NODE_VAULT' ? (
                <>
                  <Server className="w-4 h-4 text-[#00CFFF]" />
                  <span>Node Purchase Vault</span>
                </>
              ) : (
                <>
                  <Wallet className="w-4 h-4 text-emerald-400" />
                  <span>Main Earnings Wallet</span>
                </>
              )}
            </div>
            <p className="text-[10px] font-mono text-[#00CFFF]/90">
              Current Vault Balance: ${toVault === 'NODE_VAULT' ? effectiveNodeBalance.toFixed(2) : effectiveMainBalance.toFixed(2)} USDT
            </p>
          </div>
        </div>

        {/* Amount Input & Presets */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <label className="font-semibold text-[#98A2B3]">Transfer Amount (USDT)</label>
            <span className="text-[11px] font-mono text-emerald-400">
              Zero Internal Gas / Protocol Fee
            </span>
          </div>

          <div className="relative">
            <input
              type="number"
              min="1"
              max="100000"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
              className="w-full py-3.5 px-4 rounded-xl bg-[#05070B] border border-white/[0.12] focus:border-[#00CFFF] text-white font-mono text-base focus:outline-none transition-colors"
              placeholder="1000"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
              {[100, 500, 1000].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setAmount(preset)}
                  className="px-2 py-1 rounded bg-white/[0.05] hover:bg-[#00CFFF]/20 border border-white/[0.08] hover:border-[#00CFFF]/40 text-[#00CFFF] text-[10px] font-mono font-bold transition-all cursor-pointer"
                >
                  ${preset}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setAmount(availableBalance)}
                className="px-2 py-1 rounded bg-[#00CFFF]/20 border border-[#00CFFF]/40 text-[#00CFFF] text-[10px] font-mono font-bold hover:bg-[#00CFFF]/30 transition-all cursor-pointer"
              >
                MAX
              </button>
            </div>
          </div>
        </div>

        {/* Feedback Message */}
        {feedback && (
          <div
            className={`p-3.5 rounded-xl text-xs flex items-center gap-2.5 ${
              feedback.type === 'success'
                ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
                : 'bg-rose-500/10 border border-rose-500/30 text-rose-300'
            }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={loading || !amount || Number(amount) <= 0}
          className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-[#00CFFF] via-[#00A3FF] to-emerald-400 hover:brightness-110 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg shadow-[#00CFFF]/20 disabled:opacity-50 min-h-[48px]"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
              <span>Processing Internal Transfer...</span>
            </>
          ) : (
            <>
              <Zap className="w-4 h-4 fill-slate-950 text-slate-950" />
              <span>
                Execute Instant Transfer (${Number(amount || 0).toFixed(2)} USDT)
              </span>
            </>
          )}
        </button>
      </form>
    </div>
  );
};
