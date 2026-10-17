/**
 * PHIVONEX — CI ENVIRONMENT & SECRET LEAK AUDITOR
 * 
 * Verifies:
 * 1. Environment Contract Validation (validateProductionConfig in test vs production modes).
 * 2. Secret Leak Check (ensuring tracked source code contains zero raw private keys, database passwords, or unmasked secrets).
 * 3. Client / Server Bundle Boundary Safety (verifying client-side VITE_ variables contain no server secrets).
 */

import fs from 'fs';
import path from 'path';
import { validateProductionConfig } from '../src/config/integrationConfig';

function auditSecretsAndEnv() {
  console.log('===============================================================');
  console.log('🔍 PHIVONEX — CI ENVIRONMENT & SECRET LEAK AUDITOR');
  console.log('===============================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`  ✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${testName}${detail ? ` - ${detail}` : ''}`);
      failed++;
    }
  }

  // 1. Environment Contract Validation Test (Fail Closed on missing required variables in production)
  console.log('--- 1. ENVIRONMENT CONTRACT VALIDATION ---');
  let testEnvPass = false;
  const originalAppEnv = process.env.APP_ENV;
  const originalNodeEnv = process.env.NODE_ENV;
  try {
    // In test environment, validateProductionConfig returns silently without throwing
    process.env.APP_ENV = 'test';
    process.env.NODE_ENV = 'test';
    validateProductionConfig();
    testEnvPass = true;
  } catch {
    testEnvPass = false;
  } finally {
    if (originalAppEnv !== undefined) process.env.APP_ENV = originalAppEnv; else delete process.env.APP_ENV;
    if (originalNodeEnv !== undefined) process.env.NODE_ENV = originalNodeEnv; else delete process.env.NODE_ENV;
  }
  assert(testEnvPass, 'Env Validation: Test environment mode bypasses production-only blocking requirements');

  // Verify production fail-closed behavior on invalid DATABASE_URL
  let prodFailClosedPass = false;
  const originalEnv = process.env.APP_ENV;
  const originalDbUrl = process.env.DATABASE_URL;

  try {
    process.env.APP_ENV = 'production';
    process.env.DATABASE_URL = 'invalid_protocol://localhost/db';
    validateProductionConfig();
  } catch (err: any) {
    if (err.message.includes('DATABASE_URL must be a valid PostgreSQL connection string')) {
      prodFailClosedPass = true;
    }
  } finally {
    process.env.APP_ENV = originalEnv || 'test';
    if (originalDbUrl !== undefined) process.env.DATABASE_URL = originalDbUrl; else delete process.env.DATABASE_URL;
  }
  assert(prodFailClosedPass, 'Env Validation: Production startup validates and rejects invalid DATABASE_URL');

  // 2. Secret Leak Scan across Source Code
  console.log('\n--- 2. SECRET LEAK SCAN ---');
  const srcDir = path.join(process.cwd(), 'src');
  const serverFile = path.join(process.cwd(), 'server.ts');
  const apphostingFile = path.join(process.cwd(), 'apphosting.yaml');

  const forbiddenPatterns = [
    { name: 'Raw Private Key Assignment', pattern: /(private_key|signer_key|secret_key|payout_private_key|treasury_private_key)\s*[:=]\s*["']?0x[a-fA-F0-9]{64}["']?/gi },
    { name: 'PEM Private Key Header', pattern: /-----BEGIN (RSA|EC|PRIVATE) KEY-----/g },
    { name: 'Mnemonic Seed Phrase', pattern: /\b(mnemonic|seed_phrase)\s*[:=]\s*["'][a-z\s]{20,}["']/gi },
    { name: 'Hardcoded Database Password', pattern: /postgres:\/\/[a-zA-Z0-9_]+:[^@\s]+@/g },
    { name: 'Live Stripe/SendGrid/Resend API Key', pattern: /(sk_live_[a-zA-Z0-9]{24}|SG\.[a-zA-Z0-9_-]{22}|re_[a-zA-Z0-9]{24})/g },
  ];

  let totalLeaksFound = 0;

  function scanFile(filePath: string) {
    if (!fs.existsSync(filePath)) return;
    const content = fs.readFileSync(filePath, 'utf-8');

    for (const item of forbiddenPatterns) {
      const matches = content.match(item.pattern);
      if (matches && matches.length > 0) {
        // Exclude test fixture files or redactor utility comments
        if (filePath.includes('test') || filePath.includes('cloudSqlDiagnostic.ts') || filePath.includes('crypto.ts')) {
          continue;
        }
        console.error(`  ❌ [LEAK] Found potential secret (${item.name}) in ${filePath}`);
        totalLeaksFound++;
      }
    }
  }

  function scanDirectory(dirPath: string) {
    if (!fs.existsSync(dirPath)) return;
    const files = fs.readdirSync(dirPath);
    for (const file of files) {
      const fullPath = path.join(dirPath, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        scanDirectory(fullPath);
      } else if (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js') || file.endsWith('.json') || file.endsWith('.yaml')) {
        scanFile(fullPath);
      }
    }
  }

  scanDirectory(srcDir);
  scanFile(serverFile);
  scanFile(apphostingFile);

  assert(totalLeaksFound === 0, 'Secret Leak Scan: Zero hardcoded secrets found in tracked application source files');

  // 3. Client / Server Boundary Audit
  console.log('\n--- 3. CLIENT / SERVER BOUNDARY SAFETY ---');
  let viteSecretsExposed = false;
  for (const key of Object.keys(process.env)) {
    if (key.startsWith('VITE_')) {
      const val = process.env[key]?.toLowerCase() || '';
      if (val.includes('private') || val.includes('secret') || val.includes('key_') || val.includes('password')) {
        viteSecretsExposed = true;
      }
    }
  }
  assert(!viteSecretsExposed, 'Client Boundary: No server secrets exposed in VITE_ client environment variables');

  console.log('\n===============================================================');
  console.log(`SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('===============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

auditSecretsAndEnv();
