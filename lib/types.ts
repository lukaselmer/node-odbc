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
  /** Seconds to wait for a connection to be established. 0, the default, waits forever. */
  loginTimeout?: number
}

export interface PoolParameters extends ConnectionParameters {
  /** Connections opened before the pool is handed to the caller. Defaults to 10. */
  initialSize?: number
  /** Connections opened at once when the pool runs dry, capped by `maxSize`. Defaults to 10. */
  incrementSize?: number
  /** The most connections the pool will ever hold. Defaults to unbounded. */
  maxSize?: number
  /** Whether closing a pooled connection returns it to the pool. Defaults to true. */
  reuseConnections?: boolean
  /**
   * Whether connections nobody has needed for a while are closed. Defaults to
   * true. The pool never shrinks below `minSize`.
   */
  shrink?: boolean
  /** The fewest connections shrinking will leave open. Defaults to 1. */
  minSize?: number
  /**
   * How long a connection may sit unused before shrinking closes it, and how
   * often the pool looks. Defaults to 40 seconds.
   */
  shrinkIntervalMs?: number
  /**
   * SQL run on each new connection before it is handed out, for session setup
   * such as `SET SESSION ISOLATION LEVEL READ COMMITTED`. A connection whose
   * initial statements fail is closed and never used.
   */
  initialStatements?: string[]
}
