import { client } from './native/client.ts';
import type { FetchOutcome } from './native/protocol.ts';
import { buildResult, type Result, type Row } from './native/result.ts';

/**
 * A cursor over the result set of a query or prepared statement that was run
 * with the `cursor` or `fetchSize` option, returning rows in batches.
 */
export class Cursor {
  static readonly CURSOR_CLOSED_ERROR = 'Cursor has already been closed!';

  private handle: string | null;
  private readonly statement: string | null;
  private readonly parameters: unknown[];
  private isNoData = false;

  constructor(
    handle: string,
    {
      statement = null,
      parameters = [],
    }: { statement?: string | null; parameters?: unknown[] } = {},
  ) {
    this.handle = handle;
    this.statement = statement;
    this.parameters = parameters;
  }

  /** Whether the last fetch reached the end of the result set. */
  get noData(): boolean {
    this.requireOpen();
    return this.isNoData;
  }

  /** Returns the next batch of rows. The batch is empty once `noData` is set. */
  async fetch<T = Row>(): Promise<Result<T>> {
    const handle = this.requireOpen();

    const outcome = await client.request<FetchOutcome>('cursor', handle, 'fetch');
    this.isNoData = outcome.noData;
    return buildResult<T>(outcome.result, {
      statement: this.statement,
      parameters: this.parameters,
    });
  }

  /** Closes the cursor and frees the statement handle behind it. */
  async close(): Promise<void> {
    const handle = this.requireOpen();

    await client.request('cursor', handle, 'close');
    this.handle = null;
  }

  private requireOpen(): string {
    if (this.handle === null) throw new Error(Cursor.CURSOR_CLOSED_ERROR);
    return this.handle;
  }
}
