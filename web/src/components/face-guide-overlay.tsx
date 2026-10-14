"use client";

import { useEffect, useRef, useState } from "react";

// A light wireframe face drawn over the camera feed as a positioning guide.
// It's a fixed model (a head ellipsoid plus eyes/brows/nose/mouth), rotated
// in 3D and projected to SVG — not face tracking. It shows where to put your
// face and which way to turn; whether a photo is actually usable is still
// decided by face-engine.
//
// Angles are in degrees, as the face appears ON SCREEN. The camera feed is
// not mirrored, so a person turning to their own left shows up turned
// toward the screen's right: positive yaw = nose toward screen right,
// positive pitch = chin up.

export interface FaceGuideAngle {
  yaw: number;
  pitch: number;
}

type Vec3 = [number, number, number];

// Head ellipsoid half-axes, in units of half the head's height.
const A = 0.74; // width
const B = 1.0; // height
const C = 0.8; // depth

const VIEW_W = 160;
const VIEW_H = 90;
const CENTER_X = VIEW_W / 2;
const CENTER_Y = VIEW_H / 2;
const SCALE = 30; // head half-height in viewBox units (~2/3 of the frame height)
const CAMERA_DISTANCE = 5; // in head units — enough perspective to read as 3D, not distorted

const deg = (d: number) => (d * Math.PI) / 180;

/** A point on the front of the head surface at (x, y), lifted by `lift`
 * (for the nose, which stands off the ellipsoid). */
function onSurface(x: number, y: number, lift = 0): Vec3 {
  const inside = 1 - (x / A) ** 2 - (y / B) ** 2;
  return [x, y, C * Math.sqrt(Math.max(inside, 0)) + lift];
}

function range(from: number, to: number, steps: number) {
  return Array.from({ length: steps + 1 }, (_, i) => from + ((to - from) * i) / steps);
}

// Contour mesh: a few longitude and latitude lines over the head.
const MERIDIANS: Vec3[][] = [-50, -25, 0, 25, 50].map((lon) =>
  range(-75, 75, 24).map((lat) => [
    A * Math.cos(deg(lat)) * Math.sin(deg(lon)),
    B * Math.sin(deg(lat)),
    C * Math.cos(deg(lat)) * Math.cos(deg(lon)),
  ]),
);
const PARALLELS: Vec3[][] = [-45, -15, 15, 45].map((lat) =>
  range(-90, 90, 30).map((lon) => [
    A * Math.cos(deg(lat)) * Math.sin(deg(lon)),
    B * Math.sin(deg(lat)),
    C * Math.cos(deg(lat)) * Math.cos(deg(lon)),
  ]),
);

function eye(cx: number): Vec3[] {
  return range(0, 360, 16).map((t) => onSurface(cx + 0.12 * Math.cos(deg(t)), 0.14 + 0.045 * Math.sin(deg(t)), 0.01));
}

function brow(side: 1 | -1): Vec3[] {
  return range(0, 1, 8).map((t) => onSurface(side * (0.13 + 0.33 * t), 0.3 + 0.06 * Math.sin(Math.PI * t), 0.01));
}

const FEATURES: Vec3[][] = [
  eye(-0.31),
  eye(0.31),
  brow(-1),
  brow(1),
  // Nose bridge down to the tip, standing further off the face toward the tip.
  range(0, 1, 8).map((t) => onSurface(0, 0.18 - 0.42 * t, 0.24 * t * t)),
  // Nose base, tip to each nostril.
  range(-1, 1, 10).map((t) => onSurface(0.13 * t, -0.27 + 0.03 * Math.abs(t), 0.2 * (1 - Math.abs(t)) + 0.04)),
  // Mouth — upper and lower lip.
  range(-1, 1, 12).map((t) => onSurface(0.24 * t, -0.52 + 0.02 * (1 - t * t), 0.02)),
  range(-1, 1, 12).map((t) => onSurface(0.22 * t, -0.53 - 0.05 * (1 - t * t), 0.02)),
];

function rotate([x, y, z]: Vec3, yaw: number, pitch: number): Vec3 {
  // Yaw about the vertical axis: positive turns the front of the face toward +x (screen right).
  const cy = Math.cos(deg(yaw));
  const sy = Math.sin(deg(yaw));
  const x1 = x * cy + z * sy;
  const z1 = -x * sy + z * cy;
  // Pitch about the horizontal axis: positive tips the front of the face up (chin up).
  const cp = Math.cos(deg(pitch));
  const sp = Math.sin(deg(pitch));
  const y2 = y * cp + z1 * sp;
  const z2 = -y * sp + z1 * cp;
  return [x1, y2, z2];
}

