/* eslint-env node, mocha */
const assert = require('assert');
const odbc   = require('../../lib/odbc');

describe('.close([calback])...', () => {
  let connection = null;

  beforeEach(async () => {
    connection = await odbc.connect(`${process.env.CONNECTION_STRING}`);
  });

  afterEach(async () => {
    await connection.close();
    connection = null;
  });

  describe('...with promises...', () => {
    it('...should close a newly created statement.', async () => {
      const statement = await connection.createStatement();
      assert.notDeepEqual(statement, null);
      await statement.close();
    });
    it('...should close after a statement has been prepared with parameters.', async () => {
      const statement = await connection.createStatement();
      assert.notDeepEqual(statement, null);
      await statement.prepare(`INSERT INTO ${process.env.DB_SCHEMA}.${process.env.DB_TABLE} VALUES(?, ?, ?)`);
      await statement.close();
    });
    it('...should close after a statement has been prepared without parameters.', async () => {
      const statement = await connection.createStatement();
      assert.notDeepEqual(statement, null);
      await statement.prepare(`INSERT INTO ${process.env.DB_SCHEMA}.${process.env.DB_TABLE} VALUES(1, 'bound', 10)`);
      await statement.close();
    });
    it('...should close after a statement has been prepared and values bound.', async () => {
      const statement = await connection.createStatement();
      assert.notDeepEqual(statement, null);
      await statement.prepare(`INSERT INTO ${process.env.DB_SCHEMA}.${process.env.DB_TABLE} VALUES(?, ?, ?)`);
      await statement.bind([1, 'bound', 10]);
      await statement.close();
    });
    it('...should close after a statement has been prepared, bound, and executed successfully.', async () => {
      const statement = await connection.createStatement();
      assert.notDeepEqual(statement, null);
      await statement.prepare(`INSERT INTO ${process.env.DB_SCHEMA}.${process.env.DB_TABLE} VALUES(?, ?, ?)`);
      await statement.bind([1, 'bound', 10]);
      const result = await statement.execute();
      assert.notDeepEqual(result, null);
      await statement.close();
    });
    it('...should close after calling prepare with an error (bad sql prepared).', async function() {
      // SQL Server and PostgreSQL don't check for syntax error when the application calls SQLPrepare
      if (global.dbms === 'mssql' || global.dbms === 'postgres') return this.skip();
      const statement = await connection.createStatement();
      assert.notDeepEqual(statement, null);
      await assert.rejects(async () => {
        await statement.prepare('abc123!@#');
      });
      await statement.close();
    });
    it('...should close after calling execute with an error (did not bind parameters).', async () => {
      const statement = await connection.createStatement();
      assert.notDeepEqual(statement, null);
      await statement.prepare(`INSERT INTO ${process.env.DB_SCHEMA}.${process.env.DB_TABLE} VALUES(?, ?, ?)`);
      let result;
      await assert.rejects(async () => {
        result = await statement.execute();
      });
      assert.deepEqual(result, null);
      await statement.close();
    });
    it('...should error if trying to prepare after closing.', async () => {
      const statement = await connection.createStatement();
      assert.notDeepEqual(statement, null);
      await statement.close();
      await assert.rejects(async () => {
        await statement.prepare(`INSERT INTO ${process.env.DB_SCHEMA}.${process.env.DB_TABLE} VALUES(?, ?, ?)`);
      });
    });
    it('...should error if trying to bind after closing.', async () => {
      const statement = await connection.createStatement();
      assert.notDeepEqual(statement, null);
      await statement.prepare(`INSERT INTO ${process.env.DB_SCHEMA}.${process.env.DB_TABLE} VALUES(?, ?, ?)`);
      await statement.close();
      await assert.rejects(async () => {
        await statement.bind([1, 'bound', 10]);
      });
    });
    it('...should error if trying to execute after closing.', async () => {
      const statement = await connection.createStatement();
      assert.notDeepEqual(statement, null);
      await statement.prepare(`INSERT INTO ${process.env.DB_SCHEMA}.${process.env.DB_TABLE} VALUES(?, ?, ?)`);
      await statement.bind([1, 'bound', 10]);
      await statement.close();
      let result;
      await assert.rejects(async () => {
        result = await statement.execute();
      });
      assert.deepEqual(result, null);
    });
  }); // '...with promises...'
});
