# Activity Location Linking Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a normalized `locations` table per trip, link days and activities to it, and display location-grouped days in the frontend timeline.

**Architecture:** A new `locations` table (scoped per trip) stores `country`, `city`, `region`, `place_name`. `days.location_id` and `activities.location_id` FKs reference it. The itinerary worker extracts structured locations from OpenAI and persists them. The backend API includes location data in timeline responses. The frontend groups timeline days by `(country, city)`.

**Tech Stack:** Python 3.12, SQLAlchemy 2 mapped columns, Alembic, psycopg3 direct SQL (worker), FastAPI, Pydantic v2, TypeScript, Next.js 14 App Router, Tailwind CSS.

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `backend/alembic/versions/20260315_0002_add_locations_table.py` | DB migration |
| Create | `backend/app/models/location.py` | Location ORM model |
| Modify | `backend/app/models/day.py` | Add `location_id` + `location` relationship |
| Modify | `backend/app/models/activity.py` | Add `location_id` + `location_detail` relationship |
| Modify | `backend/app/models/__init__.py` | Export Location |
| Create | `backend/app/schemas/location.py` | `LocationResponse`, `LocationPatchRequest` |
| Modify | `backend/app/schemas/timeline.py` | Add location fields to `TimelineDay`, `TimelineActivity` |
| Modify | `backend/app/schemas/activity.py` | Add `location_detail` to `ActivityRead` |
| Modify | `backend/app/schemas/__init__.py` | Export `LocationResponse` |
| Modify | `backend/app/api/routes/trips.py` | Timeline + PATCH location endpoints |
| Modify | `backend/tests/integration/conftest.py` | Create Location table in test fixture |
| Create | `backend/tests/unit/test_location_model.py` | Model attribute tests |
| Create | `backend/tests/unit/test_location_schema.py` | Schema validation tests |
| Create | `backend/tests/unit/test_timeline_location_schema.py` | Timeline schema field tests |
| Modify | `backend/tests/integration/test_trips_api_integration.py` | Timeline + PATCH endpoint tests |
| Modify | `worker/app/main.py` | Update prompt + persistence |
| Create | `worker/tests/test_itinerary_prompt.py` | Prompt format tests |
| Create | `worker/tests/test_itinerary_persist.py` | Persistence location insert tests |
| Modify | `frontend/lib/api.ts` | Add `Location` type, update `Timeline`, `Activity` |
| Modify | `frontend/app/trips/[tripId]/timeline/page.tsx` | Location grouping render |

---

## Chunk 1: Database Layer

### Task 1: Alembic Migration

**Files:**
- Create: `backend/alembic/versions/20260315_0002_add_locations_table.py`

- [ ] **Step 1: Verify the current Alembic head**

```bash
cd backend
alembic heads
```

Expected output: `20260315_0001 (head)`. The current head is `20260315_0001` (add_cover_image_url_to_trips). If the output shows a different head, update `down_revision` in the migration file below to match.

- [ ] **Step 2: Create migration file**

Create `backend/alembic/versions/20260315_0002_add_locations_table.py`:

```python
"""add locations table

Revision ID: 20260315_0002
Revises: 20260315_0001
Create Date: 2026-03-15
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "20260315_0002"
down_revision = "20260315_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "locations",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "trip_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("trips.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("country", sa.Text(), nullable=False),
        sa.Column("city", sa.Text(), nullable=False),
        sa.Column("region", sa.Text(), nullable=True),
        sa.Column("place_name", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.add_column(
        "days",
        sa.Column(
            "location_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("locations.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column(
        "activities",
        sa.Column(
            "location_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("locations.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("activities", "location_id")
    op.drop_column("days", "location_id")
    op.drop_table("locations")
```

- [ ] **Step 3: Dry-run the migration to check syntax**

```bash
cd backend
alembic upgrade --sql head 2>&1 | tail -40
```

Expected: SQL output with `CREATE TABLE locations`, two `ALTER TABLE ... ADD COLUMN location_id`. No Python errors.

- [ ] **Step 4: Commit**

```bash
git add backend/alembic/versions/20260315_0002_add_locations_table.py
git commit -m "feat: add locations table migration"
```

---

### Task 2: Location SQLAlchemy Model

**Files:**
- Create: `backend/app/models/location.py`
- Modify: `backend/app/models/__init__.py`
- Create: `backend/tests/unit/test_location_model.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/unit/test_location_model.py`:

```python
import uuid

from app.models.location import Location


def test_location_model_has_expected_fields() -> None:
    loc = Location(
        trip_id=uuid.uuid4(),
        country="France",
        city="Paris",
        region="Montmartre",
        place_name="Sacré-Cœur",
    )
    assert loc.country == "France"
    assert loc.city == "Paris"
    assert loc.region == "Montmartre"
    assert loc.place_name == "Sacré-Cœur"


def test_location_model_nullable_fields_default_to_none() -> None:
    loc = Location(trip_id=uuid.uuid4(), country="Italy", city="Rome")
    assert loc.region is None
    assert loc.place_name is None
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend
pytest tests/unit/test_location_model.py -v
```

Expected: FAIL with `ModuleNotFoundError: No module named 'app.models.location'`

- [ ] **Step 3: Create `backend/app/models/location.py`**

```python
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Location(Base):
    __tablename__ = "locations"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    trip_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("trips.id", ondelete="CASCADE"),
        nullable=False,
    )
    country: Mapped[str] = mapped_column(Text, nullable=False)
    city: Mapped[str] = mapped_column(Text, nullable=False)
    region: Mapped[str | None] = mapped_column(Text, nullable=True)
    place_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd backend
pytest tests/unit/test_location_model.py -v
```

Expected: PASS

- [ ] **Step 5: Update `backend/app/models/__init__.py`**

Replace the file content with:

```python
from app.models.activity import Activity
from app.models.day import Day
from app.models.embedding import Embedding
from app.models.location import Location
from app.models.memory import Memory
from app.models.story_export_job import StoryExportJob  # noqa: F401
from app.models.trip import Trip

__all__ = ["Trip", "Day", "Activity", "Memory", "Embedding", "StoryExportJob", "Location"]
```

- [ ] **Step 6: Commit**

