# Add Media to Existing Trip — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to upload photos and videos to an existing trip and have them processed (EXIF/video metadata, day clustering, geocoding, Vision API, trip metadata update) the same way as the initial trip import.

**Architecture:** New endpoint `POST /trips/{trip_id}/add-media` enqueues a `trip_media_add` job. A new worker module `worker/app/add_media/processor.py` handles the job, reusing extractor/geocoder/generator utilities from `import_trip/` and merging new media into existing days (or creating new days and renumbering).

**Tech Stack:** FastAPI, SQLAlchemy, psycopg, Pydantic v2, PIL, ffprobe (subprocess), boto3/MinIO, OpenAI Vision API, pytest.

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Modify | `backend/app/schemas/upload.py` | Add `TripAddMediaRequest`, `TripAddMediaResponse` |
| Modify | `backend/app/services/import_service.py` | Add `enqueue_trip_media_add()` |
| Modify | `backend/app/api/routes/trips.py` | Add `POST /{trip_id}/add-media` endpoint |
| Modify | `worker/app/import_trip/extractor.py` | Add `extract_video_metadata()` |
| Create | `worker/app/add_media/__init__.py` | Module init |
| Create | `worker/app/add_media/processor.py` | `process_trip_media_add()` |
| Modify | `worker/app/main.py` | Register `JOB_TYPE_TRIP_MEDIA_ADD`, dispatch + error branch |
| Create | `backend/tests/unit/test_add_media_schemas.py` | Unit tests for new schemas |
| Create | `backend/tests/unit/test_import_service_add_media.py` | Unit tests for enqueue function |
| Create | `backend/tests/integration/test_add_media_endpoint.py` | Integration tests for endpoint |
| Create | `worker/tests/test_video_extractor.py` | Unit tests for `extract_video_metadata()` |
| Create | `worker/tests/test_add_media_processor.py` | Unit tests for processor merge logic |

---

## Task 1: Add schemas for add-media request/response

**Files:**
- Modify: `backend/app/schemas/upload.py`
- Test: `backend/tests/unit/test_add_media_schemas.py`

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/unit/test_add_media_schemas.py
import uuid
import pytest
from pydantic import ValidationError
from app.schemas.upload import TripAddMediaRequest, TripAddMediaResponse


def test_trip_add_media_request_requires_object_keys():
    with pytest.raises(ValidationError):
        TripAddMediaRequest()


def test_trip_add_media_request_valid():
    req = TripAddMediaRequest(object_keys=["imports/abc/foto1.jpg"])
    assert req.object_keys == ["imports/abc/foto1.jpg"]


def test_trip_add_media_response_valid():
    trip_id = uuid.uuid4()
    job_id = uuid.uuid4()
    resp = TripAddMediaResponse(trip_id=trip_id, job_id=job_id)
    assert resp.trip_id == trip_id
    assert resp.job_id == job_id
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && python -m pytest tests/unit/test_add_media_schemas.py -v
```

Expected: FAIL with `ImportError` (classes not yet defined)

- [ ] **Step 3: Add the schemas**

In `backend/app/schemas/upload.py`, append at the end of the file:

```python
class TripAddMediaRequest(BaseModel):
    object_keys: list[str]


class TripAddMediaResponse(BaseModel):
    trip_id: uuid.UUID
    job_id: uuid.UUID
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && python -m pytest tests/unit/test_add_media_schemas.py -v
```

Expected: 3 PASSED

- [ ] **Step 5: Commit**

```bash
git add backend/app/schemas/upload.py backend/tests/unit/test_add_media_schemas.py
git commit -m "feat: add TripAddMediaRequest and TripAddMediaResponse schemas"
```

---

## Task 2: Add enqueue function in import_service

**Files:**
- Modify: `backend/app/services/import_service.py`
- Test: `backend/tests/unit/test_import_service_add_media.py`

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/unit/test_import_service_add_media.py
import uuid
from types import SimpleNamespace
from unittest.mock import MagicMock, call
from app.services.import_service import enqueue_trip_media_add


def _make_db(returned_job_id=None):
    """Build a fake db session that returns a row from execute()."""
    db = MagicMock()
    row = SimpleNamespace(**{"0": returned_job_id}) if returned_job_id else None

    result = MagicMock()
    result.fetchone.return_value = row
    db.execute.return_value = result
    return db


def test_enqueue_trip_media_add_returns_job_id():
    trip_id = uuid.uuid4()
    db = _make_db()
    job_id = enqueue_trip_media_add(db, trip_id, ["imports/s/a.jpg"])
    assert isinstance(job_id, uuid.UUID)
    db.commit.assert_called_once()


def test_enqueue_trip_media_add_uses_returned_id():
    trip_id = uuid.uuid4()
    returned = uuid.uuid4()
    db = _make_db(returned_job_id=returned)
    job_id = enqueue_trip_media_add(db, trip_id, ["imports/s/a.jpg"])
    assert job_id == returned


def test_enqueue_trip_media_add_payload_contains_object_keys():
    trip_id = uuid.uuid4()
    db = _make_db()
    enqueue_trip_media_add(db, trip_id, ["imports/s/a.jpg", "imports/s/b.mp4"])
    call_args = db.execute.call_args
    params = call_args[0][1]
    import json
    payload = json.loads(params["payload"])
    assert payload["object_keys"] == ["imports/s/a.jpg", "imports/s/b.mp4"]
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && python -m pytest tests/unit/test_import_service_add_media.py -v
```

