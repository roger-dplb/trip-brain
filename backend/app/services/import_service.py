import hashlib
import json
import uuid

from sqlalchemy import text
from sqlalchemy.orm import Session


def enqueue_trip_import(
    db: Session,
    trip_id: uuid.UUID,
    object_keys: list[str],
) -> uuid.UUID:
    payload = {"object_keys": object_keys}
    payload_hash = hashlib.sha256(
        json.dumps(payload, sort_keys=True).encode()
    ).hexdigest()
    job_id = uuid.uuid4()

    result = db.execute(
        text("""
            INSERT INTO worker_jobs (
                id, job_type, source_type, source_id,
                status, payload, payload_hash, updated_at
            )
            VALUES (
                :job_id, 'trip_import', 'trip', :trip_id,
                'pending', CAST(:payload AS JSONB), :payload_hash, NOW()
            )
            ON CONFLICT (job_type, source_type, source_id) DO UPDATE
            SET
                status = 'pending',
                attempt_count = 0,
                available_at = NOW(),
                payload = EXCLUDED.payload,
                payload_hash = EXCLUDED.payload_hash,
                last_error = NULL,
                updated_at = NOW()
            RETURNING id
        """),
        {
            "job_id": job_id,
            "trip_id": trip_id,
            "payload": json.dumps(payload),
            "payload_hash": payload_hash,
        },
    )
    returned = result.fetchone()
    if returned:
        job_id = returned[0]

    db.commit()

    return job_id


def enqueue_trip_media_add(
    db: Session,
    trip_id: uuid.UUID,
    object_keys: list[str],
) -> uuid.UUID:
    payload = {"object_keys": object_keys}
    job_id = uuid.uuid4()

    result = db.execute(
        text("""
            INSERT INTO worker_jobs (
                id, job_type, source_type, source_id,
                status, payload, payload_hash, updated_at
            )
            VALUES (
                :job_id, 'trip_media_add', 'trip', :trip_id,
                'pending', CAST(:payload AS JSONB), :payload_hash, NOW()
            )
            ON CONFLICT (job_type, source_type, source_id) DO UPDATE
            SET
                status = 'pending',
                attempt_count = 0,
                available_at = NOW(),
                payload = EXCLUDED.payload,
                payload_hash = EXCLUDED.payload_hash,
                last_error = NULL,
                updated_at = NOW()
            RETURNING id
        """),
        {
            "job_id": job_id,
            "trip_id": trip_id,
            "payload": json.dumps(payload),
            "payload_hash": hashlib.sha256(
                json.dumps(payload, sort_keys=True).encode()
            ).hexdigest(),
        },
    )
    returned = result.fetchone()
    if returned:
        job_id = returned[0]

    db.commit()
    return job_id
