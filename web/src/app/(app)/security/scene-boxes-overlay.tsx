"use client";

import type { SceneBox } from "@/lib/security/scene";

const COLORS = {
  person: "#3b82f6", // blue
  object: "#a1a1aa", // zinc-400
  alert: "#ef4444", // red
};

const area = (b: SceneBox) => (b.box[2] - b.box[0]) * (b.box[3] - b.box[1]);

/** Live detection boxes over a camera tile's video. Box coordinates are in
 * the pixels of the (downscaled) frame that was analyzed, so the SVG uses
 * that frame as its viewBox; "xMidYMid slice" crops the same way the
 * video's object-cover does, so boxes stay on what they mark. */
export function SceneBoxesOverlay({
  boxes,
  frameWidth,
  frameHeight,
  personName,
}: {
  boxes: SceneBox[];
  frameWidth: number;
  frameHeight: number;
  personName?: string | null; // shown on the person box when there's exactly one
}) {
  if (frameWidth === 0 || frameHeight === 0) return null;
  const persons = boxes.filter((b) => b.label === "person").length;
  const fontSize = Math.max(frameHeight * 0.04, 10);
  const stroke = Math.max(frameHeight * 0.006, 1.5);
  const laid = boxes.map((b) => {
    const isPerson = b.label === "person";
    const name = isPerson && persons === 1 && personName ? personName : b.label;
    return {
      b,
      color: b.alert ? COLORS.alert : isPerson ? COLORS.person : COLORS.object,
      text: `${name} ${b.confidence.toFixed(2)}`,
      priority: b.alert ? 2 : isPerson ? 1 : 0,
    };
  });

  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox={`0 0 ${frameWidth} ${frameHeight}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      {/* Boxes first, then labels, so a label is never hidden under another
          box's outline; labels for people and alert objects are drawn last
          (on top) since those matter most when labels overlap, and within
          that, bigger (usually nearer) objects win over small distant ones. */}
      {laid.map(({ b, color }, i) => {
        const [x1, y1, x2, y2] = b.box;
        return (
          <rect
            key={`box-${i}`}
            x={x1}
            y={y1}
            width={Math.max(x2 - x1, 1)}
            height={Math.max(y2 - y1, 1)}
            fill="none"
            stroke={color}
            strokeWidth={b.alert ? stroke * 1.6 : stroke}
          />
        );
      })}
      {[...laid]
        .sort((p, q) => p.priority - q.priority || area(p.b) - area(q.b))
        .map(({ b, color, text }, i) => {
          const [x1, y1] = b.box;
          const labelH = fontSize * 1.35;
          const labelW = text.length * fontSize * 0.58 + fontSize * 0.6;
          // On top of the box, or just inside it when the box touches the
          // top of the frame.
          const labelY = y1 - labelH >= 0 ? y1 - labelH : y1;
          return (
            <g key={`label-${i}`}>
              <rect x={x1} y={labelY} width={labelW} height={labelH} fill={color} fillOpacity={0.85} />
              <text
                x={x1 + fontSize * 0.3}
                y={labelY + labelH * 0.75}
                fontSize={fontSize}
                fontFamily="ui-sans-serif, system-ui, sans-serif"
                fontWeight={600}
                fill="#ffffff"
              >
                {text}
              </text>
            </g>
          );
        })}
    </svg>
  );
}
