import { Resend } from 'resend';
import cron from 'node-cron';
import { getDb } from '../db/db';
import { getNetworkSummary } from './binaryPlacementService';
import { getUserRewardsSummary } from './nodeRewardService';

export async function sendWeeklyReports() {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[WeeklyReport] RESEND_API_KEY not set. Skipping.');
    return;
  }
  
  const resend = new Resend(process.env.RESEND_API_KEY);

  const db = await getDb();
  
  // Fetch all users
  const usersRes = await db.query<{ id: string; email: string; full_name: string }>(
    `SELECT id, email, full_name FROM users WHERE status = 'ACTIVE'`
  );

  for (const user of usersRes.rows) {
    try {
      const networkSummary = await getNetworkSummary(user.id);
      const rewardsSummary = await getUserRewardsSummary(user.id);

      await resend.emails.send({
        from: 'reports@phivonex.com',
        to: user.email,
        subject: 'Your Weekly Phivonex Network Summary',
        html: `
          <h1>Hello ${user.full_name},</h1>
          <p>Here is your weekly summary for your Phivonex network:</p>
          <h2>Network Growth</h2>
          <ul>
            <li>Direct Referrals: ${networkSummary.directReferrals}</li>
            <li>Placed Members: ${networkSummary.placedMembers}</li>
          </ul>
          <h2>Reward Earnings</h2>
          <ul>
            <li>Total Earned: ${rewardsSummary.totalRewardsEarned} PHIVO</li>
            <li>Available Balance: ${rewardsSummary.totalAccrued} PHIVO</li>
          </ul>
          <p>Keep up the great work!</p>
        `,
      });
      console.log(`[WeeklyReport] Sent to ${user.email}`);
    } catch (err) {
      console.error(`[WeeklyReport] Failed to send to ${user.email}:`, err);
    }
  }
}

export function startWeeklyReportScheduler() {
  // Run every Monday at 00:00
  cron.schedule('0 0 * * 1', () => {
    sendWeeklyReports().catch(err => console.error('[WeeklyReport] Scheduler error:', err));
  });
  console.log('[WeeklyReport] Scheduler started.');
}
