#!/usr/bin/env bash

set -Eeo pipefail

export NODE_ENV=production

cd "$(dirname "$0")/.."
pwd

rm -rf release
mkdir release

npm ci
npm run build

cd server
npm ci
npm run build
cd ..

cp -r dist release/
cp server/package.json release/package.json
cp server/package-lock.json release/package-lock.json
cp server/server.js release/server.js
cp .env release/.env
cd release
npm ci --omit=dev --omit=optional --omit=peer --include=prod --install-strategy nested
tar -czf ../webdrop.tar.gz .
