import hashlib
import io
import json
import os
import time
import uuid
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse

import boto3
import psycopg
from openai import OpenAI
from PIL import Image, ImageDraw, ImageOps

JOB_TYPE_EMBEDDING = "embedding_generation"
JOB_TYPE_THUMBNAIL = "thumbnail_generation"
JOB_TYPE_ITINERARY = "itinerary_generation"
JOB_TYPE_STORIES_EXPORT = "stories_export"
JOB_TYPE_TRIP_IMPORT = "trip_import"
JOB_TYPE_TRIP_MEDIA_ADD = "trip_media_add"


def _ensure_production_secure_settings() -> None:
    app_env = os.getenv("APP_ENV", "development").lower()
    if app_env not in {"production", "prod"}:
        return

    insecure_tokens = {
        "minioadmin",
        "trip_pass",
        "changeme",
        "change-me",
        "password",
        "123456",
        "admin",
    }

    insecure_keys: list[str] = []

    minio_access_key = os.getenv("MINIO_ACCESS_KEY", "").strip().lower()
    if not minio_access_key or minio_access_key in insecure_tokens:
        insecure_keys.append("MINIO_ACCESS_KEY")

    minio_secret_key = os.getenv("MINIO_SECRET_KEY", "").strip().lower()
    if not minio_secret_key or minio_secret_key in insecure_tokens:
        insecure_keys.append("MINIO_SECRET_KEY")

    database_url = os.getenv("DATABASE_URL", "")
    parsed = urlparse(_normalize_database_url(database_url))
    db_password = (parsed.password or "").strip().lower()
    if not db_password or db_password in insecure_tokens:
        insecure_keys.append("DATABASE_URL")

    if insecure_keys:
        raise RuntimeError(
            "Insecure sensitive settings for production in worker: "
            + ", ".join(insecure_keys)
        )


def run() -> None:
    _ensure_production_secure_settings()

    interval = int(os.getenv("WORKER_POLL_INTERVAL", "15"))
    enqueue_batch_size = int(os.getenv("WORKER_ENQUEUE_BATCH_SIZE", "50"))
    consume_batch_size = int(os.getenv("WORKER_CONSUME_BATCH_SIZE", "25"))
    max_retries = int(os.getenv("WORKER_JOB_MAX_RETRIES", "3"))
    backoff_base_seconds = int(os.getenv("WORKER_JOB_BACKOFF_BASE_SECONDS", "3"))
    database_url = _normalize_database_url(os.getenv("DATABASE_URL", ""))

    if not database_url:
        raise RuntimeError("DATABASE_URL is required for worker execution")

    openai_api_key = os.getenv("OPENAI_API_KEY", "")
    if not openai_api_key:
        raise RuntimeError("OPENAI_API_KEY is required for embedding generation")
    openai_embedding_model = os.getenv(
        "OPENAI_EMBEDDING_MODEL", "text-embedding-3-small"
    )
    caption_model = os.getenv("CAPTION_MODEL", "gpt-4.1-mini")
    import_model = os.getenv("IMPORT_VISION_MODEL", "gpt-4o")
    openai_client = OpenAI(api_key=openai_api_key)

    storage_client, bucket = _build_storage_client()

    _log(
        "worker_started",
        poll_interval_seconds=interval,
        enqueue_batch_size=enqueue_batch_size,
        consume_batch_size=consume_batch_size,
        max_retries=max_retries,
        embedding_model=openai_embedding_model,
    )

    with psycopg.connect(database_url) as bootstrap_connection:
        _ensure_worker_jobs_table(bootstrap_connection)
        bootstrap_connection.commit()

    while True:
        with psycopg.connect(database_url) as connection:
            enqueued = _enqueue_jobs(
                connection=connection,
                limit=enqueue_batch_size,
                max_retries=max_retries,
            )
            processed = _consume_pending_jobs(
                connection=connection,
                storage_client=storage_client,
                bucket=bucket,
                openai_client=openai_client,
                openai_embedding_model=openai_embedding_model,
                caption_model=caption_model,
                import_model=import_model,
                limit=consume_batch_size,
                backoff_base_seconds=backoff_base_seconds,
            )
            connection.commit()

        _log("worker_cycle_done", enqueued=enqueued, processed=processed)
        time.sleep(interval)


