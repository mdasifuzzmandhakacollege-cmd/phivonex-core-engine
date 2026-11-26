/**
 * Authoritative PHIVONEX Direct Referral & Binary Engine Deprecation Configuration (Task #01 & Task #8)
 * Single source of truth for direct referral commission rates, lifecycle statuses, and deprecation feature flags.
 *
 * DEPRECATION NOTICE (13-Task Master Blueprint - Task 01):
 * Flat spot commissions and the binary volume/matching engine are deprecated in favor of the
 * 16-Generation Unilevel (ROI-on-ROI) & Multi-Product ecosystem.
 * Historical SETTLED payouts remain 100% intact for auditing.
 */

export const ENABLE_SPOT_COMMISSION = false;
export const ENABLE_BINARY_ENGINE = false;

export const DIRECT_REFERRAL_COMMISSION_USD = 0;

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

