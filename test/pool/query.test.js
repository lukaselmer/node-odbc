/* eslint-env node, mocha */
const assert     = require('assert');
const odbc       = require('../../');
const { normalizeRow } = require('../helpers');

describe('.query...', () => {
  it('...should correctly identify function signature with .query({string}).', async () => {
    const pool = await odbc.pool({
      connectionString: `${process.env.CONNECTION_STRING}`,
      initialSize: 1
    });
    const result1 = await pool.query(`INSERT INTO ${process.env.DB_SCHEMA}.${process.env.DB_TABLE} VALUES(1, 'committed', 10)`);
    assert.notDeepEqual(result1, null);
    assert.deepEqual(result1.length, 0);
    assert.deepEqual(result1.count, 1);
    const result2 = await pool.query(`SELECT * FROM ${process.env.DB_SCHEMA}.${process.env.DB_TABLE}`);
    assert.notDeepEqual(result2, null);
    assert.deepEqual(result2.length, 1);
    assert.deepEqual(normalizeRow(result2[0]), { ID: 1, NAME: 'committed', AGE: 10 });
    await pool.close();
  });
  it('...should correctly identify function signature with .query({string}, {array})', async () => {
    const pool = await odbc.pool({
      connectionString: `${process.env.CONNECTION_STRING}`,
      initialSize: 1
    });
    const result1 = await pool.query(`INSERT INTO ${process.env.DB_SCHEMA}.${process.env.DB_TABLE} VALUES(?, ?, ?)`, [1, 'committed', 10]);
    assert.notDeepEqual(result1, null);
    assert.deepEqual(result1.length, 0);
    assert.deepEqual(result1.count, 1);
    const result2 = await pool.query(`SELECT * FROM ${process.env.DB_SCHEMA}.${process.env.DB_TABLE}`);
    assert.notDeepEqual(result2, null);
    assert.deepEqual(result2.length, 1);
    assert.deepEqual(normalizeRow(result2[0]), { ID: 1, NAME: 'committed', AGE: 10 });
    await pool.close();
  });
});
