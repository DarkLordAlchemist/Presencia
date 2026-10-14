"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/dal";

export interface FormState {
  error?: string;
  success?: boolean;
}

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export async function getSystemConfig() {
  const config = await prisma.systemConfig.findFirst();
  if (!config) {
    throw new Error("SystemConfig row missing — setup should have created one.");
  }
  return config;
}

function optionalNumber(formData: FormData, name: string): number | null {
  const raw = formData.get(name);
  if (typeof raw !== "string" || raw.trim().length === 0) return null;
  const n = Number(raw);
  return Number.isNaN(n) ? null : n;
}

export async function updateSystemConfig(_prevState: FormState, formData: FormData): Promise<FormState> {
  await requireRole("SUPER_ADMIN");

  const matchThreshold = Number(formData.get("matchThreshold"));
  const livenessSensitivity = Number(formData.get("livenessSensitivity"));
  const gracePeriodMinutes = Number(formData.get("gracePeriodMinutes"));
  const maxBreakMinutes = Number(formData.get("maxBreakMinutes"));
  const maxDailyBreakMinutes = Number(formData.get("maxDailyBreakMinutes"));
  const nightDiffStart = formData.get("nightDiffStart");
  const nightDiffEnd = formData.get("nightDiffEnd");

  const geofenceEnabled = formData.get("geofenceEnabled") === "on";
  const geofenceLat = optionalNumber(formData, "geofenceLat");
  const geofenceLng = optionalNumber(formData, "geofenceLng");
  const geofenceRadiusMeters = Number(formData.get("geofenceRadiusMeters"));

  const ipLockEnabled = formData.get("ipLockEnabled") === "on";
  const allowedIpPrefixesRaw = formData.get("allowedIpPrefixes");
  const allowedIpPrefixes = typeof allowedIpPrefixesRaw === "string" ? allowedIpPrefixesRaw.trim() : "";

  const payrollWebhookUrlRaw = formData.get("payrollWebhookUrl");
  const payrollWebhookUrl = typeof payrollWebhookUrlRaw === "string" ? payrollWebhookUrlRaw.trim() : "";

  const companyNameRaw = formData.get("companyName");
  const companyName = typeof companyNameRaw === "string" ? companyNameRaw.trim() : "";

  const certificateSignatoryNameRaw = formData.get("certificateSignatoryName");
  const certificateSignatoryName = typeof certificateSignatoryNameRaw === "string" ? certificateSignatoryNameRaw.trim() : "";
  const certificateSignatoryTitleRaw = formData.get("certificateSignatoryTitle");
  const certificateSignatoryTitle =
    typeof certificateSignatoryTitleRaw === "string" && certificateSignatoryTitleRaw.trim()
      ? certificateSignatoryTitleRaw.trim()
      : "Head of Human Resources";

  const workingDaysPerMonth = Number(formData.get("workingDaysPerMonth"));

  const sceneAlertWatchlistRaw = formData.get("sceneAlertWatchlist");
  const sceneAlertWatchlist =
    typeof sceneAlertWatchlistRaw === "string"
      ? sceneAlertWatchlistRaw
          .split(/[,\n]/)
          .map((w) => w.trim().toLowerCase())
          .filter(Boolean)
          .join(", ")
      : "";
  const sceneAlertMinScore = Number(formData.get("sceneAlertMinScore"));

  if (Number.isNaN(matchThreshold) || matchThreshold < 0 || matchThreshold > 1) {
    return { error: "Match threshold must be between 0 and 1." };
  }
  if (Number.isNaN(livenessSensitivity) || livenessSensitivity < 0 || livenessSensitivity > 1) {
    return { error: "Liveness sensitivity must be between 0 and 1." };
  }
  if (!Number.isInteger(gracePeriodMinutes) || gracePeriodMinutes < 0) {
    return { error: "Grace period must be a non-negative whole number of minutes." };
  }
  if (!Number.isInteger(maxBreakMinutes) || maxBreakMinutes < 0) {
    return { error: "Max break duration must be a non-negative whole number of minutes." };
  }
  if (!Number.isInteger(maxDailyBreakMinutes) || maxDailyBreakMinutes < 0) {
    return { error: "Max daily break allowance must be a non-negative whole number of minutes." };
  }
  if (typeof nightDiffStart !== "string" || !TIME_RE.test(nightDiffStart)) {
    return { error: "Night differential start must be a valid time." };
  }
  if (typeof nightDiffEnd !== "string" || !TIME_RE.test(nightDiffEnd)) {
    return { error: "Night differential end must be a valid time." };
  }
  if (geofenceEnabled && (geofenceLat == null || geofenceLng == null)) {
    return { error: "Geofencing requires a center latitude and longitude." };
  }
  if (!Number.isInteger(geofenceRadiusMeters) || geofenceRadiusMeters <= 0) {
    return { error: "Geofence radius must be a positive whole number of meters." };
  }
  if (ipLockEnabled && allowedIpPrefixes.length === 0) {
    return { error: "IP locking requires at least one allowed IP/prefix." };
  }
  if (!Number.isFinite(workingDaysPerMonth) || workingDaysPerMonth <= 0) {
    return { error: "Working days per month must be a positive number." };
  }
  if (Number.isNaN(sceneAlertMinScore) || sceneAlertMinScore < 0 || sceneAlertMinScore > 1) {
    return { error: "Scene alert minimum score must be between 0 and 1." };
  }

  const existing = await prisma.systemConfig.findFirst();
  if (!existing) {
    return { error: "SystemConfig row missing." };
  }

  await prisma.systemConfig.update({
    where: { id: existing.id },
    data: {
      matchThreshold,
      livenessSensitivity,
      gracePeriodMinutes,
      maxBreakMinutes,
      maxDailyBreakMinutes,
      nightDiffStart,
      nightDiffEnd,
      geofenceEnabled,
      geofenceLat,
      geofenceLng,
      geofenceRadiusMeters,
      ipLockEnabled,
      allowedIpPrefixes: allowedIpPrefixes || null,
      payrollWebhookUrl: payrollWebhookUrl || null,
      companyName: companyName || null,
      certificateSignatoryName: certificateSignatoryName || null,
      certificateSignatoryTitle: certificateSignatoryTitle,
      workingDaysPerMonth,
      sceneAlertWatchlist,
      sceneAlertMinScore,
    },
  });

  revalidatePath("/config");
  return { success: true };
}
