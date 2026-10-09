"use server";

import { headers } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/dal";
import { getEncodedKey } from "@/lib/auth/session";
import { verifyFace, type VerifyCandidate } from "@/lib/face/engine-client";
import { decryptEmbedding } from "@/lib/face/encryption";
import { computeFlagsForPunch } from "@/lib/attendance/flags";
import { haversineDistanceMeters, isIpAllowed } from "@/lib/attendance/geo";
import { manilaDayBounds } from "@/lib/attendance/compute";
import { reverseGeocode } from "@/lib/attendance/reverse-geocode";
import { TYPE_LABELS, VALID_TYPES } from "@/lib/attendance/punch-types";
import type { PunchType, SystemConfig } from "@/generated/prisma/client";

export interface PunchResult {
  error?: string;
  success?: boolean;
  userName?: string;
  type?: PunchType;
  confidence?: number;
}

export interface IdentifyResult {
  error?: string;
  success?: boolean;
  token?: string;
  userName?: string;
  suggestedType?: PunchType;
  statusMessage?: string;
  statusWarning?: boolean;
}

const REASON_MESSAGES: Record<string, string> = {
  no_face_detected: "No face detected — please face the camera directly.",
  multiple_faces_detected: "More than one person in frame — please scan one at a time.",
  liveness_check_failed: "Could not verify a live person — please try again.",
  no_match_above_threshold: "Face not recognized. Not enrolled, or an HR admin needs to re-enroll you.",
};

// TIME_IN -> BREAK_OUT -> BREAK_IN -> TIME_OUT -> TIME_IN -> ...
// Only used to pick which button is highlighted as the suggestion — the
// employee picks the actual type themselves, so a forgotten-punch day
// doesn't silently force them into the wrong slot of the cycle.
const NEXT_TYPE: Record<PunchType, PunchType> = {
  TIME_IN: "BREAK_OUT",
  BREAK_OUT: "BREAK_IN",
  BREAK_IN: "TIME_OUT",
  TIME_OUT: "TIME_IN",
};

const IDENTIFY_TOKEN_TTL_SECONDS = 30;
const IDENTIFY_TOKEN_PURPOSE = "kiosk-punch-identify";

interface IdentifyTokenPayload {
  purpose: string;
  userId: string;
  confidence: number;
  livenessPassed: boolean;
}

async function signIdentifyToken(payload: Omit<IdentifyTokenPayload, "purpose">): Promise<string> {
  return new SignJWT({ ...payload, purpose: IDENTIFY_TOKEN_PURPOSE })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${IDENTIFY_TOKEN_TTL_SECONDS}s`)
    .sign(getEncodedKey());
}

async function verifyIdentifyToken(token: string): Promise<IdentifyTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getEncodedKey(), { algorithms: ["HS256"] });
    if (payload.purpose !== IDENTIFY_TOKEN_PURPOSE || typeof payload.userId !== "string") return null;
    return payload as unknown as IdentifyTokenPayload;
  } catch {
    return null;
  }
}

function readClientIp(headerList: Headers): string | null {
  const forwarded = headerList.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return headerList.get("x-real-ip");
}

/** Enforced before ever running face recognition or matching — no point
 * scanning a face if the terminal isn't even somewhere/on-network it's
 * allowed to clock in from. Returns the snapshot fields so both the
 * blocking check here and the eventual Punch row use the same values. */
async function checkLocationAndNetwork(
  latitude: number | null,
  longitude: number | null,
  headerList: Headers,
  config: SystemConfig,
): Promise<{ error?: string; withinGeofence: boolean | null; ipAllowed: boolean | null; ipAddress: string | null }> {
  let withinGeofence: boolean | null = null;
  if (config.geofenceEnabled) {
    withinGeofence =
      latitude != null &&
      longitude != null &&
      config.geofenceLat != null &&
      config.geofenceLng != null &&
      haversineDistanceMeters(latitude, longitude, config.geofenceLat, config.geofenceLng) <=
        config.geofenceRadiusMeters;
    if (!withinGeofence) {
      return { error: "This device is outside the allowed clock-in area.", withinGeofence, ipAllowed: null, ipAddress: null };
    }
  }

  const ipAddress = readClientIp(headerList);
  let ipAllowed: boolean | null = null;
  if (config.ipLockEnabled) {
    ipAllowed = isIpAllowed(ipAddress, config.allowedIpPrefixes);
    if (!ipAllowed) {
      return { error: "This device's network is not authorized for clock-in.", withinGeofence, ipAllowed, ipAddress };
    }
  }

  return { withinGeofence, ipAllowed, ipAddress };
}

function describeStatus(
  lastPunch: { type: PunchType; timestamp: Date } | null,
  now: Date,
): { suggestedType: PunchType; statusMessage: string; statusWarning: boolean } {
  if (!lastPunch) {
    return { suggestedType: "TIME_IN", statusMessage: "No entries yet — this will be your first Time In.", statusWarning: false };
  }

  const suggestedType = NEXT_TYPE[lastPunch.type];
  const { start: todayStart } = manilaDayBounds(now);
  const isFromToday = lastPunch.timestamp >= todayStart;
  const when = lastPunch.timestamp.toLocaleString("en-PH", { timeZone: "Asia/Manila" });

  if (lastPunch.type === "TIME_OUT") {
    return { suggestedType, statusMessage: `Last entry: Time Out at ${when}.`, statusWarning: false };
  }
  if (!isFromToday) {
    return {
      suggestedType,
      statusMessage: `You still have an open ${TYPE_LABELS[lastPunch.type]} from ${when} — you may have forgotten to clock out. Choose Time Out below to close it, or ask HR for a correction if that's wrong.`,
      statusWarning: true,
    };
  }
  return { suggestedType, statusMessage: `Last entry: ${TYPE_LABELS[lastPunch.type]} at ${when} today.`, statusWarning: false };
}