Expected: FAIL with `ImportError`

- [ ] **Step 3: Add the function**

In `backend/app/services/import_service.py`, append after `enqueue_trip_import`:

```python
def enqueue_trip_media_add(
    db: Session,
    trip_id: uuid.UUID,
    object_keys: list[str],
) -> uuid.UUID:
    payload = {"object_keys": object_keys}
    job_id = uuid.uuid4()

    result = db.execute(
        text("""
            INSERT INTO worker_jobs (
                id, job_type, source_type, source_id,
                status, payload, payload_hash, updated_at
            )
            VALUES (
                :job_id, 'trip_media_add', 'trip', :trip_id,
                'pending', CAST(:payload AS JSONB), :payload_hash, NOW()
            )
            RETURNING id
        """),
        {
            "job_id": job_id,
            "trip_id": trip_id,
            "payload": json.dumps(payload),
            "payload_hash": hashlib.sha256(
                json.dumps(payload, sort_keys=True).encode()
            ).hexdigest(),
        },
    )
    returned = result.fetchone()
    if returned:
        job_id = returned[0]

    db.commit()
    return job_id
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && python -m pytest tests/unit/test_import_service_add_media.py -v
```

Expected: 3 PASSED

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/import_service.py backend/tests/unit/test_import_service_add_media.py
git commit -m "feat: add enqueue_trip_media_add service function"
```

---

## Task 3: Add the API endpoint

**Files:**
- Modify: `backend/app/api/routes/trips.py`
- Test: `backend/tests/integration/test_add_media_endpoint.py`

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/integration/test_add_media_endpoint.py
import uuid
from datetime import date
from unittest.mock import patch


def _create_trip(client):
    resp = client.post(
        "/api/v1/trips/",
        json={
            "name": "Test Trip",
            "destinations": ["Lisboa, Portugal"],
            "start_date": "2026-05-01",
            "end_date": "2026-05-05",
            "status": "planned",
        },
    )
    assert resp.status_code == 201
    return resp.json()["id"]


def test_add_media_returns_404_for_unknown_trip(client):
    with patch("app.api.routes.trips.enqueue_trip_media_add") as mock_enqueue:
        resp = client.post(
            f"/api/v1/trips/{uuid.uuid4()}/add-media",
            json={"object_keys": ["imports/s/a.jpg"]},
        )
    assert resp.status_code == 404
    mock_enqueue.assert_not_called()


def test_add_media_returns_422_for_empty_object_keys(client):
    trip_id = _create_trip(client)
    resp = client.post(
        f"/api/v1/trips/{trip_id}/add-media",
        json={"object_keys": []},
    )
    assert resp.status_code == 422


def test_add_media_returns_202_and_enqueues_job(client):
    trip_id = _create_trip(client)
    fake_job_id = uuid.uuid4()
    with patch(
        "app.api.routes.trips.enqueue_trip_media_add", return_value=fake_job_id
    ) as mock_enqueue:
        resp = client.post(
            f"/api/v1/trips/{trip_id}/add-media",
            json={"object_keys": ["imports/s/foto1.jpg"]},
        )
    assert resp.status_code == 202
    body = resp.json()
    assert body["trip_id"] == trip_id
    assert body["job_id"] == str(fake_job_id)
    mock_enqueue.assert_called_once()
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && python -m pytest tests/integration/test_add_media_endpoint.py -v
```

