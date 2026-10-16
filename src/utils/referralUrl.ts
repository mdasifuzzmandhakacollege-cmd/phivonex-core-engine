/**
 * Protocol Referral URL Utility
 * Ensures generated referral URLs always use the official custom domain (phivonex.com)
 * or public-facing endpoint (ais-pre-) so that invited guests never hit Google Cloud Run IAP "403 Forbidden" errors
 * or ugly internal cloud run URLs.
 */

export function getPublicBaseUrl(inputUrl?: string): string {
  // 1. If running in the client browser, prioritize browser's current location origin
  if (typeof window !== 'undefined' && window.location) {
    const origin = window.location.origin || '';
    const hostname = window.location.hostname || '';

    // If already on custom domain or any phivonex domain, strictly return https://phivonex.com
    if (hostname === 'phivonex.com' || hostname.endsWith('.phivonex.com') || origin.includes('phivonex.com')) {
      return 'https://phivonex.com';
    }

    // If on Google AI Studio shared preview
    if (origin.includes('ais-pre-')) {
      return origin.replace(/\/$/, '');
    }

    // If on Google AI Studio internal dev cluster, convert to public preview
    if (origin.includes('ais-dev-')) {
      return origin.replace('ais-dev-', 'ais-pre-').replace(/\/$/, '');
    }

    // If on internal raw Cloud Run cluster (*.run.app) without custom domain, default to production domain phivonex.com
    if (origin.includes('.run.app') && !origin.includes('ais-pre-')) {
      return 'https://phivonex.com';
    }

    // For localhost or custom test environment
    if (origin && !origin.includes('localhost') && !origin.includes('127.0.0.1')) {
      return origin.replace(/\/$/, '');
    }
  }

  // 2. If inputUrl is provided from backend or prop, parse out clean domain origin
  if (inputUrl && typeof inputUrl === 'string') {
    let clean = inputUrl.trim();
    // If it has /register, remove it to get base domain
    if (clean.includes('/register')) {
      clean = clean.split('/register')[0];
    }
    // Remove trailing slashes
    clean = clean.replace(/\/$/, '');

    try {
      const parsed = new URL(clean.startsWith('http') ? clean : `https://${clean}`);
      if (parsed.hostname.includes('phivonex.com')) {
        return 'https://phivonex.com';
      }
      if (parsed.hostname.includes('ais-dev-')) {
        return `${parsed.protocol}//${parsed.host.replace('ais-dev-', 'ais-pre-')}`;
      }
      if (parsed.hostname.includes('.run.app')) {
        return 'https://phivonex.com';
      }
      return `${parsed.protocol}//${parsed.host}`;
    } catch {
      if (clean.includes('phivonex.com')) return 'https://phivonex.com';
      if (clean.includes('ais-dev-')) return clean.replace('ais-dev-', 'ais-pre-');
      if (clean.includes('.run.app')) return 'https://phivonex.com';
      if (clean) return clean;
    }
  }

  // 3. Fallback to production custom domain
  return 'https://phivonex.com';
}

export function buildPublicReferralUrl(referralCode: string, customBaseUrl?: string): string {
  const code = (referralCode || '').trim().toUpperCase();
  const base = getPublicBaseUrl(customBaseUrl);
  return `${base}/register?ref=${encodeURIComponent(code)}`;
}

/**
 * Stores pending referral code from URL in localStorage
 */
export function capturePendingReferralCode(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (ref && ref.trim()) {
      const clean = ref.trim().toUpperCase();
      localStorage.setItem('phivonex_pending_ref', clean);
      return clean;
    }
    return localStorage.getItem('phivonex_pending_ref');
  } catch {
    return null;
  }
}