def _build_storage_client() -> tuple[object, str]:
    endpoint = os.getenv("MINIO_ENDPOINT", "http://minio:9000")
    access_key = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
    secret_key = os.getenv("MINIO_SECRET_KEY", "minioadmin")
    region = os.getenv("MINIO_REGION", "us-east-1")
    bucket = os.getenv("MINIO_BUCKET", "trip-archive")

    client = boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        region_name=region,
    )
    return client, bucket


def _normalize_database_url(database_url: str) -> str:
    return database_url.replace("postgresql+psycopg://", "postgresql://", 1)


def _ensure_worker_jobs_table(connection: psycopg.Connection) -> None:
    with connection.cursor() as cursor:
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS worker_jobs (
                id UUID PRIMARY KEY,
                job_type TEXT NOT NULL,
                source_type TEXT NOT NULL,
                source_id UUID NOT NULL,
                status TEXT NOT NULL,
                attempt_count INTEGER NOT NULL DEFAULT 0,
                max_attempts INTEGER NOT NULL DEFAULT 3,
                available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                payload JSONB,
                payload_hash TEXT,
                result JSONB,
                last_error TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                CONSTRAINT uq_worker_jobs_job_source UNIQUE (
                    job_type,
                    source_type,
                    source_id
                )
            )
            """
        )


def _enqueue_jobs(connection: psycopg.Connection, limit: int, max_retries: int) -> int:
    enqueued = 0
    enqueued += _enqueue_embedding_jobs_for_memories(connection, limit, max_retries)
    enqueued += _enqueue_embedding_jobs_for_activities(connection, limit, max_retries)
    enqueued += _enqueue_thumbnail_jobs_for_memories(connection, limit, max_retries)
    return enqueued


def _enqueue_embedding_jobs_for_memories(
    connection: psycopg.Connection, limit: int, max_retries: int
) -> int:
    sql = """
        SELECT m.id, m.memory_type, m.caption, m.content_text
        FROM memories m
        ORDER BY m.created_at ASC
        LIMIT %s
    """

    count = 0
    with connection.cursor() as cursor:
        cursor.execute(sql, (limit,))
        rows = cursor.fetchall()

    for memory_id, memory_type, caption, content_text in rows:
        content = _memory_content(memory_type, caption, content_text)
        if not content:
            continue

        payload = {"content": content}
        count += _upsert_job(
            connection=connection,
            job_type=JOB_TYPE_EMBEDDING,
            source_type="memory",
            source_id=memory_id,
            payload=payload,
            max_retries=max_retries,
        )

    return count


def _enqueue_embedding_jobs_for_activities(
    connection: psycopg.Connection, limit: int, max_retries: int
) -> int:
    sql = """
        SELECT a.id, a.title, a.location, a.notes, a.status
        FROM activities a
        ORDER BY a.created_at ASC
        LIMIT %s
    """

    count = 0
    with connection.cursor() as cursor:
        cursor.execute(sql, (limit,))
        rows = cursor.fetchall()

    for activity_id, title, location, notes, status in rows:
        content = _activity_content(title, location, notes, status)
        if not content:
            continue

        payload = {"content": content}
        count += _upsert_job(
            connection=connection,
            job_type=JOB_TYPE_EMBEDDING,
            source_type="activity",
            source_id=activity_id,
            payload=payload,
            max_retries=max_retries,
        )

    return count


def _enqueue_thumbnail_jobs_for_memories(
    connection: psycopg.Connection, limit: int, max_retries: int
) -> int:
    sql = """
        SELECT m.id, m.memory_type, m.storage_key
        FROM memories m
        WHERE m.storage_key IS NOT NULL
          AND m.memory_type IN ('photo', 'video')
        ORDER BY m.created_at ASC
        LIMIT %s
    """

    count = 0
    with connection.cursor() as cursor:
        cursor.execute(sql, (limit,))
        rows = cursor.fetchall()

    for memory_id, memory_type, storage_key in rows:
        payload = {
            "memory_type": memory_type,
            "storage_key": storage_key,
            "thumbnail_key": _thumbnail_key(storage_key),
        }
        count += _upsert_job(
            connection=connection,
            job_type=JOB_TYPE_THUMBNAIL,
            source_type="memory",
            source_id=memory_id,
            payload=payload,
            max_retries=max_retries,
        )

    return count


def _upsert_job(
    connection: psycopg.Connection,
    job_type: str,
    source_type: str,
    source_id: uuid.UUID,
    payload: dict[str, str],
    max_retries: int,
) -> int:
    payload_json = json.dumps(payload, ensure_ascii=False, sort_keys=True)
    payload_hash = hashlib.sha256(payload_json.encode("utf-8")).hexdigest()

    with connection.cursor() as cursor:
        cursor.execute(
            """
            INSERT INTO worker_jobs (
                id,
                job_type,
                source_type,
                source_id,
                status,
                attempt_count,
                max_attempts,
                available_at,
                payload,
                payload_hash,
                updated_at
            )
            VALUES (%s, %s, %s, %s, 'pending', 0, %s, NOW(), %s::jsonb, %s, NOW())
            ON CONFLICT (job_type, source_type, source_id)
            DO UPDATE SET
                max_attempts = EXCLUDED.max_attempts,
                payload = EXCLUDED.payload,
                payload_hash = EXCLUDED.payload_hash,
                status = CASE
                    WHEN worker_jobs.payload_hash IS DISTINCT FROM EXCLUDED.payload_hash
                        THEN 'pending'
                    ELSE worker_jobs.status
                END,
                attempt_count = CASE
                    WHEN worker_jobs.payload_hash IS DISTINCT FROM EXCLUDED.payload_hash
                        THEN 0
                    ELSE worker_jobs.attempt_count
                END,
                available_at = CASE
                    WHEN worker_jobs.payload_hash IS DISTINCT FROM EXCLUDED.payload_hash
                        THEN NOW()
                    ELSE worker_jobs.available_at
                END,
                last_error = CASE
                    WHEN worker_jobs.payload_hash IS DISTINCT FROM EXCLUDED.payload_hash
                        THEN NULL
                    ELSE worker_jobs.last_error
                END,
                updated_at = NOW()
            RETURNING (xmax = 0)
            """,
            (
                uuid.uuid4(),
                job_type,
                source_type,
                source_id,
                max_retries,
                payload_json,
                payload_hash,
            ),
        )
        changed = cursor.fetchone()[0]
        return 1 if changed else 0


def _consume_pending_jobs(
    connection: psycopg.Connection,
    storage_client: object,
    bucket: str,
    openai_client: OpenAI,
    openai_embedding_model: str,
    caption_model: str,
    import_model: str,
    limit: int,
    backoff_base_seconds: int,
) -> int:
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT
                id,
                job_type,
                source_type,
                source_id,
                status,
                attempt_count,
                max_attempts,
                payload
            FROM worker_jobs
            WHERE status = 'pending'
              AND available_at <= NOW()
            ORDER BY updated_at ASC
            LIMIT %s
            FOR UPDATE SKIP LOCKED
            """,
            (limit,),
        )
        rows = cursor.fetchall()

    processed = 0
    for (
        job_id,
        job_type,
        source_type,
        source_id,
        _status,
        attempt_count,
        max_attempts,
        payload,
    ) in rows:
        try:
            with connection.transaction():
                _set_job_running(connection, job_id)
                _log(
                    "job_started",
                    job_id=job_id,
                    job_type=job_type,
                    source_type=source_type,
                    source_id=source_id,
                    attempt=attempt_count + 1,
                )

                result = _dispatch_job(
                    connection=connection,
                    storage_client=storage_client,
                    bucket=bucket,
                    openai_client=openai_client,
                    openai_embedding_model=openai_embedding_model,
                    caption_model=caption_model,
                    import_model=import_model,
                    job_type=job_type,
                    source_type=source_type,
                    source_id=source_id,
                    payload=payload,
                )
                _set_job_done(connection, job_id, result)
            _log("job_done", job_id=job_id, job_type=job_type, source_id=source_id)
            processed += 1
        except Exception as exc:
            _handle_job_failure(
                connection=connection,
                job_id=job_id,
                job_type=job_type,
                source_id=source_id,
                error=exc,
                attempt_count=attempt_count,
                max_attempts=max_attempts,
                backoff_base_seconds=backoff_base_seconds,
            )

    return processed


