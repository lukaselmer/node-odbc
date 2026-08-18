/* eslint-env node, mocha */
const assert = require('assert');
const odbc   = require('../../lib/odbc');
const { Cursor } = require('../../lib/Cursor');
const { normalizeRow } = require('../helpers');

describe('.execute([calback])...', () => {
  let connection = null;

  beforeEach(async () => {
    connection = await odbc.connect(`${process.env.CONNECTION_STRING}`);
  });

  afterEach(async () => {
    await connection.close();
    connection = null;
  });

  it('...should throw a TypeError if function signature doesn\'t match accepted signatures.', async () => {
    const statement = await connection.createStatement();

    const EXECUTE_TYPE_ERROR = {
      name: 'TypeError',
      message: '[node-odbc]: Incorrect function signature for call to statement.execute({object}[optional]).',
    };
    const DUMMY_CALLBACK = () => {};
    const PREPARE_SQL = `INSERT INTO ${process.env.DB_SCHEMA}.${process.env.DB_TABLE} VALUES(?, ?, ?)`;

    assert.throws(() => {
      statement.execute(PREPARE_SQL);
    }, EXECUTE_TYPE_ERROR);
    assert.throws(() => {
      statement.execute(PREPARE_SQL, DUMMY_CALLBACK);
    }, EXECUTE_TYPE_ERROR);
    assert.throws(() => {
      statement.execute(1);
    }, EXECUTE_TYPE_ERROR);
    assert.throws(() => {
      statement.execute(1, DUMMY_CALLBACK);
    }, EXECUTE_TYPE_ERROR);
  });
  describe('...with promises...', () => {
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
    it('...should return a Cursor instead of a result set if {cursor: true} has been passed as an option.', async () => {
      await connection.query(`INSERT INTO ${process.env.DB_SCHEMA}.${process.env.DB_TABLE} VALUES(1, 'bound', 10)`);
      const statement = await connection.createStatement();
      assert.notDeepEqual(statement, null);
      await statement.prepare(`SELECT * FROM ${process.env.DB_SCHEMA}.${process.env.DB_TABLE}`);
      const cursor = await statement.execute({cursor: true});
      assert.deepEqual(cursor instanceof Cursor, true);
      let result = await cursor.fetch();
      assert.deepEqual(result.length, 1);
      assert.deepEqual(normalizeRow(result[0]).ID, 1);
      assert.deepEqual(normalizeRow(result[0]).NAME, 'bound');
      assert.deepEqual(normalizeRow(result[0]).AGE, 10);
      result = await cursor.fetch();
      assert.deepEqual(result.length, 0);
      assert.deepEqual(cursor.noData, true);
      await cursor.close();
      await statement.close();
    });
    it('...should return a Cursor instead of a result set if {fetchSize: <number>} has been passed as an option.', async () => {
      await connection.query(`INSERT INTO ${process.env.DB_SCHEMA}.${process.env.DB_TABLE} VALUES(1, 'bound', 10)`);
      const statement = await connection.createStatement();
      assert.notDeepEqual(statement, null);
      await statement.prepare(`SELECT * FROM ${process.env.DB_SCHEMA}.${process.env.DB_TABLE}`);
      const cursor = await statement.execute({fetchSize: 5});
      assert.deepEqual(cursor instanceof Cursor, true);
      let result = await cursor.fetch();
      assert.deepEqual(result.length, 1);
      assert.deepEqual(normalizeRow(result[0]).ID, 1);
      assert.deepEqual(normalizeRow(result[0]).NAME, 'bound');
      assert.deepEqual(normalizeRow(result[0]).AGE, 10);
      result = await cursor.fetch();
      assert.deepEqual(result.length, 0);
      assert.deepEqual(cursor.noData, true);
      await cursor.close();
      await statement.close();
    });
    it('...should leave a valid Statement after a Cursor generated from that Statement is closed.', async () => {
      await connection.query(`INSERT INTO ${process.env.DB_SCHEMA}.${process.env.DB_TABLE} VALUES(1, 'bound', 10)`);
      const statement = await connection.createStatement();
      assert.notDeepEqual(statement, null);
      await statement.prepare(`SELECT * FROM ${process.env.DB_SCHEMA}.${process.env.DB_TABLE}`);
      const cursor = await statement.execute({fetchSize: 5});
      assert.deepEqual(cursor instanceof Cursor, true);
      let cursorResult = await cursor.fetch();
      assert.deepEqual(cursorResult.length, 1);
      assert.deepEqual(normalizeRow(cursorResult[0]).ID, 1);
      assert.deepEqual(normalizeRow(cursorResult[0]).NAME, 'bound');
      assert.deepEqual(normalizeRow(cursorResult[0]).AGE, 10);
      cursorResult = await cursor.fetch();
      assert.deepEqual(cursorResult.length, 0);
      assert.deepEqual(cursor.noData, true);
      await cursor.close();
      // use the same prepared statement, but this time without a Cursor
      const statementResult = await statement.execute();
      assert.deepEqual(statementResult.length, 1);
      assert.deepEqual(normalizeRow(statementResult[0]).ID, 1);
      assert.deepEqual(normalizeRow(statementResult[0]).NAME, 'bound');
      assert.deepEqual(normalizeRow(statementResult[0]).AGE, 10);
      await statement.close();
    });
    it('...should accept a timeout option without crashing', async () => {
      const statement = await connection.createStatement();
      assert.notDeepEqual(statement, null);
      await statement.prepare(`SELECT * FROM ${process.env.DB_SCHEMA}.${process.env.DB_TABLE}`);
      const result = await statement.execute({timeout: 10});
      assert.notDeepEqual(result, null);
      await statement.close();
    });
  }); // '...with promises...'
});
