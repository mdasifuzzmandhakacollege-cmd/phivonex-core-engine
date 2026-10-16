/**
 * Centralized Transaction Display Mappings & Helpers
 * Ensures consistent, clean, and professional presentation of financial transactions
 * across all operator dashboard views.
 * 
 * CRITICAL UX PRINCIPLES:
 * - Internal database/audit source remains 'ADMIN_ADJUSTMENT'.
 * - User-facing UI displays 'Account Credit' for credits and 'Account Debit' for debits.
 * - Internal admin ID, email, or internal audit reasons are strictly shielded from the user.
 */

export function getTransactionDisplayLabel(sourceType: string, entryType?: string): string {
  const s = (sourceType || '').toUpperCase().trim();
  const e = (entryType || '').toUpperCase().trim();

  if (s === 'ADMIN_ADJUSTMENT') {
    return e === 'DEBIT' ? 'Account Debit' : 'Account Credit';
  }
  if (s === 'BLOCKCHAIN_DEPOSIT' || s === 'DEPOSIT') {
    return 'USDT Deposit';
  }
  if (s === 'NODE_PURCHASE' || s === 'NODE_ACTIVATION') {
    return 'Genesis Node Purchase';
  }
  if (s === 'REFERRAL_COMMISSION' || s === 'REFERRAL') {
    return 'Referral Reward';
  }
  if (s === 'MATCHING_BONUS' || s === 'MATCHING') {
    return 'Matching Reward';
  }
  if (s === 'PROMOTION_BONUS' || s === 'PROMOTION') {
    return 'Leadership / Promotion Reward';
  }
  if (s === 'COIN_SWAP' || s === 'SWAP') {
    return 'PHIVO Swap';
  }
  if (s === 'WALLET_TRANSFER' || s === 'TRANSFER') {
    return 'Internal Vault Transfer';
  }
  if (s === 'WITHDRAWAL') {
    return 'Withdrawal';
  }
  if (s === 'NODE_REWARD' || s === 'NODE_MINING') {
    return 'Mining Reward';
  }
  return s.replace(/_/g, ' ');
}

export function getTransactionUserDescription(tx: {
  sourceType?: string;
  entryType?: string;
  description?: string;
}): string {
  const s = (tx.sourceType || '').toUpperCase().trim();
  const e = (tx.entryType || '').toUpperCase().trim();
  const desc = (tx.description || '').trim();

  if (s === 'ADMIN_ADJUSTMENT' || /admin adjustment/i.test(desc)) {
    return e === 'DEBIT' ? 'Account Debit' : 'Account Credit';
  }

  if (s === 'WALLET_TRANSFER' || /ecosystem transfer/i.test(desc)) {
    if (/node/i.test(desc)) {
      return e === 'DEBIT' ? 'Transfer to Node Vault' : 'Transfer from Node Vault';
    }
    return 'Internal Vault Transfer';
  }

  if (s === 'NODE_PURCHASE' || /genesis node/i.test(desc)) {
    return 'Genesis Node Purchase';
  }

  if (s === 'BLOCKCHAIN_DEPOSIT' || s === 'DEPOSIT') {
    return 'USDT Deposit';
  }

  if (s === 'COIN_SWAP' || s === 'SWAP') {
    return 'PHIVO Swap';
  }

  if (s === 'REFERRAL_COMMISSION') {
    return 'Referral Reward';
  }

  if (s === 'MATCHING_BONUS') {
    return 'Binary Matching Reward';
  }

  if (s === 'PROMOTION_BONUS') {
    return 'Promotion Reward';
  }

  if (s === 'WITHDRAWAL') {
    return 'Withdrawal Disbursement';
  }

  if (s === 'NODE_REWARD') {
    return 'Node Mining Reward';
  }

  // If description is clean and not a technical raw string, use it
  if (desc && !/^[A-Z_]+$/.test(desc) && !/transfer from m\.\.\./i.test(desc)) {
    return desc;
  }

  return getTransactionDisplayLabel(tx.sourceType || '', tx.entryType);
}
