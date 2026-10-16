import { v4 as uuidv4 } from 'uuid';
import { DatabaseClient } from '../db/db';

export function parseUserAgentSummary(uaStr?: string): string {
  if (!uaStr) return 'Standard Client';
  let browser = 'Web Browser';
  let os = 'Unknown OS';

  const ua = uaStr.toLowerCase();

  // Operating System
  if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ipod')) {
    os = 'iOS';
  } else if (ua.includes('android')) {
    os = 'Android';
  } else if (ua.includes('macintosh') || ua.includes('mac os x')) {
    os = 'macOS';
  } else if (ua.includes('windows')) {
    os = 'Windows';
  } else if (ua.includes('linux')) {
    os = 'Linux';
  }

  // Browser
  if (ua.includes('edg/')) {
    browser = 'Edge';
  } else if (ua.includes('chrome/') && !ua.includes('chromium')) {
    browser = 'Chrome';
  } else if (ua.includes('firefox/')) {
    browser = 'Firefox';
  } else if (ua.includes('safari/') && !ua.includes('chrome')) {
    browser = 'Safari';
  } else if (ua.includes('opr/') || ua.includes('opera/')) {
    browser = 'Opera';
  }

  return `${browser} on ${os}`;
}

export function sanitizeLogString(str: string): string {
  if (!str) return str;
  return str
    .replace(/(password|passwd|pwd|token|secret|privatekey|seed|key)=([^\s&]+)/gi, '$1=[REDACTED]')
    .replace(/("password"|"token"|"secret"|"privateKey"|"seedPhrase"|"mnemonic")\s*:\s*"[^"]+"/gi, '$1:"[REDACTED]"');
}

export interface SecurityEventParams {
  userId: string | null;
  eventType:
    | 'LOGIN_SUCCESS'
    | 'FAILED_LOGIN'
    | 'PASSWORD_CHANGED'
    | 'PROFILE_UPDATED'
    | 'SESSION_REVOKED'
    | 'SESSIONS_REVOKED_ALL_OTHERS'
    | 'EMAIL_VERIFIED'
    | 'EMAIL_VERIFICATION_SENT'
    | 'ACCOUNT_REGISTERED'
    | 'ADMIN_ACCESS'
    | 'ECONOMIC_CONFIG_CHANGE'
    | 'WITHDRAWAL_SETTLEMENT'
    | 'SUSPICIOUS_FINANCIAL_REQUEST'
    | 'RATE_LIMIT_EXCEEDED'
    | 'CSRF_REJECTED'
    | 'INVALID_INPUT_ATTEMPT';
  description: string;
  userAgent?: string;
}

export async function logSecurityEvent(
  db: DatabaseClient,
  params: SecurityEventParams
): Promise<void> {
  try {
    const summary = parseUserAgentSummary(params.userAgent);
    const safeDescription = sanitizeLogString(params.description);
    await db.query(
      `INSERT INTO security_events (id, user_id, event_type, description, user_agent_summary, created_at)
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
      [uuidv4(), params.userId, params.eventType, safeDescription, summary]
    );
  } catch (err) {
    console.warn('[SecurityLogger] Failed to record security event:', err);
  }
}
