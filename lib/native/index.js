const { SidecarClient } = require('./client');
const { decodeRows, decodeValue } = require('./values');
const { odbcConstants } = require('./constants');
const { parseQueryOptions } = require('./queryOptions');

const client = new SidecarClient();

// connect mirrors the addon's argument validation, which threw synchronously
// and reported everything else through the callback.
function connect(connectionStringOrObject, callback) {
  if (arguments.length !== 2) {
    throw new TypeError('connect(connectionString, callback) requires 2 parameters.');
  }

  const options = connectionOptionsOf(connectionStringOrObject);
  if (typeof callback !== 'function') {
    throw new TypeError('connect: second parameter must be a function.');
  }

  runAsync(callback, async () => {
    const { handle } = await client.request('odbc', undefined, 'connect', options);
    return new OdbcConnection(handle, options.fetchArray === true);
  });
}

function connectionOptionsOf(value) {
  if (typeof value === 'string') return { connectionString: value };

  if (value === null || typeof value !== 'object') {
    throw new TypeError('connect: first parameter must be a string or an object.');
  }
  if (typeof value.connectionString !== 'string') {
    throw new TypeError(
      "connect: A configuration object must have a 'connectionString' property that is a string."
    );
  }

  return {
    connectionString: value.connectionString,
    connectionTimeout: numberOr(value.connectionTimeout, 0),
    loginTimeout: numberOr(value.loginTimeout, 0),
    fetchArray: value.fetchArray === true,
  };
}

function numberOr(value, fallback) {
  return typeof value === 'number' ? value : fallback;
}

class OdbcConnection {
  constructor(handle, fetchArray) {
    this.handle = handle;
    this.fetchArray = fetchArray;
    this.isConnected = true;
    this.isAutocommit = true;
  }

  get connected() {
    return this.isConnected;
  }

  get autocommit() {
    return this.isAutocommit;
  }

  query(sql, parameters, options, callback) {
    let parsed;
    try {
      parsed = parseQueryOptions(options);
    } catch (error) {
      return process.nextTick(() => callback(error));
    }

    runAsync(callback, async () => {
      const outcome = await this.call('query', { sql, parameters, options: parsed });
      return this.resultOrCursor(outcome, sql, parameters ?? []);
    });
  }

  createStatement(callback) {
    runAsync(callback, async () => {
      const { handle } = await this.call('createStatement');
      return new OdbcStatement(this, handle);
    });
  }

  close(callback) {
    runAsync(callback, async () => {
      await this.call('close');
      this.isConnected = false;
    });
  }

  cancel(callback) {
    runAsync(callback, () => this.call('cancel'));
  }

  beginTransaction(callback) {
    runAsync(callback, async () => {
      await this.call('beginTransaction');
      this.isAutocommit = false;
    });
  }

  commit(callback) {
    runAsync(callback, async () => {
      await this.call('commit');
      this.isAutocommit = true;
    });
  }

  rollback(callback) {
    runAsync(callback, async () => {
      await this.call('rollback');
      this.isAutocommit = true;
    });
  }

  getUsername(callback) {
    runAsync(callback, () => this.call('getUsername'));
  }

  setIsolationLevel(level, callback) {
    runAsync(callback, () => this.call('setIsolationLevel', { level }));
  }

  tables(catalog, schema, table, type, callback) {
    this.catalogQuery('tables', { catalog, schema, table, type }, callback);
  }

  columns(catalog, schema, table, column, callback) {
    this.catalogQuery('columns', { catalog, schema, table, column }, callback);
  }

  primaryKeys(catalog, schema, table, callback) {
    this.catalogQuery('primaryKeys', { catalog, schema, table }, callback);
  }

  foreignKeys(catalog, schema, table, foreignCatalog, foreignSchema, foreignTable, callback) {
    const args = { catalog, schema, table, foreignCatalog, foreignSchema, foreignTable };
    this.catalogQuery('foreignKeys', args, callback);
  }

  callProcedure(catalog, schema, name, parameters, callback) {
    runAsync(callback, async () => {
      const outcome = await this.call('callProcedure', { catalog, schema, name, parameters });
      return this.resultOrCursor(outcome, outcome.result?.statement ?? null, parameters);
    });
  }

  catalogQuery(method, args, callback) {
    runAsync(callback, async () => {
      const outcome = await this.call(method, args);
      return buildResult(outcome.result, this.fetchArray);
    });
  }

  resultOrCursor(outcome, statement, parameters) {
    if (outcome.cursor) return new OdbcCursor(this, outcome.cursor, statement, parameters);
    return buildResult(outcome.result, this.fetchArray, statement, parameters);
  }

  call(method, args) {
    return client.request('connection', this.handle, method, args);
  }
}

class OdbcStatement {
  constructor(connection, handle) {
    this.connection = connection;
    this.handle = handle;
  }

  prepare(sql, callback) {
    this.sql = sql;
    runAsync(callback, () => this.call('prepare', { sql }));
  }

  bind(parameters, callback) {
    this.parameters = parameters;
    runAsync(callback, () => this.call('bind', { parameters }));
  }

  execute(options, callback) {
    let parsed;
    try {
      parsed = parseQueryOptions(options);
    } catch (error) {
      return process.nextTick(() => callback(error));
    }

    runAsync(callback, async () => {
      const outcome = await this.call('execute', { options: parsed });
      return this.connection.resultOrCursor(outcome, this.sql ?? null, this.parameters ?? []);
    });
  }

  cancel(callback) {
    runAsync(callback, () => this.call('cancel'));
  }

  close(callback) {
    runAsync(callback, () => this.call('close'));
  }

  call(method, args) {
    return client.request('statement', this.handle, method, args);
  }
}

class OdbcCursor {
  constructor(connection, handle, statement, parameters) {
    this.connection = connection;
    this.handle = handle;
    this.statement = statement ?? null;
    this.parameters = parameters ?? [];
    this.isNoData = false;
  }

  get noData() {
    return this.isNoData;
  }

  fetch(callback) {
    runAsync(callback, async () => {
      const outcome = await this.call('fetch');
      this.isNoData = outcome.noData;
      return buildResult(outcome.result, this.connection.fetchArray, this.statement, this.parameters);
    });
  }

  close(callback) {
    runAsync(callback, () => this.call('close'));
  }

  call(method, args) {
    return client.request('cursor', this.handle, method, args);
  }
}

// buildResult rebuilds the array-with-properties shape the addon returned.
function buildResult(payload, fetchArray, statement, parameters) {
  const rows = decodeRows(payload?.rows ?? []);
  rows.count = payload?.count ?? -1;
  rows.columns = payload?.columns ?? [];
  rows.statement = statement !== undefined ? statement : (payload?.statement ?? null);
  rows.parameters = parameters !== undefined ? parameters : (payload?.parameters ?? []);
  rows.return = undefined;
  return rows;
}

// Every native method reported failures through the callback rather than by
// rejecting, so the promise is unwrapped here.
function runAsync(callback, work) {
  work().then(
    (result) => callback(null, result),
    (error) => callback(error)
  );
}

module.exports = { connect, odbcConstants, decodeValue };
