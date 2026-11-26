/**
 * PHIVONEX Platform Environment Detection Utility
 */

export function isInstalledAppEnvironment(): boolean {
  if (typeof window === 'undefined') return false;

  const isCapacitorNative = Boolean((window as any).Capacitor?.isNativePlatform?.());
  const isStandaloneDisplay = window.matchMedia('(display-mode: standalone)').matches;
  const isIosStandalone = (window.navigator as any).standalone === true;

  return isCapacitorNative || isStandaloneDisplay || isIosStandalone;
}

export function isBrowserPushSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return 'Notification' in window && 'serviceWorker' in navigator;
}
