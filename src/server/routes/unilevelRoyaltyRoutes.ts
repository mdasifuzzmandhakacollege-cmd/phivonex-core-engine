import { Router, Response } from 'express';
import crypto from 'crypto';
import { requireAuth, requireAdmin, AuthRequest } from '../middleware/authMiddleware';
import { getDb } from '../db/db';
import {
  getUserUnilevelRoyaltyOverview,
  processPendingUnilevelYieldEvents,
} from '../services/roiGenerationService';

export const unilevelRoyaltyRouter = Router();
export const adminUnilevelRoyaltyRouter = Router();

/**
 * GET /api/unilevel/royalties/overview
 * Authenticated endpoint returning:
 * - User's `personalActiveInvestmentUsd` and product-line breakdown
 * - `directActiveSponsorsCount`
 * - Full 16-generation unlock matrix (`1..16` with unlocked/locked status, missing requirements, total earned per level, and today's royalty)
 * - Paginated recent `unilevel_royalty_payouts` history
 */
unilevelRoyaltyRouter.get(
  '/overview',
  requireAuth,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const page = req.query.page ? Number(req.query.page) : 1;
      const limit = req.query.limit ? Number(req.query.limit) : 25;

      const overview = await getUserUnilevelRoyaltyOverview(userId, { page, limit });
      res.status(200).json({
        success: true,
        data: overview,
      });
    } catch (err: any) {
      console.error('[UnilevelRoyaltyRoutes] Error in GET /overview:', err);
      res.status(500).json({
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to retrieve 16-Generation Unilevel royalty overview.',
      });
    }
  }
);

/**
 * POST /api/admin/unilevel/royalties/process-pending
 * Protected `requireAdmin` endpoint to manually trigger and verify `processPendingUnilevelYieldEvents()`.
 * Records an immutable entry in `security_audit_logs`.
 */
adminUnilevelRoyaltyRouter.post(
  '/process-pending',
  requireAdmin,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const adminUserId = req.user?.id || null;
      const limit = req.body?.limit ? Number(req.body.limit) : 200;

      const result = await processPendingUnilevelYieldEvents(limit);

      try {
        const db = await getDb();
        const traceId = `UNILEVEL-PROC-${Date.now()}-${crypto
          .randomBytes(4)
          .toString('hex')
          .toUpperCase()}`;
        await db.query(
          `
          INSERT INTO security_audit_logs (
            trace_id, actor_user_id, action_type, severity, payload, created_at
          )
          VALUES ($1, $2, 'ADMIN_PROCESS_PENDING_UNILEVEL_EVENTS', 'INFO', $3::jsonb, NOW())
          `,
          [
            traceId,
            adminUserId,
            JSON.stringify({
              limit,
              result,
            }),
          ]
        );
      } catch (auditErr) {
        console.warn('[AdminUnilevelRoyaltyRoutes] Notice writing audit log:', auditErr);
      }

      res.status(200).json({
        success: true,
        message: `Processed ${result.eventsProcessed} pending Unilevel yield events (${result.totalSettledPayoutsCount} settled, ${result.totalSkippedLockedCount} skipped locked).`,
        data: result,
      });
    } catch (err: any) {
      console.error('[AdminUnilevelRoyaltyRoutes] Error in POST /process-pending:', err);
      res.status(500).json({
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to process pending Unilevel yield events.',
      });
    }
  }
);
