/* eslint-env node, mocha */
const assert         = require('assert');
const odbc           = require('../../lib/odbc');
const { Cursor }     = require('../../lib/Cursor');
const { normalizeRow } = require('../helpers');

describe('.query(sql, [parameters], [options])...', () => {
  it('...should throw a TypeError if function signature doesn\'t match accepted signatures.', async () => {
    const QUERY_TYPE_ERROR = {
      name: 'TypeError',
      message: '[node-odbc]: Incorrect function signature for call to connection.query({string}, {array}[optional], {object}[optional]).',
    };
    const QUERY_CALLBACK = () => {};
    const QUERY_STRING = `SELECT * FROM ${process.env.DB_SCHEMA}.${process.env.DB_TABLE}`;

    const connection = await odbc.connect(`${process.env.CONNECTION_STRING}`);
    assert.throws(() => {
      connection.query();
    }, QUERY_TYPE_ERROR);
    assert.throws(() => {
      connection.query(QUERY_CALLBACK);
    }, QUERY_TYPE_ERROR);
    assert.throws(() => {
      connection.query(1, []);
    }, QUERY_TYPE_ERROR);
    assert.throws(() => {
      connection.query(1, [], QUERY_CALLBACK);
    }, QUERY_TYPE_ERROR);
    assert.throws(() => {
      connection.query(1, 1);
    }, QUERY_TYPE_ERROR);
    assert.throws(() => {
      connection.query(1, 1, QUERY_CALLBACK);
    }, QUERY_TYPE_ERROR);
    await connection.close();
  });
  describe('...with promises...', () => {
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
    it('...should correctly identify function signature with .query({string}, {array}, {object})', async () => {
      const connection = await odbc.connect(`${process.env.CONNECTION_STRING}`);
      const result1 = await connection.query(`INSERT INTO ${process.env.DB_SCHEMA}.${process.env.DB_TABLE} VALUES(?, ?, ?)`, [1, 'committed', 10]);
      assert.notDeepEqual(result1, null);
      assert.deepEqual(result1.length, 0);
      assert.deepEqual(result1.count, 1);
      const cursor = await connection.query(`SELECT * FROM ${process.env.DB_SCHEMA}.${process.env.DB_TABLE} WHERE ID = ?`, [1], {cursor: true});
      assert.notDeepEqual(cursor, null);
      assert.ok(cursor instanceof Cursor);
      await cursor.close();
      await connection.close();
    });
    it('...should correctly identify function signature with .query({string}, {object})', async () => {
      const connection = await odbc.connect(`${process.env.CONNECTION_STRING}`);
      const result1 = await connection.query(`INSERT INTO ${process.env.DB_SCHEMA}.${process.env.DB_TABLE} VALUES(?, ?, ?)`, [1, 'committed', 10]);
      assert.notDeepEqual(result1, null);
      assert.deepEqual(result1.length, 0);
      assert.deepEqual(result1.count, 1);
      const cursor = await connection.query(`SELECT * FROM ${process.env.DB_SCHEMA}.${process.env.DB_TABLE}`, {cursor: true});
      assert.notDeepEqual(cursor, null);
      assert.ok(cursor instanceof Cursor);
      await cursor.close();
      await connection.close();
    });
    describe('...testing query options...', () => {
      describe('...[cursor]...', () => {
        it('...should throw an error if cursor is not a boolean or string', async () => {
          const connection = await odbc.connect(`${process.env.CONNECTION_STRING}`);
          const result1 = await connection.query(`INSERT INTO ${process.env.DB_SCHEMA}.${process.env.DB_TABLE} VALUES(?, ?, ?)`, [1, 'committed', 10]);
          assert.notDeepEqual(result1, null);
          assert.deepEqual(result1.length, 0);
          assert.deepEqual(result1.count, 1);
          await assert.rejects(
            connection.query(`SELECT * FROM ${process.env.DB_SCHEMA}.${process.env.DB_TABLE}`, { cursor: 1 }),
            {
              name: 'TypeError',
              message: 'Connection.query options: .cursor must be a STRING or BOOLEAN value.'
            }
          );
          await assert.rejects(
            connection.query(`SELECT * FROM ${process.env.DB_SCHEMA}.${process.env.DB_TABLE}`, { cursor: {} }),
            {
              name: 'TypeError',
              message: 'Connection.query options: .cursor must be a STRING or BOOLEAN value.'
            }
          );
          await assert.rejects(
            connection.query(`SELECT * FROM ${process.env.DB_SCHEMA}.${process.env.DB_TABLE}`, { cursor: null }),
            {
              name: 'TypeError',
              message: 'Connection.query options: .cursor must be a STRING or BOOLEAN value.'
            }
          );
          await assert.rejects(
            connection.query(`SELECT * FROM ${process.env.DB_SCHEMA}.${process.env.DB_TABLE}`, { cursor: () => {} }),
            {
              name: 'TypeError',
              message: 'Connection.query options: .cursor must be a STRING or BOOLEAN value.'
            }
          );
          await connection.close();
        });
      });
      describe('...[fetchSize]...', () => {
        it('...should throw an error if fetchSize is not a number', async () => {
          const connection = await odbc.connect(`${process.env.CONNECTION_STRING}`);
          const result1 = await connection.query(`INSERT INTO ${process.env.DB_SCHEMA}.${process.env.DB_TABLE} VALUES(?, ?, ?)`, [1, 'committed', 10]);
          assert.notDeepEqual(result1, null);
          assert.deepEqual(result1.length, 0);
          assert.deepEqual(result1.count, 1);
          await assert.rejects(
            connection.query(`SELECT * FROM ${process.env.DB_SCHEMA}.${process.env.DB_TABLE}`, { fetchSize: true }),
            {
              name: 'TypeError',
              message: 'Connection.query options: .fetchSize must be a NUMBER value.'
            }
          );
          await assert.rejects(
            connection.query(`SELECT * FROM ${process.env.DB_SCHEMA}.${process.env.DB_TABLE}`, { fetchSize: {} }),
            {
              name: 'TypeError',
              message: 'Connection.query options: .fetchSize must be a NUMBER value.'
            }
          );
          await assert.rejects(
            connection.query(`SELECT * FROM ${process.env.DB_SCHEMA}.${process.env.DB_TABLE}`, { fetchSize: '1' }),
            {
              name: 'TypeError',
              message: 'Connection.query options: .fetchSize must be a NUMBER value.'
            }
          );
          await assert.rejects(
            connection.query(`SELECT * FROM ${process.env.DB_SCHEMA}.${process.env.DB_TABLE}`, { fetchSize: () => {} }),
            {
              name: 'TypeError',
              message: 'Connection.query options: .fetchSize must be a NUMBER value.'
            }
          );
          await connection.close();
        });
        it('...should throw an error if fetchSize is less-than or equal to 0', async () => {
          const connection = await odbc.connect(`${process.env.CONNECTION_STRING}`);
          const result1 = await connection.query(`INSERT INTO ${process.env.DB_SCHEMA}.${process.env.DB_TABLE} VALUES(?, ?, ?)`, [1, 'committed', 10]);
          assert.notDeepEqual(result1, null);
          assert.deepEqual(result1.length, 0);
          assert.deepEqual(result1.count, 1);
          await assert.rejects(
            connection.query(`SELECT * FROM ${process.env.DB_SCHEMA}.${process.env.DB_TABLE}`, { fetchSize: 0 }),
            {
              name: 'RangeError',
              message: 'Connection.query options: .fetchSize must be greater than 0.'
            }
          );
          await assert.rejects(
            connection.query(`SELECT * FROM ${process.env.DB_SCHEMA}.${process.env.DB_TABLE}`, { fetchSize: -1 }),
            {
              name: 'RangeError',
              message: 'Connection.query options: .fetchSize must be greater than 0.'
            }
          );
          await connection.close();
        });
      });
      describe('...[timeout]...', () => {
        it('...should throw an error if timeout is not a number', async () => {
          const connection = await odbc.connect(`${process.env.CONNECTION_STRING}`);
          const result1 = await connection.query(`INSERT INTO ${process.env.DB_SCHEMA}.${process.env.DB_TABLE} VALUES(?, ?, ?)`, [1, 'committed', 10]);
          assert.notDeepEqual(result1, null);
          assert.deepEqual(result1.length, 0);
          assert.deepEqual(result1.count, 1);
          await assert.rejects(
            connection.query(`SELECT * FROM ${process.env.DB_SCHEMA}.${process.env.DB_TABLE}`, { timeout: true }),
            {
              name: 'TypeError',
              message: 'Connection.query options: .timeout must be a NUMBER value.'
            }
          );
          await assert.rejects(
            connection.query(`SELECT * FROM ${process.env.DB_SCHEMA}.${process.env.DB_TABLE}`, { timeout: {} }),
            {
              name: 'TypeError',
              message: 'Connection.query options: .timeout must be a NUMBER value.'
            }
          );
          await assert.rejects(
            connection.query(`SELECT * FROM ${process.env.DB_SCHEMA}.${process.env.DB_TABLE}`, { timeout: '1' }),
            {
              name: 'TypeError',
              message: 'Connection.query options: .timeout must be a NUMBER value.'
            }
          );
          await assert.rejects(
            connection.query(`SELECT * FROM ${process.env.DB_SCHEMA}.${process.env.DB_TABLE}`, { timeout: () => {} }),
            {
              name: 'TypeError',
              message: 'Connection.query options: .timeout must be a NUMBER value.'
            }
          );
          await connection.close();
        });
        it('...should throw an error if timeout is less-than or equal to 0', async () => {
          const connection = await odbc.connect(`${process.env.CONNECTION_STRING}`);
          const result1 = await connection.query(`INSERT INTO ${process.env.DB_SCHEMA}.${process.env.DB_TABLE} VALUES(?, ?, ?)`, [1, 'committed', 10]);
          assert.notDeepEqual(result1, null);
          assert.deepEqual(result1.length, 0);
          assert.deepEqual(result1.count, 1);
          await assert.rejects(
            connection.query(`SELECT * FROM ${process.env.DB_SCHEMA}.${process.env.DB_TABLE}`, { timeout: 0 }),
            {
              name: 'RangeError',
              message: 'Connection.query options: .timeout must be greater than 0.'
            }
          );
          await assert.rejects(
            connection.query(`SELECT * FROM ${process.env.DB_SCHEMA}.${process.env.DB_TABLE}`, { timeout: -1 }),
            {
              name: 'RangeError',
              message: 'Connection.query options: .timeout must be greater than 0.'
            }
          );
          await connection.close();
        });
      });
      describe('...[initialBufferSize]...', () => {
        it('...should throw an error if initialBufferSize is not a number', async () => {
          const connection = await odbc.connect(`${process.env.CONNECTION_STRING}`);
          const result1 = await connection.query(`INSERT INTO ${process.env.DB_SCHEMA}.${process.env.DB_TABLE} VALUES(?, ?, ?)`, [1, 'committed', 10]);
          assert.notDeepEqual(result1, null);
          assert.deepEqual(result1.length, 0);
          assert.deepEqual(result1.count, 1);
          await assert.rejects(
            connection.query(`SELECT * FROM ${process.env.DB_SCHEMA}.${process.env.DB_TABLE}`, { initialBufferSize: true }),
            {
              name: 'TypeError',
              message: 'Connection.query options: .initialBufferSize must be a NUMBER value.'
            }
          );
          await assert.rejects(
            connection.query(`SELECT * FROM ${process.env.DB_SCHEMA}.${process.env.DB_TABLE}`, { initialBufferSize: {} }),
            {
              name: 'TypeError',
              message: 'Connection.query options: .initialBufferSize must be a NUMBER value.'
            }
          );
          await assert.rejects(
            connection.query(`SELECT * FROM ${process.env.DB_SCHEMA}.${process.env.DB_TABLE}`, { initialBufferSize: '1' }),
            {
              name: 'TypeError',
              message: 'Connection.query options: .initialBufferSize must be a NUMBER value.'
            }
          );
          await assert.rejects(
            connection.query(`SELECT * FROM ${process.env.DB_SCHEMA}.${process.env.DB_TABLE}`, { initialBufferSize: () => {} }),
            {
              name: 'TypeError',
              message: 'Connection.query options: .initialBufferSize must be a NUMBER value.'
            }
          );
          await connection.close();
        });
        it('...should throw an error if initialBufferSize is less-than or equal to 0', async () => {
          const connection = await odbc.connect(`${process.env.CONNECTION_STRING}`);
          const result1 = await connection.query(`INSERT INTO ${process.env.DB_SCHEMA}.${process.env.DB_TABLE} VALUES(?, ?, ?)`, [1, 'committed', 10]);
          assert.notDeepEqual(result1, null);
          assert.deepEqual(result1.length, 0);
          assert.deepEqual(result1.count, 1);
          await assert.rejects(
            connection.query(`SELECT * FROM ${process.env.DB_SCHEMA}.${process.env.DB_TABLE}`, {initialBufferSize: 0}),
            {
              name: 'RangeError',
              message: 'Connection.query options: .initialBufferSize must be greater than 0.'
            }
          );
          await assert.rejects(
            connection.query(`SELECT * FROM ${process.env.DB_SCHEMA}.${process.env.DB_TABLE}`, {initialBufferSize: -1}),
            {
              name: 'RangeError',
              message: 'Connection.query options: .initialBufferSize must be greater than 0.'
            }
          );
          await connection.close();
        });
      });
    });
  }); // ...with promises...
}); // '.query(sql, [parameters])...'
