// Pure unit tests for src/lib/attendance/whos-in.ts — no DB.
import { determineAttendanceStatus } from "../src/lib/attendance/whos-in";

let passed = 0;
let failed = 0;

function check(label: string, actual: unknown, expected: unknown) {
  if (actual === expected) {
    passed++;
    console.log(`PASS: ${label}`);
  } else {
    failed++;
    console.log(`FAIL: ${label} — expected ${expected}, got ${actual}`);
  }
}

function manila(hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(Date.UTC(2026, 8, 28, h - 8, m));
}

const schedule = { startTime: "09:00", endTime: "18:00" };

function main() {
  check(
    "approved leave wins over everything else",
    determineAttendanceStatus({
      onApprovedLeaveToday: true,
      lastPunchTypeToday: "TIME_IN",
      schedule,
      now: manila("10:00"),
      gracePeriodMinutes: 5,
    }),
    "ON_LEAVE",
  );

  check(
    "last punch TIME_IN means on-site",
    determineAttendanceStatus({
      onApprovedLeaveToday: false,
      lastPunchTypeToday: "TIME_IN",
      schedule,
      now: manila("10:00"),
      gracePeriodMinutes: 5,
    }),
    "ON_SITE",
  );

  check(
    "last punch BREAK_IN means on-site (back from break)",
    determineAttendanceStatus({
      onApprovedLeaveToday: false,
      lastPunchTypeToday: "BREAK_IN",
      schedule,
      now: manila("13:00"),
      gracePeriodMinutes: 5,
    }),
    "ON_SITE",
  );

  check(
    "last punch BREAK_OUT means on break",
    determineAttendanceStatus({
      onApprovedLeaveToday: false,
      lastPunchTypeToday: "BREAK_OUT",
      schedule,
      now: manila("12:15"),
      gracePeriodMinutes: 5,
    }),
    "ON_BREAK",
  );

  check(
    "last punch TIME_OUT means done for the day",
    determineAttendanceStatus({
      onApprovedLeaveToday: false,
      lastPunchTypeToday: "TIME_OUT",
      schedule,
      now: manila("19:00"),
      gracePeriodMinutes: 5,
    }),
    "DONE_FOR_DAY",
  );

  check(
    "no punch yet, no schedule today means rest day",
    determineAttendanceStatus({
      onApprovedLeaveToday: false,
      lastPunchTypeToday: null,
      schedule: null,
      now: manila("10:00"),
      gracePeriodMinutes: 5,
    }),
    "REST_DAY",
  );

  check(
    "no punch yet, before start+grace means not yet due",
    determineAttendanceStatus({
      onApprovedLeaveToday: false,
      lastPunchTypeToday: null,
      schedule,
      now: manila("08:50"),
      gracePeriodMinutes: 5,
    }),
    "NOT_YET_DUE",
  );

  check(
    "no punch yet, past start+grace but before shift end means late",
    determineAttendanceStatus({
      onApprovedLeaveToday: false,
      lastPunchTypeToday: null,
      schedule,
      now: manila("09:30"),
      gracePeriodMinutes: 5,
    }),
    "LATE",
  );

  check(
    "no punch yet, past the whole shift's end means absent",
    determineAttendanceStatus({
      onApprovedLeaveToday: false,
      lastPunchTypeToday: null,
      schedule,
      now: manila("19:00"),
      gracePeriodMinutes: 5,
    }),
    "ABSENT",
  );

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main();
