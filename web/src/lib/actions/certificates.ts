"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, requireRole } from "@/lib/auth/dal";
import { logAudit } from "@/lib/audit";
import type { CertificatePurpose } from "@/generated/prisma/client";

export interface FormState {
  error?: string;
  success?: boolean;
}

const VALID_PURPOSES: CertificatePurpose[] = ["GENERAL", "GOVERNMENT_TRANSACTION", "BANK_LOAN", "VISA_TRAVEL"];

/** Employees list for the "request on behalf of" picker — HR/Admin only,
 * an EMPLOYEE always requests for themselves. */
export async function getCertificateEligibleUsers() {
  const user = await getCurrentUser();
  if (!["SUPER_ADMIN", "HR_ADMIN"].includes(user.role)) return [];
  return prisma.user.findMany({
    where: { role: { not: "KIOSK" }, active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

export async function requestCertificate(_prevState: FormState, formData: FormData): Promise<FormState> {
  const requester = await requireRole("SUPER_ADMIN", "HR_ADMIN", "MANAGER", "EMPLOYEE");

  const purpose = formData.get("purpose");
  const notes = formData.get("notes");
  const targetUserIdRaw = formData.get("userId");

  if (typeof purpose !== "string" || !VALID_PURPOSES.includes(purpose as CertificatePurpose)) {
    return { error: "Please choose a valid purpose." };
  }

  // Only HR/Admin can file on someone else's behalf (needed for a resigned
  // employee, who can no longer log in once deactivated) — anyone else's
  // request is always for themselves, regardless of what a form field says.
  const canRequestForOthers = ["SUPER_ADMIN", "HR_ADMIN"].includes(requester.role);
  const targetUserId =
    canRequestForOthers && typeof targetUserIdRaw === "string" && targetUserIdRaw.length > 0
      ? targetUserIdRaw
      : requester.id;

  const target = await prisma.user.findUnique({ where: { id: targetUserId } });
  if (!target) {
    return { error: "That employee no longer exists." };
  }
  if (!target.active) {
    return { error: "Certificates can only be requested for active employees." };
  }
  if (!target.jobTitle || !target.dateHired || !target.employmentStatus) {
    return { error: "This employee's onboarding record isn't complete yet — HR needs to finish onboarding first." };
  }

  await prisma.certificateRequest.create({
    data: {
      userId: targetUserId,
      purpose: purpose as CertificatePurpose,
      notes: typeof notes === "string" && notes.trim().length > 0 ? notes.trim() : null,
    },
  });

  revalidatePath("/certificates");
  return { success: true };
}

/** Approval snapshots the employee's HR record right now — a COE is a
 * point-in-time document and must not silently change if the employee's
 * onboarding record is edited afterward. */
export async function reviewCertificateRequest(requestId: string, decision: "APPROVED" | "REJECTED") {
  const reviewer = await requireRole("SUPER_ADMIN", "HR_ADMIN");

  const request = await prisma.certificateRequest.findUnique({
    where: { id: requestId },
    include: { user: true },
  });
  if (!request || request.status !== "PENDING") return;

  if (decision === "APPROVED") {
    const u = request.user;
    if (!u.jobTitle || !u.dateHired || !u.employmentStatus) return; // shouldn't happen — checked at request time too

    await prisma.certificateRequest.update({
      where: { id: requestId },
      data: {
        status: "APPROVED",
        reviewedById: reviewer.id,
        reviewedAt: new Date(),
        snapshotJobTitle: u.jobTitle,
        snapshotDepartment: u.department,
        snapshotDateHired: u.dateHired,
        snapshotEmploymentStatus: u.employmentStatus,
        snapshotCompensation: u.monthlyCompensation,
        snapshotBenefits: u.benefits,
      },
    });
    await logAudit({
      actorId: reviewer.id,
      action: "CERTIFICATE_APPROVED",
      targetType: "CertificateRequest",
      targetId: requestId,
      after: { purpose: request.purpose, forUserId: request.userId },
    });
  } else {
    await prisma.certificateRequest.update({
      where: { id: requestId },
      data: { status: "REJECTED", reviewedById: reviewer.id, reviewedAt: new Date() },
    });
    await logAudit({
      actorId: reviewer.id,
      action: "CERTIFICATE_REJECTED",
      targetType: "CertificateRequest",
      targetId: requestId,
    });
  }

  revalidatePath("/certificates");
}

export async function getMyCertificateRequests() {
  const user = await getCurrentUser();
  return prisma.certificateRequest.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });
}

export async function getPendingCertificateRequests() {
  const user = await getCurrentUser();
  if (!["SUPER_ADMIN", "HR_ADMIN"].includes(user.role)) return [];
  return prisma.certificateRequest.findMany({
    where: { status: "PENDING" },
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
}

/** Returns null for both "not found" and "not allowed" — deliberately not
 * distinguishing the two to an unauthorized viewer. */
export async function getCertificateForView(requestId: string) {
  const user = await getCurrentUser();
  const request = await prisma.certificateRequest.findUnique({
    where: { id: requestId },
    include: { user: true },
  });
  if (!request) return null;
  const canView = request.userId === user.id || ["SUPER_ADMIN", "HR_ADMIN"].includes(user.role);
  if (!canView) return null;
  return request;
}
