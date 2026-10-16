import { Router, Response } from 'express';
import { getDb } from '../db/db';
import { requireAuth, AuthRequest } from '../middleware/authMiddleware';
import { logSecurityEvent } from '../utils/securityLogger';
import { formatSafeDisplayName } from '../utils/idGenerator';

const router = Router();

/**
 * GET /api/users/me/profile
 * Returns detailed safe profile information for the authenticated operator,
 * including sponsor attribution from the referral topology.
 */
router.get('/me/profile', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const db = await getDb();

    // Query user profile and referral/sponsor relationship
    const profileRes = await db.query(
      `
      SELECT 
        u.id,
        u.public_id,
        u.full_name,
        u.email,
        u.phone,
        u.country,
        u.status,
        u.email_verified_at,
        u.created_at,
        u.last_login_at,
        ur.referral_code,
        sp.public_id AS sponsor_public_id,
        sp.full_name AS sponsor_full_name
      FROM users u
      LEFT JOIN user_referrals ur ON u.id = ur.user_id
      LEFT JOIN users sp ON ur.sponsor_user_id = sp.id
      WHERE u.id = $1
      LIMIT 1
      `,
      [user.id]
    );

    if (profileRes.rowCount === 0) {
      res.status(404).json({ error: 'USER_NOT_FOUND', message: 'User profile not found.' });
      return;
    }

    const row = profileRes.rows[0];

    const safeSponsor = row.sponsor_public_id
      ? {
          publicId: row.sponsor_public_id,
          displayName: formatSafeDisplayName(row.sponsor_full_name || ''),
        }
      : null;

    res.status(200).json({
      profile: {
        id: row.id,
        publicId: row.public_id,
        referralCode: row.referral_code,
        fullName: row.full_name,
        email: row.email,
        phone: row.phone || null,
        country: row.country,
        status: row.status,
        emailVerified: Boolean(row.email_verified_at),
        emailVerifiedAt: row.email_verified_at || null,
        createdAt: row.created_at,
        lastLoginAt: row.last_login_at || null,
        sponsor: safeSponsor,
      },
    });
  } catch (err) {
    console.error('[User API] Error in GET /me/profile:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to retrieve profile.' });
  }
});

/**
 * PATCH /api/users/me/profile
 * Allows updating editable fields ONLY (fullName, phone, country).
 * Immutable fields (publicId, referralCode, sponsor, email, status, id) are strictly protected.
 */
router.patch('/me/profile', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const { fullName, phone, country } = req.body;

    // Server-side validation
    if (fullName !== undefined) {
      if (typeof fullName !== 'string' || fullName.trim().length < 2) {
        res.status(400).json({
          error: 'INVALID_NAME',
          message: 'Full name is required (minimum 2 characters).',
        });
        return;
      }
      if (fullName.trim().length > 100) {
        res.status(400).json({
          error: 'INVALID_NAME',
          message: 'Full name cannot exceed 100 characters.',
        });
        return;
      }
    }

    if (country !== undefined) {
      if (typeof country !== 'string' || country.trim().length < 2) {
        res.status(400).json({
          error: 'INVALID_COUNTRY',
          message: 'Country is required (minimum 2 characters).',
        });
        return;
      }
      if (country.trim().length > 100) {
        res.status(400).json({
          error: 'INVALID_COUNTRY',
          message: 'Country name cannot exceed 100 characters.',
        });
        return;
      }
    }

    let cleanPhone: string | null = null;
    if (phone !== undefined && phone !== null && phone !== '') {
      if (typeof phone !== 'string' || phone.trim().length < 5 || phone.trim().length > 30) {
        res.status(400).json({
          error: 'INVALID_PHONE',
          message: 'Phone number must be between 5 and 30 characters.',
        });
        return;
      }
      cleanPhone = phone.trim();
    }

    const db = await getDb();

    // Check unique phone collision if phone was changed
    if (cleanPhone && cleanPhone !== user.phone) {
      const existingPhone = await db.query(
        `SELECT id FROM users WHERE phone = $1 AND id != $2`,
        [cleanPhone, user.id]
      );
      if (existingPhone.rowCount > 0) {
        res.status(409).json({
          error: 'PHONE_EXISTS',
          message: 'This mobile phone number is already registered to another account.',
        });
        return;
      }
    }

    const updatedFullName = fullName !== undefined ? fullName.trim() : user.fullName;
    const updatedCountry = country !== undefined ? country.trim() : user.country;
    const updatedPhone = phone !== undefined ? cleanPhone : user.phone;

    // Update only allowed fields in the database
    await db.query(
      `
      UPDATE users
      SET 
        full_name = $1,
        phone = $2,
        country = $3,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $4
      `,
      [updatedFullName, updatedPhone, updatedCountry, user.id]
    );

    // Record security audit log
    await logSecurityEvent(db, {
      userId: user.id,
      eventType: 'PROFILE_UPDATED',
      description: 'Account profile details updated (Name, Mobile, or Country).',
      userAgent: req.headers['user-agent'],
    });

    // Query updated user with referral details
    const updatedRes = await db.query(
      `
      SELECT 
        u.id,
        u.public_id,
        u.full_name,
        u.email,
        u.phone,
        u.country,
        u.status,
        u.email_verified_at,
        u.created_at,
        u.last_login_at,
        ur.referral_code,
        sp.public_id AS sponsor_public_id,
        sp.full_name AS sponsor_full_name
      FROM users u
      LEFT JOIN user_referrals ur ON u.id = ur.user_id
      LEFT JOIN users sp ON ur.sponsor_user_id = sp.id
      WHERE u.id = $1
      LIMIT 1
      `,
      [user.id]
    );

    const updatedRow = updatedRes.rows[0];

    const safeSponsor = updatedRow.sponsor_public_id
      ? {
          publicId: updatedRow.sponsor_public_id,
          displayName: formatSafeDisplayName(updatedRow.sponsor_full_name || ''),
        }
      : null;

    res.status(200).json({
      message: 'Profile updated successfully.',
      user: {
        id: updatedRow.id,
        publicId: updatedRow.public_id,
        referralCode: updatedRow.referral_code,
        fullName: updatedRow.full_name,
        email: updatedRow.email,
        phone: updatedRow.phone || null,
        country: updatedRow.country,
        status: updatedRow.status,
        emailVerified: Boolean(updatedRow.email_verified_at),
        emailVerifiedAt: updatedRow.email_verified_at || null,
        createdAt: updatedRow.created_at,
        lastLoginAt: updatedRow.last_login_at || null,
        sponsor: safeSponsor,
      },
    });
  } catch (err) {
    console.error('[User API] Error in PATCH /me/profile:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to update profile.' });
  }
});

/**
 * GET /api/users/me/security-activity
 * Returns recent security audit logs for the authenticated operator.
 * Full IP addresses, password hashes, and raw tokens are strictly omitted.
 */
router.get('/me/security-activity', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const db = await getDb();

    const activityRes = await db.query(
      `
      SELECT 
        id,
        event_type AS "eventType",
        description,
        user_agent_summary AS "device",
        created_at AS "createdAt"
      FROM security_events
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 20
      `,
      [user.id]
    );

    res.status(200).json({
      activity: activityRes.rows,
    });
  } catch (err) {
    console.error('[User API] Error in GET /me/security-activity:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to retrieve security activity.' });
  }
});

export default router;
