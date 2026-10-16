import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { requireAuth, requireAdmin, AuthRequest } from '../middleware/authMiddleware';
import { withdrawalLimiter, adminFinancialLimiter } from '../middleware/rateLimiter';
import { validateEvmAddress } from '../middleware/securityMiddleware';
import { hashToken } from '../utils/crypto';
import { getWalletSummary } from '../services/walletLedgerService';
import {
  createWithdrawalRequest,
  getUserWithdrawals,
  getWithdrawalByPublicId,
  cancelWithdrawalRequest,
  settleWithdrawalAction,
  getWithdrawalStateLogs,
  getSingleWithdrawalStateTimeline,
  getMinWithdrawalAmount,
} from '../services/withdrawalService';
import { broadcastBnbWithdrawal } from '../services/bscSignerService';
import { getDb } from '../db/db';
import { broadcastSystemConfigChange } from '../services/systemConfigBroadcaster';

export const withdrawalRouter = Router();

/**
 * POST /api/withdrawals/request-otp
 * Generates and dispatches a 6-digit withdrawal verification code to the user's email.
 */
withdrawalRouter.post('/request-otp', requireAuth, withdrawalLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const userEmail = req.user!.email;
    const { amount, destinationType, destinationReference } = req.body;

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || !isFinite(numAmount) || numAmount <= 0) {
      return res.status(400).json({
        error: 'INVALID_AMOUNT',
        message: 'Withdrawal amount must be a positive number greater than 0.',
      });
    }

    const minAmount = await getMinWithdrawalAmount();
    if (numAmount < minAmount) {
      return res.status(400).json({
        error: 'MINIMUM_WITHDRAWAL_REQUIRED',
        message: `Minimum withdrawal amount is $${minAmount.toFixed(2)} USD.`,
      });
    }

    const wallet = await getWalletSummary(userId);
    if (wallet.availableBalance < numAmount) {
      return res.status(400).json({
        error: 'INSUFFICIENT_BALANCE',
        message: `Insufficient balance. Available balance is $${wallet.availableBalance.toFixed(2)} USD.`,
      });
    }

    const destType = String(destinationType || 'USDT_BEP20').toUpperCase();
    if (destType === 'USDT_BEP20' || destType === 'BEP20' || destType === 'BNB' || destType === 'USDT_ERC20' || destType === 'ETH') {
      const addrCheck = validateEvmAddress(destinationReference);
      if (!addrCheck.valid) {
        return res.status(400).json({
          error: 'INVALID_DESTINATION_ADDRESS',
          message: addrCheck.error || 'Invalid destination wallet address (Must be a valid 0x... EVM / BNB Smart Chain address).',
        });
      }
    }

    const db = await getDb();

    // Invalidate previous unused withdrawal OTP tokens for this user
    await db.query(
      `UPDATE auth_tokens SET used_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND type = 'WITHDRAWAL_OTP' AND used_at IS NULL`,
      [userId]
    );

    // Generate 6-digit numeric OTP code
    const rawOtp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash = hashToken(rawOtp);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await db.query(
      `INSERT INTO auth_tokens (id, user_id, type, token_hash, expires_at, created_at)
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
      [uuidv4(), userId, 'WITHDRAWAL_OTP', otpHash, expiresAt]
    );

    // Dispatch email with amount, asset, destination address
    const { sendWithdrawalOtpEmail } = await import('../services/emailService');
    await sendWithdrawalOtpEmail(userEmail, rawOtp, {
      amount: numAmount,
      asset: destType,
      destinationAddress: String(destinationReference || '').trim(),
    });

    return res.status(200).json({
      success: true,
      message: `A 6-digit withdrawal authorization code has been dispatched to ${userEmail}.`,
    });
  } catch (err: any) {
    console.error('[Withdrawal API] Error in /request-otp:', err);
    return res.status(500).json({
      error: 'SERVER_ERROR',
      message: 'Failed to request withdrawal verification code.',
    });
  }
});

/**
 * POST /api/withdrawals
 * Create a new withdrawal request from eligible available balance.
 * Requires 6-digit OTP email verification code.
 * If AUTO_WITHDRAWAL_ENABLED is ON, instantly executes on-chain broadcast without admin delay.
 */
withdrawalRouter.post('/', requireAuth, withdrawalLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { amount, destinationType, destinationReference, idempotencyKey, otp } = req.body;

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || !isFinite(numAmount) || numAmount <= 0) {
      return res.status(400).json({
        error: 'INVALID_AMOUNT',
        message: 'Withdrawal amount must be a positive number greater than 0.',
      });
    }

    const destType = String(destinationType || 'USDT_BEP20').toUpperCase();
    if (destType === 'USDT_BEP20' || destType === 'BEP20' || destType === 'BNB' || destType === 'USDT_ERC20' || destType === 'ETH') {
      const addrCheck = validateEvmAddress(destinationReference);
      if (!addrCheck.valid) {
        return res.status(400).json({
          error: 'INVALID_DESTINATION_ADDRESS',
          message: addrCheck.error || 'Invalid destination wallet address (Must be a valid 0x... EVM / BNB Smart Chain address).',
        });
      }
    }

    // Verify OTP if in production or if OTP is provided
    const isTest = process.env.NODE_ENV === 'test';
    const trimmedOtp = otp ? String(otp).trim() : '';

    if (!isTest && !trimmedOtp) {
      return res.status(400).json({
        error: 'OTP_REQUIRED',
        message: 'A valid 6-digit email verification code is required to authorize withdrawal.',
      });
    }

    const withdrawal = await createWithdrawalRequest({
      userId,
      amount: numAmount,
      destinationType: destType,
      destinationReference: String(destinationReference || '').trim(),
      idempotencyKey: idempotencyKey ? String(idempotencyKey) : undefined,
      otp: trimmedOtp || undefined,
    });

    // Check if Full Automatic Mode is enabled
    try {
      const db = await getDb();
      const configRes = await db.query(
        `SELECT config_value FROM system_economic_configs WHERE config_key = 'AUTO_WITHDRAWAL_ENABLED' LIMIT 1`
      ).catch(() => ({ rows: [] }));

      let autoEnabled = false;
      if (configRes.rows.length > 0) {
        const rawVal = configRes.rows[0].config_value;
        try {
          autoEnabled = typeof rawVal === 'string' ? JSON.parse(rawVal) === true : Boolean(rawVal);
        } catch {
          autoEnabled = String(rawVal).toLowerCase() === 'true';
        }
      }

      if (autoEnabled) {
        const targetPublicId = withdrawal.publicWithdrawalId || (withdrawal as any).publicId;
        console.log(`[Auto-Withdrawal Engine] Mode is FULL AUTOMATIC. Broadcasting withdrawal ${targetPublicId} instantly to BSC...`);
        try {
          const broadcastPromise = broadcastBnbWithdrawal({
            withdrawalPublicId: targetPublicId,
            forceBypassDisabled: true,
            timeoutMs: 6000,
          });
          const timeoutPromise = new Promise<{ timedOut: true }>((resolve) =>
            setTimeout(() => resolve({ timedOut: true }), 8000)
          );

          const result = await Promise.race([broadcastPromise, timeoutPromise]);
          if ('timedOut' in result) {
            const currentRecord = await getWithdrawalByPublicId(targetPublicId);
            return res.status(201).json({
              ...(currentRecord || withdrawal),
              publicId: targetPublicId,
              publicWithdrawalId: targetPublicId,
              autoDisbursed: false,
              message: 'Withdrawal submitted. Payout broadcast in progress; confirmation will update automatically.',
            });
          }

          const broadcastResult = result;
          console.log(`[Auto-Withdrawal Engine] Broadcast completed. Status: ${broadcastResult.withdrawal.status}, TxHash: ${broadcastResult.txHash}`);
          return res.status(201).json({
            ...broadcastResult.withdrawal,
            publicId: targetPublicId,
            publicWithdrawalId: targetPublicId,
            txHash: broadcastResult.txHash,
            autoDisbursed: true,
            message: broadcastResult.withdrawal.status === 'COMPLETED'
              ? 'Withdrawal automatically processed and confirmed on-chain on BNB Smart Chain.'
              : 'Withdrawal submitted to blockchain; confirmation pending.',
          });
        } catch (autoSendErr: any) {
          console.error('[Auto-Withdrawal Engine] Auto-broadcast error, safely retained for retry:', autoSendErr);
          const currentRecord = await getWithdrawalByPublicId(targetPublicId);
          return res.status(201).json({
            ...(currentRecord || withdrawal),
            publicId: targetPublicId,
            publicWithdrawalId: targetPublicId,
            autoDisbursed: false,
            message: `Withdrawal request created and funds reserved. Broadcast deferred for retry: ${autoSendErr?.message || 'RPC unavailable'}`,
          });
        }
      }
    } catch (checkErr) {
      console.warn('[Auto-Withdrawal Engine] Could not read auto mode config:', checkErr);
    }

    return res.status(201).json({
      ...withdrawal,
      publicId: withdrawal.publicWithdrawalId,
      publicWithdrawalId: withdrawal.publicWithdrawalId,
    });
  } catch (err: any) {
    const message = err?.message || 'An error occurred while requesting withdrawal.';

    if (err?.code === 'INVALID_OTP' || err?.code === 'OTP_ALREADY_USED' || err?.code === 'OTP_EXPIRED' || message.startsWith('INVALID_OTP') || message.startsWith('OTP_')) {
      return res.status(400).json({
        error: err.code || 'INVALID_OTP',
        message: err.message || message,
      });
    }

    if (message.startsWith('INSUFFICIENT_BALANCE') || err?.code === 'INSUFFICIENT_BALANCE') {
      return res.status(422).json({
        error: 'INSUFFICIENT_BALANCE',
        message,
        availableBalance: err?.availableBalance,
      });
    }

    if (message.startsWith('MINIMUM_AMOUNT_LIMIT') || message.startsWith('INVALID_AMOUNT') || message.startsWith('INVALID_DESTINATION')) {
      return res.status(400).json({
        error: 'BAD_REQUEST',
        message,
      });
    }

    console.error('[Withdrawal API] Error creating withdrawal:', err);
    return res.status(500).json({
      error: 'SERVER_ERROR',
      message,
    });
  }
});

/**
 * GET /api/withdrawals/me
 * Retrieve authenticated user's withdrawal history.
 */
withdrawalRouter.get('/me', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 20;
    const status = (req.query.status as string) || undefined;

    const history = await getUserWithdrawals(userId, page, limit, status);
    return res.status(200).json(history);
  } catch (err: any) {
    console.error('[Withdrawal API] Error fetching history:', err);
    return res.status(500).json({
      error: 'SERVER_ERROR',
      message: 'Failed to retrieve withdrawal history.',
    });
  }
});

/**
 * GET /api/withdrawals/config
 * Returns real-time public withdrawal configurations (minimum amount, mode, etc.).
 * Note: Must be registered before parameterized /:publicId route.
 */
withdrawalRouter.get('/config', async (_req, res: Response) => {
  try {
    const minAmount = await getMinWithdrawalAmount();
    const db = await getDb();
    const configRes = await db.query(
      `SELECT config_value FROM system_economic_configs WHERE config_key = 'AUTO_WITHDRAWAL_ENABLED' LIMIT 1`
    ).catch(() => ({ rows: [] }));

    let autoEnabled = false;
    if (configRes.rows.length > 0) {
      const rawVal = configRes.rows[0].config_value;
      try {
        autoEnabled = typeof rawVal === 'string' ? JSON.parse(rawVal) === true : Boolean(rawVal);
      } catch {
        autoEnabled = String(rawVal).toLowerCase() === 'true';
      }
    }

    return res.status(200).json({
      success: true,
      minWithdrawalAmount: minAmount,
      autoWithdrawalEnabled: autoEnabled,
      mode: autoEnabled ? 'FULL_AUTOMATIC' : 'MANUAL_APPROVAL',
    });
  } catch (err: any) {
    console.error('[Withdrawal API] Error fetching config:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to retrieve withdrawal configuration' });
  }
});

/**
 * GET /api/withdrawals/:publicId
 * Get a specific withdrawal record owned by the user.
 */
withdrawalRouter.get('/:publicId', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { publicId } = req.params;

    const withdrawal = await getWithdrawalByPublicId(publicId, userId);
    if (!withdrawal) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Withdrawal record not found or access denied.',
      });
    }

    return res.status(200).json(withdrawal);
  } catch (err: any) {
    console.error('[Withdrawal API] Error fetching withdrawal:', err);
    return res.status(500).json({
      error: 'SERVER_ERROR',
      message: 'Failed to fetch withdrawal record.',
    });
  }
});

/**
 * POST /api/withdrawals/:publicId/cancel
 * Cancel a pending withdrawal request and release reserved funds.
 */
withdrawalRouter.post('/:publicId/cancel', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { publicId } = req.params;

    const updated = await cancelWithdrawalRequest(publicId, userId);
    return res.status(200).json(updated);
  } catch (err: any) {
    const message = err?.message || 'Failed to cancel withdrawal request.';
    if (message.startsWith('NOT_FOUND')) {
      return res.status(404).json({ error: 'NOT_FOUND', message });
    }
    if (message.startsWith('INVALID_STATE')) {
      return res.status(400).json({ error: 'INVALID_STATE', message });
    }
    console.error('[Withdrawal API] Error cancelling withdrawal:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message });
  }
});

/**
 * POST /api/withdrawals/admin/settle
 * Admin-only settlement state machine trigger (APPROVE, COMPLETE, REJECT, FAIL).
 */
withdrawalRouter.post('/admin/settle', requireAdmin, adminFinancialLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const { publicId, action, rejectionReason, txHash } = req.body;

    if (!publicId || !action) {
      return res.status(400).json({
        error: 'BAD_REQUEST',
        message: 'Missing publicId or action parameter.',
      });
    }

    const updated = await settleWithdrawalAction({
      withdrawalIdOrPublicId: String(publicId),
      action: action.toUpperCase() as any,
      rejectionReason: rejectionReason ? String(rejectionReason) : undefined,
      txHash: txHash ? String(txHash).trim() : undefined,
    });

    return res.status(200).json(updated);
  } catch (err: any) {
    const message = err?.message || 'Failed to process settlement action.';
    if (message.startsWith('NOT_FOUND')) {
      return res.status(404).json({ error: 'NOT_FOUND', message });
    }
    if (message.startsWith('INVALID_STATE') || message.startsWith('INVALID_ACTION')) {
      return res.status(400).json({ error: 'INVALID_STATE', message });
    }
    console.error('[Withdrawal API] Settlement error:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message });
  }
});

/**
 * POST /api/withdrawals/admin/broadcast-bsc
 * Admin-only on-chain broadcast trigger for BNB Smart Chain withdrawal settlement.
 */
withdrawalRouter.post('/admin/broadcast-bsc', requireAdmin, adminFinancialLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const { publicId } = req.body;

    if (!publicId) {
      return res.status(400).json({
        error: 'BAD_REQUEST',
        message: 'Missing publicId parameter.',
      });
    }

    const result = await broadcastBnbWithdrawal({
      withdrawalPublicId: String(publicId),
    });

    return res.status(200).json({
      success: true,
      message: `Withdrawal successfully broadcasted to BNB Smart Chain.`,
      data: result,
    });
  } catch (err: any) {
    const message = err?.message || 'Failed to broadcast BNB withdrawal.';
    if (message.includes('INSUFFICIENT_GAS_RESERVE')) {
      return res.status(422).json({ error: 'INSUFFICIENT_GAS_RESERVE', message });
    }
    if (message.includes('ALREADY_BROADCASTED')) {
      return res.status(409).json({ error: 'ALREADY_BROADCASTED', message });
    }
    if (message.startsWith('NOT_FOUND')) {
      return res.status(404).json({ error: 'NOT_FOUND', message });
    }
    if (message.startsWith('INVALID_STATE') || message.startsWith('INVALID_DESTINATION')) {
      return res.status(400).json({ error: 'BAD_REQUEST', message });
    }
    console.error('[Withdrawal API] BSC broadcast error:', err);
    return res.status(500).json({ error: 'BROADCAST_ERROR', message });
  }
});

/**
 * GET /api/withdrawals/admin/transition-logs & /api/withdrawals/admin/state-logs
 * Dedicated administrative audit endpoint for monitoring withdrawal request state transitions and timestamps.
 */
const handleGetStateLogs = async (req: AuthRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 20;
    const status = (req.query.status as string) || undefined;
    const actorType = (req.query.actorType as string) || undefined;
    const search = (req.query.search as string) || undefined;

    const data = await getWithdrawalStateLogs({
      page,
      limit,
      status,
      actorType,
      search,
    });

    return res.status(200).json({
      success: true,
      logs: data.logs,
      stats: data.stats,
      pagination: data.pagination,
    });
  } catch (err: any) {
    console.error('[Withdrawal API] Error fetching transition logs:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to fetch withdrawal state transition logs' });
  }
};

withdrawalRouter.get('/admin/transition-logs', requireAdmin, handleGetStateLogs);
withdrawalRouter.get('/admin/state-logs', requireAdmin, handleGetStateLogs);

/**
 * GET /api/withdrawals/admin/state-timeline/:publicId
 * Fetch exact chronological state transition timeline for a single withdrawal request.
 */
withdrawalRouter.get('/admin/state-timeline/:publicId', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { publicId } = req.params;
    const timeline = await getSingleWithdrawalStateTimeline(publicId);
    return res.status(200).json({ success: true, timeline });
  } catch (err: any) {
    console.error('[Withdrawal API] Error fetching state timeline:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to fetch withdrawal state timeline' });
  }
});

/**
 * GET /api/withdrawals/admin/mode
 * Check whether withdrawals are in FULL_AUTOMATIC or MANUAL_APPROVAL mode.
 */
withdrawalRouter.get('/admin/mode', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const db = await getDb();
    const [modeRes, minRes] = await Promise.all([
      db.query(`SELECT config_value FROM system_economic_configs WHERE config_key = 'AUTO_WITHDRAWAL_ENABLED' LIMIT 1`).catch(() => ({ rows: [] })),
      getMinWithdrawalAmount(),
    ]);

    let autoEnabled = false;
    if (modeRes.rows.length > 0) {
      const rawVal = modeRes.rows[0].config_value;
      try {
        autoEnabled = typeof rawVal === 'string' ? JSON.parse(rawVal) === true : Boolean(rawVal);
      } catch {
        autoEnabled = String(rawVal).toLowerCase() === 'true';
      }
    }

    return res.status(200).json({
      success: true,
      minWithdrawalAmount: minRes,
      autoWithdrawalEnabled: autoEnabled,
      mode: autoEnabled ? 'FULL_AUTOMATIC' : 'MANUAL_APPROVAL',
    });
  } catch (err: any) {
    console.error('[Withdrawal API] Error fetching mode:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to retrieve mode' });
  }
});

/**
 * POST /api/withdrawals/admin/min-amount
 * Admin endpoint to dynamically set the minimum withdrawal limit.
 */
withdrawalRouter.post('/admin/min-amount', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { minAmount } = req.body;
    const num = parseFloat(minAmount);
    if (isNaN(num) || num < 0) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'Minimum withdrawal amount must be a number >= 0.' });
    }

    const db = await getDb();
    const adminPublicId = (req.user as any)?.publicId || (req.user as any)?.public_id || 'ADMIN';

    await db.query(`
      INSERT INTO system_economic_configs (id, config_key, config_value, category, description, status, version, updated_by_admin_public_id, updated_at)
      VALUES (gen_random_uuid(), 'MIN_WITHDRAWAL_AMOUNT', $1, 'GATEWAY', 'Minimum allowed withdrawal amount in USD / USDT', 'ACTIVE', 1, $2, CURRENT_TIMESTAMP)
      ON CONFLICT (config_key) DO UPDATE
      SET config_value = EXCLUDED.config_value,
          updated_by_admin_public_id = EXCLUDED.updated_by_admin_public_id,
          version = system_economic_configs.version + 1,
          updated_at = CURRENT_TIMESTAMP
    `, [JSON.stringify(num), adminPublicId]);

    // Sync and broadcast in real-time
    await broadcastSystemConfigChange('MIN_WITHDRAWAL_AMOUNT', num, 'GATEWAY');

    return res.status(200).json({
      success: true,
      minWithdrawalAmount: num,
      message: `Minimum withdrawal amount updated to $${num.toFixed(2)} USD (${num} USDT).`,
    });
  } catch (err: any) {
    console.error('[Withdrawal API] Error setting min-amount:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to update minimum withdrawal amount' });
  }
});

/**
 * POST /api/withdrawals/admin/mode
 * Toggle between FULL_AUTOMATIC (Instant Payout) and MANUAL_APPROVAL (1-Click Admin Approval).
 */
withdrawalRouter.post('/admin/mode', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { enabled } = req.body;
    const isAuto = Boolean(enabled);

    const db = await getDb();
    await db.query(`
      UPDATE system_economic_configs 
      SET config_value = $1, updated_at = CURRENT_TIMESTAMP, updated_by_admin_public_id = $2
      WHERE config_key = 'AUTO_WITHDRAWAL_ENABLED'
    `, [JSON.stringify(isAuto), (req.user as any)?.publicId || 'ADMIN']);

    (globalThis as any).__AUTO_WITHDRAWAL_ENABLED = isAuto;

    // Sync and broadcast in real-time
    await broadcastSystemConfigChange('AUTO_WITHDRAWAL_ENABLED', isAuto, 'GATEWAY');

    return res.status(200).json({
      success: true,
      autoWithdrawalEnabled: isAuto,
      mode: isAuto ? 'FULL_AUTOMATIC' : 'MANUAL_APPROVAL',
      message: isAuto
        ? 'FULL AUTOMATIC MODE ACTIVE: Withdrawals will be broadcast to blockchain instantly upon user request 24/7.'
        : 'MANUAL APPROVAL MODE ACTIVE: Withdrawals will require 1-click administrative review before broadcasting to blockchain.',
    });
  } catch (err: any) {
    console.error('[Withdrawal API] Error updating mode:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to update withdrawal mode' });
  }
});

/**
 * POST /api/withdrawals/admin/instant-payout
 * 1-Click Approve & Instant Blockchain Payout trigger from PAYOUT_PRIVATE_KEY.
 */
withdrawalRouter.post('/admin/instant-payout', requireAdmin, adminFinancialLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const { publicId } = req.body;

    if (!publicId) {
      return res.status(400).json({
        error: 'BAD_REQUEST',
        message: 'Missing publicId parameter.',
      });
    }

    // 1. Approve if PENDING
    try {
      await settleWithdrawalAction({
        withdrawalIdOrPublicId: String(publicId),
        action: 'APPROVE',
      });
    } catch {
      // already approved or non-pending
    }

    // 2. Broadcast immediately on-chain via PAYOUT_PRIVATE_KEY
    const result = await broadcastBnbWithdrawal({
      withdrawalPublicId: String(publicId),
      forceBypassDisabled: true,
    });

    return res.status(200).json({
      success: true,
      message: `1-Click Instant Payout executed! Transferred funds on-chain to recipient wallet with TxHash: ${result.txHash}.`,
      data: result,
    });
  } catch (err: any) {
    const message = err?.message || 'Failed to execute 1-click instant payout.';
    console.error('[Withdrawal API] 1-Click Instant payout error:', err);
    return res.status(500).json({ error: 'INSTANT_PAYOUT_FAILED', message });
  }
});