def _build_itinerary_prompt_worker(
    trip_name: str,
    destinations: list[str],
    start_date: object,
    end_date: object,
    summary: str | None,
    day_rows: list[tuple],
    activities_by_day: dict,
    preferences: str | None,
    max_days: int,
) -> str:
    preferences_text = (preferences or "").strip() or "Sem preferências explícitas"
    summary_text = (summary or "").strip() or "Sem resumo informado"
    dest_str = ", ".join(destinations) if destinations else "destino não informado"

    day_lines: list[str] = []
    for day_id, day_number, day_date, day_notes in day_rows[:max_days]:
        line = f"Dia {day_number}"
        if day_date:
            line = f"{line} ({day_date})"
        activities = activities_by_day.get(day_id, [])
        if activities:
            line = f"{line}: " + "; ".join(
                act["title"] + (f" @ {act['location']}" if act.get("location") else "")
                for act in activities[:6]
            )
        elif day_notes:
            line = f"{line}: {day_notes}"
        day_lines.append(line)

    if not day_lines:
        day_lines = ["Sem dias planejados ainda"]

    return "\n".join(
        [
            "Você é um assistente de viagens para casal. Responda APENAS com um objeto JSON válido, sem texto adicional.",
            "",
            "O JSON deve seguir exatamente esta estrutura:",
            "{",
            '  "markdown": "<roteiro completo em Markdown com seções: visão geral, plano por dia, recomendações finais>",',
            '  "days": [',
            "    {",
            '      "day_number": 1,',
            '      "date": "YYYY-MM-DD ou null",',
            '      "notes": "resumo do dia em 1-2 frases ou null",',
            '      "location": {"country": "País", "city": "Cidade", "region": "Bairro/região ou null", "place_name": "Local específico ou null"},',
            '      "activities": [',
            '        {"title": "nome da atividade", "location": {"country": "País", "city": "Cidade", "region": "Bairro ou null", "place_name": "Local ou null"}, "notes": "dica ou null"}',
            "      ]",
            "    }",
            "  ]",
            "}",
            "",
            "Regras:",
            f"- Gere entre 1 e {max_days} dias",
            "- Cada dia deve ter entre 2 e 5 atividades",
            "- Não invente atrações muito específicas se não houver contexto",
            "- Use os dados da viagem abaixo como base",
            "- Se já existem atividades planejadas, inclua-as e complemente",
            "- Cada dia e cada atividade deve ter um objeto 'location' com country e city sempre preenchidos",
            "- Use null para region e place_name quando não houver informação específica",
            "",
            f"Viagem: {trip_name}",
            f"Destinos: {dest_str}",
            f"Período: {start_date} até {end_date}",
            f"Resumo atual: {summary_text}",
            f"Preferências: {preferences_text}",
            "",
            "Contexto dos dias/atividades já existentes:",
            *[f"- {line}" for line in day_lines],
        ]
    )


