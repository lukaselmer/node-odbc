const STATEMENT_CLOSED_ERROR = 'Statement has already been closed!';

class Statement {

  static STATEMENT_CLOSED_ERROR = STATEMENT_CLOSED_ERROR;

  constructor(odbcStatement) {
    this.odbcStatement = odbcStatement;
  }

  /**
   * Prepares an SQL template, whose `?` placeholders are then filled by `bind`.
   * @param {string} sql
   */
  async prepare(sql) {
    if (typeof sql !== 'string') {
      throw new TypeError('[node-odbc]: statement.prepare requires the SQL to be a string.');
    }
    return this.native().prepare(sql);
  }

  /**
   * Binds values to the prepared statement's placeholders.
   * @param {Array} parameters
   */
  async bind(parameters) {
    if (!Array.isArray(parameters)) {
      throw new TypeError('[node-odbc]: statement.bind requires the parameters to be an array.');
    }
    return this.native().bind(parameters);
  }

  /** @returns {Promise<Array>} the rows, carrying `count`, `columns` and `statement` */
  async execute() {
    return this.native().execute();
  }

  /** Closing twice is not an error, so that cleanup paths can be unconditional. */
  async close() {
    if (!this.odbcStatement) return;

    const statement = this.odbcStatement;
    this.odbcStatement = null;
    await statement.close();
  }

  native() {
    if (!this.odbcStatement) throw new Error(STATEMENT_CLOSED_ERROR);
    return this.odbcStatement;
  }
}

module.exports.Statement = Statement;
