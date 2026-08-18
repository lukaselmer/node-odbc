/* eslint-env node, mocha */
const assert = require('assert');
const odbc   = require('../../lib/odbc');

describe('.prepare(sql)...', () => {
  it('...should throw a TypeError if function signature doesn\'t match accepted signatures.', async () => {
    const connection = await odbc.connect(`${process.env.CONNECTION_STRING}`);
    const statement = await connection.createStatement();

    const PREPARE_TYPE_ERROR = {
      name: 'TypeError',
      message: '[node-odbc]: statement.prepare requires the SQL to be a string.',
    };

    await assert.rejects(async () => {
      await statement.prepare();
    }, PREPARE_TYPE_ERROR);
    await assert.rejects(async () => {
      await statement.prepare(1);
    }, PREPARE_TYPE_ERROR);
    await assert.rejects(async () => {
      await statement.prepare(null);
    }, PREPARE_TYPE_ERROR);
    await assert.rejects(async () => {
      await statement.prepare(undefined);
    }, PREPARE_TYPE_ERROR);
    await assert.rejects(async () => {
      await statement.prepare({});
    }, PREPARE_TYPE_ERROR);

    // await connection.close();
  });
  it('...should prepare a valid SQL string', async () => {
    assert.doesNotReject(async () => {
      const connection = await odbc.connect(`${process.env.CONNECTION_STRING}`);
      const statement = await connection.createStatement();
      await statement.prepare(`INSERT INTO ${process.env.DB_SCHEMA}.${process.env.DB_TABLE} VALUES(?, ?, ?)`);
      await connection.close();
    });
  });
  it('...should return an error with an invalid SQL string', async function() {
    // SQL Server and PostgreSQL don't check for syntax error when the application calls SQLPrepare
    if (global.dbms === 'mssql' || global.dbms === 'postgres') return this.skip();
    assert.rejects(async () => {
      const connection = await odbc.connect(`${process.env.CONNECTION_STRING}`);
      const statement = await connection.createStatement();
      await statement.prepare('INSERT INTO dummy123.table456 VALUES()');
      await connection.close();
    });
  });
  it('...should return an error with a blank SQL string', async function() {
    // SQL Server and PostgreSQL don't check for syntax error when the application calls SQLPrepare
    if (global.dbms === 'mssql' || global.dbms === 'postgres') return this.skip();
    assert.rejects(async () => {
      const connection = await odbc.connect(`${process.env.CONNECTION_STRING}`);
      const statement = await connection.createStatement();
      await statement.prepare('');
      await connection.close();
    });
  });
});
