#!/bin/bash
set -e

# Load environment variables
if [ -f "deploy/env/.env.prod" ]; then
  export $(grep -v '^#' deploy/env/.env.prod | xargs)
else
  echo "Error: deploy/env/.env.prod not found!"
  exit 1
fi

# EZBILLZ Production Restore Script
if [ "$RESTORE_CONFIRM" != "YES" ]; then
  echo "============================================================"
  echo " WARNING: THIS OPERATION WILL OVERWRITE PRODUCTION DATA! "
  echo " TARGET DB: postgres://${POSTGRES_USER}@postgres:5432/${POSTGRES_DB}"
  echo "============================================================"
  echo "To proceed, you must run this script with RESTORE_CONFIRM=YES."
  echo "Example: RESTORE_CONFIRM=YES ./deploy/scripts/restore.sh ./backups/20260913_120000"
  exit 1
fi

if [ -z "$1" ]; then
  echo "Usage: RESTORE_CONFIRM=YES ./deploy/scripts/restore.sh <path_to_backup_directory>"
  exit 1
fi

BACKUP_DIR="$1"

if [ ! -d "$BACKUP_DIR" ]; then
  echo "Error: Directory $BACKUP_DIR does not exist."
  exit 1
fi

echo "Starting EZBILLZ Restore from $BACKUP_DIR..."

DB_CONTAINER=$(docker compose -f deploy/docker-compose.prod.yml ps -q postgres)
if [ -z "$DB_CONTAINER" ]; then
  echo "Error: PostgreSQL container is not running!"
  exit 1
fi

# 1. Database Restore
DUMP_FILE=$(ls "$BACKUP_DIR"/db_*.dump | head -n 1)
if [ -f "$DUMP_FILE" ]; then
  echo "Restoring database from $DUMP_FILE..."
  # Terminate existing connections before dropping DB objects
  docker exec $DB_CONTAINER psql -U ezbillz -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'ezbillz' AND pid <> pg_backend_pid();"
  
  cat "$DUMP_FILE" | docker exec -i $DB_CONTAINER pg_restore -U ezbillz -d ezbillz --clean --no-owner
  echo "Database restore complete."
else
  echo "Warning: No database dump found in $BACKUP_DIR"
fi

# 2. Storage Restore
if [ -d "$BACKUP_DIR/storage" ]; then
  echo "Restoring storage..."
  docker run --rm -v "minio_data_prod:/data" -v "$PWD/$BACKUP_DIR:/backup:ro" alpine sh -c "cp -a /backup/storage/. /data/ && chown -R 1000:1000 /data"
  echo "Storage restore complete."
else
  echo "Warning: No storage backup found in $BACKUP_DIR"
fi

echo "Restore finished successfully!"
