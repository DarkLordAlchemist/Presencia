"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, requireRole } from "@/lib/auth/dal";
import { logAudit } from "@/lib/audit";
import { computeFlagsForPunch } from "@/lib/attendance/flags";
import { isDateInLockedPeriod } from "@/lib/actions/pay-periods";
import type { PunchType } from "@/generated/prisma/client";

export interface FormState {
  error?: string;
}

const VALID_TYPES: PunchType[] = ["TIME_IN", "BREAK_OUT", "BREAK_IN", "TIME_OUT"];

export async function requestCorrection(_prevState: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("SUPER_ADMIN", "HR_ADMIN", "MANAGER", "EMPLOYEE");

  const punchId = formData.get("punchId");
  const requestedType = formData.get("requestedType");
  const requestedTimeRaw = formData.get("requestedTime");
  const reason = formData.get("reason");

  const hasPunchId = typeof punchId === "string" && punchId.length > 0;

  if (!hasPunchId && (typeof requestedType !== "string" || !VALID_TYPES.includes(requestedType as PunchType))) {
    return { error: "Please choose which punch type is missing." };
  }
  if (typeof requestedTimeRaw !== "string" || !requestedTimeRaw) {
    return { error: "Please choose the correct date/time." };
  }
  if (typeof reason !== "string" || reason.trim().length === 0) {
    return { error: "Please explain what happened." };
  }

  if (hasPunchId) {
    const punch = await prisma.punch.findUnique({ where: { id: punchId as string } });
    if (!punch || punch.userId !== user.id) {
      return { error: "That punch was not found on your own record." };
    }
  }

  await prisma.correctionRequest.create({
    data: {
      userId: user.id,
      punchId: hasPunchId ? (punchId as string) : null,
      requestedType: hasPunchId ? null : (requestedType as PunchType),
      requestedTime: new Date(requestedTimeRaw),
      reason: reason.trim(),
    },
  });

  revalidatePath("/corrections");
  return {};
}

export async function reviewCorrection(requestId: string, decision: "APPROVED" | "REJECTED") {
  const reviewer = await requireRole("SUPER_ADMIN", "HR_ADMIN", "MANAGER");

  const request = await prisma.correctionRequest.findUnique({
    where: { id: requestId },
    include: { user: true, punch: true },
  });
  if (!request || request.status !== "PENDING") return;

  if (reviewer.role === "MANAGER" && request.user.managerId !== reviewer.id) {
    return;
  }

  if (decision === "APPROVED") {
    if (await isDateInLockedPeriod(request.requestedTime)) {
      // Cutoff locking wins even over an otherwise-valid approval — the
      // reviewer must reopen the pay period first if this really needs to change.
      return;
    }

    const config = await prisma.systemConfig.findFirst();
    if (!config) return;

    if (request.punchId && request.punch) {
      const before = { timestamp: request.punch.timestamp, ...extractFlags(request.punch) };
      const flags = await computeFlagsForPunch(
        request.userId,
        request.punch.type,
        request.requestedTime,
        config,
        request.punchId,
      );
      await prisma.punch.update({
        where: { id: request.punchId },
        data: { timestamp: request.requestedTime, manualEntry: true, ...clearedFlags(), ...flags },
      });
      await logAudit({
        actorId: reviewer.id,
        action: "CORRECTION_APPROVED_EDIT",
        targetType: "Punch",
        targetId: request.punchId,
        reason: request.reason,
        before,
        after: { timestamp: request.requestedTime, ...flags },
      });
    } else if (request.requestedType) {
      const flags = await computeFlagsForPunch(request.userId, request.requestedType, request.requestedTime, config);
      const created = await prisma.punch.create({
        data: {
          userId: request.userId,
          type: request.requestedType,
          timestamp: request.requestedTime,
          confidence: 1.0,
          livenessPassed: true,
          manualEntry: true,
          ...flags,
        },
      });
      await logAudit({
        actorId: reviewer.id,
        action: "CORRECTION_APPROVED_ADD",
        targetType: "Punch",
        targetId: created.id,
        reason: request.reason,
        after: { type: request.requestedType, timestamp: request.requestedTime, ...flags },
      });
    }
  }

  await prisma.correctionRequest.update({
    where: { id: requestId },
    data: { status: decision, reviewedById: reviewer.id, reviewedAt: new Date() },
  });

  if (decision === "REJECTED") {
    await logAudit({
      actorId: reviewer.id,
      action: "CORRECTION_REJECTED",
      targetType: "CorrectionRequest",
      targetId: requestId,
      reason: request.reason,
    });
  }

  revalidatePath("/corrections");
}

function extractFlags(punch: {
  lateMinutes: number | null;
  undertimeMinutes: number | null;
  overtimeMinutes: number | null;
  nightDiffMinutes: number | null;
  breakMinutes: number | null;
  overBreak: boolean | null;
}) {
  return {
    lateMinutes: punch.lateMinutes,
    undertimeMinutes: punch.undertimeMinutes,
    overtimeMinutes: punch.overtimeMinutes,
    nightDiffMinutes: punch.nightDiffMinutes,
    breakMinutes: punch.breakMinutes,
    overBreak: punch.overBreak,
  };
}

// Reset every flag to null before applying the freshly recomputed subset —
// otherwise a punch corrected from one type-relevant flag set to another
// could keep a stale flag from its old timestamp's computation.
function clearedFlags() {
  return {
    lateMinutes: null,
    undertimeMinutes: null,
    overtimeMinutes: null,
    nightDiffMinutes: null,
    breakMinutes: null,
    overBreak: null,
  };
}

export async function getMyCorrectionRequests() {
  const user = await getCurrentUser();
  return prisma.correctionRequest.findMany({
    where: { userId: user.id },
    include: { punch: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function getPendingCorrectionRequests() {
  const user = await getCurrentUser();
  if (!["SUPER_ADMIN", "HR_ADMIN", "MANAGER"].includes(user.role)) return [];
  return prisma.correctionRequest.findMany({
    where: {
      status: "PENDING",
      user: user.role === "MANAGER" ? { managerId: user.id } : undefined,
    },
    include: { user: { select: { name: true } }, punch: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function getMyRecentPunches() {
  const user = await getCurrentUser();
  return prisma.punch.findMany({
    where: { userId: user.id },
    orderBy: { timestamp: "desc" },
    take: 20,
  });
}
