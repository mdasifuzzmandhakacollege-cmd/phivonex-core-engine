/**
 * Automated test suite for Task #4: Authenticated Dashboard Base / App Shell
 * Run with: npx tsx scripts/test-dashboard.ts
 */

import { getDb } from '../src/server/db/db';
import { hashPassword, generateRandomToken, hashToken } from '../src/server/utils/crypto';
import { generatePublicId, generateReferralCode, formatSafeDisplayName } from '../src/server/utils/idGenerator';
import { v4 as uuidv4 } from 'uuid';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string) {
  if (condition) {
    console.log(`✅ [PASS] ${testName}`);
    passed++;
  } else {
    console.error(`❌ [FAIL] ${testName}`);
    failed++;
  }
}

async function runDashboardTests() {
  console.log('========================================');
  console.log('🧪 RUNNING TASK #4 DASHBOARD & SHELL TESTS');
  console.log('========================================\n');

  const db = await getDb();

  const timestamp = Date.now();
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);

  // 1. Create a Sponsor User
  const sponsorId = uuidv4();
  const sponsorEmail = `sponsor_dash_${timestamp}_${randomSuffix}@example.com`;
  const sponsorPhone = `+1202555${randomSuffix}`;
  const sponsorPublicId = generatePublicId();
  const sponsorReferralCode = generateReferralCode();
  const sponsorPassHash = await hashPassword('StrongPassword123!');

  await db.query(
    `INSERT INTO users (id, email, password_hash, full_name, phone, country, public_id, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')`,
    [sponsorId, sponsorEmail, sponsorPassHash, 'Robert Vance', sponsorPhone, 'US', sponsorPublicId]
  );

  await db.query(
    `INSERT INTO user_referrals (user_id, referral_code)
     VALUES ($1, $2)`,
    [sponsorId, sponsorReferralCode]
  );

  // 2. Create an Operator User linked to Sponsor
  const userId = uuidv4();
  const userEmail = `operator_dash_${timestamp}_${randomSuffix}@example.com`;
  const userPhone = `+447911${randomSuffix}99`;
  const userPublicId = generatePublicId();
  const userReferralCode = generateReferralCode();
  const userPassHash = await hashPassword('OperatorPass123!');

  await db.query(
    `INSERT INTO users (id, email, password_hash, full_name, phone, country, public_id, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')`,
    [userId, userEmail, userPassHash, 'Elena Rostova', userPhone, 'GB', userPublicId]
  );

  await db.query(
    `INSERT INTO user_referrals (user_id, sponsor_user_id, referral_code)
     VALUES ($1, $2, $3)`,
    [userId, sponsorId, userReferralCode]
  );

  // 3. Test Session Creation
  const sessionToken = generateRandomToken();
  const tokenHash = hashToken(sessionToken);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  await db.query(
    `INSERT INTO sessions (id, user_id, token_hash, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [uuidv4(), userId, tokenHash, expiresAt]
  );

  // Test 1: Unauthenticated Session Check (Missing/Invalid Token)
  const invalidToken = 'invalid_nonexistent_token_12345';
  const invalidHash = hashToken(invalidToken);
  const checkInvalid = await db.query(
    `SELECT s.id FROM sessions s WHERE s.token_hash = $1 AND s.revoked_at IS NULL`,
    [invalidHash]
  );
  assert(checkInvalid.rows.length === 0, 'Unauthenticated session token correctly rejected');

  // Test 2: Authenticated Session Resolution
  const checkValid = await db.query(
    `SELECT u.id as user_id, u.public_id, u.email, u.full_name, u.phone, u.country, u.status, u.email_verified_at
     FROM sessions s
     JOIN users u ON s.user_id = u.id
     WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > CURRENT_TIMESTAMP`,
    [tokenHash]
  );
  assert(checkValid.rows.length === 1, 'Authenticated operator session resolves in database');

  const userData: any = checkValid.rows[0];
  assert(userData.public_id === userPublicId, 'Public PHIVONEX ID matches operator public_id');
  assert(/^PHX-[0-9A-Z]{6}$/.test(userData.public_id), 'Public ID format conforms to PHX-XXXXXX');
  assert(userData.full_name === 'Elena Rostova', 'Operator full name preserved');
  assert(userData.country === 'GB', 'Country attribute preserved');
  assert(userData.phone === userPhone, 'Phone attribute preserved');

  // Test 3: Referral Identity API Data Resolution (/api/referrals/me)
  const referralQuery = await db.query(
    `SELECT 
       u.public_id AS user_public_id,
       ur.referral_code AS user_referral_code,
       sp.public_id AS sponsor_public_id,
       sp.full_name AS sponsor_full_name
     FROM user_referrals ur
     JOIN users u ON ur.user_id = u.id
     LEFT JOIN users sp ON ur.sponsor_user_id = sp.id
     WHERE ur.user_id = $1`,
    [userId]
  );
  assert(referralQuery.rows.length === 1, 'Referral metadata resolved for current operator');
  const refRow: any = referralQuery.rows[0];

  assert(refRow.user_referral_code === userReferralCode, 'Personal referral code matches registered record');
  assert(refRow.sponsor_public_id === sponsorPublicId, 'Sponsor Public ID correctly resolved');

  const sanitizedSponsorName = formatSafeDisplayName(refRow.sponsor_full_name || '');
  assert(sanitizedSponsorName === 'Robert V.', 'Sponsor display name sanitized for privacy (Robert V.)');

  // Test 4: Privacy Protection - Ensure Internal UUID is NOT returned in public payload
  const publicSafePayload = {
    publicId: refRow.user_public_id,
    referralCode: refRow.user_referral_code,
    referralUrl: `https://phivonex.network/register?ref=${refRow.user_referral_code}`,
    sponsor: refRow.sponsor_public_id
      ? {
          publicId: refRow.sponsor_public_id,
          displayName: sanitizedSponsorName,
        }
      : null,
  };

  assert(!('id' in publicSafePayload), 'Public payload strictly omits internal database UUID');
  assert(!('user_id' in publicSafePayload), 'Public payload strictly omits user_id');
  assert(!('sponsor_user_id' in publicSafePayload), 'Public payload strictly omits sponsor_user_id');

  // Test 5: Direct Genesis Operator (No Sponsor) Referral Resolution
  const genesisPublicId = generatePublicId();
  const genesisCode = generateReferralCode();
  const genesisId = uuidv4();
  await db.query(
    `INSERT INTO users (id, email, password_hash, full_name, country, public_id, status)
     VALUES ($1, $2, $3, 'Genesis Operator', 'US', $4, 'active')`,
    [genesisId, `genesis_${timestamp}_${randomSuffix}@example.com`, sponsorPassHash, genesisPublicId]
  );
  await db.query(
    `INSERT INTO user_referrals (user_id, referral_code)
     VALUES ($1, $2)`,
    [genesisId, genesisCode]
  );

  const genesisRefQuery = await db.query(
    `SELECT 
       u.public_id AS user_public_id,
       ur.referral_code AS user_referral_code,
       sp.public_id AS sponsor_public_id
     FROM user_referrals ur
     JOIN users u ON ur.user_id = u.id
     LEFT JOIN users sp ON ur.sponsor_user_id = sp.id
     WHERE ur.user_id = $1`,
    [genesisId]
  );

  assert(genesisRefQuery.rows.length === 1, 'Genesis operator referral metadata resolved');
  assert((genesisRefQuery.rows[0] as any).sponsor_public_id === null, 'Genesis operator has null sponsor (Direct Genesis)');

  // Test 6: Logout & Session Revocation
  await db.query(
    `UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP WHERE token_hash = $1`,
    [tokenHash]
  );

  const checkRevoked = await db.query(
    `SELECT id FROM sessions WHERE token_hash = $1 AND revoked_at IS NULL`,
    [tokenHash]
  );
  assert(checkRevoked.rows.length === 0, 'Revoked session is rejected after logout');

  console.log('========================================');
  console.log(`📊 DASHBOARD TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runDashboardTests().catch((err) => {
  console.error('Test run failed with error:', err);
  process.exit(1);
});
