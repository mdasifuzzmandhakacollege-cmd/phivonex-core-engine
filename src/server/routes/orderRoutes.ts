import { Router, Request, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/authMiddleware';
import {
  createNodeReservation,
  settleNodeOrder,
  cancelNodeOrder,
  getUserOrders,
  getUserOrderById,
  purchaseNodeWithDepositBalance
} from '../services/nodeOrderService';
import {
  validateUserNodePurchaseBalances,
  processNodePurchaseWithAssetBalance
} from '../services/nodePurchaseBalanceService';

const router = Router();

const PAYMENT_WEBHOOK_SECRET = process.env.PAYMENT_WEBHOOK_SECRET || 'phx_vault_webhook_secret_2026';

/**
 * POST /api/node-orders/reserve (or /create)
 * Atomically reserves the lowest available Genesis Node and creates an order for the authenticated user.
 */
const handleReserve = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const idempotencyKey = (req.body?.idempotencyKey || req.headers['idempotency-key'] || '') as string;
    const paymentMethod = req.body?.paymentMethod || 'CRYPTO_USDT';

    const result = await createNodeReservation(user.id, idempotencyKey, paymentMethod);

    res.status(result.isExisting ? 200 : 201).json({
      order: result.order,
      isExisting: result.isExisting,
      message: result.isExisting
        ? 'Retrieved existing active node reservation.'
        : 'Genesis Node reserved successfully. Complete payment verification before expiration.',
    });
  } catch (err: any) {
    if (err.code === 'SOLD_OUT') {
      res.status(409).json({
        error: 'SOLD_OUT',
        message: err.message || 'All 10,000 Genesis Nodes have been allocated or reserved.',
      });
      return;
    }

    if (err.statusCode) {
      res.status(err.statusCode).json({
        error: err.code || 'RESERVATION_ERROR',
        message: err.message,
      });
      return;
    }

    console.error('[Order API] Error in node reservation:', err);
    res.status(500).json({
      error: 'SERVER_ERROR',
      message: 'Failed to create Genesis Node reservation. Please try again.',
    });
  }
};

router.post('/reserve', requireAuth, handleReserve);
router.post('/create', requireAuth, handleReserve);

/**
 * GET /api/node-orders/me
 * Returns all node orders for the authenticated operator.
 */
router.get('/me', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const orders = await getUserOrders(user.id);

    res.status(200).json({
      orders,
    });
  } catch (err) {
    console.error('[Order API] Error in GET /me:', err);
    res.status(500).json({
      error: 'SERVER_ERROR',
      message: 'Failed to retrieve node orders.',
    });
  }
});

/**
 * GET /api/node-orders/:orderId
 * Returns a specific order for the authenticated operator.
 */
router.get('/:orderId', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const orderId = req.params.orderId;

    const order = await getUserOrderById(user.id, orderId);
    if (!order) {
      res.status(404).json({
        error: 'ORDER_NOT_FOUND',
        message: 'Order not found.',
      });
      return;
    }

    res.status(200).json({
      order,
    });
  } catch (err) {
    console.error('[Order API] Error in GET /:orderId:', err);
    res.status(500).json({
      error: 'SERVER_ERROR',
      message: 'Failed to retrieve order details.',
    });
  }
});

/**
 * POST /api/node-orders/:orderId/settle
 * PRODUCTION SAFETY: Regular authenticated clients MUST NOT settle or activate their own nodes directly.
 * Direct calls from regular users are explicitly rejected with 403 Forbidden.
 */
router.post('/:orderId/settle', async (_req: Request, res: Response): Promise<void> => {
  res.status(403).json({
    error: 'FORBIDDEN',
    message: 'Direct user settlement is disabled. Orders are settled exclusively via verified protocol payment webhooks or internal settlement service.',
  });
});

/**
 * POST /api/node-orders/webhook/payment-settlement
 * Authoritative Payment Provider / Gateway Webhook.
 * Verifies webhook authorization secret and transitions order from PENDING -> COMPLETED, activating the Node.
 */
router.post('/webhook/payment-settlement', async (req: Request, res: Response): Promise<void> => {
  try {
    const authHeader = req.headers['x-phx-webhook-secret'] || req.headers['authorization'];
    const expectedSecret = PAYMENT_WEBHOOK_SECRET;

    if (!authHeader || (authHeader !== expectedSecret && authHeader !== `Bearer ${expectedSecret}`)) {
      res.status(401).json({
        error: 'UNAUTHORIZED_WEBHOOK',
        message: 'Invalid or missing webhook signature/secret.',
      });
      return;
    }

    const orderIdentifier = req.body?.orderId || req.body?.publicOrderId;
    const paymentReference = req.body?.paymentReference || req.body?.txHash;

    if (!orderIdentifier) {
      res.status(400).json({
        error: 'BAD_REQUEST',
        message: 'Missing orderId or publicOrderId in webhook payload.',
      });
      return;
    }

    const result = await settleNodeOrder(null, orderIdentifier, paymentReference);

    res.status(200).json({
      success: true,
      message: result.isDuplicate
        ? `Order ${result.order.publicOrderId} was already settled (idempotent).`
        : `Genesis Node ${result.node.publicNodeId} successfully activated via verified payment!`,
      order: result.order,
      node: result.node,
      isDuplicate: result.isDuplicate,
    });
  } catch (err: any) {
    if (err.statusCode) {
      res.status(err.statusCode).json({
        error: err.code || 'WEBHOOK_SETTLEMENT_ERROR',
        message: err.message,
      });
      return;
    }

    console.error('[Order API Webhook] Error in payment webhook settlement:', err);
    res.status(500).json({
      error: 'SERVER_ERROR',
      message: 'Internal error processing payment webhook.',
    });
  }
});

