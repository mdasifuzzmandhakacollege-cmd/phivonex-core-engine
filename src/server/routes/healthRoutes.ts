import { Router, Request, Response } from 'express';
import { getDb } from '../db/db';
import { checkEpochFreshness } from '../services/observabilityService';

export const healthRouter = Router();

/**
 * GET /api/health (and GET /health)
 * Cloud Run production health probe verifying PostgreSQL connectivity (SELECT 1),
 * core schema readiness, and process uptime status (HTTP 200 healthy / HTTP 503 degraded).
 */
healthRouter.get('/', async (_req: Request, res: Response): Promise<void> => {
  const startedAt = Date.now();
  try {
    const db = await getDb();
    const pingRes = await db.query<{ healthy: number }>('SELECT 1 AS healthy');
    const dbConnected = Number(pingRes.rows[0]?.healthy) === 1;

    if (!dbConnected) {
      res.status(503).json({
        status: 'degraded',
        database: 'disconnected',
        schemaReady: false,
        uptimeSeconds: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const requiredTables = [
      'users',
      'financial_ledger_entries',
      'user_trading_positions',
      'user_vault_positions',
      'email_delivery_logs',
    ];
    const tableCheckRes = await db.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
      [requiredTables]
    );
    const presentTables = new Set(tableCheckRes.rows.map((r) => r.table_name));
    const missingTables = requiredTables.filter((t) => !presentTables.has(t));
    const schemaReady = missingTables.length === 0;

    res.status(schemaReady ? 200 : 503).json({
      status: schemaReady ? 'healthy' : 'degraded',
      service: 'PHIVONEX Core Engine',
      database: 'connected',
      schemaReady,
      ...(missingTables.length > 0 ? { missingTables } : {}),
      latencyMs: Date.now() - startedAt,
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(503).json({
      status: 'degraded',
      database: 'unavailable',
      schemaReady: false,
      error: err?.message || 'HEALTH_CHECK_FAILED',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /health/live
 * Fast liveness probe for container orchestration.
 */
healthRouter.get('/live', (_req: Request, res: Response): void => {
  res.status(200).json({
    status: 'ALIVE',
    service: 'PHIVONEX Protocol Node',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    memoryUsage: process.memoryUsage(),
  });
});

/**
 * GET /health/ready
 * Deep readiness probe verifying PostgreSQL connectivity, circuit breaker state, and epoch freshness.
 */
healthRouter.get('/ready', async (_req: Request, res: Response): Promise<void> => {
  try {
    const db = await getDb();
    const dbRes = await db.query('SELECT 1 AS healthy');
    const dbConnected = dbRes.rows[0]?.healthy === 1;

    if (!dbConnected) {
      res.status(503).json({
        status: 'NOT_READY',
        reason: 'DATABASE_DISCONNECTED',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Check Circuit Breaker mode
    const cbRes = await db.query(
      `SELECT withdrawal_mode, trip_reason FROM system_circuit_breaker_configs WHERE id = 1 LIMIT 1`
    ).catch(() => ({ rows: [] }));

    const circuitBreaker = cbRes.rows[0] || { withdrawal_mode: 'AUTO', trip_reason: null };
    const epochFreshness = await checkEpochFreshness();

    const isHealthy = circuitBreaker.withdrawal_mode !== 'CRITICAL' && epochFreshness.status !== 'CRITICAL';
    const statusCode = isHealthy ? 200 : 530;

    res.status(statusCode).json({
      status: isHealthy ? 'READY' : 'DEGRADED',
      database: 'CONNECTED',
      circuitBreaker: {
        mode: circuitBreaker.withdrawal_mode,
        tripReason: circuitBreaker.trip_reason,
      },
      epochFreshness,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(503).json({
      status: 'NOT_READY',
      error: err.message || 'INTERNAL_ERROR',
      timestamp: new Date().toISOString(),
    });
  }
});
