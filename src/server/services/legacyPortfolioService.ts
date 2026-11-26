import { getDb } from '../db/db';

export async function checkUserLegacyPortfolioStatus(userId: string): Promise<{ hasLegacyPortfolio: boolean; summary: any }> {
  try {
    const db = await getDb();
    
    // Check if user has legacy binary placements, binary volume events, matching settlements, or legacy referral commissions
    const [placementsRes, volumeRes, matchingRes, legacyCommRes] = await Promise.all([
      db.query('SELECT COUNT(*) as count FROM binary_placements WHERE user_id = $1', [userId]).catch(() => ({ rows: [{ count: 0 }] })),
      db.query('SELECT COUNT(*) as count FROM binary_volume_events WHERE user_id = $1', [userId]).catch(() => ({ rows: [{ count: 0 }] })),
      db.query('SELECT COUNT(*) as count FROM binary_matching_settlements WHERE user_id = $1', [userId]).catch(() => ({ rows: [{ count: 0 }] })),
      db.query('SELECT COUNT(*) as count FROM referral_commissions WHERE user_id = $1', [userId]).catch(() => ({ rows: [{ count: 0 }] })),
    ]);

    const legacyCount =
      Number(placementsRes.rows[0]?.count || 0) +
      Number(volumeRes.rows[0]?.count || 0) +
      Number(matchingRes.rows[0]?.count || 0) +
      Number(legacyCommRes.rows[0]?.count || 0);

    const hasLegacyPortfolio = legacyCount > 0;

    let summary = {
      placementsCount: Number(placementsRes.rows[0]?.count || 0),
      volumeEventsCount: Number(volumeRes.rows[0]?.count || 0),
      matchingSettlementsCount: Number(matchingRes.rows[0]?.count || 0),
      legacyCommissionsCount: Number(legacyCommRes.rows[0]?.count || 0),
    };

    return { hasLegacyPortfolio, summary };
  } catch (err) {
    console.warn('[LegacyPortfolioService] Error checking status for user:', userId, err);
    return { hasLegacyPortfolio: false, summary: null };
  }
}

export async function getUserLegacyPortfolioDetails(userId: string): Promise<any> {
  const db = await getDb();
  const [placements, matching, commissions] = await Promise.all([
    db.query('SELECT * FROM binary_placements WHERE user_id = $1 ORDER BY placed_at DESC', [userId]).catch(() => ({ rows: [] })),
    db.query('SELECT * FROM binary_matching_settlements WHERE user_id = $1 ORDER BY business_date DESC', [userId]).catch(() => ({ rows: [] })),
    db.query('SELECT * FROM referral_commissions WHERE user_id = $1 ORDER BY created_at DESC', [userId]).catch(() => ({ rows: [] })),
  ]);

  return {
    placements: placements.rows,
    matchingSettlements: matching.rows,
    legacyCommissions: commissions.rows,
  };
}

export async function adminApplyLegacyAdjustment(
  adminUserId: string,
  targetUserId: string,
  adjustmentType: 'CREDIT_USDT' | 'DEBIT_USDT' | 'CREDIT_PHIVO',
  amount: number,
  note: string
): Promise<any> {
  const db = await getDb();
  return db.transaction(async (trx) => {
    // 1. Validate target user
    const userRes = await trx.query('SELECT id, public_id, email, display_name FROM users WHERE id = $1 OR public_id = $1', [targetUserId]);
    if (userRes.rows.length === 0) {
      throw new Error('Target user not found.');
    }
    const targetUser = userRes.rows[0];

    const numericAmount = Number(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      throw new Error('Invalid adjustment amount.');
    }

    const txnId = `LEGACY-ADJ-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

    // 2. Post financial ledger entry
    const entryType = adjustmentType === 'DEBIT_USDT' ? 'DEBIT' : 'CREDIT';
    const currency = adjustmentType === 'CREDIT_PHIVO' ? 'PHIVO' : 'USDT';

    await trx.query(
      `INSERT INTO financial_ledger_entries (id, public_txn_id, user_id, entry_type, source_type, source_id, source_ref, description, amount, currency, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'SETTLED', CURRENT_TIMESTAMP)`,
      [
        crypto.randomUUID ? crypto.randomUUID() : `leg-${Date.now()}`,
        txnId,
        targetUser.id,
        entryType,
        'LEGACY_ADMIN_ADJUSTMENT',
        adminUserId,
        `NOTE: ${note}`,
        `Legacy Portfolio Adjustment: ${adjustmentType} of ${numericAmount} ${currency} - ${note}`,
        numericAmount,
        currency,
      ]
    );

    // 3. Log security audit
    await trx.query(
      `INSERT INTO security_audit_logs (id, admin_user_id, action_type, target_entity, details, created_at)
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
      [
        crypto.randomUUID ? crypto.randomUUID() : `aud-${Date.now()}`,
        adminUserId,
        'ADMIN_LEGACY_ADJUSTMENT',
        `USER:${targetUser.id}`,
        JSON.stringify({ adjustmentType, amount: numericAmount, currency, note, txnId }),
      ]
    );

    return {
      success: true,
      txnId,
      targetUserId: targetUser.id,
      adjustmentType,
      amount: numericAmount,
      currency,
    };
  });
}
