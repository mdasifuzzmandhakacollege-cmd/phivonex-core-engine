import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/db';
import { logAdminAction } from './adminService';
import { createNotification } from './notificationService';

// Provider Interface
export interface EmailProvider {
  sendEmail(to: string, subject: string, html: string): Promise<{ providerMessageId?: string; error?: string }>;
}

// 1. Mock Email Provider
export class MockEmailProvider implements EmailProvider {
  async sendEmail(to: string, subject: string, html: string): Promise<{ providerMessageId: string }> {
    console.log(`[MockEmailProvider] Sending email to ${to}: "${subject}"`);
    return { providerMessageId: `mock_msg_${uuidv4()}` };
  }
}

// 2. Resend Email Provider
export class ResendEmailProvider implements EmailProvider {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async sendEmail(to: string, subject: string, html: string): Promise<{ providerMessageId?: string; error?: string }> {
    try {
      const defaultDomain = process.env.RESEND_DOMAIN || process.env.CUSTOM_DOMAIN || 'phivonex.online';
      const fromAddress = process.env.RESEND_FROM_EMAIL || process.env.EMAIL_FROM_ADDRESS || `support@${defaultDomain}`;
      const fromName = process.env.EMAIL_FROM_NAME || 'PHIVONEX';
      const from = fromAddress.includes('<') ? fromAddress : `${fromName} <${fromAddress}>`;

      let response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        signal: AbortSignal.timeout(8000),
        body: JSON.stringify({
          from,
          to,
          subject,
          html
        })
      });

      let data: any = await response.json();