Expected: FAIL with 404 (endpoint not found)

- [ ] **Step 3: Add the endpoint**

In `backend/app/api/routes/trips.py`:

Add to imports at the top:
```python
from app.schemas.upload import TripAddMediaRequest, TripAddMediaResponse, TripImportRequest, TripImportResponse
from app.services.import_service import enqueue_trip_import, enqueue_trip_media_add
```

Replace the existing individual imports of these symbols if already present. Then append the new endpoint before the end of the file:

```python
@router.post(
    "/{trip_id}/add-media",
    response_model=TripAddMediaResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
def add_media_to_trip(
    trip_id: uuid.UUID,
    payload: TripAddMediaRequest,
    db: Session = Depends(get_db),
):
    trip = db.query(Trip).filter(Trip.id == trip_id).first()
    if not trip:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Trip not found"
        )
    if not payload.object_keys:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="object_keys must not be empty",
        )
    job_id = enqueue_trip_media_add(db, trip_id, payload.object_keys)
    return TripAddMediaResponse(trip_id=trip_id, job_id=job_id)
```

- [ ] **Step 4: Fix import line in trips.py**

The file currently imports these symbols individually. Replace the two separate import lines:

```python
# OLD (two separate lines, may vary):
from app.schemas.upload import TripImportRequest, TripImportResponse
from app.services.import_service import enqueue_trip_import
```

With:
```python
from app.schemas.upload import TripAddMediaRequest, TripAddMediaResponse, TripImportRequest, TripImportResponse
from app.services.import_service import enqueue_trip_import, enqueue_trip_media_add
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd backend && python -m pytest tests/integration/test_add_media_endpoint.py -v
```

Expected: 3 PASSED

- [ ] **Step 6: Run full backend test suite**

```bash
cd backend && python -m pytest -v
```

Expected: all existing tests still pass

- [ ] **Step 7: Commit**

```bash
git add backend/app/api/routes/trips.py backend/tests/integration/test_add_media_endpoint.py
git commit -m "feat: add POST /trips/{trip_id}/add-media endpoint"
```

---

## Task 4: Add extract_video_metadata to extractor

**Files:**
- Modify: `worker/app/import_trip/extractor.py`
- Test: `worker/tests/test_video_extractor.py`

- [ ] **Step 1: Write the failing tests**

```python
# worker/tests/test_video_extractor.py
import json
import subprocess
from datetime import datetime
from unittest.mock import MagicMock, patch

from app.import_trip.extractor import extract_video_metadata


def _make_ffprobe_output(creation_time: str | None, duration: str | None) -> str:
    streams = []
    if duration is not None:
        streams = [{"duration": duration}]
    tags = {}
    if creation_time is not None:
        tags["creation_time"] = creation_time
    return json.dumps({
        "streams": streams,
        "format": {"tags": tags},
    })


def test_extract_video_metadata_returns_datetime_and_duration():
    ffprobe_json = _make_ffprobe_output("2024-08-15T10:30:00.000000Z", "125.5")
    with patch("subprocess.run") as mock_run:
        mock_run.return_value = MagicMock(
            returncode=0, stdout=ffprobe_json, stderr=""
        )
        result = extract_video_metadata(b"fake_video_bytes")

    assert result["taken_at"] == datetime(2024, 8, 15, 10, 30, 0)
    assert result["duration_seconds"] == 125.5


def test_extract_video_metadata_returns_none_when_no_tags():
    ffprobe_json = _make_ffprobe_output(None, "60.0")
    with patch("subprocess.run") as mock_run:
        mock_run.return_value = MagicMock(
            returncode=0, stdout=ffprobe_json, stderr=""
        )
        result = extract_video_metadata(b"fake_video_bytes")

    assert result["taken_at"] is None
    assert result["duration_seconds"] == 60.0


def test_extract_video_metadata_returns_none_on_ffprobe_failure():
    with patch("subprocess.run", side_effect=FileNotFoundError("ffprobe not found")):
        result = extract_video_metadata(b"fake_video_bytes")

    assert result == {"taken_at": None, "duration_seconds": None}


def test_extract_video_metadata_returns_none_on_bad_json():
    with patch("subprocess.run") as mock_run:
        mock_run.return_value = MagicMock(returncode=0, stdout="not json", stderr="")
        result = extract_video_metadata(b"fake_video_bytes")

    assert result == {"taken_at": None, "duration_seconds": None}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd worker && python -m pytest tests/test_video_extractor.py -v
```

