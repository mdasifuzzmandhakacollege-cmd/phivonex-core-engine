/**
 * PHIVONEX — PRODUCTION DATABASE STARTUP TEST
 * 
 * Verifies:
 * 1. DATABASE_URL is strictly mandatory in production (APP_ENV=production or NODE_ENV=production).
 * 2. Missing/invalid DATABASE_URL fails closed (throws fatal error).
 * 3. PGlite is strictly prohibited in production and never initialized.
 * 4. PGlite remains available only for development/test environments.
 * 5. Production startup configuration validator enforces DATABASE_URL rules.
 */

import { validateProductionConfig } from '../src/config/integrationConfig';
import { getDb } from '../src/server/db/db';

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

async function runProductionDbStartupTest() {
  console.log('\n===============================================================');
  console.log('🗄️  PHIVONEX — PRODUCTION DATABASE STARTUP TEST');
  console.log('===============================================================\n');

  const savedEnv = { ...process.env };

  try {
    // -------------------------------------------------------------
    // TEST GROUP 1: Production Fail-Closed on Missing DATABASE_URL
    // -------------------------------------------------------------
    console.log('--- TEST GROUP 1: Production Fail-Closed on Missing DATABASE_URL ---');
    {
      process.env.APP_ENV = 'production';
      process.env.NODE_ENV = 'production';
      delete process.env.DATABASE_URL;
      process.env.DEPOSIT_ADDRESS_XPUB = 'xpub6EF8jXqFeFEW5bwMU7RpQtHkzE4KJxcqJtvkCjJumzW8CPpacXkb92ek4WzLQXjL93HycJwTPUAcuNxCqFPKKU5m5Z2Vq4nCyh5CyPeBFFr';
      process.env.TREASURY_WALLET_ADDRESS = '0x71c8705e3473187f6c1ab3c4709d4352d7f338f0';
      process.env.BSC_RPC_URL_PRIMARY = 'https://bsc-dataseed.binance.org';

      // 1. validateProductionConfig throws on missing DATABASE_URL
      let configValidatorThrew = false;
      try {
        validateProductionConfig();
      } catch (err: any) {
        configValidatorThrew = true;
        assert(err.message.includes('DATABASE_URL'), 'validateProductionConfig error mentions DATABASE_URL');
      }
      assert(configValidatorThrew, 'validateProductionConfig fails closed when DATABASE_URL is missing in production');

      // 2. getDb() throws on missing DATABASE_URL in production (never uses PGlite)
      globalThis.__phivonexDb = undefined;
      globalThis.__phivonexDbPromise = undefined;
      let dbInitThrew = false;
      try {
        await getDb();
      } catch (err: any) {
        dbInitThrew = true;
        assert(
          err.message.includes('DATABASE_URL is mandatory') && err.message.includes('PGlite is strictly prohibited'),
          'getDb error message specifies DATABASE_URL mandatory and PGlite prohibited'
        );
      }
      assert(dbInitThrew, 'getDb() fails closed when DATABASE_URL is missing in production');
    }

    // -------------------------------------------------------------
    // TEST GROUP 2: Production Fail-Closed on Invalid/Placeholder DATABASE_URL
    // -------------------------------------------------------------
    console.log('\n--- TEST GROUP 2: Production Fail-Closed on Invalid/Placeholder DATABASE_URL ---');
    {
      process.env.APP_ENV = 'production';
      process.env.NODE_ENV = 'production';
      process.env.DATABASE_URL = 'postgresql://placeholder:placeholder@localhost/mydb';

      let configPlaceholderThrew = false;
      try {
        validateProductionConfig();
      } catch {
        configPlaceholderThrew = true;
      }
      assert(configPlaceholderThrew, 'validateProductionConfig fails closed on placeholder DATABASE_URL');

      globalThis.__phivonexDb = undefined;
      globalThis.__phivonexDbPromise = undefined;
      let dbPlaceholderThrew = false;
      try {
        await getDb();
      } catch {
        dbPlaceholderThrew = true;
      }
      assert(dbPlaceholderThrew, 'getDb() fails closed on placeholder DATABASE_URL in production');

      // Invalid protocol
      process.env.DATABASE_URL = 'mysql://user:pass@host:3306/db';
      let configInvalidProtocolThrew = false;
      try {
        validateProductionConfig();
      } catch {
        configInvalidProtocolThrew = true;
      }
      assert(configInvalidProtocolThrew, 'validateProductionConfig fails closed on non-Postgres protocol DATABASE_URL');

      globalThis.__phivonexDb = undefined;
      globalThis.__phivonexDbPromise = undefined;
      let dbInvalidProtocolThrew = false;
      try {
        await getDb();
      } catch {
        dbInvalidProtocolThrew = true;
      }
      assert(dbInvalidProtocolThrew, 'getDb() fails closed on non-Postgres protocol DATABASE_URL in production');
    }

    // -------------------------------------------------------------
    // TEST GROUP 3: Successful Validation with Valid DATABASE_URL
    // -------------------------------------------------------------
    console.log('\n--- TEST GROUP 3: Successful Production Config Validation with Valid DATABASE_URL ---');
    {
      process.env.APP_ENV = 'production';
      process.env.NODE_ENV = 'production';
      process.env.DATABASE_URL = 'postgresql://phivonex_admin:StrongPass987%21@10.0.0.5:5432/phivonex_production?sslmode=require';
      process.env.DEPOSIT_ADDRESS_XPUB = 'xpub6EF8jXqFeFEW5bwMU7RpQtHkzE4KJxcqJtvkCjJumzW8CPpacXkb92ek4WzLQXjL93HycJwTPUAcuNxCqFPKKU5m5Z2Vq4nCyh5CyPeBFFr';
      process.env.TREASURY_WALLET_ADDRESS = '0x71c8705e3473187f6c1ab3c4709d4352d7f338f0';
      process.env.BSC_RPC_URL_PRIMARY = 'https://bsc-dataseed.binance.org';

      let validThrew = false;
      try {
        validateProductionConfig();
      } catch (err: any) {
        validThrew = true;
        console.error('Unexpected error:', err.message);
      }
      assert(!validThrew, 'validateProductionConfig passes cleanly when valid postgresql:// DATABASE_URL is configured');
    }

    // -------------------------------------------------------------
    // TEST GROUP 4: Development / Test PGlite Fallback Behavior
    // -------------------------------------------------------------
    console.log('\n--- TEST GROUP 4: Development & Test Environment PGlite Behavior ---');
    {
      process.env.APP_ENV = 'test';
      process.env.NODE_ENV = 'test';
      delete process.env.DATABASE_URL;

      globalThis.__phivonexDb = undefined;
      globalThis.__phivonexDbPromise = undefined;

      let devDbReady = false;
      try {
        const client = await getDb();
        const testRes = await client.query('SELECT 1 as num');
        devDbReady = testRes.rows.length === 1 && testRes.rows[0].num === 1;
      } catch (err: any) {
        console.error('Dev DB error:', err);
      }
      assert(devDbReady, 'PGlite is available and functional exclusively for test/development environments');
    }

    console.log('\n===============================================================');
    console.log(`📊 PRODUCTION DB STARTUP TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('===============================================================\n');

    if (failed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } finally {
    // Restore original env
    process.env = savedEnv;
    globalThis.__phivonexDb = undefined;
    globalThis.__phivonexDbPromise = undefined;
  }
}

runProductionDbStartupTest().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
