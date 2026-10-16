import React, { useState, useEffect, useCallback } from 'react';
import {
  Mail,
  Send,
  Sliders,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Search,
  Filter,
  Eye,
  Edit2,
  Trash2,
  Plus,
  Clock,
  Check,
  X,
  Layers,
  Sparkles,
  Zap,
  ShieldCheck,
  RotateCcw,
  Users,
  Server,
  Code,
  Globe,
  Radio,
  ExternalLink,
  ChevronRight,
  Info,
  BellRing,
} from 'lucide-react';
import { sendTestPushNotification } from '../../services/webPushService';

export interface EmailTemplateItem {
  id: string;
  eventName: string;
  subject: string;
  bodyHtml: string;
  enabled: boolean;
  createdAt: string;
}

export interface AutomationRuleItem {
  id: string;
  name: string;
  enabled: boolean;
  triggerCriteria: 'STRONG_GROWTH' | 'MATCHING_ACTIVITY' | 'NODE_SALES' | 'MILESTONE_PROGRESS' | 'INACTIVITY';
  delayHours: number;
  cooldownDays: number;
  templateId: string;
  createdAt: string;
}

export interface EmailQueueItem {
  id: string;
  toEmail: string;
  subject: string;
  bodyHtml: string;
  status: 'QUEUED' | 'SENT' | 'DELIVERED' | 'FAILED';
  providerMessageId?: string;
  errorMessage?: string;
  sentAt?: string;
  createdAt: string;
}

export interface EmailStats {
  totalQueued: number;
  totalSent: number;
  totalDelivered: number;
  totalFailed: number;
  totalAll: number;
}

interface AdminCommunicationsHubProps {
  adminEmail?: string;
}

