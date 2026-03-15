# Activity Location Linking — Design Spec

**Date:** 2026-03-15
**Status:** Approved

## Overview

Link itinerary activities and days to structured location data (country, city, region) so the frontend timeline can group days by destination and show what the user is doing in each country/city/region.

## Goals

- Activities and days are linked to a normalized `locations` table (per trip)
- AI (OpenAI) populates locations during itinerary generation
- Users can manually edit/correct locations via the frontend
- Frontend timeline groups days by `day.location` (country + city)
- Activities with a different location than their day show a location chip/override

## Non-Goals

- Global/shared location deduplication across trips (each trip has its own location records)
- Map/pins view (future)
- Manual location editing UI (deferred to a future phase — backend endpoints will be ready)

---

## Schema Changes

### New table: `locations`

```sql
CREATE TABLE locations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id     UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  country     TEXT NOT NULL,
  city        TEXT NOT NULL,
  region      TEXT,        -- neighborhood, area, region (nullable)
  place_name  TEXT,        -- free label, e.g. "Montmartre" (nullable)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

No unique constraint — a trip may create multiple location records for the same city without issue. Deduplication is not required.

### Altered tables

```sql
ALTER TABLE days       ADD COLUMN location_id UUID REFERENCES locations(id) ON DELETE SET NULL;
ALTER TABLE activities ADD COLUMN location_id UUID REFERENCES locations(id) ON DELETE SET NULL;
```

The existing `activities.location` text field is **kept** as a human-readable fallback and continues to be populated as before.

### Migration

File: `20260315_0005_add_locations_table.py`
Revision ID: `"20260315_0005"`

> **Note:** Verify this revision ID does not conflict with the latest head in Alembic's version chain before implementing (`alembic heads`).

---

## New SQLAlchemy Model: `Location`

New file: `backend/app/models/location.py`

```python
class Location(Base):
    __tablename__ = "locations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    trip_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("trips.id", ondelete="CASCADE"), nullable=False)
    country: Mapped[str] = mapped_column(Text, nullable=False)
    city: Mapped[str] = mapped_column(Text, nullable=False)
    region: Mapped[str | None] = mapped_column(Text, nullable=True)
    place_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
```

### Updated ORM models

**`backend/app/models/day.py`** — add:
```python
location_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("locations.id", ondelete="SET NULL"), nullable=True)
location: Mapped["Location | None"] = relationship("Location", foreign_keys=[location_id])
```

**`backend/app/models/activity.py`** — add:
```python
location_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("locations.id", ondelete="SET NULL"), nullable=True)
location_detail: Mapped["Location | None"] = relationship("Location", foreign_keys=[location_id])
```

Export `Location` from `backend/app/models/__init__.py`.

---

## Worker Changes (`worker/app/main.py`)

### Updated prompt instructions in `_build_itinerary_prompt_worker()`

The JSON schema section of the prompt must be updated to require structured location objects at both day and activity level. Replace the current flat `"location": "local ou null"` with:

```
Each day must include a "location" object with the fields:
  "country" (string, required), "city" (string, required),
  "region" (string or null), "place_name" (string or null).
Each activity must also include a "location" object with the same fields.
If you do not know the precise region or place_name, set them to null.
Always populate country and city — never return null for these fields.
```

### Updated OpenAI response schema

```json
{
  "days": [
    {
      "day_number": 1,
      "date": "2026-06-01",
      "notes": "...",
      "location": {
        "country": "France",
        "city": "Paris",
        "region": null,
        "place_name": null
      },
      "activities": [
        {
          "title": "Visit Eiffel Tower",
          "location": {
            "country": "France",
            "city": "Paris",
            "region": "7th arrondissement",
            "place_name": "Eiffel Tower"
          },
          "notes": "..."
        }
      ]
    }
  ]
}
```

### Persistence logic in `_persist_itinerary_worker()`

The worker uses psycopg3 direct SQL (not SQLAlchemy).

**Day-level location:**

1. Parse `day["location"]` from the OpenAI response.
2. If the location object is missing or `country`/`city` are null/empty → skip INSERT, leave `days.location_id = NULL`. Do not raise an error; log a warning.
3. Otherwise → INSERT into `locations` (trip_id, country, city, region, place_name) → capture the new `id` → UPDATE `days SET location_id = <id>` for that day.

**Activity-level location:**

1. Parse `activity["location"]` from the OpenAI response.
2. If missing or `country`/`city` are null/empty → leave `activities.location_id = NULL`. The activity inherits the day's location on the frontend.
3. If present and **same country+city as the day** → also leave `activities.location_id = NULL` (no need for a separate record; frontend inherits from day).
4. If present and **different country or city from the day** → INSERT into `locations` → UPDATE `activities SET location_id = <id>`.

Continue populating `activities.location` (free text) as before (e.g., `"Eiffel Tower, Paris"`).

---

## Backend Changes

### New Pydantic schema: `LocationResponse`

Add to `backend/app/schemas/` (new file or in an appropriate existing schema file):

```python
class LocationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID   # consistent with ActivityRead, DayRead conventions
    country: str
    city: str
    region: str | None
    place_name: str | None
