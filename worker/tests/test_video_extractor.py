import json
from datetime import datetime
from unittest.mock import MagicMock, patch

import pytest

from app.import_trip.extractor import extract_video_metadata


def _make_ffprobe_output(
    creation_time: str | None,
    duration: str | None,
    location: str | None = None,
) -> str:
    streams = []
    if duration is not None:
        streams = [{"duration": duration}]
    tags = {}
    if creation_time is not None:
        tags["creation_time"] = creation_time
    if location is not None:
        tags["location"] = location
    return json.dumps({
        "streams": streams,
        "format": {"tags": tags},
    })


def test_extract_video_metadata_returns_datetime_and_duration():
    ffprobe_json = _make_ffprobe_output("2024-08-15T10:30:00.000000Z", "125.5")
    with patch("subprocess.run") as mock_run:
        mock_run.return_value = MagicMock(
            returncode=0, stdout=ffprobe_json, stderr=""
        )
        result = extract_video_metadata(b"fake_video_bytes")

    assert result["taken_at"] == datetime(2024, 8, 15, 10, 30, 0)
    assert result["duration_seconds"] == 125.5
    assert result["lat"] is None
    assert result["lon"] is None


def test_extract_video_metadata_returns_none_when_no_tags():
    ffprobe_json = _make_ffprobe_output(None, "60.0")
    with patch("subprocess.run") as mock_run:
        mock_run.return_value = MagicMock(
            returncode=0, stdout=ffprobe_json, stderr=""
        )
        result = extract_video_metadata(b"fake_video_bytes")

    assert result["taken_at"] is None
    assert result["duration_seconds"] == 60.0
    assert result["lat"] is None
    assert result["lon"] is None


def test_extract_video_metadata_returns_none_on_ffprobe_failure():
    with patch("subprocess.run", side_effect=FileNotFoundError("ffprobe not found")):
        result = extract_video_metadata(b"fake_video_bytes")

    assert result == {"taken_at": None, "duration_seconds": None, "lat": None, "lon": None}


def test_extract_video_metadata_returns_none_on_bad_json():
    with patch("subprocess.run") as mock_run:
        mock_run.return_value = MagicMock(returncode=0, stdout="not json", stderr="")
        result = extract_video_metadata(b"fake_video_bytes")

    assert result == {"taken_at": None, "duration_seconds": None, "lat": None, "lon": None}


def test_extract_video_metadata_parses_iphone_gps_location():
    ffprobe_json = _make_ffprobe_output(
        "2024-08-15T10:30:00.000000Z", "30.0", location="+48.8566+002.3522/"
    )
    with patch("subprocess.run") as mock_run:
        mock_run.return_value = MagicMock(returncode=0, stdout=ffprobe_json, stderr="")
        result = extract_video_metadata(b"fake_video_bytes")

    assert result["lat"] == pytest.approx(48.8566)
    assert result["lon"] == pytest.approx(2.3522)


def test_extract_video_metadata_parses_negative_gps_location():
    ffprobe_json = _make_ffprobe_output(
        "2024-08-15T10:30:00.000000Z", "30.0", location="-23.5505-046.6333/"
    )
    with patch("subprocess.run") as mock_run:
        mock_run.return_value = MagicMock(returncode=0, stdout=ffprobe_json, stderr="")
        result = extract_video_metadata(b"fake_video_bytes")

    assert result["lat"] == pytest.approx(-23.5505)
    assert result["lon"] == pytest.approx(-46.6333)


def test_extract_video_metadata_gps_none_when_no_location_tag():
    ffprobe_json = _make_ffprobe_output("2024-08-15T10:30:00.000000Z", "30.0")
    with patch("subprocess.run") as mock_run:
        mock_run.return_value = MagicMock(returncode=0, stdout=ffprobe_json, stderr="")
        result = extract_video_metadata(b"fake_video_bytes")

    assert result["lat"] is None
    assert result["lon"] is None
