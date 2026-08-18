/* eslint-env node, mocha */
const assert = require('assert');
const odbc   = require('../../lib/odbc');
const { normalizeRow } = require('../helpers');

describe('.beginTransaction()...', () => {
  let connection = null;

  beforeEach(async () => {
    connection = await odbc.connect(`${process.env.CONNECTION_STRING}`);
  });

  afterEach(async () => {
    await connection.close();
    connection = null;
  });

  it('...should be idempotent if called multiple times before rollback().', async () => {
    await connection.beginTransaction();
    const result1 = await connection.query(`INSERT INTO ${process.env.DB_SCHEMA}.${process.env.DB_TABLE} VALUES(2, 'rolledback', 20)`);
    assert.notDeepEqual(result1, null);
    assert.deepEqual(result1.length, 0);
    const result2 = await connection.query(`SELECT * FROM ${process.env.DB_SCHEMA}.${process.env.DB_TABLE}`);
    assert.notDeepEqual(result2, null);
    assert.deepEqual(result2.length, 1);
    assert.deepEqual(normalizeRow(result2[0]), { ID: 2, NAME: 'rolledback', AGE: 20 });
    await connection.beginTransaction();
    const result3 = await connection.query(`SELECT * FROM ${process.env.DB_SCHEMA}.${process.env.DB_TABLE}`);
    assert.notDeepEqual(result3, null);
    assert.deepEqual(result3.length, 1);
    assert.deepEqual(normalizeRow(result3[0]), { ID: 2, NAME: 'rolledback', AGE: 20 });
    await connection.rollback();
    const result4 = await connection.query(`SELECT * FROM ${process.env.DB_SCHEMA}.${process.env.DB_TABLE}`);
    assert.notDeepEqual(result4, null);
    assert.deepEqual(result4.length, 0);
  });
  it('...should be idempotent if called multiple times before commit().', async () => {
    await connection.beginTransaction();
    const result1 = await connection.query(`INSERT INTO ${process.env.DB_SCHEMA}.${process.env.DB_TABLE} VALUES(1, 'committed', 10)`);
    assert.notDeepEqual(result1, null);
    assert.deepEqual(result1.length, 0);
    const result2 = await connection.query(`SELECT * FROM ${process.env.DB_SCHEMA}.${process.env.DB_TABLE}`);
    assert.notDeepEqual(result2, null);
    assert.deepEqual(result2.length, 1);
    assert.deepEqual(normalizeRow(result2[0]), { ID: 1, NAME: 'committed', AGE: 10 });
    await connection.beginTransaction();
    const result3 = await connection.query(`SELECT * FROM ${process.env.DB_SCHEMA}.${process.env.DB_TABLE}`);
    assert.notDeepEqual(result3, null);
    assert.deepEqual(result3.length, 1);
    assert.deepEqual(normalizeRow(result3[0]), { ID: 1, NAME: 'committed', AGE: 10 });
    await connection.commit();
    const result4 = await connection.query(`SELECT * FROM ${process.env.DB_SCHEMA}.${process.env.DB_TABLE}`);
    assert.notDeepEqual(result4, null);
    assert.deepEqual(result4.length, 1);
    assert.deepEqual(normalizeRow(result4[0]), { ID: 1, NAME: 'committed', AGE: 10 });
  });
  it('...should make transactional queries visible only to the connection that the transaction was started on until commit() is called (at transactional isolation level \'read committed\').', async () => {
    let connection1 = null;
    let connection2 = null;
    if (global.dbms === 'ibmi') {
      connection1 = await odbc.connect(`${process.env.CONNECTION_STRING};CMT=1`);
      connection2 = await odbc.connect(`${process.env.CONNECTION_STRING};CMT=1;CONCURRENTACCESSRESOLUTION=1`);
    } else if (global.dbms === 'mssql') {
      connection1 = await odbc.connect(`${process.env.CONNECTION_STRING}`);
      connection2 = await odbc.connect(`${process.env.CONNECTION_STRING};DMConnAttr=[1227]=32`);
    } else {
      // Postgres and others: read committed is the default
      connection1 = await odbc.connect(`${process.env.CONNECTION_STRING}`);
      connection2 = await odbc.connect(`${process.env.CONNECTION_STRING}`);
    }
    await connection1.beginTransaction();
    let result1 = await connection1.query(`INSERT INTO ${process.env.DB_SCHEMA}.${process.env.DB_TABLE} VALUES(1, 'committed', 10)`)
    assert.notDeepEqual(result1, null);
    const result2 = await connection1.query(`SELECT * FROM ${process.env.DB_SCHEMA}.${process.env.DB_TABLE} t1`);
    assert.notDeepEqual(result2, null);
    assert.deepEqual(result2.length, 1);
    assert.deepEqual(normalizeRow(result2[0]), { ID: 1, NAME: 'committed', AGE: 10 });
    const result3 = await connection2.query(`SELECT * FROM ${process.env.DB_SCHEMA}.${process.env.DB_TABLE} t2`);
    assert.notDeepEqual(result3, null);
    assert.deepEqual(result3.length, 0);
    await connection1.commit();
    const result4 = await connection2.query(`SELECT * FROM ${process.env.DB_SCHEMA}.${process.env.DB_TABLE}`);
    assert.notDeepEqual(result4, null);
    assert.deepEqual(result4.length, 1);
    assert.deepEqual(normalizeRow(result4[0]), { ID: 1, NAME: 'committed', AGE: 10 });
    await connection1.close();
    await connection2.close();
  });

  it('...shouldn\'t hide queries that occur on other connections.', async () => {
    const connection1 = await odbc.connect(`${process.env.CONNECTION_STRING}`);
    const connection2 = await odbc.connect(`${process.env.CONNECTION_STRING}`);
    await connection1.beginTransaction();
    const inserted = await connection2.query(`INSERT INTO ${process.env.DB_SCHEMA}.${process.env.DB_TABLE} VALUES(1, 'committed', 10)`);
    assert.notDeepEqual(inserted, null);
    const seen = await connection1.query(`SELECT * FROM ${process.env.DB_SCHEMA}.${process.env.DB_TABLE}`);
    assert.notDeepEqual(seen, null);
    assert.deepEqual(seen.length, 1);
    assert.deepEqual(normalizeRow(seen[0]), { ID: 1, NAME: 'committed', AGE: 10 });
    await connection1.close();
    await connection2.close();
  });
});
