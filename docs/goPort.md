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

The port reproduces the observable behaviour of the C++ exactly, including its quirks, because the
test suite and `apps/<app>` in the assets repo depend on it:

- result arrays carry `count`, `columns`, `statement`, `parameters` and `return` as properties;
- errors carry `odbcErrors` with `state`, `code` and `message`, and the same message strings;
- the `SQL_BIGINT`/binary/decimal conversions, the chunked `SQLGetData` path and the
  `initialBufferSize` option;
- the driver workarounds: forced `SQLGetData` mode for `(max)`-style columns reporting
  `ColumnSize == 0`, the `HY092` tolerance when a driver rejects row-array binding, `01S02`
  fetch-size substitution, and the 4D date/time column size floors.

## Verification

### PostgreSQL

`DBMS=postgres npm test` runs the existing mocha suite through unixODBC against a local PostgreSQL.
Both implementations were run against the same database state:

| Build | passing | pending | failing |
| ----- | ------: | ------: | ------: |
| C++   |     171 |      23 |       2 |
| Go    |     172 |      23 |       1 |

The one remaining failure is `callProcedure` against a procedure that the PostgreSQL driver does not
report through `SQLProcedures`; the C++ build fails it identically, with the same message. The
second C++ failure is a flaky prepared-statement test.

### Ingres

The Actian ODBC client only ships for Linux x86_64, so the Ingres checks run in a container:

- `test/ingres/run.sh` builds an image with the Actian client and the sidecar. Use it to check that
  the driver loads and that connection errors surface correctly; it does not configure a vnode, so
  it cannot open an authenticated session.
- `test/ingres/runInPod.sh <pod>` runs `test/ingres/smoke.js` inside a running `<app>`
  pod, which already has a configured client and a resolvable vnode. Same image, same driver, same
  database as production.

Against the the test environment database (`<database>`) every check passes: connect, simple and parameterised
queries, transactions, and a catalog query returning 1238 tables. The interesting one is the failure
path that motivated this port — a syntax error arrives as a rejected promise carrying
`odbcErrors: [{ state: "42000" }]`, and the connection is still usable afterwards.

Run against the same database and driver, the C++ addon and the Go sidecar produce the same message,
the same SQLSTATE and the same recovery.

### Unit tests

Go-level unit tests cover the protocol framing, value encoding and the SQL type conversion table.
