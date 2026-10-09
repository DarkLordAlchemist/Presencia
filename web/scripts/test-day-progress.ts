// Pure unit tests for src/lib/attendance/day-progress.ts — no DB.
import { computeDayProgress, formatMinutes, type DayProgressPunch } from "../src/lib/attendance/day-progress";

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

function manila(hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(Date.UTC(2026, 8, 28, h - 8, m));
}

function punch(type: DayProgressPunch["type"], hhmm: string): DayProgressPunch {
  return { type, timestamp: manila(hhmm) };
}

function main() {
  check("formatMinutes under an hour", formatMinutes(35), "35m");
  check("formatMinutes over an hour", formatMinutes(95), "1h 35m");
  check("formatMinutes exactly zero", formatMinutes(0), "0m");

  check(
    "no punches yet means zero worked, zero break",
    computeDayProgress([], manila("09:00")),
    { workedMinutes: 0, totalBreakMinutes: 0, currentBreakMinutes: null },
  );

  check(
    "still clocked in, no breaks yet: worked = elapsed since Time In",
    computeDayProgress([punch("TIME_IN", "09:00")], manila("10:30")),
    { workedMinutes: 90, totalBreakMinutes: 0, currentBreakMinutes: null },
  );

  check(
    "currently on break: worked freezes at break start, current break is live",
    computeDayProgress([punch("TIME_IN", "09:00"), punch("BREAK_OUT", "12:00")], manila("12:20")),
    { workedMinutes: 180, totalBreakMinutes: 20, currentBreakMinutes: 20 },
  );

  check(
    "back from break: one completed break subtracted from worked time",
    computeDayProgress(
      [punch("TIME_IN", "09:00"), punch("BREAK_OUT", "12:00"), punch("BREAK_IN", "13:00")],
      manila("14:00"),
    ),
    { workedMinutes: 240, totalBreakMinutes: 60, currentBreakMinutes: null },
  );

  check(
    "a real Philippine-style combo: 1-hour lunch plus two 15-minute breaks, still on the second break",
    computeDayProgress(
      [
        punch("TIME_IN", "08:00"),
        punch("BREAK_OUT", "10:00"), // first 15-min break
        punch("BREAK_IN", "10:15"),
        punch("BREAK_OUT", "12:00"), // 1-hour lunch
        punch("BREAK_IN", "13:00"),
        punch("BREAK_OUT", "15:00"), // second 15-min break, still ongoing
      ],
      manila("15:10"),
    ),
    // 08:00 to 15:10 is 430 minutes gross, minus 85 minutes of breaks (15 + 60 + 10 so far).
    { workedMinutes: 345, totalBreakMinutes: 85, currentBreakMinutes: 10 },
  );

  check(
    "shift closed with Time Out: worked time is final, doesn't keep counting",
    computeDayProgress(
      [
        punch("TIME_IN", "09:00"),
        punch("BREAK_OUT", "12:00"),
        punch("BREAK_IN", "12:30"),
        punch("TIME_OUT", "18:00"),
      ],
      manila("20:00"), // well after clocking out
    ),
    { workedMinutes: 510, totalBreakMinutes: 30, currentBreakMinutes: null },
  );

  check(
    "a second shift the same day (forgot to clock out, corrected): both segments count",
    computeDayProgress(
      [
        punch("TIME_IN", "06:00"),
        punch("TIME_OUT", "07:00"),
        punch("TIME_IN", "09:00"),
      ],
      manila("10:00"),
    ),
    { workedMinutes: 120, totalBreakMinutes: 0, currentBreakMinutes: null },
  );

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main();
