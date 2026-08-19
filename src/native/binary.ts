import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

/**
 * The sidecar ships as a prebuilt binary per platform, in a package of its own
 * that the package manager installs only where it can run. A local build is
 * preferred so that development does not need a packaging step.
 */
export function serverBinaryPath(): string {
  const override = process.env['NODE_ODBC_SERVER'];
  if (override !== undefined) return override;

  const local = path.join(packageRoot(), 'bin', platformDirectory(), binaryName());
  if (existsSync(local)) return local;

  const installed = installedServerPath();
  if (installed !== undefined) return installed;

  throw new Error(
    `[odbc] No ODBC server binary found for ${platformDirectory()}. Install ` +
      `${serverPackageName()}, build it with \`npm run build:server\`, or point ` +
      'NODE_ODBC_SERVER at one.',
  );
}

// The specifier is built at runtime, which also keeps a bundler from trying to
// resolve a package that only exists on one platform.
function installedServerPath(): string | undefined {
  try {
    return createRequire(import.meta.url).resolve(`${serverPackageName()}/bin/${binaryName()}`);
  } catch {
    return undefined;
  }
}

function packageRoot(): string {
  return path.join(import.meta.dirname, '..', '..');
}

export function serverPackageName(): string {
  return `@lukaselmer/odbc-server-${platformDirectory()}`;
}

export function platformDirectory(): string {
  return `${process.platform}-${process.arch}`;
}

export function binaryName(): string {
  return process.platform === 'win32' ? 'node-odbc-server.exe' : 'node-odbc-server';
}
