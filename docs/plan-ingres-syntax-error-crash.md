# Plan: ODBC diagnostics crash on SQL syntax errors (Ingres)

> Working document for the MR that hardens ODBC diagnostic-record retrieval. Delete before merge.

## Problem

The `ties-eng-tooling` app crashes the whole Node process when a statement with a SQL syntax error
is sent to Ingres/Actian through this package. The existing workaround note in
`depot/apps/ties-eng-tooling/src/server/db/dbOdbc.ts` blames "a bug somewhere between the Ingres
ODBC driver and unixODBC" (stack smashing), and the app README lists it as a known issue
("Ensure SQL is valid before execution").

The crash happens *after* the statement fails, while this package retrieves the ODBC diagnostic
records in `ODBCAsyncWorker::GetODBCErrors()` (`src/odbc.cpp`). That function is unsafe against
drivers that behave in ways the ODBC spec explicitly permits.

## Reproduction status

The bug class reproduces on **PostgreSQL** (local Postgres 18 + psqlodbc 18 ANSI, unixODBC), so no
Ingres and no mock driver are needed to develop and verify the fix:

| query | observed result |
| --- | --- |
| `SELEC 1` | 1 `odbcError`, correct |
| `RAISE EXCEPTION` with a 2 000-char message | **4** `odbcErrors`: 1 real + 3 phantom `<No error information available>` |
| `RAISE EXCEPTION` with a 100 000-char message | **8** `odbcErrors`: 3 mangled chunks (2047 + 2047 + 1 chars) + 5 phantom |

Postgres does not segfault because the memory bug happens to land on benign stack garbage on this
platform. The same code path on Ingres/Linux aborts the process.

## Root causes in `GetODBCErrors()`

1. **Uninitialised read + dangling pointer — this is the crash.** In the buffer-growth loop,
   `SQLGetDiagRec` is called and then `if (error_message_length > new_error_message_length) break;`
   is evaluated *without checking the return code first*. On `SQL_NO_DATA` / `SQL_ERROR` the driver
   never writes `TextLengthPtr`, so the comparison reads uninitialised stack memory:
   - garbage `>=` buffer size → `delete[] error.message`, leave the loop, then
     `memcpy(error.message, …)` writes into freed memory → heap corruption;
   - garbage negative → `new SQLTCHAR[negative]`, which with `-fno-exceptions` aborts the process.
2. **`SQL_DIAG_NUMBER` is trusted blindly.** `statusRecCount` is not initialised before
   `SQLGetDiagField`, and the loop always runs `statusRecCount` times. Postgres over-reports it,
   producing the phantom records above; a garbage count on a hostile driver leads straight into (1).
3. **`SQLSMALLINT` overflow.** `error_message_length` is signed 16-bit, so a message length near
   32767 makes `new_error_message_length + 1` overflow to negative.
4. **Buffer-growth loop is wrong for real drivers.** Re-calling `SQLGetDiagRec` for the same record
   to size the buffer mangles messages on drivers returning chunks — the observed 2047-char
   truncation.
5. **Early-return path never sets `errorCount`**, so `error.odbcErrors` is empty and JS code doing
   `error.odbcErrors[0].code` throws a `TypeError` that masks the real failure.
6. **UNICODE termination bug.** `memcpy(…, NO_MSG_TEXT_SIZE + 1)` adds one *byte* instead of
   `sizeof(SQLTCHAR)`, leaving an unterminated UTF-16 string → out-of-bounds read.
7. **Leaks / uninitialised members.** `ODBCError *errors` has no initialiser and is never freed.
8. **6-char SQLSTATE buffer on the stack.** A driver writing more than 6 characters smashes the
   stack — the classic "stack smashing detected" abort, which also matches `isql` crashing on the
   same statements.

## Approach

Harden `GetODBCErrors()` against misbehaving drivers and cover it with tests that run against
Postgres. No client-side SQL validation: that is a workaround, not a fix, and can never be complete.

- Do not trust `SQL_DIAG_NUMBER`; iterate records until `SQL_NO_DATA`, with a hard cap.
- Check `SQL_SUCCEEDED` **before** reading `TextLengthPtr`; always initialise it.
- One generous allocation per record with at most one retry on truncation; all arithmetic in
  `SQLINTEGER`, clamped to the `SQLSMALLINT` range.
- Over-allocate with slack and a guard pattern beyond the reported `BufferLength`, so a driver that
  ignores `BufferLength` overruns into our own slack instead of the heap; detect and truncate.
- Larger, always NUL-terminated SQLSTATE buffer; expose only the first 5 characters.
- Free the errors array; initialise all members.

## Outcome

Both defects below are fixed, and the whole test suite now runs clean under AddressSanitizer.

### 1. Diagnostic-record retrieval (the reported crash)

`GetODBCErrors()` was rewritten. Evidence gathered while fixing it, by probing psqlodbc 18 directly:

- `SQL_DIAG_NUMBER` reported **8** records when only **1** existed; record 2 returned `SQL_NO_DATA`
  and left `TextLengthPtr` untouched at its sentinel value, confirming the uninitialised read.
- An AddressSanitizer harness reproduced the consequence: `heap-use-after-free`, WRITE of size 33
  into a freed 2048-byte buffer.
- Drivers report the number of characters **copied**, not the number available, so a full buffer is
  now the signal to grow. Re-reading a record with a larger buffer returns the message from the
  start, so growing is safe.

Result on PostgreSQL, for the same queries:

| query | before | after |
| --- | --- | --- |
| 2 000-character error | 4 records (1 real + 3 phantom) | 1 record, complete |
| 100 000-character error | 8 records, message in 2047-char chunks | 1 record, complete |

### 2. Bound column buffers released without unbinding

Found while running the new tests: `deleteColumns()` freed buffers that were still bound to the
statement handle, so the driver went on writing into them. `CallProcedureAsyncWorker::Execute()`
frees the buffers and then executes on the same handle, which AddressSanitizer catches as a
use-after-free inside the driver. Without the sanitizer the process dies later, in an unrelated
query, with a corrupted malloc free list - which is what makes this kind of bug look random.

Fixed by issuing `SQLFreeStmt(SQL_UNBIND)` before the buffers are released, which covers every
caller including the cursor path.

## Verification

- `test/queries/errors.test.js` covers both, and the long-message test fails without the fix.
- Full PostgreSQL suite: 181 passing, 0 failing, and no AddressSanitizer findings.

## Out of scope

- **Ingres verification.** The Actian client is Linux-only and not reachable from the dev machine;
  the fixes are driver-agnostic hardening, and a testlab check can follow after release.
- **Consumer-side changes.** Once released, `ties-eng-tooling` can drop its "Ingres crashes on
  syntax errors" workaround note and bump the dependency.
- Upstream `IBM/node-odbc` carries both bugs; offering the patches upstream is a possible
  follow-up.
