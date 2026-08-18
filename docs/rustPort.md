# Rust port of the native addon

`3.0.0-rstalpha.1` replaces the C++ N-API addon (`src/*.cpp`, ~6.6k lines) with Rust, and
narrows the public API to what we actually use.

## Why

- Memory safety for the buffer arithmetic that dominates this binding — column buffers,
  the growing `SQLGetData` long-data loop, parameter marshalling. All four memory bugs
  found during the Ingres investigation lived there.
- Thread affinity for the Actian/Ingres driver becomes a property the compiler checks
  rather than a convention seventeen worker classes each had to remember.
- No `node-gyp` toolchain on consumer machines.

## Scope

Ported from `main` (2.7.0). The API is cut to what the application that depends on this
package actually calls, which is about a third of the 2.x surface.

**Kept.** `connect`, `pool`, `odbcConstants`; `Connection.query`, `createStatement`,
`close`, `beginTransaction`, `commit`, `rollback`, `tables`, `columns`, and the `connected`
getter; `Statement.prepare`, `bind`, `execute`, `close`. Results keep their shape — an `Array` of
row objects carrying `count`, `columns`, `statement`, `parameters` and `return` — and
errors keep theirs: an `Error` with an `odbcErrors` array of `{ state, code, message }`.

**Removed.** The whole `Cursor` class · `callProcedure` · `primaryKeys` · `foreignKeys` ·
`cancel` · `getUsername` · `setIsolationLevel` · the `autocommit`, `connectionTimeout` and
`loginTimeout` getters · every query option (`cursor`, `fetchSize`, `timeout`,
`initialBufferSize`, `fetchArray`).

Removing the query options is the point rather than a side effect: it takes out
`SQL_ATTR_ROW_ARRAY_SIZE` block fetches, row-status arrays, `SQLSetPos` and the `HY092`
fallback for drivers that reject block fetches. Ingres is exactly the kind of driver that
misbehaves there, and rows are now read one at a time with `SQLGetData`, which is the most
portable path ODBC offers.

## Layout

```
src/          Rust: the addon
lib/          TypeScript: the JavaScript API, bundled to dist/ by tsdown
test/         vitest suite; test/manual holds scripts that need a database
scripts/      build helpers, including the constants generator
```

`lib/constants.generated.ts` is produced from `src/constants.rs` by
`scripts/generateConstants.mjs`, so the 54 ODBC constant names cannot drift from the values
Rust exports. It runs as part of `build:ts`.

## Crate layout

```
build.rs           link the driver manager (unixodbc / odbc32)
src/lib.rs         module init: connect(), odbcConstants
src/constants.rs   the odbcConstants table
src/error.rs       diagnostics -> JS Error with odbcErrors
src/thread.rs      the per-connection actor thread
src/session.rs     a live connection and its prepared statements
src/query.rs       execute, describe, fetch
src/value.rs       result sets in plain Rust
src/connection.rs  ODBCConnection
src/statement.rs   ODBCStatement
```

## Choices

**`odbc-api` 29.** Two safe wrappers were evaluated against writing our own layer on
`odbc-sys`.

`odbc` (Koka/odbc-rs) is out on the facts: last released 2020-05-09, 1,899 lines, pinned to
`odbc-sys 0.8.2` against today's `0.31`, and missing almost everything we need.

`odbc-api` was initially rejected here on two grounds, **both of which were wrong**:

- _"It lacks the catalog functions."_ It has `primary_keys`, `foreign_keys`, `columns` and
  `tables`. Only `SQLProcedureColumns`, `SQLSetCursorName` and `SQLCancel` are genuinely
  absent — and all three are needed only by features this release removes, so after the
  scope cut there is no gap at all.
- _"Borrowed handle lifetimes cannot live in a `'static` napi object."_
  `SharedConnection<'env> = Arc<Mutex<Connection<'env>>>` implements `StatementParent`, so
  `into_prepared` yields `Prepared<StatementConnection<SharedConnection<'static>>>` — owned,
  `Send`, `'static`. It solves the problem better than the hand-rolled RAII layer that was
  started here, and `Connection`, `StatementImpl` and `StatementConnection` already carry
  the correct `Send` impls.

`odbc-api` also supplies `DiagnosticStream`, which is what lets `odbcErrors` keep every
diagnostic record instead of just the first. That matters: our caller decides whether a
connection was lost by scanning all records for SQLSTATE class `08`, which is frequently not
record one.

**`napi-rs` v3, with no libuv worker parking.** The C++ ran each operation in an
`Napi::AsyncWorker` on a libuv pool thread. Here a JS method queues a closure on the
connection's thread and returns; the result comes back through a `ThreadsafeFunction`. No
pool thread is held for the length of a query, so concurrent queries no longer starve
unrelated `fs`/`dns`/`crypto` work past four in flight.

