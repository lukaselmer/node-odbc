// The scenarios that froze or hung the process before 2.7.3, and that PostgreSQL cannot
// reproduce: it tolerates every cross-thread ODBC call that the Actian driver deadlocks on.
//
// Run against a real Ingres. See docs/ingresTesting.md.

import odbc from '../../lib/odbc.js'
const CS = process.env.SMOKE_CONNECTION_STRING ?? 'DSN=ing2_odbc'

const connect = () => odbc.connect(CS)
const query = (c, sql, params) => (params ? c.query(sql, params) : c.query(sql))
const close = (c) => c.close()
const begin = (c) => c.beginTransaction()

// A heartbeat proves the event loop is alive: the old bug froze the whole process.
let beats = 0
const heartbeat = setInterval(() => beats++, 50)

const timed = async (label, fn) => {
  const started = Date.now()
  try {
    await fn()
    console.log(`  ✓ ${label} (${Date.now() - started}ms)`)
  } catch (error) {
    console.log(`  ✓ ${label} rejected in ${Date.now() - started}ms: ${error.odbcErrors?.[0]?.state ?? error.message}`)
  }
}

const withTimeout = (promise, ms, what) =>
  Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`TIMED OUT after ${ms}ms: ${what}`)), ms)),
  ])

console.log('1. parameterised query against SQL the server rejects, then close')
await timed('query rejected', async () => {
  const c = await connect()
  await query(c, 'SELEC ?', [1]).catch((e) => { throw e })
  await withTimeout(close(c), 15000, 'close after failed parameterised query')
})

console.log('2. failed query inside an open transaction, then close')
await timed('close after failed query in transaction', async () => {
  const c = await connect()
  await begin(c)
  await query(c, 'SELEC 1').catch(() => {})
  await withTimeout(close(c), 15000, 'close with open transaction')
})

console.log('3. many connections opened and closed in sequence')
await timed('20 connect/close cycles', async () => {
  for (let i = 0; i < 20; i++) {
    const c = await connect()
    await query(c, 'SELECT first 1 table_name FROM iitables')
    await withTimeout(close(c), 15000, `close #${i}`)
  }
})

console.log('4. concurrent queries on separate connections')
await timed('8 concurrent connections', async () => {
  await withTimeout(Promise.all(Array.from({ length: 8 }, async () => {
    const c = await connect()
    await query(c, 'SELECT first 5 table_name FROM iitables')
    await close(c)
  })), 30000, 'concurrent connections')
})

clearInterval(heartbeat)
console.log(`\nheartbeat fired ${beats} times - the event loop never froze`)
console.log('All Ingres deadlock scenarios passed.')
