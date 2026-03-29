# backend/tests/unit/test_import_service_add_media.py
import uuid
from types import SimpleNamespace
from unittest.mock import MagicMock, call
from app.services.import_service import enqueue_trip_media_add


def _make_db(returned_job_id=None):
    """Build a fake db session that returns a row from execute()."""
    db = MagicMock()
    row = (returned_job_id,) if returned_job_id else None

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
