# Design: Add Media to Existing Trip

**Date:** 2026-03-29
**Status:** Approved

## Overview

Allow users to add new photos and videos to an existing trip. The media is processed the same way as the initial trip import: EXIF/video metadata extraction, clustering by date, activity grouping, reverse geocoding, Vision API descriptions, and trip metadata update.

## Decisions Made

| Question | Decision |
|---|---|
| Date already exists in trip? | Add activities to the existing day (merge); if date is new, create a new day |
| Trip metadata (name, dates, summary)? | Update only fields that effectively changed |
| Videos? | Extract date + duration via `ffprobe` for grouping; stored as memories without Vision API |
| Trip status during processing? | Unchanged — processing runs silently in background |
| Upload flow? | Reuse existing `/uploads/import-presign` presigned URL flow |

---

## 1. API

### Upload (no change)
Frontend reuses `POST /uploads/import-presign` to get presigned URLs. Files are uploaded directly to MinIO under `imports/{session_id}/` prefix — identical to the current import flow.

### New trigger endpoint
```
POST /trips/{trip_id}/add-media
Body:  { "object_keys": ["imports/abc/foto1.jpg", "imports/abc/video1.mp4", ...] }
Response 202: { "trip_id": "uuid", "job_id": "uuid" }
```

- Returns `404` if the trip does not exist.
- Returns `422` if `object_keys` is empty.

### New schemas (`backend/app/schemas/upload.py`)
- `TripAddMediaRequest`: `object_keys: list[str]`
- `TripAddMediaResponse`: `trip_id: UUID`, `job_id: UUID`

---

## 2. Backend Service & Enqueue

### `enqueue_trip_media_add()` (`backend/app/services/import_service.py`)

Plain `INSERT` into `worker_jobs` with `job_type = 'trip_media_add'`. **No `ON CONFLICT`** — multiple independent batches from the same trip may be queued concurrently without one overwriting the other.

Payload: `{ "object_keys": [...] }`

---

## 3. Worker — New Module

### `worker/app/add_media/processor.py`

New function `process_trip_media_add(trip_id, object_keys, ...)`.

Reuses existing utilities from `worker/app/import_trip/`:
- `extract_photo_metadata()` — EXIF date + GPS for photos
- `cluster_by_date()` — group media by date
- `cluster_into_activities()` — group within a day into activity clusters
- `reverse_geocode()` — GPS → country/city
- `describe_activity_from_photos()` — Vision API for activity title/notes
- `generate_trip_metadata()` — regenerate trip name/destinations/summary

### Processing steps

1. **Download + metadata extraction**
   - Photos → `extract_photo_metadata()` (EXIF: date, GPS)
   - Videos → new `extract_video_metadata()` (ffprobe: creation date, duration); on failure, stored without date

2. **Cluster by date** → `cluster_by_date()` then `cluster_into_activities()`

3. **Merge with existing days**
   - For each date group: query DB for existing `days` row with that date and `trip_id`
   - **Day exists:** append new activities to it (reuse `day_id`)
   - **Day does not exist:** insert new day, then renumber all days of the trip ordered by date

4. **Geocode + Vision API** — same flow as `process_trip_import`

5. **Selective trip metadata update**
   - Recompute `start_date`, `end_date`, `destinations`, `summary`
   - Only execute `UPDATE trips SET ...` for fields that changed

6. **Move files + insert memories**
   - Move `imports/{session_id}/file` → `trips/{trip_id}/days/{day_id}/activities/{activity_id}/{uuid}{ext}`
   - Insert `memories` rows (`memory_type = 'photo'` or `'video'`)

---

## 4. Video Metadata Extraction

New function `extract_video_metadata(video_bytes) -> dict` added to `worker/app/import_trip/extractor.py`.

- Uses `ffprobe` via subprocess (assumed available in worker Docker image)
- Returns `{ "taken_at": datetime | None, "duration_seconds": float | None }`
- On any failure: returns `{ "taken_at": None, "duration_seconds": None }` — does not raise, does not block processing

---

## 5. Worker Dispatch (`worker/app/main.py`)

- Add constant `JOB_TYPE_TRIP_MEDIA_ADD = "trip_media_add"`
- Add dispatch branch that calls `process_trip_media_add()`
- Add error branch: on failure, log error and mark job as `failed` — **does not** change `trip.status`

---

## 6. Files Changed / Created

### New files
| File | Purpose |
|---|---|
| `worker/app/add_media/__init__.py` | Module init |
| `worker/app/add_media/processor.py` | `process_trip_media_add()` |

### Modified files
| File | Change |
|---|---|
| `backend/app/schemas/upload.py` | Add `TripAddMediaRequest`, `TripAddMediaResponse` |
| `backend/app/services/import_service.py` | Add `enqueue_trip_media_add()` |
| `backend/app/api/routes/trips.py` | Add `POST /{trip_id}/add-media` endpoint |
| `worker/app/import_trip/extractor.py` | Add `extract_video_metadata()` |
| `worker/app/main.py` | Register `JOB_TYPE_TRIP_MEDIA_ADD`, add dispatch + error handling |

---

## 7. Edge Cases

| Case | Behavior |
|---|---|
| Media without date metadata | Goes to `"unknown"` group → day without date (same as current import) |
| ffprobe unavailable / video corrupt | Video stored as memory without date; processing continues |
| Trip not found | `404` returned before enqueuing |
| Worker failure | Job marked `failed` in `worker_jobs`; trip status unchanged; files already moved remain in new path |
| No metadata changes | `UPDATE trips` not executed |
| Concurrent batches for same trip | Each batch is an independent job row; no race on job level (DB transactions handle activity/day inserts) |
