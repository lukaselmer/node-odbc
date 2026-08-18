const { client } = require('./native/client');
const { buildResult } = require('./native/result');
const { parseQueryOptions } = require('./native/queryOptions');
const { Statement } = require('./Statement');
const { Cursor } = require('./Cursor');

/**
 * An open connection to a database, made through an ODBC driver.
 *
 * A call with the wrong signature throws, since that is a mistake in the
 * calling code. Everything else, including using a closed connection, rejects.
 */
class Connection {
  static CONNECTION_CLOSED_ERROR = 'Connection has already been closed!';

  constructor(handle, { fetchArray = false } = {}) {
    this.handle = handle;
    this.fetchArray = fetchArray;
    this.isAutocommit = true;
  }

  get connected() {
    return this.handle !== null;
  }

  get autocommit() {
    return this.isAutocommit;
  }

  /**
   * Runs a statement. Accepts (sql), (sql, parameters), (sql, options) or
   * (sql, parameters, options), and returns a Cursor instead of a result when
   * `cursor` or `fetchSize` is set.
   * @param {string} sql
   * @param {*[]} [parameters]
   * @param {object} [options]
   * @returns {Promise<Array|Cursor>}
   */
  query(sql, parameters, options) {
    return this.runQuery(sql, queryArguments(sql, parameters, options));
  }

  async runQuery(sql, call) {
    this.requireOpen();

    const outcome = await this.call('query', {
      sql,
      parameters: call.parameters,
      options: parseQueryOptions(call.options),
    });

    if (outcome.cursor) {
      return new Cursor(outcome.cursor, { statement: sql, parameters: call.parameters ?? [] });
    }
    return buildResult(outcome.result, { statement: sql, parameters: call.parameters ?? [] });
  }

  /**
   * Calls a stored procedure, returning its result set. Output parameters are
   * written back into the passed array.
   * @param {string|null} catalog
   * @param {string|null} schema
   * @param {string} name
   * @param {*[]} [parameters]
   */
  callProcedure(catalog, schema, name, parameters = null) {
    if (typeof name !== 'string' || (parameters !== null && !Array.isArray(parameters))) {
      throw new TypeError(
        '[node-odbc]: Incorrect function signature for call to connection.callProcedure({string}, {array}[optional]).'
      );
    }
    return this.runProcedure(catalog, schema, name, parameters);
  }

  async runProcedure(catalog, schema, name, parameters) {
    this.requireOpen();

    const outcome = await this.call('callProcedure', { catalog, schema, name, parameters });
    return buildResult(outcome.result, { parameters: parameters ?? undefined });
  }

  /** Creates a statement that can be prepared, bound and executed repeatedly. */
  async createStatement() {
    this.requireOpen();

    const { handle } = await this.call('createStatement');
    return new Statement(handle, { fetchArray: this.fetchArray });
  }

  /** Closes the connection, rolling back any open transaction. */
  async close() {
    this.requireOpen();

    await this.call('close');
    this.handle = null;
  }

  /**
   * Cancels the operations running on this connection. Cancelled calls fail
   * with SQLSTATE HY008.
   */
  async cancel() {
    this.requireOpen();
    await this.call('cancel');
  }

  /** Turns off autocommit until commit() or rollback() is called. */
  async beginTransaction() {
    this.requireOpen();

    await this.call('beginTransaction');
    this.isAutocommit = false;
  }

  async commit() {
    this.requireOpen();

    await this.call('commit');
    this.isAutocommit = true;
  }

  async rollback() {
    this.requireOpen();

    await this.call('rollback');
    this.isAutocommit = true;
  }

  /** @param {number} level one of the SQL_TXN_* constants */
  async setIsolationLevel(level) {
    this.requireOpen();
    await this.call('setIsolationLevel', { level });
  }

  tables(catalog, schema, table, type) {
    return this.catalogQuery('tables', { catalog, schema, table, type });
  }

  columns(catalog, schema, table, column) {
    return this.catalogQuery('columns', { catalog, schema, table, column });
  }

  primaryKeys(catalog, schema, table) {
    return this.catalogQuery('primaryKeys', { catalog, schema, table });
  }

  foreignKeys(catalog, schema, table, foreignCatalog, foreignSchema, foreignTable) {
    return this.catalogQuery('foreignKeys', {
      catalog,
      schema,
      table,
      foreignCatalog,
      foreignSchema,
      foreignTable,
    });
  }

  async catalogQuery(method, args) {
    this.requireOpen();

    const outcome = await this.call(method, args);
    return buildResult(outcome.result);
  }

  call(method, args) {
    return client.request('connection', this.handle, method, args);
  }

  requireOpen() {
    if (!this.handle) throw new Error(Connection.CONNECTION_CLOSED_ERROR);
  }
}

// An options object may take the place of the parameter array, so the two are
// told apart by shape rather than by position.
function queryArguments(sql, parameters, options) {
  const parametersAreOptions =
    typeof parameters === 'object' && parameters !== null && !Array.isArray(parameters);

  const call = parametersAreOptions
    ? { parameters: null, options: parameters }
    : { parameters: parameters ?? null, options: options ?? null };

  if (
    typeof sql !== 'string' ||
    (call.parameters !== null && !Array.isArray(call.parameters)) ||
    (call.options !== null && typeof call.options !== 'object')
  ) {
    throw new TypeError(
      '[node-odbc]: Incorrect function signature for call to connection.query({string}, {array}[optional], {object}[optional]).'
    );
  }
  return call;
}

module.exports.Connection = Connection;
