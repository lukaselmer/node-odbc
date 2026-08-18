#!/bin/bash
# Runs the Ingres smoke test in a Linux x86_64 container.
#
# The Actian ODBC client only ships for Linux x86_64 and is not redistributable
# here, so the archive and the matching odbc.ini are taken from the directory
# named by ACTIAN_ASSETS_DIR. Configure everything in test/ingres/.env, which is
# gitignored; see .env.example.

set -euo pipefail

repository="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$repository/test/ingres/loadEnv.sh"

requireVariables INGRES_HOST INGRES_USER INGRES_PASSWORD INGRES_DSN INGRES_VNODE \
  ACTIAN_ASSETS_DIR ACTIAN_CLIENT_ARCHIVE

context="$(mktemp -d)"
trap 'rm -rf "$context"' EXIT

mkdir -p "$context/actian" "$context/odbc" "$context/node-odbc"
cp "$ACTIAN_ASSETS_DIR/$ACTIAN_CLIENT_ARCHIVE" "$context/actian/"
cp "$ACTIAN_ASSETS_DIR/odbc.ini" "$ACTIAN_ASSETS_DIR/odbcinst.ini" "$context/odbc/"
cp -r "$repository/src" "$repository/go" "$repository/test" "$repository/package.json" "$context/node-odbc/"
cp "$repository/test/ingres/Dockerfile" "$context/Dockerfile"

docker build --platform linux/amd64 \
  --build-arg "ACTIAN_CLIENT_ARCHIVE=$ACTIAN_CLIENT_ARCHIVE" \
  -t node-odbc-ingres-test "$context"

docker run --rm --platform linux/amd64 \
  -e INGRES_HOST -e INGRES_USER -e INGRES_PASSWORD -e INGRES_DSN -e INGRES_VNODE \
  node-odbc-ingres-test
