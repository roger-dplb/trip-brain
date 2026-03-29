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
