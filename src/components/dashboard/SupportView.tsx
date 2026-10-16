import React, { useState, useEffect, useRef } from 'react';
import {
  HelpCircle,
  MessageSquare,
  Send,
  Ticket,
  Clock,
  CheckCircle2,
  AlertTriangle,
  FileText,
  ChevronRight,
  Shield,
  Search,
  PlusCircle,
  RefreshCw,
  X,
  Zap,
  ArrowRight,
  AlertCircle,
  Lock,
} from 'lucide-react';

interface SupportViewProps {
  displayName?: string;
  email?: string;
}

interface ChatMessage {
  id: string;
  sender: 'USER' | 'SUPPORT';
  text: string;
  timestamp: string;
  createdTicketPublicId?: string;
  shouldEscalate?: boolean;
}

interface TicketRecord {
  id: string;
  publicTicketId: string;
  category: string;
  subject: string;
  userMessage: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'WAITING_FOR_USER' | 'RESOLVED' | 'CLOSED' | 'ESCALATED';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  relatedEntityType?: string | null;
  relatedPublicReference?: string | null;
  automatedDiagnosisSummary?: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string | null;
  messageCount?: number;
  latestMessageSnippet?: string;
}

interface TicketMessageRecord {
  id: string;
  ticketId: string;
  senderType: 'USER' | 'SUPPORT' | 'ADMIN';
  senderPublicName: string;
  message: string;
  createdAt: string;
}

