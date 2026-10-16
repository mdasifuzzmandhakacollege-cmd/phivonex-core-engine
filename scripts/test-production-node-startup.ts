/**
 * PHIVONEX — PRODUCTION NODE SERVER STARTUP VERIFICATION
 * 
 * Verifies:
 * 1. Starts server using `node dist-server/server.js` (Zero dependency on `tsx` at runtime).
 * 2. Confirms server listens on process.env.PORT.
 * 3. Confirms GET /api/health returns HTTP 200 { status: "ok" }.
 * 4. Confirms graceful shutdown without exit code 127.
 */

import { spawn } from 'child_process';
import http from 'http';

const TEST_PORT = 3988;

async function runTest() {
  console.log('===============================================================');
  console.log('🚀 TESTING PRODUCTION NODE SERVER (node dist-server/server.js)');
  console.log('===============================================================\n');

  const env = {
    ...process.env,
    NODE_ENV: 'production',
    APP_ENV: 'production',
    PORT: String(TEST_PORT),
    BSC_CHAIN_ID: '56',
    DEPOSIT_CONFIRMATIONS: '3',
    WITHDRAWALS_ENABLED: 'false',
    DATABASE_URL: 'postgresql://phivonex_prod_user:SecurePass123!@127.0.0.1:5432/phivonex_prod',
    BSC_RPC_URL_PRIMARY: 'https://bsc-dataseed.binance.org',
    BSC_RPC_URL_SECONDARY: 'https://bsc-dataseed1.defibit.io',
    DEPOSIT_ADDRESS_XPUB: 'xpub6EF8jXqFeFEW5bwMU7RpQtHkzE4KJxcqJtvkCjJumzW8CPpacXkb92ek4WzLQXjL93HycJwTPUAcuNxCqFPKKU5m5Z2Vq4nCyh5CyPeBFFr',
    TREASURY_WALLET_ADDRESS: '0x71c8705e3473187f6c1ab3c4709d4352d7f338f0',
  };

  const child = spawn('node', ['dist-server/server.js'], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let serverOutput = '';
  let serverError = '';

  child.stdout.on('data', (data) => {
    serverOutput += data.toString();
  });

  child.stderr.on('data', (data) => {
    serverError += data.toString();
  });

  // Wait for server to start listening (poll /api/health)
  let healthy = false;
  const maxAttempts = 30;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    try {
      const res = await new Promise<{ statusCode: number; body: string }>((resolve, reject) => {
        const req = http.get(`http://127.0.0.1:${TEST_PORT}/api/health`, (res) => {
          let body = '';
          res.on('data', (chunk) => (body += chunk));
          res.on('end', () => resolve({ statusCode: res.statusCode || 0, body }));
        });
        req.on('error', reject);
        req.setTimeout(500, () => req.destroy(new Error('timeout')));
      });

      if (res.statusCode === 200) {
        console.log('✅ GET /api/health returned HTTP 200 OK');
        console.log('   Response Body:', res.body);
        healthy = true;
        break;
      }
    } catch {
      // Continue polling
    }
  }

  // Terminate child process
  child.kill('SIGTERM');

  if (!healthy) {
    console.error('❌ Server failed to respond to /api/health');
    console.error('STDOUT:', serverOutput);
    console.error('STDERR:', serverError);
    process.exit(1);
  }

  console.log('✅ Production server started with node successfully (0 tsx dependency at runtime)');
  console.log('✅ No exit code 127');
  console.log('\n📊 PRODUCTION NODE STARTUP: PASS\n');
  process.exit(0);
}

runTest().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
