import React, { useState, useEffect } from 'react';
import { BellRing, Download, X, ShieldCheck, Sparkles, Smartphone, CheckCircle2 } from 'lucide-react';
import { isInstalledAppEnvironment, isBrowserPushSupported } from '../../utils/platformEnvironment';
import { requestPushPermissionAndToken } from '../../services/webPushService';
import { usePWAInstall } from '../../hooks/usePWAInstall';

interface SmartLaunchModalsProps {
  isAuthenticated?: boolean;
}

export const SmartLaunchModals: React.FC<SmartLaunchModalsProps> = ({ isAuthenticated = false }) => {
  const [showNotificationPrompt, setShowNotificationPrompt] = useState(false);
  const [showAppDownloadModal, setShowAppDownloadModal] = useState(false);
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifSuccess, setNotifSuccess] = useState<string | null>(null);

  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // 1. Smart Notification Guard (Regular browser only, max once, never force)
    const notifDismissed = localStorage.getItem('phx_web_notif_dismissed_v1') === 'true';
    const isNativeOrStandalone = isInstalledAppEnvironment();
    const pushSupported = isBrowserPushSupported();

    if (!isNativeOrStandalone && pushSupported && !notifDismissed) {
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
        const timer = setTimeout(() => {
          setShowNotificationPrompt(true);
        }, 3000);
        return () => clearTimeout(timer);
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // 2. Post-Login / Post-Registration App Download Modal (Browser only, with 3-minute snooze cooldown)
    if (isAuthenticated && !isInstalledAppEnvironment() && !isInstalled) {
      const snoozedUntil = Number(localStorage.getItem('phx_app_modal_snoozed_until') || '0');
      if (Date.now() >= snoozedUntil) {
        const timer = setTimeout(() => {
          setShowAppDownloadModal(true);
        }, 2000);
        return () => clearTimeout(timer);
      }
    }
  }, [isAuthenticated, isInstalled]);

  const handleDismissNotification = () => {
    setShowNotificationPrompt(false);
    if (typeof window !== 'undefined') {
      localStorage.setItem('phx_web_notif_dismissed_v1', 'true');
    }
  };

  const handleEnableNotification = async () => {
    setNotifLoading(true);
    try {
      const res = await requestPushPermissionAndToken();
      if (res.success) {
        setNotifSuccess('Push notifications successfully activated!');
        setTimeout(() => {
          setShowNotificationPrompt(false);
        }, 1500);
      } else {
        localStorage.setItem('phx_web_notif_dismissed_v1', 'true');
        setShowNotificationPrompt(false);
      }
    } catch {
      localStorage.setItem('phx_web_notif_dismissed_v1', 'true');
      setShowNotificationPrompt(false);
    } finally {
      setNotifLoading(false);
    }
  };

  const handleSnoozeAppDownload = () => {
    setShowAppDownloadModal(false);
    if (typeof window !== 'undefined') {
      // 3-minute snooze cooldown
      localStorage.setItem('phx_app_modal_snoozed_until', String(Date.now() + 3 * 60 * 1000));
    }
  };

  return (
    <>
      {/* 1. Smart One-Time Notification Prompt */}
      {showNotificationPrompt && !isInstalledAppEnvironment() && (
        <div className="fixed bottom-6 right-6 z-[100] max-w-sm w-full animate-in fade-in slide-in-from-bottom-6 duration-300">
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-b from-[#0A1628] via-[#07101D] to-[#05070B] border border-[#00E5FF]/40 p-5 shadow-2xl backdrop-blur-xl shadow-[#00E5FF]/10 text-white">
            <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-[#00E5FF]/60 to-transparent" />

            <div className="flex items-start gap-3.5">
              <div className="p-2.5 rounded-xl bg-[#00E5FF]/10 border border-[#00E5FF]/30 text-[#00E5FF] shrink-0">
                <BellRing className="w-5 h-5 animate-pulse" />
              </div>

              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold font-mono tracking-wider text-[#00E5FF] uppercase">
                    Protocol Alert Telemetry
                  </h4>
                  <button
                    onClick={handleDismissNotification}
                    className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <p className="text-xs text-slate-200 font-medium leading-relaxed">
                  Enable browser notifications to receive instant real-time alerts for deposit confirmations, mining yields, and withdrawals.
                </p>

                {notifSuccess ? (
                  <div className="flex items-center gap-1.5 text-xs text-[#32D583] font-bold pt-2">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{notifSuccess}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 pt-2">
                    <button
                      onClick={handleEnableNotification}
                      disabled={notifLoading}
                      className="px-3.5 py-2 rounded-xl bg-[#00E5FF] hover:bg-[#00cce6] text-[#050807] text-xs font-extrabold shadow-md shadow-[#00E5FF]/25 transition-all cursor-pointer"
                    >
                      {notifLoading ? 'Enabling...' : 'Enable Alerts'}
                    </button>
                    <button
                      onClick={handleDismissNotification}
                      className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-medium text-slate-300 transition-colors cursor-pointer"
                    >
                      Not Now
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. Post-Auth App Download Modal (Browser Only with 3-Min Snooze Cooldown) */}
      {showAppDownloadModal && isAuthenticated && !isInstalledAppEnvironment() && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-md rounded-3xl bg-gradient-to-b from-[#0A1628] via-[#07101D] to-[#05070B] border border-[#F5B800]/40 p-6 sm:p-8 shadow-2xl text-center space-y-5">
            <button
              onClick={handleSnoozeAppDownload}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1.5 rounded-xl bg-white/5 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-tr from-[#F5B800]/20 to-[#00E5FF]/20 border border-[#F5B800]/40 flex items-center justify-center text-[#F5B800] shadow-xl">
              <Download className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <span className="px-3 py-1 rounded-full text-[10px] font-mono font-bold tracking-wider uppercase bg-[#F5B800]/15 text-[#F5B800] border border-[#F5B800]/30">
                OFFICIAL DESKTOP &amp; MOBILE PWA
              </span>
              <h3 className="text-xl font-extrabold text-white">Download PHIVONEX Official App</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Install PHIVONEX as a native application for lightning-fast execution, offline ledger viewing, secure biometric login, and dedicated protocol updates.
              </p>
            </div>

            <div className="space-y-2.5 pt-2">
              {isInstallable ? (
                <button
                  onClick={() => {
                    install();
                    setShowAppDownloadModal(false);
                  }}
                  className="w-full py-3.5 px-5 rounded-2xl bg-gradient-to-r from-[#F5B800] via-[#F5B800]/90 to-[#00E5FF] text-[#050807] font-extrabold text-sm shadow-lg shadow-[#F5B800]/20 hover:brightness-110 transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  <span>INSTALL PHIVONEX APP NOW</span>
                </button>
              ) : isIOS ? (
                <div className="p-3.5 rounded-2xl bg-[#05070B] border border-white/10 text-left text-xs space-y-2">
                  <div className="font-bold text-[#F5B800] flex items-center gap-2">
                    <Smartphone className="w-4 h-4" />
                    <span>iOS Safari Instructions:</span>
                  </div>
                  <p className="text-slate-300 leading-normal">
                    Tap the <strong>Share</strong> icon in Safari toolbar, then select <strong>Add to Home Screen</strong>.
                  </p>
                </div>
              ) : (
                <button
                  onClick={() => {
                    if (install) install();
                    setShowAppDownloadModal(false);
                  }}
                  className="w-full py-3.5 px-5 rounded-2xl bg-[#00E5FF] text-[#050807] font-extrabold text-sm hover:bg-[#00cce6] transition-all cursor-pointer"
                >
                  Install PWA
                </button>
              )}

              <button
                onClick={handleSnoozeAppDownload}
                className="w-full py-2.5 px-4 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-mono text-slate-400 hover:text-white transition-all cursor-pointer"
              >
                Remind Me Later (Snooze 3 Mins)
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