```bash
git add backend/app/models/location.py backend/app/models/__init__.py backend/tests/unit/test_location_model.py
git commit -m "feat: add Location SQLAlchemy model"
```

---

### Task 3: Add location_id FK to Day and Activity Models

**Files:**
- Modify: `backend/app/models/day.py`
- Modify: `backend/app/models/activity.py`
- Modify: `backend/tests/integration/conftest.py`
- Create: `backend/tests/unit/test_location_relationships.py`

- [ ] **Step 1: Write failing test**

Create `backend/tests/unit/test_location_relationships.py`:

```python
def test_day_model_has_location_attributes():
    from app.models.day import Day

    day = Day.__new__(Day)
    assert hasattr(day, "location_id")
    assert hasattr(day, "location")


def test_activity_model_has_location_detail_attributes():
    from app.models.activity import Activity

    act = Activity.__new__(Activity)
    assert hasattr(act, "location_id")
    assert hasattr(act, "location_detail")
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend
pytest tests/unit/test_location_relationships.py -v
```

Expected: FAIL — attributes not found

- [ ] **Step 3: Update `backend/app/models/day.py`**

Replace the file content with:

```python
import uuid
from datetime import date as DateType
from datetime import datetime

from sqlalchemy import Date, DateTime, ForeignKey, Integer, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Day(Base):
    __tablename__ = "days"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    trip_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("trips.id", ondelete="CASCADE"), nullable=False
    )
    day_number: Mapped[int] = mapped_column(Integer, nullable=False)
    date: Mapped[DateType | None] = mapped_column(Date, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    location_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("locations.id", ondelete="SET NULL"),
        nullable=True,
    )

    trip = relationship("Trip", back_populates="days")
    activities = relationship(
        "Activity", back_populates="day", cascade="all, delete-orphan"
    )
    location = relationship("Location", foreign_keys=[location_id])
```

- [ ] **Step 4: Update `backend/app/models/activity.py`**

Replace the file content with:

```python
import uuid
from datetime import datetime, time

from sqlalchemy import DateTime, ForeignKey, Text, Time, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Activity(Base):
    __tablename__ = "activities"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    day_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("days.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(Text, nullable=False)
    location: Mapped[str | None] = mapped_column(Text, nullable=True)
    scheduled_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(Text, nullable=False, default="planned")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
    location_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("locations.id", ondelete="SET NULL"),
        nullable=True,
    )

    day = relationship("Day", back_populates="activities")
    location_detail = relationship("Location", foreign_keys=[location_id])
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd backend
pytest tests/unit/test_location_relationships.py -v
```

Expected: PASS

- [ ] **Step 6: Update integration test conftest to create Location table**

In `backend/tests/integration/conftest.py`:

**6a. Add import at the top of the file** alongside the existing model imports (currently around lines 10–13):

```python
from app.models.location import Location  # add this line
```

**6b. Inside the `db_session` fixture**, add `Location.__table__.create(bind=engine)` **before** `Trip.__table__.create(...)` — Location must be created first because `days` and `activities` FK into it. The complete table creation block inside the fixture becomes:

```python
Location.__table__.create(bind=engine)
Trip.__table__.create(bind=engine)
Day.__table__.create(bind=engine)
Activity.__table__.create(bind=engine)
Memory.__table__.create(bind=engine)
```

- [ ] **Step 7: Run all existing tests to confirm no regressions**

```bash
cd backend
pytest tests/ -v
```

Expected: All previously passing tests still PASS

- [ ] **Step 8: Commit**

```bash
git add backend/app/models/day.py backend/app/models/activity.py \
        backend/tests/unit/test_location_relationships.py \
        backend/tests/integration/conftest.py
git commit -m "feat: add location_id FK to Day and Activity ORM models"
```

---

## Chunk 2: Backend Schemas + Routes

### Task 4: LocationResponse and LocationPatchRequest Schemas

**Files:**
- Create: `backend/app/schemas/location.py`
- Modify: `backend/app/schemas/__init__.py`
- Create: `backend/tests/unit/test_location_schema.py`

- [ ] **Step 1: Write failing test**

Create `backend/tests/unit/test_location_schema.py`:

```python
import uuid
from types import SimpleNamespace

from app.schemas.location import LocationPatchRequest, LocationResponse


def test_location_response_validates_from_attributes():
    loc = SimpleNamespace(
        id=uuid.UUID("12345678-1234-5678-1234-567812345678"),
        country="France",
        city="Paris",
        region="Montmartre",
        place_name="Sacré-Cœur",
    )
    result = LocationResponse.model_validate(loc)
    assert result.country == "France"
    assert result.city == "Paris"
    assert result.region == "Montmartre"
    assert isinstance(result.id, uuid.UUID)


def test_location_response_nullable_fields():
    loc = SimpleNamespace(
        id=uuid.uuid4(),
        country="Italy",
        city="Rome",
        region=None,
        place_name=None,
    )
    result = LocationResponse.model_validate(loc)
    assert result.region is None
    assert result.place_name is None


def test_location_patch_request_requires_country_and_city():
    req = LocationPatchRequest(country="Spain", city="Madrid")
    assert req.country == "Spain"
    assert req.city == "Madrid"
    assert req.region is None
    assert req.place_name is None
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend
pytest tests/unit/test_location_schema.py -v
```

Expected: FAIL with `ModuleNotFoundError`

- [ ] **Step 3: Create `backend/app/schemas/location.py`**

```python
import uuid

from pydantic import BaseModel, ConfigDict


class LocationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    country: str
    city: str
    region: str | None
    place_name: str | None


class LocationPatchRequest(BaseModel):
    country: str
    city: str
    region: str | None = None
    place_name: str | None = None
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd backend
pytest tests/unit/test_location_schema.py -v
```

Expected: PASS

- [ ] **Step 5: Update `backend/app/schemas/__init__.py`**

Add import:
```python
from app.schemas.location import LocationResponse
```

Add `"LocationResponse"` to the `__all__` list.

- [ ] **Step 6: Commit**

```bash
git add backend/app/schemas/location.py backend/app/schemas/__init__.py \
        backend/tests/unit/test_location_schema.py
git commit -m "feat: add LocationResponse and LocationPatchRequest schemas"
```

