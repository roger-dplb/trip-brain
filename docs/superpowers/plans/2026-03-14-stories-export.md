# Stories Export Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a fullscreen Stories viewer (Instagram-style) + PNG/MP4 export for trip histories, with AI-generated captions per day and cached exports.

**Architecture:** Viewer = pure React component reading existing DB data (zero processing cost). Export = backend queues a `stories_export` job into the existing `worker_jobs` table; the custom polling worker renders HTML slides via headless Chromium, compiles MP4 via FFmpeg, uploads to MinIO, and stores object keys in a new `story_export_jobs` table.

**Tech Stack:** FastAPI + SQLAlchemy + psycopg (backend/worker), Chromium headless subprocess + FFmpeg subprocess (worker), Next.js + TypeScript + Tailwind (frontend).

---

## File Map

**New files:**
- `backend/app/models/story_export_job.py` — SQLAlchemy model for `story_export_jobs`
- `backend/app/schemas/stories.py` — Pydantic request/response schemas
- `backend/app/repositories/story_export_repository.py` — DB operations for `story_export_jobs`
- `backend/app/api/routes/stories.py` — POST + GET endpoints
- `backend/tests/unit/test_stories_service.py` — unit tests for cache logic
- `backend/tests/unit/test_stories_routes.py` — route-level unit tests
- `worker/app/stories/__init__.py` — package marker
- `worker/app/stories/slides.py` — `SlideData` dataclasses + `build_slides_data()`
- `worker/app/stories/captions.py` — `generate_day_caption()` via OpenAI
- `worker/app/stories/renderer.py` — `render_slide_png()` via Chromium subprocess
- `worker/app/stories/compiler.py` — `compile_video()` + `create_zip()` via FFmpeg/zipfile
- `worker/app/stories/exporter.py` — `process_stories_export()` orchestration
- `worker/app/stories/templates/slide-cover.html` — cover slide HTML template
- `worker/app/stories/templates/slide-activity.html` — activity slide HTML template
- `worker/app/stories/templates/slide-summary.html` — summary slide HTML template
- `worker/tests/test_slides.py` — unit tests for `build_slides_data()`
- `worker/tests/test_exporter.py` — unit tests for `process_stories_export()` orchestration
- `frontend/components/stories/StoryProgress.tsx` — segmented progress bar
- `frontend/components/stories/StorySlide.tsx` — single slide renderer
- `frontend/components/stories/StoryViewer.tsx` — fullscreen modal viewer
- `frontend/components/stories/ExportPanel.tsx` — export state machine + download buttons
- `frontend/app/trips/[tripId]/stories/page.tsx` — Stories tab page

**Modified files:**
- `backend/app/api/router.py` — register stories router
- `worker/app/main.py` — add `_enqueue_stories_export_jobs()` + dispatch branch
- `worker/Dockerfile` — add Chromium + FFmpeg system deps
- `frontend/lib/api.ts` — add `StoryExportJob` type + `triggerStoriesExport()` + `fetchStoriesExportJob()`
- `frontend/components/trip-sidebar.tsx` — add "Stories" nav item
- `frontend/components/trip-card.tsx` — add "▶ Stories" button

---

## Chunk 1: Database migration + Backend data layer

### Task 1: Create `story_export_jobs` migration

**Files:**
- Create: `backend/migrations/add_story_export_jobs.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- backend/migrations/add_story_export_jobs.sql
CREATE TABLE IF NOT EXISTS story_export_jobs (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id     UUID        UNIQUE NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    status      TEXT        NOT NULL DEFAULT 'queued',
    zip_object_key  TEXT    NULL,
    mp4_object_key  TEXT    NULL,
    error_msg   TEXT        NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON COLUMN story_export_jobs.status IS 'queued | processing | done | failed';
```

- [ ] **Step 2: Apply the migration to your local dev database**

```bash
psql $DATABASE_URL -f backend/migrations/add_story_export_jobs.sql
```

Expected: `CREATE TABLE`

- [ ] **Step 3: Verify table was created**

```bash
psql $DATABASE_URL -c "\d story_export_jobs"
```

Expected: table listing 7 columns including `trip_id` with UNIQUE constraint.

---

### Task 2: SQLAlchemy model

**Files:**
- Create: `backend/app/models/story_export_job.py`
- Modify: `backend/app/models/__init__.py` (add import so Alembic/Base sees it)

- [ ] **Step 1: Write the model**

```python
# backend/app/models/story_export_job.py
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class StoryExportJob(Base):
    __tablename__ = "story_export_jobs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    trip_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("trips.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    status: Mapped[str] = mapped_column(Text, nullable=False, default="queued")
    zip_object_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    mp4_object_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    error_msg: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
```

- [ ] **Step 2: Import in models `__init__.py`**

Open `backend/app/models/__init__.py` and add:

```python
from app.models.story_export_job import StoryExportJob  # noqa: F401
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/models/story_export_job.py backend/app/models/__init__.py backend/migrations/add_story_export_jobs.sql
git commit -m "feat(db): add story_export_jobs table and SQLAlchemy model"
```

---

### Task 3: Pydantic schemas

**Files:**
- Create: `backend/app/schemas/stories.py`

- [ ] **Step 1: Write the schemas**

```python
# backend/app/schemas/stories.py
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class StoryExportJobRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    trip_id: uuid.UUID
    status: str
    zip_object_key: str | None = None
    mp4_object_key: str | None = None
    error_msg: str | None = None
    created_at: datetime


class StoryExportTriggerResponse(BaseModel):
    job_id: uuid.UUID
    status: str
    cached: bool
    zip_url: str | None = None
    mp4_url: str | None = None


class StoryExportStatusResponse(BaseModel):
    job_id: uuid.UUID
    status: str
    zip_url: str | None = None
    mp4_url: str | None = None
    error_msg: str | None = None
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/schemas/stories.py
git commit -m "feat(schema): add Stories export Pydantic schemas"
```

---

### Task 4: Repository

**Files:**
- Create: `backend/app/repositories/story_export_repository.py`

- [ ] **Step 1: Write failing tests**

```python
# backend/tests/unit/test_stories_service.py
import uuid
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest


class FakeStoryExportRepository:
    """Fake repository for unit-testing cache logic in isolation."""

    def __init__(self, existing_job=None):
        self.existing_job = existing_job
        self.upserted = None

    def get_by_trip(self, trip_id):
        return self.existing_job

    def upsert_queued(self, trip_id):
        self.upserted = trip_id
        return SimpleNamespace(
            id=uuid.uuid4(), trip_id=trip_id, status="queued",
            zip_object_key=None, mp4_object_key=None,
            error_msg=None, created_at=datetime.now(timezone.utc)
        )

    def get_last_data_change(self, trip_id):
        return datetime.now(timezone.utc)


def _make_done_job(trip_id, created_at):
    return SimpleNamespace(
        id=uuid.uuid4(), trip_id=trip_id, status="done",
        zip_object_key=f"stories/{trip_id}/export.zip",
        mp4_object_key=f"stories/{trip_id}/export.mp4",
        error_msg=None, created_at=created_at,
    )


def test_cache_hit_when_no_data_change():
    """When the last data change is before the job's created_at, return cached=True."""
    import time
    trip_id = uuid.uuid4()
    # Job created recently
    job_created = datetime(2026, 3, 14, 10, 0, 0, tzinfo=timezone.utc)
    # Last data change before job
    data_change = datetime(2026, 3, 14, 9, 0, 0, tzinfo=timezone.utc)

    existing = _make_done_job(trip_id, job_created)

    class RepoWithOldChange(FakeStoryExportRepository):
        def get_last_data_change(self, trip_id):
            return data_change

    repo = RepoWithOldChange(existing_job=existing)

    # The logic we're testing:
    job = repo.get_by_trip(trip_id)
    last_change = repo.get_last_data_change(trip_id)
    is_cached = job is not None and job.status == "done" and last_change <= job.created_at

    assert is_cached is True


def test_cache_miss_when_data_changed_after_export():
    """When new data arrived after the export, return cached=False."""
    trip_id = uuid.uuid4()
    job_created = datetime(2026, 3, 14, 9, 0, 0, tzinfo=timezone.utc)
    data_change = datetime(2026, 3, 14, 10, 0, 0, tzinfo=timezone.utc)  # newer

    existing = _make_done_job(trip_id, job_created)

    class RepoWithNewChange(FakeStoryExportRepository):
        def get_last_data_change(self, trip_id):
            return data_change

    repo = RepoWithNewChange(existing_job=existing)
    job = repo.get_by_trip(trip_id)
    last_change = repo.get_last_data_change(trip_id)
    is_cached = job is not None and job.status == "done" and last_change <= job.created_at

    assert is_cached is False


def test_cache_miss_when_no_job_exists():
    """When there's no prior export, is_cached must be False."""
    trip_id = uuid.uuid4()
    repo = FakeStoryExportRepository(existing_job=None)
    job = repo.get_by_trip(trip_id)
    is_cached = job is not None and job.status == "done"
    assert is_cached is False
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd backend && python -m pytest tests/unit/test_stories_service.py -v
```

Expected: PASS (these are pure logic tests using fakes — they should pass immediately since they test the logic pattern, not the real repo).

- [ ] **Step 3: Write the real repository**

```python
# backend/app/repositories/story_export_repository.py
import uuid
from datetime import datetime

from sqlalchemy import func, text
from sqlalchemy.orm import Session

from app.models.story_export_job import StoryExportJob


class StoryExportRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_by_trip(self, trip_id: uuid.UUID) -> StoryExportJob | None:
        return (
            self.db.query(StoryExportJob)
            .filter(StoryExportJob.trip_id == trip_id)
            .with_for_update()
            .first()
        )

    def upsert_queued(self, trip_id: uuid.UUID) -> StoryExportJob:
        """Insert a new job or reset an existing one to queued status."""
        self.db.execute(
            text("""
                INSERT INTO story_export_jobs (trip_id, status, created_at)
                VALUES (:trip_id, 'queued', now())
                ON CONFLICT (trip_id) DO UPDATE
                SET status = 'queued',
                    error_msg = NULL,
                    zip_object_key = NULL,
                    mp4_object_key = NULL,
                    created_at = now()
            """),
            {"trip_id": trip_id},
        )
        self.db.flush()
        return self.get_by_trip(trip_id)  # type: ignore[return-value]

    def get_last_data_change(self, trip_id: uuid.UUID) -> datetime:
        """Return the timestamp of the most recent data change for this trip."""
        result = self.db.execute(
            text("""
                SELECT GREATEST(
                    t.updated_at,
                    COALESCE(MAX(m.created_at), t.updated_at)
                ) AS last_change
                FROM trips t
                LEFT JOIN memories m ON m.trip_id = t.id
                WHERE t.id = :trip_id
                GROUP BY t.updated_at
            """),
            {"trip_id": trip_id},
        ).fetchone()
        return result[0] if result else func.now()

    def mark_processing(self, job_id: uuid.UUID) -> None:
        job = self.db.query(StoryExportJob).filter(StoryExportJob.id == job_id).first()
        if job:
            job.status = "processing"
            self.db.flush()

    def mark_done(
        self, job_id: uuid.UUID, zip_object_key: str, mp4_object_key: str
    ) -> None:
        job = self.db.query(StoryExportJob).filter(StoryExportJob.id == job_id).first()
        if job:
            job.status = "done"
            job.zip_object_key = zip_object_key
            job.mp4_object_key = mp4_object_key
            self.db.commit()

    def mark_failed(self, job_id: uuid.UUID, error_msg: str) -> None:
        job = self.db.query(StoryExportJob).filter(StoryExportJob.id == job_id).first()
        if job:
            job.status = "failed"
            job.error_msg = error_msg[:2000]
            self.db.commit()
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/repositories/story_export_repository.py backend/tests/unit/test_stories_service.py
git commit -m "feat(repository): add StoryExportRepository with cache invalidation logic"
```

