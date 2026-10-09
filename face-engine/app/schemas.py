from pydantic import BaseModel


class EnrollResponse(BaseModel):
    embedding: list[float]
    face_confidence: float


class Candidate(BaseModel):
    user_id: str
    embedding: list[float]


class VerifyResponse(BaseModel):
    matched: bool
    user_id: str | None = None
    confidence: float
    liveness_passed: bool
    reason: str | None = None
