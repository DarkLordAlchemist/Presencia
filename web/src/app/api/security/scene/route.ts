import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionPayload } from "@/lib/auth/session";
import { analyzeScene } from "@/lib/face/engine-client";
import {
  OFFLINE_SUMMARY,
  recordSceneAlerts,
  sceneBoxes,
  summarizeScene,
  type SceneBox,
  type SceneSummary,
} from "@/lib/security/scene";

export interface SceneFrameResponse {
  summary: SceneSummary;
  boxes: SceneBox[];
  personCount: number;
  alertLogged: boolean;
}

// The Security tiles' fast scene loop (several frames a second, per
// camera). A Route Handler rather than a Server Action on purpose: the
// browser dispatches Server Actions one at a time, so this loop would
// otherwise queue behind each tile's slower face-recognition call — and
// behind every other tile's.
//
// Route Handlers don't run the (app) layout, so auth is checked here, and
// answered as JSON (401/403) rather than a redirect a fetch() can't use.
export async function POST(req: Request) {
  const session = await getSessionPayload();
  const user = session?.userId
    ? await prisma.user.findUnique({ where: { id: session.userId }, select: { role: true, active: true } })
    : null;
  if (!user || !user.active) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (user.role !== "SECURITY" && user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }

  const form = await req.formData();
  const image = form.get("image");
  const location = form.get("location");
  if (!(image instanceof Blob) || image.size === 0) {
    return NextResponse.json({ error: "No frame captured." }, { status: 400 });
  }
  const locationLabel = typeof location === "string" ? location.trim() : "";

  const config = await prisma.systemConfig.findFirst();
  if (!config) return NextResponse.json({ error: "System is not configured yet." }, { status: 409 });

  const scene = await analyzeScene(image, config.sceneAlertWatchlist, config.sceneAlertMinScore);
  if (!scene.ok) {
    return NextResponse.json<SceneFrameResponse>({ summary: OFFLINE_SUMMARY, boxes: [], personCount: 0, alertLogged: false });
  }

  // Alerts are only recorded once a camera has a location label — an
  // unlabeled alert can't tell the guard where to go.
  const alertLogged = locationLabel ? await recordSceneAlerts(scene.data, locationLabel, null) : false;

  return NextResponse.json<SceneFrameResponse>({
    summary: summarizeScene(scene.data),
    boxes: sceneBoxes(scene.data),
    personCount: scene.data.person_count,
    alertLogged,
  });
}
