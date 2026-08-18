import { describe, it } from 'vitest';
import { dbms } from '../setup/testEnv.ts';
import assert from 'node:assert';
import * as odbc from '../../src/odbc.ts';

describe('.prepare(sql, [calback])...', () => {
  it("...should throw a TypeError if function signature doesn't match accepted signatures.", async () => {
    const connection = await odbc.connect(`${process.env['CONNECTION_STRING']}`);
    const statement = await connection.createStatement();

    const PREPARE_TYPE_ERROR = {
      name: 'TypeError',
      message: '[node-odbc]: Incorrect function signature for call to statement.prepare({string}).',
    };
    const DUMMY_CALLBACK = () => {};

    assert.throws(() => {
      // @ts-expect-error - deliberately wrong signature
      statement.prepare();
    }, PREPARE_TYPE_ERROR);
    assert.throws(() => {
      // @ts-expect-error - deliberately wrong signature
      statement.prepare(DUMMY_CALLBACK);
    }, PREPARE_TYPE_ERROR);
    assert.throws(() => {
      // @ts-expect-error - deliberately wrong signature
      statement.prepare(1);
    }, PREPARE_TYPE_ERROR);
    assert.throws(() => {
      // @ts-expect-error - deliberately wrong signature
      statement.prepare(1, DUMMY_CALLBACK);
    }, PREPARE_TYPE_ERROR);
    assert.throws(() => {
      // @ts-expect-error - deliberately wrong signature
      statement.prepare(null);
    }, PREPARE_TYPE_ERROR);
    assert.throws(() => {
      // @ts-expect-error - deliberately wrong signature
      statement.prepare(null, DUMMY_CALLBACK);
    }, PREPARE_TYPE_ERROR);
    assert.throws(() => {
      // @ts-expect-error - deliberately wrong signature
      statement.prepare();
    }, PREPARE_TYPE_ERROR);
    assert.throws(() => {
      // @ts-expect-error - deliberately wrong signature
      statement.prepare(undefined, DUMMY_CALLBACK);
    }, PREPARE_TYPE_ERROR);
    assert.throws(() => {
      // @ts-expect-error - deliberately wrong signature
      statement.prepare({});
    }, PREPARE_TYPE_ERROR);
    assert.throws(() => {
      // @ts-expect-error - deliberately wrong signature
      statement.prepare({}, DUMMY_CALLBACK);
    }, PREPARE_TYPE_ERROR);

    // await connection.close();
  });
  describe('...with promises...', () => {
    it('...should prepare a valid SQL string', async () => {
      await assert.doesNotReject(async () => {
        const connection = await odbc.connect(`${process.env['CONNECTION_STRING']}`);
        const statement = await connection.createStatement();
        await statement.prepare(
          `INSERT INTO ${process.env['DB_SCHEMA']}.${process.env['DB_TABLE']} VALUES(?, ?, ?)`,
        );
        await connection.close();
      });
    });
    it('...should return an error with an invalid SQL string', async (ctx) => {
      // SQL Server and PostgreSQL don't check for syntax error when the application calls SQLPrepare
      if (dbms() === 'mssql' || dbms() === 'postgres') return ctx.skip();
      await assert.rejects(async () => {
        const connection = await odbc.connect(`${process.env['CONNECTION_STRING']}`);
        const statement = await connection.createStatement();
        await statement.prepare('INSERT INTO dummy123.table456 VALUES()');
        await connection.close();
      });
    });
    it('...should return an error with a blank SQL string', async (ctx) => {
      // SQL Server and PostgreSQL don't check for syntax error when the application calls SQLPrepare
      if (dbms() === 'mssql' || dbms() === 'postgres') return ctx.skip();
      await assert.rejects(async () => {
        const connection = await odbc.connect(`${process.env['CONNECTION_STRING']}`);
        const statement = await connection.createStatement();
        await statement.prepare('');
        await connection.close();
      });
    });
  }); // '...with promises...'
});