Expected: FAIL with `ImportError`

- [ ] **Step 3: Add extract_video_metadata to extractor.py**

Add to the top of `worker/app/import_trip/extractor.py`:
```python
import json
import os
import subprocess
import tempfile
```

Then append at the end of `worker/app/import_trip/extractor.py`:

```python
def extract_video_metadata(video_bytes):
    """
    Extract creation date and duration from video bytes using ffprobe.
    Writes bytes to a temp file, runs ffprobe, parses JSON output.
    Returns dict with keys: taken_at (datetime|None), duration_seconds (float|None).
    On any failure, returns {"taken_at": None, "duration_seconds": None}.
    """
    try:
        suffix = ".mp4"
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(video_bytes)
            tmp_path = tmp.name

        try:
            result = subprocess.run(
                [
                    "ffprobe", "-v", "quiet",
                    "-print_format", "json",
                    "-show_streams", "-show_format",
                    tmp_path,
                ],
                capture_output=True,
                text=True,
                timeout=30,
            )
        finally:
            os.unlink(tmp_path)

        if result.returncode != 0:
            return {"taken_at": None, "duration_seconds": None}

        data = json.loads(result.stdout)

        # Duration from first stream
        duration_seconds = None
        for stream in data.get("streams", []):
            raw_duration = stream.get("duration")
            if raw_duration is not None:
                try:
                    duration_seconds = float(raw_duration)
                    break
                except (ValueError, TypeError):
                    pass

        # Creation time from format tags
        taken_at = None
        tags = data.get("format", {}).get("tags", {})
        creation_time_str = tags.get("creation_time")
        if creation_time_str:
            for fmt in ("%Y-%m-%dT%H:%M:%S.%fZ", "%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%d %H:%M:%S"):
                try:
                    taken_at = datetime.strptime(creation_time_str, fmt)
                    break
                except ValueError:
                    continue

        return {"taken_at": taken_at, "duration_seconds": duration_seconds}

    except Exception:
        return {"taken_at": None, "duration_seconds": None}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd worker && python -m pytest tests/test_video_extractor.py -v
```

Expected: 4 PASSED

- [ ] **Step 5: Commit**

```bash
git add worker/app/import_trip/extractor.py worker/tests/test_video_extractor.py
git commit -m "feat: add extract_video_metadata using ffprobe"
```

---

## Task 5: Create the add_media processor

**Files:**
- Create: `worker/app/add_media/__init__.py`
- Create: `worker/app/add_media/processor.py`
- Test: `worker/tests/test_add_media_processor.py`

- [ ] **Step 1: Write the failing tests**