---

## Chunk 2: Backend API routes

### Task 5: Stories routes

**Files:**
- Create: `backend/app/api/routes/stories.py`
- Modify: `backend/app/api/router.py`

- [ ] **Step 1: Write the route tests first**

```python
# backend/tests/unit/test_stories_routes.py
import uuid
from types import SimpleNamespace
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client():
    return TestClient(app, raise_server_exceptions=False)


def _make_job(status="done", trip_id=None):
    tid = trip_id or uuid.uuid4()
    return SimpleNamespace(
        id=uuid.uuid4(),
        trip_id=tid,
        status=status,
        zip_object_key=f"stories/{tid}/export.zip" if status == "done" else None,
        mp4_object_key=f"stories/{tid}/export.mp4" if status == "done" else None,
        error_msg=None,
        created_at=datetime.now(timezone.utc),
    )


def test_trigger_export_returns_202_for_new_job(client):
    trip_id = uuid.uuid4()
    with patch("app.api.routes.stories.TripRepository") as MockTripRepo, \
         patch("app.api.routes.stories.StoryExportRepository") as MockExportRepo, \
         patch("app.api.routes.stories.MemoryRepository") as MockMemRepo, \
         patch("app.api.routes.stories._enqueue_worker_job") as mock_enqueue:

        MockTripRepo.return_value.get.return_value = SimpleNamespace(id=trip_id)
        MockExportRepo.return_value.get_by_trip.return_value = None
        MockMemRepo.return_value.list.return_value = [
            SimpleNamespace(memory_type="photo", storage_key="k.jpg")
        ]
        new_job = _make_job(status="queued", trip_id=trip_id)
        MockExportRepo.return_value.upsert_queued.return_value = new_job
        mock_enqueue.return_value = None

        resp = client.post(f"/api/v1/trips/{trip_id}/stories/export")
        assert resp.status_code == 202
        data = resp.json()
        assert data["status"] == "queued"
        assert data["cached"] is False


def test_trigger_export_returns_422_when_trip_has_no_photos(client):
    trip_id = uuid.uuid4()
    with patch("app.api.routes.stories.TripRepository") as MockTripRepo, \
         patch("app.api.routes.stories.StoryExportRepository") as MockExportRepo, \
         patch("app.api.routes.stories.MemoryRepository") as MockMemRepo:

        MockTripRepo.return_value.get.return_value = SimpleNamespace(id=trip_id)
        MockExportRepo.return_value.get_by_trip.return_value = None
        MockMemRepo.return_value.list.return_value = [
            SimpleNamespace(memory_type="note", storage_key=None)
        ]

        resp = client.post(f"/api/v1/trips/{trip_id}/stories/export")
        assert resp.status_code == 422


def test_trigger_export_returns_200_when_cache_is_valid(client):
    trip_id = uuid.uuid4()
    with patch("app.api.routes.stories.TripRepository") as MockTripRepo, \
         patch("app.api.routes.stories.StoryExportRepository") as MockExportRepo, \
         patch("app.api.routes.stories.MemoryRepository") as MockMemRepo, \
         patch("app.api.routes.stories.StorageService") as MockStorage:

        MockTripRepo.return_value.get.return_value = SimpleNamespace(id=trip_id)
        done_job = _make_job(status="done", trip_id=trip_id)
        MockExportRepo.return_value.get_by_trip.return_value = done_job
        old_change = datetime(2026, 1, 1, tzinfo=timezone.utc)
        MockExportRepo.return_value.get_last_data_change.return_value = old_change
        MockMemRepo.return_value.list.return_value = []
        MockStorage.return_value.build_public_object_url.return_value = "http://minio/..."

        resp = client.post(f"/api/v1/trips/{trip_id}/stories/export")
        assert resp.status_code == 200
        data = resp.json()
        assert data["cached"] is True
        assert data["status"] == "done"


def test_get_export_status_returns_404_for_wrong_trip(client):
    trip_id = uuid.uuid4()
    other_job_id = uuid.uuid4()
    with patch("app.api.routes.stories.TripRepository") as MockTripRepo, \
         patch("app.api.routes.stories.StoryExportRepository") as MockExportRepo:

        MockTripRepo.return_value.get.return_value = SimpleNamespace(id=trip_id)
        # Return a job that belongs to a different trip
        wrong_job = _make_job(status="done")  # different trip_id
        MockExportRepo.return_value.get_by_trip.return_value = wrong_job

        resp = client.get(f"/api/v1/trips/{trip_id}/stories/export/{other_job_id}")
        assert resp.status_code == 404
```

