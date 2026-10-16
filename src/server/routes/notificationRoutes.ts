import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/authMiddleware';
import {
  getUserNotifications,
  getUnreadNotificationCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  deleteAllNotifications,
  notificationEmitter,
} from '../services/notificationService';

export const notificationRouter = Router();

// In-memory rate limiting for test push (max 5 requests per 60s per user)
const testPushTimestamps = new Map<string, number[]>();

/**
 * GET /api/notifications/events
 * Authenticated Server-Sent Events (SSE) stream strictly scoped to req.user.id.
 */
notificationRouter.get('/events', requireAuth, (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // Initial handshake event
  res.write(`data: ${JSON.stringify({ type: 'CONNECTED', userId, timestamp: Date.now() })}\n\n`);

  // User-scoped notification listener
  const onNotification = (notif: any) => {
    try {
      res.write(`data: ${JSON.stringify({ type: 'NEW_NOTIFICATION', notification: notif })}\n\n`);
    } catch {
      // Stream error
    }
  };

  notificationEmitter.on(`notification:${userId}`, onNotification);

  // Keep-alive heartbeat every 15s to prevent connection timeouts
  const heartbeat = setInterval(() => {
    try {
      res.write(`: heartbeat ${Date.now()}\n\n`);
    } catch {
      clearInterval(heartbeat);
    }
  }, 15000);

  // Clean up on client disconnect
  req.on('close', () => {
    clearInterval(heartbeat);
    notificationEmitter.off(`notification:${userId}`, onNotification);
    res.end();
  });
});

/**
 * GET /api/notifications
 * Retrieves paginated notifications for the authenticated user with optional filtering.
 */
notificationRouter.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 20;
    const offset = req.query.offset ? parseInt(String(req.query.offset), 10) : 0;
    const unreadOnly = req.query.unreadOnly === 'true' || req.query.unreadOnly === '1';
    const type = req.query.type ? String(req.query.type) : undefined;

    const result = await getUserNotifications(userId, {
      limit: isNaN(limit) ? 20 : limit,
      offset: isNaN(offset) ? 0 : offset,
      unreadOnly,
      type,
    });

    return res.json(result);
  } catch (err: any) {
    console.error('[Notification API] Error fetching notifications:', err);
    return res.status(500).json({
      error: 'SERVER_ERROR',
      message: 'Failed to retrieve notifications.',
    });
  }
});

/**
 * GET /api/notifications/unread-count
 * Returns the unread notification badge count for the authenticated user.
 */
notificationRouter.get('/unread-count', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const unreadCount = await getUnreadNotificationCount(userId);
    return res.json({ unreadCount });
  } catch (err: any) {
    console.error('[Notification API] Error fetching unread count:', err);
    return res.status(500).json({
      error: 'SERVER_ERROR',
      message: 'Failed to retrieve unread notification count.',
    });
  }
});

/**
 * PATCH /api/notifications/:id/read
 * Marks a specific notification as read.
 */
notificationRouter.patch('/:id/read', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const publicNotificationId = req.params.id;

    if (!publicNotificationId) {
      return res.status(400).json({
        error: 'INVALID_ID',
        message: 'Notification ID is required.',
      });
    }

    const success = await markNotificationAsRead(userId, publicNotificationId);
    return res.json({ success, id: publicNotificationId });
  } catch (err: any) {
    console.error('[Notification API] Error marking notification as read:', err);
    return res.status(500).json({
      error: 'SERVER_ERROR',
      message: 'Failed to mark notification as read.',
    });
  }
});

/**
 * PATCH /api/notifications/read-all
 * POST /api/notifications/read-all
 * Marks all notifications for the authenticated user as read.
 */
const handleReadAll = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const count = await markAllNotificationsAsRead(userId);
    return res.json({ success: true, count });
  } catch (err: any) {
    console.error('[Notification API] Error marking all notifications as read:', err);
    return res.status(500).json({
      error: 'SERVER_ERROR',
      message: 'Failed to mark all notifications as read.',
    });
  }
};

notificationRouter.patch('/read-all', requireAuth, handleReadAll);
notificationRouter.post('/read-all', requireAuth, handleReadAll);

/**
 * DELETE /api/notifications/:id
 * Deletes a specific notification for the authenticated user.
 */
