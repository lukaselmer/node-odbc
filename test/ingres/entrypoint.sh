#!/bin/bash
# Bootstraps the Actian client the way the eng-tooling image does, then runs
# the smoke test. The vnode has to exist before the driver can resolve the DSN.

set -euo pipefail

source /opt/Actian/Actian_Client/ingres/.ingACsh

# The installer keys its configuration by the host name of the machine it ran
# on, which for a container image is the build host. Adopt that name instead of
# the current one, otherwise ingstart finds no servers to start.
II_HOSTNAME=$(sed -n 's/^ii\.\([^.]*\)\.gcn\..*/\1/p' \
  "$II_SYSTEM/ingres/files/config.dat" | head -1)
export II_HOSTNAME
export ODBCSYSINI=/etc/odbc
export ODBCINI=/etc/odbc/odbc.ini

ingstart >/dev/null
sleep 3

ingstatus

cat > /tmp/netutil_commands.txt <<EOF
create global connection ${INGRES_VNODE} ${INGRES_HOST} tcp_ip II
create global login ${INGRES_VNODE} ${INGRES_USER} ${INGRES_PASSWORD}
EOF

netutil -file /tmp/netutil_commands.txt >/dev/null
rm /tmp/netutil_commands.txt

exec node test/ingres/smoke.js
