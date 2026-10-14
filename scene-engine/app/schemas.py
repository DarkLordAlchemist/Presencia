from pydantic import BaseModel


class DetectedObject(BaseModel):
    label: str
    confidence: float
    box: list[float]  # xyxy pixels


class Relation(BaseModel):
    subject: str
    subject_index: int
    predicate: str
    object: str
    object_index: int
    score: float


class WatchlistHit(BaseModel):
    relation: str  # "person holding knife"
    matched: str  # the watchlist phrase it matched, "holding knife"
    score: float
    subject_index: int  # into AnalyzeResponse.objects, so the UI can mark both boxes
    object_index: int


class AnalyzeResponse(BaseModel):
    objects: list[DetectedObject]
    relations: list[Relation]
    alerts: list[WatchlistHit]
    person_count: int
    elapsed_ms: float
