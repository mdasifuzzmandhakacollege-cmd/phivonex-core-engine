import { Router, Request, Response } from 'express';
import { getDb } from '../db/db';
import { requireAuth, AuthRequest } from '../middleware/authMiddleware';
import { normalizeReferralCode, formatSafeDisplayName } from '../utils/idGenerator';

const router = Router();

/**
 * GET /api/referrals/resolve/:code
 * Public endpoint to resolve a referral code and return privacy-safe sponsor data.
 */
router.get('/resolve/:code', async (req: Request, res: Response): Promise<void> => {
  try {
    const rawCode = req.params.code;
    const normalizedCode = normalizeReferralCode(rawCode);

    if (!normalizedCode || normalizedCode.length < 3) {
      res.status(200).json({ valid: false });
      return;
    }

    const db = await getDb();
    const result = await db.query<{
      referral_code: string;
      public_id: string;
      full_name: string;
      status: string;
    }>(
      `SELECT r.referral_code, u.public_id, u.full_name, u.status
       FROM user_referrals r
       JOIN users u ON r.user_id = u.id
       WHERE UPPER(TRIM(r.referral_code)) = UPPER(TRIM($1))
          OR UPPER(TRIM(u.public_id)) = UPPER(TRIM($1))
          OR LOWER(TRIM(u.email)) = LOWER(TRIM($1))
       LIMIT 1`,
      [normalizedCode]
    );

    if (result.rowCount === 0) {
      res.status(200).json({ valid: false });
      return;
    }

    const sponsor = result.rows[0];

    // Check that sponsor account is active
    if (sponsor.status !== 'ACTIVE' && sponsor.status !== 'PENDING_VERIFICATION') {
      res.status(200).json({ valid: false });
      return;
    }

    res.status(200).json({
      valid: true,
      referralCode: sponsor.referral_code,
      sponsor: {
        publicId: sponsor.public_id,
        displayName: formatSafeDisplayName(sponsor.full_name),
      },
    });
  } catch (err) {
    console.error('[Referrals API] Error in /resolve/:code:', err);
    res.status(500).json({
      error: 'SERVER_ERROR',
      message: 'Failed to resolve referral code',
    });
  }
});

/**
 * GET /api/referrals/me
 * Authenticated endpoint returning user's public identity, referral code, referral URL, and sponsor info.
 */
router.get('/me', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const db = await getDb();

    // Query user's own referral code and public_id
    const userResult = await db.query<{
      public_id: string;
      referral_code: string;
      sponsor_user_id: string | null;
    }>(
      `SELECT u.public_id, r.referral_code, r.sponsor_user_id
       FROM users u
       JOIN user_referrals r ON u.id = r.user_id
       WHERE u.id = $1`,
      [user.id]
    );

    if (userResult.rowCount === 0) {
      res.status(404).json({
        error: 'USER_NOT_FOUND',
        message: 'Referral profile not found for active user.',
      });
      return;
    }

    const userData = userResult.rows[0];
    let sponsorInfo: { publicId: string; displayName: string } | null = null;

    if (userData.sponsor_user_id) {
      const sponsorResult = await db.query<{
        public_id: string;
        full_name: string;
      }>(
        `SELECT public_id, full_name FROM users WHERE id = $1`,
        [userData.sponsor_user_id]
      );

      if (sponsorResult.rowCount > 0) {
        sponsorInfo = {
          publicId: sponsorResult.rows[0].public_id,
          displayName: formatSafeDisplayName(sponsorResult.rows[0].full_name),
        };
      }
    }

    // Determine domain/host for referral link
    // Default to the official custom domain phivonex.com
    const host = (req.get('x-forwarded-host') || req.get('host') || '').toLowerCase();
    let baseUrl = 'https://phivonex.com';

    if (process.env.APP_URL && !process.env.APP_URL.includes('MY_APP_URL') && !process.env.APP_URL.includes('.run.app')) {
      baseUrl = process.env.APP_URL;
    } else if (host.includes('ais-pre-') || host.includes('ais-dev-')) {
      const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
      baseUrl = `${protocol}://${host}`.replace('ais-dev-', 'ais-pre-');
    } else if (host.includes('phivonex.com')) {
      baseUrl = 'https://phivonex.com';
    }

    const cleanBaseUrl = baseUrl.replace(/\/$/, '');
    const referralUrl = `${cleanBaseUrl}/register?ref=${userData.referral_code}`;

    res.status(200).json({
      publicId: userData.public_id,
      referralCode: userData.referral_code,
      referralUrl,
      sponsor: sponsorInfo,
    });
  } catch (err) {
    console.error('[Referrals API] Error in /referrals/me:', err);
    res.status(500).json({
      error: 'SERVER_ERROR',
      message: 'Failed to fetch referral information',
    });
  }
});

