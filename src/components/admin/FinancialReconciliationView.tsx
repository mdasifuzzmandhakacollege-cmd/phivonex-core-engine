import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  RefreshCw,
  Play,
  CheckCircle2,
  XCircle,
  Clock,
  Coins,
  ArrowLeftRight,
  ArrowUpRight,
  FileText,
  DollarSign,
  Filter,
  Inbox
} from 'lucide-react';

interface ReconciliationRunSummary {
  id: string;
  publicRunId: string;
  startedAt: string;
  completedAt: string | null;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED';
  issuesFound: number;
  createdBy: string | null;
  createdByPublicId: string | null;
  phivoIntegrity: 'CLEAN' | 'WARNING' | 'CRITICAL' | 'PENDING';
  usdtIntegrity: 'CLEAN' | 'WARNING' | 'CRITICAL' | 'PENDING';
  ledgerIntegrity: 'CLEAN' | 'WARNING' | 'CRITICAL' | 'PENDING';
  withdrawalIntegrity: 'CLEAN' | 'WARNING' | 'CRITICAL' | 'PENDING';
  swapIntegrity: 'CLEAN' | 'WARNING' | 'CRITICAL' | 'PENDING';
  summary: {
    referralsChecked: number;
    matchingChecked: number;
    promotionsChecked: number;
    miningRewardsChecked: number;
    depositsChecked: number;
    withdrawalsChecked: number;
    swapsChecked: number;
    ledgerEntriesChecked: number;
    phivoDiscrepancies: number;
    usdtDiscrepancies: number;
    ledgerDiscrepancies: number;
    withdrawalDiscrepancies: number;
    swapDiscrepancies: number;
  };
  errorMessage?: string | null;
}

interface ReconciliationIssue {
  id: string;
  runId: string;
  issueType: string;
  sourceType: string;
  sourceReference: string;
  asset: string;
  expectedAmount: number;
  actualAmount: number;
  status: string;
  userId: string | null;
  description: string;
  createdAt: string;
}

