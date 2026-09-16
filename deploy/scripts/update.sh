#!/bin/bash
set -e

echo "Starting EZBILLZ Update process..."

echo "1. Taking a backup before update..."
./deploy/scripts/backup.sh

echo "2. Pulling latest code..."
git pull origin main || echo "Not a git repository or pull failed, proceeding with local files..."

echo "3. Redeploying stack..."
./deploy/scripts/deploy.sh

echo "4. Running healthcheck..."
./deploy/scripts/healthcheck.sh

echo "Update completed successfully!"
