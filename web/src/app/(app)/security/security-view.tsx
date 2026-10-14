"use client";

import { useEffect, useRef, useState } from "react";
import { useCamera } from "@/components/use-camera";
import type { SceneBox } from "@/lib/security/scene";
import type { SceneFrameResponse } from "@/app/api/security/scene/route";
import { SceneBoxesOverlay } from "./scene-boxes-overlay";
import {
  logMovement,
  getRecentMovementLogs,
  getRecentSceneAlerts,
  type MovementLogRow,
  type SceneAlertRow,
  type SceneSummary,
} from "@/lib/actions/security";

const LOG_POLL_MS = 5000;

// Each tile's fast scene loop (live boxes, scene lines, alerts): up to ~8
// updates a second on a downscaled frame. The face loop runs separately at
// whatever pace face-engine allows.
const SCENE_MIN_INTERVAL_MS = 125;
const SCENE_FRAME_WIDTH = 640;
const SCENE_FRAME_QUALITY = 0.7;
const SCENE_OFFLINE_RETRY_MS = 2000;
// How long a recognized name stays on the person box after the face loop's
// last match.
const NAME_HOLD_MS = 4000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Tile {
  id: string;
  deviceId: string;
  location: string;
}

const inputClass =
  "w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";

export function SecurityView({
  initialLogs,
  initialAlerts,
}: {
  initialLogs: MovementLogRow[];
  initialAlerts: SceneAlertRow[];
}) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [logs, setLogs] = useState<MovementLogRow[]>(initialLogs);
  const [alerts, setAlerts] = useState<SceneAlertRow[]>(initialAlerts);

  async function refreshDevices() {
    const list = await navigator.mediaDevices.enumerateDevices();
    setDevices(list.filter((d) => d.kind === "videoinput"));
  }

  useEffect(() => {
    refreshDevices();
    navigator.mediaDevices.addEventListener("devicechange", refreshDevices);
    return () => navigator.mediaDevices.removeEventListener("devicechange", refreshDevices);
  }, []);

  // Poll for logs written by any tile (or any other security session) so
  // the table stays current even though each tile only reports its own
  // immediate scans locally.
  useEffect(() => {
    const timer = setInterval(async () => {
      const [nextLogs, nextAlerts] = await Promise.all([getRecentMovementLogs(), getRecentSceneAlerts()]);
      setLogs(nextLogs);
      setAlerts(nextAlerts);
    }, LOG_POLL_MS);
    return () => clearInterval(timer);
  }, []);

  async function handleAddCamera() {
    // Device labels are blank until a camera permission has been granted at
    // least once — request (and immediately stop) a throwaway stream first
    // so the picker below actually shows device names, not blank entries.
    if (devices.length === 0 || devices.every((d) => !d.label)) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        stream.getTracks().forEach((t) => t.stop());
      } catch {
        // fall through — enumerateDevices still returns device IDs even
        // without labels, just less readable
      }
      await refreshDevices();
    }

    const list = await navigator.mediaDevices.enumerateDevices();
    const videoInputs = list.filter((d) => d.kind === "videoinput");
    setDevices(videoInputs);

    const usedDeviceIds = new Set(tiles.map((t) => t.deviceId));
    const nextDevice = videoInputs.find((d) => !usedDeviceIds.has(d.deviceId)) ?? videoInputs[0];

    setTiles((prev) => [
      ...prev,
      { id: crypto.randomUUID(), deviceId: nextDevice?.deviceId ?? "", location: "" },
    ]);
  }

  function handleRemove(id: string) {
    setTiles((prev) => prev.filter((t) => t.id !== id));
  }

  function handleTileChange(id: string, patch: Partial<Tile>) {
    setTiles((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  function handleLogged(row: Omit<MovementLogRow, "id">) {
    setLogs((prev) => [{ id: crypto.randomUUID(), ...row }, ...prev].slice(0, 50));
  }

  async function handleAlert() {
    setAlerts(await getRecentSceneAlerts());
  }

  return (
    <div className="mt-6 flex flex-col gap-8">
      <div>
        <button
          type="button"
          onClick={handleAddCamera}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Add camera
        </button>

        {tiles.length === 0 && (
          <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
            No cameras added yet.
          </p>
        )}

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tiles.map((tile) => (
            <CameraTile
              key={tile.id}
              tile={tile}
              devices={devices}
              onChange={(patch) => handleTileChange(tile.id, patch)}
              onRemove={() => handleRemove(tile.id)}
              onLogged={handleLogged}
              onAlert={handleAlert}
            />
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Scene alerts</h2>
        <table className="mt-3 w-full max-w-3xl text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
              <th className="py-2 pr-4 font-medium">What was seen</th>
              <th className="py-2 pr-4 font-medium">Location</th>
              <th className="py-2 pr-4 font-medium">Person</th>
              <th className="py-2 pr-4 font-medium">Score</th>
              <th className="py-2 font-medium">Time</th>
            </tr>
          </thead>
          <tbody>
            {alerts.length === 0 && (
              <tr>
                <td colSpan={5} className="py-4 text-zinc-500 dark:text-zinc-400">
                  No alerts.
                </td>
              </tr>
            )}
            {alerts.map((a) => (
              <tr key={a.id} className="border-b border-red-100 bg-red-50 dark:border-red-950 dark:bg-red-950/40">
                <td className="py-2 pr-4 font-medium text-red-700 dark:text-red-300">{a.relation}</td>
                <td className="py-2 pr-4 text-zinc-700 dark:text-zinc-300">{a.location}</td>
                <td className="py-2 pr-4 text-zinc-700 dark:text-zinc-300">{a.userName ?? "Unidentified"}</td>
                <td className="py-2 pr-4 text-zinc-500 dark:text-zinc-400">{a.score.toFixed(2)}</td>
                <td className="py-2 text-zinc-500 dark:text-zinc-400">
                  {new Date(a.timestamp).toLocaleString("en-PH", { timeZone: "Asia/Manila" })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Recent movement</h2>
        <table className="mt-3 w-full max-w-3xl text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
              <th className="py-2 pr-4 font-medium">Employee</th>
              <th className="py-2 pr-4 font-medium">Location</th>
              <th className="py-2 pr-4 font-medium">Activity</th>
              <th className="py-2 font-medium">Time</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 && (
              <tr>
                <td colSpan={4} className="py-4 text-zinc-500 dark:text-zinc-400">
                  No movement logged yet.
                </td>
              </tr>
            )}
            {logs.map((log) => (
              <tr key={log.id} className="border-b border-zinc-100 dark:border-zinc-900">
                <td className="py-2 pr-4 text-zinc-900 dark:text-zinc-50">{log.userName}</td>
                <td className="py-2 pr-4 text-zinc-700 dark:text-zinc-300">{log.location}</td>
                <td className="py-2 pr-4 text-zinc-700 dark:text-zinc-300">{log.activity ?? "—"}</td>
                <td className="py-2 text-zinc-500 dark:text-zinc-400">
                  {new Date(log.timestamp).toLocaleString("en-PH", { timeZone: "Asia/Manila" })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface SceneFrame {
  summary: SceneSummary;
  boxes: SceneBox[];
  width: number;
  height: number;
}

function CameraTile({
  tile,
  devices,
  onChange,
  onRemove,
  onLogged,
  onAlert,
}: {
  tile: Tile;
  devices: MediaDeviceInfo[];
  onChange: (patch: Partial<Tile>) => void;
  onRemove: () => void;
  onLogged: (row: Omit<MovementLogRow, "id">) => void;
  onAlert: () => void;
}) {
  const { videoRef, ready, error: cameraError, captureFrame } = useCamera(tile.deviceId || undefined);
  const [status, setStatus] = useState<string | null>(null);
  const [scene, setScene] = useState<SceneFrame | null>(null);
  const [personName, setPersonName] = useState<string | null>(null);
  const nameTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Loops read the latest props through refs, so a parent re-render (the
  // log table polls every few seconds) never restarts a loop mid-request.
  const locationRef = useRef(tile.location);
  const onLoggedRef = useRef(onLogged);
  const onAlertRef = useRef(onAlert);
  useEffect(() => {
    locationRef.current = tile.location;
    onLoggedRef.current = onLogged;
    onAlertRef.current = onAlert;
  });

  function showName(name: string) {
    setPersonName(name);
    if (nameTimerRef.current) clearTimeout(nameTimerRef.current);
    nameTimerRef.current = setTimeout(() => setPersonName(null), NAME_HOLD_MS);
  }
  useEffect(() => () => {
    if (nameTimerRef.current) clearTimeout(nameTimerRef.current);
  }, []);

  // Face loop: back-to-back recognition + movement logging, each scan
  // starting as soon as the previous one finishes.
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;

    async function faceLoop() {
      while (!cancelled) {
        if (!locationRef.current.trim()) {
          setStatus("Set a location label to start logging.");
          await sleep(500);
          continue;
        }

        const blob = await captureFrame();
        if (!blob) {
          await sleep(100);
          continue;
        }

        const formData = new FormData();
        formData.append("image", blob, "frame.jpg");
        formData.append("location", locationRef.current.trim());
        const result = await logMovement(formData);
        if (cancelled) break;

        if (result.success && result.userName && result.location && result.timestamp) {
          setStatus(`${result.userName} — logged`);
          showName(result.userName);
          onLoggedRef.current({
            userName: result.userName,
            location: result.location,
            activity: result.activity ?? null,
            timestamp: result.timestamp,
          });
        } else if (result.skipped && result.userName) {
          setStatus(`${result.userName} — already logged recently`);
          showName(result.userName);
        } else if (result.error) {
          setStatus(result.error);
        }
      }
    }

    faceLoop();
    return () => {
      cancelled = true;
    };
  }, [ready, captureFrame]);

  // Scene loop: live boxes, scene lines and alerts, through a Route
  // Handler so it never queues behind the face loop's Server Action.
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;

    async function sceneLoop() {
      while (!cancelled) {
        const started = performance.now();
        const blob = await captureFrame(SCENE_FRAME_WIDTH, SCENE_FRAME_QUALITY);
        if (!blob) {
          await sleep(100);
          continue;
        }
        const bitmap = await createImageBitmap(blob);
        const width = bitmap.width;
        const height = bitmap.height;
        bitmap.close();

        const formData = new FormData();
        formData.append("image", blob, "frame.jpg");
        formData.append("location", locationRef.current.trim());

        let data: SceneFrameResponse | null = null;
        try {
          const res = await fetch("/api/security/scene", { method: "POST", body: formData });
          if (res.ok) data = await res.json();
        } catch {
          data = null;
        }
        if (cancelled) break;

        if (!data || data.summary.offline) {
          setScene({ summary: { offline: true, seeing: "", lines: [], alerts: [] }, boxes: [], width, height });
          await sleep(SCENE_OFFLINE_RETRY_MS);
          continue;
        }
        setScene({ summary: data.summary, boxes: data.boxes, width, height });
        if (data.alertLogged) onAlertRef.current();

        const elapsed = performance.now() - started;
        if (elapsed < SCENE_MIN_INTERVAL_MS) await sleep(SCENE_MIN_INTERVAL_MS - elapsed);
      }
    }

    sceneLoop();
    return () => {
      cancelled = true;
    };
  }, [ready, captureFrame]);

  const summary = scene?.summary;

  return (
    <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="relative aspect-video w-full overflow-hidden rounded-md bg-zinc-900">
        <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
        {scene && !scene.summary.offline && (
          <SceneBoxesOverlay
            boxes={scene.boxes}
            frameWidth={scene.width}
            frameHeight={scene.height}
            personName={personName}
          />
        )}
        {!ready && !cameraError && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-zinc-400">
            Starting camera…
          </div>
        )}
      </div>

      {summary && (
        <div className="mt-2 rounded-md bg-zinc-50 px-2 py-1.5 text-xs dark:bg-zinc-900">
          {summary.offline ? (
            <p className="text-zinc-400">Scene analysis offline</p>
          ) : (
            <>
              {summary.alerts.map((a, i) => (
                <p key={i} className="font-medium text-red-600 dark:text-red-400">
                  ⚠ {a}
                </p>
              ))}
              {summary.seeing && <p className="text-zinc-500 dark:text-zinc-400">Seeing: {summary.seeing}</p>}
              {summary.lines.length === 0 && summary.alerts.length === 0 && (
                <p className="text-zinc-400">{summary.note ?? "No activity detected"}</p>
              )}
              {summary.lines.map((line, i) => (
                <p key={i} className="text-zinc-600 dark:text-zinc-400">
                  {line}
                </p>
              ))}
            </>
          )}
        </div>
      )}

      <div className="mt-3 flex flex-col gap-2">
        <select
          value={tile.deviceId}
          onChange={(e) => onChange({ deviceId: e.target.value })}
          className={inputClass}
        >
          {devices.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || `Camera ${d.deviceId.slice(0, 6)}`}
            </option>
          ))}
        </select>

        <input
          type="text"
          placeholder="Location label, e.g. Back Door"
          value={tile.location}
          onChange={(e) => onChange({ location: e.target.value })}
          className={inputClass}
        />

        <div className="flex items-center justify-between">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">{cameraError ?? status ?? "Scanning…"}</p>
          <button
            type="button"
            onClick={onRemove}
            className="text-xs text-red-600 hover:underline dark:text-red-400"
          >
            Remove
          </button>
        </div>
      </div>
    </div>
  );
}
