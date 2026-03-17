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
)
from app.import_trip.generator import (
    describe_activity_from_photos,
    generate_trip_metadata,
)
from app.import_trip.geocoder import reverse_geocode


def _make_thumbnail_bytes(image_bytes, max_size=512):
    """Resize image to max_size px (longest edge) and return JPEG bytes."""
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


def process_trip_import(
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
    Full orchestration of trip import from photos:
    1. Download each image from MinIO, extract EXIF metadata
    2. Cluster photos by date → days
    3. For each day: cluster into activity groups, reverse geocode median GPS
    4. For each activity group: call Vision API to get title/notes
    5. Generate trip metadata (name, destinations, summary)
    6. Persist everything in DB (days, locations, activities, memories)
    7. Move objects in MinIO from imports/ to trips/{trip_id}/...
    8. Set trip.status = 'planned'
    Returns a summary dict.
    """
    endpoint = minio_public_endpoint.rstrip("/")

    # ── Step 1: Download + extract EXIF ──────────────────────────────────────
    photos = []
    for key in object_keys:
        try:
            response = storage_client.get_object(Bucket=bucket, Key=key)
            image_bytes = response["Body"].read()
            meta = extract_photo_metadata(image_bytes)
            photos.append(
                {
                    "object_key": key,
                    "taken_at": meta["taken_at"],
                    "lat": meta["lat"],
                    "lon": meta["lon"],
                    "thumbnail_bytes": _make_thumbnail_bytes(image_bytes),
                }
            )
        except Exception as exc:
            print(f"[import_trip] Failed to download/extract {key}: {exc}")
            photos.append(
                {
                    "object_key": key,
                    "taken_at": None,
                    "lat": None,
                    "lon": None,
                    "thumbnail_bytes": None,
                }
            )

    # ── Step 2: Cluster by date ───────────────────────────────────────────────
    days_map = cluster_by_date(photos)

    # Sort date keys; "unknown" always last
    sorted_dates = sorted(d for d in days_map.keys() if d != "unknown")
    if "unknown" in days_map:
        sorted_dates.append("unknown")

    # ── Steps 3–4: Process each day ───────────────────────────────────────────
    days_data = []

    for day_number, date_str in enumerate(sorted_dates, start=1):
        day_photos = days_map[date_str]
        activity_groups = cluster_into_activities(day_photos)

        # Reverse geocode using median lat/lon of photos that have GPS
        gps_photos = [
            p for p in day_photos if p["lat"] is not None and p["lon"] is not None
        ]
        if gps_photos:
            med_lat = median([p["lat"] for p in gps_photos])
            med_lon = median([p["lon"] for p in gps_photos])
            location = reverse_geocode(med_lat, med_lon)
            time.sleep(1)  # Nominatim usage policy: max 1 req/sec
        else:
            location = {
                "country": "Desconhecido",
                "city": "Desconhecido",
                "region": None,
            }

        # Vision calls: all groups when ≤3 groups; first + last only when >3
        if len(activity_groups) > 3:
            groups_to_describe = {0, len(activity_groups) - 1}
        else:
            groups_to_describe = set(range(len(activity_groups)))

        activities_data = []
        for group_idx, group in enumerate(activity_groups):
            if group_idx in groups_to_describe:
                photo_bytes_list = [
                    p["thumbnail_bytes"] for p in group[:3] if p.get("thumbnail_bytes")
                ]
                desc = describe_activity_from_photos(
                    openai_client, vision_model, photo_bytes_list
                )
                title = (desc.get("title") or "Atividade").strip() or "Atividade"
                notes = desc.get("notes") or None
            else:
                title = "Atividade"
                notes = None

            activities_data.append(
                {
                    "title": title,
                    "notes": notes,
                    "photos": group,
                }
            )

        days_data.append(
            {
                "day_number": day_number,
                "date": date_str if date_str != "unknown" else None,
                "location": location,
                "activities": activities_data,
            }
        )

    # ── Step 5: Generate trip metadata ───────────────────────────────────────
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
                "date": day["date"] or "desconhecida",
                "activities": [a["title"] for a in day["activities"]],
                "location": location_str,
            }
        )

    trip_meta = generate_trip_metadata(openai_client, vision_model, days_summary)

    # ── Steps 6–8: Persist ───────────────────────────────────────────────────
    date_strings = [d["date"] for d in days_data if d["date"] is not None]
    today = date.today().isoformat()
    start_date = min(date_strings) if date_strings else today
    end_date = max(date_strings) if date_strings else today

    days_created = 0
    activities_created = 0
    memories_created = 0

    with psycopg.connect(database_url) as conn:
        conn.autocommit = False

        # Update trip row
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE trips
                SET name = %s,
                    destinations = %s,
                    start_date = %s,
                    end_date = %s,
                    summary = %s,
                    status = 'planned',
                    updated_at = NOW()
                WHERE id = %s
                """,
                (
                    trip_meta.get("name") or "Minha Viagem",
                    trip_meta.get("destinations") or [],
                    start_date,
                    end_date,
                    trip_meta.get("summary") or None,
                    trip_id,
                ),
            )

        for day in days_data:
            day_id = uuid.uuid4()

            # Insert day
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO days (id, trip_id, day_number, date, notes, created_at)
                    VALUES (%s, %s, %s, %s, %s, NOW())
                    """,
                    (day_id, trip_id, day["day_number"], day["date"], None),
                )
            days_created += 1

            # Insert location for day (only when we have real geocoded data)
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

            # Build a human-readable location string for activity.location column
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

                # Move photos from imports/ prefix to structured trips/ path + insert memories
                for photo in activity["photos"]:
                    old_key = photo["object_key"]
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
                            f"[import_trip] Failed to move {old_key} → {new_key}: {exc}; "
                            "keeping original key"
                        )
                        new_key = old_key

                    with conn.cursor() as cur:
                        cur.execute(
                            """
                            INSERT INTO memories (
                                id, trip_id, day_id, activity_id,
                                memory_type, storage_key, taken_at, created_at
                            )
                            VALUES (%s, %s, %s, %s, 'photo', %s, %s, NOW())
                            """,
                            (
                                uuid.uuid4(),
                                trip_id,
                                day_id,
                                activity_id,
                                new_key,
                                photo.get("taken_at"),
                            ),
                        )
                    memories_created += 1

        conn.commit()

    print(
        f"[import_trip] trip={trip_id} done: "
        f"days={days_created} activities={activities_created} memories={memories_created}"
    )

    return {
        "type": "trip_import",
        "days_created": days_created,
        "activities_created": activities_created,
        "memories_created": memories_created,
    }
