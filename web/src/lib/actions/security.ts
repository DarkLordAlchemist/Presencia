"use server";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/dal";
import { verifyFace, type VerifyCandidate } from "@/lib/face/engine-client";
import { decryptEmbedding } from "@/lib/face/encryption";

export interface LogMovementResult {
  error?: string;
  success?: boolean;
  skipped?: boolean; // deduped — a real match, just not written again this soon
  userName?: string;
  location?: string;
  timestamp?: string;
}

export interface MovementLogRow {
  id: string;
  userName: string;
  location: string;
  timestamp: string;
}

const REASON_MESSAGES: Record<string, string> = {
  no_face_detected: "No face detected.",
  multiple_faces_detected: "More than one person in frame.",
  liveness_check_failed: "Could not verify a live person.",
  no_match_above_threshold: "Face not recognized.",
};

// Same person, same camera, within this window = one sighting, not a flood
// of near-duplicate rows from a passive scan loop that fires every few
// seconds while someone just happens to be standing in frame.
const DEDUPE_WINDOW_MS = 30_000;

/** Single-step, passive version of the kiosk's identify+confirm flow — a
 * security camera tile auto-logs a recognized, live face with no human
 * confirming anything, so there's no identify/confirm split here. */
export async function logMovement(formData: FormData): Promise<LogMovementResult> {
  await requireRole("SECURITY", "SUPER_ADMIN");

  const image = formData.get("image");
  const location = formData.get("location");
  if (!(image instanceof Blob) || image.size === 0) {
    return { error: "No frame captured." };
  }
  if (typeof location !== "string" || location.trim().length === 0) {
    return { error: "This camera has no location label set." };
  }
  const locationLabel = location.trim();

  const [config, enrolledUsers] = await Promise.all([
    prisma.systemConfig.findFirst(),
    prisma.user.findMany({
      where: { faceEmbeddingEnc: { not: null }, active: true },
      select: { id: true, name: true, faceEmbeddingEnc: true },
    }),
  ]);
  if (!config) return { error: "System is not configured yet." };

  const candidates: VerifyCandidate[] = enrolledUsers.map((u) => ({
    user_id: u.id,
    embedding: decryptEmbedding(u.faceEmbeddingEnc!),
  }));

  const result = await verifyFace(image, candidates, config.matchThreshold, config.livenessSensitivity);
  console.log("[security debug]", JSON.stringify(result));
  if (!result.ok) return { error: result.error };
  if (!result.data.matched || !result.data.user_id) {
    return { error: REASON_MESSAGES[result.data.reason ?? ""] ?? "Not recognized." };
  }

  const matchedUser = enrolledUsers.find((u) => u.id === result.data.user_id);
  if (!matchedUser) return { error: "Matched user no longer exists." };

  const recent = await prisma.movementLog.findFirst({
    where: {
      userId: matchedUser.id,
      location: locationLabel,
      createdAt: { gte: new Date(Date.now() - DEDUPE_WINDOW_MS) },
    },
    orderBy: { createdAt: "desc" },
  });
  if (recent) {
    return { skipped: true, userName: matchedUser.name, location: locationLabel, timestamp: recent.createdAt.toISOString() };
  }

  const log = await prisma.movementLog.create({
    data: { userId: matchedUser.id, location: locationLabel, confidence: result.data.confidence },
  });

  return { success: true, userName: matchedUser.name, location: log.location, timestamp: log.createdAt.toISOString() };
}

export async function getRecentMovementLogs(limit = 50): Promise<MovementLogRow[]> {
  await requireRole("SECURITY", "SUPER_ADMIN");

  const logs = await prisma.movementLog.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { user: { select: { name: true } } },
  });

  return logs.map((l) => ({
    id: l.id,
    userName: l.user.name,
    location: l.location,
    timestamp: l.createdAt.toISOString(),
  }));
}
