/**
 * TASK #20: IN-APP PROTOCOL NOTIFICATIONS TEST SUITE
 *
 * Verifies:
 * 1. Notification creation & NTF-XXXXXX public ID generation
 * 2. Strict idempotency protection via UNIQUE(user_id, source_type, source_id, type)
 * 3. Domain event notification helpers:
 *    - notifyNodeActivated
 *    - notifyReferralEarned
 *    - notifyMatchingEarned
 *    - notifyPromotionEarned
 *    - notifyPhivoReward
 *    - notifyPhivoSwapCompleted
 *    - notifyUsdtDepositConfirmed
 *    - notifyWithdrawalStatus (PENDING, APPROVED, COMPLETED, REJECTED)
 *    - notifySecurityAlert
 * 4. User pagination, unreadOnly filtering, and type filtering
 * 5. Accurate unread count calculation
 * 6. Mark single notification as read (read_at populated)
 * 7. Mark all notifications as read (batch update)
 * 8. Strict user isolation: users cannot view or mutate another user's notifications
 * 9. Concurrent duplicate submission protection
 */

import { getDb } from '../src/server/db/db';
import { v4 as uuidv4 } from 'uuid';
import {
  createNotification,
  getUserNotifications,
  getUnreadNotificationCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  deleteAllNotifications,
  notifyNodeActivated,
  notifyReferralEarned,
  notifyMatchingEarned,
  notifyPromotionEarned,
  notifyPhivoReward,
  notifyPhivoSwapCompleted,
  notifyUsdtDepositConfirmed,
  notifyWithdrawalStatus,
  notifySecurityAlert,
} from '../src/server/services/notificationService';

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

