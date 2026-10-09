// Pure aggregation: turns a flat list of punches into per-employee totals
// for a pay period. No I/O — the caller fetches punches, this just does
// the math, so it can be unit-tested without a database.

export interface SummarizablePunch {
  userId: string;
  userName: string;
  type: "TIME_IN" | "BREAK_OUT" | "BREAK_IN" | "TIME_OUT";
  timestamp: Date;
  lateMinutes: number | null;
  undertimeMinutes: number | null;
  overtimeMinutes: number | null;
  nightDiffMinutes: number | null;
  breakMinutes: number | null;
  manualEntry?: boolean;
}

export interface EmployeePayrollSummary {
  userId: string;
  userName: string;
  shiftsCompleted: number;
  regularMinutes: number;
  overtimeMinutes: number;
  nightDiffMinutes: number;
  lateMinutes: number;
  undertimeMinutes: number;
  /** How many of this employee's punches in the period were approved manual
   * corrections rather than a real face-scan — visible so payroll review
   * can see where biometric verification was bypassed via approval. */
  manualEntryCount: number;
}

/**
 * Walks each employee's punches in timestamp order, pairing every TIME_IN
 * with the next TIME_OUT that follows it. An unmatched trailing TIME_IN
 * (shift not yet closed out) is simply not counted — there's nothing to
 * total until it's closed, deliberately not guessed at.
 */
export function summarizeForPayroll(punches: SummarizablePunch[]): EmployeePayrollSummary[] {
  const byUser = new Map<string, SummarizablePunch[]>();
  for (const p of punches) {
    if (!byUser.has(p.userId)) byUser.set(p.userId, []);
    byUser.get(p.userId)!.push(p);
  }

  const summaries: EmployeePayrollSummary[] = [];

  for (const [userId, userPunches] of byUser) {
    const sorted = [...userPunches].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    const summary: EmployeePayrollSummary = {
      userId,
      userName: sorted[0].userName,
      shiftsCompleted: 0,
      regularMinutes: 0,
      overtimeMinutes: 0,
      nightDiffMinutes: 0,
      lateMinutes: 0,
      undertimeMinutes: 0,
      manualEntryCount: 0,
    };

    let openTimeIn: SummarizablePunch | null = null;
    let breakMinutesInShift = 0;
    for (const p of sorted) {
      if (p.manualEntry) summary.manualEntryCount += 1;
      if (p.type === "TIME_IN") {
        openTimeIn = p;
        breakMinutesInShift = 0;
        summary.lateMinutes += p.lateMinutes ?? 0;
      } else if (p.type === "BREAK_IN" && openTimeIn) {
        breakMinutesInShift += p.breakMinutes ?? 0;
      } else if (p.type === "TIME_OUT" && openTimeIn) {
        const grossMinutes = Math.round((p.timestamp.getTime() - openTimeIn.timestamp.getTime()) / 60000);
        const overtime = p.overtimeMinutes ?? 0;
        const nightDiff = p.nightDiffMinutes ?? 0;
        const workedMinutes = Math.max(0, grossMinutes - breakMinutesInShift);
        summary.regularMinutes += Math.max(0, workedMinutes - overtime);
        summary.overtimeMinutes += overtime;
        summary.nightDiffMinutes += nightDiff;
        summary.undertimeMinutes += p.undertimeMinutes ?? 0;
        summary.shiftsCompleted += 1;
        openTimeIn = null;
        breakMinutesInShift = 0;
      }
    }

    summaries.push(summary);
  }

  return summaries.sort((a, b) => a.userName.localeCompare(b.userName));
}
