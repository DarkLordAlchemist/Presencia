// Pure unit tests for src/lib/attendance/compute.ts — no DB, no browser.
// The night-differential midnight-crossing math is the part most likely
// to be subtly wrong, so it gets the most cases here.
import {
  computeLateMinutes,
  computeUndertimeMinutes,
  computeOvertimeMinutes,
  computeBreakMinutes,
  computeNightDiffMinutes,
  manilaDayAbbreviation,
  manilaDayBounds,
  manilaTimeOnDate,
  manilaDateKey,
} from "../src/lib/attendance/compute";

let passed = 0;
let failed = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed++;
    console.log(`PASS: ${label}`);
  } else {
    failed++;
    console.log(`FAIL: ${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// Manila is UTC+8 — "2026-09-28T01:00:00Z" is 09:00 Manila time.
function manila(hhmm: string, dayOffset = 0): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const base = new Date(Date.UTC(2026, 8, 28 + dayOffset, h - 8, m)); // 2026-09-28 is a Monday
  return base;
}

function main() {
  // --- computeLateMinutes ---
  check("on time exactly at scheduled start", computeLateMinutes("09:00", manila("09:00"), 5), 0);
  check("early arrival is never negative", computeLateMinutes("09:00", manila("08:45"), 5), 0);
  check("late but inside grace period", computeLateMinutes("09:00", manila("09:04"), 5), 0);
  check("late beyond grace period", computeLateMinutes("09:00", manila("09:20"), 5), 15);

  // --- computeUndertimeMinutes ---
  check("leaving exactly on time is not undertime", computeUndertimeMinutes("18:00", manila("18:00")), 0);
  check("leaving early is undertime", computeUndertimeMinutes("18:00", manila("17:30")), 30);
  check("leaving late is never negative undertime", computeUndertimeMinutes("18:00", manila("18:30")), 0);

  // --- computeOvertimeMinutes ---
  check("leaving exactly on time is not overtime", computeOvertimeMinutes("18:00", manila("18:00"), 5), 0);
  check("leaving inside the OT grace window is not overtime", computeOvertimeMinutes("18:00", manila("18:03"), 5), 0);
  check("leaving well past end is overtime", computeOvertimeMinutes("18:00", manila("19:30"), 5), 85);
  check("leaving early is never negative overtime", computeOvertimeMinutes("18:00", manila("17:00"), 5), 0);

  // --- computeBreakMinutes ---
  check("30 minute break", computeBreakMinutes(manila("12:00"), manila("12:30")), 30);
  check("zero-length break", computeBreakMinutes(manila("12:00"), manila("12:00")), 0);

  // --- computeNightDiffMinutes ---
  check(
    "pure day shift has zero night differential",
    computeNightDiffMinutes(manila("09:00"), manila("18:00"), "22:00", "06:00"),
    0,
  );
  check(
    "shift ending inside the night window",
    computeNightDiffMinutes(manila("18:00"), manila("23:00"), "22:00", "06:00"),
    60,
  );
  check(
    "shift entirely inside the night window",
    computeNightDiffMinutes(manila("23:00"), manila("02:00", 1), "22:00", "06:00"),
    180,
  );
  check(
    "shift spanning the whole night window on both sides",
    computeNightDiffMinutes(manila("21:00"), manila("07:00", 1), "22:00", "06:00"),
    480,
  );
  check(
    "shift starting inside the tail of the previous night's window (past midnight)",
    computeNightDiffMinutes(manila("02:00"), manila("10:00"), "22:00", "06:00"),
    240,
  );
  check(
    "24h+ shift covers two full night windows",
    computeNightDiffMinutes(manila("08:00"), manila("08:00", 2), "22:00", "06:00"),
    960,
  );

  // --- manilaDayAbbreviation ---
  check("2026-09-28 (known Monday) noon Manila", manilaDayAbbreviation(manila("12:00")), "MON");
  check("2026-09-28 + 1 day is Tuesday", manilaDayAbbreviation(manila("12:00", 1)), "TUE");
  check("2026-09-28 + 5 days is Saturday", manilaDayAbbreviation(manila("12:00", 5)), "SAT");
  check(
    "a UTC instant just before Manila midnight is still the earlier day",
    manilaDayAbbreviation(new Date(Date.UTC(2026, 8, 28, 15, 59))), // 23:59 Manila on the 28th
    "MON",
  );
  check(
    "a UTC instant right at Manila midnight rolls to the next day",
    manilaDayAbbreviation(new Date(Date.UTC(2026, 8, 28, 16, 0))), // 00:00 Manila on the 29th
    "TUE",
  );

  // --- manilaDayBounds / manilaTimeOnDate ---
  const bounds = manilaDayBounds(manila("12:00"));
  check("day bounds start is Manila midnight", bounds.start.getTime(), manila("00:00").getTime());
  check("day bounds end is next Manila midnight", bounds.end.getTime(), manila("00:00", 1).getTime());
  check(
    "manilaTimeOnDate combines a time with the reference day",
    manilaTimeOnDate("09:30", manila("23:00")).getTime(),
    manila("09:30").getTime(),
  );

  // --- manilaDateKey ---
  check("manilaDateKey for a mid-day Manila instant", manilaDateKey(manila("12:00")), "2026-09-28");
  check(
    "manilaDateKey rolls to the next day right at Manila midnight",
    manilaDateKey(new Date(Date.UTC(2026, 8, 28, 16, 0))), // 00:00 Manila on the 29th
    "2026-09-29",
  );
  check(
    "manilaDateKey stays on the earlier day just before Manila midnight",
    manilaDateKey(new Date(Date.UTC(2026, 8, 28, 15, 59))), // 23:59 Manila on the 28th
    "2026-09-28",
  );

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main();
