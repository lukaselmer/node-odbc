# Test environment

The test suite runs against a real DBMS over ODBC. Select the target with the `DBMS` environment
variable (`DBMS=postgres npm test`) and put the connection settings into
`test/DBMS/<dbms>/.env` (git-ignored):

```env
CONNECTION_STRING=DSN=;UID=;PWD=;SCHEMA=
DB_SCHEMA=
DB_TABLE=ODBCTESTS
DB_STOREDPROCEDURE=
DB_USERNAME=
```

`DB_STOREDPROCEDURE` is optional; the `callProcedure` tests skip themselves when it is not set.

## PostgreSQL setup

Install the driver and register a DSN (paths shown for Homebrew on macOS):

```sh
brew install unixodbc psqlodbc
createdb odbc_test
```

`odbcinst.ini`:

```ini
[PostgreSQL ANSI]
Description = PostgreSQL ODBC driver (ANSI)
Driver = /opt/homebrew/lib/psqlodbca.so
```

`odbc.ini`:

```ini
[PGTEST]
Description = local pg test
Driver      = PostgreSQL ANSI
Servername  = localhost
Port        = 5432
Database    = odbc_test
Username    = <your db user>
```

`test/DBMS/postgres/.env`:

```env
CONNECTION_STRING=DSN=PGTEST
DB_SCHEMA=public
DB_TABLE=ODBCTESTS
DB_STOREDPROCEDURE=odbctestproc
DB_USERNAME=<your db user>
```

The `callProcedure` tests need a routine with a single OUT parameter. PostgreSQL routines created
with `CREATE PROCEDURE` cannot be invoked through the ODBC `{ CALL ... }` escape (the driver
translates it into `SELECT`), so create a **function**:

```sql
CREATE OR REPLACE FUNCTION public.odbctestproc(OUT result INTEGER)
LANGUAGE plpgsql AS $$ BEGIN result := 42; END $$;
```

## Run the tests fast: disable GSSAPI negotiation

By default libpq tries a GSSAPI/Kerberos handshake on every TCP connection. When there is no
Kerberos KDC (the normal case for a local development database) each connection blocks for roughly
one second until that attempt gives up. Because the suite opens a connection per test - and pools
open ten at a time - this dominates the runtime:

|                        | connect              | full suite                             |
| ---------------------- | -------------------- | -------------------------------------- |
| default                | ~1 s (`isql`: 7.7 s) | ~9 min, plus spurious timeout failures |
| `PGGSSENCMODE=disable` | ~0.02 s              | ~1 min                                 |

So run the suite as:

```sh
PGGSSENCMODE=disable ODBCSYSINI=/path/to/odbc-config DBMS=postgres npm test
```

The slow connections also cause tests to exceed the default timeout. Use `npm test`, which sets a
longer one, rather than invoking Vitest directly.
