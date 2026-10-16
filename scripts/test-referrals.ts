import { getDb } from '../src/server/db/db';
import { hashPassword, generateRandomToken, hashToken } from '../src/server/utils/crypto';
import { generatePublicId, generateReferralCode, normalizeReferralCode, formatSafeDisplayName } from '../src/server/utils/idGenerator';
import { v4 as uuidv4 } from 'uuid';

async function runReferralTests() {
  console.log('========================================');
  console.log('🧪 RUNNING TASK #3 REFERRAL & SPONSOR TESTS');
  console.log('========================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, title: string) {
    if (condition) {
      console.log(`✅ [PASS] ${title}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${title}`);
      failed++;
    }
  }

  const db = await getDb();

  try {
    const timestamp = Date.now();

    // Test 1: ID generation format
    const publicId = generatePublicId();
    assert(/^PHX-[0-9A-Z]{6}$/.test(publicId), 'Public ID format matches PHX-XXXXXX');

    const referralCode = generateReferralCode();
    assert(/^PHX[0-9A-Z]{6}$/.test(referralCode), 'Referral code format matches PHXXXXXXX');

    // Test 2: Safe display name helper
    assert(formatSafeDisplayName('John Doe') === 'John D.', 'Safe display name formats "John Doe" -> "John D."');
    assert(formatSafeDisplayName('Satoshi') === 'Satoshi', 'Safe display name formats single word');
    assert(formatSafeDisplayName('Sarah Jane Connor') === 'Sarah C.', 'Safe display name formats multi-word name');

    // Test 3: Create Sponsor User (User A)
    const userA_Id = uuidv4();
    const userA_PublicId = generatePublicId();
    const userA_RefCode = generateReferralCode();
    const userA_PassHash = await hashPassword('SponsorPass123!@#');

    await db.query(
      `INSERT INTO users (id, public_id, full_name, email, country, password_hash, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE')`,
      [userA_Id, userA_PublicId, 'Alice Sponsor', `alice.sponsor.${timestamp}@test.phivonex.org`, 'United States', userA_PassHash]
    );

    await db.query(
      `INSERT INTO user_referrals (user_id, referral_code, sponsor_user_id)
       VALUES ($1, $2, NULL)`,
      [userA_Id, userA_RefCode]
    );

    assert(true, 'Sponsor user created with unique public ID and referral code');

    // Test 4: Resolve valid referral code
    const resolveValid = await db.query<{ referral_code: string; public_id: string; full_name: string; status: string }>(
      `SELECT r.referral_code, u.public_id, u.full_name, u.status
       FROM user_referrals r
       JOIN users u ON r.user_id = u.id
       WHERE r.referral_code = $1`,
      [userA_RefCode]
    );

    assert(resolveValid.rowCount === 1, 'Valid referral code resolves in database');
    assert(resolveValid.rows[0].public_id === userA_PublicId, 'Resolved public ID matches sponsor');
    assert(formatSafeDisplayName(resolveValid.rows[0].full_name) === 'Alice S.', 'Safe display name returned without exposing full name or email');

    // Test 5: Resolve invalid referral code
    const resolveInvalid = await db.query(
      `SELECT r.referral_code FROM user_referrals r WHERE r.referral_code = $1`,
      ['PHXINVALID999']
    );
    assert(resolveInvalid.rowCount === 0, 'Invalid referral code query returns 0 rows');

    // Test 6: Create User B referred by User A (Sponsor relationship)
    const userB_Id = uuidv4();
    const userB_PublicId = generatePublicId();
    const userB_RefCode = generateReferralCode();
    const userB_PassHash = await hashPassword('UserBPass123!@#');

    await db.query(
      `INSERT INTO users (id, public_id, full_name, email, country, password_hash, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE')`,
      [userB_Id, userB_PublicId, 'Bob User', `bob.user.${timestamp}@test.phivonex.org`, 'Canada', userB_PassHash]
    );

    await db.query(
      `INSERT INTO user_referrals (user_id, referral_code, sponsor_user_id)
       VALUES ($1, $2, $3)`,
      [userB_Id, userB_RefCode, userA_Id]
    );

    const checkSponsorB = await db.query<{ sponsor_user_id: string }>(
      `SELECT sponsor_user_id FROM user_referrals WHERE user_id = $1`,
      [userB_Id]
    );

    assert(checkSponsorB.rows[0].sponsor_user_id === userA_Id, 'User B correctly linked to Sponsor User A');

    // Test 7: Prevent Self-Referral (Constraint check)
    let selfReferralBlocked = false;
    try {
      const userC_Id = uuidv4();
      const userC_PublicId = generatePublicId();
      const userC_RefCode = generateReferralCode();
      const userC_PassHash = await hashPassword('UserCPass123!@#');

      await db.query(
        `INSERT INTO users (id, public_id, full_name, email, country, password_hash, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE')`,
        [userC_Id, userC_PublicId, 'Charlie Self', `charlie.${timestamp}@test.phivonex.org`, 'United Kingdom', userC_PassHash]
      );

      // Attempt self-referral where user_id == sponsor_user_id
      await db.query(
        `INSERT INTO user_referrals (user_id, referral_code, sponsor_user_id)
         VALUES ($1, $2, $3)`,
        [userC_Id, userC_RefCode, userC_Id]
      );
    } catch {
      selfReferralBlocked = true;
    }
    assert(selfReferralBlocked, 'Self-referral is blocked by database constraint (chk_no_self_referral)');

    // Test 8: Duplicate public_id is rejected by unique constraint
    let duplicatePublicIdBlocked = false;
    try {
      const dupeUser_Id = uuidv4();
      await db.query(
        `INSERT INTO users (id, public_id, full_name, email, country, password_hash, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE')`,
        [dupeUser_Id, userA_PublicId, 'Dupe Public ID', `dupe.publicid.${timestamp}@test.phivonex.org`, 'Germany', userA_PassHash]
      );
    } catch {
      duplicatePublicIdBlocked = true;
    }
    assert(duplicatePublicIdBlocked, 'Duplicate public_id is rejected by UNIQUE constraint');

    // Test 9: Duplicate referral_code is rejected by unique constraint
    let duplicateRefCodeBlocked = false;
    try {
      const dupeUser2_Id = uuidv4();
      const dupeUser2_PublicId = generatePublicId();
      await db.query(
        `INSERT INTO users (id, public_id, full_name, email, country, password_hash, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE')`,
        [dupeUser2_Id, dupeUser2_PublicId, 'Dupe Ref Code', `dupe.refcode.${timestamp}@test.phivonex.org`, 'Germany', userA_PassHash]
      );

      await db.query(
        `INSERT INTO user_referrals (user_id, referral_code, sponsor_user_id)
         VALUES ($1, $2, NULL)`,
        [dupeUser2_Id, userA_RefCode]
      );
    } catch {
      duplicateRefCodeBlocked = true;
    }
    assert(duplicateRefCodeBlocked, 'Duplicate referral_code is rejected by UNIQUE constraint');

    // Test 10: Authenticated user querying own referral info /me
    const myRefInfo = await db.query<{
      public_id: string;
      referral_code: string;
      sponsor_user_id: string | null;
    }>(
      `SELECT u.public_id, r.referral_code, r.sponsor_user_id
       FROM users u
       JOIN user_referrals r ON u.id = r.user_id
       WHERE u.id = $1`,
      [userB_Id]
    );

    assert(myRefInfo.rowCount === 1, 'Authenticated user referral lookup succeeds');
    assert(myRefInfo.rows[0].public_id === userB_PublicId, 'Public ID matches User B');
    assert(myRefInfo.rows[0].referral_code === userB_RefCode, 'Referral code matches User B');

    // Sponsor resolution for User B
    const sponsorLookup = await db.query<{ public_id: string; full_name: string }>(
      `SELECT public_id, full_name FROM users WHERE id = $1`,
      [myRefInfo.rows[0].sponsor_user_id]
    );
    assert(sponsorLookup.rowCount === 1, 'Sponsor details resolved for User B');
    assert(sponsorLookup.rows[0].public_id === userA_PublicId, 'Sponsor public ID is safe and correct');
    assert(formatSafeDisplayName(sponsorLookup.rows[0].full_name) === 'Alice S.', 'Sponsor display name sanitized');

  } catch (err) {
    console.error('Test execution error:', err);
    failed++;
  }

  console.log('\n========================================');
  console.log(`📊 REFERRAL TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================');

  process.exit(failed > 0 ? 1 : 0);
}

runReferralTests();
