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
- `TripRead` (not TripResponse — that class does not exist): add `cover_image_url: str | None`
- `TripUpdate`: add `cover_image_url: str | None` (optional field, patchable)
- Note: `TripUpdate` also contains a `status` field with no write guard. The cover-update `PUT` call from the frontend must send **only** `cover_image_url` in the body to avoid accidentally mutating other fields. Hardening `TripUpdate` to protect `status` from user writes is a separate future task.

### Upload presign response (`backend/app/schemas/upload.py`)
- Add `public_url: str` to `UploadPresignResponse`. The backend computes it at presign time via `StorageService.build_public_object_url(object_key)`. This avoids the frontend needing to know MinIO endpoint/bucket env vars.

### Frontend type (`frontend/lib/api.ts`)
```typescript
export type Trip = {
  // ...existing fields...
  cover_image_url?: string | null;
};
```
- Add `updateTrip(tripId: string, data: Partial<Pick<Trip, 'cover_image_url'>>): Promise<Trip>` — calls `PUT /trips/{tripId}` with the given fields.

### API
- The existing endpoint is `PUT /trips/{trip_id}`, not PATCH. Use `PUT` with a partial body containing only `cover_image_url`.
- URL validation: the backend does not validate that `cover_image_url` belongs to a trusted origin. This is an accepted trade-off for this iteration — the cover URL is only set by authenticated users via the UI.

---

## 2. Trip Card (`frontend/components/trip-card.tsx`)

- If `trip.cover_image_url` is set: render an `<img>` with `object-cover w-full h-[120px]` at the very top of the card, before the padded content area.
- The existing `p-5` padding must be moved to an inner wrapper `<div>` so the image can bleed edge-to-edge.
- The card root element (whether `<Link>` or `<div>` when `isGenerating`) already uses `rounded-xl` — keep `rounded-xl` (do not use `rounded-lg`) and add `overflow-hidden` so the image corners are correctly clipped.
- If `cover_image_url` is not set: card renders exactly as today (no image, no layout change).

---

## 3. Trip Overview Tab (`frontend/app/trips/[tripId]/page.tsx`)

### Hero section
- If `cover_image_url` is set: use it as `background-image` (with `bg-cover bg-center`) replacing the coral gradient. Apply a dark-to-transparent gradient overlay (`bg-gradient-to-t from-black/70 to-black/10`) so title text remains legible.
- If not set: keep the existing coral gradient as fallback. No visual regression.
- Add button "✏️ Alterar capa" (label is intentionally in Portuguese, consistent with existing UI) in the top-right corner of the hero, always visible regardless of whether a cover exists.

### `CoverImageModal` component (`frontend/components/CoverImageModal.tsx`)
New component, opened when the user clicks "Alterar capa".

**Two tabs: "Fazer upload" and "Escolher das memórias"**

#### Tab 1 — Fazer upload
- File input accepting only `image/jpeg`, `image/png`, `image/webp` (not generic `image/*` — other types like GIF or AVIF are rejected by the backend)
- Preview of selected image before confirming
- Client-side validation before calling presign:
  - File size > 25 MB (`max_upload_size_bytes = 26214400` in config): show "Imagem muito grande (máx. 25 MB)"
  - MIME type not in accepted list: show "Formato não suportado. Use JPG, PNG ou WebP"
- "Confirmar" button flow:
  1. Call `POST /uploads/presign` with `content_type`, `file_size_bytes`, `filename`, `trip_id`
  2. PUT file to the returned presigned `upload_url`
  3. Call `updateTrip(tripId, { cover_image_url: presignResponse.public_url })`
- Error states:
  - S3 PUT failure: "Erro ao enviar imagem. Tente novamente."
  - `PUT /trips/{id}` failure after successful S3 upload: "Erro ao salvar capa. Tente novamente." The orphaned S3 object is an accepted trade-off for this iteration.
- Loading state: disable button and show spinner during upload
- Image size note: no server-side resize is applied in this iteration. Cover images are displayed at ~120px tall in cards and ~240px in the hero. Large files will be downloaded at full resolution — deferred to a future iteration.

#### Tab 2 — Escolher das memórias
- Fetch: `GET /memories/?trip_id={id}` (correct endpoint; `/trips/{id}/memories` does not exist)
- Filter client-side to `memory_type === "photo"` (the endpoint does not support a `memory_type` query param)
- Display photos in a responsive grid (3 columns)
- Clicking a photo selects it (highlighted border)
- States:
  - Loading: spinner while fetching
  - Empty: "Sem fotos nas memórias desta viagem. Adicione fotos na aba Memórias ou faça upload direto."
  - Error: "Erro ao carregar memórias. Tente novamente."
- "Confirmar" button: calls `updateTrip(tripId, { cover_image_url: selectedPhoto.public_url })`

**After confirm (both tabs):**
- Update local trip state with new `cover_image_url`
- Close modal

**Dismissal without confirming:** Closing the modal (via close button, ESC, or outside click) leaves `cover_image_url` unchanged.

---

## 4. Out of Scope

- No new backend endpoint for cover upload (reuses existing presign flow)
- No `cover_memory_id` tracking — cover is stored as a plain URL regardless of source
- No automatic cover suggestion or AI-generated cover
- No cover removal UI in this iteration (future: `updateTrip(id, { cover_image_url: null })`)
- No server-side image resizing (future iteration)
- No hardening of `TripUpdate.status` write access (separate task)

---

## 5. File Checklist

| File | Change |
|------|--------|
| `backend/alembic/versions/20260315_0001_add_cover_image_url_to_trips.py` | New migration |
| `backend/app/models/trip.py` | Add `cover_image_url` column |
| `backend/app/schemas/trip.py` | Add field to `TripRead` and `TripUpdate` |
| `backend/app/schemas/upload.py` | Add `public_url` field to `UploadPresignResponse`; compute in presign route |
| `frontend/lib/api.ts` | Add `cover_image_url` to `Trip` type; add `updateTrip` function |
| `frontend/components/trip-card.tsx` | Render cover image banner if present; move `p-5` to inner wrapper; add `overflow-hidden` to root |
| `frontend/app/trips/[tripId]/page.tsx` | Hero with cover image + "Alterar capa" button |
| `frontend/components/CoverImageModal.tsx` | New component — upload + memory picker |
