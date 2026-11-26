import { getDb } from '../db/db';

export interface StructuredLogEvent {
  timestamp: string;
  traceId?: string;
  component: string;
  severity: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL';
  message: string;
  metadata?: Record<string, any>;
}

const SENSITIVE_KEYS = ['privatekey', 'secret', 'authorization', 'password', 'token', 'key', 'credential'];

function redactSensitiveValues(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(redactSensitiveValues);

  const clone: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    const lowerKey = k.toLowerCase();
    const isSensitive = SENSITIVE_KEYS.some((sk) => lowerKey.includes(sk));
    if (isSensitive) {
      clone[k] = '[REDACTED]';
    } else if (v && typeof v === 'object') {
      clone[k] = redactSensitiveValues(v);
    } else {
      clone[k] = v;
    }
  }
  return clone;
}

export function logStructuredEvent(params: {
  component: string;
  severity?: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL';
  message: string;
  traceId?: string;
  metadata?: Record<string, any>;
}): void {
  const event: StructuredLogEvent = {
    timestamp: new Date().toISOString(),
    traceId: params.traceId,
    component: params.component,
    severity: params.severity || 'INFO',
    message: params.message,
    metadata: redactSensitiveValues(params.metadata || {}),
  };

  const output = JSON.stringify(event);
  if (event.severity === 'ERROR' || event.severity === 'CRITICAL') {
    console.error(output);
  } else if (event.severity === 'WARN') {
    console.warn(output);
  } else {
    console.log(output);
  }
}

/**
 * Executes a BSC RPC call with automatic failover across multiple RPC endpoints.
 */
export async function executeWithBscRpcFailover<T>(
  rpcCall: (endpoint: string) => Promise<T>,
  customEndpoints?: string[]
): Promise<T> {
  const endpoints = customEndpoints && customEndpoints.length > 0 ? customEndpoints : [
    'https://bsc-dataseed1.binance.org',
    'https://bsc-dataseed2.binance.org',
    'https://bsc-dataseed3.binance.org',
    'https://rpc.ankr.com/bsc',
  ];

  let lastError: any = null;
  for (const endpoint of endpoints) {
    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('RPC_TIMEOUT: Request timed out after 5000ms')), 5000)
      );
      const result = await Promise.race([rpcCall(endpoint), timeoutPromise]);
      return result;
    } catch (err: any) {
      lastError = err;
      logStructuredEvent({
        component: 'BscRpcFailover',
        severity: 'WARN',
        message: `RPC endpoint ${endpoint} failed, attempting failover.`,
        metadata: { error: err.message },
      });
    }
  }

  throw new Error(`ALL_RPC_ENDPOINTS_FAILED: ${lastError?.message || 'Unknown RPC failure'}`);
}

/**
 * Checks epoch settlement freshness across ecosystem products.
 */
export async function checkEpochFreshness(): Promise<{
  status: 'HEALTHY' | 'DEGRADED' | 'CRITICAL';
  details: Record<string, any>;
}> {
  try {
    const db = await getDb();
    const res = await db.query(
      `SELECT product_type, MAX(epoch_date) AS last_epoch_date, MAX(created_at) AS last_settled_at
       FROM unilevel_yield_events
       GROUP BY product_type`
    );

    const productStatuses: Record<string, any> = {};
    let isDegraded = false;
    const now = new Date();

    for (const row of res.rows) {
      const lastSettled = new Date(row.last_settled_at || 0);
      const diffHours = (now.getTime() - lastSettled.getTime()) / (1000 * 60 * 60);
      const fresh = diffHours < 36; // Expected at least every 24-30 hours
      if (!fresh) isDegraded = true;

      productStatuses[row.product_type] = {
        lastEpochDate: row.last_epoch_date,
        lastSettledAt: row.last_settled_at,
        hoursSinceLastSettlement: Math.round(diffHours),
        isFresh: fresh,
      };
    }

    return {
      status: isDegraded ? 'DEGRADED' : 'HEALTHY',
      details: productStatuses,
    };
  } catch (err: any) {
    logStructuredEvent({
      component: 'EpochFreshnessCheck',
      severity: 'ERROR',
      message: 'Failed to verify epoch freshness.',
      metadata: { error: err.message },
    });
    return {
      status: 'CRITICAL',
      details: { error: err.message },
    };
  }
}
