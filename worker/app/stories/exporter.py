from __future__ import annotations

import shutil
import uuid
from pathlib import Path
from typing import Any

import psycopg

from app.stories.captions import generate_day_caption
from app.stories.compiler import compile_video, create_zip
from app.stories.renderer import render_slide_png
from app.stories.slides import NoPhotosError, build_slides_data


def process_stories_export(
    trip_id: str,
    story_export_job_id: str,
    database_url: str,
    storage_client: Any,
    bucket: str,
    openai_client: Any,
    openai_model: str,
    minio_public_endpoint: str,
) -> dict[str, str]:
    """
    Full orchestration of stories export:
    1. Fetch trip data from DB
    2. Build slide structure
    3. Generate AI captions per day
    4. Render each slide to PNG via Chromium
    5. Compile PNGs to MP4 via FFmpeg
    6. Zip PNGs
    7. Upload ZIP + MP4 to MinIO
    8. Update story_export_jobs to done

    Always cleans up temp files, even on failure.
    Raises on unrecoverable errors (triggers worker retry/failure logic).
    """
    tmp_dir = Path(f"/tmp/stories/{story_export_job_id}")
    tmp_dir.mkdir(parents=True, exist_ok=True)

    try:
        # 1. Fetch trip
        trip = _fetch_trip(trip_id, database_url, minio_public_endpoint)

        # Mark job as processing (best-effort; don't fail if this errors)
        _update_story_job(
            story_export_job_id=story_export_job_id,
            database_url=database_url,
            status="processing",
        )

        # 2. Build slides (raises NoPhotosError if trip has no photos)
        slides = build_slides_data(trip)

        # 3. Generate captions per day
        day_captions: dict[int, str] = {}
        for day in trip.days:
            caption = generate_day_caption(
                openai_client=openai_client,
                day=day,
                openai_model=openai_model,
            )
            day_captions[day.day_number] = caption

        # Attach captions to cover slides
        for slide in slides:
            if slide.day_caption is None:
                slide.day_caption = day_captions.get(slide.day_number, "")

        # 4. Render PNGs
        png_paths: list[Path] = []
        for i, slide in enumerate(slides):
            png_path = tmp_dir / f"slide_{i:04d}.png"
            render_slide_png(slide, png_path)
            png_paths.append(png_path)

        # 5. Compile MP4
        mp4_path = tmp_dir / "export.mp4"
        compile_video(png_paths, mp4_path, hold_seconds=5)

        # 6. Create ZIP
        zip_path = tmp_dir / "export.zip"
        create_zip(png_paths, zip_path)

        # 7. Upload to MinIO
        zip_key = f"stories/{trip_id}/export.zip"
        mp4_key = f"stories/{trip_id}/export.mp4"
        _upload_to_minio(storage_client, bucket, zip_path, zip_key)
        _upload_to_minio(storage_client, bucket, mp4_path, mp4_key)

        # 8. Mark done
        _update_story_job(
            story_export_job_id=story_export_job_id,
            database_url=database_url,
            status="done",
            zip_object_key=zip_key,
            mp4_object_key=mp4_key,
        )

        return {"status": "done", "zip_key": zip_key, "mp4_key": mp4_key}

    except Exception as e:
        _update_story_job(
            story_export_job_id=story_export_job_id,
            database_url=database_url,
            status="failed",
            error_msg=str(e)[:2000],
        )
        raise

    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


def _fetch_trip(trip_id: str, database_url: str, minio_public_endpoint: str) -> Any:
    """Fetch trip + days + activities + memories from DB, return as nested SimpleNamespace."""
    from types import SimpleNamespace

    endpoint = minio_public_endpoint.rstrip("/")

    with psycopg.connect(database_url) as conn:
        with conn.cursor() as cur:
            # Fetch trip
            cur.execute("SELECT id, name FROM trips WHERE id = %s", (trip_id,))
            row = cur.fetchone()
            if not row:
                raise RuntimeError(f"Trip {trip_id} not found")
            trip = SimpleNamespace(id=row[0], name=row[1], days=[])

            # Fetch days
            cur.execute(
                "SELECT id, day_number, date, notes FROM days WHERE trip_id = %s ORDER BY day_number",
                (trip_id,),
            )
            day_rows = cur.fetchall()

            for day_id, day_number, date, notes in day_rows:
                # Determine city from trip destinations
                cur.execute(
                    "SELECT destinations FROM trips WHERE id = %s", (trip_id,)
                )
                dest_row = cur.fetchone()
                city = (dest_row[0][0] if dest_row and dest_row[0] else "")

                day = SimpleNamespace(
                    id=day_id,
                    day_number=day_number,
                    date=str(date) if date else None,
                    notes=notes,
                    city=city,
                    activities=[],
                    memories=[],
                )

                # Fetch activities
                cur.execute(
                    "SELECT id, title, location, scheduled_time, status FROM activities "
                    "WHERE day_id = %s ORDER BY created_at",
                    (day_id,),
                )
                act_rows = cur.fetchall()

                for act_id, title, location, scheduled_time, act_status in act_rows:
                    activity = SimpleNamespace(
                        id=act_id,
                        title=title,
                        location=location,
                        scheduled_time=str(scheduled_time) if scheduled_time else None,
                        status=act_status,
                        memories=[],
                    )

                    # Fetch memories for this activity
                    cur.execute(
                        "SELECT id, memory_type, storage_key, caption FROM memories "
                        "WHERE activity_id = %s AND memory_type = 'photo'",
                        (act_id,),
                    )
                    mem_rows = cur.fetchall()
                    for mem_id, mem_type, storage_key, caption in mem_rows:
                        bucket_name = "trip-archive"
                        public_url = (
                            f"{endpoint}/{bucket_name}/{storage_key}"
                            if storage_key
                            else None
                        )
                        activity.memories.append(
                            SimpleNamespace(
                                id=mem_id,
                                memory_type=mem_type,
                                storage_key=storage_key,
                                public_url=public_url,
                                caption=caption,
                                activity_id=act_id,
                                day_id=day_id,
                            )
                        )

                    day.activities.append(activity)

                trip.days.append(day)

    return trip


def _upload_to_minio(storage_client: Any, bucket: str, file_path: Path, key: str) -> None:
    with open(file_path, "rb") as f:
        storage_client.put_object(
            Bucket=bucket,
            Key=key,
            Body=f,
            ContentType="application/octet-stream",
        )


def _update_story_job(
    story_export_job_id: str,
    database_url: str,
    status: str,
    zip_object_key: str | None = None,
    mp4_object_key: str | None = None,
    error_msg: str | None = None,
) -> None:
    """Update story_export_jobs row. Best-effort — swallows exceptions."""
    try:
        with psycopg.connect(database_url) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE story_export_jobs
                    SET status = %s,
                        zip_object_key = COALESCE(%s, zip_object_key),
                        mp4_object_key = COALESCE(%s, mp4_object_key),
                        error_msg = %s
                    WHERE id = %s
                    """,
                    (status, zip_object_key, mp4_object_key, error_msg, story_export_job_id),
                )
            conn.commit()
    except Exception:
        pass  # Don't let status update failures crash the job