---

### Task 5: Update Timeline and Activity Schemas

**Files:**
- Modify: `backend/app/schemas/timeline.py`
- Modify: `backend/app/schemas/activity.py`
- Create: `backend/tests/unit/test_timeline_location_schema.py`

- [ ] **Step 1: Write failing test**

Create `backend/tests/unit/test_timeline_location_schema.py`:

```python
import uuid
from datetime import datetime

from app.schemas.activity import ActivityRead
from app.schemas.timeline import TimelineActivity, TimelineDay


def test_timeline_day_accepts_location_field():
    day = TimelineDay(
        id=uuid.uuid4(),
        day_number=1,
        date=None,
        activities=[],
        memories=[],
        location=None,
    )
    assert day.location is None


def test_timeline_activity_accepts_location_detail_field():
    act = TimelineActivity(
        id=uuid.uuid4(),
        title="Visit Eiffel Tower",
        location="Paris",
        scheduled_time=None,
        status="planned",
        location_detail=None,
    )
    assert act.location_detail is None


def test_activity_read_accepts_location_detail_field():
    act = ActivityRead(
        id=uuid.uuid4(),
        day_id=uuid.uuid4(),
        title="Test",
        created_at=datetime.now(),
        updated_at=datetime.now(),
        location_detail=None,
    )
    assert act.location_detail is None
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend
pytest tests/unit/test_timeline_location_schema.py -v
```

Expected: FAIL — `TimelineDay` and `TimelineActivity` do not accept `location`/`location_detail` kwargs

- [ ] **Step 3: Replace `backend/app/schemas/timeline.py`**

```python
import uuid
from datetime import date as DateType
from datetime import datetime, time

from pydantic import BaseModel

from app.schemas.location import LocationResponse


class TimelineActivity(BaseModel):
    id: uuid.UUID
    title: str
    location: str | None
    scheduled_time: time | None
    status: str
    location_detail: LocationResponse | None = None


class TimelineMemory(BaseModel):
    id: uuid.UUID
    memory_type: str
    caption: str | None
    storage_key: str | None
    public_url: str | None = None
    created_at: datetime


class TimelineDay(BaseModel):
    id: uuid.UUID
    day_number: int
    date: DateType | None
    activities: list[TimelineActivity]
    memories: list[TimelineMemory]
    location: LocationResponse | None = None


class TripTimelineRead(BaseModel):
    trip_id: uuid.UUID
    days: list[TimelineDay]
```

- [ ] **Step 4: Update `backend/app/schemas/activity.py`** — add `location_detail` to `ActivityRead`

```python
import uuid
from datetime import datetime, time

from pydantic import BaseModel, ConfigDict

from app.schemas.location import LocationResponse


class ActivityBase(BaseModel):
    day_id: uuid.UUID
    title: str
    location: str | None = None
    scheduled_time: time | None = None
    notes: str | None = None
    status: str = "planned"


class ActivityCreate(ActivityBase):
    pass


class ActivityUpdate(BaseModel):
    title: str | None = None
    location: str | None = None
    scheduled_time: time | None = None
    notes: str | None = None
    status: str | None = None


class ActivityRead(ActivityBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    created_at: datetime
    updated_at: datetime
    location_detail: LocationResponse | None = None
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd backend
pytest tests/unit/test_timeline_location_schema.py -v
```

Expected: PASS

- [ ] **Step 6: Run full test suite**

```bash
cd backend
pytest tests/ -v
```

Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add backend/app/schemas/timeline.py backend/app/schemas/activity.py \
        backend/tests/unit/test_timeline_location_schema.py
git commit -m "feat: add location fields to timeline and activity schemas"
```

---

### Task 6: Update Timeline Route to Include Location

**Files:**
- Modify: `backend/app/api/routes/trips.py`
- Modify: `backend/tests/integration/test_trips_api_integration.py`

- [ ] **Step 1: Write failing integration test**

In `backend/tests/integration/test_trips_api_integration.py`, add this test at the end of the file:

```python
def test_timeline_includes_location_field(client, db_session):
    import uuid
    from datetime import date

    from app.models.day import Day
    from app.models.location import Location
    from app.models.trip import Trip

    trip_id = uuid.uuid4()
    location_id = uuid.uuid4()
    day_id = uuid.uuid4()

    location = Location(
        id=location_id,
        trip_id=trip_id,
        country="France",
        city="Paris",
    )
    trip = Trip(
        id=trip_id,
        name="Paris Trip",
        destinations=["Paris, France"],
        start_date=date(2026, 6, 1),
        end_date=date(2026, 6, 5),
        status="planned",
    )
    day = Day(
        id=day_id,
        trip_id=trip_id,
        day_number=1,
        location_id=location_id,
    )
    db_session.add_all([location, trip, day])
    db_session.commit()

    response = client.get(f"/api/v1/trips/{trip_id}/timeline")
    assert response.status_code == 200
    data = response.json()
    assert len(data["days"]) == 1
    assert data["days"][0]["location"]["country"] == "France"
    assert data["days"][0]["location"]["city"] == "Paris"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend
pytest tests/integration/test_trips_api_integration.py::test_timeline_includes_location_field -v
```

Expected: FAIL — `location` key missing or `None` in response

- [ ] **Step 3: Update the timeline route in `backend/app/api/routes/trips.py`**

> **Note on eager loading:** This route never commits, so SQLAlchemy's `expire_on_commit` does not apply and lazy-loading `day.location` / `activity.location_detail` works safely. We add `selectinload` anyway as a best practice to avoid N+1 queries on trips with many days.

Add these imports at the top of the file (alongside existing imports):
```python
from sqlalchemy.orm import selectinload

