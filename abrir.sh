#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
mkdir -p data
npm run build >>data/build.log 2>&1
exec node_modules/.bin/electron . "$@" >>data/app.log 2>&1
