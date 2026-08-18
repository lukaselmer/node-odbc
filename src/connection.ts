import { Cursor } from './cursor.ts';
import { client } from './native/client.ts';
import type { HandleOutcome, QueryOutcome } from './native/protocol.ts';
import {
  parseQueryOptions,
  type CursorQueryOptions,
  type QueryOptions,
} from './native/queryOptions.ts';
import { buildResult, type Result, type Row } from './native/result.ts';
import { Statement } from './statement.ts';

interface QueryArguments {
  parameters: unknown[] | null;
  options: QueryOptions | null;
}

/**
 * An open connection to a database, made through an ODBC driver.
 *
 * A call with the wrong signature throws, since that is a mistake in the
 * calling code. Everything else, including using a closed connection, rejects.
 */
export class Connection {
  static readonly CONNECTION_CLOSED_ERROR = 'Connection has already been closed!';

  private handle: string | null;
  private isAutocommit = true;

  constructor(handle: string) {
    this.handle = handle;
  }

  get connected(): boolean {
    return this.handle !== null;
  }

  get autocommit(): boolean {
    return this.isAutocommit;
  }

  /**
   * Runs a statement. Accepts (sql), (sql, parameters), (sql, options) or
   * (sql, parameters, options), and returns a Cursor instead of a result when
   * `cursor` or `fetchSize` is set.
   */
  query<T = Row>(sql: string): Promise<Result<T>>;
  query<T = Row>(sql: string, parameters: unknown[] | null): Promise<Result<T>>;
  query<T = unknown, O extends QueryOptions = QueryOptions>(
    sql: string,
    options: O,
  ): O extends CursorQueryOptions ? Promise<Cursor> : Promise<Result<T>>;
  query<T = unknown, O extends QueryOptions = QueryOptions>(
    sql: string,
    parameters: unknown[] | null,
    options: O,
  ): O extends CursorQueryOptions ? Promise<Cursor> : Promise<Result<T>>;
  query<T = Row>(
    sql: string,
    parameters?: unknown[] | QueryOptions | null,
    options?: QueryOptions | null,
  ): Promise<Result<T> | Cursor> {
    return this.runQuery<T>(sql, queryArguments(sql, parameters, options));
  }

  private async runQuery<T>(sql: string, call: QueryArguments): Promise<Result<T> | Cursor> {
    const handle = this.requireOpen();

    const outcome = await client.request<QueryOutcome>('connection', handle, 'query', {
      sql,
      parameters: call.parameters,
      options: parseQueryOptions(call.options),
    });
    return this.resultOrCursor<T>(outcome, sql, call.parameters ?? []);
  }

  /**
   * Calls a stored procedure, returning its result set. Output parameters are
   * written back into the passed array.
   */
  callProcedure<T = Row>(
    catalog: string | null,
    schema: string | null,
    name: string,
    parameters: unknown[] | null = null,
  ): Promise<Result<T>> {
    if (typeof name !== 'string' || (parameters !== null && !Array.isArray(parameters))) {
      throw new TypeError(
        '[node-odbc]: Incorrect function signature for call to connection.callProcedure({string}, {array}[optional]).',
      );
    }
    return this.runProcedure<T>(catalog, schema, name, parameters);
  }

  private async runProcedure<T>(
    catalog: string | null,
    schema: string | null,
    name: string,
    parameters: unknown[] | null,
  ): Promise<Result<T>> {
    const handle = this.requireOpen();

    const outcome = await client.request<QueryOutcome>('connection', handle, 'callProcedure', {
      catalog,
      schema,
      name,
      parameters,
    });
    return buildResult<T>(outcome.result, { parameters: parameters ?? undefined });
  }

  /** Creates a statement that can be prepared, bound and executed repeatedly. */
  async createStatement(): Promise<Statement> {
    const handle = this.requireOpen();

    const outcome = await client.request<HandleOutcome>('connection', handle, 'createStatement');
    return new Statement(outcome.handle);
  }

