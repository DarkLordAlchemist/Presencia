"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, requireRole } from "@/lib/auth/dal";
import { logAudit } from "@/lib/audit";
import { findScheduleFor } from "@/lib/attendance/flags";
import { manilaDayAbbreviation, manilaDateKey } from "@/lib/attendance/compute";
import { deriveRate } from "@/lib/payroll/rates";
import { computeSuggestedPayslip, type ShiftForPayroll } from "@/lib/payroll/payslip-compute";
import type { PayComponentCategory } from "@/generated/prisma/client";

export interface FormState {
  error?: string;
}

async function buildShiftsForPeriod(
  userId: string,
  startDate: Date,
  endDate: Date,
): Promise<{ shifts: ShiftForPayroll[]; lateMinutesTotal: number; undertimeMinutesTotal: number }> {
  const punches = await prisma.punch.findMany({
    where: { userId, timestamp: { gte: startDate, lte: endDate } },
    orderBy: { timestamp: "asc" },
  });

  const shifts: ShiftForPayroll[] = [];
  let openTimeIn: (typeof punches)[number] | null = null;
  let breakMinutesInShift = 0;
  let lateMinutesTotal = 0;
  let undertimeMinutesTotal = 0;

  for (const p of punches) {
    if (p.type === "TIME_IN") {
      openTimeIn = p;
      breakMinutesInShift = 0;
      lateMinutesTotal += p.lateMinutes ?? 0;
    } else if (p.type === "BREAK_IN") {
      breakMinutesInShift += p.breakMinutes ?? 0;
    } else if (p.type === "TIME_OUT" && openTimeIn) {
      undertimeMinutesTotal += p.undertimeMinutes ?? 0;
      // Resolved per-shift, not once for the whole period — a rotating
      // schedule can have different scheduled days on different dates.
      const schedule = await findScheduleFor(userId, openTimeIn.timestamp);
      const dayAbbrev = manilaDayAbbreviation(openTimeIn.timestamp);
      const isRestDay = schedule ? !schedule.daysOfWeek.includes(dayAbbrev) : false;
      shifts.push({
        timeIn: openTimeIn.timestamp,
        timeOut: p.timestamp,
        breakMinutes: breakMinutesInShift,
        isRestDay,
        dateKey: manilaDateKey(openTimeIn.timestamp),
      });
      openTimeIn = null;
      breakMinutesInShift = 0;
    }
  }

  return { shifts, lateMinutesTotal, undertimeMinutesTotal };
}

export async function generatePayslip(payPeriodId: string, userId: string): Promise<{ error?: string; payslipId?: string }> {
  await requireRole("SUPER_ADMIN", "HR_ADMIN");

  const existing = await prisma.payslip.findUnique({ where: { userId_payPeriodId: { userId, payPeriodId } } });
  if (existing) {
    return { payslipId: existing.id };
  }

  const [user, payPeriod, config] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.payPeriod.findUnique({ where: { id: payPeriodId } }),
    prisma.systemConfig.findFirst(),
  ]);
  if (!user) return { error: "That employee no longer exists." };
  if (!payPeriod) return { error: "That pay period no longer exists." };
  if (!config) return { error: "System is not configured yet." };
  if (user.monthlyCompensation == null) {
    return { error: "This employee's onboarding record has no monthly compensation on file — complete onboarding first." };
  }

  const { dailyRate, hourlyRate } = deriveRate(user.monthlyCompensation, config.workingDaysPerMonth);

  const [{ shifts, lateMinutesTotal, undertimeMinutesTotal }, holidays] = await Promise.all([
    buildShiftsForPeriod(userId, payPeriod.startDate, payPeriod.endDate),
    prisma.holiday.findMany({ where: { date: { gte: payPeriod.startDate, lte: payPeriod.endDate } } }),
  ]);

  const holidaysByDate = new Map(holidays.map((h) => [manilaDateKey(h.date), { type: h.type }]));

  const suggested = computeSuggestedPayslip({
    shifts,
    holidaysByDate,
    nightDiffStart: config.nightDiffStart,
    nightDiffEnd: config.nightDiffEnd,
    hourlyRate,
    lateMinutesTotal,
    undertimeMinutesTotal,
  });

  const payslip = await prisma.payslip.create({
    data: {
      userId,
      payPeriodId,
      monthlyCompensationSnapshot: user.monthlyCompensation,
      workingDaysPerMonthSnapshot: config.workingDaysPerMonth,
      dailyRateSnapshot: dailyRate,
      hourlyRateSnapshot: hourlyRate,
      lineItems: {
        create: [
          ...suggested.earnings.map((item, i) => ({
            category: "EARNING" as const,
            label: item.label,
            amount: item.amountPesos,
            sortOrder: i,
          })),
          ...suggested.deductions.map((item, i) => ({
            category: "DEDUCTION" as const,
            label: item.label,
            amount: item.amountPesos,
            sortOrder: i,
          })),
        ],
      },
    },
  });

  revalidatePath("/payslips");
  return { payslipId: payslip.id };
}

export interface LineItemFormState {
  error?: string;
}

