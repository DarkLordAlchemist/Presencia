import json

import cv2
import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, UploadFile

from . import pipeline
from .schemas import Candidate, EnrollResponse, VerifyResponse

app = FastAPI(title="Presencia face-engine")

DEFAULT_MATCH_THRESHOLD = 0.6
DEFAULT_LIVENESS_THRESHOLD = 0.5


def _decode_image(data: bytes) -> np.ndarray:
    img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(status_code=400, detail="Could not decode image.")
    return img


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/enroll", response_model=EnrollResponse)
async def enroll(image: UploadFile = File(...)):
    img = _decode_image(await image.read())
    try:
        embedding, confidence = pipeline.enroll_embedding(img)
    except pipeline.NoFaceDetected:
        raise HTTPException(status_code=422, detail="No face detected in the photo.")
    except pipeline.MultipleFacesDetected:
        raise HTTPException(
            status_code=422,
            detail="More than one face detected — enrollment photo must show exactly one person.",
        )
    return EnrollResponse(embedding=embedding, face_confidence=confidence)


@app.post("/verify", response_model=VerifyResponse)
async def verify(
    image: UploadFile = File(...),
    candidates: str = Form(...),
    threshold: float = Form(DEFAULT_MATCH_THRESHOLD),
    liveness_threshold: float = Form(DEFAULT_LIVENESS_THRESHOLD),
):
    try:
        candidate_list = [Candidate(**c) for c in json.loads(candidates)]
    except (json.JSONDecodeError, TypeError, ValueError) as e:
        raise HTTPException(status_code=400, detail=f"Invalid candidates payload: {e}")

    img = _decode_image(await image.read())

    try:
        antispoof_score = pipeline.check_liveness(img)
    except pipeline.NoFaceDetected:
        return VerifyResponse(
            matched=False, confidence=0.0, liveness_passed=False, reason="no_face_detected"
        )
    except pipeline.MultipleFacesDetected:
        return VerifyResponse(
            matched=False, confidence=0.0, liveness_passed=False, reason="multiple_faces_detected"
        )

    if antispoof_score < liveness_threshold:
        return VerifyResponse(
            matched=False,
            confidence=0.0,
            liveness_passed=False,
            reason="liveness_check_failed",
        )

    # Liveness passed on this frame — now compute its embedding and match.
    try:
        live_embedding, _ = pipeline.verify_embedding(img)
    except pipeline.NoFaceDetected:
        return VerifyResponse(
            matched=False, confidence=0.0, liveness_passed=True, reason="no_face_detected"
        )
    except pipeline.MultipleFacesDetected:
        return VerifyResponse(
            matched=False, confidence=0.0, liveness_passed=True, reason="multiple_faces_detected"
        )

    best_user_id = None
    best_score = -1.0
    for c in candidate_list:
        score = pipeline.cosine_similarity(live_embedding, c.embedding)
        if score > best_score:
            best_score = score
            best_user_id = c.user_id

    if best_user_id is not None and best_score >= threshold:
        return VerifyResponse(
            matched=True,
            user_id=best_user_id,
            confidence=best_score,
            liveness_passed=True,
        )
    return VerifyResponse(
        matched=False,
        confidence=max(best_score, 0.0),
        liveness_passed=True,
        reason="no_match_above_threshold",
    )