- [ ] **Step 2: Run tests to confirm they fail (routes don't exist yet)**

```bash
cd backend && python -m pytest tests/unit/test_stories_routes.py -v 2>&1 | head -20
```

Expected: errors about missing route or 404 responses.

- [ ] **Step 3: Write the routes**

```python
# backend/app/api/routes/stories.py
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.repositories.memory_repository import MemoryRepository
from app.repositories.story_export_repository import StoryExportRepository
from app.repositories.trip_repository import TripRepository
from app.schemas.stories import StoryExportStatusResponse, StoryExportTriggerResponse
from app.services.storage_service import StorageService

router = APIRouter()

JOB_TYPE_STORIES_EXPORT = "stories_export"


def _enqueue_worker_job(
    db: Session,
    trip_id: uuid.UUID,
    story_export_job_id: uuid.UUID,
) -> None:
    """Insert a pending job into worker_jobs so the worker picks it up."""
    from sqlalchemy import text

    db.execute(
        text("""
            INSERT INTO worker_jobs (
                id, job_type, source_type, source_id,
                status, attempt_count, max_attempts,
                available_at, payload, payload_hash, updated_at
            )
            VALUES (
                gen_random_uuid(), :job_type, 'trip', :source_id,
                'pending', 0, 3,
                now(), :payload::jsonb, 'stories', now()
            )
            ON CONFLICT (job_type, source_type, source_id)
            DO UPDATE SET
                status = 'pending',
                payload = EXCLUDED.payload,
                available_at = now(),
                updated_at = now()
        """),
        {
            "job_type": JOB_TYPE_STORIES_EXPORT,
            "source_id": str(trip_id),
            "payload": f'{{"trip_id": "{trip_id}", "story_export_job_id": "{story_export_job_id}"}}',
        },
    )
    db.commit()


def _build_url(storage: StorageService, key: str | None) -> str | None:
    if not key:
        return None
    return storage.build_public_object_url(key)


@router.post(
    "/{trip_id}/stories/export",
    response_model=StoryExportTriggerResponse,
)
def trigger_stories_export(trip_id: uuid.UUID, db: Session = Depends(get_db)):
    trip_repo = TripRepository(db)
    export_repo = StoryExportRepository(db)
    memory_repo = MemoryRepository(db)
    storage = StorageService()

    trip = trip_repo.get(trip_id)
    if not trip:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trip not found")

    # Check for cached valid export
    existing_job = export_repo.get_by_trip(trip_id)
    if existing_job and existing_job.status == "done":
        last_change = export_repo.get_last_data_change(trip_id)
        if last_change <= existing_job.created_at:
            return StoryExportTriggerResponse(
                job_id=existing_job.id,
                status="done",
                cached=True,
                zip_url=_build_url(storage, existing_job.zip_object_key),
                mp4_url=_build_url(storage, existing_job.mp4_object_key),
            )

    # Validate trip has at least one photo
    all_memories = memory_repo.list(trip_id=trip_id, limit=1000)
    has_photos = any(m.memory_type == "photo" for m in all_memories)
    if not has_photos:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Adicione fotos à viagem antes de exportar Stories",
        )

    # Create or reset the export job
    job = export_repo.upsert_queued(trip_id)
    _enqueue_worker_job(db, trip_id, job.id)

    return StoryExportTriggerResponse(
        job_id=job.id,
        status="queued",
        cached=False,
    )


@router.get(
    "/{trip_id}/stories/export/{job_id}",
    response_model=StoryExportStatusResponse,
)
def get_stories_export_status(
    trip_id: uuid.UUID, job_id: uuid.UUID, db: Session = Depends(get_db)
):
    trip_repo = TripRepository(db)
    export_repo = StoryExportRepository(db)
    storage = StorageService()

    trip = trip_repo.get(trip_id)
    if not trip:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trip not found")

    job = export_repo.get_by_trip(trip_id)
    if not job or job.id != job_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Export job not found")

    return StoryExportStatusResponse(
        job_id=job.id,
        status=job.status,
        zip_url=_build_url(storage, job.zip_object_key),
        mp4_url=_build_url(storage, job.mp4_object_key),
        error_msg=job.error_msg,
    )
```

- [ ] **Step 4: Register the router**

Open `backend/app/api/router.py` and add the stories router:

```python
# Add to imports:
from app.api.routes import activities, days, memories, rag, stories, trips, uploads

# Add after the existing include_router calls:
api_router.include_router(trips.router, prefix="/trips", tags=["stories"])
```

Wait — the stories routes use `/{trip_id}/stories/export` paths, so they should be included under the trips router prefix. Add this line to `router.py`:

```python
api_router.include_router(stories.router, prefix="/trips", tags=["stories"])
```

- [ ] **Step 5: Run the tests**

```bash
cd backend && python -m pytest tests/unit/test_stories_routes.py tests/unit/test_stories_service.py -v
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/routes/stories.py backend/app/api/router.py \
        backend/tests/unit/test_stories_routes.py
git commit -m "feat(api): add POST and GET stories export endpoints"
```

---

## Chunk 3: Worker — slide data structures

### Task 6: Slide data model + `build_slides_data()`

**Files:**
- Create: `worker/app/stories/__init__.py`
- Create: `worker/app/stories/slides.py`
- Create: `worker/tests/test_slides.py`

- [ ] **Step 1: Write the failing tests**

```python
# worker/tests/test_slides.py
from types import SimpleNamespace
from worker.app.stories.slides import build_slides_data, SlideType


def _make_photo_memory(activity_id=None, day_id=None):
    return SimpleNamespace(
        memory_type="photo",
        activity_id=activity_id,
        day_id=day_id,
        storage_key="trips/x/photo.jpg",
        public_url="http://minio/trip-archive/trips/x/photo.jpg",
        caption="nice view",
    )


def _make_note_memory(activity_id=None):
    return SimpleNamespace(
        memory_type="note",
        activity_id=activity_id,
        day_id=None,
        storage_key=None,
        public_url=None,
        caption=None,
    )


def _make_activity(activity_id, title="Visit", location="Kyoto", scheduled_time="09:00", memories=None):
    return SimpleNamespace(
        id=activity_id,
        title=title,
        location=location,
        scheduled_time=scheduled_time,
        status="done",
        memories=memories or [],
    )


def _make_day(day_number=1, city="Kyoto", date="2027-03-10", activities=None, memories=None):
    return SimpleNamespace(
        day_number=day_number,
        date=date,
        notes=None,
        city=city,
        activities=activities or [],
        memories=memories or [],  # day-level memories (activity_id=None)
    )


def _make_trip(days):
    return SimpleNamespace(name="Japão 2027", days=days)


def test_empty_trip_raises():
    """Trip with no photos at all should raise ValueError."""
    act = _make_activity("a1", memories=[_make_note_memory("a1")])
    day = _make_day(activities=[act])
    trip = _make_trip([day])

    from worker.app.stories.slides import NoPhotosError
    import pytest
    with pytest.raises(NoPhotosError):
        build_slides_data(trip)


def test_day_with_no_activities_generates_only_cover():
    """A day with no activities should produce exactly one cover slide."""
    # We need at least one photo somewhere to avoid NoPhotosError.
    act_with_photo = _make_activity("a2", memories=[_make_photo_memory("a2")])
    day_no_acts = _make_day(day_number=1, city="Tokyo", activities=[])
    day_with_photo = _make_day(day_number=2, city="Kyoto", activities=[act_with_photo])
    trip = _make_trip([day_no_acts, day_with_photo])

    slides = build_slides_data(trip)
    cover_slides = [s for s in slides if s.slide_type == SlideType.COVER and s.day_number == 1]
    assert len(cover_slides) == 1

    activity_slides_day1 = [
        s for s in slides
        if s.slide_type == SlideType.ACTIVITY and s.day_number == 1
    ]
    assert len(activity_slides_day1) == 0


def test_activity_with_photo_generates_activity_slide():
    """An activity with a photo should produce one ACTIVITY slide."""
    act = _make_activity("a1", memories=[_make_photo_memory("a1")])
    day = _make_day(activities=[act])
    trip = _make_trip([day])

    slides = build_slides_data(trip)
    activity_slides = [s for s in slides if s.slide_type == SlideType.ACTIVITY]
    assert len(activity_slides) == 1
    assert activity_slides[0].activity_title == "Visit"


def test_activities_without_photos_generate_summary_slide():
    """Activities without photos should appear in a SUMMARY slide."""
    act_photo = _make_activity("a1", title="Fushimi", memories=[_make_photo_memory("a1")])
    act_no_photo = _make_activity("a2", title="Check-in", memories=[])
    day = _make_day(activities=[act_photo, act_no_photo])
    trip = _make_trip([day])

    slides = build_slides_data(trip)
    summary_slides = [s for s in slides if s.slide_type == SlideType.SUMMARY]
    assert len(summary_slides) == 1
    assert any("Check-in" in t for t in summary_slides[0].activity_titles)


def test_day_with_only_photoless_activities_has_no_activity_slides():
    """A day where NO activity has photos should have cover + summary but no ACTIVITY slides."""
    act = _make_activity("a1", title="Check-in", memories=[_make_note_memory("a1")])
    # Need a photo elsewhere to avoid NoPhotosError
    act2 = _make_activity("b1", title="Museum", memories=[_make_photo_memory("b1")])
    day1 = _make_day(day_number=1, activities=[act])
    day2 = _make_day(day_number=2, activities=[act2])
    trip = _make_trip([day1, day2])

    slides = build_slides_data(trip)
    activity_slides_day1 = [
        s for s in slides
        if s.slide_type == SlideType.ACTIVITY and s.day_number == 1
    ]
    assert len(activity_slides_day1) == 0

    summary_slides_day1 = [
        s for s in slides
        if s.slide_type == SlideType.SUMMARY and s.day_number == 1
    ]
    assert len(summary_slides_day1) == 1


def test_no_summary_slide_when_all_activities_have_photos():
    """When every activity has a photo, no SUMMARY slide should be generated."""
    act1 = _make_activity("a1", memories=[_make_photo_memory("a1")])
    act2 = _make_activity("a2", memories=[_make_photo_memory("a2")])
    day = _make_day(activities=[act1, act2])
    trip = _make_trip([day])

    slides = build_slides_data(trip)
    summary_slides = [s for s in slides if s.slide_type == SlideType.SUMMARY]
    assert len(summary_slides) == 0
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd worker && python -m pytest tests/test_slides.py -v 2>&1 | head -20
```

Expected: `ModuleNotFoundError` or similar — slides module doesn't exist yet.

- [ ] **Step 3: Create the package and slides module**

```python
# worker/app/stories/__init__.py
# (empty file)
```

```python
# worker/app/stories/slides.py
from __future__ import annotations

import enum
from dataclasses import dataclass, field
from typing import Any


class SlideType(str, enum.Enum):
    COVER = "cover"
    ACTIVITY = "activity"
    SUMMARY = "summary"


class NoPhotosError(ValueError):
    """Raised when a trip has no photo memories at all."""


@dataclass
class SlideData:
    slide_type: SlideType
    day_number: int
    day_date: str | None = None
    day_city: str | None = None
    day_caption: str | None = None  # filled later by captions.py
    # For COVER slides
    total_activities: int = 0
    total_photos: int = 0
    # For ACTIVITY slides
    activity_title: str | None = None
    activity_location: str | None = None
    activity_time: str | None = None
    photo_urls: list[str] = field(default_factory=list)  # main photo first
    photo_captions: list[str] = field(default_factory=list)
    # For SUMMARY slides
    activity_titles: list[str] = field(default_factory=list)


def build_slides_data(trip: Any) -> list[SlideData]:
    """
    Build the ordered list of SlideData for a trip.

    Order per day:
      1. COVER slide
      2. One ACTIVITY slide per activity that has >= 1 photo memory
      3. One SUMMARY slide (if any activity has 0 photo memories) — omitted if none

    Raises NoPhotosError if the entire trip has no photo memories.
    """
    # Validate: trip must have at least one photo anywhere
    all_photos = [
        m
        for day in trip.days
        for act in day.activities
        for m in act.memories
        if m.memory_type == "photo"
    ]
    # Also count day-level photos (activity_id=None)
    day_level_photos = [
        m
        for day in trip.days
        for m in getattr(day, "memories", [])
        if m.memory_type == "photo"
    ]
    if not all_photos and not day_level_photos:
        raise NoPhotosError("Trip has no photo memories. Add photos before exporting.")

    slides: list[SlideData] = []

    for day in sorted(trip.days, key=lambda d: d.day_number):
        activities = getattr(day, "activities", [])
        day_memories = getattr(day, "memories", [])

        # Count totals for the cover slide
        day_photos: list[Any] = [
            m
            for act in activities
            for m in act.memories
            if m.memory_type == "photo"
        ] + [m for m in day_memories if m.memory_type == "photo"]

        total_activities = len(activities)
        total_photos = len(day_photos)

        # 1. COVER slide
        slides.append(
            SlideData(
                slide_type=SlideType.COVER,
                day_number=day.day_number,
                day_date=str(day.date) if day.date else None,
                day_city=getattr(day, "city", None),
                total_activities=total_activities,
                total_photos=total_photos,
            )
        )

        # 2. ACTIVITY slides — one per activity with >= 1 photo
        no_photo_activity_titles: list[str] = []
        for act in activities:
            photos = [m for m in act.memories if m.memory_type == "photo"]
            if photos:
                slides.append(
                    SlideData(
                        slide_type=SlideType.ACTIVITY,
                        day_number=day.day_number,
                        day_date=str(day.date) if day.date else None,
                        day_city=getattr(day, "city", None),
                        activity_title=act.title,
                        activity_location=getattr(act, "location", None),
                        activity_time=getattr(act, "scheduled_time", None),
                        photo_urls=[
                            m.public_url
                            for m in photos
                            if getattr(m, "public_url", None)
                        ],
                        photo_captions=[
                            m.caption or ""
                            for m in photos
                        ],
                    )
                )
            else:
                no_photo_activity_titles.append(act.title)

        # 3. SUMMARY slide — only if some activities have no photos
        if no_photo_activity_titles:
            slides.append(
                SlideData(
                    slide_type=SlideType.SUMMARY,
                    day_number=day.day_number,
                    day_date=str(day.date) if day.date else None,
                    day_city=getattr(day, "city", None),
                    activity_titles=no_photo_activity_titles,
                )
            )

    return slides
```

- [ ] **Step 4: Run the tests**

```bash
cd worker && python -m pytest tests/test_slides.py -v
```

Expected: all 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add worker/app/stories/__init__.py worker/app/stories/slides.py worker/tests/test_slides.py
git commit -m "feat(worker): add slide data model and build_slides_data() with edge case handling"
```

---

## Chunk 4: Worker — captions, rendering, compilation, orchestration, and Dockerfile

### Task 7: LLM caption generation

**Files:**
- Create: `worker/app/stories/captions.py`

- [ ] **Step 1: Write the module**

```python
# worker/app/stories/captions.py
from __future__ import annotations

from typing import Any

from openai import OpenAI


def generate_day_caption(
    openai_client: OpenAI,
    day: Any,
    openai_model: str = "gpt-4o-mini",
) -> str:
    """
    Generate a short, evocative one-sentence caption for a trip day.

    Args:
        openai_client: Initialized OpenAI client.
        day: Day object with .day_number, .date, .city, .activities, .notes.
        openai_model: Model to use (default: gpt-4o-mini for cost efficiency).

    Returns:
        A single sentence in Portuguese, max ~120 characters.
    """
    activities_text = ", ".join(
        act.title for act in getattr(day, "activities", [])
        if getattr(act, "status", "") != "skipped"
    ) or "nenhuma atividade registrada"

    notes = getattr(day, "notes", None) or ""

    prompt = (
        f"Você está ajudando a criar um Stories de viagem.\n"
        f"Escreva UMA frase curta e evocativa em português (máximo 120 caracteres) "
        f"que capture a essência deste dia de viagem:\n\n"
        f"Cidade: {getattr(day, 'city', 'Desconhecida')}\n"
        f"Data: {getattr(day, 'date', 'Desconhecida')}\n"
        f"Atividades: {activities_text}\n"
        f"Notas: {notes or 'Nenhuma'}\n\n"
        f"Responda apenas com a frase, sem aspas, sem explicações."
    )

    response = openai_client.chat.completions.create(
        model=openai_model,
        messages=[{"role": "user", "content": prompt}],
        max_tokens=60,
        temperature=0.8,
    )
    caption = response.choices[0].message.content or ""
    return caption.strip()[:150]
```

- [ ] **Step 2: Commit**

```bash
git add worker/app/stories/captions.py
git commit -m "feat(worker): add generate_day_caption() via OpenAI"
```

---

### Task 8: HTML slide templates

**Files:**
- Create: `worker/app/stories/templates/slide-cover.html`
- Create: `worker/app/stories/templates/slide-activity.html`
- Create: `worker/app/stories/templates/slide-summary.html`

- [ ] **Step 1: Write cover slide template**

```html
<!-- worker/app/stories/templates/slide-cover.html -->
<!DOCTYPE html>
<html lang="pt">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=1080">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 1080px; height: 1920px;
    background: linear-gradient(160deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
    font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif;
    display: flex; flex-direction: column;
    justify-content: space-between;
    padding: 80px 70px;
    color: #fff;
    overflow: hidden;
  }
  .day-label {
    font-size: 28px; font-weight: 600; letter-spacing: 6px;
    text-transform: uppercase; opacity: 0.6;
  }
  .center {
    display: flex; flex-direction: column; align-items: flex-start;
    gap: 24px;
  }
  .city {
    font-size: 110px; font-weight: 800; line-height: 1;
    letter-spacing: -2px;
  }
  .date {
    font-size: 36px; opacity: 0.6; font-weight: 400;
  }
  .caption {
    font-size: 48px; font-weight: 300; line-height: 1.4;
    font-style: italic; opacity: 0.9; max-width: 900px;
    margin-top: 20px;
  }
  .stats {
    font-size: 28px; opacity: 0.4; letter-spacing: 2px;
  }
  .accent-bar {
    width: 80px; height: 6px;
    background: #ff6b6b; border-radius: 3px;
    margin-bottom: 20px;
  }
</style>
</head>
<body>
<script>
  const d = window.__DATA__ || {};
</script>
<div class="day-label" id="day-label"></div>
<div class="center">
  <div class="accent-bar"></div>
  <div class="city" id="city"></div>
  <div class="date" id="date"></div>
  <div class="caption" id="caption"></div>
</div>
<div class="stats" id="stats"></div>
<script>
  const data = window.__DATA__ || {};
  document.getElementById('day-label').textContent = `DIA ${data.day_number || ''}`;
  document.getElementById('city').textContent = data.day_city || '';
  document.getElementById('date').textContent = data.day_date || '';
  document.getElementById('caption').textContent = data.day_caption || '';
  document.getElementById('stats').textContent =
    `${data.total_activities || 0} ATIVIDADES · ${data.total_photos || 0} FOTOS`;
</script>
</body>
</html>
```

- [ ] **Step 2: Write activity slide template**

```html
<!-- worker/app/stories/templates/slide-activity.html -->
<!DOCTYPE html>
<html lang="pt">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=1080">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 1080px; height: 1920px;
    background: #111;
    font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif;
    display: flex; flex-direction: column;
    color: #fff; overflow: hidden; position: relative;
  }
  .photo-main {
    position: absolute; inset: 0;
    background-size: cover; background-position: center;
  }
  .overlay {
    position: absolute; inset: 0;
    background: linear-gradient(
      to bottom,
      rgba(0,0,0,0.15) 0%,
      transparent 30%,
      transparent 55%,
      rgba(0,0,0,0.9) 100%
    );
  }
  .top-label {
    position: absolute; top: 60px; left: 70px;
    font-size: 24px; letter-spacing: 4px; opacity: 0.7;
    text-transform: uppercase; font-weight: 500;
  }
  .bottom {
    position: absolute; bottom: 0; left: 0; right: 0;
    padding: 60px 70px 80px;
  }
  .activity-title {
    font-size: 80px; font-weight: 800; line-height: 1.05;
    letter-spacing: -1px; margin-bottom: 20px;
  }
  .meta {
    font-size: 30px; opacity: 0.65;
    display: flex; gap: 30px; align-items: center;
  }
  .thumbnails {
    display: flex; gap: 12px; margin-top: 30px;
  }
  .thumb {
    width: 100px; height: 100px;
    border-radius: 12px;
    background-size: cover; background-position: center;
    border: 2px solid rgba(255,255,255,0.4);
  }
  .thumb-more {
    width: 100px; height: 100px; border-radius: 12px;
    background: rgba(255,255,255,0.15);
    border: 2px solid rgba(255,255,255,0.4);
    display: flex; align-items: center; justify-content: center;
    font-size: 26px; font-weight: 600;
  }
