import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['lib/index.ts'],
  outDir: 'dist',
  format: ['esm', 'cjs'],
  dts: true,
  platform: 'node',
  target: 'node24',
  clean: true,
})
