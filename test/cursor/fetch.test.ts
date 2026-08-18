import type { Connection } from '../../src/connection.ts';
import { describe, it, beforeAll, afterAll } from 'vitest';
import { dbmsConfig } from '../setup/testEnv.ts';
import assert from 'node:assert';
import * as odbc from '../../src/odbc.ts';
import { Cursor } from '../../src/cursor.ts';
import { normalizeRow } from '../helpers.ts';

const TABLE_NAME = 'FETCH_TABLE';

// create a queryOptions object to create a Cursor object instead of generating
// results immediately
const queryOptions = {
  cursor: true,
  fetchSize: 3,
};

describe('.fetch()...', () => {
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
    it('...should set noData to false before the first fetch.', async () => {
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

    it('...should set noData to true only after the first fetch, even if there is no result sets to fetch.', async () => {
      const EMPTY_FETCH = 'EMPTY_FETCH';

      const connection = await odbc.connect(`${process.env['CONNECTION_STRING']}`);
      const queries = dbmsConfig().generateCreateOrReplaceQueries(
        `${process.env['DB_SCHEMA']}.${EMPTY_FETCH}`,
        '(COL1 INT NOT NULL, COL2 CHAR(3), COL3 VARCHAR(16))',
      );
      for (const queryString of queries) {
        await connection.query(queryString);
      }
      const cursor = await connection.query(
        `SELECT * FROM ${process.env['DB_SCHEMA']}.${EMPTY_FETCH}`,
        queryOptions,
      );
      assert.notDeepEqual(cursor, null);
      assert.deepEqual(cursor instanceof Cursor, true);
      assert.deepEqual(cursor.noData, false);
      const result = await cursor.fetch();
      assert.deepEqual(result.length, 0);
      assert.deepEqual(cursor.noData, true);
      await cursor.close();
      await connection.close();
    });

    it('...should return only the number of rows set on the query options.', async () => {
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

    it('...should return the correct result set for each subsequent call.', async () => {
      const connection = await odbc.connect(`${process.env['CONNECTION_STRING']}`);
      const cursor = await connection.query(
        `SELECT * FROM ${process.env['DB_SCHEMA']}.${TABLE_NAME}`,
        queryOptions,
      );
      assert.notDeepEqual(cursor, null);
      assert.deepEqual(cursor instanceof Cursor, true);
      let result = await cursor.fetch();
      assert.notDeepEqual(result, null);
      assert.deepEqual(result.length, 3);
      assert.deepEqual(normalizeRow(result[0])['COL1'], 1);
      assert.deepEqual(normalizeRow(result[1])['COL1'], 2);
      assert.deepEqual(normalizeRow(result[2])['COL1'], 3);
      result = await cursor.fetch();
      assert.notDeepEqual(result, null);
      assert.deepEqual(result.length, 3);
      assert.deepEqual(normalizeRow(result[0])['COL1'], 4);
      assert.deepEqual(normalizeRow(result[1])['COL1'], 5);
      assert.deepEqual(normalizeRow(result[2])['COL1'], 6);
      await cursor.close();
      await connection.close();
    });

    it('...should only return a partial result set and set noData to true when a fetch overlaps the end of the result set.', async () => {
      const connection = await odbc.connect(`${process.env['CONNECTION_STRING']}`);
      const cursor = await connection.query(
        `SELECT * FROM ${process.env['DB_SCHEMA']}.${TABLE_NAME}`,
        queryOptions,
      );
      assert.notDeepEqual(cursor, null);
      assert.deepEqual(cursor instanceof Cursor, true);
      let result = await cursor.fetch();
      assert.notDeepEqual(result, null);
      assert.deepEqual(result.length, 3);
      result = await cursor.fetch();
      assert.notDeepEqual(result, null);
      assert.deepEqual(result.length, 3);
      result = await cursor.fetch();
      assert.notDeepEqual(result, null);
      assert.deepEqual(result.length, 1);
      assert.deepEqual(cursor.noData, true);
      await cursor.close();
      await connection.close();
    });

    it('...should not interfere with other cursors created on the same connection.', async () => {
      const connection = await odbc.connect(`${process.env['CONNECTION_STRING']}`);
      const cursor1 = await connection.query(
        `SELECT * FROM ${process.env['DB_SCHEMA']}.${TABLE_NAME}`,
        queryOptions,
      );
      assert.notDeepEqual(cursor1, null);
      assert.deepEqual(cursor1 instanceof Cursor, true);
      const cursor2 = await connection.query(
        `SELECT * FROM ${process.env['DB_SCHEMA']}.${TABLE_NAME}`,
        queryOptions,
      );
      assert.notDeepEqual(cursor2, null);
      assert.deepEqual(cursor2 instanceof Cursor, true);
      let result1 = await cursor1.fetch();
      assert.notDeepEqual(result1, null);
      assert.deepEqual(cursor1.noData, false);
      assert.deepEqual(result1.length, 3);
      assert.deepEqual(normalizeRow(result1[0])['COL1'], 1);
      assert.deepEqual(normalizeRow(result1[1])['COL1'], 2);
      assert.deepEqual(normalizeRow(result1[2])['COL1'], 3);
      result1 = await cursor1.fetch();
      assert.notDeepEqual(result1, null);
      assert.deepEqual(cursor1.noData, false);
      assert.deepEqual(result1.length, 3);
      assert.deepEqual(normalizeRow(result1[0])['COL1'], 4);
      assert.deepEqual(normalizeRow(result1[1])['COL1'], 5);
      assert.deepEqual(normalizeRow(result1[2])['COL1'], 6);
      let result2 = await cursor2.fetch();
      assert.notDeepEqual(result2, null);
      assert.deepEqual(cursor2.noData, false);
      assert.deepEqual(result2.length, 3);
      assert.deepEqual(normalizeRow(result2[0])['COL1'], 1);
      assert.deepEqual(normalizeRow(result2[1])['COL1'], 2);
      assert.deepEqual(normalizeRow(result2[2])['COL1'], 3);
      await cursor1.close();
      result2 = await cursor2.fetch();
      assert.notDeepEqual(result2, null);
      assert.deepEqual(cursor2.noData, false);
      assert.deepEqual(result2.length, 3);
      assert.deepEqual(normalizeRow(result2[0])['COL1'], 4);
      assert.deepEqual(normalizeRow(result2[1])['COL1'], 5);
      assert.deepEqual(normalizeRow(result2[2])['COL1'], 6);
      await cursor2.close();
      await connection.close();
    });

    it('...should return the parameter values passed to the query.', async () => {
      const connection = await odbc.connect(`${process.env['CONNECTION_STRING']}`);
      const cursor = await connection.query(
        `SELECT * FROM ${process.env['DB_SCHEMA']}.${TABLE_NAME} WHERE COL1 = ? AND COL2 = ?`,
        [1, 'ABC'],
        queryOptions,
      );
      assert.notDeepEqual(cursor, null);
      assert.deepEqual(cursor instanceof Cursor, true);
      const result = await cursor.fetch();
      assert.notDeepEqual(result, null);
      assert.deepEqual(result.parameters, [1, 'ABC']);
      await cursor.close();
      await connection.close();
    });

    it('...should return an empty parameter array if no parameters were sent to the query.', async () => {
      const connection = await odbc.connect(`${process.env['CONNECTION_STRING']}`);
      const cursor = await connection.query(
        `SELECT * FROM ${process.env['DB_SCHEMA']}.${TABLE_NAME}`,
        queryOptions,
      );
      assert.notDeepEqual(cursor, null);
      assert.deepEqual(cursor instanceof Cursor, true);
      const result = await cursor.fetch();
      assert.notDeepEqual(result, null);
      assert.deepEqual(result.parameters, []);
      await cursor.close();
      await connection.close();
    });

    it('...should return an empty parameter array if and empty parameter array was sent to the query.', async () => {
      const connection = await odbc.connect(`${process.env['CONNECTION_STRING']}`);
      const cursor = await connection.query(
        `SELECT * FROM ${process.env['DB_SCHEMA']}.${TABLE_NAME}`,
        [],
        queryOptions,
      );
      assert.notDeepEqual(cursor, null);
      assert.deepEqual(cursor instanceof Cursor, true);
      const result = await cursor.fetch();
      assert.notDeepEqual(result, null);
      assert.deepEqual(result.parameters, []);
      await cursor.close();
      await connection.close();
    });
  });
});
