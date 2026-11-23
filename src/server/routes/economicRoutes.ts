import { Router, Request, Response } from 'express';
import { requireAdmin, AuthRequest } from '../middleware/authMiddleware';
import { adminFinancialLimiter } from '../middleware/rateLimiter';
import {
  getAllEconomicConfigs,
  getEconomicConfigByKey,
  updateEconomicConfig,
  getEconomicAuditLogs,
  getInternalCoinPrice,
} from '../services/economicService';
import { logAdminAction } from '../services/adminService';

export const publicEconomicRouter = Router();

/**
 * GET /api/economic/token-price
 * Authoritative public endpoint returning real-time PHIVO token price from active economic configuration.
 */
publicEconomicRouter.get('/token-price', async (_req: Request, res: Response) => {
  try {
    const coinConfig = await getInternalCoinPrice();
    res.setHeader('Cache-Control', 'public, max-age=5');
    return res.status(200).json({
      success: true,
      priceUsd: coinConfig.priceUsdt ?? 0.10,
      coinSymbol: coinConfig.coinSymbol || 'PHIVO',
      source: 'INTERNAL_ECONOMIC_ORACLE',
      updatedAt: coinConfig.effectiveFrom || new Date().toISOString(),
      swapEnabled: coinConfig.swapEnabled,
      configured: coinConfig.configured,
    });
  } catch (err: any) {
    console.error('[Economic API] Error fetching token price:', err);
    return res.status(500).json({
      error: 'SERVER_ERROR',
      message: 'Failed to retrieve token price',
    });
  }
});

/**
 * Helper to extract numeric daily reward rate from NODE_REWARD_RATE_PER_EPOCH value.
 */
function parseRewardRateValue(rawVal: any): number | null {
  if (rawVal === null || rawVal === undefined) return null;
  if (typeof rawVal === 'object') {
    const n = Number(
      rawVal.ratePhivo !== undefined
        ? rawVal.ratePhivo
        : rawVal.rateUsd !== undefined
        ? rawVal.rateUsd
        : rawVal.rewardPerNode !== undefined
        ? rawVal.rewardPerNode
        : NaN
    );
    return !isNaN(n) && n > 0 ? n : null;
  }
  const n = Number(rawVal);
  return !isNaN(n) && n > 0 ? n : null;
}

/**
 * GET /api/economic/public
 * Lightweight public snapshot consumed by dashboard Overview cards and trend charts.
 */
publicEconomicRouter.get('/public', async (_req: Request, res: Response) => {
  try {
    const configs = await getAllEconomicConfigs();
    const byKey: Record<string, any> = {};
    for (const c of configs) {
      byKey[c.configKey] = c;
    }

    const coinCfg = byKey['INTERNAL_COIN_PRICE_USDT'];
    const coinVal = coinCfg?.status === 'ACTIVE' ? (coinCfg.configValue || {}) : {};
    const phivoPriceUsd = Number(coinVal.priceUsdt) > 0 ? Number(coinVal.priceUsdt) : 0.10;
    const coinSymbol = coinVal.coinSymbol || 'PHIVO';
    const swapSwitchCfg = byKey['INTERNAL_COIN_SWAP_ENABLED'];
    const swapEnabled =
      coinCfg?.status === 'ACTIVE' &&
      coinVal.swapEnabled !== false &&
      Number(coinVal.priceUsdt) > 0 &&
      (swapSwitchCfg ? swapSwitchCfg.status === 'ACTIVE' && swapSwitchCfg.configValue !== false : true);

    const rewardsCfg = byKey['NODE_REWARDS_ENABLED'];
    const nodeRewardsEnabled = rewardsCfg ? rewardsCfg.status === 'ACTIVE' && rewardsCfg.configValue !== false : true;
    const rewardRateCfg = byKey['NODE_REWARD_RATE_PER_EPOCH'];
    const dailyEmissionRate =
      rewardRateCfg && rewardRateCfg.status === 'ACTIVE' ? parseRewardRateValue(rewardRateCfg.configValue) : null;

    const basePriceCfg = byKey['NODE_BASE_PRICE_USD'];
    const nodeBasePriceUsd = typeof basePriceCfg?.configValue === 'number' ? basePriceCfg.configValue : 1000;
    const refCfg = byKey['DIRECT_REFERRAL_COMMISSION_USD'];
    const directReferralCommissionUsd = typeof refCfg?.configValue === 'number' ? refCfg.configValue : 50;

    res.setHeader('Cache-Control', 'public, max-age=5');
    return res.status(200).json({
      success: true,
      phivoPriceUsd,
      coinSymbol,
      swapEnabled,
      nodeRewardsEnabled,
      nodeBasePriceUsd,
      directReferralCommissionUsd,
      dailyEmissionRate,
    });
  } catch (err: any) {
    console.error('[Economic API] Error in GET /public:', err);
    return res.status(500).json({
      error: 'SERVER_ERROR',
      message: 'Failed to retrieve public economic snapshot',
    });
  }
});

