#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/docker/backup/artifacts}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
SNAPSHOT_DIR="$BACKUP_DIR/$TIMESTAMP"

mkdir -p "$SNAPSHOT_DIR"

echo "[backup] creating snapshot at $SNAPSHOT_DIR"

echo "[backup] dumping PostgreSQL"
docker compose -f "$ROOT_DIR/docker-compose.yml" exec -T postgres \
  pg_dump -U trip_user -d trip_archive -Fc \
  > "$SNAPSHOT_DIR/postgres.dump"

echo "[backup] archiving MinIO data"
docker compose -f "$ROOT_DIR/docker-compose.yml" exec -T minio \
  sh -c 'tar -czf - -C / data' \
  > "$SNAPSHOT_DIR/minio-data.tar.gz"

echo "[backup] writing metadata"
cat > "$SNAPSHOT_DIR/metadata.txt" <<EOF
timestamp=$TIMESTAMP
postgres_file=postgres.dump
minio_file=minio-data.tar.gz
EOF

(
  cd "$SNAPSHOT_DIR"
  shasum -a 256 postgres.dump minio-data.tar.gz > SHA256SUMS
)

echo "[backup] done"
echo "snapshot: $SNAPSHOT_DIR"
