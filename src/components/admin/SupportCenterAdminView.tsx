import React, { useState, useEffect } from 'react';
import {
  HelpCircle,
  MessageSquare,
  Search,
  Filter,
  Send,
  User,
  Clock,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  X,
  ChevronRight,
  Shield,
  Tag,
  Lock,
  ArrowRight,
  Eye,
  FileText,
} from 'lucide-react';

interface SupportTicketRecord {
  id: string;
  publicTicketId: string;
  userId: string;
  userPublicId?: string;
  userEmail?: string;
  userDisplayName?: string;
  category: string;
  subject: string;
  userMessage: string;
  supportSummary: string | null;
  status: 'OPEN' | 'IN_PROGRESS' | 'WAITING_FOR_USER' | 'RESOLVED' | 'CLOSED' | 'ESCALATED';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  relatedEntityType: string | null;
  relatedPublicReference: string | null;
  automatedDiagnosisSummary: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  messageCount?: number;
  latestMessageSnippet?: string;
}

interface SupportMessageRecord {
  id: string;
  ticketId: string;
  senderType: 'USER' | 'SUPPORT' | 'ADMIN';
  senderPublicName: string;
  message: string;
  isInternalNote: boolean;
  createdAt: string;
}

interface UserLiveData {
  user: {
    publicId: string;
    email: string;
    displayName: string;
    status: string;
    createdAt: string;
  };
  balances: {
    availableDepositBalanceUsd: number;
    phivoCoinBalance: number;
    pendingWithdrawalTotalUsd: number;
  };
  withdrawals: Array<{
    publicWithdrawalId: string;
    amount: number;
    status: string;
    destinationType: string;
    requestedAt: string;
    txHash: string | null;
  }>;
  deposits: Array<{
    publicDepositId: string;
    amount: number;
    status: string;
    requestedAt: string;
  }>;
  nodes: {
    activeNodeCount: number;
    totalLifetimePhivoAllocation: number;
    distributedPhivo: number;
    remainingPhivo: number;
  };
}

