import { describe, it } from 'vitest';
import assert from 'node:assert';
import * as odbc from '../../src/odbc.ts';
import { connectionString, qualifiedTable } from '../setup/dbms.ts';

describe('odbc.pool initialStatements...', () => {
  it('...should run them on the connections it opens.', async () => {
    const pool = await odbc.pool({
      connectionString: connectionString(),
      initialSize: 1,
      initialStatements: [`INSERT INTO ${qualifiedTable()} VALUES(1, 'session', 10)`],
    });

    // How many connections are open by now is not fixed, so this asserts that
    // the statements ran rather than how often.
    const result = await pool.query(`SELECT * FROM ${qualifiedTable()}`);
    assert.ok(result.length > 0);
    await pool.close();
  });

  it('...should reject when a statement fails, rather than hand out the connection.', async () => {
    await assert.rejects(
      odbc.pool({
        connectionString: connectionString(),
        initialSize: 1,
        initialStatements: ['SELEC nonsense'],
      }),
    );
  });

  it('...should reject a configuration that is not an array of strings.', async () => {
    await assert.rejects(
      odbc.pool({
        connectionString: connectionString(),
        initialStatements: [42] as unknown as string[],
      }),
      TypeError,
    );
  });

  it('...should open normally when none are configured.', async () => {
    const pool = await odbc.pool({ connectionString: connectionString(), initialSize: 1 });
    const result = await pool.query(`SELECT * FROM ${qualifiedTable()}`);
    assert.deepEqual(result.length, 0);
    await pool.close();
  });
});