def _persist_itinerary_worker(
    connection: psycopg.Connection,
    trip_id: uuid.UUID,
    structured_days: list[dict],
) -> tuple[int, int]:
    days_created = 0
    activities_created = 0

    for day_data in structured_days:
        day_number = int(day_data.get("day_number") or 0)
        if not day_number:
            continue

        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT id FROM days WHERE trip_id = %s AND day_number = %s",
                (trip_id, day_number),
            )
            existing_day = cursor.fetchone()

        if existing_day:
            day_id = existing_day[0]
        else:
            day_id = uuid.uuid4()
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO days (id, trip_id, day_number, date, notes, created_at)
                    VALUES (%s, %s, %s, %s, %s, NOW())
                    """,
                    (
                        day_id,
                        trip_id,
                        day_number,
                        day_data.get("date") or None,
                        day_data.get("notes") or None,
                    ),
                )
            days_created += 1

        # Persist day-level location
        day_loc_data = day_data.get("location")
        day_country = day_city = None
        if isinstance(day_loc_data, dict):
            day_country = (day_loc_data.get("country") or "").strip() or None
            day_city = (day_loc_data.get("city") or "").strip() or None
        if day_country and day_city:
            day_loc_id = uuid.uuid4()
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO locations (id, trip_id, country, city, region, place_name, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s, NOW())
                    """,
                    (
                        day_loc_id,
                        trip_id,
                        day_country,
                        day_city,
                        (day_loc_data.get("region") or "").strip() or None,
                        (day_loc_data.get("place_name") or "").strip() or None,
                    ),
                )
                cursor.execute(
                    "UPDATE days SET location_id = %s WHERE id = %s",
                    (day_loc_id, day_id),
                )
        else:
            print(
                f"[worker] Day {day_number}: missing country/city in location, skipping location insert"
            )

        for act in day_data.get("activities", []):
            title = (act.get("title") or "").strip()
            if not title:
                continue

            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT id FROM activities WHERE day_id = %s AND LOWER(title) = LOWER(%s)",
                    (day_id, title),
                )
                existing_act = cursor.fetchone()

            if existing_act:
                continue

            # Build free-text location and structured location ID
            act_loc_data = act.get("location")
            act_location_text = None
            act_loc_id = None
            if isinstance(act_loc_data, dict):
                act_country = (act_loc_data.get("country") or "").strip() or None
                act_city = (act_loc_data.get("city") or "").strip() or None
                act_place_name = (act_loc_data.get("place_name") or "").strip() or None
                if act_place_name:
                    act_location_text = act_place_name
                elif act_city and act_country:
                    act_location_text = f"{act_city}, {act_country}"
                elif act_city:
                    act_location_text = act_city
                # Only create a location record when country or city differs from the day
                if (
                    act_country
                    and act_city
                    and (act_country != day_country or act_city != day_city)
                ):
                    act_loc_id = uuid.uuid4()
                    with connection.cursor() as cursor:
                        cursor.execute(
                            """
                            INSERT INTO locations (id, trip_id, country, city, region, place_name, created_at)
                            VALUES (%s, %s, %s, %s, %s, %s, NOW())
                            """,
                            (
                                act_loc_id,
                                trip_id,
                                act_country,
                                act_city,
                                (act_loc_data.get("region") or "").strip() or None,
                                (act_loc_data.get("place_name") or "").strip() or None,
                            ),
                        )
            elif isinstance(act_loc_data, str):
                act_location_text = act_loc_data or None

            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO activities (id, day_id, title, location, notes, status, location_id, created_at, updated_at)
                    VALUES (%s, %s, %s, %s, %s, 'planned', %s, NOW(), NOW())
                    """,
                    (
                        uuid.uuid4(),
                        day_id,
                        title,
                        act_location_text,
                        act.get("notes") or None,
                        act_loc_id,
                    ),
                )
            activities_created += 1

    return days_created, activities_created


def _run_itinerary_generation(
    connection: psycopg.Connection,
    openai_client: OpenAI,
    source_id: uuid.UUID,
    payload: dict,
) -> dict:
    itinerary_model = os.getenv("ITINERARY_MODEL", "gpt-4o")
    preferences = payload.get("preferences")
    max_days = int(payload.get("max_days") or 7)

    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT id, name, destinations, start_date, end_date, summary FROM trips WHERE id = %s",
            (source_id,),
        )
        trip_row = cursor.fetchone()

    if not trip_row:
        raise RuntimeError(f"Trip {source_id} not found")

    trip_id, trip_name, destinations, start_date, end_date, summary = trip_row

    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT id, day_number, date, notes FROM days WHERE trip_id = %s ORDER BY day_number ASC",
            (trip_id,),
        )
        day_rows = cursor.fetchall()

    day_ids = [row[0] for row in day_rows]
    activities_by_day: dict = {row[0]: [] for row in day_rows}

    if day_ids:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT id, day_id, title, location, notes FROM activities WHERE day_id = ANY(%s) ORDER BY created_at ASC",
                (day_ids,),
            )
            for act_id, day_id, title, location, notes in cursor.fetchall():
                activities_by_day.setdefault(day_id, []).append(
                    {"id": act_id, "title": title, "location": location, "notes": notes}
                )

    prompt = _build_itinerary_prompt_worker(
        trip_name=trip_name,
        destinations=list(destinations) if destinations else [],
        start_date=start_date,
        end_date=end_date,
        summary=summary,
        day_rows=day_rows,
        activities_by_day=activities_by_day,
        preferences=preferences,
        max_days=max_days,
    )

    _log(
        "itinerary_generation_started",
        trip_id=trip_id,
        max_days=max_days,
        model=itinerary_model,
    )

    response = openai_client.responses.create(model=itinerary_model, input=prompt)
    raw = (getattr(response, "output_text", "") or "").strip()

    if not raw:
        raise RuntimeError("Empty response from OpenAI for itinerary generation")

    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]

    structured = json.loads(raw)

    days_created, activities_created = _persist_itinerary_worker(
        connection=connection,
        trip_id=trip_id,
        structured_days=structured.get("days", []),
    )

    with connection.cursor() as cursor:
        cursor.execute(
            "UPDATE trips SET status = 'planned', updated_at = NOW() WHERE id = %s",
            (trip_id,),
        )

    _log(
        "itinerary_generation_done",
        trip_id=trip_id,
        days_created=days_created,
        activities_created=activities_created,
    )

    return {
        "type": JOB_TYPE_ITINERARY,
        "days_created": days_created,
        "activities_created": activities_created,
    }


def _dispatch_job(
    connection: psycopg.Connection,
    storage_client: object,
    bucket: str,
    openai_client: OpenAI,
    openai_embedding_model: str,
    caption_model: str,
    import_model: str,
    job_type: str,
    source_type: str,
    source_id: uuid.UUID,
    payload: dict[str, object],
) -> dict[str, str]:
    if job_type == JOB_TYPE_EMBEDDING:
        content = str(payload.get("content") or "")
        if not content.strip():
            raise RuntimeError("Embedding payload without content")

        vector_literal = _vector_literal(
            _embed_text(
                openai_client=openai_client,
                openai_embedding_model=openai_embedding_model,
                text=content,
            )
        )
        _upsert_embedding(
            connection=connection,
            source_type=source_type,
            source_id=source_id,
            content=content,
            vector_literal=vector_literal,
        )
        return {"type": JOB_TYPE_EMBEDDING, "status": "done"}

    if job_type == JOB_TYPE_THUMBNAIL:
        storage_key = str(payload.get("storage_key") or "")
        memory_type = str(payload.get("memory_type") or "")
        thumbnail_key = str(payload.get("thumbnail_key") or "")

        if not storage_key or not thumbnail_key:
            raise RuntimeError("Thumbnail payload inválido")

        thumbnail_bytes = _build_thumbnail_bytes(
            storage_client=storage_client,
            bucket=bucket,
            storage_key=storage_key,
            memory_type=memory_type,
        )

        storage_client.put_object(
            Bucket=bucket,
            Key=thumbnail_key,
            Body=thumbnail_bytes,
            ContentType="image/jpeg",
            ACL="private",
        )
        return {
            "type": JOB_TYPE_THUMBNAIL,
            "status": "done",
            "thumbnail_key": thumbnail_key,
        }

    if job_type == JOB_TYPE_ITINERARY:
        return _run_itinerary_generation(
            connection=connection,
            openai_client=openai_client,
            source_id=source_id,
            payload=payload,
        )

    if job_type == JOB_TYPE_STORIES_EXPORT:
        trip_id = str(payload.get("trip_id") or "")
        story_export_job_id = str(payload.get("story_export_job_id") or "")

        if not trip_id or not story_export_job_id:
            raise RuntimeError(
                "stories_export payload missing trip_id or story_export_job_id"
            )

        from app.stories.exporter import process_stories_export

        return process_stories_export(
            trip_id=trip_id,
            story_export_job_id=story_export_job_id,
            database_url=_normalize_database_url(os.getenv("DATABASE_URL", "")),
            storage_client=storage_client,
            bucket=bucket,
            openai_client=openai_client,
            openai_model=caption_model,
            minio_public_endpoint=os.getenv(
                "MINIO_PUBLIC_ENDPOINT",
                os.getenv("MINIO_ENDPOINT", "http://minio:9000"),
            ),
        )

    if job_type == JOB_TYPE_TRIP_IMPORT:
        from app.import_trip.processor import process_trip_import

        return process_trip_import(
            trip_id=source_id,
            object_keys=list(payload.get("object_keys") or []),
            database_url=_normalize_database_url(os.getenv("DATABASE_URL", "")),
            storage_client=storage_client,
            bucket=bucket,
            openai_client=openai_client,
            vision_model=import_model,
            minio_public_endpoint=os.getenv(
                "MINIO_PUBLIC_ENDPOINT",
                os.getenv("MINIO_ENDPOINT", "http://minio:9000"),
            ),
        )

    if job_type == JOB_TYPE_TRIP_MEDIA_ADD:
        from app.add_media.processor import process_trip_media_add

        return process_trip_media_add(
            trip_id=source_id,
            object_keys=list(payload.get("object_keys") or []),
            database_url=_normalize_database_url(os.getenv("DATABASE_URL", "")),
            storage_client=storage_client,
            bucket=bucket,
            openai_client=openai_client,
            vision_model=import_model,
            minio_public_endpoint=os.getenv(
                "MINIO_PUBLIC_ENDPOINT",
                os.getenv("MINIO_ENDPOINT", "http://minio:9000"),
            ),
        )

    raise RuntimeError(f"Unsupported job_type: {job_type}")


def _upsert_embedding(
    connection: psycopg.Connection,
    source_type: str,
    source_id: uuid.UUID,
    content: str,
    vector_literal: str,
) -> None:
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT id
            FROM embeddings
            WHERE source_type = %s AND source_id = %s
            LIMIT 1
            """,
            (source_type, source_id),
        )
        existing = cursor.fetchone()

        if existing:
            cursor.execute(
                """
                UPDATE embeddings
                SET content = %s, embedding = %s::vector
                WHERE id = %s
                """,
                (content, vector_literal, existing[0]),
            )
            return

        cursor.execute(
            """
            INSERT INTO embeddings (id, source_type, source_id, content, embedding)
            VALUES (%s, %s, %s, %s, %s::vector)
            """,
            (uuid.uuid4(), source_type, source_id, content, vector_literal),
        )


