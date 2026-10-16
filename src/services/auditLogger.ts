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
import { OperationType, handleFirestoreError } from './firestoreAuditService';

export interface SystemAuditLog {
  id: string;
  userUid: string;
  timestamp: string;
  actionType: string;
  category: string;
  details: string;
  metadata?: Record<string, any>;
  targetType?: string;
  targetId?: string;
  actorEmail?: string;
  actorRole?: string;
  previousState?: any;
  newState?: any;
  ipAddress?: string;
}

export interface AuditLogPayload {
  userUid?: string;
  timestamp?: string;
  actionType: string;
  category?: 'CONFIG_UPDATE' | 'TREASURY_MOVEMENT' | 'FINANCIAL_SETTLEMENT' | 'SECURITY' | 'SYSTEM' | string;
  targetType?: string;
  targetId?: string;
  details?: string;
  metadata?: Record<string, any>;
  previousState?: any;
  newState?: any;
  ipAddress?: string;
  actorEmail?: string;
  actorRole?: string;
}

/**
 * Reusable AuditLogger service utility that writes event logs to 'system_audit_logs' collection in Firestore,
 * capturing user UID, timestamp, action type, and metadata for tracking administrative operations.
 */
export class AuditLoggerService {
  private collectionName = 'system_audit_logs';
  private legacyCollectionName = 'admin_audit_logs';

