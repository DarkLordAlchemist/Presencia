import "server-only";

function engineUrl(path: string) {
  const base = process.env.FACE_ENGINE_URL ?? "http://127.0.0.1:8000";
  return `${base}${path}`;
}

interface EnrollResult {
  embedding: number[];
  face_confidence: number;
}

export async function enrollFace(imageBlob: Blob): Promise<
  { ok: true; data: EnrollResult } | { ok: false; error: string }
> {
  const form = new FormData();
  form.append("image", imageBlob, "capture.jpg");

  const res = await fetch(engineUrl("/enroll"), { method: "POST", body: form });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return { ok: false, error: body.detail ?? `face-engine returned ${res.status}` };
  }
  return { ok: true, data: await res.json() };
}

export interface VerifyCandidate {
  user_id: string;
  embedding: number[];
}

export interface VerifyResult {
  matched: boolean;
  user_id: string | null;
  confidence: number;
  liveness_passed: boolean;
  reason: string | null;
}

export async function verifyFace(
  imageBlob: Blob,
  candidates: VerifyCandidate[],
  threshold: number,
  livenessThreshold: number,
): Promise<{ ok: true; data: VerifyResult } | { ok: false; error: string }> {
  const form = new FormData();
  form.append("image", imageBlob, "capture.jpg");
  form.append("candidates", JSON.stringify(candidates));
  form.append("threshold", String(threshold));
  form.append("liveness_threshold", String(livenessThreshold));

  const res = await fetch(engineUrl("/verify"), { method: "POST", body: form });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return { ok: false, error: body.detail ?? `face-engine returned ${res.status}` };
  }
  return { ok: true, data: await res.json() };
}

// ---------------------------------------------------------------------------
// scene-engine (RelateAnything) — a separate, optional service. Every call
// is time-boxed and failure-tolerant: if it's down or slow, the Security
// dashboard keeps doing face recognition and just reports scene analysis
// as offline.

const SCENE_TIMEOUT_MS = 5000;

function sceneEngineUrl(path: string) {
  const base = process.env.SCENE_ENGINE_URL ?? "http://127.0.0.1:8001";
  return `${base}${path}`;
}

export interface SceneRelation {
  subject: string;
  subject_index: number;
  predicate: string;
  object: string;
  object_index: number;
  score: number;
}

export interface SceneObject {
  label: string;
  confidence: number;
  box: number[];
}

export interface SceneWatchlistHit {
  relation: string;
  matched: string;
  score: number;
  subject_index: number;
  object_index: number;
}

export interface SceneResult {
  objects: SceneObject[];
  relations: SceneRelation[];
  alerts: SceneWatchlistHit[];
  person_count: number;
  elapsed_ms: number;
}

export async function analyzeScene(
  imageBlob: Blob,
  watchlist: string,
  minScore: number,
): Promise<{ ok: true; data: SceneResult } | { ok: false; error: string }> {
  const form = new FormData();
  form.append("image", imageBlob, "frame.jpg");
  form.append("watchlist", watchlist);
  form.append("min_score", String(minScore));

  try {
    const res = await fetch(sceneEngineUrl("/analyze"), {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(SCENE_TIMEOUT_MS),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { ok: false, error: body.detail ?? `scene-engine returned ${res.status}` };
    }
    return { ok: true, data: await res.json() };
  } catch {
    return { ok: false, error: "scene-engine unreachable" };
  }
}
