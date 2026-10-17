import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Camera,
  Upload,
  CheckCircle2,
  AlertTriangle,
  X,
  FileText,
  User,
  MapPin,
  Calendar,
  Sparkles,
  Loader2,
  RefreshCw,
  Eye,
  Check,
  ChevronRight,
  ChevronLeft,
  ArrowRight,
  Clock,
  ExternalLink,
  Shield
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';

interface BinanceKYCModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const BinanceKYCModal: React.FC<BinanceKYCModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { user, refreshUser } = useAuth();

  // Current wizard step: 1 (Personal Info), 2 (Doc Type), 3 (Photos), 4 (Live Selfie), 5 (Review/Submit)
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [kycRecord, setKycRecord] = useState<any | null>(null);
  const [loadingStatus, setLoadingStatus] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form Fields
  const [fullLegalName, setFullLegalName] = useState<string>(user?.fullName || '');
  const [dob, setDob] = useState<string>('1995-05-15');
  const [country, setCountry] = useState<string>(user?.country || 'Bangladesh');
  const [residentialAddress, setResidentialAddress] = useState<string>('');
  const [city, setCity] = useState<string>('');
  const [postalCode, setPostalCode] = useState<string>('');
  const [documentType, setDocumentType] = useState<'NATIONAL_ID' | 'PASSPORT' | 'DRIVERS_LICENSE'>('NATIONAL_ID');
  const [documentNumber, setDocumentNumber] = useState<string>('');
  const [documentFrontUrl, setDocumentFrontUrl] = useState<string>('');
  const [documentBackUrl, setDocumentBackUrl] = useState<string>('');
  const [selfiePhotoUrl, setSelfiePhotoUrl] = useState<string>('');

  // Camera / Webcam State
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Fetch latest KYC status from backend
  const fetchStatus = useCallback(async () => {
    try {
      setLoadingStatus(true);
      const res = await fetch('/api/kyc/me', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        if (data.submission) {
          setKycRecord(data.submission);
        }
      }
    } catch (err) {
      console.warn('[BinanceKYCModal] Error fetching status:', err);
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchStatus();
    }
  }, [isOpen, fetchStatus]);

  // Real-time Firestore onSnapshot for sub-second synchronization
  useEffect(() => {
    if (!isOpen || !user?.id) return;

    let unsub: (() => void) | undefined;
    try {
      unsub = onSnapshot(doc(db, 'kyc_verifications', user.id), (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setKycRecord((prev: any) => ({ ...(prev || {}), ...data }));
          refreshUser();
        }
      });
    } catch {
      // fallback
    }

    return () => {
      if (unsub) unsub();
    };
  }, [isOpen, user?.id, refreshUser]);

  // Stop camera on unmount or close
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
    }
  }, [isOpen, stopCamera]);

  // Start webcam for live facial verification
  const startCamera = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setIsCameraActive(true);
    } catch (err: any) {
      console.warn('Camera access unavailable:', err);
      setCameraError('Webcam access was denied or is unavailable. You can upload a high-resolution selfie directly.');
      setIsCameraActive(false);
    }
  };

  // Capture photo from video feed
  const capturePhoto = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth || 640;
    canvas.height = videoRef.current.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Mirror image horizontally for natural selfie view
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      setSelfiePhotoUrl(dataUrl);
      stopCamera();
    }
  };

  // Handle generic file drop / upload to base64
  const handleFileUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: (val: string) => void
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select an image file (JPG, PNG, WebP).');
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      alert('File size exceeds 8MB. Please select a smaller photo.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setter(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  // Submit KYC to API
  const handleSubmitKYC = async () => {
    setErrorMsg(null);
    setSubmitting(true);

    try {
      const res = await fetch('/api/kyc/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          fullLegalName,
          dob,
          country,
          residentialAddress,
          city,
          postalCode,
          documentType,
          documentNumber,
          documentFrontUrl,
          documentBackUrl: documentType === 'PASSPORT' ? undefined : documentBackUrl,
          selfiePhotoUrl,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Verification submission failed.');
      }

      setKycRecord(data.submission);
      window.dispatchEvent(new CustomEvent('phivonex:kyc-updated', { detail: { status: 'PENDING' } }));
      await refreshUser();
      if (onSuccess) onSuccess();
    } catch (err: any) {
      setErrorMsg(err.message || 'Submission error. Please check your data and retry.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const currentKycStatus = (user?.kycStatus || kycRecord?.status || 'UNVERIFIED').toUpperCase();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-2xl max-h-[92vh] flex flex-col rounded-3xl bg-[#07101E] border border-cyan-500/20 shadow-2xl shadow-cyan-950/50 overflow-hidden">
        
        {/* Top Header Bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.08] bg-gradient-to-r from-[#0A162B] via-[#07101E] to-[#0A162B]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-cyan-500/20 to-blue-500/20 border border-cyan-400/30 flex items-center justify-center text-cyan-300 shadow-inner">
              <ShieldCheck className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold text-white tracking-wide font-mono">
                  Binance-Grade Identity Verification
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  LEVEL 1
                </span>
              </div>
              <p className="text-[11px] text-[#98A2B3]">
                Full regulatory compliance • Unlocks $100,000/day withdrawal &amp; node rewards
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-[#98A2B3] hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body Container */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {/* STATUS DISPLAY BANNER (If already Submitted or Verified) */}
          {currentKycStatus === 'VERIFIED' ? (
            <div className="p-6 rounded-2xl bg-gradient-to-br from-emerald-950/40 via-[#0A1628] to-cyan-950/40 border border-emerald-500/30 text-center space-y-4">
              <div className="w-16 h-16 mx-auto rounded-3xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-400 shadow-lg shadow-emerald-500/20">
                <CheckCircle2 className="w-9 h-9" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-white flex items-center justify-center gap-2">
                  <span>Level 1 Verification Active</span>
                  <Sparkles className="w-4 h-4 text-emerald-400" />
                </h3>
                <p className="text-xs text-[#98A2B3] max-w-md mx-auto">
                  Your identity has been authenticated according to international financial compliance standards. All system limits and validator node privileges are operational.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 max-w-sm mx-auto text-left pt-2 font-mono text-xs">
                <div className="p-3 rounded-xl bg-black/40 border border-white/[0.06]">
                  <span className="text-[10px] text-slate-400 uppercase block">Daily Limit</span>
                  <span className="text-sm font-bold text-emerald-300">100,000 USDT</span>
                </div>
                <div className="p-3 rounded-xl bg-black/40 border border-white/[0.06]">
                  <span className="text-[10px] text-slate-400 uppercase block">Node Staking</span>
                  <span className="text-sm font-bold text-cyan-300">UNRESTRICTED</span>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs transition-all shadow-lg shadow-emerald-500/20 cursor-pointer"
                >
                  Close &amp; Return to Dashboard
                </button>
              </div>
            </div>
          ) : currentKycStatus === 'PENDING' ? (
            <div className="p-6 rounded-2xl bg-gradient-to-br from-amber-950/40 via-[#0A1628] to-slate-900 border border-amber-500/30 text-center space-y-4">
              <div className="w-16 h-16 mx-auto rounded-3xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-400 shadow-lg shadow-amber-500/20 animate-pulse">
                <Clock className="w-9 h-9" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-white flex items-center justify-center gap-2">
                  <span>Verification Under Security Review</span>
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping" />
                </h3>
                <p className="text-xs text-[#98A2B3] max-w-md mx-auto">
                  Your identity documents and live biometric selfie were submitted successfully. Verification usually takes between 2 to 10 minutes. This screen updates in real time.
                </p>
              </div>

              {/* Real-time status tracker */}
              <div className="p-4 rounded-xl bg-black/50 border border-white/[0.06] text-left space-y-3 font-mono text-xs max-w-md mx-auto">
                <div className="flex items-center justify-between text-slate-300">
                  <span className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>Personal Info Submitted</span>
                  </span>
                  <span className="text-emerald-400 text-[10px]">VERIFIED</span>
                </div>
                <div className="flex items-center justify-between text-slate-300">
                  <span className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>Identity Document Upload</span>
                  </span>
                  <span className="text-emerald-400 text-[10px]">RECEIVED</span>
                </div>
                <div className="flex items-center justify-between text-slate-300">
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />
                    <span>Admin Forensic Review</span>
                  </span>
                  <span className="text-amber-400 text-[10px] animate-pulse">IN PROGRESS</span>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={fetchStatus}
                  className="px-4 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Check Live Status</span>
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs transition-all cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* If previously rejected, show warning banner */}
              {currentKycStatus === 'REJECTED' && (
                <div className="p-4 rounded-2xl bg-rose-950/40 border border-rose-500/40 text-left space-y-2">
                  <div className="flex items-center gap-2 text-rose-300 font-bold text-xs uppercase tracking-wider font-mono">
                    <ShieldAlert className="w-4 h-4 text-rose-400" />
                    <span>Previous Verification Unsuccessful</span>
                  </div>
                  <p className="text-xs text-rose-200">
                    Reason from security reviewer:{' '}
                    <span className="font-semibold text-white">
                      "{user?.kycRejectReason || kycRecord?.rejection_reason || 'Photo resolution unreadable or document expired'}"
                    </span>
                  </p>
                  <p className="text-[11px] text-[#98A2B3]">
                    Please update your information below and submit sharp, glare-free photos to complete verification.
                  </p>
                </div>
              )}

              {/* STEP PROGRESS INDICATOR */}
              <div className="flex items-center justify-between px-2 pt-1 font-mono text-[11px]">
                {[
                  { step: 1, label: 'Personal' },
                  { step: 2, label: 'Document' },
                  { step: 3, label: 'Photos' },
                  { step: 4, label: 'Liveness' },
                  { step: 5, label: 'Review' },
                ].map((s) => {
                  const isActive = currentStep === s.step;
                  const isDone = currentStep > s.step;
                  return (
                    <div key={s.step} className="flex flex-col items-center gap-1.5 flex-1">
                      <div className="flex items-center w-full">
                        <div
                          className={`w-7 h-7 mx-auto rounded-full flex items-center justify-center font-bold text-xs transition-all ${
                            isActive
                              ? 'bg-cyan-500 text-black shadow-lg shadow-cyan-500/40 ring-2 ring-cyan-400'
                              : isDone
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                              : 'bg-white/[0.04] text-[#98A2B3] border border-white/[0.08]'
                          }`}
                        >
                          {isDone ? <Check className="w-3.5 h-3.5" /> : s.step}
                        </div>
                      </div>
                      <span
                        className={`text-[10px] tracking-wider uppercase ${
                          isActive ? 'text-cyan-300 font-bold' : isDone ? 'text-emerald-400' : 'text-[#667085]'
                        }`}
                      >
                        {s.label}
                      </span>
                    </div>
                  );
                })}
              </div>

              {errorMsg && (
                <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* STEP 1: PERSONAL INFORMATION */}
              {currentStep === 1 && (
                <div className="space-y-4 animate-fadeIn">
                  <div className="border-b border-white/[0.06] pb-2">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <User className="w-4 h-4 text-cyan-400" />
                      <span>Legal Identity Information</span>
                    </h3>
                    <p className="text-[11px] text-[#98A2B3] mt-0.5">
                      Ensure your legal name exactly matches the name on your government-issued document.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1 sm:col-span-2">
                      <label className="text-xs font-mono text-[#D0D5DD]">Legal Full Name (First, Middle, Last) *</label>
                      <input
                        type="text"
                        value={fullLegalName}
                        onChange={(e) => setFullLegalName(e.target.value)}
                        placeholder="e.g. Asifuzzaman Chowdhury"
                        className="w-full px-3.5 py-2.5 rounded-xl bg-[#05070B] border border-white/[0.1] text-white text-xs font-mono focus:outline-none focus:border-cyan-400 transition-colors"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-mono text-[#D0D5DD]">Date of Birth *</label>
                      <input
                        type="date"
                        value={dob}
                        onChange={(e) => setDob(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-[#05070B] border border-white/[0.1] text-white text-xs font-mono focus:outline-none focus:border-cyan-400 transition-colors"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-mono text-[#D0D5DD]">Country / Nationality *</label>
                      <input
                        type="text"
                        value={country}
                        onChange={(e) => setCountry(e.target.value)}
                        placeholder="e.g. Bangladesh"
                        className="w-full px-3.5 py-2.5 rounded-xl bg-[#05070B] border border-white/[0.1] text-white text-xs font-mono focus:outline-none focus:border-cyan-400 transition-colors"
                      />
                    </div>

                    <div className="space-y-1 sm:col-span-2">
                      <label className="text-xs font-mono text-[#D0D5DD]">Residential Street Address *</label>
                      <input
                        type="text"
                        value={residentialAddress}
                        onChange={(e) => setResidentialAddress(e.target.value)}
                        placeholder="e.g. House 42, Road 11, Banani"
                        className="w-full px-3.5 py-2.5 rounded-xl bg-[#05070B] border border-white/[0.1] text-white text-xs font-mono focus:outline-none focus:border-cyan-400 transition-colors"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-mono text-[#D0D5DD]">City *</label>
                      <input
                        type="text"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        placeholder="e.g. Dhaka"
                        className="w-full px-3.5 py-2.5 rounded-xl bg-[#05070B] border border-white/[0.1] text-white text-xs font-mono focus:outline-none focus:border-cyan-400 transition-colors"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-mono text-[#D0D5DD]">Postal / Zip Code</label>
                      <input
                        type="text"
                        value={postalCode}
                        onChange={(e) => setPostalCode(e.target.value)}
                        placeholder="e.g. 1213"
                        className="w-full px-3.5 py-2.5 rounded-xl bg-[#05070B] border border-white/[0.1] text-white text-xs font-mono focus:outline-none focus:border-cyan-400 transition-colors"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 2: DOCUMENT SELECTION */}
              {currentStep === 2 && (
                <div className="space-y-4 animate-fadeIn">
                  <div className="border-b border-white/[0.06] pb-2">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <FileText className="w-4 h-4 text-cyan-400" />
                      <span>Select Government Document</span>
                    </h3>
                    <p className="text-[11px] text-[#98A2B3] mt-0.5">
                      Choose an active, non-expired document type issued by your country.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {[
                      {
                        type: 'NATIONAL_ID',
                        title: 'National ID / Smart Card',
                        desc: 'Front and back side required',
                        icon: Shield,
                      },
                      {
                        type: 'PASSPORT',
                        title: 'Passport',
                        desc: 'Full information page',
                        icon: FileText,
                      },
                      {
                        type: 'DRIVERS_LICENSE',
                        title: "Driver's License",
                        desc: 'Front and back side required',
                        icon: User,
                      },
                    ].map((d) => {
                      const isSelected = documentType === d.type;
                      const Icon = d.icon;
                      return (
                        <button
                          key={d.type}
                          type="button"
                          onClick={() => setDocumentType(d.type as any)}
                          className={`p-4 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between space-y-3 ${
                            isSelected
                              ? 'bg-cyan-500/10 border-cyan-400/60 shadow-lg shadow-cyan-500/10'
                              : 'bg-white/[0.02] border-white/[0.08] hover:bg-white/[0.04]'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div
                              className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                                isSelected ? 'bg-cyan-400 text-black' : 'bg-white/[0.06] text-[#98A2B3]'
                              }`}
                            >
                              <Icon className="w-4 h-4" />
                            </div>
                            {isSelected && <CheckCircle2 className="w-4 h-4 text-cyan-400" />}
                          </div>
                          <div>
                            <div className={`text-xs font-bold ${isSelected ? 'text-white' : 'text-[#D0D5DD]'}`}>
                              {d.title}
                            </div>
                            <div className="text-[10px] text-[#98A2B3] mt-0.5">{d.desc}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <div className="space-y-1 pt-2">
                    <label className="text-xs font-mono text-[#D0D5DD]">
                      Document Number (ID Number / Passport No.) *
                    </label>
                    <input
                      type="text"
                      value={documentNumber}
                      onChange={(e) => setDocumentNumber(e.target.value)}
                      placeholder="e.g. 1995269123456789 or A01234567"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#05070B] border border-white/[0.1] text-white text-xs font-mono focus:outline-none focus:border-cyan-400 transition-colors"
                    />
                  </div>
                </div>
              )}

              {/* STEP 3: DOCUMENT PHOTOS UPLOAD */}
              {currentStep === 3 && (
                <div className="space-y-4 animate-fadeIn">
                  <div className="border-b border-white/[0.06] pb-2">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Upload className="w-4 h-4 text-cyan-400" />
                      <span>Document Photos</span>
                    </h3>
                    <p className="text-[11px] text-[#98A2B3] mt-0.5">
                      Ensure all four corners are visible, text is crisp, and there is no glare.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Front Document */}
                    <div className="space-y-2">
                      <span className="text-xs font-mono text-[#D0D5DD] flex items-center justify-between">
                        <span>Front Side Photo *</span>
                        {documentFrontUrl && <span className="text-emerald-400 text-[10px]">Photo Loaded</span>}
                      </span>

                      {documentFrontUrl ? (
                        <div className="relative rounded-2xl border border-cyan-500/40 bg-black overflow-hidden group">
                          <img
                            src={documentFrontUrl}
                            alt="Document Front"
                            className="w-full h-40 object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => setDocumentFrontUrl('')}
                            className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/70 hover:bg-rose-600 text-white transition-colors cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <label className="flex flex-col items-center justify-center h-40 rounded-2xl border-2 border-dashed border-white/[0.12] hover:border-cyan-400/50 bg-white/[0.02] hover:bg-cyan-500/[0.03] transition-all cursor-pointer p-4 text-center group">
                          <Upload className="w-8 h-8 text-[#98A2B3] group-hover:text-cyan-400 transition-colors mb-2" />
                          <span className="text-xs font-semibold text-white">Upload Front Photo</span>
                          <span className="text-[10px] text-[#98A2B3] mt-1">PNG, JPG, or WebP up to 8MB</span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => handleFileUpload(e, setDocumentFrontUrl)}
                            className="hidden"
                          />
                        </label>
                      )}
                    </div>

                    {/* Back Document (Optional if Passport) */}
                    {documentType !== 'PASSPORT' && (
                      <div className="space-y-2">
                        <span className="text-xs font-mono text-[#D0D5DD] flex items-center justify-between">
                          <span>Back Side Photo *</span>
                          {documentBackUrl && <span className="text-emerald-400 text-[10px]">Photo Loaded</span>}
                        </span>

                        {documentBackUrl ? (
                          <div className="relative rounded-2xl border border-cyan-500/40 bg-black overflow-hidden group">
                            <img
                              src={documentBackUrl}
                              alt="Document Back"
                              className="w-full h-40 object-cover"
                            />
                            <button
                              type="button"
                              onClick={() => setDocumentBackUrl('')}
                              className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/70 hover:bg-rose-600 text-white transition-colors cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <label className="flex flex-col items-center justify-center h-40 rounded-2xl border-2 border-dashed border-white/[0.12] hover:border-cyan-400/50 bg-white/[0.02] hover:bg-cyan-500/[0.03] transition-all cursor-pointer p-4 text-center group">
                            <Upload className="w-8 h-8 text-[#98A2B3] group-hover:text-cyan-400 transition-colors mb-2" />
                            <span className="text-xs font-semibold text-white">Upload Back Photo</span>
                            <span className="text-[10px] text-[#98A2B3] mt-1">PNG, JPG, or WebP up to 8MB</span>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(e) => handleFileUpload(e, setDocumentBackUrl)}
                              className="hidden"
                            />
                          </label>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Binance Photography Guidelines */}
                  <div className="p-3.5 rounded-xl bg-cyan-950/20 border border-cyan-500/20 text-[11px] font-mono text-cyan-200/90 space-y-1.5">
                    <div className="font-bold text-cyan-300 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Binance Verification Standards:</span>
                    </div>
                    <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-[10px] list-disc list-inside text-slate-300">
                      <li>Government issued and non-expired</li>
                      <li>All 4 corners completely visible</li>
                      <li>No flash reflection or blurred text</li>
                      <li>Color photograph (no black &amp; white)</li>
                    </ul>
                  </div>
                </div>
              )}

              {/* STEP 4: LIVE LIVENESS / FACIAL VERIFICATION */}
              {currentStep === 4 && (
                <div className="space-y-4 animate-fadeIn">
                  <div className="border-b border-white/[0.06] pb-2">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Camera className="w-4 h-4 text-cyan-400" />
                      <span>Biometric Facial Verification</span>
                    </h3>
                    <p className="text-[11px] text-[#98A2B3] mt-0.5">
                      Live facial liveness check. Position your face in the center guide.
                    </p>
                  </div>

                  {cameraError && (
                    <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs">
                      {cameraError}
                    </div>
                  )}

                  <div className="flex flex-col items-center justify-center space-y-4">
                    {selfiePhotoUrl ? (
                      <div className="relative w-64 h-64 rounded-full border-4 border-cyan-400 overflow-hidden shadow-2xl shadow-cyan-500/30">
                        <img
                          src={selfiePhotoUrl}
                          alt="Selfie Biometric"
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => setSelfiePhotoUrl('')}
                          className="absolute bottom-2 right-1/2 translate-x-1/2 px-3 py-1 rounded-full bg-black/80 hover:bg-rose-600 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors shadow-lg"
                        >
                          <RefreshCw className="w-3 h-3" />
                          <span>Retake</span>
                        </button>
                      </div>
                    ) : isCameraActive ? (
                      <div className="relative w-64 h-64 rounded-full border-4 border-cyan-400 overflow-hidden shadow-2xl shadow-cyan-500/30 bg-black">
                        <video
                          ref={videoRef}
                          autoPlay
                          playsInline
                          muted
                          className="w-full h-full object-cover scale-x-[-1]"
                        />
                        {/* Oval scan animation overlay */}
                        <div className="absolute inset-0 border-2 border-cyan-300/60 rounded-full pointer-events-none animate-pulse" />
                        
                        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10">
                          <button
                            type="button"
                            onClick={capturePhoto}
                            className="px-4 py-2 rounded-full bg-cyan-400 hover:bg-cyan-300 text-black font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-cyan-400/40 cursor-pointer transition-all active:scale-95"
                          >
                            <Camera className="w-4 h-4" />
                            <span>Capture Photo</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="w-64 h-64 rounded-full border-2 border-dashed border-white/[0.2] bg-white/[0.02] flex flex-col items-center justify-center text-center p-6 space-y-3">
                        <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                          <Camera className="w-6 h-6" />
                        </div>
                        <div>
                          <div className="text-xs font-bold text-white">Live Camera Capture</div>
                          <div className="text-[10px] text-[#98A2B3] mt-0.5">Use your device webcam</div>
                        </div>
                        <button
                          type="button"
                          onClick={startCamera}
                          className="px-4 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-xs flex items-center gap-1.5 shadow-md shadow-cyan-500/20 cursor-pointer transition-all"
                        >
                          <Camera className="w-3.5 h-3.5" />
                          <span>Start Webcam</span>
                        </button>
                      </div>
                    )}

                    {/* Or upload selfie file directly */}
                    {!selfiePhotoUrl && (
                      <div className="text-center pt-1">
                        <span className="text-[11px] text-[#98A2B3] block mb-2 font-mono">
                          or upload a clear selfie photograph from your gallery:
                        </span>
                        <label className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-white text-xs font-mono font-medium transition-colors cursor-pointer">
                          <Upload className="w-3.5 h-3.5 text-cyan-400" />
                          <span>Select Selfie File</span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => handleFileUpload(e, setSelfiePhotoUrl)}
                            className="hidden"
                          />
                        </label>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* STEP 5: REVIEW & FINAL SUBMISSION */}
              {currentStep === 5 && (
                <div className="space-y-4 animate-fadeIn font-mono text-xs">
                  <div className="border-b border-white/[0.06] pb-2 font-sans">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span>Review &amp; Confirm Identity Package</span>
                    </h3>
                    <p className="text-[11px] text-[#98A2B3] mt-0.5 font-mono">
                      Please confirm all details before transmitting to the secure cryptographic verification enclave.
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl bg-black/40 border border-white/[0.08] space-y-3">
                    <div className="grid grid-cols-2 gap-2 text-slate-300">
                      <div>
                        <span className="text-[10px] text-slate-500 uppercase block">Full Legal Name</span>
                        <span className="font-bold text-white">{fullLegalName}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 uppercase block">Date of Birth</span>
                        <span className="font-bold text-white">{dob}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 uppercase block">Country</span>
                        <span className="font-bold text-white">{country}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 uppercase block">Document Type</span>
                        <span className="font-bold text-cyan-300">{documentType}</span>
                      </div>
                      <div className="col-span-2">
                        <span className="text-[10px] text-slate-500 uppercase block">Document Number</span>
                        <span className="font-bold text-white">{documentNumber}</span>
                      </div>
                      <div className="col-span-2">
                        <span className="text-[10px] text-slate-500 uppercase block">Residential Address</span>
                        <span className="text-slate-300">{residentialAddress}, {city} {postalCode}</span>
                      </div>
                    </div>
                  </div>

                  {/* Thumbnail Previews */}
                  <div className="grid grid-cols-3 gap-2 pt-1">
                    <div className="p-2 rounded-xl bg-white/[0.02] border border-white/[0.06] text-center space-y-1">
                      <span className="text-[9px] text-slate-400 uppercase block">Front ID</span>
                      {documentFrontUrl ? (
                        <img src={documentFrontUrl} alt="Front" className="w-full h-16 object-cover rounded-lg" />
                      ) : (
                        <div className="w-full h-16 rounded-lg bg-rose-500/10 text-rose-400 flex items-center justify-center text-[10px]">
                          Missing
                        </div>
                      )}
                    </div>

                    <div className="p-2 rounded-xl bg-white/[0.02] border border-white/[0.06] text-center space-y-1">
                      <span className="text-[9px] text-slate-400 uppercase block">Back ID</span>
                      {documentType === 'PASSPORT' ? (
                        <div className="w-full h-16 rounded-lg bg-white/[0.04] text-slate-400 flex items-center justify-center text-[10px]">
                          Not Required
                        </div>
                      ) : documentBackUrl ? (
                        <img src={documentBackUrl} alt="Back" className="w-full h-16 object-cover rounded-lg" />
                      ) : (
                        <div className="w-full h-16 rounded-lg bg-rose-500/10 text-rose-400 flex items-center justify-center text-[10px]">
                          Missing
                        </div>
                      )}
                    </div>

                    <div className="p-2 rounded-xl bg-white/[0.02] border border-white/[0.06] text-center space-y-1">
                      <span className="text-[9px] text-slate-400 uppercase block">Live Selfie</span>
                      {selfiePhotoUrl ? (
                        <img src={selfiePhotoUrl} alt="Selfie" className="w-full h-16 object-cover rounded-lg" />
                      ) : (
                        <div className="w-full h-16 rounded-lg bg-rose-500/10 text-rose-400 flex items-center justify-center text-[10px]">
                          Missing
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-[11px] flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-400" />
                    <span>Your data is encrypted end-to-end and stored securely in cloud-hardened databases.</span>
                  </div>
                </div>
              )}
            </>
          )}

        </div>

        {/* Modal Bottom Footer / Navigation */}
        {currentKycStatus !== 'VERIFIED' && currentKycStatus !== 'PENDING' && (
          <div className="px-6 py-4 border-t border-white/[0.08] bg-[#07101E] flex items-center justify-between gap-3">
            {currentStep > 1 ? (
              <button
                type="button"
                onClick={() => setCurrentStep((s) => Math.max(1, s - 1))}
                className="px-4 py-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-white text-xs font-mono font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Back</span>
              </button>
            ) : (
              <div />
            )}

            {currentStep < 5 ? (
              <button
                type="button"
                onClick={() => {
                  setErrorMsg(null);
                  if (currentStep === 1) {
                    if (!fullLegalName.trim() || !dob || !country.trim() || !residentialAddress.trim() || !city.trim()) {
                      setErrorMsg('Please complete all mandatory identity and address fields.');
                      return;
                    }
                  } else if (currentStep === 2) {
                    if (!documentNumber.trim()) {
                      setErrorMsg('Please enter your valid document identification number.');
                      return;
                    }
                  } else if (currentStep === 3) {
                    if (!documentFrontUrl) {
                      setErrorMsg('Front side photo of your document is required.');
                      return;
                    }
                    if (documentType !== 'PASSPORT' && !documentBackUrl) {
                      setErrorMsg('Back side photo of your ID card is required.');
                      return;
                    }
                  } else if (currentStep === 4) {
                    if (!selfiePhotoUrl) {
                      setErrorMsg('Live selfie facial verification is required.');
                      return;
                    }
                  }
                  setCurrentStep((s) => Math.min(5, s + 1));
                }}
                className="px-6 py-2.5 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-black font-bold text-xs font-mono flex items-center gap-1.5 shadow-lg shadow-cyan-400/20 cursor-pointer transition-all"
              >
                <span>Continue</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmitKYC}
                disabled={submitting}
                className="px-7 py-2.5 rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-black font-bold text-xs font-mono flex items-center gap-2 shadow-xl shadow-cyan-500/25 cursor-pointer transition-all disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Encrypting &amp; Transmitting...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>Submit Verification Package</span>
                  </>
                )}
              </button>
            )}
          </div>
        )}

      </div>
    </div>
  );
};
