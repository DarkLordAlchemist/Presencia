"""Wraps DeepFace with the light-model backend combo verified working
together for this project: MTCNN (detection), SFace (recognition, 128-dim
embeddings), MiniFASNet (liveness, via DeepFace's built-in
anti_spoofing=True path, which returns a raw antispoof_score we apply our
own configurable threshold to rather than trusting DeepFace's fixed
internal is_real cutoff). See requirements.txt for why the detector
backend is MTCNN and not the newer YuNet default.
"""
import numpy as np
from deepface import DeepFace
from deepface.modules.exceptions import FaceNotDetected

DETECTOR_BACKEND = "mtcnn"
RECOGNITION_MODEL = "SFace"


class NoFaceDetected(Exception):
    pass


class MultipleFacesDetected(Exception):
    pass


def _extract_single_face(img, *, check_liveness: bool):
    try:
        faces = DeepFace.extract_faces(
            img_path=img,
            detector_backend=DETECTOR_BACKEND,
            anti_spoofing=check_liveness,
            enforce_detection=True,
        )
    except FaceNotDetected as e:
        raise NoFaceDetected() from e

    if len(faces) == 0:
        raise NoFaceDetected()
    if len(faces) > 1:
        # Security-conscious default for a clock-in terminal: refuse to
        # guess which face is the one punching in if more than one person
        # is in frame.
        raise MultipleFacesDetected()
    return faces[0]


def enroll_embedding(img) -> tuple[list[float], float]:
    """Returns (embedding, face_confidence) for a single clear enrollment
    photo. Liveness is not checked here — enrollment is admin-supervised
    (HR onboarding), unlike an unattended kiosk clock-in."""
    _extract_single_face(img, check_liveness=False)
    reps = DeepFace.represent(
        img_path=img,
        model_name=RECOGNITION_MODEL,
        detector_backend=DETECTOR_BACKEND,
        enforce_detection=True,
    )
    if len(reps) > 1:
        raise MultipleFacesDetected()
    return reps[0]["embedding"], reps[0].get("face_confidence", 0.0)


def check_liveness(img) -> float:
    """Returns the raw antispoof_score (0-1, higher = more likely a live
    person) for the single face in the frame. Deliberately does not decide
    pass/fail itself — the caller compares against the admin-configured
    liveness sensitivity, since DeepFace's own is_real flag uses a fixed
    internal threshold we want to keep tunable."""
    face = _extract_single_face(img, check_liveness=True)
    return face.get("antispoof_score", 0.0)


def verify_embedding(img) -> tuple[list[float], float]:
    """Returns (embedding, face_confidence) for the live frame. Callers
    must call check_liveness on the same frame first — this does not
    re-check liveness itself."""
    _extract_single_face(img, check_liveness=False)
    reps = DeepFace.represent(
        img_path=img,
        model_name=RECOGNITION_MODEL,
        detector_backend=DETECTOR_BACKEND,
        enforce_detection=True,
    )
    if len(reps) > 1:
        raise MultipleFacesDetected()
    return reps[0]["embedding"], reps[0].get("face_confidence", 0.0)


def cosine_similarity(a: list[float], b: list[float]) -> float:
    va, vb = np.array(a), np.array(b)
    denom = np.linalg.norm(va) * np.linalg.norm(vb)
    if denom == 0:
        return 0.0
    return float(np.dot(va, vb) / denom)