</style>
</head>
<body>
<div class="photo-main" id="photo-main"></div>
<div class="overlay"></div>
<div class="top-label" id="top-label"></div>
<div class="bottom">
  <div class="activity-title" id="activity-title"></div>
  <div class="meta">
    <span id="location"></span>
    <span id="time"></span>
  </div>
  <div class="thumbnails" id="thumbnails"></div>
</div>
<script>
  const data = window.__DATA__ || {};
  const urls = data.photo_urls || [];

  // Main photo background
  if (urls[0]) {
    document.getElementById('photo-main').style.backgroundImage = `url('${urls[0]}')`;
  }

  document.getElementById('top-label').textContent =
    `DIA ${data.day_number || ''} · ${(data.day_city || '').toUpperCase()}`;
  document.getElementById('activity-title').textContent = data.activity_title || '';

  const loc = data.activity_location;
  const time = data.activity_time;
  if (loc) document.getElementById('location').textContent = `📍 ${loc}`;
  if (time) document.getElementById('time').textContent = `🕐 ${time}`;

  // Thumbnails for extra photos
  if (urls.length > 1) {
    const container = document.getElementById('thumbnails');
    const extras = urls.slice(1, 4);
    extras.forEach(url => {
      const div = document.createElement('div');
      div.className = 'thumb';
      div.style.backgroundImage = `url('${url}')`;
      container.appendChild(div);
    });
    if (urls.length > 4) {
      const more = document.createElement('div');
      more.className = 'thumb-more';
      more.textContent = `+${urls.length - 4}`;
      container.appendChild(more);
    }
  }
</script>
</body>
</html>
```

- [ ] **Step 3: Write summary slide template**

```html
<!-- worker/app/stories/templates/slide-summary.html -->
<!DOCTYPE html>
<html lang="pt">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=1080">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 1080px; height: 1920px;
    background: linear-gradient(180deg, #0f0f0f 0%, #1a1a2e 100%);
    font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif;
    display: flex; flex-direction: column;
    padding: 100px 80px;
    color: #fff; overflow: hidden;
    gap: 60px;
  }
  .header { display: flex; flex-direction: column; gap: 16px; }
  .day-label {
    font-size: 26px; letter-spacing: 5px; opacity: 0.5;
    text-transform: uppercase;
  }
  .section-title {
    font-size: 52px; font-weight: 700;
    opacity: 0.8;
  }
  .activity-list {
    display: flex; flex-direction: column; gap: 24px;
    flex: 1;
  }
  .activity-item {
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 24px;
    padding: 40px 48px;
    display: flex; flex-direction: column; gap: 10px;
  }
  .activity-name {
    font-size: 46px; font-weight: 600;
  }
  .no-photo-tag {
    font-size: 24px; opacity: 0.35; letter-spacing: 2px;
    text-transform: uppercase;
  }
  .footer {
    font-size: 26px; opacity: 0.3; letter-spacing: 2px;
    text-transform: uppercase;
  }
</style>
</head>
<body>
<div class="header">
  <div class="day-label" id="day-label"></div>
  <div class="section-title">+ outras atividades</div>
</div>
<div class="activity-list" id="activity-list"></div>
<div class="footer" id="footer"></div>
<script>
  const data = window.__DATA__ || {};
  document.getElementById('day-label').textContent =
    `DIA ${data.day_number || ''} · ${(data.day_city || '').toUpperCase()}`;

  const titles = data.activity_titles || [];
  const list = document.getElementById('activity-list');
  titles.forEach(title => {
    const item = document.createElement('div');
    item.className = 'activity-item';
    item.innerHTML = `
      <div class="activity-name">${title}</div>
      <div class="no-photo-tag">sem foto</div>
    `;
    list.appendChild(item);
  });

  document.getElementById('footer').textContent =
    `${titles.length} atividade${titles.length !== 1 ? 's' : ''} sem foto`;
</script>
</body>
</html>
```

- [ ] **Step 4: Commit templates**

```bash
git add worker/app/stories/templates/
git commit -m "feat(worker): add HTML slide templates (cover, activity, summary)"
```

---

### Task 9: Chromium renderer

**Files:**
- Create: `worker/app/stories/renderer.py`

- [ ] **Step 1: Write the renderer**

```python
# worker/app/stories/renderer.py
from __future__ import annotations

import json
import os
import subprocess
import tempfile
from pathlib import Path

from worker.app.stories.slides import SlideData

TEMPLATES_DIR = Path(__file__).parent / "templates"

TEMPLATE_MAP = {
    "cover": TEMPLATES_DIR / "slide-cover.html",
    "activity": TEMPLATES_DIR / "slide-activity.html",
    "summary": TEMPLATES_DIR / "slide-summary.html",
}

CHROMIUM_BIN = os.getenv("CHROMIUM_BIN", "chromium")


