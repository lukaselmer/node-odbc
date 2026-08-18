import type { Connection } from '../../src/connection.ts';
import { describe, it, beforeAll, afterAll } from 'vitest';
import { dbmsConfig } from '../setup/testEnv.ts';
import assert from 'node:assert';
import * as odbc from '../../src/odbc.ts';
import { colName, tableName } from '../helpers.ts';

describe('.primaryKeys(catalog, schema, table)...', () => {
  beforeAll(async () => {
    let connection!: Connection;
    try {
      connection = await odbc.connect(`${process.env['CONNECTION_STRING']}`);
      if (dbmsConfig() && dbmsConfig().generateCreateOrReplaceQueries) {
        const queries1 = dbmsConfig().generateCreateOrReplaceQueries(
          `${process.env['DB_SCHEMA']}.PKTEST`,
          '(ID INTEGER, NAME VARCHAR(24), AGE INTEGER, PRIMARY KEY(ID))',
        );
        for (const q of queries1) {
          await connection.query(q);
        }
        const queries2 = dbmsConfig().generateCreateOrReplaceQueries(
          `${process.env['DB_SCHEMA']}.MULTIPKTEST`,
          '(ID INTEGER, NUM INTEGER, NAME VARCHAR(24), AGE INTEGER, PRIMARY KEY(ID, NUM))',
        );
        for (const q of queries2) {
          await connection.query(q);
        }
      } else {
        const query1 = `CREATE OR REPLACE TABLE ${process.env['DB_SCHEMA']}.PKTEST (ID INTEGER, NAME VARCHAR(24), AGE INTEGER, PRIMARY KEY(ID))`;
        const query2 = `CREATE OR REPLACE TABLE ${process.env['DB_SCHEMA']}.MULTIPKTEST (ID INTEGER, NUM INTEGER, NAME VARCHAR(24), AGE INTEGER, PRIMARY KEY(ID, NUM))`;
        await connection.query(query1);
        await connection.query(query2);
      }
    } catch (error) {
      const failure = error as { odbcErrors?: { code: number }[] };
      // IBMi returns -601 when table already exists; other DBMS may throw differently
      if (!failure.odbcErrors || failure.odbcErrors[0].code !== -601) {
        throw error;
      }
    } finally {
      await connection.close();
    }
  });

  afterAll(async () => {
    let connection!: Connection;
    try {
      connection = await odbc.connect(`${process.env['CONNECTION_STRING']}`);
      const query1 = `DROP TABLE ${process.env['DB_SCHEMA']}.MULTIPKTEST`;
      const query2 = `DROP TABLE ${process.env['DB_SCHEMA']}.PKTEST`;
      await connection.query(query1);
      await connection.query(query2);
    } catch {
      // ignore drop errors
    } finally {
      await connection.close();
    }
  });

  describe('...with promises...', () => {
    it('...should return information about a primary key.', async () => {
      const connection = await odbc.connect(`${process.env['CONNECTION_STRING']}`);

      const results = await connection.primaryKeys(
        null,
        `${process.env['DB_SCHEMA']}`,
        tableName('PKTEST'),
      );
      assert.strictEqual(results.length, 1);
      assert.deepStrictEqual(results.columns, dbmsConfig().sqlPrimaryKeysColumns);

      const result = results[0];
      // not testing for TABLE_CAT, dependent on the system
      assert.strictEqual(result.TABLE_SCHEM, tableName(`${process.env['DB_SCHEMA']}`));
      assert.strictEqual(result.TABLE_NAME, tableName('PKTEST'));
      assert.strictEqual(result.COLUMN_NAME, colName('ID'));
      await connection.close();
    });
    it('...should return information about a primary key with multiple columns.', async () => {
      const connection = await odbc.connect(`${process.env['CONNECTION_STRING']}`);
      const results = await connection.primaryKeys(
        null,
        `${process.env['DB_SCHEMA']}`,
        tableName('MULTIPKTEST'),
      );

      assert.strictEqual(results.length, 2);
      assert.deepStrictEqual(results.columns, dbmsConfig().sqlPrimaryKeysColumns);

      let result = results[0];
      // not testing for TABLE_CAT, dependent on the system
      assert.strictEqual(result.TABLE_SCHEM, tableName(`${process.env['DB_SCHEMA']}`));
      assert.strictEqual(result.TABLE_NAME, tableName('MULTIPKTEST'));
      assert.strictEqual(result.COLUMN_NAME, colName('ID'));

      result = results[1];
      // not testing for TABLE_CAT, dependent on the system
      assert.strictEqual(result.TABLE_SCHEM, tableName(`${process.env['DB_SCHEMA']}`));
      assert.strictEqual(result.TABLE_NAME, tableName('MULTIPKTEST'));
      assert.strictEqual(result.COLUMN_NAME, colName('NUM'));
      await connection.close();
    });
    it('...should return empty with bad parameters.', async () => {
      const connection = await odbc.connect(`${process.env['CONNECTION_STRING']}`);
      const results = await connection.primaryKeys(null, 'bad schema name', 'bad table name');

      assert.strictEqual(results.length, 0);
      assert.deepStrictEqual(results.columns, dbmsConfig().sqlPrimaryKeysColumns);
      await connection.close();
    });
  }); // ...with promises...
});