/**
 * GET /api/economic/platform-settings
 * Authoritative public snapshot of all user-facing protocol settings & features.
 */
publicEconomicRouter.get('/platform-settings', async (_req: Request, res: Response) => {
  try {
    const configs = await getAllEconomicConfigs();
    const byKey: Record<string, any> = {};
    for (const c of configs) {
      byKey[c.configKey] = c;
    }

    const isSwitchActive = (key: string, defaultVal: boolean): boolean => {
      const c = byKey[key];
      if (!c) return defaultVal;
      return c.status === 'ACTIVE' && c.configValue !== false;
    };

    const coinCfg = byKey['INTERNAL_COIN_PRICE_USDT'];
    const coinVal = coinCfg?.status === 'ACTIVE' ? (coinCfg.configValue || {}) : {};
    const coinPrice = Number(coinVal.priceUsdt) > 0 ? Number(coinVal.priceUsdt) : 0.10;
    const coinSymbol = coinVal.coinSymbol || 'PHIVO';
    const swapEnabled =
      isSwitchActive('INTERNAL_COIN_SWAP_ENABLED', true) &&
      coinCfg?.status === 'ACTIVE' &&
      Number(coinVal.priceUsdt) > 0 &&
      coinVal.swapEnabled !== false;

    const cryptoDepositsEnabled = isSwitchActive('CRYPTO_DEPOSITS_ENABLED', true);
    const cryptoWithdrawalsEnabled = isSwitchActive('CRYPTO_WITHDRAWALS_ENABLED', true);
    const nodeRewardsEnabled = isSwitchActive('NODE_REWARDS_ENABLED', true);
    const autoWithdrawalEnabled = isSwitchActive('AUTO_WITHDRAWAL_ENABLED', false);

    const minWdCfg = byKey['MIN_WITHDRAWAL_AMOUNT'];
    const minWithdrawalAmount = typeof minWdCfg?.configValue === 'number' ? minWdCfg.configValue : 0.10;

    const basePriceCfg = byKey['NODE_BASE_PRICE_USD'];
    const nodeBasePriceUsd = typeof basePriceCfg?.configValue === 'number' ? basePriceCfg.configValue : 1000;

    const directRefCfg = byKey['DIRECT_REFERRAL_COMMISSION_USD'];
    const directReferralCommissionRate = typeof directRefCfg?.configValue === 'number' ? directRefCfg.configValue : 50;

    const rewardRateCfg = byKey['NODE_REWARD_RATE_PER_EPOCH'];
    const nodeRewardRatePerEpoch =
      rewardRateCfg && rewardRateCfg.status === 'ACTIVE' ? parseRewardRateValue(rewardRateCfg.configValue) : null;

    const automationCfg = byKey['DAILY_REWARD_AUTOMATION'];
    const dailyRewardAutomation = automationCfg?.configValue || null;

    res.setHeader('Cache-Control', 'public, max-age=5');
    return res.status(200).json({
      success: true,
      settings: {
        coinPriceUsdt: coinPrice,
        coinSymbol,
        internalCoinSwapEnabled: swapEnabled,
        cryptoDepositsEnabled,
        cryptoWithdrawalsEnabled,
        nodeRewardsEnabled,
        nodeRewardRatePerEpoch,
        dailyRewardAutomation,
        minWithdrawalAmount,
        autoWithdrawalEnabled,
        nodeBasePriceUsd,
        directReferralCommissionRate,
        updatedAt: new Date().toISOString(),
      },
    });
  } catch (err: any) {
    console.error('[Economic API] Error fetching platform settings:', err);
    return res.status(500).json({
      error: 'SERVER_ERROR',
      message: 'Failed to retrieve platform settings',
    });
  }
});

export const economicRouter = Router();

// Enforce requireAdmin on ALL economic configuration routes
economicRouter.use(requireAdmin);

