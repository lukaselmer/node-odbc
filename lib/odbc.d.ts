declare namespace odbc {

  interface ColumnDefinition {
    name: string;
    dataType: number;
    dataTypeName: string;
    columnSize: number;
    decimalDigits: number;
    nullable: boolean;
  }

  interface Result<T> extends Array<T> {
    count: number;
    columns: Array<ColumnDefinition>;
    statement: string;
    parameters: Array<number|string>;
    return: number;
  }

  interface OdbcError {
    message: string;
    code: number;
    state: string;
  }

  interface NodeOdbcError extends Error {
    odbcErrors: Array<OdbcError>;
  }

  interface Statement {

    ////////////////////////////////////////////////////////////////////////////
    //   Callbacks   ///////////////////////////////////////////////////////////
    ////////////////////////////////////////////////////////////////////////////

    prepare(sql: string, callback: (error: NodeOdbcError) => undefined): undefined;

    bind(parameters: Array<number|string>, callback: (error: NodeOdbcError) => undefined): undefined;

    execute<T>(callback: (error: NodeOdbcError, result: Result<T>) => undefined): undefined;

    close(callback: (error: NodeOdbcError) => undefined): undefined;

    ////////////////////////////////////////////////////////////////////////////
    //   Promises   ////////////////////////////////////////////////////////////
    ////////////////////////////////////////////////////////////////////////////

    prepare(sql: string): Promise<void>;

    bind(parameters: Array<number|string>): Promise<void>;

    execute<T>(): Promise<Result<T>>;

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
  }

  interface QueryOptions {
    cursor?: boolean|string;
    fetchSize?: number;
    timeout?: number;
    initialBufferSize?: number;
  }

  interface CursorQueryOptions extends QueryOptions {
    cursor: boolean|string
  }

  interface Connection {

    ////////////////////////////////////////////////////////////////////////////
    //   Callbacks   ///////////////////////////////////////////////////////////
    ////////////////////////////////////////////////////////////////////////////
    query<T>(sql: string, callback: (error: NodeOdbcError, result: Result<T>) => undefined): undefined;
    query<T>(sql: string, parameters: Array<number|string>, callback: (error: NodeOdbcError, result: Result<T> | Cursor) => undefined): undefined;
    query<T, O extends QueryOptions>(sql: string, options: O, callback: (error: NodeOdbcError, result: O extends CursorQueryOptions ? Cursor : Result<T>) => undefined): undefined;
    query<T, O extends QueryOptions>(sql: string, parameters: Array<number|string>, options: O, callback: (error: NodeOdbcError, result: O extends CursorQueryOptions ? Cursor : Result<T>) => undefined): undefined;

    callProcedure<T>(catalog: string|null, schema: string|null, name: string, callback: (error: NodeOdbcError, result: Result<T>) => undefined): undefined;
    callProcedure<T>(catalog: string|null, schema: string|null, name: string, parameters: Array<number|string>, callback: (error: NodeOdbcError, result: Result<T>) => undefined): undefined;

    createStatement(callback: (error: NodeOdbcError, statement: Statement) => undefined): undefined;

    primaryKeys<T>(catalog: string|null, schema: string|null, table: string|null, callback: (error: NodeOdbcError, result: Result<T>) => undefined): undefined;

    foreignKeys<T>(pkCatalog: string|null, pkSchema: string|null, pkTable: string|null, fkCatalog: string|null, fkSchema: string|null, fkTable: string|null, callback: (error: NodeOdbcError, result: Result<T>) => undefined): undefined;

    tables<T>(catalog: string|null, schema: string|null, table: string|null, type: string|null, callback: (error: NodeOdbcError, result: Result<T>) => undefined): undefined;

    columns<T>(catalog: string|null, schema: string|null, table: string|null, column: string|null, callback: (error: NodeOdbcError, result: Result<T>) => undefined): undefined;

    setIsolationLevel(level: number, callback: (error: NodeOdbcError) => undefined): undefined;

    beginTransaction(callback: (error: NodeOdbcError) => undefined): undefined;

    commit(callback: (error: NodeOdbcError) => undefined): undefined;

    rollback(callback: (error: NodeOdbcError) => undefined): undefined;

    close(callback: (error: NodeOdbcError) => undefined): undefined;

    ////////////////////////////////////////////////////////////////////////////
    //   Promises   ////////////////////////////////////////////////////////////
    ////////////////////////////////////////////////////////////////////////////
    query<T>(sql: string): Promise<Result<T>>;
    query<T>(sql: string, parameters: Array<number|string>): Promise<Result<T>>;
    query<T, O extends QueryOptions>(sql: string, options: O): O extends CursorQueryOptions ? Promise<Cursor> : Promise<Result<T>>;
    query<T, O extends QueryOptions>(sql: string, parameters: Array<number|string>, options: O): O extends CursorQueryOptions ? Promise<Cursor> : Promise<Result<T>>;

    callProcedure<T>(catalog: string|null, schema: string|null, name: string, parameters?: Array<number|string>): Promise<Result<T>>;

    createStatement(): Promise<Statement>;

    primaryKeys<T>(catalog: string|null, schema: string|null, table: string|null):  Promise<Result<T>>;

    foreignKeys<T>(pkCatalog: string|null, pkSchema: string|null, pkTable: string|null, fkCatalog: string|null, fkSchema: string|null, fkTable: string|null):  Promise<Result<T>>;

    tables<T>(catalog: string|null, schema: string|null, table: string|null, type: string|null): Promise<Result<T>>;

    columns<T>(catalog: string|null, schema: string|null, table: string|null, column: string|null): Promise<Result<T>>;

    setIsolationLevel(level: number): Promise<void>;

    beginTransaction(): Promise<void>;

    commit(): Promise<void>;

    rollback(): Promise<void>;

    close(): Promise<void>;
  }

  interface Pool {

    ////////////////////////////////////////////////////////////////////////////
    //   Callbacks   ///////////////////////////////////////////////////////////
    ////////////////////////////////////////////////////////////////////////////
    connect(callback: (error: NodeOdbcError, connection: Connection) => undefined): undefined;

    query<T>(sql: string, callback: (error: NodeOdbcError, result: Result<T>) => undefined): undefined;
    query<T>(sql: string, parameters: Array<number|string>, callback: (error: NodeOdbcError, result: Result<T> | Cursor) => undefined): undefined;
    query<T, O extends QueryOptions>(sql: string, options: O, callback: (error: NodeOdbcError, result: O extends CursorQueryOptions ? Cursor : Result<T>) => undefined): undefined;
    query<T, O extends QueryOptions>(sql: string, parameters: Array<number|string>, options: O, callback: (error: NodeOdbcError, result: O extends CursorQueryOptions ? Cursor : Result<T>) => undefined): undefined;

    close(callback: (error: NodeOdbcError) => undefined): undefined;


    ////////////////////////////////////////////////////////////////////////////
    //   Promises   ////////////////////////////////////////////////////////////
    ////////////////////////////////////////////////////////////////////////////
    connect(): Promise<Connection>;

    query<T>(sql: string): Promise<Result<T>>;
    query<T>(sql: string, parameters: Array<number|string>): Promise<Result<T>>;
    query<T, O extends QueryOptions>(sql: string, options: O): O extends CursorQueryOptions ? Promise<Cursor> : Promise<Result<T>>;
    query<T, O extends QueryOptions>(sql: string, parameters: Array<number|string>, options: O): O extends CursorQueryOptions ? Promise<Cursor> : Promise<Result<T>>;

    close(): Promise<void>;
  }

  interface Cursor {
    noData: boolean

    ////////////////////////////////////////////////////////////////////////////
    //   Promises   ////////////////////////////////////////////////////////////
    ////////////////////////////////////////////////////////////////////////////

    fetch<T>(): Promise<Result<T>>

    close(): Promise<void>

    ////////////////////////////////////////////////////////////////////////////
    //   Callbacks   ///////////////////////////////////////////////////////////
    ////////////////////////////////////////////////////////////////////////////

    fetch<T>(callback: (error: NodeOdbcError, result: Result<T>) => undefined): undefined

    close(callback: (error: NodeOdbcError) => undefined): undefined
  }

  function connect(connectionString: string, callback: (error: NodeOdbcError, connection: Connection) => undefined): undefined;
  function connect(connectionObject: ConnectionParameters, callback: (error: NodeOdbcError, connection: Connection) => undefined): undefined;

  function connect(connectionString: string): Promise<Connection>;
  function connect(connectionObject: ConnectionParameters): Promise<Connection>;


  function pool(connectionString: string, callback: (error: NodeOdbcError, pool: Pool) => undefined): undefined;
  function pool(connectionObject: PoolParameters, callback: (error: NodeOdbcError, pool: Pool) => undefined): undefined;

  function pool(connectionString: string): Promise<Pool>;
  function pool(connectionObject: PoolParameters): Promise<Pool>;

  // ODBC version
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
