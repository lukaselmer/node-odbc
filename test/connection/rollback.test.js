/* eslint-env node, mocha */
const assert = require('assert');
const odbc   = require('../../lib/odbc');
const { normalizeRow } = require('../helpers');

describe('.rollback()...', () => {
  describe('...with promises...', () => {
    it('...should rollback all queries from after beginTransaction() was called.', async () => {
      const connection = await odbc.connect(`${process.env.CONNECTION_STRING}`);
      await connection.beginTransaction();
      const result1 = await connection.query(`INSERT INTO ${process.env.DB_SCHEMA}.${process.env.DB_TABLE} VALUES(2, 'rolledback', 20)`);
      assert.notDeepEqual(result1, null);
      const result2 = await connection.query(`SELECT * FROM ${process.env.DB_SCHEMA}.${process.env.DB_TABLE}`);
      assert.deepEqual(result2.length, 1);
      assert.deepEqual(normalizeRow(result2[0]), { ID: 2, NAME: 'rolledback', AGE: 20 });
      await connection.rollback();
      const result3 = await connection.query(`SELECT * FROM ${process.env.DB_SCHEMA}.${process.env.DB_TABLE}`);
      assert.deepEqual(result3.length, 0);
      await connection.close();
    });
    it('...shouldn\'t rollback commits from before beginTransaction() was called.', async () => {
      const connection = await odbc.connect(`${process.env.CONNECTION_STRING}`);
      const result1 = await connection.query(`INSERT INTO ${process.env.DB_SCHEMA}.${process.env.DB_TABLE} VALUES(1, 'committed', 10)`);
      assert.notDeepEqual(result1, null);
      assert.deepEqual(result1.count, 1);
      const result2 = await connection.query(`SELECT * FROM ${process.env.DB_SCHEMA}.${process.env.DB_TABLE}`);
      assert.deepEqual(result2.length, 1);
      assert.deepEqual(normalizeRow(result2[0]), { ID: 1, NAME: 'committed', AGE: 10 });
      await connection.beginTransaction();
      const result3 = await connection.query(`INSERT INTO ${process.env.DB_SCHEMA}.${process.env.DB_TABLE} VALUES(2, 'rolledback', 20)`);
      assert.notDeepEqual(result3, null);
      assert.deepEqual(result3.count, 1);
      const result4 = await connection.query(`SELECT * FROM ${process.env.DB_SCHEMA}.${process.env.DB_TABLE}`);
      assert.deepEqual(result4.length, 2);
      assert.deepEqual(normalizeRow(result4[1]), { ID: 2, NAME: 'rolledback', AGE: 20 });
      await connection.rollback();
      const result5 = await connection.query(`SELECT * FROM ${process.env.DB_SCHEMA}.${process.env.DB_TABLE}`);
      assert.deepEqual(result5.length, 1);
      assert.deepEqual(normalizeRow(result5[0]), { ID: 1, NAME: 'committed', AGE: 10 });
      await connection.close();
    });
    it('...shouldn\'t affect queries when beginTransaction() hasn\'t been called.', async () => {
      const connection = await odbc.connect(`${process.env.CONNECTION_STRING}`);
      const result1 = await connection.query(`INSERT INTO ${process.env.DB_SCHEMA}.${process.env.DB_TABLE} VALUES(1, 'committed', 10)`);
      assert.notDeepEqual(result1, null);
      assert.deepEqual(result1.count, 1);
      const result2 = await connection.query(`SELECT * FROM ${process.env.DB_SCHEMA}.${process.env.DB_TABLE}`);
      assert.deepEqual(result2.length, 1);
      assert.deepEqual(normalizeRow(result2[0]), { ID: 1, NAME: 'committed', AGE: 10 });
      await connection.rollback();
      const result3 = await connection.query(`SELECT * FROM ${process.env.DB_SCHEMA}.${process.env.DB_TABLE}`);
      assert.deepEqual(result3.length, 1);
      assert.deepEqual(normalizeRow(result3[0]), { ID: 1, NAME: 'committed', AGE: 10 });
      await connection.close();
    });
    it('...shouldn\'t rollback if called after a transaction is already ended with a commit().', async () => {
      const connection = await odbc.connect(`${process.env.CONNECTION_STRING}`);
      await connection.beginTransaction();
      const result1 = await connection.query(`INSERT INTO ${process.env.DB_SCHEMA}.${process.env.DB_TABLE} VALUES(1, 'committed', 10)`);
      assert.notDeepEqual(result1, null);
      assert.deepEqual(result1.count, 1);
      await connection.commit();
      const result2 = await connection.query(`SELECT * FROM ${process.env.DB_SCHEMA}.${process.env.DB_TABLE}`);
      assert.deepEqual(result2.length, 1);
      assert.deepEqual(normalizeRow(result2[0]), { ID: 1, NAME: 'committed', AGE: 10 });
      await connection.rollback();
      const result3 = await connection.query(`SELECT * FROM ${process.env.DB_SCHEMA}.${process.env.DB_TABLE}`);
      assert.deepEqual(result3.length, 1);
      assert.deepEqual(normalizeRow(result3[0]), { ID: 1, NAME: 'committed', AGE: 10 });
      await connection.close();
    });
    it('...shouldn\'t rollback if called after a transaction is already ended with a rollback().', async () => {
      const connection = await odbc.connect(`${process.env.CONNECTION_STRING}`);
      await connection.beginTransaction();
      const result1 = await connection.query(`INSERT INTO ${process.env.DB_SCHEMA}.${process.env.DB_TABLE} VALUES(1, 'committed', 10)`);
      assert.notDeepEqual(result1, null);
      assert.deepEqual(result1.count, 1);
      await connection.rollback();
      const result2 = await connection.query(`INSERT INTO ${process.env.DB_SCHEMA}.${process.env.DB_TABLE} VALUES(1, 'committed', 10)`);
      assert.notDeepEqual(result2, null);
      assert.deepEqual(result2.count, 1);
      const result3 = await connection.query(`SELECT * FROM ${process.env.DB_SCHEMA}.${process.env.DB_TABLE}`);
      assert.deepEqual(result3.length, 1);
      assert.deepEqual(normalizeRow(result3[0]), { ID: 1, NAME: 'committed', AGE: 10 });
      await connection.rollback();
      const result4 = await connection.query(`SELECT * FROM ${process.env.DB_SCHEMA}.${process.env.DB_TABLE}`);
      assert.deepEqual(result4.length, 1);
      assert.deepEqual(normalizeRow(result4[0]), { ID: 1, NAME: 'committed', AGE: 10 });
      await connection.close();
    });
  }); // '...with promises...'
}); // '.rollback()...'
