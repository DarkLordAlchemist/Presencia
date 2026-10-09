// Pure unit tests for src/lib/payroll/rates.ts — no DB. These lock in the
// exact Philippine Labor Code premium percentages; a wrong number here
// means wrong pay, so every documented rate gets its own check.
import {
  REGULAR_HOUR_MULTIPLIER,
  overtimeMultiplier,
  nightDifferentialMultiplier,
  determineDayType,
  deriveRate,
} from "../src/lib/payroll/rates";

let passed = 0;
let failed = 0;

function check(label: string, actual: unknown, expected: unknown) {
  if (Math.abs((actual as number) - (expected as number)) < 1e-9 || actual === expected) {
    passed++;
    console.log(`PASS: ${label}`);
  } else {
    failed++;
    console.log(`FAIL: ${label} — expected ${expected}, got ${actual}`);
  }
}

function main() {
  // First-8-hours multipliers.
  check("ordinary day: no premium", REGULAR_HOUR_MULTIPLIER.ORDINARY, 1.0);
  check("rest day: 130%", REGULAR_HOUR_MULTIPLIER.REST_DAY, 1.3);
  check("special non-working day: 130%", REGULAR_HOUR_MULTIPLIER.SPECIAL_NON_WORKING, 1.3);
  check("special non-working day on rest day: 150%", REGULAR_HOUR_MULTIPLIER.SPECIAL_NON_WORKING_REST_DAY, 1.5);
  check("regular holiday: 200%", REGULAR_HOUR_MULTIPLIER.REGULAR_HOLIDAY, 2.0);
  check("regular holiday on rest day: 260% (200% x 130%, multiplicative)", REGULAR_HOUR_MULTIPLIER.REGULAR_HOLIDAY_REST_DAY, 2.6);

  // Overtime multipliers.
  check("ordinary day OT: 125%", overtimeMultiplier("ORDINARY"), 1.25);
  check("rest day OT: 169% (130% x 130%)", overtimeMultiplier("REST_DAY"), 1.69);
  check("special non-working day OT: 169%", overtimeMultiplier("SPECIAL_NON_WORKING"), 1.69);
  check("special non-working + rest day OT: 195% (150% x 130%)", overtimeMultiplier("SPECIAL_NON_WORKING_REST_DAY"), 1.95);
  check("regular holiday OT: 260% (200% x 130%)", overtimeMultiplier("REGULAR_HOLIDAY"), 2.6);
  check("regular holiday + rest day OT: 338% (260% x 130%)", overtimeMultiplier("REGULAR_HOLIDAY_REST_DAY"), 3.38);

  // Night differential stacks multiplicatively on whatever rate already applies.
  check("night diff on an ordinary regular hour: 110%", nightDifferentialMultiplier(1.0), 1.1);
  check("night diff on an ordinary OT hour: 137.5% (125% x 110%)", nightDifferentialMultiplier(1.25), 1.375);
  check("night diff on a rest-day regular hour: 143% (130% x 110%)", nightDifferentialMultiplier(1.3), 1.43);

  // Day-type determination.
  check("no rest day, no holiday -> ORDINARY", determineDayType(false, null), "ORDINARY");
  check("rest day, no holiday -> REST_DAY", determineDayType(true, null), "REST_DAY");
  check("no rest day, regular holiday -> REGULAR_HOLIDAY", determineDayType(false, { type: "REGULAR" }), "REGULAR_HOLIDAY");
  check("rest day + regular holiday -> REGULAR_HOLIDAY_REST_DAY", determineDayType(true, { type: "REGULAR" }), "REGULAR_HOLIDAY_REST_DAY");
  check(
    "no rest day, special non-working -> SPECIAL_NON_WORKING",
    determineDayType(false, { type: "SPECIAL_NON_WORKING" }),
    "SPECIAL_NON_WORKING",
  );
  check(
    "rest day + special non-working -> SPECIAL_NON_WORKING_REST_DAY",
    determineDayType(true, { type: "SPECIAL_NON_WORKING" }),
    "SPECIAL_NON_WORKING_REST_DAY",
  );

  // Rate derivation — the configurable divisor is the whole point here.
  const rate22 = deriveRate(22000, 22);
  check("22,000/month over 22 working days = 1,000/day", rate22.dailyRate, 1000);
  check("1,000/day / 8 hours = 125/hour", rate22.hourlyRate, 125);

  const rate26 = deriveRate(22000, 26);
  check("same salary, 26-day divisor gives a different (lower) daily rate", rate26.dailyRate < rate22.dailyRate, true);
  check("26-day divisor: 22,000/26 ≈ 846.15/day", Math.round(rate26.dailyRate * 100) / 100, 846.15);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main();
