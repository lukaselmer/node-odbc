/* eslint-env node, mocha */
const assert = require('assert');
const odbc   = require('../../lib/odbc');

describe('.close()...', () => {
  describe('...with promises...', () => {
    it('...should set .connected property to false.', async () => {
      const connection = await odbc.connect(`${process.env.CONNECTION_STRING}`);
      assert.deepEqual(connection.connected, true);
      await connection.close();
      assert.deepEqual(connection.connected, false);
    });
    it('...shouldn\'t allow queries after close() is called.', async () => {
      const connection = await odbc.connect(`${process.env.CONNECTION_STRING}`);
      await connection.close();
      assert.rejects(async () => {
        await connection.query(`SELECT * FROM ${process.env.DB_SCHEMA}.${process.env.DB_TABLE}`);
      });
    });
  }); // ...with promises...
}); // '.close()...'
