#!/bin/bash
set -e

# EZBILLZ Production Restore Script
if [ -z "$1" ]; then
  echo "Usage: ./restore.sh <path_to_backup_directory>"
  echo "Example: ./restore.sh ./backups/20260913_120000"
  exit 1
fi

BACKUP_DIR="$1"

if [ ! -d "$BACKUP_DIR" ]; then
  echo "Error: Directory $BACKUP_DIR does not exist."
  exit 1
fi

echo "Starting EZBILLZ Restore from $BACKUP_DIR..."

# 1. Database Restore
DUMP_FILE=$(ls "$BACKUP_DIR"/db_*.dump | head -n 1)
if [ -f "$DUMP_FILE" ]; then
  echo "Restoring database from $DUMP_FILE..."
  if command -v pg_restore > /dev/null 2>&1; then
    # --clean will drop existing objects before restoring
    pg_restore -d "$DATABASE_URL" --clean --no-owner "$DUMP_FILE"
  else
    cat "$DUMP_FILE" | docker exec -i "${PG_CONTAINER:-ezbillz-postgres-1}" pg_restore -U ezbillz -d ezbillz --clean --no-owner || true
  fi
  echo "Database restore complete."
else
  echo "Warning: No database dump found in $BACKUP_DIR"
fi

# 2. Storage Restore
if [ -d "$BACKUP_DIR/storage" ]; then
  echo "Restoring storage..."
  if command -v mc > /dev/null 2>&1; then
    mc alias set ezbillz_s3 "${S3_ENDPOINT:-http://localhost:9000}" "${S3_ACCESS_KEY_ID:-admin}" "${S3_SECRET_ACCESS_KEY:-password}"
    mc cp -r "$BACKUP_DIR/storage/" ezbillz_s3/${S3_BUCKET:-ezbillz}/
  else
    docker run --rm -v "$PWD/$BACKUP_DIR:/backup" --network "${DOCKER_NETWORK:-ezbillz_internal}" --entrypoint /bin/sh quay.io/minio/mc:latest -c \
      "mc alias set myminio ${S3_ENDPOINT:-http://ezbillz-minio-1:9000} ${S3_ACCESS_KEY_ID:-admin} ${S3_SECRET_ACCESS_KEY:-password} && mc cp -r /backup/storage/ myminio/${S3_BUCKET:-ezbillz}/"
  fi
  echo "Storage restore complete."
else
  echo "Warning: No storage backup found in $BACKUP_DIR"
fi

echo "Restore finished successfully!"
