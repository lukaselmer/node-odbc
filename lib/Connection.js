const { Statement } = require('./Statement');

const CONNECTION_CLOSED_ERROR = 'Connection has already been closed!';

class Connection {

  static CONNECTION_CLOSED_ERROR = CONNECTION_CLOSED_ERROR;

  constructor(odbcConnection) {
    this.odbcConnection = odbcConnection;
  }

  /** Whether the driver still considers the link to be up. */
  get connected() {
    if (!this.odbcConnection) return false;
    return this.odbcConnection.connected;
  }

  /**
   * Run a query, optionally with parameters bound to its `?` placeholders.
   * @param {string} sql
   * @param {Array} [parameters]
   * @returns {Promise<Array>} the rows, carrying `count`, `columns` and `statement`
   */
  async query(sql, parameters = undefined) {
    if (typeof sql !== 'string') {
      throw new TypeError('[node-odbc]: connection.query requires the SQL to be a string.');
    }
    if (parameters !== undefined && parameters !== null && !Array.isArray(parameters)) {
      throw new TypeError('[node-odbc]: connection.query requires the parameters to be an array.');
    }

    return this.native().query(sql, parameters ?? undefined);
  }

  /** @returns {Promise<Statement>} */
  async createStatement() {
    return new Statement(await this.native().createStatement());
  }

  /**
   * The tables matching the given restrictions, where `null` means "no restriction".
   * @returns {Promise<Array>}
   */
  async tables(catalog, schema, table, type) {
    return this.native().tables(catalog, schema, table, type);
  }

  /**
   * The columns matching the given restrictions, where `null` means "no restriction".
   * @returns {Promise<Array>}
   */
  async columns(catalog, schema, table, column) {
    return this.native().columns(catalog, schema, table, column);
  }

  /** Begins a transaction, turning off auto-commit until commit or rollback. */
  async beginTransaction() {
    return this.native().beginTransaction();
  }

  async commit() {
    return this.native().commit();
  }

  async rollback() {
    return this.native().rollback();
  }

  /** Closing twice is not an error, so that cleanup paths can be unconditional. */
  async close() {
    if (!this.odbcConnection) return;

    const connection = this.odbcConnection;
    this.odbcConnection = null;
    await connection.close();
  }

  native() {
    if (!this.odbcConnection) throw new Error(CONNECTION_CLOSED_ERROR);
    return this.odbcConnection;
  }
}

module.exports.Connection = Connection;
