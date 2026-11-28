import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import authRouter from './src/server/routes/authRoutes';
import referralRouter from './src/server/routes/referralRoutes';
import userRouter from './src/server/routes/userRoutes';
import nodeRouter from './src/server/routes/nodeRoutes';
import orderRouter from './src/server/routes/orderRoutes';
import commissionRouter from './src/server/routes/commissionRoutes';
import networkRouter from './src/server/routes/networkRoutes';
import matchingRouter from './src/server/routes/matchingRoutes';
import { promotionRouter } from './src/server/routes/promotionRoutes';
import { walletRouter, adminLedgerRouter } from './src/server/routes/walletRoutes';
import { rewardRouter } from './src/server/routes/rewardRoutes';
import { publicNetworkRouter } from './src/server/routes/publicNetworkRoutes';
import { withdrawalRouter } from './src/server/routes/withdrawalRoutes';
import { adminRouter } from './src/server/routes/adminRoutes';
import { depositRouter } from './src/server/routes/depositRoutes';
import { economicRouter, publicEconomicRouter } from './src/server/routes/economicRoutes';
import { swapRouter } from './src/server/routes/swapRoutes';
import { notificationRouter } from './src/server/routes/notificationRoutes';
import { emailWebhookRouter } from './src/server/routes/emailWebhookRoutes';
import { diagnosticRouter } from './src/server/routes/diagnosticRoutes';
import { supportRouter } from './src/server/routes/supportRoutes';
import { kycRouter } from './src/server/routes/kycRoutes';
import {
  adminUnilevelConfigRouter,
  publicUnilevelConfigRouter,
  publicEcosystemPromosRouter,
  adminEcosystemPromosRouter,
} from './src/server/routes/unilevelConfigRoutes';
import {
  tradingPoolRouter,
  adminTradingPoolRouter,
} from './src/server/routes/tradingPoolRoutes';
import {
  chronoVaultRouter,
  adminChronoVaultRouter,
} from './src/server/routes/chronoVaultRoutes';
import {
  unilevelRoyaltyRouter,
  adminUnilevelRoyaltyRouter,
} from './src/server/routes/unilevelRoyaltyRoutes';
import {
  unilevelRankRouter,
  adminUnilevelRankRouter,
} from './src/server/routes/unilevelRankRoutes';
import { healthRouter } from './src/server/routes/healthRoutes';
import { legacyRouter } from './src/server/routes/legacyRoutes';
import { getDb, closeDb } from './src/server/db/db';
import { startMatchingScheduler } from './src/server/services/binaryMatchingScheduler';
import { startWeeklyReportScheduler } from './src/server/services/emailReportingService';
import { startDailyAuditScheduler } from './src/server/services/reconciliationService';
import { executeDailyAutomaticRewardCheck } from './src/server/services/nodeRewardService';
import { startTradingYieldScheduler } from './src/server/services/tradingYieldEpochService';
import { startChronoVaultScheduler } from './src/server/services/chronoVaultEpochService';
import { startUnilevelRoyaltyScheduler } from './src/server/services/roiGenerationService';
import {
  securityHeadersMiddleware,
  csrfOriginProtection,
  sanitizeProductionErrors,
} from './src/server/middleware/securityMiddleware';
import { validateProductionConfig } from './src/config/integrationConfig';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Guard process against crashing mid-request on transient background promise rejections
process.on('unhandledRejection', (reason) => {
  console.error('[PHIVONEX Unhandled Rejection]:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[PHIVONEX Uncaught Exception]:', err);
});

