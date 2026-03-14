# Multi-Destination with Autocomplete

**Date:** 2026-03-14
**Status:** Approved

## Summary

Replace the single free-text `destination` field with a structured multi-destination input. Users can add multiple locations (e.g. "Aveiro, Portugal" and "Madrid, Espanha") via an autocomplete tag-input powered by the Photon geocoding API. The backend migrates from a single string column to a PostgreSQL `ARRAY(String)`.

## Decisions

| Question | Decision |
|---|---|
| Scope | Full stack — backend migration + frontend component |
| Geocoding API | Photon (photon.komoot.io) — free, no API key, OSM-based |
| Storage | Names only (no coordinates) |
| DB column type | PostgreSQL `ARRAY(String)` |
| UI interaction | Tag input with inline autocomplete dropdown |

## Backend Changes

### 1. Alembic Migration

The migration must:

1. Add column `destinations VARCHAR(120)[]` nullable temporarily
2. **Data migration**: copy existing `destination` values into `destinations` as single-item arrays (`UPDATE trips SET destinations = ARRAY[destination]`)
3. Set `destinations` to `NOT NULL DEFAULT '{}'`
4. Drop column `destination`

The `downgrade()` body must reverse this: add `destination VARCHAR(120)`, copy `destinations[1]` back, drop `destinations`.

### 2. Model (`backend/app/models/trip.py`)

```python
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy import String

destinations: Mapped[list[str]] = mapped_column(
    ARRAY(String(120)), nullable=False, server_default="{}"
)
```

Remove the existing `destination` field.

### 3. Schemas (`backend/app/schemas/trip.py`)

All schemas (`TripBase`, `TripCreate`, `TripUpdate`, `TripRead`) change:

```python
# Before
destination: str

# After
destinations: list[str]
```

`TripCreate` adds a validator:
- `destinations` must have at least 1 item
- Each item must be ≤ 120 characters

`TripUpdate.destinations` is `list[str] | None`. Sending `destinations: []` is rejected (if provided, must have ≥ 1 item).

### 4. Repository (`backend/app/repositories/trip_repository.py`)

The `destination` filter in `list()` must be updated. Replace:

```python
# Before
if destination:
    query = query.filter(Trip.destination.ilike(f"%{destination}%"))
```

With a case-insensitive search against the array using `func.array_to_string` to preserve ilike behavior:

```python
# After
from sqlalchemy import func
if destination:
    query = query.filter(
        func.array_to_string(Trip.destinations, " ").ilike(f"%{destination}%")
    )
```

This converts the array to a searchable string for the filter, consistent with the existing ilike behavior.

### 5. API Routes (`backend/app/api/routes/trips.py`)

The `destination: str | None` query parameter in `GET /trips/` stays but now filters against the array column via the updated repository. No route signature change needed.

### 6. RAG Service (`backend/app/services/rag_service.py`)

Two occurrences of `trip.destination` must be updated:

- `_build_itinerary_prompt` (line ~360): `f"Destino: {trip.destination}"` → `f"Destinos: {', '.join(trip.destinations)}"`
- `_build_itinerary_markdown` (line ~466): same change

## Frontend Changes

### 1. `DestinationInput` component (`components/destination-input.tsx`)

- Renders current destinations as removable pill tags with `×`
- Input field with search icon (always visible)
- On ≥ 2 chars typed: debounced fetch (300ms) to `https://photon.komoot.io/api/?q=<query>&limit=5&lang=pt`
- Response mapped to display string using fallback chain:
  - `(feature.properties.city ?? feature.properties.state ?? feature.properties.name), (feature.properties.country ?? "")`.strip(", ")
- Dropdown shows up to 5 suggestions
- **Selecting a suggestion** adds it as a tag (deduplicated, skip if already in list), clears input, closes dropdown
- **Pressing Enter** while input is focused adds the current typed value as a tag (same deduplication + non-empty check), regardless of dropdown state
- **Pressing Escape** or clicking outside closes dropdown without adding
- Tag `×` removes that destination

### 2. `trips/new/page.tsx`

- State: `destination: string` → `destinations: string[]`
- Replace `<input>` destination field with `<DestinationInput>`
- Validation: proceed to step 2 only if `destinations.length >= 1`. Show inline error "Adicione pelo menos um destino."
- Pass `destinations` to `createTrip()`

### 3. `lib/api.ts`

```typescript
// Before
export type Trip = {
  destination: string
  ...
}

// After
export type Trip = {
  destinations: string[]
  ...
}
```

`createTrip` payload updated. Note: `updateTrip` does not yet exist in the frontend — no change needed here.

### 4. Display updates — all impacted locations

Anywhere `trip.destination` is rendered, replace with `trip.destinations.join(" · ")` and update labels from "Destino" (singular) to "Destinos" where appropriate:

| File | Location | Change |
|---|---|---|
| `components/trip-card.tsx` | destination subtitle | `trip.destinations.join(" · ")` |
| `components/trip-sidebar.tsx` | `trip.destination` conditional | `trip.destinations.join(" · ")` (array is always truthy — remove the conditional guard or check `.length > 0`) |
| `app/trips/[tripId]/page.tsx` | pill badge (line ~277) | `trip.destinations.join(" · ")` |
| `app/trips/[tripId]/page.tsx` | stats card (line ~315) | `trip.destinations.join(" · ") \|\| "—"`, label "Destino" → "Destinos" |

## Data Flow

```
User types "porto"
  → debounce 300ms
  → GET https://photon.komoot.io/api/?q=porto&limit=5&lang=pt
  → map features to "City, Country" strings
  → show dropdown

User clicks "Porto, Portugal"
  → add to destinations[]
  → clear input + close dropdown

User submits form
  → POST /trips/ { destinations: ["Porto, Portugal", "Madrid, Espanha"], ... }
  → backend stores as PostgreSQL ARRAY
  → display as "Porto, Portugal · Madrid, Espanha"
```

## Error Handling

- **Photon API failure / timeout (3s):** silently hide dropdown — user can type freely and press Enter to add manually
- **Empty destinations:** block form advance with inline message "Adicione pelo menos um destino."
- **Destination > 120 chars:** show inline warning below the input ("Nome do destino muito longo") and block the add action — do not truncate silently
- **Duplicate destination:** silently skip (no visual feedback needed)

## Tests to Update

- `frontend/tests/api.test.ts`: update `createTrip` mock payload from `destination: string` to `destinations: string[]`
- `backend/tests/unit/test_trip_service.py`: update all `TripCreate` instantiations from `destination=` to `destinations=[...]`
- `backend/tests/integration/test_trips_api_integration.py`: update all three test bodies — payloads and assertions (`created["destination"]` → `created["destinations"]`)

## Out of Scope

- Storing coordinates (lat/lng) — names only for now
- Reordering destinations (order is insertion order)
- Trip edit page (destinations can be updated later when edit is built)