from app.models.activity import Activity as ActivityModel
from app.models.day import Day as DayModel
from app.schemas.location import LocationResponse
```

Replace the `get_trip_timeline` function with:

```python
@router.get("/{trip_id}/timeline", response_model=TripTimelineRead)
def get_trip_timeline(trip_id: uuid.UUID, db: Session = Depends(get_db)):
    trip_repository = TripRepository(db)
    trip = trip_repository.get(trip_id)
    if not trip:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Trip not found",
        )

    memory_repository = MemoryRepository(db)
    storage_service = StorageService()

    # DayRepository and ActivityRepository are bypassed here to use selectinload for
    # eager-loading location relationships — avoids N+1 queries on trips with many days.
    days = (
        db.query(DayModel)
        .filter(DayModel.trip_id == trip_id)
        .options(selectinload(DayModel.location))
        .order_by(DayModel.day_number)
        .limit(1000)
        .all()
    )

    timeline_days: list[TimelineDay] = []
    for day in days:
        activities = (
            db.query(ActivityModel)
            .filter(ActivityModel.day_id == day.id)
            .options(selectinload(ActivityModel.location_detail))
            .limit(1000)
            .all()
        )
        memories = memory_repository.list(
            trip_id=trip_id, day_id=day.id, limit=1000, offset=0
        )

        day_location = (
            LocationResponse.model_validate(day.location)
            if day.location is not None
            else None
        )

        timeline_days.append(
            TimelineDay(
                id=day.id,
                day_number=day.day_number,
                date=day.date,
                location=day_location,
                activities=[
                    TimelineActivity(
                        id=activity.id,
                        title=activity.title,
                        location=activity.location,
                        scheduled_time=activity.scheduled_time,
                        status=activity.status,
                        location_detail=(
                            LocationResponse.model_validate(activity.location_detail)
                            if activity.location_detail is not None
                            else None
                        ),
                    )
                    for activity in activities
                ],
                memories=[
                    TimelineMemory(
                        id=memory.id,
                        memory_type=memory.memory_type,
                        caption=memory.caption,
                        storage_key=memory.storage_key,
                        public_url=storage_service.build_public_object_url(
                            memory.storage_key
                        ),
                        created_at=memory.created_at,
                    )
                    for memory in memories
                ],
            )
        )

    return TripTimelineRead(trip_id=trip_id, days=timeline_days)
```

- [ ] **Step 4: Run the new test to verify it passes**

```bash
cd backend
pytest tests/integration/test_trips_api_integration.py::test_timeline_includes_location_field -v
```

Expected: PASS

- [ ] **Step 5: Run full test suite**

```bash
cd backend
pytest tests/ -v
```

Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/routes/trips.py \
        backend/tests/integration/test_trips_api_integration.py
git commit -m "feat: include location data in timeline API response"
```

---

### Task 7: Add PATCH Endpoints for Manual Location Editing

**Files:**
- Modify: `backend/app/schemas/location.py` (already has `LocationPatchRequest` from Task 4)
- Modify: `backend/app/api/routes/trips.py`
- Modify: `backend/tests/integration/test_trips_api_integration.py`

- [ ] **Step 1: Write failing integration tests**

Add to `backend/tests/integration/test_trips_api_integration.py`:

```python
def test_patch_day_location_creates_location_and_updates_fk(client, db_session):
    import uuid
    from datetime import date

    from app.models.day import Day
    from app.models.trip import Trip

    trip_id = uuid.uuid4()
    day_id = uuid.uuid4()

    trip = Trip(
        id=trip_id,
        name="Italy Trip",
        destinations=["Rome, Italy"],
        start_date=date(2026, 7, 1),
        end_date=date(2026, 7, 5),
        status="planned",
    )
    day = Day(id=day_id, trip_id=trip_id, day_number=1)
    db_session.add_all([trip, day])
    db_session.commit()

    response = client.patch(
        f"/api/v1/trips/{trip_id}/days/{day_id}/location",
        json={"country": "Italy", "city": "Rome"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["country"] == "Italy"
    assert data["city"] == "Rome"
    assert data["region"] is None
    assert "id" in data

    db_session.refresh(day)
    assert day.location_id is not None


def test_patch_activity_location_creates_location_and_updates_fk(client, db_session):
    import uuid
    from datetime import date

    from app.models.activity import Activity
    from app.models.day import Day
    from app.models.trip import Trip

    trip_id = uuid.uuid4()
    day_id = uuid.uuid4()
    activity_id = uuid.uuid4()

    trip = Trip(
        id=trip_id,
        name="Italy Trip",
        destinations=["Rome, Italy"],
        start_date=date(2026, 7, 1),
        end_date=date(2026, 7, 5),
        status="planned",
    )
    day = Day(id=day_id, trip_id=trip_id, day_number=1)
    activity = Activity(
        id=activity_id, day_id=day_id, title="Colosseum", status="planned"
    )
    db_session.add_all([trip, day, activity])
    db_session.commit()

    response = client.patch(
        f"/api/v1/trips/{trip_id}/activities/{activity_id}/location",
        json={"country": "Italy", "city": "Rome", "place_name": "Colosseum"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["place_name"] == "Colosseum"

    db_session.refresh(activity)
    assert activity.location_id is not None


def test_patch_day_location_returns_404_for_wrong_trip(client, db_session):
    import uuid
    from datetime import date

    from app.models.day import Day
    from app.models.trip import Trip

    trip_id = uuid.uuid4()
    wrong_trip_id = uuid.uuid4()
    day_id = uuid.uuid4()

    trip = Trip(
        id=trip_id,
        name="Test",
        destinations=["Paris"],
        start_date=date(2026, 6, 1),
        end_date=date(2026, 6, 5),
        status="planned",
    )
    day = Day(id=day_id, trip_id=trip_id, day_number=1)
    db_session.add_all([trip, day])
    db_session.commit()

    response = client.patch(
        f"/api/v1/trips/{wrong_trip_id}/days/{day_id}/location",
        json={"country": "France", "city": "Paris"},
    )
    assert response.status_code == 404


def test_patch_activity_location_returns_404_for_wrong_trip(client, db_session):
    import uuid
    from datetime import date

    from app.models.activity import Activity
    from app.models.day import Day
    from app.models.trip import Trip

    trip_id = uuid.uuid4()
    wrong_trip_id = uuid.uuid4()
    day_id = uuid.uuid4()
    activity_id = uuid.uuid4()

    trip = Trip(
        id=trip_id,
        name="Test",
        destinations=["Rome"],
        start_date=date(2026, 7, 1),
        end_date=date(2026, 7, 5),
        status="planned",
    )
    day = Day(id=day_id, trip_id=trip_id, day_number=1)
    activity = Activity(id=activity_id, day_id=day_id, title="Colosseum", status="planned")
    db_session.add_all([trip, day, activity])
    db_session.commit()

    response = client.patch(
        f"/api/v1/trips/{wrong_trip_id}/activities/{activity_id}/location",
        json={"country": "Italy", "city": "Rome"},
    )
    assert response.status_code == 404
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend
pytest tests/integration/test_trips_api_integration.py::test_patch_day_location_creates_location_and_updates_fk \
       tests/integration/test_trips_api_integration.py::test_patch_activity_location_creates_location_and_updates_fk \
       tests/integration/test_trips_api_integration.py::test_patch_day_location_returns_404_for_wrong_trip \
       tests/integration/test_trips_api_integration.py::test_patch_activity_location_returns_404_for_wrong_trip -v
```

