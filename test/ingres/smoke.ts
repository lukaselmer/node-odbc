// Smoke test for the Go sidecar against a real Ingres database.
//
// The interesting part is not that queries work, but that the failures the
// Ingres driver produces stay contained: a syntax error used to abort the
// whole Node process, which is what moving the driver into a sidecar fixes.

import assert from 'node:assert';

import { connect, type Connection } from '../../src/odbc.ts';

const connectionString = `DSN=${requiredDsn()}`;

function requiredDsn(): string {
  // The DSN names an internal data source, so it comes from the environment
  // rather than being written down here; see test/ingres/.env.example.
  const dsn = process.env['INGRES_DSN'];
  if (dsn === undefined) throw new Error('Set INGRES_DSN, see test/ingres/.env.example');
  return dsn;
}

async function main(): Promise<void> {
  await checkConnects();
  await checkSimpleQuery();
  await checkParameterisedQuery();
  await checkSyntaxErrorIsRecoverable();
  await checkTransaction();
  await checkCatalog();

  console.log('\nall Ingres checks passed');
}

async function checkConnects(): Promise<void> {
  const connection = await connect(connectionString);
  assert.strictEqual(connection.connected, true);
  await connection.close();
  report('connect and close');
}

async function checkSimpleQuery(): Promise<void> {
  await withConnection(async (connection) => {
    const result = await connection.query("SELECT dbmsinfo('database') AS db");
    assert.strictEqual(result.length, 1);
    report('simple query returned the current database');
  });
}

async function checkParameterisedQuery(): Promise<void> {
  await withConnection(async (connection) => {
    const result = await connection.query('SELECT int4(?) AS answer', [42]);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(Object.values(result[0] ?? {})[0], 42);
    report('parameterised query');
  });
}

// The C++ addon died here: the driver reports the error in a way that used to
// take the process with it.
async function checkSyntaxErrorIsRecoverable(): Promise<void> {
  await withConnection(async (connection) => {
    await assert.rejects(connection.query('SELECT FROM WHERE nonsense'), (error: Error) => {
      const states = (error as { odbcErrors?: { state: string }[] }).odbcErrors;
      assert.ok(Array.isArray(states), 'odbcErrors must be present');
      report(`syntax error reported as ${states.map((detail) => detail.state).join(', ')}`);
      return true;
    });

    const afterwards = await connection.query('SELECT int4(1) AS still_alive');
    assert.strictEqual(afterwards.length, 1);
    report('connection still usable after a syntax error');
  });
}

async function checkTransaction(): Promise<void> {
  await withConnection(async (connection) => {
    await connection.beginTransaction();
    assert.strictEqual(connection.autocommit, false);
    await connection.rollback();
    assert.strictEqual(connection.autocommit, true);
    report('transaction begin and rollback');
  });
}

async function checkCatalog(): Promise<void> {
  await withConnection(async (connection) => {
    const tables = await connection.tables(null, null, null, 'TABLE');
    assert.ok(Array.isArray(tables.columns));
    report(`catalog query returned ${tables.length} tables`);
  });
}

async function withConnection(work: (connection: Connection) => Promise<void>): Promise<void> {
  const connection = await connect(connectionString);
  try {
    await work(connection);
  } finally {
    await connection.close();
  }
}

function report(message: string): void {
  console.log(`  ok  ${message}`);
}

try {
  await main();
} catch (error) {
  const failure = error as Error & { odbcErrors?: unknown };
  console.error('\nFAILED:', failure.message);
  if (failure.odbcErrors) console.error('odbcErrors:', JSON.stringify(failure.odbcErrors, null, 2));
  process.exit(1);
}