function project([x, y, z]: Vec3): [number, number] {
  const f = CAMERA_DISTANCE / (CAMERA_DISTANCE - z);
  return [CENTER_X + x * f * SCALE, CENTER_Y - y * f * SCALE];
}

/** Projects a polyline, splitting it wherever it passes behind the head so
 * the far side isn't drawn through the face. */
function toPaths(points: Vec3[], yaw: number, pitch: number): string[] {
  const paths: string[] = [];
  let current: string[] = [];
  for (const p of points) {
    const r = rotate(p, yaw, pitch);
    if (r[2] < 0.02) {
      if (current.length > 1) paths.push("M" + current.join("L"));
      current = [];
      continue;
    }
    const [sx, sy] = project(r);
    current.push(`${sx.toFixed(2)},${sy.toFixed(2)}`);
  }
  if (current.length > 1) paths.push("M" + current.join("L"));
  return paths;
}

/** The head's silhouette — for small turns, a rotated ellipsoid's outline is
 * close to an ellipse whose half-width/height blend the ellipsoid's axes. */
function outline(yaw: number, pitch: number) {
  const rx = Math.hypot(A * Math.cos(deg(yaw)), C * Math.sin(deg(yaw)));
  const ry = Math.hypot(B * Math.cos(deg(pitch)), C * Math.sin(deg(pitch)));
  // The silhouette sits at z≈0, so it gets no perspective scaling.
  return { rx: rx * SCALE, ry: ry * SCALE };
}

/** Eases the drawn angle toward the target so a pose change reads as the
 * head turning, not a jump. */
function useEasedAngle(target: FaceGuideAngle): FaceGuideAngle {
  const [angle, setAngle] = useState(target);
  const angleRef = useRef(target);

  useEffect(() => {
    let frame = 0;
    const step = () => {
      const cur = angleRef.current;
      const next = {
        yaw: cur.yaw + (target.yaw - cur.yaw) * 0.12,
        pitch: cur.pitch + (target.pitch - cur.pitch) * 0.12,
      };
      const done = Math.abs(next.yaw - target.yaw) < 0.05 && Math.abs(next.pitch - target.pitch) < 0.05;
      angleRef.current = done ? target : next;
      setAngle(angleRef.current);
      if (!done) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target.yaw, target.pitch]); // eslint-disable-line react-hooks/exhaustive-deps

  return angle;
}

export function FaceGuideOverlay({
  angle = { yaw: 0, pitch: 0 },
  tone = "neutral",
  pulse = false,
  caption,
}: {
  angle?: FaceGuideAngle;
  tone?: "neutral" | "success";
  pulse?: boolean;
  caption?: string;
}) {
  const { yaw, pitch } = useEasedAngle(angle);
  const { rx, ry } = outline(yaw, pitch);
  const lines = [...MERIDIANS, ...PARALLELS].flatMap((pts) => toPaths(pts, yaw, pitch));
  const features = FEATURES.flatMap((pts) => toPaths(pts, yaw, pitch));
  const color = tone === "success" ? "#4ade80" : "#ffffff";

  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="xMidYMid meet"
        className={`h-full w-full ${pulse ? "animate-pulse" : ""}`}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* Dark underlay so the lines stay visible over a bright background. */}
        <g stroke="#000000" strokeOpacity={0.35} strokeWidth={0.9}>
          <ellipse cx={CENTER_X} cy={CENTER_Y} rx={rx} ry={ry} />
          {features.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </g>
        <g stroke={color}>
          <ellipse cx={CENTER_X} cy={CENTER_Y} rx={rx} ry={ry} strokeWidth={0.5} strokeOpacity={0.8} />
          {lines.map((d, i) => (
            <path key={i} d={d} strokeWidth={0.25} strokeOpacity={0.45} />
          ))}
          {features.map((d, i) => (
            <path key={i} d={d} strokeWidth={0.45} strokeOpacity={0.85} />
          ))}
        </g>
      </svg>
      {caption && (
        <p className="absolute inset-x-0 bottom-2 text-center text-xs font-medium text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
          {caption}
        </p>
      )}
    </div>
  );
}