async function runTask20Tests() {
  console.log('========================================================');
  console.log('🚀 RUNNING TASK #20: IN-APP NOTIFICATIONS ENGINE TESTS');
  console.log('========================================================');

  const db = await getDb();
  const runTag = Date.now().toString().slice(-6);

  // 1. Setup Test Users
  const user1Id = uuidv4();
  const user2Id = uuidv4();

  await db.query(`
    INSERT INTO users (id, public_id, full_name, email, country, password_hash, role)
    VALUES 
      ($1, $2, 'Notification User One', $3, 'US', 'hash1', 'USER'),
      ($4, $5, 'Notification User Two', $6, 'US', 'hash2', 'USER')
  `, [
    user1Id, `PHX-NTF1-${runTag}`, `notif1-${runTag}@phivonex.test`,
    user2Id, `PHX-NTF2-${runTag}`, `notif2-${runTag}@phivonex.test`
  ]);

  console.log('\n--- TEST GROUP 1: Base Notification Creation & Format ---');
  {
    const notif = await createNotification({
      userId: user1Id,
      type: 'SECURITY_ALERT',
      title: 'New Session Handshake',
      message: 'New TLS session established from IP 192.168.1.1.',
    });

    assert(notif !== null, 'Notification created successfully');
    assert(typeof notif?.id === 'string' && notif.id.startsWith('NTF-'), `Public ID format NTF-XXXXXX (${notif?.id})`);
    assert(notif?.type === 'SECURITY_ALERT', 'Notification type is SECURITY_ALERT');
    assert(notif?.title === 'New Session Handshake', 'Title matches input');
    assert(notif?.message === 'New TLS session established from IP 192.168.1.1.', 'Message matches input');
    assert(notif?.readAt === null, 'Initial readAt is null (unread)');
    assert(typeof notif?.createdAt === 'string' && notif.createdAt.length > 0, 'createdAt is ISO timestamp');
  }

  console.log('\n--- TEST GROUP 2: Strict Idempotency Protection ---');
  {
    const sourceEntityId = `ORD-TEST-${runTag}`;
    
    // First creation
    const notif1 = await createNotification({
      userId: user1Id,
      type: 'NODE_ACTIVATED',
      title: 'Genesis Node Activated',
      message: 'Your Genesis Node #101 is now ACTIVE.',
      sourceType: 'NODE_ORDER',
      sourceId: sourceEntityId,
    });
    assert(notif1 !== null, 'First notification with unique sourceId created');

    // Duplicate creation attempt with same (userId, sourceType, sourceId, type)
    const notifDuplicate = await createNotification({
      userId: user1Id,
      type: 'NODE_ACTIVATED',
      title: 'Genesis Node Activated',
      message: 'Duplicate attempt to notify Node #101.',
      sourceType: 'NODE_ORDER',
      sourceId: sourceEntityId,
    });
    assert(notifDuplicate === null, 'Duplicate notification returns null (strictly blocked)');

    // Verify DB count: only 1 row exists
    const dbCountRes = await db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND source_type = 'NODE_ORDER' AND source_id = $2`,
      [user1Id, sourceEntityId]
    );
    assert(parseInt(dbCountRes.rows[0].count, 10) === 1, 'Database contains exactly 1 row for idempotent entity');
  }

  console.log('\n--- TEST GROUP 3: Domain-Specific Event Helper Integrations ---');
  {
    // 3.1 Node Activated
    const nNode = await notifyNodeActivated({
      userId: user1Id,
      nodeNumber: 105,
      orderPublicId: `PHX-ORD-105-${runTag}`,
      sourceId: `ORDER-105-${runTag}`,
    });
    assert(nNode !== null, 'notifyNodeActivated creates notification');
    assert(nNode?.type === 'NODE_ACTIVATED', 'notifyNodeActivated sets type NODE_ACTIVATED');
    assert(nNode?.message.includes('#105'), 'notifyNodeActivated message contains node number');

    // 3.2 Referral Earned
    const nRef = await notifyReferralEarned({
      userId: user1Id,
      amountUsd: 50.00,
      buyerPublicId: 'PHX-BUYER-1',
      commissionId: `COMM-REF-${runTag}`,
    });
    assert(nRef !== null, 'notifyReferralEarned creates notification');
    assert(nRef?.type === 'REFERRAL_EARNED', 'notifyReferralEarned sets type REFERRAL_EARNED');
    assert(nRef?.message.includes('+$50.00 USDT'), 'notifyReferralEarned message contains formatted USDT amount');

    // 3.3 Matching Bonus Earned
    const nMatch = await notifyMatchingEarned({
      userId: user1Id,
      bonusUsd: 120.00,
      settlementId: `SETTLE-MATCH-${runTag}`,
    });
    assert(nMatch !== null, 'notifyMatchingEarned creates notification');
    assert(nMatch?.type === 'MATCHING_EARNED', 'notifyMatchingEarned sets type MATCHING_EARNED');
    assert(nMatch?.message.includes('+$120.00 USDT'), 'notifyMatchingEarned message contains bonus amount');

    // 3.4 Promotion Earned
    const nPromo = await notifyPromotionEarned({
      userId: user1Id,
      bonusUsd: 5000.00,
      milestoneTitle: '20/20 Pioneer',
      bonusId: `PROMO-20-${runTag}`,
    });
    assert(nPromo !== null, 'notifyPromotionEarned creates notification');
    assert(nPromo?.type === 'PROMOTION_EARNED', 'notifyPromotionEarned sets type PROMOTION_EARNED');
    assert(nPromo?.message.includes('20/20 Pioneer'), 'notifyPromotionEarned message contains milestone title');
    assert(nPromo?.message.includes('+$5000.00 USDT'), 'notifyPromotionEarned message contains bonus amount');

    // 3.5 Mining Reward
    const nReward = await notifyPhivoReward({
      userId: user1Id,
      amountPhivo: 25.5000,
      rewardId: `REWARD-${runTag}`,
    });
    assert(nReward !== null, 'notifyPhivoReward creates notification');
    assert(nReward?.type === 'PHIVO_REWARD', 'notifyPhivoReward sets type PHIVO_REWARD');
    assert(nReward?.message.includes('25.5000 PHIVO'), 'notifyPhivoReward message contains formatted PHIVO amount');

    // 3.6 Coin Swap Completed
    const nSwap = await notifyPhivoSwapCompleted({
      userId: user1Id,
      coinAmount: 100.0,
      usdtAmount: 10.0,
      rateUsdt: 0.10,
      swapId: `SWAP-EVENT-${runTag}`,
    });
    assert(nSwap !== null, 'notifyPhivoSwapCompleted creates notification');
    assert(nSwap?.type === 'PHIVO_SWAP_COMPLETED', 'notifyPhivoSwapCompleted sets type PHIVO_SWAP_COMPLETED');
    assert(nSwap?.message.includes('$10.00 USDT'), 'notifyPhivoSwapCompleted contains USDT proceeds');

    // 3.7 Blockchain Deposit Confirmed
    const nDeposit = await notifyUsdtDepositConfirmed({
      userId: user1Id,
      amountUsdt: 500.00,
      depositId: `DEP-${runTag}`,
      txHash: '0x1234567890abcdef1234567890abcdef',
    });
    assert(nDeposit !== null, 'notifyUsdtDepositConfirmed creates notification');
    assert(nDeposit?.type === 'USDT_DEPOSIT_CONFIRMED', 'notifyUsdtDepositConfirmed sets type USDT_DEPOSIT_CONFIRMED');
    assert(nDeposit?.message.includes('$500.00 USDT'), 'notifyUsdtDepositConfirmed contains deposit amount');

    // 3.8 Withdrawal Statuses
    const wPending = await notifyWithdrawalStatus({
      userId: user1Id,
      amountUsdt: 150.00,
      status: 'PENDING',
      withdrawalId: `WDR-${runTag}`,
    });
    assert(wPending !== null, 'notifyWithdrawalStatus PENDING created');
    assert(wPending?.title === 'Withdrawal Request Submitted', 'PENDING title matches');

    const wApproved = await notifyWithdrawalStatus({
      userId: user1Id,
      amountUsdt: 150.00,
      status: 'APPROVED',
      withdrawalId: `WDR-${runTag}`,
    });
    assert(wApproved !== null, 'notifyWithdrawalStatus APPROVED created');
    assert(wApproved?.title === 'Withdrawal Request Approved', 'APPROVED title matches');

    const wCompleted = await notifyWithdrawalStatus({
      userId: user1Id,
      amountUsdt: 150.00,
      status: 'COMPLETED',
      withdrawalId: `WDR-${runTag}`,
    });
    assert(wCompleted !== null, 'notifyWithdrawalStatus COMPLETED created');
    assert(wCompleted?.title === 'Withdrawal Disbursed', 'COMPLETED title matches');

    const wRejected = await notifyWithdrawalStatus({
      userId: user1Id,
      amountUsdt: 150.00,
      status: 'REJECTED',
      withdrawalId: `WDR-${runTag}`,
      reason: 'Invalid BEP20 destination format',
    });
    assert(wRejected !== null, 'notifyWithdrawalStatus REJECTED created');
    assert(wRejected?.title === 'Withdrawal Rejected', 'REJECTED title matches');
    assert(wRejected?.message.includes('Invalid BEP20 destination format'), 'REJECTED message includes rejection reason');

    // 3.9 Security Alert
    const nSec = await notifySecurityAlert({
      userId: user1Id,
      title: 'Password Changed',
      message: 'Your account password was updated from a new browser.',
      sourceId: `SEC-${runTag}`,
    });
    assert(nSec !== null, 'notifySecurityAlert creates notification');
    assert(nSec?.type === 'SECURITY_ALERT', 'notifySecurityAlert sets type SECURITY_ALERT');
  }

  console.log('\n--- TEST GROUP 4: Pagination & Filtering ---');
  {
    // Retrieve notifications for User 1
    const resAll = await getUserNotifications(user1Id, { limit: 10, offset: 0 });
    assert(resAll.notifications.length === 10, 'Limit 10 returns exactly 10 items');
    assert(resAll.total > 10, `Total items (${resAll.total}) reflects all generated notifications`);
    assert(resAll.unreadCount === resAll.total, 'All created notifications are initially unread');

    // Filter by type
    const resFiltered = await getUserNotifications(user1Id, { type: 'REFERRAL_EARNED' });
    assert(resFiltered.notifications.length === 1, 'Type filter returns exactly 1 matching item');
    assert(resFiltered.notifications[0].type === 'REFERRAL_EARNED', 'Filtered item type matches');

    // Offset pagination
    const resPage2 = await getUserNotifications(user1Id, { limit: 5, offset: 5 });
    assert(resPage2.notifications.length === 5, 'Page 2 with offset 5 returns 5 items');
    assert(resPage2.notifications[0].id !== resAll.notifications[0].id, 'Page 2 does not overlap with Page 1 top item');
  }

  console.log('\n--- TEST GROUP 5: Unread Count & Mark as Read ---');
  {
    const initialUnread = await getUnreadNotificationCount(user1Id);
    assert(initialUnread > 0, `Initial unread count is positive (${initialUnread})`);

    const userNotifs = await getUserNotifications(user1Id, { limit: 1 });
    const targetNotifId = userNotifs.notifications[0].id;

    // Mark single notification as read
    const markSuccess = await markNotificationAsRead(user1Id, targetNotifId);
    assert(markSuccess === true, 'markNotificationAsRead returns true on first mark');

    const updatedUnread = await getUnreadNotificationCount(user1Id);
    assert(updatedUnread === initialUnread - 1, `Unread count correctly decremented from ${initialUnread} to ${updatedUnread}`);

    // Marking already read notification returns false
    const markAgain = await markNotificationAsRead(user1Id, targetNotifId);
    assert(markAgain === false, 'markNotificationAsRead returns false when already marked as read');

    // Filter unreadOnly
    const unreadRes = await getUserNotifications(user1Id, { unreadOnly: true });
    const containsMarked = unreadRes.notifications.some((n) => n.id === targetNotifId);
    assert(containsMarked === false, 'unreadOnly query strictly excludes marked notification');
  }

  console.log('\n--- TEST GROUP 6: Mark All Notifications as Read ---');
  {
    const remainingUnreadBefore = await getUnreadNotificationCount(user1Id);
    assert(remainingUnreadBefore > 0, `User 1 still has unread notifications (${remainingUnreadBefore})`);

    const markedCount = await markAllNotificationsAsRead(user1Id);
    assert(markedCount === remainingUnreadBefore, `markAllNotificationsAsRead returned updated count (${markedCount})`);

    const remainingUnreadAfter = await getUnreadNotificationCount(user1Id);
    assert(remainingUnreadAfter === 0, 'Unread count is exactly 0 after markAllNotificationsAsRead');

    const unreadCheck = await getUserNotifications(user1Id, { unreadOnly: true });
    assert(unreadCheck.notifications.length === 0, 'unreadOnly query returns empty array');
  }

  console.log('\n--- TEST GROUP 7: Strict User Isolation ---');
  {
    // Create 1 notification for User 2
    const u2Notif = await createNotification({
      userId: user2Id,
      type: 'SECURITY_ALERT',
      title: 'User 2 Alert',
      message: 'Private alert for User 2.',
    });
    assert(u2Notif !== null, 'Created notification for User 2');

    // User 1 queries notifications: must NOT see User 2's notification
    const u1List = await getUserNotifications(user1Id);
    const u1HasU2Notif = u1List.notifications.some((n) => n.id === u2Notif?.id);
    assert(u1HasU2Notif === false, 'User 1 cannot view User 2 notifications');

    // User 2 queries notifications: must see ONLY 1 notification
    const u2List = await getUserNotifications(user2Id);
    assert(u2List.total === 1, 'User 2 sees only their own notification (total === 1)');
    assert(u2List.notifications[0].id === u2Notif?.id, 'User 2 sees only their notification ID');

    // User 1 attempts to mark User 2's notification as read: must be blocked
    const hackAttempt = await markNotificationAsRead(user1Id, u2Notif!.id);
    assert(hackAttempt === false, 'User 1 cannot mark User 2 notification as read (isolation enforced)');

    const u2Unread = await getUnreadNotificationCount(user2Id);
    assert(u2Unread === 1, 'User 2 notification remains unread after unauthorized mark attempt');
  }

  console.log('\n--- TEST GROUP 8: Concurrent Idempotent Notification Execution ---');
  {
    const concurrentSourceId = `CONCURRENT-SRC-${runTag}`;
    const promises = Array.from({ length: 6 }).map((_, i) =>
      createNotification({
        userId: user1Id,
        type: 'PHIVO_REWARD',
        title: 'Concurrent Reward Event',
        message: `Reward attempt #${i}`,
        sourceType: 'REWARD_CONCURRENT',
        sourceId: concurrentSourceId,
      })
    );

    const results = await Promise.all(promises);
    const createdResults = results.filter((r) => r !== null);
    assert(createdResults.length === 1, `Exactly 1 concurrent insertion succeeded, ${results.length - 1} de-duplicated`);

    const dbRows = await db.query(
      `SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND source_type = 'REWARD_CONCURRENT' AND source_id = $2`,
      [user1Id, concurrentSourceId]
    );
    assert(parseInt((dbRows.rows[0] as any).count, 10) === 1, 'Database contains exactly 1 row after concurrent blast');
  }

  console.log('\n--- TEST GROUP 9: Deleting Notifications (Single & Bulk) ---');
  {
    // Create notifications for testing deletion
    const delNotif1 = await createNotification({
      userId: user1Id,
      type: 'SECURITY_ALERT',
      title: 'Delete Test 1',
      message: 'To be deleted individually.',
    });
    const delNotif2 = await createNotification({
      userId: user1Id,
      type: 'SECURITY_ALERT',
      title: 'Delete Test 2 (Read)',
      message: 'To be marked read then deleted via bulk readOnly.',
    });
    const delNotif3 = await createNotification({
      userId: user1Id,
      type: 'SECURITY_ALERT',
      title: 'Delete Test 3 (Unread)',
      message: 'To remain unread during bulk readOnly delete.',
    });

    assert(delNotif1 !== null && delNotif2 !== null && delNotif3 !== null, 'Created 3 test notifications for deletion');

    // 9.1 Single delete
    const deleteSuccess = await deleteNotification(user1Id, delNotif1!.id);
    assert(deleteSuccess === true, 'deleteNotification returns true on existing notification');

    // 9.2 Attempt to delete already deleted notification
    const deleteAgain = await deleteNotification(user1Id, delNotif1!.id);
    assert(deleteAgain === false, 'deleteNotification returns false on already deleted notification');

    // 9.3 User isolation: User 1 attempts to delete User 2's notification
    const testU2Notif = await createNotification({
      userId: user2Id,
      type: 'SECURITY_ALERT',
      title: 'User 2 Isolation Test',
      message: 'Cannot be deleted by User 1.',
    });
    assert(testU2Notif !== null, 'Created User 2 notification for delete isolation test');

    const u2DeleteAttempt = await deleteNotification(user1Id, testU2Notif!.id);
    assert(u2DeleteAttempt === false, 'User 1 cannot delete User 2 notification (isolation enforced)');

    const u2DbCheck = await db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM notifications WHERE public_notification_id = $1`,
      [testU2Notif!.id]
    );
    assert(parseInt(u2DbCheck.rows[0].count, 10) === 1, 'User 2 notification remains untouched in database');

    // 9.4 Bulk delete readOnly
    await markNotificationAsRead(user1Id, delNotif2!.id);
    const unreadBeforeBulk = await getUnreadNotificationCount(user1Id);

    const clearedCount = await deleteAllNotifications(user1Id, { readOnly: true });
    assert(clearedCount >= 1, `deleteAllNotifications(readOnly) deleted read notifications (count: ${clearedCount})`);

    const unreadAfterBulk = await getUnreadNotificationCount(user1Id);
    assert(unreadAfterBulk === unreadBeforeBulk, 'deleteAllNotifications(readOnly) preserved unread notifications');

    // 9.5 Bulk delete all for User 1
    const totalDeleted = await deleteAllNotifications(user1Id);
    assert(totalDeleted >= 1, `deleteAllNotifications deleted remaining notifications (count: ${totalDeleted})`);

    const finalUser1Notifs = await getUserNotifications(user1Id);
    assert(finalUser1Notifs.total === 0, 'User 1 has 0 remaining notifications after full cleanup');
  }

  console.log('========================================================');
  console.log(`📊 TASK #20 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTask20Tests().catch((err) => {
  console.error('[Task #20 Test Fatal Error]', err);
  process.exit(1);
});
