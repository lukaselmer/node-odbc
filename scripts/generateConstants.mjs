// Mirrors the ODBC constant names from the Rust table into TypeScript, so the
// two cannot drift. The values stay in Rust; only the names are generated here.

import { readFileSync, writeFileSync } from "node:fs";

const RUST = "src/constants.rs";
const TARGET = "lib/constants.generated.ts";

const names = [...readFileSync(RUST, "utf8").matchAll(/^\s*\("([A-Z0-9_]+)",/gmu)].map(
  ([, name]) => name,
);
if (names.length === 0) throw new Error(`No constants found in ${RUST}`);

const file = `// Generated from ${RUST} by scripts/generateConstants.mjs. Do not edit.

import { native } from './native.ts'

export interface OdbcConstants {
${names.map((name) => `  readonly ${name}: number`).join("\n")}
}

/** Every ODBC constant the addon exports, by name. */
export const constants: OdbcConstants = native.odbcConstants()

${names.map((name) => `export const ${name}: number = constants.${name}`).join("\n")}
`;

writeFileSync(TARGET, file);
console.log(`${TARGET}: ${names.length} constants`);
