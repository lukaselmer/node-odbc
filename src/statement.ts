import { Cursor } from './cursor.ts';
import { client } from './native/client.ts';
import type { QueryOutcome } from './native/protocol.ts';
import {
  parseQueryOptions,
  type CursorQueryOptions,
  type QueryOptions,
} from './native/queryOptions.ts';
import { buildResult, type Result, type Row } from './native/result.ts';

/**
 * A prepared statement: the SQL is compiled once and can then be executed
 * repeatedly with different parameters.
 *
 * A call with the wrong signature throws, since that is a mistake in the
 * calling code. Everything else, including using a closed statement, rejects.
 */
export class Statement {
  static readonly STATEMENT_CLOSED_ERROR = 'Statement has already been closed!';

  private handle: string | null;
  private sql: string | null = null;
  private parameters: unknown[] = [];

  constructor(handle: string) {
    this.handle = handle;
  }

  /** Prepares an SQL statement, with or without parameter markers. */
  prepare(sql: string): Promise<void> {
    if (typeof sql !== 'string') {
      throw new TypeError(
        '[node-odbc]: Incorrect function signature for call to statement.prepare({string}).',
      );
    }
    return this.runPrepare(sql);
  }

  private async runPrepare(sql: string): Promise<void> {
    const handle = this.requireOpen();

    this.sql = sql;
    await client.request('statement', handle, 'prepare', { sql });
  }

  /** Binds parameters to the previously prepared statement. */
  bind(parameters: unknown[]): Promise<void> {
    if (!Array.isArray(parameters)) {
      throw new TypeError(
        '[node-odbc]: Incorrect function signature for call to statement.bind({array}).',
      );
    }
    return this.runBind(parameters);
  }

  private async runBind(parameters: unknown[]): Promise<void> {
    const handle = this.requireOpen();

    this.parameters = parameters;
    await client.request('statement', handle, 'bind', { parameters });
  }

  /**
   * Executes the statement, returning a result or, when `cursor` or
   * `fetchSize` is set, a Cursor over the result set.
   */
  execute<T = Row>(): Promise<Result<T>>;
  execute<T = unknown, O extends QueryOptions = QueryOptions>(
    options: O,
  ): O extends CursorQueryOptions ? Promise<Cursor> : Promise<Result<T>>;
  execute<T = Row>(options: QueryOptions | null = null): Promise<Result<T> | Cursor> {
    if (options !== null && typeof options !== 'object') {
      throw new TypeError(
        '[node-odbc]: Incorrect function signature for call to statement.execute({object}[optional]).',
      );
    }
    return this.runExecute<T>(options);
  }

  private async runExecute<T>(options: QueryOptions | null): Promise<Result<T> | Cursor> {
    const handle = this.requireOpen();

    const outcome = await client.request<QueryOutcome>('statement', handle, 'execute', {
      options: parseQueryOptions(options),
    });

    if (outcome.cursor !== undefined) {
      return new Cursor(outcome.cursor, { statement: this.sql, parameters: this.parameters });
    }
    return buildResult<T>(outcome.result, { statement: this.sql, parameters: this.parameters });
  }

  /**
   * Cancels an operation running on this statement. The cancelled call fails
   * with SQLSTATE HY008.
   */
  async cancel(): Promise<void> {
    const handle = this.requireOpen();
    await client.request('statement', handle, 'cancel');
  }

  /** Closes the statement and frees its handle. */
  async close(): Promise<void> {
    const handle = this.requireOpen();

    await client.request('statement', handle, 'close');
    this.handle = null;
  }

  private requireOpen(): string {
    if (this.handle === null) throw new Error(Statement.STATEMENT_CLOSED_ERROR);
    return this.handle;
  }
}
