const fs = require('fs');
const path = require('path');

// The sidecar is shipped as a prebuilt binary per platform, next to the
// package. A local Go build is preferred so that development does not need a
// packaging step.
function serverBinaryPath() {
  const candidates = [
    process.env.NODE_ODBC_SERVER,
    path.join(__dirname, '..', '..', 'bin', platformDirectory(), binaryName()),
    path.join(__dirname, '..', '..', 'go', 'bin', binaryName()),
  ];

  const found = candidates.filter(Boolean).find((candidate) => fs.existsSync(candidate));
  if (!found) {
    throw new Error(
      `[odbc] No ODBC server binary found for ${platformDirectory()}. ` +
        'Build it with `npm run build:server`, or point NODE_ODBC_SERVER at one.'
    );
  }
  return found;
}

function platformDirectory() {
  return `${process.platform}-${process.arch}`;
}

function binaryName() {
  return process.platform === 'win32' ? 'node-odbc-server.exe' : 'node-odbc-server';
}

module.exports = { serverBinaryPath, platformDirectory, binaryName };
