"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole, getCurrentUser } from "@/lib/auth/dal";
import type { ShiftType } from "@/generated/prisma/client";

export interface FormState {
  error?: string;
}

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const VALID_DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const VALID_SHIFT_TYPES: ShiftType[] = ["FIXED", "FLEXIBLE", "ROTATING"];

export async function createSchedule(_prevState: FormState, formData: FormData): Promise<FormState> {
  const currentUser = await requireRole("SUPER_ADMIN", "HR_ADMIN", "MANAGER");

  // Group assignment: one submission can target several people at once
  // (e.g. an entire rotating-shift group), not just one employee.
  const userIds = formData.getAll("userIds").filter((v): v is string => typeof v === "string" && v.length > 0);
  const startTime = formData.get("startTime");
  const endTime = formData.get("endTime");
  const days = formData.getAll("days").filter((d): d is string => typeof d === "string");
  const shiftType = formData.get("shiftType");
  const validFromRaw = formData.get("validFrom");
  const validToRaw = formData.get("validTo");

  if (userIds.length === 0) {
    return { error: "Please choose at least one person." };
  }
  if (typeof startTime !== "string" || !TIME_RE.test(startTime)) {
    return { error: "Please enter a valid start time." };
  }
  if (typeof endTime !== "string" || !TIME_RE.test(endTime)) {
    return { error: "Please enter a valid end time." };
  }
  if (days.length === 0 || !days.every((d) => VALID_DAYS.includes(d))) {
    return { error: "Please choose at least one valid day." };
  }
  if (typeof shiftType !== "string" || !VALID_SHIFT_TYPES.includes(shiftType as ShiftType)) {
    return { error: "Please choose a valid shift type." };
  }
  const validFrom = typeof validFromRaw === "string" && validFromRaw.length > 0 ? new Date(validFromRaw) : null;
  const validTo = typeof validToRaw === "string" && validToRaw.length > 0 ? new Date(validToRaw) : null;
  if (validFrom && validTo && validFrom > validTo) {
    return { error: "The valid-from date must be before the valid-to date." };
  }

  const targets = await prisma.user.findMany({ where: { id: { in: userIds } } });
  if (targets.length !== userIds.length) {
    return { error: "One or more selected users no longer exist." };
  }

  // A Manager may only schedule their own direct reports, never company-wide.
  if (currentUser.role === "MANAGER" && targets.some((t) => t.managerId !== currentUser.id)) {
    return { error: "You can only set schedules for your own direct reports." };
  }

  await prisma.schedule.createMany({
    data: targets.map((t) => ({
      userId: t.id,
      startTime,
      endTime,
      daysOfWeek: days.join(","),
      shiftType: shiftType as ShiftType,
      validFrom,
      validTo,
    })),
  });

  revalidatePath("/schedules");
  return {};
}

export async function deleteSchedule(scheduleId: string) {
  const currentUser = await requireRole("SUPER_ADMIN", "HR_ADMIN", "MANAGER");

  const schedule = await prisma.schedule.findUnique({
    where: { id: scheduleId },
    include: { user: true },
  });
  if (!schedule) return;

  if (currentUser.role === "MANAGER" && schedule.user.managerId !== currentUser.id) {
    return;
  }

  await prisma.schedule.delete({ where: { id: scheduleId } });
  revalidatePath("/schedules");
}

export async function getScheduleTargets() {
  const currentUser = await getCurrentUser();
  if (currentUser.role === "MANAGER") {
    return prisma.user.findMany({
      where: { managerId: currentUser.id, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });
  }
  return prisma.user.findMany({
    where: { role: { not: "KIOSK" }, active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}
