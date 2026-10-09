// Pure unit tests for src/lib/payroll/payslip-compute.ts — no DB.
import { computeSuggestedPayslip, type ShiftForPayroll } from "../src/lib/payroll/payslip-compute";

let passed = 0;
let failed = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const numbersClose = typeof actual === "number" && typeof expected === "number" && Math.abs(actual - expected) < 0.01;
  if (numbersClose || actual === expected) {
    passed++;
    console.log(`PASS: ${label}`);
  } else {
    failed++;
    console.log(`FAIL: ${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function manila(dateStr: string, hhmm: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [h, min] = hhmm.split(":").map(Number);
  return new Date(Date.UTC(y, m - 1, d, h - 8, min));
}

function shift(
  date: string,
  timeIn: string,
  timeOut: string,
  isRestDay: boolean,
  breakMinutes = 0,
  nextDay = false,
): ShiftForPayroll {
  const outDate = nextDay ? addDay(date) : date;
  return {
    timeIn: manila(date, timeIn),
    timeOut: manila(outDate, timeOut),
    breakMinutes,
    isRestDay,
    dateKey: date,
  };
}

function addDay(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + 1));
  return dt.toISOString().slice(0, 10);
}

const NIGHT_START = "22:00";
const NIGHT_END = "06:00";
const HOURLY_RATE = 100;

function label(items: { label: string; amountPesos: number }[], name: string): number | undefined {
  return items.find((i) => i.label === name)?.amountPesos;
}

function main() {
  // 1. Plain 8-hour ordinary weekday, no OT, no night, no holiday.
  const plain = computeSuggestedPayslip({
    shifts: [shift("2026-09-28", "09:00", "17:00", false)],
    holidaysByDate: new Map(),
    nightDiffStart: NIGHT_START,
    nightDiffEnd: NIGHT_END,
    hourlyRate: HOURLY_RATE,
    lateMinutesTotal: 0,
    undertimeMinutesTotal: 0,
  });
  check("plain 8h ordinary day: Basic Pay = 8h x rate", label(plain.earnings, "Basic Pay"), 800);
  check("plain 8h ordinary day: no Overtime Pay line", label(plain.earnings, "Overtime Pay"), undefined);
  check("plain 8h ordinary day: no Night Differential line", label(plain.earnings, "Night Differential Pay"), undefined);

  // 2. 10-hour ordinary day: 8h regular + 2h OT at 125%.
  const withOt = computeSuggestedPayslip({
    shifts: [shift("2026-09-28", "09:00", "19:00", false)],
    holidaysByDate: new Map(),
    nightDiffStart: NIGHT_START,
    nightDiffEnd: NIGHT_END,
    hourlyRate: HOURLY_RATE,
    lateMinutesTotal: 0,
    undertimeMinutesTotal: 0,
  });
  check("10h ordinary day: Basic Pay still just the 8h regular portion", label(withOt.earnings, "Basic Pay"), 800);
  check("10h ordinary day: Overtime Pay = 2h x rate x 1.25", label(withOt.earnings, "Overtime Pay"), 250);

  // 3. Worked on the employee's scheduled rest day.
  const restDay = computeSuggestedPayslip({
    shifts: [shift("2026-09-26", "09:00", "17:00", true)],
    holidaysByDate: new Map(),
    nightDiffStart: NIGHT_START,
    nightDiffEnd: NIGHT_END,
    hourlyRate: HOURLY_RATE,
    lateMinutesTotal: 0,
    undertimeMinutesTotal: 0,
  });
  check("worked rest day: Rest Day Pay = 8h x rate x 1.30", label(restDay.earnings, "Rest Day Pay"), 1040);
  check("worked rest day: no Basic Pay line (not an ordinary day)", label(restDay.earnings, "Basic Pay"), undefined);

  // 4. Worked a declared regular holiday, not on a rest day.
  const holiday = computeSuggestedPayslip({
    shifts: [shift("2026-12-25", "09:00", "17:00", false)],
    holidaysByDate: new Map([["2026-12-25", { type: "REGULAR" as const }]]),
    nightDiffStart: NIGHT_START,
    nightDiffEnd: NIGHT_END,
    hourlyRate: HOURLY_RATE,
    lateMinutesTotal: 0,
    undertimeMinutesTotal: 0,
  });
  check("worked regular holiday: Regular Holiday Pay = 8h x rate x 2.00", label(holiday.earnings, "Regular Holiday Pay"), 1600);

  // 5. Regular holiday that ALSO falls on the employee's rest day.
  const holidayOnRestDay = computeSuggestedPayslip({
    shifts: [shift("2026-12-25", "09:00", "17:00", true)],
    holidaysByDate: new Map([["2026-12-25", { type: "REGULAR" as const }]]),
    nightDiffStart: NIGHT_START,
    nightDiffEnd: NIGHT_END,
    hourlyRate: HOURLY_RATE,
    lateMinutesTotal: 0,
    undertimeMinutesTotal: 0,
  });
  check(
    "regular holiday + rest day: 8h x rate x 2.60",
    label(holidayOnRestDay.earnings, "Regular Holiday Pay (Rest Day)"),
    2080,
  );

  // 6. Full night shift, no OT: 8h entirely inside the 22:00-06:00 window.
  const nightShift = computeSuggestedPayslip({
    shifts: [shift("2026-09-28", "22:00", "06:00", false, 0, true)],
    holidaysByDate: new Map(),
    nightDiffStart: NIGHT_START,
    nightDiffEnd: NIGHT_END,
    hourlyRate: HOURLY_RATE,
    lateMinutesTotal: 0,
    undertimeMinutesTotal: 0,
  });
  check("full night shift: Basic Pay = 8h x rate (still just 100%)", label(nightShift.earnings, "Basic Pay"), 800);
  check("full night shift: Night Differential Pay = 8h x rate x 10%", label(nightShift.earnings, "Night Differential Pay"), 80);

  // 7. Night shift WITH overtime: 18:00-04:00 (10h: 8 regular + 2 OT), night
  // window 22:00-06:00 overlaps 22:00-04:00 = 6h total, all 2 OT hours fall
  // at night (22:00-04:00 tail), leaving 4 regular-night hours (22:00-02:00).
  const nightOt = computeSuggestedPayslip({
    shifts: [shift("2026-09-28", "18:00", "04:00", false, 0, true)],
    holidaysByDate: new Map(),
    nightDiffStart: NIGHT_START,
    nightDiffEnd: NIGHT_END,
    hourlyRate: HOURLY_RATE,
    lateMinutesTotal: 0,
    undertimeMinutesTotal: 0,
  });
  check("night OT shift: Basic Pay = 8h x rate", label(nightOt.earnings, "Basic Pay"), 800);
  check("night OT shift: Overtime Pay = 2h x rate x 1.25", label(nightOt.earnings, "Overtime Pay"), 250);
  check(
    "night OT shift: Night Diff = 4h regular-night x 10% + 2h OT-night x 125% x 10%",
    label(nightOt.earnings, "Night Differential Pay"),
    65,
  );

  // 8. Two shifts in one period accumulate onto the same line item.
  const twoShifts = computeSuggestedPayslip({
    shifts: [shift("2026-09-28", "09:00", "17:00", false), shift("2026-09-29", "09:00", "17:00", false)],
    holidaysByDate: new Map(),
    nightDiffStart: NIGHT_START,
    nightDiffEnd: NIGHT_END,
    hourlyRate: HOURLY_RATE,
    lateMinutesTotal: 0,
    undertimeMinutesTotal: 0,
  });
  check("two ordinary 8h days: Basic Pay accumulates across both", label(twoShifts.earnings, "Basic Pay"), 1600);

  // 9. Late/undertime deduction.
  const withDeduction = computeSuggestedPayslip({
    shifts: [shift("2026-09-28", "09:00", "17:00", false)],
    holidaysByDate: new Map(),
    nightDiffStart: NIGHT_START,
    nightDiffEnd: NIGHT_END,
    hourlyRate: HOURLY_RATE,
    lateMinutesTotal: 30,
    undertimeMinutesTotal: 30,
  });
  check(
    "late + undertime deduction = 1h total x hourly rate",
    label(withDeduction.deductions, "Late / Undertime Deduction"),
    100,
  );

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main();
