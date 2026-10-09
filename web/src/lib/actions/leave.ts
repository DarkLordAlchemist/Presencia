"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, requireRole } from "@/lib/auth/dal";
import { logAudit } from "@/lib/audit";
import type { LeaveType } from "@/generated/prisma/client";

export interface FormState {
  error?: string;
}

const VALID_LEAVE_TYPES: LeaveType[] = ["VACATION", "SICK", "EMERGENCY", "OFFICIAL_BUSINESS", "OTHER"];

export async function requestLeave(_prevState: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("SUPER_ADMIN", "HR_ADMIN", "MANAGER", "EMPLOYEE");

  const type = formData.get("type");
  const startDateRaw = formData.get("startDate");
  const endDateRaw = formData.get("endDate");
  const reason = formData.get("reason");

  if (typeof type !== "string" || !VALID_LEAVE_TYPES.includes(type as LeaveType)) {
    return { error: "Please choose a valid leave type." };
  }
  if (typeof startDateRaw !== "string" || typeof endDateRaw !== "string" || !startDateRaw || !endDateRaw) {
    return { error: "Please choose a start and end date." };
  }
  const startDate = new Date(startDateRaw);
  const endDate = new Date(endDateRaw);
  if (startDate > endDate) {
    return { error: "The start date must be before the end date." };
  }
  if (typeof reason !== "string" || reason.trim().length === 0) {
    return { error: "Please give a reason." };
  }

  await prisma.leaveRequest.create({
    data: { userId: user.id, type: type as LeaveType, startDate, endDate, reason: reason.trim() },
  });

  revalidatePath("/leave");
  return {};
}

export async function reviewLeave(requestId: string, decision: "APPROVED" | "REJECTED") {
  const reviewer = await requireRole("SUPER_ADMIN", "HR_ADMIN", "MANAGER");

  const request = await prisma.leaveRequest.findUnique({
    where: { id: requestId },
    include: { user: true },
  });
  if (!request || request.status !== "PENDING") return;

  if (reviewer.role === "MANAGER" && request.user.managerId !== reviewer.id) {
    return; // a Manager may only review their own reports' requests
  }

  await prisma.leaveRequest.update({
    where: { id: requestId },
    data: { status: decision, reviewedById: reviewer.id, reviewedAt: new Date() },
  });

  await logAudit({
    actorId: reviewer.id,
    action: `LEAVE_${decision}`,
    targetType: "LeaveRequest",
    targetId: requestId,
    before: { status: "PENDING" },
    after: { status: decision },
  });

  revalidatePath("/leave");
}

export async function getMyLeaveRequests() {
  const user = await getCurrentUser();
  return prisma.leaveRequest.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });
}

export async function getPendingLeaveRequests() {
  const user = await getCurrentUser();
  if (!["SUPER_ADMIN", "HR_ADMIN", "MANAGER"].includes(user.role)) return [];
  return prisma.leaveRequest.findMany({
    where: {
      status: "PENDING",
      user: user.role === "MANAGER" ? { managerId: user.id } : undefined,
    },
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
}

/** Used by the who's-in dashboard to distinguish "on leave" from "absent". */
export async function isOnApprovedLeaveToday(userId: string, now: Date) {
  const count = await prisma.leaveRequest.count({
    where: { userId, status: "APPROVED", startDate: { lte: now }, endDate: { gte: now } },
  });
  return count > 0;
}