export const FinancialReconciliationView: React.FC = () => {
  const [latestRun, setLatestRun] = useState<ReconciliationRunSummary | null>(null);
  const [issues, setIssues] = useState<ReconciliationIssue[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [running, setRunning] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [assetFilter, setAssetFilter] = useState<string>('ALL');

  const fetchReconciliationData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const runRes = await fetch('/api/admin/reconciliation/latest');
      if (runRes.ok) {
        const runData = await runRes.json();
        setLatestRun(runData.run || null);

        if (runData.run) {
          const issuesRes = await fetch(`/api/admin/reconciliation/issues?runId=${runData.run.id}&limit=100`);
          if (issuesRes.ok) {
            const issuesData = await issuesRes.json();
            setIssues(issuesData.issues || []);
          }
        }
      } else {
        throw new Error('Failed to retrieve reconciliation data.');
      }
    } catch (err: any) {
      console.error('[FinancialReconciliation] Error loading data:', err);
      setError('Unable to load reconciliation logs. Ensure admin permissions.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReconciliationData();
  }, [fetchReconciliationData]);

  const handleTriggerRun = async () => {
    if (running) return;
    setRunning(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/reconciliation/run', { method: 'POST' });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'Execution failed');
      }
      const data = await res.json();
      setLatestRun(data.run);

      // Fetch issues for the new run
      const issuesRes = await fetch(`/api/admin/reconciliation/issues?runId=${data.run.id}&limit=100`);
      if (issuesRes.ok) {
        const issuesData = await issuesRes.json();
        setIssues(issuesData.issues || []);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to trigger reconciliation run.');
    } finally {
      setRunning(false);
    }
  };

  const getIntegrityBadge = (status: string) => {
    switch (status) {
      case 'CLEAN':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-semibold bg-[#32D583]/10 text-[#32D583] border border-[#32D583]/30">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>CLEAN</span>
          </span>
        );
      case 'WARNING':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-semibold bg-[#F59E0B]/10 text-[#F59E0B] border border-[#F59E0B]/30">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>WARNING</span>
          </span>
        );
      case 'CRITICAL':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-semibold bg-[#F04438]/10 text-[#F04438] border border-[#F04438]/30">
            <XCircle className="w-3.5 h-3.5" />
            <span>CRITICAL</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-semibold bg-white/5 text-[#98A2B3] border border-white/10">
            <span>PENDING</span>
          </span>
        );
    }
  };

  const filteredIssues = issues.filter((iss) => {
    if (assetFilter === 'ALL') return true;
    return iss.asset === assetFilter;
  });

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="p-6 rounded-2xl bg-[#07101D] border border-white/[0.08] relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="absolute top-0 right-0 w-96 h-96 bg-[#00CFFF]/5 rounded-full blur-3xl pointer-events-none" />

        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#00CFFF]/10 border border-[#00CFFF]/30 flex items-center justify-center text-[#00CFFF]">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                <span>Financial Audit & Reconciliation</span>
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-white/5 text-[#98A2B3] border border-white/10">
                  Read-Only Diagnosis
                </span>
              </h1>
              <p className="text-xs text-[#98A2B3]">
                Server-side financial ledger integrity validator. Detects missing credits, duplicate entries, swap discrepancies, and withdrawal reservation mismatches.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 self-start md:self-center">
          <button
            onClick={fetchReconciliationData}
            disabled={loading || running}
            className="p-2.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.08] text-[#98A2B3] hover:text-white transition-colors cursor-pointer min-h-[42px] min-w-[42px] flex items-center justify-center disabled:opacity-50"
            title="Refresh reconciliation report"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-[#00CFFF]' : ''}`} />
          </button>

          <button
            onClick={handleTriggerRun}
            disabled={running}
            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#00CFFF] to-[#168BFF] text-[#05070B] font-bold text-xs flex items-center gap-2 hover:opacity-95 transition-opacity cursor-pointer min-h-[42px] shadow-lg shadow-[#00CFFF]/10 disabled:opacity-50"
          >
            {running ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-[#05070B]" />
                <span>Auditing Financial History...</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current" />
                <span>Run Full Reconciliation</span>
              </>
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-[#F04438]/10 border border-[#F04438]/30 flex items-center gap-3 text-xs text-[#F04438]">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Top Integrity Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Issues Found */}
        <div className="p-4 rounded-xl bg-[#07101D] border border-white/[0.08] space-y-2">
          <span className="text-[10px] font-mono text-[#98A2B3] uppercase block">Issues Found</span>
          <div className="flex items-center justify-between">
            <span className={`text-2xl font-bold font-mono ${latestRun?.issuesFound === 0 ? 'text-[#32D583]' : 'text-[#F04438]'}`}>
              {latestRun ? latestRun.issuesFound : '—'}
            </span>
            {latestRun?.issuesFound === 0 ? (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#32D583]/10 text-[#32D583]">BALANCED</span>
            ) : latestRun ? (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#F04438]/10 text-[#F04438]">ACTION REQ</span>
            ) : null}
          </div>
        </div>

        {/* PHIVO Integrity */}
        <div className="p-4 rounded-xl bg-[#07101D] border border-white/[0.08] space-y-2">
          <span className="text-[10px] font-mono text-[#98A2B3] uppercase block flex items-center gap-1.5">
            <Coins className="w-3 h-3 text-[#10B981]" />
            <span>PHIVO Integrity</span>
          </span>
          <div>{latestRun ? getIntegrityBadge(latestRun.phivoIntegrity) : '—'}</div>
        </div>

        {/* USDT Integrity */}
        <div className="p-4 rounded-xl bg-[#07101D] border border-white/[0.08] space-y-2">
          <span className="text-[10px] font-mono text-[#98A2B3] uppercase block flex items-center gap-1.5">
            <DollarSign className="w-3 h-3 text-[#00CFFF]" />
            <span>USDT Integrity</span>
          </span>
          <div>{latestRun ? getIntegrityBadge(latestRun.usdtIntegrity) : '—'}</div>
        </div>

        {/* Ledger Integrity */}
        <div className="p-4 rounded-xl bg-[#07101D] border border-white/[0.08] space-y-2">
          <span className="text-[10px] font-mono text-[#98A2B3] uppercase block flex items-center gap-1.5">
            <FileText className="w-3 h-3 text-[#A855F7]" />
            <span>Ledger Integrity</span>
          </span>
          <div>{latestRun ? getIntegrityBadge(latestRun.ledgerIntegrity) : '—'}</div>
        </div>

        {/* Withdrawal Integrity */}
        <div className="p-4 rounded-xl bg-[#07101D] border border-white/[0.08] space-y-2">
          <span className="text-[10px] font-mono text-[#98A2B3] uppercase block flex items-center gap-1.5">
            <ArrowUpRight className="w-3 h-3 text-[#F97316]" />
            <span>Withdrawals</span>
          </span>
          <div>{latestRun ? getIntegrityBadge(latestRun.withdrawalIntegrity) : '—'}</div>
        </div>

        {/* Swap Integrity */}
        <div className="p-4 rounded-xl bg-[#07101D] border border-white/[0.08] space-y-2">
          <span className="text-[10px] font-mono text-[#98A2B3] uppercase block flex items-center gap-1.5">
            <ArrowLeftRight className="w-3 h-3 text-[#38BDF8]" />
            <span>Swap Math</span>
          </span>
          <div>{latestRun ? getIntegrityBadge(latestRun.swapIntegrity) : '—'}</div>
        </div>
      </div>

      {/* Last Run Diagnostic Information Card */}
      {latestRun && (
        <div className="p-5 rounded-2xl bg-[#07101D] border border-white/[0.08] space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/[0.06]">
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-white">Last Completed Audit Run</span>
              <span className="text-xs font-mono font-bold text-[#00CFFF] px-2 py-0.5 rounded bg-[#00CFFF]/10 border border-[#00CFFF]/20">
                {latestRun.publicRunId}
              </span>
              <span className="text-[10px] font-mono text-[#32D583] px-2 py-0.5 rounded bg-[#32D583]/10 border border-[#32D583]/20">
                {latestRun.status}
              </span>
            </div>
            <div className="text-[11px] text-[#98A2B3] font-mono flex items-center gap-2">
              <Clock className="w-3 h-3" />
              <span>Executed: {new Date(latestRun.startedAt).toLocaleString()}</span>
              <span>by {latestRun.createdByPublicId || 'SYSTEM_AUDITOR'}</span>
            </div>
          </div>

          {/* Subsystem Coverage Breakdown */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 pt-1 text-center">
            <div className="p-2.5 rounded-lg bg-[#05070B] border border-white/[0.04]">
              <div className="text-xs font-mono font-bold text-white">{latestRun.summary.referralsChecked}</div>
              <div className="text-[9px] text-[#98A2B3] uppercase">Referrals</div>
            </div>
            <div className="p-2.5 rounded-lg bg-[#05070B] border border-white/[0.04]">
              <div className="text-xs font-mono font-bold text-white">{latestRun.summary.matchingChecked}</div>
              <div className="text-[9px] text-[#98A2B3] uppercase">Matching</div>
            </div>
            <div className="p-2.5 rounded-lg bg-[#05070B] border border-white/[0.04]">
              <div className="text-xs font-mono font-bold text-white">{latestRun.summary.promotionsChecked}</div>
              <div className="text-[9px] text-[#98A2B3] uppercase">Promos</div>
            </div>
            <div className="p-2.5 rounded-lg bg-[#05070B] border border-white/[0.04]">
              <div className="text-xs font-mono font-bold text-white">{latestRun.summary.miningRewardsChecked}</div>
              <div className="text-[9px] text-[#98A2B3] uppercase">Node Mining</div>
            </div>
            <div className="p-2.5 rounded-lg bg-[#05070B] border border-white/[0.04]">
              <div className="text-xs font-mono font-bold text-white">{latestRun.summary.depositsChecked}</div>
              <div className="text-[9px] text-[#98A2B3] uppercase">BSC Deposits</div>
            </div>
            <div className="p-2.5 rounded-lg bg-[#05070B] border border-white/[0.04]">
              <div className="text-xs font-mono font-bold text-white">{latestRun.summary.withdrawalsChecked}</div>
              <div className="text-[9px] text-[#98A2B3] uppercase">Withdrawals</div>
            </div>
            <div className="p-2.5 rounded-lg bg-[#05070B] border border-white/[0.04]">
              <div className="text-xs font-mono font-bold text-white">{latestRun.summary.swapsChecked}</div>
              <div className="text-[9px] text-[#98A2B3] uppercase">Coin Swaps</div>
            </div>
            <div className="p-2.5 rounded-lg bg-[#05070B] border border-white/[0.04]">
              <div className="text-xs font-mono font-bold text-white">{latestRun.summary.ledgerEntriesChecked}</div>
              <div className="text-[9px] text-[#98A2B3] uppercase">Ledger Rows</div>
            </div>
          </div>
        </div>
      )}

      {/* Discrepancies & Issues Table */}
      <div className="p-6 rounded-2xl bg-[#07101D] border border-white/[0.08] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/[0.08]">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-white">Reconciliation Issues Log</h2>
            <span className="text-xs font-mono text-[#98A2B3]">
              ({filteredIssues.length} {filteredIssues.length === 1 ? 'record' : 'records'})
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-[#98A2B3]">Filter Asset:</span>
            <select
              value={assetFilter}
              onChange={(e) => setAssetFilter(e.target.value)}
              className="px-3 py-1.5 bg-[#05070B] border border-white/[0.1] rounded-lg text-xs text-white outline-none cursor-pointer"
            >
              <option value="ALL">All Assets</option>
              <option value="USDT">USDT Only</option>
              <option value="PHIVO">PHIVO Only</option>
              <option value="USD">USD Reference</option>
            </select>
          </div>
        </div>

        {filteredIssues.length === 0 ? (
          <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-[#32D583]/10 border border-[#32D583]/30 flex items-center justify-center text-[#32D583]">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-white">Financial Ledger Is Completely Balanced</h3>
            <p className="text-xs text-[#98A2B3] max-w-md">
              Zero discrepancies detected. All direct referral commissions, matching bonuses, promotions, mining rewards, BSC deposits, coin swaps, and withdrawal reservations match the authoritative ledger exactly.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-[#98A2B3] border-b border-white/[0.06] uppercase text-[10px] font-mono">
                  <th className="py-2.5 px-3">Issue Type</th>
                  <th className="py-2.5 px-3">Asset</th>
                  <th className="py-2.5 px-3">Source Type</th>
                  <th className="py-2.5 px-3">Source Ref</th>
                  <th className="py-2.5 px-3 text-right">Expected</th>
                  <th className="py-2.5 px-3 text-right">Actual</th>
                  <th className="py-2.5 px-3">Diagnosis Description</th>
                  <th className="py-2.5 px-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {filteredIssues.map((iss) => (
                  <tr key={iss.id} className="hover:bg-white/[0.02]">
                    <td className="py-3 px-3 font-mono font-bold text-[#F04438]">{iss.issueType}</td>
                    <td className="py-3 px-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                        iss.asset === 'PHIVO' ? 'bg-[#10B981]/10 text-[#10B981]' : 'bg-[#00CFFF]/10 text-[#00CFFF]'
                      }`}>
                        {iss.asset}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-mono text-[#D0D5DD]">{iss.sourceType}</td>
                    <td className="py-3 px-3 font-mono text-white">{iss.sourceReference}</td>
                    <td className="py-3 px-3 font-mono text-right text-[#32D583]">
                      {iss.expectedAmount.toFixed(2)}
                    </td>
                    <td className="py-3 px-3 font-mono text-right text-[#F04438]">
                      {iss.actualAmount.toFixed(2)}
                    </td>
                    <td className="py-3 px-3 text-[#98A2B3] max-w-sm truncate" title={iss.description}>
                      {iss.description}
                    </td>
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#F04438]/10 text-[#F04438]">
                        {iss.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
