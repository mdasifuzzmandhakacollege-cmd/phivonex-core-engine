import { Router, Response } from 'express';
import { requireAuth, requireAdmin, AuthRequest } from '../middleware/authMiddleware';
import { evaluateUserPromotions } from '../services/promotionBonusService';
import {
  getPromotionRules,
  updatePromotionRule,
  getUserPromotionState,
  evaluateUserRankPromotion,
  getUserPromotionAuditLogs,
  adminManualRankCorrection,
} from '../services/leadershipRankService';
import {
  getPromotionalOffers,
  createPromotionalOffer,
  updatePromotionalOffer,
  deletePromotionalOffer,
  claimAndPayPromotionalOffer,
  getPromotionalBanners,
  createPromotionalBanner,
  updatePromotionalBanner,
  deletePromotionalBanner,
  getLeaderboardSettings,
  updateLeaderboardSettings,
  getLeaderboard,
  getPerformancePopupSettings,
  updatePerformancePopupSettings,
  getPerformancePopupData,
} from '../services/promotionalService';
import { broadcastSystemConfigChange } from '../services/systemConfigBroadcaster';

export const promotionRouter = Router();

/**
 * GET /api/promotions/ranks/me and GET /api/promotions/my-status
 * Returns authenticated user's current rank, stage progress, completed events, and ladder.
 */
promotionRouter.get(['/ranks/me', '/my-status'], requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const state = await getUserPromotionState(userId);
    return res.status(200).json({ success: true, state, ...state });
  } catch (err: any) {
    console.error('[Promotion API] Error in GET promotion state:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to retrieve user rank state' });
  }
});

/**
 * POST /api/promotions/ranks/evaluate
 * Server-authoritative sequential evaluation for authenticated user.
 */
promotionRouter.post('/ranks/evaluate', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const result = await evaluateUserRankPromotion(userId);
    return res.status(200).json({ success: true, result });
  } catch (err: any) {
    console.error('[Promotion API] Error in POST /api/promotions/ranks/evaluate:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message || 'Evaluation failed' });
  }
});

/**
 * GET /api/promotions/ranks/rules
 * Returns all promotion rules and ladder definition.
 */
promotionRouter.get('/ranks/rules', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const rules = await getPromotionRules();
    return res.status(200).json({ success: true, rules });
  } catch (err: any) {
    console.error('[Promotion API] Error in GET /api/promotions/ranks/rules:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to retrieve promotion rules' });
  }
});

/**
 * PUT /api/promotions/ranks/rules/:id
 * Admin updates promotion rule requirements (versioned, audited, prospective).
 */
promotionRouter.put('/ranks/rules/:id', requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const admin = req.user!;
    const { id } = req.params;
    const {
      requiredLeft,
      requiredRight,
      requiredLeaderRank,
      legBalanceRule,
      rewardType,
      rewardUsd,
      rewardTitle,
      rewardDescription,
      rewardDisplayValueUsd,
      status,
      reason,
      expectedVersion,
    } = req.body || {};

    if (!reason || String(reason).trim().length < 5) {
      return res.status(400).json({ error: 'INVALID_INPUT', message: 'Reason is required (min 5 characters).' });
    }

    const updated = await updatePromotionRule(admin.id, admin.public_id, id, {
      requiredLeft: typeof requiredLeft === 'number' ? requiredLeft : undefined,
      requiredRight: typeof requiredRight === 'number' ? requiredRight : undefined,
      requiredLeaderRank: requiredLeaderRank !== undefined ? requiredLeaderRank : undefined,
      legBalanceRule: legBalanceRule !== undefined ? legBalanceRule : undefined,
      rewardType: rewardType !== undefined ? rewardType : undefined,
      rewardUsd: typeof rewardUsd === 'number' ? rewardUsd : undefined,
      rewardTitle: rewardTitle !== undefined ? rewardTitle : undefined,
      rewardDescription: rewardDescription !== undefined ? rewardDescription : undefined,
      rewardDisplayValueUsd: rewardDisplayValueUsd !== undefined ? (rewardDisplayValueUsd === null ? null : Number(rewardDisplayValueUsd)) : undefined,
      status: status !== undefined ? status : undefined,
      expectedVersion: typeof expectedVersion === 'number' ? expectedVersion : undefined,
      reason: String(reason).trim(),
    });

    await broadcastSystemConfigChange('PROMOTION_RULES_UPDATED', { id, version: updated.version }, 'PROMOTION');

    return res.status(200).json({ success: true, rule: updated });
  } catch (err: any) {
    console.error('[Admin Promotion API] Error updating rank rule:', err);
    return res.status(err.statusCode || 500).json({ error: err.code || 'SERVER_ERROR', message: err.message });
  }
});

/**
 * GET /api/promotions/ranks/user/:userId
 * Admin inspects a specific user's promotion state, audit log, and downline progress.
 */
