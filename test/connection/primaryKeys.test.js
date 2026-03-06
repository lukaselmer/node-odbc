/* eslint-env node, mocha */
const assert = require('assert');
const odbc   = require('../../lib/odbc');
const { colName, tableName } = require('../helpers');

describe('.primaryKeys(catalog, schema, table, callback)...', () => {
  before(async () => {
    let connection;
    try {
      connection = await odbc.connect(`${process.env.CONNECTION_STRING}`);
      if (global.dbmsConfig && global.dbmsConfig.generateCreateOrReplaceQueries) {
        const queries1 = global.dbmsConfig.generateCreateOrReplaceQueries(
          `${process.env.DB_SCHEMA}.PKTEST`,
          '(ID INTEGER, NAME VARCHAR(24), AGE INTEGER, PRIMARY KEY(ID))'
        );
        for (const q of queries1) { await connection.query(q); }
        const queries2 = global.dbmsConfig.generateCreateOrReplaceQueries(
          `${process.env.DB_SCHEMA}.MULTIPKTEST`,
          '(ID INTEGER, NUM INTEGER, NAME VARCHAR(24), AGE INTEGER, PRIMARY KEY(ID, NUM))'
        );
        for (const q of queries2) { await connection.query(q); }
      } else {
        const query1 = `CREATE OR REPLACE TABLE ${process.env.DB_SCHEMA}.PKTEST (ID INTEGER, NAME VARCHAR(24), AGE INTEGER, PRIMARY KEY(ID))`;
        const query2 = `CREATE OR REPLACE TABLE ${process.env.DB_SCHEMA}.MULTIPKTEST (ID INTEGER, NUM INTEGER, NAME VARCHAR(24), AGE INTEGER, PRIMARY KEY(ID, NUM))`;
        await connection.query(query1);
        await connection.query(query2);
      }
    } catch (error) {
      // IBMi returns -601 when table already exists; other DBMS may throw differently
      if (!error.odbcErrors || error.odbcErrors[0].code !== -601) {
        throw (error);
      }
    } finally {
      await connection.close();
    }
  });

  after(async () => {
    let connection;
    try {
      connection = await odbc.connect(`${process.env.CONNECTION_STRING}`);
      const query1 = `DROP TABLE ${process.env.DB_SCHEMA}.MULTIPKTEST`;
      const query2 = `DROP TABLE ${process.env.DB_SCHEMA}.PKTEST`;
      await connection.query(query1);
      await connection.query(query2);
    } catch (error) {
      // ignore drop errors
    } finally {
      await connection.close();
    }
  });

  describe('...with callbacks...', () => {
    it('...should return information about a primary key.', (done) => {
      odbc.connect(`${process.env.CONNECTION_STRING}`, (error, connection) => {
        assert.deepEqual(error, null);
        connection.primaryKeys(null, `${process.env.DB_SCHEMA}`, tableName('PKTEST'), (error1, results) => {
          assert.strictEqual(error1, null);
          assert.strictEqual(results.length, 1);
          assert.deepStrictEqual(results.columns, global.dbmsConfig.sqlPrimaryKeysColumns);

          const result = results[0];
          // not testing for TABLE_CAT, dependent on the system
          assert.strictEqual(result.TABLE_SCHEM, tableName(`${process.env.DB_SCHEMA}`));
          assert.strictEqual(result.TABLE_NAME, tableName('PKTEST'));
          assert.strictEqual(result.COLUMN_NAME, colName('ID'));
          done();
        });
      });
    });
    it('...should return information about a primary key with multiple columns.', (done) => {
      odbc.connect(`${process.env.CONNECTION_STRING}`, (error, connection) => {
        assert.deepEqual(error, null);
        connection.primaryKeys(null, `${process.env.DB_SCHEMA}`, tableName('MULTIPKTEST'), (error1, results) => {
          assert.strictEqual(error1, null);
          assert.strictEqual(results.length, 2);
          assert.deepStrictEqual(results.columns, global.dbmsConfig.sqlPrimaryKeysColumns);

          let result = results[0];
          // not testing for TABLE_CAT, dependent on the system
          assert.strictEqual(result.TABLE_SCHEM, tableName(`${process.env.DB_SCHEMA}`));
          assert.strictEqual(result.TABLE_NAME, tableName('MULTIPKTEST'));
          assert.strictEqual(result.COLUMN_NAME, colName('ID'));

          result = results[1];
          // not testing for TABLE_CAT, dependent on the system
          assert.strictEqual(result.TABLE_SCHEM, tableName(`${process.env.DB_SCHEMA}`));
          assert.strictEqual(result.TABLE_NAME, tableName('MULTIPKTEST'));
          assert.strictEqual(result.COLUMN_NAME, colName('NUM'));
          done();
        });
      });
    });
    it('...should return empty with bad parameters.', (done) => {
      odbc.connect(`${process.env.CONNECTION_STRING}`, (error, connection) => {
        assert.deepEqual(error, null);
        connection.primaryKeys(null, 'bad schema name', 'bad table name', (error1, results) => {
          assert.strictEqual(error1, null);
          assert.strictEqual(results.length, 0);
          assert.deepStrictEqual(results.columns, global.dbmsConfig.sqlPrimaryKeysColumns);

          done();
        });
      });
    });
  }); // ...with callbacks...
  describe('...with promises...', () => {
    it('...should return information about a primary key.', async () => {
      const connection =  await odbc.connect(`${process.env.CONNECTION_STRING}`);

      const results = await connection.primaryKeys(null, `${process.env.DB_SCHEMA}`, tableName('PKTEST'));
      assert.strictEqual(results.length, 1);
      assert.deepStrictEqual(results.columns, global.dbmsConfig.sqlPrimaryKeysColumns);

      const result = results[0];
      // not testing for TABLE_CAT, dependent on the system
      assert.strictEqual(result.TABLE_SCHEM, tableName(`${process.env.DB_SCHEMA}`));
      assert.strictEqual(result.TABLE_NAME, tableName('PKTEST'));
      assert.strictEqual(result.COLUMN_NAME, colName('ID'));
      await connection.close();
    });
    it('...should return information about a primary key with multiple columns.', async () => {
      const connection = await odbc.connect(`${process.env.CONNECTION_STRING}`);
      const results = await connection.primaryKeys(null, `${process.env.DB_SCHEMA}`, tableName('MULTIPKTEST'));

      assert.strictEqual(results.length, 2);
      assert.deepStrictEqual(results.columns, global.dbmsConfig.sqlPrimaryKeysColumns);

      let result = results[0];
      // not testing for TABLE_CAT, dependent on the system
      assert.strictEqual(result.TABLE_SCHEM, tableName(`${process.env.DB_SCHEMA}`));
      assert.strictEqual(result.TABLE_NAME, tableName('MULTIPKTEST'));
      assert.strictEqual(result.COLUMN_NAME, colName('ID'));

      result = results[1];
      // not testing for TABLE_CAT, dependent on the system
      assert.strictEqual(result.TABLE_SCHEM, tableName(`${process.env.DB_SCHEMA}`));
      assert.strictEqual(result.TABLE_NAME, tableName('MULTIPKTEST'));
      assert.strictEqual(result.COLUMN_NAME, colName('NUM'));
      await connection.close();
    });
    it('...should return empty with bad parameters.', async () => {
      const connection = await odbc.connect(`${process.env.CONNECTION_STRING}`);
      const results = await connection.primaryKeys(null, 'bad schema name', 'bad table name');

      assert.strictEqual(results.length, 0);
      assert.deepStrictEqual(results.columns, global.dbmsConfig.sqlPrimaryKeysColumns);
      await connection.close();
    });
  }); // ...with promises...
});
