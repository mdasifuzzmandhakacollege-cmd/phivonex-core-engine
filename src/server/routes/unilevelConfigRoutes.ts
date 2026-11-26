import { Router, Request, Response } from 'express';
import { requireAdmin, AuthRequest } from '../middleware/authMiddleware';
import {
  getEcosystemMasterConfig,
  getEcosystemFeatureSwitches,
  updateEcosystemFeatureSwitch,
  setDailyTradingYieldRate,
  updateTradingPoolTier,
  updateChronoVaultPlanRate,
  updateUnilevelGenerationConfig,
  updateUnilevelLeadershipRank,
  updateCircuitBreakerConfig,
  updateMasterConfigNumeric,
  getEcosystemPromoBanners,
  createEcosystemPromoBanner,
  updateEcosystemPromoBanner,
  deleteEcosystemPromoBanner,
  PromoAccentTheme,
  TradingTierCode,
  ChronoVaultPlanCode,
  WithdrawalCircuitMode,
  EcosystemFeatureSwitchKey,
} from '../services/unilevelConfigService';

export const adminUnilevelConfigRouter = Router();
export const publicUnilevelConfigRouter = Router();
export const publicEcosystemPromosRouter = Router();
export const adminEcosystemPromosRouter = Router();

// Enforce strict Admin RBAC on all admin configuration routes
adminUnilevelConfigRouter.use(requireAdmin);

/**
 * GET /api/public/ecosystem-config
 * Public read-only endpoint returning active product tiers, vault plans, 16-generation schedule, 7 leadership ranks,
 * Genesis Core economics, and live protocol feature switch states.
 */
publicUnilevelConfigRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const config = await getEcosystemMasterConfig();
    return res.status(200).json({
      success: true,
      featureSwitches: config.featureSwitchesMap,
      withdrawalMode: config.circuitBreaker.withdrawalMode,
      genesisCoreEconomics: config.genesisCoreEconomics,
      alphaRedemptionFeePct: config.alphaRedemptionFeePct,
      p2pTransferFeePct: config.p2pTransferFeePct,
      tradingPoolTiers: config.tradingPoolTiers.filter((t) => t.isActive),
      chronoVaultPlans: config.chronoVaultPlans.filter((p) => p.isActive),
      unilevelGenerations: config.unilevelGenerations,
      totalUnilevelCommissionPct: config.totalUnilevelCommissionPct,
      leadershipRanks: config.leadershipRanks,
    });
  } catch (err: any) {
    console.error('[Public Ecosystem Config API] Error:', err);
    return res.status(500).json({
      error: 'SERVER_ERROR',
      message: 'Failed to load ecosystem configuration.',
    });
  }
});

/**
 * GET /api/admin/ecosystem-config
 * Admin-only endpoint returning full master configurations, feature switches, circuit breaker state, and recent security audit logs.
 */
adminUnilevelConfigRouter.get('/', async (_req: AuthRequest, res: Response) => {
  try {
    const config = await getEcosystemMasterConfig();
    return res.status(200).json({
      success: true,
      ...config,
    });
  } catch (err: any) {
    console.error('[Admin Ecosystem Config API] Error fetching master config:', err);
    return res.status(500).json({
      error: 'SERVER_ERROR',
      message: 'Failed to retrieve ecosystem master configuration.',
    });
  }
});

/**
 * GET /api/admin/ecosystem-config/feature-switches
 * Admin-only endpoint returning all 11 master ecosystem ON/OFF switches.
 */
adminUnilevelConfigRouter.get('/feature-switches', async (_req: AuthRequest, res: Response) => {
  try {
    const featureSwitches = await getEcosystemFeatureSwitches();
    return res.status(200).json({
      success: true,
      featureSwitches,
    });
  } catch (err: any) {
    console.error('[Admin Ecosystem Config API] Error fetching feature switches:', err);
    return res.status(500).json({
      error: 'SERVER_ERROR',
      message: 'Failed to retrieve master ecosystem feature switches.',
    });
  }
});

/**
 * PUT /api/admin/ecosystem-config/feature-switches/:switchKey
 * Admin-only endpoint toggling any master ecosystem ON/OFF switch with mandatory security_audit_logs recording.
 */
