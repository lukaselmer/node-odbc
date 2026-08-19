import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

import { serverBinaryPath } from './binary.ts';
import type { OdbcErrorDetail, RequestTarget, WireError, WireResponse } from './protocol.ts';
import { replacer } from './values.ts';

const HEADER_BYTES = 4;

/** An Error carrying the diagnostic records the ODBC driver reported. */
export interface OdbcError extends Error {
  odbcErrors: OdbcErrorDetail[];
}

interface PendingRequest {
  // The map holds resolvers for differently typed requests, so the value type
  // is erased here and restored by the caller's type argument.
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
}

/**
 * Talks to the ODBC sidecar over a socket.
 *
 * By default the sidecar is a child process, started on first use, that exits
 * once this socket closes, so it can never outlive the Node process. Point
 * NODE_ODBC_SERVER_ADDRESS at a running sidecar to use that one instead, which
 * is how the sidecar runs in a container of its own.
 */
export class SidecarClient {
  private socket: net.Socket | null = null;
  private child: ChildProcess | null = null;
  private starting: Promise<void> | null = null;
  private readonly pending = new Map<number, PendingRequest>();
  private nextId = 1;
  private buffer = Buffer.alloc(0);

  async request<T>(
    target: RequestTarget,
    handle: string | undefined,
    method: string,
    args?: unknown,
  ): Promise<T> {
    await this.start();
    return this.send<T>({ target, handle, method, args });
  }

  private send<T>(message: Omit<Parameters<SidecarClient['frame']>[0], 'id'>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const id = this.nextId++;
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
      this.refSocket();
      this.socket?.write(this.frame({ id, ...message }));
    });
  }

  private start(): Promise<void> {
    if (this.socket) return Promise.resolve();
    this.starting ??= this.open();
    return this.starting;
  }

  private async open(): Promise<void> {
    const address = process.env['NODE_ODBC_SERVER_ADDRESS'];
    this.attach(address === undefined ? await this.spawnSidecar() : await connect(address));
  }

  private async spawnSidecar(): Promise<net.Socket> {
    // Unix socket paths are limited to ~104 bytes, so the name stays short.
    const socketPath = path.join(
      os.tmpdir(),
      `node-odbc-${process.pid}-${randomBytes(4).toString('hex')}.sock`,
    );

    this.child = spawn(serverBinaryPath(), ['--socket', socketPath], {
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    this.child.unref();

    await waitForReady(this.child);
    // The readiness pipe would otherwise keep the event loop alive forever.
    unrefStream(this.child.stdout);

    return connect(socketPath);
  }

  private attach(socket: net.Socket): void {
    this.socket = socket;
    socket.on('data', (chunk: Buffer) => {
      this.consume(chunk);
    });
    socket.on('close', () => {
      this.failAllPending(new Error('[odbc] Lost the connection to the ODBC server'));
    });
    socket.unref();
  }

  private consume(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);

    while (this.buffer.length >= HEADER_BYTES) {
      const size = this.buffer.readUInt32BE(0);
      if (this.buffer.length < HEADER_BYTES + size) return;

      const payload = this.buffer.subarray(HEADER_BYTES, HEADER_BYTES + size);
      this.buffer = this.buffer.subarray(HEADER_BYTES + size);
      this.settle(parseResponse(payload));
    }
  }

  private settle(response: WireResponse): void {
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

  private failAllPending(error: Error): void {
    for (const waiter of this.pending.values()) waiter.reject(error);
    this.pending.clear();
    this.socket = null;
    this.starting = null;
  }

  // An in-flight request keeps the event loop alive, the way a pending
  // AsyncWorker used to.
  private refSocket(): void {
    if (this.pending.size === 1) this.socket?.ref();
  }

  private unrefWhenIdle(): void {
    if (this.pending.size === 0) this.socket?.unref();
  }

  private frame(message: {
    id: number;
    target: RequestTarget;
    handle?: string | undefined;
    method: string;
    args?: unknown;
  }): Buffer {
    const payload = Buffer.from(JSON.stringify(message, replacer), 'utf8');
    const header = Buffer.alloc(HEADER_BYTES);
    header.writeUInt32BE(payload.length, 0);
    return Buffer.concat([header, payload]);
  }
}

function parseResponse(payload: Buffer): WireResponse {
  return JSON.parse(payload.toString('utf8')) as WireResponse;
}

function waitForReady(child: ChildProcess): Promise<void> {
  return new Promise((resolve, reject) => {
    let output = '';
    child.stdout?.on('data', (chunk: Buffer) => {
      output += chunk.toString('utf8');
      if (output.includes('ready')) resolve();
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      reject(new Error(`[odbc] The ODBC server exited with code ${String(code)}`));
    });
  });
}

// The child's stdout is a pipe, which can be unrefed even though the Readable
// interface does not say so.
function unrefStream(stream: unknown): void {
  (stream as { unref?: () => void } | null)?.unref?.();
}

function connect(address: string): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(connectionTarget(address));
    socket.once('connect', () => {
      resolve(socket);
    });
    socket.once('error', reject);
  });
}

// An address is either host:port or the path of a unix socket.
function connectionTarget(address: string): net.NetConnectOpts {
  const separator = address.lastIndexOf(':');
  const port = Number(address.slice(separator + 1));
  if (separator === -1 || !Number.isInteger(port) || port <= 0) return { path: address };
  return { host: address.slice(0, separator) || '127.0.0.1', port };
}

function toOdbcError(error: WireError): OdbcError {
  return Object.assign(new Error(error.message), { odbcErrors: error.odbcErrors ?? [] });
}

// One sidecar serves the whole process; it exits when this client disconnects.
export const client = new SidecarClient();
