import type { ColumnDefinition, ResultPayload } from './protocol.ts';
import { decodeRows } from './values.ts';

/** A row keyed by column name, which is what the driver returns by default. */
export type Row = Record<string, unknown>;

/**
 * A result is an array of rows carrying the query metadata as properties,
 * which is the shape callers have always seen.
 */
export interface Result<T> extends Array<T> {
  count: number;
  columns: ColumnDefinition[];
  statement: string | null;
  parameters: unknown[];
  return: undefined;
}

interface ResultContext {
  statement?: string | null;
  parameters?: unknown[] | undefined;
}

function provided<T>(value: T | undefined, fallback: T): T {
  return value === undefined ? fallback : value;
}

export function buildResult<T>(
  payload: ResultPayload | undefined,
  { statement, parameters }: ResultContext = {},
): Result<T> {
  const rows = decodeRows(payload?.rows ?? []) as Result<T>;
  rows.count = payload?.count ?? -1;
  rows.columns = payload?.columns ?? [];
  // An explicit null statement is meaningful: catalog calls have no SQL text.
  rows.statement = provided(statement, payload?.statement ?? null);
  rows.parameters = provided(parameters, payload?.parameters ?? []);
  rows.return = undefined;
  return rows;
}
