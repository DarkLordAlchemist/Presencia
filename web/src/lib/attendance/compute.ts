// Pure attendance-rule math (grace period, undertime, overtime, night
// differential, break duration). No I/O, no Prisma — kept pure so it can
// be unit-tested without a database or browser.
//
// The Philippines has no DST and a fixed UTC+8 offset, so "Manila wall
// time" is computed by shifting the UTC epoch by +8h rather than pulling
// in a timezone library — correct for this one fixed-offset zone, not a
// general-purpose approach.

const MANILA_OFFSET_MIN = 8 * 60;
const MINUTES_PER_DAY = 1440;

/** Minutes since the Unix epoch, shifted into Manila wall-clock time. */
function manilaMinutesSinceEpoch(date: Date): number {
  return Math.floor(date.getTime() / 60000) + MANILA_OFFSET_MIN;
}

/** Minute-of-day (0-1439) in Manila wall-clock time. */
function manilaMinuteOfDay(date: Date): number {
  return ((manilaMinutesSinceEpoch(date) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}

export function parseHHMM(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** TIME_IN: minutes late beyond the grace period. 0 if on time or early. */
export function computeLateMinutes(scheduleStartHHMM: string, punchTime: Date, graceMinutes: number): number {
  const scheduledStart = parseHHMM(scheduleStartHHMM);
  const actual = manilaMinuteOfDay(punchTime);
  return Math.max(0, actual - scheduledStart - graceMinutes);
}

/** TIME_OUT: minutes short of the scheduled end time. 0 if on time or later. */
export function computeUndertimeMinutes(scheduleEndHHMM: string, punchTime: Date): number {
  const scheduledEnd = parseHHMM(scheduleEndHHMM);
  const actual = manilaMinuteOfDay(punchTime);
  return Math.max(0, scheduledEnd - actual);
}

/** TIME_OUT: minutes worked past scheduled end + grace. 0 if not overtime. */
export function computeOvertimeMinutes(scheduleEndHHMM: string, punchTime: Date, graceMinutes: number): number {
  const scheduledEnd = parseHHMM(scheduleEndHHMM);
  const actual = manilaMinuteOfDay(punchTime);
  return Math.max(0, actual - scheduledEnd - graceMinutes);
}

/** BREAK_IN: duration of the break that just ended, in whole minutes. */
export function computeBreakMinutes(breakOut: Date, breakIn: Date): number {
  return Math.round((breakIn.getTime() - breakOut.getTime()) / 60000);
}

/**
 * TIME_OUT: minutes of the [timeIn, timeOut) shift that fall inside the
 * (possibly midnight-crossing) night-differential window, e.g. 22:00-06:00.
 * Walks each calendar day the shift touches and sums overlap with that
 * day's night block — one extra day is checked on each side so a window
 * that started the previous evening (e.g. a punch at 2am) is still caught.
 */
export function computeNightDiffMinutes(
  timeIn: Date,
  timeOut: Date,
  nightStartHHMM: string,
  nightEndHHMM: string,
): number {
  const start = manilaMinutesSinceEpoch(timeIn);
  const end = manilaMinutesSinceEpoch(timeOut);
  const nightStart = parseHHMM(nightStartHHMM);
  const nightEnd = parseHHMM(nightEndHHMM);

  const startDay = Math.floor(start / MINUTES_PER_DAY) - 1;
  const endDay = Math.floor((end - 1) / MINUTES_PER_DAY);

  let total = 0;
  for (let day = startDay; day <= endDay; day++) {
    const dayBase = day * MINUTES_PER_DAY;
    const windowStart = dayBase + nightStart;
    const windowEnd = dayBase + MINUTES_PER_DAY + nightEnd; // wraps into the next day's morning
    const overlapStart = Math.max(start, windowStart);
    const overlapEnd = Math.min(end, windowEnd);
    if (overlapEnd > overlapStart) total += overlapEnd - overlapStart;
  }
  return total;
}

const DAY_ABBREVIATIONS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

/** Manila-local day-of-week abbreviation matching Schedule.daysOfWeek entries. */
export function manilaDayAbbreviation(date: Date): string {
  const totalDays = Math.floor(manilaMinutesSinceEpoch(date) / MINUTES_PER_DAY);
  // 1970-01-01 was a Thursday (index 4).
  const dayIndex = (((totalDays + 4) % 7) + 7) % 7;
  return DAY_ABBREVIATIONS[dayIndex];
}

/** "YYYY-MM-DD" for the given instant's Manila calendar date — NOT
 * `date.toISOString().slice(0, 10)`, which would give the wrong (UTC) date
 * for anything in the evening Manila hours that's already past UTC
 * midnight the other way, or before it. */
export function manilaDateKey(date: Date): string {
  const totalDays = Math.floor(manilaMinutesSinceEpoch(date) / MINUTES_PER_DAY);
  const epochNoon = new Date(totalDays * MINUTES_PER_DAY * 60000 + 12 * 3600000);
  return epochNoon.toISOString().slice(0, 10);
}

/** [start, end) UTC instants spanning the given date's Manila calendar day. */
export function manilaDayBounds(date: Date): { start: Date; end: Date } {
  const totalMinutes = manilaMinutesSinceEpoch(date);
  const dayStartMinutes = Math.floor(totalMinutes / MINUTES_PER_DAY) * MINUTES_PER_DAY;
  const start = new Date((dayStartMinutes - MANILA_OFFSET_MIN) * 60000);
  const end = new Date((dayStartMinutes + MINUTES_PER_DAY - MANILA_OFFSET_MIN) * 60000);
  return { start, end };
}

/** Combines a Manila-local "HH:MM" with a reference date's Manila calendar day. */
export function manilaTimeOnDate(hhmm: string, referenceDate: Date): Date {
  const { start } = manilaDayBounds(referenceDate);
  return new Date(start.getTime() + parseHHMM(hhmm) * 60000);
}
