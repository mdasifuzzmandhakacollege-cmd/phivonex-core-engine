/**
 * Authoritative PHIVONEX Direct Referral Commission Configuration (Task #8)
 * Single source of truth for direct referral commission rates and lifecycle statuses.
 */

export const DIRECT_REFERRAL_COMMISSION_USD = 50;

export type ReferralCommissionStatus = 'EARNED' | 'REVERSED';
export const REFERRAL_COMMISSION_STATUSES: ReferralCommissionStatus[] = ['EARNED', 'REVERSED'];

/**
 * Formats sequence number to public commission identifier (PHX-COM-XXXXXX)
 */
export function formatPublicCommissionId(seq: number | string): string {
  const clean = typeof seq === 'string' ? seq.replace(/\D/g, '') : seq;
  const num = typeof clean === 'number' ? clean : parseInt(clean, 10) || Math.floor(100000 + Math.random() * 900000);
  return `PHX-COM-${String(num).padStart(6, '0')}`;
}
