# Trip Cover Image — Design Spec
**Date:** 2026-03-15

## Overview

Allow users to set a cover image for each trip. The cover appears in the trip card on the trips list page and as the hero background on the trip overview tab. Users can either upload a new image or pick from existing trip memories.

---

## 1. Data Layer

### Migration
- File: `backend/alembic/versions/20260315_0001_add_cover_image_url_to_trips.py`
- Revision ID: `"20260315_0001"`
- Change: `ALTER TABLE trips ADD COLUMN cover_image_url TEXT NULL`

### Backend model (`backend/app/models/trip.py`)
```python
cover_image_url: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)
```

### Backend schemas (`backend/app/schemas/trip.py`)
- `TripResponse`: add `cover_image_url: str | None`
- `TripUpdate`: add `cover_image_url: str | None` (optional field, patchable)

### Frontend type (`frontend/lib/api.ts`)
```typescript
export type Trip = {
  // ...existing fields...
  cover_image_url?: string | null;
};
```

### API
- No new endpoint needed. `PATCH /trips/{id}` already exists and will accept `cover_image_url` in the request body once added to `TripUpdate`.
- For image upload: reuse existing `POST /uploads/presign` + S3 PUT flow. After upload, frontend calls `PATCH /trips/{id}` with the resulting public URL.

---

## 2. Trip Card (`frontend/components/trip-card.tsx`)

- If `trip.cover_image_url` is set: render an `<img>` at the top of the card with `object-cover`, fixed height (~120px), `rounded-t-lg`.
- If not set: card renders exactly as today (no image, no layout change).
- No other changes to the card component.

---

## 3. Trip Overview Tab (`frontend/app/trips/[tripId]/page.tsx`)

### Hero section
- If `cover_image_url` is set: use it as `background-image` (with `bg-cover bg-center`) replacing the coral gradient. Apply a dark gradient overlay (`from-black/70 to-transparent`) so title text remains legible.
- If not set: keep the existing coral gradient as fallback. No visual regression.
- Add button "✏️ Alterar capa" in the top-right corner of the hero, always visible.

### `CoverImageModal` component (`frontend/components/CoverImageModal.tsx`)
New component, opened when the user clicks "Alterar capa".

**Two tabs:**

#### Tab 1 — Fazer upload
- File input accepting image types (`image/*`)
- Preview of selected image
- "Confirmar" button: calls `/uploads/presign`, PUTs file to S3, then calls `PATCH /trips/{id}` with the public URL
- Loading state during upload

#### Tab 2 — Escolher das memórias
- Fetches trip memories filtered to `memory_type = "photo"` via existing `GET /trips/{id}/memories` (or equivalent)
- Displays photos in a responsive grid
- Clicking a photo selects it (highlighted border)
- "Confirmar" button: calls `PATCH /trips/{id}` with the selected memory's public URL

**After confirm (both tabs):**
- Updates local trip state with new `cover_image_url`
- Closes modal

---

## 4. Out of Scope

- No new backend endpoint for cover upload (reuses existing presign flow)
- No `cover_memory_id` tracking — cover is stored as a plain URL regardless of source
- No automatic cover suggestion or AI-generated cover
- No cover removal UI in this iteration (can be added later)

---

## 5. File Checklist

| File | Change |
|------|--------|
| `backend/alembic/versions/20260315_0001_add_cover_image_url_to_trips.py` | New migration |
| `backend/app/models/trip.py` | Add `cover_image_url` column |
| `backend/app/schemas/trip.py` | Add field to `TripResponse` and `TripUpdate` |
| `frontend/lib/api.ts` | Add `cover_image_url` to `Trip` type |
| `frontend/components/trip-card.tsx` | Render cover image banner if present |
| `frontend/app/trips/[tripId]/page.tsx` | Hero with cover image + "Alterar capa" button |
| `frontend/components/CoverImageModal.tsx` | New component — upload + memory picker |
