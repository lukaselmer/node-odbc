import { execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync, renameSync } from 'node:fs'
import { join } from 'node:path'

const target = join('prebuilds', `${process.platform}-${process.arch}`)

mkdirSync(target, { recursive: true })
execFileSync('npx', ['napi', 'build', '--release', '--output-dir', target], {
  stdio: 'inherit',
  shell: true,
})
renameToLoadableName(target)

/** node-gyp-build loads the first `.node` it finds, but only `napi build` knows what it produced. */
function renameToLoadableName(directory) {
  const built = readdirSync(directory).filter((entry) => entry.endsWith('.node'))
  if (built.length !== 1) throw new Error(`Expected one .node in ${directory}, found ${built.length}`)
  renameSync(join(directory, built[0]), join(directory, 'odbc.node'))
}
