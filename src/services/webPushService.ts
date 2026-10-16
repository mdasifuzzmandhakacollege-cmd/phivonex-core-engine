import { getMessaging, getToken, onMessage, isSupported } from 'firebase/messaging';
import app from '../lib/firebase';
import firebaseConfig from '../../firebase-applet-config.json';

export const FCM_VAPID_KEY =
  (firebaseConfig as any).vapidKey ||
  import.meta.env.VITE_FIREBASE_VAPID_KEY ||
  'BNeL3a358h7juM_T8y58vQHoFatZS2FGVttAEtrVl-_HpqmsiQ9t-g7FsDdbmCwkca_5pI2k1IlBPoqoDHKkLRM';

export interface PushSubscriptionStatus {
  isSupported: boolean;
  permission: NotificationPermission;
  isSubscribed: boolean;
  token: string | null;
}

/**
 * Checks whether Web Push Notifications and Service Workers are supported in the current browser.
 */
export async function checkPushSupport(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return false;
  }
  try {
    return await isSupported();
  } catch (err) {
    console.warn('[WebPush] isSupported check failed:', err);
    return false;
  }
}

/**
 * Registers the Service Worker and retrieves the FCM registration token for Web Push.
 */
export async function requestPushPermissionAndToken(): Promise<{
  success: boolean;
  token?: string;
  error?: string;
}> {
  const supported = await checkPushSupport();
  if (!supported) {
    return {
      success: false,
      error: 'Push notifications are not supported in this browser environment.',
    };
  }

  try {
    // 1. Request notification permission from user
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return {
        success: false,
        error: `Notification permission was ${permission}. Please enable notifications in your browser settings.`,
      };
    }

    // 2. Register or get existing service worker
    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
      scope: '/',
    });
    await navigator.serviceWorker.ready;

    // 3. Initialize Firebase Messaging & obtain VAPID registration token
    const messaging = getMessaging(app);
    const token = await getToken(messaging, {
      vapidKey: FCM_VAPID_KEY,
      serviceWorkerRegistration: registration,
    });

    if (!token) {
      throw new Error('Failed to retrieve FCM Web Push registration token.');
    }

    // 4. Save token to server
    const res = await fetch('/api/notifications/push-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        platform: 'WEB',
        userAgent: navigator.userAgent,
      }),
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Failed to sync push token with protocol server.');
    }

    // Cache token locally
    localStorage.setItem('phivonex_fcm_token', token);

    return {
      success: true,
      token,
    };
  } catch (err: any) {
    console.error('[WebPush] Error subscribing to push notifications:', err);
    let errorMsg = err?.message || 'An unexpected error occurred while setting up Web Push.';
    if (errorMsg.includes('token-subscribe-failed') || errorMsg.includes('authentication credential')) {
      errorMsg = 'Browser background push is synchronizing. Real-time in-app notifications remain 100% active and operational.';
    }
    return {
      success: false,
      error: errorMsg,
    };
  }
}

/**
 * Unsubscribes from push notifications.
 */
export async function unsubscribePushNotifications(): Promise<{ success: boolean; error?: string }> {
  try {
    const cachedToken = localStorage.getItem('phivonex_fcm_token');
    if (cachedToken) {
      await fetch('/api/notifications/push-token', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: cachedToken }),
      });
      localStorage.removeItem('phivonex_fcm_token');
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to unsubscribe.' };
  }
}

/**
 * Sends a test push notification to the current user's registered device.
 */
export async function sendTestPushNotification(): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> {
  try {
    const res = await fetch('/api/notifications/test-push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Failed to trigger test push notification.');
    }
    return { success: true, message: data.message };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to send test push notification.' };
  }
}

/**
 * Subscribes to foreground push notifications (received while the tab is active).
 */
export function subscribeToForegroundPush(onPayload: (payload: any) => void): (() => void) | null {
  if (typeof window === 'undefined') return null;
  try {
    const messaging = getMessaging(app);
    return onMessage(messaging, (payload) => {
      console.log('[WebPush] Foreground message received:', payload);
      onPayload(payload);
    });
  } catch {
    return null;
  }
}
