#!/usr/bin/env tsx
/**
 * PHIVONEX — Cloud SQL PostgreSQL Connection Diagnostic CLI Utility
 * 
 * Verifies live connection to Cloud SQL PostgreSQL and logs status
 * strictly WITHOUT exposing credentials, passwords, or connection secrets.
 * 
 * Usage:
 *   npx tsx scripts/verify-cloudsql-diagnostic.ts
 */

import { checkCloudSqlConnection } from '../src/server/utils/cloudSqlDiagnostic';

async function main() {
  console.log('🔍 Initiating Cloud SQL PostgreSQL diagnostic check...');
  
  const result = await checkCloudSqlConnection({ logStatus: true });

  // Verification of zero credential exposure
  const stringified = JSON.stringify(result);
  const passwordExposed = 
    stringified.toLowerCase().includes('password') && 
    !stringified.includes('***') && 
    !stringified.includes('passwords');
  
  if (passwordExposed) {
    console.error('CRITICAL: Diagnostic leaked credentials in report output!');
    process.exit(1);
  }

  if (result.status === 'connected') {
    console.log('✅ Cloud SQL PostgreSQL connectivity and schema verification SUCCESSFUL.');
    process.exit(0);
  } else {
    console.error(`❌ Cloud SQL PostgreSQL verification FAILED: ${result.error || 'Unknown error'}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal diagnostic utility error:', err?.message || err);
  process.exit(1);
});
