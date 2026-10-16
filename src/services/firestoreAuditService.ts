import {
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  orderBy,
  limit,
  onSnapshot,
  getDocFromServer
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { v4 as uuidv4 } from 'uuid';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export interface FirestoreAdminAuditLog {
  id: string;
  action: string;
  category: 'CONFIG_UPDATE' | 'TREASURY_MOVEMENT' | 'FINANCIAL_SETTLEMENT' | 'SECURITY';
  actorId: string;
  actorEmail?: string;
  actorRole?: string;
  targetType?: string;
  targetId?: string;
  details: string;
  previousState?: string;
  newState?: string;
  ipAddress?: string;
  createdAt: string;
}

const PRIMARY_COLLECTION = 'system_audit_logs';
const LEGACY_COLLECTION = 'admin_audit_logs';

/**
 * Record a sensitive administrative action into Cloud Firestore as the authoritative storage engine.
 */
export async function recordAdminAuditToFirestore(event: {
  action: string;
  category: 'CONFIG_UPDATE' | 'TREASURY_MOVEMENT' | 'FINANCIAL_SETTLEMENT' | 'SECURITY';
  actorId: string;
  actorEmail?: string;
  actorRole?: string;
  targetType?: string;
  targetId?: string;
  details: string;
  previousState?: any;
  newState?: any;
  ipAddress?: string;
  metadata?: Record<string, any>;
}): Promise<FirestoreAdminAuditLog> {
  const logId = uuidv4();
  const now = new Date().toISOString();

  const record: FirestoreAdminAuditLog = {
    id: logId,
    action: event.action.slice(0, 100),
    category: event.category,
    actorId: event.actorId.slice(0, 100),
    actorEmail: event.actorEmail?.slice(0, 200) || 'admin@phivonex.com',
    actorRole: event.actorRole?.slice(0, 50) || 'SUPER_ADMIN',
    targetType: event.targetType?.slice(0, 100) || 'SYSTEM_CONFIG',
    targetId: event.targetId?.slice(0, 100) || 'GLOBAL',
    details: event.details.slice(0, 1000),
    previousState: event.previousState ? (typeof event.previousState === 'string' ? event.previousState : JSON.stringify(event.previousState)).slice(0, 2000) : '',
    newState: event.newState ? (typeof event.newState === 'string' ? event.newState : JSON.stringify(event.newState)).slice(0, 2000) : '',
    ipAddress: event.ipAddress?.slice(0, 100) || 'WebClient/AdminConsole',
    createdAt: now,
  };

  const systemRecord = {
    id: logId,
    userUid: event.actorId.slice(0, 128),
    timestamp: now,
    actionType: event.action.slice(0, 100),
    category: event.category,
    details: event.details.slice(0, 2000),
    targetType: record.targetType,
    targetId: record.targetId,
    actorEmail: record.actorEmail,
    actorRole: record.actorRole,
    previousState: event.previousState || null,
    newState: event.newState || null,
    metadata: event.metadata || {},
    ipAddress: record.ipAddress,
  };

  try {
    // 1. Write to system_audit_logs
    await setDoc(doc(db, PRIMARY_COLLECTION, logId), systemRecord);
    // 2. Write to admin_audit_logs
    await setDoc(doc(db, LEGACY_COLLECTION, logId), record);
    console.log(`[Firestore Audit] Successfully persisted ${event.action} (${logId}) to Firestore [${PRIMARY_COLLECTION}].`);
    return record;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `${PRIMARY_COLLECTION}/${logId}`);
    return record;
  }
}

/**
 * Fetch latest audit logs from Firestore.
 */
export async function getFirestoreAuditLogs(maxRecords: number = 50): Promise<FirestoreAdminAuditLog[]> {
  try {
    const q = query(
      collection(db, PRIMARY_COLLECTION),
      orderBy('timestamp', 'desc'),
      limit(maxRecords)
    );
    const snap = await getDocs(q);
    const logs: FirestoreAdminAuditLog[] = [];
    snap.forEach((d) => {
      const data = d.data() as any;
      logs.push({
        id: data.id,
        action: data.actionType || data.action,
        category: data.category || 'SYSTEM',
        actorId: data.userUid || data.actorId || 'ADMIN',
        actorEmail: data.actorEmail || 'admin@phivonex.com',
        actorRole: data.actorRole || 'SUPER_ADMIN',
        targetType: data.targetType || 'CONFIG',
        targetId: data.targetId || 'GLOBAL',
        details: data.details || '',
        previousState: typeof data.previousState === 'string' ? data.previousState : JSON.stringify(data.previousState),
        newState: typeof data.newState === 'string' ? data.newState : JSON.stringify(data.newState),
        ipAddress: data.ipAddress,
        createdAt: data.timestamp || data.createdAt || new Date().toISOString(),
      });
    });
    return logs;
  } catch (err) {
    // Fallback to legacy collection
    try {
      const q2 = query(
        collection(db, LEGACY_COLLECTION),
        orderBy('createdAt', 'desc'),
        limit(maxRecords)
      );
      const snap2 = await getDocs(q2);
      const logs2: FirestoreAdminAuditLog[] = [];
      snap2.forEach((d) => {
        logs2.push(d.data() as FirestoreAdminAuditLog);
      });
      return logs2;
    } catch (err2) {
      handleFirestoreError(err2, OperationType.GET, PRIMARY_COLLECTION);
      return [];
    }
  }
}

/**
 * Real-time subscription to Firestore audit log feed.
 */
export function subscribeToFirestoreAuditLogs(
  onUpdate: (logs: FirestoreAdminAuditLog[]) => void,
  maxRecords: number = 50
): () => void {
  try {
    const q = query(
      collection(db, PRIMARY_COLLECTION),
      orderBy('timestamp', 'desc'),
      limit(maxRecords)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const logs: FirestoreAdminAuditLog[] = [];
        snapshot.forEach((d) => {
          const data = d.data() as any;
          logs.push({
            id: data.id,
            action: data.actionType || data.action,
            category: data.category || 'SYSTEM',
            actorId: data.userUid || data.actorId || 'ADMIN',
            actorEmail: data.actorEmail || 'admin@phivonex.com',
            actorRole: data.actorRole || 'SUPER_ADMIN',
            targetType: data.targetType || 'CONFIG',
            targetId: data.targetId || 'GLOBAL',
            details: data.details || '',
            previousState: typeof data.previousState === 'string' ? data.previousState : JSON.stringify(data.previousState),
            newState: typeof data.newState === 'string' ? data.newState : JSON.stringify(data.newState),
            ipAddress: data.ipAddress,
            createdAt: data.timestamp || data.createdAt || new Date().toISOString(),
          });
        });
        onUpdate(logs);
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, PRIMARY_COLLECTION);
      }
    );

    return unsubscribe;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, PRIMARY_COLLECTION);
    return () => {};
  }
}

/**
 * Test server connection on startup.
 */
export async function testFirestoreAuditConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('[Firestore Audit] Client offline or Firestore connecting...');
    }
    return false;
  }
}
