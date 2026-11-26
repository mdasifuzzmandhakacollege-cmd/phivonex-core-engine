import { Router, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { requireAuth, requireAdmin, AuthRequest } from '../middleware/authMiddleware';
import { getDb } from '../db/db';
import { hashToken } from '../utils/crypto';
import {
  investInTradingPool,
  redeemQuantumAlphaPrincipal,
} from '../services/tradingPoolService';
import { getAlphaRedemptionFeePct } from '../services/unilevelConfigService';
import {
  getTradingPoolOverview,
  settleTradingYieldForDate,
} from '../services/tradingYieldEpochService';

export const tradingPoolRouter = Router();
export const adminTradingPoolRouter = Router();

/**
 * Optional authentication middleware for `/api/trading-pool/overview`:
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
    console.warn('[TradingPoolRoutes] Optional auth resolution notice:', err);
  }

  next();
}

/**
 * GET /api/trading-pool/overview
 * Returns:
 * - Active tiers (`Alpha Core`, `Alpha Prime`, `Alpha Sovereign`)
 * - Current UTC market session status (`LIVE_TRADING_SESSION` Mon–Fri vs `WEEKEND_SETTLEMENT` Sat–Sun)
 * - Recent public daily pool yield percentages formatted as market performance telemetry
 * - Authenticated user's active positions and payout history (if authenticated)
 */
tradingPoolRouter.get('/overview', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const [overview, alphaRedemptionFeePct] = await Promise.all([
      getTradingPoolOverview(req.user?.id || null),
      getAlphaRedemptionFeePct(),
    ]);
    return res.status(200).json({
      success: true,
      ...overview,
      alphaRedemptionFeePct,
      activePositions: overview.userSummary?.activePositions || [],
      allPositions: overview.userSummary?.allPositions || [],
      payoutHistory: overview.userSummary?.payoutHistory || [],
    });
  } catch (err: any) {
    console.error('[TradingPoolRoutes] Error in GET /overview:', err);
    return res.status(500).json({
      error: 'SERVER_ERROR',
      message: 'Failed to load PHIVONEX QUANTUM ALPHA™ trading pool overview.',
    });
  }
});

/**
 * POST /api/trading-pool/invest
 * Authenticated endpoint to subscribe to PHIVONEX QUANTUM ALPHA™.
 */
tradingPoolRouter.post('/invest', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Authentication required.',
      });
    }

    const rawAmount = req.body?.amountUsd ?? req.body?.amount;
    if (rawAmount === undefined || rawAmount === null || rawAmount === '') {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'amountUsd is required (minimum $200.00 USDT).',
      });
    }

    const result = await investInTradingPool({
      userId,
      amountUsd: rawAmount,
    });

    return res.status(201).json({
      success: true,
      message: `Successfully subscribed $${result.position.principalAmount} USDT to PHIVONEX QUANTUM ALPHA™ (${result.tier.tierName}).`,
      ...result,
    });
  } catch (err: any) {
    console.error('[TradingPoolRoutes] Error in POST /invest:', err);
    const statusCode = err?.statusCode && Number.isInteger(err.statusCode) ? err.statusCode : 400;
    return res.status(statusCode).json({
      error: err?.code || 'INVESTMENT_ERROR',
      message: err?.message || 'Failed to subscribe to PHIVONEX QUANTUM ALPHA™.',
    });
  }
});

/**
 * POST /api/trading-pool/redeem
 * Authenticated endpoint to redeem principal for an ACTIVE Quantum Alpha™ position
 * after completion of the 7-day weekly liquidity cycle.
 */
tradingPoolRouter.post('/redeem', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Authentication required.',
      });
    }

    const positionId = req.body?.positionId ? String(req.body.positionId).trim() : '';
    const idempotencyKey = req.body?.idempotencyKey ? String(req.body.idempotencyKey).trim() : undefined;

    if (!positionId) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'positionId is required to redeem principal.',
      });
    }

    const result = await redeemQuantumAlphaPrincipal({
      userId,
      positionId,
      idempotencyKey,
    });

    return res.status(200).json({
      success: true,
      message: `Principal redemption settled: $${result.netPayoutUsd} USDT credited to your Main USDT Wallet.`,
      ...result,
    });
  } catch (err: any) {
    console.error('[TradingPoolRoutes] Error in POST /redeem:', err);
    const statusCode = err?.statusCode && Number.isInteger(err.statusCode) ? err.statusCode : 400;
    return res.status(statusCode).json({
      error: err?.code || 'REDEMPTION_ERROR',
      message: err?.message || 'Failed to redeem Quantum Alpha™ principal.',
      unlockEligibleAt: err?.unlockEligibleAt || undefined,
    });
  }
});

/**
 * Handler for POST /api/admin/trading-pool/settle-epoch
 * Protected requireAdmin endpoint to manually trigger/audit settlement for a specific tradingDate.
 */
async function handleAdminSettleTradingEpoch(req: AuthRequest, res: Response) {
  try {
    const { tradingDate, positionId, catchUp, singleDateOnly } = req.body || {};
    const targetDate = tradingDate ? String(tradingDate).trim() : undefined;

    const settlement = await settleTradingYieldForDate(targetDate, {
      positionId: positionId ? String(positionId).trim() : undefined,
      catchUp: typeof catchUp === 'boolean' ? catchUp : undefined,
      singleDateOnly: typeof singleDateOnly === 'boolean' ? singleDateOnly : undefined,
    });

    // Record admin audit log in security_audit_logs
    try {
      const db = await getDb();
      await db.query(
        `
        INSERT INTO security_audit_logs (
          trace_id, actor_user_id, action_type, severity, payload, created_at
        )
        VALUES ($1, $2, 'ADMIN_SETTLE_TRADING_POOL_EPOCH', 'INFO', $3::jsonb, NOW())
        `,
        [
          `TRACE-QALPHA-SETTLE-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
          req.user?.id || null,
          JSON.stringify({
            requestedTradingDate: targetDate || 'LATEST_COMPLETED_UTC',
            settlement,
          }),
        ]
      );
    } catch (auditErr) {
      console.warn('[TradingPoolRoutes] Could not write security_audit_logs for epoch settlement:', auditErr);
    }

    return res.status(200).json({
      success: true,
      settlement,
    });
  } catch (err: any) {
    console.error('[TradingPoolRoutes] Error in POST /admin/trading-pool/settle-epoch:', err);
    return res.status(400).json({
      error: err?.code || 'SETTLEMENT_ERROR',
      message: err?.message || 'Failed to settle trading pool yield epoch.',
    });
  }
}

adminTradingPoolRouter.use(requireAdmin);
adminTradingPoolRouter.post('/settle-epoch', handleAdminSettleTradingEpoch);
tradingPoolRouter.post('/admin/settle-epoch', requireAdmin, handleAdminSettleTradingEpoch);
