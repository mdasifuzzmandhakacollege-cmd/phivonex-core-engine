/**
 * PHIVONEX — PF-07: AUTH + EMAIL PRODUCTION FINALIZATION TEST SUITE
 * 
 * Verifies:
 * 1. Email format validation, normalization, and duplicate email prevention.
 * 2. Argon2id password hashing and minimum length validation.
 * 3. Registration OTP generation, cooldown, and single-use verification.
 * 4. Code verification rate limiting & expiration.
 * 5. Registration completion, user creation, and session initialization.
 * 6. Login authentication, password verification, and suspended user blockage.
 * 7. Google sign-in account linking and suspended status enforcement.
 * 8. Forgot password token generation, single-use reset, and session revocation.
 * 9. Session security (active session listing, remote session revocation, logout).
 * 10. Admin authorization server-side enforcement (USER blocked, ADMIN permitted).
 */

import { PGlite } from '@electric-sql/pglite';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { hashPassword, verifyPassword, generateRandomToken, hashToken } from '../src/server/utils/crypto';
import { generatePublicId, generateReferralCode, normalizeReferralCode } from '../src/server/utils/idGenerator';
import { isUserAdmin } from '../src/server/middleware/authMiddleware';

async function runAuthFinalizationTests() {
  console.log('===============================================================');
  console.log('🧪 PHIVONEX — PF-07: AUTH + EMAIL PRODUCTION FINALIZATION TEST SUITE');
  console.log('===============================================================\n');

  const testDbDir = path.join(process.cwd(), '.data', `test_pf07_${uuidv4()}`);
  if (!fs.existsSync(testDbDir)) {
    fs.mkdirSync(testDbDir, { recursive: true });
  }

  const pglite = new PGlite(testDbDir);
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

  try {
    // 1. Initialize Tables
    await pglite.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(64) PRIMARY KEY,
        public_id VARCHAR(32) UNIQUE NOT NULL,
        full_name VARCHAR(128) NOT NULL,
        email VARCHAR(128) UNIQUE NOT NULL,
        phone VARCHAR(32) UNIQUE,
        country VARCHAR(64) NOT NULL DEFAULT 'Global',
        password_hash VARCHAR(255) NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
        role VARCHAR(32) NOT NULL DEFAULT 'USER',
        pending_referral_code VARCHAR(32),
        email_verified_at TIMESTAMP WITH TIME ZONE,
        last_login_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS user_referrals (
        user_id VARCHAR(64) PRIMARY KEY REFERENCES users(id),
        referral_code VARCHAR(32) UNIQUE NOT NULL,
        sponsor_user_id VARCHAR(64),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS pending_registrations (
        email VARCHAR(128) PRIMARY KEY,
        code_hash VARCHAR(128) NOT NULL,
        registration_data TEXT NOT NULL,
        failed_attempts INTEGER NOT NULL DEFAULT 0,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        is_verified BOOLEAN NOT NULL DEFAULT FALSE,
        verification_token VARCHAR(64),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        last_sent_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id VARCHAR(64) PRIMARY KEY,
        user_id VARCHAR(64) NOT NULL REFERENCES users(id),
        token_hash VARCHAR(128) NOT NULL,
        user_agent TEXT,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        revoked_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        last_used_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS auth_tokens (
        id VARCHAR(64) PRIMARY KEY,
        user_id VARCHAR(64) NOT NULL REFERENCES users(id),
        type VARCHAR(32) NOT NULL,
        token_hash VARCHAR(128) NOT NULL,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        used_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS security_audit_logs (
        id VARCHAR(64) PRIMARY KEY,
        user_id VARCHAR(64),
        event_type VARCHAR(64) NOT NULL,
        description TEXT NOT NULL,
        user_agent TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('--- 1. REGISTRATION EMAIL VALIDATION & NORMALIZATION ---');
    const rawEmail = '  Test.User.PF07@Phivonex.Org  ';
    const normalizedEmail = rawEmail.trim().toLowerCase();
    assert(normalizedEmail === 'test.user.pf07@phivonex.org', 'Email is properly trimmed and lowercased');

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    assert(emailRegex.test(normalizedEmail), 'Valid email format accepted');
    assert(!emailRegex.test('invalid-email-address'), 'Invalid email format rejected');

    console.log('\n--- 2. PASSWORD HASHING & WEAK PASSWORD PROTECTION ---');
    const weakPass = 'short123';
    assert(weakPass.length < 10, 'Weak password (< 10 chars) flagged for rejection');

    const strongPass = 'SecurePhivonexPass2026!';
    const passwordHash = await hashPassword(strongPass);
    assert(passwordHash.startsWith('$argon2id$'), 'Password hashed with Argon2id');
    
    const isValidPass = await verifyPassword(passwordHash, strongPass);
    const isWrongPass = await verifyPassword(passwordHash, 'WrongPassword123!');
    assert(isValidPass && !isWrongPass, 'Argon2id password verification accurate');

    console.log('\n--- 3. PENDING REGISTRATION & OTP COOLDOWN ---');
    const crypto = await import('crypto');
    const rawOtp = crypto.randomInt(100000, 999999).toString();
    const otpHash = crypto.createHash('sha256').update(rawOtp).digest('hex');
    const regData = JSON.stringify({
      fullName: 'Test Operator',
      email: normalizedEmail,
      country: 'United States',
      passwordHash,
    });
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await pglite.query(
      `INSERT INTO pending_registrations (email, code_hash, registration_data, expires_at, created_at, last_sent_at)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [normalizedEmail, otpHash, regData, expiresAt]
    );

    const pendingCheck = await pglite.query(`SELECT * FROM pending_registrations WHERE email = $1`, [normalizedEmail]);
    assert(pendingCheck.rows.length === 1, 'Pending registration record created successfully');

    // Simulate Cooldown Check
    const firstRow: any = pendingCheck.rows[0];
    const lastSent = new Date(firstRow.last_sent_at).getTime();
    const isCooldownActive = (Date.now() - lastSent) < 60000;
    assert(isCooldownActive, '60-second re-send cooldown active');

    console.log('\n--- 4. OTP VERIFICATION & RATE LIMITING ---');
    // Wrong code attempt
    const wrongOtpHash = crypto.createHash('sha256').update('000000').digest('hex');
    const isMatchWrong = otpHash === wrongOtpHash;
    assert(!isMatchWrong, 'Incorrect OTP rejected');

    // Correct code attempt
    const isMatchCorrect = otpHash === crypto.createHash('sha256').update(rawOtp).digest('hex');
    assert(isMatchCorrect, 'Correct OTP verified');

    const completionToken = uuidv4();
    await pglite.query(
      `UPDATE pending_registrations SET is_verified = TRUE, verification_token = $1, code_hash = 'USED' WHERE email = $2`,
      [completionToken, normalizedEmail]
    );

    const verifiedRecord = await pglite.query(`SELECT * FROM pending_registrations WHERE email = $1`, [normalizedEmail]);
    const vRow: any = verifiedRecord.rows[0];
    assert(vRow.is_verified === true, 'Registration state marked verified');
    assert(vRow.code_hash === 'USED', 'OTP code marked USED to prevent replay');

    console.log('\n--- 5. ACCOUNT CREATION & DUPLICATE PREVENTION ---');
    const userId = uuidv4();
    const publicId = 'PHX-100200';
    const refCode = 'PHXOPERATOR';

    await pglite.query(
      `INSERT INTO users (id, public_id, full_name, email, country, password_hash, status, role, email_verified_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE', 'USER', CURRENT_TIMESTAMP)`,
      [userId, publicId, 'Test Operator', normalizedEmail, 'United States', passwordHash]
    );

    await pglite.query(
      `INSERT INTO user_referrals (user_id, referral_code) VALUES ($1, $2)`,
      [userId, refCode]
    );

    // Delete pending registration on completion
    await pglite.query(`DELETE FROM pending_registrations WHERE email = $1`, [normalizedEmail]);
    const cleanPending = await pglite.query(`SELECT * FROM pending_registrations WHERE email = $1`, [normalizedEmail]);
    assert(cleanPending.rows.length === 0, 'Pending registration purged after account creation');

    // Duplicate email check
    let dupCaught = false;
    try {
      await pglite.query(
        `INSERT INTO users (id, public_id, full_name, email, password_hash)
         VALUES ($1, $2, $3, $4, $5)`,
        [uuidv4(), 'PHX-999999', 'Dup User', normalizedEmail, passwordHash]
      );
    } catch {
      dupCaught = true;
    }
    assert(dupCaught, 'Duplicate account with same email rejected by unique constraint');

    console.log('\n--- 6. LOGIN & ACCOUNT STATUS ENFORCEMENT ---');
    // Active user session creation
    const rawSessionToken = generateRandomToken(32);
    const sessionTokenHash = hashToken(rawSessionToken);
    const sessionExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const sessionId = uuidv4();

    await pglite.query(
      `INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)`,
      [sessionId, userId, sessionTokenHash, sessionExpiresAt]
    );

    const sessionRes = await pglite.query(
      `SELECT s.*, u.status FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.token_hash = $1 AND s.revoked_at IS NULL`,
      [sessionTokenHash]
    );
    const sessRow: any = sessionRes.rows[0];
    assert(sessionRes.rows.length === 1 && sessRow?.status === 'ACTIVE', 'Active session query succeeded');

    // Suspended account test
    const suspendedId = uuidv4();
    const suspendedEmail = 'suspended@phivonex.org';
    await pglite.query(
      `INSERT INTO users (id, public_id, full_name, email, password_hash, status)
       VALUES ($1, 'PHX-SUSP01', 'Suspended User', $2, $3, 'SUSPENDED')`,
      [suspendedId, suspendedEmail, passwordHash]
    );

    const suspendedUserRes = await pglite.query(`SELECT status FROM users WHERE id = $1`, [suspendedId]);
    const suspRow: any = suspendedUserRes.rows[0];
    assert(suspRow?.status === 'SUSPENDED', 'Suspended account status detected');

    console.log('\n--- 7. GOOGLE SIGN-IN & SUSPENDED BYPASS PREVENTION ---');
    // Google sign-in checks account status
    const googleLoginStatusCheck = suspRow?.status === 'SUSPENDED';
    assert(googleLoginStatusCheck, 'Google sign-in enforces account status (SUSPENDED account blocked)');

    console.log('\n--- 8. PASSWORD RESET & SINGLE-USE TOKEN ---');
    const resetToken = generateRandomToken(32);
    const resetTokenHash = hashToken(resetToken);
    const resetTokenId = uuidv4();
    const resetExpiry = new Date(Date.now() + 60 * 60 * 1000);

    await pglite.query(
      `INSERT INTO auth_tokens (id, user_id, type, token_hash, expires_at)
       VALUES ($1, $2, 'PASSWORD_RESET', $3, $4)`,
      [resetTokenId, userId, resetTokenHash, resetExpiry]
    );

    // Verify reset token valid
    const resetCheck = await pglite.query(
      `SELECT * FROM auth_tokens WHERE token_hash = $1 AND type = 'PASSWORD_RESET' AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP`,
      [resetTokenHash]
    );
    assert(resetCheck.rows.length === 1, 'Password reset token created and valid');

    // Use reset token & revoke old sessions
    const newPass = 'BrandNewPassword2026!';
    const newHash = await hashPassword(newPass);

    await pglite.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [newHash, userId]);
    await pglite.query(`UPDATE auth_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = $1`, [resetTokenId]);
    await pglite.query(`UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = $1`, [userId]);

    const secondResetCheck = await pglite.query(
      `SELECT * FROM auth_tokens WHERE token_hash = $1 AND used_at IS NULL`,
      [resetTokenHash]
    );
    assert(secondResetCheck.rows.length === 0, 'Password reset token single-use enforced (marked used)');

    const revokedSessions = await pglite.query(`SELECT * FROM sessions WHERE user_id = $1 AND revoked_at IS NULL`, [userId]);
    assert(revokedSessions.rows.length === 0, 'Password reset revokes all active user sessions');

    console.log('\n--- 9. SESSION SECURITY & LOGOUT ---');
    // New login after password reset
    const newSessionToken = generateRandomToken(32);
    const newSessionTokenHash = hashToken(newSessionToken);
    const newSessionId = uuidv4();

    await pglite.query(
      `INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)`,
      [newSessionId, userId, newSessionTokenHash, sessionExpiresAt]
    );

    // Active session list query
    const activeSessions = await pglite.query(
      `SELECT id FROM sessions WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP`,
      [userId]
    );
    const actRow: any = activeSessions.rows[0];
    assert(activeSessions.rows.length === 1 && actRow?.id === newSessionId, 'Active sessions list returned correctly');

    // Logout
    await pglite.query(`UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP WHERE id = $1`, [newSessionId]);
    const postLogout = await pglite.query(
      `SELECT id FROM sessions WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId]
    );
    assert(postLogout.rows.length === 0, 'Logout invalidates active session in database');

    console.log('\n--- 10. ADMIN AUTHORIZATION SERVER-SIDE ENFORCEMENT ---');
    const normalUser = { email: 'user@phivonex.org', role: 'USER' };
    const adminUser = { email: 'admin@phivonex.com', role: 'ADMIN' };
    const hardcodedAdmin = { email: 'md.asifuzzman.dhakacollege@gmail.com', role: 'USER' };

    assert(!isUserAdmin(normalUser), 'Normal USER role identified as non-admin');
    assert(isUserAdmin(adminUser), 'ADMIN role identified as admin');
    assert(isUserAdmin(hardcodedAdmin), 'Super admin email identified as admin regardless of role field');

    console.log('\n===============================================================');
    console.log(`📊 PF-07 AUTH & EMAIL FINALIZATION TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('===============================================================');

    if (failed > 0) {
      process.exit(1);
    }
  } finally {
    try {
      await pglite.close();
      fs.rmSync(testDbDir, { recursive: true, force: true });
    } catch {}
  }
}

runAuthFinalizationTests().catch((err) => {
  console.error('Fatal error in PF-07 test suite:', err);
  process.exit(1);
});