/** Step 1: verify identity from a scanned frame. Does NOT record a punch —
 * only identifies who's there and what their current status is, so the
 * kiosk UI can show it and let them pick the actual entry type themselves. */
export async function identifyFace(formData: FormData): Promise<IdentifyResult> {
  await requireRole("KIOSK");

  const image = formData.get("image");
  if (!(image instanceof Blob) || image.size === 0) {
    return { error: "No frame captured." };
  }

  const latRaw = formData.get("latitude");
  const lngRaw = formData.get("longitude");
  const latitude = typeof latRaw === "string" && latRaw.length > 0 ? Number(latRaw) : null;
  const longitude = typeof lngRaw === "string" && lngRaw.length > 0 ? Number(lngRaw) : null;

  const [config, enrolledUsers, headerList] = await Promise.all([
    prisma.systemConfig.findFirst(),
    prisma.user.findMany({
      where: { faceEmbeddingEnc: { not: null }, active: true },
      select: { id: true, name: true, faceEmbeddingEnc: true },
    }),
    headers(),
  ]);
  if (!config) return { error: "System is not configured yet." };

  const locationCheck = await checkLocationAndNetwork(latitude, longitude, headerList, config);
  if (locationCheck.error) return { error: locationCheck.error };

  const candidates: VerifyCandidate[] = enrolledUsers.map((u) => ({
    user_id: u.id,
    embedding: decryptEmbedding(u.faceEmbeddingEnc!),
  }));

  const result = await verifyFace(image, candidates, config.matchThreshold, config.livenessSensitivity);
  if (!result.ok) return { error: result.error };
  if (!result.data.matched || !result.data.user_id) {
    return { error: REASON_MESSAGES[result.data.reason ?? ""] ?? "Not recognized." };
  }

  const matchedUser = enrolledUsers.find((u) => u.id === result.data.user_id);
  if (!matchedUser) return { error: "Matched user no longer exists." };

  const lastPunch = await prisma.punch.findFirst({
    where: { userId: matchedUser.id },
    orderBy: { timestamp: "desc" },
  });
  const { suggestedType, statusMessage, statusWarning } = describeStatus(lastPunch, new Date());

  const token = await signIdentifyToken({
    userId: matchedUser.id,
    confidence: result.data.confidence,
    livenessPassed: result.data.liveness_passed,
  });

  return { success: true, token, userName: matchedUser.name, suggestedType, statusMessage, statusWarning };
}

/** Step 2: redeems a fresh identify token (proves a live, matched face was
 * just seen) plus the type the employee actually picked, and writes the
 * punch. The token — not anything the client claims about who they are —
 * is what the write trusts. */
export async function confirmPunch(formData: FormData): Promise<PunchResult> {
  await requireRole("KIOSK");

  const token = formData.get("token");
  const type = formData.get("type");
  if (typeof token !== "string" || !token) {
    return { error: "Identity check expired — please scan again." };
  }
  if (typeof type !== "string" || !VALID_TYPES.includes(type as PunchType)) {
    return { error: "Please choose a punch type." };
  }

  const payload = await verifyIdentifyToken(token);
  if (!payload) {
    return { error: "Identity check expired — please scan again." };
  }

  const latRaw = formData.get("latitude");
  const lngRaw = formData.get("longitude");
  const latitude = typeof latRaw === "string" && latRaw.length > 0 ? Number(latRaw) : null;
  const longitude = typeof lngRaw === "string" && lngRaw.length > 0 ? Number(lngRaw) : null;

  const [config, headerList, user] = await Promise.all([
    prisma.systemConfig.findFirst(),
    headers(),
    prisma.user.findUnique({ where: { id: payload.userId } }),
  ]);
  if (!config) return { error: "System is not configured yet." };
  if (!user || !user.active) return { error: "Matched user no longer exists." };

  // Re-derive the same snapshot fields for storage — identify() already did
  // the blocking check moments ago, this just captures them on the row.
  const locationCheck = await checkLocationAndNetwork(latitude, longitude, headerList, config);

  const now = new Date();
  const punchType = type as PunchType;
  const flags = await computeFlagsForPunch(user.id, punchType, now, config);
  const address = latitude != null && longitude != null ? await reverseGeocode(latitude, longitude) : null;

  await prisma.punch.create({
    data: {
      userId: user.id,
      type: punchType,
      timestamp: now,
      confidence: payload.confidence,
      livenessPassed: payload.livenessPassed,
      ...flags,
      latitude,
      longitude,
      address,
      withinGeofence: locationCheck.withinGeofence,
      ipAddress: locationCheck.ipAddress,
      ipAllowed: locationCheck.ipAllowed,
    },
  });

  return { success: true, userName: user.name, type: punchType, confidence: payload.confidence };
}
