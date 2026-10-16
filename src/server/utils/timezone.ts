/**
 * Phivonex Timezone & Business Date Utility
 * Authoritative daily settlement & business date timezones: Asia/Dhaka & UTC (as requested)
 */

export const PHIVONEX_BUSINESS_TIMEZONE = 'Asia/Dhaka';
export const PHIVONEX_UTC_TIMEZONE = 'UTC';

/**
 * Returns the authoritative business date in Asia/Dhaka formatted as 'YYYY-MM-DD'.
 */
export function getDhakaBusinessDate(date: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: PHIVONEX_BUSINESS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date);
}

/**
 * Returns the authoritative business date in UTC formatted as 'YYYY-MM-DD'.
 */
export function getUtcBusinessDate(date: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: PHIVONEX_UTC_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date);
}

/**
 * Returns the previous business date in Asia/Dhaka formatted as 'YYYY-MM-DD'.
 */
export function getPreviousDhakaBusinessDate(date: Date = new Date()): string {
  const currentDhakaStr = getDhakaBusinessDate(date);
  const [year, month, day] = currentDhakaStr.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().split('T')[0];
}

/**
 * Returns the previous business date in UTC formatted as 'YYYY-MM-DD'.
 */
export function getPreviousUtcBusinessDate(date: Date = new Date()): string {
  const currentUtcStr = getUtcBusinessDate(date);
  const [year, month, day] = currentUtcStr.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().split('T')[0];
}

/**
 * Calculates the exact next 00:00 Asia/Dhaka occurrence and milliseconds until then.
 */
export function getNextDhakaMidnightTime(from: Date = new Date()): {
  nextMidnightIso: string;
  msUntilMidnight: number;
} {
  const currentDhakaStr = getDhakaBusinessDate(from);
  const [year, month, day] = currentDhakaStr.split('-').map(Number);
  const tomorrow = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const nextDhakaDateStr = tomorrow.toISOString().split('T')[0];
  const [nextYear, nextMonth, nextDay] = nextDhakaDateStr.split('-').map(Number);

  const nextMidnightUtcMs = Date.UTC(nextYear, nextMonth - 1, nextDay, 0, 0, 0) - (6 * 60 * 60 * 1000);
  const nextMidnightDate = new Date(nextMidnightUtcMs);
  const diffMs = Math.max(0, nextMidnightDate.getTime() - from.getTime());

  return {
    nextMidnightIso: nextMidnightDate.toISOString(),
    msUntilMidnight: diffMs,
  };
}

/**
 * Calculates the exact next 00:00 UTC occurrence and milliseconds until then.
 */
export function getNextUtcMidnightTime(from: Date = new Date()): {
  nextMidnightIso: string;
  msUntilMidnight: number;
} {
  const now = from.getTime();
  const utcDate = new Date(now);
  const nextMidnight = new Date(Date.UTC(
    utcDate.getUTCFullYear(),
    utcDate.getUTCMonth(),
    utcDate.getUTCDate() + 1,
    0, 0, 0, 0
  ));
  return {
    nextMidnightIso: nextMidnight.toISOString(),
    msUntilMidnight: Math.max(0, nextMidnight.getTime() - now),
  };
}

/**
 * Calculates the exact next 06:00 UTC occurrence and milliseconds until then.
 */
export function getNextUtc0600Time(from: Date = new Date()): {
  nextRunIso: string;
  msUntilRun: number;
} {
  const now = from.getTime();
  const d = new Date(now);
  const targetToday = new Date(Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate(),
    6, 0, 0, 0
  ));

  if (now >= targetToday.getTime()) {
    targetToday.setUTCDate(targetToday.getUTCDate() + 1);
  }

  return {
    nextRunIso: targetToday.toISOString(),
    msUntilRun: Math.max(0, targetToday.getTime() - now),
  };
}

/**
 * Returns current timestamp in ISO format
 */
export function getNowIso(): string {
  return new Date().toISOString();
}
