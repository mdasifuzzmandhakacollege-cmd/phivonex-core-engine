import React, { useState, useEffect } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { Download, X, Share, Smartphone, CheckCircle, Sparkles } from 'lucide-react';

export const PWAInstallPrompt: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [dismissed, setDismissed] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // Check if previously dismissed in this session
  useEffect(() => {
    const isDismissed = sessionStorage.getItem('phivonex_pwa_prompt_dismissed') === 'true';
    if (isDismissed) {
      setDismissed(true);
    }
  }, []);

  const handleDismiss = () => {
    setDismissed(true);
    sessionStorage.setItem('phivonex_pwa_prompt_dismissed', 'true');
  };

  // Hide if already running as installed app
  if (isInstalled) {
    return null;
  }

  // Show if installable OR on iOS, unless dismissed
  const canShow = (isInstallable || isIOS) && !dismissed;

  return (
    <>
      {/* Fixed Bottom Banner Prompt */}
      {canShow && (
        <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-6 md:max-w-md z-50 animate-in fade-in slide-in-from-bottom-5 duration-300">
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-b from-[#0E1E38]/95 via-[#07101D]/95 to-[#04060A]/95 p-4 border border-[#00CFFF]/40 shadow-2xl backdrop-blur-xl shadow-[#00CFFF]/15">
            {/* Top Specular Glow */}
            <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-[#80EAFF]/70 to-transparent" />

            <div className="flex items-start gap-3.5">
              {/* 512x512 PHIVONEX App Logo Icon */}
              <div className="relative shrink-0">
                <img
                  src="/brand/phivonex-app-icon-512.png"
                  alt="PHIVONEX Icon"
                  className="w-14 h-14 rounded-xl object-contain border border-[#00CFFF]/50 shadow-md shadow-[#00CFFF]/30 bg-[#05070B]"
                />
                <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#00CFFF] text-[10px] text-[#05070B] font-bold">
                  <Sparkles className="w-2.5 h-2.5" />
                </span>
              </div>

              {/* Text Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <h4 className="text-sm font-bold text-white tracking-wide">Install PHIVONEX App</h4>
                  <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-[#00CFFF]/20 text-[#00CFFF] border border-[#00CFFF]/30 rounded-full">
                    PWA
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-0.5 line-clamp-2">
                  Get fast desktop & mobile access with real-time node updates, direct deposit scans, and offline ledger viewing.
                </p>

                {/* Actions */}
                <div className="flex items-center gap-2 mt-3">
                  {isInstallable ? (
                    <button
                      onClick={install}
                      className="flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-[#00CFFF] to-[#0088FF] text-[#04060A] text-xs font-bold shadow-md shadow-[#00CFFF]/25 hover:brightness-110 active:scale-95 transition-all"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Install Now
                    </button>
                  ) : isIOS ? (
                    <button
                      onClick={() => setShowIOSGuide(true)}
                      className="flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#00CFFF]/15 hover:bg-[#00CFFF]/25 border border-[#00CFFF]/40 text-[#00CFFF] text-xs font-bold active:scale-95 transition-all"
                    >
                      <Smartphone className="w-3.5 h-3.5" />
                      Add to Home Screen
                    </button>
                  ) : null}

                  <button
                    onClick={handleDismiss}
                    className="px-2.5 py-1.5 text-xs font-medium text-slate-400 hover:text-white transition-colors"
                  >
                    Not Now
                  </button>
                </div>
              </div>

              {/* Close Button */}
              <button
                onClick={handleDismiss}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* iOS Safari Installation Guide Modal */}
      {showIOSGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="relative w-full max-w-sm rounded-2xl bg-[#0B1528] border border-[#00CFFF]/50 p-6 shadow-2xl text-center">
            <button
              onClick={() => setShowIOSGuide(false)}
              className="absolute top-3 right-3 text-slate-400 hover:text-white p-1 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>

            <img
              src="/brand/phivonex-app-icon-512.png"
              alt="PHIVONEX App Logo"
              className="w-16 h-16 mx-auto rounded-2xl border border-[#00CFFF]/50 shadow-lg shadow-[#00CFFF]/30 bg-[#05070B]"
            />

            <h3 className="mt-3 text-lg font-bold text-white">Install PHIVONEX on iPhone / iPad</h3>
            <p className="mt-1 text-xs text-slate-300">
              Install our full Progressive Web App directly to your home screen using Safari:
            </p>

            <div className="mt-4 space-y-3 text-left text-xs bg-[#05070B]/80 p-3.5 rounded-xl border border-slate-800">
              <div className="flex items-start gap-2.5 text-slate-200">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#00CFFF]/20 text-[#00CFFF] font-bold text-[11px]">
                  1
                </span>
                <span>
                  Tap the <Share className="inline w-3.5 h-3.5 text-[#00CFFF]" /> <strong>Share</strong> icon in the Safari navigation bar at the bottom.
                </span>
              </div>
              <div className="flex items-start gap-2.5 text-slate-200">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#00CFFF]/20 text-[#00CFFF] font-bold text-[11px]">
                  2
                </span>
                <span>
                  Scroll down the options menu and select <strong>Add to Home Screen</strong>.
                </span>
              </div>
              <div className="flex items-start gap-2.5 text-slate-200">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#00CFFF]/20 text-[#00CFFF] font-bold text-[11px]">
                  3
                </span>
                <span>
                  Confirm by tapping <strong>Add</strong> at the top right corner.
                </span>
              </div>
            </div>

            <button
              onClick={() => setShowIOSGuide(false)}
              className="mt-5 w-full rounded-xl bg-gradient-to-r from-[#00CFFF] to-[#0088FF] py-2.5 text-xs font-bold text-[#04060A] shadow-md shadow-[#00CFFF]/20 hover:brightness-110 active:scale-95 transition-all"
            >
              Got It
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export const PWAInstallHeaderButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) return null;

  if (isInstallable) {
    return (
      <button
        onClick={install}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#00CFFF]/15 hover:bg-[#00CFFF]/25 border border-[#00CFFF]/40 text-[#00CFFF] text-xs font-semibold transition-all active:scale-95"
        title="Install PHIVONEX Application"
      >
        <Download className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Install App</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#00CFFF]/15 hover:bg-[#00CFFF]/25 border border-[#00CFFF]/40 text-[#00CFFF] text-xs font-semibold transition-all active:scale-95"
          title="Install PHIVONEX on iOS"
        >
          <Smartphone className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Install</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
            <div className="relative w-full max-w-sm rounded-2xl bg-[#0B1528] border border-[#00CFFF]/50 p-6 shadow-2xl text-center">
              <button
                onClick={() => setShowIOSGuide(false)}
                className="absolute top-3 right-3 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
              <img
                src="/brand/phivonex-app-icon-512.png"
                alt="PHIVONEX Icon"
                className="w-14 h-14 mx-auto rounded-xl border border-[#00CFFF]/50 shadow-md bg-[#05070B]"
              />
              <h3 className="mt-3 text-base font-bold text-white">Install on iOS Safari</h3>
              <p className="mt-2 text-xs text-slate-300">
                Tap <strong>Share</strong> <Share className="inline w-3 h-3 text-[#00CFFF]" /> then choose <strong>Add to Home Screen</strong>.
              </p>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="mt-4 w-full rounded-xl bg-[#00CFFF] py-2 text-xs font-bold text-[#04060A]"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
