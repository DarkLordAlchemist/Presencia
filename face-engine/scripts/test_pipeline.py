"""Self-contained regression test for the face-engine API — real DeepFace
inference against real test images, not mocked. Run with:
    python scripts/test_pipeline.py
Needs test images (not committed) fetched into tmp_test/ first:
  lena.jpg      — a real, well-known face test photo (OpenCV samples).
  nofaceimg.jpg — a photo with no face (OpenCV's HappyFish.jpg sample).
"""
import json
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

client = TestClient(app)
TMP = Path(__file__).resolve().parent.parent / "tmp_test"

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


def main():
    lena = (TMP / "lena.jpg").read_bytes()
    noface = (TMP / "nofaceimg.jpg").read_bytes()

    # 1. Enroll a real face -> get a real embedding back.
    r = client.post("/enroll", files={"image": ("lena.jpg", lena, "image/jpeg")})
    check("enroll returns 200", r.status_code == 200)
    embedding = r.json()["embedding"]
    check("enroll returns a non-empty embedding", len(embedding) > 0)

    # 2. Verify the same photo against its own enrolled embedding -> match.
    candidates = json.dumps([{"user_id": "u1", "embedding": embedding}])
    r = client.post(
        "/verify",
        files={"image": ("lena.jpg", lena, "image/jpeg")},
        data={"candidates": candidates, "threshold": "0.6"},
    )
    body = r.json()
    check("verify (same photo) returns 200", r.status_code == 200)
    check("verify (same photo) matches", body["matched"] is True)
    check("verify (same photo) matched the right user", body["user_id"] == "u1")
    check("verify (same photo) liveness passed", body["liveness_passed"] is True)
    check("verify (same photo) confidence is high", body["confidence"] > 0.9)

    # 3. Verify against an unrelated random embedding with a strict
    # threshold -> should NOT match.
    random.seed(42)
    random_embedding = [random.uniform(-1, 1) for _ in range(len(embedding))]
    candidates = json.dumps([{"user_id": "u2", "embedding": random_embedding}])
    r = client.post(
        "/verify",
        files={"image": ("lena.jpg", lena, "image/jpeg")},
        data={"candidates": candidates, "threshold": "0.9"},
    )
    body = r.json()
    check("verify (random candidate) does not match", body["matched"] is False)
    check(
        "verify (random candidate) reason is no_match_above_threshold",
        body["reason"] == "no_match_above_threshold",
    )

    # 4. A photo with no face -> enroll should fail with 422.
    r = client.post("/enroll", files={"image": ("noface.jpg", noface, "image/jpeg")})
    check("enroll (no face) returns 422", r.status_code == 422)

    # 5. A photo with no face -> verify should report no_face_detected,
    # not a match, not a crash.
    candidates = json.dumps([{"user_id": "u1", "embedding": embedding}])
    r = client.post(
        "/verify",
        files={"image": ("noface.jpg", noface, "image/jpeg")},
        data={"candidates": candidates, "threshold": "0.6"},
    )
    body = r.json()
    check("verify (no face) returns 200", r.status_code == 200)
    check("verify (no face) does not match", body["matched"] is False)
    check("verify (no face) liveness_passed is False", body["liveness_passed"] is False)
    check("verify (no face) reason is no_face_detected", body["reason"] == "no_face_detected")

    print(f"\n{checks_passed} passed, {checks_failed} failed")
    sys.exit(1 if checks_failed else 0)


if __name__ == "__main__":
    main()
