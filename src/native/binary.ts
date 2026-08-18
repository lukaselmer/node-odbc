import { existsSync } from 'node:fs';
import path from 'node:path';

/**
 * The sidecar ships as a prebuilt binary per platform, next to the package. A
 * local build is preferred so that development does not need a packaging step.
 */
export function serverBinaryPath(): string {
  const candidates = [
    process.env['NODE_ODBC_SERVER'],
    path.join(packageRoot(), 'bin', platformDirectory(), binaryName()),
    path.join(packageRoot(), 'go', 'bin', binaryName()),
  ];

  const found = candidates
    .filter((candidate) => candidate !== undefined)
    .find((candidate) => existsSync(candidate));
  if (found === undefined) {
    throw new Error(
      `[odbc] No ODBC server binary found for ${platformDirectory()}. ` +
        'Build it with `npm run build:server`, or point NODE_ODBC_SERVER at one.',
    );
  }
  return found;
}

function packageRoot(): string {
  return path.join(import.meta.dirname, '..', '..');
}

export function platformDirectory(): string {
  return `${process.platform}-${process.arch}`;
}

export function binaryName(): string {
  return process.platform === 'win32' ? 'node-odbc-server.exe' : 'node-odbc-server';
}
