const { client } = require('./native/client');
const { buildResult } = require('./native/result');

/**
 * A cursor over the result set of a query or prepared statement that was run
 * with the `cursor` or `fetchSize` option, returning rows in batches.
 */
class Cursor {
  static CURSOR_CLOSED_ERROR = 'Cursor has already been closed!';

  constructor(handle, { statement = null, parameters = [] } = {}) {
    this.handle = handle;
    this.statement = statement;
    this.parameters = parameters;
    this.isNoData = false;
  }

  /** Whether the last fetch reached the end of the result set. */
  get noData() {
    this.requireOpen();
    return this.isNoData;
  }

  /** Returns the next batch of rows. The batch is empty once `noData` is set. */
  async fetch() {
    this.requireOpen();

    const { result, noData } = await client.request('cursor', this.handle, 'fetch');
    this.isNoData = noData;
    return buildResult(result, { statement: this.statement, parameters: this.parameters });
  }

  /** Closes the cursor and frees the statement handle behind it. */
  async close() {
    this.requireOpen();

    await client.request('cursor', this.handle, 'close');
    this.handle = null;
  }

  requireOpen() {
    if (!this.handle) throw new Error(Cursor.CURSOR_CLOSED_ERROR);
  }
}

module.exports.Cursor = Cursor;
