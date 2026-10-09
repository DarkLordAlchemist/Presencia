import "server-only";
import { prisma } from "@/lib/prisma";
import {
  computeLateMinutes,
  computeUndertimeMinutes,
  computeOvertimeMinutes,
  computeNightDiffMinutes,
  computeBreakMinutes,
  manilaDayAbbreviation,
} from "@/lib/attendance/compute";
import type { PunchType, SystemConfig } from "@/generated/prisma/client";

export interface PunchFlags {
  lateMinutes?: number;
  undertimeMinutes?: number;
  overtimeMinutes?: number;
  nightDiffMinutes?: number;
  breakMinutes?: number;
  overBreak?: boolean;
}

export async function findScheduleFor(userId: string, at: Date) {
  const day = manilaDayAbbreviation(at);
  return prisma.schedule.findFirst({
    where: {
      userId,
      daysOfWeek: { contains: day },
      OR: [{ validFrom: null }, { validFrom: { lte: at } }],
      AND: [{ OR: [{ validTo: null }, { validTo: { gte: at } }] }],
    },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Shared by both the live kiosk clock-in path and approved timesheet
 * corrections, so a manually-added/edited punch gets the same
 * late/undertime/overtime/night-diff/break math as a real scan — never a
 * second, looser code path. `excludePunchId` matters when re-computing an
 * existing punch being corrected, so it doesn't match against itself when
 * looking up the paired TIME_IN/BREAK_OUT.
 */
export async function computeFlagsForPunch(
  userId: string,
  type: PunchType,
  at: Date,
  config: SystemConfig,
  excludePunchId?: string,
): Promise<PunchFlags> {
  const schedule = await findScheduleFor(userId, at);
  const flags: PunchFlags = {};

  if (type === "TIME_IN" && schedule) {
    flags.lateMinutes = computeLateMinutes(schedule.startTime, at, config.gracePeriodMinutes);
  } else if (type === "TIME_OUT" && schedule) {
    flags.undertimeMinutes = computeUndertimeMinutes(schedule.endTime, at);
    flags.overtimeMinutes = computeOvertimeMinutes(schedule.endTime, at, config.gracePeriodMinutes);
    const shiftStart = await prisma.punch.findFirst({
      where: {
        userId,
        type: "TIME_IN",
        timestamp: { lt: at },
        ...(excludePunchId ? { id: { not: excludePunchId } } : {}),
      },
      orderBy: { timestamp: "desc" },
    });
    if (shiftStart) {
      flags.nightDiffMinutes = computeNightDiffMinutes(shiftStart.timestamp, at, config.nightDiffStart, config.nightDiffEnd);
    }
  } else if (type === "BREAK_IN") {
    const breakStart = await prisma.punch.findFirst({
      where: {
        userId,
        type: "BREAK_OUT",
        timestamp: { lt: at },
        ...(excludePunchId ? { id: { not: excludePunchId } } : {}),
      },
      orderBy: { timestamp: "desc" },
    });
    if (breakStart) {
      flags.breakMinutes = computeBreakMinutes(breakStart.timestamp, at);
      flags.overBreak = flags.breakMinutes > config.maxBreakMinutes;
    }
  }

  return flags;
}
