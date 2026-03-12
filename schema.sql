CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS trips (
    id UUID PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    destination VARCHAR(120) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    summary TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'planning',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS days (
    id UUID PRIMARY KEY,
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    day_number INTEGER NOT NULL,
    date DATE,
    notes TEXT,
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

CREATE INDEX IF NOT EXISTS ix_days_trip_id ON days (trip_id);
CREATE INDEX IF NOT EXISTS ix_activities_day_id ON activities (day_id);
CREATE INDEX IF NOT EXISTS ix_memories_trip_id ON memories (trip_id);
CREATE INDEX IF NOT EXISTS ix_embeddings_source ON embeddings (source_type, source_id);
CREATE INDEX IF NOT EXISTS embeddings_embedding_idx ON embeddings USING ivfflat (embedding vector_cosine_ops);
