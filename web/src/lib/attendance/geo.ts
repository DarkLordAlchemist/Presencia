// Pure geo/network helpers — no I/O, unit-testable directly.

const EARTH_RADIUS_METERS = 6371000;

/** Great-circle distance between two lat/lng points, in meters. */
export function haversineDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
}

/**
 * Checks a client IP against a comma-separated list of allowed exact IPs or
 * dotted-prefix patterns (e.g. "192.168.1." matches any 192.168.1.x). Empty/
 * unset allowlist or unknown IP is never treated as allowed — fail closed.
 */
export function isIpAllowed(ip: string | null, allowedPrefixesCsv: string | null): boolean {
  if (!ip || !allowedPrefixesCsv) return false;
  const prefixes = allowedPrefixesCsv
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  return prefixes.some((prefix) => ip === prefix || ip.startsWith(prefix));
}