def _build_thumbnail_bytes(
    storage_client: object,
    bucket: str,
    storage_key: str,
    memory_type: str,
) -> bytes:
    if memory_type == "video":
        return _build_video_placeholder_thumbnail()

    response = storage_client.get_object(Bucket=bucket, Key=storage_key)
    raw_bytes = response["Body"].read()

    image = Image.open(io.BytesIO(raw_bytes))
    image = ImageOps.exif_transpose(image)
    image = image.convert("RGB")
    image.thumbnail((480, 480))

    output = io.BytesIO()
    image.save(output, format="JPEG", quality=85)
    return output.getvalue()


def _build_video_placeholder_thumbnail() -> bytes:
    image = Image.new("RGB", (480, 270), (32, 32, 32))
    draw = ImageDraw.Draw(image)
    draw.polygon([(190, 95), (190, 175), (280, 135)], fill=(240, 240, 240))

    output = io.BytesIO()
    image.save(output, format="JPEG", quality=85)
    return output.getvalue()


def _thumbnail_key(storage_key: str) -> str:
    base = storage_key.rsplit(".", maxsplit=1)[0]
    return f"{base}.thumbnail.jpg"


def _set_job_running(connection: psycopg.Connection, job_id: uuid.UUID) -> None:
    with connection.cursor() as cursor:
        cursor.execute(
            """
            UPDATE worker_jobs
            SET status = 'running', updated_at = NOW()
            WHERE id = %s
            """,
            (job_id,),
        )