adminUnilevelConfigRouter.put('/feature-switches/:switchKey', async (req: AuthRequest, res: Response) => {
  try {
    const switchKey = String(req.params.switchKey || '').trim() as EcosystemFeatureSwitchKey;
    const { isEnabled, reason } = req.body || {};

    if (typeof isEnabled !== 'boolean') {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'isEnabled must be a boolean value (true or false).',
      });
    }

    const updated = await updateEcosystemFeatureSwitch({
      switchKey,
      isEnabled,
      reason: reason ? String(reason) : null,
      adminUserId: req.user?.id || null,
    });

    return res.status(200).json({
      success: true,
      featureSwitch: updated,
    });
  } catch (err: any) {
    console.error('[Admin Ecosystem Config API] Error toggling feature switch:', err);
    return res.status(400).json({
      error: 'FEATURE_SWITCH_UPDATE_ERROR',
      message: err?.message || 'Failed to update ecosystem feature switch.',
    });
  }
});

/**
 * PUT /api/admin/ecosystem-config/master-config/:configKey
 * Admin-only endpoint updating numeric master configs (e.g. alpha_redemption_fee_pct).
 */
adminUnilevelConfigRouter.put('/master-config/:configKey', async (req: AuthRequest, res: Response) => {
  try {
    const configKey = String(req.params.configKey || '').trim();
    const { configValue } = req.body || {};

    if (configValue === undefined || configValue === null || configValue === '') {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'configValue is required.',
      });
    }

    const updated = await updateMasterConfigNumeric({
      configKey,
      configValue,
      adminUserId: req.user?.id || null,
    });

    return res.status(200).json({
      success: true,
      masterConfig: updated,
    });
  } catch (err: any) {
    console.error('[Admin Ecosystem Config API] Error updating master config:', err);
    return res.status(400).json({
      error: 'MASTER_CONFIG_UPDATE_ERROR',
      message: err?.message || 'Failed to update master configuration.',
    });
  }
});

/**
 * POST /api/admin/ecosystem-config/trading-yield-rate
 * Upserts a daily trading yield rate for a specific trading pool tier and UTC date.
 */
adminUnilevelConfigRouter.post('/trading-yield-rate', async (req: AuthRequest, res: Response) => {
  try {
    const { tradingDate, tierCode, yieldRatePct, notes, allowOverride } = req.body || {};
    if (!tradingDate || !tierCode || yieldRatePct === undefined) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'tradingDate, tierCode, and yieldRatePct are required.',
      });
    }

    const record = await setDailyTradingYieldRate({
      tradingDate: String(tradingDate),
      tierCode: String(tierCode) as TradingTierCode,
      yieldRatePct,
      adminUserId: req.user?.id || null,
      notes: notes ? String(notes) : null,
      allowOverride: Boolean(allowOverride),
    });

    return res.status(200).json({
      success: true,
      dailyYieldRate: record,
    });
  } catch (err: any) {
    console.error('[Admin Ecosystem Config API] Error setting daily trading yield rate:', err);
    return res.status(400).json({
      error: 'CONFIG_UPDATE_ERROR',
      message: err?.message || 'Failed to set daily trading yield rate.',
    });
  }
});

/**
 * PUT /api/admin/ecosystem-config/trading-tier/:tierCode
 * Updates min/max amount or daily rate range for an Algorithmic Trading Pool tier.
 */
adminUnilevelConfigRouter.put('/trading-tier/:tierCode', async (req: AuthRequest, res: Response) => {
  try {
    const tierCode = String(req.params.tierCode || '').toUpperCase() as TradingTierCode;
    const { minAmount, maxAmount, minDailyRatePct, maxDailyRatePct, isActive } = req.body || {};

    const updated = await updateTradingPoolTier({
      tierCode,
      minAmount,
      maxAmount,
      minDailyRatePct,
      maxDailyRatePct,
      isActive,
      adminUserId: req.user?.id || null,
    });

    return res.status(200).json({
      success: true,
      tier: updated,
    });
  } catch (err: any) {
    console.error('[Admin Ecosystem Config API] Error updating trading pool tier:', err);
    return res.status(400).json({
      error: 'CONFIG_UPDATE_ERROR',
      message: err?.message || 'Failed to update trading pool tier.',
    });
  }
});

/**
 * PUT /api/admin/ecosystem-config/chrono-vault/:planCode
 * Updates daily yield percentage rate, minimum stake amount, or active status for a Chrono Vault plan.
 */
