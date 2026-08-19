import { describe, it } from 'vitest';
import assert from 'node:assert';
import * as odbc from '../../src/odbc.ts';
import type { OdbcError } from '../../src/odbc.ts';
import { connectionString } from '../setup/dbms.ts';
import { isLowercaseDbms } from '../helpers.ts';

const NO_INFO = '<No error information available>';

/** A statement every supported DBMS rejects while parsing. */
const INVALID_SQL = 'SELEC 1';

describe('...error diagnostics...', () => {
  it('...should reject invalid SQL with usable ODBC errors.', async () => {
    await withConnection(async (connection) => {
      const error = await rejection(connection.query(INVALID_SQL));
      assertUsableOdbcErrors(error, 'invalid SQL');
    });
  });

  it('...should report exactly the diagnostic records the driver has.', async () => {
    await withConnection(async (connection) => {
      const error = await rejection(connection.query(INVALID_SQL));
      const phantoms = error.odbcErrors.filter((detail) => detail.message === NO_INFO);
      assert.deepStrictEqual(
        phantoms,
        [],
        `expected no phantom records, got ${phantoms.length} of ${error.odbcErrors.length}`,
      );
    });
  });

  it('...should reject a reference to a missing table with usable ODBC errors.', async () => {
    await withConnection(async (connection) => {
      const error = await rejection(
        connection.query('SELECT * FROM a_table_that_does_not_exist_9f3a'),
      );
      assertUsableOdbcErrors(error, 'missing table');
    });
  });

  it('...should return long error messages in one piece.', async ({ skip }) => {
    if (!isLowercaseDbms()) return skip();

    await withConnection(async (connection) => {
      const error = await rejection(connection.query(longErrorQuery(8000)));
      assertUsableOdbcErrors(error, 'long error message');

      assert.deepStrictEqual(
        error.odbcErrors.length,
        1,
        `a single server error must produce a single record, got ${error.odbcErrors.length}`,
      );

      // Drivers cap how much of a message they keep, so the exact length is not
      // asserted. What matters is one unbroken run longer than the initial
      // buffer, which only happens when that buffer is grown correctly.
      const message = error.odbcErrors[0]?.message ?? '';
      assert.ok(
        longestRunOfAs(message) > 2048,
        `expected a contiguous message longer than the initial buffer, got ${longestRunOfAs(message)}`,
      );
      assert.ok(
        message.startsWith('ERROR'),
        `expected the message to start at the beginning, got ${JSON.stringify(message.slice(0, 40))}`,
      );
    });
  });

  it('...should survive many consecutive failing queries.', async () => {
    await withConnection(async (connection) => {
      for (let attempt = 0; attempt < 200; attempt++) {
        const error = await rejection(connection.query(INVALID_SQL));
        assert.ok(error.odbcErrors.length > 0);
      }
    });
  });

  it('...should provide usable ODBC errors when preparing or executing an invalid statement.', async () => {
    await withConnection(async (connection) => {
      const statement = await connection.createStatement();
      // Some drivers parse at prepare time, others defer until execute.
      const error = await rejection(prepareAndExecute(statement, INVALID_SQL));
      assertUsableOdbcErrors(error, 'statement.prepare/execute');
      await statement.close();
    });
  });

  it('...should provide usable ODBC errors from a pool.', async () => {
    const pool = await odbc.pool(connectionString());
    try {
      const error = await rejection(pool.query(INVALID_SQL));
      assertUsableOdbcErrors(error, 'pool.query');
    } finally {
      await pool.close();
    }
  });
});

/**
 * A misbehaving driver can make diagnostic retrieval fabricate records, split a
 * message across several of them, or report none at all. Every rejection must
 * carry at least one record that a caller can read.
 */
function assertUsableOdbcErrors(error: OdbcError, context: string): void {
  assert.ok(Array.isArray(error.odbcErrors), `${context}: odbcErrors must be an array`);
  assert.ok(error.odbcErrors.length > 0, `${context}: odbcErrors must not be empty`);

  error.odbcErrors.forEach((detail, index) => {
    const at = `${context}: odbcErrors[${index}]`;
    assert.deepStrictEqual(typeof detail.message, 'string', `${at}.message must be a string`);
    assert.notDeepStrictEqual(
      detail.message,
      NO_INFO,
      `${at} is a phantom record; the driver reported more records than it has`,
    );
    assert.ok(detail.message.length > 0, `${at}.message must not be empty`);
    assert.deepStrictEqual(typeof detail.state, 'string', `${at}.state must be a string`);
    assert.ok(detail.state.length > 0, `${at}.state must not be empty`);
    assert.ok(
      detail.state.length <= 5,
      `${at}.state must be a 5-character SQLSTATE, got ${JSON.stringify(detail.state)}`,
    );
  });
}

async function withConnection(run: (connection: odbc.Connection) => Promise<void>): Promise<void> {
  const connection = await odbc.connect(connectionString());
  try {
    await run(connection);
  } finally {
    await connection.close();
  }
}

async function rejection(pending: Promise<unknown>): Promise<OdbcError> {
  try {
    await pending;
  } catch (error) {
    return error as OdbcError;
  }
  return assert.fail('expected the query to be rejected');
}

async function prepareAndExecute(statement: odbc.Statement, sql: string): Promise<unknown> {
  await statement.prepare(sql);
  return statement.execute();
}

/** Raises a server-side error whose message is `length` characters long. */
function longErrorQuery(length: number): string {
  return `DO $$ BEGIN RAISE EXCEPTION '%', repeat('a', ${length}); END $$;`;
}

function longestRunOfAs(message: string): number {
  return (message.match(/a+/gu) ?? []).reduce((longest, run) => Math.max(longest, run.length), 0);
}
