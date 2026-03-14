# Multi-Destination with Autocomplete Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single `destination: string` field with `destinations: string[]` across backend and frontend, with a tag-input autocomplete component powered by the Photon geocoding API.

**Architecture:** The backend migrates `destination VARCHAR(120)` to `destinations VARCHAR(120)[]` via Alembic with data preservation, updates all schemas/model/repository/rag_service. The frontend adds a `DestinationInput` component (Photon autocomplete + tag pills) used in the new-trip form, and updates all display locations.

**Tech Stack:** FastAPI, SQLAlchemy 2, PostgreSQL ARRAY, Alembic, Next.js 14, TypeScript, Tailwind CSS, Photon API (free, no key)

**Spec:** `docs/superpowers/specs/2026-03-14-multi-destination-design.md`

---

## Chunk 1: Backend

### Task 1: Alembic Migration

**Files:**
- Create: `backend/alembic/versions/20260314_0002_destinations_array.py`

- [ ] **Step 1: Create the migration file**

```python
# backend/alembic/versions/20260314_0002_destinations_array.py
"""migrate destination to destinations array

Revision ID: 20260314_0002
Revises: 20260312_0001
Create Date: 2026-03-14
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "20260314_0002"
down_revision = "20260312_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Step 1: add nullable column
    op.add_column(
        "trips",
        sa.Column(
            "destinations",
            postgresql.ARRAY(sa.String(120)),
            nullable=True,
        ),
    )
    # Step 2: copy existing data (each row gets a single-item array)
    op.execute("UPDATE trips SET destinations = ARRAY[destination]")
    # Step 3: set NOT NULL and default
    op.alter_column("trips", "destinations", nullable=False,
                    server_default=sa.text("'{}'")
    # Step 4: drop old column
    op.drop_column("trips", "destination")


def downgrade() -> None:
    # Step 1: add back old column (nullable to allow filling)
    op.add_column(
        "trips",
        sa.Column("destination", sa.String(120), nullable=True),
    )
    # Step 2: copy first element back
    op.execute("UPDATE trips SET destination = destinations[1]")
    # Step 3: set NOT NULL
    op.alter_column("trips", "destination", nullable=False)
    # Step 4: drop array column
    op.drop_column("trips", "destinations")
```

- [ ] **Step 2: Run migration**

```bash
cd backend
alembic upgrade head
```

Expected: `Running upgrade 20260312_0001 -> 20260314_0002, migrate destination to destinations array`

- [ ] **Step 3: Verify column in psql**

```bash
docker compose exec postgres psql -U postgres -d tripbrain -c "\d trips"
```

Expected: `destinations | character varying(120)[]`  and no `destination` column.

- [ ] **Step 4: Commit**

```bash
git add backend/alembic/versions/20260314_0002_destinations_array.py
git commit -m "feat(db): migrate destination string to destinations array"
```

---

### Task 2: Update SQLAlchemy Model

**Files:**
- Modify: `backend/app/models/trip.py`

- [ ] **Step 1: Update the model**

Replace `destination` with `destinations`:

```python
# backend/app/models/trip.py
import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, String, Text, func
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Trip(Base):
    __tablename__ = "trips"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    destinations: Mapped[list[str]] = mapped_column(
        ARRAY(String(120)), nullable=False, server_default="{}"
    )
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="planning")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    days = relationship("Day", back_populates="trip", cascade="all, delete-orphan")
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/models/trip.py
git commit -m "feat(model): replace destination with destinations array"
```

---

### Task 3: Update Pydantic Schemas

**Files:**
- Modify: `backend/app/schemas/trip.py`

- [ ] **Step 1: Update all schemas**

```python
# backend/app/schemas/trip.py
import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, field_validator


class TripBase(BaseModel):
    name: str
    destinations: list[str]
    start_date: date
    end_date: date
    summary: str | None = None
    status: str = "planning"


class TripCreate(TripBase):
    @field_validator("destinations")
    @classmethod
    def destinations_not_empty(cls, v: list[str]) -> list[str]:
        if not v:
            raise ValueError("destinations must have at least one item")
        for item in v:
            if len(item) > 120:
                raise ValueError(f"destination item '{item[:30]}...' exceeds 120 characters")
        return v


class TripUpdate(BaseModel):
    name: str | None = None
    destinations: list[str] | None = None
    start_date: date | None = None
    end_date: date | None = None
    summary: str | None = None
    status: str | None = None

    @field_validator("destinations")
    @classmethod
    def destinations_not_empty_if_provided(cls, v: list[str] | None) -> list[str] | None:
        if v is not None and len(v) == 0:
            raise ValueError("destinations must have at least one item if provided")
        return v


class TripRead(TripBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    created_at: datetime
    updated_at: datetime
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/schemas/trip.py
git commit -m "feat(schema): replace destination with destinations list with validators"
```

