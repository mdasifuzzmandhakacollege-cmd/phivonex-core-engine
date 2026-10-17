import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  User,
  MapPin,
  Calendar,
  FileText,
  Eye,
  RefreshCw,
  AlertTriangle,
  Check,
  X,
  ExternalLink,
  ChevronRight,
  Filter,
  Layers,
  Sparkles,
  Camera,
  Loader2
} from 'lucide-react';
import { db } from '../../lib/firebase';
import { collection, onSnapshot } from 'firebase/firestore';

interface KYCRecord {
  id: string;
  userId: string;
  userPublicId?: string;
  userEmail?: string;
  userFullName?: string;
  fullLegalName: string;
  dob: string;
  country: string;
  residentialAddress: string;
  city: string;
  postalCode: string;
  documentType: 'NATIONAL_ID' | 'PASSPORT' | 'DRIVERS_LICENSE';
  documentNumber: string;
  documentFrontUrl: string;
  documentBackUrl?: string;
  selfiePhotoUrl: string;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED';
  rejectionReason?: string | null;
  reviewerId?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface KYCManagementProps {
  adminEmail?: string;
  onLogAction?: (action: string, targetType: string, targetId: string, details: string) => void;
}

export const KYCManagement: React.FC<KYCManagementProps> = ({ adminEmail, onLogAction }) => {
  const [submissions, setSubmissions] = useState<KYCRecord[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [verifiedCount, setVerifiedCount] = useState<number>(0);
  const [rejectedCount, setRejectedCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // Filters & Search
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Selected Submission for Review Modal
  const [selectedSubmission, setSelectedSubmission] = useState<KYCRecord | null>(null);
  const [reviewing, setReviewing] = useState<boolean>(false);
  const [rejectReasonPreset, setRejectReasonPreset] = useState<string>('Photo is blurry or low resolution');
  const [customRejectReason, setCustomRejectReason] = useState<string>('');
  const [isRejectMode, setIsRejectMode] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Active zoomed image modal
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);

  const fetchSubmissions = useCallback(async (isSilent = false) => {
    try {
      if (!isSilent) setLoading(true);
      else setRefreshing(true);

      const params = new URLSearchParams();
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      if (searchQuery.trim()) params.set('search', searchQuery.trim());

      const res = await fetch(`/api/kyc/admin/submissions?${params.toString()}`, {
        credentials: 'include',
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setSubmissions(data.submissions || []);
          setTotalCount(data.totalCount || 0);
          setPendingCount(data.pendingCount || 0);
          setVerifiedCount(data.verifiedCount || 0);
          setRejectedCount(data.rejectedCount || 0);
        }
      }
    } catch (err) {
      console.error('[KYCManagement] Error fetching submissions:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [statusFilter, searchQuery]);

  useEffect(() => {
    fetchSubmissions();
  }, [fetchSubmissions]);

  // Real-time Firestore onSnapshot listener for instant sub-second admin sync
  useEffect(() => {
    let unsub: (() => void) | undefined;
    try {
      unsub = onSnapshot(collection(db, 'kyc_verifications'), () => {
        // Automatically refresh data silently when any KYC submission changes
        fetchSubmissions(true);
      });
    } catch {
      // fallback
    }

    return () => {
      if (unsub) unsub();
    };
  }, [fetchSubmissions]);

  // Handle Review Action (APPROVE or REJECT)
  const handleReview = async (decision: 'APPROVE' | 'REJECT') => {
    if (!selectedSubmission) return;

    let reason: string | undefined = undefined;
    if (decision === 'REJECT') {
      reason = customRejectReason.trim() ? customRejectReason.trim() : rejectReasonPreset;
      if (!reason) {
        alert('Please specify a rejection reason for the applicant.');
        return;
      }
    }

    setReviewing(true);
    setFeedback(null);

    try {
      const res = await fetch(`/api/kyc/admin/${selectedSubmission.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ decision, reason }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Review execution failed.');
      }

      setFeedback({
        type: 'success',
        message: decision === 'APPROVE' 
          ? `Verified operator ${selectedSubmission.userPublicId || selectedSubmission.userEmail} successfully!` 
          : `Rejected submission for operator ${selectedSubmission.userPublicId || selectedSubmission.userEmail}.`,
      });

      if (onLogAction) {
        onLogAction(
          decision === 'APPROVE' ? 'APPROVE_KYC' : 'REJECT_KYC',
          'kyc_verifications',
          selectedSubmission.id,
          `${decision} for ${selectedSubmission.userPublicId}`
        );
      }

      // Close review modal & refresh
      setSelectedSubmission(null);
      setIsRejectMode(false);
      setCustomRejectReason('');
      await fetchSubmissions(true);
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Failed to submit review.',
      });
    } finally {
      setReviewing(false);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header Banner */}
      <div className="p-6 rounded-3xl bg-gradient-to-r from-[#0A162B] via-[#07101E] to-[#0D1D38] border border-cyan-500/20 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <h1 className="text-lg sm:text-xl font-bold text-white tracking-wide font-mono">
                Binance-Grade KYC Verification Hub
              </h1>
              {pendingCount > 0 && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse">
                  {pendingCount} Pending Review
                </span>
              )}
            </div>
            <p className="text-xs text-[#98A2B3]">
              Real-time cryptographic forensic review of identity documents and biometric facial verifications.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchSubmissions(true)}
              disabled={refreshing}
              className="px-3.5 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-white border border-white/[0.08] text-xs font-mono flex items-center gap-2 transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-cyan-400' : ''}`} />
              <span>Refresh Queue</span>
            </button>
          </div>
        </div>

        {/* Aggregate KPI Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-5 border-t border-white/[0.08]">
          <div className="p-3.5 rounded-2xl bg-black/40 border border-white/[0.06]">
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">Total Submissions</span>
            <span className="text-lg font-bold text-white font-mono">{totalCount}</span>
          </div>
          <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20">
            <span className="text-[10px] font-mono text-amber-300 uppercase tracking-wider block">Pending Queue</span>
            <span className="text-lg font-bold text-amber-400 font-mono flex items-center gap-2">
              <span>{pendingCount}</span>
              {pendingCount > 0 && <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />}
            </span>
          </div>
          <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
            <span className="text-[10px] font-mono text-emerald-300 uppercase tracking-wider block">Level 1 Verified</span>
            <span className="text-lg font-bold text-emerald-400 font-mono">{verifiedCount}</span>
          </div>
          <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20">
            <span className="text-[10px] font-mono text-rose-300 uppercase tracking-wider block">Rejected / Remediation</span>
            <span className="text-lg font-bold text-rose-400 font-mono">{rejectedCount}</span>
          </div>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-4 rounded-2xl border text-xs font-mono flex items-center justify-between gap-3 ${
            feedback.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            <span>{feedback.message}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="text-slate-400 hover:text-white cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="p-4 rounded-2xl bg-[#07101E] border border-white/[0.08] flex flex-col sm:flex-row items-center justify-between gap-3">
        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-black/40 border border-white/[0.06] w-full sm:w-auto overflow-x-auto">
          {[
            { id: 'ALL', label: 'All Submissions' },
            { id: 'PENDING', label: `Pending (${pendingCount})` },
            { id: 'VERIFIED', label: `Verified (${verifiedCount})` },
            { id: 'REJECTED', label: `Rejected (${rejectedCount})` },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all cursor-pointer whitespace-nowrap ${
                statusFilter === tab.id
                  ? 'bg-cyan-500 text-black shadow-md shadow-cyan-500/20 font-bold'
                  : 'text-[#98A2B3] hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search input */}
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-[#98A2B3] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search operator, ID, email..."
            className="w-full pl-9 pr-3.5 py-2 rounded-xl bg-[#05070B] border border-white/[0.08] text-white text-xs font-mono placeholder:text-[#667085] focus:outline-none focus:border-cyan-400 transition-colors"
          />
        </div>
      </div>

      {/* Submissions Table / Queue */}
      <div className="rounded-2xl bg-[#07101E] border border-white/[0.08] overflow-hidden shadow-xl">
        {loading ? (
          <div className="p-12 text-center space-y-3">
            <Loader2 className="w-8 h-8 text-cyan-400 animate-spin mx-auto" />
            <p className="text-xs text-[#98A2B3] font-mono">Synchronizing KYC ledger records...</p>
          </div>
        ) : submissions.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <ShieldCheck className="w-10 h-10 text-slate-500 mx-auto" />
            <div className="text-sm font-bold text-white">No KYC Submissions Found</div>
            <p className="text-xs text-[#98A2B3] max-w-sm mx-auto">
              {statusFilter === 'PENDING'
                ? 'All pending verification applications have been cleared and adjudicated.'
                : 'No records matching the filter criteria.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead className="bg-[#05070B] border-b border-white/[0.08] text-[#98A2B3] uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="px-5 py-3.5">Operator</th>
                  <th className="px-5 py-3.5">Legal Name</th>
                  <th className="px-5 py-3.5">Document Info</th>
                  <th className="px-5 py-3.5">Country</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5">Submitted</th>
                  <th className="px-5 py-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {submissions.map((sub) => {
                  const isPending = sub.status === 'PENDING';
                  const isVerified = sub.status === 'VERIFIED';
                  const isRejected = sub.status === 'REJECTED';

                  return (
                    <tr
                      key={sub.id}
                      className="hover:bg-white/[0.02] transition-colors cursor-pointer group"
                      onClick={() => setSelectedSubmission(sub)}
                    >
                      <td className="px-5 py-4">
                        <div className="font-bold text-white">{sub.userPublicId || 'PHX-USER'}</div>
                        <div className="text-[11px] text-[#98A2B3]">{sub.userEmail}</div>
                      </td>

                      <td className="px-5 py-4">
                        <div className="text-white font-medium">{sub.fullLegalName}</div>
                        <div className="text-[10px] text-slate-500">DOB: {sub.dob}</div>
                      </td>

                      <td className="px-5 py-4">
                        <div className="text-cyan-300 font-semibold">{sub.documentType}</div>
                        <div className="text-[10px] text-slate-400">#{sub.documentNumber}</div>
                      </td>

                      <td className="px-5 py-4">
                        <span className="text-slate-300">{sub.country}</span>
                      </td>

                      <td className="px-5 py-4">
                        {isPending && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse">
                            <Clock className="w-3 h-3" />
                            Pending Review
                          </span>
                        )}
                        {isVerified && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            <CheckCircle2 className="w-3 h-3" />
                            Verified Level 1
                          </span>
                        )}
                        {isRejected && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                            <XCircle className="w-3 h-3" />
                            Rejected
                          </span>
                        )}
                      </td>

                      <td className="px-5 py-4 text-slate-400 text-[11px]">
                        {new Date(sub.createdAt).toLocaleString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>

                      <td className="px-5 py-4 text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedSubmission(sub);
                          }}
                          className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 ml-auto transition-all cursor-pointer ${
                            isPending
                              ? 'bg-cyan-500 hover:bg-cyan-400 text-black shadow-md shadow-cyan-500/20'
                              : 'bg-white/[0.06] hover:bg-white/[0.1] text-white border border-white/[0.08]'
                          }`}
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>{isPending ? 'Inspect & Review' : 'View Details'}</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* FULL INSPECTION & REVIEW MODAL */}
      {selectedSubmission && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
          <div className="relative w-full max-w-4xl max-h-[92vh] flex flex-col rounded-3xl bg-[#07101E] border border-cyan-500/30 shadow-2xl shadow-cyan-950/50 overflow-hidden">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.08] bg-[#0A162B]">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-sm sm:text-base font-bold text-white font-mono flex items-center gap-2">
                    <span>KYC Verification Dossier</span>
                    <span className="text-xs text-cyan-400">#{selectedSubmission.userPublicId || selectedSubmission.id.slice(0, 8)}</span>
                  </h2>
                  <p className="text-[11px] text-[#98A2B3]">
                    Operator Email: {selectedSubmission.userEmail}
                  </p>
                </div>
              </div>

              <button
                onClick={() => {
                  setSelectedSubmission(null);
                  setIsRejectMode(false);
                }}
                className="p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">

              {/* Side-by-Side Photos Inspection */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <Camera className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Cryptographic Forensic Photos</span>
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    Click any image to zoom full-screen
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Front Photo */}
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-mono text-slate-300 block">Front Document:</span>
                    <div
                      onClick={() => setZoomedImage(selectedSubmission.documentFrontUrl)}
                      className="relative rounded-2xl border border-white/[0.1] bg-black h-48 overflow-hidden group cursor-pointer hover:border-cyan-400 transition-colors"
                    >
                      <img
                        src={selectedSubmission.documentFrontUrl}
                        alt="Front ID"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                        <Eye className="w-6 h-6 text-white drop-shadow" />
                      </div>
                    </div>
                  </div>

                  {/* Back Photo */}
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-mono text-slate-300 block">Back Document:</span>
                    {selectedSubmission.documentBackUrl ? (
                      <div
                        onClick={() => setZoomedImage(selectedSubmission.documentBackUrl!)}
                        className="relative rounded-2xl border border-white/[0.1] bg-black h-48 overflow-hidden group cursor-pointer hover:border-cyan-400 transition-colors"
                      >
                        <img
                          src={selectedSubmission.documentBackUrl}
                          alt="Back ID"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                          <Eye className="w-6 h-6 text-white drop-shadow" />
                        </div>
                      </div>
                    ) : (
                      <div className="h-48 rounded-2xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-center text-center p-4 text-xs font-mono text-slate-500">
                        Passport Format (Single page document)
                      </div>
                    )}
                  </div>

                  {/* Facial Selfie */}
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-mono text-slate-300 block">Live Facial Liveness:</span>
                    <div
                      onClick={() => setZoomedImage(selectedSubmission.selfiePhotoUrl)}
                      className="relative rounded-2xl border-2 border-cyan-500/40 bg-black h-48 overflow-hidden group cursor-pointer hover:border-cyan-400 transition-colors"
                    >
                      <img
                        src={selectedSubmission.selfiePhotoUrl}
                        alt="Facial Selfie"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                        <Eye className="w-6 h-6 text-white drop-shadow" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Legal Identity Details Comparison */}
              <div className="p-5 rounded-2xl bg-black/40 border border-white/[0.08] space-y-4 font-mono text-xs">
                <span className="text-xs font-bold text-white uppercase tracking-wider block font-sans">
                  Operator Identity Records Comparison
                </span>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                    <span className="text-[10px] text-slate-500 uppercase block">Declared Legal Name</span>
                    <span className="text-sm font-bold text-white">{selectedSubmission.fullLegalName}</span>
                  </div>

                  <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                    <span className="text-[10px] text-slate-500 uppercase block">Date of Birth</span>
                    <span className="text-sm font-bold text-white">{selectedSubmission.dob}</span>
                  </div>

                  <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                    <span className="text-[10px] text-slate-500 uppercase block">Country of Issuance</span>
                    <span className="text-sm font-bold text-cyan-300">{selectedSubmission.country}</span>
                  </div>

                  <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                    <span className="text-[10px] text-slate-500 uppercase block">Document Type</span>
                    <span className="text-sm font-bold text-white">{selectedSubmission.documentType}</span>
                  </div>

                  <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                    <span className="text-[10px] text-slate-500 uppercase block">Document Number</span>
                    <span className="text-sm font-bold text-white">{selectedSubmission.documentNumber}</span>
                  </div>

                  <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                    <span className="text-[10px] text-slate-500 uppercase block">Registration Name</span>
                    <span className="text-sm font-bold text-slate-300">{selectedSubmission.userFullName || 'N/A'}</span>
                  </div>

                  <div className="col-span-2 sm:col-span-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                    <span className="text-[10px] text-slate-500 uppercase block">Residential Street Address</span>
                    <span className="text-xs text-white">
                      {selectedSubmission.residentialAddress}, {selectedSubmission.city} {selectedSubmission.postalCode}
                    </span>
                  </div>
                </div>
              </div>

              {/* Rejection Form Box if expanded */}
              {isRejectMode && (
                <div className="p-5 rounded-2xl bg-rose-950/30 border border-rose-500/40 space-y-3 animate-fadeIn font-mono text-xs">
                  <div className="flex items-center gap-2 text-rose-300 font-bold uppercase tracking-wider font-sans">
                    <ShieldAlert className="w-4 h-4 text-rose-400" />
                    <span>Select Reason for Remediation / Rejection</span>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] text-slate-300">Preset Reason:</label>
                    <select
                      value={rejectReasonPreset}
                      onChange={(e) => setRejectReasonPreset(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#05070B] border border-white/[0.1] text-white text-xs focus:outline-none focus:border-rose-400"
                    >
                      <option value="Photo is blurry or low resolution">Photo is blurry or low resolution</option>
                      <option value="Document corners are cropped or cut off">Document corners are cropped or cut off</option>
                      <option value="Facial selfie does not match the document portrait">Facial selfie does not match the document portrait</option>
                      <option value="ID Document is expired or invalid">ID Document is expired or invalid</option>
                      <option value="Full legal name does not match document name">Full legal name does not match document name</option>
                      <option value="Suspicious or edited document detected">Suspicious or edited document detected</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] text-slate-300">Custom Remarks (Optional):</label>
                    <input
                      type="text"
                      value={customRejectReason}
                      onChange={(e) => setCustomRejectReason(e.target.value)}
                      placeholder="Add specific instructions for the applicant..."
                      className="w-full px-3.5 py-2 rounded-xl bg-[#05070B] border border-white/[0.1] text-white text-xs focus:outline-none focus:border-rose-400"
                    />
                  </div>
                </div>
              )}

            </div>

            {/* Modal Footer Review Controls */}
            <div className="px-6 py-4 border-t border-white/[0.08] bg-[#0A162B] flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs font-mono text-slate-400">
                Current Status:{' '}
                <span className="font-bold text-white uppercase">{selectedSubmission.status}</span>
              </div>

              <div className="flex items-center gap-3">
                {selectedSubmission.status === 'PENDING' ? (
                  <>
                    {!isRejectMode ? (
                      <>
                        <button
                          type="button"
                          onClick={() => setIsRejectMode(true)}
                          disabled={reviewing}
                          className="px-4 py-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-mono font-bold transition-all cursor-pointer"
                        >
                          Reject / Request Remediation
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReview('APPROVE')}
                          disabled={reviewing}
                          className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-black font-mono font-bold text-xs flex items-center gap-2 shadow-lg shadow-emerald-500/20 transition-all cursor-pointer"
                        >
                          {reviewing ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <CheckCircle2 className="w-4 h-4" />
                          )}
                          <span>Approve Level 1 Verified</span>
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => setIsRejectMode(false)}
                          disabled={reviewing}
                          className="px-4 py-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 text-xs font-mono font-semibold transition-colors cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReview('REJECT')}
                          disabled={reviewing}
                          className="px-6 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-mono font-bold text-xs flex items-center gap-2 shadow-lg shadow-rose-600/25 transition-all cursor-pointer"
                        >
                          {reviewing ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <XCircle className="w-4 h-4" />
                          )}
                          <span>Confirm Rejection</span>
                        </button>
                      </>
                    )}
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setSelectedSubmission(null)}
                    className="px-6 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-white text-xs font-mono font-bold cursor-pointer"
                  >
                    Close Dossier
                  </button>
                )}
              </div>
            </div>

          </div>
        </div>
      )}

      {/* FULL-SCREEN ZOOM MODAL */}
      {zoomedImage && (
        <div
          onClick={() => setZoomedImage(null)}
          className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/95 backdrop-blur-md cursor-zoom-out animate-fadeIn"
        >
          <div className="relative max-w-4xl max-h-[90vh]">
            <img
              src={zoomedImage}
              alt="Zoomed"
              className="max-w-full max-h-[85vh] object-contain rounded-2xl shadow-2xl border border-white/[0.2]"
            />
            <button
              onClick={() => setZoomedImage(null)}
              className="absolute -top-3 -right-3 p-2 rounded-full bg-white/20 hover:bg-white/40 text-white transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