      // If custom domain is not verified yet in Resend, automatically fallback to onboarding@resend.dev
      if (!response.ok && (
        response.status === 403 ||
        data?.name === 'validation_error' ||
        data?.message?.toLowerCase().includes('domain') ||
        data?.error?.toLowerCase().includes('domain')
      )) {
        console.warn(`[Resend Provider] Primary domain send from "${from}" failed domain check (${data?.message || data?.error}). Retrying with onboarding@resend.dev sandbox...`);
        const fallbackFrom = `${fromName} <onboarding@resend.dev>`;
        response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`
          },
          signal: AbortSignal.timeout(8000),
          body: JSON.stringify({
            from: fallbackFrom,
            to,
            subject,
            html
          })
        });
        data = await response.json();
        if (response.ok) {
          console.log(`[Resend Provider] Live email delivered via sandbox from ${fallbackFrom} to ${to}, ID: ${data?.id}`);
          return { providerMessageId: data?.id };
        }
      }

      if (!response.ok) {
        console.warn('[Resend Provider] API response error:', data);
        return { error: data?.message || data?.error || 'Resend provider error' };
      }

      console.log(`[Resend Provider] Live email sent successfully to ${to} from ${from}, ID: ${data?.id}`);
      return { providerMessageId: data?.id };
    } catch (err: any) {
      console.warn('[Resend Provider] Network error communicating with Resend:', err);
      return { error: err.message || 'Network error communicating with Resend' };
    }
  }
}

// Instantiate Provider (Uses Resend whenever RESEND_API_KEY is provided and not in test environment)
export function getEmailProvider(): EmailProvider {
  const isTest = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true' || process.env.APP_ENV === 'test';
  const apiKey = process.env.RESEND_API_KEY;
  if (!isTest && apiKey && apiKey.trim() !== '' && !apiKey.includes('your_resend_api_key')) {
    return new ResendEmailProvider(apiKey.trim());
  }
  return new MockEmailProvider();
}

// Types
export interface EmailTemplate {
  id: string;
  eventName: string;
  subject: string;
  bodyHtml: string;
  enabled: boolean;
  createdAt: string;
}

export interface EmailQueueItem {
  id: string;
  toEmail: string;
  subject: string;
  bodyHtml: string;
  status: 'QUEUED' | 'SENT' | 'DELIVERED' | 'FAILED';
  providerMessageId?: string;
  errorMessage?: string;
  sentAt?: string;
  createdAt: string;
}

export interface AutomationRule {
  id: string;
  name: string;
  enabled: boolean;
  triggerCriteria: 'STRONG_GROWTH' | 'MATCHING_ACTIVITY' | 'NODE_SALES' | 'MILESTONE_PROGRESS' | 'INACTIVITY';
  delayHours: number;
  cooldownDays: number;
  templateId: string;
  createdAt: string;
}

// ----------------------------------------------------------------------------
// EMAIL QUEUE & EVENTS ENGINE
// ----------------------------------------------------------------------------

/**
 * Queue a new system event email.
 * Renders template variables automatically.
 */
export async function queueEventEmail(
  toEmail: string,
  eventName: string,
  templateData: Record<string, string>,
  scheduledSendAt?: Date
): Promise<string> {
  const db = await getDb();

  // 1. Fetch template
  const templateRes = await db.query(
    `SELECT * FROM email_templates WHERE event_name = $1 AND enabled = TRUE`,
    [eventName]
  );

  if (templateRes.rows.length === 0) {
    console.warn(`[EmailEngine] Template for event "${eventName}" is disabled or not found. Skipping.`);
    return '';
  }

  const template = templateRes.rows[0];
  let subject = template.subject;
  let bodyHtml = template.body_html;

  // Replace placeholders dynamically
  for (const [key, val] of Object.entries(templateData)) {
    const regex = new RegExp(`{{${key}}}`, 'g');
    subject = subject.replace(regex, val);
    bodyHtml = bodyHtml.replace(regex, val);
  }

  const queueId = uuidv4();
  await db.query(
    `
    INSERT INTO email_queue (id, to_email, subject, body_html, status, scheduled_send_at)
    VALUES ($1, $2, $3, $4, 'QUEUED', $5)
    `,
    [queueId, toEmail, subject, bodyHtml, scheduledSendAt || null]
  );

  // Trigger non-blocking async execution
  processEmailQueue().catch(err => {
    console.error('[EmailEngine] Immediate processEmailQueue error:', err);
  });

  return queueId;
}

/**
 * Process all pending emails in the queue
 */
export async function processEmailQueue(): Promise<void> {
  const db = await getDb();

  // Find all queued messages that are scheduled for now or earlier (or not scheduled)
  const res = await db.query(
    `SELECT * FROM email_queue 
     WHERE status = 'QUEUED' AND (scheduled_send_at IS NULL OR scheduled_send_at <= CURRENT_TIMESTAMP) 
     ORDER BY created_at ASC`
  );

  if (res.rows.length === 0) {
    return;
  }

  const provider = getEmailProvider();

  for (const row of res.rows) {
    try {
      const sendRes = await provider.sendEmail(row.to_email, row.subject, row.body_html);
      
      if (sendRes.error) {
        await db.query(
          `
          UPDATE email_queue
          SET status = 'FAILED', error_message = $1, sent_at = CURRENT_TIMESTAMP
          WHERE id = $2
          `,
          [sendRes.error, row.id]
        );
      } else {
        await db.query(
          `
          UPDATE email_queue
          SET status = 'SENT', provider_message_id = $1, sent_at = CURRENT_TIMESTAMP
          WHERE id = $2
          `,
          [sendRes.providerMessageId || null, row.id]
        );
      }
    } catch (err: any) {
      await db.query(
        `
        UPDATE email_queue
        SET status = 'FAILED', error_message = $1, sent_at = CURRENT_TIMESTAMP
        WHERE id = $2
        `,
        [err.message || 'Unknown processing error', row.id]
      );
    }
  }
}

// ----------------------------------------------------------------------------
// AUTOMATED PERFORMANCE FOLLOW-UP ENGINE
// ----------------------------------------------------------------------------

/**
 * Trigger an automation rule check for a user.
 * Enforces delay and cooldown limits.
 */
export async function triggerAutomationRule(
  userId: string,
  criteria: 'STRONG_GROWTH' | 'MATCHING_ACTIVITY' | 'NODE_SALES' | 'MILESTONE_PROGRESS' | 'INACTIVITY',
  templateData: Record<string, string>
): Promise<boolean> {
  const db = await getDb();

  // 1. Fetch active rules for this criteria
  const rulesRes = await db.query(
    `SELECT * FROM automation_rules WHERE trigger_criteria = $1 AND enabled = TRUE`,
    [criteria]
  );

  if (rulesRes.rows.length === 0) {
    return false;
  }

  // Fetch user info
  const userRes = await db.query(`SELECT email, public_id, full_name FROM users WHERE id = $1`, [userId]);
  if (userRes.rows.length === 0) {
    return false;
  }
  const user = userRes.rows[0];

  let triggeredAny = false;

  for (const rule of rulesRes.rows) {
    // 2. Cooldown check
    const cooldownRes = await db.query(
      `SELECT last_triggered_at FROM automation_cooldowns WHERE user_id = $1 AND rule_id = $2`,
      [userId, rule.id]
    );

    if (cooldownRes.rows.length > 0) {
      const lastTriggered = new Date(cooldownRes.rows[0].last_triggered_at);
      const cooldownMs = rule.cooldown_days * 24 * 60 * 60 * 1000;
      if (Date.now() - lastTriggered.getTime() < cooldownMs) {
        console.log(`[AutomationEngine] Cooldown active for user ${userId} on rule ${rule.id}. Skipping.`);
        continue;
      }
    }

    // 3. Trigger & Queue email
    const templateRes = await db.query(`SELECT event_name FROM email_templates WHERE id = $1`, [rule.template_id]);
    if (templateRes.rows.length === 0) {
      continue;
    }

    const eventName = templateRes.rows[0].event_name;
    const mergedData = {
      displayName: user.full_name,
      publicId: user.public_id,
      ...templateData
    };

    // Calculate delay hour offset
    const scheduledSendAt = rule.delay_hours > 0 
      ? new Date(Date.now() + rule.delay_hours * 60 * 60 * 1000)
      : undefined;

    await queueEventEmail(user.email, eventName, mergedData, scheduledSendAt);

    // 4. Update Cooldown record
    await db.query(
      `
      INSERT INTO automation_cooldowns (id, user_id, rule_id, last_triggered_at)
      VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
      ON CONFLICT (user_id, rule_id) 
      DO UPDATE SET last_triggered_at = CURRENT_TIMESTAMP
      `,
      [uuidv4(), userId, rule.id]
    );

    triggeredAny = true;
  }

  return triggeredAny;
}

// ----------------------------------------------------------------------------
// TEMPLATES CRUD & BROADCAST CAMPAIGNS
// ----------------------------------------------------------------------------

export async function getEmailTemplates(): Promise<EmailTemplate[]> {
  const db = await getDb();
  const res = await db.query(`SELECT * FROM email_templates ORDER BY event_name ASC`);
  return res.rows.map(r => ({
    id: r.id,
    eventName: r.event_name,
    subject: r.subject,
    bodyHtml: r.body_html,
    enabled: r.enabled,
    createdAt: r.created_at
  }));
}

export async function updateEmailTemplate(
  adminUserId: string,
  adminPublicId: string,
  id: string,
  template: { subject: string; bodyHtml: string; enabled: boolean }
): Promise<EmailTemplate> {
  const db = await getDb();

  const oldRes = await db.query(`SELECT * FROM email_templates WHERE id = $1`, [id]);
  if (oldRes.rows.length === 0) {
    throw new Error('Template not found');
  }

  await db.query(
    `
    UPDATE email_templates
    SET subject = $1, body_html = $2, enabled = $3
    WHERE id = $4
    `,
    [template.subject, template.bodyHtml, template.enabled, id]
  );

  const updated: EmailTemplate = {
    id,
    eventName: oldRes.rows[0].event_name,
    subject: template.subject,
    bodyHtml: template.bodyHtml,
    enabled: template.enabled,
    createdAt: oldRes.rows[0].created_at
  };

  await logAdminAction({
    adminUserId,
    adminPublicId,
    action: 'UPDATE_EMAIL_TEMPLATE',
    targetType: 'email_templates',
    targetId: id,
    details: `Updated email template for event "${updated.eventName}"`
  });

  return updated;
}

export async function sendBroadcastCampaign(
  adminUserId: string,
  adminPublicId: string,
  campaign: {
    subject: string;
    bodyHtml: string;
    audience: 'ALL' | 'ACTIVE_USERS' | 'NODE_HOLDERS';
  }
): Promise<{ queuedCount: number }> {
  const db = await getDb();

  let userQuery = `SELECT id, email, full_name, public_id FROM users WHERE status = 'ACTIVE'`;
  if (campaign.audience === 'ACTIVE_USERS') {
    userQuery = `SELECT id, email, full_name, public_id FROM users WHERE status = 'ACTIVE'`;
  } else if (campaign.audience === 'NODE_HOLDERS') {
    userQuery = `
      SELECT DISTINCT u.id, u.email, u.full_name, u.public_id 
      FROM users u
      INNER JOIN node_orders o ON u.id = o.user_id
      WHERE o.status = 'COMPLETED'
    `;
  }

  const usersRes = await db.query<any>(userQuery);
  let queuedCount = 0;

  for (const user of usersRes.rows) {
    let subject = campaign.subject;
    let bodyHtml = campaign.bodyHtml;

    // Render basic user context variables
    subject = subject.replace(/{{displayName}}/g, user.full_name).replace(/{{publicId}}/g, user.public_id);
    bodyHtml = bodyHtml.replace(/{{displayName}}/g, user.full_name).replace(/{{publicId}}/g, user.public_id);

    const queueId = uuidv4();
    await db.query(
      `
      INSERT INTO email_queue (id, to_email, subject, body_html, status)
      VALUES ($1, $2, $3, $4, 'QUEUED')
      `,
      [queueId, user.email, subject, bodyHtml]
    );

    // Deliver in-app notification to targeted user with strict idempotency
    if (user.id) {
      createNotification({
        userId: user.id,
        type: 'SECURITY_ALERT',
        title: subject,
        message: subject,
        sourceType: 'BROADCAST_CAMPAIGN',
        sourceId: `camp-${campaign.subject.slice(0, 30)}-${user.id}`,
      }).catch((notifErr) => {
        console.warn('[EmailEngine] In-app notification delivery warning:', notifErr?.message);
      });
    }

    queuedCount++;
  }

  // Trigger immediate async processing
  processEmailQueue().catch(err => {
    console.error('[EmailEngine] Campaign queue processing error:', err);
  });

  await logAdminAction({
    adminUserId,
    adminPublicId,
    action: 'SEND_EMAIL_CAMPAIGN',
    targetType: 'email_queue',
    targetId: 'broadcast_campaign',
    details: `Broadcast campaign "${campaign.subject}" sent to ${queuedCount} users of audience: "${campaign.audience}"`
  });

  return { queuedCount };
}

// ----------------------------------------------------------------------------
// EMAIL QUEUE QUERIES & RETRY OPERATIONS
// ----------------------------------------------------------------------------

export interface EmailQueueFilters {
  status?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export async function getEmailQueue(filters: EmailQueueFilters = {}): Promise<{ items: EmailQueueItem[]; total: number }> {
  const db = await getDb();
  const limit = Math.min(Math.max(Number(filters.limit) || 20, 1), 100);
  const offset = Math.max(Number(filters.offset) || 0, 0);

  const conditions: string[] = [];
  const params: any[] = [];
  let paramIdx = 1;

  if (filters.status && filters.status !== 'ALL') {
    conditions.push(`status = $${paramIdx++}`);
    params.push(filters.status.toUpperCase());
  }

  if (filters.search && filters.search.trim()) {
    conditions.push(`(to_email ILIKE $${paramIdx} OR subject ILIKE $${paramIdx})`);
    params.push(`%${filters.search.trim()}%`);
    paramIdx++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countRes = await db.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM email_queue ${whereClause}`,
    params
  );
  const total = parseInt(countRes.rows[0]?.count || '0', 10);

