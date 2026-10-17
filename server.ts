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
import { walletRouter } from './src/server/routes/walletRoutes';
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
import { getDb } from './src/server/db/db';
import { startMatchingScheduler } from './src/server/services/binaryMatchingScheduler';
import { executeDailyAutomaticRewardCheck } from './src/server/services/nodeRewardService';
import {
  securityHeadersMiddleware,
  csrfOriginProtection,
  sanitizeProductionErrors,
} from './src/server/middleware/securityMiddleware';
import { validateProductionConfig } from './src/config/integrationConfig';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  // Configuration validation for production environment (logs warnings gracefully)
  try {
    validateProductionConfig();
  } catch (configErr) {
    console.warn('[CONFIG_WARNING] Production configuration note:', configErr);
  }

  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  const isProd = process.env.NODE_ENV === 'production';

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
  app.use('/api/node-orders', orderRouter);
  app.use('/api/referral-commissions', commissionRouter);
  app.use('/api/network', networkRouter);
  app.use('/api/matching', matchingRouter);
  app.use('/api/promotions', promotionRouter);
  app.use('/api/wallet', walletRouter);
  app.use('/api/wallets', walletRouter);
  app.use('/api/rewards', rewardRouter);
  app.use('/api/public/network', publicNetworkRouter);
  app.use('/api/withdrawals', withdrawalRouter);
  app.use('/api/deposits', depositRouter);
  app.use('/api/swap', swapRouter);
  app.use('/api/notifications', notificationRouter);
  app.use('/api/admin/economics', economicRouter);
  app.use('/api/economic', publicEconomicRouter);
  app.use('/api/webhooks/email', emailWebhookRouter);
  app.use('/api/diagnostics', diagnosticRouter);
  app.use('/api/support', supportRouter);
  app.use('/api/kyc', kycRouter);
  app.use('/api/admin', adminRouter);

  // Health checks
  app.get('/healthz', (req, res) => {
    res.status(200).send('OK');
  });

  app.get('/api/health', async (req, res) => {
    try {
      const db = await getDb();
      await db.query('SELECT 1');
      res.status(200).json({ status: 'ok', database: 'connected', time: new Date().toISOString() });
    } catch (err: any) {
      console.error('[Health Check Error] PostgreSQL connection verification failed:', err);
      res.status(503).json({ status: 'unhealthy', error: 'Database unavailable or unhealthy', time: new Date().toISOString() });
    }
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
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[PHIVONEX Server] Running on http://0.0.0.0:${PORT}`);
  });

  // Initialize Database Schema and background schedulers asynchronously
  getDb().then(() => {
    console.log('[Server] Database and referral migrations initialized.');
    startMatchingScheduler();

    // Start Daily Mining Reward Automation Check (Every 60 seconds)
    setInterval(() => {
      executeDailyAutomaticRewardCheck().catch((err) =>
        console.error('[RewardScheduler] Interval error:', err)
      );
    }, 60000);
  }).catch((err) => {
    console.error('[Server] Failed to initialize database on startup:', err);
  });
}

startServer().catch((err) => {
  console.error('[PHIVONEX Server Error]', err);
  process.exit(1);
});
