import type { NativeStatement } from './native.ts'
import type { Parameter, Result } from './types.ts'

const STATEMENT_CLOSED_ERROR = 'Statement has already been closed!'

/**
 * A prepared statement. Declared as an interface because callers only ever
 * receive one from `createStatement`, and a class with private fields is
 * nominally typed, which would stop a test double from standing in for it.
 */
export interface Statement {
  prepare(sql: string): Promise<void>
  bind(parameters: readonly Parameter[]): Promise<void>
  execute<T = unknown>(): Promise<Result<T>>
  close(): Promise<void>
}

export class OdbcStatement implements Statement {
  private statement: NativeStatement | null

  constructor(statement: NativeStatement) {
    this.statement = statement
  }

  /** Prepares an SQL template, whose `?` placeholders `bind` then fills. */
  async prepare(sql: string): Promise<void> {
    if (typeof sql !== 'string') {
      throw new TypeError('[node-odbc]: statement.prepare requires the SQL to be a string.')
    }
    return this.native().prepare(sql)
  }

  async bind(parameters: readonly Parameter[]): Promise<void> {
    if (!Array.isArray(parameters)) {
      throw new TypeError('[node-odbc]: statement.bind requires the parameters to be an array.')
    }
    return this.native().bind(parameters)
  }

  async execute<T = unknown>(): Promise<Result<T>> {
    return this.native().execute<T>()
  }

  /** Closing twice is not an error, so that cleanup paths can be unconditional. */
  async close(): Promise<void> {
    const statement = this.statement
    if (!statement) return

    this.statement = null
    await statement.close()
  }

  private native(): NativeStatement {
    if (!this.statement) throw new Error(STATEMENT_CLOSED_ERROR)
    return this.statement
  }
}
