"""
Unit tests for the stories export orchestrator.
Tests use mocks for external services (DB, MinIO, Chromium, FFmpeg).
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "app"))

import uuid
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest


def _make_trip():
    act = SimpleNamespace(
        id=uuid.uuid4(),
        title="Fushimi",
        location="Kyoto",
        scheduled_time="09:00",
        status="done",
        memories=[
            SimpleNamespace(
                memory_type="photo",
                activity_id=None,
                day_id=None,
                storage_key="k.jpg",
                public_url="http://minio/k.jpg",
                caption="nice",
            )
        ],
    )
    day = SimpleNamespace(
        day_number=1,
        date="2027-03-10",
        city="Kyoto",
        notes=None,
        activities=[act],
        memories=[],
    )
    return SimpleNamespace(id=uuid.uuid4(), name="Japão 2027", days=[day])


def test_happy_path_calls_all_steps():
    trip = _make_trip()
    trip_id = str(trip.id)
    job_id = str(uuid.uuid4())

    with (
        patch("stories.exporter.psycopg"),
        patch("stories.exporter.build_slides_data") as mock_build,
        patch("stories.exporter.generate_day_caption", return_value="Dia incrível"),
        patch("stories.exporter.render_slide_png"),
        patch("stories.exporter.compile_video"),
        patch("stories.exporter.create_zip"),
        patch("stories.exporter._upload_to_minio"),
        patch("stories.exporter._update_story_job"),
        patch("stories.exporter._fetch_trip") as mock_fetch,
        patch("stories.exporter.shutil"),
    ):
        mock_fetch.return_value = trip
        from stories.slides import SlideData, SlideType

        mock_build.return_value = [
            SlideData(slide_type=SlideType.COVER, day_number=1, day_city="Kyoto")
        ]

        from stories.exporter import process_stories_export

        process_stories_export(
            trip_id=trip_id,
            story_export_job_id=job_id,
            database_url="postgresql://test",
            storage_client=MagicMock(),
            bucket="test-bucket",
            openai_client=MagicMock(),
            openai_model="gpt-4o-mini",
            minio_public_endpoint="http://minio:9000",
        )

        mock_build.assert_called_once()


def test_cleanup_called_even_on_failure():
    trip = _make_trip()

    with (
        patch("stories.exporter._fetch_trip", side_effect=RuntimeError("DB down")),
        patch("stories.exporter._update_story_job"),
        patch("stories.exporter.shutil") as mock_shutil,
    ):
        from stories.exporter import process_stories_export

        with pytest.raises(RuntimeError):
            process_stories_export(
                trip_id=str(trip.id),
                story_export_job_id=str(uuid.uuid4()),
                database_url="postgresql://test",
                storage_client=MagicMock(),
                bucket="test-bucket",
                openai_client=MagicMock(),
                openai_model="gpt-4o-mini",
                minio_public_endpoint="http://minio:9000",
            )

        mock_shutil.rmtree.assert_called_once()
