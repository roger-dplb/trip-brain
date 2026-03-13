import uuid
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.schemas.day import DayCreate, DayUpdate
from app.services.day_service import DayService


class FakeDayRepository:
    def __init__(self, existing=None) -> None:
        self.existing = existing
        self.updated_payload = None

    def find_by_trip_and_day_number(self, trip_id, day_number):
        return self.existing

    def create(self, payload):
        return payload

    def update(self, day, payload):
        self.updated_payload = payload
        return day

    def delete(self, day):
        return None


def test_create_rejects_duplicate_day_number() -> None:
    trip_id = uuid.uuid4()
    repository = FakeDayRepository(existing=SimpleNamespace(id=uuid.uuid4(), trip_id=trip_id))
    service = DayService(repository=repository)

    payload = DayCreate(trip_id=trip_id, day_number=1)

    with pytest.raises(HTTPException) as exc_info:
        service.create(payload)

    assert exc_info.value.status_code == 409


def test_update_rejects_duplicate_day_number_from_other_day() -> None:
    trip_id = uuid.uuid4()
    day = SimpleNamespace(id=uuid.uuid4(), trip_id=trip_id, day_number=1)
    conflicting_day = SimpleNamespace(id=uuid.uuid4(), trip_id=trip_id, day_number=2)
    repository = FakeDayRepository(existing=conflicting_day)
    service = DayService(repository=repository)

    with pytest.raises(HTTPException) as exc_info:
        service.update(day, DayUpdate(day_number=2))

    assert exc_info.value.status_code == 409


def test_update_allows_same_day_and_calls_repository() -> None:
    trip_id = uuid.uuid4()
    same_day_id = uuid.uuid4()
    day = SimpleNamespace(id=same_day_id, trip_id=trip_id, day_number=1)
    same_day = SimpleNamespace(id=same_day_id, trip_id=trip_id, day_number=1)
    repository = FakeDayRepository(existing=same_day)
    service = DayService(repository=repository)

    result = service.update(day, DayUpdate(day_number=1))

    assert result == day
    assert repository.updated_payload is not None
