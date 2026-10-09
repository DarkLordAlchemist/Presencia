"use client";

import { useEffect, useState } from "react";
import { formatMinutes } from "@/lib/attendance/day-progress";

const TICK_MS = 15000;

/** Ticks a minutes count up in real time from a server-computed baseline —
 * anchored to server wall-clock time (asOfMs), not a client-side countdown,
 * so it stays correct regardless of how long the tab's been open. */
function useLiveMinutes(baseMinutes: number, asOfMs: number): number {
  const [minutes, setMinutes] = useState(baseMinutes);
  useEffect(() => {
    const tick = () => setMinutes(baseMinutes + Math.floor((Date.now() - asOfMs) / 60000));
    tick();
    const id = setInterval(tick, TICK_MS);
    return () => clearInterval(id);
  }, [baseMinutes, asOfMs]);
  return minutes;
}

/** "Worked today" ticks only while actively on-site (not on break, not done
 * for the day) — worked time genuinely doesn't grow during a break, so
 * freezing it then is correct, not a limitation. */
export function LiveWorkedMinutes({ baseMinutes, asOfMs }: { baseMinutes: number; asOfMs: number }) {
  return <>{formatMinutes(useLiveMinutes(baseMinutes, asOfMs))}</>;
}

/** The break cell while a break is actually in progress: ticks the current
 * break's duration, and re-evaluates the "Over break" badge live too, since
 * a break that started under budget can cross it while the page sits open. */
export function LiveBreakCell({
  completedBreakMinutes,
  currentBreakBaseMinutes,
  asOfMs,
  maxDailyBreakMinutes,
}: {
  completedBreakMinutes: number;
  currentBreakBaseMinutes: number;
  asOfMs: number;
  maxDailyBreakMinutes: number;
}) {
  const currentBreakMinutes = useLiveMinutes(currentBreakBaseMinutes, asOfMs);
  const overDailyBreak = completedBreakMinutes + currentBreakMinutes > maxDailyBreakMinutes;

  return (
    <>
      <span className="text-zinc-700 dark:text-zinc-300">{formatMinutes(currentBreakMinutes)} so far</span>
      {overDailyBreak && (
        <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800 dark:bg-red-900 dark:text-red-200">
          Over break
        </span>
      )}
    </>
  );
}
