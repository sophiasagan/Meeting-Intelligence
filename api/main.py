import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import Depends, FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import and_, or_, select, text
from sqlalchemy.orm import Session

from .analyzer import analyze_meeting
from .database import (
    ActionItem,
    Decision,
    Meeting,
    Transcript,
    create_fts_index,
    create_tables,
    get_session,
)
from .transcriber import transcribe

SUPPORTED_AUDIO = {".mp3", ".mp4", ".m4a", ".wav"}
MEETING_TYPES = {"board", "alm_committee", "loan_committee", "department_standup", "other"}

app = FastAPI(title="CU Meeting Intelligence")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup():
    create_tables()
    create_fts_index()


# ---------------------------------------------------------------------------
# Pydantic response models
# ---------------------------------------------------------------------------

class ActionItemOut(BaseModel):
    id: int
    task: str
    owner: str | None
    due_date: str | None
    priority: str
    completed: bool

    model_config = {"from_attributes": True}


class DecisionOut(BaseModel):
    id: int
    decision_text: str
    context: str
    decided_by: str | None

    model_config = {"from_attributes": True}


class MeetingSummary(BaseModel):
    id: int
    title: str
    meeting_type: str
    date: datetime
    duration_seconds: float
    created_at: datetime
    open_action_count: int

    model_config = {"from_attributes": True}


class MeetingDetail(BaseModel):
    id: int
    title: str
    meeting_type: str
    date: datetime
    duration_seconds: float
    audio_filename: str
    created_at: datetime
    transcript: str | None
    segments: list[dict]
    action_items: list[ActionItemOut]
    decisions: list[DecisionOut]

    model_config = {"from_attributes": True}


class PaginatedMeetings(BaseModel):
    total: int
    page: int
    page_size: int
    items: list[MeetingSummary]


class SearchResult(BaseModel):
    meeting_id: int
    title: str
    meeting_type: str
    date: datetime
    snippet: str


class UploadResponse(BaseModel):
    meeting_id: int


class ActionPatch(BaseModel):
    completed: bool


# ---------------------------------------------------------------------------
# POST /meetings/upload
# ---------------------------------------------------------------------------

@app.post("/meetings/upload", response_model=UploadResponse, status_code=201)
async def upload_meeting(
    audio: UploadFile = File(...),
    title: str = Form(...),
    meeting_type: str = Form(...),
    date: str = Form(...),
    db: Session = Depends(get_session),
):
    if meeting_type not in MEETING_TYPES:
        raise HTTPException(400, f"meeting_type must be one of {sorted(MEETING_TYPES)}")

    suffix = Path(audio.filename or "audio.mp3").suffix.lower()
    if suffix not in SUPPORTED_AUDIO:
        raise HTTPException(400, f"Unsupported audio format '{suffix}'")

    try:
        meeting_date = datetime.fromisoformat(date)
    except ValueError:
        raise HTTPException(400, "date must be ISO-8601 (e.g. 2024-03-15T14:00:00)")

    # Write upload to a temp file, transcribe, then delete — audio is transient.
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(await audio.read())
        tmp_path = tmp.name

    try:
        transcription = transcribe(tmp_path)
    finally:
        os.unlink(tmp_path)

    analysis = analyze_meeting(transcription["transcript"], meeting_type)

    meeting = Meeting(
        title=title,
        meeting_type=meeting_type,
        date=meeting_date,
        duration_seconds=transcription["duration_seconds"],
        audio_filename=audio.filename or "upload",
        created_at=datetime.now(timezone.utc),
    )
    db.add(meeting)
    db.flush()  # Get meeting.id before inserting children.

    db.add(
        Transcript(
            meeting_id=meeting.id,
            full_text=transcription["transcript"],
            segments_json=json.dumps(transcription["segments"]),
        )
    )

    for item in analysis.get("action_items", []):
        db.add(
            ActionItem(
                meeting_id=meeting.id,
                task=item["task"],
                owner=item.get("owner"),
                due_date=item.get("due_date"),
                priority=item.get("priority", "medium"),
            )
        )

    for dec in analysis.get("key_decisions", []):
        db.add(
            Decision(
                meeting_id=meeting.id,
                decision_text=dec["decision"],
                context=dec.get("context", ""),
                decided_by=dec.get("decided_by"),
            )
        )

    db.commit()
    return UploadResponse(meeting_id=meeting.id)


# ---------------------------------------------------------------------------
# GET /meetings
# ---------------------------------------------------------------------------