Expected: FAIL with 404 or 405 (endpoints don't exist yet)

- [ ] **Step 3: Add imports and PATCH endpoints to `backend/app/api/routes/trips.py`**

**3a.** Extend the existing imports added in Task 6. The `ActivityModel` and `DayModel` imports are already there from Task 6. Add just the missing ones:

```python
from app.models.location import Location as LocationModel
from app.schemas.location import LocationPatchRequest  # LocationResponse already imported in Task 6
```

Add these two endpoints after `get_trip_timeline`:

```python
@router.patch(
    "/{trip_id}/days/{day_id}/location",
    response_model=LocationResponse,
)
def patch_day_location(
    trip_id: uuid.UUID,
    day_id: uuid.UUID,
    payload: LocationPatchRequest,
    db: Session = Depends(get_db),
):
    day = db.get(DayModel, day_id)
    if not day or day.trip_id != trip_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Day not found"
        )

    location = LocationModel(
        trip_id=trip_id,
        country=payload.country,
        city=payload.city,
        region=payload.region,
        place_name=payload.place_name,
    )
    db.add(location)
    db.flush()
    day.location_id = location.id
    db.commit()
    db.refresh(location)
    return LocationResponse.model_validate(location)


@router.patch(
    "/{trip_id}/activities/{activity_id}/location",
    response_model=LocationResponse,
)
def patch_activity_location(
    trip_id: uuid.UUID,
    activity_id: uuid.UUID,
    payload: LocationPatchRequest,
    db: Session = Depends(get_db),
):
    activity = db.get(ActivityModel, activity_id)
    if not activity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Activity not found"
        )
    day = db.get(DayModel, activity.day_id)
    if not day or day.trip_id != trip_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Activity not found"
        )

    location = LocationModel(
        trip_id=trip_id,
        country=payload.country,
        city=payload.city,
        region=payload.region,
        place_name=payload.place_name,
    )
    db.add(location)
    db.flush()
    activity.location_id = location.id
    db.commit()
    db.refresh(location)
    return LocationResponse.model_validate(location)
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend
pytest tests/integration/test_trips_api_integration.py::test_patch_day_location_creates_location_and_updates_fk \
       tests/integration/test_trips_api_integration.py::test_patch_activity_location_creates_location_and_updates_fk \
       tests/integration/test_trips_api_integration.py::test_patch_day_location_returns_404_for_wrong_trip \
       tests/integration/test_trips_api_integration.py::test_patch_activity_location_returns_404_for_wrong_trip -v
```

Expected: PASS

- [ ] **Step 5: Run full test suite**

```bash
cd backend
pytest tests/ -v
```

Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/routes/trips.py \
        backend/tests/integration/test_trips_api_integration.py
git commit -m "feat: add PATCH endpoints for manual day and activity location editing"
```

---

## Chunk 3: Worker Changes

### Task 8: Update Itinerary Prompt to Require Structured Locations

**Files:**
- Modify: `worker/app/main.py` (function `_build_itinerary_prompt_worker`)
- Create: `worker/tests/test_itinerary_prompt.py`

- [ ] **Step 1: Write failing test**

Create `worker/tests/test_itinerary_prompt.py`:

```python
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "app"))

from main import _build_itinerary_prompt_worker


def test_prompt_includes_structured_location_for_days():
    prompt = _build_itinerary_prompt_worker(
        trip_name="Paris Trip",
        destinations=["Paris, France"],
        start_date="2026-06-01",
        end_date="2026-06-05",
        summary=None,
        day_rows=[],
        activities_by_day={},
        preferences=None,
        max_days=5,
    )
    assert '"country"' in prompt
    assert '"city"' in prompt


def test_prompt_location_is_object_not_flat_string():
    prompt = _build_itinerary_prompt_worker(
        trip_name="Paris Trip",
        destinations=["Paris, France"],
        start_date="2026-06-01",
        end_date="2026-06-05",
        summary=None,
        day_rows=[],
        activities_by_day={},
        preferences=None,
        max_days=5,
    )
    # Old format was: "location": "local ou null"
    # New format must be a nested object
    assert '"location": "local ou null"' not in prompt


