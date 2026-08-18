import type { NativeStatement } from './native.ts'
import type { Parameter, Result } from './types.ts'

const STATEMENT_CLOSED_ERROR = 'Statement has already been closed!'

export class Statement {
  static readonly STATEMENT_CLOSED_ERROR = STATEMENT_CLOSED_ERROR

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
