#!/bin/bash
# Runs the Ingres smoke test inside a running <app> pod.
#
# The pod already has a configured Actian client and a resolvable vnode, which
# makes it the highest-fidelity place to exercise the sidecar: same image, same
# driver, same database as production. The container image built by run.sh is
# only used to produce a Linux binary.
#
# Usage:
#   test/ingres/runInPod.sh <pod> [namespace] [kube-context]

set -euo pipefail

repository="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
pod="${1:?pass the <app> pod name}"
namespace="${2:-<namespace>}"
context="${3:-<kube-context>}"
container=<app>
bundle="$(mktemp -d)"
trap 'rm -rf "$bundle"' EXIT

echo "building the linux binary"
docker create --name node-odbc-extract --platform linux/amd64 node-odbc-ingres-test >/dev/null
docker cp node-odbc-extract:/app/bin/linux-x64/node-odbc-server "$bundle/node-odbc-server" >/dev/null
docker rm node-odbc-extract >/dev/null

mkdir -p "$bundle/podpkg/bin/linux-x64"
cp -r "$repository/lib" "$bundle/podpkg/"
cp "$repository/test/ingres/smoke.js" "$bundle/podpkg/smoke.js"
mv "$bundle/node-odbc-server" "$bundle/podpkg/bin/linux-x64/"
sed -i.bak "s|require('../../lib/odbc')|require('./lib/odbc')|" "$bundle/podpkg/smoke.js"
rm -f "$bundle/podpkg/smoke.js.bak"
tar -czf "$bundle/podpkg.tgz" -C "$bundle" podpkg

echo "copying into $pod"
kubectl --context "$context" cp "$bundle/podpkg.tgz" "$namespace/$pod:/tmp/podpkg.tgz" -c "$container"

echo "running"
kubectl --context "$context" exec -n "$namespace" "$pod" -c "$container" -- bash -c '
  set -e
  cd /tmp && tar -xzf podpkg.tgz && cd podpkg
  set -a; source /opt/Actian/Actian_Client/ingres/.ingACsh; set +a
  export ODBCSYSINI=/etc/odbc ODBCINI=/etc/odbc/odbc.ini
  export NODE_PATH=/app/node_modules
  export NODE_ODBC_SERVER=/tmp/podpkg/bin/linux-x64/node-odbc-server
  node smoke.js
  status=$?
  rm -rf /tmp/podpkg /tmp/podpkg.tgz
  exit $status
'
