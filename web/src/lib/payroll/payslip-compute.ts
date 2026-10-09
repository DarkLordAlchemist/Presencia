// Pure "turn a pay period's real attendance into suggested payslip line
// items" logic — no I/O, no Prisma. Auto-SUGGESTS amounts using the
// Philippine Labor Code premium-pay rate tables (rates.ts); HR reviews and
// can edit/add/remove anything before issuing, so an approximation here is
// a starting point, not a legal filing.
import { computeNightDiffMinutes } from "@/lib/attendance/compute";
import {
  determineDayType,
  overtimeMultiplier,
  REGULAR_HOUR_MULTIPLIER,
  type DayType,
  type HolidayLookup,
} from "./rates";

export interface ShiftForPayroll {
  timeIn: Date;
  timeOut: Date;
  /** Total break minutes taken during this shift — excluded from pay. */
  breakMinutes: number;
  /** Resolved by the caller from whichever Schedule actually applied on this
   * shift's date (schedules can change mid-period, e.g. rotating shifts) —
   * not a single schedule assumed for the whole pay period. */
  isRestDay: boolean;
  /** Manila calendar date as "YYYY-MM-DD", for holiday lookup. */
  dateKey: string;
}

export interface SuggestedLineItem {
  label: string;
  amountPesos: number;
}

export interface PayslipComputeInput {
  shifts: ShiftForPayroll[];
  holidaysByDate: Map<string, HolidayLookup>;
  nightDiffStart: string;
  nightDiffEnd: string;
  hourlyRate: number;
  lateMinutesTotal: number;
  undertimeMinutesTotal: number;
}

export interface SuggestedPayslip {
  earnings: SuggestedLineItem[];
  deductions: SuggestedLineItem[];
}

const DAY_TYPE_LABELS: Record<DayType, string> = {
  ORDINARY: "Basic Pay",
  REST_DAY: "Rest Day Pay",
  SPECIAL_NON_WORKING: "Special Non-Working Day Pay",
  SPECIAL_NON_WORKING_REST_DAY: "Special Non-Working Day (Rest Day) Pay",
  REGULAR_HOLIDAY: "Regular Holiday Pay",
  REGULAR_HOLIDAY_REST_DAY: "Regular Holiday Pay (Rest Day)",
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computeSuggestedPayslip(input: PayslipComputeInput): SuggestedPayslip {
  const regularPayByType = new Map<DayType, number>();
  let overtimePay = 0;
  let nightDiffPay = 0;

  for (const shift of input.shifts) {
    const holiday = input.holidaysByDate.get(shift.dateKey) ?? null;
    const dayType = determineDayType(shift.isRestDay, holiday);

    const grossMinutes = Math.round((shift.timeOut.getTime() - shift.timeIn.getTime()) / 60000);
    const workedMinutes = Math.max(0, grossMinutes - shift.breakMinutes);
    const regularMinutes = Math.min(workedMinutes, 480);
    const otMinutes = Math.max(0, workedMinutes - 480);

    const regularMultiplier = REGULAR_HOUR_MULTIPLIER[dayType];
    const otMultiplier = overtimeMultiplier(dayType);

    const regularBase = (regularMinutes / 60) * regularMultiplier * input.hourlyRate;
    regularPayByType.set(dayType, (regularPayByType.get(dayType) ?? 0) + regularBase);
    overtimePay += (otMinutes / 60) * otMultiplier * input.hourlyRate;

    // Night differential is computed over the whole wall-clock shift span
    // (breaks aren't excluded here, matching how this app already computes
    // night-diff minutes elsewhere) as a separate 10% ADD-ON on top of the
    // regular/OT pay already counted above — not double-counted.
    const totalNightMinutes = computeNightDiffMinutes(shift.timeIn, shift.timeOut, input.nightDiffStart, input.nightDiffEnd);
    // Approximation: assumes OT hours sit at the tail of the shift, so night
    // hours are "used up" by OT first — reasonable for the common case
    // (working late runs into the night window), not a precise minute-by-
    // minute reconstruction. HR can adjust before issuing if a specific
    // shift needs it.
    const otNightMinutes = Math.min(totalNightMinutes, otMinutes);
    const regularNightMinutes = totalNightMinutes - otNightMinutes;
    nightDiffPay +=
      (regularNightMinutes / 60) * regularMultiplier * input.hourlyRate * 0.1 +
      (otNightMinutes / 60) * otMultiplier * input.hourlyRate * 0.1;
  }

  const earnings: SuggestedLineItem[] = [];
  // Stable, human-meaningful order rather than Map insertion order.
  const order: DayType[] = [
    "ORDINARY",
    "REST_DAY",
    "SPECIAL_NON_WORKING",
    "SPECIAL_NON_WORKING_REST_DAY",
    "REGULAR_HOLIDAY",
    "REGULAR_HOLIDAY_REST_DAY",
  ];
  for (const dayType of order) {
    const amount = regularPayByType.get(dayType);
    if (amount && amount > 0) earnings.push({ label: DAY_TYPE_LABELS[dayType], amountPesos: round2(amount) });
  }
  if (overtimePay > 0) earnings.push({ label: "Overtime Pay", amountPesos: round2(overtimePay) });
  if (nightDiffPay > 0) earnings.push({ label: "Night Differential Pay", amountPesos: round2(nightDiffPay) });

  const deductions: SuggestedLineItem[] = [];
  const lateUndertimeMinutes = input.lateMinutesTotal + input.undertimeMinutesTotal;
  if (lateUndertimeMinutes > 0) {
    deductions.push({
      label: "Late / Undertime Deduction",
      amountPesos: round2((lateUndertimeMinutes / 60) * input.hourlyRate),
    });
  }

  return { earnings, deductions };
}
