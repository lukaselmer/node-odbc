import type { Connection } from './connection.ts';
import { openConnection } from './native/connect.ts';
import type { ConnectionParameters } from './native/connectionOptions.ts';
import type { CursorQueryOptions, QueryOptions } from './native/queryOptions.ts';
import type { Result, Row } from './native/result.ts';
import type { Cursor } from './cursor.ts';

export interface PoolParameters extends ConnectionParameters {
  initialSize?: number;
  incrementSize?: number;
  maxSize?: number;
  reuseConnections?: boolean;
  shrink?: boolean;
  maxActivelyConnecting?: number;
}

/** A connection handed out by the pool, which can still be really closed. */
export interface PooledConnection extends Connection {
  nativeClose: () => Promise<void>;
}

const DEFAULTS = {
  reuseConnections: true,
  initialSize: 10,
  incrementSize: 10,
  maxSize: Number.MAX_SAFE_INTEGER,
  shrink: true,
  connectionTimeout: 0,
  loginTimeout: 0,
  fetchArray: false,
  maxActivelyConnecting: 1,
} as const;

type ForwardedQuery<T> = (
  sql: string,
  parameters?: unknown[] | QueryOptions | null,
  options?: QueryOptions | null,
) => Promise<Result<T> | Cursor>;

interface Waiting {
  resolve: (connection: Connection) => void;
  reject: (error: Error) => void;
}

/**
 * A pool of open connections.
 *
 * Connections are opened ahead of demand and handed out by connect(). The
 * connection returned has its close() replaced: unless the pool was configured
 * with `reuseConnections: false`, closing returns it to the pool instead of
 * disconnecting. The original remains available as nativeClose().
 */
export class Pool {
  poolSize = 0;
  readonly freeConnections: Connection[] = [];

  private readonly connectionConfig: ConnectionParameters;
  private readonly reuseConnections: boolean;
  private readonly initialSize: number;
  private readonly incrementSize: number;
  private readonly maxSize: number;
  private readonly maxActivelyConnecting: number;

  private isOpen = false;
  private connectionsBeingCreatedCount = 0;
  private activelyConnecting = 0;
  private pendingConnects = 0;
  private readonly waiting: Waiting[] = [];

  constructor(connectionStringOrConfig: string | PoolParameters) {
    const config = poolConfigOf(connectionStringOrConfig);

    this.connectionConfig = {
      connectionString: config.connectionString,
      connectionTimeout: config.connectionTimeout ?? DEFAULTS.connectionTimeout,
      loginTimeout: config.loginTimeout ?? DEFAULTS.loginTimeout,
      fetchArray: config.fetchArray ?? DEFAULTS.fetchArray,
    };
    this.reuseConnections = config.reuseConnections ?? DEFAULTS.reuseConnections;
    this.initialSize = config.initialSize ?? DEFAULTS.initialSize;
    this.incrementSize = config.incrementSize ?? DEFAULTS.incrementSize;
    this.maxSize = config.maxSize ?? DEFAULTS.maxSize;
    this.maxActivelyConnecting = config.maxActivelyConnecting ?? DEFAULTS.maxActivelyConnecting;
  }

  /** Opens the initial connections and verifies that the configuration works. */
  async init(): Promise<void> {
    if (this.isOpen) return;
    this.isOpen = true;

    this.increasePoolSize(this.initialSize);

    // Surfaces a bad connection string here rather than on first use.
    const connection = await this.connect();
    this.freeConnections.unshift(connection);
  }

  /** Takes a connection from the pool, waiting for one if none is free. */
  connect(): Promise<Connection> {
    const free = this.freeConnections.pop();
    if (free) return Promise.resolve(free);

    if (this.shouldGrow()) this.increasePoolSize(this.incrementSize);

    return new Promise<Connection>((resolve, reject) => {
      this.waiting.push({ resolve, reject });
    });
  }

