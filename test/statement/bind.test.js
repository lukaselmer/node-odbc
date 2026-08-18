/* eslint-env node, mocha */
const assert = require('assert');
const odbc   = require('../../lib/odbc');

describe('.bind(parameters)...', () => {
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

    const BIND_TYPE_ERROR = {
      name: 'TypeError',
      message: '[node-odbc]: statement.bind requires the parameters to be an array.',
    };

    await assert.rejects(async () => {
      await statement.bind();
    }, BIND_TYPE_ERROR);
    await assert.rejects(async () => {
      await statement.bind(1);
    }, BIND_TYPE_ERROR);
    await assert.rejects(async () => {
      await statement.bind(null);
    }, BIND_TYPE_ERROR);
    await assert.rejects(async () => {
      await statement.bind(undefined);
    }, BIND_TYPE_ERROR);
    await assert.rejects(async () => {
      await statement.bind({});
    }, BIND_TYPE_ERROR);

    // await connection.close();
  });
  it('...should bind if a valid SQL string has been prepared.', async () => {
    await assert.doesNotReject(async () => {
      const statement = await connection.createStatement();
      assert.notDeepEqual(statement, null);
      await statement.prepare(`INSERT INTO ${process.env.DB_SCHEMA}.${process.env.DB_TABLE} VALUES(?, ?, ?)`);
      await statement.bind([1, 'bound1', 10]);
    });
  });
  it('...should bind even if parameter types are invalid for the prepared SQL statement', async () => {
    await assert.doesNotReject(async () => {
      const statement = await connection.createStatement();
      assert.notDeepEqual(statement, null);
      await statement.prepare(`INSERT INTO ${process.env.DB_SCHEMA}.${process.env.DB_TABLE} VALUES(?, ?, ?)`);
      await statement.bind(['ID', 1, 'AGE']);
    });
  });
  it('...should not bind if there is an incorrect number of parameters for the prepared SQL statement', async () => {
    const statement = await connection.createStatement();
    assert.notDeepEqual(statement, null);
    await statement.prepare(`INSERT INTO ${process.env.DB_SCHEMA}.${process.env.DB_TABLE} VALUES(?, ?, ?)`);
    await assert.rejects(async () => {
      await statement.bind([1, 'bound']);
    });
  });
  it('...should not bind if statement.prepare({string}, {function}[optional]) has not yet been called (> 0 parameters).', async () => {
    const statement = await connection.createStatement();
    assert.notDeepEqual(statement, null);
    await assert.rejects(async () => {
      await statement.bind([1, 'bound', 10]);
    });
  });
  it('...should not bind if statement.prepare({string}, {function}[optional]) has not yet been called (0 parameters).', async () => {
    const statement = await connection.createStatement();
    assert.notDeepEqual(statement, null);
    await assert.rejects(async () => {
      await statement.bind([]);
    });
  });
});
