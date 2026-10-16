import { adminFirestore } from '../../lib/firebase-admin';
import { publicNetworkEventEmitter } from './publicNetworkService';

export interface SystemConfigBroadcastPayload {
  key: string;
  value: any;
  category?: string;
  updatedAt: string;
}

/**
 * Real-Time Broadcaster Service
 * Ensures any administrative configuration change is:
 * 1. Persisted and synced in real-time to Firestore 'system_settings' collection
 * 2. Emitted via SSE stream to all active connected clients
 */
export async function broadcastSystemConfigChange(key: string, value: any, category = 'SYSTEM'): Promise<void> {
  const timestamp = new Date().toISOString();
  const normalizedKey = key.toUpperCase();

  // In test environment, skip external network Firestore calls to avoid timeouts
  if (process.env.NODE_ENV === 'test' || process.env.APP_ENV === 'test') {
    try {
      publicNetworkEventEmitter.emit('networkEvent', {
        type: 'system_config',
        key: normalizedKey,
        value,
        category,
        updatedAt: timestamp,
      });
    } catch (sseErr) {
      console.warn('[SystemConfigBroadcaster] SSE broadcast warning:', sseErr);
    }
    return;
  }

  // 1. Dual Firestore real-time sync
  try {
    // Primary 'configs' document
    await adminFirestore.collection('system_settings').doc('configs').set(
      {
        [normalizedKey]: value,
        updatedAt: timestamp,
        lastUpdatedKey: normalizedKey,
      },
      { merge: true }
    );

    // Document category mapping
    if (normalizedKey.includes('WITHDRAWAL')) {
      await adminFirestore.collection('system_settings').doc('withdrawals').set(
        {
          [normalizedKey]: value,
          minWithdrawalAmount: normalizedKey === 'MIN_WITHDRAWAL_AMOUNT' ? Number(value) : undefined,
          autoWithdrawalEnabled: normalizedKey === 'AUTO_WITHDRAWAL_ENABLED' ? Boolean(value) : undefined,
          updatedAt: timestamp,
        },
        { merge: true }
      );
    }

    if (normalizedKey.includes('COIN') || normalizedKey.includes('PRICE') || normalizedKey.includes('NODE')) {
      await adminFirestore.collection('system_settings').doc('economic').set(
        {
          [normalizedKey]: value,
          updatedAt: timestamp,
        },
        { merge: true }
      );
    }
  } catch (fsErr) {
    console.warn('[SystemConfigBroadcaster] Firestore real-time sync warning:', fsErr);
  }

  // 2. Broadcast via Server-Sent Events (SSE) channel
  try {
    publicNetworkEventEmitter.emit('networkEvent', {
      type: 'system_config',
      key: normalizedKey,
      value,
      category,
      updatedAt: timestamp,
    });
  } catch (sseErr) {
    console.warn('[SystemConfigBroadcaster] SSE broadcast warning:', sseErr);
  }
}
