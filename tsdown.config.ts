import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["lib/index.ts"],
  outDir: "dist",
  format: ["esm", "cjs"],
  dts: true,
  platform: "node",
  target: "node24",
  // node-gyp-build resolves the addon at runtime from the package root.
  external: ["node-gyp-build"],
  clean: true,
});