@app.get("/meetings", response_model=PaginatedMeetings)
def list_meetings(
    meeting_type: str | None = Query(None),
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    has_open_actions: bool | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_session),
):
    stmt = select(Meeting)
    filters = []

    if meeting_type:
        if meeting_type not in MEETING_TYPES:
            raise HTTPException(400, f"meeting_type must be one of {sorted(MEETING_TYPES)}")
        filters.append(Meeting.meeting_type == meeting_type)

    if date_from:
        try:
            filters.append(Meeting.date >= datetime.fromisoformat(date_from))
        except ValueError:
            raise HTTPException(400, "date_from must be ISO-8601")

    if date_to:
        try:
            filters.append(Meeting.date <= datetime.fromisoformat(date_to))
        except ValueError:
            raise HTTPException(400, "date_to must be ISO-8601")

    if filters:
        stmt = stmt.where(and_(*filters))

    stmt = stmt.order_by(Meeting.date.desc())

    all_meetings: list[Meeting] = list(db.scalars(stmt).all())

    # Filter by open actions in Python to avoid a complex subquery.
    if has_open_actions is True:
        all_meetings = [
            m for m in all_meetings
            if any(not a.completed for a in m.action_items)
        ]
    elif has_open_actions is False:
        all_meetings = [
            m for m in all_meetings
            if not any(not a.completed for a in m.action_items)
        ]

    total = len(all_meetings)
    start = (page - 1) * page_size
    page_items = all_meetings[start : start + page_size]

    items = [
        MeetingSummary(
            id=m.id,
            title=m.title,
            meeting_type=m.meeting_type,
            date=m.date,
            duration_seconds=m.duration_seconds,
            created_at=m.created_at,
            open_action_count=sum(1 for a in m.action_items if not a.completed),
        )
        for m in page_items
    ]

    return PaginatedMeetings(total=total, page=page, page_size=page_size, items=items)


# ---------------------------------------------------------------------------
# GET /meetings/{id}
# ---------------------------------------------------------------------------

@app.get("/meetings/{meeting_id}", response_model=MeetingDetail)
def get_meeting(meeting_id: int, db: Session = Depends(get_session)):
    meeting = db.get(Meeting, meeting_id)
    if not meeting:
        raise HTTPException(404, "Meeting not found")

    segments: list[dict] = []
    transcript_text: str | None = None
    if meeting.transcript:
        transcript_text = meeting.transcript.full_text
        try:
            segments = json.loads(meeting.transcript.segments_json)
        except (json.JSONDecodeError, TypeError):
            segments = []

    return MeetingDetail(
        id=meeting.id,
        title=meeting.title,
        meeting_type=meeting.meeting_type,
        date=meeting.date,
        duration_seconds=meeting.duration_seconds,
        audio_filename=meeting.audio_filename,
        created_at=meeting.created_at,
        transcript=transcript_text,
        segments=segments,
        action_items=[ActionItemOut.model_validate(a) for a in meeting.action_items],
        decisions=[DecisionOut.model_validate(d) for d in meeting.decisions],
    )


# ---------------------------------------------------------------------------
# PATCH /actions/{id}
# ---------------------------------------------------------------------------

@app.patch("/actions/{action_id}", response_model=ActionItemOut)
def patch_action(
    action_id: int,
    body: ActionPatch,
    db: Session = Depends(get_session),
):
    action = db.get(ActionItem, action_id)
    if not action:
        raise HTTPException(404, "Action item not found")
    action.completed = body.completed
    db.commit()
    db.refresh(action)
    return ActionItemOut.model_validate(action)


# ---------------------------------------------------------------------------
# GET /search
# ---------------------------------------------------------------------------

def _make_snippet(text: str, query: str, radius: int = 120) -> str:
    """Return a short excerpt around the first occurrence of any query term."""
    lower = text.lower()
    for word in query.lower().split():
        pos = lower.find(word)
        if pos != -1:
            start = max(0, pos - radius)
            end = min(len(text), pos + len(word) + radius)
            snippet = text[start:end].strip()
            if start > 0:
                snippet = "…" + snippet
            if end < len(text):
                snippet = snippet + "…"
            return snippet
    return text[:240] + ("…" if len(text) > 240 else "")


@app.get("/search", response_model=list[SearchResult])
def search_transcripts(
    q: str = Query(..., min_length=2),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_session),
):
    from .database import DATABASE_URL

    if DATABASE_URL.startswith("sqlite"):
        # Use FTS5 virtual table for fast full-text search.
        rows = db.execute(
            text(
                """
                SELECT t.id AS transcript_id, t.meeting_id, t.full_text
                FROM transcripts_fts
                JOIN transcripts t ON transcripts_fts.rowid = t.id
                WHERE transcripts_fts MATCH :query
                LIMIT :limit
                """
            ),
            {"query": q, "limit": limit},
        ).fetchall()
        transcript_rows = [
            {"meeting_id": r.meeting_id, "full_text": r.full_text} for r in rows
        ]
    else:
        # Generic ILIKE fallback for PostgreSQL and other engines.
        stmt = select(Transcript).where(
            or_(*[Transcript.full_text.ilike(f"%{term}%") for term in q.split()])
        ).limit(limit)
        transcript_rows = [
            {"meeting_id": t.meeting_id, "full_text": t.full_text}
            for t in db.scalars(stmt).all()
        ]

    results: list[SearchResult] = []
    for row in transcript_rows:
        meeting = db.get(Meeting, row["meeting_id"])
        if not meeting:
            continue
        results.append(
            SearchResult(
                meeting_id=meeting.id,
                title=meeting.title,
                meeting_type=meeting.meeting_type,
                date=meeting.date,
                snippet=_make_snippet(row["full_text"], q),
            )
        )

    return results
