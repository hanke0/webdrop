#!/usr/bin/env bash

set -Eeo pipefail

yarn install
yarn build

rm -rf dist
mkdir dist
cp -r build dist/
cp -r node_modules dist/node_modules
cp package.json dist/package.json
cp yarn.lock dist/yarn.lock
cp server.js dist/server.js

cd dist
tar -czf webdrop.tar.gz .
