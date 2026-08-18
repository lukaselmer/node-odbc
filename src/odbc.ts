import type { Connection } from './connection.ts';
import { openConnection } from './native/connect.ts';
import { odbcConstants } from './native/constants.ts';
import type { ConnectionParameters } from './native/connectionOptions.ts';
import { Pool, type PoolParameters } from './pool.ts';

export { Connection } from './connection.ts';
export { Cursor } from './cursor.ts';
export { Statement } from './statement.ts';
export { Pool } from './pool.ts';
export type { PoolParameters, PooledConnection } from './pool.ts';
export type { ConnectionParameters } from './native/connectionOptions.ts';
export type { CursorQueryOptions, QueryOptions } from './native/queryOptions.ts';
export type { Result, Row } from './native/result.ts';
export type { ColumnDefinition, OdbcErrorDetail } from './native/protocol.ts';
export type { OdbcError } from './native/client.ts';

/** Opens a connection to the database. */
export function connect(
  connectionStringOrOptions: string | ConnectionParameters,
): Promise<Connection> {
  return openConnection(connectionStringOrOptions);
}

/** Creates and initialises a connection pool. */
export async function pool(connectionStringOrOptions: string | PoolParameters): Promise<Pool> {
  const pooled = new Pool(connectionStringOrOptions);
  await pooled.init();
  return pooled;
}

export const {
  ODBCVER,
  SQL_COMMIT,
  SQL_ROLLBACK,
  SQL_USER_NAME,
  SQL_PARAM_INPUT,
  SQL_PARAM_INPUT_OUTPUT,
  SQL_PARAM_OUTPUT,
  SQL_CHAR,
  SQL_VARCHAR,
  SQL_LONGVARCHAR,
  SQL_WCHAR,
  SQL_WVARCHAR,
  SQL_WLONGVARCHAR,
  SQL_DECIMAL,
  SQL_NUMERIC,
  SQL_SMALLINT,
  SQL_INTEGER,
  SQL_REAL,
  SQL_FLOAT,
  SQL_DOUBLE,
  SQL_BIT,
  SQL_TINYINT,
  SQL_BIGINT,
  SQL_BINARY,
  SQL_VARBINARY,
  SQL_LONGVARBINARY,
  SQL_TYPE_DATE,
  SQL_TYPE_TIME,
  SQL_TYPE_TIMESTAMP,
  SQL_INTERVAL_MONTH,
  SQL_INTERVAL_YEAR,
  SQL_INTERVAL_YEAR_TO_MONTH,
  SQL_INTERVAL_DAY,
  SQL_INTERVAL_HOUR,
  SQL_INTERVAL_MINUTE,
  SQL_INTERVAL_SECOND,
  SQL_INTERVAL_DAY_TO_HOUR,
  SQL_INTERVAL_DAY_TO_MINUTE,
  SQL_INTERVAL_DAY_TO_SECOND,
  SQL_INTERVAL_HOUR_TO_MINUTE,
  SQL_INTERVAL_HOUR_TO_SECOND,
  SQL_INTERVAL_MINUTE_TO_SECOND,
  SQL_GUID,
  SQL_NO_NULLS,
  SQL_NULLABLE,
  SQL_NULLABLE_UNKNOWN,
  SQL_TXN_READ_UNCOMMITTED,
  SQL_TRANSACTION_READ_UNCOMMITTED,
  SQL_TXN_READ_COMMITTED,
  SQL_TRANSACTION_READ_COMMITTED,
  SQL_TXN_REPEATABLE_READ,
  SQL_TRANSACTION_REPEATABLE_READ,
  SQL_TXN_SERIALIZABLE,
  SQL_TRANSACTION_SERIALIZABLE,
} = odbcConstants;
