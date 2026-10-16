import { getNextUtc0600Time, getPreviousUtcBusinessDate } from '../utils/timezone';
import { runDailyMatchingSettlementCycle } from './binaryMatchingService';

let schedulerTimer: NodeJS.Timeout | null = null;
let isRunning = false;

/**
 * Executes the authoritative 06:00 UTC daily matching settlement cycle.
 * Settles the previous business date that just closed at 06:00 UTC.
 */
async function executeDailyCycle(): Promise<void> {
  const previousDate = getPreviousUtcBusinessDate();
  console.log(`[MatchingScheduler] 🕛 06:00 UTC reached. Starting daily matching settlement for previous business date: ${previousDate}`);

  try {
    const result = await runDailyMatchingSettlementCycle(previousDate);
    console.log(
      `[MatchingScheduler] ✅ Daily settlement cycle finished for ${previousDate}: ` +
      `status=${result.status}, usersSettled=${result.usersSettled}, totalBonus=$${result.totalBonusUsd}, duration=${result.durationMs}ms`
    );
  } catch (err) {
    console.error(`[MatchingScheduler] ❌ Daily settlement cycle failed for ${previousDate}:`, err);
  } finally {
    // Schedule next cycle
    scheduleNextDailyRun();
  }
}

/**
 * Calculates ms until the next 06:00 UTC and arms the timer.
 */
function scheduleNextDailyRun(): void {
  const { nextRunIso, msUntilRun } = getNextUtc0600Time();
  console.log(`[MatchingScheduler] Next daily settlement scheduled for ${nextRunIso} (in ${Math.round(msUntilRun / 1000)}s)`);

  if (schedulerTimer) {
    clearTimeout(schedulerTimer);
  }

  schedulerTimer = setTimeout(() => {
    executeDailyCycle().catch((err) => {
      console.error('[MatchingScheduler] Unhandled error during 06:00 UTC execution:', err);
    });
  }, msUntilRun);
}

/**
 * Initializes the background 06:00 UTC daily matching scheduler.
 */
export function startMatchingScheduler(): void {
  if (isRunning) return;
  isRunning = true;
  console.log('[MatchingScheduler] Initializing Daily Binary Matching Settlement Scheduler (06:00 UTC)...');
  scheduleNextDailyRun();
}

/**
 * Stops the background scheduler (e.g. during graceful shutdown or testing).
 */
export function stopMatchingScheduler(): void {
  if (schedulerTimer) {
    clearTimeout(schedulerTimer);
    schedulerTimer = null;
  }
  isRunning = false;
  console.log('[MatchingScheduler] Stopped Daily Binary Matching Settlement Scheduler.');
}
