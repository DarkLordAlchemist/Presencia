// Pure "how's today going for this person" math — no I/O, no Prisma, so
// it's unit-testable without a database. Deliberately doesn't assume any
// particular number or length of breaks (one long lunch, lunch plus a
// break, lunch plus two half-breaks, ...) — it just walks whatever punches
// actually happened today and sums the real segments.

export interface DayProgressPunch {
  type: "TIME_IN" | "BREAK_OUT" | "BREAK_IN" | "TIME_OUT";
  timestamp: Date;
}

export interface DayProgress {
  /** Net time actually worked so far today, i.e. elapsed time minus every
   * break (completed or still ongoing). Live — keeps counting while
   * clocked in, frozen once TIME_OUT closes the last open shift. */
  workedMinutes: number;
  /** Sum of every break today, completed or (if currently on break) still
   * running. */
  totalBreakMinutes: number;
  /** Elapsed minutes of the break happening right now, or null if they're
   * not currently on break. */
  currentBreakMinutes: number | null;
}

/** "95 minutes" -> "1h 35m" (or "35m" under an hour, "0m" for zero). */
export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

export function computeDayProgress(punchesToday: DayProgressPunch[], now: Date): DayProgress {
  const sorted = [...punchesToday].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  let openTimeIn: Date | null = null;
  let openBreakOut: Date | null = null;
  let grossMs = 0;
  let totalBreakMs = 0;

  for (const p of sorted) {
    if (p.type === "TIME_IN") {
      openTimeIn = p.timestamp;
    } else if (p.type === "TIME_OUT") {
      if (openTimeIn) {
        grossMs += p.timestamp.getTime() - openTimeIn.getTime();
        openTimeIn = null;
      }
    } else if (p.type === "BREAK_OUT") {
      openBreakOut = p.timestamp;
    } else if (p.type === "BREAK_IN") {
      if (openBreakOut) {
        totalBreakMs += p.timestamp.getTime() - openBreakOut.getTime();
        openBreakOut = null;
      }
    }
  }

  let currentBreakMinutes: number | null = null;
  if (openBreakOut) {
    const liveBreakMs = now.getTime() - openBreakOut.getTime();
    totalBreakMs += liveBreakMs;
    currentBreakMinutes = Math.round(liveBreakMs / 60000);
  }
  // Gross elapsed time spans arrival to now (or to TIME_OUT) *including* any
  // break time embedded in it — that's why totalBreakMs is subtracted below
  // rather than gross being skipped while on break.
  if (openTimeIn) {
    grossMs += now.getTime() - openTimeIn.getTime();
  }

  return {
    workedMinutes: Math.max(0, Math.round((grossMs - totalBreakMs) / 60000)),
    totalBreakMinutes: Math.round(totalBreakMs / 60000),
    currentBreakMinutes,
  };
}