promotionRouter.get('/ranks/user/:userId', requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const state = await getUserPromotionState(userId);
    const auditLogs = await getUserPromotionAuditLogs(userId);
    return res.status(200).json({ success: true, state, auditLogs });
  } catch (err: any) {
    console.error('[Admin Promotion API] Error inspecting user rank state:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to inspect user rank state' });
  }
});

/**
 * POST /api/promotions/ranks/evaluate/:userId
 * Admin evaluates a specific user's next rank.
 */
promotionRouter.post('/ranks/evaluate/:userId', requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const result = await evaluateUserRankPromotion(userId);
    return res.status(200).json({ success: true, result });
  } catch (err: any) {
    console.error('[Admin Promotion API] Error evaluating user rank:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message || 'Evaluation failed' });
  }
});

/**
 * POST /api/promotions/ranks/admin/correct
 * Admin manual rank correction with mandatory reason and immutable audit log.
 */
promotionRouter.post('/ranks/admin/correct', requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const admin = req.user!;
    const { userId, targetRank, reason } = req.body || {};

    if (!userId || !targetRank || !reason || String(reason).trim().length < 5) {
      return res.status(400).json({ error: 'INVALID_INPUT', message: 'userId, targetRank, and reason (min 5 chars) are required.' });
    }

    const state = await adminManualRankCorrection(admin.id, admin.public_id, userId, targetRank, String(reason).trim());
    return res.status(200).json({ success: true, state });
  } catch (err: any) {
    console.error('[Admin Promotion API] Error in rank correction:', err);
    return res.status(err.statusCode || 500).json({ error: err.code || 'SERVER_ERROR', message: err.message });
  }
});

/**
 * GET /api/promotions/me
 */
promotionRouter.get('/me', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const summary = await evaluateUserPromotions(userId);
    return res.status(200).json(summary);
  } catch (err: any) {
    console.error('[Promotion API] Error in GET /api/promotions/me:', err);
    return res.status(500).json({ error: 'Failed to retrieve promotion status' });
  }
});

// ----------------------------------------------------------------------------
// USER FRONTEND ENDPOINTS (Authenticated Users)
// ----------------------------------------------------------------------------

/**
 * GET /api/promotions/offers
 * Returns only active, non-expired offers.
 */
promotionRouter.get('/offers', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const offers = await getPromotionalOffers(false);
    return res.status(200).json({ success: true, offers });
  } catch (err: any) {
    console.error('[Promotion API] Error fetching offers:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to retrieve promotional offers.' });
  }
});

/**
 * POST /api/promotions/offers/:id/claim-and-pay
 * Claim and pay for an active promotional offer using user's available deposit or wallet balance.
 */
promotionRouter.post('/offers/:id/claim-and-pay', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    const offerId = req.params.id;
    const preferredAsset = (req.body?.preferredAsset === 'BNB' ? 'BNB' : 'USDT') as 'USDT' | 'BNB';

    const result = await claimAndPayPromotionalOffer(user.id, offerId, preferredAsset);
    return res.status(200).json(result);
  } catch (err: any) {
    console.error('[Promotion API] Error claiming offer:', err);
    return res.status(400).json({
      success: false,
      error: 'CLAIM_FAILED',
      message: err.message || 'Failed to claim and pay for promotional offer.',
    });
  }
});

/**
 * GET /api/promotions/banners
 * Returns active promotional slider/banner scheduled for now.
 */
promotionRouter.get('/banners', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const banners = await getPromotionalBanners(false);
    return res.status(200).json({ success: true, banners });
  } catch (err: any) {
    console.error('[Promotion API] Error fetching banners:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to retrieve banners.' });
  }
});

/**
 * GET /api/promotions/leaderboard
 * Computes and returns privacy-safe performance leaderboard.
 */
promotionRouter.get('/leaderboard', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const settings = await getLeaderboardSettings();
    const leaderboard = await getLeaderboard(settings.metric);
    return res.status(200).json({ success: true, metric: settings.metric, leaderboard });
  } catch (err: any) {
    console.error('[Promotion API] Error fetching leaderboard:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to retrieve performance leaderboard.' });
  }
});

/**
 * GET /api/promotions/performance-popup
 * Returns synchronized user highlight for top performers.
 */
promotionRouter.get('/performance-popup', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const popupData = await getPerformancePopupData();
    return res.status(200).json({ success: true, popup: popupData });
  } catch (err: any) {
    console.error('[Promotion API] Error fetching performance popup data:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to retrieve performance popup.' });
  }
});


// ----------------------------------------------------------------------------
// ADMIN MANAGEMENT ENDPOINTS (Enforce requireAdmin)
// ----------------------------------------------------------------------------

/**
 * GET /api/promotions/admin/offers
 */
