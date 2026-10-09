// Pure unit tests for src/lib/attendance/geo.ts — no DB, no browser.
import { haversineDistanceMeters, isIpAllowed } from "../src/lib/attendance/geo";

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

function approx(label: string, actual: number, expected: number, toleranceMeters: number) {
  const ok = Math.abs(actual - expected) <= toleranceMeters;
  if (ok) {
    passed++;
    console.log(`PASS: ${label}`);
  } else {
    failed++;
    console.log(`FAIL: ${label} — expected ~${expected}m (+/-${toleranceMeters}), got ${actual.toFixed(1)}m`);
  }
}

function main() {
  check("same point is zero distance", haversineDistanceMeters(14.5995, 120.9842, 14.5995, 120.9842), 0);

  // Manila (Rizal Park) to Makati (Ayala Triangle), cross-checked against
  // an independent haversine calculator — real-world sanity check on top
  // of the "1 degree of latitude" check below, which verifies the formula
  // itself against a value computable by hand.
  approx(
    "Manila to Makati is roughly 5.5km",
    haversineDistanceMeters(14.5832, 120.9794, 14.5573, 121.0227),
    5478,
    100,
  );

  // 1 degree of latitude is ~111km everywhere.
  approx("1 degree of latitude is ~111km", haversineDistanceMeters(0, 0, 1, 0), 111000, 2000);

  check("no IP is never allowed, even with a configured list", isIpAllowed(null, "192.168.1."), false);
  check("no configured list is never allowed, even with a real IP", isIpAllowed("192.168.1.5", null), false);
  check("empty configured list is never allowed", isIpAllowed("192.168.1.5", ""), false);
  check("exact IP match is allowed", isIpAllowed("203.0.113.9", "203.0.113.9"), true);
  check("prefix match is allowed", isIpAllowed("192.168.1.42", "192.168.1."), true);
  check("non-matching IP is not allowed", isIpAllowed("10.0.0.5", "192.168.1."), false);
  check(
    "matches any entry in a multi-entry allowlist",
    isIpAllowed("10.0.0.5", "192.168.1., 10.0.0."),
    true,
  );

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main();
