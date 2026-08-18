const { openConnection } = require('./native/connect');

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
};

/**
 * A pool of open connections.
 *
 * Connections are opened ahead of demand and handed out by connect(). The
 * connection returned has its close() replaced: unless the pool was configured
 * with `reuseConnections: false`, closing returns it to the pool instead of
 * disconnecting. The original remains available as nativeClose().
 */
class Pool {
  constructor(connectionStringOrConfig) {
    Object.assign(this, poolSettings(connectionStringOrConfig));

    this.isOpen = false;
    this.poolSize = 0;
    this.connectionsBeingCreatedCount = 0;
    this.freeConnections = [];
    this.waiting = [];
    this.activelyConnecting = 0;
    this.pendingConnects = 0;
  }

  /** Opens the initial connections and verifies that the configuration works. */
  async init() {
    if (this.isOpen) return;
    this.isOpen = true;

    this.increasePoolSize(this.initialSize);

    // Surfaces a bad connection string here rather than on first use.
    const connection = await this.connect();
    this.freeConnections.unshift(connection);
  }

  /** Takes a connection from the pool, waiting for one if none is free. */
  async connect() {
    const free = this.freeConnections.pop();
    if (free) return free;

    if (this.shouldGrow()) this.increasePoolSize(this.incrementSize);

    return new Promise((resolve, reject) => this.waiting.push({ resolve, reject }));
  }

  /** Runs a statement on a pooled connection and returns it to the pool. */
  async query(sql, parameters, options) {
    const connection = await this.connect();
    try {
      return await connection.query(sql, parameters, options);
    } finally {
      await connection.close();
    }
  }

  /** Closes every connection the pool still holds. */
  async close() {
    this.isOpen = false;
    const connections = this.freeConnections.splice(0);

    await Promise.all(
      connections.map(async (connection) => {
        await connection.nativeClose();
        this.poolSize--;
      })
    );
  }

  shouldGrow() {
    return (
      this.connectionsBeingCreatedCount <= this.waiting.length &&
      this.poolSize + this.connectionsBeingCreatedCount + this.incrementSize <= this.maxSize
    );
  }

  increasePoolSize(count) {
    this.connectionsBeingCreatedCount += count;
    for (let index = 0; index < count; index++) this.enqueueConnect();
  }

  // Connections are opened a few at a time: drivers are slow to connect and
  // some dislike many simultaneous handshakes.
  enqueueConnect() {
    this.pendingConnects++;
    this.drainConnectQueue();
  }

  drainConnectQueue() {
    while (this.pendingConnects > 0 && this.activelyConnecting < this.maxActivelyConnecting) {
      this.pendingConnects--;
      this.activelyConnecting++;
      this.openPooledConnection().finally(() => {
        this.activelyConnecting--;
        this.drainConnectQueue();
      });
    }
  }

  async openPooledConnection() {
    try {
      const connection = await openConnection(this.connectionConfig);
      this.connectionsBeingCreatedCount--;
      this.poolSize++;
      this.handOut(this.pooled(connection));
    } catch (error) {
      this.connectionsBeingCreatedCount--;
      this.failWaiting(error);
    }
  }

  // Closing a pooled connection returns it to the pool; nativeClose still
  // disconnects, which is what close() on the pool itself uses.
  pooled(connection) {
    connection.nativeClose = connection.close.bind(connection);

    connection.close = async () => {
      if (this.reuseConnections) return this.handOut(connection);

      this.increasePoolSize(1);
      await connection.nativeClose();
      this.poolSize--;
    };

    return connection;
  }

  handOut(connection) {
    const waiting = this.waiting.shift();
    if (waiting) return waiting.resolve(connection);

    this.freeConnections.push(connection);
  }

  // A connection error reaches whoever is waiting for a connection. With nobody
  // waiting it is dropped, so that a failed background attempt cannot throw
  // where it can never be caught.
  failWaiting(error) {
    const waiting = this.waiting.shift();
    if (waiting) waiting.reject(error);
  }
}

function poolSettings(connectionStringOrConfig) {
  if (typeof connectionStringOrConfig === 'string') {
    return settingsOf({ connectionString: connectionStringOrConfig });
  }
  if (typeof connectionStringOrConfig !== 'object' || connectionStringOrConfig === null) {
    throw new TypeError('Pool constructor must passed a connection string or a configuration object');
  }
  if (!Object.prototype.hasOwnProperty.call(connectionStringOrConfig, 'connectionString')) {
    throw new TypeError('Pool configuration object must contain "connectionString" key');
  }
  return settingsOf(connectionStringOrConfig);
}

function settingsOf(config) {
  const setting = (name) => (config[name] !== undefined ? config[name] : DEFAULTS[name]);

  return {
    reuseConnections: setting('reuseConnections'),
    initialSize: setting('initialSize'),
    incrementSize: setting('incrementSize'),
    maxSize: setting('maxSize'),
    shrink: setting('shrink'),
    maxActivelyConnecting: setting('maxActivelyConnecting'),
    connectionConfig: {
      connectionString: config.connectionString,
      connectionTimeout: setting('connectionTimeout'),
      loginTimeout: setting('loginTimeout'),
      fetchArray: setting('fetchArray'),
    },
  };
}

module.exports.Pool = Pool;
