import crypto from 'crypto';

// Characters excluding easily confused ones like 0, O, 1, I
const CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/**
 * Generate a random 6-character alphanumeric string
 */
function getRandomCode(length = 6): string {
  let result = '';
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    result += CHARS[bytes[i] % CHARS.length];
  }
  return result;
}

/**
 * Generate a Public PHIVONEX User ID (e.g. PHX-8F2K91)
 */
export function generatePublicId(): string {
  return `PHX-${getRandomCode(6)}`;
}

/**
 * Generate a Personal Referral Code (e.g. PHX8F2K91)
 */
export function generateReferralCode(): string {
  return `PHX${getRandomCode(6)}`;
}

/**
 * Normalize referral code (uppercase, trim)
 */
export function normalizeReferralCode(code: string): string {
  return (code || '').trim().toUpperCase();
}

/**
 * Generate a Public Order ID (e.g. PHX-ORD-9A2K4F)
 */
export function generateOrderPublicId(): string {
  return `PHX-ORD-${getRandomCode(6)}`;
}

/**
 * Generate a Public Volume Event ID (e.g. BVE-9A2K4F)
 */
export function generateVolumeEventPublicId(): string {
  return `BVE-${getRandomCode(6)}`;
}

/**
 * Generate a Public Matching Settlement ID (e.g. BMS-9A2K4F)
 */
export function generateSettlementPublicId(): string {
  return `BMS-${getRandomCode(6)}`;
}

/**
 * Generate a Public Promotion Bonus ID (e.g. PRM-9A2K4F)
 */
export function generatePromotionBonusPublicId(): string {
  return `PRM-${getRandomCode(6)}`;
}

/**
 * Generate a Public Financial Ledger Transaction ID (e.g. TXN-9A2K4F)
 */
export function generateLedgerTransactionPublicId(): string {
  return `TXN-${getRandomCode(6)}`;
}

/**
 * Generate a Public Reward Epoch ID (e.g. EPOCH-0001 or EPOCH-9A2K4F)
 */
export function generateEpochPublicId(epochNumber?: number): string {
  if (typeof epochNumber === 'number' && epochNumber > 0) {
    const padded = String(epochNumber).padStart(4, '0');
    return `EPOCH-${padded}`;
  }
  return `EPOCH-${getRandomCode(6)}`;
}

/**
 * Generate a Public Node Reward ID (e.g. NRW-9A2K4F)
 */
export function generateRewardPublicId(): string {
  return `NRW-${getRandomCode(6)}`;
}

/**
 * Generate a Public Withdrawal ID (e.g. PHX-WDR-9A2K4F)
 */
export function generateWithdrawalPublicId(): string {
  return `PHX-WDR-${getRandomCode(6)}`;
}

/**
 * Generate a Public Blockchain Deposit ID (e.g. PHX-DEP-9A2K4F)
 */
export function generateDepositPublicId(): string {
  return `PHX-DEP-${getRandomCode(6)}`;
}

/**
 * Generate a Public Coin Swap ID (e.g. PHX-SWP-9A2K4F)
 */
export function generateSwapPublicId(): string {
  return `PHX-SWP-${getRandomCode(6)}`;
}

/**
 * Generate a Public Notification ID (e.g. NTF-9A2K4F)
 */
export function generateNotificationPublicId(): string {
  return `NTF-${getRandomCode(6)}`;
}

/**
 * Generate a Public Reconciliation Run ID (e.g. REC-9A2K4F)
 */
export function generateReconciliationPublicId(): string {
  return `REC-${getRandomCode(6)}`;
}

/**
 * Format privacy-safe display name (e.g., "John Doe" -> "John D.")
 */
export function formatSafeDisplayName(fullName: string): string {
  if (!fullName || typeof fullName !== 'string') return 'Operator';
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0];
  }
  const firstName = parts[0];
  const lastInitial = parts[parts.length - 1].charAt(0).toUpperCase();
  return `${firstName} ${lastInitial}.`;
}

/**
 * Robustly resolves a sponsor's internal user ID from:
 * 1. Referral Code (e.g. PHX-REF-XXXXXX or custom code)
 * 2. Public ID (e.g. PHX-XXXXXX)
 * 3. Sponsor Email address
 */
export async function resolveSponsorUserId(
  db: any,
  rawInput: string
): Promise<string | null> {
  const clean = (rawInput || '').trim();
  if (!clean || clean.length < 3) return null;

  try {
    const res = await db.query(
      `SELECT r.user_id 
       FROM user_referrals r
       JOIN users u ON r.user_id = u.id
       WHERE UPPER(TRIM(r.referral_code)) = UPPER(TRIM($1))
          OR UPPER(TRIM(u.public_id)) = UPPER(TRIM($1))
          OR LOWER(TRIM(u.email)) = LOWER(TRIM($1))
       LIMIT 1`,
      [clean]
    );

    return res.rows[0]?.user_id || null;
  } catch (err) {
    console.warn('[ReferralResolution] Error resolving sponsor input:', err);
    return null;
  }
}