def _set_job_done(
    connection: psycopg.Connection,
    job_id: uuid.UUID,
    result: dict[str, str],
) -> None:
    with connection.cursor() as cursor:
        cursor.execute(
            """
            UPDATE worker_jobs
            SET
                status = 'done',
                result = %s::jsonb,
                last_error = NULL,
                available_at = NOW(),
                updated_at = NOW()
            WHERE id = %s
            """,
            (json.dumps(result, ensure_ascii=False), job_id),
        )


def _handle_job_failure(
    connection: psycopg.Connection,
    job_id: uuid.UUID,
    job_type: str,
    source_id: uuid.UUID,
    error: Exception,
    attempt_count: int,
    max_attempts: int,
    backoff_base_seconds: int,
) -> None:
    next_attempt = attempt_count + 1
    if next_attempt >= max_attempts:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                UPDATE worker_jobs
                SET
                    status = 'failed',
                    attempt_count = %s,
                    last_error = %s,
                    available_at = NOW(),
                    updated_at = NOW()
                WHERE id = %s
                """,
                (next_attempt, str(error)[:2000], job_id),
            )
        if job_type == JOB_TYPE_ITINERARY:
            with connection.cursor() as cursor:
                cursor.execute(
                    "UPDATE trips SET status = 'itinerary_failed', updated_at = NOW() WHERE id = %s",
                    (source_id,),
                )
        if job_type == JOB_TYPE_TRIP_IMPORT:
            with connection.cursor() as cursor:
                cursor.execute(
                    "UPDATE trips SET status = 'import_failed', updated_at = NOW() WHERE id = %s",
                    (source_id,),
                )
        if job_type == JOB_TYPE_TRIP_MEDIA_ADD:
            print(f"[add_media] job failed for trip={source_id}: {error}")
        _log(
            "job_failed_terminal",
            job_id=job_id,
            job_type=job_type,
            source_id=source_id,
            attempt=next_attempt,
            error=str(error),
        )
        return

    backoff_seconds = backoff_base_seconds * (2 ** (next_attempt - 1))
    available_at = datetime.now(timezone.utc) + timedelta(seconds=backoff_seconds)
    with connection.cursor() as cursor:
        cursor.execute(
            """
            UPDATE worker_jobs
            SET
                status = 'pending',
                attempt_count = %s,
                last_error = %s,
                available_at = %s,
                updated_at = NOW()
            WHERE id = %s
            """,
            (next_attempt, str(error)[:2000], available_at, job_id),
        )

    _log(
        "job_failed_retry_scheduled",
        job_id=job_id,
        job_type=job_type,
        source_id=source_id,
        attempt=next_attempt,
        backoff_seconds=backoff_seconds,
        available_at=available_at.isoformat(),
        error=str(error),
    )


def _log(event: str, **fields: object) -> None:
    payload = {
        "event": event,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        **fields,
    }
    print(json.dumps(payload, ensure_ascii=False, default=str))


def _vector_literal(values: list[float]) -> str:
    return "[" + ",".join(f"{value:.8f}" for value in values) + "]"


def _activity_content(
    title: str | None,
    location: str | None,
    notes: str | None,
    status: str | None,
) -> str:
    fields = [title, location, notes, f"status={status}" if status else None]
    return " | ".join([value for value in fields if value]).strip()


def _memory_content(
    memory_type: str | None,
    caption: str | None,
    content_text: str | None,
) -> str:
    fields = [f"type={memory_type}" if memory_type else None, caption, content_text]
    return " | ".join([value for value in fields if value]).strip()


def _embed_text(
    openai_client: OpenAI,
    openai_embedding_model: str,
    text: str,
) -> list[float]:
    clean_text = text.strip()
    if not clean_text:
        return [0.0] * 1536

    response = openai_client.embeddings.create(
        model=openai_embedding_model,
        input=clean_text,
    )
    return list(response.data[0].embedding)


if __name__ == "__main__":
    run()
