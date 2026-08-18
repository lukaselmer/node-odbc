import type { Connection } from '../../src/connection.ts';
import { describe, it, beforeEach, afterEach } from 'vitest';
import { dbmsConfig } from '../setup/testEnv.ts';
import assert from 'node:assert';
import * as odbc from '../../src/odbc.ts';
import { colName } from '../helpers.ts';

describe('.columns(catalog, schema, table, column)...', () => {
  let connection!: Connection;
  beforeEach(async () => {
    connection = await odbc.connect(`${process.env['CONNECTION_STRING']}`);
  });

  afterEach(async () => {
    await connection.close();
  });
  describe('...with promises...', () => {
    it('...should return information about all columns of a table.', async () => {
      const results = await connection.columns(
        null,
        `${process.env['DB_SCHEMA']}`,
        `${process.env['DB_TABLE']}`,
        null,
      );
      assert.strictEqual(results.length, 3);
      assert.deepStrictEqual(results.columns, dbmsConfig().sqlColumnsColumns);

      const idColumn = results[0];
      assert.deepEqual(idColumn.COLUMN_NAME, colName('ID'));
      assert.deepEqual(idColumn.DATA_TYPE, odbc.SQL_INTEGER);
      assert.deepEqual(idColumn.NULLABLE, odbc.SQL_NULLABLE);

      const nameColumn = results[1];
      assert.deepEqual(nameColumn.COLUMN_NAME, colName('NAME'));
      assert.deepEqual(nameColumn.DATA_TYPE, odbc.SQL_VARCHAR);
      assert.deepEqual(nameColumn.NULLABLE, odbc.SQL_NULLABLE);

      const ageColumn = results[2];
      assert.deepEqual(ageColumn.COLUMN_NAME, colName('AGE'));
      assert.deepEqual(ageColumn.DATA_TYPE, odbc.SQL_INTEGER);
      assert.deepEqual(ageColumn.NULLABLE, odbc.SQL_NULLABLE);
    });
    it('...should return empty with bad parameters.', async () => {
      const results = await connection.columns(null, 'bad schema name', 'bad table name', null);
      assert.strictEqual(results.length, 0);
      assert.deepStrictEqual(results.columns, dbmsConfig().sqlColumnsColumns);
    });
  }); // ...with promises...
});
