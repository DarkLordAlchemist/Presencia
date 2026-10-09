"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/dal";
import { logAudit } from "@/lib/audit";
import { summarizeForPayroll } from "@/lib/attendance/payroll-summary";
import { manilaDateRangeToUtc } from "@/lib/attendance/pay-period-math";

export interface FormState {
  error?: string;
}

export async function createPayPeriod(_prevState: FormState, formData: FormData): Promise<FormState> {
  await requireRole("SUPER_ADMIN", "HR_ADMIN");

  const startDateRaw = formData.get("startDate");
  const endDateRaw = formData.get("endDate");
  if (typeof startDateRaw !== "string" || typeof endDateRaw !== "string" || !startDateRaw || !endDateRaw) {
    return { error: "Please choose a start and end date." };
  }
  const { startDate, endDate } = manilaDateRangeToUtc(startDateRaw, endDateRaw);
  if (startDate > endDate) {
    return { error: "The start date must be before the end date." };
  }

  const existing = await prisma.payPeriod.findUnique({ where: { startDate_endDate: { startDate, endDate } } });
  if (existing) {
    return { error: "That exact pay period already exists." };
  }

  await prisma.payPeriod.create({ data: { startDate, endDate } });
  revalidatePath("/payroll");
  return {};
}

export async function togglePayPeriodLock(payPeriodId: string) {
  const user = await requireRole("SUPER_ADMIN", "HR_ADMIN");

  const period = await prisma.payPeriod.findUnique({ where: { id: payPeriodId } });
  if (!period) return;

  const nowLocked = !period.locked;
  await prisma.payPeriod.update({
    where: { id: payPeriodId },
    data: { locked: nowLocked, lockedAt: nowLocked ? new Date() : null, lockedById: nowLocked ? user.id : null },
  });

  await logAudit({
    actorId: user.id,
    action: nowLocked ? "PAY_PERIOD_LOCK" : "PAY_PERIOD_UNLOCK",
    targetType: "PayPeriod",
    targetId: payPeriodId,
    before: { locked: period.locked },
    after: { locked: nowLocked },
  });

  revalidatePath("/payroll");
}

export async function listPayPeriods() {
  return prisma.payPeriod.findMany({ orderBy: { startDate: "desc" } });
}

/** Used by the correction-request review flow to refuse edits inside a locked cutoff. */
export async function isDateInLockedPeriod(date: Date): Promise<boolean> {
  const count = await prisma.payPeriod.count({
    where: { locked: true, startDate: { lte: date }, endDate: { gte: date } },
  });
  return count > 0;
}

export interface WebhookResult {
  ok: boolean;
  message: string;
}

/**
 * Pushes the computed pay-period totals to the configured payroll/HRIS
 * webhook URL as a JSON POST. This is the "API endpoints or webhooks to
 * push computed net hours... into payroll software" integration —
 * honestly scoped to a generic outbound webhook since there's no real
 * QuickBooks/Sprout/Salarium credential to integrate against here; any of
 * those systems' own inbound-webhook endpoint would be configured as this
 * URL by whoever deploys this.
 */
export async function sendPayPeriodToWebhook(payPeriodId: string): Promise<WebhookResult> {
  await requireRole("SUPER_ADMIN", "HR_ADMIN");

  const [config, period] = await Promise.all([
    prisma.systemConfig.findFirst(),
    prisma.payPeriod.findUnique({ where: { id: payPeriodId } }),
  ]);
  if (!config?.payrollWebhookUrl) {
    return { ok: false, message: "No payroll webhook URL is configured." };
  }
  if (!period) {
    return { ok: false, message: "Pay period not found." };
  }

  const punches = await prisma.punch.findMany({
    where: { timestamp: { gte: period.startDate, lte: period.endDate } },
    include: { user: { select: { name: true } } },
    orderBy: { timestamp: "asc" },
  });
  const summaries = summarizeForPayroll(
    punches.map((p) => ({
      userId: p.userId,
      userName: p.user.name,
      type: p.type,
      timestamp: p.timestamp,
      lateMinutes: p.lateMinutes,
      undertimeMinutes: p.undertimeMinutes,
      overtimeMinutes: p.overtimeMinutes,
      nightDiffMinutes: p.nightDiffMinutes,
      breakMinutes: p.breakMinutes,
      manualEntry: p.manualEntry,
    })),
  );

  try {
    const res = await fetch(config.payrollWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        payPeriod: { startDate: period.startDate, endDate: period.endDate },
        employees: summaries,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      return { ok: false, message: `Webhook responded with ${res.status}.` };
    }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Webhook request failed." };
  }

  return { ok: true, message: "Sent." };
}
