import uuid
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client():
    return TestClient(app, raise_server_exceptions=False)


def _make_job(status="done", trip_id=None):
    tid = trip_id or uuid.uuid4()
    return SimpleNamespace(
        id=uuid.uuid4(),
        trip_id=tid,
        status=status,
        zip_object_key=f"stories/{tid}/export.zip" if status == "done" else None,
        mp4_object_key=f"stories/{tid}/export.mp4" if status == "done" else None,
        error_msg=None,
        created_at=datetime.now(timezone.utc),
    )


def test_trigger_export_returns_202_for_new_job(client):
    trip_id = uuid.uuid4()
    with patch("app.api.routes.stories.TripRepository") as MockTripRepo, \
         patch("app.api.routes.stories.StoryExportRepository") as MockExportRepo, \
         patch("app.api.routes.stories.MemoryRepository") as MockMemRepo, \
         patch("app.api.routes.stories._enqueue_worker_job") as mock_enqueue:

        MockTripRepo.return_value.get.return_value = SimpleNamespace(id=trip_id)
        MockExportRepo.return_value.get_by_trip.return_value = None
        MockMemRepo.return_value.list.return_value = [
            SimpleNamespace(memory_type="photo", storage_key="k.jpg")
        ]
        new_job = _make_job(status="queued", trip_id=trip_id)
        MockExportRepo.return_value.upsert_queued.return_value = new_job
        mock_enqueue.return_value = None

        resp = client.post(f"/api/v1/trips/{trip_id}/stories/export")
        assert resp.status_code == 202
        data = resp.json()
        assert data["status"] == "queued"
        assert data["cached"] is False


def test_trigger_export_returns_422_when_trip_has_no_photos(client):
    trip_id = uuid.uuid4()
    with patch("app.api.routes.stories.TripRepository") as MockTripRepo, \
         patch("app.api.routes.stories.StoryExportRepository") as MockExportRepo, \
         patch("app.api.routes.stories.MemoryRepository") as MockMemRepo:

        MockTripRepo.return_value.get.return_value = SimpleNamespace(id=trip_id)
        MockExportRepo.return_value.get_by_trip.return_value = None
        MockMemRepo.return_value.list.return_value = [
            SimpleNamespace(memory_type="note", storage_key=None)
        ]

        resp = client.post(f"/api/v1/trips/{trip_id}/stories/export")
        assert resp.status_code == 422


def test_trigger_export_returns_200_when_cache_is_valid(client):
    trip_id = uuid.uuid4()
    with patch("app.api.routes.stories.TripRepository") as MockTripRepo, \
         patch("app.api.routes.stories.StoryExportRepository") as MockExportRepo, \
         patch("app.api.routes.stories.MemoryRepository") as MockMemRepo, \
         patch("app.api.routes.stories.StorageService") as MockStorage:

        MockTripRepo.return_value.get.return_value = SimpleNamespace(id=trip_id)
        done_job = _make_job(status="done", trip_id=trip_id)
        MockExportRepo.return_value.get_by_trip.return_value = done_job
        old_change = datetime(2026, 1, 1, tzinfo=timezone.utc)
        MockExportRepo.return_value.get_last_data_change.return_value = old_change
        MockMemRepo.return_value.list.return_value = []
        MockStorage.return_value.build_public_object_url.return_value = "http://minio/..."

        resp = client.post(f"/api/v1/trips/{trip_id}/stories/export")
        assert resp.status_code == 200
        data = resp.json()
        assert data["cached"] is True
        assert data["status"] == "done"


def test_get_export_status_returns_404_for_wrong_trip(client):
    trip_id = uuid.uuid4()
    other_job_id = uuid.uuid4()
    with patch("app.api.routes.stories.TripRepository") as MockTripRepo, \
         patch("app.api.routes.stories.StoryExportRepository") as MockExportRepo:

        MockTripRepo.return_value.get.return_value = SimpleNamespace(id=trip_id)
        wrong_job = _make_job(status="done")  # different trip_id
        MockExportRepo.return_value.get_by_trip.return_value = wrong_job

        resp = client.get(f"/api/v1/trips/{trip_id}/stories/export/{other_job_id}")
        assert resp.status_code == 404
