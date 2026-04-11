#!/usr/bin/env bash

set -Eeo pipefail

cd "$(dirname "$0")/.."
pwd

rm -rf release
mkdir release

npm ci
NODE_ENV=production npm run build

cp -r web/dist release/
cp server/webdrop-server.cjs release/
cp .env release/.env
chmod +x release/webdrop-server.cjs
tar -czf webdrop.tar.gz -C release .
