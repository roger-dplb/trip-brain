CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS trips (
    id UUID PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    destinations VARCHAR(120)[] NOT NULL DEFAULT '{}',
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    summary TEXT,
    cover_image_url TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'planning',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    country TEXT NOT NULL,
    city TEXT NOT NULL,
    region TEXT,
    place_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS days (
    id UUID PRIMARY KEY,
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    day_number INTEGER NOT NULL,
    date DATE,
    notes TEXT,
    location_id UUID REFERENCES locations(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS activities (
    id UUID PRIMARY KEY,
    day_id UUID NOT NULL REFERENCES days(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    location TEXT,
    scheduled_time TIME,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'planned',
    location_id UUID REFERENCES locations(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS memories (
    id UUID PRIMARY KEY,
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    day_id UUID REFERENCES days(id) ON DELETE SET NULL,
    activity_id UUID REFERENCES activities(id) ON DELETE SET NULL,
    memory_type TEXT NOT NULL,
    storage_key TEXT,
    content_text TEXT,
    caption TEXT,
    taken_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS embeddings (
    id UUID PRIMARY KEY,
    source_type TEXT NOT NULL,
    source_id UUID NOT NULL,
    content TEXT NOT NULL,
    embedding VECTOR(1536),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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
    CONSTRAINT uq_worker_jobs_job_source UNIQUE (job_type, source_type, source_id)
);

CREATE TABLE IF NOT EXISTS story_export_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL UNIQUE REFERENCES trips(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'queued',
    zip_object_key TEXT,
    mp4_object_key TEXT,
    error_msg TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_days_trip_id ON days (trip_id);
CREATE INDEX IF NOT EXISTS ix_activities_day_id ON activities (day_id);
CREATE INDEX IF NOT EXISTS ix_memories_trip_id ON memories (trip_id);
CREATE INDEX IF NOT EXISTS ix_embeddings_source ON embeddings (source_type, source_id);
CREATE INDEX IF NOT EXISTS embeddings_embedding_idx ON embeddings USING ivfflat (embedding vector_cosine_ops);

-- Stamp Alembic version so migrations don't try to re-run on a fresh DB
CREATE TABLE IF NOT EXISTS alembic_version (
    version_num VARCHAR(32) NOT NULL,
    CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num)
);
INSERT INTO alembic_version (version_num) VALUES ('20260315_0002') ON CONFLICT DO NOTHING;
