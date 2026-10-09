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
