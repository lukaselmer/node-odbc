// Connection cost, for when the pool tests look slow.
//
// The pool creates connections one at a time (`MAX_ACTIVELY_CONNECTING = 1`,
// unchanged since long before the Rust port), so filling it costs that many
// round trips in sequence.

import odbc from '../../lib/odbc.js'

const CS = process.env.SMOKE_CONNECTION_STRING ?? 'DSN=PGRUSTPORT;UID=lukaselmer'
const COUNT = 10

await sequential()
await parallel()

async function sequential() {
  const started = Date.now()
  for (let i = 0; i < COUNT; i++) {
    const connection = await odbc.connect(CS)
    await connection.close()
  }
  report('one at a time', started)
}

async function parallel() {
  const started = Date.now()
  const connections = await Promise.all(Array.from({ length: COUNT }, () => odbc.connect(CS)))
  await Promise.all(connections.map((connection) => connection.close()))
  report('all at once', started)
}

function report(label, started) {
  const elapsed = Date.now() - started
  console.log(`${COUNT} connections ${label}: ${elapsed}ms (${Math.round(elapsed / COUNT)}ms each)`)
}
