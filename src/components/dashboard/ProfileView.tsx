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
  Layers,
  ArrowRight,
  UserCheck,
  ShieldCheck,
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
  const [copiedCode, setCopiedCode] = useState(false);
  const [isKycModalOpen, setIsKycModalOpen] = useState(false);

  // Sync state when user prop updates
  useEffect(() => {
    setFullName(user.fullName || '');
    setPhone(user.phone || '');
    setCountry(user.country || '');
  }, [user]);

  // Real-time listener for admin/external profile modifications
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
    return () => {
      window.removeEventListener('phivonex:profile-updated', handleProfileUpdated);
    };
  }, []);

  // Load Sponsor and detailed profile metadata
  useEffect(() => {
    let isMounted = true;
    const loadProfileData = async () => {
      try {
        const res = await fetch('/api/users/me/profile', {
          credentials: 'include',
        });
        if (res.ok) {
          const data = await res.json();
          if (isMounted && data.profile) {
            if (data.profile.sponsor) {
              setSponsor(data.profile.sponsor);
            }
          }
        }
      } catch (err) {
        console.warn('Failed to load full profile data:', err);
      }
    };
    loadProfileData();
    return () => {
      isMounted = false;
    };
  }, []);

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

    // Client validation
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

      // Update global auth state
      if (result.user) {
        setUser(result.user);
      }

      setSuccessMsg('Profile updated successfully.');
      setIsEditing(false);
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setErrorMsg(err.message || 'An unexpected error occurred while saving.');
    } finally {
      setIsSaving(false);
    }
  };

  const formatDate = (isoString?: string) => {
    if (!isoString) return 'Active Operator';
    try {
      return new Date(isoString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return 'Active Operator';
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-fadeIn">
      {/* Header Banner */}
      <div className="p-6 sm:p-8 rounded-2xl bg-gradient-to-r from-[#07101D] via-[#0B1528] to-[#07101D] border border-white/[0.08] shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-[#00CFFF]/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-[#00CFFF]/20 to-[#168BFF]/20 border border-[#00CFFF]/30 flex items-center justify-center text-[#00CFFF] shadow-inner font-mono text-xl font-bold">
              {user.fullName
                ? user.fullName
                    .split(' ')
                    .map((n) => n[0])
                    .join('')
                    .toUpperCase()
                    .slice(0, 2)
                : 'OP'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                  {user.fullName}
                </h1>
                <span className="text-[10px] font-mono uppercase bg-[#32D583]/10 text-[#32D583] border border-[#32D583]/30 px-2 py-0.5 rounded-full">
                  {user.status || 'ACTIVE'}
                </span>
              </div>
              <p className="text-xs text-[#98A2B3] mt-0.5 flex items-center gap-2 font-mono">
                <span>PHIVONEX ID:</span>
                <span className="text-[#00CFFF] font-semibold">{user.publicId || 'PHX-PENDING'}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {!isEditing ? (
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="px-4 py-2.5 rounded-xl bg-[#00CFFF] hover:bg-[#00CFFF]/90 text-[#05070B] text-xs font-bold transition-all shadow-lg shadow-[#00CFFF]/10 flex items-center gap-2 cursor-pointer min-h-[44px]"
              >
                <Edit3 className="w-4 h-4" />
                <span>Edit Profile</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleCancelEdit}
                className="px-4 py-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.12] text-[#98A2B3] hover:text-white text-xs font-semibold transition-colors cursor-pointer min-h-[44px]"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Notifications */}
      {successMsg && (
        <div className="p-4 rounded-xl bg-[#32D583]/10 border border-[#32D583]/30 text-[#32D583] text-xs flex items-center gap-3 animate-fadeIn">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 rounded-xl bg-[#F04438]/10 border border-[#F04438]/30 text-[#F04438] text-xs flex items-center gap-3 animate-fadeIn">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Profile Form & Attribute Grid */}
      <form onSubmit={handleSaveProfile} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Main Attributes Panel (Editable & Core Details) */}
          <div className="lg:col-span-2 p-6 sm:p-8 rounded-2xl bg-[#07101D] border border-white/[0.08] shadow-xl space-y-6">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <User className="w-4 h-4 text-[#00CFFF]" />
                  <span>Operator Identity Parameters</span>
                </h2>
                <p className="text-xs text-[#98A2B3] mt-0.5">
                  Update verified communication channels and personal display details.
                </p>
              </div>
              {isEditing && (
                <span className="text-[11px] font-mono text-[#00CFFF] bg-[#00CFFF]/10 px-2.5 py-1 rounded-md border border-[#00CFFF]/20 animate-pulse">
                  Editing Mode
                </span>
              )}
            </div>

            <div className="space-y-4">
              {/* Full Name */}
              <div>
                <label className="block text-xs font-semibold text-[#98A2B3] mb-1.5 flex items-center justify-between">
                  <span>Full Legal / Operator Name</span>
                  {isEditing && <span className="text-[10px] text-[#00CFFF]">Editable</span>}
                </label>
                {isEditing ? (
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    maxLength={100}
                    placeholder="e.g., Elena Rostova"
                    className="w-full px-4 py-3 rounded-xl bg-[#05070B] border border-white/[0.12] focus:border-[#00CFFF] focus:ring-1 focus:ring-[#00CFFF] text-white text-sm outline-none transition-all"
                  />
                ) : (
                  <div className="p-3.5 rounded-xl bg-[#05070B] border border-white/[0.06] text-sm text-white font-medium">
                    {user.fullName}
                  </div>
                )}
              </div>

              {/* Mobile Phone */}
              <div>
                <label className="block text-xs font-semibold text-[#98A2B3] mb-1.5 flex items-center justify-between">
                  <span>Mobile Phone Number</span>
                  {isEditing && <span className="text-[10px] text-[#00CFFF]">Editable (Optional)</span>}
                </label>
                {isEditing ? (
                  <div className="relative">
                    <Phone className="w-4 h-4 text-[#98A2B3] absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      maxLength={30}
                      placeholder="+1 (555) 000-0000"
                      className="w-full pl-10 pr-4 py-3 rounded-xl bg-[#05070B] border border-white/[0.12] focus:border-[#00CFFF] focus:ring-1 focus:ring-[#00CFFF] text-white text-sm outline-none transition-all font-mono"
                    />
                  </div>
                ) : (
                  <div className="p-3.5 rounded-xl bg-[#05070B] border border-white/[0.06] text-sm text-white font-mono flex items-center gap-2">
                    <Phone className="w-4 h-4 text-[#98A2B3]" />
                    <span>{user.phone || 'No phone registered'}</span>
                  </div>
                )}
              </div>

              {/* Country */}
              <div>
                <label className="block text-xs font-semibold text-[#98A2B3] mb-1.5 flex items-center justify-between">
                  <span>Country / Region</span>
                  {isEditing && <span className="text-[10px] text-[#00CFFF]">Editable</span>}
                </label>
                {isEditing ? (
                  <div className="relative">
                    <Globe className="w-4 h-4 text-[#98A2B3] absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                      required
                      maxLength={100}
                      placeholder="e.g., United States, United Kingdom, Singapore"
                      className="w-full pl-10 pr-4 py-3 rounded-xl bg-[#05070B] border border-white/[0.12] focus:border-[#00CFFF] focus:ring-1 focus:ring-[#00CFFF] text-white text-sm outline-none transition-all"
                    />
                  </div>
                ) : (
                  <div className="p-3.5 rounded-xl bg-[#05070B] border border-white/[0.06] text-sm text-white font-medium flex items-center gap-2">
                    <Globe className="w-4 h-4 text-[#98A2B3]" />
                    <span>{user.country || 'Global'}</span>
                  </div>
                )}
              </div>

              {/* Email Address (Immutable) */}
              <div>
                <label className="block text-xs font-semibold text-[#98A2B3] mb-1.5 flex items-center justify-between">
                  <span>Registered Email Address</span>
                  <span className="text-[10px] font-mono text-[#98A2B3] flex items-center gap-1">
                    <Lock className="w-3 h-3 text-[#98A2B3]" />
                    <span>Cryptographically Bound</span>
                  </span>
                </label>
                <div className="p-3.5 rounded-xl bg-[#05070B]/70 border border-white/[0.04] text-sm text-[#D0D5DD] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-[#98A2B3]" />
                    <span>{user.email}</span>
                  </div>
                  {user.emailVerified ? (
                    <span className="text-[10px] font-mono text-[#32D583] bg-[#32D583]/10 px-2 py-0.5 rounded border border-[#32D583]/20 flex items-center gap-1">
                      <UserCheck className="w-3 h-3" />
                      Verified
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onNavigateTab('security')}
                      className="text-[10px] font-mono text-[#F04438] hover:underline cursor-pointer"
                    >
                      Unverified (Verify in Security)
                    </button>
                  )}
                </div>
              </div>

              {/* Binance-Grade KYC Identity Status Box */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-white flex items-center justify-between">
                  <span>Identity Verification (KYC)</span>
                  <span className="text-[10px] font-mono text-[#00CFFF]">
                    Binance-Standard Level 1
                  </span>
                </label>
                <div className="p-3.5 rounded-xl bg-[#05070B]/70 border border-white/[0.04] text-sm text-[#D0D5DD] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className={`w-4 h-4 ${
                      user.kycStatus === 'VERIFIED'
                        ? 'text-emerald-400'
                        : user.kycStatus === 'PENDING'
                        ? 'text-amber-400'
                        : 'text-slate-400'
                    }`} />
                    <span className="text-xs font-mono font-medium">
                      {user.kycStatus === 'VERIFIED'
                        ? 'Level 1 Identity Verified'
                        : user.kycStatus === 'PENDING'
                        ? 'Under Active Security Review'
                        : user.kycStatus === 'REJECTED'
                        ? 'Verification Needs Attention'
                        : 'Unverified Account'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsKycModalOpen(true)}
                    className={`text-[10px] font-mono px-2.5 py-1 rounded-lg border font-bold transition-all cursor-pointer ${
                      user.kycStatus === 'VERIFIED'
                        ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/20'
                        : user.kycStatus === 'PENDING'
                        ? 'bg-amber-500/10 text-amber-300 border-amber-500/30 hover:bg-amber-500/20'
                        : user.kycStatus === 'REJECTED'
                        ? 'bg-rose-500/10 text-rose-300 border-rose-500/30 hover:bg-rose-500/20'
                        : 'bg-amber-400 hover:bg-amber-300 text-black border-transparent shadow'
                    }`}
                  >
                    {user.kycStatus === 'VERIFIED' ? 'View Certificate' : user.kycStatus === 'PENDING' ? 'View Status' : 'Verify Now'}
                  </button>
                </div>
              </div>
            </div>

            {/* Save Buttons when Editing */}
            {isEditing && (
              <div className="pt-4 border-t border-white/[0.08] flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  disabled={isSaving}
                  className="px-4 py-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-[#98A2B3] hover:text-white text-xs font-semibold transition-colors cursor-pointer min-h-[44px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-6 py-2.5 rounded-xl bg-[#00CFFF] hover:bg-[#00CFFF]/90 disabled:opacity-50 text-[#05070B] text-xs font-bold transition-all shadow-lg shadow-[#00CFFF]/10 flex items-center gap-2 cursor-pointer min-h-[44px]"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Saving Parameters...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Save Changes</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Side Protocol Parameters Panel (Strictly Immutable Attributes) */}
          <div className="space-y-6">
            <div className="p-6 rounded-2xl bg-[#07101D] border border-white/[0.08] shadow-xl space-y-4">
              <div className="border-b border-white/[0.08] pb-3">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Shield className="w-4 h-4 text-[#00CFFF]" />
                  <span>Immutable Protocol Records</span>
                </h3>
                <p className="text-[11px] text-[#98A2B3] mt-0.5">
                  Permanent identifiers managed by consensus logic.
                </p>
              </div>

              {/* Public ID */}
              <div className="p-3.5 rounded-xl bg-[#05070B] border border-white/[0.06] space-y-1">
                <div className="flex items-center justify-between text-[10px] font-mono text-[#98A2B3] uppercase">
                  <span>PHIVONEX Public ID</span>
                  <Lock className="w-3 h-3 text-[#98A2B3]" />
                </div>
                <div className="text-sm font-mono font-bold text-[#00CFFF]">
                  {user.publicId || 'PHX-PENDING'}
                </div>
              </div>

              {/* Referral Code */}
              <div className="p-3.5 rounded-xl bg-[#05070B] border border-white/[0.06] space-y-1.5">
                <div className="flex items-center justify-between text-[10px] font-mono text-[#98A2B3] uppercase">
                  <span>Personal Referral Code</span>
                  <Lock className="w-3 h-3 text-[#98A2B3]" />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-mono font-bold text-white">
                    {user.referralCode || 'Pending'}
                  </span>
                  {user.referralCode && (
                    <button
                      type="button"
                      onClick={handleCopyCode}
                      className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-[#98A2B3] hover:text-[#00CFFF] transition-colors cursor-pointer min-h-[32px] min-w-[32px] flex items-center justify-center"
                      title="Copy Code"
                    >
                      {copiedCode ? <Check className="w-3.5 h-3.5 text-[#32D583]" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  )}
                </div>
              </div>

              {/* Sponsor Association */}
              <div className="p-3.5 rounded-xl bg-[#05070B] border border-white/[0.06] space-y-1">
                <div className="flex items-center justify-between text-[10px] font-mono text-[#98A2B3] uppercase">
                  <span>Sponsor Association</span>
                  <Lock className="w-3 h-3 text-[#98A2B3]" />
                </div>
                <div className="text-xs font-semibold text-white">
                  {sponsor ? (
                    <div className="space-y-0.5">
                      <div className="text-white font-medium">{sponsor.displayName}</div>
                      <div className="text-[10px] font-mono text-[#00CFFF]">{sponsor.publicId}</div>
                    </div>
                  ) : (
                    <span className="text-[#32D583]">Genesis Direct Operator</span>
                  )}
                </div>
              </div>

              {/* Member Since */}
              <div className="p-3.5 rounded-xl bg-[#05070B] border border-white/[0.06] space-y-1">
                <div className="flex items-center justify-between text-[10px] font-mono text-[#98A2B3] uppercase">
                  <span>Registration Epoch</span>
                  <Calendar className="w-3 h-3 text-[#98A2B3]" />
                </div>
                <div className="text-xs font-mono text-white font-medium">
                  {formatDate(user.createdAt)}
                </div>
              </div>
            </div>

            {/* Quick Link to Security */}
            <div className="p-5 rounded-2xl bg-gradient-to-br from-[#07101D] to-[#0A1628] border border-white/[0.08] shadow-lg space-y-3">
              <div className="flex items-center gap-2 text-white font-bold text-xs">
                <Shield className="w-4 h-4 text-[#00CFFF]" />
                <span>Account Protection</span>
              </div>
              <p className="text-[11px] text-[#98A2B3]">
                Manage your Argon2id password, monitor active sessions, and review security activity.
              </p>
              <button
                type="button"
                onClick={() => onNavigateTab('security')}
                className="w-full py-2 px-3 rounded-xl bg-[#00CFFF]/10 hover:bg-[#00CFFF]/20 border border-[#00CFFF]/30 text-xs font-bold text-[#00CFFF] transition-all flex items-center justify-center gap-2 cursor-pointer min-h-[44px]"
              >
                <span>Open Security Center</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </form>

      {/* Binance-Grade KYC Modal */}
      <BinanceKYCModal
        isOpen={isKycModalOpen}
        onClose={() => setIsKycModalOpen(false)}
      />
    </div>
  );
};
