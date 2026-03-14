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
| UI interaction | Tag input with inline autocomplete dropdown (Option A) |

## Backend Changes

### 1. Alembic Migration

- Drop column `destination VARCHAR(120)` from `trips` table
- Add column `destinations VARCHAR(120)[]` NOT NULL DEFAULT `'{}'`

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

`TripCreate` adds a validator: `destinations` must have at least 1 item.

### 4. API Routes

No route changes. The payload shape changes transparently — `POST /trips/` and `PUT /trips/{id}` now accept/return `destinations: list[str]`.

## Frontend Changes

### 1. `DestinationInput` component (`components/destination-input.tsx`)

- Renders current destinations as removable pill tags (`×`)
- Input field with search icon
- On ≥2 chars typed: debounced fetch to `https://photon.komoot.io/api/?q=<query>&limit=5&lang=pt`
- Response mapped to display string: `"{city}, {country}"` (fallback to `"{name}"` if no city)
- Dropdown shows up to 5 suggestions
- Clicking a suggestion adds it as a tag (deduplication: skip if already in list)
- Pressing `Escape` or clicking outside closes dropdown
- Tag `×` button removes that destination

### 2. `trips/new/page.tsx`

- State: `destination: string` → `destinations: string[]`
- Replace `<input>` destination field with `<DestinationInput>`
- Validation: proceed to step 2 only if `destinations.length >= 1`
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

`createTrip` and `updateTrip` payloads updated accordingly.

### 4. Display updates

Anywhere `trip.destination` is rendered, replace with `trip.destinations.join(" · ")`:

- `components/trip-card.tsx`
- `app/trips/[tripId]/page.tsx` (trip header)
- Any other page that reads `trip.destination`

## Data Flow

```
User types "porto"
  → debounce 300ms
  → GET https://photon.komoot.io/api/?q=porto&limit=5&lang=pt
  → map features to "{city}, {country}" strings
  → show dropdown

User clicks "Porto, Portugal"
  → add to destinations[]
  → clear input + close dropdown

User submits form
  → POST /trips/ { destinations: ["Porto, Portugal", "Madrid, Espanha"], ... }
  → backend stores as PostgreSQL ARRAY
```

## Error Handling

- Photon API failure: silently hide dropdown (no error shown — user can still type manually and add free-text on Enter)
- Empty destinations: block form advance with inline message "Adicione pelo menos um destino"
- Network timeout: abort fetch after 3s, treat as no results

## Out of Scope

- Storing coordinates (lat/lng) — names only for now
- Reordering destinations (order is insertion order)
- Filtering trips by destination country/city
- Edit destinations on existing trips (can be added later via trip edit page)
