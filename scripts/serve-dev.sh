#!/usr/bin/env bash

set -Eeo pipefail

cd "$(dirname "$0")/.."
pwd

export WEB_DROP_PEER_PATH=/peer
export WEB_DROP_PEER_PORT=10234
export WEB_DROP_PEER_HOST=/
export PORT=10234
export NODE_ENV=development

cd server
npm run build

case "$1" in
peer)
	node server.js
	exit 0
	;;
esac

node server.js &
peerpid=$!
trap "kill $peerpid" TERM INT EXIT
cd ..

sleep 1
nc -vz localhost 10234

npm run dev
wait
