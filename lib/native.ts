import { createRequire } from "node:module";
import type { OdbcConstants } from "./constants.generated.ts";
import type { Parameter, Result } from "./types.ts";

/** The `ODBCConnection` class the Rust addon exports. */
export interface NativeConnection {
  query<T>(sql: string, parameters?: readonly Parameter[]): Promise<Result<T>>;
  createStatement(): Promise<NativeStatement>;
  tables<T>(
    catalog: string | null,
    schema: string | null,
    table: string | null,
    type: string | null,
  ): Promise<Result<T>>;
  columns<T>(
    catalog: string | null,
    schema: string | null,
    table: string | null,
    column: string | null,
  ): Promise<Result<T>>;
  beginTransaction(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  close(): Promise<void>;
  readonly connected: boolean;
}

/** The `ODBCStatement` class the Rust addon exports. */
export interface NativeStatement {
  prepare(sql: string): Promise<void>;
  bind(parameters: readonly Parameter[]): Promise<void>;
  execute<T>(): Promise<Result<T>>;
  close(): Promise<void>;
}

interface NativeOdbc {
  connect(connectionString: string | { connectionString: string }): Promise<NativeConnection>;
  odbcConstants(): OdbcConstants;
}

/**
 * `node-gyp-build` is CommonJS and resolves the addon from the package root, so
 * it is reached through `createRequire` rather than an import. The bundler
 * rewrites `import.meta.url` for the CommonJS build.
 */
const require = createRequire(import.meta.url);
const packageRoot = new URL("..", import.meta.url).pathname;

export const native = require("node-gyp-build")(packageRoot) as NativeOdbc;
