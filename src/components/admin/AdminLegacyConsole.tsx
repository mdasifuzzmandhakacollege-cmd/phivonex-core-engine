import React, { useState, useEffect } from 'react';
import { PhxGlassCard } from '../ui/phivonex';
import { ShieldCheck, ShieldAlert, Loader2, CheckCircle2, AlertCircle, ArrowRight } from 'lucide-react';

export const AdminLegacyConsole: React.FC = () => {
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [adjustmentType, setAdjustmentType] = useState<'CREDIT_USDT' | 'DEBIT_USDT' | 'CREDIT_PHIVO'>('CREDIT_USDT');
  const [amount, setAmount] = useState('100');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchMembers = async () => {
    try {
      const res = await fetch('/api/legacy/admin/members', { credentials: 'include' });
      const data = await res.json();
      if (data.success || data.members) {
        setMembers(data.members || data);
      }
    } catch (err) {
      console.warn('Failed to load members for legacy adjustment:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMembers();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setSubmitting(true);

    try {
      const res = await fetch('/api/legacy/admin/adjust', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          targetUserId: selectedUserId,
          adjustmentType,
          amount: parseFloat(amount),
          note,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMsg(`Successfully applied ${adjustmentType} of ${amount} to user! Txn ID: ${data.txnId}`);
        setAmount('100');
        setNote('');
      } else {
        setErrorMsg(data.message || 'Adjustment failed.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Network error during adjustment.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Hero Header */}
      <div className="rounded-[28px] bg-gradient-to-r from-[#1A0A0A] via-[#0D0505] to-[#050807] border border-[#F04438]/30 p-6 sm:p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute right-0 top-0 w-96 h-96 bg-[#F04438]/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div className="space-y-3 max-w-xl">
            <span className="px-3 py-1 rounded-full text-xs font-mono font-bold tracking-wider uppercase bg-[#F04438]/20 text-[#F04438] border border-[#F04438]/40">
              ADMINISTRATIVE CONTROL PLANE
            </span>

            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              ADMIN LEGACY ADJUSTMENT CONSOLE
            </h1>

            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Apply audited manual legacy balance credits and adjustments inside an ACID transaction with full security audit logging.
            </p>
          </div>
        </div>
      </div>

      <PhxGlassCard>
        <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-[#F04438]" />
          <span>Apply Audited Manual Legacy Adjustment</span>
        </h3>

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

        {loading ? (
          <div className="py-12 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-[#F04438]" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-mono text-slate-400 uppercase mb-2 block">Target Member</label>
                <select
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  className="w-full py-3 px-4 rounded-xl bg-[#050807] border border-white/10 text-white font-mono text-xs focus:outline-none focus:border-[#F04438]"
                  required
                >
                  <option value="">Select Member...</option>
                  {members.map((m: any) => (
                    <option key={m.id} value={m.id}>
                      {m.display_name || m.email} ({m.public_id})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-mono text-slate-400 uppercase mb-2 block">Adjustment Type</label>
                <select
                  value={adjustmentType}
                  onChange={(e) => setAdjustmentType(e.target.value as any)}
                  className="w-full py-3 px-4 rounded-xl bg-[#050807] border border-white/10 text-white font-mono text-xs focus:outline-none focus:border-[#F04438]"
                >
                  <option value="CREDIT_USDT">Credit USDT</option>
                  <option value="DEBIT_USDT">Debit USDT</option>
                  <option value="CREDIT_PHIVO">Credit PHIVO</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-mono text-slate-400 uppercase mb-2 block">Amount</label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full py-3 px-4 rounded-xl bg-[#050807] border border-white/10 text-white font-mono text-xs focus:outline-none focus:border-[#F04438]"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-mono text-slate-400 uppercase mb-2 block">Audited Reason Note</label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. Historical Binary Settlement Adjustment"
                  className="w-full py-3 px-4 rounded-xl bg-[#050807] border border-white/10 text-white font-mono text-xs focus:outline-none focus:border-[#F04438]"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting || !selectedUserId}
              className="py-3 px-6 rounded-xl bg-[#F04438] hover:bg-rose-600 text-white font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-lg shadow-[#F04438]/20 cursor-pointer disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Applying Adjustment...</span>
                </>
              ) : (
                <>
                  <span>Execute Audited Legacy Adjustment</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        )}
      </PhxGlassCard>
    </div>
  );
};
