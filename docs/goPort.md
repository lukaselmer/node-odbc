# Porting the native layer from C++ to Go

Status: in progress — target release `3.0.0-goalpha.1`

## Why

The native layer is ~6,650 lines of C++ N-API code (`src/odbc.cpp`, `src/odbc_connection.cpp`,
`src/odbc_statement.cpp`, `src/odbc_cursor.cpp`). It runs inside the Node process, so a misbehaving
ODBC driver takes the whole application with it. With Ingres this is not theoretical: the driver
aborts the process on some syntax errors, and we have repeatedly chased deadlocks and hangs on
`close()` caused by the interaction between the libuv thread pool and the driver.

Go gives us a memory-safe implementation, real concurrency primitives instead of a global libuv
mutex, and — because the port runs as a separate process — fault isolation.

## Architecture

```
 lib/odbc.js ─┐
 lib/Pool.js ─┴─> lib/native/  ── unix socket ──> node-odbc-server (Go) ── cgo ──> libodbc ──> driver
   (unchanged JS API)              framed JSON        one process               unixODBC     Ingres, …
```

The public JS API does not change. `lib/Connection.js`, `lib/Statement.js`, `lib/Cursor.js` and
`lib/Pool.js` keep talking to objects that look exactly like the old native ones; only the module
that produces those objects is swapped from `node-gyp-build` to `lib/native/`.

### Sidecar instead of an in-process addon

Go cannot produce an N-API addon without a C shim, and putting the Go runtime inside Node's process
buys nothing here. A sidecar instead gives us:

- a driver crash kills the sidecar, not the application;
- the ODBC work is off the libuv thread pool entirely, so a slow query cannot starve it;
- the server is a normal Go program that can be run, profiled and tested on its own.

The cost is IPC serialisation per result set. Every call was already asynchronous, so no API
semantics change.

### Process lifecycle

The sidecar is spawned lazily on the first `connect()`. It exits by itself once its last client
socket closes, so it can never outlive the Node process. The client socket is `unref()`ed while
idle and `ref()`ed while requests are in flight, which reproduces the old behaviour where a pending
`AsyncWorker` keeps the event loop alive.

### Running the sidecar on its own

The fault isolation above is worth more once the sidecar is a container of its own: the ODBC driver,
its client libraries and their configuration then leave the application image entirely, which can go
back to a minimal distroless base.

```
 node (distroless)                         ingres sidecar (Actian client)
   dist/odbc.js ── src/native/ ── tcp ──>  node-odbc-server --listen 127.0.0.1:9711
```

Two things differ from the spawned sidecar.

`--listen <address>` makes the server listen on TCP and keep running across clients, rather than
exiting with the first one that disconnects. It stops on `SIGINT` or `SIGTERM`. Because it now
outlives its callers, a client that disconnects takes its own ODBC connections with it: the sessions
it opened are closed and their handles released, so a restarted application cannot leak connections
into a server that stays up.

`NODE_ODBC_SERVER_ADDRESS` makes the client connect to that address instead of spawning a child. The
value is `host:port` or the path of a unix socket. Nothing else changes: the wire protocol is the
same, a lost connection rejects the in-flight requests, and the next call reconnects.

The address is reachable by whoever can reach the port, and the protocol has no authentication, so
bind it to loopback. In a Kubernetes pod that is enough: the containers of a pod share one network
namespace, and nothing outside it can reach `127.0.0.1`.

### Concurrency model

Each ODBC connection is owned by one goroutine pinned with `runtime.LockOSThread()`, fed by a
channel. This serialises the handle the way ODBC expects, keeps every call for a connection on the
same OS thread (some drivers keep thread-local state), and replaces the global mutex the C++ used.

`cancel()` deliberately bypasses that queue and calls `SQLCancel` directly — cancelling from another
thread is the documented ODBC use case, and it is the only thing that can rescue a connection whose
goroutine is stuck inside the driver.

### ODBC bindings

