import { Request, Response, NextFunction } from 'express';
import { getDb } from '../db/db';
import { logSecurityEvent } from '../utils/securityLogger';

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitRecord>();

// Clean up expired entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimitStore.entries()) {
    if (record.resetAt <= now) {
      rateLimitStore.delete(key);
    }
  }
}, 60000);

export function resetRateLimits(): void {
  rateLimitStore.clear();
}

export interface RateLimitOptions {
  windowMs: number; // Time window in ms
  max: number; // Max attempts per window
  keyPrefix?: string;
  includeIdentifier?: boolean;
}

export function createRateLimiter(options: RateLimitOptions) {
  const { windowMs, max, keyPrefix = 'rl', includeIdentifier = false } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown-ip';
    const userId = (req as any).user?.id;
    let key = `${keyPrefix}:${userId || ip}`;

    if (includeIdentifier && req.body && req.body.identifier) {
      key += `:${String(req.body.identifier).toLowerCase().trim()}`;
    }

    const now = Date.now();
    let record = rateLimitStore.get(key);

    if (!record || record.resetAt <= now) {
      record = {
        count: 1,
        resetAt: now + windowMs,
      };
      rateLimitStore.set(key, record);
      return next();
    }

    record.count += 1;

    if (record.count > max) {
      const retryAfterSeconds = Math.ceil((record.resetAt - now) / 1000);
      res.setHeader('Retry-After', retryAfterSeconds);

      // Asynchronously log rate limiting security event
      getDb()
        .then((db) => {
          logSecurityEvent(db, {
            userId: userId || null,
            eventType: 'RATE_LIMIT_EXCEEDED',
            description: `Rate limit of ${max} requests exceeded for action '${keyPrefix}' (IP: ${ip})`,
            userAgent: req.headers['user-agent'],
          }).catch(() => {});
        })
        .catch(() => {});

      return res.status(429).json({
        error: 'TOO_MANY_REQUESTS',
        message: `Too many requests for this operation. Please retry in ${retryAfterSeconds} seconds.`,
        retryAfter: retryAfterSeconds,
      });
    }

    return next();
  };
}

// 1. General Authentication Rate Limiter
export const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 50,
  keyPrefix: 'auth',
});

// 2. Strict Login Limiter (brute force protection)
export const loginLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  keyPrefix: 'login',
  includeIdentifier: true,
});

// 3. User Registration Limiter (anti-spam account creation)
export const registrationLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 15,
  keyPrefix: 'reg',
});

// 4. Password Reset Request Limiter
export const passwordResetLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyPrefix: 'pwd_reset',
});

// 5. Coin Swap Operation Limiter
export const swapLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 10,
  keyPrefix: 'swap',
});

// 6. Withdrawal Request Limiter
export const withdrawalLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 5,
  keyPrefix: 'withdrawal',
});

// 7. Blockchain Deposit Scan Limiter
export const depositLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 15,
  keyPrefix: 'deposit',
});

// 8. Administrative Financial Actions Limiter
export const adminFinancialLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 30,
  keyPrefix: 'admin_fin',
});
