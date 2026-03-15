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

No unique constraint — a trip may reference the same city in multiple location records without issue.

### Altered tables

```sql
ALTER TABLE days       ADD COLUMN location_id UUID REFERENCES locations(id) ON DELETE SET NULL;
ALTER TABLE activities ADD COLUMN location_id UUID REFERENCES locations(id) ON DELETE SET NULL;
```

The existing `activities.location` text field is **kept** as a human-readable fallback.

### Migration naming

File: `20260315_0005_add_locations_table.py`
Revision ID: `"20260315_0005"`

---

## Worker Changes (`worker/app/main.py`)

### Updated OpenAI response schema

The prompt instructs the model to return structured location data at both day and activity levels:

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

1. For each day: INSERT into `locations` with day-level location → set `days.location_id`
2. For each activity:
   - If activity location **differs** from day location (country or city differ) → INSERT separate record into `locations` → set `activities.location_id`
   - If activity location is the **same** as the day → leave `activities.location_id = NULL` (inherits from day)
3. Continue populating `activities.location` (free text) as before

---

## Backend Changes

### New Pydantic schema: `LocationResponse`

```python
class LocationResponse(BaseModel):
    id: str
    country: str
    city: str
    region: str | None
    place_name: str | None
```

### Updated schemas

**`DayWithActivities`** gains:
```python
location: LocationResponse | None
```

**`ActivityResponse`** gains:
```python
location_detail: LocationResponse | None  # populated only when differs from day
```

### New endpoints (manual location editing)

```
PATCH /trips/{trip_id}/days/{day_id}/location
PATCH /trips/{trip_id}/activities/{activity_id}/location

Body: { "country": str, "city": str, "region": str | None, "place_name": str | None }
```

These endpoints upsert a record in `locations` and update the FK on the corresponding row. No authentication changes required.

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

// Day gains:
location?: Location | null;

// Activity gains:
location_detail?: Location | null;
```

### Timeline grouping logic

Days are grouped by consecutive runs sharing the same `(country, city)` from `day.location`. Each group renders a header:

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
```

Activities with `location_detail` set display a discrete location chip to indicate they occur in a different place than the day's primary location.

Days with `location = null` render without a location header (graceful fallback for trips without generated itineraries).

---

## Data Flow Summary

```
OpenAI response (JSON with location objects)
  → _persist_itinerary_worker()
      → INSERT locations (day level)     → days.location_id
      → INSERT locations (activity level, only if differs) → activities.location_id
  → API response (DayWithActivities includes location, activities include location_detail)
  → Frontend timeline groups days by day.location
```

---

## Migration Checklist

- [ ] `20260315_0005_add_locations_table.py` — creates `locations`, adds FKs to `days` and `activities`
- [ ] Update worker prompt + response schema
- [ ] Update `_persist_itinerary_worker()` to handle location insertion
- [ ] Add `LocationResponse` Pydantic schema
- [ ] Update `DayWithActivities` and `ActivityResponse` schemas
- [ ] Update timeline query/repository to JOIN locations
- [ ] Update `Timeline` and `Activity` TypeScript types
- [ ] Update timeline page component for location grouping
- [ ] Add PATCH endpoints for manual location editing
