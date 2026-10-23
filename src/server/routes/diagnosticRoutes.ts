import { Router, Request, Response } from 'express';
import { checkCloudSqlConnection } from '../utils/cloudSqlDiagnostic';
import { verifyLedgerSynchronization } from '../utils/ledgerSyncDiagnostic';

export const diagnosticRouter = Router();

/**
 * GET /api/diagnostics/cloudsql
 * Full diagnostic verification for Cloud SQL PostgreSQL connection.
 * Logs status strictly without exposing credentials.
 */
diagnosticRouter.get('/cloudsql', async (req: Request, res: Response) => {
  try {
    const report = await checkCloudSqlConnection({ logStatus: true });

    if (report.status === 'connected') {
      return res.status(200).json({
        success: true,
        message: 'Cloud SQL PostgreSQL connection verified successfully.',
        diagnostic: report,
      });
    }

    return res.status(503).json({
      success: false,
      message: 'Cloud SQL PostgreSQL connection verification failed.',
      diagnostic: report,
    });
  } catch (err: any) {
    console.error('[Diagnostic Router Error]', err);
    return res.status(500).json({
      success: false,
      error: 'DIAGNOSTIC_FAILURE',
      message: 'An internal error occurred while executing database diagnostics.',
    });
  }
});

/**
 * GET /api/diagnostics/cloudsql/summary
 * Lightweight summary probe for monitoring systems.
 */
diagnosticRouter.get('/cloudsql/summary', async (req: Request, res: Response) => {
  try {
    const report = await checkCloudSqlConnection({ logStatus: false });

    return res.status(report.status === 'connected' ? 200 : 503).json({
      status: report.status,
      engine: report.engine,
      version: report.version,
      database: report.database,
      user: report.user,
      latencyMs: report.latencyMs,
      tablesCount: report.publicTablesCount,
      allCoreTablesPresent: report.requiredCoreTablesVerified,
      timestamp: report.timestamp,
    });
  } catch (err: any) {
    return res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve diagnostic summary.',
    });
  }
});

/**
 * GET /api/diagnostics/ledger-sync
 * Diagnostic utility endpoint to verify synchronization between dashboard states and backend ledger records.
 * Ensures no transaction data is lost across application updates or deployments.
 */
diagnosticRouter.get('/ledger-sync', async (req: Request, res: Response) => {
  try {
    const report = await verifyLedgerSynchronization();
    const statusCode = report.status === 'error' ? 503 : 200;
    return res.status(statusCode).json({
      success: report.status !== 'error',
      report,
    });
  } catch (err: any) {
    console.error('[Diagnostic Router Error] Ledger sync diagnostic failed:', err);
    return res.status(500).json({
      success: false,
      error: 'LEDGER_SYNC_DIAGNOSTIC_ERROR',
      message: 'Failed to execute ledger synchronization diagnostic check.',
    });
  }
});

/**
 * GET /api/health/db (or /api/diagnostics/health)
 * High-speed live database health check
 */
diagnosticRouter.get('/health', async (req: Request, res: Response) => {
  try {
    const start = performance.now();
    const report = await checkCloudSqlConnection({ logStatus: false });
    const duration = parseFloat((performance.now() - start).toFixed(2));

    if (report.connected) {
      return res.status(200).json({
        status: 'ok',
        databaseEngine: report.engine,
        databaseName: report.database,
        latencyMs: report.latencyMs || duration,
        time: new Date().toISOString(),
      });
    }

    return res.status(503).json({
      status: 'degraded',
      error: report.error || 'Database unavailable',
      time: new Date().toISOString(),
    });
  } catch (err: any) {
    return res.status(503).json({
      status: 'unhealthy',
      time: new Date().toISOString(),
    });
  }
});
