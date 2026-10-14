import "server-only";
import { prisma } from "@/lib/prisma";
import type { SceneResult } from "@/lib/face/engine-client";

export interface SceneSummary {
  offline?: boolean;
  seeing: string; // what the detector found, e.g. "person, chair, 2 cups" — "" if nothing
  lines: string[]; // top person relations, e.g. "person holding cup (0.52)"
  alerts: string[]; // watchlist hits on this frame, e.g. "person holding knife"
  note?: string; // why there are no lines, when that's knowable
}

export interface SceneBox {
  label: string;
  confidence: number;
  box: [number, number, number, number]; // xyxy, in the pixels of the frame that was sent
  alert: boolean; // part of a watchlist hit (either side of the relation)
}

// Lines shown under a camera tile describing the scene.
const SCENE_SUMMARY_LINES = 3;

// Descriptions (tile lines, a movement log's activity) are informational,
// so they use a low fixed floor; alerts use the admin's stricter
// sceneAlertMinScore (applied in scene-engine) so false alarms stay rare.
const SCENE_DESCRIBE_MIN = 0.15;

// Same camera + same watchlist phrase within this window = one alert, not
// one per frame while it stays in view.
const ALERT_DEDUPE_WINDOW_MS = 30_000;

export const OFFLINE_SUMMARY: SceneSummary = { offline: true, seeing: "", lines: [], alerts: [] };

export function personRelations(scene: SceneResult) {
  return scene.relations.filter((r) => r.subject === "person" && r.score >= SCENE_DESCRIBE_MIN);
}

/** "person, chair, 2 cups" — so a tile with no relations still says what
 * the camera can see. */
function describeObjects(scene: SceneResult): string {
  const counts = new Map<string, number>();
  for (const o of scene.objects) counts.set(o.label, (counts.get(o.label) ?? 0) + 1);
  return [...counts.entries()].map(([label, n]) => (n === 1 ? label : `${n} ${label}s`)).join(", ");
}

export function summarizeScene(scene: SceneResult): SceneSummary {
  const relations = personRelations(scene);
  const objectCount = scene.objects.length;
  return {
    seeing: describeObjects(scene),
    note:
      relations.length > 0
        ? undefined
        : objectCount === 0
          ? "Nothing recognizable in view."
          : objectCount === 1
            ? "Only one thing in view — nothing to relate it to."
            : scene.person_count === 0
              ? "No person in view."
              : undefined,
    lines: uniqueBy(relations, (r) => `${r.subject} ${r.predicate} ${r.object}`)
      .slice(0, SCENE_SUMMARY_LINES)
      .map((r) => `${r.subject} ${r.predicate} ${r.object} (${r.score.toFixed(2)})`),
    alerts: uniqueBy(scene.alerts, (a) => a.relation).map((a) => a.relation),
  };
}

/** Keeps the first item per key. Relations arrive best-score first, so this
 * keeps the strongest copy when the detector boxed the same thing twice
 * (two overlapping "keyboard" boxes) and RelateAnything related each one. */
function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const k = key(item);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function sceneBoxes(scene: SceneResult): SceneBox[] {
  const alerted = new Set(scene.alerts.flatMap((a) => [a.subject_index, a.object_index]));
  return scene.objects.map((o, i) => ({
    label: o.label,
    confidence: o.confidence,
    box: [o.box[0], o.box[1], o.box[2], o.box[3]],
    alert: alerted.has(i),
  }));
}

/** Writes one SceneAlert per distinct watchlist phrase hit in this frame,
 * deduped per camera+phrase. Returns whether anything new was written. */
export async function recordSceneAlerts(scene: SceneResult, location: string, userId: string | null): Promise<boolean> {
  const best = new Map<string, SceneResult["alerts"][number]>();
  for (const hit of scene.alerts) {
    const existing = best.get(hit.matched);
    if (!existing || hit.score > existing.score) best.set(hit.matched, hit);
  }

  let wrote = false;
  for (const hit of best.values()) {
    const recent = await prisma.sceneAlert.findFirst({
      where: { location, matched: hit.matched, createdAt: { gte: new Date(Date.now() - ALERT_DEDUPE_WINDOW_MS) } },
    });
    if (recent) continue;
    await prisma.sceneAlert.create({
      data: { location, relation: hit.relation, matched: hit.matched, score: hit.score, userId },
    });
    wrote = true;
  }
  return wrote;
}
