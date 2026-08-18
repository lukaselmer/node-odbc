#!/bin/bash
# Runs the Ingres smoke test in a Linux x86_64 container.
#
# The Actian ODBC client only ships for Linux x86_64 and lives in the assets
# repository, so the build context is assembled from both trees here.
#
# Usage:
#   INGRES_HOST=... INGRES_USER=... \
#   INGRES_PASSWORD=... test/ingres/run.sh [assets-checkout]

set -euo pipefail

repository="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
assets="${1:-$(cd "$repository/../../assets" && pwd)}"
context="$(mktemp -d)"
trap 'rm -rf "$context"' EXIT

: "${INGRES_HOST:?set the Ingres host}"
: "${INGRES_USER:?set the Ingres user}"
: "${INGRES_PASSWORD:?set the Ingres password}"

mkdir -p "$context/apps/<app>" "$context/node-odbc"
cp -r "$assets/apps/<app>/actian" "$context/apps/<app>/"
cp -r "$repository/lib" "$repository/go" "$repository/test" "$repository/package.json" "$context/node-odbc/"
cp "$repository/test/ingres/Dockerfile" "$context/Dockerfile"

docker build --platform linux/amd64 -t node-odbc-ingres-test "$context"

docker run --rm --platform linux/amd64 \
  -e INGRES_HOST \
  -e INGRES_USER \
  -e INGRES_PASSWORD \
  node-odbc-ingres-test
