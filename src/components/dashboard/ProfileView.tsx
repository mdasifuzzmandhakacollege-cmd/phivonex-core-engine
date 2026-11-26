import React, { useState, useEffect } from 'react';
import {
  User,
  Shield,
  Lock,
  Edit3,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Copy,
  Check,
  Globe,
  Phone,
  Mail,
  Calendar,
  ArrowRight,
  UserCheck,
  ShieldCheck,
  BadgeCheck,
} from 'lucide-react';
import { UserProfile, useAuth } from '../../context/AuthContext';
import { BinanceKYCModal } from '../modals/BinanceKYCModal';

interface ProfileViewProps {
  user: UserProfile;
  onNavigateTab: (tab: string) => void;
}

interface SponsorData {
  publicId: string;
  displayName: string;
}

export const ProfileView: React.FC<ProfileViewProps> = ({ user, onNavigateTab }) => {
  const { setUser } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [fullName, setFullName] = useState(user.fullName || '');
  const [phone, setPhone] = useState(user.phone || '');
  const [country, setCountry] = useState(user.country || '');
  const [sponsor, setSponsor] = useState<SponsorData | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [isKycModalOpen, setIsKycModalOpen] = useState(false);

  useEffect(() => {
    setFullName(user.fullName || '');
    setPhone(user.phone || '');
    setCountry(user.country || '');
  }, [user]);

  useEffect(() => {
    const handleProfileUpdated = (e: any) => {
      const u = e?.detail?.user;
      if (u) {
        if (u.fullName !== undefined) setFullName(u.fullName);
        else if (u.full_name !== undefined) setFullName(u.full_name);
        if (u.phone !== undefined) setPhone(u.phone || '');
        if (u.country !== undefined) setCountry(u.country || '');
      }
    };
    window.addEventListener('phivonex:profile-updated', handleProfileUpdated);
    return () => window.removeEventListener('phivonex:profile-updated', handleProfileUpdated);
  }, []);

  useEffect(() => {
    let isMounted = true;
    fetch('/api/users/me/profile', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (isMounted && data?.profile?.sponsor) {
          setSponsor(data.profile.sponsor);
        }
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, []);

  const handleCopyPublicId = () => {
    const id = user.publicId || 'PHX-MEMBER';
    navigator.clipboard.writeText(id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const handleCopyCode = () => {
    if (user.referralCode) {
      navigator.clipboard.writeText(user.referralCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  const handleCancelEdit = () => {
    setFullName(user.fullName || '');
    setPhone(user.phone || '');
    setCountry(user.country || '');
    setErrorMsg(null);
    setIsEditing(false);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!fullName.trim() || fullName.trim().length < 2) {
      setErrorMsg('Full name must be at least 2 characters long.');
      return;
    }

    if (!country.trim() || country.trim().length < 2) {
      setErrorMsg('Country must be at least 2 characters long.');
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch('/api/users/me/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          fullName: fullName.trim(),
          phone: phone.trim() || null,
          country: country.trim(),
        }),
      });

      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.message || 'Failed to update profile.');
      }

      if (result.user) {
        setUser(result.user);
      }

      setSuccessMsg('Profile updated successfully.');
      setIsEditing(false);
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setErrorMsg(err?.message || 'An unexpected error occurred while saving.');
    } finally {
      setIsSaving(false);
    }
  };

  const formatDate = (isoString?: string) => {
    if (!isoString) return 'Active Member';
    try {
      return new Date(isoString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return 'Active Member';
    }
  };

  const kycProgress =
    user.kycStatus === 'VERIFIED' ? 100 : user.kycStatus === 'PENDING' ? 65 : 25;

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-fadeIn pb-10 min-w-0 max-w-full overflow-x-hidden">
      {/* 1. DIGITAL INVESTOR IDENTITY PASS */}
      <div className="oneui-glass-card rounded-[28px] p-5 sm:p-7 relative overflow-hidden">
        <div className="absolute -top-16 -right-16 w-72 h-72 bg-[#00E5FF]/[0.08] rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 left-1/4 w-64 h-64 bg-[#F5B800]/[0.06] rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-5">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-16 h-16 rounded-[20px] bg-gradient-to-tr from-[#00E5FF]/20 via-[#0e1513] to-[#F5B800]/20 border border-[#00E5FF]/35 flex items-center justify-center text-[#00E5FF] font-mono text-xl font-extrabold shrink-0 shadow-lg">
              {user.fullName
                ? user.fullName
                    .split(' ')
                    .map((n) => n[0])
                    .join('')
                    .toUpperCase()
                    .slice(0, 2)
                : 'PX'}
            </div>

            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight truncate">
                  {user.fullName}
                </h1>
                <span className="text-[10px] font-mono uppercase font-bold bg-[#00E676]/12 text-[#00E676] border border-[#00E676]/30 px-2.5 py-0.5 rounded-full">
                  {user.status || 'ACTIVE'}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs font-mono text-slate-400">
                <button
                  type="button"
                  onClick={handleCopyPublicId}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.1] text-[#00E5FF] font-semibold transition-all cursor-pointer"
                  title="Copy PHIVONEX ID"
                >
                  <span>{user.publicId || 'PHX-MEMBER'}</span>
                  {copiedId ? <Check className="w-3.5 h-3.5 text-[#00E676]" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
                <span className="inline-flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>Member Since {formatDate(user.createdAt)}</span>
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {!isEditing ? (
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="px-4 py-2.5 rounded-2xl bg-[#00E5FF] hover:bg-[#00E5FF]/90 text-[#050807] text-xs font-bold transition-all shadow-lg shadow-[#00E5FF]/20 flex items-center gap-2 cursor-pointer min-h-[44px] active:scale-95"
              >
                <Edit3 className="w-4 h-4" />
                <span>Edit Profile</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleCancelEdit}
                className="px-4 py-2.5 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.12] text-slate-300 hover:text-white text-xs font-semibold transition-colors cursor-pointer min-h-[44px]"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Notifications */}
      {successMsg && (
        <div className="p-4 rounded-2xl bg-[#00E676]/12 border border-[#00E676]/30 text-[#00E676] text-xs flex items-center gap-3 animate-fadeIn">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 rounded-2xl bg-[#FF4D4F]/12 border border-[#FF4D4F]/30 text-[#FF8587] text-xs flex items-center gap-3 animate-fadeIn">
          <AlertCircle className="w-5 h-5 shrink-0 text-[#FF4D4F]" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* 2. KYC VERIFICATION TIER CARD */}
      <div className="oneui-glass-card rounded-[24px] p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div
              className={`w-11 h-11 rounded-2xl flex items-center justify-center border shrink-0 ${
                user.kycStatus === 'VERIFIED'
                  ? 'bg-[#00E676]/12 border-[#00E676]/30 text-[#00E676]'
                  : user.kycStatus === 'PENDING'
                  ? 'bg-[#F5B800]/12 border-[#F5B800]/30 text-[#F5B800]'
                  : 'bg-[#00E5FF]/12 border-[#00E5FF]/30 text-[#00E5FF]'
              }`}
            >
              <BadgeCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold text-white">KYC Identity Verification Tier</h2>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold border ${
                    user.kycStatus === 'VERIFIED'
                      ? 'bg-[#00E676]/12 text-[#00E676] border-[#00E676]/30'
                      : user.kycStatus === 'PENDING'
                      ? 'bg-[#F5B800]/12 text-[#F5B800] border-[#F5B800]/30'
                      : 'bg-white/[0.06] text-slate-300 border-white/[0.12]'
                  }`}
                >
                  {user.kycStatus === 'VERIFIED'
                    ? 'Level 1 Verified'
                    : user.kycStatus === 'PENDING'
                    ? 'Under Review'
                    : user.kycStatus === 'REJECTED'
                    ? 'Action Required'
                    : 'Unverified Tier'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Complete institutional identity verification to unlock higher daily withdrawal ceilings and priority compliance clearance.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsKycModalOpen(true)}
            className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition-all cursor-pointer min-h-[42px] shrink-0 active:scale-95 ${
              user.kycStatus === 'VERIFIED'
                ? 'bg-[#00E676]/15 text-[#00E676] border border-[#00E676]/35 hover:bg-[#00E676]/25'
                : 'bg-[#F5B800] hover:bg-[#F5B800]/90 text-[#050807] shadow-lg shadow-[#F5B800]/20'
            }`}
          >
            {user.kycStatus === 'VERIFIED'
              ? 'View Verification Certificate'
              : user.kycStatus === 'PENDING'
              ? 'Check Review Status'
              : 'Start KYC Verification'}
          </button>
        </div>

        {/* Progress Bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-mono">
            <span className="text-slate-400">Compliance Readiness</span>
            <span className="text-[#00E5FF] font-bold">{kycProgress}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-white/[0.06] overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#00E5FF] via-[#00E676] to-[#F5B800] transition-all duration-500"
              style={{ width: `${kycProgress}%` }}
            />
          </div>
        </div>
      </div>

      {/* 3. PROFILE FORM & SPONSOR METADATA */}
      <form onSubmit={handleSaveProfile} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Editable Profile Panel */}
          <div className="lg:col-span-2 oneui-glass-card rounded-[24px] p-5 sm:p-7 space-y-5 min-w-0">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
              <div>
                <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                  <User className="w-4 h-4 text-[#00E5FF]" />
                  <span>Investor Profile Details</span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Manage your verified contact details and regional profile settings.
                </p>
              </div>
              {isEditing && (
                <span className="text-[11px] font-mono text-[#00E5FF] bg-[#00E5FF]/12 px-2.5 py-1 rounded-full border border-[#00E5FF]/25">
                  Editing
                </span>
              )}
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">Full Legal Name</label>
                {isEditing ? (
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    maxLength={100}
                    className="w-full px-4 py-3 rounded-2xl bg-[#050807]/85 border border-white/[0.12] focus:border-[#00E5FF] text-white text-sm outline-none transition-all"
                  />
                ) : (
                  <div className="p-3.5 rounded-2xl bg-[#050807]/70 border border-white/[0.07] text-sm text-white font-semibold">
                    {user.fullName}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">Mobile Phone</label>
                {isEditing ? (
                  <div className="relative">
                    <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      maxLength={30}
                      placeholder="+1 (555) 000-0000"
                      className="w-full pl-10 pr-4 py-3 rounded-2xl bg-[#050807]/85 border border-white/[0.12] focus:border-[#00E5FF] text-white text-sm outline-none transition-all font-mono"
                    />
                  </div>
                ) : (
                  <div className="p-3.5 rounded-2xl bg-[#050807]/70 border border-white/[0.07] text-sm text-white font-mono flex items-center gap-2">
                    <Phone className="w-4 h-4 text-slate-400" />
                    <span>{user.phone || 'Not provided'}</span>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">Country / Jurisdiction</label>
                {isEditing ? (
                  <div className="relative">
                    <Globe className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                      required
                      maxLength={100}
                      placeholder="e.g., Singapore, United Kingdom, UAE"
                      className="w-full pl-10 pr-4 py-3 rounded-2xl bg-[#050807]/85 border border-white/[0.12] focus:border-[#00E5FF] text-white text-sm outline-none transition-all"
                    />
                  </div>
                ) : (
                  <div className="p-3.5 rounded-2xl bg-[#050807]/70 border border-white/[0.07] text-sm text-white font-semibold flex items-center gap-2">
                    <Globe className="w-4 h-4 text-slate-400" />
                    <span>{user.country || 'Global'}</span>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5 flex items-center justify-between">
                  <span>Registered Email</span>
                  <span className="text-[10px] font-mono text-slate-500 flex items-center gap-1">
                    <Lock className="w-3 h-3" />
                    <span>Primary Credential</span>
                  </span>
                </label>
                <div className="p-3.5 rounded-2xl bg-[#050807]/60 border border-white/[0.06] text-sm text-slate-200 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Mail className="w-4 h-4 text-slate-400 shrink-0" />
                    <span className="truncate">{user.email}</span>
                  </div>
                  {user.emailVerified ? (
                    <span className="text-[10px] font-mono text-[#00E676] bg-[#00E676]/12 px-2.5 py-0.5 rounded-full border border-[#00E676]/25 flex items-center gap-1">
                      <UserCheck className="w-3 h-3" />
                      Verified
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onNavigateTab('security')}
                      className="text-[10px] font-mono text-[#FF4D4F] hover:underline cursor-pointer"
                    >
                      Verify in Security
                    </button>
                  )}
                </div>
              </div>
            </div>

            {isEditing && (
              <div className="pt-4 border-t border-white/[0.08] flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  disabled={isSaving}
                  className="px-4 py-2.5 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] text-slate-300 hover:text-white text-xs font-semibold transition-colors cursor-pointer min-h-[44px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-6 py-2.5 rounded-2xl bg-[#00E5FF] hover:bg-[#00E5FF]/90 disabled:opacity-50 text-[#050807] text-xs font-bold transition-all shadow-lg shadow-[#00E5FF]/20 flex items-center gap-2 cursor-pointer min-h-[44px]"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Save Profile</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Right Column: Sponsor & Account Metadata */}
          <div className="space-y-5">
            <div className="oneui-glass-card rounded-[24px] p-5 sm:p-6 space-y-4">
              <div className="border-b border-white/[0.08] pb-3">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Shield className="w-4 h-4 text-[#00E5FF]" />
                  <span>Account Metadata</span>
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">Immutable ecosystem identifiers.</p>
              </div>

              <div className="p-3.5 rounded-2xl bg-[#050807]/75 border border-white/[0.07] space-y-1">
                <span className="text-[10px] font-mono text-slate-400 uppercase block">PHIVONEX ID</span>
                <div className="text-sm font-mono font-bold text-[#00E5FF]">{user.publicId || 'PHX-MEMBER'}</div>
              </div>

              <div className="p-3.5 rounded-2xl bg-[#050807]/75 border border-white/[0.07] space-y-1.5">
                <span className="text-[10px] font-mono text-slate-400 uppercase block">Referral Code</span>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-mono font-bold text-white truncate">
                    {user.referralCode || user.publicId || 'Pending'}
                  </span>
                  {user.referralCode && (
                    <button
                      type="button"
                      onClick={handleCopyCode}
                      className="p-1.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-slate-300 hover:text-[#00E5FF] transition-colors cursor-pointer"
                      title="Copy referral code"
                    >
                      {copiedCode ? <Check className="w-3.5 h-3.5 text-[#00E676]" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  )}
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-[#050807]/75 border border-white/[0.07] space-y-1">
                <span className="text-[10px] font-mono text-slate-400 uppercase block">Sponsor Association</span>
                <div className="text-xs font-semibold text-white">
                  {sponsor ? (
                    <div className="space-y-0.5">
                      <div>{sponsor.displayName}</div>
                      <div className="text-[10px] font-mono text-[#00E5FF]">{sponsor.publicId}</div>
                    </div>
                  ) : (
                    <span className="text-[#00E676]">Direct Protocol Member</span>
                  )}
                </div>
              </div>
            </div>

            <div className="oneui-glass-card rounded-[24px] p-5 space-y-3">
              <div className="flex items-center gap-2 text-white font-bold text-xs">
                <ShieldCheck className="w-4 h-4 text-[#00E676]" />
                <span>Account Security</span>
              </div>
              <p className="text-[11px] text-slate-400">
                Manage password rotation, anti-phishing verification, and active device sessions.
              </p>
              <button
                type="button"
                onClick={() => onNavigateTab('security')}
                className="w-full py-2.5 px-3 rounded-2xl bg-[#00E5FF]/12 hover:bg-[#00E5FF]/20 border border-[#00E5FF]/30 text-xs font-bold text-[#00E5FF] transition-all flex items-center justify-center gap-2 cursor-pointer min-h-[42px]"
              >
                <span>Open Security Center</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </form>

      <BinanceKYCModal isOpen={isKycModalOpen} onClose={() => setIsKycModalOpen(false)} />
    </div>
  );
};
