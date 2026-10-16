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
 * GET /api/economic/platform-settings
 * Authoritative public snapshot of all user-facing protocol settings & features.
 */
publicEconomicRouter.get('/platform-settings', async (_req: Request, res: Response) => {
  try {
    const configs = await getAllEconomicConfigs();
    const configMap: Record<string, any> = {};
    for (const c of configs) {
      configMap[c.configKey] = c.configValue;
    }

    const coinPrice = configMap['INTERNAL_COIN_PRICE_USDT']?.priceUsdt ?? 0.10;
    const coinSymbol = configMap['INTERNAL_COIN_PRICE_USDT']?.coinSymbol ?? 'PHIVO';
    const swapEnabled = configMap['INTERNAL_COIN_SWAP_ENABLED'] !== false && (configMap['INTERNAL_COIN_PRICE_USDT']?.swapEnabled !== false);
    const cryptoDepositsEnabled = configMap['CRYPTO_DEPOSITS_ENABLED'] !== false;
    const cryptoWithdrawalsEnabled = configMap['CRYPTO_WITHDRAWALS_ENABLED'] !== false;
    const nodeRewardsEnabled = configMap['NODE_REWARDS_ENABLED'] !== false;
    const minWithdrawalAmount = typeof configMap['MIN_WITHDRAWAL_AMOUNT'] === 'number' ? configMap['MIN_WITHDRAWAL_AMOUNT'] : 0.10;
    const autoWithdrawalEnabled = Boolean(configMap['AUTO_WITHDRAWAL_ENABLED']);
    const nodeBasePriceUsd = typeof configMap['NODE_BASE_PRICE_USD'] === 'number' ? configMap['NODE_BASE_PRICE_USD'] : 50.0;
    const directReferralCommissionRate = typeof configMap['REFERRAL_COMMISSION_RATE'] === 'number' ? configMap['REFERRAL_COMMISSION_RATE'] : 10;

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
