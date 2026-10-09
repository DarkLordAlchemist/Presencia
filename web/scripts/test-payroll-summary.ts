// Pure unit tests for src/lib/attendance/payroll-summary.ts — no DB.
import { summarizeForPayroll, type SummarizablePunch } from "../src/lib/attendance/payroll-summary";
import { manilaDateRangeToUtc, semiMonthlyCutoffFor } from "../src/lib/attendance/pay-period-math";

let passed = 0;
let failed = 0;

function check(label: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    passed++;
    console.log(`PASS: ${label}`);
  } else {
    failed++;
    console.log(`FAIL: ${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function punch(
  overrides: Partial<SummarizablePunch> & Pick<SummarizablePunch, "userId" | "type" | "timestamp">,
): SummarizablePunch {
  return {
    userName: "Test Employee",
    lateMinutes: null,
    undertimeMinutes: null,
    overtimeMinutes: null,
    nightDiffMinutes: null,
    breakMinutes: null,
    ...overrides,
  };
}

function at(hour: number, minute = 0): Date {
  return new Date(Date.UTC(2026, 8, 28, hour - 8, minute)); // Manila local time helper
}

function main() {
  // Simple 8-hour shift with a 1-hour break, no OT/night-diff/late.
  const simple = summarizeForPayroll([
    punch({ userId: "u1", type: "TIME_IN", timestamp: at(9) }),
    punch({ userId: "u1", type: "BREAK_OUT", timestamp: at(12) }),
    punch({ userId: "u1", type: "BREAK_IN", timestamp: at(13), breakMinutes: 60 }),
    punch({ userId: "u1", type: "TIME_OUT", timestamp: at(18) }),
  ]);
  check("one completed shift is counted", simple[0].shiftsCompleted, 1);
  check("9am-6pm minus 1hr break = 8 regular hours", simple[0].regularMinutes, 8 * 60);

  // Shift with overtime and lateness.
  const withOtAndLate = summarizeForPayroll([
    punch({ userId: "u2", type: "TIME_IN", timestamp: at(9, 20), lateMinutes: 15 }),
    punch({ userId: "u2", type: "TIME_OUT", timestamp: at(19), overtimeMinutes: 55, undertimeMinutes: 0 }),
  ]);
  check("late minutes carried through", withOtAndLate[0].lateMinutes, 15);
  check("overtime minutes carried through", withOtAndLate[0].overtimeMinutes, 55);
  check(
    "regular minutes excludes the overtime portion",
    withOtAndLate[0].regularMinutes,
    Math.round((at(19).getTime() - at(9, 20).getTime()) / 60000) - 55,
  );

  // An unmatched trailing TIME_IN (shift not yet closed) isn't counted.
  const openShift = summarizeForPayroll([punch({ userId: "u3", type: "TIME_IN", timestamp: at(9) })]);
  check("an unclosed shift counts zero completed shifts", openShift[0].shiftsCompleted, 0);
  check("an unclosed shift contributes zero regular minutes", openShift[0].regularMinutes, 0);

  // Two employees stay separate, sorted by name.
  const twoEmployees = summarizeForPayroll([
    punch({ userId: "u4", userName: "Zed", type: "TIME_IN", timestamp: at(9) }),
    punch({ userId: "u4", userName: "Zed", type: "TIME_OUT", timestamp: at(17) }),
    punch({ userId: "u5", userName: "Ana", type: "TIME_IN", timestamp: at(9) }),
    punch({ userId: "u5", userName: "Ana", type: "TIME_OUT", timestamp: at(17) }),
  ]);
  check("two employees both appear", twoEmployees.length, 2);
  check("results sorted by name", twoEmployees.map((s) => s.userName), ["Ana", "Zed"]);

  // Two separate completed shifts for the same person in one period sum together.
  const twoShifts = summarizeForPayroll([
    punch({ userId: "u6", type: "TIME_IN", timestamp: at(9) }),
    punch({ userId: "u6", type: "TIME_OUT", timestamp: at(17) }),
    punch({ userId: "u6", type: "TIME_IN", timestamp: at(9, 0), }),
  ]);
  // Note: second TIME_IN with no matching TIME_OUT shouldn't add a shift.
  check("only the completed shift is counted, the dangling second TIME_IN is not", twoShifts[0].shiftsCompleted, 1);

  // A one-day pay period must cover that entire MANILA calendar day, not a
  // naive UTC day and not just its first millisecond — the actual bug
  // caught by the e2e test: a "today only" period built from raw
  // UTC-parsed dates excluded every punch made later that same Manila day.
  const oneDay = manilaDateRangeToUtc("2026-09-26", "2026-09-26");
  check(
    "a one-day period starts at Manila midnight, not UTC midnight",
    oneDay.startDate.toISOString(),
    "2026-09-25T16:00:00.000Z", // Manila 2026-09-26 00:00 == UTC 2026-09-25 16:00
  );
  check(
    "a one-day period covers a punch made in the Manila evening of that day",
    new Date("2026-09-26T14:00:00.000Z").getTime() <= oneDay.endDate.getTime(), // Manila 22:00
    true,
  );
  check(
    "a one-day period does NOT bleed into the next Manila day",
    new Date("2026-09-26T16:00:00.000Z").getTime() <= oneDay.endDate.getTime(), // Manila 2026-09-27 00:00
    false,
  );
  const multiDay = manilaDateRangeToUtc("2026-09-01", "2026-09-15");
  check(
    "a multi-day period's end still covers the last day's Manila evening",
    new Date("2026-09-15T14:00:00.000Z").getTime() <= multiDay.endDate.getTime(),
    true,
  );

  // Sanity-check the semi-monthly cutoff boundary too.
  const firstHalf = semiMonthlyCutoffFor(new Date("2026-09-10T00:00:00.000Z"));
  check("day 10 falls in the 1st-15th cutoff", firstHalf.endDate.getUTCDate(), 15);
  const secondHalf = semiMonthlyCutoffFor(new Date("2026-09-20T00:00:00.000Z"));
  check("day 20 falls in the 16th-end cutoff, starting on the 16th", secondHalf.startDate.getUTCDate(), 16);
  check("September's cutoff correctly ends on the 30th, not the 31st", secondHalf.endDate.getUTCDate(), 30);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main();
