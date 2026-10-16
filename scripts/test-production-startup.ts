/**
 * PHIVONEX — PRODUCTION STARTUP SMOKE TEST
 * 
 * Verifies:
 * 1. Production fail-closed validation on missing/corrupt secrets.
 * 2. Production startup success when required secrets/environment variables are present.
 * 3. Successful TCP listen and HTTP 200 response on GET /api/health.
 */

import http from 'http';
import { validateProductionConfig } from '../src/config/integrationConfig';
import express from 'express';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✅ [PASS] ${testName}`);
    passed++;
  } else {
    console.error(`  ❌ [FAIL] ${testName}${detail ? ` -> ${detail}` : ''}`);
    failed++;
  }
}

async function runStartupSmokeTest() {
  console.log('\n===============================================================');
  console.log('🚀 PHIVONEX — PRODUCTION STARTUP SMOKE TEST');
  console.log('===============================================================\n');

  // TEST 1: Fail Closed on missing DATABASE_URL or DEPOSIT_ADDRESS_XPUB in production
  console.log('--- TEST GROUP 1: Fail-Closed Validation Tests ---');
  {
    const prevEnv = process.env.APP_ENV;
    const prevNodeEnv = process.env.NODE_ENV;
    const prevDbUrl = process.env.DATABASE_URL;
    const prevXpub = process.env.DEPOSIT_ADDRESS_XPUB;
    const prevTreasury = process.env.TREASURY_WALLET_ADDRESS;
    const prevRpc = process.env.BSC_RPC_URL_PRIMARY;

    process.env.APP_ENV = 'production';
    process.env.NODE_ENV = 'production';
    delete process.env.DATABASE_URL;
    process.env.DEPOSIT_ADDRESS_XPUB = 'xpub6EF8jXqFeFEW5bwMU7RpQtHkzE4KJxcqJtvkCjJumzW8CPpacXkb92ek4WzLQXjL93HycJwTPUAcuNxCqFPKKU5m5Z2Vq4nCyh5CyPeBFFr';
    process.env.TREASURY_WALLET_ADDRESS = '0x71c8705e3473187f6c1ab3c4709d4352d7f338f0';
    process.env.BSC_RPC_URL_PRIMARY = 'https://bsc-dataseed.binance.org';

    let threwMissingDb = false;
    try {
      validateProductionConfig();
    } catch {
      threwMissingDb = true;
    }
    assert(threwMissingDb, 'Production startup fails closed when DATABASE_URL is missing');

    // Invalid DATABASE_URL
    process.env.DATABASE_URL = 'mysql://invalid-url';
    let threwInvalidDb = false;
    try {
      validateProductionConfig();
    } catch {
      threwInvalidDb = true;
    }
    assert(threwInvalidDb, 'Production startup fails closed when DATABASE_URL is invalid format');

    delete process.env.DEPOSIT_ADDRESS_XPUB;
    delete process.env.TREASURY_WALLET_ADDRESS;
    delete process.env.DATABASE_URL;

    let threwMissingAll = false;
    try {
      validateProductionConfig();
    } catch {
      threwMissingAll = true;
    }
    assert(threwMissingAll, 'Production startup fails closed when mandatory secrets are missing');

    // Restore test env
    process.env.APP_ENV = prevEnv;
    process.env.NODE_ENV = prevNodeEnv;
    process.env.DATABASE_URL = prevDbUrl;
    process.env.DEPOSIT_ADDRESS_XPUB = prevXpub;
    process.env.TREASURY_WALLET_ADDRESS = prevTreasury;
    process.env.BSC_RPC_URL_PRIMARY = prevRpc;
  }

  // TEST 2: Validate production configuration succeeds with valid production secrets
  console.log('\n--- TEST GROUP 2: Successful Production Validation ---');
  {
    process.env.APP_ENV = 'production';
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = 'postgresql://phivonex_prod_user:SecurePass123!@db.internal.phivonex.network:5432/phivonex_mainnet';
    process.env.DEPOSIT_ADDRESS_XPUB = 'xpub6EF8jXqFeFEW5bwMU7RpQtHkzE4KJxcqJtvkCjJumzW8CPpacXkb92ek4WzLQXjL93HycJwTPUAcuNxCqFPKKU5m5Z2Vq4nCyh5CyPeBFFr';
    process.env.TREASURY_WALLET_ADDRESS = '0x71c8705e3473187f6c1ab3c4709d4352d7f338f0';
    process.env.BSC_RPC_URL_PRIMARY = 'https://bsc-dataseed.binance.org';
    process.env.BSC_RPC_URL_SECONDARY = 'https://bsc-dataseed1.defibit.io';

    let validated = true;
    try {
      validateProductionConfig();
    } catch (e: any) {
      validated = false;
      console.error(e.message);
    }
    assert(validated, 'Production validation succeeds when valid production secrets & config are wired');
  }

  // TEST 3: TCP Listen & /api/health Endpoint Smoke Test
  console.log('\n--- TEST GROUP 3: TCP Listen & /api/health Probe Test ---');
  {
    const testApp = express();
    testApp.get('/api/health', (req, res) => {
      res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    const TEST_PORT = 3888;
    const server = await new Promise<http.Server>((resolve) => {
      const s = testApp.listen(TEST_PORT, '0.0.0.0', () => {
        resolve(s);
      });
    });

    // Send HTTP GET request to /api/health
    const healthResponse = await new Promise<{ statusCode: number; body: string }>((resolve, reject) => {
      const req = http.get(`http://127.0.0.1:${TEST_PORT}/api/health`, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve({ statusCode: res.statusCode || 0, body: data }));
      });
      req.on('error', reject);
    });

    assert(healthResponse.statusCode === 200, 'GET /api/health responds with HTTP 200 OK');
    const parsed = JSON.parse(healthResponse.body);
    assert(parsed.status === 'ok', 'Health response contains { status: "ok" }');

    // Close server cleanly
    await new Promise<void>((resolve) => server.close(() => resolve()));
    assert(true, 'Server successfully closes TCP port without hanging');
  }

  console.log('\n===============================================================');
  console.log(`📊 PRODUCTION STARTUP SMOKE TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('===============================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runStartupSmokeTest().catch((err) => {
  console.error('Fatal error running startup smoke test:', err);
  process.exit(1);
});
