#!/usr/bin/env node
// Builds the ODBC sidecar for the current platform into bin/{platform}-{arch}/.
//
// unixODBC lives in different places per platform, and the upstream Go ODBC
// bindings hardcode the Intel Homebrew prefix, so the include and library
// paths are resolved here rather than in the Go source.

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const { platformDirectory, binaryName } = require('../lib/native/binary');

function main() {
  const output = path.join(__dirname, '..', 'bin', platformDirectory(), binaryName());
  fs.mkdirSync(path.dirname(output), { recursive: true });

  execFileSync('go', ['build', '-trimpath', '-o', output, './cmd/node-odbc-server'], {
    cwd: path.join(__dirname, '..', 'go'),
    env: { ...process.env, ...unixOdbcFlags() },
    stdio: 'inherit',
  });

  console.log(`built ${output}`);
}

function unixOdbcFlags() {
  const prefix = unixOdbcPrefix();
  if (!prefix) return {};

  return {
    CGO_CFLAGS: `${process.env.CGO_CFLAGS ?? ''} -I${prefix}/include`.trim(),
    CGO_LDFLAGS: `${process.env.CGO_LDFLAGS ?? ''} -L${prefix}/lib`.trim(),
  };
}

function unixOdbcPrefix() {
  if (process.env.UNIXODBC_PREFIX) return process.env.UNIXODBC_PREFIX;

  const candidates = ['/opt/homebrew', '/usr/local', '/usr'];
  return candidates.find((candidate) => fs.existsSync(path.join(candidate, 'include', 'sql.h')));
}

main();