/**
 * POST /api/node-orders/dev/simulate-settlement
 * DEVELOPMENT / TEST ONLY SIMULATOR.
 * Strictly blocked when NODE_ENV === 'production' or APP_ENV === 'production'.
 */
router.post('/dev/simulate-settlement', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const isProduction = process.env.NODE_ENV === 'production' || process.env.APP_ENV === 'production';

  if (isProduction) {
    res.status(403).json({
      error: 'FORBIDDEN',
      message: 'Development settlement simulator is strictly disabled in production environments.',
    });
    return;
  }

  try {
    const user = req.user!;
    const orderIdentifier = req.body?.orderId || req.body?.publicOrderId;
    const paymentReference = req.body?.paymentReference || `DEV_SIMULATED_PAYMENT_${Date.now()}`;

    if (!orderIdentifier) {
      res.status(400).json({
        error: 'BAD_REQUEST',
        message: 'Missing orderId or publicOrderId in dev simulator payload.',
      });
      return;
    }

    const result = await settleNodeOrder(user.id, orderIdentifier, paymentReference);

    res.status(200).json({
      success: true,
      message: `[DEV ONLY] Genesis Node ${result.node.publicNodeId} simulated settlement verified!`,
      order: result.order,
      node: result.node,
      isDuplicate: result.isDuplicate,
    });
  } catch (err: any) {
    if (err.statusCode) {
      res.status(err.statusCode).json({
        error: err.code || 'DEV_SETTLEMENT_ERROR',
        message: err.message,
      });
      return;
    }

    console.error('[Order API Dev] Error in dev settlement simulator:', err);
    res.status(500).json({
      error: 'SERVER_ERROR',
      message: 'Dev settlement simulator failed.',
    });
  }
});

/**
 * GET /api/node-orders/balance-validation
 * Validates the authenticated user's internal deposit balances (BNB & USDT)
 * specifically for Node purchase contract eligibility.
 */
router.get('/balance-validation', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const validation = await validateUserNodePurchaseBalances(user.id);

    res.status(200).json({
      success: true,
      validation,
    });
  } catch (err: any) {
    console.error('[Order API] Error validating node purchase balances:', err);
    res.status(500).json({
      error: 'SERVER_ERROR',
      message: 'Failed to validate node purchase balances.',
    });
  }
});

/**
 * POST /api/node-orders/activate-with-asset
 * Validates and triggers Node activation using the user's selected internal asset balance (BNB or USDT).
 */
router.post('/activate-with-asset', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const asset = ((req.body?.asset as string) || 'USDT').toUpperCase() === 'BNB' ? 'BNB' : 'USDT';
    const idempotencyKey = req.body?.idempotencyKey ? String(req.body.idempotencyKey).trim() : undefined;

    const result = await processNodePurchaseWithAssetBalance(user.id, asset, idempotencyKey);

    res.status(200).json({
      success: true,
      message: `Genesis Node ${result.node.publicNodeId} successfully activated using your ${result.assetUsed} deposit balance!`,
      result,
    });
  } catch (err: any) {
    if (err.statusCode) {
      res.status(err.statusCode).json({
        error: err.code || 'ASSET_PURCHASE_ERROR',
        message: err.message,
        selectedAsset: err.selectedAsset,
        availableBalance: err.availableBalance,
        requiredAmount: err.requiredAmount,
        missingAmount: err.missingAmount,
        redirectToDeposit: err.redirectToDeposit || false,
      });
      return;
    }

    console.error('[Order API] Error activating node with asset balance:', err);
    res.status(500).json({
      error: 'SERVER_ERROR',
      message: 'Failed to process node purchase with asset balance.',
    });
  }
});

/**
 * POST /api/node-orders/activate-with-deposit
 * Purchases and activates a Genesis Node directly using the user's credited deposit balance.
 * Deducts $1,000 USD from deposit balance and activates the node.
 */
router.post('/activate-with-deposit', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const preferredAsset = ((req.body?.asset as string) || 'USDT').toUpperCase() === 'BNB' ? 'BNB' : 'USDT';

    const result = await purchaseNodeWithDepositBalance(user.id, preferredAsset);

    res.status(200).json({
      success: true,
      message: `Genesis Node ${result.node.publicNodeId} successfully activated using your ${preferredAsset} deposit balance!`,
      order: result.order,
      node: result.node,
      depositDeducted: result.depositDeducted,
      remainingDepositBalance: result.remainingDepositBalance,
    });
  } catch (err: any) {
    if (err.statusCode) {
      res.status(err.statusCode).json({
        error: err.code || 'DEPOSIT_PURCHASE_ERROR',
        message: err.message,
        currentBalance: err.currentBalance,
        requiredAmount: err.requiredAmount,
        redirectToDeposit: err.redirectToDeposit || false,
      });
      return;
    }

    console.error('[Order API] Error in activate-with-deposit:', err);
    res.status(500).json({
      error: 'SERVER_ERROR',
      message: 'Failed to activate Genesis Node using deposit balance.',
    });
  }
});

/**
 * POST /api/node-orders/:orderId/cancel
 * Cancels a pending reservation and releases the node back to available inventory.
 */
router.post('/:orderId/cancel', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const orderId = req.params.orderId;

    const result = await cancelNodeOrder(user.id, orderId);

    res.status(200).json(result);
  } catch (err: any) {
    if (err.statusCode) {
      res.status(err.statusCode).json({
        error: err.code || 'CANCELLATION_ERROR',
        message: err.message,
      });
      return;
    }

    console.error('[Order API] Error in cancellation:', err);
    res.status(500).json({
      error: 'SERVER_ERROR',
      message: 'Failed to cancel reservation.',
    });
  }
});

export default router;
