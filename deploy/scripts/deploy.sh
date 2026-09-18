#!/bin/bash
set -e

echo "======================================"
echo "    EZBILLZ PRODUCTION DEPLOYMENT     "
echo "======================================"

if [ ! -f "deploy/env/.env.prod" ]; then
  echo "Error: deploy/env/.env.prod not found!"
  echo "Please copy deploy/env/.env.example to deploy/env/.env.prod and configure your secrets."
  exit 1
fi

COMPOSE_CMD="docker compose --env-file deploy/env/.env.prod -f docker-compose.yml -f deploy/docker-compose.prod.yml"

echo "Building production app image..."
$COMPOSE_CMD build

echo "Starting PostgreSQL and storage-init..."
$COMPOSE_CMD up -d postgres storage-init

echo "Waiting for PostgreSQL to be healthy..."
sleep 5
until docker inspect --format "{{json .State.Health.Status }}" $($COMPOSE_CMD ps -q postgres) | grep -q '"healthy"'; do
  printf "."
  sleep 2
done
echo -e "\nPostgreSQL is healthy!"

echo "Validating Caddy configuration..."
docker run --rm --env-file deploy/env/.env.prod -v $PWD/deploy/caddy/Caddyfile:/etc/caddy/Caddyfile caddy:2-alpine caddy validate --config /etc/caddy/Caddyfile

echo "Running Prisma Migrations..."
$COMPOSE_CMD run --rm --no-deps app npx prisma migrate deploy

echo "Starting full stack (app, minio, caddy)..."
$COMPOSE_CMD up -d minio app caddy

echo "Verifying containers..."
APP_STATUS=$($COMPOSE_CMD ps -q app)
CADDY_STATUS=$($COMPOSE_CMD ps -q caddy)

if [ -z "$APP_STATUS" ]; then
  echo "Error: App container is not running!"
  exit 1
fi

if [ -z "$CADDY_STATUS" ]; then
  echo "Error: Caddy container is not running!"
  exit 1
fi

echo "======================================"
echo "    DEPLOYMENT COMPLETED SUCCESSFULLY "
echo "======================================"