def test_prompt_includes_location_rules():
    prompt = _build_itinerary_prompt_worker(
        trip_name="Tokyo Trip",
        destinations=["Tokyo, Japan"],
        start_date="2026-09-01",
        end_date="2026-09-05",
        summary=None,
        day_rows=[],
        activities_by_day={},
        preferences=None,
        max_days=5,
    )
    # Rules section must be present
    assert "country" in prompt.lower()
    assert "city" in prompt.lower()
    assert "null" in prompt
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd worker
pytest tests/test_itinerary_prompt.py -v
```

Expected: FAIL — prompt still contains the old `"location": "local ou null"` format

- [ ] **Step 3: Update `_build_itinerary_prompt_worker` in `worker/app/main.py`**

Find the `return "\n".join([...])` block in `_build_itinerary_prompt_worker`. Replace it with:

```python
    return "\n".join(
        [
            "Você é um assistente de viagens para casal. Responda APENAS com um objeto JSON válido, sem texto adicional.",
            "",
            "O JSON deve seguir exatamente esta estrutura:",
            "{",
            '  "markdown": "<roteiro completo em Markdown com seções: visão geral, plano por dia, recomendações finais>",',
            '  "days": [',
            "    {",
            '      "day_number": 1,',
            '      "date": "YYYY-MM-DD ou null",',
            '      "notes": "resumo do dia em 1-2 frases ou null",',
            '      "location": {"country": "nome do país", "city": "nome da cidade", "region": null, "place_name": null},',
            '      "activities": [',
            "        {",
            '          "title": "nome da atividade",',
            '          "location": {"country": "nome do país", "city": "nome da cidade", "region": "bairro ou null", "place_name": "local específico ou null"},',
            '          "notes": "dica ou null"',
            "        }",
            "      ]",
            "    }",
            "  ]",
            "}",
            "",
            "Regras de localização:",
            '- Cada dia DEVE ter um objeto "location" com "country" (obrigatório) e "city" (obrigatório)',
            '- Cada atividade DEVE ter um objeto "location" com os mesmos campos',
            '- Nunca retorne null para "country" ou "city" — sempre preencha com o destino do dia',
            '- "region" e "place_name" são opcionais — use null se não souber',
            "",
            "Outras regras:",
            f"- Gere entre 1 e {max_days} dias",
            "- Cada dia deve ter entre 2 e 5 atividades",
            "- Não invente atrações muito específicas se não houver contexto",
            "- Use os dados da viagem abaixo como base",
            "- Se já existem atividades planejadas, inclua-as e complemente",
            "",
            f"Viagem: {trip_name}",
            f"Destinos: {dest_str}",
            f"Período: {start_date} até {end_date}",
            f"Resumo atual: {summary_text}",
            f"Preferências: {preferences_text}",
            "",
            "Contexto dos dias/atividades já existentes:",
            *[f"- {line}" for line in day_lines],
        ]
    )
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd worker
pytest tests/test_itinerary_prompt.py -v
```

Expected: PASS

- [ ] **Step 5: Run all worker tests**

```bash
cd worker
pytest tests/ -v
```

Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add worker/app/main.py worker/tests/test_itinerary_prompt.py
git commit -m "feat: update itinerary prompt to require structured location objects"
```

---

### Task 9: Update Worker Persistence to Insert Locations

**Files:**
- Modify: `worker/app/main.py` (function `_persist_itinerary_worker`)
- Create: `worker/tests/test_itinerary_persist.py`

- [ ] **Step 1: Write failing tests**

Create `worker/tests/test_itinerary_persist.py`:

```python
import os
import sys
import uuid

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "app"))

from unittest.mock import MagicMock

from main import _persist_itinerary_worker


def _make_mock_connection(fetchone_side_effects):
    """Create a mock psycopg3 connection with controlled fetchone responses."""
    conn = MagicMock()
    cursor = MagicMock()
    cursor_cm = MagicMock()
    cursor_cm.__enter__ = MagicMock(return_value=cursor)
    cursor_cm.__exit__ = MagicMock(return_value=False)
    conn.cursor.return_value = cursor_cm
    cursor.fetchone.side_effect = fetchone_side_effects
    return conn, cursor


def test_persist_inserts_location_for_day():
    trip_id = uuid.uuid4()
    location_id = uuid.uuid4()

    conn, cursor = _make_mock_connection(
        fetchone_side_effects=[
            None,             # day SELECT → not found
            (location_id,),   # locations INSERT RETURNING id
        ]
    )

    _persist_itinerary_worker(
        conn,
        trip_id,
        [
            {
                "day_number": 1,
                "date": "2026-06-01",
                "notes": "Great day",
                "location": {"country": "France", "city": "Paris", "region": None, "place_name": None},
                "activities": [],
            }
        ],
    )

    all_calls = [str(c) for c in cursor.execute.call_args_list]
    assert any("INSERT INTO locations" in c for c in all_calls)


def test_persist_skips_location_when_country_city_missing():
    trip_id = uuid.uuid4()

    conn, cursor = _make_mock_connection(
        fetchone_side_effects=[
            None,  # day SELECT → not found
        ]
    )

    _persist_itinerary_worker(
        conn,
        trip_id,
        [
            {
                "day_number": 1,
                "location": None,
                "activities": [],
            }
        ],
    )

    all_calls = [str(c) for c in cursor.execute.call_args_list]
    assert not any("INSERT INTO locations" in c for c in all_calls)


def test_persist_skips_activity_location_when_same_city_as_day():
    trip_id = uuid.uuid4()
    location_id = uuid.uuid4()

    conn, cursor = _make_mock_connection(
        fetchone_side_effects=[
            None,             # day SELECT → not found
            (location_id,),   # day locations INSERT RETURNING id
            None,             # activity SELECT → not found
            # no extra fetchone — activity location same city, no INSERT
        ]
    )

    _persist_itinerary_worker(
        conn,
        trip_id,
        [
            {
                "day_number": 1,
                "location": {"country": "France", "city": "Paris", "region": None, "place_name": None},
                "activities": [
                    {
                        "title": "Eiffel Tower",
                        "location": {"country": "France", "city": "Paris", "region": "7th", "place_name": "Eiffel Tower"},
                        "notes": None,
                    }
                ],
            }
        ],
    )

    all_calls = [str(c) for c in cursor.execute.call_args_list]
    location_inserts = [c for c in all_calls if "INSERT INTO locations" in c]
    # Only 1 INSERT: the day's location. Activity is same city → no second insert.
    assert len(location_inserts) == 1


def test_persist_inserts_activity_location_when_different_city():
    trip_id = uuid.uuid4()
    day_location_id = uuid.uuid4()
    act_location_id = uuid.uuid4()

    conn, cursor = _make_mock_connection(
        fetchone_side_effects=[
            None,                  # day SELECT → not found
            (day_location_id,),    # day locations INSERT RETURNING id
            None,                  # activity SELECT → not found
            (act_location_id,),    # activity locations INSERT RETURNING id
        ]
    )

    _persist_itinerary_worker(
        conn,
        trip_id,
        [
            {
                "day_number": 1,
                "location": {"country": "France", "city": "Paris", "region": None, "place_name": None},
                "activities": [
                    {
                        "title": "Day trip to Versailles",
                        "location": {"country": "France", "city": "Versailles", "region": None, "place_name": "Palace of Versailles"},
                        "notes": None,
                    }
                ],
            }
        ],
    )

    all_calls = [str(c) for c in cursor.execute.call_args_list]
    location_inserts = [c for c in all_calls if "INSERT INTO locations" in c]
    assert len(location_inserts) == 2


def test_persist_populates_activity_free_text_location_from_place_name():
    """Verify activities.location (free-text) is still populated after the prompt change.

    The old prompt returned location as a flat string ("Eiffel Tower, Paris").
    After the prompt change, location is a dict — the free-text field is now derived
    from place_name (or city as fallback). This test guards against regressions.
    """
    trip_id = uuid.uuid4()
    location_id = uuid.uuid4()

    conn, cursor = _make_mock_connection(
        fetchone_side_effects=[
            None,             # day SELECT → not found
            (location_id,),   # day locations INSERT RETURNING id
            None,             # activity SELECT → not found
        ]
    )

    _persist_itinerary_worker(
        conn,
        trip_id,
        [
            {
                "day_number": 1,
                "location": {"country": "France", "city": "Paris", "region": None, "place_name": None},
                "activities": [
                    {
                        "title": "Eiffel Tower visit",
                        "location": {"country": "France", "city": "Paris", "region": "7th", "place_name": "Eiffel Tower"},
                        "notes": None,
                    }
                ],
            }
        ],
    )

    all_calls = [str(c) for c in cursor.execute.call_args_list]
    activity_inserts = [c for c in all_calls if "INSERT INTO activities" in c]
    assert len(activity_inserts) == 1
    # The free-text location should be "Eiffel Tower" (from place_name)
    assert "Eiffel Tower" in activity_inserts[0]
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd worker
pytest tests/test_itinerary_persist.py -v
```

