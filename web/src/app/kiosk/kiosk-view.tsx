"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useCamera } from "@/components/use-camera";
import { identifyFace, confirmPunch } from "@/lib/actions/punches";
import { TYPE_LABELS } from "@/lib/attendance/punch-types";
import { exitKiosk, type FormState } from "@/lib/actions/auth";

const SCAN_INTERVAL_MS = 2000;
const RESULT_DISPLAY_MS = 3000;
const TOKEN_TTL_MS = 30000;

type PunchType = "TIME_IN" | "BREAK_OUT" | "BREAK_IN" | "TIME_OUT";
const ALL_TYPES: PunchType[] = ["TIME_IN", "BREAK_OUT", "BREAK_IN", "TIME_OUT"];

type Stage =
  | { kind: "scanning" }
  | {
      kind: "confirming";
      token: string;
      userName: string;
      suggestedType: PunchType;
      statusMessage: string;
      statusWarning: boolean;
      expiresAt: number;
    }
  | { kind: "submitting" };

type Banner = { kind: "success" | "error"; text: string } | null;

const EXIT_INITIAL_STATE: FormState = {};

export function KioskView() {
  const { videoRef, ready, error: cameraError, captureFrame } = useCamera();
  const [stage, setStage] = useState<Stage>({ kind: "scanning" });
  const [banner, setBanner] = useState<Banner>(null);
  const [exitOpen, setExitOpen] = useState(false);
  const busyRef = useRef(false);
  const pausedUntilRef = useRef(0);
  const locationRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const [exitState, exitAction] = useActionState(exitKiosk, EXIT_INITIAL_STATE);

  // Captured once per kiosk session (a mounted terminal doesn't move), not
  // re-requested on every scan — avoids a permission re-prompt loop and
  // matches the "stationary tablet" use case this terminal is built for.
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        locationRef.current = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      },
      () => {
        locationRef.current = null;
      },
    );
  }, []);

  // Scanning loop only runs while idle — a successful match pauses it until
  // the employee confirms a type or the identity check expires, so the
  // camera doesn't try to re-identify someone mid-confirmation.
  useEffect(() => {
    if (!ready || stage.kind !== "scanning") return;

    const timer = setInterval(async () => {
      if (busyRef.current || Date.now() < pausedUntilRef.current) return;

      const blob = await captureFrame();
      if (!blob) return;

      busyRef.current = true;
      const formData = new FormData();
      formData.append("image", blob, "frame.jpg");
      if (locationRef.current) {
        formData.append("latitude", String(locationRef.current.latitude));
        formData.append("longitude", String(locationRef.current.longitude));
      }
      const result = await identifyFace(formData);
      busyRef.current = false;

      if (result.success && result.token) {
        setStage({
          kind: "confirming",
          token: result.token,
          userName: result.userName ?? "",
          suggestedType: result.suggestedType ?? "TIME_IN",
          statusMessage: result.statusMessage ?? "",
          statusWarning: result.statusWarning ?? false,
          expiresAt: Date.now() + TOKEN_TTL_MS,
        });
      } else if (result.error) {
        setBanner({ kind: "error", text: result.error });
        pausedUntilRef.current = Date.now() + RESULT_DISPLAY_MS;
        setTimeout(() => setBanner(null), RESULT_DISPLAY_MS);
      }
    }, SCAN_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [ready, stage.kind, captureFrame]);

  // If the employee doesn't pick a type before the identity token expires,
  // drop back to scanning instead of silently accepting a stale confirm.
  useEffect(() => {
    if (stage.kind !== "confirming") return;
    const remaining = stage.expiresAt - Date.now();
    const timer = setTimeout(() => {
      setStage({ kind: "scanning" });
      setBanner({ kind: "error", text: "Took too long to choose — please scan again." });
      setTimeout(() => setBanner(null), RESULT_DISPLAY_MS);
    }, Math.max(remaining, 0));
    return () => clearTimeout(timer);
  }, [stage]);

  async function handleChooseType(type: PunchType) {
    if (stage.kind !== "confirming") return;
    const token = stage.token;
    setStage({ kind: "submitting" });

    const formData = new FormData();
    formData.append("token", token);
    formData.append("type", type);

    const result = await confirmPunch(formData);

    if (result.success) {
      setBanner({ kind: "success", text: `${result.userName} — ${TYPE_LABELS[result.type as PunchType] ?? result.type} recorded` });
    } else {
      setBanner({ kind: "error", text: result.error ?? "Could not record that." });
    }
    pausedUntilRef.current = Date.now() + RESULT_DISPLAY_MS;
    setTimeout(() => setBanner(null), RESULT_DISPLAY_MS);
    setStage({ kind: "scanning" });
  }

  return (
    <div className="relative flex h-screen w-screen flex-col items-center justify-center bg-black text-white">
      {/* Deliberately small and unlabeled-by-default — a real employee has no
          reason to tap this corner, but it's there for an admin to break out
          of kiosk mode when needed. */}
      <button
        type="button"
        onClick={() => setExitOpen(true)}
        aria-label="Exit kiosk"
        className="absolute right-2 top-2 h-8 w-8 opacity-20 hover:opacity-60"
      />

      {exitOpen && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/80">
          <form action={exitAction} className="w-full max-w-sm rounded-lg bg-zinc-900 p-6">
            <h2 className="text-lg font-semibold text-white">Exit Kiosk Mode</h2>
            <p className="mt-1 text-sm text-zinc-400">Requires a System Admin or HR Admin login.</p>
            <input
              name="email"
              type="email"
              placeholder="Admin email"
              required
              className="mt-4 w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-white"
            />
            <input
              name="password"
              type="password"
              placeholder="Password"
              required
              className="mt-2 w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-white"
            />
            {exitState.error && <p className="mt-2 text-sm text-red-400">{exitState.error}</p>}
            <div className="mt-4 flex gap-2">
              <button type="submit" className="flex-1 rounded-md bg-white px-3 py-2 text-sm font-medium text-black">
                Exit
              </button>
              <button
                type="button"
                onClick={() => setExitOpen(false)}
                className="flex-1 rounded-md border border-zinc-700 px-3 py-2 text-sm text-white"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="relative aspect-video w-full max-w-3xl overflow-hidden rounded-lg bg-zinc-900">
        <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
        {!ready && !cameraError && (
          <div className="absolute inset-0 flex items-center justify-center text-zinc-400">
            Starting camera…
          </div>
        )}
      </div>

      {stage.kind === "scanning" && <p className="mt-6 text-lg text-zinc-300">Look at the camera to verify who you are</p>}
      {stage.kind === "submitting" && <p className="mt-6 text-lg text-zinc-300">Recording…</p>}

      {stage.kind === "confirming" && (
        <div className="mt-6 w-full max-w-md rounded-lg bg-zinc-900 p-6 text-center">
          <p className="text-xl font-semibold">Welcome, {stage.userName}</p>
          <p className={`mt-2 text-sm ${stage.statusWarning ? "text-amber-400" : "text-zinc-300"}`}>
            {stage.statusMessage}
          </p>
          <p className="mt-4 text-sm text-zinc-400">Choose what you're doing:</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {ALL_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => handleChooseType(type)}
                className={`rounded-md px-4 py-3 text-sm font-medium ${
                  type === stage.suggestedType
                    ? "bg-green-600 text-white"
                    : "bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
                }`}
              >
                {TYPE_LABELS[type]}
              </button>
            ))}
          </div>
        </div>
      )}

      {cameraError && <p className="mt-4 text-red-400">{cameraError}</p>}

      {banner && (
        <div
          className={`mt-6 rounded-md px-6 py-3 text-xl font-semibold ${
            banner.kind === "success" ? "bg-green-600" : "bg-red-600"
          }`}
        >
          {banner.text}
        </div>
      )}
    </div>
  );
}
