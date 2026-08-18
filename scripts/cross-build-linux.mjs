// Cross-compiles the addon for Linux x86_64 from any host.
//
// The linker needs a Linux libodbc to resolve against; the real driver manager
// is present at runtime, so any build of the same soname will do. It is taken
// from the Debian package rather than kept in the repository.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, copyFileSync } from "node:fs";
import { join } from "node:path";

const TARGET = "x86_64-unknown-linux-gnu";
const LIBODBC_DEB =
  "http://deb.debian.org/debian/pool/main/u/unixodbc/libodbc2_2.3.11-2+deb12u1_amd64.deb";
const WORK = "/tmp/node-odbc-cross";

build();

function build() {
  const libraryDirectory = ensureTargetLibodbc();
  run("cargo", ["zigbuild", "--release", "--target", TARGET], {
    UNIXODBC_LIB_DIR: libraryDirectory,
  });

  const output = join("prebuilds", "linux-x64");
  mkdirSync(output, { recursive: true });
  copyFileSync(join("target", TARGET, "release", "libodbc_napi.so"), join(output, "odbc.node"));
  console.log(`Built ${join(output, "odbc.node")}`);
}

function ensureTargetLibodbc() {
  const directory = join(WORK, "lib");
  const library = join(directory, "libodbc.so");
  if (existsSync(library)) return directory;

  mkdirSync(directory, { recursive: true });
  run("sh", ["-c", `curl -sSL -o ${WORK}/libodbc.deb ${LIBODBC_DEB}`]);
  run("sh", ["-c", `cd ${WORK} && ar x libodbc.deb && tar xf data.tar.*`]);
  copyFileSync(join(WORK, "usr/lib/x86_64-linux-gnu/libodbc.so.2.0.0"), library);
  return directory;
}

function run(command, args, env = {}) {
  execFileSync(command, args, { stdio: "inherit", env: { ...process.env, ...env } });
}
