import uuid
from datetime import datetime

from app.schemas.activity import ActivityRead
from app.schemas.timeline import TimelineActivity, TimelineDay


def test_timeline_day_accepts_location_field():
    day = TimelineDay(
        id=uuid.uuid4(),
        day_number=1,
        date=None,
        activities=[],
        memories=[],
        location=None,
    )
    assert day.location is None


def test_timeline_activity_accepts_location_detail_field():
    act = TimelineActivity(
        id=uuid.uuid4(),
        title="Visit Eiffel Tower",
        location="Paris",
        scheduled_time=None,
        status="planned",
        location_detail=None,
    )
    assert act.location_detail is None


def test_activity_read_accepts_location_detail_field():
    act = ActivityRead(
        id=uuid.uuid4(),
        day_id=uuid.uuid4(),
        title="Test",
        created_at=datetime.now(),
        updated_at=datetime.now(),
        location_detail=None,
    )
    assert act.location_detail is None
