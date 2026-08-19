import { OdbcConnection, type Connection } from './Connection.ts'
import { enqueueConnect } from './connectionQueue.ts'
import { native } from './native.ts'
import type { NativeConnection } from './native.ts'
import { connectionsToCreate, connectionsToRelease } from './poolSizing.ts'
import type { Parameter, PoolParameters, Result } from './types.ts'

const REUSE_CONNECTIONS_DEFAULT = true
const INITIAL_SIZE_DEFAULT = 10
const INCREMENT_SIZE_DEFAULT = 10
const MAX_SIZE_DEFAULT = Number.MAX_SAFE_INTEGER
const SHRINK_DEFAULT = true
const MIN_SIZE_DEFAULT = 1
const SHRINK_INTERVAL_MS_DEFAULT = 40_000
const LOGIN_TIMEOUT_DEFAULT = 0

/** A `connect()` call waiting for a connection to become available. */
interface WaitingWork {
  resolveFunction: (connection: Connection) => void
  rejectFunction: (error: unknown) => void
}

/** A connection the pool handed out, whose `close` returns it to the pool. */
interface PooledConnection extends Connection {
  nativeClose(): Promise<void>
}

interface ConnectionConfig {
  connectionString: string
  loginTimeout: number
}

export class Pool {
  readonly connectionConfig: ConnectionConfig
  readonly reuseConnections: boolean
  readonly initialSize: number
  readonly incrementSize: number
  readonly maxSize: number
  readonly shrink: boolean
  readonly minSize: number
  readonly shrinkIntervalMs: number
  readonly initialStatements: readonly string[]

  freeConnections: PooledConnection[] = []
  poolSize = 0
  isOpen = false

  private readonly waitingConnectionWork: WaitingWork[] = []
  private connectionsBeingCreatedCount = 0
  private shrinkTimer: ReturnType<typeof setInterval> | undefined

  /** When each free connection was last returned, so shrinking can tell which are unused. */
  private readonly idleSince = new WeakMap<PooledConnection, number>()

  constructor(options: string | PoolParameters) {
    const configuration = normaliseOptions(options)

    this.connectionConfig = {
      connectionString: configuration.connectionString,
      loginTimeout: configuration.loginTimeout ?? LOGIN_TIMEOUT_DEFAULT,
    }
    this.reuseConnections = configuration.reuseConnections ?? REUSE_CONNECTIONS_DEFAULT
    this.initialSize = configuration.initialSize ?? INITIAL_SIZE_DEFAULT
    this.incrementSize = configuration.incrementSize ?? INCREMENT_SIZE_DEFAULT
    this.maxSize = configuration.maxSize ?? MAX_SIZE_DEFAULT
    this.shrink = configuration.shrink ?? SHRINK_DEFAULT
    this.minSize = configuration.minSize ?? MIN_SIZE_DEFAULT
    this.shrinkIntervalMs = configuration.shrinkIntervalMs ?? SHRINK_INTERVAL_MS_DEFAULT
    this.initialStatements = parseInitialStatements(configuration.initialStatements)
  }

  /**
   * Fills the pool to its initial size, and takes one connection to prove the
   * connection string works before anyone relies on it.
   */
  async init(): Promise<void> {
    if (this.isOpen) return
    this.isOpen = true

    this.increasePoolSize(this.initialSize)
    this.freeConnections.unshift(await this.connect())
    this.startShrinking()
  }

  /**
   * A connection from the pool, ready to use. Closing it returns it to the pool
   * rather than closing it for real.
   *
   * Connections are taken from the front and returned to the back, so a caller
   * that takes one at a time works through all of them instead of reusing the
   * most recently returned one. A connection that is never handed out is one
   * nobody notices has died, and an idle connection does die: a flow left quiet
   * for long enough is dropped by the network, telling neither end.
   */
  async connect(): Promise<PooledConnection> {
    const free = this.freeConnections.shift()
    if (free) return free

    const toCreate = connectionsToCreate({
      poolSize: this.poolSize,
      beingCreated: this.connectionsBeingCreatedCount,
      waiting: this.waitingConnectionWork.length,
      incrementSize: this.incrementSize,
      maxSize: this.maxSize,
    })
    if (toCreate > 0) this.increasePoolSize(toCreate)

    return new Promise<PooledConnection>((resolve, reject) => {
      this.waitingConnectionWork.push({
        resolveFunction: resolve as (connection: Connection) => void,
        rejectFunction: reject,
      })
    })
  }

  /** Runs a query on a pooled connection and returns it to the pool afterwards. */
  async query<T = unknown>(sql: string, parameters?: readonly Parameter[]): Promise<Result<T>> {
    const connection = await this.connect()
    try {
      return await connection.query<T>(sql, parameters)
    } finally {
      await connection.close()
    }
  }

