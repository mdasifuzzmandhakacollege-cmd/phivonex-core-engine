import React, { useState, useEffect, useCallback } from 'react';
import {
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Search,
  Filter,
  RefreshCw,
  Download,
  Copy,
  Check,
  ExternalLink,
  ArrowRight,
  ShieldCheck,
  DollarSign,
  Activity,
  FileText,
  User,
  Zap,
  Info
} from 'lucide-react';

export interface TransitionLogRecord {
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
  requestedAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  failedAt: string | null;
  rejectionReason: string | null;
  txHash: string | null;
  createdAt: string;
  updatedAt: string;
}

interface TransitionStats {
  total: number;
  pending: number;
  approved: number;
  completed: number;
  rejected: number;
  failed: number;
  cancelled: number;
}

export const WithdrawalAuditLog: React.FC = () => {
  const [logs, setLogs] = useState<TransitionLogRecord[]>([]);
  const [stats, setStats] = useState<TransitionStats>({
    total: 0,
    pending: 0,
    approved: 0,
    completed: 0,
    rejected: 0,
    failed: 0,
    cancelled: 0,
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: String(page),
        limit: '25',
        status: statusFilter,
        search: searchQuery,
      });

      const res = await fetch(`/api/withdrawals/admin/transition-logs?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
        if (data.stats) setStats(data.stats);
        if (data.pagination) {
          setTotalPages(data.pagination.totalPages || 1);
          setTotalCount(data.pagination.totalCount || 0);
        }
      }
    } catch (err) {
      console.error('[WithdrawalAuditLog] Error fetching logs:', err);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, searchQuery]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchLogs();
    }, 10000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchLogs]);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const formatDate = (isoString: string | null) => {
    if (!isoString) return null;
    try {
      const date = new Date(isoString);
      return date.toLocaleString('en-US', {
        month: 'short',
        day: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      });
    } catch {
      return isoString;
    }
  };

  const formatDelta = (startIso: string | null, endIso: string | null) => {
    if (!startIso || !endIso) return null;
    try {
      const diffMs = new Date(endIso).getTime() - new Date(startIso).getTime();
      if (diffMs < 0) return null;
      const diffSec = Math.floor(diffMs / 1000);
      if (diffSec < 60) return `${diffSec}s`;
      const diffMin = Math.floor(diffSec / 60);
      if (diffMin < 60) return `${diffMin}m ${diffSec % 60}s`;
      const diffHrs = Math.floor(diffMin / 60);
      return `${diffHrs}h ${diffMin % 60}m`;
    } catch {
      return null;
    }
  };

  const exportCsv = () => {
    if (logs.length === 0) return;
    const headers = [
      'Public Withdrawal ID',
      'User Email',
      'User Public ID',
      'Amount (USD)',
      'Destination Type',
      'Destination Wallet Address',
      'Status',
      'Requested At (Pending)',
      'Approved At',
      'Rejected At',
      'Completed At',
      'Cancelled At',
      'Failed At',
      'Rejection Reason',
      'Tx Hash',
    ];

    const rows = logs.map((log) => [
      log.publicWithdrawalId,
      log.userEmail,
      log.userPublicId,
      log.amount.toFixed(2),
      log.destinationType,
      log.destinationReference,
      log.status,
      log.requestedAt || '',
      log.approvedAt || '',
      log.rejectedAt || '',
      log.completedAt || '',
      log.cancelledAt || '',
      log.failedAt || '',
      `"${(log.rejectionReason || '').replace(/"/g, '""')}"`,
      log.txHash || '',
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `withdrawal_state_transitions_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-2xl bg-[#07101D] border border-white/[0.08] relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-[#00CFFF]/5 rounded-full blur-3xl pointer-events-none" />

        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                <span>Withdrawal Request State Monitoring Log</span>
                <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-mono font-bold">
                  AUDIT TRAIL
                </span>
              </h1>
              <p className="text-xs text-[#98A2B3]">
                Cryptographically tracked state transitions (Pending → Approved → Disbursed / Rejected) with exact millisecond timestamps.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`py-2 px-3 rounded-xl border text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer min-h-[40px] ${
              autoRefresh
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 shadow-md shadow-emerald-500/10'
                : 'bg-white/[0.04] border-white/[0.08] text-[#98A2B3] hover:text-white'
            }`}
            title="Toggle 10s Live Auto-Polling"
          >
            <Activity className={`w-3.5 h-3.5 ${autoRefresh ? 'animate-pulse text-emerald-400' : ''}`} />
            <span>{autoRefresh ? 'Live Poll: Active' : 'Live Poll: Paused'}</span>
          </button>

          <button
            onClick={fetchLogs}
            disabled={loading}
            className="p-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-[#98A2B3] hover:text-white transition-all cursor-pointer min-h-[40px] min-w-[40px] flex items-center justify-center"
            title="Refresh Logs"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-[#00CFFF]' : ''}`} />
          </button>

          <button
            onClick={exportCsv}
            disabled={logs.length === 0}
            className="py-2 px-3.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-xs text-white font-bold flex items-center gap-2 transition-all cursor-pointer min-h-[40px] disabled:opacity-40"
          >
            <Download className="w-3.5 h-3.5 text-[#00CFFF]" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Transition Statistics Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="p-4 rounded-xl bg-[#07101D] border border-white/[0.08] space-y-1">
          <div className="text-[11px] font-mono text-[#98A2B3] uppercase tracking-wider">Total Tracked</div>
          <div className="text-xl font-bold font-mono text-white">{stats.total}</div>
        </div>

        <div className="p-4 rounded-xl bg-[#07101D] border border-amber-500/30 bg-amber-500/[0.02] space-y-1">
          <div className="text-[11px] font-mono text-amber-400 uppercase tracking-wider flex items-center gap-1">
            <Clock className="w-3 h-3" />
            <span>Pending</span>
          </div>
          <div className="text-xl font-bold font-mono text-amber-300">{stats.pending}</div>
        </div>

        <div className="p-4 rounded-xl bg-[#07101D] border border-[#00CFFF]/30 bg-[#00CFFF]/[0.02] space-y-1">
          <div className="text-[11px] font-mono text-[#00CFFF] uppercase tracking-wider flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            <span>Approved</span>
          </div>
          <div className="text-xl font-bold font-mono text-[#00CFFF]">{stats.approved}</div>
        </div>

        <div className="p-4 rounded-xl bg-[#07101D] border border-emerald-500/30 bg-emerald-500/[0.02] space-y-1">
          <div className="text-[11px] font-mono text-emerald-400 uppercase tracking-wider flex items-center gap-1">
            <Zap className="w-3 h-3" />
            <span>Completed</span>
          </div>
          <div className="text-xl font-bold font-mono text-emerald-300">{stats.completed}</div>
        </div>

        <div className="p-4 rounded-xl bg-[#07101D] border border-rose-500/30 bg-rose-500/[0.02] space-y-1">
          <div className="text-[11px] font-mono text-rose-400 uppercase tracking-wider flex items-center gap-1">
            <XCircle className="w-3 h-3" />
            <span>Rejected</span>
          </div>
          <div className="text-xl font-bold font-mono text-rose-300">{stats.rejected}</div>
        </div>

        <div className="p-4 rounded-xl bg-[#07101D] border border-purple-500/30 bg-purple-500/[0.02] space-y-1">
          <div className="text-[11px] font-mono text-purple-400 uppercase tracking-wider flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            <span>Cancelled/Failed</span>
          </div>
          <div className="text-xl font-bold font-mono text-purple-300">{stats.cancelled + stats.failed}</div>
        </div>
      </div>

      {/* Filters & Search Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-4 rounded-xl bg-[#07101D] border border-white/[0.08]">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-[#98A2B3] absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Search by Withdrawal ID, Email, or Wallet Address..."
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-black/40 border border-white/10 text-xs text-white placeholder-[#64748b] focus:outline-none focus:border-[#00CFFF]/50"
          />
        </div>

        {/* Status Filter Buttons */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none text-xs">
          {['ALL', 'PENDING', 'APPROVED', 'COMPLETED', 'REJECTED', 'CANCELLED', 'FAILED'].map((st) => (
            <button
              key={st}
              onClick={() => {
                setStatusFilter(st);
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg whitespace-nowrap font-semibold transition-all cursor-pointer ${
                statusFilter === st
                  ? 'bg-[#00CFFF] text-[#05070B]'
                  : 'bg-white/[0.02] text-[#98A2B3] hover:text-white hover:bg-white/[0.06]'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Transition Matrix Logs Table */}
      <div className="rounded-2xl bg-[#07101D] border border-white/[0.08] overflow-hidden">
        {loading && logs.length === 0 ? (
          <div className="p-16 flex flex-col items-center justify-center space-y-3">
            <RefreshCw className="w-6 h-6 text-[#00CFFF] animate-spin" />
            <p className="text-xs font-mono text-[#98A2B3]">Loading cryptographic transition logs...</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="p-16 flex flex-col items-center justify-center text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-center text-[#64748b]">
              <FileText className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-white">No Transition Logs Found</h3>
            <p className="text-xs text-[#98A2B3]">There are no withdrawal records matching your active filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-black/40 text-[#64748b] font-mono uppercase text-[10px] tracking-wider border-b border-white/[0.08]">
                  <th className="p-4">Withdrawal ID & Operator</th>
                  <th className="p-4">Amount & Wallet</th>
                  <th className="p-4">Current State</th>
                  <th className="p-4">Status Transition Timestamps</th>
                  <th className="p-4 text-right">Processing SLA</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {logs.map((log) => {
                  const reqTime = formatDate(log.requestedAt);
                  const appTime = formatDate(log.approvedAt);
                  const rejTime = formatDate(log.rejectedAt);
                  const compTime = formatDate(log.completedAt);
                  const cancTime = formatDate(log.cancelledAt);
                  const failTime = formatDate(log.failedAt);

                  const slaDelta = formatDelta(log.requestedAt, log.completedAt || log.approvedAt || log.rejectedAt || log.cancelledAt);

                  return (
                    <tr key={log.id} className="hover:bg-white/[0.02] transition-colors">
                      {/* ID & Operator */}
                      <td className="p-4 align-top space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-[#00CFFF] text-xs">
                            {log.publicWithdrawalId}
                          </span>
                          <button
                            onClick={() => handleCopy(log.publicWithdrawalId, log.id)}
                            className="text-[#64748b] hover:text-white transition-colors"
                            title="Copy ID"
                          >
                            {copiedId === log.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          </button>
                        </div>

                        <div className="space-y-0.5">
                          <div className="text-white font-semibold flex items-center gap-1.5">
                            <User className="w-3 h-3 text-[#98A2B3]" />
                            <span>{log.userName}</span>
                          </div>
                          <div className="text-[11px] text-[#98A2B3] font-mono">{log.userEmail}</div>
                          <div className="text-[10px] text-[#64748b] font-mono">ID: {log.userPublicId}</div>
                        </div>
                      </td>

                      {/* Amount & Destination Wallet */}
                      <td className="p-4 align-top space-y-1.5">
                        <div className="text-sm font-bold font-mono text-emerald-400">
                          ${log.amount.toFixed(2)} <span className="text-[10px] text-[#98A2B3]">USDT</span>
                        </div>

                        <div className="space-y-0.5">
                          <div className="text-[10px] font-mono text-[#64748b] uppercase">{log.destinationType}</div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-[11px] text-[#e2e8f0] bg-black/40 px-2 py-0.5 rounded border border-white/[0.06]">
                              {log.destinationReference.slice(0, 8)}...{log.destinationReference.slice(-6)}
                            </span>
                            <button
                              onClick={() => handleCopy(log.destinationReference, `${log.id}_addr`)}
                              className="text-[#64748b] hover:text-white transition-colors"
                              title="Copy Wallet Address"
                            >
                              {copiedId === `${log.id}_addr` ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                            </button>
                            <a
                              href={`https://bscscan.com/address/${log.destinationReference}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[#00CFFF] hover:underline"
                              title="View Address on BscScan"
                            >
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                        </div>
                      </td>

                      {/* Current State */}
                      <td className="p-4 align-top">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-mono font-bold inline-flex items-center gap-1.5 border ${
                          log.status === 'COMPLETED'
                            ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                            : log.status === 'APPROVED'
                            ? 'bg-[#00CFFF]/15 border-[#00CFFF]/30 text-[#00CFFF]'
                            : log.status === 'PENDING'
                            ? 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                            : log.status === 'REJECTED'
                            ? 'bg-rose-500/15 border-rose-500/30 text-rose-300'
                            : 'bg-purple-500/15 border-purple-500/30 text-purple-300'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            log.status === 'COMPLETED' ? 'bg-emerald-400' : log.status === 'PENDING' ? 'bg-amber-400 animate-pulse' : 'bg-[#00CFFF]'
                          }`} />
                          {log.status}
                        </span>
                      </td>

                      {/* State Transition Matrix Timestamps */}
                      <td className="p-4 align-top space-y-1.5">
                        <div className="space-y-1 text-[11px] font-mono">
                          {/* Requested / Pending */}
                          <div className="flex items-center gap-2">
                            <span className="w-20 text-[#64748b] text-[10px] uppercase">1. Pending:</span>
                            <span className="text-amber-300 font-semibold">{reqTime || 'N/A'}</span>
                          </div>

                          {/* Approved */}
                          {log.approvedAt && (
                            <div className="flex items-center gap-2">
                              <span className="w-20 text-[#64748b] text-[10px] uppercase">2. Approved:</span>
                              <span className="text-[#00CFFF] font-semibold">{appTime}</span>
                            </div>
                          )}

                          {/* Completed / Disbursed */}
                          {log.completedAt && (
                            <div className="flex items-center gap-2">
                              <span className="w-20 text-[#64748b] text-[10px] uppercase">3. Disbursed:</span>
                              <span className="text-emerald-300 font-semibold">{compTime}</span>
                              {log.txHash && (
                                <a
                                  href={`https://bscscan.com/tx/${log.txHash}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[#00CFFF] hover:underline text-[10px] flex items-center gap-0.5 ml-1"
                                >
                                  <span>Tx: {log.txHash.slice(0, 8)}...</span>
                                  <ExternalLink className="w-2.5 h-2.5" />
                                </a>
                              )}
                            </div>
                          )}

                          {/* Rejected */}
                          {log.rejectedAt && (
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-2">
                                <span className="w-20 text-[#64748b] text-[10px] uppercase">Rejected:</span>
                                <span className="text-rose-400 font-semibold">{rejTime}</span>
                              </div>
                              {log.rejectionReason && (
                                <div className="text-[10px] text-rose-300/80 bg-rose-500/10 p-1.5 rounded border border-rose-500/20 max-w-sm">
                                  Reason: {log.rejectionReason}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Cancelled */}
                          {log.cancelledAt && (
                            <div className="flex items-center gap-2">
                              <span className="w-20 text-[#64748b] text-[10px] uppercase">Cancelled:</span>
                              <span className="text-purple-300 font-semibold">{cancTime}</span>
                            </div>
                          )}

                          {/* Failed */}
                          {log.failedAt && (
                            <div className="flex items-center gap-2">
                              <span className="w-20 text-[#64748b] text-[10px] uppercase">Failed:</span>
                              <span className="text-rose-400 font-semibold">{failTime}</span>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Processing SLA Delta */}
                      <td className="p-4 align-top text-right font-mono">
                        {slaDelta ? (
                          <div className="inline-block px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/[0.08] text-xs font-semibold text-white">
                            {slaDelta}
                          </div>
                        ) : (
                          <span className="text-[11px] text-[#64748b] italic">In Queue</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="p-4 bg-black/30 border-t border-white/[0.08] flex items-center justify-between text-xs text-[#98A2B3]">
            <div>
              Showing page <span className="text-white font-bold">{page}</span> of{' '}
              <span className="text-white font-bold">{totalPages}</span> ({totalCount} total entries)
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] disabled:opacity-40 cursor-pointer"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] disabled:opacity-40 cursor-pointer"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
