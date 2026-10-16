import React, { useState, useEffect } from 'react';
import {
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  UserCheck,
  Lock,
  Mail,
  Globe,
  Tag,
  Loader2,
  Check,
  X
} from 'lucide-react';
import { PhivonexLogo } from '../components/brand/PhivonexLogo';
import { COUNTRIES } from '../data/countries';
import { useAuth } from '../context/AuthContext';

interface RegisterPageProps {
  initialReferralCode?: string;
  onNavigate: (route: string) => void;
  onOpenLegalModal?: (title: string) => void;
}

interface SponsorData {
  valid: boolean;
  referralCode?: string;
  sponsor?: {
    publicId: string;
    displayName: string;
  };
}

export const RegisterPage: React.FC<RegisterPageProps> = ({
  initialReferralCode = '',
  onNavigate,
  onOpenLegalModal,
}) => {
  const { setUser, loginWithGoogle } = useAuth();

  // Multi-step Registration state
  const [step, setStep] = useState<'form' | 'verify' | 'success'>('form');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [resendCountdown, setResendCountdown] = useState(0);
  const otpInputsRef = React.useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (resendCountdown > 0) {
      const timer = setTimeout(() => setResendCountdown(resendCountdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCountdown]);

  const maskEmail = (emailStr: string) => {
    const [local, domain] = emailStr.split('@');
    if (!local || !domain) return emailStr;
    if (local.length <= 2) {
      return `${local[0]}***@${domain}`;
    }
    return `${local.slice(0, 3)}***@${domain}`;
  };

  const handleOtpChange = (value: string, index: number) => {
    if (!/^\d*$/.test(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value.slice(-1);
    setOtp(newOtp);
    if (errors.otp) setErrors({});

    // Auto-focus next input box on type
    if (value && index < 5) {
      otpInputsRef.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      otpInputsRef.current[index - 1]?.focus();
    }
  };

  // Form fields
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [selectedCountry, setSelectedCountry] = useState<string>('');
  const [referralCode, setReferralCode] = useState(initialReferralCode);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [agreeTerms, setAgreeTerms] = useState(false);

  // UI state
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCheckingReferral, setIsCheckingReferral] = useState(false);
  const [sponsorData, setSponsorData] = useState<SponsorData | null>(null);

  // Validation
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [registrationSuccess, setRegistrationSuccess] = useState(false);

  // Referral code resolution via backend API
  const handleReferralLookup = async (code: string) => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) {
      setSponsorData(null);
      setErrors((prev) => {
        const updated = { ...prev };
        delete updated.referralCode;
        return updated;
      });
      return;
    }

    setIsCheckingReferral(true);
    try {
      const res = await fetch(`/api/referrals/resolve/${encodeURIComponent(trimmed)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.valid) {
          setSponsorData(data);
          setErrors((prev) => {
            const updated = { ...prev };
            delete updated.referralCode;
            return updated;
          });
        } else {
          setSponsorData({ valid: false });
          setErrors((prev) => ({
            ...prev,
            referralCode: 'Referral code not found.',
          }));
        }
      } else {
        setSponsorData({ valid: false });
        setErrors((prev) => ({
          ...prev,
          referralCode: 'Referral code not found.',
        }));
      }
    } catch {
      setSponsorData({ valid: false });
      setErrors((prev) => ({
        ...prev,
        referralCode: 'Could not verify referral code.',
      }));
    } finally {
      setIsCheckingReferral(false);
    }
  };

  // Parse URL search params if ?ref= exists or check localStorage
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const refParam = params.get('ref') || initialReferralCode || localStorage.getItem('phivonex_pending_ref');
      if (refParam) {
        const cleanRef = refParam.trim().toUpperCase();
        setReferralCode(cleanRef);
        handleReferralLookup(cleanRef);
      }
    } catch {
      // safe fallback
    }
  }, [initialReferralCode]);

  // Debounced referral lookup when user types
  useEffect(() => {
    if (!referralCode.trim()) {
      setSponsorData(null);
      setErrors((prev) => {
        const updated = { ...prev };
        delete updated.referralCode;
        return updated;
      });
      return;
    }
    const timer = setTimeout(() => {
      handleReferralLookup(referralCode);
    }, 450);
    return () => clearTimeout(timer);
  }, [referralCode]);

  // Password strength calculations (min 10 chars, uppercase, number, symbol)
  const passwordCriteria = {
    length: password.length >= 10,
    uppercase: /[A-Z]/.test(password) && /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
  };
  const passwordStrengthScore = Object.values(passwordCriteria).filter(Boolean).length;

  const validate = (): boolean => {
    const errs: Record<string, string> = {};

    // 1. Full Name
    if (!fullName.trim()) {
      errs.fullName = 'Full Name is required';
    } else if (fullName.trim().length < 2) {
      errs.fullName = 'Please enter your full legal name';
    }

    // 2. Email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email.trim()) {
      errs.email = 'Email Address is required';
    } else if (!emailRegex.test(email.trim())) {
      errs.email = 'Please enter a valid email address';
    }

    // 3. Country
    if (!selectedCountry) {
      errs.country = 'Please select your country of residence';
    }

    // 4. Referral Code (if provided, must be valid)
    if (referralCode.trim() && sponsorData && !sponsorData.valid) {
      errs.referralCode = 'Referral code not found.';
    }

    // 5. Password (min 10 chars)
    if (!password) {
      errs.password = 'Password is required';
    } else if (password.length < 10) {
      errs.password = 'Password must be at least 10 characters long';
    }

    // 6. Confirm Password
    if (!confirmPassword) {
      errs.confirmPassword = 'Confirm your password';
    } else if (password !== confirmPassword) {
      errs.confirmPassword = 'Passwords do not match';
    }

    // 7. Terms & Privacy checkbox
    if (!agreeTerms) {
      errs.agreeTerms = 'You must accept the Terms & Privacy policy to proceed';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) {
      return;
    }

    setIsSubmitting(true);
    setErrors((prev) => {
      const copy = { ...prev };
      delete copy.general;
      return copy;
    });

    try {
      const res = await fetch('/api/auth/register/request-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: fullName.trim(),
          email: email.trim().toLowerCase(),
          country: selectedCountry,
          password,
          referralCode: referralCode.trim() || undefined,
        }),
      });

      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.message || result.error || 'Failed to request verification.');
      }

      if (result.code) {
        setOtp(result.code.split(''));
      }

      setStep('verify');
      setResendCountdown(60);
    } catch (err: any) {
      setErrors((prev) => ({ ...prev, general: err.message || 'An error occurred during registration.' }));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const enteredCode = otp.join('');
    if (enteredCode.length < 6) {
      setErrors((prev) => ({ ...prev, otp: 'Please enter the complete 6-digit code.' }));
      return;
    }

    setIsSubmitting(true);
    setErrors({});

    try {
      const res = await fetch('/api/auth/register/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          code: enteredCode,
        }),
      });

      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.message || result.error || 'Verification failed.');
      }

      await handleCompleteRegistration(result.token);
    } catch (err: any) {
      setErrors((prev) => ({ ...prev, otp: err.message || 'Verification failed.' }));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCompleteRegistration = async (token: string) => {
    try {
      const res = await fetch('/api/auth/register/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          token,
        }),
      });

      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.message || result.error || 'Failed to complete registration.');
      }

      // Sync to Firebase Auth & Firestore client-side
      try {
        const { auth, db } = await import('../lib/firebase');
        const { createUserWithEmailAndPassword, updateProfile } = await import('firebase/auth');
        const { doc, setDoc } = await import('firebase/firestore');

        const cred = await createUserWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
        if (cred.user) {
          await updateProfile(cred.user, { displayName: fullName.trim() });
          await setDoc(doc(db, 'users', cred.user.uid), {
            uid: cred.user.uid,
            id: result.user?.id || cred.user.uid,
            email: email.trim().toLowerCase(),
            fullName: fullName.trim(),
            country: selectedCountry,
            publicId: result.user?.publicId,
            referralCode: result.user?.referralCode,
            createdAt: new Date().toISOString(),
            status: 'ACTIVE',
          }, { merge: true });
        }
      } catch (fbErr: any) {
        console.warn('[RegisterPage] Firebase client sync note:', fbErr?.message || fbErr);
      }

      setUser(result.user);
      setRegistrationSuccess(true);
      setStep('success');
      setTimeout(() => {
        onNavigate('/app');
      }, 1500);
    } catch (err: any) {
      setErrors((prev) => ({ ...prev, otp: err.message || 'Failed to complete registration.' }));
    }
  };

  const handleResendCode = async () => {
    if (resendCountdown > 0) return;
    setIsSubmitting(true);
    setErrors({});
    setOtp(['', '', '', '', '', '']);

    try {
      const res = await fetch('/api/auth/register/request-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: fullName.trim(),
          email: email.trim().toLowerCase(),
          country: selectedCountry,
          password,
          referralCode: referralCode.trim() || undefined,
        }),
      });

      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.message || result.error || 'Failed to resend code.');
      }

      setResendCountdown(60);
    } catch (err: any) {
      setErrors((prev) => ({ ...prev, otp: err.message || 'Failed to resend code.' }));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#05070B] text-[#F7FAFC] flex flex-col justify-between selection:bg-[#00CFFF]/20 selection:text-[#00CFFF]">
      
      {/* Top Navigation Bar */}
      <header className="border-b border-white/[0.04] bg-[#07101D]/50 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <button
            onClick={() => onNavigate('/')}
            className="flex items-center gap-2 group focus:outline-none cursor-pointer"
            aria-label="Back to home"
          >
            <PhivonexLogo size="md" />
          </button>

          <div className="flex items-center gap-3 text-xs">
            <span className="hidden sm:inline text-[#98A2B3]">Already have an account?</span>
            <button
              onClick={() => onNavigate('/login')}
              className="px-3.5 py-1.5 rounded-lg bg-[#07101D] hover:bg-white/[0.04] border border-[#00CFFF]/30 hover:border-[#00CFFF]/50 text-[#00CFFF] font-medium transition-all cursor-pointer min-h-[36px]"
            >
              Sign In
            </button>
          </div>
        </div>
      </header>

      {/* Main Centered Container */}
      <main className="flex-1 flex items-center justify-center py-6 sm:py-8 px-4 sm:px-6 lg:px-8">
        <div className="w-full max-w-[500px] space-y-6">
          <div className="bg-[#07101D]/90 border border-white/[0.08] rounded-2xl shadow-2xl p-6 sm:p-8 backdrop-blur-xl">
            
            {step === 'form' && (
              <>
                {/* Form Header */}
                <div className="mb-6 text-center">
                  <h1 className="text-2xl sm:text-3xl font-extrabold text-[#F7FAFC] tracking-tight font-sans">
                    Create Your PHIVONEX Account
                  </h1>
                  <p className="text-xs sm:text-sm text-[#98A2B3] mt-2 font-normal">
                    Create your account to access the PHIVONEX ecosystem.
                  </p>
                </div>

                {/* General Error Notification */}
                {errors.general && (
                  <div className="mb-5 p-3.5 rounded-xl bg-[#F04438]/10 border border-[#F04438]/30 flex items-start gap-2.5 text-xs text-[#F04438] animate-fadeIn">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span className="leading-relaxed">{errors.general}</span>
                  </div>
                )}

                {/* REGISTRATION FORM */}
                <form onSubmit={handleSubmit} noValidate className="space-y-4 text-left">
                  
                  {/* 1. Full Name */}
                  <div>
                    <label className="block text-xs font-medium text-[#98A2B3] mb-1.5">
                      Full Name <span className="text-[#F04438]">*</span>
                    </label>
                    <input
                      type="text"
                      name="fullName"
                      autoComplete="name"
                      placeholder="e.g. David Vance"
                      value={fullName}
                      onChange={(e) => {
                        setFullName(e.target.value);
                        if (errors.fullName) setErrors((prev) => ({ ...prev, fullName: '' }));
                      }}
                      className={`w-full bg-[#05070B] border ${
                        errors.fullName ? 'border-[#F04438]' : 'border-white/[0.1] focus:border-[#00CFFF]'
                      } rounded-lg px-3.5 py-2.5 text-xs text-white placeholder:text-white/20 focus:outline-none transition-colors min-h-[44px]`}
                    />
                    {errors.fullName && (
                      <span className="text-[11px] text-[#F04438] mt-1 block flex items-center gap-1">
                        <AlertCircle className="w-3 h-3 shrink-0" /> {errors.fullName}
                      </span>
                    )}
                  </div>

                  {/* 2. Email Address */}
                  <div>
                    <label className="block text-xs font-medium text-[#98A2B3] mb-1.5">
                      Email Address <span className="text-[#F04438]">*</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-white/30">
                        <Mail className="w-3.5 h-3.5" />
                      </div>
                      <input
                        type="email"
                        name="email"
                        autoComplete="email"
                        placeholder="operator@phivonex.com"
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          if (errors.email) setErrors((prev) => ({ ...prev, email: '' }));
                        }}
                        className={`w-full bg-[#05070B] border ${
                          errors.email ? 'border-[#F04438]' : 'border-white/[0.1] focus:border-[#00CFFF]'
                        } rounded-lg pl-9 pr-3.5 py-2.5 text-xs text-white placeholder:text-white/20 focus:outline-none transition-colors min-h-[44px]`}
                      />
                    </div>
                    {errors.email && (
                      <span className="text-[11px] text-[#F04438] mt-1 block flex items-center gap-1">
                        <AlertCircle className="w-3 h-3 shrink-0" /> {errors.email}
                      </span>
                    )}
                  </div>

                  {/* 3. Country */}
                  <div>
                    <label className="block text-xs font-medium text-[#98A2B3] mb-1.5">
                      Country <span className="text-[#F04438]">*</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-white/30">
                        <Globe className="w-3.5 h-3.5" />
                      </div>
                      <select
                        value={selectedCountry}
                        onChange={(e) => {
                          setSelectedCountry(e.target.value);
                          if (errors.country) setErrors((prev) => ({ ...prev, country: '' }));
                        }}
                        className="w-full bg-[#05070B] border border-white/[0.1] focus:border-[#00CFFF] rounded-lg pl-9 pr-8 py-2.5 text-xs text-white focus:outline-none transition-colors appearance-none cursor-pointer min-h-[44px]"
                      >
                        <option value="" className="bg-[#07101D] text-slate-500">Select Country</option>
                        {COUNTRIES.map((country) => (
                          <option key={country.code} value={country.name} className="bg-[#07101D] text-white">
                            {country.flag} {country.name}
                          </option>
                        ))}
                      </select>
                      <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-white/40 text-[10px]">
                        ▼
                      </div>
                    </div>
                    {errors.country && (
                      <span className="text-[11px] text-[#F04438] mt-1 block flex items-center gap-1">
                        <AlertCircle className="w-3 h-3 shrink-0" /> {errors.country}
                      </span>
                    )}
                  </div>

                  {/* 4. Referral Code Field with Real-time Backend Resolution */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-medium text-[#98A2B3]">
                        Referral Code <span className="text-white/40 text-[10px]">(Optional)</span>
                      </label>
                      {isCheckingReferral && (
                        <span className="text-[11px] text-[#00CFFF] flex items-center gap-1 font-mono">
                          <Loader2 className="w-3 h-3 animate-spin" /> Resolving...
                        </span>
                      )}
                    </div>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-white/30">
                        <Tag className="w-3.5 h-3.5" />
                      </div>
                      <input
                        type="text"
                        placeholder="e.g. PHX8F2K91"
                        value={referralCode}
                        onChange={(e) => {
                          setReferralCode(e.target.value.toUpperCase());
                        }}
                        className={`w-full bg-[#05070B] border ${
                          errors.referralCode
                            ? 'border-[#F04438]'
                            : sponsorData?.valid
                            ? 'border-[#32D583]'
                            : 'border-white/[0.1] focus:border-[#00CFFF]'
                        } rounded-lg pl-9 pr-3.5 py-2.5 text-xs font-mono text-white placeholder:text-white/20 focus:outline-none transition-colors uppercase min-h-[44px]`}
                      />
                    </div>

                    {/* Valid Sponsor Display */}
                    {sponsorData?.valid && sponsorData.sponsor && (
                      <div className="mt-2 p-2.5 rounded-lg bg-[#32D583]/[0.08] border border-[#32D583]/30 flex items-center justify-between text-xs animate-fadeIn">
                        <div className="flex items-center gap-2">
                          <UserCheck className="w-4 h-4 text-[#32D583]" />
                          <span className="text-white">
                            Referred by: <strong className="text-[#32D583]">{sponsorData.sponsor.displayName}</strong>
                          </span>
                        </div>
                        <span className="text-[10px] font-mono text-[#98A2B3] bg-white/[0.06] px-2 py-0.5 rounded">
                          {sponsorData.sponsor.publicId}
                        </span>
                      </div>
                    )}

                    {/* Invalid Referral Code Error */}
                    {errors.referralCode && (
                      <span className="text-[11px] text-[#F04438] mt-1 block flex items-center gap-1 animate-fadeIn">
                        <AlertCircle className="w-3 h-3 shrink-0" /> {errors.referralCode}
                      </span>
                    )}
                  </div>

                  {/* 5. Password & Confirm Password */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Password */}
                    <div>
                      <label className="block text-xs font-medium text-[#98A2B3] mb-1.5">
                        Password <span className="text-[#F04438]">*</span>
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-white/30">
                          <Lock className="w-3.5 h-3.5" />
                        </div>
                        <input
                          type={showPassword ? 'text' : 'password'}
                          placeholder="••••••••••"
                          value={password}
                          onChange={(e) => {
                            setPassword(e.target.value);
                            if (errors.password) setErrors((prev) => ({ ...prev, password: '' }));
                          }}
                          className={`w-full bg-[#05070B] border ${
                            errors.password ? 'border-[#F04438]' : 'border-white/[0.1] focus:border-[#00CFFF]'
                          } rounded-lg pl-9 pr-9 py-2.5 text-xs text-white placeholder:text-white/20 focus:outline-none transition-colors min-h-[44px]`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute inset-y-0 right-0 pr-3 flex items-center text-white/40 hover:text-white transition-colors cursor-pointer"
                          aria-label="Toggle password visibility"
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      {errors.password && (
                        <span className="text-[11px] text-[#F04438] mt-1 block flex items-center gap-1">
                          <AlertCircle className="w-3 h-3 shrink-0" /> {errors.password}
                        </span>
                      )}
                    </div>

                    {/* Confirm Password */}
                    <div>
                      <label className="block text-xs font-medium text-[#98A2B3] mb-1.5">
                        Confirm Password <span className="text-[#F04438]">*</span>
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-white/30">
                          <Lock className="w-3.5 h-3.5" />
                        </div>
                        <input
                          type={showConfirmPassword ? 'text' : 'password'}
                          placeholder="••••••••••"
                          value={confirmPassword}
                          onChange={(e) => {
                            setConfirmPassword(e.target.value);
                            if (errors.confirmPassword) setErrors((prev) => ({ ...prev, confirmPassword: '' }));
                          }}
                          className={`w-full bg-[#05070B] border ${
                            errors.confirmPassword ? 'border-[#F04438]' : 'border-white/[0.1] focus:border-[#00CFFF]'
                          } rounded-lg pl-9 pr-9 py-2.5 text-xs text-white placeholder:text-white/20 focus:outline-none transition-colors min-h-[44px]`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className="absolute inset-y-0 right-0 pr-3 flex items-center text-white/40 hover:text-white transition-colors cursor-pointer"
                          aria-label="Toggle confirm password visibility"
                        >
                          {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      {errors.confirmPassword && (
                        <span className="text-[11px] text-[#F04438] mt-1 block flex items-center gap-1">
                          <AlertCircle className="w-3 h-3 shrink-0" /> {errors.confirmPassword}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Password Strength Guidance - Modern requirements shown when user is typing */}
                  {password.length > 0 && (
                    <div className="p-3.5 rounded-xl bg-[#05070B] border border-white/[0.06] space-y-2 text-[11px]">
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="text-[#98A2B3]">Password Strength:</span>
                        <span
                          className={
                            passwordStrengthScore >= 4
                              ? 'text-[#32D583] font-bold'
                              : passwordStrengthScore >= 2
                              ? 'text-[#00CFFF]'
                              : 'text-[#F04438]'
                          }
                        >
                          {passwordStrengthScore >= 4 ? 'Strong' : passwordStrengthScore >= 2 ? 'Fair' : 'Weak'}
                        </span>
                      </div>

                      <div className="w-full h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            passwordStrengthScore >= 4
                              ? 'bg-[#32D583]'
                              : passwordStrengthScore >= 2
                              ? 'bg-[#00CFFF]'
                              : 'bg-[#F04438]'
                          }`}
                          style={{ width: `${(passwordStrengthScore / 4) * 100}%` }}
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-1.5 text-[10px] text-[#98A2B3] pt-1">
                        <div className="flex items-center gap-1.5">
                          {passwordCriteria.length ? <Check className="w-3 h-3 text-[#32D583]" /> : <X className="w-3 h-3 text-white/30" />}
                          <span>10+ Characters</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {passwordCriteria.uppercase ? <Check className="w-3 h-3 text-[#32D583]" /> : <X className="w-3 h-3 text-white/30" />}
                          <span>Case Variety (A-z)</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {passwordCriteria.number ? <Check className="w-3 h-3 text-[#32D583]" /> : <X className="w-3 h-3 text-white/30" />}
                          <span>Number (0-9)</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {passwordCriteria.special ? <Check className="w-3 h-3 text-[#32D583]" /> : <X className="w-3 h-3 text-white/30" />}
                          <span>Recommended Symbol</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 6. Terms & Privacy Checkbox */}
                  <div className="pt-2">
                    <label className="flex items-start gap-2.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={agreeTerms}
                        onChange={(e) => {
                          setAgreeTerms(e.target.checked);
                          if (errors.agreeTerms) setErrors((prev) => ({ ...prev, agreeTerms: '' }));
                        }}
                        className="mt-0.5 w-4 h-4 rounded border-white/20 bg-[#05070B] text-[#00CFFF] focus:ring-0 focus:ring-offset-0 cursor-pointer"
                      />
                      <span className="text-xs text-[#98A2B3] leading-snug">
                        I agree to the{' '}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            onOpenLegalModal?.('Terms of Service');
                          }}
                          className="text-[#00CFFF] hover:underline cursor-pointer"
                        >
                          Terms of Service
                        </button>{' '}
                        and acknowledge the{' '}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            onOpenLegalModal?.('Privacy Policy');
                          }}
                          className="text-[#00CFFF] hover:underline cursor-pointer"
                        >
                          Privacy Policy
                        </button>
                        . <span className="text-[#F04438]">*</span>
                      </span>
                    </label>
                    {errors.agreeTerms && (
                      <span className="text-[11px] text-[#F04438] mt-1 block flex items-center gap-1">
                        <AlertCircle className="w-3 h-3 shrink-0" /> {errors.agreeTerms}
                      </span>
                    )}
                  </div>



                  {/* 7. Primary Action Button */}
                  <div className="pt-3">
                    <button
                      type="submit"
                      disabled={isSubmitting || isCheckingReferral || Boolean(referralCode.trim() && sponsorData && !sponsorData.valid)}
                      className="w-full py-3.5 px-4 rounded-lg bg-gradient-to-r from-[#00CFFF] to-[#168BFF] text-[#05070B] font-semibold text-xs flex items-center justify-center gap-2 hover:brightness-110 active:scale-[0.99] disabled:opacity-50 transition-all cursor-pointer shadow-lg shadow-[#00CFFF]/20 min-h-[44px]"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Creating Account...</span>
                        </>
                      ) : (
                        <>
                          <span>Create Account</span>
                          <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </button>
                  </div>

                  {/* Google Sign In Option */}
                  <div className="pt-2">
                    <div className="relative flex py-2 items-center">
                      <div className="flex-grow border-t border-white/[0.08]"></div>
                      <span className="flex-shrink mx-3 text-[11px] text-[#98A2B3]">OR</span>
                      <div className="flex-grow border-t border-white/[0.08]"></div>
                    </div>

                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          setIsSubmitting(true);
                          await loginWithGoogle(referralCode.trim() || undefined);
                          onNavigate('/app');
                        } catch (err: any) {
                          setErrors((prev) => ({ ...prev, general: err.message || 'Google sign-in failed' }));
                        } finally {
                          setIsSubmitting(false);
                        }
                      }}
                      disabled={isSubmitting}
                      className="w-full py-3 px-4 rounded-lg bg-white/[0.06] border border-white/[0.1] text-white hover:bg-white/[0.1] active:scale-[0.99] font-medium text-xs flex items-center justify-center gap-2.5 transition-all cursor-pointer min-h-[44px]"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                      </svg>
                      <span>Continue with Google</span>
                    </button>
                  </div>

                </form>

                {/* Bottom Nav to Sign In */}
                <div className="mt-6 pt-6 border-t border-white/[0.08] text-center">
                  <p className="text-xs text-[#98A2B3]">
                    Already have an account?{' '}
                    <button
                      onClick={() => onNavigate('/login')}
                      className="text-[#00CFFF] font-semibold hover:underline cursor-pointer ml-1"
                    >
                      Sign In
                    </button>
                  </p>
                </div>
              </>
            )}

            {step === 'verify' && (
              <>
                {/* Verification Header */}
                <div className="mb-6 text-center">
                  <h1 className="text-2xl sm:text-3xl font-extrabold text-[#F7FAFC] tracking-tight font-sans">
                    Verify your email
                  </h1>
                  <p className="text-xs sm:text-sm text-[#98A2B3] mt-3 leading-relaxed">
                    We sent a verification code to:<br />
                    <strong className="text-white font-mono text-xs">{maskEmail(email)}</strong>
                  </p>
                </div>

                {/* Verification Form */}
                <form onSubmit={handleVerifyOtp} className="space-y-6 text-left">
                  <div className="flex justify-between items-center gap-2 max-w-xs mx-auto py-2">
                    {[0, 1, 2, 3, 4, 5].map((index) => (
                      <input
                        key={index}
                        type="text"
                        maxLength={1}
                        ref={(el) => { otpInputsRef.current[index] = el; }}
                        value={otp[index]}
                        onChange={(e) => handleOtpChange(e.target.value, index)}
                        onKeyDown={(e) => handleOtpKeyDown(e, index)}
                        className="w-10 sm:w-12 h-14 bg-[#05070B] border border-white/[0.1] focus:border-[#00CFFF] rounded-lg text-center text-lg sm:text-xl font-extrabold font-mono text-white focus:outline-none focus:ring-1 focus:ring-[#00CFFF]/30 transition-all select-all min-h-[44px]"
                      />
                    ))}
                  </div>

                  {errors.otp && (
                    <div className="p-3 rounded-xl bg-[#F04438]/10 border border-[#F04438]/30 text-xs text-[#F04438] flex items-center gap-2 animate-fadeIn justify-center">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{errors.otp}</span>
                    </div>
                  )}

                  <div className="space-y-4">
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full py-3.5 px-4 rounded-lg bg-gradient-to-r from-[#00CFFF] to-[#168BFF] text-[#05070B] font-semibold text-xs flex items-center justify-center gap-2 hover:brightness-110 active:scale-[0.99] disabled:opacity-50 transition-all cursor-pointer shadow-lg shadow-[#00CFFF]/20 min-h-[44px]"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Completing Registration...</span>
                        </>
                      ) : (
                        <>
                          <span>Verify Email</span>
                          <CheckCircle2 className="w-4 h-4" />
                        </>
                      )}
                    </button>

                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs text-[#98A2B3] pt-4 border-t border-white/[0.08] mt-4">
                      <button
                        type="button"
                        onClick={handleResendCode}
                        disabled={resendCountdown > 0 || isSubmitting}
                        className="text-[#00CFFF] font-semibold hover:underline disabled:opacity-40 disabled:hover:no-underline cursor-pointer flex items-center gap-1.5"
                      >
                        {resendCountdown > 0 ? (
                          <span>Resend Code ({resendCountdown}s)</span>
                        ) : (
                          <span>Resend Code</span>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setStep('form');
                          setOtp(['', '', '', '', '', '']);
                          setErrors({});
                        }}
                        className="hover:text-white transition-colors cursor-pointer text-left font-semibold"
                      >
                        Change Email
                      </button>
                    </div>

                    <div className="text-center pt-2">
                      <button
                        type="button"
                        onClick={() => onNavigate('/login')}
                        className="text-xs text-slate-500 hover:text-slate-300 font-medium transition-colors"
                      >
                        Back to Login
                      </button>
                    </div>
                  </div>
                </form>
              </>
            )}

            {step === 'success' && (
              <div className="py-12 text-center space-y-6 animate-fadeIn">
                <div className="w-16 h-16 rounded-full bg-[#32D583]/10 border border-[#32D583]/20 text-[#32D583] flex items-center justify-center mx-auto shadow-[0_0_20px_rgba(50,213,131,0.15)]">
                  <CheckCircle2 className="w-10 h-10" />
                </div>
                
                <div className="space-y-2">
                  <h2 className="text-2xl font-extrabold text-white tracking-tight">Account Created!</h2>
                  <p className="text-sm text-slate-400 max-w-sm mx-auto leading-relaxed">
                    Welcome to PHIVONEX, <strong className="text-white">{fullName}</strong>. Your email has been verified and your secure operator session is initializing.
                  </p>
                </div>

                <div className="flex justify-center pt-2">
                  <Loader2 className="w-6 h-6 animate-spin text-[#00CFFF]" />
                </div>
              </div>
            )}

          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-4 border-t border-white/[0.06] text-center text-[11px] text-[#98A2B3] font-mono">
        © 2026 PHIVONEX. All rights reserved.
      </footer>
    </div>
  );
};