/**
 * GET /api/referrals/direct
 * Authenticated endpoint returning privacy-safe list of directly sponsored operators.
 * Exposes ONLY publicId, displayName, and joinedAt.
 */
router.get('/direct', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const db = await getDb();

    // 1. Auto-reconcile any pending referrals for this sponsor
    const sponsorIdent = await db.query<{ referral_code: string; public_id: string; email: string }>(
      `SELECT r.referral_code, u.public_id, u.email
       FROM users u
       LEFT JOIN user_referrals r ON u.id = r.user_id
       WHERE u.id = $1`,
      [user.id]
    );

    if (sponsorIdent.rows.length > 0) {
      const s = sponsorIdent.rows[0];
      await db.query(
        `
        UPDATE user_referrals ur
        SET sponsor_user_id = $1
        FROM users u
        WHERE ur.user_id = u.id
          AND ur.sponsor_user_id IS NULL
          AND u.id != $1
          AND COALESCE(TRIM(u.pending_referral_code), '') != ''
          AND (
            UPPER(TRIM(u.pending_referral_code)) = UPPER(TRIM($2))
            OR UPPER(TRIM(u.pending_referral_code)) = UPPER(TRIM($3))
            OR LOWER(TRIM(u.pending_referral_code)) = LOWER(TRIM($4))
          )
        `,
        [user.id, s.referral_code || '__NONE__', s.public_id || '__NONE__', s.email || '__NONE__']
      );

      // Ensure all direct referrals exist in binary_placements
      await db.query(
        `
        INSERT INTO binary_placements (user_id, parent_user_id, side, status, placed_at, created_at)
        SELECT ur.user_id, NULL, NULL, 'UNPLACED', NULL, ur.created_at
        FROM user_referrals ur
        LEFT JOIN binary_placements bp ON ur.user_id = bp.user_id
        WHERE ur.sponsor_user_id = $1 AND bp.user_id IS NULL
        ON CONFLICT (user_id) DO NOTHING
        `,
        [user.id]
      );
    }

    const result = await db.query<{
      public_id: string;
      full_name: string;
      created_at: Date;
      placement_status: 'UNPLACED' | 'PLACED' | null;
      team_side: 'LEFT' | 'RIGHT' | null;
      placed_at: Date | null;
    }>(
      `
      SELECT 
        u.public_id, 
        u.full_name, 
        ur.created_at,
        CASE WHEN bp.status = 'PLACED' AND bp.parent_user_id IS NOT NULL THEN 'PLACED' ELSE 'UNPLACED' END as placement_status,
        bp.side as team_side,
        bp.placed_at
      FROM user_referrals ur
      JOIN users u ON ur.user_id = u.id
      LEFT JOIN binary_placements bp ON u.id = bp.user_id
      WHERE ur.sponsor_user_id = $1
      ORDER BY ur.created_at DESC
      `,
      [user.id]
    );

    const directReferrals = result.rows.map((row) => ({
      publicId: row.public_id,
      displayName: formatSafeDisplayName(row.full_name),
      joinedAt: row.created_at.toISOString(),
      placementStatus: row.placement_status || 'UNPLACED',
      teamSide: row.team_side,
      placedAt: row.placed_at ? row.placed_at.toISOString() : null,
    }));

    res.status(200).json({
      count: directReferrals.length,
      referrals: directReferrals,
    });
  } catch (err) {
    console.error('[Referrals API] Error in /referrals/direct:', err);
    res.status(500).json({
      error: 'SERVER_ERROR',
      message: 'Failed to fetch direct referrals list',
    });
  }
});

export default router;
