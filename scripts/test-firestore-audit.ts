/**
 * PHIVONEX — FIRESTORE ADMINISTRATIVE AUDIT LOG TEST SUITE
 * 
 * Verifies:
 * 1. Admin config updates and treasury movements write to Firestore collection `admin_audit_logs`.
 * 2. Documents adhere to schema (action, category, actorId, details, previousState, newState).
 * 3. Retrieval and querying from Firestore succeeds.
 */

import { recordAdminAuditToFirestore, getFirestoreAuditLogs } from '../src/services/firestoreAuditService';

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

async function runAuditTests() {
  console.log('\n===============================================================');
  console.log('🛡️  PHIVONEX — FIRESTORE ADMINISTRATIVE AUDIT LOG TEST');
  console.log('===============================================================\n');

  try {
    // 1. Record Config Update in Firestore
    console.log('--- 1. Testing Config Update Logging in Firestore ---');
    const configAudit = await recordAdminAuditToFirestore({
      action: 'UPDATE_NODE_BASE_PRICE_USD',
      category: 'CONFIG_UPDATE',
      actorId: 'ADM-TEST-001',
      actorEmail: 'admin@phivonex.test',
      actorRole: 'SUPER_ADMIN',
      targetType: 'ECONOMIC_CONFIG',
      targetId: 'NODE_BASE_PRICE_USD',
      details: 'Adjusted base price of Genesis Node from $100.00 to $120.00 USD for promotional epoch 4.',
      previousState: { priceUsd: 100.0 },
      newState: { priceUsd: 120.0 },
    });

    assert(Boolean(configAudit.id), 'Generated unique Firestore audit log document ID');
    assert(configAudit.category === 'CONFIG_UPDATE', 'Category is CONFIG_UPDATE');
    assert(configAudit.action === 'UPDATE_NODE_BASE_PRICE_USD', 'Action matches configuration key');
    assert(Boolean(configAudit.createdAt), 'Timestamp is recorded');

    // 2. Record Treasury Movement in Firestore
    console.log('\n--- 2. Testing Treasury Movement Logging in Firestore ---');
    const treasuryAudit = await recordAdminAuditToFirestore({
      action: 'WITHDRAWAL_COMPLETE',
      category: 'TREASURY_MOVEMENT',
      actorId: 'ADM-TEST-001',
      actorEmail: 'admin@phivonex.test',
      actorRole: 'SUPER_ADMIN',
      targetType: 'WITHDRAWAL',
      targetId: 'WDR-TEST-9988',
      details: 'Settled on-chain withdrawal of 500 USDT to destination 0x71c8... Broadcast confirmed on BSC.',
      previousState: { status: 'PENDING', amount: 500.0 },
      newState: { status: 'COMPLETED', txHash: '0x123abc456def' },
    });

    assert(treasuryAudit.category === 'TREASURY_MOVEMENT', 'Category is TREASURY_MOVEMENT');
    assert(treasuryAudit.targetId === 'WDR-TEST-9988', 'Target ID matches withdrawal public ID');

    // 3. Query logs from Firestore
    console.log('\n--- 3. Testing Firestore Log Retrieval ---');
    const retrievedLogs = await getFirestoreAuditLogs(10);
    assert(Array.isArray(retrievedLogs), 'getFirestoreAuditLogs returns an array');
    assert(retrievedLogs.length >= 2, 'Retrieved at least the 2 recorded audit records');
    
    const foundConfig = retrievedLogs.find((l) => l.id === configAudit.id);
    const foundTreasury = retrievedLogs.find((l) => l.id === treasuryAudit.id);

    assert(Boolean(foundConfig), 'Retrieved config audit log from Firestore collection');
    assert(Boolean(foundTreasury), 'Retrieved treasury audit log from Firestore collection');

  } catch (err: any) {
    console.error('Audit test failed with error:', err);
    failed++;
  }

  console.log('\n===============================================================');
  console.log(`📊 FIRESTORE AUDIT LOG TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('===============================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runAuditTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