**One OS thread per connection.** The Actian/Ingres driver keeps session state per thread
and deadlocks when a connection-level call arrives from a thread other than the one that
used the session. Every ODBC call for a connection runs on its own thread, including
`SQLDriverConnect` and the final `SQLDisconnect`, and the thread is joined on `close()` —
the driver only releases that state once the thread is gone.

The thread _owns_ the session rather than sharing it behind a lock, so affinity is checked
at compile time. Statements are held in the session and addressed by id from JavaScript,
which is why no ODBC handle ever needs to cross a thread boundary.

## Threading: why not something else

The options recorded in the earlier threading analysis were reconsidered. This is A + B. Option C (a bounded pool with connection affinity) still
rests on an assumption nobody has tested — that the driver tolerates two sessions on one
thread — and option D (one global thread) serialises all database work in the process,
which is wrong for a pooled application.

Worth noting: our caller passes `pool(connectionString)` as a bare string, so
`maxSize` is `Number.MAX_SAFE_INTEGER`. The "unbounded threads" follow-up is therefore
really _set a pool `maxSize`_, not a threading redesign. Because the actor interface is
`enqueue`/`run_if_idle`, moving to option C later changes where the thread comes from and
nothing else.

## Baseline

The Ingres threading work that exists in C++ on the unmerged stack !9/!10/!11 is not ported
line by line — it is redone natively. The findings behind it still apply in full.

## Deliberate behaviour changes

Beyond the removals, two C++ defects are not reproduced:

1. A string `cursor` option stored a pointer to a destroyed `std::string`. The option is
   gone.
2. `GetODBCErrors` built a fallback diagnostic record but left `errorCount` at zero, so
   `odbcErrors` came back empty whenever `SQL_DIAG_NUMBER` itself failed.

## Distribution

`prebuildify` + `node-gyp-build` are replaced by `napi build`; the artefact still lands in
`prebuilds/{platform}-{arch}/`, so how `lib/odbc.js` loads the addon is unchanged.

Linux x86_64 is cross-compiled from any host with `npm run build:linux-x64`, which uses
`cargo-zigbuild` and fetches a Linux `libodbc` for the linker to resolve against — the real
driver manager is what the addon binds to at runtime. The result has been verified against
the testlab Ingres, so CI needs no x86_64 runner and no container to produce it.

## Verification

- `cargo test` for the marshalling logic.
- The trimmed mocha suite against the PostgreSQL ODBC driver.
- A manual run against the testlab Ingres, which is the only thing that can exercise the
  deadlock class at all — PostgreSQL tolerates every cross-thread call Actian rejects.

## Status

The addon builds, loads and passes an end-to-end suite against PostgreSQL: reads with
correct types (including `BIGINT` beyond 2^53 as a JavaScript `BigInt`, `BYTEA` as a
`Buffer`, and nulls), parameters, `count` on INSERT/UPDATE/DELETE, prepared statements,
commit and rollback, `odbcErrors` on failures, and a connection that stays usable after a
failed statement. `test/manual/smoke.mjs` is that suite; point `SMOKE_CONNECTION_STRING` at a DSN.

It also passes against the **real testlab Ingres**, including the deadlock scenarios that
froze or hung the process before 2.7.3 — the whole reason for the threading model. See
[ingresTesting.md](./ingresTesting.md), which records both the results and how to repeat
the run, since neither the driver nor the database is reachable from a laptop.

| Scenario                                            | Before            | Now               |
| --------------------------------------------------- | ----------------- | ----------------- |
| parameterised query the server rejects, then close  | froze the process | rejects in 413 ms |
| failed query inside an open transaction, then close | hung              | 386 ms            |
| 20 sequential connect/query/close cycles            | —                 | 9.4 s             |
| 8 concurrent connections                            | —                 | 787 ms            |

Not yet done: the mocha suite and CI.

## `connected`, and why it does not simply ask the driver

Only the driver knows whether the link dropped, so `connected` cannot be derived — but it is
a _synchronous_ getter, and the C++ version of this addon showed what happens when such a
getter waits for the connection's thread: reading `connection.connected` while
`SELECT pg_sleep(3)` was in flight blocked Node's main thread for 2801 ms, a process-wide
stall reachable through ordinary property access.

So it asks only when the connection's thread is idle, through `OdbcThread::run_if_idle`,
which refuses to queue. When the thread is busy it reports what the driver last said, and
`close()` sets that to `false`. Measured: the getter returns in 0 ms while a two-second query
is in flight.

This is the one caller `run_if_idle` exists for, and the reason a synchronous getter must
never reach `enqueue`.

## Catalog functions and NULL

`tables` and `columns` call `SQLTables` and `SQLColumns` through `odbc-sys` rather than
`odbc-api`'s wrappers. The wrappers take `&str`, and their `SqlText` hands out a null pointer
for an empty string — which erases exactly the distinction ODBC draws between a null
pointer, "do not restrict the search", and an empty string, "match only entries whose value
is empty". The JavaScript API passes `null` for the first, so the buffers are owned here
instead. `src/catalog.rs` has the tests.

## Isolation levels

