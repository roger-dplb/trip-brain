# Trip Countdown Design Spec

**Date:** 2026-03-15
**Status:** Approved

## Overview

Add a time-status indicator to trip cards that shows how far away an upcoming trip is, whether it is currently in progress, or whether it has already ended. No backend changes required — this is a pure frontend feature.

## Requirements

- Future trips: show "X dias para a viagem" with days until `start_date`
- Ongoing trips (today between `start_date` and `end_date`): show "Em andamento"
- Past trips (today after `end_date`): show "Finalizada"
- If `start_date` is absent: show nothing (current behavior preserved)

## Architecture

### 1. Utility function — `frontend/lib/utils.ts`

Add `getTripTimeStatus(startDate: string | null | undefined, endDate: string | null | undefined)`.

**Return type:**
```ts
type TripTimeStatus =
  | { type: 'upcoming'; daysUntil: number }
  | { type: 'ongoing' }
  | { type: 'past' }
  | null;
```

**Logic:**
- Returns `null` if `startDate` is falsy
- Parses dates in UTC (same as existing `getDayLabel`) to avoid timezone-related off-by-one errors
- `daysUntil` is the ceiling of the difference in days between today (UTC midnight) and `start_date` — e.g. if there are 25h left, it shows "1 dia"
- State boundaries:
  - `startDate > today` → `upcoming`
  - `startDate <= today <= endDate` → `ongoing`
  - `today > endDate` (or no `endDate` and `startDate <= today`) → `past`

### 2. UI — `frontend/components/trip-card.tsx`

The bottom row of the card changes from `flex justify-end` to `flex justify-between items-center` so the status badge sits on the left and "▶ Stories" stays on the right.

**Badge variants:**

| State | Text | Icon | Background | Text color |
|---|---|---|---|---|
| `upcoming` | `"{N} dias para a viagem"` | Clock | `#fff0ed` | `#ff6b6b` |
| `ongoing` | `"Em andamento"` | Plane | `#f0fdf4` | `#16a34a` |
| `past` | `"Finalizada"` | Check | `#f5f5f5` | `#8b8b8b` |

- Badge uses `flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium` — pill style consistent with existing status badges
- When `start_date` is absent the badge renders nothing and the row reverts to `justify-end`

## Data flow

```
trip.start_date / trip.end_date
        ↓
getTripTimeStatus() in utils.ts  (pure function, no hooks)
        ↓
TripCard renders badge based on returned status type
```

## What is not changing

- No new files or components
- No backend routes or models
- No polling or real-time updates (static per render)
- The "generating itinerary" and "itinerary failed" banners are unaffected
