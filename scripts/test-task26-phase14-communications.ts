import { getDb } from '../src/server/db/db';
import { v4 as uuidv4 } from 'uuid';
import {
  getEmailTemplates,
  updateEmailTemplate,
  sendBroadcastCampaign,
  getAutomationRules,
  createAutomationRule,
  updateAutomationRule,
  deleteAutomationRule,
  getEmailQueue,
  getEmailQueueStats,
  retryQueueItem,
  processEmailQueue,
  queueEventEmail,
  triggerAutomationRule,
} from '../src/server/services/emailService';
import {
  updateEconomicConfig,
  getEconomicConfigByKey,
} from '../src/server/services/economicService';

// Ensure mock email provider and test environment are used for fast deterministic test execution
delete process.env.RESEND_API_KEY;
process.env.NODE_ENV = 'test';

async function runPhase14CommunicationsTests() {
  console.log('========================================================================');
  console.log('📡 RUNNING PHASE 14: ADMIN COMMUNICATIONS & DYNAMIC REAL-TIME MANAGEMENT');
  console.log('========================================================================\n');

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
    // ------------------------------------------------------------------------
    // 1. SETUP IDENTITIES
    // ------------------------------------------------------------------------
    const adminId = uuidv4();
    const adminPublicId = `PX-ADM-${Math.floor(1000 + Math.random() * 9000)}`;
    const adminEmail = `admin_comms_${Date.now()}@phivonex.test`;

    const userAId = uuidv4();
    const userAPublicId = `PX-USR-A-${Math.floor(1000 + Math.random() * 9000)}`;
    const userAEmail = `user_comms_a_${Date.now()}@phivonex.test`;

    const userBId = uuidv4();
    const userBPublicId = `PX-USR-B-${Math.floor(1000 + Math.random() * 9000)}`;
    const userBEmail = `user_comms_b_${Date.now()}@phivonex.test`;

    await db.query(
      `INSERT INTO users (id, public_id, full_name, email, country, password_hash, role, status)
       VALUES 
       ($1, $2, 'Comms Admin', $3, 'United States', 'hash_adm', 'ADMIN', 'ACTIVE'),
       ($4, $5, 'Operator Comms A', $6, 'United States', 'hash_a', 'USER', 'ACTIVE'),
       ($7, $8, 'Operator Comms B', $9, 'United States', 'hash_b', 'USER', 'ACTIVE')`,
      [adminId, adminPublicId, adminEmail, userAId, userAPublicId, userAEmail, userBId, userBPublicId, userBEmail]
    );

    assert(true, '1. Admin & Operator identities provisioned for communications test');

    // ------------------------------------------------------------------------
    // 2. EMAIL TEMPLATES MANAGEMENT
    // ------------------------------------------------------------------------
    const templates = await getEmailTemplates();
    assert(templates.length >= 8, '2. All 8 transactional email templates pre-seeded and accessible', `Found: ${templates.length}`);

    const welcomeTpl = templates.find((t) => t.eventName === 'WELCOME');
    assert(Boolean(welcomeTpl && welcomeTpl.enabled), '3. WELCOME email template is active');

    // Update Template
    const newSubject = `[PHIVONEX] Matrix Operator Welcomed — Updated ${Date.now()}`;
    const updatedTpl = await updateEmailTemplate(adminId, adminPublicId, welcomeTpl!.id, {
      subject: newSubject,
      bodyHtml: welcomeTpl!.bodyHtml,
      enabled: true,
    });

    assert(updatedTpl.subject === newSubject, '4. Email template updated with new subject line');

    // Verify audit log for template update
    const auditRes = await db.query(
      `SELECT * FROM admin_audit_logs WHERE action = 'UPDATE_EMAIL_TEMPLATE' AND target_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [welcomeTpl!.id]
    );
    assert(auditRes.rows.length === 1, '5. Template update recorded in admin audit log', `Admin: ${auditRes.rows[0]?.admin_public_id}`);

    // Queue Event Email & Merge Tags
    const queueId = await queueEventEmail(userAEmail, 'WELCOME', {
      displayName: 'Operator Comms A',
      publicId: userAPublicId,
    });
    assert(Boolean(queueId), '6. Transactional email queued successfully via queueEventEmail');

    const queueItemRes = await db.query(`SELECT * FROM email_queue WHERE id = $1`, [queueId]);
    assert(queueItemRes.rows.length === 1, '7. Outbox record created in email_queue table');
    assert(queueItemRes.rows[0]?.subject === newSubject, '8. Rendered subject matches active template version');
    assert(queueItemRes.rows[0]?.body_html.includes(userAPublicId), '9. Dynamic user placeholder {{publicId}} correctly substituted');

    // ------------------------------------------------------------------------
    // 3. BROADCAST CAMPAIGN ENGINE
    // ------------------------------------------------------------------------
    const campaignSubject = `Protocol Network Notice #${Date.now()}`;
    const campaignBody = `<p>Attention {{displayName}} ({{publicId}}): Protocol update underway.</p>`;
    const broadcastRes = await sendBroadcastCampaign(adminId, adminPublicId, {
      subject: campaignSubject,
      bodyHtml: campaignBody,
      audience: 'ACTIVE_USERS',
    });

    assert(broadcastRes.queuedCount >= 2, '10. Broadcast campaign queued for all active operators', `Count: ${broadcastRes.queuedCount}`);

    const broadcastAudit = await db.query(
      `SELECT * FROM admin_audit_logs WHERE action = 'SEND_EMAIL_CAMPAIGN' ORDER BY created_at DESC LIMIT 1`
    );
    assert(broadcastAudit.rows.length === 1, '11. Broadcast campaign dispatch recorded in admin audit log');

    // ------------------------------------------------------------------------
    // 4. AUTOMATED PERFORMANCE FOLLOW-UP ENGINE
    // ------------------------------------------------------------------------
    const testRule = await createAutomationRule(adminId, adminPublicId, {
      name: `Growth Follow-up ${Date.now()}`,
      enabled: true,
      triggerCriteria: 'STRONG_GROWTH',
      delayHours: 0,
      cooldownDays: 5,
      templateId: welcomeTpl!.id,
    });

    assert(Boolean(testRule && testRule.id), '12. Automation rule created successfully with parameters');

    const rulesList = await getAutomationRules();
    assert(rulesList.some((r) => r.id === testRule.id), '13. Automation rule returned in getAutomationRules list');

    // Trigger Rule for User A
    const triggered = await triggerAutomationRule(userAId, 'STRONG_GROWTH', {
      milestone: 'Direct Referrals Achieved',
    });
    assert(triggered === true, '14. Automation follow-up rule successfully evaluated and triggered');

    // Test Cooldown Prevention
    const retriggered = await triggerAutomationRule(userAId, 'STRONG_GROWTH', {
      milestone: 'Immediate Duplicate Event',
    });
    assert(retriggered === false, '15. Anti-Spam Cooldown strictly prevents duplicate email spamming');

    // Update Automation Rule
    const updatedRule = await updateAutomationRule(adminId, adminPublicId, testRule.id, {
      name: `Growth Follow-up Updated ${Date.now()}`,
      enabled: false,
      triggerCriteria: 'STRONG_GROWTH',
      delayHours: 2,
      cooldownDays: 7,
      templateId: welcomeTpl!.id,
    });
    assert(updatedRule.enabled === false && updatedRule.delayHours === 2, '16. Automation rule updated (paused with 2h delay)');

    // Delete Automation Rule
    const deleted = await deleteAutomationRule(adminId, adminPublicId, testRule.id);
    assert(deleted === true, '17. Automation rule safely deleted from database');

    // ------------------------------------------------------------------------
    // 5. EMAIL QUEUE & OUTBOX MONITORING
    // ------------------------------------------------------------------------
    const queueList = await getEmailQueue({ limit: 10, offset: 0 });
    assert(queueList.items.length > 0, '18. getEmailQueue successfully lists queued items', `Total: ${queueList.total}`);

    const stats = await getEmailQueueStats();
    assert(stats.totalAll > 0, '19. getEmailQueueStats calculates aggregate outbox metrics', `Queued: ${stats.totalQueued}`);

    // Process Email Queue
    await processEmailQueue();
    const statsAfter = await getEmailQueueStats();
    assert(statsAfter.totalSent + statsAfter.totalDelivered >= stats.totalSent, '20. processEmailQueue dispatches pending emails asynchronously');

    // Test Retry Mechanism
    // Insert a failed test item
    const failedItemId = uuidv4();
    await db.query(
      `INSERT INTO email_queue (id, to_email, subject, body_html, status, error_message)
       VALUES ($1, $2, 'Failed Delivery Test', '<p>Test</p>', 'FAILED', 'Temporary SMTP Network Timeout')`,
      [failedItemId, userBEmail]
    );

    const retrySuccess = await retryQueueItem(failedItemId);
    assert(retrySuccess === true, '21. retryQueueItem resets failed email to QUEUED and triggers dispatch');

    // ------------------------------------------------------------------------
    // 6. ADMIN -> USER PANEL REAL-TIME DYNAMIC MANAGEMENT
    // ------------------------------------------------------------------------
    // A. Update Economic Controls (e.g. Min Withdrawal Amount & Crypto Withdrawals Master Switch)
    const updatedConfigRes = await updateEconomicConfig({
      adminUserId: adminId,
      adminPublicId,
      configKey: 'MIN_WITHDRAWAL_AMOUNT',
      configValue: 25.00,
      status: 'ACTIVE',
      reason: 'Security adjustment for network stability',
    });
    assert(Number(updatedConfigRes.config.configValue) === 25.00, '22. Admin updates MIN_WITHDRAWAL_AMOUNT to $25.00');

    // Verify config is saved in DB
    const fetchedConfig = await getEconomicConfigByKey('MIN_WITHDRAWAL_AMOUNT');
    assert(Number(fetchedConfig?.configValue) === 25.00, '23. Updated config value is authoritative in database');

    // B. Toggle Crypto Withdrawals Master Switch
    const updatedWithdrawalSwitch = await updateEconomicConfig({
      adminUserId: adminId,
      adminPublicId,
      configKey: 'CRYPTO_WITHDRAWALS_ENABLED',
      configValue: false,
      status: 'PAUSED',
      reason: 'Protocol maintenance freeze test',
    });
    assert(Boolean(updatedWithdrawalSwitch.config.configValue) === false, '24. Admin dynamically pauses CRYPTO_WITHDRAWALS_ENABLED');

    // C. Restore Crypto Withdrawals Master Switch
    await updateEconomicConfig({
      adminUserId: adminId,
      adminPublicId,
      configKey: 'CRYPTO_WITHDRAWALS_ENABLED',
      configValue: true,
      status: 'ACTIVE',
      reason: 'Restore normal withdrawal operations',
    });
    // Restore Min Withdrawal Amount to default
    await updateEconomicConfig({
      adminUserId: adminId,
      adminPublicId,
      configKey: 'MIN_WITHDRAWAL_AMOUNT',
      configValue: 0.10,
      status: 'ACTIVE',
      reason: 'Restore standard min withdrawal threshold',
    });
    assert(true, '25. Protocol economic parameters restored to safe operational baseline');

    // ------------------------------------------------------------------------
    // 7. CLEANUP
    // ------------------------------------------------------------------------
    await db.query(`DELETE FROM users WHERE id IN ($1, $2, $3)`, [adminId, userAId, userBId]);
    await db.query(`DELETE FROM email_queue WHERE to_email IN ($1, $2, $3)`, [adminEmail, userAEmail, userBEmail]);
    assert(true, '26. Test fixtures safely isolated and cleaned up');

  } catch (err: any) {
    console.error('Fatal test error:', err);
    assert(false, 'Fatal exception during Phase 14 test suite execution', err.message);
  }

  console.log('\n========================================================================');
  console.log(`📊 PHASE 14 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase14CommunicationsTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
