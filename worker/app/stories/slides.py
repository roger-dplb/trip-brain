from __future__ import annotations

import enum
from dataclasses import dataclass, field
from typing import Any


class SlideType(str, enum.Enum):
    COVER = "cover"
    ACTIVITY = "activity"
    SUMMARY = "summary"


class NoPhotosError(ValueError):
    """Raised when a trip has no photo memories at all."""


@dataclass
class SlideData:
    slide_type: SlideType
    day_number: int
    day_date: str | None = None
    day_city: str | None = None
    day_caption: str | None = None  # filled later by captions.py
    # For COVER slides
    total_activities: int = 0
    total_photos: int = 0
    # For ACTIVITY slides
    activity_title: str | None = None
    activity_location: str | None = None
    activity_time: str | None = None
    photo_urls: list[str] = field(default_factory=list)  # main photo first
    photo_captions: list[str] = field(default_factory=list)
    # For SUMMARY slides
    activity_titles: list[str] = field(default_factory=list)


def build_slides_data(trip: Any) -> list[SlideData]:
    """
    Build the ordered list of SlideData for a trip.

    Order per day:
      1. COVER slide
      2. One ACTIVITY slide per activity that has >= 1 photo memory
      3. One SUMMARY slide (if any activity has 0 photo memories) — omitted if none

    Raises NoPhotosError if the entire trip has no photo memories.
    """
    # Validate: trip must have at least one photo anywhere
    all_photos = [
        m
        for day in trip.days
        for act in day.activities
        for m in act.memories
        if m.memory_type == "photo"
    ]
    # Also count day-level photos (activity_id=None)
    day_level_photos = [
        m
        for day in trip.days
        for m in getattr(day, "memories", [])
        if m.memory_type == "photo"
    ]
    if not all_photos and not day_level_photos:
        raise NoPhotosError("Trip has no photo memories. Add photos before exporting.")

    slides: list[SlideData] = []

    for day in sorted(trip.days, key=lambda d: d.day_number):
        activities = getattr(day, "activities", [])
        day_memories = getattr(day, "memories", [])

        # Count totals for the cover slide
        day_photos: list[Any] = [
            m for act in activities for m in act.memories if m.memory_type == "photo"
        ] + [m for m in day_memories if m.memory_type == "photo"]

        total_activities = len(activities)
        total_photos = len(day_photos)

        # 1. COVER slide
        slides.append(
            SlideData(
                slide_type=SlideType.COVER,
                day_number=day.day_number,
                day_date=str(day.date) if day.date else None,
                day_city=getattr(day, "city", None),
                total_activities=total_activities,
                total_photos=total_photos,
            )
        )

        # 2. ACTIVITY slides — one per activity with >= 1 photo
        no_photo_activity_titles: list[str] = []
        for act in activities:
            photos = [m for m in act.memories if m.memory_type == "photo"]
            if photos:
                slides.append(
                    SlideData(
                        slide_type=SlideType.ACTIVITY,
                        day_number=day.day_number,
                        day_date=str(day.date) if day.date else None,
                        day_city=getattr(day, "city", None),
                        activity_title=act.title,
                        activity_location=getattr(act, "location", None),
                        activity_time=getattr(act, "scheduled_time", None),
                        photo_urls=[
                            m.public_url
                            for m in photos
                            if getattr(m, "public_url", None)
                        ],
                        photo_captions=[m.caption or "" for m in photos],
                    )
                )
            else:
                no_photo_activity_titles.append(act.title)

        # 3. SUMMARY slide — only if some activities have no photos
        if no_photo_activity_titles:
            slides.append(
                SlideData(
                    slide_type=SlideType.SUMMARY,
                    day_number=day.day_number,
                    day_date=str(day.date) if day.date else None,
                    day_city=getattr(day, "city", None),
                    activity_titles=no_photo_activity_titles,
                )
            )

    return slides
