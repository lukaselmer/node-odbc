/** A column of a result set, as the driver described it. */
export interface ColumnDefinition {
  readonly name: string
  readonly dataType: number
  readonly dataTypeName: string
  readonly columnSize: number
  readonly decimalDigits: number
  readonly nullable: boolean
}

/**
 * The rows of a result set.
 *
 * The array itself carries the metadata, so a result can be iterated like any
 * other array.
 */
export interface Result<T> extends Array<T> {
  /** Rows affected by an INSERT, UPDATE or DELETE. */
  readonly count: number
  readonly columns: readonly ColumnDefinition[]
  readonly statement: string | null
  readonly parameters: undefined
  readonly return: undefined
}

/** One diagnostic record from the driver. */
export interface OdbcError {
  /** SQLSTATE, for example `08S01` for a dropped connection. */
  readonly state: string
  readonly code: number
  readonly message: string
}

/** Every failure from the driver rejects with one of these. */
export interface NodeOdbcError extends Error {
  /** Every diagnostic record the driver returned, in order. */
  readonly odbcErrors: readonly OdbcError[]
}

/**
 * A value that can be bound to a `?` placeholder.
 *
 * `Uint8Array` rather than `Buffer`, so that consumers of the type declarations
 * do not need `@types/node`. A `Buffer` is a `Uint8Array`, so it still fits.
 */
export type Parameter = number | bigint | string | boolean | Uint8Array | null

export interface ConnectionParameters {
  connectionString: string
  connectionTimeout?: number
  loginTimeout?: number
}

export interface PoolParameters extends ConnectionParameters {
  initialSize?: number
  incrementSize?: number
  maxSize?: number
  reuseConnections?: boolean
  shrink?: boolean
  /**
   * SQL run on each new connection before it is handed out, for session setup
   * such as `SET SESSION ISOLATION LEVEL READ COMMITTED`. A connection whose
   * initial statements fail is closed and never used.
   */
  initialStatements?: string[]
}