async function startServer() {
  // Configuration validation for production environment (logs warnings gracefully)
  try {
    validateProductionConfig();
  } catch (configErr) {
    console.warn('[CONFIG_WARNING] Production configuration note:', configErr);
  }

  const app = express();
  app.set('trust proxy', 1);
  const isProd = process.env.NODE_ENV === 'production';
  const PORT = Number(process.env.PORT) || (isProd ? 8080 : 3000);

  // 1. Security Headers (CSP, X-Content-Type-Options, Frame Protection)
  app.use(securityHeadersMiddleware);

  // 2. Body and cookie parsing with payload limit
  app.use(express.json({
    limit: '1mb',
    verify: (req: any, res, buf) => {
      req.rawBody = buf.toString('utf-8');
    }
  }));
  app.use(cookieParser());

  // 3. CSRF & untrusted origin protection for state-changing operations
  app.use('/api', csrfOriginProtection);

  // Database readiness middleware for all API requests
  app.use(async (req, res, next) => {
    if (req.path.startsWith('/api/') && !req.path.startsWith('/api/health') && !req.path.startsWith('/api/diagnostics')) {
      try {
        await getDb();
        next();
      } catch (dbErr) {
        console.error(`[Server] Database unavailable on ${req.method} ${req.path}:`, dbErr);
        res.status(503).json({
          error: 'DATABASE_UNAVAILABLE',
          message: 'Database is currently initializing. Please retry in a few moments.',
        });
        return;
      }
    } else {
      next();
    }
  });

  // Mount API routes
  app.use('/api/auth', authRouter);
  app.use('/api/referrals', referralRouter);
  app.use('/api/users', userRouter);
  app.use('/api/nodes', nodeRouter);
  app.use('/api/genesis-nodes', nodeRouter);
  app.use('/api/node-orders', orderRouter);
  app.use('/api/referral-commissions', commissionRouter);
  app.use('/api/network', networkRouter);
  app.use('/api/matching', matchingRouter);
  app.use('/api/promotions', promotionRouter);
  app.use('/api/wallet', walletRouter);
  app.use('/api/wallets', walletRouter);
  app.use('/api/rewards', rewardRouter);
  app.use('/api/public/network', publicNetworkRouter);
  app.use('/api/public/ecosystem-config', publicUnilevelConfigRouter);
  app.use('/api/ecosystem/promos', publicEcosystemPromosRouter);
  app.use('/api/admin/ecosystem-promos', adminEcosystemPromosRouter);
  app.use('/api/withdrawals', withdrawalRouter);
  app.use('/api/deposits', depositRouter);
  app.use('/api/swap', swapRouter);
  app.use('/api/notifications', notificationRouter);
  app.use('/api/admin/economics', economicRouter);
  app.use('/api/admin/ecosystem-config', adminUnilevelConfigRouter);
  app.use('/api/admin/unilevel-config', adminUnilevelConfigRouter);
  app.use('/api/admin/trading-pool', adminTradingPoolRouter);
  app.use('/api/trading-pool', tradingPoolRouter);
  app.use('/api/admin/chrono-vaults', adminChronoVaultRouter);
  app.use('/api/chrono-vaults', chronoVaultRouter);
  app.use('/api/admin/unilevel/royalties', adminUnilevelRoyaltyRouter);
  app.use('/api/unilevel/royalties', unilevelRoyaltyRouter);
  app.use('/api/admin/unilevel/ranks', adminUnilevelRankRouter);
  app.use('/api/unilevel/ranks', unilevelRankRouter);
  app.use('/api/admin/ledger', adminLedgerRouter);
  app.use('/api/economic', publicEconomicRouter);
  app.use('/api/webhooks/email', emailWebhookRouter);
  app.use('/api/diagnostics', diagnosticRouter);
  app.use('/api/support', supportRouter);
  app.use('/api/kyc', kycRouter);
  app.use('/api/legacy', legacyRouter);
  app.use('/api/admin/legacy', legacyRouter);
  app.use('/api/admin', adminRouter);
  app.use('/health', healthRouter);
  app.use('/api/health', healthRouter);

  // Health checks (primary /api/health and /health served by healthRouter above)
  app.get('/healthz', (req, res) => {
    res.status(200).send('OK');
  });

  app.get('/api/health/db', (req, res, next) => {
    req.url = '/health';
    diagnosticRouter(req, res, next);
  });

  // Centralized Error Sanitization Middleware for API routes
  app.use('/api', sanitizeProductionErrors);

  // Vite middleware in dev, static files in production
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');

    // Hashed JS/CSS bundle assets in /assets can be cached long-term
    app.use('/assets', express.static(path.join(distPath, 'assets'), {
      maxAge: '1y',
      immutable: true,
    }));

    // Other static files (brand logos, manifest, favicons)
    app.use(express.static(distPath, {
      maxAge: '1h',
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
        }
      },
    }));

    // SPA Fallback: Always serve index.html with no-cache headers so browsers receive fresh asset hashes
    app.get('*', (req, res) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  // Start listening on PORT immediately so Cloud Run liveness/port check passes with zero delay
  const httpServer = app.listen(PORT, '0.0.0.0', () => {
    console.log(`[PHIVONEX Server] Running on http://0.0.0.0:${PORT}`);
  });

  // CRITICAL for Google Cloud Run / Firebase App Hosting Envoy proxy:
  // Envoy keeps idle upstream HTTP/1.1 sockets open for 60s. Node.js defaults to 5s,
  // which causes Envoy 503 "upstream connect error or disconnect/reset before headers"
  // whenever a user submits Login after sitting on the page for >5s.
  httpServer.keepAliveTimeout = 65000;
  httpServer.headersTimeout = 66000;
  httpServer.requestTimeout = 60000;

  // Graceful shutdown so in-flight requests complete cleanly during Cloud Run rollouts
  const gracefulShutdown = (signal: string) => {
    console.log(`[PHIVONEX Server] Received ${signal}. Draining active connections...`);
    httpServer.close(() => {
      closeDb().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(0), 10000).unref();
  };
  process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.once('SIGINT', () => gracefulShutdown('SIGINT'));

  // Initialize Database Schema and background schedulers asynchronously
  getDb().then(async (db) => {
    console.log('[Server] Database and referral migrations initialized.');

    const resetMarkerRes = await db
      .query<{ config_value: string }>(
        `SELECT config_value::text FROM unilevel_master_configs WHERE config_key = 'pre_launch_unilevel_reset_completed' LIMIT 1`
      )
      .catch(() => ({ rows: [] as Array<{ config_value: string }> }));
    const isPreLaunchResetCompleted = Number(resetMarkerRes.rows[0]?.config_value || 0) >= 1;

    if (isPreLaunchResetCompleted) {
      console.log('[Server] Pre-launch Unilevel reset marker detected — skipping legacy genealogy seed & legacy spot auto-reconciliation.');
    } else {
      // Seed and sync genealogy tree accounts to PostgreSQL, Firebase Auth & Firestore
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const { seedGenealogyNetworkTree } = await import('./src/server/services/genealogySeedService');
          await seedGenealogyNetworkTree();

          // Auto-reconcile direct referral commissions only if spot commission engine is enabled
          const { ENABLE_SPOT_COMMISSION, ENABLE_BINARY_ENGINE } = await import('./src/config/referralConfig');
          if (ENABLE_SPOT_COMMISSION) {
            const { reconcileUnprocessedReferralCommissions } = await import('./src/server/services/referralCommissionService');
            await reconcileUnprocessedReferralCommissions();
          }

          // Auto-reconcile wallet ledgers for all users in the system
          const { reconcileAllUserBalances } = await import('./src/server/services/walletLedgerService');
          await reconcileAllUserBalances();

          // Auto-reconcile specific affiliate accounts (Maya & Samrat)
          const { reconcileSpecificAffiliateAccounts } = await import('./src/server/services/affiliateAutoReconcileService');
          await reconcileSpecificAffiliateAccounts();

          console.log('[Server] Genealogy seed & startup reconciliation completed successfully.');
          void ENABLE_BINARY_ENGINE;
          break;
        } catch (seedErr: any) {
          const msg = seedErr?.message || '';
          const isConnErr = msg.includes('Connection terminated') || seedErr?.code === '57P01' || msg.includes('socket');
          if (attempt < 3 && isConnErr) {
            console.warn(`[Server] Startup genealogy seed attempt ${attempt} interrupted (${msg}). Retrying in 1s...`);
            await new Promise((r) => setTimeout(r, 1000));
          } else {
            console.warn('[Server] Genealogy seed & referral commission startup notice:', seedErr);
            break;
          }
        }
      }
    }

    const { ENABLE_BINARY_ENGINE: binaryEngineEnabled } = await import('./src/config/referralConfig');
    if (binaryEngineEnabled) {
      startMatchingScheduler();
    }
    startWeeklyReportScheduler();
    startDailyAuditScheduler();
    startTradingYieldScheduler();
    startChronoVaultScheduler();
    startUnilevelRoyaltyScheduler();

    // Run initial automatic daily reward catch-up immediately on startup, then every 60 seconds
    executeDailyAutomaticRewardCheck().catch((err) =>
      console.error('[RewardScheduler] Startup check error:', err)
    );
    setInterval(() => {
      executeDailyAutomaticRewardCheck().catch((err) =>
        console.error('[RewardScheduler] Interval error:', err)
      );
    }, 60000);
  }).catch((err) => {
    console.error('[Server] Initial database connection delay on boot:', err?.message || err);
    // Retry initialization in 3 seconds to recover if Cloud SQL socket took time to mount
    setTimeout(() => {
      getDb()
        .then(async (db) => {
          const resetMarkerRes = await db
            .query<{ config_value: string }>(
              `SELECT config_value::text FROM unilevel_master_configs WHERE config_key = 'pre_launch_unilevel_reset_completed' LIMIT 1`
            )
            .catch(() => ({ rows: [] as Array<{ config_value: string }> }));
          if (Number(resetMarkerRes.rows[0]?.config_value || 0) < 1) {
            const { reconcileSpecificAffiliateAccounts } = await import('./src/server/services/affiliateAutoReconcileService');
            await reconcileSpecificAffiliateAccounts();
          }
        })
        .catch((retryErr) => console.warn('[Server] DB retry initialization notice:', retryErr?.message || retryErr));
    }, 3000);
  });
}

startServer().catch((err) => {
  console.error('[PHIVONEX Server Error]', err);
  process.exit(1);
});