Expected: FAIL — `_persist_itinerary_worker` does not insert locations

- [ ] **Step 3: Replace `_persist_itinerary_worker` in `worker/app/main.py`**

Find the existing `_persist_itinerary_worker` function and replace it entirely with:

```python
def _persist_itinerary_worker(
    connection: psycopg.Connection,
    trip_id: uuid.UUID,
    structured_days: list[dict],
) -> tuple[int, int]:
    import logging

    logger = logging.getLogger(__name__)
    days_created = 0
    activities_created = 0

    for day_data in structured_days:
        day_number = int(day_data.get("day_number") or 0)
        if not day_number:
            continue

        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT id FROM days WHERE trip_id = %s AND day_number = %s",
                (trip_id, day_number),
            )
            existing_day = cursor.fetchone()

        # --- Day-level location ---
        day_loc = day_data.get("location") or {}
        day_country = (day_loc.get("country") or "").strip()
        day_city = (day_loc.get("city") or "").strip()
        day_location_id: uuid.UUID | None = None

        if day_country and day_city:
            day_location_id = uuid.uuid4()
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO locations (id, trip_id, country, city, region, place_name, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s, NOW())
                    RETURNING id
                    """,
                    (
                        day_location_id,
                        trip_id,
                        day_country,
                        day_city,
                        day_loc.get("region") or None,
                        day_loc.get("place_name") or None,
                    ),
                )
                row = cursor.fetchone()
                if row:
                    day_location_id = row[0]
        else:
            logger.warning(
                "Day %s has no structured location — skipping location insert",
                day_number,
            )

        if existing_day:
            day_id = existing_day[0]
            if day_location_id is not None:
                with connection.cursor() as cursor:
                    cursor.execute(
                        "UPDATE days SET location_id = %s WHERE id = %s",
                        (day_location_id, day_id),
                    )
        else:
            day_id = uuid.uuid4()
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO days (id, trip_id, day_number, date, notes, location_id, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s, NOW())
                    """,
                    (
                        day_id,
                        trip_id,
                        day_number,
                        day_data.get("date") or None,
                        day_data.get("notes") or None,
                        day_location_id,
                    ),
                )
            days_created += 1

        for act in day_data.get("activities", []):
            title = (act.get("title") or "").strip()
            if not title:
                continue

            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT id FROM activities WHERE day_id = %s AND LOWER(title) = LOWER(%s)",
                    (day_id, title),
                )
                existing_act = cursor.fetchone()

            if existing_act:
                continue

            # --- Activity-level location (only when differs from day) ---
            act_loc = act.get("location") or {}
            act_country = (act_loc.get("country") or "").strip()
            act_city = (act_loc.get("city") or "").strip()
            act_location_id: uuid.UUID | None = None

            if (
                act_country
                and act_city
                and (act_country != day_country or act_city != day_city)
            ):
                act_location_id = uuid.uuid4()
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        INSERT INTO locations (id, trip_id, country, city, region, place_name, created_at)
                        VALUES (%s, %s, %s, %s, %s, %s, NOW())
                        RETURNING id
                        """,
                        (
                            act_location_id,
                            trip_id,
                            act_country,
                            act_city,
                            act_loc.get("region") or None,
                            act_loc.get("place_name") or None,
                        ),
                    )
                    row = cursor.fetchone()
                    if row:
                        act_location_id = row[0]

            # Free-text location: derived from the new structured dict.
            # Previously: act.get("location") returned a flat string ("Eiffel Tower, Paris").
            # Now: act["location"] is a dict — we use place_name (most specific) or city as fallback.
            # This is a deliberate behavioral change to maintain backward compatibility
            # with the free-text location field while adapting to the new prompt format.
            location_text = act_loc.get("place_name") or act_loc.get("city") or None

            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO activities (id, day_id, title, location, notes, status, location_id, created_at, updated_at)
                    VALUES (%s, %s, %s, %s, %s, 'planned', %s, NOW(), NOW())
                    """,
                    (
                        uuid.uuid4(),
                        day_id,
                        title,
                        location_text,
                        act.get("notes") or None,
                        act_location_id,
                    ),
                )
            activities_created += 1

    return days_created, activities_created
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd worker
pytest tests/test_itinerary_persist.py -v
```

Expected: PASS

- [ ] **Step 5: Run all worker tests**