```python
# worker/tests/test_add_media_processor.py
import uuid
from datetime import date, datetime
from unittest.mock import MagicMock, patch, call

import pytest
from app.add_media.processor import _find_or_create_day, _renumber_days


# ── Unit: _renumber_days ──────────────────────────────────────────────────────

def test_renumber_days_assigns_sequential_numbers_by_date():
    days = [
        {"id": "a", "date": date(2024, 8, 17), "day_number": 3},
        {"id": "b", "date": date(2024, 8, 15), "day_number": 1},
        {"id": "c", "date": date(2024, 8, 16), "day_number": 2},
        {"id": "d", "date": None, "day_number": 4},
    ]
    result = _renumber_days(days)
    # Sorted by date (None last), reassigned 1..N
    assert result[0] == {"id": "b", "date": date(2024, 8, 15), "day_number": 1}
    assert result[1] == {"id": "c", "date": date(2024, 8, 16), "day_number": 2}
    assert result[2] == {"id": "a", "date": date(2024, 8, 17), "day_number": 3}
    assert result[3] == {"id": "d", "date": None, "day_number": 4}


def test_renumber_days_unknown_always_last():
    days = [
        {"id": "x", "date": None, "day_number": 1},
        {"id": "y", "date": date(2024, 8, 20), "day_number": 2},
    ]
    result = _renumber_days(days)
    assert result[0]["id"] == "y"
    assert result[0]["day_number"] == 1
    assert result[1]["id"] == "x"
    assert result[1]["day_number"] == 2


# ── Unit: _find_or_create_day ─────────────────────────────────────────────────

def _make_conn_with_days(existing_days):
    """
    existing_days: list of (day_id, day_number) tuples for existing rows.
    First fetchone call returns the day lookup.
    Second fetchall call returns all days for renumbering.
    """
    conn = MagicMock()
    cursor = MagicMock()
    conn.cursor.return_value.__enter__.return_value = cursor

    # First cursor.fetchone() → day lookup (None = not found)
    # Second cursor.fetchall() → all days
    cursor.fetchone.side_effect = existing_days[:1] or [None]
    cursor.fetchall.return_value = []
    return conn, cursor


def test_find_or_create_day_returns_existing_id():
    trip_id = uuid.uuid4()
    day_id = uuid.uuid4()
    conn = MagicMock()
    cursor = MagicMock()
    conn.cursor.return_value.__enter__.return_value = cursor
    cursor.fetchone.return_value = (day_id, 2)

    result = _find_or_create_day(conn, trip_id, "2024-08-15")

    assert result == day_id
    # Should NOT insert a new day
    insert_calls = [str(c) for c in cursor.execute.call_args_list]
    assert not any("INSERT INTO days" in c for c in insert_calls)


def test_find_or_create_day_inserts_new_day_when_not_found():
    trip_id = uuid.uuid4()
    conn = MagicMock()
    cursor = MagicMock()
    conn.cursor.return_value.__enter__.return_value = cursor
    cursor.fetchone.return_value = None
    cursor.fetchall.return_value = []  # no existing days to renumber

    result = _find_or_create_day(conn, trip_id, "2024-08-15")

    assert isinstance(result, uuid.UUID)
    insert_calls = " ".join(str(c) for c in cursor.execute.call_args_list)
    assert "INSERT INTO days" in insert_calls
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd worker && python -m pytest tests/test_add_media_processor.py -v
```

Expected: FAIL with `ImportError`

- [ ] **Step 3: Create the module init**

```python
# worker/app/add_media/__init__.py
```

(empty file)

- [ ] **Step 4: Create the processor**

