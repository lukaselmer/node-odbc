#!/bin/bash
# Runs the Ingres smoke test inside an already running pod.
#
# The pod has a configured Actian client and a resolvable vnode, which makes it
# the highest-fidelity place to exercise the sidecar: same image, same driver
# and same database as the deployed application. The container image built by
# run.sh is only used to produce a Linux binary.
#
# Configure the target in test/ingres/.env, which is gitignored; see
# .env.example.

set -euo pipefail

repository="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$repository/test/ingres/loadEnv.sh"

requireVariables KUBE_CONTEXT KUBE_NAMESPACE KUBE_POD KUBE_CONTAINER INGRES_DSN

bundle="$(mktemp -d)"
trap 'rm -rf "$bundle"' EXIT

echo "extracting the linux binary"
docker create --name node-odbc-extract --platform linux/amd64 node-odbc-ingres-test >/dev/null
docker cp node-odbc-extract:/app/bin/linux-x64/node-odbc-server "$bundle/node-odbc-server" >/dev/null
docker rm node-odbc-extract >/dev/null

mkdir -p "$bundle/podpkg/bin/linux-x64"
cp -r "$repository/src" "$bundle/podpkg/"
cp "$repository/test/ingres/smoke.ts" "$bundle/podpkg/smoke.ts"
cp "$repository/package.json" "$bundle/podpkg/package.json"
mv "$bundle/node-odbc-server" "$bundle/podpkg/bin/linux-x64/"
sed -i.bak "s|'../../src/odbc.ts'|'./src/odbc.ts'|" "$bundle/podpkg/smoke.ts"
rm -f "$bundle/podpkg/smoke.ts.bak"
tar -czf "$bundle/podpkg.tgz" -C "$bundle" podpkg

echo "copying into the pod"
kubectl --context "$KUBE_CONTEXT" cp "$bundle/podpkg.tgz" \
  "$KUBE_NAMESPACE/$KUBE_POD:/tmp/podpkg.tgz" -c "$KUBE_CONTAINER"

echo "running"
kubectl --context "$KUBE_CONTEXT" exec -n "$KUBE_NAMESPACE" "$KUBE_POD" -c "$KUBE_CONTAINER" \
  -- env INGRES_DSN="$INGRES_DSN" bash -c '
    set -e
    cd /tmp && tar -xzf podpkg.tgz && cd podpkg
    set -a; source /opt/Actian/Actian_Client/ingres/.ingACsh; set +a
    export ODBCSYSINI=/etc/odbc ODBCINI=/etc/odbc/odbc.ini
    export NODE_PATH=/app/node_modules
    export NODE_ODBC_SERVER=/tmp/podpkg/bin/linux-x64/node-odbc-server
    node --experimental-strip-types smoke.ts
    status=$?
    rm -rf /tmp/podpkg /tmp/podpkg.tgz
    exit $status
  '
