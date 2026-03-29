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
