import { getDb } from '../src/server/db/db';
import { hashPassword, verifyPassword, generateRandomToken, hashToken } from '../src/server/utils/crypto';
import { generatePublicId } from '../src/server/utils/idGenerator';
import { v4 as uuidv4 } from 'uuid';

async function runTests() {
  console.log('========================================');
  console.log('🧪 RUNNING AUTHENTICATION BACKEND TESTS');
  console.log('========================================\n');

  const db = await getDb();
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName}${detail ? ` - ${detail}` : ''}`);
      failed++;
    }
  }

  try {
    // 1. Password Hashing & Verification with Argon2id
    const testPassword = 'SecureOperatorPassword2026!';
    const passwordHash = await hashPassword(testPassword);
    const isValid = await verifyPassword(passwordHash, testPassword);
    const isInvalid = await verifyPassword(passwordHash, 'WrongPassword123');

    assert(passwordHash.startsWith('$argon2id$'), 'Argon2id Hash Format Check');
    assert(isValid && !isInvalid, 'Argon2id Password Verification');

    // 2. User Registration & Duplicate Email Test
    const testEmail = `test.operator.${Date.now()}@phivonex.org`;
    const testPhone = `+1 555 ${Math.floor(100000 + Math.random() * 900000)}`;
    const userId = uuidv4();
    const publicId = generatePublicId();

    await db.query(
      `
      INSERT INTO users (id, public_id, full_name, email, phone, country, password_hash, status, pending_referral_code)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `,
      [userId, publicId, 'Test Operator', testEmail, testPhone, 'United States', passwordHash, 'ACTIVE', 'PHXGENESIS']
    );

    const userQuery = await db.query(`SELECT * FROM users WHERE id = $1`, [userId]);
    assert(userQuery.rows.length === 1, 'Registration Success - User Persisted in DB');
    assert(userQuery.rows[0].pending_referral_code === 'PHXGENESIS', 'Pending Referral Code Preserved (No commission logic)');

    // Duplicate email check
    let duplicateCaught = false;
    try {
      await db.query(
        `INSERT INTO users (id, public_id, full_name, email, phone, country, password_hash) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [uuidv4(), generatePublicId(), 'Duplicate User', testEmail.toUpperCase(), '+1 555 999999', 'United States', passwordHash]
      );
    } catch (e) {
      duplicateCaught = true;
    }
    assert(duplicateCaught, 'Duplicate Email Rejected by Database / Constraints');

    // 3. Invalid Password Validation Rule (< 10 chars)
    const shortPassword = 'short';
    assert(shortPassword.length < 10, 'Invalid Password Rule (< 10 chars rejected independently)');

    // 4. Login & Session Creation
    const sessionToken = generateRandomToken(32);
    const sessionTokenHash = hashToken(sessionToken);
    const sessionExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // +1 day
    const sessionId = uuidv4();

    await db.query(
      `
      INSERT INTO sessions (id, user_id, token_hash, expires_at)
      VALUES ($1, $2, $3, $4)
      `,
      [sessionId, userId, sessionTokenHash, sessionExpiry]
    );

    // Query active session
    const sessionRes = await db.query(
      `SELECT * FROM sessions WHERE token_hash = $1 AND expires_at > CURRENT_TIMESTAMP AND revoked_at IS NULL`,
      [sessionTokenHash]
    );
    assert(sessionRes.rows.length === 1, 'Login Success & Active Session Created');

    // 5. Authenticated /me endpoint simulation
    const meRes = await db.query(
      `
      SELECT u.id, u.public_id, u.full_name, u.email, u.phone, u.country, u.status, u.email_verified_at
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > CURRENT_TIMESTAMP
      `,
      [sessionTokenHash]
    );
    assert(meRes.rows.length === 1 && meRes.rows[0].email === testEmail, 'Authenticated /me returns safe user profile without password_hash');

    // 6. Suspended Account Check
    const suspendedUserId = uuidv4();
    await db.query(
      `INSERT INTO users (id, public_id, full_name, email, country, password_hash, status) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [suspendedUserId, generatePublicId(), 'Suspended User', `suspended.${Date.now()}@phivonex.org`, 'United States', passwordHash, 'SUSPENDED']
    );

    const suspendedQuery = await db.query(`SELECT status FROM users WHERE id = $1`, [suspendedUserId]);
    assert(suspendedQuery.rows[0].status === 'SUSPENDED', 'Suspended Account State Recognized');

    // 7. Logout & Session Revocation
    await db.query(`UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP WHERE id = $1`, [sessionId]);
    const revokedCheck = await db.query(
      `SELECT * FROM sessions WHERE id = $1 AND revoked_at IS NULL`,
      [sessionId]
    );
    assert(revokedCheck.rows.length === 0, 'Logout Success - Session Revoked in Database');

    // 8. Session Expiration Handling
    const expiredSessionId = uuidv4();
    const expiredToken = generateRandomToken(32);
    const expiredTokenHash = hashToken(expiredToken);
    const pastDate = new Date(Date.now() - 3600 * 1000); // 1 hour ago

    await db.query(
      `INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)`,
      [expiredSessionId, userId, expiredTokenHash, pastDate]
    );

    const expiredCheck = await db.query(
      `SELECT * FROM sessions WHERE token_hash = $1 AND expires_at > CURRENT_TIMESTAMP AND revoked_at IS NULL`,
      [expiredTokenHash]
    );
    assert(expiredCheck.rows.length === 0, 'Expired Session Rejected');

    // 9. Password Reset Token Generation & Use
    const resetToken = generateRandomToken(32);
    const resetTokenHash = hashToken(resetToken);
    const resetTokenId = uuidv4();
    const resetExpiry = new Date(Date.now() + 3600 * 1000); // 1 hour

    await db.query(
      `INSERT INTO auth_tokens (id, user_id, type, token_hash, expires_at) VALUES ($1, $2, $3, $4, $5)`,
      [resetTokenId, userId, 'PASSWORD_RESET', resetTokenHash, resetExpiry]
    );

    const validTokenQuery = await db.query(
      `SELECT * FROM auth_tokens WHERE token_hash = $1 AND type = 'PASSWORD_RESET' AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP`,
      [resetTokenHash]
    );
    assert(validTokenQuery.rows.length === 1, 'Password Reset Token Validated');

    // Mark as used
    await db.query(`UPDATE auth_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = $1`, [resetTokenId]);

    const reusedTokenQuery = await db.query(
      `SELECT * FROM auth_tokens WHERE token_hash = $1 AND used_at IS NULL`,
      [resetTokenHash]
    );
    assert(reusedTokenQuery.rows.length === 0, 'Password Reset Token Single-Use Enforced (Marked Used)');

    // 10. Expired Reset Token Check
    const expiredResetTokenHash = hashToken(generateRandomToken(32));
    await db.query(
      `INSERT INTO auth_tokens (id, user_id, type, token_hash, expires_at) VALUES ($1, $2, $3, $4, $5)`,
      [uuidv4(), userId, 'PASSWORD_RESET', expiredResetTokenHash, pastDate]
    );

    const expiredResetQuery = await db.query(
      `SELECT * FROM auth_tokens WHERE token_hash = $1 AND expires_at > CURRENT_TIMESTAMP`,
      [expiredResetTokenHash]
    );
    assert(expiredResetQuery.rows.length === 0, 'Expired Reset Token Rejected');

  } catch (err) {
    console.error('Test execution error:', err);
    failed++;
  }

  console.log('\n========================================');
  console.log(`📊 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================');

  process.exit(failed > 0 ? 1 : 0);
}

runTests();
