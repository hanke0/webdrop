#!/usr/bin/env bash

set -Eeo pipefail

yarn install
yarn build

rm -rf dist
mkdir dist
cp -cr build dist/
cp -cr node_modules dist/node_modules
cp package.json dist/package.json
cp yarn.lock dist/yarn.lock
cp server.js dist/server.js

cd dist
tar -czvf webdrop.tar.gz .
