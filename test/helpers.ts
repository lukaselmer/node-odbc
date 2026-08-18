/**
 * Test helpers for cross-DBMS compatibility.
 *
 * PostgreSQL folds unquoted identifiers to lowercase while IBMi and MSSQL
 * return them in uppercase. These helpers normalise result rows and expected
 * metadata values so that the same assertions work for every DBMS.
 */

import type { Row } from '../src/odbc.ts';
import { dbms } from './setup/testEnv.ts';

const LOWERCASE_DBMS = new Set(['postgres', 'postgresql']);

export function normalizeRows(rows: unknown): Row[] {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => normalizeRow(row));
}

/** Upper-cases every key of a row, so assertions can use uppercase names. */
export function normalizeRow(row: unknown): Row {
  if (row === null || typeof row !== 'object') return {};

  return Object.fromEntries(
    Object.entries(row as Row).map(([key, value]) => [key.toUpperCase(), value]),
  );
}

/** The table name as the DBMS reports it in metadata result sets. */
export function tableName(name: string): string {
  return colName(name);
}

/** The column name as the DBMS reports it in metadata result sets. */
export function colName(name: string): string {
  return isLowercaseDbms() ? name.toLowerCase() : name;
}

export function isLowercaseDbms(): boolean {
  return LOWERCASE_DBMS.has(dbms());
}