adminUnilevelConfigRouter.put('/chrono-vault/:planCode', async (req: AuthRequest, res: Response) => {
  try {
    const planCode = String(req.params.planCode || '').toUpperCase() as ChronoVaultPlanCode;
    const { dailyRatePct, minAmount, isActive } = req.body || {};

    const updated = await updateChronoVaultPlanRate({
      planCode,
      dailyRatePct,
      minAmount,
      isActive,
      adminUserId: req.user?.id || null,
    });

    return res.status(200).json({
      success: true,
      plan: updated,
    });
  } catch (err: any) {
    console.error('[Admin Ecosystem Config API] Error updating Chrono Vault plan:', err);
    return res.status(400).json({
      error: 'CONFIG_UPDATE_ERROR',
      message: err?.message || 'Failed to update Chrono Vault plan.',
    });
  }
});

/**
 * PUT /api/admin/ecosystem-config/unilevel-generation/:level
 * Updates commission percentage or qualification thresholds for a Unilevel Generation (1..16).
 */
adminUnilevelConfigRouter.put('/unilevel-generation/:level', async (req: AuthRequest, res: Response) => {
  try {
    const generationLevel = parseInt(String(req.params.level || ''), 10);
    const { commissionPct, minPersonalActiveUsd, minDirectActiveReferrals, isActive } = req.body || {};

    const updated = await updateUnilevelGenerationConfig({
      generationLevel,
      commissionPct,
      minPersonalActiveUsd,
      minDirectActiveReferrals,
      isActive,
      adminUserId: req.user?.id || null,
    });

    return res.status(200).json({
      success: true,
      generation: updated,
    });
  } catch (err: any) {
    console.error('[Admin Ecosystem Config API] Error updating Unilevel generation config:', err);
    return res.status(400).json({
      error: 'CONFIG_UPDATE_ERROR',
      message: err?.message || 'Failed to update Unilevel generation config.',
    });
  }
});

/**
 * PUT /api/admin/ecosystem-config/leadership-rank/:rankLevel
 * Updates volume requirements, leg cap, or milestone reward for a Unilevel Leadership Rank (0..6).
 */
adminUnilevelConfigRouter.put('/leadership-rank/:rankLevel', async (req: AuthRequest, res: Response) => {
  try {
    const rankLevel = parseInt(String(req.params.rankLevel || ''), 10);
    const {
      requiredPersonalVolumeUsd,
      requiredTeamVolumeUsd,
      maxSingleLegCapPct,
      requiredDirectActiveLegs,
      requiredSubRankCode,
      requiredSubRankLegs,
      milestoneBonusUsd,
      globalPoolSharePct,
      rewardDescription,
      isActive,
    } = req.body || {};

    const updated = await updateUnilevelLeadershipRank({
      rankLevel,
      requiredPersonalVolumeUsd,
      requiredTeamVolumeUsd,
      maxSingleLegCapPct,
      requiredDirectActiveLegs,
      requiredSubRankCode,
      requiredSubRankLegs,
      milestoneBonusUsd,
      globalPoolSharePct,
      rewardDescription,
      isActive,
      adminUserId: req.user?.id || null,
    });

    return res.status(200).json({
      success: true,
      rank: updated,
    });
  } catch (err: any) {
    console.error('[Admin Ecosystem Config API] Error updating Unilevel leadership rank:', err);
    return res.status(400).json({
      error: 'CONFIG_UPDATE_ERROR',
      message: err?.message || 'Failed to update Unilevel leadership rank.',
    });
  }
});

/**
 * PUT /api/admin/ecosystem-config/circuit-breaker
 * Updates system circuit breaker thresholds and withdrawal mode (AUTO vs MANUAL_REVIEW).
 */
adminUnilevelConfigRouter.put('/circuit-breaker', async (req: AuthRequest, res: Response) => {
  try {
    const {
      minReserveRatio,
      maxHourlyOutflowUsd,
      maxUserDailyWithdrawalUsd,
      withdrawalMode,
      tripReason,
      resetTrip,
    } = req.body || {};

    const updated = await updateCircuitBreakerConfig({
      minReserveRatio,
      maxHourlyOutflowUsd,
      maxUserDailyWithdrawalUsd,
      withdrawalMode: withdrawalMode as WithdrawalCircuitMode | undefined,
      tripReason,
      resetTrip: Boolean(resetTrip),
      adminUserId: req.user?.id || null,
    });

    return res.status(200).json({
      success: true,
      circuitBreaker: updated,
    });
  } catch (err: any) {
    console.error('[Admin Ecosystem Config API] Error updating circuit breaker config:', err);
    return res.status(400).json({
      error: 'CONFIG_UPDATE_ERROR',
      message: err?.message || 'Failed to update system circuit breaker config.',
    });
  }
});

