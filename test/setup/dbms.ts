import type { ColumnDefinition } from '../../src/odbc.ts';

/**
 * The column metadata a DBMS reports for its catalog functions. Not every
 * fixture is complete, so the fields are optional; the tests compare them
 * against what the driver actually returns.
 */
export type ColumnExpectation = Partial<ColumnDefinition>;

export interface DbmsConfig {
  generateCreateOrReplaceQueries: (tableName: string, fields: string) => string[];
  sqlColumnsColumns: ColumnExpectation[];
  sqlTablesColumns: ColumnExpectation[];
  sqlPrimaryKeysColumns?: ColumnExpectation[];
  sqlForeignKeysColumns?: ColumnExpectation[];
}

const SUPPORTED = [
  'ibmi',
  'mariadb',
  'mssql',
  'mysql',
  'postgresql',
  'postgres',
  'sybase',
] as const;

export type SupportedDbms = (typeof SUPPORTED)[number];

/** The DBMS under test, chosen with the DBMS environment variable. */
export function selectedDbms(): SupportedDbms {
  const dbms = process.env['DBMS'];
  if (dbms === undefined) {
    throw new Error(
      `Set the DBMS environment variable to your target DBMS:\n${SUPPORTED.map((name) => `  DBMS=${name} npm test`).join('\n')}`,
    );
  }
  if (!isSupported(dbms)) {
    throw new Error(`DBMS is not recognized. Supported values: ${SUPPORTED.join(', ')}`);
  }
  return dbms;
}

function isSupported(dbms: string): dbms is SupportedDbms {
  return (SUPPORTED as readonly string[]).includes(dbms);
}

export function loadDbmsEnvironment(dbms: SupportedDbms): void {
  process.loadEnvFile(`test/DBMS/${dbms}/.env`);
}

export async function loadDbmsConfig(dbms: SupportedDbms): Promise<DbmsConfig> {
  const module = (await import(`../DBMS/${dbms}/config.ts`)) as { default: DbmsConfig };
  return module.default;
}

export function schema(): string {
  return process.env['DB_SCHEMA'] ?? '';
}

export function table(): string {
  return process.env['DB_TABLE'] ?? '';
}

export function connectionString(): string {
  return process.env['CONNECTION_STRING'] ?? '';
}

export function qualifiedTable(): string {
  return `${schema()}.${table()}`;
}
