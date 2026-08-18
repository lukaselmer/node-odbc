const net = require('net');
const { spawn } = require('child_process');
const { randomBytes } = require('crypto');
const os = require('os');
const path = require('path');

const { replacer } = require('./values');
const { serverBinaryPath } = require('./binary');

const HEADER_BYTES = 4;

// The sidecar is started on first use and shuts itself down when this socket
// closes, so it can never outlive the Node process.
class SidecarClient {
  constructor() {
    this.socket = null;
    this.child = null;
    this.starting = null;
    this.pending = new Map();
    this.nextId = 1;
    this.buffer = Buffer.alloc(0);
  }

  async request(target, handle, method, args) {
    await this.start();
    return this.send({ target, handle, method, args });
  }

  send(message) {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this.pending.set(id, { resolve, reject });
      this.refSocket();
      this.socket.write(frame({ id, ...message }));
    });
  }

  start() {
    if (this.socket) return Promise.resolve();
    if (!this.starting) this.starting = this.spawnSidecar();
    return this.starting;
  }

  async spawnSidecar() {
    // Unix socket paths are limited to ~104 bytes, so the name stays short.
    const socketPath = path.join(os.tmpdir(), `node-odbc-${process.pid}-${randomBytes(4).toString('hex')}.sock`);
    this.child = spawn(serverBinaryPath(), ['--socket', socketPath], {
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    this.child.unref();

    await waitForReady(this.child);
    // The readiness pipe would otherwise keep the event loop alive forever.
    this.child.stdout.unref();

    this.socket = await connectSocket(socketPath);
    this.socket.on('data', (chunk) => this.consume(chunk));
    this.socket.on('close', () =>
      this.failAllPending(new Error('[odbc] The ODBC server exited unexpectedly'))
    );
    this.socket.unref();
  }

  consume(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);

    while (this.buffer.length >= HEADER_BYTES) {
      const size = this.buffer.readUInt32BE(0);
      if (this.buffer.length < HEADER_BYTES + size) return;

      const payload = this.buffer.subarray(HEADER_BYTES, HEADER_BYTES + size);
      this.buffer = this.buffer.subarray(HEADER_BYTES + size);
      this.settle(JSON.parse(payload.toString('utf8')));
    }
  }

  settle(response) {
    const waiter = this.pending.get(response.id);
    if (!waiter) return;

    this.pending.delete(response.id);
    this.unrefWhenIdle();

    if (response.error) {
      waiter.reject(toOdbcError(response.error));
    } else {
      waiter.resolve(response.result);
    }
  }

  failAllPending(error) {
    for (const waiter of this.pending.values()) waiter.reject(error);
    this.pending.clear();
    this.socket = null;
    this.starting = null;
  }

  // An in-flight request keeps the event loop alive, the way a pending
  // AsyncWorker used to.
  refSocket() {
    if (this.pending.size === 1) this.socket.ref();
  }

  unrefWhenIdle() {
    if (this.pending.size === 0 && this.socket) this.socket.unref();
  }
}

function frame(message) {
  const payload = Buffer.from(JSON.stringify(message, replacer), 'utf8');
  const header = Buffer.alloc(HEADER_BYTES);
  header.writeUInt32BE(payload.length, 0);
  return Buffer.concat([header, payload]);
}

function waitForReady(child) {
  return new Promise((resolve, reject) => {
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk.toString('utf8');
      if (output.includes('ready')) resolve();
    });
    child.on('error', reject);
    child.on('exit', (code) =>
      reject(new Error(`[odbc] The ODBC server exited with code ${code}`))
    );
  });
}

function connectSocket(socketPath) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(socketPath);
    socket.once('connect', () => resolve(socket));
    socket.once('error', reject);
  });
}

function toOdbcError(error) {
  const result = new Error(error.message);
  result.odbcErrors = error.odbcErrors ?? [];
  return result;
}

module.exports = { SidecarClient };
