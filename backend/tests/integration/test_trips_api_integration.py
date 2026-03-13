from datetime import date


def test_create_and_get_trip_integration(client) -> None:
    create_response = client.post(
        "/api/v1/trips/",
        json={
            "name": "Kyoto Trip",
            "destination": "Kyoto",
            "start_date": "2026-05-10",
            "end_date": "2026-05-20",
            "summary": "Primeira viagem",
            "status": "planning",
        },
    )

    assert create_response.status_code == 201
    created = create_response.json()
    assert created["name"] == "Kyoto Trip"
    assert created["destination"] == "Kyoto"

    trip_id = created["id"]

    get_response = client.get(f"/api/v1/trips/{trip_id}")
    assert get_response.status_code == 200
    fetched = get_response.json()
    assert fetched["id"] == trip_id
    assert fetched["summary"] == "Primeira viagem"


def test_create_trip_invalid_dates_returns_standardized_error(client) -> None:
    response = client.post(
        "/api/v1/trips/",
        json={
            "name": "Invalid Trip",
            "destination": "Tokyo",
            "start_date": "2026-06-10",
            "end_date": "2026-06-01",
            "status": "planning",
        },
    )

    assert response.status_code == 422
    body = response.json()
    assert body["error"]["code"] == "validation_error"
    assert "start_date" in body["error"]["message"]


def test_trip_timeline_returns_empty_days_for_new_trip(client) -> None:
    create_response = client.post(
        "/api/v1/trips/",
        json={
            "name": "Timeline Trip",
            "destination": "Osaka",
            "start_date": str(date(2026, 7, 1)),
            "end_date": str(date(2026, 7, 5)),
            "status": "planning",
        },
    )
    trip_id = create_response.json()["id"]

    timeline_response = client.get(f"/api/v1/trips/{trip_id}/timeline")

    assert timeline_response.status_code == 200
    payload = timeline_response.json()
    assert payload["trip_id"] == trip_id
    assert payload["days"] == []
