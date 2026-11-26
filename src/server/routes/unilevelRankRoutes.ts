import { Router, Response } from 'express';
import crypto from 'crypto';
import { requireAuth, requireAdmin, AuthRequest } from '../middleware/authMiddleware';
import { getDb } from '../db/db';
import {
  getUserUnilevelRankOverview,
  evaluateAndPromoteUserRank,
  evaluateAndPromoteUserAndAncestors,
  evaluateAllUsersUnilevelRanks,
} from '../services/unilevelRankService';

export const unilevelRankRouter = Router();
export const adminUnilevelRankRouter = Router();

/**
 * GET /api/unilevel/ranks/overview
 * Authenticated endpoint returning:
 * - User's current rank (`0..6`), next target rank, and personal active investment breakdown
 * - Per-direct-leg volume breakdown (`rawLegVolumeUsd`, `cappedLegVolumeUsd` at 40%, `isCapped`, `highestRankInLeg`)
 * - Full 7-rank ladder progress (`0..6`)
 * - One-time milestone payout history (`unilevel_rank_milestone_payouts`)
 */
unilevelRankRouter.get(
  '/overview',
  requireAuth,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const overview = await getUserUnilevelRankOverview(userId);
      res.status(200).json({
        success: true,
        data: overview,
      });
    } catch (err: any) {
      console.error('[UnilevelRankRoutes] Error in GET /overview:', err);
      res.status(err.statusCode || 500).json({
        error: err.code || 'INTERNAL_SERVER_ERROR',
        message: err.message || 'Failed to retrieve Unilevel Career & Leadership Rank overview.',
      });
    }
  }
);

/**
 * POST /api/admin/unilevel/ranks/evaluate
 * Protected `requireAdmin` endpoint to manually trigger rank evaluation for:
 * - A specific `userId` (with optional `includeAncestors: true`), OR
 * - A full network sweep (`sweepAll: true` or when `userId` is omitted)
 * Records an immutable entry in `security_audit_logs`.
 */
adminUnilevelRankRouter.post(
  '/evaluate',
  requireAdmin,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const adminUserId = req.user?.id || null;
      const targetUserId = req.body?.userId ? String(req.body.userId).trim() : null;
      const includeAncestors = req.body?.includeAncestors !== false;
      const limit = req.body?.limit ? Number(req.body.limit) : 500;

      let evaluationPayload: any;
      if (targetUserId) {
        if (includeAncestors) {
          evaluationPayload = await evaluateAndPromoteUserAndAncestors(targetUserId);
        } else {
          evaluationPayload = await evaluateAndPromoteUserRank(targetUserId, {
            cascadeToAncestors: true,
          });
        }
      } else {
        evaluationPayload = await evaluateAllUsersUnilevelRanks(limit);
      }

      try {
        const db = await getDb();
        const traceId = `RANK-EVAL-${Date.now()}-${crypto
          .randomBytes(4)
          .toString('hex')
          .toUpperCase()}`;
        await db.query(
          `
          INSERT INTO security_audit_logs (
            trace_id, actor_user_id, action_type, severity, payload, created_at
          )
          VALUES ($1, $2, 'ADMIN_EVALUATE_UNILEVEL_RANKS', 'INFO', $3::jsonb, NOW())
          `,
          [
            traceId,
            adminUserId,
            JSON.stringify({
              targetUserId,
              includeAncestors,
              limit,
              resultSummary: targetUserId
                ? {
                    userId: targetUserId,
                    promoted:
                      evaluationPayload.userEvaluation?.promoted ?? evaluationPayload.promoted,
                    currentRankLevel:
                      evaluationPayload.userEvaluation?.currentRankLevel ??
                      evaluationPayload.currentRankLevel,
                    currentRankCode:
                      evaluationPayload.userEvaluation?.currentRankCode ??
                      evaluationPayload.currentRankCode,
                  }
                : {
                    usersEvaluated: evaluationPayload.usersEvaluated,
                    usersPromoted: evaluationPayload.usersPromoted,
                    totalMilestonesAwarded: evaluationPayload.totalMilestonesAwarded,
                    totalBonusCreditedUsd: evaluationPayload.totalBonusCreditedUsd,
                  },
            }),
          ]
        );
      } catch (auditErr) {
        console.warn('[AdminUnilevelRankRoutes] Notice writing audit log:', auditErr);
      }

      res.status(200).json({
        success: true,
        message: targetUserId
          ? `Successfully evaluated Unilevel Career & Leadership Rank for user ${targetUserId}.`
          : `Successfully evaluated Unilevel Career & Leadership Ranks across ${evaluationPayload.usersEvaluated} users (${evaluationPayload.usersPromoted} promotions).`,
        data: evaluationPayload,
      });
    } catch (err: any) {
      console.error('[AdminUnilevelRankRoutes] Error in POST /evaluate:', err);
      res.status(err.statusCode || 500).json({
        error: err.code || 'INTERNAL_SERVER_ERROR',
        message: err.message || 'Failed to evaluate Unilevel Career & Leadership Ranks.',
      });
    }
  }
);
