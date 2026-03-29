import io
import json
import os
import subprocess
import tempfile
from datetime import datetime

from PIL import Image

EXIF_TAG_DATETIME_ORIGINAL = 36867
EXIF_TAG_GPS_INFO = 34853
EXIF_TAG_EXIF_IFD = 34665  # pointer to ExifIFD sub-IFD
EXIF_TAG_DATETIME = 306  # fallback: DateTime in main IFD


def _dms_to_decimal(dms, ref):
    d, m, s = dms
    # each may be IFDRational — convert to float before arithmetic
    decimal = float(d) + float(m) / 60 + float(s) / 3600
    if ref in ("S", "W"):
        decimal = -decimal
    return decimal


def extract_photo_metadata(image_bytes):
    """
    Extract EXIF metadata from image bytes.
    Returns dict with keys: taken_at (datetime|None), lat (float|None), lon (float|None).
    """
    try:
        image = Image.open(io.BytesIO(image_bytes))
        exif_data = image.getexif()
        if not exif_data:
            return {"taken_at": None, "lat": None, "lon": None}

        taken_at = None
        lat = None
        lon = None

        # DateTimeOriginal (tag 36867) — lives in ExifIFD sub-IFD on most cameras
        exif_ifd = exif_data.get_ifd(EXIF_TAG_EXIF_IFD)
        datetime_str = exif_ifd.get(EXIF_TAG_DATETIME_ORIGINAL) if exif_ifd else None
        # Fallback 1: some Pillow versions flatten the ExifIFD into the main dict
        if not datetime_str:
            datetime_str = exif_data.get(EXIF_TAG_DATETIME_ORIGINAL)
        # Fallback 2: DateTime tag 306 (main IFD — may be modification time, but better than nothing)
        if not datetime_str:
            datetime_str = exif_data.get(EXIF_TAG_DATETIME)
        if datetime_str:
            try:
                taken_at = datetime.strptime(
                    str(datetime_str).strip(), "%Y:%m:%d %H:%M:%S"
                )
            except ValueError:
                taken_at = None

        # GPSInfo (tag 34853) — sub-IFD
        gps_ifd = exif_data.get_ifd(EXIF_TAG_GPS_INFO)
        if gps_ifd:
            lat_ref = gps_ifd.get(1)  # GPSLatitudeRef  ('N' or 'S')
            lat_dms = gps_ifd.get(2)  # GPSLatitude     (d, m, s)
            lon_ref = gps_ifd.get(3)  # GPSLongitudeRef ('E' or 'W')
            lon_dms = gps_ifd.get(4)  # GPSLongitude    (d, m, s)

            if lat_dms and lat_ref and lon_dms and lon_ref:
                try:
                    lat = _dms_to_decimal(lat_dms, lat_ref)
                    lon = _dms_to_decimal(lon_dms, lon_ref)
                except Exception:
                    lat = None
                    lon = None

        return {"taken_at": taken_at, "lat": lat, "lon": lon}

    except Exception:
        return {"taken_at": None, "lat": None, "lon": None}


def cluster_by_date(photos):
    """
    Group photo dicts by YYYY-MM-DD from their taken_at field.
    Photos with no taken_at are placed in an 'unknown' bucket.
    Each bucket is sorted by taken_at (None-valued photos last).
    Returns dict[str, list[dict]].
    """
    result = {}

    for photo in photos:
        taken_at = photo.get("taken_at")
        if taken_at is None:
            key = "unknown"
        else:
            key = taken_at.strftime("%Y-%m-%d")

        if key not in result:
            result[key] = []
        result[key].append(photo)

    # Sort each day's photos by taken_at ascending; None values go last
    for key in result:
        result[key].sort(
            key=lambda p: (p.get("taken_at") is None, p.get("taken_at") or datetime.min)
        )

    return result


def cluster_into_activities(day_photos):
    """
    Group day_photos into activity clusters.
    A new group starts when the gap to the previous photo exceeds 2 hours,
    or when the current group has reached 4 photos.
    Returns list[list[dict]].
    """
    if not day_photos:
        return []

    TWO_HOURS_SECONDS = 2 * 3600

    groups = []
    current_group = []

    for photo in day_photos:
        if not current_group:
            current_group.append(photo)
            continue

        last_time = current_group[-1].get("taken_at")
        curr_time = photo.get("taken_at")

        # If either timestamp is missing, keep grouping until the 4-photo cap
        if last_time is None or curr_time is None:
            if len(current_group) < 4:
                current_group.append(photo)
            else:
                groups.append(current_group)
                current_group = [photo]
            continue

        gap_seconds = (curr_time - last_time).total_seconds()

        if gap_seconds > TWO_HOURS_SECONDS or len(current_group) >= 4:
            groups.append(current_group)
            current_group = [photo]
        else:
            current_group.append(photo)

    if current_group:
        groups.append(current_group)

    return groups


def extract_video_metadata(video_bytes):
    """
    Extract creation date and duration from video bytes using ffprobe.
    Writes bytes to a temp file, runs ffprobe, parses JSON output.
    Returns dict with keys: taken_at (datetime|None), duration_seconds (float|None).
    On any failure, returns {"taken_at": None, "duration_seconds": None}.
    """
    try:
        suffix = ".mp4"
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(video_bytes)
            tmp_path = tmp.name

        try:
            result = subprocess.run(
                [
                    "ffprobe",
                    "-v",
                    "quiet",
                    "-print_format",
                    "json",
                    "-show_streams",
                    "-show_format",
                    tmp_path,
                ],
                capture_output=True,
                text=True,
                timeout=30,
            )
        finally:
            os.unlink(tmp_path)

        if result.returncode != 0:
            return {"taken_at": None, "duration_seconds": None}

        data = json.loads(result.stdout)

        # Duration from first stream
        duration_seconds = None
        for stream in data.get("streams", []):
            raw_duration = stream.get("duration")
            if raw_duration is not None:
                try:
                    duration_seconds = float(raw_duration)
                    break
                except (ValueError, TypeError):
                    pass

        # Creation time from format tags
        taken_at = None
        tags = data.get("format", {}).get("tags", {})
        creation_time_str = tags.get("creation_time")
        if creation_time_str:
            for fmt in (
                "%Y-%m-%dT%H:%M:%S.%fZ",
                "%Y-%m-%dT%H:%M:%SZ",
                "%Y-%m-%d %H:%M:%S",
            ):
                try:
                    taken_at = datetime.strptime(creation_time_str, fmt)
                    break
                except ValueError:
                    continue

        return {"taken_at": taken_at, "duration_seconds": duration_seconds}

    except Exception:
        return {"taken_at": None, "duration_seconds": None}