  const queryParams = [...params, limit, offset];
  const itemsRes = await db.query(
    `SELECT * FROM email_queue ${whereClause} ORDER BY created_at DESC LIMIT $${paramIdx++} OFFSET $${paramIdx}`,
    queryParams
  );

  return {
    items: itemsRes.rows.map((r: any) => ({
      id: r.id,
      toEmail: r.to_email,
      subject: r.subject,
      bodyHtml: r.body_html,
      status: r.status,
      providerMessageId: r.provider_message_id,
      errorMessage: r.error_message,
      sentAt: r.sent_at,
      createdAt: r.created_at,
    })),
    total,
  };
}

export async function getEmailQueueStats(): Promise<{
  totalQueued: number;
  totalSent: number;
  totalDelivered: number;
  totalFailed: number;
  totalAll: number;
}> {
  const db = await getDb();
  const res = await db.query(`
    SELECT
      COUNT(CASE WHEN status = 'QUEUED' THEN 1 END) as queued,
      COUNT(CASE WHEN status = 'SENT' THEN 1 END) as sent,
      COUNT(CASE WHEN status = 'DELIVERED' THEN 1 END) as delivered,
      COUNT(CASE WHEN status = 'FAILED' THEN 1 END) as failed,
      COUNT(*) as total
    FROM email_queue
  `);

  const row = res.rows[0] || {};
  return {
    totalQueued: parseInt(row.queued || '0', 10),
    totalSent: parseInt(row.sent || '0', 10),
    totalDelivered: parseInt(row.delivered || '0', 10),
    totalFailed: parseInt(row.failed || '0', 10),
    totalAll: parseInt(row.total || '0', 10),
  };
}

export async function retryQueueItem(id: string): Promise<boolean> {
  const db = await getDb();
  const res = await db.query(
    `UPDATE email_queue SET status = 'QUEUED', error_message = NULL, sent_at = NULL WHERE id = $1 RETURNING id`,
    [id]
  );
  if (res.rowCount > 0) {
    processEmailQueue().catch(err => console.error('[EmailService] Retry process error:', err));
    return true;
  }
  return false;
}

// ----------------------------------------------------------------------------
// AUTOMATION RULES CRUD
// ----------------------------------------------------------------------------

export async function getAutomationRules(): Promise<AutomationRule[]> {
  const db = await getDb();
  const res = await db.query(`SELECT * FROM automation_rules ORDER BY created_at DESC`);
  return res.rows.map(r => ({
    id: r.id,
    name: r.name,
    enabled: r.enabled,
    triggerCriteria: r.trigger_criteria,
    delayHours: r.delay_hours,
    cooldownDays: r.cooldown_days,
    templateId: r.template_id,
    createdAt: r.created_at
  }));
}

