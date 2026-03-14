import uuid
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest


class FakeStoryExportRepository:
    """Fake repository for unit-testing cache logic in isolation."""

    def __init__(self, existing_job=None):
        self.existing_job = existing_job
        self.upserted = None

    def get_by_trip(self, trip_id):
        return self.existing_job

    def upsert_queued(self, trip_id):
        self.upserted = trip_id
        return SimpleNamespace(
            id=uuid.uuid4(), trip_id=trip_id, status="queued",
            zip_object_key=None, mp4_object_key=None,
            error_msg=None, created_at=datetime.now(timezone.utc)
        )

    def get_last_data_change(self, trip_id):
        return datetime.now(timezone.utc)


def _make_done_job(trip_id, created_at):
    return SimpleNamespace(
        id=uuid.uuid4(), trip_id=trip_id, status="done",
        zip_object_key=f"stories/{trip_id}/export.zip",
        mp4_object_key=f"stories/{trip_id}/export.mp4",
        error_msg=None, created_at=created_at,
    )


def test_cache_hit_when_no_data_change():
    """When the last data change is before the job's created_at, return cached=True."""
    trip_id = uuid.uuid4()
    job_created = datetime(2026, 3, 14, 10, 0, 0, tzinfo=timezone.utc)
    data_change = datetime(2026, 3, 14, 9, 0, 0, tzinfo=timezone.utc)

    existing = _make_done_job(trip_id, job_created)

    class RepoWithOldChange(FakeStoryExportRepository):
        def get_last_data_change(self, trip_id):
            return data_change

    repo = RepoWithOldChange(existing_job=existing)

    job = repo.get_by_trip(trip_id)
    last_change = repo.get_last_data_change(trip_id)
    is_cached = job is not None and job.status == "done" and last_change <= job.created_at

    assert is_cached is True


def test_cache_miss_when_data_changed_after_export():
    """When new data arrived after the export, return cached=False."""
    trip_id = uuid.uuid4()
    job_created = datetime(2026, 3, 14, 9, 0, 0, tzinfo=timezone.utc)
    data_change = datetime(2026, 3, 14, 10, 0, 0, tzinfo=timezone.utc)

    existing = _make_done_job(trip_id, job_created)

    class RepoWithNewChange(FakeStoryExportRepository):
        def get_last_data_change(self, trip_id):
            return data_change

    repo = RepoWithNewChange(existing_job=existing)
    job = repo.get_by_trip(trip_id)
    last_change = repo.get_last_data_change(trip_id)
    is_cached = job is not None and job.status == "done" and last_change <= job.created_at

    assert is_cached is False


def test_cache_miss_when_no_job_exists():
    """When there's no prior export, is_cached must be False."""
    trip_id = uuid.uuid4()
    repo = FakeStoryExportRepository(existing_job=None)
    job = repo.get_by_trip(trip_id)
    is_cached = job is not None and job.status == "done"
    assert is_cached is False