  /**
   * Core logging method that writes an event log to the 'system_audit_logs' collection in Firestore.
   */
  async log(payload: AuditLogPayload): Promise<SystemAuditLog> {
    const logId = uuidv4();
    const now = payload.timestamp || new Date().toISOString();
    const resolvedUid = payload.userUid || auth.currentUser?.uid || 'ADMIN_UID_DIRECT';
    const resolvedEmail = payload.actorEmail || auth.currentUser?.email || 'admin@phivonex.com';

    const entry: SystemAuditLog = {
      id: logId,
      userUid: String(resolvedUid).slice(0, 128),
      timestamp: now,
      actionType: String(payload.actionType).slice(0, 100),
      category: payload.category || 'SYSTEM',
      targetType: payload.targetType || 'SYSTEM_CONTROL',
      targetId: payload.targetId || 'GLOBAL',
      actorEmail: resolvedEmail.slice(0, 200),
      actorRole: payload.actorRole || 'SUPER_ADMIN',
      details: payload.details ? payload.details.slice(0, 2000) : `Administrative operation ${payload.actionType} completed.`,
      metadata: payload.metadata || {},
      previousState: payload.previousState !== undefined ? payload.previousState : null,
      newState: payload.newState !== undefined ? payload.newState : null,
      ipAddress: payload.ipAddress || (typeof window !== 'undefined' ? window.location.hostname : 'SERVER_RUNTIME'),
    };

    try {
      // 1. Primary write to 'system_audit_logs'
      const docRef = doc(db, this.collectionName, logId);
      await setDoc(docRef, entry);

      // 2. Dual write to 'admin_audit_logs' for unified display across UI surfaces
      try {
        const legacyDocRef = doc(db, this.legacyCollectionName, logId);
        await setDoc(legacyDocRef, {
          id: logId,
          action: entry.actionType,
          category: entry.category,
          actorId: entry.userUid,
          actorEmail: entry.actorEmail,
          actorRole: entry.actorRole,
          targetType: entry.targetType,
          targetId: entry.targetId,
          details: entry.details,
          previousState: entry.previousState ? (typeof entry.previousState === 'string' ? entry.previousState : JSON.stringify(entry.previousState)) : '',
          newState: entry.newState ? (typeof entry.newState === 'string' ? entry.newState : JSON.stringify(entry.newState)) : '',
          ipAddress: entry.ipAddress,
          createdAt: entry.timestamp,
        });
      } catch (subErr) {
        // Non-blocking for secondary collection
      }

      console.log(`[AuditLogger] Recorded action '${entry.actionType}' (Doc ID: ${logId}) to Firestore.`);
      return entry;
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `${this.collectionName}/${logId}`);
      return entry;
    }
  }

  /**
   * Universal logAction trigger method for recording sensitive administrative actions or treasury changes.
   * Supports structured AuditLogPayload, or shorthand actionType with details/metadata parameters.
   */
  async logAction(
    actionOrPayload: string | AuditLogPayload,
    detailsOrParams?: string | Record<string, any>,
    extraMetadata?: Record<string, any>
  ): Promise<SystemAuditLog> {
    if (typeof actionOrPayload === 'object' && actionOrPayload !== null) {
      return this.log(actionOrPayload);
    }

    const actionType = String(actionOrPayload);
    let category: string = 'SYSTEM';
    if (actionType.includes('TREASURY') || actionType.includes('SWEEP') || actionType.includes('WALLET') || actionType.includes('RESERVE')) {
      category = 'TREASURY_MOVEMENT';
    } else if (actionType.includes('CONFIG') || actionType.includes('PARAMETER') || actionType.includes('SETTING')) {
      category = 'CONFIG_UPDATE';
    } else if (actionType.includes('SECURITY') || actionType.includes('USER_LOCK') || actionType.includes('USER_STATUS') || actionType.includes('ROLE')) {
      category = 'SECURITY';
    } else if (actionType.includes('SETTLEMENT') || actionType.includes('WITHDRAWAL') || actionType.includes('PAYOUT')) {
      category = 'FINANCIAL_SETTLEMENT';
    }

    if (typeof detailsOrParams === 'object' && detailsOrParams !== null && !Array.isArray(detailsOrParams)) {
      return this.log({
        actionType,
        category: (detailsOrParams.category as any) || category,
        details: detailsOrParams.details || detailsOrParams.reason || `Administrative action ${actionType} triggered.`,
        userUid: detailsOrParams.userUid,
        actorEmail: detailsOrParams.actorEmail,
        targetType: detailsOrParams.targetType || 'ADMIN_CONTROL',
        targetId: detailsOrParams.targetId,
        previousState: detailsOrParams.previousState,
        newState: detailsOrParams.newState,
        metadata: {
          ...detailsOrParams.metadata,
          ...(extraMetadata || {}),
        },
      });
    }

    return this.log({
      actionType,
      category,
      details: typeof detailsOrParams === 'string' ? detailsOrParams : `Administrative action ${actionType} recorded.`,
      metadata: extraMetadata || {},
    });
  }

  /**
   * Log a configuration update event to Firestore.
   */
  async logConfigUpdate(params: {
    configKey: string;
    oldValue: any;
    newValue: any;
    userUid?: string;
    actorEmail?: string;
    reason?: string;
    details?: string;
    metadata?: Record<string, any>;
  }): Promise<SystemAuditLog> {
    return this.log({
      actionType: `CONFIG_UPDATE_${params.configKey}`,
      category: 'CONFIG_UPDATE',
      targetType: 'ECONOMIC_CONFIG',
      targetId: params.configKey,
      userUid: params.userUid,
      actorEmail: params.actorEmail,
      previousState: params.oldValue,
      newState: params.newValue,
      details: params.details || `Config update for parameter '${params.configKey}'.${params.reason ? ` Reason: ${params.reason}` : ''}`,
      metadata: {
        configKey: params.configKey,
        reason: params.reason,
        ...(params.metadata || {}),
      },
    });
  }

  /**
   * Log a treasury movement or reserve sweep to Firestore.
   */
  async logTreasuryMovement(params: {
    actionType: string;
    amount?: number;
    currency?: string;
    fromAddress?: string;
    toAddress?: string;
    txHash?: string;
    userUid?: string;
    actorEmail?: string;
    details?: string;
    metadata?: Record<string, any>;
  }): Promise<SystemAuditLog> {
    return this.log({
      actionType: params.actionType,
      category: 'TREASURY_MOVEMENT',
      targetType: 'TREASURY_WALLET',
      targetId: params.toAddress || params.txHash || 'TREASURY_HOT_WALLET',
      userUid: params.userUid,
      actorEmail: params.actorEmail,
      details: params.details || `Treasury movement executed: ${params.actionType} (${params.amount ?? 'N/A'} ${params.currency || 'USDT'}).`,
      metadata: {
        amount: params.amount,
        currency: params.currency || 'USDT',
        fromAddress: params.fromAddress,
        toAddress: params.toAddress,
        txHash: params.txHash,
        ...(params.metadata || {}),
      },
    });
  }

  /**
   * Log a financial settlement or withdrawal transition.
   */
  async logSettlement(params: {
    actionType: string;
    withdrawalId?: string;
    amount?: number;
    currency?: string;
    destinationAddress?: string;
    userUid?: string;
    actorEmail?: string;
    details?: string;
    metadata?: Record<string, any>;
  }): Promise<SystemAuditLog> {
    return this.log({
      actionType: params.actionType,
      category: 'FINANCIAL_SETTLEMENT',
      targetType: 'WITHDRAWAL_REQUEST',
      targetId: params.withdrawalId || 'WITHDRAWAL',
      userUid: params.userUid,
      actorEmail: params.actorEmail,
      details: params.details || `Financial settlement action: ${params.actionType} for withdrawal ${params.withdrawalId || ''}`,
      metadata: {
        withdrawalId: params.withdrawalId,
        amount: params.amount,
        currency: params.currency || 'USDT',
        destinationAddress: params.destinationAddress,
        ...(params.metadata || {}),
      },
    });
  }

  /**
   * Log a security or RBAC event to Firestore.
   */
  async logSecurityEvent(params: {
    actionType: string;
    userUid?: string;
    actorEmail?: string;
    details?: string;
    metadata?: Record<string, any>;
  }): Promise<SystemAuditLog> {
    return this.log({
      actionType: params.actionType,
      category: 'SECURITY',
      targetType: 'ACCESS_CONTROL',
      targetId: params.userUid || 'RBAC',
      userUid: params.userUid,
      actorEmail: params.actorEmail,
      details: params.details || `Security audit event: ${params.actionType}`,
      metadata: params.metadata || {},
    });
  }

  /**
   * Query recent system audit logs from Firestore.
   */
  async getLogs(maxRecords: number = 50): Promise<SystemAuditLog[]> {
    try {
      const q = query(
        collection(db, this.collectionName),
        orderBy('timestamp', 'desc'),
        limit(maxRecords)
      );
      const snap = await getDocs(q);
      const logs: SystemAuditLog[] = [];
      snap.forEach((d) => {
        logs.push(d.data() as SystemAuditLog);
      });
      return logs;
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, this.collectionName);
      return [];
    }
  }

  /**
   * Subscribe in real-time to the 'system_audit_logs' collection.
   */
  subscribeToLogs(
    onUpdate: (logs: SystemAuditLog[]) => void,
    maxRecords: number = 100
  ): () => void {
    try {
      const q = query(
        collection(db, this.collectionName),
        orderBy('timestamp', 'desc'),
        limit(maxRecords)
      );

      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const logs: SystemAuditLog[] = [];
          snapshot.forEach((d) => {
            logs.push(d.data() as SystemAuditLog);
          });
          onUpdate(logs);
        },
        (error) => {
          handleFirestoreError(error, OperationType.GET, this.collectionName);
        }
      );

      return unsubscribe;
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, this.collectionName);
      return () => {};
    }
  }

  /**
   * Format an array of SystemAuditLog records as an RFC 4180 compliant CSV string.
   */
  formatLogsToCsv(logs: SystemAuditLog[]): string {
    const headers = [
      'Log ID',
      'Timestamp (ISO)',
      'Action Type',
      'Category',
      'User UID (Actor)',
      'Actor Email',
      'Actor Role',
      'Target Type',
      'Target ID',
      'Details',
      'Metadata JSON',
      'Previous State',
      'New State',
      'IP Address'
    ];

    const escapeCsvField = (field: any): string => {
      if (field === null || field === undefined) return '""';
      let stringValue = '';
      if (typeof field === 'object') {
        try {
          stringValue = JSON.stringify(field);
        } catch {
          stringValue = String(field);
        }
      } else {
        stringValue = String(field);
      }
      return `"${stringValue.replace(/"/g, '""')}"`;
    };

    const rows = logs.map((log) => [
      escapeCsvField(log.id),
      escapeCsvField(log.timestamp),
      escapeCsvField(log.actionType),
      escapeCsvField(log.category),
      escapeCsvField(log.userUid),
      escapeCsvField(log.actorEmail || ''),
      escapeCsvField(log.actorRole || ''),
      escapeCsvField(log.targetType || 'SYSTEM'),
      escapeCsvField(log.targetId || 'GLOBAL'),
      escapeCsvField(log.details || ''),
      escapeCsvField(log.metadata || {}),
      escapeCsvField(log.previousState !== null && log.previousState !== undefined ? log.previousState : ''),
      escapeCsvField(log.newState !== null && log.newState !== undefined ? log.newState : ''),
      escapeCsvField(log.ipAddress || '')
    ].join(','));

    return [headers.join(','), ...rows].join('\r\n');
  }

  /**
   * Export 'system_audit_logs' collection from Firestore as a CSV file for compliance reporting.
   */
  async exportLogsToCsvFile(options?: {
    filename?: string;
    maxRecords?: number;
    category?: string;
    searchQuery?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<{ success: boolean; count: number; filename: string }> {
    try {
      const maxRecords = options?.maxRecords || 500;
      let logs = await this.getLogs(maxRecords);

      // Apply client-side filters if specified
      if (options?.category && options.category !== 'ALL') {
        logs = logs.filter((l) => l.category === options.category);
      }
      if (options?.searchQuery) {
        const q = options.searchQuery.toLowerCase();
        logs = logs.filter(
          (l) =>
            l.actionType?.toLowerCase().includes(q) ||
            l.details?.toLowerCase().includes(q) ||
            l.userUid?.toLowerCase().includes(q) ||
            l.actorEmail?.toLowerCase().includes(q) ||
            l.targetId?.toLowerCase().includes(q)
        );
      }
      if (options?.startDate) {
        const startTs = new Date(options.startDate).getTime();
        logs = logs.filter((l) => new Date(l.timestamp).getTime() >= startTs);
      }
      if (options?.endDate) {
        const endTs = new Date(options.endDate).getTime();
        logs = logs.filter((l) => new Date(l.timestamp).getTime() <= endTs);
      }

      const csvData = this.formatLogsToCsv(logs);
      const filename = options?.filename || `phivonex_compliance_audit_logs_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;

      // Trigger browser file download if in DOM environment
      if (typeof window !== 'undefined' && typeof document !== 'undefined') {
        const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }

      // Record an audit log for the compliance export operation
      try {
        await this.log({
          actionType: 'COMPLIANCE_AUDIT_LOG_EXPORT_CSV',
          category: 'SECURITY',
          targetType: 'SYSTEM_AUDIT_LOGS',
          targetId: filename,
          details: `Exported ${logs.length} compliance audit logs to CSV (${filename}).`,
          metadata: {
            exportedRecordsCount: logs.length,
            filename,
            categoryFilter: options?.category || 'ALL',
            exportedAt: new Date().toISOString()
          }
        });
      } catch (logErr) {
        console.warn('[AuditLogger] Could not record CSV export action:', logErr);
      }

      return {
        success: true,
        count: logs.length,
        filename
      };
    } catch (err) {
      console.error('[AuditLogger] Failed to export system_audit_logs as CSV:', err);
      throw err;
    }
  }

  /**
   * Verify Firestore connection.
   */
  async testConnection(): Promise<boolean> {
    try {
      await getDocFromServer(doc(db, 'test', 'connection'));
      return true;
    } catch (error) {
      if (error instanceof Error && error.message.includes('the client is offline')) {
        console.warn('[AuditLogger] Firestore client offline or connecting...');
      }
      return false;
    }
  }
}

export const AuditLogger = new AuditLoggerService();
export const logAction = (
  action: string | AuditLogPayload,
  detailsOrParams?: string | Record<string, any>,
  extraMetadata?: Record<string, any>
) => AuditLogger.logAction(action, detailsOrParams, extraMetadata);

export const exportAuditLogsToCsv = (options?: {
  filename?: string;
  maxRecords?: number;
  category?: string;
  searchQuery?: string;
  startDate?: string;
  endDate?: string;
}) => AuditLogger.exportLogsToCsvFile(options);
