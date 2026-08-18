const { client } = require('./native/client');
const { buildResult } = require('./native/result');
const { parseQueryOptions } = require('./native/queryOptions');
const { Cursor } = require('./Cursor');

/**
 * A prepared statement: the SQL is compiled once and can then be executed
 * repeatedly with different parameters.
 */
class Statement {
  static STATEMENT_CLOSED_ERROR = 'Statement has already been closed!';

  constructor(handle, { fetchArray = false } = {}) {
    this.handle = handle;
    this.fetchArray = fetchArray;
    this.sql = null;
    this.parameters = [];
  }

  /**
   * Prepares an SQL statement, with or without parameter markers.
   * @param {string} sql
   */
  prepare(sql) {
    if (typeof sql !== 'string') {
      throw new TypeError(
        '[node-odbc]: Incorrect function signature for call to statement.prepare({string}).'
      );
    }
    return this.runPrepare(sql);
  }

  async runPrepare(sql) {
    this.requireOpen();

    this.sql = sql;
    await this.call('prepare', { sql });
  }

  /**
   * Binds parameters to the previously prepared statement.
   * @param {*[]} parameters
   */
  bind(parameters) {
    if (!Array.isArray(parameters)) {
      throw new TypeError(
        '[node-odbc]: Incorrect function signature for call to statement.bind({array}).'
      );
    }
    return this.runBind(parameters);
  }

  async runBind(parameters) {
    this.requireOpen();

    this.parameters = parameters;
    await this.call('bind', { parameters });
  }

  /**
   * Executes the statement, returning a result or, when `cursor` or `fetchSize`
   * is set, a Cursor over the result set.
   * @param {object} [options]
   * @returns {Promise<Array|Cursor>}
   */
  execute(options = null) {
    if (options !== null && options !== undefined && typeof options !== 'object') {
      throw new TypeError(
        '[node-odbc]: Incorrect function signature for call to statement.execute({object}[optional]).'
      );
    }
    return this.runExecute(options);
  }

  async runExecute(options) {
    this.requireOpen();

    const outcome = await this.call('execute', { options: parseQueryOptions(options) });
    if (outcome.cursor) {
      return new Cursor(outcome.cursor, { statement: this.sql, parameters: this.parameters });
    }
    return buildResult(outcome.result, { statement: this.sql, parameters: this.parameters });
  }

  /**
   * Cancels an operation running on this statement. The cancelled call fails
   * with SQLSTATE HY008.
   */
  async cancel() {
    this.requireOpen();
    await this.call('cancel');
  }

  /** Closes the statement and frees its handle. */
  async close() {
    this.requireOpen();

    await this.call('close');
    this.handle = null;
  }

  call(method, args) {
    return client.request('statement', this.handle, method, args);
  }

  requireOpen() {
    if (!this.handle) throw new Error(Statement.STATEMENT_CLOSED_ERROR);
  }
}

module.exports.Statement = Statement;
