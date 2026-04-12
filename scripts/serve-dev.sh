#!/usr/bin/env bash

set -Eeo pipefail

cd "$(dirname "$0")/.."
pwd

export HOST="${HOST:-localhost}"
export PORT="${PORT:-8080}"
export NODE_ENV=development

npm run build -w @webdrop/server

case "$1" in
peer)
	node server/webdrop-server.cjs
	exit 0
	;;
esac

node server/webdrop-server.cjs &
peerpid=$!
trap "kill $peerpid" TERM INT EXIT

sleep 1
nc -vz 127.0.0.1 "$PORT"

npm run dev -w @webdrop/web
wait
