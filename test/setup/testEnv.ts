import { afterEach, beforeAll } from 'vitest';

import { connect } from '../../src/odbc.ts';
import {
  connectionString,
  loadDbmsConfig,
  loadDbmsEnvironment,
  qualifiedTable,
  selectedDbms,
  type DbmsConfig,
} from './dbms.ts';

let config: DbmsConfig | undefined;

/** The metadata of the DBMS under test, for assertions that differ per driver. */
export function dbmsConfig(): DbmsConfig {
  if (!config) throw new Error('The DBMS configuration was not loaded');
  return config;
}

export function dbms(): string {
  return process.env['DBMS'] ?? '';
}

beforeAll(async () => {
  const selected = selectedDbms();
  loadDbmsEnvironment(selected);
  config = await loadDbmsConfig(selected);
});

// Each test starts from an empty shared table.
afterEach(async () => {
  const connection = await connect(connectionString());
  try {
    await connection.query(`DELETE FROM ${qualifiedTable()}`);
  } catch {
    // The table may not exist yet, or may already be empty.
  } finally {
    await connection.close();
  }
});
