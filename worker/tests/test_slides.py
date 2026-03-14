"""
Unit tests for build_slides_data() from worker.app.stories.slides.
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "app"))

from types import SimpleNamespace

import pytest
from stories.slides import NoPhotosError, SlideType, build_slides_data


def _make_photo_memory(activity_id=None, day_id=None):
    return SimpleNamespace(
        memory_type="photo",
        activity_id=activity_id,
        day_id=day_id,
        storage_key="trips/x/photo.jpg",
        public_url="http://minio/trip-archive/trips/x/photo.jpg",
        caption="nice view",
    )


def _make_note_memory(activity_id=None):
    return SimpleNamespace(
        memory_type="note",
        activity_id=activity_id,
        day_id=None,
        storage_key=None,
        public_url=None,
        caption=None,
    )


def _make_activity(
    activity_id, title="Visit", location="Kyoto", scheduled_time="09:00", memories=None
):
    return SimpleNamespace(
        id=activity_id,
        title=title,
        location=location,
        scheduled_time=scheduled_time,
        status="done",
        memories=memories or [],
    )


def _make_day(
    day_number=1, city="Kyoto", date="2027-03-10", activities=None, memories=None
):
    return SimpleNamespace(
        day_number=day_number,
        date=date,
        notes=None,
        city=city,
        activities=activities or [],
        memories=memories or [],
    )


def _make_trip(days):
    return SimpleNamespace(name="Japão 2027", days=days)


def test_empty_trip_raises():
    """Trip with no photos at all should raise NoPhotosError."""
    act = _make_activity("a1", memories=[_make_note_memory("a1")])
    day = _make_day(activities=[act])
    trip = _make_trip([day])

    with pytest.raises(NoPhotosError):
        build_slides_data(trip)


def test_day_with_no_activities_generates_only_cover():
    """A day with no activities should produce exactly one cover slide."""
    act_with_photo = _make_activity("a2", memories=[_make_photo_memory("a2")])
    day_no_acts = _make_day(day_number=1, city="Tokyo", activities=[])
    day_with_photo = _make_day(day_number=2, city="Kyoto", activities=[act_with_photo])
    trip = _make_trip([day_no_acts, day_with_photo])

    slides = build_slides_data(trip)
    cover_slides = [
        s for s in slides if s.slide_type == SlideType.COVER and s.day_number == 1
    ]
    assert len(cover_slides) == 1

    activity_slides_day1 = [
        s for s in slides if s.slide_type == SlideType.ACTIVITY and s.day_number == 1
    ]
    assert len(activity_slides_day1) == 0


def test_activity_with_photo_generates_activity_slide():
    """An activity with a photo should produce one ACTIVITY slide."""
    act = _make_activity("a1", memories=[_make_photo_memory("a1")])
    day = _make_day(activities=[act])
    trip = _make_trip([day])

    slides = build_slides_data(trip)
    activity_slides = [s for s in slides if s.slide_type == SlideType.ACTIVITY]
    assert len(activity_slides) == 1
    assert activity_slides[0].activity_title == "Visit"


def test_activities_without_photos_generate_summary_slide():
    """Activities without photos should appear in a SUMMARY slide."""
    act_photo = _make_activity(
        "a1", title="Fushimi", memories=[_make_photo_memory("a1")]
    )
    act_no_photo = _make_activity("a2", title="Check-in", memories=[])
    day = _make_day(activities=[act_photo, act_no_photo])
    trip = _make_trip([day])

    slides = build_slides_data(trip)
    summary_slides = [s for s in slides if s.slide_type == SlideType.SUMMARY]
    assert len(summary_slides) == 1
    assert any("Check-in" in t for t in summary_slides[0].activity_titles)


def test_day_with_only_photoless_activities_has_no_activity_slides():
    """A day where NO activity has photos should have cover + summary but no ACTIVITY slides."""
    act = _make_activity("a1", title="Check-in", memories=[_make_note_memory("a1")])
    act2 = _make_activity("b1", title="Museum", memories=[_make_photo_memory("b1")])
    day1 = _make_day(day_number=1, activities=[act])
    day2 = _make_day(day_number=2, activities=[act2])
    trip = _make_trip([day1, day2])

    slides = build_slides_data(trip)
    activity_slides_day1 = [
        s for s in slides if s.slide_type == SlideType.ACTIVITY and s.day_number == 1
    ]
    assert len(activity_slides_day1) == 0

    summary_slides_day1 = [
        s for s in slides if s.slide_type == SlideType.SUMMARY and s.day_number == 1
    ]
    assert len(summary_slides_day1) == 1


def test_no_summary_slide_when_all_activities_have_photos():
    """When every activity has a photo, no SUMMARY slide should be generated."""
    act1 = _make_activity("a1", memories=[_make_photo_memory("a1")])
    act2 = _make_activity("a2", memories=[_make_photo_memory("a2")])
    day = _make_day(activities=[act1, act2])
    trip = _make_trip([day])

    slides = build_slides_data(trip)
    summary_slides = [s for s in slides if s.slide_type == SlideType.SUMMARY]
    assert len(summary_slides) == 0
