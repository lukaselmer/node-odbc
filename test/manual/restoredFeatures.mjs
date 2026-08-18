import odbc from '../../lib/odbc.js'
import assert from 'node:assert/strict'

const CS = 'DSN=PGRUSTPORT;UID=lukaselmer'
const ok = (m) => console.log('  ✓', m)

const connection = await odbc.connect(CS)

// --- connected ------------------------------------------------------------
assert.equal(connection.connected, true)
ok('connected is true on a live connection')

// It must not wait for an in-flight query: that would stall the event loop.
const slow = connection.query('SELECT pg_sleep(2)')
const started = Date.now()
const during = connection.connected
const elapsed = Date.now() - started
assert.ok(elapsed < 100, `reading .connected took ${elapsed}ms, should be immediate`)
assert.equal(during, true)
ok(`connected returned in ${elapsed}ms while a 2s query was in flight`)
await slow

// --- tables ---------------------------------------------------------------
const tables = await connection.tables(null, 'public', 'rustsmoke', null)
assert.equal(tables.length, 1)
assert.equal(tables[0].TABLE_NAME, 'rustsmoke')
assert.equal(tables[0].TABLE_TYPE, 'TABLE')
assert.ok(tables.columns.length > 0)
ok(`tables: ${tables[0].TABLE_SCHEM}.${tables[0].TABLE_NAME} (${tables.columns.length} columns)`)

const noTables = await connection.tables(null, 'bad schema', 'bad table', null)
assert.equal(noTables.length, 0)
assert.ok(noTables.columns.length > 0)
ok('tables: bad selector returns no rows but keeps the column metadata')

// --- columns --------------------------------------------------------------
const columns = await connection.columns(null, 'public', 'rustsmoke', null)
assert.equal(columns.length, 6)
assert.deepEqual(columns.map((c) => c.COLUMN_NAME), ['id', 'name', 'age', 'bignum', 'ratio', 'payload'])
ok(`columns: ${columns.map((c) => c.COLUMN_NAME).join(', ')}`)

const one = await connection.columns(null, 'public', 'rustsmoke', 'name')
assert.equal(one.length, 1)
assert.equal(one[0].COLUMN_NAME, 'name')
ok('columns: restricted to a single named column')

// --- connected after close ------------------------------------------------
await connection.close()
assert.equal(connection.connected, false)
ok('connected is false once closed')

console.log('\nAll three restored features work.')
