declare namespace odbc {

  interface ColumnDefinition {
    name: string;
    dataType: number;
    dataTypeName: string;
    columnSize: number;
    decimalDigits: number;
    nullable: boolean;
  }

  /**
   * The rows of a result set. The array itself carries the metadata, so a
   * result can be iterated like any other array.
   */
  interface Result<T> extends Array<T> {
    /** Rows affected by an INSERT, UPDATE or DELETE. */
    count: number;
    columns: Array<ColumnDefinition>;
    statement: string | null;
    parameters: undefined;
    return: undefined;
  }

  interface OdbcError {
    /** SQLSTATE, e.g. `08S01` for a dropped connection. */
    state: string;
    code: number;
    message: string;
  }

  interface NodeOdbcError extends Error {
    /** Every diagnostic record the driver returned, in order. */
    odbcErrors: Array<OdbcError>;
  }

  interface Statement {
    /** Prepares an SQL template whose `?` placeholders `bind` then fills. */
    prepare(sql: string): Promise<void>;

    bind(parameters: Array<number | string | null>): Promise<void>;

    execute<T>(): Promise<Result<T>>;

    close(): Promise<void>;
  }

  interface Connection {
    query<T>(sql: string, parameters?: Array<number | string | null>): Promise<Result<T>>;

    createStatement(): Promise<Statement>;

    /** `null` for any of the first four arguments means "no restriction". */
    tables<T>(catalog: string | null, schema: string | null, table: string | null, type: string | null): Promise<Result<T>>;

    columns<T>(catalog: string | null, schema: string | null, table: string | null, column: string | null): Promise<Result<T>>;

    beginTransaction(): Promise<void>;

    commit(): Promise<void>;

    rollback(): Promise<void>;

    close(): Promise<void>;

    /** Whether the driver still considers the link to be up. */
    readonly connected: boolean;
  }

  interface Pool {
    /**
     * A connection from the pool. Closing it returns it to the pool rather than
     * closing it for real.
     */
    connect(): Promise<Connection>;

    /** Runs a query on a pooled connection and returns it to the pool afterwards. */
    query<T>(sql: string, parameters?: Array<number | string | null>): Promise<Result<T>>;

    close(): Promise<void>;
  }

  interface ConnectionParameters {
    connectionString: string;
    connectionTimeout?: number;
    loginTimeout?: number;
  }

  interface PoolParameters {
    connectionString: string;
    connectionTimeout?: number;
    loginTimeout?: number;
    initialSize?: number;
    incrementSize?: number;
    maxSize?: number;
    reuseConnections?: boolean;
    shrink?: boolean;
    /**
     * SQL run on each new connection before it is handed out, for session setup
     * such as `SET SESSION ISOLATION LEVEL READ COMMITTED`. A connection whose
     * initial statements fail is closed and never used.
     */
    initialStatements?: string[];
  }

  function connect(connectionString: string | ConnectionParameters): Promise<Connection>;

  function pool(connectionString: string | PoolParameters): Promise<Pool>;

  const ODBCVER: number;

  // Transaction completion types
  const SQL_COMMIT: number;
  const SQL_ROLLBACK: number;

  // Connection info types
  const SQL_USER_NAME: number;

  // Parameter types
  const SQL_PARAM_INPUT: number;
  const SQL_PARAM_INPUT_OUTPUT: number;
  const SQL_PARAM_OUTPUT: number;

  // SQL data types
  const SQL_CHAR: number;
  const SQL_VARCHAR: number;
  const SQL_LONGVARCHAR: number;
  const SQL_WCHAR: number;
  const SQL_WVARCHAR: number;
  const SQL_WLONGVARCHAR: number;
  const SQL_DECIMAL: number;
  const SQL_NUMERIC: number;
  const SQL_SMALLINT: number;
  const SQL_INTEGER: number;
  const SQL_REAL: number;
  const SQL_FLOAT: number;
  const SQL_DOUBLE: number;
  const SQL_BIT: number;
  const SQL_TINYINT: number;
  const SQL_BIGINT: number;
  const SQL_BINARY: number;
  const SQL_VARBINARY: number;
  const SQL_LONGVARBINARY: number;
  const SQL_TYPE_DATE: number;
  const SQL_TYPE_TIME: number;
  const SQL_TYPE_TIMESTAMP: number;
  const SQL_INTERVAL_MONTH: number;
  const SQL_INTERVAL_YEAR: number;
  const SQL_INTERVAL_YEAR_TO_MONTH: number;
  const SQL_INTERVAL_DAY: number;
  const SQL_INTERVAL_HOUR: number;
  const SQL_INTERVAL_MINUTE: number;
  const SQL_INTERVAL_SECOND: number;
  const SQL_INTERVAL_DAY_TO_HOUR: number;
  const SQL_INTERVAL_DAY_TO_MINUTE: number;
  const SQL_INTERVAL_DAY_TO_SECOND: number;
  const SQL_INTERVAL_HOUR_TO_MINUTE: number;
  const SQL_INTERVAL_HOUR_TO_SECOND: number;
  const SQL_INTERVAL_MINUTE_TO_SECOND: number;
  const SQL_GUID: number;

  // Nullable types
  const SQL_NO_NULLS: number;
  const SQL_NULLABLE: number;
  const SQL_NULLABLE_UNKNOWN: number;

  // Transaction isolation levels
  const SQL_TXN_READ_UNCOMMITTED: number;
  const SQL_TRANSACTION_READ_UNCOMMITTED: number;
  const SQL_TXN_READ_COMMITTED: number;
  const SQL_TRANSACTION_READ_COMMITTED: number;
  const SQL_TXN_REPEATABLE_READ: number;
  const SQL_TRANSACTION_REPEATABLE_READ: number;
  const SQL_TXN_SERIALIZABLE: number;
  const SQL_TRANSACTION_SERIALIZABLE: number;
}

export = odbc;
