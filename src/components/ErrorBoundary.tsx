import React, { Component, ErrorInfo, ReactNode } from 'react';
import { PhivonexLogo } from './brand/PhivonexLogo';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  isChunkError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    isChunkError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    const errorMsg = error?.message || String(error || '');
    const isChunkError =
      errorMsg.includes('Loading chunk') ||
      errorMsg.includes('Failed to fetch dynamically imported module') ||
      errorMsg.includes('Importing a module script failed') ||
      errorMsg.includes('network error');

    return {
      hasError: true,
      error,
      isChunkError,
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[PHIVONEX ErrorBoundary] Caught application error:', error, errorInfo);

    // If it's a chunk loading failure after a deployment, auto-refresh once safely
    if (this.state.isChunkError && typeof window !== 'undefined') {
      try {
        if (!sessionStorage.getItem('phx_err_reloaded')) {
          sessionStorage.setItem('phx_err_reloaded', 'true');
          console.warn('[PHIVONEX ErrorBoundary] Auto-refreshing to load new production bundle...');
          setTimeout(() => {
            window.location.reload();
          }, 1000);
        }
      } catch {
        // Ignore session storage errors
      }
    }
  }

  private handleReset = () => {
    try {
      sessionStorage.removeItem('phx_err_reloaded');
      sessionStorage.removeItem('phx_chunk_reloaded');
    } catch {
      // Ignore
    }
    window.location.href = '/';
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#05070B] text-[#F5F7FA] font-sans flex flex-col items-center justify-center p-6 text-center select-none">
          <div className="max-w-md w-full p-8 rounded-3xl bg-[#07101D] border border-white/[0.1] shadow-2xl space-y-6 relative overflow-hidden">
            {/* Ambient Cyan Edge */}
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#00CFFF] to-transparent" />

            <div className="flex justify-center">
              <PhivonexLogo size="md" theme="dark" animated={true} />
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-extrabold text-white">
                {this.state.isChunkError ? 'PHIVONEX is Refreshing...' : 'Protocol Sync Recovery'}
              </h2>
              <p className="text-xs text-[#98A2B3] leading-relaxed">
                {this.state.isChunkError
                  ? 'A new system update was deployed. Re-synchronizing asset chunks and session state.'
                  : 'An unexpected application state occurred. Click below to refresh your operator session.'}
              </p>
            </div>

            <div className="pt-2">
              <button
                onClick={this.handleReset}
                className="w-full py-3 px-6 text-xs font-bold uppercase tracking-wider text-[#05070B] bg-gradient-to-r from-[#00CFFF] to-[#00A3FF] hover:brightness-110 rounded-xl transition-all shadow-lg shadow-[#00CFFF]/25 cursor-pointer"
              >
                Refresh Session
              </button>
            </div>

            <div className="text-[10px] font-mono text-[#98A2B3]">
              PHIVONEX Enterprise Web3 Infrastructure
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
