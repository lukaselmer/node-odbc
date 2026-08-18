/* eslint-env node, mocha */
const assert = require('assert');
const odbc   = require('../../lib/odbc');
const { normalizeRow } = require('../helpers');

describe('.commit()...', () => {
  describe('...with promises...', () => {
    it('...should commit all queries from after beginTransaction() was called.', async () => {
      const connection = await odbc.connect(`${process.env.CONNECTION_STRING}`);
      await connection.beginTransaction();
      const result1 = await connection.query(`INSERT INTO ${process.env.DB_SCHEMA}.${process.env.DB_TABLE} VALUES(1, 'comitted', 10)`);
      assert.notDeepEqual(result1, null);
      const result2 = await connection.query(`SELECT * FROM ${process.env.DB_SCHEMA}.${process.env.DB_TABLE}`);
      assert.notDeepEqual(result2, null);
      assert.deepEqual(result2.length, 1);
      assert.deepEqual(normalizeRow(result2[0]), { ID: 1, NAME: 'comitted', AGE: 10 });
      await connection.commit();
      const result3 = await connection.query(`SELECT * FROM ${process.env.DB_SCHEMA}.${process.env.DB_TABLE}`);
      assert.notDeepEqual(result3, null);
      assert.deepEqual(result3.length, 1);
      assert.deepEqual(normalizeRow(result3[0]), { ID: 1, NAME: 'comitted', AGE: 10 });
      await connection.close();
    });
    it('...shouldn\'t have adverse effects if called outside beginTransaction().', async () => {
      const connection = await odbc.connect(`${process.env.CONNECTION_STRING}`);
      const result1 = await connection.query(`INSERT INTO ${process.env.DB_SCHEMA}.${process.env.DB_TABLE} VALUES(1, 'committed', 10)`);
      assert.notDeepEqual(result1, null);
      await connection.commit();
      const result2 = await connection.query(`SELECT * FROM ${process.env.DB_SCHEMA}.${process.env.DB_TABLE}`);
      assert.notDeepEqual(result2, null);
      assert.deepEqual(result2.length, 1);
      assert.deepEqual(normalizeRow(result2[0]), { ID: 1, NAME: 'committed', AGE: 10 });
      await connection.commit();
      const result3 = await connection.query(`SELECT * FROM ${process.env.DB_SCHEMA}.${process.env.DB_TABLE}`);
      assert.notDeepEqual(result3, null);
      assert.deepEqual(result3.length, 1);
      assert.deepEqual(normalizeRow(result3[0]), { ID: 1, NAME: 'committed', AGE: 10 });
      await connection.close();
    });
    it('...shouldn\'t commit if called after a transaction is already ended with rollback().', async () => {
      const connection = await odbc.connect(`${process.env.CONNECTION_STRING}`);
      await connection.beginTransaction();
      const result1 = await connection.query(`INSERT INTO ${process.env.DB_SCHEMA}.${process.env.DB_TABLE} VALUES(1, 'committed', 10)`);
      assert.notDeepEqual(result1, null);
      await connection.rollback();
      const result2 = await connection.query(`SELECT * FROM ${process.env.DB_SCHEMA}.${process.env.DB_TABLE}`);
      assert.notDeepEqual(result2, null);
      assert.deepEqual(result2.length, 0);
      await connection.commit();
      const result3 = await connection.query(`SELECT * FROM ${process.env.DB_SCHEMA}.${process.env.DB_TABLE}`);
      assert.notDeepEqual(result3, null);
      assert.deepEqual(result3.length, 0);
      await connection.close();
    });
  }); // '...with promises...'
}); // '.rollback()...'