```python
# worker/app/add_media/processor.py
import io
import os
import time
import uuid
from datetime import date, datetime
from statistics import median

import psycopg
from PIL import Image, ImageOps

from app.import_trip.extractor import (
    cluster_by_date,
    cluster_into_activities,
    extract_photo_metadata,
    extract_video_metadata,
)
from app.import_trip.generator import (
    describe_activity_from_photos,
    generate_trip_metadata,
)
from app.import_trip.geocoder import reverse_geocode


_VIDEO_EXTENSIONS = frozenset({".mp4", ".mov", ".avi", ".mkv", ".m4v", ".3gp"})


def _make_thumbnail_bytes(image_bytes, max_size=512):
    try:
        img = Image.open(io.BytesIO(image_bytes))
        img = ImageOps.exif_transpose(img)
        img = img.convert("RGB")
        img.thumbnail((max_size, max_size))
        out = io.BytesIO()
        img.save(out, format="JPEG", quality=75)
        return out.getvalue()
    except Exception:
        return image_bytes


def _renumber_days(days):
    """
    Given a list of dicts {id, date, day_number}, return the same list sorted
    by date ascending (None/unknown last) with day_number reassigned from 1.
    """
    dated = sorted(
        [d for d in days if d["date"] is not None],
        key=lambda d: d["date"],
    )
    undated = [d for d in days if d["date"] is None]
    ordered = dated + undated
    for i, d in enumerate(ordered, start=1):
        d["day_number"] = i
    return ordered


def _find_or_create_day(conn, trip_id, date_str):
    """
    Look up an existing day for (trip_id, date_str).
    Returns the day_id (UUID). If not found, inserts a new day and renumbers
    all days of the trip by date.
    """
    parsed_date = date.fromisoformat(date_str) if date_str != "unknown" else None

    # Check if day already exists
    with conn.cursor() as cur:
        cur.execute(
            "SELECT id, day_number FROM days WHERE trip_id = %s AND date = %s LIMIT 1",
            (trip_id, parsed_date),
        )
        existing = cur.fetchone()

    if existing:
        return existing[0]

    # Fetch all existing days to determine new day_number after insertion
    with conn.cursor() as cur:
        cur.execute(
            "SELECT id, date, day_number FROM days WHERE trip_id = %s ORDER BY day_number",
            (trip_id,),
        )
        all_days = [
            {"id": row[0], "date": row[1], "day_number": row[2]}
            for row in cur.fetchall()
        ]

    new_day_id = uuid.uuid4()
    # Temporarily assign day_number 0; renumber will fix it
    all_days.append({"id": new_day_id, "date": parsed_date, "day_number": 0})
    renumbered = _renumber_days(all_days)

    # Find the number assigned to the new day
    new_day_number = next(d["day_number"] for d in renumbered if d["id"] == new_day_id)

    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO days (id, trip_id, day_number, date, notes, created_at)
            VALUES (%s, %s, %s, %s, NULL, NOW())
            """,
            (new_day_id, trip_id, new_day_number, parsed_date),
        )
        # Update day_number for all existing days
        for d in renumbered:
            if d["id"] != new_day_id:
                cur.execute(
                    "UPDATE days SET day_number = %s WHERE id = %s",
                    (d["day_number"], d["id"]),
                )

    return new_day_id


def process_trip_media_add(
    trip_id,
    object_keys,
    database_url,
    storage_client,
    bucket,
    openai_client,
    vision_model,
    minio_public_endpoint,
):
    """
    Add new photos/videos to an existing trip.
    1. Download + extract metadata (EXIF for photos, ffprobe for videos)
    2. Cluster by date → days
    3. For each date: merge into existing day or create a new one
    4. Geocode, Vision API, persist activities + memories
    5. Selectively update trip metadata (start_date, end_date, destinations, summary)
    """
    _ = minio_public_endpoint.rstrip("/")

    # ── Step 1: Download + extract metadata ──────────────────────────────────
    media_items = []
    for key in object_keys:
        try:
            response = storage_client.get_object(Bucket=bucket, Key=key)
            file_bytes = response["Body"].read()
            ext = os.path.splitext(key)[1].lower()
            is_video = ext in _VIDEO_EXTENSIONS
            if is_video:
                meta = extract_video_metadata(file_bytes)
                media_items.append(
                    {
                        "object_key": key,
                        "taken_at": meta["taken_at"],
                        "lat": None,
                        "lon": None,
                        "thumbnail_bytes": None,
                        "memory_type": "video",
                    }
                )
            else:
                meta = extract_photo_metadata(file_bytes)
                media_items.append(
                    {
                        "object_key": key,
                        "taken_at": meta["taken_at"],
                        "lat": meta["lat"],
                        "lon": meta["lon"],
                        "thumbnail_bytes": _make_thumbnail_bytes(file_bytes),
                        "memory_type": "photo",
                    }
                )
        except Exception as exc:
            print(f"[add_media] Failed to download/extract {key}: {exc}")
            media_items.append(
                {
                    "object_key": key,
                    "taken_at": None,
                    "lat": None,
                    "lon": None,
                    "thumbnail_bytes": None,
                    "memory_type": "photo",
                }
            )

    # ── Step 2: Cluster by date ───────────────────────────────────────────────
    days_map = cluster_by_date(media_items)

    sorted_dates = sorted(d for d in days_map.keys() if d != "unknown")
    if "unknown" in days_map:
        sorted_dates.append("unknown")

    # ── Steps 3–4: Process each date group ───────────────────────────────────
    days_data = []

    for date_str in sorted_dates:
        day_media = days_map[date_str]
        # Only photos are used for activity clustering and Vision
        photos_only = [m for m in day_media if m["memory_type"] == "photo"]
        activity_groups = cluster_into_activities(photos_only) if photos_only else [[]]
        # Videos appended to last activity group
        videos = [m for m in day_media if m["memory_type"] == "video"]
        if videos:
            if activity_groups:
                activity_groups[-1].extend(videos)
            else:
                activity_groups = [videos]

        gps_photos = [
            p for p in photos_only
            if p["lat"] is not None and p["lon"] is not None
        ]
        if gps_photos:
            med_lat = median([p["lat"] for p in gps_photos])
            med_lon = median([p["lon"] for p in gps_photos])
            location = reverse_geocode(med_lat, med_lon)
            time.sleep(1)
        else:
            location = {"country": "Desconhecido", "city": "Desconhecido", "region": None}

        if len(activity_groups) > 3:
            groups_to_describe = {0, len(activity_groups) - 1}
        else:
            groups_to_describe = set(range(len(activity_groups)))

        activities_data = []
        for group_idx, group in enumerate(activity_groups):
            if not group:
                continue
            if group_idx in groups_to_describe:
                photo_bytes_list = [
                    p["thumbnail_bytes"]
                    for p in group[:3]
                    if p.get("thumbnail_bytes") and p["memory_type"] == "photo"
                ]
                if photo_bytes_list:
                    desc = describe_activity_from_photos(openai_client, vision_model, photo_bytes_list)
                    title = (desc.get("title") or "Atividade").strip() or "Atividade"
                    notes = desc.get("notes") or None
                else:
                    title = "Atividade"
                    notes = None
            else:
                title = "Atividade"
                notes = None

            activities_data.append({"title": title, "notes": notes, "media": group})

        days_data.append(
            {
                "date_str": date_str,
                "location": location,
                "activities": activities_data,
            }
        )

    # ── Step 5: Persist ───────────────────────────────────────────────────────
    activities_created = 0
    memories_created = 0

    with psycopg.connect(database_url) as conn:
        conn.autocommit = False

        for day in days_data:
            date_str = day["date_str"]
            day_id = _find_or_create_day(conn, trip_id, date_str)

            # Upsert location for day
            loc = day["location"]
            if loc["country"] != "Desconhecido":
                loc_id = uuid.uuid4()
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        INSERT INTO locations (id, trip_id, country, city, region, place_name, created_at)
                        VALUES (%s, %s, %s, %s, %s, %s, NOW())
                        """,
                        (loc_id, trip_id, loc["country"], loc["city"], loc.get("region"), None),
                    )
                    cur.execute(
                        "UPDATE days SET location_id = %s WHERE id = %s",
                        (loc_id, day_id),
                    )

            loc_text = (
                f"{loc['city']}, {loc['country']}"
                if loc["city"] != "Desconhecido"
                else None
            )

            for activity in day["activities"]:
                activity_id = uuid.uuid4()
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        INSERT INTO activities (id, day_id, title, location, notes, status, created_at, updated_at)
                        VALUES (%s, %s, %s, %s, %s, 'planned', NOW(), NOW())
                        """,
                        (activity_id, day_id, activity["title"], loc_text, activity["notes"]),
                    )
                activities_created += 1

                for item in activity["media"]:
                    old_key = item["object_key"]
                    ext = os.path.splitext(old_key)[1] or ".jpg"
                    new_key = (
                        f"trips/{trip_id}/days/{day_id}"
                        f"/activities/{activity_id}/{uuid.uuid4()}{ext}"
                    )
                    try:
                        storage_client.copy_object(
                            Bucket=bucket,
                            CopySource={"Bucket": bucket, "Key": old_key},
                            Key=new_key,
                        )
                        storage_client.delete_object(Bucket=bucket, Key=old_key)
                    except Exception as exc:
                        print(f"[add_media] Failed to move {old_key} → {new_key}: {exc}")
                        new_key = old_key

                    with conn.cursor() as cur:
                        cur.execute(
                            """
                            INSERT INTO memories (
                                id, trip_id, day_id, activity_id,
                                memory_type, storage_key, taken_at, created_at
                            )
                            VALUES (%s, %s, %s, %s, %s, %s, %s, NOW())
                            """,
                            (
                                uuid.uuid4(),
                                trip_id,
                                day_id,
                                activity_id,
                                item["memory_type"],
                                new_key,
                                item.get("taken_at"),
                            ),
                        )
                    memories_created += 1

        # ── Selective trip metadata update ────────────────────────────────────
        with conn.cursor() as cur:
            cur.execute(
                "SELECT start_date, end_date, destinations, name FROM trips WHERE id = %s",
                (trip_id,),
            )
            row = cur.fetchone()

        if row:
            current_start, current_end, current_destinations, current_name = row

            with conn.cursor() as cur:
                cur.execute(
                    "SELECT date FROM days WHERE trip_id = %s AND date IS NOT NULL ORDER BY date",
                    (trip_id,),
                )
                all_dates = [r[0] for r in cur.fetchall()]

            new_start = min(all_dates).isoformat() if all_dates else current_start.isoformat()
            new_end = max(all_dates).isoformat() if all_dates else current_end.isoformat()

            days_summary = []
            for day in days_data:
                loc = day["location"]
                location_str = (
                    f"{loc['city']}, {loc['country']}"
                    if loc["city"] != "Desconhecido"
                    else "Localização desconhecida"
                )
                days_summary.append(
                    {
                        "date": day["date_str"] if day["date_str"] != "unknown" else "desconhecida",
                        "activities": [a["title"] for a in day["activities"]],
                        "location": location_str,
                    }
                )

            new_meta = generate_trip_metadata(openai_client, vision_model, days_summary)
            new_destinations = list(
                set((current_destinations or []) + (new_meta.get("destinations") or []))
            )

            updates = {}
            if new_start != current_start.isoformat():
                updates["start_date"] = new_start
            if new_end != current_end.isoformat():
                updates["end_date"] = new_end
            if set(new_destinations) != set(current_destinations or []):
                updates["destinations"] = new_destinations
            if new_meta.get("summary"):
                updates["summary"] = new_meta["summary"]

            if updates:
                set_clause = ", ".join(f"{k} = %s" for k in updates)
                values = list(updates.values()) + [trip_id]
                with conn.cursor() as cur:
                    cur.execute(
                        f"UPDATE trips SET {set_clause}, updated_at = NOW() WHERE id = %s",
                        values,
                    )

        conn.commit()

    print(
        f"[add_media] trip={trip_id} done: "
        f"activities={activities_created} memories={memories_created}"
    )
    return {
        "type": "trip_media_add",
        "activities_created": activities_created,
        "memories_created": memories_created,
    }
```