notificationRouter.delete('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const publicNotificationId = req.params.id;

    if (!publicNotificationId) {
      return res.status(400).json({
        error: 'INVALID_ID',
        message: 'Notification ID is required.',
      });
    }

    const success = await deleteNotification(userId, publicNotificationId);
    if (!success) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Notification not found or already deleted.',
      });
    }

    return res.json({ success: true, id: publicNotificationId });
  } catch (err: any) {
    console.error('[Notification API] Error deleting notification:', err);
    return res.status(500).json({
      error: 'SERVER_ERROR',
      message: 'Failed to delete notification.',
    });
  }
});

/**
 * DELETE /api/notifications
 * Deletes notifications for the authenticated user (supports ?readOnly=true).
 */
notificationRouter.delete('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const readOnly = req.query.readOnly === 'true' || req.query.readOnly === '1';

    const count = await deleteAllNotifications(userId, { readOnly });
    return res.json({ success: true, count });
  } catch (err: any) {
    console.error('[Notification API] Error bulk deleting notifications:', err);
    return res.status(500).json({
      error: 'SERVER_ERROR',
      message: 'Failed to delete notifications.',
    });
  }
});

// ============================================================================
// WEB PUSH MESSAGING (FIREBASE CLOUD MESSAGING / FCM)
// ============================================================================

/**
 * POST /api/notifications/push-token
 * Registers or updates an FCM Web Push registration token.
 */
notificationRouter.post('/push-token', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { token, platform, userAgent } = req.body;

    if (!token || typeof token !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'INVALID_TOKEN',
        message: 'Push registration token is required.',
      });
    }

    const { saveUserPushToken } = await import('../services/webPushServerService');
    const saved = await saveUserPushToken({
      userId,
      token,
      platform: platform || 'WEB',
      userAgent: userAgent || req.headers['user-agent'] || '',
    });

    return res.json({ success: saved, message: 'Web Push subscription active.' });
  } catch (err: any) {
    console.error('[Notification API] Error saving push token:', err);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Failed to register push token.',
    });
  }
});

/**
 * DELETE /api/notifications/push-token
 * Deactivates an FCM Web Push registration token.
 */
notificationRouter.delete('/push-token', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ success: false, message: 'Token required.' });
    }

    const { removeUserPushToken } = await import('../services/webPushServerService');
    await removeUserPushToken(userId, token);

    return res.json({ success: true, message: 'Push token unsubscribed.' });
  } catch (err: any) {
    console.error('[Notification API] Error unsubscribing push token:', err);
    return res.status(500).json({ success: false, message: 'Failed to unsubscribe push token.' });
  }
});

/**
 * POST /api/notifications/test-push
 * Triggers an immediate test push notification to verify browser/device receipt.
 * Enforces per-user rate limiting (max 5 per minute) to prevent abuse.
 */
notificationRouter.post('/test-push', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const now = Date.now();
    const timestamps = (testPushTimestamps.get(userId) || []).filter((t) => now - t < 60000);

    if (timestamps.length >= 5) {
      return res.status(429).json({
        success: false,
        error: 'RATE_LIMITED',
        message: 'Too many test push requests. Please wait a minute before trying again.',
      });
    }

    timestamps.push(now);
    testPushTimestamps.set(userId, timestamps);

    const { sendPushNotificationToUser } = await import('../services/webPushServerService');

    const result = await sendPushNotificationToUser(userId, {
      title: '🔔 PHIVONEX Web Push Active!',
      body: 'Your device is successfully connected to the PHIVONEX real-time alert mesh.',
      url: '/app/notifications',
      data: {
        type: 'TEST_PUSH',
        timestamp: String(Date.now()),
      },
    });

    if (result.sent === 0 && result.failed === 0) {
      return res.status(404).json({
        success: false,
        message: 'No active push notification subscriptions found for your account. Please enable notifications first.',
      });
    }

    return res.json({
      success: true,
      message: `Test push notification dispatched! Sent to ${result.sent} device(s).`,
      sentCount: result.sent,
      failedCount: result.failed,
    });
  } catch (err: any) {
    console.error('[Notification API] Error triggering test push:', err);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Failed to trigger test push notification.',
    });
  }
});

/**
 * GET /api/notifications/push-status
 * Checks if the current user has active push subscriptions.
 */
notificationRouter.get('/push-status', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { getUserPushTokens } = await import('../services/webPushServerService');
    const tokens = await getUserPushTokens(userId);

    return res.json({
      isSubscribed: tokens.length > 0,
      activeDeviceCount: tokens.length,
      projectId: 'phivonex-production',
      messagingSenderId: '1077670417334',
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to query push status.' });
  }
});

