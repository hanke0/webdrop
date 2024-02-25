#!/usr/bin/env bash

set -Eeo pipefail

cd "$(dirname "$0")/.."
pwd

npm i 
npm run build

rm -rf release
mkdir release
cp -r dist release/
cp -r node_modules release/node_modules
cp package.json release/package.json
cp server.cjs release/server.cjs
cd release
tar -czf ../webdrop.tar.gz .
