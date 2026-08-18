import type { Connection } from '../../src/connection.ts';
import { describe, it, beforeEach, afterEach } from 'vitest';
import assert from 'node:assert';
import * as odbc from '../../src/odbc.ts';

describe('.bind(parameters, [calback])...', () => {
  let connection!: Connection;

  beforeEach(async () => {
    connection = await odbc.connect(`${process.env['CONNECTION_STRING']}`);
  });

  afterEach(async () => {
    await connection.close();
  });

  it("...should throw a TypeError if function signature doesn't match accepted signatures.", async () => {
    const statement = await connection.createStatement();

    const BIND_TYPE_ERROR = {
      name: 'TypeError',
      message: '[node-odbc]: Incorrect function signature for call to statement.bind({array}).',
    };
    const DUMMY_CALLBACK = () => {};
    const PREPARE_SQL = `INSERT INTO ${process.env['DB_SCHEMA']}.${process.env['DB_TABLE']} VALUES(?, ?, ?)`;

    assert.throws(() => {
      // @ts-expect-error - deliberately wrong signature
      statement.bind();
    }, BIND_TYPE_ERROR);
    assert.throws(() => {
      // @ts-expect-error - deliberately wrong signature
      statement.bind(DUMMY_CALLBACK);
    }, BIND_TYPE_ERROR);
    assert.throws(() => {
      // @ts-expect-error - deliberately wrong signature
      statement.bind(PREPARE_SQL);
    }, BIND_TYPE_ERROR);
    assert.throws(() => {
      // @ts-expect-error - deliberately wrong signature
      statement.bind(PREPARE_SQL, DUMMY_CALLBACK);
    }, BIND_TYPE_ERROR);
    assert.throws(() => {
      // @ts-expect-error - deliberately wrong signature
      statement.bind(1);
    }, BIND_TYPE_ERROR);
    assert.throws(() => {
      // @ts-expect-error - deliberately wrong signature
      statement.bind(1, DUMMY_CALLBACK);
    }, BIND_TYPE_ERROR);
    assert.throws(() => {
      // @ts-expect-error - deliberately wrong signature
      statement.bind(null);
    }, BIND_TYPE_ERROR);
    assert.throws(() => {
      // @ts-expect-error - deliberately wrong signature
      statement.bind(null, DUMMY_CALLBACK);
    }, BIND_TYPE_ERROR);
    assert.throws(() => {
      // @ts-expect-error - deliberately wrong signature
      statement.bind();
    }, BIND_TYPE_ERROR);
    assert.throws(() => {
      // @ts-expect-error - deliberately wrong signature
      statement.bind(undefined, DUMMY_CALLBACK);
    }, BIND_TYPE_ERROR);
    assert.throws(() => {
      // @ts-expect-error - deliberately wrong signature
      statement.bind({});
    }, BIND_TYPE_ERROR);
    assert.throws(() => {
      // @ts-expect-error - deliberately wrong signature
      statement.bind({}, DUMMY_CALLBACK);
    }, BIND_TYPE_ERROR);

    // await connection.close();
  });
  describe('...with promises...', () => {
    it('...should bind if a valid SQL string has been prepared.', async () => {
      await assert.doesNotReject(async () => {
        const statement = await connection.createStatement();
        assert.notDeepEqual(statement, null);
        await statement.prepare(
          `INSERT INTO ${process.env['DB_SCHEMA']}.${process.env['DB_TABLE']} VALUES(?, ?, ?)`,
        );
        await statement.bind([1, 'bound1', 10]);
      });
    });
    it('...should bind even if parameter types are invalid for the prepared SQL statement', async () => {
      await assert.doesNotReject(async () => {
        const statement = await connection.createStatement();
        assert.notDeepEqual(statement, null);
        await statement.prepare(
          `INSERT INTO ${process.env['DB_SCHEMA']}.${process.env['DB_TABLE']} VALUES(?, ?, ?)`,
        );
        await statement.bind(['ID', 1, 'AGE']);
      });
    });
    it('...should not bind if there is an incorrect number of parameters for the prepared SQL statement', async () => {
      const statement = await connection.createStatement();
      assert.notDeepEqual(statement, null);
      await statement.prepare(
        `INSERT INTO ${process.env['DB_SCHEMA']}.${process.env['DB_TABLE']} VALUES(?, ?, ?)`,
      );
      await assert.rejects(async () => {
        await statement.bind([1, 'bound']);
      });
    });
    it('...should not bind if statement.prepare({string}) has not yet been called (> 0 parameters).', async () => {
      const statement = await connection.createStatement();
      assert.notDeepEqual(statement, null);
      await assert.rejects(async () => {
        await statement.bind([1, 'bound', 10]);
      });
    });
    it('...should not bind if statement.prepare({string}) has not yet been called (0 parameters).', async () => {
      const statement = await connection.createStatement();
      assert.notDeepEqual(statement, null);
      await assert.rejects(async () => {
        await statement.bind([]);
      });
    });
  }); // '...with promises...'
});