  /** Closes the connection, rolling back any open transaction. */
  async close(): Promise<void> {
    const handle = this.requireOpen();

    await client.request('connection', handle, 'close');
    this.handle = null;
  }

  /**
   * Cancels the operations running on this connection. Cancelled calls fail
   * with SQLSTATE HY008.
   */
  async cancel(): Promise<void> {
    const handle = this.requireOpen();
    await client.request('connection', handle, 'cancel');
  }

  /** Turns off autocommit until commit() or rollback() is called. */
  async beginTransaction(): Promise<void> {
    const handle = this.requireOpen();

    await client.request('connection', handle, 'beginTransaction');
    this.isAutocommit = false;
  }

  async commit(): Promise<void> {
    const handle = this.requireOpen();

    await client.request('connection', handle, 'commit');
    this.isAutocommit = true;
  }

  async rollback(): Promise<void> {
    const handle = this.requireOpen();

    await client.request('connection', handle, 'rollback');
    this.isAutocommit = true;
  }

  /** @param level one of the SQL_TXN_* constants */
  async setIsolationLevel(level: number): Promise<void> {
    const handle = this.requireOpen();
    await client.request('connection', handle, 'setIsolationLevel', { level });
  }

  tables<T = Row>(
    catalog: string | null,
    schema: string | null,
    table: string | null,
    type: string | null,
  ): Promise<Result<T>> {
    return this.catalogQuery<T>('tables', { catalog, schema, table, type });
  }

  columns<T = Row>(
    catalog: string | null,
    schema: string | null,
    table: string | null,
    column: string | null,
  ): Promise<Result<T>> {
    return this.catalogQuery<T>('columns', { catalog, schema, table, column });
  }

  primaryKeys<T = Row>(
    catalog: string | null,
    schema: string | null,
    table: string | null,
  ): Promise<Result<T>> {
    return this.catalogQuery<T>('primaryKeys', { catalog, schema, table });
  }

  foreignKeys<T = Row>(
    catalog: string | null,
    schema: string | null,
    table: string | null,
    foreignCatalog: string | null,
    foreignSchema: string | null,
    foreignTable: string | null,
  ): Promise<Result<T>> {
    return this.catalogQuery<T>('foreignKeys', {
      catalog,
      schema,
      table,
      foreignCatalog,
      foreignSchema,
      foreignTable,
    });
  }

  private async catalogQuery<T>(method: string, args: unknown): Promise<Result<T>> {
    const handle = this.requireOpen();

    const outcome = await client.request<QueryOutcome>('connection', handle, method, args);
    return buildResult<T>(outcome.result);
  }

  private resultOrCursor<T>(
    outcome: QueryOutcome,
    sql: string,
    parameters: unknown[],
  ): Result<T> | Cursor {
    if (outcome.cursor !== undefined) {
      return new Cursor(outcome.cursor, { statement: sql, parameters });
    }
    return buildResult<T>(outcome.result, { statement: sql, parameters });
  }

  private requireOpen(): string {
    if (this.handle === null) throw new Error(Connection.CONNECTION_CLOSED_ERROR);
    return this.handle;
  }
}

// An options object may take the place of the parameter array, so the two are
// told apart by shape rather than by position.
function queryArguments(
  sql: string,
  parameters: unknown[] | QueryOptions | null | undefined,
  options: QueryOptions | null | undefined,
): QueryArguments {
  const parametersAreOptions =
    typeof parameters === 'object' && parameters !== null && !Array.isArray(parameters);

  const call: QueryArguments = parametersAreOptions
    ? { parameters: null, options: parameters }
    : { parameters: (parameters as unknown[] | null) ?? null, options: options ?? null };

  if (
    typeof sql !== 'string' ||
    (call.parameters !== null && !Array.isArray(call.parameters)) ||
    (call.options !== null && typeof call.options !== 'object')
  ) {
    throw new TypeError(
      '[node-odbc]: Incorrect function signature for call to connection.query({string}, {array}[optional], {object}[optional]).',
    );
  }
  return call;
}
