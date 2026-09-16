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

echo "Starting Docker Compose services..."
docker compose -f deploy/docker-compose.prod.yml up -d --build

echo "Waiting for PostgreSQL to be healthy..."
sleep 5
until docker inspect --format "{{json .State.Health.Status }}" $(docker compose -f deploy/docker-compose.prod.yml ps -q postgres) | grep -q '"healthy"'; do
  printf "."
  sleep 2
done
echo -e "\nPostgreSQL is healthy!"

echo "Running Prisma Migrations..."
docker compose -f deploy/docker-compose.prod.yml exec -T app npx prisma migrate deploy

echo "======================================"
echo "    DEPLOYMENT COMPLETED SUCCESSFULLY "
echo "======================================"
