import React, { useState } from 'react';
import { X, Download, Smartphone, Share, CheckCircle2, ArrowRight } from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall';

interface AppDownloadSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenPortal: () => void;
}

export const AppDownloadSheet: React.FC<AppDownloadSheetProps> = ({
  isOpen,
  onClose,
  onOpenPortal,
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [installFeedback, setInstallFeedback] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleInstallClick = async () => {
    if (isInstallable) {
      await install();
      setInstallFeedback('Installation prompt launched. Follow your browser confirmation to finish.');
    } else if (isInstalled) {
      setInstallFeedback('PHIVONEX is already installed on this device.');
    } else {
      setInstallFeedback('Use your browser menu ("Install App" or "Add to Home Screen") to install the official PHIVONEX web application.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="phx-app-download-title"
    >
      <div
        className="relative w-full max-w-lg rounded-[26px] border border-white/[0.12] p-7 sm:p-8 shadow-2xl overflow-hidden"
        style={{
          background: 'linear-gradient(180deg, rgba(16, 25, 22, 0.96) 0%, rgba(5, 8, 7, 0.98) 100%)',
        }}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-[#F5B800]/60 to-transparent"
        />

        <div className="flex items-start justify-between gap-4">
          <div>
            <span className="text-xs font-mono text-[#F5B800]">
              Official Client · Web, Android &amp; iOS
            </span>
            <h3
              id="phx-app-download-title"
              className="text-xl sm:text-2xl font-semibold text-white tracking-tight mt-1"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Download Official PHIVONEX App
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close download modal"
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="mt-3 text-sm text-slate-300 leading-relaxed">
          Install the official PHIVONEX application directly from our verified protocol origin for low-latency wallet settlement, node monitoring, and instant access across desktop and mobile devices.
        </p>

        <div className="mt-6 space-y-3">
          {/* Primary Direct Install */}
          <button
            type="button"
            onClick={handleInstallClick}
            className="w-full py-3.5 px-5 rounded-xl font-semibold text-sm text-[#050807] bg-gradient-to-r from-[#F5B800] via-[#FFD54F] to-[#FFE082] hover:brightness-105 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-[0_12px_30px_-10px_rgba(245,184,0,0.45)]"
          >
            <Download className="w-4 h-4" />
            <span>
              {isInstalled
                ? 'PHIVONEX App Installed'
                : isInstallable
                ? 'Install Official App Now'
                : 'Install Progressive Web App'}
            </span>
          </button>

          {/* Platform Guides */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.07]">
              <div className="flex items-center gap-2 text-xs font-semibold text-white mb-1.5">
                <Smartphone className="w-3.5 h-3.5 text-[#00E5FF]" />
                <span>Android &amp; Desktop</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Open in Chrome or Edge and choose <strong className="text-slate-200">Install App</strong> for native full-screen launch.
              </p>
            </div>
            <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.07]">
              <div className="flex items-center gap-2 text-xs font-semibold text-white mb-1.5">
                <Share className="w-3.5 h-3.5 text-[#FFE082]" />
                <span>iOS Safari</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Tap the Safari <strong className="text-slate-200">Share</strong> icon, then select <strong className="text-slate-200">Add to Home Screen</strong>.
              </p>
            </div>
          </div>

          {installFeedback && (
            <div className="p-3.5 rounded-xl bg-[#00E676]/10 border border-[#00E676]/25 flex items-start gap-2.5 text-xs text-slate-200">
              <CheckCircle2 className="w-4 h-4 text-[#00E676] shrink-0 mt-0.5" />
              <span>{installFeedback}</span>
            </div>
          )}

          {isIOS && !installFeedback && (
            <p className="text-xs text-[#FFE082]/90">
              iOS device detected: use Safari Share → Add to Home Screen for full native experience.
            </p>
          )}
        </div>

        <div className="mt-6 pt-5 border-t border-white/[0.08] flex items-center justify-between gap-4">
          <span className="text-xs text-slate-400">Prefer browser access?</span>
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenPortal();
            }}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#00E5FF] hover:text-white transition-colors cursor-pointer"
          >
            <span>Open Web Member Portal</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
