"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/dal";
import type { EmploymentStatus } from "@/generated/prisma/client";

export interface FormState {
  error?: string;
  success?: boolean;
}

const VALID_STATUSES: EmploymentStatus[] = ["PROBATIONARY", "REGULAR", "CONTRACTUAL", "PROJECT_BASED"];

export async function getOnboardingCandidates() {
  await requireRole("SUPER_ADMIN", "HR_ADMIN");
  return prisma.user.findMany({
    where: { role: { not: "KIOSK" } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, role: true, active: true, onboardedAt: true },
  });
}

export async function getOnboardingRecord(userId: string) {
  await requireRole("SUPER_ADMIN", "HR_ADMIN");
  return prisma.user.findUnique({ where: { id: userId } });
}

export async function updateOnboarding(_prevState: FormState, formData: FormData): Promise<FormState> {
  await requireRole("SUPER_ADMIN", "HR_ADMIN");

  const userId = formData.get("userId");
  if (typeof userId !== "string" || userId.length === 0) {
    return { error: "No employee selected." };
  }

  const jobTitle = formData.get("jobTitle");
  const department = formData.get("department");
  const jobDescription = formData.get("jobDescription");
  const dateHiredRaw = formData.get("dateHired");
  const employmentStatus = formData.get("employmentStatus");
  const monthlyCompensationRaw = formData.get("monthlyCompensation");
  const benefits = formData.get("benefits");

  if (typeof jobTitle !== "string" || jobTitle.trim().length === 0) {
    return { error: "Job title is required." };
  }
  if (typeof dateHiredRaw !== "string" || dateHiredRaw.length === 0) {
    return { error: "Date hired is required." };
  }
  const dateHired = new Date(dateHiredRaw);
  if (Number.isNaN(dateHired.getTime())) {
    return { error: "Date hired is not a valid date." };
  }
  if (typeof employmentStatus !== "string" || !VALID_STATUSES.includes(employmentStatus as EmploymentStatus)) {
    return { error: "Please choose a valid employment status." };
  }
  let monthlyCompensation: number | null = null;
  if (typeof monthlyCompensationRaw === "string" && monthlyCompensationRaw.trim().length > 0) {
    monthlyCompensation = Number(monthlyCompensationRaw);
    if (Number.isNaN(monthlyCompensation) || monthlyCompensation < 0) {
      return { error: "Monthly compensation must be a non-negative number." };
    }
  }

  const existing = await prisma.user.findUnique({ where: { id: userId } });
  if (!existing) {
    return { error: "That user no longer exists." };
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      jobTitle: jobTitle.trim(),
      department: typeof department === "string" && department.trim() ? department.trim() : null,
      jobDescription: typeof jobDescription === "string" && jobDescription.trim() ? jobDescription.trim() : null,
      dateHired,
      employmentStatus: employmentStatus as EmploymentStatus,
      monthlyCompensation,
      benefits: typeof benefits === "string" && benefits.trim() ? benefits.trim() : null,
      onboardedAt: existing.onboardedAt ?? new Date(),
    },
  });

  revalidatePath("/onboarding");
  revalidatePath(`/onboarding/${userId}`);
  return { success: true };
}