  /** Runs a statement on a pooled connection and returns it to the pool. */
  query<T = Row>(sql: string): Promise<Result<T>>;
  query<T = Row>(sql: string, parameters: unknown[] | null): Promise<Result<T>>;
  query<T = unknown, O extends QueryOptions = QueryOptions>(
    sql: string,
    options: O,
  ): O extends CursorQueryOptions ? Promise<Cursor> : Promise<Result<T>>;
  query<T = unknown, O extends QueryOptions = QueryOptions>(
    sql: string,
    parameters: unknown[] | null,
    options: O,
  ): O extends CursorQueryOptions ? Promise<Cursor> : Promise<Result<T>>;
  async query<T = Row>(
    sql: string,
    parameters?: unknown[] | QueryOptions | null,
    options?: QueryOptions | null,
  ): Promise<Result<T> | Cursor> {
    const connection = await this.connect();
    try {
      const query = connection.query.bind(connection) as ForwardedQuery<T>;
      return await query(sql, parameters, options);
    } finally {
      await connection.close();
    }
  }

  /** Closes every connection the pool still holds. */
  async close(): Promise<void> {
    this.isOpen = false;
    const connections = this.freeConnections.splice(0) as PooledConnection[];

    await Promise.all(
      connections.map(async (connection) => {
        await connection.nativeClose();
        this.poolSize--;
      }),
    );
  }

  private shouldGrow(): boolean {
    return (
      this.connectionsBeingCreatedCount <= this.waiting.length &&
      this.poolSize + this.connectionsBeingCreatedCount + this.incrementSize <= this.maxSize
    );
  }

  private increasePoolSize(count: number): void {
    this.connectionsBeingCreatedCount += count;
    for (let index = 0; index < count; index++) this.enqueueConnect();
  }

  // Connections are opened a few at a time: drivers are slow to connect and
  // some dislike many simultaneous handshakes.
  private enqueueConnect(): void {
    this.pendingConnects++;
    this.drainConnectQueue();
  }

  private drainConnectQueue(): void {
    while (this.pendingConnects > 0 && this.activelyConnecting < this.maxActivelyConnecting) {
      this.pendingConnects--;
      this.activelyConnecting++;
      void this.openPooledConnection().finally(() => {
        this.activelyConnecting--;
        this.drainConnectQueue();
      });
    }
  }

  private async openPooledConnection(): Promise<void> {
    try {
      const connection = await openConnection(this.connectionConfig);
      this.connectionsBeingCreatedCount--;
      this.poolSize++;
      this.handOut(this.pooled(connection));
    } catch (error) {
      this.connectionsBeingCreatedCount--;
      this.failWaiting(error as Error);
    }
  }

  // Closing a pooled connection returns it to the pool; nativeClose still
  // disconnects, which is what close() on the pool itself uses.
  private pooled(connection: Connection): Connection {
    const pooled = connection as PooledConnection;
    pooled.nativeClose = connection.close.bind(connection);

    pooled.close = async () => {
      if (this.reuseConnections) {
        this.handOut(pooled);
        return;
      }

      this.increasePoolSize(1);
      await pooled.nativeClose();
      this.poolSize--;
    };

    return pooled;
  }

  private handOut(connection: Connection): void {
    const waiting = this.waiting.shift();
    if (waiting) {
      waiting.resolve(connection);
      return;
    }

    this.freeConnections.push(connection);
  }

  // A connection error reaches whoever is waiting for a connection. With nobody
  // waiting it is dropped, so that a failed background attempt cannot throw
  // where it can never be caught.
  private failWaiting(error: Error): void {
    this.waiting.shift()?.reject(error);
  }
}

function poolConfigOf(connectionStringOrConfig: string | PoolParameters): PoolParameters {
  if (typeof connectionStringOrConfig === 'string') {
    return { connectionString: connectionStringOrConfig };
  }
  if (typeof connectionStringOrConfig !== 'object' || connectionStringOrConfig === null) {
    throw new TypeError(
      'Pool constructor must passed a connection string or a configuration object',
    );
  }
  if (!Object.hasOwn(connectionStringOrConfig, 'connectionString')) {
    throw new TypeError('Pool configuration object must contain "connectionString" key');
  }
  return connectionStringOrConfig;
}
