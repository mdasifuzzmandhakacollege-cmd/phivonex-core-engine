/**
 * PHIVONEX — PRODUCTION CI REGRESSION GATE RUNNER
 * 
 * Aggregates and executes all production-critical regression test suites sequentially:
 * - PF-03: CAPTCHA & XPUB Cleanup Verification
 * - PF-04: Node Purchase Settlement Verification
 * - PF-05: PHIVO Rewards & Swap Verification
 * - PF-06: Withdrawal System Hardening Verification
 * - PF-07: Auth, Session & Email Verification
 * - PF-08: Public Data Accuracy Verification
 * - PF-09: Full Production E2E Verification
 * 
 * Exits with code 0 if ALL test suites pass.
 * Exits with code 1 if ANY test suite fails or encounters an error.
 */

import { spawnSync } from 'child_process';
import path from 'path';

const testSuites = [
  { name: 'PF-03 CAPTCHA & XPUB Cleanup', script: 'scripts/test-pf03-regression.ts' },
  { name: 'PF-04 Node Purchase Settlement', script: 'scripts/test-pf04-node-settlement.ts' },
  { name: 'PF-05 PHIVO Rewards & Swap', script: 'scripts/test-pf05-phivo-reward-swap.ts' },
  { name: 'PF-06 Withdrawal System Hardening', script: 'scripts/test-pf06-withdrawal-hardening.ts' },
  { name: 'PF-07 Auth, Session & Email Finalization', script: 'scripts/test-pf07-auth-email-finalization.ts' },
  { name: 'PF-08 Public Data Accuracy', script: 'scripts/test-pf08-public-data-accuracy.ts' },
  { name: 'PF-09 Full Production E2E Verification', script: 'scripts/test-pf09-full-e2e-verification.ts' },
  { name: 'PF-10 Dynamic Daily Reward & Public Data Audit', script: 'scripts/test-pf10-dynamic-daily-reward.ts' },
  { name: 'PF-11 Withdrawal Engine Production Fix', script: 'scripts/test-withdrawal-engine-production-fix.ts' },
  { name: 'PF-12 Withdrawal OTP & Forgot Password Verification', script: 'scripts/test-withdrawal-and-forgot-password-otp.ts' },
  { name: 'PF-13 Node Purchase & Withdrawal Atomic Fix', script: 'scripts/test-node-purchase-withdrawal-atomic-fix.ts' },
];

async function main() {
  console.log('===============================================================');
  console.log('🚀 PHIVONEX PRODUCTION CI REGRESSION GATE RUNNER');
  console.log('===============================================================\n');

  let passedSuites = 0;
  let failedSuites = 0;

  for (const suite of testSuites) {
    console.log(`\n▶️ RUNNING SUITE: ${suite.name} (${suite.script})...`);
    
    const result = spawnSync('npx', ['tsx', suite.script], {
      stdio: 'inherit',
      env: {
        ...process.env,
        NODE_ENV: 'test',
        APP_ENV: 'test',
      },
    });

    if (result.status === 0) {
      console.log(`✅ [SUITE PASSED] ${suite.name}`);
      passedSuites++;
    } else {
      console.error(`❌ [SUITE FAILED] ${suite.name} (Exit code: ${result.status})`);
      failedSuites++;
    }
  }

  console.log('\n===============================================================');
  console.log(`📊 PRODUCTION CI REGRESSION GATE RESULTS`);
  console.log(`PASSED SUITES: ${passedSuites} / ${testSuites.length}`);
  console.log(`FAILED SUITES: ${failedSuites} / ${testSuites.length}`);
  console.log('===============================================================\n');

  if (failedSuites > 0) {
    console.error('💥 CI GATE FAILED: One or more production regression test suites failed.');
    process.exit(1);
  } else {
    console.log('🎉 CI GATE PASSED: All production-critical regression test suites passed successfully!');
    process.exit(0);
  }
}

main();
