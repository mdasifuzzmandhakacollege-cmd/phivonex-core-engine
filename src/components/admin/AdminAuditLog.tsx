import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck,
  Activity,
  Search,
  RefreshCw,
  Download,
  Server,
  DollarSign,
  FileText,
  Eye,
  Sliders,
  Database,
  Cloud,
  X,
  PlusCircle,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import {
  FirestoreAdminAuditLog,
  subscribeToFirestoreAuditLogs,
  recordAdminAuditToFirestore,
  getFirestoreAuditLogs
} from '../../services/firestoreAuditService';
import { AuditLogger, SystemAuditLog } from '../../services/auditLogger';
import { useAuth } from '../../context/AuthContext';

export type AuditCategory = 'ALL' | 'CONFIG_UPDATE' | 'TREASURY_MOVEMENT' | 'FINANCIAL_SETTLEMENT' | 'SECURITY';

export const AdminAuditLog: React.FC = () => {
  const { user } = useAuth();
  const [category, setCategory] = useState<AuditCategory>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [events, setEvents] = useState<FirestoreAdminAuditLog[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [firestoreConnected, setFirestoreConnected] = useState<boolean>(true);
  const [selectedEvent, setSelectedEvent] = useState<FirestoreAdminAuditLog | null>(null);
  const [exporting, setExporting] = useState<boolean>(false);
  const [manualCreating, setManualCreating] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Real-time Firestore Subscription
  useEffect(() => {
    setLoading(true);
    let unsubscribe: () => void = () => {};

    try {
      unsubscribe = subscribeToFirestoreAuditLogs((firestoreLogs) => {
        setEvents(firestoreLogs);
        setFirestoreConnected(true);
        setLoading(false);
        setRefreshing(false);
      }, 100);
    } catch (err) {
      console.warn('[AdminAuditLog] Firestore real-time listener error, falling back to REST query:', err);
      setFirestoreConnected(false);
      getFirestoreAuditLogs(50).then((logs) => {
        setEvents(logs);
        setLoading(false);
      });
    }

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, []);

  // Manual Refresh
  const handleManualRefresh = async () => {
    try {
      setRefreshing(true);
      const freshLogs = await getFirestoreAuditLogs(100);
      setEvents(freshLogs);
      setFirestoreConnected(true);
    } catch (err) {
      console.error('[AdminAuditLog] Manual refresh error:', err);
    } finally {
      setRefreshing(false);
    }
  };

  // Test / Verification Audit Log Trigger
  const handleCreateTestAuditEvent = async (categoryType: 'CONFIG_UPDATE' | 'TREASURY_MOVEMENT') => {
    try {
      setManualCreating(true);
      setFeedback(null);

      const actionName = categoryType === 'CONFIG_UPDATE'
        ? 'MANUAL_ECONOMIC_AUDIT_PING'
        : 'TREASURY_REBALANCE_VERIFICATION';

      const detailsText = categoryType === 'CONFIG_UPDATE'
        ? 'Admin manually verified economic configuration consistency and logged status in Cloud Firestore.'
        : 'Admin initiated hot wallet reserve health check and treasury rebalance verification.';

      const created = await recordAdminAuditToFirestore({
        action: actionName,
        category: categoryType,
        actorId: user?.publicId || 'ADM-GLOBAL',
        actorEmail: user?.email || 'admin@phivonex.com',
        actorRole: (user as any)?.role || 'SUPER_ADMIN',
        targetType: categoryType === 'CONFIG_UPDATE' ? 'ECONOMIC_MODULE' : 'TREASURY_RESERVE',
        targetId: categoryType === 'CONFIG_UPDATE' ? 'PHX_CONFIG_LIVE' : 'TREASURY_COLD_0x71C8',
        details: detailsText,
        previousState: { status: 'NORMAL', latencyMs: 24 },
        newState: { status: 'VERIFIED', verifiedAt: new Date().toISOString() },
      });

      setFeedback({
        type: 'success',
        message: `Successfully recorded ${created.action} to Firestore (Doc ID: ${created.id.slice(0, 8)}...).`,
      });
    } catch (err: any) {
      console.error('[AdminAuditLog] Error recording test audit event:', err);
      setFeedback({
        type: 'error',
        message: err.message || 'Failed to record audit event to Firestore.',
      });
    } finally {
      setManualCreating(false);
    }
  };

  // Filtered Events
  const filteredEvents = events.filter((e) => {
    const matchesCategory = category === 'ALL' || e.category === category;
    const matchesSearch =
      !searchQuery ||
      e.action?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.actorId?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.details?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.targetId?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.targetType?.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesCategory && matchesSearch;
  });

  // Export CSV Report
  const handleExportCsv = async () => {
    try {
      setExporting(true);
      setFeedback(null);
      const res = await AuditLogger.exportLogsToCsvFile({
        category,
        searchQuery,
        filename: `phivonex_compliance_audit_logs_${Date.now()}.csv`,
      });
      setFeedback({
        type: 'success',
        message: `Successfully exported ${res.count} audit log records to CSV (${res.filename}).`,
      });
    } catch (err: any) {
      console.error('[AdminAuditLog] CSV export failed:', err);
      setFeedback({
        type: 'error',
        message: err.message || 'Failed to export CSV compliance report.',
      });
    } finally {
      setExporting(false);
    }
  };

  const getCategoryBadge = (cat: FirestoreAdminAuditLog['category']) => {
    switch (cat) {
      case 'CONFIG_UPDATE':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center gap-1">
            <Sliders className="w-3 h-3" /> CONFIG UPDATE
          </span>
        );
      case 'TREASURY_MOVEMENT':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#32D583]/10 text-[#32D583] border border-[#32D583]/30 flex items-center gap-1">
            <DollarSign className="w-3 h-3" /> TREASURY MOVEMENT
          </span>
        );
      case 'FINANCIAL_SETTLEMENT':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#00CFFF]/10 text-[#00CFFF] border border-[#00CFFF]/30 flex items-center gap-1">
            <Server className="w-3 h-3" /> SETTLEMENT
          </span>
        );
      case 'SECURITY':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-purple-500/10 text-purple-300 border border-purple-500/30 flex items-center gap-1">
            <ShieldCheck className="w-3 h-3" /> SECURITY
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-800 text-slate-300">
            SYSTEM
          </span>
        );
    }
  };

  const configCount = events.filter((e) => e.category === 'CONFIG_UPDATE').length;
  const treasuryCount = events.filter((e) => e.category === 'TREASURY_MOVEMENT').length;
  const settlementCount = events.filter((e) => e.category === 'FINANCIAL_SETTLEMENT').length;
  const securityCount = events.filter((e) => e.category === 'SECURITY').length;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header Banner */}
      <div className="p-6 rounded-2xl bg-gradient-to-b from-[#0A192F] to-[#07101D] border border-white/[0.08] flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex flex-wrap items-center gap-2.5 mb-2">
            <div className="p-2 rounded-xl bg-[#00CFFF]/10 border border-[#00CFFF]/30 text-[#00CFFF]">
              <Cloud className="w-5 h-5 text-[#00CFFF]" />
            </div>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-semibold bg-[#00CFFF]/10 border border-[#00CFFF]/30 text-[#00CFFF] flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00CFFF] animate-pulse" />
              FIRESTORE STORAGE ENGINE: ACTIVE
            </span>
            <span className="px-2 py-0.5 rounded-full text-[11px] font-mono bg-white/[0.04] text-[#98A2B3] border border-white/[0.08]">
              Collection: system_audit_logs
            </span>
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight">
            Administrative Audit Trail (Cloud Firestore)
          </h1>
          <p className="text-xs text-[#98A2B3] mt-1 max-w-xl">
            Immutable, real-time administrative audit repository recording sensitive system configuration updates, treasury movements, and on-chain withdrawal settlements backed by Cloud Firestore.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => handleCreateTestAuditEvent('CONFIG_UPDATE')}
            disabled={manualCreating}
            className="px-3 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
            title="Record sample config update in Firestore"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>Audit Config Ping</span>
          </button>

          <button
            onClick={() => handleCreateTestAuditEvent('TREASURY_MOVEMENT')}
            disabled={manualCreating}
            className="px-3 py-2 rounded-xl bg-[#32D583]/15 hover:bg-[#32D583]/25 border border-[#32D583]/40 text-[#32D583] text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
            title="Record sample treasury check in Firestore"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>Audit Treasury Ping</span>
          </button>

          <button
            onClick={handleManualRefresh}
            disabled={refreshing}
            className="px-3.5 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-white text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            onClick={handleExportCsv}
            disabled={exporting || filteredEvents.length === 0}
            className="px-4 py-2 rounded-xl bg-[#00CFFF]/15 hover:bg-[#00CFFF]/25 border border-[#00CFFF]/40 text-[#00CFFF] text-xs font-bold flex items-center gap-2 transition-all cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Feedback message banner */}
      {feedback && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center justify-between ${
            feedback.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="text-[#98A2B3] hover:text-white p-1">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Real-time Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-[#07101D] border border-white/[0.08] space-y-1">
          <div className="flex items-center justify-between text-[#98A2B3] text-[11px] font-mono">
            <span>TOTAL FIRESTORE LOGS</span>
            <Database className="w-4 h-4 text-[#00CFFF]" />
          </div>
          <div className="text-xl font-bold font-mono text-white">
            {events.length}
          </div>
          <p className="text-[10px] text-[#98A2B3]">Stored in Cloud Firestore</p>
        </div>

        <div className="p-4 rounded-xl bg-[#07101D] border border-white/[0.08] space-y-1">
          <div className="flex items-center justify-between text-[#98A2B3] text-[11px] font-mono">
            <span>CONFIG UPDATES</span>
            <Sliders className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-xl font-bold font-mono text-amber-300">
            {configCount}
          </div>
          <p className="text-[10px] text-[#98A2B3]">Economic &amp; platform settings</p>
        </div>

        <div className="p-4 rounded-xl bg-[#07101D] border border-white/[0.08] space-y-1">
          <div className="flex items-center justify-between text-[#98A2B3] text-[11px] font-mono">
            <span>TREASURY MOVEMENTS</span>
            <DollarSign className="w-4 h-4 text-[#32D583]" />
          </div>
          <div className="text-xl font-bold font-mono text-[#32D583]">
            {treasuryCount}
          </div>
          <p className="text-[10px] text-[#98A2B3]">Hot wallet &amp; reserve sweeps</p>
        </div>

        <div className="p-4 rounded-xl bg-[#07101D] border border-white/[0.08] space-y-1">
          <div className="flex items-center justify-between text-[#98A2B3] text-[11px] font-mono">
            <span>SETTLEMENTS &amp; SECURITY</span>
            <ShieldCheck className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-xl font-bold font-mono text-purple-300">
            {settlementCount + securityCount}
          </div>
          <p className="text-[10px] text-[#98A2B3]">Withdrawals &amp; access events</p>
        </div>
      </div>

      {/* Category Tabs & Filter Toolbar */}
      <div className="p-5 rounded-2xl bg-[#07101D] border border-white/[0.08] space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Category Tabs */}
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-black/40 border border-white/[0.08] overflow-x-auto">
            <button
              onClick={() => setCategory('ALL')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                category === 'ALL'
                  ? 'bg-[#00CFFF] text-slate-950 font-bold shadow-md shadow-[#00CFFF]/20'
                  : 'text-[#98A2B3] hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              All Firestore Logs ({events.length})
            </button>
            <button
              onClick={() => setCategory('CONFIG_UPDATE')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                category === 'CONFIG_UPDATE'
                  ? 'bg-amber-400 text-slate-950 font-bold shadow-md shadow-amber-400/20'
                  : 'text-[#98A2B3] hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              Config Updates ({configCount})
            </button>
            <button
              onClick={() => setCategory('TREASURY_MOVEMENT')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                category === 'TREASURY_MOVEMENT'
                  ? 'bg-[#32D583] text-slate-950 font-bold shadow-md shadow-[#32D583]/20'
                  : 'text-[#98A2B3] hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              Treasury Movements ({treasuryCount})
            </button>
            <button
              onClick={() => setCategory('FINANCIAL_SETTLEMENT')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                category === 'FINANCIAL_SETTLEMENT'
                  ? 'bg-[#00CFFF] text-slate-950 font-bold shadow-md shadow-[#00CFFF]/20'
                  : 'text-[#98A2B3] hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              Settlements ({settlementCount})
            </button>
            <button
              onClick={() => setCategory('SECURITY')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                category === 'SECURITY'
                  ? 'bg-purple-400 text-slate-950 font-bold shadow-md shadow-purple-400/20'
                  : 'text-[#98A2B3] hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              Security ({securityCount})
            </button>
          </div>

          {/* Search Box */}
          <div className="relative">
            <Search className="w-4 h-4 text-[#98A2B3] absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search Action, Actor, Target, or Details..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-3 py-1.5 rounded-xl bg-black/40 border border-white/[0.1] text-xs text-white placeholder-[#98A2B3] focus:outline-none focus:border-[#00CFFF] w-full md:w-72"
            />
          </div>
        </div>

        {/* Audit Log Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-white/[0.08] text-[#98A2B3] uppercase font-mono tracking-wider text-[10px]">
                <th className="py-3 px-3">Timestamp</th>
                <th className="py-3 px-3">Category</th>
                <th className="py-3 px-3">Action</th>
                <th className="py-3 px-3">Admin Actor</th>
                <th className="py-3 px-3">Target Reference</th>
                <th className="py-3 px-3">Audit Details</th>
                <th className="py-3 px-3 text-right">Inspect</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04] text-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-[#98A2B3]">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-[#00CFFF]" />
                    <p className="font-semibold text-white">Connecting to Cloud Firestore audit stream...</p>
                  </td>
                </tr>
              ) : filteredEvents.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-[#98A2B3]">
                    <FileText className="w-8 h-8 mx-auto text-slate-600 mb-2" />
                    <p className="font-semibold text-white">No Firestore audit logs found matching this filter</p>
                    <p className="text-[11px] text-[#98A2B3] mt-1">
                      Perform a config change or click &quot;Audit Config Ping&quot; above to generate records.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredEvents.map((evt) => (
                  <tr key={evt.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-3.5 px-3 font-mono text-[#98A2B3] text-[11px] whitespace-nowrap">
                      {new Date(evt.createdAt).toLocaleString()}
                    </td>
                    <td className="py-3.5 px-3">
                      {getCategoryBadge(evt.category)}
                    </td>
                    <td className="py-3.5 px-3 font-mono font-bold text-white">
                      {evt.action}
                    </td>
                    <td className="py-3.5 px-3 font-mono text-[#00CFFF] font-medium">
                      {evt.actorId}
                    </td>
                    <td className="py-3.5 px-3 font-mono text-[#98A2B3]">
                      <span className="px-1.5 py-0.5 rounded bg-black/40 border border-white/[0.06] text-[10px]">
                        {evt.targetType}: {evt.targetId}
                      </span>
                    </td>
                    <td className="py-3.5 px-3 text-slate-300 max-w-xs truncate">
                      {evt.details}
                    </td>
                    <td className="py-3.5 px-3 text-right">
                      <button
                        onClick={() => setSelectedEvent(evt)}
                        className="px-2.5 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-xs text-[#00CFFF] hover:text-white font-medium transition-colors cursor-pointer inline-flex items-center gap-1"
                      >
                        <Eye className="w-3 h-3" />
                        <span>Inspect</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* AUDIT METADATA INSPECTOR MODAL */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg rounded-2xl bg-[#0B1528] border border-[#00CFFF]/40 p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-[#00CFFF]" />
                <h3 className="text-base font-bold text-white">Firestore Audit Record Inspector</h3>
              </div>
              <button
                onClick={() => setSelectedEvent(null)}
                className="text-[#98A2B3] hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex justify-between items-center py-1 border-b border-white/[0.04]">
                <span className="text-[#98A2B3]">Firestore Document ID</span>
                <span className="font-mono text-cyan-300 select-all">{selectedEvent.id}</span>
              </div>

              <div className="flex justify-between items-center py-1 border-b border-white/[0.04]">
                <span className="text-[#98A2B3]">Timestamp (UTC)</span>
                <span className="font-mono text-white">{new Date(selectedEvent.createdAt).toUTCString()}</span>
              </div>

              <div className="flex justify-between items-center py-1 border-b border-white/[0.04]">
                <span className="text-[#98A2B3]">Category</span>
                <div>{getCategoryBadge(selectedEvent.category)}</div>
              </div>

              <div className="flex justify-between items-center py-1 border-b border-white/[0.04]">
                <span className="text-[#98A2B3]">Action Name</span>
                <span className="font-mono font-bold text-white">{selectedEvent.action}</span>
              </div>

              <div className="flex justify-between items-center py-1 border-b border-white/[0.04]">
                <span className="text-[#98A2B3]">Admin Actor</span>
                <span className="font-mono text-[#00CFFF]">{selectedEvent.actorId} ({selectedEvent.actorRole || 'SUPER_ADMIN'})</span>
              </div>

              <div className="flex justify-between items-center py-1 border-b border-white/[0.04]">
                <span className="text-[#98A2B3]">Target Reference</span>
                <span className="font-mono text-amber-300">{selectedEvent.targetType}: {selectedEvent.targetId}</span>
              </div>

              <div className="flex justify-between items-center py-1 border-b border-white/[0.04]">
                <span className="text-[#98A2B3]">Origin Client</span>
                <span className="font-mono text-slate-300">{selectedEvent.ipAddress || 'AdminConsole / Protocol'}</span>
              </div>

              <div className="space-y-1 pt-2">
                <span className="text-[#98A2B3] block font-semibold">Audit Narrative / Description</span>
                <p className="p-3 rounded-xl bg-black/40 border border-white/[0.08] text-slate-200 leading-relaxed">
                  {selectedEvent.details}
                </p>
              </div>

              {selectedEvent.previousState && (
                <div className="space-y-1 pt-2">
                  <span className="text-[#98A2B3] block font-semibold text-rose-300">Previous State / Value</span>
                  <pre className="p-3 rounded-xl bg-black/60 border border-rose-500/20 font-mono text-[11px] text-rose-200 overflow-x-auto max-h-36">
                    {selectedEvent.previousState}
                  </pre>
                </div>
              )}

              {selectedEvent.newState && (
                <div className="space-y-1 pt-2">
                  <span className="text-[#98A2B3] block font-semibold text-emerald-300">New State / Value</span>
                  <pre className="p-3 rounded-xl bg-black/60 border border-emerald-500/20 font-mono text-[11px] text-emerald-200 overflow-x-auto max-h-36">
                    {selectedEvent.newState}
                  </pre>
                </div>
              )}
            </div>

            <div className="pt-2">
              <button
                onClick={() => setSelectedEvent(null)}
                className="w-full py-2.5 rounded-xl bg-[#00CFFF] text-xs font-bold text-slate-950 hover:brightness-110"
              >
                Close Inspection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