```bash
cd worker
pytest tests/ -v
```

Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add worker/app/main.py worker/tests/test_itinerary_persist.py
git commit -m "feat: persist structured locations during itinerary generation"
```

---

## Chunk 4: Frontend

### Task 10: Update TypeScript Types

**Files:**
- Modify: `frontend/lib/api.ts`

- [ ] **Step 1: Add `Location` type to `frontend/lib/api.ts`**

Insert this type definition after the `Memory` type block (ends around line 40):

```typescript
export type Location = {
  id: string;
  country: string;
  city: string;
  region?: string | null;
  place_name?: string | null;
};
```

- [ ] **Step 2: Update the `Timeline` type**

Replace the **entire existing `Timeline` type block** (lines 42–64 of the current file) with:

```typescript
export type Timeline = {
  trip_id: string;
  days: Array<{
    id: string;
    day_number: number;
    date?: string | null;
    location?: Location | null;
    activities: Array<{
      id: string;
      title: string;
      location?: string | null;
      location_detail?: Location | null;
      scheduled_time?: string | null;
      status: string;
    }>;
    memories: Array<{
      id: string;
      memory_type: string;
      caption?: string | null;
      storage_key: string;
      public_url?: string | null;
      created_at: string;
    }>;
  }>;
};
```

- [ ] **Step 3: Update the standalone `Activity` type**

Add `location_detail` to the `Activity` type:

```typescript
export type Activity = {
  id: string;
  day_id: string;
  title: string;
  location?: string | null;
  location_detail?: Location | null;
  scheduled_time?: string | null;
  notes?: string | null;
  status: string;
};
```

- [ ] **Step 4: Check TypeScript compilation**

```bash
cd frontend
npx tsc --noEmit
```

Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/api.ts
git commit -m "feat: add Location type and update Timeline/Activity TypeScript types"
```

---

### Task 11: Update Timeline Page with Location Grouping

**Files:**
- Modify: `frontend/app/trips/[tripId]/timeline/page.tsx`

- [ ] **Step 1: Read the current timeline page in full**

Read `frontend/app/trips/[tripId]/timeline/page.tsx` completely before making any changes. You need to understand the exact structure of the existing JSX to know where to insert the grouping logic.

- [ ] **Step 2: Add the `groupDaysByLocation` helper**

After the imports block (before the component function), add:

```typescript
type LocationGroup = {
  key: string;        // "France|Paris" or "no-location"
  label: string | null; // "Paris, France" or null (for days without a location)
  days: Timeline["days"];
};

function groupDaysByLocation(days: Timeline["days"]): LocationGroup[] {
  const groups: LocationGroup[] = [];

  for (const day of days) {
    const locationKey = day.location
      ? `${day.location.country}|${day.location.city}`
      : null;
    const label = day.location
      ? `${day.location.city}, ${day.location.country}`
      : null;

    const last = groups[groups.length - 1];
    // Merge into last group only if both share the same non-null location key.
    // Days without a location (locationKey === null) never merge — each starts a new group.
    // This avoids React duplicate key warnings for non-contiguous unlocked-location day runs.
    if (last && locationKey !== null && last.key === locationKey) {
      last.days.push(day);
    } else {
      // For no-location groups, use an index-based key to guarantee uniqueness.
      const key = locationKey ?? `no-location-${groups.length}`;
      groups.push({ key, label, days: [day] });
    }
  }

  return groups;
}
```

- [ ] **Step 3: Compute location groups inside the component**

Inside the component, after `timeline` data is available, compute groups:

```typescript
const locationGroups = timeline ? groupDaysByLocation(timeline.days) : [];
```

- [ ] **Step 4: Replace the timeline days render with grouped render**

Find the `<div className="space-y-4">` that wraps `timeline.days.map(...)`. Change its child from `timeline.days.map(...)` to `locationGroups.map(...)`.

The new structure is:

```tsx
<div className="space-y-4">
  {locationGroups.map((group) => (
    <div key={group.key}>
      {group.label && (
        <div className="px-4 py-2 text-sm font-semibold text-muted-foreground border-b bg-muted/30 sticky top-0 z-10">
          {group.label}
          <span className="ml-2 text-xs font-normal text-muted-foreground/70">
            {group.days.length === 1
              ? `Dia ${group.days[0].day_number}`
              : `Dias ${group.days[0].day_number}–${group.days[group.days.length - 1].day_number}`}
          </span>
        </div>
      )}
      {group.days.map((day) => (
        // ← paste the existing <article key={day.id} ...> block here unchanged ←
      ))}
    </div>
  ))}
</div>
```

**Concrete instruction:** In the current file, the `<article key={day.id} ...>` block spans from roughly line 183 to 321. Move the entire `<article>` block (including its closing `</article>`) inside `group.days.map((day) => (...))`. Change the outer `timeline.days.map(...)` call to `locationGroups.map((group) => (...))` and insert the group header `<div>` before `group.days.map(...)` as shown above. Do not change anything inside the `<article>` block itself.

- [ ] **Step 5: Add location_detail chip inside activity cards**

The current JSX does **not** render `activity.location` (free text) anywhere — the activity `<li>` only shows `activity.title` and `activity.status`. Add the chip directly after the `<span>` that renders `activity.title`:

```tsx
{activity.location_detail && (
  <span className="text-xs text-muted-foreground ml-1">
    · {activity.location_detail.place_name ?? activity.location_detail.city}
  </span>
)}
```

Find the `<span>` containing `activity.title` inside the activity `<li>` (around line 210 of the current file) and insert this snippet immediately after it.

- [ ] **Step 6: Check TypeScript compilation**

```bash
cd frontend
npx tsc --noEmit
```

Expected: No errors

- [ ] **Step 7: Start dev server and manually verify the UI**

```bash
cd frontend
npm run dev
```

Navigate to a trip's timeline page. Verify:
1. Trips with generated itineraries (with locations) show grouped section headers (e.g., `Paris, França — Dias 1–3`)
2. Trips without itinerary (no locations) render days flat without headers
3. Activities with `location_detail` show a small chip (e.g., `· Versailles`)

- [ ] **Step 8: Commit**

```bash
git add frontend/app/trips/[tripId]/timeline/page.tsx
git commit -m "feat: group timeline days by country/city with location headers"
```
