import "server-only";

// Best-effort reverse geocoding via OpenStreetMap's free Nominatim API — no
// API key needed. Deliberately called only once per actual recorded punch
// (never per idle kiosk scan attempt, which happens every couple of
// seconds) to respect Nominatim's usage policy (max ~1 req/sec, meant for
// occasional lookups). Never throws — a slow/unreachable geocoding service
// must never block a real clock-in from succeeding; callers just get null.
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`,
      {
        signal: controller.signal,
        headers: { "User-Agent": "Presentia-HR-Attendance/1.0" },
      },
    );
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.display_name === "string" ? data.display_name : null;
  } catch {
    return null;
  }
}
