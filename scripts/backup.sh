#!/bin/bash
set -e

# EZBILLZ Production Backup Script
echo "Starting EZBILLZ Backup..."
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="${BACKUP_DIR:-./backups}/$TIMESTAMP"
mkdir -p "$BACKUP_DIR"

# 1. Database Backup
echo "Dumping database..."
if command -v pg_dump > /dev/null 2>&1; then
  pg_dump "$DATABASE_URL" -F c -f "$BACKUP_DIR/db_$TIMESTAMP.dump"
else
  # Fallback to docker container
  docker exec ezbillz-postgres-1 pg_dump -U ezbillz -F c -d ezbillz > "$BACKUP_DIR/db_$TIMESTAMP.dump"
fi
echo "Database backup complete."

# 2. Storage Backup (MinIO/S3)
echo "Backing up storage..."
if command -v mc > /dev/null 2>&1; then
  mc alias set ezbillz_s3 "${S3_ENDPOINT:-http://localhost:9000}" "${S3_ACCESS_KEY_ID:-admin}" "${S3_SECRET_ACCESS_KEY:-password}"
  mc cp -r ezbillz_s3/${S3_BUCKET:-ezbillz} "$BACKUP_DIR/storage/"
else
  # Fallback to docker container
  docker run --rm -v "$PWD/$BACKUP_DIR:/backup" --network ezbillz_internal --entrypoint /bin/sh quay.io/minio/mc:latest -c \
    "mc alias set myminio ${S3_ENDPOINT:-http://ezbillz-minio-1:9000} ${S3_ACCESS_KEY_ID:-admin} ${S3_SECRET_ACCESS_KEY:-password} && mc cp -r myminio/${S3_BUCKET:-ezbillz} /backup/storage/"
fi
echo "Storage backup complete."

# 3. Retention Policy
RETENTION_DAYS=${BACKUP_RETENTION_DAYS:-7}
echo "Removing backups older than $RETENTION_DAYS days..."
find "${BACKUP_DIR:-./backups}" -mindepth 1 -maxdepth 1 -type d -mtime +$RETENTION_DAYS -exec rm -rf {} +
echo "Backup finished successfully to $BACKUP_DIR"
