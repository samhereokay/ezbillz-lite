#!/bin/bash
set -e

# Load environment variables
if [ -f "deploy/env/.env.prod" ]; then
  export $(grep -v '^#' deploy/env/.env.prod | xargs)
else
  echo "Error: deploy/env/.env.prod not found!"
  exit 1
fi

echo "Starting EZBILLZ Production Backup..."
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="${BACKUP_DIR:-./backups}/$TIMESTAMP"
mkdir -p "$BACKUP_DIR"

# 1. Database Backup
echo "Dumping database..."
DB_CONTAINER=$(docker compose --env-file deploy/env/.env.prod -f docker-compose.yml -f deploy/docker-compose.prod.yml ps -q postgres)
if [ -z "$DB_CONTAINER" ]; then
  echo "Error: PostgreSQL container is not running!"
  exit 1
fi

docker exec $DB_CONTAINER pg_dump -U ezbillz -F c -d ezbillz > "$BACKUP_DIR/db_$TIMESTAMP.dump"
echo "Database backup complete."

# 2. Storage Backup (MinIO)
echo "Backing up storage..."
MINIO_CONTAINER=$(docker compose --env-file deploy/env/.env.prod -f docker-compose.yml -f deploy/docker-compose.prod.yml ps -q minio)
if [ -z "$MINIO_CONTAINER" ]; then
  echo "Error: MinIO container is not running!"
  exit 1
fi

echo -e "$MINIO_ROOT_USER\n$MINIO_ROOT_PASSWORD" | docker exec -i $MINIO_CONTAINER mc alias set myminio http://localhost:9000
# Copy data directly to the host backup directory using docker run or just copy the volume
# Since mc is inside minio, and minio data is in a volume, we can use a temporary container to extract it
docker run --rm -v "ezbillz_minio_data_prod:/data:ro" -v "$PWD/$BACKUP_DIR:/backup" alpine sh -c "cp -r /data /backup/storage"
echo "Storage backup complete."

# 3. Retention Policy
RETENTION_DAYS=${BACKUP_RETENTION_DAYS:-7}
echo "Removing backups older than $RETENTION_DAYS days..."
find "${BACKUP_DIR:-./backups}" -mindepth 1 -maxdepth 1 -type d -mtime +$RETENTION_DAYS -exec rm -rf {} +
echo "Backup finished successfully to $BACKUP_DIR"
