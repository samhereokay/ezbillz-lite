#!/bin/bash
set -e

echo "Running healthcheck for EZBILLZ services..."

SERVICES="postgres minio app nginx"
HEALTHY=true

for service in $SERVICES; do
  STATUS=$(docker compose -f deploy/docker-compose.prod.yml ps -q $service | xargs -r docker inspect --format="{{.State.Status}}")
  if [ "$STATUS" != "running" ]; then
    echo "❌ Service $service is NOT running. Status: $STATUS"
    HEALTHY=false
  else
    echo "✅ Service $service is running."
  fi
done

if [ "$HEALTHY" = true ]; then
  echo "All services are running."
  exit 0
else
  echo "Some services are down!"
  exit 1
fi
