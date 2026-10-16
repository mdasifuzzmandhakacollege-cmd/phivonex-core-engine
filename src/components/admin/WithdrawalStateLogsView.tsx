import React, { useState, useEffect, useCallback } from 'react';
import {
  Clock,
  Search,
  Filter,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  ArrowRight,
  Copy,
  Check,
  ExternalLink,
  ShieldCheck,
  FileText,
  User,
  Zap,
  Activity,
  ChevronRight,
  X,
  Sliders,
  DollarSign,
  Download,
  Info
} from 'lucide-react';

export interface StateLogRecord {
  id: string;
  withdrawalId: string;
  publicWithdrawalId: string;
  userId: string;
  userName: string;
  userEmail: string;
  previousStatus: string | null;
  newStatus: 'PENDING' | 'APPROVED' | 'PROCESSING' | 'COMPLETED' | 'REJECTED' | 'FAILED' | 'CANCELLED';
  actorType: 'USER' | 'ADMIN' | 'SYSTEM';
  actorId?: string | null;
  actorEmail?: string | null;
  reason?: string | null;
  amount: number;
  destinationType: string;
  destinationReference: string;
  txHash?: string | null;
  transitionTimestamp: string;
  createdAt: string;
}

export interface StateLogStats {
  totalTransitions: number;
  pendingCount: number;
  approvedCount: number;
  completedCount: number;
  rejectedCount: number;
  failedCount: number;
  cancelledCount: number;
}

interface WithdrawalStateLogsViewProps {
  onSelectWithdrawal?: (publicId: string) => void;
}

