# worker/app/add_media/processor.py
import io
import os
import time
import uuid
from datetime import date
from statistics import median

import psycopg
from PIL import Image, ImageOps

from app.import_trip.extractor import (
    cluster_by_date,
    cluster_into_activities,
    extract_photo_metadata,
    extract_video_metadata,
)
from app.import_trip.generator import (
    describe_activity_from_photos,
    generate_trip_metadata,
)
from app.import_trip.geocoder import reverse_geocode


_VIDEO_EXTENSIONS = frozenset({".mp4", ".mov", ".avi", ".mkv", ".m4v", ".3gp"})


def _make_thumbnail_bytes(image_bytes, max_size=512):
    try:
        img = Image.open(io.BytesIO(image_bytes))
        img = ImageOps.exif_transpose(img)
        img = img.convert("RGB")
        img.thumbnail((max_size, max_size))
        out = io.BytesIO()
        img.save(out, format="JPEG", quality=75)
        return out.getvalue()
    except Exception:
        return image_bytes


def _renumber_days(days):
    """
    Given a list of dicts {id, date, day_number}, return the same list sorted
    by date ascending (None/unknown last) with day_number reassigned from 1.
    """
    dated = sorted(
        [d for d in days if d["date"] is not None],
        key=lambda d: d["date"],
    )
    undated = [d for d in days if d["date"] is None]
    ordered = dated + undated
    for i, d in enumerate(ordered, start=1):
        d["day_number"] = i
    return ordered


