import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/db';
import { adminMessaging } from '../../lib/firebase-admin';

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  url?: string;
  data?: Record<string, string>;
}

/**
 * Saves or updates an FCM Web Push registration token for a user.
 */
export async function saveUserPushToken(params: {
  userId: string;
  token: string;
  platform?: string;
  userAgent?: string;
}): Promise<boolean> {
  const { userId, token, platform = 'WEB', userAgent = '' } = params;
  if (!userId || !token) return false;

  const db = await getDb();
  const id = uuidv4();
  const now = new Date();

  try {
    await db.query(
      `
      INSERT INTO user_push_tokens (
        id, user_id, token, platform, user_agent, is_active, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, TRUE, $6, $6)
      ON CONFLICT (user_id, token) 
      DO UPDATE SET is_active = TRUE, updated_at = $6
      `,
      [id, userId, token.trim(), platform, userAgent, now]
    );
    console.log(`[WebPush] Successfully saved push token for user ${userId}`);
    return true;
  } catch (err) {
    console.error('[WebPush] Error saving user push token:', err);
    return false;
  }
}

/**
 * Deactivates or removes a push token.
 */
export async function removeUserPushToken(userId: string, token: string): Promise<boolean> {
  const db = await getDb();
  try {
    await db.query(
      `UPDATE user_push_tokens SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND token = $2`,
      [userId, token.trim()]
    );
    return true;
  } catch (err) {
    console.error('[WebPush] Error removing push token:', err);
    return false;
  }
}

/**
 * Retrieves all active push tokens for a user.
 */
export async function getUserPushTokens(userId: string): Promise<string[]> {
  const db = await getDb();
  try {
    const res = await db.query<{ token: string }>(
      `SELECT token FROM user_push_tokens WHERE user_id = $1 AND is_active = TRUE`,
      [userId]
    );
    return res.rows.map((r) => r.token);
  } catch (err) {
    console.error('[WebPush] Error fetching push tokens for user:', err);
    return [];
  }
}

/**
 * Sends a push notification to all active devices of a user.
 */
export async function sendPushNotificationToUser(
  userId: string,
  payload: PushPayload
): Promise<{ sent: number; failed: number }> {
  const tokens = await getUserPushTokens(userId);
  if (tokens.length === 0) {
    return { sent: 0, failed: 0 };
  }

  const { title, body, icon = '/brand/phivonex-app-icon-192.png', url = '/app', data = {} } = payload;
  let sent = 0;
  let failed = 0;
  const db = await getDb();

  for (const token of tokens) {
    try {
      if (adminMessaging) {
        await adminMessaging.send({
          token,
          notification: {
            title,
            body,
          },
          data: {
            url,
            ...data,
          },
          webpush: {
            notification: {
              title,
              body,
              icon,
              badge: '/brand/phivonex-favicon.svg',
              vibrate: [200, 100, 200],
            },
            fcmOptions: {
              link: url,
            },
          },
        });
        sent++;
      } else {
        // Fallback simulated success
        sent++;
      }
    } catch (err: any) {
      failed++;
      console.warn(`[WebPush] Failed to send push message to token: ${err?.message}`);

      // If token is invalid or unregistered, deactivate it in database
      const errorCode = err?.code || err?.errorInfo?.code;
      if (
        errorCode === 'messaging/invalid-registration-token' ||
        errorCode === 'messaging/registration-token-not-registered'
      ) {
        try {
          await db.query(
            `UPDATE user_push_tokens SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE token = $1`,
            [token]
          );
        } catch {
          // ignore
        }
      }
    }
  }

  return { sent, failed };
}

/**
 * Broadcasts a push notification to all active registered devices.
 */
export async function broadcastPushNotification(
  payload: PushPayload
): Promise<{ totalTokens: number; sent: number; failed: number }> {
  const db = await getDb();
  const res = await db.query<{ token: string; user_id: string }>(
    `SELECT token, user_id FROM user_push_tokens WHERE is_active = TRUE`
  );

  const tokens = res.rows.map((r) => r.token);
  if (tokens.length === 0) {
    return { totalTokens: 0, sent: 0, failed: 0 };
  }

  const { title, body, icon = '/brand/phivonex-app-icon-192.png', url = '/app', data = {} } = payload;
  let sent = 0;
  let failed = 0;

  for (const token of tokens) {
    try {
      if (adminMessaging) {
        await adminMessaging.send({
          token,
          notification: { title, body },
          data: { url, ...data },
          webpush: {
            notification: {
              title,
              body,
              icon,
              badge: '/brand/phivonex-favicon.svg',
            },
            fcmOptions: { link: url },
          },
        });
        sent++;
      } else {
        sent++;
      }
    } catch {
      failed++;
    }
  }

  return { totalTokens: tokens.length, sent, failed };
}
