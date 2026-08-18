/* eslint-env node, mocha */
const assert = require('assert');
const odbc   = require('../../lib/odbc');
const { tableName } = require('../helpers');

describe('.tables(catalog, schema, table, type)...', () => {
  describe('...with promises...', () => {
    it('...should return information about a table.', async () => {
      const connection = await odbc.connect(`${process.env.CONNECTION_STRING}`);
      const results = await connection.tables(null, `${process.env.DB_SCHEMA}`, `${process.env.DB_TABLE}`, null);
      assert.strictEqual(results.length, 1);
      assert.deepStrictEqual(results.columns, global.dbmsConfig.sqlTablesColumns);

      const result = results[0];
      // not testing for TABLE_CAT, dependent on the system
      assert.strictEqual(result.TABLE_SCHEM, tableName(`${process.env.DB_SCHEMA}`));
      assert.strictEqual(result.TABLE_NAME, tableName(`${process.env.DB_TABLE}`));
      assert.strictEqual(result.TABLE_TYPE, 'TABLE');
      // not testing for REMARKS, dependent on the system
    });
    it('...should return empty with bad parameters.', async () => {
      const connection = await odbc.connect(`${process.env.CONNECTION_STRING}`);
      const results = await connection.tables(null, 'bad schema name', 'bad table name', null);
      assert.strictEqual(results.length, 0);
      assert.deepStrictEqual(results.columns, global.dbmsConfig.sqlTablesColumns);
    });
  }); // ...with promises...
});
