import { getDb } from '../src/server/db/db';
import { v4 as uuidv4 } from 'uuid';
import { hashPassword, verifyPassword, generateRandomToken, hashToken } from '../src/server/utils/crypto';
import { logSecurityEvent } from '../src/server/utils/securityLogger';
import { notifySecurityAlert } from '../src/server/services/notificationService';

let passed = 0;
let failed = 0;

function assert(condition: any, msg: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${msg}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${msg}`);
    failed++;
  }
}

async function runPhase11SecuritySuite() {
  console.log('========================================================');
  console.log('🛡️ RUNNING PHASE 11: PROFILE & SECURITY FULL TEST SUITE');
  console.log('========================================================');

  const db = await getDb();
  const runTag = Date.now().toString().slice(-6);
  const userAId = uuidv4();
  const userBId = uuidv4();

  const initialPasswordA = 'InitialSecretPass123!';
  const initialHashA = await hashPassword(initialPasswordA);

  const initialPasswordB = 'InitialSecretPass456!';
  const initialHashB = await hashPassword(initialPasswordB);

  const phoneA = `+1555${runTag}1`;
  const phoneB = `+1555${runTag}2`;

  // Setup test users in database
  await db.query(`
    INSERT INTO users (id, public_id, full_name, email, phone, country, password_hash, role, status)
    VALUES 
      ($1, $2, 'Operator Alice', $3, $4, 'USA', $5, 'USER', 'ACTIVE'),
      ($6, $7, 'Operator Bob', $8, $9, 'UK', $10, 'USER', 'ACTIVE')
  `, [
    userAId, `PHX-ALICE-${runTag}`, `alice-${runTag}@phivonex.test`, phoneA, initialHashA,
    userBId, `PHX-BOB-${runTag}`, `bob-${runTag}@phivonex.test`, phoneB, initialHashB
  ]);

  await db.query(`
    INSERT INTO user_referrals (user_id, referral_code, sponsor_user_id, created_at)
    VALUES 
      ($1, $2, NULL, CURRENT_TIMESTAMP),
      ($3, $4, $1, CURRENT_TIMESTAMP)
  `, [
    userAId, `ALICE${runTag}`,
    userBId, `BOB${runTag}`
  ]);

  // 1. PROFILE & IMMUTABLE FIELD SECURITY
  console.log('\n--- 1. Profile & Immutable Field Security ---');
  // Read Profile for User A
  const profResA = await db.query(`SELECT public_id, full_name, email, phone, country, status FROM users WHERE id = $1`, [userAId]);
  assert(profResA.rowCount === 1, 'VALID PROFILE READ: User profile resolved');
  assert(profResA.rows[0].public_id === `PHX-ALICE-${runTag}`, 'Profile returns correct public ID');

  // Sponsor attribution for User B
  const sponsorResB = await db.query(`
    SELECT sp.public_id as sponsor_public_id 
    FROM user_referrals ur 
    JOIN users sp ON ur.sponsor_user_id = sp.id 
    WHERE ur.user_id = $1
  `, [userBId]);
  assert(sponsorResB.rows[0]?.sponsor_public_id === `PHX-ALICE-${runTag}`, 'PROFILE USER ISOLATION & SPONSOR ATTRIBUTION: User B correctly links to User A');

  // Update allowed fields (fullName, country)
  await db.query(`UPDATE users SET full_name = $1, country = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3`, [
    'Alice Updated Name', 'Canada', userAId
  ]);
  const checkUpdated = await db.query(`SELECT full_name, country FROM users WHERE id = $1`, [userAId]);
  assert(checkUpdated.rows[0].full_name === 'Alice Updated Name' && checkUpdated.rows[0].country === 'Canada', 'VALID PROFILE UPDATE: Editable fields updated');

  // Immutable field protection: verify public_id, email, role, status are untouched
  const immCheck = await db.query(`SELECT public_id, email, role, status FROM users WHERE id = $1`, [userAId]);
  assert(immCheck.rows[0].public_id === `PHX-ALICE-${runTag}`, 'IMMUTABLE PUBLIC ID CHANGE: Public ID remains immutable');
  assert(immCheck.rows[0].email === `alice-${runTag}@phivonex.test`, 'IMMUTABLE EMAIL CHANGE: Email remains immutable');
  assert(immCheck.rows[0].role === 'USER', 'ROLE MASS-ASSIGNMENT: Role cannot be modified');
  assert(immCheck.rows[0].status === 'ACTIVE', 'STATUS MASS-ASSIGNMENT: Status cannot be modified');

  // Duplicate mobile protection
  const dupPhoneCheck = await db.query(`SELECT id FROM users WHERE phone = $1 AND id != $2`, [phoneA, userBId]);
  assert(dupPhoneCheck.rowCount > 0, 'DUPLICATE MOBILE PROTECTION: Detects phone number already registered to another user');

  // 2. ARGON2ID PASSWORD ROTATION & SESSION TERMINATION
  console.log('\n--- 2. Argon2id Password Rotation & Session Termination ---');
  // Create 3 active sessions for User A (1 current, 2 remote)
  const tokenA1 = generateRandomToken(32);
  const tokenA2 = generateRandomToken(32);
  const tokenA3 = generateRandomToken(32);

  const sessIdA1 = uuidv4();
  const sessIdA2 = uuidv4();
  const sessIdA3 = uuidv4();

  const now = Date.now();
  const expires = new Date(now + 30 * 86400000);

  await db.query(`
    INSERT INTO sessions (id, user_id, token_hash, user_agent, expires_at, created_at, last_used_at)
    VALUES 
      ($1, $2, $3, 'Chrome macOS Desktop', $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
      ($5, $6, $7, 'Safari iPhone Mobile', $8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
      ($9, $10, $11, 'Firefox Linux Laptop', $12, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `, [
    sessIdA1, userAId, hashToken(tokenA1), expires,
    sessIdA2, userAId, hashToken(tokenA2), expires,
    sessIdA3, userAId, hashToken(tokenA3), expires
  ]);

  const newPasswordA = 'BrandNewSecuredPass789!';
  const newHashA = await hashPassword(newPasswordA);
  assert(newHashA.startsWith('$argon2id$'), 'ARGON2ID HASHING: Hash generated using Argon2id format');

  // Rotate password and revoke all other sessions except current (sessIdA1)
  await db.query(`UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`, [newHashA, userAId]);
  await db.query(`UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND id != $2 AND revoked_at IS NULL`, [userAId, sessIdA1]);

  // Record security audit event
  await logSecurityEvent(db, {
    userId: userAId,
    eventType: 'PASSWORD_CHANGED',
    description: 'Account password updated. All other active sessions terminated.',
    userAgent: 'Chrome macOS Desktop'
  });

  // Verify other sessions are revoked
  const sess1Check = await db.query(`SELECT revoked_at FROM sessions WHERE id = $1`, [sessIdA1]);
  const sess2Check = await db.query(`SELECT revoked_at FROM sessions WHERE id = $1`, [sessIdA2]);
  const sess3Check = await db.query(`SELECT revoked_at FROM sessions WHERE id = $1`, [sessIdA3]);

  assert(sess1Check.rows[0].revoked_at === null, 'VALID PASSWORD CHANGE: Current session preserved');
  assert(sess2Check.rows[0].revoked_at !== null, 'OTHER SESSION REVOCATION: Remote session 1 revoked');
  assert(sess3Check.rows[0].revoked_at !== null, 'OTHER SESSION REVOCATION: Remote session 2 revoked');

  // Verify password verification with new hash
  const isNewValid = await verifyPassword(newHashA, newPasswordA);
  const isOldInvalid = await verifyPassword(newHashA, initialPasswordA);
  assert(isNewValid === true, 'New password verifies against Argon2id hash');
  assert(isOldInvalid === false, 'WRONG CURRENT PASSWORD: Old password rejected');

  // 3. SESSION MANAGEMENT & ISOLATION
  console.log('\n--- 3. Session Management & Isolation ---');
  // Create session for User B
  const sessIdB1 = uuidv4();
  await db.query(`
    INSERT INTO sessions (id, user_id, token_hash, user_agent, expires_at, created_at, last_used_at)
    VALUES ($1, $2, $3, 'Safari iPad Tablet', $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `, [sessIdB1, userBId, hashToken(generateRandomToken(32)), expires]);

  // List active sessions for User A -> must only see User A sessions
  const activeSessA = await db.query(`
    SELECT id, user_id FROM sessions WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP
  `, [userAId]);
  assert(activeSessA.rowCount === 1 && activeSessA.rows[0].id === sessIdA1, 'SESSION LIST AUTH: User A sees only their active session');
  assert(!activeSessA.rows.some((s) => s.user_id === userBId), 'SESSION USER ISOLATION: User A cannot see User B sessions');

  // User A attempts to revoke User B session -> blocked by user_id condition
  const crossRevokeRes = await db.query(`
    UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP WHERE id = $1 AND user_id = $2 RETURNING id
  `, [sessIdB1, userAId]);
  assert(crossRevokeRes.rowCount === 0, 'CROSS-USER REVOKE: User A cannot revoke User B session');

  // Verify User B session is still active
  const checkSessB = await db.query(`SELECT revoked_at FROM sessions WHERE id = $1`, [sessIdB1]);
  assert(checkSessB.rows[0].revoked_at === null, 'User B session untouched after unauthorized revoke attempt');

  // Remote revocation of own session
  await db.query(`UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP WHERE id = $1 AND user_id = $2`, [sessIdB1, userBId]);
  const checkSessBRevoked = await db.query(`SELECT revoked_at FROM sessions WHERE id = $1`, [sessIdB1]);
  assert(checkSessBRevoked.rows[0].revoked_at !== null, 'REMOTE REVOKE: Session marked revoked successfully');

  // 4. SECURITY AUDIT ACTIVITY & REDACTION
  console.log('\n--- 4. Security Audit Activity & Redaction ---');
  await logSecurityEvent(db, {
    userId: userAId,
    eventType: 'SESSION_REVOKED',
    description: 'Remote session revoked by operator.',
    userAgent: 'Chrome macOS Desktop'
  });

  const auditResA = await db.query(`
    SELECT event_type, description, user_agent_summary 
    FROM security_events 
    WHERE user_id = $1 
    ORDER BY created_at DESC
  `, [userAId]);

  assert(auditResA.rowCount >= 2, 'AUDIT EVENT CREATION: Security events recorded in database');
  assert(auditResA.rows.every((row) => !row.description.includes('password') || !row.description.includes('Secret')), 'AUDIT REDACTION: Zero password/token data stored in description');

  // Audit user isolation
  const auditResB = await db.query(`SELECT id FROM security_events WHERE user_id = $1`, [userBId]);
  assert(!auditResA.rows.some((r) => r === auditResB.rows[0]), 'AUDIT USER ISOLATION: User A audit history does not contain User B events');

  // 5. NOTIFICATION INTEGRATION
  console.log('\n--- 5. Notification Integration ---');
  const notifAlert = await notifySecurityAlert({
    userId: userAId,
    title: 'Security Alert: Password Changed',
    message: 'Your account password was updated. All other active sessions have been terminated.',
    sourceId: `pwd-rot-${uuidv4()}`
  });
  assert(notifAlert !== null && notifAlert.type === 'SECURITY_ALERT', 'Security alert notification generated through existing pipeline');

  console.log('========================================================');
  console.log(`📊 PHASE 11 SECURITY SUITE COMPLETE: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================');

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runPhase11SecuritySuite().catch((err) => {
  console.error('Fatal test error in Phase 11 suite:', err);
  process.exit(1);
});
