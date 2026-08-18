/** Options that make a call return a Cursor instead of a materialised result. */
export type CursorQueryOptions =
  | (QueryOptions & { cursor: boolean | string })
  | (QueryOptions & { fetchSize: number });

export interface QueryOptions {
  cursor?: boolean | string;
  fetchSize?: number;
  timeout?: number;
  initialBufferSize?: number;
}

export interface WireQueryOptions {
  cursor: boolean | string;
  fetchSize: number;
  timeout: number;
  initialBufferSize: number;
}

// The messages are the ones the native layer produced, since callers may match
// on them.
export function parseQueryOptions(options: QueryOptions | null): WireQueryOptions | null {
  if (options === null || options === undefined) return null;

  return {
    cursor: parseCursor(options.cursor),
    fetchSize: parsePositive(options.fetchSize, 'fetchSize'),
    timeout: parsePositive(options.timeout, 'timeout'),
    initialBufferSize: parsePositive(options.initialBufferSize, 'initialBufferSize'),
  };
}

function parseCursor(cursor: unknown): boolean | string {
  if (cursor === undefined) return false;
  if (typeof cursor === 'boolean' || typeof cursor === 'string') return cursor;
  throw new TypeError('Connection.query options: .cursor must be a STRING or BOOLEAN value.');
}

function parsePositive(value: unknown, name: string): number {
  if (value === undefined) return 0;
  if (typeof value !== 'number') {
    throw new TypeError(`Connection.query options: .${name} must be a NUMBER value.`);
  }
  if (value <= 0) {
    throw new RangeError(`Connection.query options: .${name} must be greater than 0.`);
  }
  return value;
}