export const SupportView: React.FC<SupportViewProps> = ({ displayName, email }) => {
  const [activeTab, setActiveTab] = useState<'CHAT' | 'TICKETS'>('CHAT');
  
  // Chat State
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [inputPrompt, setInputPrompt] = useState('');
  const [isSending, setIsSending] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Tickets State
  const [tickets, setTickets] = useState<TicketRecord[]>([]);
  const [ticketFilter, setTicketFilter] = useState<'ALL' | 'OPEN' | 'IN_PROGRESS' | 'WAITING' | 'RESOLVED'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoadingTickets, setIsLoadingTickets] = useState(false);

  // Selected Ticket Thread Modal State
  const [selectedTicket, setSelectedTicket] = useState<TicketRecord | null>(null);
  const [ticketMessages, setTicketMessages] = useState<TicketMessageRecord[]>([]);
  const [replyText, setReplyText] = useState('');
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [isLoadingThread, setIsLoadingThread] = useState(false);

  // Create Manual Ticket Modal
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newCategory, setNewCategory] = useState('Withdrawal');
  const [newSubject, setNewSubject] = useState('');
  const [newMessageText, setNewMessageText] = useState('');
  const [newReference, setNewReference] = useState('');
  const [isSubmittingTicket, setIsSubmittingTicket] = useState(false);
  const [formFeedback, setFormFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Initialize Welcome Message
  useEffect(() => {
    if (chatMessages.length === 0) {
      setChatMessages([
        {
          id: 'welcome-msg',
          sender: 'SUPPORT',
          text: `Hello ${displayName || email || 'Valued Member'}. Welcome to PHIVONEX Support.\nHow can we help you today?`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    }
  }, [displayName, email]);

  // Auto scroll chat
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, isSending]);

  // Load User Tickets
  const fetchUserTickets = async () => {
    setIsLoadingTickets(true);
    try {
      const res = await fetch('/api/support/tickets');
      const data = await res.json();
      if (data.success && Array.isArray(data.tickets)) {
        setTickets(data.tickets);
      }
    } catch (err) {
      console.error('[SupportView] Error fetching tickets:', err);
    } finally {
      setIsLoadingTickets(false);
    }
  };

  useEffect(() => {
    fetchUserTickets();
  }, []);

  // Fetch ticket message thread
  const openTicketThread = async (ticket: TicketRecord) => {
    setSelectedTicket(ticket);
    setIsLoadingThread(true);
    try {
      const res = await fetch(`/api/support/tickets/${ticket.publicTicketId}`);
      const data = await res.json();
      if (data.success) {
        setSelectedTicket(data.ticket);
        setTicketMessages(data.messages || []);
      }
    } catch (err) {
      console.error('[SupportView] Error loading thread:', err);
    } finally {
      setIsLoadingThread(false);
    }
  };

  // Send Chat Message
  const handleSendChat = async (overridePrompt?: string) => {
    const query = (overridePrompt || inputPrompt).trim();
    if (!query || isSending) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'USER',
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setChatMessages((prev) => [...prev, userMsg]);
    setInputPrompt('');
    setIsSending(true);

    try {
      const history = chatMessages.slice(-6).map((m) => ({
        sender: m.sender,
        text: m.text,
      }));

      const res = await fetch('/api/support/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: query,
          conversationHistory: history,
        }),
      });

      const data = await res.json();

      if (data.success && data.response) {
        const supportMsg: ChatMessage = {
          id: `support-${Date.now()}`,
          sender: 'SUPPORT',
          text: data.response.responseText,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          createdTicketPublicId: data.response.createdTicketPublicId,
          shouldEscalate: data.response.shouldEscalate,
        };
        setChatMessages((prev) => [...prev, supportMsg]);

        if (data.response.createdTicketPublicId) {
          fetchUserTickets();
        }
      } else {
        setChatMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            sender: 'SUPPORT',
            text: 'I couldn’t verify enough information to resolve this safely. I’ve created a support request for review by a PHIVONEX support specialist.',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ]);
      }
    } catch (err) {
      console.error('[SupportView] Chat error:', err);
      setChatMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          sender: 'SUPPORT',
          text: 'Network response delayed. If your issue persists, please submit a Support Ticket directly.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  // Send Ticket Thread Reply
  const handleSendTicketReply = async () => {
    if (!selectedTicket || !replyText.trim() || isSendingReply) return;

    setIsSendingReply(true);
    try {
      const res = await fetch(`/api/support/tickets/${selectedTicket.publicTicketId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: replyText.trim() }),
      });

      const data = await res.json();
      if (data.success && data.message) {
        setTicketMessages((prev) => [...prev, data.message]);
        setReplyText('');
        fetchUserTickets();
      }
    } catch (err) {
      console.error('[SupportView] Reply error:', err);
    } finally {
      setIsSendingReply(false);
    }
  };

  // Handle Manual Ticket Submit
  const handleCreateTicketSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessageText.trim() || !newSubject.trim() || isSubmittingTicket) return;

    setIsSubmittingTicket(true);
    setFormFeedback(null);

    try {
      const res = await fetch('/api/support/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: newCategory,
          subject: newSubject.trim(),
          message: newMessageText.trim(),
          relatedPublicReference: newReference.trim() || null,
        }),
      });

      const data = await res.json();
      if (data.success && data.ticket) {
        setFormFeedback({ type: 'success', text: `Support Request #${data.ticket.publicTicketId} created successfully.` });
        setNewSubject('');
        setNewMessageText('');
        setNewReference('');
        fetchUserTickets();
        setTimeout(() => {
          setIsCreateModalOpen(false);
          setFormFeedback(null);
          setActiveTab('TICKETS');
        }, 1500);
      } else {
        setFormFeedback({ type: 'error', text: data.message || 'Failed to submit support request.' });
      }
    } catch (err) {
      console.error('[SupportView] Submit ticket error:', err);
      setFormFeedback({ type: 'error', text: 'Server error. Please try again.' });
    } finally {
      setIsSubmittingTicket(false);
    }
  };

  // Filtered Tickets
  const filteredTickets = tickets.filter((t) => {
    if (ticketFilter === 'OPEN' && t.status !== 'OPEN') return false;
    if (ticketFilter === 'IN_PROGRESS' && t.status !== 'IN_PROGRESS') return false;
    if (ticketFilter === 'WAITING' && t.status !== 'WAITING_FOR_USER') return false;
    if (ticketFilter === 'RESOLVED' && t.status !== 'RESOLVED' && t.status !== 'CLOSED') return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        t.publicTicketId.toLowerCase().includes(q) ||
        t.subject.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q) ||
        t.userMessage.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'OPEN':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/15 border border-amber-500/30 text-amber-400">Open — In Queue</span>;
      case 'IN_PROGRESS':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#00CFFF]/15 border border-[#00CFFF]/30 text-[#00CFFF]">In Progress — Under Review</span>;
      case 'WAITING_FOR_USER':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-purple-500/15 border border-purple-500/30 text-purple-400">Waiting for Your Reply</span>;
      case 'RESOLVED':
      case 'CLOSED':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">Resolved</span>;
      case 'ESCALATED':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-rose-500/15 border border-rose-500/30 text-rose-400">Escalated to Specialist</span>;
      default:
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-800 text-slate-400">{status}</span>;
    }
  };

  const quickActionChips = [
    { label: 'Withdrawal Status', query: 'What is the status of my withdrawal request?' },
    { label: 'Deposit Status', query: 'Can you check my recent deposit status?' },
    { label: 'Node & Rewards', query: 'How do Genesis Node daily rewards work?' },
    { label: 'Wallet Balance', query: 'Show me a breakdown of my wallet balances.' },
    { label: 'Referral & Matching', query: 'Explain direct referral and binary matching rules.' },
    { label: 'Account & Security', query: 'How do I manage my 2FA TOTP security?' },
    { label: 'Other Issue', query: 'I have a technical question or issue.' },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Top Header Banner */}
      <div className="p-6 sm:p-8 rounded-2xl bg-gradient-to-r from-[#07101D] via-[#0B172B] to-[#07101D] border border-white/[0.08] shadow-2xl relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-2 z-10">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-[#00CFFF]/20 to-[#00A3FF]/10 border border-[#00CFFF]/30 text-[#00CFFF] shadow-md shadow-[#00CFFF]/10">
              <HelpCircle className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight font-mono uppercase">
                PHIVONEX Support Center
              </h1>
              <p className="text-xs text-[#98A2B3] font-mono">
                Official Help &amp; Case Resolution Channel • Live Status Verification &amp; Ticket Escalation
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3 z-10">
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#00CFFF] via-[#00A3FF] to-emerald-400 hover:brightness-110 text-slate-950 font-bold text-xs flex items-center gap-2 transition-all cursor-pointer shadow-lg shadow-[#00CFFF]/20 min-h-[42px]"
          >
            <PlusCircle className="w-4 h-4" />
            <span>New Support Request</span>
          </button>
        </div>

        <div className="absolute top-0 right-0 w-80 h-full bg-[#00CFFF]/[0.02] blur-3xl pointer-events-none" />
      </div>

      {/* Primary Navigation Tabs */}
      <div className="flex items-center justify-between border-b border-white/[0.08] pb-1">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('CHAT')}
            className={`px-5 py-3 text-xs font-bold font-mono transition-all rounded-xl cursor-pointer flex items-center gap-2 ${
              activeTab === 'CHAT'
                ? 'bg-[#00CFFF]/15 border border-[#00CFFF]/30 text-[#00CFFF] shadow-md shadow-[#00CFFF]/10'
                : 'text-[#98A2B3] hover:text-white hover:bg-white/[0.04]'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span>Support Channel</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('TICKETS');
              fetchUserTickets();
            }}
            className={`px-5 py-3 text-xs font-bold font-mono transition-all rounded-xl cursor-pointer flex items-center gap-2 relative ${
              activeTab === 'TICKETS'
                ? 'bg-[#00CFFF]/15 border border-[#00CFFF]/30 text-[#00CFFF] shadow-md shadow-[#00CFFF]/10'
                : 'text-[#98A2B3] hover:text-white hover:bg-white/[0.04]'
            }`}
          >
            <Ticket className="w-4 h-4" />
            <span>My Support Requests</span>
            {tickets.length > 0 && (
              <span className="ml-1.5 px-2 py-0.5 text-[10px] rounded-full bg-white/10 text-white font-mono">
                {tickets.length}
              </span>
            )}
          </button>
        </div>

        <button
          onClick={fetchUserTickets}
          title="Refresh Support Queue"
          className="p-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-[#98A2B3] hover:text-white transition-colors cursor-pointer"
        >
          <RefreshCw className={`w-4 h-4 ${isLoadingTickets ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* ====================================================================
          TAB 1: LIVE SUPPORT CHANNEL (CHAT)
         ==================================================================== */}
      {activeTab === 'CHAT' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Main Chat Interface */}
          <div className="lg:col-span-8 p-5 sm:p-6 rounded-2xl bg-[#05070B] border border-white/[0.08] shadow-xl flex flex-col justify-between min-h-[580px] space-y-4">
            {/* Quick Action Chips */}
            <div className="space-y-2 border-b border-white/[0.06] pb-4">
              <span className="text-[10px] font-mono text-[#98A2B3] uppercase tracking-wider block">
                Quick Topics &amp; Inquiries:
              </span>
              <div className="flex flex-wrap gap-2">
                {quickActionChips.map((chip) => (
                  <button
                    key={chip.label}
                    onClick={() => handleSendChat(chip.query)}
                    disabled={isSending}
                    className="px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-[#00CFFF]/10 border border-white/[0.08] hover:border-[#00CFFF]/30 text-xs font-mono text-[#98A2B3] hover:text-[#00CFFF] transition-all cursor-pointer disabled:opacity-50"
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Conversation Messages Thread */}
            <div className="space-y-4 max-h-[420px] overflow-y-auto pr-2 custom-scrollbar flex-1">
              {chatMessages.map((msg) => {
                const isUser = msg.sender === 'USER';
                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} space-y-1`}
                  >
                    <div className="flex items-center gap-2 text-[10px] font-mono text-[#667085] px-1">
                      <span>{isUser ? 'You' : 'PHIVONEX Support'}</span>
                      <span>•</span>
                      <span>{msg.timestamp}</span>
                    </div>

                    <div
                      className={`max-w-xl p-4 rounded-2xl text-xs leading-relaxed whitespace-pre-wrap ${
                        isUser
                          ? 'bg-[#00CFFF]/15 border border-[#00CFFF]/30 text-white rounded-tr-none shadow-md shadow-[#00CFFF]/5'
                          : 'bg-[#0A1220] border border-white/[0.08] text-slate-200 rounded-tl-none shadow-md'
                      }`}
                    >
                      {msg.text}

                      {/* Escalation Ticket Card callout */}
                      {msg.createdTicketPublicId && (
                        <div className="mt-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-2 text-left">
                          <div className="flex items-center gap-2 text-amber-400 font-mono font-bold text-xs">
                            <Ticket className="w-4 h-4 shrink-0" />
                            <span>Support Request #${msg.createdTicketPublicId} Created</span>
                          </div>
                          <p className="text-[11px] text-slate-300 font-mono leading-tight">
                            A PHIVONEX support specialist will review this case. You can track progress or add updates in "My Support Requests".
                          </p>
                          <button
                            onClick={() => {
                              setActiveTab('TICKETS');
                              fetchUserTickets();
                            }}
                            className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-mono text-[10px] font-bold flex items-center gap-1 transition-all cursor-pointer"
                          >
                            <span>View Ticket #{msg.createdTicketPublicId}</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {isSending && (
                <div className="flex items-center gap-2.5 text-xs text-[#00CFFF] font-mono p-3 rounded-xl bg-[#0A1220] border border-white/[0.06] w-fit">
                  <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
                  <span>Checking PHIVONEX system records...</span>
                </div>
              )}

              <div ref={chatBottomRef} />
            </div>

            {/* Input Box */}
            <div className="pt-3 border-t border-white/[0.08] space-y-2">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendChat();
                }}
                className="flex items-center gap-2"
              >
                <input
                  type="text"
                  value={inputPrompt}
                  onChange={(e) => setInputPrompt(e.target.value)}
                  placeholder="Describe your inquiry (e.g. withdrawal status, deposit, node rewards)..."
                  disabled={isSending}
                  className="flex-1 px-4 py-3 rounded-xl bg-[#07101D] border border-white/[0.1] focus:border-[#00CFFF] text-white text-xs font-mono placeholder:text-slate-500 focus:outline-none transition-all disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={!inputPrompt.trim() || isSending}
                  className="px-5 py-3 rounded-xl bg-gradient-to-r from-[#00CFFF] via-[#00A3FF] to-emerald-400 hover:brightness-110 text-slate-950 font-bold text-xs flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50 min-h-[42px]"
                >
                  <Send className="w-4 h-4" />
                  <span className="hidden sm:inline">Send</span>
                </button>
              </form>

              <div className="flex items-center justify-between text-[10px] text-[#667085] font-mono px-1">
                <span>Verified by PHIVONEX Support Engine</span>
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(true)}
                  className="text-[#00CFFF] hover:underline cursor-pointer"
                >
                  Need direct human escalation? Create Ticket &rarr;
                </button>
              </div>
            </div>
          </div>

          {/* Right Info Box */}
          <div className="lg:col-span-4 space-y-4">
            <div className="p-5 rounded-2xl bg-[#05070B] border border-white/[0.08] space-y-4 shadow-xl">
              <div className="flex items-center gap-2 text-xs font-mono font-bold text-white uppercase tracking-wider">
                <Shield className="w-4 h-4 text-[#00CFFF]" />
                <span>PHIVONEX Support Standards</span>
              </div>

              <div className="space-y-3 text-xs text-[#98A2B3] leading-relaxed font-mono">
                <div className="p-3 rounded-xl bg-[#07101D] border border-white/[0.06] space-y-1">
                  <span className="font-bold text-white block text-[11px]">Real-time Verification</span>
                  <p className="text-[10px]">
                    Responses are verified live against your authenticated dashboard ledger, active node allocations, and blockchain transaction status.
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-[#07101D] border border-white/[0.06] space-y-1">
                  <span className="font-bold text-white block text-[11px]">Automatic Ticket Escalation</span>
                  <p className="text-[10px]">
                    If an inquiry requires manual review or cannot be confirmed with absolute certainty, a support ticket is automatically created for a PHIVONEX specialist.
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-[#07101D] border border-white/[0.06] space-y-1">
                  <span className="font-bold text-white block text-[11px]">Read-Only Financial Safety</span>
                  <p className="text-[10px]">
                    Support channels operate strictly read-only for financial operations. Your wallet balances and node allocations are fully protected.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          TAB 2: MY SUPPORT REQUESTS (TICKETS LIST)
         ==================================================================== */}
      {activeTab === 'TICKETS' && (
        <div className="space-y-4">
          {/* Search & Filter Bar */}
          <div className="p-4 rounded-2xl bg-[#05070B] border border-white/[0.08] shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="relative flex-1 w-full sm:w-auto">
              <Search className="w-4 h-4 text-[#667085] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search requests by ticket ID, subject, or message..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#07101D] border border-white/[0.1] focus:border-[#00CFFF] text-white text-xs font-mono placeholder:text-slate-500 focus:outline-none transition-all"
              />
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar w-full sm:w-auto pb-1 sm:pb-0">
              {(['ALL', 'OPEN', 'IN_PROGRESS', 'WAITING', 'RESOLVED'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setTicketFilter(f)}
                  className={`px-3 py-1.5 rounded-xl text-[10px] font-mono font-bold transition-all cursor-pointer whitespace-nowrap ${
                    ticketFilter === f
                      ? 'bg-[#00CFFF] text-slate-950 shadow-md shadow-[#00CFFF]/20'
                      : 'bg-white/[0.04] text-[#98A2B3] hover:text-white hover:bg-white/[0.08]'
                  }`}
                >
                  {f.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>

          {/* Tickets List */}
          {isLoadingTickets ? (
            <div className="p-12 text-center text-xs font-mono text-[#98A2B3] bg-[#05070B] rounded-2xl border border-white/[0.08] space-y-2">
              <RefreshCw className="w-6 h-6 animate-spin text-[#00CFFF] mx-auto" />
              <p>Loading support requests...</p>
            </div>
          ) : filteredTickets.length === 0 ? (
            <div className="p-12 text-center text-xs font-mono text-[#98A2B3] bg-[#05070B] rounded-2xl border border-white/[0.08] space-y-3">
              <Ticket className="w-10 h-10 text-slate-600 mx-auto" />
              <div className="space-y-1">
                <p className="font-bold text-white text-sm">No Support Requests Found</p>
                <p className="text-[#667085] max-w-sm mx-auto">
                  {searchQuery || ticketFilter !== 'ALL'
                    ? 'No requests match your selected filters.'
                    : 'You currently have no open or past support requests.'}
                </p>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="mt-2 px-4 py-2 rounded-xl bg-[#00CFFF]/20 hover:bg-[#00CFFF]/30 text-[#00CFFF] border border-[#00CFFF]/40 text-xs font-bold font-mono transition-all cursor-pointer inline-flex items-center gap-2"
              >
                <PlusCircle className="w-4 h-4" />
                <span>Create Support Request</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {filteredTickets.map((ticket) => (
                <div
                  key={ticket.publicTicketId}
                  onClick={() => openTicketThread(ticket)}
                  className="p-5 rounded-2xl bg-[#05070B] border border-white/[0.08] hover:border-[#00CFFF]/40 transition-all cursor-pointer space-y-3 group shadow-lg"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-mono font-bold text-[#00CFFF]">
                          #{ticket.publicTicketId}
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-white/[0.06] text-[10px] font-mono text-slate-300">
                          {ticket.category}
                        </span>
                        {getStatusBadge(ticket.status)}
                      </div>
                      <h3 className="text-sm font-bold text-white truncate font-mono">
                        {ticket.subject}
                      </h3>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-[10px] font-mono text-[#667085] block">
                        {new Date(ticket.updatedAt).toLocaleDateString()}
                      </span>
                      <ChevronRight className="w-4 h-4 text-[#667085] group-hover:text-[#00CFFF] ml-auto mt-1 transition-colors" />
                    </div>
                  </div>

                  <p className="text-xs text-[#98A2B3] font-mono line-clamp-2 leading-relaxed">
                    {ticket.latestMessageSnippet || ticket.userMessage}
                  </p>

                  <div className="flex items-center justify-between text-[10px] font-mono text-[#667085] pt-1 border-t border-white/[0.04]">
                    <span>Created: {new Date(ticket.createdAt).toLocaleString()}</span>
                    <span>{ticket.messageCount || 1} Message(s)</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ====================================================================
          TICKET THREAD MODAL
         ==================================================================== */}
      {selectedTicket && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-[#07101D] border border-white/[0.1] rounded-2xl shadow-2xl overflow-hidden space-y-0 animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-5 border-b border-white/[0.08] flex items-center justify-between bg-[#05070B]">
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-[#00CFFF]">
                    #{selectedTicket.publicTicketId}
                  </span>
                  {getStatusBadge(selectedTicket.status)}
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

            {/* Conversation Thread */}
            <div className="p-5 space-y-4 max-h-[420px] overflow-y-auto custom-scrollbar bg-[#05070B]">
              {/* Diagnosis Summary Banner if available */}
              {selectedTicket.automatedDiagnosisSummary && (
                <div className="p-3.5 rounded-xl bg-[#0A1628] border border-white/[0.08] space-y-1 font-mono">
                  <span className="text-[10px] font-bold text-[#00CFFF] uppercase tracking-wider block">
                    Automated Case Diagnosis Summary:
                  </span>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {selectedTicket.automatedDiagnosisSummary}
                  </p>
                </div>
              )}

              {isLoadingThread ? (
                <div className="py-8 text-center text-xs font-mono text-[#98A2B3]">
                  <RefreshCw className="w-5 h-5 animate-spin text-[#00CFFF] mx-auto mb-2" />
                  <p>Loading conversation thread...</p>
                </div>
              ) : (
                ticketMessages.map((msg) => {
                  const isUser = msg.senderType === 'USER';
                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} space-y-1`}
                    >
                      <div className="flex items-center gap-2 text-[10px] font-mono text-[#667085] px-1">
                        <span>{msg.senderPublicName || (isUser ? 'You' : 'PHIVONEX Support Specialist')}</span>
                        <span>•</span>
                        <span>{new Date(msg.createdAt).toLocaleString()}</span>
                      </div>

                      <div
                        className={`p-4 rounded-2xl text-xs leading-relaxed whitespace-pre-wrap max-w-lg ${
                          isUser
                            ? 'bg-[#00CFFF]/15 border border-[#00CFFF]/30 text-white rounded-tr-none'
                            : 'bg-[#0A1220] border border-white/[0.08] text-slate-200 rounded-tl-none'
                        }`}
                      >
                        {msg.message}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Reply Input Box */}
            <div className="p-4 border-t border-white/[0.08] bg-[#07101D] space-y-3">
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Type your reply to PHIVONEX Support..."
                rows={3}
                disabled={isSendingReply || selectedTicket.status === 'CLOSED'}
                className="w-full p-3 rounded-xl bg-[#05070B] border border-white/[0.1] focus:border-[#00CFFF] text-white text-xs font-mono placeholder:text-slate-500 focus:outline-none transition-all resize-none disabled:opacity-50"
              />

              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono text-[#667085]">
                  {selectedTicket.status === 'CLOSED'
                    ? 'This ticket is closed.'
                    : 'Your reply will immediately notify support specialists.'}
                </span>

                <button
                  type="button"
                  onClick={handleSendTicketReply}
                  disabled={!replyText.trim() || isSendingReply || selectedTicket.status === 'CLOSED'}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#00CFFF] via-[#00A3FF] to-emerald-400 hover:brightness-110 text-slate-950 font-bold text-xs flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                  <span>Send Reply</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          CREATE MANUAL SUPPORT TICKET MODAL
         ==================================================================== */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-[#07101D] border border-white/[0.1] rounded-2xl shadow-2xl overflow-hidden space-y-0 animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-5 border-b border-white/[0.08] flex items-center justify-between bg-[#05070B]">
              <div className="flex items-center gap-2.5">
                <PlusCircle className="w-5 h-5 text-[#00CFFF]" />
                <h2 className="text-base font-bold text-white font-mono">Create Support Request</h2>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-[#98A2B3] hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleCreateTicketSubmit} className="p-6 space-y-4">
              {formFeedback && (
                <div
                  className={`p-3.5 rounded-xl border text-xs font-mono flex items-center gap-2 ${
                    formFeedback.type === 'success'
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                      : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                  }`}
                >
                  {formFeedback.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                  )}
                  <span>{formFeedback.text}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-mono text-[#98A2B3] block">Category</label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#05070B] border border-white/[0.1] focus:border-[#00CFFF] text-white text-xs font-mono focus:outline-none transition-all cursor-pointer"
                >
                  <option value="Withdrawal">Withdrawal</option>
                  <option value="Deposit">Deposit</option>
                  <option value="Genesis Node">Genesis Node</option>
                  <option value="PHIVO Reward">PHIVO Reward</option>
                  <option value="Swap">Swap</option>
                  <option value="Referral">Referral</option>
                  <option value="Matching">Matching</option>
                  <option value="Promotion">Promotion</option>
                  <option value="Leadership">Leadership</option>
                  <option value="Account">Account / Security</option>
                  <option value="Technical Issue">Technical Issue</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-mono text-[#98A2B3] block">Subject</label>
                <input
                  type="text"
                  value={newSubject}
                  onChange={(e) => setNewSubject(e.target.value)}
                  placeholder="e.g. Withdrawal confirmation delay on BEP-20"
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#05070B] border border-white/[0.1] focus:border-[#00CFFF] text-white text-xs font-mono focus:outline-none transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-mono text-[#98A2B3] block">Related Reference (Optional)</label>
                <input
                  type="text"
                  value={newReference}
                  onChange={(e) => setNewReference(e.target.value)}
                  placeholder="e.g. Withdrawal ID (PHX-WDR-XXXX) or Node ID"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#05070B] border border-white/[0.1] focus:border-[#00CFFF] text-white text-xs font-mono focus:outline-none transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-mono text-[#98A2B3] block">Description &amp; Details</label>
                <textarea
                  value={newMessageText}
                  onChange={(e) => setNewMessageText(e.target.value)}
                  placeholder="Provide full details regarding your request..."
                  rows={4}
                  required
                  className="w-full p-3.5 rounded-xl bg-[#05070B] border border-white/[0.1] focus:border-[#00CFFF] text-white text-xs font-mono focus:outline-none transition-all resize-none"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 text-xs font-mono font-bold transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newSubject.trim() || !newMessageText.trim() || isSubmittingTicket}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#00CFFF] via-[#00A3FF] to-emerald-400 hover:brightness-110 text-slate-950 font-bold text-xs flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50 min-h-[42px]"
                >
                  {isSubmittingTicket ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  <span>Submit Support Request</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
