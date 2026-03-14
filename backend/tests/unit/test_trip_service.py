import uuid
from datetime import date
from types import SimpleNamespace

import pytest
from app.schemas.trip import TripCreate, TripUpdate
from app.services.trip_service import TripService
from fastapi import HTTPException


class FakeTripRepository:
    def __init__(self) -> None:
        self.created_payload = None
        self.updated_payload = None

    def create(self, payload: TripCreate):
        self.created_payload = payload
        return payload

    def update(self, trip, payload: TripUpdate):
        self.updated_payload = payload
        return trip


def test_create_rejects_invalid_date_range() -> None:
    service = TripService(repository=FakeTripRepository())
    payload = TripCreate(
        name="Kyoto",
        destinations=["Kyoto, Japan"],
        start_date=date(2026, 4, 10),
        end_date=date(2026, 4, 8),
    )

    with pytest.raises(HTTPException) as exc_info:
        service.create(payload)

    assert exc_info.value.status_code == 422
    assert "start_date" in str(exc_info.value.detail)


def test_create_accepts_valid_date_range() -> None:
    repository = FakeTripRepository()
    service = TripService(repository=repository)
    payload = TripCreate(
        name="Kyoto",
        destinations=["Kyoto, Japan"],
        start_date=date(2026, 4, 8),
        end_date=date(2026, 4, 10),
    )

    result = service.create(payload)

    assert result == payload
    assert repository.created_payload == payload


def test_create_rejects_empty_destinations() -> None:
    with pytest.raises(Exception):
        TripCreate(
            name="No destination",
            destinations=[],
            start_date=date(2026, 4, 8),
            end_date=date(2026, 4, 10),
        )


def test_update_rejects_invalid_effective_date_range() -> None:
    repository = FakeTripRepository()
    service = TripService(repository=repository)
    trip = SimpleNamespace(
        id=uuid.uuid4(),
        start_date=date(2026, 4, 8),
        end_date=date(2026, 4, 10),
    )

    with pytest.raises(HTTPException) as exc_info:
        service.update(trip, TripUpdate(end_date=date(2026, 4, 1)))

    assert exc_info.value.status_code == 422
    assert repository.updated_payload is None