promotionRouter.get('/admin/offers', requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const offers = await getPromotionalOffers(true);
    return res.status(200).json({ success: true, offers });
  } catch (err: any) {
    console.error('[Admin Promotion API] Error fetching offers:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to retrieve all offers.' });
  }
});

/**
 * POST /api/promotions/admin/offers
 */
promotionRouter.post('/admin/offers', requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const admin = req.user!;
    const {
      title,
      description,
      bannerImage,
      offerType,
      bonusNodesCount,
      bonusMiningRewards,
      bonusMatchingEnabled,
      bonusReferralCommission,
      startDate,
      endDate,
      status,
      targetAudience,
      priorityOrder
    } = req.body || {};

    if (!title || !description || !bannerImage || !startDate || !endDate || !status || !targetAudience || typeof priorityOrder !== 'number') {
      return res.status(400).json({ error: 'INVALID_INPUT', message: 'All offer fields are required.' });
    }

    const created = await createPromotionalOffer(admin.id, admin.public_id, {
      title,
      description,
      bannerImage,
      offerType: offerType || 'BOGO_FREE_NODE',
      bonusNodesCount: typeof bonusNodesCount === 'number' ? bonusNodesCount : 1,
      bonusMiningRewards: bonusMiningRewards !== false,
      bonusMatchingEnabled: Boolean(bonusMatchingEnabled),
      bonusReferralCommission: Boolean(bonusReferralCommission),
      startDate,
      endDate,
      status,
      targetAudience,
      priorityOrder
    });

    broadcastSystemConfigChange('PROMOTIONAL_OFFERS_UPDATED', { timestamp: new Date().toISOString() });

    return res.status(201).json({ success: true, offer: created });
  } catch (err: any) {
    console.error('[Admin Promotion API] Error creating offer:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to create promotional offer.' });
  }
});

/**
 * PUT /api/promotions/admin/offers/:id
 */
promotionRouter.put('/admin/offers/:id', requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const admin = req.user!;
    const { id } = req.params;
    const {
      title,
      description,
      bannerImage,
      offerType,
      bonusNodesCount,
      bonusMiningRewards,
      bonusMatchingEnabled,
      bonusReferralCommission,
      startDate,
      endDate,
      status,
      targetAudience,
      priorityOrder
    } = req.body || {};

    if (!title || !description || !bannerImage || !startDate || !endDate || !status || !targetAudience || typeof priorityOrder !== 'number') {
      return res.status(400).json({ error: 'INVALID_INPUT', message: 'All offer fields are required.' });
    }

    const updated = await updatePromotionalOffer(admin.id, admin.public_id, id, {
      title,
      description,
      bannerImage,
      offerType: offerType || 'BOGO_FREE_NODE',
      bonusNodesCount: typeof bonusNodesCount === 'number' ? bonusNodesCount : 1,
      bonusMiningRewards: bonusMiningRewards !== false,
      bonusMatchingEnabled: Boolean(bonusMatchingEnabled),
      bonusReferralCommission: Boolean(bonusReferralCommission),
      startDate,
      endDate,
      status,
      targetAudience,
      priorityOrder
    });

    broadcastSystemConfigChange('PROMOTIONAL_OFFERS_UPDATED', { timestamp: new Date().toISOString() });

    return res.status(200).json({ success: true, offer: updated });
  } catch (err: any) {
    console.error('[Admin Promotion API] Error updating offer:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to update promotional offer.' });
  }
});

/**
 * DELETE /api/promotions/admin/offers/:id
 */
promotionRouter.delete('/admin/offers/:id', requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const admin = req.user!;
    const { id } = req.params;
    const deleted = await deletePromotionalOffer(admin.id, admin.public_id, id);
    if (!deleted) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Promotional offer not found.' });
    }

    broadcastSystemConfigChange('PROMOTIONAL_OFFERS_UPDATED', { timestamp: new Date().toISOString() });

    return res.status(200).json({ success: true, id });
  } catch (err: any) {
    console.error('[Admin Promotion API] Error deleting offer:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to delete promotional offer.' });
  }
});

/**
 * GET /api/promotions/admin/banners
 */
promotionRouter.get('/admin/banners', requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const banners = await getPromotionalBanners(true);
    return res.status(200).json({ success: true, banners });
  } catch (err: any) {
    console.error('[Admin Promotion API] Error fetching banners:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to retrieve all banners.' });
  }
});

/**
 * POST /api/promotions/admin/banners
 */
