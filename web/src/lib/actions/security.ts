"use server";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/dal";
import { analyzeScene, verifyFace } from "@/lib/face/engine-client";
import { loadFaceCandidates } from "@/lib/face/candidates";
import { personRelations } from "@/lib/security/scene";

export type { SceneSummary } from "@/lib/security/scene";

export interface LogMovementResult {
  error?: string;
  success?: boolean;
  skipped?: boolean; // deduped — a real match, just not written again this soon
  userName?: string;
  location?: string;
  timestamp?: string;
  activity?: string;
}

export interface MovementLogRow {
  id: string;
  userName: string;
  location: string;
  activity: string | null;
  timestamp: string;
}

export interface SceneAlertRow {
  id: string;
  location: string;
  relation: string;
  matched: string;
  score: number;
  userName: string | null;
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

// A scene alert raised by the tile's fast scene loop (which does no face
// recognition) is attributed to a person the face loop recognizes at the
// same camera within this window, when they were the only person in view.
const ALERT_ATTRIBUTION_WINDOW_MS = 10_000;

/** Single-step, passive version of the kiosk's identify+confirm flow — a
 * security camera tile auto-logs a recognized, live face with no human
 * confirming anything, so there's no identify/confirm split here.
 *
 * The tile's live boxes, scene lines and alerts come from its separate,
 * faster scene loop (/api/security/scene). This frame also goes to
 * scene-engine, but only to record what the recognized person was doing
 * (the movement log's activity) and to put their name on that camera's
 * just-raised alerts. */
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

  const [config, { users: enrolledUsers, candidates }] = await Promise.all([
    prisma.systemConfig.findFirst(),
    loadFaceCandidates(),
  ]);
  if (!config) return { error: "System is not configured yet." };

  const [faceResult, sceneResult] = await Promise.all([
    verifyFace(image, candidates, config.matchThreshold, config.livenessSensitivity).catch(
      () => ({ ok: false as const, error: "face-engine unreachable" }),
    ),
    analyzeScene(image, config.sceneAlertWatchlist, config.sceneAlertMinScore),
  ]);

  if (!faceResult.ok) return { error: faceResult.error };
  const matchedUser =
    faceResult.data.matched && faceResult.data.user_id
      ? enrolledUsers.find((u) => u.id === faceResult.data.user_id) ?? null
      : null;
  if (!matchedUser) {
    const reason = faceResult.data.matched
      ? "Matched user no longer exists."
      : REASON_MESSAGES[faceResult.data.reason ?? ""] ?? "Not recognized.";
    return { error: reason };
  }

  // face-engine only matches when exactly one face is in frame, so with a
  // single person box the recognized face and that box are the same person.
  const alone = sceneResult.ok && sceneResult.data.person_count === 1;
  let activity: string | undefined;
  if (alone) {
    const top = personRelations(sceneResult.data)[0];
    if (top) activity = `${top.predicate} ${top.object}`;
    await prisma.sceneAlert.updateMany({
      where: {
        location: locationLabel,
        userId: null,
        createdAt: { gte: new Date(Date.now() - ALERT_ATTRIBUTION_WINDOW_MS) },
      },
      data: { userId: matchedUser.id },
    });
  }

  const recent = await prisma.movementLog.findFirst({
    where: {
      userId: matchedUser.id,
      location: locationLabel,
      createdAt: { gte: new Date(Date.now() - DEDUPE_WINDOW_MS) },
    },
    orderBy: { createdAt: "desc" },
  });
  if (recent) {
    return {
      skipped: true,
      userName: matchedUser.name,
      location: locationLabel,
      timestamp: recent.createdAt.toISOString(),
      activity,
    };
  }

  const log = await prisma.movementLog.create({
    data: {
      userId: matchedUser.id,
      location: locationLabel,
      confidence: faceResult.data.confidence,
      activity: activity ?? null,
    },
  });

  return {
    success: true,
    userName: matchedUser.name,
    location: log.location,
    timestamp: log.createdAt.toISOString(),
    activity,
  };
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
    activity: l.activity,
    timestamp: l.createdAt.toISOString(),
  }));
}

export async function getRecentSceneAlerts(limit = 20): Promise<SceneAlertRow[]> {
  await requireRole("SECURITY", "SUPER_ADMIN");

  const alerts = await prisma.sceneAlert.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { user: { select: { name: true } } },
  });

  return alerts.map((a) => ({
    id: a.id,
    location: a.location,
    relation: a.relation,
    matched: a.matched,
    score: a.score,
    userName: a.user?.name ?? null,
    timestamp: a.createdAt.toISOString(),
  }));
}