// ============================================================================
// PUBLIC & ADMIN ECOSYSTEM PROMO SPOTLIGHT ROUTES
// ============================================================================

/**
 * GET /api/ecosystem/promos
 * Returns active promo spotlight banners ordered by sort_order plus live Genesis Node supply telemetry.
 */
publicEcosystemPromosRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const data = await getEcosystemPromoBanners({ includeInactive: false });
    return res.status(200).json({
      success: true,
      promos: data.promos,
      genesisSupply: data.genesisSupply,
    });
  } catch (err: any) {
    console.error('[Public Ecosystem Promos API] Error:', err);
    return res.status(500).json({
      error: 'SERVER_ERROR',
      message: 'Failed to load ecosystem spotlight banners.',
    });
  }
});

adminEcosystemPromosRouter.use(requireAdmin);

/**
 * GET /api/admin/ecosystem-promos
 * Admin-only read of all spotlight banners (active & inactive).
 */
adminEcosystemPromosRouter.get('/', async (_req: AuthRequest, res: Response) => {
  try {
    const data = await getEcosystemPromoBanners({ includeInactive: true });
    return res.status(200).json({
      success: true,
      promos: data.promos,
      genesisSupply: data.genesisSupply,
    });
  } catch (err: any) {
    console.error('[Admin Ecosystem Promos API] Error fetching promos:', err);
    return res.status(500).json({
      error: 'SERVER_ERROR',
      message: 'Failed to load admin promo spotlight banners.',
    });
  }
});

/**
 * POST /api/admin/ecosystem-promos
 * Admin-only creation of a new Overview spotlight banner.
 */
adminEcosystemPromosRouter.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const {
      title,
      subtitle,
      badgeText,
      ctaLabel,
      targetTab,
      accentTheme,
      showNodeScarcity,
      isActive,
      sortOrder,
    } = req.body || {};

    const promo = await createEcosystemPromoBanner({
      title,
      subtitle,
      badgeText,
      ctaLabel,
      targetTab,
      accentTheme: accentTheme as PromoAccentTheme | undefined,
      showNodeScarcity,
      isActive,
      sortOrder,
      adminUserId: req.user?.id || null,
    });

    return res.status(201).json({
      success: true,
      promo,
    });
  } catch (err: any) {
    console.error('[Admin Ecosystem Promos API] Error creating promo:', err);
    return res.status(400).json({
      error: 'PROMO_CREATE_ERROR',
      message: err?.message || 'Failed to create promo banner.',
    });
  }
});

/**
 * PUT /api/admin/ecosystem-promos/:id
 * Admin-only update/toggle of an existing Overview spotlight banner.
 */
adminEcosystemPromosRouter.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id || '').trim();
    const {
      title,
      subtitle,
      badgeText,
      ctaLabel,
      targetTab,
      accentTheme,
      showNodeScarcity,
      isActive,
      sortOrder,
    } = req.body || {};

    const promo = await updateEcosystemPromoBanner({
      id,
      title,
      subtitle,
      badgeText,
      ctaLabel,
      targetTab,
      accentTheme: accentTheme as PromoAccentTheme | undefined,
      showNodeScarcity,
      isActive,
      sortOrder,
      adminUserId: req.user?.id || null,
    });

    return res.status(200).json({
      success: true,
      promo,
    });
  } catch (err: any) {
    console.error('[Admin Ecosystem Promos API] Error updating promo:', err);
    return res.status(400).json({
      error: 'PROMO_UPDATE_ERROR',
      message: err?.message || 'Failed to update promo banner.',
    });
  }
});

/**
 * DELETE /api/admin/ecosystem-promos/:id
 * Admin-only removal of an Overview spotlight banner.
 */
adminEcosystemPromosRouter.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id || '').trim();
    const result = await deleteEcosystemPromoBanner({
      id,
      adminUserId: req.user?.id || null,
    });

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (err: any) {
    console.error('[Admin Ecosystem Promos API] Error deleting promo:', err);
    return res.status(400).json({
      error: 'PROMO_DELETE_ERROR',
      message: err?.message || 'Failed to delete promo banner.',
    });
  }
});
