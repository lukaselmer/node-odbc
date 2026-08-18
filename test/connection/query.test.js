/* eslint-env node, mocha */
const assert         = require('assert');
const odbc           = require('../../lib/odbc');
const { normalizeRow } = require('../helpers');

describe('.query(sql, [parameters])...', () => {
  it('...should throw a TypeError if function signature doesn\'t match accepted signatures.', async () => {
    const QUERY_SQL_TYPE_ERROR = {
      name: 'TypeError',
      message: '[node-odbc]: connection.query requires the SQL to be a string.',
    };
    const QUERY_PARAMETERS_TYPE_ERROR = {
      name: 'TypeError',
      message: '[node-odbc]: connection.query requires the parameters to be an array.',
    };

    const connection = await odbc.connect(`${process.env.CONNECTION_STRING}`);
    await assert.rejects(async () => {
      await connection.query();
    }, QUERY_SQL_TYPE_ERROR);
    await assert.rejects(async () => {
      await connection.query(1, []);
    }, QUERY_SQL_TYPE_ERROR);
    await assert.rejects(async () => {
      await connection.query(1, 1);
    }, QUERY_SQL_TYPE_ERROR);
    await assert.rejects(async () => {
      await connection.query(`SELECT * FROM ${process.env.DB_SCHEMA}.${process.env.DB_TABLE}`, 1);
    }, QUERY_PARAMETERS_TYPE_ERROR);
    await connection.close();
  });
  it('...should correctly identify function signature with .query({string}).', async () => {
    const connection = await odbc.connect(`${process.env.CONNECTION_STRING}`);
    const result1 = await connection.query(`INSERT INTO ${process.env.DB_SCHEMA}.${process.env.DB_TABLE} VALUES(1, 'committed', 10)`);
    assert.notDeepEqual(result1, null);
    assert.deepEqual(result1.length, 0);
    assert.deepEqual(result1.count, 1);
    const result2 = await connection.query(`SELECT * FROM ${process.env.DB_SCHEMA}.${process.env.DB_TABLE}`);
    assert.notDeepEqual(result2, null);
    assert.deepEqual(result2.length, 1);
    assert.deepEqual(normalizeRow(result2[0]), { ID: 1, NAME: 'committed', AGE: 10 });
    await connection.close();
  });
  it('...should correctly identify function signature with .query({string}, {array})', async () => {
    const connection = await odbc.connect(`${process.env.CONNECTION_STRING}`);
    const result1 = await connection.query(`INSERT INTO ${process.env.DB_SCHEMA}.${process.env.DB_TABLE} VALUES(?, ?, ?)`, [1, 'committed', 10]);
    assert.notDeepEqual(result1, null);
    assert.deepEqual(result1.length, 0);
    assert.deepEqual(result1.count, 1);
    const result2 = await connection.query(`SELECT * FROM ${process.env.DB_SCHEMA}.${process.env.DB_TABLE}`);
    assert.notDeepEqual(result2, null);
    assert.deepEqual(result2.length, 1);
    assert.deepEqual(normalizeRow(result2[0]), { ID: 1, NAME: 'committed', AGE: 10 });
    await connection.close();
  });
}); // '.query(sql, [parameters], [callback])...'
