/* eslint-env node, mocha */
const assert = require('assert');
const odbc   = require('../../lib/odbc');
const { normalizeRow } = require('../helpers');

describe('.execute()...', () => {
  let connection = null;

  beforeEach(async () => {
    connection = await odbc.connect(`${process.env.CONNECTION_STRING}`);
  });

  afterEach(async () => {
    await connection.close();
    connection = null;
  });

  it('...should execute if a valid SQL string has been prepared and valid values bound.', async () => {
    const statement = await connection.createStatement();
    assert.notDeepEqual(statement, null);
    await statement.prepare(`INSERT INTO ${process.env.DB_SCHEMA}.${process.env.DB_TABLE} VALUES(?, ?, ?)`);
    await statement.bind([1, 'bound', 10]);
    const result1 = await statement.execute();
    assert.notDeepEqual(result1, null);
    assert.deepEqual(result1.count, 1);
    const result2 = await connection.query(`SELECT * FROM ${process.env.DB_SCHEMA}.${process.env.DB_TABLE}`);
    assert.notDeepEqual(result2, null);
    assert.deepEqual(result2.length, 1);
    assert.deepEqual(normalizeRow(result2[0]).ID, 1);
    assert.deepEqual(normalizeRow(result2[0]).NAME, 'bound');
    assert.deepEqual(normalizeRow(result2[0]).AGE, 10);
  });
  it('...should execute if bind has not been called and the prepared statement has no parameters.', async () => {
    const statement = await connection.createStatement();
    assert.notDeepEqual(statement, null);
    await statement.prepare(`INSERT INTO ${process.env.DB_SCHEMA}.${process.env.DB_TABLE} VALUES(1, 'bound', 10)`);
    const result1 = await statement.execute();
    assert.notDeepEqual(result1, null);
    assert.deepEqual(result1.count, 1);
    const result2 = await connection.query(`SELECT * FROM ${process.env.DB_SCHEMA}.${process.env.DB_TABLE}`);
    assert.notDeepEqual(result2, null);
    assert.deepEqual(result2.length, 1);
    assert.deepEqual(normalizeRow(result2[0]).ID, 1);
    assert.deepEqual(normalizeRow(result2[0]).NAME, 'bound');
    assert.deepEqual(normalizeRow(result2[0]).AGE, 10);
  });
  it('...should not execute if prepare has not been called.', async () => {
    const statement = await connection.createStatement();
    assert.notDeepEqual(statement, null);
    await assert.rejects(async () => {
      await statement.execute();
    });
  });
  it('...should not execute if bind has not been called and the prepared statement has parameters.', async () => {
    const statement = await connection.createStatement();
    assert.notDeepEqual(statement, null);
    await statement.prepare(`INSERT INTO ${process.env.DB_SCHEMA}.${process.env.DB_TABLE} VALUES(?, ?, ?)`);
    await assert.rejects(async () => {
      await statement.execute();
    });
  });
  it('...should not execute if bind values are incompatible with the fields they are binding to.', async () => {
    const statement = await connection.createStatement();
    assert.notDeepEqual(statement, null);
    await statement.prepare(`INSERT INTO ${process.env.DB_SCHEMA}.${process.env.DB_TABLE} VALUES(?, ?, ?)`);
    await statement.bind(['ID', 10, 'AGE']);
    await assert.rejects(async () => {
      await statement.execute();
    });
  });
});