  /** Closes every connection the pool holds. */
  async close(): Promise<void> {
    this.stopShrinking()

    const connections = [...this.freeConnections]
    this.freeConnections.length = 0
    this.isOpen = false

    await Promise.all(connections.map((connection) => this.closeOne(connection)))
  }

  /**
   * Prepares a newly opened session before any work is handed to it.
   *
   * Ingres rejects `SET SESSION ISOLATION LEVEL` and `SET LOCKMODE` once a
   * transaction is active, so these run here, on each new session, rather than
   * per checkout.
   */
  async runInitialStatements(connection: Connection): Promise<void> {
    for (const sql of this.initialStatements) {
      await connection.query(sql)
    }
  }

  /**
   * Closes the connections nobody has needed for a while.
   *
   * Rotation makes this self-balancing: every connection is used in turn, so a
   * pool the traffic keeps busy is never idle long enough to be cut, and one
   * grown by a burst falls back until what remains is being used again.
   */
  async releaseIdleConnections(): Promise<void> {
    const toRelease = connectionsToRelease({
      idleSince: this.freeConnections.map((connection) => this.idleSince.get(connection) ?? 0),
      now: Date.now(),
      poolSize: this.poolSize,
      minSize: this.minSize,
      maxIdleMs: this.shrinkIntervalMs,
    })
    if (toRelease === 0) return

    const released = this.freeConnections.splice(0, toRelease)
    await Promise.all(released.map((connection) => this.closeOne(connection)))
  }

  /** Unreferenced, so waiting to reap a connection cannot hold the process open. */
  private startShrinking(): void {
    if (!this.shrink || this.shrinkTimer) return

    this.shrinkTimer = setInterval(() => {
      void this.releaseIdleConnections().catch(() => {})
    }, this.shrinkIntervalMs)
    this.shrinkTimer.unref?.()
  }

  private stopShrinking(): void {
    if (!this.shrinkTimer) return

    clearInterval(this.shrinkTimer)
    this.shrinkTimer = undefined
  }

  /**
   * Hands a newly opened connection to whoever is waiting for one, or parks it
   * in the free list.
   */
  private handOut(connection: PooledConnection): void {
    const waiting = this.waitingConnectionWork.shift()
    if (!waiting) {
      this.idleSince.set(connection, Date.now())
      this.freeConnections.push(connection)
      return
    }
    waiting.resolveFunction(connection)
  }

  /**
   * Reports a failed connection to whoever is waiting. With nothing waiting the
   * pool simply stays empty and the next caller is the one told about it -
   * throwing here would take the application down.
   */
  private failWaiting(error: unknown): void {
    this.waitingConnectionWork.shift()?.rejectFunction(error)
  }

  private increasePoolSize(count: number): void {
    this.connectionsBeingCreatedCount += count
    for (let index = 0; index < count; index++) {
      enqueueConnect(() => this.openOne())
    }
  }

  private async openOne(): Promise<void> {
    let nativeConnection: NativeConnection
    try {
      nativeConnection = await native.connect(this.connectionConfig)
    } catch (error) {
      this.connectionsBeingCreatedCount--
      this.failWaiting(error)
      return
    }

    this.connectionsBeingCreatedCount--
    this.poolSize++

    const connection = this.asPooled(new OdbcConnection(nativeConnection))
    try {
      await this.runInitialStatements(connection)
    } catch (error) {
      this.poolSize--
      await connection.nativeClose().catch(() => {})
      this.failWaiting(error)
      return
    }

    this.handOut(connection)
  }

  /** Replaces `close` so that it returns the connection to the pool. */
  private asPooled(connection: Connection): PooledConnection {
    const pooled = connection as PooledConnection
    const close = connection.close.bind(connection)

    pooled.nativeClose = close
    pooled.close = this.reuseConnections
      ? (): Promise<void> => {
          this.handOut(pooled)
          return Promise.resolve()
        }
      : async (): Promise<void> => {
          this.increasePoolSize(1)
          await close()
          this.poolSize--
        }
    return pooled
  }

  private async closeOne(connection: PooledConnection): Promise<void> {
    await connection.nativeClose()
    this.poolSize--
  }
}

function normaliseOptions(options: string | PoolParameters): PoolParameters {
  if (typeof options === 'string') return { connectionString: options }

  if (typeof options !== 'object' || options === null) {
    throw new TypeError('Pool constructor must passed a connection string or a configuration object')
  }
  if (!Object.hasOwn(options, 'connectionString')) {
    throw new TypeError('Pool configuration object must contain "connectionString" key')
  }
  return options
}

function parseInitialStatements(initialStatements: string[] | undefined): readonly string[] {
  if (initialStatements === undefined) return []

  if (!Array.isArray(initialStatements) || initialStatements.some((sql) => typeof sql !== 'string')) {
    throw new TypeError('Pool configuration option "initialStatements" must be an array of strings')
  }
  return initialStatements
}