export const WithdrawalStateLogsView: React.FC<WithdrawalStateLogsViewProps> = ({
  onSelectWithdrawal,
}) => {
  const [logs, setLogs] = useState<StateLogRecord[]>([]);
  const [stats, setStats] = useState<StateLogStats>({
    totalTransitions: 0,
    pendingCount: 0,
    approvedCount: 0,
    completedCount: 0,
    rejectedCount: 0,
    failedCount: 0,
    cancelledCount: 0,
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [actorFilter, setActorFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);

  // Timeline Waterfall Modal State
  const [selectedWithdrawalId, setSelectedWithdrawalId] = useState<string | null>(null);
  const [timelineLogs, setTimelineLogs] = useState<StateLogRecord[]>([]);
  const [timelineLoading, setTimelineLoading] = useState<boolean>(false);

  // Copy helper
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Fetch Logs API
  const fetchStateLogs = useCallback(async (isSilent = false) => {
    try {
      if (!isSilent) setLoading(true);
      else setRefreshing(true);

      const url = `/api/withdrawals/admin/state-logs?page=${page}&limit=20&status=${statusFilter}&actorType=${actorFilter}&search=${encodeURIComponent(
        searchQuery
      )}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
        if (data.stats) setStats(data.stats);
        if (data.pagination) {
          setTotalPages(data.pagination.totalPages || 1);
          setTotalCount(data.pagination.totalCount || 0);
        }
      } else {
        console.error('[WithdrawalStateLogsView] Failed to fetch state transition logs');
      }
    } catch (err) {
      console.error('[WithdrawalStateLogsView] Error fetching logs:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [page, statusFilter, actorFilter, searchQuery]);

  useEffect(() => {
    fetchStateLogs();
  }, [fetchStateLogs]);

  // Fetch Timeline for Modal
  const handleOpenTimeline = async (publicId: string) => {
    setSelectedWithdrawalId(publicId);
    setTimelineLoading(true);
    try {
      const res = await fetch(`/api/withdrawals/admin/state-timeline/${publicId}`);
      if (res.ok) {
        const data = await res.json();
        setTimelineLogs(data.timeline || []);
      }
    } catch (err) {
      console.error('[WithdrawalStateLogsView] Failed to fetch timeline:', err);
    } finally {
      setTimelineLoading(false);
    }
  };

  // Export CSV
  const handleExportLogsCsv = () => {
    if (logs.length === 0) return;
    const headers = [
      'Transition Timestamp',
      'Public Withdrawal ID',
      'User Name',
      'User Email',
      'Previous Status',
      'New Status',
      'Actor Type',
      'Actor Email',
      'Amount (USD)',
      'Destination Type',
      'Destination Address',
      'Reason / Note',
      'Tx Hash',
    ];

    const rows = logs.map((l) => [
      l.transitionTimestamp,
      l.publicWithdrawalId,
      `"${l.userName || ''}"`,
      l.userEmail || '',
      l.previousStatus || 'NULL (Created)',
      l.newStatus,
      l.actorType,
      l.actorEmail || 'N/A',
      l.amount,
      l.destinationType,
      `"${l.destinationReference}"`,
      `"${(l.reason || '').replace(/"/g, '""')}"`,
      l.txHash || '',
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `phivonex_withdrawal_state_logs_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return (
          <span className="px-2.5 py-1 rounded-full text-[10px] font-mono font-bold uppercase bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
            PENDING
          </span>
        );
      case 'APPROVED':
        return (
          <span className="px-2.5 py-1 rounded-full text-[10px] font-mono font-bold uppercase bg-blue-500/10 text-blue-400 border border-blue-500/30 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            APPROVED
          </span>
        );
      case 'PROCESSING':
        return (
          <span className="px-2.5 py-1 rounded-full text-[10px] font-mono font-bold uppercase bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" />
            PROCESSING
          </span>
        );
      case 'COMPLETED':
        return (
          <span className="px-2.5 py-1 rounded-full text-[10px] font-mono font-bold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            COMPLETED
          </span>
        );
      case 'REJECTED':
        return (
          <span className="px-2.5 py-1 rounded-full text-[10px] font-mono font-bold uppercase bg-red-500/10 text-red-400 border border-red-500/30 flex items-center gap-1">
            <XCircle className="w-3 h-3" />
            REJECTED
          </span>
        );
      case 'FAILED':
        return (
          <span className="px-2.5 py-1 rounded-full text-[10px] font-mono font-bold uppercase bg-rose-500/10 text-rose-400 border border-rose-500/30 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            FAILED
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="px-2.5 py-1 rounded-full text-[10px] font-mono font-bold uppercase bg-gray-500/10 text-gray-400 border border-gray-500/30 flex items-center gap-1">
            <XCircle className="w-3 h-3" />
            CANCELLED
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 rounded-full text-[10px] font-mono font-bold uppercase bg-white/10 text-white/80 border border-white/20">
            {status}
          </span>
        );
    }
  };

  const getActorBadge = (actorType: string, email?: string | null) => {
    if (actorType === 'ADMIN') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-purple-500/10 border border-purple-500/30 text-purple-300 text-[10px] font-mono" title={email || 'Admin'}>
          <ShieldCheck className="w-3 h-3 text-purple-400" />
          <span>ADMIN {email ? `(${email.split('@')[0]})` : ''}</span>
        </span>
      );
    }
    if (actorType === 'USER') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/30 text-blue-300 text-[10px] font-mono">
          <User className="w-3 h-3 text-blue-400" />
          <span>USER</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[10px] font-mono">
        <Zap className="w-3 h-3 text-emerald-400" />
        <span>SYSTEM ENGINE</span>
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Title Banner */}
      <div className="p-6 rounded-2xl bg-[#07101D] border border-white/[0.08] shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-[#00CFFF]/10 border border-[#00CFFF]/30 flex items-center justify-center text-[#00CFFF]">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-white flex items-center gap-2">
                Withdrawal State Transition Monitoring Logs
              </h2>
              <p className="text-xs text-[#98A2B3] mt-0.5">
                Real-time administrative audit trail tracking state machine transitions (pending, approved, rejected, processing, completed) with precise server timestamps.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportLogsCsv}
            disabled={logs.length === 0}
            className="px-3 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-white border border-white/[0.1] text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5 text-[#00CFFF]" />
            <span>Export CSV</span>
          </button>
          <button
            onClick={() => fetchStateLogs(true)}
            disabled={refreshing || loading}
            className="px-3.5 py-2 rounded-xl bg-[#00CFFF]/15 hover:bg-[#00CFFF]/25 text-[#00CFFF] border border-[#00CFFF]/40 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Metrics Summary Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="p-4 rounded-xl bg-[#07101D] border border-white/[0.08] space-y-1">
          <span className="text-[10px] font-mono text-[#98A2B3] uppercase">Total Transitions</span>
          <div className="text-xl font-bold text-white font-mono">{stats.totalTransitions}</div>
        </div>
        <div className="p-4 rounded-xl bg-[#07101D] border border-amber-500/20 space-y-1">
          <span className="text-[10px] font-mono text-amber-400 uppercase">Pending Requests</span>
          <div className="text-xl font-bold text-amber-400 font-mono">{stats.pendingCount}</div>
        </div>
        <div className="p-4 rounded-xl bg-[#07101D] border border-blue-500/20 space-y-1">
          <span className="text-[10px] font-mono text-blue-400 uppercase font-bold">Approved</span>
          <div className="text-xl font-bold text-blue-400 font-mono">{stats.approvedCount}</div>
        </div>
        <div className="p-4 rounded-xl bg-[#07101D] border border-emerald-500/20 space-y-1">
          <span className="text-[10px] font-mono text-emerald-400 uppercase font-bold">Completed</span>
          <div className="text-xl font-bold text-emerald-400 font-mono">{stats.completedCount}</div>
        </div>
        <div className="p-4 rounded-xl bg-[#07101D] border border-red-500/20 space-y-1">
          <span className="text-[10px] font-mono text-red-400 uppercase font-bold">Rejections</span>
          <div className="text-xl font-bold text-red-400 font-mono">{stats.rejectedCount}</div>
        </div>
        <div className="p-4 rounded-xl bg-[#07101D] border border-rose-500/20 space-y-1">
          <span className="text-[10px] font-mono text-rose-400 uppercase font-bold">Failed / Cancelled</span>
          <div className="text-xl font-bold text-rose-400 font-mono">{stats.failedCount + stats.cancelledCount}</div>
        </div>
      </div>

      {/* Filter and Search Control Bar */}
      <div className="p-4 rounded-2xl bg-[#07101D] border border-white/[0.08] flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 text-[#98A2B3] absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by Withdrawal ID, user email, recipient address, tx hash, or rejection reason..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#05070B] border border-white/[0.1] rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder-[#98A2B3] focus:outline-none focus:border-[#00CFFF] transition-colors"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
          <div className="flex items-center gap-1.5 bg-[#05070B] border border-white/[0.1] rounded-xl px-3 py-1.5">
            <Filter className="w-3.5 h-3.5 text-[#00CFFF]" />
            <span className="text-[11px] text-[#98A2B3]">State:</span>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="bg-transparent text-xs text-white focus:outline-none font-medium cursor-pointer"
            >
              <option value="ALL" className="bg-[#07101D] text-white">All Target States</option>
              <option value="PENDING" className="bg-[#07101D] text-amber-400">PENDING</option>
              <option value="APPROVED" className="bg-[#07101D] text-blue-400">APPROVED</option>
              <option value="PROCESSING" className="bg-[#07101D] text-cyan-400">PROCESSING</option>
              <option value="COMPLETED" className="bg-[#07101D] text-emerald-400">COMPLETED</option>
              <option value="REJECTED" className="bg-[#07101D] text-red-400">REJECTED</option>
              <option value="FAILED" className="bg-[#07101D] text-rose-400">FAILED</option>
              <option value="CANCELLED" className="bg-[#07101D] text-gray-400">CANCELLED</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 bg-[#05070B] border border-white/[0.1] rounded-xl px-3 py-1.5">
            <User className="w-3.5 h-3.5 text-[#00CFFF]" />
            <span className="text-[11px] text-[#98A2B3]">Actor:</span>
            <select
              value={actorFilter}
              onChange={(e) => {
                setActorFilter(e.target.value);
                setPage(1);
              }}
              className="bg-transparent text-xs text-white focus:outline-none font-medium cursor-pointer"
            >
              <option value="ALL" className="bg-[#07101D] text-white">All Actors</option>
              <option value="ADMIN" className="bg-[#07101D] text-purple-300">ADMIN</option>
              <option value="SYSTEM" className="bg-[#07101D] text-emerald-300">SYSTEM ENGINE</option>
              <option value="USER" className="bg-[#07101D] text-blue-300">USER</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Transition Logs Table */}
      <div className="p-6 rounded-2xl bg-[#07101D] border border-white/[0.08] shadow-xl space-y-4">
        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center space-y-3">
            <Loader2 className="w-8 h-8 text-[#00CFFF] animate-spin" />
            <span className="text-xs text-[#98A2B3] font-mono">Loading state transition log database...</span>
          </div>
        ) : logs.length === 0 ? (
          <div className="py-12 text-center space-y-3">
            <Activity className="w-8 h-8 text-white/30 mx-auto" />
            <div className="text-sm font-bold text-white">No State Transition Logs Found</div>
            <p className="text-xs text-[#98A2B3] max-w-md mx-auto">
              No state transition events match your active search or state filter. Try resetting filters or creating a withdrawal request.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/[0.08] text-[10px] font-mono uppercase tracking-wider text-[#98A2B3]">
                  <th className="pb-3 px-3">Timestamp (UTC)</th>
                  <th className="pb-3 px-3">Withdrawal ID</th>
                  <th className="pb-3 px-3">State Transition</th>
                  <th className="pb-3 px-3">User Account</th>
                  <th className="pb-3 px-3">Amount &amp; Network</th>
                  <th className="pb-3 px-3">Triggered By</th>
                  <th className="pb-3 px-3">Audit Reason / Note</th>
                  <th className="pb-3 px-3 text-right">Timeline Waterfall</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04] text-xs font-mono">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-white/[0.02] transition-colors group">
                    <td className="py-3.5 px-3 whitespace-nowrap text-[#98A2B3]">
                      <div className="font-bold text-white text-[11px]">
                        {new Date(log.transitionTimestamp).toLocaleTimeString()}
                      </div>
                      <div className="text-[10px] opacity-75">
                        {new Date(log.transitionTimestamp).toLocaleDateString()}
                      </div>
                    </td>

                    <td className="py-3.5 px-3 whitespace-nowrap">
                      <div className="flex items-center gap-1.5 font-bold text-[#00CFFF]">
                        <span>{log.publicWithdrawalId}</span>
                        <button
                          onClick={() => handleCopy(log.publicWithdrawalId, log.id)}
                          className="p-1 hover:bg-white/10 rounded transition-colors text-white/50 hover:text-white cursor-pointer"
                          title="Copy Public Withdrawal ID"
                        >
                          {copiedId === log.id ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    </td>

                    <td className="py-3.5 px-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {log.previousStatus ? (
                          <span className="text-[10px] text-white/60 font-bold">
                            {log.previousStatus}
                          </span>
                        ) : (
                          <span className="text-[10px] text-emerald-400/80 font-bold italic">
                            NEW REQUEST
                          </span>
                        )}
                        <ArrowRight className="w-3 h-3 text-[#00CFFF]" />
                        {getStatusBadge(log.newStatus)}
                      </div>
                    </td>

                    <td className="py-3.5 px-3 whitespace-nowrap">
                      <div className="font-bold text-white">{log.userName || 'System User'}</div>
                      <div className="text-[10px] text-[#98A2B3]">{log.userEmail || 'N/A'}</div>
                    </td>

                    <td className="py-3.5 px-3 whitespace-nowrap">
                      <div className="font-bold text-white text-sm">
                        ${log.amount.toFixed(2)}
                      </div>
                      <div className="text-[10px] text-[#00CFFF]">
                        {log.destinationType}
                      </div>
                    </td>

                    <td className="py-3.5 px-3 whitespace-nowrap">
                      {getActorBadge(log.actorType, log.actorEmail)}
                    </td>

                    <td className="py-3.5 px-3">
                      <div className="max-w-xs text-[11px] text-white/90 truncate font-sans" title={log.reason || ''}>
                        {log.reason || <span className="text-white/40 italic">No notes</span>}
                      </div>
                      {log.txHash && (
                        <a
                          href={`https://bscscan.com/tx/${log.txHash}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[10px] text-[#00CFFF] hover:underline mt-0.5"
                        >
                          <span>Tx: {log.txHash.slice(0, 10)}...</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      )}
                    </td>

                    <td className="py-3.5 px-3 text-right whitespace-nowrap">
                      <button
                        onClick={() => handleOpenTimeline(log.publicWithdrawalId)}
                        className="px-2.5 py-1.5 rounded-lg bg-white/[0.05] hover:bg-[#00CFFF]/20 text-white hover:text-[#00CFFF] border border-white/[0.1] hover:border-[#00CFFF]/40 text-[11px] font-bold flex items-center gap-1 ml-auto transition-all cursor-pointer"
                      >
                        <span>History Timeline</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-4 border-t border-white/[0.08] text-xs">
            <span className="text-[#98A2B3] font-mono">
              Showing page <strong className="text-white">{page}</strong> of <strong className="text-white">{totalPages}</strong> ({totalCount} transition events)
            </span>

            <div className="flex items-center gap-2 font-mono">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-white disabled:opacity-40 disabled:cursor-not-allowed border border-white/[0.08] transition-colors cursor-pointer"
              >
                &larr; Previous
              </button>

              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-white disabled:opacity-40 disabled:cursor-not-allowed border border-white/[0.08] transition-colors cursor-pointer"
              >
                Next &rarr;
              </button>
            </div>
          </div>
        )}
      </div>

      {/* State Timeline Waterfall Drawer / Modal */}
      {selectedWithdrawalId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-[#07101D] border border-[#00CFFF]/40 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-6 relative max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-white/[0.1] pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#00CFFF]/20 text-[#00CFFF] flex items-center justify-center border border-[#00CFFF]/40">
                  <Activity className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    Chronological State Transition Waterfall
                  </h3>
                  <p className="text-xs text-[#00CFFF] font-mono">
                    Withdrawal ID: {selectedWithdrawalId}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSelectedWithdrawalId(null)}
                className="p-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-white/70 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Timeline Body */}
            <div className="flex-1 overflow-y-auto pr-1 space-y-4 font-mono">
              {timelineLoading ? (
                <div className="py-12 flex flex-col items-center justify-center space-y-2">
                  <Loader2 className="w-6 h-6 text-[#00CFFF] animate-spin" />
                  <span className="text-xs text-[#98A2B3]">Loading transition history waterfall...</span>
                </div>
              ) : timelineLogs.length === 0 ? (
                <div className="py-8 text-center text-xs text-[#98A2B3]">
                  No transition steps recorded for this withdrawal request.
                </div>
              ) : (
                <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-[#00CFFF]/30">
                  {timelineLogs.map((item, idx) => (
                    <div key={item.id} className="relative group">
                      <div className="absolute -left-6 top-0.5 w-5 h-5 rounded-full bg-[#07101D] border-2 border-[#00CFFF] flex items-center justify-center text-[9px] font-bold text-[#00CFFF]">
                        {idx + 1}
                      </div>

                      <div className="p-4 rounded-xl bg-[#05070B] border border-white/[0.08] space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            {item.previousStatus && (
                              <span className="text-[10px] text-white/60 font-bold">
                                {item.previousStatus} &rarr;
                              </span>
                            )}
                            {getStatusBadge(item.newStatus)}
                          </div>

                          <span className="text-[11px] text-[#98A2B3]">
                            {new Date(item.transitionTimestamp).toLocaleString()}
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-xs text-white/90 pt-1">
                          <div>
                            <span className="text-[10px] text-[#98A2B3] uppercase">Amount: </span>
                            <strong className="text-white">${item.amount.toFixed(2)} {item.destinationType}</strong>
                          </div>
                          <div>{getActorBadge(item.actorType, item.actorEmail)}</div>
                        </div>

                        {item.reason && (
                          <div className="text-xs text-white/80 bg-white/[0.03] p-2 rounded border border-white/[0.05] font-sans">
                            <strong className="text-[#00CFFF] font-mono text-[10px] uppercase">Audit Reason: </strong>
                            {item.reason}
                          </div>
                        )}

                        {item.txHash && (
                          <div className="text-[11px] text-emerald-400 flex items-center gap-1.5 pt-1">
                            <span>Blockchain Tx:</span>
                            <a
                              href={`https://bscscan.com/tx/${item.txHash}`}
                              target="_blank"
                              rel="noreferrer"
                              className="underline font-bold hover:text-emerald-300 flex items-center gap-1"
                            >
                              <span>{item.txHash}</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-white/[0.1] flex justify-end">
              <button
                onClick={() => setSelectedWithdrawalId(null)}
                className="px-4 py-2 rounded-xl bg-white/[0.08] hover:bg-white/[0.15] text-white font-bold text-xs cursor-pointer"
              >
                Close Waterfall View
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