`github.com/alexbrainman/odbc/api` provides the cgo bindings for the core `SQL*` calls.
`go/internal/odbcapi` adds the ones it lacks (catalog functions, `SQLGetInfo`, statement attributes,
`SQLSetPos`, …).

On macOS/arm64 the upstream package hardcodes the Intel Homebrew prefix, so the build sets
`CGO_CFLAGS`/`CGO_LDFLAGS`. On Linux plain `-lodbc` resolves.

## Wire protocol

Length-prefixed frames: a 4-byte big-endian length followed by a JSON object.

```jsonc
// request
{ "id": 7, "target": "connection", "handle": "c1", "method": "query", "args": { } }
// response
{ "id": 7, "result": { } }
{ "id": 7, "error": { "message": "[odbc] ...", "odbcErrors": [ { "state": "42000", "code": 0, "message": "..." } ] } }
```

JSON cannot express every value the old addon returned, so two values are tagged:

| Value    | Encoding               |
| -------- | ---------------------- |
| `BigInt` | `{ "$b": "123" }`      |
| binary   | `{ "$d": "<base64>" }` |

Everything else (`null`, number, string, boolean) maps directly.

## Behaviour that must be preserved

The port reproduces the observable behaviour of the C++, because the test suite and the consuming
application that consumes it depend on it:

- result arrays carry `count`, `columns`, `statement`, `parameters` and `return` as properties;
- errors carry `odbcErrors` with `state`, `code` and `message`;
- the `SQL_BIGINT`/binary/decimal conversions, the chunked `SQLGetData` path and the
  `initialBufferSize` option;
- the driver workarounds: forced `SQLGetData` mode for `(max)`-style columns reporting
  `ColumnSize == 0`, the `HY092` tolerance when a driver rejects row-array binding, `01S02`
  fetch-size substitution, and the 4D date/time column size floors.

## The JavaScript layer

`3.0.0` targets Node 24 and drops the callback API: every asynchronous function returns a Promise.
That removed the duplicated callback and Promise paths through `Connection`, `Statement`, `Cursor`
and `Pool`, and with them the layer that existed only to imitate the addon's callback shape, so the
classes now talk to the sidecar client directly.

| File            | Before | After |
| --------------- | -----: | ----: |
| `Connection.js` |    559 |   196 |
| `Pool.js`       |    467 |   187 |
| `Statement.js`  |    240 |   111 |
| `Cursor.js`     |     92 |    46 |

Calling a function with the wrong signature still throws, because that is a mistake in the calling
code; everything else, including using a closed connection, rejects.

`async` and `dotenv` are no longer dependencies: `Promise.all` replaces the first, and Node's own
`process.loadEnvFile()` the second. The package now has no runtime dependencies at all.

### Toolchain

The sources are TypeScript under `src/`, built to ESM in `dist/` with declarations, and exposed
through an `exports` map. The package is ESM only: there is no CommonJS entry point, and the legacy
`main` and `types` fields are omitted, since `exports` supersedes them. `dist/` is generated, so it is not in the repository; the published package
contains it together with the sidecar binaries in `bin/`.

| Concern    | Tool                                              |
| ---------- | ------------------------------------------------- |
| Types      | `tsc`, `strict` plus the stricter optional checks |
| Tests      | Vitest, replacing Mocha                           |
| Linting    | `oxlint`, replacing ESLint                        |
| Formatting | `oxfmt`, replacing the ESLint stylistic rules     |

`npm run lint` runs all three checks. Vitest runs the test files serially, since they share one
table in one database.

## Error messages that changed

Callers dispatch on `odbcErrors[].state`, the SQLSTATE, not on the message text, so `3.0.0` corrects
the messages the addon had accumulated rather than carrying the typos forward:

