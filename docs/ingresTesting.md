# Testing against Ingres

PostgreSQL cannot reproduce the bug class this addon exists for. It tolerates every
cross-thread ODBC call that the Actian driver deadlocks on: a statement handle freed from a
thread other than the one that used it completes in 78 ms against psqlodbc and hangs forever
against Actian. So the threading model is only really exercised by a run against a real
Ingres.

`test/manual/ingres-deadlock.mjs` is that run. It covers the scenarios that used to freeze or
hang the process:

| Scenario | Before | Now |
| --- | --- | --- |
| parameterised query the server rejects, then close | froze the process | rejects in ~0.4 s |
| failed query inside an open transaction, then close | hung | ~0.4 s |
| 20 sequential connect/query/close cycles | — | ~9 s |
| 8 concurrent connections | — | ~0.7 s |

A 50 ms heartbeat runs throughout and is reported at the end; it is the check that the event
loop never stalled, which is what the original defect actually did.

## Running it

```sh
SMOKE_CONNECTION_STRING='DSN=your_ingres_dsn' node test/manual/ingres-deadlock.mjs
```

## Getting a driver

The Actian client ships only as a Linux x86_64 tarball, so the driver cannot be installed on
macOS and the test has to run on Linux. The addon does not have to be *built* there:

```sh
npm run build:linux-x64        # needs zig on PATH
```

cross-compiles it with `cargo-zigbuild`, which is quicker and more reliable than an emulated
container — `rustc` segfaults under qemu on an Apple Silicon host.

Two things that cost an afternoon each:

- When packing the result on macOS, set `COPYFILE_DISABLE=1`. Otherwise `tar` writes an
  AppleDouble `._odbc.node` beside the real one, and `node-gyp-build` loads that 163-byte
  stub instead of the addon, which fails in `dlopen` with no useful message.
- The Actian client refuses to start as root, so run it as an ordinary user.

If you work at Siemens, the test database, its network policy and the container image used to
reach it are documented in our internal application repository.
