"use client";

import { useEffect, useState } from "react";
import { useCamera } from "@/components/use-camera";
import { enrollEmployeeFace } from "@/lib/actions/enrollment";

interface UserOption {
  id: string;
  name: string;
  email: string;
  faceEnrolledAt: Date | null;
}

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
  const [preview, setPreview] = useState<string | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  async function handleCapture() {
    const blob = await captureFrame();
    if (!blob) return;
    setCapturedBlob(blob);
    setPreview(URL.createObjectURL(blob));
    setMessage(null);
  }

  async function handleSubmit() {
    if (!capturedBlob || !userId) return;
    setSubmitting(true);
    setMessage(null);

    const formData = new FormData();
    formData.append("userId", userId);
    formData.append("image", capturedBlob, "enroll.jpg");

    const result = await enrollEmployeeFace(formData);
    setSubmitting(false);

    if (result.error) {
      setMessage({ type: "error", text: result.error });
    } else {
      setMessage({ type: "success", text: "Enrolled successfully." });
      setPreview(null);
      setCapturedBlob(null);
    }
  }

  return (
    <div className="mt-6 flex max-w-lg flex-col gap-4">
      <div>
        <label htmlFor="userId" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Person
        </label>
        <select
          id="userId"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        >
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name} ({u.email}) {u.faceEnrolledAt ? "— already enrolled" : ""}
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
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
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

      <div className="relative aspect-video w-full overflow-hidden rounded-md bg-zinc-900">
        {!preview && (
          <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
        )}
        {preview && <img src={preview} alt="Captured" className="h-full w-full object-cover" />}
      </div>

      {cameraError && <p className="text-sm text-red-600 dark:text-red-400">{cameraError}</p>}

      {!preview ? (
        <button
          type="button"
          onClick={handleCapture}
          disabled={!ready}
          className="w-fit rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Capture photo
        </button>
      ) : (
        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {submitting ? "Enrolling..." : "Enroll this photo"}
          </button>
          <button
            type="button"
            onClick={() => {
              setPreview(null);
              setCapturedBlob(null);
            }}
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            Retake
          </button>
        </div>
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