export async function createAutomationRule(
  adminUserId: string,
  adminPublicId: string,
  rule: Omit<AutomationRule, 'id' | 'createdAt'>
): Promise<AutomationRule> {
  const db = await getDb();
  const id = uuidv4();

  await db.query(
    `
    INSERT INTO automation_rules (id, name, enabled, trigger_criteria, delay_hours, cooldown_days, template_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
    [id, rule.name, rule.enabled, rule.triggerCriteria, rule.delayHours, rule.cooldownDays, rule.templateId]
  );

  const created: AutomationRule = {
    id,
    ...rule,
    createdAt: new Date().toISOString()
  };

  await logAdminAction({
    adminUserId,
    adminPublicId,
    action: 'CREATE_AUTOMATION_RULE',
    targetType: 'automation_rules',
    targetId: id,
    details: `Created automation rule: "${rule.name}"`
  });

  return created;
}

export async function updateAutomationRule(
  adminUserId: string,
  adminPublicId: string,
  id: string,
  rule: Omit<AutomationRule, 'id' | 'createdAt'>
): Promise<AutomationRule> {
  const db = await getDb();

  const oldRes = await db.query(`SELECT * FROM automation_rules WHERE id = $1`, [id]);
  if (oldRes.rows.length === 0) {
    throw new Error('Rule not found');
  }

  await db.query(
    `
    UPDATE automation_rules
    SET name = $1, enabled = $2, trigger_criteria = $3, delay_hours = $4, cooldown_days = $5, template_id = $6
    WHERE id = $7
    `,
    [rule.name, rule.enabled, rule.triggerCriteria, rule.delayHours, rule.cooldownDays, rule.templateId, id]
  );

  const updated: AutomationRule = {
    id,
    ...rule,
    createdAt: oldRes.rows[0].created_at
  };

  await logAdminAction({
    adminUserId,
    adminPublicId,
    action: 'UPDATE_AUTOMATION_RULE',
    targetType: 'automation_rules',
    targetId: id,
    details: `Updated automation rule: "${rule.name}"`
  });

  return updated;
}

export async function deleteAutomationRule(
  adminUserId: string,
  adminPublicId: string,
  id: string
): Promise<boolean> {
  const db = await getDb();

  const oldRes = await db.query(`SELECT name FROM automation_rules WHERE id = $1`, [id]);
  if (oldRes.rows.length === 0) {
    return false;
  }

  await db.query(`DELETE FROM automation_rules WHERE id = $1`, [id]);

  await logAdminAction({
    adminUserId,
    adminPublicId,
    action: 'DELETE_AUTOMATION_RULE',
    targetType: 'automation_rules',
    targetId: id,
    details: `Deleted automation rule: "${oldRes.rows[0].name}"`
  });

  return true;
}

// ----------------------------------------------------------------------------
// PROVIDER WEBHOOK
// ----------------------------------------------------------------------------

/**
 * Handle incoming provider events (bounces, deliveries, failures)
 */
export async function handleProviderEmailWebhook(
  providerMessageId: string,
  status: 'delivered' | 'bounced' | 'failed',
  errorReason?: string
): Promise<boolean> {
  const db = await getDb();

  const mappedStatus = 
    status === 'delivered' ? 'DELIVERED' :
    status === 'bounced' ? 'FAILED' : 'FAILED';

  const res = await db.query(
    `
    UPDATE email_queue
    SET status = $1, error_message = $2
    WHERE provider_message_id = $3
    `,
    [mappedStatus, errorReason || (status === 'bounced' ? 'Email Bounced' : null), providerMessageId]
  );

  return res.rowCount > 0;
}

/**
 * Sends a premium PHIVONEX HTML email containing a 6-digit registration verification code.
 */
export async function sendVerificationCodeEmail(toEmail: string, code: string): Promise<boolean> {
  const provider = getEmailProvider();
  const subject = 'Verify your PHIVONEX account';
  const html = `
    <div style="background-color: #05070c; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f8fafc; padding: 40px 15px; margin: 0; width: 100%;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 620px; margin: 0 auto; background-color: #0b1329; border: 1px solid #1e293b; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 50px rgba(0, 207, 255, 0.08);">
        <tr>
          <td style="background: linear-gradient(135deg, #0f172a 0%, #070d1e 100%); padding: 32px 30px; border-bottom: 1px solid rgba(0, 207, 255, 0.2); text-align: center;">
            <div style="font-size: 26px; font-weight: 900; letter-spacing: 4px; color: #ffffff; font-family: monospace;">PHIVONEX</div>
            <div style="font-size: 10px; font-weight: 700; letter-spacing: 2px; color: #00CFFF; margin-top: 6px; text-transform: uppercase;">DECENTRALIZED AUTONOMOUS NODE INFRASTRUCTURE</div>
          </td>
        </tr>
        <tr>
          <td style="padding: 35px 30px; text-align: center;">
            <div style="display: inline-block; padding: 6px 14px; background: rgba(0, 207, 255, 0.12); border: 1px solid rgba(0, 207, 255, 0.3); border-radius: 20px; font-size: 11px; font-weight: 700; color: #00CFFF; font-family: monospace; text-transform: uppercase; margin-bottom: 20px;">
              ACCOUNT AUTHENTICATION
            </div>
            <h1 style="font-size: 22px; font-weight: 800; color: #ffffff; margin: 0 0 14px 0; line-height: 1.3;">Verify Your Email Address</h1>
            <p style="font-size: 14px; color: #94a3b8; line-height: 1.6; max-width: 480px; margin: 0 auto 25px auto;">
              Welcome to PHIVONEX. Use the 6-digit cryptographic verification code below to complete your secure account registration. This code expires in 10 minutes.
            </p>
            <div style="background: rgba(0, 207, 255, 0.08); border: 1px solid rgba(0, 207, 255, 0.3); border-radius: 12px; padding: 18px 30px; display: inline-block; font-size: 36px; font-weight: 900; letter-spacing: 8px; color: #00CFFF; font-family: monospace; margin-bottom: 30px; box-shadow: 0 0 25px rgba(0, 207, 255, 0.2);">
              ${code}
            </div>
            <div style="border-top: 1px solid rgba(255,255,255,0.06); padding-top: 20px; max-width: 480px; margin: 0 auto; text-align: left; font-size: 11px; color: #64748b; line-height: 1.5;">
              <p style="margin-bottom: 6px;"><strong>Security Note:</strong> Never share this verification code with anyone. PHIVONEX administrators will never request your OTP.</p>
              <p style="margin: 0;">If you did not initiate this request, please ignore this transmission.</p>
            </div>
          </td>
        </tr>
        <tr>
          <td style="background-color: #070c1a; padding: 20px 30px; border-top: 1px solid rgba(255, 255, 255, 0.06); font-size: 11px; color: #475569; line-height: 1.5; text-align: center;">
            <p style="margin: 0 0 4px 0; font-family: monospace; color: #64748b;">PHIVONEX Security Matrix • 256-Bit Cryptographic Authorization</p>
            <p style="margin: 0;">Automated Authentication Transmission.</p>
          </td>
        </tr>
      </table>
    </div>
  `;
  const result = await provider.sendEmail(toEmail, subject, html);
  if (result.error) {
    console.warn(`[EmailService] Failed to send verification email to ${toEmail}:`, result.error);
  } else {
    console.log(`[EmailService] Verification code email sent to ${toEmail}`);
  }
  return !result.error;
}

/**
 * Sends a premium PHIVONEX HTML email containing a 6-digit password reset verification code.
 */
export async function sendPasswordResetOtpEmail(toEmail: string, code: string): Promise<boolean> {
  const provider = getEmailProvider();
  const subject = `PHIVONEX Password Reset Code: ${code}`;
  const html = `
    <div style="background-color: #05070c; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f8fafc; padding: 40px 15px; margin: 0; width: 100%;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 620px; margin: 0 auto; background-color: #0b1329; border: 1px solid #1e293b; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 50px rgba(0, 207, 255, 0.08);">
        <tr>
          <td style="background: linear-gradient(135deg, #0f172a 0%, #070d1e 100%); padding: 32px 30px; border-bottom: 1px solid rgba(0, 207, 255, 0.2); text-align: center;">
            <div style="font-size: 26px; font-weight: 900; letter-spacing: 4px; color: #ffffff; font-family: monospace;">PHIVONEX</div>
            <div style="font-size: 10px; font-weight: 700; letter-spacing: 2px; color: #00CFFF; margin-top: 6px; text-transform: uppercase;">SECURITY PROTOCOL &amp; ACCOUNT RECOVERY</div>
          </td>
        </tr>
        <tr>
          <td style="padding: 35px 30px; text-align: center;">
            <div style="display: inline-block; padding: 6px 14px; background: rgba(240, 68, 56, 0.12); border: 1px solid rgba(240, 68, 56, 0.3); border-radius: 20px; font-size: 11px; font-weight: 700; color: #F04438; font-family: monospace; text-transform: uppercase; margin-bottom: 20px;">
              PASSWORD RESET AUTHORIZATION
            </div>
            <h1 style="font-size: 22px; font-weight: 800; color: #ffffff; margin: 0 0 14px 0; line-height: 1.3;">Reset Your Password</h1>
            <p style="font-size: 14px; color: #94a3b8; line-height: 1.6; max-width: 480px; margin: 0 auto 25px auto;">
              A password reset request was initiated for your PHIVONEX account. Use the 6-digit verification code below to authorize and complete your password change. This code expires in 15 minutes.
            </p>
            <div style="background: rgba(0, 207, 255, 0.08); border: 1px solid rgba(0, 207, 255, 0.3); border-radius: 12px; padding: 18px 30px; display: inline-block; font-size: 36px; font-weight: 900; letter-spacing: 8px; color: #00CFFF; font-family: monospace; margin-bottom: 30px; box-shadow: 0 0 25px rgba(0, 207, 255, 0.2);">
              ${code}
            </div>
            <div style="border-top: 1px solid rgba(255,255,255,0.06); padding-top: 20px; max-width: 480px; margin: 0 auto; text-align: left; font-size: 11px; color: #64748b; line-height: 1.5;">
              <p style="margin-bottom: 6px;"><strong>Critical Security Notice:</strong> If you did not initiate this password recovery request, your account may be under reconnaissance. Please contact support immediately.</p>
              <p style="margin: 0;">Never disclose this code to anyone under any circumstance.</p>
            </div>
          </td>
        </tr>
        <tr>
          <td style="background-color: #070c1a; padding: 20px 30px; border-top: 1px solid rgba(255, 255, 255, 0.06); font-size: 11px; color: #475569; line-height: 1.5; text-align: center;">
            <p style="margin: 0 0 4px 0; font-family: monospace; color: #64748b;">PHIVONEX Security Matrix • Single-Use Cryptographic Challenge</p>
            <p style="margin: 0;">Automated Security Dispatch.</p>
          </td>
        </tr>
      </table>
    </div>
  `;
  const result = await provider.sendEmail(toEmail, subject, html);
  if (result.error) {
    console.warn(`[EmailService] Failed to send password reset email to ${toEmail}:`, result.error);
  } else {
    console.log(`[EmailService] Password reset OTP sent to ${toEmail}`);
  }
  return !result.error;
}

/**
 * Sends a premium PHIVONEX HTML email containing a 6-digit withdrawal verification code.
 */
export async function sendWithdrawalOtpEmail(
  toEmail: string,
  code: string,
  details: {
    amount: number;
    asset: string;
    destinationAddress: string;
  }
): Promise<boolean> {
  const provider = getEmailProvider();
  const subject = `PHIVONEX Withdrawal Authorization Code: ${code} (${details.amount} ${details.asset})`;
  const html = `
    <div style="background-color: #05070c; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f8fafc; padding: 40px 15px; margin: 0; width: 100%;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 620px; margin: 0 auto; background-color: #0b1329; border: 1px solid #1e293b; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 50px rgba(0, 207, 255, 0.08);">
        <tr>
          <td style="background: linear-gradient(135deg, #0f172a 0%, #070d1e 100%); padding: 32px 30px; border-bottom: 1px solid rgba(0, 207, 255, 0.2); text-align: center;">
            <div style="font-size: 26px; font-weight: 900; letter-spacing: 4px; color: #ffffff; font-family: monospace;">PHIVONEX</div>
            <div style="font-size: 10px; font-weight: 700; letter-spacing: 2px; color: #00CFFF; margin-top: 6px; text-transform: uppercase;">FINANCIAL SECURITY &amp; ASSET DISBURSEMENT</div>
          </td>
        </tr>
        <tr>
          <td style="padding: 35px 30px; text-align: center;">
            <div style="display: inline-block; padding: 6px 14px; background: rgba(50, 213, 131, 0.12); border: 1px solid rgba(50, 213, 131, 0.3); border-radius: 20px; font-size: 11px; font-weight: 700; color: #32D583; font-family: monospace; text-transform: uppercase; margin-bottom: 20px;">
              WITHDRAWAL AUTHORIZATION REQUIRED
            </div>
            <h1 style="font-size: 22px; font-weight: 800; color: #ffffff; margin: 0 0 14px 0; line-height: 1.3;">Authorize Fund Withdrawal</h1>
            <p style="font-size: 14px; color: #94a3b8; line-height: 1.6; max-width: 480px; margin: 0 auto 20px auto;">
              A withdrawal request has been initiated from your PHIVONEX available balance. Use the 6-digit one-time authorization code below to confirm execution.
            </p>

            <!-- Withdrawal Details Summary Table -->
            <div style="background: #070e20; border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px; padding: 16px 20px; max-width: 480px; margin: 0 auto 24px auto; text-align: left;">
              <table width="100%" cellspacing="0" cellpadding="6" style="font-size: 13px;">
                <tr>
                  <td style="color: #64748b; font-weight: 500;">Withdrawal Amount:</td>
                  <td style="color: #ffffff; font-weight: 700; text-align: right;">${details.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} ${details.asset}</td>
                </tr>
                <tr>
                  <td style="color: #64748b; font-weight: 500;">Network / Asset:</td>
                  <td style="color: #00CFFF; font-weight: 600; text-align: right; font-family: monospace;">${details.asset}</td>
                </tr>
                <tr>
                  <td style="color: #64748b; font-weight: 500;">Destination Address:</td>
                  <td style="color: #94a3b8; text-align: right; font-family: monospace; word-break: break-all; font-size: 11px;">${details.destinationAddress}</td>
                </tr>
                <tr>
                  <td style="color: #64748b; font-weight: 500;">Code Validity:</td>
                  <td style="color: #f59e0b; font-weight: 600; text-align: right;">10 Minutes</td>
                </tr>
              </table>
            </div>

            <div style="background: rgba(0, 207, 255, 0.08); border: 1px solid rgba(0, 207, 255, 0.3); border-radius: 12px; padding: 18px 30px; display: inline-block; font-size: 36px; font-weight: 900; letter-spacing: 8px; color: #00CFFF; font-family: monospace; margin-bottom: 25px; box-shadow: 0 0 25px rgba(0, 207, 255, 0.2);">
              ${code}
            </div>

            <div style="border-top: 1px solid rgba(255,255,255,0.06); padding-top: 20px; max-width: 480px; margin: 0 auto; text-align: left; font-size: 11px; color: #64748b; line-height: 1.5;">
              <p style="margin-bottom: 6px;"><strong>Security Warning:</strong> Submitting this code will commit your withdrawal. If you did not initiate this request, change your password immediately and notify security.</p>
              <p style="margin: 0;">Never share this authorization code with anyone.</p>
            </div>
          </td>
        </tr>
        <tr>
          <td style="background-color: #070c1a; padding: 20px 30px; border-top: 1px solid rgba(255, 255, 255, 0.06); font-size: 11px; color: #475569; line-height: 1.5; text-align: center;">
            <p style="margin: 0 0 4px 0; font-family: monospace; color: #64748b;">PHIVONEX Financial Cryptographic Authorization Matrix</p>
            <p style="margin: 0;">Automated Transmission • Do Not Reply</p>
          </td>
        </tr>
      </table>
    </div>
  `;
  const result = await provider.sendEmail(toEmail, subject, html);
  if (result.error) {
    console.warn(`[EmailService] Failed to send withdrawal OTP email to ${toEmail}:`, result.error);
  } else {
    console.log(`[EmailService] Withdrawal OTP email sent to ${toEmail}`);
  }
  return !result.error;
}

export async function sendP2pTransferOtpEmail(
  toEmail: string,
  code: string,
  details: {
    amount: string;
    asset: 'USDT' | 'PHIVO';
    recipientDisplay: string;
    recipientCode: string;
  }
): Promise<boolean> {
  const provider = getEmailProvider();
  const safeAsset = escapeEmailHtml(details.asset);
  const safeAmount = escapeEmailHtml(details.amount);
  const safeRecipient = escapeEmailHtml(details.recipientDisplay);
  const safeRecipientCode = escapeEmailHtml(details.recipientCode);
  const safeCode = escapeEmailHtml(code);

  const subject = `PHIVONEX Security Verification: P2P ${details.asset} Transfer Authorization`;
  const html = `
    <div style="background-color: #050807; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f8fafc; padding: 36px 14px; margin: 0; width: 100%;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 600px; margin: 0 auto; background-color: #0E1513; border: 1px solid rgba(245, 184, 0, 0.28); border-radius: 18px; overflow: hidden; box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55);">
        <tr>
          <td style="background: linear-gradient(135deg, #0B1210 0%, #050807 100%); padding: 28px; border-bottom: 1px solid rgba(245, 184, 0, 0.22); text-align: center;">
            <div style="font-size: 26px; font-weight: 900; letter-spacing: 5px; color: #F5B800; font-family: 'JetBrains Mono', monospace;">PHIVONEX</div>
            <div style="font-size: 10px; font-weight: 700; letter-spacing: 2.2px; color: #00E5FF; margin-top: 6px; text-transform: uppercase;">P2P INTERNAL TRANSFER AUTHORIZATION</div>
          </td>
        </tr>
        <tr>
          <td style="padding: 32px 28px; text-align: center;">
            <h1 style="font-size: 21px; font-weight: 800; color: #ffffff; margin: 0 0 12px 0;">Authorize Your P2P Transfer</h1>
            <p style="font-size: 13px; color: #cbd5e1; line-height: 1.6; max-width: 460px; margin: 0 auto 22px auto;">
              Enter the 6-digit security verification code below to confirm your instant member-to-member transfer.
            </p>
            <div style="background: #050807; border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 14px; padding: 14px 20px; margin-bottom: 24px; text-align: left;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size: 12px;">
                <tr>
                  <td style="padding: 7px 0; color: #94a3b8;">Transfer Amount</td>
                  <td style="padding: 7px 0; color: #F5B800; font-weight: 700; text-align: right; font-family: monospace;">${safeAmount} ${safeAsset}</td>
                </tr>
                <tr>
                  <td style="padding: 7px 0; color: #94a3b8;">Recipient</td>
                  <td style="padding: 7px 0; color: #f8fafc; font-weight: 700; text-align: right;">${safeRecipient} (${safeRecipientCode})</td>
                </tr>
                <tr>
                  <td style="padding: 7px 0; color: #94a3b8;">Code Expiration</td>
                  <td style="padding: 7px 0; color: #00E5FF; font-weight: 700; text-align: right;">10 Minutes</td>
                </tr>
              </table>
            </div>
            <div style="background: rgba(0, 229, 255, 0.08); border: 1px solid rgba(0, 229, 255, 0.35); border-radius: 14px; padding: 16px 32px; display: inline-block; font-size: 34px; font-weight: 900; letter-spacing: 8px; color: #00E5FF; font-family: 'JetBrains Mono', monospace; margin-bottom: 22px;">
              ${safeCode}
            </div>
            <p style="font-size: 11px; color: #64748b; line-height: 1.6; max-width: 460px; margin: 0 auto;">
              Never share this one-time code with anyone. If you did not initiate this P2P transfer, change your password immediately and contact PHIVONEX Support.
            </p>
          </td>
        </tr>
      </table>
    </div>
  `;
  const result = await provider.sendEmail(toEmail, subject, html);
  if (result.error) {
    console.warn(`[EmailService] Failed to send P2P OTP email to ${toEmail}:`, result.error);
  } else {
    console.log(`[EmailService] P2P transfer OTP email sent to ${toEmail}`);
  }
  return !result.error;
}

export type TransactionalEmailEventType =
  | 'QUANTUM_ALPHA_ALLOCATED'
  | 'QUANTUM_ALPHA_REDEEMED'
  | 'GENESIS_NODE_MINTED'
  | 'CHRONO_VAULT_SUBSCRIBED'
  | 'DEPOSIT_CONFIRMED'
  | 'WITHDRAWAL_SUBMITTED'
  | 'WITHDRAWAL_SETTLED'
  | 'P2P_TRANSFER_SENT'
  | 'P2P_TRANSFER_RECEIVED';

export type EmailDeliveryLogStatus = 'SENT' | 'QUEUED_NO_SMTP' | 'FAILED';

export interface SendTransactionEmailParams {
  userId?: string | null;
  recipientEmail?: string;
  recipientName?: string;
  eventType: TransactionalEmailEventType;
  metadata?: Record<string, any>;
}

export interface SendTransactionEmailResult {
  logged: boolean;
  logId?: string;
  status: EmailDeliveryLogStatus;
  subject?: string;
  recipientEmail?: string;
}

function escapeEmailHtml(value: unknown): string {
  const str = value === null || value === undefined ? '' : String(value);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatReceiptSpec(
  eventType: TransactionalEmailEventType,
  meta: Record<string, any>,
  recipientName: string
): {
  subject: string;
  badge: string;
  badgeColor: string;
  headline: string;
  intro: string;
  rows: Array<{ label: string; value: string; accent?: string }>;
} {
  const safeName = recipientName || 'Valued Member';

  switch (eventType) {
    case 'QUANTUM_ALPHA_ALLOCATED': {
      const amount = meta.amountUsd ? `$${Number(meta.amountUsd).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT` : 'Allocated';
      return {
        subject: `PHIVONEX Receipt: Quantum Alpha™ Allocation Confirmed (${amount})`,
        badge: 'QUANTUM ALPHA™ ALLOCATION',
        badgeColor: '#00E5FF',
        headline: 'Capital Successfully Allocated',
        intro: `Dear ${safeName}, your capital allocation into PHIVONEX QUANTUM ALPHA™ has been settled on the institutional ledger.`,
        rows: [
          { label: 'Allocated Principal', value: amount, accent: '#00E676' },
          { label: 'Strategy Tier', value: String(meta.tierName || meta.tierCode || 'Quantum Alpha™'), accent: '#F5B800' },
          { label: 'Yield Schedule', value: String(meta.yieldSchedule || 'Monday–Friday (5 Trading Days/Week)') },
          { label: '7-Day Lock Expiry', value: meta.unlockEligibleAt ? new Date(meta.unlockEligibleAt).toUTCString() : '7 Days Post-Activation', accent: '#00E5FF' },
          { label: 'Ledger Reference', value: String(meta.publicTxnId || 'Settled') },
        ],
      };
    }

    case 'QUANTUM_ALPHA_REDEEMED': {
      const gross = meta.grossPrincipalUsd ? `$${Number(meta.grossPrincipalUsd).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT` : '—';
      const feeUsd = meta.settlementFeeUsd ? `$${Number(meta.settlementFeeUsd).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT` : '—';
      const net = meta.netPayoutUsd ? `$${Number(meta.netPayoutUsd).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT` : '—';
      const feePct = meta.settlementFeePct ? `${Number(meta.settlementFeePct).toFixed(2)}%` : '15.00%';
      return {
        subject: `PHIVONEX Receipt: Quantum Alpha™ Principal Redeemed (${net})`,
        badge: 'PRINCIPAL REDEMPTION SETTLED',
        badgeColor: '#00E676',
        headline: 'Principal Redemption Completed',
        intro: `Dear ${safeName}, your post-cycle Quantum Alpha™ principal redemption has been processed and credited to your Main USDT Wallet.`,
        rows: [
          { label: 'Gross Principal', value: gross },
          { label: `Settlement Fee (${feePct})`, value: `-${feeUsd}`, accent: '#F5B800' },
          { label: 'Net Credited Payout', value: net, accent: '#00E676' },
          { label: 'Strategy Tier', value: String(meta.tierName || 'Quantum Alpha™') },
          { label: 'Ledger Reference', value: String(meta.publicTxnId || 'Settled'), accent: '#00E5FF' },
        ],
      };
    }

    case 'GENESIS_NODE_MINTED': {
      const debited = meta.amountDebited !== undefined
        ? `${Number(meta.amountDebited).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} ${meta.assetUsed || 'USDT'}`
        : '$1,000.00 USDT';
      return {
        subject: `PHIVONEX Receipt: Genesis Core™ Node Activated (${meta.publicNodeId || 'GENESIS'})`,
        badge: 'GENESIS CORE™ VALIDATOR MINTED',
        badgeColor: '#F5B800',
        headline: 'Genesis Validator Node Activated',
        intro: `Dear ${safeName}, your PHIVONEX GENESIS CORE™ validator node is now live and enrolled in daily PHIVO token emission epochs.`,
        rows: [
          { label: 'Validator Node ID', value: String(meta.publicNodeId || 'Activated'), accent: '#F5B800' },
          { label: 'Activation Settlement', value: debited },
          { label: 'Daily Emission Rate', value: String(meta.dailyEmission || '15 PHIVO / Day'), accent: '#00E676' },
          { label: 'Lifetime Emission Cap', value: String(meta.lifetimeCap || '10,000 PHIVO') },
          { label: 'Order Reference', value: String(meta.publicOrderId || 'Settled'), accent: '#00E5FF' },
        ],
      };
    }

    case 'CHRONO_VAULT_SUBSCRIBED': {
      const principal = meta.principalUsd ? `$${Number(meta.principalUsd).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT` : 'Subscribed';
      return {
        subject: `PHIVONEX Receipt: Chrono Vaults™ Plan Activated (${principal})`,
        badge: 'CHRONO VAULTS™ STAKING',
        badgeColor: '#F5B800',
        headline: 'Fixed-Term Vault Position Active',
        intro: `Dear ${safeName}, your PHIVONEX CHRONO VAULTS™ fixed-term staking subscription is active and accruing daily USDT yield.`,
        rows: [
          { label: 'Vault Plan', value: String(meta.planName || meta.planCode || 'Chrono Vault'), accent: '#F5B800' },
          { label: 'Locked Principal', value: principal, accent: '#00E676' },
          { label: 'Daily Yield Rate', value: meta.dailyRatePct ? `${Number(meta.dailyRatePct).toFixed(2)}% / Day` : 'Fixed Schedule', accent: '#00E5FF' },
          { label: 'Lock Duration', value: meta.durationDays ? `${meta.durationDays} Days (Principal Returned at Maturity)` : 'Fixed Term' },
          { label: 'Maturity Date', value: meta.maturityAt ? new Date(meta.maturityAt).toUTCString() : 'Scheduled' },
          { label: 'Ledger Reference', value: String(meta.publicTxnId || 'Settled') },
        ],
      };
    }

    case 'DEPOSIT_CONFIRMED': {
      const amount = meta.amount !== undefined
        ? `${Number(meta.amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })} ${meta.asset || 'USDT'}`
        : 'Confirmed';
      return {
        subject: `PHIVONEX Receipt: On-Chain Deposit Credited (${amount})`,
        badge: 'BEP-20 DEPOSIT CONFIRMED',
        badgeColor: '#00E676',
        headline: 'On-Chain Deposit Credited',
        intro: `Dear ${safeName}, your blockchain deposit has reached finality and has been credited to your PHIVONEX wallet balance.`,
        rows: [
          { label: 'Credited Amount', value: amount, accent: '#00E676' },
          { label: 'Settlement Network', value: String(meta.network || 'BNB Smart Chain (BEP-20)'), accent: '#F5B800' },
          { label: 'Transaction Hash', value: String(meta.txHash || 'Verified'), accent: '#00E5FF' },
          { label: 'Deposit Reference', value: String(meta.publicDepositId || 'Settled') },
        ],
      };
    }

    case 'WITHDRAWAL_SUBMITTED': {
      const amount = meta.amountUsd !== undefined
        ? `$${Number(meta.amountUsd).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} USDT`
        : 'Submitted';
      return {
        subject: `PHIVONEX Receipt: Withdrawal Request Submitted (${amount})`,
        badge: 'WITHDRAWAL SUBMITTED',
        badgeColor: '#F5B800',
        headline: 'Withdrawal Request Logged',
        intro: `Dear ${safeName}, your withdrawal request has been verified and queued for treasury disbursement.`,
        rows: [
          { label: 'Withdrawal Amount', value: amount, accent: '#F5B800' },
          { label: 'Destination Address', value: String(meta.destinationReference || 'Configured Wallet'), accent: '#00E5FF' },
          { label: 'Settlement Network', value: String(meta.network || 'BNB Smart Chain (BEP-20)') },
          { label: 'Withdrawal ID', value: String(meta.publicWithdrawalId || 'Queued') },
        ],
      };
    }

    case 'WITHDRAWAL_SETTLED': {
      const amount = meta.amountUsd !== undefined
        ? `$${Number(meta.amountUsd).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} USDT`
        : 'Settled';
      return {
        subject: `PHIVONEX Receipt: Withdrawal Settled On-Chain (${amount})`,
        badge: 'WITHDRAWAL SETTLED',
        badgeColor: '#00E676',
        headline: 'On-Chain Disbursement Completed',
        intro: `Dear ${safeName}, your PHIVONEX withdrawal has been executed and confirmed on-chain.`,
        rows: [
          { label: 'Disbursed Amount', value: amount, accent: '#00E676' },
          { label: 'Destination Address', value: String(meta.destinationReference || 'Configured Wallet') },
          { label: 'Settlement Network', value: String(meta.network || 'BNB Smart Chain (BEP-20)') },
          { label: 'On-Chain TX Hash', value: String(meta.txHash || 'Confirmed'), accent: '#00E5FF' },
          { label: 'Withdrawal ID', value: String(meta.publicWithdrawalId || 'Completed') },
        ],
      };
    }

    case 'P2P_TRANSFER_SENT': {
      const asset = String(meta.assetType || 'USDT');
      const gross = meta.grossAmount !== undefined
        ? `${Number(meta.grossAmount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 8 })} ${asset}`
        : `Sent ${asset}`;
      const net = meta.netAmount !== undefined
        ? `${Number(meta.netAmount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 8 })} ${asset}`
        : gross;
      const fee = meta.feeAmount !== undefined && Number(meta.feeAmount) > 0
        ? `${Number(meta.feeAmount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 8 })} ${asset}`
        : `0.00 ${asset}`;
      return {
        subject: `PHIVONEX Receipt: P2P Transfer Sent (${gross})`,
        badge: 'P2P TRANSFER SENT',
        badgeColor: '#F5B800',
        headline: 'Instant P2P Transfer Dispatched',
        intro: `Dear ${safeName}, your member-to-member ${asset} balance transfer has been settled instantaneously.`,
        rows: [
          { label: 'Debited Amount', value: gross, accent: '#F5B800' },
          { label: 'Settlement Fee', value: fee },
          { label: 'Recipient Net Credit', value: net, accent: '#00E676' },
          { label: 'Recipient', value: `${String(meta.recipientName || 'PHIVONEX Member')} (${String(meta.recipientCode || 'Verified')})`, accent: '#00E5FF' },
          { label: 'Transfer Reference', value: String(meta.transferRef || 'Settled') },
          ...(meta.note ? [{ label: 'Memo', value: String(meta.note) }] : []),
        ],
      };
    }

    case 'P2P_TRANSFER_RECEIVED': {
      const asset = String(meta.assetType || 'USDT');
      const net = meta.netAmount !== undefined
        ? `${Number(meta.netAmount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 8 })} ${asset}`
        : `Received ${asset}`;
      return {
        subject: `PHIVONEX Receipt: P2P Transfer Received (${net})`,
        badge: 'P2P TRANSFER RECEIVED',
        badgeColor: '#00E676',
        headline: 'Instant P2P Transfer Credited',
        intro: `Dear ${safeName}, you have received an instant member-to-member ${asset} balance transfer into your PHIVONEX wallet.`,
        rows: [
          { label: 'Credited Amount', value: net, accent: '#00E676' },
          { label: 'Sender', value: `${String(meta.senderName || 'PHIVONEX Member')} (${String(meta.senderCode || 'Verified')})`, accent: '#00E5FF' },
          { label: 'Transfer Reference', value: String(meta.transferRef || 'Settled'), accent: '#F5B800' },
          ...(meta.note ? [{ label: 'Memo', value: String(meta.note) }] : []),
        ],
      };
    }
  }
}

function buildTransactionalReceiptHtml(spec: ReturnType<typeof formatReceiptSpec>): string {
  const rowsHtml = spec.rows
    .map(
      (row) => `
      <tr>
        <td style="padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.06); color: #94a3b8; font-size: 12px; font-weight: 500;">${escapeEmailHtml(row.label)}</td>
        <td style="padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.06); color: ${row.accent || '#f8fafc'}; font-size: 12px; font-weight: 700; text-align: right; font-family: 'JetBrains Mono', ui-monospace, monospace; word-break: break-all;">${escapeEmailHtml(row.value)}</td>
      </tr>`
    )
    .join('');

  return `
    <div style="background-color: #050807; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f8fafc; padding: 36px 14px; margin: 0; width: 100%;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 620px; margin: 0 auto; background-color: #0E1513; border: 1px solid rgba(245, 184, 0, 0.24); border-radius: 18px; overflow: hidden; box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55);">
        <tr>
          <td style="background: linear-gradient(135deg, #0B1210 0%, #050807 100%); padding: 30px 28px; border-bottom: 1px solid rgba(245, 184, 0, 0.22); text-align: center;">
            <div style="font-size: 26px; font-weight: 900; letter-spacing: 5px; color: #F5B800; font-family: 'JetBrains Mono', monospace;">PHIVONEX</div>
            <div style="font-size: 10px; font-weight: 700; letter-spacing: 2.4px; color: #00E5FF; margin-top: 6px; text-transform: uppercase;">INSTITUTIONAL TREASURY &amp; SETTLEMENT RECEIPT</div>
          </td>
        </tr>
        <tr>
          <td style="padding: 32px 28px;">
            <div style="text-align: center; margin-bottom: 18px;">
              <span style="display: inline-block; padding: 6px 14px; background: rgba(245, 184, 0, 0.10); border: 1px solid ${spec.badgeColor}; border-radius: 999px; font-size: 10px; font-weight: 800; letter-spacing: 1.5px; color: ${spec.badgeColor}; font-family: monospace; text-transform: uppercase;">
                ${escapeEmailHtml(spec.badge)}
              </span>
            </div>
            <h1 style="font-size: 22px; font-weight: 800; color: #ffffff; margin: 0 0 12px 0; text-align: center; line-height: 1.3;">${escapeEmailHtml(spec.headline)}</h1>
            <p style="font-size: 13px; color: #cbd5e1; line-height: 1.65; text-align: center; max-width: 500px; margin: 0 auto 24px auto;">
              ${escapeEmailHtml(spec.intro)}
            </p>
            <div style="background: #050807; border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 14px; padding: 14px 20px; margin-bottom: 24px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                ${rowsHtml}
              </table>
            </div>
            <p style="font-size: 11px; color: #64748b; line-height: 1.6; margin: 0; text-align: center;">
              This automated confirmation reflects an immutable ledger settlement on your PHIVONEX account. If you did not authorize this transaction, contact PHIVONEX Support immediately.
            </p>
          </td>
        </tr>
        <tr>
          <td style="background-color: #070B0A; padding: 18px 28px; border-top: 1px solid rgba(255, 255, 255, 0.06); font-size: 11px; color: #64748b; text-align: center;">
            <p style="margin: 0 0 4px 0; font-family: monospace; color: #94a3b8;">PHIVONEX Financial Settlement Infrastructure • Automated Receipt</p>
            <p style="margin: 0;">&copy; ${new Date().getUTCFullYear()} PHIVONEX. All rights reserved.</p>
          </td>
        </tr>
      </table>
    </div>
  `;
}

/**
 * Non-blocking transactional receipt email dispatcher.
 * Always persists an auditable row in PostgreSQL `email_delivery_logs` with status
 * `'SENT' | 'QUEUED_NO_SMTP' | 'FAILED'` and NEVER throws or rolls back caller ACID commits.
 */
export async function sendTransactionEmail(
  params: SendTransactionEmailParams
): Promise<SendTransactionEmailResult> {
  try {
    const db = await getDb();
    let recipientEmail = (params.recipientEmail || '').trim().toLowerCase();
    let recipientName = (params.recipientName || '').trim();
    const userId = params.userId || null;

    if ((!recipientEmail || !recipientName) && userId) {
      const userRes = await db.query<{ email: string; full_name: string | null }>(
        `SELECT LOWER(TRIM(email)) AS email, full_name FROM users WHERE id = $1 LIMIT 1`,
        [userId]
      );
      if (userRes.rows.length > 0) {
        if (!recipientEmail) recipientEmail = userRes.rows[0].email;
        if (!recipientName) recipientName = userRes.rows[0].full_name || 'Valued Member';
      }
    }

    if (!recipientEmail) {
      console.warn(`[TransactionalEmail] Skipping ${params.eventType}: no recipient email resolved for userId=${userId}`);
      return { logged: false, status: 'FAILED' };
    }

    const metadata = params.metadata || {};
    const spec = formatReceiptSpec(params.eventType, metadata, recipientName);
    const html = buildTransactionalReceiptHtml(spec);

    const isTestEnv =
      process.env.NODE_ENV === 'test' ||
      process.env.VITEST === 'true' ||
      process.env.APP_ENV === 'test';
    const apiKey = (process.env.RESEND_API_KEY || '').trim();
    const hasLiveProvider = !isTestEnv && apiKey.length > 0 && !apiKey.includes('your_resend_api_key');

    let status: EmailDeliveryLogStatus = 'QUEUED_NO_SMTP';
    let providerMessageId: string | null = null;
    let providerError: string | null = null;

    if (hasLiveProvider) {
      const provider = new ResendEmailProvider(apiKey);
      const dispatchRes = await provider.sendEmail(recipientEmail, spec.subject, html);
      if (dispatchRes.error) {
        status = 'FAILED';
        providerError = dispatchRes.error;
        console.warn(`[TransactionalEmail] Dispatch FAILED for ${params.eventType} to ${recipientEmail}:`, dispatchRes.error);
      } else {
        status = 'SENT';
        providerMessageId = dispatchRes.providerMessageId || null;
      }
    } else {
      status = 'QUEUED_NO_SMTP';
      console.log(`[TransactionalEmail] Queued (no live SMTP/Resend key) ${params.eventType} -> ${recipientEmail}: "${spec.subject}"`);
    }

    const logId = uuidv4();
    const storedMetadata = {
      ...metadata,
      provider: hasLiveProvider ? 'RESEND' : 'NONE',
      providerMessageId,
      providerError,
      dispatchedAt: new Date().toISOString(),
    };

    await db.query(
      `
      INSERT INTO email_delivery_logs (
        id, user_id, recipient_email, event_type, subject, status, metadata, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, CURRENT_TIMESTAMP)
      `,
      [
        logId,
        userId,
        recipientEmail,
        params.eventType,
        spec.subject,
        status,
        JSON.stringify(storedMetadata),
      ]
    );

    return {
      logged: true,
      logId,
      status,
      subject: spec.subject,
      recipientEmail,
    };
  } catch (err) {
    console.warn(`[TransactionalEmail] Non-blocking dispatch error for ${params.eventType}:`, err);
    return { logged: false, status: 'FAILED' };
  }
}

