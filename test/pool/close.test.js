/* eslint-env node, mocha */
const assert = require('assert');
const odbc   = require('../../lib/odbc');

describe('close()...', () => {
  describe('...with promises...', () => {
    it('...should close all connections in the Pool.', async () => {
      const pool = await odbc.pool(`${process.env.CONNECTION_STRING}`);
      assert.notDeepEqual(pool, null);
      await new Promise(resolve => setTimeout(resolve, 5000));
      assert.deepEqual(pool.freeConnections.length, 10);
      await pool.close();
      assert.deepEqual(pool.freeConnections.length, 0);
    });
  }); // ...with promises...
});
