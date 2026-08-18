#!/usr/bin/env node
// Builds the ODBC sidecar for the current platform into bin/{platform}-{arch}/.
//
// unixODBC lives in different places per platform, and the upstream Go ODBC
// bindings hardcode the Intel Homebrew prefix, so the include and library
// paths are resolved here rather than in the Go source.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { binaryName, platformDirectory } from '../src/native/binary.ts';

function main(): void {
  const output = path.join(repositoryRoot(), 'bin', platformDirectory(), binaryName());
  fs.mkdirSync(path.dirname(output), { recursive: true });

  execFileSync('go', ['build', '-trimpath', '-o', output, './cmd/node-odbc-server'], {
    cwd: path.join(repositoryRoot(), 'go'),
    env: { ...process.env, ...unixOdbcFlags() },
    stdio: 'inherit',
  });

  console.log(`built ${output}`);
}

function repositoryRoot(): string {
  return path.join(import.meta.dirname, '..');
}

function unixOdbcFlags(): Record<string, string> {
  const prefix = unixOdbcPrefix();
  if (prefix === undefined) return {};

  return {
    CGO_CFLAGS: `${process.env['CGO_CFLAGS'] ?? ''} -I${prefix}/include`.trim(),
    CGO_LDFLAGS: `${process.env['CGO_LDFLAGS'] ?? ''} -L${prefix}/lib`.trim(),
  };
}

function unixOdbcPrefix(): string | undefined {
  if (process.env['UNIXODBC_PREFIX'] !== undefined) return process.env['UNIXODBC_PREFIX'];

  const candidates = ['/opt/homebrew', '/usr/local', '/usr'];
  return candidates.find((candidate) => fs.existsSync(path.join(candidate, 'include', 'sql.h')));
}

main();
