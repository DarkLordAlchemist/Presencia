"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, requireRole } from "@/lib/auth/dal";
import { logAudit } from "@/lib/audit";
import type { ShiftRequestType } from "@/generated/prisma/client";

export interface FormState {
  error?: string;
}

const VALID_TYPES: ShiftRequestType[] = ["OVERTIME", "SWAP"];

export async function requestShiftChange(_prevState: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("SUPER_ADMIN", "HR_ADMIN", "MANAGER", "EMPLOYEE");

  const type = formData.get("type");
  const targetDateRaw = formData.get("targetDate");
  const details = formData.get("details");

  if (typeof type !== "string" || !VALID_TYPES.includes(type as ShiftRequestType)) {
    return { error: "Please choose a valid request type." };
  }
  if (typeof targetDateRaw !== "string" || !targetDateRaw) {
    return { error: "Please choose a date." };
  }
  if (typeof details !== "string" || details.trim().length === 0) {
    return { error: "Please describe the request." };
  }

  await prisma.shiftRequest.create({
    data: {
      userId: user.id,
      type: type as ShiftRequestType,
      targetDate: new Date(targetDateRaw),
      details: details.trim(),
    },
  });

  revalidatePath("/leave");
  return {};
}

export async function reviewShiftRequest(requestId: string, decision: "APPROVED" | "REJECTED") {
  const reviewer = await requireRole("SUPER_ADMIN", "HR_ADMIN", "MANAGER");

  const request = await prisma.shiftRequest.findUnique({
    where: { id: requestId },
    include: { user: true },
  });
  if (!request || request.status !== "PENDING") return;

  if (reviewer.role === "MANAGER" && request.user.managerId !== reviewer.id) {
    return;
  }

  await prisma.shiftRequest.update({
    where: { id: requestId },
    data: { status: decision, reviewedById: reviewer.id, reviewedAt: new Date() },
  });

  await logAudit({
    actorId: reviewer.id,
    action: `SHIFT_REQUEST_${decision}`,
    targetType: "ShiftRequest",
    targetId: requestId,
    before: { status: "PENDING" },
    after: { status: decision },
  });

  revalidatePath("/leave");
}

export async function getMyShiftRequests() {
  const user = await getCurrentUser();
  return prisma.shiftRequest.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });
}

export async function getPendingShiftRequests() {
  const user = await getCurrentUser();
  if (!["SUPER_ADMIN", "HR_ADMIN", "MANAGER"].includes(user.role)) return [];
  return prisma.shiftRequest.findMany({
    where: {
      status: "PENDING",
      user: user.role === "MANAGER" ? { managerId: user.id } : undefined,
    },
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
}