---

### Task 4: Update Repository Filter

**Files:**
- Modify: `backend/app/repositories/trip_repository.py`

- [ ] **Step 1: Update the destination filter**

Replace the `ilike` filter on the old column with `array_to_string`:

```python
# backend/app/repositories/trip_repository.py
import uuid

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.trip import Trip
from app.schemas.trip import TripCreate, TripUpdate


class TripRepository:
    def __init__(self, db: Session):
        self.db = db

    def list(
        self,
        limit: int = 50,
        offset: int = 0,
        destination: str | None = None,
        status: str | None = None,
    ) -> list[Trip]:
        query = self.db.query(Trip)
        if destination:
            query = query.filter(
                func.array_to_string(Trip.destinations, " ").ilike(f"%{destination}%")
            )
        if status:
            query = query.filter(Trip.status == status)
        return query.order_by(Trip.start_date.desc()).offset(offset).limit(limit).all()

    def get(self, trip_id: uuid.UUID) -> Trip | None:
        return self.db.query(Trip).filter(Trip.id == trip_id).first()

    def create(self, payload: TripCreate) -> Trip:
        trip = Trip(**payload.model_dump())
        self.db.add(trip)
        self.db.commit()
        self.db.refresh(trip)
        return trip

    def update(self, trip: Trip, payload: TripUpdate) -> Trip:
        for field, value in payload.model_dump(exclude_unset=True).items():
            setattr(trip, field, value)
        self.db.add(trip)
        self.db.commit()
        self.db.refresh(trip)
        return trip

    def delete(self, trip: Trip) -> None:
        self.db.delete(trip)
        self.db.commit()
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/repositories/trip_repository.py
git commit -m "feat(repository): update destination filter to use array_to_string"
```

---

### Task 5: Update RAG Service

**Files:**
- Modify: `backend/app/services/rag_service.py`

- [ ] **Step 1: Find and replace both occurrences**

In `_build_itinerary_prompt` (search for `f"Destino: {trip.destination}"`):
```python
# Before
f"Destino: {trip.destination}",
# After
f"Destinos: {', '.join(trip.destinations)}",
```

In `_build_itinerary_markdown` (search for `f"Destino: {trip.destination}"`):
```python
# Before
f"Destino: {trip.destination}",
# After
f"Destinos: {', '.join(trip.destinations)}",
```

- [ ] **Step 2: Verify no other references remain**

```bash
grep -rn "trip\.destination" backend/
```

Expected: no output (zero matches).

- [ ] **Step 3: Commit**

```bash
git add backend/app/services/rag_service.py
git commit -m "feat(rag): update destination references to destinations array"
```

---

### Task 6: Update Backend Tests

**Files:**
- Modify: `backend/tests/unit/test_trip_service.py`
- Modify: `backend/tests/integration/test_trips_api_integration.py`

- [ ] **Step 1: Update unit tests**

Replace all `destination="..."` with `destinations=["..."]` in `TripCreate` instantiations:

```python
# backend/tests/unit/test_trip_service.py
import uuid
from datetime import date
from types import SimpleNamespace

import pytest
from app.schemas.trip import TripCreate, TripUpdate
from app.services.trip_service import TripService
from fastapi import HTTPException


class FakeTripRepository:
    def __init__(self) -> None:
        self.created_payload = None
        self.updated_payload = None

    def create(self, payload: TripCreate):
        self.created_payload = payload
        return payload

    def update(self, trip, payload: TripUpdate):
        self.updated_payload = payload
        return trip


def test_create_rejects_invalid_date_range() -> None:
    service = TripService(repository=FakeTripRepository())
    payload = TripCreate(
        name="Kyoto",
        destinations=["Kyoto, Japan"],
        start_date=date(2026, 4, 10),
        end_date=date(2026, 4, 8),
    )

    with pytest.raises(HTTPException) as exc_info:
        service.create(payload)

    assert exc_info.value.status_code == 422
    assert "start_date" in str(exc_info.value.detail)


def test_create_accepts_valid_date_range() -> None:
    repository = FakeTripRepository()
    service = TripService(repository=repository)
    payload = TripCreate(
        name="Kyoto",
        destinations=["Kyoto, Japan"],
        start_date=date(2026, 4, 8),
        end_date=date(2026, 4, 10),
    )

    result = service.create(payload)

    assert result == payload
    assert repository.created_payload == payload


def test_create_rejects_empty_destinations() -> None:
    with pytest.raises(Exception):
        TripCreate(
            name="No destination",
            destinations=[],
            start_date=date(2026, 4, 8),
            end_date=date(2026, 4, 10),
        )


def test_update_rejects_invalid_effective_date_range() -> None:
    repository = FakeTripRepository()
    service = TripService(repository=repository)
    trip = SimpleNamespace(
        id=uuid.uuid4(),
        start_date=date(2026, 4, 8),
        end_date=date(2026, 4, 10),
    )

    with pytest.raises(HTTPException) as exc_info:
        service.update(trip, TripUpdate(end_date=date(2026, 4, 1)))

    assert exc_info.value.status_code == 422
    assert repository.updated_payload is None
```

