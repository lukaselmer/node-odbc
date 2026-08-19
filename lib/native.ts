import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { OdbcConstants } from './constants.generated.ts'
import type { Parameter, Result } from './types.ts'

/** The `ODBCConnection` class the Rust addon exports. */
export interface NativeConnection {
  query<T>(sql: string, parameters?: readonly Parameter[]): Promise<Result<T>>
  createStatement(): Promise<NativeStatement>
  tables<T>(
    catalog: string | null,
    schema: string | null,
    table: string | null,
    type: string | null,
  ): Promise<Result<T>>
  columns<T>(
    catalog: string | null,
    schema: string | null,
    table: string | null,
    column: string | null,
  ): Promise<Result<T>>
  beginTransaction(): Promise<void>
  commit(): Promise<void>
  rollback(): Promise<void>
  close(): Promise<void>
  readonly connected: boolean
}

/** The `ODBCStatement` class the Rust addon exports. */
export interface NativeStatement {
  prepare(sql: string): Promise<void>
  bind(parameters: readonly Parameter[]): Promise<void>
  execute<T>(): Promise<Result<T>>
  close(): Promise<void>
}

interface NativeOdbc {
  connect(connectionString: string | { connectionString: string }): Promise<NativeConnection>
  odbcConstants(): OdbcConstants
}

/** The addon is a CommonJS binary, so it is reached through `createRequire` rather than an import. */
const require = createRequire(import.meta.url)
const packageRoot = fileURLToPath(new URL('..', import.meta.url))
const platform = `${process.platform}-${process.arch}`

export const native = loadAddon()

function loadAddon(): NativeOdbc {
  const addon = join(packageRoot, 'prebuilds', platform, 'odbc.node')
  try {
    return require(addon) as NativeOdbc
  } catch (cause) {
    throw new Error(
      `Could not load the ODBC addon for ${platform} from ${addon}. ` +
        `Prebuilt binaries are published for linux-x64, darwin-arm64 and win32-x64; ` +
        `on any other platform, build from source with 'npm run build'.`,
      { cause },
    )
  }
}
