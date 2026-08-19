import { describe, it } from 'vitest';
import assert from 'node:assert';
import * as odbc from '../../src/odbc.ts';
import { connectionString, qualifiedTable } from '../setup/dbms.ts';
import { normalizeRow } from '../helpers.ts';

describe('parameter binding...', () => {
  it('...should round-trip a whole number.', async () => {
    assert.deepEqual(await insertedId(42), 42);
  });

  it('...should round-trip a negative whole number.', async () => {
    assert.deepEqual(await insertedId(-2147483648), -2147483648);
  });

  // Ingres demands an integer constant here rather than any numeric host
  // variable, so a whole number bound as a double or as a 64-bit integer is
  // rejected. Every DBMS accepts the narrow binding, so all of them guard it.
  it('...should bind a whole number where the grammar demands an integer.', async () => {
    const rows = await selectWhereAgeBetween([0, 2147483647]);
    assert.deepEqual(rows.length, 0);
  });
});

function insertedId(value: number): Promise<unknown> {
  return withConnection(async (connection) => {
    await connection.query(`INSERT INTO ${qualifiedTable()} VALUES(?, 'bound', 1)`, [value]);
    const result = await connection.query(`SELECT * FROM ${qualifiedTable()}`);
    return normalizeRow(result[0])['ID'];
  });
}

function selectWhereAgeBetween(bounds: number[]): Promise<{ length: number }> {
  return withConnection((connection) =>
    connection.query(`SELECT * FROM ${qualifiedTable()} WHERE AGE > ? AND AGE < ?`, bounds),
  );
}

async function withConnection<T>(run: (connection: odbc.Connection) => Promise<T>): Promise<T> {
  const connection = await odbc.connect(connectionString());
  try {
    return await run(connection);
  } finally {
    await connection.close();
  }
}
