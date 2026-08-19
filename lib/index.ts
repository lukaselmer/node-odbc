import { OdbcConnection, type Connection } from './Connection.ts'
import { native } from './native.ts'
import { Pool } from './Pool.ts'
import type { ConnectionParameters, PoolParameters } from './types.ts'

export type { Connection } from './Connection.ts'
export { Pool } from './Pool.ts'
export type { Statement } from './Statement.ts'
export type * from './types.ts'
export * from './constants.generated.ts'

/** Opens a connection. */
export async function connect(connectionString: string | ConnectionParameters): Promise<Connection> {
  return new OdbcConnection(await native.connect(connectionString))
}

/** Creates a connection pool and fills it to its initial size. */
export async function pool(options: string | PoolParameters): Promise<Pool> {
  const created = new Pool(options)
  await created.init()
  return created
}