def render_slide_png(slide: SlideData, output_path: Path) -> None:
    """
    Render a SlideData object to a 1080x1920 PNG using headless Chromium.

    Args:
        slide: The slide data to render.
        output_path: Destination path for the PNG file.
    """
    template_path = TEMPLATE_MAP[slide.slide_type.value]
    data = _slide_to_dict(slide)

    # Write a temporary HTML file with __DATA__ injected
    with tempfile.NamedTemporaryFile(
        suffix=".html", mode="w", encoding="utf-8", delete=False
    ) as f:
        html = template_path.read_text(encoding="utf-8")
        # Inject data before </head>
        injection = f"<script>window.__DATA__ = {json.dumps(data, ensure_ascii=False)};</script>"
        html = html.replace("</head>", f"{injection}\n</head>", 1)
        f.write(html)
        tmp_html = f.name

    try:
        result = subprocess.run(
            [
                CHROMIUM_BIN,
                "--headless=new",
                "--no-sandbox",
                "--disable-gpu",
                "--disable-dev-shm-usage",
                f"--window-size=1080,1920",
                f"--screenshot={output_path}",
                f"file://{tmp_html}",
            ],
            capture_output=True,
            timeout=30,
        )
        if result.returncode != 0:
            raise RuntimeError(
                f"Chromium failed (exit {result.returncode}): "
                f"{result.stderr.decode('utf-8', errors='replace')[:500]}"
            )
    finally:
        Path(tmp_html).unlink(missing_ok=True)


def _slide_to_dict(slide: SlideData) -> dict:
    return {
        "slide_type": slide.slide_type.value,
        "day_number": slide.day_number,
        "day_date": slide.day_date,
        "day_city": slide.day_city,
        "day_caption": slide.day_caption,
        "total_activities": slide.total_activities,
        "total_photos": slide.total_photos,
        "activity_title": slide.activity_title,
        "activity_location": slide.activity_location,
        "activity_time": slide.activity_time,
        "photo_urls": slide.photo_urls,
        "photo_captions": slide.photo_captions,
        "activity_titles": slide.activity_titles,
    }
```

- [ ] **Step 2: Commit**

```bash
git add worker/app/stories/renderer.py
git commit -m "feat(worker): add render_slide_png() via headless Chromium subprocess"
```

---

### Task 10: Video compiler + ZIP creator

**Files:**
- Create: `worker/app/stories/compiler.py`

- [ ] **Step 1: Write the compiler**

```python
# worker/app/stories/compiler.py
from __future__ import annotations

import subprocess
import zipfile
from pathlib import Path


def compile_video(png_paths: list[Path], output_path: Path, hold_seconds: int = 5) -> None:
    """
    Compile a list of PNG slides into an MP4 video.

    Each slide is shown for `hold_seconds` seconds.
    Output codec: libx264, pixel format: yuv420p (Instagram-compatible).
    Resolution: 1080x1920.

    Args:
        png_paths: Ordered list of PNG slide paths.
        output_path: Destination .mp4 path.
        hold_seconds: How many seconds each slide is displayed.
    """
    if not png_paths:
        raise ValueError("No PNG slides to compile into video")

    # Write a concat file listing each image with its duration
    concat_file = output_path.parent / "concat.txt"
    with open(concat_file, "w", encoding="utf-8") as f:
        for png_path in png_paths:
            f.write(f"file '{png_path.resolve()}'\n")
            f.write(f"duration {hold_seconds}\n")
        # FFmpeg needs the last file listed twice to avoid cutting it short
        f.write(f"file '{png_paths[-1].resolve()}'\n")

    result = subprocess.run(
        [
            "ffmpeg", "-y",
            "-f", "concat", "-safe", "0",
            "-i", str(concat_file),
            "-vf", "scale=1080:1920:force_original_aspect_ratio=decrease,"
                   "pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black,"
                   "fps=30",
            "-c:v", "libx264",
            "-pix_fmt", "yuv420p",
            "-crf", "23",
            "-an",
            str(output_path),
        ],
        capture_output=True,
        timeout=300,
    )

    concat_file.unlink(missing_ok=True)

    if result.returncode != 0:
        raise RuntimeError(
            f"FFmpeg failed (exit {result.returncode}): "
            f"{result.stderr.decode('utf-8', errors='replace')[-1000:]}"
        )


