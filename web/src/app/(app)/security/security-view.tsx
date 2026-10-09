"use client";

import { useEffect, useRef, useState } from "react";
import { useCamera } from "@/components/use-camera";
import { logMovement, getRecentMovementLogs, type MovementLogRow } from "@/lib/actions/security";

const LOG_POLL_MS = 5000;

interface Tile {
  id: string;
  deviceId: string;
  location: string;
}

const inputClass =
  "w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";

export function SecurityView({ initialLogs }: { initialLogs: MovementLogRow[] }) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [logs, setLogs] = useState<MovementLogRow[]>(initialLogs);

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
      setLogs(await getRecentMovementLogs());
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

  function handleLogged(row: { userName: string; location: string; timestamp: string }) {
    setLogs((prev) => [
      { id: crypto.randomUUID(), userName: row.userName, location: row.location, timestamp: row.timestamp },
      ...prev,
    ].slice(0, 50));
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
            />
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Recent movement</h2>
        <table className="mt-3 w-full max-w-2xl text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
              <th className="py-2 pr-4 font-medium">Employee</th>
              <th className="py-2 pr-4 font-medium">Location</th>
              <th className="py-2 font-medium">Time</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 && (
              <tr>
                <td colSpan={3} className="py-4 text-zinc-500 dark:text-zinc-400">
                  No movement logged yet.
                </td>
              </tr>
            )}
            {logs.map((log) => (
              <tr key={log.id} className="border-b border-zinc-100 dark:border-zinc-900">
                <td className="py-2 pr-4 text-zinc-900 dark:text-zinc-50">{log.userName}</td>
                <td className="py-2 pr-4 text-zinc-700 dark:text-zinc-300">{log.location}</td>
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

function CameraTile({
  tile,
  devices,
  onChange,
  onRemove,
  onLogged,
}: {
  tile: Tile;
  devices: MediaDeviceInfo[];
  onChange: (patch: Partial<Tile>) => void;
  onRemove: () => void;
  onLogged: (row: { userName: string; location: string; timestamp: string }) => void;
}) {
  const { videoRef, ready, error: cameraError, captureFrame } = useCamera(tile.deviceId || undefined);
  const [status, setStatus] = useState<string | null>(null);
  const busyRef = useRef(false);
  const locationRef = useRef(tile.location);
  locationRef.current = tile.location;

  // Back-to-back scanning, no fixed delay between cycles — each scan starts
  // as soon as the previous one finishes (busyRef still guards against two
  // scans overlapping if a round trip runs long).
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;

    async function scanLoop() {
      while (!cancelled) {
        if (!locationRef.current.trim()) {
          setStatus("Set a location label to start logging.");
          await new Promise((r) => setTimeout(r, 500));
          continue;
        }

        const blob = await captureFrame();
        if (!blob) {
          await new Promise((r) => setTimeout(r, 100));
          continue;
        }

        busyRef.current = true;
        const formData = new FormData();
        formData.append("image", blob, "frame.jpg");
        formData.append("location", locationRef.current.trim());
        const result = await logMovement(formData);
        busyRef.current = false;
        if (cancelled) break;

        if (result.success && result.userName && result.location && result.timestamp) {
          setStatus(`${result.userName} — logged`);
          onLogged({ userName: result.userName, location: result.location, timestamp: result.timestamp });
        } else if (result.skipped) {
          setStatus(`${result.userName} — already logged recently`);
        } else if (result.error) {
          setStatus(result.error);
        }
      }
    }

    scanLoop();
    return () => {
      cancelled = true;
    };
  }, [ready, captureFrame]);

  return (
    <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="relative aspect-video w-full overflow-hidden rounded-md bg-zinc-900">
        <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
        {!ready && !cameraError && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-zinc-400">
            Starting camera…
          </div>
        )}
      </div>

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
