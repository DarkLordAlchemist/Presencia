"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/dal";
import type { HolidayType } from "@/generated/prisma/client";

export interface FormState {
  error?: string;
}

const VALID_TYPES: HolidayType[] = ["REGULAR", "SPECIAL_NON_WORKING"];

export async function listHolidays() {
  return prisma.holiday.findMany({ orderBy: { date: "asc" } });
}

export async function createHoliday(_prevState: FormState, formData: FormData): Promise<FormState> {
  await requireRole("SUPER_ADMIN", "HR_ADMIN");

  const dateRaw = formData.get("date");
  const name = formData.get("name");
  const type = formData.get("type");

  if (typeof dateRaw !== "string" || !dateRaw) {
    return { error: "Please choose a date." };
  }
  const date = new Date(`${dateRaw}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    return { error: "That date isn't valid." };
  }
  if (typeof name !== "string" || name.trim().length === 0) {
    return { error: "Please name the holiday." };
  }
  if (typeof type !== "string" || !VALID_TYPES.includes(type as HolidayType)) {
    return { error: "Please choose a valid holiday type." };
  }

  const existing = await prisma.holiday.findUnique({ where: { date } });
  if (existing) {
    return { error: "A holiday is already recorded for that date." };
  }

  await prisma.holiday.create({ data: { date, name: name.trim(), type: type as HolidayType } });
  revalidatePath("/holidays");
  return {};
}

export async function deleteHoliday(holidayId: string) {
  await requireRole("SUPER_ADMIN", "HR_ADMIN");
  await prisma.holiday.delete({ where: { id: holidayId } }).catch(() => {});
  revalidatePath("/holidays");
}