`setIsolationLevel` is gone. It was the only caller of
`SQLSetConnectAttr(SQL_ATTR_TXN_ISOLATION)`, which is the one call `odbc-api` does not
expose — its high-level `Connection` yields the handle only through a consuming
`into_handle()`, and `odbc-sys` has no `TxnIsolation` attribute.

It is replaced by a pool option, because Ingres accepts the setting as ordinary SQL:

```js
pool({ connectionString, initialStatements: ["SET SESSION ISOLATION LEVEL READ COMMITTED"] });
```

The statements run on each newly opened session, before it is handed out. That timing is
required rather than convenient: Actian rejects both `SET SESSION ISOLATION LEVEL` and
`SET LOCKMODE` once a transaction is active. It has to be the pool, because `pool.connect()`
returns fresh and recycled connections indistinguishably, so a caller cannot tell when a
session is new and would re-issue the statement on every checkout.

Three things this also buys: it drops a native method for plain SQL, it generalises to any
session setup, and it removes a defect — the C++ `SetIsolationLevel` invoked the callback
with an error for an unsupported level and then queued the worker anyway, calling back
twice.

Worth knowing when this ships: **Ingres defaults to SERIALIZABLE**
([Actian](https://docs.actian.com/ingres/12.0/DatabaseAdmin/Isolation_Levels.htm)), and
our application does not set an isolation level today — its only `setIsolationLevel` call
sits in a never-imported type fixture. Adopting `READ COMMITTED` is therefore a real
change in behaviour, not a restatement of the status quo, and deserves its own test.

## The pool is slow to fill, and always was

The mocha pool tests brush against their own 20-second timeouts. That is not the port:

|                                 |                       |
| ------------------------------- | --------------------- |
| 10 connections one at a time    | 8636 ms (864 ms each) |
| 10 connections at once          | 943 ms (94 ms each)   |
| `isql`, one connection, no Node | 900-1190 ms           |

A single connect costs about 900 ms against psqlodbc whatever opens it, and `Pool.js` has
created connections strictly one at a time since long before this work
(`MAX_ACTIVELY_CONNECTING = 1`, identical on `main`). Ten of them therefore take about nine
seconds, and the tests that wait a fixed twenty seconds for a full pool sometimes lose.

The addon itself parallelises fine — ten concurrent connects in under a second — so nothing
here argues against a thread per connection. Raising `MAX_ACTIVELY_CONNECTING` would be a
real improvement, but it is a change to shared pool behaviour and belongs in its own MR
rather than hiding inside a rewrite. `test/manual/connectTiming.mjs` reproduces the numbers.

## CI

`.github/workflows/ci.yml` runs four jobs on every pull request:

| Job                      | What it does                                                                                                                                                    |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rust                     | `cargo fmt --check`, `cargo clippy -D warnings`, `cargo test`                                                                                                   |
| TypeScript               | `build:ts`, `typecheck`, `lint`, `format:check` — no toolchain or driver manager, because the constants come from the Rust _source_ rather than the built addon |
| Tests against PostgreSQL | builds the addon, runs the vitest suite against a `postgres:17` service through `odbc-postgresql`                                                               |
| Linux x64 artefact       | builds it and asserts the result really is an `ELF 64-bit … x86-64` before uploading                                                                            |

`release.yml` runs on a `v*` tag: it checks the tag matches `package.json`, builds the addon
and the JavaScript, re-runs the checks, publishes to npm with provenance under a dist-tag
derived from the version, and attaches the artefact to the GitHub release.

**Linux x64 is the only platform built.** It is the only one we deploy to. The package ships
the crate, so another platform can build from source, but no prebuilt binary is produced for
it.

## Testing locally

```sh
cargo test                                     # Rust unit tests, no database needed
TEST_CONNECTION_STRING='DSN=PGRUSTPORT;UID=me' cargo test   # adds the live one

npm run build                                  # the addon, into prebuilds/
npm run build:ts                               # the JavaScript, into dist/
npm run typecheck && npm run lint && npm run format:check

DBMS=postgres CONNECTION_STRING='DSN=PGRUSTPORT;UID=me' DB_SCHEMA=public \
  DB_TABLE=odbctests npm test                  # vitest, needs a database

SMOKE_CONNECTION_STRING='DSN=PGRUSTPORT;UID=me' node test/manual/smoke.ts
```

Node 24 runs the TypeScript in `test/manual/` directly, so those scripts need no build.

The smoke test needs a table, by default `rustsmoke`:

```sql
CREATE TABLE rustsmoke (
  id INTEGER PRIMARY KEY, name VARCHAR(24), age INTEGER,
  bignum BIGINT, ratio DOUBLE PRECISION, payload BYTEA
);
INSERT INTO rustsmoke VALUES
  (1,'anna',42,9007199254740993,1.5,decode('0102','hex')),
  (2,'bob',NULL,NULL,NULL,NULL);
```

Use a database of your own: the mocha suite drops and recreates its table, so a shared one
will be pulled out from under you by any other checkout running the tests.
