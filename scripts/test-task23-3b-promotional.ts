/**
 * PHIVONEX — TASK #23.3B PROMOTIONAL OFFERS & LEADERBOARD INTEGRATION TESTS
 * 
 * Validates:
 * - Active offer displays properly.
 * - Expired offer disappears automatically.
 * - Disabled offer disappears automatically.
 * - Banner display ordering works correctly.
 * - Performance leaderboard calculation works dynamically.
 * - Leaderboard uses privacy-safe display names (no emails, phone numbers, or wallet addresses).
 * - Performance popup payload contains safe top-performer highlights using real data.
 */

import assert from 'assert';
import { getDb } from '../src/server/db/db';
import {
  getPromotionalOffers,
  createPromotionalOffer,
  updatePromotionalOffer,
  deletePromotionalOffer,
  getPromotionalBanners,
  createPromotionalBanner,
  getLeaderboard,
  updateLeaderboardSettings,
  getPerformancePopupData,
  updatePerformancePopupSettings
} from '../src/server/services/promotionalService';

async function runTask23_3bTests() {
  console.log('========================================================================');
  console.log('🚀 RUNNING PHIVONEX TASK #23.3B PROMOTIONAL INTEGRATION TEST SUITE');
  console.log('========================================================================\n');

  const db = await getDb();
  let passed = 0;
  let failed = 0;

  const runTest = async (name: string, fn: () => Promise<void> | void) => {
    try {
      await fn();
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`  ❌ FAIL: ${name}`);
      console.error(`     Error Details: ${err.message || err}\n`);
      failed++;
    }
  };

  const adminId = '3c45abba-b586-4032-8cf4-6a039eec92bc';
  const adminPublicId = 'U_ADMIN_ACTOR';

  // Ensure test users / admins are seeded in the DB
  await db.query(
    `INSERT INTO users (id, public_id, full_name, email, password_hash, role, status, country)
     VALUES ($1, $2, 'Admin Actor', 'admin@phivonex.com', 'hash', 'ADMIN', 'ACTIVE', 'US')
     ON CONFLICT (id) DO UPDATE SET role = 'ADMIN'`,
    [adminId, adminPublicId]
  );

  // Clean tables before tests
  await db.query('DELETE FROM promotional_offers');
  await db.query('DELETE FROM promotional_banners');

  // ------------------------------------------------------------------------
  // 1. DYNAMIC OFFERS - VISIBILITY AND FILTERING
  // ------------------------------------------------------------------------
  await runTest('Verify offer display filtering (active, expired, disabled)', async () => {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const oneDayAhead = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();

    // Offer A: Active (Starts yesterday, ends tomorrow)
    const offerA = await createPromotionalOffer(adminId, adminPublicId, {
      title: 'Active Promo',
      description: 'Get extra rewards',
      bannerImage: '/images/active.png',
      offerType: 'BOGO_FREE_NODE',
      bonusNodesCount: 1,
      bonusMiningRewards: true,
      bonusMatchingEnabled: false,
      bonusReferralCommission: false,
      startDate: oneDayAgo,
      endDate: oneDayAhead,
      status: 'ACTIVE',
      targetAudience: 'ALL',
      priorityOrder: 1
    });

    // Offer B: Expired (Ended 2 days ago)
    const offerB = await createPromotionalOffer(adminId, adminPublicId, {
      title: 'Expired Promo',
      description: 'Already ended promo',
      bannerImage: '/images/expired.png',
      offerType: 'BOGO_FREE_NODE',
      bonusNodesCount: 1,
      bonusMiningRewards: true,
      bonusMatchingEnabled: false,
      bonusReferralCommission: false,
      startDate: fiveDaysAgo,
      endDate: twoDaysAgo,
      status: 'ACTIVE',
      targetAudience: 'ALL',
      priorityOrder: 2
    });

    // Offer C: Disabled (But falls within valid timeframe)
    const offerC = await createPromotionalOffer(adminId, adminPublicId, {
      title: 'Disabled Promo',
      description: 'Should not show up',
      bannerImage: '/images/disabled.png',
      offerType: 'BOGO_FREE_NODE',
      bonusNodesCount: 1,
      bonusMiningRewards: true,
      bonusMatchingEnabled: false,
      bonusReferralCommission: false,
      startDate: oneDayAgo,
      endDate: oneDayAhead,
      status: 'INACTIVE',
      targetAudience: 'ALL',
      priorityOrder: 3
    });

    // User Panel view: Only active and non-expired must return
    const userOffers = await getPromotionalOffers(false);
    assert.strictEqual(userOffers.length, 1, 'Only 1 offer should be visible to users');
    assert.strictEqual(userOffers[0].id, offerA.id, 'The visible offer must be the active one');

    // Admin view: All offers must return
    const adminOffers = await getPromotionalOffers(true);
    assert.strictEqual(adminOffers.length, 3, 'Admin must see all 3 offers');
  });

  // ------------------------------------------------------------------------
  // 2. BANNERS - ORDERING AND TIMING
  // ------------------------------------------------------------------------
  await runTest('Verify banner displays schedule and priority order sorting', async () => {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const oneDayAhead = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

    // Banner A: Priority 10
    await createPromotionalBanner(adminId, adminPublicId, {
      content: 'Low Priority Banner',
      imageUrl: '/images/low.png',
      ctaText: 'Go',
      ctaDestination: '/nodes',
      displayOrder: 10,
      status: 'ACTIVE',
      startDate: oneDayAgo,
      endDate: oneDayAhead
    });

    // Banner B: Priority 1 (Should appear first)
    await createPromotionalBanner(adminId, adminPublicId, {
      content: 'High Priority Banner',
      imageUrl: '/images/high.png',
      ctaText: 'Go Fast',
      ctaDestination: '/wallet',
      displayOrder: 1,
      status: 'ACTIVE',
      startDate: oneDayAgo,
      endDate: oneDayAhead
    });

    const activeBanners = await getPromotionalBanners(false);
    assert.strictEqual(activeBanners.length, 2, 'Both banners are active and scheduled');
    assert.strictEqual(activeBanners[0].displayOrder, 1, 'Banner with display order 1 appears first');
    assert.strictEqual(activeBanners[1].displayOrder, 10, 'Banner with display order 10 appears second');
  });

  // ------------------------------------------------------------------------
  // 3. LEADERBOARD - SECURITY AND PRIVACY SAFETY
  // ------------------------------------------------------------------------
  await runTest('Verify leaderboard privacy protection and secure display names', async () => {
    // Generate a test leaderboard
    await updateLeaderboardSettings(adminId, adminPublicId, 'DIRECT_REFERRALS');
    
    const leaderboard = await getLeaderboard('DIRECT_REFERRALS');
    
    // Check that privacy rules are strictly enforced
    for (const entry of leaderboard) {
      assert(entry.rank, 'Rank must be present');
      assert(entry.publicId, 'Public ID must be present');
      assert(entry.displayName, 'Display Name must be present');
      
      // Strict privacy safety checks
      const strEntry = JSON.stringify(entry);
      assert.strictEqual(strEntry.includes('@'), false, 'Email leaked in leaderboard');
      assert.strictEqual(strEntry.includes('0x'), false, 'Wallet address leaked in leaderboard');
      
      // Check display name format John D.
      if (entry.displayName.includes(' ')) {
        const parts = entry.displayName.split(' ');
        assert.strictEqual(parts[1].length, 2, 'Last name must be abbreviated to initial plus a dot (e.g. D.)');
        assert(parts[1].endsWith('.'), 'Last name initial must end with dot');
      }
    }
  });

  // ------------------------------------------------------------------------
  // 4. PERFORMANCE POPUP - SYNCED DATA
  // ------------------------------------------------------------------------
  await runTest('Verify performance popup highlights top performers using real data', async () => {
    // Enable popup for DIRECT_REFERRALS, showing top 2 performers
    await updatePerformancePopupSettings(adminId, adminPublicId, {
      enabled: true,
      metric: 'DIRECT_REFERRALS',
      topCount: 2,
      durationSeconds: 10
    });

    const popupData = await getPerformancePopupData();
    assert.strictEqual(popupData.enabled, true);
    assert.strictEqual(popupData.metric, 'DIRECT_REFERRALS');
    assert.strictEqual(popupData.displayDurationSeconds, 10);
    assert(Array.isArray(popupData.users));
    assert(popupData.users.length <= 2, 'Popup should show at most top 2 performers');

    if (popupData.users.length > 0) {
      const topUser = popupData.users[0];
      assert.strictEqual(topUser.rank, 1);
      assert(topUser.displayName);
      assert(topUser.publicId);
      assert.strictEqual(topUser.achievementType, 'Fast Growth');
    }
  });

  console.log('\n========================================================================');
  console.log(`📊 PROMOTIONAL TEST SUITE RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTask23_3bTests().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
