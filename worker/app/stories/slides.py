from __future__ import annotations

import enum
from dataclasses import dataclass, field
from typing import Any


class SlideType(str, enum.Enum):
    TRIP_COVER = "trip_cover"
    COVER = "cover"
    ACTIVITY = "activity"
    MEDIA = "media"
    SUMMARY = "summary"


class NoPhotosError(ValueError):
    """Raised when a trip has no photo memories at all."""


@dataclass
class SlideData:
    slide_type: SlideType
    day_number: int = 0
    day_date: str | None = None
    day_city: str | None = None
    day_country: str | None = None
    # For TRIP_COVER slides
    trip_name: str | None = None
    trip_cover_url: str | None = None
    # For COVER slides
    total_activities: int = 0
    total_photos: int = 0
    hero_photo_url: str | None = None
    # For ACTIVITY slides
    activity_title: str | None = None
    activity_location: str | None = None
    activity_time: str | None = None
    photo_urls: list[str] = field(default_factory=list)
    photo_captions: list[str] = field(default_factory=list)
    # For MEDIA slides
    media_url: str | None = None
    media_caption: str | None = None
    media_type: str = "photo"  # "photo" or "video"
    # For SUMMARY slides
    activity_titles: list[str] = field(default_factory=list)


def build_slides_data(trip: Any) -> list[SlideData]:
    """
    Build the ordered list of SlideData matching the frontend StoryViewer.

    Order:
      0. TRIP_COVER slide (one for entire trip)
      Per day:
        1. COVER slide (hero = first photo of day)
        2. One ACTIVITY slide per photo (skip hero photo)
        3. MEDIA slides for unlinked photos/videos (skip hero photo)
        4. SUMMARY slide if any activities have no photos

    Raises NoPhotosError if the entire trip has no photo memories.
    """
    all_photos = [
        m
        for day in trip.days
        for act in getattr(day, "activities", [])
        for m in act.memories
        if m.memory_type == "photo"
    ] + [
        m
        for day in trip.days
        for m in getattr(day, "memories", [])
        if m.memory_type == "photo"
    ]
    if not all_photos:
        raise NoPhotosError("Trip has no photo memories. Add photos before exporting.")

    slides: list[SlideData] = []

    # Trip-level cover
    slides.append(
        SlideData(
            slide_type=SlideType.TRIP_COVER,
            trip_name=getattr(trip, "name", ""),
            trip_cover_url=getattr(trip, "cover_image_url", None),
        )
    )

    for day in sorted(trip.days, key=lambda d: d.day_number):
        activities = getattr(day, "activities", [])
        day_memories = getattr(day, "memories", [])

        day_city = getattr(day, "city", None)
        day_country = getattr(day, "country", None)
        day_date = str(day.date) if day.date else None

        # All photos for this day (activity + unlinked)
        all_day_photos: list[Any] = [
            m for act in activities for m in act.memories if m.memory_type == "photo"
        ] + [m for m in day_memories if m.memory_type == "photo"]

        # Hero photo = first photo of the day
        hero = next((m for m in all_day_photos if getattr(m, "public_url", None)), None)
        hero_id = getattr(hero, "id", None)

        # 1. COVER slide
        slides.append(
            SlideData(
                slide_type=SlideType.COVER,
                day_number=day.day_number,
                day_date=day_date,
                day_city=day_city,
                day_country=day_country,
                total_activities=len(activities),
                total_photos=len(all_day_photos),
                hero_photo_url=hero.public_url if hero else None,
            )
        )

        # 2. ACTIVITY slides — one per photo, skip hero
        no_photo_activity_titles: list[str] = []
        for act in activities:
            act_photos = [
                m
                for m in act.memories
                if m.memory_type == "photo"
                and getattr(m, "public_url", None)
                and m.id != hero_id
            ]
            all_act_photos = [m for m in act.memories if m.memory_type == "photo"]
            if act_photos:
                for photo in act_photos:
                    slides.append(
                        SlideData(
                            slide_type=SlideType.ACTIVITY,
                            day_number=day.day_number,
                            day_date=day_date,
                            day_city=day_city,
                            activity_title=act.title,
                            activity_location=getattr(act, "location", None),
                            activity_time=getattr(act, "scheduled_time", None),
                            photo_urls=[photo.public_url],
                            photo_captions=[photo.caption or ""],
                        )
                    )
            elif not all_act_photos:
                no_photo_activity_titles.append(act.title)
            # activity only had the hero photo — skip summary too

        # 3. MEDIA slides — unlinked memories, skip hero
        for mem in day_memories:
            if mem.id == hero_id:
                continue
            if not getattr(mem, "public_url", None):
                continue
            slides.append(
                SlideData(
                    slide_type=SlideType.MEDIA,
                    day_number=day.day_number,
                    day_date=day_date,
                    day_city=day_city,
                    media_url=mem.public_url,
                    media_caption=getattr(mem, "caption", None),
                    media_type=mem.memory_type,
                )
            )

        # 4. SUMMARY slide
        if no_photo_activity_titles:
            slides.append(
                SlideData(
                    slide_type=SlideType.SUMMARY,
                    day_number=day.day_number,
                    day_date=day_date,
                    day_city=day_city,
                    activity_titles=no_photo_activity_titles,
                )
            )

    return slides