/**
 * GET /api/admin/economics/configs
 * Retrieve all system economic configurations grouped by category.
 */
economicRouter.get('/configs', async (req: AuthRequest, res: Response) => {
  try {
    const configs = await getAllEconomicConfigs();
    return res.status(200).json({ configs });
  } catch (err: any) {
    console.error('[Economic API] Error fetching configs:', err);
    return res.status(500).json({
      error: 'SERVER_ERROR',
      message: 'Failed to retrieve system economic configurations.',
    });
  }
});

/**
 * GET /api/admin/economics/configs/:key
 * Retrieve single economic parameter.
 */
economicRouter.get('/configs/:key', async (req: AuthRequest, res: Response) => {
  try {
    const { key } = req.params;
    const config = await getEconomicConfigByKey(key);
    if (!config) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: `Economic configuration parameter '${key}' was not found.`,
      });
    }
    return res.status(200).json({ config });
  } catch (err: any) {
    console.error('[Economic API] Error fetching config by key:', err);
    return res.status(500).json({
      error: 'SERVER_ERROR',
      message: 'Failed to retrieve economic configuration.',
    });
  }
});

/**
 * PUT /api/admin/economics/configs/:key
 * Update an economic configuration parameter with versioning, immutability check, and audit trail.
 */
economicRouter.put('/configs/:key', adminFinancialLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const { key } = req.params;
    const { value, status, effectiveFrom, reason } = req.body;

    if (value === undefined) {
      return res.status(400).json({
        error: 'BAD_REQUEST',
        message: 'Missing configuration value parameter.',
      });
    }

    const adminUserId = req.user?.id || null;
    const adminPublicId = req.user?.public_id || 'SYSTEM_ADMIN';
    const ipAddress = (req.headers['x-forwarded-for'] as string) || req.ip;

    const { config, auditLog } = await updateEconomicConfig({
      configKey: key,
      configValue: value,
      status: status as any,
      effectiveFrom: effectiveFrom ? String(effectiveFrom) : undefined,
      reason: reason ? String(reason) : undefined,
      adminUserId,
      adminPublicId,
      ipAddress,
    });

    // Also log general admin security audit trail
    await logAdminAction({
      adminUserId,
      adminPublicId,
      action: `ECONOMIC_CONFIG_UPDATED_${key.toUpperCase()}`,
      targetType: 'ECONOMIC_CONFIG',
      targetId: key.toUpperCase(),
      details: `Admin ${adminPublicId} updated ${key.toUpperCase()} to version ${config.version} (Status: ${config.status}).`,
      metadata: {
        key: key.toUpperCase(),
        version: config.version,
        oldValue: auditLog.oldValue,
        newValue: auditLog.newValue,
        effectiveFrom: config.effectiveFrom,
        reason: auditLog.reason,
      },
      ipAddress,
    });

    return res.status(200).json({
      success: true,
      config,
      auditLog,
      message: `Economic parameter '${key}' successfully updated to version ${config.version}.`,
    });
  } catch (err: any) {
    console.error('[Economic API] Error updating config:', err);
    const msg = err.message || 'Failed to update economic configuration.';
    if (msg.startsWith('IMMUTABLE_PARAMETER_ERROR')) {
      return res.status(403).json({ error: 'IMMUTABLE_PARAMETER_ERROR', message: msg });
    }
    if (msg.startsWith('INVALID_VALUE') || msg.startsWith('BAD_REQUEST')) {
      return res.status(400).json({ error: 'INVALID_VALUE', message: msg });
    }
    if (msg.startsWith('NOT_FOUND')) {
      return res.status(404).json({ error: 'NOT_FOUND', message: msg });
    }
    return res.status(500).json({
      error: 'SERVER_ERROR',
      message: msg,
    });
  }
});

/**
 * GET /api/admin/economics/audit-logs
 * Retrieve versioned audit history of economic parameter adjustments.
 */
economicRouter.get('/audit-logs', async (req: AuthRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 20;
    const configKey = (req.query.configKey as string) || undefined;

    const data = await getEconomicAuditLogs(page, limit, configKey);
    return res.status(200).json(data);
  } catch (err: any) {
    console.error('[Economic API] Error fetching audit logs:', err);
    return res.status(500).json({
      error: 'SERVER_ERROR',
      message: 'Failed to retrieve economic audit trail.',
    });
  }
});
