import React, { useState, useEffect, useCallback } from 'react';
import {
  Shield,
  Key,
  Lock,
  Mail,
  Smartphone,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  LogOut,
  Laptop,
  Globe,
  Clock,
  Check,
  Eye,
  EyeOff,
  History,
  ShieldAlert,
  ArrowRight,
  Send
} from 'lucide-react';
import { UserProfile, useAuth } from '../../context/AuthContext';

interface SecurityViewProps {
  user: UserProfile;
  onNavigateTab: (tab: string) => void;
  onLogout: () => Promise<void>;
}

interface SessionItem {
  id: string;
  isCurrent: boolean;
  device: string;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
}

interface SecurityActivityItem {
  id: string;
  eventType: string;
  description: string;
  device: string;
  createdAt: string;
}

export const SecurityView: React.FC<SecurityViewProps> = ({ user, onNavigateTab, onLogout }) => {
  const { resendVerification } = useAuth();

  // Password State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [isChangingPass, setIsChangingPass] = useState(false);
  const [passError, setPassError] = useState<string | null>(null);
  const [passSuccess, setPassSuccess] = useState<string | null>(null);

  // Email Verification State
  const [isSendingVerification, setIsSendingVerification] = useState(false);
  const [verificationFeedback, setVerificationFeedback] = useState<string | null>(null);

  // Sessions State
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [isRevokingAllOthers, setIsRevokingAllOthers] = useState(false);
  const [sessionFeedback, setSessionFeedback] = useState<string | null>(null);

  // Security Activity State
  const [activities, setActivities] = useState<SecurityActivityItem[]>([]);
  const [activityLoading, setActivityLoading] = useState(true);

  // Fetch active sessions
  const fetchSessions = useCallback(async () => {
    try {
      setSessionsLoading(true);
      const res = await fetch('/api/auth/sessions', {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions || []);
      }
    } catch (err) {
      console.warn('Failed to fetch active sessions:', err);
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  // Fetch security activity
  const fetchActivity = useCallback(async () => {
    try {
      setActivityLoading(true);
      const res = await fetch('/api/users/me/security-activity', {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setActivities(data.activity || []);
      }
    } catch (err) {
      console.warn('Failed to fetch security activity:', err);
    } finally {
      setActivityLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
    fetchActivity();
  }, [fetchSessions, fetchActivity]);

  // Handle Password Change
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPassError(null);
    setPassSuccess(null);

    if (!currentPassword) {
      setPassError('Please enter your current password.');
      return;
    }

    if (newPassword.length < 10) {
      setPassError('New password must be at least 10 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPassError('New password and confirmation do not match.');
      return;
    }

    setIsChangingPass(true);

    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          currentPassword,
          newPassword,
          confirmNewPassword: confirmPassword,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Failed to update password.');
      }

      setPassSuccess(data.message || 'Password changed successfully. All other sessions terminated.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      fetchSessions();
      fetchActivity();
      setTimeout(() => setPassSuccess(null), 5000);
    } catch (err: any) {
      setPassError(err.message || 'An error occurred while changing password.');
    } finally {
      setIsChangingPass(false);
    }
  };

  // Handle Resend Verification Email
  const handleResendVerification = async () => {
    setIsSendingVerification(true);
    setVerificationFeedback(null);
    try {
      const res = await resendVerification(user.email);
      setVerificationFeedback(res.message || 'Verification link dispatched to your email.');
      fetchActivity();
    } catch (err: any) {
      setVerificationFeedback(err.message || 'Failed to dispatch verification email.');
    } finally {
      setIsSendingVerification(false);
    }
  };

  // Handle Revoke Single Session
  const handleRevokeSession = async (sessionId: string) => {
    setRevokingId(sessionId);
    setSessionFeedback(null);
    try {
      const res = await fetch(`/api/auth/sessions/${sessionId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await res.json();

      if (data.isCurrent) {
        // User revoked their own current session
        await onLogout();
        return;
      }

      setSessionFeedback('Session successfully revoked.');
      fetchSessions();
      fetchActivity();
      setTimeout(() => setSessionFeedback(null), 4000);
    } catch (err) {
      setSessionFeedback('Failed to revoke session. Please try again.');
    } finally {
      setRevokingId(null);
    }
  };

  // Handle Revoke All Other Devices
  const handleRevokeAllOthers = async () => {
    setIsRevokingAllOthers(true);
    setSessionFeedback(null);
    try {
      const res = await fetch('/api/auth/sessions/revoke-others', {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (res.ok) {
        setSessionFeedback(data.message || 'All other active sessions have been terminated.');
        fetchSessions();
        fetchActivity();
        setTimeout(() => setSessionFeedback(null), 4000);
      }
    } catch (err) {
      setSessionFeedback('Failed to terminate other sessions.');
    } finally {
      setIsRevokingAllOthers(false);
    }
  };

  const formatTimestamp = (isoString?: string) => {
    if (!isoString) return 'Active';
    try {
      const date = new Date(isoString);
      return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto animate-fadeIn">
      {/* Header Banner */}
      <div className="p-6 sm:p-8 rounded-2xl bg-[#07101D] border border-white/[0.08] shadow-xl relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-[#00CFFF]/10 border border-[#00CFFF]/30 flex items-center justify-center text-[#00CFFF]">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                Security & Session Management
              </h1>
              <p className="text-xs text-[#98A2B3] mt-0.5">
                Cryptographic access controls, Argon2id key rotation, and real-time device sessions.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-[#32D583] bg-[#32D583]/10 px-3 py-1 rounded-full border border-[#32D583]/20 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#32D583] animate-pulse" />
              TLS 1.3 Active
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column (2 Cols): Change Password + Active Sessions */}
        <div className="lg:col-span-2 space-y-8">
          
          {/* SECTION 1: CHANGE PASSWORD */}
          <div className="p-6 sm:p-8 rounded-2xl bg-[#07101D] border border-white/[0.08] shadow-xl space-y-6">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Key className="w-4 h-4 text-[#00CFFF]" />
                  <span>Change Password</span>
                </h2>
                <p className="text-xs text-[#98A2B3] mt-0.5">
                  Passwords are cryptographically salted and hashed with Argon2id (m=65536, t=3, p=1).
                </p>
              </div>
            </div>

            {passSuccess && (
              <div className="p-4 rounded-xl bg-[#32D583]/10 border border-[#32D583]/30 text-[#32D583] text-xs flex items-center gap-3 animate-fadeIn">
                <CheckCircle2 className="w-5 h-5 shrink-0" />
                <span>{passSuccess}</span>
              </div>
            )}

            {passError && (
              <div className="p-4 rounded-xl bg-[#F04438]/10 border border-[#F04438]/30 text-[#F04438] text-xs flex items-center gap-3 animate-fadeIn">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <span>{passError}</span>
              </div>
            )}

            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#98A2B3] mb-1.5">
                  Current Password
                </label>
                <div className="relative">
                  <input
                    type={showPasswords ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                    placeholder="Enter current password"
                    className="w-full px-4 py-3 rounded-xl bg-[#05070B] border border-white/[0.12] focus:border-[#00CFFF] focus:ring-1 focus:ring-[#00CFFF] text-white text-sm outline-none transition-all pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswords(!showPasswords)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#98A2B3] hover:text-white p-1"
                  >
                    {showPasswords ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#98A2B3] mb-1.5">
                    New Password (Min 10 chars)
                  </label>
                  <input
                    type={showPasswords ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={10}
                    placeholder="Min 10 characters"
                    className="w-full px-4 py-3 rounded-xl bg-[#05070B] border border-white/[0.12] focus:border-[#00CFFF] focus:ring-1 focus:ring-[#00CFFF] text-white text-sm outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#98A2B3] mb-1.5">
                    Confirm New Password
                  </label>
                  <input
                    type={showPasswords ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={10}
                    placeholder="Re-enter new password"
                    className="w-full px-4 py-3 rounded-xl bg-[#05070B] border border-white/[0.12] focus:border-[#00CFFF] focus:ring-1 focus:ring-[#00CFFF] text-white text-sm outline-none transition-all"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-between">
                <p className="text-[11px] text-[#98A2B3]">
                  Updating your password will automatically terminate all other device sessions.
                </p>
                <button
                  type="submit"
                  disabled={isChangingPass}
                  className="px-6 py-2.5 rounded-xl bg-[#00CFFF] hover:bg-[#00CFFF]/90 disabled:opacity-50 text-[#05070B] text-xs font-bold transition-all shadow-lg shadow-[#00CFFF]/10 flex items-center gap-2 cursor-pointer min-h-[44px]"
                >
                  {isChangingPass ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Hashing & Rotating...</span>
                    </>
                  ) : (
                    <>
                      <Lock className="w-4 h-4" />
                      <span>Update Password</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* SECTION 2: ACTIVE SESSIONS */}
          <div className="p-6 sm:p-8 rounded-2xl bg-[#07101D] border border-white/[0.08] shadow-xl space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/[0.08] pb-4">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Laptop className="w-4 h-4 text-[#00CFFF]" />
                  <span>Active Device Sessions</span>
                </h2>
                <p className="text-xs text-[#98A2B3] mt-0.5">
                  Real-time view of verified browser and API client handshakes.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={fetchSessions}
                  disabled={sessionsLoading}
                  className="p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-[#98A2B3] hover:text-white transition-colors cursor-pointer min-h-[38px] min-w-[38px] flex items-center justify-center"
                  title="Refresh Sessions"
                >
                  <RefreshCw className={`w-4 h-4 ${sessionsLoading ? 'animate-spin text-[#00CFFF]' : ''}`} />
                </button>

                {sessions.length > 1 && (
                  <button
                    type="button"
                    onClick={handleRevokeAllOthers}
                    disabled={isRevokingAllOthers}
                    className="px-3 py-2 rounded-xl bg-[#F04438]/10 hover:bg-[#F04438]/20 border border-[#F04438]/30 text-[#F04438] text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer min-h-[38px]"
                  >
                    {isRevokingAllOthers ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <LogOut className="w-3.5 h-3.5" />
                    )}
                    <span>Logout All Others</span>
                  </button>
                )}
              </div>
            </div>

            {sessionFeedback && (
              <div className="p-3.5 rounded-xl bg-[#00CFFF]/10 border border-[#00CFFF]/30 text-[#00CFFF] text-xs flex items-center gap-2.5 animate-fadeIn">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{sessionFeedback}</span>
              </div>
            )}

            {sessionsLoading ? (
              <div className="py-8 flex flex-col items-center justify-center gap-2 text-xs text-[#98A2B3]">
                <Loader2 className="w-5 h-5 animate-spin text-[#00CFFF]" />
                <span>Loading active sessions...</span>
              </div>
            ) : sessions.length === 0 ? (
              <div className="p-6 rounded-xl bg-[#05070B] border border-white/[0.06] text-center text-xs text-[#98A2B3]">
                No active sessions found.
              </div>
            ) : (
              <div className="space-y-3">
                {sessions.map((s) => (
                  <div
                    key={s.id}
                    className={`p-4 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                      s.isCurrent
                        ? 'bg-[#00CFFF]/[0.03] border-[#00CFFF]/30'
                        : 'bg-[#05070B] border-white/[0.06] hover:border-white/[0.12]'
                    }`}
                  >
                    <div className="flex items-start gap-3.5">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                          s.isCurrent
                            ? 'bg-[#00CFFF]/10 text-[#00CFFF] border border-[#00CFFF]/30'
                            : 'bg-white/[0.04] text-[#98A2B3] border border-white/[0.08]'
                        }`}
                      >
                        <Laptop className="w-5 h-5" />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-white">{s.device}</span>
                          {s.isCurrent && (
                            <span className="text-[10px] font-mono text-[#00CFFF] bg-[#00CFFF]/10 px-2 py-0.5 rounded-full border border-[#00CFFF]/20">
                              Current Session
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-[#98A2B3] font-mono">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3 text-[#98A2B3]" />
                            Last active: {formatTimestamp(s.lastUsedAt)}
                          </span>
                          <span>•</span>
                          <span>Started: {formatTimestamp(s.createdAt)}</span>
                        </div>
                      </div>
                    </div>

                    <div>
                      <button
                        type="button"
                        onClick={() => handleRevokeSession(s.id)}
                        disabled={revokingId === s.id}
                        className={`w-full sm:w-auto px-3.5 py-2 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer min-h-[38px] ${
                          s.isCurrent
                            ? 'bg-white/[0.04] hover:bg-white/[0.08] text-[#98A2B3] hover:text-white border border-white/[0.1]'
                            : 'bg-[#F04438]/10 hover:bg-[#F04438]/20 text-[#F04438] border border-[#F04438]/20'
                        }`}
                      >
                        {revokingId === s.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <LogOut className="w-3.5 h-3.5" />
                        )}
                        <span>{s.isCurrent ? 'Sign Out This Session' : 'Revoke Session'}</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column (1 Col): Verification Status + Security Activity + 2FA Placeholder */}
        <div className="space-y-8">
          
          {/* SECTION 3: ACCOUNT VERIFICATION STATUS */}
          <div className="p-6 rounded-2xl bg-[#07101D] border border-white/[0.08] shadow-xl space-y-4">
            <div className="border-b border-white/[0.08] pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#00CFFF]" />
                <span>Verification Status</span>
              </h3>
              <p className="text-[11px] text-[#98A2B3] mt-0.5">
                Authentication channels verified by cryptographic consensus.
              </p>
            </div>

            {/* Email Verification Box */}
            <div className="p-4 rounded-xl bg-[#05070B] border border-white/[0.06] space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-[#98A2B3]" />
                  <span className="text-xs font-semibold text-white">Email Address</span>
                </div>
                {user.emailVerified ? (
                  <span className="text-[10px] font-mono text-[#32D583] bg-[#32D583]/10 px-2 py-0.5 rounded border border-[#32D583]/20 flex items-center gap-1">
                    <Check className="w-3 h-3" />
                    Verified
                  </span>
                ) : (
                  <span className="text-[10px] font-mono text-[#F04438] bg-[#F04438]/10 px-2 py-0.5 rounded border border-[#F04438]/20 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    Unverified
                  </span>
                )}
              </div>
              <div className="text-[11px] text-[#98A2B3] truncate">{user.email}</div>

              {!user.emailVerified && (
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={handleResendVerification}
                    disabled={isSendingVerification}
                    className="w-full py-2 px-3 rounded-lg bg-[#00CFFF]/10 hover:bg-[#00CFFF]/20 border border-[#00CFFF]/30 text-xs font-bold text-[#00CFFF] transition-all flex items-center justify-center gap-1.5 cursor-pointer min-h-[38px]"
                  >
                    {isSendingVerification ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Sending Link...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" />
                        <span>Resend Verification Email</span>
                      </>
                    )}
                  </button>
                  {verificationFeedback && (
                    <p className="text-[10px] text-[#00CFFF] mt-2 text-center animate-fadeIn">
                      {verificationFeedback}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Mobile Phone Verification Box */}
            <div className="p-4 rounded-xl bg-[#05070B] border border-white/[0.06] space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-[#98A2B3]" />
                  <span className="text-xs font-semibold text-white">Mobile SMS</span>
                </div>
                <span className="text-[10px] font-mono text-[#98A2B3] bg-white/[0.04] px-2 py-0.5 rounded border border-white/[0.08]">
                  Standard Tier
                </span>
              </div>
              <div className="text-[11px] text-[#98A2B3] font-mono">
                {user.phone || 'No phone registered'}
              </div>
            </div>
          </div>

          {/* SECTION 4: RECENT SECURITY ACTIVITY */}
          <div className="p-6 rounded-2xl bg-[#07101D] border border-white/[0.08] shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <History className="w-4 h-4 text-[#00CFFF]" />
                  <span>Recent Security Events</span>
                </h3>
                <p className="text-[11px] text-[#98A2B3] mt-0.5">
                  Privacy-safe audit log for operator account events.
                </p>
              </div>
            </div>

            {activityLoading ? (
              <div className="py-6 flex flex-col items-center justify-center gap-2 text-xs text-[#98A2B3]">
                <Loader2 className="w-4 h-4 animate-spin text-[#00CFFF]" />
                <span>Loading activity log...</span>
              </div>
            ) : activities.length === 0 ? (
              <div className="p-4 rounded-xl bg-[#05070B] border border-white/[0.06] text-center text-[11px] text-[#98A2B3]">
                No security events recorded yet.
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[320px] overflow-y-auto pr-1">
                {activities.map((act) => (
                  <div
                    key={act.id}
                    className="p-3 rounded-xl bg-[#05070B] border border-white/[0.04] space-y-1 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-white">{act.description}</span>
                      <span className="text-[10px] font-mono text-[#98A2B3] shrink-0 ml-2">
                        {formatTimestamp(act.createdAt)}
                      </span>
                    </div>
                    <div className="text-[10px] font-mono text-[#00CFFF] flex items-center gap-1.5">
                      <span>Device:</span>
                      <span className="text-[#98A2B3]">{act.device || 'Standard Client'}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* SECTION 5: TWO-FACTOR AUTHENTICATION (COMING SOON VISUAL RESERVE) */}
          <div className="p-6 rounded-2xl bg-gradient-to-br from-[#07101D] to-[#0D1B2E] border border-dashed border-white/[0.12] space-y-3 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-white font-bold text-xs">
                <ShieldAlert className="w-4 h-4 text-[#98A2B3]" />
                <span>Two-Factor Authentication (2FA)</span>
              </div>
              <span className="text-[10px] font-mono uppercase bg-white/[0.06] text-[#98A2B3] border border-white/[0.1] px-2 py-0.5 rounded-full">
                Coming Soon
              </span>
            </div>
            <p className="text-[11px] text-[#98A2B3] leading-relaxed">
              Hardware Security Key (FIDO2 / WebAuthn) and TOTP Authenticator integration are scheduled for activation in a subsequent protocol release.
            </p>
            <div className="pt-1 flex items-center gap-2 text-[10px] font-mono text-[#98A2B3]/70">
              <span className="w-1.5 h-1.5 rounded-full bg-[#98A2B3]/50" />
              <span>Cryptographic standard: RFC 6238 / FIDO2</span>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};