| C++                                                                                                                                                                        | Go                                                                             |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `[node-odbc] Error in Statement::BindAsyncWorker::Bind: The number of parameters in the prepared statement (2) doesn't match the number of parameters passed to bind (3}.` | `[odbc] The prepared statement takes 2 parameters, but 3 were passed to bind.` |
| `[odbc] CallProcedureAsyncWorker::Execute: Stored procedure 'x' doesn't exist`                                                                                             | `[odbc] Stored procedure 'x' doesn't exist`                                    |
| `... number of parameter markers in the statment`                                                                                                                          | `... number of parameter markers in the statement`                             |
| `... the procedure expects and and the number of passed parameters`                                                                                                        | `... the procedure expects and the number of passed parameters`                |
| `[odbc] Error setting retrieving the changed login timeout`                                                                                                                | `[odbc] Error retrieving the changed login timeout`                            |
| `[odbc] Error closing the Statement`                                                                                                                                       | `[odbc] Error closing the statement`                                           |

## Verification

### PostgreSQL

`DBMS=postgres npm test` runs the existing mocha suite through unixODBC against a local PostgreSQL.
Both implementations were run against the same database state:

| Build                    | passing | pending | failing |
| ------------------------ | ------: | ------: | ------: |
| C++                      |     171 |      23 |       2 |
| Go                       |     172 |      23 |       1 |
| Go, promise-only         |      92 |       6 |       1 |
| Go, TypeScript on Vitest |      90 |       4 |       1 |

The suite shrank with the callback API it was testing. The remaining failure asserts that the pool
holds `initialSize` connections the moment `pool()` resolves, which contradicts the documented
behaviour of resolving after the first connection; it fails on the C++ build too.

### Ingres

The Actian ODBC client only ships for Linux x86_64, so the Ingres checks run in a container:

- `test/ingres/run.sh` builds an image with the Actian client and the sidecar. Use it to check that
  the driver loads and that connection errors surface correctly; it does not configure a vnode, so
  it cannot open an authenticated session.
- `test/ingres/runInPod.sh` runs `test/ingres/smoke.js` inside an already running pod of the
  consuming application, which has a configured client and a resolvable vnode. Same image, same
  driver and same database as the deployment.

Both read their configuration from `test/ingres/.env`, which is gitignored because the host, the
credentials and the pinned driver build are internal; `test/ingres/.env.example` documents the
variables, and the values are written down with the consuming application, in its own repository.

Against the test database every check passes: connect, simple and parameterised queries,
transactions, and a catalog query. The interesting one is the failure path that motivated this port —
a syntax error arrives as a rejected promise carrying `odbcErrors: [{ state: "42000" }]`, and the
connection is still usable afterwards.

Run against the same database and driver, the C++ addon and the Go sidecar produce the same message,
the same SQLSTATE and the same recovery.

### Unit tests

Go-level unit tests cover the protocol framing, value encoding and the SQL type conversion table.

## Packaging

The client and the sidecar are published separately.

| package                                     | holds                 | size    |
| ------------------------------------------- | --------------------- | ------- |
| `@lukaselmer/odbc`                          | the JavaScript client | ~300 KB |
| `@lukaselmer/odbc-server-<platform>-<arch>` | one prebuilt sidecar  | ~4 MB   |

The client declares all four server packages as optional dependencies, and each of those declares
the `os` and `cpu` it is built for, so a package manager installs exactly the one the machine can
run. That is the arrangement esbuild and swc use. Installing used to mean four binaries and ~17 MB.

`serverBinaryPath()` looks in three places, in order: `NODE_ODBC_SERVER`, a local build under
`bin/<platform>/` so that working in this repository needs no packaging step, and finally the
platform package. The specifier for that last one is built at runtime, which is also what stops a
bundler from trying to resolve a package that exists on one platform only.

Two things fall out of the split. An application that reaches a sidecar container over
`NODE_ODBC_SERVER_ADDRESS` can bundle the client and ship no `node_modules` at all, because there is
no binary to keep out of the bundle. And an image that needs only the server installs only the
server package, rather than pulling the whole thing and deleting the parts it did not want.

The version of the optional dependencies has to match the client's, or the client resolves to
nothing. `npm run build:packages` refuses to assemble anything when they disagree, and the release
workflow runs it before it publishes.
