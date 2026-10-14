"""Self-contained regression test for the scene-engine API — real YOLO26m +
RelateAnything inference against real photos, not mocked. Run from
scene-engine/ with RelateAnything's virtualenv python:
    <RelateAnything>\\.venv\\Scripts\\python.exe scripts\\test_scene_engine.py
Test photos are RelateAnything's own sample images, read in place from
RELATEANYTHING_DIR (default C:\\Users\\User\\RelateAnything), not copied.
"""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app, match_watchlist  # noqa: E402
from app.schemas import Relation  # noqa: E402

SAMPLES = Path(os.environ.get("RELATEANYTHING_DIR", r"C:\Users\User\RelateAnything")) / "assets" / "reel" / "images"

checks_passed = 0
checks_failed = 0


def check(label, condition):
    global checks_passed, checks_failed
    if condition:
        checks_passed += 1
        print(f"PASS: {label}")
    else:
        checks_failed += 1
        print(f"FAIL: {label}")


def rel(subject, predicate, obj, score=0.9):
    return Relation(subject=subject, subject_index=0, predicate=predicate, object=obj, object_index=1, score=score)


def main():
    # Pure watchlist-matching rules first (no models needed).
    check("predicate-only phrase matches", match_watchlist(rel("person", "climbing", "chair"), ["climbing"]) == "climbing")
    check("predicate+object phrase matches", match_watchlist(rel("person", "holding", "knife"), ["holding knife"]) == "holding knife")
    check("predicate+object phrase needs the object", match_watchlist(rel("person", "holding", "cup"), ["holding knife"]) is None)
    check("non-person subject never alerts", match_watchlist(rel("dog", "climbing", "chair"), ["climbing"]) is None)
    check("partial word is not a match", match_watchlist(rel("person", "holding", "knife"), ["hold"]) is None)

    with TestClient(app) as client:  # runs startup, i.e. loads both models
        r = client.get("/health")
        check("health returns ok", r.status_code == 200 and r.json()["status"] == "ok")
        check("models loaded at startup", r.json()["loaded"] is True)
        print(f"  device: {r.json()['device']} {r.json()['gpu'] or ''}")

        horse = (SAMPLES / "horse.jpg").read_bytes()
        r = client.post(
            "/analyze",
            files={"image": ("horse.jpg", horse, "image/jpeg")},
            data={"watchlist": "riding, holding knife", "min_score": "0.3"},
        )
        body = r.json()
        check("analyze returns 200", r.status_code == 200)
        check("detects the person", body["person_count"] >= 1)
        top = body["relations"][0] if body["relations"] else None
        check(
            "top relation is person riding horse",
            top is not None and (top["subject"], top["predicate"], top["object"]) == ("person", "riding", "horse"),
        )
        check("watchlist 'riding' raises an alert", any(a["matched"] == "riding" for a in body["alerts"]))
        check("watchlist 'holding knife' does not fire on this photo", not any(a["matched"] == "holding knife" for a in body["alerts"]))

        r = client.post(
            "/analyze",
            files={"image": ("horse.jpg", horse, "image/jpeg")},
            data={"watchlist": "riding", "min_score": "0.99"},
        )
        check("min_score filters out weak alerts", r.status_code == 200 and r.json()["alerts"] == [])

        tennis = (SAMPLES / "tennis.jpg").read_bytes()
        r = client.post(
            "/analyze",
            files={"image": ("tennis.jpg", tennis, "image/jpeg")},
            data={"watchlist": "holding tennis racket", "min_score": "0.3"},
        )
        check(
            "predicate+object alert fires on tennis photo",
            any(a["matched"] == "holding tennis racket" for a in r.json()["alerts"]),
        )

        r = client.post("/analyze", files={"image": ("bad.jpg", b"not an image", "image/jpeg")})
        check("undecodable image returns 400", r.status_code == 400)

    print(f"\n{checks_passed} passed, {checks_failed} failed")
    sys.exit(1 if checks_failed else 0)


if __name__ == "__main__":
    main()
