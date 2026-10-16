import { Request, Response, NextFunction } from 'express';
import { getDb } from '../db/db';
import { logSecurityEvent } from '../utils/securityLogger';

/**
 * 1. Security Headers Middleware
 * Adds production headers including CSP, X-Content-Type-Options, Referrer-Policy,
 * Permissions-Policy, and HSTS.
 * Configured with frame-ancestors to preserve AI Studio preview capability.
 */
export function securityHeadersMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Content Security Policy
  // Preserves Google AI Studio iframe embedding in both production and development environments
  if (process.env.NODE_ENV === 'production') {
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self' https: data: blob: 'unsafe-inline' 'unsafe-eval'; frame-ancestors 'self' https://*.google.com https://*.run.app https://*.aistudio.google.com https://*.googleusercontent.com;"
    );
  } else {
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self' http: https: data: blob: 'unsafe-inline' 'unsafe-eval' ws: wss:; frame-ancestors *;"
    );
  }

  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Strict Referrer policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Legacy XSS filter for older user agents
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Restrict sensitive browser features
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  // HSTS in production when connection is encrypted
  const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  if (process.env.NODE_ENV === 'production' && isSecure) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  next();
}

/**
 * Trusted origin patterns for state-changing requests
 */
function isTrustedOrigin(origin: string, hostHeader?: string, forwardedHost?: string): boolean {
  if (!origin) return true;

  try {
    const url = new URL(origin);
    const originHost = url.host.toLowerCase();
    const originHostname = url.hostname.toLowerCase();

    // 1. Same-host or forwarded-host match
    if (hostHeader) {
      const cleanHost = hostHeader.toLowerCase().trim();
      const hostWithoutPort = cleanHost.split(':')[0];
      if (originHost === cleanHost || originHostname === hostWithoutPort) {
        return true;
      }
    }

    if (forwardedHost) {
      const firstForwarded = forwardedHost.split(',')[0].trim().toLowerCase();
      const forwardedWithoutPort = firstForwarded.split(':')[0];
      if (originHost === firstForwarded || originHostname === forwardedWithoutPort) {
        return true;
      }
    }

    // 2. Localhost & development environments
    if (
      originHostname === 'localhost' ||
      originHostname === '127.0.0.1' ||
      originHost.startsWith('localhost:') ||
      originHost.startsWith('127.0.0.1:')
    ) {
      return true;
    }

    // 3. Google AI Studio, Cloud Run, Firebase App Hosting, Firebase Hosting
    if (
      originHostname.endsWith('.hosted.app') ||
      originHostname.endsWith('.run.app') ||
      originHostname.endsWith('.firebaseapp.com') ||
      originHostname.endsWith('.web.app') ||
      originHostname.endsWith('.google.com') ||
      originHostname.endsWith('.aistudio.google.com')
    ) {
      return true;
    }

    // 4. Production Domain
    if (
      originHostname === 'phivonex.com' ||
      originHostname.endsWith('.phivonex.com')
    ) {
      return true;
    }

    // 5. Custom App URL if configured in environment
    if (process.env.APP_URL) {
      const appUrl = new URL(process.env.APP_URL);
      if (originHostname === appUrl.hostname.toLowerCase()) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * 2. CSRF / Origin Verification Middleware
 * Validates Origin/Referer header on state-changing requests (POST, PUT, PATCH, DELETE).
 * Untrusted origins are rejected with 403 Forbidden.
 */
export async function csrfOriginProtection(req: Request, res: Response, next: NextFunction): Promise<void> {
  const method = req.method.toUpperCase();

  // Read-only methods do not mutate state
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return next();
  }

  const origin = (req.headers.origin as string) || (req.headers.referer as string) || '';
  const host = (req.headers.host as string) || '';
  const forwardedHost = (req.headers['x-forwarded-host'] as string) || '';

  if (origin && !isTrustedOrigin(origin, host, forwardedHost)) {
    try {
      const db = await getDb();
      await logSecurityEvent(db, {
        userId: (req as any).user?.id || null,
        eventType: 'CSRF_REJECTED',
        description: `Blocked cross-origin request from untrusted origin '${origin}' on ${method} ${req.path}`,
        userAgent: req.headers['user-agent'],
      });
    } catch {
      // Ignore DB logging error during protection check
    }

    res.status(403).json({
      error: 'CSRF_FORBIDDEN',
      message: 'Cross-site request blocked: untrusted origin.',
    });
    return;
  }

  next();
}

/**
 * 3. Input Validation Helpers
 */

/**
 * Validates that an amount is a finite, positive number
 */
export function validatePositiveAmount(amount: any, fieldName = 'Amount'): { valid: boolean; value: number; error?: string } {
  const num = typeof amount === 'number' ? amount : parseFloat(amount);
  if (amount === null || amount === undefined || isNaN(num) || !isFinite(num) || num <= 0) {
    return {
      valid: false,
      value: 0,
      error: `${fieldName} must be a positive number greater than 0.`,
    };
  }
  return { valid: true, value: num };
}

/**
 * Validates EVM / BNB 20-byte hex address
 */
export function validateEvmAddress(address: any): { valid: boolean; address: string; error?: string } {
  if (typeof address !== 'string') {
    return { valid: false, address: '', error: 'Wallet address must be a string.' };
  }
  const clean = address.trim();
  const evmRegex = /^0x[a-fA-F0-9]{40}$/;
  if (!evmRegex.test(clean)) {
    return { valid: false, address: clean, error: 'Invalid EVM/BNB Smart Chain wallet address.' };
  }
  return { valid: true, address: clean.toLowerCase() };
}

/**
 * Sanitizes and clamps pagination parameters
 */
export function sanitizePagination(pageQuery: any, limitQuery: any, maxLimit = 100): { page: number; limit: number; offset: number } {
  let page = parseInt(pageQuery, 10);
  if (isNaN(page) || page < 1) page = 1;

  let limit = parseInt(limitQuery, 10);
  if (isNaN(limit) || limit < 1) limit = 20;
  if (limit > maxLimit) limit = maxLimit;

  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

/**
 * 4. Production Error Sanitization Middleware
 * Masks internal SQL statements, file system paths, stack traces, and secrets.
 * Emits a safe diagnostic identifier.
 */
export function sanitizeProductionErrors(err: any, req: Request, res: Response, next: NextFunction): void {
  const diagnosticId = `SEC-ERR-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

  // Log full error to server stderr safely
  console.error(`[Security Diagnostic ${diagnosticId}] ${req.method} ${req.path}:`, err?.message || err);

  const status = typeof err?.status === 'number' && err.status >= 400 && err.status < 600 ? err.status : 500;

  // Never leak internal secrets, SQL queries, or file paths
  let safeMessage = 'An unexpected internal error occurred. Please contact support with the diagnostic reference.';
  if (status < 500 && err?.message) {
    const raw = String(err.message);
    const containsSql = /syntax error|pglite|relation |column |violates foreign key|duplicate key/i.test(raw);
    const containsPath = /\/app\/|\/src\/|\/node_modules\//i.test(raw);
    const containsSecret = /key|token|password|secret|hash/i.test(raw);

    if (!containsSql && !containsPath && !containsSecret) {
      safeMessage = raw;
    }
  }

  res.status(status).json({
    error: err?.code || (status === 500 ? 'INTERNAL_SERVER_ERROR' : 'BAD_REQUEST'),
    message: safeMessage,
    diagnosticId,
  });
}
