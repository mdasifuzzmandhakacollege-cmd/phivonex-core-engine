import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import './index.css';

// Guard against unhandled transport rejections (e.g. dropped dev WebSockets in preview environment)
if (typeof window !== 'undefined') {
  const isWsError = (msg: string) => {
    if (!msg) return false;
    const str = String(msg).toLowerCase();
    return str.includes('websocket') || str.includes('failed to connect') || str.includes('closed without opened') || str.includes('aborted');
  };

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event?.reason;
    const message = reason?.message || String(reason || '');
    if (isWsError(message)) {
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation();
      }
    }
  }, true);

  window.addEventListener('error', (event) => {
    const message = event?.message || (event?.error && event?.error?.message) || '';
    if (isWsError(message)) {
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation();
      }
    }
  }, true);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

