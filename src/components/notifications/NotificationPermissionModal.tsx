import React, { useState, useEffect } from 'react';
import { BellRing, ShieldAlert, CheckCircle2, RefreshCw, Sparkles, X, AlertTriangle } from 'lucide-react';
import { requestPushPermissionAndToken, checkPushSupport } from '../../services/webPushService';

interface NotificationPermissionModalProps {
  userPublicId?: string;
}

export const NotificationPermissionModal: React.FC<NotificationPermissionModalProps> = () => {
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('granted');
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const checkStatus = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setPermission('unsupported');
      setIsOpen(false);
      return;
    }

    const currentPerm = Notification.permission;
    setPermission(currentPerm);

    if (currentPerm !== 'granted') {
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
  };

  useEffect(() => {
    checkStatus();

    // Re-check periodically or on window focus
    const interval = setInterval(checkStatus, 8000);
    const handleFocus = () => checkStatus();

    window.addEventListener('focus', handleFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  const handleEnableNotifications = async () => {
    setLoading(true);
    setFeedback(null);
    try {
      const res = await requestPushPermissionAndToken();
      if (typeof window !== 'undefined' && 'Notification' in window) {
        setPermission(Notification.permission);
      }

      if (res.success) {
        setFeedback({
          type: 'success',
          message: '🎉 Web Push Notifications successfully enabled! Real-time alerts activated.',
        });
        setTimeout(() => {
          setIsOpen(false);
        }, 1500);
      } else {
        if (Notification.permission === 'denied') {
          setFeedback({
            type: 'error',
            message: 'Notifications are blocked in your browser settings. Please click the padlock 🔒 icon near the address bar to set Notifications to "Allow".',
          });
        } else {
          setFeedback({
            type: 'error',
            message: res.error || 'Failed to register notifications. Please try again.',
          });
        }
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err?.message || 'Permission request failed.',
      });
    } finally {
      setLoading(false);
    }
  };

  // Close temporarily - will re-prompt on navigation / interval until allowed
  const handleDismissTemporarily = () => {
    setIsOpen(false);
    // Will re-trigger prompt on next focus or 15 seconds
  };

  if (!isOpen || permission === 'granted' || permission === 'unsupported') {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto bg-gradient-to-b from-[#0A1628] via-[#07101D] to-[#05070B] border border-[#00CFFF]/40 rounded-3xl p-5 sm:p-7 shadow-2xl shadow-[#00CFFF]/10 space-y-5 sm:space-y-6 text-white text-left">
        
        {/* Glow ambient background */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-[#00CFFF]/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-emerald-500/20 rounded-full blur-3xl pointer-events-none" />

        {/* Header Badges */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2.5 rounded-2xl bg-[#00CFFF]/10 border border-[#00CFFF]/30 text-[#00CFFF] animate-pulse">
              <BellRing className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#00CFFF] block">
                Required Protocol Action
              </span>
              <h3 className="text-lg font-bold text-white leading-tight">
                Enable Notifications
              </h3>
            </div>
          </div>

          <button
            onClick={handleDismissTemporarily}
            className="p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-[#98A2B3] hover:text-white transition-all cursor-pointer"
            title="Remind me later"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Description */}
        <div className="space-y-3">
          <p className="text-xs text-slate-300 leading-relaxed">
            To ensure secure protocol operation, please allow browser push notifications. You will receive instant real-time alerts for:
          </p>

          <ul className="space-y-2 text-xs font-medium text-[#98A2B3]">
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>USDT & Crypto Deposit Confirmations</span>
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#00CFFF] shrink-0" />
              <span>Genesis Node Emissions & Daily Mining Payouts</span>
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-purple-400 shrink-0" />
              <span>Referral Commissions & Binary Matching Bonuses</span>
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Instant Withdrawal Disbursements</span>
            </li>
          </ul>
        </div>

        {/* Warning if blocked in browser settings */}
        {permission === 'denied' && (
          <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs space-y-1">
            <div className="flex items-center gap-2 font-bold text-rose-200">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>Notifications Blocked in Browser</span>
            </div>
            <p className="text-[11px] text-rose-300/90 leading-normal">
              Click the padlock <strong className="text-white">🔒</strong> icon next to the URL bar ➔ <strong className="text-white">Permissions</strong> ➔ Set <strong className="text-white">Notifications</strong> to <strong className="text-emerald-300">Allow</strong>.
            </p>
          </div>
        )}

        {/* Feedback message */}
        {feedback && (
          <div className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
            feedback.type === 'success'
              ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border border-rose-500/30 text-rose-300'
          }`}>
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
        )}

        {/* Main Action Buttons */}
        <div className="space-y-2.5 pt-2">
          <button
            onClick={handleEnableNotifications}
            disabled={loading}
            className="w-full py-3.5 px-5 rounded-2xl bg-gradient-to-r from-[#00CFFF] via-[#00A3FF] to-emerald-400 hover:brightness-110 text-slate-950 font-bold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg shadow-[#00CFFF]/25 disabled:opacity-50 min-h-[48px]"
          >
            {loading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
                <span>Enabling Notifications...</span>
              </>
            ) : (
              <>
                <BellRing className="w-4 h-4 text-slate-950" />
                <span>ALLOW NOTIFICATIONS NOW</span>
              </>
            )}
          </button>

          <button
            onClick={handleDismissTemporarily}
            className="w-full py-2.5 px-4 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] text-xs font-mono text-[#98A2B3] hover:text-white transition-all cursor-pointer"
          >
            Remind Me Later
          </button>
        </div>
      </div>
    </div>
  );
};