export async function addLineItem(
  payslipId: string,
  category: PayComponentCategory,
  label: string,
  amount: number,
): Promise<LineItemFormState> {
  await requireRole("SUPER_ADMIN", "HR_ADMIN");

  if (!label.trim()) return { error: "Please label this line item." };
  if (!Number.isFinite(amount) || amount < 0) return { error: "Amount must be a non-negative number." };

  const payslip = await prisma.payslip.findUnique({ where: { id: payslipId } });
  if (!payslip) return { error: "Payslip not found." };
  if (payslip.status !== "DRAFT") return { error: "This payslip is already issued and can't be edited." };

  const maxOrder = await prisma.payslipLineItem.aggregate({
    where: { payslipId, category },
    _max: { sortOrder: true },
  });

  await prisma.payslipLineItem.create({
    data: { payslipId, category, label: label.trim(), amount, sortOrder: (maxOrder._max.sortOrder ?? -1) + 1 },
  });

  revalidatePath(`/payslips/${payslipId}`);
  return {};
}

export async function removeLineItem(lineItemId: string): Promise<void> {
  await requireRole("SUPER_ADMIN", "HR_ADMIN");

  const item = await prisma.payslipLineItem.findUnique({ where: { id: lineItemId }, include: { payslip: true } });
  if (!item || item.payslip.status !== "DRAFT") return;

  await prisma.payslipLineItem.delete({ where: { id: lineItemId } });
  revalidatePath(`/payslips/${item.payslipId}`);
}

export async function issuePayslip(payslipId: string): Promise<void> {
  const reviewer = await requireRole("SUPER_ADMIN", "HR_ADMIN");

  const payslip = await prisma.payslip.findUnique({ where: { id: payslipId } });
  if (!payslip || payslip.status !== "DRAFT") return;

  await prisma.payslip.update({
    where: { id: payslipId },
    data: { status: "ISSUED", issuedById: reviewer.id, issuedAt: new Date() },
  });

  await logAudit({
    actorId: reviewer.id,
    action: "PAYSLIP_ISSUED",
    targetType: "Payslip",
    targetId: payslipId,
    after: { status: "ISSUED" },
  });

  revalidatePath("/payslips");
  revalidatePath(`/payslips/${payslipId}`);
}

export async function deleteDraftPayslip(payslipId: string): Promise<void> {
  await requireRole("SUPER_ADMIN", "HR_ADMIN");
  const payslip = await prisma.payslip.findUnique({ where: { id: payslipId } });
  if (!payslip || payslip.status !== "DRAFT") return;

  await prisma.payslip.delete({ where: { id: payslipId } });
  revalidatePath("/payslips");
}

/** SUPER_ADMIN/HR_ADMIN see everyone's, including drafts still being
 * prepared; a MANAGER sees their own plus their direct reports' — but only
 * ISSUED ones, same as an EMPLOYEE seeing only their own ISSUED ones. A
 * draft is HR still working on it, not yet a real point-in-time document. */
export async function getVisiblePayslips() {
  const user = await getCurrentUser();

  if (["SUPER_ADMIN", "HR_ADMIN"].includes(user.role)) {
    return prisma.payslip.findMany({
      include: { user: { select: { name: true } }, payPeriod: true, lineItems: true },
      orderBy: [{ payPeriod: { startDate: "desc" } }, { user: { name: "asc" } }],
    });
  }

  if (user.role === "MANAGER") {
    const reportIds = (await prisma.user.findMany({ where: { managerId: user.id }, select: { id: true } })).map(
      (u) => u.id,
    );
    return prisma.payslip.findMany({
      where: { userId: { in: [user.id, ...reportIds] }, status: "ISSUED" },
      include: { user: { select: { name: true } }, payPeriod: true, lineItems: true },
      orderBy: [{ payPeriod: { startDate: "desc" } }, { user: { name: "asc" } }],
    });
  }

  return prisma.payslip.findMany({
    where: { userId: user.id, status: "ISSUED" },
    include: { user: { select: { name: true } }, payPeriod: true, lineItems: true },
    orderBy: { payPeriod: { startDate: "desc" } },
  });
}

/** Candidates for the "generate a payslip for" picker — anyone active with
 * onboarding compensation on file, excluding Kiosk accounts. */
export async function getPayslipEligibleUsers() {
  await requireRole("SUPER_ADMIN", "HR_ADMIN");
  return prisma.user.findMany({
    where: { role: { not: "KIOSK" }, active: true, monthlyCompensation: { not: null } },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

/** Returns null for both "not found" and "not allowed" — deliberately not
 * distinguishing the two to an unauthorized viewer. */
export async function getPayslipDetail(payslipId: string) {
  const user = await getCurrentUser();

  const payslip = await prisma.payslip.findUnique({
    where: { id: payslipId },
    include: {
      user: true,
      payPeriod: true,
      issuedBy: true,
      lineItems: { orderBy: [{ category: "asc" }, { sortOrder: "asc" }] },
    },
  });
  if (!payslip) return null;

  const isManagerOrAdmin = ["SUPER_ADMIN", "HR_ADMIN"].includes(user.role);
  // A draft is HR still preparing it — only HR/Admin can see it at all.
  // Once ISSUED, the owner and (if applicable) their manager can too.
  const canView =
    isManagerOrAdmin ||
    (payslip.status === "ISSUED" &&
      (payslip.userId === user.id || (user.role === "MANAGER" && payslip.user.managerId === user.id)));
  if (!canView) return null;

  return payslip;
}
