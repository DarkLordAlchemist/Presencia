import { manilaDayBounds } from "./compute";

/**
 * Converts a date-only "YYYY-MM-DD" pair from a pay-period form into the
 * UTC instants spanning those Manila calendar days, inclusive.
 *
 * A naive `new Date("2026-09-26")` parses as UTC midnight — the start of
 * that date in UTC, not in Manila (UTC+8). Since this whole app reasons
 * about days in Manila local time (schedules, punches, night-diff), a
 * pay period built from raw UTC-parsed dates would be offset by 8 hours
 * from the actual Manila business day it's meant to represent, and a
 * single-day period's end would only cover that day's first millisecond
 * if left at literal midnight. Anchoring each date at 12:00 UTC first —
 * safely inside the same Manila calendar date regardless of the +8
 * offset — then asking manilaDayBounds() for that date's real Manila-day
 * boundaries avoids both problems at once.
 */
export function manilaDateRangeToUtc(startDateOnly: string, endDateOnly: string): { startDate: Date; endDate: Date } {
  const startBounds = manilaDayBounds(new Date(`${startDateOnly}T12:00:00Z`));
  const endBounds = manilaDayBounds(new Date(`${endDateOnly}T12:00:00Z`));
  return { startDate: startBounds.start, endDate: new Date(endBounds.end.getTime() - 1) };
}

/** PH semi-monthly cutoff for the given date: 1st-15th or 16th-end of month. */
export function semiMonthlyCutoffFor(date: Date): { startDate: Date; endDate: Date } {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  if (day <= 15) {
    return { startDate: new Date(Date.UTC(year, month, 1)), endDate: new Date(Date.UTC(year, month, 15)) };
  }
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return { startDate: new Date(Date.UTC(year, month, 16)), endDate: new Date(Date.UTC(year, month, lastDay)) };
}
