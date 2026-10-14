"use client";

import { useEffect, useState } from "react";
import { useCamera } from "@/components/use-camera";
import { FaceGuideOverlay } from "@/components/face-guide-overlay";
import { checkEnrollPhoto, enrollEmployeeFace } from "@/lib/actions/enrollment";
import { ENROLL_POSES, type PoseId } from "@/lib/face/poses";

interface UserOption {
  id: string;
  name: string;
  email: string;
  angleCount: number;
}

interface Shot {
  blob: Blob;
  url: string;
}

const selectClass =
  "mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";
const primaryButton =
  "rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200";
const secondaryButton =
  "rounded-md border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900";

export function EnrollForm({ users }: { users: UserOption[] }) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string>("");

  useEffect(() => {
    async function loadDevices() {
      // Labels are blank until a camera permission has been granted at
      // least once — request (and immediately stop) a throwaway stream so
      // the picker below shows real device names, not blank entries.
      try {
        const probe = await navigator.mediaDevices.getUserMedia({ video: true });
        probe.getTracks().forEach((t) => t.stop());
      } catch {
        // fall through — enumerateDevices still returns device IDs even
        // without labels, just less readable
      }
      const list = await navigator.mediaDevices.enumerateDevices();
      setDevices(list.filter((d) => d.kind === "videoinput"));
    }
    loadDevices();
  }, []);

  const { videoRef, ready, error: cameraError, captureFrame } = useCamera(deviceId || undefined);
  const [userId, setUserId] = useState(users[0]?.id ?? "");
  const [mode, setMode] = useState<"replace" | "add">("replace");
  const [shots, setShots] = useState<Partial<Record<PoseId, Shot>>>({});
  const [poseIndex, setPoseIndex] = useState(0);
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  const selectedUser = users.find((u) => u.id === userId);
  const pose = ENROLL_POSES[poseIndex];
  const capturedCount = Object.keys(shots).length;
  const allDone = poseIndex >= ENROLL_POSES.length;

  function resetShots() {
    Object.values(shots).forEach((s) => s && URL.revokeObjectURL(s.url));
    setShots({});
    setPoseIndex(0);
  }

  function nextUncaptured(after: Partial<Record<PoseId, Shot>>, from: number) {
    for (let i = from; i < ENROLL_POSES.length; i++) {
      if (!after[ENROLL_POSES[i].id]) return i;
    }
    for (let i = 0; i < from; i++) {
      if (!after[ENROLL_POSES[i].id]) return i;
    }
    return ENROLL_POSES.length;
  }

  async function handleCapture() {
    if (!pose) return;
    const blob = await captureFrame();
    if (!blob) return;
    setChecking(true);
    setMessage(null);

    // Check this one angle right away so a bad shot is retaken now, not
    // discovered after all five are done.
    const formData = new FormData();
    formData.append("image", blob, `${pose.id}.jpg`);
    const result = await checkEnrollPhoto(formData);
    setChecking(false);

    if (result.error) {
      setMessage({ type: "error", text: `${pose.label}: ${result.error} Try again.` });
      return;
    }

    const previous = shots[pose.id];
    if (previous) URL.revokeObjectURL(previous.url);
    const updated = { ...shots, [pose.id]: { blob, url: URL.createObjectURL(blob) } };
    setShots(updated);
    setPoseIndex(nextUncaptured(updated, poseIndex + 1));
  }

  function handleSkip() {
    setMessage(null);
    setPoseIndex(nextUncaptured(shots, poseIndex + 1));
  }

  async function handleSubmit() {
    if (!userId || capturedCount === 0) return;
    setSubmitting(true);
    setMessage(null);

    const formData = new FormData();
    formData.append("userId", userId);
    formData.append("mode", mode);
    for (const [poseId, shot] of Object.entries(shots)) {
      if (shot) formData.append(`image_${poseId}`, shot.blob, `${poseId}.jpg`);
    }

    const result = await enrollEmployeeFace(formData);
    setSubmitting(false);

    if (result.error) {
      setMessage({ type: "error", text: result.error });
      if (result.failedPose) {
        setPoseIndex(ENROLL_POSES.findIndex((p) => p.id === result.failedPose));
      }
    } else {
      setMessage({
        type: "success",
        text: `Enrolled ${result.savedCount} angle${result.savedCount === 1 ? "" : "s"} for ${selectedUser?.name ?? "this person"}.`,
      });
      resetShots();
    }
  }

  return (
    <div className="mt-6 flex max-w-2xl flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="userId" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Person
          </label>
          <select
            id="userId"
            value={userId}
            onChange={(e) => {
              setUserId(e.target.value);
              setMode("replace");
              resetShots();
              setMessage(null);
            }}
            className={selectClass}
          >
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.email}){" "}
                {u.angleCount > 0 ? `— ${u.angleCount} angle${u.angleCount === 1 ? "" : "s"} enrolled` : ""}
              </option>
            ))}
          </select>
        </div>

        {devices.length > 1 && (
          <div>
            <label htmlFor="deviceId" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Camera
            </label>
            <select
              id="deviceId"
              value={deviceId}
              onChange={(e) => setDeviceId(e.target.value)}
              className={selectClass}
            >
              <option value="">Default camera</option>
              {devices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `Camera ${d.deviceId.slice(0, 6)}`}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {selectedUser && selectedUser.angleCount > 0 && (
        <fieldset className="flex flex-wrap gap-4 text-sm text-zinc-700 dark:text-zinc-300">
          <label className="flex items-center gap-2">
            <input type="radio" name="mode" checked={mode === "replace"} onChange={() => setMode("replace")} />
            Re-enroll (replace the {selectedUser.angleCount} existing angle{selectedUser.angleCount === 1 ? "" : "s"})
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="mode" checked={mode === "add"} onChange={() => setMode("add")} />
            Add more angles (keep existing)
          </label>
        </fieldset>
      )}

      <div className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
        {pose ? (
          <>
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
              Angle {poseIndex + 1} of {ENROLL_POSES.length}: {pose.label}
            </p>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">{pose.hint}</p>
          </>
        ) : (
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
            {capturedCount} angle{capturedCount === 1 ? "" : "s"} captured. Click a thumbnail to retake one, or save.
          </p>
        )}
      </div>

      <div className="relative aspect-video w-full overflow-hidden rounded-md bg-zinc-900">
        <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
        {ready && pose && <FaceGuideOverlay angle={pose.guide} caption={`Match the guide — ${pose.label}`} />}
      </div>

      {cameraError && <p className="text-sm text-red-600 dark:text-red-400">{cameraError}</p>}

      <div className="grid grid-cols-5 gap-2">
        {ENROLL_POSES.map((p, i) => {
          const shot = shots[p.id];
          const active = i === poseIndex;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                setPoseIndex(i);
                setMessage(null);
              }}
              className={`flex flex-col items-center gap-1 rounded-md border p-1 text-xs ${
                active
                  ? "border-zinc-900 dark:border-zinc-50"
                  : "border-zinc-200 dark:border-zinc-800"
              }`}
            >
              <div className="flex aspect-square w-full items-center justify-center overflow-hidden rounded bg-zinc-100 dark:bg-zinc-900">
                {shot ? (
                  <img src={shot.url} alt={p.label} className="h-full w-full object-cover" />
                ) : (
                  <span className="text-zinc-400">—</span>
                )}
              </div>
              <span className="text-zinc-600 dark:text-zinc-400">{p.label}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-3">
        {!allDone && (
          <>
            <button type="button" onClick={handleCapture} disabled={!ready || checking || submitting} className={primaryButton}>
              {checking ? "Checking…" : shots[pose!.id] ? "Retake this angle" : "Capture this angle"}
            </button>
            {pose && pose.id !== "front" && (
              <button type="button" onClick={handleSkip} disabled={checking || submitting} className={secondaryButton}>
                Skip
              </button>
            )}
          </>
        )}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || checking || capturedCount === 0 || !shots.front}
          className={allDone ? primaryButton : secondaryButton}
        >
          {submitting ? "Enrolling…" : `Save ${capturedCount} angle${capturedCount === 1 ? "" : "s"}`}
        </button>
      </div>
      {!shots.front && capturedCount > 0 && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">The straight-ahead angle is required.</p>
      )}

      {message && (
        <p
          className={
            message.type === "error"
              ? "text-sm text-red-600 dark:text-red-400"
              : "text-sm text-green-600 dark:text-green-400"
          }
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
