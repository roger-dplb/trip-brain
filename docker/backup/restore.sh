#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: $0 <snapshot_dir>"
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SNAPSHOT_DIR="$1"

if [[ ! -d "$SNAPSHOT_DIR" ]]; then
  echo "snapshot directory not found: $SNAPSHOT_DIR"
  exit 1
fi

if [[ ! -f "$SNAPSHOT_DIR/postgres.dump" || ! -f "$SNAPSHOT_DIR/minio-data.tar.gz" ]]; then
  echo "snapshot files missing in $SNAPSHOT_DIR"
  exit 1
fi

if [[ -f "$SNAPSHOT_DIR/SHA256SUMS" ]]; then
  echo "[restore] validating checksums"
  (
    cd "$SNAPSHOT_DIR"
    shasum -a 256 -c SHA256SUMS
  )
fi

echo "[restore] this will overwrite PostgreSQL and MinIO current data"
read -r -p "type 'restore' to continue: " CONFIRM
if [[ "$CONFIRM" != "restore" ]]; then
  echo "aborted"
  exit 1
fi

echo "[restore] restoring PostgreSQL"
cat "$SNAPSHOT_DIR/postgres.dump" | docker compose -f "$ROOT_DIR/docker-compose.yml" exec -T postgres \
  sh -c 'dropdb -U trip_user --if-exists trip_archive && createdb -U trip_user trip_archive && pg_restore -U trip_user -d trip_archive --clean --if-exists'

echo "[restore] restoring MinIO data"
cat "$SNAPSHOT_DIR/minio-data.tar.gz" | docker compose -f "$ROOT_DIR/docker-compose.yml" exec -T minio \
  sh -c 'rm -rf /data/* && tar -xzf - -C /'

echo "[restore] done"