def _find_or_create_day(conn, trip_id, date_str):
    """
    Look up an existing day for (trip_id, date_str).
    Returns the day_id (UUID). If not found, inserts a new day and renumbers
    all days of the trip by date.
    """
    parsed_date = date.fromisoformat(date_str) if date_str != "unknown" else None

    # Check if day already exists
    with conn.cursor() as cur:
        cur.execute(
            "SELECT id, day_number FROM days WHERE trip_id = %s AND date = %s LIMIT 1",
            (trip_id, parsed_date),
        )
        existing = cur.fetchone()

    if existing:
        return existing[0]

    # Fetch all existing days to determine new day_number after insertion
    with conn.cursor() as cur:
        cur.execute(
            "SELECT id, date, day_number FROM days WHERE trip_id = %s ORDER BY day_number",
            (trip_id,),
        )
        all_days = [
            {"id": row[0], "date": row[1], "day_number": row[2]}
            for row in cur.fetchall()
        ]

    new_day_id = uuid.uuid4()
    # Temporarily assign day_number 0; renumber will fix it
    all_days.append({"id": new_day_id, "date": parsed_date, "day_number": 0})
    renumbered = _renumber_days(all_days)

    # Find the number assigned to the new day
    new_day_number = next(d["day_number"] for d in renumbered if d["id"] == new_day_id)

    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO days (id, trip_id, day_number, date, notes, created_at)
            VALUES (%s, %s, %s, %s, NULL, NOW())
            """,
            (new_day_id, trip_id, new_day_number, parsed_date),
        )
        # Update day_number for all existing days
        for d in renumbered:
            if d["id"] != new_day_id:
                cur.execute(
                    "UPDATE days SET day_number = %s WHERE id = %s",
                    (d["day_number"], d["id"]),
                )

    return new_day_id


def process_trip_media_add(
    trip_id,
    object_keys,
    database_url,
    storage_client,
    bucket,
    openai_client,
    vision_model,
    minio_public_endpoint,
):
    """
    Add new photos/videos to an existing trip.
    1. Download + extract metadata (EXIF for photos, ffprobe for videos)
    2. Cluster by date → days
    3. For each date: merge into existing day or create a new one
    4. Geocode, Vision API, persist activities + memories
    5. Selectively update trip metadata (start_date, end_date, destinations, summary)
    """
    _ = minio_public_endpoint.rstrip("/")

    # ── Step 1: Download + extract metadata ──────────────────────────────────
    media_items = []
    for key in object_keys:
        try:
            response = storage_client.get_object(Bucket=bucket, Key=key)
            file_bytes = response["Body"].read()
            ext = os.path.splitext(key)[1].lower()
            is_video = ext in _VIDEO_EXTENSIONS
            if is_video:
                meta = extract_video_metadata(file_bytes, file_ext=ext)
                media_items.append(
                    {
                        "object_key": key,
                        "taken_at": meta["taken_at"],
                        "lat": meta.get("lat"),
                        "lon": meta.get("lon"),
                        "thumbnail_bytes": None,
                        "memory_type": "video",
                    }
                )
            else:
                meta = extract_photo_metadata(file_bytes)
                media_items.append(
                    {
                        "object_key": key,
                        "taken_at": meta["taken_at"],
                        "lat": meta["lat"],
                        "lon": meta["lon"],
                        "thumbnail_bytes": _make_thumbnail_bytes(file_bytes),
                        "memory_type": "photo",
                    }
                )
        except Exception as exc:
            print(f"[add_media] Failed to download/extract {key}: {exc}")
            media_items.append(
                {
                    "object_key": key,
                    "taken_at": None,
                    "lat": None,
                    "lon": None,
                    "thumbnail_bytes": None,
                    "memory_type": "photo",
                }
            )

    # ── Step 2: Cluster by date ───────────────────────────────────────────────
    days_map = cluster_by_date(media_items)

    sorted_dates = sorted(d for d in days_map.keys() if d != "unknown")
    if "unknown" in days_map:
        sorted_dates.append("unknown")

    # ── Steps 3–4: Process each date group ───────────────────────────────────
    days_data = []

    for date_str in sorted_dates:
        day_media = days_map[date_str]
        # Only photos are used for activity clustering and Vision
        photos_only = [m for m in day_media if m["memory_type"] == "photo"]
        videos = [m for m in day_media if m["memory_type"] == "video"]
        activity_groups = cluster_into_activities(photos_only) if photos_only else [[]]

        gps_photos = [
            p for p in day_media if p["lat"] is not None and p["lon"] is not None
        ]
        if gps_photos:
            med_lat = median([p["lat"] for p in gps_photos])
            med_lon = median([p["lon"] for p in gps_photos])
            location = reverse_geocode(med_lat, med_lon)
            time.sleep(1)
        else:
            location = {
                "country": "Desconhecido",
                "city": "Desconhecido",
                "region": None,
            }

        if len(activity_groups) > 3:
            groups_to_describe = {0, len(activity_groups) - 1}
        else:
            groups_to_describe = set(range(len(activity_groups)))

        activities_data = []
        for group_idx, group in enumerate(activity_groups):
            if not group:
                continue
            if group_idx in groups_to_describe:
                photo_bytes_list = [
                    p["thumbnail_bytes"]
                    for p in group[:3]
                    if p.get("thumbnail_bytes") and p["memory_type"] == "photo"
                ]
                if photo_bytes_list:
                    desc = describe_activity_from_photos(
                        openai_client, vision_model, photo_bytes_list
                    )
                    title = (desc.get("title") or "Atividade").strip() or "Atividade"
                    notes = desc.get("notes") or None
                else:
                    title = "Atividade"
                    notes = None
            else:
                title = "Atividade"
                notes = None

            activities_data.append({"title": title, "notes": notes, "media": group})

        days_data.append(
            {
                "date_str": date_str,
                "location": location,
                "activities": activities_data,
                "videos": videos,
            }
        )

    # ── Step 5: Persist ───────────────────────────────────────────────────────
    activities_created = 0
    memories_created = 0

    with psycopg.connect(database_url) as conn:
        conn.autocommit = False

        for day in days_data:
            date_str = day["date_str"]
            day_id = _find_or_create_day(conn, trip_id, date_str)

            # Upsert location for day
            loc = day["location"]
            if loc["country"] != "Desconhecido":
                loc_id = uuid.uuid4()
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        INSERT INTO locations (id, trip_id, country, city, region, place_name, created_at)
                        VALUES (%s, %s, %s, %s, %s, %s, NOW())
                        """,
                        (
                            loc_id,
                            trip_id,
                            loc["country"],
                            loc["city"],
                            loc.get("region"),
                            None,
                        ),
                    )
                    cur.execute(
                        "UPDATE days SET location_id = %s WHERE id = %s",
                        (loc_id, day_id),
                    )

            loc_text = (
                f"{loc['city']}, {loc['country']}"
                if loc["city"] != "Desconhecido"
                else None
            )

            for activity in day["activities"]:
                activity_id = uuid.uuid4()
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        INSERT INTO activities (id, day_id, title, location, notes, status, created_at, updated_at)
                        VALUES (%s, %s, %s, %s, %s, 'planned', NOW(), NOW())
                        """,
                        (
                            activity_id,
                            day_id,
                            activity["title"],
                            loc_text,
                            activity["notes"],
                        ),
                    )
                activities_created += 1

                for item in activity["media"]:
                    old_key = item["object_key"]
                    ext = os.path.splitext(old_key)[1] or ".jpg"
                    new_key = (
                        f"trips/{trip_id}/days/{day_id}"
                        f"/activities/{activity_id}/{uuid.uuid4()}{ext}"
                    )
                    try:
                        storage_client.copy_object(
                            Bucket=bucket,
                            CopySource={"Bucket": bucket, "Key": old_key},
                            Key=new_key,
                        )
                        storage_client.delete_object(Bucket=bucket, Key=old_key)
                    except Exception as exc:
                        print(
                            f"[add_media] Failed to move {old_key} → {new_key}: {exc}"
                        )
                        new_key = old_key

                    with conn.cursor() as cur:
                        cur.execute(
                            """
                            INSERT INTO memories (
                                id, trip_id, day_id, activity_id,
                                memory_type, storage_key, taken_at, created_at
                            )
                            VALUES (%s, %s, %s, %s, %s, %s, %s, NOW())
                            """,
                            (
                                uuid.uuid4(),
                                trip_id,
                                day_id,
                                activity_id,
                                item["memory_type"],
                                new_key,
                                item.get("taken_at"),
                            ),
                        )
                    memories_created += 1

            # Persist videos as day-level memories (no activity)
            for video in day.get("videos", []):
                old_key = video["object_key"]
                ext = os.path.splitext(old_key)[1] or ".mov"
                new_key = (
                    f"trips/{trip_id}/days/{day_id}"
                    f"/{uuid.uuid4()}{ext}"
                )
                try:
                    storage_client.copy_object(
                        Bucket=bucket,
                        CopySource={"Bucket": bucket, "Key": old_key},
                        Key=new_key,
                    )
                    storage_client.delete_object(Bucket=bucket, Key=old_key)
                except Exception as exc:
                    print(f"[add_media] Failed to move video {old_key} → {new_key}: {exc}")
                    new_key = old_key

                with conn.cursor() as cur:
                    cur.execute(
                        """
                        INSERT INTO memories (
                            id, trip_id, day_id, activity_id,
                            memory_type, storage_key, taken_at, created_at
                        )
                        VALUES (%s, %s, %s, NULL, 'video', %s, %s, NOW())
                        """,
                        (
                            uuid.uuid4(),
                            trip_id,
                            day_id,
                            new_key,
                            video.get("taken_at"),
                        ),
                    )
                memories_created += 1

        # ── Selective trip metadata update ────────────────────────────────────
        with conn.cursor() as cur:
            cur.execute(
                "SELECT start_date, end_date, destinations, name FROM trips WHERE id = %s",
                (trip_id,),
            )
            row = cur.fetchone()

        if row:
            current_start, current_end, current_destinations, current_name = row

            with conn.cursor() as cur:
                cur.execute(
                    "SELECT date FROM days WHERE trip_id = %s AND date IS NOT NULL ORDER BY date",
                    (trip_id,),
                )
                all_dates = [r[0] for r in cur.fetchall()]

            new_start = (
                min(all_dates).isoformat() if all_dates else current_start.isoformat()
            )
            new_end = (
                max(all_dates).isoformat() if all_dates else current_end.isoformat()
            )

            days_summary = []
            for day in days_data:
                loc = day["location"]
                location_str = (
                    f"{loc['city']}, {loc['country']}"
                    if loc["city"] != "Desconhecido"
                    else "Localização desconhecida"
                )
                days_summary.append(
                    {
                        "date": day["date_str"]
                        if day["date_str"] != "unknown"
                        else "desconhecida",
                        "activities": [a["title"] for a in day["activities"]],
                        "location": location_str,
                    }
                )

            new_meta = generate_trip_metadata(openai_client, vision_model, days_summary)
            new_destinations = list(
                set((current_destinations or []) + (new_meta.get("destinations") or []))
            )

            updates = {}
            if new_start != current_start.isoformat():
                updates["start_date"] = new_start
            if new_end != current_end.isoformat():
                updates["end_date"] = new_end
            if set(new_destinations) != set(current_destinations or []):
                updates["destinations"] = new_destinations
            if new_meta.get("summary"):
                updates["summary"] = new_meta["summary"]

            if updates:
                set_clause = ", ".join(f"{k} = %s" for k in updates)
                values = list(updates.values()) + [trip_id]
                with conn.cursor() as cur:
                    cur.execute(
                        f"UPDATE trips SET {set_clause}, updated_at = NOW() WHERE id = %s",
                        values,
                    )

        conn.commit()

    print(
        f"[add_media] trip={trip_id} done: "
        f"activities={activities_created} memories={memories_created}"
    )
    return {
        "type": "trip_media_add",
        "activities_created": activities_created,
        "memories_created": memories_created,
    }
