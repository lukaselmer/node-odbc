#!/usr/bin/env node
// Writes the platform packages into the client's optionalDependencies, pinned
// to the version being released.
//
// This runs at release time rather than living in the committed package.json,
// because a release pins a version that does not exist on the registry until
// that same release publishes it, and a lockfile cannot be generated against
// something that is not there yet.

import fs from 'node:fs';
import path from 'node:path';

import { PLATFORMS, packageName } from './buildPlatformPackages.ts';

function main(): void {
  const manifestPath = path.join(repositoryRoot(), 'package.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
    version: string;
    optionalDependencies?: Record<string, string>;
  };

  manifest.optionalDependencies = Object.fromEntries(
    PLATFORMS.map((platform) => [packageName(platform), manifest.version]),
  );

  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`pinned ${String(PLATFORMS.length)} platform packages at ${manifest.version}`);
}

function repositoryRoot(): string {
  return path.join(import.meta.dirname, '..');
}

main();
