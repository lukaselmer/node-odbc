/**
 * Cross-DBMS helpers.
 *
 * PostgreSQL folds unquoted identifiers to lower case while IBM i and MSSQL
 * report them in upper case, so assertions are written in upper case and the
 * rows normalised to match.
 */

const LOWERCASE_DBMS = new Set(["postgres", "postgresql"]);

export function connectionString(): string {
  const value = process.env.CONNECTION_STRING;
  if (!value) throw new Error("CONNECTION_STRING is not set");
  return value;
}

export function schema(): string {
  const value = process.env.DB_SCHEMA;
  if (!value) throw new Error("DB_SCHEMA is not set");
  return value;
}

export function table(): string {
  const value = process.env.DB_TABLE;
  if (!value) throw new Error("DB_TABLE is not set");
  return value;
}

/** The fully qualified table the suite reads and writes. */
export function qualifiedTable(): string {
  return `${schema()}.${table()}`;
}

export function normalizeRows<T extends object>(rows: readonly T[]): Record<string, unknown>[] {
  return rows.map((row) => normalizeRow(row));
}

/** Upper-cases every key, so assertions can be written one way for every DBMS. */
export function normalizeRow<T extends object>(row: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key.toUpperCase(), value]));
}

/**
 * Waits for a condition rather than a fixed delay.
 *
 * Filling a pool costs one round trip per connection, and a connect is about a
 * second, so any sleep long enough to be safe is also long enough to be slow.
 */
export async function waitFor(
  condition: () => boolean,
  { timeoutMs = 30_000, intervalMs = 100 } = {},
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`Condition not met within ${timeoutMs}ms`);
    await new Promise<void>((resolve) => {
      setTimeout(resolve, intervalMs);
    });
  }
}

/** The first row, normalised, asserting that there is one. */
export function firstRow<T extends object>(rows: readonly T[]): Record<string, unknown> {
  const row = rows[0];
  if (!row) throw new Error("Expected the result to have at least one row");
  return normalizeRow(row);
}

/** The row at `index`, normalised, asserting that it exists. */
export function rowAt<T extends object>(
  rows: readonly T[],
  index: number,
): Record<string, unknown> {
  const row = rows[index];
  if (!row) throw new Error(`Expected the result to have a row at index ${index}`);
  return normalizeRow(row);
}

/** A column or table name as the DBMS reports it in catalog result sets. */
export function colName(name: string): string {
  return isLowercaseDbms() ? name.toLowerCase() : name;
}

export const tableName = colName;

export function isLowercaseDbms(): boolean {
  return LOWERCASE_DBMS.has(process.env.DBMS ?? "");
}
