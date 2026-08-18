/* eslint-env node, mocha */
const assert   = require('assert');
const odbc     = require('../../lib/odbc');
const { Pool } = require('../../lib/Pool');

describe('...[initialStatements]...', () => {
  describe('...validation...', () => {
    it('...should default to running nothing.', () => {
      const pool = new Pool(`${process.env.CONNECTION_STRING}`);
      assert.deepEqual(pool.initialStatements, []);
    });
    it('...should keep the statements it was given.', () => {
      const pool = new Pool({
        connectionString: `${process.env.CONNECTION_STRING}`,
        initialStatements: ['SET SESSION ISOLATION LEVEL READ COMMITTED'],
      });
      assert.deepEqual(pool.initialStatements, ['SET SESSION ISOLATION LEVEL READ COMMITTED']);
    });
    it('...should reject anything that is not an array of strings.', () => {
      for (const initialStatements of ['SELECT 1', [1], [null], {}]) {
        assert.throws(
          () => new Pool({ connectionString: `${process.env.CONNECTION_STRING}`, initialStatements }),
          TypeError
        );
      }
    });
  }); // ...validation...

  describe('...against the database...', () => {
    it('...should hand out connections once the statements succeeded.', async () => {
      const pool = await odbc.pool({
        connectionString: `${process.env.CONNECTION_STRING}`,
        initialSize: 2,
        initialStatements: ['SELECT 1'],
      });
      const connection = await pool.connect();
      const result = await connection.query('SELECT 1 AS ONE');
      assert.deepEqual(result.length, 1);
      await connection.close();
      await pool.close();
    });

    it('...should not hand out a connection whose statements failed.', async () => {
      await assert.rejects(odbc.pool({
        connectionString: `${process.env.CONNECTION_STRING}`,
        initialSize: 1,
        initialStatements: ['SELEC nonsense'],
      }));
    });
  }); // ...against the database...
});
