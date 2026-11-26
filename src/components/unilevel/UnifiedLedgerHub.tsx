import React, { useState, useEffect } from 'react';
import { PhxGlassCard, TabularCounter } from '../ui/phivonex';
import { Wallet, Repeat, ShieldCheck, CheckCircle2, AlertCircle, Loader2, ArrowRight } from 'lucide-react';

interface UnifiedLedgerHubProps {
  user: any;
  onNavigateTab: (tab: string) => void;
}

export const UnifiedLedgerHub: React.FC<UnifiedLedgerHubProps> = ({ user, onNavigateTab }) => {
  const [statementData, setStatementData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [reinvesting, setReinvesting] = useState(false);
  const [targetProduct, setTargetProduct] = useState<'TRADING_POOL' | 'CHRONO_VAULT' | 'NODE_VAULT'>('TRADING_POOL');
  const [amountInput, setAmountInput] = useState<string>('250');
  const [planCode, setPlanCode] = useState<string>('CHRONO_5Y');
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');

  const fetchStatement = async () => {
    try {
      const res = await fetch('/api/wallet/unified-statement', { credentials: 'include' });
      const data = await res.json();
      if (data.success || data.statement) {
        setStatementData(data.statement || data);
      }
    } catch (err) {
      console.warn('Failed to load unified statement:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatement();
  }, []);

  const handleReinvest = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setReinvesting(true);

    const numericAmount = parseFloat(amountInput) || 0;
    const idempotencyKey = `REINVEST-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    try {
      const res = await fetch('/api/wallet/reinvest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user?.id,
          targetProduct,
          amountUsd: numericAmount,
          planCode: targetProduct === 'CHRONO_VAULT' ? planCode : undefined,
          idempotencyKey,
        }),
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success || data.positionId) {
        setSuccessMsg(`Successfully compounded $${numericAmount.toFixed(2)} into ${targetProduct}!`);
        fetchStatement();
      } else {
        setErrorMsg(data.error || 'Compounding execution failed. Please check your Main USDT Wallet balance.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Network error during compounding execution.');
    } finally {
      setReinvesting(false);
    }
  };

  const reconciliation = statementData?.reconciliation || { isBalanced: true, discrepancyUsd: '0.00000000' };
  const entries = statementData?.entries || [];
  const filteredEntries = categoryFilter === 'ALL'
    ? entries
    : entries.filter((e: any) => e.category === categoryFilter || e.sourceType?.includes(categoryFilter));

  return (
    <div className="space-y-6 animate-fadeIn min-w-0">
      {/* Hero Header & Ledger Verification Status */}
      <div className="oneui-glass-card rounded-[24px] p-5 sm:p-7 flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
        <div className="space-y-2.5 max-w-xl min-w-0">
          <div className="flex items-center gap-2">
            <span className={`px-3 py-1 rounded-full text-[11px] font-mono font-bold tracking-wider uppercase border ${
              reconciliation.isBalanced ? 'bg-[#00E676]/12 text-[#00E676] border-[#00E676]/30' : 'bg-[#FF4D4F]/12 text-[#FF4D4F] border-[#FF4D4F]/30'
            }`}>
              {reconciliation.isBalanced ? 'Zero-Sum Ledger Verified' : 'Discrepancy Detected'}
            </span>
          </div>

          <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
            Unified Double-Entry Ledger &amp; Compounding
          </h2>

          <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
            Reconciled double-entry accounting statement supporting instant internal re-investment into ecosystem products.
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-[#050807]/80 border border-white/[0.08] shrink-0 text-center min-w-[160px]">
          <span className="text-[10px] font-mono text-slate-400 uppercase">Discrepancy</span>
          <div className="text-lg font-bold font-mono text-[#00E676] tabular-nums">
            ${reconciliation.discrepancyUsd || '0.00000000'}
          </div>
        </div>
      </div>

      {/* Internal Compounding Console */}
      <PhxGlassCard accent="cyan">
        <h3 className="text-base sm:text-lg font-bold text-white mb-1.5 flex items-center gap-2">
          <Repeat className="w-5 h-5 text-[#00E5FF]" />
          <span>Internal Compounding &amp; Re-Investment Engine</span>
        </h3>
        <p className="text-xs text-slate-400 mb-6">Instantly compound earnings from your Main USDT Wallet directly into active ecosystem products.</p>

        {errorMsg && (
          <div className="mb-4 p-3 rounded-xl bg-[#F04438]/10 border border-[#F04438]/30 text-xs text-[#F04438] flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="mb-4 p-3 rounded-xl bg-[#32D583]/10 border border-[#32D583]/30 text-xs text-[#32D583] flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        <form onSubmit={handleReinvest} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-mono text-[#98A2B3] uppercase mb-2 block">Target Product</label>
              <select
                value={targetProduct}
                onChange={(e) => setTargetProduct(e.target.value as any)}
                className="w-full py-3 px-4 rounded-xl bg-[#050807] border border-white/10 text-white font-mono text-xs focus:outline-none focus:border-[#00E5FF]"
              >
                <option value="TRADING_POOL">Quantum Alpha Trading Pool ($200+)</option>
                <option value="CHRONO_VAULT">Chrono Vaults Staking ($100+)</option>
                <option value="NODE_VAULT">Genesis Node Purchase Vault</option>
              </select>
            </div>

            {targetProduct === 'CHRONO_VAULT' && (
              <div>
                <label className="text-xs font-mono text-[#98A2B3] uppercase mb-2 block">Vault Plan</label>
                <select
                  value={planCode}
                  onChange={(e) => setPlanCode(e.target.value)}
                  className="w-full py-3 px-4 rounded-xl bg-[#050807] border border-white/10 text-white font-mono text-xs focus:outline-none focus:border-[#00E5FF]"
                >
                  <option value="CHRONO_200D">Chrono Bronze Vault (200 Days)</option>
                  <option value="CHRONO_1Y">Chrono Silver Vault (365 Days)</option>
                  <option value="CHRONO_2Y">Chrono Cyan Vault (730 Days)</option>
                  <option value="CHRONO_5Y">Chrono Gold Vault (1,825 Days)</option>
                  <option value="CHRONO_10Y">Chrono Sovereign Vault (3,650 Days)</option>
                </select>
              </div>
            )}

            <div>
              <label className="text-xs font-mono text-[#98A2B3] uppercase mb-2 block">Amount (USDT)</label>
              <input
                type="number"
                min="100"
                step="1"
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                className="w-full py-3 px-4 rounded-xl bg-[#050807] border border-white/10 text-white font-mono text-xs focus:outline-none focus:border-[#00E5FF]"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={reinvesting}
            className="py-3 px-6 rounded-xl bg-[#00E5FF] hover:bg-[#00cce6] text-[#050807] font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-lg shadow-[#00E5FF]/20 cursor-pointer disabled:opacity-50"
          >
            {reinvesting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Executing Compounding...</span>
              </>
            ) : (
              <>
                <span>Execute Internal Compounding</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      </PhxGlassCard>

      {/* Categorized Ledger Statement */}
      <PhxGlassCard>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Wallet className="w-4 h-4 text-[#00E5FF]" />
            <span>Unified Double-Entry Statement</span>
          </h3>

          <div className="flex items-center gap-2 overflow-x-auto pb-2 sm:pb-0">
            {['ALL', 'PRODUCT_YIELD', 'UNILEVEL_ROYALTY', 'INVESTMENT_DEBIT', 'WITHDRAWAL'].map((cat) => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={`py-1.5 px-3 rounded-xl text-[10px] font-mono font-bold uppercase transition-all cursor-pointer whitespace-nowrap ${
                  categoryFilter === cat
                    ? 'bg-[#00E5FF]/20 text-[#00E5FF] border border-[#00E5FF]/40'
                    : 'bg-white/[0.03] text-[#98A2B3] border border-white/10 hover:text-white'
                }`}
              >
                {cat.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="py-16 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-[#00E5FF]" />
          </div>
        ) : filteredEntries.length === 0 ? (
          <p className="text-xs text-[#98A2B3] text-center py-8">No ledger entries found for this filter.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/10 text-[#98A2B3] font-mono">
                  <th className="pb-3">Timestamp</th>
                  <th className="pb-3">Source Type</th>
                  <th className="pb-3">Description</th>
                  <th className="pb-3">Entry Type</th>
                  <th className="pb-3">Amount</th>
                  <th className="pb-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06] font-mono">
                {filteredEntries.map((e: any, idx: number) => (
                  <tr key={idx} className="hover:bg-white/[0.02]">
                    <td className="py-3 text-[#98A2B3]">{new Date(e.createdAt || e.timestamp).toLocaleString()}</td>
                    <td className="py-3 text-[#00E5FF]">{e.sourceType}</td>
                    <td className="py-3 text-white font-sans">{e.description}</td>
                    <td className="py-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        e.entryType === 'CREDIT' ? 'bg-[#32D583]/15 text-[#32D583]' : 'bg-[#F04438]/15 text-[#F04438]'
                      }`}>
                        {e.entryType}
                      </span>
                    </td>
                    <td className="py-3 font-bold text-white">
                      ${Number(e.amount || 0).toFixed(2)} {e.currency || 'USD'}
                    </td>
                    <td className="py-3">
                      <span className="text-[#32D583]">{e.status || 'SETTLED'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PhxGlassCard>
    </div>
  );
};
