import { Router, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { requireAuth, requireAdmin, AuthRequest } from '../middleware/authMiddleware';
import { getDb } from '../db/db';
import { hashToken } from '../utils/crypto';
import { subscribeChronoVault } from '../services/chronoVaultService';
import {
  getChronoVaultsOverview,
  settleChronoVaultsForDate,
} from '../services/chronoVaultEpochService';

export const chronoVaultRouter = Router();
export const adminChronoVaultRouter = Router();

/**
 * Optional authentication middleware for `/api/chrono-vaults/overview`:
 * Resolves `req.user` if a valid session cookie or Bearer token is present,
 * otherwise proceeds gracefully as a public viewer.
 */
async function optionalAuth(req: AuthRequest, _res: Response, next: NextFunction): Promise<void> {
  const token =
    req.cookies?.phx_session ||
    (req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.split(' ')[1]
      : null);

  if (!token) {
    return next();
  }

  try {
    const db = await getDb();
    const tokenHash = hashToken(token);
    const sessionRes = await db.query<{
      user_id: string;
      public_id: string;
      full_name: string;
      email: string;
      phone: string | null;
      country: string;
      status: string;
      role: string;
      email_verified_at: string | null;
      expires_at: Date;
      revoked_at: Date | null;
    }>(
      `
      SELECT
        s.expires_at,
        s.revoked_at,
        u.id AS user_id,
        u.public_id,
        u.full_name,
        u.email,
        u.phone,
        u.country,
        u.status,
        COALESCE(u.role, 'USER') AS role,
        u.email_verified_at
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.token_hash = $1
      LIMIT 1
      `,
      [tokenHash]
    );

    if (sessionRes.rowCount > 0) {
      const row = sessionRes.rows[0];
      const isRevoked = Boolean(row.revoked_at);
      const isExpired = new Date(row.expires_at).getTime() <= Date.now();
      if (!isRevoked && !isExpired && row.status !== 'SUSPENDED' && row.status !== 'LOCKED') {
        req.user = {
          id: row.user_id,
          public_id: row.public_id,
          fullName: row.full_name,
          email: row.email,
          phone: row.phone,
          country: row.country,
          status: row.status,
          role: row.role,
          emailVerified: Boolean(row.email_verified_at),
          emailVerifiedAt: row.email_verified_at,
        };
      }
    }
  } catch (err) {
    console.warn('[ChronoVaultRoutes] Optional auth resolution notice:', err);
  }

  next();
}

/**
 * GET /api/chrono-vaults/overview
 * Returns:
 * - All 5 active vault plans (`Chrono Bronze Vault` 200D @ 0.35%, `Chrono Silver Vault` 1Y @ 0.45%,
 *   `Chrono Cyan Vault` 2Y @ 0.55%, `Chrono Gold Vault` 5Y @ 0.65%, `Chrono Sovereign Vault` 10Y @ 0.80%)
 * - Authenticated user's active & matured vault positions, remaining days, and payout history
 */
chronoVaultRouter.get('/overview', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const overview = await getChronoVaultsOverview(req.user?.id || null);
    return res.status(200).json({
      success: true,
      ...overview,
      activePositions: overview.userSummary?.activePositions || [],
      maturedPositions: overview.userSummary?.maturedPositions || [],
      payoutHistory: overview.userSummary?.payoutHistory || [],
    });
  } catch (err: any) {
    console.error('[ChronoVaultRoutes] Error in GET /overview:', err);
    return res.status(500).json({
      error: 'SERVER_ERROR',
      message: 'Failed to load PHIVONEX CHRONO VAULTS™ overview.',
    });
  }
});

/**
 * POST /api/chrono-vaults/subscribe
 * Authenticated endpoint to lock funds into a chosen Chrono Vault plan.
 */
chronoVaultRouter.post('/subscribe', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Authentication required.',
      });
    }

    const planCode = req.body?.planCode ?? req.body?.plan_code;
    const rawAmount = req.body?.amountUsd ?? req.body?.amount;

    if (!planCode || rawAmount === undefined || rawAmount === null || rawAmount === '') {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'planCode and amountUsd are required (minimum $100.00 USDT).',
      });
    }

    const result = await subscribeChronoVault({
      userId,
      planCode: String(planCode),
      amountUsd: rawAmount,
    });

    return res.status(201).json({
      success: true,
      message: `Successfully locked $${result.position.principalAmount} USDT into ${result.plan.planName} (${result.plan.durationDays} Days @ ${Number(result.plan.dailyRatePct).toFixed(2)}%/day).`,
      ...result,
    });
  } catch (err: any) {
    console.error('[ChronoVaultRoutes] Error in POST /subscribe:', err);
    const statusCode = err?.statusCode && Number.isInteger(err.statusCode) ? err.statusCode : 400;
    return res.status(statusCode).json({
      error: err?.code || 'SUBSCRIPTION_ERROR',
      message: err?.message || 'Failed to subscribe to PHIVONEX CHRONO VAULTS™.',
    });
  }
});

/**
 * Handler for POST /api/admin/chrono-vaults/settle-epoch
 * Protected requireAdmin endpoint to manually trigger/audit vault settlement for a specific epochDate.
 */
async function handleAdminSettleChronoVaultEpoch(req: AuthRequest, res: Response) {
  try {
    const { epochDate, tradingDate, positionId, catchUp, singleDateOnly } = req.body || {};
    const rawTargetDate = epochDate ?? tradingDate;
    const targetDate = rawTargetDate ? String(rawTargetDate).trim() : undefined;

    const settlement = await settleChronoVaultsForDate(targetDate, {
      positionId: positionId ? String(positionId).trim() : undefined,
      catchUp: typeof catchUp === 'boolean' ? catchUp : undefined,
      singleDateOnly: typeof singleDateOnly === 'boolean' ? singleDateOnly : undefined,
    });

    try {
      const db = await getDb();
      await db.query(
        `
        INSERT INTO security_audit_logs (
          trace_id, actor_user_id, action_type, severity, payload, created_at
        )
        VALUES ($1, $2, 'ADMIN_SETTLE_CHRONO_VAULT_EPOCH', 'INFO', $3::jsonb, NOW())
        `,
        [
          `TRACE-CVAULT-SETTLE-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
          req.user?.id || null,
          JSON.stringify({
            requestedEpochDate: targetDate || 'LATEST_COMPLETED_UTC',
            settlement,
          }),
        ]
      );
    } catch (auditErr) {
      console.warn('[ChronoVaultRoutes] Could not write security_audit_logs for epoch settlement:', auditErr);
    }

    return res.status(200).json({
      success: true,
      settlement,
    });
  } catch (err: any) {
    console.error('[ChronoVaultRoutes] Error in POST /admin/chrono-vaults/settle-epoch:', err);
    return res.status(400).json({
      error: err?.code || 'SETTLEMENT_ERROR',
      message: err?.message || 'Failed to settle Chrono Vault yield epoch.',
    });
  }
}

adminChronoVaultRouter.use(requireAdmin);
adminChronoVaultRouter.post('/settle-epoch', handleAdminSettleChronoVaultEpoch);
chronoVaultRouter.post('/admin/settle-epoch', requireAdmin, handleAdminSettleChronoVaultEpoch);
