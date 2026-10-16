export interface ReferralInfo {
  code: string;
  referrerName: string;
  referrerId: string;
  tier: string;
  isValid: boolean;
}

// Known referral codes mapping for rich demonstration
const KNOWN_REFERRALS: Record<string, { name: string; tier: string }> = {
  PHX123456: { name: 'Elena Rostova', tier: 'Genesis Node Operator' },
  PHX998877: { name: 'Alexander Wright', tier: 'Institutional Validator' },
  GENESIS: { name: 'Genesis Protocol Allocator', tier: 'Protocol Foundation' },
  CORE88: { name: 'David K. Lindqvist', tier: 'Senior Node Operator' },
  ALPHANODE: { name: 'Sarah Chen', tier: 'Node Validator' },
};

/**
 * Validates a referral code against simulated API endpoint
 */
export async function validateReferralCode(rawCode: string): Promise<ReferralInfo> {
  const code = rawCode.trim().toUpperCase();
  
  // Simulate network delay (180ms)
  await new Promise((resolve) => setTimeout(resolve, 180));

  if (!code) {
    return {
      code: '',
      referrerName: '',
      referrerId: '',
      tier: '',
      isValid: false,
    };
  }

  // Check known directory
  if (KNOWN_REFERRALS[code]) {
    return {
      code,
      referrerName: KNOWN_REFERRALS[code].name,
      referrerId: `USR-${code.slice(-4).padStart(4, '0')}`,
      tier: KNOWN_REFERRALS[code].tier,
      isValid: true,
    };
  }

  // Any alphanumeric referral code of length 4-12 is treated as valid network operator
  if (/^[A-Z0-9]{4,12}$/i.test(code)) {
    return {
      code,
      referrerName: `Verified Node Operator (${code})`,
      referrerId: `USR-${code.slice(-4)}`,
      tier: 'Network Participant',
      isValid: true,
    };
  }

  // Invalid format
  return {
    code,
    referrerName: '',
    referrerId: '',
    tier: '',
    isValid: false,
  };
}
