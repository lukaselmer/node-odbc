import type { Connection } from '../../src/connection.ts';
import { describe, it, beforeAll, afterAll } from 'vitest';
import { dbmsConfig } from '../setup/testEnv.ts';
import assert from 'node:assert';
import * as odbc from '../../src/odbc.ts';
import { Cursor } from '../../src/cursor.ts';

const TABLE_NAME = 'FETCH_TABLE';

// create a queryOptions object to create a Cursor object instead of generating
// results immediately
const queryOptions = {
  cursor: true,
  fetchSize: 3,
};

describe('.close()...', () => {
  // Populate a table that we can fetch from, with a known number of rows
  beforeAll(async () => {
    try {
      const connection = await odbc.connect(`${process.env['CONNECTION_STRING']}`);
      const queries = dbmsConfig().generateCreateOrReplaceQueries(
        `${process.env['DB_SCHEMA']}.${TABLE_NAME}`,
        '(COL1 INT NOT NULL, COL2 CHAR(3), COL3 VARCHAR(16))',
      );
      for (const queryString of queries) {
        await connection.query(queryString);
      }
      await connection.query(`DELETE FROM ${process.env['DB_SCHEMA']}.${TABLE_NAME}`);
      await connection.query(
        `INSERT INTO ${process.env['DB_SCHEMA']}.${TABLE_NAME} VALUES(1, 'ABC', 'DEF')`,
      );
      await connection.query(
        `INSERT INTO ${process.env['DB_SCHEMA']}.${TABLE_NAME} VALUES(2, NULL, NULL)`,
      );
      await connection.query(
        `INSERT INTO ${process.env['DB_SCHEMA']}.${TABLE_NAME} VALUES(3, 'G', 'HIJKLMN')`,
      );
      await connection.query(
        `INSERT INTO ${process.env['DB_SCHEMA']}.${TABLE_NAME} VALUES(4, NULL, 'OP')`,
      );
      await connection.query(
        `INSERT INTO ${process.env['DB_SCHEMA']}.${TABLE_NAME} VALUES(5, 'Q', NULL)`,
      );
      await connection.query(
        `INSERT INTO ${process.env['DB_SCHEMA']}.${TABLE_NAME} VALUES(6, NULL, 'RST')`,
      );
      await connection.query(
        `INSERT INTO ${process.env['DB_SCHEMA']}.${TABLE_NAME} VALUES(7, 'UVW', 'XYZ')`,
      );
    } catch {}
  });

  afterAll(async () => {
    const connection = await odbc.connect(`${process.env['CONNECTION_STRING']}`);
    await connection.query(`DROP TABLE ${process.env['DB_SCHEMA']}.${TABLE_NAME}`);
    await connection.close();
  });

  describe('...with promises...', () => {
    it('...should not error when closed before calling .fetch().', async () => {
      let connection!: Connection;
      try {
        connection = await odbc.connect(`${process.env['CONNECTION_STRING']}`);
        const cursor = await connection.query(
          `SELECT * FROM ${process.env['DB_SCHEMA']}.${TABLE_NAME}`,
          queryOptions,
        );
        assert.notDeepEqual(cursor, null);
        assert.deepEqual(cursor instanceof Cursor, true);
        assert.deepEqual(cursor.noData, false);
        await cursor.close();
      } catch (error) {
        assert.fail(error as Error);
      } finally {
        await connection.close();
      }
    });

    it('...should not error when closed after calling .fetch().', async () => {
      const connection = await odbc.connect(`${process.env['CONNECTION_STRING']}`);
      const cursor = await connection.query(
        `SELECT * FROM ${process.env['DB_SCHEMA']}.${TABLE_NAME}`,
        queryOptions,
      );
      assert.notDeepEqual(cursor, null);
      assert.deepEqual(cursor instanceof Cursor, true);
      const result = await cursor.fetch();
      assert.notDeepEqual(result, null);
      assert.deepEqual(result.length, 3);
      await cursor.close();
      await connection.close();
    });

    it('...should error when fetch is called after close().', async () => {
      await assert.rejects(async () => {
        const connection = await odbc.connect(`${process.env['CONNECTION_STRING']}`);
        const cursor = await connection.query(
          `SELECT * FROM ${process.env['DB_SCHEMA']}.${TABLE_NAME}`,
          queryOptions,
        );
        assert.notDeepEqual(cursor, null);
        assert.deepEqual(cursor instanceof Cursor, true);
        await cursor.close();
        const result = await cursor.fetch();
        assert.notDeepEqual(result, null);
        assert.deepEqual(result.length, 3);
        await connection.close();
      });
    });
  });
});
