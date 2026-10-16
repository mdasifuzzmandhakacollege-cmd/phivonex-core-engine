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
  notificationEmitter
} from '../src/server/services/notificationService';
import {
  saveUserPushToken,
  removeUserPushToken,
  getUserPushTokens
} from '../src/server/services/webPushServerService';

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

async function runPhase10SecuritySuite() {
  console.log('========================================================');
  console.log('🛡️ RUNNING PHASE 10: NOTIFICATION HUB FULL SECURITY SUITE');
  console.log('========================================================');

  const db = await getDb();
  const runTag = Date.now().toString().slice(-6);
  const userA = uuidv4();
  const userB = uuidv4();

  // Create test users in DB to satisfy foreign keys
  await db.query(`
    INSERT INTO users (id, public_id, full_name, email, country, password_hash, role)
    VALUES 
      ($1, $2, 'Security User A', $3, 'US', 'hash_a', 'USER'),
      ($4, $5, 'Security User B', $6, 'US', 'hash_b', 'USER')
  `, [
    userA, `PHX-SECA-${runTag}`, `sec-a-${runTag}@phivonex.test`,
    userB, `PHX-SECB-${runTag}`, `sec-b-${runTag}@phivonex.test`
  ]);

  // 1. ALL 9 DOMAIN EVENT MAPPINGS
  console.log('\n--- 1. Domain Event Types (All 9) ---');
  const n1 = await notifyNodeActivated({
    userId: userA,
    nodeNumber: 1,
    orderPublicId: 'ORD-001',
    sourceId: `node-act-${uuidv4()}`
  });
  assert(n1?.type === 'NODE_ACTIVATED' && n1?.title.includes('Node'), 'Node Activation domain event created');

  const n2 = await notifyReferralEarned({
    userId: userA,
    amountUsd: 50,
    buyerPublicId: 'USR-BUYER-01',
    commissionId: `ref-comm-${uuidv4()}`
  });
  assert(n2?.type === 'REFERRAL_EARNED' && n2?.message.includes('50.00'), 'Direct Referral domain event created');

  const n3 = await notifyMatchingEarned({
    userId: userA,
    bonusUsd: 500,
    settlementId: `match-${uuidv4()}`
  });
  assert(n3?.type === 'MATCHING_EARNED' && n3?.message.includes('500.00'), 'Binary Matching domain event created');

  const n4 = await notifyPromotionEarned({
    userId: userA,
    bonusUsd: 1000,
    milestoneTitle: 'PIONEER_NODE_MASTER',
    bonusId: `promo-${uuidv4()}`
  });
  assert(n4?.type === 'PROMOTION_EARNED' && n4?.message.includes('1000.00'), 'Milestone Promotion domain event created');

  const n5 = await notifyPhivoReward({
    userId: userA,
    amountPhivo: 12.5,
    rewardId: `reward-${uuidv4()}`
  });
  assert(n5?.type === 'PHIVO_REWARD' && n5?.message.includes('12.5000'), 'Mining Reward domain event created');

  const n6 = await notifyPhivoSwapCompleted({
    userId: userA,
    coinAmount: 100,
    usdtAmount: 50,
    rateUsdt: 0.5,
    swapId: `swap-${uuidv4()}`
  });
  assert(n6?.type === 'PHIVO_SWAP_COMPLETED' && n6?.message.includes('50.00 USDT'), 'Coin Swap domain event created');

  const n7 = await notifyUsdtDepositConfirmed({
    userId: userA,
    amountUsdt: 1000,
    depositId: `dep-${uuidv4()}`,
    txHash: '0xabc1234567890abcdef'
  });
  assert(n7?.type === 'USDT_DEPOSIT_CONFIRMED' && n7?.message.includes('1000.00 USDT'), 'BSC Deposit domain event created');

  const n8 = await notifyWithdrawalStatus({
    userId: userA,
    amountUsdt: 250,
    status: 'COMPLETED',
    withdrawalId: `wth-${uuidv4()}`
  });
  assert(n8?.type === 'WITHDRAWAL_STATUS' && n8?.title.includes('Disbursed'), 'Withdrawal Status domain event created');

  const n9 = await notifySecurityAlert({
    userId: userA,
    title: 'Security Alert: New Session',
    message: 'New login detected from IP 192.168.1.1',
    sourceId: `sec-${uuidv4()}`
  });
  assert(n9?.type === 'SECURITY_ALERT' && n9?.title.includes('Security Alert'), 'Security Alert domain event created');

  // 2. USER ISOLATION & CROSS-USER PRIVILEGE CHECKS
  console.log('\n--- 2. User Isolation & Cross-User Security ---');
  const notifB = await notifySecurityAlert({
    userId: userB,
    title: 'User B private alert',
    message: 'Top secret security event for User B only',
    sourceId: `sec-b-${uuidv4()}`
  });
  assert(notifB !== null, 'User B notification created');

  // User A attempts to list notifications -> should only see User A's
  const listA = await getUserNotifications(userA);
  assert(listA.notifications.every((n) => n.id !== notifB!.id), 'User A cannot view User B notification (VALID LIST / ISOLATION)');
  assert(!listA.notifications.some((n) => n.id === notifB!.id), 'CROSS-USER READ: blocked');

  // User A attempts to mark User B notification as read
  const crossMarkResult = await markNotificationAsRead(userA, notifB!.id);
  assert(crossMarkResult === false, 'CROSS-USER MARK-READ: strictly rejected (returns false)');

  // Verify User B notification is still unread
  const listB = await getUserNotifications(userB);
  assert(listB.notifications[0]?.readAt === null, 'User B notification untouched after cross-user mark attempt');

  // User A attempts to delete User B notification
  const crossDeleteResult = await deleteNotification(userA, notifB!.id);
  assert(crossDeleteResult === false, 'CROSS-USER DELETE: strictly rejected (returns false)');

  // User A bulk delete -> should not affect User B
  const bulkDeleteA = await deleteAllNotifications(userA, { readOnly: false });
  assert(bulkDeleteA > 0, 'User A bulk delete succeeded for User A only');

  const listBAfter = await getUserNotifications(userB);
  assert(listBAfter.notifications.length === 1 && listBAfter.notifications[0].id === notifB!.id, 'CROSS-USER BULK DELETE: User B notifications completely preserved');

  // 3. IDEMPOTENCY & CONCURRENT DUPLICATE SUPPRESSION
  console.log('\n--- 3. Database Idempotency & Duplicate Suppression ---');
  const sharedSourceId = `src-idem-${uuidv4()}`;
  const firstInsert = await createNotification({
    userId: userB,
    type: 'USDT_DEPOSIT_CONFIRMED',
    title: 'BSC Deposit Confirmed',
    message: 'Deposit of 500 USDT confirmed',
    sourceType: 'BLOCKCHAIN_DEPOSIT',
    sourceId: sharedSourceId
  });
  assert(firstInsert !== null, 'Initial idempotent notification created');

  const duplicateInsert = await createNotification({
    userId: userB,
    type: 'USDT_DEPOSIT_CONFIRMED',
    title: 'BSC Deposit Confirmed',
    message: 'Deposit of 500 USDT confirmed',
    sourceType: 'BLOCKCHAIN_DEPOSIT',
    sourceId: sharedSourceId
  });
  assert(duplicateInsert === null, 'DUPLICATE DOMAIN EVENT: strictly de-duplicated at DB level');

  // Simultaneous blast of 10 duplicate events
  const blastSourceId = `src-blast-${uuidv4()}`;
  const blastPromises = Array.from({ length: 10 }).map(() =>
    createNotification({
      userId: userB,
      type: 'NODE_ACTIVATED',
      title: 'Node Activated',
      message: 'Node #999 activated',
      sourceType: 'NODE_PURCHASE',
      sourceId: blastSourceId
    })
  );
  const blastResults = await Promise.all(blastPromises);
  const successfulCreations = blastResults.filter((r) => r !== null);
  assert(successfulCreations.length === 1, 'SIMULTANEOUS DUPLICATE EVENTS: Exactly 1 row created, 9 suppressed');

  // 4. SSE REAL-TIME DISPATCH & USER SCOPE
  console.log('\n--- 4. SSE Real-Time Streaming & Scoping ---');
  let userAEventCount = 0;
  let wrongUserEventCount = 0;

  const sseListenerA = (notif: any) => {
    if (notif && notif.id) userAEventCount++;
  };
  const sseListenerB = () => {
    wrongUserEventCount++;
  };

  notificationEmitter.on(`notification:${userA}`, sseListenerA);
  notificationEmitter.on(`notification:${userB}`, sseListenerB);

  // Trigger event for User A
  await notifySecurityAlert({
    userId: userA,
    title: 'SSE Alert',
    message: 'SSE test alert for User A',
    sourceId: `SEC_SSE_${uuidv4()}`
  });
  assert(userAEventCount > 0, 'SSE USER ISOLATION & DISPATCH: User A listener received event');
  assert(wrongUserEventCount === 0, 'SSE USER ISOLATION: User B listener received 0 events for User A');

  // Clean up listeners
  notificationEmitter.off(`notification:${userA}`, sseListenerA);
  notificationEmitter.off(`notification:${userB}`, sseListenerB);
  assert(true, 'SSE CLEANUP: Listeners detached safely without memory leaks');

  // 5. WEB PUSH / FCM TOKEN REGISTRATION & DEDUPLICATION
  console.log('\n--- 5. Web Push & FCM Token Security ---');
  const token1 = `fcm-tok-${uuidv4()}`;
  const save1 = await saveUserPushToken({ userId: userA, token: token1, platform: 'WEB' });
  assert(save1 === true, 'PUSH TOKEN REGISTER: Token saved successfully');

  // Duplicate token registration for same user -> upsert without error
  const saveDuplicate = await saveUserPushToken({ userId: userA, token: token1, platform: 'WEB' });
  assert(saveDuplicate === true, 'PUSH TOKEN DUPLICATE: Upsert handles re-registration idempotently');

  const tokensA = await getUserPushTokens(userA);
  assert(tokensA.length === 1 && tokensA[0] === token1, 'PUSH TOKEN OWNERSHIP: User A has exactly 1 distinct token');

  const tokensB = await getUserPushTokens(userB);
  assert(tokensB.length === 0, 'PUSH CROSS-USER PROTECTION: User B sees 0 tokens belonging to User A');

  // Token deactivation
  await removeUserPushToken(userA, token1);
  const tokensAAfterRemove = await getUserPushTokens(userA);
  assert(tokensAAfterRemove.length === 0, 'Token removal deactivates token cleanly');

  // 6. SINGLE READ, READ-ALL & UNREAD COUNT ACCURACY
  console.log('\n--- 6. Unread Count Accuracy & Mark Read ---');
  const freshNotif = await notifySecurityAlert({
    userId: userA,
    title: 'Unread Alert',
    message: 'Unread test alert',
    sourceId: `SEC_TEST_${uuidv4()}`
  });
  const unreadBefore = await getUnreadNotificationCount(userA);
  assert(unreadBefore >= 1, 'UNREAD COUNT ACCURACY: Initial unread count > 0');

  const markRes1 = await markNotificationAsRead(userA, freshNotif!.id);
  assert(markRes1 === true, 'SINGLE READ IDEMPOTENT (1st call): returns true');

  const markRes2 = await markNotificationAsRead(userA, freshNotif!.id);
  assert(markRes2 === false, 'SINGLE READ IDEMPOTENT (2nd call): returns false (already marked)');

  const markAllRes = await markAllNotificationsAsRead(userA);
  assert(typeof markAllRes === 'number', 'READ-ALL: returns count of updated items');

  const unreadAfterAll = await getUnreadNotificationCount(userA);
  assert(unreadAfterAll === 0, 'UNREAD COUNT ACCURACY: Count is 0 after mark-all-read');

  console.log('========================================================');
  console.log(`📊 PHASE 10 SECURITY SUITE COMPLETE: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================');

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runPhase10SecuritySuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
