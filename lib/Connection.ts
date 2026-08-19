import type { NativeConnection } from './native.ts'
import { OdbcStatement, type Statement } from './Statement.ts'
import type { Parameter, Result } from './types.ts'

const CONNECTION_CLOSED_ERROR = 'Connection has already been closed!'

/**
 * An open connection. Declared as an interface for the same reason as
 * `Statement`: callers receive one, never construct it.
 */
export interface Connection {
  readonly connected: boolean
  query<T = unknown>(sql: string, parameters?: readonly Parameter[]): Promise<Result<T>>
  createStatement(): Promise<Statement>
  tables<T = unknown>(
    catalog: string | null,
    schema: string | null,
    table: string | null,
    type: string | null,
  ): Promise<Result<T>>
  columns<T = unknown>(
    catalog: string | null,
    schema: string | null,
    table: string | null,
    column: string | null,
  ): Promise<Result<T>>
  beginTransaction(): Promise<void>
  commit(): Promise<void>
  rollback(): Promise<void>
  close(): Promise<void>
}

export class OdbcConnection implements Connection {
  private connection: NativeConnection | null

  constructor(connection: NativeConnection) {
    this.connection = connection
  }

  /** Whether the driver still considers the link to be up. */
  get connected(): boolean {
    return this.connection?.connected ?? false
  }

  /** Runs a query, optionally binding values to its `?` placeholders. */
  async query<T = unknown>(sql: string, parameters?: readonly Parameter[]): Promise<Result<T>> {
    if (typeof sql !== 'string') {
      throw new TypeError('[node-odbc]: connection.query requires the SQL to be a string.')
    }
    if (parameters !== undefined && parameters !== null && !Array.isArray(parameters)) {
      throw new TypeError('[node-odbc]: connection.query requires the parameters to be an array.')
    }

    return this.native().query<T>(sql, parameters ?? undefined)
  }

  async createStatement(): Promise<Statement> {
    return new OdbcStatement(await this.native().createStatement())
  }

  /** The tables matching the restrictions, where `null` means "no restriction". */
  async tables<T = unknown>(
    catalog: string | null,
    schema: string | null,
    table: string | null,
    type: string | null,
  ): Promise<Result<T>> {
    return this.native().tables<T>(catalog, schema, table, type)
  }

  /** The columns matching the restrictions, where `null` means "no restriction". */
  async columns<T = unknown>(
    catalog: string | null,
    schema: string | null,
    table: string | null,
    column: string | null,
  ): Promise<Result<T>> {
    return this.native().columns<T>(catalog, schema, table, column)
  }

  /** Begins a transaction, turning off auto-commit until commit or rollback. */
  async beginTransaction(): Promise<void> {
    return this.native().beginTransaction()
  }

  async commit(): Promise<void> {
    return this.native().commit()
  }

  async rollback(): Promise<void> {
    return this.native().rollback()
  }

  /** Closing twice is not an error, so that cleanup paths can be unconditional. */
  async close(): Promise<void> {
    const connection = this.connection
    if (!connection) return

    this.connection = null
    await connection.close()
  }

  private native(): NativeConnection {
    if (!this.connection) throw new Error(CONNECTION_CLOSED_ERROR)
    return this.connection
  }
}