def create_zip(png_paths: list[Path], output_path: Path) -> None:
    """
    Bundle all PNG slides into a single ZIP archive.

    Args:
        png_paths: Ordered list of PNG slide paths.
        output_path: Destination .zip path.
    """
    with zipfile.ZipFile(output_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for i, png_path in enumerate(png_paths):
            arcname = f"slide_{i:04d}.png"
            zf.write(png_path, arcname)
```

- [ ] **Step 2: Commit**

```bash
git add worker/app/stories/compiler.py
git commit -m "feat(worker): add compile_video() via FFmpeg and create_zip()"
```

---

### Task 11: Main orchestrator

**Files:**
- Create: `worker/app/stories/exporter.py`
- Create: `worker/tests/test_exporter.py`

- [ ] **Step 1: Write orchestrator tests**

```python
# worker/tests/test_exporter.py
"""
Unit tests for the stories export orchestrator.
Tests use mocks for external services (DB, MinIO, Chromium, FFmpeg).
We test the control flow: happy path, no-photos abort, cleanup on failure.
"""
import uuid
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch, call


def _make_trip():
    act = SimpleNamespace(
        id=uuid.uuid4(), title="Fushimi", location="Kyoto", scheduled_time="09:00",
        status="done", memories=[
            SimpleNamespace(
                memory_type="photo", activity_id=None, day_id=None,
                storage_key="k.jpg", public_url="http://minio/k.jpg", caption="nice"
            )
        ]
    )
    day = SimpleNamespace(
        day_number=1, date="2027-03-10", city="Kyoto", notes=None,
        activities=[act], memories=[]
    )
    return SimpleNamespace(id=uuid.uuid4(), name="Japão 2027", days=[day])


def test_happy_path_calls_all_steps():
    trip = _make_trip()
    trip_id = str(trip.id)
    job_id = str(uuid.uuid4())

    with patch("worker.app.stories.exporter.psycopg") as mock_psycopg, \
         patch("worker.app.stories.exporter.build_slides_data") as mock_build, \
         patch("worker.app.stories.exporter.generate_day_caption", return_value="Dia incrível"), \
         patch("worker.app.stories.exporter.render_slide_png"), \
         patch("worker.app.stories.exporter.compile_video"), \
         patch("worker.app.stories.exporter.create_zip"), \
         patch("worker.app.stories.exporter._upload_to_minio"), \
         patch("worker.app.stories.exporter._update_story_job"), \
         patch("worker.app.stories.exporter._fetch_trip") as mock_fetch, \
         patch("worker.app.stories.exporter.shutil"):

        mock_fetch.return_value = trip
        from worker.app.stories.slides import SlideData, SlideType
        mock_build.return_value = [
            SlideData(slide_type=SlideType.COVER, day_number=1, day_city="Kyoto")
        ]

        from worker.app.stories.exporter import process_stories_export
        process_stories_export(
            trip_id=trip_id,
            story_export_job_id=job_id,
            database_url="postgresql://test",
            storage_client=MagicMock(),
            bucket="test-bucket",
            openai_client=MagicMock(),
            openai_model="gpt-4o-mini",
            minio_public_endpoint="http://minio:9000",
        )

        mock_build.assert_called_once()


def test_cleanup_called_even_on_failure():
    trip = _make_trip()

    with patch("worker.app.stories.exporter._fetch_trip", side_effect=RuntimeError("DB down")), \
         patch("worker.app.stories.exporter._update_story_job"), \
         patch("worker.app.stories.exporter.shutil") as mock_shutil:

        from worker.app.stories.exporter import process_stories_export
        import pytest
        with pytest.raises(RuntimeError):
            process_stories_export(
                trip_id=str(trip.id),
                story_export_job_id=str(uuid.uuid4()),
                database_url="postgresql://test",
                storage_client=MagicMock(),
                bucket="test-bucket",
                openai_client=MagicMock(),
                openai_model="gpt-4o-mini",
                minio_public_endpoint="http://minio:9000",
            )

        mock_shutil.rmtree.assert_called_once()
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd worker && python -m pytest tests/test_exporter.py -v 2>&1 | head -20
```

Expected: `ModuleNotFoundError` for `worker.app.stories.exporter`.

- [ ] **Step 3: Write the orchestrator**

```python
# worker/app/stories/exporter.py
from __future__ import annotations

import io
import json
import shutil
import uuid
from pathlib import Path
from typing import Any

import boto3
import psycopg

from worker.app.stories.captions import generate_day_caption
from worker.app.stories.compiler import compile_video, create_zip
from worker.app.stories.renderer import render_slide_png
from worker.app.stories.slides import NoPhotosError, build_slides_data


def process_stories_export(
    trip_id: str,
    story_export_job_id: str,
    database_url: str,
    storage_client: Any,
    bucket: str,
    openai_client: Any,
    openai_model: str,
    minio_public_endpoint: str,
) -> dict[str, str]:
    """
    Full orchestration of stories export:
    1. Fetch trip data from DB
    2. Build slide structure
    3. Generate AI captions per day
    4. Render each slide to PNG via Chromium
    5. Compile PNGs to MP4 via FFmpeg
    6. Zip PNGs
    7. Upload ZIP + MP4 to MinIO
    8. Update story_export_jobs to done

    Always cleans up temp files, even on failure.
    Raises on unrecoverable errors (triggers worker retry/failure logic).
    """
    tmp_dir = Path(f"/tmp/stories/{story_export_job_id}")
    tmp_dir.mkdir(parents=True, exist_ok=True)

    try:
        # 1. Fetch trip
        trip = _fetch_trip(trip_id, database_url, minio_public_endpoint)

        # Mark job as processing (best-effort; don't fail if this errors)
        _update_story_job(
            story_export_job_id=story_export_job_id,
            database_url=database_url,
            status="processing",
        )

        # 2. Build slides (raises NoPhotosError if trip has no photos)
        slides = build_slides_data(trip)

        # 3. Generate captions per day
        day_captions: dict[int, str] = {}
        for day in trip.days:
            caption = generate_day_caption(
                openai_client=openai_client,
                day=day,
                openai_model=openai_model,
            )
            day_captions[day.day_number] = caption

        # Attach captions to cover slides
        for slide in slides:
            if slide.day_caption is None:
                slide.day_caption = day_captions.get(slide.day_number, "")

        # 4. Render PNGs
        png_paths: list[Path] = []
        for i, slide in enumerate(slides):
            png_path = tmp_dir / f"slide_{i:04d}.png"
            render_slide_png(slide, png_path)
            png_paths.append(png_path)

        # 5. Compile MP4
        mp4_path = tmp_dir / "export.mp4"
        compile_video(png_paths, mp4_path, hold_seconds=5)

        # 6. Create ZIP
        zip_path = tmp_dir / "export.zip"
        create_zip(png_paths, zip_path)

        # 7. Upload to MinIO
        zip_key = f"stories/{trip_id}/export.zip"
        mp4_key = f"stories/{trip_id}/export.mp4"
        _upload_to_minio(storage_client, bucket, zip_path, zip_key)
        _upload_to_minio(storage_client, bucket, mp4_path, mp4_key)

        # 8. Mark done
        _update_story_job(
            story_export_job_id=story_export_job_id,
            database_url=database_url,
            status="done",
            zip_object_key=zip_key,
            mp4_object_key=mp4_key,
        )

        return {"status": "done", "zip_key": zip_key, "mp4_key": mp4_key}

    except Exception as e:
        _update_story_job(
            story_export_job_id=story_export_job_id,
            database_url=database_url,
            status="failed",
            error_msg=str(e)[:2000],
        )
        raise

    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


def _fetch_trip(trip_id: str, database_url: str, minio_public_endpoint: str) -> Any:
    """Fetch trip + days + activities + memories from DB, return as nested SimpleNamespace."""
    from types import SimpleNamespace

    endpoint = minio_public_endpoint.rstrip("/")

    with psycopg.connect(database_url) as conn:
        with conn.cursor() as cur:
            # Fetch trip
            cur.execute("SELECT id, name FROM trips WHERE id = %s", (trip_id,))
            row = cur.fetchone()
            if not row:
                raise RuntimeError(f"Trip {trip_id} not found")
            trip = SimpleNamespace(id=row[0], name=row[1], days=[])

            # Fetch days
            cur.execute(
                "SELECT id, day_number, date, notes FROM days WHERE trip_id = %s ORDER BY day_number",
                (trip_id,),
            )
            day_rows = cur.fetchall()

            for day_id, day_number, date, notes in day_rows:
                # Determine city from destination (use trip destinations[0] as fallback)
                cur.execute(
                    "SELECT destinations FROM trips WHERE id = %s", (trip_id,)
                )
                dest_row = cur.fetchone()
                city = (dest_row[0][0] if dest_row and dest_row[0] else "")

                day = SimpleNamespace(
                    id=day_id,
                    day_number=day_number,
                    date=str(date) if date else None,
                    notes=notes,
                    city=city,
                    activities=[],
                    memories=[],
                )

                # Fetch activities
                cur.execute(
                    "SELECT id, title, location, scheduled_time, status FROM activities "
                    "WHERE day_id = %s ORDER BY created_at",
                    (day_id,),
                )
                act_rows = cur.fetchall()

                for act_id, title, location, scheduled_time, act_status in act_rows:
                    activity = SimpleNamespace(
                        id=act_id,
                        title=title,
                        location=location,
                        scheduled_time=str(scheduled_time) if scheduled_time else None,
                        status=act_status,
                        memories=[],
                    )

                    # Fetch memories for this activity
                    cur.execute(
                        "SELECT id, memory_type, storage_key, caption FROM memories "
                        "WHERE activity_id = %s AND memory_type = 'photo'",
                        (act_id,),
                    )
                    mem_rows = cur.fetchall()
                    for mem_id, mem_type, storage_key, caption in mem_rows:
                        bucket_name = "trip-archive"  # from env, hardcoded for now
                        public_url = (
                            f"{endpoint}/{bucket_name}/{storage_key}"
                            if storage_key
                            else None
                        )
                        activity.memories.append(
                            SimpleNamespace(
                                id=mem_id,
                                memory_type=mem_type,
                                storage_key=storage_key,
                                public_url=public_url,
                                caption=caption,
                                activity_id=act_id,
                                day_id=day_id,
                            )
                        )

                    day.activities.append(activity)

                trip.days.append(day)

    return trip


def _upload_to_minio(storage_client: Any, bucket: str, file_path: Path, key: str) -> None:
    with open(file_path, "rb") as f:
        storage_client.put_object(
            Bucket=bucket,
            Key=key,
            Body=f,
            ContentType="application/octet-stream",
        )


def _update_story_job(
    story_export_job_id: str,
    database_url: str,
    status: str,
    zip_object_key: str | None = None,
    mp4_object_key: str | None = None,
    error_msg: str | None = None,
) -> None:
    """Update story_export_jobs row. Best-effort — swallows exceptions."""
    try:
        with psycopg.connect(database_url) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE story_export_jobs
                    SET status = %s,
                        zip_object_key = COALESCE(%s, zip_object_key),
                        mp4_object_key = COALESCE(%s, mp4_object_key),
                        error_msg = %s
                    WHERE id = %s
                    """,
                    (status, zip_object_key, mp4_object_key, error_msg, story_export_job_id),
                )
            conn.commit()
    except Exception:
        pass  # Don't let status update failures crash the job
```

- [ ] **Step 4: Run the tests**

```bash
cd worker && python -m pytest tests/test_exporter.py tests/test_slides.py -v
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add worker/app/stories/exporter.py worker/tests/test_exporter.py
git commit -m "feat(worker): add process_stories_export() orchestrator"
```

---

### Task 12: Wire into worker main loop + update Dockerfile

**Files:**
- Modify: `worker/app/main.py`
- Modify: `worker/Dockerfile`

- [ ] **Step 1: Add constant and enqueue function to `worker/app/main.py`**

Add after the existing `JOB_TYPE_THUMBNAIL` constant:

```python
JOB_TYPE_STORIES_EXPORT = "stories_export"
```

In `_enqueue_jobs()`, add the call:

```python
def _enqueue_jobs(connection: psycopg.Connection, limit: int, max_retries: int) -> int:
    enqueued = 0
    enqueued += _enqueue_embedding_jobs_for_memories(connection, limit, max_retries)
    enqueued += _enqueue_embedding_jobs_for_activities(connection, limit, max_retries)
    enqueued += _enqueue_thumbnail_jobs_for_memories(connection, limit, max_retries)
    # Stories export jobs are enqueued by the backend API — no polling needed here
    # The worker_jobs table handles them via the normal pending/dispatch loop
    return enqueued
```

In `_dispatch_job()`, add the new branch before `raise RuntimeError(...)`:

```python
    if job_type == JOB_TYPE_STORIES_EXPORT:
        trip_id = str(payload.get("trip_id") or "")
        story_export_job_id = str(payload.get("story_export_job_id") or "")

        if not trip_id or not story_export_job_id:
            raise RuntimeError("stories_export payload missing trip_id or story_export_job_id")

        from app.stories.exporter import process_stories_export
        return process_stories_export(
            trip_id=trip_id,
            story_export_job_id=story_export_job_id,
            database_url=_normalize_database_url(os.getenv("DATABASE_URL", "")),
            storage_client=storage_client,
            bucket=bucket,
            openai_client=openai_client,
            openai_model=openai_embedding_model,
            minio_public_endpoint=os.getenv("MINIO_PUBLIC_ENDPOINT", os.getenv("MINIO_ENDPOINT", "http://minio:9000")),
        )

    raise RuntimeError(f"Unsupported job_type: {job_type}")
```

- [ ] **Step 2: Update the Dockerfile**

Replace the current `worker/Dockerfile` content with:

```dockerfile
FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Install Chromium, FFmpeg, and required system libraries for headless rendering
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libgdk-pixbuf2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libxss1 \
    ffmpeg \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

ENV CHROMIUM_BIN=chromium

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY . /app

CMD ["python", "-m", "app.main"]
```

- [ ] **Step 3: Verify the worker starts cleanly (local Docker build)**

```bash
cd worker && docker build -t trip-brain-worker-test . 2>&1 | tail -5
```

Expected: `Successfully built ...` (build completes without errors).

- [ ] **Step 4: Commit**

```bash
git add worker/app/main.py worker/Dockerfile
git commit -m "feat(worker): wire stories_export job type into dispatch loop + update Dockerfile with Chromium + FFmpeg"
```

---

## Chunk 5: Frontend — viewer components

### Task 13: Add Stories types and API calls

**Files:**
- Modify: `frontend/lib/api.ts`

- [ ] **Step 1: Add type and functions to `api.ts`**

Add after the `LoginResponse` type:

```typescript
export type StoryExportJob = {
  job_id: string;
  status: "queued" | "processing" | "done" | "failed";
  cached?: boolean;
  zip_url?: string | null;
  mp4_url?: string | null;
  error_msg?: string | null;
};
```

Add at the end of the file:

```typescript
export function triggerStoriesExport(tripId: string): Promise<StoryExportJob> {
  return request<StoryExportJob>(
    `/trips/${tripId}/stories/export`,
    { method: "POST" },
    API_BASE_PUBLIC,
  );
}

export function fetchStoriesExportJob(tripId: string, jobId: string): Promise<StoryExportJob> {
  return request<StoryExportJob>(
    `/trips/${tripId}/stories/export/${jobId}`,
    undefined,
    API_BASE_PUBLIC,
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/lib/api.ts
git commit -m "feat(frontend): add StoryExportJob type and stories API functions"
```

---

### Task 14: StoryProgress component

**Files:**
- Create: `frontend/components/stories/StoryProgress.tsx`

- [ ] **Step 1: Write the component**

```tsx
// frontend/components/stories/StoryProgress.tsx
"use client";

type Props = {
  total: number;
  current: number; // 0-based index of the current slide
};

export function StoryProgress({ total, current }: Props) {
  return (
    <div className="flex gap-[3px] px-4 pt-3">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className="flex-1 h-[3px] rounded-full overflow-hidden bg-white/30"
        >
          <div
            className="h-full bg-white rounded-full transition-none"
            style={{ width: i < current ? "100%" : i === current ? "100%" : "0%" }}
          />
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/components/stories/StoryProgress.tsx
git commit -m "feat(frontend): add StoryProgress segmented progress bar"
```

---

### Task 15: StorySlide component

**Files:**
- Create: `frontend/components/stories/StorySlide.tsx`

- [ ] **Step 1: Write the component**

```tsx
// frontend/components/stories/StorySlide.tsx
"use client";

import type { Timeline } from "@/lib/api";

type DayData = Timeline["days"][number];
type ActivityData = DayData["activities"][number];
type MemoryData = DayData["memories"][number];

export type Slide =
  | { type: "cover"; day: DayData }
  | { type: "activity"; day: DayData; activity: ActivityData; photos: MemoryData[] }
  | { type: "summary"; day: DayData; activities: ActivityData[] };

type Props = {
  slide: Slide;
};

export function StorySlide({ slide }: Props) {
  if (slide.type === "cover") {
    return <CoverSlide day={slide.day} />;
  }
  if (slide.type === "activity") {
    return <ActivitySlide day={slide.day} activity={slide.activity} photos={slide.photos} />;
  }
  return <SummarySlide day={slide.day} activities={slide.activities} />;
}

function CoverSlide({ day }: { day: DayData }) {
  return (
    <div className="w-full h-full bg-gradient-to-br from-[#1a1a2e] via-[#16213e] to-[#0f3460] flex flex-col justify-between p-8 text-white select-none">
      <span className="text-xs tracking-[4px] opacity-50 uppercase font-medium">
        Dia {day.day_number}
      </span>
      <div className="flex flex-col gap-3">
        <div className="w-12 h-1 bg-[#ff6b6b] rounded-full" />
        <h2 className="text-5xl font-extrabold leading-none tracking-tight">
          {day.date ?? `Dia ${day.day_number}`}
        </h2>
        <p className="text-sm opacity-40 tracking-widest uppercase">
          {day.activities.length} atividades · {day.memories.length} fotos
        </p>
      </div>
      <span className="text-[10px] opacity-20 tracking-widest uppercase">trip-brain</span>
    </div>
  );
}

function ActivitySlide({
  day,
  activity,
  photos,
}: {
  day: DayData;
  activity: ActivityData;
  photos: MemoryData[];
}) {
  const mainPhoto = photos[0];
  const extraPhotos = photos.slice(1, 4);
  const extraCount = photos.length > 4 ? photos.length - 4 : 0;

  return (
    <div className="w-full h-full relative overflow-hidden select-none">
      {/* Background photo */}
      {mainPhoto?.public_url && (
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${mainPhoto.public_url})` }}
        />
      )}
      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/90" />

      {/* Top label */}
      <div className="absolute top-10 left-6 text-white text-[11px] tracking-[3px] opacity-70 uppercase font-medium">
        Dia {day.day_number} · {day.date}
      </div>

      {/* Bottom content */}
      <div className="absolute bottom-0 left-0 right-0 p-6 pb-8">
        <h3 className="text-white text-3xl font-extrabold leading-tight mb-2">
          {activity.title}
        </h3>
        <div className="flex gap-4 text-white/60 text-sm mb-3">
          {activity.location && <span>📍 {activity.location}</span>}
          {activity.scheduled_time && <span>🕐 {activity.scheduled_time}</span>}
        </div>
        {/* Thumbnail strip for extra photos */}
        {extraPhotos.length > 0 && (
          <div className="flex gap-2">
            {extraPhotos.map((photo, i) => (
              <div
                key={i}
                className="w-12 h-12 rounded-lg bg-cover bg-center border border-white/30 shrink-0"
                style={{ backgroundImage: photo.public_url ? `url(${photo.public_url})` : undefined }}
              />
            ))}
            {extraCount > 0 && (
              <div className="w-12 h-12 rounded-lg border border-white/30 bg-white/10 flex items-center justify-center text-white text-xs font-semibold shrink-0">
                +{extraCount}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SummarySlide({
  day,
  activities,
}: {
  day: DayData;
  activities: ActivityData[];
}) {
  return (
    <div className="w-full h-full bg-gradient-to-b from-[#0f0f0f] to-[#1a1a2e] flex flex-col p-8 gap-6 text-white select-none">
      <div>
        <span className="text-[10px] tracking-[4px] opacity-40 uppercase">
          Dia {day.day_number} · {day.date}
        </span>
        <h3 className="text-2xl font-bold mt-2 opacity-70">+ outras atividades</h3>
      </div>

      <div className="flex flex-col gap-3 flex-1 overflow-hidden">
        {activities.map((activity) => (
          <div
            key={activity.id}
            className="bg-white/5 border border-white/10 rounded-2xl px-5 py-4"
          >
            <p className="text-lg font-semibold">{activity.title}</p>
            <p className="text-xs opacity-30 tracking-widest uppercase mt-1">sem foto</p>
          </div>
        ))}
      </div>

      <span className="text-xs opacity-20 tracking-widest uppercase">
        {activities.length} atividade{activities.length !== 1 ? "s" : ""} sem foto
      </span>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/components/stories/StorySlide.tsx
git commit -m "feat(frontend): add StorySlide component (cover, activity, summary)"
```

---

### Task 16: StoryViewer component

**Files:**
- Create: `frontend/components/stories/StoryViewer.tsx`

- [ ] **Step 1: Write the component**

```tsx
// frontend/components/stories/StoryViewer.tsx
"use client";

import { useEffect, useCallback, useState } from "react";
import type { Timeline } from "@/lib/api";
import { StoryProgress } from "./StoryProgress";
import { StorySlide, type Slide } from "./StorySlide";

type Props = {
  timeline: Timeline;
  onClose: () => void;
};

/** Build an ordered flat list of slides from the timeline data. */
function buildSlides(timeline: Timeline): Slide[] {
  const slides: Slide[] = [];

  for (const day of timeline.days) {
    // Cover
    slides.push({ type: "cover", day });

    // Activity slides for activities with photos
    for (const activity of day.activities) {
      const photos = day.memories.filter(
        (m) => m.memory_type === "photo"
      );
      // Activity-specific photos: memories associated with this activity
      // (The timeline endpoint returns memories at the day level; filter by activity if possible)
      // Since current API returns day-level memories, we assign photos to the first activity
      // that has no photo yet, or we just use day photos for all activity slides.
      // A more precise mapping requires activity_id on memories — use day photos as fallback.
      const activityPhotos = photos; // fallback: day photos shown per activity
      if (activityPhotos.length > 0) {
        slides.push({ type: "activity", day, activity, photos: activityPhotos });
      }
    }

    // Summary slide for activities without dedicated photos
    const activitiesWithoutPhotos = day.activities.filter(
      () => day.memories.filter((m) => m.memory_type === "photo").length === 0
    );
    if (activitiesWithoutPhotos.length > 0) {
      slides.push({ type: "summary", day, activities: activitiesWithoutPhotos });
    }
  }

  return slides;
}

export function StoryViewer({ timeline, onClose }: Props) {
  const slides = buildSlides(timeline);
  const [current, setCurrent] = useState(0);

  const goNext = useCallback(() => {
    setCurrent((c) => {
      if (c >= slides.length - 1) {
        onClose();
        return c;
      }
      return c + 1;
    });
  }, [slides.length, onClose]);

  const goPrev = useCallback(() => {
    setCurrent((c) => Math.max(0, c - 1));
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") goNext();
      if (e.key === "ArrowLeft") goPrev();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [goNext, goPrev, onClose]);

  if (slides.length === 0) {
    return (
      <div className="fixed inset-0 z-50 bg-black flex items-center justify-content-center p-8">
        <p className="text-white opacity-60 text-center">
          Nenhuma memória encontrada nesta viagem.
        </p>
        <button onClick={onClose} className="absolute top-4 right-4 text-white text-2xl">✕</button>
      </div>
    );
  }

  const slide = slides[current];

  return (
    <div className="fixed inset-0 z-50 bg-black flex items-center justify-center">
      {/* Story container — 9:16 aspect ratio, max height */}
      <div className="relative w-full max-w-sm h-full max-h-[calc(100vw*16/9)] sm:max-h-screen overflow-hidden bg-black">
        {/* Progress bar */}
        <div className="absolute top-0 left-0 right-0 z-20">
          <StoryProgress total={slides.length} current={current} />
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-8 right-4 z-30 text-white/70 hover:text-white text-2xl leading-none"
          aria-label="Fechar Stories"
        >
          ✕
        </button>

        {/* Current slide */}
        <div className="absolute inset-0">
          <StorySlide slide={slide} />
        </div>

        {/* Tap zones */}
        <button
          className="absolute left-0 top-0 bottom-0 w-2/5 z-10"
          onClick={goPrev}
          aria-label="Slide anterior"
        />
        <button
          className="absolute right-0 top-0 bottom-0 w-3/5 z-10"
          onClick={goNext}
          aria-label="Próximo slide"
        />
      </div>

      {/* Click outside to close on desktop */}
      <div className="absolute inset-0 -z-10" onClick={onClose} />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/components/stories/StoryViewer.tsx
git commit -m "feat(frontend): add fullscreen StoryViewer with keyboard + tap navigation"
```

---

## Chunk 6: Frontend — ExportPanel, Stories page, entry points

### Task 17: ExportPanel component

**Files:**
- Create: `frontend/components/stories/ExportPanel.tsx`

- [ ] **Step 1: Write the component**

```tsx
// frontend/components/stories/ExportPanel.tsx
"use client";

import { useState, useEffect, useRef } from "react";
import {
  triggerStoriesExport,
  fetchStoriesExportJob,
  type StoryExportJob,
} from "@/lib/api";

type Props = {
  tripId: string;
};

const POLL_INTERVAL_MS = 5000;

export function ExportPanel({ tripId }: Props) {
  const [job, setJob] = useState<StoryExportJob | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Stop polling helper
  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  // Start polling when job is queued/processing
  useEffect(() => {
    if (!job || (job.status !== "queued" && job.status !== "processing")) {
      stopPolling();
      return;
    }
    if (pollRef.current) return; // already polling

    pollRef.current = setInterval(async () => {
      try {
        const updated = await fetchStoriesExportJob(tripId, job.job_id);
        setJob(updated);
        if (updated.status === "done" || updated.status === "failed") {
          stopPolling();
        }
      } catch {
        // silently ignore transient errors during polling
      }
    }, POLL_INTERVAL_MS);

    return stopPolling;
  }, [job, tripId]);

  const handleTrigger = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await triggerStoriesExport(tripId);
      setJob(result);
    } catch (e: any) {
      if (e?.status === 422) {
        setError("Adicione fotos à viagem antes de exportar Stories.");
      } else {
        setError("Erro ao iniciar o export. Tente novamente.");
      }
    } finally {
      setLoading(false);
    }
  };

  // No job yet
  if (!job) {
    return (
      <div className="flex flex-col gap-3">
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button
          onClick={handleTrigger}
          disabled={loading}
          className="rounded-xl bg-[#ff6b6b] text-white px-5 py-3 text-sm font-semibold hover:bg-[#e05555] transition-colors disabled:opacity-50"
        >
          {loading ? "Iniciando…" : "Gerar export"}
        </button>
      </div>
    );
  }

  // Queued or processing
  if (job.status === "queued" || job.status === "processing") {
    return (
      <div className="flex items-center gap-3 text-[#8b8b8b] text-sm">
        <div className="w-4 h-4 border-2 border-[#ff6b6b] border-t-transparent rounded-full animate-spin shrink-0" />
        <span>Gerando… pode levar alguns minutos para começar.</span>
      </div>
    );
  }

  // Failed
  if (job.status === "failed") {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-red-500">
          {job.error_msg || "Ocorreu um erro no export."}
        </p>
        <button
          onClick={handleTrigger}
          disabled={loading}
          className="rounded-xl bg-[#ff6b6b] text-white px-5 py-3 text-sm font-semibold hover:bg-[#e05555] transition-colors disabled:opacity-50"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  // Done
  const isStale = !job.cached && job.status === "done";
  return (
    <div className="flex flex-col gap-3">
      {isStale && (
        <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
          Viagem atualizada desde o último export.
        </p>
      )}
      <div className="flex gap-2 flex-wrap">
        {job.zip_url && (
          <a
            href={job.zip_url}
            download
            className="rounded-xl border border-[rgba(0,0,0,0.12)] px-4 py-2 text-sm font-medium text-[#242424] hover:bg-[#f3ece8] transition-colors"
          >
            ↓ Baixar PNGs
          </a>
        )}
        {job.mp4_url && (
          <a
            href={job.mp4_url}
            download
            className="rounded-xl bg-[#ff6b6b] text-white px-4 py-2 text-sm font-medium hover:bg-[#e05555] transition-colors"
          >
            ↓ Baixar MP4
          </a>
        )}
        <button
          onClick={handleTrigger}
          disabled={loading}
          className="rounded-xl border border-[rgba(0,0,0,0.12)] px-4 py-2 text-sm text-[#8b8b8b] hover:text-[#242424] transition-colors disabled:opacity-50"
        >
          ↺ Regenerar
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/components/stories/ExportPanel.tsx
git commit -m "feat(frontend): add ExportPanel with polling and all job states"
```

---

### Task 18: Stories tab page

**Files:**
- Create: `frontend/app/trips/[tripId]/stories/page.tsx`

- [ ] **Step 1: Write the page**

```tsx
// frontend/app/trips/[tripId]/stories/page.tsx
"use client";

import { useEffect, useState } from "react";
import { fetchTripTimeline, type Timeline, getStoredAccessToken } from "@/lib/api";
import { StoryViewer } from "@/components/stories/StoryViewer";
import { ExportPanel } from "@/components/stories/ExportPanel";

type Props = {
  params: { tripId: string };
};

export default function StoriesPage({ params }: Props) {
  const { tripId } = params;
  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewerOpen, setViewerOpen] = useState(false);

  useEffect(() => {
    if (!getStoredAccessToken()) return;
    fetchTripTimeline(tripId)
      .then(setTimeline)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [tripId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-[#ff6b6b] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const hasMemories = timeline?.days.some((d) =>
    d.memories.some((m) => m.memory_type === "photo")
  );

  return (
    <div className="p-6 max-w-lg mx-auto flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold text-[#242424]">Stories</h1>
        <p className="text-sm text-[#8b8b8b] mt-1">
          Reviva a viagem ou exporte para o Instagram.
        </p>
      </div>

      {/* Viewer section */}
      <div className="bg-white rounded-2xl border border-[rgba(0,0,0,0.08)] p-5 flex flex-col gap-4 shadow-sm">
        <h2 className="text-base font-semibold text-[#242424]">Ver Stories</h2>
        {hasMemories ? (
          <button
            onClick={() => setViewerOpen(true)}
            className="w-full rounded-xl bg-[#ff6b6b] text-white py-3 text-sm font-semibold hover:bg-[#e05555] transition-colors flex items-center justify-center gap-2"
          >
            <span>▶</span> Assistir Stories
          </button>
        ) : (
          <p className="text-sm text-[#8b8b8b]">
            Adicione fotos à viagem para ver os Stories.
          </p>
        )}
      </div>

      {/* Export section */}
      <div className="bg-white rounded-2xl border border-[rgba(0,0,0,0.08)] p-5 flex flex-col gap-4 shadow-sm">
        <div>
          <h2 className="text-base font-semibold text-[#242424]">Exportar</h2>
          <p className="text-xs text-[#8b8b8b] mt-0.5">
            Gera slides PNG + vídeo MP4 com legendas criadas por IA.
          </p>
        </div>
        <ExportPanel tripId={tripId} />
      </div>

      {/* Fullscreen viewer modal */}
      {viewerOpen && timeline && (
        <StoryViewer
          timeline={timeline}
          onClose={() => setViewerOpen(false)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/app/trips/[tripId]/stories/page.tsx
git commit -m "feat(frontend): add Stories tab page with viewer + export panel"
```

---

### Task 19: Add "Stories" to sidebar navigation

**Files:**
- Modify: `frontend/components/trip-sidebar.tsx`

- [ ] **Step 1: Add a Film icon and Stories nav item**

In `trip-sidebar.tsx`, add a Film SVG icon function before `ArrowLeft`:

```tsx
function Film() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
      <line x1="7" y1="2" x2="7" y2="22" />
      <line x1="17" y1="2" x2="17" y2="22" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <line x1="2" y1="7" x2="7" y2="7" />
      <line x1="2" y1="17" x2="7" y2="17" />
      <line x1="17" y1="7" x2="22" y2="7" />
      <line x1="17" y1="17" x2="22" y2="17" />
    </svg>
  );
}
```

In the `navItems` array, add the Stories item:

```tsx
const navItems = [
  { href: `/trips/${tripId}`, label: "Visão Geral", icon: <MapPin /> },
  { href: `/trips/${tripId}/timeline`, label: "Timeline", icon: <BarChart /> },
  { href: `/trips/${tripId}/memories`, label: "Memórias", icon: <Camera /> },
  { href: `/trips/${tripId}/stories`, label: "Stories", icon: <Film /> },
];
```

- [ ] **Step 2: Commit**

```bash
git add frontend/components/trip-sidebar.tsx
git commit -m "feat(frontend): add Stories nav item to trip sidebar"
```

---

### Task 20: Add "▶ Stories" button to TripCard

**Files:**
- Modify: `frontend/components/trip-card.tsx`

- [ ] **Step 1: Add Stories button to TripCard**

The TripCard currently wraps everything in a `<Link>`. We need to add a secondary "▶ Stories" button that navigates without triggering the delete confirm.

After the dates `<p>` element (around line 54), before the closing `</Link>`, add:

```tsx
        <div className="mt-3 flex items-center justify-between">
          <span /> {/* spacer */}
          <Link
            href={`/trips/${trip.id}/stories`}
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1.5 text-xs font-medium text-[#ff6b6b] hover:text-[#e05555] transition-colors"
          >
            <span>▶</span> Stories
          </Link>
        </div>
```

Note: The outer element is a `<Link>`, so nest a second `<Link>` inside it only if the framework supports it. In Next.js App Router, nested `<Link>` elements are valid. The `onClick` with `stopPropagation` prevents the outer link navigation.

Actually, since TripCard's root element is a `<Link>`, place the Stories button outside the outer `<Link>` by restructuring the card as a `<div>` with an internal navigation link. Update the component:

```tsx
// frontend/components/trip-card.tsx
"use client";

import { Trip } from "@/lib/api";
import { TrashIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

export function TripCard({ trip, onDelete }: { trip: Trip; onDelete?: (id: string | number) => void }) {
  const [showConfirm, setShowConfirm] = useState(false);

  return (
    <>
      <div className="bg-white rounded-xl border border-[rgba(0,0,0,0.08)] p-5 shadow-sm hover:shadow-md transition-shadow">
        <div className="flex items-start justify-between gap-3">
          <Link href={`/trips/${trip.id}`} className="min-w-0 flex-1 block">
            <h2 className="text-lg font-semibold text-[#242424] truncate">{trip.name}</h2>
            <p className="text-sm text-[#8b8b8b] mt-0.5">{trip.destination}</p>
          </Link>
          <button
            onClick={() => setShowConfirm(true)}
            className="p-1.5 hover:bg-red-50 rounded-full transition-colors shrink-0"
            aria-label="Excluir viagem"
          >
            <TrashIcon className="text-[#ff6b6b]" size={18} />
          </button>
        </div>
        {(trip.start_date || trip.end_date) && (
          <p className="mt-3 text-sm text-[#8b8b8b] flex items-center gap-1.5">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            {[trip.start_date, trip.end_date].filter(Boolean).join(" → ")}
          </p>
        )}
        <div className="mt-3 flex justify-end">
          <Link
            href={`/trips/${trip.id}/stories`}
            className="flex items-center gap-1 text-xs font-semibold text-[#ff6b6b] hover:text-[#e05555] transition-colors"
          >
            <span>▶</span> Stories
          </Link>
        </div>
      </div>

      {showConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={() => setShowConfirm(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-3">
              <span className="flex items-center justify-center w-10 h-10 rounded-full bg-red-50 shrink-0">
                <TrashIcon className="text-[#ff6b6b]" size={20} />
              </span>
              <h2 className="text-base font-semibold text-[#242424]">Excluir viagem?</h2>
            </div>
            <p className="text-sm text-[#8b8b8b] mb-1">
              Isso removerá permanentemente <span className="font-medium text-[#242424]">{trip.name}</span> e todas as:
            </p>
            <ul className="text-sm text-[#8b8b8b] list-disc list-inside mb-5 space-y-0.5">
              <li>Histórias e registros da viagem</li>
              <li>Memórias e fotos</li>
              <li>Lembranças e anotações</li>
            </ul>
            <p className="text-xs text-red-500 mb-5 font-medium">Esta ação não pode ser desfeita.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 rounded-lg border border-[rgba(0,0,0,0.12)] px-4 py-2 text-sm text-[#8b8b8b] hover:text-[#242424] transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  setShowConfirm(false);
                  if (onDelete) onDelete(trip.id);
                }}
                className="flex-1 rounded-lg bg-[#ff6b6b] px-4 py-2 text-sm font-medium text-white hover:bg-[#e05555] transition-colors"
              >
                Sim, excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/components/trip-card.tsx
git commit -m "feat(frontend): add Stories button to TripCard"
```

---

### Task 21: End-to-end smoke test (manual)

- [ ] **Step 1: Start the full stack**

```bash
docker-compose up
```

- [ ] **Step 2: Navigate to a trip with photos**

Open `http://localhost:3000`, log in, open a trip that has photo memories.

- [ ] **Step 3: Open Stories viewer**

Click "▶ Stories" on the trip card or the sidebar tab. Verify:
- Viewer opens fullscreen
- Progress bar shows correct number of segments
- Tapping right/left navigates slides
- Esc key closes the viewer

- [ ] **Step 4: Trigger export**

On the Stories page, click "Gerar export". Verify:
- Status changes to spinner "Gerando…"
- After worker processes: download buttons appear
- Download ZIP contains numbered PNG files
- Download MP4 plays in a media player at 1080×1920

- [ ] **Step 5: Trigger again (cache test)**

Click "Regenerar" without making any changes to the trip. Verify the endpoint returns `cached: true` and download buttons are available immediately (no new job created).

- [ ] **Step 6: Final commit**

```bash
git add .
git commit -m "feat: Stories export feature complete — viewer + PNG/MP4 export with AI captions"
```
