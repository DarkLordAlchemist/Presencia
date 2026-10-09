import type { PunchType } from "@/generated/prisma/client";

export const TYPE_LABELS: Record<PunchType, string> = {
  TIME_IN: "Time In",
  BREAK_OUT: "Break Out",
  BREAK_IN: "Break In",
  TIME_OUT: "Time Out",
};

export const VALID_TYPES: PunchType[] = ["TIME_IN", "BREAK_OUT", "BREAK_IN", "TIME_OUT"];
