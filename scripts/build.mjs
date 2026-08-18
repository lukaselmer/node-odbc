import { execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const target = join('prebuilds', `${process.platform}-${process.arch}`)

// A stale artefact beside the fresh one is a real hazard: the loader takes the
// file at a fixed name, which may not be the one just built.
rmSync(target, { recursive: true, force: true })
mkdirSync(target, { recursive: true })

execFileSync('npx', ['napi', 'build', '--release', '--output-dir', target], {
  stdio: 'inherit',
  shell: true,
})
renameToLoadableName(target)

/** napi names the artefact after the crate and emits typings we do not ship. */
function renameToLoadableName(directory) {
  const built = readdirSync(directory).filter((entry) => entry.endsWith('.node'))
  if (built.length !== 1) {
    throw new Error(`Expected one .node in ${directory}, found ${built.length}: ${built.join(', ')}`)
  }
  renameSync(join(directory, built[0]), join(directory, 'odbc.node'))
  for (const entry of readdirSync(directory)) {
    if (entry !== 'odbc.node') rmSync(join(directory, entry), { recursive: true })
  }
}
