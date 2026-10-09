// Pure Philippine Labor Code premium-pay rate tables and rate derivation —
// no I/O, no Prisma, so the numbers themselves can be unit-tested directly.
// Sourced from DOLE Labor Advisory practice on regular holidays, special
// non-working days, and rest days (Labor Code Book III, Articles 82-96):
// premiums are MULTIPLICATIVE, not additive, e.g. a regular holiday that
// also falls on a rest day is 200% x 130% = 260%, not 200% + 130% - 100%.

export type DayType =
  | "ORDINARY"
  | "REST_DAY"
  | "SPECIAL_NON_WORKING"
  | "SPECIAL_NON_WORKING_REST_DAY"
  | "REGULAR_HOLIDAY"
  | "REGULAR_HOLIDAY_REST_DAY";

/** Multiplier of the hourly rate for the first 8 hours of a day worked. */
export const REGULAR_HOUR_MULTIPLIER: Record<DayType, number> = {
  ORDINARY: 1.0,
  REST_DAY: 1.3,
  SPECIAL_NON_WORKING: 1.3,
  SPECIAL_NON_WORKING_REST_DAY: 1.5,
  REGULAR_HOLIDAY: 2.0,
  REGULAR_HOLIDAY_REST_DAY: 2.6,
};

const NIGHT_DIFF_MULTIPLIER = 1.1;
const ORDINARY_OT_MULTIPLIER = 1.25;
const NON_ORDINARY_OT_ADDON = 1.3;

/** Multiplier of the hourly rate for hours beyond 8 on that day. Ordinary
 * days get a flat +25%; every other day type is its own regular multiplier
 * with an additional +30% stacked on top (multiplicatively). */
export function overtimeMultiplier(dayType: DayType): number {
  if (dayType === "ORDINARY") return ORDINARY_OT_MULTIPLIER;
  return REGULAR_HOUR_MULTIPLIER[dayType] * NON_ORDINARY_OT_ADDON;
}

/** Night differential (10PM-6AM) adds 10% on top of whatever rate already
 * applies to that hour — stacks on regular-hour and overtime rates alike. */
export function nightDifferentialMultiplier(baseMultiplier: number): number {
  return baseMultiplier * NIGHT_DIFF_MULTIPLIER;
}

export interface HolidayLookup {
  type: "REGULAR" | "SPECIAL_NON_WORKING";
}

/** Combines "is this the employee's scheduled rest day" with "is this a
 * declared holiday" into the single DayType the rate tables key on. */
export function determineDayType(isRestDay: boolean, holiday: HolidayLookup | null): DayType {
  if (holiday?.type === "REGULAR") return isRestDay ? "REGULAR_HOLIDAY_REST_DAY" : "REGULAR_HOLIDAY";
  if (holiday?.type === "SPECIAL_NON_WORKING") return isRestDay ? "SPECIAL_NON_WORKING_REST_DAY" : "SPECIAL_NON_WORKING";
  return isRestDay ? "REST_DAY" : "ORDINARY";
}

export const STANDARD_HOURS_PER_DAY = 8;

export interface DerivedRate {
  dailyRate: number;
  hourlyRate: number;
}

/** monthlyCompensation / workingDaysPerMonth = dailyRate; dailyRate / 8 =
 * hourlyRate. workingDaysPerMonth is a configured divisor (companies differ:
 * 22 for a 5-day week, 26 for 6-day, 261/12 ≈ 21.75, ...) — never hardcoded. */
export function deriveRate(monthlyCompensation: number, workingDaysPerMonth: number): DerivedRate {
  const dailyRate = monthlyCompensation / workingDaysPerMonth;
  return { dailyRate, hourlyRate: dailyRate / STANDARD_HOURS_PER_DAY };
}
