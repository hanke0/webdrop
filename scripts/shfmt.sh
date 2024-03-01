#!/usr/bin/env bash

set -Eeo pipefail

cd "$(dirname "$0")/.."
pwd

shfmt -w -s scripts/*
