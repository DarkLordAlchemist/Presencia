// Pure status-decision logic for the live "who's in" dashboard — kept
// separate from data-fetching so the decision rules themselves are
// unit-testable without a database.
import { manilaTimeOnDate } from "./compute";

export type AttendanceStatus =
  | "ON_LEAVE"
  | "ON_SITE"
  | "ON_BREAK"
  | "DONE_FOR_DAY"
  | "LATE"
  | "ABSENT"
  | "NOT_YET_DUE"
  | "REST_DAY";

export interface StatusInput {
  onApprovedLeaveToday: boolean;
  lastPunchTypeToday: "TIME_IN" | "BREAK_OUT" | "BREAK_IN" | "TIME_OUT" | null;
  schedule: { startTime: string; endTime: string } | null;
  now: Date;
  gracePeriodMinutes: number;
}

export function determineAttendanceStatus(input: StatusInput): AttendanceStatus {
  if (input.onApprovedLeaveToday) return "ON_LEAVE";

  switch (input.lastPunchTypeToday) {
    case "TIME_IN":
    case "BREAK_IN":
      return "ON_SITE";
    case "BREAK_OUT":
      return "ON_BREAK";
    case "TIME_OUT":
      return "DONE_FOR_DAY";
  }

  if (!input.schedule) return "REST_DAY";

  const dueBy = new Date(
    manilaTimeOnDate(input.schedule.startTime, input.now).getTime() + input.gracePeriodMinutes * 60000,
  );
  const shiftEnd = manilaTimeOnDate(input.schedule.endTime, input.now);

  if (input.now < dueBy) return "NOT_YET_DUE";
  if (input.now < shiftEnd) return "LATE";
  return "ABSENT";
}
