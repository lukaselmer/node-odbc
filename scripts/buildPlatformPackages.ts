#!/usr/bin/env node
// Assembles the publishable packages for the prebuilt sidecars, one per
// platform, from the binaries in bin/.
//
// They are published separately from the client so that a package manager
// installs only the binary it can run, and so that an image that needs just the
// server does not pull the rest.

import fs from 'node:fs';
import path from 'node:path';

export const PLATFORMS = ['linux-x64', 'linux-arm64', 'darwin-x64', 'darwin-arm64'];

function main(): void {
  verifyClientDeclaresThem();

  const staging = path.join(repositoryRoot(), 'platform-packages');
  fs.rmSync(staging, { recursive: true, force: true });

  for (const platform of PLATFORMS) assemble(platform, staging);

  console.log(`assembled ${String(PLATFORMS.length)} packages in ${staging}`);
}

// The client declares the platform packages as optional dependencies, so that
// exactly one of them installs. A version that drifted from theirs would
// publish a client unable to resolve its own sidecar.
function verifyClientDeclaresThem(): void {
  const declared = clientManifest().optionalDependencies ?? {};
  const expected = Object.fromEntries(
    PLATFORMS.map((platform) => [packageName(platform), packageVersion()]),
  );

  if (asComparableJson(declared) !== asComparableJson(expected)) {
    throw new Error(
      `The optional dependencies of @lukaselmer/odbc do not match the platform packages at ` +
        `${packageVersion()}.\n  declared: ${asComparableJson(declared)}\n  expected: ${asComparableJson(expected)}`,
    );
  }
}

function asComparableJson(dependencies: Record<string, string>): string {
  const entries = Object.entries(dependencies).toSorted(([one], [other]) =>
    one.localeCompare(other),
  );
  return JSON.stringify(entries);
}

function assemble(platform: string, staging: string): void {
  const directory = path.join(staging, platform);
  fs.mkdirSync(path.join(directory, 'bin'), { recursive: true });

  fs.writeFileSync(
    path.join(directory, 'package.json'),
    `${JSON.stringify(manifest(platform), null, 2)}\n`,
  );

  const binary = path.join(directory, 'bin', binaryFor(platform));
  fs.copyFileSync(binarySource(platform), binary);
  fs.chmodSync(binary, 0o755);
  fs.copyFileSync(path.join(repositoryRoot(), 'LICENSE'), path.join(directory, 'LICENSE'));
}

function manifest(platform: string): Record<string, unknown> {
  const [operatingSystem, architecture] = platform.split('-');
  return {
    name: packageName(platform),
    version: packageVersion(),
    description: `The prebuilt node-odbc ODBC sidecar for ${platform}`,
    license: 'MIT',
    repository: { type: 'git', url: 'git://github.com/lukaselmer/node-odbc.git' },
    os: [operatingSystem],
    cpu: [architecture],
    files: ['bin/'],
    publishConfig: { access: 'public' },
  };
}

function binarySource(platform: string): string {
  const source = path.join(repositoryRoot(), 'bin', platform, binaryFor(platform));
  if (!fs.existsSync(source)) {
    throw new Error(`Missing the sidecar for ${platform}; expected it at ${source}`);
  }
  return source;
}

// Named for the platform it was built for, not for the one running this.
function binaryFor(platform: string): string {
  return platform.startsWith('win32-') ? 'node-odbc-server.exe' : 'node-odbc-server';
}

export function packageName(platform: string): string {
  return `@lukaselmer/odbc-server-${platform}`;
}

function packageVersion(): string {
  return clientManifest().version;
}

function clientManifest(): { version: string; optionalDependencies?: Record<string, string> } {
  const manifestPath = path.join(repositoryRoot(), 'package.json');
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
    version: string;
    optionalDependencies?: Record<string, string>;
  };
}

function repositoryRoot(): string {
  return path.join(import.meta.dirname, '..');
}

if (process.argv[1] === import.meta.filename) main();