export const AdminCommunicationsHub: React.FC<AdminCommunicationsHubProps> = () => {
  const [activeSubTab, setActiveSubTab] = useState<'templates' | 'campaigns' | 'automation' | 'queue' | 'diagnostics'>('templates');

  // Stats
  const [stats, setStats] = useState<EmailStats>({
    totalQueued: 0,
    totalSent: 0,
    totalDelivered: 0,
    totalFailed: 0,
    totalAll: 0,
  });

  // Templates State
  const [templates, setTemplates] = useState<EmailTemplateItem[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState<boolean>(true);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplateItem | null>(null);
  const [templateSubject, setTemplateSubject] = useState<string>('');
  const [templateBody, setTemplateBody] = useState<string>('');
  const [templateEnabled, setTemplateEnabled] = useState<boolean>(true);
  const [templatePreviewMode, setTemplatePreviewMode] = useState<boolean>(false);
  const [savingTemplate, setSavingTemplate] = useState<boolean>(false);

  // Campaigns State
  const [campaignAudience, setCampaignAudience] = useState<'ALL' | 'ACTIVE_USERS' | 'NODE_HOLDERS'>('ALL');
  const [campaignSubject, setCampaignSubject] = useState<string>('');
  const [campaignBody, setCampaignBody] = useState<string>('');
  const [campaignPreviewMode, setCampaignPreviewMode] = useState<boolean>(false);
  const [sendingCampaign, setSendingCampaign] = useState<boolean>(false);
  const [showCampaignConfirm, setShowCampaignConfirm] = useState<boolean>(false);

  // Automation Rules State
  const [rules, setRules] = useState<AutomationRuleItem[]>([]);
  const [loadingRules, setLoadingRules] = useState<boolean>(true);
  const [editingRule, setEditingRule] = useState<AutomationRuleItem | null>(null);
  const [isNewRule, setIsNewRule] = useState<boolean>(false);
  const [ruleName, setRuleName] = useState<string>('');
  const [ruleCriteria, setRuleCriteria] = useState<AutomationRuleItem['triggerCriteria']>('STRONG_GROWTH');
  const [ruleDelayHours, setRuleDelayHours] = useState<number>(0);
  const [ruleCooldownDays, setRuleCooldownDays] = useState<number>(7);
  const [ruleTemplateId, setRuleTemplateId] = useState<string>('');
  const [ruleEnabled, setRuleEnabled] = useState<boolean>(true);
  const [savingRule, setSavingRule] = useState<boolean>(false);

  // Queue State
  const [queueItems, setQueueItems] = useState<EmailQueueItem[]>([]);
  const [queueTotal, setQueueTotal] = useState<number>(0);
  const [queueStatusFilter, setQueueStatusFilter] = useState<string>('ALL');
  const [queueSearch, setQueueSearch] = useState<string>('');
  const [queuePage, setQueuePage] = useState<number>(1);
  const [loadingQueue, setLoadingQueue] = useState<boolean>(false);
  const [processingQueue, setProcessingQueue] = useState<boolean>(false);
  const [selectedQueueItem, setSelectedQueueItem] = useState<EmailQueueItem | null>(null);

  // Global Feedback
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Diagnostic Web Push Test
  const [testPushLoading, setTestPushLoading] = useState<boolean>(false);
  const [testPushResult, setTestPushResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleAdminTestPush = async () => {
    try {
      setTestPushLoading(true);
      setTestPushResult(null);
      const res = await sendTestPushNotification();
      if (res.success) {
        setTestPushResult({ success: true, message: 'Test push notification dispatched successfully.' });
      } else {
        setTestPushResult({ success: false, message: res.error || 'Failed to dispatch test push notification.' });
      }
    } catch (err: any) {
      setTestPushResult({ success: false, message: err?.message || 'Error executing test push.' });
    } finally {
      setTestPushLoading(false);
    }
  };

  // 1. Fetch Stats
  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/email/stats');
      if (res.ok) {
        const data = await res.json();
        if (data.stats) setStats(data.stats);
      }
    } catch (err) {
      console.warn('[AdminCommunications] Failed to load stats:', err);
    }
  }, []);

  // 2. Fetch Templates
  const fetchTemplates = useCallback(async () => {
    try {
      setLoadingTemplates(true);
      const res = await fetch('/api/admin/email/templates');
      if (res.ok) {
        const data = await res.json();
        setTemplates(data.templates || []);
      }
    } catch (err) {
      console.error('[AdminCommunications] Failed to load templates:', err);
    } finally {
      setLoadingTemplates(false);
    }
  }, []);

  // 3. Fetch Automation Rules
  const fetchRules = useCallback(async () => {
    try {
      setLoadingRules(true);
      const res = await fetch('/api/admin/email/automation');
      if (res.ok) {
        const data = await res.json();
        setRules(data.rules || []);
      }
    } catch (err) {
      console.error('[AdminCommunications] Failed to load automation rules:', err);
    } finally {
      setLoadingRules(false);
    }
  }, []);

  // 4. Fetch Queue
  const fetchQueue = useCallback(async (page = 1, status = queueStatusFilter, search = queueSearch) => {
    try {
      setLoadingQueue(true);
      const limit = 15;
      const offset = (page - 1) * limit;
      const params = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
        status,
        search,
      });

      const res = await fetch(`/api/admin/email/queue?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setQueueItems(data.items || []);
        setQueueTotal(data.total || 0);
        if (data.stats) setStats(data.stats);
      }
    } catch (err) {
      console.error('[AdminCommunications] Failed to load email queue:', err);
    } finally {
      setLoadingQueue(false);
    }
  }, [queueStatusFilter, queueSearch]);

  useEffect(() => {
    fetchStats();
    fetchTemplates();
    fetchRules();
    fetchQueue(1);
  }, [fetchStats, fetchTemplates, fetchRules, fetchQueue]);

  // Handle Template Save
  const handleSaveTemplate = async () => {
    if (!editingTemplate) return;
    try {
      setSavingTemplate(true);
      setFeedback(null);
      const res = await fetch(`/api/admin/email/templates/${editingTemplate.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: templateSubject,
          bodyHtml: templateBody,
          enabled: templateEnabled,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || 'Failed to update email template');
      }

      setFeedback({ type: 'success', message: `Template "${editingTemplate.eventName}" updated successfully.` });
      setEditingTemplate(null);
      fetchTemplates();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to save template.' });
    } finally {
      setSavingTemplate(false);
    }
  };

  // Handle Broadcast Dispatch
  const handleSendCampaign = async () => {
    if (!campaignSubject.trim() || !campaignBody.trim()) {
      setFeedback({ type: 'error', message: 'Subject and HTML message content are required.' });
      return;
    }

    try {
      setSendingCampaign(true);
      setFeedback(null);
      setShowCampaignConfirm(false);

      const res = await fetch('/api/admin/email/campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: campaignSubject,
          bodyHtml: campaignBody,
          audience: campaignAudience,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to dispatch email broadcast');
      }

      setFeedback({
        type: 'success',
        message: `Campaign dispatched successfully! ${data.queuedCount} emails queued for transmission to audience (${campaignAudience}).`,
      });
      setCampaignSubject('');
      setCampaignBody('');
      fetchStats();
      fetchQueue(1);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to send broadcast campaign.' });
    } finally {
      setSendingCampaign(false);
    }
  };

  // Handle Automation Rule Save
  const handleSaveRule = async () => {
    if (!ruleName.trim() || !ruleTemplateId) {
      setFeedback({ type: 'error', message: 'Rule name and associated email template are required.' });
      return;
    }

    try {
      setSavingRule(true);
      setFeedback(null);

      const endpoint = isNewRule ? '/api/admin/email/automation' : `/api/admin/email/automation/${editingRule?.id}`;
      const method = isNewRule ? 'POST' : 'PUT';

      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: ruleName,
          enabled: ruleEnabled,
          triggerCriteria: ruleCriteria,
          delayHours: Number(ruleDelayHours),
          cooldownDays: Number(ruleCooldownDays),
          templateId: ruleTemplateId,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to save automation rule');
      }

      setFeedback({
        type: 'success',
        message: `Automation rule "${ruleName}" ${isNewRule ? 'created' : 'updated'} successfully.`,
      });
      setEditingRule(null);
      setIsNewRule(false);
      fetchRules();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to save automation rule.' });
    } finally {
      setSavingRule(false);
    }
  };

  // Handle Delete Automation Rule
  const handleDeleteRule = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to permanently delete automation rule "${name}"?`)) return;
    try {
      const res = await fetch(`/api/admin/email/automation/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setFeedback({ type: 'success', message: `Rule "${name}" deleted.` });
        fetchRules();
      } else {
        const d = await res.json();
        throw new Error(d.message || 'Failed to delete rule');
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Error deleting rule.' });
    }
  };

  // Handle Process Queue Now
  const handleProcessQueue = async () => {
    try {
      setProcessingQueue(true);
      setFeedback(null);
      const res = await fetch('/api/admin/email/queue/process', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setFeedback({ type: 'success', message: data.message || 'Email queue processed successfully.' });
        fetchStats();
        fetchQueue(queuePage);
      } else {
        throw new Error(data.message || 'Failed to process email queue');
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Error processing email queue.' });
    } finally {
      setProcessingQueue(false);
    }
  };

  // Handle Retry Email
  const handleRetryItem = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/email/queue/retry/${id}`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setFeedback({ type: 'success', message: 'Email re-queued for delivery.' });
        fetchStats();
        fetchQueue(queuePage);
      } else {
        throw new Error(data.message || 'Failed to retry email');
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Error retrying email.' });
    }
  };

  const deliveryRate = stats.totalAll > 0
    ? Math.round(((stats.totalDelivered + stats.totalSent) / stats.totalAll) * 100)
    : 100;

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Top Banner / Hero */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-[#07101D] via-[#0B1528] to-[#07101D] border border-white/[0.08] shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-80 h-80 bg-[#00CFFF]/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-[#00CFFF]/15 border border-[#00CFFF]/30 text-[#00CFFF] text-[10px] font-mono font-bold uppercase tracking-wider">
                Control Plane Hub
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-[#32D583]/10 border border-[#32D583]/20 text-[#32D583] text-[10px] font-mono font-bold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#32D583] animate-pulse" />
                Dual Sync Active
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-3">
              <Mail className="w-7 h-7 text-[#00CFFF]" />
              <span>Communications & Dynamic Email Automation</span>
            </h1>
            <p className="text-xs sm:text-sm text-[#98A2B3] max-w-2xl">
              Authoritative dispatch matrix for transactional templates, on-demand audience broadcast campaigns, event-driven follow-up rules, and outbox delivery monitoring.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => {
                fetchStats();
                fetchTemplates();
                fetchRules();
                fetchQueue(queuePage);
              }}
              className="px-3.5 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-white border border-white/[0.1] text-xs font-medium flex items-center gap-2 transition-all cursor-pointer min-h-[42px]"
            >
              <RefreshCw className="w-3.5 h-3.5 text-[#00CFFF]" />
              <span>Sync All</span>
            </button>
            <button
              onClick={() => setActiveSubTab('campaigns')}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#00CFFF] to-[#168BFF] hover:opacity-90 text-[#05070B] text-xs font-bold flex items-center gap-2 transition-all cursor-pointer min-h-[42px] shadow-lg shadow-[#00CFFF]/20"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Compose Broadcast</span>
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        <div className="p-4 rounded-xl bg-[#07101D] border border-white/[0.08] space-y-1">
          <div className="text-[11px] font-mono uppercase text-[#98A2B3] flex items-center justify-between">
            <span>Total Outbox</span>
            <Layers className="w-3.5 h-3.5 text-[#00CFFF]" />
          </div>
          <div className="text-2xl font-mono font-bold text-white tabular-nums">{stats.totalAll}</div>
          <div className="text-[10px] text-[#98A2B3]">Lifetime recorded transmissions</div>
        </div>

        <div className="p-4 rounded-xl bg-[#07101D] border border-white/[0.08] space-y-1">
          <div className="text-[11px] font-mono uppercase text-[#98A2B3] flex items-center justify-between">
            <span>Delivered / Sent</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-[#32D583]" />
          </div>
          <div className="text-2xl font-mono font-bold text-[#32D583] tabular-nums">
            {stats.totalDelivered + stats.totalSent}
          </div>
          <div className="text-[10px] text-[#32D583]">Confirmed transmissions</div>
        </div>

        <div className="p-4 rounded-xl bg-[#07101D] border border-white/[0.08] space-y-1">
          <div className="text-[11px] font-mono uppercase text-[#98A2B3] flex items-center justify-between">
            <span>Pending Queued</span>
            <Clock className="w-3.5 h-3.5 text-[#FFB020]" />
          </div>
          <div className="text-2xl font-mono font-bold text-[#FFB020] tabular-nums">{stats.totalQueued}</div>
          <div className="text-[10px] text-[#FFB020]">Ready for batch dispatch</div>
        </div>

        <div className="p-4 rounded-xl bg-[#07101D] border border-white/[0.08] space-y-1">
          <div className="text-[11px] font-mono uppercase text-[#98A2B3] flex items-center justify-between">
            <span>Failed / Bounced</span>
            <XCircle className="w-3.5 h-3.5 text-[#F04438]" />
          </div>
          <div className="text-2xl font-mono font-bold text-[#F04438] tabular-nums">{stats.totalFailed}</div>
          <div className="text-[10px] text-[#F04438]">Retryable delivery exceptions</div>
        </div>

        <div className="p-4 rounded-xl bg-[#07101D] border border-white/[0.08] space-y-1">
          <div className="text-[11px] font-mono uppercase text-[#98A2B3] flex items-center justify-between">
            <span>Deliverability</span>
            <ShieldCheck className="w-3.5 h-3.5 text-[#00CFFF]" />
          </div>
          <div className="text-2xl font-mono font-bold text-[#00CFFF] tabular-nums">{deliveryRate}%</div>
          <div className="text-[10px] text-[#00CFFF]">Clean reputation index</div>
        </div>
      </div>

      {/* Global Feedback Banner */}
      {feedback && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between gap-3 text-xs sm:text-sm animate-fadeIn ${
            feedback.type === 'success'
              ? 'bg-[#32D583]/10 border-[#32D583]/30 text-[#32D583]'
              : 'bg-[#F04438]/10 border-[#F04438]/30 text-[#F04438]'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            )}
            <span className="font-medium">{feedback.message}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="text-xs underline hover:opacity-80 cursor-pointer">
            Dismiss
          </button>
        </div>
      )}

      {/* Sub-Tabs Navigation */}
      <div className="flex items-center gap-2 border-b border-white/[0.08] pb-3 overflow-x-auto no-scrollbar">
        {[
          { id: 'templates', label: 'Email Templates', icon: Code, count: templates.length },
          { id: 'campaigns', label: 'Broadcast Campaigns', icon: Send },
          { id: 'automation', label: 'Automation Rules', icon: Sliders, count: rules.length },
          { id: 'queue', label: 'Outbox & Queue', icon: Clock, count: queueTotal },
          { id: 'diagnostics', label: 'Delivery & Webhooks', icon: Radio },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id as any)}
              className={`px-4 py-2 rounded-xl text-xs font-medium flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
                isActive
                  ? 'bg-gradient-to-r from-[#00CFFF]/20 to-[#168BFF]/10 text-white border border-[#00CFFF]/40 shadow-sm'
                  : 'text-[#98A2B3] hover:text-white hover:bg-white/[0.04] border border-transparent'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-[#00CFFF]' : 'text-[#98A2B3]'}`} />
              <span>{tab.label}</span>
              {typeof tab.count === 'number' && (
                <span className="px-1.5 py-0.2 rounded-full bg-white/[0.08] text-[10px] font-mono text-white">
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ========================================================================= */}
      {/* 1. TEMPLATES SUB-TAB                                                      */}
      {/* ========================================================================= */}
      {activeSubTab === 'templates' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>System Event Notification Templates</span>
                <span className="text-xs font-normal text-[#98A2B3]">({templates.length} active)</span>
              </h2>
              <p className="text-xs text-[#98A2B3]">
                Templates rendered automatically upon domain events (Registration, Referral Signups, Node Activations, Deposits, Rewards, Swaps).
              </p>
            </div>
            <button
              onClick={() => fetchTemplates()}
              disabled={loadingTemplates}
              className="p-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-[#98A2B3] hover:text-white transition-colors cursor-pointer"
              title="Refresh templates"
            >
              <RefreshCw className={`w-4 h-4 ${loadingTemplates ? 'animate-spin text-[#00CFFF]' : ''}`} />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {templates.map((tpl) => (
              <div
                key={tpl.id}
                className="p-5 rounded-2xl bg-[#07101D] border border-white/[0.08] hover:border-white/[0.15] transition-all flex flex-col justify-between space-y-4 shadow-lg group"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-0.5 rounded-md bg-[#00CFFF]/10 border border-[#00CFFF]/25 text-[#00CFFF] text-[11px] font-mono font-bold">
                      {tpl.eventName}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold flex items-center gap-1 ${
                        tpl.enabled
                          ? 'bg-[#32D583]/10 text-[#32D583] border border-[#32D583]/30'
                          : 'bg-[#F04438]/10 text-[#F04438] border border-[#F04438]/30'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${tpl.enabled ? 'bg-[#32D583]' : 'bg-[#F04438]'}`} />
                      {tpl.enabled ? 'ENABLED' : 'DISABLED'}
                    </span>
                  </div>

                  <h3 className="text-sm font-bold text-white group-hover:text-[#00CFFF] transition-colors line-clamp-1">
                    {tpl.subject}
                  </h3>

                  <div className="p-3 rounded-xl bg-[#05070B] border border-white/[0.04] text-[11px] text-[#98A2B3] font-mono max-h-24 overflow-hidden relative">
                    <div className="line-clamp-3">{tpl.bodyHtml.replace(/<[^>]+>/g, ' ')}</div>
                    <div className="absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-[#05070B] to-transparent pointer-events-none" />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-white/[0.06]">
                  <span className="text-[10px] text-[#64748b] font-mono">
                    Updated: {new Date(tpl.createdAt).toLocaleDateString()}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setEditingTemplate(tpl);
                        setTemplateSubject(tpl.subject);
                        setTemplateBody(tpl.bodyHtml);
                        setTemplateEnabled(tpl.enabled);
                        setTemplatePreviewMode(false);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-[#00CFFF]/10 hover:bg-[#00CFFF]/20 text-[#00CFFF] border border-[#00CFFF]/30 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Edit2 className="w-3 h-3" />
                      <span>Configure</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. BROADCAST CAMPAIGNS SUB-TAB                                            */}
      {/* ========================================================================= */}
      {activeSubTab === 'campaigns' && (
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-[#07101D] border border-white/[0.08] space-y-5 shadow-xl max-w-4xl">
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Send className="w-4 h-4 text-[#00CFFF]" />
                <span>On-Demand Protocol Broadcast Campaign</span>
              </h2>
              <p className="text-xs text-[#98A2B3]">
                Compose and broadcast branded email transmissions to targeted user cohorts. All transmissions are processed via the asynchronous transactional queue.
              </p>
            </div>

            {/* Target Audience Selector */}
            <div className="space-y-2">
              <label className="text-xs font-mono uppercase tracking-wider text-[#98A2B3]">
                Target Audience Cohort
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { id: 'ALL', label: 'All Registered Operators', desc: 'Active platform user accounts', icon: Users },
                  { id: 'ACTIVE_USERS', label: 'Active Operators Only', desc: 'Non-suspended accounts', icon: CheckCircle2 },
                  { id: 'NODE_HOLDERS', label: 'Genesis Node Holders', desc: 'Operators holding confirmed nodes', icon: Server },
                ].map((aud) => {
                  const Icon = aud.icon;
                  const isSelected = campaignAudience === aud.id;
                  return (
                    <button
                      key={aud.id}
                      type="button"
                      onClick={() => setCampaignAudience(aud.id as any)}
                      className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                        isSelected
                          ? 'bg-[#00CFFF]/10 border-[#00CFFF] text-white shadow-md shadow-[#00CFFF]/10'
                          : 'bg-[#05070B] border-white/[0.08] text-[#98A2B3] hover:border-white/[0.2]'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <Icon className={`w-4 h-4 ${isSelected ? 'text-[#00CFFF]' : 'text-[#98A2B3]'}`} />
                        {isSelected && <Check className="w-3.5 h-3.5 text-[#00CFFF]" />}
                      </div>
                      <div>
                        <div className="text-xs font-bold text-white">{aud.label}</div>
                        <div className="text-[10px] text-[#98A2B3] mt-0.5">{aud.desc}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Campaign Subject */}
            <div className="space-y-2">
              <label className="text-xs font-mono uppercase tracking-wider text-[#98A2B3]">
                Email Subject Line
              </label>
              <input
                type="text"
                value={campaignSubject}
                onChange={(e) => setCampaignSubject(e.target.value)}
                placeholder="e.g. Major Protocol Halving Update & Era 1 Telemetry Notice"
                className="w-full px-4 py-2.5 rounded-xl bg-[#05070B] border border-white/[0.1] text-white text-xs sm:text-sm focus:outline-none focus:border-[#00CFFF] font-mono transition-colors"
              />
            </div>

            {/* HTML Body Editor & Preview */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-mono uppercase tracking-wider text-[#98A2B3]">
                  HTML Message Body
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCampaignPreviewMode(!campaignPreviewMode)}
                    className="px-2.5 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-[#00CFFF] text-xs font-mono flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Eye className="w-3 h-3" />
                    <span>{campaignPreviewMode ? 'Edit HTML' : 'Live Preview'}</span>
                  </button>
                </div>
              </div>

              {campaignPreviewMode ? (
                <div className="p-4 rounded-xl bg-[#05070B] border border-white/[0.1] min-h-[260px] overflow-auto text-white">
                  <div
                    dangerouslySetInnerHTML={{
                      __html: campaignBody || '<div style="color: #64748b; font-family: monospace;">[No content entered yet]</div>',
                    }}
                  />
                </div>
              ) : (
                <textarea
                  value={campaignBody}
                  onChange={(e) => setCampaignBody(e.target.value)}
                  rows={10}
                  placeholder="<h2>Important Announcement</h2><p>Dear {{displayName}}, we are excited to announce...</p>"
                  className="w-full p-4 rounded-xl bg-[#05070B] border border-white/[0.1] text-white text-xs font-mono focus:outline-none focus:border-[#00CFFF] transition-colors"
                />
              )}

              <div className="text-[11px] text-[#64748b] flex flex-wrap items-center gap-2 pt-1 font-mono">
                <span>Supported merge tags:</span>
                <span className="px-1.5 py-0.5 bg-white/[0.05] rounded text-[#00CFFF]">{'{{displayName}}'}</span>
                <span className="px-1.5 py-0.5 bg-white/[0.05] rounded text-[#00CFFF]">{'{{publicId}}'}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="pt-4 border-t border-white/[0.08] flex items-center justify-between">
              <div className="text-xs text-[#98A2B3]">
                Target: <span className="text-[#00CFFF] font-mono font-bold">{campaignAudience}</span>
              </div>
              <button
                type="button"
                onClick={() => setShowCampaignConfirm(true)}
                disabled={sendingCampaign || !campaignSubject.trim() || !campaignBody.trim()}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#00CFFF] to-[#168BFF] hover:opacity-90 disabled:opacity-50 text-[#05070B] text-xs font-bold flex items-center gap-2 transition-all cursor-pointer shadow-lg shadow-[#00CFFF]/20"
              >
                <Send className="w-4 h-4" />
                <span>Dispatch Broadcast</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. AUTOMATION RULES SUB-TAB                                               */}
      {/* ========================================================================= */}
      {activeSubTab === 'automation' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>Automated Performance Follow-Up Engine</span>
                <span className="text-xs font-normal text-[#98A2B3]">({rules.length} configured)</span>
              </h2>
              <p className="text-xs text-[#98A2B3]">
                Triggers targeted follow-up transmissions based on milestones, network growth, and inactivity with anti-spam cooldown protection.
              </p>
            </div>
            <button
              onClick={() => {
                setIsNewRule(true);
                setEditingRule(null);
                setRuleName('');
                setRuleCriteria('STRONG_GROWTH');
                setRuleDelayHours(0);
                setRuleCooldownDays(7);
                setRuleTemplateId(templates[0]?.id || '');
                setRuleEnabled(true);
              }}
              className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#00CFFF] to-[#168BFF] text-[#05070B] text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-md shadow-[#00CFFF]/20"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Rule</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {rules.map((rule) => {
              const linkedTemplate = templates.find((t) => t.id === rule.templateId);
              return (
                <div
                  key={rule.id}
                  className="p-5 rounded-2xl bg-[#07101D] border border-white/[0.08] hover:border-white/[0.15] transition-all flex flex-col justify-between space-y-4 shadow-lg group"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="px-2.5 py-0.5 rounded-md bg-[#168BFF]/15 border border-[#168BFF]/30 text-[#00CFFF] text-[10px] font-mono font-bold">
                        {rule.triggerCriteria}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold flex items-center gap-1 ${
                          rule.enabled
                            ? 'bg-[#32D583]/10 text-[#32D583] border border-[#32D583]/30'
                            : 'bg-[#F04438]/10 text-[#F04438] border border-[#F04438]/30'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${rule.enabled ? 'bg-[#32D583]' : 'bg-[#F04438]'}`} />
                        {rule.enabled ? 'ACTIVE' : 'PAUSED'}
                      </span>
                    </div>

                    <div>
                      <h3 className="text-sm font-bold text-white group-hover:text-[#00CFFF] transition-colors">
                        {rule.name}
                      </h3>
                      <div className="text-[11px] text-[#98A2B3] mt-1">
                        Template: <span className="text-white font-mono">{linkedTemplate?.eventName || 'Default'}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/[0.04] text-xs font-mono">
                      <div className="p-2 rounded-lg bg-[#05070B] border border-white/[0.04]">
                        <div className="text-[10px] text-[#98A2B3]">Delay Hours</div>
                        <div className="text-white font-bold">{rule.delayHours}h</div>
                      </div>
                      <div className="p-2 rounded-lg bg-[#05070B] border border-white/[0.04]">
                        <div className="text-[10px] text-[#98A2B3]">Cooldown</div>
                        <div className="text-white font-bold">{rule.cooldownDays} days</div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-white/[0.06]">
                    <span className="text-[10px] text-[#64748b] font-mono">
                      Created: {new Date(rule.createdAt).toLocaleDateString()}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setIsNewRule(false);
                          setEditingRule(rule);
                          setRuleName(rule.name);
                          setRuleCriteria(rule.triggerCriteria);
                          setRuleDelayHours(rule.delayHours);
                          setRuleCooldownDays(rule.cooldownDays);
                          setRuleTemplateId(rule.templateId);
                          setRuleEnabled(rule.enabled);
                        }}
                        className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-[#00CFFF] transition-colors cursor-pointer"
                        title="Edit Rule"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteRule(rule.id, rule.name)}
                        className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-[#F04438]/20 text-[#F04438] transition-colors cursor-pointer"
                        title="Delete Rule"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. QUEUE & OUTBOX MONITOR SUB-TAB                                         */}
      {/* ========================================================================= */}
      {activeSubTab === 'queue' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>Email Transmission Outbox & Queue Monitor</span>
                <span className="text-xs font-normal text-[#98A2B3]">({queueTotal} records)</span>
              </h2>
              <p className="text-xs text-[#98A2B3]">
                Authoritative record of every outbound email transmission, delivery status, and provider message identifiers.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleProcessQueue}
                disabled={processingQueue}
                className="px-3.5 py-1.5 rounded-xl bg-[#00CFFF]/15 hover:bg-[#00CFFF]/25 text-[#00CFFF] border border-[#00CFFF]/40 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <RotateCcw className={`w-3.5 h-3.5 ${processingQueue ? 'animate-spin' : ''}`} />
                <span>Process Queue Now</span>
              </button>
              <button
                onClick={() => fetchQueue(queuePage)}
                disabled={loadingQueue}
                className="p-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-[#98A2B3] hover:text-white transition-colors cursor-pointer"
              >
                <RefreshCw className={`w-4 h-4 ${loadingQueue ? 'animate-spin text-[#00CFFF]' : ''}`} />
              </button>
            </div>
          </div>

          {/* Filters Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 p-3 rounded-xl bg-[#07101D] border border-white/[0.08]">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-[#98A2B3] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={queueSearch}
                onChange={(e) => {
                  setQueueSearch(e.target.value);
                  fetchQueue(1, queueStatusFilter, e.target.value);
                }}
                placeholder="Search by recipient email or subject..."
                className="w-full pl-9 pr-4 py-2 rounded-lg bg-[#05070B] border border-white/[0.08] text-xs text-white placeholder-[#98A2B3] focus:outline-none focus:border-[#00CFFF]"
              />
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              {['ALL', 'QUEUED', 'SENT', 'DELIVERED', 'FAILED'].map((st) => (
                <button
                  key={st}
                  onClick={() => {
                    setQueueStatusFilter(st);
                    setQueuePage(1);
                    fetchQueue(1, st, queueSearch);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    queueStatusFilter === st
                      ? 'bg-[#00CFFF] text-[#05070B] font-bold'
                      : 'bg-white/[0.04] text-[#98A2B3] hover:text-white'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          {/* Table */}
          <div className="rounded-2xl bg-[#07101D] border border-white/[0.08] overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-white/[0.08] bg-white/[0.02] text-[#98A2B3] font-mono text-[11px] uppercase">
                    <th className="py-3 px-4">Recipient</th>
                    <th className="py-3 px-4">Subject</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Provider ID / Error</th>
                    <th className="py-3 px-4">Created / Sent At</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {queueItems.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-[#98A2B3] font-mono">
                        No email queue records found matching filter.
                      </td>
                    </tr>
                  ) : (
                    queueItems.map((item) => {
                      const statusColor =
                        item.status === 'DELIVERED' ? 'text-[#32D583] bg-[#32D583]/10 border-[#32D583]/30' :
                        item.status === 'SENT' ? 'text-[#00CFFF] bg-[#00CFFF]/10 border-[#00CFFF]/30' :
                        item.status === 'QUEUED' ? 'text-[#FFB020] bg-[#FFB020]/10 border-[#FFB020]/30' :
                        'text-[#F04438] bg-[#F04438]/10 border-[#F04438]/30';

                      return (
                        <tr key={item.id} className="hover:bg-white/[0.02] transition-colors">
                          <td className="py-3 px-4 font-mono font-bold text-white max-w-[180px] truncate">
                            {item.toEmail}
                          </td>
                          <td className="py-3 px-4 max-w-[260px] truncate text-white" title={item.subject}>
                            {item.subject}
                          </td>
                          <td className="py-3 px-4">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border ${statusColor}`}>
                              {item.status}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono text-[11px] text-[#98A2B3] max-w-[180px] truncate">
                            {item.errorMessage ? (
                              <span className="text-[#F04438]" title={item.errorMessage}>
                                {item.errorMessage}
                              </span>
                            ) : item.providerMessageId ? (
                              <span title={item.providerMessageId}>{item.providerMessageId}</span>
                            ) : (
                              <span className="text-[#64748b]">—</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-[#98A2B3] font-mono text-[11px]">
                            <div>{new Date(item.createdAt).toLocaleTimeString()}</div>
                            <div className="text-[10px] text-[#64748b]">{new Date(item.createdAt).toLocaleDateString()}</div>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {item.status === 'FAILED' && (
                                <button
                                  onClick={() => handleRetryItem(item.id)}
                                  className="px-2 py-1 rounded bg-[#00CFFF]/10 hover:bg-[#00CFFF]/20 text-[#00CFFF] text-[10px] font-mono font-bold transition-colors cursor-pointer"
                                  title="Retry this email"
                                >
                                  Retry
                                </button>
                              )}
                              <button
                                onClick={() => setSelectedQueueItem(item)}
                                className="p-1 rounded bg-white/[0.04] hover:bg-white/[0.08] text-[#98A2B3] hover:text-white transition-colors cursor-pointer"
                                title="View content"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {queueTotal > 15 && (
              <div className="p-3 border-t border-white/[0.06] flex items-center justify-between text-xs text-[#98A2B3]">
                <div>
                  Page <span className="text-white font-bold">{queuePage}</span> of{' '}
                  <span className="text-white font-bold">{Math.ceil(queueTotal / 15)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    disabled={queuePage <= 1}
                    onClick={() => {
                      const next = queuePage - 1;
                      setQueuePage(next);
                      fetchQueue(next);
                    }}
                    className="px-3 py-1 rounded bg-white/[0.04] hover:bg-white/[0.08] disabled:opacity-40 text-white cursor-pointer"
                  >
                    Previous
                  </button>
                  <button
                    disabled={queuePage >= Math.ceil(queueTotal / 15)}
                    onClick={() => {
                      const next = queuePage + 1;
                      setQueuePage(next);
                      fetchQueue(next);
                    }}
                    className="px-3 py-1 rounded bg-white/[0.04] hover:bg-white/[0.08] disabled:opacity-40 text-white cursor-pointer"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. DIAGNOSTICS & WEBHOOKS SUB-TAB                                         */}
      {/* ========================================================================= */}
      {activeSubTab === 'diagnostics' && (
        <div className="space-y-6 max-w-4xl">
          <div className="p-6 rounded-2xl bg-[#07101D] border border-white/[0.08] space-y-4 shadow-xl">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Radio className="w-5 h-5 text-[#00CFFF]" />
              <span>Email Delivery & Provider Webhook Infrastructure</span>
            </h2>
            <p className="text-xs text-[#98A2B3]">
              PHIVONEX operates a high-reliability dual delivery engine integrating transactional SMTP/API providers (Resend / Mock Provider) with cryptographically validated webhook callbacks.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3">
              <div className="p-4 rounded-xl bg-[#05070B] border border-white/[0.06] space-y-2">
                <div className="text-xs font-mono uppercase text-[#00CFFF]">Active Provider Engine</div>
                <div className="text-sm font-bold text-white">Resend API Provider</div>
                <p className="text-[11px] text-[#98A2B3]">
                  Configured via server-side environment parameters. High deliverability SPF/DKIM authenticated domain.
                </p>
                <div className="flex items-center gap-1.5 text-[10px] text-[#32D583] font-mono pt-1">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Authoritative TLS 1.3 Encryption Active</span>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-[#05070B] border border-white/[0.06] space-y-2">
                <div className="text-xs font-mono uppercase text-[#32D583]">Inbound Webhook Endpoint</div>
                <div className="text-xs font-mono font-bold text-white bg-white/[0.05] p-2 rounded-lg break-all">
                  POST /api/webhooks/email
                </div>
                <p className="text-[11px] text-[#98A2B3]">
                  Processes delivered, bounced, and failed notifications in real-time. Verified using Svix / HMAC-SHA256 signatures with 300s replay prevention.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-[#05070B] border border-white/[0.06] space-y-2 md:col-span-2">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-mono uppercase text-[#00CFFF] flex items-center gap-1.5">
                    <BellRing className="w-3.5 h-3.5" />
                    <span>Real-Time Web Push Diagnostics</span>
                  </div>
                  <button
                    onClick={handleAdminTestPush}
                    disabled={testPushLoading}
                    className="px-3.5 py-1.5 rounded-lg bg-[#00CFFF]/10 hover:bg-[#00CFFF]/20 border border-[#00CFFF]/30 text-[#00CFFF] font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                  >
                    {testPushLoading ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Sending Push...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" />
                        <span>Dispatch Test Push Alert</span>
                      </>
                    )}
                  </button>
                </div>
                <p className="text-[11px] text-[#98A2B3]">
                  Dispatches a live cryptographic push message directly to your current administrative session to verify active browser subscription tokens and background delivery channels.
                </p>
                {testPushResult && (
                  <div className={`mt-2 p-2.5 rounded-lg text-xs flex items-center gap-2 ${
                    testPushResult.success
                      ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300'
                      : 'bg-rose-500/10 border border-rose-500/20 text-rose-300'
                  }`}>
                    {testPushResult.success ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                    )}
                    <span>{testPushResult.message}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="p-6 rounded-2xl bg-[#07101D] border border-white/[0.08] space-y-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#32D583]" />
              <span>Authoritative Deliverability Audit Protocol</span>
            </h3>
            <ul className="text-xs text-[#98A2B3] space-y-1.5 list-disc pl-5 leading-relaxed">
              <li>
                <strong className="text-white">Anti-Spam Cooldown Enforcement:</strong> User automation triggers respect strict multi-day cooldowns to protect operator email hygiene.
              </li>
              <li>
                <strong className="text-white">Privacy Guard:</strong> Referral notifications mask referred operator details to ensure confidential sponsor relationships.
              </li>
              <li>
                <strong className="text-white">Non-Blocking Queue Processing:</strong> Outbox processing runs asynchronously in non-blocking event loops, preventing thread pool starvation.
              </li>
              <li>
                <strong className="text-white">Dual Firestore Audit Sync:</strong> Administrative email broadcasts and template mutations are recorded into the authoritative compliance audit log.
              </li>
            </ul>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODALS                                                                    */}
      {/* ========================================================================= */}

      {/* 1. Template Edit Modal */}
      {editingTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="max-w-2xl w-full bg-[#07101D] border border-white/[0.12] rounded-2xl shadow-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Code className="w-4 h-4 text-[#00CFFF]" />
                  <span>Configure Template: {editingTemplate.eventName}</span>
                </h3>
                <p className="text-[11px] text-[#98A2B3]">
                  Edit subject line, message HTML content, and activation state.
                </p>
              </div>
              <button
                onClick={() => setEditingTemplate(null)}
                className="p-1.5 rounded-lg bg-white/[0.04] text-[#98A2B3] hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-mono uppercase text-[#98A2B3]">Subject Line</label>
                <input
                  type="text"
                  value={templateSubject}
                  onChange={(e) => setTemplateSubject(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#05070B] border border-white/[0.1] text-white text-xs sm:text-sm font-mono focus:outline-none focus:border-[#00CFFF]"
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-[#05070B] border border-white/[0.06]">
                <div className="space-y-0.5">
                  <div className="text-xs font-bold text-white">Enable Automated Delivery</div>
                  <div className="text-[11px] text-[#98A2B3]">
                    When disabled, system events for {editingTemplate.eventName} will not dispatch outbound emails.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setTemplateEnabled(!templateEnabled)}
                  className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer ${
                    templateEnabled ? 'bg-[#32D583]' : 'bg-white/[0.1]'
                  }`}
                >
                  <span
                    className={`block w-5 h-5 rounded-full bg-white transition-transform ${
                      templateEnabled ? 'translate-x-6' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-mono uppercase text-[#98A2B3]">HTML Body Content</label>
                  <button
                    type="button"
                    onClick={() => setTemplatePreviewMode(!templatePreviewMode)}
                    className="px-2.5 py-1 rounded bg-white/[0.05] hover:bg-white/[0.1] text-[#00CFFF] text-[11px] font-mono flex items-center gap-1 cursor-pointer"
                  >
                    <Eye className="w-3 h-3" />
                    <span>{templatePreviewMode ? 'Edit Raw HTML' : 'Live Preview'}</span>
                  </button>
                </div>

                {templatePreviewMode ? (
                  <div className="p-4 rounded-xl bg-[#05070B] border border-white/[0.1] min-h-[220px] max-h-[300px] overflow-auto">
                    <div dangerouslySetInnerHTML={{ __html: templateBody }} />
                  </div>
                ) : (
                  <textarea
                    value={templateBody}
                    onChange={(e) => setTemplateBody(e.target.value)}
                    rows={8}
                    className="w-full p-3 rounded-xl bg-[#05070B] border border-white/[0.1] text-white text-xs font-mono focus:outline-none focus:border-[#00CFFF]"
                  />
                )}
              </div>
            </div>

            <div className="pt-4 border-t border-white/[0.08] flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setEditingTemplate(null)}
                className="px-4 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-white text-xs font-bold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveTemplate}
                disabled={savingTemplate || !templateSubject.trim()}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-[#00CFFF] to-[#168BFF] text-[#05070B] text-xs font-bold transition-all cursor-pointer shadow-lg shadow-[#00CFFF]/20"
              >
                {savingTemplate ? 'Saving...' : 'Save Template'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Broadcast Confirmation Modal */}
      {showCampaignConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="max-w-md w-full bg-[#07101D] border border-[#00CFFF]/30 rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="w-10 h-10 rounded-xl bg-[#00CFFF]/10 border border-[#00CFFF]/30 flex items-center justify-center text-[#00CFFF]">
              <Send className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-white">Confirm Broadcast Dispatch</h3>
            <p className="text-xs text-[#98A2B3]">
              Are you sure you want to broadcast this message to audience cohort{' '}
              <strong className="text-white font-mono">{campaignAudience}</strong>? This will create queue entries for all eligible operators.
            </p>

            <div className="p-3 rounded-xl bg-[#05070B] border border-white/[0.06] text-xs space-y-1">
              <div className="text-[#98A2B3]">Subject:</div>
              <div className="text-white font-mono font-bold truncate">{campaignSubject}</div>
            </div>

            <div className="pt-2 flex items-center justify-end gap-3">
              <button
                onClick={() => setShowCampaignConfirm(false)}
                className="px-4 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-white text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSendCampaign}
                disabled={sendingCampaign}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-[#00CFFF] to-[#168BFF] text-[#05070B] text-xs font-bold cursor-pointer shadow-lg shadow-[#00CFFF]/20"
              >
                {sendingCampaign ? 'Queueing...' : 'Confirm & Dispatch'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Automation Rule Modal (Create / Edit) */}
      {(editingRule || isNewRule) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="max-w-lg w-full bg-[#07101D] border border-white/[0.12] rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Sliders className="w-4 h-4 text-[#00CFFF]" />
                <span>{isNewRule ? 'Create Automation Rule' : 'Configure Automation Rule'}</span>
              </h3>
              <button
                onClick={() => {
                  setEditingRule(null);
                  setIsNewRule(false);
                }}
                className="p-1.5 rounded-lg bg-white/[0.04] text-[#98A2B3] hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3.5">
              <div className="space-y-1">
                <label className="text-xs font-mono uppercase text-[#98A2B3]">Rule Name</label>
                <input
                  type="text"
                  value={ruleName}
                  onChange={(e) => setRuleName(e.target.value)}
                  placeholder="e.g. Strong Network Growth Encouragement"
                  className="w-full px-3.5 py-2 rounded-xl bg-[#05070B] border border-white/[0.1] text-white text-xs font-mono focus:outline-none focus:border-[#00CFFF]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-mono uppercase text-[#98A2B3]">Trigger Criteria</label>
                <select
                  value={ruleCriteria}
                  onChange={(e) => setRuleCriteria(e.target.value as any)}
                  className="w-full px-3.5 py-2 rounded-xl bg-[#05070B] border border-white/[0.1] text-white text-xs font-mono focus:outline-none focus:border-[#00CFFF]"
                >
                  <option value="STRONG_GROWTH">STRONG_GROWTH — Fast Direct Sponsor Progress</option>
                  <option value="MATCHING_ACTIVITY">MATCHING_ACTIVITY — High Volume Binary Activity</option>
                  <option value="NODE_SALES">NODE_SALES — Node Purchase Milestones</option>
                  <option value="MILESTONE_PROGRESS">MILESTONE_PROGRESS — Rank Advancement</option>
                  <option value="INACTIVITY">INACTIVITY — Re-engagement After Inactivity</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-mono uppercase text-[#98A2B3]">Associated Email Template</label>
                <select
                  value={ruleTemplateId}
                  onChange={(e) => setRuleTemplateId(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-[#05070B] border border-white/[0.1] text-white text-xs font-mono focus:outline-none focus:border-[#00CFFF]"
                >
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.eventName} — {t.subject}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-mono uppercase text-[#98A2B3]">Delay (Hours)</label>
                  <input
                    type="number"
                    min="0"
                    value={ruleDelayHours}
                    onChange={(e) => setRuleDelayHours(parseInt(e.target.value, 10) || 0)}
                    className="w-full px-3 py-2 rounded-xl bg-[#05070B] border border-white/[0.1] text-white text-xs font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-mono uppercase text-[#98A2B3]">Cooldown (Days)</label>
                  <input
                    type="number"
                    min="1"
                    value={ruleCooldownDays}
                    onChange={(e) => setRuleCooldownDays(parseInt(e.target.value, 10) || 1)}
                    className="w-full px-3 py-2 rounded-xl bg-[#05070B] border border-white/[0.1] text-white text-xs font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-[#05070B] border border-white/[0.06]">
                <div className="text-xs font-bold text-white">Rule Active Status</div>
                <button
                  type="button"
                  onClick={() => setRuleEnabled(!ruleEnabled)}
                  className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer ${
                    ruleEnabled ? 'bg-[#32D583]' : 'bg-white/[0.1]'
                  }`}
                >
                  <span
                    className={`block w-5 h-5 rounded-full bg-white transition-transform ${
                      ruleEnabled ? 'translate-x-6' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>
            </div>

            <div className="pt-3 border-t border-white/[0.08] flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setEditingRule(null);
                  setIsNewRule(false);
                }}
                className="px-4 py-2 rounded-xl bg-white/[0.04] text-white text-xs font-bold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveRule}
                disabled={savingRule || !ruleName.trim()}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-[#00CFFF] to-[#168BFF] text-[#05070B] text-xs font-bold shadow-lg shadow-[#00CFFF]/20"
              >
                {savingRule ? 'Saving...' : 'Save Rule'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. Queue Item Content Detail Modal */}
      {selectedQueueItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="max-w-xl w-full bg-[#07101D] border border-white/[0.12] rounded-2xl shadow-2xl p-6 space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
              <div>
                <h3 className="text-sm font-bold text-white truncate max-w-sm">
                  {selectedQueueItem.subject}
                </h3>
                <div className="text-[11px] font-mono text-[#98A2B3]">
                  To: <span className="text-[#00CFFF]">{selectedQueueItem.toEmail}</span>
                </div>
              </div>
              <button
                onClick={() => setSelectedQueueItem(null)}
                className="p-1.5 rounded-lg bg-white/[0.04] text-[#98A2B3] hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 rounded-xl bg-[#05070B] border border-white/[0.06] text-xs space-y-1">
              <div className="flex justify-between font-mono text-[11px]">
                <span className="text-[#98A2B3]">Status:</span>
                <span className="text-white font-bold">{selectedQueueItem.status}</span>
              </div>
              {selectedQueueItem.providerMessageId && (
                <div className="flex justify-between font-mono text-[11px]">
                  <span className="text-[#98A2B3]">Provider Msg ID:</span>
                  <span className="text-[#32D583]">{selectedQueueItem.providerMessageId}</span>
                </div>
              )}
              {selectedQueueItem.errorMessage && (
                <div className="flex justify-between font-mono text-[11px]">
                  <span className="text-[#98A2B3]">Error:</span>
                  <span className="text-[#F04438]">{selectedQueueItem.errorMessage}</span>
                </div>
              )}
            </div>

            <div className="space-y-1">
              <div className="text-xs font-mono uppercase text-[#98A2B3]">Transmitted Body HTML:</div>
              <div className="p-4 rounded-xl bg-[#05070B] border border-white/[0.08] max-h-72 overflow-y-auto">
                <div dangerouslySetInnerHTML={{ __html: selectedQueueItem.bodyHtml }} />
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setSelectedQueueItem(null)}
                className="px-4 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-white text-xs font-bold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