```

### Updated schemas

**`TimelineDay`** (in `backend/app/schemas/timeline.py`) gains:
```python
location: LocationResponse | None = None
```

**`TimelineActivity`** (in `backend/app/schemas/timeline.py`) gains:
```python
location_detail: LocationResponse | None = None
```

**`ActivityRead`** (in `backend/app/schemas/activity.py`) gains:
```python
location_detail: LocationResponse | None = None
```

Export `LocationResponse` from `backend/app/schemas/__init__.py`.

### Timeline route / query layer

The timeline route is `GET /trips/{trip_id}/timeline` in `backend/app/api/routes/trips.py`. It currently calls `day_repository.list()` and `activity_repository.list()` separately, then **manually constructs** `TimelineDay(...)` and `TimelineActivity(...)` objects in a Python loop.

The update must follow the same manual-construction pattern:

1. After fetching each `Day` ORM object, ensure the `location` relationship is loaded (add `selectinload(Day.location)` to the day query, or access it explicitly and handle lazy-load). Then pass `location=day.location` when constructing `TimelineDay(...)`.
2. After fetching each `Activity` ORM object, similarly load `location_detail` and pass `location_detail=activity.location_detail` when constructing `TimelineActivity(...)`.

**Do not** refactor the route to a single ORM query with `selectinload` — follow the existing manual construction pattern to minimize scope.

Since `TimelineDay` and `TimelineActivity` are constructed manually (not via `model_validate(orm_obj)`), adding `ConfigDict(from_attributes=True)` to those schemas is not required. The `LocationResponse` instances will be passed as already-constructed objects.

### New endpoints (manual location editing)

Both endpoints live in `backend/app/api/routes/trips.py` — the existing file that already handles `/trips/{trip_id}/...` routes (e.g., the timeline endpoint). This avoids restructuring the days/activities routers which currently don't carry `trip_id` as a path parameter.

```
PATCH /trips/{trip_id}/days/{day_id}/location
PATCH /trips/{trip_id}/activities/{activity_id}/location

Request body:
{
  "country": str,      # required
  "city": str,         # required
  "region": str | None,
  "place_name": str | None
}

Response: 200 OK — returns LocationResponse with the newly created location record
```

**Upsert semantics:** Always INSERT a new `locations` row and update the FK on the day/activity. The old `location_id` on the row (if any) is abandoned — not deleted, to avoid disrupting other potential references. This is intentional given there is no unique constraint and location records are cheap to create.

---

## Frontend Changes

### Updated TypeScript types (`frontend/lib/api.ts`)

```typescript
export type Location = {
  id: string;
  country: string;
  city: string;
  region?: string | null;
  place_name?: string | null;
};

// Timeline type — day gains:
location?: Location | null;

// Timeline type — activity gains:
location_detail?: Location | null;

// Activity type gains:
location_detail?: Location | null;
```

### Timeline grouping logic

Days are grouped by consecutive runs sharing the same `(country, city)` from `day.location`. Each group renders a header. Days with `location = null` render without a location group header (graceful fallback for trips without a generated itinerary or when AI returned no location data).

```
🇫🇷 Paris, França — Dias 1–3
  Dia 1 · 01/jun
    · Visit Eiffel Tower
    · Seine River Cruise
  Dia 2 · 02/jun
    · Louvre Museum
    · [🏰 Versailles]  ← activity.location_detail chip (different city)

🇮🇹 Roma, Itália — Dias 4–6
  ...

(Days with no location — no header, rendered flat)
```

Activities with `location_detail` set display a discrete location chip.

---

## Data Flow Summary

```
OpenAI response (JSON with structured location objects at day + activity level)
  → _persist_itinerary_worker() [worker, psycopg3 direct SQL]
      → INSERT locations (day level, if country+city present)  → days.location_id
      → INSERT locations (activity level, only if differs from day) → activities.location_id
      → activities.location (free text) populated as before
  → Timeline API request [FastAPI route — trips.py]
      → day_repository.list() with selectinload(Day.location)
      → activity_repository.list() with selectinload(Activity.location_detail)
      → Manual construction loop: TimelineDay(location=day.location, ...), TimelineActivity(location_detail=activity.location_detail, ...)
      → Returned as TripTimelineRead
  → Frontend timeline page
      → Groups days by consecutive (country, city) from day.location
      → Renders group headers; activity chips when location_detail differs
```

---

## Migration Checklist (ordered)

- [ ] Verify next available Alembic revision number (`alembic heads`)
- [ ] Create `20260315_0005_add_locations_table.py` — creates `locations` table, adds `location_id` FK to `days` and `activities`
- [ ] Create `backend/app/models/location.py` — `Location` SQLAlchemy model
- [ ] Update `backend/app/models/day.py` — add `location_id` column + `location` relationship
- [ ] Update `backend/app/models/activity.py` — add `location_id` column + `location_detail` relationship
- [ ] Export `Location` from `backend/app/models/__init__.py`
- [ ] Add `LocationResponse` Pydantic schema; export from `backend/app/schemas/__init__.py`
- [ ] Update `TimelineDay` and `TimelineActivity` schemas to include location fields
- [ ] Update `ActivityRead` schema to include `location_detail`
- [ ] Update timeline repository/route: add eager-load for `Day.location` and `Activity.location_detail`
- [ ] Update worker prompt (`_build_itinerary_prompt_worker`) to require structured location objects
- [ ] Update `_persist_itinerary_worker()` to insert locations and update FKs (with null-safety guards)
- [ ] Add `PATCH /trips/{trip_id}/days/{day_id}/location` endpoint in `trips.py`
- [ ] Add `PATCH /trips/{trip_id}/activities/{activity_id}/location` endpoint in `trips.py`
- [ ] Verify the `trips` router is already registered in the app (no new registration needed if adding to existing `trips.py`)
- [ ] Update `frontend/lib/api.ts` — add `Location` type, update `Day`, `Activity`, `Timeline` types
- [ ] Update timeline page component — implement day grouping by location