- [ ] **Step 2: Run unit tests**

```bash
cd backend
pytest tests/unit/test_trip_service.py -v
```

Expected: all tests PASS.

- [ ] **Step 3: Update integration tests**

Replace all `"destination": "..."` with `"destinations": ["..."]` and `created["destination"]` with `created["destinations"]`:

```python
# backend/tests/integration/test_trips_api_integration.py
from datetime import date


def test_create_and_get_trip_integration(client) -> None:
    create_response = client.post(
        "/api/v1/trips/",
        json={
            "name": "Kyoto Trip",
            "destinations": ["Kyoto, Japan"],
            "start_date": "2026-05-10",
            "end_date": "2026-05-20",
            "summary": "Primeira viagem",
            "status": "planning",
        },
    )

    assert create_response.status_code == 201
    created = create_response.json()
    assert created["name"] == "Kyoto Trip"
    assert created["destinations"] == ["Kyoto, Japan"]

    trip_id = created["id"]

    get_response = client.get(f"/api/v1/trips/{trip_id}")
    assert get_response.status_code == 200
    fetched = get_response.json()
    assert fetched["id"] == trip_id
    assert fetched["summary"] == "Primeira viagem"


def test_create_trip_invalid_dates_returns_standardized_error(client) -> None:
    response = client.post(
        "/api/v1/trips/",
        json={
            "name": "Invalid Trip",
            "destinations": ["Tokyo, Japan"],
            "start_date": "2026-06-10",
            "end_date": "2026-06-01",
            "status": "planning",
        },
    )

    assert response.status_code == 422
    body = response.json()
    assert body["error"]["code"] == "validation_error"
    assert "start_date" in body["error"]["message"]


def test_trip_timeline_returns_empty_days_for_new_trip(client) -> None:
    create_response = client.post(
        "/api/v1/trips/",
        json={
            "name": "Timeline Trip",
            "destinations": ["Osaka, Japan"],
            "start_date": str(date(2026, 7, 1)),
            "end_date": str(date(2026, 7, 5)),
            "status": "planning",
        },
    )
    trip_id = create_response.json()["id"]

    timeline_response = client.get(f"/api/v1/trips/{trip_id}/timeline")

    assert timeline_response.status_code == 200
    payload = timeline_response.json()
    assert payload["trip_id"] == trip_id
    assert payload["days"] == []
```

- [ ] **Step 4: Run integration tests**

```bash
cd backend
pytest tests/integration/test_trips_api_integration.py -v
```

Expected: all 3 tests PASS.

- [ ] **Step 5: Run full backend test suite**

```bash
cd backend
pytest -v
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/tests/unit/test_trip_service.py backend/tests/integration/test_trips_api_integration.py
git commit -m "test(backend): update tests for destinations array schema"
```

---

## Chunk 2: Frontend

### Task 7: Update TypeScript Types and API Functions

**Files:**
- Modify: `frontend/lib/api.ts`

- [ ] **Step 1: Update the `Trip` type and `createTrip` payload**

Search for all `destination` occurrences: `grep -n "destination" frontend/lib/api.ts`

Two locations to update:

1. In the `Trip` type:
```typescript
// Before
destination: string;
// After
destinations: string[];
```

2. In the inline payload type inside `createTrip` (there is no named `CreateTripPayload` type — it is defined inline):
```typescript
// Before
destination: string;
// After
destinations: string[];
```

- [ ] **Step 2: Verify no remaining `destination` references in api.ts**

```bash
grep -n "destination" frontend/lib/api.ts
```

Expected: zero matches.

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/api.ts
git commit -m "feat(api): update Trip type and createTrip to use destinations array"
```

---

### Task 8: Create DestinationInput Component

**Files:**
- Create: `frontend/components/destination-input.tsx`

- [ ] **Step 1: Create the component**

```typescript
// frontend/components/destination-input.tsx
"use client";

import { MapPinIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface PhotonFeature {
  properties: {
    name?: string;
    city?: string;
    state?: string;
    country?: string;
  };
}

function formatSuggestion(feature: PhotonFeature): string {
  const p = feature.properties;
  const place = p.city ?? p.state ?? p.name ?? "";
  const country = p.country ?? "";
  if (place && country) return `${place}, ${country}`;
  return place || country || p.name || "";
}

interface DestinationInputProps {
  destinations: string[];
  onChange: (destinations: string[]) => void;
  error?: string;
}

export function DestinationInput({ destinations, onChange, error }: DestinationInputProps) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [inputError, setInputError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (query.length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        const res = await fetch(
          `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5&lang=pt`,
          { signal: controller.signal }
        );
        clearTimeout(timeout);
        const data = await res.json();
        const results: string[] = (data.features ?? [])
          .map(formatSuggestion)
          .filter((s: string) => s.length > 0);
        setSuggestions(results);
        setOpen(results.length > 0);
      } catch {
        setSuggestions([]);
        setOpen(false);
      }
    }, 300);
  }, [query]);

  function addDestination(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (trimmed.length > 120) {
      setInputError("Nome do destino muito longo (máx. 120 caracteres).");
      return;
    }
    if (destinations.includes(trimmed)) {
      setQuery("");
      setOpen(false);
      return;
    }
    onChange([...destinations, trimmed]);
    setQuery("");
    setSuggestions([]);
    setOpen(false);
    setInputError(null);
  }

  function removeDestination(index: number) {
    onChange(destinations.filter((_, i) => i !== index));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      addDestination(query);
    }
    if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Tags */}
      {destinations.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {destinations.map((dest, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1.5 bg-[#ff6b6b] text-white rounded-full px-3 py-1 text-sm font-medium"
            >
              {dest}
              <button
                type="button"
                onClick={() => removeDestination(i)}
                className="hover:opacity-70 transition-opacity"
                aria-label={`Remover ${dest}`}
              >
                <XIcon size={13} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="relative">
        <MapPinIcon
          size={15}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8b8b8b] pointer-events-none"
        />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Buscar cidade ou país..."
          className="w-full rounded-lg border border-[rgba(0,0,0,0.12)] bg-white pl-8 pr-3 py-2.5 text-sm text-[#242424] placeholder-[#8b8b8b] focus:border-[#ff6b6b] focus:outline-none focus:ring-1 focus:ring-[#ff6b6b] transition-colors"
        />
      </div>

      {/* Inline error */}
      {(error || inputError) && (
        <p className="text-xs text-red-500 mt-1">{inputError ?? error}</p>
      )}

      {/* Dropdown */}
      {open && suggestions.length > 0 && (
        <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white border border-[rgba(0,0,0,0.08)] rounded-xl shadow-lg overflow-hidden">
          {suggestions.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => addDestination(s)}
              className="w-full text-left px-4 py-2.5 text-sm text-[#242424] hover:bg-[#fff9f6] flex items-center gap-2 transition-colors"
            >
              <MapPinIcon size={13} className="text-[#ff6b6b] shrink-0" />
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend
npx tsc --noEmit
```

Expected: no errors related to `destination-input.tsx`.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/destination-input.tsx
git commit -m "feat(component): add DestinationInput with Photon autocomplete"
```

---

### Task 9: Update New Trip Form

**Files:**
- Modify: `frontend/app/trips/new/page.tsx`

- [ ] **Step 1: Replace destination state and input**

1. Change state: `const [destination, setDestination] = useState("")` → `const [destinations, setDestinations] = useState<string[]>([])`

2. Add import at top:
```typescript
import { DestinationInput } from "@/components/destination-input";
```

3. In `createTrip` call, change `destination` → `destinations`.

4. Replace the destination `<input>` field block:
```tsx
{/* Before */}
<div>
  <label className="block text-sm font-medium text-[#242424] mb-1.5">Destino</label>
  <input
    className={inputClass}
    placeholder="Ex: Portugal e Espanha"
    value={destination}
    onChange={(e) => setDestination(e.target.value)}
    required
  />
</div>

{/* After */}
<div>
  <label className="block text-sm font-medium text-[#242424] mb-1.5">Destinos</label>
  <DestinationInput
    destinations={destinations}
    onChange={setDestinations}
    error={destinations.length === 0 && error?.includes("destino") ? error : undefined}
  />
</div>
```

5. Update `handleNext` validation:
```typescript
// Add this check before setStep("ai")
if (destinations.length === 0) {
  setError("Adicione pelo menos um destino.");
  return;
}
```

6. Update the AI step description to use destinations:
```tsx
{/* Before */}
Nossa IA pode sugerir atividades diárias personalizadas para a sua viagem de {startDate} até {endDate}.
{/* After */}
Nossa IA pode sugerir atividades diárias personalizadas para <strong>{destinations.join(" · ")}</strong> de {startDate} até {endDate}.
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/trips/new/page.tsx
git commit -m "feat(trips/new): replace destination input with DestinationInput component"
```

---

### Task 10: Update All Display Locations

**Files:**
- Modify: `frontend/components/trip-card.tsx`
- Modify: `frontend/components/trip-sidebar.tsx`
- Modify: `frontend/app/trips/[tripId]/page.tsx`

- [ ] **Step 1: Update `trip-card.tsx`**

Find `{trip.destination}` and replace with `{trip.destinations.join(" · ")}`.

- [ ] **Step 2: Update `trip-sidebar.tsx`**

Find the trip info card block:
```tsx
{/* Before */}
{trip.destination && (
  <p className="text-xs text-[#8b8b8b] mt-1">{trip.destination}</p>
)}

{/* After */}
{trip.destinations.length > 0 && (
  <p className="text-xs text-[#8b8b8b] mt-1">{trip.destinations.join(" · ")}</p>
)}
```

- [ ] **Step 3: Update `app/trips/[tripId]/page.tsx` — hero badge**

Search for `trip.destination` in the hero section (the `<span>` with `bg-[#ff6b6b]` and `PinIcon`). Make two changes in that block:
1. Change the condition `trip.destination &&` → `trip.destinations.length > 0 &&`
2. Change the text content `{trip.destination}` → `{trip.destinations.join(" · ")}`

Do not change any `className` attributes.

- [ ] **Step 4: Update `app/trips/[tripId]/page.tsx` — stats card**

Find the stats card that shows destination:
```tsx
{/* Before */}
<p className="text-xl sm:text-2xl font-bold text-[#242424] truncate">
  {trip.destination || "—"}
</p>
<p className="text-sm text-[#8b8b8b]">Destino</p>

{/* After */}
<p className="text-xl sm:text-2xl font-bold text-[#242424] truncate">
  {trip.destinations.length > 0 ? trip.destinations.join(" · ") : "—"}
</p>
<p className="text-sm text-[#8b8b8b]">Destinos</p>
```

- [ ] **Step 5: Verify no remaining `trip.destination` references**

```bash
grep -rn "trip\.destination" frontend/
```

Expected: zero matches.

- [ ] **Step 6: Verify TypeScript compiles clean**

```bash
cd frontend
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/components/trip-card.tsx frontend/components/trip-sidebar.tsx frontend/app/trips/[tripId]/page.tsx
git commit -m "feat(display): update all destination display locations to use destinations array"
```

---

### Task 11: Update Frontend Tests

**Files:**
- Modify: `frontend/tests/api.test.ts` (verify only — no changes expected)

- [ ] **Step 1: Verify no destination references in frontend tests**

```bash
grep -n "destination" frontend/tests/api.test.ts
```

Expected: **zero matches**. The current test file only exercises `createUploadPresign` and auth headers — there is no trip creation test. No changes are needed in this file.

- [ ] **Step 2: Run frontend tests**

```bash
cd frontend
npm test
```

Expected: all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/tests/api.test.ts
git commit -m "test(frontend): update api tests for destinations array"
```

---

### Task 12: Smoke Test End-to-End

- [ ] **Step 1: Start dev environment**

```bash
docker compose up -d
cd frontend && npm run dev
```

- [ ] **Step 2: Create a trip with multiple destinations**

1. Navigate to `/trips/new`
2. Type "aveiro" in the destinations field — verify dropdown appears with suggestions
3. Click "Aveiro, Portugal" — verify it appears as a pill tag
4. Type "madrid" — verify "Madrid, Espanha" appears in dropdown
5. Click it — verify two tags show
6. Complete the form and submit

- [ ] **Step 3: Verify display**

1. On the trips list page: verify the card shows "Aveiro, Portugal · Madrid, Espanha"
2. Click the trip: verify hero badge and stats card both show the destinations
3. Check the sidebar: verify destinations appear in the trip info card

- [ ] **Step 4: Final commit if any fixes needed**

```bash
git add -p
git commit -m "fix: address smoke test findings"
```