promotionRouter.post('/admin/banners', requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const admin = req.user!;
    const { content, imageUrl, ctaText, ctaDestination, displayOrder, status, startDate, endDate } = req.body || {};

    if (!content || !imageUrl || !ctaText || !ctaDestination || typeof displayOrder !== 'number' || !status || !startDate || !endDate) {
      return res.status(400).json({ error: 'INVALID_INPUT', message: 'All banner fields are required.' });
    }

    const created = await createPromotionalBanner(admin.id, admin.public_id, {
      content,
      imageUrl,
      ctaText,
      ctaDestination,
      displayOrder,
      status,
      startDate,
      endDate
    });

    broadcastSystemConfigChange('PROMOTIONAL_BANNERS_UPDATED', { timestamp: new Date().toISOString() });

    return res.status(201).json({ success: true, banner: created });
  } catch (err: any) {
    console.error('[Admin Promotion API] Error creating banner:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to create banner.' });
  }
});

/**
 * PUT /api/promotions/admin/banners/:id
 */
promotionRouter.put('/admin/banners/:id', requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const admin = req.user!;
    const { id } = req.params;
    const { content, imageUrl, ctaText, ctaDestination, displayOrder, status, startDate, endDate } = req.body || {};

    if (!content || !imageUrl || !ctaText || !ctaDestination || typeof displayOrder !== 'number' || !status || !startDate || !endDate) {
      return res.status(400).json({ error: 'INVALID_INPUT', message: 'All banner fields are required.' });
    }

    const updated = await updatePromotionalBanner(admin.id, admin.public_id, id, {
      content,
      imageUrl,
      ctaText,
      ctaDestination,
      displayOrder,
      status,
      startDate,
      endDate
    });

    broadcastSystemConfigChange('PROMOTIONAL_BANNERS_UPDATED', { timestamp: new Date().toISOString() });

    return res.status(200).json({ success: true, banner: updated });
  } catch (err: any) {
    console.error('[Admin Promotion API] Error updating banner:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to update banner.' });
  }
});

/**
 * DELETE /api/promotions/admin/banners/:id
 */
promotionRouter.delete('/admin/banners/:id', requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const admin = req.user!;
    const { id } = req.params;
    const deleted = await deletePromotionalBanner(admin.id, admin.public_id, id);
    if (!deleted) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Promotional banner not found.' });
    }

    broadcastSystemConfigChange('PROMOTIONAL_BANNERS_UPDATED', { timestamp: new Date().toISOString() });

    return res.status(200).json({ success: true, id });
  } catch (err: any) {
    console.error('[Admin Promotion API] Error deleting banner:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to delete banner.' });
  }
});

/**
 * GET /api/promotions/admin/settings
 * Returns combined settings for leaderboard and popup.
 */
promotionRouter.get('/admin/settings', requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const leaderboard = await getLeaderboardSettings();
    const popup = await getPerformancePopupSettings();
    return res.status(200).json({ success: true, settings: { leaderboard, popup } });
  } catch (err: any) {
    console.error('[Admin Promotion API] Error fetching settings:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to retrieve configuration settings.' });
  }
});

/**
 * POST /api/promotions/admin/settings/leaderboard
 */
promotionRouter.post('/admin/settings/leaderboard', requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const admin = req.user!;
    const { metric } = req.body || {};

    if (!['DIRECT_REFERRALS', 'NODE_SALES', 'BINARY_VOLUME', 'MATCHING_PERFORMANCE'].includes(metric)) {
      return res.status(400).json({ error: 'INVALID_INPUT', message: 'Invalid performance metric.' });
    }

    const updatedMetric = await updateLeaderboardSettings(admin.id, admin.public_id, metric);
    return res.status(200).json({ success: true, metric: updatedMetric });
  } catch (err: any) {
    console.error('[Admin Promotion API] Error updating leaderboard settings:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to update leaderboard settings.' });
  }
});

/**
 * POST /api/promotions/admin/settings/popup
 */
promotionRouter.post('/admin/settings/popup', requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const admin = req.user!;
    const { enabled, metric, topCount, durationSeconds } = req.body || {};

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'INVALID_INPUT', message: 'enabled must be a boolean.' });
    }
    if (!['DIRECT_REFERRALS', 'NODE_SALES', 'BINARY_VOLUME', 'MATCHING_PERFORMANCE'].includes(metric)) {
      return res.status(400).json({ error: 'INVALID_INPUT', message: 'Invalid performance metric.' });
    }
    if (typeof topCount !== 'number' || topCount <= 0 || topCount > 10) {
      return res.status(400).json({ error: 'INVALID_INPUT', message: 'topCount must be between 1 and 10.' });
    }
    if (typeof durationSeconds !== 'number' || durationSeconds <= 0) {
      return res.status(400).json({ error: 'INVALID_INPUT', message: 'durationSeconds must be positive.' });
    }

    const updated = await updatePerformancePopupSettings(admin.id, admin.public_id, {
      enabled,
      metric,
      topCount,
      durationSeconds
    });

    return res.status(200).json({ success: true, popup: updated });
  } catch (err: any) {
    console.error('[Admin Promotion API] Error updating popup settings:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to update popup settings.' });
  }
});

