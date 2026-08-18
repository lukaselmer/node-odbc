import type { Connection } from '../../src/connection.ts';
import { describe, it, beforeAll, afterAll } from 'vitest';
import { dbmsConfig } from '../setup/testEnv.ts';
import assert from 'node:assert';
import * as odbc from '../../src/odbc.ts';
import { colName, tableName } from '../helpers.ts';

describe('.foreignKeys(catalog, schema, table, fkCatalog, fkSchema, fkTable)...', () => {
  beforeAll(async () => {
    let connection!: Connection;
    try {
      connection = await odbc.connect(`${process.env['CONNECTION_STRING']}`);
      if (dbmsConfig() && dbmsConfig().generateCreateOrReplaceQueries) {
        const queries1 = dbmsConfig().generateCreateOrReplaceQueries(
          `${process.env['DB_SCHEMA']}.PKTABLE`,
          '(ID INTEGER, NAME VARCHAR(24), AGE INTEGER, PRIMARY KEY(ID))',
        );
        for (const q of queries1) {
          await connection.query(q);
        }
        const queries2 = dbmsConfig().generateCreateOrReplaceQueries(
          `${process.env['DB_SCHEMA']}.FKTABLE`,
          `(PKID INTEGER, NAME VARCHAR(24), FOREIGN KEY(PKID) REFERENCES ${process.env['DB_SCHEMA']}.PKTABLE(ID))`,
        );
        for (const q of queries2) {
          await connection.query(q);
        }
      } else {
        const query1 = `CREATE OR REPLACE TABLE ${process.env['DB_SCHEMA']}.PKTABLE (ID INTEGER, NAME VARCHAR(24), AGE INTEGER, PRIMARY KEY(ID))`;
        const query2 = `CREATE OR REPLACE TABLE ${process.env['DB_SCHEMA']}.FKTABLE (PKID INTEGER, NAME VARCHAR(24), FOREIGN KEY(PKID) REFERENCES PKTABLE(ID))`;
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
      // Drop FK table first due to foreign key constraint
      const query1 = `DROP TABLE ${process.env['DB_SCHEMA']}.FKTABLE`;
      const query2 = `DROP TABLE ${process.env['DB_SCHEMA']}.PKTABLE`;
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

      const results = await connection.foreignKeys(
        null,
        `${process.env['DB_SCHEMA']}`,
        tableName('PKTABLE'),
        null,
        `${process.env['DB_SCHEMA']}`,
        tableName('FKTABLE'),
      );
      assert.strictEqual(results.length, 1);
      assert.deepStrictEqual(results.columns, dbmsConfig().sqlForeignKeysColumns);

      const result = results[0];
      // not testing for TABLE_CAT, dependent on the system
      assert.strictEqual(result.PKTABLE_SCHEM, tableName(`${process.env['DB_SCHEMA']}`));
      assert.strictEqual(result.PKTABLE_NAME, tableName('PKTABLE'));
      assert.strictEqual(result.PKCOLUMN_NAME, colName('ID'));
      assert.strictEqual(result.FKTABLE_SCHEM, tableName(`${process.env['DB_SCHEMA']}`));
      assert.strictEqual(result.FKTABLE_NAME, tableName('FKTABLE'));
      assert.strictEqual(result.FKCOLUMN_NAME, colName('PKID'));
      await connection.close();
    });
    it('...should return empty with bad parameters.', async () => {
      const connection = await odbc.connect(`${process.env['CONNECTION_STRING']}`);
      const results = await connection.foreignKeys(
        null,
        'bad schema name',
        'bad table name',
        null,
        'badschema2',
        'badtable2',
      );

      assert.strictEqual(results.length, 0);
      assert.deepStrictEqual(results.columns, dbmsConfig().sqlForeignKeysColumns);
      await connection.close();
    });
  }); // ...with promises...
});
