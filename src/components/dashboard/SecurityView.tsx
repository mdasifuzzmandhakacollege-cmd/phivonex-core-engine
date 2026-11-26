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
  Clock,
  Check,
  Eye,
  EyeOff,
  History,
  ShieldCheck,
  Send,
  Fingerprint,
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

export const SecurityView: React.FC<SecurityViewProps> = ({ user, onLogout }) => {
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

  // Anti-Phishing Code State (per-user persisted security phrase)
  const storageKey = `phx_antiphishing_${user.publicId || user.id || 'member'}`;
  const [antiPhishingCode, setAntiPhishingCode] = useState<string>(() => {
    try {
      return localStorage.getItem(storageKey) || '';
    } catch {
      return '';
    }
  });
  const [antiPhishingInput, setAntiPhishingInput] = useState<string>(antiPhishingCode);
  const [antiPhishingSaved, setAntiPhishingSaved] = useState(false);

  // Sessions State
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [isRevokingAllOthers, setIsRevokingAllOthers] = useState(false);
  const [sessionFeedback, setSessionFeedback] = useState<string | null>(null);

  // Security Activity State
  const [activities, setActivities] = useState<SecurityActivityItem[]>([]);
  const [activityLoading, setActivityLoading] = useState(true);

  const fetchSessions = useCallback(async () => {
    try {
      setSessionsLoading(true);
      const res = await fetch('/api/auth/sessions', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setSessions(Array.isArray(data.sessions) ? data.sessions : []);
      }
    } catch {
      // keep existing
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  const fetchActivity = useCallback(async () => {
    try {
      setActivityLoading(true);
      const res = await fetch('/api/users/me/security-activity', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setActivities(Array.isArray(data.activity) ? data.activity : []);
      }
    } catch {
      // keep existing
    } finally {
      setActivityLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
    fetchActivity();
  }, [fetchSessions, fetchActivity]);

  const handleSaveAntiPhishing = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = antiPhishingInput.trim().slice(0, 24);
    try {
      if (cleaned) {
        localStorage.setItem(storageKey, cleaned);
      } else {
        localStorage.removeItem(storageKey);
      }
    } catch {
      // ignore storage errors
    }
    setAntiPhishingCode(cleaned);
    setAntiPhishingSaved(true);
    setTimeout(() => setAntiPhishingSaved(false), 3000);
  };

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

      setPassSuccess(data.message || 'Password updated successfully. All other sessions terminated.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      fetchSessions();
      fetchActivity();
      setTimeout(() => setPassSuccess(null), 5000);
    } catch (err: any) {
      setPassError(err?.message || 'An error occurred while changing password.');
    } finally {
      setIsChangingPass(false);
    }
  };

  const handleResendVerification = async () => {
    setIsSendingVerification(true);
    setVerificationFeedback(null);
    try {
      const res = await resendVerification(user.email);
      setVerificationFeedback(res.message || 'Verification link sent to your email.');
      fetchActivity();
    } catch (err: any) {
      setVerificationFeedback(err?.message || 'Failed to send verification email.');
    } finally {
      setIsSendingVerification(false);
    }
  };

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
        await onLogout();
        return;
      }
      setSessionFeedback('Session revoked successfully.');
      fetchSessions();
      fetchActivity();
      setTimeout(() => setSessionFeedback(null), 4000);
    } catch {
      setSessionFeedback('Failed to revoke session. Please try again.');
    } finally {
      setRevokingId(null);
    }
  };

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
        setSessionFeedback(data.message || 'All other device sessions terminated.');
        fetchSessions();
        fetchActivity();
        setTimeout(() => setSessionFeedback(null), 4000);
      }
    } catch {
      setSessionFeedback('Failed to terminate other sessions.');
    } finally {
      setIsRevokingAllOthers(false);
    }
  };

  const formatTimestamp = (isoString?: string) => {
    if (!isoString) return 'Active';
    try {
      return new Date(isoString).toLocaleString('en-US', {
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
    <div className="space-y-6 max-w-5xl mx-auto animate-fadeIn pb-10 min-w-0 max-w-full overflow-x-hidden">
      {/* 1. INSTITUTIONAL SECURITY HEADER */}
      <div className="oneui-glass-card rounded-[24px] p-5 sm:p-7 relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-14 -mr-14 w-72 h-72 bg-[#00E676]/[0.07] rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-12 h-12 rounded-2xl bg-[#00E676]/12 border border-[#00E676]/30 flex items-center justify-center text-[#00E676] shrink-0">
              <Shield className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
                Institutional Security Center
              </h1>
              <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
                Multi-factor authorization, password rotation, anti-phishing controls, and active session governance.
              </p>
            </div>
          </div>

          <span className="text-[11px] font-mono font-bold text-[#00E676] bg-[#00E676]/12 px-3 py-1.5 rounded-full border border-[#00E676]/25 flex items-center gap-1.5 self-start sm:self-center shrink-0">
            <span className="w-2 h-2 rounded-full bg-[#00E676] animate-pulse" />
            Session Protected
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left 2 Columns: Password Management + Anti-Phishing + Active Sessions */}
        <div className="lg:col-span-2 space-y-5 min-w-0">
          {/* CARD 1: PASSWORD MANAGEMENT */}
          <div className="oneui-glass-card rounded-[24px] p-5 sm:p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3.5">
              <div>
                <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                  <Key className="w-4 h-4 text-[#00E5FF]" />
                  <span>Password Management</span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Updating your password automatically signs out all other active devices.
                </p>
              </div>
            </div>

            {passSuccess && (
              <div className="p-3.5 rounded-2xl bg-[#00E676]/12 border border-[#00E676]/30 text-[#00E676] text-xs flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{passSuccess}</span>
              </div>
            )}

            {passError && (
              <div className="p-3.5 rounded-2xl bg-[#FF4D4F]/12 border border-[#FF4D4F]/30 text-[#FF8587] text-xs flex items-center gap-2.5">
                <AlertCircle className="w-4 h-4 shrink-0 text-[#FF4D4F]" />
                <span>{passError}</span>
              </div>
            )}

            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">Current Password</label>
                <div className="relative">
                  <input
                    type={showPasswords ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                    placeholder="Enter current password"
                    className="w-full px-4 py-3 rounded-2xl bg-[#050807]/85 border border-white/[0.1] focus:border-[#00E5FF] text-white text-sm outline-none transition-all pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswords(!showPasswords)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1 cursor-pointer"
                  >
                    {showPasswords ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                    New Password (Min 10 chars)
                  </label>
                  <input
                    type={showPasswords ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={10}
                    placeholder="Min 10 characters"
                    className="w-full px-4 py-3 rounded-2xl bg-[#050807]/85 border border-white/[0.1] focus:border-[#00E5FF] text-white text-sm outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">Confirm New Password</label>
                  <input
                    type={showPasswords ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={10}
                    placeholder="Re-enter new password"
                    className="w-full px-4 py-3 rounded-2xl bg-[#050807]/85 border border-white/[0.1] focus:border-[#00E5FF] text-white text-sm outline-none transition-all"
                  />
                </div>
              </div>

              <div className="pt-1 flex justify-end">
                <button
                  type="submit"
                  disabled={isChangingPass}
                  className="px-5 py-2.5 rounded-2xl bg-[#00E5FF] hover:bg-[#00E5FF]/90 disabled:opacity-50 text-[#050807] text-xs font-bold transition-all shadow-lg shadow-[#00E5FF]/20 flex items-center gap-2 cursor-pointer min-h-[44px]"
                >
                  {isChangingPass ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Updating...</span>
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

          {/* CARD 2: ANTI-PHISHING CODE */}
          <div className="oneui-glass-card rounded-[24px] p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3.5">
              <div>
                <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                  <Fingerprint className="w-4 h-4 text-[#F5B800]" />
                  <span>Anti-Phishing Code</span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Configure a personal verification phrase to authenticate official PHIVONEX security notices.
                </p>
              </div>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold border shrink-0 ${
                  antiPhishingCode
                    ? 'bg-[#00E676]/12 text-[#00E676] border-[#00E676]/30'
                    : 'bg-[#F5B800]/12 text-[#F5B800] border-[#F5B800]/30'
                }`}
              >
                {antiPhishingCode ? 'Configured' : 'Not Set'}
              </span>
            </div>

            <form onSubmit={handleSaveAntiPhishing} className="flex flex-col sm:flex-row gap-2.5">
              <input
                type="text"
                maxLength={24}
                value={antiPhishingInput}
                onChange={(e) => setAntiPhishingInput(e.target.value)}
                placeholder="e.g., SOVEREIGN-ALPHA-99"
                className="flex-1 px-4 py-3 rounded-2xl bg-[#050807]/85 border border-white/[0.1] focus:border-[#F5B800] text-white font-mono text-xs outline-none"
              />
              <button
                type="submit"
                className="px-5 py-3 rounded-2xl bg-[#F5B800] hover:bg-[#F5B800]/90 text-[#050807] text-xs font-bold transition-all cursor-pointer min-h-[44px] shrink-0 active:scale-95"
              >
                {antiPhishingSaved ? 'Saved!' : 'Save Phrase'}
              </button>
            </form>

            {antiPhishingCode && (
              <div className="p-3 rounded-2xl bg-[#050807]/70 border border-white/[0.08] flex items-center justify-between text-xs font-mono">
                <span className="text-slate-400">Active Security Phrase:</span>
                <span className="text-[#F5B800] font-bold">{antiPhishingCode}</span>
              </div>
            )}
          </div>

          {/* CARD 3: ACTIVE SESSIONS */}
          <div className="oneui-glass-card rounded-[24px] p-5 sm:p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/[0.08] pb-3.5">
              <div>
                <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                  <Laptop className="w-4 h-4 text-[#00E5FF]" />
                  <span>Active Sessions</span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">Devices currently signed in to your PHIVONEX workspace.</p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={fetchSessions}
                  disabled={sessionsLoading}
                  className="p-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-slate-300 hover:text-white transition-colors cursor-pointer min-h-[38px] min-w-[38px] flex items-center justify-center"
                  title="Refresh Sessions"
                >
                  <RefreshCw className={`w-4 h-4 ${sessionsLoading ? 'animate-spin text-[#00E5FF]' : ''}`} />
                </button>

                {sessions.length > 1 && (
                  <button
                    type="button"
                    onClick={handleRevokeAllOthers}
                    disabled={isRevokingAllOthers}
                    className="px-3 py-2 rounded-xl bg-[#FF4D4F]/12 hover:bg-[#FF4D4F]/20 border border-[#FF4D4F]/30 text-[#FF4D4F] text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer min-h-[38px]"
                  >
                    {isRevokingAllOthers ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <LogOut className="w-3.5 h-3.5" />
                    )}
                    <span>Revoke Others</span>
                  </button>
                )}
              </div>
            </div>

            {sessionFeedback && (
              <div className="p-3 rounded-2xl bg-[#00E5FF]/12 border border-[#00E5FF]/30 text-[#00E5FF] text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{sessionFeedback}</span>
              </div>
            )}

            {sessionsLoading ? (
              <div className="py-8 flex flex-col items-center justify-center gap-2 text-xs text-slate-400">
                <Loader2 className="w-5 h-5 animate-spin text-[#00E5FF]" />
                <span>Loading active sessions...</span>
              </div>
            ) : sessions.length === 0 ? (
              <div className="p-6 rounded-2xl bg-[#050807]/70 border border-white/[0.07] text-center text-xs text-slate-400">
                No active sessions found.
              </div>
            ) : (
              <div className="space-y-3">
                {sessions.map((s) => (
                  <div
                    key={s.id}
                    className={`p-4 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      s.isCurrent
                        ? 'bg-[#00E5FF]/[0.05] border-[#00E5FF]/30'
                        : 'bg-[#050807]/75 border-white/[0.07]'
                    }`}
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                          s.isCurrent
                            ? 'bg-[#00E5FF]/15 text-[#00E5FF] border border-[#00E5FF]/30'
                            : 'bg-white/[0.05] text-slate-400 border border-white/[0.08]'
                        }`}
                      >
                        <Laptop className="w-5 h-5" />
                      </div>
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs sm:text-sm font-bold text-white truncate">{s.device}</span>
                          {s.isCurrent && (
                            <span className="text-[10px] font-mono text-[#00E5FF] bg-[#00E5FF]/12 px-2 py-0.5 rounded-full border border-[#00E5FF]/25">
                              Current
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400 font-mono">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatTimestamp(s.lastUsedAt)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRevokeSession(s.id)}
                      disabled={revokingId === s.id}
                      className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer min-h-[38px] shrink-0 ${
                        s.isCurrent
                          ? 'bg-white/[0.06] hover:bg-white/[0.12] text-slate-300 hover:text-white border border-white/[0.1]'
                          : 'bg-[#FF4D4F]/12 hover:bg-[#FF4D4F]/20 text-[#FF4D4F] border border-[#FF4D4F]/25'
                      }`}
                    >
                      {revokingId === s.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <LogOut className="w-3.5 h-3.5" />
                      )}
                      <span>{s.isCurrent ? 'Sign Out' : 'Revoke'}</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: 2FA & Verification + Security Event Log */}
        <div className="space-y-5 min-w-0">
          {/* CARD 4: TWO-FACTOR AUTHENTICATION (2FA) */}
          <div className="oneui-glass-card rounded-[24px] p-5 sm:p-6 space-y-4">
            <div className="border-b border-white/[0.08] pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#00E676]" />
                <span>Two-Factor Authentication (2FA)</span>
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Verification channels securing logins and withdrawals.
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#050807]/75 border border-white/[0.07] space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-[#00E5FF]" />
                  <span className="text-xs font-bold text-white">Email OTP (2FA)</span>
                </div>
                {user.emailVerified ? (
                  <span className="text-[10px] font-mono text-[#00E676] bg-[#00E676]/12 px-2 py-0.5 rounded-full border border-[#00E676]/25 flex items-center gap-1">
                    <Check className="w-3 h-3" />
                    Active
                  </span>
                ) : (
                  <span className="text-[10px] font-mono text-[#FF4D4F] bg-[#FF4D4F]/12 px-2 py-0.5 rounded-full border border-[#FF4D4F]/25">
                    Unverified
                  </span>
                )}
              </div>
              <div className="text-[11px] text-slate-400 truncate font-mono">{user.email}</div>

              {!user.emailVerified && (
                <div>
                  <button
                    type="button"
                    onClick={handleResendVerification}
                    disabled={isSendingVerification}
                    className="w-full py-2 px-3 rounded-xl bg-[#00E5FF]/12 hover:bg-[#00E5FF]/20 border border-[#00E5FF]/30 text-xs font-bold text-[#00E5FF] transition-all flex items-center justify-center gap-1.5 cursor-pointer min-h-[38px]"
                  >
                    {isSendingVerification ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Send className="w-3.5 h-3.5" />
                    )}
                    <span>Send Verification Email</span>
                  </button>
                  {verificationFeedback && (
                    <p className="text-[10px] text-[#00E5FF] mt-2 text-center">{verificationFeedback}</p>
                  )}
                </div>
              )}
            </div>

            <div className="p-3.5 rounded-2xl bg-[#050807]/75 border border-white/[0.07] space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-[#F5B800]" />
                  <span className="text-xs font-bold text-white">Authenticator / Passkey</span>
                </div>
                <span className="text-[10px] font-mono text-[#F5B800] bg-[#F5B800]/12 px-2 py-0.5 rounded-full border border-[#F5B800]/25">
                  Phase 2
                </span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Hardware FIDO2 &amp; TOTP Authenticator support is scheduled for the next security tier upgrade.
              </p>
            </div>
          </div>

          {/* CARD 5: SECURITY EVENT LOG */}
          <div className="oneui-glass-card rounded-[24px] p-5 sm:p-6 space-y-4">
            <div className="border-b border-white/[0.08] pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <History className="w-4 h-4 text-[#00E5FF]" />
                <span>Security Event Log</span>
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">Recent authentication and account events.</p>
            </div>

            {activityLoading ? (
              <div className="py-6 flex flex-col items-center justify-center gap-2 text-xs text-slate-400">
                <Loader2 className="w-4 h-4 animate-spin text-[#00E5FF]" />
                <span>Loading event log...</span>
              </div>
            ) : activities.length === 0 ? (
              <div className="p-4 rounded-2xl bg-[#050807]/70 border border-white/[0.07] text-center text-[11px] text-slate-400">
                No security events recorded yet.
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1">
                {activities.map((act) => (
                  <div
                    key={act.id}
                    className="p-3 rounded-2xl bg-[#050807]/75 border border-white/[0.06] space-y-1 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-white">{act.description}</span>
                      <span className="text-[10px] font-mono text-slate-400 shrink-0">
                        {formatTimestamp(act.createdAt)}
                      </span>
                    </div>
                    <div className="text-[10px] font-mono text-[#00E5FF]">
                      Device: <span className="text-slate-400">{act.device || 'Web Client'}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