- [ ] **Step 5: Run unit tests**

```bash
cd worker && python -m pytest tests/test_add_media_processor.py -v
```

Expected: 4 PASSED

- [ ] **Step 6: Commit**

```bash
git add worker/app/add_media/__init__.py worker/app/add_media/processor.py worker/tests/test_add_media_processor.py
git commit -m "feat: add process_trip_media_add worker processor"
```

---

## Task 6: Register job type in worker main

**Files:**
- Modify: `worker/app/main.py`

- [ ] **Step 1: Add the constant**

In `worker/app/main.py`, after the line:
```python
JOB_TYPE_TRIP_IMPORT = "trip_import"
```

Add:
```python
JOB_TYPE_TRIP_MEDIA_ADD = "trip_media_add"
```

- [ ] **Step 2: Add the dispatch branch**

In `worker/app/main.py`, after the existing `if job_type == JOB_TYPE_TRIP_IMPORT:` block (around line 870), add before the `raise RuntimeError` line:

```python
    if job_type == JOB_TYPE_TRIP_MEDIA_ADD:
        from app.add_media.processor import process_trip_media_add

        return process_trip_media_add(
            trip_id=source_id,
            object_keys=list(payload.get("object_keys") or []),
            database_url=_normalize_database_url(os.getenv("DATABASE_URL", "")),
            storage_client=storage_client,
            bucket=bucket,
            openai_client=openai_client,
            vision_model=import_model,
            minio_public_endpoint=os.getenv(
                "MINIO_PUBLIC_ENDPOINT",
                os.getenv("MINIO_ENDPOINT", "http://minio:9000"),
            ),
        )
```

