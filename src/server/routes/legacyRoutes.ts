import { Router, Response } from 'express';
import { AuthRequest, requireAuth, requireAdmin } from '../middleware/authMiddleware';
import {
  checkUserLegacyPortfolioStatus,
  getUserLegacyPortfolioDetails,
  adminApplyLegacyAdjustment,
} from '../services/legacyPortfolioService';
import { getDb } from '../db/db';

const router = Router();

// GET /api/legacy/status
router.get('/status', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'UNAUTHORIZED', message: 'Authentication required.' });
      return;
    }
    const status = await checkUserLegacyPortfolioStatus(userId);
    res.json({ success: true, ...status });
  } catch (err: any) {
    console.error('[LegacyRoutes] Error in GET /status:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err?.message || 'Failed to check legacy status.' });
  }
});

// GET /api/legacy/portfolio
router.get('/portfolio', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'UNAUTHORIZED', message: 'Authentication required.' });
      return;
    }
    const details = await getUserLegacyPortfolioDetails(userId);
    res.json({ success: true, portfolio: details });
  } catch (err: any) {
    console.error('[LegacyRoutes] Error in GET /portfolio:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err?.message || 'Failed to retrieve legacy portfolio.' });
  }
});

// GET /api/admin/legacy/members
router.get('/admin/members', requireAuth, requireAdmin, async (_req: AuthRequest, res: Response) => {
  try {
    const db = await getDb();
    const usersRes = await db.query(
      `SELECT id, public_id, email, display_name, created_at FROM users ORDER BY created_at DESC LIMIT 100`
    );
    res.json({ success: true, members: usersRes.rows });
  } catch (err: any) {
    console.error('[LegacyRoutes] Error in GET /admin/members:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err?.message || 'Failed to list members.' });
  }
});

// POST /api/admin/legacy/adjust
router.post('/admin/adjust', requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const adminUserId = req.user?.id;
    const { targetUserId, adjustmentType, amount, note } = req.body;

    if (!adminUserId) {
      res.status(401).json({ error: 'UNAUTHORIZED', message: 'Admin authentication required.' });
      return;
    }
    if (!targetUserId || !adjustmentType || amount === undefined) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'Missing required adjustment parameters.' });
      return;
    }

    const result = await adminApplyLegacyAdjustment(adminUserId, targetUserId, adjustmentType, Number(amount), note || 'Administrative Legacy Adjustment');
    res.json({ success: true, ...result });
  } catch (err: any) {
    console.error('[LegacyRoutes] Error in POST /admin/adjust:', err);
    res.status(400).json({ error: 'ADJUSTMENT_FAILED', message: err?.message || 'Failed to apply legacy adjustment.' });
  }
});

export const legacyRouter = router;
