"""Presencia scene-engine: what is happening in a Security camera frame.

YOLO26m finds people and objects, then RelateAnything (open-vocabulary
relation prediction) ranks how they relate — "person holding knife",
"person climbing chair". The web app sends each Security tile's frame here
alongside its face-engine scan and turns watchlist hits into SceneAlerts.

Deliberately a separate service from face-engine: this runs on PyTorch
(CUDA), face-engine on a pinned TensorFlow/numpy stack, and mixing the two
in one environment risks breaking the face recognition that already works.
RelateAnything is used unmodified, as an installed package (AGPL-3.0).
"""
import io
import os
import threading
import time
from contextlib import asynccontextmanager

import torch
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from PIL import Image
from ultralytics import YOLO

from relsgg import RelateAnything

from .schemas import AnalyzeResponse, DetectedObject, Relation, WatchlistHit

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
DETECTOR_WEIGHTS = os.environ.get("SCENE_DETECTOR_WEIGHTS", "yolo26m.pt")
RELATION_MODEL = os.environ.get("SCENE_RELATION_MODEL", "maelic/relsgg-vits16plus")
# Low enough to keep small handheld things (phone, cup, bottle, scissors) a
# webcam sees at an angle; at 0.4 those were dropped, leaving a lone
# "person" box and nothing for RelateAnything to relate it to.
DETECTOR_CONF = 0.25
TOP_K = 15

# Security-relevant predicates. RelateAnything is open-vocabulary, so these
# are plain strings encoded once at startup — the default vocabulary is
# general-purpose (wearing, posing with, ...), this one adds the actions a
# security desk actually cares about and drops ones that are only noise
# here ("part of", "contained in").
SECURITY_PREDICATES = [
    "holding", "carrying", "using", "wearing", "riding",
    "pointing at", "hitting", "kicking", "pushing", "fighting with",
    "climbing", "jumping over", "lying on", "sitting on", "standing on",
    "opening", "leaning against", "looking at", "talking to",
    "walking past", "standing beside", "next to", "behind", "in front of",
]

_detector: YOLO | None = None
_relations: RelateAnything | None = None
# Both models are shared across requests; several camera tiles can post at
# once, and neither model is documented as safe for concurrent calls.
_lock = threading.Lock()


def _models() -> tuple[YOLO, RelateAnything]:
    global _detector, _relations
    if _detector is None or _relations is None:
        _detector = YOLO(DETECTOR_WEIGHTS)
        _relations = RelateAnything.from_pretrained(RELATION_MODEL, device=DEVICE)
        _relations.set_vocabulary(SECURITY_PREDICATES)
    return _detector, _relations


@asynccontextmanager
async def _lifespan(_app: FastAPI):
    # Load (and on a first run, download) both models before the first
    # camera frame arrives, so that frame isn't the one that waits.
    _models()
    yield


app = FastAPI(title="Presencia scene-engine", lifespan=_lifespan)


@app.get("/health")
def health():
    return {
        "status": "ok",
        "device": DEVICE,
        "gpu": torch.cuda.get_device_name(0) if DEVICE == "cuda" else None,
        "loaded": _relations is not None,
    }


def _parse_watchlist(raw: str) -> list[str]:
    return [w.strip().lower() for w in raw.split(",") if w.strip()]


def match_watchlist(relation: Relation, watchlist: list[str]) -> str | None:
    """A phrase matches on the predicate alone ("climbing") or on
    "<predicate> <object>" ("holding knife"). Only relations whose subject
    is a person count — a "chair behind table" is never an alert."""
    if relation.subject != "person":
        return None
    predicate = relation.predicate.lower()
    full = f"{predicate} {relation.object.lower()}"
    for phrase in watchlist:
        if phrase == predicate or phrase == full:
            return phrase
    return None


@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze(
    image: UploadFile = File(...),
    watchlist: str = Form(""),
    min_score: float = Form(0.4),
):
    try:
        img = Image.open(io.BytesIO(await image.read())).convert("RGB")
    except Exception:
        raise HTTPException(status_code=400, detail="Could not decode image.")

    started = time.perf_counter()
    with _lock:
        detector, relations = _models()
        result = detector(img, conf=DETECTOR_CONF, verbose=False, device=0 if DEVICE == "cuda" else "cpu")[0]
        boxes = result.boxes.xyxy.cpu().numpy()
        scores = result.boxes.conf.cpu().numpy()
        labels = [result.names[int(c)] for c in result.boxes.cls]
        # box_scores deliberately not passed: RelateAnything would multiply
        # every relation score by both boxes' detector confidences, so a
        # strong "sitting on chair" (0.7) with a 0.5-confidence chair came out
        # ~0.28 and fell under every threshold. DETECTOR_CONF already decides
        # which boxes count; scores here are the relation's own.
        triplets = (
            relations.predict(img, boxes, box_labels=labels, topk=TOP_K)
            if len(boxes) >= 2
            else []
        )
    elapsed_ms = (time.perf_counter() - started) * 1000

    objects = [
        DetectedObject(label=label, confidence=float(conf), box=[float(v) for v in box])
        for label, conf, box in zip(labels, scores, boxes)
    ]
    rels = [
        Relation(
            subject=t.subject_label or f"obj{t.subject_idx}",
            subject_index=int(t.subject_idx),
            predicate=t.predicate,
            object=t.object_label or f"obj{t.object_idx}",
            object_index=int(t.object_idx),
            score=float(t.score),
        )
        for t in triplets
    ]

    phrases = _parse_watchlist(watchlist)
    hits = []
    for r in rels:
        if r.score < min_score:
            continue
        matched = match_watchlist(r, phrases)
        if matched:
            hits.append(
                WatchlistHit(
                    relation=f"{r.subject} {r.predicate} {r.object}",
                    matched=matched,
                    score=r.score,
                    subject_index=r.subject_index,
                    object_index=r.object_index,
                )
            )

    return AnalyzeResponse(
        objects=objects,
        relations=rels,
        alerts=hits,
        person_count=sum(1 for o in objects if o.label == "person"),
        elapsed_ms=elapsed_ms,
    )