- [ ] **Step 3: Add the error branch**

Find the existing error handling for `JOB_TYPE_TRIP_IMPORT` in main.py (around line 1016):
```python
        if job_type == JOB_TYPE_TRIP_IMPORT:
            with connection.cursor() as cursor:
                cursor.execute(
                    "UPDATE trips SET status = 'import_failed', updated_at = NOW() WHERE id = %s",
```

After that `if` block's body, add a sibling branch (note: `trip_media_add` intentionally does NOT change trip status — just log):
```python
        if job_type == JOB_TYPE_TRIP_MEDIA_ADD:
            print(f"[add_media] job failed for trip={source_id}: {exc}")
```

- [ ] **Step 4: Run the full worker test suite**

```bash
cd worker && python -m pytest -v
```

Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add worker/app/main.py
git commit -m "feat: register trip_media_add job type in worker dispatch"
```

---

## Task 7: Full regression check

- [ ] **Step 1: Run all backend tests**

```bash
cd backend && python -m pytest -v
```

Expected: all pass

- [ ] **Step 2: Run all worker tests**

```bash
cd worker && python -m pytest -v
```

Expected: all pass

- [ ] **Step 3: Final commit if any stray changes**

```bash
git status
# If anything unstaged:
git add <file>
git commit -m "chore: cleanup after add-media feature"
```