export const SupportCenterAdminView: React.FC = () => {
  const [tickets, setTickets] = useState<SupportTicketRecord[]>([]);
  const [stats, setStats] = useState({
    openCount: 0,
    inProgressCount: 0,
    waitingCount: 0,
    resolvedCount: 0,
    totalCount: 0,
  });
  const [isLoading, setIsLoading] = useState(false);

  // Filters
  const [statusFilter, setTicketStatusFilter] = useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Selected Ticket Detail State
  const [selectedTicket, setSelectedTicket] = useState<SupportTicketRecord | null>(null);
  const [messages, setMessages] = useState<SupportMessageRecord[]>([]);
  const [userLiveData, setUserLiveData] = useState<UserLiveData | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  // Admin Reply Form
  const [replyMessage, setReplyMessage] = useState('');
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [newStatus, setNewStatus] = useState<string>('');
  const [newPriority, setNewPriority] = useState<string>('');
  const [isSubmittingReply, setIsSubmittingReply] = useState(false);
  const [feedback, setFormFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Fetch Tickets List
  const fetchAdminTickets = async () => {
    setIsLoading(true);
    try {
      const url = new URL('/api/support/admin/tickets', window.location.origin);
      if (statusFilter !== 'ALL') url.searchParams.append('status', statusFilter);
      if (categoryFilter !== 'ALL') url.searchParams.append('category', categoryFilter);
      if (searchQuery.trim()) url.searchParams.append('search', searchQuery.trim());

      const res = await fetch(url.toString());
      const data = await res.json();
      if (data.success) {
        setTickets(data.tickets || []);
        if (data.stats) setStats(data.stats);
      }
    } catch (err) {
      console.error('[SupportCenterAdminView] Error fetching tickets:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAdminTickets();
  }, [statusFilter, categoryFilter]);

  // Load Detailed Ticket Data
  const openTicketDetail = async (ticket: SupportTicketRecord) => {
    setSelectedTicket(ticket);
    setNewStatus(ticket.status);
    setNewPriority(ticket.priority);
    setIsLoadingDetail(true);
    setFormFeedback(null);

    try {
      const res = await fetch(`/api/support/admin/tickets/${ticket.publicTicketId}`);
      const data = await res.json();
      if (data.success) {
        setSelectedTicket(data.ticket);
        setMessages(data.messages || []);
        setUserLiveData(data.userLiveData || null);
        setNewStatus(data.ticket.status);
        setNewPriority(data.ticket.priority);
      }
    } catch (err) {
      console.error('[SupportCenterAdminView] Error loading detail:', err);
    } finally {
      setIsLoadingDetail(false);
    }
  };

  // Submit Admin Reply
  const handleAdminReplySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !replyMessage.trim() || isSubmittingReply) return;

    setIsSubmittingReply(true);
    setFormFeedback(null);

    try {
      const res = await fetch(`/api/support/admin/tickets/${selectedTicket.publicTicketId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: replyMessage.trim(),
          isInternalNote,
          status: newStatus !== selectedTicket.status ? newStatus : undefined,
          priority: newPriority !== selectedTicket.priority ? newPriority : undefined,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setFormFeedback({ type: 'success', text: 'Reply dispatched successfully.' });
        setReplyMessage('');
        setIsInternalNote(false);
        // Refresh detail
        openTicketDetail(selectedTicket);
        fetchAdminTickets();
      } else {
        setFormFeedback({ type: 'error', text: data.message || 'Failed to dispatch reply.' });
      }
    } catch (err) {
      console.error('[SupportCenterAdminView] Reply error:', err);
      setFormFeedback({ type: 'error', text: 'Server error sending reply.' });
    } finally {
      setIsSubmittingReply(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'OPEN':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/15 border border-amber-500/30 text-amber-400">OPEN</span>;
      case 'IN_PROGRESS':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#00CFFF]/15 border border-[#00CFFF]/30 text-[#00CFFF]">IN PROGRESS</span>;
      case 'WAITING_FOR_USER':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-purple-500/15 border border-purple-500/30 text-purple-400">WAITING USER</span>;
      case 'RESOLVED':
      case 'CLOSED':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">RESOLVED</span>;
      case 'ESCALATED':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-rose-500/15 border border-rose-500/30 text-rose-400">ESCALATED</span>;
      default:
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-800 text-slate-400">{status}</span>;
    }
  };

  const getPriorityBadge = (p: string) => {
    switch (p) {
      case 'URGENT':
        return <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-rose-500/20 text-rose-400 border border-rose-500/40">URGENT</span>;
      case 'HIGH':
        return <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-amber-500/20 text-amber-400 border border-amber-500/40">HIGH</span>;
      case 'MEDIUM':
        return <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-[#00CFFF]/20 text-[#00CFFF] border border-[#00CFFF]/40">MEDIUM</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-slate-800 text-slate-400">LOW</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="p-6 rounded-2xl bg-[#07101D] border border-white/[0.08] shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <HelpCircle className="w-5 h-5 text-[#00CFFF]" />
            <h1 className="text-lg font-bold text-white font-mono uppercase">
              PHIVONEX Support Center — Admin Inbox &amp; Case Queue
            </h1>
          </div>
          <p className="text-xs text-[#98A2B3] max-w-3xl leading-relaxed font-mono">
            Manage user support cases, inspect automated diagnoses against live ledger states, reply directly to users, or record internal administrative notes.
          </p>
        </div>

        <button
          onClick={fetchAdminTickets}
          className="px-4 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-xs font-mono text-white flex items-center gap-2 transition-colors cursor-pointer w-fit"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Refresh Queue</span>
        </button>
      </div>

      {/* Stats Cards Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div
          onClick={() => setTicketStatusFilter('OPEN')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            statusFilter === 'OPEN'
              ? 'bg-amber-500/10 border-amber-500/40'
              : 'bg-[#05070B] border-white/[0.08] hover:border-amber-500/30'
          }`}
        >
          <span className="text-[10px] font-mono text-[#98A2B3] uppercase block">Open Inquiries</span>
          <div className="text-2xl font-bold font-mono text-amber-400 mt-1">{stats.openCount}</div>
        </div>

        <div
          onClick={() => setTicketStatusFilter('IN_PROGRESS')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            statusFilter === 'IN_PROGRESS'
              ? 'bg-[#00CFFF]/10 border-[#00CFFF]/40'
              : 'bg-[#05070B] border-white/[0.08] hover:border-[#00CFFF]/30'
          }`}
        >
          <span className="text-[10px] font-mono text-[#98A2B3] uppercase block">In Progress</span>
          <div className="text-2xl font-bold font-mono text-[#00CFFF] mt-1">{stats.inProgressCount}</div>
        </div>

        <div
          onClick={() => setTicketStatusFilter('WAITING_FOR_USER')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            statusFilter === 'WAITING_FOR_USER'
              ? 'bg-purple-500/10 border-purple-500/40'
              : 'bg-[#05070B] border-white/[0.08] hover:border-purple-500/30'
          }`}
        >
          <span className="text-[10px] font-mono text-[#98A2B3] uppercase block">Waiting for User</span>
          <div className="text-2xl font-bold font-mono text-purple-400 mt-1">{stats.waitingCount}</div>
        </div>

        <div
          onClick={() => setTicketStatusFilter('RESOLVED')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            statusFilter === 'RESOLVED'
              ? 'bg-emerald-500/10 border-emerald-500/40'
              : 'bg-[#05070B] border-white/[0.08] hover:border-emerald-500/30'
          }`}
        >
          <span className="text-[10px] font-mono text-[#98A2B3] uppercase block">Resolved Cases</span>
          <div className="text-2xl font-bold font-mono text-emerald-400 mt-1">{stats.resolvedCount}</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 rounded-2xl bg-[#05070B] border border-white/[0.08] shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            fetchAdminTickets();
          }}
          className="relative flex-1 w-full"
        >
          <Search className="w-4 h-4 text-[#667085] absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by ticket ID, user email, public ID, or subject..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#07101D] border border-white/[0.1] focus:border-[#00CFFF] text-white text-xs font-mono placeholder:text-slate-500 focus:outline-none transition-all"
          />
        </form>

        <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar w-full sm:w-auto pb-1 sm:pb-0">
          {(['ALL', 'OPEN', 'IN_PROGRESS', 'WAITING_FOR_USER', 'RESOLVED', 'ESCALATED'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setTicketStatusFilter(st)}
              className={`px-3 py-1.5 rounded-xl text-[10px] font-mono font-bold transition-all cursor-pointer whitespace-nowrap ${
                statusFilter === st
                  ? 'bg-[#00CFFF] text-slate-950 shadow-md shadow-[#00CFFF]/20'
                  : 'bg-white/[0.04] text-[#98A2B3] hover:text-white'
              }`}
            >
              {st.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Tickets Queue Table */}
      <div className="rounded-2xl bg-[#05070B] border border-white/[0.08] shadow-xl overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-xs font-mono text-[#98A2B3]">
            <RefreshCw className="w-6 h-6 animate-spin text-[#00CFFF] mx-auto mb-2" />
            <p>Fetching support tickets queue...</p>
          </div>
        ) : tickets.length === 0 ? (
          <div className="p-12 text-center text-xs font-mono text-[#98A2B3] space-y-2">
            <HelpCircle className="w-8 h-8 text-slate-600 mx-auto" />
            <p className="font-bold text-white text-sm">No Support Cases Found</p>
            <p className="text-[#667085]">There are no support cases matching your selected filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left border-collapse font-mono text-xs">
              <thead>
                <tr className="border-b border-white/[0.08] bg-[#07101D] text-[#98A2B3] text-[10px] uppercase">
                  <th className="p-4 font-bold">Ticket ID</th>
                  <th className="p-4 font-bold">User Account</th>
                  <th className="p-4 font-bold">Category</th>
                  <th className="p-4 font-bold">Subject</th>
                  <th className="p-4 font-bold">Priority</th>
                  <th className="p-4 font-bold">Status</th>
                  <th className="p-4 font-bold">Updated</th>
                  <th className="p-4 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04] text-slate-300">
                {tickets.map((t) => (
                  <tr key={t.publicTicketId} className="hover:bg-white/[0.02] transition-colors">
                    <td className="p-4 font-bold text-[#00CFFF]">#{t.publicTicketId}</td>
                    <td className="p-4">
                      <span className="block font-bold text-white">{t.userPublicId || 'User'}</span>
                      <span className="block text-[10px] text-[#667085]">{t.userEmail}</span>
                    </td>
                    <td className="p-4">
                      <span className="px-2 py-0.5 rounded bg-white/[0.06] text-[10px] text-slate-200">
                        {t.category}
                      </span>
                    </td>
                    <td className="p-4 max-w-xs truncate">
                      <span className="font-bold text-white block truncate">{t.subject}</span>
                      <span className="text-[10px] text-[#667085] block truncate">{t.latestMessageSnippet || t.userMessage}</span>
                    </td>
                    <td className="p-4">{getPriorityBadge(t.priority)}</td>
                    <td className="p-4">{getStatusBadge(t.status)}</td>
                    <td className="p-4 text-[10px] text-[#667085]">
                      {new Date(t.updatedAt).toLocaleString()}
                    </td>
                    <td className="p-4 text-right">
                      <button
                        onClick={() => openTicketDetail(t)}
                        className="px-3 py-1.5 rounded-lg bg-[#00CFFF]/15 hover:bg-[#00CFFF]/25 border border-[#00CFFF]/30 text-[#00CFFF] text-[10px] font-bold transition-all cursor-pointer inline-flex items-center gap-1"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Inspect &amp; Reply</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ====================================================================
          INSPECT TICKET & REPLY DRAWER MODAL
         ==================================================================== */}
      {selectedTicket && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-4xl bg-[#07101D] border border-white/[0.1] rounded-2xl shadow-2xl overflow-hidden space-y-0 animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="p-5 border-b border-white/[0.08] flex items-center justify-between bg-[#05070B] shrink-0">
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-[#00CFFF]">
                    #{selectedTicket.publicTicketId}
                  </span>
                  {getStatusBadge(selectedTicket.status)}
                  {getPriorityBadge(selectedTicket.priority)}
                </div>
                <h2 className="text-base font-bold text-white truncate font-mono">
                  {selectedTicket.subject}
                </h2>
              </div>
              <button
                onClick={() => setSelectedTicket(null)}
                className="p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-[#98A2B3] hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content Body */}
            <div className="grid grid-cols-1 lg:grid-cols-12 flex-1 overflow-hidden">
              {/* Left Column: Conversation Thread & Admin Reply */}
              <div className="lg:col-span-7 p-5 space-y-4 overflow-y-auto custom-scrollbar border-r border-white/[0.08] bg-[#05070B]">
                {/* Diagnosis Summary */}
                {selectedTicket.automatedDiagnosisSummary && (
                  <div className="p-3.5 rounded-xl bg-[#0A1628] border border-white/[0.08] space-y-1 font-mono">
                    <span className="text-[10px] font-bold text-[#00CFFF] uppercase tracking-wider block">
                      Automated System Diagnosis:
                    </span>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      {selectedTicket.automatedDiagnosisSummary}
                    </p>
                  </div>
                )}

                {/* Conversation History */}
                <div className="space-y-3">
                  <span className="text-[10px] font-mono text-[#98A2B3] uppercase tracking-wider block">
                    Conversation Thread:
                  </span>

                  {isLoadingDetail ? (
                    <div className="py-8 text-center text-xs font-mono text-[#98A2B3]">
                      <RefreshCw className="w-5 h-5 animate-spin text-[#00CFFF] mx-auto mb-1" />
                      <p>Loading conversation and live context...</p>
                    </div>
                  ) : (
                    messages.map((msg) => {
                      const isUser = msg.senderType === 'USER';
                      const isNote = msg.isInternalNote;

                      return (
                        <div
                          key={msg.id}
                          className={`p-4 rounded-2xl text-xs font-mono leading-relaxed space-y-1 ${
                            isNote
                              ? 'bg-amber-500/10 border border-amber-500/30 text-amber-200'
                              : isUser
                              ? 'bg-[#0A1628] border border-white/[0.08] text-slate-200'
                              : 'bg-[#00CFFF]/10 border border-[#00CFFF]/30 text-white'
                          }`}
                        >
                          <div className="flex items-center justify-between text-[10px] text-[#667085] pb-1 border-b border-white/[0.04]">
                            <span className="font-bold text-white flex items-center gap-1.5">
                              {isNote && <Lock className="w-3 h-3 text-amber-400" />}
                              <span>{msg.senderPublicName}</span>
                            </span>
                            <span>{new Date(msg.createdAt).toLocaleString()}</span>
                          </div>
                          <p className="pt-1 whitespace-pre-wrap">{msg.message}</p>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Admin Reply Form */}
                <form onSubmit={handleAdminReplySubmit} className="pt-4 border-t border-white/[0.08] space-y-3">
                  <span className="text-[10px] font-mono text-[#98A2B3] uppercase tracking-wider block">
                    Dispatch Specialist Reply / Internal Note:
                  </span>

                  {feedback && (
                    <div
                      className={`p-3 rounded-xl border text-xs font-mono ${
                        feedback.type === 'success'
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                          : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                      }`}
                    >
                      {feedback.text}
                    </div>
                  )}

                  <textarea
                    value={replyMessage}
                    onChange={(e) => setReplyMessage(e.target.value)}
                    placeholder="Type your response to the user or internal admin note..."
                    rows={4}
                    required
                    className="w-full p-3 rounded-xl bg-[#07101D] border border-white/[0.1] focus:border-[#00CFFF] text-white text-xs font-mono placeholder:text-slate-500 focus:outline-none transition-all resize-none"
                  />

                  {/* Status & Priority Controls */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-mono text-[#98A2B3] block mb-1">Update Status</label>
                      <select
                        value={newStatus}
                        onChange={(e) => setNewStatus(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-[#07101D] border border-white/[0.1] text-white text-xs font-mono focus:outline-none cursor-pointer"
                      >
                        <option value="OPEN">OPEN</option>
                        <option value="IN_PROGRESS">IN_PROGRESS</option>
                        <option value="WAITING_FOR_USER">WAITING_FOR_USER</option>
                        <option value="RESOLVED">RESOLVED</option>
                        <option value="CLOSED">CLOSED</option>
                        <option value="ESCALATED">ESCALATED</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] font-mono text-[#98A2B3] block mb-1">Assign Priority</label>
                      <select
                        value={newPriority}
                        onChange={(e) => setNewPriority(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-[#07101D] border border-white/[0.1] text-white text-xs font-mono focus:outline-none cursor-pointer"
                      >
                        <option value="LOW">LOW</option>
                        <option value="MEDIUM">MEDIUM</option>
                        <option value="HIGH">HIGH</option>
                        <option value="URGENT">URGENT</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isInternalNote}
                        onChange={(e) => setIsInternalNote(e.target.checked)}
                        className="rounded border-white/[0.2] bg-[#07101D] text-amber-500 focus:ring-0 cursor-pointer"
                      />
                      <span className="text-xs font-mono text-amber-400 font-bold flex items-center gap-1">
                        <Lock className="w-3.5 h-3.5" />
                        <span>Internal Admin Note (Hidden from User)</span>
                      </span>
                    </label>

                    <button
                      type="submit"
                      disabled={!replyMessage.trim() || isSubmittingReply}
                      className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#00CFFF] via-[#00A3FF] to-emerald-400 hover:brightness-110 text-slate-950 font-bold text-xs flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                    >
                      {isSubmittingReply ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      <span>{isInternalNote ? 'Save Note' : 'Send Reply'}</span>
                    </button>
                  </div>
                </form>
              </div>

              {/* Right Column: User Live Context & Summary */}
              <div className="lg:col-span-5 p-5 space-y-4 overflow-y-auto custom-scrollbar bg-[#07101D]">
                <div className="space-y-1">
                  <span className="text-[10px] font-mono text-[#98A2B3] uppercase tracking-wider block">
                    Authenticated User Summary:
                  </span>
                  <div className="p-3 rounded-xl bg-[#05070B] border border-white/[0.06] space-y-1 font-mono text-xs">
                    <div className="flex justify-between">
                      <span className="text-[#98A2B3]">Public ID:</span>
                      <span className="font-bold text-white">{selectedTicket.userPublicId || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#98A2B3]">Email:</span>
                      <span className="font-bold text-white">{selectedTicket.userEmail}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#98A2B3]">Name:</span>
                      <span className="font-bold text-white">{selectedTicket.userDisplayName || 'User'}</span>
                    </div>
                  </div>
                </div>

                {/* Safe User Live Balances */}
                {userLiveData && (
                  <div className="space-y-3 font-mono text-xs">
                    <span className="text-[10px] text-[#98A2B3] uppercase tracking-wider block">
                      Live Dashboard Ledger States:
                    </span>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="p-3 rounded-xl bg-[#05070B] border border-white/[0.06]">
                        <span className="text-[9px] text-[#98A2B3] uppercase block">Deposit Balance</span>
                        <span className="font-bold text-emerald-400 text-sm">
                          ${userLiveData.balances.availableDepositBalanceUsd.toFixed(2)}
                        </span>
                      </div>

                      <div className="p-3 rounded-xl bg-[#05070B] border border-white/[0.06]">
                        <span className="text-[9px] text-[#98A2B3] uppercase block">PHIVO Coins</span>
                        <span className="font-bold text-[#00CFFF] text-sm">
                          {userLiveData.balances.phivoCoinBalance.toFixed(2)}
                        </span>
                      </div>
                    </div>

                    {/* Active Nodes */}
                    <div className="p-3 rounded-xl bg-[#05070B] border border-white/[0.06] space-y-1">
                      <span className="text-[10px] text-[#98A2B3] uppercase block">Active Genesis Nodes</span>
                      <div className="flex items-center justify-between text-xs font-bold text-white">
                        <span>{userLiveData.nodes.activeNodeCount} Active Node(s)</span>
                        <span className="text-amber-400">{userLiveData.nodes.distributedPhivo} Distributed</span>
                      </div>
                    </div>

                    {/* Recent Withdrawals Context */}
                    <div className="space-y-1">
                      <span className="text-[10px] text-[#98A2B3] uppercase block">Recent Withdrawals:</span>
                      {userLiveData.withdrawals.length === 0 ? (
                        <p className="text-[10px] text-slate-500 italic">No recent withdrawal records.</p>
                      ) : (
                        <div className="space-y-1.5">
                          {userLiveData.withdrawals.map((w) => (
                            <div key={w.publicWithdrawalId} className="p-2.5 rounded-xl bg-[#05070B] border border-white/[0.06] text-[11px] space-y-1">
                              <div className="flex justify-between font-bold">
                                <span className="text-[#00CFFF]">{w.publicWithdrawalId}</span>
                                <span className="text-emerald-400">${w.amount} USDT</span>
                              </div>
                              <div className="flex justify-between text-[10px] text-[#98A2B3]">
                                <span>Status: {w.status}</span>
                                <span>{new Date(w.requestedAt).toLocaleDateString()}</span>
                              </div>
                              {w.txHash && (
                                <p className="text-[9px] font-mono text-[#667085] truncate">
                                  Tx: {w.txHash}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
