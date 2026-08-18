# Runs the Go sidecar against a real Ingres database through the Actian ODBC
# client.
#
# The client only ships for Linux x86_64, so this is the only way to exercise
# the Ingres driver from a macOS or arm64 machine. The client archive and the
# odbc.ini selecting it are not in this repository; test/ingres/run.sh copies
# them into the build context from the directory named by ACTIAN_ASSETS_DIR.

FROM --platform=linux/amd64 golang:1.26-bookworm AS build

RUN apt-get update && apt-get install -y --no-install-recommends unixodbc-dev \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /src
COPY node-odbc/go/ ./go/
RUN cd go && go build -trimpath -o /out/node-odbc-server ./cmd/node-odbc-server

FROM --platform=linux/amd64 node:24-slim

ENV II_SYSTEM=/opt/Actian/Actian_Client
ENV II_INSTALLATION=AC
ENV PATH=$PATH:/opt/Actian/Actian_Client/ingres/bin:/opt/Actian/Actian_Client/ingres/utility
ENV LD_LIBRARY_PATH=/opt/Actian/Actian_Client/ingres/lib
ENV ODBCSYSINI=/etc/odbc
ENV ODBCINI=/etc/odbc/odbc.ini
ENV II_LOG=/tmp

# The Actian driver needs a newer libstdc++ than bookworm ships.
RUN echo 'deb http://deb.debian.org/debian trixie main' > /etc/apt/sources.list.d/trixie.list \
  && apt-get update -y \
  && apt-get install -y --no-install-recommends libstdc++6 -t trixie \
  && rm /etc/apt/sources.list.d/trixie.list \
  && apt-get update -y \
  && apt-get install -y --no-install-recommends unixodbc sudo procps \
  && rm -rf /var/lib/apt/lists/*

# The Actian installer expects a dedicated owner account and uses sudo.
RUN useradd -m -s /bin/bash actian

ARG ACTIAN_CLIENT_ARCHIVE
COPY actian/ /tmp/actian/
RUN cd /tmp/actian \
  && tar -xzf "$ACTIAN_CLIENT_ARCHIVE" \
  && cd "$(basename "$ACTIAN_CLIENT_ARCHIVE" .tgz)" \
  && ./client_install.sh -express -acceptlicense \
  && chown -R actian:actian /opt/Actian \
  && rm -rf /tmp/actian

RUN mkdir -p /etc/odbc
COPY odbc/odbc.ini /etc/odbc/odbc.ini
COPY odbc/odbcinst.ini /etc/odbc/odbcinst.ini

WORKDIR /app
COPY node-odbc/lib/ ./lib/
COPY node-odbc/package.json ./
COPY node-odbc/test/ingres/ ./test/ingres/
COPY --from=build /out/node-odbc-server ./bin/linux-x64/node-odbc-server

RUN npm install --omit=dev --no-package-lock --no-audit --no-fund \
  && chmod +x test/ingres/entrypoint.sh \
  && chown -R actian:actian /app /etc/odbc

# The Actian client refuses to start as root.
USER actian

ENTRYPOINT ["test/ingres/entrypoint.sh"]
