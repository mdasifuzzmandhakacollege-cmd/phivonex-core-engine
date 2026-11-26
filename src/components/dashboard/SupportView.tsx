import React, { useState, useEffect, useRef } from 'react';
import {
  HelpCircle,
  MessageSquare,
  Send,
  Ticket,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
  ChevronDown,
  Shield,
  Search,
  PlusCircle,
  RefreshCw,
  X,
  ArrowRight,
  BookOpen,
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
  suggestedCategory?: string;
  source?: 'GEMINI' | 'KNOWLEDGE_BASE';
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

interface FaqItem {
  id: string;
  category: string;
  question: string;
  answer: string;
}

const INSTITUTIONAL_FAQS: FaqItem[] = [
  {
    id: 'faq-1',
    category: 'Deposits & Withdrawals',
    question: 'Which blockchain network is supported for USDT deposits and withdrawals?',
    answer:
      'PHIVONEX exclusively settles on-chain USDT and BNB transfers via BNB Smart Chain (BEP-20, Chain ID 56). Always select BEP-20 when transferring funds. Minimum withdrawal is $0.10 USDT with 6-digit email OTP verification.',
  },
  {
    id: 'faq-2',
    category: 'Ecosystem Hubs',
    question: 'How do Quantum Alpha™, Genesis Core™, and Chrono Vaults™ differ?',
    answer:
      'Quantum Alpha™ is a liquid trading pool (min $200 USDT) with daily USDT yields and a 7-day principal lock. Genesis Core™ offers 10,000 capped validator nodes emitting daily PHIVO tokens. Chrono Vaults™ provides fixed-term institutional staking plans (200 days to 10 years) paying daily USDT yields.',
  },
  {
    id: 'faq-3',
    category: 'Affiliate & Royalties',
    question: 'How are 16-generation affiliate royalties credited across USDT and PHIVO?',
    answer:
      'All 16-generation unilevel royalties are asset-matched to the source product: royalties generated from downline Genesis Core™ emissions credit directly in PHIVO coins to your PHIVO Wallet, while royalties from Quantum Alpha™ and Chrono Vaults™ credit in USDT to your Main USDT Wallet.',
  },
  {
    id: 'faq-4',
    category: 'Leadership Ranks',
    question: 'How does the 40% Anti-Single-Leg rule work for leadership ranks?',
    answer:
      'To ensure healthy, diversified network growth across the 7 leadership stages, no single direct sponsorship leg can contribute more than 40% of the total team volume required for a rank milestone.',
  },
  {
    id: 'faq-5',
    category: 'Wallet & Swap',
    question: 'How do I convert earned PHIVO tokens into USDT?',
    answer:
      'Open Wallet & Ledger to access the instant PHIVO-to-USDT conversion module at the live protocol benchmark rate ($0.10 USDT / PHIVO). Converted USDT settles immediately into your Main USDT Wallet for withdrawal or internal compounding.',
  },
];

export const SupportView: React.FC<SupportViewProps> = ({ displayName, email }) => {
  const [activeTab, setActiveTab] = useState<'CHAT' | 'TICKETS' | 'FAQ'>('CHAT');

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

  // FAQ State
  const [faqQuery, setFaqQuery] = useState('');
  const [openFaqId, setOpenFaqId] = useState<string | null>('faq-1');

  // Ticket Thread Modal
  const [selectedTicket, setSelectedTicket] = useState<TicketRecord | null>(null);
  const [ticketMessages, setTicketMessages] = useState<TicketMessageRecord[]>([]);
  const [replyText, setReplyText] = useState('');
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [isLoadingThread, setIsLoadingThread] = useState(false);

  // Create Ticket Modal
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newCategory, setNewCategory] = useState('Withdrawal');
  const [newSubject, setNewSubject] = useState('');
  const [newMessageText, setNewMessageText] = useState('');
  const [newReference, setNewReference] = useState('');
  const [isSubmittingTicket, setIsSubmittingTicket] = useState(false);
  const [formFeedback, setFormFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (chatMessages.length === 0) {
      setChatMessages([
        {
          id: 'welcome-msg',
          sender: 'SUPPORT',
          text: `Hello ${displayName || email || 'Valued Member'}. Welcome to the PHIVONEX Concierge & Support Desk.\nHow can we assist you today?`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    }
  }, [displayName, email, chatMessages.length]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, isSending]);

  const fetchUserTickets = async () => {
    setIsLoadingTickets(true);
    try {
      const res = await fetch('/api/support/tickets', { credentials: 'include' });
      const data = await res.json();
      if (data.success && Array.isArray(data.tickets)) {
        setTickets(data.tickets);
      }
    } catch {
      // keep existing
    } finally {
      setIsLoadingTickets(false);
    }
  };

  useEffect(() => {
    fetchUserTickets();
  }, []);

  const openTicketThread = async (ticket: TicketRecord) => {
    setSelectedTicket(ticket);
    setIsLoadingThread(true);
    try {
      const res = await fetch(`/api/support/tickets/${ticket.publicTicketId}`, { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setSelectedTicket(data.ticket);
        setTicketMessages(Array.isArray(data.messages) ? data.messages : []);
      }
    } catch {
      // keep existing
    } finally {
      setIsLoadingThread(false);
    }
  };

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

      const res = await fetch('/api/support/ai-concierge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          message: query,
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
          suggestedCategory: data.response.suggestedCategory,
          source: data.response.source,
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
            text: 'I could not complete that inquiry automatically. Click "Escalate to Human Specialist Ticket" below so a PHIVONEX specialist can assist you directly.',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            shouldEscalate: true,
          },
        ]);
      }
    } catch {
      setChatMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          sender: 'SUPPORT',
          text: 'Connection delayed. If your inquiry is urgent, please escalate directly to a Human Specialist Ticket.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          shouldEscalate: true,
        },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const handleEscalateToHumanTicket = (suggestedCategory?: string) => {
    const validCategories = [
      'Withdrawal',
      'Deposit',
      'Quantum Alpha',
      'Genesis Core',
      'Chrono Vaults',
      '16-Gen Royalties',
      'Leadership Rank',
      'Swap',
      'Account',
      'Other',
    ];
    const resolvedCategory =
      suggestedCategory && validCategories.includes(suggestedCategory)
        ? suggestedCategory
        : 'Other';

    const lastUserMessage = [...chatMessages].reverse().find((m) => m.sender === 'USER');
    const transcript = chatMessages
      .filter((m) => m.id !== 'welcome-msg')
      .slice(-6)
      .map((m) => `[${m.sender === 'USER' ? 'Member' : 'AI Concierge'} ${m.timestamp}]: ${m.text}`)
      .join('\n\n');

    setNewCategory(resolvedCategory);
    setNewSubject(
      lastUserMessage
        ? `Specialist Review: ${lastUserMessage.text.slice(0, 72)}`
        : 'Specialist Account Assistance Request'
    );
    setNewMessageText(
      transcript
        ? `Escalated from PHIVONEX AI Concierge.\n\nRecent conversation context:\n${transcript}\n\nAdditional details:`
        : 'Please assist with my account inquiry.'
    );
    setFormFeedback(null);
    setIsCreateModalOpen(true);
  };

  const handleSendTicketReply = async () => {
    if (!selectedTicket || !replyText.trim() || isSendingReply) return;

    setIsSendingReply(true);
    try {
      const res = await fetch(`/api/support/tickets/${selectedTicket.publicTicketId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ message: replyText.trim() }),
      });

      const data = await res.json();
      if (data.success && data.message) {
        setTicketMessages((prev) => [...prev, data.message]);
        setReplyText('');
        fetchUserTickets();
      }
    } catch {
      // ignore transient error
    } finally {
      setIsSendingReply(false);
    }
  };

  const handleCreateTicketSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessageText.trim() || !newSubject.trim() || isSubmittingTicket) return;

    setIsSubmittingTicket(true);
    setFormFeedback(null);

    try {
      const res = await fetch('/api/support/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          category: newCategory,
          subject: newSubject.trim(),
          message: newMessageText.trim(),
          relatedPublicReference: newReference.trim() || null,
        }),
      });

      const data = await res.json();
      if (data.success && data.ticket) {
        setFormFeedback({
          type: 'success',
          text: `Support Ticket #${data.ticket.publicTicketId} created successfully.`,
        });
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
        setFormFeedback({ type: 'error', text: data.message || 'Failed to submit support ticket.' });
      }
    } catch {
      setFormFeedback({ type: 'error', text: 'Server error. Please try again.' });
    } finally {
      setIsSubmittingTicket(false);
    }
  };

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

  const filteredFaqs = INSTITUTIONAL_FAQS.filter((item) => {
    if (!faqQuery.trim()) return true;
    const q = faqQuery.toLowerCase();
    return (
      item.question.toLowerCase().includes(q) ||
      item.answer.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q)
    );
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'OPEN':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#F5B800]/15 border border-[#F5B800]/30 text-[#F5B800]">
            Open
          </span>
        );
      case 'IN_PROGRESS':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#00E5FF]/15 border border-[#00E5FF]/30 text-[#00E5FF]">
            In Progress
          </span>
        );
      case 'WAITING_FOR_USER':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-purple-500/15 border border-purple-500/30 text-purple-300">
            Awaiting Reply
          </span>
        );
      case 'RESOLVED':
      case 'CLOSED':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#00E676]/15 border border-[#00E676]/30 text-[#00E676]">
            Resolved
          </span>
        );
      case 'ESCALATED':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#FF4D4F]/15 border border-[#FF4D4F]/30 text-[#FF8587]">
            Escalated
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-white/[0.08] text-slate-300">
            {status}
          </span>
        );
    }
  };

  const quickActionChips = [
    { label: 'Quantum Alpha 7-Day Cycle', query: 'How does Quantum Alpha 7-day cycle work?' },
    { label: 'PHIVO & USDT Royalties', query: 'How are PHIVO & USDT royalties calculated?' },
    { label: 'Withdraw USDT', query: 'How do I withdraw USDT?' },
    { label: 'Genesis Core™ Nodes', query: 'How do Genesis Core daily 15 PHIVO emissions work?' },
    { label: 'Chrono Vaults™ Staking', query: 'How do Chrono Vaults fixed-term staking plans work?' },
    { label: 'Leadership Ranks', query: 'How do leadership rank milestones and the 40% leg cap work?' },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10 animate-fadeIn min-w-0 max-w-full overflow-x-hidden">
      {/* 1. CONCIERGE HEADER */}
      <div className="oneui-glass-card rounded-[24px] p-5 sm:p-7 relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div className="absolute top-0 right-0 -mt-14 -mr-14 w-72 h-72 bg-[#00E5FF]/[0.07] rounded-full blur-3xl pointer-events-none" />

        <div className="flex items-center gap-3.5 relative z-10 min-w-0">
          <div className="w-12 h-12 rounded-2xl bg-[#00E5FF]/12 border border-[#00E5FF]/30 text-[#00E5FF] flex items-center justify-center shrink-0">
            <HelpCircle className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
              Concierge &amp; Support Center
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
              Live assistance, active support ticket tracking, and institutional knowledge base.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsCreateModalOpen(true)}
          className="relative z-10 px-4 py-2.5 rounded-2xl bg-[#00E5FF] hover:bg-[#00E5FF]/90 text-[#050807] font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg shadow-[#00E5FF]/20 min-h-[44px] shrink-0 active:scale-95"
        >
          <PlusCircle className="w-4 h-4" />
          <span>Create Support Ticket</span>
        </button>
      </div>

      {/* 2. NAVIGATION TABS */}
      <div className="oneui-glass-card rounded-[22px] p-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setActiveTab('CHAT')}
            className={`px-4 py-2.5 text-xs font-bold transition-all rounded-2xl cursor-pointer flex items-center gap-2 ${
              activeTab === 'CHAT'
                ? 'bg-[#00E5FF] text-[#050807] shadow-md shadow-[#00E5FF]/20'
                : 'text-slate-400 hover:text-white hover:bg-white/[0.06]'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span>Support Desk</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('TICKETS');
              fetchUserTickets();
            }}
            className={`px-4 py-2.5 text-xs font-bold transition-all rounded-2xl cursor-pointer flex items-center gap-2 ${
              activeTab === 'TICKETS'
                ? 'bg-[#00E5FF] text-[#050807] shadow-md shadow-[#00E5FF]/20'
                : 'text-slate-400 hover:text-white hover:bg-white/[0.06]'
            }`}
          >
            <Ticket className="w-4 h-4" />
            <span>My Tickets</span>
            {tickets.length > 0 && (
              <span className="px-2 py-0.5 text-[10px] rounded-full bg-black/25 font-mono">
                {tickets.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('FAQ')}
            className={`px-4 py-2.5 text-xs font-bold transition-all rounded-2xl cursor-pointer flex items-center gap-2 ${
              activeTab === 'FAQ'
                ? 'bg-[#F5B800] text-[#050807] shadow-md shadow-[#F5B800]/20'
                : 'text-slate-400 hover:text-white hover:bg-white/[0.06]'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>Institutional FAQ</span>
          </button>
        </div>

        <button
          type="button"
          onClick={fetchUserTickets}
          title="Refresh Tickets"
          className="p-2.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-slate-300 hover:text-white transition-colors cursor-pointer"
        >
          <RefreshCw className={`w-4 h-4 ${isLoadingTickets ? 'animate-spin text-[#00E5FF]' : ''}`} />
        </button>
      </div>

      {/* TAB 1: LIVE SUPPORT DESK */}
      {activeTab === 'CHAT' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          <div className="lg:col-span-8 oneui-glass-card rounded-[24px] p-5 sm:p-6 flex flex-col justify-between min-h-[540px] space-y-4">
            <div className="space-y-2 border-b border-white/[0.08] pb-4">
              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">
                Quick Inquiries
              </span>
              <div className="flex flex-wrap gap-2">
                {quickActionChips.map((chip) => (
                  <button
                    key={chip.label}
                    type="button"
                    onClick={() => handleSendChat(chip.query)}
                    disabled={isSending}
                    className="px-3 py-1.5 rounded-xl bg-white/[0.05] hover:bg-[#00E5FF]/12 border border-white/[0.08] hover:border-[#00E5FF]/35 text-xs text-slate-300 hover:text-[#00E5FF] transition-all cursor-pointer disabled:opacity-50"
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4 max-h-[380px] overflow-y-auto pr-1 flex-1">
              {chatMessages.map((msg) => {
                const isUser = msg.sender === 'USER';
                return (
                  <div key={msg.id} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} space-y-1`}>
                    <div className="flex items-center gap-2 text-[10px] font-mono text-slate-400 px-1">
                      <span>{isUser ? 'You' : 'PHIVONEX Concierge'}</span>
                      <span>•</span>
                      <span>{msg.timestamp}</span>
                    </div>

                    <div
                      className={`max-w-xl p-4 rounded-2xl text-xs leading-relaxed whitespace-pre-wrap ${
                        isUser
                          ? 'bg-[#00E5FF]/15 border border-[#00E5FF]/35 text-white rounded-tr-sm'
                          : 'bg-[#050807]/80 border border-white/[0.08] text-slate-200 rounded-tl-sm'
                      }`}
                    >
                      {msg.text}

                      {msg.createdTicketPublicId && (
                        <div className="mt-3 p-3 rounded-xl bg-[#F5B800]/12 border border-[#F5B800]/30 space-y-2 text-left">
                          <div className="flex items-center gap-2 text-[#F5B800] font-mono font-bold text-xs">
                            <Ticket className="w-4 h-4 shrink-0" />
                            <span>Support Ticket #{msg.createdTicketPublicId} Created</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setActiveTab('TICKETS');
                              fetchUserTickets();
                            }}
                            className="px-3 py-1.5 rounded-xl bg-[#F5B800]/20 hover:bg-[#F5B800]/30 text-[#F5B800] font-mono text-[10px] font-bold flex items-center gap-1 transition-all cursor-pointer"
                          >
                            <span>Track Ticket #{msg.createdTicketPublicId}</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                      {!isUser && msg.id !== 'welcome-msg' && (
                        <div className="mt-3 pt-2.5 border-t border-white/[0.06] flex flex-wrap items-center justify-between gap-2">
                          <span className="text-[10px] font-mono text-slate-500">
                            {msg.source === 'GEMINI' ? 'PHIVONEX AI Concierge' : 'PHIVONEX Protocol Desk'}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleEscalateToHumanTicket(msg.suggestedCategory)}
                            className={`px-3 py-1.5 rounded-xl text-[10px] font-mono font-bold inline-flex items-center gap-1.5 transition-all cursor-pointer ${
                              msg.shouldEscalate
                                ? 'bg-[#F5B800] text-[#050807] hover:bg-[#F5B800]/90 shadow-sm shadow-[#F5B800]/25'
                                : 'bg-white/[0.06] hover:bg-[#F5B800]/18 text-slate-300 hover:text-[#F5B800] border border-white/[0.08] hover:border-[#F5B800]/35'
                            }`}
                          >
                            <Ticket className="w-3.5 h-3.5 shrink-0" />
                            <span>Escalate to Human Specialist Ticket</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {isSending && (
                <div className="flex items-center gap-3 text-xs text-[#00E5FF] font-mono px-4 py-3 rounded-2xl bg-[#050807]/85 border border-[#00E5FF]/25 w-fit">
                  <span className="inline-flex items-center gap-1" aria-hidden="true">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#00E5FF] animate-bounce [animation-delay:-0.3s]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-[#00E5FF] animate-bounce [animation-delay:-0.15s]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-[#00E5FF] animate-bounce" />
                  </span>
                  <span>PHIVONEX AI Concierge is composing a response...</span>
                </div>
              )}

              <div ref={chatBottomRef} />
            </div>

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
                  placeholder="Ask about withdrawals, deposits, yields, or account settings..."
                  disabled={isSending}
                  className="flex-1 px-4 py-3 rounded-2xl bg-[#050807]/85 border border-white/[0.1] focus:border-[#00E5FF] text-white text-xs placeholder:text-slate-500 focus:outline-none transition-all disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={!inputPrompt.trim() || isSending}
                  className="px-5 py-3 rounded-2xl bg-[#00E5FF] hover:bg-[#00E5FF]/90 text-[#050807] font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 min-h-[44px]"
                >
                  <Send className="w-4 h-4" />
                  <span className="hidden sm:inline">Send</span>
                </button>
              </form>
            </div>
          </div>

          <div className="lg:col-span-4 space-y-4">
            <div className="oneui-glass-card rounded-[24px] p-5 space-y-4">
              <div className="flex items-center gap-2 text-xs font-mono font-bold text-white uppercase tracking-wider">
                <Shield className="w-4 h-4 text-[#00E5FF]" />
                <span>Support Standards</span>
              </div>

              <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
                <div className="p-3.5 rounded-2xl bg-[#050807]/75 border border-white/[0.07] space-y-1">
                  <span className="font-bold text-white block">Live Ledger Verification</span>
                  <p className="text-[11px] text-slate-400">
                    Case diagnostics check your authenticated deposit, withdrawal, and active vault records securely.
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl bg-[#050807]/75 border border-white/[0.07] space-y-2.5">
                  <span className="font-bold text-white block">Specialist Escalation</span>
                  <p className="text-[11px] text-slate-400">
                    Complex settlement or compliance inquiries are routed directly to our operations desk with your recent chat context pre-filled.
                  </p>
                  <button
                    type="button"
                    onClick={() => handleEscalateToHumanTicket()}
                    className="w-full px-3 py-2 rounded-xl bg-[#F5B800]/15 hover:bg-[#F5B800]/25 border border-[#F5B800]/35 text-[#F5B800] font-mono text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Ticket className="w-3.5 h-3.5 shrink-0" />
                    <span>Escalate to Human Specialist Ticket</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: MY TICKETS */}
      {activeTab === 'TICKETS' && (
        <div className="space-y-4">
          <div className="oneui-glass-card rounded-[22px] p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search tickets by ID, subject, or category..."
                className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-[#050807]/85 border border-white/[0.1] focus:border-[#00E5FF] text-white text-xs placeholder:text-slate-500 focus:outline-none"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto">
              {(['ALL', 'OPEN', 'IN_PROGRESS', 'WAITING', 'RESOLVED'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setTicketFilter(f)}
                  className={`px-3 py-1.5 rounded-xl text-[10px] font-mono font-bold transition-all cursor-pointer ${
                    ticketFilter === f
                      ? 'bg-[#00E5FF] text-[#050807]'
                      : 'bg-white/[0.05] text-slate-400 hover:text-white'
                  }`}
                >
                  {f.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>

          {isLoadingTickets ? (
            <div className="oneui-glass-card rounded-[24px] p-12 text-center text-xs font-mono text-slate-400 space-y-2">
              <RefreshCw className="w-6 h-6 animate-spin text-[#00E5FF] mx-auto" />
              <p>Loading support tickets...</p>
            </div>
          ) : filteredTickets.length === 0 ? (
            <div className="oneui-glass-card rounded-[24px] p-12 text-center text-xs space-y-3">
              <Ticket className="w-10 h-10 text-slate-500 mx-auto" />
              <div className="space-y-1">
                <p className="font-bold text-white text-sm">No Support Tickets Found</p>
                <p className="text-slate-400 max-w-sm mx-auto">
                  {searchQuery || ticketFilter !== 'ALL'
                    ? 'No tickets match your current filters.'
                    : 'You currently have no open or past support tickets.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(true)}
                className="px-4 py-2.5 rounded-2xl bg-[#00E5FF]/15 hover:bg-[#00E5FF]/25 text-[#00E5FF] border border-[#00E5FF]/35 text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-2"
              >
                <PlusCircle className="w-4 h-4" />
                <span>Create Support Ticket</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {filteredTickets.map((ticket) => (
                <div
                  key={ticket.publicTicketId}
                  onClick={() => openTicketThread(ticket)}
                  className="oneui-glass-card rounded-[22px] p-5 hover:border-[#00E5FF]/40 transition-all cursor-pointer space-y-2.5 group"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-mono font-bold text-[#00E5FF]">#{ticket.publicTicketId}</span>
                        <span className="px-2 py-0.5 rounded-full bg-white/[0.06] text-[10px] font-mono text-slate-300">
                          {ticket.category}
                        </span>
                        {getStatusBadge(ticket.status)}
                      </div>
                      <h3 className="text-sm font-bold text-white truncate">{ticket.subject}</h3>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-[10px] font-mono text-slate-400 block">
                        {new Date(ticket.updatedAt).toLocaleDateString()}
                      </span>
                      <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-[#00E5FF] ml-auto mt-1 transition-colors" />
                    </div>
                  </div>

                  <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                    {ticket.latestMessageSnippet || ticket.userMessage}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: SEARCHABLE INSTITUTIONAL FAQ ACCORDION */}
      {activeTab === 'FAQ' && (
        <div className="space-y-4">
          <div className="oneui-glass-card rounded-[22px] p-4">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={faqQuery}
                onChange={(e) => setFaqQuery(e.target.value)}
                placeholder="Search institutional knowledge base (BEP-20, 16-Gen Royalties, Chrono Vaults...)"
                className="w-full pl-10 pr-4 py-3 rounded-2xl bg-[#050807]/85 border border-white/[0.1] focus:border-[#F5B800] text-white text-xs placeholder:text-slate-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="space-y-3">
            {filteredFaqs.map((faq) => {
              const isOpen = openFaqId === faq.id;
              return (
                <div key={faq.id} className="oneui-glass-card rounded-[22px] overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setOpenFaqId(isOpen ? null : faq.id)}
                    className="w-full p-5 text-left flex items-center justify-between gap-4 cursor-pointer hover:bg-white/[0.02] transition-colors"
                  >
                    <div className="space-y-1 min-w-0">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-[#F5B800]">
                        {faq.category}
                      </span>
                      <h3 className="text-sm font-bold text-white">{faq.question}</h3>
                    </div>
                    <ChevronDown
                      className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200 ${
                        isOpen ? 'rotate-180 text-[#00E5FF]' : ''
                      }`}
                    />
                  </button>
                  {isOpen && (
                    <div className="px-5 pb-5 pt-1 text-xs text-slate-300 leading-relaxed border-t border-white/[0.06]">
                      {faq.answer}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TICKET THREAD MODAL */}
      {selectedTicket && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
          <div className="w-full max-w-2xl oneui-glass-card rounded-[28px] overflow-hidden">
            <div className="p-5 border-b border-white/[0.08] flex items-center justify-between bg-[#050807]/70">
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-[#00E5FF]">#{selectedTicket.publicTicketId}</span>
                  {getStatusBadge(selectedTicket.status)}
                </div>
                <h2 className="text-base font-bold text-white truncate">{selectedTicket.subject}</h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTicket(null)}
                className="p-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-slate-300 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[380px] overflow-y-auto bg-[#050807]/50">
              {isLoadingThread ? (
                <div className="py-8 text-center text-xs font-mono text-slate-400">
                  <RefreshCw className="w-5 h-5 animate-spin text-[#00E5FF] mx-auto mb-2" />
                  <p>Loading conversation thread...</p>
                </div>
              ) : (
                ticketMessages.map((msg) => {
                  const isUser = msg.senderType === 'USER';
                  return (
                    <div key={msg.id} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} space-y-1`}>
                      <div className="flex items-center gap-2 text-[10px] font-mono text-slate-400 px-1">
                        <span>{msg.senderPublicName || (isUser ? 'You' : 'PHIVONEX Specialist')}</span>
                        <span>•</span>
                        <span>{new Date(msg.createdAt).toLocaleString()}</span>
                      </div>
                      <div
                        className={`p-4 rounded-2xl text-xs leading-relaxed whitespace-pre-wrap max-w-lg ${
                          isUser
                            ? 'bg-[#00E5FF]/15 border border-[#00E5FF]/35 text-white rounded-tr-sm'
                            : 'bg-[#0e1513] border border-white/[0.08] text-slate-200 rounded-tl-sm'
                        }`}
                      >
                        {msg.message}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="p-4 border-t border-white/[0.08] space-y-3">
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Type your reply..."
                rows={3}
                disabled={isSendingReply || selectedTicket.status === 'CLOSED'}
                className="w-full p-3.5 rounded-2xl bg-[#050807]/85 border border-white/[0.1] focus:border-[#00E5FF] text-white text-xs placeholder:text-slate-500 focus:outline-none resize-none disabled:opacity-50"
              />
              <div className="flex items-center justify-end">
                <button
                  type="button"
                  onClick={handleSendTicketReply}
                  disabled={!replyText.trim() || isSendingReply || selectedTicket.status === 'CLOSED'}
                  className="px-5 py-2.5 rounded-2xl bg-[#00E5FF] text-[#050807] font-bold text-xs flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                  <span>Send Reply</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CREATE SUPPORT TICKET MODAL */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
          <div className="w-full max-w-lg oneui-glass-card rounded-[28px] overflow-hidden">
            <div className="p-5 border-b border-white/[0.08] flex items-center justify-between bg-[#050807]/70">
              <div className="flex items-center gap-2.5">
                <PlusCircle className="w-5 h-5 text-[#00E5FF]" />
                <h2 className="text-base font-bold text-white">Create Support Ticket</h2>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="p-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-slate-300 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateTicketSubmit} className="p-6 space-y-4">
              {formFeedback && (
                <div
                  className={`p-3.5 rounded-2xl border text-xs flex items-center gap-2 ${
                    formFeedback.type === 'success'
                      ? 'bg-[#00E676]/12 border-[#00E676]/30 text-[#00E676]'
                      : 'bg-[#FF4D4F]/12 border-[#FF4D4F]/30 text-[#FF8587]'
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
                <label className="text-xs font-semibold text-slate-400 block">Category</label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-2xl bg-[#050807]/85 border border-white/[0.1] focus:border-[#00E5FF] text-white text-xs focus:outline-none cursor-pointer"
                >
                  <option value="Withdrawal">Withdrawal</option>
                  <option value="Deposit">BEP-20 Deposit</option>
                  <option value="Quantum Alpha">Quantum Alpha™</option>
                  <option value="Genesis Core">Genesis Core™ Node</option>
                  <option value="Chrono Vaults">Chrono Vaults™</option>
                  <option value="16-Gen Royalties">16-Gen Royalties</option>
                  <option value="Leadership Rank">Leadership Rank</option>
                  <option value="Swap">PHIVO Swap</option>
                  <option value="Account">Account / Security</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-400 block">Subject</label>
                <input
                  type="text"
                  value={newSubject}
                  onChange={(e) => setNewSubject(e.target.value)}
                  placeholder="e.g. BEP-20 withdrawal settlement inquiry"
                  required
                  className="w-full px-3.5 py-2.5 rounded-2xl bg-[#050807]/85 border border-white/[0.1] focus:border-[#00E5FF] text-white text-xs focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-400 block">Related Reference (Optional)</label>
                <input
                  type="text"
                  value={newReference}
                  onChange={(e) => setNewReference(e.target.value)}
                  placeholder="e.g. TX Hash or Withdrawal ID"
                  className="w-full px-3.5 py-2.5 rounded-2xl bg-[#050807]/85 border border-white/[0.1] focus:border-[#00E5FF] text-white text-xs font-mono focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-400 block">Description</label>
                <textarea
                  value={newMessageText}
                  onChange={(e) => setNewMessageText(e.target.value)}
                  placeholder="Provide clear details regarding your request..."
                  rows={4}
                  required
                  className="w-full p-3.5 rounded-2xl bg-[#050807]/85 border border-white/[0.1] focus:border-[#00E5FF] text-white text-xs focus:outline-none resize-none"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2.5 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] text-slate-300 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newSubject.trim() || !newMessageText.trim() || isSubmittingTicket}
                  className="px-5 py-2.5 rounded-2xl bg-[#00E5FF] hover:bg-[#00E5FF]/90 text-[#050807] font-bold text-xs flex items-center gap-2 cursor-pointer disabled:opacity-50 min-h-[42px]"
                >
                  {isSubmittingTicket ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  <span>Submit Ticket</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
